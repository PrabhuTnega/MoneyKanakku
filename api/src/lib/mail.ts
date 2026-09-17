import nodemailer from "nodemailer";
import { env } from "../config/env.js";

let transporter: import("nodemailer").Transporter | null = null;

function getTransporter() {
  if (!env.SMTP_HOST) return null;
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_SECURE, // true = implicit TLS (port 465); false = STARTTLS (port 587)
      auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
    });
  }
  return transporter;
}

/**
 * Sends the "reset your password" email with a clickable link — no code to
 * type in. If SMTP isn't configured (SMTP_HOST unset), falls back to
 * logging the link to the console instead of throwing, so local dev stays
 * usable without a real inbox (same spirit as the old devOtp-in-response
 * fallback this replaces for the password-reset flow specifically).
 */
export async function sendPasswordResetEmail(to: string, resetUrl: string) {
  const subject = "Reset your MoneyKanakku password";
  const html = `
    <div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;color:#181828;">
      <div style="width:48px;height:48px;border-radius:14px;background:linear-gradient(135deg,#8b76ff,#3b82f6);display:flex;align-items:center;justify-content:center;font-size:22px;font-weight:800;color:#fff;margin-bottom:20px;">₹</div>
      <h2 style="margin:0 0 8px;font-size:20px;">Reset your password</h2>
      <p style="color:#6b6f8a;font-size:14px;line-height:1.6;">
        We received a request to reset the password for your MoneyKanakku account (${to}).
        Click the button below to choose a new one. This link expires in 10 minutes.
      </p>
      <a href="${resetUrl}" style="display:inline-block;margin:20px 0;padding:12px 28px;background:#6c5ce7;color:#fff;text-decoration:none;border-radius:10px;font-weight:700;font-size:14px;">Reset Password</a>
      <p style="color:#9a9db8;font-size:12.5px;line-height:1.6;">
        If you didn't request this, you can safely ignore this email — your password won't change.
        <br>If the button doesn't work, copy and paste this link into your browser:<br>
        <span style="word-break:break-all;">${resetUrl}</span>
      </p>
    </div>
  `.trim();

  const t = getTransporter();
  if (!t) {
    console.log(`[mail] SMTP not configured — password reset link for ${to}:\n  ${resetUrl}`);
    return;
  }

  await t.sendMail({
    from: env.SMTP_FROM || env.SMTP_USER,
    to,
    subject,
    html,
  });
}
