import express from 'express';
import mongoose from 'mongoose';
import { asyncHandler } from '../middleware/errorHandler.js';
import { validateDoctorSession } from '../middleware/validate.js';
import { authenticateUser, requireRole } from '../middleware/auth.js';
import { callNextToken, completeToken } from '../services/queueService.js';
import { updateAiData } from '../services/aiService.js';
import DoctorSession from '../models/DoctorSession.js';

const router = express.Router();

// POST /api/doctor/call-next — Call next patient (priority-aware)
router.post('/call-next', asyncHandler(async (req, res) => {
  const token = await callNextToken();
  res.json({ success: true, data: token });
}));

// POST /api/doctor/complete/:tokenNumber — Complete consultation
router.post('/complete/:tokenNumber', asyncHandler(async (req, res) => {
  const { tokenNumber } = req.params;
  const token = await completeToken(tokenNumber);

  // Update AI with timing data (fire-and-forget)
  updateAiData(token).catch(() => {});

  // Update doctor session stats if active session exists
  const activeSession = await DoctorSession.findOne({ isActive: true });
  if (activeSession) {
    activeSession.tokensHandled += 1;
    if (token.consultationDuration) {
      const totalTime = activeSession.avgConsultTime * (activeSession.tokensHandled - 1) + token.consultationDuration;
      activeSession.avgConsultTime = Math.round(totalTime / activeSession.tokensHandled);
    }
    await activeSession.save();
  }

  res.json({ success: true, data: token });
}));

let inMemoryActiveSession = null;

// POST /api/doctor/session/start — Start a doctor session
router.post('/session/start', validateDoctorSession, asyncHandler(async (req, res) => {
  const { doctorName, department } = req.body;
  const isConnected = mongoose.connection.readyState === 1;

  if (isConnected) {
    // End any existing active sessions
    await DoctorSession.updateMany({ isActive: true }, { isActive: false, endTime: new Date() }).catch(() => null);

    const session = await DoctorSession.create({
      doctorName,
      department: department || 'OPD',
    });
    inMemoryActiveSession = session;
    return res.status(201).json({ success: true, data: session });
  }

  inMemoryActiveSession = {
    _id: 'session_demo_01',
    doctorName,
    department: department || 'OPD',
    isActive: true,
    startTime: new Date(),
    tokensHandled: 0,
    avgConsultTime: 10,
  };
  res.status(201).json({ success: true, data: inMemoryActiveSession });
}));

// POST /api/doctor/session/end — End current doctor session
router.post('/session/end', asyncHandler(async (req, res) => {
  const isConnected = mongoose.connection.readyState === 1;

  if (isConnected) {
    const session = await DoctorSession.findOneAndUpdate(
      { isActive: true },
      { isActive: false, endTime: new Date() },
      { new: true }
    ).catch(() => null);

    if (!session) {
      return res.status(404).json({ success: false, error: 'No active session found' });
    }
    inMemoryActiveSession = null;
    return res.json({ success: true, data: session });
  }

  if (!inMemoryActiveSession) {
    return res.status(404).json({ success: false, error: 'No active session found' });
  }
  const endedSession = { ...inMemoryActiveSession, isActive: false, endTime: new Date() };
  inMemoryActiveSession = null;
  res.json({ success: true, data: endedSession });
}));

// GET /api/doctor/session — Get current active session
router.get('/session', asyncHandler(async (req, res) => {
  const isConnected = mongoose.connection.readyState === 1;
  if (isConnected) {
    const session = await DoctorSession.findOne({ isActive: true }).lean().catch(() => null);
    return res.json({ success: true, data: session || inMemoryActiveSession || null });
  }
  res.json({ success: true, data: inMemoryActiveSession || null });
}));

// ============================================================================
// DOCTOR CLINICAL WORKSPACE & BUSINESS DASHBOARD ENDPOINTS
// ============================================================================

