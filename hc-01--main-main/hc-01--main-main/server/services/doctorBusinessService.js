import mongoose from 'mongoose';
import DoctorProfile from '../models/DoctorProfile.js';
import Appointment from '../models/Appointment.js';
import Token from '../models/Token.js';
import User from '../models/User.js';
import Notification from '../models/Notification.js';
import Prescription from '../models/Prescription.js';
import TestOrder from '../models/TestOrder.js';
import CarePlan from '../models/CarePlan.js';
import Hospital from '../models/Hospital.js';
import { AppError } from '../middleware/errorHandler.js';

// In-memory test store
let inMemoryDoctors = {};
let inMemoryAppointments = [];
let inMemoryTokens = [];
let inMemoryNotifications = [];
let inMemoryPrescriptions = [];
let inMemoryTestOrders = [];
let inMemoryCarePlans = [];
let inMemoryPatients = {};

export function clearDoctorBusinessTestDb() {
  inMemoryDoctors = {};
  inMemoryAppointments = [];
  inMemoryTokens = [];
  inMemoryNotifications = [];
  inMemoryPrescriptions = [];
  inMemoryTestOrders = [];
  inMemoryCarePlans = [];
  inMemoryPatients = {};
}

export function seedDoctorBusinessTestDb({
  doctors = {},
  appointments = [],
  tokens = [],
  notifications = [],
  prescriptions = [],
  testOrders = [],
  carePlans = [],
  patients = {},
} = {}) {
  if (Object.keys(doctors).length) inMemoryDoctors = { ...doctors };
  if (appointments.length) inMemoryAppointments = [...appointments];
  if (tokens.length) inMemoryTokens = [...tokens];
  if (notifications.length) inMemoryNotifications = [...notifications];
  if (prescriptions.length) inMemoryPrescriptions = [...prescriptions];
  if (testOrders.length) inMemoryTestOrders = [...testOrders];
  if (carePlans.length) inMemoryCarePlans = [...carePlans];
  if (Object.keys(patients).length) inMemoryPatients = { ...patients };
}

/**
 * Resolve effective DoctorProfile by doctorProfileId or userId
 */
async function resolveDoctorProfile(doctorId) {
  const isConnected = mongoose.connection.readyState === 1;
  if (isConnected) {
    if (!doctorId) {
      return await DoctorProfile.findOne({ isActive: true });
    }
    let doc = await DoctorProfile.findById(doctorId);
    if (!doc) {
      doc = await DoctorProfile.findOne({ userId: doctorId });
    }
    return doc;
  }

  // In-memory fallback
  let allDocs = { ...inMemoryDoctors };
  try {
    const { getInMemoryDoctorProfiles } = await import('./authService.js');
    const authDocs = getInMemoryDoctorProfiles ? getInMemoryDoctorProfiles() : [];
    for (const d of authDocs) {
      if (d._id && !allDocs[d._id]) {
        allDocs[d._id] = d;
      }
    }
  } catch (err) {}

  if (!doctorId) {
    const firstKey = Object.keys(allDocs)[0];
    return firstKey ? allDocs[firstKey] : null;
  }
  return (
    allDocs[doctorId] ||
    Object.values(allDocs).find(
      (d) => d.userId?.toString() === doctorId.toString() || d._id?.toString() === doctorId.toString()
    ) ||
    null
  );
}

/**
 * Aggregates complete Doctor / Business Dashboard
 */
