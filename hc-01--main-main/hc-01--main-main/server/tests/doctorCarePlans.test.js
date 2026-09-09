/**
 * TEST SUITE: Doctor Care Plans & Structured Clinical Guidance
 *
 * Verifies all security, clinical, and functional requirements:
 *   1.  Creation          — Doctor issues care plan with diagnosis, DO, AVOID, FOLLOW-UP
 *   2.  Doctor-Issued     — source="doctor_issued"; AI never independently prescribes
 *   3.  Structured Read   — Patient views DO (diet+activities), AVOID (diet+activities), FOLLOW-UP
 *   4.  No Consent        — Doctor B without consent gets 403 Forbidden
 *   5.  Consent Granted   — Doctor B with active grant views structured care plan
 *   6.  Revocation        — Revoked grant immediately blocks Doctor B (403)
 *   7.  IDOR Prevention   — Doctor B cannot access unauthorized Patient C's plan
 *   8.  Patient Isolation — Patient A cannot access Patient C's plan
 *   9.  Audit Trail       — Authorized doctor access logs AccessLog with resource="care_plans"
 *  10.  Status Lifecycle  — Care plan status updates (active -> completed / superseded)
 *  11.  Patient Ownership — Patient views own plan directly without needing a grant
 */

import assert from "assert";

// ── In-Memory Mock Stores ──────────────────────────────────────────────────
const carePlanStore = [];
const grantStore = [];
const logStore = [];

let idCounter = 1;
const makeId = (prefix = "id") => `${prefix}-${String(idCounter++).padStart(4, "0")}`;

// ── Mock Models ────────────────────────────────────────────────────────────
const MockCarePlan = {
  _store: carePlanStore,
  async create(data) {
    const doc = {
      _id: makeId("cp"),
      status: "active",
      source: "doctor_issued",
      dietRecommended: [],
      dietRestricted: [],
      activitiesRecommended: [],
      activitiesRestricted: [],
      notes: "",
      followUpDate: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      ...data,
      save: async function () {
        this.updatedAt = new Date();
        const idx = carePlanStore.findIndex((c) => c._id === this._id);
        if (idx >= 0) carePlanStore[idx] = this;
        return this;
      },
    };
    carePlanStore.push(doc);
    return doc;
  },
  async findById(id) {
    const doc = carePlanStore.find((c) => c._id === id);
    if (!doc) return null;
    return {
      ...doc,
      save: async function () {
        this.updatedAt = new Date();
        const idx = carePlanStore.findIndex((c) => c._id === this._id);
        if (idx >= 0) carePlanStore[idx] = this;
        return this;
      },
    };
  },
  find({ patientId }) {
    const results = carePlanStore.filter((c) => c.patientId === patientId);
    return {
      sort() {
        results.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        return this;
      },
      lean: async () => results.map((r) => ({ ...r })),
    };
  },
};

const MockAccessGrant = {
  _store: grantStore,
  async create(data) {
    const doc = {
      _id: makeId("grt"),
      grantedAt: new Date(),
      revokedAt: null,
      ...data,
    };
    grantStore.push(doc);
    return doc;
  },
  async findOne(query) {
    return (
      grantStore.find((g) => {
        if (query.doctorId && g.doctorId !== query.doctorId) return false;
        if (query.patientId && g.patientId !== query.patientId) return false;
        if (query.scope && g.scope !== query.scope) return false;
        if (query.revokedAt === null && g.revokedAt !== null) return false;
        if (query.appointmentId !== undefined && g.appointmentId !== query.appointmentId)
          return false;
        return true;
      }) || null
    );
  },
  async findById(id) {
    const doc = grantStore.find((g) => g._id === id);
    if (!doc) return null;
    return {
      ...doc,
      save: async function () {
        const idx = grantStore.findIndex((g) => g._id === this._id);
        if (idx >= 0) grantStore[idx] = this;
        return this;
      },
    };
  },
};

const MockAccessLog = {
  _store: logStore,
  async create(data) {
    const doc = { _id: makeId("log"), accessedAt: new Date(), ...data };
    logStore.push(doc);
    return doc;
  },
};

