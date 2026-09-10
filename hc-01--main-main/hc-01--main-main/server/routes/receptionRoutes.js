import express from 'express';
import { asyncHandler } from '../middleware/errorHandler.js';
import {
  getReceptionDoctorsAvailability,
  getReceptionAppointments,
  checkInPatientAtReception,
} from '../services/receptionService.js';

const router = express.Router();

/**
 * GET /api/reception/doctors-availability
 * Return real-time doctor availability status for front-desk reception
 * Query params: hospitalId
 */
router.get(
  '/doctors-availability',
  asyncHandler(async (req, res) => {
    const { hospitalId } = req.query;
    const doctors = await getReceptionDoctorsAvailability({ hospitalId });
    res.json({
      success: true,
      data: doctors,
    });
  })
);

/**
 * GET /api/reception/appointments
 * Return front-desk operational appointments with strict clinical data shielding
 * (No clinical notes, chief complaints, medical history, or diagnoses exposed)
 * Query params: hospitalId, date
 */
router.get(
  '/appointments',
  asyncHandler(async (req, res) => {
    const { hospitalId, date } = req.query;
    const appointments = await getReceptionAppointments({ hospitalId, date });
    res.json({
      success: true,
      data: appointments,
    });
  })
);

/**
 * PATCH /api/reception/check-in/:appointmentId
 * Front-desk check-in for arriving patient
 */
router.patch(
  '/check-in/:appointmentId',
  asyncHandler(async (req, res) => {
    const { appointmentId } = req.params;
    const { hospitalId } = req.body || {};
    const updated = await checkInPatientAtReception({
      appointmentId,
      hospitalId,
    });
    res.json({
      success: true,
      message: 'Patient marked as checked in at reception',
      data: updated,
    });
  })
);

export default router;
