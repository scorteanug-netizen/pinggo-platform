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
  HANDOVER_NOTIFIED: "handover_notified",
  HANDOVER_NOTIFICATION_BLOCKED: "handover_notification_blocked",
  HANDOVER_NOTIFICATION_FAILED: "handover_notification_failed",

  // Agent notifications
  AGENT_CONFIRMED_HANDOVER: "agent_confirmed_handover",
  AGENT_DECLINED_HANDOVER: "agent_declined_handover",
  AGENT_OUTCOME_REPORTED: "agent_outcome_reported",

  // Messaging
  MESSAGE_QUEUED: "message_queued",
  MESSAGE_BLOCKED: "message_blocked",

  // Lead
  LEAD_RECEIVED: "lead_received",
  LEAD_INCOMPLETE: "lead_incomplete",

  // Integrations
  FACEBOOK_LEADGEN_RECEIVED: "facebook_leadgen_received",
  GOOGLE_CALENDAR_EVENT_CREATED: "google_calendar_event_created",
} as const;

export type LeadEventTypeValue = (typeof LeadEventType)[keyof typeof LeadEventType];
