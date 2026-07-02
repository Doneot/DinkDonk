import request from "supertest";
import type { Express, NextFunction, Request, Response } from "express";

import type { AuthUser } from "../../modules/auth/domain/AuthUser.js";
import type { Repositories } from "../../app/container/repositories.js";

import { getCookie } from "./cookies.js";

const CSRF_COOKIE = "__Host-csrf";
const CSRF_HEADER = "x-csrf-token";

export class TestClient {
  public readonly agent;

  private csrfToken?: string;
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
    await this.initialize();
    return this.agent.post(path).set(CSRF_HEADER, this.csrfToken!);
  }

  public async put(path: string) {
    await this.initialize();
    return this.agent.put(path).set(CSRF_HEADER, this.csrfToken!);
  }

  public async patch(path: string) {
    await this.initialize();
    return this.agent.patch(path).set(CSRF_HEADER, this.csrfToken!);
  }

  public async delete(path: string) {
    await this.initialize();
    return this.agent.delete(path).set(CSRF_HEADER, this.csrfToken!);
  }

  // -------------------------
  // CSRF INITIALIZATION
  // -------------------------
  private async initialize(): Promise<void> {
    if (this.initialized) return;

    const response = await this.agent.get("/api/status");

    this.csrfToken = getCookie(response, CSRF_COOKIE);

    this.initialized = true;
  }
}
