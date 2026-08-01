export interface Subscription {
  id: string;

  notification_message: string;
}

// A soft product limit, not a hard technical one - it exists so a runaway
// subscriptions array fails predictably with a clear error well before it
// could ever approach Firestore's 1 MiB document-size ceiling (which would
// otherwise fail with an opaque Firestore error). Domain-level (rather than
// living in a specific repository implementation) since both
// FirestoreUserRepository and InMemoryUserRepository must enforce it
// identically on write, not just retroactively validate it on read.
export const MAX_SUBSCRIPTIONS = 200;
