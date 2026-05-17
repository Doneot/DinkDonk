const fs = require("node:fs");
const path = require("node:path");
require("dotenv").config({ path: path.resolve(process.cwd(), ".env") });
const { envOrSecret } = require("../utils/secrets");

function parseBoolean(value, defaultValue = false) {
  if (value === undefined) return defaultValue;
  return ["1", "true", "yes", "on"].includes(String(value).toLowerCase());
}

const hasFirebaseServiceAccountFile = Boolean(
  process.env.GOOGLE_APPLICATION_CREDENTIALS,
);
const required = [
  "DISCORD_CLIENT_ID",
  "DISCORD_CLIENT_SECRET",
  "DISCORD_TOKEN",
  "SERVER_URL",
  "SESSION_SECRET",
  "TWITCH_CLIENT_ID",
  "TWITCH_CLIENT_SECRET",
  "TWITCH_WEBHOOK_SECRET",
];

if (!hasFirebaseServiceAccountFile) {
  required.push(
    "FIREBASE_PROJECT_ID",
    "FIREBASE_CLIENT_EMAIL",
    "FIREBASE_PRIVATE_KEY",
  );
}

const env = {
  nodeEnv: process.env.NODE_ENV || "development",
  isProduction: process.env.NODE_ENV === "production",
  port: Number(process.env.PORT || process.env.BACKEND_PORT || 3000),
  serverUrl: process.env.SERVER_URL || "http://localhost:5000",
  clientOrigin:
    process.env.CLIENT_ORIGIN ||
    process.env.SERVER_URL ||
    "http://localhost:5000",
  sessionSecret: envOrSecret("SESSION_SECRET", "session_secret"),
  unsubscribeEventSubOnShutdown: parseBoolean(
    process.env.UNSUBSCRIBE_EVENTSUB_ON_SHUTDOWN,
    false,
  ),
  eventSubGarbageCollectionIntervalMs: Number(
    process.env.EVENTSUB_GC_INTERVAL_MS || 6 * 60 * 60 * 1000,
  ),
  twitch: {
    clientId: process.env.TWITCH_CLIENT_ID,
    clientSecret: envOrSecret("TWITCH_CLIENT_SECRET", "twitch_client_secret"),
    webhookSecret: envOrSecret(
      "TWITCH_WEBHOOK_SECRET",
      "twitch_webhook_secret",
    ),
  },
  discord: {
    token: envOrSecret("DISCORD_TOKEN", "discord_token"),
    clientId: process.env.DISCORD_CLIENT_ID,
    clientSecret: envOrSecret("DISCORD_CLIENT_SECRET", "discord_client_secret"),
    guildId: process.env.DISCORD_GUILD_ID,
  },
  firebase: {
    serviceAccountPath: process.env.GOOGLE_APPLICATION_CREDENTIALS,
    projectId: process.env.FIREBASE_PROJECT_ID,
    privateKeyId: process.env.FIREBASE_PRIVATE_KEY_ID,
    privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    clientId: process.env.FIREBASE_CLIENT_ID,
    clientX509CertUrl: process.env.FIREBASE_CLIENT_X509_CERT_URL,
  },
  adminPassword: envOrSecret("ADMIN_PASSWORD", "admin_password"),
};

function hasRequiredValue(key) {
  return Boolean(envOrSecret(key));
}

function assertRequiredEnv() {
  const missing = required.filter((key) => !hasRequiredValue(key));

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(", ")}`,
    );
  }
}

module.exports = { env, assertRequiredEnv };
