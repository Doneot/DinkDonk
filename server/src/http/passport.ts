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
import type {
  DiscordCredential,
  GoogleCredential,
  Identity,
  Provider,
  SessionUser,
  TwitchCredential,
} from "../modules/auth/domain/Identity.js";
import type { IdentityRepository } from "../modules/auth/ports/IdentityRepository.js";
import { resolveIdentity } from "../modules/auth/application/resolveIdentity.js";
import { IdentityConflictError } from "../modules/auth/domain/IdentityConflictError.js";
import { ConflictError } from "./errors/ConflictError.js";
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

// How long a "Connect Discord" round trip has to complete before its stashed
// req.session.linkDiscordUid is treated as stale rather than honored. Without
// this, abandoning the flow after being redirected to Discord (closing the
// tab, never authorizing) would leave that uid sitting in the session for the
// rest of its 30-day lifetime, silently turning some later, unrelated Discord
// login attempt in the same browser into a link instead of a fresh sign-in.
export const LINK_DISCORD_INTENT_TTL_MS = 10 * 60 * 1000;

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

// The 4 sign-in-eligible providers below (Discord, Google, Twitch) each need
// their own callback URL registered with that provider's app config, but all
// follow the identical .../api/auth/{provider}/callback shape - duplicating
// the isProduction ternary per-provider was how the dev fallback port (3000
// here) drifted out of sync with authRoutes.ts's separate localhost:5000
// client-redirect fallback in the past.
function buildCallbackUrl(provider: string): string {
  return env.isProduction
    ? `${assertDefined(env.serverUrl, "Server URL is not defined")}/api/auth/${provider}/callback`
    : `http://localhost:3000/api/auth/${provider}/callback`;
}

// Google's and Twitch's verify callbacks (both synchronous functions wrapping
// an async IIFE) need the same "normalize a rejection to a real Error and
// hand it to done()" translation; factored out so that isn't hand-copied
// per provider.
function runVerify(done: VerifyCallback, fn: () => Promise<void>): void {
  fn().catch((error: unknown) => {
    done(error instanceof Error ? error : new Error(String(error)));
  });
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
    // 3-arg form (req first): passport's internal dispatch checks the
    // registered function's arity and passes req only when it's declared -
    // used here so the resolved Identity can be cached on req for later
    // middleware/handlers in the same request (see express.d.ts's
    // req.identity) instead of each independently re-fetching it.
    async (
      req: express.Request,
      { id: uid }: { id: string },
      done: (err: unknown, user?: Express.User | false | null) => void,
    ): Promise<void> => {
      try {
        const result = await resolveIdentity(
          repository,
          uid,
          "Failed to decrypt stored tokens for session user; logging out",
        );

        req.identity = result.status === "found" ? result.identity : null;

        switch (result.status) {
          case "found":
            done(null, toSessionUser(result.identity));
            return;

          case "not_found":
            done(null, null);
            return;

          case "decryption_failed":
            // done(null, false) - not an error - is Passport's convention
            // for "treat this session as unauthenticated", as opposed to
            // done(error) which would surface as a 500 on every request
            // using this session.
            done(null, false);
            return;
        }
      } catch (error) {
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

      callbackURL: buildCallbackUrl("discord"),

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
        const linkIntentExpired =
          !req.session.linkDiscordUidExpiresAt ||
          Date.now() > req.session.linkDiscordUidExpiresAt;

        // Consumed once regardless of outcome: this round trip is done with
        // it either way, and leaving it set would silently turn a later,
        // unrelated Discord login attempt in the same browser session into a
        // link attempt.
        delete req.session.linkDiscordUid;
        delete req.session.linkDiscordUidExpiresAt;

        if (linkingUid && !linkIntentExpired) {
          const identity = await repository.linkDiscordIdentity(
            linkingUid,
            credential,
            profile.email ?? null,
            profile.verified ?? false,
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
        // linkDiscordIdentity raises a transport-agnostic domain error for
        // this specific conflict; translated to ConflictError only at this
        // HTTP boundary so errorHandler.ts's 409 response is preserved
        // without the repository depending on it.
        if (error instanceof IdentityConflictError) {
          done(new ConflictError(error.message));
          return;
        }

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

          callbackURL: buildCallbackUrl("google"),

          scope: ["email", "profile"],

          // Binds a session-stored nonce into the OAuth redirect/callback
          // round trip, same as the Discord and Twitch strategies above -
          // without it, Google logins had no CSRF binding between the
          // authorization request and its callback.
          state: true,
        },

        (
          _accessToken: string,
          _refreshToken: string,
          profile: GoogleProfile,
          done: VerifyCallback,
        ): void => {
          runVerify(done, async () => {
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

          callbackURL: buildCallbackUrl("twitch"),

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
          runVerify(done, async () => {
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
          });
        },
      ),
    );
  }

  return passport;
}
