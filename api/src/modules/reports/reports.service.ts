import { prisma } from "../../lib/prisma.js";

/**
 * These mirror db/queries/reports.sql and dashboard.sql exactly — that file
 * is effectively the spec these were written against, including the
 * comments on why raw SQL is warranted here (generate_series to fill gaps,
 * FILTER/percentile_cont, window functions — none of which the Prisma
 * query builder can express). $queryRaw's tagged-template interpolation is
 * parameterized by Prisma itself, so this is not string-concatenation SQL
 * injection risk despite looking like one.
 *
 * Note: no `::uuid` cast on any id/user_id comparison — Prisma's
 * `String @id @default(uuid())` generates UUID-shaped values at the
 * application layer, but the underlying Postgres column type is plain
 * `text`, not native `uuid` (confirmed via `\d transactions`). An earlier
 * version of this file cast `${userId}::uuid`, which failed at runtime
 * with `operator does not exist: text = uuid` the first time these queries
 * actually ran — caught by hitting the live endpoint, not by review.
 */

export async function categoryReport(userId: string, month: string, type: "EXPENSE" | "INCOME") {
  // COUNT(*)::int, not the bare bigint Postgres returns by default — a raw
  // JS `bigint` can't be JSON.stringify()'d and would 500 every response.
  return prisma.$queryRaw<
    { id: string; name: string; icon: string; color: string; total: number; txnCount: number; percentShare: number | null }[]
  >`
    SELECT
      c.id, c.name, c.icon, c.color,
      COALESCE(SUM(t.amount), 0)::float AS total,
      COUNT(t.id)::int AS "txnCount",
      ROUND(COALESCE(SUM(t.amount), 0) / NULLIF(SUM(SUM(t.amount)) OVER (), 0) * 100, 1)::float AS "percentShare"
    FROM categories c
    LEFT JOIN transactions t
      ON t.category_id = c.id AND t.user_id = ${userId} AND t.deleted_at IS NULL
      AND t.transaction_date >= ${month}::date AND t.transaction_date < (${month}::date + INTERVAL '1 month')
    WHERE (c.user_id = ${userId} OR c.user_id IS NULL) AND c.transaction_type = ${type}::"TransactionType"
    GROUP BY c.id
    HAVING COALESCE(SUM(t.amount), 0) > 0
    ORDER BY total DESC
  `;
}

export async function paymentMethodReport(userId: string, month: string) {
  return prisma.$queryRaw<{ paymentMethod: string; total: number; txnCount: number; percentShare: number }[]>`
    SELECT
      payment_method AS "paymentMethod",
      SUM(amount)::float AS total,
      COUNT(*)::int AS "txnCount",
      ROUND(SUM(amount) / SUM(SUM(amount)) OVER () * 100, 1)::float AS "percentShare"
    FROM transactions
    WHERE user_id = ${userId} AND type = 'EXPENSE' AND deleted_at IS NULL
      AND transaction_date >= ${month}::date AND transaction_date < (${month}::date + INTERVAL '1 month')
    GROUP BY payment_method
    ORDER BY total DESC
  `;
}

export async function trendReport(userId: string, month: string) {
  return prisma.$queryRaw<{ monthStart: Date; incomeTotal: number | null; expenseTotal: number | null }[]>`
    SELECT
      date_trunc('month', transaction_date)::date AS "monthStart",
      SUM(amount) FILTER (WHERE type = 'INCOME')::float AS "incomeTotal",
      SUM(amount) FILTER (WHERE type = 'EXPENSE')::float AS "expenseTotal"
    FROM transactions
    WHERE user_id = ${userId} AND deleted_at IS NULL
      AND transaction_date >= date_trunc('month', ${month}::date) - INTERVAL '11 months'
    GROUP BY 1
    ORDER BY 1
  `;
}

export async function yearlySummary(userId: string, year: number) {
  const yearStart = `${year}-01-01`;
  return prisma.$queryRaw<
    { monthStart: Date; income: number; expense: number; budget: number; budgetVariance: number; netSavings: number }[]
  >`
    WITH months AS (
      SELECT generate_series(${yearStart}::date, ${yearStart}::date + INTERVAL '11 months', INTERVAL '1 month')::date AS month_start
    ),
    totals AS (
      SELECT date_trunc('month', transaction_date)::date AS month_start,
             SUM(amount) FILTER (WHERE type = 'INCOME')  AS income_total,
             SUM(amount) FILTER (WHERE type = 'EXPENSE') AS expense_total
      FROM transactions
      WHERE user_id = ${userId} AND deleted_at IS NULL
      GROUP BY 1
    ),
    budget AS (
      SELECT month_year AS month_start, amount AS budget_amount
      FROM budgets
      WHERE user_id = ${userId} AND category_id IS NULL
    )
    SELECT
      m.month_start AS "monthStart",
      COALESCE(t.income_total, 0)::float AS income,
      COALESCE(t.expense_total, 0)::float AS expense,
      COALESCE(b.budget_amount, 0)::float AS budget,
      (COALESCE(b.budget_amount, 0) - COALESCE(t.expense_total, 0))::float AS "budgetVariance",
      (COALESCE(t.income_total, 0) - COALESCE(t.expense_total, 0))::float AS "netSavings"
    FROM months m
    LEFT JOIN totals t ON t.month_start = m.month_start
    LEFT JOIN budget b ON b.month_start = m.month_start
    ORDER BY m.month_start
  `;
}

export async function dailySpending(userId: string, month: string) {
  return prisma.$queryRaw<{ day: Date; total: number }[]>`
    WITH days AS (
      SELECT generate_series(${month}::date, (${month}::date + INTERVAL '1 month' - INTERVAL '1 day')::date, INTERVAL '1 day')::date AS day
    )
    SELECT d.day, COALESCE(SUM(t.amount), 0)::float AS total
    FROM days d
    LEFT JOIN transactions t
      ON t.transaction_date::date = d.day AND t.user_id = ${userId} AND t.type = 'EXPENSE' AND t.deleted_at IS NULL
    GROUP BY d.day
    ORDER BY d.day
  `;
}