// GET /api/doctor/dashboard — Aggregated Doctor / Business Dashboard
router.get(
  '/dashboard',
  authenticateUser,
  requireRole('doctor', 'admin', 'clinic_manager'),
  asyncHandler(async (req, res) => {
    const { getDoctorBusinessDashboard } = await import('../services/doctorBusinessService.js');
    const doctorId = req.query.doctorId || req.headers['x-doctor-id'] || req.user?._id;
    const date = req.query.date;

    const dashboard = await getDoctorBusinessDashboard({ doctorId, date });
    res.json({ success: true, data: dashboard });
  })
);

// PATCH /api/doctor/availability — Change doctor availability status
router.patch(
  '/availability',
  authenticateUser,
  requireRole('doctor', 'admin', 'clinic_manager'),
  asyncHandler(async (req, res) => {
    const { updateDoctorAvailability } = await import('../services/doctorBusinessService.js');
    const doctorId = req.body?.doctorId || req.headers['x-doctor-id'] || req.user?._id;
    const { availabilityStatus } = req.body || {};

    const updated = await updateDoctorAvailability({ doctorId, availabilityStatus });

    try {
      const { emitDoctorAvailabilityUpdate } = await import('../socketHandler.js');
      emitDoctorAvailabilityUpdate({
        doctorId: updated.doctorId,
        doctorName: updated.doctorName,
        specialty: updated.specialty || req.user?.specialty || '',
        availabilityStatus: updated.availabilityStatus,
        isAvailableToday: updated.isAvailableToday,
        hospitalId: updated.hospitalId || req.user?.hospitalId || null,
      });
    } catch (sockErr) {
      console.warn('Socket availability emit skipped:', sockErr.message);
    }

    res.json({ success: true, message: `Doctor availability set to ${availabilityStatus}`, data: updated });
  })
);

// GET /api/doctor/patient/:patientId/clinical-history — Authorized patient clinical history & previous visits
router.get(
  '/patient/:patientId/clinical-history',
  authenticateUser,
  requireRole('doctor', 'admin', 'clinic_manager'),
  asyncHandler(async (req, res) => {
    const { getDoctorPatientClinicalHistory } = await import('../services/doctorBusinessService.js');
    const { patientId } = req.params;
    const doctorId = req.query.doctorId || req.headers['x-doctor-id'] || req.user?._id;
    const appointmentId = req.query.appointmentId;

    const history = await getDoctorPatientClinicalHistory({ doctorId, patientId, appointmentId });
    res.json({ success: true, data: history });
  })
);

// PATCH /api/doctor/business-settings — Update practice / business settings
router.patch(
  '/business-settings',
  authenticateUser,
  requireRole('doctor', 'admin', 'clinic_manager'),
  asyncHandler(async (req, res) => {
    const { updateDoctorBusinessSettings } = await import('../services/doctorBusinessService.js');
    const doctorId = req.body?.doctorId || req.headers['x-doctor-id'] || req.user?._id;
    const settings = req.body || {};

    const updated = await updateDoctorBusinessSettings({ doctorId, settings });
    res.json({ success: true, message: 'Practice settings updated', data: updated });
  })
);

// POST /api/doctor/staff — Add staff member to practice
router.post(
  '/staff',
  authenticateUser,
  requireRole('doctor', 'admin', 'clinic_manager'),
  asyncHandler(async (req, res) => {
    const { addStaffMemberToPractice } = await import('../services/doctorBusinessService.js');
    const doctorId = req.body?.doctorId || req.headers['x-doctor-id'] || req.user?._id;
    const staffData = req.body || {};

    const staff = await addStaffMemberToPractice({ doctorId, staffData });
    res.status(201).json({ success: true, message: 'Staff member added', data: staff });
  })
);

// GET /api/doctor/subscription — Subscription details
router.get(
  '/subscription',
  authenticateUser,
  requireRole('doctor', 'admin', 'clinic_manager'),
  asyncHandler(async (req, res) => {
    const { getDoctorBusinessDashboard } = await import('../services/doctorBusinessService.js');
    const doctorId = req.query.doctorId || req.headers['x-doctor-id'] || req.user?._id;

    const dashboard = await getDoctorBusinessDashboard({ doctorId });
    res.json({ success: true, data: dashboard.subscriptionStatus });
  })
);

