# Technical Requirements Document (TRD)
## MediQueue+ — Patient-Doctor Healthcare Platform
### (Extension of the existing Hospital Queue Management System)

**Version:** 1.0 · **Companion to:** `PRD.md`
**Base stack (unchanged):** React + Vite + Tailwind + Socket.io-client
(`/client`) · Node.js + Express + Socket.IO + Mongoose/MongoDB (`/server`) ·
Python FastAPI (`/ai`) · shared constants (`/shared`)

---

## 1. Architecture Overview

```
client (React)
  ├─ existing: /reception /doctor /display /emergency
  └─ new:      /login /signup /patient-dashboard /find-doctors
               /doctor/schedule /doctor/patient/:id /appointment/:id
               /video/:appointmentId

server (Express + Socket.IO)
  ├─ existing routes: tokenRoutes, doctorRoutes, emergencyRoutes, summaryRoutes
  └─ new routes:      authRoutes, patientRoutes, doctorProfileRoutes,
                       appointmentRoutes, prescriptionRoutes, reminderRoutes,
                       ratingRoutes, testOrderRoutes, carePlanRoutes,
                       accessRoutes (consent), videoRoutes (call signaling
                       token issuance only — media stays P2P/hosted TURN)

ai (FastAPI)
  ├─ existing: wait-time prediction (Poisson), emergency hospital ranking
               (Haversine)
  └─ extended: /rank-doctors (rating+distance+fee composite score),
               /priority-score (severity → queue-weight),
               /wait-estimate/patient/:tokenId (reuses existing model)

New shared cross-cutting service: Notification/Reminder scheduler
  - runs inside /server as a lightweight in-process scheduler (node-cron)
    for the hackathon build; documented upgrade path to a real job queue
    (BullMQ + Redis, which is already in docker-compose) if time allows.
```

No existing model, route, or socket event is removed or renamed. New
collections reference existing ones (`Token`, `DoctorSession`) by ID rather
than duplicating them.

---

## 2. Authentication & Roles

- JWT-based auth, issued by `authRoutes` (`/api/auth/signup`,
  `/api/auth/login`, `/api/auth/me`).
- Roles: `patient`, `doctor`, `receptionist`, `admin`.
- Existing Reception/Doctor/Display panels can stay token-less/kiosk-mode as
  they are today (internal hospital use); new patient- and doctor-facing
  dashboards require auth.
- Middleware: `requireAuth`, `requireRole(['doctor'])`, etc., added to
  `/server/middleware` alongside the existing rate-limiter/error handler.
- Passwords hashed with bcrypt; JWT stored client-side (httpOnly cookie
  preferred over localStorage for the hackathon demo if time allows;
  localStorage acceptable as a fallback).

---

## 3. New Data Models (Mongoose)

All new models live in `/server/models`, alongside the existing five.

### 3.1 `User` (base auth record)
```
{
  _id, role: 'patient' | 'doctor' | 'receptionist' | 'admin',
  name, email, phone, passwordHash,
  createdAt
}
```

### 3.2 `PatientProfile`
```
{
  _id, userId (ref User),
  dob, gender, bloodGroup, heightCm, weightKg,   // BMI computed, not stored
  allergies: [String],
  chronicConditions: [String],
  emergencyContact: { name, phone, relation },
  createdAt, updatedAt
}
```

### 3.3 `DoctorProfile`
```
{
  _id, userId (ref User),
  specialty, qualifications: [String],
  hospitalName, location: { lat, lng, address },
  consultationFee, followUpFee,
  avgRating (denormalized, recalculated on new rating), ratingCount,
  workingHours: [{ day, startTime, endTime, slotMinutes }],
  videoEnabled: Boolean
}
```

### 3.4 `MedicalHistoryEntry`
```
{
  _id, patientId (ref PatientProfile),
  source: 'self-reported' | 'doctor-verified',
  recordedByDoctorId (ref DoctorProfile, nullable for self-reported),
  appointmentId (ref Appointment, nullable),
  condition, notes, date,
  createdAt
}
```

### 3.5 `Appointment`
```
{
  _id, patientId (ref PatientProfile), doctorId (ref DoctorProfile),
  date, slotTime,
  mode: 'in-person' | 'video',
  status: 'booked' | 'checked-in' | 'in-progress' | 'completed' | 'cancelled',
  priority: 'routine' | 'urgent' | 'critical',
  tokenId (ref Token, set when linked into the existing queue for the day),
  chiefComplaint,
  accessGranted: Boolean,      // patient's consent flag for this appointment
  createdAt, updatedAt
}
```
*This is the join point with the existing queue engine: when an appointment
is confirmed for "today," the server creates/links a `Token` document exactly
as Reception does today, so the existing Display board and Doctor panel keep
working unmodified.*

### 3.6 `Prescription`
```
{
  _id, appointmentId (ref Appointment), patientId, doctorId,
  medicines: [{
    name, dosage, frequencyPerDay, times: [String] ("14:00"),
    relationToMeal: 'before' | 'after' | 'with' | 'none',
    durationDays, notes
  }],
  createdAt
}
```

