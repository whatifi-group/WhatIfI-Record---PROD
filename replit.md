# WhatIfI HR

## Overview
An internal HR management web app for WhatIfI Group Ltd ("One Question, Many Paths, Lasting Impact"), a multi-venture company (sailing, diving, mountain trail expeditions, publishing). Lets the team manage departments, employees, and leave requests from a single dashboard. Built as the first of several planned modules (e.g. payroll, recruiting) in a modular HR system — see "Modular structure" below.

## Stack
- Monorepo (pnpm workspaces).
- `artifacts/hr-management` — React + Vite frontend (wouter router, TanStack Query, shadcn/ui, react-hook-form + zod), mounted at `/`.
- `artifacts/api-server` — Express 5 backend, mounted at `/api`, using Drizzle ORM against Postgres.
- `lib/api-spec` — OpenAPI spec (source of truth), codegen'd via Orval into `lib/api-client-react` (React Query hooks) and `lib/api-zod` (Zod validators).
- `lib/db` — Drizzle schema/migrations shared by the backend.

## Modular structure
The system is organized into self-contained modules so new HR modules can be added without touching existing ones:
- DB schema: `lib/db/src/schema/hr/` holds all HR tables (departments, employees, leaveRequests) with its own `index.ts`, barrel-exported from `lib/db/src/schema/index.ts`. A new module gets its own sibling folder (e.g. `schema/payroll/`).
- API routes: `artifacts/api-server/src/routes/hr/` holds all HR route handlers with its own `index.ts` combining them into one router, mounted in the top-level `routes/index.ts`. A new module follows the same pattern (e.g. `routes/payroll/`).
- The frontend and OpenAPI spec are not yet split into modules; if/when a second module is added, revisit whether `lib/api-spec` and `artifacts/hr-management` should be split too.

## Product surface
- **Dashboard** (`/dashboard`, also `/`): headcount summary, department breakdown, recent hires, upcoming approved leave.
- **Directory** (`/employees`, `/employees/:id`): searchable/filterable employee list + profile view/edit/delete.
- **Departments** (`/departments`): department CRUD with computed headcounts.
- **Leave Requests** (`/leave`): leave request CRUD with approve/reject actions.

Deliberately out of scope for v1: payroll, attendance/time tracking.

## Authentication

Authentication is delegated to **Microsoft Entra ID (Azure AD)**; authorization
stays entirely in RECORD. Entra answers "who is this?", and the existing roles /
`permissions` model answers "what may they do?" — unchanged.

- **Flow**: server-side OIDC authorization-code grant with PKCE
  (`artifacts/api-server/src/lib/entra.ts`, using `openid-client`). The browser
  is redirected to `GET /api/auth/sso/login` and comes back to
  `GET /api/auth/sso/callback`; the outcome is the same `connect.sid`
  session cookie password login has always produced, so every downstream guard
  (`requireAuth`, `requirePermission`) is untouched. Neither route is in the
  OpenAPI spec — they are browser redirects, not JSON endpoints.
- **Identity matching** (`artifacts/api-server/src/lib/ssoUser.ts`): by
  `users.ms_entra_object_id` (the immutable `oid` claim), else by lowercased
  email — backfilling the `oid` so a later rename in Entra can't orphan the
  account — else by auto-provisioning from a matching employee record.
- **Auto-provisioning**: exactly one `employees` row matching the address
  (case-insensitively), with status `active` or `on_leave` and no user already
  linked, creates an active user linked to that employee with the role named by
  `SSO_DEFAULT_ROLE_NAME` (default `Employee Self-Service`). Zero matches,
  several matches, or a leaver refuses sign-in — RECORD never creates an
  unlinked account from a bare tenant identity.
- **Break-glass password login**: `POST /api/auth/login` still works, but only
  for system accounts (`is_system_account = true`) that hold a password, so an
  Entra or tenant outage can't lock administrators out. Forgot/reset password is
  restricted the same way. Every rejection is the same generic 401.
  `users.password_hash` is therefore nullable — employee-linked accounts created
  via HR or onboarding get `null` and no temporary password is issued.
- **Logout** is local only. We deliberately do not call Entra's
  `end_session_endpoint`, which would sign the user out of Outlook and every
  other Microsoft app in the browser. The login page offers "use a different
  account" (`?prompt=select_account`) for that case.
- **Configuration**: `AZURE_TENANT_ID`, `AZURE_CLIENT_ID`,
  `AZURE_CLIENT_SECRET`, `AZURE_REDIRECT_URI` (see `.env.example`). DEV and PROD
  share one Entra app registration and differ only by the redirect URI; both
  must be registered on that app. When any variable is missing, SSO is off:
  `GET /api/environment` reports `ssoEnabled: false`, the SSO routes return 503,
  and the login page shows the password form. The change is inert until Entra is
  configured.

