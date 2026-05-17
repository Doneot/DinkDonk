const express = require('express');
const passport = require('passport');
const { env } = require('../../config/env');
const { requireAuthenticated } = require('../middleware/auth');

function createAuthRouter({ repository, discord, ensureFreshToken }) {
  const router = express.Router();

  router.get('/discord', passport.authenticate('discord'));

  router.get('/discord/callback',
    passport.authenticate('discord', { failureRedirect: '/login-failed' }),
    async (req, res) => {
      let user = await repository.getUser(req.user.id);
      const canReceiveDM = user?.canReceiveDM ?? await discord.canSendDirectMessage(req.user.id);
      await repository.saveUser(req.user.id, { canReceiveDM });
      req.session.canReceiveDM = canReceiveDM;
      res.redirect(env.isProduction ? `${env.serverUrl}/dashboard` : 'http://localhost:5000/dashboard');
    });

  router.get('/user', (req, res) => {
    if (!req.user) return res.status(401).json({ error: 'Not authenticated' });
    return res.json({ ...req.user, canReceiveDM: req.session.canReceiveDM ?? req.user.canReceiveDM ?? false });
  });

  router.get('/logout', requireAuthenticated, ensureFreshToken, (req, res) => {
    req.logout((error) => {
      if (error) return res.status(500).send('Logout failed');
      req.session.destroy(() => {
        res.clearCookie('connect.sid');
        res.redirect('/');
      });
    });
  });

  return router;
}

module.exports = { createAuthRouter };
