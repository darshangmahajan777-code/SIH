import express from 'express';
import { asyncHandler } from '../middleware/errorHandler.js';
import {
  evaluateConditionPriority,
  overridePriority,
  getPriorityAuditLog,
  getQueuePolicy,
  updateQueuePolicy,
} from '../services/priorityService.js';

const router = express.Router();

/**
 * POST /api/priority/evaluate
 * Clinical Decision Support (CDS) evaluation of patient symptoms/condition
 */
router.post('/evaluate', asyncHandler(async (req, res) => {
  const { condition, age, vitals } = req.body;
  const result = await evaluateConditionPriority({ condition, age, vitals });

  res.json({
    success: true,
    data: result,
  });
}));

/**
 * POST /api/priority/override
 * Clinician Priority Override
 * Authorizes a doctor or triage nurse to manually override AI/system priority
 * and creates an auditable record in PriorityAuditLog.
 */
router.post('/override', asyncHandler(async (req, res) => {
  const { tokenId, newPriority, overrideReason, doctorName } = req.body;

  if (!tokenId || !newPriority) {
    return res.status(400).json({
      success: false,
      error: 'tokenId and newPriority are required',
    });
  }

  const result = await overridePriority({
    tokenId,
    newPriority,
    overrideReason: overrideReason || 'Physician clinical judgement',
    doctorName: doctorName || 'Attending Clinician',
  });

  res.json({
    success: true,
    message: result.message,
    data: result,
  });
}));

/**
 * GET /api/priority/audit-log
 * Query priority decisions and clinician override audit trail
 */
router.get('/audit-log', asyncHandler(async (req, res) => {
  const { tokenId, tokenNumber, humanOverride, limit } = req.query;

  const logs = await getPriorityAuditLog(
    {
      tokenId,
      tokenNumber,
      humanOverride: humanOverride !== undefined ? humanOverride === 'true' : undefined,
    },
    limit ? Number(limit) : 50
  );

  res.json({
    success: true,
    count: logs.length,
    data: logs,
  });
}));

/**
 * GET /api/priority/policy
 * Get active queue scheduling policy configuration
 */
router.get('/policy', asyncHandler(async (req, res) => {
  res.json({
    success: true,
    data: getQueuePolicy(),
  });
}));

/**
 * PUT /api/priority/policy
 * Update queue scheduling policy (e.g. starvationLimit)
 */
router.put('/policy', asyncHandler(async (req, res) => {
  const { starvationLimit, enabled } = req.body;
  const updated = updateQueuePolicy({ starvationLimit, enabled });

  res.json({
    success: true,
    message: 'Queue policy updated successfully',
    data: updated,
  });
}));

export default router;
