import Token from '../models/Token.js';
import Appointment from '../models/Appointment.js';
import { getAvgConsultTime, generateToken } from './queueService.js';
import { emitToPatientRoom } from '../socketHandler.js';
import User from '../models/User.js';
import axios from 'axios';

const getAiUrl = () => process.env.AI_SERVICE_URL || process.env.AI_URL || 'http://localhost:8001';
export const NEAR_TURN_THRESHOLD = Number(process.env.NEAR_TURN_THRESHOLD) || 5;

/**
 * Format a Date object to "H:MM AM/PM"
 */
export function formatTime12H(date) {
  let hours = date.getHours();
  const minutes = date.getMinutes();
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12 || 12;
  const minutesStr = minutes < 10 ? `0${minutes}` : minutes;
  return `${hours}:${minutesStr} ${ampm}`;
}

/**
 * Format time range cleanly: "4:30–4:50 PM" if same meridian, or "11:50 AM–12:10 PM"
 */
export function formatTimeRange(startDate, endDate) {
  const startStr = formatTime12H(startDate);
  const endStr = formatTime12H(endDate);
  const startAmPm = startStr.slice(-2);
  const endAmPm = endStr.slice(-2);
  if (startAmPm === endAmPm) {
    return `${startStr.slice(0, -3)}–${endStr}`;
  }
  return `${startStr}–${endStr}`;
}

/**
 * Calculate realistic time window and recommended arrival time
 * Creates a clean 20-minute consultation window (e.g. 4:30–4:50 PM)
 * and sets recommended arrival 15 minutes before window start (e.g. 4:15 PM)
 * @param {number} waitMinutes - estimated minutes until consultation
 * @param {Date} [baseTime=new Date()]
 */
export function calculateTimeWindow(waitMinutes, baseTime = new Date()) {
  const wait = Math.max(0, Math.round(waitMinutes));

  // If already at or past turn
  if (wait <= 2) {
    const startStr = formatTime12H(baseTime);
    const end = new Date(baseTime.getTime() + 15 * 60000);
    return {
      estimatedTime: startStr,
      estimatedWindow: formatTimeRange(baseTime, end),
      recommendedArrivalTime: 'Immediate (Head to hospital now)',
      isNearTurn: true,
    };
  }

  // Central estimated consultation time
  const centralEstDate = new Date(baseTime.getTime() + wait * 60000);
  const estimatedTime = formatTime12H(centralEstDate);

  // Standard 20-minute buffer window centered at waitMinutes (±10 minutes)
  const bufferMin = Math.max(10, Math.min(15, Math.round(wait * 0.2)));
  const windowStartDate = new Date(baseTime.getTime() + Math.max(2, wait - bufferMin) * 60000);
  const windowEndDate = new Date(baseTime.getTime() + (wait + bufferMin) * 60000);

  const estimatedWindow = formatTimeRange(windowStartDate, windowEndDate);

  // Recommended arrival: 15 minutes before window start
  const arrivalOffsetMin = 15;
  const arrivalDate = new Date(windowStartDate.getTime() - arrivalOffsetMin * 60000);

  let recommendedArrivalTime = formatTime12H(arrivalDate);
  if (arrivalDate.getTime() <= baseTime.getTime() + 2 * 60000) {
    recommendedArrivalTime = 'Immediate (Head to hospital now)';
  }

  return {
    estimatedTime,
    estimatedWindow,
    recommendedArrivalTime,
    isNearTurn: wait <= 15,
  };
}

/**
 * Priority-based sorting order for waiting tokens (Deterministic Fallback)
 */
export function sortTokensByPriority(tokens = []) {
  const priorityRank = {
    critical: 1,
    emergency: 1,
    urgent: 2,
    senior: 2,
    general: 3,
    routine: 3,
  };

  return [...tokens].sort((a, b) => {
    const rankA = priorityRank[a.priority] || 3;
    const rankB = priorityRank[b.priority] || 3;
    if (rankA !== rankB) {
      return rankA - rankB;
    }
    return new Date(a.createdAt) - new Date(b.createdAt);
  });
}

/**
 * Generate human-readable reason for priority queue position
 */
export function getPriorityReason(token, position, totalWaiting) {
  if (token.status === 'in-progress') {
    return 'Currently in consultation';
  }
  const p = (token.priority || '').toLowerCase();
  if (p === 'emergency' || p === 'critical') {
    return 'Moved up due to Critical/Emergency priority';
  }
  if (p === 'senior' || p === 'urgent') {
    return 'Priority queue for Senior/Urgent patient';
  }
  return 'Standard queue order';
}

