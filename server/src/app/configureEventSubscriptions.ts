import type { Container } from "./container/index.js";

export function configureEventSubscriptions({
  repositories,
  services,
  twitch,
}: Container): void {
  repositories.streamers.on("streamerAdded", (streamerId: string) => {
    return services.eventSubSync.handleStreamerAdded(streamerId);
  });

  repositories.subscriptions.on("streamerAdded", (streamerId: string) => {
    return services.eventSubSync.handleStreamerAdded(streamerId);
  });

  repositories.subscriptions.on("streamerEmpty", (streamerId: string) => {
    return services.subscriptionCleanup.garbageCollectStreamer(streamerId);
  });

  twitch.on("ready", () =>
    services.eventSubSync
      .syncEventSubSubscriptions()
      .then(() => services.subscriptionCleanup.garbageCollectSubscriptions()),
  );

  twitch.on("tokenRefreshed", () =>
    services.eventSubSync.syncEventSubSubscriptions(),
  );
}
