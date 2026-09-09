import express from 'express';
import { asyncHandler } from '../middleware/errorHandler.js';
import {
  bookAppointmentSlot,
  cancelAppointment,
  rescheduleAppointment,
  checkInAppointment,
  updateAppointmentStatus,
} from '../services/scheduleService.js';
import Appointment from '../models/Appointment.js';
import { AppError } from '../middleware/errorHandler.js';

const router = express.Router();

/**
 * POST /api/appointments
 * Book a doctor slot with server/database-enforced concurrency protection
 * and same-day authoritative Token creation.
 */
router.post('/', asyncHandler(async (req, res) => {
  const {
    doctorId,
    patientId,
    date,
    slotTime,
    mode = 'in-person',
    priority = 'routine',
    chiefComplaint = '',
    hospitalId,
  } = req.body;

  const effectivePatientId = patientId || req.user?._id || req.user?.id;

  const appointment = await bookAppointmentSlot({
    doctorId,
    patientId: effectivePatientId,
    hospitalId,
    date,
    slotTime,
    mode,
    priority,
    chiefComplaint,
  });

  res.status(201).json({
    success: true,
    message: 'Appointment booked successfully',
    data: appointment,
  });
}));

/**
 * PATCH /api/appointments/:id/check-in
 * Check in patient for today's appointment; generates authoritative Token if not yet created
 */
router.patch('/:id/check-in', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const appointment = await checkInAppointment(id);

  res.json({
    success: true,
    message: 'Patient checked in successfully',
    data: appointment,
  });
}));

/**
 * PATCH /api/appointments/:id/cancel
 * Cancel appointment — immediately frees the slot and cancels linked Token
 */
router.patch('/:id/cancel', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { reason } = req.body || {};
  const userId =
    req.user?._id?.toString() ||
    req.headers['x-user-id'] ||
    req.headers['x-patient-id'] ||
    req.headers['x-doctor-id'] ||
    req.body?.userId;

  if (!userId) {
    throw new AppError('Authentication required: valid identity must be provided to cancel an appointment', 401);
  }

  const cancelled = await cancelAppointment({
    appointmentId: id,
    userId,
    reason,
  });

  res.json({
    success: true,
    message: 'Appointment cancelled successfully. Slot is now free.',
    data: cancelled,
  });
}));

/**
 * PATCH /api/appointments/:id/reschedule
 * Reschedule appointment — atomically frees old slot and books new slot
 */
router.patch('/:id/reschedule', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { newDate, newSlotTime } = req.body || {};
  const userId =
    req.user?._id?.toString() ||
    req.headers['x-user-id'] ||
    req.headers['x-patient-id'] ||
    req.body?.userId;

  if (!userId) {
    throw new AppError('Authentication required: valid identity must be provided to reschedule an appointment', 401);
  }

  if (!newDate || !newSlotTime) {
    throw new AppError('newDate and newSlotTime are required', 400);
  }

  const result = await rescheduleAppointment({
    appointmentId: id,
    newDate,
    newSlotTime,
    userId,
  });

  res.json({
    success: true,
    message: 'Appointment rescheduled successfully',
    data: result,
  });
}));

/**
 * PATCH /api/appointments/:id/status
 * Doctor advances status: booked -> checked-in -> in-progress -> completed / no-show
 */
router.patch('/:id/status', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  const appointment = await updateAppointmentStatus(id, status);

  res.json({
    success: true,
    message: `Appointment status updated to ${status}`,
    data: appointment,
  });
}));

/**
 * GET /api/appointments/mine
 * List appointments for user (patient or doctor) supporting tabs: upcoming | today | past
 */
router.get('/mine', asyncHandler(async (req, res) => {
  const patientId = req.query.patientId || req.user?._id;
  const doctorId = req.query.doctorId;
  const date = req.query.date;
  const tab = req.query.tab; // 'today' | 'upcoming' | 'past'

  const todayStr = new Date().toISOString().slice(0, 10);
  const filter = {};

  if (patientId) filter.patientId = patientId;
  if (doctorId) filter.doctorId = doctorId;

  if (date) {
    filter.date = date;
  } else if (tab === 'today') {
    filter.date = todayStr;
    filter.status = { $ne: 'cancelled' };
  } else if (tab === 'upcoming') {
    filter.date = { $gte: todayStr };
    filter.status = { $in: ['booked', 'checked-in'] };
  } else if (tab === 'past') {
    filter.$or = [
      { date: { $lt: todayStr } },
      { status: { $in: ['completed', 'cancelled', 'no-show'] } },
    ];
  }

  const appointments = await Appointment.find(filter)
    .populate('doctorId', 'doctorName specialty hospitalName location consultationFee avgRating ratingCount')
    .populate('patientId', 'name email phone')
    .populate('tokenId', 'tokenNumber status estimatedWaitTime priority calledAt completedAt')
    .sort({ date: tab === 'past' ? -1 : 1, slotTime: 1 })
    .lean();

  res.json({
    success: true,
    count: appointments.length,
    tab: tab || 'all',
    data: appointments,
  });
}));

/**
 * GET /api/appointments/:id/queue-position
 * Smart virtual queue position, time window, and arrival time estimation
 */
router.get('/:id/queue-position', asyncHandler(async (req, res) => {
  const { getAppointmentQueuePosition } = await import('../services/virtualQueueService.js');
  const data = await getAppointmentQueuePosition(req.params.id);

  res.json({
    success: true,
    position: data.position,
    patientsAhead: data.patientsAhead,
    estimatedTime: data.estimatedTime,
    estimatedWindow: data.estimatedWindow,
    recommendedArrivalTime: data.recommendedArrivalTime,
    priority: data.priority,
    reason: data.reason,
    lastUpdated: data.lastUpdated,
    data,
  });
}));

/**
 * GET /api/appointments/:id
 */
router.get('/:id', asyncHandler(async (req, res) => {
  const appointment = await Appointment.findById(req.params.id)
    .populate('doctorId')
    .populate('patientId', 'name email phone')
    .populate('tokenId')
    .lean();

  if (!appointment) {
    throw new AppError('Appointment not found', 404);
  }

  res.json({
    success: true,
    data: appointment,
  });
}));

export default router;
