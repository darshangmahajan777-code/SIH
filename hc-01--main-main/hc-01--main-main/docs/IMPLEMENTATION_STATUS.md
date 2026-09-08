# IMPLEMENTATION STATUS — MediQueue+ Extension of HC-01
**Date:** 2026-09-08 | **Base System:** HC-01 Hospital Queue Management System
**Target:** MediQueue+ — Patient-centric multi-hospital healthcare platform for SIH

---

## Legend
- **COMPLETE** — Fully implemented and working in the existing codebase
- **PARTIAL** — Some parts exist; significant work still needed
- **NOT STARTED** — No code exists for this feature
- **BLOCKED** — Cannot implement until a dependency is resolved

---

## Section A: Pre-Migration Fixes (Must Complete First)

| Fix | Status | Existing Files | Required Work | Priority |
|---|---|---|---|---|
| Fix Vite proxy (hardcoded to Render URL) | PARTIAL | `client/vite.config.js` | Change proxy target to `http://localhost:5000` | P0 |
| Resolve dual entry points (server.js vs server.ts) | PARTIAL | `server/server.js`, `server/server.ts` | Pick one canonical entry point; delete the other | P0 |
| Add `waitingCount` to QueueState schema | PARTIAL | `server/models/QueueState.js` | Add `waitingCount: { type: Number, default: 0 }` to schema | P0 |
| Fix render.yaml AI_URL | PARTIAL | `render.yaml` | Change AI_URL to Render internal service URL | P1 |
| Add CORS_ORIGIN to .env.example | NOT STARTED | `server/.env.example` | Add `CORS_ORIGIN=http://localhost:5173` | P1 |

---

## Section B: Authentication & User System (TRD §2, MASTER_BREAKDOWN §2)

| Feature | Status | Existing Files | Required Work | Priority |
|---|---|---|---|---|
| User model (role-based) | NOT STARTED | — | Create `server/models/User.js` with role enum patient/doctor/receptionist/admin | P0 |
| POST /api/auth/signup | NOT STARTED | — | Create `server/routes/authRoutes.js`; bcrypt password hashing | P0 |
| POST /api/auth/login | NOT STARTED | — | JWT issuance on successful login | P0 |
| GET /api/auth/me | NOT STARTED | — | JWT verification, return current user | P0 |
| requireAuth middleware | NOT STARTED | — | Create `server/middleware/auth.js`; verify JWT, attach user to req | P0 |
| requireRole() middleware | NOT STARTED | — | Role-based access guard function | P0 |
| Wire authRoutes into server.js | NOT STARTED | `server/server.js` | Add `app.use('/api/auth', authRoutes)` WITHOUT touching existing routes | P0 |
| Client /signup page | NOT STARTED | — | Role toggle (Patient/Doctor), form fields, calls POST /api/auth/signup | P0 |
| Client /login page | NOT STARTED | — | Email + password form, stores JWT, redirects by role | P0 |
| useAuth hook / AuthContext | NOT STARTED | — | Exposes user, token, login(), logout(); attaches JWT to API calls | P0 |
| Route guards for patient/doctor dashboards | NOT STARTED | `client/src/App.jsx` | Protect /patient-dashboard and /doctor-dashboard routes | P0 |
| JWT_SECRET env variable | NOT STARTED | `server/.env.example` | Add JWT_SECRET to .env.example and .env | P0 |

---

## Section C: Patient Profile & Vitals (TRD §3.2, MASTER_BREAKDOWN §3)

| Feature | Status | Existing Files | Required Work | Priority |
|---|---|---|---|---|
| PatientProfile model | NOT STARTED | — | Create `server/models/PatientProfile.js` (userId→User, dob, gender, bloodGroup, heightCm, weightKg, allergies[], chronicConditions[], emergencyContact) | P0 |
| GET /api/patients/me/profile | NOT STARTED | — | Create `server/routes/patientRoutes.js`; auto-create on first GET | P0 |
| PUT /api/patients/me/profile | NOT STARTED | — | Update profile; role=patient protected | P0 |
| Client /patient-dashboard/profile page | NOT STARTED | — | Full form with BMI auto-calculation (computed client-side, not stored) | P0 |
| Data Sharing tab (placeholder → real) | NOT STARTED | — | Starts as placeholder in profile page; wired to AccessGrant in Section L | P1 |

