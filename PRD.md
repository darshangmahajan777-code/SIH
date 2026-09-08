# Product Requirements Document (PRD)
## MediQueue+ — Patient-Doctor Healthcare Platform
### (Extension of the existing Hospital Queue Management System, for SIH)

**Version:** 1.0
**Status:** Draft for review
**Owner:** [Your team name]
**Base system:** Existing MERN + FastAPI hospital queue app (Reception, Doctor,
Display, Emergency panels; real-time token queue with AI wait-time prediction)

---

## 1. Vision

MediQueue+ turns a single-hospital digital queue tool into a multi-hospital,
multi-doctor healthcare platform where a patient can maintain their medical
history, discover and book the right doctor, avoid physical waiting through
live queue visibility, get reminded to take prescribed medicine, consult
remotely by video when needed, and let doctors safely see relevant past
history and test results with the patient's consent.

## 2. Problem Statement

Today, patients:
- Repeat their medical history to every new doctor because nothing is
  recorded centrally.
- Pick a doctor blindly — no visibility into ratings, distance, or fees.
- Physically wait in hospital corridors for hours because there's no
  reliable ETA for their turn.
- Forget prescribed medicine timings.
- Cannot easily get a second opinion or follow-up without visiting again,
  even for minor cases.
- Have test results scattered across labs/hospitals, so a new doctor
  re-orders the same tests.

Doctors, meanwhile, have no visibility into a walk-in patient's history,
current medications, or ongoing test results unless the patient physically
carries reports.

## 3. Goals / Non-Goals

**Goals**
- Give every patient a portable, consent-gated medical profile.
- Let patients discover doctors by rating, distance, and fee.
- Let patients book appointments and see live queue position/ETA instead of
  waiting physically.
- Support priority handling for serious/emergency cases.
- Support medicine reminders tied to actual prescriptions.
- Support video consultations.
- Let doctors see history/tests/prescriptions a patient explicitly shares.

**Non-Goals (for this version)**
- Payments / insurance claims processing.
- Full EHR/HL7-FHIR interoperability with external hospital systems.
- Pharmacy inventory or e-prescription fulfillment integration.
- Native mobile apps (web-responsive is sufficient for the demo).

## 4. Personas

| Persona | Description |
|---|---|
| **Patient** | Registers, manages their profile/history, searches doctors, books appointments, receives reminders, joins video calls. |
| **Doctor** | Manages availability/schedule, sees queue, views patient data patient has shared, writes prescriptions and care plans, orders tests. |
| **Receptionist** (existing) | Registers walk-in patients, issues tokens — unchanged, but now can link a token to a registered patient profile. |
| **Admin** (new, optional/stretch) | Onboards doctors/hospitals, moderates ratings, views audit logs. |

## 5. Feature Epics

Each epic maps 1:1 to a feature you listed. **P0 = must-have for MVP demo,
P1 = strong-have, P2 = stretch/if time allows.**

---

### Epic 1 — Patient Medical History Record (P0)
**Story:** As a patient, I want my past conditions/visits recorded so I don't
have to repeat my medical history to every doctor.

- Patient's history is a timeline: condition/diagnosis, date, treating
  doctor, notes, linked prescription/test-result IDs.
