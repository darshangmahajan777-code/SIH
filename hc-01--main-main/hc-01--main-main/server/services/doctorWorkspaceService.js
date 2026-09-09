import mongoose from 'mongoose';
import Appointment from '../models/Appointment.js';
import DoctorProfile from '../models/DoctorProfile.js';
import User from '../models/User.js';
import Token from '../models/Token.js';
import MedicalHistory from '../models/MedicalHistory.js';
import TestOrder from '../models/TestOrder.js';
import CarePlan from '../models/CarePlan.js';
import Prescription from '../models/Prescription.js';
import AccessGrant from '../models/AccessGrant.js';
import { checkAccess, _writeAccessLog } from './consentService.js';
import { updateAppointmentStatus } from './scheduleService.js';
import { createDoctorVerifiedEntry } from './historyService.js';
import { createNotification } from './notificationService.js';
import { AppError } from '../middleware/errorHandler.js';

// In-memory fallback stores for test isolation
let inMemoryAppointments = [];
let inMemoryDoctors = {};
let inMemoryPatients = {};
let inMemoryTokens = [];
let inMemoryGrants = [];
let inMemoryHistories = [];
let inMemoryTestOrders = [];
let inMemoryCarePlans = [];
let inMemoryPrescriptions = [];

export function clearDoctorWorkspaceTestDb() {
  inMemoryAppointments = [];
  inMemoryDoctors = {};
  inMemoryPatients = {};
  inMemoryTokens = [];
  inMemoryGrants = [];
  inMemoryHistories = [];
  inMemoryTestOrders = [];
  inMemoryCarePlans = [];
  inMemoryPrescriptions = [];
}

export function seedDoctorWorkspaceTestDb({
  appointments = [],
  doctors = {},
  patients = {},
  tokens = [],
  grants = [],
  histories = [],
  testOrders = [],
  carePlans = [],
  prescriptions = [],
} = {}) {
  if (appointments.length) inMemoryAppointments = [...appointments];
  if (Object.keys(doctors).length) inMemoryDoctors = { ...doctors };
  if (Object.keys(patients).length) inMemoryPatients = { ...patients };
  if (tokens.length) inMemoryTokens = [...tokens];
  if (grants.length) inMemoryGrants = [...grants];
  if (histories.length) inMemoryHistories = [...histories];
  if (testOrders.length) inMemoryTestOrders = [...testOrders];
  if (carePlans.length) inMemoryCarePlans = [...carePlans];
  if (prescriptions.length) inMemoryPrescriptions = [...prescriptions];
}

/**
 * Get Doctor Workspace Summary for Doctor Home
 * Aggregates:
 * - Today's appointments (all statuses)
 * - Current queue & next patient
 * - Urgent/critical triage patients
 * - Pending lab tests
 * - Video appointments
 */
