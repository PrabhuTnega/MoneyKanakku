import { prisma } from "../../lib/prisma.js";
import { monthSummary } from "../transactions/transactions.service.js";
import { categoryReport } from "../reports/reports.service.js";
import { listBudgetsWithStatus } from "../budgets/budgets.service.js";

function monthRange(month: string) {
  const start = new Date(month + "T00:00:00.000Z");
  const end = new Date(start);
  end.setUTCMonth(end.getUTCMonth() + 1);
  return { start, end };
}

function shiftMonth(month: string, delta: number) {
  const d = new Date(month + "T00:00:00.000Z");
  d.setUTCMonth(d.getUTCMonth() + delta);
  return d.toISOString().slice(0, 10);
}

/**
 * "Safe to Spend Today" (PocketGuard-style) — answers the one question a
 * plain budget bar doesn't: given what's left of this month's budget, minus
 * bills still coming due, how much can I actually spend today without
 * borrowing from tomorrow? Deliberately EXPENSE-only and tied to the
 * user's overall monthly budget (not per-category) — a single, honest
 * number rather than a fake one when no budget exists to measure against.
 */
export async function safeToSpend(userId: string, month: string) {
  const { end } = monthRange(month);
  const now = new Date();

  const [budgets, summary, upcomingRecurring] = await Promise.all([
    listBudgetsWithStatus(userId, month),
    monthSummary(userId, month),
    prisma.recurringTransaction.findMany({
      where: { userId, type: "EXPENSE", isPaused: false, deletedAt: null, nextDueDate: { gte: now, lt: end } },
      select: { title: true, amount: true, nextDueDate: true },
      orderBy: { nextDueDate: "asc" },
    }),
  ]);

  const daysInMonth = new Date(end.getTime() - 1).getUTCDate();
  const daysLeft = Math.max(1, daysInMonth - now.getUTCDate() + 1);
  const upcomingRecurringTotal = upcomingRecurring.reduce((sum, r) => sum + Number(r.amount), 0);
  const upcomingBills = upcomingRecurring.map((r) => ({ title: r.title, amount: Number(r.amount), dueDate: r.nextDueDate }));

  if (!budgets.overall) {
    return { hasOverallBudget: false, daysLeft, upcomingRecurringTotal, upcomingBills };
  }

  const overallBudget = Number(budgets.overall.amount);
  const spentSoFar = summary.totalExpense;
  const remainingBudget = overallBudget - spentSoFar;
  const trulyFree = remainingBudget - upcomingRecurringTotal;
  const safeToSpendTotal = Math.max(0, trulyFree);
  const safeToSpendPerDay = safeToSpendTotal / daysLeft;

  return {
    hasOverallBudget: true,
    overallBudget,
    spentSoFar,
    remainingBudget,
    upcomingRecurringTotal,
    safeToSpendTotal,
    safeToSpendPerDay,
    daysLeft,
    isOverBudget: trulyFree < 0,
    upcomingBills,
  };
}

type Tone = "bad" | "warn" | "good" | "info";
interface Insight {
  type: string;
  tone: Tone;
  icon: string;
  // Raw data only — no pre-formatted currency strings, so the frontend can
  // render amounts in the user's own currency preference via
  // MET.formatCurrency, same as everywhere else in the app.
  data: Record<string, unknown>;
}

const TONE_ORDER: Record<Tone, number> = { bad: 0, warn: 1, good: 2, info: 3 };

/**
 * Turns the same data every chart on this app already shows into short,
 * specific, plain-English observations — "Dining is up 40% vs last month"
 * rather than making the user read a chart to notice it themselves. Rule-
 * based (no ML/AI call) so it's fast, free, and fully explainable; capped
 * at 5 so the dashboard doesn't turn into a wall of text, sorted worst-
 * news-first (a warning is more useful to see than a compliment).
 */
