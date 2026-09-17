/**
 * Seed script — populates the local dev database with data that matches
 * the built UI screens 1:1: Priya Sharma's dashboard numbers (both Expense
 * and Income sides), the 9 FRS expense categories + 8 income categories,
 * the recurring items shown on recurring.html (including Salary as a
 * recurring income), plus demo rows for the two admin ops pages
 * (audit_logs, request_logs, push_devices, sessions).
 *
 * Run with: npm run db:seed
 */
import { CategoryType, TransactionType, PaymentMethod, RecurrenceFrequency, NotificationType, AuditAction, DevicePlatform } from "../generated/prisma/enums.js";
import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import { prisma } from "./client.js";

// FRS 4.2: "Food, Transport, Shopping, Bills, Healthcare, Education,
// Entertainment, Rent, Other" — seeded as global (userId: null) EXPENSE
// categories, exactly like admin-categories.html's Expense tab.
const EXPENSE_CATEGORIES = [
  { name: "Food", icon: "bi-cup-hot-fill", color: "#2a78d6", sortOrder: 1 },
  { name: "Transport", icon: "bi-car-front-fill", color: "#eb6834", sortOrder: 2 },
  { name: "Shopping", icon: "bi-bag-fill", color: "#1baf7a", sortOrder: 3 },
  { name: "Bills", icon: "bi-lightning-charge-fill", color: "#eda100", sortOrder: 4 },
  { name: "Healthcare", icon: "bi-heart-pulse-fill", color: "#e87ba4", sortOrder: 5 },
  { name: "Education", icon: "bi-mortarboard-fill", color: "#008300", sortOrder: 6 },
  { name: "Entertainment", icon: "bi-film", color: "#4a3aa7", sortOrder: 7 },
  { name: "Rent", icon: "bi-house-door-fill", color: "#e34948", sortOrder: 8 },
  { name: "Other", icon: "bi-three-dots", color: "#9a9db8", sortOrder: 9 },
];

// Matches categories.html / category-form.html / admin-categories.html's
// Income tab exactly.
const INCOME_CATEGORIES = [
  { name: "Salary", icon: "bi-briefcase-fill", color: "#2a78d6", sortOrder: 1 },
  { name: "Business", icon: "bi-graph-up-arrow", color: "#eb6834", sortOrder: 2 },
  { name: "Freelance", icon: "bi-laptop-fill", color: "#1baf7a", sortOrder: 3 },
  { name: "Investments", icon: "bi-piggy-bank-fill", color: "#eda100", sortOrder: 4 },
  { name: "Rental Income", icon: "bi-building", color: "#e87ba4", sortOrder: 5 },
  { name: "Gifts", icon: "bi-gift-fill", color: "#008300", sortOrder: 6 },
  { name: "Refunds", icon: "bi-arrow-counterclockwise", color: "#4a3aa7", sortOrder: 7 },
  { name: "Other Income", icon: "bi-three-dots", color: "#9a9db8", sortOrder: 8 },
];

const SYSTEM_SETTINGS: { key: string; value: unknown; description: string }[] = [
  { key: "default_currency", value: "INR", description: "Default currency for new users" },
  { key: "default_timezone", value: "Asia/Kolkata", description: "Default timezone for new users" },
  { key: "fiscal_month_start_day", value: 1, description: "Day of month the budget cycle starts on" },
  { key: "data_retention.keep_deleted_transactions", value: true, description: "Preserve soft-deleted transactions for audit" },
  { key: "data_retention.years", value: 7, description: "Years to retain soft-deleted financial records" },
  { key: "data_retention.request_log_days", value: 30, description: "Days to retain raw request_logs rows before pruning" },
  { key: "security.session_timeout_minutes", value: 30, description: "Idle session timeout" },
  { key: "security.min_password_length", value: 8, description: "Minimum password length enforced at signup" },
  { key: "notifications.system_wide_announcements", value: false, description: "Broadcast admin announcements to all users" },
  { key: "notifications.email_digest_to_admins", value: true, description: "Send admins a daily digest email" },
];

