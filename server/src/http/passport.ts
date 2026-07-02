import passport from "passport";
import { Strategy as DiscordStrategy, type Profile } from "passport-discord";
import refresh from "passport-oauth2-refresh";
import { env } from "../shared/config/env.js";
import { assertDefined } from "../shared/utils/assert.js";
import type { AuthUser } from "../modules/auth/domain/AuthUser.js";
import type { AuthUserRepository } from "../modules/auth/ports/AuthUserRepository.js";
import type { VerifyCallback } from "passport-oauth2";

export function configurePassport(
  repository: AuthUserRepository,
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
        const user = await repository.getAuthUser(id);

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
        const user: AuthUser = {
          id: profile.id,

          username: profile.username,

          discriminator: profile.discriminator,

          avatar: profile.avatar ?? "",

          accessToken,

          refreshToken,

          fetchTime: Date.now(),
        };
        const { id, ...userData } = user;

        await repository.updateAuthUser(id, userData);

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