---

## Section D: Medical History Timeline (TRD §3.4, MASTER_BREAKDOWN §4)

| Feature | Status | Existing Files | Required Work | Priority |
|---|---|---|---|---|
| MedicalHistoryEntry model | NOT STARTED | — | Create `server/models/MedicalHistoryEntry.js` (patientId, source enum, recordedByDoctorId, appointmentId, condition, notes, date) | P0 |
| GET /api/patients/me/history | NOT STARTED | `server/routes/patientRoutes.js` | Add to patientRoutes; sorted newest-first; requires auth | P0 |
| POST /api/patients/me/history | NOT STARTED | `server/routes/patientRoutes.js` | Create self-reported entry; force source='self-reported' server-side | P0 |
| createDoctorVerifiedHistoryEntry() service | NOT STARTED | — | Create `server/services/historyService.js`; called by appointment completion | P0 |
| Client /patient-dashboard/history page | NOT STARTED | — | Chronological timeline list with source badges and "Add entry" form | P0 |

---

## Section E: Doctor Profiles, Search & Daily Listing (TRD §3.3, MASTER_BREAKDOWN §5)

| Feature | Status | Existing Files | Required Work | Priority |
|---|---|---|---|---|
| DoctorProfile model | COMPLETE | `server/models/DoctorProfile.js` | Full schema with ratings, workingHours, slotDuration, breaks, leaves, holidays | P0 |
| GET /api/doctors (search + filter + sort) | COMPLETE | `server/routes/scheduleRoutes.js` | specialty, lat/lng+radiusKm, feeMin/feeMax, sortBy=rating/distance/fee | P0 |
| GET /api/doctors/:id | COMPLETE | `server/routes/scheduleRoutes.js` | Full doctor profile | P0 |
| PUT /api/doctors/me/profile | COMPLETE | `server/routes/scheduleRoutes.js` | Doctor self-update; schedule and profile update | P0 |
| PUT /api/doctors/:id/schedule | COMPLETE | `server/routes/scheduleRoutes.js` | Update working hours, breaks, leaves, holidays, slot duration | P0 |
| Haversine distance for doctor search | COMPLETE | `server/services/recommendationService.js`, `server/services/aiService.js` | Distance calculation with graceful missing-coordinate fallback | P0 |
| AI /rank-doctors endpoint | COMPLETE | `ai/main.py`, `server/services/recommendationService.js` | Bayesian shrinkage ranking, multi-factor scoring, explainability, deterministic fallback | P0 |
| Client /doctor-schedule page | COMPLETE | `client/src/pages/DoctorSchedulePage.jsx`, `client/src/components/DoctorScheduleManager.jsx` | Schedule editor, breaks, leaves, slot duration | P0 |
| Client /find-doctors page | COMPLETE | `client/src/pages/FindDoctors.jsx`, `client/src/components/SlotPicker.jsx` | Daily listing, Bayesian recommendations, explainability, slot picker | P0 |
| Seed data (demo doctors) | COMPLETE | `server/scripts/seedDoctors.js` | Multi-specialty doctors with realistic ratings, locations, and schedules | P0 |

---

## Section F: Appointment Booking (TRD §3.5, MASTER_BREAKDOWN §6)

