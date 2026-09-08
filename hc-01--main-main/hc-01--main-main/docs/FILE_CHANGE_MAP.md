# FILE CHANGE MAP — MediQueue+ Extension
**Date:** 2026-09-09 | **Source of truth:** Actual repository paths only.
**Convention:** All paths relative to project root `d:\SIH\hc-01--main-main\hc-01--main-main\`

---

## Legend
- **[MODIFY]** — Existing file, targeted additions only; existing code must not break
- **[CREATE]** — New file; does not exist in the repository
- **[DELETE]** — File to remove to resolve technical debt
- **[NO TOUCH]** — Explicitly listed to document "do not modify"

---

## FIX-0: Pre-Migration Fixes (Before Anything Else)

### Fix Vite Proxy

**Feature:** Local development is currently broken (proxy hardcoded to production URL)
**Existing Files:** `client/vite.config.js`

| Action | File | Change |
|---|---|---|
| [MODIFY] | `client/vite.config.js` | Change proxy target from `https://hospital-queue-backend-e99o.onrender.com` to `http://localhost:5000` |

**DB Impact:** None
**API Impact:** None (fixes local routing only)
**Socket.IO Impact:** None
**AI Impact:** None
**Risk:** LOW — dev-only change; production uses VITE_API_URL env var instead

---

### Fix Dual Entry Points

**Feature:** Eliminate TypeScript/JavaScript entry point confusion
**Existing Files:** `server/server.js`, `server/server.ts`

| Action | File | Change |
|---|---|---|
| [DELETE] | `server/server.ts` | Remove TypeScript entry point; `server.js` becomes the single canonical entry |
| [MODIFY] | `server/package.json` | Remove `"dev": "tsx watch server.ts"` script OR repurpose it to call `server.js` |

**DB Impact:** None
**API Impact:** None
**Socket.IO Impact:** None
**AI Impact:** None
**Risk:** LOW — `server.js` is already identical in behavior; confirm one local dev run after delete

---

### Fix QueueState Schema Bug

**Feature:** `waitingCount` is incremented in queueService but missing from schema
**Existing Files:** `server/models/QueueState.js`

| Action | File | Change |
|---|---|---|
| [MODIFY] | `server/models/QueueState.js` | Add `waitingCount: { type: Number, default: 0 }` field to schema |

**DB Impact:** MongoDB will start persisting the field; existing documents unaffected (Mongoose `default: 0` is safe)
**API Impact:** None
**Socket.IO Impact:** None
**AI Impact:** None
**Risk:** LOW — additive schema change only

---

### Fix Environment Files

**Feature:** Missing env vars for auth + CORS
**Existing Files:** `server/.env.example`, `server/package.json`

| Action | File | Change |
|---|---|---|
| [MODIFY] | `server/.env.example` | Add `CORS_ORIGIN=http://localhost:5173` and `JWT_SECRET=changeme_in_production` |
| [MODIFY] | `server/package.json` | Add `bcrypt`, `jsonwebtoken`, `node-cron` to `dependencies` |

**DB Impact:** None
**API Impact:** None
**Socket.IO Impact:** None
**AI Impact:** None
**Risk:** LOW

---

## FEATURE-1: Authentication & User System

**Feature:** JWT-based auth (signup, login, me); roles: patient, doctor, receptionist, admin
**PRD:** Epic 5 | **TRD:** §2 | **MASTER_BREAKDOWN:** §2

| Action | File | Change |
|---|---|---|
| [CREATE] | `server/models/User.js` | New Mongoose model: role enum, name, email (unique), phone, passwordHash, createdAt |
| [CREATE] | `server/routes/authRoutes.js` | POST /signup, POST /login (bcrypt + JWT), GET /me |
| [CREATE] | `server/middleware/auth.js` | `requireAuth()` and `requireRole(roles[])` middleware functions |
| [MODIFY] | `server/server.js` | Add `app.use('/api/auth', authRoutes)` in new routes section (AFTER existing routes) |
| [CREATE] | `client/src/context/AuthContext.jsx` | React context: user, token, isAuthenticated; login(), logout(), fetchMe() |
| [CREATE] | `client/src/pages/Login.jsx` | Email + password form, calls POST /api/auth/login, stores JWT, redirects by role |
| [CREATE] | `client/src/pages/Signup.jsx` | Role toggle (Patient/Doctor), name/email/phone/password, calls POST /api/auth/signup |
| [MODIFY] | `client/src/services/api.js` | Add axios request interceptor that attaches `Authorization: Bearer {token}` from AuthContext |
| [MODIFY] | `client/src/main.jsx` | Wrap app with `<AuthProvider>` |
| [MODIFY] | `client/src/App.jsx` | Add /login and /signup routes; add route guard HOC for protected routes |

