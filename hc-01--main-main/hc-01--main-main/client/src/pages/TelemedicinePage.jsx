import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { getSocket } from '../services/socket';

const ICE_SERVERS = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ],
};

export default function TelemedicinePage() {
  const { appointmentId } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  // Roles: 'doctor' or 'patient'
  const roleParam = searchParams.get('role');
  const doctorIdParam = searchParams.get('doctorId');

  const [role, setRole] = useState(roleParam || (doctorIdParam ? 'doctor' : 'patient'));
  const [sessionData, setSessionData] = useState(null);
  const [authError, setAuthError] = useState(null);
  const [authorizing, setAuthorizing] = useState(true);

  // Call & Media States
  const [localStream, setLocalStream] = useState(null);
  const [remoteStream, setRemoteStream] = useState(null);
  const [isAudioMuted, setIsAudioMuted] = useState(false);
  const [isVideoMuted, setIsVideoMuted] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState('Initializing session...');
  const [peerPresent, setPeerPresent] = useState(false);
  const [callDuration, setCallDuration] = useState(0);
  const [callStarted, setCallStarted] = useState(false);

  // Failure & Permission States
  const [mediaError, setMediaError] = useState(null);
  const [actionLoading, setActionLoading] = useState(false);

  // Refs
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const peerConnectionRef = useRef(null);
  const socketRef = useRef(null);
  const callTimerRef = useRef(null);

  // Default demo IDs
  const defaultPatientId = '65f000000000000000000001';
  const defaultDoctorId = doctorIdParam || '65f000000000000000000002';
  const currentUserId = role === 'doctor' ? defaultDoctorId : defaultPatientId;

  // ───────────────────────────────────────────────────────────────────────────
  // 1. Authorize Telemedicine Session (Security Gate)
  // ───────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    let isMounted = true;

    async function authorizeSession() {
      setAuthorizing(true);
      setAuthError(null);
      try {
        const headers = { 'Content-Type': 'application/json' };
        if (role === 'doctor') {
          headers['x-doctor-id'] = currentUserId;
        } else {
          headers['x-patient-id'] = currentUserId;
        }

        const res = await fetch('/api/telemedicine/session', {
          method: 'POST',
          headers,
          body: JSON.stringify({
            appointmentId,
            userId: currentUserId,
            role,
          }),
        });

        const json = await res.json();
        if (!isMounted) return;

        if (res.ok && json.success) {
          setSessionData(json.data);
          setConnectionStatus('Waiting for media devices...');
        } else {
          setAuthError(json.error || 'Access denied to this consultation room.');
        }
      } catch (err) {
        if (isMounted) setAuthError('Failed to connect to telemedicine security service.');
      } finally {
        if (isMounted) setAuthorizing(false);
      }
    }

    authorizeSession();
    return () => {
      isMounted = false;
    };
  }, [appointmentId, role, currentUserId]);

  // ───────────────────────────────────────────────────────────────────────────
  // 2. Obtain Camera / Microphone Media
  // ───────────────────────────────────────────────────────────────────────────
  const startLocalMedia = useCallback(async () => {
    setMediaError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: true,
      });

      setLocalStream(stream);
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }
      return stream;
    } catch (err) {
      console.warn('getUserMedia error:', err.name, err.message);
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        setMediaError(
          'Camera or Microphone access was denied by your browser. Please allow device permissions in your browser address bar to continue with video.'
        );
      } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        setMediaError('No camera or microphone found on this device.');
      } else {
        setMediaError(`Media device error: ${err.message}`);
      }
      return null;
    }
  }, []);

  // ───────────────────────────────────────────────────────────────────────────
  // 3. WebRTC PeerConnection Setup
  // ───────────────────────────────────────────────────────────────────────────
  const createPeerConnection = useCallback((stream) => {
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
    }

    const pc = new RTCPeerConnection(ICE_SERVERS);
    peerConnectionRef.current = pc;

    // Attach local stream tracks
    if (stream) {
      stream.getTracks().forEach((track) => {
        pc.addTrack(track, stream);
      });
    }

    // Handle incoming remote media
    pc.ontrack = (event) => {
      console.log('[WebRTC] Received remote track:', event.track.kind);
      if (event.streams && event.streams[0]) {
        setRemoteStream(event.streams[0]);
        if (remoteVideoRef.current) {
          remoteVideoRef.current.srcObject = event.streams[0];
        }
      }
    };

    // Handle ICE candidates
    pc.onicecandidate = (event) => {
      if (event.candidate && socketRef.current) {
        socketRef.current.emit('telemedicine:ice-candidate', {
          appointmentId,
          candidate: event.candidate,
        });
      }
    };

    // Connection state monitoring & auto-recovery
    pc.onconnectionstatechange = () => {
      console.log('[WebRTC] Connection state:', pc.connectionState);
      switch (pc.connectionState) {
        case 'connected':
          setConnectionStatus('Connected (Live HD)');
          setCallStarted(true);
          break;
        case 'disconnected':
          setConnectionStatus('Connection lost — Reconnecting...');
          break;
        case 'failed':
          setConnectionStatus('Connection failed — Attempting restart...');
          pc.restartIce();
          break;
        case 'closed':
          setConnectionStatus('Call ended');
          break;
        default:
          break;
      }
    };

    return pc;
  }, [appointmentId]);

  // ───────────────────────────────────────────────────────────────────────────
  // 4. Socket.IO Signaling Integration
  // ───────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!sessionData?.sessionToken) return;

    const socket = getSocket();
    socketRef.current = socket;

    let localMediaStream = null;

    async function initCall() {
      localMediaStream = await startLocalMedia();

      // Join appointment signaling room
      socket.emit('telemedicine:join', {
        appointmentId,
        sessionToken: sessionData.sessionToken,
        userId: currentUserId,
        role,
      });

      setConnectionStatus(
        role === 'patient'
          ? 'In waiting room — Waiting for doctor to join...'
          : 'In consultation room — Waiting for patient...'
      );
    }

    initCall();

    // Event: Successfully joined room
    const handleJoined = (data) => {
      console.log('[Telemedicine] Joined room:', data.roomId);
    };

    // Event: Peer joined the appointment room -> initiate offer if doctor/caller
    const handlePeerJoined = async (peerData) => {
      console.log('[Telemedicine] Peer joined room:', peerData);
      setPeerPresent(true);
      setConnectionStatus('Peer connected — Negotiating video...');

      // Doctor initiates the WebRTC offer
      if (role === 'doctor') {
        const pc = createPeerConnection(localMediaStream);
        try {
          const offer = await pc.createOffer({
            offerToReceiveAudio: true,
            offerToReceiveVideo: true,
          });
          await pc.setLocalDescription(offer);
          socket.emit('telemedicine:offer', { appointmentId, offer });
        } catch (err) {
          console.error('[WebRTC] Error creating offer:', err);
        }
      }
    };

    // Event: Received SDP Offer (Patient side)
    const handleOffer = async ({ offer }) => {
      console.log('[WebRTC] Received offer');
      setPeerPresent(true);
      setConnectionStatus('Connecting media stream...');
      const pc = createPeerConnection(localMediaStream);
      try {
        await pc.setRemoteDescription(new RTCSessionDescription(offer));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socket.emit('telemedicine:answer', { appointmentId, answer });
      } catch (err) {
        console.error('[WebRTC] Error handling offer:', err);
      }
    };

    // Event: Received SDP Answer (Doctor side)
    const handleAnswer = async ({ answer }) => {
      console.log('[WebRTC] Received answer');
      if (peerConnectionRef.current) {
        try {
          await peerConnectionRef.current.setRemoteDescription(
            new RTCSessionDescription(answer)
          );
        } catch (err) {
          console.error('[WebRTC] Error setting remote description:', err);
        }
      }
    };

    // Event: Received ICE Candidate
    const handleIceCandidate = async ({ candidate }) => {
      if (peerConnectionRef.current && candidate) {
        try {
          await peerConnectionRef.current.addIceCandidate(
            new RTCIceCandidate(candidate)
          );
        } catch (err) {
          console.error('[WebRTC] Error adding ICE candidate:', err);
        }
      }
    };

    // Event: Peer left
    const handlePeerLeft = () => {
      setPeerPresent(false);
      setConnectionStatus('Other participant has disconnected.');
    };

    // Socket reconnect recovery: re-join room seamlessly
    const handleSocketReconnect = () => {
      console.log('[Telemedicine] Socket reconnected — Re-joining session...');
      socket.emit('telemedicine:join', {
        appointmentId,
        sessionToken: sessionData.sessionToken,
        userId: currentUserId,
        role,
      });
    };

    socket.on('telemedicine:joined', handleJoined);
    socket.on('telemedicine:peer-joined', handlePeerJoined);
    socket.on('telemedicine:offer', handleOffer);
    socket.on('telemedicine:answer', handleAnswer);
    socket.on('telemedicine:ice-candidate', handleIceCandidate);
    socket.on('telemedicine:peer-left', handlePeerLeft);
    socket.on('connect', handleSocketReconnect);

    return () => {
      socket.off('telemedicine:joined', handleJoined);
      socket.off('telemedicine:peer-joined', handlePeerJoined);
      socket.off('telemedicine:offer', handleOffer);
      socket.off('telemedicine:answer', handleAnswer);
      socket.off('telemedicine:ice-candidate', handleIceCandidate);
      socket.off('telemedicine:peer-left', handlePeerLeft);
      socket.off('connect', handleSocketReconnect);

      // Clean up WebRTC & Media
      if (socket) {
        socket.emit('telemedicine:leave', { appointmentId });
      }
      if (peerConnectionRef.current) {
        peerConnectionRef.current.close();
      }
      if (localMediaStream) {
        localMediaStream.getTracks().forEach((t) => t.stop());
      }
    };
  }, [sessionData, appointmentId, role, currentUserId, createPeerConnection, startLocalMedia]);

  // ───────────────────────────────────────────────────────────────────────────
  // 5. Call Duration Timer
  // ───────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (callStarted) {
      callTimerRef.current = setInterval(() => {
        setCallDuration((prev) => prev + 1);
      }, 1000);
    }
    return () => {
      if (callTimerRef.current) clearInterval(callTimerRef.current);
    };
  }, [callStarted]);

  const formatTimer = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  // ───────────────────────────────────────────────────────────────────────────
  // 6. Media Controls (Mute Mic / Camera Toggle)
  // ───────────────────────────────────────────────────────────────────────────
  const toggleAudio = () => {
    if (localStream) {
      const audioTracks = localStream.getAudioTracks();
      audioTracks.forEach((track) => {
        track.enabled = !track.enabled;
      });
      setIsAudioMuted(!isAudioMuted);
    }
  };

  const toggleVideo = () => {
    if (localStream) {
      const videoTracks = localStream.getVideoTracks();
      videoTracks.forEach((track) => {
        track.enabled = !track.enabled;
      });
      setIsVideoMuted(!isVideoMuted);
    }
  };

  const handleEndCall = () => {
    if (window.confirm('Are you sure you want to exit this video consultation?')) {
      if (socketRef.current) {
        socketRef.current.emit('telemedicine:leave', { appointmentId });
      }
      if (peerConnectionRef.current) {
        peerConnectionRef.current.close();
      }
      if (localStream) {
        localStream.getTracks().forEach((t) => t.stop());
      }
      navigate(role === 'doctor' ? '/doctor-appointments' : '/my-appointments');
    }
  };

  const handleCompleteConsultation = async () => {
    if (
      !window.confirm(
        'Complete this consultation? This will mark the visit completed and enable post-consultation care plans and records.'
      )
    ) {
      return;
    }

    setActionLoading(true);
    try {
      const res = await fetch('/api/telemedicine/complete', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-doctor-id': currentUserId,
        },
        body: JSON.stringify({
          appointmentId,
          doctorId: currentUserId,
        }),
      });

      const json = await res.json();
      if (res.ok && json.success) {
        alert('Consultation completed successfully.');
        navigate('/doctor-appointments');
      } else {
        alert(json.error || 'Failed to complete consultation');
      }
    } catch {
      alert('Error completing consultation');
    } finally {
      setActionLoading(false);
    }
  };

  // ───────────────────────────────────────────────────────────────────────────
  // 7. Security Rejection / Authorization View
  // ───────────────────────────────────────────────────────────────────────────
  if (authorizing) {
    return (
      <div className="min-h-[75vh] flex items-center justify-center">
        <div className="text-center space-y-3">
          <div className="w-10 h-10 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-sm font-bold text-slate-700">Verifying consultation access &amp; security...</p>
          <p className="text-xs text-slate-400">Verifying appointment participant credentials</p>
        </div>
      </div>
    );
  }

  if (authError) {
    return (
      <div className="max-w-md mx-auto my-12 bg-white rounded-3xl border border-red-200 p-8 text-center shadow-lg space-y-4">
        <div className="w-16 h-16 rounded-full bg-red-50 text-red-500 flex items-center justify-center text-3xl mx-auto">
          🔐
        </div>
        <h2 className="text-xl font-black text-slate-900">Access Denied</h2>
        <p className="text-sm text-slate-600 leading-relaxed">{authError}</p>
        <div className="bg-amber-50 rounded-2xl p-4 text-xs text-amber-800 text-left space-y-1 border border-amber-200">
          <strong>Security Notice:</strong>
          <p>
            Telemedicine video consultation rooms are private and restricted to the scheduled patient
            and their attending clinician. Knowing an appointment ID does not grant room access.
          </p>
        </div>
        <button
          type="button"
          onClick={() => navigate('/home')}
          className="w-full bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold py-3 rounded-xl transition"
        >
          Return to Portal
        </button>
      </div>
    );
  }

  const apt = sessionData?.appointment;

  return (
    <div className="max-w-6xl mx-auto py-4 px-3 sm:px-4 space-y-4">
      {/* Top Bar / Consultation Header */}
      <div className="bg-slate-900 text-white rounded-2xl px-5 py-3.5 flex flex-wrap items-center justify-between gap-3 shadow-md">
        <div className="flex items-center gap-3">
          <span className="text-2xl">📹</span>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base font-black text-white">
                {role === 'doctor'
                  ? `Consultation with ${apt?.patientName}`
                  : `Dr. ${apt?.doctorName}`}
              </h1>
              <span className="text-[10px] uppercase font-bold tracking-wider bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-2 py-0.5 rounded-md">
                Encrypted P2P
              </span>
            </div>
            <p className="text-xs text-slate-400">
              {apt?.date} • {apt?.slotTime} • {apt?.doctorSpecialty}
            </p>
          </div>
        </div>

        {/* Connection Status & Timer */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 bg-slate-800 border border-slate-700 px-3 py-1.5 rounded-xl text-xs">
            <span
              className={`w-2.5 h-2.5 rounded-full ${
                connectionStatus.includes('Live')
                  ? 'bg-emerald-400 animate-pulse'
                  : connectionStatus.includes('Reconnecting')
                  ? 'bg-amber-400 animate-ping'
                  : 'bg-indigo-400'
              }`}
            />
            <span className="font-semibold text-slate-200">{connectionStatus}</span>
          </div>

          <div className="font-mono text-sm font-bold bg-slate-800 border border-slate-700 px-3 py-1.5 rounded-xl text-indigo-300">
            ⏱ {formatTimer(callDuration)}
          </div>
        </div>
      </div>

      {/* Media Permission Warning Banner (if camera/mic denied) */}
      {mediaError && (
        <div className="bg-rose-50 border border-rose-200 rounded-2xl p-4 flex items-start justify-between gap-3 text-rose-800">
          <div className="flex items-start gap-3">
            <span className="text-xl">⚠️</span>
            <div className="text-xs space-y-1">
              <strong>Device Permission Notice:</strong>
              <p>{mediaError}</p>
              <p className="text-[11px] text-rose-600">
                Tip: Click the padlock or camera icon in your browser URL bar and set Camera &amp; Microphone to &ldquo;Allow&rdquo;, then click Retry.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={startLocalMedia}
            className="bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold px-3 py-1.5 rounded-xl whitespace-nowrap"
          >
            Retry Devices
          </button>
        </div>
      )}

      {/* Video Viewports Container */}
      <div className="relative bg-slate-950 rounded-3xl overflow-hidden aspect-video max-h-[68vh] shadow-2xl border border-slate-800 flex items-center justify-center">
        {/* Remote Video (Full Screen) */}
        {remoteStream ? (
          <video
            ref={remoteVideoRef}
            autoPlay
            playsInline
            className="w-full h-full object-cover"
          />
        ) : (
          /* Waiting Room State */
          <div className="text-center p-8 text-slate-400 space-y-3">
            <div className="w-16 h-16 rounded-full bg-slate-800/80 border border-slate-700 flex items-center justify-center text-2xl mx-auto animate-pulse">
              {role === 'doctor' ? '🩺' : '👨‍⚕️'}
            </div>
            <h3 className="text-lg font-bold text-white">
              {role === 'doctor'
                ? `Waiting for ${apt?.patientName} to connect...`
                : `Waiting for Dr. ${apt?.doctorName} to join consultation...`}
            </h3>
            <p className="text-xs text-slate-500 max-w-sm mx-auto">
              Your camera and microphone are active. As soon as the other participant connects, video will begin automatically.
            </p>
            <div className="inline-flex items-center gap-2 bg-slate-900 border border-slate-800 px-3 py-1 rounded-full text-[11px] text-indigo-400">
              <span className="w-2 h-2 rounded-full bg-indigo-400 animate-ping" />
              Room ID: {sessionData?.roomId}
            </div>
          </div>
        )}

        {/* Local Video (Picture-in-Picture) */}
        <div className="absolute bottom-4 right-4 w-36 sm:w-48 aspect-video bg-slate-900 rounded-2xl overflow-hidden shadow-2xl border-2 border-slate-700/80 z-20">
          <video
            ref={localVideoRef}
            autoPlay
            playsInline
            muted
            className={`w-full h-full object-cover ${isVideoMuted ? 'hidden' : 'block'}`}
          />
          {isVideoMuted && (
            <div className="w-full h-full flex flex-col items-center justify-center text-slate-500 text-xs">
              <span>🚫</span>
              <span className="text-[10px] mt-1 font-semibold">Camera Off</span>
            </div>
          )}
          <div className="absolute bottom-1.5 left-2 text-[10px] font-bold bg-black/60 text-white px-2 py-0.5 rounded backdrop-blur-xs">
            You ({role})
          </div>
        </div>
      </div>

      {/* Bottom Control Bar */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 flex flex-wrap items-center justify-between gap-4 shadow-sm">
        <div className="flex items-center gap-2">
          {/* Mute Mic */}
          <button
            type="button"
            onClick={toggleAudio}
            className={`p-3 rounded-2xl font-bold text-xs flex items-center gap-2 transition ${
              isAudioMuted
                ? 'bg-rose-100 text-rose-700 hover:bg-rose-200'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            <span>{isAudioMuted ? '🔇' : '🎙️'}</span>
            <span>{isAudioMuted ? 'Unmute' : 'Mute'}</span>
          </button>

          {/* Toggle Camera */}
          <button
            type="button"
            onClick={toggleVideo}
            className={`p-3 rounded-2xl font-bold text-xs flex items-center gap-2 transition ${
              isVideoMuted
                ? 'bg-rose-100 text-rose-700 hover:bg-rose-200'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            <span>{isVideoMuted ? '🚫' : '📹'}</span>
            <span>{isVideoMuted ? 'Camera Off' : 'Camera On'}</span>
          </button>
        </div>

        {/* Doctor Post-Consultation Completion Actions */}
        <div className="flex items-center gap-2">
          {role === 'doctor' && (
            <button
              type="button"
              disabled={actionLoading}
              onClick={handleCompleteConsultation}
              className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold px-4 py-3 rounded-2xl transition flex items-center gap-1.5 shadow-sm disabled:opacity-50"
            >
              <span>✓</span>
              <span>Complete Consultation</span>
            </button>
          )}

          {/* End Call Button */}
          <button
            type="button"
            onClick={handleEndCall}
            className="bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold px-5 py-3 rounded-2xl transition flex items-center gap-1.5 shadow-sm"
          >
            <span>📞</span>
            <span>End Call</span>
          </button>
        </div>
      </div>
    </div>
  );
}
