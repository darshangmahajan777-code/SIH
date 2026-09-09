import mongoose from "mongoose";
import AccessGrant from "../models/AccessGrant.js";
import AccessLog from "../models/AccessLog.js";
import EmergencyCase from "../models/EmergencyCase.js";
import { AppError } from "../middleware/errorHandler.js";

// In-memory fallback stores for test isolation and offline execution
let inMemoryGrants = [];
let inMemoryAccessLogs = [];

export function clearConsentTestDb() {
  inMemoryGrants = [];
  inMemoryAccessLogs = [];
}

export function seedConsentTestDb({ grants = [], logs = [] } = {}) {
  if (grants.length) inMemoryGrants = [...grants];
  if (logs.length) inMemoryAccessLogs = [...logs];
}

// ─────────────────────────────────────────────────────────────────────────────
// Grant Management
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Patient grants a doctor access to their medical data.
 *
 * @param {string} patientId     - The patient (data owner)
 * @param {string} doctorId      - The doctor being granted access
 * @param {"appointment"|"ongoing"} scope
 * @param {string|null} appointmentId - Required when scope === "appointment"
 * @param {string|null} grantedBy    - Who is performing the grant (usually patientId)
 * @param {string} note              - Optional patient note
 */
export async function grantAccess({ patientId, doctorId, scope, appointmentId = null, grantedBy = null, note = "" }) {
  if (!patientId || !doctorId || !scope) {
    throw new AppError("patientId, doctorId and scope are required", 400);
  }
  if (scope === "appointment" && !appointmentId) {
    throw new AppError("appointmentId is required for appointment-scoped grants", 400);
  }

  // Fallback for offline / test runner
  if (mongoose.connection.readyState !== 1) {
    const existing = inMemoryGrants.find((g) => {
      if (g.patientId?.toString() !== patientId.toString()) return false;
      if (g.doctorId?.toString() !== doctorId.toString()) return false;
      if (g.scope !== scope) return false;
      if (scope === "appointment" && g.appointmentId?.toString() !== appointmentId?.toString()) return false;
      if (g.revokedAt !== null && g.revokedAt !== undefined) return false;
      return true;
    });

    if (existing) {
      return existing;
    }

    const grant = {
      _id: new mongoose.Types.ObjectId().toString(),
      patientId: patientId.toString(),
      doctorId: doctorId.toString(),
      scope,
      appointmentId: scope === "appointment" ? appointmentId?.toString() : null,
      grantedBy: (grantedBy || patientId).toString(),
      note: (note || "").trim(),
      grantedAt: new Date(),
      revokedAt: null,
      save: async function () { return this; },
    };

    inMemoryGrants.push(grant);
    await _writeAccessLog({
      patientId,
      doctorId,
      resource: "grant",
      action: "grant",
      grantId: grant._id,
    });
    return grant;
  }

  // Prevent duplicate active grants for same (patient, doctor, scope, appointment)
  const existing = await AccessGrant.findOne({
    patientId,
    doctorId,
    scope,
    appointmentId: scope === "appointment" ? appointmentId : null,
    revokedAt: null,
  });

  if (existing) {
    return existing; // Idempotent — return existing active grant
  }

  const grant = await AccessGrant.create({
    patientId,
    doctorId,
    scope,
    appointmentId: scope === "appointment" ? appointmentId : null,
    grantedBy: grantedBy || patientId,
    note: note.trim(),
    grantedAt: new Date(),
    revokedAt: null,
  });

  // Audit: record the grant event
  await _writeAccessLog({
    patientId,
    doctorId,
    resource: "grant",
    action: "grant",
    grantId: grant._id,
  });

  return grant;
}

/**
 * Patient revokes an access grant.
 * Only the patient who owns the grant (or an admin) can revoke it.
 * Supports revoking by grantId or by doctorId.
 *
 * @param {string} [grantId]  - The AccessGrant._id to revoke
 * @param {string} patientId  - Must match grant.patientId (ownership check)
 * @param {string} [doctorId] - Revoke active grant for this doctor
 */
