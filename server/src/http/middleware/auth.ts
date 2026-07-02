import type express from "express";
import refresh from "passport-oauth2-refresh";
import { env } from "../../shared/config/env.js";
import { logger } from "../../shared/logger/logger.js";
import type { AuthUserRepository } from "../../modules/auth/ports/AuthUserRepository.js";

import { UnauthorizedError } from "../errors/UnauthorizedError.js";

const MAX_TOKEN_AGE_MS = 6 * 24 * 60 * 60 * 1000;

type TokenRefreshResult = {
  accessToken: string;

  refreshToken: string;
};

export function requireUser(req: express.Request): Express.User {
  if (!req.user) {
    throw new UnauthorizedError();
  }

  return req.user;
}

export function requireAuthenticated(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction,
): void {
  if (!req.user) {
    throw new UnauthorizedError();
  }

  next();
}

export function createFreshTokenMiddleware(
  repository: AuthUserRepository,
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
    const { id: userId } = requireUser(req);

    try {
      const user = await repository.getAuthUser(userId);

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
              await repository.updateAuthUser(userId, {
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

      logger.error(
        {
          requestId: req.requestId,

          userId,

          message: err.message,
        },
        "Discord token refresh failed",
      );

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
        error: Error | { statusCode: number; data?: unknown },
        accessToken: string | undefined,
        newRefreshToken?: string,
      ): void => {
        if (error) {
          reject(
            error instanceof Error
              ? error
              : new Error(`Discord refresh error: ${JSON.stringify(error)}`),
          );

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
