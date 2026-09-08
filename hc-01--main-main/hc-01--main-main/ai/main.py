from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime
import math
import uvicorn

app = FastAPI(title="Hospital Queue AI Service", version="2.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Data Models ──
class PredictRequest(BaseModel):
    patients_ahead: int
    avg_time: float
    time_of_day: float  # 0-23

class PredictResponse(BaseModel):
    estimated_wait: float
    confidence: float
    factors: dict

class UpdateDataRequest(BaseModel):
    token_number: int
    called_at: str
    completed_at: str

class EmergencyRedirectRequest(BaseModel):
    condition: str
    lat: Optional[float] = 28.6139
    lng: Optional[float] = 77.2090

class Hospital(BaseModel):
    name: str
    distance: float
    availability: int
    specialization: str
    has_specialization: bool
    score: int
    address: str
    phone: str

class EmergencyRedirectResponse(BaseModel):
    best_hospital: Optional[Hospital]
    all_suggestions: List[Hospital]
    detected_specialization: str

# ── State ──
avg_consult_time = 10.0  # minutes
completion_data = []
MAX_HISTORY = 100

# ── Mock Hospitals ──
HOSPITALS = [
    {"name": "City General Hospital", "lat": 28.6200, "lng": 77.2100, "specs": ["emergency", "trauma", "cardiology", "general"], "availability": 85, "address": "123 Main Road, Central Delhi", "phone": "+91-11-2345-6789"},
    {"name": "Apollo Emergency Center", "lat": 28.5500, "lng": 77.2500, "specs": ["emergency", "neurology", "orthopedics"], "availability": 72, "address": "456 Ring Road, South Delhi", "phone": "+91-11-9876-5432"},
    {"name": "Max Super Specialty Hospital", "lat": 28.6300, "lng": 77.1800, "specs": ["cardiology", "oncology", "emergency"], "availability": 60, "address": "789 Medical Lane, West Delhi", "phone": "+91-11-5555-1234"},
    {"name": "Fortis Healthcare", "lat": 28.5700, "lng": 77.3200, "specs": ["orthopedics", "pediatrics", "general"], "availability": 90, "address": "321 Health Ave, East Delhi", "phone": "+91-11-4444-5678"},
    {"name": "AIIMS Trauma Center", "lat": 28.5600, "lng": 77.2100, "specs": ["trauma", "emergency", "neurology", "burns"], "availability": 45, "address": "Ansari Nagar, South Delhi", "phone": "+91-11-2222-3333"},
    {"name": "Safdarjung Hospital", "lat": 28.5700, "lng": 77.2000, "specs": ["general", "emergency", "pediatrics"], "availability": 55, "address": "Ring Road, South Delhi", "phone": "+91-11-6666-7777"},
    {"name": "Sir Ganga Ram Hospital", "lat": 28.6400, "lng": 77.1900, "specs": ["gastroenterology", "cardiology", "emergency"], "availability": 78, "address": "Rajinder Nagar, Central Delhi", "phone": "+91-11-8888-9999"},
    {"name": "Medanta - The Medicity", "lat": 28.4400, "lng": 77.0400, "specs": ["cardiology", "oncology", "neurology", "emergency"], "availability": 82, "address": "Sector 38, Gurugram", "phone": "+91-124-111-2222"},
]


def haversine(lat1, lng1, lat2, lng2):
    R = 6371
    dlat = math.radians(lat2 - lat1)
    dlng = math.radians(lng2 - lng1)
    a = math.sin(dlat/2)**2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlng/2)**2
    return round(R * 2 * math.atan2(math.sqrt(a), math.sqrt(1-a)), 1)


def detect_specialization(condition: str) -> str:
    c = condition.lower()
    if any(w in c for w in ["heart", "chest", "cardiac", "bp", "blood pressure"]): return "cardiology"
    if any(w in c for w in ["brain", "head", "stroke", "neuro", "seizure"]): return "neurology"
    if any(w in c for w in ["bone", "fracture", "joint", "spine", "ortho"]): return "orthopedics"
    if any(w in c for w in ["child", "baby", "infant", "pediatr"]): return "pediatrics"
    if any(w in c for w in ["cancer", "tumor", "oncol"]): return "oncology"
    if any(w in c for w in ["accident", "trauma", "injury", "burn"]): return "trauma"
    if any(w in c for w in ["stomach", "liver", "digest", "gastro"]): return "gastroenterology"
    return "emergency"