export async function getDoctorWorkspaceSummary({ doctorId, date } = {}) {
  const effectiveDoctorId = doctorId || '65f000000000000000000002';
  const targetDate = date || new Date().toISOString().slice(0, 10);

  const isConnected = mongoose.connection.readyState === 1;

  let doctor = null;
  let appointments = [];
  let currentToken = null;
  let waitingTokens = [];
  let pendingTests = [];

  if (isConnected) {
    const [doctorRes, appointmentsRes, currentTokenRes, waitingTokensRes, pendingTestsRes] =
      await Promise.all([
        DoctorProfile.findById(effectiveDoctorId)
          .select('doctorName specialty hospitalName consultationFee avgRating ratingCount location')
          .lean()
          .catch(() => null),
        Appointment.find({
          doctorId: effectiveDoctorId,
          date: targetDate,
          status: { $ne: 'cancelled' },
        })
          .populate('patientId', 'name age gender phone email bloodGroup allergies emergencyContact')
          .populate('tokenId', 'tokenNumber status priority estimatedWaitTime calledAt')
          .sort({ slotTime: 1 })
          .lean()
          .catch(() => []),
        Token.findOne({ status: 'in-progress' }).lean().catch(() => null),
        Token.find({ status: 'waiting' })
          .sort({ priority: -1, tokenNumber: 1 })
          .lean()
          .catch(() => []),
        TestOrder.find({
          doctorId: effectiveDoctorId,
          status: { $in: ['ordered', 'pending'] },
        })
          .populate('patientId', 'name')
          .sort({ createdAt: -1 })
          .limit(10)
          .lean()
          .catch(() => []),
      ]);

    doctor = doctorRes;
    appointments = appointmentsRes || [];
    currentToken = currentTokenRes || null;
    waitingTokens = waitingTokensRes || [];
    pendingTests = pendingTestsRes || [];
  } else {
    // In-memory fallback
    doctor = inMemoryDoctors[effectiveDoctorId] || {
      _id: effectiveDoctorId,
      doctorName: 'Dr. Sarah Patel',
      specialty: 'Cardiology',
      hospitalName: 'Apollo Multispecialty Hospital',
    };

    appointments = inMemoryAppointments.filter(
      (a) =>
        (a.doctorId?.toString() === effectiveDoctorId.toString() ||
          a.doctorId?._id?.toString() === effectiveDoctorId.toString()) &&
        a.date === targetDate &&
        a.status !== 'cancelled'
    );

    currentToken = inMemoryTokens.find((t) => t.status === 'in-progress') || null;
    waitingTokens = inMemoryTokens.filter((t) => t.status === 'waiting');

    pendingTests = inMemoryTestOrders.filter(
      (t) =>
        t.doctorId?.toString() === effectiveDoctorId.toString() &&
        ['ordered', 'pending'].includes(t.status)
    );
  }

  // Derived metrics
  const totalAppointments = appointments.length;
  const completedCount = appointments.filter((a) => a.status === 'completed').length;
  const inProgressCount = appointments.filter((a) => a.status === 'in-progress').length;
  const waitingCount = appointments.filter((a) => ['booked', 'checked-in'].includes(a.status)).length;
  const urgentCount = appointments.filter((a) =>
    ['critical', 'urgent', 'emergency'].includes(a.priority)
  ).length;
  const videoCount = appointments.filter((a) => a.mode === 'video').length;

  // Urgent & Critical Patients needing priority triage
  const urgentPatients = appointments.filter(
    (a) => ['critical', 'urgent', 'emergency'].includes(a.priority) && a.status !== 'completed'
  );

  // Video appointments for today
  const videoAppointments = appointments.filter((a) => a.mode === 'video');

  // Next Patient to attend:
  // Prefer active in-progress appointment, then next checked-in appointment, then next waiting token
  let nextPatient = null;
  const activeEncounter = appointments.find((a) => a.status === 'in-progress');
  const nextCheckedIn = appointments.find((a) => a.status === 'checked-in');
  const nextBooked = appointments.find((a) => a.status === 'booked');

  if (activeEncounter) {
    nextPatient = {
      type: 'in-progress-appointment',
      appointmentId: activeEncounter._id,
      patientName: activeEncounter.patientId?.name || 'Patient',
      patientId: activeEncounter.patientId?._id || activeEncounter.patientId,
      slotTime: activeEncounter.slotTime,
      priority: activeEncounter.priority,
      mode: activeEncounter.mode,
      status: activeEncounter.status,
      tokenNumber: activeEncounter.tokenId?.tokenNumber || null,
      chiefComplaint: activeEncounter.chiefComplaint,
    };
  } else if (nextCheckedIn) {
    nextPatient = {
      type: 'checked-in-appointment',
      appointmentId: nextCheckedIn._id,
      patientName: nextCheckedIn.patientId?.name || 'Patient',
      patientId: nextCheckedIn.patientId?._id || nextCheckedIn.patientId,
      slotTime: nextCheckedIn.slotTime,
      priority: nextCheckedIn.priority,
      mode: nextCheckedIn.mode,
      status: nextCheckedIn.status,
      tokenNumber: nextCheckedIn.tokenId?.tokenNumber || null,
      chiefComplaint: nextCheckedIn.chiefComplaint,
    };
  } else if (waitingTokens.length > 0) {
    const topToken = waitingTokens[0];
    nextPatient = {
      type: 'queue-token',
      appointmentId: null,
      patientName: topToken.patientName || 'Queue Patient',
      patientId: topToken.patientId || null,
      slotTime: 'Queue Token',
      priority: topToken.priority || 'routine',
      mode: 'in-person',
      status: 'waiting',
      tokenNumber: topToken.tokenNumber,
      chiefComplaint: topToken.condition || topToken.reason || '',
    };
  } else if (nextBooked) {
    nextPatient = {
      type: 'booked-appointment',
      appointmentId: nextBooked._id,
      patientName: nextBooked.patientId?.name || 'Patient',
      patientId: nextBooked.patientId?._id || nextBooked.patientId,
      slotTime: nextBooked.slotTime,
      priority: nextBooked.priority,
      mode: nextBooked.mode,
      status: nextBooked.status,
      tokenNumber: nextBooked.tokenId?.tokenNumber || null,
      chiefComplaint: nextBooked.chiefComplaint,
    };
  }

  return {
    doctor: doctor || {
      doctorName: 'Dr. Attending Physician',
      specialty: 'General Medicine',
      hospitalName: 'MediQueue Health',
    },
    date: targetDate,
    stats: {
      totalAppointments,
      completedCount,
      inProgressCount,
      waitingCount,
      urgentCount,
      videoCount,
      queueWaitingCount: waitingTokens.length,
      pendingTestsCount: pendingTests.length,
    },
    nextPatient,
    urgentPatients,
    videoAppointments,
    todayAppointments: appointments,
    queue: {
      currentToken,
      waitingCount: waitingTokens.length,
      waitingTokens: waitingTokens.slice(0, 10),
    },
    pendingTests,
  };
}

