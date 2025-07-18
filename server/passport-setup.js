const passport = require("passport");
const DiscordStrategy = require("passport-discord").Strategy;
const {
  DISCORD_CLIENT_ID,
  DISCORD_CLIENT_SECRET,
  SERVER_URL,
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
      callbackURL: SERVER_URL.includes("ngrok")
        ? `http://localhost:3000/api/auth/discord/callback`
        : `${SERVER_URL}/api/auth/discord/callback`,
      scope: ["identify"],
    },
    function (accessToken, refreshToken, profile, done) {
      return done(null, profile); // You could store it in DB here
    }
  )
);
