/**
 * TEST SUITE: Shared Lab/Test Records & Consent Access Control
 *
 * Tests the complete flow and all security requirements:
 *   1. Ordering        — Doctor A orders blood test; status="ordered", doctor attribution recorded
 *   2. Result          — Patient/Lab stores structured result; status="completed", completedAt set
 *   3. No Consent      — Doctor B attempts access without consent -> 403 Forbidden
 *   4. Consent Granted — Doctor B with valid grant sees test, reason, Doctor A attribution, result, lab, report
 *   5. Revocation      — Patient revokes grant; Doctor B immediately blocked (403)
 *   6. IDOR Prevention — Doctor B cannot access Patient C's records by swapping patientId
 *   7. Secure Files    — Medical report access requires authorization (no public URLs, 403 if unauthorized)
 *   8. Audit Trail     — All doctor reads log an AccessLog entry with resource="test_results"
 *   9. Patient Ownership — Patient accesses own records directly without needing a consent grant
 */

import assert from "assert";

// ── In-Memory Mock Stores ──────────────────────────────────────────────────
const testOrderStore = [];
const grantStore = [];
const logStore = [];

let idCounter = 1;
const makeId = (prefix = "id") => `${prefix}-${String(idCounter++).padStart(4, "0")}`;

// ── Mock Models ────────────────────────────────────────────────────────────
const MockTestOrder = {
  _store: testOrderStore,
  async create(data) {
    const doc = {
      _id: makeId("tst"),
      createdAt: new Date(),
      updatedAt: new Date(),
      result: null,
      status: "ordered",
      completedAt: null,
      ...data,
      save: async function () {
        this.updatedAt = new Date();
        const idx = testOrderStore.findIndex((t) => t._id === this._id);
        if (idx >= 0) testOrderStore[idx] = this;
        return this;
      },
    };
    testOrderStore.push(doc);
    return doc;
  },
  async findById(id) {
    const found = testOrderStore.find((t) => t._id === id);
    if (!found) return null;
    return {
      ...found,
      save: async function () {
        this.updatedAt = new Date();
        const idx = testOrderStore.findIndex((t) => t._id === this._id);
        if (idx >= 0) testOrderStore[idx] = this;
        return this;
      },
      lean: async () => ({ ...found }),
    };
  },
  find({ patientId }) {
    const results = testOrderStore.filter((t) => t.patientId === patientId);
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

// ── Mocked Service Logic ───────────────────────────────────────────────────
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

async function writeAccessLog({ patientId, doctorId, resource, action, grantId = null, resourceId = null }) {
  return MockAccessLog.create({
    patientId,
    doctorId,
    resource,
    action,
    grantId,
    resourceId,
    isEmergency: false,
  });
}

async function createTestOrder({ patientId, doctorId, doctorName, appointmentId = null, testName, reason }) {
  if (!patientId || !doctorId || !testName || !reason) {
    const err = new Error("patientId, doctorId, testName, and reason are required");
    err.status = 400;
    throw err;
  }
  return MockTestOrder.create({
    patientId,
    doctorId,
    doctorName: doctorName || "Dr. Alice Smith",
    appointmentId,
    testName,
    reason,
  });
}

async function recordTestResult({ testOrderId, result, status = "completed" }) {
  if (!testOrderId) {
    const err = new Error("testOrderId is required");
    err.status = 400;
    throw err;
  }
  if (!result || typeof result !== "object") {
    const err = new Error("result object is required");
    err.status = 400;
    throw err;
  }

  const order = await MockTestOrder.findById(testOrderId);
  if (!order) {
    const err = new Error("Test order not found");
    err.status = 404;
    throw err;
  }

  order.result = {
    value: result.value !== undefined ? String(result.value).trim() : null,
    unit: result.unit !== undefined ? String(result.unit).trim() : null,
    resultDate: result.resultDate ? new Date(result.resultDate) : new Date(),
    labName: result.labName ? String(result.labName).trim() : "Central Diagnostic Laboratory",
    notes: result.notes ? String(result.notes).trim() : "",
    reportFile: result.reportFile || {
      fileId: "rep-001",
      fileName: `${order.testName.toLowerCase().replace(/[^a-z0-9]/g, "_")}_report.pdf`,
      mimeType: "application/pdf",
      fileSize: 1024,
      content: "JVBERi0xLjQKJcTl8uXr...[SECURE_PDF_DATA]",
    },
  };

  order.status = status;
  order.completedAt = new Date();
  await order.save();
  return order;
}

async function getPatientTestOrders({ patientId, requesterDoctorId = null, requesterPatientId = null, appointmentId = null }) {
  if (!patientId) {
    const err = new Error("patientId is required");
    err.status = 400;
    throw err;
  }

  if (requesterPatientId) {
    if (requesterPatientId.toString() !== patientId.toString()) {
      const err = new Error("Forbidden: You may only access your own lab/test records");
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
      const err = new Error("Access denied. Patient has not granted you access to lab/test records, or the grant has been revoked.");
      err.status = 403;
      throw err;
    }

    await writeAccessLog({
      patientId,
      doctorId: requesterDoctorId,
      resource: "test_results",
      action: "read",
      grantId: grant._id,
    });
  } else {
    const err = new Error("Authentication required: no identity found");
    err.status = 401;
    throw err;
  }

  const query = MockTestOrder.find({ patientId });
  query.sort();
  return query.lean();
}

async function getTestOrderReport({ testOrderId, requesterDoctorId = null, requesterPatientId = null }) {
  if (!testOrderId) {
    const err = new Error("testOrderId is required");
    err.status = 400;
    throw err;
  }

  const order = await MockTestOrder.findById(testOrderId);
  if (!order) {
    const err = new Error("Test order not found");
    err.status = 404;
    throw err;
  }

  const patientId = order.patientId;

  if (requesterPatientId) {
    if (requesterPatientId.toString() !== patientId.toString()) {
      const err = new Error("Forbidden: You may only access your own medical reports");
      err.status = 403;
      throw err;
    }
  } else if (requesterDoctorId) {
    const grant = await checkAccess({ doctorId: requesterDoctorId, patientId });
    if (!grant) {
      const err = new Error("Access denied. Patient has not granted you access to view this medical report.");
      err.status = 403;
      throw err;
    }
    await writeAccessLog({
      patientId,
      doctorId: requesterDoctorId,
      resource: "test_results",
      resourceId: testOrderId,
      action: "read_report",
      grantId: grant._id,
    });
  } else {
    const err = new Error("Authentication required: no identity found");
    err.status = 401;
    throw err;
  }

  if (!order.result?.reportFile?.fileName) {
    const err = new Error("No medical report file is attached to this test order");
    err.status = 404;
    throw err;
  }

  return {
    testOrderId: order._id,
    testName: order.testName,
    orderedBy: order.doctorName,
    patientId: order.patientId,
    reportFile: order.result.reportFile,
  };
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
  console.log("TEST SUITE: Shared Lab/Test Records & Consent Access");
  console.log("======================================================\n");

  const PATIENT_A = "pat-001";
  const PATIENT_C = "pat-003";
  const DOCTOR_A = "doc-001"; // Ordering doctor
  const DOCTOR_B = "doc-002"; // Subsequent doctor

  let createdOrderId = null;

  // ── 1. Doctor A Orders Blood Test ──────────────────────────────────────────
  console.log("1. Doctor A Orders Test:");
  try {
    const order = await createTestOrder({
      patientId: PATIENT_A,
      doctorId: DOCTOR_A,
      doctorName: "Dr. Alice Smith",
      appointmentId: "apt-101",
      testName: "Complete Blood Count (CBC)",
      reason: "Evaluate persistent fatigue and mild anemia symptoms",
    });
    createdOrderId = order._id;

    assertEqual(order.status, "ordered", "should create test order with status 'ordered'");
    assertEqual(order.doctorName, "Dr. Alice Smith", "should capture Doctor A attribution");
    assertEqual(order.result, null, "result should initially be null");
    assertEqual(order.completedAt, null, "completedAt should initially be null");
  } catch (err) {
    console.error("Failed to create test order:", err);
    failed++;
  }

  // ── 2. Patient Completes Test with Structured Result ───────────────────────
  console.log("\n2. Patient / Lab Completes Test with Structured Result:");
  try {
    const completedOrder = await recordTestResult({
      testOrderId: createdOrderId,
      result: {
        value: "14.2",
        unit: "g/dL",
        resultDate: new Date("2026-09-09T10:00:00Z"),
        labName: "Apex Diagnostic Laboratories",
        notes: "Hemoglobin within normal healthy limits. No signs of microcytic anemia.",
        reportFile: {
          fileId: "rep-cbc-01",
          fileName: "cbc_analysis_report.pdf",
          mimeType: "application/pdf",
          fileSize: 4096,
          content: "SECURE_AUTHENTICATED_PDF_PAYLOAD",
        },
      },
      status: "completed",
    });

    assertEqual(completedOrder.status, "completed", "should mark status as 'completed'");
    assertTruthy(completedOrder.completedAt, "completedAt should be timestamped");
    assertEqual(completedOrder.result.value, "14.2", "should store structured value");
    assertEqual(completedOrder.result.unit, "g/dL", "should store structured unit");
    assertEqual(completedOrder.result.labName, "Apex Diagnostic Laboratories", "should store lab name");
    assertEqual(completedOrder.result.reportFile.fileName, "cbc_analysis_report.pdf", "should store report file metadata");
  } catch (err) {
    console.error("Failed to record test result:", err);
    failed++;
  }

  // ── 3. Doctor B Attempts Access Without Consent ────────────────────────────
  console.log("\n3. Doctor B Access Without Consent (Security Guard):");
  try {
    await getPatientTestOrders({
      patientId: PATIENT_A,
      requesterDoctorId: DOCTOR_B,
    });
    console.error("  ✗ should have thrown 403 for doctor without consent");
    failed++;
  } catch (err) {
    assertEqual(err.status, 403, "should reject Doctor B with 403 Forbidden");
    assertTruthy(err.message.includes("Access denied"), "should provide clear consent rejection message");
  }

  // ── 4. Patient Grants Access; Doctor B Views Shared Tests ──────────────────
  console.log("\n4. Patient Grants Consent to Doctor B; Doctor B Views Shared Records:");
  let grantId = null;
  try {
    // Patient grants ongoing access to Doctor B
    const grant = await MockAccessGrant.create({
      patientId: PATIENT_A,
      doctorId: DOCTOR_B,
      scope: "ongoing",
      grantedBy: PATIENT_A,
      note: "Second opinion consultation",
    });
    grantId = grant._id;
    assertTruthy(grantId, "should create AccessGrant for Doctor B");

    // Doctor B retrieves patient's test orders
    const sharedOrders = await getPatientTestOrders({
      patientId: PATIENT_A,
      requesterDoctorId: DOCTOR_B,
    });

    assertEqual(sharedOrders.length, 1, "Doctor B should receive shared test orders");
    const shared = sharedOrders[0];
    assertEqual(shared.testName, "Complete Blood Count (CBC)", "Doctor B sees correct test name");
    assertEqual(shared.reason, "Evaluate persistent fatigue and mild anemia symptoms", "Doctor B sees reason for test");
    assertEqual(shared.doctorName, "Dr. Alice Smith", "Doctor B sees 'Ordered by Doctor A' attribution");
    assertEqual(shared.result.value, "14.2", "Doctor B sees structured result value");
    assertEqual(shared.result.labName, "Apex Diagnostic Laboratories", "Doctor B sees lab name");
    assertTruthy(shared.result.reportFile, "Doctor B sees attached report file metadata");
  } catch (err) {
    console.error("Failed in shared access:", err);
    failed++;
  }

  // ── 5. Revocation Stops Doctor B Access Immediately ────────────────────────
  console.log("\n5. Patient Revokes Consent; Doctor B Immediately Blocked:");
  try {
    // Patient revokes grant
    const grant = await MockAccessGrant.findById(grantId);
    grant.revokedAt = new Date();
    await grant.save();

    // Doctor B attempts subsequent access
    await getPatientTestOrders({
      patientId: PATIENT_A,
      requesterDoctorId: DOCTOR_B,
    });
    console.error("  ✗ Doctor B should have been blocked after revocation");
    failed++;
  } catch (err) {
    assertEqual(err.status, 403, "should return 403 Forbidden after consent revocation");
  }

  // ── 6. IDOR Prevention: Doctor B Cannot Swap Patient ID ────────────────────
  console.log("\n6. IDOR Prevention (Swapping patientId):");
  try {
    // Give Doctor B grant for Patient A only
    await MockAccessGrant.create({
      patientId: PATIENT_A,
      doctorId: DOCTOR_B,
      scope: "ongoing",
    });

    // Doctor B attempts to view Patient C's test orders
    await getPatientTestOrders({
      patientId: PATIENT_C,
      requesterDoctorId: DOCTOR_B,
    });
    console.error("  ✗ should block doctor from accessing Patient C with Patient A grant");
    failed++;
  } catch (err) {
    assertEqual(err.status, 403, "should return 403 when doctor tries to access unauthorized patient");
  }

  // ── 7. Authenticated Medical File / Report Access ──────────────────────────
  console.log("\n7. Medical Report Authorization (No Public URLs):");
  try {
    // Unauthenticated request
    try {
      await getTestOrderReport({ testOrderId: createdOrderId });
      console.error("  ✗ Unauthenticated report access should fail");
      failed++;
    } catch (err) {
      assertEqual(err.status, 401, "unauthenticated report access returns 401");
    }

    // Patient owner accesses report
    const patientReport = await getTestOrderReport({
      testOrderId: createdOrderId,
      requesterPatientId: PATIENT_A,
    });
    assertEqual(patientReport.reportFile.fileName, "cbc_analysis_report.pdf", "patient can view own report");

    // Doctor with active grant accesses report
    const doctorReport = await getTestOrderReport({
      testOrderId: createdOrderId,
      requesterDoctorId: DOCTOR_B,
    });
    assertEqual(doctorReport.orderedBy, "Dr. Alice Smith", "doctor sees report with Doctor A attribution");

    // Unauthorized doctor accesses report
    try {
      await getTestOrderReport({
        testOrderId: createdOrderId,
        requesterDoctorId: "doc-unauthorized",
      });
      console.error("  ✗ Unauthorized doctor report access should fail");
      failed++;
    } catch (err) {
      assertEqual(err.status, 403, "unauthorized doctor report access returns 403");
    }
  } catch (err) {
    console.error("Failed file authorization tests:", err);
    failed++;
  }

  // ── 8. Audit Trail Verification ───────────────────────────────────────────
  console.log("\n8. Access Audit Logging:");
  const testLogs = logStore.filter((l) => l.resource === "test_results");
  assertTruthy(testLogs.length >= 2, "should create AccessLog entries for authorized test reads");
  const readLog = testLogs.find((l) => l.action === "read");
  assertTruthy(readLog, "should log 'read' action with patientId and doctorId");
  assertEqual(readLog.doctorId, DOCTOR_B, "audit log should record requesting doctor");
  assertEqual(readLog.patientId, PATIENT_A, "audit log should record target patient");

  // ── 9. Patient Ownership (Direct Access) ───────────────────────────────────
  console.log("\n9. Patient Ownership (Direct Access Without Grant):");
  try {
    const patientOrders = await getPatientTestOrders({
      patientId: PATIENT_A,
      requesterPatientId: PATIENT_A,
    });
    assertEqual(patientOrders.length, 1, "patient should access own records without needing grant");
    assertEqual(patientOrders[0]._id, createdOrderId, "patient receives own test order");
  } catch (err) {
    console.error("Failed patient ownership test:", err);
    failed++;
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
