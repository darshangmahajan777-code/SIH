# MediQueue+ — Master Project Breakdown for Section-by-Section Vibe Coding

This is a single reference document containing the **entire project**, broken
into independent sections. Each section is self-contained: purpose, user
flow, data model, API endpoints, and a ready-to-paste prompt you can hand to
ChatGPT (or any AI coding tool) on its own, one at a time.

---

## 0. How To Use This Document

1. **Always paste the "Global Context Block" (Section 0.1) first**, in every
   new ChatGPT conversation, before pasting a section's prompt. This keeps
   every section consistent with the same stack and folder structure, even
   across different chats.
2. Build in the order the sections are listed (0 → 13). Later sections
   assume earlier ones exist (e.g. you can't book an appointment before
   doctors exist; you can't send reminders before prescriptions exist).
3. For each section: paste Global Context Block → paste that section's
   "Vibe-Coding Prompt" → let ChatGPT generate the code → test it → move to
   the next section.
4. If a chat gets long/slow, start a **new chat**, paste the Global Context
   Block again, tell it which sections are already done (one line each is
   enough), and paste the next section's prompt.
5. Treat each section's "Data Model" and "API Endpoints" tables as the
   contract — even if you regenerate a section's code later, keep those
   field names and routes the same so other sections don't break.

### 0.1 Global Context Block (paste this into every new chat)

```
I'm building "MediQueue+", a patient-doctor healthcare platform, on top of
an existing hospital queue app. Tech stack:
- Frontend: React + Vite + Tailwind CSS + Socket.io-client
- Backend: Node.js + Express + Socket.IO + MongoDB/Mongoose
- AI microservice: Python + FastAPI (handles wait-time prediction and
  doctor/hospital ranking)
- Folder structure: /client, /server, /ai, /shared

Existing baseline (already built, do not break or rename):
- Mongoose models: Token, DoctorSession, QueueState, EmergencyCase,
  DailySummary
- Express routes: /api/tokens, /api/doctor, /api/summary, /api/emergency
- Socket.IO rooms: queue-room, doctor-room
- Panels: Reception (issues tokens), Doctor (calls next patient), Display
  (public wait-time board), Emergency (AI-ranked nearby hospital suggestion)
- The AI service already has: a Poisson-based wait-time predictor, and a
  Haversine distance function used for hospital ranking.

I'm adding new features to this app, section by section. Each section I
give you should be built to plug into the existing app above, reusing
existing models/patterns where noted, and never duplicating or renaming
what already exists. Confirm you understand this context, then wait for my
next message with the section to build.
```

---

## 1. Full Feature List (what we're building, in plain English)

| # | Feature | Section |
|---|---|---|
| 1 | Patient medical history record | §4 |
| 2 | Doctor recommendation by rating | §5 |
| 3 | Doctor recommendation by nearby location | §5 |
| 4 | Doctor recommendation by fee | §5 |
| 5 | Patient self-service profile/account | §3 |
| 6 | Profile vitals: blood group, height, weight, etc. | §3 |
| 7 | Appointment booking with a specific doctor | §6 |
| 8 | Prescriptions with medicine reminders at specific times | §8 |
| 9 | Live queue position instead of physical waiting | §7 |
| 10 | Priority queuing for serious/critical patients | §7 |
| 11 | Video consultation | §9 |
| 12 | Daily doctor listing/schedule | §5 |
| 13 | Doctor-issued diet/exercise care plans | §10 |
| 14 | Shared lab/test results across doctors | §11 |
| — | Consent & access control (who can see a patient's data) | §12 |
| — | Notifications/reminders delivery | §8 |
| — | Deployment | §13 |

---

## 2. Section: Authentication & User System

**Purpose:** Every patient, doctor, receptionist, and admin needs an
account. This section is the foundation everything else logs into.

**User flow:**
1. New user visits `/signup`, picks role (Patient or Doctor — Receptionist/
   Admin accounts are created by an admin, not self-signup).
2. Fills email, password, name, phone → account created.
3. Logs in at `/login` → receives a JWT → redirected to their dashboard
   (`/patient-dashboard` or `/doctor-dashboard`).
4. JWT is attached to every subsequent API call; protected routes reject
   requests without a valid token or with the wrong role.

**Data model — `User`**
| Field | Type | Notes |
|---|---|---|
| role | enum | patient / doctor / receptionist / admin |
| name | string | |
| email | string | unique |
| phone | string | |
| passwordHash | string | bcrypt |
| createdAt | date | |

**API endpoints**
- `POST /api/auth/signup` — create account
- `POST /api/auth/login` — returns JWT
- `GET /api/auth/me` — returns current user from token

**Vibe-Coding Prompt**
```
Build Section 2: Authentication & User System.

Add to /server:
- models/User.js (Mongoose) with fields: role (enum: patient, doctor,
  receptionist, admin), name, email (unique), phone, passwordHash,
  createdAt.
- routes/authRoutes.js with POST /signup, POST /login (bcrypt password
  check, returns JWT), GET /me (protected).
- middleware/auth.js exporting requireAuth and requireRole(roles) for use
  by future routes.
- Wire authRoutes into server.js/server.ts under /api/auth, without
  touching existing route registrations.

Add to /client:
- A /signup page: role toggle (Patient/Doctor), name, email, phone,
  password fields, calls POST /api/auth/signup, then redirects to /login.
- A /login page: email + password, calls POST /api/auth/login, stores JWT,
  redirects to /patient-dashboard or /doctor-dashboard based on role.
- An auth context/hook (useAuth) that exposes current user, token, login(),
  logout(), and attaches the JWT as an Authorization header on API calls.
- Route guards so /patient-dashboard requires role=patient and
  /doctor-dashboard requires role=doctor.

Keep styling consistent with the existing Tailwind glassmorphic UI used in
the Reception/Doctor panels. Do not touch existing files besides
server.js/server.ts route registration.
```

---

## 3. Section: Patient Profile, Vitals & Privacy Controls

**Purpose:** Patients maintain their own profile — vitals, contact info, and
control over who can see their medical data (features #5, #6).

**User flow:**
1. After first login, patient is prompted to complete their profile:
   date of birth, gender, blood group, height, weight, allergies, chronic
   conditions, emergency contact.
2. Profile page shows auto-calculated BMI.
3. Profile page also shows a "Data Sharing" tab listing which doctors
   currently have access to their full record, with a revoke button (this
   connects to §12).

**Data model — `PatientProfile`**
| Field | Type | Notes |
|---|---|---|
| userId | ref User | |
| dob | date | |
| gender | string | |
| bloodGroup | string | |
| heightCm | number | |
| weightKg | number | |
| allergies | [string] | |
| chronicConditions | [string] | |
| emergencyContact | {name, phone, relation} | |

**API endpoints**
- `GET /api/patients/me/profile`
- `PUT /api/patients/me/profile`

**Vibe-Coding Prompt**
```
Build Section 3: Patient Profile, Vitals & Privacy Controls. Assumes
Section 2 (auth) exists — reuse the User model, requireAuth middleware, and
JWT pattern already built.

Add to /server:
- models/PatientProfile.js: userId (ref User), dob, gender, bloodGroup,
  heightCm, weightKg, allergies (array of strings), chronicConditions
  (array of strings), emergencyContact ({name, phone, relation}).
- routes/patientRoutes.js: GET /me/profile and PUT /me/profile (both
  protected, role=patient, auto-create the profile document on first GET
  if it doesn't exist yet).
- Register under /api/patients.

Add to /client:
- /patient-dashboard/profile page: a form for all PatientProfile fields,
  computes and displays BMI live from height/weight (don't store BMI, just
  compute it in the UI), saves via PUT.
- A "Data Sharing" tab/section on the same page (build the UI now with
  placeholder/mock data — it will be wired to a real endpoint in Section
  12): a list of doctors with access, each with a "Revoke" button.

Follow the existing Tailwind style used elsewhere in the app.
```

---

## 4. Section: Medical History Timeline

**Purpose:** Feature #1 — a running record of a patient's past conditions
and visits, self-reported or doctor-verified.

**User flow:**
1. Patient can manually add a history entry ("Had COVID-19, March 2025")
   from their dashboard — marked "self-reported."
2. When a doctor completes a consultation (built in later sections), a
   history entry is auto-created and marked "doctor-verified," linked to
   that doctor and appointment.
3. Patient's dashboard shows the full timeline, newest first, each entry
   tagged with its source.

**Data model — `MedicalHistoryEntry`**
| Field | Type | Notes |
|---|---|---|
| patientId | ref PatientProfile | |
| source | enum | self-reported / doctor-verified |
| recordedByDoctorId | ref DoctorProfile | nullable |
| appointmentId | ref Appointment | nullable |
| condition | string | |
| notes | string | |
| date | date | |

**API endpoints**
- `GET /api/patients/me/history`
- `POST /api/patients/me/history` (self-reported only; doctor-verified
  entries are created server-side by the consultation-completion flow in
  §7, not through this endpoint)

**Vibe-Coding Prompt**
```
Build Section 4: Medical History Timeline. Assumes Sections 2 and 3 exist.

Add to /server:
- models/MedicalHistoryEntry.js: patientId (ref PatientProfile), source
  (enum: self-reported, doctor-verified), recordedByDoctorId (ref
  DoctorProfile, nullable), appointmentId (ref Appointment, nullable),
  condition, notes, date.
- In routes/patientRoutes.js add: GET /me/history (returns entries sorted
  newest first) and POST /me/history (creates a self-reported entry for
  the logged-in patient; force source='self-reported' server-side
  regardless of what's sent).
- Export a reusable function createDoctorVerifiedHistoryEntry(patientId,
  doctorId, appointmentId, condition, notes) from a
  services/historyService.js file — this will be called by the
  appointment-completion logic built in a later section; just create and
  export the function now, don't wire it to anything yet.

Add to /client:
- /patient-dashboard/history page: a chronological timeline list, each
  entry showing condition, date, notes, and a badge for
  self-reported vs doctor-verified (with doctor name if doctor-verified).
- An "Add entry" form (condition, date, notes) that POSTs to
  /api/patients/me/history.
```

---

## 5. Section: Doctor Profiles, Search & Daily Listing

**Purpose:** Features #2, #3, #4, #12 — doctors have profiles; patients
search/filter/sort by rating, distance, fee, and see who's available today.

**User flow:**
1. Doctor completes their profile: specialty, qualifications, hospital
   name & location, consultation fee, working hours/slots.
2. Patient visits `/find-doctors`, optionally allows browser geolocation,
   picks a specialty and/or date, and filters by fee range/distance radius.
3. Results list sorts by rating (default), distance, or fee — patient's
   choice — each card shows name, specialty, hospital, distance, fee,
   avg rating + review count, and today's available slots.

**Data model — `DoctorProfile`**
| Field | Type | Notes |
|---|---|---|
| userId | ref User | |
| specialty | string | |
| qualifications | [string] | |
| hospitalName | string | |
| location | {lat, lng, address} | |
| consultationFee | number | |
| followUpFee | number | |
| avgRating | number | denormalized, recalculated in §6 |
| ratingCount | number | |
| workingHours | [{day, startTime, endTime, slotMinutes}] | |
| videoEnabled | boolean | |

**API endpoints**
- `GET /api/doctors` — query params: specialty, lat, lng, radiusKm,
  feeMin, feeMax, date, sortBy=rating|distance|fee
- `GET /api/doctors/:id`
- `PUT /api/doctors/me/profile`
- `PUT /api/doctors/me/availability`

**Vibe-Coding Prompt**
```
Build Section 5: Doctor Profiles, Search & Daily Listing. Assumes Section 2
exists. The AI service (/ai, FastAPI) already has a Haversine distance
function used for emergency hospital ranking — reuse that logic (extract it
into a shared utility function if it's inline) instead of rewriting
distance math from scratch.

Add to /server:
- models/DoctorProfile.js: userId (ref User), specialty, qualifications
  (array), hospitalName, location ({lat, lng, address}), consultationFee,
  followUpFee, avgRating (default 0), ratingCount (default 0),
  workingHours (array of {day, startTime, endTime, slotMinutes}),
  videoEnabled (boolean).
- routes/doctorProfileRoutes.js:
  - GET /api/doctors — supports query params specialty, lat, lng,
    radiusKm, feeMin, feeMax, sortBy (rating|distance|fee). If lat/lng
    given, call the AI service's distance/ranking logic (or replicate the
    Haversine formula server-side if simpler) to compute and sort by
    distance.
  - GET /api/doctors/:id — full profile.
  - PUT /api/doctors/me/profile, PUT /api/doctors/me/availability
    (protected, role=doctor, auto-create on first PUT).
- Register under /api/doctors, alongside existing routes without
  conflicting paths.

Add to /client:
- /doctor-dashboard/profile page: form for all DoctorProfile fields
  including a simple weekly working-hours editor.
- /find-doctors page (patient-facing): specialty dropdown, "use my
  location" button (browser geolocation), fee range slider, sort-by
  toggle (rating/distance/fee), results as cards (name, specialty,
  hospital, distance in km if location given, fee, ⭐avgRating
  (ratingCount reviews)). Each card links to a doctor detail page showing
  today's available slots (slot generation can be a simple placeholder for
  now — real slot/booking logic comes in Section 6).

Seed the database with ~15-20 demo doctors across a few specialties and
locations so this is demoable immediately — add a seed script
server/scripts/seedDoctors.js.
```

---

## 6. Section: Appointment Booking

**Purpose:** Feature #7 — patients book a specific slot with a specific
doctor. This is the integration point with the existing token/queue system.

**User flow:**
1. From a doctor's detail page, patient picks a date and an open slot,
   sets chief complaint, and confirms.
2. If the appointment date is today, the server also creates a `Token` in
   the existing queue system (same as Reception does), so the doctor's
   existing queue panel and the public Display board show this patient too.
3. Both patient and doctor see the appointment in their dashboards
   ("Upcoming Appointments").
4. Doctor can mark an appointment `checked-in → in-progress → completed`;
   on `completed`, call the `createDoctorVerifiedHistoryEntry` function
   from Section 4 to log it to the patient's history.

**Data model — `Appointment`**
| Field | Type | Notes |
|---|---|---|
| patientId | ref PatientProfile | |
| doctorId | ref DoctorProfile | |
| date | date | |
| slotTime | string | |
| mode | enum | in-person / video |
| status | enum | booked / checked-in / in-progress / completed / cancelled |
| priority | enum | routine / urgent / critical |
| tokenId | ref Token | nullable, set for same-day appointments |
| chiefComplaint | string | |
| accessGranted | boolean | patient's consent for this appointment (default false) |

**API endpoints**
- `POST /api/appointments`
- `GET /api/appointments/mine` (role-aware: patient sees their own,
  doctor sees theirs)
- `PATCH /api/appointments/:id/status`
- `GET /api/appointments/:id/queue-position` (built out fully in §7)

**Vibe-Coding Prompt**
```
Build Section 6: Appointment Booking. Assumes Sections 2, 3, 4, 5 exist.
This section must integrate with the EXISTING Token model/creation logic
already used by the Reception panel — reuse that model and creation
pattern, don't create a parallel queue system.

Add to /server:
- models/Appointment.js: patientId (ref PatientProfile), doctorId (ref
  DoctorProfile), date, slotTime, mode (enum: in-person, video, default
  in-person), status (enum: booked, checked-in, in-progress, completed,
  cancelled, default booked), priority (enum: routine, urgent, critical,
  default routine), tokenId (ref Token, nullable), chiefComplaint,
  accessGranted (boolean, default false).
- routes/appointmentRoutes.js:
  - POST / — creates an Appointment. Validate the slot isn't already
    booked for that doctor/date/time. If date is today, also create a
    Token document using the same fields/pattern the existing Reception
    flow uses, and store its _id as tokenId.
  - GET /mine — if role=patient, return appointments for their
    PatientProfile; if role=doctor, return appointments for their
    DoctorProfile. Support a ?date= filter.
  - PATCH /:id/status — updates status; when status is set to
    'completed', call createDoctorVerifiedHistoryEntry(...) from
    services/historyService.js (built in Section 4) using the
    appointment's patientId, doctorId, and chiefComplaint as the
    condition/notes.
  - GET /:id/queue-position — for now, return a placeholder response
    { position: null, estimatedTime: null } — this gets fully implemented
    in Section 7.
- Register under /api/appointments.

Add to /client:
- Booking flow on the doctor detail page (from Section 5): date picker,
  slot picker (only show open slots — fetch existing appointments for that
  doctor/date to exclude taken ones), chief complaint textbox, priority
  selector (routine/urgent/critical, with urgent/critical requiring a short
  reason), video/in-person toggle (only show video if doctor.videoEnabled),
  "Confirm booking" button calling POST /api/appointments.
- /patient-dashboard/appointments: list of upcoming/past appointments with
  status badges, a cancel button for 'booked' status.
- /doctor-dashboard/appointments: today's appointments list with buttons
  to advance status (check in → start → complete).
```

---

## 7. Section: Live Queue Position & Priority Queuing

**Purpose:** Features #9, #10 — patients see a live ETA instead of waiting
physically, and critical patients are fairly prioritized.

**User flow:**
1. Once checked in (or automatically for same-day booked appointments),
   the patient's dashboard shows: "You are #31 in line. Estimated time:
   2:45 PM," updating live.
2. When the patient is within N patients of being called, they get an
   in-app/browser alert: "Almost your turn — head to the hospital."
3. Critical-priority patients are inserted into the effective queue order
   ahead of routine ones, but not in strict cut-the-line fashion — the
   algorithm interleaves so routine patients aren't fully starved, and the
   reason for any reordering is visible in the doctor's queue view
   ("moved up: Critical priority").

**Data flow:**
- Reuses the existing Socket.IO `queue-room`/`doctor-room` pattern —
  add a new room per patient (`patient-room:{patientId}`).
- Reuses the existing AI wait-time predictor, called with the patient's
  effective queue position (post-priority-reordering) instead of raw FIFO
  position.

**API/AI endpoints**
- `GET /api/appointments/:id/queue-position` — completes this from §6,
  returns `{ position, estimatedTime }`.
- AI service: extend with `POST /priority-score` (input: list of tokens
  with priority tags + arrival times; output: reordered effective queue)
  and reuse the existing wait-time predictor on the reordered list.

**Vibe-Coding Prompt**
```
Build Section 7: Live Queue Position & Priority Queuing. Assumes Sections
2, 3, 5, 6 exist, and the EXISTING queue engine (Token model, Socket.IO
queue-room/doctor-room, and the AI service's Poisson wait-time predictor)
already works — extend it, don't replace it.

In /ai (FastAPI), add:
- POST /priority-score — input: a list of queue entries, each with
  {tokenId, priority (routine/urgent/critical), arrivalTime}; output: the
  same list reordered into an "effective queue order," using a weighted
  algorithm where critical patients move up but no more than 2 routine
  patients in a row are skipped for a critical/urgent one (avoid full
  starvation). Include a `reason` field per entry explaining any reorder
  (e.g. "moved up: Critical priority").
- Extend the existing wait-time prediction endpoint (or add
  GET /wait-estimate/patient/{tokenId}) to accept the effective queue
  order from /priority-score and return { position, estimatedTime } for
  one specific token, reusing the existing Poisson-based logic rather than
  rewriting it.

In /server:
- Complete GET /api/appointments/:id/queue-position (started in Section
  6): fetch the doctor's current queue of Tokens for today, call the AI
  service's /priority-score then wait-estimate logic, and return
  { position, estimatedTime, priority, reason }.
- Extend socketHandler.js: whenever the existing queue-advance logic fires
  (already used to update the Display board), also emit
  queue:position-update to each affected patient's room
  (patient-room:{patientId}) with their new { position, estimatedTime }.
  Add a queue:near-turn event emitted once when a patient's position
  crosses a configurable threshold (default: 5 patients away).
- Make sure the client's Socket.IO connection joins
  patient-room:{patientId} on login for patient-role users.

In /client:
- On /patient-dashboard, add a "Current Queue Status" card (visible when
  the patient has a checked-in/in-progress appointment today): shows
  live position and estimated time, updating via the
  queue:position-update socket event, and shows an in-app notification
  banner on queue:near-turn.
- On the doctor's queue view (existing Doctor panel), add a small badge
  next to any reordered patient showing the `reason` field (e.g. "moved
  up: Critical priority") so the reordering is transparent.
```

---

## 8. Section: Prescriptions & Medicine Reminders

**Purpose:** Feature #8 — doctors write structured prescriptions; patients
get reminded at the exact prescribed times.

**User flow:**
1. During/after a consultation, doctor fills a prescription form: for each
   medicine, name, dosage, frequency, exact times (e.g. 8:00 AM, 2:00 PM,
   8:00 PM), relation to meal, duration in days.
2. On save, the system expands this into individual reminder entries for
   every dose, every day, for the duration.
3. Patient's dashboard/app shows a "Today's Medicines" checklist; at each
   scheduled time, they get an in-app/push alert, and can mark
   taken/skipped.
4. Reminders automatically stop after the prescribed duration ends.

**Data model — `Prescription`**
| Field | Type | Notes |
|---|---|---|
| appointmentId | ref Appointment | |
| patientId, doctorId | ref | |
| medicines | array | each: name, dosage, frequencyPerDay, times[], relationToMeal, durationDays, notes |

**Data model — `ReminderSchedule`** (one doc per dose per day)
| Field | Type | Notes |
|---|---|---|
| prescriptionId, patientId | ref | |
| medicineName | string | |
| scheduledAt | date | |
| status | enum | pending / sent / taken / skipped |

**API endpoints**
- `POST /api/prescriptions`
- `GET /api/prescriptions/patient/:patientId` (access-controlled, §12)
- `GET /api/reminders/mine`
- `PATCH /api/reminders/:id`

**Vibe-Coding Prompt**
```
Build Section 8: Prescriptions & Medicine Reminders. Assumes Sections 2, 3,
6 exist.

Add to /server:
- models/Prescription.js: appointmentId (ref Appointment), patientId,
  doctorId, medicines (array of {name, dosage, frequencyPerDay, times
  (array of "HH:MM" strings), relationToMeal (enum: before, after, with,
  none), durationDays, notes}), createdAt.
- models/ReminderSchedule.js: prescriptionId, patientId, medicineName,
  scheduledAt (Date), status (enum: pending, sent, taken, skipped, default
  pending).
- services/reminderService.js: a function generateReminders(prescription)
  that, for each medicine, creates one ReminderSchedule document per
  (time × day) across durationDays, computing actual Date values from
  today's date + each time string.
- routes/prescriptionRoutes.js: POST / (doctor-only, creates the
  Prescription then calls generateReminders); GET /patient/:patientId
  (leave a TODO comment noting this must be wrapped with the access-control
  check being built in Section 12 — for now just protect with requireAuth
  and allow if requester is the patient themself or role=doctor).
- routes/reminderRoutes.js: GET /mine (patient's reminders, optionally
  filtered to today), PATCH /:id (mark taken/skipped).
- A simple scheduler using node-cron, running every minute, that finds
  ReminderSchedule docs with status='pending' and scheduledAt <= now,
  marks them 'sent', and emits a reminder:due Socket.IO event to
  patient-room:{patientId} (reuse the room pattern from Section 7).
- Register prescriptionRoutes under /api/prescriptions, reminderRoutes
  under /api/reminders.

Add to /client:
- Doctor-side prescription form (on an appointment's detail view): dynamic
  list of medicines, each with name, dosage, frequency, a time-picker for
  each dose time, relation-to-meal dropdown, duration in days. Submits to
  POST /api/prescriptions.
- Patient-side "Today's Medicines" widget on /patient-dashboard: lists
  today's reminders in time order, each with Taken/Skip buttons (PATCH
  /api/reminders/:id), and listens for the reminder:due socket event to
  show a toast/notification when a dose is due.
```

---

## 9. Section: Video Consultation

**Purpose:** Feature #11 — patients who can't visit physically can consult
by video.

**User flow:**
1. Doctor marks their profile `videoEnabled` (already in §5); patient can
   choose "video" mode when booking (already in §6).
2. When it's the patient's turn (queue reaches them, or at their booked
   video slot time), both patient and doctor dashboards show a "Join Call"
   button.
3. Call happens via WebRTC, with signaling over the existing Socket.IO
   connection; after the call, the doctor completes the consultation the
   same way as an in-person visit (status → completed, prescription, etc.)

**API/Socket additions**
- `POST /api/video/:appointmentId/token` — issues a room identifier for
  the call.
- Socket.IO signaling events: `video:offer`, `video:answer`,
  `video:ice-candidate`, scoped to a room named after the appointment ID.
- `video:call-ready` emitted to both patient and doctor rooms when it's
  time.

**Vibe-Coding Prompt**
```
Build Section 9: Video Consultation. Assumes Sections 2, 6, 7 exist. Use
plain WebRTC with a public STUN server and Socket.IO for signaling — no new
media server needed.

Add to /server:
- routes/videoRoutes.js: POST /:appointmentId/token — verifies the
  requester is either the appointment's patient or doctor, returns a room
  id (can just be the appointmentId itself).
- Extend socketHandler.js: on connection, allow clients to join a room
  named video-{appointmentId}; relay video:offer, video:answer, and
  video:ice-candidate events to the other peer in that room (standard
  WebRTC signaling relay, not media itself). Emit video:call-ready to
  patient-room:{patientId} and the doctor's session when an appointment's
  status becomes 'in-progress' and mode='video'.
- Register videoRoutes under /api/video.

Add to /client:
- A /video/:appointmentId page: on mount, calls POST
  /api/video/:appointmentId/token, joins the video-{appointmentId} socket
  room, sets up a standard WebRTC RTCPeerConnection with a public STUN
  server (e.g. stun:stun.l.google.com:19302), exchanges offer/answer/ICE
  candidates via the socket events above, and renders local + remote
  video streams with mute/camera-off/end-call controls.
- A "Join Call" button that appears on both patient and doctor dashboards
  when they receive video:call-ready, linking to /video/:appointmentId.
- After the doctor ends the call, route them to the existing
  consultation-completion flow (status → completed, opens the
  prescription form from Section 8) exactly as for in-person visits.
```

---

## 10. Section: Doctor-Issued Care Plans (Diet/Exercise)

**Purpose:** Feature #13 — structured, checklist-style lifestyle guidance
tied to a diagnosis, not buried in free text.

**User flow:**
1. During/after a consultation, doctor fills a Care Plan form: diagnosis,
   recommended diet items, restricted diet items, recommended activities,
   restricted activities, follow-up date, notes.
2. Patient sees it in their dashboard as a checklist tied to that
   diagnosis/history entry.

**Data model — `CarePlan`**
| Field | Type | Notes |
|---|---|---|
| appointmentId, patientId, doctorId | ref | |
| diagnosis | string | |
| dietRecommended, dietRestricted | [string] | |
| activityRecommended, activityRestricted | [string] | |
| followUpDate | date | |
| notes | string | |

**API endpoints**
- `POST /api/care-plans`
- `GET /api/care-plans/patient/:patientId` (access-controlled, §12)

**Vibe-Coding Prompt**
```
Build Section 10: Doctor-Issued Care Plans. Assumes Sections 2, 3, 6 exist.

Add to /server:
- models/CarePlan.js: appointmentId, patientId, doctorId, diagnosis,
  dietRecommended (array of strings), dietRestricted (array of strings),
  activityRecommended (array of strings), activityRestricted (array of
  strings), followUpDate, notes.
- routes/carePlanRoutes.js: POST / (doctor-only, tied to an appointment);
  GET /patient/:patientId (protected; add a TODO noting it should be
  wrapped by the access-control check from Section 12).
- Register under /api/care-plans.

Add to /client:
- Doctor-side Care Plan form on the appointment detail view (alongside the
  prescription form from Section 8): diagnosis text field, and four
  tag-input lists (diet recommended, diet restricted, activity
  recommended, activity restricted), follow-up date picker, notes.
- Patient-side /patient-dashboard/care-plans page: each care plan shown as
  a card with the diagnosis as the heading, two checklists (✅ do / 🚫
  avoid) built from the diet/activity fields, and the follow-up date
  highlighted if it's coming up soon.
```

---

## 11. Section: Shared Lab/Test Results

**Purpose:** Feature #14 — a test ordered by one doctor is visible (with
result) to any other doctor the patient later shares their record with.

**User flow:**
1. Doctor orders a test during a consultation (test name + reason).
2. Result gets recorded (value, unit, date, lab name) — either by the
   patient, a lab-side user, or manually by the ordering doctor for demo
   purposes.
3. If the patient later grants a different doctor access (§12), that
   doctor sees this test order + result in the patient's shared record,
   with a clear "ordered by Dr. X on [date]" attribution.

**Data model — `TestOrder`**
| Field | Type | Notes |
|---|---|---|
| appointmentId, patientId, doctorId | ref | doctorId = who ordered it |
| testName | string | |
| reason | string | |
| status | enum | ordered / completed |
| result | {value, unit, resultDate, labName, notes} | |

**API endpoints**
- `POST /api/test-orders`
- `PATCH /api/test-orders/:id/result`
- `GET /api/test-orders/patient/:patientId` (access-controlled, §12)

**Vibe-Coding Prompt**
```
Build Section 11: Shared Lab/Test Results. Assumes Sections 2, 3, 6 exist.

Add to /server:
- models/TestOrder.js: appointmentId, patientId, doctorId (who ordered),
  testName, reason, status (enum: ordered, completed, default ordered),
  result ({value, unit, resultDate, labName, notes}).
- routes/testOrderRoutes.js: POST / (doctor-only, creates an order);
  PATCH /:id/result (patient or doctor can fill in the result, sets
  status to 'completed'); GET /patient/:patientId (protected; add a TODO
  noting it should be wrapped by the access-control check from Section
  12).
- Register under /api/test-orders.

Add to /client:
- Doctor-side "Order Test" button/form on the appointment detail view:
  test name, reason. Shows a list of that patient's existing test orders
  (if the doctor has access) with status badges.
- Patient-side /patient-dashboard/tests page: list of test orders, each
  showing test name, ordered-by doctor, date, status, and — once
  completed — the result value/date/lab. A simple form to fill in a
  result for any 'ordered' status test (value, unit, date, lab name).
```

---

## 12. Section: Consent & Access Control (Cross-Cutting)

**Purpose:** The rule underneath Sections 4, 8, 10, 11: a doctor only sees
a patient's full history/prescriptions/care-plans/test-results if the
patient has explicitly granted access — and every access is logged.

**User flow:**
1. By default, a new appointment has `accessGranted: false` — the doctor
   sees only name, age, gender, chief complaint for that visit.
2. At booking (or any time after), the patient can grant access — either
   "just for this appointment" or "ongoing, for this doctor" (e.g. their
   regular GP) — from their dashboard.
3. Every time a doctor's request successfully returns shared data
   (history, prescriptions, care plans, test orders), it's logged.
4. Patient's "Data Sharing" tab (built as a placeholder in §3) now shows
   real grants and an access log ("Dr. Mehta viewed your history on Aug 12,
   3:04 PM"), with a revoke button per doctor.

**Data model — `AccessGrant`**
| Field | Type | Notes |
|---|---|---|
| patientId, doctorId | ref | |
| scope | enum | appointment / ongoing |
| appointmentId | ref Appointment | required if scope=appointment |
| grantedAt, revokedAt | date | revokedAt nullable |

**Data model — `AccessLog`**
| Field | Type | Notes |
|---|---|---|
| patientId, doctorId | ref | |
| accessedAt | date | |
| resource | enum | history / testOrder / prescription / carePlan |
| resourceId | ObjectId | |

**API endpoints**
- `POST /api/access/grant`
- `POST /api/access/revoke`
- `GET /api/access/log/mine`

**Vibe-Coding Prompt**
```
Build Section 12: Consent & Access Control. Assumes Sections 2-11 exist.
This section wraps the "GET /patient/:patientId" endpoints already built in
prescriptionRoutes, carePlanRoutes, testOrderRoutes, and the history route
in patientRoutes — go back and actually apply the wrapper to those routes
(don't leave the TODOs unresolved).

Add to /server:
- models/AccessGrant.js: patientId, doctorId, scope (enum: appointment,
  ongoing), appointmentId (ref Appointment, required if scope=appointment),
  grantedAt (default now), revokedAt (nullable).
- models/AccessLog.js: patientId, doctorId, accessedAt (default now),
  resource (enum: history, testOrder, prescription, carePlan),
  resourceId.
- middleware/checkAccess.js: exports a function
  checkAccess(patientId, doctorId, appointmentId, resourceType) that:
  1. Returns true if an AccessGrant exists for (patientId, doctorId) with
     scope='ongoing' and revokedAt=null, OR scope='appointment' matching
     the given appointmentId and revokedAt=null.
  2. If true, writes an AccessLog entry (patientId, doctorId, resource:
     resourceType, resourceId: appointmentId) and returns true.
  3. If false, returns false (caller should return a reduced/minimal
     response, not a 403 error).
- Apply checkAccess inside: GET /api/patients/me/history (when called by
  a doctor via a doctor-facing variant — add GET
  /api/patients/:patientId/history for doctors, protected + checkAccess),
  GET /api/prescriptions/patient/:patientId, GET
  /api/care-plans/patient/:patientId, GET
  /api/test-orders/patient/:patientId — in each, if checkAccess returns
  false, return an empty/minimal result instead of an error.
- routes/accessRoutes.js: POST /grant (patientId=self, doctorId, scope,
  appointmentId if scope=appointment), POST /revoke (sets revokedAt=now
  for the matching grant), GET /log/mine (patient's own AccessLog
  entries, newest first, populated with doctor name).
- Register under /api/access.

Add to /client:
- Complete the "Data Sharing" tab from Section 3's profile page: fetch
  real AccessGrants (add a GET /api/access/grants/mine endpoint if not
  already covered) and the access log from GET /api/access/log/mine;
  show each doctor with access, a Revoke button (POST /api/access/revoke),
  and a scrollable access log list ("Dr. X viewed your [resource] on
  [date/time]").
- On the booking flow (Section 6) and on the patient's appointment detail
  view, add a toggle: "Share my full medical record with this doctor" —
  wired to POST /api/access/grant with scope='appointment' (or 'ongoing'
  if the patient checks "always share with this doctor").
```

---

## 13. Section: Deployment & Ops (recap, already partly done)

Your existing repo already has `docker-compose.yml`, per-service
Dockerfiles, `render.yaml`, and `vercel.json` — new services should slot
into these, not replace them.

**Vibe-Coding Prompt**
```
Review my existing docker-compose.yml, Dockerfiles (docker/Dockerfile.ai,
Dockerfile.client, Dockerfile.server), render.yaml, and vercel.json. I've
added new Express routes, Mongoose models, an extended FastAPI service, and
new React pages as described in the sections above, but no new services,
databases, or external dependencies beyond what's already declared (Mongo,
Redis, the three existing containers). Update these config files only if
something new (like node-cron) needs an env var or dependency added to
package.json/requirements.txt — do not restructure the existing
docker-compose topology.
```

---

## 14. Quick Reference: All New Collections at a Glance

`User` → `PatientProfile` / `DoctorProfile` → `MedicalHistoryEntry`,
`Appointment` → `Prescription` → `ReminderSchedule`, `Rating` (add in §5's
review flow, mirrors DoctorProfile.avgRating), `TestOrder`, `CarePlan`,
`AccessGrant`, `AccessLog`.

All reference `User`/`PatientProfile`/`DoctorProfile`/`Appointment` by ID —
nothing duplicates the existing `Token`/`DoctorSession`/`QueueState`/
`EmergencyCase`/`DailySummary` models; `Appointment.tokenId` is the single
bridge between the new system and your existing queue engine.
