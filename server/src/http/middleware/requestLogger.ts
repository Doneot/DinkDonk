import type { IncomingMessage, ServerResponse } from "node:http";

import { pinoHttp } from "pino-http";

import { logger } from "../../shared/logger/logger.js";

type RequestWithContext = IncomingMessage & {
  id?: string | number | object;
  method?: string;
  originalUrl?: string;
  path?: string;
  requestId?: string;
};

export const requestLogger = pinoHttp<RequestWithContext, ServerResponse>({
  logger,

  genReqId(req): string | number | object {
    return req.requestId ?? "";
  },

  customLogLevel(_req, res, error): "error" | "warn" | "info" {
    if (error || res.statusCode >= 500) {
      return "error";
    }

    if (res.statusCode >= 400) {
      return "warn";
    }

    return "info";
  },

  customProps(req, res) {
    return {
      requestId: req.requestId,
      method: req.method,
      path: req.originalUrl ?? req.path ?? req.url,
      status: res.statusCode,
    };
  },

  serializers: {
    req(req: RequestWithContext) {
      return {
        id: req.id,
        method: req.method,
        path: req.originalUrl ?? req.path ?? req.url,
      };
    },

    res(res: ServerResponse) {
      return {
        statusCode: res.statusCode,
      };
    },
  },
});
