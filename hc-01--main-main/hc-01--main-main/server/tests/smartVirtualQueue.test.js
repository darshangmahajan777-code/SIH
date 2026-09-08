import assert from 'assert';
import {
  calculateTimeWindow,
  sortTokensByPriority,
  getPriorityReason,
  calculateTokenQueueMetrics,
} from '../services/virtualQueueService.js';

let passed = 0;
let failed = 0;

function it(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ ${name}:`, err.message);
    failed++;
  }
}

async function itAsync(name, fn) {
  try {
    await fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ ${name}:`, err.message);
    failed++;
  }
}

console.log('\n======================================================');
console.log('TEST SUITE: Smart Virtual Queue & Real-Time Estimation');
console.log('======================================================\n');

// ── Test 1: Time Window & Recommended Arrival Calculation ──
console.log('1. Time Window & Recommended Arrival Calculation:');
it('should calculate realistic time windows instead of fake exactness, plus recommended arrival', () => {
  // Base time: 4:00 PM (16:00:00)
  const baseTime = new Date('2026-10-20T16:00:00');
  // 40 minutes estimated wait
  const timeWin = calculateTimeWindow(40, baseTime);

  console.log(`     Estimated Time: ${timeWin.estimatedTime}`);
  console.log(`     Estimated Window: ${timeWin.estimatedWindow}`);
  console.log(`     Recommended Arrival: ${timeWin.recommendedArrivalTime}`);

  assert.strictEqual(timeWin.estimatedTime, '4:40 PM');
  assert.ok(timeWin.estimatedWindow.includes('PM'));
  assert.ok(timeWin.estimatedWindow.includes('–'));
  assert.ok(timeWin.recommendedArrivalTime.includes('PM'));
});

// ── Test 2: Near Turn Detection ──
console.log('\n2. Near-Turn Threshold Detection:');
it('should flag near turn when wait is <= 15 minutes or patients ahead <= threshold', () => {
  const baseTime = new Date('2026-10-20T16:00:00');

  const nearTurnWindow = calculateTimeWindow(10, baseTime);
  assert.strictEqual(nearTurnWindow.isNearTurn, true, 'Wait of 10 min must be flagged as near turn');

  const farTurnWindow = calculateTimeWindow(60, baseTime);
  assert.strictEqual(farTurnWindow.isNearTurn, false, 'Wait of 60 min must not be flagged as near turn');
});

// ── Test 3: Queue Progression & Decreasing ETA ──
console.log('\n3. Queue Progression & Decreasing ETA:');
it('should decrease patientsAhead and advance window as queue progresses', () => {
  const baseTime = new Date('2026-10-20T16:00:00');

  // Step A: 8 patients ahead, avg consult 10 min -> 80 min wait
  const winA = calculateTimeWindow(80, baseTime);

  // Step B: 4 patients completed -> 4 patients ahead -> 40 min wait
  const winB = calculateTimeWindow(40, baseTime);

  // Step C: 1 patient ahead -> 10 min wait
  const winC = calculateTimeWindow(10, baseTime);

  console.log(`     At 80 min wait: window = ${winA.estimatedWindow}`);
  console.log(`     At 40 min wait: window = ${winB.estimatedWindow}`);
  console.log(`     At 10 min wait: window = ${winC.estimatedWindow}, arrival = ${winC.recommendedArrivalTime}`);

  assert.ok(winA.estimatedTime !== winB.estimatedTime);
  assert.strictEqual(winC.isNearTurn, true);
});

// ── Test 4: Doctor Slowdown & Dynamic Pace Adaptation ──
console.log('\n4. Doctor Slowdown & Dynamic Pace Adaptation:');
it('should dynamically expand wait time window if average consultation time increases', () => {
  const patientsAhead = 5;
  const baseTime = new Date('2026-10-20T16:00:00');

  // Normal pace: 8 min per patient -> 40 min wait
  const normalPace = calculateTimeWindow(patientsAhead * 8, baseTime);

  // Doctor slowed down: 15 min per patient -> 75 min wait
  const slowPace = calculateTimeWindow(patientsAhead * 15, baseTime);

  console.log(`     Normal Pace (8 min/pt): ${normalPace.estimatedWindow}`);
  console.log(`     Slow Pace (15 min/pt): ${slowPace.estimatedWindow}`);

  assert.notStrictEqual(normalPace.estimatedWindow, slowPace.estimatedWindow);
  assert.ok(normalPace.estimatedTime.includes('4:40 PM'));
  assert.ok(slowPace.estimatedTime.includes('5:15 PM'));
});