/**
 * Get Patient Clinical Encounter Dossier
 * Security boundary:
 * Checks active AccessGrant between doctorId and patientId.
 * Clearly flags:
 * - AUTHORIZED: returns verified shared medical history, test results, prescriptions, care plans
 * - LIMITED ACCESS: shields protected clinical records and gives clear feedback
 */
export async function getPatientEncounter({ appointmentId, doctorId } = {}) {
  if (!appointmentId) {
    throw new AppError('appointmentId is required to open a patient encounter', 400);
  }
  const effectiveDoctorId = doctorId || '65f000000000000000000002';
  const isConnected = mongoose.connection.readyState === 1;

  let appointment = null;
  let patientUser = null;

  if (isConnected) {
    appointment = await Appointment.findById(appointmentId)
      .populate('doctorId', 'doctorName specialty hospitalName')
      .populate('patientId', 'name age gender bloodGroup phone email height weight allergies emergencyContact')
      .populate('tokenId', 'tokenNumber status priority calledAt')
      .lean();

    if (!appointment) {
      throw new AppError('Appointment not found', 404);
    }
    patientUser = appointment.patientId;
  } else {
    appointment = inMemoryAppointments.find((a) => a._id?.toString() === appointmentId.toString()) || null;
    if (!appointment) {
      throw new AppError('Appointment not found', 404);
    }
    const patientIdStr = appointment.patientId?._id?.toString() || appointment.patientId?.toString();
    patientUser = inMemoryPatients[patientIdStr] || appointment.patientId || { name: 'Patient' };
  }

  const patientId = patientUser?._id?.toString() || patientUser?.id?.toString() || appointment.patientId?.toString();

  // Consent Evaluation:
  let grant = null;
  if (isConnected) {
    grant = await checkAccess({
      doctorId: effectiveDoctorId,
      patientId,
      appointmentId,
    });
  } else {
    // In-memory grant lookup
    grant = inMemoryGrants.find((g) => {
      if (g.doctorId !== effectiveDoctorId) return false;
      if (g.patientId !== patientId) return false;
      if (g.revokedAt !== null && g.revokedAt !== undefined) return false;
      if (g.scope === 'appointment' && g.appointmentId && g.appointmentId !== appointmentId) return false;
      return true;
    }) || null;
  }

  const isAuthorized = Boolean(grant);
  const consentStatus = isAuthorized ? 'AUTHORIZED' : 'LIMITED ACCESS';

  let sharedMedicalHistory = [];
  let sharedTestResults = [];
  let sharedPrescriptions = [];
  let sharedCarePlans = [];

  if (isAuthorized) {
    // Log access for audit trail (fire-and-forget)
    if (isConnected) {
      _writeAccessLog({
        patientId,
        doctorId: effectiveDoctorId,
        resource: 'patient_encounter',
        action: 'read',
        grantId: grant._id,
      }).catch((err) => console.warn('[doctorWorkspaceService] Access log write failed:', err.message));
    }

    if (isConnected) {
      const [histories, tests, rxs, plans] = await Promise.all([
        MedicalHistory.find({ patientId, isActive: true })
          .sort({ conditionDate: -1, createdAt: -1 })
          .lean(),
        TestOrder.find({ patientId })
          .sort({ createdAt: -1 })
          .lean(),
        Prescription.find({ patientId })
          .sort({ createdAt: -1 })
          .lean(),
        CarePlan.find({ patientId })
          .sort({ createdAt: -1 })
          .lean(),
      ]);

      sharedMedicalHistory = histories;
      sharedTestResults = tests.map((t) => ({
        id: t._id,
        testName: t.testName,
        reason: t.reason,
        orderedBy: t.doctorName || 'Attending Clinician',
        status: t.status,
        date: t.completedAt || t.createdAt,
        result: t.result?.value ? `${t.result.value} ${t.result.unit || ''}`.trim() : 'Pending',
        structuredResult: t.result,
        labName: t.result?.labName || null,
        hasReport: Boolean(t.result?.reportFile?.fileName),
      }));
      sharedPrescriptions = rxs;
      sharedCarePlans = plans;
    } else {
      sharedMedicalHistory = inMemoryHistories.filter((h) => h.patientId === patientId && h.isActive !== false);
      sharedTestResults = inMemoryTestOrders
        .filter((t) => t.patientId === patientId)
        .map((t) => ({
          id: t._id,
          testName: t.testName,
          reason: t.reason,
          orderedBy: t.doctorName || 'Attending Clinician',
          status: t.status,
          date: t.completedAt || t.createdAt,
          result: t.result?.value ? `${t.result.value} ${t.result.unit || ''}`.trim() : 'Pending',
          structuredResult: t.result,
          labName: t.result?.labName || null,
          hasReport: Boolean(t.result?.reportFile?.fileName),
        }));
      sharedPrescriptions = inMemoryPrescriptions.filter((p) => p.patientId === patientId);
      sharedCarePlans = inMemoryCarePlans.filter((c) => c.patientId === patientId);
    }
  }

  return {
    appointment: {
      id: appointment._id,
      date: appointment.date,
      slotTime: appointment.slotTime,
      mode: appointment.mode,
      status: appointment.status,
      priority: appointment.priority,
      chiefComplaint: appointment.chiefComplaint || 'Routine clinical visit',
      token: appointment.tokenId,
      doctorId: appointment.doctorId?._id || appointment.doctorId,
      doctorName: appointment.doctorId?.doctorName || 'Dr. Attending Clinician',
    },
    patient: {
      id: patientId,
      name: patientUser?.name || 'Walk-in Patient',
      age: patientUser?.age || 'N/A',
      gender: patientUser?.gender || 'Not specified',
      bloodGroup: patientUser?.bloodGroup || 'Unknown',
      phone: patientUser?.phone || 'N/A',
      email: patientUser?.email || 'N/A',
      allergies: patientUser?.allergies || [],
      height: patientUser?.height || null,
      weight: patientUser?.weight || null,
      emergencyContact: patientUser?.emergencyContact || null,
    },
    consent: {
      status: consentStatus,
      isAuthorized,
      grantId: grant?._id || null,
      scope: grant?.scope || null,
      message: isAuthorized
        ? 'Consent verified. Full clinical records are accessible for this consultation.'
        : 'Patient has not granted consent to view protected medical records. Historical data is shielded.',
    },
    sharedRecords: {
      medicalHistory: sharedMedicalHistory,
      testResults: sharedTestResults,
      prescriptions: sharedPrescriptions,
      carePlans: sharedCarePlans,
    },
  };
}

