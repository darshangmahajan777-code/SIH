# MediQueue+ System Architecture

**System:** MediQueue+ (Enterprise Extension of HC-01)  
**Target:** Smart India Hackathon (SIH) — Smart Outpatient Queue Orchestration & Digital Health System  
**Specification Version:** 2.0 (Production-Ready)  

---

## 1. Architectural Principles & High-Level Topology

MediQueue+ bridges walk-in public healthcare queues with scheduled digital outpatient care across multiple hospital networks. The system is designed around five core architectural pillars:

1. **Patient Data Sovereignty**: The patient exclusively owns their Electronic Health Records (EHR). Protected clinical history, lab results, and care plans are completely shielded from doctors unless an explicit, time-bounded `AccessGrant` exists.
2. **Zero-Trust Clinical Access**: Attending clinicians only receive access to medical dossiers via cryptographically validated session tokens or verified consent grants. Every data access event is immutably logged to an `AccessLog` audit trail.
3. **Smart Virtual Queue & Arrival Buffering**: Patients do not wait in crowded hospital waiting rooms. The virtual queue engine computes an estimated time window (e.g., `4:30–4:50 PM`) and a recommended arrival buffer (e.g., `4:15 PM`), notifying the patient via real-time WebSocket pushes when their turn approaches.
4. **Unified Clinician Workspace**: Doctors interact through a single, cohesive clinical interface that combines the waiting queue, urgent triage alerts, patient dossier, digital prescriptions, lab orders, and care plans without context switching.
5. **High Reliability & Deterministic Fallbacks**: Critical healthcare functions (queue calculation, doctor discovery, priority triage) never fail when auxiliary services (such as external Python/AI engines or WebRTC TURN servers) go offline. The system automatically engages robust mathematical heuristics.

```
                         ┌────────────────────────────────────────┐
                         │      Client Layer (React 18 + Vite)     │
                         │  - Unified Patient Dashboard           │
                         │  - Doctor Clinical Workspace           │
                         │  - Public OPD Display Board            │
                         │  - Reception & Walk-in Kiosk           │
                         │  - WebRTC Telemedicine Room            │
                         └───────────────────┬────────────────────┘
                                             │ HTTP REST / WebSocket
                                             ▼
                         ┌────────────────────────────────────────┐
                         │   Backend Core (Node.js / Express ESM) │
                         │  - Express REST Routing (15 routers)   │
                         │  - Socket.IO Real-time Engine          │
                         │  - RBAC & Consent Enforcement Guard    │
                         │  - Schedule & Slot Concurrency Engine  │
                         │  - Virtual Queue & Near-Turn Predictor │
                         │  - WebRTC Signaling Coordinator        │
                         └───────────┬─────────────────┬──────────┘
                                     │                 │
             Internal HTTP (Optional)│                 │ Mongoose Driver
                                     ▼                 ▼
          ┌───────────────────────────────┐   ┌───────────────────────────┐
          │  AI Microservice (FastAPI/Py) │   │     MongoDB Database      │
          │  - Bayesian Doctor Ranking    │   │  - Hospitals & Doctors    │
          │  - Poisson Queue Predictor    │   │  - Users & Profiles       │
          │  - Structured Clinical Triage │   │  - Appointments & Tokens  │
          │  - Care Plan AI Assistance    │   │  - Grants & Access Logs   │
          │  (With Deterministic Fallback)│   │  - Tests, Rx & Care Plans │
          └───────────────────────────────┘   └───────────────────────────┘
```

---

## 2. Multi-Hospital Foundation

MediQueue+ supports hospital networks of any scale without breaking existing single-clinic demo setups:

- **Hospital Model (`server/models/Hospital.js`)**: Encapsulates official hospital name, full address, latitude/longitude geo-coordinates, emergency contact numbers, verified status flag, and active clinical departments (`Cardiology`, `General Medicine`, `Orthopedics`, `Neurology`, etc.).
- **Doctor Association (`server/models/DoctorProfile.js`)**: Associates clinicians directly with a `hospitalId` (ObjectId reference) while preserving legacy `hospitalName` and `location` strings for backwards compatibility.
- **Search Filtering**: The discovery engine supports multi-hospital querying by city, distance radius (Haversine formula), and department specialization.