export async function getDoctorBusinessDashboard({ doctorId, date } = {}) {
  const isConnected = mongoose.connection.readyState === 1;
  const targetDate = date || new Date().toISOString().slice(0, 10);

  const doctorProfile = await resolveDoctorProfile(doctorId);
  if (!doctorProfile) {
    throw new AppError('Doctor / Business profile not found', 404);
  }

  const effectiveDoctorId = doctorProfile._id?.toString();

  let appointments = [];
  let upcomingAppointments = [];
  let currentToken = null;
  let waitingTokens = [];
  let recentNotifications = [];
  let recentPrescriptions = [];
  let recentTestOrders = [];
  let recentCarePlans = [];

  if (isConnected) {
    const [
      todayApts,
      futureApts,
      inProgToken,
      waitTokens,
      notifs,
      prescripts,
      tests,
      plans,
    ] = await Promise.all([
      Appointment.find({
        doctorId: effectiveDoctorId,
        date: targetDate,
      })
        .populate('patientId', 'name age gender phone email bloodGroup allergies emergencyContact')
        .populate('tokenId', 'tokenNumber status priority estimatedWaitTime calledAt')
        .sort({ slotTime: 1 })
        .lean(),

      Appointment.find({
        doctorId: effectiveDoctorId,
        date: { $gt: targetDate },
        status: { $ne: 'cancelled' },
      })
        .populate('patientId', 'name age gender phone email')
        .sort({ date: 1, slotTime: 1 })
        .limit(10)
        .lean(),

      Token.findOne({ status: 'in-progress' }).lean(),

      Token.find({ status: 'waiting' })
        .sort({ priority: -1, tokenNumber: 1 })
        .limit(20)
        .lean(),

      Notification.find({
        recipientId: doctorProfile.userId || effectiveDoctorId,
      })
        .sort({ createdAt: -1 })
        .limit(10)
        .lean(),

      Prescription.find({
        doctorId: effectiveDoctorId,
      })
        .sort({ createdAt: -1 })
        .limit(10)
        .lean(),

      TestOrder.find({
        doctorId: effectiveDoctorId,
      })
        .populate('patientId', 'name')
        .sort({ createdAt: -1 })
        .limit(10)
        .lean(),

      CarePlan.find({
        doctorId: effectiveDoctorId,
      })
        .sort({ createdAt: -1 })
        .limit(10)
        .lean(),
    ]);

    appointments = todayApts || [];
    upcomingAppointments = futureApts || [];
    currentToken = inProgToken || null;
    waitingTokens = waitTokens || [];
    recentNotifications = notifs || [];
    recentPrescriptions = prescripts || [];
    recentTestOrders = tests || [];
    recentCarePlans = plans || [];
  } else {
    // In-memory fallback
    appointments = inMemoryAppointments.filter(
      (a) =>
        (a.doctorId?.toString() === effectiveDoctorId || a.doctorId?._id?.toString() === effectiveDoctorId) &&
        a.date === targetDate
    );

    upcomingAppointments = inMemoryAppointments.filter(
      (a) =>
        (a.doctorId?.toString() === effectiveDoctorId || a.doctorId?._id?.toString() === effectiveDoctorId) &&
        a.date > targetDate &&
        a.status !== 'cancelled'
    );

    let sourceTokens = inMemoryTokens;
    if (sourceTokens.length === 0) {
      try {
        const { getInMemoryQueueTokens } = await import('./queueService.js');
        sourceTokens = getInMemoryQueueTokens ? getInMemoryQueueTokens() : [];
      } catch (err) {}
    }

    currentToken = sourceTokens.find((t) => t.status === 'in-progress') || null;
    waitingTokens = sourceTokens.filter((t) => t.status === 'waiting');
    recentNotifications = inMemoryNotifications.filter(
      (n) => n.recipientId?.toString() === doctorProfile.userId?.toString() || n.recipientId?.toString() === effectiveDoctorId
    );
    recentPrescriptions = inMemoryPrescriptions.filter((p) => p.doctorId?.toString() === effectiveDoctorId);
    recentTestOrders = inMemoryTestOrders.filter((t) => t.doctorId?.toString() === effectiveDoctorId);
    recentCarePlans = inMemoryCarePlans.filter((c) => c.doctorId?.toString() === effectiveDoctorId);
  }

  // 1. Today's Appointments & Patient Aggregations
  const activeTodayAppointments = appointments.filter((a) => a.status !== 'cancelled');
  const completedAppointments = appointments.filter((a) => a.status === 'completed');
  const waitingAppointments = appointments.filter((a) => ['booked', 'checked-in'].includes(a.status));
  const inProgressAppointments = appointments.filter((a) => a.status === 'in-progress');

  // Unique patients today
  const uniquePatientMap = new Map();
  appointments.forEach((apt) => {
    const pId = apt.patientId?._id?.toString() || apt.patientId?.toString();
    if (pId && !uniquePatientMap.has(pId)) {
      uniquePatientMap.set(pId, {
        patientId: pId,
        name: apt.patientId?.name || 'Patient',
        age: apt.patientId?.age || null,
        gender: apt.patientId?.gender || 'unknown',
        phone: apt.patientId?.phone || '',
        bloodGroup: apt.patientId?.bloodGroup || 'unknown',
        allergies: apt.patientId?.allergies || [],
        appointmentStatus: apt.status,
        slotTime: apt.slotTime,
        mode: apt.mode,
      });
    }
  });
  const todayPatients = Array.from(uniquePatientMap.values());

  // 2. Current Queue Status (Reusing existing Token Queue)
  const currentQueue = {
    activeToken: currentToken ? currentToken.tokenNumber : null,
    inProgressToken: currentToken,
    waitingCount: waitingTokens.length,
    waitingTokens: waitingTokens.slice(0, 10),
    totalQueueLength: (currentToken ? 1 : 0) + waitingTokens.length,
  };

  // 3. Waiting Patients list (Queue + Appointments)
  const waitingPatientsList = waitingAppointments.map((apt) => ({
    appointmentId: apt._id,
    patientName: apt.patientId?.name || 'Patient',
    slotTime: apt.slotTime,
    status: apt.status,
    priority: apt.priority,
    mode: apt.mode,
    tokenNumber: apt.tokenId?.tokenNumber || null,
  }));

  // 4. Subscription Status
  const defaultSub = {
    plan: 'professional',
    status: 'active',
    validUntil: new Date(Date.now() + 25 * 24 * 60 * 60 * 1000),
    maxStaffSeats: 5,
    telemedicineEnabled: true,
    analyticsEnabled: true,
    aiAssistantEnabled: true,
  };

  const subscription = doctorProfile.subscription || defaultSub;
  const validUntilDate = new Date(subscription.validUntil || defaultSub.validUntil);
  const daysRemaining = Math.max(0, Math.ceil((validUntilDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24)));

  const subscriptionStatus = {
    plan: subscription.plan || 'professional',
    status: subscription.status || 'active',
    validUntil: validUntilDate.toISOString(),
    daysRemaining,
    maxStaffSeats: subscription.maxStaffSeats || 5,
    seatsUsed: (doctorProfile.staffMembers || []).length,
    telemedicineEnabled: subscription.telemedicineEnabled !== false,
    analyticsEnabled: subscription.analyticsEnabled !== false,
    aiAssistantEnabled: subscription.aiAssistantEnabled !== false,
  };

  // 5. Business Summary & Analytics (Real data only, no invented metrics)
  const completedCount = completedAppointments.length;
  const inProgressCount = inProgressAppointments.length;
  const cancelledCount = appointments.filter((a) => a.status === 'cancelled').length;
  const noShowCount = appointments.filter((a) => a.status === 'no-show').length;
  const cancelledOrNoShowList = appointments.filter((a) => ['cancelled', 'no-show'].includes(a.status));

  const totalWaiting = waitingAppointments.length + waitingTokens.length;

  // Real average waiting time from active waiting tokens
  const avgWaitMinutes =
    waitingTokens.length > 0
      ? Math.round(
          waitingTokens.reduce((acc, t) => acc + (Number(t.estimatedWaitTime) || 0), 0) / waitingTokens.length
        )
      : 0;

  const consultationFee = Number(doctorProfile.consultationFee) || 500;
  const estimatedRevenue = completedCount * consultationFee;
  const videoCount = activeTodayAppointments.filter((a) => a.mode === 'video').length;
  const inPersonCount = activeTodayAppointments.filter((a) => a.mode !== 'video').length;
  const urgentCount = activeTodayAppointments.filter((a) =>
    ['critical', 'urgent', 'emergency'].includes(a.priority)
  ).length;

  const businessSummary = {
    todayConsultationCount: completedCount + inProgressCount,
    waitingPatientsCount: totalWaiting,
    completedConsultationsCount: completedCount,
    cancellationsCount: cancelledCount,
    noShowCount: noShowCount,
    totalCancelledOrNoShow: cancelledCount + noShowCount,
    cancelledOrNoShowAppointments: cancelledOrNoShowList,
    averageWaitingTimeMinutes: avgWaitMinutes,
    rating: {
      avgRating: Number(doctorProfile.avgRating || 0),
      ratingCount: Number(doctorProfile.ratingCount || 0),
    },
    estimatedRevenue,
  };

  const analytics = {
    totalAppointmentsToday: activeTodayAppointments.length,
    completedConsultationsCount: completedCount,
    inProgressCount,
    waitingCount: waitingAppointments.length,
    estimatedRevenue,
    avgWaitMinutes,
    modeBreakdown: {
      inPerson: inPersonCount,
      video: videoCount,
    },
    priorityBreakdown: {
      routine: activeTodayAppointments.length - urgentCount,
      urgent: urgentCount,
    },
  };

  // 6. Notifications
  const unreadNotificationsCount = recentNotifications.filter((n) => !n.read).length;

  // 7. CURRENT PATIENT (Active in-progress consultation)
  let currentPatient = null;
  if (inProgressAppointments.length > 0) {
    const activeAppt = inProgressAppointments[0];
    currentPatient = {
      appointmentId: activeAppt._id,
      patientId: activeAppt.patientId?._id || activeAppt.patientId,
      patientName: activeAppt.patientId?.name || 'In-Consultation Patient',
      age: activeAppt.patientId?.age || null,
      gender: activeAppt.patientId?.gender || 'unknown',
      phone: activeAppt.patientId?.phone || '',
      bloodGroup: activeAppt.patientId?.bloodGroup || 'unknown',
      allergies: activeAppt.patientId?.allergies || [],
      slotTime: activeAppt.slotTime,
      priority: activeAppt.priority || 'routine',
      mode: activeAppt.mode || 'in-person',
      tokenNumber: activeAppt.tokenId?.tokenNumber || (currentToken ? currentToken.tokenNumber : null),
      chiefComplaint: activeAppt.chiefComplaint || 'OPD Consultation',
      status: 'in-progress',
      calledAt: activeAppt.tokenId?.calledAt || new Date().toISOString(),
    };
  } else if (currentToken) {
    currentPatient = {
      appointmentId: null,
      patientId: currentToken.patientId || null,
      patientName: currentToken.patientName || 'OPD Patient',
      age: currentToken.age || null,
      gender: currentToken.gender || 'unknown',
      phone: currentToken.phone || '',
      bloodGroup: 'unknown',
      allergies: [],
      slotTime: 'Walk-in Token',
      priority: currentToken.priority || 'routine',
      mode: 'in-person',
      tokenNumber: currentToken.tokenNumber,
      chiefComplaint: currentToken.condition || currentToken.reason || 'General Consultation',
      status: 'in-progress',
      calledAt: currentToken.calledAt || new Date().toISOString(),
    };
  }

  // 8. EMERGENCY / PRIORITY PATIENTS
  const emergencyPriorityAppointments = activeTodayAppointments.filter(
    (a) => ['critical', 'urgent', 'emergency'].includes(a.priority) && a.status !== 'completed'
  );
  const emergencyPriorityTokens = waitingTokens.filter(
    (t) => ['critical', 'urgent', 'emergency'].includes(t.priority)
  );
  const emergencyPriorityPatients = [
    ...emergencyPriorityAppointments.map((a) => ({
      type: 'appointment',
      appointmentId: a._id,
      patientId: a.patientId?._id || a.patientId,
      patientName: a.patientId?.name || 'Patient',
      age: a.patientId?.age || null,
      gender: a.patientId?.gender || 'unknown',
      priority: a.priority,
      slotTime: a.slotTime,
      mode: a.mode,
      tokenNumber: a.tokenId?.tokenNumber || null,
      chiefComplaint: a.chiefComplaint || 'Emergency Triage',
      status: a.status,
    })),
    ...emergencyPriorityTokens.map((t) => ({
      type: 'token',
      appointmentId: null,
      patientId: t.patientId || null,
      patientName: t.patientName || 'Queue Patient',
      age: t.age || null,
      gender: t.gender || 'unknown',
      priority: t.priority,
      slotTime: 'Walk-in Token',
      mode: 'in-person',
      tokenNumber: t.tokenNumber,
      chiefComplaint: t.condition || t.reason || 'Urgent Triage',
      status: 'waiting',
    })),
  ];

  // 9. NEXT PATIENT (Priority-aware: emergency first, then checked-in, then waiting token, then booked)
  let nextPatient = null;
  const nextEmergency = emergencyPriorityPatients[0];
  const nextCheckedIn = waitingAppointments.find((a) => a.status === 'checked-in');
  const nextToken = waitingTokens[0];
  const nextBooked = waitingAppointments.find((a) => a.status === 'booked');

  if (nextEmergency && nextEmergency.status === 'waiting') {
    nextPatient = {
      appointmentId: nextEmergency.appointmentId,
      patientId: nextEmergency.patientId,
      patientName: nextEmergency.patientName,
      age: nextEmergency.age,
      gender: nextEmergency.gender || 'unknown',
      slotTime: nextEmergency.slotTime,
      priority: nextEmergency.priority,
      mode: nextEmergency.mode || 'in-person',
      tokenNumber: nextEmergency.tokenNumber,
      estimatedWaitTime: 5,
      status: 'waiting',
      chiefComplaint: nextEmergency.chiefComplaint,
    };
  } else if (nextCheckedIn) {
    nextPatient = {
      appointmentId: nextCheckedIn._id,
      patientId: nextCheckedIn.patientId?._id || nextCheckedIn.patientId,
      patientName: nextCheckedIn.patientId?.name || 'Patient',
      age: nextCheckedIn.patientId?.age || null,
      gender: nextCheckedIn.patientId?.gender || 'unknown',
      slotTime: nextCheckedIn.slotTime,
      priority: nextCheckedIn.priority || 'routine',
      mode: nextCheckedIn.mode || 'in-person',
      tokenNumber: nextCheckedIn.tokenId?.tokenNumber || null,
      estimatedWaitTime: 10,
      status: nextCheckedIn.status,
      chiefComplaint: nextCheckedIn.chiefComplaint || 'Follow-up Consultation',
    };
  } else if (nextToken) {
    nextPatient = {
      appointmentId: null,
      patientId: nextToken.patientId || null,
      patientName: nextToken.patientName || 'Queue Patient',
      age: nextToken.age || null,
      gender: nextToken.gender || 'unknown',
      slotTime: 'Queue Token',
      priority: nextToken.priority || 'routine',
      mode: 'in-person',
      tokenNumber: nextToken.tokenNumber,
      estimatedWaitTime: nextToken.estimatedWaitTime || 15,
      status: 'waiting',
      chiefComplaint: nextToken.condition || nextToken.reason || 'General OPD',
    };
  } else if (nextBooked) {
    nextPatient = {
      appointmentId: nextBooked._id,
      patientId: nextBooked.patientId?._id || nextBooked.patientId,
      patientName: nextBooked.patientId?.name || 'Patient',
      age: nextBooked.patientId?.age || null,
      gender: nextBooked.patientId?.gender || 'unknown',
      slotTime: nextBooked.slotTime,
      priority: nextBooked.priority || 'routine',
      mode: nextBooked.mode || 'in-person',
      tokenNumber: nextBooked.tokenId?.tokenNumber || null,
      estimatedWaitTime: 20,
      status: nextBooked.status,
      chiefComplaint: nextBooked.chiefComplaint || 'Scheduled Consultation',
    };
  }

  // 10. TODAY'S WAITING QUEUE (Specifically for this Doctor)
  const patientQueue = [
    ...waitingTokens.map((t) => ({
      type: 'token',
      tokenNumber: t.tokenNumber,
      patientName: t.patientName || 'OPD Patient',
      patientId: t.patientId || null,
      appointmentId: null,
      priority: t.priority || 'routine',
      slotTime: 'Walk-in',
      estimatedWaitTime: Number(t.estimatedWaitTime) || 15,
      status: t.status,
      mode: 'in-person',
      calledAt: t.calledAt || null,
      reason: t.condition || t.reason || 'OPD Queue',
    })),
    ...waitingAppointments.map((a) => ({
      type: 'appointment',
      tokenNumber: a.tokenId?.tokenNumber || null,
      patientName: a.patientId?.name || 'Patient',
      patientId: a.patientId?._id || a.patientId,
      appointmentId: a._id,
      priority: a.priority || 'routine',
      slotTime: a.slotTime,
      estimatedWaitTime: a.tokenId?.estimatedWaitTime || 15,
      status: a.status,
      mode: a.mode || 'in-person',
      calledAt: a.tokenId?.calledAt || null,
      reason: a.chiefComplaint || 'Scheduled Slot',
    })),
  ];

  // 11. TODAY'S SCHEDULE
  const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const todayDayName = dayNames[new Date().getDay()];
  const defaultScheduleDay = (doctorProfile.weeklySchedule || []).find(
    (s) => s.day?.toLowerCase() === todayDayName
  ) || {
    day: todayDayName,
    isWorking: true,
    startTime: '09:00',
    endTime: '17:00',
    breaks: [{ startTime: '13:00', endTime: '14:00', reason: 'Lunch Break' }],
    videoEnabled: Boolean(doctorProfile.videoEnabled),
  };

  const slotDuration = Number(doctorProfile.slotDuration) || 30;
  const startParts = (defaultScheduleDay.startTime || '09:00').split(':').map(Number);
  const endParts = (defaultScheduleDay.endTime || '17:00').split(':').map(Number);
  const totalMinutes = Math.max(60, (endParts[0] * 60 + (endParts[1] || 0)) - (startParts[0] * 60 + (startParts[1] || 0)));
  const totalSlotsCount = Math.max(1, Math.floor(totalMinutes / slotDuration));
  const bookedSlotsCount = activeTodayAppointments.length;

  const todaySchedule = {
    day: todayDayName,
    dayFormatted: todayDayName.charAt(0).toUpperCase() + todayDayName.slice(1),
    isWorking: defaultScheduleDay.isWorking !== false,
    startTime: defaultScheduleDay.startTime || '09:00',
    endTime: defaultScheduleDay.endTime || '17:00',
    breaks: defaultScheduleDay.breaks || [{ startTime: '13:00', endTime: '14:00', reason: 'Lunch Break' }],
    slotDuration,
    totalSlotsCount,
    bookedSlotsCount,
    completedSlotsCount: completedCount,
    remainingSlotsCount: Math.max(0, totalSlotsCount - bookedSlotsCount),
    videoEnabled: defaultScheduleDay.videoEnabled || false,
    statusText: defaultScheduleDay.isWorking !== false ? 'Shift Active (09:00 AM - 05:00 PM)' : 'Off Duty / Rest Day',
  };

  // 12. RECENT PATIENT HISTORY
  const recentPatientHistory = completedAppointments.map((a) => ({
    appointmentId: a._id,
    patientId: a.patientId?._id || a.patientId,
    patientName: a.patientId?.name || 'Patient',
    age: a.patientId?.age || null,
    gender: a.patientId?.gender || 'unknown',
    date: a.date,
    slotTime: a.slotTime,
    mode: a.mode,
    status: a.status,
    diagnosis: a.chiefComplaint || 'Consultation Completed',
    treatmentSummary: 'Prescription & Clinical Notes Recorded',
    prescriptionPreview: 'Issued upon completion',
    isAuthorized: true,
  }));

  recentPrescriptions.forEach((rx) => {
    const pId = rx.patientId?._id?.toString() || rx.patientId?.toString();
    const existing = recentPatientHistory.find((r) => r.patientId?.toString() === pId);
    if (!existing) {
      recentPatientHistory.push({
        appointmentId: rx.appointmentId || null,
        patientId: pId,
        patientName: rx.patientId?.name || 'Prescription Patient',
        age: rx.patientId?.age || null,
        gender: rx.patientId?.gender || 'unknown',
        date: rx.createdAt ? new Date(rx.createdAt).toISOString().slice(0, 10) : targetDate,
        slotTime: 'Consultation',
        mode: 'in-person',
        status: 'completed',
        diagnosis: rx.diagnosis || 'Clinical Prescription',
        treatmentSummary: (rx.medications || []).map((m) => m.name).join(', ') || 'Medications Prescribed',
        prescriptionPreview: `${(rx.medications || []).length} medications prescribed`,
        isAuthorized: true,
      });
    }
  });

  // Doctor Availability Status
  const doctorAvailabilityStatus =
    doctorProfile.availabilityStatus || (doctorProfile.isAvailableToday ? 'available' : 'offline');

  return {
    doctor: {
      _id: doctorProfile._id,
      userId: doctorProfile.userId,
      doctorName: doctorProfile.doctorName,
      specialty: doctorProfile.specialty,
      hospitalName: doctorProfile.hospitalName,
      hospitalId: doctorProfile.hospitalId,
      qualifications: doctorProfile.qualifications || [],
      experienceYears: doctorProfile.experienceYears || 0,
      medicalLicenseNumber: doctorProfile.medicalLicenseNumber || '',
      avgRating: doctorProfile.avgRating || 0,
      ratingCount: doctorProfile.ratingCount || 0,
      availabilityStatus: doctorAvailabilityStatus,
      isAvailableToday: doctorAvailabilityStatus === 'available',
    },
    // The 12 required items:
    todayPatientsCount: todayPatients.length,
    consultedPatientsCount: completedCount,
    waitingPatientsCount: totalWaiting,
    currentPatient,
    nextPatient,
    emergencyPriorityPatients,
    emergencyPriorityCount: emergencyPriorityPatients.length,
    todayAppointments: appointments,
    doctorAvailabilityStatus,
    todaySchedule,
    upcomingAppointments,
    patientQueue,
    recentPatientHistory,

    // Auxiliary & legacy compatibility fields:
    todayPatients,
    currentQueue,
    waitingPatients: waitingPatientsList,
    waitingCount: waitingPatientsList.length + waitingTokens.length,
    completedConsultationsCount: completedCount,
    completedConsultations: completedAppointments,
    upcomingCount: upcomingAppointments.length,
    notifications: recentNotifications,
    unreadNotificationsCount,
    subscriptionStatus,
    businessSummary,
    analytics,
    staff: doctorProfile.staffMembers || [],
    businessSettings: {
      clinicName: doctorProfile.clinicDetails?.clinicName || doctorProfile.hospitalName,
      registrationNumber: doctorProfile.clinicDetails?.registrationNumber || doctorProfile.medicalLicenseNumber || '',
      contactPhone: doctorProfile.clinicDetails?.contactPhone || '',
      taxId: doctorProfile.clinicDetails?.taxId || '',
      website: doctorProfile.clinicDetails?.website || '',
      address: doctorProfile.location?.address || '',
      consultationFee: doctorProfile.consultationFee || 500,
      followUpFee: doctorProfile.followUpFee || 300,
      services: doctorProfile.services || ['General Consultation'],
      consultationModes: doctorProfile.consultationModes || ['in-person'],
      weeklySchedule: doctorProfile.weeklySchedule || [],
      videoEnabled: doctorProfile.videoEnabled || false,
    },
    quickActionFeeds: {
      recentPrescriptions,
      recentTestOrders,
      recentCarePlans,
    },
  };
}

