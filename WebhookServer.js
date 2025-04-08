const crypto = require("crypto");
const express = require("express");
const tsscmp = require("tsscmp");
const EventEmitter = require("events");
require("dotenv").config();

class WebhookServer extends EventEmitter {
  constructor(port, secret) {
    super();
    this.app = express();
    this.server = require("http").Server(this.app);
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
        verify: this.verifyMessage.bind(this),
      })
    );

    this.app.get("/", (req, res) => {
      res.send("Hello World");
    });

    this.app.post("/eventsub", (req, res) => this.handleRequest(req, res));
  }

  start() {
    this.server.listen(this.port, () => {
      console.log(
        `Webhook server running at ${process.env.WEBHOOK_URL}:${this.port}`
      );
      this.emit("ready");
    });
  }

  verifyMessage(req, res, buf, encoding) {
    // is there a hub to verify against
    req.twitch_eventsub = false;
    if (
      req.headers &&
      req.headers.hasOwnProperty(this.TWITCH_MESSAGE_SIGNATURE)
    ) {
      req.twitch_eventsub = true;

      // id for dedupe
      let message_id = req.headers[this.TWITCH_MESSAGE_ID];
      // check age
      let timestamp = req.headers[this.TWITCH_MESSAGE_TIMESTAMP];
      // extract algo and signature for comparison
      let [signatureAlgo, signatureHash] =
        req.headers[this.TWITCH_MESSAGE_SIGNATURE].split("=");

      // you could do
      // req.twitch_hex = crypto.createHmac(algo, config.hook_secret)
      // but we know Twitch should always use sha256

      // so validate that

      if (signatureAlgo !== "sha256") {
        console.log("Signature algo not matched");
        res.status(500).send("Invalid signature algo");
        return;
      }

      const ourSignatureHash = crypto
        .createHmac("sha256", this.secret)
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
  }

  handleRequest(req, res) {
    // poor man cop out from the json verify function above
    if (res.headersSent) {
      return;
    }

    // the middleware above ran
    // and it prepared the tests for us
    // so check if we event generated a twitch_hub
    if (req.twitch_eventsub) {
      if (req.headers[this.MESSAGE_TYPE] == this.MESSAGE_TYPE_VERIFICATION) {
        // it's a another check for if it's a challenge request
        if (req.body.hasOwnProperty("challenge")) {
          console.log("Got a challenge, return the challenge");
          res.send(encodeURIComponent(req.body.challenge));
          return;
        }
        // unexpected hook request
        res.status(403).send("Denied");
      } else if (
        req.headers[this.MESSAGE_TYPE] == this.MESSAGE_TYPE_REVOCATION
      ) {
        // the webhook was revoked
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
      } else if (req.headers[this.MESSAGE_TYPE] == "notification") {
        console.log("The signature matched");
        // the signature passed so it should be a valid payload from Twitch
        // we ok as quickly as possible

        // Get JSON object from body, so you can process the message.

        let notification = JSON.parse(req.body);

        // Process the notification event
        console.log(`Event type: ${notification.subscription.type}`);
        console.log(JSON.stringify(notification.event, null, 4));

        // Emit event for external handling
        this.emit(notification.subscription.type, notification.event);

        res.sendStatus(204);

        // you can do whatever you want with the data
        // it's in req.body

        // write out the data to a log for now
        fs.appendFileSync(
          path.join(__dirname, "webhooks.log"),
          JSON.stringify({
            body: req.body,
            headers: req.headers,
          }) + "\n"
        );
        // pretty print the last webhook to a file
        fs.appendFileSync(
          path.join(__dirname, "last_webhooks.log"),
          JSON.stringify(
            {
              body: req.body,
              headers: req.headers,
            },
            null,
            4
          )
        );
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
