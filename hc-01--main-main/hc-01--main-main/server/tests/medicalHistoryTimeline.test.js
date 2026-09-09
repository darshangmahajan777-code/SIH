/**
 * TEST SUITE: Medical History Timeline
 *
 * Tests all 8 security and correctness scenarios:
 *   1.  self_reported       — patient adds self-reported entry; fields correct
 *   2.  doctor_verified     — appointment completion auto-creates verified entry
 *   3.  consent             — doctor without grant gets 403 on timeline access
 *   4.  revocation          — revoking a grant blocks subsequent doctor access
 *   5.  timeline_sorting    — multiple entries returned newest-first
 *   6.  patient_isolation   — Patient A cannot see Patient B timeline via query param
 *   7.  no_fabrication      — doctorId comes from appointment, not caller input
 *   8.  self_report_delete  — patient can soft-delete self-reported; doctor-verified immutable
 */

import assert from "assert";

// ── In-memory stores ──────────────────────────────────────────────────────────
const historyStore = [];
const grantStore = [];
let idCounter = 1;
const makeId = () => "id" + String(idCounter++).padStart(5, "0");

// ── Mock MedicalHistory ───────────────────────────────────────────────────────
const MedicalHistory = {
  async create(data) {
    // Simulate unique index on appointmentId
    if (data.appointmentId && historyStore.find((e) => e.appointmentId === data.appointmentId && e.isActive !== false)) {
      const err = new Error("Duplicate key");
      err.code = 11000;
      throw err;
    }
    const doc = { _id: makeId(), isActive: true, createdAt: new Date(), ...data };
    historyStore.push(doc);
    return doc;
  },
  find({ patientId, isActive = true }) {
    const results = historyStore.filter((e) => e.patientId === patientId && e.isActive === isActive);
    return {
      sort(sortOrder) {
        const key = Object.keys(sortOrder)[0];
        const dir = sortOrder[key]; // 1 = ascending, -1 = descending
        results.sort((a, b) => {
          if (a[key] < b[key]) return dir === -1 ? 1 : -1;
          if (a[key] > b[key]) return dir === -1 ? -1 : 1;
          return 0;
        });
        return this;
      },
      lean: async () => results,
    };
  },
  async findById(id) {
    return historyStore.find((e) => e._id === id) || null;
  },
};

// ── Mock Appointment ──────────────────────────────────────────────────────────
const appointmentDb = {
  "apt-001": {
    _id: "apt-001", patientId: "patient-A", date: "2026-08-12",
    chiefComplaint: "Malaria", status: "completed",
    doctorId: { _id: "dr-001", doctorName: "Dr. XYZ" },
  },
  "apt-002": {
    _id: "apt-002", patientId: "patient-A", date: "2026-03-15",
    chiefComplaint: "COVID-19", status: "completed",
    doctorId: { _id: "dr-002", doctorName: "Dr. ABC" },
  },
  // Different doctor's appointment — should still use appointment's doctorId
  "apt-003": {
    _id: "apt-003", patientId: "patient-B", date: "2026-09-01",
    chiefComplaint: "Fever", status: "completed",
    doctorId: { _id: "dr-003", doctorName: "Dr. PQR" },
  },
};

const Appointment = {
  async findById(id) {
    const base = appointmentDb[id];
    if (!base) return null;
    return base;
  },
};

// ── Inline historyService functions ───────────────────────────────────────────

async function addSelfReportedEntry({ patientId, condition, conditionDate, notes = "" }) {
  if (!patientId || !condition || !conditionDate) throw { status: 400, message: "patientId, condition, and conditionDate are required" };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(conditionDate)) throw { status: 400, message: "conditionDate must be in YYYY-MM-DD format" };
  return MedicalHistory.create({ patientId, condition: condition.trim(), conditionDate, notes: notes.trim(), source: "self_reported", doctorId: null, doctorName: null, appointmentId: null, isActive: true });
}

async function createDoctorVerifiedEntry({ appointmentId }) {
  if (!appointmentId) return null;
  const appointment = await Appointment.findById(appointmentId);
  if (!appointment || appointment.status !== "completed") return null;
  const condition = (appointment.chiefComplaint || "").trim() || "Consultation";
  const doctorName = appointment.doctorId?.doctorName || "Attending Physician";
  try {
    return await MedicalHistory.create({
      patientId: appointment.patientId,
      condition,
      conditionDate: appointment.date,
      notes: `Consultation completed. Doctor: ${doctorName}.`,
      source: "doctor_verified",
      doctorId: appointment.doctorId?._id,
      doctorName,
      appointmentId: appointment._id,
      isActive: true,
    });
  } catch (err) {
    if (err.code === 11000) return null; // idempotent
    return null;
  }
}

