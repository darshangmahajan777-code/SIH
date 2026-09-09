# MediQueue+ AI Architecture & Clinical Decision Support (CDS)

## 1. Executive Summary & Architectural Philosophy

MediQueue+ leverages hybrid artificial intelligence to streamline outpatient department (OPD) queue operations, triage emergency routing, match patients with optimal specialists, and provide evidence-based care guidance.

### Non-Autonomous Medical Philosophy (Governing Principle)
> [!IMPORTANT]
> **Strict Clinical Decision Support (CDS) Boundary**:
> The MediQueue+ AI architecture is explicitly designed as a **Clinical Decision Support (CDS)** and operational optimization layer. It is **NEVER** an autonomous diagnostic or treatment prescribing engine.
> - Every AI recommendation includes an immutable non-autonomous disclaimer:
>   > *"Clinical Decision Support (CDS) recommendation only. Not an autonomous medical diagnosis or prescription. Attending physician authority remains governing."*
> - Clinicians and triage officers retain absolute override authority. Every priority alteration or clinical action is accompanied by mandatory audit reason logging.

### Zero Disruption Guarantee & Universal Deterministic Fallbacks
> [!NOTE]
> **100% Uptime Resilience**:
> The primary healthcare application (Node.js API, queue tokens, doctor search, appointments, telemedicine) will **never** fail or degrade if the Python AI service is offline, crashing, timing out, or returning malformed data.
> Every single AI feature is backed by a pure, deterministic mathematical or rule-based fallback running directly in the Node.js runtime.

---

## 2. System Architecture & Component Topology

```
                  ┌─────────────────────────────────────────┐
                  │          Client Applications            │
                  │  (Patient Hub, Doctor Workspace, Admin) │
                  └────────────────────┬────────────────────┘
                                       │ REST / Socket.IO
                                       ▼
                  ┌─────────────────────────────────────────┐
                  │          Node.js API Gateway            │
                  │       (Express, Port 5000)              │
                  │                                         │
                  │   [ server/services/aiService.js ]      │
                  │   • safeAiCall (Timeout & Validation)   │
                  │   • Deterministic Fallback Engines      │
                  └────────────┬────────────────────────────┘
                               │
                HTTP / JSON    │ Timeout: 1500–2000ms
             (With Fallback)   │
                               ▼
                  ┌─────────────────────────────────────────┐
                  │       Python AI Microservice            │
                  │       (FastAPI, Port 8001)              │
                  │                                         │
                  │   • /predict & /wait-estimate/patient   │
                  │   • /emergency/redirect                 │
                  │   • /rank-doctors                       │
                  │   • /priority/evaluate-condition        │
                  │   • /priority-score (Anti-Starvation)   │
                  │   • /care-plan/assist                   │
                  └─────────────────────────────────────────┘
```

---

## 3. Mathematical Models & Algorithmic Foundations

### A. Wait-Time Prediction (Poisson-Inspired Model)
Traditional simple linear averaging ($PatientsAhead \times AvgTime$) fails in hospital OPDs due to circadian patient arrival waves, consultation duration variance, and in-progress delays.

MediQueue+ models consultation duration as a Poisson-inspired queue process adjusted for time-of-day:

$$W_{base} = N_{ahead} \cdot T_{avg} \cdot F_{circadian}(t)$$

Where:
- $N_{ahead}$: Number of patients ahead in the effective queue.
- $T_{avg}$: Rolling average consultation duration updated via `/update-data` after each completed visit (clamped between 3.0 and 120.0 minutes).
- $F_{circadian}(t) = 1.0 + 0.15 \cdot \sin\left(\frac{t \cdot \pi}{12}\right)$: Circadian factor modeling peak arrival surges around 11:00 AM and 3:00 PM.
- In-progress adjustment:
  $$T_{in\_prog\_remaining} = \begin{cases} 
  \max(2.0, T_{avg} - T_{elapsed}), & \text{if } T_{elapsed} < T_{avg} \\
  3.0 + (T_{elapsed} - T_{avg}) \cdot 0.3, & \text{if } T_{elapsed} \ge T_{avg} \text{ (Doctor slowdown)}
  \end{cases}$$
