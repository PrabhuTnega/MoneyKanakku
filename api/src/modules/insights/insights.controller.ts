import type { Request, Response } from "express";
import * as insightsService from "./insights.service.js";
import type { monthQuerySchema } from "./insights.validation.js";
import type { z } from "zod";

export async function getSafeToSpend(req: Request, res: Response) {
  const query = req.validatedQuery as z.infer<typeof monthQuerySchema>;
  const result = await insightsService.safeToSpend(req.user!.id, query.month);
  res.json(result);
}

export async function getSmartInsights(req: Request, res: Response) {
  const query = req.validatedQuery as z.infer<typeof monthQuerySchema>;
  const result = await insightsService.smartInsights(req.user!.id, query.month);
  res.json(result);
}
