import mongoose from 'mongoose';

const hospitalSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Hospital name is required'],
      trim: true,
      index: true,
    },
    code: {
      type: String,
      unique: true,
      sparse: true,
      uppercase: true,
      trim: true,
      index: true,
    },
    type: {
      type: String,
      enum: ['hospital', 'clinic'],
      default: 'hospital',
      index: true,
    },
    address: {
      street: { type: String, default: '' },
      city: { type: String, default: 'New Delhi' },
      state: { type: String, default: 'Delhi' },
      pincode: { type: String, default: '110001' },
      fullAddress: { type: String, required: true },
    },
    location: {
      lat: { type: Number, default: 28.6139 },
      lng: { type: Number, default: 77.2090 },
    },
    contact: {
      phone: { type: String, required: true },
      email: { type: String, lowercase: true, trim: true },
      emergencyHelpline: { type: String, default: '102' },
      website: { type: String, default: '' },
    },
    departments: {
      type: [String],
      default: ['OPD', 'Emergency', 'Cardiology', 'General Medicine', 'Neurology', 'Orthopedics'],
    },
    workingHours: {
      openTime: { type: String, default: '08:00' },
      closeTime: { type: String, default: '20:00' },
      days: {
        type: [String],
        default: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'],
      },
      emergency24x7: { type: Boolean, default: true },
    },
    appointmentSchedules: {
      slotDurationMinutes: { type: Number, default: 30 },
      advanceBookingDays: { type: Number, default: 14 },
      startSlotTime: { type: String, default: '09:00' },
      endSlotTime: { type: String, default: '18:00' },
    },
    services: {
      type: [String],
      default: ['OPD Consultations', 'Diagnostics', 'Emergency Care', 'Pharmacy'],
    },
    rating: {
      type: Number,
      default: 4.8,
      min: 0,
      max: 5,
    },
    reviewCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    reviews: [
      {
        patientName: { type: String, default: 'Patient' },
        rating: { type: Number, min: 1, max: 5 },
        comment: { type: String, default: '' },
        date: { type: Date, default: Date.now },
      },
    ],
    availabilityStatus: {
      type: String,
      enum: ['available', 'busy', 'emergency_only', 'closed'],
      default: 'available',
      index: true,
    },
    isAcceptingPatients: {
      type: Boolean,
      default: true,
      index: true,
    },
    verificationStatus: {
      type: String,
      enum: ['pending', 'verified', 'rejected'],
      default: 'verified',
      index: true,
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
    adminUserIds: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
      },
    ],
    facilities: {
      type: [String],
      default: ['ICU', 'Pharmacy', 'Ambulance', 'Laboratory', 'Radiology'],
    },
    totalBeds: {
      type: Number,
      default: 200,
    },
    availableBeds: {
      type: Number,
      default: 45,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

hospitalSchema.virtual('organizationId').get(function () {
  return this.code;
});

hospitalSchema.index({ 'address.city': 1, verificationStatus: 1 });
hospitalSchema.index({ type: 1, isActive: 1, availabilityStatus: 1 });

const Hospital = mongoose.models.Hospital || mongoose.model('Hospital', hospitalSchema);
export default Hospital;
