import axios from 'axios';

// Helper to determine the configured external backend base URL
export const getApiBase = () => {
  const url = import.meta.env.VITE_API_BASE_URL || import.meta.env.VITE_API_URL || import.meta.env.VITE_BACKEND_URL;
  return url ? url.replace(/\/+$/, '') : '';
};

export const apiUrl = (endpoint = '') => {
  const base = getApiBase();
  const path = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  return base ? `${base}${path}` : path;
};

// In production, VITE_API_URL or VITE_BACKEND_URL points to the actual backend.
// In development, the Vite dev server proxy handles '/api' routing if unconfigured.
const API_BASE = getApiBase() ? `${getApiBase()}/api` : '/api';

const API = axios.create({
  baseURL: API_BASE,
  timeout: 15000,
  headers: { 'Content-Type': 'application/json' },
});

// Auto-prefix window.fetch for /api paths and inject Authorization header
if (typeof window !== 'undefined' && window.fetch) {
  const externalBase = getApiBase();
  const originalFetch = window.fetch.bind(window);
  window.fetch = (input, init = {}) => {
    const token = localStorage.getItem('mediqueue_auth_token');
    const headers = new Headers(init.headers || {});
    if (token && !headers.has('Authorization')) {
      headers.set('Authorization', `Bearer ${token}`);
    }
    const modifiedInit = { ...init, headers };

    if (typeof input === 'string' && input.startsWith('/api') && externalBase) {
      return originalFetch(`${externalBase}${input}`, modifiedInit);
    }
    return originalFetch(input, modifiedInit);
  };
}

// Request interceptor to attach JWT token
API.interceptors.request.use(
  (config) => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('mediqueue_auth_token') : null;
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor: backend payload shape is { success, data, error, message }
API.interceptors.response.use(
  (res) => res.data,
  (err) => {
    const message = err.response?.data?.message || err.response?.data?.error || err.message || 'Something went wrong';
    console.error('API Error:', message);
    throw new Error(message);
  }
);

const unwrap = async (requestPromise) => {
  const payload = await requestPromise;
  if (payload?.success === false) {
    throw new Error(payload.error || 'Request failed');
  }
  return payload?.data;
};

// Token APIs
export const createToken = (data) => unwrap(API.post('/tokens', data));
export const getQueue = () => unwrap(API.get('/tokens'));
export const getTokenById = (id) => unwrap(API.get(`/tokens/${id}`));
export const cancelToken = (id) => unwrap(API.patch(`/tokens/${id}/cancel`));

// Doctor APIs
export const callNextPatient = () => unwrap(API.post('/doctor/call-next'));
export const completeConsultation = (tokenNumber) => unwrap(API.post(`/doctor/complete/${tokenNumber}`));
export const startDoctorSession = (data) => unwrap(API.post('/doctor/session/start', data));
export const endDoctorSession = () => unwrap(API.post('/doctor/session/end'));
export const getDoctorSession = () => unwrap(API.get('/doctor/session'));

// Summary APIs
export const getLiveStats = () => unwrap(API.get('/summary'));
export const getDailySummary = () => unwrap(API.get('/summary/daily'));
export const getSummaryByDate = (date) => unwrap(API.get(`/summary/${date}`));

// Emergency APIs
export const getEmergencyRedirect = (data) => unwrap(API.post('/emergency/redirect', data));
export const getNearbyHospitals = (lat, lng) => unwrap(API.get(`/emergency/nearby?lat=${lat}&lng=${lng}`));
export const selectHospital = (data) => unwrap(API.post('/emergency/select', data));

// Auth & Onboarding APIs
export const patientSignup = (data) => unwrap(API.post('/auth/patient/signup', data));
export const patientLogin = (data) => unwrap(API.post('/auth/patient/login', data));
export const doctorSignup = (data) => unwrap(API.post('/auth/doctor/signup', data));
export const doctorLogin = (data) => unwrap(API.post('/auth/doctor/login', data));
export const loginUnified = (data) => unwrap(API.post('/auth/login', data));
export const getAuthMe = () => unwrap(API.get('/auth/me'));
export const logoutUser = () => API.post('/auth/logout');

// Doctor / Business Dashboard APIs
export const getDoctorDashboard = (params = {}) => {
  const query = new URLSearchParams(params).toString();
  return unwrap(API.get(`/doctor/dashboard${query ? `?${query}` : ''}`));
};
export const updateDoctorAvailability = (availabilityStatus) =>
  unwrap(API.patch('/doctor/availability', { availabilityStatus }));
export const getDoctorPatientClinicalHistory = (patientId, appointmentId = '') => {
  const query = appointmentId ? `?appointmentId=${encodeURIComponent(appointmentId)}` : '';
  return unwrap(API.get(`/doctor/patient/${patientId}/clinical-history${query}`));
};
export const updateBusinessSettings = (data) => unwrap(API.patch('/doctor/business-settings', data));
export const addPracticeStaff = (data) => unwrap(API.post('/doctor/staff', data));
export const getDoctorSubscription = () => unwrap(API.get('/doctor/subscription'));

// Reception Operational APIs (front-desk operational views with strict clinical data shielding)
export const getReceptionDoctorsAvailability = (hospitalId = '') => {
  const query = hospitalId ? `?hospitalId=${encodeURIComponent(hospitalId)}` : '';
  return unwrap(API.get(`/reception/doctors-availability${query}`));
};
export const getReceptionAppointments = (params = {}) => {
  const query = new URLSearchParams(params).toString();
  return unwrap(API.get(`/reception/appointments${query ? `?${query}` : ''}`));
};
export const checkInAppointmentAtReception = (appointmentId, hospitalId = '') =>
  unwrap(API.patch(`/reception/check-in/${appointmentId}`, { hospitalId }));

// Doctor Clinical Workspace & Longitudinal Patient Record APIs
export const getDoctorWorkspaceSummary = (params = {}) => {
  const query = new URLSearchParams(params).toString();
  return unwrap(API.get(`/doctor/workspace-summary${query ? `?${query}` : ''}`));
};
export const getDoctorEncounter = (appointmentId, doctorId = '') => {
  const query = doctorId ? `?doctorId=${encodeURIComponent(doctorId)}` : '';
  return unwrap(API.get(`/doctor/encounter/${appointmentId}${query}`));
};
export const updateEncounterCurrentVisit = (appointmentId, data = {}) =>
  unwrap(API.patch(`/doctor/encounter/${appointmentId}/current-visit`, data));
export const issueEncounterPrescription = (appointmentId, data = {}) =>
  unwrap(API.post(`/doctor/encounter/${appointmentId}/prescribe`, data));
export const orderEncounterTest = (appointmentId, data = {}) =>
  unwrap(API.post(`/doctor/encounter/${appointmentId}/order-test`, data));
export const createEncounterCarePlan = (appointmentId, data = {}) =>
  unwrap(API.post(`/doctor/encounter/${appointmentId}/care-plan`, data));
export const recordEncounterMedicalHistory = (appointmentId, data = {}) =>
  unwrap(API.post(`/doctor/encounter/${appointmentId}/record-history`, data));
export const requestEncounterConsent = (appointmentId, data = {}) =>
  unwrap(API.post(`/doctor/encounter/${appointmentId}/request-consent`, data));

export default API;
