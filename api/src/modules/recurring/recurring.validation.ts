import { z } from "zod";
import { transactionTypeSchema } from "../categories/categories.validation.js";
import { paymentMethodSchema, recurrenceFrequencySchema } from "../transactions/transactions.validation.js";

export const listRecurringQuerySchema = z.object({
  type: z.union([transactionTypeSchema, z.literal("all")]).default("all"),
});

export const createRecurringSchema = z.object({
  categoryId: z.string().uuid(),
  type: transactionTypeSchema,
  title: z.string().trim().min(1).max(120),
  amount: z.number().positive("Amount must be greater than zero"),
  paymentMethod: paymentMethodSchema.default("UPI"),
  frequency: recurrenceFrequencySchema,
  startDate: z.coerce.date(),
  endDate: z.coerce.date().nullable().optional(),
  autoGenerate: z.boolean().default(true),
  remindersEnabled: z.boolean().default(true),
  remindBeforeDays: z.number().int().min(0).max(30).default(1),
});

export const updateRecurringSchema = z.object({
  title: z.string().trim().min(1).max(120).optional(),
  amount: z.number().positive().optional(),
  paymentMethod: paymentMethodSchema.optional(),
  endDate: z.coerce.date().nullable().optional(),
  autoGenerate: z.boolean().optional(),
  remindersEnabled: z.boolean().optional(),
  remindBeforeDays: z.number().int().min(0).max(30).optional(),
  isPaused: z.boolean().optional(),
});
