import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import http from 'http';
import mongoose from 'mongoose';
import { Server } from 'socket.io';
import connectDB from './config/database.js';
import socketHandler from './socketHandler.js';
import tokenRoutes from './routes/tokenRoutes.js';
import doctorRoutes from './routes/doctorRoutes.js';
import summaryRoutes from './routes/summaryRoutes.js';
import emergencyRoutes from './routes/emergencyRoutes.js';
import ratingRoutes from './routes/ratingRoutes.js';
import recommendationRoutes from './routes/recommendationRoutes.js';
import scheduleRoutes from './routes/scheduleRoutes.js';
import appointmentRoutes from './routes/appointmentRoutes.js';
import priorityRoutes from './routes/priorityRoutes.js';
import consentRoutes from './routes/consentRoutes.js';
import historyRoutes from './routes/historyRoutes.js';
import testOrderRoutes from './routes/testOrderRoutes.js';
import carePlanRoutes from './routes/carePlanRoutes.js';
import telemedicineRoutes from './routes/telemedicineRoutes.js';
import notificationRoutes from './routes/notificationRoutes.js';
import patientRoutes from './routes/patientRoutes.js';
import hospitalRoutes from './routes/hospitalRoutes.js';
import aiRoutes from './routes/aiRoutes.js';
import authRoutes from './routes/authRoutes.js';
import receptionRoutes from './routes/receptionRoutes.js';
import { optionalAuth } from './middleware/auth.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { apiLimiter } from './middleware/rateLimiter.js';

dotenv.config();

// Prevent queries from buffering/hanging when MongoDB is disconnected
mongoose.set('bufferCommands', false);

const app = express();
const server = http.createServer(app);

// ── Configurable Multi-Origin CORS & Transport Setup ──
const rawOrigins = process.env.CORS_ORIGIN || 'http://localhost:5173,http://localhost:3000';
const allowedOrigins = rawOrigins.split(',').map((o) => o.trim()).filter(Boolean);

export const isOriginAllowed = (origin) => {
  // Allow requests without Origin header (e.g. mobile apps, curl, server-to-server, health checks)
  if (!origin) return true;

  // Exact match or wildcard allow-all
  if (allowedOrigins.includes('*') || allowedOrigins.includes(origin)) return true;

  // Wildcard subdomains (e.g., "*.vercel.app", "*.mediqueue.org")
  const matchesWildcard = allowedOrigins.some((pattern) => {
    if (pattern.startsWith('*.') && origin.includes('://')) {
      const hostname = origin.split('://')[1].split(':')[0];
      const rootDomain = pattern.slice(2);
      return hostname === rootDomain || hostname.endsWith(`.${rootDomain}`);
    }
    return false;
  });
  if (matchesWildcard) return true;

  // Localhost development exceptions (only in non-production)
  if (process.env.NODE_ENV !== 'production' && (origin.startsWith('http://localhost:') || origin.startsWith('http://127.0.0.1:'))) {
    return true;
  }

  return false;
};

const corsOriginChecker = (origin, callback) => {
  if (isOriginAllowed(origin)) {
    return callback(null, true);
  }
  return callback(new Error(`CORS policy rejection: Origin '${origin}' is not authorized by CORS_ORIGIN.`));
};

const io = new Server(server, {
  cors: {
    origin: (origin, callback) => {
      if (isOriginAllowed(origin)) {
        return callback(null, true);
      }
      return callback(new Error(`Socket.IO CORS rejection: Origin '${origin}' is not authorized.`));
    },
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE'],
    credentials: true,
  },
  transports: ['websocket', 'polling'],
  pingTimeout: 60000,
  pingInterval: 25000,
});

// ── Middleware ──
app.use(cors({
  origin: corsOriginChecker,
  credentials: true,
  methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
}));
app.use(express.json({ limit: '1mb' }));
app.use(apiLimiter);
app.use(optionalAuth);

// ── Health Endpoints (GET /health and GET /api/health) ──
const healthHandler = (req, res) => {
  const isDbConnected = mongoose.connection.readyState === 1;
  res.json({
    status: 'ok',
    service: 'hospital-queue-server',
    version: '2.0.0',
    uptime: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
    database: isDbConnected ? 'connected' : 'disconnected',
    environment: process.env.NODE_ENV || 'development',
  });
};

app.get('/health', healthHandler);
app.get('/api/health', healthHandler);

// ── Routes ──
app.use('/api/auth', authRoutes);
app.use('/api/tokens', tokenRoutes);
app.use('/api/doctor', doctorRoutes);
app.use('/api/summary', summaryRoutes);
app.use('/api/emergency', emergencyRoutes);
app.use('/api/ratings', ratingRoutes);
app.use('/api/recommendations', recommendationRoutes);
app.use('/api/doctors', scheduleRoutes);
app.use('/api/appointments', appointmentRoutes);
app.use('/api/priority', priorityRoutes);
app.use('/api/consent', consentRoutes);
app.use('/api/history', historyRoutes);
app.use('/api/test-orders', testOrderRoutes);
app.use('/api/care-plans', carePlanRoutes);
app.use('/api/telemedicine', telemedicineRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/patient', patientRoutes);
app.use('/api/hospitals', hospitalRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/reception', receptionRoutes);

// ── Error Handling ──
app.use(notFoundHandler);
app.use(errorHandler);

// ── Socket.IO ──
io.on('connection', (socket) => {
  socketHandler(io, socket);
});

// ── Start ── (FIXED: Added .catch() + process error handlers)
const PORT = process.env.PORT || 5000;
const HOST = '0.0.0.0';

connectDB()
  .then(() => {
    server.listen(PORT, HOST, () => {
      console.log(`\n🏥 Hospital Queue Server running on http://${HOST}:${PORT}`);
      console.log(`   Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log(`   CORS Origin: ${rawOrigins}`);
      console.log(`   Health: http://${HOST}:${PORT}/health`);
      console.log(`   API: http://${HOST}:${PORT}/api\n`);
    });
  })
  .catch((error) => {
    console.error('❌ Failed to connect to MongoDB:', error.message);
    console.error('💥 Server startup failed. Exiting...');
    process.exit(1);
  });

// Process error handlers (CRITICAL for production)
process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error);
  process.exit(1);
});

// Graceful shutdown handlers
process.on('SIGTERM', () => {
  console.log('🔴 SIGTERM received. Shutting down gracefully...');
  server.close(() => {
    console.log('✅ Server closed.');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('🛑 SIGINT received (Ctrl+C). Shutting down gracefully...');
  server.close(() => {
    console.log('✅ Server closed.');
    process.exit(0);
  });
});

export { io };
