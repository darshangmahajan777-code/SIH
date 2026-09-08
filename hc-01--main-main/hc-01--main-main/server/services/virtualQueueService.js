import Token from '../models/Token.js';
import Appointment from '../models/Appointment.js';
import { getAvgConsultTime } from './queueService.js';
import { emitToPatientRoom } from '../socketHandler.js';
import axios from 'axios';

const AI_URL = process.env.AI_URL || 'http://localhost:8001';
const NEAR_TURN_THRESHOLD = Number(process.env.NEAR_TURN_THRESHOLD) || 5;

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
 * Calculate realistic time window and recommended arrival time
 * @param {number} waitMinutes - estimated minutes until consultation
 * @param {Date} [baseTime=new Date()]
 */
export function calculateTimeWindow(waitMinutes, baseTime = new Date()) {
  const wait = Math.max(0, Math.round(waitMinutes));

  // If already at or past turn
  if (wait <= 2) {
    const startStr = formatTime12H(baseTime);
    const end = new Date(baseTime.getTime() + 15 * 60000);
    const endStr = formatTime12H(end);
    return {
      estimatedTime: startStr,
      estimatedWindow: `${startStr}–${endStr}`,
      recommendedArrivalTime: 'Immediate (Now)',
      isNearTurn: true,
    };
  }

  // Central estimated consultation time
  const centralEstDate = new Date(baseTime.getTime() + wait * 60000);
  const estimatedTime = formatTime12H(centralEstDate);

  // Buffer window: window starts (wait - 10) min, ends (wait + 10) min
  const bufferMin = Math.max(5, Math.min(15, Math.round(wait * 0.2)));
  const windowStartDate = new Date(baseTime.getTime() + Math.max(2, wait - bufferMin) * 60000);
  const windowEndDate = new Date(baseTime.getTime() + (wait + bufferMin) * 60000);

  const estimatedWindow = `${formatTime12H(windowStartDate)}–${formatTime12H(windowEndDate)}`;

  // Recommended arrival: 15 minutes before window start
  const arrivalOffsetMin = 15;
  const arrivalDate = new Date(windowStartDate.getTime() - arrivalOffsetMin * 60000);

  let recommendedArrivalTime = formatTime12H(arrivalDate);
  if (arrivalDate.getTime() <= baseTime.getTime()) {
    recommendedArrivalTime = 'Head to hospital now';
  }

  return {
    estimatedTime,
    estimatedWindow,
    recommendedArrivalTime,
    isNearTurn: wait <= 15,
  };
}

/**
 * Priority-based sorting order for waiting tokens
 */
export function sortTokensByPriority(tokens = []) {
  const priorityRank = { emergency: 1, senior: 2, general: 3 };

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
  if (token.priority === 'emergency') {
    return 'Moved up due to Critical/Emergency priority';
  }
  if (token.priority === 'senior') {
    return 'Priority queue for Senior Citizen';
  }
  return 'Standard queue order';
}

/**
 * Calculate virtual queue metrics for a specific token
 */
export async function calculateTokenQueueMetrics(token, allWaitingTokens, avgTime) {
  // Sort waiting tokens by priority and FIFO
  const sorted = sortTokensByPriority(allWaitingTokens);

  if (token.status === 'in-progress') {
    const timeWin = calculateTimeWindow(0);
    return {
      tokenNumber: token.tokenNumber,
      position: 0,
      patientsAhead: 0,
      status: 'in-progress',
      estimatedTime: timeWin.estimatedTime,
      estimatedWindow: 'Consultation In-Progress',
      recommendedArrivalTime: 'Inside Consultation Room',
      priority: token.priority,
      reason: 'Currently with doctor',
      lastUpdated: new Date().toISOString(),
    };
  }

  const index = sorted.findIndex((t) => t._id.toString() === token._id.toString());
  const position = index !== -1 ? index + 1 : sorted.length + 1;
  const patientsAhead = Math.max(0, position - 1);

  // Try AI service estimate with graceful fallback
  let estimatedWaitMinutes = patientsAhead * avgTime;
  try {
    const aiRes = await axios.post(
      `${AI_URL}/predict`,
      {
        patients_ahead: patientsAhead,
        avg_time: avgTime,
        time_of_day: new Date().getHours() + new Date().getMinutes() / 60,
      },
      { timeout: 1500 }
    );
    if (aiRes.data?.estimated_wait) {
      estimatedWaitMinutes = aiRes.data.estimated_wait;
    }
  } catch (err) {
    // AI offline: seamless deterministic fallback using rolling average
    estimatedWaitMinutes = patientsAhead * avgTime;
  }

  const timeWin = calculateTimeWindow(estimatedWaitMinutes);
  const reason = getPriorityReason(token, position, sorted.length);

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

  // Fetch all active appointments today that have a linked Token
  const activeAppointments = await Appointment.find({
    date: todayStr,
    tokenId: { $ne: null },
    status: { $nin: ['cancelled', 'completed'] },
  }).populate('tokenId').lean();

  if (activeAppointments.length === 0) return;

  // Fetch current waiting tokens for today
  const [waitingTokens, avgTime] = await Promise.all([
    Token.find({ sessionDate: todayStr, status: 'waiting' }).lean(),
    getAvgConsultTime(),
  ]);

  for (const apt of activeAppointments) {
    const token = apt.tokenId;
    if (!token || !apt.patientId) continue;

    const patientId = apt.patientId._id ? apt.patientId._id.toString() : apt.patientId.toString();

    const metrics = await calculateTokenQueueMetrics(token, waitingTokens, avgTime);

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
      emitToPatientRoom(patientId, 'queue:near-turn', {
        appointmentId: apt._id,
        tokenNumber: token.tokenNumber,
        patientsAhead: metrics.patientsAhead,
        recommendedArrivalTime: metrics.recommendedArrivalTime,
        message: `Almost your turn! Only ${metrics.patientsAhead} patient${metrics.patientsAhead === 1 ? '' : 's'} ahead. Please head to the hospital now.`,
      });
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
  if (appointment.date !== todayStr || !appointment.tokenId) {
    return {
      isLiveQueue: false,
      status: appointment.status,
      date: appointment.date,
      slotTime: appointment.slotTime,
      message: 'This appointment is not in the active today OPD queue',
    };
  }

  const token = appointment.tokenId;
  const [waitingTokens, avgTime] = await Promise.all([
    Token.find({ sessionDate: todayStr, status: 'waiting' }).lean(),
    getAvgConsultTime(),
  ]);

  const metrics = await calculateTokenQueueMetrics(token, waitingTokens, avgTime);

  return {
    isLiveQueue: true,
    appointmentId: appointment._id,
    ...metrics,
  };
}
