import express from 'express';
import { asyncHandler } from '../middleware/errorHandler.js';
import { submitRating, getDoctorRatings } from '../services/ratingService.js';
import { AppError } from '../middleware/errorHandler.js';

const router = express.Router();

/**
 * POST /api/ratings
 * Rate a doctor after a completed appointment
 */
router.post('/', asyncHandler(async (req, res) => {
  const { appointmentId, patientId, rating, comment } = req.body;

  // If authenticated user is attached via auth middleware, fallback to req.user._id
  const effectivePatientId = patientId || req.user?._id || req.user?.id;

  if (!appointmentId) {
    throw new AppError('appointmentId is required', 400);
  }
  if (!effectivePatientId) {
    throw new AppError('patientId is required', 400);
  }

  const result = await submitRating({
    appointmentId,
    patientId: effectivePatientId,
    rating,
    comment,
  });

  res.status(result.isNew ? 201 : 200).json({
    success: true,
    message: result.isNew ? 'Rating submitted successfully' : 'Rating updated successfully',
    data: result.review,
    doctorStats: result.doctorStats,
  });
}));

/**
 * GET /api/ratings/doctor/:doctorId
 * Fetch ratings and reviews for a doctor
 */
router.get('/doctor/:doctorId', asyncHandler(async (req, res) => {
  const { doctorId } = req.params;
  const page = parseInt(req.query.page, 10) || 1;
  const limit = parseInt(req.query.limit, 10) || 20;

  const data = await getDoctorRatings(doctorId, page, limit);

  res.json({
    success: true,
    data,
  });
}));

export default router;
