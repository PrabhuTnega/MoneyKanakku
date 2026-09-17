import type { Request } from "express";
import { prisma } from "../../lib/prisma.js";
import { hashPassword, verifyPassword, generateOtp, hashToken, randomToken } from "../../lib/hash.js";
import { createRefreshSession, destroyRefreshSession } from "../../lib/session.js";
import { sendPasswordResetEmail } from "../../lib/mail.js";
import { env } from "../../config/env.js";
import { Errors } from "../../lib/app-error.js";
import type { registerSchema, loginSchema, verifyOtpSchema, resetPasswordSchema, changePasswordSchema, updateMeSchema } from "./auth.validation.js";
import type { z } from "zod";

const OTP_TTL_MINUTES = 10;
const OTP_MAX_ATTEMPTS = 5;

function publicUser(user: { id: string; name: string; email: string; role: string; currency: string; timezone: string; avatarUrl: string | null; emailVerifiedAt: Date | null; createdAt: Date }) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    currency: user.currency,
    timezone: user.timezone,
    avatarUrl: user.avatarUrl,
    emailVerified: user.emailVerifiedAt !== null,
    createdAt: user.createdAt,
  };
}

async function issueOtp(userId: string, purpose: "EMAIL_VERIFICATION" | "PASSWORD_RESET") {
  const code = generateOtp();
  await prisma.otpToken.create({
    data: {
      userId,
      purpose,
      otpHash: hashToken(code),
      expiresAt: new Date(Date.now() + OTP_TTL_MINUTES * 60_000),
    },
  });
  // No email/SMS provider is wired up yet — the OTP is returned to the
  // caller directly in non-production so the UI flow is testable end to
  // end. A real deployment replaces this with an actual send + omits the
  // code from the response entirely.
  return code;
}

export async function register(input: z.infer<typeof registerSchema>, req: Request) {
  const existing = await prisma.user.findUnique({ where: { email: input.email } });
  if (existing) throw Errors.conflict("An account with this email already exists.");

  const user = await prisma.user.create({
    data: {
      name: input.name,
      email: input.email,
      phone: input.phone,
      passwordHash: await hashPassword(input.password),
    },
  });

  await prisma.auditLog.create({
    data: { userId: user.id, action: "CREATE", entityType: "User", entityId: user.id, ipAddress: req.ip },
  });

  // Email verification on register is disabled for now — product decision
  // (2026-09-12): register.html takes the user straight into the app
  // instead of an OTP step. Left commented rather than deleted since OTP
  // may come back for register in the future; the EMAIL_VERIFICATION
  // OtpPurpose and issueOtp() below are unused until then, not dead code.
  // const otp = await issueOtp(user.id, "EMAIL_VERIFICATION");

  const { sessionId, token, expiresAt } = await createRefreshSession(user.id, req);
  return { user: publicUser(user), refreshToken: token, sessionId, expiresAt };
}

export async function login(input: z.infer<typeof loginSchema>, req: Request) {
  const user = await prisma.user.findUnique({ where: { email: input.email } });
  const passwordOk = user ? await verifyPassword(input.password, user.passwordHash) : false;

  if (!user || !passwordOk) {
    await prisma.auditLog.create({
      data: { action: "LOGIN_FAILED", entityType: "User", entityId: input.email, ipAddress: req.ip, newValues: { reason: !user ? "no_such_user" : "bad_password" } },
    });
    throw Errors.validation("Incorrect email or password.");
  }
  if (!user.isActive || user.deletedAt) throw Errors.forbidden("This account has been deactivated.");

  const { sessionId, token, expiresAt } = await createRefreshSession(user.id, req);
  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  await prisma.auditLog.create({ data: { userId: user.id, action: "LOGIN", entityType: "User", entityId: user.id, ipAddress: req.ip } });

  return { user: publicUser(user), refreshToken: token, sessionId, expiresAt };
}

export async function logout(refreshToken: string | undefined, userId: string | undefined, req: Request) {
  if (refreshToken) await destroyRefreshSession(refreshToken);
  if (userId) {
    await prisma.auditLog.create({ data: { userId, action: "LOGOUT", entityType: "User", entityId: userId, ipAddress: req.ip } });
  }
}

