from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime
import math
import os
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
    rank: Optional[int] = None

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
    for idx, item in enumerate(ranked):
        item.rank = idx + 1
    return RankDoctorsResponse(ranked_doctors=ranked)


# ── Smart Virtual Queue: Priority Scoring & Patient Wait-Time Estimation ──

class EvaluateConditionRequest(BaseModel):
    condition: str
    age: Optional[int] = None
    vitals: Optional[dict] = None

class EvaluateConditionResponse(BaseModel):
    priority: str  # critical, urgent, routine
    score: int     # 0-100
    reason: str
    confidence: float
    decision_source: str = "ai_cds"
    is_cds_recommendation: bool = True
    disclaimer: str = (
        "Clinical Decision Support (CDS) recommendation only. "
        "Not an autonomous medical diagnosis. Physician/clinician oversight required."
    )

class QueueItemInput(BaseModel):
    token_id: str
    token_number: int
    priority: str = "routine"
    arrival_time: Optional[str] = None

class PriorityScoreRequest(BaseModel):
    queue: List[QueueItemInput]
    starvation_limit: Optional[int] = 2

class ReorderedQueueItem(BaseModel):
    token_id: str
    token_number: int
    priority: str
    original_position: int
    effective_position: int
    reason: str

class PriorityScoreResponse(BaseModel):
    effective_queue: List[ReorderedQueueItem]
    algorithm: str = "anti_starvation_priority_interleaving"
    starvation_limit: int = 2

class PatientWaitEstimateRequest(BaseModel):
    token_id: Optional[str] = None
    patients_ahead: int
    avg_time: float = 10.0
    time_of_day: Optional[float] = None
    elapsed_in_progress_minutes: Optional[float] = 0.0

class PatientWaitEstimateResponse(BaseModel):
    estimated_wait_minutes: float
    confidence: float
    factors: dict


@app.post("/priority/evaluate-condition", response_model=EvaluateConditionResponse)
async def evaluate_condition(req: EvaluateConditionRequest):
    """
    Clinical Decision Support (CDS) Triage Evaluation:
    Evaluates patient presentation against clinical acuity criteria (inspired by ESI/MTS).
    Explicitly marked as clinical decision SUPPORT — not autonomous diagnosis.
    Clinician judgement always governs patient care and override authority.
    """
    cond = (req.condition or "").lower().strip()
    vitals = req.vitals or {}

    # Check vitals if provided
    spo2 = vitals.get("spo2")
    hr = vitals.get("heart_rate") or vitals.get("hr")
    temp = vitals.get("temperature") or vitals.get("temp")

    # Critical patterns (Level 1 / 2 acuity)
    critical_keywords = [
        "chest pain", "heart attack", "cardiac", "stroke", "seizure",
        "unconscious", "unresponsive", "anaphylaxis", "choking", "cannot breathe",
        "severe bleeding", "severe trauma", "cyanosis", "coma", "respiratory distress",
    ]
    # Urgent patterns (Level 3 acuity)
    urgent_keywords = [
        "fracture", "high fever", "abdominal pain", "asthma", "vomiting blood",
        "head injury", "deep cut", "severe burn", "kidney stone", "acute pain",
        "dehydration", "dislocation", "breathing difficulty",
    ]

    is_critical = any(kw in cond for kw in critical_keywords)
    if spo2 is not None and float(spo2) < 90.0:
        is_critical = True
    if hr is not None and (float(hr) > 140 or float(hr) < 40):
        is_critical = True

    if is_critical:
        matched = [kw for kw in critical_keywords if kw in cond]
        matched_str = matched[0] if matched else "critical vital parameters"
        return EvaluateConditionResponse(
            priority="critical",
            score=95,
            reason=f"Clinical priority: Potential acute emergency indicated by '{matched_str}'. Requires urgent clinician review.",
            confidence=0.94,
        )

    is_urgent = any(kw in cond for kw in urgent_keywords)
    if req.age is not None and req.age < 1 and ("fever" in cond or (temp and float(temp) > 100.4)):
        is_urgent = True
    if spo2 is not None and 90.0 <= float(spo2) <= 94.0:
        is_urgent = True
    if hr is not None and 110 <= float(hr) <= 140:
        is_urgent = True

    if is_urgent:
        matched = [kw for kw in urgent_keywords if kw in cond]
        matched_str = matched[0] if matched else "abnormal physiological indicators"
        return EvaluateConditionResponse(
            priority="urgent",
            score=70,
            reason=f"Clinical priority: Expedited attention recommended for '{matched_str}'.",
            confidence=0.88,
        )

    # Routine (Level 4 / 5 acuity)
    return EvaluateConditionResponse(
        priority="routine",
        score=25,
        reason="Clinical priority: Non-emergent presentation suitable for standard queue order.",
        confidence=0.90,
    )


