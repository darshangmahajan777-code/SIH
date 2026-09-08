import axios from 'axios';

const AI_URL = process.env.AI_URL || 'http://localhost:8001';

// Prior parameters for Bayesian rating
const BAYESIAN_M = 25; // Prior weight (minimum reviews threshold)
const BAYESIAN_C = 4.0; // Baseline prior mean rating

/**
 * Calculate Haversine distance between two coordinates in km
 */
export function haversineDistance(lat1, lng1, lat2, lng2) {
  if (lat1 == null || lng1 == null || lat2 == null || lng2 == null) {
    return null;
  }
  const R = 6371; // Earth radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c * 10) / 10;
}

/**
 * Calculate Bayesian weighted average rating
 * Prevents 5.0 (2 reviews) from dominating 4.8 (500 reviews)
 */
export function calculateBayesianRating(avgRating = 0, count = 0) {
  const v = Math.max(0, Number(count) || 0);
  const R = Math.max(0, Math.min(5, Number(avgRating) || 0));
  if (v === 0) {
    return BAYESIAN_C;
  }
  return (v * R + BAYESIAN_M * BAYESIAN_C) / (v + BAYESIAN_M);
}

/**
 * Generate human-readable reasons explaining why a doctor was recommended
 */
export function generateExplanations({ doctor, distanceKm, isSpecialtyMatch, isAffordable, isAvailable }) {
  const reasons = [];

  if (isSpecialtyMatch) {
    reasons.push(`✓ Specialty matches (${doctor.specialty})`);
  }

  if (distanceKm !== null && distanceKm !== undefined) {
    reasons.push(`✓ ${distanceKm} km away`);
  }

  const reviewCount = doctor.ratingCount || 0;
  const ratingVal = doctor.avgRating || 0;
  if (reviewCount > 0) {
    reasons.push(`✓ ${ratingVal.toFixed(1)} rating (${reviewCount} reviews)`);
  } else {
    reasons.push(`✓ New practitioner (default trust prior)`);
  }

  if (isAffordable) {
    reasons.push(`✓ Affordable (₹${doctor.consultationFee})`);
  }

  if (isAvailable) {
    reasons.push('✓ Available today');
  }

  return reasons;
}

/**
 * Pure deterministic ranking engine
 * Used by backend and as resilient fallback when AI is unavailable
 */
export function rankDoctorsDeterministic({ doctors = [], criteria = {} }) {
  const {
    specialty,
    patientLat,
    patientLng,
    maxFee,
    preference = 'balanced', // 'rating' | 'distance' | 'fee' | 'availability' | 'balanced'
  } = criteria;

  // Base weights
  let weights = {
    specialty: 0.30,
    rating: 0.25,
    distance: 0.20,
    fee: 0.15,
    availability: 0.10,
  };

  // Adjust weights based on patient preferences
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
    // 1. Specialty match
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

    // 2. Bayesian Rating quality & count score (0 - 100)
    const bayesianRating = calculateBayesianRating(doc.avgRating, doc.ratingCount);
    const ratingScore = Math.min(100, (bayesianRating / 5.0) * 100);

    // 3. Distance score (0 - 100)
    let distKm = null;
    let distScore = 50; // Neutral score when location missing
    if (patientLat != null && patientLng != null && doc.location?.lat != null && doc.location?.lng != null) {
      distKm = haversineDistance(patientLat, patientLng, doc.location.lat, doc.location.lng);
      distScore = Math.max(0, 1 - distKm / 30) * 100;
    }

    // 4. Fee score (0 - 100)
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

    // 5. Availability score (0 - 100)
    let availScore = 50; // Neutral fallback when missing
    let isAvailable = false;
    if (doc.isAvailableToday !== undefined && doc.isAvailableToday !== null) {
      isAvailable = Boolean(doc.isAvailableToday);
      availScore = isAvailable ? 100 : 20;
    }

    // Total composite weighted score
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
      recommendedBecause: reasons,
    };
  });

  // Sort descending by score
  scoredDoctors.sort((a, b) => b.score - a.score);

  return scoredDoctors;
}

/**
 * Get doctor recommendations: tries AI FastAPI service first,
 * and falls back to pure deterministic ranking if AI is unavailable.
 */
export const getDoctorRecommendations = async ({ doctors = [], criteria = {} }) => {
  try {
    // Format candidates for FastAPI /rank-doctors
    const candidates = doctors.map((d) => ({
      id: d._id ? d._id.toString() : d.id,
      name: d.doctorName || d.name,
      specialty: d.specialty,
      avg_rating: d.avgRating || 0,
      rating_count: d.ratingCount || 0,
      consultation_fee: d.consultationFee || 500,
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

    const aiRes = await axios.post(`${AI_URL}/rank-doctors`, payload, { timeout: 2000 });
    if (aiRes.data && Array.isArray(aiRes.data.ranked_doctors)) {
      // Re-map back to original doctor objects
      const docMap = new Map();
      doctors.forEach((d) => {
        const key = d._id ? d._id.toString() : d.id;
        docMap.set(key, d);
      });

      return {
        source: 'ai',
        recommendations: aiRes.data.ranked_doctors.map((item) => ({
          doctor: docMap.get(item.id) || item,
          score: item.score,
          distanceKm: item.distance_km,
          bayesianRating: item.bayesian_rating,
          recommendedBecause: item.recommended_because,
        })),
      };
    }
  } catch (error) {
    // Fallback: AI unavailable or errored
    // Deterministic ranking must continue working seamlessly!
  }

  const deterministicResults = rankDoctorsDeterministic({ doctors, criteria });
  return {
    source: 'deterministic_fallback',
    recommendations: deterministicResults,
  };
};
