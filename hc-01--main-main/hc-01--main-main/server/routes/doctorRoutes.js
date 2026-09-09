import express from 'express';
import { asyncHandler } from '../middleware/errorHandler.js';
import { validateDoctorSession } from '../middleware/validate.js';
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

// POST /api/doctor/session/start — Start a doctor session
router.post('/session/start', validateDoctorSession, asyncHandler(async (req, res) => {
  const { doctorName, department } = req.body;

  // End any existing active sessions
  await DoctorSession.updateMany({ isActive: true }, { isActive: false, endTime: new Date() });

  const session = await DoctorSession.create({
    doctorName,
    department: department || 'OPD',
  });

  res.status(201).json({ success: true, data: session });
}));

// POST /api/doctor/session/end — End current doctor session
router.post('/session/end', asyncHandler(async (req, res) => {
  const session = await DoctorSession.findOneAndUpdate(
    { isActive: true },
    { isActive: false, endTime: new Date() },
    { new: true }
  );

  if (!session) {
    return res.status(404).json({ success: false, error: 'No active session found' });
  }

  res.json({ success: true, data: session });
}));

// GET /api/doctor/session — Get current active session
router.get('/session', asyncHandler(async (req, res) => {
  const session = await DoctorSession.findOne({ isActive: true }).lean();
  res.json({ success: true, data: session || null });
}));

// ============================================================================
// DOCTOR CLINICAL WORKSPACE ENDPOINTS
// ============================================================================

// GET /api/doctor/workspace-summary — Aggregated overview for Doctor Home
router.get('/workspace-summary', asyncHandler(async (req, res) => {
  const { getDoctorWorkspaceSummary } = await import('../services/doctorWorkspaceService.js');
  const doctorId = req.query.doctorId || req.headers['x-doctor-id'] || req.user?._id;
  const date = req.query.date;

  const summary = await getDoctorWorkspaceSummary({ doctorId, date });
  res.json({ success: true, data: summary });
}));

// GET /api/doctor/encounter/:appointmentId — Consent-gated patient clinical encounter dossier
router.get('/encounter/:appointmentId', asyncHandler(async (req, res) => {
  const { getPatientEncounter } = await import('../services/doctorWorkspaceService.js');
  const { appointmentId } = req.params;
  const doctorId = req.query.doctorId || req.headers['x-doctor-id'] || req.user?._id;

  const encounter = await getPatientEncounter({ appointmentId, doctorId });
  res.json({ success: true, data: encounter });
}));

// POST /api/doctor/encounter/:appointmentId/start — Start consultation
router.post('/encounter/:appointmentId/start', asyncHandler(async (req, res) => {
  const { startConsultation } = await import('../services/doctorWorkspaceService.js');
  const { appointmentId } = req.params;
  const doctorId = req.body?.doctorId || req.headers['x-doctor-id'] || req.user?._id;

  const result = await startConsultation({ appointmentId, doctorId });
  res.json({ success: true, message: 'Consultation started', data: result });
}));

// POST /api/doctor/encounter/:appointmentId/complete — Complete consultation & auto-generate history
router.post('/encounter/:appointmentId/complete', asyncHandler(async (req, res) => {
  const { completeConsultationEncounter } = await import('../services/doctorWorkspaceService.js');
  const { appointmentId } = req.params;
  const doctorId = req.body?.doctorId || req.headers['x-doctor-id'] || req.user?._id;
  const { notes, diagnosis } = req.body || {};

  const result = await completeConsultationEncounter({ appointmentId, doctorId, notes, diagnosis });
  res.json({ success: true, message: 'Consultation completed successfully', data: result });
}));

// POST /api/doctor/encounter/:appointmentId/prescription — Issue digital prescription
router.post('/encounter/:appointmentId/prescription', asyncHandler(async (req, res) => {
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
}));

// POST /api/doctor/encounter/:appointmentId/order-test — Order diagnostic test
router.post('/encounter/:appointmentId/order-test', asyncHandler(async (req, res) => {
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
}));

// POST /api/doctor/encounter/:appointmentId/care-plan — Issue doctor care plan
router.post('/encounter/:appointmentId/care-plan', asyncHandler(async (req, res) => {
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
}));

// POST /api/doctor/encounter/:appointmentId/verified-history — Add doctor-verified medical history
router.post('/encounter/:appointmentId/verified-history', asyncHandler(async (req, res) => {
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
}));

export default router;
