-- =====================================================================
-- admin-live-ops.html — where each metric actually comes from.
--
-- Only "Hottest endpoints" / "Slowest endpoints" / "API req/min" are real
-- SQL against our own tables. Everything else on that page is either:
--   - live in-process state (In-flight Requests, Process CPU/memory/PID/
--     uptime) — never touches the database at all, and shouldn't.
--   - a query against POSTGRES ITSELF (pg_stat_* system views), not our
--     application schema — see the "Database health" section below.
-- The page currently simulates all of this client-side (see
-- assets/js/live-ops-data.js) since there's no API process yet; these are
-- the queries that will back it for real.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Online Users / Active Sessions — from our own `sessions` table.
--
-- Since the access+refresh token split (api/README.md), a `sessions` row
-- is a DEVICE'S REFRESH TOKEN (30-day, rotated on every silent refresh),
-- not a short-lived "currently signed in" marker — access-token checks
-- themselves never touch this table at all. So:
--   - Active Sessions = devices that could silently resume right now
--     without a real login (expires_at > now()).
--   - Online Users still means "seen in the last 5 minutes", kept
--     meaningful by a throttled activity ping (see lib/session.ts's
--     touchSessionActivity()) that runs on every verified access token,
--     independent of the ~15-minute refresh cadence.
-- ---------------------------------------------------------------------

-- Active Sessions: not yet expired.
SELECT count(*) AS active_sessions FROM sessions WHERE expires_at > now();

-- Online Users: distinct users with any activity in the last 5 minutes.
-- Tune the window to match how often the client actually pings/refreshes.
SELECT count(DISTINCT user_id) AS online_users
FROM sessions
WHERE last_active_at > now() - interval '5 minutes';

-- ---------------------------------------------------------------------
-- API req/min, Hottest endpoints, Slowest endpoints (p95) — from our own
-- `request_logs` table, which real API middleware inserts one row into
-- per request (see schema.prisma's RequestLog model for why it has no FK
-- on user_id and is indexed for exactly these two query shapes).
-- ---------------------------------------------------------------------

-- API req/min (last 60 seconds).
SELECT count(*) AS req_last_minute
FROM request_logs
WHERE created_at > now() - interval '1 minute';

-- 2xx / 4xx / 5xx split (last 5 minutes) — feeds the status-code line
-- under the API Latency card.
SELECT
  round(100.0 * count(*) FILTER (WHERE status_code < 300) / count(*), 1) AS pct_2xx,
  round(100.0 * count(*) FILTER (WHERE status_code BETWEEN 400 AND 499) / count(*), 1) AS pct_4xx,
  round(100.0 * count(*) FILTER (WHERE status_code >= 500) / count(*), 1) AS pct_5xx
FROM request_logs
WHERE created_at > now() - interval '5 minutes';

-- Hottest endpoints (by request volume, last 5 minutes).
SELECT
  method, path,
  count(*)                                        AS req_count,
  round(count(*) / 5.0)                           AS req_per_min,
  round(avg(duration_ms))                         AS avg_latency_ms,
  round(100.0 * count(*) / sum(count(*)) OVER (), 1) AS pct_of_traffic
FROM request_logs
WHERE created_at > now() - interval '5 minutes'
GROUP BY method, path
ORDER BY req_count DESC
LIMIT 10;

-- Slowest endpoints by p95 latency (last 15 minutes) — needs at least a
-- few dozen samples per endpoint to be a meaningful percentile; below
-- that, prefer showing avg/max instead of p95 to avoid a misleading
-- single-sample "p95".
SELECT
  method, path,
  count(*)                                                          AS req_count,
  round(percentile_cont(0.95) WITHIN GROUP (ORDER BY duration_ms))  AS p95_ms
FROM request_logs
WHERE created_at > now() - interval '15 minutes'
GROUP BY method, path
HAVING count(*) >= 5
ORDER BY p95_ms DESC
LIMIT 10;

-- API latency percentiles overall (last 5 minutes) — the p50/p95/p99
-- numbers at the top of the API Latency card.
SELECT
  round(percentile_cont(0.50) WITHIN GROUP (ORDER BY duration_ms)) AS p50_ms,
  round(percentile_cont(0.95) WITHIN GROUP (ORDER BY duration_ms)) AS p95_ms,
  round(percentile_cont(0.99) WITHIN GROUP (ORDER BY duration_ms)) AS p99_ms
FROM request_logs
WHERE created_at > now() - interval '5 minutes';

-- ---------------------------------------------------------------------
-- Database health — these read Postgres's OWN system catalogs, not any
-- table we defined. Run with a role that can see pg_stat_activity across
-- the whole instance (superuser, or a role granted pg_monitor).
-- ---------------------------------------------------------------------

-- Connections in use vs. the configured max.
SELECT
  (SELECT count(*) FROM pg_stat_activity) AS connections_used,
  (SELECT setting::int FROM pg_settings WHERE name = 'max_connections') AS connections_max;

-- Cache hit ratio — should stay north of ~95% for a healthy working set;
-- a sustained drop means the DB is reading from disk more than RAM.
SELECT
  round(100.0 * sum(blks_hit) / NULLIF(sum(blks_hit) + sum(blks_read), 0), 1) AS cache_hit_ratio_pct
FROM pg_stat_database;

-- Database size on disk.
SELECT pg_size_pretty(pg_database_size(current_database())) AS database_size;

-- Slow queries currently in flight (running longer than 500ms) — a
-- non-zero count here is exactly what the "Slow queries" stat on the
-- Database card is watching for.
SELECT count(*) AS slow_queries
FROM pg_stat_activity
WHERE state = 'active' AND now() - query_start > interval '500 milliseconds';

-- ---------------------------------------------------------------------
-- Retention: request_logs is the highest-volume table in the schema by
-- far — prune it on a schedule (daily cron in the API layer), not with a
-- one-off manual DELETE. See scaling_notes.sql for the partitioning path
-- once volume makes even this too slow.
-- ---------------------------------------------------------------------
-- DELETE FROM request_logs WHERE created_at < now() - interval '30 days';
