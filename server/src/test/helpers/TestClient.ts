import request from "supertest";
import type { Express, NextFunction, Request, Response } from "express";

import type { AuthUser } from "../../modules/auth/domain/AuthUser.js";
import type { Repositories } from "../../app/container/repositories.js";

export class TestClient {
  public readonly agent;

  private initialized = false;

  private authUser?: AuthUser | undefined;

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

  public setAuthUser(user: AuthUser | undefined): void {
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

  public async post(path: string) {
    return this.agent.post(path);
  }

  public async put(path: string) {
    return this.agent.put(path);
  }

  public async patch(path: string) {
    return this.agent.patch(path);
  }

  public async delete(path: string) {
    return this.agent.delete(path);
  }
}
