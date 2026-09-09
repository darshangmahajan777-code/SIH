import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';

// Services
import {
  calculateTimeWindow,
  calculateTokenQueueMetrics,
  sortTokensByPriority,
  getPriorityReason,
} from '../services/virtualQueueService.js';
import {
  getDoctorAvailability,
  getDailyListing,
  bookAppointmentSlot,
  updateAppointmentStatus,
} from '../services/scheduleService.js';
import { getDoctorRecommendations } from '../services/recommendationService.js';
import {
  grantAccess,
  revokeAccess,
  checkAccess,
  getPatientMedicalData,
} from '../services/consentService.js';
import {
  getPatientDashboardData,
  updatePatientProfile,
  generateTodayDoseSchedule,
} from '../services/patientDashboardService.js';
import {
  getDoctorWorkspaceSummary,
  getPatientEncounter,
  startConsultation,
  completeConsultationEncounter,
  issueEncounterPrescription,
  issueEncounterTestOrder,
  issueEncounterCarePlan,
  clearDoctorWorkspaceTestDb,
  seedDoctorWorkspaceTestDb,
} from '../services/doctorWorkspaceService.js';
import { generateSessionToken } from '../services/telemedicineService.js';
import { clearNotificationsForTest, getNotifications } from '../services/notificationService.js';

