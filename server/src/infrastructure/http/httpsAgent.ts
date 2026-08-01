import https from "node:https";

// Node's default global HTTPS agent doesn't enable keepAlive, so every
// outbound Twitch Helix call (including the ones on the "streamer went
// live" hot path) paid for a fresh TCP+TLS handshake instead of reusing a
// pooled connection. Shared across every axios client that talks to Twitch
// so they all benefit from the same pool rather than each opening their own.
export const keepAliveHttpsAgent = new https.Agent({ keepAlive: true });