# ── Endpoints ──

@app.post("/predict", response_model=PredictResponse)
async def predict_wait(req: PredictRequest):
    """Enhanced wait time prediction with Poisson-inspired model"""
    # Time-of-day factor (peaks at ~11 AM and ~3 PM)
    time_factor = 1 + 0.15 * math.sin(req.time_of_day * math.pi / 12)

    # Use rolling average or provided avg_time
    effective_avg = avg_consult_time if len(completion_data) > 5 else req.avg_time

    # Base estimate
    estimated = req.patients_ahead * effective_avg * time_factor

    # Add buffer for uncertainty (more patients ahead = more uncertainty)
    uncertainty = min(0.2, req.patients_ahead * 0.02)
    estimated *= (1 + uncertainty)

    # Confidence decreases with more patients ahead
    confidence = max(0.5, 1.0 - req.patients_ahead * 0.03)

    return PredictResponse(
        estimated_wait=round(estimated, 1),
        confidence=round(confidence, 2),
        factors={
            "time_factor": round(time_factor, 3),
            "effective_avg": round(effective_avg, 1),
            "uncertainty": round(uncertainty, 3),
            "data_points": len(completion_data),
        }
    )


@app.post("/update-data")
async def update_data(req: UpdateDataRequest):
    """Update model with completion data for continuous learning"""
    global avg_consult_time
    try:
        called = datetime.fromisoformat(req.called_at.replace('Z', '+00:00'))
        completed = datetime.fromisoformat(req.completed_at.replace('Z', '+00:00'))
        duration = (completed - called).total_seconds() / 60

        if 0 < duration < 120:  # Sanity check: 0-120 min
            completion_data.append(duration)
            if len(completion_data) > MAX_HISTORY:
                completion_data.pop(0)
            avg_consult_time = sum(completion_data) / len(completion_data)

        return {"status": "updated", "new_avg": round(avg_consult_time, 1), "data_points": len(completion_data)}
    except Exception as e:
        return {"status": "error", "message": str(e)}


@app.post("/emergency/redirect", response_model=EmergencyRedirectResponse)
async def emergency_redirect(req: EmergencyRedirectRequest):
    """AI-powered emergency hospital recommendation"""
    spec = detect_specialization(req.condition)

    W_DIST, W_AVAIL, W_SPEC = 0.35, 0.40, 0.25

    scored = []
    for h in HOSPITALS:
        dist = haversine(req.lat, req.lng, h["lat"], h["lng"])
        dist_score = max(0, 1 - dist / 30) * 100
        avail_score = h["availability"]
        spec_score = 100 if spec in h["specs"] else 30
        total = round(W_DIST * dist_score + W_AVAIL * avail_score + W_SPEC * spec_score)

        scored.append(Hospital(
            name=h["name"], distance=dist, availability=h["availability"],
            specialization=spec, has_specialization=(spec in h["specs"]),
            score=total, address=h["address"], phone=h["phone"],
        ))

    scored.sort(key=lambda x: x.score, reverse=True)
    top5 = scored[:5]

    return EmergencyRedirectResponse(
        best_hospital=top5[0] if top5 else None,
        all_suggestions=top5,
        detected_specialization=spec,
    )


@app.get("/hospitals/nearby")
async def nearby_hospitals(lat: float = 28.6139, lng: float = 77.2090):
    """Get all nearby hospitals sorted by distance"""
    result = []
    for h in HOSPITALS:
        dist = haversine(lat, lng, h["lat"], h["lng"])
        result.append({**h, "distance": dist})
    result.sort(key=lambda x: x["distance"])
    return result


@app.get("/health")
async def health():
    return {
        "status": "healthy",
        "version": "2.0.0",
        "avg_consult_time": round(avg_consult_time, 1),
        "data_points": len(completion_data),
    }


# ── Doctor Recommendation & Bayesian Ranking Models ──

class CandidateDoctor(BaseModel):
    id: str
    name: str
    specialty: str
    avg_rating: float = 0.0
    rating_count: int = 0
    consultation_fee: float = 500.0
    lat: Optional[float] = None
    lng: Optional[float] = None
    is_available_today: bool = True

