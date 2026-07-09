// Real-time (WebSocket) event contracts shared by the API server and web client
// (issue #207). Transport is socket.io; connections join a room per family
// (keyed by familyId) and the server broadcasts these typed events to a family's
// room after a successful mutation. Every payload is family-scoped so a client
// only ever acts on events for a family it belongs to.

/**
 * Socket.io event names emitted by the API to a family room. String literal
 * values are the wire names — keep them stable; clients subscribe by name.
 */
export const RealtimeEvent = {
  /** Grocery list (items or generation) changed for the family. */
  GroceryChanged: "grocery:changed",
  /** Week plan structure (weeks/days) changed for the family. */
  WeekPlanChanged: "weekplan:changed",
  /** A meal suggestion (add/approve/remove/move/schedule) changed. */
  SuggestionChanged: "suggestion:changed",
} as const;

export type RealtimeEventName =
  (typeof RealtimeEvent)[keyof typeof RealtimeEvent];

/**
 * Base shape for every real-time event: the family the change belongs to. The
 * client refreshes its active view when the event's familyId matches the
 * family it is currently displaying.
 */
export interface RealtimeFamilyEvent {
  familyId: string;
}

export type GroceryChangedEvent = RealtimeFamilyEvent;
export type WeekPlanChangedEvent = RealtimeFamilyEvent;
export type SuggestionChangedEvent = RealtimeFamilyEvent;

/**
 * Maps each event name to its payload type. Used by both server emit helpers
 * and the client hook to keep names and payloads in lockstep.
 */
export interface RealtimeEventPayloads {
  [RealtimeEvent.GroceryChanged]: GroceryChangedEvent;
  [RealtimeEvent.WeekPlanChanged]: WeekPlanChangedEvent;
  [RealtimeEvent.SuggestionChanged]: SuggestionChangedEvent;
}
