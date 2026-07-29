import {
  OpenAPIRegistry,
  OpenApiGeneratorV3,
  extendZodWithOpenApi,
} from "@asteasolutions/zod-to-openapi";

import { z } from "zod";

import { PushSubscriptionSchema } from "../modules/notifications/schemas/PushSubscriptionSchema.js";
import { SubscriptionSchema } from "../modules/subscriptions/schemas/SubscriptionSchema.js";
import { StreamerSchema } from "../modules/streamers/schemas/StreamerSchema.js";
import { UserRecordSchema } from "../modules/users/infrastructure/firestore/records/UserRecord.js";

import {
  deletePushSubscriptionSchema,
  savePushSubscriptionSchema,
} from "../http/schemas/notifications.js";
import {
  searchStreamersQuerySchema,
  batchStreamerInfoSchema,
} from "../http/schemas/streamers.js";
import {
  subscribeSchema,
  setMessageSchema,
} from "../http/schemas/subscriptions.js";
import {
  canReceiveDmResponseSchema,
  deletePushResponseSchema,
  errorResponseSchema,
  notificationChannelsResponseSchema,
  publicKeyResponseSchema,
  savePushResponseSchema,
  statusResponseSchema,
  streamerSummaryResponseSchema,
  subscribeResponseSchema,
  unsubscribeResponseSchema,
  updateSubscriptionResponseSchema,
  userCountResponseSchema,
  userResponseSchema,
} from "../http/schemas/responses.js";

import { registerPaths } from "./registerPaths.js";

extendZodWithOpenApi(z);

export const registry = new OpenAPIRegistry();

registry.register("PushSubscription", PushSubscriptionSchema);
registry.register("Subscription", SubscriptionSchema);
registry.register("Streamer", StreamerSchema);
registry.register("User", UserRecordSchema);

registry.register("SavePushSubscriptionRequest", savePushSubscriptionSchema);
registry.register(
  "DeletePushSubscriptionRequest",
  deletePushSubscriptionSchema,
);

registry.register("SearchStreamerRequest", searchStreamersQuerySchema);
registry.register("BatchStreamerInfoRequest", batchStreamerInfoSchema);
registry.register("SubscribeRequest", subscribeSchema);
registry.register("UnsubscribeRequest", subscribeSchema);
registry.register("SetMessageRequest", setMessageSchema);

registry.register("ErrorResponse", errorResponseSchema);
registry.register("StatusResponse", statusResponseSchema);
registry.register("PublicKeyResponse", publicKeyResponseSchema);
registry.register(
  "NotificationChannelsResponse",
  notificationChannelsResponseSchema,
);
registry.register("UserCountResponse", userCountResponseSchema);
registry.register("CanReceiveDmResponse", canReceiveDmResponseSchema);
registry.register("StreamerSummaryResponse", streamerSummaryResponseSchema);
registry.register("SavePushResponse", savePushResponseSchema);
registry.register("DeletePushResponse", deletePushResponseSchema);
registry.register("SubscribeResponse", subscribeResponseSchema);
registry.register("UnsubscribeResponse", unsubscribeResponseSchema);
registry.register(
  "UpdateSubscriptionResponse",
  updateSubscriptionResponseSchema,
);
registry.register("UserResponse", userResponseSchema);

registerPaths(registry);

const generator = new OpenApiGeneratorV3(registry.definitions);

const generatedOpenApiDocument = generator.generateDocument({
  openapi: "3.0.0",
  info: {
    title: "DinkDonk API",
    version: "1.0.0",
  },
});

// registerPaths only declares the "/api/..." routes, but configureRoutes
// mounts the same router instances at "/api/v1/..." too (a non-breaking
// alias - see the comment there). Mirror every registered path under
// "/api/v1" as well, so the docs actually reflect what's reachable instead
// of silently omitting the versioned alias.
const v1AliasedPaths = Object.fromEntries(
  Object.entries(generatedOpenApiDocument.paths ?? {})
    .filter(([path]) => path.startsWith("/api/"))
    .map(([path, operations]) => [`/api/v1${path.slice("/api".length)}`, operations]),
);

export const openApiDocument = {
  ...generatedOpenApiDocument,
  paths: {
    ...generatedOpenApiDocument.paths,
    ...v1AliasedPaths,
  },
  components: {
    ...generatedOpenApiDocument.components,
    securitySchemes: {
      ...generatedOpenApiDocument.components?.securitySchemes,
      cookieAuth: {
        type: "apiKey",
        in: "cookie",
        name: "connect.sid",
      },
    },
  },
};