// GET /api/doctor/workspace-summary — Aggregated overview for Doctor Home
router.get(
  '/workspace-summary',
  authenticateUser,
  requireRole('doctor', 'admin', 'clinic_manager'),
  asyncHandler(async (req, res) => {
    const { getDoctorWorkspaceSummary } = await import('../services/doctorWorkspaceService.js');
    const doctorId = req.query.doctorId || req.headers['x-doctor-id'] || req.user?._id;
    const date = req.query.date;

    const summary = await getDoctorWorkspaceSummary({ doctorId, date });
    res.json({ success: true, data: summary });
  })
);

// GET /api/doctor/encounter/:appointmentId — Consent-gated patient clinical encounter dossier
router.get(
  '/encounter/:appointmentId',
  authenticateUser,
  requireRole('doctor', 'admin', 'clinic_manager'),
  asyncHandler(async (req, res) => {
    const { getPatientEncounter } = await import('../services/doctorWorkspaceService.js');
    const { appointmentId } = req.params;
    const doctorId = req.query.doctorId || req.headers['x-doctor-id'] || req.user?._id;

    const encounter = await getPatientEncounter({ appointmentId, doctorId });
    res.json({ success: true, data: encounter });
  })
);

// PATCH /api/doctor/encounter/:appointmentId/current-visit — Update current visit clinical observations/vitals/notes
router.patch(
  '/encounter/:appointmentId/current-visit',
  authenticateUser,
  requireRole('doctor', 'admin', 'clinic_manager'),
  asyncHandler(async (req, res) => {
    const { updateEncounterCurrentVisit } = await import('../services/doctorWorkspaceService.js');
    const { appointmentId } = req.params;
    const doctorId = req.body?.doctorId || req.headers['x-doctor-id'] || req.user?._id;
    const { symptoms, duration, vitals, currentObservations, clinicalNotes, diagnosis, treatment } = req.body || {};

    const updated = await updateEncounterCurrentVisit({
      appointmentId,
      doctorId,
      symptoms,
      duration,
      vitals,
      currentObservations,
      clinicalNotes,
      diagnosis,
      treatment,
    });
    res.json({ success: true, message: 'Current visit record updated', data: updated });
  })
);

// POST /api/doctor/encounter/:appointmentId/request-consent — Request patient consent for encounter
router.post(
  '/encounter/:appointmentId/request-consent',
  authenticateUser,
  requireRole('doctor', 'admin', 'clinic_manager'),
  asyncHandler(async (req, res) => {
    const { appointmentId } = req.params;
    const doctorId = req.body?.doctorId || req.headers['x-doctor-id'] || req.user?._id;
    try {
      const { createNotification } = await import('../services/notificationService.js');
      await createNotification({
        recipient: req.body?.patientId || '65f000000000000000000001',
        recipientModel: 'User',
        type: 'consent_request',
        title: 'Consent Access Requested',
        message: 'Your attending physician has requested access to your longitudinal medical records for your consultation.',
        metadata: { appointmentId, doctorId },
      }).catch(() => null);
    } catch {
      // Non-blocking notification
    }
    res.json({ success: true, message: 'Consent request dispatched to patient.' });
  })
);

// POST /api/doctor/encounter/:appointmentId/start — Start consultation
router.post(
  '/encounter/:appointmentId/start',
  authenticateUser,
  requireRole('doctor', 'admin', 'clinic_manager'),
  asyncHandler(async (req, res) => {
    const { startConsultation } = await import('../services/doctorWorkspaceService.js');
    const { appointmentId } = req.params;
    const doctorId = req.body?.doctorId || req.headers['x-doctor-id'] || req.user?._id;

    const result = await startConsultation({ appointmentId, doctorId });
    res.json({ success: true, message: 'Consultation started', data: result });
  })
);

