import express from "express";
import type { Request, Response, Router } from "express";
import type { User } from "../../types/user.js";
import type { DiscordService } from "../../types/services/discord.js";
import type { TwitchStreamerService } from "../../types/services/twitch.js";
import { assertAuthenticated } from "../../utils/assertAuthenticated.js";

type Repository = {
  listPushSubscriptions(userId: string): Promise<unknown[]>;

  savePushSubscription(
    userId: string,
    subscription: unknown,
    metadata?: {
      userAgent?: string;
    },
  ): Promise<{
    success: boolean;

    reason?: string;
  }>;

  deletePushSubscription(
    userId: string,
    subscription: unknown,
  ): Promise<{
    success: boolean;

    reason?: string;
  }>;

  listUsers(): Promise<User[]>;

  saveUser(userId: string, data: Partial<User>): Promise<void>;

  getUser(userId: string): Promise<User | null>;

  subscribeUserToStreamer(
    userId: string,
    streamerId: string,
    notificationMessage?: string,
  ): Promise<{
    success: boolean;

    reason?: string;
  }>;

  unsubscribeUserFromStreamer(
    userId: string,
    streamerId: string,
  ): Promise<{
    success: boolean;

    reason?: string;
  }>;

  getNotificationMessage(userId: string, streamerId: string): Promise<string>;

  setNotificationMessage(
    userId: string,
    streamerId: string,
    message: string,
  ): Promise<{
    success: boolean;

    reason?: string;
  }>;
};

type CreateApiRouterOptions = {
  repository: Repository;

  twitch: TwitchStreamerService;

  discord: DiscordService;

  ensureFreshToken: express.RequestHandler;

  webPushPublicKey?: string;
};

export function createApiRouter({
  repository,
  twitch,
  discord,
  ensureFreshToken,
  webPushPublicKey,
}: CreateApiRouterOptions): Router {
  const router = express.Router();

  router.use(ensureFreshToken);

  router.get(
    "/status",

    (_req: Request, res: Response): void => {
      res.json({
        online: discord.isReady,
      });
    },
  );

  router.get(
    "/notifications/web-push/public-key",

    (_req: Request, res: Response): void => {
      if (!webPushPublicKey) {
        res.status(503).json({
          error: "Web Push is not configured",
        });

        return;
      }

      res.json({
        publicKey: webPushPublicKey,
      });
    },
  );

  router.get(
    "/notifications/channels",

    async (req: Request, res: Response): Promise<void> => {
      assertAuthenticated(req);
      const pushSubscriptions = await repository.listPushSubscriptions(
        req.user.id,
      );

      res.json({
        discord: {
          enabled: Boolean(req.user.canReceiveDM),
        },

        webPush: {
          enabled: pushSubscriptions.length > 0,

          subscriptions: pushSubscriptions.length,
        },
      });
    },
  );

  router.post(
    "/notifications/web-push/subscriptions",

    express.json(),

    async (req: Request, res: Response): Promise<void> => {
      assertAuthenticated(req);
      const userAgent = req.get("user-agent");
      const result = await repository.savePushSubscription(
        req.user.id,

        req.body.subscription,

        userAgent ? { userAgent } : {},
      );

      res.status(result.success ? 200 : 400).json(result);
    },
  );

  router.delete(
    "/notifications/web-push/subscriptions",

    express.json(),

    async (req: Request, res: Response): Promise<void> => {
      assertAuthenticated(req);

      const result = await repository.deletePushSubscription(
        req.user.id,
        req.body.subscription,
      );

      res.status(result.success ? 200 : 400).json(result);
    },
  );

  router.get(
    "/user-count",

    async (_req: Request, res: Response): Promise<void> => {
      const users = await repository.listUsers();

      res.json({
        count: users.filter((user) => user.canReceiveDM).length,
      });
    },
  );

  router.get(
    "/can-receive-dm",

    async (req: Request, res: Response): Promise<void> => {
      assertAuthenticated(req);

      const canReceiveDM = await discord.canSendDirectMessage(req.user.id);

      await repository.saveUser(req.user.id, {
        canReceiveDM,
      });

      req.session.canReceiveDM = canReceiveDM;

      res.json({
        canReceiveDM,
      });
    },
  );

  router.get(
    "/streamers/search",

    async (req: Request, res: Response): Promise<void> => {
      const query = typeof req.query.query === "string" ? req.query.query : "";

      const streamers = await twitch.searchStreamers(query);

      res.json(
        streamers.map(
          ({
            display_name: name,

            thumbnail_url: avatar,

            id,
          }) => ({
            name,

            avatar,

            id: id,
          }),
        ),
      );
    },
  );

  router.get(
    "/streamers/info",

    async (req: Request, res: Response): Promise<void> => {
      const streamerId = typeof req.query.id === "string" ? req.query.id : "";

      const [streamer] = await twitch.fetchStreamers(streamerId);

      if (!streamer) {
        res.status(404).json({
          error: "Streamer not found",
        });

        return;
      }

      res.json({
        display_name: streamer.display_name,

        avatar: streamer.profile_image_url,
      });
    },
  );

  router.get(
    "/streamers/subscribed-streamers",

    async (req: Request, res: Response): Promise<void> => {
      assertAuthenticated(req);
      const user = await repository.getUser(req.user.id);

      if (!user) {
        res.status(404).json({
          error: "User not found",
        });

        return;
      }

      res.json(user.streamers || []);
    },
  );

  router.post(
    "/streamers/subscribe",

    express.json(),

    async (req: Request, res: Response): Promise<void> => {
      assertAuthenticated(req);

      const result = await repository.subscribeUserToStreamer(
        req.user.id,

        req.body.streamer_id,

        "",
      );

      res.status(result.success ? 200 : 400).json(result);
    },
  );

  router.post(
    "/streamers/unsubscribe",

    express.json(),

    async (req: Request, res: Response): Promise<void> => {
      assertAuthenticated(req);

      const result = await repository.unsubscribeUserFromStreamer(
        req.user.id,
        req.body.streamer_id,
      );

      res.status(result.success ? 200 : 400).json(result);
    },
  );

  router.get(
    "/streamers/get-message",

    async (req: Request, res: Response): Promise<void> => {
      assertAuthenticated(req);

      const streamerId = typeof req.query.id === "string" ? req.query.id : "";

      const message = await repository.getNotificationMessage(
        req.user.id,
        streamerId,
      );

      res.json({
        notification_message: message,
      });
    },
  );

  router.post(
    "/streamers/set-message",

    express.json(),

    async (req: Request, res: Response): Promise<void> => {
      assertAuthenticated(req);

      const result = await repository.setNotificationMessage(
        req.user.id,

        req.body.id,

        req.body.message,
      );

      res.status(result.success ? 200 : 400).json(result);
    },
  );

  return router;
}
