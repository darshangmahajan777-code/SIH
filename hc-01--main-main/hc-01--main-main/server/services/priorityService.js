import axios from 'axios';
import Token from '../models/Token.js';
import Appointment from '../models/Appointment.js';
import PriorityAuditLog from '../models/PriorityAuditLog.js';

const getAiUrl = () => process.env.AI_SERVICE_URL || process.env.AI_URL || 'http://localhost:8001';

// ── Configurable Queue Policy State ──
let queuePolicyConfig = {
  starvationLimit: Number(process.env.STARVATION_LIMIT) || 2,
  criticalMaxConsecutive: 2,
  enabled: true,
};

export function getQueuePolicy() {
  return { ...queuePolicyConfig };
}

export function updateQueuePolicy({ starvationLimit, enabled }) {
  if (starvationLimit !== undefined) {
    queuePolicyConfig.starvationLimit = Math.max(1, Number(starvationLimit));
  }
  if (enabled !== undefined) {
    queuePolicyConfig.enabled = Boolean(enabled);
  }
  return { ...queuePolicyConfig };
}

/**
 * Normalize priority strings to standard: 'critical' | 'urgent' | 'routine'
 */
export function normalizePriority(p) {
  const pl = (p || '').toLowerCase().trim();
  if (['critical', 'emergency'].includes(pl)) return 'critical';
  if (['urgent', 'senior'].includes(pl)) return 'urgent';
  return 'routine';
}

/**
 * Clinical Decision Support (CDS): Evaluate patient condition.
 * Calls AI service with deterministic clinical rules fallback if AI is offline.
 * Always returns non-autonomous CDS metadata and disclaimer.
 */
export async function evaluateConditionPriority({ condition = '', age = null, vitals = {} }) {
  const disclaimer =
    'Clinical Decision Support (CDS) recommendation only. Not an autonomous medical diagnosis. Physician/clinician oversight required.';

  // 1. Try FastAPI AI service
  try {
    const aiRes = await axios.post(
      `${getAiUrl()}/priority/evaluate-condition`,
      { condition, age, vitals },
      { timeout: 1500 }
    );
    if (aiRes.data && aiRes.data.priority) {
      return {
        priority: normalizePriority(aiRes.data.priority),
        score: aiRes.data.score || 50,
        reason: aiRes.data.reason || 'Clinical Decision Support recommendation',
        confidence: aiRes.data.confidence || 0.9,
        decisionSource: 'ai_cds',
        isCdsRecommendation: true,
        disclaimer: aiRes.data.disclaimer || disclaimer,
      };
    }
  } catch (err) {
    // Graceful fallback to local deterministic triage rules
  }

  // 2. Deterministic Rule-Based Fallback (Offline CDS)
  const condLower = (condition || '').toLowerCase();
  const criticalKeywords = [
    'chest pain', 'heart attack', 'cardiac', 'stroke', 'seizure',
    'unconscious', 'unresponsive', 'anaphylaxis', 'choking', 'cannot breathe',
    'severe bleeding', 'severe trauma', 'cyanosis', 'respiratory distress',
  ];
  const urgentKeywords = [
    'fracture', 'high fever', 'abdominal pain', 'asthma', 'vomiting blood',
    'head injury', 'deep cut', 'severe burn', 'kidney stone', 'acute pain',
    'dehydration', 'dislocation', 'breathing difficulty',
  ];

  const isCritical = criticalKeywords.some((kw) => condLower.includes(kw));
  if (isCritical) {
    const kw = criticalKeywords.find((k) => condLower.includes(k)) || 'acute distress';
    return {
      priority: 'critical',
      score: 95,
      reason: `Clinical priority: Potential acute emergency indicated by '${kw}'. Requires urgent clinician review.`,
      confidence: 0.92,
      decisionSource: 'triage_rule',
      isCdsRecommendation: true,
      disclaimer,
    };
  }

  const isUrgent =
    urgentKeywords.some((kw) => condLower.includes(kw)) ||
    (age !== null && age < 1 && condLower.includes('fever'));

  if (isUrgent) {
    const kw = urgentKeywords.find((k) => condLower.includes(k)) || 'elevated symptoms';
    return {
      priority: 'urgent',
      score: 70,
      reason: `Clinical priority: Expedited attention recommended for '${kw}'.`,
      confidence: 0.85,
      decisionSource: 'triage_rule',
      isCdsRecommendation: true,
      disclaimer,
    };
  }

  return {
    priority: 'routine',
    score: 25,
    reason: 'Clinical priority: Non-emergent presentation suitable for standard queue order.',
    confidence: 0.9,
    decisionSource: 'triage_rule',
    isCdsRecommendation: true,
    disclaimer,
  };
}

