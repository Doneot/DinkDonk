import type {
  DiscordCredential,
  GoogleCredential,
  Identity,
  TwitchCredential,
} from "../domain/Identity.js";

export interface IdentityRepository {
  checkConnection(): Promise<void>;

  getIdentity(uid: string): Promise<Identity | null>;

  /**
   * Resolves a Discord profile to this app's uid and persists the given
   * credential, creating a new identity (or linking onto an existing one
   * found by verified email) if none exists yet. Returns the resulting
   * identity so the caller doesn't need a separate getIdentity round trip.
   */
  upsertDiscordIdentity(
    profile: DiscordCredential,
    email: string | null,
    emailVerified: boolean,
  ): Promise<Identity>;

  /**
   * Links a Discord profile onto an already-authenticated account (e.g. a
   * "Connect Discord" button in account settings), as opposed to
   * upsertDiscordIdentity's login-time behavior of resolving the target
   * account by matching verified email - this is precisely for the case
   * where the Discord account's email doesn't match the signed-in account's,
   * so that automatic matching wouldn't have linked them. Throws
   * ConflictError if this Discord account is already linked to a different
   * uid.
   *
   * Backfills the account's own email/emailVerified from this Discord
   * profile only when it doesn't already have one - an account that already
   * has an established email keeps it, since overwriting it here could also
   * silently reassign an identityLinks/email:* index entry already claimed by
   * a different account onto this one.
   */
  linkDiscordIdentity(
    uid: string,
    profile: DiscordCredential,
    email: string | null,
    emailVerified: boolean,
  ): Promise<Identity>;

  /**
   * Merges a partial Discord credential patch (e.g. rotated tokens) into an
   * existing identity, without touching its other fields.
   */
  updateDiscordCredential(
    uid: string,
    patch: Partial<
      Pick<DiscordCredential, "accessToken" | "refreshToken" | "fetchTime">
    >,
  ): Promise<void>;

  /**
   * Resolves a Google profile to this app's uid and persists the given
   * credential, creating a new identity (or linking onto an existing one
   * found by verified email) if none exists yet. Returns the resulting
   * identity so the caller doesn't need a separate getIdentity round trip.
   */
  upsertGoogleIdentity(
    profile: GoogleCredential,
    email: string,
    emailVerified: boolean,
  ): Promise<Identity>;

  /**
   * Resolves a Twitch profile to this app's uid and persists the given
   * credential, creating a new identity (or linking onto an existing one
   * found by verified email) if none exists yet. Unlike Google, Twitch may
   * not return an email at all (only present when the account itself has
   * a verified email and the user:read:email scope was granted), so email
   * is nullable here - matching upsertDiscordIdentity's signature rather
   * than upsertGoogleIdentity's.
   */
  upsertTwitchIdentity(
    profile: TwitchCredential,
    email: string | null,
    emailVerified: boolean,
  ): Promise<Identity>;
}
