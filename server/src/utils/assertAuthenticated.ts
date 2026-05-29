import type { Request } from "express";

import type { User } from "../types/user.js";

export function assertAuthenticated(req: Request): asserts req is Request & {
  user: User;
} {
  if (!req.user) {
    throw new Error("Expected authenticated user");
  }
}