/**
 * Calculate virtual queue metrics for a specific token
 * Seamlessly integrates AI service priority-score and wait-estimate/patient,
 * with 100% resilient deterministic fallback if AI is offline.
 */
export async function calculateTokenQueueMetrics(
  token,
  allWaitingTokens = [],
  avgTime = 10,
  inProgressToken = null,
  precomputedAiQueue = null
) {
  // 1. If token is in consultation
  if (token.status === 'in-progress') {
    const timeWin = calculateTimeWindow(0);
    return {
      tokenNumber: token.tokenNumber,
      position: 0,
      patientsAhead: 0,
      status: 'in-progress',
      estimatedWaitMinutes: 0,
      estimatedTime: timeWin.estimatedTime,
      estimatedWindow: timeWin.estimatedWindow,
      recommendedArrivalTime: timeWin.recommendedArrivalTime,
      priority: token.priority,
      reason: 'Currently with doctor',
      lastUpdated: new Date().toISOString(),
    };
  }

  // 2. Measure elapsed in-progress consultation (detect if doctor slows down)
  let elapsedInProgressMin = 0;
  if (inProgressToken?.calledAt) {
    elapsedInProgressMin = Math.max(
      0,
      Math.round((Date.now() - new Date(inProgressToken.calledAt).getTime()) / 60000)
    );
  }

  // 3. Attempt AI priority-score reordering with fallback to local sort
  const sorted = sortTokensByPriority(allWaitingTokens);
  let position = sorted.findIndex((t) => t._id?.toString() === token._id?.toString()) + 1;
  if (position === 0) {
    position = sorted.length + 1;
  }
  let reason = getPriorityReason(token, position, sorted.length);

  // Check precomputed AI priority score first (Batch Mode)
  const tokenKey = token._id?.toString() || String(token.tokenNumber);
  if (precomputedAiQueue && (precomputedAiQueue.has(tokenKey) || precomputedAiQueue.has(String(token.tokenNumber)))) {
    const match = precomputedAiQueue.get(tokenKey) || precomputedAiQueue.get(String(token.tokenNumber));
    if (match) {
      position = match.effective_position;
      reason = match.reason;
    }
  } else if (!precomputedAiQueue && allWaitingTokens.length > 0) {
    // Single-token on-demand lookup
    try {
      const queuePayload = allWaitingTokens.map((t) => ({
        token_id: t._id?.toString() || String(t.tokenNumber),
        token_number: t.tokenNumber,
        priority: t.priority || 'general',
        arrival_time: t.createdAt ? new Date(t.createdAt).toISOString() : null,
      }));

      const aiRes = await axios.post(
        `${getAiUrl()}/priority-score`,
        { queue: queuePayload },
        { timeout: 400 }
      );

      if (aiRes.data?.effective_queue?.length) {
        const match = aiRes.data.effective_queue.find(
          (q) => q.token_id === tokenKey || q.token_number === token.tokenNumber
        );
        if (match) {
          position = match.effective_position;
          reason = match.reason;
        }
      }
    } catch (err) {
      // Graceful fallback to local priority sorting
    }
  }

  const patientsAhead = Math.max(0, position - 1);

  // 4. Calculate wait time (try AI wait-estimate/patient, fallback to deterministic)
  const inProgDelay =
    elapsedInProgressMin > avgTime
      ? elapsedInProgressMin - avgTime + 2
      : elapsedInProgressMin > 0
      ? Math.max(2, avgTime - elapsedInProgressMin)
      : 0;

  let estimatedWaitMinutes = inProgDelay + patientsAhead * avgTime;

  try {
    const aiEstimateRes = await axios.post(
      `${getAiUrl()}/wait-estimate/patient`,
      {
        token_id: token._id?.toString(),
        patients_ahead: patientsAhead,
        avg_time: avgTime,
        time_of_day: new Date().getHours() + new Date().getMinutes() / 60,
        elapsed_in_progress_minutes: elapsedInProgressMin,
      },
      { timeout: 350 }
    );

    if (aiEstimateRes.data?.estimated_wait_minutes) {
      estimatedWaitMinutes = aiEstimateRes.data.estimated_wait_minutes;
    }
  } catch (err) {
    // Deterministic fallback: in-progress delay + patients ahead * rolling average
    estimatedWaitMinutes = inProgDelay + patientsAhead * avgTime;
  }

  const timeWin = calculateTimeWindow(estimatedWaitMinutes);

  return {
    tokenNumber: token.tokenNumber,
    position,
    patientsAhead,
    status: token.status,
    estimatedWaitMinutes: Math.round(estimatedWaitMinutes),
    estimatedTime: timeWin.estimatedTime,
    estimatedWindow: timeWin.estimatedWindow,
    recommendedArrivalTime: timeWin.recommendedArrivalTime,
    priority: token.priority,
    reason,
    lastUpdated: new Date().toISOString(),
  };
}

