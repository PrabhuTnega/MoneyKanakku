import bcrypt from "bcryptjs";
import crypto from "node:crypto";

const BCRYPT_ROUNDS = 12;

export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, BCRYPT_ROUNDS);
}

export function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

/** A URL-safe random token, e.g. a session or OTP token given to the client. */
export function randomToken(bytes = 32): string {
  return crypto.randomBytes(bytes).toString("base64url");
}

/**
 * Session/OTP tokens are hashed with plain SHA-256 (not bcrypt) before
 * being stored — these are already high-entropy random values, not
 * low-entropy human passwords, so bcrypt's deliberate slowness buys
 * nothing here and would needlessly slow down every authenticated
 * request's session lookup.
 */
export function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

/** A 6-digit numeric code for OTP flows (forgot-password, email verification). */
export function generateOtp(): string {
  return crypto.randomInt(0, 1_000_000).toString().padStart(6, "0");
}