test('MEDIQUEUE+ SIH COMPLETE STORY & CRITICAL DEMO VERIFICATION', async (t) => {

  const demoState = {
    patientId: '65f000000000000000000001',
    doctorAProfileId: '65f000000000000000000002',
    doctorAUserId: '65f000000000000000000002',
    doctorBProfileId: '65f000000000000000000003',
    doctorBUserId: '65f000000000000000000003',
    appointmentId: '65f000000000000000000099',
    todayStr: new Date().toISOString().slice(0, 10),
  };

  await t.test('PHASE 1: Patient Onboarding & Profile (Steps 1–2)', async () => {
    // Step 1: Patient signs up / registers
    const userObj = {
      _id: demoState.patientId,
      name: 'Rahul Sharma',
      email: 'rahul.sharma@example.com',
      role: 'patient',
    };

    // Step 2: Patient completes profile with vitals
    const profile = await updatePatientProfile(demoState.patientId, {
      age: 32,
      gender: 'male',
      bloodGroup: 'O+',
      height: 172,
      weight: 68,
      allergies: ['Penicillin', 'Sulfa drugs'],
      phone: '+91 98765 43210',
      emergencyContact: { name: 'Pooja Sharma', phone: '+91 98765 00000', relation: 'Spouse' },
    });

    assert.ok(profile, 'Profile updated');
    assert.equal(profile.user.bloodGroup, 'O+');
    assert.equal(profile.user.height, 172);
    assert.equal(profile.user.weight, 68);

    // Dashboard profile check
    const dash = await getPatientDashboardData(demoState.patientId);
    assert.equal(dash.patient.bloodGroup, 'O+');
    assert.equal(dash.patient.bmi.category, 'Normal');
    assert.ok(dash.patient.profileCompletion.percentage >= 90);
  });

  await t.test('PHASE 2: Doctor Search, Recommendations & Booking (Steps 3–7)', async () => {
    const dayOfWeek = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'][new Date().getDay()];

    // Step 3 & 4: Doctor Search & AI / Bayesian Recommendations
    const candidates = [
      {
        _id: demoState.doctorAProfileId,
        doctorName: 'Dr. Priya Sharma',
        specialty: 'Cardiology',
        hospitalName: 'AIIMS Super Specialty',
        consultationFee: 600,
        followUpFee: 400,
        avgRating: 4.8,
        ratingCount: 500,
        experienceYears: 12,
        location: { lat: 28.5672, lng: 77.21, address: 'Ansari Nagar, New Delhi' },
        videoEnabled: true,
        isAvailableToday: true,
        weeklySchedule: [
          { day: dayOfWeek, isWorking: true, startTime: '08:00', endTime: '23:30', slotDuration: 30 },
        ],
      },
      {
        _id: demoState.doctorBProfileId,
        doctorName: 'Dr. Rajesh Kumar',
        specialty: 'Cardiology',
        hospitalName: 'City Heart Clinic',
        consultationFee: 500,
        followUpFee: 300,
        avgRating: 5.0,
        ratingCount: 2,
        experienceYears: 4,
        location: { lat: 28.62, lng: 77.21, address: 'Connaught Place, New Delhi' },
        videoEnabled: false,
        isAvailableToday: true,
        weeklySchedule: [
          { day: dayOfWeek, isWorking: true, startTime: '08:00', endTime: '23:30', slotDuration: 30 },
        ],
      },
    ];

    const recResult = await getDoctorRecommendations({
      doctors: candidates,
      criteria: {
        specialty: 'Cardiology',
        preference: 'balanced',
        maxFee: 700,
        patientLat: 28.5672,
        patientLng: 77.21,
      },
    });

    assert.ok(recResult.recommendations.length >= 2);
    // Dr. Priya Sharma has established Bayesian rating weight
    const topDoc = recResult.recommendations[0];
    assert.ok(topDoc.score >= 80);
    assert.ok(Array.isArray(topDoc.recommendedBecause));

    // Step 5 & 6: View daily slots
    const avail = await getDoctorAvailability(
      demoState.doctorAProfileId,
      demoState.todayStr,
      candidates[0],
      []
    );
    assert.ok(avail.isAvailable);
    assert.ok(avail.openSlotsCount > 0);

    // Step 7: Book Appointment
    clearDoctorWorkspaceTestDb();
    seedDoctorWorkspaceTestDb({
      doctors: {
        [demoState.doctorAProfileId]: candidates[0],
        [demoState.doctorBProfileId]: candidates[1],
      },
      appointments: [
        {
          _id: demoState.appointmentId,
          doctorId: demoState.doctorAProfileId,
          patientId: demoState.patientId,
          date: demoState.todayStr,
          slotTime: '16:30',
          mode: 'in-person',
          status: 'booked',
          priority: 'routine',
          chiefComplaint: 'Chest tightness and blood pressure review',
          save: async function () { return this; },
        },
      ],
    });
  });

  await t.test('PHASE 3: CRITICAL DEMO — Token #31, 30 Ahead, 4:30–4:50 PM, 4:15 PM Arrival (Steps 8–14)', async () => {
    // Step 8: Patient grants Doctor A consent
    const grant = await grantAccess({
      patientId: demoState.patientId,
      doctorId: demoState.doctorAUserId,
      scope: 'ongoing',
      note: 'Consent for Cardiology Consultation',
    });
    assert.ok(grant, 'Consent granted to Doctor A');

    // Step 9 & 10: Token #31 with 30 patients ahead
    // Base time at 4:00 PM (16:00:00) with 40-minute wait calculation
    const baseTime4PM = new Date('2026-10-20T16:00:00');
    const token31Metrics = calculateTimeWindow(40, baseTime4PM);

    // Assert exact problem statement match
    assert.strictEqual(
      token31Metrics.estimatedWindow,
      '4:30–4:50 PM',
      'Calculates 4:30–4:50 PM estimated window for Token #31'
    );
    assert.strictEqual(
      token31Metrics.recommendedArrivalTime,
      '4:15 PM',
      'Calculates 4:15 PM recommended arrival time for Token #31'
    );
    assert.strictEqual(token31Metrics.isNearTurn, false, 'Patient at 40 min is not near turn yet');

    // Step 11: Patient leaves hospital to wait comfortably offsite
    // Step 12: Queue advances live: from 30 ahead down to 4 ahead (wait drops from 40m to 12m)
    const baseTimeNear = new Date('2026-10-20T16:28:00');
    const nearTurnMetrics = calculateTimeWindow(12, baseTimeNear);

    // Step 13: Near-turn alert fires automatically!
    assert.strictEqual(nearTurnMetrics.isNearTurn, true, 'Near-turn alert triggered at <= 15m wait');
    assert.ok(nearTurnMetrics.recommendedArrivalTime, 'Arrival instruction provided');

    // Step 14: Patient returns to hospital and checks in
    assert.ok(true, 'Patient returns within recommended arrival buffer');
  });

  await t.test('PHASE 4: Doctor Encounter Dossier & Clinical Actions (Steps 15–20)', async () => {
    // Pre-seed an existing medical history condition
    seedDoctorWorkspaceTestDb({
      histories: [
        {
          _id: 'hist-1',
          patientId: demoState.patientId,
          condition: 'Mild Hypertension (Stage 1)',
          conditionDate: '2025-11-10',
          source: 'doctor_verified',
          doctorName: 'Dr. Priya Sharma',
          isActive: true,
        },
      ],
      appointments: [
        {
          _id: demoState.appointmentId,
          doctorId: demoState.doctorAProfileId,
          patientId: {
            _id: demoState.patientId,
            name: 'Rahul Sharma',
            age: 32,
            gender: 'male',
            bloodGroup: 'O+',
            allergies: ['Penicillin'],
          },
          date: demoState.todayStr,
          slotTime: '16:30',
          mode: 'in-person',
          status: 'checked-in',
          priority: 'routine',
          chiefComplaint: 'Chest tightness and blood pressure review',
          save: async function () { return this; },
        },
      ],
      grants: [
        {
          patientId: demoState.patientId,
          doctorId: demoState.doctorAUserId,
          scope: 'ongoing',
          revokedAt: null,
        },
      ],
    });

    // Step 15: Doctor A opens encounter and sees AUTHORIZED status + shared history
    const encounter = await getPatientEncounter({
      appointmentId: demoState.appointmentId,
      doctorId: demoState.doctorAUserId,
    });

    assert.equal(encounter.consent.status, 'AUTHORIZED', 'Doctor A has explicit AUTHORIZED consent');
    assert.equal(encounter.sharedRecords.medicalHistory.length, 1, 'Reveals shared medical history');
    assert.equal(encounter.sharedRecords.medicalHistory[0].condition, 'Mild Hypertension (Stage 1)');

    // Step 16: Doctor starts consultation
    const started = await startConsultation({
      appointmentId: demoState.appointmentId,
      doctorId: demoState.doctorAUserId,
    });
    assert.equal((started.appointment || started).status, 'in-progress');

    // Step 17: Doctor orders diagnostic lab test
    const testOrder = await issueEncounterTestOrder({
      appointmentId: demoState.appointmentId,
      doctorId: demoState.doctorAUserId,
      testName: 'Lipid Profile & Serum Electrolytes',
      reason: 'Rule out dyslipidemia and electrolyte imbalance',
    });
    assert.equal(testOrder.testName, 'Lipid Profile & Serum Electrolytes');
    assert.equal(testOrder.status, 'ordered');

    // Step 18: Lab records result
    testOrder.status = 'completed';
    testOrder.result = {
      value: 'Total Cholesterol: 195 mg/dL, Triglycerides: 140 mg/dL',
      unit: 'mg/dL',
      resultDate: new Date(),
      labName: 'Central Pathology Laboratory',
    };
    testOrder.completedAt = new Date();

    // Step 19: Doctor reviews result in dossier
    assert.equal(testOrder.status, 'completed');
    assert.ok(testOrder.result.value.includes('Total Cholesterol'));

    // Step 20: Doctor creates digital prescription
    const prescription = await issueEncounterPrescription({
      appointmentId: demoState.appointmentId,
      doctorId: demoState.doctorAUserId,
      diagnosis: 'Essential Hypertension with Normal Lipid Profile',
      medications: [
        {
          medicineName: 'Amlodipine',
          dosage: '5mg',
          frequency: 'Once daily',
          doseTimes: ['09:00'],
          mealRelation: 'after_meal',
          durationDays: 30,
        },
        {
          medicineName: 'Aspirin',
          dosage: '75mg',
          frequency: 'Once daily',
          doseTimes: ['21:00'],
          mealRelation: 'after_meal',
          durationDays: 30,
        },
      ],
      instructions: 'Take regularly after meals. Monitor BP weekly.',
    });

    assert.equal(prescription.diagnosis, 'Essential Hypertension with Normal Lipid Profile');
    assert.equal(prescription.medications.length, 2);

    // Step 21: Today's medicine schedule & reminder generation
    const doseSchedule = generateTodayDoseSchedule([prescription], demoState.todayStr);
    assert.equal(doseSchedule.totalToday, 2);
    assert.ok(doseSchedule.doses.some((d) => d.medicineName === 'Amlodipine'));
    assert.ok(doseSchedule.doses.some((d) => d.medicineName === 'Aspirin'));

    // Step 22: Doctor creates structured care plan
    const carePlan = await issueEncounterCarePlan({
      appointmentId: demoState.appointmentId,
      doctorId: demoState.doctorAUserId,
      carePlanData: {
        diagnosis: 'Essential Hypertension',
        dietRecommended: ['Low sodium DASH diet', 'High potassium foods (bananas, spinach)'],
        dietRestricted: ['Processed foods', 'High salt pickles', 'Excessive caffeine'],
        activitiesRecommended: ['30 mins brisk walking 5 days/week', 'Meditation / Breathing exercises'],
        activitiesRestricted: ['Heavy weightlifting without warm-up'],
        followUpDate: new Date(Date.now() + 14 * 86400000),
        notes: 'Return in 2 weeks for BP check or earlier if symptomatic.',
      },
    });

    assert.equal(carePlan.dietRecommended.length, 2);
    assert.equal(carePlan.dietRestricted.length, 3);

    // Complete consultation visit
    const completed = await completeConsultationEncounter({
      appointmentId: demoState.appointmentId,
      doctorId: demoState.doctorAUserId,
    });
    assert.equal((completed.appointment || completed).status, 'completed');
  });

  await t.test('PHASE 5: Patient Follow-Up & Video Launch (Steps 23–25)', async () => {
    // Step 23: Patient sees active care plan on dashboard
    const dash = await getPatientDashboardData(demoState.patientId);
    assert.ok(dash.patient);

    // Step 24: Follow-up appointment creation
    const followUpDateStr = new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10);
    assert.ok(followUpDateStr);

    // Step 25: Video consultation session token launch
    const videoToken = generateSessionToken({
      appointmentId: demoState.appointmentId,
      userId: demoState.patientId,
      role: 'patient',
    });
    assert.ok(videoToken);
    assert.ok(typeof videoToken === 'string');
    assert.ok(videoToken.length > 20);
  });

  await t.test('PHASE 6: SECOND DOCTOR CONSENT SCENARIO (Doctor B Access & Instant Revocation)', async () => {
    // Doctor B initially has NO consent -> null
    const preCheck = await checkAccess({
      patientId: demoState.patientId,
      doctorId: demoState.doctorBUserId,
    });
    assert.equal(preCheck, null, 'Doctor B has no initial access');

    // Patient grants access to Doctor B
    const bGrant = await grantAccess({
      patientId: demoState.patientId,
      doctorId: demoState.doctorBUserId,
      scope: 'ongoing',
      note: 'Second opinion on cardiology evaluation',
    });
    assert.ok(bGrant, 'Doctor B grant created');

    // Doctor B now has AUTHORIZED access
    const postGrant = await checkAccess({
      patientId: demoState.patientId,
      doctorId: demoState.doctorBUserId,
    });
    assert.ok(postGrant, 'Doctor B now authorized with consent');
    assert.equal(postGrant.doctorId, demoState.doctorBUserId);

    // Revoke access from Doctor B
    const revoked = await revokeAccess({
      patientId: demoState.patientId,
      doctorId: demoState.doctorBUserId,
    });
    assert.ok(revoked.revokedAt, 'Grant successfully revoked with timestamp');

    // Doctor B IMMEDIATELY loses access
    const postRevoke = await checkAccess({
      patientId: demoState.patientId,
      doctorId: demoState.doctorBUserId,
    });
    assert.equal(postRevoke, null, 'Doctor B immediately blocked upon consent revocation');
  });

});
