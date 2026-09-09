import mongoose from "mongoose";

/**
 * AccessLog — Immutable Audit Trail
 *
 * Every access to protected patient medical data (reads, writes, grants,
 * revocations, emergency access) creates an entry here.
 *
 * This log is append-only — no records are ever deleted or mutated.
 * Patients can view their own access log to see who accessed their data.
 */
const accessLogSchema = new mongoose.Schema(
  {
    patientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "Patient ID is required"],
      index: true,
    },
    doctorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "Doctor ID is required"],
      index: true,
    },
    accessedAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
    resource: {
      type: String,
      enum: {
        values: [
          "medical_history",
          "prescriptions",
          "test_results",
          "care_plans",
          "medical_reports",
          "grant",
          "revoke",
        ],
        message: "Invalid resource type",
      },
      required: [true, "Resource type is required"],
    },
    // Specific record accessed (e.g. a particular prescription document ID)
    resourceId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
    action: {
      type: String,
      enum: {
        values: ["read", "write", "grant", "revoke", "emergency_access"],
        message: "Invalid action type",
      },
      required: [true, "Action is required"],
    },
    // Reference to the active AccessGrant that authorized this access
    // Null for emergency access (no persistent grant is created)
    grantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "AccessGrant",
      default: null,
    },
    // Emergency access fields — populated only when isEmergency === true
    isEmergency: {
      type: Boolean,
      default: false,
    },
    emergencyReason: {
      type: String,
      default: null,
    },
    // The clinician who authorized the emergency access
    authorizedBy: {
      type: String,
      default: null,
    },
    // Emergency case reference (must be an active EmergencyCase._id)
    emergencyCaseId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "EmergencyCase",
      default: null,
    },
    // IP address for security traceability
    ipAddress: {
      type: String,
      default: null,
    },
    // User agent of the requesting client
    userAgent: {
      type: String,
      default: null,
    },
  },
  {
    timestamps: true,
    // Strictly read-only — prevent any document updates
    strict: true,
  }
);

// Patient can efficiently query their own log sorted by time
accessLogSchema.index({ patientId: 1, accessedAt: -1 });
accessLogSchema.index({ patientId: 1, resource: 1, accessedAt: -1 });

// Doctor audit trail lookup
accessLogSchema.index({ doctorId: 1, accessedAt: -1 });

// Flag emergency access for review
accessLogSchema.index({ isEmergency: 1, accessedAt: -1 });

const AccessLog = mongoose.models.AccessLog || mongoose.model("AccessLog", accessLogSchema);
export default AccessLog;
