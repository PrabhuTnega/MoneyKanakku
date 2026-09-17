import type { Request, Response, NextFunction } from "express";
import type { ZodType } from "zod";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      /** Parsed, type-safe result of validateQuery() — read this instead of
       * req.query in any route that uses it. Express 5 made req.query a
       * getter-only property (backed by the raw URL) that can no longer be
       * reassigned the way Express 4 allowed, so validated query data lives
       * here instead of overwriting req.query. */
      validatedQuery?: unknown;
    }
  }
}

/** Parses+validates req.body against `schema`, replacing req.body with the
 * parsed (and thus type-safe, defaults-applied) result. Zod errors are
 * left to propagate to errorHandler, which already knows how to shape them. */
export function validateBody<T>(schema: ZodType<T>) {
  return (req: Request, _res: Response, next: NextFunction) => {
    req.body = schema.parse(req.body);
    next();
  };
}

/** Same idea for `?query=string` params, stashed on req.validatedQuery
 * (see the module-level note above for why it can't just replace
 * req.query on Express 5). */
export function validateQuery<T>(schema: ZodType<T>) {
  return (req: Request, _res: Response, next: NextFunction) => {
    req.validatedQuery = schema.parse(req.query);
    next();
  };
}
