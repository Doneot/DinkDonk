export interface ReplayStore {
  /**
   * Attempts to reserve a message ID.
   *
   * Returns true if this is the first time the ID has been seen.
   * Returns false if the ID already exists and has not expired.
   */
  rememberIfNew(messageId: string): Promise<boolean>;

  /**
   * Releases a previously-reserved message ID. Used when dispatching the
   * notification for that ID failed outright, so Twitch's redelivery of the
   * same message can actually be reprocessed instead of being silently
   * treated as an already-handled duplicate.
   */
  forget(messageId: string): Promise<void>;
}
