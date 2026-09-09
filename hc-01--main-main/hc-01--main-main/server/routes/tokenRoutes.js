import express from 'express';
import { asyncHandler } from '../middleware/errorHandler.js';
import { validateCreateToken } from '../middleware/validate.js';
import { tokenCreationLimiter } from '../middleware/rateLimiter.js';
import {
  generateToken,
  getQueue,
  getTokenById,
  cancelToken,
  updateTokenPriority,
} from '../services/queueService.js';
import { getTokenQueuePosition } from '../services/virtualQueueService.js';

const router = express.Router();

// POST /api/tokens — Create a new token
router.post('/', tokenCreationLimiter, validateCreateToken, asyncHandler(async (req, res) => {
  const { patientName, age, condition, priority, department } = req.body;
  const token = await generateToken({ patientName, age, condition, priority, department });
  res.status(201).json({ success: true, data: token });
}));

// GET /api/tokens — Get current queue
router.get('/', asyncHandler(async (req, res) => {
  const queue = await getQueue();
  res.status(200).json({ success: true, data: queue });
}));

// GET /api/tokens/track/:tokenNumber/queue-position — Track walk-in token
router.get('/track/:tokenNumber/queue-position', asyncHandler(async (req, res) => {
  const metrics = await getTokenQueuePosition(req.params.tokenNumber);
  res.json({
    success: true,
    position: metrics.position,
    patientsAhead: metrics.patientsAhead,
    estimatedTime: metrics.estimatedTime,
    estimatedWindow: metrics.estimatedWindow,
    recommendedArrivalTime: metrics.recommendedArrivalTime,
    priority: metrics.priority,
    reason: metrics.reason,
    lastUpdated: metrics.lastUpdated,
    data: metrics,
  });
}));

// GET /api/tokens/:id — Get single token
router.get('/:id', asyncHandler(async (req, res) => {
  const token = await getTokenById(req.params.id);
  res.json({ success: true, data: token });
}));

// GET /api/tokens/:id/queue-position — Get virtual queue metrics by token ID
router.get('/:id/queue-position', asyncHandler(async (req, res) => {
  const metrics = await getTokenQueuePosition(req.params.id);
  res.json({
    success: true,
    position: metrics.position,
    patientsAhead: metrics.patientsAhead,
    estimatedTime: metrics.estimatedTime,
    estimatedWindow: metrics.estimatedWindow,
    recommendedArrivalTime: metrics.recommendedArrivalTime,
    priority: metrics.priority,
    reason: metrics.reason,
    lastUpdated: metrics.lastUpdated,
    data: metrics,
  });
}));

// PATCH /api/tokens/:id/cancel — Cancel a token
router.patch('/:id/cancel', asyncHandler(async (req, res) => {
  const token = await cancelToken(req.params.id);
  res.json({ success: true, data: token });
}));

// PATCH /api/tokens/:id/priority — Update token priority (e.g. emergency/senior)
router.patch('/:id/priority', asyncHandler(async (req, res) => {
  const { priority } = req.body;
  const token = await updateTokenPriority(req.params.id, priority);
  res.json({
    success: true,
    message: `Token priority updated to ${token.priority}`,
    data: token,
  });
}));

export default router;
