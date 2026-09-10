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
 * Register / Create a new Hospital or Small Clinic
 */
export async function createHospital(data) {
  if (!data.name || !data.contact?.phone || !data.address?.fullAddress) {
    throw new AppError('Hospital/Clinic name, contact phone, and full address are required', 400);
  }

  const isClinic = data.type === 'clinic';
  const orgType = isClinic ? 'clinic' : 'hospital';

  const defaultWorkingHours = data.workingHours || {
    openTime: '08:00',
    closeTime: isClinic ? '18:00' : '20:00',
    days: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'],
    emergency24x7: !isClinic,
  };

  const defaultSchedules = data.appointmentSchedules || {
    slotDurationMinutes: isClinic ? 20 : 30,
    advanceBookingDays: 14,
    startSlotTime: '09:00',
    endSlotTime: isClinic ? '17:00' : '18:00',
  };

  const defaultServices = data.services || (isClinic
    ? ['General OPD', 'Doctor Consultations', 'Preventive Care', 'Family Medicine']
    : ['OPD Consultations', 'Diagnostics', 'Emergency Care', 'Pharmacy', 'ICU']);

  const isConnected = mongoose.connection.readyState === 1;

  if (isConnected) {
    // Generate code if not provided (e.g. "CLINIC-412" or "AIIMS-DEL")
    let code = data.code;
    if (!code) {
      const prefix = isClinic ? 'CLINIC' : data.name.replace(/[^A-Za-z0-9]/g, '').slice(0, 5).toUpperCase();
      code = `${prefix}-${Math.floor(100 + Math.random() * 900)}`;
    }

    const hospital = await Hospital.create({
      ...data,
      code,
      type: orgType,
      workingHours: defaultWorkingHours,
      appointmentSchedules: defaultSchedules,
      services: defaultServices,
      rating: data.rating !== undefined ? data.rating : 4.8,
      reviewCount: data.reviewCount || (data.reviews ? data.reviews.length : 0),
      reviews: data.reviews || [],
      availabilityStatus: data.availabilityStatus || 'available',
      isAcceptingPatients: data.isAcceptingPatients !== false,
      totalBeds: data.totalBeds !== undefined ? data.totalBeds : (isClinic ? 0 : 200),
      availableBeds: data.availableBeds !== undefined ? data.availableBeds : (isClinic ? 0 : 45),
      verificationStatus: data.verificationStatus || 'verified',
    });
    return hospital;
  }

  // In-memory fallback
  const prefix = isClinic ? 'CLINIC' : 'HOSP';
  const newHospital = {
    _id: data._id || `${isClinic ? 'clinic' : 'hosp'}-${inMemoryHospitals.length + 1}`,
    name: data.name,
    code: data.code || `${prefix}-${inMemoryHospitals.length + 1}`,
    type: orgType,
    address: data.address,
    location: data.location || { lat: 28.6139, lng: 77.2090 },
    contact: data.contact,
    departments: data.departments || (isClinic ? ['General OPD', 'Family Medicine'] : ['OPD', 'Emergency', 'Cardiology']),
    workingHours: defaultWorkingHours,
    appointmentSchedules: defaultSchedules,
    services: defaultServices,
    rating: data.rating !== undefined ? data.rating : 4.8,
    reviewCount: data.reviewCount || (data.reviews ? data.reviews.length : 0),
    reviews: data.reviews || [],
    availabilityStatus: data.availabilityStatus || 'available',
    isAcceptingPatients: data.isAcceptingPatients !== false,
    verificationStatus: data.verificationStatus || 'verified',
    isActive: data.isActive !== false,
    adminUserIds: data.adminUserIds || [],
    totalBeds: data.totalBeds !== undefined ? data.totalBeds : (isClinic ? 0 : 200),
    availableBeds: data.availableBeds !== undefined ? data.availableBeds : (isClinic ? 0 : 45),
    createdAt: new Date(),
  };
  inMemoryHospitals.push(newHospital);
  return newHospital;
}

/**
 * Get Hospital or Clinic by ID
 */
export async function getHospitalById(id) {
  const isConnected = mongoose.connection.readyState === 1;

  if (isConnected) {
    const hospital = await Hospital.findById(id).lean();
    if (!hospital) throw new AppError('Hospital/Clinic not found', 404);

    const [doctorsCount, activeDoctors] = await Promise.all([
      DoctorProfile.countDocuments({ hospitalId: id, isActive: true }),
      DoctorProfile.find({ hospitalId: id, isActive: true })
        .select('doctorName specialty avgRating ratingCount consultationFee isAvailableToday')
        .limit(10)
        .lean(),
    ]);

    return { ...hospital, doctorsCount, doctors: activeDoctors };
  }

  // In-memory fallback
  const hosp = inMemoryHospitals.find((h) => h._id?.toString() === id?.toString());
  if (!hosp) throw new AppError('Hospital/Clinic not found', 404);
  const matchingDoctors = inMemoryDoctors.filter((d) => d.hospitalId?.toString() === id?.toString() && d.isActive !== false);
  return { ...hosp, doctorsCount: matchingDoctors.length, doctors: matchingDoctors };
}

