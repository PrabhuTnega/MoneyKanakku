import { prisma } from "../../lib/prisma.js";
import { Errors } from "../../lib/app-error.js";

export async function listNotifications(userId: string, status: "all" | "unread", page: number, pageSize: number) {
  const where = { userId, ...(status === "unread" ? { isRead: false } : {}) };
  const [items, total, unreadCount] = await Promise.all([
    prisma.notification.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * pageSize, take: pageSize }),
    prisma.notification.count({ where }),
    prisma.notification.count({ where: { userId, isRead: false } }),
  ]);
  return { items, total, unreadCount, page, pageSize };
}

export async function markRead(userId: string, id: string) {
  const notification = await prisma.notification.findFirst({ where: { id, userId } });
  if (!notification) throw Errors.notFound("Notification");
  return prisma.notification.update({ where: { id }, data: { isRead: true } });
}

export async function markAllRead(userId: string) {
  await prisma.notification.updateMany({ where: { userId, isRead: false }, data: { isRead: true } });
}

export async function registerDevice(userId: string, platform: "IOS" | "ANDROID" | "WEB", pushToken: string) {
  return prisma.pushDevice.upsert({
    where: { pushToken },
    update: { userId, platform, lastSeenAt: new Date() },
    create: { userId, platform, pushToken },
  });
}
