import express from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import { env } from "./config/env.js";
import { attachUser } from "./middleware/auth.middleware.js";
import { requestLogger } from "./middleware/request-logger.js";
import { inFlightTracker } from "./middleware/in-flight.js";
import { generalRateLimit } from "./middleware/rate-limit.js";
import { errorHandler } from "./middleware/error-handler.js";
import { authRouter } from "./modules/auth/auth.routes.js";
import { categoriesRouter } from "./modules/categories/categories.routes.js";
import { transactionsRouter } from "./modules/transactions/transactions.routes.js";
import { budgetsRouter } from "./modules/budgets/budgets.routes.js";
import { recurringRouter } from "./modules/recurring/recurring.routes.js";
import { reportsRouter } from "./modules/reports/reports.routes.js";
import { notificationsRouter } from "./modules/notifications/notifications.routes.js";
import { adminRouter } from "./modules/admin/admin.routes.js";
import { insightsRouter } from "./modules/insights/insights.routes.js";

export function createApp() {
  const app = express();

  app.disable("x-powered-by");
  // See env.ts's TRUST_PROXY doc comment — 0 (default) is correct with no
  // reverse proxy in front; a real deployment behind one must set this to
  // that proxy's hop count, or rate limiting and audit-log IPs silently
  // collapse onto the proxy's own address for every user.
  app.set("trust proxy", env.TRUST_PROXY);
  app.use(helmet());
  app.use(
    cors({
      origin: env.CORS_ORIGIN,
      credentials: true, // the session cookie is credentialed — the frontend must fetch() with { credentials: "include" }
    })
  );
  app.use(express.json({ limit: "1mb" }));
  app.use(cookieParser(env.COOKIE_SECRET));
  app.use(inFlightTracker);
  app.use(requestLogger);
  app.use(attachUser);
  app.use(generalRateLimit);

  app.get("/health", (_req, res) => res.json({ status: "ok", time: new Date().toISOString() }));

  app.use("/api/auth", authRouter);
  app.use("/api/categories", categoriesRouter);
  app.use("/api/transactions", transactionsRouter);
  app.use("/api/budgets", budgetsRouter);
  app.use("/api/recurring", recurringRouter);
  app.use("/api/reports", reportsRouter);
  app.use("/api/notifications", notificationsRouter);
  app.use("/api/admin", adminRouter);
  app.use("/api/insights", insightsRouter);

  app.use((req, res) => {
    res.status(404).json({ error: { code: "NOT_FOUND", message: `No route for ${req.method} ${req.originalUrl}` } });
  });

  app.use(errorHandler);

  return app;
}
