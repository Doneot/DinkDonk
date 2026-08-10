import { useState } from "react";
import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { AuthContext, type AuthContextValue } from "../../../context/authContextValue";
import { SocketContext, type SocketContextValue } from "../../../context/socketContextValue";
import SubscriptionsManager from "../components/SubscriptionsManager";
import * as subscriptionsApiModule from "../api";
import { notifyActionError as notifyActionErrorImport } from "../../../shared/api/errorToast";
import type { User, TrackedStreamerSummary } from "../../../shared/types/api";

vi.mock("../api", () => ({
  searchStreamers: vi.fn(),
  fetchStreamerProfiles: vi.fn(),
  subscribeToStreamer: vi.fn(),
  unsubscribeFromStreamer: vi.fn(),
  updateNotificationMessage: vi.fn(),
}));

vi.mock("../../../shared/api/errorToast", () => ({
  notifyActionError: vi.fn(),
}));

// The mocked module's shape is intentionally a stripped-down stand-in
// (fighting the real return-type generics through vi.mocked buys nothing
// here), so cast to the minimal interface these tests actually drive.
const subscriptionsApi = subscriptionsApiModule as unknown as {
  searchStreamers: Mock;
  fetchStreamerProfiles: Mock;
  subscribeToStreamer: Mock;
  unsubscribeFromStreamer: Mock;
  updateNotificationMessage: Mock;
};
const notifyActionError = notifyActionErrorImport as Mock;

function TestHarness({ initialUser }: { initialUser: User }) {
  const [user, setUser] = useState<User | null>(initialUser);
  const authValue: AuthContextValue = {
    user,
    setUser,
    loading: false,
    logout: async () => {},
  };
  const socketValue: SocketContextValue = {
    socket: null,
    connected: false,
    liveStreamers: {},
  };
  return (
    <AuthContext.Provider value={authValue}>
      <SocketContext.Provider value={socketValue}>
        <SubscriptionsManager canReceiveDM={true} />
      </SocketContext.Provider>
    </AuthContext.Provider>
  );
}

function hydrateAsProfile(ids: string[]): Promise<TrackedStreamerSummary[]> {
  return Promise.resolve(
    ids.map((id) => ({
      id,
      name: `Streamer ${id}`,
      avatar: "",
      isLive: false,
      liveSince: null,
    })),
  );
}

describe("SubscriptionsManager", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    subscriptionsApi.fetchStreamerProfiles.mockImplementation(hydrateAsProfile);
  });

  it("removes a streamer from the list after a successful unsubscribe", async () => {
    subscriptionsApi.unsubscribeFromStreamer.mockResolvedValueOnce(undefined);

    render(
      <TestHarness
        initialUser={{
          id: "u1",
          subscriptions: [{ id: "s1", notification_message: "" }],
        }}
      />,
    );

    expect(await screen.findByText("Streamer s1")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Unsubscribe" }));

    await waitFor(() => {
      expect(screen.getByText("No streamers found.")).toBeInTheDocument();
    });
  });

  it("shows an error toast and keeps the row when unsubscribe fails", async () => {
    subscriptionsApi.unsubscribeFromStreamer.mockRejectedValueOnce(
      new Error("network down"),
    );

    render(
      <TestHarness
        initialUser={{
          id: "u1",
          subscriptions: [{ id: "s1", notification_message: "" }],
        }}
      />,
    );

    expect(await screen.findByText("Streamer s1")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Unsubscribe" }));

    await waitFor(() => {
      expect(notifyActionError).toHaveBeenCalledWith(
        expect.any(Error),
        "Failed to unsubscribe.",
      );
    });
    expect(screen.getByText("Streamer s1")).toBeInTheDocument();
  });

  it("subscribes to a streamer picked from search results", async () => {
    vi.useFakeTimers();
    subscriptionsApi.searchStreamers.mockResolvedValue([
      { id: "s2", name: "New Streamer", avatar: "" },
    ]);
    subscriptionsApi.subscribeToStreamer.mockResolvedValue(undefined);

    render(<TestHarness initialUser={{ id: "u1", subscriptions: [] }} />);

    const input = screen.getByPlaceholderText("Search Twitch streamers...");
    fireEvent.change(input, { target: { value: "new" } });
    await vi.advanceTimersByTimeAsync(300);
    vi.useRealTimers();

    const subscribeButton = await screen.findByRole("button", {
      name: "Subscribe",
    });
    fireEvent.click(subscribeButton);

    await waitFor(() => {
      expect(subscriptionsApi.subscribeToStreamer).toHaveBeenCalledWith("s2");
    });
    expect(await screen.findByText("New Streamer")).toBeInTheDocument();
  });
});
