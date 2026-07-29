import "express-session";
import type { SessionUser } from "../../modules/auth/domain/AuthUser.js";

declare global {
  namespace Express {
    // eslint-disable-next-line @typescript-eslint/no-empty-object-type
    interface User extends SessionUser {}
  }
}

declare module "express-serve-static-core" {
  interface Request {
    requestId: string;

    validated: {
      body: unknown;
      query: unknown;
    };

    cookies: Record<string, string>;
    signedCookies: Record<string, string>;
  }
}
