const passport = require('passport');
const DiscordStrategy = require('passport-discord').Strategy;
const refresh = require('passport-oauth2-refresh');
const { env } = require('../config/env');

function configurePassport(repository) {
  passport.serializeUser((user, done) => done(null, { id: user.id }));
  passport.deserializeUser(async ({ id }, done) => {
    try {
      const user = await repository.getUser(id);
      done(null, user ? { ...user, id } : null);
    } catch (error) {
      done(error, null);
    }
  });

  const strategy = new DiscordStrategy({
    clientID: env.discord.clientId,
    clientSecret: env.discord.clientSecret,
    callbackURL: env.isProduction
      ? `${env.serverUrl}/api/auth/discord/callback`
      : 'http://localhost:3000/api/auth/discord/callback',
    scope: ['identify'],
  }, async (accessToken, refreshToken, profile, done) => {
    try {
      const user = {
        id: profile.id,
        username: profile.username,
        discriminator: profile.discriminator,
        avatar: profile.avatar,
        accessToken,
        refreshToken,
        fetchTime: Date.now(),
      };
      await repository.saveUser(profile.id, user);
      done(null, user);
    } catch (error) {
      done(error);
    }
  });

  DiscordStrategy.prototype.authorizationParams = () => ({ prompt: 'none' });
  passport.use(strategy);
  refresh.use(strategy);
  return passport;
}

module.exports = { configurePassport };
