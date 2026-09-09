import mongoose from 'mongoose';

const medicationItemSchema = new mongoose.Schema(
  {
    medicineName: {
      type: String,
      required: [true, 'Medicine name is required'],
      trim: true,
    },
    dosage: {
      type: String,
      required: [true, 'Dosage is required'], // e.g. "500mg", "1 capsule"
      trim: true,
    },
    frequency: {
      type: String,
      required: [true, 'Frequency is required'], // e.g. "Twice daily"
      trim: true,
    },
    doseTimes: {
      type: [String], // e.g. ["09:00", "21:00"]
      default: ['09:00'],
    },
    mealRelation: {
      type: String,
      enum: ['before_meal', 'after_meal', 'with_meal', 'anytime'],
      default: 'after_meal',
    },
    durationDays: {
      type: Number,
      default: 7,
    },
    instructions: {
      type: String,
      trim: true,
      default: '',
    },
  },
  { _id: true }
);

const doseLogSchema = new mongoose.Schema(
  {
    date: {
      type: String, // YYYY-MM-DD
      required: true,
    },
    medicationIndex: {
      type: Number,
      required: true,
    },
    medicineName: {
      type: String,
      required: true,
    },
    dosage: {
      type: String,
      default: '',
    },
    scheduledTime: {
      type: String, // HH:MM
      required: true,
    },
    mealRelation: {
      type: String,
      default: 'after_meal',
    },
    status: {
      type: String,
      enum: ['pending', 'taken', 'skipped', 'overdue'],
      default: 'pending',
    },
    takenAt: {
      type: Date,
      default: null,
    },
  },
  { _id: true }
);

const prescriptionSchema = new mongoose.Schema(
  {
    patientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Patient ID is required'],
      index: true,
    },
    doctorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'DoctorProfile',
      required: [true, 'Doctor ID is required'],
      index: true,
    },
    doctorName: {
      type: String,
      default: 'Attending Clinician',
    },
    appointmentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Appointment',
      default: null,
    },
    diagnosis: {
      type: String,
      required: [true, 'Diagnosis is required'],
      trim: true,
    },
    medications: [medicationItemSchema],
    startDate: {
      type: String, // YYYY-MM-DD
      required: true,
    },
    endDate: {
      type: String, // YYYY-MM-DD
      required: true,
    },
    status: {
      type: String,
      enum: ['active', 'completed', 'discontinued'],
      default: 'active',
      index: true,
    },
    doseLogs: [doseLogSchema],
    notes: {
      type: String,
      default: '',
    },
  },
  {
    timestamps: true,
  }
);

prescriptionSchema.index({ patientId: 1, status: 1, startDate: -1 });
prescriptionSchema.index({ patientId: 1, status: 1, createdAt: -1 });
prescriptionSchema.index({ patientId: 1, createdAt: -1 });
prescriptionSchema.index({ patientId: 1, 'doseLogs.date': 1 });

const Prescription = mongoose.models.Prescription || mongoose.model('Prescription', prescriptionSchema);
export default Prescription;
