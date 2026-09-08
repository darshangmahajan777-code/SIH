import mongoose from 'mongoose';
import Rating from '../models/Rating.js';
import Appointment from '../models/Appointment.js';
import DoctorProfile from '../models/DoctorProfile.js';
import { AppError } from '../middleware/errorHandler.js';

/**
 * Recalculate and update average rating and review count on DoctorProfile
 * @param {string|mongoose.Types.ObjectId} doctorId 
 * @returns {Promise<{ avgRating: number, ratingCount: number }>}
 */
export const recalculateDoctorRating = async (doctorId) => {
  const docId = typeof doctorId === 'string' ? new mongoose.Types.ObjectId(doctorId) : doctorId;

  const stats = await Rating.aggregate([
    { $match: { doctorId: docId } },
    {
      $group: {
        _id: '$doctorId',
        ratingCount: { $sum: 1 },
        avgRating: { $avg: '$rating' },
      },
    },
  ]);

  const ratingCount = stats.length > 0 ? stats[0].ratingCount : 0;
  const avgRating = stats.length > 0 ? Math.round(stats[0].avgRating * 10) / 10 : 0;

  await DoctorProfile.findByIdAndUpdate(
    docId,
    { avgRating, ratingCount },
    { new: true }
  );

  return { avgRating, ratingCount };
};

/**
 * Submit or update a rating for a doctor
 * @param {Object} params
 * @param {string} params.appointmentId
 * @param {string} params.patientId
 * @param {number} params.rating
 * @param {string} [params.comment]
 */
export const submitRating = async ({ appointmentId, patientId, rating, comment = '' }) => {
  const numericRating = Number(rating);
  if (!numericRating || numericRating < 1 || numericRating > 5 || !Number.isInteger(numericRating)) {
    throw new AppError('Rating must be an integer between 1 and 5 stars', 400);
  }

  // 1. Fetch appointment
  const appointment = await Appointment.findById(appointmentId);
  if (!appointment) {
    throw new AppError('Appointment not found', 404);
  }

  // 2. Only completed appointments can be rated
  if (appointment.status !== 'completed') {
    throw new AppError('A patient can rate a doctor only after a completed appointment with that doctor', 403);
  }

  // 3. Verify that the user submitting the rating is the patient of this appointment
  if (appointment.patientId.toString() !== patientId.toString()) {
    throw new AppError('You are not authorized to rate this appointment', 403);
  }

  // 4. Prevent doctors from rating themselves
  const doctor = await DoctorProfile.findById(appointment.doctorId);
  if (!doctor) {
    throw new AppError('Doctor profile not found', 404);
  }
  if (doctor.userId && doctor.userId.toString() === patientId.toString()) {
    throw new AppError('Doctors cannot rate themselves', 403);
  }

  // 5. Submit or update (upsert) to prevent unlimited reviews per appointment
  let review = await Rating.findOne({ appointmentId: appointment._id });
  let isNew = false;

  if (review) {
    review.rating = numericRating;
    review.comment = (comment || '').trim();
    await review.save();
  } else {
    isNew = true;
    review = await Rating.create({
      appointmentId: appointment._id,
      patientId,
      doctorId: doctor._id,
      rating: numericRating,
      comment: (comment || '').trim(),
    });
  }

  // 6. Safely recalculate aggregation
  const aggregates = await recalculateDoctorRating(doctor._id);

  return {
    review,
    isNew,
    doctorStats: aggregates,
  };
};

/**
 * Fetch reviews for a doctor with summary metrics
 * @param {string} doctorId
 * @param {number} page
 * @param {number} limit
 */
export const getDoctorRatings = async (doctorId, page = 1, limit = 20) => {
  const skip = (page - 1) * limit;

  const [reviews, totalCount, doctor] = await Promise.all([
    Rating.find({ doctorId })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('patientId', 'name')
      .lean(),
    Rating.countDocuments({ doctorId }),
    DoctorProfile.findById(doctorId).select('avgRating ratingCount doctorName specialty').lean(),
  ]);

  if (!doctor) {
    throw new AppError('Doctor not found', 404);
  }

  return {
    doctor: {
      id: doctor._id,
      name: doctor.doctorName,
      specialty: doctor.specialty,
      avgRating: doctor.avgRating || 0,
      ratingCount: doctor.ratingCount || 0,
    },
    totalCount,
    page,
    totalPages: Math.ceil(totalCount / limit) || 1,
    reviews,
  };
};