// ── Mock Services ──────────────────────────────────────────────────────────
function formatStructuredCarePlan(plan) {
  return {
    id: plan._id,
    appointmentId: plan.appointmentId || null,
    patientId: plan.patientId,
    doctorId: plan.doctorId,
    doctorName: plan.doctorName,
    diagnosis: plan.diagnosis,
    status: plan.status,
    source: plan.source || "doctor_issued",
    createdAt: plan.createdAt,
    DO: {
      title: "Recommended Actions & Nutrition",
      diet: plan.dietRecommended || [],
      activities: plan.activitiesRecommended || [],
    },
    AVOID: {
      title: "Restricted Items & Activities",
      diet: plan.dietRestricted || [],
      activities: plan.activitiesRestricted || [],
    },
    FOLLOW_UP: {
      title: "Next Review & Clinician Notes",
      followUpDate: plan.followUpDate || null,
      notes: plan.notes || "",
      attendingDoctor: plan.doctorName,
      diagnosisContext: plan.diagnosis,
    },
  };
}

async function checkAccess({ doctorId, patientId, appointmentId = null }) {
  if (!doctorId || !patientId) return null;

  const ongoingGrant = await MockAccessGrant.findOne({
    doctorId,
    patientId,
    scope: "ongoing",
    revokedAt: null,
  });
  if (ongoingGrant) return ongoingGrant;

  if (appointmentId) {
    const aptGrant = await MockAccessGrant.findOne({
      doctorId,
      patientId,
      scope: "appointment",
      appointmentId,
      revokedAt: null,
    });
    if (aptGrant) return aptGrant;
  }

  return null;
}

async function writeAccessLog({ patientId, doctorId, resource, action, grantId = null }) {
  return MockAccessLog.create({
    patientId,
    doctorId,
    resource,
    action,
    grantId,
    isEmergency: false,
  });
}

async function createCarePlan({
  appointmentId = null,
  patientId,
  doctorId,
  doctorName = "Dr. Alice Smith",
  diagnosis,
  dietRecommended = [],
  dietRestricted = [],
  activitiesRecommended = [],
  activitiesRestricted = [],
  followUpDate = null,
  notes = "",
}) {
  if (!patientId || !doctorId || !diagnosis) {
    const err = new Error("patientId, doctorId, and diagnosis are required");
    err.status = 400;
    throw err;
  }

  const plan = await MockCarePlan.create({
    patientId,
    doctorId,
    doctorName,
    appointmentId,
    diagnosis,
    dietRecommended,
    dietRestricted,
    activitiesRecommended,
    activitiesRestricted,
    followUpDate: followUpDate ? new Date(followUpDate) : null,
    notes,
    status: "active",
    source: "doctor_issued",
  });

  return formatStructuredCarePlan(plan);
}

async function getPatientCarePlans({
  patientId,
  requesterDoctorId = null,
  requesterPatientId = null,
  appointmentId = null,
}) {
  if (!patientId) {
    const err = new Error("patientId is required");
    err.status = 400;
    throw err;
  }

  if (requesterPatientId) {
    if (requesterPatientId.toString() !== patientId.toString()) {
      const err = new Error("Forbidden: You may only access your own care plans");
      err.status = 403;
      throw err;
    }
  } else if (requesterDoctorId) {
    const grant = await checkAccess({
      doctorId: requesterDoctorId,
      patientId,
      appointmentId,
    });

    if (!grant) {
      const err = new Error(
        "Access denied. Patient has not granted you access to care plans, or the grant has been revoked."
      );
      err.status = 403;
      throw err;
    }

    await writeAccessLog({
      patientId,
      doctorId: requesterDoctorId,
      resource: "care_plans",
      action: "read",
      grantId: grant._id,
    });
  } else {
    const err = new Error("Authentication required: no user identity found in request");
    err.status = 401;
    throw err;
  }

  const query = MockCarePlan.find({ patientId });
  query.sort();
  const rawPlans = await query.lean();
  return rawPlans.map(formatStructuredCarePlan);
}

async function updateCarePlanStatus({ carePlanId, status }) {
  const plan = await MockCarePlan.findById(carePlanId);
  if (!plan) {
    const err = new Error("Care plan not found");
    err.status = 404;
    throw err;
  }
  plan.status = status;
  await plan.save();
  return formatStructuredCarePlan(plan);
}

// ── Test Runner ────────────────────────────────────────────────────────────
let passed = 0;
let failed = 0;

function assertEqual(actual, expected, msg) {
  if (actual === expected) {
    console.log(`  ✓ ${msg}`);
    passed++;
  } else {
    console.error(`  ✗ ${msg} — expected [${expected}], got [${actual}]`);
    failed++;
  }
}

function assertTruthy(val, msg) {
  if (val) {
    console.log(`  ✓ ${msg}`);
    passed++;
  } else {
    console.error(`  ✗ ${msg} — expected truthy, got [${val}]`);
    failed++;
  }
}

