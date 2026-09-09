import mongoose from 'mongoose';
import Hospital from '../models/Hospital.js';
import DoctorProfile from '../models/DoctorProfile.js';
import Appointment from '../models/Appointment.js';
import Token from '../models/Token.js';
import User from '../models/User.js';
import { AppError } from '../middleware/errorHandler.js';

// In-memory fallback stores for test isolation
let inMemoryHospitals = [];
let inMemoryDoctors = [];
let inMemoryAppointments = [];
let inMemoryTokens = [];

export function clearHospitalTestDb() {
  inMemoryHospitals = [];
  inMemoryDoctors = [];
  inMemoryAppointments = [];
  inMemoryTokens = [];
}

export function seedHospitalTestDb({
  hospitals = [],
  doctors = [],
  appointments = [],
  tokens = [],
} = {}) {
  if (hospitals.length) {
    hospitals.forEach((h) => {
      const idx = inMemoryHospitals.findIndex((item) => item._id?.toString() === h._id?.toString());
      if (idx >= 0) inMemoryHospitals[idx] = { ...inMemoryHospitals[idx], ...h };
      else inMemoryHospitals.push(h);
    });
  }
  if (doctors.length) {
    doctors.forEach((d) => {
      const idx = inMemoryDoctors.findIndex((item) => item._id?.toString() === d._id?.toString());
      if (idx >= 0) inMemoryDoctors[idx] = { ...inMemoryDoctors[idx], ...d };
      else inMemoryDoctors.push(d);
    });
  }
  if (appointments.length) {
    appointments.forEach((a) => {
      const idx = inMemoryAppointments.findIndex((item) => item._id?.toString() === a._id?.toString());
      if (idx >= 0) inMemoryAppointments[idx] = { ...inMemoryAppointments[idx], ...a };
      else inMemoryAppointments.push(a);
    });
  }
  if (tokens.length) {
    tokens.forEach((t) => {
      const idx = inMemoryTokens.findIndex((item) => item._id?.toString() === t._id?.toString());
      if (idx >= 0) inMemoryTokens[idx] = { ...inMemoryTokens[idx], ...t };
      else inMemoryTokens.push(t);
    });
  }
}

/**
 * Register / Create a new Hospital
 */
export async function createHospital(data) {
  if (!data.name || !data.contact?.phone || !data.address?.fullAddress) {
    throw new AppError('Hospital name, contact phone, and full address are required', 400);
  }

  const isConnected = mongoose.connection.readyState === 1;

  if (isConnected) {
    // Generate code if not provided (e.g. "AIIMS-DELHI" -> "AIIMS-DEL")
    let code = data.code;
    if (!code) {
      const slug = data.name.replace(/[^A-Za-z0-9]/g, '').slice(0, 5).toUpperCase();
      code = `${slug}-${Math.floor(100 + Math.random() * 900)}`;
    }

    const hospital = await Hospital.create({
      ...data,
      code,
      verificationStatus: data.verificationStatus || 'verified',
    });
    return hospital;
  }

  // In-memory fallback
  const newHospital = {
    _id: data._id || 'hosp-' + (inMemoryHospitals.length + 1),
    name: data.name,
    code: data.code || `HOSP-${inMemoryHospitals.length + 1}`,
    address: data.address,
    location: data.location || { lat: 28.6139, lng: 77.2090 },
    contact: data.contact,
    departments: data.departments || ['OPD', 'Emergency', 'Cardiology'],
    verificationStatus: data.verificationStatus || 'verified',
    isActive: data.isActive !== false,
    adminUserIds: data.adminUserIds || [],
    totalBeds: data.totalBeds || 200,
    availableBeds: data.availableBeds || 45,
    createdAt: new Date(),
  };
  inMemoryHospitals.push(newHospital);
  return newHospital;
}

/**
 * Get Hospital by ID
 */
