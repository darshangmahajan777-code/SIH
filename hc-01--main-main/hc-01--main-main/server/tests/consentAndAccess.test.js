/**
 * TEST SUITE: Patient Consent & Medical Record Access Control
 *
 * Tests every security scenario:
 *   1.  grant — patient grants appointment-scoped access
 *   2.  revoke — revoked grant blocks doctor access
 *   3.  appointment scope — grant only covers specified appointment
 *   4.  ongoing scope — standing access across multiple appointments
 *   5.  unauthorized doctor — no grant => 403
 *   6.  IDOR — doctor swaps patientId in URL => 403
 *   7.  patient isolation — patient A logs only show patient A events
 *   8.  audit logs — every access creates an AccessLog entry
 *   9.  emergency access — logged, limited, no persistent grant
 *  10.  ownership — patient A cannot revoke patient B grant
 */

import assert from "assert";
import mongoose from "mongoose";

// ── Inline Mocks (no DB required) ─────────────────────────────────────────────
// We mock AccessGrant and AccessLog as in-memory stores so tests are self-contained.

const grantStore = [];
const logStore = [];

let grantIdCounter = 1;
let logIdCounter = 1;

function makeId(n) {
  return "000000000000000000000" + String(n).padStart(3, "0");
}

const MockAccessGrant = {
  _store: grantStore,
  async create(data) {
    const doc = { _id: makeId(grantIdCounter++), ...data, revokedAt: data.revokedAt ?? null };
    grantStore.push(doc);
    return doc;
  },
  async findOne(query) {
    return grantStore.find((g) => {
      if (query.doctorId && g.doctorId !== query.doctorId) return false;
      if (query.patientId && g.patientId !== query.patientId) return false;
      if (query.scope && g.scope !== query.scope) return false;
      if (query.revokedAt === null && g.revokedAt !== null) return false;
      if (query.appointmentId !== undefined && g.appointmentId !== query.appointmentId) return false;
      return true;
    }) || null;
  },
  async findById(id) {
    return grantStore.find((g) => g._id === id) || null;
  },
};

const MockAccessLog = {
  _store: logStore,
  async create(data) {
    const doc = { _id: makeId(logIdCounter++), ...data };
    logStore.push(doc);
    return doc;
  },
  find(query) {
    let results = logStore.filter((l) => {
      if (query.patientId && l.patientId !== query.patientId) return false;
      if (query.isEmergency !== undefined && l.isEmergency !== query.isEmergency) return false;
      return true;
    });
    return {
      populate: () => ({ sort: () => ({ limit: () => ({ lean: async () => results }) }) }),
      lean: async () => results,
    };
  },
};

const MockEmergencyCase = {
  async findById(id) {
    // Return a fake EmergencyCase for any ID starting with "EC-"
    if (id && id.startsWith("EC-")) return { _id: id, condition: "Anaphylaxis" };
    return null;
  },
};

// ── Inline implementations using mocks ────────────────────────────────────────

async function _writeLog(data) {
  return MockAccessLog.create({ ...data, accessedAt: new Date(), isEmergency: false });
}

async function grantAccess({ patientId, doctorId, scope, appointmentId = null, grantedBy = null, note = "" }) {
  if (!patientId || !doctorId || !scope) throw { status: 400, message: "patientId, doctorId and scope are required" };
  if (scope === "appointment" && !appointmentId) throw { status: 400, message: "appointmentId is required for appointment-scoped grants" };

  const existing = await MockAccessGrant.findOne({
    patientId, doctorId, scope, appointmentId: scope === "appointment" ? appointmentId : null, revokedAt: null,
  });
  if (existing) return existing;

  const grant = await MockAccessGrant.create({
    patientId, doctorId, scope,
    appointmentId: scope === "appointment" ? appointmentId : null,
    grantedBy: grantedBy || patientId,
    note: note.trim(),
    grantedAt: new Date(),
    revokedAt: null,
  });

  await _writeLog({ patientId, doctorId, resource: "grant", action: "grant", grantId: grant._id });
  return grant;
}

async function revokeAccess({ grantId, patientId }) {
  const grant = await MockAccessGrant.findById(grantId);
  if (!grant) throw { status: 404, message: "Access grant not found" };
  if (grant.patientId !== patientId) throw { status: 403, message: "Forbidden: You may only revoke your own access grants" };
  if (grant.revokedAt !== null) throw { status: 409, message: "This grant has already been revoked" };
  grant.revokedAt = new Date();
  await _writeLog({ patientId, doctorId: grant.doctorId, resource: "revoke", action: "revoke", grantId: grant._id });
  return grant;
}

