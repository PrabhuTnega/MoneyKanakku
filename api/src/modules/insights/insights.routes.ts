import { Router } from "express";
import * as insightsController from "./insights.controller.js";
import { requireAuth } from "../../middleware/auth.middleware.js";
import { validateQuery } from "../../middleware/validate.js";
import { monthQuerySchema } from "./insights.validation.js";

export const insightsRouter = Router();

insightsRouter.use(requireAuth);

// Backs dashboard.html's "Safe to Spend Today" card.
insightsRouter.get("/safe-to-spend", validateQuery(monthQuerySchema), insightsController.getSafeToSpend);
// Backs dashboard.html's "Smart Insights" feed.
insightsRouter.get("/smart", validateQuery(monthQuerySchema), insightsController.getSmartInsights);
