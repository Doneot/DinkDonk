import crypto from "node:crypto";

import type { Request, Response, NextFunction } from "express";

import { env } from "../../shared/config/env.js";

import { UnauthorizedError } from "../errors/UnauthorizedError.js";

type AppRequest = Omit<Request, "cookies" | "signedCookies"> & {
  cookies: Record<string, string | undefined>;
  signedCookies: Record<string, string | undefined>;
};

const COOKIE_NAME = "__Host-csrf";
const HEADER_NAME = "x-csrf-token";

export const ensureCsrfCookie = (
  req: AppRequest,
  res: Response,
  next: NextFunction,
): void => {
  if (!req.user) {
    next();
    return;
  }

  if (!req.cookies?.[COOKIE_NAME]) {
    res.cookie(COOKIE_NAME, crypto.randomBytes(32).toString("base64url"), {
      secure: env.isProduction,
      sameSite: "lax",

      httpOnly: false,

      path: "/",
    });
  }

  next();
};

export const verifyCsrf = (
  req: AppRequest,
  _res: Response,
  next: NextFunction,
): void => {
  if (
    req.method === "GET" ||
    req.method === "HEAD" ||
    req.method === "OPTIONS"
  ) {
    next();
    return;
  }

  const cookieHeader = req.cookies?.[COOKIE_NAME];
  const headerToken = req.get(HEADER_NAME);

  if (!cookieHeader || !headerToken) {
    throw new UnauthorizedError("Invalid CSRF token");
  }

  const cookie = Buffer.from(cookieHeader);
  const header = Buffer.from(headerToken);

  if (!crypto.timingSafeEqual(cookie, header)) {
    throw new UnauthorizedError("Invalid CSRF token");
  }

  next();
};