async function checkAccess({ doctorId, patientId, appointmentId = null }) {
  const ongoing = await MockAccessGrant.findOne({ doctorId, patientId, scope: "ongoing", revokedAt: null });
  if (ongoing) return ongoing;
  if (appointmentId) {
    const appt = await MockAccessGrant.findOne({ doctorId, patientId, scope: "appointment", appointmentId, revokedAt: null });
    if (appt) return appt;
  }
  return null;
}

async function requireConsent({ doctorId, patientId, resource, appointmentId = null }) {
  const grant = await checkAccess({ doctorId, patientId, appointmentId });
  if (!grant) throw { status: 403, message: "Access denied. Patient has not granted you access to this medical record, or the grant has been revoked." };
  await _writeLog({ patientId, doctorId, resource, action: "read", grantId: grant._id });
  return grant;
}

async function getAccessLog(patientId) {
  return logStore.filter((l) => l.patientId === patientId);
}

async function recordEmergencyAccess({ doctorId, patientId, resource, emergencyReason, authorizedBy, emergencyCaseId }) {
  const eCase = await MockEmergencyCase.findById(emergencyCaseId);
  if (!eCase) throw { status: 403, message: "Invalid emergencyCaseId. Emergency access requires a verified EmergencyCase reference." };
  const log = await MockAccessLog.create({
    patientId, doctorId, accessedAt: new Date(), resource,
    action: "emergency_access", grantId: null,
    isEmergency: true, emergencyReason, authorizedBy, emergencyCaseId,
  });
  return {
    allowed: true, accessLog: log,
    disclaimer: "EMERGENCY ACCESS: This access is limited, authenticated, and fully audited. No standing access grant has been created.",
  };
}

// ── Test Harness ──────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

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

// Reset stores before each logical section
function resetStores() {
  grantStore.length = 0;
  logStore.length = 0;
}

// ── Patients & Doctors ────────────────────────────────────────────────────────
const PATIENT_A = "patient-aaa";
const PATIENT_B = "patient-bbb";
const DOCTOR_1  = "doctor-111";
const DOCTOR_2  = "doctor-222";
const APT_1     = "appointment-001";
const APT_2     = "appointment-002";

console.log("\n======================================================");
console.log("TEST SUITE: Patient Consent & Medical Record Access Control");
console.log("======================================================\n");

// ── Test 1: Grant ─────────────────────────────────────────────────────────────
console.log("1. Patient grants appointment-scoped access:");
await it("should create a grant with correct fields", async () => {
  resetStores();
  const grant = await grantAccess({ patientId: PATIENT_A, doctorId: DOCTOR_1, scope: "appointment", appointmentId: APT_1 });
  assert.strictEqual(grant.patientId, PATIENT_A);
  assert.strictEqual(grant.doctorId, DOCTOR_1);
  assert.strictEqual(grant.scope, "appointment");
  assert.strictEqual(grant.appointmentId, APT_1);
  assert.strictEqual(grant.revokedAt, null, "Active grant must have revokedAt=null");
  console.log(`     Grant ${grant._id}: scope=${grant.scope}, patient=${PATIENT_A}, doctor=${DOCTOR_1}`);
});

await it("should be idempotent — duplicate grant returns existing grant", async () => {
  const grant1 = await grantAccess({ patientId: PATIENT_A, doctorId: DOCTOR_1, scope: "appointment", appointmentId: APT_1 });
  const grant2 = await grantAccess({ patientId: PATIENT_A, doctorId: DOCTOR_1, scope: "appointment", appointmentId: APT_1 });
  assert.strictEqual(grant1._id, grant2._id, "Duplicate grant call must return same grant");
});

// ── Test 2: Revoke ────────────────────────────────────────────────────────────
console.log("\n2. Patient revokes grant — subsequent access blocked:");
await it("should revoke grant and set revokedAt timestamp", async () => {
  resetStores();
  const grant = await grantAccess({ patientId: PATIENT_A, doctorId: DOCTOR_1, scope: "ongoing" });
  const revoked = await revokeAccess({ grantId: grant._id, patientId: PATIENT_A });
  assert.ok(revoked.revokedAt instanceof Date, "revokedAt must be a Date after revocation");
  console.log(`     Grant ${grant._id} revoked at ${revoked.revokedAt.toISOString()}`);
});

await it("should return 403 when doctor tries to access after revocation", async () => {
  const initialGrant = grantStore[0];
  assert.ok(initialGrant.revokedAt !== null, "Grant must be revoked");
  const access = await checkAccess({ doctorId: DOCTOR_1, patientId: PATIENT_A });
  assert.strictEqual(access, null, "No active grant should be found after revocation");
  let denied = false;
  try {
    await requireConsent({ doctorId: DOCTOR_1, patientId: PATIENT_A, resource: "medical_history" });
  } catch (err) {
    denied = true;
    assert.strictEqual(err.status, 403);
    console.log(`     403 returned: "${err.message}"`);
  }
  assert.ok(denied, "Access must be denied after revocation");
});