/**
 * Updates doctor / business configuration
 */
export async function updateDoctorBusinessSettings({ doctorId, settings = {} } = {}) {
  const isConnected = mongoose.connection.readyState === 1;
  const doc = await resolveDoctorProfile(doctorId);
  if (!doc) {
    throw new AppError('Doctor / Business profile not found', 404);
  }

  const {
    consultationFee,
    followUpFee,
    services,
    consultationModes,
    clinicDetails,
    weeklySchedule,
    videoEnabled,
    address,
  } = settings;

  if (isConnected) {
    if (consultationFee !== undefined) doc.consultationFee = Math.max(0, Number(consultationFee));
    if (followUpFee !== undefined) doc.followUpFee = Math.max(0, Number(followUpFee));
    if (services !== undefined) {
      doc.services = Array.isArray(services)
        ? services
        : typeof services === 'string'
        ? services.split(',').map((s) => s.trim()).filter(Boolean)
        : doc.services;
    }
    if (consultationModes !== undefined) {
      doc.consultationModes = Array.isArray(consultationModes) ? consultationModes : doc.consultationModes;
    }
    if (clinicDetails) {
      doc.clinicDetails = { ...doc.clinicDetails, ...clinicDetails };
    }
    if (address && doc.location) {
      doc.location.address = address;
    }
    if (weeklySchedule) {
      doc.weeklySchedule = weeklySchedule;
    }
    if (videoEnabled !== undefined) {
      doc.videoEnabled = Boolean(videoEnabled);
    }

    await doc.save();
    return doc;
  }

  // In-memory fallback
  if (consultationFee !== undefined) doc.consultationFee = Math.max(0, Number(consultationFee));
  if (followUpFee !== undefined) doc.followUpFee = Math.max(0, Number(followUpFee));
  if (services !== undefined) doc.services = Array.isArray(services) ? services : [services];
  if (consultationModes !== undefined) doc.consultationModes = consultationModes;
  if (clinicDetails) doc.clinicDetails = { ...doc.clinicDetails, ...clinicDetails };
  if (weeklySchedule) doc.weeklySchedule = weeklySchedule;
  if (videoEnabled !== undefined) doc.videoEnabled = videoEnabled;

  return doc;
}

