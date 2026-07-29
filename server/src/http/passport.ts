import type express from "express";
import passport from "passport";
import { Strategy as DiscordStrategy, type Profile } from "passport-discord";
import {
  Strategy as GoogleStrategy,
  type Profile as GoogleProfile,
} from "passport-google-oauth20";
import refresh from "passport-oauth2-refresh";
import { env } from "../shared/config/env.js";
import { assertDefined } from "../shared/utils/assert.js";
import { TokenDecryptionError } from "../shared/utils/crypto.js";
import { logger } from "../shared/logger/logger.js";
import type {
  DiscordCredential,
  GoogleCredential,
  Identity,
  Provider,
  SessionUser,
  TwitchCredential,
} from "../modules/auth/domain/Identity.js";
import type { IdentityRepository } from "../modules/auth/ports/IdentityRepository.js";
import type { VerifyCallback } from "passport-oauth2";
import { TwitchOAuth2Strategy, type TwitchProfile } from "./strategies/TwitchOAuth2Strategy.js";

// Google sign-in is optional: existing deployments that haven't provisioned
// Google OAuth credentials yet shouldn't be broken by requiring them.
export const isGoogleSignInEnabled = Boolean(
  env.google.clientId && env.google.clientSecret,
);

// Twitch sign-in reuses the same app/credentials as EventSub (TWITCH_CLIENT_ID/
// SECRET, always set), so it's gated behind its own explicit flag rather than
// credential presence - otherwise it would turn on for every deployment the
// moment this code ships, before anyone's added the login callback URL to
// their Twitch app.
export const isTwitchSignInEnabled = env.twitch.loginEnabled;

// req.user only needs display/identity fields; nothing downstream reads
// OAuth tokens off it (createFreshTokenMiddleware re-fetches them from the
// repository whenever it needs them), so they're dropped here rather than
// living in the session-attached object for the rest of the request/session.
function toSessionUser(identity: Identity): SessionUser {
  const providers: Provider[] = [];

  if (identity.discord) {
    providers.push("discord");
  }

  if (identity.google) {
    providers.push("google");
  }

  if (identity.twitch) {
    providers.push("twitch");
  }

  return {
    id: identity.uid,
    email: identity.email,
    emailVerified: identity.emailVerified,
    name:
      identity.discord?.username ??
      identity.google?.name ??
      identity.twitch?.displayName ??
      identity.email ??
      "User",
    avatarUrl:
      (identity.discord?.avatar
        ? `https://cdn.discordapp.com/avatars/${identity.discord.id}/${identity.discord.avatar}.png`
        : null) ??
      identity.google?.picture ??
      identity.twitch?.profileImageUrl ??
      null,
    providers,
  };
}

