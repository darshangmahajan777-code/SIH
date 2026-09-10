/**
 * TEST SUITE: Doctor Clinical Workspace Longitudinal Patient Record & Role Security
 *
 * Scenarios tested:
 *   1. Longitudinal Patient Overview: Name, age, gender, ID, demographics, BMI calculation, and risk alerts.
 *   2. Current Visit: Chief complaint, symptoms, duration, vitals (BP, HR, Temp, SpO2, RR), observations, notes.
 *   3. Medical History Categorization: Past illnesses, diagnoses, surgeries, chronic conditions, and allergies.
 *   4. Previous Visits Retrieval: Historical visits with doctor, specialty, hospital, diagnosis, treatment, Rx.
 *   5. Prescriptions Segmentation: Active/current medicines vs past completed medicines with dosage, frequency, duration.
 *   6. Tests & Reports: Diagnostic orders, structured lab results, normal/abnormal indications, report files, dates.
 *   7. Care Plan: Dietary, activity guidelines, follow-up intervals, doctor clinical instructions.
 *   8. Chronological Medical Timeline: Synthesis of visits, diagnoses, surgeries, prescriptions, tests, and care plans.
 *   9. Current Visit Update: Updating vitals, observations, and clinical notes during consultation.
 *  10. Strict Role-Based Access Control: Gated to doctors only; reception and patients are rejected with 403 Forbidden.
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  getPatientEncounter,
  updateEncounterCurrentVisit,
  clearDoctorWorkspaceTestDb,
  seedDoctorWorkspaceTestDb,
} from '../services/doctorWorkspaceService.js';
import { authenticateUser, requireRole } from '../middleware/auth.js';
import { generateToken } from '../services/authService.js';

describe('TEST SUITE: Doctor Clinical Workspace Longitudinal Patient Record', () => {
  const docId = 'doc_prof_901';
  const patientId = 'user_pat_901';
  const currentAptId = 'apt_curr_901';
  const pastAptId = 'apt_past_901';
  const todayStr = new Date().toISOString().slice(0, 10);
  const pastDateStr = '2026-06-15';

  const doctorProfile = {
    _id: docId,
    doctorName: 'Dr. Ramesh Kulkarni',
    specialty: 'Cardiology',
    hospitalName: 'Apex Heart & Multispecialty Hospital',
    hospitalId: 'hosp_apex_01',
  };

  const patientRecord = {
    _id: patientId,
    id: patientId,
    name: 'Suresh Menon',
    age: 54,
    gender: 'male',
    bloodGroup: 'O+',
    phone: '+91 98765 12345',
    email: 'suresh.menon@example.com',
    allergies: ['Penicillin', 'Sulfa Drugs'],
    height: 172,
    weight: 78,
    emergencyContact: '+91 98765 99999 (Wife)',
  };

  const currentAppointment = {
    _id: currentAptId,
    doctorId: docId,
    patientId: patientRecord,
    date: todayStr,
    slotTime: '10:30 AM',
    mode: 'in-person',
    status: 'in-progress',
    priority: 'urgent',
    chiefComplaint: 'Chest tightness, exertional dyspnea for 3 days',
    symptoms: ['Chest tightness', 'Exertional dyspnea', 'Fatigue'],
    duration: '3 days',
    vitals: {
      bp: '142/90 mmHg',
      heartRate: 88,
      temperature: '98.8 °F',
      spO2: '97%',
      respiratoryRate: 18,
    },
    currentObservations: 'Mild bilateral basal crackles, normal S1/S2 with trace S4 sound',
    clinicalNotes: 'Initiate ECG immediately. Patient reports recurrent angina triggers upon climbing stairs.',
    diagnosis: 'Suspected Unstable Angina / CAD Evaluation',
    treatment: 'Immediate ECG, sublingual nitrate standby, oral beta-blocker titration',
    tokenId: { tokenNumber: 22, status: 'in-progress' },
  };

  const pastAppointment = {
    _id: pastAptId,
    doctorId: docId,
    patientId: patientRecord,
    date: pastDateStr,
    slotTime: '11:00 AM',
    mode: 'in-person',
    status: 'completed',
    priority: 'routine',
    chiefComplaint: 'Routine hypertension follow-up',
    diagnosis: 'Essential Hypertension Stage I',
    treatment: 'Dietary sodium reduction and lifestyle modification',
    hospitalName: 'Apex Heart & Multispecialty Hospital',
  };

  const medicalHistoryEntries = [
    {
      _id: 'mh_001',
      patientId,
      condition: 'Essential Hypertension',
      conditionDate: '2021-03-10',
      category: 'chronic_condition',
      notes: 'Well-controlled on single agent until recent stress',
      doctorName: 'Dr. Ramesh Kulkarni',
      source: 'doctor-verified',
      isActive: true,
    },
    {
      _id: 'mh_002',
      patientId,
      condition: 'Type II Diabetes Mellitus',
      conditionDate: '2023-01-15',
      category: 'chronic_condition',
      notes: 'HbA1c 6.8% on Metformin 500mg BD',
      doctorName: 'Dr. Ramesh Kulkarni',
      source: 'doctor-verified',
      isActive: true,
    },
    {
      _id: 'mh_003',
      patientId,
      condition: 'Laparoscopic Appendectomy',
      conditionDate: '2015-08-20',
      category: 'surgery',
      notes: 'Uncomplicated recovery at City General Hospital',
      doctorName: null,
      source: 'self_reported',
      isActive: true,
    },
    {
      _id: 'mh_004',
      patientId,
      condition: 'Severe Acute Bronchitis',
      conditionDate: '2024-11-05',
      category: 'illness',
      notes: 'Treated with 5-day course of Azithromycin',
      doctorName: 'Dr. Ramesh Kulkarni',
      source: 'doctor-verified',
      isActive: true,
    },
  ];

  const prescriptionEntries = [
    {
      _id: 'rx_active_01',
      patientId,
      doctorId: docId,
      doctorName: 'Dr. Ramesh Kulkarni',
      appointmentId: currentAptId,
      diagnosis: 'Hypertension & Angina prophylaxis',
      status: 'active',
      startDate: todayStr,
      medications: [
        {
          medicineName: 'Amlodipine Besylate',
          dosage: '5mg',
          frequency: 'Once daily morning',
          durationDays: 30,
          instructions: 'Take after breakfast',
          mealRelation: 'after_meal',
        },
        {
          medicineName: 'Metoprolol Succinate ER',
          dosage: '25mg',
          frequency: 'Once daily morning',
          durationDays: 30,
          instructions: 'Monitor pulse rate',
          mealRelation: 'after_meal',
        },
      ],
      instructions: 'Keep sublingual nitroglycerin handy for acute episodes.',
    },
    {
      _id: 'rx_past_01',
      patientId,
      doctorId: docId,
      doctorName: 'Dr. Ramesh Kulkarni',
      appointmentId: pastAptId,
      diagnosis: 'Acute Bronchitis',
      status: 'completed',
      startDate: '2024-11-05',
      endDate: '2024-11-12',
      medications: [
        {
          medicineName: 'Azithromycin',
          dosage: '500mg',
          frequency: 'Once daily',
          durationDays: 5,
          instructions: 'Complete full antibiotic course',
          mealRelation: 'after_meal',
        },
      ],
      instructions: 'Rest and hydrate.',
    },
  ];

  const testOrderEntries = [
    {
      _id: 'test_001',
      patientId,
      doctorId: docId,
      doctorName: 'Dr. Ramesh Kulkarni',
      testName: '12-Lead Resting Electrocardiogram (ECG)',
      reason: 'Evaluate ST-T changes during chest tightness',
      status: 'completed',
      createdAt: todayStr,
      completedAt: todayStr,
      result: {
        value: 'Sinus rhythm with mild T-wave flattening in leads V4-V6',
        unit: '',
        labName: 'Apex Diagnostic Services',
        reportFile: { fileName: 'ecg_suresh_menon_2026.pdf' },
      },
    },
    {
      _id: 'test_002',
      patientId,
      doctorId: docId,
      doctorName: 'Dr. Ramesh Kulkarni',
      testName: 'Serum Troponin I (High Sensitivity)',
      reason: 'Rule out acute myocardial infarction',
      status: 'completed',
      createdAt: todayStr,
      completedAt: todayStr,
      result: {
        value: '0.012',
        unit: 'ng/mL',
        labName: 'Apex Diagnostic Services',
        reportFile: { fileName: 'trop_i_report.pdf' },
      },
    },
  ];

  const carePlanEntries = [
    {
      _id: 'cp_001',
      patientId,
      doctorId: docId,
      doctorName: 'Dr. Ramesh Kulkarni',
      diagnosis: 'Cardiovascular Risk Management',
      treatmentPlan: 'Aggressive BP control, anti-platelet therapy, and cardiac stress testing follow-up',
      dietRecommended: ['DASH Low-Sodium Diet (<2g Na/day)', 'High soluble fiber foods'],
      dietRestricted: ['High saturated fats', 'Processed meats', 'Excess caffeine'],
      activitiesRecommended: ['30 mins moderate walking 5x/week as tolerated'],
      activitiesRestricted: ['Heavy weightlifting', 'High-intensity interval training pending stress test'],
      followUpDate: '2026-09-24',
      instructions: 'Go to emergency immediately if chest pain lasts > 15 minutes or radiates to left arm.',
      createdAt: new Date(todayStr),
    },
  ];

  const accessGrant = {
    _id: 'grant_901',
    doctorId: docId,
    patientId,
    scope: 'all',
    revokedAt: null,
  };

  beforeEach(() => {
    clearDoctorWorkspaceTestDb();
    seedDoctorWorkspaceTestDb({
      doctors: { [docId]: doctorProfile },
      patients: { [patientId]: patientRecord },
      appointments: [currentAppointment, pastAppointment],
      grants: [accessGrant],
      histories: medicalHistoryEntries,
      prescriptions: prescriptionEntries,
      testOrders: testOrderEntries,
      carePlans: carePlanEntries,
    });
  });

  it('1. PATIENT OVERVIEW: Returns complete demographics, ABHA ID, blood group, allergies, and computed BMI', async () => {
    const encounter = await getPatientEncounter({ appointmentId: currentAptId, doctorId: docId });

    assert.equal(encounter.consent.isAuthorized, true);
    const overview = encounter.patientOverview;
    assert.ok(overview, 'Patient overview must exist');
    assert.equal(overview.name, 'Suresh Menon');
    assert.equal(overview.age, 54);
    assert.equal(overview.gender, 'male');
    assert.equal(overview.bloodGroup, 'O+');
    assert.deepEqual(overview.allergies, ['Penicillin', 'Sulfa Drugs']);
    assert.equal(overview.height, 172);
    assert.equal(overview.weight, 78);
    assert.equal(overview.bmi, 26.4); // 78 / (1.72^2) = 26.36 -> 26.4
    assert.equal(overview.bmiCategory, 'Overweight');
    assert.ok(overview.emergencyContact.includes('Wife'));
  });

  it('2. CURRENT VISIT: Returns chief complaint, symptoms, duration, vitals, observations, and doctor notes', async () => {
    const encounter = await getPatientEncounter({ appointmentId: currentAptId, doctorId: docId });
    const visit = encounter.currentVisit;

    assert.ok(visit, 'Current visit must exist');
    assert.equal(visit.appointmentId, currentAptId);
    assert.equal(visit.slotTime, '10:30 AM');
    assert.equal(visit.status, 'in-progress');
    assert.equal(visit.priority, 'urgent');
    assert.equal(visit.chiefComplaint, 'Chest tightness, exertional dyspnea for 3 days');
    assert.deepEqual(visit.symptoms, ['Chest tightness', 'Exertional dyspnea', 'Fatigue']);
    assert.equal(visit.duration, '3 days');

    // Vitals
    assert.equal(visit.vitals.bp, '142/90 mmHg');
    assert.equal(visit.vitals.heartRate, 88);
    assert.equal(visit.vitals.temperature, '98.8 °F');
    assert.equal(visit.vitals.spO2, '97%');
    assert.equal(visit.vitals.respiratoryRate, 18);

    // Observations & Notes
    assert.ok(visit.currentObservations.includes('bilateral basal crackles'));
    assert.ok(visit.doctorNotes.includes('Initiate ECG'));
    assert.equal(visit.doctorName, 'Dr. Ramesh Kulkarni');
  });

  it('3. MEDICAL HISTORY: Returns categorized illnesses, diagnoses, surgeries, chronic conditions, and allergies', async () => {
    const encounter = await getPatientEncounter({ appointmentId: currentAptId, doctorId: docId });
    const medHistory = encounter.medicalHistory;

    assert.ok(medHistory, 'Medical history must exist');
    assert.deepEqual(medHistory.allergies, ['Penicillin', 'Sulfa Drugs']);

    // Chronic conditions (Hypertension, Diabetes)
    assert.equal(medHistory.chronicConditions.length, 2);
    const hasHTN = medHistory.chronicConditions.some((c) => c.condition.includes('Hypertension'));
    const hasDM = medHistory.chronicConditions.some((c) => c.condition.includes('Diabetes'));
    assert.ok(hasHTN, 'Must have Hypertension chronic condition');
    assert.ok(hasDM, 'Must have Diabetes chronic condition');

    // Surgeries
    assert.equal(medHistory.previousSurgeries.length, 1);
    assert.equal(medHistory.previousSurgeries[0].condition, 'Laparoscopic Appendectomy');

    // Previous Illnesses
    assert.equal(medHistory.previousIllnesses.length, 1);
    assert.equal(medHistory.previousIllnesses[0].condition, 'Severe Acute Bronchitis');
  });

  it('4. PREVIOUS VISITS: Returns past completed encounters with doctor, hospital, diagnosis, treatment, and prescriptions', async () => {
    const encounter = await getPatientEncounter({ appointmentId: currentAptId, doctorId: docId });
    const previousVisits = encounter.previousVisits;

    assert.ok(Array.isArray(previousVisits));
    assert.equal(previousVisits.length, 1, 'Should find 1 past visit (excluding current visit)');

    const past = previousVisits[0];
    assert.equal(past.appointmentId, pastAptId);
    assert.equal(past.date, pastDateStr);
    assert.equal(past.doctor, 'Dr. Ramesh Kulkarni');
    assert.equal(past.hospitalName, 'Apex Heart & Multispecialty Hospital');
    assert.equal(past.reasonForVisit, 'Routine hypertension follow-up');
    assert.equal(past.diagnosis, 'Essential Hypertension Stage I');
  });

  it('5. PRESCRIPTIONS: Categorizes active current medicines vs past completed medicines with dosage and frequency', async () => {
    const encounter = await getPatientEncounter({ appointmentId: currentAptId, doctorId: docId });
    const rxs = encounter.prescriptions;

    assert.ok(rxs, 'Prescriptions segment must exist');
    assert.equal(rxs.currentMedicines.length, 2, 'Should have 2 active cardiac medicines');
    assert.equal(rxs.previousMedicines.length, 1, 'Should have 1 past antibiotic medicine');

    const amlodipine = rxs.currentMedicines.find((m) => m.medicineName.includes('Amlodipine'));
    assert.ok(amlodipine);
    assert.equal(amlodipine.dosage, '5mg');
    assert.equal(amlodipine.frequency, 'Once daily morning');
    assert.equal(amlodipine.durationDays, 30);
    assert.equal(amlodipine.instructions, 'Take after breakfast');

    const azithro = rxs.previousMedicines.find((m) => m.medicineName.includes('Azithromycin'));
    assert.ok(azithro);
    assert.equal(azithro.status, 'completed');
  });

  it('6. TESTS & REPORTS: Returns diagnostic test orders, structured results, and lab report attachments', async () => {
    const encounter = await getPatientEncounter({ appointmentId: currentAptId, doctorId: docId });
    const tests = encounter.testReports;

    assert.equal(tests.length, 2);
    const ecg = tests.find((t) => t.testName.includes('ECG'));
    assert.ok(ecg);
    assert.equal(ecg.orderedBy, 'Dr. Ramesh Kulkarni');
    assert.equal(ecg.status, 'completed');
    assert.ok(ecg.result.includes('Sinus rhythm'));
    assert.equal(ecg.labName, 'Apex Diagnostic Services');
    assert.equal(ecg.hasReport, true);
  });

  it('7. CARE PLAN: Returns diagnosis, treatment goals, diet/activity recommendations, and instructions', async () => {
    const encounter = await getPatientEncounter({ appointmentId: currentAptId, doctorId: docId });
    const carePlans = encounter.carePlan;

    assert.equal(carePlans.length, 1);
    const cp = carePlans[0];
    assert.equal(cp.diagnosis, 'Cardiovascular Risk Management');
    assert.ok(cp.dietRecommended.some((d) => d.includes('DASH')));
    assert.ok(cp.activitiesRestricted.some((a) => a.includes('weightlifting')));
    assert.equal(cp.followUpDate, '2026-09-24');
    assert.ok(cp.instructions.includes('emergency'));
  });

  it('8. TIMELINE: Produces unified chronological patient medical timeline sorted newest first', async () => {
    const encounter = await getPatientEncounter({ appointmentId: currentAptId, doctorId: docId });
    const timeline = encounter.timeline;

    assert.ok(timeline.length >= 5, 'Timeline must integrate visits, diagnoses, rx, tests, care plans');

    // Verify chronological order (newest date first)
    for (let i = 0; i < timeline.length - 1; i++) {
      assert.ok(
        (timeline[i].date || '') >= (timeline[i + 1].date || ''),
        `Timeline must be sorted descending: ${timeline[i].date} vs ${timeline[i + 1].date}`
      );
    }

    const types = new Set(timeline.map((e) => e.type));
    assert.ok(types.has('visit'), 'Timeline must include visits');
    assert.ok(types.has('diagnosis') || types.has('surgery'), 'Timeline must include diagnoses/surgeries');
    assert.ok(types.has('prescription'), 'Timeline must include prescriptions');
    assert.ok(types.has('test'), 'Timeline must include diagnostic tests');
    assert.ok(types.has('care_plan'), 'Timeline must include care plans');
  });

  it('9. UPDATE CURRENT VISIT: Allows updating vitals, clinical observations, and notes', async () => {
    const updated = await updateEncounterCurrentVisit({
      appointmentId: currentAptId,
      doctorId: docId,
      symptoms: ['Chest tightness', 'Exertional dyspnea', 'Palpitations'],
      duration: '4 days',
      vitals: { bp: '136/84 mmHg', heartRate: 80, spO2: '98%' },
      currentObservations: 'Observations updated after 30-min rest: BP improved to 136/84.',
      clinicalNotes: 'ECG reviewed: No acute STEMI changes. Outpatient stress test advised.',
      diagnosis: 'Stable Angina / Non-cardiac chest discomfort under review',
    });

    assert.ok(updated);
    assert.equal(updated.duration, '4 days');
    assert.equal(updated.vitals.bp, '136/84 mmHg');
    assert.equal(updated.vitals.heartRate, 80);
    assert.ok(updated.currentObservations.includes('rest: BP improved'));
    assert.ok(updated.clinicalNotes.includes('No acute STEMI'));
  });

  it('10. SECURITY ROLE GUARD: Blocks reception and patients from accessing doctor clinical workspace', async () => {
    const roleGuard = requireRole('doctor', 'admin', 'clinic_manager');

    // 1. Reception user attempting access
    const receptionUser = { _id: 'user_rec_001', role: 'reception', name: 'Front Desk' };
    const receptionToken = generateToken(receptionUser);
    const mockReqReception = {
      headers: { authorization: `Bearer ${receptionToken}` },
      user: receptionUser,
    };
    const mockResReception = {
      statusCode: null,
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(payload) {
        this.body = payload;
        return this;
      },
    };

    let receptionNextCalled = false;
    roleGuard(mockReqReception, mockResReception, () => {
      receptionNextCalled = true;
    });
    assert.equal(mockResReception.statusCode, 403, 'Reception staff must be rejected with 403 Forbidden');
    assert.equal(receptionNextCalled, false, 'Next middleware must not be called for unauthorized reception');

    // 2. Normal patient user attempting access
    const patientUser = { _id: 'user_pat_002', role: 'patient', name: 'General Patient' };
    const patientToken = generateToken(patientUser);
    const mockReqPatient = {
      headers: { authorization: `Bearer ${patientToken}` },
      user: patientUser,
    };
    const mockResPatient = {
      statusCode: null,
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(payload) {
        this.body = payload;
        return this;
      },
    };

    let patientNextCalled = false;
    roleGuard(mockReqPatient, mockResPatient, () => {
      patientNextCalled = true;
    });
    assert.equal(mockResPatient.statusCode, 403, 'Patient must be rejected with 403 Forbidden');
    assert.equal(patientNextCalled, false, 'Next middleware must not be called for unauthorized patient');

    // 3. Authorized doctor allowed
    const doctorUser = { _id: docId, role: 'doctor', name: 'Dr. Ramesh Kulkarni' };
    const docToken = generateToken(doctorUser);
    let doctorAllowed = false;
    const mockReqDoctor = {
      headers: { authorization: `Bearer ${docToken}` },
      user: doctorUser,
    };
    const mockResDoctor = {
      statusCode: null,
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(payload) {
        this.body = payload;
        return this;
      },
    };
    roleGuard(mockReqDoctor, mockResDoctor, (err) => {
      if (!err) {
        doctorAllowed = true;
      }
    });
    assert.equal(doctorAllowed, true, 'Authorized doctor must be permitted');
    assert.equal(mockResDoctor.statusCode, null, 'Doctor should not receive error status');
  });
});
