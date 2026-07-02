import "express-session";

declare module "express-session" {
  interface SessionData {
    canReceiveDM?: boolean;
    passport?: {
      user?: {
        id?: string;
      };
    };
  }
}
