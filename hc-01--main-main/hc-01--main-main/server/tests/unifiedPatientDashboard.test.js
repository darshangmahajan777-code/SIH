import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateBMI,
  calculateProfileCompletion,
  generateTodayDoseSchedule,
  getPatientDashboardData,
  updatePatientProfile,
  updateDoseStatus,
  clearPatientDashboardTestDb,
} from '../services/patientDashboardService.js';

describe('TEST SUITE: Unified Patient Dashboard & Integrated Health Hub', () => {
  const NEW_PATIENT_ID = 'pat-new-001';
  const ACTIVE_PATIENT_ID = 'pat-active-002';

  beforeEach(() => {
    clearPatientDashboardTestDb();
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 1. BMI Calculation & Categorization
  // ───────────────────────────────────────────────────────────────────────────
  it('should accurately calculate BMI and assign proper health categories', () => {
    // Normal weight: 70kg, 175cm -> 22.9
    const normal = calculateBMI(70, 175);
    assert.equal(normal.value, 22.9);
    assert.equal(normal.category, 'Normal');
    assert.equal(normal.color, 'emerald');

    // Underweight: 48kg, 175cm -> 15.7
    const under = calculateBMI(48, 175);
    assert.equal(under.value, 15.7);
    assert.equal(under.category, 'Underweight');
    assert.equal(under.color, 'amber');

    // Overweight: 80kg, 175cm -> 26.1
    const over = calculateBMI(80, 175);
    assert.equal(over.value, 26.1);
    assert.equal(over.category, 'Overweight');

    // Obese: 95kg, 170cm -> 32.9
    const obese = calculateBMI(95, 170);
    assert.equal(obese.value, 32.9);
    assert.equal(obese.category, 'Obese');
    assert.equal(obese.color, 'rose');

    // Missing data
    const missing = calculateBMI(null, 175);
    assert.equal(missing.value, null);
    assert.equal(missing.category, 'Not Recorded');
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 2. Profile Completion Score
  // ───────────────────────────────────────────────────────────────────────────
  it('should compute profile completion percentage and identify missing fields', () => {
    // Basic user with only name and email
    const basicUser = {
      name: 'John Doe',
      email: 'john@example.com',
    };
    const basicScore = calculateProfileCompletion(basicUser);
    assert.equal(basicScore.percentage, 30); // 15 + 15
    assert.ok(basicScore.missingFields.includes('Phone Number'));
    assert.ok(basicScore.missingFields.includes('Blood Group'));

    // Fully populated user
    const fullUser = {
      name: 'Jane Doe',
      email: 'jane@example.com',
      phone: '+91 99999 88888',
      age: 28,
      gender: 'female',
      bloodGroup: 'B+',
      height: 165,
      weight: 58,
      allergies: ['Penicillin'],
      emergencyContact: { name: 'Bob', phone: '+91 99999 77777', relation: 'Spouse' },
    };
    const fullScore = calculateProfileCompletion(fullUser);
    assert.equal(fullScore.percentage, 100);
    assert.equal(fullScore.missingFields.length, 0);
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 3. New Patient Scenario (Empty State, No Records)
  // ───────────────────────────────────────────────────────────────────────────
  it('should gracefully handle a new patient with no previous medical or appointment records', async () => {
    // Seed new patient in memory
    await updatePatientProfile(NEW_PATIENT_ID, {
      name: 'New Patient User',
      email: 'newpatient@example.com',
      bloodGroup: 'unknown',
      height: null,
      weight: null,
      allergies: [],
    });

    const dashboard = await getPatientDashboardData(NEW_PATIENT_ID);

    assert.ok(dashboard.patient);
    assert.equal(dashboard.patient.id, NEW_PATIENT_ID);
    assert.equal(dashboard.patient.bloodGroup, 'unknown');
    assert.equal(dashboard.patient.bmi.value, null);

    // Primary actions should reflect empty active states
    assert.equal(dashboard.primaryActions.activeQueue, null, 'no active queue token');
    assert.equal(dashboard.primaryActions.nextAppointment, null, 'no booked appointment');
    assert.equal(dashboard.primaryActions.upcomingCount, 0);
    assert.equal(dashboard.primaryActions.medicineSchedule.totalToday, 0);

    // Health records should be empty arrays without errors
    assert.equal(dashboard.healthSnapshot.recentHistory.length, 0);
    assert.equal(dashboard.healthSnapshot.recentTests.length, 0);
    assert.equal(dashboard.healthSnapshot.activeCarePlan, null);

    // Recommended doctors should be available for discovery
    assert.ok(dashboard.discovery.recommendedDoctors.length > 0, 'discovery recommended doctors provided');
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 4. Medicine Schedule & Next Dose Engine
  // ───────────────────────────────────────────────────────────────────────────
  it('should generate accurate daily dose schedule and identify next dose', () => {
    const todayStr = new Date().toISOString().slice(0, 10);
    const mockPrescriptions = [
      {
        id: 'rx-1',
        status: 'active',
        startDate: todayStr,
        endDate: todayStr,
        doctorName: 'Dr. Evelyn Reed',
        medications: [
          {
            medicineName: 'Amoxicillin 500mg',
            dosage: '1 capsule',
            doseTimes: ['08:00', '14:00', '20:00'],
            mealRelation: 'after_meal',
          },
          {
            medicineName: 'Paracetamol 650mg',
            dosage: '1 tablet',
            doseTimes: ['10:00', '22:00'],
            mealRelation: 'with_meal',
          },
        ],
        doseLogs: [
          {
            date: todayStr,
            medicineName: 'Amoxicillin 500mg',
            scheduledTime: '08:00',
            status: 'taken',
            takenAt: new Date(),
          },
        ],
      },
    ];

    const schedule = generateTodayDoseSchedule(mockPrescriptions, todayStr);

    assert.equal(schedule.totalToday, 5, '3 Amoxicillin doses + 2 Paracetamol doses = 5 total today');
    assert.equal(schedule.takenCount, 1, '1 dose already logged as taken');
    assert.equal(schedule.pendingCount, 4, '4 doses pending');
    assert.ok(schedule.nextDose, 'next upcoming dose is identified');
    assert.ok(schedule.nextDose.scheduledTime);
    assert.ok(schedule.nextDose.medicineName);

    // Doses are chronologically sorted
    for (let i = 0; i < schedule.doses.length - 1; i++) {
      assert.ok(schedule.doses[i].scheduledTime <= schedule.doses[i + 1].scheduledTime);
    }
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 5. Patient Profile & Vitals Update
  // ───────────────────────────────────────────────────────────────────────────
  it('should update patient vitals, recalculate BMI, and increase completion percentage', async () => {
    const res = await updatePatientProfile(ACTIVE_PATIENT_ID, {
      height: 170,
      weight: 65,
      bloodGroup: 'A+',
      age: 30,
      gender: 'male',
      allergies: ['Dust', 'Shellfish'],
    });

    assert.equal(res.user.height, 170);
    assert.equal(res.user.weight, 65);
    assert.equal(res.user.bloodGroup, 'A+');
    assert.equal(res.bmi.value, 22.5);
    assert.equal(res.bmi.category, 'Normal');
    assert.ok(res.profileCompletion.percentage >= 80);
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 6. Dose Status Toggle (Taken / Skipped)
  // ───────────────────────────────────────────────────────────────────────────
  it('should record dose status updates for medication compliance', async () => {
    const result = await updateDoseStatus({
      patientId: ACTIVE_PATIENT_ID,
      prescriptionId: 'rx-mock-1',
      doseId: 'rx-mock-1_0_1400',
      status: 'taken',
    });

    assert.equal(result.success, true);
    assert.equal(result.status, 'taken');
    assert.equal(result.prescriptionId, 'rx-mock-1');

    // Invalid status rejected
    await assert.rejects(
      async () => {
        await updateDoseStatus({
          patientId: ACTIVE_PATIENT_ID,
          prescriptionId: 'rx-mock-1',
          doseId: 'dose-1',
          status: 'invalid_status',
        });
      },
      (err) => {
        assert.equal(err.status, 400);
        assert.ok(err.message.includes('Invalid status'));
        return true;
      }
    );
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 7. Data Structure & Cohesive Organization
  // ───────────────────────────────────────────────────────────────────────────
  it('should return a complete coherent payload structure with no missing sections', async () => {
    const data = await getPatientDashboardData(ACTIVE_PATIENT_ID);

    // Required top-level sections
    assert.ok(data.patient, 'contains patient top section');
    assert.ok(data.primaryActions, 'contains primary action section');
    assert.ok(data.healthSnapshot, 'contains health snapshot section');
    assert.ok(data.discovery, 'contains discovery section');
    assert.ok(data.meta, 'contains meta section');

    // Primary action sub-keys
    assert.ok('activeQueue' in data.primaryActions);
    assert.ok('nextAppointment' in data.primaryActions);
    assert.ok('medicineSchedule' in data.primaryActions);

    // Health snapshot sub-keys
    assert.ok('bmi' in data.healthSnapshot);
    assert.ok('bloodGroup' in data.healthSnapshot);
    assert.ok('allergies' in data.healthSnapshot);
    assert.ok('recentHistory' in data.healthSnapshot);
    assert.ok('recentTests' in data.healthSnapshot);
    assert.ok('activeCarePlan' in data.healthSnapshot);
  });
});
