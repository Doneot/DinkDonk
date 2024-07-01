const crypto = require("crypto");
const express = require("express");
const EventEmitter = require("events");
// require("dotenv").config();

class WebhookServer extends EventEmitter {
  constructor(port, secret) {
    super();
    this.app = express();
    this.port = port || process.env.PORT;
    this.secret = secret || process.env.TWITCH_WEBHOOK_SECRET;

    this.TWITCH_MESSAGE_ID = "Twitch-Eventsub-Message-Id".toLowerCase();
    this.TWITCH_MESSAGE_TIMESTAMP =
      "Twitch-Eventsub-Message-Timestamp".toLowerCase();
    this.TWITCH_MESSAGE_SIGNATURE =
      "Twitch-Eventsub-Message-Signature".toLowerCase();
    this.MESSAGE_TYPE = "Twitch-Eventsub-Message-Type".toLowerCase();

    this.MESSAGE_TYPE_VERIFICATION = "webhook_callback_verification";
    this.MESSAGE_TYPE_NOTIFICATION = "notification";
    this.MESSAGE_TYPE_REVOCATION = "revocation";

    this.HMAC_PREFIX = "sha256=";

    this.app.use(
      express.raw({
        type: "application/json", // Need raw message body for signature verification
      })
    );

    this.app.post("/eventsub", (req, res) => this.handleRequest(req, res));
  }

  start() {
    this.app.listen(this.port, () => {
      console.log(
        `Webhook server running at ${process.env.WEBHOOK_URL}:${this.port}`
      );
      this.emit("ready");
    });
  }

  handleRequest(req, res) {
    let message = this.getHmacMessage(req);
    let hmac = this.HMAC_PREFIX + this.getHmac(this.secret, message); // Signature to compare

    console.log(req.headers);
    if (this.verifyMessage(hmac, req.headers[this.TWITCH_MESSAGE_SIGNATURE])) {
      console.log("Signatures match");

      // Get JSON object from body, so you can process the message.

      let notification = JSON.parse(req.body);

      if (this.MESSAGE_TYPE_NOTIFICATION === req.headers[this.MESSAGE_TYPE]) {
        // Process the notification event
        console.log(`Event type: ${notification.subscription.type}`);
        console.log(JSON.stringify(notification.event, null, 4));

        // Emit event for external handling
        this.emit(notification.subscription.type, notification.event);

        res.sendStatus(204);
      } else if (
        this.MESSAGE_TYPE_VERIFICATION === req.headers[this.MESSAGE_TYPE]
      ) {
        res
          .set("Content-Type", "text/plain")
          .status(200)
          .send(notification.challenge);
      } else if (
        this.MESSAGE_TYPE_REVOCATION === req.headers[this.MESSAGE_TYPE]
      ) {
        res.sendStatus(204);

        console.log(`${notification.subscription.type} notifications revoked!`);
        console.log(`Reason: ${notification.subscription.status}`);
        console.log(
          `Condition: ${JSON.stringify(
            notification.subscription.condition,
            null,
            4
          )}`
        );
      } else {
        res.sendStatus(204);
        console.log(`Unknown message type: ${req.headers[this.MESSAGE_TYPE]}`);
      }
    } else {
      console.log("403 - Signatures didn't match.");
      res.sendStatus(403);
    }
  }

  getHmacMessage(request) {
    return (
      request.headers[this.TWITCH_MESSAGE_ID] +
      request.headers[this.TWITCH_MESSAGE_TIMESTAMP] +
      request.body
    );
  }

  getHmac(secret, message) {
    return crypto.createHmac("sha256", secret).update(message).digest("hex");
  }

  verifyMessage(hmac, verifySignature) {
    return crypto.timingSafeEqual(
      Buffer.from(hmac),
      Buffer.from(verifySignature)
    );
  }
}

module.exports = { WebhookServer };
