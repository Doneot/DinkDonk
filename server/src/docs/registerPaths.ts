import {
  type OpenAPIRegistry,
  extendZodWithOpenApi,
} from "@asteasolutions/zod-to-openapi";
import { z } from "zod";

import {
  deletePushSubscriptionQuerySchema,
  savePushSubscriptionSchema,
  setChannelPreferenceSchema,
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
  logoutResponseSchema,
  notificationChannelsResponseSchema,
  publicKeyResponseSchema,
  savePushResponseSchema,
  setChannelPreferenceResponseSchema,
  statusResponseSchema,
  streamerSummaryResponseSchema,
  trackedStreamerSummaryResponseSchema,
  subscribeResponseSchema,
  unsubscribeResponseSchema,
  updateSubscriptionResponseSchema,
  userCountResponseSchema,
  userResponseSchema,
} from "../http/schemas/responses.js";

const emptyResponse = {
  description: "No content",
};

const redirectResponse = {
  description: "Redirect",
};

function jsonResponse(description: string, schema: z.ZodTypeAny) {
  return {
    description,
    content: {
      "application/json": {
        schema,
      },
    },
  };
}

function textResponse(description: string) {
  return {
    description,
    content: {
      "text/plain": {
        schema: z.string(),
      },
    },
  };
}

function jsonBody(schema: z.ZodTypeAny) {
  return {
    content: {
      "application/json": {
        schema,
      },
    },
  };
}

const authSecurity = [{ cookieAuth: [] }];

const validationErrorResponse = jsonResponse(
  "Validation error",
  errorResponseSchema,
);

const unauthorizedResponse = jsonResponse("Unauthorized", errorResponseSchema);

const notFoundResponse = jsonResponse("Not found", errorResponseSchema);

const conflictResponse = jsonResponse("Conflict", errorResponseSchema);

const internalErrorResponse = jsonResponse(
  "Internal server error",
  errorResponseSchema,
);

