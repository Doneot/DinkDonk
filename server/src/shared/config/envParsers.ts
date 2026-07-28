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
