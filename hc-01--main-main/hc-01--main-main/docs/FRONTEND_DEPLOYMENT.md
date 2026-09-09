# MediQueue+ React / Vite Frontend Deployment Guide

**Target System:** Single Page React Application (`/client`)  
**Version:** 2.0.0 (Production Release)  
**Primary Cloud Hosting Target:** Vercel (recommended), Netlify, Cloudflare Pages, AWS S3 + CloudFront, Docker / Nginx  
**Status:** **DEPLOYMENT VALIDATED**

---

## 1. Overview & Build Commands

The MediQueue+ frontend is a Single Page Application (SPA) built using React 18, Vite 5, Tailwind CSS, and Socket.IO Client.

### 1.1 Production Build Commands
```bash
cd client
npm install
npm run build
```
- **Output Directory**: `client/dist`
- **Compiler**: Vite v5 (ES2020 bundle, minified with Rollup)
- **Local Preview**: `npm run preview -- --port 4173`

---

## 2. Environment Variables & Conventions

In accordance with Vite conventions, all variables exposed to the client must be prefixed with `VITE_`.

| Variable | Required? | Example Value | Purpose |
|---|---|---|---|
| `VITE_API_BASE_URL` | Yes (in production) | `https://hospital-queue-server.onrender.com` | Base URL of the deployed backend REST API. Can also be set via `VITE_API_URL`. |
| `VITE_API_URL` | Yes (alias) | `https://hospital-queue-server.onrender.com` | Alternative variable name for the backend REST API base URL. |
| `VITE_SOCKET_URL` | Yes (in production) | `https://hospital-queue-server.onrender.com` | Deployed backend URL for real-time WebSocket / Socket.IO connections. |
| `VITE_BACKEND_URL` | Optional | `https://hospital-queue-server.onrender.com` | Fallback backend URL for Vite proxy and decoupled clients. |

> **IMPORTANT**: Zero `localhost` URLs are hardcoded in the frontend production source code. When `VITE_API_BASE_URL` (or `VITE_API_URL`) is supplied, all frontend API calls automatically route to the deployed cloud backend.

---

## 3. Cross-Origin Architecture & Automatic Fetch Interceptor

In [`client/src/services/api.js`](file:///c:/Users/saurav/SIH/hc-01--main-main/hc-01--main-main/client/src/services/api.js):
```javascript
export const getApiBase = () => {
  const url = import.meta.env.VITE_API_BASE_URL || import.meta.env.VITE_API_URL || import.meta.env.VITE_BACKEND_URL;
  return url ? url.replace(/\/+$/, '') : '';
};
```

1. **Decoupled Cross-Origin Deployment (e.g. Vercel Frontend + Render Backend)**:
   - When `VITE_API_BASE_URL` is set, `window.fetch` is automatically wrapped on client startup.
   - Any relative API request (e.g. `fetch('/api/patient/dashboard-summary')`) is dynamically rewritten to `https://hospital-queue-server.onrender.com/api/patient/dashboard-summary`.
   - This eliminates the risk of 404s or HTML index fallback errors on cross-origin static hosts.
2. **Single-Origin Deployment (e.g. Docker Compose with Nginx)**:
   - When `VITE_API_BASE_URL` is omitted, requests use relative paths (`/api/...`), and Nginx proxies them to `http://server:5000`.

---

## 4. Socket.IO Secure WSS Connection

In [`client/src/services/socket.js`](file:///c:/Users/saurav/SIH/hc-01--main-main/hc-01--main-main/client/src/services/socket.js):
- **Dynamic Endpoint**: Connects to `VITE_SOCKET_URL` using secure WebSocket (`wss://`) with fallback to HTTP long-polling (`transports: ['websocket', 'polling']`).
- **Connection Parameters**:
  ```javascript
  io(SOCKET_URL, {
    path: '/socket.io',
    autoConnect: true,
    reconnection: true,
    reconnectionAttempts: 10,
    reconnectionDelay: 800,
    reconnectionDelayMax: 5000,
    timeout: 20000,
    transports: ['websocket', 'polling'],
  });
  ```

---

## 5. SPA Routing & Refresh Configuration (Vercel)

Single Page Applications require the hosting platform to rewrite all non-file route requests to `/index.html` so that React Router DOM can handle routing client-side.

### 5.1 Vercel Configuration ([`client/vercel.json`](file:///c:/Users/saurav/SIH/hc-01--main-main/hc-01--main-main/client/vercel.json))
```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json#main",
  "rewrites": [
    {
      "source": "/(.*)",
      "destination": "/index.html"
    }
  ]
}
```

### 5.2 Root Monorepo Configuration ([`vercel.json`](file:///c:/Users/saurav/SIH/hc-01--main-main/hc-01--main-main/vercel.json))
If deploying directly from the repository root:
```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json#main",
  "buildCommand": "cd client && npm run build",
  "outputDirectory": "client/dist",
  "framework": "vite",
  "installCommand": "cd client && npm install",
  "rewrites": [
    {
      "source": "/(.*)",
      "destination": "/index.html"
    }
  ]
}
```

### 5.3 Verified Direct Routes (Working after Browser Refresh)
- `/home` — Landing and platform navigation
- `/patient-dashboard` — Unified health hub and vitals
- `/find-doctors` — AI doctor discovery and Bayesian ranking
- `/my-data` — Patient data consent and access audit logs
- `/doctor` (or `/doctor-workspace`) — Doctor Clinical Workspace
- `/doctor-schedule` — OPD working hours and slot management
- `/telemedicine/:appointmentId` — Encrypted WebRTC consultation room
- `/reception` — Walk-in ticket issuing
- `/display` — Live TV queue board
- `/hospitals` — Multi-hospital administrator portal

---

## 6. Backend CORS Synchronization

The backend server in `server/server.js` verifies the client origin against `CORS_ORIGIN`:

```bash
# In backend server/.env:
CORS_ORIGIN=https://mediqueue.vercel.app,https://*.vercel.app
```

The backend dynamically checks the requesting origin against this list, allowing secure cookie handling and credentials transmission without wildcard security violations.

---

## 7. Step-by-Step Vercel Deployment Runbook

1. **Connect to Vercel**:
   - Go to [vercel.com/new](https://vercel.com/new).
   - Import your GitHub repository (`SIH`).
2. **Project Settings**:
   - **Framework Preset**: `Vite`
   - **Root Directory**: `client` (or leave as root; both are supported by `vercel.json`).
   - **Build Command**: `npm run build`
   - **Output Directory**: `dist` (or `client/dist` if root).
3. **Environment Variables**:
   Add in the Vercel Dashboard:
   - `VITE_API_BASE_URL`: `https://hospital-queue-server.onrender.com`
   - `VITE_SOCKET_URL`: `https://hospital-queue-server.onrender.com`
4. **Deploy**:
   - Click **Deploy**.
   - Vercel will build the application and provide a production HTTPS URL (e.g. `https://mediqueue.vercel.app`).
5. **Update Backend CORS**:
   - Add your newly assigned Vercel URL to `CORS_ORIGIN` in the backend host settings.