@app.post("/priority-score", response_model=PriorityScoreResponse)
async def priority_score(req: PriorityScoreRequest):
    """
    Priority Queuing with Configurable Anti-Starvation Interleaving:
    Critical and urgent patients get moved ahead of routine cases,
    while guaranteeing that routine patients are interleaved so no patient
    starves indefinitely. Provides transparent, auditable reasons for every position.
    """
    raw_queue = req.queue
    starvation_limit = max(1, req.starvation_limit if req.starvation_limit is not None else 2)

    if not raw_queue:
        return PriorityScoreResponse(effective_queue=[], starvation_limit=starvation_limit)

    def normalize_priority(p: str) -> str:
        pl = (p or "").lower().strip()
        if pl in ["critical", "emergency"]: return "critical"
        if pl in ["urgent", "senior"]: return "urgent"
        return "routine"

    criticals = []
    urgents = []
    routines = []

    for idx, item in enumerate(raw_queue):
        norm_p = normalize_priority(item.priority)
        entry = {
            "token_id": item.token_id,
            "token_number": item.token_number,
            "priority": norm_p,
            "original_priority": item.priority,
            "original_pos": idx + 1,
            "arrival_time": item.arrival_time,
        }
        if norm_p == "critical":
            criticals.append(entry)
        elif norm_p == "urgent":
            urgents.append(entry)
        else:
            routines.append(entry)

    reordered = []
    consecutive_higher_priority = 0

    while criticals or urgents or routines:
        # Anti-starvation interleaving
        if consecutive_higher_priority >= starvation_limit and routines:
            routine_item = routines.pop(0)
            reordered.append({
                **routine_item,
                "reason": "Interleaved turn: Starvation prevention policy" if routine_item["original_pos"] <= len(reordered) + 1 else "Standard FIFO order",
            })
            consecutive_higher_priority = 0
            continue

        if criticals:
            crit_item = criticals.pop(0)
            reason = "Moved up: Critical clinical priority (CDS Recommendation)"
            reordered.append({**crit_item, "reason": reason})
            consecutive_higher_priority += 1
        elif urgents:
            urg_item = urgents.pop(0)
            reason = "Priority queue for Urgent patient"
            reordered.append({**urg_item, "reason": reason})
            consecutive_higher_priority += 1
        elif routines:
            routine_item = routines.pop(0)
            reason = "Standard FIFO order"
            reordered.append({**routine_item, "reason": reason})
            consecutive_higher_priority = 0

    result = []
    for eff_idx, item in enumerate(reordered):
        eff_pos = eff_idx + 1
        orig_pos = item["original_pos"]
        reason = item["reason"]

        if item["priority"] == "routine" and eff_pos > orig_pos:
            reason = "Adjusted for incoming Critical/Urgent patients"

        result.append(ReorderedQueueItem(
            token_id=item["token_id"],
            token_number=item["token_number"],
            priority=item["original_priority"],
            original_position=orig_pos,
            effective_position=eff_pos,
            reason=reason,
        ))

    return PriorityScoreResponse(effective_queue=result, starvation_limit=starvation_limit)


