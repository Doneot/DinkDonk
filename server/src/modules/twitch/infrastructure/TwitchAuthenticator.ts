import axios from "axios";
import type { AxiosInstance } from "axios";

import { env } from "../../../shared/config/env.js";
import { assertDefined } from "../../../shared/utils/assert.js";

export type TwitchAuthenticatorOptions = {
  http?: AxiosInstance;

  clientId?: string;

  clientSecret?: string;

  refreshSkewSeconds?: number;
};

export type TwitchAccessToken = {
  accessToken: string;

  expiresIn: number;
};

const REQUEST_TIMEOUT_MS = 10_000;

export class TwitchAuthenticator {
  private readonly http: AxiosInstance;

  private readonly clientId: string;

  private readonly clientSecret: string;

  constructor({
    http = axios.create({ timeout: REQUEST_TIMEOUT_MS }),
    clientId = assertDefined(
      env.twitch.clientId,
      "Twitch Client ID is not defined",
    ),
    clientSecret = assertDefined(
      env.twitch.clientSecret,
      "Twitch Client Secret is not defined",
    ),
  }: TwitchAuthenticatorOptions = {}) {
    this.http = http;

    this.clientId = clientId;

    this.clientSecret = clientSecret;
  }

  async refreshAccessToken(): Promise<TwitchAccessToken> {
    const response = await this.http.post<{
      access_token: string;
      expires_in: number;
    }>("https://id.twitch.tv/oauth2/token", {
      client_id: this.clientId,

      client_secret: this.clientSecret,

      grant_type: "client_credentials",
    });

    const {
      access_token: accessToken,

      expires_in: expiresIn,
    } = response.data;

    return {
      accessToken,

      expiresIn,
    };
  }
}
