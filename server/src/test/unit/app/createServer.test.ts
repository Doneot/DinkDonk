import { afterEach, describe, expect, it, vi } from "vitest";

import type { Container } from "../../../app/container/index.js";
import { createServer } from "../../../app/server.js";
import type { DiscordBot } from "../../../modules/discord/infrastructure/DiscordBot.js";
import type { StreamNotificationService } from "../../../modules/notifications/application/StreamNotificationService.js";
import type { TwitchProvider } from "../../../modules/twitch/application/TwitchProvider.js";

import { createTestContainer } from "../../helpers/createTestContainer.js";
import { FakeFirestore } from "../../helpers/fakeFirestore.js";

function setup() {
  const testContainer = createTestContainer();

  const container = {
    firestore: new FakeFirestore().asFirestore(),
    repositories: testContainer.repositories,
    twitch: { client: testContainer.twitch } as unknown as TwitchProvider,
    discord: testContainer.discord as unknown as DiscordBot,
    services: {
      streamNotification: {
        handleStreamOnline: vi.fn(),
      } as unknown as StreamNotificationService,
    },
  } as unknown as Container;

  return createServer(container);
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("createServer", () => {
  it("builds an http server, a socket server and the express app", async () => {
    const server = setup();

    expect(server.httpServer.listening).toBe(false);
    expect(server.sockets.io).toBeDefined();
    expect(typeof server.app).toBe("function");

    await server.sockets.close();
    server.httpServer.close();
  });

  it("serves the express app once it is attached to the http server", async () => {
    const server = setup();

    server.httpServer.on("request", server.app);

    const { default: request } = await import("supertest");

    await request(server.httpServer).get("/health/live").expect(200);

    await server.sockets.close();
    server.httpServer.close();
  });

  it("shares one session middleware between the app and the sockets", async () => {
    const server = setup();

    server.httpServer.on("request", server.app);

    const { default: request } = await import("supertest");

    const response = await request(server.httpServer)
      .get("/socket.io/?EIO=4&transport=polling")
      .expect(200);

    expect(response.text).toContain("sid");

    await server.sockets.close();
    server.httpServer.close();
  });
});
