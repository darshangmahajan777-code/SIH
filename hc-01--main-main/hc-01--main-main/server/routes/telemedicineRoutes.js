import express from "express";
import { asyncHandler, AppError } from "../middleware/errorHandler.js";
import {
  verifyTelemedicineAccess,
  completeTelemedicineConsultation,
} from "../services/telemedicineService.js";

const router = express.Router();

/**
 * POST /api/telemedicine/session
 * Authorize a participant (doctor or patient) to enter an appointment video consultation
 *
 * Security:
 *  - Verifies that the appointment exists and is in "video" mode.
 *  - Verifies that the user is the specific patient or doctor of this appointment.
 *  - Issues an HMAC-signed session token for the appointment room.
 *
 * Body: { appointmentId, userId?, role? }
 * Headers: x-doctor-id or x-patient-id
 */
router.post(
  "/session",
  asyncHandler(async (req, res) => {
    const { appointmentId } = req.body;

    const doctorHeader = req.headers["x-doctor-id"];
    const patientHeader = req.headers["x-patient-id"];

    let role = req.body.role;
    let userId = req.body.userId;

    if (!role) {
      if (doctorHeader) {
        role = "doctor";
        userId = doctorHeader;
      } else if (patientHeader) {
        role = "patient";
        userId = patientHeader;
      } else if (req.user) {
        role = req.user.role === "doctor" ? "doctor" : "patient";
        userId = req.user._id?.toString() || req.user.id?.toString();
      }
    }

    if (!userId) {
      throw new AppError("Authentication required: no user identity found in request", 401);
    }
    if (!role) {
      role = "patient"; // default role if ambiguous
    }

    const sessionData = await verifyTelemedicineAccess({
      appointmentId,
      userId,
      role,
    });

    // Notify patient that doctor is in the video room
    if (role === 'doctor' && sessionData.appointment?.patientId) {
      import('../services/notificationService.js')
        .then(({ createNotification }) => {
          createNotification({
            recipient: sessionData.appointment.patientId,
            type: 'video_ready',
            title: 'Video Consultation Ready',
            message: `Dr. ${sessionData.appointment.doctorName || 'Doctor'} has started your video consultation. Click to join.`,
            metadata: {
              appointmentId,
              roomId: sessionData.roomId,
            },
          }).catch(() => {});
        })
        .catch(() => {});
    }

    res.json({
      success: true,
      data: sessionData,
    });
  })
);

/**
 * POST /api/telemedicine/complete
 * Doctor marks the video consultation completed
 *
 * Body: { appointmentId, doctorId? }
 * Header: x-doctor-id
 */
router.post(
  "/complete",
  asyncHandler(async (req, res) => {
    const { appointmentId } = req.body;
    const doctorId =
      req.body.doctorId ||
      req.headers["x-doctor-id"] ||
      req.user?._id?.toString() ||
      req.user?.id?.toString();

    if (!doctorId) {
      throw new AppError("doctorId is required to complete consultation", 401);
    }

    const updated = await completeTelemedicineConsultation({
      appointmentId,
      doctorId,
    });

    res.json({
      success: true,
      message: "Consultation marked as completed.",
      data: updated,
    });
  })
);

export default router;
