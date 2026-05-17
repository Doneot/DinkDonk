const crypto = require('crypto');
const express = require('express');

function createEventSubRouter({ secret, onNotification }) {
  const router = express.Router();

  router.post('/eventsub', express.raw({ type: 'application/json' }), async (req, res) => {
    const signature = req.headers['twitch-eventsub-message-signature'];
    const message = `${req.headers['twitch-eventsub-message-id']}${req.headers['twitch-eventsub-message-timestamp']}${req.body}`;
    const expected = `sha256=${crypto.createHmac('sha256', secret).update(message).digest('hex')}`;

    if (!signature || !crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature))) {
      return res.sendStatus(403);
    }

    const notification = JSON.parse(req.body);
    const messageType = req.headers['twitch-eventsub-message-type'];

    if (messageType === 'webhook_callback_verification') {
      return res.type('text/plain').status(200).send(notification.challenge);
    }

    if (messageType === 'notification') {
      await onNotification(notification.subscription.type, notification.event);
      return res.sendStatus(204);
    }

    return res.sendStatus(204);
  });

  return router;
}

module.exports = { createEventSubRouter };
