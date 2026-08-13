import express from "express";
import type { ErrorRequestHandler, RequestHandler, Router } from "express";
import passport from "passport";

import type { Provider } from "../../modules/auth/domain/Identity.js";
import type { IdentityRepository } from "../../modules/auth/ports/IdentityRepository.js";
import type { DiscordService } from "../../modules/discord/ports/DiscordService.js";
import type { UserRepository } from "../../modules/users/ports/UserRepository.js";
import { logger } from "../../shared/logger/logger.js";
import { dashboardUrl } from "../../shared/utils/urls.js";
import { SESSION_COOKIE_NAME } from "../configureMiddleware.js";
import { AppError } from "../errors/AppError.js";
import { requireAuthenticated, requireUser } from "../middleware/auth.js";
import {
  discordInviteUrl,
  isGoogleSignInEnabled,
  isTwitchSignInEnabled,
  LINK_DISCORD_INTENT_TTL_MS,
} from "../passport.js";
import {
  authProvidersResponseSchema,
  userResponseSchema,
} from "../schemas/responses.js";
const discordAuth = passport.authenticate("discord") as RequestHandler;

const discordAuthCallback = passport.authenticate("discord", {
  failureRedirect: "/login-failed",
}) as RequestHandler;

const googleAuth = passport.authenticate("google") as RequestHandler;

const googleAuthCallback = passport.authenticate("google", {
  failureRedirect: "/login-failed",
}) as RequestHandler;

const twitchAuth = passport.authenticate("twitch") as RequestHandler;

const twitchAuthCallback = passport.authenticate("twitch", {
  failureRedirect: "/login-failed",
}) as RequestHandler;

type CreateAuthRouterOptions = {
  repository: UserRepository;

  identities: IdentityRepository;

  discord: DiscordService;

  ensureFreshToken: express.RequestHandler;

  /**
   * Forcibly drops any live Socket.IO connections for a user (see
   * realtime/socketServer.ts's SocketServer#disconnectUser). Optional so a
   * composition root that hasn't wired the socket server through yet still
   * compiles; without it, /logout still destroys the Firestore session doc,
   * it just can't reach into already-established realtime connections.
   */
  disconnectUser?: (userId: string) => void;
};

