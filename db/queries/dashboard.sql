-- =====================================================================
-- Dashboard queries (dashboard.html)
-- Every query here is designed to hit one of:
--   transactions_user_type_date_active_idx (user_id, type, transaction_date
--     DESC) WHERE deleted_at IS NULL          <- the hot path everywhere
--   transactions_user_id_category_id_idx     <- category breakdown
-- On the seed data these will show a Seq Scan simply because the table is
-- tiny (Postgres correctly prefers a scan below its cost threshold), but
-- the plan flips to an Index Scan once the table has a realistic row
-- count (a few thousand+). Confirm with EXPLAIN ANALYZE at that point.
-- =====================================================================

-- 1. Current month total EXPENSE + remaining budget (hero card).
--    Budgets are expense-only by product decision, so this only ever
--    sums type='EXPENSE' rows even though the table holds both.
--    Params: $1 = user_id, $2 = month start (e.g. 2026-09-01)
SELECT
  COALESCE(SUM(t.amount), 0)                                   AS total_spent,
  b.amount                                                     AS budget_amount,
  b.amount - COALESCE(SUM(t.amount), 0)                        AS remaining
FROM budgets b
LEFT JOIN transactions t
  ON t.user_id = b.user_id
  AND t.type = 'EXPENSE'
  AND t.deleted_at IS NULL
  AND t.transaction_date >= b.month_year
  AND t.transaction_date <  (b.month_year + INTERVAL '1 month')
WHERE b.user_id = $1
  AND b.category_id IS NULL
  AND b.month_year = $2
GROUP BY b.amount;

-- 2. Income vs Expense card: both totals + net savings in one round trip.
SELECT
  COALESCE(SUM(amount) FILTER (WHERE type = 'INCOME'), 0)  AS total_income,
  COALESCE(SUM(amount) FILTER (WHERE type = 'EXPENSE'), 0) AS total_expense,
  COALESCE(SUM(amount) FILTER (WHERE type = 'INCOME'), 0)
    - COALESCE(SUM(amount) FILTER (WHERE type = 'EXPENSE'), 0) AS net_savings
FROM transactions
WHERE user_id = $1
  AND deleted_at IS NULL
  AND transaction_date >= $2
  AND transaction_date <  ($2::date + INTERVAL '1 month');

-- 3. Daily average + transaction count for the month (expense side, for
--    the "Daily average" / budget-remaining stat tiles).
SELECT
  COUNT(*)                                                      AS txn_count,
  COALESCE(SUM(amount), 0)                                      AS total_spent,
  COALESCE(SUM(amount), 0) / GREATEST(EXTRACT(DAY FROM now())::int, 1) AS daily_avg
FROM transactions
WHERE user_id = $1
  AND type = 'EXPENSE'
  AND deleted_at IS NULL
  AND transaction_date >= $2
  AND transaction_date <  ($2::date + INTERVAL '1 month');

-- 4. Category-wise breakdown for the donut chart + legend. $3 = 'EXPENSE'
--    or 'INCOME' — the dashboard donut is expense-only today, but
--    categories.html / reports.html reuse this exact shape for both.
SELECT
  c.id, c.name, c.icon, c.color,
  COALESCE(SUM(t.amount), 0) AS total,
  COUNT(t.id)                AS txn_count
FROM categories c
LEFT JOIN transactions t
  ON t.category_id = c.id
  AND t.user_id = $1
  AND t.deleted_at IS NULL
  AND t.transaction_date >= $2
  AND t.transaction_date <  ($2::date + INTERVAL '1 month')
WHERE (c.user_id = $1 OR c.user_id IS NULL)
  AND c.transaction_type = $3
GROUP BY c.id
HAVING COALESCE(SUM(t.amount), 0) > 0
ORDER BY total DESC;

-- 5. Recent transactions list (top 5, both Income and Expense mixed) —
--    the money query for the whole app. Hits
--    transactions_user_type_date_active_idx if filtered by type, or the
--    plain (user_id, type, transaction_date) index either way; no sort
--    step needed since the index is already in transaction_date DESC.
SELECT t.id, t.type, t.amount, t.transaction_date, t.description, t.payment_method,
       c.name AS category_name, c.icon AS category_icon, c.color AS category_color
FROM transactions t
JOIN categories c ON c.id = t.category_id
WHERE t.user_id = $1
  AND t.deleted_at IS NULL
ORDER BY t.transaction_date DESC
LIMIT 5;

-- 6. Month-over-month trend (last 6 months), Income and Expense as two
--    series for the same line chart.
--    date_trunc on transaction_date prevents index usage on a huge table;
--    at that scale switch to a monthly rollup table maintained by a
--    scheduled REFRESH instead of aggregating raw rows every request —
--    see queries/scaling_notes.sql.
SELECT
  date_trunc('month', transaction_date)::date AS month,
  SUM(amount) FILTER (WHERE type = 'INCOME')  AS income_total,
  SUM(amount) FILTER (WHERE type = 'EXPENSE') AS expense_total
FROM transactions
WHERE user_id = $1
  AND deleted_at IS NULL
  AND transaction_date >= $2::date - INTERVAL '6 months'
GROUP BY 1
ORDER BY 1;
