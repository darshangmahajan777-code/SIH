import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import http from 'node:http';
import {
  predictWaitTime,
  findNearbyHospitals,
  rankDoctors,
  evaluatePrioritySupport,
  getCarePlanAssistance,
  calculatePoissonWaitDeterministic,
  rankDoctorsDeterministic,
  evaluatePriorityDeterministic,
  getCarePlanTemplatesDeterministic,
  rankNearbyHospitalsDeterministic,
  checkAiServiceHealth,
  CDS_DISCLAIMER,
} from '../services/aiService.js';

// Setup Mock HTTP server to simulate AI service behavior
let mockServer;
const MOCK_PORT = 9088;
const MOCK_URL = `http://127.0.0.1:${MOCK_PORT}`;

// Configurable state for the mock server
let mockServerBehavior = 'normal'; // 'normal' | 'malformed' | 'timeout'

function startMockServer() {
  return new Promise((resolve) => {
    mockServer = http.createServer((req, res) => {
      // 1. Timeout simulation
      if (mockServerBehavior === 'timeout') {
        setTimeout(() => {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ status: 'delayed' }));
        }, 3500);
        return;
      }

      // 2. Malformed response simulation
      if (mockServerBehavior === 'malformed') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ unexpected_garbage: true, invalid_schema: 42 }));
        return;
      }

      // 3. Normal valid AI responses
      let body = '';
      req.on('data', (chunk) => {
        body += chunk;
      });

      req.on('end', () => {
        let parsed = {};
        try {
          parsed = JSON.parse(body || '{}');
        } catch {}

        res.writeHead(200, { 'Content-Type': 'application/json' });

        if (req.url === '/health') {
          res.end(JSON.stringify({ status: 'healthy', version: '2.0.0' }));
        } else if (req.url === '/wait-estimate/patient') {
          const patientsAhead = parsed.patients_ahead || 0;
          const waitMin = patientsAhead * 9.5;
          res.end(
            JSON.stringify({
              estimated_wait_minutes: waitMin,
              confidence: 0.91,
              factors: { source: 'ai_poisson_engine', time_factor: 1.05 },
            })
          );
        } else if (req.url === '/emergency/redirect') {
          res.end(
            JSON.stringify({
              best_hospital: {
                name: 'Apollo Emergency Center',
                distance: 4.2,
                availability: 85,
                specialization: 'cardiology',
                has_specialization: true,
                score: 92,
                address: 'Sarita Vihar, Delhi',
                phone: '+91-11-2692-5858',
                beds: 710,
              },
              all_suggestions: [
                {
                  name: 'Apollo Emergency Center',
                  distance: 4.2,
                  availability: 85,
                  specialization: 'cardiology',
                  has_specialization: true,
                  score: 92,
                  address: 'Sarita Vihar, Delhi',
                  phone: '+91-11-2692-5858',
                  beds: 710,
                },
              ],
            })
          );
        } else if (req.url === '/rank-doctors') {
          const candidates = parsed.candidates || [];
          const ranked = candidates.map((c, idx) => ({
            id: c.id,
            name: c.name,
            specialty: c.specialty,
            score: 95 - idx * 10,
            bayesian_rating: 4.8,
            distance_km: 3.5,
            recommended_because: ['✓ AI match: Specialty and proximity aligned'],
            rank: idx + 1,
          }));
          res.end(JSON.stringify({ ranked_doctors: ranked, algorithm: 'bayesian_multi_factor' }));
        } else if (req.url === '/priority/evaluate-condition') {
          const cond = (parsed.condition || '').toLowerCase();
          const isCrit = cond.includes('chest pain') || cond.includes('heart attack') || cond.includes('unconscious');
          const isUrg = cond.includes('cut') || cond.includes('fracture') || cond.includes('fever');
          res.end(
            JSON.stringify({
              priority: isCrit ? 'critical' : isUrg ? 'urgent' : 'routine',
              score: isCrit ? 95 : isUrg ? 70 : 25,
              reason: isCrit
                ? 'AI CDS: Acute cardiac presentation identified'
                : isUrg
                ? 'AI CDS: Expedited care recommended'
                : 'AI CDS: Non-emergent presentation',
              confidence: 0.95,
              disclaimer: CDS_DISCLAIMER,
            })
          );
        } else if (req.url === '/care-plan/assist') {
          res.end(
            JSON.stringify({
              condition: parsed.condition || 'Cardiology',
              diet_recommended: ['Low sodium dietary pattern', 'Leafy greens'],
              diet_restricted: ['Saturated fats', 'Excess sodium'],
              activities_recommended: ['Light brisk walking (30 mins daily)'],
              activities_restricted: ['Heavy isometric straining'],
              suggested_follow_up_days: 14,
              clinical_notes_template: 'Patient started on cardiac recovery guidance.',
              is_assistant_draft: true,
              disclaimer: CDS_DISCLAIMER,
            })
          );
        } else {
          res.end(JSON.stringify({ ok: true }));
        }
      });
    });

    mockServer.listen(MOCK_PORT, '127.0.0.1', () => {
      resolve();
    });
  });
}

