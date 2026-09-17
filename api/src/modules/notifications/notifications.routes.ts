import { Router } from "express";
import * as notificationsController from "./notifications.controller.js";
import { requireAuth } from "../../middleware/auth.middleware.js";
import { validateBody, validateQuery } from "../../middleware/validate.js";
import { listNotificationsQuerySchema, registerDeviceSchema } from "./notifications.validation.js";

export const notificationsRouter = Router();

notificationsRouter.use(requireAuth);

// Backs notifications.html's All/Unread segmented control + the bell badge count
notificationsRouter.get("/", validateQuery(listNotificationsQuerySchema), notificationsController.list);
notificationsRouter.post("/:id/read", notificationsController.markRead);
notificationsRouter.post("/read-all", notificationsController.markAllRead);
// Backs settings.html's "Push notifications" toggle actually being able to deliver anything
notificationsRouter.post("/devices", validateBody(registerDeviceSchema), notificationsController.registerDevice);
