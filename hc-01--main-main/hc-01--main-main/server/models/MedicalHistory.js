import mongoose from "mongoose";

/**
 * MedicalHistory — Patient Medical Timeline Entry
 *
 * Each document is one entry on the patient's timeline.
 * Two source types:
 *   "self_reported"    — patient entered this themselves
 *   "doctor_verified"  — auto-created when an appointment is marked "completed"
 *
 * Doctor-verified entries are immutable after creation (source of clinical truth).
 * Self-reported entries may be soft-deleted by the patient (isActive = false).
 *
 * CONSENT: All doctor reads are blocked by requireConsent middleware.
 * Patients always have read access to their own timeline.
 */
const medicalHistorySchema = new mongoose.Schema(
  {
    patientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "Patient ID is required"],
      index: true,
    },
    condition: {
      type: String,
      required: [true, "Condition or diagnosis name is required"],
      trim: true,
      maxlength: [300, "Condition cannot exceed 300 characters"],
    },
    // The date the condition occurred / was diagnosed (not the record creation date)
    conditionDate: {
      type: String, // YYYY-MM-DD — consistent with Appointment.date format
      required: [true, "Condition date is required"],
      index: true,
    },
    notes: {
      type: String,
      trim: true,
      maxlength: [2000, "Notes cannot exceed 2000 characters"],
      default: "",
    },
    category: {
      type: String,
      enum: ["illness", "diagnosis", "surgery", "chronic_condition", "allergy", "general"],
      default: "diagnosis",
      index: true,
    },
    source: {
      type: String,
      enum: {
        values: ["self_reported", "doctor_verified"],
        message: "Source must be self_reported or doctor_verified",
      },
      required: [true, "Source is required"],
    },
    // Populated only for doctor_verified entries
    doctorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "DoctorProfile",
      default: null,
    },
    // Denormalized snapshot — not re-queried on display
    doctorName: {
      type: String,
      default: null,
    },
    // The appointment that generated this entry (doctor_verified only)
    appointmentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Appointment",
      default: null,
    },
    // Soft-delete — patients may hide self-reported entries
    // Doctor-verified entries cannot be deactivated
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

// Primary query: patient timeline newest-first
medicalHistorySchema.index({ patientId: 1, conditionDate: -1 });
medicalHistorySchema.index({ patientId: 1, isActive: 1, conditionDate: -1 });

// Idempotency guard: one doctor-verified entry per appointment
medicalHistorySchema.index(
  { appointmentId: 1 },
  {
    unique: true,
    sparse: true, // Only enforced when appointmentId is non-null
  }
);

const MedicalHistory =
  mongoose.models.MedicalHistory || mongoose.model("MedicalHistory", medicalHistorySchema);
export default MedicalHistory;
