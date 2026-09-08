import mongoose from 'mongoose';

const appointmentSchema = new mongoose.Schema(
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
    date: {
      type: String, // Stored as standard YYYY-MM-DD for reliable day matching
      required: [true, 'Appointment date is required'],
      index: true,
    },
    slotTime: {
      type: String, // e.g. "09:30"
      required: [true, 'Slot time is required'],
    },
    mode: {
      type: String,
      enum: ['in-person', 'video'],
      default: 'in-person',
    },
    status: {
      type: String,
      enum: ['booked', 'checked-in', 'in-progress', 'completed', 'cancelled', 'no-show'],
      default: 'booked',
      index: true,
    },
    priority: {
      type: String,
      enum: ['routine', 'urgent', 'critical'],
      default: 'routine',
    },
    tokenId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Token',
      default: null,
    },
    chiefComplaint: {
      type: String,
      trim: true,
      default: '',
    },
    cancellationReason: {
      type: String,
      trim: true,
      default: null,
    },
    rescheduledFrom: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Appointment',
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// Enforce unique active slot per doctor on that date/time
// Cancelled appointments do NOT block the slot!
appointmentSchema.index(
  { doctorId: 1, date: 1, slotTime: 1 },
  {
    unique: true,
    partialFilterExpression: { status: { $ne: 'cancelled' } },
  }
);

const Appointment = mongoose.models.Appointment || mongoose.model('Appointment', appointmentSchema);
export default Appointment;
