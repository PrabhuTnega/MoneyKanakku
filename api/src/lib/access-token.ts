import crypto from "node:crypto";
import { env } from "../config/env.js";

export interface AccessTokenPayload {
  /** userId */
  sub: string;
  role: "USER" | "ADMIN";
  /** The backing refresh session's row id (sessions.id) — lets logout /
   * change-password act on "this device" without a DB lookup, and lets
   * attachUser cheaply bump that session's lastActiveAt for Live Ops. */
  sid: string;
  /** Epoch ms. */
  exp: number;
}

function sign(payload: string): string {
  return crypto.createHmac("sha256", env.COOKIE_SECRET).update(payload).digest("base64url");
}

/**
 * Self-verifying, stateless access token: `base64url(json).signature`.
 * Deliberately NOT looked up against the database — that round-trip is
 * exactly what the refresh token (see session.ts) exists to avoid on
 * every single authenticated request. The tradeoff this buys: a
 * deactivated/demoted user's already-issued access token stays nominally
 * valid for up to ACCESS_TOKEN_TTL_MINUTES after the change, since
 * there's no DB check to catch it sooner. That's the standard, accepted
 * cost of a short-lived stateless token, and is exactly why it's short
 * (15 min) — the refresh token's rotation is where revocation actually
 * takes effect (see rotateRefreshSession).
 */
export function signAccessToken(data: { id: string; role: "USER" | "ADMIN"; sessionId: string }): string {
  const payload: AccessTokenPayload = {
    sub: data.id,
    role: data.role,
    sid: data.sessionId,
    exp: Date.now() + env.ACCESS_TOKEN_TTL_MINUTES * 60_000,
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${encoded}.${sign(encoded)}`;
}

export function verifyAccessToken(token: string | undefined | null): AccessTokenPayload | null {
  if (!token) return null;
  const dot = token.lastIndexOf(".");
  if (dot === -1) return null;
  const encoded = token.slice(0, dot);
  const signature = token.slice(dot + 1);

  const expected = Buffer.from(sign(encoded));
  const actual = Buffer.from(signature);
  if (expected.length !== actual.length || !crypto.timingSafeEqual(expected, actual)) return null;

  let payload: AccessTokenPayload;
  try {
    payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  if (typeof payload.exp !== "number" || payload.exp <= Date.now()) return null;
  if (typeof payload.sub !== "string" || typeof payload.sid !== "string") return null;
  return payload;
}
