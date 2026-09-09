import Token from '../models/Token.js';
import QueueState from '../models/QueueState.js';
import { getIO } from '../socketHandler.js';

const getToday = () => new Date().toISOString().split('T')[0];

// ── Helper: Get current daily state ──
const getQueueState = async (date) => {
  const targetDate = date || getToday();
  let state = await QueueState.findOne({ date: targetDate, department: 'OPD' });
  if (!state) {
    state = await QueueState.create({ 
      date: targetDate, 
      department: 'OPD', 
      currentTokenNumber: 0,
      waitingCount: 0,
      totalTokensIssued: 0
    });
  }
  return state;
};

// ── Generate a new token (Refactored Clean Version + Advanced Features) ──
// ── Generate a new token (Refactored Clean Version + Advanced Features) ──
export const generateToken = async ({
  patientName,
  age,
  condition,
  priority = 'routine',
  department = 'OPD',
}) => {
  const todayDate = getToday();
  
  // Normalize priority to critical / urgent / routine
  let mappedPriority = priority;
  if (priority === 'normal' || priority === 'general') mappedPriority = 'routine';
  else if (priority === 'senior') mappedPriority = 'urgent';
  else if (priority === 'emergency') mappedPriority = 'critical';

  let priorityScore = mappedPriority === 'critical' ? 95 : mappedPriority === 'urgent' ? 70 : 25;
  let priorityReason = 'Standard queue order';
  let priorityConfidence = 0.9;
  let decisionSource = 'triage_rule';

  // If a clinical condition is provided and not already manually specified as critical/urgent,
  // evaluate with Clinical Decision Support (CDS)
  if (condition && condition.trim().length > 0 && priority === 'routine') {
    try {
      const { evaluateConditionPriority } = await import('./priorityService.js');
      const cds = await evaluateConditionPriority({ condition, age });
      if (cds) {
        mappedPriority = cds.priority;
        priorityScore = cds.score;
        priorityReason = cds.reason;
        priorityConfidence = cds.confidence;
        decisionSource = cds.decisionSource;
      }
    } catch (cdsErr) {
      console.warn('CDS condition evaluation skipped:', cdsErr.message);
    }
  }

  // 1. Atomic increment of token number
  const state = await QueueState.findOneAndUpdate(
    { date: todayDate, department: 'OPD' },
    { $inc: { currentTokenNumber: 1, totalTokensIssued: 1, waitingCount: 1 } },
    { upsert: true, new: true }
  );

  // 3. Calculate initial wait time estimate
  const estimatedWaitTime = await calculateWaitTime({
    priority: mappedPriority,
    createdAt: new Date(),
    sessionDate: todayDate
  });

  // 4. Save to MongoDB
  const token = await Token.create({
    tokenNumber: state.currentTokenNumber,
    patientName,
    age: age || null,
    condition: condition || '',
    priority: mappedPriority,
    priorityScore,
    priorityReason,
    priorityConfidence,
    decisionSource,
    department: department || 'OPD',
    status: 'waiting',
    isEmergency: mappedPriority === 'critical' || mappedPriority === 'emergency',
    sessionDate: todayDate,
    estimatedWaitTime
  });

  // 5. Emit real-time events
  const io = getIO();
  if (io) {
    io.to('queue-room').emit('token_created', token);
    await emitQueueUpdate();
  }

  return token;
};

