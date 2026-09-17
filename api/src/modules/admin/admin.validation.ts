import { z } from "zod";

export const listUsersQuerySchema = z.object({
  status: z.enum(["all", "active", "inactive", "admin"]).default("all"),
  search: z.string().trim().min(1).max(200).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export const updateUserSchema = z.object({
  isActive: z.boolean().optional(),
  role: z.enum(["USER", "ADMIN"]).optional(),
});

export const listAuditLogsQuerySchema = z.object({
  action: z.enum(["CREATE", "UPDATE", "DELETE", "RESTORE", "LOGIN", "LOGOUT", "LOGIN_FAILED"]).optional(),
  entityType: z.string().trim().min(1).max(40).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export const updateSystemSettingSchema = z.object({
  value: z.unknown(),
});
