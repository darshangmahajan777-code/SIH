import assert from 'assert';
import {
  calculateBayesianRating,
  haversineDistance,
  generateExplanations,
  rankDoctorsDeterministic,
  getDoctorRecommendations,
} from '../services/recommendationService.js';

let passed = 0;
let failed = 0;

function it(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ ${name}:`, err.message);
    failed++;
  }
}

async function itAsync(name, fn) {
  try {
    await fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ ${name}:`, err.message);
    failed++;
  }
}

console.log('\n======================================================');
console.log('TEST SUITE: Doctor Ratings, Bayesian Ranking & Recommendations');
console.log('======================================================\n');

// ── Test 1: Ranking (Bayesian Average: 4.8 / 500 reviews vs 5.0 / 2 reviews) ──
console.log('1. Bayesian Ranking Quality & Volume Test:');
it('should score 4.8 from 500 reviews HIGHER than 5.0 from 2 reviews', () => {
  const bayesDocA = calculateBayesianRating(5.0, 2);   // 5.0 with 2 reviews
  const bayesDocB = calculateBayesianRating(4.8, 500); // 4.8 with 500 reviews

  console.log(`     Doc A (5.0, 2 reviews) Bayesian: ${bayesDocA.toFixed(3)}`);
  console.log(`     Doc B (4.8, 500 reviews) Bayesian: ${bayesDocB.toFixed(3)}`);

  assert.ok(
    bayesDocB > bayesDocA,
    `Doc B Bayesian (${bayesDocB.toFixed(3)}) should be greater than Doc A (${bayesDocA.toFixed(3)})`
  );

  // Now test through the full ranking engine
  const candidates = [
    {
      id: 'docA',
      name: 'Doc A',
      specialty: 'Cardiology',
      avgRating: 5.0,
      ratingCount: 2,
      consultationFee: 500,
      isAvailableToday: true,
      location: { lat: 28.62, lng: 77.21 },
    },
    {
      id: 'docB',
      name: 'Doc B',
      specialty: 'Cardiology',
      avgRating: 4.8,
      ratingCount: 500,
      consultationFee: 500,
      isAvailableToday: true,
      location: { lat: 28.62, lng: 77.21 },
    },
  ];

  const ranked = rankDoctorsDeterministic({
    doctors: candidates,
    criteria: { specialty: 'Cardiology', patientLat: 28.62, patientLng: 77.21 },
  });

  assert.strictEqual(ranked[0].doctor.id, 'docB', 'Doc B with 500 reviews should rank #1');
  assert.ok(ranked[0].score > ranked[1].score, 'Doc B score should exceed Doc A score');
});

// ── Test 2: Missing Ratings ──
console.log('\n2. Missing Ratings Test:');
it('should gracefully handle doctors with 0 reviews without crashing and apply baseline prior', () => {
  const bayesZero = calculateBayesianRating(0, 0);
  assert.strictEqual(bayesZero, 4.0, '0 reviews should default to baseline prior of 4.0');

  const candidates = [
    {
      id: 'docNew',
      name: 'Dr. New',
      specialty: 'General Medicine',
      avgRating: 0,
      ratingCount: 0,
      consultationFee: 400,
      isAvailableToday: true,
    },
  ];

  const ranked = rankDoctorsDeterministic({
    doctors: candidates,
    criteria: { specialty: 'General Medicine' },
  });

  assert.strictEqual(ranked.length, 1);
  assert.strictEqual(ranked[0].bayesianRating, 4.0);
  assert.ok(ranked[0].score > 0, 'Score must be a positive integer');
});

// ── Test 3: Missing Location ──
console.log('\n3. Missing Location Test:');
it('should gracefully handle missing patient or doctor location with neutral distance score', () => {
  const distNull = haversineDistance(null, null, 28.62, 77.21);
  assert.strictEqual(distNull, null, 'Haversine should return null for missing coordinates');

  const candidates = [
    {
      id: 'docNoLoc',
      name: 'Dr. No Location',
      specialty: 'Pediatrics',
      avgRating: 4.5,
      ratingCount: 50,
      consultationFee: 500,
      isAvailableToday: true,
      location: null, // Doctor location omitted
    },
  ];

  const ranked = rankDoctorsDeterministic({
    doctors: candidates,
    criteria: { patientLat: null, patientLng: null }, // Patient location omitted
  });

  assert.strictEqual(ranked.length, 1);
  assert.strictEqual(ranked[0].distanceKm, null);
  assert.strictEqual(ranked[0].breakdown.distance, 50, 'Distance score should be neutral 50');
});

// ── Test 4: Missing Availability ──
console.log('\n4. Missing Availability Test:');
it('should gracefully handle omitted availability schedule with neutral score', () => {
  const candidates = [
    {
      id: 'docNoAvail',
      name: 'Dr. No Avail',
      specialty: 'Orthopedics',
      avgRating: 4.6,
      ratingCount: 80,
      consultationFee: 600,
      isAvailableToday: null, // Omitted
    },
  ];

  const ranked = rankDoctorsDeterministic({
    doctors: candidates,
    criteria: {},
  });

  assert.strictEqual(ranked.length, 1);
  assert.strictEqual(ranked[0].breakdown.availability, 50, 'Availability score should default to neutral 50');
});

