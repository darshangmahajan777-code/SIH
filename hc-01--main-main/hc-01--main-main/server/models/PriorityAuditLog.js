import mongoose from 'mongoose';

const priorityAuditLogSchema = new mongoose.Schema(
  {
    tokenId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Token',
      required: true,
      index: true,
    },
    tokenNumber: {
      type: Number,
      index: true,
    },
    appointmentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Appointment',
      default: null,
    },
    patientName: {
      type: String,
      trim: true,
      default: '',
    },
    originalPosition: {
      type: Number,
      required: true,
    },
    newPosition: {
      type: Number,
      required: true,
    },
    priority: {
      type: String,
      required: true,
    },
    previousPriority: {
      type: String,
      default: null,
    },
    score: {
      type: Number,
      default: 0,
    },
    reason: {
      type: String,
      required: true,
      trim: true,
    },
    decisionSource: {
      type: String,
      enum: ['ai_cds', 'clinician_override', 'triage_rule', 'manual'],
      default: 'ai_cds',
    },
    humanOverride: {
      type: Boolean,
      default: false,
      index: true,
    },
    overriddenBy: {
      type: String,
      trim: true,
      default: null,
    },
    overrideReason: {
      type: String,
      trim: true,
      default: null,
    },
    timestamp: {
      type: Date,
      default: Date.now,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

priorityAuditLogSchema.index({ tokenId: 1, timestamp: -1 });

const PriorityAuditLog =
  mongoose.models.PriorityAuditLog ||
  mongoose.model('PriorityAuditLog', priorityAuditLogSchema);

export default PriorityAuditLog;
