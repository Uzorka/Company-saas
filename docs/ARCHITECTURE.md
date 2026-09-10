# Architecture

## Shape
One Next.js (App Router) application serving three surfaces, separated by route group and resolvable to separate domains on Vercel later without a code change:

- `(public)` — marketing site and careers → `chfheron.com`
- `(auth)` — sign in, forgot, reset, workspace picker → `app.heron.app/auth`
- `(workspace)/[org]` — the authenticated, org-scoped application → `app.heron.app/:org`
- `(platform)/admin` — tenant administration → `admin.heron.app`

Org scoping lives in the URL from day one. The design shows an organisation switcher in the topbar in Phase 3, so multi-tenancy is structural, not deferred — retrofitting it is the most expensive mistake available here (the design says so explicitly).

## Stack
Next.js App Router · TypeScript strict · Tailwind (retokenised to the Heron design tokens) · shadcn/ui as unstyled behaviour primitives with its theme layer replaced · Motion for React · Supabase (Postgres, Auth, Storage, Realtime where it earns its place) · Zod · Recharts · Vercel · GitHub.

## Layering
- **Presentation** — server components by default; client components only where interaction requires them (capture panel, Kanban, command palette, charts).
- **Server actions / route handlers** — every mutation. Zod-validated input, permission re-checked server-side, server-authoritative timestamps.
- **Services** — business logic (geofence classification, leave balances, payroll calculation, pipeline transitions) in plain testable modules, independent of React and of the request.
- **Data** — Supabase clients: a request-scoped server client (user's JWT, RLS applies), a browser client (anon key, RLS applies), and a service-role client used only inside server code paths that genuinely need to bypass RLS (audit writes, retention jobs, signed-URL issuance).

Authorisation is never derived from a browser-supplied role value, and never stored only in `localStorage`.

## Two independent gates
1. **Server-side permission checks** in every action and loader.
2. **Row Level Security** in Postgres.

Neither substitutes for the other. Hiding a sidebar item is not authorisation — and per the design, restricted modules stay visible with a lock rather than disappearing.

## Claims
A Supabase custom access token hook stamps `organization_id`, `role_slugs[]` and `permission_slugs[]` into the JWT at sign-in and on org switch, so RLS policies read claims instead of joining `user_roles` on every row.

## Offline
A service worker plus an IndexedDB outbox covers **check-in and field-visit capture only**, with idempotent server endpoints. The design makes this promise in user-facing copy, so it is a requirement. Everything else requires connectivity and says so plainly.

## Money and time
All monetary values are Postgres `numeric(14,2)` with a stored `currency_code` (default NGN). Payroll arithmetic runs in SQL, not in JavaScript floating point. All decisive timestamps (`check-in`, `check-out`, evidence capture, payroll approval, leave approval, stage change) are written by the server.

## Immutability
Corrections are new records referencing the original — attendance corrections, returned visits, payroll adjustments, role revocations. Nothing in this product is destroyed. `audit_logs` has UPDATE and DELETE revoked from every role including Management, enforced by grants and a rejecting trigger.
