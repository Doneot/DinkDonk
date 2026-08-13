import { renderHook, waitFor, act } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";

import { AuthContext, type AuthContextValue } from "../../../context/authContextValue";
import type { User } from "../../../shared/types/api";
import * as notificationsApiModule from "../api";
import { useNotificationChannels } from "../hooks/useNotificationChannels";

vi.mock("../api", () => ({
  fetchNotificationChannels: vi.fn(),
  getExistingPushSubscription: vi.fn(),
  isWebPushSupported: vi.fn(),
  setNotificationChannelPreference: vi.fn(),
  enableWebPushNotifications: vi.fn(),
  disableWebPushNotifications: vi.fn(),
}));

vi.mock("../../../shared/api/errorToast", () => ({
  notifyActionError: vi.fn(),
}));

const notificationsApi = notificationsApiModule as unknown as {
  fetchNotificationChannels: Mock;
  getExistingPushSubscription: Mock;
  isWebPushSupported: Mock;
  setNotificationChannelPreference: Mock;
  enableWebPushNotifications: Mock;
  disableWebPushNotifications: Mock;
};

const { notifyActionError } = await import("../../../shared/api/errorToast");

function wrapper(user: User) {
  const authValue: AuthContextValue = {
    user,
    setUser: () => {},
    loading: false,
    logout: async () => {},
  };
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <AuthContext.Provider value={authValue}>{children}</AuthContext.Provider>
    );
  };
}

describe("useNotificationChannels", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    notificationsApi.isWebPushSupported.mockReturnValue(true);
    notificationsApi.getExistingPushSubscription.mockResolvedValue(null);
    notificationsApi.fetchNotificationChannels.mockResolvedValue({
      discord: { enabled: true, optedIn: true },
      webPush: { enabled: false, subscriptions: 0, optedIn: true },
    });
  });

  it("loads discord opt-in and web push state on mount", async () => {
    notificationsApi.getExistingPushSubscription.mockResolvedValue(
      {} as PushSubscription,
    );

    const { result } = renderHook(() => useNotificationChannels(), {
      wrapper: wrapper({ id: "u1", providers: ["discord"], canReceiveDM: true }),
    });

    expect(result.current.loading).toBe(true);

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.discord.optedIn).toBe(true);
    expect(result.current.discord.linked).toBe(true);
    expect(result.current.discord.capable).toBe(true);
    expect(result.current.webPush.enabled).toBe(true);
  });

  it("optimistically flips discord opt-in and keeps it on success", async () => {
    notificationsApi.setNotificationChannelPreference.mockResolvedValue(undefined);

    const { result } = renderHook(() => useNotificationChannels(), {
      wrapper: wrapper({ id: "u1", providers: ["discord"], canReceiveDM: true }),
    });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.discord.optedIn).toBe(true);

    act(() => {
      result.current.discord.toggle(false);
    });

    // Flips immediately, before the request resolves.
    expect(result.current.discord.optedIn).toBe(false);

    await waitFor(() => expect(result.current.discord.busy).toBe(false));
    expect(result.current.discord.optedIn).toBe(false);
    expect(notificationsApi.setNotificationChannelPreference).toHaveBeenCalledWith(
      "discord",
      false,
    );
  });

  it("rolls back discord opt-in when the request fails", async () => {
    notificationsApi.setNotificationChannelPreference.mockRejectedValue(
      new Error("network down"),
    );

    const { result } = renderHook(() => useNotificationChannels(), {
      wrapper: wrapper({ id: "u1", providers: ["discord"], canReceiveDM: true }),
    });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.discord.optedIn).toBe(true);

    act(() => {
      result.current.discord.toggle(false);
    });
    expect(result.current.discord.optedIn).toBe(false);

    await waitFor(() => expect(result.current.discord.busy).toBe(false));

    expect(result.current.discord.optedIn).toBe(true);
    expect(notifyActionError).toHaveBeenCalledWith(
      expect.any(Error),
      "Failed to update your Discord notification preference.",
    );
  });

  it("enables web push and reflects the new subscription", async () => {
    notificationsApi.enableWebPushNotifications.mockResolvedValue(
      {} as PushSubscription,
    );

    const { result } = renderHook(() => useNotificationChannels(), {
      wrapper: wrapper({ id: "u1" }),
    });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.webPush.enabled).toBe(false);

    await act(async () => {
      await result.current.webPush.toggle(true);
    });

    expect(result.current.webPush.enabled).toBe(true);
    expect(result.current.webPush.busy).toBe(false);
  });

  it("leaves web push disabled and surfaces an error toast when enabling fails", async () => {
    notificationsApi.enableWebPushNotifications.mockRejectedValue(
      new Error("permission denied"),
    );

    const { result } = renderHook(() => useNotificationChannels(), {
      wrapper: wrapper({ id: "u1" }),
    });

    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.webPush.toggle(true);
    });

    expect(result.current.webPush.enabled).toBe(false);
    expect(notifyActionError).toHaveBeenCalledWith(
      expect.any(Error),
      "Failed to enable browser notifications.",
    );
  });
});
