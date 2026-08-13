import request from "supertest";
import { describe, expect, it } from "vitest";

import { createApiRouter } from "../../../http/routes/apiRoutes.js";
import { errorResponseSchema } from "../../../http/schemas/responses.js";
import { StreamerLiveStateService } from "../../../modules/streamers/application/StreamerLiveStateService.js";
import { createTestApp, TEST_WEB_PUSH_PUBLIC_KEY } from "../../helpers/createTestApp.js";
import { createTestContainer } from "../../helpers/createTestContainer.js";

type RouterStack = {
  stack: Array<{
    route?: {
      path: string;
      methods: Record<string, boolean>;
    };
  }>;
};

/**
 * Derived from the router's own stack rather than hand-maintained, so a
 * newly added route is automatically checked instead of silently missing an
 * authorization test.
 */
function protectedRoutes(): [string, string][] {
  const container = createTestContainer();

  const router = createApiRouter({
    repositories: container.repositories,
    twitch: container.twitch,
    discord: container.discord,
    ensureFreshToken: (_req, _res, next) => next(),
    webPushPublicKey: TEST_WEB_PUSH_PUBLIC_KEY,
    services: {
      streamerLiveState: new StreamerLiveStateService(
        container.repositories.streamers,
        () => {},
      ),
    },
  }) as unknown as RouterStack;

  return router.stack
    .filter(
      (layer): layer is { route: NonNullable<(typeof layer)["route"]> } =>
        Boolean(layer.route),
    )
    .flatMap((layer) =>
      Object.keys(layer.route.methods).map(
        (method): [string, string] => [method, `/api${layer.route.path}`],
      ),
    );
}

describe("API authorization", () => {
  it("rejects unauthenticated API requests", async () => {
    const { app } = await createTestApp({ authenticated: false });

    const response = await request(app).get("/api/status").expect(401);

    expect(errorResponseSchema.parse(response.body)).toEqual({
      error: "unauthorized",
      message: "Unauthorized",
    });
  });

  it.each(protectedRoutes())(
    "requires authentication for %s %s",
    async (method, path) => {
      const { app } = await createTestApp({ authenticated: false });

      const send = (
        request(app) as unknown as Record<string, (path: string) => request.Test>
      )[method];

      if (!send) {
        throw new Error(`Unsupported HTTP method: ${method}`);
      }

      await send(path).expect(401);
    },
  );

  it("allows an authenticated request through to the route", async () => {
    const { app } = await createTestApp();

    await request(app).get("/api/status").expect(200);
  });
});