export function registerPaths(registry: OpenAPIRegistry): void {
  extendZodWithOpenApi(z);

  registry.registerPath({
    method: "get",
    path: "/health/live",
    summary: "Liveness probe",
    responses: {
      200: emptyResponse,
    },
  });

  registry.registerPath({
    method: "get",
    path: "/health/ready",
    summary: "Readiness probe",
    responses: {
      200: emptyResponse,
      503: emptyResponse,
    },
  });

  registry.registerPath({
    method: "get",
    path: "/docs",
    summary: "OpenAPI documentation UI",
    responses: {
      200: {
        description: "Swagger UI",
        content: {
          "text/html": {
            schema: z.string(),
          },
        },
      },
    },
  });

  registry.registerPath({
    method: "get",
    path: "/api/auth/discord",
    summary: "Start Discord OAuth login",
    responses: {
      302: redirectResponse,
    },
  });

  registry.registerPath({
    method: "get",
    path: "/api/auth/discord/link",
    summary: "Connect Discord to the authenticated account",
    security: authSecurity,
    responses: {
      302: redirectResponse,
      401: unauthorizedResponse,
    },
  });

  registry.registerPath({
    method: "get",
    path: "/api/auth/discord/callback",
    summary: "Discord OAuth callback",
    responses: {
      302: redirectResponse,
      401: unauthorizedResponse,
      409: conflictResponse,
      500: internalErrorResponse,
    },
  });

  registry.registerPath({
    method: "get",
    path: "/api/auth/user",
    summary: "Get authenticated user",
    security: authSecurity,
    responses: {
      200: jsonResponse("Authenticated user", userResponseSchema),
      401: unauthorizedResponse,
    },
  });

  registry.registerPath({
    method: "post",
    path: "/api/auth/logout",
    summary: "Log out authenticated user",
    security: authSecurity,
    responses: {
      200: jsonResponse("Logged out", logoutResponseSchema),
      401: unauthorizedResponse,
      500: internalErrorResponse,
    },
  });

  registry.registerPath({
    method: "post",
    path: "/eventsub",
    summary: "Twitch EventSub callback",
    responses: {
      200: textResponse("Challenge verification response"),
      204: emptyResponse,
      400: validationErrorResponse,
      403: textResponse("Invalid EventSub signature"),
      500: internalErrorResponse,
    },
  });

  registry.registerPath({
    method: "get",
    path: "/api/status",
    summary: "Get Discord bot status",
    security: authSecurity,
    responses: {
      200: jsonResponse("Bot status", statusResponseSchema),
      401: unauthorizedResponse,
    },
  });

  registry.registerPath({
    method: "get",
    path: "/api/notifications/web-push/public-key",
    summary: "Get Web Push public key",
    security: authSecurity,
    responses: {
      200: jsonResponse("Web Push public key", publicKeyResponseSchema),
      401: unauthorizedResponse,
    },
  });

  registry.registerPath({
    method: "get",
    path: "/api/notifications/channels",
    summary: "Get enabled notification channels",
    security: authSecurity,
    responses: {
      200: jsonResponse(
        "Notification channel state",
        notificationChannelsResponseSchema,
      ),
      401: unauthorizedResponse,
    },
  });

  registry.registerPath({
    method: "post",
    path: "/api/notifications/channels",
    summary: "Set a notification channel's opt-in preference",
    security: authSecurity,
    request: {
      body: jsonBody(setChannelPreferenceSchema),
    },
    responses: {
      200: jsonResponse("Preference updated", setChannelPreferenceResponseSchema),
      400: validationErrorResponse,
      401: unauthorizedResponse,
      404: notFoundResponse,
    },
  });

  registry.registerPath({
    method: "post",
    path: "/api/notifications/web-push/subscriptions",
    summary: "Save Web Push subscription",
    security: authSecurity,
    request: {
      body: jsonBody(savePushSubscriptionSchema),
    },
    responses: {
      201: jsonResponse("Save result", savePushResponseSchema),
      // Covers both a Zod validation failure and this route's own rejection
      // of a structurally valid but unusable subscription - both now throw
      // the same AppError-shaped 400, see errorHandler.ts.
      400: validationErrorResponse,
      401: unauthorizedResponse,
      409: conflictResponse,
    },
  });

  registry.registerPath({
    method: "delete",
    path: "/api/notifications/web-push/subscriptions",
    summary: "Delete Web Push subscription",
    security: authSecurity,
    request: {
      query: deletePushSubscriptionQuerySchema,
    },
    responses: {
      200: jsonResponse("Delete result", deletePushResponseSchema),
      400: validationErrorResponse,
      401: unauthorizedResponse,
    },
  });

  registry.registerPath({
    method: "get",
    path: "/api/user-count",
    summary: "Get Discord DM-enabled user count",
    security: authSecurity,
    responses: {
      200: jsonResponse("User count", userCountResponseSchema),
      401: unauthorizedResponse,
    },
  });

  registry.registerPath({
    method: "post",
    path: "/api/can-receive-dm",
    summary:
      "Re-check and persist whether the authenticated user can receive Discord DMs",
    security: authSecurity,
    responses: {
      200: jsonResponse("DM capability", canReceiveDmResponseSchema),
      401: unauthorizedResponse,
    },
  });

  registry.registerPath({
    method: "get",
    path: "/api/streamers/search",
    summary: "Search Twitch streamers",
    security: authSecurity,
    request: {
      query: searchStreamersQuerySchema,
    },
    responses: {
      200: jsonResponse(
        "Search results",
        z.array(streamerSummaryResponseSchema),
      ),
      400: validationErrorResponse,
      401: unauthorizedResponse,
    },
  });

  registry.registerPath({
    method: "post",
    path: "/api/streamers/info",
    summary: "Get Twitch streamer info",
    security: authSecurity,
    request: {
      body: jsonBody(batchStreamerInfoSchema),
    },
    responses: {
      200: jsonResponse(
        "Streamer info",
        z.array(trackedStreamerSummaryResponseSchema),
      ),
      400: validationErrorResponse,
      401: unauthorizedResponse,
      404: notFoundResponse,
    },
  });

  registry.registerPath({
    method: "post",
    path: "/api/subscriptions",
    summary: "Subscribe to a streamer",
    security: authSecurity,
    request: {
      body: jsonBody(subscribeSchema),
    },
    responses: {
      201: jsonResponse("Subscribe result", subscribeResponseSchema),
      400: validationErrorResponse,
      401: unauthorizedResponse,
      404: notFoundResponse,
      409: conflictResponse,
    },
  });

  registry.registerPath({
    method: "delete",
    path: "/api/subscriptions",
    summary: "Unsubscribe from a streamer",
    security: authSecurity,
    request: {
      query: subscribeSchema,
    },
    responses: {
      200: jsonResponse("Unsubscribe result", unsubscribeResponseSchema),
      400: validationErrorResponse,
      401: unauthorizedResponse,
      404: notFoundResponse,
    },
  });

  registry.registerPath({
    method: "post",
    path: "/api/subscriptions/set-message",
    summary: "Set custom notification message",
    security: authSecurity,
    request: {
      body: jsonBody(setMessageSchema),
    },
    responses: {
      200: jsonResponse(
        "Update subscription result",
        updateSubscriptionResponseSchema,
      ),
      400: validationErrorResponse,
      401: unauthorizedResponse,
      404: notFoundResponse,
    },
  });

  registry.registerPath({
    method: "get",
    path: "/login-failed",
    summary: "OAuth failure redirect",
    responses: {
      302: redirectResponse,
    },
  });
}
