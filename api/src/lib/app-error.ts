/** A deliberate, expected error with an HTTP status and a stable machine-
 * readable `code` the frontend can branch on (never parse `message` text). */
export class AppError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown
  ) {
    super(message);
    this.name = "AppError";
  }
}

export const Errors = {
  unauthenticated: (message = "Sign in required.") => new AppError(401, "UNAUTHENTICATED", message),
  forbidden: (message = "You don't have access to this.") => new AppError(403, "FORBIDDEN", message),
  notFound: (entity = "Resource") => new AppError(404, "NOT_FOUND", `${entity} not found.`),
  conflict: (message: string) => new AppError(409, "CONFLICT", message),
  validation: (message: string, details?: unknown) => new AppError(422, "VALIDATION_ERROR", message, details),
  rateLimited: (message = "Too many requests — try again shortly.") => new AppError(429, "RATE_LIMITED", message),
};
