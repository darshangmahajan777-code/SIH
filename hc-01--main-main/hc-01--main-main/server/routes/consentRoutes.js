import express from "express";
import { asyncHandler, AppError } from "../middleware/errorHandler.js";
import { requireConsent, requirePatientOwnership } from "../middleware/requireConsent.js";
import {
  grantAccess,
  revokeAccess,
  listGrantsForPatient,
  listAccessLogs,
  getPatientMedicalData,
  recordEmergencyAccess,
} from "../services/consentService.js";

const router = express.Router();

// ─────────────────────────────────────────────────────────────────────────────
// PATIENT — Consent Management
// ─────────────────────────────────────────────────────────────────────────────

/**
 * POST /api/consent/grant
 * Patient explicitly grants a doctor access to their medical data.
 *
 * Body: { patientId, doctorId, scope, appointmentId?, note? }
 */
router.post(
  "/grant",
  asyncHandler(async (req, res) => {
    const { patientId, doctorId, scope, appointmentId, note } = req.body;

    if (!patientId || !doctorId || !scope) {
      throw new AppError("patientId, doctorId and scope are required", 400);
    }
    if (!["appointment", "ongoing"].includes(scope)) {
      throw new AppError('scope must be "appointment" or "ongoing"', 400);
    }
    if (scope === "appointment" && !appointmentId) {
      throw new AppError("appointmentId is required for appointment-scoped grants", 400);
    }

    const verifiedPatientId =
      req.user?._id?.toString() ||
      req.headers["x-patient-id"] ||
      req.headers["x-user-id"];

    if (verifiedPatientId && patientId && verifiedPatientId !== patientId.toString()) {
      throw new AppError("Forbidden: Cannot grant consent on behalf of another patient", 403);
    }

    const grant = await grantAccess({
      patientId: verifiedPatientId || patientId,
      doctorId,
      scope,
      appointmentId: appointmentId || null,
      grantedBy: verifiedPatientId || patientId,
      note,
    });

    // Notify doctor and patient
    import("../services/notificationService.js")
      .then(({ createNotification }) => {
        createNotification({
          recipient: doctorId,
          type: "consent_granted",
          title: "Patient Medical Record Access Granted",
          message: `A patient has granted you consent to access their medical records (${scope} scope).`,
          metadata: { grantId: grant._id, patientId, scope },
        }).catch(() => {});

        createNotification({
          recipient: patientId,
          type: "consent_granted",
          title: "Consent Granted",
          message: `You granted medical record access to your doctor (${scope} scope).`,
          metadata: { grantId: grant._id, doctorId, scope },
        }).catch(() => {});
      })
      .catch(() => {});

    res.status(201).json({
      success: true,
      message: `Access granted to doctor. Scope: ${scope}.`,
      data: grant,
    });
  })
);

/**
 * DELETE /api/consent/grant/:grantId
 * Patient revokes an existing access grant.
 * The patientId must match the grant owner (IDOR prevention).
 *
 * Body or query: { patientId }
 */
router.delete(
  "/grant/:grantId",
  asyncHandler(async (req, res) => {
    const { grantId } = req.params;
    const verifiedPatientId =
      req.user?._id?.toString() ||
      req.headers["x-patient-id"] ||
      req.headers["x-user-id"];

    const targetPatientId = req.body?.patientId || req.query?.patientId || verifiedPatientId;

    if (verifiedPatientId && targetPatientId && verifiedPatientId !== targetPatientId.toString()) {
      throw new AppError("Forbidden: Cannot revoke consent on behalf of another patient", 403);
    }

    const patientId = verifiedPatientId || targetPatientId;

    if (!patientId) {
      throw new AppError("patientId is required to revoke a grant", 400);
    }

    const grant = await revokeAccess({ grantId, patientId });

    // Notify doctor and patient
    import("../services/notificationService.js")
      .then(({ createNotification }) => {
        createNotification({
          recipient: grant.doctorId,
          type: "consent_revoked",
          title: "Medical Record Access Revoked",
          message: "A patient has revoked your access to their medical records.",
          metadata: { grantId: grant._id, patientId },
        }).catch(() => {});

        createNotification({
          recipient: patientId,
          type: "consent_revoked",
          title: "Consent Revoked",
          message: "You have revoked access to your medical records.",
          metadata: { grantId: grant._id, doctorId: grant.doctorId },
        }).catch(() => {});
      })
      .catch(() => {});

    res.json({
      success: true,
      message: "Access grant revoked. Doctor can no longer access your medical data.",
      data: grant,
    });
  })
);

/**
 * GET /api/consent/grants
 * Patient views all their access grants (active and revoked).
 *
 * Query: { patientId }
 */
router.get(
  "/grants",
  asyncHandler(async (req, res) => {
    const verifiedPatientId =
      req.user?._id?.toString() ||
      req.headers["x-patient-id"] ||
      req.headers["x-user-id"];

    const targetPatientId = req.query.patientId || verifiedPatientId;

    if (verifiedPatientId && targetPatientId && verifiedPatientId !== targetPatientId.toString()) {
      throw new AppError("Forbidden: Cannot view grants belonging to another patient", 403);
    }

    const patientId = verifiedPatientId || targetPatientId;
    if (!patientId) {
      throw new AppError("patientId is required", 400);
    }

    const grants = await listGrantsForPatient(patientId);

    res.json({
      success: true,
      count: grants.length,
      data: grants,
    });
  })
);

/**
 * GET /api/consent/access-log
 * Patient views an immutable audit log of who accessed their data and when.
 *
 * Query: { patientId, limit? }
 */