function stopMockServer() {
  return new Promise((resolve) => {
    if (mockServer) {
      mockServer.close(() => resolve());
    } else {
      resolve();
    }
  });
}

describe('TEST SUITE: AI Architecture Hardening & Deterministic Fallbacks', () => {
  before(async () => {
    process.env.AI_URL = MOCK_URL;
    await startMockServer();
  });

  after(async () => {
    await stopMockServer();
  });

  // ── TEST 1: AI AVAILABLE ───────────────────────────────────────────────────
  it('Scenario 1: AI available — Successfully parses and validates AI microservice outputs', async () => {
    mockServerBehavior = 'normal';

    // 1. Wait-time prediction
    const waitResult = await predictWaitTime({ patientsAhead: 4, avgTime: 10 });
    assert.strictEqual(waitResult.source, 'ai');
    assert.strictEqual(typeof waitResult.estimatedWaitMinutes, 'number');
    assert.strictEqual(waitResult.estimatedWaitMinutes, 38);
    assert.strictEqual(waitResult.confidence, 0.91);

    // 2. Doctor ranking
    const mockDoctors = [
      { id: 'doc-1', name: 'Dr. Sarah Patel', specialty: 'Cardiology', avgRating: 4.9, ratingCount: 120, consultationFee: 800 },
      { id: 'doc-2', name: 'Dr. Amit Mehta', specialty: 'Neurology', avgRating: 4.7, ratingCount: 90, consultationFee: 1000 },
    ];
    const rankResult = await rankDoctors({ doctors: mockDoctors, criteria: { specialty: 'Cardiology' } });
    assert.strictEqual(rankResult.source, 'ai');
    assert.strictEqual(rankResult.recommendations.length, 2);
    assert.strictEqual(rankResult.recommendations[0].rank, 1);
    assert.strictEqual(rankResult.recommendations[0].score, 95);
    assert.ok(rankResult.recommendations[0].explanation.length > 0);

    // 3. Priority support
    const priorityResult = await evaluatePrioritySupport({ condition: 'Severe chest pain radiating to left arm' });
    assert.strictEqual(priorityResult.source, 'ai');
    assert.strictEqual(priorityResult.priority, 'critical');
    assert.strictEqual(priorityResult.score, 95);
    assert.ok(priorityResult.isCdsRecommendation);
    assert.ok(priorityResult.disclaimer.includes('Clinical Decision Support'));

    // 4. Care-plan assistance
    const carePlanResult = await getCarePlanAssistance({ condition: 'Hypertension' });
    assert.strictEqual(carePlanResult.source, 'ai');
    assert.ok(Array.isArray(carePlanResult.dietRecommended));
    assert.ok(Array.isArray(carePlanResult.activitiesRecommended));
    assert.strictEqual(carePlanResult.suggestedFollowUpDays, 14);
    assert.ok(carePlanResult.disclaimer.includes('Clinical Decision Support'));

    // 5. Emergency hospital ranking
    const emergencyResult = await findNearbyHospitals({ condition: 'Severe cardiac arrest' });
    assert.ok(Array.isArray(emergencyResult));
    assert.ok(emergencyResult.length > 0);
    assert.strictEqual(emergencyResult[0].name, 'Apollo Emergency Center');
  });

  // ── TEST 2: AI UNAVAILABLE (OFFLINE) ───────────────────────────────────────
  it('Scenario 2: AI unavailable — Fails gracefully to deterministic engines with zero downtime', async () => {
    // Point AI_URL to an unreachable port with no running listener
    process.env.AI_URL = 'http://127.0.0.1:9099';

    // 1. Wait time prediction falls back to local Poisson formula
    const waitResult = await predictWaitTime({ patientsAhead: 3, avgTime: 10 });
    assert.strictEqual(waitResult.source, 'deterministic_fallback');
    assert.ok(waitResult.estimatedWaitMinutes > 0);
    assert.ok(waitResult.confidence >= 0.5);
    assert.ok(waitResult.factors.effectiveAvgTime === 10);

    // 2. Doctor ranking falls back to local Bayesian multi-factor scoring
    const mockDoctors = [
      { id: 'doc-1', name: 'Dr. Sarah Patel', specialty: 'Cardiology', avgRating: 4.9, ratingCount: 150, consultationFee: 600, isAvailableToday: true },
      { id: 'doc-2', name: 'Dr. Newbie', specialty: 'Cardiology', avgRating: 5.0, ratingCount: 1, consultationFee: 1200, isAvailableToday: false },
    ];
    const rankResult = await rankDoctors({ doctors: mockDoctors, criteria: { specialty: 'Cardiology', preference: 'rating' } });
    assert.strictEqual(rankResult.source, 'deterministic_fallback');
    assert.strictEqual(rankResult.recommendations.length, 2);
    // Verified: Sarah Patel (150 reviews) outranks Dr. Newbie (1 review with 5.0 stars) due to Bayesian shrinkage!
    assert.strictEqual(rankResult.recommendations[0].doctor.id, 'doc-1');
    assert.strictEqual(rankResult.recommendations[0].rank, 1);
    assert.ok(rankResult.recommendations[0].score > rankResult.recommendations[1].score);

    // 3. Priority support falls back to local deterministic clinical rules
    const critResult = await evaluatePrioritySupport({ condition: 'Unconscious and unresponsive patient' });
    assert.strictEqual(critResult.source, 'deterministic_fallback');
    assert.strictEqual(critResult.priority, 'critical');
    assert.strictEqual(critResult.score, 95);
    assert.strictEqual(critResult.decisionSource, 'triage_rule');

    // 4. Care-plan assistance falls back to local clinical templates
    const cpResult = await getCarePlanAssistance({ condition: 'Type 2 Diabetes Mellitus' });
    assert.strictEqual(cpResult.source, 'deterministic_fallback');
    assert.ok(cpResult.dietRecommended.some((d) => d.toLowerCase().includes('glycemic')));
    assert.strictEqual(cpResult.suggestedFollowUpDays, 14);

    // 5. Emergency hospital ranking falls back to local Haversine + capacity engine
    const emergResult = await findNearbyHospitals({ condition: 'Compound fracture of tibia' });
    assert.ok(Array.isArray(emergResult));
    assert.strictEqual(emergResult.length, 5);
    assert.strictEqual(emergResult[0].specialization, 'orthopedics');

    // Restore AI_URL
    process.env.AI_URL = MOCK_URL;
  });

  // ── TEST 3: MALFORMED AI RESPONSE ──────────────────────────────────────────
  it('Scenario 3: Malformed AI response — Intercepts invalid schemas and triggers fallback', async () => {
    mockServerBehavior = 'malformed';

    // 1. Wait time with malformed response
    const waitResult = await predictWaitTime({ patientsAhead: 2, avgTime: 8 });
    assert.strictEqual(waitResult.source, 'deterministic_fallback');
    assert.ok(typeof waitResult.estimatedWaitMinutes === 'number');

    // 2. Doctor ranking with malformed response
    const mockDoctors = [{ id: 'doc-1', name: 'Dr. Test', specialty: 'Pediatrics', avgRating: 4.5, ratingCount: 20 }];
    const rankResult = await rankDoctors({ doctors: mockDoctors, criteria: {} });
    assert.strictEqual(rankResult.source, 'deterministic_fallback');
    assert.strictEqual(rankResult.recommendations[0].rank, 1);

    // 3. Priority support with malformed response
    const prioResult = await evaluatePrioritySupport({ condition: 'Deep cut on arm bleeding', age: 25 });
    assert.strictEqual(prioResult.source, 'deterministic_fallback');
    assert.strictEqual(prioResult.priority, 'urgent');

    // 4. Care plan with malformed response
    const cpResult = await getCarePlanAssistance({ condition: 'Asthma exacerbation' });
    assert.strictEqual(cpResult.source, 'deterministic_fallback');
    assert.ok(cpResult.dietRecommended.length > 0);
  });

  // ── TEST 4: TIMEOUT ────────────────────────────────────────────────────────
  it('Scenario 4: Timeout — Aborts hanging requests and activates fallback within threshold', async () => {
    mockServerBehavior = 'timeout';

    const start = Date.now();
    // With 2000ms timeout, this should complete promptly and return fallback instead of hanging for 3500ms
    const waitResult = await predictWaitTime({ patientsAhead: 5, avgTime: 12 });
    const duration = Date.now() - start;

    assert.strictEqual(waitResult.source, 'deterministic_fallback');
    assert.ok(duration < 2800, `Expected duration < 2800ms, took ${duration}ms`);
    assert.ok(waitResult.estimatedWaitMinutes > 0);
  });

  // ── TEST 5: EMPTY CANDIDATES ───────────────────────────────────────────────
  it('Scenario 5: Empty candidates — Returns empty collections without dispatching or failing', async () => {
    mockServerBehavior = 'normal';

    // Doctor ranking with empty array
    const emptyDocsResult = await rankDoctors({ doctors: [], criteria: {} });
    assert.strictEqual(emptyDocsResult.recommendations.length, 0);

    // Empty list passed directly to deterministic engine
    const detEmpty = rankDoctorsDeterministic({ doctors: [] });
    assert.deepStrictEqual(detEmpty, []);
  });

  // ── TEST 6: INVALID INPUT SANITIZATION ─────────────────────────────────────
  it('Scenario 6: Invalid input — Safely sanitizes and bounds malformed inputs', async () => {
    mockServerBehavior = 'normal';

    // 1. Negative patientsAhead and negative avgTime
    const waitResult = await predictWaitTime({ patientsAhead: -10, avgTime: -5 });
    assert.ok(waitResult.estimatedWaitMinutes >= 0);

    // 2. Doctors with null ratings, fees, and location
    const dirtyDoctors = [
      { id: 'doc-null', name: null, specialty: null, avgRating: null, ratingCount: null, consultationFee: null, location: null },
    ];
    const rankResult = await rankDoctors({ doctors: dirtyDoctors, criteria: {} });
    assert.ok(rankResult.recommendations.length === 1);
    assert.strictEqual(rankResult.recommendations[0].rank, 1);
    assert.ok(rankResult.recommendations[0].score >= 0);

    // 3. Priority support with null condition and invalid vitals
    const prioResult = await evaluatePrioritySupport({
      condition: null,
      age: -1,
      vitals: { spo2: 'invalid-string', heartRate: null },
    });
    assert.ok(prioResult.priority === 'routine');
    assert.ok(prioResult.disclaimer.includes('Clinical Decision Support'));

    // 4. Coordinates as strings and condition as null for emergency hospital search
    const emergResult = await findNearbyHospitals({ condition: null, lat: 'invalid_lat', lng: 'invalid_lng' });
    assert.ok(Array.isArray(emergResult));
    assert.ok(emergResult.length > 0);

    const detEmerg = rankNearbyHospitalsDeterministic({ condition: null, lat: 'invalid_lat', lng: 'invalid_lng' });
    assert.ok(Array.isArray(detEmerg));
    assert.strictEqual(detEmerg.length, 5);
  });
});