- History entries are created automatically when a doctor completes a
  consultation (with the patient's consent for that record to be saved),
  and can also be manually added by the patient (self-reported, clearly
  labeled as "self-reported" vs "doctor-verified").
- **Acceptance criteria:**
  - Patient can view their full history in chronological order.
  - Each entry shows source (self-reported / Dr. X on [date]).
  - A doctor only sees this list if access has been granted (see Epic 5/14).

---

### Epic 2 — Doctor Recommendation by Rating (P0)
**Story:** As a patient, I want to see doctors ranked by how previous
patients rated them, so I can choose a good doctor.

- After a completed appointment, patient can rate 1–5 stars + optional
  comment.
- Doctor search/listing supports "sort by rating" and shows average rating +
  review count.
- **Acceptance criteria:** rating only allowed after a completed appointment
  with that doctor (prevents fake reviews); average recalculates on submit.

---

### Epic 3 — Doctor Recommendation by Proximity (P0)
**Story:** As a patient, I want to find doctors near me.

- Doctor profile stores hospital/clinic geolocation (lat/lng).
- Patient search uses browser geolocation (or manually entered city/pin
  code) and sorts/filters by distance (Haversine — the AI service already
  has this logic for emergency hospital ranking; reuse it).
- **Acceptance criteria:** distance shown in km, sortable, filterable by
  radius (e.g. within 5/10/25 km).

---

### Epic 4 — Doctor Recommendation by Fee (P0)
**Story:** As a patient, I want to filter/sort doctors by consultation fee.

- Doctor profile stores consultation fee (and optionally follow-up fee).
- Search UI: sort ascending/descending by fee, filter by fee range.
- **Acceptance criteria:** combined filtering works together with rating and
  distance (e.g. "doctors within 10km, sorted by rating, under ₹500").

---

### Epic 5 — Patient Self-Service Profile (P0)
**Story:** As a patient, I want to create my own account and control what's
visible about me.

- Signup/login (email+password or phone+OTP — pick one for MVP; email+
  password is faster to build).
- Profile edit screen.
- **Privacy control:** a per-doctor or per-appointment toggle: "Share my
  medical history with this doctor" (default OFF until patient books/
  confirms; access is scoped to that doctor, revocable).
- **Acceptance criteria:** a doctor with no granted access sees only the
  current appointment's basic info (name, age, gender, chief complaint) —
  not history, tests, or past prescriptions.

---

### Epic 6 — Profile Vitals & Basic Info (P0)
**Story:** As a patient, I want to record my blood group, height, weight,
etc., so doctors have baseline info.

- Fields: blood group, height (cm), weight (kg), date of birth/age, gender,
  known allergies, chronic conditions flag, emergency contact.
- Auto-computed BMI, shown to patient and to doctors with access.
- **Acceptance criteria:** validation on ranges (e.g. height 30–250cm);
  editable anytime by the patient.

---

### Epic 7 — Appointment Booking (P0)
**Story:** As a patient, I want to book a specific time with a specific
doctor instead of just walking in.

- Doctor sets available slots/working hours (Epic 12 depends on this too).
- Patient picks doctor → date → available slot → confirms → booking created
  and linked into the existing token/queue system for that day.
- **Acceptance criteria:** double-booking of the same slot is prevented;
  booking shows in both patient's and doctor's dashboards; cancellation/
  reschedule supported.

---

### Epic 8 — Prescription + Medicine Reminders (P0)
**Story:** As a patient, I want to be reminded to take medicine exactly when
prescribed.

- Doctor prescription form: medicine name, dosage, frequency (e.g. "twice
  daily"), specific times (e.g. 8:00 AM, 8:00 PM), relation to meal (before/
  after/with), duration (days), notes.
- System generates a reminder schedule from the prescription and delivers
  reminders (browser push notification for the demo; SMS/WhatsApp mocked or
  via a provider like Twilio if time allows) at each scheduled time until
  duration ends.
- **Acceptance criteria:** patient can mark a reminder as "taken"/"skipped";
  reminders stop automatically after the prescribed duration.

---

### Epic 9 — Live Queue Position & Remote Waiting (P0)
**Story:** As token #31 behind 30 patients, I don't want to physically wait —
I want an estimated time to arrive.

- Extends the existing AI wait-time predictor: instead of only showing the
  live display board, the patient's own app/dashboard shows "your position:
  31, estimated call time: 2:45 PM ± 10 min," updating in real time via the
  existing Socket.IO channel.
- Push/SMS alert when the patient is "next up" (e.g. 3 patients away) so
  they can head to the hospital.
