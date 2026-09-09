import axios from 'axios';
import { haversineDistance, calculateBayesianRating } from './recommendationService.js';

export const getAiUrl = () => process.env.AI_SERVICE_URL || process.env.AI_URL || 'http://localhost:8001';
const DEFAULT_TIMEOUT_MS = 2000;

// Default reference coordinates (Central Delhi)
const DEFAULT_LAT = 28.6139;
const DEFAULT_LNG = 77.2090;

// Standard Clinical Decision Support (CDS) Disclaimer
export const CDS_DISCLAIMER =
  'Clinical Decision Support (CDS) recommendation only. Not an autonomous medical diagnosis or prescription. Attending physician authority remains governing.';

/**
 * Robust AI Invocation Wrapper with Guaranteed Deterministic Fallback
 * Intercepts timeouts, connection errors, 5xx responses, and malformed payload schemas.
 */
export async function safeAiCall({
  endpoint,
  payload,
  fallbackFn,
  validator = (data) => Boolean(data),
  timeoutMs = DEFAULT_TIMEOUT_MS,
}) {
  try {
    const baseUrl = getAiUrl();
    const res = await axios.post(`${baseUrl}${endpoint.startsWith('/') ? endpoint : '/' + endpoint}`, payload, {
      timeout: timeoutMs,
    });

    if (res.status === 200 && res.data && validator(res.data)) {
      return {
        source: 'ai',
        data: res.data,
      };
    }
  } catch {
    // Graceful fallback to deterministic engine on connection error, timeout, or non-200
  }

  // Execute pure deterministic fallback
  const fallbackResult = await fallbackFn();
  return {
    source: 'deterministic_fallback',
    data: fallbackResult,
  };
}

/**
 * Check Python AI service connectivity & latency
 */
export async function checkAiServiceHealth() {
  const start = Date.now();
  try {
    const res = await axios.get(`${getAiUrl()}/health`, { timeout: 1000 });
    const latencyMs = Date.now() - start;
    return {
      status: 'online',
      latencyMs,
      details: res.data,
    };
  } catch (err) {
    return {
      status: 'offline',
      latencyMs: Date.now() - start,
      error: err.message,
    };
  }
}

// ── 1. WAIT TIME PREDICTION (POISSON-INSPIRED MODEL) ──

/**
 * Pure deterministic Poisson-inspired wait time calculation
 */
export function calculatePoissonWaitDeterministic({
  patientsAhead = 0,
  avgTime = 10.0,
  timeOfDay = null,
  elapsedInProgressMinutes = 0.0,
}) {
  const safePatientsAhead = Math.max(0, Number(patientsAhead) || 0);
  const safeAvgTime = Math.max(3.0, Number(avgTime) || 10.0);
  const safeElapsed = Math.max(0.0, Number(elapsedInProgressMinutes) || 0.0);

  const hourOfDay =
    timeOfDay !== null && timeOfDay !== undefined
      ? Number(timeOfDay)
      : new Date().getHours() + new Date().getMinutes() / 60;

  // Circadian time factor (peaks around 11:00 AM & 3:00 PM)
  const timeFactor = 1.0 + 0.15 * Math.sin((hourOfDay * Math.PI) / 12.0);

  let inProgressRemaining = 0.0;
  let doctorDelayDetected = false;
  if (safeElapsed > 0) {
    if (safeElapsed < safeAvgTime) {
      inProgressRemaining = Math.max(2.0, safeAvgTime - safeElapsed);
    } else {
      inProgressRemaining = 3.0 + (safeElapsed - safeAvgTime) * 0.3;
      doctorDelayDetected = true;
    }
  }

  const baseWait = safePatientsAhead * safeAvgTime * timeFactor;
  let totalWait = inProgressRemaining + baseWait;

  const uncertainty = Math.min(0.25, safePatientsAhead * 0.02);
  totalWait *= 1.0 + uncertainty;

  let confidence = Math.max(0.5, 1.0 - safePatientsAhead * 0.025);
  if (doctorDelayDetected) {
    confidence = Math.max(0.45, confidence - 0.1);
  }

  return {
    estimatedWaitMinutes: Math.round(totalWait * 10) / 10,
    confidence: Math.round(confidence * 100) / 100,
    factors: {
      effectiveAvgTime: Math.round(safeAvgTime * 10) / 10,
      timeFactor: Math.round(timeFactor * 1000) / 1000,
      inProgressRemaining: Math.round(inProgressRemaining * 10) / 10,
      doctorDelayDetected,
      uncertaintyBuffer: Math.round(uncertainty * 1000) / 1000,
    },
  };
}

