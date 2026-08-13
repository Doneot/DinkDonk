import { useState } from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import { SocketProvider } from "../SocketContext";
import { useSocket } from "../socketContextValue";
import { AuthContext, useAuth, type AuthContextValue } from "../authContextValue";
import type { User } from "../../shared/types/api";

type Handler = (...args: unknown[]) => void;

const handlers: Record<string, Handler[]> = {};
const fakeSocket = {
  on: vi.fn((event: string, handler: Handler) => {
    (handlers[event] ??= []).push(handler);
  }),
  disconnect: vi.fn(),
};
const createSocketSpy = vi.fn(() => fakeSocket);

vi.mock("../../shared/socket", () => ({
  createSocket: () => createSocketSpy(),
}));

function emit(event: string, ...args: unknown[]) {
  (handlers[event] ?? []).forEach((handler) => handler(...args));
}

function SocketConsumer() {
  const { connected, liveStreamers } = useSocket();
  return (
    <div>
      <span data-testid="connected">{String(connected)}</span>
      <span data-testid="live-s1">
        {liveStreamers.s1 ? String(liveStreamers.s1.isLive) : "none"}
      </span>
    </div>
  );
}

function AuthConsumer() {
  const { user } = useAuth();
  return <span data-testid="can-receive-dm">{String(user?.canReceiveDM ?? "none")}</span>;
}

function Harness({ initialUser }: { initialUser: User | null }) {
  const [user, setUser] = useState<User | null>(initialUser);
  const authValue: AuthContextValue = {
    user,
    setUser,
    loading: false,
    logout: async () => {},
  };
  return (
    <AuthContext.Provider value={authValue}>
      <SocketProvider>
        <SocketConsumer />
        <AuthConsumer />
      </SocketProvider>
    </AuthContext.Provider>
  );
}

describe("SocketProvider", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    for (const key of Object.keys(handlers)) delete handlers[key];
  });

  it("does not open a socket when there is no authenticated user", () => {
    render(<Harness initialUser={null} />);
    expect(createSocketSpy).not.toHaveBeenCalled();
    expect(screen.getByTestId("connected")).toHaveTextContent("false");
  });

  it("opens a socket for an authenticated user and reflects connect/disconnect", async () => {
    render(<Harness initialUser={{ id: "u1" }} />);

    await waitFor(() => expect(createSocketSpy).toHaveBeenCalledTimes(1));
    expect(screen.getByTestId("connected")).toHaveTextContent("false");

    act(() => emit("connect"));
    expect(screen.getByTestId("connected")).toHaveTextContent("true");

    act(() => emit("disconnect"));
    expect(screen.getByTestId("connected")).toHaveTextContent("false");
  });

  it("merges a user_data_updated push into the auth user", () => {
    render(<Harness initialUser={{ id: "u1", canReceiveDM: false }} />);

    act(() => emit("user_data_updated", { canReceiveDM: true }));

    expect(screen.getByTestId("can-receive-dm")).toHaveTextContent("true");
  });

  it("records a streamer_live_changed push keyed by streamer id", () => {
    render(<Harness initialUser={{ id: "u1" }} />);

    act(() =>
      emit("streamer_live_changed", {
        streamerId: "s1",
        isLive: true,
        liveSince: "2026-08-13T00:00:00Z",
      }),
    );

    expect(screen.getByTestId("live-s1")).toHaveTextContent("true");
  });

  it("disconnects the socket on unmount", async () => {
    const { unmount } = render(<Harness initialUser={{ id: "u1" }} />);
    await waitFor(() => expect(createSocketSpy).toHaveBeenCalledTimes(1));

    unmount();

    expect(fakeSocket.disconnect).toHaveBeenCalledTimes(1);
  });
});
