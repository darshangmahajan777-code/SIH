# MediQueue+ 🏥
### Smart Hospital OPD Virtual Queue & Digital Care Orchestration Platform

[![Build & Test Status](https://img.shields.io/badge/Tests-111%2F111%20Passed-brightgreen)](https://github.com/)
[![License](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-v20.x-green)](https://nodejs.org/)
[![Python](https://img.shields.io/badge/Python-3.11%2B-blue)](https://python.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-v0.115-teal)](https://fastapi.tiangolo.com/)
[![React](https://img.shields.io/badge/React-v18.x-cyan)](https://reactjs.org/)
[![Vite](https://img.shields.io/badge/Vite-v5.x-purple)](https://vitejs.dev/)
[![Docker](https://img.shields.io/badge/Docker-Compose%20v2-2496ED)](https://docker.com/)

MediQueue+ (HC-01) is a production-grade healthcare platform that eliminates chaotic physical OPD waiting rooms through dynamic AI wait-time estimation, priority-aware virtual queuing, encrypted multi-specialty telemedicine, verified medical history timelines, patient-governed data consent, and continuous post-consultation care plan tracking.

---

## 🏗️ 1. Architecture Overview

MediQueue+ uses a modular microservices architecture designed for resilience and zero-downtime scalability:

```
                                  ┌────────────────────────────────┐
                                  │      Client (React / Vite)     │
                                  │  - Smart Virtual Queue Patient │
                                  │  - Doctor Clinical Workspace   │
                                  │  - Reception / Display Kiosk   │
                                  │  - Telemedicine WebRTC Room    │
                                  └──────────────┬─────────────────┘
                                                 │
                             REST API (JSON)     │     Real-Time Sockets (Socket.IO)
                                                 ▼
                                  ┌────────────────────────────────┐
                                  │   Backend Server (Node/Express)│
                                  │  - Multi-Hospital Gateway      │
                                  │  - Dynamic Triage & Priority   │
                                  │  - Telemedicine Token Signer   │
                                  │  - Deterministic Fallback      │
                                  └───────┬──────────────┬─────────┘
                                          │              │
                   Internal HTTP (350ms)  │              │ Mongoose ODM
                                          ▼              ▼
                    ┌─────────────────────────┐  ┌─────────────────────────┐
                    │ AI Microservice (FastAPI│  │  MongoDB Persistence    │
                    │  - Poisson Wait Time    │  │  - 18 Indexed Schemas   │
                    │  - Bayesian Doctor Rank │  │  - TTL Consent Grants   │
                    │  - Emergency Haversine  │  │  - Audit Access Logs    │
                    └─────────────────────────┘  └─────────────────────────┘
```

---

## ✨ 2. Key Features

1. **Smart Virtual Queue & Dynamic ETA**:
   - Live consultation pacing and time window calculation (e.g. `4:30–4:50 PM`).
   - Automated "Near-Turn" alert when wait time drops below threshold (`<= 15 min`).
   - Resilient deterministic mathematical fallback when AI microservice is unreachable.
2. **Doctor Clinical Workspace**:
   - Integrated single-screen workflow for patient consultation, vitals inspection, history review, test ordering, prescription generation, and follow-up scheduling.
3. **Verified Medical History Timeline**:
   - Chronological patient timeline aggregating diagnoses, lab reports, previous prescriptions, and self-reported health episodes.
4. **Patient-Governed Consent & Audit Logs**:
   - Time-bound (`AccessGrant`) access control with instant one-click revocation.
   - Immutable audit logging (`AccessLog`) tracking every physician record inspection.
5. **Encrypted WebRTC Telemedicine**:
   - Secure peer-to-peer video consultations with cryptographic HMAC session tokens and appointment-scoped signaling rooms.
6. **AI Clinical Decision Support & Doctor Ranking**:
   - Multi-factor Bayesian ranking (rating, distance, fee, hospital tier).
   - Poisson-inspired dynamic wait-time modeling based on real-time consultation duration.
7. **Emergency Hospital Triage**:
   - Condition-based specialty detection and Haversine geospatial proximity routing across regional emergency centers.
8. **Original HC-01 Kiosk Compatibility**:
   - Complete backward compatibility with walk-in reception tokens, physical ticket generation, and TV display waiting boards.
9. **Patient & Doctor/Business Onboarding & Role-Based Routing**:
   - Distinct dual-entry portal: Patient / User vs Doctor / Business.
   - Patient onboarding with health vitals, blood group, allergies, and live BMI.
   - Doctor/Business onboarding with specialty, qualifications, license number, consultation fees, clinic details, services, modes, and working schedule.
   - Cryptographic scrypt password hashing and HMAC-SHA256 JWT sessions.
10. **Doctor / Business Dashboard & Practice Suite**:
   - Integrated practice dashboard aggregating today's appointments, today's patients, current queue, waiting patients, completed consultations, upcoming appointments, notifications, and subscription status.
   - 11 quick actions: Appointments, Queue, Patients, Prescription, Lab Reports, Care Plans, Telemedicine, Staff, Analytics, Business Settings, Subscription.
   - Seamless continuity with the existing queue and Socket.IO engine.

---

## 🛠️ 3. Tech Stack

| Layer | Technologies |
|---|---|
| **Frontend** | React 18, Vite 5, Tailwind CSS, Socket.IO Client, React Router DOM 6, React Hot Toast, Lucide Icons |
| **Backend** | Node.js 20, Express 4, Socket.IO 4, Mongoose 8, Axios, Express Rate Limit, Dotenv |
| **AI Microservice** | Python 3.11+, FastAPI 0.115, Uvicorn, Pydantic v2 |
| **Database & Cache**| MongoDB 7.0 (with 18 query-indexed collections), Redis 7 (optional for multi-instance clustering) |
| **DevOps & Hosting** | Docker, Docker Compose v2, Nginx Alpine, Render, Vercel |

---

## 🚀 4. Local Development Setup

### 4.1 Prerequisites
- **Node.js**: v18+ (v20 Recommended)
- **Python**: v3.11+
- **MongoDB**: Local MongoDB instance (`localhost:27017`) or MongoDB Atlas URI

### 4.2 Clone & Install Dependencies
```bash
# Clone the repository
git clone https://github.com/darshangmahajan777-code/SIH.git
cd SIH

# Install Backend dependencies
cd server
npm install

# Install Frontend dependencies
cd ../client
npm install

# Install AI Microservice dependencies
cd ../ai
pip install -r requirements.txt
cd ..
```

### 4.3 Environment Setup
Copy the provided environment templates:
```bash
# Root template
cp .env.example .env

# Backend server template
cp server/.env.example server/.env

# Frontend client template
cp client/.env.example client/.env

# AI microservice template
cp ai/.env.example ai/.env
```

### 4.4 Database Initialization & Demo Seed
Start your local MongoDB service, then seed the complete Smart India Hackathon (SIH) demonstration dataset:
```bash
cd server
npm run seed:sih
```
> **What this seeds**: Verified hospitals, specialized doctor profiles with active working hours, patient test results, clinical care plans, and active OPD tokens.

---

## 💻 5. Running the Application Locally

Run each service in a separate terminal:

### Terminal 1: Python AI Microservice
```bash
cd ai
uvicorn main:app --host 0.0.0.0 --port 8001 --reload
```
*Health Check*: [http://localhost:8001/health](http://localhost:8001/health)

### Terminal 2: Backend Server (Node.js)
```bash
cd server
npm run dev
```
*API Base*: [http://localhost:5000/api](http://localhost:5000/api)  
*Health Check*: [http://localhost:5000/health](http://localhost:5000/health)

### Terminal 3: Frontend Client (Vite)
```bash
cd client
npm run dev
```
*Web App URL*: [http://localhost:5173](http://localhost:5173) (or `http://localhost:3000`)

---

## 🐳 6. Docker Deployment (Recommended)

Run the entire stack with a single command using Docker Compose:

```bash
# 1. Build and launch all 5 containers (client, server, ai, mongodb, redis)
docker compose up --build -d

# 2. Verify all containers are running and healthy
docker compose ps

# 3. Seed demonstration data inside the running server container
docker compose exec server npm run seed:sih

# 4. View real-time logs
docker compose logs -f
```

### Access Ports in Docker
- **Frontend App**: [http://localhost:3000](http://localhost:3000) (Proxies `/api` and `/socket.io` internally to server)
- **Backend API**: [http://localhost:5000](http://localhost:5000)
- **AI Service**: [http://localhost:8001](http://localhost:8001)
- **MongoDB**: `localhost:27017`

---

## 🧪 7. Automated Testing & Verification

MediQueue+ includes an extensive automated test suite covering integration flows, security boundaries, WebRTC signaling, and deterministic fallback logic:

```bash
# Run complete test suite (96 integration tests across 10 suites)
cd server
npm test

# Check server code syntax
npm run build

# Validate frontend production build
cd ../client
npm run build

# Validate AI Python syntax
cd ../ai
python -m py_compile main.py
```

---

## 🌐 8. Cloud Deployment Overview

Detailed step-by-step production runbooks are provided in the `/docs` directory:
- [Doctor / Business Dashboard Architecture](docs/DOCTOR_BUSINESS_DASHBOARD.md)
- [Patient & Doctor/Business Onboarding & Auth](docs/AUTHENTICATION_AND_ONBOARDING.md)
- [Doctor / Business Platform Audit](docs/DOCTOR_BUSINESS_AUDIT.md)
- [Docker Production Deployment](docs/DOCKER_DEPLOYMENT.md)
- [Production Configuration & Environment Variables](docs/PRODUCTION_CONFIGURATION.md)
- [Deployment Readiness Audit](docs/DEPLOYMENT_READINESS.md)
- [GitHub Release & Launch Checklist](docs/GITHUB_RELEASE_CHECKLIST.md)

### Deployment Targets
- **Frontend**: [Vercel](https://vercel.com) (configured with `client/vercel.json` for SPA rewrites).
- **Backend API**: [Render](https://render.com) (configured with `render.yaml` blueprint).
- **AI Microservice**: [Render Web Service](https://render.com) or containerized VPS.
- **Database**: [MongoDB Atlas](https://www.mongodb.com/atlas) (M0+ replica set).

---

## 👥 9. Safe Demo Accounts & Roles

The seeded demonstration environment provides the following pre-configured personas (Synthetic password for all demo accounts: `demo123`):

| Role | Name | Email (Login ID) | Synthetic Password | Primary Capabilities |
|---|---|---|---|---|
| **Patient** | Rahul Sharma | `patient.demo@mediqueue.test` | `demo123` | Patient hub, appointment tracking, queue ETA, vitals, consent management. |
| **Doctor (Cardiology)**| Dr. Priya Sharma | `dr.priya@mediqueue.test` | `demo123` | Doctor workspace, clinical queue caller, prescriptions, lab orders, telemedicine. |
| **Doctor (Orthopedics)**| Dr. Rajesh Kumar | `dr.rajesh@mediqueue.test` | `demo123` | Specialized orthopedic clinical consultations and cross-hospital care. |
| **Doctor (Pediatrics)** | Dr. Ananya Sen | `dr.ananya@mediqueue.test` | `demo123` | Pediatric clinical practice and telemedicine sessions. |
| **Receptionist** | Suman Verma | `reception.demo@mediqueue.test` | `demo123` | Walk-in OPD token dispatch, queue management, physical ticket printing. |
| **Hospital Admin** | Amit Joshi | `admin.demo@mediqueue.test` | `demo123` | Hospital-wide oversight, doctor scheduling, and multi-hospital management. |

---

## 🎬 10. The 25-Step SIH Demonstration Story Flow

For hackathon judges and evaluators, the complete end-to-end patient journey can be experienced using the following flow:

1. **Patient Registration & Vitals**: Access the Unified Patient Dashboard (`/patient-dashboard`), record vitals, and view profile completion.
2. **Doctor Discovery & Ranking**: Search doctors (`/find-doctors`) with AI multi-criteria ranking (fee, distance, rating).
3. **Appointment Booking**: Select Dr. Priya Sharma, choose an active date/time slot, and confirm the booking.
4. **Consent Grant**: Patient proactively grants clinical records access to Dr. Priya Sharma (`/consent`).
5. **Queue Token Issuance**: On appointment day, a virtual queue token is generated.
6. **Smart Virtual Queue ETA**: Patient leaves hospital waiting room; sees dynamic time window (`4:30–4:50 PM`) and recommended arrival time (`4:15 PM`).
7. **Real-time Queue Progression**: Doctor calls preceding patients; Socket.IO updates patient position live.
8. **Near-Turn Alert**: When 5 or fewer patients remain ahead, automated Near-Turn notification triggers.
9. **Patient Returns**: Patient arrives at OPD consultation room just in time.
10. **Doctor Workspace & Encrypted Encounter**: Doctor opens `/doctor-workspace`, reviews authorized historical records, orders tests, issues prescriptions with dosage schedules, creates a lifestyle care plan, and completes consultation.
11. **Continuous Care & Telemedicine**: Patient receives real-time medicine reminders, reviews care plan, and launches follow-up video consultation (`/telemedicine/:appointmentId`).

---

## 📄 License

This project is licensed under the MIT License — see the [LICENSE](LICENSE) file for details.
