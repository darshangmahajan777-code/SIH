import express from 'express';
import { asyncHandler, AppError } from '../middleware/errorHandler.js';
import {
  createNotification,
  getNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
} from '../services/notificationService.js';

const router = express.Router();

/**
 * GET /api/notifications
 * List notifications for recipient with filters
 */
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const recipient =
      req.query.recipient ||
      req.headers['x-user-id'] ||
      req.headers['x-patient-id'] ||
      req.user?._id;

    if (!recipient) {
      throw new AppError('Recipient ID is required to fetch notifications', 400);
    }

    const { unreadOnly, type, limit, skip } = req.query;

    const result = await getNotifications({
      recipient,
      unreadOnly: unreadOnly === 'true' || unreadOnly === true,
      type: type || null,
      limit: limit ? Number(limit) : 50,
      skip: skip ? Number(skip) : 0,
    });

    res.json({
      success: true,
      data: result.notifications,
      total: result.total,
      unreadCount: result.unreadCount,
      limit: result.limit,
      skip: result.skip,
    });
  })
);

/**
 * GET /api/notifications/unread-count
 * Fast unread count lookup
 */
router.get(
  '/unread-count',
  asyncHandler(async (req, res) => {
    const recipient =
      req.query.recipient ||
      req.headers['x-user-id'] ||
      req.headers['x-patient-id'] ||
      req.user?._id;

    if (!recipient) {
      throw new AppError('Recipient ID is required', 400);
    }

    const unreadCount = await getUnreadCount(recipient);

    res.json({
      success: true,
      unreadCount,
    });
  })
);

/**
 * PATCH /api/notifications/:id/read
 * Mark a single notification as read
 */
router.patch(
  '/:id/read',
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const recipient =
      req.body?.recipient ||
      req.query?.recipient ||
      req.headers['x-user-id'] ||
      req.headers['x-patient-id'] ||
      req.user?._id;

    if (!recipient) {
      throw new AppError('Recipient ID is required to update notification', 400);
    }

    const updated = await markAsRead({
      notificationId: id,
      recipient,
    });

    const unreadCount = await getUnreadCount(recipient);

    res.json({
      success: true,
      message: 'Notification marked as read',
      data: updated,
      unreadCount,
    });
  })
);

/**
 * PATCH /api/notifications/mark-all-read
 * Mark all unread notifications for recipient as read
 */
router.patch(
  '/mark-all-read',
  asyncHandler(async (req, res) => {
    const recipient =
      req.body?.recipient ||
      req.query?.recipient ||
      req.headers['x-user-id'] ||
      req.headers['x-patient-id'] ||
      req.user?._id;

    if (!recipient) {
      throw new AppError('Recipient ID is required', 400);
    }

    const result = await markAllAsRead(recipient);

    res.json({
      success: true,
      message: 'All notifications marked as read',
      data: result,
      unreadCount: 0,
    });
  })
);

/**
 * POST /api/notifications
 * Dispatch a notification
 */
router.post(
  '/',
  asyncHandler(async (req, res) => {
    const { recipient, type, title, message, metadata } = req.body;

    const notification = await createNotification({
      recipient,
      type,
      title,
      message,
      metadata,
    });

    res.status(201).json({
      success: true,
      message: 'Notification dispatched successfully',
      data: notification,
    });
  })
);

export default router;