// ── Get active queue (Sorted by Policy with Starvation Prevention) ──
export const getQueue = async () => {
  const avgConsult = await getAvgConsultTime();
  const timeFactor = 1 + 0.15 * Math.sin((new Date().getHours() * Math.PI) / 12);
  const avgConsultAdjusted = Math.round(avgConsult * timeFactor);

  const tokens = await Token.find({ 
    sessionDate: getToday(), 
    status: { $in: ['waiting', 'in-progress', 'done'] } 
  }).lean().exec();

  const inProgressTokens = tokens.filter((t) => t.status === 'in-progress');
  const waitingTokens = tokens.filter((t) => t.status === 'waiting');
  const doneTokens = tokens.filter((t) => t.status === 'done');

  // Apply intelligent queue policy with starvation prevention to waiting tokens
  let sortedWaiting = waitingTokens;
  try {
    const { applyQueuePolicy } = await import('./priorityService.js');
    sortedWaiting = await applyQueuePolicy(waitingTokens, { logAudit: false });
  } catch (err) {
    // Fallback: priority rank then FIFO
    const priorityRank = { critical: 1, emergency: 1, urgent: 2, senior: 2, routine: 3, general: 3 };
    sortedWaiting.sort((a, b) => {
      const pA = priorityRank[a.priority] || 3;
      const pB = priorityRank[b.priority] || 3;
      if (pA !== pB) return pA - pB;
      return new Date(a.createdAt) - new Date(b.createdAt);
    });
  }

  // Dynamic wait-time recalculation
  let waitPos = 0;
  const processedWaiting = sortedWaiting.map((t) => {
    waitPos++;
    t.waitingPosition = waitPos;
    t.estimatedWaitTime = waitPos * avgConsultAdjusted;
    return t;
  });

  const processedInProgress = inProgressTokens.map((t) => {
    t.waitingPosition = 0;
    t.estimatedWaitTime = 0;
    return t;
  });

  doneTokens.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
  const processedDone = doneTokens.map((t) => {
    t.waitingPosition = 0;
    t.estimatedWaitTime = 0;
    return t;
  });

  return [...processedInProgress, ...processedWaiting, ...processedDone];
};

// ── Call next patient (Policy-Respecting Search with Starvation Prevention) ──
export const callNextToken = async () => {
  const waitingTokens = await Token.find({ sessionDate: getToday(), status: 'waiting' })
    .sort({ createdAt: 1 })
    .lean();

  if (!waitingTokens || waitingTokens.length === 0) {
    throw new Error('No waiting patients in queue');
  }

  let targetToken = waitingTokens[0];
  try {
    const { applyQueuePolicy } = await import('./priorityService.js');
    const reordered = await applyQueuePolicy(waitingTokens, { logAudit: false });
    if (reordered.length > 0) {
      targetToken = reordered[0];
    }
  } catch (err) {
    // Fallback priority search
    const priorityOrder = ['critical', 'emergency', 'urgent', 'senior', 'routine', 'general'];
    for (const p of priorityOrder) {
      const match = waitingTokens.find((t) => t.priority === p);
      if (match) {
        targetToken = match;
        break;
      }
    }
  }

  const nextToken = await Token.findByIdAndUpdate(
    targetToken._id,
    { status: 'in-progress', calledAt: new Date() },
    { new: true }
  );

  if (!nextToken) {
    throw new Error('Could not call next patient');
  }

  // Update real-time state
  const io = getIO();
  if (io) {
    io.to('queue-room').emit('patient_called', nextToken);
    await emitQueueUpdate();
  }

  return nextToken;
};

// ── Complete consultation ──
export const completeToken = async (tokenNumber) => {
  const token = await Token.findOneAndUpdate(
    { tokenNumber: Number(tokenNumber), sessionDate: getToday(), status: 'in-progress' },
    { status: 'done', completedAt: new Date() },
    { new: true }
  );

  if (!token) throw new Error('Token not found or not in-progress');

  // Log performance metrics
  if (token.calledAt) {
    token.consultationDuration = Math.round((token.completedAt - token.calledAt) / 60000);
    await token.save();
  }

  // Decr waiting count & incr completed
  await QueueState.findOneAndUpdate(
    { date: getToday(), department: 'OPD' },
    { $inc: { waitingCount: -1, totalCompleted: 1 } }
  );

  // Invalidate consultation time cache immediately so doctor's new speed is reflected
  cacheTimestamp = 0;

  // Inform AI service of new completion duration (fire-and-forget)
  try {
    const { updateAiData } = await import('./aiService.js');
    updateAiData(token).catch(() => {});
  } catch (err) {
    // ignore
  }

  const io = getIO();
  if (io) {
    io.to('queue-room').emit('consultation_complete', token);
    await emitQueueUpdate();
  }

  return token;
};

