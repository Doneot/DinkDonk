import type { User as AppUser } from "./user.js";

declare global {
  namespace Express {
    // eslint-disable-next-line @typescript-eslint/no-empty-object-type
    interface User extends AppUser {
      // empty on purpose
    }
  }
}

export {};
