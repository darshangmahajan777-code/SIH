# MASTER PROMPT — Use this with Claude (or Claude Code) to Build "MediQueue+"

Copy everything in the box below and paste it as your first message to Claude when you start the build session. It is written so Claude can plan and implement without needing to ask you basic questions — it already contains the product vision, constraints, and your existing codebase context.

---

```
You are acting as a senior full-stack architect and product engineer. I have an
existing production MERN + Python application called "Hospital Queue Management
System" (repo below). I want to evolve it into a full patient-doctor healthcare
platform for a Smart India Hackathon (SIH) submission, called "MediQueue+".

CONTEXT — EXISTING CODEBASE
- Monorepo: /client (React + Vite + Tailwind + Socket.io-client),
  /server (Node.js + Express + Socket.IO + Mongoose/MongoDB, TypeScript-first
  with a JS fallback), /ai (Python FastAPI microservice), /shared (constants).
- Existing Mongo models: Token, DoctorSession, QueueState, EmergencyCase,
  DailySummary.
- Existing routes: tokenRoutes, doctorRoutes, emergencyRoutes, summaryRoutes.
- Existing panels: Reception, Doctor, Display (TV board), Emergency.
- Real-time queue + AI wait-time prediction (Poisson-based) already works.
- Deployment target: Docker Compose today; Vercel (client) + Render/Railway
  (server/AI) for the hosted demo.

GOAL
Add a full patient + doctor experience on top of the existing queue engine,
without breaking what already works. Do not rewrite the existing queue/token/
display system — extend it.

NEW FEATURES TO DESIGN AND IMPLEMENT (treat this as the full scope):
1. Patient medical history record (past conditions, e.g. "COVID-19 last year"),
   stored per patient, visible only to the patient and doctors they've shared
   access with.
2. Doctor recommendation engine ranked by patient-given ratings/reviews.
3. Doctor recommendation ranked by proximity ("nearby doctors") using
   geolocation.
4. Doctor recommendation ranked/filterable by consultation fee.
5. Self-serve patient profile/account (signup, login, edit profile) with
   privacy control over whether medical history is visible to a given doctor.
6. Profile fields: blood group, height, weight, age, gender, allergies,
   emergency contact, etc. — with BMI auto-calculated.
7. Appointment booking: patient books a slot with a specific doctor.
8. Digital prescriptions with medicine reminders — doctor specifies drug,
   dosage, timing (e.g. "2 PM, after meals"), and the app sends the patient
   push/SMS reminders at the right times, for the right duration.
9. Live queue position + estimated time — if a patient is token #31 behind
   30 others, the app gives them a projected appointment time window so they
   don't have to physically wait in the hospital; extend the existing
   AI wait-time service instead of rebuilding it.
10. Priority queuing — critical/emergency patients are queued ahead of
    routine patients, with a clear, auditable priority algorithm (reuse/extend
    the existing EmergencyCase model and priority levels already in Reception).
11. Video consultation for patients who cannot physically visit (WebRTC-based,
    e.g. via a hosted TURN/STUN service).
12. Doctor listing/schedule for a given day (which doctors are available,
    their slots, specialties, fee, ratings).
13. Doctor-issued diet/exercise/lifestyle recommendations tied to a diagnosis
    (structured "care plan" attached to a consultation record, not just
    free-text).
14. Lab/diagnostic test results attached to a patient's record and visible to
    any doctor the patient consults next — e.g. a malaria blood test ordered
    by Doctor A is visible (with date/time) to Doctor B if the patient
    consults them afterward and has shared their record.

PLATFORM PRINCIPLES
- This is a multi-hospital, multi-doctor platform — not tied to one hospital.
  Any patient can use it; any doctor can join it.
- A doctor can only read a patient's full medical data if the patient has
  explicitly shared/granted access for that consultation or doctor —
  implement this as a real consent/access-control model, not just a UI toggle.
- Preserve HIPAA/DPDP-style data-privacy thinking even though this is a
  hackathon project — call this out explicitly in what you build (audit log
  of who accessed a record and when, at minimum).

WHAT I NEED FROM YOU, IN ORDER
1. First, produce a **Product Requirements Document (PRD.md)** covering all
   14 features as epics with user stories, actors, acceptance criteria, and
   MVP-vs-stretch scoping suitable for a hackathon judged over ~36-48 hours
   of build time plus a demo.
2. Then produce a **Technical Requirements Document (TRD.md)** that maps the
   PRD onto the existing stack: new Mongoose schemas (that coexist with the
   existing 5 models), new REST endpoints per module, Socket.IO events to
   add, the FastAPI AI service extensions needed (priority scoring, wait-time
   recalculation, doctor ranking), auth approach (JWT + roles: patient/
   doctor/admin), the access-control/consent model, notification delivery
   (reminders), and the video-call integration.
3. Ask me clarifying questions only if something is genuinely ambiguous or
   would materially change the architecture — otherwise make the reasonable
   hackathon-scoped default choice and state the assumption.
4. Once PRD.md and TRD.md are approved, propose a build order (which modules
   unlock a working demo fastest) and then implement feature-by-feature,
   running the existing app after each module to confirm nothing regresses.

CONSTRAINTS
- Keep the existing tech stack (MERN + FastAPI). Don't introduce a new
  database or rewrite existing services unless there's no reasonable way to
  avoid it — justify it in the TRD if you do.
- Favor libraries/approaches that are fast to demo (e.g. mock SMS/push in dev,
  a lightweight WebRTC wrapper like a hosted service, seeded demo data for
  doctors/ratings) over production-grade infra that would eat hackathon time.
- Everything you design must still let the current Reception → Doctor →
  Display real-time queue flow work as it does today.

Start by producing PRD.md.
```

---

## How to use this

1. Paste the boxed prompt into a **new** Claude conversation (Claude Sonnet 5 or
   Claude Code work well here) with your repo attached or opened in the working
   directory.
2. Let Claude produce `PRD.md`, review/edit it, then say "approved, produce
   TRD.md."
3. Once both are approved, say "start building, module by module" — Claude
   Code can then implement directly against your repo.
4. I've also generated a first-pass **PRD.md** and **TRD.md** for you below/
   alongside this file, scoped to your actual codebase, so you can start from
   a draft immediately instead of from zero.
