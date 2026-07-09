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

let io: SocketIOServer | null = null;

/** Internal room name for a family. Server-internal detail; not sent to clients. */
export function roomForFamily(familyId: string): string {
  return `family:${familyId}`;
}

/**
 * Create the socket.io server, wire the auth middleware + connection handler,
 * and attach it to the given HTTP server. Returns the server instance.
 */
export function initRealtime(httpServer: HttpServer): SocketIOServer {
  const server = new SocketIOServer(httpServer, {
    cors: { origin: config.clientUrl, credentials: true },
  });

  // Handshake auth — the single trust boundary. Reject unauthenticated sockets.
  server.use(async (socket, next) => {
    try {
      const auth = await authenticateSocket(socket.handshake);
      if (!auth) {
        next(new Error("Unauthorized"));
        return;
      }
      socket.data.familyIds = auth.familyIds;
      socket.data.authKind = auth.kind;
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
  });

  io = server;
  return server;
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
