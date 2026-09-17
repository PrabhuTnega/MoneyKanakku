import { Router } from "express";
import * as adminController from "./admin.controller.js";
import * as recurringService from "../recurring/recurring.service.js";
import { requireAuth, requireAdmin } from "../../middleware/auth.middleware.js";
import { validateBody, validateQuery } from "../../middleware/validate.js";
import { listUsersQuerySchema, updateUserSchema, listAuditLogsQuerySchema, updateSystemSettingSchema } from "./admin.validation.js";

export const adminRouter = Router();

adminRouter.use(requireAuth, requireAdmin);

// Backs admin-dashboard.html
adminRouter.get("/overview", adminController.overview);

// Backs admin-users.html
adminRouter.get("/users", validateQuery(listUsersQuerySchema), adminController.listUsers);
adminRouter.patch("/users/:id", validateBody(updateUserSchema), adminController.updateUser);

// Backs admin-audit-logs.html
adminRouter.get("/audit-logs", validateQuery(listAuditLogsQuerySchema), adminController.listAuditLogs);

// Backs admin-live-ops.html
adminRouter.get("/live-ops", adminController.liveOps);

// Backs admin-categories.html#system
adminRouter.get("/settings", adminController.listSettings);
adminRouter.patch("/settings/:key", validateBody(updateSystemSettingSchema), adminController.updateSetting);

// FRS 4.6's daily scheduler job — no real cron process exists yet, so it's
// triggered manually here for now (see recurring.service.ts's runScheduler
// doc comment). Deliberately admin-only, not a public endpoint.
adminRouter.post("/run-scheduler", async (_req, res) => {
  res.json(await recurringService.runScheduler());
});
