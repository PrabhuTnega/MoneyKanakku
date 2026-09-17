import type { Request, Response, NextFunction } from "express";

/**
 * "In-flight requests" (admin-live-ops.html) is the one golden signal that
 * genuinely cannot come from the database — it's live in-process state
 * (how many requests THIS process is handling right now), not history. A
 * module-level counter incremented on request start / decremented on
 * response finish is the whole implementation; nothing here persists or
 * needs to.
 */
let count = 0;

export function inFlightTracker(_req: Request, res: Response, next: NextFunction) {
  count++;
  res.on("finish", () => {
    count--;
  });
  next();
}

export function getInFlightCount() {
  return count;
}