/**
 * Transparent Weighted/Interleaved Queue Policy with Starvation Prevention
 * Reorders waiting tokens so critical/urgent patients advance,
 * but guarantees routine patients are interleaved after starvationLimit consecutive higher-priority cases.
 * Logs position changes to PriorityAuditLog.
 */
export async function applyQueuePolicy(waitingTokens = [], options = {}) {
  const starvationLimit = options.starvationLimit || queuePolicyConfig.starvationLimit || 2;
  const shouldLogAudit = options.logAudit !== false;

  if (!waitingTokens || waitingTokens.length === 0) {
    return [];
  }

  // 1. Tag original positions (FIFO arrival order)
  const initialPool = waitingTokens.map((t, index) => ({
    token: t,
    originalPos: index + 1,
    priority: normalizePriority(t.priority),
    isOverridden: Boolean(t.isOverridden),
  }));

  // 2. Separate into priority queues while preserving arrival order
  const criticals = [];
  const urgents = [];
  const routines = [];

  for (const item of initialPool) {
    if (item.priority === 'critical') criticals.append ? criticals.append(item) : criticals.push(item);
    else if (item.priority === 'urgent') urgents.push(item);
    else routines.push(item);
  }

  // 3. Interleave scheduling
  const reordered = [];
  let consecutiveHigher = 0;

  while (criticals.length > 0 || urgents.length > 0 || routines.length > 0) {
    // Starvation check: If starvationLimit reached and routine patients are waiting, interleave one routine
    if (consecutiveHigher >= starvationLimit && routines.length > 0) {
      const r = routines.shift();
      const reason = 'Interleaved turn: Starvation prevention policy';
      reordered.push({ ...r, reason, isStarvationPrevented: true });
      consecutiveHigher = 0;
      continue;
    }

    if (criticals.length > 0) {
      const c = criticals.shift();
      const reason = c.isOverridden
        ? `Clinician Override: ${c.token.overrideReason || 'Elevated to Critical by Doctor'}`
        : 'Moved up: Critical clinical priority (CDS Recommendation)';
      reordered.push({ ...c, reason });
      consecutiveHigher += 1;
    } else if (urgents.length > 0) {
      const u = urgents.shift();
      const reason = u.isOverridden
        ? `Clinician Override: ${u.token.overrideReason || 'Urgent clinical review'}`
        : 'Priority queue for Urgent patient';
      reordered.push({ ...u, reason });
      consecutiveHigher += 1;
    } else if (routines.length > 0) {
      const r = routines.shift();
      reordered.push({ ...r, reason: 'Standard FIFO order' });
      consecutiveHigher = 0;
    }
  }

  // 4. Record audit log for patients whose positions or priority changed
  const auditEntries = [];
  const finalQueue = reordered.map((item, idx) => {
    const newPos = idx + 1;
    const token = item.token;

    // Adjust reason if routine patient moved back due to higher priority, unless interleaved by starvation prevention
    let finalReason = item.reason;
    if (item.isStarvationPrevented) {
      finalReason = item.reason;
    } else if (item.priority === 'routine' && newPos > item.originalPos) {
      finalReason = 'Adjusted for incoming Critical/Urgent patients';
    }

    if (shouldLogAudit && token._id) {
      auditEntries.push({
        tokenId: token._id,
        tokenNumber: token.tokenNumber,
        patientName: token.patientName || '',
        originalPosition: item.originalPos,
        newPosition: newPos,
        priority: item.priority,
        previousPriority: token.priority,
        score: token.priorityScore || (item.priority === 'critical' ? 95 : item.priority === 'urgent' ? 70 : 25),
        reason: finalReason,
        decisionSource: token.decisionSource || (item.isOverridden ? 'clinician_override' : 'ai_cds'),
        humanOverride: Boolean(token.isOverridden),
        overriddenBy: token.overriddenBy || null,
        overrideReason: token.overrideReason || null,
        timestamp: new Date(),
      });
    }

    return {
      ...token,
      queuePosition: newPos,
      originalPosition: item.originalPos,
      priority: item.priority,
      reason: finalReason,
    };
  });

  // Bulk write audit logs in background (fire-and-forget to never block queue operations)
  if (auditEntries.length > 0) {
    PriorityAuditLog.insertMany(auditEntries).catch((err) => {
      console.warn('Priority audit log write skipped:', err.message);
    });
  }

  return finalQueue;
}