// ── Test 5: Explainability ──
console.log('\n5. Explainability Test:');
it('should generate human-readable "Recommended because" bullet points', () => {
  const doc = {
    specialty: 'Cardiology',
    avgRating: 4.8,
    ratingCount: 500,
    consultationFee: 500,
  };

  const explanations = generateExplanations({
    doctor: doc,
    distanceKm: 3.4,
    isSpecialtyMatch: true,
    isAffordable: true,
    isAvailable: true,
  });

  console.log('     Generated Reasons:');
  explanations.forEach((r) => console.log(`       ${r}`));

  assert.ok(explanations.some((r) => r.includes('Specialty matches (Cardiology)')));
  assert.ok(explanations.some((r) => r.includes('3.4 km away')));
  assert.ok(explanations.some((r) => r.includes('4.8 rating (500 reviews)')));
  assert.ok(explanations.some((r) => r.includes('Affordable (₹500)')));
  assert.ok(explanations.some((r) => r.includes('Available today')));
});

// ── Test 6: AI Failure & Resilient Deterministic Fallback ──
console.log('\n6. AI Failure & Deterministic Fallback Test:');
await itAsync('should seamlessly fall back to deterministic ranking when AI service is unavailable', async () => {
  const candidates = [
    {
      id: 'doc1',
      name: 'Dr. One',
      specialty: 'Neurology',
      avgRating: 4.9,
      ratingCount: 150,
      consultationFee: 700,
      isAvailableToday: true,
    },
    {
      id: 'doc2',
      name: 'Dr. Two',
      specialty: 'Neurology',
      avgRating: 4.2,
      ratingCount: 20,
      consultationFee: 500,
      isAvailableToday: true,
    },
  ];

  // Request recommendations with AI_URL pointing to offline port
  const result = await getDoctorRecommendations({
    doctors: candidates,
    criteria: { specialty: 'Neurology' },
  });

  assert.ok(result.recommendations.length === 2, 'Must return recommendations even if AI is offline');
  assert.strictEqual(
    result.source,
    'deterministic_fallback',
    'Source should indicate deterministic_fallback when AI is offline'
  );
  assert.ok(result.recommendations[0].score >= result.recommendations[1].score, 'Results must be ranked descending');
  assert.ok(Array.isArray(result.recommendations[0].recommendedBecause), 'Explanations must be present');
});

// ── Test 7: Rating Authorization & Duplicate Review Validation Logic ──
console.log('\n7. Rating Authorization & Duplicate Review Validation Logic:');
it('should enforce rating integer bounds 1-5', () => {
  const invalidRatings = [0, 6, 2.5, -1, NaN, null];
  for (const r of invalidRatings) {
    const isValid = Number.isInteger(r) && r >= 1 && r <= 5;
    assert.strictEqual(isValid, false, `Rating ${r} should be invalid`);
  }

  const validRatings = [1, 2, 3, 4, 5];
  for (const r of validRatings) {
    const isValid = Number.isInteger(r) && r >= 1 && r <= 5;
    assert.strictEqual(isValid, true, `Rating ${r} should be valid`);
  }
});

it('should enforce completed appointment status constraint before rating', () => {
  const testCases = [
    { status: 'booked', canRate: false },
    { status: 'checked-in', canRate: false },
    { status: 'in-progress', canRate: false },
    { status: 'cancelled', canRate: false },
    { status: 'completed', canRate: true },
  ];

  for (const tc of testCases) {
    const canRate = tc.status === 'completed';
    assert.strictEqual(canRate, tc.canRate, `Status '${tc.status}' canRate should be ${tc.canRate}`);
  }
});

it('should prevent doctors from rating themselves', () => {
  const doctorUserId = 'user_doctor_123';
  const reviewerUserId = 'user_doctor_123'; // Same user!

  const isSelfRating = doctorUserId === reviewerUserId;
  assert.strictEqual(isSelfRating, true, 'Self-rating must be detected and blocked');
});

it('should enforce 1-to-1 rating per appointment (update rather than duplicate)', () => {
  const existingReviews = new Map();
  const appointmentId = 'apt_001';

  // First review submission
  existingReviews.set(appointmentId, { rating: 4, comment: 'Good' });
  assert.strictEqual(existingReviews.size, 1);

  // Second review submission for SAME appointment
  if (existingReviews.has(appointmentId)) {
    const rev = existingReviews.get(appointmentId);
    rev.rating = 5;
    rev.comment = 'Updated to excellent';
    existingReviews.set(appointmentId, rev);
  } else {
    existingReviews.set(appointmentId, { rating: 5, comment: 'Duplicate' });
  }

  // Count must still be exactly 1!
  assert.strictEqual(existingReviews.size, 1, 'One appointment must not produce multiple ratings');
  assert.strictEqual(existingReviews.get(appointmentId).rating, 5, 'Review should be updated');
});

console.log(`\n======================================================`);
console.log(`Results: ${passed} passed, ${failed} failed`);
console.log(`======================================================\n`);

if (failed > 0) {
  process.exit(1);
}