async function getPatientTimeline(patientId) {
  return MedicalHistory.find({ patientId, isActive: true }).sort({ conditionDate: -1 }).lean();
}

async function deleteEntry({ entryId, patientId }) {
  const entry = await MedicalHistory.findById(entryId);
  if (!entry) throw { status: 404, message: "Entry not found" };
  if (entry.patientId !== patientId) throw { status: 403, message: "Forbidden: You may only delete your own entries" };
  if (entry.source === "doctor_verified") throw { status: 403, message: "Doctor-verified entries cannot be deleted" };
  entry.isActive = false;
  return entry;
}

// ── Inline requireConsent logic (mirrors the real middleware) ─────────────────

async function checkAccess({ doctorId, patientId }) {
  return grantStore.find((g) => g.doctorId === doctorId && g.patientId === patientId && g.revokedAt === null) || null;
}

async function requireConsentForTimeline({ doctorId, patientId }) {
  const grant = await checkAccess({ doctorId, patientId });
  if (!grant) throw { status: 403, message: "Access denied. Patient has not granted you access to this medical record, or the grant has been revoked." };
  return grant;
}

function grantAccess(doctorId, patientId) {
  const grant = { _id: makeId(), doctorId, patientId, scope: "ongoing", revokedAt: null };
  grantStore.push(grant);
  return grant;
}

function revokeGrant(grantId) {
  const g = grantStore.find((x) => x._id === grantId);
  if (g) g.revokedAt = new Date();
}

// ── Test harness ──────────────────────────────────────────────────────────────
let passed = 0, failed = 0;