### 3.7 `ReminderSchedule` (generated from Prescription)
```
{
  _id, prescriptionId, patientId, medicineName,
  scheduledAt (Date), status: 'pending' | 'sent' | 'taken' | 'skipped',
}
```
One document per (medicine × scheduled time × day) — simplest to query and
mark done; generated by a service function when a Prescription is created.

### 3.8 `Rating`
```
{
  _id, appointmentId (ref Appointment, must be 'completed'),
  patientId, doctorId, stars (1-5), comment,
  createdAt
}
```

### 3.9 `TestOrder`
```
{
  _id, appointmentId, patientId, doctorId (orderedBy),
  testName, reason, status: 'ordered' | 'completed',
  result: { value, unit, resultDate, labName, notes },
  createdAt
}
```

### 3.10 `CarePlan`
```
{
  _id, appointmentId, patientId, doctorId, diagnosis,
  dietRecommended: [String], dietRestricted: [String],
  activityRecommended: [String], activityRestricted: [String],
  followUpDate, notes
}
```

### 3.11 `AccessGrant` (consent + audit)
```
{
  _id, patientId, doctorId,
  scope: 'appointment' | 'ongoing',
  appointmentId (nullable, required if scope='appointment'),
  grantedAt, revokedAt (nullable)
}
```

### 3.12 `AccessLog` (audit trail)
```
{
  _id, patientId, doctorId, accessedAt,
  resource: 'history' | 'testOrder' | 'prescription' | 'carePlan',
  resourceId
}
```
Written every time a doctor-facing endpoint successfully returns
patient-shared data. Powers the patient-visible "who viewed my record" log
from PRD §6.

---

## 4. API Surface (new routes)

All under `/api`, existing routes (`/tokens`, `/doctor`, `/summary`,
`/emergency`) unchanged.

