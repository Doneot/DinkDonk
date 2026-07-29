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

  PORT: numberFromEnv(3000),

  BACKEND_PORT: z.coerce.number().int().positive().optional(),

  SERVER_URL: z.url().min(1),

  CLIENT_ORIGIN: z.string().optional(),

  SESSION_SECRET: secretFromEnv("session_secret").pipe(
    z.string().min(16, "SESSION_SECRET must be at least 16 characters"),
  ),

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

      const tooShort = keys.find((key) => key.length < 16);

      if (tooShort) {
        ctx.addIssue({
          code: "custom",
          message: "Each ENCRYPTION_KEY must be at least 16 characters",
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

  GOOGLE_APPLICATION_CREDENTIALS: z.string().min(1).optional(),

  FIREBASE_PROJECT_ID: z.string().optional(),

  FIREBASE_CLIENT_EMAIL: z.string().optional(),

  FIREBASE_PRIVATE_KEY_ID: z.string().optional(),

  FIREBASE_PRIVATE_KEY: z.string().optional(),

  FIREBASE_CLIENT_ID: z.string().optional(),

  WEB_PUSH_PUBLIC_KEY: z.string().min(1),

  WEB_PUSH_PRIVATE_KEY: z.string().min(1),

  WEB_PUSH_SUBJECT: z.string().min(1),

  PROMETHEUS_ENABLED: booleanFromEnv,

  // Optional: when set, /metrics requires `Authorization: Bearer <token>`.
  // Left unset in deployments that instead rely on network isolation (e.g.
  // Prometheus reaching the backend only over a private Docker network).
  METRICS_TOKEN: optionalSecretFromEnv("metrics_token").refine(
    (value) => value === undefined || value.length >= 16,
    "METRICS_TOKEN must be at least 16 characters",
  ),

  REQUEST_LOGGING_ENABLED: booleanFromEnv,

  NGROK_AUTH_TOKEN: z.string().optional(),

  SSH_TUNNEL_URL: z.string().optional(),

  TUNNEL_PROVIDER: z.enum(["ngrok", "ssh"]).optional(),
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

    if (!env.FIREBASE_CLIENT_ID) {
      ctx.addIssue({
        code: "custom",
        message: "FIREBASE_CLIENT_ID is required",
      });
    }

    if (!env.FIREBASE_CLIENT_EMAIL) {
      ctx.addIssue({
        code: "custom",
        message: "FIREBASE_CLIENT_EMAIL is required",
      });
    }

    if (!env.FIREBASE_PRIVATE_KEY_ID) {
      ctx.addIssue({
        code: "custom",
        message: "FIREBASE_PRIVATE_KEY_ID is required",
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

});
