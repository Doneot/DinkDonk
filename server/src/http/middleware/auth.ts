import type express from "express";
import refresh from "passport-oauth2-refresh";
import { logger } from "../../shared/logger/logger.js";
import type { IdentityRepository } from "../../modules/auth/ports/IdentityRepository.js";

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

/**
 * Keeps a signed-in Discord user's stored OAuth token from silently
 * expiring. Nothing in this codebase actually calls Discord's API with the
 * user's own token (DM delivery goes through the bot's own token in
 * DiscordBot.ts), so this is purely best-effort housekeeping: a refresh
 * failure is logged and the request proceeds rather than forcing a logout,
 * and a session with no linked Discord credential (a Google- or Twitch-only
 * sign-in) skips this entirely.
 */
export function createFreshTokenMiddleware(
  repository: IdentityRepository,
): (
  req: express.Request,
  res: express.Response,
  next: express.NextFunction,
) => Promise<void> {
  const locks = new Map<string, Promise<void>>();

  return async function ensureFreshDiscordToken(
    req: express.Request,
    res: express.Response,
    next: express.NextFunction,
  ): Promise<void> {
    const { id: uid, providers } = requireUser(req);

    if (!providers.includes("discord")) {
      next();

      return;
    }

    try {
      const identity = await repository.getIdentity(uid);
      const discord = identity?.discord;

      if (!discord) {
        next();

        return;
      }

      const tokenIsFresh = Date.now() - discord.fetchTime <= MAX_TOKEN_AGE_MS;

      if (tokenIsFresh) {
        next();

        return;
      }

      if (!locks.has(uid)) {
        locks.set(
          uid,

          refreshDiscordToken(discord.refreshToken)
            .then((tokens) =>
              repository.updateDiscordCredential(uid, {
                ...tokens,

                fetchTime: Date.now(),
              }),
            )
            .catch((error: unknown) => {
              logger.warn(
                {
                  requestId: req.requestId,

                  userId: uid,

                  error,
                },
                "Discord token refresh failed; continuing without it",
              );
            })
            .finally(() => {
              locks.delete(uid);
            }),
        );
      }

      await locks.get(uid);

      next();
    } catch (error) {
      logger.error(
        {
          requestId: req.requestId,

          userId: uid,

          error,
        },
        "Failed to check Discord token freshness",
      );

      next();
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
