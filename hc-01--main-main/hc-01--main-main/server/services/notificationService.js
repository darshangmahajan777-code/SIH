import mongoose from 'mongoose';
import Notification, { NOTIFICATION_TYPES } from '../models/Notification.js';
import { AppError } from '../middleware/errorHandler.js';
import { getIO } from '../socketHandler.js';

// In-memory store fallback for fast unit tests or when MongoDB is disconnected
let inMemoryNotifications = [];

export function clearNotificationsForTest() {
  inMemoryNotifications = [];
}

/**
 * Emit real-time notification and unread count to recipient's isolated socket rooms
 */
export function emitNotificationToSocket(recipientId, notification, unreadCount) {
  try {
    const io = getIO();
    if (!io || !recipientId) return;

    const idStr = String(recipientId);
    // Emit to isolated recipient rooms
    io.to(`user:${idStr}`)
      .to(`user-room:${idStr}`)
      .to(`patient-room:${idStr}`)
      .to(`doctor-room:${idStr}`)
      .emit('notification:new', notification);

    if (typeof unreadCount === 'number') {
      io.to(`user:${idStr}`)
        .to(`user-room:${idStr}`)
        .to(`patient-room:${idStr}`)
        .to(`doctor-room:${idStr}`)
        .emit('notification:unread_count', { unreadCount });
    }
  } catch (err) {
    // Non-blocking socket emission error
    console.warn('[NotificationService] Socket emission error:', err.message);
  }
}

/**
 * Create and persist a new notification, then dispatch to recipient via Socket.IO
 */
