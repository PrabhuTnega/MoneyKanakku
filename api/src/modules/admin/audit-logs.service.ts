import type { z } from "zod";
import { prisma } from "../../lib/prisma.js";
import type { listAuditLogsQuerySchema } from "./admin.validation.js";

export async function listAuditLogs(query: z.infer<typeof listAuditLogsQuerySchema>) {
  const where = {
    ...(query.action ? { action: query.action } : {}),
    ...(query.entityType ? { entityType: query.entityType } : {}),
    ...(query.from || query.to
      ? { createdAt: { ...(query.from ? { gte: query.from } : {}), ...(query.to ? { lte: query.to } : {}) } }
      : {}),
  };

  const [items, total, todayStats] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      include: { user: { select: { id: true, name: true, email: true } } },
      orderBy: { createdAt: "desc" },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    prisma.auditLog.count({ where }),
    // Backs the 4 stat tiles at the top of admin-audit-logs.html.
    prisma.auditLog.groupBy({
      by: ["action"],
      where: { createdAt: { gte: new Date(new Date().toISOString().slice(0, 10)) } },
      _count: true,
    }),
  ]);

  const eventsToday = todayStats.reduce((sum, s) => sum + s._count, 0);
  const deletionsToday = todayStats.find((s) => s.action === "DELETE")?._count ?? 0;
  const failedLoginsToday = todayStats.find((s) => s.action === "LOGIN_FAILED")?._count ?? 0;

  return {
    items,
    total,
    page: query.page,
    pageSize: query.pageSize,
    stats: { eventsToday, deletionsToday, failedLoginsToday },
  };
}
