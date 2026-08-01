import type { SocketServer } from "../../../realtime/socketServer.js";
import type { UserRepository } from "../ports/UserRepository.js";

import { logger } from "../../../shared/logger/logger.js";

// A fatal onSnapshot error (auth expiry, network blip) terminates the
// underlying listener stream permanently - retry after a short, fixed delay
// rather than leaving realtime broadcasting silently dead until the process
// restarts. This is a rare failure mode, so a fixed delay (rather than a
// full backoff scheme) is sufficient.
const LISTENER_RETRY_DELAY_MS = 5000;

export class UserChangeBroadcaster {
  private unsubscribe: (() => void) | null = null;

  // Distinguishes an intentional stop() from the listener dying on its own,
  // so a retry scheduled just before stop() is called doesn't resurrect it.
  private stopped = true;

  constructor(
    private readonly users: UserRepository,
    private readonly socketServer: SocketServer,
  ) {}

  start(): void {
    this.stopped = false;

    if (this.unsubscribe) {
      return;
    }

    this.unsubscribe = this.users.watchUsers(
      (user) => {
        this.socketServer.notifyUser(user.id, "user_data_updated", user);
      },
      (error) => {
        logger.error({ error }, "User change listener failed");

        // Without this, a later start() call is a no-op against a dead
        // listener (the re-entry guard above sees a stale, non-null
        // unsubscribe), silently and permanently stopping realtime
        // broadcasting.
        this.unsubscribe = null;

        if (!this.stopped) {
          setTimeout(() => {
            if (!this.stopped) {
              this.start();
            }
          }, LISTENER_RETRY_DELAY_MS).unref();
        }
      },
    );
  }

  stop(): void {
    this.stopped = true;

    this.unsubscribe?.();

    this.unsubscribe = null;
  }
}
