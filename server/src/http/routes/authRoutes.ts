import express from "express";
import passport from "passport";
import type { Request, Response, Router } from "express";
import { env } from "../../config/env.js";
import { requireAuthenticated } from "../middleware/auth.js";
import { assertAuthenticated } from "../../utils/assertAuthenticated.js";
import type { User } from "../../types/user.js";
import type { DiscordService } from "../../types/services/discord.js";

type Repository = {
  getUser(userId: string): Promise<User | null>;

  saveUser(userId: string, data: Partial<User>): Promise<void>;
};

type CreateAuthRouterOptions = {
  repository: Repository;

  discord: DiscordService;

  ensureFreshToken: express.RequestHandler;
};

export function createAuthRouter({
  repository,
  discord,
  ensureFreshToken,
}: CreateAuthRouterOptions): Router {
  const router = express.Router();

  router.get(
    "/discord",

    passport.authenticate("discord"),
  );

  router.get(
    "/discord/callback",

    passport.authenticate("discord", {
      failureRedirect: "/login-failed",
    }),

    async (req: Request, res: Response): Promise<void> => {
      assertAuthenticated(req);

      const user = await repository.getUser(req.user.id);

      const canReceiveDM =
        user?.canReceiveDM ?? (await discord.canSendDirectMessage(req.user.id));

      await repository.saveUser(req.user.id, {
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

    (req: Request, res: Response): void => {
      assertAuthenticated(req);

      res.json({
        ...req.user,

        canReceiveDM:
          req.session.canReceiveDM ?? req.user.canReceiveDM ?? false,
      });
    },
  );

  router.get(
    "/logout",

    requireAuthenticated,

    ensureFreshToken,

    (req: Request, res: Response): void => {
      assertAuthenticated(req);

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
