import { Router } from "express";
import * as recurringController from "./recurring.controller.js";
import { requireAuth } from "../../middleware/auth.middleware.js";
import { validateBody, validateQuery } from "../../middleware/validate.js";
import { listRecurringQuerySchema, createRecurringSchema, updateRecurringSchema } from "./recurring.validation.js";

export const recurringRouter = Router();

recurringRouter.use(requireAuth);

// Backs recurring.html's All/Income/Expense filter
recurringRouter.get("/", validateQuery(listRecurringQuerySchema), recurringController.list);
// Backs recurring-form.html
recurringRouter.post("/", validateBody(createRecurringSchema), recurringController.create);
recurringRouter.patch("/:id", validateBody(updateRecurringSchema), recurringController.update);
recurringRouter.delete("/:id", recurringController.remove);
