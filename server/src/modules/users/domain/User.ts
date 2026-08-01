import type { Subscription } from "./Subscription.js";

export interface User {
  canReceiveDM?: boolean;

  id: string;

  subscriptions: Subscription[];
}
