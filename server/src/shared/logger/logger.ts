import pino from "pino";

import { env } from "../config/env.js";

export const logger = pino(
  !env.isProduction
    ? {
        redact: {
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
        },
        transport: {
          target: "pino-pretty",
          options: {
            colorize: true,
          },
        },
      }
    : {
        redact: {
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
        },
      },
);
