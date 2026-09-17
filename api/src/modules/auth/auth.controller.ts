import type { Request, Response } from "express";
import * as authService from "./auth.service.js";
import { prisma } from "../../lib/prisma.js";
import { rotateRefreshSession, accessCookieOptions, refreshCookieOptions } from "../../lib/session.js";
import { signAccessToken } from "../../lib/access-token.js";
import { env } from "../../config/env.js";
import { Errors } from "../../lib/app-error.js";

function setAuthCookies(res: Response, tokens: { accessToken: string; refreshToken: string }) {
  res.cookie(env.ACCESS_COOKIE_NAME, tokens.accessToken, accessCookieOptions());
  res.cookie(env.REFRESH_COOKIE_NAME, tokens.refreshToken, refreshCookieOptions());
}

function clearAuthCookies(res: Response) {
  res.clearCookie(env.ACCESS_COOKIE_NAME, { path: "/" });
  res.clearCookie(env.REFRESH_COOKIE_NAME, { path: "/api/auth" });
}

export async function register(req: Request, res: Response) {
  const { refreshToken, sessionId, ...result } = await authService.register(req.body, req);
  const accessToken = signAccessToken({ id: result.user.id, role: result.user.role as "USER" | "ADMIN", sessionId });
  setAuthCookies(res, { accessToken, refreshToken });
  res.status(201).json(result);
}

export async function login(req: Request, res: Response) {
  const { refreshToken, sessionId, ...result } = await authService.login(req.body, req);
  const accessToken = signAccessToken({ id: result.user.id, role: result.user.role as "USER" | "ADMIN", sessionId });
  setAuthCookies(res, { accessToken, refreshToken });
  res.json(result);
}

/**
 * Backs the frontend's silent-refresh interceptor (assets/js/api.js): it
 * calls this automatically whenever a request 401s because the access
 * token expired. The browser sends the refresh cookie on its own — no
 * token is ever handled by JavaScript. Success mints a fresh access
 * token AND rotates the refresh token (see rotateRefreshSession); this
 * is the only place either cookie gets renewed.
 */
export async function refresh(req: Request, res: Response) {
  const oldToken = req.signedCookies?.[env.REFRESH_COOKIE_NAME];
  if (!oldToken) throw Errors.unauthenticated("Please sign in again.");

  const rotated = await rotateRefreshSession(oldToken, req);
  if (!rotated) {
    clearAuthCookies(res);
    throw Errors.unauthenticated("Your session has expired — please sign in again.");
  }

  const accessToken = signAccessToken({ id: rotated.user.id, role: rotated.user.role, sessionId: rotated.sessionId });
  setAuthCookies(res, { accessToken, refreshToken: rotated.token });
  res.json({ ok: true });
}

export async function logout(req: Request, res: Response) {
  // Deliberately not gated by requireAuth: logging out should work even
  // if the access token already expired (the frontend's interceptor
  // would otherwise burn a refresh-rotation just to immediately destroy
  // the session it rotated to). All that's actually needed is whatever
  // refresh token the browser is currently holding.
  const refreshToken = req.signedCookies?.[env.REFRESH_COOKIE_NAME];
  await authService.logout(refreshToken, req.user?.id, req);
  clearAuthCookies(res);
  res.status(204).end();
}

export async function me(req: Request, res: Response) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: req.user!.id } });
  res.json({ user: authService.toPublicUser(user) });
}

export async function forgotPassword(req: Request, res: Response) {
  const result = await authService.forgotPassword(req.body.email);
  res.json({ message: "If that email exists, a reset link has been sent.", ...result });
}

export async function resendOtp(req: Request, res: Response) {
  const result = await authService.resendOtp(req.body.email, req.body.purpose);
  res.json({ message: "If that email exists, a new code has been sent.", ...result });
}

export async function verifyOtp(req: Request, res: Response) {
  const result = await authService.verifyOtp(req.body, req);
  if (result.purpose === "EMAIL_VERIFICATION") {
    const accessToken = signAccessToken({ id: result.user.id, role: result.user.role as "USER" | "ADMIN", sessionId: result.sessionId });
    setAuthCookies(res, { accessToken, refreshToken: result.refreshToken });
    return res.json({ purpose: result.purpose, user: result.user });
  }
  res.json({ purpose: result.purpose, resetTicket: result.resetTicket });
}

export async function resetPassword(req: Request, res: Response) {
  await authService.resetPassword(req.body);
  res.json({ message: "Password updated — sign in with your new password." });
}

export async function changePassword(req: Request, res: Response) {
  await authService.changePassword(req.user!.id, req.body, req.sessionId);
  res.json({ message: "Password updated." });
}

export async function updateMe(req: Request, res: Response) {
  const user = await authService.updateMe(req.user!.id, req.body, req);
  res.json({ user });
}

export async function clearData(req: Request, res: Response) {
  const summary = await authService.clearMyData(req.user!.id, req.body.password, req);
  res.json(summary);
}
