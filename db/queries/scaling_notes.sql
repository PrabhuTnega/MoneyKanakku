-- =====================================================================
-- Scaling notes — not applied by default. Two separate scaling problems,
-- on two very different timelines:
--   1. `transactions` growing into the tens of thousands of rows per user
--      (months to years away, grows with real usage).
--   2. `request_logs` growing into the millions of rows total (days to
--      weeks away once a real API is live — every request writes one row).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. transactions: monthly per-user/category/type rollup, refreshed
--    nightly, turns every "last 12 months" / "yearly summary" chart query
--    from an O(all transactions) aggregate into an O(12-ish rows) lookup.
-- ---------------------------------------------------------------------
CREATE MATERIALIZED VIEW monthly_category_summary AS
SELECT
  user_id,
  category_id,
  type,
  date_trunc('month', transaction_date)::date AS month_start,
  SUM(amount) AS total,
  COUNT(*)    AS txn_count
FROM transactions
WHERE deleted_at IS NULL
GROUP BY user_id, category_id, type, date_trunc('month', transaction_date);

CREATE UNIQUE INDEX ON monthly_category_summary (user_id, category_id, type, month_start);

-- Refresh strategy: CONCURRENTLY so reads are never blocked while it
-- rebuilds (requires the unique index above). Schedule this right after
-- the recurring-transaction scheduler job runs each night.
-- REFRESH MATERIALIZED VIEW CONCURRENTLY monthly_category_summary;

-- Once this view exists, reports.sql's "Yearly Summary" / "Trend" tabs and
-- the dashboard's Income-vs-Expense trend all become:
--
-- SELECT month_start,
--        SUM(total) FILTER (WHERE type = 'INCOME')  AS income_total,
--        SUM(total) FILTER (WHERE type = 'EXPENSE') AS expense_total
-- FROM monthly_category_summary
-- WHERE user_id = $1 AND month_start >= $2
-- GROUP BY month_start
-- ORDER BY month_start;
--
-- i.e. summing ~12-24 pre-aggregated rows instead of scanning every
-- transaction the user has ever recorded.

-- ---------------------------------------------------------------------
-- 2. request_logs: this table has no natural cap — it grows with every
--    single API call, forever, unlike `transactions` which grows with
--    genuine user activity. Two complementary fixes, applied together in
--    a real deployment:
-- ---------------------------------------------------------------------

-- a) Retention: prune anything past the window Live Ops actually looks at
--    (see system_settings.data_retention.request_log_days, seeded to 30).
--    Run daily, off-peak:
-- DELETE FROM request_logs WHERE created_at < now() - interval '30 days';

-- b) Partitioning by day, so pruning is a near-instant DROP PARTITION
--    instead of a slow row-by-row DELETE once the table is large. This is
--    the standard Postgres pattern for any high-volume, time-ordered,
--    retention-bounded table — request/access logs are the textbook case.
--    Sketch (would replace the plain CREATE TABLE in the Prisma migration
--    with a partitioned parent + a script that creates tomorrow's
--    partition daily):
--
-- CREATE TABLE request_logs (
--   id BIGINT GENERATED ALWAYS AS IDENTITY,
--   method VARCHAR(10) NOT NULL,
--   path VARCHAR(255) NOT NULL,
--   status_code INT NOT NULL,
--   duration_ms INT NOT NULL,
--   user_id UUID,
--   ip_address VARCHAR(45),
--   created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
--   PRIMARY KEY (id, created_at)
-- ) PARTITION BY RANGE (created_at);
--
-- CREATE TABLE request_logs_2026_09_11 PARTITION OF request_logs
--   FOR VALUES FROM ('2026-09-11') TO ('2026-09-12');
--
-- -- Pruning becomes:
-- -- DROP TABLE request_logs_2026_08_12;  -- instant, no WAL bloat
--
-- Prisma doesn't manage partitioned tables natively — this would be
-- introduced as its own hand-written migration once request_logs volume
-- actually warrants it, not before (see the project's general rule:
-- don't build for load that doesn't exist yet).
