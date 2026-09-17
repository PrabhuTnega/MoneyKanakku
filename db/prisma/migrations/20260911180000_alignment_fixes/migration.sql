-- UI/DB alignment audit fixes (2026-09-11), done right before starting the
-- API layer:
--   1. OtpPurpose.LOGIN_2FA removed — the UI never shipped a 2FA toggle
--      (explicitly removed from settings.html earlier), so no flow could
--      ever create a token with this purpose. Unused enum value, cleaned
--      up rather than left as speculative schema.
--   2. RecurringTransaction.remindersEnabled added — recurring-form.html's
--      "Remind me N days before" is a single on/off switch, and the
--      existing remindBeforeDays (an Int) had no clean way to represent
--      "reminders off" without overloading 0, which would be ambiguous
--      with a genuine same-day reminder.
--
-- NOTE: `prisma migrate diff` also proposed `DROP INDEX
-- transactions_description_trgm_idx` here — that index was added by hand
-- in 20260911175000_search_indexes/migration.sql and isn't represented in
-- schema.prisma (Prisma has no syntax for a trigram index yet), so plain
-- diffing against live DB state sees it as "extra" and wants to remove
-- it. That line was deliberately dropped from this migration — removing
-- it would have silently killed search.html's search index.

-- ---------------------------------------------------------------------
-- 1. OtpPurpose: drop LOGIN_2FA
-- ---------------------------------------------------------------------
BEGIN;
CREATE TYPE "OtpPurpose_new" AS ENUM ('PASSWORD_RESET', 'EMAIL_VERIFICATION');
ALTER TABLE "otp_tokens" ALTER COLUMN "purpose" TYPE "OtpPurpose_new" USING ("purpose"::text::"OtpPurpose_new");
ALTER TYPE "OtpPurpose" RENAME TO "OtpPurpose_old";
ALTER TYPE "OtpPurpose_new" RENAME TO "OtpPurpose";
DROP TYPE "public"."OtpPurpose_old";
COMMIT;

-- ---------------------------------------------------------------------
-- 2. RecurringTransaction: add remindersEnabled
-- ---------------------------------------------------------------------
ALTER TABLE "recurring_transactions" ADD COLUMN "reminders_enabled" BOOLEAN NOT NULL DEFAULT true;
