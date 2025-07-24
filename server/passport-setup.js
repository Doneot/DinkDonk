// server/passport-setup.js
const passport = require("passport");
const DiscordStrategy = require("passport-discord").Strategy;
const {
  DISCORD_CLIENT_ID,
  DISCORD_CLIENT_SECRET,
  SERVER_URL,
  NODE_ENV,
} = require("./config.js");

passport.serializeUser((user, done) => {
  done(null, user);
});

passport.deserializeUser((obj, done) => {
  done(null, obj);
});

passport.use(
  new DiscordStrategy(
    {
      clientID: DISCORD_CLIENT_ID,
      clientSecret: DISCORD_CLIENT_SECRET,
      callbackURL: NODE_ENV === "production"
        ?`${SERVER_URL}/api/auth/discord/callback`
        : `http://localhost:3000/api/auth/discord/callback`,
      scope: ["identify"],
    },
    function (accessToken, refreshToken, profile, done) {
      profile.accessToken = accessToken;
      profile.refreshToken = refreshToken;
      profile.fetchTime = Date.now();
      return done(null, profile);
    }
  )
);
