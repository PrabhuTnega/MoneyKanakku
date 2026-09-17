import { z } from "zod";

export const listBudgetsQuerySchema = z.object({
  month: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "month must be YYYY-MM-01"),
});

export const createBudgetSchema = z.object({
  categoryId: z.string().uuid().nullable().default(null),
  monthYear: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  amount: z.number().positive("Budget amount must be greater than zero"),
  alertThresholdPercent: z.number().int().min(1).max(100).default(80),
  repeatMonthly: z.boolean().default(true),
});

export const updateBudgetSchema = z.object({
  amount: z.number().positive().optional(),
  alertThresholdPercent: z.number().int().min(1).max(100).optional(),
  repeatMonthly: z.boolean().optional(),
});
