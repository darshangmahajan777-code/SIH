import express from 'express';
import {
  registerPatient,
  registerDoctorBusiness,
  loginUser,
  getCurrentUser,
} from '../services/authService.js';
import { authenticateUser } from '../middleware/auth.js';
import { asyncHandler, AppError } from '../middleware/errorHandler.js';

const router = express.Router();

/**
 * @route   POST /api/auth/patient/signup
 * @desc    Register a new patient
 * @access  Public
 */
router.post(
  '/patient/signup',
  asyncHandler(async (req, res) => {
    const result = await registerPatient(req.body);
    res.status(201).json({
      success: true,
      message: 'Patient account created successfully',
      data: result,
    });
  })
);

/**
 * @route   POST /api/auth/patient/login
 * @desc    Patient login
 * @access  Public
 */
router.post(
  '/patient/login',
  asyncHandler(async (req, res) => {
    const { email, password } = req.body;
    const result = await loginUser({ email, password, requiredRole: 'patient' });
    res.status(200).json({
      success: true,
      message: 'Patient logged in successfully',
      data: result,
    });
  })
);

/**
 * @route   POST /api/auth/doctor/signup
 * @desc    Doctor / Business onboarding and registration
 * @access  Public
 */
router.post(
  '/doctor/signup',
  asyncHandler(async (req, res) => {
    const result = await registerDoctorBusiness(req.body);
    res.status(201).json({
      success: true,
      message: 'Doctor / Business onboarding completed successfully',
      data: result,
    });
  })
);

/**
 * @route   POST /api/auth/doctor/login
 * @desc    Doctor / Business login
 * @access  Public
 */
router.post(
  '/doctor/login',
  asyncHandler(async (req, res) => {
    const { email, password } = req.body;
    const result = await loginUser({ email, password, requiredRole: 'doctor' });
    res.status(200).json({
      success: true,
      message: 'Doctor logged in successfully',
      data: result,
    });
  })
);

/**
 * @route   POST /api/auth/login
 * @desc    Unified login for all roles (patient, doctor, receptionist, admin, etc.)
 * @access  Public
 */
router.post(
  '/login',
  asyncHandler(async (req, res) => {
    const { email, password, role, requiredRole } = req.body;
    const targetRole = requiredRole || role;
    const result = await loginUser({ email, password, requiredRole: targetRole });
    res.status(200).json({
      success: true,
      message: 'Login successful',
      data: result,
    });
  })
);

/**
 * @route   GET /api/auth/me
 * @desc    Get current authenticated user profile
 * @access  Private
 */
router.get(
  '/me',
  authenticateUser,
  asyncHandler(async (req, res) => {
    const result = await getCurrentUser(req.user._id);
    if (!result) {
      throw new AppError('User profile not found', 404);
    }
    res.status(200).json({
      success: true,
      data: result,
    });
  })
);

/**
 * @route   POST /api/auth/logout
 * @desc    Logout user (token invalidated on client)
 * @access  Public
 */
router.post('/logout', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Logged out successfully',
  });
});

export default router;