## Audit trail

Every API request is recorded to the `audit_log` table (SysAdmin → Audit
Trail, `/sysadmin/audit-log`): timestamp (GMT), module, action, user, plus
method/path/status/IP. This is fully automatic — adding a new module needs no
audit-specific code:

- `artifacts/api-server/src/routes/index.ts` tags each top-level router mount
  with `tagAuditModule("<name>")`; a router mounted without a tag still gets
  audited, falling back to its first URL path segment as the module name.
- `artifacts/api-server/src/middlewares/auditLog.ts` derives a detailed action
  from the HTTP method, path (incl. record id), query filters, request body,
  and — for successful creates/updates — the resulting record returned by the
  route, e.g. `Updated role 12 (data: {"permissions":[...]}; result:
  {"id":12,...})`. This is "committed changes": automatic for every route
  with no per-route wiring, showing full before-intent/after-state rather
  than a minimal diff. Credential-like fields (password, token, ...) are
  redacted; action strings are capped at 5000 characters. Writes happen
  fire-and-forget after the response is sent, so logging never adds latency
  or can fail a request.
- `/healthz` liveness probes are excluded — everything else, including reads,
  is logged.
- **View duration** ("how long was this record open"): a stateless
  request/response can't capture this on its own, so record detail pages
  (Employee Profile, LOV category detail, an onboarding submission dialog)
  use the `useViewDuration` hook (`artifacts/hr-management/src/hooks/
  use-view-duration.ts`), which reports elapsed time via
  `navigator.sendBeacon` to `POST /audit-log/view-duration` when the page
  unmounts. The backend writes a `method: "VIEW"` row reusing the same
  action-phrasing as a normal GET, e.g. "Viewed employee 2585 for 3m 12s".
  Views under 1 second are skipped as noise. To add tracking to a new detail
  page: call `useViewDuration(module, path, active)` where `module` matches
  the `tagAuditModule` name used for that route.

## Architecture notes
- All request/response Zod schemas live in `lib/api-zod`; entity input/update bodies use dedicated component names (`DepartmentInput`, `EmployeeUpdate`, etc.) to avoid Orval type-name collisions.
- API route handlers validate with the generated Zod schemas and never use raw `req.body`/`req.params` unchecked.
- Drizzle `date` columns store `YYYY-MM-DD` strings; since the generated Zod schemas coerce date-format fields to JS `Date` objects, route handlers convert `Date` → date-string before insert/update.
- Employee `salary` is a Postgres `numeric` column; it's cast to `float8` in `SELECT`s so it serializes as a JSON number matching the generated response schema (numeric would otherwise come back as a string).

## Schema migrations (drizzle-kit)

Schema changes are applied via `lib/db/scripts/safe-push.mjs`, a thin wrapper around `drizzle-kit push` that prevents silent data loss in non-interactive shells.

| Situation | Command | Behaviour |
|-----------|---------|-----------|
| Interactive shell (normal) | `pnpm --filter @workspace/db push` | Passes through to drizzle-kit; prompts appear as usual for destructive changes. |
| Non-interactive, additive-only changes | `FORCE=1 pnpm --filter @workspace/db push` | Passes `--force`; skips prompts. Prints a prominent warning. Use only when you are certain no columns/tables will be dropped (e.g. adding new tables/columns). |
| Non-interactive, unknown safety | `pnpm --filter @workspace/db push` | Detects the missing TTY, prints a clear error, and **exits 1** without touching the database. |

`push-force` is an alias for `FORCE=1 … push` and is kept for convenience.

Never leave one-off raw-SQL migration scripts in the repo.

## Pre-commit hook

A git pre-commit hook at `scripts/git-hooks/pre-commit` (tracked in the repo) blocks commits that accidentally include generated build artefacts:

- `dist/` directories (compiled output)
- `*.tsbuildinfo` files (TypeScript incremental build info)
- `src/generated/` directories (Orval-generated API client / Zod schemas)

These are already listed in `.gitignore`; the hook is a second line of defence against `git add -f` accidents.

**Installation** — the hook is installed automatically by `pnpm install` via the root `prepare` script. After a fresh clone, run `pnpm install` once and the hook will be active. To install it manually without a full install: `pnpm run prepare`.

## User preferences
- Brand identity from the uploaded logo: navy/red/green compass motif.
- Keep the tone professional throughout — no playful/thematic renaming of standard HR terms (e.g. use "Employee"/"Department", not invented nicknames).
- Every dropdown/select in the app must have a corresponding LOV category in SysAdmin → List of Values. When adding a new dropdown: (1) add the category key + label to `CATEGORY_LABELS` in `artifacts/api-server/src/routes/sysadmin/lov.ts`, (2) seed initial values into `lov_items`, (3) load options in the component with `useListLovItems("<category>")` — never hardcode the options array.
