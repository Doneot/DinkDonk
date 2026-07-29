// A provider this app can authenticate a user through. Union grows as more
// sign-in methods are added (password); kept centralized here so every
// consumer narrows against the same list.
export type Provider = "discord" | "google" | "twitch";

export type DiscordCredential = {
  id: string;
  username: string;
  discriminator: string;
  avatar: string;
  accessToken: string;
  refreshToken: string;
  fetchTime: number;
};

// Google never needs its own token-refresh dance (nothing calls Google's API
// on the user's behalf after login - only the profile fields are used), so
// unlike DiscordCredential there's no access/refresh token to store here.
export type GoogleCredential = {
  id: string;
  email: string;
  name: string;
  picture: string;
};

// Twitch's login OAuth app is a separate registration from the bot's
// server-to-server app-token client (see modules/twitch/infrastructure),
// so this credential carries no access/refresh token either - like Google,
// nothing here ever calls Twitch's API on the user's behalf after login.
export type TwitchCredential = {
  id: string;
  login: string;
  displayName: string;
  profileImageUrl: string;
};

// The full record behind a user's account: their own stable `uid` plus
// whichever providers they've linked. `email`/`emailVerified` are the
// account-level identity used to link providers together (see
// IdentityRepository) - not tied to any single provider.
export type Identity = {
  uid: string;
  email: string | null;
  emailVerified: boolean;
  discord?: DiscordCredential;
  google?: GoogleCredential;
  twitch?: TwitchCredential;
};

// What actually lives on req.user for the duration of a request: derived from
// an Identity, provider-agnostic, and (like the AuthUser-based SessionUser it
// replaces) carries no live OAuth tokens - nothing downstream reads them off
// req.user, so they're kept out of the object entirely rather than merely
// typed away.
export type SessionUser = {
  id: string;
  email: string | null;
  emailVerified: boolean;
  name: string;
  avatarUrl: string | null;
  providers: Provider[];
};