// ── Helper: Rolling Average Consultation Time ──
let avgConsultCache = 10;
let cacheTimestamp = 0;
const CACHE_TTL = 60 * 1000;

export const clearAvgConsultCache = () => {
  cacheTimestamp = 0;
};

export const getAvgConsultTime = async () => {
  const now = Date.now();
  if (now - cacheTimestamp < CACHE_TTL) return avgConsultCache;

  try {
    const recent = await Token.find({ status: 'done', consultationDuration: { $gt: 0 } })
      .sort({ completedAt: -1 }).limit(20).select('consultationDuration').lean();

    if (recent.length > 0) {
      const total = recent.reduce((sum, t) => sum + t.consultationDuration, 0);
      avgConsultCache = Math.round(total / recent.length);
    }
    cacheTimestamp = now;
    return avgConsultCache;
  } catch (err) {
    return avgConsultCache;
  }
};

// ── Helper: Calculate single token wait time ──
export const calculateWaitTime = async (token) => {
  const sessionDate = getToday();
  const p = token.priority || 'general';
  
  let hPriorityQuery = {};
  let sPriorityQuery = {};
  
  if (p === 'emergency') {
    sPriorityQuery = { priority: 'emergency', createdAt: { $lt: token.createdAt } };
  } else if (p === 'senior') {
    hPriorityQuery = { priority: 'emergency' };
    sPriorityQuery = { priority: 'senior', createdAt: { $lt: token.createdAt } };
  } else {
    hPriorityQuery = { priority: { $in: ['emergency', 'senior'] } };
    sPriorityQuery = { priority: 'general', createdAt: { $lt: token.createdAt } };
  }

  const waitingAhead = await Token.countDocuments({
    sessionDate, status: 'waiting',
    $or: [hPriorityQuery, sPriorityQuery].filter(q => Object.keys(q).length > 0)
  });

  const avgTime = await getAvgConsultTime();
  return waitingAhead * avgTime;
};

// ── Core Helper: Push updates to all panels ──
export const emitQueueUpdate = async () => {
  const io = getIO();
  if (io) {
    const queue = await getQueue();
    const waitStats = {
      avgWait: await getAvgConsultTime(),
      queueLength: queue.filter(t => t.status === 'waiting').length
    };
    io.to('queue-room').emit('queue_updated', queue);
    io.to('queue-room').emit('wait_time_updated', waitStats);

    // Additionally push real-time position updates to patient rooms
    try {
      const { broadcastPatientQueueUpdates } = await import('./virtualQueueService.js');
      await broadcastPatientQueueUpdates();
    } catch (err) {
      console.warn('Patient room queue update broadcast skipped:', err.message);
    }
  }
};

// ── Extra Handlers ──
export const getTokenById = async (id) => Token.findById(id).lean();

export const cancelToken = async (id) => {
  const token = await Token.findByIdAndUpdate(id, { status: 'cancelled', cancelledAt: new Date() }, { new: true });
  await QueueState.findOneAndUpdate({ date: getToday(), department: 'OPD' }, { $inc: { waitingCount: -1, totalCancelled: 1 } });
  await emitQueueUpdate();
  return token;
};

export const updateTokenPriority = async (id, newPriority) => {
  const valid = ['emergency', 'senior', 'general'];
  const p = (newPriority || '').toLowerCase();
  const mapped = p === 'critical' ? 'emergency' : p === 'urgent' ? 'senior' : p === 'routine' ? 'general' : p;
  if (!valid.includes(mapped)) {
    throw new Error(`Invalid priority. Must be one of: ${valid.join(', ')}`);
  }

  const token = await Token.findByIdAndUpdate(id, { priority: mapped }, { new: true });
  if (!token) throw new Error('Token not found');

  await emitQueueUpdate();
  return token;
};