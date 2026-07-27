import { describe, expect, it } from "vitest";

import { BadRequestError } from "../../../../../http/errors/BadRequestError.js";
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
    "throws BadRequestError for malformed JSON %j",
    (raw) => {
      expect(() => parseEventSubJson(raw)).toThrow(BadRequestError);
      expect(() => parseEventSubJson(raw)).toThrow("Invalid JSON");
    },
  );
});
