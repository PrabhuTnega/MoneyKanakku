import { Router } from "express";
import * as transactionsController from "./transactions.controller.js";
import { requireAuth } from "../../middleware/auth.middleware.js";
import { validateBody, validateQuery } from "../../middleware/validate.js";
import { listTransactionsQuerySchema, createTransactionSchema, updateTransactionSchema } from "./transactions.validation.js";

export const transactionsRouter = Router();

transactionsRouter.use(requireAuth);

// Backs dashboard.html's Income vs Expense card + budget hero total
transactionsRouter.get("/summary", transactionsController.summary);
// Backs expenses.html's list + All/Income/Expense + category filters + search.html
transactionsRouter.get("/", validateQuery(listTransactionsQuerySchema), transactionsController.list);
// Backs expense-form.html (type toggle decides EXPENSE vs INCOME)
transactionsRouter.post("/", validateBody(createTransactionSchema), transactionsController.create);
// Backs expense-detail.html
transactionsRouter.get("/:id", transactionsController.getOne);
transactionsRouter.patch("/:id", validateBody(updateTransactionSchema), transactionsController.update);
// Soft delete (FRS audit-integrity rule) + the Restore action seen in admin-audit-logs.html
transactionsRouter.delete("/:id", transactionsController.remove);
transactionsRouter.post("/:id/restore", transactionsController.restore);
