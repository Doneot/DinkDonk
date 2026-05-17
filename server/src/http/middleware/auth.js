const refresh = require('passport-oauth2-refresh');
const { env } = require('../../config/env');
const { logger } = require('../../utils/logger');

const MAX_TOKEN_AGE_MS = 6 * 24 * 60 * 60 * 1000;

function requireAuthenticated(req, res, next) {
  if (req.user) return next();
  return res.status(401).json({ error: 'Not authenticated' });
}

function createFreshTokenMiddleware(repository) {
  const locks = new Map();

  return async function ensureFreshDiscordToken(req, res, next) {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Not authenticated' });

    try {
      const user = await repository.getUser(userId);
      if (!user?.accessToken || !user?.refreshToken) return res.redirect('/api/auth/discord');

      const tokenIsFresh = Date.now() - (user.fetchTime || 0) <= MAX_TOKEN_AGE_MS;
      if (tokenIsFresh) return next();

      if (!locks.has(userId)) {
        locks.set(userId, refreshDiscordToken(user.refreshToken)
          .then(async (tokens) => {
            await repository.saveUser(userId, { ...tokens, fetchTime: Date.now() });
            return tokens;
          })
          .finally(() => locks.delete(userId)));
      }

      await locks.get(userId);
      return next();
    } catch (error) {
      logger.error('Discord token refresh failed', { userId, message: error.message });
      return req.logout(() => {
        req.session.destroy(() => {
          res.clearCookie('connect.sid');
          res.redirect(env.isProduction ? env.serverUrl : 'http://localhost:5000');
        });
      });
    }
  };
}

function refreshDiscordToken(refreshToken) {
  return new Promise((resolve, reject) => {
    refresh.requestNewAccessToken('discord', refreshToken, (error, accessToken, newRefreshToken) => {
      if (error) reject(error);
      else resolve({ accessToken, refreshToken: newRefreshToken || refreshToken });
    });
  });
}

module.exports = { requireAuthenticated, createFreshTokenMiddleware };
