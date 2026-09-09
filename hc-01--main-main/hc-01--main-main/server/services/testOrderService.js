import TestOrder from "../models/TestOrder.js";
import DoctorProfile from "../models/DoctorProfile.js";
import Appointment from "../models/Appointment.js";
import { checkAccess, _writeAccessLog } from "./consentService.js";
import { AppError } from "../middleware/errorHandler.js";

/**
 * createTestOrder — Doctor orders a lab / diagnostic test
 *
 * @param {object} params
 * @param {string} params.patientId - Required patient ID
 * @param {string} params.doctorId  - Ordering doctor ID (Doctor A)
 * @param {string} [params.appointmentId] - Optional associated appointment
 * @param {string} [params.doctorName] - Optional override or resolved name
 * @param {string} params.testName  - Name of the test (e.g. "Complete Blood Count")
 * @param {string} params.reason    - Clinical indication for ordering
 */
export async function createTestOrder({
  patientId,
  doctorId,
  appointmentId = null,
  doctorName = null,
  testName,
  reason,
}) {
  if (!patientId || !doctorId || !testName || !reason) {
    throw new AppError("patientId, doctorId, testName, and reason are required", 400);
  }

  // Resolve doctorName for historical attribution if not supplied
  let resolvedDoctorName = doctorName;
  if (!resolvedDoctorName) {
    try {
      const docProfile = await DoctorProfile.findById(doctorId).lean();
      if (docProfile) {
        resolvedDoctorName = docProfile.doctorName || docProfile.name;
      } else if (appointmentId) {
        const apt = await Appointment.findById(appointmentId).populate("doctorId", "doctorName").lean();
        if (apt?.doctorId?.doctorName) {
          resolvedDoctorName = apt.doctorId.doctorName;
        }
      }
    } catch {
      // Fallback
    }
  }

  const order = await TestOrder.create({
    patientId,
    doctorId,
    appointmentId: appointmentId || null,
    doctorName: resolvedDoctorName || "Attending Doctor",
    testName: testName.trim(),
    reason: reason.trim(),
    status: "ordered",
    result: null,
    completedAt: null,
  });

  return order;
}

/**
 * recordTestResult — Patient or Lab completes test and stores structured results
 *
 * @param {object} params
 * @param {string} params.testOrderId
 * @param {object} params.result - Structured result
 * @param {string} params.result.value
 * @param {string} params.result.unit
 * @param {Date|string} [params.result.resultDate]
 * @param {string} params.result.labName
 * @param {string} [params.result.notes]
 * @param {object} [params.result.reportFile] - Optional secure report attachment
 * @param {string} [params.status="completed"]
 */
export async function recordTestResult({
  testOrderId,
  result,
  status = "completed",
}) {
  if (!testOrderId) {
    throw new AppError("testOrderId is required", 400);
  }
  if (!result || typeof result !== "object") {
    throw new AppError("Structured result object is required", 400);
  }

  const testOrder = await TestOrder.findById(testOrderId);
  if (!testOrder) {
    throw new AppError("Test order not found", 404);
  }

  const resultDate = result.resultDate ? new Date(result.resultDate) : new Date();

  // Populate structured result
  testOrder.result = {
    value: result.value !== undefined ? String(result.value).trim() : null,
    unit: result.unit !== undefined ? String(result.unit).trim() : null,
    resultDate,
    labName: result.labName ? String(result.labName).trim() : "Central Diagnostic Laboratory",
    notes: result.notes ? String(result.notes).trim() : "",
    reportFile: result.reportFile || {
      fileId: `rep-${Date.now()}`,
      fileName: `${testOrder.testName.toLowerCase().replace(/[^a-z0-9]/g, "_")}_report.pdf`,
      mimeType: "application/pdf",
      fileSize: 1024,
      content: null,
    },
  };

  testOrder.status = status;
  testOrder.completedAt = new Date();

  await testOrder.save();
  return testOrder;
}

