import mongoose from "mongoose";

/**
 * TestOrder — Lab / Diagnostic Test Order Model
 *
 * Tracks clinical test orders from prescription through completion.
 *
 * Flow:
 *   1. Doctor A orders test -> status: "ordered", doctorName/doctorId recorded.
 *   2. Patient/Lab completes test -> status: "completed", structured result stored.
 *   3. Doctor B with consent views test -> sees Doctor A attribution, date, result, lab.
 *
 * Security:
 *   - Patient owns the test records.
 *   - Other doctors may only read if an active AccessGrant exists.
 *   - Medical reports/files are never publicly accessible; authenticated endpoint only.
 */
const testOrderSchema = new mongoose.Schema(
  {
    appointmentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Appointment",
      default: null,
      index: true,
    },
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
    // Denormalized snapshot for immutable clinical attribution ("Ordered by Doctor A")
    doctorName: {
      type: String,
      default: "Attending Doctor",
      trim: true,
    },
    testName: {
      type: String,
      required: [true, "Test name is required"],
      trim: true,
      maxlength: [200, "Test name cannot exceed 200 characters"],
    },
    reason: {
      type: String,
      required: [true, "Reason for test is required"],
      trim: true,
      maxlength: [1000, "Reason cannot exceed 1000 characters"],
    },
    status: {
      type: String,
      enum: {
        values: ["ordered", "in-progress", "completed", "cancelled"],
        message: "Status must be ordered, in-progress, completed, or cancelled",
      },
      default: "ordered",
      index: true,
    },
    // Structured result — populated when test is completed
    result: {
      value: {
        type: String,
        trim: true,
        default: null,
      },
      unit: {
        type: String,
        trim: true,
        default: null,
      },
      resultDate: {
        type: Date,
        default: null,
      },
      labName: {
        type: String,
        trim: true,
        default: null,
      },
      notes: {
        type: String,
        trim: true,
        default: "",
      },
      // Medical report file metadata (if uploaded / generated)
      reportFile: {
        fileId: { type: String, default: null },
        fileName: { type: String, default: null },
        mimeType: { type: String, default: "application/pdf" },
        fileSize: { type: Number, default: 0 },
        content: { type: String, default: null }, // Base64 or serialized text (non-public)
      },
    },
    completedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes for query optimization
testOrderSchema.index({ patientId: 1, createdAt: -1 });
testOrderSchema.index({ patientId: 1, status: 1, createdAt: -1 });
testOrderSchema.index({ doctorId: 1, createdAt: -1 });
testOrderSchema.index({ doctorId: 1, status: 1, createdAt: -1 });

const TestOrder =
  mongoose.models.TestOrder || mongoose.model("TestOrder", testOrderSchema);

export default TestOrder;