function monthStart(year: number, month1to12: number): Date {
  return new Date(Date.UTC(year, month1to12 - 1, 1));
}

function hashToken(raw: string): string {
  return crypto.createHash("sha256").update(raw).digest("hex");
}

async function main() {
  console.log("Seeding expensio_db...");

  // -------------------------------------------------------------------
  // System settings (admin-categories.html#system)
  // -------------------------------------------------------------------
  for (const setting of SYSTEM_SETTINGS) {
    await prisma.systemSetting.upsert({
      where: { key: setting.key },
      update: { value: setting.value as any, description: setting.description },
      create: setting as any,
    });
  }

  // -------------------------------------------------------------------
  // Global categories — Expense set, then Income set
  // -------------------------------------------------------------------
  const categoryByName = new Map<string, string>(); // keyed "TYPE:Name"
  async function upsertGlobalCategory(cat: { name: string; icon: string; color: string; sortOrder: number }, type: TransactionType) {
    const existing = await prisma.category.findFirst({ where: { userId: null, name: cat.name, transactionType: type } });
    const row = existing
      ? await prisma.category.update({ where: { id: existing.id }, data: { icon: cat.icon, color: cat.color, sortOrder: cat.sortOrder } })
      : await prisma.category.create({
          data: { userId: null, name: cat.name, icon: cat.icon, color: cat.color, type: CategoryType.DEFAULT, transactionType: type, sortOrder: cat.sortOrder },
        });
    categoryByName.set(type + ":" + cat.name, row.id);
  }
  for (const cat of EXPENSE_CATEGORIES) await upsertGlobalCategory(cat, TransactionType.EXPENSE);
  for (const cat of INCOME_CATEGORIES) await upsertGlobalCategory(cat, TransactionType.INCOME);

  function catId(type: TransactionType, name: string): string {
    const id = categoryByName.get(type + ":" + name);
    if (!id) throw new Error(`Category not seeded: ${type}:${name}`);
    return id;
  }

  // -------------------------------------------------------------------
  // Admin user (admin-dashboard.html / admin-users.html)
  // -------------------------------------------------------------------
  const adminPasswordHash = await bcrypt.hash("Admin@12345", 12);
  const admin = await prisma.user.upsert({
    where: { email: "admin@expensio.app" },
    update: {},
    create: { name: "Admin User", email: "admin@expensio.app", passwordHash: adminPasswordHash, role: "ADMIN", emailVerifiedAt: new Date() },
  });

  // -------------------------------------------------------------------
  // Demo user — Priya Sharma (matches dashboard.html / profile.html)
  // -------------------------------------------------------------------
  const demoPasswordHash = await bcrypt.hash("Demo@12345", 12);
  const priya = await prisma.user.upsert({
    where: { email: "priya@example.com" },
    update: {},
    create: {
      name: "Priya Sharma", email: "priya@example.com", phone: "+919876543210", passwordHash: demoPasswordHash,
      role: "USER", currency: "INR", timezone: "Asia/Kolkata", emailVerifiedAt: new Date(),
    },
  });

  const otherUsers: Record<string, string> = {};
  for (const u of [
    { name: "Rahul Kumar", email: "rahul@example.com" },
    { name: "Anita Singh", email: "anita@example.com", isActive: false },
    { name: "Vikram Joshi", email: "vikram@example.com" },
  ]) {
    const row = await prisma.user.upsert({
      where: { email: u.email },
      update: {},
      create: { name: u.name, email: u.email, passwordHash: await bcrypt.hash("Demo@12345", 12), role: "USER", isActive: u.isActive ?? true },
    });
    otherUsers[u.email] = row.id;
  }

  // -------------------------------------------------------------------
  // Priya's active session + push device (Live Ops "Online Users" /
  // "Active Sessions" read straight from the sessions table)
  // -------------------------------------------------------------------
  await prisma.session.upsert({
    where: { tokenHash: hashToken("demo-session-priya") },
    update: { lastActiveAt: new Date(), expiresAt: new Date(Date.now() + 30 * 60 * 1000) },
    create: {
      userId: priya.id, tokenHash: hashToken("demo-session-priya"), userAgent: "Chrome on Windows",
      ipAddress: "49.204.112.6", expiresAt: new Date(Date.now() + 30 * 60 * 1000),
    },
  });
  await prisma.pushDevice.upsert({
    where: { pushToken: "demo-push-token-priya-android" },
    update: { lastSeenAt: new Date() },
    create: { userId: priya.id, platform: DevicePlatform.ANDROID, pushToken: "demo-push-token-priya-android" },
  });

  // -------------------------------------------------------------------
  // September 2026 overall + category budgets (budget.html) — expense-only
  // -------------------------------------------------------------------
  const sep2026 = monthStart(2026, 9);
  const existingOverallBudget = await prisma.budget.findFirst({ where: { userId: priya.id, categoryId: null, monthYear: sep2026 } });
  if (!existingOverallBudget) {
    await prisma.budget.create({ data: { userId: priya.id, categoryId: null, monthYear: sep2026, amount: 60000 } });
  }
  const categoryBudgets: [string, number][] = [
    ["Food", 15000], ["Transport", 6000], ["Shopping", 12000], ["Bills", 10000], ["Entertainment", 5000],
  ];
  for (const [name, amount] of categoryBudgets) {
    const categoryId = catId(TransactionType.EXPENSE, name);
    await prisma.budget.upsert({
      where: { userId_categoryId_monthYear: { userId: priya.id, categoryId, monthYear: sep2026 } },
      update: {},
      create: { userId: priya.id, categoryId, monthYear: sep2026, amount },
    });
  }

  // -------------------------------------------------------------------
  // Recurring transactions (recurring.html) — both expense and income
  // -------------------------------------------------------------------
  const recurringDefs: { title: string; type: TransactionType; category: string; amount: number; method: PaymentMethod; freq: RecurrenceFrequency; day: number; paused?: boolean }[] = [
    { title: "Salary — September", type: TransactionType.INCOME, category: "Salary", amount: 65000, method: PaymentMethod.NETBANKING, freq: RecurrenceFrequency.MONTHLY, day: 1 },
    { title: "Rent", type: TransactionType.EXPENSE, category: "Rent", amount: 15000, method: PaymentMethod.UPI, freq: RecurrenceFrequency.MONTHLY, day: 14 },
    { title: "Internet — Airtel Fiber", type: TransactionType.EXPENSE, category: "Bills", amount: 999, method: PaymentMethod.CARD, freq: RecurrenceFrequency.MONTHLY, day: 17 },
    { title: "Netflix Subscription", type: TransactionType.EXPENSE, category: "Entertainment", amount: 649, method: PaymentMethod.CARD, freq: RecurrenceFrequency.MONTHLY, day: 20 },
    { title: "Home Loan EMI", type: TransactionType.EXPENSE, category: "Bills", amount: 18200, method: PaymentMethod.NETBANKING, freq: RecurrenceFrequency.MONTHLY, day: 5 },
    { title: "Health Insurance Premium", type: TransactionType.EXPENSE, category: "Healthcare", amount: 24000, method: PaymentMethod.NETBANKING, freq: RecurrenceFrequency.YEARLY, day: 15 },
    { title: "Spotify Premium", type: TransactionType.EXPENSE, category: "Entertainment", amount: 119, method: PaymentMethod.CARD, freq: RecurrenceFrequency.MONTHLY, day: 1, paused: true },
  ];
  const recurringIdByTitle = new Map<string, string>();
  for (const r of recurringDefs) {
    const categoryId = catId(r.type, r.category);
    const nextDue = new Date(Date.UTC(2026, r.freq === "MONTHLY" ? 9 : 0, r.day));
    let row = await prisma.recurringTransaction.findFirst({ where: { userId: priya.id, title: r.title } });
    if (!row) {
      row = await prisma.recurringTransaction.create({
        data: {
          userId: priya.id, categoryId, type: r.type, title: r.title, amount: r.amount, paymentMethod: r.method,
          frequency: r.freq, startDate: new Date(Date.UTC(2026, 0, r.day)), nextDueDate: nextDue, isPaused: r.paused ?? false,
        },
      });
    }
    recurringIdByTitle.set(r.title, row.id);
  }

  // -------------------------------------------------------------------
  // September 2026 transactions — both expense and income
  // (dashboard.html + expenses.html transaction list)
  // -------------------------------------------------------------------
  const txnDefs: { title: string; type: TransactionType; category: string; amount: number; method: PaymentMethod; day: number; hour: number; min: number; recurringTitle?: string }[] = [
    { title: "Salary — September", type: TransactionType.INCOME, category: "Salary", amount: 65000, method: PaymentMethod.NETBANKING, day: 1, hour: 0, min: 0, recurringTitle: "Salary — September" },
    { title: "Swiggy Order", type: TransactionType.EXPENSE, category: "Food", amount: 480, method: PaymentMethod.UPI, day: 11, hour: 13, min: 20 },
    { title: "Uber Ride", type: TransactionType.EXPENSE, category: "Transport", amount: 220, method: PaymentMethod.CARD, day: 11, hour: 9, min: 5 },
    { title: "Amazon — Headphones", type: TransactionType.EXPENSE, category: "Shopping", amount: 2499, method: PaymentMethod.CARD, day: 10, hour: 16, min: 12 },
    { title: "Freelance Payment — Logo Design", type: TransactionType.INCOME, category: "Freelance", amount: 8000, method: PaymentMethod.UPI, day: 9, hour: 15, min: 15 },
    { title: "Electricity Bill", type: TransactionType.EXPENSE, category: "Bills", amount: 1840, method: PaymentMethod.NETBANKING, day: 9, hour: 11, min: 2, recurringTitle: "Internet — Airtel Fiber" },
    { title: "Movie Tickets — PVR", type: TransactionType.EXPENSE, category: "Entertainment", amount: 649, method: PaymentMethod.CARD, day: 9, hour: 19, min: 40 },
    { title: "Swiggy Order", type: TransactionType.EXPENSE, category: "Food", amount: 620, method: PaymentMethod.UPI, day: 6, hour: 20, min: 15 },
    { title: "Netflix Subscription", type: TransactionType.EXPENSE, category: "Entertainment", amount: 649, method: PaymentMethod.CARD, day: 8, hour: 0, min: 0, recurringTitle: "Netflix Subscription" },
  ];
  for (const t of txnDefs) {
    const categoryId = catId(t.type, t.category);
    const transactionDate = new Date(Date.UTC(2026, 8, t.day, t.hour, t.min));
    const already = await prisma.transaction.findFirst({ where: { userId: priya.id, description: t.title, transactionDate } });
    if (already) continue;
    await prisma.transaction.create({
      data: {
        userId: priya.id, categoryId, type: t.type, amount: t.amount, paymentMethod: t.method, transactionDate,
        description: t.title, isRecurring: !!t.recurringTitle,
        recurringTransactionId: t.recurringTitle ? recurringIdByTitle.get(t.recurringTitle) : null,
      },
    });
  }

  // -------------------------------------------------------------------
  // Notifications (notifications.html) — includes the Income-side one
  // -------------------------------------------------------------------
  const notifications: { type: NotificationType; title: string; message: string; isRead?: boolean }[] = [
    { type: "INCOME_RECEIVED", title: "Salary credited", message: "₹65,000 was credited to your account — recurring \"Salary\" income." },
    { type: "BUDGET_ALERT", title: "Transport budget exceeded", message: "You've spent ₹6,200 of your ₹6,000 Transport budget (103%)." },
    { type: "BUDGET_ALERT", title: "Food budget at 83%", message: "You're approaching your Food budget limit for September." },
    { type: "RECURRING_REMINDER", title: "Rent due in 3 days", message: "Your recurring \"Rent\" payment of ₹15,000 is due on Sep 14.", isRead: true },
    { type: "REPORT_READY", title: "Monthly report ready", message: "Your August spending report has been generated.", isRead: true },
  ];
  for (const n of notifications) {
    const already = await prisma.notification.findFirst({ where: { userId: priya.id, title: n.title } });
    if (already) continue;
    await prisma.notification.create({ data: { userId: priya.id, ...n } });
  }

  // -------------------------------------------------------------------
  // Audit log entries (admin-audit-logs.html) — realistic before/after pairs
  // -------------------------------------------------------------------
  const auditDefs: { userId: string | null; action: AuditAction; entityType: string; entityId: string; oldValues?: any; newValues?: any; ipAddress: string }[] = [
    { userId: priya.id, action: "DELETE", entityType: "Transaction", entityId: "seed-deleted-amazon", oldValues: { amount: 2499, category: "Shopping", description: "Amazon — Headphones" }, ipAddress: "49.204.112.6" },
    { userId: priya.id, action: "UPDATE", entityType: "Budget", entityId: "seed-food-budget", oldValues: { amount: 12000 }, newValues: { amount: 15000 }, ipAddress: "49.204.112.6" },
    { userId: null, action: "LOGIN_FAILED", entityType: "User", entityId: "admin@expensio.app", newValues: { reason: "invalid_password", attempt: 3 }, ipAddress: "103.21.244.19" },
    { userId: otherUsers["rahul@example.com"], action: "LOGIN", entityType: "User", entityId: otherUsers["rahul@example.com"], newValues: { device: "Chrome on Windows" }, ipAddress: "106.51.88.204" },
    { userId: admin.id, action: "UPDATE", entityType: "User", entityId: otherUsers["anita@example.com"], oldValues: { isActive: true }, newValues: { isActive: false, reason: "Suspended by admin" }, ipAddress: "10.0.0.4" },
    { userId: admin.id, action: "CREATE", entityType: "Category", entityId: "seed-travel-category", newValues: { name: "Travel", transactionType: "EXPENSE" }, ipAddress: "10.0.0.4" },
  ];
  for (const a of auditDefs) {
    const already = await prisma.auditLog.findFirst({ where: { entityType: a.entityType, entityId: a.entityId, action: a.action } });
    if (already) continue;
    await prisma.auditLog.create({ data: a });
  }

  // -------------------------------------------------------------------
  // A handful of request_logs rows — enough for the live_ops.sql example
  // queries to return real rows against seed data (production volume is
  // expected to come from real API middleware, not this seed).
  // -------------------------------------------------------------------
  const endpoints: { method: string; path: string; statusCode: number; durationMs: number }[] = [
    { method: "GET", path: "/api/dashboard/summary", statusCode: 200, durationMs: 58 },
    { method: "GET", path: "/api/transactions", statusCode: 200, durationMs: 44 },
    { method: "POST", path: "/api/transactions", statusCode: 201, durationMs: 62 },
    { method: "GET", path: "/api/notifications/unread-count", statusCode: 200, durationMs: 21 },
    { method: "GET", path: "/api/categories", statusCode: 200, durationMs: 18 },
    { method: "GET", path: "/api/reports/yearly-summary", statusCode: 200, durationMs: 612 },
    { method: "GET", path: "/api/reports/category-breakdown", statusCode: 200, durationMs: 448 },
  ];
  const existingLogCount = await prisma.requestLog.count();
  if (existingLogCount === 0) {
    const rows = [];
    for (let i = 0; i < 200; i++) {
      const e = endpoints[Math.floor(Math.random() * endpoints.length)];
      rows.push({
        method: e.method, path: e.path, statusCode: e.statusCode,
        durationMs: Math.max(5, Math.round(e.durationMs * (0.7 + Math.random() * 0.6))),
        userId: priya.id, ipAddress: "49.204.112.6",
        createdAt: new Date(Date.now() - Math.floor(Math.random() * 3600_000)),
      });
    }
    await prisma.requestLog.createMany({ data: rows });
  }

  console.log("Seed complete:");
  console.log("  Admin login:  admin@expensio.app / Admin@12345");
  console.log("  Demo login:   priya@example.com  / Demo@12345");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
