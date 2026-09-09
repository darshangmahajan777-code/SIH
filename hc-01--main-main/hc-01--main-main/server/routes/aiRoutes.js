import express from 'express';
import {
  predictWaitTime,
  rankDoctors,
  evaluatePrioritySupport,
  getCarePlanAssistance,
  findNearbyHospitals,
  checkAiServiceHealth,
} from '../services/aiService.js';
import { asyncHandler } from '../middleware/errorHandler.js';

const router = express.Router();

/**
 * GET /api/ai/health
 * Returns connectivity status to the Python AI service
 */
router.get(
  '/health',
  asyncHandler(async (req, res) => {
    const health = await checkAiServiceHealth();
    res.json({
      success: true,
      data: health,
    });
  })
);

/**
 * POST /api/ai/predict-wait
 * Predicts patient wait time using Poisson-inspired model with deterministic fallback
 */
router.post(
  '/predict-wait',
  asyncHandler(async (req, res) => {
    const { patientsAhead, avgTime, timeOfDay, elapsedInProgress } = req.body;
    const result = await predictWaitTime({
      patientsAhead,
      avgTime,
      timeOfDay,
      elapsedInProgress,
    });
    res.json({
      success: true,
      data: result,
    });
  })
);

/**
 * POST /api/ai/rank-doctors
 * Multi-factor Bayesian ranking for doctor selection with explanations
 */
router.post(
  '/rank-doctors',
  asyncHandler(async (req, res) => {
    const { doctors = [], criteria = {} } = req.body;
    const result = await rankDoctors({ doctors, criteria });
    res.json({
      success: true,
      data: result,
    });
  })
);

/**
 * POST /api/ai/priority-support
 * Clinical Decision Support (CDS) triage evaluation with human authority
 */
router.post(
  '/priority-support',
  asyncHandler(async (req, res) => {
    const { condition, age, vitals } = req.body;
    const result = await evaluatePrioritySupport({ condition, age, vitals });
    res.json({
      success: true,
      data: result,
    });
  })
);

/**
 * POST /api/ai/care-plan-assist
 * Clinical lifestyle & recovery care plan drafting assistant
 */
router.post(
  '/care-plan-assist',
  asyncHandler(async (req, res) => {
    const { condition, patientAge, patientGender } = req.body;
    const result = await getCarePlanAssistance({ condition, patientAge, patientGender });
    res.json({
      success: true,
      data: result,
    });
  })
);

/**
 * POST /api/ai/emergency-redirect
 * Emergency hospital ranking and redirection
 */
router.post(
  '/emergency-redirect',
  asyncHandler(async (req, res) => {
    const { condition, lat, lng } = req.body;
    const hospitals = await findNearbyHospitals({ condition, lat, lng });
    res.json({
      success: true,
      data: {
        bestHospital: hospitals[0] || null,
        allSuggestions: hospitals,
        detectedSpecialization: hospitals[0]?.specialization || 'emergency',
      },
    });
  })
);

export default router;
