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
