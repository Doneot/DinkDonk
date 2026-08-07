import { z } from "zod";
import {
  booleanFromEnv,
  numberFromEnv,
  optionalSecretFromEnv,
  secretFromEnv,
} from "./envParsers.js";

const BaseEnvSchema = z.object({
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),

  // Deliberately has no default (unlike most other numeric env vars): env.ts
  // needs to be able to tell "PORT was never set" apart from "PORT was set
  // to some value" so it can fall back to BACKEND_PORT before finally
  // defaulting to 3000. Bounds match BACKEND_PORT's below.
  PORT: z.coerce.number().int().positive().optional(),

  BACKEND_PORT: z.coerce.number().int().positive().optional(),

  SERVER_URL: z.url().min(1),

  // Backs the rate limiters and the EventSub replay store so both work
  // correctly across a restart and across multiple backend instances - see
  // infrastructure/redis/redisClient.ts. Confined to the private,
  // internal-only Docker network in every compose file, so (like Prometheus
  // in the same network) it isn't password-protected. Optional: every
  // Redis-backed feature (rate limiting, replay dedup, the distributed
  // token-refresh lock) is already built to fall back to an in-process
  // equivalent when redis is undefined - see configureMiddleware.ts and
  // http/middleware/auth.ts - so a contributor can run the backend directly
  // with `npm run dev` without standing up Redis at all. compose.prod.yml
  // and compose.staging.yml both always set this directly, so production
  // deployments are unaffected.
  REDIS_URL: z.url().optional(),

  // Feeds both Express's CORS middleware and Socket.IO's CORS config (see
  // configureMiddleware.ts/socketServer.ts), compared directly against the
  // browser's canonicalized Origin header. Accepts a comma-separated list,
  // mirroring SESSION_SECRET/ENCRYPTION_KEY above, so a deployment fronting
  // more than one origin (an apex + www domain, or a staging environment
  // sharing the same backend) doesn't need a code change to allow it - env.ts
  // exposes the full list as `clientOrigins` for CORS matching, and the first
  // entry alone as `clientOrigin` for the one place a single canonical origin
  // is needed (the /login-failed redirect target).
  CLIENT_ORIGIN: z
    .string()
    .optional()
    .transform((value, ctx) => {
      if (value === undefined) {
        return undefined;
      }

      const origins = value
        .split(",")
        .map((origin) => origin.trim())
        .filter((origin) => origin.length > 0);

      if (origins.length === 0) {
        return undefined;
      }

      // Validated per-entry (rather than via z.url() on the whole field, as
      // before the comma-separated list) so each origin fails loudly at
      // startup on a malformed value (trailing slash, missing scheme, stray
      // whitespace) - matching this field's previous behavior, just applied
      // once per origin instead of once for the whole value.
      const invalid = origins.find(
        (origin) => !z.url().safeParse(origin).success,
      );

      if (invalid) {
        ctx.addIssue({
          code: "custom",
          message: `Invalid CLIENT_ORIGIN entry: "${invalid}"`,
        });
        return z.NEVER;
      }

      return origins;
    }),

  // Accepts a comma-separated list, mirroring ENCRYPTION_KEY below, so the
  // session secret can be rotated too: express-session's `secret` option
  // natively accepts an array, signing new session cookies with the first
  // entry while still accepting cookies signed by any later entry. A single
  // value (the common case) parses to a one-element array.
  SESSION_SECRET: secretFromEnv("session_secret")
    .pipe(z.string().min(1))
    .transform((value, ctx) => {
      const secrets = value
        .split(",")
        .map((secret) => secret.trim())
        .filter((secret) => secret.length > 0);

      if (secrets.length === 0) {
        ctx.addIssue({
          code: "custom",
          message: "SESSION_SECRET must not be empty",
        });
        return z.NEVER;
      }

      // 32 (not 16) to match the openssl rand -hex 32 guidance in
      // deploy/.env.example - a 16-character floor validates length, not
      // entropy, and would happily accept a low-entropy value like 16
      // repeated characters.
      const tooShort = secrets.find((secret) => secret.length < 32);

      if (tooShort) {
        ctx.addIssue({
          code: "custom",
          message: "Each SESSION_SECRET must be at least 32 characters",
        });
        return z.NEVER;
      }

      return secrets;
    }),

  // Used to encrypt OAuth access/refresh tokens at rest in Firestore. Accepts
  // a comma-separated list to support key rotation: the first key is used
  // for new encryptions, while every listed key is tried in order when
  // decrypting, so an old key can stay listed (after the new one) until all
  // ciphertext written under it has naturally been rewritten, then be
  // dropped.
  ENCRYPTION_KEY: secretFromEnv("encryption_key")
    .pipe(z.string().min(1))
    .transform((value, ctx) => {
      const keys = value
        .split(",")
        .map((key) => key.trim())
        .filter((key) => key.length > 0);

      if (keys.length === 0) {
        ctx.addIssue({
          code: "custom",
          message: "ENCRYPTION_KEY must not be empty",
        });
        return z.NEVER;
      }

      // 32 (not 16) to match the openssl rand -hex 32 guidance in
      // deploy/.env.example - see SESSION_SECRET's identical comment above.
      const tooShort = keys.find((key) => key.length < 32);

      if (tooShort) {
        ctx.addIssue({
          code: "custom",
          message: "Each ENCRYPTION_KEY must be at least 32 characters",
        });
        return z.NEVER;
      }

      return keys;
    }),

  DISCORD_CLIENT_ID: z.string().min(1),

  DISCORD_CLIENT_SECRET: secretFromEnv("discord_client_secret"),

  DISCORD_TOKEN: secretFromEnv("discord_token"),

  DISCORD_GUILD_ID: z.string().optional(),

  // Optional: Google sign-in is disabled (routes not mounted) when either is
  // unset, so existing deployments aren't broken by requiring new credentials.
  GOOGLE_CLIENT_ID: z.string().min(1).optional(),

  GOOGLE_CLIENT_SECRET: optionalSecretFromEnv("google_client_secret"),

  TWITCH_CLIENT_ID: z.string().min(1),

  TWITCH_CLIENT_SECRET: secretFromEnv("twitch_client_secret"),

  TWITCH_WEBHOOK_SECRET: secretFromEnv("twitch_webhook_secret"),

  // Twitch sign-in reuses the same app/credentials as EventSub above (one
  // Twitch app registration can serve both a client-credentials grant for
  // server-to-server calls and an authorization-code grant for user login -
  // it just needs the login callback URL added to that app's redirect list).
  // Since TWITCH_CLIENT_ID/SECRET are always set, this needs its own
  // off-by-default flag so upgrading existing deployments doesn't silently
  // enable Twitch login before its redirect URL has been registered.
  TWITCH_LOGIN_ENABLED: booleanFromEnv,

  UNSUBSCRIBE_EVENTSUB_ON_SHUTDOWN: booleanFromEnv,

  EVENTSUB_GC_INTERVAL_MS: numberFromEnv(6 * 60 * 60 * 1000),

  // Purges expired Firestore session documents - see
  // FirestoreSessionRepository#purgeExpiredSessions. Far less time-sensitive
  // than EventSub GC (a session sitting around a bit past its expiry is just
  // storage cost, not a functional problem), so a longer default interval.
  SESSION_GC_INTERVAL_MS: numberFromEnv(24 * 60 * 60 * 1000),

  GOOGLE_APPLICATION_CREDENTIALS: z.string().min(1).optional(),

  FIREBASE_PROJECT_ID: z.string().optional(),

  FIREBASE_CLIENT_EMAIL: z.string().optional(),

  FIREBASE_PRIVATE_KEY: z.string().optional(),

  WEB_PUSH_PUBLIC_KEY: z.string().min(1),

  WEB_PUSH_PRIVATE_KEY: z.string().min(1),

  WEB_PUSH_SUBJECT: z.string().min(1),

  PROMETHEUS_ENABLED: booleanFromEnv,

  // Optional: when set, /metrics requires `Authorization: Bearer <token>`.
  // Left unset in deployments that instead rely on network isolation (e.g.
  // Prometheus reaching the backend only over a private Docker network).
  // 32 (not 16) to match the openssl rand -hex 32 guidance in
  // deploy/.env.example - see SESSION_SECRET's identical comment above.
  METRICS_TOKEN: optionalSecretFromEnv("metrics_token").refine(
    (value) => value === undefined || value.length >= 32,
    "METRICS_TOKEN must be at least 32 characters",
  ),

  REQUEST_LOGGING_ENABLED: booleanFromEnv,

  NGROK_AUTH_TOKEN: z.string().optional(),

  SSH_TUNNEL_URL: z.string().optional(),

  TUNNEL_PROVIDER: z.enum(["ngrok", "ssh"]).optional(),

  LOG_LEVEL: z
    .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
    .default("info"),
});

