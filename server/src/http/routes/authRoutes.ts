import express from "express";
import passport from "passport";
import type { RequestHandler, Router } from "express";
import { env } from "../../shared/config/env.js";
import { requireUser } from "../middleware/auth.js";
import type { DiscordService } from "../../modules/discord/ports/DiscordService.js";
import type { UserRepository } from "../../modules/users/ports/UserRepository.js";
import type { UserResponse } from "../schemas/responses.js";

export const discordAuth = passport.authenticate("discord") as RequestHandler;

export const discordAuthCallback = passport.authenticate("discord", {
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

      if (!user) {
        res.status(500).send("Failed retrieving user");

        return;
      }

      const canReceiveDM =
        user?.canReceiveDM ?? (await discord.canSendDirectMessage(user.id));

      await repository.updateUser(user.id, {
        canReceiveDM,
      });

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
      const user = await repository.getUser(authUser.id);

      if (!user) {
        res.status(500).send("Failed retrieving user");

        return;
      }

      res.json({
        ...req.user,

        ...user,
      } satisfies UserResponse);
    },
  );

  router.post(
    "/logout",

    ensureFreshToken,

    (req, res) => {
      req.logout((error) => {
        if (error) {
          res.status(500).send("Logout failed");

          return;
        }

        req.session.destroy(() => {
          res.clearCookie("connect.sid");

          res.redirect("/");
        });
      });
    },
  );

  return router;
}
