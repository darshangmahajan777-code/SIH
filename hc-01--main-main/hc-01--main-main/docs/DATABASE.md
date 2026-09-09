# MediQueue+ Database Architecture & Schema Reference

**Database Engine:** MongoDB 6.0+  
**Data Modeling Layer:** Mongoose 7.x ODM  
**Design Paradigm:** Relational references for sovereign patient entities; embedded subdocuments for immutable event telemetry.

---

## 1. Entity-Relationship Overview

```
 [Hospital] 1 ──── n [DoctorProfile] 1 ──── n [Appointment] n ──── 1 [User (Patient)]
                            │                         │                     │
                            │                         ├── 1 [Token]         ├── n [AccessGrant]
                            │                         │                     ├── n [AccessLog]
                            ▼                         ▼                     ├── n [MedicalHistory]
                    [DoctorSession]            [Telemedicine]               ├── n [TestOrder]
                                                                            ├── n [Prescription]
                                                                            └── n [CarePlan]
```

---

## 2. Complete Collections & Schema Specifications

### 2.1 `hospitals` (`Hospital.js`)
Represents registered multi-specialty healthcare institutions.
```javascript
{
  name: { type: String, required: true },
  address: { type: String, required: true },
  location: {
    lat: { type: Number, required: true },
    lng: { type: Number, required: true }
  },
  contactPhone: { type: String },
  emergencyPhone: { type: String },
  departments: [{ type: String }], // e.g. ['Cardiology', 'OPD']
  isVerified: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now }
}
```

### 2.2 `doctorprofiles` (`DoctorProfile.js`)
Stores clinician professional context, rating metrics, working hours, and hospital linkage.
```javascript
{
  userId: { type: Schema.Types.ObjectId, ref: 'User' },
  doctorName: { type: String, required: true },
  specialty: { type: String, required: true },
  hospitalId: { type: Schema.Types.ObjectId, ref: 'Hospital' },
  hospitalName: { type: String, required: true },
  location: { type: String },
  consultationFee: { type: Number, default: 500 },
  avgRating: { type: Number, default: 4.5 },
  ratingCount: { type: Number, default: 0 },
  slotDurationMinutes: { type: Number, default: 15 },
  workingHours: {
    start: { type: String, default: '09:00' },
    end: { type: String, default: '17:00' }
  },
  breaks: [{ start: String, end: String, label: String }],
  leaves: [{ date: String, reason: String }],
  isActive: { type: Boolean, default: true }
}
```

### 2.3 `appointments` (`Appointment.js`)
Manages outpatient slot bookings with strict double-booking prevention.
```javascript
{
  patientId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  doctorId: { type: Schema.Types.ObjectId, ref: 'DoctorProfile', required: true },
  date: { type: String, required: true },       // YYYY-MM-DD
  slotTime: { type: String, required: true },   // HH:mm
  mode: { type: String, enum: ['in-person', 'video'], default: 'in-person' },
  status: { type: String, enum: ['booked', 'checked-in', 'in-progress', 'completed', 'cancelled'], default: 'booked' },
  chiefComplaint: { type: String },
  priority: { type: String, enum: ['low', 'normal', 'urgent', 'emergency'], default: 'normal' },
  tokenId: { type: Schema.Types.ObjectId, ref: 'Token' }
}
```
**Concurrency Guard Index:**  
`{ doctorId: 1, date: 1, slotTime: 1 }` with partial filter expression `{ status: { $in: ['booked', 'checked-in', 'in-progress'] } }` guarantees slot uniqueness.

### 2.4 `tokens` (`Token.js`)
Original HC-01 core queue entity representing daily outpatient tokens.
```javascript
{
  tokenNumber: { type: Number, required: true },
  patientName: { type: String, required: true },
  patientPhone: { type: String },
  department: { type: String, default: 'General' },
  sessionDate: { type: String, required: true },
  status: { type: String, enum: ['waiting', 'in-progress', 'done', 'cancelled'], default: 'waiting' },
  priority: { type: String, enum: ['low', 'normal', 'urgent', 'critical'], default: 'normal' },
  isEmergency: { type: Boolean, default: false },
  estimatedWaitMinutes: { type: Number, default: 0 },
  consultationDuration: { type: Number, default: 0 },
  issuedAt: { type: Date, default: Date.now },
  calledAt: { type: Date },
  completedAt: { type: Date }
}
```

### 2.5 `accessgrants` & `accesslogs` (`AccessGrant.js`, `AccessLog.js`)
Sovereign consent tracking and immutable security audit trails.
```javascript
// AccessGrant:
{
  patientId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  doctorId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  scope: { type: String, enum: ['full', 'history', 'tests', 'prescriptions', 'care_plans'], default: 'full' },
  status: { type: String, enum: ['active', 'revoked'], default: 'active' },
  grantedAt: { type: Date, default: Date.now },
  revokedAt: { type: Date }
}

// AccessLog:
{
  patientId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  doctorId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  resource: { type: String, required: true }, // e.g. 'medical_history', 'test_results'
  action: { type: String, enum: ['read', 'write', 'grant', 'revoke'], default: 'read' },
  accessedAt: { type: Date, default: Date.now }
}
```

### 2.6 `medicalhistories`, `testorders`, `prescriptions`, `careplans`
Clinical artifacts generated during outpatient encounters.
- **`MedicalHistory`**: `condition`, `conditionDate`, `source` (`self_reported` vs `doctor_verified`), `doctorName`.
- **`TestOrder`**: `testName`, `reason`, `status` (`ordered`, `completed`), `result: { value, unit, referenceRange }`, `labName`.
- **`Prescription`**: `medications: [{ medicineName, dosage, frequency, doseTimes, mealRelation, durationDays }]`, `status: 'active'`.
- **`CarePlan`**: `diagnosis`, `dietRecommended[]`, `dietRestricted[]`, `activitiesRecommended[]`, `activitiesRestricted[]`, `followUpDate`.

---

## 3. Database Indexes & Query Performance Plan

| Collection | Indexed Fields | Purpose |
|---|---|---|
| `appointments` | `{ doctorId: 1, date: 1, slotTime: 1 }` | Uniqueness & instant availability lookups (< 5 ms) |
| `appointments` | `{ patientId: 1, date: 1 }` | Patient dashboard aggregation speedup |
| `tokens` | `{ sessionDate: 1, status: 1, tokenNumber: 1 }` | Real-time queue ordering & display boards |
| `accessgrants` | `{ patientId: 1, doctorId: 1, status: 1 }` | Zero-trust consent verification check |
| `accesslogs` | `{ patientId: 1, accessedAt: -1 }` | Audit log pagination |
| `notifications` | `{ recipient: 1, read: 1, createdAt: -1 }` | Unread badge counts (< 2 ms) |
| `doctorprofiles`| `{ specialty: 1, avgRating: -1 }` | Doctor discovery filtering |

---

## 4. Seeding Commands

- **Master SIH Demo Seed:** `npm run seed:sih` (in `server/`)
- **Doctor Directory Seed:** `npm run seed:doctors` (in `server/`)
- **Clean Reset & Wipe:** `node scripts/seedSihDemo.js`
