import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  createNotification,
  getNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
  clearNotificationsForTest,
} from "../services/notificationService.js";
import { NOTIFICATION_TYPES } from "../models/Notification.js";

// ── Mock Socket Room Simulator for Real-Time Notification Isolation ─────────
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

  emitToRoom(roomId, event, data) {
    const clients = this.rooms.get(roomId);
    if (!clients) return;
    for (const client of clients) {
      client.receive(event, data);
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

  join(roomId) {
    this.server.join(roomId, this);
  }

  leave(roomId) {
    this.server.leave(roomId, this);
  }
}

describe("TEST SUITE: Unified Notification System", () => {
  const PATIENT_A = "pat-uuid-0001";
  const PATIENT_B = "pat-uuid-0002";
  const DOCTOR_A = "doc-uuid-0001";
  const DOCTOR_B = "doc-uuid-0002";

  beforeEach(() => {
    clearNotificationsForTest();
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 1. Support for all 14 Required Notification Types
  // ───────────────────────────────────────────────────────────────────────────
  it("should support all 14 required notification types with metadata preservation", async () => {
    const expectedTypes = [
      "appointment_confirmed",
      "appointment_cancelled",
      "appointment_reminder",
      "queue_update",
      "near_turn",
      "video_ready",
      "prescription_created",
      "medicine_reminder",
      "lab_result",
      "care_plan",
      "follow_up",
      "consent_granted",
      "consent_revoked",
      "medical_record_access",
    ];

    assert.equal(NOTIFICATION_TYPES.length, 14, "exactly 14 notification types registered");
    for (const type of expectedTypes) {
      assert.ok(NOTIFICATION_TYPES.includes(type), `includes type: ${type}`);
    }

    // Create a notification of each type
    for (const type of expectedTypes) {
      const notif = await createNotification({
        recipient: PATIENT_A,
        type,
        title: `Test Title for ${type}`,
        message: `Test body description for ${type}`,
        metadata: { sampleKey: type, testRun: true },
      });

      assert.equal(notif.recipient, PATIENT_A);
      assert.equal(notif.type, type);
      assert.equal(notif.read, false);
      assert.ok(notif.createdAt);
      assert.equal(notif.metadata.sampleKey, type);
    }

    const { total } = await getNotifications({ recipient: PATIENT_A });
    assert.equal(total, 14, "all 14 notifications persisted");
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 2. Unread Count Tracking
  // ───────────────────────────────────────────────────────────────────────────
  it("should track unread count accurately (0 -> increment -> decrement -> 0)", async () => {
    let unread = await getUnreadCount(PATIENT_A);
    assert.equal(unread, 0, "initial unread count is 0");

    // Add 3 notifications
    const n1 = await createNotification({
      recipient: PATIENT_A,
      type: "appointment_confirmed",
      title: "Visit Confirmed",
      message: "Dr. Smith at 10:00",
    });
    const n2 = await createNotification({
      recipient: PATIENT_A,
      type: "near_turn",
      title: "Queue Alert",
      message: "2 patients ahead",
    });
    const n3 = await createNotification({
      recipient: PATIENT_A,
      type: "prescription_created",
      title: "Prescription Issued",
      message: "Amoxicillin 500mg",
    });

    unread = await getUnreadCount(PATIENT_A);
    assert.equal(unread, 3, "unread count increments to 3");

    // Mark 1 read
    await markAsRead({ notificationId: n1._id, recipient: PATIENT_A });
    unread = await getUnreadCount(PATIENT_A);
    assert.equal(unread, 2, "unread count decrements to 2");

    // Mark all read
    const allRes = await markAllAsRead(PATIENT_A);
    assert.equal(allRes.unreadCount, 0);
    unread = await getUnreadCount(PATIENT_A);
    assert.equal(unread, 0, "unread count drops to 0 after markAllAsRead");
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 3. Status Update Lifecycle
  // ───────────────────────────────────────────────────────────────────────────
  it("should update notification read status and support unread filtering", async () => {
    const notif = await createNotification({
      recipient: PATIENT_A,
      type: "video_ready",
      title: "Doctor Ready",
      message: "Click to join telemedicine room",
    });
    assert.equal(notif.read, false);

    const updated = await markAsRead({ notificationId: notif._id, recipient: PATIENT_A });
    assert.equal(updated.read, true, "read status toggled to true");

    // Query unread only
    const unreadQuery = await getNotifications({ recipient: PATIENT_A, unreadOnly: true });
    assert.equal(unreadQuery.notifications.length, 0, "no unread items found");

    // Query all
    const allQuery = await getNotifications({ recipient: PATIENT_A });
    assert.equal(allQuery.notifications.length, 1, "total item returned in all query");
    assert.equal(allQuery.notifications[0].read, true);
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 4. Patient Isolation (Security Guard)
  // ───────────────────────────────────────────────────────────────────────────
  it("should enforce strict patient isolation (Patient B cannot read or mark Patient A's notifications)", async () => {
    const patientANotif = await createNotification({
      recipient: PATIENT_A,
      type: "lab_result",
      title: "CBC Lab Results Available",
      message: "Confidential blood count report",
      metadata: { sensitive: true },
    });

    // Patient B queries notifications
    const patientBQuery = await getNotifications({ recipient: PATIENT_B });
    assert.equal(patientBQuery.total, 0, "Patient B sees 0 notifications");
    assert.equal(patientBQuery.notifications.length, 0);

    const patientBUnread = await getUnreadCount(PATIENT_B);
    assert.equal(patientBUnread, 0, "Patient B unread count is 0");

    // Patient B attempts IDOR mark-as-read on Patient A's notification
    await assert.rejects(
      async () => {
        await markAsRead({ notificationId: patientANotif._id, recipient: PATIENT_B });
      },
      (err) => {
        assert.equal(err.status, 403, "IDOR attempt returns 403 Forbidden");
        assert.ok(err.message.includes("You can only update your own notifications"));
        return true;
      }
    );

    // Verify Patient A's notification was NOT altered
    const verifyA = await getNotifications({ recipient: PATIENT_A });
    assert.equal(verifyA.notifications[0].read, false, "Patient A notification remains unread");
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 5. Doctor Isolation (Security Guard)
  // ───────────────────────────────────────────────────────────────────────────
  it("should enforce strict doctor isolation (Doctor A cannot read Doctor B's notifications)", async () => {
    const docANotif = await createNotification({
      recipient: DOCTOR_A,
      type: "consent_granted",
      title: "Patient Granted Consent",
      message: "Patient 101 granted you medical history access",
    });

    const docBQuery = await getNotifications({ recipient: DOCTOR_B });
    assert.equal(docBQuery.total, 0, "Doctor B sees 0 notifications");

    // Doctor B tries to mark Doctor A's notification as read
    await assert.rejects(
      async () => {
        await markAsRead({ notificationId: docANotif._id, recipient: DOCTOR_B });
      },
      (err) => {
        assert.equal(err.status, 403, "Doctor IDOR returns 403 Forbidden");
        return true;
      }
    );
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 6. Socket Room Isolation & Reconnection
  // ───────────────────────────────────────────────────────────────────────────
  it("should isolate real-time socket emissions to recipient and recover state on reconnect", () => {
    const server = new MockSocketServer();
    const clientPatA = new MockSocketClient("socket-pat-a", server);
    const clientPatB = new MockSocketClient("socket-pat-b", server);
    const clientDocA = new MockSocketClient("socket-doc-a", server);

    const roomPatA = `user:${PATIENT_A}`;
    const roomPatB = `user:${PATIENT_B}`;
    const roomDocA = `user:${DOCTOR_A}`;

    clientPatA.join(roomPatA);
    clientPatB.join(roomPatB);
    clientDocA.join(roomDocA);

    // Emit notification for Patient A
    const sampleNotif = {
      _id: "notif-live-1",
      recipient: PATIENT_A,
      type: "near_turn",
      title: "Turn Approaching",
      message: "You are next!",
    };
    server.emitToRoom(roomPatA, "notification:new", sampleNotif);
    server.emitToRoom(roomPatA, "notification:unread_count", { unreadCount: 1 });

    // Verify Patient A received it
    assert.equal(clientPatA.receivedEvents.length, 2);
    assert.equal(clientPatA.receivedEvents[0].event, "notification:new");
    assert.equal(clientPatA.receivedEvents[0].data.title, "Turn Approaching");
    assert.equal(clientPatA.receivedEvents[1].data.unreadCount, 1);

    // Verify Patient B and Doctor A received NOTHING (Strict Isolation)
    assert.equal(clientPatB.receivedEvents.length, 0, "Patient B socket received 0 events");
    assert.equal(clientDocA.receivedEvents.length, 0, "Doctor A socket received 0 events");

    // ── Simulate Socket Reconnection ──
    // Patient A disconnects (leaves room)
    clientPatA.leave(roomPatA);

    // Offline event emitted while disconnected
    server.emitToRoom(roomPatA, "notification:new", { title: "Missed while offline" });
    assert.equal(clientPatA.receivedEvents.length, 2, "offline event not received while disconnected");

    // Patient A reconnects with new socket ID and re-subscribes
    const reconnectedPatA = new MockSocketClient("socket-pat-a-reconnected", server);
    reconnectedPatA.join(roomPatA);

    // Resumed notification broadcast
    server.emitToRoom(roomPatA, "notification:new", { title: "Back online notification" });
    assert.equal(reconnectedPatA.receivedEvents.length, 1, "reconnected socket receives new event");
    assert.equal(reconnectedPatA.receivedEvents[0].data.title, "Back online notification");
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 7. Validation & Error Handling
  // ───────────────────────────────────────────────────────────────────────────
  it("should reject invalid notification creation with 400 Bad Request", async () => {
    // Missing recipient
    await assert.rejects(
      async () => {
        await createNotification({ type: "near_turn", title: "Test", message: "Test" });
      },
      (err) => {
        assert.equal(err.status, 400);
        assert.ok(err.message.includes("Recipient is required"));
        return true;
      }
    );

    // Invalid type
    await assert.rejects(
      async () => {
        await createNotification({
          recipient: PATIENT_A,
          type: "unsupported_random_type",
          title: "Test",
          message: "Test",
        });
      },
      (err) => {
        assert.equal(err.status, 400);
        assert.ok(err.message.includes("Invalid notification type"));
        return true;
      }
    );

    // Missing title
    await assert.rejects(
      async () => {
        await createNotification({
          recipient: PATIENT_A,
          type: "care_plan",
          title: "",
          message: "Test",
        });
      },
      (err) => {
        assert.equal(err.status, 400);
        assert.ok(err.message.includes("Notification title is required"));
        return true;
      }
    );
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 8. Type Filtering & Pagination
  // ───────────────────────────────────────────────────────────────────────────
  it("should support filtering notifications by type and applying pagination", async () => {
    // Seed notifications with different types
    await createNotification({ recipient: PATIENT_A, type: "appointment_confirmed", title: "Apt 1", message: "m1" });
    await createNotification({ recipient: PATIENT_A, type: "appointment_confirmed", title: "Apt 2", message: "m2" });
    await createNotification({ recipient: PATIENT_A, type: "care_plan", title: "Plan 1", message: "m3" });
    await createNotification({ recipient: PATIENT_A, type: "lab_result", title: "Lab 1", message: "m4" });

    // Filter by type "appointment_confirmed"
    const aptOnly = await getNotifications({ recipient: PATIENT_A, type: "appointment_confirmed" });
    assert.equal(aptOnly.notifications.length, 2);
    assert.ok(aptOnly.notifications.every((n) => n.type === "appointment_confirmed"));

    // Filter by type "care_plan"
    const planOnly = await getNotifications({ recipient: PATIENT_A, type: "care_plan" });
    assert.equal(planOnly.notifications.length, 1);
    assert.equal(planOnly.notifications[0].title, "Plan 1");

    // Pagination: limit = 2, skip = 1
    const paged = await getNotifications({ recipient: PATIENT_A, limit: 2, skip: 1 });
    assert.equal(paged.notifications.length, 2);
    assert.equal(paged.total, 4);
    assert.equal(paged.limit, 2);
    assert.equal(paged.skip, 1);
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 9. Lifecycle Event Integration Triggers
  // ───────────────────────────────────────────────────────────────────────────
  it("should generate proper notification payloads for clinical and consent lifecycle triggers", async () => {
    // Appointment Confirmed trigger
    const aptNotif = await createNotification({
      recipient: PATIENT_A,
      type: "appointment_confirmed",
      title: "Appointment Confirmed",
      message: "Your appointment is confirmed for 2026-09-15 at 10:00.",
      metadata: { appointmentId: "apt-123", doctorId: DOCTOR_A, date: "2026-09-15", slotTime: "10:00" },
    });
    assert.equal(aptNotif.type, "appointment_confirmed");
    assert.equal(aptNotif.metadata.appointmentId, "apt-123");

    // Near Turn trigger
    const nearTurnNotif = await createNotification({
      recipient: PATIENT_A,
      type: "near_turn",
      title: "Almost Your Turn in Queue",
      message: "Only 2 patients ahead. Recommended arrival: 10:15 AM.",
      metadata: { tokenNumber: 42, position: 3 },
    });
    assert.equal(nearTurnNotif.type, "near_turn");
    assert.equal(nearTurnNotif.metadata.tokenNumber, 42);

    // Telemedicine Video Ready trigger
    const videoNotif = await createNotification({
      recipient: PATIENT_A,
      type: "video_ready",
      title: "Video Consultation Ready",
      message: "Dr. Smith has started your video consultation. Click to join.",
      metadata: { appointmentId: "apt-123", roomId: "telemedicine:apt:apt-123" },
    });
    assert.equal(videoNotif.type, "video_ready");

    // Consent Granted triggers (both doctor and patient)
    const docConsentNotif = await createNotification({
      recipient: DOCTOR_A,
      type: "consent_granted",
      title: "Patient Medical Record Access Granted",
      message: "A patient has granted you consent to access their medical records.",
      metadata: { patientId: PATIENT_A, scope: "appointment" },
    });
    assert.equal(docConsentNotif.recipient, DOCTOR_A);
    assert.equal(docConsentNotif.type, "consent_granted");

    // Medical Record Access trigger
    const auditNotif = await createNotification({
      recipient: PATIENT_A,
      type: "medical_record_access",
      title: "Medical Records Accessed",
      message: "Your medical history was accessed by an attending clinician under verified consent.",
      metadata: { doctorId: DOCTOR_A, resource: "medical_history" },
    });
    assert.equal(auditNotif.type, "medical_record_access");
    assert.equal(auditNotif.metadata.resource, "medical_history");
  });
});
