import type { Request, Response } from "express";
import * as reportsService from "./reports.service.js";
import type { monthQuerySchema, categoryReportQuerySchema, yearQuerySchema } from "./reports.validation.js";
import type { z } from "zod";

export async function category(req: Request, res: Response) {
  const query = req.validatedQuery as z.infer<typeof categoryReportQuerySchema>;
  const items = await reportsService.categoryReport(req.user!.id, query.month, query.type);
  res.json({ items });
}

export async function paymentMethods(req: Request, res: Response) {
  const query = req.validatedQuery as z.infer<typeof monthQuerySchema>;
  const items = await reportsService.paymentMethodReport(req.user!.id, query.month);
  res.json({ items });
}

export async function trend(req: Request, res: Response) {
  const query = req.validatedQuery as z.infer<typeof monthQuerySchema>;
  const items = await reportsService.trendReport(req.user!.id, query.month);
  res.json({ items });
}

export async function yearlySummary(req: Request, res: Response) {
  const query = req.validatedQuery as z.infer<typeof yearQuerySchema>;
  const items = await reportsService.yearlySummary(req.user!.id, query.year);
  res.json({ items });
}

export async function dailySpending(req: Request, res: Response) {
  const query = req.validatedQuery as z.infer<typeof monthQuerySchema>;
  const items = await reportsService.dailySpending(req.user!.id, query.month);
  res.json({ items });
}
