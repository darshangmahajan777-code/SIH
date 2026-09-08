import mongoose from 'mongoose';
import dotenv from 'dotenv';
import connectDB from '../config/database.js';
import User from '../models/User.js';
import DoctorProfile from '../models/DoctorProfile.js';
import Appointment from '../models/Appointment.js';
import Rating from '../models/Rating.js';

dotenv.config();

const seedDoctors = async () => {
  try {
    await connectDB();
    console.log('Connected to DB for seeding...');

    // Clear existing seeded doctor profiles and appointments
    await DoctorProfile.deleteMany({});
    await Appointment.deleteMany({});
    await Rating.deleteMany({});

    // Create a demo patient user
    let patient = await User.findOne({ email: 'patient.demo@mediqueue.test' });
    if (!patient) {
      patient = await User.create({
        name: 'Rahul Sharma (Patient)',
        email: 'patient.demo@mediqueue.test',
        role: 'patient',
        phone: '+91-9876543210',
      });
    }

    const doctorsData = [
      {
        doctorName: 'Priya Sharma',
        email: 'dr.priya@mediqueue.test',
        specialty: 'Cardiology',
        qualifications: ['MBBS', 'MD (Cardiology)', 'DM'],
        experienceYears: 12,
        hospitalName: 'AIIMS Super Specialty',
        location: { lat: 28.5672, lng: 77.2100, address: 'Ansari Nagar, New Delhi' },
        consultationFee: 600,
        followUpFee: 400,
        avgRating: 4.8,
        ratingCount: 500, // Established high-volume doctor
        slotDuration: 30,
        videoEnabled: true,
        isAvailableToday: true,
      },
      {
        doctorName: 'Rajesh Kumar',
        email: 'dr.rajesh@mediqueue.test',
        specialty: 'Cardiology',
        qualifications: ['MBBS', 'MD'],
        experienceYears: 3,
        hospitalName: 'City Heart Clinic',
        location: { lat: 28.6200, lng: 77.2100, address: 'Connaught Place, New Delhi' },
        consultationFee: 500,
        followUpFee: 300,
        avgRating: 5.0,
        ratingCount: 2, // New doctor with 2 perfect reviews (Bayesian test case!)
        slotDuration: 30,
        videoEnabled: false,
        isAvailableToday: true,
      },
      {
        doctorName: 'Ananya Gupta',
        email: 'dr.ananya@mediqueue.test',
        specialty: 'Neurology',
        qualifications: ['MBBS', 'MD', 'DNB (Neurology)'],
        experienceYears: 15,
        hospitalName: 'Max Super Specialty Hospital',
        location: { lat: 28.5245, lng: 77.2066, address: 'Saket, South Delhi' },
        consultationFee: 800,
        followUpFee: 500,
        avgRating: 4.9,
        ratingCount: 340,
        slotDuration: 30,
        videoEnabled: true,
        isAvailableToday: true,
      },
      {
        doctorName: 'Vikram Singh',
        email: 'dr.vikram@mediqueue.test',
        specialty: 'Orthopedics',
        qualifications: ['MBBS', 'MS (Ortho)', 'Fellow Joint Replacement'],
        experienceYears: 10,
        hospitalName: 'Apollo Hospitals',
        location: { lat: 28.5500, lng: 77.2500, address: 'Sarita Vihar, South Delhi' },
        consultationFee: 700,
        followUpFee: 400,
        avgRating: 4.7,
        ratingCount: 215,
        slotDuration: 30,
        videoEnabled: true,
        isAvailableToday: true,
      },
      {
        doctorName: 'Sneha Patel',
        email: 'dr.sneha@mediqueue.test',
        specialty: 'Pediatrics',
        qualifications: ['MBBS', 'DCH', 'MD (Pediatrics)'],
        experienceYears: 8,
        hospitalName: 'Fortis Child Care',
        location: { lat: 28.5700, lng: 77.3200, address: 'Sector 62, Noida' },
        consultationFee: 500,
        followUpFee: 350,
        avgRating: 4.85,
        ratingCount: 420,
        slotDuration: 20,
        videoEnabled: true,
        isAvailableToday: true,
      },
      {
        doctorName: 'Amit Joshi',
        email: 'dr.amit@mediqueue.test',
        specialty: 'General Medicine',
        qualifications: ['MBBS', 'MD (Internal Medicine)'],
        experienceYears: 6,
        hospitalName: 'Safdarjung Hospital OPD',
        location: { lat: 28.5700, lng: 77.2000, address: 'Ring Road, New Delhi' },
        consultationFee: 350,
        followUpFee: 200,
        avgRating: 4.6,
        ratingCount: 180,
        slotDuration: 15,
        videoEnabled: false,
        isAvailableToday: true,
        // Demonstration leave: on leave for 2 days next week
        leaves: [
          {
            startDate: new Date(Date.now() + 86400000 * 3),
            endDate: new Date(Date.now() + 86400000 * 5),
            reason: 'Annual Medical Conference',
          },
        ],
      },
    ];

    for (const d of doctorsData) {
      let user = await User.findOne({ email: d.email });
      if (!user) {
        user = await User.create({
          name: `Dr. ${d.doctorName}`,
          email: d.email,
          role: 'doctor',
          phone: '+91-9123456789',
        });
      }

      await DoctorProfile.create({
        userId: user._id,
        doctorName: d.doctorName,
        specialty: d.specialty,
        qualifications: d.qualifications,
        experienceYears: d.experienceYears,
        hospitalName: d.hospitalName,
        location: d.location,
        consultationFee: d.consultationFee,
        followUpFee: d.followUpFee,
        avgRating: d.avgRating,
        ratingCount: d.ratingCount,
        slotDuration: d.slotDuration,
        videoEnabled: d.videoEnabled,
        isAvailableToday: d.isAvailableToday,
        leaves: d.leaves || [],
      });
    }

    console.log(`Seeded ${doctorsData.length} doctors successfully!`);
    process.exit(0);
  } catch (err) {
    console.error('Seeding failed:', err);
    process.exit(1);
  }
};

if (process.argv[1].endsWith('seedDoctors.js')) {
  seedDoctors();
}

export default seedDoctors;