/**
 * Sends a clickable reset LINK (not a 6-digit code) — the user clicks it,
 * lands on reset-password.html?token=..., sets a new password directly, no
 * separate "verify this code" step. The link's token reuses the same
 * OtpToken table/hash-comparison machinery as the (still-available, just
 * no longer linked to from the UI) code-based flow — `otpHash` here holds
 * the hash of a high-entropy random token instead of a 6-digit code hash,
 * which is exactly what that column already existed to do (never store
 * the raw secret, only compare hashes).
 */
export async function forgotPassword(email: string) {
  const user = await prisma.user.findUnique({ where: { email } });
  // Deliberately do not reveal whether the account exists — always return
  // the same success shape either way. Only actually send an email when it
  // does.
  if (!user) return { devResetLink: undefined };

  const rawToken = randomToken();
  await prisma.otpToken.create({
    data: {
      userId: user.id,
      purpose: "PASSWORD_RESET",
      otpHash: hashToken(rawToken),
      expiresAt: new Date(Date.now() + OTP_TTL_MINUTES * 60_000),
    },
  });

  const resetUrl = `${env.CORS_ORIGIN}/reset-password.html?token=${rawToken}`;
  try {
    await sendPasswordResetEmail(email, resetUrl);
  } catch (err) {
    // Never let a real SMTP failure surface as "email doesn't exist" or
    // crash the request — log it server-side and fall through to the same
    // response shape either way (see the enumeration-avoidance note above).
    console.error("[mail] failed to send password reset email:", err);
  }

  // Non-prod safety net so this flow stays testable even if SMTP is
  // unreachable in a given dev environment — mirrors the old devOtp field.
  return { devResetLink: env.NODE_ENV === "production" ? undefined : resetUrl };
}

export async function resendOtp(email: string, purpose: "EMAIL_VERIFICATION" | "PASSWORD_RESET") {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) return { devOtp: undefined };
  const otp = await issueOtp(user.id, purpose);
  return { devOtp: process.env.NODE_ENV === "production" ? undefined : otp };
}

/**
 * Verifies a 6-digit code. For EMAIL_VERIFICATION this immediately marks
 * the account verified and logs the user in (matches register.html ->
 * otp-verify.html -> straight into the app). For PASSWORD_RESET it does
 * NOT change anything yet — it returns a short-lived `resetTicket` that
 * reset-password.html must present next, so the password itself is never
 * touched by this step alone.
 */
export async function verifyOtp(input: z.infer<typeof verifyOtpSchema>, req: Request) {
  const user = await prisma.user.findUnique({ where: { email: input.email } });
  if (!user) throw Errors.validation("Invalid or expired code.");

  const otpToken = await prisma.otpToken.findFirst({
    where: { userId: user.id, purpose: input.purpose, consumedAt: null },
    orderBy: { createdAt: "desc" },
  });
  if (!otpToken) throw Errors.validation("Invalid or expired code.");
  if (otpToken.expiresAt <= new Date()) throw Errors.validation("This code has expired — request a new one.");
  if (otpToken.attempts >= OTP_MAX_ATTEMPTS) throw Errors.validation("Too many attempts — request a new code.");

  if (otpToken.otpHash !== hashToken(input.code)) {
    await prisma.otpToken.update({ where: { id: otpToken.id }, data: { attempts: { increment: 1 } } });
    throw Errors.validation("Incorrect code.");
  }

  await prisma.otpToken.update({ where: { id: otpToken.id }, data: { consumedAt: new Date() } });

  if (input.purpose === "EMAIL_VERIFICATION") {
    const verifiedUser = await prisma.user.update({ where: { id: user.id }, data: { emailVerifiedAt: new Date() } });
    const { sessionId, token, expiresAt } = await createRefreshSession(user.id, req);
    return { purpose: "EMAIL_VERIFICATION" as const, user: publicUser(verifiedUser), refreshToken: token, sessionId, expiresAt };
  }

  return { purpose: "PASSWORD_RESET" as const, resetTicket: otpToken.id };
}

