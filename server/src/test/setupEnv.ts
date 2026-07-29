process.env.NODE_ENV = "test";
process.env.SERVER_URL = "http://localhost:3000";
process.env.CLIENT_ORIGIN = "http://localhost:5000";
process.env.SESSION_SECRET = "test-session-secret";
process.env.ENCRYPTION_KEY = "test-encryption-key-32-bytes-long!!";
process.env.DISCORD_CLIENT_ID = "discord-client-id";
process.env.DISCORD_CLIENT_SECRET = "discord-client-secret";
process.env.DISCORD_TOKEN = "discord-token";
process.env.GOOGLE_CLIENT_ID = "google-client-id";
process.env.GOOGLE_CLIENT_SECRET = "google-client-secret";
process.env.TWITCH_CLIENT_ID = "twitch-client-id";
process.env.TWITCH_CLIENT_SECRET = "twitch-client-secret";
process.env.TWITCH_WEBHOOK_SECRET = "twitch-webhook-secret";
process.env.TWITCH_LOGIN_ENABLED = "true";
process.env.FIREBASE_PROJECT_ID = "firebase-project-id";
process.env.FIREBASE_CLIENT_EMAIL = "firebase@example.com";
process.env.FIREBASE_PRIVATE_KEY_ID = "firebase-private-key-id";
process.env.FIREBASE_PRIVATE_KEY =
  "-----BEGIN PRIVATE KEY-----\\ntest\\n-----END PRIVATE KEY-----\\n";
process.env.FIREBASE_CLIENT_ID = "firebase-client-id";
process.env.WEB_PUSH_PUBLIC_KEY = "web-push-public-key";
process.env.WEB_PUSH_PRIVATE_KEY = "web-push-private-key";
process.env.WEB_PUSH_SUBJECT = "mailto:test@example.com";
process.env.NGROK_AUTH_TOKEN = "ngrok-auth-token";
process.env.SSH_TUNNEL_URL = "http://localhost:4000";
process.env.TUNNEL_PROVIDER = "ngrok";

// Keep the suite output readable. Tests that care about logging spy on the
// logger, which intercepts calls before the level is consulted.
const { logger } = await import("../shared/logger/logger.js");

logger.level = "silent";
