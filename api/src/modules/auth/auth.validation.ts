import { z } from "zod";

export const registerSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(120),
  email: z.string().trim().toLowerCase().email(),
  phone: z.string().trim().min(7).max(20).optional(),
  password: z.string().min(8, "Password must be at least 8 characters").max(200),
});

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1, "Password is required"),
});

export const forgotPasswordSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
});

export const resendOtpSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  purpose: z.enum(["PASSWORD_RESET", "EMAIL_VERIFICATION"]),
});

export const verifyOtpSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  purpose: z.enum(["PASSWORD_RESET", "EMAIL_VERIFICATION"]),
  code: z.string().length(6, "Enter the 6-digit code"),
});

/** `token` is the raw, single-use secret straight from the reset-link email
 * (reset-password.html?token=...) — not a resetTicket obtained through a
 * separate verify-code step. See auth.service.ts's resetPassword. */
export const resetPasswordSchema = z.object({
  token: z.string().min(1, "This reset link is missing its token."),
  newPassword: z.string().min(8, "Password must be at least 8 characters").max(200),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8, "Password must be at least 8 characters").max(200),
});

/** Backs settings.html's "Clear All Data" — a real destructive action, so
 * (like changePasswordSchema) it requires the current password rather than
 * trusting a confirmation-modal click alone. */
export const clearDataSchema = z.object({
  password: z.string().min(1, "Enter your password to confirm"),
});

/** Self-service profile edits — deliberately NOT email (login identity —
 * changing it here without a re-verification step would be a real account-
 * takeover-adjacent risk) and not password (that's changePasswordSchema's
 * job, which requires the current password). */
export const updateMeSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(120).optional(),
  phone: z.string().trim().min(7).max(20).nullable().optional(),
  currency: z.string().trim().length(3, "Use a 3-letter currency code").toUpperCase().optional(),
  timezone: z.string().trim().min(1).max(60).optional(),
});
