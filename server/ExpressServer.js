// server/ExpressServer.js
const axios = require("axios");
const querystring = require("querystring");
const crypto = require("crypto");
const express = require("express");
const session = require("express-session");
const passport = require("passport");
const DiscordStrategy = require("passport-discord").Strategy;
const refresh = require("passport-oauth2-refresh");
const cors = require("cors");
const path = require("path");
const EventEmitter = require("events");
const {
  SERVER_URL,
  SESSION_SECRET,
  TWITCH_WEBHOOK_SECRET,
  BACKEND_PORT,
  DISCORD_CLIENT_ID,
  DISCORD_CLIENT_SECRET,
  NODE_ENV,
} = require("./config");
const FirestoreSessionStore = require("./FireSessionStore");

class ExpressServer extends EventEmitter {
  constructor({ twitch, firestore, discord }) {
    super();
    this.app = express();
    this.discord = discord;
    this.twitch = twitch;
    this.firestore = firestore;
    this.port = BACKEND_PORT;
    this.secret = TWITCH_WEBHOOK_SECRET;
    this.tokenRefreshLocks = {}; // key: userId, value: Promise

    this.initializePassport();
    this.initializeMiddlewares();
    this.initializeRoutes();
  }

  // Middleware to check if user is authenticated
  ensureAuthenticated(req, res, next) {
    if (req.user) {
      return next();
    }
    // Redirect to home if not authenticated
    res.redirect("/");
  }

  async ensureFreshToken(req, res, next) {
    const userId = req.user?.id;
    if (!userId) return res.redirect("/");

    try {
      const user = await this.firestore.getUser(userId);
      if (!user) return res.redirect("/api/auth/discord");

      let { accessToken, refreshToken, fetchTime } = user;

      if (!accessToken || !refreshToken) {
        return res.redirect("/api/auth/discord");
      }

      const tokenAge = Date.now() - (fetchTime || 0);
      const MAX_TOKEN_AGE = 6 * 24 * 60 * 60 * 1000; // 6 days
      if (tokenAge > MAX_TOKEN_AGE) {
        if (!this.tokenRefreshLocks[userId]) {
          this.tokenRefreshLocks[userId] = (async () => {
            try {
              const newTokens = await new Promise((resolve, reject) => {
                refresh.requestNewAccessToken(
                  "discord",
                  refreshToken,
                  (err, newAccessToken, newRefreshToken) => {
                    if (err) return reject(err);
                    resolve({
                      accessToken: newAccessToken,
                      refreshToken: newRefreshToken || refreshToken,
                    });
                  }
                );
              });

              await this.firestore.addOrUpdateUser(userId, {
                ...newTokens,
                fetchTime: Date.now(),
              });

              console.log(`🔄 Refreshed tokens for ${userId}`);
              return newTokens;
            } catch (err) {
              console.error("Error refreshing token:", err);
              throw err;
            } finally {
              delete this.tokenRefreshLocks[userId]; // Cleanup lock
            }
          })();
        }

        try {
          await this.tokenRefreshLocks[userId]; // Wait for refresh to finish
        } catch (err) {
          return res.redirect("/api/auth/discord");
        }
      }

      next();
    } catch (err) {
      console.error("Token check/refresh failed:", err);

      req.logout(() => {
        req.session.destroy(() => {
          res.clearCookie("connect.sid");
          return res.redirect(
            NODE_ENV === "production" ? SERVER_URL : "http://localhost:5000"
          );
        });
      });
    }
  }

  initializePassport() {
    passport.serializeUser((user, done) => {
      done(null, user);
    });

    passport.deserializeUser(async ({ id }, done) => {
      try {
        const user = await this.firestore.getUser(id);
        if (!user) return done(null, null);

        // Optionally check if token is still valid, or refresh it
        done(null, {
          ...user,
          id,
        });
      } catch (err) {
        console.error("Error in deserializeUser:", err);
        done(err, null);
      }
    });
    const ctx = this; // Capture context for use in strategy callback
    this.strategy = new DiscordStrategy(
      {
        clientID: DISCORD_CLIENT_ID,
        clientSecret: DISCORD_CLIENT_SECRET,
        callbackURL:
          NODE_ENV === "production"
            ? `${SERVER_URL}/api/auth/discord/callback`
            : `http://localhost:3000/api/auth/discord/callback`,
        scope: ["identify"],
      },
      async (accessToken, refreshToken, profile, done) => {
        const fetchTime = Date.now();
        const userData = {
          id: profile.id,
          username: profile.username,
          discriminator: profile.discriminator,
          avatar: profile.avatar,
          accessToken,
          refreshToken,
          fetchTime,
        };

        try {
          await ctx.firestore.addOrUpdateUser(profile.id, userData);
          return done(null, userData);
        } catch (error) {
          console.error("Error in DiscordStrategy:", error);
          return done(error);
        }
      }
    );
    passport.use(this.strategy);
    DiscordStrategy.prototype.authorizationParams = function (options) {
      return { prompt: "none" };
    };
    refresh.use(this.strategy);
  }