| Route file | Endpoints (indicative) |
|---|---|
| `authRoutes` | `POST /auth/signup`, `POST /auth/login`, `GET /auth/me` |
| `patientRoutes` | `GET/PUT /patients/me/profile`, `GET /patients/me/history`, `POST /patients/me/history` (self-reported) |
| `doctorProfileRoutes` | `GET /doctors` (search: specialty, lat/lng+radius, feeMin/Max, sortBy=rating|distance|fee), `GET /doctors/:id`, `PUT /doctors/me/profile`, `PUT /doctors/me/availability` |
| `appointmentRoutes` | `POST /appointments`, `GET /appointments/mine` (patient or doctor view), `PATCH /appointments/:id/status`, `GET /appointments/:id/queue-position` |
| `prescriptionRoutes` | `POST /prescriptions`, `GET /prescriptions/patient/:patientId` (access-controlled) |
| `reminderRoutes` | `GET /reminders/mine`, `PATCH /reminders/:id` (mark taken/skipped) |
| `ratingRoutes` | `POST /ratings`, `GET /ratings/doctor/:doctorId` |
| `testOrderRoutes` | `POST /test-orders`, `PATCH /test-orders/:id/result`, `GET /test-orders/patient/:patientId` (access-controlled) |
| `carePlanRoutes` | `POST /care-plans`, `GET /care-plans/patient/:patientId` (access-controlled) |
| `accessRoutes` | `POST /access/grant`, `POST /access/revoke`, `GET /access/log/mine` |
| `videoRoutes` | `POST /video/:appointmentId/token` (issues a room/session token for the client's WebRTC provider) |

**Access-controlled** endpoints call a shared `checkAccess(patientId,
doctorId, appointmentId)` middleware/helper that checks `AccessGrant`, then
writes an `AccessLog` entry on success, before returning data.

---

## 5. Real-Time (Socket.IO) — extends existing rooms

Existing: `queue-room`, `doctor-room`.

New/extended events:
- `patient-room:{patientId}` — new room a patient's dashboard joins.
- `queue:position-update` → emitted to `patient-room:{patientId}` whenever
  the existing queue-advance logic (already used to update the Display
  board) fires, carrying `{ position, estimatedTime }`.
- `queue:near-turn` → emitted once when the patient crosses the configurable
  "X patients away" threshold (drives the push/SMS "get ready" alert).
- `reminder:due` → emitted to `patient-room:{patientId}` at each scheduled
  reminder time (server-side scheduler also has a fallback push/SMS path in
  case the client isn't connected).
- `video:call-ready` → emitted to both patient and doctor rooms when a video
  appointment's turn arrives.

This reuses the existing Socket.IO server instance and room pattern already
in `socketHandler.js` — just add new room joins and emit calls, no new
transport.

---

## 6. AI Service (`/ai`) Extensions

### 6.1 `/rank-doctors` (new)
Input: patient lat/lng (optional), specialty filter, list of candidate
`DoctorProfile`s (avgRating, fee, location).
Output: ranked list using a weighted composite score, e.g.
`score = w1*normalizedRating - w2*normalizedDistance - w3*normalizedFee`
(weights configurable; default equally weighted). Reuses the Haversine
function already written for `EmergencyCase` hospital ranking — extend it to
generic "distance between two lat/lng" utility shared by both flows.

### 6.2 `/priority-score` (new)
Input: `priority` tag (routine/urgent/critical) + arrival/booking time.
Output: an effective queue weight used to compute display order, e.g.
critical patients get inserted after the currently-in-progress consultation
rather than at the true end of the line, and no more than N routine patients
are skipped in a row (prevents total starvation — the "explainable" priority
requirement from the PRD). This score feeds the existing wait-time
prediction model rather than replacing it.

### 6.3 `/wait-estimate/patient/:tokenId` (extends existing predictor)
Wraps the existing Poisson-based estimator, but scoped to return a single
patient's projected call time instead of only the aggregate display-board
numbers — this is what powers PRD Epic 9 ("your estimated time: 2:45 PM").

---

## 7. Reminder Delivery (Epic 8)

For the hackathon build:
- **Primary channel:** Socket.IO `reminder:due` event → in-app/browser
  notification (Notifications API) while the patient's tab is open.
- **Fallback/offline channel (P1):** a scheduled job (node-cron, checked
  every minute against `ReminderSchedule.scheduledAt`) — if implementing
  SMS, integrate a provider like Twilio behind a thin `NotificationService`
  interface so it can be mocked (console.log) in dev and swapped for real
  SMS/WhatsApp for the live demo if credentials are available.
- Reminder generation: when a `Prescription` is created, a service function
  expands `medicines[].times × durationDays` into individual
  `ReminderSchedule` documents.

---

## 8. Video Consultation (Epic 11, P1)

- Use a hosted WebRTC helper (e.g. a free-tier service, or a simple
  peer-to-peer WebRTC implementation with a public STUN server, since
  Redis is already available in docker-compose for signaling/pub-sub if
  needed).
- `videoRoutes` only issues a room identifier/token; actual media stays
  peer-to-peer between client and doctor browser via existing Socket.IO
  connection for signaling (offer/answer/ICE candidates) — no new backend
  media server needed for a hackathon demo.
- Fallback if time-constrained: ship the booking/scheduling and "join call"
  UI, and use a well-known embeddable video widget rather than building
  raw WebRTC signaling from scratch.

---

## 9. Access Control & Audit (cross-cutting, Section 6 of PRD)

- Every "doctor reads patient data" endpoint (`history`, `prescriptions`,
  `test-orders`, `care-plans`) is wrapped by a single
  `checkAccess(patientId, doctorId, appointmentId?)` helper in
  `/server/middleware`.
- Logic: allow if `AccessGrant` exists with `scope='ongoing'` and no
  `revokedAt`, OR `scope='appointment'` matching the current
  `appointmentId`. Otherwise return only the minimal appointment-level
  fields (name, age, gender, chief complaint) already on the `Appointment`
  document — never a 403 that breaks the doctor's basic workflow, just a
  reduced payload.
- Every successful access writes to `AccessLog`; `GET /access/log/mine`
  (patient-facing) reads it back for transparency.

---

## 10. Non-Functional Requirements

| Area | Requirement |
|---|---|
| **Backward compatibility** | Existing Reception/Doctor/Display/Emergency flows must work unchanged; new features are additive collections/routes. |
| **Security** | JWT auth on all new patient/doctor routes; bcrypt password hashing; rate-limiting reused from existing middleware; input validation (existing Joi-like validator pattern extended to new routes). |
| **Privacy** | Consent-gated data access (Section 9); audit log retained; no doctor route returns another patient's full record without a valid `AccessGrant`. |
| **Performance** | Doctor search/ranking must respond in <1s for demo-scale data (seed ~30-50 doctors); queue position updates pushed in real time via existing Socket.IO, not polling. |
| **Deployability** | New services must run within the existing docker-compose (server/ai/client/mongo/redis) with no new infra dependency beyond what's already declared, unless explicitly justified. |

---

## 11. Suggested Build Order (fastest path to a demoable slice)

1. Auth (`User`, `authRoutes`) + `PatientProfile`/`DoctorProfile` + seed data
   for ~20 demo doctors.
2. Doctor search/listing (Epics 2, 3, 4, 12) — read-only, uses seeded ratings
   so it's demo-ready immediately.
3. Appointment booking (Epic 7) wired into the existing `Token` creation
   path — this is the highest-value integration point with the current app.
4. Live queue position for patients (Epic 9), reusing existing Socket.IO +
   AI wait-time service.
5. Priority queuing (Epic 10) extending existing Emergency priority levels.
6. Medical history + consent model (Epics 1, 5, 6, and Section 9
   access-control) — needed before prescriptions/tests can be meaningfully
   demoed as "doctor sees shared history."
7. Prescriptions + reminders (Epic 8).
8. Test orders + shared results (Epic 14).
9. Care plans (Epic 13).
10. Video consultation (Epic 11) — last, since it's the most infra-heavy and
    the demo story works without it if time runs out.

---

*Companion document: see `PRD.md` for feature scope, user stories, and
acceptance criteria. See `MASTER_PROMPT.md` for the ready-to-use prompt that
drives implementation of this TRD with Claude/Claude Code.*
