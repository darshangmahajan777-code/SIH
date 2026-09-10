import crypto from 'crypto';
import mongoose from 'mongoose';
import User from '../models/User.js';
import DoctorProfile from '../models/DoctorProfile.js';
import Hospital from '../models/Hospital.js';
import { AppError } from '../middleware/errorHandler.js';

const JWT_SECRET = process.env.JWT_SECRET || 'mediqueue-production-jwt-secret-key-2026';
const TOKEN_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

// In-memory fallback stores for testing without active MongoDB connection
let inMemoryUsers = [];
let inMemoryDoctorProfiles = [];
let inMemoryHospitals = [];

export function initDefaultDemoAccounts() {
  inMemoryUsers = [
    {
      _id: '65f000000000000000000001',
      name: 'Rahul Sharma (Demo Patient)',
      email: 'patient.demo@mediqueue.test',
      passwordHash: 'demo123',
      phone: '+91-9876543210',
      role: 'patient',
      age: 32,
      gender: 'male',
      bloodGroup: 'O+',
      height: 175,
      weight: 70,
      allergies: ['Penicillin', 'Sulfa drugs'],
      emergencyContact: { name: 'Pooja Sharma', phone: '+91-9876500000', relation: 'Spouse' },
      isActive: true,
    },
    {
      _id: '65f000000000000000000020',
      name: 'Dr. Priya Sharma (Demo Doctor A)',
      email: 'dr.priya@mediqueue.test',
      passwordHash: 'demo123',
      phone: '+91-9123456789',
      role: 'doctor',
      hospitalId: '65f000000000000000000010',
      isActive: true,
    },
    {
      _id: '65f000000000000000000050',
      name: 'Suman Verma (Reception Desk)',
      email: 'reception.demo@mediqueue.test',
      passwordHash: 'demo123',
      phone: '+91-9811122233',
      role: 'receptionist',
      hospitalId: '65f000000000000000000010',
      isActive: true,
    },
    {
      _id: '65f000000000000000000060',
      name: 'Hospital Administrator',
      email: 'admin.demo@mediqueue.test',
      passwordHash: 'demo123',
      phone: '+91-9822233344',
      role: 'admin',
      hospitalId: '65f000000000000000000010',
      isActive: true,
    },
  ];

  inMemoryDoctorProfiles = [
    {
      _id: '65f000000000000000000002',
      userId: '65f000000000000000000020',
      doctorName: 'Dr. Priya Sharma',
      specialty: 'Cardiology',
      hospitalName: 'AIIMS Super Specialty Hospital',
      hospitalId: '65f000000000000000000010',
      qualifications: ['MBBS', 'MD (Cardiology)', 'DM (Cardiology)'],
      experienceYears: 12,
      medicalLicenseNumber: 'DMC-2014-43210',
      consultationFee: 800,
      followUpFee: 400,
      services: ['General Consultation', 'ECG', 'Echocardiogram', 'Hypertension Management'],
      consultationModes: ['in-person', 'video'],
      clinicDetails: {
        clinicName: 'AIIMS Cardiac Outpatient Clinic',
        registrationNumber: 'REG-AIIMS-CARDIO-01',
        contactPhone: '+91-11-26588500',
      },
      subscription: {
        plan: 'professional',
        status: 'active',
        validUntil: new Date(Date.now() + 28 * 24 * 60 * 60 * 1000),
        maxStaffSeats: 5,
        telemedicineEnabled: true,
        analyticsEnabled: true,
        aiAssistantEnabled: true,
      },
      avgRating: 4.8,
      ratingCount: 36,
      isAvailableToday: true,
      isActive: true,
    },
  ];

  inMemoryHospitals = [
    {
      _id: '65f000000000000000000010',
      name: 'AIIMS Super Specialty Hospital',
      code: 'AIIMS-DEL',
      address: {
        fullAddress: 'Ansari Nagar, Ring Road, New Delhi, Delhi 110029',
      },
      contact: { phone: '+91-11-26588500', email: 'opd@aiims.edu.in' },
      departments: ['OPD', 'Cardiology', 'Neurology'],
      verificationStatus: 'verified',
      isActive: true,
    },
  ];
}

initDefaultDemoAccounts();

export function clearAuthTestDb() {
  inMemoryUsers = [];
  inMemoryDoctorProfiles = [];
  inMemoryHospitals = [];
}

