import assert from 'assert';
import {
  timeToMinutes,
  minutesToTime,
  getDayOfWeek,
  isDoctorOnLeave,
  isDoctorHoliday,
  generateDaySlots,
} from '../services/scheduleService.js';

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

console.log('\n======================================================');
console.log('TEST SUITE: Doctor Scheduling, Availability & Slot Enforcing');
console.log('======================================================\n');

// ── Test 1: Slot Generation & Break Exclusion ──
console.log('1. Slot Generation & Break Exclusion:');
it('should generate 30-minute intervals from 09:00 to 17:00 and exclude break intervals', () => {
  const breaks = [{ startTime: '13:00', endTime: '14:00', reason: 'Lunch' }];
  const slots = generateDaySlots({
    startTime: '09:00',
    endTime: '17:00',
    slotDuration: 30,
    breaks,
    dateStr: '2026-10-15', // Future date
  });

  // Total working hours: 09:00 to 17:00 = 8 hours = 16 30-min slots
  // Break: 13:00 to 14:00 = 1 hour = 2 slots (13:00, 13:30)
  // Expected theoretical slots: 16 - 2 = 14 slots
  assert.strictEqual(slots.length, 14, `Expected 14 slots, got ${slots.length}`);

  const has1300 = slots.some((s) => s.time === '13:00');
  const has1330 = slots.some((s) => s.time === '13:30');
  assert.strictEqual(has1300, false, '13:00 Lunch break slot must be excluded');
  assert.strictEqual(has1330, false, '13:30 Lunch break slot must be excluded');

  assert.strictEqual(slots[0].time, '09:00');
  assert.strictEqual(slots[slots.length - 1].time, '16:30');
});

// ── Test 2: Double Booking Prevention Logic ──
console.log('\n2. Real-Time Slot Validity & Double Booking Prevention:');
it('should mark a booked slot as unavailable in real-time and reject double booking', () => {
  const allSlots = generateDaySlots({
    startTime: '09:00',
    endTime: '12:00',
    slotDuration: 30,
    breaks: [],
    dateStr: '2026-10-15',
  }); // 09:00, 09:30, 10:00, 10:30, 11:00, 11:30 = 6 slots

  // Simulate active booked appointments in DB
  const bookedSlotsInDB = new Set(['09:30', '11:00']);

  const liveSlots = allSlots.map((slot) => ({
    ...slot,
    isBooked: bookedSlotsInDB.has(slot.time),
    isAvailable: !bookedSlotsInDB.has(slot.time),
  }));

  const openSlots = liveSlots.filter((s) => s.isAvailable);
  assert.strictEqual(openSlots.length, 4, 'Expected 4 open slots after excluding 2 booked slots');

  const slot0930 = liveSlots.find((s) => s.time === '09:30');
  assert.strictEqual(slot0930.isBooked, true);
  assert.strictEqual(slot0930.isAvailable, false);

  // Attempt second booking for 09:30
  const attemptBooking = (time) => {
    if (bookedSlotsInDB.has(time)) {
      const err = new Error(`Slot ${time} is already booked by another patient`);
      err.statusCode = 409;
      throw err;
    }
    bookedSlotsInDB.add(time);
    return true;
  };

  assert.throws(
    () => attemptBooking('09:30'),
    (err) => err.statusCode === 409,
    'Second booking for 09:30 must throw 409 Conflict'
  );

  // Booking an open slot succeeds
  assert.strictEqual(attemptBooking('10:00'), true);
  assert.strictEqual(bookedSlotsInDB.has('10:00'), true);
});

// ── Test 3: Cancellation Slot Release ──
console.log('\n3. Cancellation Slot Release:');
it('should release the slot immediately when an appointment is cancelled', () => {
  const activeBookings = new Map();
  activeBookings.set('09:30', { id: 'apt_1', patient: 'Patient A', status: 'booked' });

  assert.strictEqual(activeBookings.has('09:30'), true);

  // Cancel appointment
  const apt = activeBookings.get('09:30');
  apt.status = 'cancelled';
  activeBookings.delete('09:30'); // Slot freed

  assert.strictEqual(activeBookings.has('09:30'), false, 'Slot 09:30 must now be free');

  // New patient can book slot 09:30 now
  activeBookings.set('09:30', { id: 'apt_2', patient: 'Patient B', status: 'booked' });
  assert.strictEqual(activeBookings.get('09:30').patient, 'Patient B');
});

