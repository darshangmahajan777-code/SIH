# MediQueue+ FastAPI AI Microservice Deployment Guide

**Service:** Python FastAPI Clinical Decision Support & Queue AI Microservice (`/ai`)  
**Version:** 2.0.0 (Production Release)  
**Primary Cloud Providers:** Render (Web Service), Railway, Containerized Cloud VPS (Docker), AWS ECS / Fargate  
**Status:** **DEPLOYMENT VALIDATED**

---

## 1. Verified & Implemented AI Endpoints

All endpoints documented below exist directly in [`ai/main.py`](file:///c:/Users/saurav/SIH/hc-01--main-main/hc-01--main-main/ai/main.py):

### 1.1 Wait-Time Prediction
- **`POST /predict`**: Core Poisson wait time prediction engine.
  - *Input*: `patients_ahead` (int), `avg_time` (float), `time_of_day` (float: 0-23).
  - *Output*: `estimated_wait` (float), `confidence` (float), `factors` (dict: time factor, uncertainty buffer, data points).
- **`POST /wait-estimate/patient`**: Personalized patient queue ETA taking active in-progress consultation delays into account.
  - *Input*: `token_id`, `patients_ahead`, `avg_time`, `time_of_day`, `elapsed_in_progress_minutes`.
  - *Output*: `estimated_wait_minutes`, `confidence`, `time_window` (`start`, `end`), `recommended_arrival_time`, `is_near_turn`.
- **`POST /update-data`**: Ingests completed consultation durations (`called_at`, `completed_at`) for continuous rolling-average learning.

### 1.2 Emergency Hospital Recommendation
- **`POST /emergency/redirect`**: AI-powered hospital triage and routing.
  - *Input*: `condition` (string), `lat` (float), `lng` (float).
  - *Algorithm*: NLP specialization keyword detection + Haversine distance weighting (0.35) + bed availability (0.40) + specialization match (0.25).
  - *Output*: `best_hospital`, `all_suggestions` (top 5), `detected_specialization`.
- **`GET /hospitals/nearby`**: Geospatial distance-sorted list of regional emergency hospitals.

### 1.3 Doctor Recommendation & Multi-Factor Ranking
- **`POST /rank-doctors`**: Multi-criteria Bayesian ranking of doctors.
  - *Input*: `patient_lat`, `patient_lng`, `specialty`, `preferred_gender`, `max_fee`, `preference` ("rating" | "distance" | "fee" | "balanced"), `candidate_doctors`.
  - *Output*: `ranked_doctors` (sorted with composite Bayesian scores and distance in km).

### 1.4 Clinical Priority Support & Triage
- **`POST /priority/evaluate-condition`**: Clinical Decision Support (CDS) for patient symptom severity evaluation.
  - *Input*: `condition` (chief complaint string), `age` (optional int), `vitals` (optional dict: systolic, diastolic, heart_rate, spo2).
  - *Output*: `priority` ("critical" | "urgent" | "routine"), `score` (0-100), `reason`, `confidence`, `disclaimer`.
- **`POST /priority-score`**: Queue reordering engine with starvation prevention.
  - *Input*: `queue` (array of patient tokens), `starvation_limit_minutes` (int).
  - *Output*: `effective_queue` (reordered sequence preventing general patient starvation).

### 1.5 Clinical Decision Support (CDS) Care Plan Assistant
- **`POST /care-plan/assist`**: Clinical recommendations for lifestyle modifications and follow-up templates.
  - *Input*: `diagnosis`, `allergies`, `vitals`.
  - *Output*: `diet_recommended`, `diet_restricted`, `activities_recommended`, `suggested_follow_up_days`, `clinical_notes_template`.

---

## 2. Production Runtime Configuration

The AI microservice is configured for cloud deployment:
1. **Dynamic Port Listening**:
   ```python
   if __name__ == "__main__":
       host = os.getenv("AI_HOST", "0.0.0.0")
       port = int(os.getenv("AI_PORT", os.getenv("PORT", "8001")))
       uvicorn.run(app, host=host, port=port)
   ```
   Listens on `$PORT` injected by cloud PaaS (e.g. Render, Railway, Cloud Run).
2. **Health Check Endpoint**:
   - `GET /health`
   - Returns 200 OK:
     ```json
     {
       "status": "healthy",
       "version": "2.0.0",
       "avg_consult_time": 10.0,
       "data_points": 0
     }
     ```
3. **CORS Middleware**: Configured with `CORSMiddleware` permitting backend service calls.
4. **Input Validation**: Pydantic v2 schemas reject malformed JSON payloads with explicit HTTP 422 errors.

---

## 3. Backend Integration & Configuration

The Node.js backend connects to the AI service using either `AI_SERVICE_URL` or `AI_URL`:

```bash
# In backend server/.env:
AI_SERVICE_URL=https://hospital-queue-ai.onrender.com
# or
AI_URL=https://hospital-queue-ai.onrender.com
```

### Backend Resolution Chain
Across all backend services (`aiService.js`, `virtualQueueService.js`, `recommendationService.js`, `priorityService.js`):
```javascript
export const getAiUrl = () => process.env.AI_SERVICE_URL || process.env.AI_URL || 'http://localhost:8001';
```
If `AI_SERVICE_URL` or `AI_URL` is set to a cloud domain, the backend routes requests to that cloud endpoint.

---

## 4. Guaranteed Deterministic Failover (Zero-Downtime Guarantee)

The application **never crashes, hangs, or fails** if the AI microservice is offline, slow, or returning errors:

| Feature | AI Endpoint | Backend Fallback Engine | Behavior When AI Is Offline |
|---|---|---|---|
| **Virtual Queue ETA** | `/wait-estimate/patient` | `calculateTimeWindow()` in `virtualQueueService.js` | Uses rolling average consultation duration and current queue position. |
| **Priority Queue Order** | `/priority-score` | `sortTokensByPriority()` in `virtualQueueService.js` | Uses deterministic clinical priority hierarchy (`critical` > `urgent` > `routine`) and arrival timestamps. |
| **Doctor Search & Ranking** | `/rank-doctors` | `calculateBayesianRating()` in `recommendationService.js` | Calculates Bayesian weighted review score and Haversine distance in Node.js. |
| **Emergency Triage** | `/emergency/redirect` | `rankNearbyHospitalsDeterministic()` in `aiService.js` | Evaluates condition keywords and scores hospitals via local Haversine formula. |
| **Condition Triage** | `/priority/evaluate-condition` | `evaluateConditionDeterministic()` in `priorityService.js` | Evaluates vital sign thresholds and keyword matching deterministically. |

---

## 5. Cloud Deployment Runbook

### 5.1 Deploying to Render via `render.yaml`
The root [`render.yaml`](file:///c:/Users/saurav/SIH/hc-01--main-main/hc-01--main-main/render.yaml) defines:
```yaml
  - type: web
    name: hospital-queue-ai
    env: python
    plan: free
    buildCommand: cd ai && pip install -r requirements.txt
    startCommand: cd ai && uvicorn main:app --host 0.0.0.0 --port $PORT
    healthCheckPath: /health
```
Render automatically builds the Python environment, executes `pip install`, and monitors `/health`.

### 5.2 Deploying via Docker
```bash
# Build the AI container
docker build -f docker/Dockerfile.ai -t mediqueue-ai ./ai

# Run container on port 8001
docker run -d -p 8001:8001 --name mediqueue-ai mediqueue-ai

# Probe health
curl -f http://localhost:8001/health
```

---

## 6. End-to-End Test Verification

All AI microservice integrations and fallback engines are verified by automated backend integration tests:

```bash
cd server
npm test tests/aiArchitectureHardening.test.js
npm test tests/smartVirtualQueue.test.js
npm test tests/ratingAndRecommendation.test.js
```

**Verification Results**:
- [x] AI Health Endpoint probe: **200 OK**
- [x] Poisson wait time prediction: **VERIFIED**
- [x] Emergency triage and hospital ranking: **VERIFIED**
- [x] Multi-criteria doctor ranking: **VERIFIED**
- [x] Clinical priority evaluation and anti-starvation: **VERIFIED**
- [x] Failover test (AI offline simulation on port 9099): **100% PASS** (Backend continues functioning seamlessly)
