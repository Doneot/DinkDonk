/**
 * The subscriber-id-set for a streamer, shared between
 * InMemoryStreamerRepository and InMemoryUserRepository so they behave like
 * their Firestore counterparts, which both read/write the same
 * `streamers/{id}/subscribers` subcollection. Without this, subscribing
 * through one fake wouldn't be visible through the other - a gap the real
 * repositories don't have.
 */
export class InMemorySubscriberStore {
  private readonly subscribersByStreamer = new Map<string, Set<string>>();

  has(streamerId: string): boolean {
    return this.subscribersByStreamer.has(streamerId);
  }

  get(streamerId: string): string[] {
    return [...(this.subscribersByStreamer.get(streamerId) ?? [])];
  }

  /** Ensures a (possibly empty) subscriber set is tracked for this streamer. */
  ensure(streamerId: string): Set<string> {
    let subscribers = this.subscribersByStreamer.get(streamerId);

    if (!subscribers) {
      subscribers = new Set();
      this.subscribersByStreamer.set(streamerId, subscribers);
    }

    return subscribers;
  }

  delete(streamerId: string): void {
    this.subscribersByStreamer.delete(streamerId);
  }

  seed(streamerId: string, userIds: string[]): void {
    this.subscribersByStreamer.set(streamerId, new Set(userIds));
  }

  clear(): void {
    this.subscribersByStreamer.clear();
  }
}
