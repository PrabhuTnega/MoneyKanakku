import type { Request, Response } from "express";
import * as transactionsService from "./transactions.service.js";
import type { listTransactionsQuerySchema } from "./transactions.validation.js";
import type { z } from "zod";

export async function list(req: Request, res: Response) {
  const query = req.validatedQuery as z.infer<typeof listTransactionsQuerySchema>;
  const result = await transactionsService.listTransactions(req.user!.id, query);
  res.json(result);
}

export async function getOne(req: Request, res: Response) {
  const transaction = await transactionsService.getTransaction(req.user!.id, String(req.params.id));
  res.json({ transaction });
}

export async function create(req: Request, res: Response) {
  const transaction = await transactionsService.createTransaction(req.user!.id, req.body, req);
  res.status(201).json({ transaction });
}

export async function update(req: Request, res: Response) {
  const transaction = await transactionsService.updateTransaction(req.user!.id, String(req.params.id), req.body, req);
  res.json({ transaction });
}

export async function remove(req: Request, res: Response) {
  await transactionsService.deleteTransaction(req.user!.id, String(req.params.id), req);
  res.status(204).end();
}

export async function restore(req: Request, res: Response) {
  const transaction = await transactionsService.restoreTransaction(req.user!.id, String(req.params.id), req);
  res.json({ transaction });
}

export async function summary(req: Request, res: Response) {
  const month = String(req.query.month ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(month)) {
    return res.status(422).json({ error: { code: "VALIDATION_ERROR", message: "?month=YYYY-MM-DD is required." } });
  }
  const result = await transactionsService.monthSummary(req.user!.id, month);
  res.json(result);
}