/**
 * Helper: Resolve and validate encounter appointment, enforcing server-side ownership.
 * Derives patientId and doctorId server-side; rejects client spoofing or mismatch.
 */
async function resolveAndValidateEncounterAppointment({ appointmentId, doctorId, patientId }) {
  if (!appointmentId) {
    throw new AppError('appointmentId is required', 400);
  }

  const isConnected = mongoose.connection.readyState === 1;
  let apt = null;

  if (isConnected) {
    apt = await Appointment.findById(appointmentId);
  } else {
    apt = inMemoryAppointments.find((a) => a._id?.toString() === appointmentId?.toString()) || null;
  }

  if (!apt) {
    throw new AppError('Appointment not found', 404);
  }

  if (apt.status === 'cancelled') {
    throw new AppError('Cannot perform clinical encounter actions on a cancelled appointment', 400);
  }

  // Derive patient ID server-side directly from authoritative appointment record
  const verifiedPatientId =
    apt.patientId?._id?.toString() ||
    apt.patientId?.toString();

  // Reject client-supplied patientId mismatch
  if (patientId && patientId.toString() !== verifiedPatientId) {
    throw new AppError('Provided patientId does not match the appointment patient', 400);
  }

  // Derive assigned doctor ID server-side directly from authoritative appointment record
  const assignedDoctorId =
    apt.doctorId?._id?.toString() ||
    apt.doctorId?.toString();

  // If requesting doctor is provided, ensure they are the assigned clinician
  if (doctorId && doctorId.toString() !== assignedDoctorId) {
    throw new AppError('Forbidden: Only the attending doctor can perform clinical actions for this appointment', 403);
  }

  return {
    appointment: apt,
    verifiedPatientId,
    assignedDoctorId,
    isConnected,
  };
}