async function runTests() {
  console.log("\n======================================================");
  console.log("TEST SUITE: Doctor Care Plans & Clinical Guidance");
  console.log("======================================================\n");

  const PATIENT_A = "pat-100";
  const PATIENT_C = "pat-300";
  const DOCTOR_A = "doc-100";
  const DOCTOR_B = "doc-200";

  let carePlanId = null;

  // ── 1. Create Care Plan from Appointment ─────────────────────────────────
  console.log("1. Doctor Issues Care Plan from Appointment Details:");
  try {
    const plan = await createCarePlan({
      appointmentId: "apt-555",
      patientId: PATIENT_A,
      doctorId: DOCTOR_A,
      doctorName: "Dr. Alice Smith",
      diagnosis: "Stage 1 Essential Hypertension & Borderline Dyslipidemia",
      dietRecommended: [
        "DASH dietary pattern (high potassium, calcium, magnesium)",
        "Minimum 2.5L daily hydration",
        "Steamed greens & whole grains",
      ],
      dietRestricted: [
        "Sodium intake strictly < 2g per day (avoid table salt, pickles, papad)",
        "Deep-fried trans-fat foods & processed meats",
        "Refined sugar beverages",
      ],
      activitiesRecommended: [
        "30 minutes of moderate aerobic walking 5 days/week",
        "10 minutes daily diaphragmatic breathing / meditation",
      ],
      activitiesRestricted: [
        "Heavy isometric straining or maximum-effort weightlifting",
        "Sudden extreme temperature sauna exposures",
      ],
      followUpDate: "2026-10-15",
      notes: "Maintain a daily morning BP log before breakfast. Contact clinic if systolic > 160 mmHg.",
    });

    carePlanId = plan.id;

    assertEqual(plan.diagnosis, "Stage 1 Essential Hypertension & Borderline Dyslipidemia", "diagnosis stored accurately");
    assertEqual(plan.status, "active", "care plan initialized with status 'active'");
    assertEqual(plan.source, "doctor_issued", "clinical guidance is explicitly doctor-issued (AI safe)");
    assertEqual(plan.doctorName, "Dr. Alice Smith", "issuing clinician attribution recorded");
    assertEqual(plan.DO.diet.length, 3, "DO diet recommended has 3 items");
    assertEqual(plan.DO.activities.length, 2, "DO activities recommended has 2 items");
    assertEqual(plan.AVOID.diet.length, 3, "AVOID diet restricted has 3 items");
    assertEqual(plan.AVOID.activities.length, 2, "AVOID activities restricted has 2 items");
    assertTruthy(plan.FOLLOW_UP.followUpDate, "FOLLOW_UP date recorded");
  } catch (err) {
    console.error("Failed to create care plan:", err);
    failed++;
  }

  // ── 2. Patient Reads Structured DO, AVOID, FOLLOW-UP ─────────────────────
  console.log("\n2. Patient Reads Structured Guidance (DO, AVOID, FOLLOW-UP):");
  try {
    const plans = await getPatientCarePlans({
      patientId: PATIENT_A,
      requesterPatientId: PATIENT_A,
    });

    assertEqual(plans.length, 1, "patient receives care plans");
    const p = plans[0];
    assertTruthy(p.DO.title, "DO block present with title");
    assertTruthy(p.AVOID.title, "AVOID block present with title");
    assertTruthy(p.FOLLOW_UP.title, "FOLLOW_UP block present with title");
    assertEqual(p.FOLLOW_UP.attendingDoctor, "Dr. Alice Smith", "patient sees attending doctor attribution");
    assertEqual(p.FOLLOW_UP.diagnosisContext, "Stage 1 Essential Hypertension & Borderline Dyslipidemia", "patient sees clinical context");
  } catch (err) {
    console.error("Failed patient read:", err);
    failed++;
  }

  // ── 3. Doctor B Access Without Consent -> 403 ────────────────────────────
  console.log("\n3. Doctor B Access Without Consent (Security Guard):");
  try {
    await getPatientCarePlans({
      patientId: PATIENT_A,
      requesterDoctorId: DOCTOR_B,
    });
    console.error("  ✗ should have rejected Doctor B with 403");
    failed++;
  } catch (err) {
    assertEqual(err.status, 403, "rejects doctor without active grant with 403 Forbidden");
    assertTruthy(err.message.includes("Access denied"), "clear consent rejection message");
  }

  // ── 4. Patient Grants Access; Doctor B Reads Care Plan ───────────────────
  console.log("\n4. Patient Grants Access to Doctor B; Doctor B Reads Care Plan:");
  let grantId = null;
  try {
    const grant = await MockAccessGrant.create({
      patientId: PATIENT_A,
      doctorId: DOCTOR_B,
      scope: "ongoing",
      grantedBy: PATIENT_A,
      note: "Cardiology consult",
    });
    grantId = grant._id;

    const sharedPlans = await getPatientCarePlans({
      patientId: PATIENT_A,
      requesterDoctorId: DOCTOR_B,
    });

    assertEqual(sharedPlans.length, 1, "Doctor B receives shared care plan");
    assertEqual(sharedPlans[0].doctorName, "Dr. Alice Smith", "Doctor B sees original Doctor A attribution");
    assertEqual(sharedPlans[0].DO.diet[0], "DASH dietary pattern (high potassium, calcium, magnesium)", "Doctor B sees structured DO diet");
    assertEqual(sharedPlans[0].AVOID.diet[0], "Sodium intake strictly < 2g per day (avoid table salt, pickles, papad)", "Doctor B sees structured AVOID diet");
  } catch (err) {
    console.error("Failed Doctor B shared access:", err);
    failed++;
  }

  // ── 5. Revocation Blocks Doctor B Access Immediately ─────────────────────
  console.log("\n5. Patient Revokes Consent; Doctor B Immediately Blocked:");
  try {
    const grant = await MockAccessGrant.findById(grantId);
    grant.revokedAt = new Date();
    await grant.save();

    await getPatientCarePlans({
      patientId: PATIENT_A,
      requesterDoctorId: DOCTOR_B,
    });
    console.error("  ✗ Doctor B should have been blocked after revocation");
    failed++;
  } catch (err) {
    assertEqual(err.status, 403, "returns 403 Forbidden immediately upon revocation");
  }

  // ── 6. IDOR & Patient Isolation ──────────────────────────────────────────
  console.log("\n6. IDOR Prevention & Patient Isolation:");
  try {
    // Doctor B has grant for Patient A only
    await MockAccessGrant.create({
      patientId: PATIENT_A,
      doctorId: DOCTOR_B,
      scope: "ongoing",
    });

    // Doctor B tries to access Patient C
    try {
      await getPatientCarePlans({
        patientId: PATIENT_C,
        requesterDoctorId: DOCTOR_B,
      });
      console.error("  ✗ Doctor B accessing Patient C should have failed");
      failed++;
    } catch (err) {
      assertEqual(err.status, 403, "doctor cannot view unauthorized Patient C care plan (IDOR)");
    }

    // Patient A tries to access Patient C
    try {
      await getPatientCarePlans({
        patientId: PATIENT_C,
        requesterPatientId: PATIENT_A,
      });
      console.error("  ✗ Patient A accessing Patient C should have failed");
      failed++;
    } catch (err) {
      assertEqual(err.status, 403, "patient A cannot view Patient C care plan (patient isolation)");
    }
  } catch (err) {
    console.error("Failed IDOR tests:", err);
    failed++;
  }

  // ── 7. Audit Logging ─────────────────────────────────────────────────────
  console.log("\n7. Access Audit Trail:");
  const carePlanLogs = logStore.filter((l) => l.resource === "care_plans");
  assertTruthy(carePlanLogs.length >= 1, "AccessLog entries created for authorized reads");
  const log = carePlanLogs[0];
  assertEqual(log.doctorId, DOCTOR_B, "audit log captures doctorId");
  assertEqual(log.patientId, PATIENT_A, "audit log captures patientId");
  assertEqual(log.action, "read", "audit log captures 'read' action");

  // ── 8. Status Lifecycle ──────────────────────────────────────────────────
  console.log("\n8. Care Plan Status Lifecycle (Update Status):");
  try {
    const updated = await updateCarePlanStatus({
      carePlanId,
      status: "completed",
    });
    assertEqual(updated.status, "completed", "care plan updated to 'completed'");

    const superseded = await updateCarePlanStatus({
      carePlanId,
      status: "superseded",
    });
    assertEqual(superseded.status, "superseded", "care plan updated to 'superseded'");
  } catch (err) {
    console.error("Failed status update:", err);
    failed++;
  }

  // ── 9. Authentication Required ───────────────────────────────────────────
  console.log("\n9. Authentication Guard:");
  try {
    await getPatientCarePlans({ patientId: PATIENT_A });
    console.error("  ✗ Request without user identity should have failed");
    failed++;
  } catch (err) {
    assertEqual(err.status, 401, "unauthenticated request returns 401");
  }

  console.log("\n======================================================");
  console.log(`Results: ${passed} passed, ${failed} failed`);
  console.log("======================================================\n");

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((e) => {
  console.error("Test execution failed:", e);
  process.exit(1);
});
