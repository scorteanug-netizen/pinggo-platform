/**
 * Central registry of LeadEvent and EventLog type strings.
 * Use these constants instead of raw string literals to avoid typos
 * and get autocomplete across the codebase.
 */

export const LeadEventType = {
  // Autopilot lifecycle
  AUTOPILOT_STARTED: "autopilot_started",
  AUTOPILOT_ACK: "autopilot_ack",
  AUTOPILOT_MESSAGE_RECEIVED: "autopilot_message_received",
  AUTOPILOT_QUESTION_ASKED: "autopilot_question_asked",
  AUTOPILOT_BOOKING_OFFERED: "autopilot_booking_offered",

  // Handover
  HANDOVER_REQUESTED: "handover_requested",

  // Messaging
  MESSAGE_QUEUED: "message_queued",
  MESSAGE_BLOCKED: "message_blocked",

  // Lead
  LEAD_RECEIVED: "lead_received",
} as const;

export type LeadEventTypeValue = (typeof LeadEventType)[keyof typeof LeadEventType];
