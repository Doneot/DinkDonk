import type { Subscription } from "../../subscriptions/domain/Subscription.js";

export type UserUpdate = {
  canReceiveDM?: boolean;
  subscriptions?: Subscription[];
};
