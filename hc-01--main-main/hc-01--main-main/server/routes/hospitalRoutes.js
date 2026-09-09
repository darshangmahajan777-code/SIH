import express from 'express';
import { asyncHandler, AppError } from '../middleware/errorHandler.js';
import { requireHospitalAccess, verifyAdminKey } from '../middleware/requireHospitalAccess.js';
import {
  createHospital,
  getHospitalById,
  listHospitals,
  updateHospital,
  verifyHospital,
  associateDoctorWithHospital,
  verifyDoctorInHospital,
  getHospitalDoctors,
  getHospitalAppointments,
  getHospitalStats,
} from '../services/hospitalService.js';

const router = express.Router();

/**
 * GET /api/hospitals
 * Public & Admin directory of verified hospitals with search and filters
 */
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const { query, department, status, city, limit, skip } = req.query;
    const result = await listHospitals({ query, department, status, city, limit, skip });
    res.json({ success: true, data: result.hospitals, count: result.count });
  })
);

/**
 * POST /api/hospitals
 * Register a new hospital
 */
router.post(
  '/',
  asyncHandler(async (req, res) => {
    const hospital = await createHospital(req.body);
    res.status(201).json({
      success: true,
      message: 'Hospital registered successfully',
      data: hospital,
    });
  })
);

/**
 * GET /api/hospitals/:id
 * Hospital details by ID
 */
router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const hospital = await getHospitalById(req.params.id);
    res.json({ success: true, data: hospital });
  })
);

/**
 * PATCH /api/hospitals/:id
 * Update hospital information
 */
router.patch(
  '/:id',
  requireHospitalAccess({ hospitalIdParam: 'id' }),
  asyncHandler(async (req, res) => {
    const updated = await updateHospital(req.params.id, req.body);
    res.json({
      success: true,
      message: 'Hospital updated successfully',
      data: updated,
    });
  })
);

/**
 * PATCH /api/hospitals/:id/verify
 * Platform Admin verifies or rejects a hospital
 */
router.patch(
  '/:id/verify',
  asyncHandler(async (req, res) => {
    // Only platform admin can verify/reject a hospital
    const isPlatformAdmin =
      req.user?.role === 'admin' ||
      verifyAdminKey(req.headers['x-admin-key']);

    if (!isPlatformAdmin) {
      throw new AppError('Forbidden: Only platform administrators can verify hospitals', 403);
    }

    const { status = 'verified' } = req.body;
    const hospital = await verifyHospital({ hospitalId: req.params.id, status });
    res.json({
      success: true,
      message: `Hospital status updated to ${status}`,
      data: hospital,
    });
  })
);

/**
 * GET /api/hospitals/:id/doctors
 * List all doctors belonging to this hospital
 */
router.get(
  '/:id/doctors',
  asyncHandler(async (req, res) => {
    const doctors = await getHospitalDoctors(req.params.id);
    res.json({ success: true, count: doctors.length, data: doctors });
  })
);

/**
 * POST /api/hospitals/:id/doctors
 * Affiliate/associate a doctor with this hospital
 */
router.post(
  '/:id/doctors',
  requireHospitalAccess({ hospitalIdParam: 'id' }),
  asyncHandler(async (req, res) => {
    const { doctorId } = req.body;
    if (!doctorId) throw new AppError('doctorId is required', 400);

    const doctor = await associateDoctorWithHospital({
      doctorId,
      hospitalId: req.params.id,
    });

    res.json({
      success: true,
      message: 'Doctor affiliated with hospital successfully',
      data: doctor,
    });
  })
);

/**
 * PATCH /api/hospitals/:id/doctors/:doctorId/verify
 * Verify doctor credentials within this hospital
 */
router.patch(
  '/:id/doctors/:doctorId/verify',
  requireHospitalAccess({ hospitalIdParam: 'id' }),
  asyncHandler(async (req, res) => {
    const { status = 'verified' } = req.body;
    const doctor = await verifyDoctorInHospital({
      doctorId: req.params.doctorId,
      hospitalId: req.params.id,
      status,
    });

    res.json({
      success: true,
      message: `Doctor verification status updated to ${status}`,
      data: doctor,
    });
  })
);

/**
 * GET /api/hospitals/:id/appointments
 * Hospital-scoped appointment queue (Strictly isolated by hospital)
 */
router.get(
  '/:id/appointments',
  requireHospitalAccess({ hospitalIdParam: 'id' }),
  asyncHandler(async (req, res) => {
    const { date, status, limit } = req.query;
    const appointments = await getHospitalAppointments({
      hospitalId: req.params.id,
      date,
      status,
      limit,
    });

    res.json({
      success: true,
      count: appointments.length,
      data: appointments,
    });
  })
);

/**
 * GET /api/hospitals/:id/stats
 * Hospital-scoped operational statistics (Strictly isolated by hospital)
 */
router.get(
  '/:id/stats',
  requireHospitalAccess({ hospitalIdParam: 'id' }),
  asyncHandler(async (req, res) => {
    const stats = await getHospitalStats(req.params.id);
    res.json({ success: true, data: stats });
  })
);

export default router;