**DB Impact:** New `users` collection
**API Impact:** New `/api/auth/*` endpoints; existing routes unchanged and stay unguarded
**Socket.IO Impact:** None
**AI Impact:** None
**Risk:** MEDIUM — Auth interceptor in api.js must not break existing token/doctor/emergency calls (they don't need a token — ensure interceptor is no-op if no JWT in storage)

---

## FEATURE-2: Patient Profile & Vitals

**Feature:** Patient account with vitals, privacy controls
**PRD:** Epics 5, 6 | **TRD:** §3.2 | **MASTER_BREAKDOWN:** §3

| Action | File | Change |
|---|---|---|
| [CREATE] | `server/models/PatientProfile.js` | Mongoose model: userId→User, dob, gender, bloodGroup, heightCm, weightKg, allergies[], chronicConditions[], emergencyContact{name,phone,relation} |
| [CREATE] | `server/routes/patientRoutes.js` | GET /me/profile (auto-create on first fetch), PUT /me/profile — both requireAuth + requireRole(['patient']) |
| [MODIFY] | `server/server.js` | Add `app.use('/api/patients', patientRoutes)` |
| [CREATE] | `client/src/pages/patient/PatientProfile.jsx` | Form with all PatientProfile fields; BMI computed and displayed client-side (not sent to server); Data Sharing tab (placeholder, wired in Feature-12) |
| [CREATE] | `client/src/pages/patient/PatientDashboard.jsx` | Patient home: today's queue status card, today's medicines, upcoming appointments summary |

**DB Impact:** New `patientprofiles` collection
**API Impact:** New `/api/patients/me/profile` GET + PUT
**Socket.IO Impact:** None (Data Sharing tab wired later)
**AI Impact:** None
**Risk:** LOW

---

## FEATURE-3: Medical History Timeline

**Feature:** Self-reported and doctor-verified history entries
**PRD:** Epic 1 | **TRD:** §3.4 | **MASTER_BREAKDOWN:** §4

| Action | File | Change |
|---|---|---|
| [CREATE] | `server/models/MedicalHistoryEntry.js` | Mongoose model: patientId→PatientProfile, source enum (self-reported/doctor-verified), recordedByDoctorId→DoctorProfile (nullable), appointmentId→Appointment (nullable), condition, notes, date |
| [MODIFY] | `server/routes/patientRoutes.js` | Add GET /me/history and POST /me/history (force source='self-reported'); protect with requireAuth+requireRole(['patient']) |
| [CREATE] | `server/services/historyService.js` | Export `createDoctorVerifiedHistoryEntry(patientId, doctorId, appointmentId, condition, notes)` — called by appointment completion |
| [CREATE] | `client/src/pages/patient/MedicalHistory.jsx` | Chronological timeline list with source badges; Add Entry form (condition, date, notes); POST /api/patients/me/history |

**DB Impact:** New `medicalhistoryentries` collection
**API Impact:** New `/api/patients/me/history` GET + POST
**Socket.IO Impact:** None
**AI Impact:** None
**Risk:** LOW — historyService.js is created but not called until Feature-5 (appointments) wires it in

---

## FEATURE-4: Doctor Profiles, Search & Daily Listing

**Feature:** Doctor profiles with specialty/location/fee; patient search by rating/distance/fee
**PRD:** Epics 2, 3, 4, 12 | **TRD:** §3.3, §6.1 | **MASTER_BREAKDOWN:** §5

| Action | File | Change |
|---|---|---|
| [CREATE] | `server/models/DoctorProfile.js` | Mongoose model: userId→User, specialty, qualifications[], hospitalName, location{lat,lng,address}, consultationFee, followUpFee, avgRating (default 0), ratingCount (default 0), workingHours[{day,startTime,endTime,slotMinutes}], videoEnabled |
| [CREATE] | `server/routes/doctorProfileRoutes.js` | GET /api/doctors (search), GET /api/doctors/:id, PUT /api/doctors/me/profile, PUT /api/doctors/me/availability |
| [MODIFY] | `server/services/aiService.js` | Add `rankDoctors(candidates, patientLat, patientLng, weights)` function that calls `POST /ai:8001/rank-doctors`; reuse existing `haversineDistance()` as fallback |
| [MODIFY] | `server/server.js` | Add `app.use('/api/doctors', doctorProfileRoutes)` |
| [MODIFY] | `ai/main.py` | Add POST /rank-doctors endpoint; reuse existing `haversine()` utility function |
| [CREATE] | `server/scripts/seedDoctors.js` | Seeds ~20 demo doctors across specialties/locations with realistic data |
| [CREATE] | `client/src/pages/FindDoctors.jsx` | Patient-facing search: specialty dropdown, "Use my location" button, fee range slider, sort toggle (rating/distance/fee), results as cards |
| [CREATE] | `client/src/pages/DoctorDetail.jsx` | Full doctor profile + today's available slots |
| [CREATE] | `client/src/pages/doctor/DoctorDashboard.jsx` | Doctor home: today's appointment list, session summary |
| [CREATE] | `client/src/pages/doctor/DoctorProfileSetup.jsx` | Doctor's own profile form with weekly hours editor |
| [MODIFY] | `client/src/services/api.js` | Add `getDoctors(params)`, `getDoctor(id)`, `updateDoctorProfile(data)`, `updateDoctorAvailability(data)` |

**DB Impact:** New `doctorprofiles` collection; new `2dsphere` index on location
**API Impact:** New `/api/doctors/*` endpoints; new `/rank-doctors` on AI service
**Socket.IO Impact:** None
**AI Impact:** New `/rank-doctors` FastAPI endpoint; existing endpoints untouched
**Risk:** MEDIUM — Haversine reuse: `haversineDistance()` already in `server/services/aiService.js`; new Node.js code should call it directly rather than always hitting AI service (AI call adds latency and a network hop)

---

## FEATURE-5: Appointment Booking

**Feature:** Slot booking integrated with existing Token/queue system
**PRD:** Epic 7 | **TRD:** §3.5 | **MASTER_BREAKDOWN:** §6

| Action | File | Change |
|---|---|---|
| [CREATE] | `server/models/Appointment.js` | Mongoose model: patientId→PatientProfile, doctorId→DoctorProfile, date, slotTime, mode enum (in-person/video), status enum (booked/checked-in/in-progress/completed/cancelled), priority enum (routine/urgent/critical), tokenId→Token (nullable), chiefComplaint, accessGranted (Boolean, default false) |
| [CREATE] | `server/routes/appointmentRoutes.js` | POST /, GET /mine, PATCH /:id/status, GET /:id/queue-position (stub returning null) |
| [MODIFY] | `server/routes/appointmentRoutes.js` | PATCH /:id/status: when status→'completed', call `historyService.createDoctorVerifiedHistoryEntry()` |
| [MODIFY] | `server/server.js` | Add `app.use('/api/appointments', appointmentRoutes)` |
| [MODIFY] | `client/src/pages/DoctorDetail.jsx` | Add booking flow: date picker, slot picker (fetch booked slots to exclude), chief complaint, priority, mode toggle, confirm button |
| [CREATE] | `client/src/pages/patient/PatientAppointments.jsx` | Upcoming + past appointments list; cancel button for 'booked' status |
| [CREATE] | `client/src/pages/doctor/DoctorAppointments.jsx` | Today's appointments with status advance buttons (check in → start → complete) |
| [MODIFY] | `client/src/services/api.js` | Add `createAppointment(data)`, `getMyAppointments(params)`, `updateAppointmentStatus(id, status)`, `getQueuePosition(appointmentId)` |

**DB Impact:** New `appointments` collection; unique index on (doctorId+date+slotTime) to prevent double-booking
**API Impact:** New `/api/appointments/*` endpoints
**Socket.IO Impact:** None yet (queue position events added in Feature-6)
**AI Impact:** None yet
**Risk:** HIGH — Critical that `generateToken()` from `queueService.js` is called correctly with priority mapping. Must verify no duplicate token numbers. Slot conflict check must be atomic or use a transaction.

---

## FEATURE-6: Live Queue Position & Priority Queuing

**Feature:** Patients see live ETA; critical patients get fair priority
**PRD:** Epics 9, 10 | **TRD:** §5, §6.2–6.3 | **MASTER_BREAKDOWN:** §7

| Action | File | Change |
|---|---|---|
| [MODIFY] | `server/socketHandler.js` | Extend `join_room` whitelist to accept `patient-room:{patientId}` pattern (regex or prefix check); add relay for `video:*` events |
| [MODIFY] | `server/services/queueService.js` | In `emitQueueUpdate()`: for each waiting Token with a linked Appointment, emit `queue:position-update` to `patient-room:{patientId}` with {position, estimatedTime}; emit `queue:near-turn` once when position <= NEAR_TURN_THRESHOLD |
| [MODIFY] | `server/routes/appointmentRoutes.js` | Complete GET /:id/queue-position stub: fetch today's tokens for doctor, call AI `/priority-score`, then `/wait-estimate/patient/{tokenId}`, return {position, estimatedTime, priority, reason} |
| [MODIFY] | `server/services/aiService.js` | Add `getPriorityScore(tokenList)` calling `POST AI_URL/priority-score`; add `getPatientWaitEstimate(tokenId)` calling `GET AI_URL/wait-estimate/patient/{tokenId}` |
| [MODIFY] | `ai/main.py` | Add `POST /priority-score` endpoint (anti-starvation algorithm); add `GET /wait-estimate/patient/{token_id}` (reuses Poisson logic from `/predict`) |
| [MODIFY] | `client/src/context/SocketContext.jsx` | After auth: if role=patient, emit `join_room('patient-room:{user.id}')` |
| [MODIFY] | `client/src/context/QueueContext.jsx` | Add `patientQueueStatus` state; listen for `queue:position-update` and `queue:near-turn` socket events |
| [MODIFY] | `client/src/pages/patient/PatientDashboard.jsx` | Add "Current Queue Status" card: live position + ETA updating via socket; alert banner on near-turn |
| [MODIFY] | `client/src/pages/Doctor.jsx` | Add priority reason badge next to reordered patients (additive only; no existing logic removed) |
| [MODIFY] | `shared/constants.js` | Add new SOCKET_EVENTS: `QUEUE_POSITION_UPDATE`, `NEAR_TURN`, `REMINDER_DUE`, `VIDEO_CALL_READY`, `VIDEO_OFFER`, `VIDEO_ANSWER`, `VIDEO_ICE_CANDIDATE` |

**DB Impact:** None (read-only for position calculation)
**API Impact:** Complete existing GET /api/appointments/:id/queue-position; new AI endpoints
**Socket.IO Impact:** New rooms (`patient-room:*`), new events (`queue:position-update`, `queue:near-turn`) — existing room/event behavior unchanged
**AI Impact:** New `/priority-score` and `/wait-estimate/patient/{token_id}` endpoints
**Risk:** HIGH — `emitQueueUpdate()` is the hottest path in the system. Emit loop for patient rooms must be efficient; load tested with the expected number of concurrent patients.

---

## FEATURE-7: Prescriptions & Medicine Reminders

**Feature:** Doctor writes prescriptions; patient gets timed reminders
**PRD:** Epic 8 | **TRD:** §3.6–3.7, §7 | **MASTER_BREAKDOWN:** §8

| Action | File | Change |
|---|---|---|
| [CREATE] | `server/models/Prescription.js` | Mongoose model: appointmentId→Appointment, patientId, doctorId, medicines[] (name, dosage, frequencyPerDay, times[], relationToMeal enum, durationDays, notes), createdAt |
| [CREATE] | `server/models/ReminderSchedule.js` | Mongoose model: prescriptionId, patientId, medicineName, scheduledAt (Date), status enum (pending/sent/taken/skipped) |
| [CREATE] | `server/routes/prescriptionRoutes.js` | POST / (requireAuth+requireRole(['doctor'])), GET /patient/:patientId |
| [CREATE] | `server/routes/reminderRoutes.js` | GET /mine (patient's reminders), PATCH /:id (mark taken/skipped) |
| [CREATE] | `server/services/reminderService.js` | `generateReminders(prescription)` → creates ReminderSchedule docs; `startReminderPoller(io)` → node-cron job every minute |
| [MODIFY] | `server/server.js` | Add `app.use('/api/prescriptions', prescriptionRoutes)` and `app.use('/api/reminders', reminderRoutes)`; call `reminderService.startReminderPoller(io)` after DB connects |
| [MODIFY] | `server/socketHandler.js` | Add relay/emit for `reminder:due` event (emitted by cron poller to patient-room:{patientId}) |
| [MODIFY] | `client/src/services/api.js` | Add `createPrescription(data)`, `getPatientPrescriptions(patientId)`, `getMyReminders()`, `updateReminder(id, status)` |
| [CREATE] | `client/src/pages/doctor/PrescriptionForm.jsx` | Dynamic medicine list with time picker per dose, relation-to-meal dropdown, duration input |
| [CREATE] | `client/src/pages/patient/MedicineReminders.jsx` | Today's medicines widget: time-ordered list with Taken/Skip buttons; listens for `reminder:due` socket event |

**DB Impact:** New `prescriptions` and `reminderschedules` collections; compound index on (patientId + scheduledAt + status)
**API Impact:** New `/api/prescriptions/*` and `/api/reminders/*` endpoints
**Socket.IO Impact:** New `reminder:due` event emitted to `patient-room:{patientId}`
**AI Impact:** None
**Risk:** MEDIUM — `node-cron` runs in the same process as Express; ensure it doesn't block the event loop. Reminder generation can create many documents (N medicines × M times/day × K days).

---

## FEATURE-8: Video Consultation

**Feature:** WebRTC video call signaled through existing Socket.IO server
**PRD:** Epic 11 (P1) | **TRD:** §8 | **MASTER_BREAKDOWN:** §9

| Action | File | Change |
|---|---|---|
| [CREATE] | `server/routes/videoRoutes.js` | POST /:appointmentId/token — verify requester is patient or doctor of this appointment; return {roomId: appointmentId} |
| [MODIFY] | `server/server.js` | Add `app.use('/api/video', videoRoutes)` |
| [MODIFY] | `server/socketHandler.js` | Accept `video-{appointmentId}` rooms; relay `video:offer`, `video:answer`, `video:ice-candidate` to other peer in that room; emit `video:call-ready` when appointment becomes in-progress+video mode |
| [MODIFY] | `client/src/services/api.js` | Add `getVideoToken(appointmentId)` |
| [CREATE] | `client/src/pages/VideoConsult.jsx` | RTCPeerConnection with STUN stun:stun.l.google.com:19302; join video-{id} socket room; exchange offer/answer/ICE; render local + remote video; mute/camera-off/end controls |
| [MODIFY] | `client/src/pages/patient/PatientDashboard.jsx` | Show "Join Call" button when `video:call-ready` received |
| [MODIFY] | `client/src/pages/doctor/DoctorAppointments.jsx` | Show "Join Call" button when `video:call-ready` received |

**DB Impact:** None (room ID is appointmentId, no new collection)
**API Impact:** New `/api/video/:appointmentId/token`
**Socket.IO Impact:** New room pattern (`video-{appointmentId}`); 3 new relayed events; 1 new emitted event
**AI Impact:** None
**Risk:** HIGH — WebRTC NAT traversal; for demo use Google STUN; P2P may fail on corporate networks. Fallback: embed a Jitsi iframe as a last resort.

---

## FEATURE-9: Doctor-Issued Care Plans

**Feature:** Structured diet/exercise guidance tied to a consultation
**PRD:** Epic 13 (P1) | **TRD:** §3.10 | **MASTER_BREAKDOWN:** §10

| Action | File | Change |
|---|---|---|
| [CREATE] | `server/models/CarePlan.js` | Mongoose model: appointmentId, patientId, doctorId, diagnosis, dietRecommended[], dietRestricted[], activityRecommended[], activityRestricted[], followUpDate, notes |
| [CREATE] | `server/routes/carePlanRoutes.js` | POST / (doctor only), GET /patient/:patientId (access-controlled — checkAccess middleware applied) |
| [MODIFY] | `server/server.js` | Add `app.use('/api/care-plans', carePlanRoutes)` |
| [MODIFY] | `client/src/services/api.js` | Add `createCarePlan(data)`, `getPatientCarePlans(patientId)` |
| [CREATE] | `client/src/pages/doctor/CarePlanForm.jsx` | Diagnosis field; 4 tag-input lists (diet do/avoid, activity do/avoid); follow-up date picker |
| [CREATE] | `client/src/pages/patient/CarePlans.jsx` | Cards per plan: do/avoid checklists; follow-up date highlighted if approaching |

**DB Impact:** New `careplans` collection
**API Impact:** New `/api/care-plans/*` endpoints
**Socket.IO Impact:** None
**AI Impact:** None
**Risk:** LOW

---

## FEATURE-10: Shared Lab/Test Results

**Feature:** Test results visible to subsequent doctors with consent
**PRD:** Epic 14 | **TRD:** §3.9 | **MASTER_BREAKDOWN:** §11

| Action | File | Change |
|---|---|---|
| [CREATE] | `server/models/TestOrder.js` | Mongoose model: appointmentId, patientId, doctorId (who ordered), testName, reason, status enum (ordered/completed), result{value,unit,resultDate,labName,notes} |
| [CREATE] | `server/routes/testOrderRoutes.js` | POST / (doctor only), PATCH /:id/result (patient or doctor), GET /patient/:patientId (access-controlled) |
| [MODIFY] | `server/server.js` | Add `app.use('/api/test-orders', testOrderRoutes)` |
| [MODIFY] | `client/src/services/api.js` | Add `createTestOrder(data)`, `addTestResult(id, result)`, `getPatientTestOrders(patientId)` |
| [CREATE] | `client/src/pages/doctor/TestOrderForm.jsx` | Test name + reason input; list existing orders with status badges |
| [CREATE] | `client/src/pages/patient/TestOrders.jsx` | List orders with status; result entry form for 'ordered' status tests |

**DB Impact:** New `testorders` collection
**API Impact:** New `/api/test-orders/*` endpoints
**Socket.IO Impact:** None
**AI Impact:** None
**Risk:** LOW

---

## FEATURE-11: Consent & Access Control

**Feature:** Patient-controlled access grants with full audit logging
**PRD:** §6 | **TRD:** §3.11–3.12, §9 | **MASTER_BREAKDOWN:** §12

| Action | File | Change |
|---|---|---|
| [CREATE] | `server/models/AccessGrant.js` | Mongoose model: patientId, doctorId, scope enum (appointment/ongoing), appointmentId (required if scope=appointment), grantedAt, revokedAt (nullable) |
| [CREATE] | `server/models/AccessLog.js` | Mongoose model: patientId, doctorId, accessedAt, resource enum (history/testOrder/prescription/carePlan), resourceId |
| [CREATE] | `server/middleware/checkAccess.js` | `checkAccess(patientId, doctorId, appointmentId?)` — checks AccessGrant, writes AccessLog on success, returns data scope ('full' or 'minimal') |
| [CREATE] | `server/routes/accessRoutes.js` | POST /grant, POST /revoke (sets revokedAt), GET /log/mine |
| [MODIFY] | `server/routes/prescriptionRoutes.js` | Apply `checkAccess` to GET /patient/:patientId (resolve TODO stub) |
| [MODIFY] | `server/routes/carePlanRoutes.js` | Apply `checkAccess` to GET /patient/:patientId |
| [MODIFY] | `server/routes/testOrderRoutes.js` | Apply `checkAccess` to GET /patient/:patientId |
| [MODIFY] | `server/routes/patientRoutes.js` | Apply `checkAccess` to any doctor-facing history endpoint |
| [MODIFY] | `server/server.js` | Add `app.use('/api/access', accessRoutes)` |
| [MODIFY] | `client/src/services/api.js` | Add `grantAccess(data)`, `revokeAccess(data)`, `getMyAccessLog()` |
| [MODIFY] | `client/src/pages/patient/PatientProfile.jsx` | Wire Data Sharing tab to real AccessGrant + AccessLog endpoints (was placeholder in Feature-2) |

**DB Impact:** New `accessgrants` and `accesslogs` collections
**API Impact:** New `/api/access/*` endpoints; modified behavior of GET endpoints for prescriptions, care-plans, test-orders, history
**Socket.IO Impact:** None
**AI Impact:** None
**Risk:** MEDIUM — The `checkAccess` middleware must be applied correctly to all protected endpoints. Missing one endpoint is a data privacy breach. Double-check all "GET /patient/:patientId" routes.

---

## FEATURE-12: Doctor Ratings

**Feature:** Post-appointment 1-5 star ratings; avgRating on doctor profile
**PRD:** Epic 2 | **TRD:** §3.8 | **MASTER_BREAKDOWN:** §5 (sub-feature)

| Action | File | Change |
|---|---|---|
| [CREATE] | `server/models/Rating.js` | Mongoose model: appointmentId→Appointment (must be 'completed'), patientId, doctorId, stars (1-5), comment, createdAt |
| [CREATE] | `server/routes/ratingRoutes.js` | POST / (requireAuth+requireRole(['patient'])), GET /doctor/:doctorId |
| [MODIFY] | `server/routes/ratingRoutes.js` | POST /: after creating Rating, recalculate and update DoctorProfile.avgRating and ratingCount |
| [MODIFY] | `server/server.js` | Add `app.use('/api/ratings', ratingRoutes)` |
| [MODIFY] | `client/src/services/api.js` | Add `submitRating(data)`, `getDoctorRatings(doctorId)` |
| [MODIFY] | `client/src/pages/patient/PatientAppointments.jsx` | Show "Rate your visit" option after completed appointments |
| [MODIFY] | `client/src/pages/DoctorDetail.jsx` | Display reviews list from GET /api/ratings/doctor/:id |

**DB Impact:** New `ratings` collection; `DoctorProfile.avgRating` and `ratingCount` updated on write
**API Impact:** New `/api/ratings/*` endpoints
**Socket.IO Impact:** None
**AI Impact:** avgRating update propagates to `/rank-doctors` ranking automatically
**Risk:** LOW — One constraint: rating allowed only after completed appointment. Enforce server-side.

---

## CROSS-CUTTING: Notification Infrastructure

**Feature:** node-cron reminder poller; browser push notifications
**PRD:** §7 (reminder delivery) | **TRD:** §7

| Action | File | Change |
|---|---|---|
| [MODIFY] | `server/package.json` | Add `node-cron` dependency |
| [CREATE] | `server/services/reminderService.js` | (Already covered in Feature-7) |
| [MODIFY] | `client/src/pages/patient/PatientDashboard.jsx` | Request Notification API permission on mount; show browser push when tab is active and `reminder:due` fires |

**DB Impact:** `reminderschedules` collection (already in Feature-7)
**API Impact:** None beyond Feature-7
**Socket.IO Impact:** `reminder:due` event (already in Feature-7)
**AI Impact:** None
**Risk:** LOW

---

## CROSS-CUTTING: App.jsx Route Extension

**Feature:** Add all new routes + auth guards to client router
**All features depend on this**

| Action | File | Change |
|---|---|---|
| [MODIFY] | `client/src/App.jsx` | Add all new routes listed in IMPLEMENTATION_ARCHITECTURE.md §2.1; import AuthContext; add ProtectedRoute component; existing 5 routes unchanged |

**DB Impact:** None
**API Impact:** None
**Socket.IO Impact:** None
**AI Impact:** None
**Risk:** LOW — Additive only; existing routes stay in place

---

## CROSS-CUTTING: Shared Constants Extension

**Feature:** New Socket.IO event names, new room patterns
**All socket-dependent features depend on this**

| Action | File | Change |
|---|---|---|
| [MODIFY] | `shared/constants.js` | Add to SOCKET_EVENTS: QUEUE_POSITION_UPDATE, NEAR_TURN, REMINDER_DUE, VIDEO_CALL_READY, VIDEO_OFFER, VIDEO_ANSWER, VIDEO_ICE_CANDIDATE; Add to ROOMS: PATIENT_ROOM (value: 'patient-room') |

**DB Impact:** None
**API Impact:** None
**Risk:** LOW — Pure constant additions; existing constants unchanged

---

## DEPLOYMENT UPDATES

| Action | File | Change |
|---|---|---|
| [MODIFY] | `render.yaml` | Fix AI_URL for server service to Render internal URL; add JWT_SECRET env var |
| [MODIFY] | `server/.env.example` | Add JWT_SECRET, CORS_ORIGIN, NEAR_TURN_THRESHOLD=5 (already covered in FIX-0) |
| [NO TOUCH] | `docker-compose.yml` | No new Docker services needed; all new code runs within existing server container |
| [NO TOUCH] | `vercel.json` | Unchanged; client build + SPA rewrite still sufficient |

---

## Summary of All File Operations

### Files to CREATE (new — do not exist)
```
server/models/User.js
server/models/PatientProfile.js
server/models/DoctorProfile.js
server/models/MedicalHistoryEntry.js
server/models/Appointment.js
server/models/Prescription.js
server/models/ReminderSchedule.js
server/models/Rating.js
server/models/TestOrder.js
server/models/CarePlan.js
server/models/AccessGrant.js
server/models/AccessLog.js
server/routes/authRoutes.js
server/routes/patientRoutes.js
server/routes/doctorProfileRoutes.js
server/routes/appointmentRoutes.js
server/routes/prescriptionRoutes.js
server/routes/reminderRoutes.js
server/routes/ratingRoutes.js
server/routes/testOrderRoutes.js
server/routes/carePlanRoutes.js
server/routes/accessRoutes.js
server/routes/videoRoutes.js
server/middleware/auth.js
server/middleware/checkAccess.js
server/services/historyService.js
server/services/reminderService.js
server/scripts/seedDoctors.js
client/src/context/AuthContext.jsx
client/src/pages/Login.jsx
client/src/pages/Signup.jsx
client/src/pages/FindDoctors.jsx
client/src/pages/DoctorDetail.jsx
client/src/pages/VideoConsult.jsx
client/src/pages/patient/PatientDashboard.jsx
client/src/pages/patient/PatientProfile.jsx
client/src/pages/patient/MedicalHistory.jsx
client/src/pages/patient/PatientAppointments.jsx
client/src/pages/patient/TestOrders.jsx
client/src/pages/patient/CarePlans.jsx
client/src/pages/patient/MedicineReminders.jsx
client/src/pages/doctor/DoctorDashboard.jsx
client/src/pages/doctor/DoctorProfileSetup.jsx
client/src/pages/doctor/DoctorAppointments.jsx
client/src/pages/doctor/PrescriptionForm.jsx
client/src/pages/doctor/CarePlanForm.jsx
client/src/pages/doctor/TestOrderForm.jsx
```

### Files to MODIFY (existing — targeted additions only)
```
server/server.js              — add route registrations + cron start
server/socketHandler.js       — extend room whitelist + new events
server/services/aiService.js  — add rankDoctors(), getPriorityScore(), getPatientWaitEstimate()
server/models/QueueState.js   — add waitingCount field (FIX)
server/middleware/validate.js — extend with new validators as needed
server/package.json           — add bcrypt, jsonwebtoken, node-cron
server/.env.example           — add JWT_SECRET, CORS_ORIGIN
server/routes/prescriptionRoutes.js  — wire checkAccess (after Feature-11)
server/routes/carePlanRoutes.js      — wire checkAccess
server/routes/testOrderRoutes.js     — wire checkAccess
server/routes/patientRoutes.js       — wire checkAccess for doctor view
ai/main.py                    — add /rank-doctors, /priority-score, /wait-estimate/patient/{id}
client/vite.config.js         — fix proxy target (FIX)
client/src/App.jsx            — add new routes + route guards
client/src/main.jsx           — wrap with AuthProvider
client/src/services/api.js    — add new API functions + auth interceptor
client/src/context/SocketContext.jsx — join patient-room after auth
client/src/context/QueueContext.jsx  — add patientQueueStatus state + socket listeners
client/src/pages/Doctor.jsx          — add priority reason badge (additive only)
client/src/pages/DoctorDetail.jsx    — add booking flow
client/src/pages/patient/PatientDashboard.jsx   — queue status card + medicine widget
client/src/pages/patient/PatientProfile.jsx     — wire Data Sharing tab
client/src/pages/patient/PatientAppointments.jsx — add rating prompt
client/src/pages/doctor/DoctorAppointments.jsx  — add Join Call button
shared/constants.js           — add new event names + room patterns
render.yaml                   — fix AI_URL
```

### Files to DELETE
```
server/server.ts              — remove to eliminate dual-entry confusion
```

### Files — DO NOT TOUCH
```
server/models/Token.js
server/models/DoctorSession.js
server/models/EmergencyCase.js
server/models/DailySummary.js
server/routes/tokenRoutes.js
server/routes/doctorRoutes.js
server/routes/emergencyRoutes.js
server/routes/summaryRoutes.js
server/services/queueService.js
server/services/summaryService.js
server/middleware/errorHandler.js
server/middleware/rateLimiter.js
client/src/pages/Reception.jsx
client/src/pages/Display.jsx
client/src/pages/Emergency.jsx
client/src/pages/Home.jsx
client/src/pages/NotFound.jsx
client/src/services/socket.js
docker-compose.yml
vercel.json
docker/Dockerfile.server
docker/Dockerfile.client
docker/Dockerfile.ai
docker/nginx.conf
ai/requirements.txt
```
