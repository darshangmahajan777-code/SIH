import mongoose from 'mongoose';

export const NOTIFICATION_TYPES = [
  'appointment_confirmed',
  'appointment_cancelled',
  'appointment_reminder',
  'queue_update',
  'near_turn',
  'video_ready',
  'prescription_created',
  'medicine_reminder',
  'lab_result',
  'care_plan',
  'follow_up',
  'consent_granted',
  'consent_revoked',
  'medical_record_access',
];

const notificationSchema = new mongoose.Schema(
  {
    recipient: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Recipient ID is required'],
      index: true,
    },
    type: {
      type: String,
      enum: {
        values: NOTIFICATION_TYPES,
        message: 'Invalid notification type',
      },
      required: [true, 'Notification type is required'],
      index: true,
    },
    title: {
      type: String,
      required: [true, 'Notification title is required'],
      trim: true,
      maxlength: [140, 'Title cannot exceed 140 characters'],
    },
    message: {
      type: String,
      required: [true, 'Notification message is required'],
      trim: true,
      maxlength: [1000, 'Message cannot exceed 1000 characters'],
    },
    read: {
      type: Boolean,
      default: false,
      index: true,
    },
    scheduledAt: {
      type: Date,
      default: null,
      index: true,
    },
    isSent: {
      type: Boolean,
      default: true,
      index: true,
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  {
    timestamps: true,
  }
);

// Compound indexes for high-frequency queries
notificationSchema.index({ recipient: 1, read: 1, createdAt: -1 });
notificationSchema.index({ recipient: 1, createdAt: -1 });
notificationSchema.index({ recipient: 1, type: 1, createdAt: -1 });
notificationSchema.index({ scheduledAt: 1, isSent: 1 });
notificationSchema.index({ recipient: 1, scheduledAt: 1 });

const Notification = mongoose.models.Notification || mongoose.model('Notification', notificationSchema);
export default Notification;
