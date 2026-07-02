import { BadRequestError } from "../../../http/errors/BadRequestError.js";

export function parseEventSubJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    throw new BadRequestError("Invalid JSON");
  }
}
