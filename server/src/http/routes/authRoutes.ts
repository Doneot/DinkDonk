import express from "express";
import passport from "passport";
import type { RequestHandler, Router } from "express";
import { env } from "../../shared/config/env.js";
import { requireUser } from "../middleware/auth.js";
import type { DiscordService } from "../../modules/discord/ports/DiscordService.js";
import type { UserRepository } from "../../modules/users/ports/UserRepository.js";
import { userResponseSchema } from "../schemas/responses.js";
const discordAuth = passport.authenticate("discord") as RequestHandler;

const discordAuthCallback = passport.authenticate("discord", {
  failureRedirect: "/login-failed",
}) as RequestHandler;

type CreateAuthRouterOptions = {
  repository: UserRepository;

  discord: DiscordService;

  ensureFreshToken: express.RequestHandler;
};

export function createAuthRouter({
  repository,
  discord,
  ensureFreshToken,
}: CreateAuthRouterOptions): Router {
  const router = express.Router();

  router.get("/discord", discordAuth);

  router.get(
    "/discord/callback",

    discordAuthCallback,

    async (req, res) => {
      const authUser = requireUser(req);
      const user = await repository.getUser(authUser.id);

      const canReceiveDM =
        user?.canReceiveDM ?? (await discord.canSendDirectMessage(authUser.id));

      await repository.updateUser(authUser.id, {
        canReceiveDM,
      });

      // Session-fixation protection already happened: passport.authenticate's
      // req.login() (invoked internally above, on a successful verify)
      // regenerates the session id before writing req.session.passport.user.
      // Regenerating again here would create a brand-new, empty session and
      // silently discard that write, logging the user right back out.
      req.session.canReceiveDM = canReceiveDM;

      res.redirect(
        env.isProduction
          ? `${env.serverUrl}/dashboard`
          : "http://localhost:5000/dashboard",
      );
    },
  );

  router.get(
    "/user",

    async (req, res) => {
      const authUser = requireUser(req);
      let user = await repository.getUser(authUser.id);

      if (!user) {
        // Self-heal: the users/{id} doc can be missing if the write during the
        // OAuth callback failed after the auth doc was already created, leaving
        // a valid session with no corresponding user record.
        await repository.updateUser(authUser.id, {
          canReceiveDM: await discord.canSendDirectMessage(authUser.id),
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
          username: authUser.username,
          discriminator: authUser.discriminator,
          avatar: authUser.avatar,
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
