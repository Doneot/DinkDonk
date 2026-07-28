export function isNonEmptyString(value: string): boolean {
  return typeof value === "string" && value.trim().length > 0;
}