export function configurePassport(
  repository: IdentityRepository,
): typeof passport {
  passport.serializeUser((user: Express.User, done): void => {
    const sessionUser = user as { id: string };
    done(null, {
      id: sessionUser.id,
    });
  });

  passport.deserializeUser(
    async ({ id: uid }: { id: string }, done): Promise<void> => {
      try {
        const identity = await repository.getIdentity(uid);

        done(null, identity ? toSessionUser(identity) : null);
      } catch (error) {
        if (error instanceof TokenDecryptionError) {
          logger.warn(
            { userId: uid, error },
            "Failed to decrypt stored tokens for session user; logging out",
          );
          done(null, false);
          return;
        }

        done(error, null);
      }
    },
  );

  const strategy = new DiscordStrategy(
    {
      clientID: assertDefined(
        env.discord.clientId,
        "Discord Client ID is not defined",
      ),

      clientSecret: assertDefined(
        env.discord.clientSecret,
        "Discord Client Secret is not defined",
      ),

      callbackURL: env.isProduction
        ? `${assertDefined(env.serverUrl, "Server URL is not defined")}/api/auth/discord/callback`
        : "http://localhost:3000/api/auth/discord/callback",

      // "email" lets account linking (see IdentityRepository) match this
      // Discord account to an existing account signed up through another
      // provider on the same verified email.
      scope: ["identify", "email"],

      // Binds a session-stored nonce into the OAuth redirect/callback round
      // trip, preventing an attacker from injecting their own Discord
      // identity into a victim's session (login/OAuth CSRF).
      state: true,

      // Needed to read req.session.linkDiscordUid below, distinguishing a
      // "Connect Discord" round trip (started by an already-authenticated
      // user) from a fresh login/signup.
      passReqToCallback: true,
    },

    async (
      req: express.Request,
      accessToken: string,
      refreshToken: string,
      profile: Profile,
      done: VerifyCallback,
    ): Promise<void> => {
      try {
        const credential: DiscordCredential = {
          id: profile.id,

          username: profile.username,

          discriminator: profile.discriminator,

          avatar: profile.avatar ?? "",

          accessToken,

          refreshToken,

          fetchTime: Date.now(),
        };

        const linkingUid = req.session.linkDiscordUid;

        if (linkingUid) {
          // Consumed once: this round trip is done with it either way, and
          // leaving it set would silently turn a later, unrelated Discord
          // login attempt in the same browser session into a link attempt.
          delete req.session.linkDiscordUid;

          const identity = await repository.linkDiscordIdentity(
            linkingUid,
            credential,
          );

          done(null, toSessionUser(identity));
          return;
        }

        const identity = await repository.upsertDiscordIdentity(
          credential,
          profile.email ?? null,
          profile.verified ?? false,
        );

        done(null, toSessionUser(identity));
      } catch (error) {
        done(error);
      }
    },
  );

  // Set on this strategy instance rather than DiscordStrategy.prototype so it
  // doesn't leak as a global side effect onto every DiscordStrategy in the
  // process.
  strategy.authorizationParams = (): {
    prompt: string;
  } => ({
    prompt: "none",
  });

  passport.use(strategy);

  refresh.use(strategy);

  if (isGoogleSignInEnabled) {
    passport.use(
      new GoogleStrategy(
        {
          clientID: assertDefined(
            env.google.clientId,
            "Google Client ID is not defined",
          ),

          clientSecret: assertDefined(
            env.google.clientSecret,
            "Google Client Secret is not defined",
          ),

          callbackURL: env.isProduction
            ? `${assertDefined(env.serverUrl, "Server URL is not defined")}/api/auth/google/callback`
            : "http://localhost:3000/api/auth/google/callback",

          scope: ["email", "profile"],
        },

        (
          _accessToken: string,
          _refreshToken: string,
          profile: GoogleProfile,
          done: VerifyCallback,
        ): void => {
          (async (): Promise<void> => {
            // Requesting the "email" scope means Google always includes a
            // verified email on the profile; treat its absence as a hard
            // failure rather than silently linking/creating on an empty key.
            const primaryEmail = assertDefined(
              profile.emails?.[0],
              "Google profile is missing an email address",
            );

            const credential: GoogleCredential = {
              id: profile.id,
              email: primaryEmail.value,
              name: profile.displayName,
              picture: profile.photos?.[0]?.value ?? "",
            };

            const identity = await repository.upsertGoogleIdentity(
              credential,
              primaryEmail.value,
              primaryEmail.verified,
            );

            done(null, toSessionUser(identity));
          })().catch((error: unknown) => {
            done(error instanceof Error ? error : new Error(String(error)));
          });
        },
      ),
    );
  }

  if (isTwitchSignInEnabled) {
    passport.use(
      new TwitchOAuth2Strategy(
        {
          authorizationURL: "https://id.twitch.tv/oauth2/authorize",
          tokenURL: "https://id.twitch.tv/oauth2/token",

          clientID: assertDefined(
            env.twitch.clientId,
            "Twitch Client ID is not defined",
          ),

          clientSecret: assertDefined(
            env.twitch.clientSecret,
            "Twitch Client Secret is not defined",
          ),

          callbackURL: env.isProduction
            ? `${assertDefined(env.serverUrl, "Server URL is not defined")}/api/auth/twitch/callback`
            : "http://localhost:3000/api/auth/twitch/callback",

          // Only requesting user:read:email lets account linking match a
          // Twitch account to an existing account on the same verified
          // email, same as Discord/Google's "email" scope.
          scope: ["user:read:email"],

          state: true,
        },

        (
          _accessToken: string,
          _refreshToken: string,
          profile: TwitchProfile,
          done: VerifyCallback,
        ): void => {
          (async (): Promise<void> => {
            const credential: TwitchCredential = {
              id: profile.id,
              login: profile.login,
              displayName: profile.displayName,
              profileImageUrl: profile.profileImageUrl,
            };

            const identity = await repository.upsertTwitchIdentity(
              credential,
              profile.email,
              profile.email !== null,
            );

            done(null, toSessionUser(identity));
          })().catch((error: unknown) => {
            done(error instanceof Error ? error : new Error(String(error)));
          });
        },
      ),
    );
  }

  return passport;
}
