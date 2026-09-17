import { prisma } from "../../lib/prisma.js";
import { getInFlightCount } from "../../middleware/in-flight.js";

const PROCESS_START = new Date();

/**
 * One endpoint, three genuinely different data sources — see
 * db/queries/live_ops.sql, which this implements line for line:
 *   1. `sessions` (our own table) for Online Users / Active Sessions.
 *      Since the access+refresh split (see api/README.md), a `sessions`
 *      row is a device's refresh token — "Active Sessions" now means
 *      devices that could silently resume without a real login, and
 *      "Online Users" relies on the throttled activity-ping in
 *      lib/session.ts's touchSessionActivity() to stay meaningful even
 *      though access-token checks themselves never touch this table.
 *   2. `request_logs` (our own table) for req/min, latency percentiles,
 *      and hottest/slowest endpoints.
 *   3. Postgres's OWN system catalogs (pg_stat_activity, pg_stat_database,
 *      pg_database_size) for database health — these are not application
 *      tables, they're the database introspecting itself.
 * In-flight requests and process stats never touch the database at all —
 * they're this Node process's own live state.
 */
export async function getLiveOps() {
  const [
    activeSessions,
    onlineUsers,
    reqLastMinute,
    statusSplit,
    hottestEndpoints,
    slowestEndpoints,
    latencyPercentiles,
    connections,
    cacheHitRatio,
    dbSize,
    slowQueries,
  ] = await Promise.all([
    prisma.session.count({ where: { expiresAt: { gt: new Date() } } }),
    prisma.$queryRaw<{ count: bigint }[]>`SELECT count(DISTINCT user_id) FROM sessions WHERE last_active_at > now() - interval '5 minutes'`,
    prisma.requestLog.count({ where: { createdAt: { gt: new Date(Date.now() - 60_000) } } }),
    prisma.$queryRaw<{ pct2xx: number | null; pct4xx: number | null; pct5xx: number | null }[]>`
      SELECT
        round(100.0 * count(*) FILTER (WHERE status_code < 300) / NULLIF(count(*), 0), 1) AS "pct2xx",
        round(100.0 * count(*) FILTER (WHERE status_code BETWEEN 400 AND 499) / NULLIF(count(*), 0), 1) AS "pct4xx",
        round(100.0 * count(*) FILTER (WHERE status_code >= 500) / NULLIF(count(*), 0), 1) AS "pct5xx"
      FROM request_logs WHERE created_at > now() - interval '5 minutes'
    `,
    prisma.$queryRaw<{ method: string; path: string; reqCount: number; avgLatencyMs: number; pctOfTraffic: number }[]>`
      SELECT method, path,
        count(*)::int AS "reqCount",
        round(avg(duration_ms))::int AS "avgLatencyMs",
        round(100.0 * count(*) / NULLIF(sum(count(*)) OVER (), 0), 1)::float AS "pctOfTraffic"
      FROM request_logs WHERE created_at > now() - interval '5 minutes'
      GROUP BY method, path ORDER BY count(*) DESC LIMIT 10
    `,
    prisma.$queryRaw<{ method: string; path: string; reqCount: number; p95Ms: number }[]>`
      SELECT method, path, count(*)::int AS "reqCount",
        round(percentile_cont(0.95) WITHIN GROUP (ORDER BY duration_ms))::int AS "p95Ms"
      FROM request_logs WHERE created_at > now() - interval '15 minutes'
      GROUP BY method, path HAVING count(*) >= 3 ORDER BY "p95Ms" DESC LIMIT 10
    `,
    prisma.$queryRaw<{ p50: number | null; p95: number | null; p99: number | null }[]>`
      SELECT
        round(percentile_cont(0.50) WITHIN GROUP (ORDER BY duration_ms))::int AS p50,
        round(percentile_cont(0.95) WITHIN GROUP (ORDER BY duration_ms))::int AS p95,
        round(percentile_cont(0.99) WITHIN GROUP (ORDER BY duration_ms))::int AS p99
      FROM request_logs WHERE created_at > now() - interval '5 minutes'
    `,
    prisma.$queryRaw<{ used: bigint; max: number }[]>`
      SELECT (SELECT count(*) FROM pg_stat_activity) AS used, (SELECT setting::int FROM pg_settings WHERE name = 'max_connections') AS max
    `,
    prisma.$queryRaw<{ ratio: number | null }[]>`
      SELECT round(100.0 * sum(blks_hit) / NULLIF(sum(blks_hit) + sum(blks_read), 0), 1) AS ratio FROM pg_stat_database
    `,
    prisma.$queryRaw<{ size: string }[]>`SELECT pg_size_pretty(pg_database_size(current_database())) AS size`,
    prisma.$queryRaw<{ count: bigint }[]>`
      SELECT count(*) FROM pg_stat_activity WHERE state = 'active' AND now() - query_start > interval '500 milliseconds'
    `,
  ]);

  const mem = process.memoryUsage();

  return {
    goldenSignals: {
      onlineUsers: Number(onlineUsers[0]?.count ?? 0),
      activeSessions,
      reqPerMinute: reqLastMinute,
      inFlightRequests: getInFlightCount(),
    },
    apiLatency: {
      p50: latencyPercentiles[0]?.p50 ?? null,
      p95: latencyPercentiles[0]?.p95 ?? null,
      p99: latencyPercentiles[0]?.p99 ?? null,
      pct2xx: statusSplit[0]?.pct2xx ?? null,
      pct4xx: statusSplit[0]?.pct4xx ?? null,
      pct5xx: statusSplit[0]?.pct5xx ?? null,
    },
    database: {
      connectionsUsed: Number(connections[0]?.used ?? 0),
      connectionsMax: connections[0]?.max ?? 0,
      cacheHitRatioPct: cacheHitRatio[0]?.ratio ?? null,
      databaseSize: dbSize[0]?.size ?? "unknown",
      slowQueries: Number(slowQueries[0]?.count ?? 0),
    },
    process: {
      uptimeSeconds: Math.floor((Date.now() - PROCESS_START.getTime()) / 1000),
      startedAt: PROCESS_START.toISOString(),
      pid: process.pid,
      nodeVersion: process.version,
      memoryRssMb: Math.round(mem.rss / 1024 / 1024),
    },
    hottestEndpoints,
    slowestEndpoints,
  };
}
