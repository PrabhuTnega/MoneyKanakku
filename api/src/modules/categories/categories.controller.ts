import type { Request, Response } from "express";
import * as categoriesService from "./categories.service.js";
import type { listCategoriesQuerySchema } from "./categories.validation.js";
import type { z } from "zod";

export async function list(req: Request, res: Response) {
  const query = req.validatedQuery as z.infer<typeof listCategoriesQuerySchema>;
  const categories = await categoriesService.listCategories(req.user!.id, query);
  res.json({ categories });
}

export async function create(req: Request, res: Response) {
  const category = await categoriesService.createCustomCategory(req.user!.id, req.body, req);
  res.status(201).json({ category });
}

export async function createGlobal(req: Request, res: Response) {
  const category = await categoriesService.createGlobalCategory(req.user!.id, req.body, req);
  res.status(201).json({ category });
}

export async function update(req: Request, res: Response) {
  const category = await categoriesService.updateCategory(req.user!, String(req.params.id), req.body, req);
  res.json({ category });
}

export async function remove(req: Request, res: Response) {
  await categoriesService.deleteCategory(req.user!, String(req.params.id), req);
  res.status(204).send();
}
