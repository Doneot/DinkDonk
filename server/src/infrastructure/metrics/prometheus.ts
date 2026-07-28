import { Counter, Histogram, Registry, collectDefaultMetrics } from "prom-client";

export const register = new Registry();

collectDefaultMetrics({
  register,
});

function createCounter(
  name: string,
  help: string,
  labelNames: string[] = [],
): Counter<string> {
  return new Counter({
    name,
    help,
    labelNames,
    registers: [register],
  });
}

export const eventSubRequestsTotal = createCounter(
  "eventsub_requests_total",
  "Total EventSub requests received",
);

export const eventSubSignatureFailuresTotal = createCounter(
  "eventsub_signature_failures_total",
  "Invalid EventSub signatures",
);

export const eventSubDuplicateMessagesTotal = createCounter(
  "eventsub_duplicate_messages_total",
  "Duplicate EventSub messages",
);

export const eventSubSubscriptionsCreatedTotal = createCounter(
  "eventsub_subscriptions_created_total",
  "Twitch EventSub subscriptions created",
);

export const eventSubSubscriptionsDeletedTotal = createCounter(
  "eventsub_subscriptions_deleted_total",
  "Twitch EventSub subscriptions deleted",
);

export const discordDmChecksTotal = createCounter(
  "discord_dm_checks_total",
  "Discord DM checks",
);

export const streamerSubscriptionsTotal = createCounter(
  "streamer_subscriptions_total",
  "Users subscribing to or unsubscribing from a streamer",
  ["action"],
);

export const notificationsSentTotal = createCounter(
  "notifications_sent_total",
  "Streamer-live notifications attempted per channel",
  ["channel", "result"],
);

export const httpRequestDurationSeconds = new Histogram({
  name: "http_request_duration_seconds",
  help: "HTTP request duration in seconds",
  labelNames: ["method", "route", "status_code"],
  registers: [register],
});
