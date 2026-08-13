import type express from "express";
import refresh from "passport-oauth2-refresh";

import type { Redis } from "../../infrastructure/redis/redisClient.js";
import type { IdentityRepository } from "../../modules/auth/ports/IdentityRepository.js";
import { logger } from "../../shared/logger/logger.js";
import { UnauthorizedError } from "../errors/UnauthorizedError.js";

const MAX_TOKEN_AGE_MS = 6 * 24 * 60 * 60 * 1000;

// Safety-net TTL on the distributed refresh lock: comfortably longer than a
// Discord token exchange should ever take, so a crashed instance can't hold
// the lock indefinitely and block refreshes for that user on every other
// instance.
const REFRESH_LOCK_TTL_MS = 30_000;

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
 *
 * `redis`, when supplied, backs a distributed lock alongside the in-process
 * one below: without it, two backend instances could both decide the same
 * user's token is stale and race Discord's refresh-token rotation, with the
 * loser's exchange failing. Optional so callers that don't wire up Redis
 * (tests) still work, falling back to single-instance-only locking.
 */
export function createFreshTokenMiddleware(
  repository: IdentityRepository,
  redis?: Redis,
): (
  req: express.Request,
  res: express.Response,
  next: express.NextFunction,
) => Promise<void> {
  // Dedupes concurrent requests for the same user within this instance
  // without a Redis round trip; the distributed lock below is only needed
  // to coordinate across separate instances.
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
      // req.identity is populated once per request by passport.ts's
      // deserializeUser (see express.d.ts) - reuse it instead of a second
      // Firestore read for the same document when it's already available.
      const identity =
        req.identity !== undefined
          ? req.identity
          : await repository.getIdentity(uid);
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

          (async () => {
            const lockKey = `lock:discord-token-refresh:${uid}`;

            // Without Redis (tests, or a deployment that hasn't wired it
            // up), there's no cross-instance coordination possible anyway,
            // so this instance always proceeds - matching the previous
            // single-instance-only behavior exactly.
            const acquiredLock = redis
              ? (await redis.set(lockKey, "1", "PX", REFRESH_LOCK_TTL_MS, "NX")) ===
                "OK"
              : true;

            if (!acquiredLock) {
              // Another instance is already refreshing this user's token;
              // skip rather than racing Discord's refresh-token rotation.
              // Nothing depends on this request seeing a freshened token
              // (see the doc comment above), so there's nothing to wait for.
              return;
            }

            try {
              const tokens = await refreshDiscordToken(discord.refreshToken);

              await repository.updateDiscordCredential(uid, {
                ...tokens,

                fetchTime: Date.now(),
              });
            } catch (error: unknown) {
              logger.warn(
                {
                  requestId: req.requestId,

                  userId: uid,

                  error,
                },
                "Discord token refresh failed; continuing without it",
              );
            } finally {
              if (redis) {
                await redis.del(lockKey).catch((error: unknown) => {
                  logger.warn(
                    { userId: uid, error },
                    "Failed to release Discord token refresh lock",
                  );
                });
              }
            }
          })().finally(() => {
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
