import { z } from "zod";

import { envOrSecret } from "../utils/secrets.js";

export const booleanFromEnv = z
  .string()
  .optional()
  .transform((value) => {
    if (value === undefined) {
      return false;
    }

    return ["1", "true", "yes", "on"].includes(value.toLowerCase());
  });

export const numberFromEnv = (defaultValue: number) =>
  z.coerce.number().default(defaultValue);

export const secretFromEnv = (secretName: string) =>
  z.preprocess(
    (value) => envOrSecret(value as string | undefined, secretName),
    z.string().min(1),
  );

// Chaining `.optional()` onto secretFromEnv(...) doesn't work: Zod's
// ZodOptional inspects the raw (pre-preprocess) input for undefined and
// discards whatever the preprocess step produced, which would silently skip
// the Docker-secret-file fallback whenever the env var itself is unset (the
// common case for a mounted secret). Building the optional inner schema
// directly into the same preprocess step keeps the fallback intact.
export const optionalSecretFromEnv = (secretName: string) =>
  z.preprocess(
    (value) => envOrSecret(value as string | undefined, secretName),
    z.string().min(1).optional(),
  );
