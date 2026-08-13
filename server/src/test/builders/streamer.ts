import type { Streamer } from "../../modules/streamers/domain/Streamer.js";
import { TEST_STREAMER_ID } from "../constants.js";

/**
 * `users` is a test-only convenience carried alongside the `Streamer` domain
 * shape so tests can seed which users are subscribed to a streamer in one
 * call (mirroring Firestore's `subscribers` subcollection). It isn't part of
 * the production `Streamer` type.
 */
export function buildStreamer(
  overrides: Partial<Streamer> & { users?: string[] } = {},
): Streamer & { users: string[] } {
  return {
    id: TEST_STREAMER_ID,
    isLive: false,
    liveSince: null,
    users: [],
    ...overrides,
  };
}