export async function getHospitalById(id) {
  const isConnected = mongoose.connection.readyState === 1;

  if (isConnected) {
    const hospital = await Hospital.findById(id).lean();
    if (!hospital) throw new AppError('Hospital not found', 404);

    const doctorsCount = await DoctorProfile.countDocuments({ hospitalId: id, isActive: true });
    return { ...hospital, doctorsCount };
  }

  // In-memory fallback
  const hosp = inMemoryHospitals.find((h) => h._id?.toString() === id?.toString());
  if (!hosp) throw new AppError('Hospital not found', 404);
  const doctorsCount = inMemoryDoctors.filter((d) => d.hospitalId?.toString() === id?.toString()).length;
  return { ...hosp, doctorsCount };
}

/**
 * List Hospitals with optional search and department filtering
 */
export async function listHospitals({ query = '', department = '', status = '', city = '', limit = 50, skip = 0 } = {}) {
  const isConnected = mongoose.connection.readyState === 1;

  if (isConnected) {
    const filter = { isActive: true };
    if (status) filter.verificationStatus = status;
    if (department) filter.departments = department;
    if (city) filter['address.city'] = new RegExp(city, 'i');
    if (query) {
      filter.$or = [
        { name: new RegExp(query, 'i') },
        { code: new RegExp(query, 'i') },
        { 'address.city': new RegExp(query, 'i') },
      ];
    }

    const hospitals = await Hospital.find(filter)
      .sort({ verificationStatus: 1, name: 1 })
      .skip(Number(skip))
      .limit(Number(limit))
      .lean();

    const count = await Hospital.countDocuments(filter);
    return { count, hospitals };
  }

  // In-memory fallback
  let list = inMemoryHospitals.filter((h) => h.isActive !== false);
  if (status) list = list.filter((h) => h.verificationStatus === status);
  if (department) list = list.filter((h) => h.departments?.includes(department));
  if (city) list = list.filter((h) => h.address?.city?.toLowerCase().includes(city.toLowerCase()));
  if (query) {
    const q = query.toLowerCase();
    list = list.filter(
      (h) =>
        h.name.toLowerCase().includes(q) ||
        h.code?.toLowerCase().includes(q) ||
        h.address?.fullAddress?.toLowerCase().includes(q)
    );
  }

  return { count: list.length, hospitals: list.slice(skip, skip + limit) };
}

/**
 * Update Hospital details
 */
export async function updateHospital(id, updates = {}) {
  const isConnected = mongoose.connection.readyState === 1;

  if (isConnected) {
    const hospital = await Hospital.findByIdAndUpdate(id, { $set: updates }, { new: true, runValidators: true });
    if (!hospital) throw new AppError('Hospital not found', 404);
    return hospital;
  }

  // In-memory fallback
  const hosp = inMemoryHospitals.find((h) => h._id?.toString() === id?.toString());
  if (!hosp) throw new AppError('Hospital not found', 404);
  Object.assign(hosp, updates, { updatedAt: new Date() });
  return hosp;
}

/**
 * Verify Hospital (Platform Admin action)
 */
export async function verifyHospital({ hospitalId, status = 'verified', verifiedBy = null }) {
  if (!['verified', 'pending', 'rejected'].includes(status)) {
    throw new AppError('Invalid verification status', 400);
  }

  const isConnected = mongoose.connection.readyState === 1;

  if (isConnected) {
    const hospital = await Hospital.findByIdAndUpdate(
      hospitalId,
      { verificationStatus: status },
      { new: true }
    );
    if (!hospital) throw new AppError('Hospital not found', 404);
    return hospital;
  }

  // In-memory fallback
  const hosp = inMemoryHospitals.find((h) => h._id?.toString() === hospitalId?.toString());
  if (!hosp) throw new AppError('Hospital not found', 404);
  hosp.verificationStatus = status;
  return hosp;
}

/**
 * Associate a Doctor with a Hospital
 * Updates DoctorProfile.hospitalId and synchronizes DoctorProfile.hospitalName
 */
