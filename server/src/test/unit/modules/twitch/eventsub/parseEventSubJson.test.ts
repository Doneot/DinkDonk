import { describe, expect, it } from "vitest";

import { EventSubValidationError } from "../../../../../modules/twitch/eventsub/EventSubValidationError.js";
import { parseEventSubJson } from "../../../../../modules/twitch/eventsub/parseEventSubJson.js";

describe("parseEventSubJson", () => {
  it("parses a JSON object", () => {
    expect(parseEventSubJson('{"challenge":"abc"}')).toEqual({
      challenge: "abc",
    });
  });

  it.each(["null", "42", '"text"', "[]"])(
    "parses the non-object JSON value %s",
    (raw) => {
      expect(() => parseEventSubJson(raw)).not.toThrow();
    },
  );

  it.each(["", "{", "{'challenge': 'abc'}", "undefined"])(
    "throws EventSubValidationError for malformed JSON %j",
    (raw) => {
      expect(() => parseEventSubJson(raw)).toThrow(EventSubValidationError);
      expect(() => parseEventSubJson(raw)).toThrow("Invalid JSON");
    },
  );
});
