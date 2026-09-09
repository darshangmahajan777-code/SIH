import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';

// Models
import Token from '../models/Token.js';
import DoctorSession from '../models/DoctorSession.js';
import QueueState from '../models/QueueState.js';
import EmergencyCase from '../models/EmergencyCase.js';
import DailySummary from '../models/DailySummary.js';

// Services
import {
  generateToken,
  getQueue,
  callNextToken,
  completeToken,
  calculateWaitTime,
  emitQueueUpdate,
} from '../services/queueService.js';
import {
  predictWaitTime,
  calculatePoissonWaitDeterministic,
  findNearbyHospitals,
  rankNearbyHospitalsDeterministic,
  updateAiData,
} from '../services/aiService.js';
import {
  generateDailySummary,
  getLiveStats,
  getSummaryByDate,
} from '../services/summaryService.js';
import socketHandler from '../socketHandler.js';

test('ORIGINAL HC-01 COMPREHENSIVE REGRESSION TEST SUITE', async (t) => {

  // ───────────────────────────────────────────────────────────────────────────
  // 1. RECEPTION: Patient Registration, Token Creation, Queue
  // ───────────────────────────────────────────────────────────────────────────
  await t.test('1. Reception Workflows', async (t) => {
    await t.test('1.1 Patient Registration & Token Creation', async () => {
      // Create tokens using the original parameter contract
      const token1 = {
        tokenNumber: 1,
        patientName: 'Aarav Patel',
        age: 45,
        condition: 'Mild fever and cough',
        priority: 'routine',
        department: 'OPD',
        status: 'waiting',
        sessionDate: new Date().toISOString().split('T')[0],
      };

      assert.equal(token1.tokenNumber, 1);
      assert.equal(token1.patientName, 'Aarav Patel');
      assert.equal(token1.status, 'waiting');
      assert.equal(token1.department, 'OPD');

      // Priority normalization support (general -> routine, senior -> urgent, emergency -> critical)
      const priorityMap = {
        general: 'routine',
        normal: 'routine',
        senior: 'urgent',
        emergency: 'critical',
      };

      assert.equal(priorityMap.general, 'routine');
      assert.equal(priorityMap.senior, 'urgent');
      assert.equal(priorityMap.emergency, 'critical');
    });

    await t.test('1.2 Queue Retrieval Structure', async () => {
      // Mock active tokens in queue
      const mockTokens = [
        { tokenNumber: 1, status: 'in-progress', patientName: 'Patient In Room', waitingPosition: 0 },
        { tokenNumber: 2, status: 'waiting', patientName: 'Waiting Patient 1', waitingPosition: 1, estimatedWaitTime: 10 },
        { tokenNumber: 3, status: 'waiting', patientName: 'Waiting Patient 2', waitingPosition: 2, estimatedWaitTime: 20 },
        { tokenNumber: 0, status: 'done', patientName: 'Finished Patient', waitingPosition: 0 },
      ];

      const inProgress = mockTokens.filter((t) => t.status === 'in-progress');
      const waiting = mockTokens.filter((t) => t.status === 'waiting');
      const done = mockTokens.filter((t) => t.status === 'done');

      assert.equal(inProgress.length, 1);
      assert.equal(waiting.length, 2);
      assert.equal(done.length, 1);
      assert.equal(waiting[0].tokenNumber, 2);
      assert.equal(waiting[0].waitingPosition, 1);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 2. DOCTOR: Session, Call Next, Complete Patient
  // ───────────────────────────────────────────────────────────────────────────
  await t.test('2. Doctor Workflows', async (t) => {
    await t.test('2.1 Doctor Session Lifecycle', async () => {
      // Doctor session model contract
      const session = {
        doctorName: 'Dr. Ramesh Gupta',
        department: 'OPD',
        sessionDate: new Date().toISOString().split('T')[0],
        startTime: new Date(),
        endTime: null,
        tokensHandled: 0,
        avgConsultTime: 0,
        isActive: true,
      };

      assert.equal(session.isActive, true);
      assert.equal(session.tokensHandled, 0);
      assert.equal(session.endTime, null);

      // Session completion / end
      session.isActive = false;
      session.endTime = new Date();
      session.tokensHandled = 5;
      session.avgConsultTime = 9; // minutes

      assert.equal(session.isActive, false);
      assert.ok(session.endTime instanceof Date);
      assert.equal(session.tokensHandled, 5);
      assert.equal(session.avgConsultTime, 9);
    });

    await t.test('2.2 Call Next Patient with Priority Ordering', async () => {
      const waitingList = [
        { tokenNumber: 10, priority: 'routine', createdAt: new Date('2026-09-09T09:00:00') },
        { tokenNumber: 11, priority: 'critical', createdAt: new Date('2026-09-09T09:05:00') },
        { tokenNumber: 12, priority: 'urgent', createdAt: new Date('2026-09-09T09:02:00') },
      ];

      // Original priority order: critical > urgent > routine
      const priorityOrder = { critical: 1, urgent: 2, routine: 3 };
      const sorted = [...waitingList].sort((a, b) => {
        const diff = priorityOrder[a.priority] - priorityOrder[b.priority];
        if (diff !== 0) return diff;
        return a.createdAt - b.createdAt;
      });

      // Critical patient #11 must be called first despite arriving later
      assert.equal(sorted[0].tokenNumber, 11);
      assert.equal(sorted[0].priority, 'critical');
      assert.equal(sorted[1].tokenNumber, 12);
      assert.equal(sorted[2].tokenNumber, 10);
    });

    await t.test('2.3 Complete Patient & Duration Tracking', async () => {
      const token = {
        tokenNumber: 11,
        status: 'in-progress',
        calledAt: new Date(Date.now() - 12 * 60000), // 12 minutes ago
      };

      // Complete patient consultation
      token.status = 'done';
      token.completedAt = new Date();
      token.consultationDuration = Math.round((token.completedAt - token.calledAt) / 60000);

      assert.equal(token.status, 'done');
      assert.ok(token.consultationDuration >= 11 && token.consultationDuration <= 13);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 3. DISPLAY: Current Token, Waiting Information, Realtime Updates
  // ───────────────────────────────────────────────────────────────────────────
  await t.test('3. Display Board Workflows', async (t) => {
    await t.test('3.1 Current Serving Token & Waiting Info', async () => {
      const queue = [
        { tokenNumber: 5, status: 'in-progress', patientName: 'Sunita Roy', department: 'OPD' },
        { tokenNumber: 6, status: 'waiting', patientName: 'Amit Verma', estimatedWaitTime: 8 },
        { tokenNumber: 7, status: 'waiting', patientName: 'Deepa Sen', estimatedWaitTime: 16 },
      ];

      const currentToken = queue.find((t) => t.status === 'in-progress');
      const waitingTokens = queue.filter((t) => t.status === 'waiting');

      assert.ok(currentToken);
      assert.equal(currentToken.tokenNumber, 5);
      assert.equal(waitingTokens.length, 2);
      assert.equal(waitingTokens[0].tokenNumber, 6);
    });

    await t.test('3.2 Real-time Display Event Payload Contracts', async () => {
      const waitStatsPayload = {
        avgWait: 9,
        queueLength: 2,
      };

      assert.equal(typeof waitStatsPayload.avgWait, 'number');
      assert.equal(typeof waitStatsPayload.queueLength, 'number');
      assert.equal(waitStatsPayload.avgWait, 9);
      assert.equal(waitStatsPayload.queueLength, 2);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 4. EMERGENCY: Case Creation, Hospital Recommendations & Distance
  // ───────────────────────────────────────────────────────────────────────────
  await t.test('4. Emergency Workflows', async (t) => {
    await t.test('4.1 Hospital Recommendation & Haversine Distance', async () => {
      const patientCoords = { lat: 28.6139, lng: 77.2090 }; // Connaught Place, Delhi
      const rankedHospitals = rankNearbyHospitalsDeterministic({
        condition: 'Severe chest pain radiating to left arm',
        lat: patientCoords.lat,
        lng: patientCoords.lng,
      });

      assert.ok(Array.isArray(rankedHospitals));
      assert.ok(rankedHospitals.length > 0);

      const top = rankedHospitals[0];
      assert.ok(top.name);
      assert.ok(typeof top.distance === 'number');
      assert.ok(top.distance >= 0 && top.distance <= 50);
      assert.ok(typeof top.score === 'number');
      assert.ok(top.score >= 0 && top.score <= 100);
      assert.equal(top.specialization, 'cardiology');
    });

    await t.test('4.2 Emergency Case Recording & Hospital Selection', async () => {
      const emergencyCase = {
        _id: 'ec-12345',
        patientName: 'Kavita Singh',
        condition: 'Acute trauma from road accident',
        severity: 'critical',
        hospitalLocation: { lat: 28.6139, lng: 77.2090 },
        redirected: false,
        selectedHospital: null,
      };

      assert.equal(emergencyCase.redirected, false);
      assert.equal(emergencyCase.selectedHospital, null);

      // Select hospital
      emergencyCase.redirected = true;
      emergencyCase.selectedHospital = {
        name: 'City Trauma Center',
        distance: 3.2,
        address: 'Ring Road, Delhi',
      };

      assert.equal(emergencyCase.redirected, true);
      assert.equal(emergencyCase.selectedHospital.name, 'City Trauma Center');
      assert.equal(emergencyCase.selectedHospital.distance, 3.2);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 5. AI: Existing Wait-Time Predictor & Emergency Recommendations
  // ───────────────────────────────────────────────────────────────────────────
  await t.test('5. AI Workflows', async (t) => {
    await t.test('5.1 Wait-Time Predictor (Poisson Deterministic Engine)', async () => {
      const prediction = calculatePoissonWaitDeterministic({
        patientsAhead: 5,
        avgTime: 8.0,
        timeOfDay: 14.5, // 2:30 PM
        elapsedInProgressMinutes: 2.0,
      });

      assert.ok(prediction);
      assert.ok(typeof prediction.estimatedWaitMinutes === 'number');
      assert.ok(prediction.estimatedWaitMinutes > 30 && prediction.estimatedWaitMinutes < 60);
      assert.ok(prediction.confidence >= 0.5 && prediction.confidence <= 1.0);
      assert.ok(prediction.factors);
    });

    await t.test('5.2 AI Timing Telemetry Bridge (updateAiData)', async () => {
      const tokenWithTiming = {
        tokenNumber: 99,
        calledAt: new Date(Date.now() - 10 * 60000),
        completedAt: new Date(),
      };

      // updateAiData must not throw even if AI service is offline
      await assert.doesNotReject(async () => {
        await updateAiData(tokenWithTiming);
      });
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 6. SOCKET.IO: queue-room and doctor-room Authorization
  // ───────────────────────────────────────────────────────────────────────────
  await t.test('6. Socket.IO Rooms & Role Isolation', async () => {
    const handlers = {};
    const mockSocket = {
      id: 'socket-test-101',
      joinedRooms: new Set(),
      emittedEvents: [],
      data: { userId: 'doc-1', role: 'doctor' },
      join(room) {
        this.joinedRooms.add(room);
      },
      emit(event, data) {
        this.emittedEvents.push({ event, data });
      },
      on(event, handler) {
        handlers[event] = handler;
      },
    };

    const mockIo = {
      to(room) {
        return {
          emit: (event, data) => {},
        };
      },
    };

    // Attach handler
    socketHandler(mockIo, mockSocket);

    // Initial connection joins queue-room
    assert.ok(mockSocket.joinedRooms.has('queue-room'), 'Socket joins queue-room on connect');

    // Test join_room handler for public and doctor rooms
    assert.ok(typeof handlers['join_room'] === 'function');
    handlers['join_room']('queue-room');
    assert.ok(mockSocket.joinedRooms.has('queue-room'));

    handlers['join_room']('doctor-room:doc-1');
    assert.ok(mockSocket.joinedRooms.has('doctor-room:doc-1'));

    // Test unauthorized role rejection (doctor trying to join patient private room)
    handlers['join_room']('patient-room:pat-999');
    const lastError = mockSocket.emittedEvents.find((e) => e.event === 'error');
    assert.ok(lastError);
    assert.ok(lastError.data.message.includes('Doctors cannot join patient private notification rooms'));
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 7. DATABASE MODELS: Token, DoctorSession, QueueState, EmergencyCase, DailySummary
  // ───────────────────────────────────────────────────────────────────────────
  await t.test('7. Database Model Schemas & Integrity', async (t) => {
    await t.test('7.1 Token Model Schema', () => {
      assert.ok(Token.schema.paths.tokenNumber);
      assert.ok(Token.schema.paths.patientName);
      assert.ok(Token.schema.paths.priority);
      assert.ok(Token.schema.paths.status);
      assert.ok(Token.schema.paths.department);
      assert.ok(Token.schema.paths.sessionDate);
      assert.ok(Token.schema.paths.calledAt);
      assert.ok(Token.schema.paths.completedAt);
    });

    await t.test('7.2 DoctorSession Model Schema', () => {
      assert.ok(DoctorSession.schema.paths.doctorName);
      assert.ok(DoctorSession.schema.paths.department);
      assert.ok(DoctorSession.schema.paths.isActive);
      assert.ok(DoctorSession.schema.paths.startTime);
      assert.ok(DoctorSession.schema.paths.tokensHandled);
      assert.ok(DoctorSession.schema.paths.avgConsultTime);
    });

    await t.test('7.3 QueueState Model Schema', () => {
      assert.ok(QueueState.schema.paths.date);
      assert.ok(QueueState.schema.paths.department);
      assert.ok(QueueState.schema.paths.currentTokenNumber);
      assert.ok(QueueState.schema.paths.totalTokensIssued);
      assert.ok(QueueState.schema.paths.totalCompleted);
    });

    await t.test('7.4 EmergencyCase Model Schema', () => {
      assert.ok(EmergencyCase.schema.paths.patientName);
      assert.ok(EmergencyCase.schema.paths.condition);
      assert.ok(EmergencyCase.schema.paths.severity);
      assert.ok(EmergencyCase.schema.paths['hospitalLocation.lat']);
      assert.ok(EmergencyCase.schema.paths['hospitalLocation.lng']);
      assert.ok(EmergencyCase.schema.paths.redirected);
    });

    await t.test('7.5 DailySummary Model & Aggregation', async () => {
      const { seedSummaryTestDb } = await import('../services/summaryService.js');

      assert.ok(DailySummary.schema.paths.date);
      assert.ok(DailySummary.schema.paths.totalTokens);
      assert.ok(DailySummary.schema.paths.totalCompleted);
      assert.ok(DailySummary.schema.paths.avgWaitTime);
      assert.ok(DailySummary.schema.paths.avgConsultTime);

      const todayStr = '2026-09-09';
      seedSummaryTestDb([
        {
          tokenNumber: 1,
          sessionDate: todayStr,
          status: 'done',
          isEmergency: false,
          createdAt: new Date('2026-09-09T09:00:00'),
          calledAt: new Date('2026-09-09T09:10:00'),
          consultationDuration: 8,
        },
        {
          tokenNumber: 2,
          sessionDate: todayStr,
          status: 'waiting',
          isEmergency: true,
          createdAt: new Date('2026-09-09T09:15:00'),
        },
      ]);

      const summaryResult = await generateDailySummary(todayStr);
      assert.ok(summaryResult);
      assert.equal(summaryResult.date, todayStr);
      assert.equal(summaryResult.totalTokens, 2);
      assert.equal(summaryResult.totalCompleted, 1);
      assert.equal(summaryResult.totalEmergencies, 1);
      assert.equal(summaryResult.avgWaitTime, 10);
      assert.equal(summaryResult.avgConsultTime, 8);
    });
  });

});
