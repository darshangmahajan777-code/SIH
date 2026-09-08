import mongoose from 'mongoose';
import DoctorProfile from '../models/DoctorProfile.js';
import Appointment from '../models/Appointment.js';
import Token from '../models/Token.js';
import User from '../models/User.js';
import { generateToken, cancelToken } from './queueService.js';
import { AppError } from '../middleware/errorHandler.js';

/**
 * Helper to convert "HH:MM" to minutes from midnight
 */
export function timeToMinutes(timeStr) {
  if (!timeStr || typeof timeStr !== 'string') return 0;
  const [h, m] = timeStr.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

/**
 * Helper to convert minutes from midnight back to "HH:MM"
 */
export function minutesToTime(minutes) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/**
 * Get day of week in lowercase ('monday', 'tuesday', ...)
 */
export function getDayOfWeek(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  return days[d.getDay()];
}

/**
 * Check if a date falls within any of doctor's leave periods
 */
export function isDoctorOnLeave(leaves = [], dateStr) {
  const target = new Date(dateStr + 'T00:00:00').getTime();
  return leaves.find((leave) => {
    const start = new Date(leave.startDate).setHours(0, 0, 0, 0);
    const end = new Date(leave.endDate).setHours(23, 59, 59, 999);
    return target >= start && target <= end;
  });
}

/**
 * Check if a date is in doctor's holidays list
 */
export function isDoctorHoliday(holidays = [], dateStr) {
  const target = new Date(dateStr + 'T00:00:00').toDateString();
  return holidays.some((h) => new Date(h).toDateString() === target);
}

/**
 * Generate all theoretical time slots for a doctor on a given day,
 * subtracting breaks and filtering past slots if date is today.
 */
export function generateDaySlots({
  startTime = '09:00',
  endTime = '17:00',
  slotDuration = 30,
  breaks = [],
  dateStr,
}) {
  const startMin = timeToMinutes(startTime);
  const endMin = timeToMinutes(endTime);
  const duration = Math.max(5, slotDuration);

  // Parse breaks into minute intervals
  const breakIntervals = (breaks || []).map((b) => ({
    start: timeToMinutes(b.startTime),
    end: timeToMinutes(b.endTime),
    reason: b.reason || 'Break',
  }));

  // Determine if date is today
  const todayStr = new Date().toISOString().slice(0, 10);
  const isToday = dateStr === todayStr;
  const currentNowMinutes = isToday
    ? new Date().getHours() * 60 + new Date().getMinutes()
    : -1;

  const slots = [];
  for (let m = startMin; m + duration <= endMin; m += duration) {
    const slotStart = m;
    const slotEnd = m + duration;
    const slotTimeStr = minutesToTime(slotStart);

    // Check break overlap
    const inBreak = breakIntervals.some((b) => slotStart < b.end && slotEnd > b.start);
    if (inBreak) {
      continue; // Exclude break times
    }

    // Check if slot has already passed for today
    const isPast = isToday && slotStart < currentNowMinutes;

    slots.push({
      time: slotTimeStr,
      duration,
      isPast,
    });
  }

  return slots;
}

/**
 * Compute real-time daily availability for a doctor on a specific date,
 * checking leaves, holidays, day schedule, and existing appointments.
 */
export const getDoctorAvailability = async (doctorId, dateStr) => {
  const doctor = await DoctorProfile.findById(doctorId).lean();
  if (!doctor) {
    throw new AppError('Doctor not found', 404);
  }

  // 1. Check Leave
  const leave = isDoctorOnLeave(doctor.leaves, dateStr);
  if (leave) {
    return {
      doctorId: doctor._id,
      doctorName: doctor.doctorName,
      date: dateStr,
      isAvailable: false,
      reason: `Doctor is on leave: ${leave.reason || 'Scheduled leave'}`,
      openSlotsCount: 0,
      totalSlotsCount: 0,
      slots: [],
    };
  }

  // 2. Check Holiday
  if (isDoctorHoliday(doctor.holidays, dateStr)) {
    return {
      doctorId: doctor._id,
      doctorName: doctor.doctorName,
      date: dateStr,
      isAvailable: false,
      reason: 'Doctor unavailable on holiday',
      openSlotsCount: 0,
      totalSlotsCount: 0,
      slots: [],
    };
  }

  // 3. Check Weekly Day Schedule
  const dayName = getDayOfWeek(dateStr);
  const schedule = (doctor.weeklySchedule || []).find((s) => s.day === dayName);

  if (!schedule || !schedule.isWorking) {
    return {
      doctorId: doctor._id,
      doctorName: doctor.doctorName,
      date: dateStr,
      isAvailable: false,
      reason: `Doctor does not work on ${dayName}s`,
      openSlotsCount: 0,
      totalSlotsCount: 0,
      slots: [],
    };
  }

  // 4. Generate theoretical slots
  const theoreticalSlots = generateDaySlots({
    startTime: schedule.startTime || '09:00',
    endTime: schedule.endTime || '17:00',
    slotDuration: doctor.slotDuration || 30,
    breaks: schedule.breaks || [],
    dateStr,
  });

  // 5. Query active booked appointments from database (Real-Time Slot Validity)
  const activeAppointments = await Appointment.find({
    doctorId: doctor._id,
    date: dateStr,
    status: { $ne: 'cancelled' },
  }).select('slotTime status').lean();

  const bookedSlotTimes = new Set(activeAppointments.map((a) => a.slotTime));

  // 6. Map slots with live status
  const slotsWithStatus = theoreticalSlots.map((slot) => {
    const isBooked = bookedSlotTimes.has(slot.time);
    const isAvailable = !isBooked && !slot.isPast;

    return {
      time: slot.time,
      duration: slot.duration,
      isBooked,
      isPast: slot.isPast,
      isAvailable,
      mode: schedule.videoEnabled ? 'both' : 'in-person',
    };
  });

  const openSlots = slotsWithStatus.filter((s) => s.isAvailable);

  return {
    doctorId: doctor._id,
    doctorName: doctor.doctorName,
    specialty: doctor.specialty,
    consultationFee: doctor.consultationFee,
    avgRating: doctor.avgRating,
    ratingCount: doctor.ratingCount,
    location: doctor.location,
    date: dateStr,
    day: dayName,
    isAvailable: openSlots.length > 0,
    openSlotsCount: openSlots.length,
    totalSlotsCount: slotsWithStatus.length,
    videoEnabled: schedule.videoEnabled || false,
    slots: slotsWithStatus,
  };
};

/**
 * Daily Listing: get all doctors and their availability on a given date
 */
export const getDailyListing = async ({ dateStr, specialty, maxFee }) => {
  const query = { isActive: true };
  if (specialty) {
    query.specialty = new RegExp(`^${specialty}$`, 'i');
  }
  if (maxFee) {
    query.consultationFee = { $lte: Number(maxFee) };
  }

  const doctors = await DoctorProfile.find(query).lean();

  // Compute live availability for each doctor on that date
  const listing = await Promise.all(
    doctors.map(async (doc) => {
      try {
        const avail = await getDoctorAvailability(doc._id, dateStr);
        return {
          id: doc._id,
          name: doc.doctorName,
          specialty: doc.specialty,
          hospitalName: doc.hospitalName,
          consultationFee: doc.consultationFee,
          avgRating: doc.avgRating || 0,
          ratingCount: doc.ratingCount || 0,
          location: doc.location,
          isAvailable: avail.isAvailable,
          reason: avail.reason || null,
          openSlotsCount: avail.openSlotsCount,
          totalSlotsCount: avail.totalSlotsCount,
          videoEnabled: avail.videoEnabled,
          openSlots: avail.slots ? avail.slots.filter((s) => s.isAvailable).map((s) => s.time) : [],
        };
      } catch (err) {
        return {
          id: doc._id,
          name: doc.doctorName,
          specialty: doc.specialty,
          isAvailable: false,
          openSlotsCount: 0,
        };
      }
    })
  );

  return listing;
};

/**
 * Server-Enforced Slot Booking with Atomic Double-Booking Prevention
 */
export const bookAppointmentSlot = async ({
  doctorId,
  patientId,
  date,
  slotTime,
  mode = 'in-person',
  priority = 'routine',
  chiefComplaint = '',
}) => {
  if (!doctorId || !patientId || !date || !slotTime) {
    throw new AppError('Doctor, patient, date, and slot time are required', 400);
  }

  // 1. Verify doctor availability on that date/slot
  const avail = await getDoctorAvailability(doctorId, date);
  if (!avail.isAvailable && avail.openSlotsCount === 0) {
    throw new AppError(avail.reason || 'Doctor is not available on this date', 400);
  }

  const targetSlot = (avail.slots || []).find((s) => s.time === slotTime);
  if (!targetSlot) {
    throw new AppError(`Slot ${slotTime} is not a valid working slot for this doctor`, 400);
  }

  if (targetSlot.isBooked) {
    throw new AppError(`Slot ${slotTime} is already booked by another patient`, 409);
  }

  if (targetSlot.isPast) {
    throw new AppError(`Slot ${slotTime} has already passed`, 400);
  }

  // 2. Same-day token integration using the authoritative queue engine
  const todayStr = new Date().toISOString().slice(0, 10);
  let tokenId = null;
  if (date === todayStr) {
    try {
      const patient = await User.findById(patientId).select('name age').lean();
      const patientName = patient?.name || 'Patient (Appointment)';
      const patientAge = patient?.age || null;

      // Priority mapping: routine -> general, urgent -> senior, critical -> emergency
      const mappedPriority =
        priority === 'critical' ? 'emergency' : priority === 'urgent' ? 'senior' : 'general';

      // Call authoritative queue service (same pattern as Reception!)
      const token = await generateToken({
        patientName,
        age: patientAge,
        condition: chiefComplaint || 'Consultation',
        priority: mappedPriority,
        department: 'OPD',
      });

      if (token && token._id) {
        tokenId = token._id;
      }
    } catch (tokenErr) {
      console.warn('Queue token creation error:', tokenErr.message);
    }
  }

  // 3. Create appointment; database unique index catches any concurrent race condition
  try {
    const appointment = await Appointment.create({
      doctorId,
      patientId,
      date,
      slotTime,
      mode,
      priority,
      status: 'booked',
      tokenId,
      chiefComplaint,
    });

    return appointment;
  } catch (dbErr) {
    if (dbErr.code === 11000) {
      throw new AppError(`Slot ${slotTime} on ${date} was just booked by another patient`, 409);
    }
    throw dbErr;
  }
};

/**
 * Cancel an appointment — immediately frees the slot and cancels linked Token
 */
export const cancelAppointment = async ({ appointmentId, userId, reason = 'Cancelled by patient' }) => {
  const appointment = await Appointment.findById(appointmentId);
  if (!appointment) {
    throw new AppError('Appointment not found', 404);
  }

  if (appointment.status === 'cancelled') {
    throw new AppError('Appointment is already cancelled', 400);
  }

  if (appointment.status === 'completed') {
    throw new AppError('Completed appointments cannot be cancelled', 400);
  }

  // Authorize: patient or doctor
  if (userId && appointment.patientId.toString() !== userId.toString()) {
    // Check if user is the doctor
    const doctor = await DoctorProfile.findById(appointment.doctorId);
    if (!doctor || doctor.userId?.toString() !== userId.toString()) {
      throw new AppError('Not authorized to cancel this appointment', 403);
    }
  }

  appointment.status = 'cancelled';
  appointment.cancellationReason = reason;
  await appointment.save();

  // If appointment had an active token, cancel via authoritative queueService
  if (appointment.tokenId) {
    try {
      await cancelToken(appointment.tokenId);
    } catch (err) {
      await Token.findByIdAndUpdate(appointment.tokenId, { status: 'cancelled' });
    }
  }

  return appointment;
};

/**
 * Check in an appointment for today:
 * Advances status to 'checked-in' and generates a Token if not already linked
 */
export const checkInAppointment = async (appointmentId) => {
  const appointment = await Appointment.findById(appointmentId);
  if (!appointment) {
    throw new AppError('Appointment not found', 404);
  }

  if (['cancelled', 'completed', 'no-show'].includes(appointment.status)) {
    throw new AppError(`Cannot check in an appointment with status ${appointment.status}`, 400);
  }

  const todayStr = new Date().toISOString().slice(0, 10);
  if (appointment.date !== todayStr) {
    throw new AppError('Appointments can only be checked in on the day of the appointment', 400);
  }

  // If token not yet created (e.g. booked earlier for today), create it now
  if (!appointment.tokenId) {
    const patient = await User.findById(appointment.patientId).select('name age').lean();
    const mappedPriority =
      appointment.priority === 'critical'
        ? 'emergency'
        : appointment.priority === 'urgent'
        ? 'senior'
        : 'general';

    const token = await generateToken({
      patientName: patient?.name || 'Patient (Appointment)',
      age: patient?.age || null,
      condition: appointment.chiefComplaint || 'Consultation',
      priority: mappedPriority,
      department: 'OPD',
    });

    if (token) {
      appointment.tokenId = token._id;
    }
  }

  appointment.status = 'checked-in';
  await appointment.save();

  return appointment;
};

/**
 * Update appointment status with progression checks
 */
export const updateAppointmentStatus = async (appointmentId, newStatus) => {
  const validStatuses = ['booked', 'checked-in', 'in-progress', 'completed', 'cancelled', 'no-show'];
  if (!validStatuses.includes(newStatus)) {
    throw new AppError(`Invalid status. Must be one of: ${validStatuses.join(', ')}`, 400);
  }

  if (newStatus === 'checked-in') {
    return await checkInAppointment(appointmentId);
  }

  if (newStatus === 'cancelled') {
    return await cancelAppointment({ appointmentId });
  }

  const appointment = await Appointment.findById(appointmentId);
  if (!appointment) {
    throw new AppError('Appointment not found', 404);
  }

  appointment.status = newStatus;
  await appointment.save();

  return appointment;
};

/**
 * Reschedule an appointment — atomically frees the old slot and books the new slot
 */
export const rescheduleAppointment = async ({ appointmentId, newDate, newSlotTime, userId }) => {
  const appointment = await Appointment.findById(appointmentId);
  if (!appointment) {
    throw new AppError('Appointment not found', 404);
  }

  if (appointment.status === 'cancelled') {
    throw new AppError('Cannot reschedule a cancelled appointment. Please book a new slot.', 400);
  }

  if (appointment.status === 'completed') {
    throw new AppError('Cannot reschedule a completed appointment', 400);
  }

  if (userId && appointment.patientId.toString() !== userId.toString()) {
    throw new AppError('Not authorized to reschedule this appointment', 403);
  }

  // 1. Verify availability of the new slot
  const newAvail = await getDoctorAvailability(appointment.doctorId, newDate);
  const targetSlot = (newAvail.slots || []).find((s) => s.time === newSlotTime);
  if (!targetSlot || !targetSlot.isAvailable) {
    throw new AppError(`The new slot ${newSlotTime} on ${newDate} is not available`, 409);
  }

  // 2. Mark current appointment as cancelled (rescheduled)
  appointment.status = 'cancelled';
  appointment.cancellationReason = `Rescheduled to ${newDate} at ${newSlotTime}`;
  await appointment.save();

  // 3. Book the new slot with reference to previous appointment
  try {
    const newAppointment = await Appointment.create({
      doctorId: appointment.doctorId,
      patientId: appointment.patientId,
      date: newDate,
      slotTime: newSlotTime,
      mode: appointment.mode,
      priority: appointment.priority,
      status: 'booked',
      chiefComplaint: appointment.chiefComplaint,
      rescheduledFrom: appointment._id,
    });

    return {
      previousAppointment: appointment,
      newAppointment,
    };
  } catch (err) {
    // Rollback previous appointment if new booking fails
    appointment.status = 'booked';
    appointment.cancellationReason = null;
    await appointment.save();

    if (err.code === 11000) {
      throw new AppError(`The new slot ${newSlotTime} on ${newDate} was just booked by someone else`, 409);
    }
    throw err;
  }
};
