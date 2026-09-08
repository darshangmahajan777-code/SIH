import { getQueue } from './services/queueService.js';

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

export default function socketHandler(io, socket) {
  ioInstance = io;

  socket.join('queue-room');
  console.log(`Client connected: ${socket.id}`);

  socket.on('join_room', (room) => {
    const sanitizedRoom = String(room).trim();
    if (sanitizedRoom.length === 0 || sanitizedRoom.length > 60) {
      socket.emit('error', { message: 'Invalid room name' });
      return;
    }

    const standardRooms = ['queue-room', 'doctor-room', 'display-room', 'reception-room'];
    const isPatientRoom = sanitizedRoom.startsWith('patient-room:');

    if (standardRooms.includes(sanitizedRoom) || isPatientRoom) {
      socket.join(sanitizedRoom);
      console.log(`${socket.id} joined ${sanitizedRoom}`);
    } else {
      socket.emit('error', { message: 'Invalid room' });
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

  socket.on('disconnect', () => {
    console.log(`Client disconnected: ${socket.id}`);
  });

  socket.on('error', (error) => {
    console.error('Socket error:', error);
  });
}
