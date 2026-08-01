import type { Subscription } from "./Subscription.js";

export type UserUpdate = {
  canReceiveDM?: boolean;
  subscriptions?: Subscription[];
};
