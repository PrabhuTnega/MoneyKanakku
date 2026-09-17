-- =====================================================================
-- Reports & Analytics (reports.html) — one query per tab.
-- =====================================================================

-- "Category-wise" tab: breakdown + detail table, toggled between Expense
-- and Income by $3 ('EXPENSE' | 'INCOME') — same shape as
-- dashboard.sql's category-breakdown query, reused here for the report's
-- deeper per-category table (adds txn_count).
SELECT
  c.id, c.name, c.icon, c.color,
  COALESCE(SUM(t.amount), 0) AS total,
  COUNT(t.id)                AS txn_count,
  ROUND(COALESCE(SUM(t.amount), 0) / NULLIF(SUM(SUM(t.amount)) OVER (), 0) * 100, 1) AS percent_share
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

-- "Payment Method" tab: spend + share per method for the month
-- (expense-side, matching how payment method is framed throughout the
-- UI — "how did I pay" rather than "how did I get paid").
SELECT
  payment_method,
  SUM(amount) AS total,
  COUNT(*)    AS txn_count,
  ROUND(SUM(amount) / SUM(SUM(amount)) OVER () * 100, 1) AS percent_share
FROM transactions
WHERE user_id = $1
  AND type = 'EXPENSE'
  AND deleted_at IS NULL
  AND transaction_date >= $2
  AND transaction_date <  ($2::date + INTERVAL '1 month')
GROUP BY payment_method
ORDER BY total DESC;

-- "Trend" tab: Income vs Expense, last 12 months (two-line chart).
SELECT
  date_trunc('month', transaction_date)::date AS month_start,
  SUM(amount) FILTER (WHERE type = 'INCOME')  AS income_total,
  SUM(amount) FILTER (WHERE type = 'EXPENSE') AS expense_total
FROM transactions
WHERE user_id = $1
  AND deleted_at IS NULL
  AND transaction_date >= date_trunc('month', $2::date) - INTERVAL '11 months'
GROUP BY 1
ORDER BY 1;

-- "Yearly Summary" tab: income, expense, budget, budget-variance and net
-- savings per month for the year — same shape as the table under
-- reports.html's Yearly pane (5 data columns beyond the month name).
WITH months AS (
  SELECT generate_series(
    date_trunc('year', $2::date),
    date_trunc('year', $2::date) + INTERVAL '11 months',
    INTERVAL '1 month'
  )::date AS month_start
),
totals AS (
  SELECT
    date_trunc('month', transaction_date)::date AS month_start,
    SUM(amount) FILTER (WHERE type = 'INCOME')  AS income_total,
    SUM(amount) FILTER (WHERE type = 'EXPENSE') AS expense_total
  FROM transactions
  WHERE user_id = $1 AND deleted_at IS NULL
  GROUP BY 1
),
budget AS (
  SELECT month_year AS month_start, amount AS budget_amount
  FROM budgets
  WHERE user_id = $1 AND category_id IS NULL
)
SELECT
  m.month_start,
  COALESCE(t.income_total, 0)                                          AS income,
  COALESCE(t.expense_total, 0)                                         AS expense,
  COALESCE(b.budget_amount, 0)                                         AS budget,
  COALESCE(b.budget_amount, 0) - COALESCE(t.expense_total, 0)          AS budget_variance,
  COALESCE(t.income_total, 0) - COALESCE(t.expense_total, 0)           AS net_savings
FROM months m
LEFT JOIN totals t ON t.month_start = m.month_start
LEFT JOIN budget b ON b.month_start = m.month_start
ORDER BY m.month_start;

-- Daily spending within the month, for the "Daily spending" bar chart on
-- the Monthly tab (fills gaps with 0 so the x-axis has every day).
-- Expense-side, matching the chart's current scope on reports.html.
WITH days AS (
  SELECT generate_series($2::date, ($2::date + INTERVAL '1 month' - INTERVAL '1 day')::date, INTERVAL '1 day')::date AS day
)
SELECT d.day, COALESCE(SUM(t.amount), 0) AS total
FROM days d
LEFT JOIN transactions t
  ON t.transaction_date::date = d.day
  AND t.user_id = $1
  AND t.type = 'EXPENSE'
  AND t.deleted_at IS NULL
GROUP BY d.day
ORDER BY d.day;
