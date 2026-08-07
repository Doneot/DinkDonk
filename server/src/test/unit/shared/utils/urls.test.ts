import { afterEach, describe, expect, it } from "vitest";

import { env } from "../../../../shared/config/env.js";
import { dashboardUrl } from "../../../../shared/utils/urls.js";

afterEach(() => {
  env.isProduction = false;
});

describe("dashboardUrl", () => {
  it("points at the local dev server outside production", () => {
    expect(dashboardUrl()).toBe("http://localhost:5000/dashboard");
  });

  it("points at the public server url in production", () => {
    env.isProduction = true;

    expect(dashboardUrl()).toBe(`${env.serverUrl}/dashboard`);
  });
});
