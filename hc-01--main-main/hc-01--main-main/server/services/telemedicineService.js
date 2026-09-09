import crypto from "crypto";
import Appointment from "../models/Appointment.js";
import DoctorProfile from "../models/DoctorProfile.js";
import User from "../models/User.js";
import { AppError } from "../middleware/errorHandler.js";

const TELEMEDICINE_SECRET = process.env.JWT_SECRET || "telemedicine-sih-secret-key-2026";

/**
 * Generates an HMAC-signed session token for a verified consultation participant
 */
export function generateSessionToken({ appointmentId, userId, role }) {
  const payload = {
    appointmentId: String(appointmentId),
    userId: String(userId),
    role: String(role),
    roomId: `telemedicine:apt:${appointmentId}`,
    expiresAt: Date.now() + 2 * 60 * 60 * 1000, // 2 hours validity
  };

  const payloadStr = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = crypto
    .createHmac("sha256", TELEMEDICINE_SECRET)
    .update(payloadStr)
    .digest("base64url");

  return `${payloadStr}.${signature}`;
}

/**
 * Validates a session token and returns the verified payload
 */
export function validateSessionToken(token) {
  if (!token || typeof token !== "string" || !token.includes(".")) {
    return null;
  }

  const [payloadStr, signature] = token.split(".");
  if (!payloadStr || !signature) return null;

  const expectedSig = crypto
    .createHmac("sha256", TELEMEDICINE_SECRET)
    .update(payloadStr)
    .digest("base64url");

  const sigBuf = Buffer.from(signature);
  const expectedSigBuf = Buffer.from(expectedSig);
  if (sigBuf.length !== expectedSigBuf.length || !crypto.timingSafeEqual(sigBuf, expectedSigBuf)) {
    return null;
  }

  try {
    const payload = JSON.parse(Buffer.from(payloadStr, "base64url").toString("utf8"));
    if (Date.now() > payload.expiresAt) {
      return null; // Expired
    }
    return payload;
  } catch {
    return null;
  }
}

/**
 * verifyTelemedicineAccess
 *
 * Strict Security Guard:
 *  - Verifies that the appointment exists and is not cancelled.
 *  - Verifies that mode === "video".
 *  - Verifies that the requester is EITHER the designated patient OR doctor.
 *  - Returns a verified session token and room metadata.
 */
export async function verifyTelemedicineAccess({ appointmentId, userId, role }) {
  if (!appointmentId) {
    throw new AppError("appointmentId is required", 400);
  }
  if (!userId) {
    throw new AppError("userId is required to verify consultation ownership", 401);
  }
  if (!role || !["doctor", "patient"].includes(role)) {
    throw new AppError("role must be 'doctor' or 'patient'", 400);
  }

  const appointment = await Appointment.findById(appointmentId)
    .populate("doctorId", "doctorName specialty hospitalName")
    .populate("patientId", "name email phone")
    .lean();

  if (!appointment) {
    throw new AppError("Appointment not found", 404);
  }

  if (appointment.status === "cancelled") {
    throw new AppError("This consultation has been cancelled and cannot be joined", 400);
  }

  if (appointment.mode !== "video") {
    throw new AppError("This appointment is scheduled for in-person consultation, not video", 400);
  }

  // Security Verification: Check exact participant ownership
  const targetPatientId =
    appointment.patientId?._id?.toString() || appointment.patientId?.toString();
  const targetDoctorId =
    appointment.doctorId?._id?.toString() || appointment.doctorId?.toString();
  const reqUserId = String(userId);

  if (role === "patient") {
    if (reqUserId !== targetPatientId) {
      throw new AppError(
        "Access denied. You are not the scheduled patient for this consultation.",
        403
      );
    }
  } else if (role === "doctor") {
    if (reqUserId !== targetDoctorId) {
      throw new AppError(
        "Access denied. You are not the attending doctor assigned to this consultation.",
        403
      );
    }
  }

  const sessionToken = generateSessionToken({
    appointmentId,
    userId: reqUserId,
    role,
  });

  return {
    authorized: true,
    sessionToken,
    roomId: `telemedicine:apt:${appointmentId}`,
    appointment: {
      id: appointment._id,
      patientId: (appointment.patientId?._id || appointment.patientId)?.toString(),
      doctorId: (appointment.doctorId?._id || appointment.doctorId)?.toString(),
      date: appointment.date,
      slotTime: appointment.slotTime,
      mode: appointment.mode,
      status: appointment.status,
      priority: appointment.priority,
      chiefComplaint: appointment.chiefComplaint || "",
      patientName: appointment.patientId?.name || "Patient",
      patientPhone: appointment.patientId?.phone || "",
      doctorName: appointment.doctorId?.doctorName || "Attending Doctor",
      doctorSpecialty: appointment.doctorId?.specialty || "General Medicine",
    },
    participant: {
      userId: reqUserId,
      role,
    },
  };
}

/**
 * completeTelemedicineConsultation
 *
 * Doctor completes the video consultation:
 *  - Updates appointment status to "completed"
 *  - Auto-creates doctor-verified medical history entry
 */
export async function completeTelemedicineConsultation({ appointmentId, doctorId }) {
  if (!appointmentId || !doctorId) {
    throw new AppError("appointmentId and doctorId are required", 400);
  }

  const appointment = await Appointment.findById(appointmentId);
  if (!appointment) {
    throw new AppError("Appointment not found", 404);
  }

  const assignedDocId = appointment.doctorId?.toString();
  if (assignedDocId !== String(doctorId)) {
    throw new AppError("Forbidden: Only the attending doctor may complete this visit", 403);
  }

  appointment.status = "completed";
  await appointment.save();

  // Create doctor-verified medical history entry
  try {
    const { createDoctorVerifiedEntry } = await import("./historyService.js");
    await createDoctorVerifiedEntry(appointmentId);
  } catch (err) {
    console.warn("[Telemedicine] Auto-create history entry failed:", err.message);
  }

  return appointment;
}
