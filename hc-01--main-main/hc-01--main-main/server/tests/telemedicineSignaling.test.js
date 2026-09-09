/**
 * TEST SUITE: Appointment-Based Telemedicine & WebRTC Signaling
 *
 * Verifies all security, authorization, signaling isolation, and lifecycle requirements:
 *   1.  Patient Authorization   — Scheduled patient receives session access & token
 *   2.  Doctor Authorization    — Assigned doctor receives session access & token
 *   3.  Unauthorized Third-Party — User not in appointment receives 403 Forbidden
 *   4.  Mode Guard              — In-person appointment rejects video consultation access
 *   5.  Cancelled Guard         — Cancelled appointment rejects video session access
 *   6.  HMAC Token Security     — Tampered or forged tokens are rejected
 *   7.  Signaling Isolation     — Room 1 offer/answer/ICE candidates NEVER leak into Room 2
 *   8.  Call Lifecycle          — Doctor completes consultation -> status becomes "completed"
 *   9.  Completion Auth Guard   — Doctor B cannot complete Doctor A's consultation
 *  10.  Disconnect Cleanup      — Peer leave/disconnect notifies room participants
 */

import assert from "assert";
import crypto from "crypto";

const TELEMEDICINE_SECRET = "telemedicine-sih-secret-key-2026";

// ── Token Utility Implementation for Tests ─────────────────────────────────
function generateSessionToken({ appointmentId, userId, role }) {
  const payload = {
    appointmentId: String(appointmentId),
    userId: String(userId),
    role: String(role),
    roomId: `telemedicine:apt:${appointmentId}`,
    expiresAt: Date.now() + 2 * 60 * 60 * 1000,
  };

  const payloadStr = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = crypto
    .createHmac("sha256", TELEMEDICINE_SECRET)
    .update(payloadStr)
    .digest("base64url");

  return `${payloadStr}.${signature}`;
}

function validateSessionToken(token) {
  if (!token || typeof token !== "string" || !token.includes(".")) {
    return null;
  }
  const [payloadStr, signature] = token.split(".");
  if (!payloadStr || !signature) return null;

  const expectedSig = crypto
    .createHmac("sha256", TELEMEDICINE_SECRET)
    .update(payloadStr)
    .digest("base64url");

  if (signature !== expectedSig) return null;

  try {
    const payload = JSON.parse(Buffer.from(payloadStr, "base64url").toString("utf8"));
    if (Date.now() > payload.expiresAt) return null;
    return payload;
  } catch {
    return null;
  }
}

// ── In-Memory Database ─────────────────────────────────────────────────────
const appointmentDb = {
  "apt-video-1": {
    _id: "apt-video-1",
    patientId: "patient-101",
    doctorId: "doctor-201",
    mode: "video",
    status: "booked",
    date: "2026-09-09",
    slotTime: "14:00",
  },
  "apt-video-2": {
    _id: "apt-video-2",
    patientId: "patient-102",
    doctorId: "doctor-202",
    mode: "video",
    status: "booked",
    date: "2026-09-09",
    slotTime: "15:00",
  },
  "apt-inperson": {
    _id: "apt-inperson",
    patientId: "patient-101",
    doctorId: "doctor-201",
    mode: "in-person",
    status: "booked",
    date: "2026-09-09",
    slotTime: "16:00",
  },
  "apt-cancelled": {
    _id: "apt-cancelled",
    patientId: "patient-101",
    doctorId: "doctor-201",
    mode: "video",
    status: "cancelled",
    date: "2026-09-09",
    slotTime: "17:00",
  },
};

