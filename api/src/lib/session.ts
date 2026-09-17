import type { Request } from "express";
import { prisma } from "./prisma.js";
import { hashToken, randomToken } from "./hash.js";
import { env } from "../config/env.js";

function clientMeta(req: Request) {
  return {
    userAgent: req.get("user-agent") ?? null,
    ipAddress: req.ip ?? null,
  };
}

function refreshTtlMs() {
  return env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60_000;
}

/** Creates a new refresh-token-backed session row (one per logged-in
 * device/browser) and returns the RAW refresh token — this is the only
 * moment the raw value exists; only its SHA-256 hash is ever persisted. */
export async function createRefreshSession(userId: string, req: Request) {
  const token = randomToken();
  const expiresAt = new Date(Date.now() + refreshTtlMs());
  const session = await prisma.session.create({
    data: { userId, tokenHash: hashToken(token), expiresAt, lastActiveAt: new Date(), ...clientMeta(req) },
  });
  return { sessionId: session.id, token, expiresAt };
}

/**
 * Validates a refresh token and, if it's still good, ROTATES it: a new
 * opaque token replaces the old one on the same row, with the expiry
 * pushed back out to a fresh REFRESH_TOKEN_TTL_DAYS. This is the
 * mechanism behind "stay signed in until you log out" — as long as the
 * app is opened (triggering a silent refresh) at least once per refresh
 * window, the window keeps sliding forward indefinitely. A token that
 * genuinely goes unused for the full window is what finally expires.
 * Returns null for anything invalid/expired/revoked/deactivated —
 * callers treat that as "must sign in again."
 */
export async function rotateRefreshSession(oldToken: string, req: Request) {
  const session = await prisma.session.findUnique({
    where: { tokenHash: hashToken(oldToken) },
    include: { user: true },
  });
  if (!session) return null;
  if (session.expiresAt <= new Date()) {
    await prisma.session.delete({ where: { id: session.id } }).catch(() => {});
    return null;
  }
  if (session.user.deletedAt || !session.user.isActive) return null;

  const token = randomToken();
  const expiresAt = new Date(Date.now() + refreshTtlMs());
  await prisma.session.update({
    where: { id: session.id },
    data: { tokenHash: hashToken(token), expiresAt, lastActiveAt: new Date(), ...clientMeta(req) },
  });
  return { sessionId: session.id, token, expiresAt, user: session.user };
}

export async function destroyRefreshSession(token: string) {
  await prisma.session.deleteMany({ where: { tokenHash: hashToken(token) } });
}

/**
 * Best-effort, per-process-throttled activity ping. Access-token checks
 * are stateless on purpose (see access-token.ts) and never touch the DB,
 * so without this, a session row's lastActiveAt would only move on the
 * rare refresh — every ~15 minutes — instead of reflecting real usage,
 * which would break admin-live-ops.html's "online in the last 5 minutes"
 * metric. Throttled in-memory so an actively-clicking user doesn't turn
 * every single request into a write. Per-process only, which is fine at
 * this app's current single-instance scale (see db/queries/scaling_notes.sql).
 */
const lastBumpedAt = new Map<string, number>();
const ACTIVITY_BUMP_THROTTLE_MS = 60_000;
export function touchSessionActivity(sessionId: string) {
  const last = lastBumpedAt.get(sessionId) ?? 0;
  if (Date.now() - last < ACTIVITY_BUMP_THROTTLE_MS) return;
  lastBumpedAt.set(sessionId, Date.now());
  prisma.session.update({ where: { id: sessionId }, data: { lastActiveAt: new Date() } }).catch(() => {});
}

export function accessCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    maxAge: env.ACCESS_TOKEN_TTL_MINUTES * 60_000,
    path: "/",
  };
}

export function refreshCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    signed: true,
    maxAge: refreshTtlMs(),
    // Scoped narrowly — the browser only ever sends this cookie to the
    // handful of auth endpoints that need it (login/refresh/logout/etc.),
    // not to every API call. The access-token cookie (path "/") is what
    // authorizes those.
    path: "/api/auth",
  };
}
