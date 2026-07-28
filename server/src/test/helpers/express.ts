import type { NextFunction, Request, Response } from "express";

export type MockRequestInit = {
  method?: string;
  originalUrl?: string;
  body?: unknown;
  query?: unknown;
  params?: unknown;
  headers?: Record<string, string>;
  user?: Express.User | undefined;
  requestId?: string;
};

export type MockRequest = Request & {
  logoutCalls: number;
  sessionDestroyCalls: number;
};

/**
 * Minimal Express request double for middleware unit tests.
 *
 * Only the surface the middleware under test touches is implemented; anything
 * else stays undefined so accidental coupling shows up as a failure.
 */
export function createMockRequest(init: MockRequestInit = {}): MockRequest {
  const headers = init.headers ?? {};

  const request = {
    method: init.method ?? "GET",
    originalUrl: init.originalUrl ?? "/",
    body: init.body ?? {},
    query: init.query ?? {},
    params: init.params ?? {},
    headers,
    validated: { body: {}, query: {} },
    user: init.user,
    requestId: init.requestId ?? "request-id",
    logoutCalls: 0,
    sessionDestroyCalls: 0,

    get(name: string): string | undefined {
      return headers[name.toLowerCase()];
    },

    header(name: string): string | undefined {
      return headers[name.toLowerCase()];
    },

    logout(callback: (error?: Error) => void): void {
      request.logoutCalls += 1;
      callback();
    },

    session: {
      destroy(callback: (error?: Error) => void): void {
        request.sessionDestroyCalls += 1;
        callback();
      },
    },
  } as unknown as MockRequest;

  return request;
}

export type MockResponse = Response & {
  statusCode: number;
  jsonBody: unknown;
  sentBody: unknown;
  sentStatus: number | undefined;
  redirectedTo: string | undefined;
  clearedCookies: string[];
  headers: Record<string, string>;
  sentContentType: string | undefined;
};

export function createMockResponse(): MockResponse {
  const response = {
    statusCode: 200,
    jsonBody: undefined,
    sentBody: undefined,
    sentStatus: undefined,
    redirectedTo: undefined,
    clearedCookies: [] as string[],
    headers: {} as Record<string, string>,
    sentContentType: undefined,

    status(code: number): MockResponse {
      response.statusCode = code;
      return response;
    },

    json(payload: unknown): MockResponse {
      response.jsonBody = payload;
      return response;
    },

    send(payload: unknown): MockResponse {
      response.sentBody = payload;
      return response;
    },

    sendStatus(code: number): MockResponse {
      response.statusCode = code;
      response.sentStatus = code;
      return response;
    },

    type(value: string): MockResponse {
      response.sentContentType = value;
      return response;
    },

    setHeader(name: string, value: string): MockResponse {
      response.headers[name] = value;
      return response;
    },

    redirect(location: string): void {
      response.redirectedTo = location;
    },

    clearCookie(name: string): MockResponse {
      response.clearedCookies.push(name);
      return response;
    },
  } as unknown as MockResponse;

  return response;
}

export type NextRecorder = NextFunction & {
  calls: unknown[];
};

export function createNext(): NextRecorder {
  const calls: unknown[] = [];

  const next = ((error?: unknown) => {
    calls.push(error);
  }) as NextRecorder;

  next.calls = calls;

  return next;
}
