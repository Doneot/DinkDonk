const crypto = require("crypto");
const express = require("express");
const session = require("express-session");
const passport = require("passport");
const cors = require("cors");
const path = require("path");
const EventEmitter = require("events");
const {
  SERVER_URL,
  SESSION_SECRET,
  TWITCH_WEBHOOK_SECRET,
  BACKEND_PORT,
} = require("./config");
require("./passport-setup");

class ExpressServer extends EventEmitter {
  constructor(discordClient) {
    super();
    this.app = express();
    this.discord = discordClient;
    this.port = BACKEND_PORT;
    this.secret = TWITCH_WEBHOOK_SECRET;

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

  initializeMiddlewares() {
    this.app.use(
      cors({
        origin: SERVER_URL,
        credentials: true,
      })
    );
    this.app.use(express.static(path.join(__dirname, "../client/dist")));
    this.app.use(
      session({
        secret: SESSION_SECRET,
        resave: false,
        saveUninitialized: false,
        cookie: {
          secure: false, // should be true if using https in production
          sameSite: "lax", // or 'none' if cross-origin, but needs secure: true
        },
      })
    );
    this.app.use(passport.initialize());
    this.app.use(passport.session());

    this.app.use((req, res, next) => {
      //console.log("SESSION:", req.session);
      next();
    });
  }

  initializeRoutes() {
    this.app.get("/api/auth/discord", passport.authenticate("discord"));
    this.app.get(
      "/api/auth/discord/callback",
      passport.authenticate("discord", { failureRedirect: "/login-failed" }),
      this.handleDiscordCallback
    );

    // Public routes (no auth)
    this.app.get("/api/auth/user", this.getUser.bind(this));
    this.app.get("/api/auth/logout", this.logout.bind(this));
    this.app.get("/api/status", this.getStatus.bind(this));
    this.app.get("/api/user-count", this.getUserCount.bind(this));
    this.app.get("/api/streamers/search", this.searchStreamers.bind(this));
    this.app.get("/api/streamers/info", this.getStreamerInfo.bind(this));

    // Protected routes (require auth)
    this.app.get(
      "/api/streamers/subscribed-streamers",
      this.ensureAuthenticated.bind(this),
      this.getStreamers.bind(this)
    );
    this.app.post(
      "/api/streamers/subscribe",
      this.ensureAuthenticated.bind(this),
      express.json(),
      this.subscribeToStreamer.bind(this)
    );
    this.app.post(
      "/api/streamers/unsubscribe",
      this.ensureAuthenticated.bind(this),
      express.json(),
      this.unsubscribeToStreamer.bind(this)
    );
    this.app.get(
      "/api/streamers/get-message",
      this.ensureAuthenticated.bind(this),
      this.getNotificationMessage.bind(this)
    );
    this.app.post(
      "/api/streamers/set-message",
      this.ensureAuthenticated.bind(this),
      express.json(),
      this.setNotificationMessage.bind(this)
    );

    this.app.post(
      "/eventsub",
      express.raw({ type: "application/json" }),
      this.handleRequest.bind(this)
    );
    this.app.get("*", this.getIndexPage.bind(this));
  }

  handleDiscordCallback(req, res) {
    res.redirect(SERVER_URL.includes("ngrok") ? "http://localhost:5000/dashboard":`${SERVER_URL}/dashboard`);
  }

  getUser(req, res) {
    //console.log("GET /auth/user called. req.user:", req.user);
    if (!req.user) return res.status(401).json({ error: "Not authenticated" });
    res.json(req.user);
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

  async getUserCount(req, res) {
    const count = (await this.discord.firestore.getUsers()).length;
    res.json({ count });
  }

  async searchStreamers({ query: { query } }, res) {
    const streamers = await this.discord.twitch.searchStreamers(query);
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
      const message = await this.discord.firestore.getMessage(
        user_id,
        streamer_id
      );
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
      await this.discord.firestore.setMessage(user_id, streamer_id, message);
      res.sendStatus(200);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Failed to set notification message" });
    }
  }

  async getStreamerInfo({ query: { id } }, res) {
    const [{ display_name, profile_image_url }] =
      await this.discord.twitch.fetchStreamer(id);
    res.json({ display_name, avatar: profile_image_url });
  }

  async getStreamers(req, res) {
    const userId = req.user.id;
    const user = await this.discord.firestore.getUser(userId);
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
      await this.discord.firestore.subscribe(userId, streamer_id, "");
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
      await this.discord.firestore.unsubscribe(userId, streamer_id);
      res.sendStatus(200);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Unsubscribe failed" });
    }
  }

  getIndexPage(req, res) {
    res.sendFile(path.join(__dirname, "../client/dist", "index.html"));
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
