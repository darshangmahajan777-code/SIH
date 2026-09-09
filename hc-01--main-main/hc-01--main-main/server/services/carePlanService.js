import CarePlan from "../models/CarePlan.js";
import DoctorProfile from "../models/DoctorProfile.js";
import Appointment from "../models/Appointment.js";
import { checkAccess, _writeAccessLog } from "./consentService.js";
import { AppError } from "../middleware/errorHandler.js";

function parseList(input) {
  if (Array.isArray(input)) {
    return input.map((item) => String(item).trim()).filter(Boolean);
  }
  if (typeof input === "string") {
    return input
      .split(/[\n,;]+/)
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return [];
}

/**
 * Format care plan into structured DO, AVOID, and FOLLOW-UP guidance
 */
export function formatStructuredCarePlan(plan) {
  const doc = plan.toObject ? plan.toObject() : plan;
  return {
    id: doc._id,
    appointmentId: doc.appointmentId || null,
    patientId: doc.patientId,
    doctorId: doc.doctorId,
    doctorName: doc.doctorName,
    diagnosis: doc.diagnosis,
    status: doc.status,
    source: doc.source || "doctor_issued",
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
    // Structured guidance blocks for patient presentation
    DO: {
      title: "Recommended Actions & Nutrition",
      diet: doc.dietRecommended || [],
      activities: doc.activitiesRecommended || [],
    },
    AVOID: {
      title: "Restricted Items & Activities",
      diet: doc.dietRestricted || [],
      activities: doc.activitiesRestricted || [],
    },
    FOLLOW_UP: {
      title: "Next Review & Clinician Notes",
      followUpDate: doc.followUpDate || null,
      notes: doc.notes || "",
      attendingDoctor: doc.doctorName,
      diagnosisContext: doc.diagnosis,
    },
  };
}

/**
 * createCarePlan — Doctor issues a care plan from appointment consultation
 */
export async function createCarePlan({
  appointmentId = null,
  patientId,
  doctorId,
  doctorName = null,
  diagnosis,
  dietRecommended = [],
  dietRestricted = [],
  activitiesRecommended = [],
  activitiesRestricted = [],
  followUpDate = null,
  notes = "",
}) {
  if (!patientId || !doctorId || !diagnosis) {
    throw new AppError("patientId, doctorId, and diagnosis are required", 400);
  }

  // Resolve clinician name if not provided
  let resolvedDoctorName = doctorName;
  if (!resolvedDoctorName) {
    try {
      const profile = await DoctorProfile.findById(doctorId).lean();
      if (profile?.doctorName) {
        resolvedDoctorName = profile.doctorName;
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

  const carePlan = await CarePlan.create({
    patientId,
    doctorId,
    doctorName: resolvedDoctorName || "Attending Doctor",
    appointmentId: appointmentId || null,
    diagnosis: diagnosis.trim(),
    dietRecommended: parseList(dietRecommended),
    dietRestricted: parseList(dietRestricted),
    activitiesRecommended: parseList(activitiesRecommended),
    activitiesRestricted: parseList(activitiesRestricted),
    followUpDate: followUpDate ? new Date(followUpDate) : null,
    notes: notes ? notes.trim() : "",
    status: "active",
    source: "doctor_issued",
  });

  return formatStructuredCarePlan(carePlan);
}

/**
 * getPatientCarePlans — Retrieves care plans for a patient
 *
 * Security:
 *  - Patient viewing own data: allowed (Patient owns data).
 *  - Doctor viewing patient data: REQUIRES active AccessGrant.
 *  - Authorized doctor access writes an AccessLog entry with resource="care_plans".
 */
export async function getPatientCarePlans({
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
      throw new AppError("Forbidden: You may only access your own care plans", 403);
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
        "Access denied. Patient has not granted you access to care plans, or the grant has been revoked.",
        403
      );
    }

    // Write audit log entry (fire-and-forget)
    _writeAccessLog({
      patientId,
      doctorId: requesterDoctorId,
      resource: "care_plans",
      action: "read",
      grantId: grant._id,
    }).catch((err) => console.warn("[carePlanService] Audit log write failed:", err.message));
  } else {
    throw new AppError("Authentication required: no user identity found in request", 401);
  }

  const plans = await CarePlan.find({ patientId })
    .sort({ createdAt: -1 })
    .lean();

  return plans.map(formatStructuredCarePlan);
}

/**
 * getCarePlanByAppointment — Retrieves care plan for a specific consultation
 */
export async function getCarePlanByAppointment({
  appointmentId,
  requesterDoctorId = null,
  requesterPatientId = null,
}) {
  if (!appointmentId) {
    throw new AppError("appointmentId is required", 400);
  }

  const plan = await CarePlan.findOne({ appointmentId }).lean();
  if (!plan) {
    return null;
  }

  const patientId = plan.patientId.toString();

  if (requesterPatientId) {
    if (requesterPatientId.toString() !== patientId) {
      throw new AppError("Forbidden: You may only access your own care plans", 403);
    }
  } else if (requesterDoctorId) {
    const grant = await checkAccess({
      doctorId: requesterDoctorId,
      patientId,
      appointmentId,
    });
    if (!grant) {
      throw new AppError("Access denied. Patient has not granted access to this care plan.", 403);
    }
  }

  return formatStructuredCarePlan(plan);
}

/**
 * updateCarePlanStatus — Update care plan status (active, completed, superseded, discontinued)
 */
export async function updateCarePlanStatus({ carePlanId, status }) {
  if (!carePlanId || !status) {
    throw new AppError("carePlanId and status are required", 400);
  }

  const plan = await CarePlan.findById(carePlanId);
  if (!plan) {
    throw new AppError("Care plan not found", 404);
  }

  plan.status = status;
  await plan.save();
  return formatStructuredCarePlan(plan);
}
