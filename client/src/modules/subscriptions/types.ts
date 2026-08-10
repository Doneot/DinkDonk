// Client-only view-model types layered on top of the backend contract
// (shared/types/api.ts) - not part of what the server sends over the wire.
import type { Subscription } from "../../shared/types/api";

export interface StreamerProfile {
  name: string;
  avatar: string;
  isLive: boolean;
  liveSince: string | null;
}

export interface EnrichedSubscription extends Subscription {
  name: string;
  avatar: string;
  isHydrated: boolean;
  isLive: boolean;
  liveSince: string | null;
}
