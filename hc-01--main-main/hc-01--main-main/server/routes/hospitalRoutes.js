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
  getHospitalStaff,
  createHospitalStaff,
  getHospitalPublicQueue,
  addHospitalReview,
} from '../services/hospitalService.js';

const router = express.Router();

/**
 * GET /api/hospitals
 * Public & Admin directory of verified hospitals and clinics with multi-organization filters
 */
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const { query, department, status, city, type, service, availabilityStatus, sortBy, limit, skip } = req.query;
    const result = await listHospitals({
      query,
      department,
      status,
      city,
      type,
      service,
      availabilityStatus,
      sortBy,
      limit,
      skip,
    });
    res.json({ success: true, data: result.hospitals, count: result.count });
  })
);

/**
 * POST /api/hospitals
 * Register a new hospital or small clinic
 */
router.post(
  '/',
  asyncHandler(async (req, res) => {
    const hospital = await createHospital(req.body);
    res.status(201).json({
      success: true,
      message: `${hospital.type === 'clinic' ? 'Clinic' : 'Hospital'} registered successfully`,
      data: hospital,
    });
  })
);

/**
 * GET /api/hospitals/:id
 * Hospital / Clinic details by ID
 */
router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const hospital = await getHospitalById(req.params.id);
    res.json({ success: true, data: hospital });
  })
);

/**
 * GET /api/hospitals/:id/queue-summary
 * Public real-time waiting queue status without revealing private patient clinical data
 */
router.get(
  '/:id/queue-summary',
  asyncHandler(async (req, res) => {
    const summary = await getHospitalPublicQueue(req.params.id);
    res.json({ success: true, data: summary });
  })
);

/**
 * POST /api/hospitals/:id/reviews
 * Submit patient rating & review for hospital/clinic
 */
router.post(
  '/:id/reviews',
  asyncHandler(async (req, res) => {
    const { rating, comment, patientName } = req.body;
    const hospital = await addHospitalReview({
      hospitalId: req.params.id,
      patientName: patientName || req.user?.name || 'Verified Patient',
      rating,
      comment,
    });
    res.status(201).json({
      success: true,
      message: 'Review recorded successfully',
      data: hospital,
    });
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

/**
 * GET /api/hospitals/:id/staff
 * List all reception staff assigned to this hospital/clinic
 */
router.get(
  '/:id/staff',
  asyncHandler(async (req, res) => {
    const staff = await getHospitalStaff(req.params.id);
    res.json({ success: true, count: staff.length, data: staff });
  })
);

/**
 * POST /api/hospitals/:id/staff
 * Onboard / add a reception staff member to this hospital/clinic
 */
router.post(
  '/:id/staff',
  asyncHandler(async (req, res) => {
    const staff = await createHospitalStaff(req.params.id, req.body);
    res.status(201).json({
      success: true,
      message: 'Staff member added successfully',
      data: staff,
    });
  })
);

export default router;
