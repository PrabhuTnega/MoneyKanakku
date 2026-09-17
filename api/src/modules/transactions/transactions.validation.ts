import { z } from "zod";
import { transactionTypeSchema } from "../categories/categories.validation.js";

export const paymentMethodSchema = z.enum(["UPI", "CARD", "CASH", "NETBANKING", "WALLET", "OTHER"]);
export const recurrenceFrequencySchema = z.enum(["WEEKLY", "MONTHLY", "YEARLY"]);

export const listTransactionsQuerySchema = z.object({
  type: z.union([transactionTypeSchema, z.literal("all")]).default("all"),
  categoryId: z.string().uuid().optional(),
  // First-of-month date, e.g. 2026-09-01 — matches Budget.monthYear's shape,
  // so a dashboard/report period selector can reuse the same value for both.
  month: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  // Arbitrary inclusive date range (reports.html's Monthly tab transaction
  // list + export, which lets a user pick "Aug 15 to Nov 3" — not
  // expressible with `month`, which is always a whole calendar month).
  // Takes precedence over `month` when both are present.
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  search: z.string().trim().min(1).max(200).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export const createTransactionSchema = z.object({
  categoryId: z.string().uuid(),
  type: transactionTypeSchema,
  amount: z.number().positive("Amount must be greater than zero"),
  paymentMethod: paymentMethodSchema.default("UPI"),
  transactionDate: z.coerce.date(),
  description: z.string().trim().max(500).optional(),
  // If present, also creates a RecurringTransaction rule starting from this
  // transaction — matches expense-form.html's "Mark as recurring" toggle,
  // which only exposes a frequency (the rule reuses this transaction's own
  // date/amount/category/description as its template).
  recurringFrequency: recurrenceFrequencySchema.optional(),
});

export const updateTransactionSchema = z.object({
  categoryId: z.string().uuid().optional(),
  amount: z.number().positive().optional(),
  paymentMethod: paymentMethodSchema.optional(),
  transactionDate: z.coerce.date().optional(),
  description: z.string().trim().max(500).optional(),
});
