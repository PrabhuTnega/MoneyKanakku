import type { Request } from "express";
import { prisma } from "../../lib/prisma.js";
import { Errors } from "../../lib/app-error.js";
import type { z } from "zod";
import type { listCategoriesQuerySchema, createCategorySchema, updateCategorySchema } from "./categories.validation.js";

/** A category name only has a DB-level unique constraint within its own
 * scope (`@@unique([userId, name, transactionType])` — see schema.prisma),
 * so nothing stops a user's own custom "Food" from coexisting with the
 * global "Food" they already see mixed into the same pickers/filters
 * everywhere in the app. That's confusing, not a real distinct category,
 * so block it explicitly at the name a user could actually collide with:
 * global categories plus (for a regular user) their own others. */
async function assertNameAvailable(
  name: string,
  transactionType: "EXPENSE" | "INCOME",
  scopeUserId: string | null,
  excludeCategoryId?: string
) {
  const existing = await prisma.category.findFirst({
    where: {
      transactionType,
      name: { equals: name, mode: "insensitive" },
      OR: scopeUserId === null ? [{ userId: null }] : [{ userId: null }, { userId: scopeUserId }],
      ...(excludeCategoryId ? { NOT: { id: excludeCategoryId } } : {}),
    },
  });
  if (existing) {
    throw Errors.validation(`An ${transactionType === "INCOME" ? "income" : "expense"} category named "${name}" already exists.`);
  }
}

export async function listCategories(userId: string, query: z.infer<typeof listCategoriesQuerySchema>) {
  const isActiveFilter = query.status === "all" ? {} : { isActive: query.status === "active" };
  const ownerFilter = query.scope === "global" ? { userId: null } : { OR: [{ userId: null }, { userId }] };

  return prisma.category.findMany({
    where: { transactionType: query.type, ...isActiveFilter, ...ownerFilter },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });
}

export async function createCustomCategory(userId: string, input: z.infer<typeof createCategorySchema>, req: Request) {
  await assertNameAvailable(input.name, input.transactionType, userId);
  const category = await prisma.category.create({
    data: { ...input, userId, type: "CUSTOM" },
  });
  await prisma.auditLog.create({
    data: { userId, action: "CREATE", entityType: "Category", entityId: category.id, newValues: input, ipAddress: req.ip },
  });
  return category;
}

export async function createGlobalCategory(adminUserId: string, input: z.infer<typeof createCategorySchema>, req: Request) {
  await assertNameAvailable(input.name, input.transactionType, null);
  const category = await prisma.category.create({
    data: { ...input, userId: null, type: "DEFAULT" },
  });
  await prisma.auditLog.create({
    data: { userId: adminUserId, action: "CREATE", entityType: "Category", entityId: category.id, newValues: input, ipAddress: req.ip },
  });
  return category;
}

export async function updateCategory(
  actingUser: { id: string; role: "USER" | "ADMIN" },
  categoryId: string,
  input: z.infer<typeof updateCategorySchema>,
  req: Request
) {
  const category = await prisma.category.findUnique({ where: { id: categoryId } });
  if (!category) throw Errors.notFound("Category");

  const ownsIt = category.userId === actingUser.id;
  const adminManagingGlobal = category.userId === null && actingUser.role === "ADMIN";
  if (!ownsIt && !adminManagingGlobal) throw Errors.forbidden("You can't edit this category.");

  if (input.name && input.name.toLowerCase() !== category.name.toLowerCase()) {
    await assertNameAvailable(input.name, category.transactionType, category.userId, categoryId);
  }

  const updated = await prisma.category.update({ where: { id: categoryId }, data: input });
  await prisma.auditLog.create({
    data: {
      userId: actingUser.id,
      action: "UPDATE",
      entityType: "Category",
      entityId: categoryId,
      oldValues: { name: category.name, icon: category.icon, color: category.color, isActive: category.isActive },
      newValues: input,
      ipAddress: req.ip,
    },
  });
  return updated;
}

export async function deleteCategory(
  actingUser: { id: string; role: "USER" | "ADMIN" },
  categoryId: string,
  req: Request
) {
  const category = await prisma.category.findUnique({ where: { id: categoryId } });
  if (!category) throw Errors.notFound("Category");

  const ownsIt = category.userId === actingUser.id;
  const adminManagingGlobal = category.userId === null && actingUser.role === "ADMIN";
  if (!ownsIt && !adminManagingGlobal) throw Errors.forbidden("You can't delete this category.");

  // Transaction/RecurringTransaction.category are onDelete: Restrict (by
  // design — a category vanishing shouldn't silently orphan financial
  // history), so check up front and give a clear, actionable message
  // instead of letting a raw FK violation surface as a 500. Counts include
  // soft-deleted transactions too, since those rows still hold the FK.
  const [txnCount, recurringCount] = await Promise.all([
    prisma.transaction.count({ where: { categoryId } }),
    prisma.recurringTransaction.count({ where: { categoryId } }),
  ]);
  if (txnCount > 0 || recurringCount > 0) {
    const parts = [];
    if (txnCount > 0) parts.push(`${txnCount} transaction${txnCount === 1 ? "" : "s"}`);
    if (recurringCount > 0) parts.push(`${recurringCount} recurring rule${recurringCount === 1 ? "" : "s"}`);
    throw Errors.conflict(`This category is used by ${parts.join(" and ")}. Deactivate it instead, or reassign those first.`);
  }

  // Budget.category is onDelete: Cascade — a leftover per-category budget
  // with zero transactions is safe to let cascade away with the category.
  await prisma.category.delete({ where: { id: categoryId } });
  await prisma.auditLog.create({
    data: {
      userId: actingUser.id,
      action: "DELETE",
      entityType: "Category",
      entityId: categoryId,
      oldValues: { name: category.name, transactionType: category.transactionType },
      ipAddress: req.ip,
    },
  });
}
