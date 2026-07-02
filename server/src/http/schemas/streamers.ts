import { z } from "zod";
import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";

extendZodWithOpenApi(z);

export const streamerIdSchema = z.string().trim().min(1).max(64);

export const searchStreamersQuerySchema = z.object({
  query: z.string().trim().min(1).max(100),
});

export type SearchStreamerRequest = z.infer<typeof searchStreamersQuerySchema>;

export const batchStreamerInfoSchema = z.object({
  ids: z.array(streamerIdSchema).min(1).max(50),
});

export type BatchStreamerInfoRequest = z.infer<typeof batchStreamerInfoSchema>;
