import express from "express";
import type { Request, Response, Router } from "express";

import type { Repositories } from "../../app/container/repositories.js";
import {
  discordDmChecksTotal,
  streamerSubscriptionsTotal,
} from "../../infrastructure/metrics/prometheus.js";
import type { DiscordService } from "../../modules/discord/ports/DiscordService.js";
import type {
  SavePushSubscribeResult,
  DeletePushSubscribeResult,
} from "../../modules/notifications/types/PushSubscribeResult.js";
import type { StreamerLiveStateService } from "../../modules/streamers/application/StreamerLiveStateService.js";
import type { TwitchStreamerProvider } from "../../modules/twitch/ports/TwitchGateway.js";
import type { SubscribeFailureReason } from "../../modules/users/domain/SubscribeResult.js";
import { BadRequestError } from "../errors/BadRequestError.js";
import { ConflictError } from "../errors/ConflictError.js";
import { NotFoundError } from "../errors/NotFoundError.js";
import { requireUser } from "../middleware/auth.js";
import {
  validatedBody,
  validatedQuery,
  validateBody,
  validateQuery,
} from "../middleware/validate.js";
import {
  deletePushSubscriptionQuerySchema,
  savePushSubscriptionSchema,
  setChannelPreferenceSchema,
  type SavePushSubscriptionRequest,
  type DeletePushSubscriptionQuery,
  type SetChannelPreferenceRequest,
} from "../schemas/notifications.js";
import type {
  CanReceiveDmResponse,
  NotificationChannelsResponse,
  PublicKeyResponse,
  SavePushResponse,
  SetChannelPreferenceResponse,
  StatusResponse,
  StreamerSummaryResponse,
  SubscribeResponse,
  TrackedStreamerSummaryResponse,
  UnsubscribeResponse,
  UserCountResponse,
} from "../schemas/responses.js";
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

type CreateApiRouterOptions = {
  repositories: Repositories;

  twitch: TwitchStreamerProvider;

  discord: DiscordService;

  ensureFreshToken: express.RequestHandler;

  // Mandatory: envSchema requires WEB_PUSH_PUBLIC_KEY, so every deployment
  // has one by the time routes are configured.
  webPushPublicKey: string;

  services: {
    streamerLiveState: StreamerLiveStateService;
  };
};

// Translates a SubscribeResult/UnsubscribeResult/UpdateSubscriptionResult
// failure `reason` code into the AppError subclass whose status code best
// matches it, at the HTTP boundary - the repository layer itself stays
// transport-agnostic and keeps returning plain result objects.
const SUBSCRIBE_REASON_MESSAGES: Record<SubscribeFailureReason, string> = {
  invalid_input: "That wasn't a valid request.",
  already_subscribed: "You're already subscribed to this streamer.",
  subscription_limit_reached:
    "You've reached the maximum number of subscriptions.",
  user_not_found: "We couldn't find your account.",
  not_subscribed: "You're not subscribed to this streamer.",
  subscription_not_found: "We couldn't find that subscription.",
};

function throwForSubscribeFailure(reason: SubscribeFailureReason): never {
  const message = SUBSCRIBE_REASON_MESSAGES[reason];

  switch (reason) {
    case "already_subscribed":
    case "subscription_limit_reached":
      throw new ConflictError(message);
    case "user_not_found":
    case "not_subscribed":
    case "subscription_not_found":
      throw new NotFoundError(message);
    case "invalid_input":
      throw new BadRequestError(message);
  }
}

// Union of every reason code SavePushSubscribeResult/DeletePushSubscribeResult
// can fail with (see modules/notifications/types/PushSubscribeResult.ts) -
// same rationale as SubscribeFailureReason above.
type PushFailureReason =
  | Extract<SavePushSubscribeResult, { success: false }>["reason"]
  | Extract<DeletePushSubscribeResult, { success: false }>["reason"];

const PUSH_REASON_MESSAGES: Record<PushFailureReason, string> = {
  invalid_user: "We couldn't identify your account.",
  invalid_push_subscription: "That push subscription isn't valid.",
  push_subscription_limit_reached:
    "You've reached the maximum number of push subscriptions.",
};

