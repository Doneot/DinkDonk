export interface ReplayStore {
  /**
   * Attempts to reserve a message ID.
   *
   * Returns true if this is the first time the ID has been seen.
   * Returns false if the ID already exists and has not expired.
   */
  rememberIfNew(messageId: string): Promise<boolean>;
}
