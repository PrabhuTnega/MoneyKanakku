import type { Request } from "express";
import type { z } from "zod";
import { prisma } from "../../lib/prisma.js";
import { Errors } from "../../lib/app-error.js";
import type { createBudgetSchema, updateBudgetSchema } from "./budgets.validation.js";

function statusFor(spent: number, budgetAmount: number, alertThresholdPercent: number): "safe" | "warn" | "danger" {
  if (spent >= budgetAmount) return "danger";
  if (spent >= budgetAmount * (alertThresholdPercent / 100)) return "warn";
  return "safe";
}

/**
 * Budgets are expense-only by product decision (see db/schema.prisma's
 * header note) — this never looks at INCOME transactions, matching FRS
 * §9's "Budget calculations shall use confirmed [i.e. non-deleted]
 * expenses only."
 */
export async function listBudgetsWithStatus(userId: string, month: string) {
  const monthStart = new Date(month + "T00:00:00.000Z");
  const monthEnd = new Date(monthStart);
  monthEnd.setUTCMonth(monthEnd.getUTCMonth() + 1);

  const [budgets, spendByCategory, overallSpend] = await Promise.all([
    prisma.budget.findMany({
      where: { userId, monthYear: monthStart },
      include: { category: { select: { id: true, name: true, icon: true, color: true } } },
    }),
    prisma.transaction.groupBy({
      by: ["categoryId"],
      where: { userId, type: "EXPENSE", deletedAt: null, transactionDate: { gte: monthStart, lt: monthEnd } },
      _sum: { amount: true },
    }),
    prisma.transaction.aggregate({
      where: { userId, type: "EXPENSE", deletedAt: null, transactionDate: { gte: monthStart, lt: monthEnd } },
      _sum: { amount: true },
    }),
  ]);

  const spendMap = new Map(spendByCategory.map((r) => [r.categoryId, Number(r._sum.amount ?? 0)]));
  const totalSpent = Number(overallSpend._sum.amount ?? 0);

  const withStatus = budgets.map((b) => {
    const spent = b.categoryId === null ? totalSpent : spendMap.get(b.categoryId) ?? 0;
    const amount = Number(b.amount);
    return {
      ...b,
      spent,
      percentUsed: amount > 0 ? Math.round((spent / amount) * 100) : 0,
      status: statusFor(spent, amount, b.alertThresholdPercent),
    };
  });

  return {
    overall: withStatus.find((b) => b.categoryId === null) ?? null,
    categories: withStatus.filter((b) => b.categoryId !== null),
  };
}

export async function createBudget(userId: string, input: z.infer<typeof createBudgetSchema>, req: Request) {
  if (input.categoryId) {
    const category = await prisma.category.findFirst({
      where: { id: input.categoryId, transactionType: "EXPENSE", OR: [{ userId }, { userId: null }] },
    });
    if (!category) throw Errors.validation("Budgets can only be set on an expense category.");
  }

  const monthYear = new Date(input.monthYear + "T00:00:00.000Z");
  const existing = await prisma.budget.findFirst({ where: { userId, categoryId: input.categoryId, monthYear } });
  if (existing) throw Errors.conflict("A budget already exists for this category and month — edit it instead.");

  const budget = await prisma.budget.create({ data: { ...input, userId, monthYear } });
  await prisma.auditLog.create({
    data: { userId, action: "CREATE", entityType: "Budget", entityId: budget.id, newValues: input, ipAddress: req.ip },
  });
  return budget;
}

export async function updateBudget(userId: string, id: string, input: z.infer<typeof updateBudgetSchema>, req: Request) {
  const existing = await prisma.budget.findFirst({ where: { id, userId } });
  if (!existing) throw Errors.notFound("Budget");

  const updated = await prisma.budget.update({ where: { id }, data: input });
  await prisma.auditLog.create({
    data: { userId, action: "UPDATE", entityType: "Budget", entityId: id, oldValues: { amount: existing.amount }, newValues: input, ipAddress: req.ip },
  });
  return updated;
}