export async function associateDoctorWithHospital({ doctorId, hospitalId }) {
  const isConnected = mongoose.connection.readyState === 1;

  if (isConnected) {
    const hospital = await Hospital.findById(hospitalId);
    if (!hospital) throw new AppError('Hospital not found', 404);

    const doctor = await DoctorProfile.findByIdAndUpdate(
      doctorId,
      {
        hospitalId: hospital._id,
        hospitalName: hospital.name,
      },
      { new: true }
    );
    if (!doctor) throw new AppError('Doctor not found', 404);
    return doctor;
  }

  // In-memory fallback
  const hosp = inMemoryHospitals.find((h) => h._id?.toString() === hospitalId?.toString());
  if (!hosp) throw new AppError('Hospital not found', 404);

  const doc = inMemoryDoctors.find((d) => d._id?.toString() === doctorId?.toString());
  if (!doc) throw new AppError('Doctor not found', 404);

  doc.hospitalId = hosp._id;
  doc.hospitalName = hosp.name;
  return doc;
}

/**
 * Verify / Reject Doctor credentials within Hospital
 */
export async function verifyDoctorInHospital({ doctorId, hospitalId, status = 'verified' }) {
  if (!['verified', 'pending', 'rejected'].includes(status)) {
    throw new AppError('Invalid doctor verification status', 400);
  }

  const isConnected = mongoose.connection.readyState === 1;

  if (isConnected) {
    const query = { _id: doctorId };
    if (hospitalId) query.hospitalId = hospitalId;

    const doctor = await DoctorProfile.findOneAndUpdate(
      query,
      { verificationStatus: status },
      { new: true }
    );
    if (!doctor) throw new AppError('Doctor not found in this hospital', 404);
    return doctor;
  }

  // In-memory fallback
  const doc = inMemoryDoctors.find((d) => {
    if (d._id?.toString() !== doctorId?.toString()) return false;
    if (hospitalId && d.hospitalId?.toString() !== hospitalId?.toString()) return false;
    return true;
  });
  if (!doc) throw new AppError('Doctor not found in this hospital', 404);
  doc.verificationStatus = status;
  return doc;
}

/**
 * Get all doctors associated with a Hospital
 */
export async function getHospitalDoctors(hospitalId) {
  const isConnected = mongoose.connection.readyState === 1;

  if (isConnected) {
    const doctors = await DoctorProfile.find({ hospitalId, isActive: true })
      .select('doctorName specialty qualifications experienceYears consultationFee avgRating ratingCount hospitalName verificationStatus videoEnabled isAvailableToday')
      .sort({ avgRating: -1 })
      .lean();
    return doctors;
  }

  // In-memory fallback
  return inMemoryDoctors.filter(
    (d) => d.hospitalId?.toString() === hospitalId?.toString() && d.isActive !== false
  );
}

/**
 * Get Hospital-scoped Appointments
 */
export async function getHospitalAppointments({ hospitalId, date, status, limit = 50 }) {
  const isConnected = mongoose.connection.readyState === 1;
  const targetDate = date || new Date().toISOString().slice(0, 10);

  if (isConnected) {
    const filter = { hospitalId, date: targetDate };
    if (status) filter.status = status;

    const appointments = await Appointment.find(filter)
      .populate('patientId', 'name phone email age gender bloodGroup')
      .populate('doctorId', 'doctorName specialty')
      .populate('tokenId', 'tokenNumber status priority')
      .sort({ slotTime: 1 })
      .limit(Number(limit))
      .lean();

    return appointments;
  }

  // In-memory fallback
  return inMemoryAppointments.filter((a) => {
    if (a.hospitalId?.toString() !== hospitalId?.toString()) return false;
    if (date && a.date !== date) return false;
    if (status && a.status !== status) return false;
    return true;
  });
}

/**
 * Get Hospital Operational Statistics
 */
