import type { Request, Response } from "express";
import * as recurringService from "./recurring.service.js";
import type { listRecurringQuerySchema } from "./recurring.validation.js";
import type { z } from "zod";

export async function list(req: Request, res: Response) {
  const query = req.validatedQuery as z.infer<typeof listRecurringQuerySchema>;
  const items = await recurringService.listRecurring(req.user!.id, query.type);
  res.json({ items });
}

export async function create(req: Request, res: Response) {
  const rule = await recurringService.createRecurring(req.user!.id, req.body, req);
  res.status(201).json({ rule });
}

export async function update(req: Request, res: Response) {
  const rule = await recurringService.updateRecurring(req.user!.id, String(req.params.id), req.body, req);
  res.json({ rule });
}

export async function remove(req: Request, res: Response) {
  await recurringService.deleteRecurring(req.user!.id, String(req.params.id), req);
  res.status(204).end();
}
