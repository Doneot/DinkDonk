import { z } from "zod";
import { booleanFromEnv, numberFromEnv, secretFromEnv } from "./envParsers.js";

const BaseEnvSchema = z.object({
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),

  PORT: numberFromEnv(3000),

  BACKEND_PORT: z.string().optional(),

  SERVER_URL: z.url().min(1),

  CLIENT_ORIGIN: z.string().optional(),

  SESSION_SECRET: secretFromEnv("session_secret"),

  DISCORD_CLIENT_ID: z.string().min(1),

  DISCORD_CLIENT_SECRET: secretFromEnv("discord_client_secret"),

  DISCORD_TOKEN: secretFromEnv("discord_token"),

  DISCORD_GUILD_ID: z.string().optional(),

  TWITCH_CLIENT_ID: z.string().min(1),

  TWITCH_CLIENT_SECRET: secretFromEnv("twitch_client_secret"),

  TWITCH_WEBHOOK_SECRET: secretFromEnv("twitch_webhook_secret"),

  UNSUBSCRIBE_EVENTSUB_ON_SHUTDOWN: booleanFromEnv,

  EVENTSUB_GC_INTERVAL_MS: numberFromEnv(6 * 60 * 60 * 1000),

  GOOGLE_APPLICATION_CREDENTIALS: z.url().optional(),

  FIREBASE_PROJECT_ID: z.string().optional(),

  FIREBASE_CLIENT_EMAIL: z.string().optional(),

  FIREBASE_PRIVATE_KEY_ID: z.string().optional(),

  FIREBASE_PRIVATE_KEY: z.string().optional(),

  FIREBASE_CLIENT_ID: z.string().optional(),

  ADMIN_PASSWORD: secretFromEnv("admin_password"),

  WEB_PUSH_PUBLIC_KEY: z.string().min(1),

  WEB_PUSH_PRIVATE_KEY: z.string().min(1),

  WEB_PUSH_SUBJECT: z.string().min(1),

  PROMETHEUS_ENABLED: booleanFromEnv,

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
});