  initializeMiddlewares() {
    this.app.use(
      cors({
        origin: SERVER_URL,
        credentials: true,
      })
    );
    this.app.use(express.static(path.join(__dirname, "../client/dist")));
    const firestoreSessionStore = new FirestoreSessionStore(this.firestore.db);
    this.app.set("trust proxy", 1);
    this.app.use(
      session({
        store: firestoreSessionStore,
        secret: SESSION_SECRET,
        resave: false,
        saveUninitialized: false,
        proxy: true,
        cookie: {
          secure: NODE_ENV === "production", // should be true if using https in production
          sameSite: "lax", // or 'none' if cross-origin, but needs secure: true
        },
      })
    );
    this.app.use(passport.initialize());
    this.app.use(passport.session());
  }

  initializeRoutes() {
    this.app.get("/api/auth/discord", passport.authenticate("discord"));
    this.app.get(
      "/api/auth/discord/callback",
      passport.authenticate("discord", { failureRedirect: "/login-failed" }),
      this.handleDiscordCallback.bind(this)
    );

    // Public routes (no auth)
    this.app.get("/api/auth/user", this.getUser.bind(this));
    this.app.get("/login-failed", this.handleFailedLogin.bind(this));

    // Protected routes (require auth)
    this.app.get(
      "/api/auth/logout",
      this.ensureAuthenticated.bind(this),
      this.ensureFreshToken.bind(this),
      this.logout.bind(this)
    );
    this.app.get(
      "/api/status",
      this.ensureAuthenticated.bind(this),
      this.ensureFreshToken.bind(this),
      this.getStatus.bind(this)
    );
    this.app.get(
      "/api/user-count",
      this.ensureAuthenticated.bind(this),
      this.ensureFreshToken.bind(this),
      this.getUserCount.bind(this)
    );
    this.app.get(
      "/api/streamers/search",
      this.ensureAuthenticated.bind(this),
      this.ensureFreshToken.bind(this),
      this.searchStreamers.bind(this)
    );
    this.app.get(
      "/api/streamers/info",
      this.ensureAuthenticated.bind(this),
      this.ensureFreshToken.bind(this),
      this.getStreamerInfo.bind(this)
    );
    this.app.get(
      "/api/streamers/subscribed-streamers",
      this.ensureAuthenticated.bind(this),
      this.ensureFreshToken.bind(this),
      this.getStreamers.bind(this)
    );
    this.app.post(
      "/api/streamers/subscribe",
      this.ensureAuthenticated.bind(this),
      this.ensureFreshToken.bind(this),
      express.json(),
      this.subscribeToStreamer.bind(this)
    );
    this.app.post(
      "/api/streamers/unsubscribe",
      this.ensureAuthenticated.bind(this),
      this.ensureFreshToken.bind(this),
      express.json(),
      this.unsubscribeToStreamer.bind(this)
    );
    this.app.get(
      "/api/streamers/get-message",
      this.ensureAuthenticated.bind(this),
      this.ensureFreshToken.bind(this),
      this.getNotificationMessage.bind(this)
    );
    this.app.post(
      "/api/streamers/set-message",
      this.ensureAuthenticated.bind(this),
      this.ensureFreshToken.bind(this),
      express.json(),
      this.setNotificationMessage.bind(this)
    );
    this.app.get(
      "/api/can-receive-dm",
      this.ensureAuthenticated.bind(this),
      this.ensureFreshToken.bind(this),
      this.canUserReceiveDM.bind(this)
    );

    // Eventsub route
    this.app.post(
      "/eventsub",
      express.raw({ type: "application/json" }),
      this.handleRequest.bind(this)
    );
  }

  async handleDiscordCallback(req, res) {
    let user = await this.firestore.getUser(req.user.id);
    if (!user) {
      const canReceiveDM = await this.discord.canSendDM(req.user.id);
      await this.firestore.addOrUpdateUser(req.user.id, { canReceiveDM });
      req.session.canReceiveDM = canReceiveDM;
    } else {
      req.session.canReceiveDM = user.canReceiveDM;
    }

    res.redirect(
      NODE_ENV === "production"
        ? `${SERVER_URL}/dashboard`
        : "http://localhost:5000/dashboard"
    );
  }

  handleFailedLogin(req, res) {
    console.log("Login failed, redirecting to home");
    res.redirect(
      NODE_ENV === "production" ? `${SERVER_URL}` : "http://localhost:5000"
    ); // Redirect to home or login page
  }

  async getUser(req, res) {
    //console.log("GET /auth/user called. req.user:", req.user);
    if (!req.user) return res.status(401).json({ error: "Not authenticated" });
    res.json({
      ...req.user,
      canReceiveDM: req.session.canReceiveDM || false,
    });
  }