| Feature | Status | Existing Files | Required Work | Priority |
|---|---|---|---|---|
| Appointment model | COMPLETE | `server/models/Appointment.js` | patientId, doctorId, date, slotTime, mode, status, unique active slot index | P0 |
| POST /api/appointments | COMPLETE | `server/routes/appointmentRoutes.js`, `server/services/scheduleService.js` | Server & DB concurrency protection, same-day Token creation | P0 |
| GET /api/appointments/mine | COMPLETE | `server/routes/appointmentRoutes.js` | Role-aware filtering by patientId, doctorId, date | P0 |
| PATCH /api/appointments/:id/status | COMPLETE | `server/routes/appointmentRoutes.js` | Status transitions: booked -> checked-in -> in-progress -> completed | P0 |
| PATCH /api/appointments/:id/cancel | COMPLETE | `server/routes/appointmentRoutes.js`, `server/services/scheduleService.js` | Immediate slot release on cancellation | P0 |
| PATCH /api/appointments/:id/reschedule | COMPLETE | `server/routes/appointmentRoutes.js`, `server/services/scheduleService.js` | Atomic release of old slot and reservation of new slot | P0 |
| Slot conflict validation | COMPLETE | `server/models/Appointment.js`, `server/services/scheduleService.js` | DB unique constraint + 409 Conflict return on double-booking | P0 |
| Client booking flow (SlotPicker) | COMPLETE | `client/src/components/SlotPicker.jsx` | Real-time slots grid, instant status refresh, in-person/video mode toggle | P0 |

---

## Section G: Live Queue Position & Priority Queuing (TRD §5, §6.2–6.3, MASTER_BREAKDOWN §7)

| Feature | Status | Existing Files | Required Work | Priority |
|---|---|---|---|---|
| Priority queue ordering (emergency > senior > general) | COMPLETE | `server/services/queueService.js` | Already implemented in callNextToken() and getQueue() — DO NOT MODIFY | — |
| Real-time queue updates via Socket.IO | COMPLETE | `server/socketHandler.js`, `server/services/queueService.js` | queue_updated, patient_called, consultation_complete already fire — DO NOT MODIFY | — |
| patient-room:{patientId} Socket.IO room | COMPLETE | `server/socketHandler.js` | Whitelist allows patient-room:* rooms; client joins and receives isolated events | P0 |
| queue:position-update event per patient | COMPLETE | `server/services/virtualQueueService.js`, `server/services/queueService.js` | Emits isolated real-time position, window, and arrival time to patient rooms | P0 |
| queue:near-turn event | COMPLETE | `server/services/virtualQueueService.js` | Emits alert when patient crosses threshold (default 5 ahead) | P0 |
| GET /api/appointments/:id/queue-position | COMPLETE | `server/routes/appointmentRoutes.js`, `server/services/virtualQueueService.js` | Returns position, patientsAhead, estimatedWindow, recommendedArrivalTime, reason | P0 |
| Client YOUR QUEUE status card | COMPLETE | `client/src/pages/PatientAppointmentsDashboard.jsx` | Live position + ETA window + recommended arrival + near-turn banner | P0 |
| Priority reason badge & explanation | COMPLETE | `server/services/virtualQueueService.js`, `client/src/pages/PatientAppointmentsDashboard.jsx` | Human-readable explanation reasons for priority ordering | P0 |

---

## Section H: Prescriptions & Medicine Reminders (TRD §3.6–3.7, §7, MASTER_BREAKDOWN §8)

| Feature | Status | Existing Files | Required Work | Priority |
|---|---|---|---|---|
| Prescription model | NOT STARTED | — | Create `server/models/Prescription.js` | P0 |
| ReminderSchedule model | NOT STARTED | — | Create `server/models/ReminderSchedule.js` | P0 |
| POST /api/prescriptions | NOT STARTED | — | Create `server/routes/prescriptionRoutes.js`; doctor-only; calls generateReminders() | P0 |
| GET /api/prescriptions/patient/:patientId | NOT STARTED | — | Access-controlled (Section L); for now requireAuth | P0 |
| generateReminders() service | NOT STARTED | — | Create `server/services/reminderService.js`; expands prescription into ReminderSchedule docs | P0 |
| GET /api/reminders/mine | NOT STARTED | — | Create `server/routes/reminderRoutes.js`; today's reminders | P0 |
| PATCH /api/reminders/:id (taken/skipped) | NOT STARTED | `server/routes/reminderRoutes.js` | Mark status | P0 |
| node-cron scheduler | NOT STARTED | — | Every minute, find pending reminders past scheduledAt, mark sent, emit reminder:due to patient room | P0 |
| reminder:due Socket.IO event | NOT STARTED | `server/socketHandler.js` | Emitted to patient-room:{patientId} | P0 |
| Client prescription form (doctor) | NOT STARTED | — | Dynamic medicine list with time picker per dose; POST /api/prescriptions | P0 |
| Client Today's Medicines widget (patient) | NOT STARTED | — | Time-ordered list with Taken/Skip buttons; listens for reminder:due | P0 |