export function seedAuthTestDb({ users = [], doctorProfiles = [], hospitals = [] } = {}) {
  if (users.length) {
    users.forEach((u) => {
      const idx = inMemoryUsers.findIndex((item) => item._id?.toString() === u._id?.toString() || item.email === u.email);
      if (idx >= 0) inMemoryUsers[idx] = { ...inMemoryUsers[idx], ...u };
      else inMemoryUsers.push({ ...u });
    });
  }
  if (doctorProfiles.length) {
    doctorProfiles.forEach((d) => {
      const idx = inMemoryDoctorProfiles.findIndex((item) => item._id?.toString() === d._id?.toString());
      if (idx >= 0) inMemoryDoctorProfiles[idx] = { ...inMemoryDoctorProfiles[idx], ...d };
      else inMemoryDoctorProfiles.push({ ...d });
    });
  }
  if (hospitals.length) {
    hospitals.forEach((h) => {
      const idx = inMemoryHospitals.findIndex((item) => item._id?.toString() === h._id?.toString());
      if (idx >= 0) inMemoryHospitals[idx] = { ...inMemoryHospitals[idx], ...h };
      else inMemoryHospitals.push({ ...h });
    });
  }
}

export const getInMemoryDoctorProfiles = () => inMemoryDoctorProfiles;
export const getInMemoryUsers = () => inMemoryUsers;

/**
 * Native cryptographic password hashing using scrypt
 */
