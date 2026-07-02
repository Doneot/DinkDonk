import { z } from "zod";

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
