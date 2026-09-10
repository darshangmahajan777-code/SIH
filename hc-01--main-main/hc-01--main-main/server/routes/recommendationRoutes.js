import express from 'express';
import mongoose from 'mongoose';
import { asyncHandler } from '../middleware/errorHandler.js';
import DoctorProfile from '../models/DoctorProfile.js';
import { getDoctorRecommendations } from '../services/recommendationService.js';

const router = express.Router();

/**
 * GET or POST /api/recommendations
 * Ranked doctor recommendations with explainability and AI-fallback resilience
 */
const handleRecommendations = async (req, res) => {
  const criteria = {
    specialty: req.query.specialty || req.body.specialty || null,
    patientLat: req.query.lat ? Number(req.query.lat) : req.body.lat ? Number(req.body.lat) : null,
    patientLng: req.query.lng ? Number(req.query.lng) : req.body.lng ? Number(req.body.lng) : null,
    maxFee: req.query.maxFee ? Number(req.query.maxFee) : req.body.maxFee ? Number(req.body.maxFee) : null,
    preference: req.query.preference || req.body.preference || 'balanced',
  };

  // Build DB query
  const query = { isActive: true };
  if (criteria.specialty) {
    query.specialty = new RegExp(`^${criteria.specialty}$`, 'i');
  }

  const doctorFields =
    'doctorName specialty qualifications experienceYears hospitalName hospitalId consultationFee followUpFee avgRating ratingCount location videoEnabled isAvailableToday isActive';

  let doctors = [];
  if (mongoose.connection.readyState === 1) {
    doctors = await DoctorProfile.find(query).select(doctorFields).lean();
    if (doctors.length === 0 && criteria.specialty) {
      doctors = await DoctorProfile.find({ isActive: true }).select(doctorFields).lean();
    }
  } else {
    try {
      const { getInMemoryDoctorProfiles } = await import('../services/authService.js');
      const allDocs = getInMemoryDoctorProfiles ? getInMemoryDoctorProfiles() : [];
      doctors = allDocs.filter((d) => d.isActive !== false);
      if (criteria.specialty) {
        const matched = doctors.filter((d) => d.specialty?.toLowerCase() === criteria.specialty.toLowerCase());
        if (matched.length > 0) doctors = matched;
      }
    } catch (err) {
      doctors = [];
    }
  }

  const result = await getDoctorRecommendations({ doctors, criteria });

  res.json({
    success: true,
    source: result.source,
    count: result.recommendations.length,
    criteria,
    data: result.recommendations,
  });
};

router.get('/', asyncHandler(handleRecommendations));
router.post('/', asyncHandler(handleRecommendations));

export default router;
