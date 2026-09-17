import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(4100),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  CORS_ORIGIN: z.string().min(1),
  ACCESS_COOKIE_NAME: z.string().min(1).default("expensio_at"),
  REFRESH_COOKIE_NAME: z.string().min(1).default("expensio_rt"),
  ACCESS_TOKEN_TTL_MINUTES: z.coerce.number().int().positive().default(15),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(30),
  COOKIE_SECRET: z.string().min(16, "COOKIE_SECRET must be at least 16 characters"),
  // How many reverse-proxy hops to trust for X-Forwarded-For (Express's
  // `trust proxy` setting) — controls what req.ip / req.secure resolve to,
  // which in turn is what rate-limiting keys by and what audit logs record.
  // Left at 0 (trust nothing, use the raw socket address) by default: safe
  // for local dev and for a deployment with NO reverse proxy in front, but
  // WRONG behind one — every request would then appear to come from the
  // proxy's own IP, silently rate-limiting all users together as if they
  // were one client. Set to the exact number of proxies actually in front
  // of this process in production (typically 1 for a single nginx/Cloudflare/
  // PaaS load balancer) — never a permissive `true`, which trusts ANY
  // client-supplied X-Forwarded-For and lets it spoof its own rate-limit
  // identity and audit-log IP.
  TRUST_PROXY: z.coerce.number().int().min(0).default(0),

  // Real SMTP for forgot-password reset-link emails (see lib/mail.ts). All
  // optional — if SMTP_HOST is unset, mail.ts falls back to logging the
  // reset link to the console instead of crashing, same spirit as the old
  // devOtp-in-response fallback this replaces.
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().positive().default(587),
  // z.coerce.boolean() would treat the STRING "false" as truthy (any
  // non-empty string coerces to true) — parse the actual word instead.
  SMTP_SECURE: z.enum(["true", "false"]).default("false").transform((v) => v === "true"),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_FROM: z.string().optional(),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("Invalid environment configuration:");
  console.error(parsed.error.format());
  process.exit(1);
}

export const env = parsed.data;
export const isProd = env.NODE_ENV === "production";
