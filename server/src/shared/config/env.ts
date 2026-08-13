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
import { assertDefined } from "../utils/assert.js";

const parsedEnv = EnvSchema.parse(process.env);

// Every allowed client origin, falling back to a single-element list of
// SERVER_URL when CLIENT_ORIGIN is unset - same fallback env.clientOrigin
// used before this became a list. Non-empty by construction: envSchema
// either yields undefined (nothing configured) or a list with at least one
// validated entry, never an empty array.
const clientOrigins = parsedEnv.CLIENT_ORIGIN ?? [parsedEnv.SERVER_URL];

export const env = {
  nodeEnv: parsedEnv.NODE_ENV,

  isProduction: parsedEnv.NODE_ENV === "production",

  logLevel: parsedEnv.LOG_LEVEL,

  port: parsedEnv.PORT ?? parsedEnv.BACKEND_PORT ?? 3000,

  serverUrl: parsedEnv.SERVER_URL,

  redisUrl: parsedEnv.REDIS_URL,

  // Every origin CORS (configureMiddleware.ts/socketServer.ts) should accept
  // credentialed cross-origin requests from.
  clientOrigins,

  // The single canonical origin to use where only one makes sense - e.g.
  // configureRoutes.ts's /login-failed redirect, which needs one concrete
  // Location to send the browser to, not a list. Always clientOrigins' first
  // entry, matching CLIENT_ORIGIN's documented "first origin is primary"
  // convention (see envSchema.ts).
  clientOrigin: assertDefined(clientOrigins[0], "CLIENT_ORIGIN"),

  sessionSecret: parsedEnv.SESSION_SECRET,

  encryptionKey: parsedEnv.ENCRYPTION_KEY,

  unsubscribeEventSubOnShutdown: parsedEnv.UNSUBSCRIBE_EVENTSUB_ON_SHUTDOWN,

  eventSubGarbageCollectionIntervalMs: parsedEnv.EVENTSUB_GC_INTERVAL_MS,

  sessionGarbageCollectionIntervalMs: parsedEnv.SESSION_GC_INTERVAL_MS,

  twitch: {
    clientId: parsedEnv.TWITCH_CLIENT_ID,
    clientSecret: parsedEnv.TWITCH_CLIENT_SECRET,
    webhookSecret: parsedEnv.TWITCH_WEBHOOK_SECRET,
    loginEnabled: parsedEnv.TWITCH_LOGIN_ENABLED,
  },
  discord: {
    token: parsedEnv.DISCORD_TOKEN,
    clientId: parsedEnv.DISCORD_CLIENT_ID,
    clientSecret: parsedEnv.DISCORD_CLIENT_SECRET,
    guildId: parsedEnv.DISCORD_GUILD_ID,
  },
  google: {
    clientId: parsedEnv.GOOGLE_CLIENT_ID,
    clientSecret: parsedEnv.GOOGLE_CLIENT_SECRET,
  },
  firebase: {
    serviceAccountPath: parsedEnv.GOOGLE_APPLICATION_CREDENTIALS,
    projectId: parsedEnv.FIREBASE_PROJECT_ID,
    privateKey: parsedEnv.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
    clientEmail: parsedEnv.FIREBASE_CLIENT_EMAIL,
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