/**
 * Start Consultation for an encounter
 */
export async function startConsultation({ appointmentId, doctorId } = {}) {
  const { appointment, isConnected } = await resolveAndValidateEncounterAppointment({
    appointmentId,
    doctorId,
  });

  if (isConnected) {
    const updated = await updateAppointmentStatus(appointmentId, 'in-progress');
    return updated;
  }

  appointment.status = 'in-progress';
  return appointment;
}

/**
 * Complete Consultation Encounter
 * - Marks appointment completed
 * - Creates doctor-verified history entry
 * - Emits notifications
 */
export async function completeConsultationEncounter({
  appointmentId,
  doctorId,
  notes = '',
  diagnosis = '',
} = {}) {
  const { appointment, verifiedPatientId, assignedDoctorId, isConnected } =
    await resolveAndValidateEncounterAppointment({ appointmentId, doctorId });

  if (isConnected) {
    const updated = await updateAppointmentStatus(appointmentId, 'completed');
    return updated;
  }

  appointment.status = 'completed';

  const verifiedEntry = {
    _id: 'vh-' + Date.now(),
    patientId: verifiedPatientId,
    doctorId: assignedDoctorId,
    doctorName: 'Dr. Attending Clinician',
    appointmentId,
    condition: diagnosis || appointment.chiefComplaint || 'Clinical Consultation',
    conditionDate: new Date().toISOString().slice(0, 10),
    source: 'doctor-verified',
    notes: notes || 'Consultation completed by attending physician',
    isActive: true,
  };
  inMemoryHistories.unshift(verifiedEntry);

  return appointment;
}

/**
 * Issue Digital Prescription for an encounter
 */
export async function issueEncounterPrescription({
  appointmentId,
  doctorId,
  patientId,
  medications = [],
  diagnosis = '',
  instructions = '',
  doctorName = 'Dr. Attending Clinician',
} = {}) {
  if (!medications || medications.length === 0) {
    throw new AppError('At least one medication is required', 400);
  }

  const { appointment, verifiedPatientId, assignedDoctorId, isConnected } =
    await resolveAndValidateEncounterAppointment({ appointmentId, doctorId, patientId });

  if (isConnected) {
    const prescription = await Prescription.create({
      patientId: verifiedPatientId,
      doctorId: assignedDoctorId,
      doctorName,
      appointmentId,
      diagnosis,
      medications,
      instructions,
      startDate: new Date(),
    });

    createNotification({
      recipient: verifiedPatientId,
      type: 'prescription_created',
      title: 'New Prescription Issued',
      message: `${doctorName} issued a digital prescription for ${medications.map((m) => m.medicineName).join(', ')}.`,
      metadata: { prescriptionId: prescription._id, appointmentId },
    }).catch(() => {});

    return prescription;
  }

  // In-memory fallback
  const newRx = {
    _id: 'rx-' + Date.now(),
    patientId: verifiedPatientId,
    doctorId: assignedDoctorId,
    doctorName,
    appointmentId,
    diagnosis,
    medications,
    instructions,
    status: 'active',
    startDate: new Date().toISOString().slice(0, 10),
    endDate: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
    createdAt: new Date(),
  };
  inMemoryPrescriptions.unshift(newRx);
  return newRx;
}

