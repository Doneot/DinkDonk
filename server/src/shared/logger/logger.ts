import pino from "pino";

import { env } from "../config/env.js";

// fast-redact (which pino uses under the hood) only wildcards one path
// segment at a time, so nested occurrences need an explicit entry per
// depth. Two levels covers every shape actually logged in this codebase
// (e.g. `{ user: { accessToken } }`); add another level here if a future
// log call nests these fields deeper. fast-redact paths are also
// case-sensitive with no case-insensitive mode, so both the camelCase form
// used in code and any all-lowercase variant that might show up in a raw
// header/body blob are listed explicitly.
const SENSITIVE_FIELDS = [
  "accessToken",
  "refreshToken",
  "token",
  "authorization",
  "cookie",
  "password",
  "clientSecret",
  "client_secret",
  "webhookSecret",
  "sessionSecret",
  "session_secret",
  "encryptionKey",
  "encryption_key",
  "privateKey",
  "private_key",
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
        level: env.logLevel,
        redact,
        transport: {
          target: "pino-pretty",
          options: {
            colorize: true,

            // pino-pretty normally runs on a separate worker thread, writing
            // asynchronously - shutdown.ts's logger.flush() before
            // process.exit() doesn't reliably wait for that worker to finish
            // draining its queue, so the final lines of a graceful shutdown
            // ("Shutting down gracefully"/"Shutdown complete") can go
            // missing from the container's log output. Synchronous writes
            // cost throughput dev logging doesn't need, in exchange for
            // never losing the log lines that matter most: the ones right
            // before the process exits.
            sync: true,
          },
        },
      }
    : {
        level: env.logLevel,
        redact,
      },
);