- Uncertainty buffer: $U(N_{ahead}) = \min(0.25, N_{ahead} \cdot 0.02)$.
- Final Estimated Wait:
  $$W_{total} = (W_{base} + T_{in\_prog\_remaining}) \cdot (1.0 + U(N_{ahead}))$$

### B. Emergency Hospital Ranking (Multi-Factor Haversine & Capacity)
When an emergency occurs, ambulances and patients require rapid routing based on proximity, live bed availability, and specialty capability.

- Haversine Distance ($d_{km}$):
  $$a = \sin^2\left(\frac{\Delta \phi}{2}\right) + \cos(\phi_1)\cos(\phi_2)\sin^2\left(\frac{\Delta \lambda}{2}\right)$$
  $$d_{km} = 2 \cdot R_{earth} \cdot \text{atan2}(\sqrt{a}, \sqrt{1-a})$$
- Composite Score (0–100):
  $$Score = 0.35 \cdot S_{dist} + 0.40 \cdot S_{avail} + 0.25 \cdot S_{spec}$$
  Where:
  - $S_{dist} = \max(0, 1 - \frac{d_{km}}{30}) \cdot 100$
  - $S_{avail} = \text{Bed availability percentage (0–100)}$
  - $S_{spec} = 100$ if hospital supports detected condition specialization, else $30$.

### C. Doctor Ranking (Bayesian Multi-Factor with Explainability)
Simple star averages fail because a doctor with $5.0$ stars from 1 review will unfairly outrank a renowned specialist with $4.8$ stars from 500 reviews.

MediQueue+ uses **Bayesian Average Rating Shrinkage**:

$$R_{bayes} = \frac{v \cdot R + M \cdot C}{v + M}$$

Where:
- $v$: Number of patient reviews (`ratingCount`).
- $R$: Raw average rating (`avgRating`).
- $M = 25$: Prior weight (minimum reviews threshold to pull away from the mean).
- $C = 4.0$: Platform baseline prior mean.

#### Multi-Factor Scoring Formulation
Total doctor ranking score is computed using dynamic weights reflecting patient preference:

$$Score = W_{spec} \cdot S_{spec} + W_{rating} \cdot S_{rating} + W_{dist} \cdot S_{dist} + W_{fee} \cdot S_{fee} + W_{avail} \cdot S_{avail}$$

| Preference | Specialty ($W_{spec}$) | Rating ($W_{rating}$) | Distance ($W_{dist}$) | Fee ($W_{fee}$) | Availability ($W_{avail}$) |
|---|---|---|---|---|---|
| **Balanced** | 0.30 | 0.25 | 0.20 | 0.15 | 0.10 |
| **Rating** | 0.25 | 0.40 | 0.15 | 0.10 | 0.10 |
| **Distance** | 0.25 | 0.15 | 0.40 | 0.10 | 0.10 |
| **Affordability (Fee)** | 0.25 | 0.15 | 0.15 | 0.35 | 0.10 |
| **Availability** | 0.25 | 0.15 | 0.15 | 0.15 | 0.30 |

Every ranked doctor includes explicit `rank` (1, 2, 3...), `score`, and human-readable `explanation` reasons (e.g., `✓ Specialty matches (Cardiology)`, `✓ 2.8 km away`, `✓ 4.9 rating (140 reviews)`, `✓ Affordable (₹600)`).

### D. Priority Support & Anti-Starvation Queue Interleaving
Triage priority is evaluated based on clinical acuity:
- **Critical (Score 95)**: Potential acute emergencies (chest pain, stroke, seizure, severe trauma, unconsciousness, $SpO_2 < 90\%$, $HR > 140$ or $< 40$).
- **Urgent (Score 70)**: High fever in infants, fractures, deep cuts, severe burns, $SpO_2 \in [90, 94]\%$, $HR \in [110, 140]$.
- **Routine (Score 25)**: Non-emergent standard outpatient presentations.