router.get(
  "/access-log",
  asyncHandler(async (req, res) => {
    const verifiedPatientId =
      req.user?._id?.toString() ||
      req.headers["x-patient-id"] ||
      req.headers["x-user-id"];

    const targetPatientId = req.query.patientId || verifiedPatientId;

    if (verifiedPatientId && targetPatientId && verifiedPatientId !== targetPatientId.toString()) {
      throw new AppError("Forbidden: Cannot view access logs belonging to another patient", 403);
    }

    const patientId = verifiedPatientId || targetPatientId;
    const limit = Math.min(Number(req.query.limit) || 100, 500);

    if (!patientId) {
      throw new AppError("patientId is required", 400);
    }

    const logs = await listAccessLogs({ patientId, limit });

    res.json({
      success: true,
      count: logs.length,
      data: logs,
    });
  })
);

// ─────────────────────────────────────────────────────────────────────────────
// DOCTOR — Protected Medical Data Access
//
// ALL routes below are protected by requireConsent middleware.
// The middleware verifies:
//   1. An active, non-revoked AccessGrant exists for (doctorId, patientId)
//   2. The patientId in the URL matches the grant's patientId (IDOR prevention)
//   3. Writes an AccessLog entry for every authorized read
// ─────────────────────────────────────────────────────────────────────────────

/**
 * GET /api/consent/patient/:patientId/medical-history
 * Protected: requires active consent grant.
 */
router.get(
  "/patient/:patientId/medical-history",
  requireConsent({ resource: "medical_history" }),
  asyncHandler(async (req, res) => {
    const data = await getPatientMedicalData({
      patientId: req.authorizedPatientId,
      resource: "medical_history",
    });
    res.json({ success: true, data, grantId: req.consentGrant._id });
  })
);

/**
 * GET /api/consent/patient/:patientId/prescriptions
 * Protected: requires active consent grant.
 */
router.get(
  "/patient/:patientId/prescriptions",
  requireConsent({ resource: "prescriptions" }),
  asyncHandler(async (req, res) => {
    const data = await getPatientMedicalData({
      patientId: req.authorizedPatientId,
      resource: "prescriptions",
    });
    res.json({ success: true, data, grantId: req.consentGrant._id });
  })
);

/**
 * GET /api/consent/patient/:patientId/test-results
 * Protected: requires active consent grant.
 */
router.get(
  "/patient/:patientId/test-results",
  requireConsent({ resource: "test_results" }),
  asyncHandler(async (req, res) => {
    const data = await getPatientMedicalData({
      patientId: req.authorizedPatientId,
      resource: "test_results",
    });
    res.json({ success: true, data, grantId: req.consentGrant._id });
  })
);

/**
 * GET /api/consent/patient/:patientId/care-plans
 * Protected: requires active consent grant.
 */
router.get(
  "/patient/:patientId/care-plans",
  requireConsent({ resource: "care_plans" }),
  asyncHandler(async (req, res) => {
    const data = await getPatientMedicalData({
      patientId: req.authorizedPatientId,
      resource: "care_plans",
    });
    res.json({ success: true, data, grantId: req.consentGrant._id });
  })
);

/**
 * GET /api/consent/patient/:patientId/medical-reports
 * Protected: requires active consent grant.
 */
router.get(
  "/patient/:patientId/medical-reports",
  requireConsent({ resource: "medical_reports" }),
  asyncHandler(async (req, res) => {
    const data = await getPatientMedicalData({
      patientId: req.authorizedPatientId,
      resource: "medical_reports",
    });
    res.json({ success: true, data, grantId: req.consentGrant._id });
  })
);

// ─────────────────────────────────────────────────────────────────────────────
// EMERGENCY ACCESS (Explicit Extension Point)
//
// Emergency access is:
//   - Limited in scope (access to a specific resource, not all records)
//   - Authenticated (doctorId must be present)
//   - Audited (creates an AccessLog with isEmergency=true)
//   - Reviewable (patient can see emergency accesses in their audit log)
//   - Not a silent bypass (requires a verified EmergencyCase._id)
//
// It does NOT create a persistent AccessGrant.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * POST /api/consent/emergency-access
 * Clinician emergency access to a specific patient resource.
 *
 * Body: {
 *   doctorId,
 *   patientId,
 *   resource,              // one of the 5 protected resource types
 *   emergencyReason,       // mandatory clinical justification
 *   authorizedBy,          // clinician name
 *   emergencyCaseId,       // REQUIRED — must reference a real EmergencyCase document
 * }
 */
router.post(
  "/emergency-access",
  asyncHandler(async (req, res) => {
    const { doctorId, patientId, resource, emergencyReason, authorizedBy, emergencyCaseId } = req.body;

    const validResources = ["medical_history", "prescriptions", "test_results", "care_plans", "medical_reports"];
    if (!resource || !validResources.includes(resource)) {
      throw new AppError(`resource must be one of: ${validResources.join(", ")}`, 400);
    }

    const result = await recordEmergencyAccess({
      doctorId,
      patientId,
      resource,
      emergencyReason,
      authorizedBy,
      emergencyCaseId,
      ipAddress: req.ip || req.socket?.remoteAddress || null,
      userAgent: req.headers["user-agent"] || null,
    });

    // Serve limited data with explicit emergency disclaimer
    const data = await getPatientMedicalData({ patientId, resource });

    res.json({
      success: true,
      isEmergencyAccess: true,
      disclaimer: result.disclaimer,
      accessLogId: result.accessLog._id,
      data,
    });
  })
);

export default router;
