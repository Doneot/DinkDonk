import type { User } from "../../../domain/User.js";
import type { UserRecord } from "../records/UserRecord.js";

export function toUser(id: string, record: UserRecord): User {
  return {
    id,
    subscriptions: record.subscriptions,
    canReceiveDM: record.canReceiveDM,
    notificationPreferences: record.notificationPreferences,
  };
}