/**
 * Add staff member to practice
 */
export async function addStaffMemberToPractice({ doctorId, staffData } = {}) {
  const isConnected = mongoose.connection.readyState === 1;
  const doc = await resolveDoctorProfile(doctorId);
  if (!doc) {
    throw new AppError('Doctor / Business profile not found', 404);
  }

  const maxSeats = doc.subscription?.maxStaffSeats || 5;
  const currentStaff = doc.staffMembers || [];
  if (currentStaff.length >= maxSeats) {
    throw new AppError(`Seat limit reached (${maxSeats} max seats on ${doc.subscription?.plan || 'current'} plan). Please upgrade subscription.`, 400);
  }

  const newStaff = {
    userId: staffData.userId || null,
    name: staffData.name || 'Staff Member',
    role: staffData.role || 'receptionist',
    email: staffData.email || '',
    phone: staffData.phone || '',
    addedAt: new Date(),
  };

  if (isConnected) {
    doc.staffMembers.push(newStaff);
    await doc.save();
    return doc.staffMembers;
  }

  if (!doc.staffMembers) doc.staffMembers = [];
  doc.staffMembers.push(newStaff);
  return doc.staffMembers;
}

/**
 * Updates Doctor Availability Status
 * Allowed values: 'available', 'busy', 'on_leave', 'offline'
 */