// ── Test 3: Appointment Scope ─────────────────────────────────────────────────
console.log("\n3. Appointment-scoped grant — only covers specified appointment:");
await it("should allow access to the correct appointment", async () => {
  resetStores();
  await grantAccess({ patientId: PATIENT_A, doctorId: DOCTOR_1, scope: "appointment", appointmentId: APT_1 });
  const grant = await requireConsent({ doctorId: DOCTOR_1, patientId: PATIENT_A, resource: "prescriptions", appointmentId: APT_1 });
  assert.ok(grant, "Access to correct appointment must be allowed");
  console.log(`     APT_1 access: ALLOWED (grantId=${grant._id})`);
});

await it("should block access to a different appointment under same doctor", async () => {
  let denied = false;
  try {
    await requireConsent({ doctorId: DOCTOR_1, patientId: PATIENT_A, resource: "prescriptions", appointmentId: APT_2 });
  } catch (err) {
    denied = true;
    assert.strictEqual(err.status, 403);
    console.log(`     APT_2 access: DENIED (403) — correct scope enforcement`);
  }
  assert.ok(denied, "Access to APT_2 must be denied when grant is only for APT_1");
});

// ── Test 4: Ongoing Scope ─────────────────────────────────────────────────────
console.log("\n4. Ongoing scope — standing access across multiple appointments:");
await it("should allow access across multiple appointments without appointmentId", async () => {
  resetStores();
  await grantAccess({ patientId: PATIENT_A, doctorId: DOCTOR_1, scope: "ongoing" });
  const g1 = await requireConsent({ doctorId: DOCTOR_1, patientId: PATIENT_A, resource: "medical_history" });
  const g2 = await requireConsent({ doctorId: DOCTOR_1, patientId: PATIENT_A, resource: "test_results", appointmentId: APT_2 });
  assert.ok(g1, "Ongoing grant allows medical_history access");
  assert.ok(g2, "Ongoing grant allows test_results access for any appointment");
  console.log(`     Ongoing grant: medical_history=OK, test_results=OK`);
});

// ── Test 5: Unauthorized Doctor ───────────────────────────────────────────────
console.log("\n5. Unauthorized doctor — no grant exists:");
await it("should return 403 for a doctor with no grant", async () => {
  // DOCTOR_2 has no grant; only DOCTOR_1 has ongoing
  let denied = false;
  try {
    await requireConsent({ doctorId: DOCTOR_2, patientId: PATIENT_A, resource: "care_plans" });
  } catch (err) {
    denied = true;
    assert.strictEqual(err.status, 403);
    console.log(`     Doctor 2 (no grant): 403 — "${err.message.slice(0, 60)}..."`);
  }
  assert.ok(denied, "Unauthorized doctor must receive 403");
});

// ── Test 6: IDOR Prevention ────────────────────────────────────────────────────
console.log("\n6. IDOR — doctor swaps patientId in URL to another patient:");
await it("should return 403 when doctor changes patientId to patient B", async () => {
  // DOCTOR_1 has ongoing grant for PATIENT_A but NOT for PATIENT_B
  let denied = false;
  try {
    await requireConsent({ doctorId: DOCTOR_1, patientId: PATIENT_B, resource: "medical_reports" });
  } catch (err) {
    denied = true;
    assert.strictEqual(err.status, 403);
    console.log(`     IDOR attempt (Doctor 1 → Patient B): 403 — access denied`);
  }
  assert.ok(denied, "IDOR: Doctor 1 must NOT access Patient B records via URL change");
});

// ── Test 7: Patient Isolation ─────────────────────────────────────────────────
console.log("\n7. Patient data isolation — each patient only sees their own logs:");
await it("should ensure patient A audit log contains only patient A events", async () => {
  // Generate some Patient B access events
  await grantAccess({ patientId: PATIENT_B, doctorId: DOCTOR_2, scope: "ongoing" });
  await requireConsent({ doctorId: DOCTOR_2, patientId: PATIENT_B, resource: "prescriptions" });

  const logsA = await getAccessLog(PATIENT_A);
  const logsB = await getAccessLog(PATIENT_B);

  const aHasB = logsA.some((l) => l.patientId === PATIENT_B);
  const bHasA = logsB.some((l) => l.patientId === PATIENT_A);

  assert.ok(!aHasB, "Patient A log must NOT contain Patient B entries");
  assert.ok(!bHasA, "Patient B log must NOT contain Patient A entries");
  console.log(`     Patient A logs: ${logsA.length} entries (no Patient B data)`);
  console.log(`     Patient B logs: ${logsB.length} entries (no Patient A data)`);
});

