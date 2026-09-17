import type { Request, Response, NextFunction } from "express";
import { ZodError } from "zod";
import { AppError } from "../lib/app-error.js";
import { isProd } from "../config/env.js";

/** Every error response has this exact shape, success responses never do —
 * the frontend can branch on `res.ok` from fetch() and trust the rest. */
export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction) {
  if (err instanceof AppError) {
    return res.status(err.status).json({
      error: { code: err.code, message: err.message, details: err.details },
    });
  }

  if (err instanceof ZodError) {
    return res.status(422).json({
      error: { code: "VALIDATION_ERROR", message: "Invalid request data.", details: err.flatten() },
    });
  }

  // Prisma's known-request errors carry a stable `code` (e.g. P2002 unique
  // violation, P2003 FK violation, P2025 record not found) — map the ones
  // that are genuinely client-caused to 4xx instead of a generic 500.
  if (isPrismaKnownError(err)) {
    if (err.code === "P2002") {
      return res.status(409).json({ error: { code: "CONFLICT", message: "This value is already in use.", details: err.meta } });
    }
    if (err.code === "P2025") {
      return res.status(404).json({ error: { code: "NOT_FOUND", message: "Resource not found." } });
    }
    if (err.code === "P2003") {
      return res.status(409).json({ error: { code: "CONFLICT", message: "This action conflicts with related data." } });
    }
  }

  console.error(`[unhandled] ${req.method} ${req.originalUrl}`, err);
  return res.status(500).json({
    error: {
      code: "INTERNAL_ERROR",
      message: "Something went wrong on our end.",
      ...(isProd ? {} : { stack: err instanceof Error ? err.stack : String(err) }),
    },
  });
}

function isPrismaKnownError(err: unknown): err is { code: string; meta?: unknown } {
  return typeof err === "object" && err !== null && "code" in err && typeof (err as any).code === "string" && (err as any).code.startsWith("P");
}
