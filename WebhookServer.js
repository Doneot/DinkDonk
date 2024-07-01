const crypto = require("crypto");
const express = require("express");
const EventEmitter = require("events");
const tsscmp = require("tsscmp");
require("dotenv").config();

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
      express.json({
        verify: function (req, res, buf, encoding) {
          req.twitch_eventsub = false;

          if (
            req.headers &&
            req.headers.hasOwnProperty("twitch-eventsub-message-signature")
          ) {
            req.twitch_eventsub = true;

            const messageId = req.headers["twitch-eventsub-message-id"];
            const timestamp = req.headers["twitch-eventsub-message-timestamp"];
            const [signatureAlgo, signatureHash] =
              req.headers["twitch-eventsub-message-signature"].split("=");

            if (signatureAlgo !== "sha256") {
              console.log("Signature algorithm not matched");
              return res.status(500).send("Invalid signature algorithm");
            }

            const message = `${messageId}${timestamp}${buf}`;
            const ourSignatureHash = crypto
              .createHmac("sha256", process.env.TWITCH_WEBHOOK_SECRET)
              .update(message)
              .digest("hex");

            console.log("Twitch Signature:", signatureHash);
            console.log("Computed HMAC:", ourSignatureHash);
            console.log("Message:", message);

            if (!tsscmp(signatureHash, ourSignatureHash)) {
              console.log("Signature not matched");
              return res.status(403).send("Signature not matched");
            }
            res.set("Content-Type", "text/plain");
            console.log("Signature matched");
          }
        },
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
    if (res.headersSent) {
      return;
    }

    const notification = req.body;

    if (req.twitch_eventsub) {
      if (this.MESSAGE_TYPE_VERIFICATION === req.headers[this.MESSAGE_TYPE]) {
        if (notification.hasOwnProperty("challenge")) {
          console.log("Got a challenge, returning the challenge");
          return res.status(200).send(notification.challenge);
        }
        return res.status(403).send("Denied");
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
      } else if (
        this.MESSAGE_TYPE_NOTIFICATION === req.headers[this.MESSAGE_TYPE]
      ) {
        console.log(`Event type: ${notification.subscription.type}`);
        console.log(JSON.stringify(notification.event, null, 4));

        this.emit(notification.subscription.type, notification.event);

        res.sendStatus(204);
      } else {
        res.sendStatus(204);
        console.log(`Unknown message type: ${req.headers[this.MESSAGE_TYPE]}`);
      }
    } else {
      console.log("It didn't seem to be a Twitch Hook");
      res.send("Ok");
    }
  }
}

module.exports = { WebhookServer };
