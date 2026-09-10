import mongoose from 'mongoose';
import DoctorProfile from '../models/DoctorProfile.js';
import Appointment from '../models/Appointment.js';
import Token from '../models/Token.js';
import { checkInAppointment } from './scheduleService.js';
import { emitOperationalPatientCheckIn } from '../socketHandler.js';
import { AppError } from '../middleware/errorHandler.js';

// In-memory test store
let inMemoryReceptionDoctors = [];
let inMemoryReceptionAppointments = [];

export function clearReceptionTestDb() {
  inMemoryReceptionDoctors = [];
  inMemoryReceptionAppointments = [];
}

export function seedReceptionTestDb({ doctors = [], appointments = [] } = {}) {
  if (doctors.length) inMemoryReceptionDoctors = [...doctors];
  if (appointments.length) inMemoryReceptionAppointments = [...appointments];
}

/**
 * Get real-time doctor availability status for Reception desk
 */
export async function getReceptionDoctorsAvailability({ hospitalId = null } = {}) {
  const isConnected = mongoose.connection.readyState === 1;

  if (isConnected) {
    const query = { isActive: true };
    if (hospitalId) {
      query.hospitalId = hospitalId;
    }

    const doctors = await DoctorProfile.find(query)
      .select('doctorName specialty hospitalName hospitalId availabilityStatus isAvailableToday')
      .lean();

    // Fetch in-progress tokens to see active serving tokens per doctor
    const today = new Date().toISOString().slice(0, 10);
    const inProgressTokens = await Token.find({
      sessionDate: today,
      status: 'in-progress',
    }).select('tokenNumber doctorId patientName').lean();

    const tokenMap = new Map();
    inProgressTokens.forEach((t) => {
      if (t.doctorId) tokenMap.set(String(t.doctorId), t.tokenNumber);
    });

    return doctors.map((doc) => {
      const status = doc.availabilityStatus || (doc.isAvailableToday ? 'available' : 'offline');
      return {
        doctorId: doc._id,
        doctorName: doc.doctorName,
        specialty: doc.specialty,
        hospitalName: doc.hospitalName,
        hospitalId: doc.hospitalId,
        availabilityStatus: status,
        isAvailableToday: status === 'available',
        currentServingToken: tokenMap.get(String(doc._id)) || null,
      };
    });
  }

  // In-memory fallback
  return inMemoryReceptionDoctors
    .filter((d) => !hospitalId || String(d.hospitalId) === String(hospitalId))
    .map((doc) => {
      const status = doc.availabilityStatus || (doc.isAvailableToday ? 'available' : 'offline');
      return {
        doctorId: doc._id || doc.doctorId,
        doctorName: doc.doctorName || 'Doctor',
        specialty: doc.specialty || 'General',
        hospitalName: doc.hospitalName || 'Hospital',
        hospitalId: doc.hospitalId || null,
        availabilityStatus: status,
        isAvailableToday: status === 'available',
        currentServingToken: doc.currentServingToken || null,
      };
    });
}

/**
 * Get operational appointments for Reception with STRICT CLINICAL DATA SHIELDING.
 * Explicitly scrubs and omits diagnoses, chief complaints, medical histories, and clinical notes.
 */