// ── Service Logic ──────────────────────────────────────────────────────────
async function verifyTelemedicineAccess({ appointmentId, userId, role }) {
  if (!appointmentId) {
    const err = new Error("appointmentId is required");
    err.status = 400;
    throw err;
  }
  if (!userId) {
    const err = new Error("userId is required");
    err.status = 401;
    throw err;
  }
  if (!role || !["doctor", "patient"].includes(role)) {
    const err = new Error("role must be doctor or patient");
    err.status = 400;
    throw err;
  }

  const apt = appointmentDb[appointmentId];
  if (!apt) {
    const err = new Error("Appointment not found");
    err.status = 404;
    throw err;
  }
  if (apt.status === "cancelled") {
    const err = new Error("This consultation has been cancelled and cannot be joined");
    err.status = 400;
    throw err;
  }
  if (apt.mode !== "video") {
    const err = new Error("This appointment is scheduled for in-person consultation, not video");
    err.status = 400;
    throw err;
  }

  const reqUserId = String(userId);
  if (role === "patient" && apt.patientId !== reqUserId) {
    const err = new Error("Access denied. You are not the scheduled patient for this consultation.");
    err.status = 403;
    throw err;
  }
  if (role === "doctor" && apt.doctorId !== reqUserId) {
    const err = new Error("Access denied. You are not the attending doctor assigned to this consultation.");
    err.status = 403;
    throw err;
  }

  const sessionToken = generateSessionToken({
    appointmentId,
    userId: reqUserId,
    role,
  });

  return {
    authorized: true,
    sessionToken,
    roomId: `telemedicine:apt:${appointmentId}`,
    appointment: apt,
  };
}

async function completeTelemedicineConsultation({ appointmentId, doctorId }) {
  const apt = appointmentDb[appointmentId];
  if (!apt) {
    const err = new Error("Appointment not found");
    err.status = 404;
    throw err;
  }
  if (apt.doctorId !== String(doctorId)) {
    const err = new Error("Forbidden: Only the attending doctor may complete this visit");
    err.status = 403;
    throw err;
  }
  apt.status = "completed";
  return apt;
}

// ── Mock Socket Room Simulator for Signaling Isolation Testing ─────────────
class MockSocketServer {
  constructor() {
    this.rooms = new Map(); // roomId -> Set of socket clients
  }

  join(roomId, client) {
    if (!this.rooms.has(roomId)) {
      this.rooms.set(roomId, new Set());
    }
    this.rooms.get(roomId).add(client);
    client.rooms.add(roomId);
  }

  leave(roomId, client) {
    if (this.rooms.has(roomId)) {
      this.rooms.get(roomId).delete(client);
    }
    client.rooms.delete(roomId);
  }

  broadcastToRoom(roomId, senderClient, event, data) {
    const clients = this.rooms.get(roomId);
    if (!clients) return;
    for (const client of clients) {
      if (client !== senderClient) {
        client.receive(event, data);
      }
    }
  }
}

class MockSocketClient {
  constructor(id, server) {
    this.id = id;
    this.server = server;
    this.rooms = new Set();
    this.receivedEvents = [];
  }

  receive(event, data) {
    this.receivedEvents.push({ event, data });
  }

  emitToRoom(roomId, event, data) {
    this.server.broadcastToRoom(roomId, this, event, data);
  }
}

// ── Test Runner ────────────────────────────────────────────────────────────
let passed = 0;
let failed = 0;

function assertEqual(actual, expected, msg) {
  if (actual === expected) {
    console.log(`  ✓ ${msg}`);
    passed++;
  } else {
    console.error(`  ✗ ${msg} — expected [${expected}], got [${actual}]`);
    failed++;
  }
}

function assertTruthy(val, msg) {
  if (val) {
    console.log(`  ✓ ${msg}`);
    passed++;
  } else {
    console.error(`  ✗ ${msg} — expected truthy, got [${val}]`);
    failed++;
  }
}

