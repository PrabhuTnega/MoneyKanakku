import rateLimit from "express-rate-limit";
import { Errors } from "../lib/app-error.js";

/** Auth endpoints (login, register, OTP, password reset) get a much
 * tighter limit than the rest of the API — these are exactly the
 * endpoints credential-stuffing / brute-force traffic targets. */
export const authRateLimit = rateLimit({
  windowMs: 15 * 60_000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, _res, next) => next(Errors.rateLimited("Too many attempts — please try again in a few minutes.")),
});

/** POST /auth/refresh gets its own, more generous limit than
 * authRateLimit — it's not a credential-guessing target (the refresh
 * cookie is opaque and httpOnly), and legitimate silent-refresh traffic
 * from one active user across a few tabs/devices can reasonably exceed
 * authRateLimit's tight 10/15min brute-force budget. */
export const refreshRateLimit = rateLimit({
  windowMs: 15 * 60_000,
  limit: 60,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, _res, next) => next(Errors.rateLimited("Too many attempts — please try again in a few minutes.")),
});

/** A generous default for everything else, mainly to blunt accidental
 * client-side retry storms rather than to stop determined abuse. */
export const generalRateLimit = rateLimit({
  windowMs: 60_000,
  // LOAD_TEST_LIMIT_OVERRIDE lets a local benchmark run past the real
  // production limit without permanently changing it — unset in every
  // real environment, so this always falls back to 300.
  limit: process.env.LOAD_TEST_LIMIT_OVERRIDE ? Number(process.env.LOAD_TEST_LIMIT_OVERRIDE) : 300,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, _res, next) => next(Errors.rateLimited()),
});
