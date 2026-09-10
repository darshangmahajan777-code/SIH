import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import {
  patientLogin,
  patientSignup,
  doctorLogin,
  doctorSignup,
  loginUnified,
  getAuthMe,
  logoutUser,
} from '../services/api';

const AuthContext = createContext(null);

export const AUTH_TOKEN_KEY = 'mediqueue_auth_token';
export const AUTH_USER_KEY = 'mediqueue_auth_user';
export const AUTH_PROFILE_KEY = 'mediqueue_doctor_profile';

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => localStorage.getItem(AUTH_TOKEN_KEY) || null);
  const [user, setUser] = useState(() => {
    try {
      const stored = localStorage.getItem(AUTH_USER_KEY);
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  });
  const [doctorProfile, setDoctorProfile] = useState(() => {
    try {
      const stored = localStorage.getItem(AUTH_PROFILE_KEY);
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  });
  const [loading, setLoading] = useState(true);

  // Sync token to localStorage and update state
  const handleAuthSuccess = useCallback((payload) => {
    const authToken = payload?.token;
    const authUser = payload?.user;
    const profile = payload?.doctorProfile || null;

    if (authToken) {
      localStorage.setItem(AUTH_TOKEN_KEY, authToken);
      setToken(authToken);
    }
    if (authUser) {
      localStorage.setItem(AUTH_USER_KEY, JSON.stringify(authUser));
      setUser(authUser);
    }
    if (profile) {
      localStorage.setItem(AUTH_PROFILE_KEY, JSON.stringify(profile));
      setDoctorProfile(profile);
    } else {
      localStorage.removeItem(AUTH_PROFILE_KEY);
      setDoctorProfile(null);
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      await logoutUser();
    } catch {
      // Ignore network errors on logout
    } finally {
      localStorage.removeItem(AUTH_TOKEN_KEY);
      localStorage.removeItem(AUTH_USER_KEY);
      localStorage.removeItem(AUTH_PROFILE_KEY);
      setToken(null);
      setUser(null);
      setDoctorProfile(null);
    }
  }, []);

  // Fetch current user on initial mount if token exists
  const refreshUser = useCallback(async () => {
    const savedToken = localStorage.getItem(AUTH_TOKEN_KEY);
    if (!savedToken) {
      setLoading(false);
      return;
    }
    try {
      const data = await getAuthMe();
      if (data?.user) {
        setUser(data.user);
        localStorage.setItem(AUTH_USER_KEY, JSON.stringify(data.user));
      }
      if (data?.doctorProfile) {
        setDoctorProfile(data.doctorProfile);
        localStorage.setItem(AUTH_PROFILE_KEY, JSON.stringify(data.doctorProfile));
      }
    } catch (err) {
      console.warn('Session check failed:', err.message);
      // If unauthorized, clear session
      if (err.message?.includes('token') || err.message?.includes('unauthorized') || err.message?.includes('401')) {
        logout();
      }
    } finally {
      setLoading(false);
    }
  }, [logout]);

  useEffect(() => {
    refreshUser();
  }, [refreshUser]);

  // Auth Actions
  const loginAsPatient = async ({ email, password }) => {
    const data = await patientLogin({ email, password });
    handleAuthSuccess(data);
    return data;
  };

  const loginAsDoctor = async ({ email, password }) => {
    const data = await doctorLogin({ email, password });
    handleAuthSuccess(data);
    return data;
  };

  const loginWithRole = async ({ email, password, role }) => {
    const data = await loginUnified({ email, password, role });
    handleAuthSuccess(data);
    return data;
  };

  const registerPatientUser = async (patientData) => {
    const data = await patientSignup(patientData);
    handleAuthSuccess(data);
    return data;
  };

  const registerDoctorUser = async (doctorData) => {
    const data = await doctorSignup(doctorData);
    handleAuthSuccess(data);
    return data;
  };

  const value = {
    user,
    token,
    doctorProfile,
    role: user?.role || null,
    isAuthenticated: Boolean(token && user),
    loading,
    loginAsPatient,
    loginAsDoctor,
    loginWithRole,
    registerPatientUser,
    registerDoctorUser,
    logout,
    refreshUser,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
