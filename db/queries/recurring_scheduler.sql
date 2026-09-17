-- =====================================================================
-- Recurring-transaction scheduler (FRS 4.6: "Automatically generate
-- scheduled expenses according to configured recurrence rules" — now
-- extended to recurring INCOME too, e.g. a monthly Salary rule). Intended
-- to run once a day (cron / scheduled job in the API layer).
-- Hits recurring_transactions_active_idx directly.
-- =====================================================================

-- Step 1: find every rule due today (or earlier, in case the job missed a
-- day) that isn't paused, deleted, or past its end date — Expense and
-- Income rules are scanned together; `type` just rides along into the
-- generated row.
SELECT id, user_id, category_id, type, payment_method, title, amount,
       frequency, next_due_date, remind_before_days
FROM recurring_transactions
WHERE deleted_at IS NULL
  AND is_paused = false
  AND auto_generate = true
  AND next_due_date <= CURRENT_DATE
  AND (end_date IS NULL OR end_date >= CURRENT_DATE);

-- Step 2 (per row from step 1, inside one transaction per rule): insert the
-- generated transaction ($3 = type, carried straight from the rule)...
INSERT INTO transactions (id, user_id, category_id, type, payment_method, amount,
                           currency, transaction_date, description, is_recurring,
                           recurring_transaction_id, created_at, updated_at)
VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, 'INR', $6, $7, true, $8, now(), now());

-- ...then roll next_due_date forward by the rule's frequency so the same
-- row is never double-generated.
UPDATE recurring_transactions
SET next_due_date = CASE frequency
      WHEN 'WEEKLY'  THEN next_due_date + INTERVAL '1 week'
      WHEN 'MONTHLY' THEN next_due_date + INTERVAL '1 month'
      WHEN 'YEARLY'  THEN next_due_date + INTERVAL '1 year'
    END,
    updated_at = now()
WHERE id = $1;

-- Step 3: reminder notifications — rules due within their own
-- remind_before_days window that haven't been reminded for this cycle yet
-- (the API layer checks the Notification table before inserting to avoid
-- duplicates; kept as an application-level check rather than a unique
-- index because "one reminder per rule per due-date" is a soft rule, not
-- a data-integrity one). The API layer picks RECURRING_REMINDER for
-- type='EXPENSE' rules and INCOME_RECEIVED-style copy for type='INCOME'
-- ones (e.g. "Salary due in 3 days" vs "Rent due in 3 days").
SELECT id, user_id, type, title, amount, next_due_date
FROM recurring_transactions
WHERE deleted_at IS NULL
  AND is_paused = false
  AND next_due_date - (remind_before_days || ' days')::interval <= CURRENT_DATE
  AND next_due_date >= CURRENT_DATE;
