/**
 * TEST SUITE: Patient + Doctor/Business Login & Onboarding
 *
 * Scenarios tested:
 *   1. Cryptographic Password Hashing (scrypt salt-keyed, constant-time verification)
 *   2. Cryptographic JWT Signing & Verification (HS256 HMAC, tampering protection, expiration)
 *   3. Patient Registration with Vitals & Emergency Contact
 *   4. Doctor / Business Onboarding with Professional Profile, Clinic Details, Services, Modes & Fees
 *   5. Unified & Portal-Scoped Authentication (Patient portal vs Doctor portal role segregation)
 *   6. Existing Receptionist and Hospital Admin Demo Credentials Verification
 *   7. Role-Based Routing & Access Control Middleware Enforcement
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  hashPassword,
  verifyPassword,
  generateToken,
  verifyToken,
  sanitizeUser,
  registerPatient,
  registerDoctorBusiness,
  loginUser,
  getCurrentUser,
  clearAuthTestDb,
  seedAuthTestDb,
} from '../services/authService.js';
import { authenticateUser, requireRole } from '../middleware/auth.js';

describe('TEST SUITE: Patient + Doctor/Business Login & Onboarding', () => {
  beforeEach(() => {
    clearAuthTestDb();
  });

  // ── 1. Cryptographic Password Hashing & Verification ──
  describe('1. Native Password Security (scrypt + random salt)', () => {
    it('should hash passwords with distinct random salts for identical inputs', () => {
      const p1 = 'Secret123!';
      const hash1 = hashPassword(p1);
      const hash2 = hashPassword(p1);

      assert.ok(hash1.includes(':'), 'Hash must contain salt separator');
      assert.notEqual(hash1, hash2, 'Identical passwords must produce distinct salt-keyed hashes');
    });

    it('should verify valid password against generated hash', () => {
      const password = 'SuperSecurePassword@2026';
      const hash = hashPassword(password);
      assert.equal(verifyPassword(password, hash), true);
    });

    it('should reject invalid password', () => {
      const hash = hashPassword('CorrectPassword123');
      assert.equal(verifyPassword('WrongPassword456', hash), false);
    });

    it('should reject passwords shorter than 6 characters', () => {
      assert.throws(() => hashPassword('12345'), {
        message: 'Password must be at least 6 characters long',
      });
    });

    it('should support synthetic demo credentials (demo123) for legacy seed accounts', () => {
      // Legacy seed account with empty or null storedHash
      assert.equal(verifyPassword('demo123', null), true);
      assert.equal(verifyPassword('wrongpwd', null), false);
    });
  });

  // ── 2. JWT Generation & Verification ──
  describe('2. Native Cryptographic JWT Generation & Verification', () => {
    it('should generate a 3-part HMAC-SHA256 JWT containing user claims', () => {
      const mockUser = {
        _id: 'user_123',
        email: 'test@mediqueue.test',
        role: 'doctor',
        name: 'Dr. Test',
        hospitalId: 'hosp_456',
      };

      const token = generateToken(mockUser);
      assert.ok(typeof token === 'string');
      const parts = token.split('.');
      assert.equal(parts.length, 3, 'Token must have header.payload.signature format');

      const verified = verifyToken(token);
      assert.ok(verified, 'Token must verify successfully');
      assert.equal(verified.userId, 'user_123');
      assert.equal(verified.role, 'doctor');
      assert.equal(verified.email, 'test@mediqueue.test');
      assert.equal(verified.hospitalId, 'hosp_456');
    });

    it('should reject tampered token signatures', () => {
      const mockUser = { _id: 'user_tamper', email: 'tamper@test.org', role: 'patient' };
      const token = generateToken(mockUser);
      const [header, payload, sig] = token.split('.');
      const tamperedSig = sig.slice(0, -3) + 'XYZ';
      const tamperedToken = `${header}.${payload}.${tamperedSig}`;

      assert.equal(verifyToken(tamperedToken), null);
    });

    it('should reject expired tokens', () => {
      const mockUser = { _id: 'user_expired', email: 'exp@test.org', role: 'patient' };
      // Expired 1 second ago
      const expiredToken = generateToken(mockUser, -1000);
      assert.equal(verifyToken(expiredToken), null);
    });

    it('should return null for malformed or non-string tokens without crashing', () => {
      assert.equal(verifyToken(''), null);
      assert.equal(verifyToken(null), null);
      assert.equal(verifyToken('gibberish.not.jwt'), null);
    });
  });

  // ── 3. Patient Signup & Data Validation ──
  describe('3. Patient Registration & Profile Handling', () => {
    it('should register a new patient with vitals, allergies, and emergency contact', async () => {
      const patientData = {
        name: 'Anil Kapoor',
        email: 'anil.kapoor@example.com',
        password: 'Password@123',
        phone: '+91-9876543210',
        age: 35,
        gender: 'male',
        bloodGroup: 'B+',
        height: 178,
        weight: 74,
        allergies: ['Dust', 'Pollen'],
        emergencyContact: {
          name: 'Sunita Kapoor',
          phone: '+91-9876500000',
          relation: 'Spouse',
        },
      };

      const result = await registerPatient(patientData);
      assert.ok(result.token, 'Must return JWT token');
      assert.equal(result.user.name, 'Anil Kapoor');
      assert.equal(result.user.email, 'anil.kapoor@example.com');
      assert.equal(result.user.role, 'patient');
      assert.equal(result.user.bloodGroup, 'B+');
      assert.equal(result.user.height, 178);
      assert.equal(result.user.weight, 74);
      assert.deepEqual(result.user.allergies, ['Dust', 'Pollen']);
      assert.equal(result.user.emergencyContact.name, 'Sunita Kapoor');
      assert.equal(result.user.passwordHash, undefined, 'passwordHash must be omitted from user response');

      // Verify token payload matches created user
      const verified = verifyToken(result.token);
      assert.equal(verified.role, 'patient');
      assert.equal(verified.email, 'anil.kapoor@example.com');
    });

    it('should reject duplicate email registration with 409 conflict', async () => {
      const patientData = {
        name: 'First User',
        email: 'duplicate@example.com',
        password: 'Password@123',
      };
      await registerPatient(patientData);

      await assert.rejects(
        () => registerPatient({ ...patientData, name: 'Second User' }),
        (err) => err.statusCode === 409 && err.message.includes('already exists')
      );
    });

    it('should reject registration if required fields are missing', async () => {
      await assert.rejects(
        () => registerPatient({ email: 'missing_name@example.com', password: 'Password@123' }),
        (err) => err.statusCode === 400
      );
    });
  });

  // ── 4. Doctor / Business Onboarding ──
  describe('4. Doctor / Business Onboarding & Multi-Field Configuration', () => {
    it('should onboard a doctor with full professional profile, clinic details, services, modes & fees', async () => {
      const doctorData = {
        name: 'Dr. Vikram Malhotra',
        email: 'dr.vikram@delhicardio.test',
        password: 'DocPassword@2026',
        phone: '+91-9811223344',
        specialty: 'Cardiology',
        qualifications: ['MBBS', 'MD (Cardiology)', 'DM'],
        experienceYears: 14,
        medicalLicenseNumber: 'DMC-2012-98765',
        consultationFee: 1200,
        followUpFee: 600,
        hospitalName: 'Delhi Heart & Vascular Institute',
        clinicDetails: {
          clinicName: 'Delhi Heart Clinic',
          registrationNumber: 'REG-DMC-98765',
          contactPhone: '+91-11-23456789',
          taxId: 'GSTIN-07AAACD1234F1Z5',
          website: 'https://delhiheartclinic.org',
        },
        services: ['ECG', 'Echocardiogram', 'Hypertension Management', 'Cardiac Consultation'],
        consultationModes: ['in-person', 'video'],
        location: {
          lat: 28.5672,
          lng: 77.2100,
          address: 'Ring Road, Lajpat Nagar-IV, New Delhi',
        },
        weeklySchedule: [
          { day: 'monday', isWorking: true, startTime: '09:00', endTime: '18:00' },
          { day: 'tuesday', isWorking: true, startTime: '09:00', endTime: '18:00' },
        ],
        videoEnabled: true,
      };

      const result = await registerDoctorBusiness(doctorData);
      assert.ok(result.token, 'Must return JWT token');
      assert.equal(result.user.name, 'Dr. Vikram Malhotra');
      assert.equal(result.user.role, 'doctor');
      assert.ok(result.user.hospitalId, 'Must associate with a hospital / clinic');

      // Verify Doctor Profile fields
      const profile = result.doctorProfile;
      assert.ok(profile, 'Doctor profile must be created');
      assert.equal(profile.specialty, 'Cardiology');
      assert.equal(profile.medicalLicenseNumber, 'DMC-2012-98765');
      assert.equal(profile.consultationFee, 1200);
      assert.equal(profile.followUpFee, 600);
      assert.deepEqual(profile.qualifications, ['MBBS', 'MD (Cardiology)', 'DM']);
      assert.deepEqual(profile.consultationModes, ['in-person', 'video']);
      assert.equal(profile.videoEnabled, true);
      assert.equal(profile.clinicDetails.clinicName, 'Delhi Heart Clinic');
      assert.equal(profile.clinicDetails.taxId, 'GSTIN-07AAACD1234F1Z5');
      assert.ok(profile.services.includes('Echocardiogram'));

      // Verify token
      const verified = verifyToken(result.token);
      assert.equal(verified.role, 'doctor');
      assert.equal(verified.email, 'dr.vikram@delhicardio.test');
    });

    it('should reject doctor onboarding if specialty is missing', async () => {
      await assert.rejects(
        () =>
          registerDoctorBusiness({
            name: 'Dr. No Specialty',
            email: 'nospec@test.com',
            password: 'Password@123',
          }),
        (err) => err.statusCode === 400 && err.message.includes('specialty is required')
      );
    });
  });

  // ── 5. Unified & Role-Segregated Login ──
  describe('5. Unified & Portal-Scoped Login', () => {
    beforeEach(async () => {
      // Seed a patient and a doctor
      await registerPatient({
        name: 'Patient One',
        email: 'patient1@mediqueue.test',
        password: 'PatientPassword123',
      });

      await registerDoctorBusiness({
        name: 'Dr. Doctor One',
        email: 'doctor1@mediqueue.test',
        password: 'DoctorPassword123',
        specialty: 'Pediatrics',
      });
    });

    it('should successfully log in patient through patient portal', async () => {
      const res = await loginUser({
        email: 'patient1@mediqueue.test',
        password: 'PatientPassword123',
        requiredRole: 'patient',
      });
      assert.ok(res.token);
      assert.equal(res.user.role, 'patient');
    });

    it('should successfully log in doctor through doctor portal and return doctor profile', async () => {
      const res = await loginUser({
        email: 'doctor1@mediqueue.test',
        password: 'DoctorPassword123',
        requiredRole: 'doctor',
      });
      assert.ok(res.token);
      assert.equal(res.user.role, 'doctor');
      assert.ok(res.doctorProfile);
      assert.equal(res.doctorProfile.specialty, 'Pediatrics');
    });

    it('should block patient from logging in via doctor portal with 403', async () => {
      await assert.rejects(
        () =>
          loginUser({
            email: 'patient1@mediqueue.test',
            password: 'PatientPassword123',
            requiredRole: 'doctor',
          }),
        (err) => err.statusCode === 403 && err.message.includes('registered as a patient')
      );
    });

    it('should block doctor from logging in via patient portal with 403', async () => {
      await assert.rejects(
        () =>
          loginUser({
            email: 'doctor1@mediqueue.test',
            password: 'DoctorPassword123',
            requiredRole: 'patient',
          }),
        (err) => err.statusCode === 403 && err.message.includes('Doctor / Staff portal')
      );
    });

    it('should reject invalid password with 401', async () => {
      await assert.rejects(
        () =>
          loginUser({
            email: 'patient1@mediqueue.test',
            password: 'WrongPassword!',
          }),
        (err) => err.statusCode === 401 && err.message.includes('Invalid email or password')
      );
    });

    it('should reject unknown email with 401', async () => {
      await assert.rejects(
        () =>
          loginUser({
            email: 'nonexistent@example.com',
            password: 'AnyPassword123',
          }),
        (err) => err.statusCode === 401
      );
    });
  });

  // ── 6. Existing Receptionist & Admin Login ──
  describe('6. Receptionist & Admin Login Preservation', () => {
    beforeEach(() => {
      // Seed pre-existing demo accounts matching seedSihDemo.js
      seedAuthTestDb({
        users: [
          {
            _id: 'reception_001',
            name: 'Suman Verma (Demo Receptionist)',
            email: 'reception.demo@mediqueue.test',
            passwordHash: hashPassword('demo123'),
            role: 'receptionist',
            hospitalId: 'hosp_aiims',
            isActive: true,
          },
          {
            _id: 'admin_001',
            name: 'Amit Joshi (Demo Hospital Admin)',
            email: 'admin.demo@mediqueue.test',
            passwordHash: hashPassword('demo123'),
            role: 'hospital_admin',
            hospitalId: 'hosp_aiims',
            isActive: true,
          },
          {
            _id: 'plat_admin_001',
            name: 'Platform Super Admin',
            email: 'superadmin@mediqueue.test',
            passwordHash: hashPassword('demo123'),
            role: 'admin',
            isActive: true,
          },
        ],
      });
    });

    it('should log in existing demo receptionist with demo123', async () => {
      const res = await loginUser({
        email: 'reception.demo@mediqueue.test',
        password: 'demo123',
        requiredRole: 'receptionist',
      });
      assert.ok(res.token);
      assert.equal(res.user.role, 'receptionist');
      assert.equal(res.user.email, 'reception.demo@mediqueue.test');
    });

    it('should log in existing demo hospital admin with demo123', async () => {
      const res = await loginUser({
        email: 'admin.demo@mediqueue.test',
        password: 'demo123',
        requiredRole: 'admin',
      });
      assert.ok(res.token);
      assert.equal(res.user.role, 'hospital_admin');
    });

    it('should log in platform admin with demo123', async () => {
      const res = await loginUser({
        email: 'superadmin@mediqueue.test',
        password: 'demo123',
        requiredRole: 'admin',
      });
      assert.ok(res.token);
      assert.equal(res.user.role, 'admin');
    });
  });

  // ── 7. Role-Based Routing & Middleware Enforcement ──
  describe('7. Role-Based Routing & Middleware Guards', () => {
    it('authenticateUser should block request without Bearer token with 401', async () => {
      const req = { headers: {} };
      let statusCode = null;
      let jsonBody = null;
      const res = {
        status: (code) => {
          statusCode = code;
          return {
            json: (body) => {
              jsonBody = body;
            },
          };
        },
      };
      let nextCalled = false;
      const next = () => {
        nextCalled = true;
      };

      await authenticateUser(req, res, next);
      assert.equal(nextCalled, false);
      assert.equal(statusCode, 401);
      assert.equal(jsonBody.success, false);
    });

    it('authenticateUser should attach req.user and call next() on valid Bearer token', async () => {
      const token = generateToken({
        _id: 'user_jwt_verified',
        email: 'verified@mediqueue.test',
        role: 'doctor',
        name: 'Dr. Verified',
      });

      const req = {
        headers: {
          authorization: `Bearer ${token}`,
        },
      };
      const res = {};
      let nextCalled = false;
      const next = () => {
        nextCalled = true;
      };

      await authenticateUser(req, res, next);
      assert.equal(nextCalled, true);
      assert.equal(req.user._id, 'user_jwt_verified');
      assert.equal(req.user.role, 'doctor');
    });

    it('requireRole should allow matching role and block mismatching role with 403', () => {
      const doctorGuard = requireRole('doctor');

      // Matching doctor
      let docNext = false;
      doctorGuard({ user: { role: 'doctor' } }, {}, () => {
        docNext = true;
      });
      assert.equal(docNext, true);

      // Mismatching patient
      let status403 = null;
      let body403 = null;
      const res = {
        status: (code) => {
          status403 = code;
          return {
            json: (b) => {
              body403 = b;
            },
          };
        },
      };
      let patientNext = false;
      doctorGuard({ user: { role: 'patient' } }, res, () => {
        patientNext = true;
      });
      assert.equal(patientNext, false);
      assert.equal(status403, 403);
      assert.ok(body403.message.includes('not authorized'));
    });

    it('requireRole should grant platform admin universal access to any protected role', () => {
      const nurseGuard = requireRole('nurse');
      let adminNext = false;
      nurseGuard({ user: { role: 'admin' } }, {}, () => {
        adminNext = true;
      });
      assert.equal(adminNext, true, 'Platform admin must have universal bypass');
    });
  });
});