function throwForPushFailure(reason: PushFailureReason): never {
  const message = PUSH_REASON_MESSAGES[reason];

  switch (reason) {
    case "push_subscription_limit_reached":
      throw new ConflictError(message);
    case "invalid_user":
    case "invalid_push_subscription":
      throw new BadRequestError(message);
  }
}

export function createApiRouter({
  repositories,
  twitch,
  discord,
  ensureFreshToken,
  webPushPublicKey,
  services,
}: CreateApiRouterOptions): Router {
  const router = express.Router();

  // Applied once for the whole router rather than per-route: express.json()
  // is a no-op for requests without a JSON content-type, so this doesn't
  // affect the GET-only routes below.
  router.use(express.json());

  // ensureFreshToken (see its doc comment in http/middleware/auth.ts) is
  // purely best-effort housekeeping - nothing in this codebase calls
  // Discord's API with the user's own OAuth token, so no route's
  // correctness depends on it. Scoped to just the two routes below that
  // actually touch the Discord-linked DM capability, rather than applied to
  // every route under /api (including ones with nothing to do with Discord,
  // like /streamers/search or /status), to avoid an unnecessary Firestore
  // read/refresh check on every request.

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
      const payload = {
        publicKey: webPushPublicKey,
      } satisfies PublicKeyResponse;

      res.json(payload);
    },
  );

  router.get(
    "/notifications/channels",

    ensureFreshToken,

    async (req, res) => {
      const authUser = requireUser(req);
      const pushSubscriptions =
        await repositories.pushSubscriptions.getPushSubscriptions(authUser.id);

      const user = await repositories.users.getUser(authUser.id);
      const preferences = user?.notificationPreferences ?? {};

      const payload = {
        discord: {
          enabled: Boolean(user?.canReceiveDM),

          optedIn: preferences.discord !== false,
        },

        webPush: {
          enabled: pushSubscriptions.length > 0,

          subscriptions: pushSubscriptions.length,

          optedIn: preferences.webPush !== false,
        },
      } satisfies NotificationChannelsResponse;

      res.json(payload);
    },
  );

  router.post(
    "/notifications/channels",

    validateBody(setChannelPreferenceSchema),

    async (req, res) => {
      const user = requireUser(req);
      const { channel, enabled } = validatedBody<SetChannelPreferenceRequest>(req);

      const result = await repositories.users.updateNotificationPreference(
        user.id,
        channel,
        enabled,
      );

      if (!result.success) {
        throw new NotFoundError("We couldn't find your account.");
      }

      res.status(200).json({} satisfies SetChannelPreferenceResponse);
    },
  );

  router.get(
    "/user-count",

    async (_req: Request, res: Response): Promise<void> => {
      const count = await repositories.users.countUsersReceivingDM();

      const payload = {
        count,
      } satisfies UserCountResponse;

      res.json(payload);
    },
  );

  router.post(
    "/can-receive-dm",

    ensureFreshToken,

    async (req, res) => {
      const user = requireUser(req);
      // req.identity is populated once per request by passport.ts's
      // deserializeUser (see express.d.ts) - reuse it instead of a third
      // read of the same document (deserializeUser + ensureFreshToken have
      // each already read it once by the time this handler runs).
      const identity =
        req.identity !== undefined
          ? req.identity
          : await repositories.identities.getIdentity(user.id);
      const canReceiveDM = identity?.discord
        ? await discord.canSendDirectMessage(identity.discord.id)
        : false;

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

    validateBody(batchStreamerInfoSchema),

    async (req, res) => {
      const { ids } = validatedBody<BatchStreamerInfoRequest>(req);

      const [streamers, liveStreams, cachedStates] = await Promise.all([
        twitch.fetchStreamers(ids),

        // Ground truth for "live right now" - see getLiveStreams's own doc
        // comment for why this can't just be our own EventSub-fed cache.
        twitch.getLiveStreams(ids),

        // One batched Firestore read instead of one per id (still bounded
        // by batchStreamerInfoSchema's own 50-id cap either way, but this
        // is a single round trip rather than up to 50 concurrent ones).
        repositories.streamers.getStreamersByIds(ids),
      ]);

      if (!streamers.length) {
        throw new NotFoundError("We couldn't find that streamer.");
      }

      const liveSinceByUserId = new Map(
        liveStreams.map((stream) => [stream.user_id, stream.started_at]),
      );
      const cachedById = new Map(
        cachedStates.map((streamer) => [streamer.id, streamer]),
      );

      // Reconciles our own persisted live state against Twitch's ground
      // truth - not just returns it - so a streamer whose broadcast was
      // already in progress before this app ever subscribed to their
      // EventSub events (no stream.online webhook fires for a stream
      // already underway) still ends up correctly marked live, for every
      // other subscriber's realtime view too, not just this response. Only
      // written when it actually changed, to avoid a Firestore write (and a
      // socket broadcast) on every dashboard load for every subscription.
      await Promise.all(
        streamers.map(async ({ id }) => {
          const liveSince = liveSinceByUserId.get(id) ?? null;
          const isLive = liveSince !== null;
          const cached = cachedById.get(id);

          if (cached && cached.isLive === isLive && cached.liveSince === liveSince) {
            return;
          }

          await services.streamerLiveState.reconcileLiveState(
            id,
            isLive,
            liveSince,
          );
        }),
      );

      const payload = streamers.map(
        ({
          display_name: name,

          profile_image_url: avatar,

          id,
        }) => ({
          name,

          avatar,

          id: id,

          isLive: liveSinceByUserId.has(id),

          liveSince: liveSinceByUserId.get(id) ?? null,
        }),
      ) satisfies TrackedStreamerSummaryResponse[];

      res.json(payload);
    },
  );

  router.post(
    "/notifications/web-push/subscriptions",

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

      if (!result.success) {
        throwForPushFailure(result.reason);
      }

      res.status(201).json({ id: result.id } satisfies SavePushResponse);
    },
  );

  router.delete(
    "/notifications/web-push/subscriptions",

    validateQuery(deletePushSubscriptionQuerySchema),

    async (req, res) => {
      const user = requireUser(req);
      const { subscriptionId } =
        validatedQuery<DeletePushSubscriptionQuery>(req);

      const result =
        await repositories.pushSubscriptions.deletePushSubscription(
          user.id,
          subscriptionId,
        );

      if (!result.success) {
        throwForPushFailure(result.reason);
      }

      res.status(200).json({});
    },
  );

  router.post(
    "/subscriptions",

    validateBody(subscribeSchema),

    async (req, res) => {
      const user = requireUser(req);
      const { streamerId } = validatedBody<SubscribeRequest>(req);

      // Defense in depth alongside streamerIdSchema's charset restriction:
      // confirms streamerId actually names a real Twitch streamer before
      // it's ever used to build a Firestore document path, rather than
      // trusting whatever the client sent (the Discord commands already get
      // this for free since they resolve the id via Twitch first).
      const [streamer] = await twitch.fetchStreamers([streamerId]);

      if (!streamer) {
        throw new NotFoundError("We couldn't find that streamer.");
      }

      const result = await repositories.users.subscribe(
        user.id,

        streamer.id,

        "",
      );

      if (!result.success) {
        throwForSubscribeFailure(result.reason);
      }

      streamerSubscriptionsTotal.inc({ action: "subscribed" });

      res.status(201).json({
        createdStreamer: result.createdStreamer,
      } satisfies SubscribeResponse);
    },
  );

  router.delete(
    "/subscriptions",

    validateQuery(subscribeSchema),

    async (req, res) => {
      const user = requireUser(req);
      const { streamerId } = validatedQuery<UnsubscribeRequest>(req);

      const result = await repositories.users.unsubscribe(
        user.id,
        streamerId,
      );

      if (!result.success) {
        throwForSubscribeFailure(result.reason);
      }

      streamerSubscriptionsTotal.inc({ action: "unsubscribed" });

      res
        .status(200)
        .json({ usersLeft: result.usersLeft } satisfies UnsubscribeResponse);
    },
  );

  router.post(
    "/subscriptions/set-message",

    validateBody(setMessageSchema),

    async (req, res) => {
      const user = requireUser(req);
      const { id: streamerId, message } = validatedBody<SetMessageRequest>(req);

      const result = await repositories.users.updateSubscription(
        user.id,

        streamerId,

        {
          notification_message: message,
        },
      );

      if (!result.success) {
        throwForSubscribeFailure(result.reason);
      }

      res.status(200).json({});
    },
  );

  return router;
}