export async function getReceptionAppointments({ hospitalId = null, date } = {}) {
  const targetDate = date || new Date().toISOString().slice(0, 10);
  const isConnected = mongoose.connection.readyState === 1;

  let appointments = [];
  if (isConnected) {
    const query = { date: targetDate };
    if (hospitalId) {
      query.hospitalId = hospitalId;
    }

    appointments = await Appointment.find(query)
      .populate('doctorId', 'doctorName specialty hospitalName')
      .populate('patientId', 'name phone')
      .populate('tokenId', 'tokenNumber status estimatedWaitTime priority')
      .sort({ slotTime: 1 })
      .lean();
  } else {
    appointments = inMemoryReceptionAppointments.filter(
      (a) => a.date === targetDate && (!hospitalId || String(a.hospitalId) === String(hospitalId))
    );
  }

  // STRICT CLINICAL DATA SCRUBBING
  // Return ONLY operational fields needed by front desk:
  return appointments.map((apt, index) => {
    const patientName = apt.patientId?.name || apt.patientName || 'Patient';
    const patientPhone = apt.patientId?.phone || apt.patientPhone || '';
    const doctorName = apt.doctorId?.doctorName || apt.doctorName || 'Dr. Specialist';
    const doctorSpecialty = apt.doctorId?.specialty || apt.specialty || 'OPD';
    const tokenNumber = apt.tokenId?.tokenNumber || apt.tokenNumber || null;
    const isCheckedIn = apt.status === 'checked-in' || apt.status === 'in-progress' || apt.status === 'completed';

    return {
      _id: apt._id,
      patientName,
      patientPhone,
      date: apt.date,
      slotTime: apt.slotTime,
      mode: apt.mode || 'in-person',
      status: apt.status || 'booked',
      priority: apt.priority || 'routine',
      checkInStatus: isCheckedIn ? 'Checked-In' : 'Not Arrived',
      checkInTime: apt.checkInTime || (isCheckedIn ? apt.updatedAt : null),
      doctorId: apt.doctorId?._id || apt.doctorId,
      doctorName,
      doctorSpecialty,
      tokenNumber,
      queuePosition: apt.status === 'waiting' || apt.status === 'checked-in' ? index + 1 : null,
      estimatedWaitTime: apt.tokenId?.estimatedWaitTime || (index + 1) * 15,
      // PRIVACY ENFORCEMENT: Note that chiefComplaint, diagnosis, prescriptions, testOrders are NEVER included!
    };
  });
}

/**
 * Check-in arriving patient at Reception desk
 */
export async function checkInPatientAtReception({ appointmentId, hospitalId = null } = {}) {
  const isConnected = mongoose.connection.readyState === 1;
  let updatedAppointment = null;

  if (isConnected && mongoose.Types.ObjectId.isValid(appointmentId)) {
    updatedAppointment = await checkInAppointment(appointmentId);
  } else {
    // In-memory fallback
    const apt = inMemoryReceptionAppointments.find((a) => String(a._id) === String(appointmentId));
    if (!apt) {
      throw new AppError('Appointment not found', 404);
    }
    apt.status = 'checked-in';
    apt.checkInTime = new Date().toISOString();
    updatedAppointment = {
      ...apt,
      updatedAt: apt.checkInTime,
    };
  }

  // Emit real-time operational check-in event
  try {
    emitOperationalPatientCheckIn({
      appointmentId: updatedAppointment._id,
      patientName: updatedAppointment.patientId?.name || updatedAppointment.patientName || 'Patient',
      tokenNumber: updatedAppointment.tokenId?.tokenNumber || updatedAppointment.tokenNumber,
      doctorId: updatedAppointment.doctorId?._id || updatedAppointment.doctorId,
      slotTime: updatedAppointment.slotTime,
      hospitalId: hospitalId || updatedAppointment.hospitalId || null,
    });
  } catch (sockErr) {
    console.warn('Socket operational check-in emit skipped:', sockErr.message);
  }

  // Return scrubbed operational appointment
  return {
    _id: updatedAppointment._id,
    patientName: updatedAppointment.patientId?.name || updatedAppointment.patientName || 'Patient',
    slotTime: updatedAppointment.slotTime,
    status: updatedAppointment.status,
    checkInStatus: 'Checked-In',
    checkInTime: updatedAppointment.checkInTime || new Date().toISOString(),
    tokenNumber: updatedAppointment.tokenId?.tokenNumber || updatedAppointment.tokenNumber || null,
    doctorId: updatedAppointment.doctorId?._id || updatedAppointment.doctorId,
  };
}
