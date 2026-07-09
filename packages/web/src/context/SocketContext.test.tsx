import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, act } from '@testing-library/react';
import { RealtimeEvent, type RealtimeFamilyEvent } from '@meal-planner/shared';

// A fake socket.io-client. Each `io()` call yields a socket that records the
// handlers registered via `.on(name, cb)` and lets a test fire them via
// `__emit`. This lets us drive incoming real-time events deterministically
// without a real WebSocket (socket.io-client is not MSW-interceptable).
const { ioMock, createdSockets } = vi.hoisted(() => {
  interface FakeSocket {
    on: (event: string, cb: (payload: unknown) => void) => void;
    emit: (...args: unknown[]) => void;
    disconnect: () => void;
    __emit: (event: string, payload: unknown) => void;
  }
  const createdSockets: FakeSocket[] = [];
  const ioMock = vi.fn(() => {
    const handlers = new Map<string, Set<(payload: unknown) => void>>();
    const socket: FakeSocket = {
      on: vi.fn((event: string, cb: (payload: unknown) => void) => {
        let set = handlers.get(event);
        if (!set) {
          set = new Set();
          handlers.set(event, set);
        }
        set.add(cb);
      }),
      emit: vi.fn(),
      disconnect: vi.fn(),
      __emit: (event: string, payload: unknown) => {
        const set = handlers.get(event);
        if (set) for (const cb of set) cb(payload);
      },
    };
    createdSockets.push(socket);
    return socket;
  });
  return { ioMock, createdSockets };
});

vi.mock('socket.io-client', () => ({ io: ioMock }));

// Controllable auth state — SocketProvider only connects for an authed user.
let mockUser: { id: string } | null = { id: 'u-1' };
vi.mock('./AuthContext', () => ({
  useAuth: () => ({ user: mockUser }),
}));

const { SocketProvider, useRealtimeEvent } = await import('./SocketContext');

function Consumer({ onEvent }: { onEvent: (p: RealtimeFamilyEvent) => void }) {
  useRealtimeEvent(RealtimeEvent.GroceryChanged, onEvent);
  return <div>consumer</div>;
}

function Tree({
  show,
  onEvent,
}: {
  show: boolean;
  onEvent: (p: RealtimeFamilyEvent) => void;
}) {
  return (
    <SocketProvider>{show ? <Consumer onEvent={onEvent} /> : null}</SocketProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  createdSockets.length = 0;
  mockUser = { id: 'u-1' };
});

describe('SocketProvider', () => {
  it('opens a socket when a user is authenticated', () => {
    render(<SocketProvider>child</SocketProvider>);
    expect(ioMock).toHaveBeenCalledTimes(1);
    expect(createdSockets).toHaveLength(1);
  });

  it('does not open a socket when there is no user', () => {
    mockUser = null;
    render(<SocketProvider>child</SocketProvider>);
    expect(ioMock).not.toHaveBeenCalled();
  });

  it('disconnects the socket on unmount', () => {
    const { unmount } = render(<SocketProvider>child</SocketProvider>);
    const socket = createdSockets[0];
    unmount();
    expect(socket.disconnect).toHaveBeenCalled();
  });
});

describe('useRealtimeEvent', () => {
  it('invokes the handler with the payload for a matching event', () => {
    const onEvent = vi.fn();
    render(<Tree show onEvent={onEvent} />);
    const socket = createdSockets[0];

    act(() => {
      socket.__emit(RealtimeEvent.GroceryChanged, { familyId: 'fam-1' });
    });

    expect(onEvent).toHaveBeenCalledWith({ familyId: 'fam-1' });
  });

  it('does not invoke the handler for a different event', () => {
    const onEvent = vi.fn();
    render(<Tree show onEvent={onEvent} />);
    const socket = createdSockets[0];

    act(() => {
      socket.__emit(RealtimeEvent.WeekPlanChanged, { familyId: 'fam-1' });
    });

    expect(onEvent).not.toHaveBeenCalled();
  });

  it('stops receiving events after the subscribing component unmounts', () => {
    const onEvent = vi.fn();
    const { rerender } = render(<Tree show onEvent={onEvent} />);
    const socket = createdSockets[0];

    // Unmount the consumer (provider stays mounted, socket unchanged).
    rerender(<Tree show={false} onEvent={onEvent} />);

    act(() => {
      socket.__emit(RealtimeEvent.GroceryChanged, { familyId: 'fam-1' });
    });

    expect(onEvent).not.toHaveBeenCalled();
  });
});