/**
 * List Hospitals & Clinics with multi-organization filters
 */
export async function listHospitals({
  query = '',
  department = '',
  status = '',
  city = '',
  type = '',
  service = '',
  availabilityStatus = '',
  sortBy = 'rating',
  limit = 50,
  skip = 0,
} = {}) {
  const isConnected = mongoose.connection.readyState === 1;

  if (isConnected) {
    const filter = { isActive: true };
    if (status) filter.verificationStatus = status;
    if (department) filter.departments = department;
    if (city) filter['address.city'] = new RegExp(city, 'i');
    if (type && type !== 'all') filter.type = type;
    if (service) filter.services = { $in: [new RegExp(service, 'i')] };
    if (availabilityStatus) filter.availabilityStatus = availabilityStatus;

    if (query) {
      filter.$or = [
        { name: new RegExp(query, 'i') },
        { code: new RegExp(query, 'i') },
        { 'address.city': new RegExp(query, 'i') },
        { 'address.fullAddress': new RegExp(query, 'i') },
        { services: new RegExp(query, 'i') },
      ];
    }

    const sortOptions = {};
    if (sortBy === 'rating') {
      sortOptions.rating = -1;
      sortOptions.name = 1;
    } else if (sortBy === 'name') {
      sortOptions.name = 1;
    } else {
      sortOptions.verificationStatus = 1;
      sortOptions.name = 1;
    }

    const hospitals = await Hospital.find(filter)
      .sort(sortOptions)
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
  if (type && type !== 'all') list = list.filter((h) => (h.type || 'hospital') === type);
  if (service) list = list.filter((h) => h.services?.some((s) => s.toLowerCase().includes(service.toLowerCase())));
  if (availabilityStatus) list = list.filter((h) => (h.availabilityStatus || 'available') === availabilityStatus);

  if (query) {
    const q = query.toLowerCase();
    list = list.filter(
      (h) =>
        h.name.toLowerCase().includes(q) ||
        h.code?.toLowerCase().includes(q) ||
        h.address?.fullAddress?.toLowerCase().includes(q) ||
        h.services?.some((s) => s.toLowerCase().includes(q))
    );
  }

  if (sortBy === 'rating') {
    list.sort((a, b) => (b.rating || 0) - (a.rating || 0));
  } else if (sortBy === 'name') {
    list.sort((a, b) => a.name.localeCompare(b.name));
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

/**
 * Get staff members (receptionists/nurses) assigned to this hospital/clinic
 */
export async function getHospitalStaff(hospitalId) {
  const isConnected = mongoose.connection.readyState === 1;
  if (isConnected) {
    const staff = await User.find({
      hospitalId,
      role: { $in: ['receptionist', 'nurse', 'clinic_manager', 'staff'] },
      isActive: true,
    }).select('name email phone role hospitalId createdAt').lean();
    return staff;
  }

  // In-memory fallback
  try {
    const { getInMemoryUsers } = await import('./authService.js');
    const users = getInMemoryUsers ? getInMemoryUsers() : [];
    return users.filter(
      (u) =>
        ['receptionist', 'nurse', 'clinic_manager', 'staff'].includes(u.role) &&
        (!hospitalId || String(u.hospitalId) === String(hospitalId))
    );
  } catch {
    return [];
  }
}

/**
 * Register / add a staff member (receptionist/nurse) to this hospital/clinic
 */
export async function createHospitalStaff(hospitalId, data) {
  const { name, email, phone, role = 'receptionist', password = 'demo123' } = data;
  if (!name || !email) {
    throw new AppError('Name and email are required for staff registration', 400);
  }

  const isConnected = mongoose.connection.readyState === 1;
  if (isConnected) {
    const existing = await User.findOne({ email });
    if (existing) {
      existing.hospitalId = hospitalId;
      existing.role = role;
      await existing.save();
      return existing;
    }
    const { hashPassword } = await import('./authService.js');
    const passwordHash = hashPassword(password);
    const user = await User.create({
      name,
      email,
      phone,
      role,
      hospitalId,
      passwordHash,
      isActive: true,
    });
    return user;
  }

  // In-memory
  const newUser = {
    _id: 'user_staff_' + Date.now(),
    name,
    email,
    phone,
    role,
    hospitalId,
    passwordHash: password,
    isActive: true,
    createdAt: new Date(),
  };
  try {
    const { getInMemoryUsers } = await import('./authService.js');
    const mem = getInMemoryUsers ? getInMemoryUsers() : [];
    mem.push(newUser);
  } catch {}
  return newUser;
}

/**
 * Get Public Queue Summary for Hospital/Clinic
 * Provides real-time token count and wait estimates without exposing other patients' health records.
 */
export async function getHospitalPublicQueue(hospitalId) {
  const isConnected = mongoose.connection.readyState === 1;
  const todayStr = new Date().toISOString().slice(0, 10);

  if (isConnected) {
    const hospital = await Hospital.findById(hospitalId).lean();
    if (!hospital) throw new AppError('Hospital/Clinic not found', 404);

    const [waitingTokens, inProgressToken, doctors] = await Promise.all([
      Token.find({ hospitalId, sessionDate: todayStr, status: 'waiting' }).sort({ tokenNumber: 1 }).lean(),
      Token.findOne({ hospitalId, sessionDate: todayStr, status: 'in-progress' }).lean(),
      DoctorProfile.find({ hospitalId, isActive: true }).select('doctorName specialty isAvailableToday').lean(),
    ]);

    const activeDocs = doctors.filter((d) => d.isAvailableToday !== false);
    const avgConsultTime = 10;
    const estimatedWait = Math.round((waitingTokens.length * avgConsultTime) / Math.max(activeDocs.length, 1));

    return {
      hospitalId: hospital._id,
      organizationId: hospital.code,
      name: hospital.name,
      type: hospital.type || 'hospital',
      availabilityStatus: hospital.availabilityStatus || 'available',
      isAcceptingPatients: hospital.isAcceptingPatients !== false,
      waitingCount: waitingTokens.length,
      currentToken: inProgressToken
        ? inProgressToken.tokenNumber
        : waitingTokens[0]?.tokenNumber
        ? Math.max(1, waitingTokens[0].tokenNumber - 1)
        : 0,
      estimatedWaitTimeMinutes: estimatedWait,
      activeDoctorsCount: activeDocs.length,
    };
  }

  // In-memory fallback
  const hosp = inMemoryHospitals.find((h) => h._id?.toString() === hospitalId?.toString());
  if (!hosp) throw new AppError('Hospital/Clinic not found', 404);

  const waitingTokens = inMemoryTokens.filter(
    (t) => t.status === 'waiting' && (!t.hospitalId || t.hospitalId?.toString() === hospitalId?.toString())
  );
  const docs = inMemoryDoctors.filter((d) => d.hospitalId?.toString() === hospitalId?.toString());

  return {
    hospitalId: hosp._id,
    organizationId: hosp.code,
    name: hosp.name,
    type: hosp.type || 'hospital',
    availabilityStatus: hosp.availabilityStatus || 'available',
    isAcceptingPatients: hosp.isAcceptingPatients !== false,
    waitingCount: waitingTokens.length,
    currentToken: waitingTokens.length > 0 ? 12 : 0,
    estimatedWaitTimeMinutes: waitingTokens.length * 10,
    activeDoctorsCount: docs.length,
  };
}

/**
 * Add a Patient Review & Update Aggregates for Hospital/Clinic
 */
export async function addHospitalReview({ hospitalId, patientName = 'Verified Patient', rating, comment = '' }) {
  if (!rating || rating < 1 || rating > 5) {
    throw new AppError('Rating must be between 1 and 5', 400);
  }

  const isConnected = mongoose.connection.readyState === 1;

  if (isConnected) {
    const hospital = await Hospital.findById(hospitalId);
    if (!hospital) throw new AppError('Hospital/Clinic not found', 404);

    hospital.reviews = hospital.reviews || [];
    hospital.reviews.push({
      patientName: patientName || 'Verified Patient',
      rating: Number(rating),
      comment: comment || '',
      date: new Date(),
    });

    hospital.reviewCount = hospital.reviews.length;
    const sum = hospital.reviews.reduce((acc, r) => acc + (r.rating || 5), 0);
    hospital.rating = Number((sum / hospital.reviews.length).toFixed(1));
    await hospital.save();
    return hospital;
  }

  // In-memory fallback
  const hosp = inMemoryHospitals.find((h) => h._id?.toString() === hospitalId?.toString());
  if (!hosp) throw new AppError('Hospital/Clinic not found', 404);

  hosp.reviews = hosp.reviews || [];
  hosp.reviews.push({
    patientName: patientName || 'Verified Patient',
    rating: Number(rating),
    comment: comment || '',
    date: new Date(),
  });
  hosp.reviewCount = hosp.reviews.length;
  const sum = hosp.reviews.reduce((acc, r) => acc + (r.rating || 5), 0);
  hosp.rating = Number((sum / hosp.reviews.length).toFixed(1));
  return hosp;
}
