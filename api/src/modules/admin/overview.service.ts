import { prisma } from "../../lib/prisma.js";

/** Backs admin-dashboard.html's stat tiles + signups chart. */
export async function getOverview() {
  const [totalUsers, activeUsers, globalCategories, moneyTracked, signupsByMonth] = await Promise.all([
    prisma.user.count({ where: { deletedAt: null } }),
    prisma.user.count({ where: { deletedAt: null, isActive: true } }),
    prisma.category.count({ where: { userId: null } }),
    prisma.transaction.groupBy({ by: ["type"], where: { deletedAt: null }, _sum: { amount: true } }),
    prisma.$queryRaw<{ month: Date; count: bigint }[]>`
      SELECT date_trunc('month', created_at)::date AS month, count(*) AS count
      FROM users
      WHERE created_at > now() - interval '6 months' AND deleted_at IS NULL
      GROUP BY 1 ORDER BY 1
    `,
  ]);

  const income = Number(moneyTracked.find((r) => r.type === "INCOME")?._sum.amount ?? 0);
  const expense = Number(moneyTracked.find((r) => r.type === "EXPENSE")?._sum.amount ?? 0);

  return {
    totalUsers,
    activeUsers,
    globalCategories,
    incomeTracked: income,
    expenseTracked: expense,
    netTracked: income - expense,
    signupsByMonth: signupsByMonth.map((r) => ({ month: r.month, count: Number(r.count) })),
  };
}