async function runTests() {
  console.log("\n======================================================");
  console.log("TEST SUITE: Appointment-Based Telemedicine & Signaling");
  console.log("======================================================\n");

  const APT_1 = "apt-video-1";
  const APT_2 = "apt-video-2";
  const PATIENT_1 = "patient-101";
  const DOCTOR_1 = "doctor-201";
  const PATIENT_2 = "patient-102";
  const DOCTOR_2 = "doctor-202";
  const ATTACKER = "user-attacker-999";

  // ── 1. Patient Authorization ─────────────────────────────────────────────
  console.log("1. Scheduled Patient Authorization:");
  let patientToken = null;
  try {
    const res = await verifyTelemedicineAccess({
      appointmentId: APT_1,
      userId: PATIENT_1,
      role: "patient",
    });
    patientToken = res.sessionToken;
    assertTruthy(res.authorized, "patient of appointment is authorized");
    assertEqual(res.roomId, `telemedicine:apt:${APT_1}`, "room scoped to appointment");
    assertTruthy(patientToken, "receives valid session token");
  } catch (err) {
    console.error("Failed patient auth:", err);
    failed++;
  }

  // ── 2. Doctor Authorization ──────────────────────────────────────────────
  console.log("\n2. Assigned Doctor Authorization:");
  let doctorToken = null;
  try {
    const res = await verifyTelemedicineAccess({
      appointmentId: APT_1,
      userId: DOCTOR_1,
      role: "doctor",
    });
    doctorToken = res.sessionToken;
    assertTruthy(res.authorized, "assigned doctor of appointment is authorized");
    assertEqual(res.roomId, `telemedicine:apt:${APT_1}`, "room scoped to appointment");
    assertTruthy(doctorToken, "receives valid session token");
  } catch (err) {
    console.error("Failed doctor auth:", err);
    failed++;
  }

  // ── 3. Unauthorized Third-Party Rejection (403) ──────────────────────────
  console.log("\n3. Unauthorized Third-Party Rejection (Security Guard):");
  try {
    await verifyTelemedicineAccess({
      appointmentId: APT_1,
      userId: ATTACKER,
      role: "patient",
    });
    console.error("  ✗ Third party should have been rejected with 403");
    failed++;
  } catch (err) {
    assertEqual(err.status, 403, "third party rejected with 403 Forbidden");
    assertTruthy(err.message.includes("Access denied"), "clear access denied message");
  }

  // ── 4. Cross-Appointment Impersonation (Patient 2 -> Appointment 1) ──────
  console.log("\n4. Cross-Appointment IDOR Rejection:");
  try {
    await verifyTelemedicineAccess({
      appointmentId: APT_1,
      userId: PATIENT_2,
      role: "patient",
    });
    console.error("  ✗ Patient 2 entering Appointment 1 should have been rejected");
    failed++;
  } catch (err) {
    assertEqual(err.status, 403, "patient 2 rejected from appointment 1 with 403");
  }

  // ── 5. Mode & Status Guards ──────────────────────────────────────────────
  console.log("\n5. Mode & Cancelled Status Guards:");
  try {
    await verifyTelemedicineAccess({
      appointmentId: "apt-inperson",
      userId: PATIENT_1,
      role: "patient",
    });
    console.error("  ✗ In-person appointment should not be allowed into video session");
    failed++;
  } catch (err) {
    assertEqual(err.status, 400, "in-person appointment returns 400");
    assertTruthy(err.message.includes("in-person"), "mentions in-person consultation");
  }

  try {
    await verifyTelemedicineAccess({
      appointmentId: "apt-cancelled",
      userId: PATIENT_1,
      role: "patient",
    });
    console.error("  ✗ Cancelled appointment should not be allowed into video session");
    failed++;
  } catch (err) {
    assertEqual(err.status, 400, "cancelled appointment returns 400");
    assertTruthy(err.message.includes("cancelled"), "mentions appointment cancelled");
  }

  // ── 6. HMAC Token Cryptographic Verification ─────────────────────────────
  console.log("\n6. Cryptographic Token Verification:");
  const verifiedPayload = validateSessionToken(patientToken);
  assertTruthy(verifiedPayload, "valid token parses successfully");
  assertEqual(verifiedPayload.appointmentId, APT_1, "payload contains correct appointmentId");
  assertEqual(verifiedPayload.userId, PATIENT_1, "payload contains correct userId");

  // Tampered signature
  const tamperedToken = patientToken.slice(0, -4) + "XXXX";
  const tamperedPayload = validateSessionToken(tamperedToken);
  assertEqual(tamperedPayload, null, "tampered signature is rejected");

  // Arbitrary garbage string
  assertEqual(validateSessionToken("not-a-token"), null, "garbage string is rejected");

  // ── 7. Signaling Isolation: Room 1 NEVER Leaks to Room 2 ──────────────────
  console.log("\n7. WebRTC Signaling Isolation Between Appointment Rooms:");
  const server = new MockSocketServer();

  const clientApt1_Doctor = new MockSocketClient("s-doc-1", server);
  const clientApt1_Patient = new MockSocketClient("s-pat-1", server);
  const clientApt2_Doctor = new MockSocketClient("s-doc-2", server);
  const clientApt2_Patient = new MockSocketClient("s-pat-2", server);

  const room1 = `telemedicine:apt:${APT_1}`;
  const room2 = `telemedicine:apt:${APT_2}`;

  server.join(room1, clientApt1_Doctor);
  server.join(room1, clientApt1_Patient);
  server.join(room2, clientApt2_Doctor);
  server.join(room2, clientApt2_Patient);

  // Doctor 1 sends offer in Room 1
  clientApt1_Doctor.emitToRoom(room1, "telemedicine:offer", {
    offer: { type: "offer", sdp: "v=0...APT1_OFFER" },
  });

  assertEqual(clientApt1_Patient.receivedEvents.length, 1, "patient in room 1 receives the offer");
  assertEqual(clientApt1_Patient.receivedEvents[0].data.offer.sdp, "v=0...APT1_OFFER", "offer payload intact");
  assertEqual(clientApt2_Doctor.receivedEvents.length, 0, "doctor in room 2 receives NOTHING from room 1");
  assertEqual(clientApt2_Patient.receivedEvents.length, 0, "patient in room 2 receives NOTHING from room 1");

  // Patient 1 sends answer in Room 1
  clientApt1_Patient.emitToRoom(room1, "telemedicine:answer", {
    answer: { type: "answer", sdp: "v=0...APT1_ANSWER" },
  });

  assertEqual(clientApt1_Doctor.receivedEvents.length, 1, "doctor in room 1 receives the answer");
  assertEqual(clientApt2_Doctor.receivedEvents.length, 0, "doctor in room 2 still receives nothing");

  // Doctor 1 sends ICE candidate in Room 1
  clientApt1_Doctor.emitToRoom(room1, "telemedicine:ice-candidate", {
    candidate: { candidate: "candidate:1 1 UDP 2122260223" },
  });

  assertEqual(clientApt1_Patient.receivedEvents.length, 2, "patient in room 1 receives ICE candidate");
  assertEqual(clientApt2_Doctor.receivedEvents.length, 0, "room 2 completely isolated from ICE candidates");

  // ── 8. Call Lifecycle & Consultation Completion ──────────────────────────
  console.log("\n8. Call Lifecycle & Completion:");
  try {
    // Attending doctor completes consultation
    const completedApt = await completeTelemedicineConsultation({
      appointmentId: APT_1,
      doctorId: DOCTOR_1,
    });
    assertEqual(completedApt.status, "completed", "appointment status updated to 'completed'");

    // Unauthorized doctor tries to complete
    try {
      await completeTelemedicineConsultation({
        appointmentId: APT_1,
        doctorId: DOCTOR_2,
      });
      console.error("  ✗ Doctor 2 completing Doctor 1 appointment should have failed");
      failed++;
    } catch (err) {
      assertEqual(err.status, 403, "unauthorized doctor completion rejected with 403");
    }
  } catch (err) {
    console.error("Failed call lifecycle test:", err);
    failed++;
  }

  // ── 9. Disconnect & Leave Notifications ──────────────────────────────────
  console.log("\n9. Peer Leave & Disconnect Signaling:");
  clientApt1_Patient.emitToRoom(room1, "telemedicine:peer-left", {
    socketId: clientApt1_Patient.id,
  });
  server.leave(room1, clientApt1_Patient);

  const docLastEvent = clientApt1_Doctor.receivedEvents[clientApt1_Doctor.receivedEvents.length - 1];
  assertEqual(docLastEvent.event, "telemedicine:peer-left", "doctor receives peer-left notification");
  assertEqual(docLastEvent.data.socketId, clientApt1_Patient.id, "notifies leaving socket ID");

  console.log("\n======================================================");
  console.log(`Results: ${passed} passed, ${failed} failed`);
  console.log("======================================================\n");

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((e) => {
  console.error("Test execution failed:", e);
  process.exit(1);
});
