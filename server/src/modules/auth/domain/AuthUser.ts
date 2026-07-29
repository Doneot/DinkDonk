export type AuthUser = {
  id: string;
  username: string;
  discriminator: string;
  avatar: string;
  accessToken: string;
  refreshToken: string;
  fetchTime: number;
};

// What actually lives on req.user for the duration of a request: nothing
// downstream reads OAuth tokens off the session user (createFreshTokenMiddleware
// re-fetches them from the repository whenever it needs them), so the tokens
// are stripped before req.user is populated - narrowing both the type and the
// live object shrinks the blast radius of an accidental `logger.info({ user:
// req.user })` or similar leaking a live token into logs.
export type SessionUser = Omit<AuthUser, "accessToken" | "refreshToken">;