---

## 3. Patient Data Sovereignty & Consent Engine

To prevent unauthorized cross-patient snooping and comply with medical data privacy frameworks:

1. **AccessGrant Entity (`server/models/AccessGrant.js`)**:
   - Fields: `patientId`, `doctorId`, `scope` (`full`, `history`, `prescriptions`, `tests`, `care_plans`), `status` (`active`, `revoked`), `grantedAt`, `revokedAt`.
   - Creation: Initiated exclusively by the authenticated patient.
   - Revocation: One-click instant revocation that immediately cuts off clinician access.
2. **AccessLog Audit Trail (`server/models/AccessLog.js`)**:
   - Every read of a patient's medical history, lab results, prescriptions, or care plans triggers an immutable log entry recording `patientId`, `doctorId`, `resource`, `action`, and `accessedAt`.
3. **Shielded Data Shielding**:
   - If an unauthorized doctor queries `/api/doctor/encounter/:appointmentId/patient-view`, the server strips all protected records and returns `consent: { isAuthorized: false, status: 'LIMITED ACCESS' }`.

---

## 4. Smart Virtual Queue & Arrival Engine

Traditional OPDs force patients to sit in waiting rooms for hours. MediQueue+ virtualizes the queue:

- **Mathematical Formulation**:
  $$\text{Expected Wait} = \sum_{i=1}^{\text{patientsAhead}} T_{\text{consultation\_avg}} + \max(0, T_{\text{current\_elapsed}} - T_{\text{consultation\_avg}}) + T_{\text{emergency\_penalty}}$$
- **Estimated Window**: Formatted as a confidence interval (e.g., `4:30–4:50 PM`).
- **Recommended Arrival Time**: Calculated as $\text{Window Start} - 15 \text{ minutes}$ (e.g., `4:15 PM`).
- **Near-Turn Alert Engine**: When $\text{patientsAhead} \le 3$ or $\text{waitMinutes} \le 15$, the server triggers a high-priority push notification (`queue:near-turn`) alerting the patient to return to the clinic.

---

## 5. Doctor Clinical Workspace

The doctor workspace (`DoctorClinicalWorkspace.jsx`) integrates all clinical functions:
- **Next Patient Spotlight**: Displays the currently active or next patient in line with immediate token calling.
- **Urgent Patient Acuity Strip**: Triages high-acuity patients based on priority scores and chief complaint severity.
- **Encounter Dossier**: Shows verified medical history, past prescriptions, and lab tests if authorized.
- **Integrated Actions**:
  - Issue digital prescriptions with structured dosage, frequency, and meal relations.
  - Order laboratory diagnostic tests.
  - Issue structured care plans with dietary dos/don'ts and restricted activities.
  - Launch high-definition WebRTC video telemedicine sessions.

---

## 6. Telemedicine & WebRTC Architecture

- **Signaling Infrastructure (`server/socket/telemedicineSignaling.js`)**: Uses Socket.IO rooms scoped strictly to the appointment ID (`telemedicine:appointmentId`).
- **Cryptographic Token Guard (`server/routes/telemedicineRoutes.js`)**: Issues HMAC-signed short-lived tokens valid only for the assigned patient and doctor of that appointment.
- **Call Completion Lifecycle**: Clinician completion of the call automatically marks the appointment as `completed` and cleans up signaling state.

---

## 7. High-Resilience Reliability Strategy

| Component | Failure Condition | Graceful Fallback Behavior |
|---|---|---|
| **AI Microservice** | Offline, Timeout, 500 | Automatic deterministic fallback: Poisson/rolling-average queue math, Dirichlet-multinomial Bayesian doctor scoring, and structured keyword triage. |
| **Socket.IO** | Network Disconnect | Client automatically attempts 10 reconnection retries with 1s backoff; re-joins scoped rooms and resynchronizes state upon reconnect. |
| **MongoDB** | Connection Lost in Tests | Embedded fallback memory store prevents application crashes during offline testing. |
| **Telemedicine** | WebRTC P2P Blocked | Graceful warning displayed with alternative telephone consultation fallback. |
