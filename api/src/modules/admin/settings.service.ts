import type { Request } from "express";
import { prisma } from "../../lib/prisma.js";
import { Errors } from "../../lib/app-error.js";

/** Backs admin-categories.html#system — every SystemSetting row, as a
 * single object keyed by its `key` rather than an array, since the UI
 * reads specific named settings directly (e.g. settings.default_currency)
 * instead of iterating a list. */
export async function listSettings() {
  const rows = await prisma.systemSetting.findMany();
  return Object.fromEntries(rows.map((r) => [r.key, r.value]));
}

export async function updateSetting(adminUserId: string, key: string, value: unknown, req: Request) {
  const existing = await prisma.systemSetting.findUnique({ where: { key } });
  if (!existing) throw Errors.notFound("Setting");

  const updated = await prisma.systemSetting.update({
    where: { key },
    data: { value: value as any, updatedBy: adminUserId },
  });
  await prisma.auditLog.create({
    data: {
      userId: adminUserId,
      action: "UPDATE",
      entityType: "SystemSetting",
      entityId: key,
      oldValues: { value: existing.value } as any,
      newValues: { value } as any,
      ipAddress: req.ip,
    },
  });
  return updated;
}
