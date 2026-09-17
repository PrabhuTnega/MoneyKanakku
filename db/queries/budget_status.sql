-- =====================================================================
-- Budget vs. actual (budget.html) — the query that drives the colored
-- progress bars (bar-safe / bar-warn / bar-danger) and the alert list.
-- Budgets are expense-only by product decision, so both queries below
-- explicitly filter t.type = 'EXPENSE' — defensive and self-documenting,
-- even though Budget.category_id should only ever point at an EXPENSE
-- category in the first place (see schema.prisma's header note on that
-- application-layer invariant).
-- =====================================================================

-- All category budgets for the month with their live spend + status,
-- computed in SQL so the API layer does zero math beyond formatting.
SELECT
  b.id AS budget_id,
  c.id AS category_id,
  c.name, c.icon, c.color,
  b.amount AS budget_amount,
  COALESCE(SUM(t.amount), 0) AS spent,
  ROUND(COALESCE(SUM(t.amount), 0) / b.amount * 100)::int AS percent_used,
  CASE
    WHEN COALESCE(SUM(t.amount), 0) >= b.amount THEN 'danger'
    WHEN COALESCE(SUM(t.amount), 0) >= b.amount * (b.alert_threshold_percent / 100.0) THEN 'warn'
    ELSE 'safe'
  END AS status
FROM budgets b
JOIN categories c ON c.id = b.category_id
LEFT JOIN transactions t
  ON t.category_id = b.category_id
  AND t.user_id = b.user_id
  AND t.type = 'EXPENSE'
  AND t.deleted_at IS NULL
  AND t.transaction_date >= b.month_year
  AND t.transaction_date <  (b.month_year + INTERVAL '1 month')
WHERE b.user_id = $1
  AND b.month_year = $2
  AND b.category_id IS NOT NULL
GROUP BY b.id, c.id
ORDER BY percent_used DESC;

-- Budgets that are at/over their alert threshold — feeds both the
-- "Budget alerts" card on budget.html and the notification generator job.
SELECT
  b.user_id, c.name AS category_name,
  b.amount AS budget_amount,
  SUM(t.amount) AS spent,
  ROUND(SUM(t.amount) / b.amount * 100)::int AS percent_used
FROM budgets b
JOIN categories c ON c.id = b.category_id
JOIN transactions t
  ON t.category_id = b.category_id
  AND t.user_id = b.user_id
  AND t.type = 'EXPENSE'
  AND t.deleted_at IS NULL
  AND t.transaction_date >= b.month_year
  AND t.transaction_date <  (b.month_year + INTERVAL '1 month')
WHERE b.month_year = $1  -- run once per day for "the current month" across all users
GROUP BY b.id, c.name
HAVING SUM(t.amount) >= b.amount * (b.alert_threshold_percent / 100.0);
