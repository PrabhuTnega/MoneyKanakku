import type { Request, Response } from "express";
import * as notificationsService from "./notifications.service.js";
import type { listNotificationsQuerySchema } from "./notifications.validation.js";
import type { z } from "zod";

export async function list(req: Request, res: Response) {
  const query = req.validatedQuery as z.infer<typeof listNotificationsQuerySchema>;
  const result = await notificationsService.listNotifications(req.user!.id, query.status, query.page, query.pageSize);
  res.json(result);
}

export async function markRead(req: Request, res: Response) {
  const notification = await notificationsService.markRead(req.user!.id, String(req.params.id));
  res.json({ notification });
}

export async function markAllRead(req: Request, res: Response) {
  await notificationsService.markAllRead(req.user!.id);
  res.status(204).end();
}

export async function registerDevice(req: Request, res: Response) {
  const device = await notificationsService.registerDevice(req.user!.id, req.body.platform, req.body.pushToken);
  res.status(201).json({ device });
}
