import type { Request } from "express";
import type { z } from "zod";
import { prisma } from "../../lib/prisma.js";
import { Errors } from "../../lib/app-error.js";
import { advanceDate } from "../../lib/recurrence.js";
import type { listTransactionsQuerySchema, createTransactionSchema, updateTransactionSchema } from "./transactions.validation.js";

function monthRange(month?: string) {
  if (!month) return undefined;
  const start = new Date(month + "T00:00:00.000Z");
  const end = new Date(start);
  end.setUTCMonth(end.getUTCMonth() + 1);
  return { gte: start, lt: end };
}

/** Inclusive [from, to] date range — `to` is bumped to the START of the
 * NEXT day so a same-day range (from === to) still matches everything
 * recorded on that day, not just exact midnight. */
function fromToRange(from?: string, to?: string) {
  if (!from && !to) return undefined;
  const range: { gte?: Date; lt?: Date } = {};
  if (from) range.gte = new Date(from + "T00:00:00.000Z");
  if (to) {
    const end = new Date(to + "T00:00:00.000Z");
    end.setUTCDate(end.getUTCDate() + 1);
    range.lt = end;
  }
  return range;
}

export async function listTransactions(userId: string, query: z.infer<typeof listTransactionsQuerySchema>) {
  // An explicit from/to range (reports.html's Monthly tab date pickers)
  // takes precedence over `month`, which can only ever express one whole
  // calendar month.
  const dateFilter = query.from || query.to ? fromToRange(query.from, query.to) : monthRange(query.month);

  const where = {
    userId,
    deletedAt: null,
    ...(query.type !== "all" ? { type: query.type } : {}),
    ...(query.categoryId ? { categoryId: query.categoryId } : {}),
    ...(dateFilter ? { transactionDate: dateFilter } : {}),
    ...(query.search ? { description: { contains: query.search, mode: "insensitive" as const } } : {}),
  };

  const [items, total] = await Promise.all([
    prisma.transaction.findMany({
      where,
      include: { category: { select: { id: true, name: true, icon: true, color: true } } },
      orderBy: { transactionDate: "desc" },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    prisma.transaction.count({ where }),
  ]);

  return { items, total, page: query.page, pageSize: query.pageSize };
}

export async function getTransaction(userId: string, id: string) {
  const transaction = await prisma.transaction.findFirst({
    where: { id, userId, deletedAt: null },
    include: { category: true, attachments: true, recurringTransaction: { select: { id: true, title: true, frequency: true } } },
  });
  if (!transaction) throw Errors.notFound("Transaction");
  return transaction;
}

export async function createTransaction(userId: string, input: z.infer<typeof createTransactionSchema>, req: Request) {
  const category = await prisma.category.findFirst({
    where: { id: input.categoryId, OR: [{ userId }, { userId: null }], transactionType: input.type },
  });
  if (!category) throw Errors.validation("Category not found for this transaction type.");

  const transaction = await prisma.$transaction(async (tx) => {
    let recurringTransactionId: string | undefined;

    if (input.recurringFrequency) {
      const rule = await tx.recurringTransaction.create({
        data: {
          userId,
          categoryId: input.categoryId,
          type: input.type,
          paymentMethod: input.paymentMethod,
          title: input.description?.slice(0, 120) || category.name,
          amount: input.amount,
          frequency: input.recurringFrequency,
          startDate: input.transactionDate,
          nextDueDate: advanceDate(input.transactionDate, input.recurringFrequency),
        },
      });
      recurringTransactionId = rule.id;
    }

    return tx.transaction.create({
      data: {
        userId,
        categoryId: input.categoryId,
        type: input.type,
        amount: input.amount,
        paymentMethod: input.paymentMethod,
        transactionDate: input.transactionDate,
        description: input.description,
        isRecurring: !!recurringTransactionId,
        recurringTransactionId,
      },
      include: { category: { select: { id: true, name: true, icon: true, color: true } } },
    });
  });

  await prisma.auditLog.create({
    data: { userId, action: "CREATE", entityType: "Transaction", entityId: transaction.id, newValues: input, ipAddress: req.ip },
  });

  return transaction;
}

export async function updateTransaction(userId: string, id: string, input: z.infer<typeof updateTransactionSchema>, req: Request) {
  const existing = await prisma.transaction.findFirst({ where: { id, userId, deletedAt: null } });
  if (!existing) throw Errors.notFound("Transaction");

  const updated = await prisma.transaction.update({ where: { id }, data: input });
  await prisma.auditLog.create({
    data: {
      userId,
      action: "UPDATE",
      entityType: "Transaction",
      entityId: id,
      oldValues: { amount: existing.amount, categoryId: existing.categoryId, description: existing.description },
      newValues: input,
      ipAddress: req.ip,
    },
  });
  return updated;
}

/** Soft delete — FRS: deleted transactions must not compromise historical
 * audit integrity, so this never issues a hard DELETE. */
export async function deleteTransaction(userId: string, id: string, req: Request) {
  const existing = await prisma.transaction.findFirst({ where: { id, userId, deletedAt: null } });
  if (!existing) throw Errors.notFound("Transaction");

  await prisma.transaction.update({ where: { id }, data: { deletedAt: new Date() } });
  await prisma.auditLog.create({
    data: { userId, action: "DELETE", entityType: "Transaction", entityId: id, oldValues: { amount: existing.amount, description: existing.description }, ipAddress: req.ip },
  });
}

export async function restoreTransaction(userId: string, id: string, req: Request) {
  const existing = await prisma.transaction.findFirst({ where: { id, userId, NOT: { deletedAt: null } } });
  if (!existing) throw Errors.notFound("Deleted transaction");

  const restored = await prisma.transaction.update({ where: { id }, data: { deletedAt: null } });
  await prisma.auditLog.create({
    data: { userId, action: "RESTORE", entityType: "Transaction", entityId: id, ipAddress: req.ip },
  });
  return restored;
}

/** Backs the dashboard's Income vs Expense card + budget hero — one round
 * trip for both totals, matching db/queries/dashboard.sql's query #2. */
export async function monthSummary(userId: string, month: string) {
  const range = monthRange(month)!;
  const rows = await prisma.transaction.groupBy({
    by: ["type"],
    where: { userId, deletedAt: null, transactionDate: range },
    _sum: { amount: true },
    _count: true,
  });

  const income = rows.find((r) => r.type === "INCOME");
  const expense = rows.find((r) => r.type === "EXPENSE");
  const totalIncome = Number(income?._sum.amount ?? 0);
  const totalExpense = Number(expense?._sum.amount ?? 0);

  return {
    totalIncome,
    totalExpense,
    netSavings: totalIncome - totalExpense,
    incomeCount: income?._count ?? 0,
    expenseCount: expense?._count ?? 0,
  };
}