// ── Test 8: Audit Logs ────────────────────────────────────────────────────────
console.log("\n8. Audit trail — every authorized access creates an AccessLog entry:");
await it("should create AccessLog entries for grant, read, and revoke actions", async () => {
  resetStores();
  const g = await grantAccess({ patientId: PATIENT_A, doctorId: DOCTOR_1, scope: "ongoing" });
  await requireConsent({ doctorId: DOCTOR_1, patientId: PATIENT_A, resource: "medical_history" });
  await requireConsent({ doctorId: DOCTOR_1, patientId: PATIENT_A, resource: "prescriptions" });
  await revokeAccess({ grantId: g._id, patientId: PATIENT_A });

  const logs = await getAccessLog(PATIENT_A);
  const grantLog  = logs.find((l) => l.action === "grant");
  const readLogs  = logs.filter((l) => l.action === "read");
  const revokeLog = logs.find((l) => l.action === "revoke");

  assert.ok(grantLog,  "Must have a grant audit log entry");
  assert.strictEqual(readLogs.length, 2, "Must have 2 read audit log entries");
  assert.ok(revokeLog, "Must have a revoke audit log entry");
  console.log(`     Audit trail: grant=1, reads=${readLogs.length}, revoke=1 ✓`);
  console.log(`     Read resources: [${readLogs.map((l) => l.resource).join(", ")}]`);
});

// ── Test 9: Emergency Access ──────────────────────────────────────────────────
console.log("\n9. Emergency access — logged, limited, no persistent grant created:");
await it("should log emergency access with isEmergency=true and no AccessGrant", async () => {
  resetStores();
  const result = await recordEmergencyAccess({
    doctorId: DOCTOR_2,
    patientId: PATIENT_A,
    resource: "medical_history",
    emergencyReason: "Patient unresponsive, anaphylaxis suspected",
    authorizedBy: "Dr. Kapoor (ER Attending)",
    emergencyCaseId: "EC-9001",
  });

  assert.ok(result.allowed, "Emergency access must be allowed");
  assert.ok(result.disclaimer.includes("EMERGENCY ACCESS"), "Must include emergency disclaimer");
  assert.ok(result.accessLog.isEmergency === true, "AccessLog must have isEmergency=true");
  assert.strictEqual(result.accessLog.grantId, null, "Emergency access must NOT create a grant reference");

  // Verify no AccessGrant was created
  const grants = grantStore.filter((g) => g.doctorId === DOCTOR_2 && g.patientId === PATIENT_A);
  assert.strictEqual(grants.length, 0, "Emergency access must NOT create a persistent AccessGrant");

  console.log(`     Emergency access logged: isEmergency=true, grantId=null ✓`);
  console.log(`     Disclaimer: "${result.disclaimer.slice(0, 70)}..."`);
});

await it("should reject emergency access with invalid emergencyCaseId", async () => {
  let rejected = false;
  try {
    await recordEmergencyAccess({
      doctorId: DOCTOR_2, patientId: PATIENT_A, resource: "prescriptions",
      emergencyReason: "Fabricated emergency", authorizedBy: "Dr. Fake",
      emergencyCaseId: "FAKE-0000", // Does not start with "EC-" so MockEmergencyCase returns null
    });
  } catch (err) {
    rejected = true;
    assert.strictEqual(err.status, 403);
    console.log(`     Fabricated emergencyCaseId: 403 — "${err.message.slice(0, 60)}..."`);
  }
  assert.ok(rejected, "Invalid emergencyCaseId must be rejected");
});

// ── Test 10: Ownership ────────────────────────────────────────────────────────
console.log("\n10. Ownership — patient A cannot revoke patient B grant:");
await it("should return 403 when patient A tries to revoke patient B grant", async () => {
  resetStores();
  const grantB = await grantAccess({ patientId: PATIENT_B, doctorId: DOCTOR_1, scope: "ongoing" });

  let denied = false;
  try {
    await revokeAccess({ grantId: grantB._id, patientId: PATIENT_A }); // Patient A attempts to revoke B grant
  } catch (err) {
    denied = true;
    assert.strictEqual(err.status, 403);
    console.log(`     Patient A revoking Patient B grant: 403 — "${err.message}"`);
  }
  assert.ok(denied, "Patient A must not be able to revoke Patient B grant");

  // Verify the grant is still active
  const stillActive = await checkAccess({ doctorId: DOCTOR_1, patientId: PATIENT_B });
  assert.ok(stillActive, "Patient B grant must still be active after failed revoke attempt");
});

// ── Results ───────────────────────────────────────────────────────────────────
console.log("\n======================================================");
console.log(`Results: ${passed} passed, ${failed} failed`);
console.log("======================================================\n");

if (failed > 0) process.exit(1);
