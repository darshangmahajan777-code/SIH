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
    },
    departments: {
      type: [String],
      default: ['OPD', 'Emergency', 'Cardiology', 'General Medicine', 'Neurology', 'Orthopedics'],
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
  }
);

hospitalSchema.index({ 'address.city': 1, verificationStatus: 1 });

const Hospital = mongoose.models.Hospital || mongoose.model('Hospital', hospitalSchema);
export default Hospital;
