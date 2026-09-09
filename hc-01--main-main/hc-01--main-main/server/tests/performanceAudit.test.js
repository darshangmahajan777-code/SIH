import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';

// Import models
import Appointment from '../models/Appointment.js';
import DoctorProfile from '../models/DoctorProfile.js';
import AccessLog from '../models/AccessLog.js';
import Rating from '../models/Rating.js';
import Prescription from '../models/Prescription.js';
import MedicalHistory from '../models/MedicalHistory.js';
import TestOrder from '../models/TestOrder.js';
import CarePlan from '../models/CarePlan.js';
import Notification from '../models/Notification.js';

// Import services
import { getDoctorAvailability, getDailyListing } from '../services/scheduleService.js';
import { getPatientDashboardData } from '../services/patientDashboardService.js';
import { getDoctorWorkspaceSummary } from '../services/doctorWorkspaceService.js';
import { calculateTokenQueueMetrics, broadcastPatientQueueUpdates } from '../services/virtualQueueService.js';
import {
  scheduleNotification,
  processDueReminders,
  clearNotificationsForTest,
} from '../services/notificationService.js';

test('PERFORMANCE & DATABASE AUDIT VERIFICATION', async (t) => {

  await t.test('1. Compound Index Coverage Verification', () => {
    // Appointment indexes
    const aptIndexes = Appointment.schema.indexes();
    const aptKeys = aptIndexes.map(([keys]) => Object.keys(keys).join(','));
    assert.ok(aptKeys.some((k) => k.includes('patientId') && k.includes('date')), 'Appointment has patientId + date compound index');
    assert.ok(aptKeys.some((k) => k.includes('doctorId') && k.includes('date')), 'Appointment has doctorId + date compound index');
    assert.ok(aptKeys.some((k) => k.includes('date') && k.includes('tokenId')), 'Appointment has date + tokenId compound index');

    // DoctorProfile indexes
    const docIndexes = DoctorProfile.schema.indexes();
    const docKeys = docIndexes.map(([keys]) => Object.keys(keys).join(','));
    assert.ok(docKeys.some((k) => k === 'userId'), 'DoctorProfile indexes userId for session lookups');
    assert.ok(docKeys.some((k) => k.includes('isActive') && k.includes('specialty')), 'DoctorProfile has isActive + specialty compound index');
    assert.ok(docKeys.some((k) => k.includes('hospitalId') && k.includes('verificationStatus')), 'DoctorProfile has hospitalId + verificationStatus compound index');

    // AccessLog indexes
    const accessIndexes = AccessLog.schema.indexes();
    const accessKeys = accessIndexes.map(([keys]) => Object.keys(keys).join(','));
    assert.ok(accessKeys.some((k) => k.includes('doctorId')), 'AccessLog indexes doctorId for audit trails');
    assert.ok(accessKeys.some((k) => k.includes('patientId') && k.includes('resource')), 'AccessLog indexes patientId + resource');

    // Rating indexes
    const ratingIndexes = Rating.schema.indexes();
    const ratingKeys = ratingIndexes.map(([keys]) => Object.keys(keys).join(','));
    assert.ok(ratingKeys.some((k) => k.includes('patientId')), 'Rating indexes patientId');
    assert.ok(ratingKeys.some((k) => k.includes('doctorId') && k.includes('rating')), 'Rating indexes doctorId + rating');

    // Prescription indexes
    const rxIndexes = Prescription.schema.indexes();
    const rxKeys = rxIndexes.map(([keys]) => Object.keys(keys).join(','));
    assert.ok(rxKeys.some((k) => k.includes('patientId') && k.includes('status')), 'Prescription indexes patientId + status');
    assert.ok(rxKeys.some((k) => k.includes('patientId') && k.includes('doseLogs.date')), 'Prescription indexes doseLogs.date');

    // MedicalHistory indexes
    const mhIndexes = MedicalHistory.schema.indexes();
    const mhKeys = mhIndexes.map(([keys]) => Object.keys(keys).join(','));
    assert.ok(mhKeys.some((k) => k.includes('patientId') && k.includes('isActive')), 'MedicalHistory indexes patientId + isActive');

    // TestOrder indexes
    const testIndexes = TestOrder.schema.indexes();
    const testKeys = testIndexes.map(([keys]) => Object.keys(keys).join(','));
    assert.ok(testKeys.some((k) => k.includes('doctorId') && k.includes('status')), 'TestOrder indexes doctorId + status');

    // CarePlan indexes
    const cpIndexes = CarePlan.schema.indexes();
    const cpKeys = cpIndexes.map(([keys]) => Object.keys(keys).join(','));
    assert.ok(cpKeys.some((k) => k.includes('patientId') && k.includes('status')), 'CarePlan indexes patientId + status');

    // Notification scheduledAt index
    const notifIndexes = Notification.schema.indexes();
    const notifKeys = notifIndexes.map(([keys]) => Object.keys(keys).join(','));
    assert.ok(notifKeys.some((k) => k.includes('scheduledAt') && k.includes('isSent')), 'Notification indexes scheduledAt + isSent');
  });

  await t.test('2. Doctor Availability Preloading (N+1 Elimination)', async () => {
    const mockDoctor = {
      _id: 'doc-perf-1',
      doctorName: 'Dr. Quick',
      specialty: 'General Medicine',
      hospitalName: 'City Hospital',
      weeklySchedule: [
        { day: 'monday', isWorking: true, startTime: '09:00', endTime: '12:00', breaks: [] },
        { day: 'tuesday', isWorking: true, startTime: '09:00', endTime: '12:00', breaks: [] },
        { day: 'wednesday', isWorking: true, startTime: '09:00', endTime: '12:00', breaks: [] },
        { day: 'thursday', isWorking: true, startTime: '09:00', endTime: '12:00', breaks: [] },
        { day: 'friday', isWorking: true, startTime: '09:00', endTime: '12:00', breaks: [] },
        { day: 'saturday', isWorking: true, startTime: '09:00', endTime: '12:00', breaks: [] },
        { day: 'sunday', isWorking: true, startTime: '09:00', endTime: '12:00', breaks: [] },
      ],
      leaves: [],
      holidays: [],
      slotDuration: 30,
    };

    const mockAppointments = [
      { slotTime: '09:00', status: 'booked' },
      { slotTime: '09:30', status: 'booked' },
    ];

    // Call with preloaded documents (does NOT touch DB)
    const avail = await getDoctorAvailability(mockDoctor._id, '2026-10-15', mockDoctor, mockAppointments);

    assert.equal(avail.doctorName, 'Dr. Quick');
    assert.equal(avail.totalSlotsCount, 6);
    // 09:00 and 09:30 are booked, slots remaining: 10:00, 10:30, 11:00, 11:30
    assert.equal(avail.openSlotsCount, 4);
    assert.equal(avail.slots[0].isBooked, true);
    assert.equal(avail.slots[1].isBooked, true);
    assert.equal(avail.slots[2].isBooked, false);
  });

  await t.test('3. Parallel Aggregation Execution (Patient Dashboard)', async () => {
    const start = Date.now();
    const data = await getPatientDashboardData('65f000000000000000000001');
    const elapsed = Date.now() - start;

    assert.ok(data, 'Patient dashboard data returned successfully');
    assert.ok(data.patient, 'Contains patient profile section');
    assert.ok(data.primaryActions, 'Contains primaryActions DO NOW section');
    assert.ok(data.healthSnapshot, 'Contains healthSnapshot vitals section');
    assert.ok(data.healthSnapshot.recentHistory !== undefined, 'Contains healthSnapshot recent history');
    assert.ok(data.discovery, 'Contains recommended specialists section');
    assert.ok(elapsed < 200, `Dashboard aggregation executed in ${elapsed}ms (sub-200ms target)`);
  });

  await t.test('4. Parallel Aggregation Execution (Doctor Workspace Summary)', async () => {
    const start = Date.now();
    const summary = await getDoctorWorkspaceSummary({ doctorId: '65f000000000000000000002' });
    const elapsed = Date.now() - start;

    assert.ok(summary, 'Doctor workspace summary returned');
    assert.ok(Array.isArray(summary.todayAppointments), 'Contains today appointments');
    assert.ok(summary.queue !== undefined, 'Contains queue section');
    assert.ok(summary.stats, 'Contains stats section');
    assert.ok(elapsed < 200, `Workspace summary executed in ${elapsed}ms (sub-200ms target)`);
  });

  await t.test('5. Batch AI Queue Priority Reordering & Precomputed Lookup', async () => {
    const waitingTokens = [
      { _id: 't-1', tokenNumber: 101, priority: 'general', createdAt: new Date() },
      { _id: 't-2', tokenNumber: 102, priority: 'emergency', createdAt: new Date() },
    ];

    // Precomputed AI Map
    const precomputedMap = new Map();
    precomputedMap.set('t-2', { effective_position: 1, reason: 'Critical Priority (Batch Evaluated)' });
    precomputedMap.set('t-1', { effective_position: 2, reason: 'General Priority' });

    const start = Date.now();
    const metrics = await calculateTokenQueueMetrics(
      waitingTokens[1],
      waitingTokens,
      10,
      null,
      precomputedMap
    );
    const elapsed = Date.now() - start;

    assert.equal(metrics.position, 1, 'Precomputed AI position resolved instantly');
    assert.ok(metrics.reason.includes('Critical Priority'), 'Used precomputed reason');
    assert.ok(elapsed < 200, `Metrics calculated in ${elapsed}ms without redundant HTTP calls`);
  });

  await t.test('6. Indexed Reminder Scheduler (Schedule & Process)', async () => {
    clearNotificationsForTest();

    const pastDate = new Date(Date.now() - 60000); // 1 minute ago (due)
    const futureDate = new Date(Date.now() + 600000); // 10 minutes in future (not due)

    // Schedule due reminder
    const scheduled1 = await scheduleNotification({
      recipient: '65f000000000000000000001',
      type: 'medicine_reminder',
      title: 'Take Metformin',
      message: 'Time for your evening dose of Metformin 500mg.',
      scheduledAt: pastDate,
    });

    // Schedule future reminder
    const scheduled2 = await scheduleNotification({
      recipient: '65f000000000000000000001',
      type: 'appointment_reminder',
      title: 'Upcoming Visit',
      message: 'Consultation with Dr. Sarah Patel tomorrow at 10:00 AM.',
      scheduledAt: futureDate,
    });

    assert.ok(scheduled1, 'Due reminder scheduled');
    assert.ok(scheduled2, 'Future reminder scheduled');
    assert.equal(scheduled1.isSent, false);

    // Process due reminders
    const processed = await processDueReminders();
    assert.ok(processed >= 1, 'Processed due reminder');
    assert.equal(scheduled1.isSent, true, 'Due reminder marked as sent');
    assert.equal(scheduled2.isSent, false, 'Future reminder remains unsent');
  });

});
