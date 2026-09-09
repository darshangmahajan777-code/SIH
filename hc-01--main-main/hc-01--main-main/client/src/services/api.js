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

// Auto-prefix window.fetch for /api paths when an external backend URL is configured
if (typeof window !== 'undefined' && window.fetch) {
  const externalBase = getApiBase();
  if (externalBase) {
    const originalFetch = window.fetch.bind(window);
    window.fetch = (input, init) => {
      if (typeof input === 'string' && input.startsWith('/api')) {
        return originalFetch(`${externalBase}${input}`, init);
      }
      return originalFetch(input, init);
    };
  }
}

// Response interceptor: backend payload shape is { success, data, error }
API.interceptors.response.use(
  (res) => res.data,
  (err) => {
    const message = err.response?.data?.error || err.message || 'Something went wrong';
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

export default API;
