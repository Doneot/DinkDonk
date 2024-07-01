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
          // is there a hub to verify against
          req.twitch_eventsub = false;
          if (
            req.headers &&
            req.headers.hasOwnProperty("twitch-eventsub-message-signature")
          ) {
            req.twitch_eventsub = true;

            // id for dedupe
            let message_id = req.headers["twitch-eventsub-message-id"];
            // check age
            let timestamp = req.headers["twitch-eventsub-message-timestamp"];
            // extract algo and signature for comparison
            let [signatureAlgo, signatureHash] =
              req.headers["twitch-eventsub-message-signature"].split("=");

            if (signatureAlgo !== "sha256") {
              console.log("Signature algo not matched");
              res.status(500).send("Invalid signature algo");
              return;
            }

            const ourSignatureHash = crypto
              .createHmac("sha256", process.env.TWITCH_WEBHOOK_SECRET)
              .update(`${message_id}${timestamp}${buf}`)
              .digest("hex");

            if (!signatureHash || !tsscmp(signatureHash, ourSignatureHash)) {
              console.log("Signature not matched");
              res.status(500).send("Signature not matched");
              return;
            }

            // as an API style/EventSub handler
            // force set a/ensure a correct content type header
            // for all event sub routes
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
    // poor man cop out from the json verify function above
    if (res.headersSent) {
      return;
    }

    let notification = req.body;

    // the middleware above ran
    // and it prepared the tests for us
    // so check if we event generated a twitch_hub
    if (req.twitch_eventsub) {
      // is it a verification request
      if (this.MESSAGE_TYPE_VERIFICATION === req.headers[this.MESSAGE_TYPE]) {
        // it's a another check for if it's a challenge request
        if (req.body.hasOwnProperty("challenge")) {
          console.log("Got a challenge, return the challenge");
          res.send(encodeURIComponent(req.body.challenge));
          return;
        }
        // unexpected hook request
        res.status(403).send("Denied");
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
        // Process the notification event
        // console.log(`Event type: ${notification.subscription.type}`);
        // console.log(JSON.stringify(notification.event, null, 4));

        // Emit event for external handling
        this.emit(notification.subscription.type, notification.event);

        res.sendStatus(204);
      } else {
        res.sendStatus(204);
        console.log(`Unknown message type: ${req.headers[this.MESSAGE_TYPE]}`);
      }
    } else {
      console.log("It didn't seem to be a Twitch Hook");
      // again, not normally called
      // but dump out a OK
      res.send("Ok");
    }
  }
}

module.exports = { WebhookServer };
