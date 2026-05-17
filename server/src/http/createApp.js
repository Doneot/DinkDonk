const cors = require("cors");
const express = require("express");
const path = require("path");
const session = require("express-session");
const passport = require("passport");
const { env } = require("../config/env");
const { FirestoreSessionStore } = require("../stores/FirestoreSessionStore");
const { configurePassport } = require("./passport");
const {
  createFreshTokenMiddleware,
  requireAuthenticated,
} = require("./middleware/auth");
const { createAuthRouter } = require("./routes/authRoutes");
const { createApiRouter } = require("./routes/apiRoutes");
const { createEventSubRouter } = require("./routes/eventSubRoutes");

function createApp({
  firestore,
  repository,
  twitch,
  discord,
  notificationService,
}) {
  const app = express();
  const configuredPassport = configurePassport(repository);
  const ensureFreshToken = createFreshTokenMiddleware(repository);

  app.set("trust proxy", 1);
  app.use(cors({ origin: env.clientOrigin, credentials: true }));
  app.use(
    session({
      store: new FirestoreSessionStore(firestore),
      secret: env.sessionSecret,
      resave: false,
      saveUninitialized: false,
      proxy: true,
      cookie: { secure: env.isProduction, httpOnly: true, sameSite: "lax" },
    }),
  );
  app.use(configuredPassport.initialize());
  app.use(configuredPassport.session());

  app.get("/api/health", (_req, res) => res.status(200).json({ status: "ok" }));

  app.use(
    "/api/auth",
    createAuthRouter({ repository, discord, ensureFreshToken }),
  );
  app.use(
    "/api",
    requireAuthenticated,
    createApiRouter({ repository, twitch, discord, ensureFreshToken, webPushPublicKey: env.webPush.publicKey }),
  );
  app.use(
    createEventSubRouter({
      secret: env.twitch.webhookSecret,
      onNotification: (type, event) => {
        if (type === "stream.online")
          return notificationService.handleStreamOnline(event);
        return Promise.resolve();
      },
    }),
  );

  app.get("/login-failed", (_req, res) => {
    res.redirect(env.clientOrigin);
  });

  return app;
}

module.exports = { createApp };
