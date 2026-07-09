// Real-time server registry + typed emit helpers (issue #207).
//
// The socket.io server is created and attached to the HTTP server at startup
// (from index.ts). Route handlers call the `emit*` helpers after a successful
// mutation to broadcast a typed event to the mutating family's room. The
// helpers no-op when no server is attached, so unit tests that import the
// Express app (without starting the socket server) are unaffected.
//
// Rooms are keyed by familyId and joined SERVER-SIDE only, after the handshake
// auth resolves the allowed familyIds. Clients never request rooms directly, so
// one family can never receive another family's events.

import type { Server as HttpServer } from "http";
import { Server as SocketIOServer } from "socket.io";
import { RealtimeEvent } from "@meal-planner/shared";
import { config } from "../config/index.js";
import { authenticateSocket } from "./auth.js";
import {
  parseAllowedOrigins,
  isOriginAllowed,
  resolveClientIp,
  createHandshakeThrottle,
} from "./handshake.js";

let io: SocketIOServer | null = null;

// setTimeout delays are clamped to a signed 32-bit int (~24.8 days); a larger
// delay fires immediately. Cap scheduled expiry disconnects to this so an
// unusually long-lived token schedules a valid (if early) re-auth rather than
// an instant disconnect. Normal tokens (7d default) are well under this.
const MAX_TIMEOUT_MS = 2147483647;

/** Internal room name for a family. Server-internal detail; not sent to clients. */
export function roomForFamily(familyId: string): string {
  return `family:${familyId}`;
}

/**
 * Create the socket.io server, wire the handshake guards + auth middleware +
 * connection handler, and attach it to the given HTTP server. Returns the
 * server instance.
 *
 * Handshake middleware order (defense in depth, cheapest/broadest first):
 *   1. Throttle  — IP-keyed connection-flood guard (#213).
 *   2. Origin    — explicit browser-Origin allowlist, reusing the HTTP CORS
 *                  source (config.clientUrl) (#213).
 *   3. Auth      — the single trust boundary (authenticateSocket).
 */
export function initRealtime(httpServer: HttpServer): SocketIOServer {
  const server = new SocketIOServer(httpServer, {
    cors: { origin: config.clientUrl, credentials: true },
  });

  const allowedOrigins = parseAllowedOrigins(config.clientUrl);
  const throttle = createHandshakeThrottle({
    windowMs: config.realtime.handshakeWindowMs,
    limit: config.realtime.handshakeLimit,
  });

  // 1. Handshake throttle — blunt connection floods before any auth/DB work.
  // Keyed by the REAL client IP (X-Forwarded-For honouring trust proxy), never
  // the ingress address, mirroring the HTTP rate-limiters.
  server.use((socket, next) => {
    const ip = resolveClientIp(socket.handshake, config.trustProxy);
    if (!throttle.check(ip)) {
      next(new Error("Too many connection attempts"));
      return;
    }
    next();
  });

  // 2. Explicit WS Origin gate. Socket.IO's `cors` alone does not hard-reject a
  // cross-origin WebSocket upgrade, so re-check the browser Origin here. Missing
  // Origin (non-browser clients) is allowed by policy — see isOriginAllowed.
  server.use((socket, next) => {
    const origin = socket.handshake.headers.origin;
    const value = Array.isArray(origin) ? origin[0] : origin;
    if (!isOriginAllowed(value, allowedOrigins)) {
      next(new Error("Origin not allowed"));
      return;
    }
    next();
  });

  // 3. Handshake auth — the single trust boundary. Reject unauthenticated sockets.
  server.use(async (socket, next) => {
    try {
      const auth = await authenticateSocket(socket.handshake);
      if (!auth) {
        next(new Error("Unauthorized"));
        return;
      }
      socket.data.familyIds = auth.familyIds;
      socket.data.authKind = auth.kind;
      // Only JWT (app-user) connections carry an expiry; API-key connections do
      // not, so tokenExp stays undefined and no disconnect is scheduled below.
      socket.data.tokenExp = auth.tokenExp;
      next();
    } catch {
      next(new Error("Unauthorized"));
    }
  });

  server.on("connection", (socket) => {
    const familyIds: string[] = socket.data.familyIds ?? [];
    // Server-side room join only — clients cannot request arbitrary rooms.
    for (const familyId of familyIds) {
      void socket.join(roomForFamily(familyId));
    }

    scheduleExpiryDisconnect(socket);
  });

  io = server;
  return server;
}

/**
 * For JWT-authed sockets, schedule a disconnect when the token expires so a
 * connection cannot outlive its credential (#213). API-key sockets have no
 * `exp` (tokenExp undefined) and are left connected. The timer is cleared on
 * `disconnect` to avoid leaks, and `unref`'d so it never keeps the process
 * alive. Exported for unit testing under fake timers.
 */
export function scheduleExpiryDisconnect(socket: {
  data: { authKind?: string; tokenExp?: number };
  disconnect: (close?: boolean) => unknown;
  on: (event: string, listener: () => void) => unknown;
}): void {
  if (socket.data.authKind !== "user") return;
  const tokenExp = socket.data.tokenExp;
  if (typeof tokenExp !== "number") return;

  const delay = tokenExp - Date.now();
  if (delay <= 0) {
    socket.disconnect(true);
    return;
  }

  const timer = setTimeout(() => {
    socket.disconnect(true);
  }, Math.min(delay, MAX_TIMEOUT_MS));
  if (typeof timer.unref === "function") timer.unref();

  socket.on("disconnect", () => {
    clearTimeout(timer);
  });
}

/** Directly set (or clear) the attached server. Used by tests. */
export function setRealtimeServer(server: SocketIOServer | null): void {
  io = server;
}

function emitToFamily(event: string, familyId: string): void {
  if (!io) return;
  io.to(roomForFamily(familyId)).emit(event, { familyId });
}

/** Grocery list (items or generation) changed for a family. */
export function emitGroceryChanged(familyId: string): void {
  emitToFamily(RealtimeEvent.GroceryChanged, familyId);
}

/** Week plan structure changed for a family. */
export function emitWeekPlanChanged(familyId: string): void {
  emitToFamily(RealtimeEvent.WeekPlanChanged, familyId);
}

/** A meal suggestion changed for a family. */
export function emitSuggestionChanged(familyId: string): void {
  emitToFamily(RealtimeEvent.SuggestionChanged, familyId);
}