export async function updateDoctorAvailability({ doctorId, availabilityStatus } = {}) {
  const allowed = ['available', 'busy', 'on_leave', 'offline'];
  if (!allowed.includes(availabilityStatus)) {
    throw new AppError(`Invalid availability status: ${availabilityStatus}. Allowed: ${allowed.join(', ')}`, 400);
  }

  const isConnected = mongoose.connection.readyState === 1;
  const doc = await resolveDoctorProfile(doctorId);
  if (!doc) {
    throw new AppError('Doctor profile not found', 404);
  }

  const isAvailableToday = availabilityStatus === 'available';

  if (isConnected) {
    doc.availabilityStatus = availabilityStatus;
    doc.isAvailableToday = isAvailableToday;
    await doc.save();
    return {
      doctorId: doc._id,
      availabilityStatus: doc.availabilityStatus,
      isAvailableToday: doc.isAvailableToday,
      doctorName: doc.doctorName,
    };
  }

  // In-memory fallback
  doc.availabilityStatus = availabilityStatus;
  doc.isAvailableToday = isAvailableToday;
  return {
    doctorId: doc._id || doctorId,
    availabilityStatus: doc.availabilityStatus,
    isAvailableToday: doc.isAvailableToday,
    doctorName: doc.doctorName || 'Doctor',
  };
}