---

## Section I: Video Consultation (TRD §8, MASTER_BREAKDOWN §9) — P1

| Feature | Status | Existing Files | Required Work | Priority |
|---|---|---|---|---|
| Doctor videoEnabled flag | NOT STARTED | — | Part of DoctorProfile model (Section E) | P1 |
| Video mode on Appointment booking | NOT STARTED | — | Part of Appointment model (Section F) | P1 |
| POST /api/video/:appointmentId/token | NOT STARTED | — | Create `server/routes/videoRoutes.js`; verify patient or doctor; return room ID | P1 |
| WebRTC signaling via Socket.IO | NOT STARTED | `server/socketHandler.js` | video-{appointmentId} room; relay video:offer, video:answer, video:ice-candidate | P1 |
| video:call-ready Socket.IO event | NOT STARTED | `server/socketHandler.js` | Emit to patient + doctor rooms when appointment becomes in-progress+video | P1 |
| Client /video/:appointmentId page | NOT STARTED | — | RTCPeerConnection, STUN server, local+remote video, mute/camera/end controls | P1 |
| Join Call button on dashboards | NOT STARTED | — | Visible when video:call-ready received | P1 |

---

## Section J: Care Plans / Diet & Exercise (TRD §3.10, MASTER_BREAKDOWN §10) — P1

| Feature | Status | Existing Files | Required Work | Priority |
|---|---|---|---|---|
| CarePlan model | NOT STARTED | — | Create `server/models/CarePlan.js` | P1 |
| POST /api/care-plans | NOT STARTED | — | Create `server/routes/carePlanRoutes.js`; doctor-only | P1 |
| GET /api/care-plans/patient/:patientId | NOT STARTED | — | Access-controlled (Section L) | P1 |
| Client care plan form (doctor) | NOT STARTED | — | Diagnosis, 4 tag-input lists, follow-up date, notes | P1 |
| Client care plans page (patient) | NOT STARTED | — | Card per plan with do/avoid checklists, follow-up date | P1 |

---

## Section K: Shared Lab/Test Results (TRD §3.9, MASTER_BREAKDOWN §11)

| Feature | Status | Existing Files | Required Work | Priority |
|---|---|---|---|---|
| TestOrder model | NOT STARTED | — | Create `server/models/TestOrder.js` | P0 |
| POST /api/test-orders | NOT STARTED | — | Create `server/routes/testOrderRoutes.js`; doctor-only | P0 |
| PATCH /api/test-orders/:id/result | NOT STARTED | — | Patient or doctor can fill result; sets status=completed | P0 |
| GET /api/test-orders/patient/:patientId | NOT STARTED | — | Access-controlled (Section L) | P0 |
| Client Order Test form (doctor) | NOT STARTED | — | Test name, reason; shows patient's existing orders | P0 |
| Client /patient-dashboard/tests page | NOT STARTED | — | List of orders with status and result entry form | P0 |

---

## Section L: Consent & Access Control (TRD §3.11–3.12, §9, MASTER_BREAKDOWN §12)

