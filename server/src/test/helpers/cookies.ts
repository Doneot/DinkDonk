import type { Response } from "supertest";

export type HttpHeaders = Record<string, string | string[] | undefined>;

export function getCookie(response: Response, name: string): string {
  const headers = response.headers as HttpHeaders;

  const setCookie = headers["set-cookie"];

  if (!Array.isArray(setCookie)) {
    throw new Error("Expected Set-Cookie header.");
  }

  const cookie = setCookie.find((value) => value.startsWith(`${name}=`));

  if (cookie === undefined) {
    throw new Error(`Missing cookie '${name}'.`);
  }

  const [pair] = cookie.split(";");

  if (pair === undefined) {
    throw new Error(`Failed parsing cookie '${name}'.`);
  }

  const value = pair.slice(name.length + 1);

  if (value.length === 0) {
    throw new Error(`Cookie '${name}' has no value.`);
  }

  return value;
}
