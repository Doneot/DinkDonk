import { useState, type ReactNode } from "react";
import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import axios from "axios";
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

  describe("handleMessageChange autosave", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("aborts a still-in-flight save when a newer edit's debounce fires, so a slower older request can't land after it", async () => {
      const signals: (AbortSignal | undefined)[] = [];
      subscriptionsApi.updateNotificationMessage.mockImplementation(
        (_id: string, _message: string, signal?: AbortSignal) => {
          signals.push(signal);
          return new Promise<void>((_resolve, reject) => {
            signal?.addEventListener?.("abort", () => {
              reject(new axios.CanceledError("canceled"));
            });
          });
        },
      );

      const { Wrapper } = createWrapper({
        id: "u1",
        subscriptions: [{ id: "s1", notification_message: "" }],
      });
      const { result } = renderHook(() => useSubscriptions(), { wrapper: Wrapper });

      act(() => {
        result.current.handleMessageChange("s1", "first edit");
      });
      await vi.advanceTimersByTimeAsync(600);

      expect(subscriptionsApi.updateNotificationMessage).toHaveBeenCalledTimes(1);
      expect(signals[0]?.aborted).toBe(false);

      act(() => {
        result.current.handleMessageChange("s1", "second edit");
      });
      await vi.advanceTimersByTimeAsync(600);

      expect(subscriptionsApi.updateNotificationMessage).toHaveBeenCalledTimes(2);
      // The first (now-stale) request must be aborted rather than left to
      // resolve on its own time - otherwise, on a slow connection, it could
      // still land after the second and silently overwrite "second edit"
      // with "first edit" server-side.
      expect(signals[0]?.aborted).toBe(true);
      expect(subscriptionsApi.updateNotificationMessage).toHaveBeenNthCalledWith(
        2,
        "s1",
        "second edit",
        expect.any(AbortSignal),
      );
    });

    it("cancels a not-yet-fired debounced save when the streamer is unsubscribed first", async () => {
      subscriptionsApi.unsubscribeFromStreamer.mockResolvedValue(undefined);

      const { Wrapper } = createWrapper({
        id: "u1",
        subscriptions: [{ id: "s1", notification_message: "" }],
      });
      const { result } = renderHook(() => useSubscriptions(), { wrapper: Wrapper });

      act(() => {
        result.current.handleMessageChange("s1", "edit");
      });

      await act(async () => {
        await result.current.handleUnsubscribe("s1");
      });

      await vi.advanceTimersByTimeAsync(600);

      expect(subscriptionsApi.updateNotificationMessage).not.toHaveBeenCalled();
    });

    it("aborts an already-in-flight save when the streamer is unsubscribed", async () => {
      const abortSpy = vi.fn();
      subscriptionsApi.updateNotificationMessage.mockImplementation(
        (_id: string, _message: string, signal?: AbortSignal) => {
          signal?.addEventListener?.("abort", abortSpy);
          return new Promise<void>(() => {
            // never resolves on its own - only abort() settles it
          });
        },
      );
      subscriptionsApi.unsubscribeFromStreamer.mockResolvedValue(undefined);

      const { Wrapper } = createWrapper({
        id: "u1",
        subscriptions: [{ id: "s1", notification_message: "" }],
      });
      const { result } = renderHook(() => useSubscriptions(), { wrapper: Wrapper });

      act(() => {
        result.current.handleMessageChange("s1", "edit");
      });
      await vi.advanceTimersByTimeAsync(600);
      expect(subscriptionsApi.updateNotificationMessage).toHaveBeenCalledTimes(1);

      await act(async () => {
        await result.current.handleUnsubscribe("s1");
      });

      expect(abortSpy).toHaveBeenCalledTimes(1);
    });
  });
});