/**
 * Broadcast real-time queue position updates and near-turn notifications
 * to each patient's private Socket.IO room (patient-room:{patientId}).
 */
export async function broadcastPatientQueueUpdates() {
  const todayStr = new Date().toISOString().slice(0, 10);

  // Fetch active appointments today that have a linked Token
  const activeAppointments = await Appointment.find({
    date: todayStr,
    tokenId: { $ne: null },
    status: { $nin: ['cancelled', 'completed', 'no-show'] },
  })
    .populate('tokenId')
    .lean();

  if (activeAppointments.length === 0) return;

  // Fetch current waiting tokens and in-progress token for today
  const [waitingTokens, inProgressToken, avgTime] = await Promise.all([
    Token.find({ sessionDate: todayStr, status: 'waiting' }).lean(),
    Token.findOne({ sessionDate: todayStr, status: 'in-progress' }).lean(),
    getAvgConsultTime(),
  ]);

  // Batch evaluate AI priority scoring ONCE for the entire waiting queue
  const precomputedAiQueue = new Map();
  if (waitingTokens.length > 0) {
    try {
      const queuePayload = waitingTokens.map((t) => ({
        token_id: t._id?.toString() || String(t.tokenNumber),
        token_number: t.tokenNumber,
        priority: t.priority || 'general',
        arrival_time: t.createdAt ? new Date(t.createdAt).toISOString() : null,
      }));

      const aiRes = await axios.post(
        `${getAiUrl()}/priority-score`,
        { queue: queuePayload },
        { timeout: 400 }
      );

      if (aiRes.data?.effective_queue?.length) {
        for (const q of aiRes.data.effective_queue) {
          if (q.token_id) precomputedAiQueue.set(String(q.token_id), q);
          if (q.token_number !== undefined) precomputedAiQueue.set(String(q.token_number), q);
        }
      }
    } catch {
      // Graceful fallback to deterministic priority sorting
    }
  }

  for (const apt of activeAppointments) {
    const token = apt.tokenId;
    if (!token || !apt.patientId) continue;

    const patientId = apt.patientId._id ? apt.patientId._id.toString() : apt.patientId.toString();

    const metrics = await calculateTokenQueueMetrics(
      token,
      waitingTokens,
      avgTime,
      inProgressToken,
      precomputedAiQueue
    );

    // Emit position update to patient's private room
    emitToPatientRoom(patientId, 'queue:position-update', {
      appointmentId: apt._id,
      tokenNumber: token.tokenNumber,
      position: metrics.position,
      patientsAhead: metrics.patientsAhead,
      status: metrics.status,
      estimatedTime: metrics.estimatedTime,
      estimatedWindow: metrics.estimatedWindow,
      recommendedArrivalTime: metrics.recommendedArrivalTime,
      priority: metrics.priority,
      reason: metrics.reason,
      lastUpdated: metrics.lastUpdated,
    });

    // If patient is near turn, emit near-turn alert
    if (metrics.patientsAhead <= NEAR_TURN_THRESHOLD && metrics.status === 'waiting') {
      const nearTurnMsg = `Almost your turn! Only ${metrics.patientsAhead} patient${
        metrics.patientsAhead === 1 ? '' : 's'
      } ahead. Recommended arrival: ${metrics.recommendedArrivalTime}.`;

      emitToPatientRoom(patientId, 'queue:near-turn', {
        appointmentId: apt._id,
        tokenNumber: token.tokenNumber,
        position: metrics.position,
        patientsAhead: metrics.patientsAhead,
        estimatedTime: metrics.estimatedTime,
        recommendedArrivalTime: metrics.recommendedArrivalTime,
        message: nearTurnMsg,
      });

      // Unified Notification trigger
      import('./notificationService.js')
        .then(({ createNotification }) => {
          createNotification({
            recipient: patientId,
            type: 'near_turn',
            title: 'Almost Your Turn in Queue',
            message: nearTurnMsg,
            metadata: {
              appointmentId: apt._id,
              tokenNumber: token.tokenNumber,
              position: metrics.position,
              patientsAhead: metrics.patientsAhead,
            },
          }).catch(() => {});
        })
        .catch(() => {});
    }
  }
}

/**
 * Get live queue position for a specific appointment
 */
