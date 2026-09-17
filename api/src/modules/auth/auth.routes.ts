import { Router } from "express";
import * as authController from "./auth.controller.js";
import { validateBody } from "../../middleware/validate.js";
import { requireAuth } from "../../middleware/auth.middleware.js";
import { authRateLimit, refreshRateLimit } from "../../middleware/rate-limit.js";
import {
  registerSchema,
  loginSchema,
  forgotPasswordSchema,
  resendOtpSchema,
  verifyOtpSchema,
  resetPasswordSchema,
  changePasswordSchema,
  updateMeSchema,
  clearDataSchema,
} from "./auth.validation.js";

export const authRouter = Router();

// Backs register.html
authRouter.post("/register", authRateLimit, validateBody(registerSchema), authController.register);
// Backs login.html
authRouter.post("/login", authRateLimit, validateBody(loginSchema), authController.login);
// Called automatically by the frontend's silent-refresh interceptor
// (assets/js/api.js) whenever a request 401s on an expired access token —
// never called directly by page code. Rotates the refresh token too.
authRouter.post("/refresh", refreshRateLimit, authController.refresh);
// Backs profile.html's logout confirmation. Not requireAuth-gated — see
// the comment in auth.controller.ts's logout().
authRouter.post("/logout", authController.logout);
// App bootstrap / route guards call this to know if a session is live.
// requireAuth here means an expired access token 401s, which is exactly
// what triggers the frontend's silent-refresh-then-retry.
authRouter.get("/me", requireAuth, authController.me);
// Backs settings.html's Personal Information + Preferences (currency)
// sections. Deliberately excludes email/password — see the doc comment on
// updateMeSchema for why.
authRouter.patch("/me", requireAuth, validateBody(updateMeSchema), authController.updateMe);
// Backs forgot-password.html
authRouter.post("/forgot-password", authRateLimit, validateBody(forgotPasswordSchema), authController.forgotPassword);
// Backs otp-verify.html's "Resend code" link
authRouter.post("/resend-otp", authRateLimit, validateBody(resendOtpSchema), authController.resendOtp);
// Backs otp-verify.html (both the register and forgot-password flows)
authRouter.post("/verify-otp", authRateLimit, validateBody(verifyOtpSchema), authController.verifyOtp);
// Backs reset-password.html
authRouter.post("/reset-password", authRateLimit, validateBody(resetPasswordSchema), authController.resetPassword);
// Backs change-password.html. Rate-limited like every other password-check
// endpoint — this one's authenticated, but a leaked/stolen access token
// shouldn't get unlimited guesses at the account's actual password either.
authRouter.post("/change-password", requireAuth, authRateLimit, validateBody(changePasswordSchema), authController.changePassword);
// Backs settings.html's "Clear All Data" — see clearMyData's doc comment
// in auth.service.ts for exactly what this does and doesn't touch.
authRouter.post("/clear-data", requireAuth, authRateLimit, validateBody(clearDataSchema), authController.clearData);
