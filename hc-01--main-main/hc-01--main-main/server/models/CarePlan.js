import mongoose from "mongoose";

/**
 * CarePlan — Doctor-Issued Clinical Guidance Model
 *
 * Stores personalized clinical guidance issued by an attending doctor
 * during or after an appointment consultation.
 *
 * Structured Information:
 *   - DO: Diet recommended, Activities recommended
 *   - AVOID: Diet restricted, Activities restricted
 *   - FOLLOW-UP: Follow-up date, Doctor attribution, Clinical notes
 *
 * Security & Clinical Integrity:
 *   - Guidance is strictly doctor-issued (AI must not independently prescribe treatment).
 *   - Patient owns their care plan data.
 *   - Other clinicians require an active AccessGrant to view.
 */
const carePlanSchema = new mongoose.Schema(
  {
    patientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "Patient ID is required"],
      index: true,
    },
    doctorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "DoctorProfile",
      required: [true, "Doctor ID is required"],
      index: true,
    },
    doctorName: {
      type: String,
      required: [true, "Doctor name is required"],
      trim: true,
    },
    appointmentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Appointment",
      default: null,
      index: true,
    },
    diagnosis: {
      type: String,
      required: [true, "Diagnosis / clinical context is required"],
      trim: true,
      maxlength: [500, "Diagnosis cannot exceed 500 characters"],
    },
    // DO: Recommended diet & activities
    dietRecommended: {
      type: [String],
      default: [],
    },
    activitiesRecommended: {
      type: [String],
      default: [],
    },
    // AVOID: Restricted diet & activities
    dietRestricted: {
      type: [String],
      default: [],
    },
    activitiesRestricted: {
      type: [String],
      default: [],
    },
    // FOLLOW-UP: Planned next review & clinical notes
    followUpDate: {
      type: Date,
      default: null,
    },
    notes: {
      type: String,
      trim: true,
      maxlength: [2000, "Notes cannot exceed 2000 characters"],
      default: "",
    },
    status: {
      type: String,
      enum: {
        values: ["active", "completed", "superseded", "discontinued"],
        message: "Status must be active, completed, superseded, or discontinued",
      },
      default: "active",
      index: true,
    },
    source: {
      type: String,
      enum: ["doctor_issued"],
      default: "doctor_issued",
    },
  },
  {
    timestamps: true,
  }
);

// Optimize retrieval by patient, sorted newest first
carePlanSchema.index({ patientId: 1, createdAt: -1 });
carePlanSchema.index({ patientId: 1, status: 1, createdAt: -1 });

const CarePlan =
  mongoose.models.CarePlan || mongoose.model("CarePlan", carePlanSchema);

export default CarePlan;