export const EnvSchema = BaseEnvSchema.superRefine((env, ctx) => {
  const usingServiceAccountFile = Boolean(env.GOOGLE_APPLICATION_CREDENTIALS);

  if (!usingServiceAccountFile) {
    if (!env.FIREBASE_PROJECT_ID) {
      ctx.addIssue({
        code: "custom",
        message: "FIREBASE_PROJECT_ID is required",
      });
    }

    if (!env.FIREBASE_CLIENT_EMAIL) {
      ctx.addIssue({
        code: "custom",
        message: "FIREBASE_CLIENT_EMAIL is required",
      });
    }

    if (!env.FIREBASE_PRIVATE_KEY) {
      ctx.addIssue({
        code: "custom",
        message: "FIREBASE_PRIVATE_KEY is required",
      });
    }
  }

  if (Boolean(env.GOOGLE_CLIENT_ID) !== Boolean(env.GOOGLE_CLIENT_SECRET)) {
    ctx.addIssue({
      code: "custom",
      message:
        "GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must both be set, or both left unset",
    });
  }

  if (env.PROMETHEUS_ENABLED && !env.METRICS_TOKEN) {
    ctx.addIssue({
      code: "custom",
      message: "METRICS_TOKEN is required when PROMETHEUS_ENABLED is true",
    });
  }
});
