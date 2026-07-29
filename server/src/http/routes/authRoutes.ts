import express from "express";
import passport from "passport";
import type { RequestHandler, Router } from "express";
import { env } from "../../shared/config/env.js";
import { requireAuthenticated, requireUser } from "../middleware/auth.js";
import { isGoogleSignInEnabled, isTwitchSignInEnabled } from "../passport.js";
import type { DiscordService } from "../../modules/discord/ports/DiscordService.js";
import type { UserRepository } from "../../modules/users/ports/UserRepository.js";
import type { IdentityRepository } from "../../modules/auth/ports/IdentityRepository.js";
import type { Provider } from "../../modules/auth/domain/Identity.js";
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
};

function loginRedirect(): string {
  return env.isProduction
    ? `${env.serverUrl}/dashboard`
    : "http://localhost:5000/dashboard";
}

export function createAuthRouter({
  repository,
  identities,
  discord,
  ensureFreshToken,
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

    const canReceiveDM =
      user?.canReceiveDM ??
      (identity?.discord
        ? await discord.canSendDirectMessage(identity.discord.id)
        : false);

    await repository.updateUser(authUser.id, {
      canReceiveDM,
    });

    req.session.canReceiveDM = canReceiveDM;

    res.redirect(loginRedirect());
  };

  router.get("/providers", (_req, res) => {
    const providers: Provider[] = ["discord"];

    if (isGoogleSignInEnabled) {
      providers.push("google");
    }

    if (isTwitchSignInEnabled) {
      providers.push("twitch");
    }

    res.json(authProvidersResponseSchema.parse({ providers }));
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

      next();
    },

    discordAuth,
  );

  router.get("/discord/callback", discordAuthCallback, handleProviderCallback);

  if (isGoogleSignInEnabled) {
    router.get("/google", googleAuth);

    router.get("/google/callback", googleAuthCallback, handleProviderCallback);
  }

  if (isTwitchSignInEnabled) {
    router.get("/twitch", twitchAuth);

    router.get("/twitch/callback", twitchAuthCallback, handleProviderCallback);
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

    ensureFreshToken,

    (req, res, next) => {
      req.logout((error) => {
        if (error) {
          next(error);

          return;
        }

        req.session.destroy(() => {
          res.clearCookie("connect.sid");

          res.json({ ok: true });
        });
      });
    },
  );

  return router;
}