@app.post("/wait-estimate/patient", response_model=PatientWaitEstimateResponse)
async def wait_estimate_patient(req: PatientWaitEstimateRequest):
    """
    Patient-specific Poisson wait time estimation:
    Projects consultation time for an individual token based on effective queue position,
    time-of-day dynamics, doctor pace (rolling average), and elapsed in-progress consultation.
    """
    now = datetime.now()
    time_of_day = req.time_of_day if req.time_of_day is not None else (now.hour + now.minute / 60.0)

    time_factor = 1.0 + 0.15 * math.sin(time_of_day * math.pi / 12.0)
    effective_avg = avg_consult_time if len(completion_data) > 3 else max(5.0, req.avg_time)

    in_progress_remaining = 0.0
    doctor_delay_detected = False
    if req.elapsed_in_progress_minutes and req.elapsed_in_progress_minutes > 0:
        if req.elapsed_in_progress_minutes < effective_avg:
            in_progress_remaining = max(2.0, effective_avg - req.elapsed_in_progress_minutes)
        else:
            in_progress_remaining = 3.0 + (req.elapsed_in_progress_minutes - effective_avg) * 0.3
            doctor_delay_detected = True

    base_wait = req.patients_ahead * effective_avg * time_factor
    total_wait = in_progress_remaining + base_wait

    uncertainty = min(0.25, req.patients_ahead * 0.02)
    total_wait *= (1.0 + uncertainty)

    confidence = max(0.5, 1.0 - req.patients_ahead * 0.025)
    if doctor_delay_detected:
        confidence = max(0.45, confidence - 0.1)

    return PatientWaitEstimateResponse(
        estimated_wait_minutes=round(total_wait, 1),
        confidence=round(confidence, 2),
        factors={
            "effective_avg_time": round(effective_avg, 1),
            "time_factor": round(time_factor, 3),
            "in_progress_remaining": round(in_progress_remaining, 1),
            "doctor_delay_detected": doctor_delay_detected,
            "uncertainty_buffer": round(uncertainty, 3),
        }
    )


# ── Care Plan Assistance (Non-Autonomous Clinical Guidance) ──

class CarePlanAssistRequest(BaseModel):
    condition: str
    patient_age: Optional[int] = None
    patient_gender: Optional[str] = None

class CarePlanAssistResponse(BaseModel):
    condition: str
    diet_recommended: List[str]
    diet_restricted: List[str]
    activities_recommended: List[str]
    activities_restricted: List[str]
    suggested_follow_up_days: int
    clinical_notes_template: str
    is_assistant_draft: bool = True
    disclaimer: str = (
        "Clinical Decision Support (CDS) template only. "
        "Not an autonomous medical diagnosis or prescription. "
        "The attending physician must review, customize, and authorize all care plans."
    )


