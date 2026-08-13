import type { PushSubscription } from "../../modules/notifications/domain/PushSubscription.js";
import type { User } from "../../modules/users/domain/User.js";
import type { TestContainer } from "../helpers/createTestContainer.js";

export type TestState = {
  users?: User[];

  streamers?: Array<{
    id: string;
  }>;

  subscriptions?: Array<{
    userId: string;
    streamerId: string;
    notificationMessage?: string;
  }>;

  pushSubscriptions?: Array<{
    userId: string;
    subscription: PushSubscription;
  }>;
};

export async function seedState(
  { repositories }: TestContainer,
  state?: TestState,
): Promise<void> {
  if (!state) {
    return;
  }

  for (const user of state.users ?? []) {
    await repositories.users.updateUser(user.id, user);
  }

  for (const streamer of state.streamers ?? []) {
    await repositories.streamers.createStreamer(streamer.id);
  }

  for (const subscription of state.subscriptions ?? []) {
    await repositories.users.subscribe(
      subscription.userId,
      subscription.streamerId,
      subscription.notificationMessage ?? "",
    );
  }

  for (const pushSubscription of state.pushSubscriptions ?? []) {
    const { endpoint, keys } = pushSubscription.subscription.subscription;

    await repositories.pushSubscriptions.savePushSubscription(
      pushSubscription.userId,
      {
        endpoint,
        keys,
      },
      pushSubscription.subscription.userAgent
        ? {
            userAgent: pushSubscription.subscription.userAgent,
          }
        : undefined,
    );
  }
}