export function createAuthRouter({
  repository,
  identities,
  discord,
  ensureFreshToken,
  disconnectUser,
}: CreateAuthRouterOptions): Router {
  const router = express.Router();

  // Shared by every provider's callback route: resolve (or self-heal) the
  // users/{id} doc, work out the Discord DM capability via the linked
  // identity's actual discord.id (never authUser.id/uid - those only
  // coincide for Discord-primary accounts), and redirect to the dashboard.
  // Session-fixation protection already happened by this point: passport's
  // req.login() (invoked internally by the *AuthCallback middleware, on a
  // successful verify) regenerates the session id before writing
  // req.session.passport.user - regenerating again here would create a
  // brand-new, empty session and silently discard this write, logging the
  // user right back out.
  const handleProviderCallback: RequestHandler = async (req, res) => {
    const authUser = requireUser(req);
    const user = await repository.getUser(authUser.id);
    const identity = await identities.getIdentity(authUser.id);

    // `||`, not `??`: canReceiveDM defaults to and persists as `false` (see
    // UserRecordSchema), never null/undefined, once a user record exists -
    // so `??` would never re-probe a user who signed up via a non-Discord
    // provider (canReceiveDM=false persisted with no linked Discord yet)
    // once they later link Discord via /discord/link, permanently stranding
    // them at canReceiveDM=false. `||` re-probes whenever it isn't already
    // confirmed true, while still short-circuiting (no probe call at all)
    // when there's no linked Discord identity to probe.
    const canReceiveDM =
      user?.canReceiveDM ||
      (identity?.discord
        ? await discord.canSendDirectMessage(identity.discord.id)
        : false);

    await repository.updateUser(authUser.id, {
      canReceiveDM,
    });

    req.session.canReceiveDM = canReceiveDM;

    res.redirect(dashboardUrl());
  };

  // A failed token exchange or bad credentials already redirects to
  // /login-failed via failureRedirect below - but that option is only
  // consulted when a strategy explicitly reports authentication failure
  // (done(null, false)). Any exception during the flow instead - a verify
  // callback's Firestore write failing, a profile fetch erroring after a
  // successful token exchange, handleProviderCallback's own read/write
  // failing - calls done(error)/next(error), bypassing failureRedirect
  // entirely. Without this, that lands on the generic JSON error handler,
  // which a real browser renders as a dead-end blob of JSON mid-navigation
  // (this route is only ever reached via a top-level redirect back from the
  // provider), with no way back into the app. Passed as the last argument
  // to each */callback route below so it only catches errors from that
  // route's own handlers, ahead of the app's generic error handler.
  const handleAuthCallbackError: ErrorRequestHandler = (error, req, res, next) => {
    // An AppError (e.g. requireUser's UnauthorizedError for a callback
    // reached with no session at all - defensive, since passport's own
    // authenticate() middleware already gates this in practice) already
    // carries its own correct status code and a message meant to be shown
    // as-is - handled by the app's generic error handler exactly like every
    // other route, not redirected.
    if (error instanceof AppError) {
      next(error);

      return;
    }

    logger.error(
      { error, path: req.path },
      "OAuth callback failed; redirecting to login-failed",
    );

    res.redirect("/login-failed");
  };

  router.get("/providers", (_req, res) => {
    const providers: Provider[] = ["discord"];

    if (isGoogleSignInEnabled) {
      providers.push("google");
    }

    if (isTwitchSignInEnabled) {
      providers.push("twitch");
    }

    res.json(
      authProvidersResponseSchema.parse({ providers, discordInviteUrl }),
    );
  });

  router.get("/discord", discordAuth);

  // Lets an already-authenticated user attach a Discord account to their
  // current one (e.g. its email doesn't match their existing account's, so
  // upsertDiscordIdentity's automatic by-email linking wouldn't apply).
  // Stashing the uid in the session (rather than, say, passport's `state`
  // param) keeps this a one-line addition to the existing Discord strategy
  // rather than a second strategy/callback route to maintain.
  router.get(
    "/discord/link",

    requireAuthenticated,

    (req, _res, next) => {
      req.session.linkDiscordUid = requireUser(req).id;
      req.session.linkDiscordUidExpiresAt = Date.now() + LINK_DISCORD_INTENT_TTL_MS;

      next();
    },

    discordAuth,
  );

  router.get(
    "/discord/callback",
    discordAuthCallback,
    handleProviderCallback,
    handleAuthCallbackError,
  );

  if (isGoogleSignInEnabled) {
    router.get("/google", googleAuth);

    router.get(
      "/google/callback",
      googleAuthCallback,
      handleProviderCallback,
      handleAuthCallbackError,
    );
  }

  if (isTwitchSignInEnabled) {
    router.get("/twitch", twitchAuth);

    router.get(
      "/twitch/callback",
      twitchAuthCallback,
      handleProviderCallback,
      handleAuthCallbackError,
    );
  }

  router.get(
    "/user",

    async (req, res) => {
      const authUser = requireUser(req);
      let user = await repository.getUser(authUser.id);

      if (!user) {
        // Self-heal: the users/{id} doc can be missing if the write during the
        // OAuth callback failed after the auth doc was already created, leaving
        // a valid session with no corresponding user record. Reads the linked
        // identity's discord.id instead of assuming authUser.id (the uid) is
        // the Discord id, since that only holds for Discord-primary accounts.
        const identity = await identities.getIdentity(authUser.id);

        await repository.updateUser(authUser.id, {
          canReceiveDM: identity?.discord
            ? await discord.canSendDirectMessage(identity.discord.id)
            : false,
          subscriptions: [],
        });

        user = await repository.getUser(authUser.id);
      }

      if (!user) {
        throw new Error(
          `Failed to create user record for authenticated user ${authUser.id}`,
        );
      }

      res.json(
        userResponseSchema.parse({
          id: authUser.id,
          email: authUser.email,
          emailVerified: authUser.emailVerified,
          name: authUser.name,
          avatarUrl: authUser.avatarUrl,
          providers: authUser.providers,
          canReceiveDM: user.canReceiveDM,
          subscriptions: user.subscriptions,
        }),
      );
    },
  );

  router.post(
    "/logout",

    // Explicit and self-documenting, independent of ensureFreshToken's
    // internals (it happens to call requireUser(req) itself, which was the
    // only thing guarding this route before): a 401 here shouldn't depend on
    // an unrelated middleware's implementation detail.
    requireAuthenticated,

    ensureFreshToken,

    (req, res, next) => {
      // Captured before req.logout() clears req.user below.
      const userId = requireUser(req).id;

      req.logout((error) => {
        if (error) {
          next(error);

          return;
        }

        req.session.destroy(() => {
          res.clearCookie(SESSION_COOKIE_NAME);

          // Drop any already-established realtime connections for this
          // user: destroying the Firestore session doc above doesn't by
          // itself touch a socket that authenticated before logout.
          disconnectUser?.(userId);

          res.status(200).json({});
        });
      });
    },
  );

  return router;
}
