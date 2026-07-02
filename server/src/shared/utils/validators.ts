export function isNonEmptyString(value: string): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

export function normalizeTwitchLogin(login: string): string {
  return isNonEmptyString(login) ? login.trim().toLowerCase() : "";
}
