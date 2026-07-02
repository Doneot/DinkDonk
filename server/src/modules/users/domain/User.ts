import type { Subscription } from "../../subscriptions/domain/Subscription.js";

export interface User {
  canReceiveDM?: boolean;

  id: string;

  subscriptions: Subscription[];
}
