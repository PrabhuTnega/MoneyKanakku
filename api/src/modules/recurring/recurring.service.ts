import type { Request } from "express";
import type { z } from "zod";
import { prisma } from "../../lib/prisma.js";
import { Errors } from "../../lib/app-error.js";
import { advanceDate } from "../../lib/recurrence.js";
import type { createRecurringSchema, updateRecurringSchema } from "./recurring.validation.js";

export async function listRecurring(userId: string, type: "EXPENSE" | "INCOME" | "all") {
  return prisma.recurringTransaction.findMany({
    where: { userId, deletedAt: null, ...(type !== "all" ? { type } : {}) },
    include: { category: { select: { id: true, name: true, icon: true, color: true } } },
    orderBy: { nextDueDate: "asc" },
  });
}

export async function createRecurring(userId: string, input: z.infer<typeof createRecurringSchema>, req: Request) {
  const category = await prisma.category.findFirst({
    where: { id: input.categoryId, transactionType: input.type, OR: [{ userId }, { userId: null }] },
  });
  if (!category) throw Errors.validation("Category not found for this transaction type.");

  const rule = await prisma.recurringTransaction.create({
    data: { ...input, userId, nextDueDate: input.startDate },
  });
  await prisma.auditLog.create({
    data: { userId, action: "CREATE", entityType: "RecurringTransaction", entityId: rule.id, newValues: input, ipAddress: req.ip },
  });
  return rule;
}

export async function updateRecurring(userId: string, id: string, input: z.infer<typeof updateRecurringSchema>, req: Request) {
  const existing = await prisma.recurringTransaction.findFirst({ where: { id, userId, deletedAt: null } });
  if (!existing) throw Errors.notFound("Recurring rule");

  const updated = await prisma.recurringTransaction.update({ where: { id }, data: input });
  await prisma.auditLog.create({
    data: { userId, action: "UPDATE", entityType: "RecurringTransaction", entityId: id, oldValues: { isPaused: existing.isPaused, amount: existing.amount }, newValues: input, ipAddress: req.ip },
  });
  return updated;
}

export async function deleteRecurring(userId: string, id: string, req: Request) {
  const existing = await prisma.recurringTransaction.findFirst({ where: { id, userId, deletedAt: null } });
  if (!existing) throw Errors.notFound("Recurring rule");

  await prisma.recurringTransaction.update({ where: { id }, data: { deletedAt: new Date() } });
  await prisma.auditLog.create({
    data: { userId, action: "DELETE", entityType: "RecurringTransaction", entityId: id, ipAddress: req.ip },
  });
}

/**
 * The daily scheduler job (FRS 4.6). No real cron process exists yet, so
 * this is exposed as an admin-triggerable endpoint for now — see
 * db/queries/recurring_scheduler.sql, which this mirrors exactly in logic:
 * find every due, non-paused, auto-generating rule; create a Transaction
 * for it; roll nextDueDate forward; and raise a reminder Notification for
 * anything inside its own remind-before window.
 */
export async function runScheduler() {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  const dueRules = await prisma.recurringTransaction.findMany({
    where: {
      deletedAt: null,
      isPaused: false,
      autoGenerate: true,
      nextDueDate: { lte: today },
      OR: [{ endDate: null }, { endDate: { gte: today } }],
    },
  });

  let generated = 0;
  for (const rule of dueRules) {
    await prisma.$transaction([
      prisma.transaction.create({
        data: {
          userId: rule.userId,
          categoryId: rule.categoryId,
          type: rule.type,
          paymentMethod: rule.paymentMethod,
          amount: rule.amount,
          transactionDate: rule.nextDueDate,
          description: rule.title,
          isRecurring: true,
          recurringTransactionId: rule.id,
        },
      }),
      prisma.recurringTransaction.update({
        where: { id: rule.id },
        data: { nextDueDate: advanceDate(rule.nextDueDate, rule.frequency) },
      }),
    ]);
    generated++;
  }

  const reminderWindow = await prisma.recurringTransaction.findMany({
    where: { deletedAt: null, isPaused: false, remindersEnabled: true },
  });
  let reminders = 0;
  for (const rule of reminderWindow) {
    const remindFrom = new Date(rule.nextDueDate);
    remindFrom.setUTCDate(remindFrom.getUTCDate() - rule.remindBeforeDays);
    if (remindFrom > today || rule.nextDueDate < today) continue;

    const alreadyReminded = await prisma.notification.findFirst({
      where: { userId: rule.userId, relatedEntityType: "RecurringTransaction", relatedEntityId: rule.id, createdAt: { gte: today } },
    });
    if (alreadyReminded) continue;

    await prisma.notification.create({
      data: {
        userId: rule.userId,
        type: rule.type === "INCOME" ? "INCOME_RECEIVED" : "RECURRING_REMINDER",
        title: `${rule.title} due soon`,
        message: `Your recurring "${rule.title}" of ₹${Number(rule.amount).toLocaleString()} is due on ${rule.nextDueDate.toDateString()}.`,
        relatedEntityType: "RecurringTransaction",
        relatedEntityId: rule.id,
      },
    });
    reminders++;
  }

  return { rulesScanned: dueRules.length, transactionsGenerated: generated, remindersSent: reminders };
}