| Feature | Status | Existing Files | Required Work | Priority |
|---|---|---|---|---|
| AccessGrant model | NOT STARTED | — | Create `server/models/AccessGrant.js` (patientId, doctorId, scope, appointmentId, grantedAt, revokedAt) | P0 |
| AccessLog model | NOT STARTED | — | Create `server/models/AccessLog.js` (patientId, doctorId, accessedAt, resource, resourceId) | P0 |
| checkAccess() middleware helper | NOT STARTED | — | Create shared helper in `server/middleware/`; checks AccessGrant, writes AccessLog on success | P0 |
| POST /api/access/grant | NOT STARTED | — | Create `server/routes/accessRoutes.js` | P0 |
| POST /api/access/revoke | NOT STARTED | — | Update revokedAt | P0 |
| GET /api/access/log/mine | NOT STARTED | — | Patient-facing access log | P0 |
| Wire checkAccess to existing route stubs | NOT STARTED | — | Apply to GET /prescriptions/patient/:id, GET /care-plans/patient/:id, GET /test-orders/patient/:id, GET /history (doctor view) | P0 |
| Client Data Sharing tab (real) | NOT STARTED | — | List of grants with revoke buttons; access log ("Dr. X viewed on...") | P0 |

---

## Section M: Doctor Ratings (TRD §3.8, MASTER_BREAKDOWN §5)

| Feature | Status | Existing Files | Required Work | Priority |
|---|---|---|---|---|
| Rating model | COMPLETE | `server/models/Rating.js` | appointmentId (unique, completed only), patientId, doctorId, rating 1-5, comment | P0 |
| POST /api/ratings | COMPLETE | `server/routes/ratingRoutes.js`, `server/services/ratingService.js` | Completed appointment check, self-rating block, safe avgRating/ratingCount recalculation | P0 |
| GET /api/ratings/doctor/:doctorId | COMPLETE | `server/routes/ratingRoutes.js`, `server/services/ratingService.js` | Paginated reviews list with doctor summary stats | P0 |
| Client rating form | COMPLETE | `client/src/pages/FindDoctors.jsx` | 1-5 star selector + comment; immediate aggregation update | P0 |

---

## Section N: Notifications Infrastructure

| Feature | Status | Existing Files | Required Work | Priority |
|---|---|---|---|---|
| node-cron dependency | NOT STARTED | `server/package.json` | Add `node-cron` to server dependencies | P0 |
| bcrypt dependency | NOT STARTED | `server/package.json` | Add `bcrypt` to server dependencies | P0 |
| jsonwebtoken dependency | NOT STARTED | `server/package.json` | Add `jsonwebtoken` to server dependencies | P0 |
| Browser Push Notification API | NOT STARTED | — | Client-side Notifications API in patient dashboard | P1 |
| Twilio SMS (mock in dev) | NOT STARTED | — | Thin NotificationService interface; console.log in dev, Twilio in prod | P2 |

---

## Section O: Deployment Updates

| Feature | Status | Existing Files | Required Work | Priority |
|---|---|---|---|---|
| Docker Compose for new services | PARTIAL | `docker-compose.yml` | No new infra needed; all new code runs within existing services | P1 |
| New env vars in render.yaml | NOT STARTED | `render.yaml` | Add JWT_SECRET, fix AI_URL | P1 |
| New env vars in .env.example | NOT STARTED | `server/.env.example` | Add JWT_SECRET, CORS_ORIGIN, NEAR_TURN_THRESHOLD | P1 |

---

## Summary Counts

| Status | Count |
|---|---|
| COMPLETE | 4 |
| PARTIAL | 7 |
| NOT STARTED | 79 |
| BLOCKED | 0 |

---

## Recommended Build Order (Fastest Path to Demo)

1. **Pre-migration fixes** (Section A) — fix Vite proxy, pick one server entry, fix schema bug
2. **Auth** (Section B) — User model + JWT + middleware; enables all protected routes
3. **Patient + Doctor Profiles** (Sections C + E) — foundation for everything patient/doctor-facing
4. **Seed data** — 15-20 demo doctors so search is immediately demoable
5. **Doctor search/listing** (Section E routes) — read-only, demo-ready with seeded data
6. **Appointment booking** (Section F) — integration point with existing Token/queue system
7. **Live queue position for patients** (Section G) — reuses existing Socket.IO + queue engine
8. **Medical history + consent** (Sections D + L) — needed before prescriptions/tests meaningful
9. **Prescriptions + reminders** (Section H)
10. **Test orders** (Section K)
11. **Ratings** (Section M)
12. **Care plans** (Section J)
13. **Video consultation** (Section I) — last; most infra-heavy