/**
 * Clinician Priority Override
 * Authorizes a doctor or triage nurse to manually override AI/system priority.
 * Records the change in PriorityAuditLog with humanOverride=true.
 */
export async function overridePriority({
  tokenId,
  newPriority,
  overrideReason = 'Clinician direct override',
  doctorName = 'Attending Physician',
}) {
  const normPriority = normalizePriority(newPriority);

  const token = await Token.findById(tokenId);
  if (!token) {
    throw new Error('Token not found');
  }

  const previousPriority = token.priority;

  // Update Token
  token.priority = normPriority;
  token.isOverridden = true;
  token.overriddenBy = doctorName;
  token.overrideReason = overrideReason;
  token.decisionSource = 'clinician_override';
  token.priorityReason = `Clinician Override (${doctorName}): ${overrideReason}`;
  token.priorityConfidence = 1.0;
  token.priorityScore = normPriority === 'critical' ? 98 : normPriority === 'urgent' ? 75 : 30;
  await token.save();

  // If token is linked to an appointment, sync appointment priority as well
  try {
    await Appointment.findOneAndUpdate(
      { tokenId: token._id },
      { priority: normPriority }
    );
  } catch (err) {
    // ignore
  }

  // Create explicit human override audit log
  const auditLog = await PriorityAuditLog.create({
    tokenId: token._id,
    tokenNumber: token.tokenNumber,
    patientName: token.patientName || '',
    originalPosition: token.waitingPosition || 0,
    newPosition: token.waitingPosition || 0,
    priority: normPriority,
    previousPriority,
    score: token.priorityScore,
    reason: `Clinician Override by ${doctorName}: ${overrideReason}`,
    decisionSource: 'clinician_override',
    humanOverride: true,
    overriddenBy: doctorName,
    overrideReason,
    timestamp: new Date(),
  });

  // Trigger real-time queue recalculations
  try {
    const { emitQueueUpdate } = await import('./queueService.js');
    await emitQueueUpdate();
  } catch (err) {
    // ignore
  }

  return {
    success: true,
    token,
    auditLog,
    message: `Priority successfully overridden to ${normPriority} by ${doctorName}`,
  };
}

/**
 * Query priority audit logs
 */
export async function getPriorityAuditLog(filter = {}, limit = 50) {
  const query = {};
  if (filter.tokenId) query.tokenId = filter.tokenId;
  if (filter.tokenNumber) query.tokenNumber = Number(filter.tokenNumber);
  if (filter.humanOverride !== undefined) query.humanOverride = Boolean(filter.humanOverride);

  return PriorityAuditLog.find(query)
    .sort({ timestamp: -1 })
    .limit(Math.min(200, limit))
    .lean();
}
