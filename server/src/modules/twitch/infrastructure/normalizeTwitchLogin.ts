import { isNonEmptyString } from "../../../shared/utils/validators.js";

export function normalizeTwitchLogin(login: string): string {
  return isNonEmptyString(login) ? login.trim().toLowerCase() : "";
}
