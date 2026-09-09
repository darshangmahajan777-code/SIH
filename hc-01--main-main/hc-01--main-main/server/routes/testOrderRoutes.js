import express from "express";
import { asyncHandler, AppError } from "../middleware/errorHandler.js";
import {
  createTestOrder,
  recordTestResult,
  getPatientTestOrders,
  getTestOrderReport,
} from "../services/testOrderService.js";

const router = express.Router();

/**
 * POST /api/test-orders
 * Doctor orders a lab / diagnostic test
 *
 * Body: { appointmentId?, patientId, doctorId?, doctorName?, testName, reason }
 * Header: x-doctor-id (optional if doctorId in body)
 */
router.post(
  "/",
  asyncHandler(async (req, res) => {
    const doctorId =
      req.body.doctorId ||
      req.headers["x-doctor-id"] ||
      req.user?._id?.toString() ||
      req.user?.id?.toString();

    const { appointmentId, patientId, doctorName, testName, reason } = req.body;

    if (!doctorId) {
      throw new AppError("doctorId is required in request body or x-doctor-id header", 400);
    }
    if (!patientId) {
      throw new AppError("patientId is required", 400);
    }
    if (!testName || !reason) {
      throw new AppError("testName and reason are required", 400);
    }

    const order = await createTestOrder({
      appointmentId,
      patientId,
      doctorId,
      doctorName,
      testName,
      reason,
    });

    res.status(201).json({
      success: true,
      message: "Test ordered successfully.",
      data: order,
    });
  })
);

/**
 * PATCH /api/test-orders/:id/result
 * Patient or Lab records the structured result for an ordered test
 *
 * Body: { result: { value, unit, resultDate?, labName, notes?, reportFile? }, status? }
 */
router.patch(
  "/:id/result",
  asyncHandler(async (req, res) => {
    const testOrderId = req.params.id;
    const { result, status = "completed" } = req.body;

    if (!result) {
      throw new AppError("result object is required", 400);
    }

    const updated = await recordTestResult({
      testOrderId,
      result,
      status,
    });

    // Notify patient
    import("../services/notificationService.js")
      .then(({ createNotification }) => {
        createNotification({
          recipient: updated.patientId,
          type: "lab_result",
          title: "Lab Test Results Available",
          message: `Results for your test "${updated.testName}" are now available from ${result.labName || "the diagnostic lab"}.`,
          metadata: { testOrderId: updated._id, testName: updated.testName },
        }).catch(() => {});
      })
      .catch(() => {});

    res.json({
      success: true,
      message: "Test result recorded successfully.",
      data: updated,
    });
  })
);

/**
 * GET /api/test-orders/patient/:patientId
 * View a patient's test orders
 *
 * Access Control:
 *  - Patient viewing own data: allowed (Patient owns data).
 *    Identified via x-patient-id header or query patientId.
 *  - Doctor viewing patient data: REQUIRES active AccessGrant!
 *    Identified via x-doctor-id header or query doctorId.
 *    If grant is missing or revoked -> 403 Forbidden.
 *    If grant exists -> 200 OK + AccessLog entry recorded.
 */
router.get(
  "/patient/:patientId",
  asyncHandler(async (req, res) => {
    const { patientId } = req.params;

    const requesterDoctorId =
      req.headers["x-doctor-id"] ||
      (req.user?.role === "doctor" ? req.user._id?.toString() : null);

    const requesterPatientId =
      req.headers["x-patient-id"] ||
      req.headers["x-user-id"] ||
      (req.user?.role === "patient" ? req.user._id?.toString() : null);

    if (!requesterDoctorId && !requesterPatientId) {
      throw new AppError(
        "Authentication required: requesting doctor or patient identity must be provided via auth or headers",
        401
      );
    }

    const appointmentId = req.query.appointmentId || null;

    const orders = await getPatientTestOrders({
      patientId,
      requesterDoctorId,
      requesterPatientId,
      appointmentId,
    });

    res.json({
      success: true,
      count: orders.length,
      data: orders,
    });
  })
);

/**
 * GET /api/test-orders/:id/report
 * Authenticated medical report download / view
 *
 * SECURITY:
 *  - Reports are NEVER publicly accessible.
 *  - Checks requester authorization (patient owner OR doctor with active grant).
 *  - Sets strict no-cache headers.
 *  - Logs access in AccessLog.
 */
router.get(
  "/:id/report",
  asyncHandler(async (req, res) => {
    const testOrderId = req.params.id;

    const requesterDoctorId =
      req.headers["x-doctor-id"] ||
      (req.user?.role === "doctor" ? req.user._id?.toString() : null);

    const requesterPatientId =
      req.headers["x-patient-id"] ||
      req.headers["x-user-id"] ||
      (req.user?.role === "patient" ? req.user._id?.toString() : null);

    if (!requesterDoctorId && !requesterPatientId) {
      throw new AppError(
        "Authentication required: no verified user identity found in headers or session",
        401
      );
    }

    const reportData = await getTestOrderReport({
      testOrderId,
      requesterDoctorId,
      requesterPatientId,
    });

    // Security Headers: Ensure no intermediary caches medical reports
    res.setHeader("Cache-Control", "private, no-cache, no-store, must-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
    res.setHeader("X-Content-Type-Options", "nosniff");

    // Return structured report metadata and content
    res.json({
      success: true,
      data: reportData,
    });
  })
);

export default router;