class RankDoctorsRequest(BaseModel):
    candidates: List[CandidateDoctor]
    specialty: Optional[str] = None
    patient_lat: Optional[float] = None
    patient_lng: Optional[float] = None
    max_fee: Optional[float] = None
    preference: Optional[str] = "balanced"

class RankedDoctorItem(BaseModel):
    id: str
    name: str
    specialty: str
    score: int
    bayesian_rating: float
    distance_km: Optional[float] = None
    recommended_because: List[str]

class RankDoctorsResponse(BaseModel):
    ranked_doctors: List[RankedDoctorItem]
    algorithm: str = "bayesian_multi_factor"


@app.post("/rank-doctors", response_model=RankDoctorsResponse)
async def rank_doctors(req: RankDoctorsRequest):
    """
    AI-powered doctor ranking:
    Uses Bayesian average rating (shrinkage) to ensure reliable ratings dominate low-volume edge cases,
    combined with Haversine distance, fee affordability, availability, and explainable recommendations.
    """
    # Prior constants
    BAYES_M = 25.0
    BAYES_C = 4.0

    # Dynamic weights by patient preference
    weights = {
        "specialty": 0.30,
        "rating": 0.25,
        "distance": 0.20,
        "fee": 0.15,
        "availability": 0.10,
    }
    if req.preference == "rating":
        weights = {"specialty": 0.25, "rating": 0.40, "distance": 0.15, "fee": 0.10, "availability": 0.10}
    elif req.preference == "distance":
        weights = {"specialty": 0.25, "rating": 0.15, "distance": 0.40, "fee": 0.10, "availability": 0.10}
    elif req.preference == "fee":
        weights = {"specialty": 0.25, "rating": 0.15, "distance": 0.15, "fee": 0.35, "availability": 0.10}
    elif req.preference == "availability":
        weights = {"specialty": 0.25, "rating": 0.15, "distance": 0.15, "fee": 0.15, "availability": 0.30}

    ranked = []
    for doc in req.candidates:
        # 1. Specialty score
        spec_match = False
        if req.specialty:
            spec_match = doc.specialty.lower() == req.specialty.lower()
            spec_score = 100.0 if spec_match else 20.0
        else:
            spec_score = 80.0
            spec_match = True

        # 2. Bayesian rating score
        v = max(0, doc.rating_count)
        R = max(0.0, min(5.0, doc.avg_rating))
        bayesian_r = (v * R + BAYES_M * BAYES_C) / (v + BAYES_M) if v > 0 else BAYES_C
        rating_score = min(100.0, (bayesian_r / 5.0) * 100.0)

        # 3. Distance score
        dist_km = None
        dist_score = 50.0
        if req.patient_lat is not None and req.patient_lng is not None and doc.lat is not None and doc.lng is not None:
            dist_km = haversine(req.patient_lat, req.patient_lng, doc.lat, doc.lng)
            dist_score = max(0.0, 1.0 - dist_km / 30.0) * 100.0

        # 4. Fee score
        budget = req.max_fee if req.max_fee else 600.0
        is_affordable = doc.consultation_fee <= budget
        if is_affordable:
            fee_score = 100.0
        else:
            fee_score = max(10.0, 100.0 - (doc.consultation_fee - budget) * 0.08)

        # 5. Availability score
        avail_score = 100.0 if doc.is_available_today else 20.0

        total_score = round(
            weights["specialty"] * spec_score +
            weights["rating"] * rating_score +
            weights["distance"] * dist_score +
            weights["fee"] * fee_score +
            weights["availability"] * avail_score
        )

        reasons = []
        if spec_match:
            reasons.append(f"✓ Specialty matches ({doc.specialty})")
        if dist_km is not None:
            reasons.append(f"✓ {dist_km} km away")
        if doc.rating_count > 0:
            reasons.append(f"✓ {round(doc.avg_rating, 1)} rating ({doc.rating_count} reviews)")
        if is_affordable:
            reasons.append(f"✓ Affordable (₹{int(doc.consultation_fee)})")
        if doc.is_available_today:
            reasons.append("✓ Available today")

        ranked.append(RankedDoctorItem(
            id=doc.id,
            name=doc.name,
            specialty=doc.specialty,
            score=total_score,
            bayesian_rating=round(bayesian_r, 2),
            distance_km=dist_km,
            recommended_because=reasons,
        ))

    ranked.sort(key=lambda x: x.score, reverse=True)
    return RankDoctorsResponse(ranked_doctors=ranked)


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8001)
