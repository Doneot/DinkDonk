const express = require('express');

function createApiRouter({ repository, twitch, discord, ensureFreshToken }) {
  const router = express.Router();
  router.use(ensureFreshToken);

  router.get('/status', (_req, res) => res.json({ online: discord.isReady }));

  router.get('/user-count', async (_req, res) => {
    const users = await repository.listUsers();
    res.json({ count: users.filter((user) => user.canReceiveDM).length });
  });

  router.get('/can-receive-dm', async (req, res) => {
    const canReceiveDM = await discord.canSendDirectMessage(req.user.id);
    await repository.saveUser(req.user.id, { canReceiveDM });
    req.session.canReceiveDM = canReceiveDM;
    res.json({ canReceiveDM });
  });

  router.get('/streamers/search', async (req, res) => {
    const streamers = await twitch.searchStreamers(req.query.query || '');
    res.json(streamers.map(({ display_name: name, thumbnail_url: avatar, id }) => ({ name, avatar, streamer_id: id })));
  });

  router.get('/streamers/info', async (req, res) => {
    const [streamer] = await twitch.fetchStreamers(req.query.id);
    if (!streamer) return res.status(404).json({ error: 'Streamer not found' });
    return res.json({ display_name: streamer.display_name, avatar: streamer.profile_image_url });
  });

  router.get('/streamers/subscribed-streamers', async (req, res) => {
    const user = await repository.getUser(req.user.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    return res.json(user.streamers || []);
  });

  router.post('/streamers/subscribe', express.json(), async (req, res) => {
    const result = await repository.subscribeUserToStreamer(req.user.id, req.body.streamer_id, '');
    res.status(result.success ? 200 : 400).json(result);
  });

  router.post('/streamers/unsubscribe', express.json(), async (req, res) => {
    const result = await repository.unsubscribeUserFromStreamer(req.user.id, req.body.streamer_id);
    res.status(result.success ? 200 : 400).json(result);
  });

  router.get('/streamers/get-message', async (req, res) => {
    const message = await repository.getNotificationMessage(req.user.id, req.query.id);
    res.json({ notification_message: message });
  });

  router.post('/streamers/set-message', express.json(), async (req, res) => {
    const result = await repository.setNotificationMessage(req.user.id, req.body.streamer_id, req.body.message);
    res.status(result.success ? 200 : 400).json(result);
  });

  return router;
}

module.exports = { createApiRouter };
