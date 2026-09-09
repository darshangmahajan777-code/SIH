import MedicalHistory from "../models/MedicalHistory.js";
import Appointment from "../models/Appointment.js";
import { AppError } from "../middleware/errorHandler.js";

// ─────────────────────────────────────────────────────────────────────────────
// Self-Reported Entry
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Patient adds a self-reported medical history entry.
 * Only the patient themselves can call this — ownership is verified by the route.
 */
export async function addSelfReportedEntry({ patientId, condition, conditionDate, notes = "" }) {
  if (!patientId || !condition || !conditionDate) {
    throw new AppError("patientId, condition, and conditionDate are required", 400);
  }

  // Validate date format YYYY-MM-DD
  if (!/^\d{4}-\d{2}-\d{2}$/.test(conditionDate)) {
    throw new AppError("conditionDate must be in YYYY-MM-DD format", 400);
  }

  return MedicalHistory.create({
    patientId,
    condition: condition.trim(),
    conditionDate,
    notes: notes.trim(),
    source: "self_reported",
    doctorId: null,
    doctorName: null,
    appointmentId: null,
    isActive: true,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Doctor-Verified Entry (auto-created on appointment completion)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Creates a doctor-verified history entry when an appointment is completed.
 *
 * SECURITY:
 *   - doctorId and doctorName are sourced from the Appointment document,
 *     not from any user-supplied input. A doctor CANNOT fabricate another
 *     doctor's verified history.
 *   - Idempotent: the unique sparse index on appointmentId prevents duplicates.
 *   - If the appointment does not belong to the given doctor, the entry is
 *     still created with the appointment's actual doctor (not the requester).
 *
 * Called internally by scheduleService.updateAppointmentStatus — never exposed
 * as a user-callable API.
 */
export async function createDoctorVerifiedEntry({ appointmentId }) {
  if (!appointmentId) return null;

  // Load the appointment and its doctor to get authoritative data
  const appointment = await Appointment.findById(appointmentId)
    .populate("doctorId", "doctorName")
    .lean();

  if (!appointment) {
    console.warn(`[historyService] Appointment ${appointmentId} not found — skipping history entry`);
    return null;
  }

  if (appointment.status !== "completed") {
    // Guard: only completed appointments get a verified entry
    return null;
  }

  const condition =
    appointment.chiefComplaint && appointment.chiefComplaint.trim().length > 0
      ? appointment.chiefComplaint.trim()
      : "Consultation";

  const doctorName =
    appointment.doctorId?.doctorName ||
    "Attending Physician";

  try {
    const entry = await MedicalHistory.create({
      patientId: appointment.patientId,
      condition,
      conditionDate: appointment.date,
      notes: `Consultation completed. Doctor: ${doctorName}.`,
      source: "doctor_verified",
      doctorId: appointment.doctorId?._id || appointment.doctorId,
      doctorName,
      appointmentId: appointment._id,
      isActive: true,
    });
    return entry;
  } catch (err) {
    // Unique index violation = already created (idempotent)
    if (err.code === 11000) {
      console.info(`[historyService] History entry for appointment ${appointmentId} already exists — skipping`);
      return null;
    }
    console.warn(`[historyService] Failed to create doctor-verified entry:`, err.message);
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Timeline Queries
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns the full sorted timeline for a patient.
 * Only active entries are returned (soft-deleted entries are excluded).
 * Newest conditionDate first.
 *
 * Called AFTER access has already been verified (either patient self-access
 * or doctor access gated by requireConsent middleware).
 */
export async function getPatientTimeline(patientId) {
  if (!patientId) throw new AppError("patientId is required", 400);

  return MedicalHistory.find({ patientId, isActive: true })
    .sort({ conditionDate: -1, createdAt: -1 })
    .lean();
}

// ─────────────────────────────────────────────────────────────────────────────
// Patient Self-Managed Operations
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Patient soft-deletes a self-reported entry.
 *
 * Rules:
 *   - Only entries with source === "self_reported" can be deleted.
 *   - The patientId must match the entry owner (IDOR prevention).
 *   - Doctor-verified entries are immutable (clinical record integrity).
 */
export async function deleteEntry({ entryId, patientId }) {
  if (!entryId || !patientId) {
    throw new AppError("entryId and patientId are required", 400);
  }

  const entry = await MedicalHistory.findById(entryId);

  if (!entry) {
    throw new AppError("Medical history entry not found", 404);
  }

  // IDOR: ownership check
  if (entry.patientId.toString() !== patientId.toString()) {
    throw new AppError("Forbidden: You may only delete your own medical history entries", 403);
  }

  // Integrity: doctor-verified entries are immutable
  if (entry.source === "doctor_verified") {
    throw new AppError(
      "Doctor-verified entries cannot be deleted. They are part of your clinical record.",
      403
    );
  }

  entry.isActive = false;
  await entry.save();

  return entry;
}