export function hashPassword(password) {
  if (!password || typeof password !== 'string') {
    throw new AppError('Password must be a valid non-empty string', 400);
  }
  if (password.length < 6) {
    throw new AppError('Password must be at least 6 characters long', 400);
  }
  const salt = crypto.randomBytes(16).toString('hex');
  const derivedKey = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${derivedKey}`;
}

/**
 * Verify password against stored hash or demo synthetic credentials
 */
export function verifyPassword(password, storedHash) {
  if (!password) return false;

  // Support synthetic seed accounts where storedHash is empty or 'demo123'
  if (!storedHash) {
    return password === 'demo123';
  }
  if (storedHash === password) {
    return true;
  }
  if (storedHash.includes(':')) {
    const [salt, key] = storedHash.split(':');
    if (!salt || !key) return false;
    const derivedKey = crypto.scryptSync(password, salt, 64).toString('hex');
    const keyBuf = Buffer.from(key, 'hex');
    const derivedBuf = Buffer.from(derivedKey, 'hex');
    if (keyBuf.length !== derivedBuf.length) return false;
    return crypto.timingSafeEqual(keyBuf, derivedBuf);
  }
  return false;
}

/**
 * Generate standard HMAC-SHA256 JWT
 */
export function generateToken(user, expiresInMs = TOKEN_EXPIRY_MS) {
  const payload = {
    userId: String(user._id || user.id),
    email: user.email,
    role: user.role,
    name: user.name,
    hospitalId: user.hospitalId ? String(user.hospitalId) : null,
    exp: Date.now() + expiresInMs,
  };

  const header = { alg: 'HS256', typ: 'JWT' };
  const headerStr = Buffer.from(JSON.stringify(header)).toString('base64url');
  const payloadStr = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = crypto
    .createHmac('sha256', JWT_SECRET)
    .update(`${headerStr}.${payloadStr}`)
    .digest('base64url');

  return `${headerStr}.${payloadStr}.${signature}`;
}

/**
 * Verify HMAC-SHA256 JWT
 */
export function verifyToken(token) {
  if (!token || typeof token !== 'string') return null;

  const parts = token.split('.');
  if (parts.length === 3) {
    const [headerStr, payloadStr, signature] = parts;
    const expectedSig = crypto
      .createHmac('sha256', JWT_SECRET)
      .update(`${headerStr}.${payloadStr}`)
      .digest('base64url');

    const sigBuf = Buffer.from(signature);
    const expectedBuf = Buffer.from(expectedSig);
    if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
      return null;
    }

    try {
      const payload = JSON.parse(Buffer.from(payloadStr, 'base64url').toString('utf8'));
      if (payload.exp && Date.now() > payload.exp) return null;
      return payload;
    } catch {
      return null;
    }
  }

  // Fallback for 2-part tokens (payload.sig)
  if (parts.length === 2) {
    const [payloadStr, signature] = parts;
    const expectedSig = crypto
      .createHmac('sha256', JWT_SECRET)
      .update(payloadStr)
      .digest('base64url');

    const sigBuf = Buffer.from(signature);
    const expectedBuf = Buffer.from(expectedSig);
    if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
      return null;
    }

    try {
      const payload = JSON.parse(Buffer.from(payloadStr, 'base64url').toString('utf8'));
      if (payload.exp && Date.now() > payload.exp) return null;
      return payload;
    } catch {
      return null;
    }
  }

  return null;
}

/**
 * Sanitize user object for client response (remove passwordHash)
 */
export function sanitizeUser(userDoc) {
  if (!userDoc) return null;
  const user = userDoc.toObject ? userDoc.toObject() : { ...userDoc };
  delete user.passwordHash;
  return user;
}

/**
 * Patient Signup
 */
export async function registerPatient(data) {
  const {
    name,
    email,
    password,
    phone,
    age,
    gender,
    bloodGroup,
    height,
    weight,
    allergies,
    emergencyContact,
  } = data;

  if (!name || !email || !password) {
    throw new AppError('Name, email, and password are required', 400);
  }

  const cleanEmail = email.trim().toLowerCase();
  const isConnected = mongoose.connection.readyState === 1;

  if (isConnected) {
    const existingUser = await User.findOne({ email: cleanEmail });
    if (existingUser) {
      throw new AppError('An account with this email already exists', 409);
    }

    const passwordHash = hashPassword(password);
    const newUser = await User.create({
      name: name.trim(),
      email: cleanEmail,
      passwordHash,
      role: 'patient',
      phone: phone?.trim(),
      age: age ? Number(age) : null,
      gender: gender || 'prefer_not_to_say',
      bloodGroup: bloodGroup || 'unknown',
      height: height ? Number(height) : null,
      weight: weight ? Number(weight) : null,
      allergies: Array.isArray(allergies)
        ? allergies
        : allergies
        ? allergies.split(',').map((a) => a.trim()).filter(Boolean)
        : [],
      emergencyContact: emergencyContact || { name: '', phone: '', relation: '' },
      isActive: true,
    });

    const token = generateToken(newUser);
    return {
      user: sanitizeUser(newUser),
      token,
    };
  }

  // In-memory fallback
  const existingInMemory = inMemoryUsers.find((u) => u.email === cleanEmail);
  if (existingInMemory) {
    throw new AppError('An account with this email already exists', 409);
  }

  const passwordHash = hashPassword(password);
  const inMemoryUser = {
    _id: 'user-pat-' + (inMemoryUsers.length + 1),
    name: name.trim(),
    email: cleanEmail,
    passwordHash,
    role: 'patient',
    phone: phone?.trim(),
    age: age ? Number(age) : null,
    gender: gender || 'prefer_not_to_say',
    bloodGroup: bloodGroup || 'unknown',
    height: height ? Number(height) : null,
    weight: weight ? Number(weight) : null,
    allergies: Array.isArray(allergies)
      ? allergies
      : allergies
      ? allergies.split(',').map((a) => a.trim()).filter(Boolean)
      : [],
    emergencyContact: emergencyContact || { name: '', phone: '', relation: '' },
    isActive: true,
    createdAt: new Date(),
  };

  inMemoryUsers.push(inMemoryUser);
  const token = generateToken(inMemoryUser);

  return {
    user: sanitizeUser(inMemoryUser),
    token,
  };
}

/**
 * Doctor / Business Signup & Onboarding
 */
export async function registerDoctorBusiness(data) {
  const {
    name,
    email,
    password,
    phone,
    specialty,
    qualifications,
    experienceYears,
    medicalLicenseNumber,
    consultationFee,
    followUpFee,
    hospitalId,
    hospitalName,
    clinicDetails,
    services,
    consultationModes,
    location,
    weeklySchedule,
    videoEnabled,
  } = data;

  if (!name || !email || !password) {
    throw new AppError('Name, email, and password are required', 400);
  }

  if (!specialty) {
    throw new AppError('Medical specialty is required for doctor/business onboarding', 400);
  }

  const cleanEmail = email.trim().toLowerCase();
  const isConnected = mongoose.connection.readyState === 1;
  const targetHospitalName = hospitalName || clinicDetails?.clinicName || `${name.trim()}'s Clinic`;

  const formattedQualifications = Array.isArray(qualifications)
    ? qualifications
    : typeof qualifications === 'string'
    ? qualifications.split(',').map((q) => q.trim()).filter(Boolean)
    : ['MBBS'];

  const formattedServices = Array.isArray(services)
    ? services
    : typeof services === 'string'
    ? services.split(',').map((s) => s.trim()).filter(Boolean)
    : ['General Consultation', `${specialty} Consultation`];

  const formattedModes = Array.isArray(consultationModes)
    ? consultationModes
    : ['in-person'];

  const isVideo = Boolean(videoEnabled || formattedModes.includes('video'));

  if (isConnected) {
    const existingUser = await User.findOne({ email: cleanEmail });
    if (existingUser) {
      throw new AppError('An account with this email already exists', 409);
    }

    let targetHospital = null;
    if (hospitalId) {
      targetHospital = await Hospital.findById(hospitalId);
    }
    if (!targetHospital) {
      targetHospital = await Hospital.findOne({ name: targetHospitalName });
    }
    if (!targetHospital) {
      targetHospital = await Hospital.create({
        name: targetHospitalName,
        address: {
          street: clinicDetails?.street || location?.address || '',
          city: clinicDetails?.city || 'New Delhi',
          state: clinicDetails?.state || 'Delhi',
          pincode: clinicDetails?.pincode || '110001',
          fullAddress: location?.address || clinicDetails?.fullAddress || `${targetHospitalName}, New Delhi`,
        },
        location: {
          lat: Number(location?.lat) || 28.6139,
          lng: Number(location?.lng) || 77.2090,
        },
        contact: {
          phone: phone || clinicDetails?.contactPhone || '+91-9876543210',
          email: cleanEmail,
        },
        departments: [specialty, 'OPD', 'General Consultation'],
        verificationStatus: 'verified',
        isActive: true,
      });
    }

    const passwordHash = hashPassword(password);
    const newUser = await User.create({
      name: name.trim(),
      email: cleanEmail,
      passwordHash,
      role: 'doctor',
      hospitalId: targetHospital._id,
      phone: phone?.trim(),
      isActive: true,
    });

    if (targetHospital.adminUserIds && !targetHospital.adminUserIds.includes(newUser._id)) {
      targetHospital.adminUserIds.push(newUser._id);
      await targetHospital.save();
    }

    const doctorProfile = await DoctorProfile.create({
      userId: newUser._id,
      doctorName: name.trim(),
      specialty: specialty.trim(),
      qualifications: formattedQualifications,
      experienceYears: Number(experienceYears) || 2,
      medicalLicenseNumber: (medicalLicenseNumber || '').trim(),
      hospitalName: targetHospital.name,
      hospitalId: targetHospital._id,
      verificationStatus: 'verified',
      location: {
        lat: Number(location?.lat) || targetHospital.location?.lat || 28.6139,
        lng: Number(location?.lng) || targetHospital.location?.lng || 77.2090,
        address: location?.address || targetHospital.address?.fullAddress || '',
      },
      consultationFee: consultationFee !== undefined ? Math.max(0, Number(consultationFee)) : 500,
      followUpFee: followUpFee !== undefined ? Math.max(0, Number(followUpFee)) : 300,
      services: formattedServices,
      consultationModes: formattedModes,
      clinicDetails: {
        clinicName: clinicDetails?.clinicName || targetHospital.name,
        registrationNumber: clinicDetails?.registrationNumber || (medicalLicenseNumber || '').trim(),
        contactPhone: clinicDetails?.contactPhone || phone || '',
        taxId: clinicDetails?.taxId || '',
        website: clinicDetails?.website || '',
      },
      weeklySchedule: weeklySchedule || undefined,
      videoEnabled: isVideo,
      isAvailableToday: true,
      isActive: true,
    });

    const token = generateToken(newUser);
    return {
      user: sanitizeUser(newUser),
      doctorProfile,
      token,
    };
  }

  // In-memory fallback
  const existingInMemory = inMemoryUsers.find((u) => u.email === cleanEmail);
  if (existingInMemory) {
    throw new AppError('An account with this email already exists', 409);
  }

  let targetHospital = inMemoryHospitals.find((h) => h._id === hospitalId || h.name === targetHospitalName);
  if (!targetHospital) {
    targetHospital = {
      _id: 'hosp-' + (inMemoryHospitals.length + 1),
      name: targetHospitalName,
      address: { fullAddress: location?.address || `${targetHospitalName}, New Delhi` },
      location: location || { lat: 28.6139, lng: 77.2090 },
      contact: { phone: phone || '+91-9876543210', email: cleanEmail },
      verificationStatus: 'verified',
      isActive: true,
      adminUserIds: [],
    };
    inMemoryHospitals.push(targetHospital);
  }

  const passwordHash = hashPassword(password);
  const inMemoryUser = {
    _id: 'user-doc-' + (inMemoryUsers.length + 1),
    name: name.trim(),
    email: cleanEmail,
    passwordHash,
    role: 'doctor',
    hospitalId: targetHospital._id,
    phone: phone?.trim(),
    isActive: true,
    createdAt: new Date(),
  };
  inMemoryUsers.push(inMemoryUser);

  const inMemoryProfile = {
    _id: 'doc-prof-' + (inMemoryDoctorProfiles.length + 1),
    userId: inMemoryUser._id,
    doctorName: name.trim(),
    specialty: specialty.trim(),
    qualifications: formattedQualifications,
    experienceYears: Number(experienceYears) || 2,
    medicalLicenseNumber: (medicalLicenseNumber || '').trim(),
    hospitalName: targetHospital.name,
    hospitalId: targetHospital._id,
    verificationStatus: 'verified',
    location: location || { lat: 28.6139, lng: 77.2090, address: targetHospital.address.fullAddress },
    consultationFee: consultationFee !== undefined ? Math.max(0, Number(consultationFee)) : 500,
    followUpFee: followUpFee !== undefined ? Math.max(0, Number(followUpFee)) : 300,
    services: formattedServices,
    consultationModes: formattedModes,
    clinicDetails: {
      clinicName: clinicDetails?.clinicName || targetHospital.name,
      registrationNumber: clinicDetails?.registrationNumber || (medicalLicenseNumber || '').trim(),
      contactPhone: clinicDetails?.contactPhone || phone || '',
      taxId: clinicDetails?.taxId || '',
      website: clinicDetails?.website || '',
    },
    weeklySchedule: weeklySchedule || [],
    videoEnabled: isVideo,
    isAvailableToday: true,
    isActive: true,
  };
  inMemoryDoctorProfiles.push(inMemoryProfile);

  const token = generateToken(inMemoryUser);

  return {
    user: sanitizeUser(inMemoryUser),
    doctorProfile: inMemoryProfile,
    token,
  };
}

