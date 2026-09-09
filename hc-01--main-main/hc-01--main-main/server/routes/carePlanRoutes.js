import express from "express";
import { asyncHandler, AppError } from "../middleware/errorHandler.js";
import {
  createCarePlan,
  getPatientCarePlans,
  getCarePlanByAppointment,
  updateCarePlanStatus,
} from "../services/carePlanService.js";

const router = express.Router();

/**
 * POST /api/care-plans
 * Doctor issues a care plan from appointment details
 *
 * Body: {
 *   appointmentId?,
 *   patientId,
 *   doctorId?,
 *   doctorName?,
 *   diagnosis,
 *   dietRecommended,
 *   dietRestricted,
 *   activitiesRecommended,
 *   activitiesRestricted,
 *   followUpDate?,
 *   notes?
 * }
 */
router.post(
  "/",
  asyncHandler(async (req, res) => {
    const doctorId =
      req.body.doctorId ||
      req.headers["x-doctor-id"] ||
      req.user?._id?.toString() ||
      req.user?.id?.toString();

    const {
      appointmentId,
      patientId,
      doctorName,
      diagnosis,
      dietRecommended,
      dietRestricted,
      activitiesRecommended,
      activitiesRestricted,
      followUpDate,
      notes,
    } = req.body;

    if (!doctorId) {
      throw new AppError("doctorId is required", 400);
    }
    if (!patientId) {
      throw new AppError("patientId is required", 400);
    }
    if (!diagnosis) {
      throw new AppError("diagnosis / clinical context is required", 400);
    }

    const carePlan = await createCarePlan({
      appointmentId,
      patientId,
      doctorId,
      doctorName,
      diagnosis,
      dietRecommended,
      dietRestricted,
      activitiesRecommended,
      activitiesRestricted,
      followUpDate,
      notes,
    });

    // Notify patient
    import("../services/notificationService.js")
      .then(({ createNotification }) => {
        createNotification({
          recipient: patientId,
          type: "care_plan",
          title: "New Doctor Care Plan",
          message: `Dr. ${doctorName || "Attending Clinician"} has issued your personalized care plan for ${diagnosis}.`,
          metadata: { carePlanId: carePlan._id, appointmentId },
        }).catch(() => {});

        if (followUpDate) {
          createNotification({
            recipient: patientId,
            type: "follow_up",
            title: "Follow-Up Consultation Scheduled",
            message: `Your recommended clinical follow-up is scheduled for ${followUpDate}.`,
            metadata: { carePlanId: carePlan._id, followUpDate },
          }).catch(() => {});
        }
      })
      .catch(() => {});

    res.status(201).json({
      success: true,
      message: "Doctor care plan created successfully.",
      data: carePlan,
    });
  })
);

/**
 * GET /api/care-plans/patient/:patientId
 * View patient care plans
 *
 * Security:
 *  - Patient viewing own data: allowed (data owner).
 *  - Doctor viewing patient data: requires active AccessGrant (returns 403 if not granted/revoked).
 *  - All doctor reads write to AccessLog.
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

    const plans = await getPatientCarePlans({
      patientId,
      requesterDoctorId,
      requesterPatientId,
      appointmentId,
    });

    res.json({
      success: true,
      count: plans.length,
      data: plans,
    });
  })
);

/**
 * GET /api/care-plans/appointment/:appointmentId
 * View care plan linked to a specific consultation
 */
router.get(
  "/appointment/:appointmentId",
  asyncHandler(async (req, res) => {
    const { appointmentId } = req.params;

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

    const plan = await getCarePlanByAppointment({
      appointmentId,
      requesterDoctorId,
      requesterPatientId,
    });

    if (!plan) {
      return res.status(404).json({
        success: false,
        message: "No care plan found for this appointment.",
      });
    }

    res.json({
      success: true,
      data: plan,
    });
  })
);

/**
 * PATCH /api/care-plans/:id/status
 * Update care plan status
 */
router.patch(
  "/:id/status",
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { status } = req.body;

    if (!status) {
      throw new AppError("status is required", 400);
    }

    const updated = await updateCarePlanStatus({
      carePlanId: id,
      status,
    });

    res.json({
      success: true,
      message: "Care plan status updated successfully.",
      data: updated,
    });
  })
);

export default router;
