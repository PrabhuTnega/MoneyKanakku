import { z } from "zod";

export const listNotificationsQuerySchema = z.object({
  status: z.enum(["all", "unread"]).default("all"),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export const registerDeviceSchema = z.object({
  platform: z.enum(["IOS", "ANDROID", "WEB"]),
  pushToken: z.string().trim().min(1).max(500),
});
