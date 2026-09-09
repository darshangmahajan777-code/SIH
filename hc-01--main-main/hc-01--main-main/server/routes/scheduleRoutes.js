import express from 'express';
import { asyncHandler } from '../middleware/errorHandler.js';
import { getDailyListing, getDoctorAvailability } from '../services/scheduleService.js';
import DoctorProfile from '../models/DoctorProfile.js';
import { AppError } from '../middleware/errorHandler.js';

const router = express.Router();

/**
 * GET /api/doctors/daily-listing?date=YYYY-MM-DD&specialty=...&maxFee=...
 * Patient selects a date, views available doctors, open slots, fees, ratings
 */
router.get('/daily-listing', asyncHandler(async (req, res) => {
  const dateStr = req.query.date || new Date().toISOString().slice(0, 10);
  const { specialty, maxFee } = req.query;

  const listing = await getDailyListing({ dateStr, specialty, maxFee });

  res.json({
    success: true,
    date: dateStr,
    count: listing.length,
    data: listing,
  });
}));

/**
 * GET /api/doctors/:id/availability?date=YYYY-MM-DD
 * Real-time slot status for a specific doctor on a chosen date
 */
router.get('/:id/availability', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const dateStr = req.query.date || new Date().toISOString().slice(0, 10);

  const availability = await getDoctorAvailability(id, dateStr);

  res.json({
    success: true,
    data: availability,
  });
}));

/**
 * PUT /api/doctors/:id/schedule
 * Manage doctor working hours, slot duration, breaks, leaves, holidays, video availability
 */
router.put('/:id/schedule', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { slotDuration, weeklySchedule, leaves, holidays, videoEnabled } = req.body;

  const updateFields = {};
  if (slotDuration !== undefined) updateFields.slotDuration = Number(slotDuration);
  if (weeklySchedule !== undefined) updateFields.weeklySchedule = weeklySchedule;
  if (leaves !== undefined) updateFields.leaves = leaves;
  if (holidays !== undefined) updateFields.holidays = holidays;
  if (videoEnabled !== undefined) updateFields.videoEnabled = Boolean(videoEnabled);

  const doctor = await DoctorProfile.findByIdAndUpdate(
    id,
    { $set: updateFields },
    { new: true, runValidators: true }
  );

  if (!doctor) {
    throw new AppError('Doctor not found', 404);
  }

  res.json({
    success: true,
    message: 'Schedule updated successfully',
    data: doctor,
  });
}));

/**
 * GET /api/doctors/:id
 * Retrieve doctor profile
 */
router.get('/:id', asyncHandler(async (req, res) => {
  const doctor = await DoctorProfile.findById(req.params.id).lean();
  if (!doctor) {
    throw new AppError('Doctor not found', 404);
  }
  res.json({
    success: true,
    data: doctor,
  });
}));

/**
 * GET /api/doctors
 * Search & filter doctors
 */
router.get('/', asyncHandler(async (req, res) => {
  const { specialty, feeMax, hospitalId, search } = req.query;
  const query = { isActive: true };
  if (specialty) query.specialty = new RegExp(`^${specialty}$`, 'i');
  if (feeMax) query.consultationFee = { $lte: Number(feeMax) };
  if (hospitalId) query.hospitalId = hospitalId;
  if (search && search.trim()) {
    const s = search.trim();
    query.$or = [
      { doctorName: new RegExp(s, 'i') },
      { specialty: new RegExp(s, 'i') },
      { hospitalName: new RegExp(s, 'i') },
    ];
  }

  const doctorFields =
    'doctorName specialty qualifications experienceYears hospitalName hospitalId consultationFee followUpFee avgRating ratingCount location videoEnabled isAvailableToday isActive slotDuration';

  const doctors = await DoctorProfile.find(query).select(doctorFields).lean();
  res.json({
    success: true,
    count: doctors.length,
    data: doctors,
  });
}));

export default router;
