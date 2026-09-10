/**
 * TEST SUITE: Doctor / Business Dashboard & Existing Queue Continuity
 *
 * Scenarios tested:
 *   1. Dashboard Aggregations (today's appointments, today's patients, current queue,
 *      waiting patients, completed consultations, upcoming appointments, notifications)
 *   2. Subscription Tier & Feature Status (plan, active status, days remaining, staff seats)
 *   3. Business Configuration & Settings Updates (fees, modes, clinic details, services)
 *   4. Practice Team & Staff Allotment (seat limits and role tracking)
 *   5. Existing Queue Continuity (Appointment -> Token -> Existing Queue -> Socket.IO)
 *   6. Role-Based Permissions (Doctor/Admin allowed; Patient blocked with 403; Unauth 401)
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  getDoctorBusinessDashboard,
  updateDoctorBusinessSettings,
  addStaffMemberToPractice,
  clearDoctorBusinessTestDb,
  seedDoctorBusinessTestDb,
} from '../services/doctorBusinessService.js';
import { authenticateUser, requireRole } from '../middleware/auth.js';
import { generateToken, verifyToken } from '../services/authService.js';
import {
  issueEncounterPrescription,
  clearDoctorWorkspaceTestDb,
  seedDoctorWorkspaceTestDb,
} from '../services/doctorWorkspaceService.js';

describe('TEST SUITE: Doctor / Business Dashboard', () => {
  const docId = 'doc_prof_001';
  const docUserId = 'user_doc_001';
  const pat1Id = 'user_pat_001';
  const pat2Id = 'user_pat_002';
  const pat3Id = 'user_pat_003';
  const todayStr = new Date().toISOString().slice(0, 10);
  const tomorrowStr = new Date(Date.now() + 86400000).toISOString().slice(0, 10);

  beforeEach(() => {
    clearDoctorBusinessTestDb();

    // Base Seed for Doctor Profile
    seedDoctorBusinessTestDb({
      doctors: {
        [docId]: {
          _id: docId,
          userId: docUserId,
          doctorName: 'Dr. Priya Sharma',
          specialty: 'Cardiology',
          hospitalName: 'AIIMS New Delhi',
          hospitalId: 'hosp_aiims',
          qualifications: ['MBBS', 'MD (Cardiology)', 'DM'],
          experienceYears: 12,
          medicalLicenseNumber: 'DMC-2014-43210',
          consultationFee: 800,
          followUpFee: 400,
          avgRating: 4.8,
          ratingCount: 36,
          services: ['General Consultation', 'ECG', 'Echocardiogram', 'Hypertension Management'],
          consultationModes: ['in-person', 'video'],
          clinicDetails: {
            clinicName: 'AIIMS Cardiac Outpatient Clinic',
            registrationNumber: 'REG-AIIMS-CARDIO-01',
            contactPhone: '+91-11-26588500',
            taxId: 'GSTIN-07AIIMS0000A1Z5',
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
          staffMembers: [
            {
              userId: 'user_rec_001',
              name: 'Suman Verma',
              role: 'receptionist',
              email: 'reception.demo@mediqueue.test',
              phone: '+91-9811122233',
            },
          ],
        },
      },
      appointments: [
        // Today's appointments
        {
          _id: 'apt_001',
          doctorId: docId,
          patientId: {
            _id: pat1Id,
            name: 'Rahul Sharma',
            age: 32,
            gender: 'male',
            phone: '+91-9876543210',
            bloodGroup: 'O+',
            allergies: ['Penicillin'],
          },
          date: todayStr,
          slotTime: '09:30',
          mode: 'in-person',
          status: 'completed',
          priority: 'routine',
          tokenId: { tokenNumber: 1, status: 'completed' },
        },
        {
          _id: 'apt_002',
          doctorId: docId,
          patientId: {
            _id: pat2Id,
            name: 'Anita Roy',
            age: 45,
            gender: 'female',
            phone: '+91-9876500001',
            bloodGroup: 'B+',
            allergies: [],
          },
          date: todayStr,
          slotTime: '10:00',
          mode: 'video',
          status: 'in-progress',
          priority: 'urgent',
          tokenId: { tokenNumber: 2, status: 'in-progress' },
        },
        {
          _id: 'apt_003',
          doctorId: docId,
          patientId: {
            _id: pat3Id,
            name: 'Suresh Patel',
            age: 58,
            gender: 'male',
            phone: '+91-9876500002',
            bloodGroup: 'A+',
            allergies: ['Sulfa drugs'],
          },
          date: todayStr,
          slotTime: '10:30',
          mode: 'in-person',
          status: 'booked',
          priority: 'routine',
          tokenId: { tokenNumber: 3, status: 'waiting' },
        },
        // Tomorrow's appointment
        {
          _id: 'apt_004',
          doctorId: docId,
          patientId: {
            _id: pat1Id,
            name: 'Rahul Sharma',
          },
          date: tomorrowStr,
          slotTime: '11:00',
          mode: 'in-person',
          status: 'booked',
          priority: 'routine',
        },
      ],
      tokens: [
        {
          _id: 'token_002',
          tokenNumber: 2,
          status: 'in-progress',
          priority: 'urgent',
          patientName: 'Anita Roy',
        },
        {
          _id: 'token_003',
          tokenNumber: 3,
          status: 'waiting',
          priority: 'routine',
          estimatedWaitTime: 15,
        },
        {
          _id: 'token_004',
          tokenNumber: 4,
          status: 'waiting',
          priority: 'emergency',
          estimatedWaitTime: 5,
        },
      ],
      notifications: [
        {
          _id: 'notif_001',
          recipientId: docUserId,
          title: 'Emergency Patient Arrived',
          message: 'Token #4 marked as emergency triage',
          read: false,
          createdAt: new Date(),
        },
        {
          _id: 'notif_002',
          recipientId: docUserId,
          title: 'Consultation Completed',
          message: 'Token #1 finished consultation',
          read: true,
          createdAt: new Date(),
        },
      ],
    });
  });

  // ── 1. Dashboard Metrics Aggregation ──
  describe('1. Dashboard Core Metrics Aggregation', () => {
    it('should aggregate today appointments, patients, queue, waiting, and completed consultations', async () => {
      const data = await getDoctorBusinessDashboard({ doctorId: docId, date: todayStr });

      assert.ok(data);
      assert.equal(data.doctor.doctorName, 'Dr. Priya Sharma');
      assert.equal(data.doctor.specialty, 'Cardiology');

      // Today's appointments: 3
      assert.equal(data.todayAppointments.length, 3);

      // Today's unique patients: 3 (Rahul, Anita, Suresh)
      assert.equal(data.todayPatientsCount, 3);
      assert.equal(data.todayPatients.length, 3);
      assert.ok(data.todayPatients.some((p) => p.name === 'Rahul Sharma' && p.bloodGroup === 'O+'));
      assert.ok(data.todayPatients.some((p) => p.name === 'Anita Roy' && p.bloodGroup === 'B+'));

      // Current Queue: active token #2 in-progress, 2 waiting
      assert.equal(data.currentQueue.activeToken, 2);
      assert.equal(data.currentQueue.inProgressToken.tokenNumber, 2);
      assert.equal(data.currentQueue.waitingCount, 2);
      assert.equal(data.currentQueue.totalQueueLength, 3);

      // Completed consultations: 1 (apt_001)
      assert.equal(data.completedConsultationsCount, 1);
      assert.equal(data.completedConsultations[0]._id, 'apt_001');

      // Upcoming appointments: 1 (apt_004 on tomorrowStr)
      assert.equal(data.upcomingCount, 1);
      assert.equal(data.upcomingAppointments[0]._id, 'apt_004');

      // Notifications: 2 total, 1 unread
      assert.equal(data.notifications.length, 2);
      assert.equal(data.unreadNotificationsCount, 1);
    });
  });

  // ── 2. Subscription Status & Features ──
  describe('2. Clinic Subscription Status & Feature Allotment', () => {
    it('should report subscription tier, active status, days remaining, and feature flags', async () => {
      const data = await getDoctorBusinessDashboard({ doctorId: docId });
      const sub = data.subscriptionStatus;

      assert.ok(sub);
      assert.equal(sub.plan, 'professional');
      assert.equal(sub.status, 'active');
      assert.ok(sub.daysRemaining > 0, 'Must have positive days remaining');
      assert.equal(sub.maxStaffSeats, 5);
      assert.equal(sub.seatsUsed, 1);
      assert.equal(sub.telemedicineEnabled, true);
      assert.equal(sub.analyticsEnabled, true);
      assert.equal(sub.aiAssistantEnabled, true);
    });
  });

  // ── 3. Business Settings & Updates ──
  describe('3. Practice Settings & Configuration Updates', () => {
    it('should update consultation fees, services, and clinic details', async () => {
      const updated = await updateDoctorBusinessSettings({
        doctorId: docId,
        settings: {
          consultationFee: 1000,
          followUpFee: 500,
          services: ['Cardiology Consultation', 'Echocardiogram', 'Stress Test'],
          consultationModes: ['in-person', 'video'],
          clinicDetails: {
            clinicName: 'Premier Heart Clinic',
            contactPhone: '+91-11-99887766',
          },
          videoEnabled: true,
        },
      });

      assert.equal(updated.consultationFee, 1000);
      assert.equal(updated.followUpFee, 500);
      assert.deepEqual(updated.services, ['Cardiology Consultation', 'Echocardiogram', 'Stress Test']);
      assert.equal(updated.clinicDetails.clinicName, 'Premier Heart Clinic');
      assert.equal(updated.videoEnabled, true);

      // Verify dashboard reflects changes
      const data = await getDoctorBusinessDashboard({ doctorId: docId });
      assert.equal(data.businessSettings.consultationFee, 1000);
      assert.equal(data.businessSettings.clinicName, 'Premier Heart Clinic');
    });
  });

  // ── 4. Practice Staff Management ──
  describe('4. Staff Allotment & Seat Limits', () => {
    it('should add staff members to practice team within seat quota', async () => {
      const staffList = await addStaffMemberToPractice({
        doctorId: docId,
        staffData: {
          name: 'Pooja Triage',
          email: 'pooja.nurse@mediqueue.test',
          role: 'nurse',
          phone: '+91-9844455566',
        },
      });

      assert.equal(staffList.length, 2);
      assert.equal(staffList[1].name, 'Pooja Triage');
      assert.equal(staffList[1].role, 'nurse');

      // Verify dashboard reflects 2 seats used
      const data = await getDoctorBusinessDashboard({ doctorId: docId });
      assert.equal(data.subscriptionStatus.seatsUsed, 2);
    });

    it('should block adding staff beyond max seats limit', async () => {
      // Fill remaining 4 seats to reach max 5
      await addStaffMemberToPractice({ doctorId: docId, staffData: { name: 'S1', role: 'nurse' } });
      await addStaffMemberToPractice({ doctorId: docId, staffData: { name: 'S2', role: 'nurse' } });
      await addStaffMemberToPractice({ doctorId: docId, staffData: { name: 'S3', role: 'nurse' } });
      await addStaffMemberToPractice({ doctorId: docId, staffData: { name: 'S4', role: 'nurse' } });

      // 6th staff should be rejected
      await assert.rejects(
        () => addStaffMemberToPractice({ doctorId: docId, staffData: { name: 'S5_Exceed', role: 'nurse' } }),
        (err) => err.statusCode === 400 && err.message.includes('Seat limit reached')
      );
    });
  });

  // ── 5. Existing Queue Continuity ──
  describe('5. Authoritative Queue Continuity (No Duplicate Queue)', () => {
    it('should preserve and reflect existing Token queue sequence', async () => {
      const data = await getDoctorBusinessDashboard({ doctorId: docId });

      // Active Token in Progress
      assert.equal(data.currentQueue.activeToken, 2);
      assert.equal(data.currentQueue.inProgressToken.patientName, 'Anita Roy');

      // Waiting Tokens
      const waitingTokens = data.currentQueue.waitingTokens;
      assert.equal(waitingTokens.length, 2);
      assert.equal(waitingTokens[0].tokenNumber, 3);
      assert.equal(waitingTokens[1].tokenNumber, 4);

      // Revenue reflects existing completed appointments @ consultationFee
      assert.equal(data.analytics.estimatedRevenue, 1 * 800);
    });
  });

  // ── 6. Role-Based Permissions Enforcement ──
  describe('6. Role-Based Permissions & Protected Dashboard Routes', () => {
    it('should permit doctor role to access dashboard route', () => {
      const guard = requireRole('doctor', 'admin', 'clinic_manager');
      let allowed = false;
      guard({ user: { role: 'doctor' } }, {}, () => {
        allowed = true;
      });
      assert.equal(allowed, true);
    });

    it('should permit platform admin to access dashboard route', () => {
      const guard = requireRole('doctor', 'admin', 'clinic_manager');
      let allowed = false;
      guard({ user: { role: 'admin' } }, {}, () => {
        allowed = true;
      });
      assert.equal(allowed, true);
    });

    it('should block patient from accessing doctor dashboard with 403 Forbidden', () => {
      const guard = requireRole('doctor', 'admin', 'clinic_manager');
      let status = null;
      let body = null;
      const res = {
        status: (code) => {
          status = code;
          return {
            json: (b) => {
              body = b;
            },
          };
        },
      };

      let allowed = false;
      guard({ user: { role: 'patient' } }, res, () => {
        allowed = true;
      });

      assert.equal(allowed, false);
      assert.equal(status, 403);
      assert.ok(body.message.includes('not authorized'));
    });

    it('authenticateUser should block request without Bearer token with 401', async () => {
      let status = null;
      let body = null;
      const res = {
        status: (code) => {
          status = code;
          return {
            json: (b) => {
              body = b;
            },
          };
        },
      };

      let called = false;
      await authenticateUser({ headers: {} }, res, () => {
        called = true;
      });

      assert.equal(called, false);
      assert.equal(status, 401);
      assert.ok(body.message.includes('Authentication required'));
    });
  });

  // ── 7. Business Summary Metrics (Real Data Only, No Invented Data) ──
  describe('7. Business Summary Metrics (Real Authoritative Data, No Invented Data)', () => {
    it('should return verified business summary derived from real appointment and token data', async () => {
      const data = await getDoctorBusinessDashboard({ doctorId: docId, date: todayStr });
      const summary = data.businessSummary;

      assert.ok(summary, 'businessSummary object must exist');
      // Today's consultation count: 1 completed (apt_001) + 1 in-progress (apt_002) = 2
      assert.equal(summary.todayConsultationCount, 2);
      // Waiting patients: 1 waiting appointment (apt_003) + 2 waiting tokens (token_003, token_004) = 3
      assert.equal(summary.waitingPatientsCount, 3);
      // Completed consultations: 1
      assert.equal(summary.completedConsultationsCount, 1);
      // No cancellations or no-shows in baseline seed
      assert.equal(summary.cancellationsCount, 0);
      assert.equal(summary.noShowCount, 0);
      assert.equal(summary.totalCancelledOrNoShow, 0);
      assert.equal(summary.cancelledOrNoShowAppointments.length, 0);
      // Real average waiting time from waiting tokens: (15 + 5) / 2 = 10 minutes
      assert.equal(summary.averageWaitingTimeMinutes, 10);
      // Rating derived directly from doctor profile
      assert.equal(summary.rating.avgRating, 4.8);
      assert.equal(summary.rating.ratingCount, 36);
      // Estimated revenue based on actual completed visits: 1 * 800 = 800
      assert.equal(summary.estimatedRevenue, 800);
    });

    it('should dynamically track cancellations and no-shows without hallucinated counts', async () => {
      // Seed with cancelled and no-show appointments
      seedDoctorBusinessTestDb({
        appointments: [
          {
            _id: 'apt_cancel_01',
            doctorId: docId,
            patientId: { _id: 'pat_canc_01', name: 'Vikram Singh' },
            date: todayStr,
            slotTime: '11:30',
            status: 'cancelled',
            mode: 'in-person',
            priority: 'routine',
          },
          {
            _id: 'apt_noshow_01',
            doctorId: docId,
            patientId: { _id: 'pat_noshow_01', name: 'Sunita Devi' },
            date: todayStr,
            slotTime: '12:00',
            status: 'no-show',
            mode: 'in-person',
            priority: 'routine',
          },
        ],
      });

      const data = await getDoctorBusinessDashboard({ doctorId: docId, date: todayStr });
      const summary = data.businessSummary;

      assert.equal(summary.cancellationsCount, 1);
      assert.equal(summary.noShowCount, 1);
      assert.equal(summary.totalCancelledOrNoShow, 2);
      assert.equal(summary.cancelledOrNoShowAppointments.length, 2);
      assert.ok(summary.cancelledOrNoShowAppointments.some((a) => a._id === 'apt_cancel_01' && a.status === 'cancelled'));
      assert.ok(summary.cancelledOrNoShowAppointments.some((a) => a._id === 'apt_noshow_01' && a.status === 'no-show'));
    });

    it('should dynamically calculate real waiting time and return 0 when no queue tokens exist', async () => {
      // Seed with 0 waiting tokens
      seedDoctorBusinessTestDb({
        tokens: [
          {
            _id: 'token_active_only',
            tokenNumber: 99,
            status: 'in-progress',
            patientName: 'Only Active Patient',
          },
        ],
      });

      const data = await getDoctorBusinessDashboard({ doctorId: docId, date: todayStr });
      // When no tokens are waiting, avg wait time must be 0 (no static dummy value like 12 min)
      assert.equal(data.businessSummary.averageWaitingTimeMinutes, 0);
    });
  });

  // ── 8. End-to-End Workflow & Existing HC-01 Queue Continuity ──
  describe('8. End-to-End Workflow: Doctor Login -> Business Dashboard -> Appointments -> Queue -> Patient -> Prescription', () => {
    it('should complete full operational workflow preserving existing HC-01 queue continuity', async () => {
      // ── Step 1: Doctor Login & Credential Verification ──
      const doctorUser = {
        _id: docUserId,
        name: 'Dr. Priya Sharma',
        email: 'dr.priya@mediqueue.test',
        role: 'doctor',
        hospitalId: 'hosp_aiims',
      };
      const authToken = generateToken(doctorUser);
      assert.ok(authToken, 'JWT auth token must be generated');

      const verifiedPayload = verifyToken(authToken);
      assert.ok(verifiedPayload, 'Token must verify successfully');
      assert.equal(verifiedPayload.userId, docUserId);
      assert.equal(verifiedPayload.role, 'doctor');

      // ── Step 2: Access Doctor / Business Dashboard ──
      const dashboard = await getDoctorBusinessDashboard({ doctorId: docId, date: todayStr });
      assert.ok(dashboard);
      assert.equal(dashboard.doctor.doctorName, 'Dr. Priya Sharma');
      assert.equal(dashboard.doctor.specialty, 'Cardiology');
      assert.equal(dashboard.subscriptionStatus.plan, 'professional');
      assert.ok(dashboard.businessSummary, 'Business summary must be present');

      // ── Step 3: Appointments Inspection ──
      const appointments = dashboard.todayAppointments;
      assert.equal(appointments.length, 3);
      const scheduledPatients = appointments.map((a) => a.patientId.name);
      assert.deepEqual(scheduledPatients, ['Rahul Sharma', 'Anita Roy', 'Suresh Patel']);

      // ── Step 4: Authoritative Queue Operation (No Duplicate Queue) ──
      const initialQueue = dashboard.currentQueue;
      assert.equal(initialQueue.activeToken, 2);
      assert.equal(initialQueue.waitingCount, 2);

      // Simulate Queue Progression: Token #2 completed, Token #3 called next
      seedDoctorBusinessTestDb({
        tokens: [
          { _id: 'token_002', tokenNumber: 2, status: 'completed', patientName: 'Anita Roy' },
          { _id: 'token_003', tokenNumber: 3, status: 'in-progress', patientName: 'Suresh Patel', priority: 'routine' },
          { _id: 'token_004', tokenNumber: 4, status: 'waiting', patientName: 'Emergency Walk-in', priority: 'emergency', estimatedWaitTime: 5 },
        ],
        appointments: [
          {
            _id: 'apt_001',
            doctorId: docId,
            patientId: { _id: pat1Id, name: 'Rahul Sharma' },
            date: todayStr,
            slotTime: '09:30',
            status: 'completed',
          },
          {
            _id: 'apt_002',
            doctorId: docId,
            patientId: { _id: pat2Id, name: 'Anita Roy' },
            date: todayStr,
            slotTime: '10:00',
            status: 'completed',
          },
          {
            _id: 'apt_003',
            doctorId: docId,
            patientId: {
              _id: pat3Id,
              name: 'Suresh Patel',
              age: 58,
              gender: 'male',
              bloodGroup: 'A+',
              allergies: ['Sulfa drugs'],
            },
            date: todayStr,
            slotTime: '10:30',
            status: 'in-progress',
            tokenId: { tokenNumber: 3, status: 'in-progress' },
          },
        ],
      });

      const updatedDashboard = await getDoctorBusinessDashboard({ doctorId: docId, date: todayStr });
      assert.equal(updatedDashboard.currentQueue.activeToken, 3, 'Token #3 is now actively being served');
      assert.equal(updatedDashboard.currentQueue.waitingCount, 1, 'Waiting count decremented to 1');
      assert.equal(updatedDashboard.completedConsultationsCount, 2, 'Completed count incremented to 2');

      // ── Step 5: Patient Examination ──
      const activePatient = updatedDashboard.todayPatients.find((p) => p.name === 'Suresh Patel');
      assert.ok(activePatient, 'Active patient record must be accessible');
      assert.equal(activePatient.age, 58);
      assert.equal(activePatient.bloodGroup, 'A+');
      assert.ok(activePatient.allergies.includes('Sulfa drugs'), 'Allergy alerts must be visible to clinician');

      // ── Step 6: Digital Prescription Issuance ──
      // Seed clinical workspace store with the appointment for prescription generation
      clearDoctorWorkspaceTestDb();
      seedDoctorWorkspaceTestDb({
        appointments: [
          {
            _id: 'apt_003',
            doctorId: docId,
            patientId: pat3Id,
            status: 'in-progress',
          },
        ],
        doctors: {
          [docId]: {
            _id: docId,
            doctorName: 'Dr. Priya Sharma',
          },
        },
      });

      const prescription = await issueEncounterPrescription({
        appointmentId: 'apt_003',
        doctorId: docId,
        patientId: pat3Id,
        diagnosis: 'Essential Hypertension',
        medications: [
          {
            medicineName: 'Amlodipine 5mg',
            dosage: '1 tablet',
            frequency: 'Once daily',
            doseTimes: ['08:00'],
            mealRelation: 'after_meal',
            durationDays: 30,
            instructions: 'Take every morning after breakfast',
          },
        ],
        instructions: 'Monitor BP weekly; avoid high-sodium intake',
        doctorName: 'Dr. Priya Sharma',
      });

      assert.ok(prescription, 'Prescription must be issued successfully');
      assert.equal(prescription.patientId, pat3Id);
      assert.equal(prescription.doctorId, docId);
      assert.equal(prescription.diagnosis, 'Essential Hypertension');
      assert.equal(prescription.medications[0].medicineName, 'Amlodipine 5mg');

      // ── Step 7: Existing HC-01 Pipeline Continuity Verification ──
      // The single authoritative HC-01 queue pipeline is preserved:
      // Reception (token generation) -> Authoritative Queue -> Doctor Consultation -> Display Boards
      assert.equal(updatedDashboard.currentQueue.activeToken, 3);
      assert.equal(updatedDashboard.currentQueue.waitingTokens[0].tokenNumber, 4);
      assert.equal(updatedDashboard.currentQueue.waitingTokens[0].priority, 'emergency');
    });
  });
});
