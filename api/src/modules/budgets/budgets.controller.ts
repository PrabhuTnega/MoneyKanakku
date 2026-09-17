import type { Request, Response } from "express";
import * as budgetsService from "./budgets.service.js";
import type { listBudgetsQuerySchema } from "./budgets.validation.js";
import type { z } from "zod";

export async function list(req: Request, res: Response) {
  const query = req.validatedQuery as z.infer<typeof listBudgetsQuerySchema>;
  const result = await budgetsService.listBudgetsWithStatus(req.user!.id, query.month);
  res.json(result);
}

export async function create(req: Request, res: Response) {
  const budget = await budgetsService.createBudget(req.user!.id, req.body, req);
  res.status(201).json({ budget });
}

export async function update(req: Request, res: Response) {
  const budget = await budgetsService.updateBudget(req.user!.id, String(req.params.id), req.body, req);
  res.json({ budget });
}
