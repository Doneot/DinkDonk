import path from "path";
import dotenv from "dotenv";

const envFile =
  process.env.NODE_ENV === "production" ? ".env" : ".env.development";

// Load the environment-specific file first so it wins over the shared `.env`
// fallback: dotenv never overrides a key already present in process.env, so
// load order determines precedence.
dotenv.config({ path: path.resolve(process.cwd(), envFile) });
dotenv.config({ path: path.resolve(process.cwd(), ".env") });

import { EnvSchema } from "./envSchema.js";

const parsedEnv = EnvSchema.parse(process.env);

export const env = {
  nodeEnv: parsedEnv.NODE_ENV,

  isProduction: parsedEnv.NODE_ENV === "production",

  port: parsedEnv.PORT || parsedEnv.BACKEND_PORT || 3000,

  serverUrl: parsedEnv.SERVER_URL,

  clientOrigin: parsedEnv.CLIENT_ORIGIN || parsedEnv.SERVER_URL,

  sessionSecret: parsedEnv.SESSION_SECRET,

  encryptionKey: parsedEnv.ENCRYPTION_KEY,

  unsubscribeEventSubOnShutdown: parsedEnv.UNSUBSCRIBE_EVENTSUB_ON_SHUTDOWN,

  eventSubGarbageCollectionIntervalMs: parsedEnv.EVENTSUB_GC_INTERVAL_MS,

  twitch: {
    clientId: parsedEnv.TWITCH_CLIENT_ID,
    clientSecret: parsedEnv.TWITCH_CLIENT_SECRET,
    webhookSecret: parsedEnv.TWITCH_WEBHOOK_SECRET,
  },
  discord: {
    token: parsedEnv.DISCORD_TOKEN,
    clientId: parsedEnv.DISCORD_CLIENT_ID,
    clientSecret: parsedEnv.DISCORD_CLIENT_SECRET,
    guildId: parsedEnv.DISCORD_GUILD_ID,
  },
  firebase: {
    serviceAccountPath: parsedEnv.GOOGLE_APPLICATION_CREDENTIALS,
    projectId: parsedEnv.FIREBASE_PROJECT_ID,
    privateKeyId: parsedEnv.FIREBASE_PRIVATE_KEY_ID,
    privateKey: parsedEnv.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
    clientEmail: parsedEnv.FIREBASE_CLIENT_EMAIL,
    clientId: parsedEnv.FIREBASE_CLIENT_ID,
  },
  webPush: {
    publicKey: parsedEnv.WEB_PUSH_PUBLIC_KEY,
    privateKey: parsedEnv.WEB_PUSH_PRIVATE_KEY,
    subject: parsedEnv.WEB_PUSH_SUBJECT,
  },
  prometheus: {
    enabled: parsedEnv.PROMETHEUS_ENABLED,
    metricsToken: parsedEnv.METRICS_TOKEN,
  },
  requestLogging: {
    enabled: parsedEnv.REQUEST_LOGGING_ENABLED,
  },
  tunneling: {
    provider: parsedEnv.TUNNEL_PROVIDER,
    ngrok: {
      authToken: parsedEnv.NGROK_AUTH_TOKEN,
    },
    ssh: {
      tunnelUrl: parsedEnv.SSH_TUNNEL_URL,
    },
  },
};
