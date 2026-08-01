import { EventSubValidationError } from "./EventSubValidationError.js";

export function parseEventSubJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    throw new EventSubValidationError("Invalid JSON");
  }
}
