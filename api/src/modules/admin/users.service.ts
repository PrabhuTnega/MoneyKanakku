import type { Request } from "express";
import type { z } from "zod";
import { prisma } from "../../lib/prisma.js";
import { Errors } from "../../lib/app-error.js";
import type { listUsersQuerySchema, updateUserSchema } from "./admin.validation.js";

export async function listUsers(query: z.infer<typeof listUsersQuerySchema>) {
  const where = {
    deletedAt: null,
    ...(query.status === "active" ? { isActive: true } : {}),
    ...(query.status === "inactive" ? { isActive: false } : {}),
    ...(query.status === "admin" ? { role: "ADMIN" as const } : {}),
    ...(query.search
      ? { OR: [{ name: { contains: query.search, mode: "insensitive" as const } }, { email: { contains: query.search, mode: "insensitive" as const } }] }
      : {}),
  };

  const [items, total, stats] = await Promise.all([
    prisma.user.findMany({
      where,
      select: { id: true, name: true, email: true, phone: true, role: true, isActive: true, createdAt: true },
      orderBy: { createdAt: "desc" },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    prisma.user.count({ where }),
    prisma.user.groupBy({ by: ["isActive"], where: { deletedAt: null }, _count: true }),
  ]);

  const totalUsers = stats.reduce((sum, s) => sum + s._count, 0);
  const activeUsers = stats.find((s) => s.isActive)?._count ?? 0;

  return { items, total, page: query.page, pageSize: query.pageSize, totalUsers, activeUsers, inactiveUsers: totalUsers - activeUsers };
}

export async function updateUser(adminUserId: string, targetUserId: string, input: z.infer<typeof updateUserSchema>, req: Request) {
  if (targetUserId === adminUserId && input.isActive === false) {
    throw Errors.validation("You can't deactivate your own account.");
  }

  const existing = await prisma.user.findUnique({ where: { id: targetUserId } });
  if (!existing) throw Errors.notFound("User");

  const updated = await prisma.user.update({
    where: { id: targetUserId },
    data: input,
    // Never select passwordHash into an API response, admin endpoint or
    // not — caught live: the first version of this returned the full row,
    // bcrypt hash included, in the PATCH response.
    select: { id: true, name: true, email: true, phone: true, role: true, isActive: true, createdAt: true },
  });

  if (input.isActive === false) {
    // Deactivating a user must also kill any session they're currently
    // using — otherwise "suspend" is cosmetic until their cookie expires.
    await prisma.session.deleteMany({ where: { userId: targetUserId } });
  }

  await prisma.auditLog.create({
    data: {
      userId: adminUserId,
      action: "UPDATE",
      entityType: "User",
      entityId: targetUserId,
      oldValues: { isActive: existing.isActive, role: existing.role },
      newValues: input,
      ipAddress: req.ip,
    },
  });

  return updated;
}