- **Acceptance criteria:** estimate updates as the queue moves; patient
  receives an alert at a configurable threshold (e.g. "5 patients before
  you").

---

### Epic 10 — Priority Queuing by Condition Severity (P0)
**Story:** As a critically ill patient, I should be seen sooner than routine
cases, fairly and transparently.

- Extends the existing priority levels used in Reception/Emergency
  (General / Senior Citizen / Emergency) into a documented priority
  algorithm: severity tag (Routine / Urgent / Critical) set at
  registration/booking (by receptionist, triage nurse, or self-reported
  then confirmed), which reorders effective queue position without fully
  starving routine patients (e.g. weighted/interleaved, not strict
  cut-the-line).
- **Acceptance criteria:** priority changes are visible and explainable in
  the doctor/reception UI ("moved up: Critical priority"); an audit trail
  records why a patient's position changed.

---

### Epic 11 — Video Consultation (P1)
**Story:** As a patient who can't travel, I want to consult by video call.

- Doctor can mark a slot/appointment as "video eligible."
- In-app WebRTC video call, launched from the appointment when it's the
  patient's turn (or at scheduled time for booked slots).
- **Acceptance criteria:** call can be started/joined from both patient and
  doctor dashboards; basic controls (mute/camera off/end call); consultation
  outcome (prescription, care plan) still gets recorded the same as an
  in-person visit.

---

### Epic 12 — Daily Doctor Listing/Schedule (P0)
**Story:** As a patient, I want to see which doctors are available today,
with their specialty, fee, rating, and open slots.

- A searchable/filterable list: specialty, date, availability, fee range,
  rating, distance.
- **Acceptance criteria:** list reflects real-time slot availability (a
  booked slot disappears from what other patients see).

---

### Epic 13 — Doctor-Issued Diet / Exercise / Lifestyle Care Plan (P1)
**Story:** As a doctor, I want to give structured do's/don'ts (diet,
exercise) tied to the diagnosis, not just free text buried in a note.

- Structured "Care Plan" object attached to a consultation: diagnosis,
  recommended diet items, restricted diet items, recommended
  activity/exercise, restricted activity, general notes, follow-up date.
- Patient sees this in their dashboard as a checklist, linked to the
  diagnosis it came from.
- **Acceptance criteria:** care plan is visible to the patient immediately
  after the consultation and stays attached to that history entry.

---

### Epic 14 — Shared Lab/Test Results Across Doctors (P0)
**Story:** As a doctor, if my patient already got a blood test another
doctor ordered, I want to see the result (with date/time) instead of
re-ordering it — if the patient has shared their record with me.

- Doctor can raise a "Test Order" (test name, reason) attached to a
  consultation.
- Patient (or an integrated/mock lab flow) uploads/records the result
  (value + date/time + lab name, or a file/report).
- Any subsequent doctor the patient shares their record with sees the test
  order + result timeline, same access-control rule as Epic 1/5.
- **Acceptance criteria:** test result shows which doctor ordered it, when,
  and the result value/date; visible only under the same consent model.

---

## 6. Cross-cutting Requirement: Consent & Access Control

This underpins Epics 1, 5, 8, 13, 14 and is a first-class feature, not an
implementation detail:

- Default state: a doctor sees only what's needed for the current visit
  (name, age, gender, chief complaint, vitals if patient chooses to share
  them at booking).
- Patient explicitly grants "full record access" to a specific doctor,
  either permanently (their regular doctor) or for a single appointment.
- Every access to a patient's shared record by a doctor is logged
  (who/when/what) and visible to the patient as an "access log."
- Patient can revoke access at any time.

## 7. Success Metrics (for the demo/judging)

- End-to-end flow works live: patient signs up → finds a doctor by
  rating/distance/fee → books a slot → sees live queue position → gets
  seen (in person or video) → receives a prescription with reminders → a
  second doctor, with consent, sees the first doctor's notes and test
  order.
- Priority patient visibly gets seen out of strict FIFO order, with a
  visible reason.
- Zero regression in the existing Reception → Doctor → Display flow.

## 8. MVP Scope for the Hackathon Build (recommended)

**Build first (P0, unlocks the demo story):** Epics 5, 6, 12, 3, 4, 2, 7, 9,
10, 1, 8, 14.
**Build if time remains (P1):** Epics 13, 11 (video).
**Cut without regret if short on time:** SMS delivery (use in-app/browser
push only), admin panel, file-upload for lab reports (use structured
value entry instead).

---

*Next document: see `TRD.md` for how each epic maps onto data models, API
endpoints, and services in the existing codebase.*