/**
 * Validates the raw token straight from the emailed link (?token=...) and
 * changes the password in one step — no separate "verify this code" call.
 * The token itself IS the one-time credential: found by hash, checked for
 * expiry, and deleted immediately after use so the same link can't be
 * replayed.
 */
export async function resetPassword(input: z.infer<typeof resetPasswordSchema>) {
  const otpToken = await prisma.otpToken.findFirst({
    where: { purpose: "PASSWORD_RESET", otpHash: hashToken(input.token), consumedAt: null },
  });
  if (!otpToken || otpToken.expiresAt <= new Date()) {
    throw Errors.validation("This reset link is invalid or has expired — request a new one.");
  }

  await prisma.user.update({
    where: { id: otpToken.userId },
    data: { passwordHash: await hashPassword(input.newPassword) },
  });
  // One-time use: delete it so the same ticket can't reset the password twice.
  await prisma.otpToken.delete({ where: { id: otpToken.id } });
  // Reset invalidates every existing session — a leaked/shared session
  // token from before the reset must not survive it.
  await prisma.session.deleteMany({ where: { userId: otpToken.userId } });
}

export async function changePassword(userId: string, input: z.infer<typeof changePasswordSchema>, currentSessionId: string | undefined) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  if (!(await verifyPassword(input.currentPassword, user.passwordHash))) {
    throw Errors.validation("Current password is incorrect.");
  }
  await prisma.user.update({ where: { id: userId }, data: { passwordHash: await hashPassword(input.newPassword) } });
  // Keep the device/session the user is actively using; drop every other one.
  await prisma.session.deleteMany({ where: { userId, ...(currentSessionId ? { id: { not: currentSessionId } } : {}) } });
}

export function toPublicUser(user: Parameters<typeof publicUser>[0]) {
  return publicUser(user);
}

export async function updateMe(userId: string, input: z.infer<typeof updateMeSchema>, req: Request) {
  const updated = await prisma.user.update({ where: { id: userId }, data: input });
  await prisma.auditLog.create({
    data: { userId, action: "UPDATE", entityType: "User", entityId: userId, newValues: input, ipAddress: req.ip },
  });
  return publicUser(updated);
}

/** Backs settings.html's "Clear All Data" — wipes every piece of financial
 * data this user owns (transactions, recurring rules, budgets,
 * notifications, and their own custom categories — never the shared/global
 * ones) while leaving the account itself, its login, and its active
 * sessions untouched, so the user lands back on a genuinely empty app
 * rather than being logged out. Requires the current password, same
 * standard as changePassword, since this is at least as consequential and
 * a confirmation-modal click alone is too easy to trigger by accident. */
export async function clearMyData(userId: string, password: string, req: Request) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  if (!(await verifyPassword(password, user.passwordHash))) {
    throw Errors.validation("Your password is incorrect.");
  }

  const [transactions, recurring, budgets, notifications, categories] = await prisma.$transaction([
    prisma.transaction.deleteMany({ where: { userId } }),
    prisma.recurringTransaction.deleteMany({ where: { userId } }),
    prisma.budget.deleteMany({ where: { userId } }),
    prisma.notification.deleteMany({ where: { userId } }),
    // Custom categories only — deleting a Transaction first (above, same
    // transaction) clears the Restrict FK that would otherwise block this.
    prisma.category.deleteMany({ where: { userId } }),
  ]);

  await prisma.auditLog.create({
    data: {
      userId,
      action: "DELETE",
      entityType: "User",
      entityId: userId,
      oldValues: {
        transactionsDeleted: transactions.count,
        recurringDeleted: recurring.count,
        budgetsDeleted: budgets.count,
        notificationsDeleted: notifications.count,
        categoriesDeleted: categories.count,
      },
      ipAddress: req.ip,
    },
  });

  return {
    transactionsDeleted: transactions.count,
    recurringDeleted: recurring.count,
    budgetsDeleted: budgets.count,
    notificationsDeleted: notifications.count,
    categoriesDeleted: categories.count,
  };
}