  logout(req, res) {
    req.logout((err) => {
      if (err) {
        console.error("Logout error:", err);
        return res.status(500).send("Logout failed");
      }
      req.session.destroy(() => {
        res.clearCookie("connect.sid"); // or whatever your session cookie name is
        res.redirect("/"); // Or send JSON if you want SPA control
      });
    });
  }

  getStatus(req, res) {
    res.json({ online: this.discord.bot.isReady() });
  }

  async canUserReceiveDM(req, res) {
    const canReceiveDM = await this.discord.canSendDM(req.user.id);
    await this.firestore.addOrUpdateUser(req.user.id, { canReceiveDM });
    req.session.canReceiveDM = canReceiveDM; // Update session
    res.json({ canReceiveDM });
  }

  async getUserCount(req, res) {
    const count = (await this.firestore.getUsers()).filter(
      (user) => user.canReceiveDM
    ).length;
    res.json({ count });
  }

  async searchStreamers({ query: { query } }, res) {
    const streamers = await this.twitch.searchStreamers(query);
    if (streamers) {
      res.json(
        streamers.map(({ display_name: name, thumbnail_url: avatar, id }) => ({
          avatar: avatar,
          name: name,
          streamer_id: id,
        }))
      );
    } else {
      res.json([]);
    }
  }

  async getNotificationMessage(req, res) {
    const user_id = req.user.id;
    const streamer_id = req.query.id;

    try {
      const message = await this.firestore.getMessage(user_id, streamer_id);
      res.json({ notification_message: message });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Failed to get notification message" });
    }
  }

  async setNotificationMessage(req, res) {
    const user_id = req.user.id;
    const { streamer_id, message } = req.body;

    try {
      await this.firestore.setMessage(user_id, streamer_id, message);
      res.sendStatus(200);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Failed to set notification message" });
    }
  }

  async getStreamerInfo({ query: { id } }, res) {
    const [{ display_name, profile_image_url }] =
      await this.twitch.fetchStreamers(id);
    res.json({ display_name, avatar: profile_image_url });
  }

  async getStreamers(req, res) {
    const userId = req.user.id;
    const user = await this.firestore.getUser(userId);
    if (user) {
      res.json(user["streamers"]);
    } else {
      res.status(404).json({ error: "User not found" });
    }
  }

  async subscribeToStreamer(req, res) {
    const userId = req.user.id;
    const { streamer_id } = req.body;
    try {
      await this.firestore.subscribe(userId, streamer_id, "");
      res.sendStatus(200);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Subscribe failed" });
    }
  }

  async unsubscribeToStreamer(req, res) {
    const userId = req.user.id;
    const { streamer_id } = req.body;
    try {
      await this.firestore.unsubscribe(userId, streamer_id);
      res.sendStatus(200);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Unsubscribe failed" });
    }
  }

  start() {
    this.app.listen(this.port, () => {
      console.log(`Express server running at ${SERVER_URL}`);
      this.emit("ready");
    });
  }

  handleRequest(req, res) {
    const message =
      req.headers["twitch-eventsub-message-id"] +
      req.headers["twitch-eventsub-message-timestamp"] +
      req.body;
    const hmac =
      "sha256=" +
      crypto.createHmac("sha256", this.secret).update(message).digest("hex"); // Signature to compare

    if (
      crypto.timingSafeEqual(
        Buffer.from(hmac),
        Buffer.from(req.headers["twitch-eventsub-message-signature"])
      )
    ) {
      console.log("Signatures match");

      // Get JSON object from body, so you can process the message.

      let notification = JSON.parse(req.body);

      switch (req.headers["twitch-eventsub-message-type"]) {
        case "notification":
          // Process the notification event
          console.log(`Event type: ${notification.subscription.type}`);
          console.log(JSON.stringify(notification.event, null, 4));

          // Emit event for external handling
          this.emit(notification.subscription.type, notification.event);

          res.sendStatus(204);
          break;

        case "webhook_callback_verification":
          res
            .set("Content-Type", "text/plain")
            .status(200)
            .send(notification.challenge);
          break;

        case "revocation":
          res.sendStatus(204);

          console.log(
            `${notification.subscription.type} notifications revoked!`
          );
          console.log(`Reason: ${notification.subscription.status}`);
          console.log(
            `Condition: ${JSON.stringify(
              notification.subscription.condition,
              null,
              4
            )}`
          );
          break;

        default:
          res.sendStatus(204);
          console.log(
            `Unknown message type: ${req.headers["twitch-eventsub-message-type"]}`
          );
          break;
      }
    } else {
      console.log("403 - Signatures didn't match.");
      res.sendStatus(403);
    }
  }
}

module.exports = { ExpressServer };
