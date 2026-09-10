import { verifyToken } from '../services/authService.js';
import User from '../models/User.js';
import { AppError } from './errorHandler.js';

/**
 * Extract token from header or fallback
 */
function extractToken(req) {
  const authHeader = req.headers.authorization || req.headers.Authorization;
  if (authHeader && typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
    return authHeader.substring(7).trim();
  }
  return null;
}

/**
 * Optional Authentication Middleware
 * Attaches req.user if a valid token is present, but does not reject unauthenticated requests.
 */
export async function optionalAuth(req, res, next) {
  try {
    const token = extractToken(req);
    if (token) {
      const payload = verifyToken(token);
      if (payload) {
        req.user = {
          _id: payload.userId,
          id: payload.userId,
          email: payload.email,
          role: payload.role,
          name: payload.name,
          hospitalId: payload.hospitalId,
        };
        return next();
      }
    }

    // Legacy header fallbacks
    const fallbackId = req.headers['x-user-id'] || req.headers['x-doctor-id'] || req.headers['x-patient-id'];
    if (fallbackId) {
      req.user = {
        _id: fallbackId,
        id: fallbackId,
        role: req.headers['x-user-role'] || (req.headers['x-doctor-id'] ? 'doctor' : 'patient'),
        hospitalId: req.headers['x-hospital-id'] || null,
      };
    }

    next();
  } catch (err) {
    next();
  }
}

/**
 * Required Authentication Middleware
 * Requires a valid Bearer token or legacy identity header.
 */
export async function authenticateUser(req, res, next) {
  const token = extractToken(req);

  if (token) {
    const payload = verifyToken(token);
    if (!payload) {
      return res.status(401).json({
        success: false,
        message: 'Invalid or expired authentication token',
      });
    }

    // Attach basic user from payload
    req.user = {
      _id: payload.userId,
      id: payload.userId,
      email: payload.email,
      role: payload.role,
      name: payload.name,
      hospitalId: payload.hospitalId,
    };
    return next();
  }

  // Check fallback headers for backward compatibility with existing tests
  const fallbackId = req.headers['x-user-id'] || req.headers['x-doctor-id'] || req.headers['x-patient-id'];
  if (fallbackId) {
    req.user = {
      _id: fallbackId,
      id: fallbackId,
      role: req.headers['x-user-role'] || (req.headers['x-doctor-id'] ? 'doctor' : 'patient'),
      hospitalId: req.headers['x-hospital-id'] || null,
    };
    return next();
  }

  return res.status(401).json({
    success: false,
    message: 'Authentication required. Please provide a valid Bearer token.',
  });
}

/**
 * Role-Based Access Control Middleware Factory
 * Supports multiple allowed roles. Platform 'admin' always has universal access.
 */
export function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required',
      });
    }

    // Platform admin universal override
    if (req.user.role === 'admin') {
      return next();
    }

    if (allowedRoles.includes(req.user.role)) {
      return next();
    }

    return res.status(403).json({
      success: false,
      message: `Access denied: Role '${req.user.role}' is not authorized to access this resource.`,
    });
  };
}
