import mongoose from 'mongoose';
import dotenv from 'dotenv';
import connectDB from '../config/database.js';
import User from '../models/User.js';
import DoctorProfile from '../models/DoctorProfile.js';
import Appointment from '../models/Appointment.js';
import Token from '../models/Token.js';
import QueueState from '../models/QueueState.js';
import MedicalHistory from '../models/MedicalHistory.js';
import TestOrder from '../models/TestOrder.js';
import Prescription from '../models/Prescription.js';
import CarePlan from '../models/CarePlan.js';
import AccessGrant from '../models/AccessGrant.js';
import Notification from '../models/Notification.js';
import Hospital from '../models/Hospital.js';

dotenv.config();

export const SIH_DEMO_IDS = {
  hospitalAIIMS: new mongoose.Types.ObjectId('65f000000000000000000010'),
  hospitalSafdarjung: new mongoose.Types.ObjectId('65f000000000000000000011'),
  hospitalFortis: new mongoose.Types.ObjectId('65f000000000000000000012'),
  patientId: new mongoose.Types.ObjectId('65f000000000000000000001'),
  doctorAUserId: new mongoose.Types.ObjectId('65f000000000000000000020'),
  doctorAProfileId: new mongoose.Types.ObjectId('65f000000000000000000002'),
  doctorBUserId: new mongoose.Types.ObjectId('65f000000000000000000030'),
  doctorBProfileId: new mongoose.Types.ObjectId('65f000000000000000000003'),
  doctorCUserId: new mongoose.Types.ObjectId('65f000000000000000000040'),
  doctorCProfileId: new mongoose.Types.ObjectId('65f000000000000000000004'),
  receptionistId: new mongoose.Types.ObjectId('65f000000000000000000050'),
  adminId: new mongoose.Types.ObjectId('65f000000000000000000060'),
  appointmentId: new mongoose.Types.ObjectId('65f000000000000000000099'),
  token31Id: new mongoose.Types.ObjectId('65f000000000000000000031'),
};

