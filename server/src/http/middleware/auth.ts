import type express from "express";
import refresh from "passport-oauth2-refresh";
import { env } from "../../config/env.js";
import { logger } from "../../utils/logger.js";
import type { User } from "../../types/user.js";

const MAX_TOKEN_AGE_MS = 6 * 24 * 60 * 60 * 1000;

type TokenRefreshResult = {
  accessToken: string;

  refreshToken: string;
};

type AuthRepository = {
  getUser(userId: string): Promise<User | null>;

  saveUser(
    userId: string,
    data: Partial<Pick<User, "accessToken" | "refreshToken" | "fetchTime">>,
  ): Promise<void>;
};

export function requireAuthenticated(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction,
): void {
  if (req.user) {
    next();

    return;
  }

  res.status(401).json({
    error: "Not authenticated",
  });
}

export function createFreshTokenMiddleware(
  repository: AuthRepository,
): (
  req: express.Request,
  res: express.Response,
  next: express.NextFunction,
) => Promise<void> {
  const locks = new Map<string, Promise<TokenRefreshResult>>();

  return async function ensureFreshDiscordToken(
    req: express.Request,
    res: express.Response,
    next: express.NextFunction,
  ): Promise<void> {
    const userId = req.user?.id;

    if (!userId) {
      res.status(401).json({
        error: "Not authenticated",
      });

      return;
    }

    try {
      const user = await repository.getUser(userId);

      if (!user?.accessToken || !user?.refreshToken) {
        res.redirect("/api/auth/discord");

        return;
      }

      const tokenIsFresh =
        Date.now() - (user.fetchTime || 0) <= MAX_TOKEN_AGE_MS;

      if (tokenIsFresh) {
        next();

        return;
      }

      if (!locks.has(userId)) {
        locks.set(
          userId,

          refreshDiscordToken(user.refreshToken)
            .then(async (tokens): Promise<TokenRefreshResult> => {
              await repository.saveUser(userId, {
                ...tokens,

                fetchTime: Date.now(),
              });

              return tokens;
            })

            .finally(() => {
              locks.delete(userId);
            }),
        );
      }

      await locks.get(userId);

      next();
    } catch (error) {
      const err = error as Error;

      logger.error("Discord token refresh failed", {
        userId,

        message: err.message,
      });

      req.logout(() => {
        req.session.destroy(() => {
          res.clearCookie("connect.sid");

          res.redirect(
            env.isProduction ? env.serverUrl : "http://localhost:5000",
          );
        });
      });
    }
  };
}

function refreshDiscordToken(
  refreshToken: string,
): Promise<TokenRefreshResult> {
  return new Promise((resolve, reject): void => {
    refresh.requestNewAccessToken(
      "discord",

      refreshToken,

      (
        error: unknown,
        accessToken: string | undefined,
        newRefreshToken?: string,
      ): void => {
        if (error) {
          reject(error);

          return;
        }

        if (!accessToken) {
          reject(
            new Error("Missing access token from Discord refresh response"),
          );

          return;
        }

        resolve({
          accessToken,

          refreshToken: newRefreshToken || refreshToken,
        });
      },
    );
  });
}
