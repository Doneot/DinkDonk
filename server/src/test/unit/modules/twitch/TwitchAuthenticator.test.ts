import type { AxiosInstance } from "axios";
import { describe, expect, it, vi } from "vitest";

import { TwitchAuthenticator } from "../../../../modules/twitch/infrastructure/TwitchAuthenticator.js";

type TokenResponse = { data: { access_token: string; expires_in: number } };

function createAuthenticator(
  overrides: { clientId?: string; clientSecret?: string } = {},
) {
  const post = vi
    .fn<(url: string, body: unknown) => Promise<TokenResponse>>()
    .mockResolvedValue({
      data: { access_token: "app-access-token", expires_in: 3600 },
    });

  const authenticator = new TwitchAuthenticator({
    http: { post } as unknown as AxiosInstance,
    ...overrides,
  });

  return { authenticator, post };
}

describe("TwitchAuthenticator", () => {
  it("exchanges the client credentials for an app access token", async () => {
    const { authenticator, post } = createAuthenticator({
      clientId: "client-id",
      clientSecret: "client-secret",
    });

    await expect(authenticator.refreshAccessToken()).resolves.toEqual({
      accessToken: "app-access-token",
      expiresIn: 3600,
    });

    expect(post.mock.calls[0]?.[0]).toBe("https://id.twitch.tv/oauth2/token");
    expect(post.mock.calls[0]?.[1]).toEqual({
      client_id: "client-id",
      client_secret: "client-secret",
      grant_type: "client_credentials",
    });
  });

  it("falls back to the configured Twitch credentials", async () => {
    const { authenticator, post } = createAuthenticator();

    await authenticator.refreshAccessToken();

    expect(post.mock.calls[0]?.[1]).toMatchObject({
      client_id: "twitch-client-id",
      client_secret: "twitch-client-secret",
    });
  });

  it("propagates a failed token request", async () => {
    const { authenticator, post } = createAuthenticator();

    post.mockRejectedValue(new Error("invalid_client"));

    await expect(authenticator.refreshAccessToken()).rejects.toThrow(
      "invalid_client",
    );
  });
});
