import { logger } from "../shared/logger/logger.js";

import type { Container } from "./container/index.js";

export function configureEventSubscriptions({
  repositories,
  services,
  twitch,
}: Container): void {
  // Both the streamer and subscription repositories share the same event
  // bus (see createRepositories), so registering here catches a streamer
  // created through either one.
  repositories.subscriptions.events.on("streamerAdded", (event) => {
    return services.eventSubSync.handleStreamerAdded(event.streamerId);
  });

  repositories.subscriptions.events.on("streamerEmpty", (event) => {
    return services.subscriptionCleanup.garbageCollectStreamer(
      event.streamerId,
    );
  });

  twitch.on("ready", () =>
    services.eventSubSync
      .syncEventSubSubscriptions()
      .then(() => services.subscriptionCleanup.garbageCollectSubscriptions())
      .catch((error: unknown) => {
        logger.error({ error }, 'Failed to handle Twitch "ready" event');
      }),
  );

  twitch.on("tokenRefreshed", () =>
    services.eventSubSync.syncEventSubSubscriptions().catch((error: unknown) => {
      logger.error({ error }, 'Failed to handle Twitch "tokenRefreshed" event');
    }),
  );
}