export async function getAppointmentQueuePosition(appointmentId) {
  const appointment = await Appointment.findById(appointmentId).populate('tokenId');
  if (!appointment) {
    throw new Error('Appointment not found');
  }

  const todayStr = new Date().toISOString().slice(0, 10);

  // If appointment is not for today, return scheduled status
  if (appointment.date !== todayStr) {
    return {
      isLiveQueue: false,
      appointmentId: appointment._id,
      status: appointment.status,
      date: appointment.date,
      slotTime: appointment.slotTime,
      position: null,
      patientsAhead: null,
      estimatedTime: appointment.slotTime,
      estimatedWindow: `${appointment.slotTime} (Scheduled)`,
      recommendedArrivalTime: '15 mins before scheduled slot',
      priority: appointment.priority,
      reason: `Appointment scheduled for ${appointment.date}`,
      lastUpdated: new Date().toISOString(),
    };
  }

  // If appointment is for today but doesn't have a token yet, generate/link it now
  let token = appointment.tokenId;
  if (!token && ['booked', 'checked-in'].includes(appointment.status)) {
    try {
      const patient = await User.findById(appointment.patientId).select('name age').lean();
      const mappedPriority =
        appointment.priority === 'critical'
          ? 'emergency'
          : appointment.priority === 'urgent'
          ? 'senior'
          : 'general';

      const newToken = await generateToken({
        patientName: patient?.name || 'Patient (Appointment)',
        age: patient?.age || null,
        condition: appointment.chiefComplaint || 'Consultation',
        priority: mappedPriority,
        department: 'OPD',
      });

      if (newToken) {
        appointment.tokenId = newToken._id;
        await appointment.save();
        token = newToken;
      }
    } catch (err) {
      console.warn('Auto token generation error:', err.message);
    }
  }

  if (!token) {
    return {
      isLiveQueue: false,
      appointmentId: appointment._id,
      status: appointment.status,
      date: appointment.date,
      slotTime: appointment.slotTime,
      position: null,
      patientsAhead: null,
      estimatedTime: appointment.slotTime,
      estimatedWindow: `${appointment.slotTime} (Scheduled)`,
      recommendedArrivalTime: '15 mins before slot',
      priority: appointment.priority,
      reason: 'No queue token active for this appointment',
      lastUpdated: new Date().toISOString(),
    };
  }

  const [waitingTokens, inProgressToken, avgTime] = await Promise.all([
    Token.find({ sessionDate: todayStr, status: 'waiting' }).lean(),
    Token.findOne({ sessionDate: todayStr, status: 'in-progress' }).lean(),
    getAvgConsultTime(),
  ]);

  const metrics = await calculateTokenQueueMetrics(token, waitingTokens, avgTime, inProgressToken);

  return {
    isLiveQueue: true,
    appointmentId: appointment._id,
    tokenNumber: token.tokenNumber,
    position: metrics.position,
    patientsAhead: metrics.patientsAhead,
    estimatedTime: metrics.estimatedTime,
    estimatedWindow: metrics.estimatedWindow,
    recommendedArrivalTime: metrics.recommendedArrivalTime,
    priority: metrics.priority,
    reason: metrics.reason,
    lastUpdated: metrics.lastUpdated,
    status: metrics.status,
  };
}

/**
 * Get live queue position for a walk-in token by token number or ID
 */
export async function getTokenQueuePosition(tokenNumberOrId) {
  const todayStr = new Date().toISOString().slice(0, 10);

  let token = null;
  if (typeof tokenNumberOrId === 'number' || !isNaN(Number(tokenNumberOrId))) {
    token = await Token.findOne({ sessionDate: todayStr, tokenNumber: Number(tokenNumberOrId) }).lean();
  }
  if (!token) {
    try {
      token = await Token.findById(tokenNumberOrId).lean();
    } catch (e) {
      // not a valid ObjectId
    }
  }

  if (!token) {
    throw new Error(`Token #${tokenNumberOrId} not found in today's queue`);
  }

  const [waitingTokens, inProgressToken, avgTime] = await Promise.all([
    Token.find({ sessionDate: todayStr, status: 'waiting' }).lean(),
    Token.findOne({ sessionDate: todayStr, status: 'in-progress' }).lean(),
    getAvgConsultTime(),
  ]);

  const metrics = await calculateTokenQueueMetrics(token, waitingTokens, avgTime, inProgressToken);

  return {
    isLiveQueue: true,
    tokenNumber: token.tokenNumber,
    position: metrics.position,
    patientsAhead: metrics.patientsAhead,
    estimatedTime: metrics.estimatedTime,
    estimatedWindow: metrics.estimatedWindow,
    recommendedArrivalTime: metrics.recommendedArrivalTime,
    priority: metrics.priority,
    reason: metrics.reason,
    lastUpdated: metrics.lastUpdated,
    status: metrics.status,
  };
}