/**
 * Unified Login with Optional Role Verification
 */
export async function loginUser({ email, password, requiredRole }) {
  if (!email || !password) {
    throw new AppError('Email and password are required', 400);
  }

  const cleanEmail = email.trim().toLowerCase();
  const isConnected = mongoose.connection.readyState === 1;

  let user = null;
  if (isConnected) {
    user = await User.findOne({ email: cleanEmail });
  } else {
    user = inMemoryUsers.find((u) => u.email === cleanEmail);
  }

  if (!user) {
    throw new AppError('Invalid email or password', 401);
  }

  if (user.isActive === false) {
    throw new AppError('Account is deactivated. Please contact support.', 403);
  }

  const isValid = verifyPassword(password, user.passwordHash);
  if (!isValid) {
    throw new AppError('Invalid email or password', 401);
  }

  // Role portal checks
  if (requiredRole) {
    if (requiredRole === 'patient' && user.role !== 'patient') {
      throw new AppError(`Account is registered as a ${user.role}. Please log in through the Doctor / Staff portal.`, 403);
    }
    if (requiredRole === 'doctor' && user.role === 'patient') {
      throw new AppError('Account is registered as a patient. Please log in through the Patient portal.', 403);
    }
    if (requiredRole === 'receptionist' && !['receptionist', 'admin', 'hospital_admin'].includes(user.role)) {
      throw new AppError('Access denied: Receptionist or Administrator credentials required', 403);
    }
    if (requiredRole === 'admin' && !['admin', 'hospital_admin'].includes(user.role)) {
      throw new AppError('Access denied: Administrator credentials required', 403);
    }
  }

  let doctorProfile = null;
  if (user.role === 'doctor') {
    if (isConnected) {
      doctorProfile = await DoctorProfile.findOne({ userId: user._id });
    } else {
      doctorProfile = inMemoryDoctorProfiles.find((d) => d.userId?.toString() === user._id?.toString());
    }
  }

  const token = generateToken(user);

  return {
    user: sanitizeUser(user),
    doctorProfile,
    token,
  };
}

/**
 * Get Current User Profile by ID
 */
export async function getCurrentUser(userId) {
  if (!userId) return null;
  const isConnected = mongoose.connection.readyState === 1;

  let user = null;
  if (isConnected) {
    user = await User.findById(userId);
  } else {
    user = inMemoryUsers.find((u) => u._id?.toString() === userId.toString());
  }

  if (!user) return null;

  let doctorProfile = null;
  if (user.role === 'doctor') {
    if (isConnected) {
      doctorProfile = await DoctorProfile.findOne({ userId: user._id });
    } else {
      doctorProfile = inMemoryDoctorProfiles.find((d) => d.userId?.toString() === user._id?.toString());
    }
  }

  return {
    user: sanitizeUser(user),
    doctorProfile,
  };
}
