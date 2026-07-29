import type { AxiosInstance } from "axios";
import { describe, expect, it, vi } from "vitest";
import type { StrategyOptions } from "passport-oauth2";

import { TwitchOAuth2Strategy } from "../../../../http/strategies/TwitchOAuth2Strategy.js";

const OPTIONS: StrategyOptions = {
  authorizationURL: "https://id.twitch.tv/oauth2/authorize",
  tokenURL: "https://id.twitch.tv/oauth2/token",
  clientID: "twitch-client-id",
  clientSecret: "twitch-client-secret",
  callbackURL: "http://localhost:3000/api/auth/twitch/callback",
};

function createHttpMock() {
  const get = vi.fn();

  return { http: { get } as unknown as AxiosInstance, get };
}

function createStrategy() {
  const { http, get } = createHttpMock();
  const strategy = new TwitchOAuth2Strategy(OPTIONS, () => {}, http);

  return { strategy, get };
}

function invoke(
  strategy: TwitchOAuth2Strategy,
  accessToken = "access-token",
): Promise<[unknown, unknown]> {
  return new Promise((resolve) => {
    strategy.userProfile(accessToken, (err, profile) => resolve([err, profile]));
  });
}

const HELIX_USER = {
  id: "twitch-user-1",
  login: "tester",
  display_name: "Tester",
  profile_image_url: "https://example.com/photo.jpg",
  email: "tester@example.com",
};

describe("TwitchOAuth2Strategy", () => {
  it("registers itself under the 'twitch' strategy name", () => {
    const { strategy } = createStrategy();

    expect(strategy.name).toBe("twitch");
  });

  it("requests the Helix users endpoint with the access token and client id", async () => {
    const { strategy, get } = createStrategy();

    get.mockResolvedValue({ data: { data: [HELIX_USER] } });

    await invoke(strategy, "the-access-token");

    expect(get).toHaveBeenCalledWith(
      "https://api.twitch.tv/helix/users",
      {
        headers: {
          Authorization: "Bearer the-access-token",
          "Client-ID": "twitch-client-id",
        },
      },
    );
  });

  it("maps a Helix user onto a TwitchProfile", async () => {
    const { strategy, get } = createStrategy();

    get.mockResolvedValue({ data: { data: [HELIX_USER] } });

    const [err, profile] = await invoke(strategy);

    expect(err).toBeUndefined();
    expect(profile).toEqual({
      id: "twitch-user-1",
      login: "tester",
      displayName: "Tester",
      profileImageUrl: "https://example.com/photo.jpg",
      email: "tester@example.com",
    });
  });

  it("defaults a missing profile image to an empty string", async () => {
    const { strategy, get } = createStrategy();

    get.mockResolvedValue({
      data: { data: [{ ...HELIX_USER, profile_image_url: undefined }] },
    });

    const [, profile] = await invoke(strategy);

    expect(profile).toMatchObject({ profileImageUrl: "" });
  });

  it("reports no email as null rather than absent", async () => {
    const { strategy, get } = createStrategy();

    get.mockResolvedValue({
      data: { data: [{ ...HELIX_USER, email: undefined }] },
    });

    const [, profile] = await invoke(strategy);

    expect(profile).toMatchObject({ email: null });
  });

  it("reports an error when Helix returns no user for the token", async () => {
    const { strategy, get } = createStrategy();

    get.mockResolvedValue({ data: { data: [] } });

    const [err, profile] = await invoke(strategy);

    expect(err).toBeInstanceOf(Error);
    expect(profile).toBeUndefined();
  });

  it("reports a network/API failure to the callback instead of throwing", async () => {
    const { strategy, get } = createStrategy();

    const networkError = new Error("network unreachable");

    get.mockRejectedValue(networkError);

    const [err] = await invoke(strategy);

    expect(err).toBe(networkError);
  });
});
