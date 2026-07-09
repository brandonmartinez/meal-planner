import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  useCallback,
  ReactNode,
} from 'react';
import { io, type Socket } from 'socket.io-client';
import {
  RealtimeEvent,
  type RealtimeEventName,
  type RealtimeFamilyEvent,
} from '@meal-planner/shared';
import { useAuth } from './AuthContext';

/**
 * Real-time (WebSocket) connection provider for issue #207.
 *
 * A single socket.io connection is opened per authenticated user. The server
 * authenticates the handshake with the same httpOnly `token` cookie the REST
 * API uses (sent via `withCredentials`) and joins the socket to a room for
 * every family the user belongs to — the client never requests rooms. Because
 * the socket is already in all of the user's family rooms, switching the active
 * family in the UI does NOT require a reconnect; pages filter incoming events by
 * `familyId` themselves.
 *
 * The connection is same-origin (`io()` with no URL targets
 * `window.location.origin` at path `/socket.io`). In dev, Vite proxies
 * `/socket.io` to the API with `ws: true`; in prod the SPA and API share an
 * origin behind the ingress, so the same relative connection works.
 */

type EventHandler = (payload: RealtimeFamilyEvent) => void;

interface SocketContextValue {
  /** Whether the socket is currently connected. */
  connected: boolean;
  /**
   * Register a handler for a real-time event. Returns an unsubscribe function.
   * Prefer the {@link useRealtimeEvent} hook over calling this directly.
   */
  subscribe: (event: RealtimeEventName, handler: EventHandler) => () => void;
}

const SocketContext = createContext<SocketContextValue | undefined>(undefined);

export function SocketProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const userId = user?.id ?? null;

  const socketRef = useRef<Socket | null>(null);
  const handlersRef = useRef<Map<RealtimeEventName, Set<EventHandler>>>(
    new Map(),
  );
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    // No authenticated user — ensure any existing socket is torn down.
    if (!userId) {
      socketRef.current?.disconnect();
      socketRef.current = null;
      setConnected(false);
      return;
    }

    // Same-origin connection; the httpOnly auth cookie is sent by the browser.
    // socket.io handles reconnection/backoff automatically.
    const socket = io({ withCredentials: true });
    socketRef.current = socket;

    socket.on('connect', () => setConnected(true));
    socket.on('disconnect', () => setConnected(false));

    // Fan every known event out to the handlers registered for it.
    for (const name of Object.values(RealtimeEvent)) {
      socket.on(name, (payload: RealtimeFamilyEvent) => {
        const handlers = handlersRef.current.get(name);
        if (!handlers) return;
        for (const handler of handlers) handler(payload);
      });
    }

    return () => {
      socket.disconnect();
      socketRef.current = null;
      setConnected(false);
    };
  }, [userId]);

  const subscribe = useCallback(
    (event: RealtimeEventName, handler: EventHandler) => {
      let handlers = handlersRef.current.get(event);
      if (!handlers) {
        handlers = new Set();
        handlersRef.current.set(event, handlers);
      }
      handlers.add(handler);
      return () => {
        handlers?.delete(handler);
      };
    },
    [],
  );

  return (
    <SocketContext.Provider value={{ connected, subscribe }}>
      {children}
    </SocketContext.Provider>
  );
}

export function useSocket() {
  const context = useContext(SocketContext);
  if (!context) throw new Error('useSocket must be used within SocketProvider');
  return context;
}

/**
 * Subscribe to a real-time event for the lifetime of the calling component.
 * The latest `handler` is always invoked without re-subscribing when its
 * identity changes, so callers can pass inline closures freely.
 */
export function useRealtimeEvent(
  event: RealtimeEventName,
  handler: EventHandler,
): void {
  const { subscribe } = useSocket();
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    return subscribe(event, (payload) => handlerRef.current(payload));
  }, [event, subscribe]);
}
