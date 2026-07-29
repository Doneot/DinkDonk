import axios from "axios";
import type { AxiosInstance } from "axios";
import OAuth2Strategy from "passport-oauth2";
import type { StrategyOptions, VerifyFunction } from "passport-oauth2";

export type TwitchProfile = {
  id: string;
  login: string;
  displayName: string;
  profileImageUrl: string;
  email: string | null;
};

type TwitchHelixUser = {
  id: string;
  login: string;
  display_name: string;
  profile_image_url?: string;
  email?: string;
};

const REQUEST_TIMEOUT_MS = 10_000;

/**
 * Twitch is standard OAuth2, so this configures the generic passport-oauth2
 * strategy against Twitch's endpoints rather than depending on a third-party
 * passport-twitch* package (unmaintained/unverified at the time this was
 * written). The one piece OAuth2Strategy doesn't provide out of the box is
 * fetching the profile after token exchange - overriding userProfile() is
 * the documented extension point for that (passport-google-oauth20 and
 * friends do the same internally).
 */
export class TwitchOAuth2Strategy extends OAuth2Strategy {
  private readonly clientId: string;

  private readonly http: AxiosInstance;

  constructor(
    options: StrategyOptions,
    verify: VerifyFunction,
    http: AxiosInstance = axios.create({ timeout: REQUEST_TIMEOUT_MS }),
  ) {
    super(options, verify);
    this.name = "twitch";
    this.clientId = options.clientID;
    this.http = http;
  }

  override userProfile(
    accessToken: string,
    done: (err?: unknown, profile?: TwitchProfile) => void,
  ): void {
    this.http
      .get<{ data: TwitchHelixUser[] }>("https://api.twitch.tv/helix/users", {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Client-ID": this.clientId,
        },
      })
      .then(({ data }) => {
        const user = data.data[0];

        if (!user) {
          done(new Error("Twitch profile lookup returned no user"));
          return;
        }

        done(undefined, {
          id: user.id,
          login: user.login,
          displayName: user.display_name,
          profileImageUrl: user.profile_image_url ?? "",
          // Only present when the account has a verified email and the
          // user:read:email scope was granted - absence just means "don't
          // know", not "unverified".
          email: user.email ?? null,
        });
      })
      .catch((error: unknown) => done(error));
  }
}