// POST /api/doctor/encounter/:appointmentId/complete — Complete consultation & auto-generate history
router.post(
  '/encounter/:appointmentId/complete',
  authenticateUser,
  requireRole('doctor', 'admin', 'clinic_manager'),
  asyncHandler(async (req, res) => {
    const { completeConsultationEncounter } = await import('../services/doctorWorkspaceService.js');
    const { appointmentId } = req.params;
    const doctorId = req.body?.doctorId || req.headers['x-doctor-id'] || req.user?._id;
    const { notes, diagnosis } = req.body || {};

    const result = await completeConsultationEncounter({ appointmentId, doctorId, notes, diagnosis });
    res.json({ success: true, message: 'Consultation completed successfully', data: result });
  })
);

// POST /api/doctor/encounter/:appointmentId/prescription — Issue digital prescription
router.post(
  '/encounter/:appointmentId/prescription',
  authenticateUser,
  requireRole('doctor', 'admin', 'clinic_manager'),
  asyncHandler(async (req, res) => {
    const { issueEncounterPrescription } = await import('../services/doctorWorkspaceService.js');
    const { appointmentId } = req.params;
    const doctorId = req.body?.doctorId || req.headers['x-doctor-id'] || req.user?._id;
    const { patientId, medications, diagnosis, instructions, doctorName } = req.body || {};

    const prescription = await issueEncounterPrescription({
      appointmentId,
      doctorId,
      patientId,
      medications,
      diagnosis,
      instructions,
      doctorName,
    });
    res.status(201).json({ success: true, message: 'Prescription issued successfully', data: prescription });
  })
);

// POST /api/doctor/encounter/:appointmentId/order-test — Order diagnostic test
router.post(
  '/encounter/:appointmentId/order-test',
  authenticateUser,
  requireRole('doctor', 'admin', 'clinic_manager'),
  asyncHandler(async (req, res) => {
    const { issueEncounterTestOrder } = await import('../services/doctorWorkspaceService.js');
    const { appointmentId } = req.params;
    const doctorId = req.body?.doctorId || req.headers['x-doctor-id'] || req.user?._id;
    const { patientId, testName, reason, doctorName } = req.body || {};

    const order = await issueEncounterTestOrder({
      appointmentId,
      doctorId,
      patientId,
      testName,
      reason,
      doctorName,
    });
    res.status(201).json({ success: true, message: 'Diagnostic test ordered successfully', data: order });
  })
);

// POST /api/doctor/encounter/:appointmentId/care-plan — Issue doctor care plan
router.post(
  '/encounter/:appointmentId/care-plan',
  authenticateUser,
  requireRole('doctor', 'admin', 'clinic_manager'),
  asyncHandler(async (req, res) => {
    const { issueEncounterCarePlan } = await import('../services/doctorWorkspaceService.js');
    const { appointmentId } = req.params;
    const doctorId = req.body?.doctorId || req.headers['x-doctor-id'] || req.user?._id;
    const { patientId, doctorName, ...carePlanData } = req.body || {};

    const carePlan = await issueEncounterCarePlan({
      appointmentId,
      doctorId,
      patientId,
      carePlanData,
      doctorName,
    });
    res.status(201).json({ success: true, message: 'Doctor care plan issued successfully', data: carePlan });
  })
);

// POST /api/doctor/encounter/:appointmentId/verified-history — Add doctor-verified medical history
router.post(
  '/encounter/:appointmentId/verified-history',
  authenticateUser,
  requireRole('doctor', 'admin', 'clinic_manager'),
  asyncHandler(async (req, res) => {
    const { addDoctorVerifiedHistory } = await import('../services/doctorWorkspaceService.js');
    const { appointmentId } = req.params;
    const doctorId = req.body?.doctorId || req.headers['x-doctor-id'] || req.user?._id;
    const { patientId, condition, conditionDate, notes, doctorName } = req.body || {};

    const entry = await addDoctorVerifiedHistory({
      appointmentId,
      doctorId,
      patientId,
      condition,
      conditionDate,
      notes,
      doctorName,
    });
    res.status(201).json({ success: true, message: 'Doctor-verified history entry recorded', data: entry });
  })
);

export default router;