@app.post("/care-plan/assist", response_model=CarePlanAssistResponse)
async def care_plan_assist(req: CarePlanAssistRequest):
    """
    Evidence-based care plan draft assistant.
    Generates structured doctor-editable recommendations for diet, lifestyle, and follow-up.
    Strictly non-autonomous: clinician review and authorization is required.
    """
    c = (req.condition or "").lower().strip()

    if any(k in c for k in ["hypertension", "blood pressure", "bp", "cardiac"]):
        return CarePlanAssistResponse(
            condition=req.condition or "Hypertension Management",
            diet_recommended=[
                "DASH dietary pattern rich in fresh vegetables and whole grains",
                "High-potassium fruits (bananas, oranges, leafy greens)",
                "Low-sodium meals (< 2000 mg/day)",
                "Optimal hydration (2.5 liters of water daily)",
            ],
            diet_restricted=[
                "High-sodium processed foods, pickles, and canned soups",
                "Excessive caffeine and carbonated energy drinks",
                "Saturated trans-fats and fried foods",
            ],
            activities_recommended=[
                "30 minutes moderate brisk walking, 5 days per week",
                "Daily morning and evening blood pressure log recording",
                "Deep breathing or mindfulness meditation (10-15 mins daily)",
            ],
            activities_restricted=[
                "Heavy isometric straining or sudden unconditioned heavy lifting",
                "High-intensity burst cardio without adequate warm-up",
            ],
            suggested_follow_up_days=14,
            clinical_notes_template="Patient advised on DASH dietary compliance and home BP log monitoring. Titrate medication if BP remains above 130/80 mmHg at follow-up.",
        )

    if any(k in c for k in ["diabetes", "sugar", "glucose"]):
        return CarePlanAssistResponse(
            condition=req.condition or "Type-2 Diabetes Glycemic Care",
            diet_recommended=[
                "Complex carbohydrates with low glycemic index (oats, barley, brown rice)",
                "High-fiber green vegetables (spinach, broccoli, beans)",
                "Lean proteins (pulses, egg whites, grilled fish)",
                "Consistent meal spacing every 3.5 to 4 hours",
            ],
            diet_restricted=[
                "Refined sugars, sweets, sweetened sodas, and syrups",
                "Simple carbohydrates and white flour products",
                "Late-night high-carb snacking",
            ],
            activities_recommended=[
                "30–45 minutes daily aerobic exercise (walking, swimming, light cycling)",
                "Daily routine inspection of feet for minor cuts or blisters",
                "Periodic fasting and post-prandial glucose tracking",
            ],
            activities_restricted=[
                "Prolonged unmonitored fasting without physician guidance",
                "Walking barefoot outdoors",
            ],
            suggested_follow_up_days=14,
            clinical_notes_template="Glycemic management protocol initiated. HbA1c review and lifestyle adherence assessment scheduled at follow-up.",
        )

    if any(k in c for k in ["asthma", "bronchitis", "respiratory", "cough"]):
        return CarePlanAssistResponse(
            condition=req.condition or "Respiratory / Asthma Management",
            diet_recommended=[
                "Warm fluids, herbal teas, and clear broths",
                "Antioxidant-rich fresh seasonal fruits and vitamin C foods",
                "Light, easily digestible non-acidic meals",
            ],
            diet_restricted=[
                "Iced beverages, ice cream, and cold foods",
                "Known allergic trigger foods and sulfited dried fruits",
            ],
            activities_recommended=[
                "Gentle diaphragmatic and pursed-lip breathing exercises",
                "Keep rescue inhaler readily accessible at all times",
                "Maintain dust-free, well-ventilated indoor environment",
            ],
            activities_restricted=[
                "Outdoor exertion during peak air quality index (AQI) or pollen warnings",
                "Active or secondhand tobacco and woodfire smoke exposure",
                "Sudden intense cold-air sprinting",
            ],
            suggested_follow_up_days=7,
            clinical_notes_template="Inhaler technique verified with patient. Advised avoidance of environmental triggers and prompt medical review if PEFR decreases.",
        )

    if any(k in c for k in ["fracture", "ortho", "joint", "arthritis", "sprain", "back pain"]):
        return CarePlanAssistResponse(
            condition=req.condition or "Orthopedic Rehabilitation Care",
            diet_recommended=[
                "Calcium and Vitamin D rich dietary items (milk, yogurt, fortified foods)",
                "Anti-inflammatory foods (turmeric, ginger, berries)",
                "Adequate lean protein to support tissue healing",
            ],
            diet_restricted=[
                "Excessive refined sugars and pro-inflammatory fried foods",
                "Alcohol and smoking (impairs bone/ligament healing)",
            ],
            activities_recommended=[
                "Physiotherapist-guided range of motion exercises",
                "Ergonomic lumbar support during seated work",
                "Cold compress for acute swelling / moist heat for chronic stiffness",
            ],
            activities_restricted=[
                "Heavy lifting (> 5 kg) or sudden spinal twisting",
                "High-impact jumping, running, or contact sports",
            ],
            suggested_follow_up_days=10,
            clinical_notes_template="Mobility and pain management protocol. Radiographic re-assessment or physical therapy progress to be evaluated at follow-up.",
        )

    # General clinical guideline fallback
    return CarePlanAssistResponse(
        condition=req.condition or "General Recuperation & Wellness",
        diet_recommended=[
            "Balanced nutritious diet emphasizing whole grains, vegetables, and lean proteins",
            "Adequate daily hydration (2 to 3 liters water daily)",
        ],
        diet_restricted=[
            "Deep-fried, excessively oily, and heavily processed fast foods",
            "Excessive alcohol, caffeine, and sweetened beverages",
        ],
        activities_recommended=[
            "Adequate restorative sleep (7 to 8 hours nightly)",
            "Gentle daily movement and light walking as tolerated",
        ],
        activities_restricted=[
            "Physical overexertion and irregular sleep schedules",
            "Tobacco and smoking products",
        ],
        suggested_follow_up_days=7,
        clinical_notes_template="General clinical advice provided. Patient instructed to monitor symptoms and attend follow-up if condition does not improve.",
    )


if __name__ == "__main__":
    host = os.getenv("AI_HOST", "0.0.0.0")
    port = int(os.getenv("AI_PORT", os.getenv("PORT", "8001")))
    uvicorn.run(app, host=host, port=port)

