import { describe, expect, it } from "vitest";

import {
  verifyEventSubSignature,
  type VerifyEventSubSignatureOptions,
} from "../../../../../modules/twitch/eventsub/EventSubSignatureVerifier.js";
import { signEventSubMessage } from "../../../../helpers/eventSub.js";

const SECRET = "twitch-webhook-secret";
const MESSAGE_ID = "message-1";
const BODY = JSON.stringify({ subscription: { type: "stream.online" } });

const TEN_MINUTES_MS = 10 * 60 * 1000;

/**
 * Builds a genuinely signed message. Tests tamper with the returned fields to
 * simulate what an attacker controls *after* Twitch signed the payload.
 */
function signedMessage(timestamp = new Date().toISOString()) {
  return {
    secret: SECRET,
    messageId: MESSAGE_ID,
    timestamp,
    body: BODY,
    signature: signEventSubMessage({
      secret: SECRET,
      messageId: MESSAGE_ID,
      timestamp,
      body: BODY,
    }),
  } satisfies VerifyEventSubSignatureOptions;
}

function agedMessage(ageMs: number) {
  return signedMessage(new Date(Date.now() - ageMs).toISOString());
}

describe("verifyEventSubSignature", () => {
  it("accepts a correctly signed, recent message", () => {
    expect(verifyEventSubSignature(signedMessage())).toBe(true);
  });

  it("rejects a tampered body", () => {
    expect(
      verifyEventSubSignature({ ...signedMessage(), body: `${BODY} ` }),
    ).toBe(false);
  });

  it("rejects a tampered message id", () => {
    expect(
      verifyEventSubSignature({ ...signedMessage(), messageId: "message-2" }),
    ).toBe(false);
  });

  it("rejects a signature produced with a different secret", () => {
    expect(
      verifyEventSubSignature({ ...signedMessage(), secret: "another-secret" }),
    ).toBe(false);
  });

  it("rejects a malformed signature of the wrong length", () => {
    expect(
      verifyEventSubSignature({
        ...signedMessage(),
        signature: "sha256=deadbeef",
      }),
    ).toBe(false);
  });

  it("rejects an empty signature", () => {
    expect(verifyEventSubSignature({ ...signedMessage(), signature: "" })).toBe(
      false,
    );
  });

  it("rejects a signature of the right length but wrong digest", () => {
    const { signature, ...message } = signedMessage();
    const flipped = signature.endsWith("0")
      ? `${signature.slice(0, -1)}1`
      : `${signature.slice(0, -1)}0`;

    expect(verifyEventSubSignature({ ...message, signature: flipped })).toBe(
      false,
    );
  });

  it("accepts a message just inside the freshness window", () => {
    expect(verifyEventSubSignature(agedMessage(TEN_MINUTES_MS - 5_000))).toBe(
      true,
    );
  });

  it("rejects a message older than ten minutes", () => {
    expect(verifyEventSubSignature(agedMessage(TEN_MINUTES_MS + 1_000))).toBe(
      false,
    );
  });

  it("rejects a message timestamped too far in the future", () => {
    expect(verifyEventSubSignature(agedMessage(-TEN_MINUTES_MS - 1_000))).toBe(
      false,
    );
  });

  it.each(["", "not-a-timestamp", "2024-13-45T99:99:99Z"])(
    "rejects the unparseable timestamp %j",
    (timestamp) => {
      expect(verifyEventSubSignature(signedMessage(timestamp))).toBe(false);
    },
  );
});
