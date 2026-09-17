import type { Request, Response, NextFunction } from "express";
import { verifyAccessToken } from "../lib/access-token.js";
import { touchSessionActivity } from "../lib/session.js";
import { env } from "../config/env.js";
import { AppError } from "../lib/app-error.js";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      /** Only ever .id and .role are read anywhere in the codebase — full
       * profile fields (name, email, etc.) are fetched fresh by
       * GET /auth/me when the frontend needs them for display, not
       * carried on every request. */
      user?: { id: string; role: "USER" | "ADMIN" };
      /** The verified access token's backing refresh-session row id —
       * lets logout/change-password act on "this device" without a
       * lookup, and is what touchSessionActivity bumps. */
      sessionId?: string;
    }
  }
}

/**
 * Verifies the access-token cookie IN PROCESS — no DB round-trip (see
 * access-token.ts). Never rejects the request itself; `requireAuth`
 * below is what actually gates access. An expired/missing access token
 * here is normal and expected, not an error condition: the frontend's
 * silent-refresh interceptor (assets/js/api.js) is what turns a 401 from
 * `requireAuth` into a fresh access token via POST /auth/refresh and
 * transparently retries, so the user never sees it.
 */
export function attachUser(req: Request, _res: Response, next: NextFunction) {
  const token = req.cookies?.[env.ACCESS_COOKIE_NAME];
  const payload = verifyAccessToken(token);
  if (payload) {
    req.user = { id: payload.sub, role: payload.role };
    req.sessionId = payload.sid;
    touchSessionActivity(payload.sid);
  }
  next();
}

export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  if (!req.user) return next(new AppError(401, "UNAUTHENTICATED", "Sign in required."));
  next();
}

export function requireAdmin(req: Request, _res: Response, next: NextFunction) {
  if (!req.user) return next(new AppError(401, "UNAUTHENTICATED", "Sign in required."));
  if (req.user.role !== "ADMIN") return next(new AppError(403, "FORBIDDEN", "Admin access required."));
  next();
}