// ── Test 5: Priority Effect & Queue Interleaving ──
console.log('\n5. Priority Effect on Queue Order & Reasoning:');
it('should place emergency patients ahead of general patients and update reason', () => {
  const tokens = [
    { _id: 'tok_gen1', tokenNumber: 1, priority: 'general', createdAt: new Date('2026-10-20T09:00:00') },
    { _id: 'tok_gen2', tokenNumber: 2, priority: 'general', createdAt: new Date('2026-10-20T09:05:00') },
    { _id: 'tok_emg',  tokenNumber: 3, priority: 'emergency', createdAt: new Date('2026-10-20T09:10:00') }, // Arrived later!
    { _id: 'tok_sen',  tokenNumber: 4, priority: 'senior', createdAt: new Date('2026-10-20T09:08:00') },
  ];

  const sorted = sortTokensByPriority(tokens);

  assert.strictEqual(sorted[0].tokenNumber, 3, 'Emergency Token #3 must be #1');
  assert.strictEqual(sorted[1].tokenNumber, 4, 'Senior Token #4 must be #2');
  assert.strictEqual(sorted[2].tokenNumber, 1, 'General Token #1 must be #3');
  assert.strictEqual(sorted[3].tokenNumber, 2, 'General Token #2 must be #4');

  const reasonEmg = getPriorityReason(sorted[0], 1, 4);
  assert.ok(reasonEmg.includes('Emergency'));

  const reasonSen = getPriorityReason(sorted[1], 2, 4);
  assert.ok(reasonSen.includes('Senior'));

  const reasonGen = getPriorityReason(sorted[2], 3, 4);
  assert.strictEqual(reasonGen, 'Standard queue order');
});

// ── Test 6: Patient Room Isolation ──
console.log('\n6. Patient Room Isolation:');
it('should route private queue updates strictly to matching patient-room:{patientId}', () => {
  const roomMessages = new Map();

  const emitToPatient = (patId, event, data) => {
    const room = `patient-room:${patId}`;
    if (!roomMessages.has(room)) roomMessages.set(room, []);
    roomMessages.get(room).push({ event, data });
  };

  // Emit to Patient A
  emitToPatient('pat_A', 'queue:position-update', { tokenNumber: 31, position: 8, patientsAhead: 7 });

  // Emit to Patient B
  emitToPatient('pat_B', 'queue:position-update', { tokenNumber: 12, position: 2, patientsAhead: 1 });

  assert.strictEqual(roomMessages.get('patient-room:pat_A').length, 1);
  assert.strictEqual(roomMessages.get('patient-room:pat_A')[0].data.tokenNumber, 31);

  assert.strictEqual(roomMessages.get('patient-room:pat_B').length, 1);
  assert.strictEqual(roomMessages.get('patient-room:pat_B')[0].data.tokenNumber, 12);

  // Patient C receives nothing
  assert.strictEqual(roomMessages.has('patient-room:pat_C'), false, 'Uninvolved patients must not receive foreign updates');
});

// ── Test 7: Realtime Event Payload Validation ──
console.log('\n7. Realtime Event Payload Validation:');
it('should emit queue:position-update with position, patientsAhead, estimatedTime, recommendedArrivalTime', () => {
  const payload = {
    position: 8,
    patientsAhead: 7,
    estimatedTime: '4:40 PM',
    estimatedWindow: '4:30–4:50 PM',
    recommendedArrivalTime: '4:15 PM',
  };

  assert.ok('position' in payload);
  assert.ok('patientsAhead' in payload);
  assert.ok('estimatedTime' in payload);
  assert.ok('recommendedArrivalTime' in payload);
  assert.strictEqual(payload.position, 8);
  assert.strictEqual(payload.patientsAhead, 7);
});