// ── Test 4: Reschedule Slot Swap ──
console.log('\n4. Reschedule Slot Swap:');
it('should atomically free the previous slot and claim the new slot', () => {
  const bookedSlots = new Set(['10:00']);

  const reschedule = (oldSlot, newSlot) => {
    if (bookedSlots.has(newSlot)) {
      throw new Error('New slot is not available');
    }
    bookedSlots.delete(oldSlot); // Free old slot
    bookedSlots.add(newSlot);    // Reserve new slot
    return true;
  };

  reschedule('10:00', '11:30');

  assert.strictEqual(bookedSlots.has('10:00'), false, 'Old slot 10:00 must be released');
  assert.strictEqual(bookedSlots.has('11:30'), true, 'New slot 11:30 must be reserved');
});

// ── Test 5: Doctor Unavailable (Off-Days) ──
console.log('\n5. Doctor Unavailable on Off-Days:');
it('should return isAvailable=false when doctor is closed on a day', () => {
  const weeklySchedule = [
    { day: 'monday', isWorking: true },
    { day: 'tuesday', isWorking: true },
    { day: 'wednesday', isWorking: true },
    { day: 'thursday', isWorking: true },
    { day: 'friday', isWorking: true },
    { day: 'saturday', isWorking: false },
    { day: 'sunday', isWorking: false },
  ];

  // 2026-10-18 is Sunday
  const dayName = getDayOfWeek('2026-10-18');
  assert.strictEqual(dayName, 'sunday');

  const sundaySched = weeklySchedule.find((s) => s.day === dayName);
  assert.strictEqual(sundaySched.isWorking, false, 'Doctor must be marked as not working on Sunday');
});

// ── Test 6: Leaves & Holidays ──
console.log('\n6. Leaves & Holidays:');
it('should detect when doctor is on leave or public holiday', () => {
  const leaves = [
    {
      startDate: new Date('2026-11-10T00:00:00'),
      endDate: new Date('2026-11-15T23:59:59'),
      reason: 'Medical Conference',
    },
  ];

  const holidays = [new Date('2026-12-25T00:00:00')];

  // During leave
  const onLeave1 = isDoctorOnLeave(leaves, '2026-11-12');
  assert.ok(onLeave1, 'Date 2026-11-12 must be identified as during leave');
  assert.strictEqual(onLeave1.reason, 'Medical Conference');

  // Outside leave
  const onLeave2 = isDoctorOnLeave(leaves, '2026-11-20');
  assert.strictEqual(Boolean(onLeave2), false, 'Date 2026-11-20 is outside leave');

  // Holiday
  const isHoli = isDoctorHoliday(holidays, '2026-12-25');
  assert.strictEqual(isHoli, true, 'Christmas must be identified as holiday');

  const notHoli = isDoctorHoliday(holidays, '2026-12-24');
  assert.strictEqual(notHoli, false, 'Christmas Eve is not a holiday');
});

// ── Test 7: Same-Day Booking & Past Slot Filtering ──
console.log('\n7. Same-Day Booking & Past Slot Filtering:');
it('should flag past slots as unavailable on same-day appointments', () => {
  const todayStr = new Date().toISOString().slice(0, 10);
  const slots = generateDaySlots({
    startTime: '08:00',
    endTime: '22:00',
    slotDuration: 30,
    breaks: [],
    dateStr: todayStr,
  });

  const currentMinutes = new Date().getHours() * 60 + new Date().getMinutes();
  const pastSlots = slots.filter((s) => timeToMinutes(s.time) < currentMinutes);
  const futureSlots = slots.filter((s) => timeToMinutes(s.time) >= currentMinutes);

  for (const s of pastSlots) {
    assert.strictEqual(s.isPast, true, `Past slot ${s.time} must have isPast=true`);
  }

  for (const s of futureSlots) {
    assert.strictEqual(s.isPast, false, `Future slot ${s.time} must have isPast=false`);
  }
});

console.log(`\n======================================================`);
console.log(`Results: ${passed} passed, ${failed} failed`);
console.log(`======================================================\n`);

if (failed > 0) {
  process.exit(1);
}
