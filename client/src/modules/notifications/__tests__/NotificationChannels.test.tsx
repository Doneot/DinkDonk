import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";

import { AuthContext, type AuthContextValue } from "../../../context/authContextValue";
import type { User } from "../../../shared/types/api";
import { useAuthProviders as useAuthProvidersImport } from "../../auth/hooks/useAuthProviders";
import * as notificationsApiModule from "../api";
import NotificationChannels from "../components/NotificationChannels";
import { useNotificationChannels as useNotificationChannelsImport } from "../hooks/useNotificationChannels";

vi.mock("../api", () => ({
  checkCanReceiveDM: vi.fn(),
}));

vi.mock("../hooks/useNotificationChannels", () => ({
  useNotificationChannels: vi.fn(),
}));

vi.mock("../../auth/hooks/useAuthProviders", () => ({
  useAuthProviders: vi.fn(),
}));

const notificationsApi = notificationsApiModule as unknown as {
  checkCanReceiveDM: Mock;
};
const useNotificationChannels = useNotificationChannelsImport as unknown as Mock;
const useAuthProviders = useAuthProvidersImport as unknown as Mock;

function channelsState(overrides: {
  loading?: boolean;
  discord?: Partial<{
    linked: boolean;
    capable: boolean;
    optedIn: boolean;
    busy: boolean;
    toggle: Mock;
  }>;
  webPush?: Partial<{
    supported: boolean;
    enabled: boolean;
    busy: boolean;
    toggle: Mock;
  }>;
}) {
  return {
    loading: overrides.loading ?? false,
    discord: {
      linked: true,
      capable: true,
      optedIn: true,
      busy: false,
      toggle: vi.fn(),
      ...overrides.discord,
    },
    webPush: {
      supported: true,
      enabled: false,
      busy: false,
      toggle: vi.fn(),
      ...overrides.webPush,
    },
  };
}

function renderWithUser(user: User, setUser = vi.fn()) {
  const authValue: AuthContextValue = {
    user,
    setUser,
    loading: false,
    logout: async () => {},
  };
  return render(
    <AuthContext.Provider value={authValue}>
      <NotificationChannels />
    </AuthContext.Provider>,
  );
}

describe("NotificationChannels", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthProviders.mockReturnValue({
      providers: ["discord"],
      discordInviteUrl: "https://discord.com/invite",
    });
  });

  it("prompts to connect Discord when the account isn't linked", () => {
    useNotificationChannels.mockReturnValue(
      channelsState({ discord: { linked: false } }),
    );

    renderWithUser({ id: "u1" });

    expect(screen.getByText("Not connected")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Connect your Discord account" }),
    ).toBeInTheDocument();
  });

  it("shows Blocked with an invite button and re-check link when linked but not capable", () => {
    useNotificationChannels.mockReturnValue(
      channelsState({ discord: { linked: true, capable: false } }),
    );

    renderWithUser({ id: "u1", providers: ["discord"] });

    expect(screen.getByText("Blocked")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Invite DinkDonk to your Discord server" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Not receiving notifications?" }),
    ).toBeInTheDocument();
  });

  it("shows On when linked, capable, and opted in, and toggles off on click", () => {
    const toggle = vi.fn();
    useNotificationChannels.mockReturnValue(
      channelsState({ discord: { linked: true, capable: true, optedIn: true, toggle } }),
    );

    renderWithUser({ id: "u1", providers: ["discord"], canReceiveDM: true });

    expect(screen.getByText("On")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("switch", { name: "Toggle Discord DMs" }));
    expect(toggle).toHaveBeenCalledWith(false);
  });

  it("shows a neutral loading state and disables both toggles while channel data is still loading", () => {
    // Regression test: useNotificationChannels() computes `loading` but the
    // component used to destructure only `{ discord, webPush }`, so a real
    // account (optedIn defaults true, webPush.enabled defaults false) would
    // flash as already-configured before the fetch resolved.
    useNotificationChannels.mockReturnValue(
      channelsState({
        loading: true,
        discord: { linked: true, capable: true, optedIn: true },
        webPush: { supported: true, enabled: false },
      }),
    );

    renderWithUser({ id: "u1", providers: ["discord"], canReceiveDM: true });

    const loadingTexts = screen.getAllByText("Loading…");
    expect(loadingTexts).toHaveLength(2);
    expect(
      screen.getByRole("switch", { name: "Toggle Discord DMs" }),
    ).toBeDisabled();
    expect(
      screen.getByRole("switch", { name: "Toggle Browser push" }),
    ).toBeDisabled();
    expect(screen.queryByText("On")).not.toBeInTheDocument();
  });

  it("disables the browser push toggle when unsupported", () => {
    useNotificationChannels.mockReturnValue(
      channelsState({ webPush: { supported: false } }),
    );

    renderWithUser({ id: "u1" });

    expect(screen.getByText("Unsupported")).toBeInTheDocument();
    expect(
      screen.getByRole("switch", { name: "Toggle Browser push" }),
    ).toBeDisabled();
  });

  it("updates the user's canReceiveDM via checkDM so the toggle reflects a fresh result immediately", async () => {
    notificationsApi.checkCanReceiveDM.mockResolvedValue(true);
    useNotificationChannels.mockReturnValue(
      channelsState({ discord: { linked: true, capable: false } }),
    );
    const setUser = vi.fn();

    renderWithUser(
      { id: "u1", providers: ["discord"], canReceiveDM: false },
      setUser,
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Not receiving notifications?" }),
    );

    await waitFor(() => {
      expect(notificationsApi.checkCanReceiveDM).toHaveBeenCalled();
    });
    expect(setUser).toHaveBeenCalledWith(expect.any(Function));

    const updater = setUser.mock.calls[0][0] as (prev: User) => User;
    expect(updater({ id: "u1", canReceiveDM: false })).toEqual({
      id: "u1",
      canReceiveDM: true,
    });
  });
});
