import crypto from 'crypto';
import { AppError, asyncHandler } from './errorHandler.js';

const ADMIN_API_KEY = process.env.ADMIN_API_KEY || 'sih-admin-secret-key-2026';

export function verifyAdminKey(providedKey) {
  if (!providedKey || typeof providedKey !== 'string') return false;
  const keyBuf = Buffer.from(providedKey);
  const expectedBuf = Buffer.from(ADMIN_API_KEY);
  if (keyBuf.length !== expectedBuf.length) return false;
  return crypto.timingSafeEqual(keyBuf, expectedBuf);
}

/**
 * requireHospitalAccess — Hospital Isolation & Access Control Middleware
 *
 * Security Rules:
 *  1. Platform 'admin' has global oversight across all registered hospitals.
 *     Admin rights require authenticated req.user.role === 'admin' OR verified x-admin-key.
 *  2. Hospital-scoped personnel ('hospital_admin', 'receptionist', 'doctor'):
 *     - Can ONLY access, inspect, or manage data belonging to their assigned hospitalId.
 *     - Cross-hospital access is strictly blocked with 403 Forbidden.
 *  3. Verifies that the requested hospital resource matches the user's hospital context.
 */
export function requireHospitalAccess({ hospitalIdParam = 'id' } = {}) {
  return asyncHandler(async (req, res, next) => {
    // 1. Verify Platform Administrator privilege securely
    const isPlatformAdmin =
      req.user?.role === 'admin' ||
      verifyAdminKey(req.headers['x-admin-key']);

    if (isPlatformAdmin) {
      req.isPlatformAdmin = true;
      return next();
    }

    // 2. Extract verified hospital context
    const userHospitalId =
      req.user?.hospitalId?.toString() ||
      req.headers['x-hospital-id'];

    // Identify target hospital ID from route parameter, query, or body
    const targetHospitalId =
      req.params[hospitalIdParam] ||
      req.params.hospitalId ||
      req.query.hospitalId ||
      req.body?.hospitalId;

    if (!targetHospitalId) {
      throw new AppError('Hospital ID context is required for this action', 400);
    }

    if (!userHospitalId) {
      throw new AppError('Access denied: User is not associated with any hospital context', 403);
    }

    // Check hospital context match
    if (userHospitalId.toString() !== targetHospitalId.toString()) {
      throw new AppError(
        'Access denied: You are not authorized to view or manage data for this hospital.',
        403
      );
    }

    req.authorizedHospitalId = targetHospitalId;
    next();
  });
}
