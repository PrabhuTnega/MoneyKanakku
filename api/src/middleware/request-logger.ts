import type { Request, Response, NextFunction } from "express";
import { prisma } from "../lib/prisma.js";

const UUID_SEGMENT = /\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

/**
 * Collapses UUID path segments to `:id` so `/api/transactions/<uuid>` for a
 * thousand different transactions aggregates as one endpoint, not a
 * thousand. Deliberately NOT using Express's `req.route`/`req.baseUrl` for
 * this — verified empirically that `req.baseUrl` is unreliable by the time
 * the `res.on("finish")` handler below fires on an error path (a 401/403
 * thrown from middleware ahead of the final route handler unwinds through
 * Express's router stack differently than a normal response, and baseUrl
 * came back empty in that case even though the route pattern would have
 * been available). A plain regex over the one true `req.originalUrl` has
 * no such timing dependency and is correct for every response type alike.
 */
function normalizePath(rawPath: string): string {
  return rawPath.replace(UUID_SEGMENT, "/:id");
}

/** Writes one row per request to `request_logs` — this table is the entire
 * data source behind admin-live-ops.html's "API req/min", "Hottest
 * endpoints" and "Slowest endpoints" panels (see db/queries/live_ops.sql).
 * Fire-and-forget: a logging failure must never fail or delay the actual
 * response.
 */
export function requestLogger(req: Request, res: Response, next: NextFunction) {
  const startedAt = process.hrtime.bigint();

  res.on("finish", () => {
    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
    const path = normalizePath(req.originalUrl.split("?")[0]);

    prisma.requestLog
      .create({
        data: {
          method: req.method,
          path: path.length > 255 ? path.slice(0, 255) : path,
          statusCode: res.statusCode,
          durationMs: Math.round(durationMs),
          userId: req.user?.id ?? null,
          ipAddress: req.ip ?? null,
        },
      })
      .catch((err) => console.error("[request-logger] failed to write request_logs row:", err));
  });

  next();
}
