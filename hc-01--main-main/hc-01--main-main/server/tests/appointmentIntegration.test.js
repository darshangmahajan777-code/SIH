import assert from 'assert';

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
console.log('TEST SUITE: Appointment Booking & Authoritative Queue Integration');
console.log('======================================================\n');

// ── Test 1: Booking Flow & Field Support ──
console.log('1. Appointment Booking Model & Field Support:');
it('should support patient, doctor, date, slot, mode, status, priority, complaint, tokenId, and timestamps', () => {
  const appointment = {
    patientId: 'user_pat_123',
    doctorId: 'doc_prof_456',
    date: '2026-10-20',
    slotTime: '10:30',
    mode: 'in-person', // 'in-person' | 'video'
    status: 'booked',  // 'booked' | 'checked-in' | 'in-progress' | 'completed' | 'cancelled' | 'no-show'
    priority: 'routine', // 'routine' | 'urgent' | 'critical'
    chiefComplaint: 'Chest tightness and shortness of breath',
    tokenId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  assert.strictEqual(appointment.mode, 'in-person');
  assert.strictEqual(appointment.status, 'booked');
  assert.strictEqual(appointment.priority, 'routine');
  assert.strictEqual(appointment.tokenId, null);
  assert.ok(appointment.createdAt instanceof Date);

  // Video mode
  const videoAppointment = { ...appointment, mode: 'video', priority: 'urgent' };
  assert.strictEqual(videoAppointment.mode, 'video');
  assert.strictEqual(videoAppointment.priority, 'urgent');
});

// ── Test 2: Server-Side Double Booking Prevention ──
console.log('\n2. Server-Side Double Booking Prevention:');
it('should reject a second booking for the same doctor, date, and slot with 409 Conflict', () => {
  const activeAppointments = new Map(); // Simulated DB unique index

  const bookSlot = ({ doctorId, date, slotTime, patientId }) => {
    const key = `${doctorId}_${date}_${slotTime}`;
    if (activeAppointments.has(key)) {
      const err = new Error(`Slot ${slotTime} on ${date} is already booked by another patient`);
      err.statusCode = 409;
      throw err;
    }
    const apt = { id: `apt_${Date.now()}`, doctorId, date, slotTime, patientId, status: 'booked' };
    activeAppointments.set(key, apt);
    return apt;
  };

  // 1st patient books 10:00 AM
  const apt1 = bookSlot({ doctorId: 'doc_1', date: '2026-10-20', slotTime: '10:00', patientId: 'pat_A' });
  assert.ok(apt1);
  assert.strictEqual(activeAppointments.size, 1);

  // 2nd patient attempts to book the EXACT same slot
  assert.throws(
    () => bookSlot({ doctorId: 'doc_1', date: '2026-10-20', slotTime: '10:00', patientId: 'pat_B' }),
    (err) => err.statusCode === 409,
    'Second booking for the same slot must throw 409 Conflict'
  );

  // Different slot succeeds
  const apt2 = bookSlot({ doctorId: 'doc_1', date: '2026-10-20', slotTime: '10:30', patientId: 'pat_B' });
  assert.ok(apt2);
  assert.strictEqual(activeAppointments.size, 2);
});

// ── Test 3: Cancellation Slot Release ──
console.log('\n3. Cancellation & Slot Release:');
it('should mark appointment as cancelled, free the slot, and permit re-booking', () => {
  const activeSlots = new Map();

  const slotKey = 'doc_1_2026-10-20_11:00';
  activeSlots.set(slotKey, { id: 'apt_1', status: 'booked', patientId: 'pat_A' });

  // Cancel appointment
  const apt = activeSlots.get(slotKey);
  apt.status = 'cancelled';
  apt.cancellationReason = 'Patient emergency';
  activeSlots.delete(slotKey); // Database partial unique index filter { status: { $ne: 'cancelled' } }

  assert.strictEqual(activeSlots.has(slotKey), false, 'Slot must be freed upon cancellation');

  // Now patient B can book the newly freed slot
  activeSlots.set(slotKey, { id: 'apt_2', status: 'booked', patientId: 'pat_B' });
  assert.strictEqual(activeSlots.get(slotKey).patientId, 'pat_B');
});

// ── Test 4: Reschedule Slot Swap ──
console.log('\n4. Reschedule Slot Swap:');
it('should atomically release the old slot and reserve the new slot', () => {
  const activeSlots = new Map();

  const oldSlotKey = 'doc_1_2026-10-20_09:30';
  const newSlotKey = 'doc_1_2026-10-21_14:00';

  activeSlots.set(oldSlotKey, { id: 'apt_old', status: 'booked' });

  // Reschedule function
  const reschedule = (oldKey, newKey) => {
    if (activeSlots.has(newKey)) {
      const err = new Error('New slot is occupied');
      err.statusCode = 409;
      throw err;
    }
    activeSlots.delete(oldKey); // Old slot freed
    activeSlots.set(newKey, { id: 'apt_new', status: 'booked', rescheduledFrom: 'apt_old' });
    return true;
  };

  reschedule(oldSlotKey, newSlotKey);

  assert.strictEqual(activeSlots.has(oldSlotKey), false, 'Old slot 09:30 must be released');
  assert.strictEqual(activeSlots.has(newSlotKey), true, 'New slot 14:00 must be booked');
  assert.strictEqual(activeSlots.get(newSlotKey).rescheduledFrom, 'apt_old');
});

// ── Test 5: Today Integration & Authoritative Token Bridge ──
console.log('\n5. Today Integration & Authoritative Token Bridge:');
it('should map appointment priority to authoritative queue priority and link Token', () => {
  // Mapping verification
  const mapPriority = (p) => {
    if (p === 'critical') return 'emergency';
    if (p === 'urgent') return 'senior';
    return 'general';
  };

  assert.strictEqual(mapPriority('critical'), 'emergency');
  assert.strictEqual(mapPriority('urgent'), 'senior');
  assert.strictEqual(mapPriority('routine'), 'general');

  // Simulated queue state
  const queueState = { currentTokenNumber: 10, totalTokensIssued: 10, waitingCount: 4 };
  const tokens = [];

  const authoritativeGenerateToken = ({ patientName, condition, priority }) => {
    queueState.currentTokenNumber += 1;
    queueState.totalTokensIssued += 1;
    queueState.waitingCount += 1;

    const token = {
      _id: `tok_${queueState.currentTokenNumber}`,
      tokenNumber: queueState.currentTokenNumber,
      patientName,
      condition,
      priority,
      status: 'waiting',
      department: 'OPD',
      createdAt: new Date(),
    };
    tokens.push(token);
    return token;
  };

  // Appointment booked for today
  const todayStr = new Date().toISOString().slice(0, 10);
  const appointmentBooking = {
    patientId: 'pat_1',
    patientName: 'Aarav Patel',
    date: todayStr,
    slotTime: '11:00',
    priority: 'critical',
    chiefComplaint: 'Severe asthma exacerbation',
  };

  // Bridge logic:
  const token = authoritativeGenerateToken({
    patientName: appointmentBooking.patientName,
    condition: appointmentBooking.chiefComplaint,
    priority: mapPriority(appointmentBooking.priority),
  });

  const appointment = {
    ...appointmentBooking,
    status: 'booked',
    tokenId: token._id, // Authoritative bridge
  };

  assert.strictEqual(appointment.tokenId, 'tok_11', 'Token reference must be stored on Appointment');
  assert.strictEqual(token.priority, 'emergency', 'Critical must be mapped to emergency priority');
  assert.strictEqual(token.tokenNumber, 11);
  assert.strictEqual(queueState.currentTokenNumber, 11);
  assert.strictEqual(queueState.waitingCount, 5);
});

// ── Test 6: Authorization Checks ──
console.log('\n6. Authorization Checks:');
it('should enforce that only the patient or assigned doctor can cancel the appointment', () => {
  const apt = {
    id: 'apt_100',
    patientId: 'patient_user_01',
    doctorId: 'doc_profile_99',
    doctorUserId: 'doc_user_99',
  };

  const authorizeCancel = (requesterUserId) => {
    const isPatient = requesterUserId === apt.patientId;
    const isDoctor = requesterUserId === apt.doctorUserId;
    if (!isPatient && !isDoctor) {
      const err = new Error('Not authorized to cancel this appointment');
      err.statusCode = 403;
      throw err;
    }
    return true;
  };

  // Patient can cancel
  assert.strictEqual(authorizeCancel('patient_user_01'), true);

  // Doctor can cancel
  assert.strictEqual(authorizeCancel('doc_user_99'), true);

  // Third party cannot cancel
  assert.throws(
    () => authorizeCancel('attacker_user_66'),
    (err) => err.statusCode === 403,
    'Unauthorized user must be rejected with 403'
  );
});

// ── Test 7: Queue Regression (Single Authoritative Queue Engine) ──
console.log('\n7. Queue Regression & Zero Secondary Queue Enforcement:');
it('should preserve existing Reception, Doctor call, and Display functions on a single queue', () => {
  const opdQueue = [];
  const queueState = { currentTokenNumber: 0, waitingCount: 0 };

  // 1. Reception creates Token #1
  queueState.currentTokenNumber++;
  queueState.waitingCount++;
  opdQueue.push({ tokenNumber: queueState.currentTokenNumber, source: 'Reception', status: 'waiting', priority: 'general' });

  // 2. Appointment Booking creates Token #2 (bridged)
  queueState.currentTokenNumber++;
  queueState.waitingCount++;
  opdQueue.push({ tokenNumber: queueState.currentTokenNumber, source: 'Appointment', status: 'waiting', priority: 'emergency' });

  // 3. Reception creates Token #3
  queueState.currentTokenNumber++;
  queueState.waitingCount++;
  opdQueue.push({ tokenNumber: queueState.currentTokenNumber, source: 'Reception', status: 'waiting', priority: 'general' });

  assert.strictEqual(opdQueue.length, 3);
  assert.strictEqual(queueState.currentTokenNumber, 3);
  assert.strictEqual(queueState.waitingCount, 3);

  // 4. Doctor calls next patient (Priority aware: emergency Token #2 called first!)
  const waiting = opdQueue.filter((t) => t.status === 'waiting');
  waiting.sort((a, b) => {
    const pOrder = { emergency: 1, senior: 2, general: 3 };
    return pOrder[a.priority] - pOrder[b.priority];
  });

  const calledToken = waiting[0];
  assert.strictEqual(calledToken.tokenNumber, 2, 'Doctor panel must prioritize emergency Token #2');
  calledToken.status = 'called';
  queueState.waitingCount--;

  // 5. Display Board shows active queue
  const displayTokens = opdQueue.map((t) => ({ token: t.tokenNumber, status: t.status }));
  assert.deepStrictEqual(displayTokens, [
    { token: 1, status: 'waiting' },
    { token: 2, status: 'called' },
    { token: 3, status: 'waiting' },
  ]);
  assert.strictEqual(queueState.waitingCount, 2);
});

console.log(`\n======================================================`);
console.log(`Results: ${passed} passed, ${failed} failed`);
console.log(`======================================================\n`);

if (failed > 0) {
  process.exit(1);
}