#### Anti-Starvation Policy
If multiple critical or urgent patients arrive, routine patients could starve indefinitely. The anti-starvation algorithm interleaves routine patients after a configurable threshold:

```
[ Consecutive Higher-Priority Patients Served ] >= StarvationLimit (Default: 2)
                             │
                             ▼
            [ Interleave 1 Routine Patient Turn ]
```

---

## 4. Care-Plan Assistance (Non-Autonomous Clinical Guidance)

Doctors can draft comprehensive lifestyle, dietary, and physical activity guidance in 1 click during clinical encounters.

- **Inputs**: Minimal clinical condition (`condition`, optional `patientAge`, `patientGender`).
- **Outputs**:
  - `dietRecommended`: Evidence-based foods to encourage (e.g., DASH diet for hypertension, low-GI complex carbs for diabetes).
  - `dietRestricted`: Dietary items to minimize (e.g., high sodium, refined sugars, saturated trans-fats).
  - `activitiesRecommended`: Physical mobility, home monitoring, and restorative practices.
  - `activitiesRestricted`: Risky physical maneuvers (e.g., heavy isometric straining for cardiac patients, high-impact running for joint rehabilitation).
  - `suggestedFollowUpDays`: Recommended review timeframe (7, 10, or 14 days).
  - `clinicalNotesTemplate`: Attending physician draft template for encounter documentation.
  - `disclaimer`: Strict non-autonomous CDS notice.

---

## 5. Universal Deterministic Fallback Matrix

| AI Function | Endpoint | AI Available | Fallback Engine | Caller Impact |
|---|---|---|---|---|
| **Wait-Time Prediction** | `/wait-estimate/patient` | Returns Poisson estimate with live rolling average and factors. | `calculatePoissonWaitDeterministic`: Computes Poisson formula with local rolling average. | **Zero disruption**: Returns valid wait minutes and confidence. |
| **Emergency Hospital Redirect** | `/emergency/redirect` | Returns top ranked hospitals via Python microservice. | `rankNearbyHospitalsDeterministic`: Computes Haversine distance and capacity scoring locally. | **Zero disruption**: Returns sorted hospital suggestions. |
| **Doctor Ranking** | `/rank-doctors` | Returns Bayesian ranked doctors from microservice. | `rankDoctorsDeterministic`: Local Bayesian rating shrinkage ($M=25, C=4.0$) + preference weights. | **Zero disruption**: Returns ranked list with scores & reasons. |
| **Priority Triage Support** | `/priority/evaluate-condition` | Evaluates condition & vitals via AI service. | `evaluatePriorityDeterministic`: Evaluates acuity using deterministic clinical keywords and vital thresholds. | **Zero disruption**: Returns priority, score, reason, disclaimer. |
| **Care-Plan Assistance** | `/care-plan/assist` | Returns evidence-based care guidance via microservice. | `getCarePlanTemplatesDeterministic`: Generates condition-specific clinical lifestyle templates. | **Zero disruption**: Returns complete structured care plan draft. |

---

## 6. Resilience & Failure Handling (Chaos Scenarios)

The Node.js integration layer (`server/services/aiService.js`) implements `safeAiCall` to handle all possible failure modes:

1. **AI Offline (ECONNREFUSED)**:
   - When the Python service is stopped, `axios` immediately catches the connection error.
   - The deterministic engine executes instantly (sub-millisecond latency).
   - The returned object includes `{ source: 'deterministic_fallback' }`.
2. **AI Service Timeout**:
   - Every AI request is wrapped with a strict timeout (`1500–2000ms`).
   - If the AI microservice hangs or experiences high load, the call aborts cleanly and the deterministic fallback takes over without hanging the client request.
3. **Malformed / Invalid AI Response**:
   - If the AI returns an empty body, unexpected schema, or wrong data types, the `validator` callback detects the invalid payload and triggers the fallback.
4. **Empty Candidates / Missing Input**:
   - Calling doctor ranking with `doctors: []` immediately returns `[]` without dispatching network calls or throwing errors.
5. **Invalid / Null Inputs**:
   - Negative wait times, missing coordinates, or missing vitals are automatically clamped and sanitized with safe defaults.
