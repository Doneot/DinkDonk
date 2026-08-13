import type {
  DiscordCredential,
  GoogleCredential,
  Identity,
  SessionUser,
  TwitchCredential,
} from "../../modules/auth/domain/Identity.js";
import { TEST_DISCORD_ID } from "../constants.js";

const DEFAULT_FETCH_TIME = 1_700_000_000_000;

export function buildDiscordCredential(
  overrides: Partial<DiscordCredential> = {},
): DiscordCredential {
  return {
    id: TEST_DISCORD_ID,
    username: "test-user",
    discriminator: "0001",
    avatar: "avatar.png",
    accessToken: "access-token",
    refreshToken: "refresh-token",
    fetchTime: DEFAULT_FETCH_TIME,
    ...overrides,
  };
}

export function buildGoogleCredential(
  overrides: Partial<GoogleCredential> = {},
): GoogleCredential {
  return {
    id: "google-user-1",
    email: "tester@example.com",
    name: "test-user",
    picture: "https://example.com/photo.jpg",
    ...overrides,
  };
}

export function buildTwitchCredential(
  overrides: Partial<TwitchCredential> = {},
): TwitchCredential {
  return {
    id: "twitch-user-1",
    login: "test-user",
    displayName: "test-user",
    profileImageUrl: "https://example.com/photo.jpg",
    ...overrides,
  };
}

type BuildIdentityOverrides = {
  uid?: string;
  email?: string | null;
  emailVerified?: boolean;
  // Explicit `| undefined` (rather than reusing Partial<Identity>) so a
  // caller can pass `discord: undefined` to build an identity with no linked
  // Discord credential at all - e.g. simulating a future non-Discord sign-in
  // - without exactOptionalPropertyTypes rejecting the literal `undefined`.
  discord?: DiscordCredential | undefined;
  google?: GoogleCredential | undefined;
  twitch?: TwitchCredential | undefined;
};

export function buildIdentity(
  overrides: BuildIdentityOverrides = {},
): Identity {
  const uid = overrides.uid ?? TEST_DISCORD_ID;
  const discord = "discord" in overrides
    ? overrides.discord
    : buildDiscordCredential({ id: uid });
  const google = overrides.google;
  const twitch = overrides.twitch;

  return {
    uid,
    email: overrides.email ?? null,
    emailVerified: overrides.emailVerified ?? false,
    ...(discord ? { discord } : {}),
    ...(google ? { google } : {}),
    ...(twitch ? { twitch } : {}),
  };
}

export function buildSessionUser(
  overrides: Partial<SessionUser> = {},
): SessionUser {
  return {
    id: TEST_DISCORD_ID,
    email: null,
    emailVerified: false,
    name: "test-user",
    avatarUrl: "https://cdn.discordapp.com/avatars/discord-user-1/avatar.png",
    providers: ["discord"],
    ...overrides,
  };
}
