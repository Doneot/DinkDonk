export function assertDefined<T>(value: T | null | undefined, name: string): T {
  if (value === undefined || value === null) {
    throw new Error(`Missing value: ${name}`);
  }
  return value;
}
