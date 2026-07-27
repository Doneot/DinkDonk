import { expect } from "vitest";

/**
 * Vitest's asymmetric matchers are typed `any`, which trips the project's
 * no-unsafe-assignment rule when they appear inside object literals. These
 * wrappers narrow them to `unknown`, which `toMatchObject` accepts.
 */
export const anyString = expect.any(String) as unknown;

export const anyNumber = expect.any(Number) as unknown;

export const anyValue = expect.anything() as unknown;

export function stringContaining(value: string): unknown {
  return expect.stringContaining(value) as unknown;
}

export function arrayContaining(values: unknown[]): unknown {
  return expect.arrayContaining(values) as unknown;
}
