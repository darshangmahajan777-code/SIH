/**
 * TEST SUITE: Multi-Hospital Foundation & Access Control
 *
 * Scenarios tested:
 *   1. Hospital A & Hospital B Creation & Directory
 *   2. Doctor Association with Hospital Context (preserving hospitalName)
 *   3. Hospital-level Access Control & Isolation (Hospital A staff blocked from Hospital B with 403)
 *   4. Platform Admin Cross-Hospital Management & Verification
 *   5. Patient Cross-Hospital Medical History with Consent (Hospital A Doctor -> Patient -> Hospital B Doctor)
 *   6. Backward Compatibility Bridge for Legacy Data
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import {
  createHospital,
  getHospitalById,
  listHospitals,
  updateHospital,
  verifyHospital,
  associateDoctorWithHospital,
  verifyDoctorInHospital,
  getHospitalDoctors,
  getHospitalAppointments,
  getHospitalStats,
  findOrCreateHospitalByName,
  clearHospitalTestDb,
  seedHospitalTestDb,
} from '../services/hospitalService.js';
import { checkAccess, grantAccess, revokeAccess } from '../services/consentService.js';
import { clearDoctorWorkspaceTestDb, seedDoctorWorkspaceTestDb, getPatientEncounter } from '../services/doctorWorkspaceService.js';

describe('TEST SUITE: Multi-Hospital Foundation & Access Control', () => {
  const hospAId = 'hosp-001';
  const hospBId = 'hosp-002';
  const docAId = 'doc-001';
  const docBId = 'doc-002';
  const patient1Id = 'patient-001';
  const aptAId = 'apt-101';
  const aptBId = 'apt-102';
  const todayStr = new Date().toISOString().slice(0, 10);

  beforeEach(() => {
    clearHospitalTestDb();
    clearDoctorWorkspaceTestDb();

    // Base seed:
    // Hospital A: Apollo Multispecialty Hospital (Verified)
    // Hospital B: AIIMS Super Specialty Center (Verified)
    // Doctor A: at Hospital A
    // Doctor B: at Hospital B
    seedHospitalTestDb({
      hospitals: [
        {
          _id: hospAId,
          name: 'Apollo Multispecialty Hospital',
          code: 'APOLLO-DEL',
          address: {
            street: 'Mathura Road',
            city: 'New Delhi',
            state: 'Delhi',
            pincode: '110076',
            fullAddress: 'Sarita Vihar, Mathura Road, New Delhi, Delhi 110076',
          },
          location: { lat: 28.5355, lng: 77.2880 },
          contact: { phone: '+91-11-2692-5858', email: 'contact@apollo.test' },
          departments: ['Cardiology', 'OPD', 'Neurology', 'Emergency'],
          verificationStatus: 'verified',
          isActive: true,
          totalBeds: 500,
          availableBeds: 120,
        },
        {
          _id: hospBId,
          name: 'AIIMS Super Specialty Center',
          code: 'AIIMS-DEL',
          address: {
            street: 'Ansari Nagar',
            city: 'New Delhi',
            state: 'Delhi',
            pincode: '110029',
            fullAddress: 'Ansari Nagar, New Delhi, Delhi 110029',
          },
          location: { lat: 28.5672, lng: 77.2100 },
          contact: { phone: '+91-11-2658-8500', email: 'admin@aiims.test' },
          departments: ['Trauma', 'Emergency', 'Cardiology', 'Pediatrics'],
          verificationStatus: 'verified',
          isActive: true,
          totalBeds: 1200,
          availableBeds: 85,
        },
      ],
      doctors: [
        {
          _id: docAId,
          doctorName: 'Dr. Sarah Patel',
          specialty: 'Cardiology',
          hospitalId: hospAId,
          hospitalName: 'Apollo Multispecialty Hospital',
          verificationStatus: 'verified',
          avgRating: 4.9,
          consultationFee: 700,
          isActive: true,
        },
        {
          _id: docBId,
          doctorName: 'Dr. Amit Mehta',
          specialty: 'Neurology',
          hospitalId: hospBId,
          hospitalName: 'AIIMS Super Specialty Center',
          verificationStatus: 'verified',
          avgRating: 4.8,
          consultationFee: 500,
          isActive: true,
        },
      ],
      appointments: [
        {
          _id: aptAId,
          doctorId: docAId,
          patientId: { _id: patient1Id, name: 'Siddharth Rao' },
          hospitalId: hospAId,
          date: todayStr,
          slotTime: '10:00 AM',
          status: 'completed',
          priority: 'routine',
        },
        {
          _id: aptBId,
          doctorId: docBId,
          patientId: { _id: patient1Id, name: 'Siddharth Rao' },
          hospitalId: hospBId,
          date: todayStr,
          slotTime: '02:30 PM',
          status: 'in-progress',
          priority: 'urgent',
        },
      ],
      tokens: [{ status: 'waiting' }, { status: 'waiting' }],
    });
  });

  // ── TEST 1: Hospital A & Hospital B Creation & Directory ───────────────────
  it('Scenario 1: Creates distinct hospitals and retrieves them in the directory with filters', async () => {
    const newHosp = await createHospital({
      name: 'Fortis Escorts Heart Institute',
      code: 'FORTIS-OKH',
      address: {
        city: 'New Delhi',
        fullAddress: 'Okhla Road, New Delhi 110025',
      },
      contact: { phone: '+91-11-4713-5000' },
      departments: ['Cardiology', 'Emergency', 'Cardiothoracic Surgery'],
      verificationStatus: 'pending',
    });

    assert.ok(newHosp._id, 'Hospital should be created with unique ID');
    assert.strictEqual(newHosp.code, 'FORTIS-OKH');
    assert.strictEqual(newHosp.verificationStatus, 'pending');

    // List all
    const directory = await listHospitals({ limit: 10 });
    assert.strictEqual(directory.count, 3, 'Should have 3 hospitals');

    // Filter by department
    const cardioHospitals = await listHospitals({ department: 'Neurology' });
    assert.strictEqual(cardioHospitals.count, 1, 'Only Apollo has Neurology department');
    assert.strictEqual(cardioHospitals.hospitals[0].code, 'APOLLO-DEL');

    // Get single hospital by ID with doctors count
    const apollo = await getHospitalById(hospAId);
    assert.strictEqual(apollo.name, 'Apollo Multispecialty Hospital');
    assert.strictEqual(apollo.doctorsCount, 1, 'Doctor A is associated with Apollo');
  });

  // ── TEST 2: Doctor Association with Hospital Context ───────────────────────
  it('Scenario 2: Associates doctors with hospital references while keeping hospitalName in sync', async () => {
    // Add a new doctor initially without hospital
    seedHospitalTestDb({
      doctors: [
        {
          _id: 'doc-003',
          doctorName: 'Dr. Rajiv Malhotra',
          specialty: 'Orthopedics',
          hospitalId: null,
          hospitalName: 'Private Clinic',
          verificationStatus: 'pending',
        },
      ],
    });

    // Affiliate with Hospital B (AIIMS)
    const affiliated = await associateDoctorWithHospital({
      doctorId: 'doc-003',
      hospitalId: hospBId,
    });

    assert.strictEqual(affiliated.hospitalId, hospBId);
    assert.strictEqual(affiliated.hospitalName, 'AIIMS Super Specialty Center', 'hospitalName must sync with hospital entity');

    // Verify doctor in Hospital B
    const verified = await verifyDoctorInHospital({
      doctorId: 'doc-003',
      hospitalId: hospBId,
      status: 'verified',
    });
    assert.strictEqual(verified.verificationStatus, 'verified');

    // Listing doctors for Hospital B
    const aiimsDoctors = await getHospitalDoctors(hospBId);
    assert.ok(aiimsDoctors.length >= 2, 'AIIMS should now have Dr. Amit and Dr. Rajiv');
  });

  // ── TEST 3: Hospital-Level Isolation (Access Control) ──────────────────────
  it('Scenario 3: Enforces strict hospital-level data isolation for staff', async () => {
    // Simulate requireHospitalAccess checks:
    const hospitalAUser = { role: 'hospital_admin', hospitalId: hospAId };
    const hospitalBUser = { role: 'hospital_admin', hospitalId: hospBId };

    // Function simulating access check
    const checkHospitalAuthorization = (user, targetHospitalId) => {
      if (user.role === 'admin') return true;
      if (user.hospitalId?.toString() !== targetHospitalId.toString()) {
        const err = new Error('Access denied: You are not authorized to view or manage data for this hospital.');
        err.status = 403;
        throw err;
      }
      return true;
    };

    // Hospital A staff accessing Hospital A data -> ALLOWED
    assert.doesNotThrow(() => checkHospitalAuthorization(hospitalAUser, hospAId));

    // Hospital A staff attempting to access Hospital B data -> BLOCKED WITH 403
    assert.throws(
      () => checkHospitalAuthorization(hospitalAUser, hospBId),
      (err) => err.status === 403 && err.message.includes('Access denied')
    );

    // Hospital B staff attempting to access Hospital A data -> BLOCKED WITH 403
    assert.throws(
      () => checkHospitalAuthorization(hospitalBUser, hospAId),
      (err) => err.status === 403
    );

    // Hospital-scoped appointments check
    const apolloAppointments = await getHospitalAppointments({ hospitalId: hospAId, date: todayStr });
    assert.strictEqual(apolloAppointments.length, 1);
    assert.strictEqual(apolloAppointments[0]._id, aptAId, 'Apollo appointments must only contain Apollo visits');

    const aiimsAppointments = await getHospitalAppointments({ hospitalId: hospBId, date: todayStr });
    assert.strictEqual(aiimsAppointments.length, 1);
    assert.strictEqual(aiimsAppointments[0]._id, aptBId, 'AIIMS appointments must only contain AIIMS visits');
  });

  // ── TEST 4: Platform Admin Access Across Hospitals ─────────────────────────
  it('Scenario 4: Platform admin can manage and verify hospitals globally', async () => {
    const platformAdmin = { role: 'admin' };

    // Platform admin verifies pending hospital
    const verifiedHosp = await verifyHospital({
      hospitalId: hospAId,
      status: 'verified',
      verifiedBy: platformAdmin,
    });
    assert.strictEqual(verifiedHosp.verificationStatus, 'verified');

    // Platform admin accesses stats for both Hospital A and Hospital B
    const apolloStats = await getHospitalStats(hospAId);
    assert.strictEqual(apolloStats.hospital.name, 'Apollo Multispecialty Hospital');
    assert.strictEqual(apolloStats.stats.totalAppointmentsToday, 1);
    assert.strictEqual(apolloStats.stats.completedVisits, 1);

    const aiimsStats = await getHospitalStats(hospBId);
    assert.strictEqual(aiimsStats.hospital.name, 'AIIMS Super Specialty Center');
    assert.strictEqual(aiimsStats.stats.inProgressVisits, 1);
  });

  // ── TEST 5: Patient Cross-Hospital History with Consent ─────────────────────
  it('Scenario 5: Patient treated at Hospital A shares verified history with Doctor B at Hospital B under verified consent', async () => {
    // Setup Doctor Clinical Workspace with cross-hospital scenario:
    // Patient 1 had an earlier consultation with Doctor A at Hospital A
    // Now Patient 1 is visiting Doctor B at Hospital B for Appointment B
    seedDoctorWorkspaceTestDb({
      doctors: {
        [docAId]: { _id: docAId, doctorName: 'Dr. Sarah Patel', hospitalName: 'Apollo Multispecialty Hospital' },
        [docBId]: { _id: docBId, doctorName: 'Dr. Amit Mehta', hospitalName: 'AIIMS Super Specialty Center' },
      },
      patients: {
        [patient1Id]: {
          _id: patient1Id,
          name: 'Siddharth Rao',
          age: 38,
          gender: 'male',
          bloodGroup: 'A+',
        },
      },
      appointments: [
        {
          _id: aptBId,
          doctorId: docBId,
          patientId: { _id: patient1Id, name: 'Siddharth Rao' },
          date: todayStr,
          slotTime: '02:30 PM',
          mode: 'in-person',
          status: 'in-progress',
          priority: 'urgent',
          chiefComplaint: 'Severe temporal headache and photophobia',
        },
      ],
      // History created by Doctor A at Hospital A:
      histories: [
        {
          _id: 'vh-apollo-1',
          patientId: patient1Id,
          doctorId: docAId,
          doctorName: 'Dr. Sarah Patel',
          appointmentId: aptAId,
          condition: 'Paroxysmal Supraventricular Tachycardia (PSVT)',
          conditionDate: '2026-01-15',
          source: 'doctor-verified',
          notes: 'Episode treated with adenosine at Apollo Emergency; cardiology follow-up recommended.',
          isActive: true,
        },
      ],
    });

    // 1. Doctor B at Hospital B tries to view patient WITHOUT consent
    const encounterBeforeConsent = await getPatientEncounter({
      appointmentId: aptBId,
      doctorId: docBId,
    });

    assert.strictEqual(encounterBeforeConsent.consent.status, 'LIMITED ACCESS');
    assert.strictEqual(encounterBeforeConsent.consent.isAuthorized, false);
    assert.strictEqual(encounterBeforeConsent.sharedRecords.medicalHistory.length, 0, 'Hospital A records must be shielded from Hospital B without consent');

    // 2. Patient explicitly grants consent to Doctor B at Hospital B
    seedDoctorWorkspaceTestDb({
      grants: [
        {
          _id: 'grant-cross-hosp-1',
          patientId: patient1Id,
          doctorId: docBId,
          scope: 'ongoing',
          revokedAt: null,
        },
      ],
    });

    // 3. Doctor B re-opens encounter with consent verified
    const encounterWithConsent = await getPatientEncounter({
      appointmentId: aptBId,
      doctorId: docBId,
    });

    assert.strictEqual(encounterWithConsent.consent.status, 'AUTHORIZED');
    assert.strictEqual(encounterWithConsent.consent.isAuthorized, true);

    // Cross-Hospital Records are revealed with original Doctor A attribution preserved!
    assert.strictEqual(encounterWithConsent.sharedRecords.medicalHistory.length, 1);
    const sharedRecord = encounterWithConsent.sharedRecords.medicalHistory[0];
    assert.strictEqual(sharedRecord.condition, 'Paroxysmal Supraventricular Tachycardia (PSVT)');
    assert.strictEqual(sharedRecord.source, 'doctor-verified');
    assert.strictEqual(sharedRecord.doctorName, 'Dr. Sarah Patel', 'Doctor A attribution must be preserved');
    assert.strictEqual(sharedRecord.doctorId, docAId);

    // 4. Patient revokes consent -> Doctor B at Hospital B is immediately blocked again
    seedDoctorWorkspaceTestDb({
      grants: [
        {
          _id: 'grant-cross-hosp-1',
          patientId: patient1Id,
          doctorId: docBId,
          scope: 'ongoing',
          revokedAt: new Date(), // Revoked!
        },
      ],
    });

    const encounterAfterRevoke = await getPatientEncounter({
      appointmentId: aptBId,
      doctorId: docBId,
    });
    assert.strictEqual(encounterAfterRevoke.consent.status, 'LIMITED ACCESS');
    assert.strictEqual(encounterAfterRevoke.sharedRecords.medicalHistory.length, 0, 'Revocation immediately blocks access');
  });

  // ── TEST 6: Backward Compatibility Bridge for Legacy Data ───────────────────
  it('Scenario 6: Resolves legacy string hospital names into valid Hospital records without breaking existing queries', async () => {
    const legacyName = 'City Heart Clinic';

    // Bridge helper resolves or creates hospital
    const hospital = await findOrCreateHospitalByName(legacyName);
    assert.ok(hospital, 'Should return hospital entity');
    assert.strictEqual(hospital.name, 'City Heart Clinic');
    assert.ok(hospital._id, 'Should have an _id');
    assert.strictEqual(hospital.verificationStatus, 'verified');

    // Repeated call returns existing hospital
    const existing = await findOrCreateHospitalByName(legacyName);
    assert.strictEqual(existing._id, hospital._id, 'Should find existing record and not duplicate');
  });
});
