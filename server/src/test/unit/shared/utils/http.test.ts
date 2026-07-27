import http from "node:http";
import { describe, expect, it } from "vitest";

import { closeHttpServer } from "../../../../shared/utils/http.js";

function listen(server: http.Server): Promise<void> {
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve());
  });
}

describe("closeHttpServer", () => {
  it("resolves once a listening server is closed", async () => {
    const server = http.createServer();

    await listen(server);

    await expect(closeHttpServer(server)).resolves.toBeUndefined();

    expect(server.listening).toBe(false);
  });

  it("rejects when the server was never listening", async () => {
    const server = http.createServer();

    await expect(closeHttpServer(server)).rejects.toThrow(/not running/i);
  });
});
