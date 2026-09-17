import type { Request, Response } from "express";
import * as usersService from "./users.service.js";
import * as auditLogsService from "./audit-logs.service.js";
import * as liveOpsService from "./live-ops.service.js";
import * as settingsService from "./settings.service.js";
import * as overviewService from "./overview.service.js";
import type { listUsersQuerySchema, listAuditLogsQuerySchema } from "./admin.validation.js";
import type { z } from "zod";

export async function overview(_req: Request, res: Response) {
  res.json(await overviewService.getOverview());
}

export async function listUsers(req: Request, res: Response) {
  const query = req.validatedQuery as z.infer<typeof listUsersQuerySchema>;
  res.json(await usersService.listUsers(query));
}

export async function updateUser(req: Request, res: Response) {
  const user = await usersService.updateUser(req.user!.id, String(req.params.id), req.body, req);
  res.json({ user });
}

export async function listAuditLogs(req: Request, res: Response) {
  const query = req.validatedQuery as z.infer<typeof listAuditLogsQuerySchema>;
  res.json(await auditLogsService.listAuditLogs(query));
}

export async function liveOps(_req: Request, res: Response) {
  res.json(await liveOpsService.getLiveOps());
}

export async function listSettings(_req: Request, res: Response) {
  res.json(await settingsService.listSettings());
}

export async function updateSetting(req: Request, res: Response) {
  const setting = await settingsService.updateSetting(req.user!.id, String(req.params.key), req.body.value, req);
  res.json({ setting });
}