/**
 * Predict wait time: Tries Python AI service, falls back to deterministic Poisson engine
 */
export async function predictWaitTime({
  patientsAhead = 0,
  avgTime = 10.0,
  timeOfDay = null,
  elapsedInProgress = 0.0,
} = {}) {
  const payload = {
    patients_ahead: Math.max(0, Number(patientsAhead) || 0),
    avg_time: Math.max(3.0, Number(avgTime) || 10.0),
    time_of_day: timeOfDay !== null && timeOfDay !== undefined ? Number(timeOfDay) : undefined,
    elapsed_in_progress_minutes: Math.max(0.0, Number(elapsedInProgress) || 0.0),
  };

  const fallback = () =>
    calculatePoissonWaitDeterministic({
      patientsAhead: payload.patients_ahead,
      avgTime: payload.avg_time,
      timeOfDay: payload.time_of_day,
      elapsedInProgressMinutes: payload.elapsed_in_progress_minutes,
    });

  const callResult = await safeAiCall({
    endpoint: '/wait-estimate/patient',
    payload,
    fallbackFn: fallback,
    validator: (data) =>
      typeof data.estimated_wait_minutes === 'number' && typeof data.confidence === 'number',
  });

  if (callResult.source === 'ai') {
    return {
      source: 'ai',
      estimatedWaitMinutes: callResult.data.estimated_wait_minutes,
      confidence: callResult.data.confidence,
      factors: callResult.data.factors || {},
    };
  }

  return {
    source: 'deterministic_fallback',
    ...callResult.data,
  };
}

// ── 2. EMERGENCY HOSPITAL RANKING (HAVERSINE + AVAILABILITY + SPECIALIZATION) ──

const MOCK_HOSPITALS = [
  { id: 1, name: 'City General Hospital', lat: 28.6200, lng: 77.2100, specializations: ['emergency', 'trauma', 'cardiology', 'general'], availability: 85, beds: 200, phone: '+91-11-2345-6789', address: '123 Main Road, Central Delhi' },
  { id: 2, name: 'Apollo Emergency Center', lat: 28.5500, lng: 77.2500, specializations: ['emergency', 'neurology', 'orthopedics'], availability: 72, beds: 150, phone: '+91-11-9876-5432', address: '456 Ring Road, South Delhi' },
  { id: 3, name: 'Max Super Specialty Hospital', lat: 28.6300, lng: 77.1800, specializations: ['cardiology', 'oncology', 'emergency'], availability: 60, beds: 300, phone: '+91-11-5555-1234', address: '789 Medical Lane, West Delhi' },
  { id: 4, name: 'Fortis Healthcare', lat: 28.5700, lng: 77.3200, specializations: ['orthopedics', 'pediatrics', 'general'], availability: 90, beds: 250, phone: '+91-11-4444-5678', address: '321 Health Ave, East Delhi' },
  { id: 5, name: 'AIIMS Trauma Center', lat: 28.5600, lng: 77.2100, specializations: ['trauma', 'emergency', 'neurology', 'burns'], availability: 45, beds: 500, phone: '+91-11-2222-3333', address: 'Ansari Nagar, South Delhi' },
  { id: 6, name: 'Safdarjung Hospital', lat: 28.5700, lng: 77.2000, specializations: ['general', 'emergency', 'pediatrics'], availability: 55, beds: 400, phone: '+91-11-6666-7777', address: 'Ring Road, South Delhi' },
  { id: 7, name: 'Sir Ganga Ram Hospital', lat: 28.6400, lng: 77.1900, specializations: ['gastroenterology', 'cardiology', 'emergency'], availability: 78, beds: 180, phone: '+91-11-8888-9999', address: 'Rajinder Nagar, Central Delhi' },
  { id: 8, name: 'Medanta - The Medicity', lat: 28.4400, lng: 77.0400, specializations: ['cardiology', 'oncology', 'neurology', 'emergency'], availability: 82, beds: 350, phone: '+91-124-111-2222', address: 'Sector 38, Gurugram' },
];

