import crypto from "node:crypto";

const MAX_EVENTSUB_MESSAGE_AGE_MS = 10 * 60 * 1000;

export type VerifyEventSubSignatureOptions = {
  secret: string;
  messageId: string;
  timestamp: string;
  signature: string;
  body: string;
};

export function verifyEventSubSignature({
  secret,
  messageId,
  timestamp,
  signature,
  body,
}: VerifyEventSubSignatureOptions): boolean {
  const sentAt = Date.parse(timestamp);

  // An unparseable timestamp yields NaN, and every NaN comparison is false,
  // which would let the message slip past the freshness check entirely.
  if (Number.isNaN(sentAt)) {
    return false;
  }

  // Math.abs, not a one-sided check: a message timestamped in the future is
  // treated the same as a stale one. That's deliberate, not an oversight -
  // this check only bounds replay/staleness exposure as defense-in-depth,
  // and the HMAC below (keyed by a secret only Twitch and this server know)
  // is what actually gates authenticity; a forged message can't get further
  // by picking a future timestamp instead of a past one. Rejecting a
  // clock-skewed-but-genuine delivery symmetrically is the safer failure
  // mode of the two.
  const age = Math.abs(Date.now() - sentAt);

  if (age > MAX_EVENTSUB_MESSAGE_AGE_MS) {
    return false;
  }

  const message = `${messageId}${timestamp}${body}`;

  const expected = `sha256=${crypto
    .createHmac("sha256", secret)
    .update(message)
    .digest("hex")}`;

  const expectedBuffer = Buffer.from(expected);
  const signatureBuffer = Buffer.from(signature);

  if (expectedBuffer.length !== signatureBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(expectedBuffer, signatureBuffer);
}
