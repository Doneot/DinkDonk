import pino from "pino";

import { env } from "../config/env.js";

// fast-redact (which pino uses under the hood) only wildcards one path
// segment at a time, so nested occurrences need an explicit entry per
// depth. Two levels covers every shape actually logged in this codebase
// (e.g. `{ user: { accessToken } }`); add another level here if a future
// log call nests these fields deeper.
const SENSITIVE_FIELDS = [
  "accessToken",
  "refreshToken",
  "token",
  "authorization",
  "cookie",
];

export const redact = {
  paths: SENSITIVE_FIELDS.flatMap((field) => [
    field,
    `*.${field}`,
    `*.*.${field}`,
  ]),
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
