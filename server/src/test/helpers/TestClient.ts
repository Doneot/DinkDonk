import request from "supertest";
import type { Express, NextFunction, Request, Response } from "express";

import type { SessionUser } from "../../modules/auth/domain/Identity.js";
import type { Repositories } from "../../app/container/repositories.js";

export class TestClient {
  public readonly agent;

  private initialized = false;

  private authUser?: SessionUser | undefined;

  public constructor(
    public readonly app: Express,
    public readonly repositories: Repositories,
  ) {
    this.agent = request.agent(app);
    this.installAuthMiddleware();
  }

  // -------------------------
  // AUTH
  // -------------------------
  private installAuthMiddleware(): void {
    this.app.use((req: Request, _res: Response, next: NextFunction) => {
      if (this.authUser) {
        req.user = this.authUser;
      }

      next();
    });
  }

  public setAuthUser(user: SessionUser | undefined): void {
    this.authUser = user;
  }

  public clearAuth(): void {
    this.authUser = undefined;
  }

  // -------------------------
  // REQUEST HELPERS
  // -------------------------
  public get(path: string) {
    return this.agent.get(path);
  }

  // These return supertest's request builder (itself awaitable) so callers can
  // keep chaining `.send()` / `.query()` / `.expect()` before the request fires.
  public post(path: string) {
    return this.agent.post(path);
  }

  public put(path: string) {
    return this.agent.put(path);
  }

  public patch(path: string) {
    return this.agent.patch(path);
  }

  public delete(path: string) {
    return this.agent.delete(path);
  }
}
