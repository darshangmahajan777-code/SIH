import { getQueue } from './services/queueService.js';
import { validateSessionToken } from './services/telemedicineService.js';

let ioInstance = null;

export function getIO() {
  if (!ioInstance) {
    return null;
  }
  return ioInstance;
}

export function emitToPatientRoom(patientId, event, data) {
  const io = getIO();
  if (io && patientId) {
    const room = `patient-room:${patientId}`;
    io.to(room).emit(event, data);
  }
}

export function emitNotificationToUser(recipientId, notification, unreadCount) {
  const io = getIO();
  if (!io || !recipientId) return;
  const idStr = String(recipientId);
  io.to(`user:${idStr}`)
    .to(`user-room:${idStr}`)
    .to(`patient-room:${idStr}`)
    .to(`doctor-room:${idStr}`)
    .emit('notification:new', notification);

  if (typeof unreadCount === 'number') {
    io.to(`user:${idStr}`)
      .to(`user-room:${idStr}`)
      .to(`patient-room:${idStr}`)
      .to(`doctor-room:${idStr}`)
      .emit('notification:unread_count', { unreadCount });
  }
}

export default function socketHandler(io, socket) {
  ioInstance = io;

  socket.join('queue-room');
  console.log(`Client connected: ${socket.id}`);

  // Track user identity and joined telemedicine rooms
  const activeTelemedicineRooms = new Set();
  socket.data = socket.data || {};

  // Extract initial identity from handshake auth if present
  if (socket.handshake?.auth?.userId) {
    socket.data.userId = String(socket.handshake.auth.userId).trim();
    socket.data.role = socket.handshake.auth.role || 'patient';
  }

  socket.on('join_room', (room) => {
    const sanitizedRoom = String(room).trim();
    if (sanitizedRoom.length === 0 || sanitizedRoom.length > 80) {
      socket.emit('error', { message: 'Invalid room name' });
      return;
    }

    // Telemedicine rooms can ONLY be joined via verified 'telemedicine:join'
    if (sanitizedRoom.startsWith('telemedicine:')) {
      socket.emit('error', {
        message: 'Direct join denied: Telemedicine rooms require verified session token via telemedicine:join',
      });
      return;
    }

    const publicRooms = ['queue-room', 'display-room', 'reception-room'];
    if (publicRooms.includes(sanitizedRoom)) {
      socket.join(sanitizedRoom);
      return;
    }

    // Private patient room check
    if (sanitizedRoom.startsWith('patient-room:')) {
      const targetId = sanitizedRoom.replace('patient-room:', '').trim();
      if (socket.data.role === 'doctor') {
        socket.emit('error', { message: 'Forbidden: Doctors cannot join patient private notification rooms' });
        return;
      }
      if (socket.data.userId && socket.data.userId !== targetId) {
        socket.emit('error', { message: 'Forbidden: Cannot join another patient private room' });
        return;
      }
      socket.data.userId = targetId;
      socket.data.role = 'patient';
      socket.join(sanitizedRoom);
      return;
    }

    // Private doctor room check
    if (sanitizedRoom.startsWith('doctor-room:')) {
      const targetId = sanitizedRoom.replace('doctor-room:', '').trim();
      if (socket.data.role === 'patient') {
        socket.emit('error', { message: 'Forbidden: Patients cannot join doctor clinical rooms' });
        return;
      }
      if (socket.data.userId && socket.data.userId !== targetId) {
        socket.emit('error', { message: 'Forbidden: Cannot join another doctor room' });
        return;
      }
      socket.data.userId = targetId;
      socket.data.role = 'doctor';
      socket.join(sanitizedRoom);
      return;
    }

    // Private user room check
    if (sanitizedRoom.startsWith('user:') || sanitizedRoom.startsWith('user-room:')) {
      const targetId = sanitizedRoom.replace(/^(user:|user-room:)/, '').trim();
      if (socket.data.userId && socket.data.userId !== targetId) {
        socket.emit('error', { message: 'Forbidden: Cannot join another user private room' });
        return;
      }
      socket.data.userId = targetId;
      socket.join(sanitizedRoom);
      return;
    }

    socket.emit('error', { message: 'Invalid room or unauthorized room access' });
  });

  socket.on('notification:subscribe', ({ userId, role }) => {
    if (!userId) return;
    const sanitizedId = String(userId).trim();

    // Prevent a socket bound to one user from subscribing to another user's stream
    if (socket.data.userId && socket.data.userId !== sanitizedId) {
      socket.emit('error', {
        message: 'Forbidden: You cannot subscribe to another user notifications',
      });
      return;
    }

    socket.data.userId = sanitizedId;
    if (role) socket.data.role = role;

    socket.join(`user:${sanitizedId}`);
    if (socket.data.role === 'doctor') {
      socket.join(`doctor-room:${sanitizedId}`);
    } else {
      socket.join(`patient-room:${sanitizedId}`);
    }
  });

  socket.on('request_queue', async () => {
    try {
      const queue = await getQueue();
      socket.emit('queue_updated', queue);
    } catch (error) {
      console.error('Error sending queue:', error.message);
    }
  });

  // ───────────────────────────────────────────────────────────────────────────
  // Appointment-Scoped Telemedicine WebRTC Signaling
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * telemedicine:join
   *
   * SECURITY RULE: Only the verified patient and doctor of this appointment may join.
   * Requires a valid HMAC-signed sessionToken issued by /api/telemedicine/session.
   */
  socket.on('telemedicine:join', ({ appointmentId, sessionToken, userId, role }) => {
    if (!appointmentId || !sessionToken) {
      socket.emit('telemedicine:error', {
        message: 'Authentication required: appointmentId and sessionToken are required',
      });
      return;
    }

    const verified = validateSessionToken(sessionToken);
    if (
      !verified ||
      verified.appointmentId !== String(appointmentId) ||
      (userId && verified.userId !== String(userId))
    ) {
      socket.emit('telemedicine:error', {
        message: 'Access denied: Invalid or expired consultation session token',
      });
      return;
    }

    const roomId = `telemedicine:apt:${appointmentId}`;
    socket.join(roomId);
    activeTelemedicineRooms.add(roomId);

    console.log(`[Telemedicine] Socket ${socket.id} (${verified.role}) joined ${roomId}`);

    // Notify caller that they joined
    socket.emit('telemedicine:joined', {
      roomId,
      role: verified.role,
      userId: verified.userId,
    });

    // Notify other peer in the room
    socket.to(roomId).emit('telemedicine:peer-joined', {
      socketId: socket.id,
      role: verified.role,
      userId: verified.userId,
    });
  });

  /**
   * Helper: verify socket is an active authenticated member of the appointment room
   */
  function isAuthorizedForTelemedicine(appointmentId) {
    if (!appointmentId) return false;
    const roomId = `telemedicine:apt:${appointmentId}`;
    return activeTelemedicineRooms.has(roomId) && socket.rooms.has(roomId);
  }

  /**
   * telemedicine:offer — Relay SDP offer strictly within the authorized appointment room
   */
  socket.on('telemedicine:offer', ({ appointmentId, offer }) => {
    if (!appointmentId || !offer) return;
    if (!isAuthorizedForTelemedicine(appointmentId)) {
      socket.emit('telemedicine:error', {
        message: 'Unauthorized: You must join this consultation room with a valid session token before sending offers',
      });
      return;
    }
    const roomId = `telemedicine:apt:${appointmentId}`;
    socket.to(roomId).emit('telemedicine:offer', {
      offer,
      senderId: socket.id,
    });
  });

  /**
   * telemedicine:answer — Relay SDP answer strictly within the authorized appointment room
   */
  socket.on('telemedicine:answer', ({ appointmentId, answer }) => {
    if (!appointmentId || !answer) return;
    if (!isAuthorizedForTelemedicine(appointmentId)) {
      socket.emit('telemedicine:error', {
        message: 'Unauthorized: You must join this consultation room with a valid session token before sending answers',
      });
      return;
    }
    const roomId = `telemedicine:apt:${appointmentId}`;
    socket.to(roomId).emit('telemedicine:answer', {
      answer,
      senderId: socket.id,
    });
  });

  /**
   * telemedicine:ice-candidate — Relay ICE candidates strictly within the appointment room
   */
  socket.on('telemedicine:ice-candidate', ({ appointmentId, candidate }) => {
    if (!appointmentId || !candidate) return;
    if (!isAuthorizedForTelemedicine(appointmentId)) {
      socket.emit('telemedicine:error', {
        message: 'Unauthorized: You must join this consultation room with a valid session token before sending ICE candidates',
      });
      return;
    }
    const roomId = `telemedicine:apt:${appointmentId}`;
    socket.to(roomId).emit('telemedicine:ice-candidate', {
      candidate,
      senderId: socket.id,
    });
  });

  /**
   * telemedicine:leave — Cleanly exit the consultation room
   */
  socket.on('telemedicine:leave', ({ appointmentId }) => {
    if (!appointmentId) return;
    const roomId = `telemedicine:apt:${appointmentId}`;
    socket.leave(roomId);
    activeTelemedicineRooms.delete(roomId);
    socket.to(roomId).emit('telemedicine:peer-left', {
      socketId: socket.id,
    });
  });

  socket.on('disconnect', () => {
    // Notify any active telemedicine rooms that peer left
    activeTelemedicineRooms.forEach((roomId) => {
      socket.to(roomId).emit('telemedicine:peer-left', {
        socketId: socket.id,
      });
    });
    activeTelemedicineRooms.clear();
    console.log(`Client disconnected: ${socket.id}`);
  });

  socket.on('error', (error) => {
    console.error('Socket error:', error);
  });
}
