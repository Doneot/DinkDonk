import passport from "passport";
import { Strategy as DiscordStrategy, type Profile } from "passport-discord";
import refresh from "passport-oauth2-refresh";
import { env } from "../config/env.js";
import { assertDefined } from "../utils/assert.js";
import type { User } from "../types/user.js";
import type { VerifyCallback } from "passport-oauth2";

type PassportRepository = {
  getUser(id: string): Promise<User | null>;

  saveUser(id: string, user: Partial<Omit<User, "id">>): Promise<void>;
};

export function configurePassport(
  repository: PassportRepository,
): typeof passport {
  passport.serializeUser((user: Express.User, done): void => {
    const sessionUser = user as {
      id: string;
    };
    done(null, {
      id: sessionUser.id,
    });
  });

  passport.deserializeUser(
    async ({ id }: { id: string }, done): Promise<void> => {
      try {
        const user = await repository.getUser(id);

        done(
          null,
          user
            ? {
                ...user,
                id,
              }
            : null,
        );
      } catch (error) {
        done(error, null);
      }
    },
  );

  const strategy = new DiscordStrategy(
    {
      clientID: assertDefined(
        env.discord.clientId,
        "Discord Client ID is not defined",
      ),

      clientSecret: assertDefined(
        env.discord.clientSecret,
        "Discord Client Secret is not defined",
      ),

      callbackURL: env.isProduction
        ? `${assertDefined(env.serverUrl, "Server URL is not defined")}/api/auth/discord/callback`
        : "http://localhost:3000/api/auth/discord/callback",

      scope: ["identify"],
    },

    async (
      accessToken: string,
      refreshToken: string,
      profile: Profile,
      done: VerifyCallback,
    ): Promise<void> => {
      try {
        const user: User = {
          id: profile.id,

          username: profile.username,

          discriminator: profile.discriminator,

          avatar: profile.avatar ?? "",

          accessToken,

          refreshToken,

          fetchTime: Date.now(),
        };
        const { id, ...userData } = user;

        await repository.saveUser(id, userData);

        done(null, user);
      } catch (error) {
        done(error);
      }
    },
  );

  DiscordStrategy.prototype.authorizationParams = (): {
    prompt: string;
  } => ({
    prompt: "none",
  });

  passport.use(strategy);

  refresh.use(strategy);

  return passport;
}
