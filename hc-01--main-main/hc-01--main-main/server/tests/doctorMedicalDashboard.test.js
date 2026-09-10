import test from 'node:test';
import assert from 'node:assert/strict';
import {
  clearDoctorBusinessTestDb,
  seedDoctorBusinessTestDb,
  getDoctorBusinessDashboard,
  updateDoctorAvailability,
  getDoctorPatientClinicalHistory,
} from '../services/doctorBusinessService.js';
import {
  clearDoctorWorkspaceTestDb,
  seedDoctorWorkspaceTestDb,
} from '../services/doctorWorkspaceService.js';

test('Professional Doctor Medical Dashboard Suite', async (t) => {
  const doctorId = '65f000000000000000000001';
  const patient1Id = '65f000000000000000000101';
  const patient2Id = '65f000000000000000000102';
  const patient3Id = '65f000000000000000000103';

  const today = new Date().toISOString().slice(0, 10);
  const futureDate = new Date(Date.now() + 86400000 * 2).toISOString().slice(0, 10);

  const mockDoctor = {
    _id: doctorId,
    userId: doctorId,
    doctorName: 'Dr. Priya Sharma',
    specialty: 'Cardiology',
    hospitalName: 'AIIMS Super Specialty Center',
    hospitalId: '65f000000000000000000099',
    qualifications: ['MBBS', 'MD (Medicine)', 'DM (Cardiology)'],
    experienceYears: 14,
    medicalLicenseNumber: 'MCI-2010-CARD-8941',
    consultationFee: 750,
    slotDuration: 30,
    availabilityStatus: 'available',
    isAvailableToday: true,
    weeklySchedule: [
      {
        day: new Date().toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase(),
        isWorking: true,
        startTime: '09:00',
        endTime: '17:00',
        breaks: [{ startTime: '13:00', endTime: '14:00', reason: 'Lunch Break' }],
      },
    ],
  };

  const mockAppointments = [
    // 1. Current in-progress patient
    {
      _id: '65f000000000000000000201',
      doctorId,
      patientId: {
        _id: patient1Id,
        name: 'Rahul Verma',
        age: 34,
        gender: 'male',
        phone: '+91-98765-43210',
        bloodGroup: 'B+',
        allergies: ['Penicillin'],
      },
      date: today,
      slotTime: '10:00 AM',
      mode: 'in-person',
      status: 'in-progress',
      priority: 'routine',
      chiefComplaint: 'Post-angioplasty follow up',
      tokenId: { tokenNumber: 201, status: 'in-progress', priority: 'routine' },
    },
    // 2. Emergency waiting patient (Next patient candidate)
    {
      _id: '65f000000000000000000202',
      doctorId,
      patientId: {
        _id: patient2Id,
        name: 'Aarav Mehta',
        age: 62,
        gender: 'male',
        phone: '+91-98765-11111',
        bloodGroup: 'O+',
        allergies: [],
      },
      date: today,
      slotTime: '10:30 AM',
      mode: 'in-person',
      status: 'checked-in',
      priority: 'critical',
      chiefComplaint: 'Acute chest pain & tachycardia',
      tokenId: { tokenNumber: 202, status: 'waiting', priority: 'critical', estimatedWaitTime: 5 },
    },
    // 3. Completed patient
    {
      _id: '65f000000000000000000203',
      doctorId,
      patientId: {
        _id: patient3Id,
        name: 'Sunita Rao',
        age: 45,
        gender: 'female',
        phone: '+91-98765-22222',
        bloodGroup: 'A+',
        allergies: [],
      },
      date: today,
      slotTime: '09:30 AM',
      mode: 'video',
      status: 'completed',
      priority: 'routine',
      chiefComplaint: 'Hypertension routine check',
      tokenId: { tokenNumber: 200, status: 'completed' },
    },
    // 4. Future / Upcoming appointment
    {
      _id: '65f000000000000000000204',
      doctorId,
      patientId: {
        _id: '65f000000000000000000104',
        name: 'Deepak Chopra',
        age: 50,
      },
      date: futureDate,
      slotTime: '11:00 AM',
      mode: 'in-person',
      status: 'booked',
      priority: 'routine',
      chiefComplaint: 'Echocardiogram review',
    },
  ];

  const mockTokens = [
    {
      tokenNumber: 201,
      patientName: 'Rahul Verma',
      patientId: patient1Id,
      status: 'in-progress',
      priority: 'routine',
    },
    {
      tokenNumber: 202,
      patientName: 'Aarav Mehta',
      patientId: patient2Id,
      status: 'waiting',
      priority: 'critical',
      estimatedWaitTime: 5,
    },
    {
      tokenNumber: 205,
      patientName: 'Pooja Nair',
      status: 'waiting',
      priority: 'routine',
      estimatedWaitTime: 25,
      condition: 'Mild palpitations',
    },
  ];

  t.beforeEach(() => {
    clearDoctorBusinessTestDb();
    clearDoctorWorkspaceTestDb();
    seedDoctorBusinessTestDb({
      doctors: { [doctorId]: mockDoctor },
      appointments: mockAppointments,
      tokens: mockTokens,
    });
    seedDoctorWorkspaceTestDb({
      doctors: { [doctorId]: mockDoctor },
      appointments: mockAppointments,
      tokens: mockTokens,
      grants: [
        {
          doctorId,
          patientId: patient1Id,
          appointmentId: '65f000000000000000000201',
          scope: 'full',
          revokedAt: null,
        },
      ],
      histories: [
        {
          _id: '65f000000000000000000501',
          patientId: patient1Id,
          condition: 'Coronary Artery Disease',
          diagnosedDate: '2024-05-10',
          isActive: true,
        },
      ],
    });
  });

  await t.test('1. Doctor dashboard aggregates all 12 required clinical items', async () => {
    const data = await getDoctorBusinessDashboard({ doctorId, date: today });

    // Item 1: Today's patient count
    assert.strictEqual(data.todayPatientsCount >= 3, true, 'Item 1: Today patient count should be present');

    // Item 2: Patients already consulted
    assert.strictEqual(data.consultedPatientsCount, 1, 'Item 2: Consulted patients count must equal completed consultations (1)');

    // Item 3: Waiting patients count
    assert.strictEqual(data.waitingPatientsCount >= 2, true, 'Item 3: Waiting patients count should reflect queue and appointments');

    // Item 4: Current patient
    assert.ok(data.currentPatient, 'Item 4: Current patient object must exist');
    assert.strictEqual(data.currentPatient.patientName, 'Rahul Verma');
    assert.strictEqual(data.currentPatient.tokenNumber, 201);
    assert.strictEqual(data.currentPatient.status, 'in-progress');

    // Item 5: Next patient (Emergency triage prioritized)
    assert.ok(data.nextPatient, 'Item 5: Next patient object must exist');
    assert.strictEqual(data.nextPatient.patientName, 'Aarav Mehta');
    assert.strictEqual(data.nextPatient.priority, 'critical', 'Critical patient must be next in line');
    assert.strictEqual(data.nextPatient.tokenNumber, 202);

    // Item 6: Emergency/priority patients
    assert.ok(Array.isArray(data.emergencyPriorityPatients), 'Item 6: Emergency priority patients array required');
    assert.strictEqual(data.emergencyPriorityCount >= 1, true);
    assert.strictEqual(data.emergencyPriorityPatients[0].patientName, 'Aarav Mehta');

    // Item 7: Today's appointments
    assert.ok(Array.isArray(data.todayAppointments), 'Item 7: Today appointments array required');
    assert.strictEqual(data.todayAppointments.length >= 3, true);

    // Item 8: Doctor availability status
    assert.strictEqual(data.doctorAvailabilityStatus, 'available', 'Item 8: Doctor availability status must be available');
    assert.strictEqual(data.doctor.isAvailableToday, true);

    // Item 9: Today's schedule
    assert.ok(data.todaySchedule, 'Item 9: Today schedule object must exist');
    assert.strictEqual(data.todaySchedule.isWorking, true);
    assert.strictEqual(data.todaySchedule.startTime, '09:00');
    assert.strictEqual(data.todaySchedule.endTime, '17:00');
    assert.strictEqual(data.todaySchedule.slotDuration, 30);
    assert.ok(data.todaySchedule.breaks.length >= 1);

    // Item 10: Upcoming appointments
    assert.ok(Array.isArray(data.upcomingAppointments), 'Item 10: Upcoming appointments array required');
    assert.strictEqual(data.upcomingAppointments.length, 1);
    assert.strictEqual(data.upcomingAppointments[0].date, futureDate);

    // Item 11: Patient queue specifically for this doctor
    assert.ok(Array.isArray(data.patientQueue), 'Item 11: Patient queue array required');
    assert.strictEqual(data.patientQueue.length >= 2, true);

    // Item 12: Recent patient history
    assert.ok(Array.isArray(data.recentPatientHistory), 'Item 12: Recent patient history array required');
    assert.strictEqual(data.recentPatientHistory.length >= 1, true);
    assert.strictEqual(data.recentPatientHistory[0].patientName, 'Sunita Rao');
  });

  await t.test('2. Doctor can toggle availability across all 4 states (Available, Busy, On Leave, Offline)', async () => {
    // Transition to Busy
    const resBusy = await updateDoctorAvailability({ doctorId, availabilityStatus: 'busy' });
    assert.strictEqual(resBusy.availabilityStatus, 'busy');
    assert.strictEqual(resBusy.isAvailableToday, false);

    let dashboard = await getDoctorBusinessDashboard({ doctorId, date: today });
    assert.strictEqual(dashboard.doctorAvailabilityStatus, 'busy');
    assert.strictEqual(dashboard.doctor.availabilityStatus, 'busy');

    // Transition to On Leave
    const resLeave = await updateDoctorAvailability({ doctorId, availabilityStatus: 'on_leave' });
    assert.strictEqual(resLeave.availabilityStatus, 'on_leave');
    assert.strictEqual(resLeave.isAvailableToday, false);

    dashboard = await getDoctorBusinessDashboard({ doctorId, date: today });
    assert.strictEqual(dashboard.doctorAvailabilityStatus, 'on_leave');

    // Transition to Offline
    const resOffline = await updateDoctorAvailability({ doctorId, availabilityStatus: 'offline' });
    assert.strictEqual(resOffline.availabilityStatus, 'offline');
    assert.strictEqual(resOffline.isAvailableToday, false);

    dashboard = await getDoctorBusinessDashboard({ doctorId, date: today });
    assert.strictEqual(dashboard.doctorAvailabilityStatus, 'offline');

    // Transition back to Available
    const resAvail = await updateDoctorAvailability({ doctorId, availabilityStatus: 'available' });
    assert.strictEqual(resAvail.availabilityStatus, 'available');
    assert.strictEqual(resAvail.isAvailableToday, true);

    dashboard = await getDoctorBusinessDashboard({ doctorId, date: today });
    assert.strictEqual(dashboard.doctorAvailabilityStatus, 'available');

    // Reject invalid availability status
    await assert.rejects(
      async () => {
        await updateDoctorAvailability({ doctorId, availabilityStatus: 'vacation' });
      },
      /Invalid availability status/,
      'Should reject unsupported availability status'
    );
  });

  await t.test('3. Doctor can view authorized patient previous visits and clinical history', async () => {
    // Authorized consultation encounter for Patient 1
    const clinicalHistory = await getDoctorPatientClinicalHistory({
      doctorId,
      patientId: patient1Id,
      appointmentId: '65f000000000000000000201',
    });

    assert.ok(clinicalHistory.patient, 'Patient details must be present');
    assert.strictEqual(clinicalHistory.isAuthorized, true, 'Access must be AUTHORIZED with active consent');
    assert.strictEqual(clinicalHistory.consentStatus, 'AUTHORIZED');
    assert.ok(Array.isArray(clinicalHistory.sharedMedicalHistory));
    assert.strictEqual(clinicalHistory.sharedMedicalHistory.length, 1);
    assert.strictEqual(clinicalHistory.sharedMedicalHistory[0].condition, 'Coronary Artery Disease');
  });

  await t.test('4. Patient previous visits with limited access are strictly protected', async () => {
    // Patient 3 without prior consent grant
    const limitedHistory = await getDoctorPatientClinicalHistory({
      doctorId,
      patientId: patient3Id,
      appointmentId: '65f000000000000000000203',
    });

    assert.ok(limitedHistory.patient);
    assert.strictEqual(limitedHistory.isAuthorized, false, 'Access must be LIMITED when consent is missing');
    assert.strictEqual(limitedHistory.consentStatus, 'LIMITED ACCESS');
    assert.strictEqual(limitedHistory.sharedMedicalHistory.length, 0, 'Medical history must NOT leak without consent');
  });
});