export async function seedSihDemoData() {
  const todayStr = new Date().toISOString().slice(0, 10);
  const dayOfWeek = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'][new Date().getDay()];
  console.log(`\n🏥 Seeding Complete MediQueue+ Smart India Hackathon Dataset for Date: ${todayStr}...`);

  // 1. Clean previous demo records
  await Promise.all([
    Hospital.deleteMany({ _id: { $in: [SIH_DEMO_IDS.hospitalAIIMS, SIH_DEMO_IDS.hospitalSafdarjung, SIH_DEMO_IDS.hospitalFortis] } }),
    User.deleteMany({
      _id: {
        $in: [
          SIH_DEMO_IDS.patientId,
          SIH_DEMO_IDS.doctorAUserId,
          SIH_DEMO_IDS.doctorBUserId,
          SIH_DEMO_IDS.doctorCUserId,
          SIH_DEMO_IDS.receptionistId,
          SIH_DEMO_IDS.adminId,
        ],
      },
    }),
    DoctorProfile.deleteMany({
      _id: {
        $in: [
          SIH_DEMO_IDS.doctorAProfileId,
          SIH_DEMO_IDS.doctorBProfileId,
          SIH_DEMO_IDS.doctorCProfileId,
        ],
      },
    }),
    Appointment.deleteMany({ date: todayStr }),
    Token.deleteMany({ sessionDate: todayStr }),
    QueueState.deleteMany({ date: todayStr }),
    MedicalHistory.deleteMany({ patientId: SIH_DEMO_IDS.patientId }),
    TestOrder.deleteMany({ patientId: SIH_DEMO_IDS.patientId }),
    Prescription.deleteMany({ patientId: SIH_DEMO_IDS.patientId }),
    CarePlan.deleteMany({ patientId: SIH_DEMO_IDS.patientId }),
    AccessGrant.deleteMany({ patientId: SIH_DEMO_IDS.patientId }),
    Notification.deleteMany({ recipient: SIH_DEMO_IDS.patientId }),
  ]);

  // 2. Multiple Hospitals Creation
  const hospitals = await Hospital.insertMany([
    {
      _id: SIH_DEMO_IDS.hospitalAIIMS,
      name: 'AIIMS Super Specialty Hospital',
      code: 'AIIMS-DEL',
      address: {
        street: 'Ansari Nagar, Ring Road',
        city: 'New Delhi',
        state: 'Delhi',
        pincode: '110029',
        fullAddress: 'Ansari Nagar, Ring Road, New Delhi, Delhi 110029',
      },
      location: { lat: 28.5672, lng: 77.2100 },
      contact: { phone: '+91-11-26588500', email: 'opd@aiims.edu.in', emergencyHelpline: '102' },
      departments: ['OPD', 'Cardiology', 'Neurology', 'Orthopedics', 'Pediatrics', 'General Medicine'],
      verificationStatus: 'verified',
      totalBeds: 2500,
      facilities: ['Emergency 24x7', 'ICU', 'Telemedicine', 'Smart Virtual Queue', 'Digital Lab'],
      isActive: true,
    },
    {
      _id: SIH_DEMO_IDS.hospitalSafdarjung,
      name: 'Safdarjung Multi-Specialty Hospital',
      code: 'SJD-DEL',
      address: {
        street: 'Sri Aurobindo Marg',
        city: 'New Delhi',
        state: 'Delhi',
        pincode: '110029',
        fullAddress: 'Sri Aurobindo Marg, Safdarjung Enclave, New Delhi 110029',
      },
      location: { lat: 28.5700, lng: 77.2080 },
      contact: { phone: '+91-11-26165060', email: 'contact@safdarjung.gov.in', emergencyHelpline: '102' },
      departments: ['OPD', 'Emergency', 'Cardiology', 'Pediatrics', 'General Medicine'],
      verificationStatus: 'verified',
      totalBeds: 1800,
      facilities: ['24x7 Trauma Center', 'Digital OPD', 'Smart Pharmacy'],
      isActive: true,
    },
    {
      _id: SIH_DEMO_IDS.hospitalFortis,
      name: 'Fortis Escorts Heart Institute',
      code: 'FEHI-DEL',
      address: {
        street: 'Okhla Road',
        city: 'New Delhi',
        state: 'Delhi',
        pincode: '110025',
        fullAddress: 'Okhla Road, Sukhdev Vihar, New Delhi 110025',
      },
      location: { lat: 28.5600, lng: 77.2800 },
      contact: { phone: '+91-11-47135000', email: 'info@fortis.com', emergencyHelpline: '105010' },
      departments: ['Cardiology', 'Cardiac Surgery', 'Critical Care', 'OPD'],
      verificationStatus: 'verified',
      totalBeds: 310,
      facilities: ['Advanced Cath Lab', 'Telemedicine Suite', 'Cardiac ICU'],
      isActive: true,
    },
  ]);

  // 3. Demo User Accounts (Synthetic credentials: password 'demo123')
  const users = await User.insertMany([
    {
      _id: SIH_DEMO_IDS.patientId,
      name: 'Rahul Sharma (Demo Patient)',
      email: 'patient.demo@mediqueue.test',
      phone: '+91-9876543210',
      role: 'patient',
      age: 32,
      gender: 'male',
      bloodGroup: 'O+',
      height: 175,
      weight: 70,
      allergies: ['Penicillin', 'Sulfa drugs'],
      emergencyContact: { name: 'Pooja Sharma', phone: '+91-9876500000', relation: 'Spouse' },
    },
    {
      _id: SIH_DEMO_IDS.doctorAUserId,
      name: 'Dr. Priya Sharma (Demo Doctor A)',
      email: 'dr.priya@mediqueue.test',
      phone: '+91-9123456789',
      role: 'doctor',
      hospitalId: SIH_DEMO_IDS.hospitalAIIMS,
    },
    {
      _id: SIH_DEMO_IDS.doctorBUserId,
      name: 'Dr. Rajesh Kumar (Demo Doctor B)',
      email: 'dr.rajesh@mediqueue.test',
      phone: '+91-9123456780',
      role: 'doctor',
      hospitalId: SIH_DEMO_IDS.hospitalSafdarjung,
    },
    {
      _id: SIH_DEMO_IDS.doctorCUserId,
      name: 'Dr. Ananya Sen (Pediatrics)',
      email: 'dr.ananya@mediqueue.test',
      phone: '+91-9123456781',
      role: 'doctor',
      hospitalId: SIH_DEMO_IDS.hospitalSafdarjung,
    },
    {
      _id: SIH_DEMO_IDS.receptionistId,
      name: 'Suman Verma (Demo Receptionist)',
      email: 'reception.demo@mediqueue.test',
      phone: '+91-9811122233',
      role: 'receptionist',
      hospitalId: SIH_DEMO_IDS.hospitalAIIMS,
    },
    {
      _id: SIH_DEMO_IDS.adminId,
      name: 'Amit Joshi (Demo Hospital Admin)',
      email: 'admin.demo@mediqueue.test',
      phone: '+91-9844455566',
      role: 'hospital_admin',
      hospitalId: SIH_DEMO_IDS.hospitalAIIMS,
    },
  ]);

  // 4. Multiple Doctor Profiles with Distinct Schedules & Specializations
  const weeklyScheduleStandard = [
    'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'
  ].map((day) => ({
    day,
    isWorking: true,
    startTime: '09:00',
    endTime: '17:00',
    breaks: [{ startTime: '13:00', endTime: '14:00', reason: 'Lunch Break' }],
    videoEnabled: true,
  }));

  const doctors = await DoctorProfile.insertMany([
    {
      _id: SIH_DEMO_IDS.doctorAProfileId,
      userId: SIH_DEMO_IDS.doctorAUserId,
      doctorName: 'Dr. Priya Sharma',
      specialty: 'Cardiology',
      qualifications: ['MBBS', 'MD (Cardiology)', 'DM'],
      experienceYears: 12,
      hospitalName: 'AIIMS Super Specialty Hospital',
      hospitalId: SIH_DEMO_IDS.hospitalAIIMS,
      verificationStatus: 'verified',
      location: { lat: 28.5672, lng: 77.2100, address: 'Cardiology Block, Room 204' },
      consultationFee: 600,
      followUpFee: 400,
      avgRating: 4.8,
      ratingCount: 500,
      slotDuration: 30,
      weeklySchedule: weeklyScheduleStandard,
      videoEnabled: true,
      isAvailableToday: true,
    },
    {
      _id: SIH_DEMO_IDS.doctorBProfileId,
      userId: SIH_DEMO_IDS.doctorBUserId,
      doctorName: 'Dr. Rajesh Kumar',
      specialty: 'Cardiology',
      qualifications: ['MBBS', 'MD'],
      experienceYears: 4,
      hospitalName: 'Safdarjung Multi-Specialty Hospital',
      hospitalId: SIH_DEMO_IDS.hospitalSafdarjung,
      verificationStatus: 'verified',
      location: { lat: 28.5700, lng: 77.2080, address: 'OPD Block B, Room 102' },
      consultationFee: 500,
      followUpFee: 300,
      avgRating: 5.0,
      ratingCount: 2, // Low review count for Bayesian comparison
      slotDuration: 30,
      weeklySchedule: weeklyScheduleStandard,
      videoEnabled: false,
      isAvailableToday: true,
    },
    {
      _id: SIH_DEMO_IDS.doctorCProfileId,
      userId: SIH_DEMO_IDS.doctorCUserId,
      doctorName: 'Dr. Ananya Sen',
      specialty: 'Pediatrics',
      qualifications: ['MBBS', 'DCH', 'DNB (Pediatrics)'],
      experienceYears: 9,
      hospitalName: 'Safdarjung Multi-Specialty Hospital',
      hospitalId: SIH_DEMO_IDS.hospitalSafdarjung,
      verificationStatus: 'verified',
      location: { lat: 28.5700, lng: 77.2080, address: 'Pediatric Wing, Room 05' },
      consultationFee: 450,
      followUpFee: 300,
      avgRating: 4.9,
      ratingCount: 180,
      slotDuration: 20,
      weeklySchedule: weeklyScheduleStandard,
      videoEnabled: true,
      isAvailableToday: true,
    },
  ]);

  // 5. Synthetic Medical History Timeline (Prior Year COVID-19 + Verified Hypertension)
  await MedicalHistory.insertMany([
    {
      patientId: SIH_DEMO_IDS.patientId,
      condition: 'COVID-19',
      conditionDate: '2025-05-14',
      notes: 'Synthetic Record: Moderate symptoms, isolated 10 days at home. Fully recovered with no persistent respiratory deficits.',
      source: 'self_reported',
      doctorId: null,
      isActive: true,
    },
    {
      patientId: SIH_DEMO_IDS.patientId,
      condition: 'Mild Hypertension (Stage 1)',
      conditionDate: '2025-11-10',
      notes: 'Synthetic Record: Routine health checkup. Blood pressure recorded at 138/88 mmHg. Advised dietary sodium reduction.',
      source: 'doctor_verified',
      doctorId: SIH_DEMO_IDS.doctorAProfileId,
      doctorName: 'Dr. Priya Sharma',
      isActive: true,
    },
  ]);

  // 6. Diagnostic Lab Test Order & Completed Result
  const testOrder = await TestOrder.create({
    patientId: SIH_DEMO_IDS.patientId,
    doctorId: SIH_DEMO_IDS.doctorAProfileId,
    doctorName: 'Dr. Priya Sharma',
    testName: 'Complete Blood Count & Lipid Profile',
    reason: 'Synthetic Record: Cardiovascular risk assessment & annual health checkup',
    status: 'completed',
    result: {
      value: 'Total Cholesterol: 185 mg/dL (Normal <200), Triglycerides: 130 mg/dL, HDL: 48 mg/dL, Hemoglobin: 14.8 g/dL',
      unit: 'mg/dL',
      labName: 'Central Pathology Laboratory - AIIMS',
      resultDate: new Date(),
      notes: 'All lipid and hematology markers are within safe synthetic baseline ranges.',
      reportFile: {
        fileId: 'rep-sih-demo-001',
        fileName: 'lipid_cbc_report_rahul_sharma.pdf',
        mimeType: 'application/pdf',
        fileSize: 2048,
      },
    },
    completedAt: new Date(),
  });

  // 7. Active Digital Prescription with Dose Times
  const prescription = await Prescription.create({
    patientId: SIH_DEMO_IDS.patientId,
    doctorId: SIH_DEMO_IDS.doctorAProfileId,
    doctorName: 'Dr. Priya Sharma',
    diagnosis: 'Mild Hypertension with Normal Lipid Profile',
    status: 'active',
    medications: [
      {
        medicineName: 'Amlodipine',
        dosage: '5mg',
        frequency: 'Once daily',
        doseTimes: ['09:00'],
        mealRelation: 'after_meal',
        durationDays: 30,
        instructions: 'Take one tablet every morning after breakfast.',
      },
      {
        medicineName: 'Amoxicillin',
        dosage: '500mg',
        frequency: 'Once daily',
        doseTimes: ['14:00'], // 2 PM
        mealRelation: 'after_meal',
        durationDays: 7,
        instructions: 'Take after lunch. Complete the full 7-day course.',
      },
    ],
    instructions: 'Monitor blood pressure once weekly. Maintain regular hydration and balanced diet.',
  });

  // 8. Active Structured Care Plan
  const carePlan = await CarePlan.create({
    patientId: SIH_DEMO_IDS.patientId,
    doctorId: SIH_DEMO_IDS.doctorAProfileId,
    doctorName: 'Dr. Priya Sharma',
    diagnosis: 'Cardiovascular Wellness & Hypertension Control',
    status: 'active',
    dietRecommended: [
      'Low sodium DASH diet (less than 2g sodium daily)',
      '2.5 to 3.0 liters of water daily',
      'High potassium vegetables (spinach, broccoli, sweet potatoes)',
    ],
    dietRestricted: [
      'Processed snacks, salted chips, and commercial pickles',
      'Deep fried foods and saturated trans fats',
      'Excessive caffeine (>2 cups daily)',
    ],
    activitiesRecommended: [
      '30 minutes brisk walking 5 days a week',
      'Gentle morning yoga or breathing exercises (Pranayama)',
    ],
    activitiesRestricted: [
      'Heavy competitive weightlifting without prior cardiovascular warmup',
    ],
    followUpDate: new Date(Date.now() + 14 * 86400000),
    notes: 'Return in 2 weeks for follow-up evaluation or earlier if experiencing headaches or dizziness.',
  });

  // 9. Queue State & 30 Waiting Tokens Ahead of Patient
  await QueueState.create({
    date: todayStr,
    department: 'OPD',
    currentTokenNumber: 31,
    totalTokensIssued: 31,
    waitingCount: 31,
  });

  const tokensBatch = [];
  for (let i = 1; i <= 30; i++) {
    tokensBatch.push({
      tokenNumber: i,
      patientName: `Waiting Patient #${i}`,
      age: 20 + (i % 50),
      condition: i % 7 === 0 ? 'Chest Discomfort' : 'General Health Review',
      priority: i % 10 === 0 ? 'emergency' : i % 5 === 0 ? 'senior' : 'general',
      priorityScore: i % 10 === 0 ? 95 : 25,
      department: 'OPD',
      status: 'waiting',
      sessionDate: todayStr,
      estimatedWaitTime: (i - 1) * 8,
      createdAt: new Date(Date.now() - (31 - i) * 60000),
    });
  }
  await Token.insertMany(tokensBatch);

  // 10. Critical Demo: Token #31 for Rahul Sharma
  const token31 = await Token.create({
    _id: SIH_DEMO_IDS.token31Id,
    tokenNumber: 31,
    patientName: 'Rahul Sharma',
    age: 32,
    condition: 'Cardiac Evaluation & Follow-up',
    priority: 'routine',
    priorityScore: 25,
    department: 'OPD',
    status: 'waiting',
    sessionDate: todayStr,
    estimatedWaitTime: 40,
    createdAt: new Date(),
  });

  // 11. Confirmed Appointment Linked to Token #31
  const appointment = await Appointment.create({
    _id: SIH_DEMO_IDS.appointmentId,
    doctorId: SIH_DEMO_IDS.doctorAProfileId,
    patientId: SIH_DEMO_IDS.patientId,
    hospitalId: SIH_DEMO_IDS.hospitalAIIMS,
    date: todayStr,
    slotTime: '16:30',
    mode: 'in-person',
    priority: 'routine',
    status: 'checked-in',
    tokenId: token31._id,
    chiefComplaint: 'Follow-up on blood pressure regulation and chest tightness.',
  });

  // 12. Active Access Grant to Doctor A (Attending Cardiologist)
  await AccessGrant.create({
    patientId: SIH_DEMO_IDS.patientId,
    doctorId: SIH_DEMO_IDS.doctorAUserId,
    scope: 'ongoing',
    grantedAt: new Date(),
    grantedBy: SIH_DEMO_IDS.patientId,
    note: 'Authorized attending cardiologist for ongoing treatment and dossier review.',
  });

  console.log(`\n=============================================================`);
  console.log(`✅ SMART INDIA HACKATHON SYNTHETIC DATA SEEDED SUCCESSFULLY!`);
  console.log(`=============================================================`);
  console.log(`HOSPITALS:`);
  console.log(`  1. AIIMS Super Specialty Hospital (ID: ${SIH_DEMO_IDS.hospitalAIIMS})`);
  console.log(`  2. Safdarjung Multi-Specialty Hospital (ID: ${SIH_DEMO_IDS.hospitalSafdarjung})`);
  console.log(`  3. Fortis Escorts Heart Institute (ID: ${SIH_DEMO_IDS.hospitalFortis})`);
  console.log(`\nDEMO USERS & SYNTHETIC CREDENTIALS:`);
  console.log(`  • Patient:      patient.demo@mediqueue.test     (Role: patient)`);
  console.log(`  • Doctor A:     dr.priya@mediqueue.test         (Role: doctor - AIIMS Cardiology)`);
  console.log(`  • Doctor B:     dr.rajesh@mediqueue.test        (Role: doctor - Safdarjung Cardiology)`);
  console.log(`  • Doctor C:     dr.ananya@mediqueue.test        (Role: doctor - Safdarjung Pediatrics)`);
  console.log(`  • Receptionist: reception.demo@mediqueue.test   (Role: receptionist)`);
  console.log(`  • Admin:        admin.demo@mediqueue.test       (Role: hospital_admin)`);
  console.log(`  • Password:     demo123                         (Synthetic for all demo accounts)`);
  console.log(`\nCRITICAL QUEUE METRICS:`);
  console.log(`  • Active Token: TOKEN #31 (Rahul Sharma) with 30 patients ahead`);
  console.log(`  • Target ETA:   4:30–4:50 PM (Recommended Arrival: 4:15 PM)`);
  console.log(`  • Clinical:     COVID-19 (2025), Hypertension (2025), Lipid Profile Result,`);
  console.log(`                  Prescription with 2 PM dose, DASH Care Plan, Doctor A Grant.`);
  console.log(`=============================================================\n`);

  return { hospitals, users, doctors, token31, appointment, testOrder, prescription, carePlan };
}

if (process.argv[1]?.endsWith('seedSihDemo.js')) {
  connectDB()
    .then((conn) => {
      if (!conn || mongoose.connection.readyState !== 1) {
        console.warn('⚠️ MongoDB is not active locally. Demo dataset will be seeded automatically when server connects to MongoDB.');
        process.exit(0);
      }
      return seedSihDemoData();
    })
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Seeding failed:', err.message);
      process.exit(1);
    });
}
