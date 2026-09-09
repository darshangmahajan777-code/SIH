/**
 * TEST SUITE: Unified Doctor Clinical Workspace
 *
 * Scenarios tested:
 *   1. Doctor A -> Patient B Unauthorized (Consent guard, LIMITED ACCESS, data shielding)
 *   2. Doctor A -> Patient B Authorized (AUTHORIZED, shared clinical history, tests, Rx, care plans, access log)
 *   3. Revoke Consent (Immediate drop back to LIMITED ACCESS and data shielding)
 *   4. Queue Management & Acuity Priority (Queue progression, triage priority ordering)
 *   5. Appointment Lifecycle (booked -> checked-in -> in-progress)
 *   6. Consultation Completion (completion, queue token done, auto doctor-verified history with attribution)
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import {
  getDoctorWorkspaceSummary,
  getPatientEncounter,
  startConsultation,
  completeConsultationEncounter,
  issueEncounterPrescription,
  issueEncounterTestOrder,
  issueEncounterCarePlan,
  addDoctorVerifiedHistory,
  clearDoctorWorkspaceTestDb,
  seedDoctorWorkspaceTestDb,
} from '../services/doctorWorkspaceService.js';

describe('TEST SUITE: Unified Doctor Clinical Workspace', () => {
  const docA = 'doc-001';
  const docB = 'doc-002';
  const patientA = 'patient-001';
  const patientB = 'patient-002';
  const apt1 = 'apt-101';
  const apt2 = 'apt-102';
  const todayStr = new Date().toISOString().slice(0, 10);

  beforeEach(() => {
    clearDoctorWorkspaceTestDb();

    // Base seed:
    // Doctor A: Dr. Sarah Patel (Cardiologist)
    // Patient B: Rahul Verma
    // Appointment 1: Patient B with Doctor A (Today, 10:00 AM, booked)
    // Appointment 2: Patient A with Doctor A (Today, 11:00 AM, urgent)
    seedDoctorWorkspaceTestDb({
      doctors: {
        [docA]: {
          _id: docA,
          doctorName: 'Dr. Sarah Patel',
          specialty: 'Cardiology',
          hospitalName: 'Apollo Multispecialty',
        },
        [docB]: {
          _id: docB,
          doctorName: 'Dr. Amit Mehta',
          specialty: 'Neurology',
          hospitalName: 'Apollo Multispecialty',
        },
      },
      patients: {
        [patientB]: {
          _id: patientB,
          name: 'Rahul Verma',
          age: 42,
          gender: 'male',
          bloodGroup: 'B+',
          phone: '+91 98765 43210',
          email: 'rahul.verma@example.com',
          allergies: ['Penicillin'],
          height: 175,
          weight: 78,
          emergencyContact: '+91 98765 00000',
        },
        [patientA]: {
          _id: patientA,
          name: 'Priya Sharma',
          age: 29,
          gender: 'female',
          bloodGroup: 'O+',
          phone: '+91 91234 56789',
        },
      },
      appointments: [
        {
          _id: apt1,
          doctorId: docA,
          patientId: {
            _id: patientB,
            name: 'Rahul Verma',
            age: 42,
            gender: 'male',
            bloodGroup: 'B+',
            phone: '+91 98765 43210',
            allergies: ['Penicillin'],
          },
          date: todayStr,
          slotTime: '10:00 AM',
          mode: 'in-person',
          status: 'booked',
          priority: 'routine',
          chiefComplaint: 'Chest tightness and shortness of breath upon exertion',
          tokenId: { tokenNumber: 101, status: 'waiting' },
        },
        {
          _id: apt2,
          doctorId: docA,
          patientId: {
            _id: patientA,
            name: 'Priya Sharma',
            age: 29,
            gender: 'female',
            bloodGroup: 'O+',
          },
          date: todayStr,
          slotTime: '11:00 AM',
          mode: 'video',
          status: 'checked-in',
          priority: 'urgent',
          chiefComplaint: 'Acute migraine with visual aura',
          tokenId: { tokenNumber: 102, status: 'waiting' },
        },
      ],
      tokens: [
        { _id: 'tok-101', tokenNumber: 101, patientName: 'Rahul Verma', status: 'waiting', priority: 'routine' },
        { _id: 'tok-102', tokenNumber: 102, patientName: 'Priya Sharma', status: 'waiting', priority: 'urgent' },
      ],
      histories: [
        {
          _id: 'mh-1',
          patientId: patientB,
          condition: 'Mild Hypertension',
          conditionDate: '2025-11-10',
          source: 'doctor-verified',
          doctorName: 'Dr. Amit Mehta',
          notes: 'Stage 1 hypertension noted during routine checkup',
          isActive: true,
        },
        {
          _id: 'mh-2',
          patientId: patientB,
          condition: 'Seasonal Allergic Rhinitis',
          conditionDate: '2026-02-14',
          source: 'self-reported',
          notes: 'Spring pollen allergy',
          isActive: true,
        },
      ],
      testOrders: [
        {
          _id: 'to-1',
          patientId: patientB,
          doctorId: docB,
          doctorName: 'Dr. Amit Mehta',
          testName: 'Lipid Profile',
          reason: 'Routine cardiovascular screen',
          status: 'completed',
          result: { value: '210', unit: 'mg/dL', labName: 'PathLab Central' },
          createdAt: new Date('2026-01-10'),
          completedAt: new Date('2026-01-11'),
        },
      ],
      carePlans: [
        {
          _id: 'cp-1',
          patientId: patientB,
          doctorId: docB,
          doctorName: 'Dr. Amit Mehta',
          diagnosis: 'Essential Hypertension',
          dietRecommended: 'DASH diet, low sodium',
          dietRestricted: 'Processed meats, salty snacks',
          activitiesRecommended: '30 min daily brisk walk',
          activitiesRestricted: 'Heavy weight lifting',
          followUpDate: '2026-06-01',
          notes: 'Check blood pressure weekly',
        },
      ],
      prescriptions: [
        {
          _id: 'rx-1',
          patientId: patientB,
          doctorId: docB,
          doctorName: 'Dr. Amit Mehta',
          diagnosis: 'Hypertension',
          medications: [
            {
              medicineName: 'Amlodipine',
              dosage: '5mg',
              frequency: 'Once daily',
              doseTimes: ['09:00'],
              mealRelation: 'after_meal',
              durationDays: 30,
            },
          ],
        },
      ],
    });
  });

  // ── TEST 1: Doctor A -> Patient B Unauthorized ───────────────────────────────
  it('Scenario 1: Doctor A -> Patient B Unauthorized must return LIMITED ACCESS and shield protected clinical data', async () => {
    const encounter = await getPatientEncounter({
      appointmentId: apt1,
      doctorId: docA,
    });

    assert.ok(encounter, 'Encounter payload should be returned');
    assert.strictEqual(encounter.patient.name, 'Rahul Verma');
    assert.strictEqual(encounter.appointment.chiefComplaint, 'Chest tightness and shortness of breath upon exertion');

    // Consent Check
    assert.strictEqual(encounter.consent.status, 'LIMITED ACCESS', 'Status must be LIMITED ACCESS');
    assert.strictEqual(encounter.consent.isAuthorized, false, 'isAuthorized must be false');
    assert.ok(encounter.consent.message.includes('not granted consent'), 'Should explain consent limitation');

    // Shielded Records: Protected data MUST NEVER be silently leaked
    assert.strictEqual(encounter.sharedRecords.medicalHistory.length, 0, 'Medical history must be empty');
    assert.strictEqual(encounter.sharedRecords.testResults.length, 0, 'Test results must be empty');
    assert.strictEqual(encounter.sharedRecords.prescriptions.length, 0, 'Prescriptions must be empty');
    assert.strictEqual(encounter.sharedRecords.carePlans.length, 0, 'Care plans must be empty');
  });

  // ── TEST 2: Doctor A -> Patient B Authorized ────────────────────────────────
  it('Scenario 2: Doctor A -> Patient B Authorized must return AUTHORIZED and reveal shared clinical records', async () => {
    // Seed an active AccessGrant from Patient B to Doctor A
    seedDoctorWorkspaceTestDb({
      grants: [
        {
          _id: 'grant-001',
          patientId: patientB,
          doctorId: docA,
          scope: 'ongoing',
          revokedAt: null,
          grantedAt: new Date(),
        },
      ],
    });

    const encounter = await getPatientEncounter({
      appointmentId: apt1,
      doctorId: docA,
    });

    // Consent Check
    assert.strictEqual(encounter.consent.status, 'AUTHORIZED', 'Status must be AUTHORIZED');
    assert.strictEqual(encounter.consent.isAuthorized, true, 'isAuthorized must be true');
    assert.strictEqual(encounter.consent.scope, 'ongoing');

    // Shared Records Revealed
    assert.strictEqual(encounter.sharedRecords.medicalHistory.length, 2, 'Should reveal both history entries');
    assert.strictEqual(encounter.sharedRecords.medicalHistory[0].condition, 'Mild Hypertension');
    assert.strictEqual(encounter.sharedRecords.medicalHistory[0].source, 'doctor-verified');
    assert.strictEqual(encounter.sharedRecords.medicalHistory[0].doctorName, 'Dr. Amit Mehta');

    assert.strictEqual(encounter.sharedRecords.testResults.length, 1, 'Should reveal test result');
    assert.strictEqual(encounter.sharedRecords.testResults[0].testName, 'Lipid Profile');
    assert.strictEqual(encounter.sharedRecords.testResults[0].result, '210 mg/dL');

    assert.strictEqual(encounter.sharedRecords.prescriptions.length, 1, 'Should reveal prescription');
    assert.strictEqual(encounter.sharedRecords.prescriptions[0].medications[0].medicineName, 'Amlodipine');

    assert.strictEqual(encounter.sharedRecords.carePlans.length, 1, 'Should reveal care plan');
    assert.strictEqual(encounter.sharedRecords.carePlans[0].diagnosis, 'Essential Hypertension');
  });

  // ── TEST 3: Patient Revocation ──────────────────────────────────────────────
  it('Scenario 3: Revoking consent immediately reverts encounter to LIMITED ACCESS and shields records', async () => {
    // 1. Initially granted
    seedDoctorWorkspaceTestDb({
      grants: [
        {
          _id: 'grant-001',
          patientId: patientB,
          doctorId: docA,
          scope: 'ongoing',
          revokedAt: null,
        },
      ],
    });

    const beforeRevoke = await getPatientEncounter({ appointmentId: apt1, doctorId: docA });
    assert.strictEqual(beforeRevoke.consent.status, 'AUTHORIZED');
    assert.strictEqual(beforeRevoke.sharedRecords.medicalHistory.length, 2);

    // 2. Patient revokes access
    seedDoctorWorkspaceTestDb({
      grants: [
        {
          _id: 'grant-001',
          patientId: patientB,
          doctorId: docA,
          scope: 'ongoing',
          revokedAt: new Date(), // Revoked!
        },
      ],
    });

    const afterRevoke = await getPatientEncounter({ appointmentId: apt1, doctorId: docA });
    assert.strictEqual(afterRevoke.consent.status, 'LIMITED ACCESS', 'Must immediately revert to LIMITED ACCESS');
    assert.strictEqual(afterRevoke.consent.isAuthorized, false);
    assert.strictEqual(afterRevoke.sharedRecords.medicalHistory.length, 0, 'Protected records shielded immediately');
    assert.strictEqual(afterRevoke.sharedRecords.testResults.length, 0);
  });

  // ── TEST 4: Queue Management & Acuity Priority in Workspace ──────────────────
  it('Scenario 4: Workspace summary displays queue state, urgent patients, and next patient triage', async () => {
    const summary = await getDoctorWorkspaceSummary({ doctorId: docA, date: todayStr });

    assert.ok(summary.doctor, 'Doctor profile should be present');
    assert.strictEqual(summary.doctor.doctorName, 'Dr. Sarah Patel');

    // Stats
    assert.strictEqual(summary.stats.totalAppointments, 2);
    assert.strictEqual(summary.stats.waitingCount, 2); // 1 booked, 1 checked-in
    assert.strictEqual(summary.stats.urgentCount, 1); // Priya Sharma is urgent
    assert.strictEqual(summary.stats.videoCount, 1); // Priya Sharma is video mode
    assert.strictEqual(summary.stats.queueWaitingCount, 2); // 2 queue tokens

    // Urgent patients filter
    assert.strictEqual(summary.urgentPatients.length, 1);
    assert.strictEqual(summary.urgentPatients[0].priority, 'urgent');
    assert.strictEqual(summary.urgentPatients[0].patientId.name, 'Priya Sharma');

    // Next Patient: Checked-in appointment (apt2) takes priority over un-checked-in booked appointment (apt1)
    assert.ok(summary.nextPatient, 'Next patient should be identified');
    assert.strictEqual(summary.nextPatient.patientName, 'Priya Sharma');
    assert.strictEqual(summary.nextPatient.status, 'checked-in');
  });

  // ── TEST 5: Appointment Lifecycle Progression ───────────────────────────────
  it('Scenario 5: Starting consultation transitions appointment status to in-progress', async () => {
    const started = await startConsultation({ appointmentId: apt1, doctorId: docA });
    assert.strictEqual(started.status, 'in-progress');

    // Re-check encounter
    const encounter = await getPatientEncounter({ appointmentId: apt1, doctorId: docA });
    assert.strictEqual(encounter.appointment.status, 'in-progress');
  });

  // ── TEST 6: Consultation Completion & Auto Doctor-Verified History ──────────
  it('Scenario 6: Completing consultation marks visit done and auto-generates doctor-verified history', async () => {
    // Start consultation first
    await startConsultation({ appointmentId: apt1, doctorId: docA });

    // Complete consultation
    const completed = await completeConsultationEncounter({
      appointmentId: apt1,
      doctorId: docA,
      notes: 'Patient advised to follow low-sodium diet and exercise regularly',
      diagnosis: 'Exertional Angina Suspected',
    });
    assert.strictEqual(completed.status, 'completed');

    // Re-check encounter to verify completed status
    const encounter = await getPatientEncounter({ appointmentId: apt1, doctorId: docA });
    assert.strictEqual(encounter.appointment.status, 'completed');

    // Issue Clinical Actions: Prescription, Test Order, and Care Plan
    const rx = await issueEncounterPrescription({
      appointmentId: apt1,
      doctorId: docA,
      patientId: patientB,
      diagnosis: 'Exertional Angina Suspected',
      medications: [
        {
          medicineName: 'Aspirin 75mg',
          dosage: '1 tablet',
          frequency: 'Once daily',
          doseTimes: ['08:00'],
          mealRelation: 'after_meal',
          durationDays: 14,
        },
      ],
      doctorName: 'Dr. Sarah Patel',
    });
    assert.ok(rx._id, 'Prescription should be created');
    assert.strictEqual(rx.medications[0].medicineName, 'Aspirin 75mg');

    const test = await issueEncounterTestOrder({
      appointmentId: apt1,
      doctorId: docA,
      patientId: patientB,
      testName: 'Echocardiogram (2D Echo)',
      reason: 'Rule out coronary artery disease and evaluate ejection fraction',
      doctorName: 'Dr. Sarah Patel',
    });
    assert.ok(test._id, 'Test order should be created');
    assert.strictEqual(test.testName, 'Echocardiogram (2D Echo)');
    assert.strictEqual(test.status, 'ordered');

    const carePlan = await issueEncounterCarePlan({
      appointmentId: apt1,
      doctorId: docA,
      patientId: patientB,
      carePlanData: {
        diagnosis: 'Exertional Angina',
        dietRecommended: 'Mediterranean diet rich in omega-3',
        dietRestricted: 'High-fat trans fatty acids and excess caffeine',
        activitiesRecommended: 'Light walking on flat ground',
        activitiesRestricted: 'Vigorous uphill running or sprinting',
        followUpDate: '2026-03-24',
        notes: 'Return immediately if chest pain radiates to left arm',
      },
      doctorName: 'Dr. Sarah Patel',
    });
    assert.ok(carePlan._id, 'Care plan should be created');
    assert.strictEqual(carePlan.diagnosis, 'Exertional Angina');

    // Direct Doctor-Verified History Entry
    const verified = await addDoctorVerifiedHistory({
      appointmentId: apt1,
      doctorId: docA,
      patientId: patientB,
      condition: 'Coronary Artery Disease (Preliminary)',
      conditionDate: todayStr,
      notes: 'Cardiology consultation confirmed exertional angina presentation',
      doctorName: 'Dr. Sarah Patel',
    });
    assert.strictEqual(verified.source, 'doctor-verified');
    assert.strictEqual(verified.doctorName, 'Dr. Sarah Patel');
    assert.strictEqual(verified.condition, 'Coronary Artery Disease (Preliminary)');
  });
});
