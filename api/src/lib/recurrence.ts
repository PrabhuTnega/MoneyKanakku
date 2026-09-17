/** Shared by the transactions module (creating a rule inline from "Mark as
 * recurring") and the recurring module (rolling a rule forward after each
 * generated transaction) — one place that knows how each frequency advances
 * a date, matching recurring_scheduler.sql's CASE expression exactly. */
export function advanceDate(date: Date, frequency: "WEEKLY" | "MONTHLY" | "YEARLY"): Date {
  const next = new Date(date);
  if (frequency === "WEEKLY") next.setUTCDate(next.getUTCDate() + 7);
  else if (frequency === "MONTHLY") next.setUTCMonth(next.getUTCMonth() + 1);
  else next.setUTCFullYear(next.getUTCFullYear() + 1);
  return next;
}
