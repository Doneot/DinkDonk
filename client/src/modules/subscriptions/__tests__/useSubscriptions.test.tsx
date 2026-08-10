import { useState, type ReactNode } from "react";
import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { AuthContext, type AuthContextValue } from "../../../context/authContextValue";
import { SocketContext, type SocketContextValue, type LiveState } from "../../../context/socketContextValue";
import { useSubscriptions } from "../hooks/useSubscriptions";
import * as subscriptionsApiModule from "../api";
import type { User } from "../../../shared/types/api";

vi.mock("../api", () => ({
  fetchStreamerProfiles: vi.fn(),
  subscribeToStreamer: vi.fn(),
  unsubscribeFromStreamer: vi.fn(),
  updateNotificationMessage: vi.fn(),
}));

vi.mock("../../../shared/api/errorToast", () => ({
  notifyActionError: vi.fn(),
}));

const subscriptionsApi = subscriptionsApiModule as unknown as {
  fetchStreamerProfiles: Mock;
  subscribeToStreamer: Mock;
  unsubscribeFromStreamer: Mock;
  updateNotificationMessage: Mock;
};

function createWrapper(initialUser: User, liveStreamers: Record<string, LiveState> = {}) {
  let externalSetUser: AuthContextValue["setUser"] = () => {};

  function Wrapper({ children }: { children: ReactNode }) {
    const [user, setUser] = useState<User | null>(initialUser);
    externalSetUser = setUser;
    const authValue: AuthContextValue = {
      user,
      setUser,
      loading: false,
      logout: async () => {},
    };
    const socketValue: SocketContextValue = {
      socket: null,
      connected: false,
      liveStreamers,
    };
    return (
      <AuthContext.Provider value={authValue}>
        <SocketContext.Provider value={socketValue}>{children}</SocketContext.Provider>
      </AuthContext.Provider>
    );
  }

  return { Wrapper, injectUser: (updater: (prev: User | null) => User | null) => externalSetUser(updater) };
}

describe("useSubscriptions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    subscriptionsApi.fetchStreamerProfiles.mockResolvedValue([]);
  });

  it("does not add a duplicate subscription when a socket update lands before the subscribe request resolves", async () => {
    let resolveSubscribe: () => void = () => {};
    subscriptionsApi.subscribeToStreamer.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveSubscribe = resolve;
        }),
    );

    const { Wrapper, injectUser } = createWrapper({ id: "u1", subscriptions: [] });
    const { result } = renderHook(() => useSubscriptions(), { wrapper: Wrapper });

    act(() => {
      result.current.handleSubscribe({ id: "s1", name: "Streamer", avatar: "" });
    });

    // Simulates the "user_data_updated" socket broadcast landing before the
    // HTTP response - it doesn't wait on subscribeToStreamer either.
    act(() => {
      injectUser((prev) =>
        prev
          ? { ...prev, subscriptions: [{ id: "s1", notification_message: "" }] }
          : prev,
      );
    });

    await act(async () => {
      resolveSubscribe();
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(result.current.subscribedIds).toEqual(["s1"]);
    });
  });

  it("adds the subscription once when the subscribe request resolves before any socket update", async () => {
    subscriptionsApi.subscribeToStreamer.mockResolvedValue(undefined);

    const { Wrapper } = createWrapper({ id: "u1", subscriptions: [] });
    const { result } = renderHook(() => useSubscriptions(), { wrapper: Wrapper });

    await act(async () => {
      await result.current.handleSubscribe({ id: "s1", name: "Streamer", avatar: "" });
    });

    expect(result.current.subscribedIds).toEqual(["s1"]);
  });

  it("falls back to the hydrated profile's live status when no realtime update has arrived", async () => {
    subscriptionsApi.fetchStreamerProfiles.mockResolvedValue([
      { id: "s1", name: "Streamer", avatar: "", isLive: true, liveSince: "2026-08-10T10:00:00Z" },
    ]);

    const { Wrapper } = createWrapper({
      id: "u1",
      subscriptions: [{ id: "s1", notification_message: "" }],
    });
    const { result } = renderHook(() => useSubscriptions(), { wrapper: Wrapper });

    await waitFor(() => {
      expect(result.current.enrichedSubscriptions[0]?.isHydrated).toBe(true);
    });

    expect(result.current.enrichedSubscriptions[0]).toMatchObject({
      isLive: true,
      liveSince: "2026-08-10T10:00:00Z",
    });
  });

  it("prefers a realtime live-status push over the cached profile snapshot", async () => {
    subscriptionsApi.fetchStreamerProfiles.mockResolvedValue([
      { id: "s1", name: "Streamer", avatar: "", isLive: false, liveSince: null },
    ]);

    const { Wrapper } = createWrapper(
      { id: "u1", subscriptions: [{ id: "s1", notification_message: "" }] },
      { s1: { isLive: true, liveSince: "2026-08-10T12:00:00Z" } },
    );
    const { result } = renderHook(() => useSubscriptions(), { wrapper: Wrapper });

    await waitFor(() => {
      expect(result.current.enrichedSubscriptions[0]?.isHydrated).toBe(true);
    });

    expect(result.current.enrichedSubscriptions[0]).toMatchObject({
      isLive: true,
      liveSince: "2026-08-10T12:00:00Z",
    });
  });
});
