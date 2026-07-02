import { Counter, Registry, collectDefaultMetrics } from "prom-client";

export const register = new Registry();

collectDefaultMetrics({
  register,
});

function createCounter(name: string, help: string): Counter<string> {
  return new Counter({
    name,
    help,
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

export const subscriptionsCreatedTotal = createCounter(
  "subscriptions_created_total",
  "Subscriptions created",
);

export const subscriptionsDeletedTotal = createCounter(
  "subscriptions_deleted_total",
  "Subscriptions deleted",
);

export const discordDmChecksTotal = createCounter(
  "discord_dm_checks_total",
  "Discord DM checks",
);
