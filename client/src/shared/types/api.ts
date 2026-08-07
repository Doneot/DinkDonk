// Mirrors the backend's response contracts (server/src/http/schemas/responses.ts).
// Kept as plain interfaces here rather than importing from server/ since the
// two packages aren't wired into a shared workspace - this is the boundary
// where the two sides agree on shape by convention, not by the compiler.

export type Provider = "discord" | "google" | "twitch";

export interface Subscription {
  id: string;
  notification_message?: string;
}

export interface User {
  id: string;
  email?: string | null;
  emailVerified?: boolean;
  name?: string;
  avatarUrl?: string | null;
  providers?: Provider[];
  canReceiveDM?: boolean;
  subscriptions?: Subscription[];
}

export interface StreamerSummary {
  id: string;
  name: string;
  avatar?: string;
}

export interface StatusResponse {
  online: boolean;
}

export interface UserCountResponse {
  count: number;
}

export interface CanReceiveDmResponse {
  canReceiveDM: boolean;
}

export interface PublicKeyResponse {
  publicKey: string;
}

export interface AuthProvidersResponse {
  providers: Provider[];
}