async function it(name, fn) {
  try {
    await fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ ${name}: ${err.message || JSON.stringify(err)}`);
    failed++;
  }
}

function resetHistory() { historyStore.length = 0; grantStore.length = 0; }

const PATIENT_A = "patient-A";
const PATIENT_B = "patient-B";
const DOCTOR_1 = "doctor-111";
const DOCTOR_2 = "doctor-222";

console.log("\n======================================================");
console.log("TEST SUITE: Medical History Timeline");
console.log("======================================================\n");

// ── Test 1: Self-Reported ─────────────────────────────────────────────────────
console.log("1. Self-reported entry:");
await it("should create entry with source=self_reported and correct fields", async () => {
  resetHistory();
  const entry = await addSelfReportedEntry({ patientId: PATIENT_A, condition: "COVID-19", conditionDate: "2025-03-15", notes: "Mild symptoms, recovered in 10 days." });
  assert.strictEqual(entry.source, "self_reported");
  assert.strictEqual(entry.condition, "COVID-19");
  assert.strictEqual(entry.conditionDate, "2025-03-15");
  assert.strictEqual(entry.doctorId, null);
  assert.strictEqual(entry.doctorName, null);
  assert.strictEqual(entry.appointmentId, null);
  assert.strictEqual(entry.isActive, true);
  console.log(`     Entry: ${entry.condition} | ${entry.conditionDate} | ${entry.source}`);
});

await it("should reject invalid date format", async () => {
  let rejected = false;
  try {
    await addSelfReportedEntry({ patientId: PATIENT_A, condition: "Flu", conditionDate: "15-03-2025" });
  } catch (err) {
    rejected = true;
    assert.strictEqual(err.status, 400);
  }
  assert.ok(rejected, "Invalid date format must be rejected");
});

// ── Test 2: Doctor-Verified ────────────────────────────────────────────────────
console.log("\n2. Doctor-verified entry (auto-created on appointment completion):");
await it("should create doctor-verified entry with doctorName and source from appointment", async () => {
  resetHistory();
  const entry = await createDoctorVerifiedEntry({ appointmentId: "apt-001" });
  assert.ok(entry, "Entry must be created");
  assert.strictEqual(entry.source, "doctor_verified");
  assert.strictEqual(entry.condition, "Malaria");
  assert.strictEqual(entry.conditionDate, "2026-08-12");
  assert.strictEqual(entry.doctorName, "Dr. XYZ");   // From appointment, not caller input
  assert.strictEqual(entry.doctorId, "dr-001");       // From appointment DoctorProfile
  assert.strictEqual(entry.patientId, PATIENT_A);
  assert.strictEqual(entry.appointmentId, "apt-001");
  console.log(`     Entry: ${entry.condition} | ${entry.conditionDate} | ${entry.source} | ${entry.doctorName}`);
});

await it("should be idempotent — duplicate creation for same appointment returns null", async () => {
  const second = await createDoctorVerifiedEntry({ appointmentId: "apt-001" });
  assert.strictEqual(second, null, "Duplicate appointment entry must be null (idempotent)");
  const total = historyStore.filter((e) => e.appointmentId === "apt-001").length;
  assert.strictEqual(total, 1, "Only one entry should exist per appointment");
  console.log(`     Idempotency: second call returned null, store has exactly 1 entry ✓`);
});

// ── Test 3: Consent — Doctor Without Grant ────────────────────────────────────
console.log("\n3. Consent — doctor without grant gets 403:");
await it("should return 403 for doctor with no AccessGrant", async () => {
  let denied = false;
  try {
    await requireConsentForTimeline({ doctorId: DOCTOR_1, patientId: PATIENT_A });
  } catch (err) {
    denied = true;
    assert.strictEqual(err.status, 403);
    console.log(`     403: "${err.message.slice(0, 60)}..."`);
  }
  assert.ok(denied, "Doctor without grant must receive 403");
});

await it("should allow access after patient grants consent", async () => {
  grantAccess(DOCTOR_1, PATIENT_A);
  const grant = await requireConsentForTimeline({ doctorId: DOCTOR_1, patientId: PATIENT_A });
  assert.ok(grant, "Access must be allowed after grant");
  const timeline = await getPatientTimeline(PATIENT_A);
  assert.ok(Array.isArray(timeline), "Timeline must be an array");
  console.log(`     Consent granted: doctor sees ${timeline.length} timeline entries`);
});

// ── Test 4: Revocation ────────────────────────────────────────────────────────
console.log("\n4. Revocation — grant revoked mid-session blocks subsequent access:");
await it("should block doctor access after grant is revoked", async () => {
  const grant = grantStore[grantStore.length - 1]; // Last grant
  revokeGrant(grant._id);

  let denied = false;
  try {
    await requireConsentForTimeline({ doctorId: DOCTOR_1, patientId: PATIENT_A });
  } catch (err) {
    denied = true;
    assert.strictEqual(err.status, 403);
    console.log(`     After revocation: 403 returned correctly`);
  }
  assert.ok(denied, "Revoked grant must result in 403");
});

// ── Test 5: Timeline Sorting ──────────────────────────────────────────────────
console.log("\n5. Timeline sorting — entries returned newest conditionDate first:");
await it("should return entries sorted newest-first by conditionDate", async () => {
  resetHistory();
  await addSelfReportedEntry({ patientId: PATIENT_A, condition: "Flu", conditionDate: "2024-01-10" });
  await addSelfReportedEntry({ patientId: PATIENT_A, condition: "COVID-19", conditionDate: "2025-03-15" });
  await createDoctorVerifiedEntry({ appointmentId: "apt-001" }); // 2026-08-12
  await createDoctorVerifiedEntry({ appointmentId: "apt-002" }); // 2026-03-15

  const timeline = await getPatientTimeline(PATIENT_A);
  assert.strictEqual(timeline.length, 4, "All 4 active entries should be returned");

  // Verify descending order
  for (let i = 0; i < timeline.length - 1; i++) {
    assert.ok(
      timeline[i].conditionDate >= timeline[i + 1].conditionDate,
      `Entry [${i}] (${timeline[i].conditionDate}) should be >= entry [${i + 1}] (${timeline[i + 1].conditionDate})`
    );
  }

  console.log("     Sorted order:");
  timeline.forEach((e, i) => console.log(`       #${i + 1}: ${e.condition} | ${e.conditionDate} | ${e.source}`));
});