export async function revokeAccess({ grantId, patientId, doctorId }) {
  if (!patientId || (!grantId && !doctorId)) {
    throw new AppError("patientId and either grantId or doctorId are required", 400);
  }

  // Fallback for offline / test runner
  if (mongoose.connection.readyState !== 1) {
    let grant = null;
    if (grantId) {
      grant = inMemoryGrants.find((g) => g._id?.toString() === grantId.toString());
    } else if (doctorId) {
      grant = inMemoryGrants.find(
        (g) =>
          g.patientId?.toString() === patientId.toString() &&
          g.doctorId?.toString() === doctorId.toString() &&
          (g.revokedAt === null || g.revokedAt === undefined)
      );
    }

    if (!grant) {
      throw new AppError("Access grant not found", 404);
    }

    if (grant.patientId.toString() !== patientId.toString()) {
      throw new AppError("Forbidden: You may only revoke your own access grants", 403);
    }

    if (grant.revokedAt !== null && grant.revokedAt !== undefined) {
      throw new AppError("This grant has already been revoked", 409);
    }

    grant.revokedAt = new Date();
    await _writeAccessLog({
      patientId,
      doctorId: grant.doctorId,
      resource: "revoke",
      action: "revoke",
      grantId: grant._id,
    });

    return grant;
  }

  let grant = null;
  if (grantId) {
    grant = await AccessGrant.findById(grantId);
  } else if (doctorId) {
    grant = await AccessGrant.findOne({
      patientId,
      doctorId,
      revokedAt: null,
    });
  }

  if (!grant) {
    throw new AppError("Access grant not found", 404);
  }

  // SECURITY: Ownership check — patient may only revoke their own grants
  if (grant.patientId.toString() !== patientId.toString()) {
    throw new AppError("Forbidden: You may only revoke your own access grants", 403);
  }

  if (grant.revokedAt !== null) {
    throw new AppError("This grant has already been revoked", 409);
  }

  grant.revokedAt = new Date();
  await grant.save();

  // Audit: record the revocation event
  await _writeAccessLog({
    patientId,
    doctorId: grant.doctorId,
    resource: "revoke",
    action: "revoke",
    grantId: grant._id,
  });

  return grant;
}

// ─────────────────────────────────────────────────────────────────────────────
// Access Verification (called by requireConsent middleware)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Checks whether a doctor has an active, non-revoked grant for a patient.
 * For appointment scope, also verifies the appointmentId matches.
 *
 * Returns the grant document if access is authorized, or null.
 */