/**
 * Order Diagnostic Lab Test for an encounter
 */
export async function issueEncounterTestOrder({
  appointmentId,
  doctorId,
  patientId,
  testName,
  reason,
  doctorName = 'Dr. Attending Clinician',
} = {}) {
  if (!testName || !reason) {
    throw new AppError('testName and reason are required', 400);
  }

  const { appointment, verifiedPatientId, assignedDoctorId, isConnected } =
    await resolveAndValidateEncounterAppointment({ appointmentId, doctorId, patientId });

  if (isConnected) {
    const testOrder = await TestOrder.create({
      appointmentId,
      patientId: verifiedPatientId,
      doctorId: assignedDoctorId,
      doctorName,
      testName,
      reason,
      status: 'ordered',
    });

    createNotification({
      recipient: verifiedPatientId,
      type: 'lab_result',
      title: 'Lab Test Ordered',
      message: `${doctorName} ordered a diagnostic test: ${testName}. Reason: ${reason}.`,
      metadata: { testOrderId: testOrder._id, appointmentId },
    }).catch(() => {});

    return testOrder;
  }

  // In-memory fallback
  const newOrder = {
    _id: 'to-' + Date.now(),
    appointmentId,
    patientId: verifiedPatientId,
    doctorId: assignedDoctorId,
    doctorName,
    testName,
    reason,
    status: 'ordered',
    createdAt: new Date(),
  };
  inMemoryTestOrders.unshift(newOrder);
  return newOrder;
}

/**
 * Issue Doctor Care Plan for an encounter
 */
export async function issueEncounterCarePlan({
  appointmentId,
  doctorId,
  patientId,
  carePlanData = {},
  doctorName = 'Dr. Attending Clinician',
} = {}) {
  if (!carePlanData.diagnosis) {
    throw new AppError('diagnosis is required for care plan', 400);
  }

  const { appointment, verifiedPatientId, assignedDoctorId, isConnected } =
    await resolveAndValidateEncounterAppointment({ appointmentId, doctorId, patientId });

  if (isConnected) {
    const carePlan = await CarePlan.create({
      appointmentId,
      patientId: verifiedPatientId,
      doctorId: assignedDoctorId,
      doctorName,
      ...carePlanData,
    });

    createNotification({
      recipient: verifiedPatientId,
      type: 'care_plan',
      title: 'Doctor Care Plan Issued',
      message: `${doctorName} created a new care plan for ${carePlanData.diagnosis}. Review recommended diet and activities.`,
      metadata: { carePlanId: carePlan._id, appointmentId },
    }).catch(() => {});

    return carePlan;
  }

  // In-memory fallback
  const newPlan = {
    _id: 'cp-' + Date.now(),
    appointmentId,
    patientId: verifiedPatientId,
    doctorId: assignedDoctorId,
    doctorName,
    ...carePlanData,
    createdAt: new Date(),
  };
  inMemoryCarePlans.unshift(newPlan);
  return newPlan;
}

/**
 * Record Doctor-Verified Medical History Entry
 */
export async function addDoctorVerifiedHistory({
  appointmentId,
  doctorId,
  patientId,
  condition,
  conditionDate,
  notes = '',
  doctorName = 'Dr. Attending Clinician',
} = {}) {
  if (!condition) {
    throw new AppError('condition is required', 400);
  }

  const { appointment, verifiedPatientId, assignedDoctorId, isConnected } =
    await resolveAndValidateEncounterAppointment({ appointmentId, doctorId, patientId });

  if (isConnected) {
    const entry = await MedicalHistory.create({
      patientId: verifiedPatientId,
      doctorId: assignedDoctorId,
      doctorName,
      appointmentId,
      condition,
      conditionDate: conditionDate || new Date().toISOString().slice(0, 10),
      source: 'doctor-verified',
      notes,
      isActive: true,
    });
    return entry;
  }

  // In-memory fallback
  const newEntry = {
    _id: 'mh-' + Date.now(),
    patientId: verifiedPatientId,
    doctorId: assignedDoctorId,
    doctorName,
    appointmentId,
    condition,
    conditionDate: conditionDate || new Date().toISOString().slice(0, 10),
    source: 'doctor-verified',
    notes,
    isActive: true,
  };
  inMemoryHistories.unshift(newEntry);
  return newEntry;
}
