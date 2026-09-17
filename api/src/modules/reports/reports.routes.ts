import { Router } from "express";
import * as reportsController from "./reports.controller.js";
import { requireAuth } from "../../middleware/auth.middleware.js";
import { validateQuery } from "../../middleware/validate.js";
import { monthQuerySchema, categoryReportQuerySchema, yearQuerySchema } from "./reports.validation.js";

export const reportsRouter = Router();

reportsRouter.use(requireAuth);

// Backs reports.html's Category-wise tab (Expense/Income toggle)
reportsRouter.get("/category", validateQuery(categoryReportQuerySchema), reportsController.category);
// Backs reports.html's Payment Method tab
reportsRouter.get("/payment-methods", validateQuery(monthQuerySchema), reportsController.paymentMethods);
// Backs reports.html's Trend tab (Income vs Expense, 12 months)
reportsRouter.get("/trend", validateQuery(monthQuerySchema), reportsController.trend);
// Backs reports.html's Yearly Summary tab
reportsRouter.get("/yearly-summary", validateQuery(yearQuerySchema), reportsController.yearlySummary);
// Backs reports.html's Monthly tab daily bar chart
reportsRouter.get("/daily-spending", validateQuery(monthQuerySchema), reportsController.dailySpending);