/**
 * Retrieves authorized patient previous visits and clinical history for a doctor
 */
export async function getDoctorPatientClinicalHistory({ doctorId, patientId, appointmentId } = {}) {
  if (!patientId && !appointmentId) {
    throw new AppError('patientId or appointmentId is required to access patient clinical history', 400);
  }

  const isConnected = mongoose.connection.readyState === 1;
  const effectiveDoctorId = doctorId || '65f000000000000000000002';

  // If appointmentId provided, delegate directly to getPatientEncounter
  if (appointmentId) {
    const { getPatientEncounter } = await import('./doctorWorkspaceService.js');
    const encounter = await getPatientEncounter({ appointmentId, doctorId: effectiveDoctorId });
    return {
      patient: encounter.patient,
      appointment: encounter.appointment,
      isAuthorized: encounter.consent?.isAuthorized ?? false,
      consentStatus: encounter.consent?.status || 'LIMITED ACCESS',
      consent: encounter.consent,
      sharedMedicalHistory: encounter.sharedRecords?.medicalHistory || [],
      sharedTestResults: encounter.sharedRecords?.testResults || [],
      sharedPrescriptions: encounter.sharedRecords?.prescriptions || [],
      sharedCarePlans: encounter.sharedRecords?.carePlans || [],
      previousVisits: encounter.sharedRecords?.medicalHistory || [],
    };
  }

  // Locate most recent appointment for this patient with the doctor or any appointment
  let targetAppointmentId = null;
  if (isConnected) {
    const apt = await Appointment.findOne({
      doctorId: effectiveDoctorId,
      patientId: patientId,
    })
      .sort({ date: -1, slotTime: -1 })
      .lean();
    if (apt) targetAppointmentId = apt._id;
  } else {
    const apt = inMemoryAppointments.find(
      (a) =>
        (a.doctorId?.toString() === effectiveDoctorId.toString()) &&
        (a.patientId?._id?.toString() === patientId.toString() || a.patientId?.toString() === patientId.toString())
    );
    if (apt) targetAppointmentId = apt._id;
  }

  if (targetAppointmentId) {
    const { getPatientEncounter } = await import('./doctorWorkspaceService.js');
    const encounter = await getPatientEncounter({ appointmentId: targetAppointmentId, doctorId: effectiveDoctorId });
    return {
      patient: encounter.patient,
      appointment: encounter.appointment,
      isAuthorized: encounter.consent?.isAuthorized ?? false,
      consentStatus: encounter.consent?.status || 'LIMITED ACCESS',
      consent: encounter.consent,
      sharedMedicalHistory: encounter.sharedRecords?.medicalHistory || [],
      sharedTestResults: encounter.sharedRecords?.testResults || [],
      sharedPrescriptions: encounter.sharedRecords?.prescriptions || [],
      sharedCarePlans: encounter.sharedRecords?.carePlans || [],
      previousVisits: encounter.sharedRecords?.medicalHistory || [],
    };
  }

  // Fallback: If no appointment found, fetch patient record
  let patientUser = null;
  if (isConnected) {
    patientUser = await User.findById(patientId)
      .select('name age gender bloodGroup phone email allergies emergencyContact')
      .lean();
  } else {
    patientUser = inMemoryPatients?.[patientId] || { _id: patientId, name: 'Patient', age: 30, gender: 'unknown' };
  }

  if (!patientUser) {
    throw new AppError('Patient record not found', 404);
  }

  return {
    patient: patientUser,
    isAuthorized: false,
    consentStatus: 'LIMITED ACCESS',
    encounter: {
      status: 'no-active-encounter',
      isAuthorized: false,
      chiefComplaint: 'OPD Record Lookup',
    },
    sharedMedicalHistory: [],
    sharedTestResults: [],
    sharedPrescriptions: [],
    sharedCarePlans: [],
    previousVisits: [],
  };
}

