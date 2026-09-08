import mongoose from 'mongoose';

const breakSchema = new mongoose.Schema(
  {
    startTime: { type: String, required: true }, // e.g. "13:00"
    endTime: { type: String, required: true },   // e.g. "14:00"
    reason: { type: String, default: 'Break' },
  },
  { _id: false }
);

const dayScheduleSchema = new mongoose.Schema(
  {
    day: {
      type: String,
      required: true,
      enum: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'],
    },
    isWorking: { type: Boolean, default: true },
    startTime: { type: String, default: '09:00' },
    endTime: { type: String, default: '17:00' },
    breaks: [breakSchema],
    videoEnabled: { type: Boolean, default: false },
  },
  { _id: false }
);

const leaveSchema = new mongoose.Schema(
  {
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    reason: { type: String, default: 'Leave' },
  },
  { _id: false }
);

const doctorProfileSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    doctorName: {
      type: String,
      required: true,
      trim: true,
    },
    specialty: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    qualifications: {
      type: [String],
      default: [],
    },
    experienceYears: {
      type: Number,
      default: 0,
    },
    hospitalName: {
      type: String,
      required: true,
      trim: true,
    },
    location: {
      lat: { type: Number, default: 28.6139 },
      lng: { type: Number, default: 77.2090 },
      address: { type: String, default: '' },
    },
    consultationFee: {
      type: Number,
      default: 500,
      min: [0, 'Fee cannot be negative'],
    },
    followUpFee: {
      type: Number,
      default: 300,
      min: [0, 'Fee cannot be negative'],
    },
    avgRating: {
      type: Number,
      default: 0,
      min: 0,
      max: 5,
    },
    ratingCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    slotDuration: {
      type: Number,
      default: 30, // in minutes
      min: [5, 'Slot duration must be at least 5 minutes'],
      max: [120, 'Slot duration cannot exceed 120 minutes'],
    },
    weeklySchedule: {
      type: [dayScheduleSchema],
      default: () => [
        { day: 'monday', isWorking: true, startTime: '09:00', endTime: '17:00', breaks: [{ startTime: '13:00', endTime: '14:00', reason: 'Lunch' }] },
        { day: 'tuesday', isWorking: true, startTime: '09:00', endTime: '17:00', breaks: [{ startTime: '13:00', endTime: '14:00', reason: 'Lunch' }] },
        { day: 'wednesday', isWorking: true, startTime: '09:00', endTime: '17:00', breaks: [{ startTime: '13:00', endTime: '14:00', reason: 'Lunch' }] },
        { day: 'thursday', isWorking: true, startTime: '09:00', endTime: '17:00', breaks: [{ startTime: '13:00', endTime: '14:00', reason: 'Lunch' }] },
        { day: 'friday', isWorking: true, startTime: '09:00', endTime: '17:00', breaks: [{ startTime: '13:00', endTime: '14:00', reason: 'Lunch' }] },
        { day: 'saturday', isWorking: false, startTime: '09:00', endTime: '13:00', breaks: [] },
        { day: 'sunday', isWorking: false, startTime: '09:00', endTime: '13:00', breaks: [] },
      ],
    },
    leaves: {
      type: [leaveSchema],
      default: [],
    },
    holidays: {
      type: [Date],
      default: [],
    },
    videoEnabled: {
      type: Boolean,
      default: false,
    },
    isAvailableToday: {
      type: Boolean,
      default: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

doctorProfileSchema.index({ specialty: 1, avgRating: -1 });

const DoctorProfile = mongoose.models.DoctorProfile || mongoose.model('DoctorProfile', doctorProfileSchema);
export default DoctorProfile;
