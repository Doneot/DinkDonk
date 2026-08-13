import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import axios, { type InternalAxiosRequestConfig } from "axios";
import { toast } from "react-toastify";
import api from "../client";

vi.mock("react-toastify", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

function respondWith401(config: InternalAxiosRequestConfig) {
  return new axios.AxiosError(
    "Request failed with status code 401",
    "ERR_BAD_REQUEST",
    config,
    {},
    { status: 401, statusText: "Unauthorized", headers: {}, config, data: {} },
  );
}

function respondWith500(config: InternalAxiosRequestConfig) {
  return new axios.AxiosError(
    "Request failed with status code 500",
    "ERR_BAD_RESPONSE",
    config,
    {},
    { status: 500, statusText: "Internal Server Error", headers: {}, config, data: {} },
  );
}

// The global 401 interceptor (api.interceptors.response.use in client.ts)
// only runs when a request actually flows through this axios instance, so
// these tests replace the transport (api.defaults.adapter) rather than
// calling the interceptor callback directly.
describe("shared/api/client 401 interceptor", () => {
  const originalLocation = window.location;
  let assignMock: ReturnType<typeof vi.fn>;

  // jsdom's real window.location.assign is a non-configurable method, so it
  // can't be vi.spyOn'd directly - the whole `location` is swapped for a
  // plain stand-in instead, which jsdom does allow redefining.
  function setLocation(pathname: string) {
    assignMock = vi.fn();
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { ...originalLocation, pathname, assign: assignMock },
    });
  }

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    Object.defineProperty(window, "location", {
      configurable: true,
      value: originalLocation,
    });
    api.defaults.adapter = undefined;
  });

  it("toasts and redirects home on a 401, when not already on /", async () => {
    setLocation("/dashboard");
    api.defaults.adapter = vi.fn((config: InternalAxiosRequestConfig) =>
      Promise.reject(respondWith401(config)),
    );

    await expect(api.get("/subscriptions")).rejects.toBeInstanceOf(axios.AxiosError);

    expect(toast.error).toHaveBeenCalledWith("Session expired. Please log in again.");
    expect(assignMock).toHaveBeenCalledWith("/");
  });

  it("does not redirect again when already on /", async () => {
    setLocation("/");
    api.defaults.adapter = vi.fn((config: InternalAxiosRequestConfig) =>
      Promise.reject(respondWith401(config)),
    );

    await expect(api.get("/subscriptions")).rejects.toBeInstanceOf(axios.AxiosError);

    expect(toast.error).toHaveBeenCalledWith("Session expired. Please log in again.");
    expect(assignMock).not.toHaveBeenCalled();
  });

  it("does not toast or redirect for a 401 from the auth status check itself", async () => {
    setLocation("/dashboard");
    api.defaults.adapter = vi.fn((config: InternalAxiosRequestConfig) =>
      Promise.reject(respondWith401(config)),
    );

    await expect(api.get("/auth/user")).rejects.toBeInstanceOf(axios.AxiosError);

    expect(toast.error).not.toHaveBeenCalled();
    expect(assignMock).not.toHaveBeenCalled();
  });

  it("passes non-401 errors through without toasting or redirecting", async () => {
    setLocation("/dashboard");
    api.defaults.adapter = vi.fn((config: InternalAxiosRequestConfig) =>
      Promise.reject(respondWith500(config)),
    );

    await expect(api.get("/subscriptions")).rejects.toBeInstanceOf(axios.AxiosError);

    expect(toast.error).not.toHaveBeenCalled();
    expect(assignMock).not.toHaveBeenCalled();
  });
});
