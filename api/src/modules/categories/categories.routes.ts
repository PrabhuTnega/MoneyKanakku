import { Router } from "express";
import * as categoriesController from "./categories.controller.js";
import { requireAuth, requireAdmin } from "../../middleware/auth.middleware.js";
import { validateBody, validateQuery } from "../../middleware/validate.js";
import { listCategoriesQuerySchema, createCategorySchema, updateCategorySchema } from "./categories.validation.js";

export const categoriesRouter = Router();

categoriesRouter.use(requireAuth);

// Backs categories.html's Expense/Income + Active/Inactive/All toggles
categoriesRouter.get("/", validateQuery(listCategoriesQuerySchema), categoriesController.list);
// Backs category-form.html (personal custom category)
categoriesRouter.post("/", validateBody(createCategorySchema), categoriesController.create);
// Backs admin-categories.html's "Add Category" modal
categoriesRouter.post("/global", requireAdmin, validateBody(createCategorySchema), categoriesController.createGlobal);
// Backs editing a category (name/icon/color) and the Active/Inactive toggle
// switches on both categories.html and admin-categories.html
categoriesRouter.patch("/:id", validateBody(updateCategorySchema), categoriesController.update);
// Backs categories.html's "Delete" action on a user's own custom category
// (blocked with a 409 if it's still referenced by any transaction/recurring
// rule — see categories.service.ts's deleteCategory).
categoriesRouter.delete("/:id", categoriesController.remove);
