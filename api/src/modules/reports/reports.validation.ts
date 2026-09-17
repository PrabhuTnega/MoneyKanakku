import { z } from "zod";
import { transactionTypeSchema } from "../categories/categories.validation.js";

export const monthQuerySchema = z.object({
  month: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "month must be YYYY-MM-01"),
});

export const categoryReportQuerySchema = z.object({
  month: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  type: transactionTypeSchema,
});

export const yearQuerySchema = z.object({
  year: z.coerce.number().int().min(2000).max(2100),
});