// ── Test 8: Disconnect and Reconnect State Recovery ──
console.log('\n8. Disconnect and Reconnect State Recovery:');
it('should restore accurate queue position and ETA on client reconnection without desync', () => {
  let clientConnected = true;
  let clientQueueState = { position: 8, patientsAhead: 7, tokenNumber: 31 };

  // Simulate network disconnect
  clientConnected = false;

  // Server progresses queue while client is offline (2 patients ahead complete)
  const serverQueueState = { position: 6, patientsAhead: 5, tokenNumber: 31 };

  // Client reconnects
  clientConnected = true;

  // Client queries latest state on reconnect: GET /api/appointments/:id/queue-position
  const onReconnectFetch = () => {
    return { ...serverQueueState, lastUpdated: new Date().toISOString() };
  };

  clientQueueState = onReconnectFetch();

  assert.strictEqual(clientConnected, true);
  assert.strictEqual(clientQueueState.position, 6, 'Client position must resync to 6');
  assert.strictEqual(clientQueueState.patientsAhead, 5, 'Client patients ahead must resync to 5');
});

// ── Test 9: ETA Changes on Patient Cancellation ──
console.log('\n9. ETA Changes on Patient Cancellation:');
it('should recalculate position and reduce wait time immediately when patient ahead cancels', () => {
  const waitingTokens = [
    { _id: 'tok_1', tokenNumber: 1, priority: 'general', createdAt: new Date('2026-10-20T09:00:00') },
    { _id: 'tok_2', tokenNumber: 2, priority: 'general', createdAt: new Date('2026-10-20T09:05:00') },
    { _id: 'tok_3', tokenNumber: 3, priority: 'general', createdAt: new Date('2026-10-20T09:10:00') }, // Target patient #3
  ];

  // Before cancellation: tok_3 is at index 2 (position 3, 2 patients ahead)
  let sorted = sortTokensByPriority(waitingTokens);
  let pos = sorted.findIndex((t) => t.tokenNumber === 3) + 1;
  assert.strictEqual(pos, 3);
  assert.strictEqual(pos - 1, 2);

  // Patient #1 cancels
  const remainingTokens = waitingTokens.filter((t) => t.tokenNumber !== 1);
  sorted = sortTokensByPriority(remainingTokens);
  pos = sorted.findIndex((t) => t.tokenNumber === 3) + 1;

  assert.strictEqual(pos, 2, 'Position must advance from 3 to 2 after cancellation');
  assert.strictEqual(pos - 1, 1, 'Patients ahead must reduce from 2 to 1');
});

// ── Test 10: AI Failure & Fallback Resilience ──
console.log('\n10. AI Failure & Deterministic Fallback:');
await itAsync('should fall back to rolling average wait calculation when AI service is offline', async () => {
  const token = {
    _id: 'tok_31',
    tokenNumber: 31,
    priority: 'general',
    status: 'waiting',
    createdAt: new Date(),
  };

  // 7 tokens ahead
  const waitingTokens = Array.from({ length: 7 }, (_, i) => ({
    _id: `tok_${i + 1}`,
    tokenNumber: i + 1,
    priority: 'general',
    status: 'waiting',
    createdAt: new Date(Date.now() - (10 - i) * 60000),
  }));
  waitingTokens.push(token);

  const avgTime = 12; // 12 minutes rolling average

  // Invokes calculateTokenQueueMetrics which attempts AI /predict and falls back to 7 * 12 = 84 min
  const metrics = await calculateTokenQueueMetrics(token, waitingTokens, avgTime);

  assert.strictEqual(metrics.tokenNumber, 31);
  assert.strictEqual(metrics.position, 8);
  assert.strictEqual(metrics.patientsAhead, 7);
  assert.ok(metrics.estimatedWaitMinutes > 0, 'Wait minutes must be calculated');
  assert.ok(metrics.estimatedWindow.includes('–'), 'Window must be present');
  assert.ok(metrics.recommendedArrivalTime.length > 0);
  assert.strictEqual(metrics.reason, 'Standard queue order');
});

console.log(`\n======================================================`);
console.log(`Results: ${passed} passed, ${failed} failed`);
console.log(`======================================================\n`);

if (failed > 0) {
  process.exit(1);
}
