# MoneyKanakku — API Layer

Express 5 + TypeScript API for the Monthly Expense Tracker. Imports its Prisma
client, schema, and migrations straight from `../db` — there is exactly one
schema and one PrismaClient/driver-adapter setup for the whole project (see
"Sharing the DB layer" below).

## Getting started

```powershell
# 1. The DB must be running first (see ../db/README.md)
cd ..\db
npm run db:start

# 2. Install and configure the API
cd ..\api
npm install
copy .env.example .env
# edit .env — COOKIE_SECRET especially; a fresh one was generated for local
# dev already, but never reuse it anywhere real

# 3. Run it
npm run dev
```

The API listens on **port 4100** (not 4000 — already occupied by an
unrelated Node process on this machine when this was built; see the
project's running theme of never touching a port something else is using).

Health check: `curl http://localhost:4100/health`

## Architecture

Feature-based modules, not layer-based — each module owns its full stack
(routes → controller → service → validation) instead of routes/, controllers/
and services/ being separate top-level folders with one entity's code spread
across all three:

```
src/
  modules/
    auth/               register, login, logout, OTP verify, password reset
    categories/          global + custom, Expense/Income scoped (more to come)
  middleware/
    auth.middleware.ts    attachUser (always), requireAuth / requireAdmin (gates)
    validate.ts            zod-based req.body / req.query validation
    request-logger.ts      writes every request to request_logs (Live Ops data)
    rate-limit.ts           tighter limit on auth endpoints than the rest
    error-handler.ts        one JSON error shape for the whole API
  lib/
    prisma.ts              re-exports ../db's PrismaClient — see below
    session.ts              session create/resolve/destroy against `sessions`
    hash.ts                 password hashing, session/OTP token hashing, OTP codes
    app-error.ts            AppError + Errors.* factory functions
  config/
    env.ts                  zod-validated environment config
  app.ts                    Express app assembly (no listen())
  server.ts                 entrypoint (imports app, calls listen())
```

### Sharing the DB layer

`src/lib/prisma.ts` does `export { prisma } from "../../../db/prisma/client.js"`
— a plain relative import across sibling package folders, not an npm
workspace. This works because Node resolves each file's own bare-specifier
imports (e.g. `@prisma/adapter-pg` inside `db/prisma/client.ts`) starting
from *that file's* location on disk, so `db/node_modules` is found correctly
even though `api/` has its own separate `node_modules` for Express, zod, etc.
One schema, one migration history, zero duplication.

### Session-based auth, not JWT off the shelf — but access + refresh tokens (2026-09-12)

Per the FRS: cookie-based, not `Authorization: Bearer` headers, and never
anything in `localStorage`. Within that, the original build (see git-free
history below, since this repo has none — see the phase-status memory
instead) used a single ~30-minute session cookie. That meant a genuinely
annoying UX for a mobile-wrapped app: force logout every 30 minutes, no
matter how actively the user was using it. Fixed by splitting into two
tokens, the standard access/refresh pattern, but hand-rolled rather than
pulling in a JWT library — consistent with how session auth was already
built here:

- **Access token** (`expensio_at` cookie, `ACCESS_TOKEN_TTL_MINUTES=15`):
  short-lived and **stateless** — `src/lib/access-token.ts` self-signs
  `{ sub: userId, role, sid: sessionId, exp }` with HMAC-SHA256 over
  `COOKIE_SECRET`, and `attachUser` verifies it with zero DB round-trips.
  That's a real perf win (every authenticated request used to do a
  `sessions` lookup + `user` join; now it's pure in-process verification),
  at the accepted cost that a deactivated/demoted user's already-issued
  access token stays nominally valid for up to 15 more minutes — which is
  exactly why it's short.
- **Refresh token** (`expensio_rt` cookie, `REFRESH_TOKEN_TTL_DAYS=30`):
  long-lived, opaque, and DB-tracked in `sessions` — same shape as
  before (`tokenHash`, `expiresAt`, `lastActiveAt`), and still what Live
  Ops reads "Online Users"/"Active Sessions" from (see the updated
  comment in `db/queries/live_ops.sql` — the meaning of those two metrics
  shifted slightly). **Rotated on every use**: `POST /auth/refresh`
  validates the old token, issues a brand new one on the same row, and
  pushes `expiresAt` back out to a fresh 30 days. That rotation is the
  entire mechanism behind "stay signed in until you explicitly log out" —
  as long as the app is opened at least once every 30 days, the window
  keeps sliding forward indefinitely; only real inactivity for the full
  30 days (or an explicit logout, or a password change/reset, which both
  still `session.deleteMany` as before) actually ends it.

Both tokens are httpOnly, `SameSite=Lax`, never read by JavaScript, and
never touch `localStorage` — the refresh token in particular is a
30-day-lived credential, and putting a credential like that somewhere an
XSS bug can read it directly (which is exactly what `localStorage`
offers zero protection against) would be a real vulnerability, not a
convenience. The refresh cookie is additionally scoped to `path:
"/api/auth"` so it's only ever sent to the handful of endpoints that
need it, not to every API call.

**Silent refresh** is entirely client-driven: `assets/js/api.js`'s
request wrapper catches any 401, calls `POST /auth/refresh` (the browser
attaches the refresh cookie automatically — no token handling in JS),
and transparently retries the original request once. Concurrent 401s
share a single in-flight refresh call rather than each firing their own.
Only when the refresh call *itself* fails (expired/revoked refresh
token) does the user actually get bounced to the login page.

## Five real bugs found by actually running this, not just reading the code

1. **`db/prisma/client.ts`'s dotenv loading broke the moment a different
   package imported it.** `import "dotenv/config"` resolves `.env` relative
   to `process.cwd()` — correct when a script runs from inside `db/`, wrong
   the instant `api/`'s dev server (started from `api/`) imports the same
   file. Fixed by loading `.env` relative to the file's own location
   (`import.meta.url`) instead of the process's working directory — see the
   comment in `db/prisma/client.ts`. This is exactly the kind of bug that
   only surfaces when two packages actually share code, which is why it
   wasn't caught during the DB phase alone.
2. **Express 5 made `req.query` a getter-only property.** The first version
   of `validateQuery()` tried `req.query = parsed` (the standard Express 4
   pattern) and crashed every request with a query string:
   `TypeError: Cannot set property query of #<IncomingMessage> which has
   only a getter`. Fixed by stashing the parsed result on `req.validatedQuery`
   instead of trying to overwrite `req.query` at all — see the comment in
   `src/middleware/validate.ts`.
3. **`req.baseUrl`/`req.route.path` are unreliable inside a `res.on("finish")`
   handler on an error path.** The request logger initially tried to
   reconstruct a clean route pattern (e.g. `/api/categories/:id`) from those
   two properties, and it worked for successful requests — but a 401/403
   thrown by middleware *ahead of* the matched route handler came back with
   `req.baseUrl` empty by the time `finish` fired, logging `/global` instead
   of `/api/categories/global`. Confirmed by direct `psql` inspection of the
   actual rows written during live testing, not assumed from reading the
   code. Fixed by abandoning Express's internal routing state entirely for
   this purpose and normalizing `req.originalUrl` with a UUID-segment regex
   instead (`/api/categories/<uuid>` → `/api/categories/:id`) — see the
   comment in `src/middleware/request-logger.ts`. This is also just a more
   robust general pattern: it has no dependency on *how* a request was
   handled, only on the URL that was actually requested.

4. **`::uuid` cast on a plain `text` column.** The reports module's raw SQL
   originally compared `t.user_id = ${userId}::uuid`, which failed at
   runtime with `operator does not exist: text = uuid`. `\d transactions`
   showed why: Prisma's `String @id @default(uuid())` generates
   UUID-*shaped* values in the application layer, but the underlying
   Postgres column type is plain `text`, not native `uuid`. Fixed by
   dropping every `::uuid` cast across `reports.service.ts`
   (7 occurrences) — see the doc comment at the top of that file.
5. **Admin PATCH leaking the password hash.** The first version of
   `admin/users.service.ts`'s `updateUser` returned Prisma's default
   object from `prisma.user.update(...)` straight into the JSON response
   — `passwordHash` (a bcrypt hash) included. Found by inspecting the
   actual `curl` response body during live testing, not by reading the
   code. Fixed with an explicit `select` on that call, and then every
   other `prisma.user.*` call in the codebase was grepped and re-checked
   to confirm none of the others had the same gap.

All five were caught by starting the real server and hitting real
endpoints with `curl` — logging in, listing/creating categories as both a
regular user and an admin, checking authorization boundaries (401/403),
verifying OTP with a real generated code, running the recurring scheduler
for real, exercising every report endpoint, and reading back the actual
`audit_logs`/`request_logs` rows those calls produced — not by reasoning
about the code in the abstract.

## What's built vs. what's next

**Done — all 8 modules, verified end-to-end against the live database:**

- App scaffold: config, all middleware (auth, validation, rate limiting,
  error handling, request logging, in-flight tracking), unified error shape.
- `auth` — register/login/logout/me/forgot-password/resend-otp/verify-otp/
  reset-password/change-password. Register creates a session directly and
  takes the user straight to the dashboard; the email-verification OTP
  step is written but commented out (see `auth.service.ts`) for a
  possible future register-time verification flow.
- `categories` — list (Expense/Income + active/inactive/scope filters),
  create custom, create global (admin), update/toggle-active, all with
  ownership + admin authorization checks.
- `transactions` — list (month/type/category/search filters + pagination),
  get, create (with optional inline recurring-rule creation, atomic via
  `$transaction`), update, soft-delete, restore, `/summary` for the
  dashboard's Income vs Expense card.
- `budgets` — CRUD plus computed spent/percentUsed/status (safe/warn/
  danger) per budget, expense-only.
- `recurring` — CRUD plus `runScheduler()`, which finds due rules,
  generates transactions atomically, advances `nextDueDate`, and creates
  deduplicated reminder notifications. Verified with a real scheduler run
  that generated a real transaction.
- `reports` — categoryReport, paymentMethodReport, trendReport,
  yearlySummary, dailySpending — raw SQL mirroring
  `../db/queries/reports.sql`/`dashboard.sql` exactly.
- `notifications` — list, markRead, markAllRead, push device registration
  (`PushDevice` upsert).
- `admin` — overview, users list/update (with forced session kill on
  deactivate), audit-logs read, live-ops (genuinely live: `sessions`,
  `request_logs`, Postgres `pg_stat_activity`/`pg_stat_database`/
  `pg_database_size`, and Node `process.*`/in-flight counter, all
  combined in one response), system settings CRUD, and an admin-triggered
  `POST /run-scheduler`.

**Forgot-password now sends a real, clickable link** (2026-09-14) — not a
6-digit code to type in. `POST /auth/forgot-password` emails a link to
`reset-password.html?token=...` via real Gmail SMTP (`src/lib/mail.ts`,
config in `.env`'s `SMTP_*` vars — falls back to logging the link to the
console if `SMTP_HOST` is unset, so local dev works without real email).
The token is single-use and expires in 10 minutes; clicking it lets the
user set a new password directly, no separate "verify this code" step,
and it invalidates every existing session on that account. The older
code-entry flow (`otp-verify.html`, `resetTicket`) still exists in the
codebase but is no longer linked to from `forgot-password.html` — left in
place, not deleted, in case a code-based flow is wanted again later.

**Opening the reset link inside the (future) WebView APK, not the phone's
browser:** this is genuinely an Android-app-configuration concern, not
something a web codebase can solve alone — there is no APK/Android
project yet for this to live in. When one exists (whether hand-built or
via a no-code WebView wrapper like Median/GoNative/Appilix), what makes
`https://yourdomain.com/reset-password.html?token=...` open directly
inside the installed app instead of the system browser is **Android App
Links** (the same mechanism every "world-class" app uses — Slack, Notion,
Instagram, etc. — for exactly this "click an emailed link, land inside
the app" flow; iOS's equivalent is Universal Links, same idea): the app
declares an `intent-filter` for that domain with `android:autoVerify="true"`,
and the domain hosts a `sha256_cert_fingerprints`-and-package-name-
matching `assetlinks.json` at `https://yourdomain.com/.well-known/assetlinks.json`
— Android verifies that file matches the APK's own signing cert before it
will route the link into the app instead of the browser. A **template**
for that file already lives at `.well-known/assetlinks.json` in this
project's root (the two placeholder values — package name and cert
fingerprint — can only be filled in once the actual APK is built/signed).
No app-side code changes were needed on the web/API side for this to
work correctly once configured — the reset link is already a plain
HTTPS URL, exactly the shape App Links need; until `assetlinks.json` is
live with real values, the link simply opens in the phone's normal
browser instead, which still works fine, just without the "feels native"
app-link jump.

**Deliberately out of scope, not oversights:**

- **File/attachment uploads** for `TransactionAttachment` — no storage
  backend (local disk vs. S3-compatible vs. something else) has been
  decided yet, so nothing was built rather than guessing.
- **A real cron/scheduler process** — `runScheduler()` is fully
  implemented and tested, but it's only reachable via the admin-only
  `POST /api/admin/run-scheduler` endpoint. Nothing runs it automatically
  on a timer yet.

**Verification performed:** `npx tsc --noEmit` clean, `npm audit` — 0
vulnerabilities, and live `curl` testing of every endpoint in every
module (including authorization-boundary checks that correctly return
403, e.g. a regular user editing a global category). All test/demo data
created during verification was cleaned up afterward, restoring the
seed baseline exactly.
