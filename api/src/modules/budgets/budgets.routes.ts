import { Router } from "express";
import * as budgetsController from "./budgets.controller.js";
import { requireAuth } from "../../middleware/auth.middleware.js";
import { validateBody, validateQuery } from "../../middleware/validate.js";
import { listBudgetsQuerySchema, createBudgetSchema, updateBudgetSchema } from "./budgets.validation.js";

export const budgetsRouter = Router();

budgetsRouter.use(requireAuth);

// Backs budget.html's overall + per-category progress bars and alerts
budgetsRouter.get("/", validateQuery(listBudgetsQuerySchema), budgetsController.list);
// Backs budget-form.html
budgetsRouter.post("/", validateBody(createBudgetSchema), budgetsController.create);
budgetsRouter.patch("/:id", validateBody(updateBudgetSchema), budgetsController.update);
