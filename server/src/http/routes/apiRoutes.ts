import express from "express";
import type { Request, Response, Router } from "express";
import type { DiscordService } from "../../modules/discord/ports/DiscordService.js";
import type { TwitchStreamerProvider } from "../../modules/twitch/ports/TwitchGateway.js";
import type { Repositories } from "../../app/container/repositories.js";
import { requireUser } from "../middleware/auth.js";
import {
  validatedBody,
  validatedQuery,
  validateBody,
  validateQuery,
} from "../middleware/validate.js";
import {
  deletePushSubscriptionSchema,
  savePushSubscriptionSchema,
  type SavePushSubscriptionRequest,
  type DeletePushSubscriptionRequest,
} from "../schemas/notifications.js";
import {
  searchStreamersQuerySchema,
  batchStreamerInfoSchema,
  type BatchStreamerInfoRequest,
  type SearchStreamerRequest,
} from "../schemas/streamers.js";
import {
  subscribeSchema,
  setMessageSchema,
  type SubscribeRequest,
  type UnsubscribeRequest,
  type SetMessageRequest,
} from "../schemas/subscriptions.js";
import { NotFoundError } from "../errors/NotFoundError.js";
import type {
  CanReceiveDmResponse,
  NotificationChannelsResponse,
  PublicKeyResponse,
  StatusResponse,
  StreamerSummaryResponse,
  UserCountResponse,
} from "../schemas/responses.js";
import { discordDmChecksTotal } from "../../infrastructure/metrics/prometheus.js";

type CreateApiRouterOptions = {
  repositories: Repositories;

  twitch: TwitchStreamerProvider;

  discord: DiscordService;

  ensureFreshToken: express.RequestHandler;

  webPushPublicKey?: string;
};

export function createApiRouter({
  repositories,
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
      const payload = {
        online: discord.isReady,
      } satisfies StatusResponse;

      res.json(payload);
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

      const payload = {
        publicKey: webPushPublicKey,
      } satisfies PublicKeyResponse;

      res.json(payload);
    },
  );

  router.get(
    "/notifications/channels",

    async (req, res) => {
      const authUser = requireUser(req);
      const pushSubscriptions =
        await repositories.pushSubscriptions.getPushSubscriptions(authUser.id);

      const user = await repositories.users.getUser(authUser.id);

      const payload = {
        discord: {
          enabled: Boolean(user?.canReceiveDM),
        },

        webPush: {
          enabled: pushSubscriptions.length > 0,

          subscriptions: pushSubscriptions.length,
        },
      } satisfies NotificationChannelsResponse;

      res.json(payload);
    },
  );

  router.get(
    "/user-count",

    async (_req: Request, res: Response): Promise<void> => {
      const users = await repositories.users.getUsers();

      const payload = {
        count: users.filter((user) => user.canReceiveDM).length,
      } satisfies UserCountResponse;

      res.json(payload);
    },
  );

  router.get(
    "/can-receive-dm",

    async (req, res) => {
      const user = requireUser(req);
      const canReceiveDM = await discord.canSendDirectMessage(user.id);

      discordDmChecksTotal.inc();

      await repositories.users.updateUser(user.id, {
        canReceiveDM,
      });

      req.session.canReceiveDM = canReceiveDM;

      const payload = {
        canReceiveDM,
      } satisfies CanReceiveDmResponse;

      res.json(payload);
    },
  );

  router.get(
    "/streamers/search",

    validateQuery(searchStreamersQuerySchema),

    async (req, res) => {
      const { query } = validatedQuery<SearchStreamerRequest>(req);

      const streamers = await twitch.searchStreamers(query);

      const payload = streamers.map(
        ({
          display_name: name,

          profile_image_url: avatar,

          id,
        }) => ({
          name,

          avatar,

          id: id,
        }),
      ) satisfies StreamerSummaryResponse[];

      res.json(payload);
    },
  );

  router.post(
    "/streamers/info",

    express.json(),

    validateBody(batchStreamerInfoSchema),

    async (req, res) => {
      const { ids } = validatedBody<BatchStreamerInfoRequest>(req);

      const streamers = await twitch.fetchStreamers(ids);

      if (!streamers.length) {
        throw new NotFoundError("streamer");
      }

      const payload = streamers.map(
        ({
          display_name: name,

          profile_image_url: avatar,

          id,
        }) => ({
          name,

          avatar,

          id: id,
        }),
      ) satisfies StreamerSummaryResponse[];

      res.json(payload);
    },
  );

  router.post(
    "/notifications/web-push/subscriptions",

    express.json(),

    validateBody(savePushSubscriptionSchema),

    async (req, res) => {
      const user = requireUser(req);
      const userAgent = req.get("user-agent");
      const { subscription } = validatedBody<SavePushSubscriptionRequest>(req);
      const result = await repositories.pushSubscriptions.savePushSubscription(
        user.id,

        subscription,

        userAgent ? { userAgent } : {},
      );

      res.status(result.success ? 200 : 400).json(result);
    },
  );

  router.delete(
    "/notifications/web-push/subscriptions",

    express.json(),

    validateBody(deletePushSubscriptionSchema),

    async (req, res) => {
      const user = requireUser(req);
      const { subscriptionId } =
        validatedBody<DeletePushSubscriptionRequest>(req);

      const result =
        await repositories.pushSubscriptions.deletePushSubscription(
          user.id,
          subscriptionId,
        );

      res.status(result.success ? 200 : 400).json(result);
    },
  );

  router.post(
    "/subscriptions",

    express.json(),

    validateBody(subscribeSchema),

    async (req, res) => {
      const user = requireUser(req);
      const { streamerId } = validatedBody<SubscribeRequest>(req);

      const result = await repositories.subscriptions.subscribe(
        user.id,

        streamerId,

        "",
      );

      res.status(result.success ? 200 : 400).json(result);
    },
  );

  router.delete(
    "/subscriptions",

    express.json(),

    validateBody(subscribeSchema),

    async (req, res) => {
      const user = requireUser(req);
      const { streamerId } = validatedBody<UnsubscribeRequest>(req);

      const result = await repositories.subscriptions.unsubscribe(
        user.id,
        streamerId,
      );

      res.status(result.success ? 200 : 400).json(result);
    },
  );

  router.post(
    "/subscriptions/set-message",

    express.json(),

    validateBody(setMessageSchema),

    async (req, res) => {
      const user = requireUser(req);
      const { id: streamerId, message } = validatedBody<SetMessageRequest>(req);

      const result = await repositories.subscriptions.updateSubscription(
        user.id,

        streamerId,

        {
          notification_message: message,
        },
      );

      res.status(result.success ? 200 : 400).json(result);
    },
  );

  return router;
}