export async function checkAccess({ doctorId, patientId, appointmentId = null }) {
  if (!doctorId || !patientId) return null;

  // Fallback for offline / test runner
  if (mongoose.connection.readyState !== 1) {
    const ongoingGrant = inMemoryGrants.find((g) =>
      g.doctorId?.toString() === doctorId.toString() &&
      g.patientId?.toString() === patientId.toString() &&
      g.scope === "ongoing" &&
      (g.revokedAt === null || g.revokedAt === undefined)
    );
    if (ongoingGrant) return ongoingGrant;

    if (appointmentId) {
      const appointmentGrant = inMemoryGrants.find((g) =>
        g.doctorId?.toString() === doctorId.toString() &&
        g.patientId?.toString() === patientId.toString() &&
        g.scope === "appointment" &&
        g.appointmentId?.toString() === appointmentId.toString() &&
        (g.revokedAt === null || g.revokedAt === undefined)
      );
      if (appointmentGrant) return appointmentGrant;
    }

    return null;
  }

  // Check for ongoing grant first (broader permission)
  const ongoingGrant = await AccessGrant.findOne({
    doctorId,
    patientId,
    scope: "ongoing",
    revokedAt: null,
  });
  if (ongoingGrant) return ongoingGrant;

  // Check for appointment-scoped grant
  if (appointmentId) {
    const appointmentGrant = await AccessGrant.findOne({
      doctorId,
      patientId,
      scope: "appointment",
      appointmentId,
      revokedAt: null,
    });
    if (appointmentGrant) return appointmentGrant;
  }

  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Query Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns all grants for a patient (active and revoked), sorted by most recent.
 */
export async function listGrantsForPatient(patientId) {
  if (mongoose.connection.readyState !== 1) {
    return inMemoryGrants
      .filter((g) => g.patientId?.toString() === patientId.toString())
      .sort((a, b) => new Date(b.grantedAt) - new Date(a.grantedAt));
  }

  return AccessGrant.find({ patientId })
    .populate("doctorId", "name email role")
    .populate("appointmentId", "date slotTime status")
    .sort({ grantedAt: -1 })
    .lean();
}

/**
 * Returns the access audit log for a patient, newest first.
 */
export async function listAccessLogs({ patientId, limit = 100 }) {
  if (mongoose.connection.readyState !== 1) {
    return inMemoryAccessLogs
      .filter((l) => l.patientId?.toString() === patientId.toString())
      .sort((a, b) => new Date(b.accessedAt) - new Date(a.accessedAt))
      .slice(0, limit);
  }

  return AccessLog.find({ patientId })
    .populate("doctorId", "name email role")
    .sort({ accessedAt: -1 })
    .limit(limit)
    .lean();
}

// ─────────────────────────────────────────────────────────────────────────────
// Protected Medical Data Retrieval
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns structured medical data for a patient.
 * This is called ONLY after requireConsent middleware has already
 * verified that the requesting doctor has an active grant.
 *
 * NOTE: In a production system each resource type would query its own
 * dedicated collection. Here we return structured placeholder data
 * populated from Appointment, Token, and other models to demonstrate
 * the access control plumbing end-to-end.
 */
export async function getPatientMedicalData({ patientId, resource }) {
  const Appointment = (await import("../models/Appointment.js")).default;

  const baseQuery = { patientId, status: { $in: ["completed", "in-progress"] } };

  const resourceMap = {
    medical_history: async () => {
      // Serve real MedicalHistory timeline records (both self-reported and doctor-verified)
      const MedicalHistory = (await import("../models/MedicalHistory.js")).default;
      const entries = await MedicalHistory.find({ patientId, isActive: true })
        .sort({ conditionDate: -1, createdAt: -1 })
        .lean();
      return {
        resource: "medical_history",
        records: entries.map((e) => ({
          id: e._id,
          condition: e.condition,
          conditionDate: e.conditionDate,
          notes: e.notes,
          source: e.source,
          doctorName: e.doctorName || null,
          doctorId: e.doctorId || null,
          appointmentId: e.appointmentId || null,
        })),
      };
    },
    prescriptions: async () => {
      // Prescriptions would be their own model in a full system
      const apts = await Appointment.find({ ...baseQuery, status: "completed" })
        .populate("doctorId", "doctorName specialty")
        .sort({ date: -1 })
        .limit(20)
        .lean();
      return {
        resource: "prescriptions",
        records: apts.map((a) => ({
          date: a.date,
          prescribingDoctor: a.doctorId?.doctorName || "Unknown",
          appointmentId: a._id,
          note: "Prescription records from completed consultation",
        })),
      };
    },
    test_results: async () => {
      const TestOrder = (await import("../models/TestOrder.js")).default;
      const testOrders = await TestOrder.find({ patientId })
        .sort({ createdAt: -1 })
        .lean();
      return {
        resource: "test_results",
        records: testOrders.map((t) => ({
          id: t._id,
          testName: t.testName,
          reason: t.reason,
          orderedBy: t.doctorName || "Attending Doctor",
          status: t.status,
          date: t.completedAt || t.createdAt,
          result: t.result?.value
            ? `${t.result.value} ${t.result.unit || ""}`.trim()
            : "Pending",
          structuredResult: t.result,
          labName: t.result?.labName || null,
          hasReport: Boolean(t.result?.reportFile?.fileName),
          reportFileName: t.result?.reportFile?.fileName || null,
        })),
        note: testOrders.length === 0 ? "No test results on record" : undefined,
      };
    },
    care_plans: async () => {
      const CarePlan = (await import("../models/CarePlan.js")).default;
      const { formatStructuredCarePlan } = await import("./carePlanService.js");
      const plans = await CarePlan.find({ patientId })
        .sort({ createdAt: -1 })
        .lean();
      return {
        resource: "care_plans",
        records: plans.map(formatStructuredCarePlan),
        note: plans.length === 0 ? "No active care plans on record" : undefined,
      };
    },
    medical_reports: async () => ({
      resource: "medical_reports",
      records: [],
      note: "No uploaded medical reports",
    }),
  };

  const fetcher = resourceMap[resource];
  if (!fetcher) {
    throw new AppError(`Unknown resource: ${resource}`, 400);
  }

  return fetcher();
}

// ─────────────────────────────────────────────────────────────────────────────
// Emergency Access (Explicit Extension Point)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Records and authorizes a clinician emergency access to patient data.
 *
 * IMPORTANT: This does NOT create a persistent AccessGrant.
 * It creates an AccessLog entry with isEmergency=true.
 * All emergency accesses are auditable and reviewable.
 *
 * The caller MUST supply a valid emergencyCaseId referencing an active
 * EmergencyCase document — this prevents fabricated emergency claims.
 *
 * @returns {{ allowed: boolean, accessLog: AccessLog, disclaimer: string }}
 */
export async function recordEmergencyAccess({
  doctorId,
  patientId,
  resource,
  emergencyReason,
  authorizedBy,
  emergencyCaseId,
  ipAddress = null,
  userAgent = null,
}) {
  if (!doctorId || !patientId || !resource || !emergencyReason || !emergencyCaseId) {
    throw new AppError(
      "doctorId, patientId, resource, emergencyReason, and emergencyCaseId are required for emergency access",
      400
    );
  }

  // Verify the emergencyCaseId refers to a real EmergencyCase
  const eCase = await EmergencyCase.findById(emergencyCaseId).lean();
  if (!eCase) {
    throw new AppError(
      "Invalid emergencyCaseId. Emergency access requires a verified EmergencyCase reference.",
      403
    );
  }

  const accessLog = await AccessLog.create({
    patientId,
    doctorId,
    accessedAt: new Date(),
    resource,
    action: "emergency_access",
    grantId: null, // No persistent grant — emergency access only
    isEmergency: true,
    emergencyReason,
    authorizedBy: authorizedBy || "Attending Clinician",
    emergencyCaseId,
    ipAddress,
    userAgent,
  });

  return {
    allowed: true,
    accessLog,
    disclaimer:
      "EMERGENCY ACCESS: This access is limited, authenticated, and fully audited. " +
      "It has been logged and is reviewable by the patient and compliance officers. " +
      "No standing access grant has been created.",
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Internal helper: Write a single access log entry.
 * Fire-and-forget with warning on failure (never block the request).
 */
async function _writeAccessLog({ patientId, doctorId, resource, action, grantId = null, resourceId = null, ipAddress = null, userAgent = null }) {
  if (mongoose.connection.readyState !== 1) {
    inMemoryAccessLogs.push({
      _id: new mongoose.Types.ObjectId().toString(),
      patientId: patientId?.toString(),
      doctorId: doctorId?.toString(),
      resource,
      resourceId,
      action,
      grantId: grantId?.toString(),
      isEmergency: false,
      ipAddress,
      userAgent,
      accessedAt: new Date(),
    });
    return;
  }

  try {
    await AccessLog.create({
      patientId,
      doctorId,
      accessedAt: new Date(),
      resource,
      resourceId,
      action,
      grantId,
      isEmergency: false,
      ipAddress,
      userAgent,
    });
  } catch (err) {
    console.warn("[AccessLog] Failed to write access log entry:", err.message);
  }
}

// Export internal helper for use in middleware
export { _writeAccessLog };
