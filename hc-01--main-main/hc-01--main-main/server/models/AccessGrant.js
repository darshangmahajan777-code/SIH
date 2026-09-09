import mongoose from "mongoose";

/**
 * AccessGrant — Patient Consent Record
 *
 * Records that a patient has explicitly granted a doctor access to their
 * medical data. The patient owns this record and may revoke it at any time.
 *
 * Scopes:
 *   "appointment" — access is limited to a specific appointment context
 *   "ongoing"     — doctor has standing access across all the patient records
 *
 * An active grant has revokedAt === null.
 * A revoked grant has revokedAt set to the revocation timestamp.
 * Revoked grants are retained for audit purposes and are never deleted.
 */
const accessGrantSchema = new mongoose.Schema(
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
    scope: {
      type: String,
      enum: {
        values: ["appointment", "ongoing"],
        message: "Scope must be appointment or ongoing",
      },
      required: [true, "Access scope is required"],
    },
    // Required when scope === "appointment"; null for "ongoing"
    appointmentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Appointment",
      default: null,
    },
    grantedAt: {
      type: Date,
      default: Date.now,
    },
    // Null indicates an active grant. Set on revocation.
    revokedAt: {
      type: Date,
      default: null,
    },
    // The user who created this grant (normally the patient themselves)
    grantedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    // Optional human-readable note the patient can attach
    note: {
      type: String,
      trim: true,
      maxlength: [500, "Note cannot exceed 500 characters"],
      default: "",
    },
  },
  {
    timestamps: true,
  }
);

// Fast lookup: is there an active grant for this (patient, doctor) pair?
accessGrantSchema.index({ patientId: 1, doctorId: 1, scope: 1, revokedAt: 1 });

// Appointment-scoped grant lookup by appointmentId
accessGrantSchema.index({ appointmentId: 1, doctorId: 1, revokedAt: 1 });

const AccessGrant = mongoose.models.AccessGrant || mongoose.model("AccessGrant", accessGrantSchema);
export default AccessGrant;
