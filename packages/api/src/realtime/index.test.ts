import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { scheduleExpiryDisconnect, roomForFamily } from "./index.js";

interface FakeSocket {
  data: { authKind?: string; tokenExp?: number };
  disconnect: ReturnType<typeof vi.fn>;
  on: ReturnType<typeof vi.fn>;
  _disconnectHandlers: Array<() => void>;
}

function fakeSocket(data: FakeSocket["data"]): FakeSocket {
  const handlers: Array<() => void> = [];
  return {
    data,
    disconnect: vi.fn(),
    on: vi.fn((event: string, listener: () => void) => {
      if (event === "disconnect") handlers.push(listener);
    }),
    _disconnectHandlers: handlers,
  };
}

describe("roomForFamily", () => {
  it("namespaces the family room", () => {
    expect(roomForFamily("fam-1")).toBe("family:fam-1");
  });
});

describe("scheduleExpiryDisconnect", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("disconnects a JWT socket when its token expires", () => {
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    const expMs = Date.now() + 60_000; // 1 minute out
    const socket = fakeSocket({ authKind: "user", tokenExp: expMs });

    scheduleExpiryDisconnect(socket as never);
    expect(socket.disconnect).not.toHaveBeenCalled();

    vi.advanceTimersByTime(59_999);
    expect(socket.disconnect).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(socket.disconnect).toHaveBeenCalledWith(true);
  });

  it("disconnects immediately when the token is already expired", () => {
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    const socket = fakeSocket({ authKind: "user", tokenExp: Date.now() - 1 });

    scheduleExpiryDisconnect(socket as never);
    expect(socket.disconnect).toHaveBeenCalledWith(true);
  });

  it("does NOT schedule a disconnect for API-key sockets (no exp)", () => {
    const socket = fakeSocket({ authKind: "apiKey", tokenExp: undefined });
    scheduleExpiryDisconnect(socket as never);

    vi.advanceTimersByTime(10 * 24 * 60 * 60 * 1000); // 10 days
    expect(socket.disconnect).not.toHaveBeenCalled();
    expect(socket.on).not.toHaveBeenCalled();
  });

  it("does NOT schedule a disconnect for a user socket missing tokenExp", () => {
    const socket = fakeSocket({ authKind: "user", tokenExp: undefined });
    scheduleExpiryDisconnect(socket as never);

    vi.advanceTimersByTime(10 * 24 * 60 * 60 * 1000);
    expect(socket.disconnect).not.toHaveBeenCalled();
  });

  it("clears the timer on disconnect so it does not fire (no leak)", () => {
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    const socket = fakeSocket({ authKind: "user", tokenExp: Date.now() + 60_000 });

    scheduleExpiryDisconnect(socket as never);
    expect(socket.on).toHaveBeenCalledWith("disconnect", expect.any(Function));

    // Simulate the socket disconnecting early (e.g. client closed the tab).
    for (const handler of socket._disconnectHandlers) handler();

    vi.advanceTimersByTime(120_000);
    // disconnect() was never called by the (now-cleared) expiry timer.
    expect(socket.disconnect).not.toHaveBeenCalled();
  });
});