export async function smartInsights(userId: string, month: string) {
  const prevMonth = shiftMonth(month, -1);
  const { end } = monthRange(month);
  const now = new Date();
  const in5Days = new Date(now.getTime() + 5 * 86_400_000);

  const [summary, prevSummary, catThis, catPrev, budgets, dueSoon] = await Promise.all([
    monthSummary(userId, month),
    monthSummary(userId, prevMonth),
    categoryReport(userId, month, "EXPENSE"),
    categoryReport(userId, prevMonth, "EXPENSE"),
    listBudgetsWithStatus(userId, month),
    prisma.recurringTransaction.findMany({
      where: { userId, isPaused: false, deletedAt: null, nextDueDate: { gte: now, lte: in5Days } },
      select: { title: true, amount: true, nextDueDate: true, type: true },
      orderBy: { nextDueDate: "asc" },
      take: 3,
    }),
  ]);

  const insights: Insight[] = [];
  // A minimum base spend avoids a small category (e.g. ₹20 -> ₹80) reading
  // as a dramatic "300% increase" that's really just noise.
  const MIN_BASE = 100;

  const prevByName = new Map(catPrev.map((c) => [c.name, c.total]));
  let biggestIncrease: { name: string; pctChange: number; diff: number } | null = null;
  let biggestDecrease: { name: string; pctChange: number; diff: number } | null = null;
  for (const c of catThis) {
    const prevTotal = prevByName.get(c.name) ?? 0;
    if (prevTotal < MIN_BASE) continue;
    const pctChange = ((c.total - prevTotal) / prevTotal) * 100;
    if (pctChange >= 20 && (!biggestIncrease || pctChange > biggestIncrease.pctChange)) {
      biggestIncrease = { name: c.name, pctChange, diff: c.total - prevTotal };
    }
    if (pctChange <= -20 && (!biggestDecrease || pctChange < biggestDecrease.pctChange)) {
      biggestDecrease = { name: c.name, pctChange, diff: prevTotal - c.total };
    }
  }
  if (biggestIncrease) {
    insights.push({ type: "category_increase", tone: "warn", icon: "bi-graph-up-arrow", data: biggestIncrease });
  }
  if (biggestDecrease) {
    insights.push({ type: "category_decrease", tone: "good", icon: "bi-graph-down-arrow", data: biggestDecrease });
  }

  const daysInMonth = new Date(end.getTime() - 1).getUTCDate();
  const referenceDay = new Date(Math.min(now.getTime(), end.getTime() - 1));
  const elapsedPercent = Math.round((referenceDay.getUTCDate() / daysInMonth) * 100);
  for (const b of budgets.categories) {
    if (b.percentUsed >= 100) {
      insights.push({ type: "budget_exceeded", tone: "bad", icon: "bi-exclamation-octagon-fill", data: { name: b.category!.name, percentUsed: b.percentUsed } });
    } else if (b.percentUsed >= 90) {
      insights.push({ type: "budget_near_limit", tone: "warn", icon: "bi-exclamation-triangle-fill", data: { name: b.category!.name, percentUsed: b.percentUsed } });
    } else if (b.percentUsed - elapsedPercent >= 25) {
      insights.push({ type: "budget_pace_warning", tone: "warn", icon: "bi-speedometer2", data: { name: b.category!.name, percentUsed: b.percentUsed, elapsedPercent } });
    }
  }

  if (summary.totalIncome > 0) {
    const savingsRate = ((summary.totalIncome - summary.totalExpense) / summary.totalIncome) * 100;
    const prevSavingsRate = prevSummary.totalIncome > 0 ? ((prevSummary.totalIncome - prevSummary.totalExpense) / prevSummary.totalIncome) * 100 : null;
    if (savingsRate < 0) {
      insights.push({ type: "spending_exceeds_income", tone: "bad", icon: "bi-exclamation-octagon-fill", data: { overspend: summary.totalExpense - summary.totalIncome } });
    } else if (prevSavingsRate !== null && savingsRate - prevSavingsRate >= 10) {
      insights.push({ type: "savings_improved", tone: "good", icon: "bi-piggy-bank-fill", data: { savingsRate: Math.round(savingsRate), prevSavingsRate: Math.round(prevSavingsRate) } });
    }
  }

  for (const r of dueSoon) {
    const daysUntil = Math.round((new Date(r.nextDueDate).getTime() - now.getTime()) / 86_400_000);
    insights.push({
      type: "bill_due_soon",
      tone: "info",
      icon: r.type === "INCOME" ? "bi-cash-coin" : "bi-calendar-event",
      data: { title: r.title, amount: Number(r.amount), daysUntil: Math.max(0, daysUntil), isIncome: r.type === "INCOME" },
    });
  }

  insights.sort((a, b) => TONE_ORDER[a.tone] - TONE_ORDER[b.tone]);
  return { insights: insights.slice(0, 5) };
}