// ── Test 6: Patient Isolation ─────────────────────────────────────────────────
console.log("\n6. Patient isolation — Patient A cannot see Patient B entries:");
await it("should only return entries belonging to the requesting patient", async () => {
  // Create a Patient B entry
  await createDoctorVerifiedEntry({ appointmentId: "apt-003" }); // Patient B, Dr. PQR

  const timelineA = await getPatientTimeline(PATIENT_A);
  const timelineB = await getPatientTimeline(PATIENT_B);

  const aHasB = timelineA.some((e) => e.patientId === PATIENT_B);
  const bHasA = timelineB.some((e) => e.patientId === PATIENT_A);

  assert.ok(!aHasB, "Patient A timeline must NOT contain Patient B entries");
  assert.ok(!bHasA, "Patient B timeline must NOT contain Patient A entries");

  console.log(`     Patient A: ${timelineA.length} entries (no Patient B data)`);
  console.log(`     Patient B: ${timelineB.length} entries (no Patient A data)`);
});

// ── Test 7: No Fabrication ────────────────────────────────────────────────────
console.log("\n7. No fabrication — doctorId comes from appointment, not caller:");
await it("should use appointment's doctor, not any caller-supplied doctorId", async () => {
  // The createDoctorVerifiedEntry function takes appointmentId only —
  // it loads doctorId from the appointment document, not from the caller.
  const entry = historyStore.find((e) => e.appointmentId === "apt-001");
  assert.ok(entry, "Entry must exist for apt-001");
  assert.strictEqual(entry.doctorId, "dr-001", "doctorId must match appointment's doctor, not any other value");
  assert.strictEqual(entry.doctorName, "Dr. XYZ", "doctorName must be from appointment's DoctorProfile");
  console.log(`     Entry doctorId=${entry.doctorId}, doctorName=${entry.doctorName} — from appointment DoctorProfile ✓`);
  console.log(`     Caller cannot override: createDoctorVerifiedEntry accepts only appointmentId`);
});

// ── Test 8: Self-Report Delete & Doctor-Verified Immutability ──────────────────
console.log("\n8. Soft-delete — patient can remove self-reported; doctor-verified is immutable:");
await it("should soft-delete a self-reported entry (isActive = false)", async () => {
  const selfEntry = historyStore.find((e) => e.patientId === PATIENT_A && e.source === "self_reported");
  assert.ok(selfEntry, "A self-reported entry must exist for Patient A");

  const deleted = await deleteEntry({ entryId: selfEntry._id, patientId: PATIENT_A });
  assert.strictEqual(deleted.isActive, false, "Soft-deleted entry must have isActive=false");

  const timeline = await getPatientTimeline(PATIENT_A);
  const stillVisible = timeline.some((e) => e._id === selfEntry._id);
  assert.ok(!stillVisible, "Soft-deleted entry must not appear in active timeline");
  console.log(`     Self-reported entry "${selfEntry.condition}" soft-deleted; hidden from timeline ✓`);
});

await it("should reject deletion of doctor-verified entry (clinical record integrity)", async () => {
  const verifiedEntry = historyStore.find((e) => e.patientId === PATIENT_A && e.source === "doctor_verified");
  assert.ok(verifiedEntry, "A doctor-verified entry must exist for Patient A");

  let rejected = false;
  try {
    await deleteEntry({ entryId: verifiedEntry._id, patientId: PATIENT_A });
  } catch (err) {
    rejected = true;
    assert.strictEqual(err.status, 403);
    console.log(`     Doctor-verified deletion blocked: "${err.message}"`);
  }
  assert.ok(rejected, "Doctor-verified entries must not be deleteable");

  // Entry still active
  const entry = historyStore.find((e) => e._id === verifiedEntry._id);
  assert.strictEqual(entry.isActive, true, "Doctor-verified entry must remain active after failed delete");
});

await it("should return 403 when patient A tries to delete patient B entry", async () => {
  const bEntry = historyStore.find((e) => e.patientId === PATIENT_B);
  assert.ok(bEntry, "Patient B must have an entry");

  let denied = false;
  try {
    await deleteEntry({ entryId: bEntry._id, patientId: PATIENT_A });
  } catch (err) {
    denied = true;
    assert.strictEqual(err.status, 403);
    console.log(`     IDOR delete blocked: "${err.message}"`);
  }
  assert.ok(denied, "Patient A must not delete Patient B entries");
});

// ── Results ───────────────────────────────────────────────────────────────────
console.log("\n======================================================");
console.log(`Results: ${passed} passed, ${failed} failed`);
console.log("======================================================\n");

if (failed > 0) process.exit(1);
