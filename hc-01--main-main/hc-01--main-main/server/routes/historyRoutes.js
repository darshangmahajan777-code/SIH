import express from "express";
import { asyncHandler, AppError } from "../middleware/errorHandler.js";
import { requireConsent } from "../middleware/requireConsent.js";
import {
  addSelfReportedEntry,
  getPatientTimeline,
  deleteEntry,
} from "../services/historyService.js";

const router = express.Router();

// ─────────────────────────────────────────────────────────────────────────────
// PATIENT — Self-Service Timeline Endpoints
// ─────────────────────────────────────────────────────────────────────────────

/**
 * GET /api/history/mine
 * Patient retrieves their own full medical history timeline.
 * No consent check needed — patient always owns their own data.
 *
 * Query: { patientId }
 */
router.get(
  "/mine",
  asyncHandler(async (req, res) => {
    const patientId = req.query.patientId || req.headers["x-patient-id"];
    if (!patientId) {
      throw new AppError("patientId is required", 400);
    }

    const entries = await getPatientTimeline(patientId);

    res.json({
      success: true,
      count: entries.length,
      data: entries,
    });
  })
);

/**
 * POST /api/history/self-report
 * Patient adds a new self-reported medical history entry.
 *
 * Body: { patientId, condition, conditionDate, notes? }
 */
router.post(
  "/self-report",
  asyncHandler(async (req, res) => {
    const { patientId, condition, conditionDate, notes } = req.body;

    if (!patientId || !condition || !conditionDate) {
      throw new AppError("patientId, condition, and conditionDate are required", 400);
    }

    const entry = await addSelfReportedEntry({ patientId, condition, conditionDate, notes });

    res.status(201).json({
      success: true,
      message: "Medical history entry added successfully.",
      data: entry,
    });
  })
);

/**
 * DELETE /api/history/:entryId
 * Patient soft-deletes a self-reported entry.
 * Doctor-verified entries cannot be deleted (protected by historyService).
 *
 * Body or query: { patientId }
 */
router.delete(
  "/:entryId",
  asyncHandler(async (req, res) => {
    const { entryId } = req.params;
    const patientId = req.body?.patientId || req.query?.patientId || req.headers["x-patient-id"];

    if (!patientId) {
      throw new AppError("patientId is required to delete a history entry", 400);
    }

    const entry = await deleteEntry({ entryId, patientId });

    res.json({
      success: true,
      message: "Medical history entry removed from your timeline.",
      data: entry,
    });
  })
);

// ─────────────────────────────────────────────────────────────────────────────
// DOCTOR — Consent-Gated Patient Timeline
//
// requireConsent middleware verifies:
//   1. Active non-revoked AccessGrant exists for (doctorId, patientId)
//   2. patientId in URL matches grant.patientId (IDOR prevention)
//   3. Writes an AccessLog entry for every authorized read
// ─────────────────────────────────────────────────────────────────────────────

/**
 * GET /api/history/patient/:patientId
 * Doctor reads a patient medical history timeline — requires active consent grant.
 *
 * Header: x-doctor-id  (or req.user._id in production JWT flow)
 */
router.get(
  "/patient/:patientId",
  requireConsent({ resource: "medical_history" }),
  asyncHandler(async (req, res) => {
    const entries = await getPatientTimeline(req.authorizedPatientId);

    res.json({
      success: true,
      count: entries.length,
      consentVerified: true,
      grantId: req.consentGrant._id,
      data: entries,
    });
  })
);

export default router;
