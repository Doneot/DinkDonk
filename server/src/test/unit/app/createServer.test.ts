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
    bindSocketNotifier: vi.fn(),
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

    // createServer() attaches Express to httpServer itself now (it must
    // happen before the socket server is constructed - see the comment in
    // server.ts), so no manual .on("request", ...) is needed here.
    const { default: request } = await import("supertest");

    await request(server.httpServer).get("/health/live").expect(200);

    await server.sockets.close();
    server.httpServer.close();
  });

  it("attaches Express as engine.io's sole delegated listener rather than a redundant second one", async () => {
    // The precise, fast discriminator for the bug this file's other tests
    // guard against: if Express were attached after createSocketServer()
    // (the previous, broken ordering), engine.io's attach() would have
    // snapshotted an empty listener list, and Express would end up
    // registered as its own independent second "request" listener instead
    // of being folded into engine.io's delegation - every request would
    // then run through BOTH listeners. A request-based test can only
    // observe the fallout of that (a hang, a corrupted response) and,
    // depending on timing, might not reliably do even that - this asserts
    // directly on the listener count instead, which is deterministic and
    // needs no supertest round trip.
    const server = setup();

    expect(server.httpServer.listenerCount("request")).toBe(1);

    await server.sockets.close();
    server.httpServer.close();
  });

  it("shares one session middleware between the app and the sockets", async () => {
    const server = setup();

    const { default: request } = await import("supertest");

    const response = await request(server.httpServer)
      .get("/socket.io/?EIO=4&transport=polling")
      .expect(200);

    expect(response.text).toContain("sid");

    await server.sockets.close();
    server.httpServer.close();
  });

  it("still routes ordinary HTTP requests through Express once the socket server is attached", async () => {
    // Regression test for a real bug: socket.io's engine.io.attach() snapshots
    // httpServer's existing "request" listeners at attach time to delegate
    // non-matching paths back to. If Express were attached after the socket
    // server (the previous, broken ordering), that snapshot would be empty
    // and Express would end up registered as an independent second listener
    // instead - every request would then be handled twice. This exercises a
    // non-socket.io path through the real httpServer + createServer()
    // composition (not just createApp() in isolation via supertest, which
    // can't observe this class of wiring bug at all) after a socket.io
    // request has already been made, to catch exactly that regression.
    const server = setup();

    const { default: request } = await import("supertest");

    await request(server.httpServer)
      .get("/socket.io/?EIO=4&transport=polling")
      .expect(200);

    await request(server.httpServer).get("/health/live").expect(200);

    await server.sockets.close();
    server.httpServer.close();
  });
});
