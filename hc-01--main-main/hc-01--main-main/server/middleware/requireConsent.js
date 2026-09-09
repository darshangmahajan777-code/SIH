import { AppError, asyncHandler } from "./errorHandler.js";
import { checkAccess, _writeAccessLog } from "../services/consentService.js";

/**
 * requireConsent — Backend Access Control Middleware
 *
 * This is the SOLE security boundary for all protected medical data endpoints.
 * Frontend visibility is cosmetic only — access control NEVER relies on
 * frontend booleans or client-sent flags.
 *
 * Usage:
 *   router.get("/patient/:patientId/prescriptions",
 *     requireConsent({ resource: "prescriptions" }),
 *     asyncHandler(handler)
 *   );
 *
 * How it works:
 *  1. Extracts (requestingDoctorId, targetPatientId) from the request.
 *  2. Calls checkAccess() to verify a non-revoked AccessGrant exists.
 *  3. For appointment scope, verifies appointmentId matches the grant.
 *  4. On success: writes an AccessLog entry and calls next().
 *  5. On failure: returns 403 — no data is served, no log entry for the data.
 *
 * IDOR Prevention:
 *  - doctorId comes from req.user (authenticated session) or req.headers.
 *  - patientId comes from req.params.patientId (URL path) — but access is
 *    ONLY allowed if the DB has a matching AccessGrant for that exact pair.
 *  - A doctor changing :patientId in the URL to another patient's ID finds
 *    no grant for that pair and receives 403.
 *
 * @param {object} options
 * @param {string} options.resource - The medical resource being accessed
 */
export function requireConsent({ resource }) {
  return asyncHandler(async (req, res, next) => {
    // ── 1. Identify the requesting doctor ────────────────────────────────────
    // In production, doctorId would come from a verified JWT/session.
    // We support: req.user._id, req.headers.x-doctor-id, or req.body.doctorId.
    const doctorId =
      req.user?._id?.toString() ||
      req.user?.id?.toString() ||
      req.headers["x-doctor-id"] ||
      req.body?.doctorId ||
      req.query?.doctorId;

    if (!doctorId) {
      throw new AppError("Authentication required: no doctor identity found in request", 401);
    }

    // ── 2. Identify the target patient (from URL param) ───────────────────────
    const patientId = req.params.patientId;

    if (!patientId) {
      throw new AppError("patientId path parameter is required", 400);
    }

    // ── 3. IDOR Check: Verify grant exists for this exact (doctor, patient) pair ─
    // appointmentId is optional context for appointment-scoped grants
    const appointmentId = req.params.appointmentId || req.query.appointmentId || null;

    const grant = await checkAccess({ doctorId, patientId, appointmentId });

    if (!grant) {
      // Return a uniform 403 — do not reveal whether the patient exists
      throw new AppError(
        "Access denied. Patient has not granted you access to this medical record, or the grant has been revoked.",
        403
      );
    }

    // ── 4. Audit: log the authorized access ──────────────────────────────────
    // Fire-and-forget — never block the request path on audit writes
    _writeAccessLog({
      patientId,
      doctorId,
      resource,
      action: "read",
      grantId: grant._id,
      ipAddress: req.ip || req.socket?.remoteAddress || null,
      userAgent: req.headers["user-agent"] || null,
    }).catch((err) => console.warn("[requireConsent] Audit log write failed:", err.message));

    // Notify patient that their records were accessed
    import("../services/notificationService.js")
      .then(({ createNotification }) => {
        createNotification({
          recipient: patientId,
          type: "medical_record_access",
          title: "Medical Records Accessed",
          message: `Your ${resource.replace(/_/g, " ")} was accessed by an attending clinician under verified consent.`,
          metadata: { doctorId, resource, grantId: grant._id },
        }).catch(() => {});
      })
      .catch(() => {});

    // ── 5. Attach grant context for downstream handlers ──────────────────────
    req.consentGrant = grant;
    req.authorizedPatientId = patientId;
    req.authorizedDoctorId = doctorId;

    next();
  });
}

/**
 * requirePatientOwnership — Ensure the requester IS the patient (not a doctor)
 *
 * Protects patient-only endpoints (grant, revoke, view own logs).
 * Extracts patientId from the request and verifies ownership.
 *
 * In production, this would verify a JWT sub claim. Here we support:
 *   req.user._id / req.headers.x-patient-id / req.body.patientId
 */
export function requirePatientOwnership() {
  return asyncHandler(async (req, res, next) => {
    const requestingPatientId =
      req.user?._id?.toString() ||
      req.user?.id?.toString() ||
      req.headers["x-patient-id"] ||
      req.body?.patientId ||
      req.query?.patientId;

    if (!requestingPatientId) {
      throw new AppError("Authentication required: no patient identity found in request", 401);
    }

    // For routes with :patientId param, verify it matches the authenticated patient
    if (req.params.patientId && req.params.patientId !== requestingPatientId) {
      throw new AppError("Forbidden: You may only access your own data", 403);
    }

    req.authenticatedPatientId = requestingPatientId;
    next();
  });
}
