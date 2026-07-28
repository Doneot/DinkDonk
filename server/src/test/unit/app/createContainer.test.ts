import { afterEach, describe, expect, it, vi } from "vitest";
import webpush from "web-push";

import type { Runtime } from "../../../app/runtime/Runtime.js";
import { FakeFirestore } from "../../helpers/fakeFirestore.js";

// createContainer's real composition root is otherwise only exercised in
// production; this smoke test catches a wiring mistake (e.g. a service
// constructed against the wrong repository instance) that unit tests against
// hand-rolled fakes (createTestContainer) can't see.
vi.mock("../../../shared/config/firebase.js", () => ({
  createFirestore: () => new FakeFirestore().asFirestore(),
}));

// The globally-seeded WEB_PUSH_* env vars are placeholder strings, not real
// VAPID keys, so the real WebPushNotificationChannel constructed inside
// createContainer would reject them. Override with a real key pair before
// env.ts (and everything that imports it) is first evaluated in this file's
// isolated module context.
const vapidKeys = webpush.generateVAPIDKeys();

process.env.WEB_PUSH_PUBLIC_KEY = vapidKeys.publicKey;
process.env.WEB_PUSH_PRIVATE_KEY = vapidKeys.privateKey;

// setupEnv.ts (a global setup file) already imported the logger, which
// imports env.ts, caching the env singleton with the placeholder WEB_PUSH_*
// values before this file's own code ran. Reset the module registry so env.ts
// (and everything that depends on it) re-evaluates against the overridden
// process.env above.
vi.resetModules();

const { createContainer } = await import("../../../app/container/index.js");

function fakeRuntime(): Runtime {
  return {
    publicUrl: "http://localhost:3000",
    dispose: vi.fn().mockResolvedValue(undefined),
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("createContainer", () => {
  it("shares one event bus between the streamer and subscription repositories", () => {
    const container = createContainer(fakeRuntime());

    expect(container.repositories.streamers.events).toBe(
      container.repositories.subscriptions.events,
    );
  });

  it("shares the streamer/subscription repositories between subscribing and reading subscribers", async () => {
    const container = createContainer(fakeRuntime());

    await container.repositories.subscriptions.subscribe(
      "user-1",
      "streamer-1",
    );

    await expect(
      container.repositories.streamers.getSubscriberIds("streamer-1"),
    ).resolves.toEqual(["user-1"]);
  });

  it("wires streamNotification against the container's own streamer repository", async () => {
    const container = createContainer(fakeRuntime());

    const getSubscriberIds = vi
      .spyOn(container.repositories.streamers, "getSubscriberIds")
      .mockResolvedValue([]);

    vi.spyOn(container.twitch.client, "getStreamer").mockResolvedValue({
      id: "streamer-1",
      login: "streamer",
      display_name: "Streamer",
    });

    await container.services.streamNotification.handleStreamOnline({
      broadcaster_user_id: "streamer-1",
      broadcaster_user_login: "streamer",
      broadcaster_user_name: "Streamer",
      type: "live",
      started_at: new Date().toISOString(),
    });

    expect(getSubscriberIds).toHaveBeenCalledWith("streamer-1");
  });

  it("wires eventSubSync against the container's own streamer repository", async () => {
    const container = createContainer(fakeRuntime());

    const getStreamers = vi
      .spyOn(container.repositories.streamers, "getStreamers")
      .mockResolvedValue([]);

    vi.spyOn(
      container.twitch.client,
      "getEventSubSubscriptions",
    ).mockResolvedValue([]);

    await container.services.eventSubSync.syncEventSubSubscriptions();

    expect(getStreamers).toHaveBeenCalledOnce();
  });

  it("wires subscriptionCleanup against the container's own streamer repository", async () => {
    const container = createContainer(fakeRuntime());

    const getSubscriberIds = vi
      .spyOn(container.repositories.streamers, "getSubscriberIds")
      .mockResolvedValue(["user-1"]);

    vi.spyOn(
      container.twitch.client,
      "getEventSubSubscriptions",
    ).mockResolvedValue([]);

    await container.services.subscriptionCleanup.garbageCollectStreamer(
      "streamer-1",
    );

    expect(getSubscriberIds).toHaveBeenCalledWith("streamer-1");
  });
});
