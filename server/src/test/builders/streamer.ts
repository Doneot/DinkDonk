import type { Streamer } from "../../modules/streamers/domain/Streamer.js";

import { TEST_STREAMER_ID } from "../constants.js";

export function buildStreamer(overrides: Partial<Streamer> = {}): Streamer {
  return {
    id: TEST_STREAMER_ID,
    users: [],
    ...overrides,
  };
}