/**
 * getPatientTestOrders — Retrieves test records for a patient
 *
 * Security:
 *  - If requested by patient: verifies requester is data owner.
 *  - If requested by doctor: verifies active non-revoked AccessGrant exists.
 *  - Every authorized doctor read writes an AccessLog entry.
 *
 * @param {object} params
 * @param {string} params.patientId - Patient whose records are being accessed
 * @param {string} [params.requesterDoctorId] - Identity of requesting doctor
 * @param {string} [params.requesterPatientId] - Identity of requesting patient
 * @param {string} [params.appointmentId] - For appointment-scoped grants
 */
export async function getPatientTestOrders({
  patientId,
  requesterDoctorId = null,
  requesterPatientId = null,
  appointmentId = null,
}) {
  if (!patientId) {
    throw new AppError("patientId is required", 400);
  }

  // 1. Patient Self-Access (Data Ownership)
  if (requesterPatientId) {
    if (requesterPatientId.toString() !== patientId.toString()) {
      throw new AppError("Forbidden: You may only access your own lab/test records", 403);
    }
  } else if (requesterDoctorId) {
    // 2. Doctor Access (Consent-Gated)
    const grant = await checkAccess({
      doctorId: requesterDoctorId,
      patientId,
      appointmentId,
    });

    if (!grant) {
      throw new AppError(
        "Access denied. Patient has not granted you access to lab/test records, or the grant has been revoked.",
        403
      );
    }

    // Write audit log (fire-and-forget)
    _writeAccessLog({
      patientId,
      doctorId: requesterDoctorId,
      resource: "test_results",
      action: "read",
      grantId: grant._id,
    }).catch((err) => console.warn("[testOrderService] Audit log write failed:", err.message));
  } else {
    throw new AppError("Authentication required: requesting identity not provided", 401);
  }

  // Return test orders, newest first
  const orders = await TestOrder.find({ patientId })
    .sort({ createdAt: -1 })
    .lean();

  return orders;
}

/**
 * getTestOrderReport — Secure, authenticated access to medical report file
 *
 * Security:
 *  - Medical files are NEVER publicly accessible.
 *  - Requester must be either:
 *      a) The patient who owns the test order
 *      b) An authorized doctor with active consent grant
 *  - Access is logged in AccessLog.
 *
 * @param {object} params
 * @param {string} params.testOrderId
 * @param {string} [params.requesterDoctorId]
 * @param {string} [params.requesterPatientId]
 */
export async function getTestOrderReport({
  testOrderId,
  requesterDoctorId = null,
  requesterPatientId = null,
}) {
  if (!testOrderId) {
    throw new AppError("testOrderId is required", 400);
  }

  const testOrder = await TestOrder.findById(testOrderId).lean();
  if (!testOrder) {
    throw new AppError("Test order not found", 404);
  }

  const patientId = testOrder.patientId.toString();

  // Authorization check
  if (requesterPatientId) {
    if (requesterPatientId.toString() !== patientId) {
      throw new AppError("Forbidden: You may only access your own medical reports", 403);
    }
  } else if (requesterDoctorId) {
    const grant = await checkAccess({
      doctorId: requesterDoctorId,
      patientId,
    });

    if (!grant) {
      throw new AppError(
        "Access denied. Patient has not granted you access to view this medical report.",
        403
      );
    }

    // Write audit log
    _writeAccessLog({
      patientId,
      doctorId: requesterDoctorId,
      resource: "test_results",
      resourceId: testOrderId,
      action: "read_report",
      grantId: grant._id,
    }).catch((err) => console.warn("[testOrderService] Audit log write failed:", err.message));
  } else {
    throw new AppError("Authentication required: no user identity found", 401);
  }

  if (!testOrder.result?.reportFile?.fileName) {
    throw new AppError("No medical report file is attached to this test order", 404);
  }

  return {
    testOrderId: testOrder._id,
    testName: testOrder.testName,
    orderedBy: testOrder.doctorName,
    patientId: testOrder.patientId,
    completedAt: testOrder.completedAt,
    result: testOrder.result,
    reportFile: testOrder.result.reportFile,
  };
}