export async function createNotification({
  recipient,
  type,
  title,
  message,
  metadata = {},
  persist = true,
}) {
  if (!recipient) {
    throw new AppError('Recipient is required', 400);
  }
  if (!type || !NOTIFICATION_TYPES.includes(type)) {
    throw new AppError(`Invalid notification type. Must be one of: ${NOTIFICATION_TYPES.join(', ')}`, 400);
  }
  if (!title || !title.trim()) {
    throw new AppError('Notification title is required', 400);
  }
  if (!message || !message.trim()) {
    throw new AppError('Notification message is required', 400);
  }

  const recipientStr = String(recipient._id || recipient);
  let savedNotification = null;

  if (mongoose.connection.readyState === 1 && persist) {
    try {
      const doc = await Notification.create({
        recipient: recipientStr,
        type,
        title: title.trim(),
        message: message.trim(),
        read: false,
        metadata: metadata || {},
      });
      savedNotification = doc.toObject();
    } catch (err) {
      console.warn('[NotificationService] Mongo create failed, falling back to memory store:', err.message);
    }
  }

  if (!savedNotification) {
    const mockId = new mongoose.Types.ObjectId().toString();
    savedNotification = {
      _id: mockId,
      id: mockId,
      recipient: recipientStr,
      type,
      title: title.trim(),
      message: message.trim(),
      read: false,
      metadata: metadata || {},
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    if (persist) {
      inMemoryNotifications.unshift(savedNotification);
    }
  }

  // Calculate unread count and emit live notification
  const unreadCount = await getUnreadCount(recipientStr);
  emitNotificationToSocket(recipientStr, savedNotification, unreadCount);

  return savedNotification;
}

/**
 * Retrieve paginated notifications for a recipient with unread counts
 */
export async function getNotifications({
  recipient,
  unreadOnly = false,
  type = null,
  limit = 50,
  skip = 0,
}) {
  if (!recipient) {
    throw new AppError('Recipient is required', 400);
  }

  const recipientStr = String(recipient._id || recipient);
  const maxLimit = Math.min(Math.max(1, Number(limit) || 50), 100);
  const skipCount = Math.max(0, Number(skip) || 0);

  if (mongoose.connection.readyState === 1) {
    try {
      const query = { recipient: recipientStr };
      if (unreadOnly) query.read = false;
      if (type && NOTIFICATION_TYPES.includes(type)) query.type = type;

      const [notifications, total, unreadCount] = await Promise.all([
        Notification.find(query)
          .sort({ createdAt: -1 })
          .skip(skipCount)
          .limit(maxLimit)
          .lean(),
        Notification.countDocuments(query),
        Notification.countDocuments({ recipient: recipientStr, read: false }),
      ]);

      return {
        notifications,
        total,
        unreadCount,
        limit: maxLimit,
        skip: skipCount,
      };
    } catch (err) {
      console.warn('[NotificationService] Mongo find failed, falling back to memory store:', err.message);
    }
  }

  // Fallback in-memory
  let filtered = inMemoryNotifications.filter(
    (n) => String(n.recipient) === recipientStr
  );
  const unreadCount = filtered.filter((n) => !n.read).length;

  if (unreadOnly) {
    filtered = filtered.filter((n) => !n.read);
  }
  if (type && NOTIFICATION_TYPES.includes(type)) {
    filtered = filtered.filter((n) => n.type === type);
  }

  filtered.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  const paginated = filtered.slice(skipCount, skipCount + maxLimit);

  return {
    notifications: paginated,
    total: filtered.length,
    unreadCount,
    limit: maxLimit,
    skip: skipCount,
  };
}

/**
 * Fast unread count query for badges
 */
export async function getUnreadCount(recipient) {
  if (!recipient) return 0;
  const recipientStr = String(recipient._id || recipient);

  if (mongoose.connection.readyState === 1) {
    try {
      return await Notification.countDocuments({ recipient: recipientStr, read: false });
    } catch {
      // fallback
    }
  }

  return inMemoryNotifications.filter(
    (n) => String(n.recipient) === recipientStr && !n.read
  ).length;
}

/**
 * Mark a single notification as read with strict recipient ownership verification
 */
export async function markAsRead({ notificationId, recipient }) {
  if (!notificationId) {
    throw new AppError('Notification ID is required', 400);
  }
  if (!recipient) {
    throw new AppError('Recipient is required', 400);
  }

  const recipientStr = String(recipient._id || recipient);
  const notifIdStr = String(notificationId);

  if (mongoose.connection.readyState === 1) {
    try {
      const doc = await Notification.findById(notifIdStr);
      if (!doc) {
        throw new AppError('Notification not found', 404);
      }
      if (String(doc.recipient) !== recipientStr) {
        throw new AppError('Forbidden: You can only update your own notifications', 403);
      }

      doc.read = true;
      await doc.save();

      const unreadCount = await getUnreadCount(recipientStr);
      emitNotificationToSocket(recipientStr, doc.toObject(), unreadCount);

      return doc.toObject();
    } catch (err) {
      if (err instanceof AppError) throw err;
      console.warn('[NotificationService] Mongo update failed, falling back to memory store:', err.message);
    }
  }

  // Fallback in-memory
  const item = inMemoryNotifications.find((n) => String(n._id || n.id) === notifIdStr);
  if (!item) {
    throw new AppError('Notification not found', 404);
  }
  if (String(item.recipient) !== recipientStr) {
    throw new AppError('Forbidden: You can only update your own notifications', 403);
  }

  item.read = true;
  item.updatedAt = new Date();

  const unreadCount = await getUnreadCount(recipientStr);
  emitNotificationToSocket(recipientStr, item, unreadCount);

  return item;
}

/**
 * Mark all unread notifications for recipient as read
 */
export async function markAllAsRead(recipient) {
  if (!recipient) {
    throw new AppError('Recipient is required', 400);
  }

  const recipientStr = String(recipient._id || recipient);
  let modifiedCount = 0;

  if (mongoose.connection.readyState === 1) {
    try {
      const res = await Notification.updateMany(
        { recipient: recipientStr, read: false },
        { $set: { read: true } }
      );
      modifiedCount = res.modifiedCount || 0;
    } catch (err) {
      console.warn('[NotificationService] Mongo updateMany failed, falling back to memory store:', err.message);
    }
  }

  // Update in-memory as well
  inMemoryNotifications.forEach((n) => {
    if (String(n.recipient) === recipientStr && !n.read) {
      n.read = true;
      n.updatedAt = new Date();
      modifiedCount++;
    }
  });

  // Emit 0 unread count over socket
  emitNotificationToSocket(recipientStr, null, 0);

  return {
    success: true,
    modifiedCount,
    unreadCount: 0,
  };
}

/**
 * Schedule a future reminder (e.g. appointment_reminder, medicine_reminder)
 */
export async function scheduleNotification({
  recipient,
  type,
  title,
  message,
  scheduledAt,
  metadata = {},
}) {
  if (!recipient) throw new AppError('Recipient is required', 400);
  if (!type || !NOTIFICATION_TYPES.includes(type)) throw new AppError('Invalid notification type', 400);
  if (!scheduledAt) throw new AppError('scheduledAt date is required', 400);

  const recipientStr = String(recipient._id || recipient);
  const targetDate = new Date(scheduledAt);

  if (mongoose.connection.readyState === 1) {
    try {
      const doc = await Notification.create({
        recipient: recipientStr,
        type,
        title: title.trim(),
        message: message.trim(),
        read: false,
        scheduledAt: targetDate,
        isSent: false,
        metadata,
      });
      return doc.toObject();
    } catch (err) {
      console.warn('[NotificationService] Schedule mongo failed:', err.message);
    }
  }

  const mockId = new mongoose.Types.ObjectId().toString();
  const scheduledItem = {
    _id: mockId,
    id: mockId,
    recipient: recipientStr,
    type,
    title: title.trim(),
    message: message.trim(),
    read: false,
    scheduledAt: targetDate,
    isSent: false,
    metadata,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  inMemoryNotifications.unshift(scheduledItem);
  return scheduledItem;
}

/**
 * Process due reminders (indexed range query on { scheduledAt: 1, isSent: 1 })
 */
export async function processDueReminders(batchSize = 50) {
  const now = new Date();
  let processedCount = 0;

  if (mongoose.connection.readyState === 1) {
    try {
      const dueNotifications = await Notification.find({
        scheduledAt: { $lte: now },
        isSent: false,
      })
        .limit(batchSize)
        .lean();

      for (const notif of dueNotifications) {
        await Notification.findByIdAndUpdate(notif._id, { isSent: true });
        const unreadCount = await getUnreadCount(notif.recipient);
        emitNotificationToSocket(notif.recipient, notif, unreadCount);
        processedCount++;
      }
      return processedCount;
    } catch (err) {
      console.warn('[NotificationService] processDueReminders error:', err.message);
    }
  }

  // Memory fallback
  for (const item of inMemoryNotifications) {
    if (item.scheduledAt && new Date(item.scheduledAt) <= now && !item.isSent) {
      item.isSent = true;
      const unreadCount = await getUnreadCount(item.recipient);
      emitNotificationToSocket(item.recipient, item, unreadCount);
      processedCount++;
    }
  }

  return processedCount;
}

let reminderInterval = null;

export function startReminderScheduler(intervalMs = 30000) {
  if (reminderInterval) return;
  reminderInterval = setInterval(() => {
    processDueReminders().catch(() => {});
  }, intervalMs);
  if (reminderInterval.unref) reminderInterval.unref();
}

export function stopReminderScheduler() {
  if (reminderInterval) {
    clearInterval(reminderInterval);
    reminderInterval = null;
  }
}
