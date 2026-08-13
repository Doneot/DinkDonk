import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useAuthProviders } from "../hooks/useAuthProviders";
import * as authApiModule from "../api";

vi.mock("../api", () => ({
  fetchAuthProviders: vi.fn(),
}));

const authApi = authApiModule as unknown as { fetchAuthProviders: Mock };

describe("useAuthProviders", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns null until the providers config resolves", async () => {
    let resolve: (value: { providers: string[]; discordInviteUrl: string }) => void = () => {};
    authApi.fetchAuthProviders.mockReturnValue(
      new Promise((r) => {
        resolve = r;
      }),
    );

    const { result } = renderHook(() => useAuthProviders());

    expect(result.current).toBeNull();

    resolve({ providers: ["discord", "google"], discordInviteUrl: "https://discord.com/invite" });

    await waitFor(() =>
      expect(result.current).toEqual({
        providers: ["discord", "google"],
        discordInviteUrl: "https://discord.com/invite",
      }),
    );
  });

  it("falls back to Discord-only with no invite link when the endpoint fails", async () => {
    authApi.fetchAuthProviders.mockRejectedValue(new Error("network down"));

    const { result } = renderHook(() => useAuthProviders());

    await waitFor(() =>
      expect(result.current).toEqual({ providers: ["discord"], discordInviteUrl: "" }),
    );
  });

  it("does not apply a stale resolution after unmount", async () => {
    let resolve: (value: { providers: string[]; discordInviteUrl: string }) => void = () => {};
    authApi.fetchAuthProviders.mockReturnValue(
      new Promise((r) => {
        resolve = r;
      }),
    );

    const { result, unmount } = renderHook(() => useAuthProviders());
    unmount();

    resolve({ providers: ["discord"], discordInviteUrl: "https://discord.com/invite" });
    await Promise.resolve();

    // Nothing to assert on `result` post-unmount beyond "no error was
    // thrown" - the point of this test is the cancelled-guard in the hook's
    // effect cleanup, not a renderable outcome.
    expect(result.current).toBeNull();
  });
});