/**
 * Detect needed specialization from clinical condition text
 */
export function detectSpecialization(condition = '') {
  const lower = String(condition || '').toLowerCase();
  if (/heart|chest|cardiac|bp|blood pressure/i.test(lower)) return 'cardiology';
  if (/brain|head|stroke|neuro|seizure/i.test(lower)) return 'neurology';
  if (/bone|fracture|joint|spine|ortho/i.test(lower)) return 'orthopedics';
  if (/child|baby|infant|pediatr/i.test(lower)) return 'pediatrics';
  if (/cancer|tumor|oncol/i.test(lower)) return 'oncology';
  if (/accident|trauma|injury|burn/i.test(lower)) return 'trauma';
  if (/stomach|liver|digest|gastro/i.test(lower)) return 'gastroenterology';
  return 'emergency';
}

/**
 * Deterministic hospital emergency ranking algorithm
 */
export function rankNearbyHospitalsDeterministic({ condition = '', lat = DEFAULT_LAT, lng = DEFAULT_LNG }) {
  const patientLat = Number(lat) || DEFAULT_LAT;
  const patientLng = Number(lng) || DEFAULT_LNG;
  const neededSpec = detectSpecialization(condition);

  const W_DISTANCE = 0.35;
  const W_AVAILABILITY = 0.40;
  const W_SPECIALIZATION = 0.25;

  const scored = MOCK_HOSPITALS.map((hospital) => {
    const distance = haversineDistance(patientLat, patientLng, hospital.lat, hospital.lng) || 10.0;
    const maxDist = 30.0;
    const distScore = Math.max(0, 1 - distance / maxDist) * 100;
    const availScore = hospital.availability;
    const specScore = hospital.specializations.includes(neededSpec) ? 100 : 30;

    const totalScore = Math.round(
      W_DISTANCE * distScore + W_AVAILABILITY * availScore + W_SPECIALIZATION * specScore
    );

    return {
      name: hospital.name,
      distance,
      availability: hospital.availability,
      specialization: neededSpec,
      hasSpecialization: hospital.specializations.includes(neededSpec),
      score: totalScore,
      address: hospital.address,
      phone: hospital.phone,
      beds: hospital.beds,
    };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, 5);
}

/**
 * AI Emergency Redirect: Find & rank nearby hospitals
 */
export const findNearbyHospitals = async ({ condition = '', lat, lng }) => {
  const safeLat = Number(lat) || DEFAULT_LAT;
  const safeLng = Number(lng) || DEFAULT_LNG;

  const fallback = () => rankNearbyHospitalsDeterministic({ condition, lat: safeLat, lng: safeLng });

  const callResult = await safeAiCall({
    endpoint: '/emergency/redirect',
    payload: {
      condition: condition || 'Emergency triage needed',
      lat: safeLat,
      lng: safeLng,
    },
    fallbackFn: fallback,
    validator: (data) => Array.isArray(data.all_suggestions) && data.all_suggestions.length > 0,
  });

  if (callResult.source === 'ai') {
    return callResult.data.all_suggestions.map((h) => ({
      name: h.name,
      distance: h.distance,
      availability: h.availability,
      specialization: h.specialization,
      hasSpecialization: h.has_specialization,
      score: h.score,
      address: h.address,
      phone: h.phone,
      beds: h.beds,
    }));
  }

  return callResult.data;
};

/**
 * Get all nearby hospitals sorted by distance
 */
export const getAllNearbyHospitals = async ({ lat, lng }) => {
  const patientLat = Number(lat) || DEFAULT_LAT;
  const patientLng = Number(lng) || DEFAULT_LNG;

  return MOCK_HOSPITALS.map((h) => ({
    ...h,
    distance: haversineDistance(patientLat, patientLng, h.lat, h.lng) || 10.0,
  })).sort((a, b) => a.distance - b.distance);
};

// ── 3. DOCTOR RANKING (BAYESIAN MULTI-FACTOR + EXPLANATIONS) ──

/**
 * Generate human-readable reasons explaining why a doctor was recommended
 */
export function generateExplanations({ doctor, distanceKm, isSpecialtyMatch, isAffordable, isAvailable }) {
  const reasons = [];
  if (isSpecialtyMatch) reasons.push(`✓ Specialty matches (${doctor.specialty})`);
  if (distanceKm !== null && distanceKm !== undefined) reasons.push(`✓ ${distanceKm} km away`);
  const reviewCount = doctor.ratingCount || 0;
  const ratingVal = doctor.avgRating || 0;
  if (reviewCount > 0) {
    reasons.push(`✓ ${ratingVal.toFixed(1)} rating (${reviewCount} reviews)`);
  } else {
    reasons.push(`✓ New practitioner (default trust prior)`);
  }
  if (isAffordable) reasons.push(`✓ Affordable (₹${doctor.consultationFee || 500})`);
  if (isAvailable) reasons.push('✓ Available today');
  return reasons;
}

/**
 * Pure deterministic Bayesian doctor ranking
 */
export function rankDoctorsDeterministic({ doctors = [], criteria = {} }) {
  if (!Array.isArray(doctors) || doctors.length === 0) return [];

  const {
    specialty,
    patientLat,
    patientLng,
    maxFee,
    preference = 'balanced',
  } = criteria;

  let weights = {
    specialty: 0.30,
    rating: 0.25,
    distance: 0.20,
    fee: 0.15,
    availability: 0.10,
  };

  if (preference === 'rating') {
    weights = { specialty: 0.25, rating: 0.40, distance: 0.15, fee: 0.10, availability: 0.10 };
  } else if (preference === 'distance') {
    weights = { specialty: 0.25, rating: 0.15, distance: 0.40, fee: 0.10, availability: 0.10 };
  } else if (preference === 'fee') {
    weights = { specialty: 0.25, rating: 0.15, distance: 0.15, fee: 0.35, availability: 0.10 };
  } else if (preference === 'availability') {
    weights = { specialty: 0.25, rating: 0.15, distance: 0.15, fee: 0.15, availability: 0.30 };
  }

  const scoredDoctors = doctors.map((doc) => {
    let specScore = 50;
    let isSpecialtyMatch = false;
    if (specialty && doc.specialty) {
      if (doc.specialty.toLowerCase() === specialty.toLowerCase()) {
        specScore = 100;
        isSpecialtyMatch = true;
      } else {
        specScore = 20;
      }
    } else {
      specScore = 80;
      isSpecialtyMatch = true;
    }

    const bayesianRating = calculateBayesianRating(doc.avgRating, doc.ratingCount);
    const ratingScore = Math.min(100, (bayesianRating / 5.0) * 100);

    let distKm = null;
    let distScore = 50;
    if (patientLat != null && patientLng != null && doc.location?.lat != null && doc.location?.lng != null) {
      distKm = haversineDistance(patientLat, patientLng, doc.location.lat, doc.location.lng);
      distScore = Math.max(0, 1 - (distKm || 0) / 30) * 100;
    }

    const fee = doc.consultationFee || 500;
    let feeScore = 50;
    let isAffordable = false;
    if (maxFee) {
      if (fee <= maxFee) {
        feeScore = 100;
        isAffordable = true;
      } else {
        feeScore = Math.max(0, 100 - (fee - maxFee) * 0.1);
      }
    } else {
      if (fee <= 600) {
        feeScore = 100;
        isAffordable = true;
      } else {
        feeScore = Math.max(10, 100 - (fee - 600) * 0.08);
      }
    }

    let isAvailable = doc.isAvailableToday ?? true;
    let availScore = isAvailable ? 100 : 20;

    const totalScore = Math.round(
      weights.specialty * specScore +
      weights.rating * ratingScore +
      weights.distance * distScore +
      weights.fee * feeScore +
      weights.availability * availScore
    );

    const reasons = generateExplanations({
      doctor: doc,
      distanceKm: distKm,
      isSpecialtyMatch,
      isAffordable,
      isAvailable,
    });

    return {
      doctor: doc,
      score: totalScore,
      distanceKm: distKm,
      bayesianRating: Math.round(bayesianRating * 100) / 100,
      breakdown: {
        specialty: Math.round(specScore),
        rating: Math.round(ratingScore),
        distance: Math.round(distScore),
        fee: Math.round(feeScore),
        availability: Math.round(availScore),
      },
      explanation: reasons,
      recommendedBecause: reasons,
    };
  });

  scoredDoctors.sort((a, b) => b.score - a.score);
  scoredDoctors.forEach((item, index) => {
    item.rank = index + 1;
  });

  return scoredDoctors;
}

/**
 * Rank doctors: Tries Python AI Bayesian ranking, falls back to deterministic Bayesian scoring
 */
export async function rankDoctors({ doctors = [], criteria = {} }) {
  if (!Array.isArray(doctors) || doctors.length === 0) {
    return { source: 'deterministic_fallback', recommendations: [] };
  }

  const candidates = doctors.map((d) => ({
    id: d._id ? d._id.toString() : String(d.id),
    name: d.doctorName || d.name || 'Doctor',
    specialty: d.specialty || 'General Medicine',
    avg_rating: Number(d.avgRating) || 0.0,
    rating_count: Number(d.ratingCount) || 0,
    consultation_fee: Number(d.consultationFee) || 500.0,
    lat: d.location?.lat,
    lng: d.location?.lng,
    is_available_today: d.isAvailableToday ?? true,
  }));

  const payload = {
    candidates,
    specialty: criteria.specialty || null,
    patient_lat: criteria.patientLat || null,
    patient_lng: criteria.patientLng || null,
    max_fee: criteria.maxFee || null,
    preference: criteria.preference || 'balanced',
  };

  const fallback = () => rankDoctorsDeterministic({ doctors, criteria });

  const callResult = await safeAiCall({
    endpoint: '/rank-doctors',
    payload,
    fallbackFn: fallback,
    validator: (data) => Array.isArray(data.ranked_doctors),
  });

  if (callResult.source === 'ai') {
    const docMap = new Map();
    doctors.forEach((d) => {
      const key = d._id ? d._id.toString() : String(d.id);
      docMap.set(key, d);
    });

    const recommendations = callResult.data.ranked_doctors.map((item, idx) => ({
      rank: item.rank || idx + 1,
      doctor: docMap.get(item.id) || item,
      score: item.score,
      distanceKm: item.distance_km,
      bayesianRating: item.bayesian_rating,
      explanation: item.recommended_because || [],
      recommendedBecause: item.recommended_because || [],
    }));

    return {
      source: 'ai',
      recommendations,
    };
  }

  return {
    source: 'deterministic_fallback',
    recommendations: callResult.data,
  };
}

// ── 4. PRIORITY SUPPORT (CLINICAL DECISION SUPPORT - CDS) ──

/**
 * Deterministic CDS triage evaluation rules
 */
export function evaluatePriorityDeterministic({ condition = '', age = null, vitals = {} }) {
  const condLower = String(condition || '').toLowerCase().trim();
  const safeVitals = vitals || {};

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

  let isCritical = criticalKeywords.some((kw) => condLower.includes(kw));
  const spo2 = safeVitals.spo2 != null ? Number(safeVitals.spo2) : null;
  const hr = safeVitals.heartRate != null ? Number(safeVitals.heartRate) : safeVitals.hr != null ? Number(safeVitals.hr) : null;

  if (spo2 !== null && spo2 < 90) isCritical = true;
  if (hr !== null && (hr > 140 || hr < 40)) isCritical = true;

  if (isCritical) {
    const matched = criticalKeywords.find((kw) => condLower.includes(kw)) || 'acute distress indicators';
    return {
      priority: 'critical',
      score: 95,
      reason: `Clinical priority: Potential acute emergency indicated by '${matched}'. Requires urgent clinician review.`,
      confidence: 0.94,
      decisionSource: 'triage_rule',
      isCdsRecommendation: true,
      disclaimer: CDS_DISCLAIMER,
    };
  }

  let isUrgent = urgentKeywords.some((kw) => condLower.includes(kw));
  if (age !== null && Number(age) < 1 && condLower.includes('fever')) isUrgent = true;
  if (spo2 !== null && spo2 >= 90 && spo2 <= 94) isUrgent = true;
  if (hr !== null && hr >= 110 && hr <= 140) isUrgent = true;

  if (isUrgent) {
    const matched = urgentKeywords.find((kw) => condLower.includes(kw)) || 'abnormal physiological markers';
    return {
      priority: 'urgent',
      score: 70,
      reason: `Clinical priority: Expedited attention recommended for '${matched}'.`,
      confidence: 0.88,
      decisionSource: 'triage_rule',
      isCdsRecommendation: true,
      disclaimer: CDS_DISCLAIMER,
    };
  }

  return {
    priority: 'routine',
    score: 25,
    reason: 'Clinical priority: Non-emergent presentation suitable for standard queue order.',
    confidence: 0.90,
    decisionSource: 'triage_rule',
    isCdsRecommendation: true,
    disclaimer: CDS_DISCLAIMER,
  };
}

/**
 * Priority support: Tries Python CDS service, falls back to deterministic clinical acuity rules
 */
export async function evaluatePrioritySupport({ condition = '', age = null, vitals = {} } = {}) {
  const fallback = () => evaluatePriorityDeterministic({ condition, age, vitals });

  const callResult = await safeAiCall({
    endpoint: '/priority/evaluate-condition',
    payload: { condition, age, vitals },
    fallbackFn: fallback,
    validator: (data) => typeof data.priority === 'string' && typeof data.score === 'number',
  });

  if (callResult.source === 'ai') {
    return {
      source: 'ai',
      priority: callResult.data.priority,
      score: callResult.data.score,
      reason: callResult.data.reason,
      confidence: callResult.data.confidence,
      decisionSource: 'ai_cds',
      isCdsRecommendation: true,
      disclaimer: callResult.data.disclaimer || CDS_DISCLAIMER,
    };
  }

  return {
    source: 'deterministic_fallback',
    ...callResult.data,
  };
}

// ── 5. CARE-PLAN ASSISTANCE (CLINICAL DRAFT TEMPLATES) ──

/**
 * Deterministic clinical lifestyle & recovery templates
 */
export function getCarePlanTemplatesDeterministic({ condition = '' }) {
  const c = String(condition || '').toLowerCase().trim();

  if (/hypertension|blood pressure|bp|cardiac/i.test(c)) {
    return {
      condition: condition || 'Hypertension Management',
      dietRecommended: [
        'DASH dietary pattern rich in fresh vegetables and whole grains',
        'High-potassium fruits (bananas, oranges, leafy greens)',
        'Low-sodium meals (< 2000 mg/day)',
        'Optimal hydration (2.5 liters of water daily)',
      ],
      dietRestricted: [
        'High-sodium processed foods, pickles, and canned soups',
        'Excessive caffeine and carbonated energy drinks',
        'Saturated trans-fats and fried foods',
      ],
      activitiesRecommended: [
        '30 minutes moderate brisk walking, 5 days per week',
        'Daily morning and evening blood pressure log recording',
        'Deep breathing or mindfulness meditation (10-15 mins daily)',
      ],
      activitiesRestricted: [
        'Heavy isometric straining or sudden unconditioned heavy lifting',
        'High-intensity burst cardio without adequate warm-up',
      ],
      suggestedFollowUpDays: 14,
      clinicalNotesTemplate:
        'Patient advised on DASH dietary compliance and home BP log monitoring. Titrate medication if BP remains above 130/80 mmHg at follow-up.',
      isAssistantDraft: true,
      disclaimer: CDS_DISCLAIMER,
    };
  }

  if (/diabetes|sugar|glucose/i.test(c)) {
    return {
      condition: condition || 'Type-2 Diabetes Glycemic Care',
      dietRecommended: [
        'Complex carbohydrates with low glycemic index (oats, barley, brown rice)',
        'High-fiber green vegetables (spinach, broccoli, beans)',
        'Lean proteins (pulses, egg whites, grilled fish)',
        'Consistent meal spacing every 3.5 to 4 hours',
      ],
      dietRestricted: [
        'Refined sugars, sweets, sweetened sodas, and syrups',
        'Simple carbohydrates and white flour products',
        'Late-night high-carb snacking',
      ],
      activitiesRecommended: [
        '30–45 minutes daily aerobic exercise (walking, swimming, light cycling)',
        'Daily routine inspection of feet for minor cuts or blisters',
        'Periodic fasting and post-prandial glucose tracking',
      ],
      activitiesRestricted: [
        'Prolonged unmonitored fasting without physician guidance',
        'Walking barefoot outdoors',
      ],
      suggestedFollowUpDays: 14,
      clinicalNotesTemplate:
        'Glycemic management protocol initiated. HbA1c review and lifestyle adherence assessment scheduled at follow-up.',
      isAssistantDraft: true,
      disclaimer: CDS_DISCLAIMER,
    };
  }

  if (/asthma|bronchitis|respiratory|cough/i.test(c)) {
    return {
      condition: condition || 'Respiratory / Asthma Management',
      dietRecommended: [
        'Warm fluids, herbal teas, and clear broths',
        'Antioxidant-rich fresh seasonal fruits and vitamin C foods',
        'Light, easily digestible non-acidic meals',
      ],
      dietRestricted: [
        'Iced beverages, ice cream, and cold foods',
        'Known allergic trigger foods and sulfited dried fruits',
      ],
      activitiesRecommended: [
        'Gentle diaphragmatic and pursed-lip breathing exercises',
        'Keep rescue inhaler readily accessible at all times',
        'Maintain dust-free, well-ventilated indoor environment',
      ],
      activitiesRestricted: [
        'Outdoor exertion during peak air quality index (AQI) or pollen warnings',
        'Active or secondhand tobacco and woodfire smoke exposure',
        'Sudden intense cold-air sprinting',
      ],
      suggestedFollowUpDays: 7,
      clinicalNotesTemplate:
        'Inhaler technique verified with patient. Advised avoidance of environmental triggers and prompt medical review if PEFR decreases.',
      isAssistantDraft: true,
      disclaimer: CDS_DISCLAIMER,
    };
  }

  if (/fracture|ortho|joint|arthritis|sprain|back pain/i.test(c)) {
    return {
      condition: condition || 'Orthopedic Rehabilitation Care',
      dietRecommended: [
        'Calcium and Vitamin D rich dietary items (milk, yogurt, fortified foods)',
        'Anti-inflammatory foods (turmeric, ginger, berries)',
        'Adequate lean protein to support tissue healing',
      ],
      dietRestricted: [
        'Excessive refined sugars and pro-inflammatory fried foods',
        'Alcohol and smoking (impairs bone/ligament healing)',
      ],
      activitiesRecommended: [
        'Physiotherapist-guided range of motion exercises',
        'Ergonomic lumbar support during seated work',
        'Cold compress for acute swelling / moist heat for chronic stiffness',
      ],
      activitiesRestricted: [
        'Heavy lifting (> 5 kg) or sudden spinal twisting',
        'High-impact jumping, running, or contact sports',
      ],
      suggestedFollowUpDays: 10,
      clinicalNotesTemplate:
        'Mobility and pain management protocol. Radiographic re-assessment or physical therapy progress to be evaluated at follow-up.',
      isAssistantDraft: true,
      disclaimer: CDS_DISCLAIMER,
    };
  }

  return {
    condition: condition || 'General Recuperation & Wellness',
    dietRecommended: [
      'Balanced nutritious diet emphasizing whole grains, vegetables, and lean proteins',
      'Adequate daily hydration (2 to 3 liters water daily)',
    ],
    dietRestricted: [
      'Deep-fried, excessively oily, and heavily processed fast foods',
      'Excessive alcohol, caffeine, and sweetened beverages',
    ],
    activitiesRecommended: [
      'Adequate restorative sleep (7 to 8 hours nightly)',
      'Gentle daily movement and light walking as tolerated',
    ],
    activitiesRestricted: [
      'Physical overexertion and irregular sleep schedules',
      'Tobacco and smoking products',
    ],
    suggestedFollowUpDays: 7,
    clinicalNotesTemplate:
      'General clinical advice provided. Patient instructed to monitor symptoms and attend follow-up if condition does not improve.',
    isAssistantDraft: true,
    disclaimer: CDS_DISCLAIMER,
  };
}

/**
 * Care-Plan Assistance: Tries Python AI care-plan assistant, falls back to clinical evidence templates
 */
export async function getCarePlanAssistance({ condition = '', patientAge = null, patientGender = null } = {}) {
  const fallback = () => getCarePlanTemplatesDeterministic({ condition });

  const callResult = await safeAiCall({
    endpoint: '/care-plan/assist',
    payload: {
      condition: condition || 'General Health',
      patient_age: patientAge,
      patient_gender: patientGender,
    },
    fallbackFn: fallback,
    validator: (data) =>
      Array.isArray(data.diet_recommended) && Array.isArray(data.activities_recommended),
  });

  if (callResult.source === 'ai') {
    return {
      source: 'ai',
      condition: callResult.data.condition,
      dietRecommended: callResult.data.diet_recommended,
      dietRestricted: callResult.data.diet_restricted,
      activitiesRecommended: callResult.data.activities_recommended,
      activitiesRestricted: callResult.data.activities_restricted,
      suggestedFollowUpDays: callResult.data.suggested_follow_up_days,
      clinicalNotesTemplate: callResult.data.clinical_notes_template,
      isAssistantDraft: true,
      disclaimer: callResult.data.disclaimer || CDS_DISCLAIMER,
    };
  }

  return {
    source: 'deterministic_fallback',
    ...callResult.data,
  };
}

// ── Legacy Token update bridge ──
export const updateAiData = async (token) => {
  try {
    if (!token.calledAt || !token.completedAt) return;
    await axios.post(
      `${getAiUrl()}/update-data`,
      {
        token_number: token.tokenNumber,
        called_at: token.calledAt.toISOString(),
        completed_at: token.completedAt.toISOString(),
      },
      { timeout: 2000 }
    );
  } catch {
    // Non-blocking background telemetry update
  }
};
