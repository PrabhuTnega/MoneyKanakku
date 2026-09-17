-- Hand-written constraints that Prisma's schema language cannot express yet.
-- Written directly against the tables created by
-- 20260911174827_init_v2_income_ops_timestamptz.

-- ---------------------------------------------------------------------
-- Business rule (FRS 9): "Expense amount must be greater than zero."
-- Applies equally to income rows — an amount is always a positive
-- magnitude; the `type` column (EXPENSE|INCOME) carries the direction,
-- not the sign of `amount`.
-- ---------------------------------------------------------------------
ALTER TABLE "transactions"
  ADD CONSTRAINT "transactions_amount_positive" CHECK ("amount" > 0);

ALTER TABLE "recurring_transactions"
  ADD CONSTRAINT "recurring_transactions_amount_positive" CHECK ("amount" > 0);

-- Budget amounts and alert thresholds must also be sane.
ALTER TABLE "budgets"
  ADD CONSTRAINT "budgets_amount_positive" CHECK ("amount" > 0);

ALTER TABLE "budgets"
  ADD CONSTRAINT "budgets_alert_threshold_range"
  CHECK ("alert_threshold_percent" BETWEEN 1 AND 100);

-- ---------------------------------------------------------------------
-- FRS 9: "Expense date must be valid" — disallow far-future backdating
-- errors (e.g. year typos) while still allowing same-day entry. Applies
-- to income too (e.g. a salary can't be logged for next year by mistake).
-- ---------------------------------------------------------------------
ALTER TABLE "transactions"
  ADD CONSTRAINT "transactions_date_not_future"
  CHECK ("transaction_date" <= now() + interval '1 day');

-- ---------------------------------------------------------------------
-- Global categories (user_id IS NULL) must have unique names WITHIN their
-- type — "Other" (an expense category) and "Other Income" already have
-- different names today, but two same-named categories of different types
-- (e.g. a future "Refunds" expense category alongside the existing
-- "Refunds" income category) must remain distinct rows, not collide.
-- A plain UNIQUE(user_id, name, transaction_type) does not catch the
-- user_id IS NULL case because Postgres treats every NULL as distinct.
-- ---------------------------------------------------------------------
CREATE UNIQUE INDEX "categories_global_name_unique"
  ON "categories" ("name", "transaction_type")
  WHERE "user_id" IS NULL;

-- ---------------------------------------------------------------------
-- Exactly one "overall" (categoryId IS NULL) budget per user per month.
-- Same NULL-uniqueness gap as above, for the same reason.
-- ---------------------------------------------------------------------
CREATE UNIQUE INDEX "budgets_overall_unique"
  ON "budgets" ("user_id", "month_year")
  WHERE "category_id" IS NULL;

-- ---------------------------------------------------------------------
-- Performance: almost every query on transactions / recurring_transactions
-- filters out soft-deleted rows first, and the Expense/Income toggle in
-- the UI filters by type on top of that. Partial indexes keep those
-- lookups to the live rows of one type only.
-- ---------------------------------------------------------------------
CREATE INDEX "transactions_user_type_date_active_idx"
  ON "transactions" ("user_id", "type", "transaction_date" DESC)
  WHERE "deleted_at" IS NULL;

CREATE INDEX "recurring_transactions_active_idx"
  ON "recurring_transactions" ("user_id", "type")
  WHERE "deleted_at" IS NULL AND "is_paused" = false;

-- ---------------------------------------------------------------------
-- Budgets are expense-only by product decision (see schema.prisma header).
-- Postgres can't CHECK across tables without a trigger, and a trigger is
-- heavier machinery than this one product rule warrants — enforced at the
-- application layer instead. Left as a comment here so the constraint's
-- absence reads as a decision, not an oversight:
--   Budget.category_id must reference a categories row where
--   transaction_type = 'EXPENSE'.
-- ---------------------------------------------------------------------
