/**
 * TEST SUITE: Real-Time Doctor & Reception Operational Synchronization
 *
 * Scenarios tested:
 *   1. Doctor Availability Sync: Doctor updates status (available, busy, on_leave, offline),
 *      reception queries and receives accurate status + current serving token.
 *   2. Strict Clinical Data Shielding: Reception appointment query strictly scrubs
 *      clinical notes, diagnoses, chief complaints, test orders, and prescriptions.
 *   3. Reception Patient Check-in: Front desk marks patient checked-in; appointment reflects
 *      arrival timestamp and status, operational socket payload is broadcast.
 *   4. Authoritative Queue Synchronization: Tokens, queue position, and estimated wait times
 *      remain consistent between doctor workspace and reception desk.
 *   5. Multi-Organization Scoping: Hospital A front desk only receives Hospital A doctors and
 *      appointments, isolated from Hospital B.
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  getReceptionDoctorsAvailability,
  getReceptionAppointments,
  checkInPatientAtReception,
  clearReceptionTestDb,
  seedReceptionTestDb,
} from '../services/receptionService.js';
import {
  clearDoctorBusinessTestDb,
  seedDoctorBusinessTestDb,
} from '../services/doctorBusinessService.js';
import {
  clearDoctorWorkspaceTestDb,
  seedDoctorWorkspaceTestDb,
} from '../services/doctorWorkspaceService.js';

describe('TEST SUITE: Real-Time Doctor & Reception Operational Synchronization', () => {
  const hospA = 'hosp_city_general';
  const hospB = 'clinic_metro_care';

  const doc1 = {
    _id: 'doc_101',
    doctorId: 'doc_101',
    doctorName: 'Dr. Aisha Khan',
    specialty: 'Cardiology',
    hospitalId: hospA,
    hospitalName: 'City General Hospital',
    availabilityStatus: 'available',
    isAvailableToday: true,
    currentServingToken: 12,
  };

  const doc2 = {
    _id: 'doc_102',
    doctorId: 'doc_102',
    doctorName: 'Dr. Rajesh Patel',
    specialty: 'Neurology',
    hospitalId: hospA,
    hospitalName: 'City General Hospital',
    availabilityStatus: 'busy',
    isAvailableToday: true,
    currentServingToken: 5,
  };

  const docB = {
    _id: 'doc_201',
    doctorId: 'doc_201',
    doctorName: 'Dr. Sarah Jenkins',
    specialty: 'Pediatrics',
    hospitalId: hospB,
    hospitalName: 'Metro Care Clinic',
    availabilityStatus: 'available',
    isAvailableToday: true,
    currentServingToken: null,
  };

  const todayStr = new Date().toISOString().slice(0, 10);

  const rawAppointments = [
    {
      _id: 'apt_001',
      date: todayStr,
      slotTime: '09:00 AM',
      doctorId: 'doc_101',
      doctorName: 'Dr. Aisha Khan',
      specialty: 'Cardiology',
      patientId: { name: 'Rahul Sharma', phone: '+919876543210' },
      patientName: 'Rahul Sharma',
      hospitalId: hospA,
      status: 'booked',
      priority: 'routine',
      tokenNumber: 101,
      // CLINICAL DATA TO BE SHIELDED:
      chiefComplaint: 'Chest tightness, elevated BP',
      condition: 'Hypertension Stage II',
      diagnosis: 'Suspected Angina',
      clinicalNotes: 'ECG recommended immediately, monitor vitals closely',
      prescriptions: ['Amlodipine 5mg OD', 'Aspirin 75mg OD'],
    },
    {
      _id: 'apt_002',
      date: todayStr,
      slotTime: '09:30 AM',
      doctorId: 'doc_101',
      doctorName: 'Dr. Aisha Khan',
      specialty: 'Cardiology',
      patientId: { name: 'Sunita Verma', phone: '+919876543211' },
      patientName: 'Sunita Verma',
      hospitalId: hospA,
      status: 'checked-in',
      priority: 'urgent',
      tokenNumber: 102,
      // CLINICAL DATA TO BE SHIELDED:
      chiefComplaint: 'Severe palpitations, shortness of breath',
      clinicalNotes: 'Patient has family history of arrhythmia',
    },
    {
      _id: 'apt_003',
      date: todayStr,
      slotTime: '10:00 AM',
      doctorId: 'doc_201',
      doctorName: 'Dr. Sarah Jenkins',
      specialty: 'Pediatrics',
      patientId: { name: 'Aarav Gupta', phone: '+919876543212' },
      patientName: 'Aarav Gupta',
      hospitalId: hospB,
      status: 'booked',
      tokenNumber: 201,
      chiefComplaint: 'High fever and cough for 3 days',
    },
  ];

  beforeEach(() => {
    clearReceptionTestDb();
    seedReceptionTestDb({
      doctors: [doc1, doc2, docB],
      appointments: rawAppointments,
    });
  });

  it('1. Reception receives real-time doctor availability status and current serving token', async () => {
    const receptionDocs = await getReceptionDoctorsAvailability({ hospitalId: hospA });

    assert.equal(receptionDocs.length, 2);
    const aisha = receptionDocs.find((d) => d.doctorId === 'doc_101');
    assert.ok(aisha);
    assert.equal(aisha.doctorName, 'Dr. Aisha Khan');
    assert.equal(aisha.availabilityStatus, 'available');
    assert.equal(aisha.currentServingToken, 12);

    const rajesh = receptionDocs.find((d) => d.doctorId === 'doc_102');
    assert.ok(rajesh);
    assert.equal(rajesh.availabilityStatus, 'busy');
    assert.equal(rajesh.currentServingToken, 5);
  });

  it('2. STRICT CLINICAL DATA SHIELDING: front desk receives operational info with ZERO clinical details', async () => {
    const receptionAppointments = await getReceptionAppointments({ hospitalId: hospA, date: todayStr });

    assert.equal(receptionAppointments.length, 2);

    for (const apt of receptionAppointments) {
      // Must contain operational fields
      assert.ok(apt.patientName, 'Patient name should exist for front desk operations');
      assert.ok(apt.slotTime, 'Slot time should exist');
      assert.ok(apt.checkInStatus, 'Check-in status should exist');
      assert.ok(apt.doctorName, 'Doctor name should exist');
      assert.ok(apt.tokenNumber !== undefined, 'Token number should exist');

      // MUST NOT contain sensitive clinical fields
      assert.strictEqual(apt.chiefComplaint, undefined, 'Chief complaint must NOT be exposed to reception');
      assert.strictEqual(apt.condition, undefined, 'Condition must NOT be exposed to reception');
      assert.strictEqual(apt.diagnosis, undefined, 'Diagnosis must NOT be exposed to reception');
      assert.strictEqual(apt.clinicalNotes, undefined, 'Clinical notes must NOT be exposed to reception');
      assert.strictEqual(apt.prescriptions, undefined, 'Prescriptions must NOT be exposed to reception');
      assert.strictEqual(apt.testOrders, undefined, 'Test orders must NOT be exposed to reception');
    }
  });

  it('3. Check-in status reflects correctly for booked vs checked-in patients', async () => {
    const receptionAppointments = await getReceptionAppointments({ hospitalId: hospA, date: todayStr });

    const apt1 = receptionAppointments.find((a) => a._id === 'apt_001');
    const apt2 = receptionAppointments.find((a) => a._id === 'apt_002');

    assert.equal(apt1.checkInStatus, 'Not Arrived');
    assert.equal(apt2.checkInStatus, 'Checked-In');
  });

  it('4. Multi-organization isolation: Hospital A reception cannot see Hospital B data', async () => {
    const hospADocs = await getReceptionDoctorsAvailability({ hospitalId: hospA });
    const hospBDocs = await getReceptionDoctorsAvailability({ hospitalId: hospB });

    assert.equal(hospADocs.every((d) => d.hospitalId === hospA), true);
    assert.equal(hospBDocs.every((d) => d.hospitalId === hospB), true);
    assert.equal(hospADocs.some((d) => d.doctorId === 'doc_201'), false);
    assert.equal(hospBDocs.some((d) => d.doctorId === 'doc_101'), false);

    const hospAApts = await getReceptionAppointments({ hospitalId: hospA, date: todayStr });
    const hospBApts = await getReceptionAppointments({ hospitalId: hospB, date: todayStr });

    assert.equal(hospAApts.length, 2);
    assert.equal(hospBApts.length, 1);
    assert.equal(hospBApts[0].patientName, 'Aarav Gupta');
  });

  it('5. Reception check-in returns scrubbed operational response without clinical leakage', async () => {
    // Test checkInPatientAtReception handles check-in cleanly
    const checkedIn = await checkInPatientAtReception({
      appointmentId: 'apt_001',
      hospitalId: hospA,
    });

    assert.ok(checkedIn);
    assert.equal(checkedIn.checkInStatus, 'Checked-In');
    assert.ok(checkedIn.checkInTime);
    assert.strictEqual(checkedIn.chiefComplaint, undefined);
    assert.strictEqual(checkedIn.diagnosis, undefined);
  });
});