export async function getHospitalStats(hospitalId) {
  const isConnected = mongoose.connection.readyState === 1;
  const todayStr = new Date().toISOString().slice(0, 10);

  if (isConnected) {
    const [hospital, doctorsCount, todayAppointments, waitingTokens] = await Promise.all([
      Hospital.findById(hospitalId).lean(),
      DoctorProfile.countDocuments({ hospitalId, isActive: true }),
      Appointment.find({ hospitalId, date: todayStr }).lean(),
      Token.countDocuments({ status: 'waiting' }),
    ]);

    if (!hospital) throw new AppError('Hospital not found', 404);

    const completedVisits = todayAppointments.filter((a) => a.status === 'completed').length;
    const inProgressVisits = todayAppointments.filter((a) => a.status === 'in-progress').length;
    const urgentVisits = todayAppointments.filter((a) => ['critical', 'urgent'].includes(a.priority)).length;

    return {
      hospital: {
        id: hospital._id,
        name: hospital.name,
        code: hospital.code,
        city: hospital.address?.city,
        totalBeds: hospital.totalBeds,
        availableBeds: hospital.availableBeds,
        departments: hospital.departments,
      },
      stats: {
        activeDoctorsCount: doctorsCount,
        totalAppointmentsToday: todayAppointments.length,
        completedVisits,
        inProgressVisits,
        urgentVisits,
        waitingQueueCount: waitingTokens,
      },
    };
  }

  // In-memory fallback
  const hosp = inMemoryHospitals.find((h) => h._id?.toString() === hospitalId?.toString());
  if (!hosp) throw new AppError('Hospital not found', 404);

  const docs = inMemoryDoctors.filter((d) => d.hospitalId?.toString() === hospitalId?.toString());
  const apts = inMemoryAppointments.filter((a) => a.hospitalId?.toString() === hospitalId?.toString() && a.date === todayStr);

  return {
    hospital: {
      id: hosp._id,
      name: hosp.name,
      code: hosp.code,
      city: hosp.address?.city || 'Delhi',
      totalBeds: hosp.totalBeds || 200,
      availableBeds: hosp.availableBeds || 45,
      departments: hosp.departments || ['OPD'],
    },
    stats: {
      activeDoctorsCount: docs.length,
      totalAppointmentsToday: apts.length,
      completedVisits: apts.filter((a) => a.status === 'completed').length,
      inProgressVisits: apts.filter((a) => a.status === 'in-progress').length,
      urgentVisits: apts.filter((a) => ['critical', 'urgent'].includes(a.priority)).length,
      waitingQueueCount: inMemoryTokens.filter((t) => t.status === 'waiting').length,
    },
  };
}

/**
 * Backward compatibility bridge:
 * Finds existing hospital by name or creates a placeholder Hospital record
 * so legacy demo data resolves to real references seamlessly.
 */
export async function findOrCreateHospitalByName(hospitalName, defaultLocation = {}) {
  if (!hospitalName) return null;

  const isConnected = mongoose.connection.readyState === 1;

  if (isConnected) {
    let hospital = await Hospital.findOne({
      name: new RegExp(`^${hospitalName.trim()}$`, 'i'),
    });

    if (!hospital) {
      const slug = hospitalName.replace(/[^A-Za-z0-9]/g, '').slice(0, 5).toUpperCase();
      hospital = await Hospital.create({
        name: hospitalName.trim(),
        code: `${slug}-${Math.floor(100 + Math.random() * 900)}`,
        address: {
          city: 'Delhi NCR',
          state: 'Delhi',
          pincode: '110001',
          fullAddress: `${hospitalName.trim()}, Medical District, Delhi NCR`,
        },
        location: {
          lat: defaultLocation.lat || 28.6139,
          lng: defaultLocation.lng || 77.2090,
        },
        contact: {
          phone: '+91-11-2345-6789',
          email: `contact@${slug.toLowerCase()}.mediqueue.test`,
          emergencyHelpline: '102',
        },
        departments: ['OPD', 'Emergency', 'Cardiology', 'General Medicine'],
        verificationStatus: 'verified',
      });
    }

    return hospital;
  }

  // In-memory fallback
  let hosp = inMemoryHospitals.find(
    (h) => h.name.toLowerCase() === hospitalName.trim().toLowerCase()
  );

  if (!hosp) {
    hosp = {
      _id: 'hosp-' + (inMemoryHospitals.length + 1),
      name: hospitalName.trim(),
      code: hospitalName.slice(0, 4).toUpperCase() + '-01',
      address: { fullAddress: `${hospitalName.trim()}, Delhi NCR` },
      contact: { phone: '+91-11-2345-6789' },
      departments: ['OPD', 'Emergency'],
      verificationStatus: 'verified',
      isActive: true,
    };
    inMemoryHospitals.push(hosp);
  }

  return hosp;
}
