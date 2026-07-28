import pino from "pino";

import { env } from "../config/env.js";

const redact = {
  paths: [
    "accessToken",
    "refreshToken",
    "token",
    "authorization",
    "cookie",
    "*.accessToken",
    "*.refreshToken",
    "*.token",
    "*.authorization",
    "*.cookie",
  ],
  censor: "[REDACTED]",
};

export const logger = pino(
  !env.isProduction
    ? {
        redact,
        transport: {
          target: "pino-pretty",
          options: {
            colorize: true,
          },
        },
      }
    : {
        redact,
      },
);
