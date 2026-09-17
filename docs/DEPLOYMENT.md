# Deployment

**Release order: database first, then code.**

A deploy that lands before its migration takes the affected screen down —
"Couldn't load recruitment" with no further explanation. It has happened once.
So when a change ships with a migration:

1. Paste `supabase/setup/install.sql` into the Supabase SQL editor. It is
   re-runnable and skips what is already applied.
2. Run `supabase/setup/verify.sql` and confirm **Database is at the latest
   migration** reads PASS.
3. Then let Vercel deploy, or redeploy if it already has.

`npm run test:selects` proves the code matches the migrations in this
repository. Nothing can prove it matches *your* database except verify.sql.

**Live.** `https://company-saas-nine.vercel.app/`, Supabase project
`xhnvlydfdocybzhhqkxa`. The runbook below is what was actually done, kept
current rather than aspirational.

## Applying a change

1. `npm run check` — must pass end to end. It is lint, typecheck, unit tests,
   the database suite, geofence parity, a production build, the accessibility
   gate and the end-to-end suite. The last two drive a real browser; see
   `TESTING.md` for why they exist.
2. Push to `main`. Vercel builds and deploys automatically.
3. **If the change adds a migration**, paste `supabase/setup/install.sql` into
   the Supabase SQL editor. It is re-runnable: each migration records itself in
   `schema_migrations` and is skipped if already applied, so pasting the whole
   file applies only what is new.
4. Paste `supabase/setup/verify.sql` and confirm all 26 rows read PASS.

### A project set up before the ledger existed
Run `supabase/setup/adopt.sql` once first. It changes no schema — it checks
which migrations are already present by looking for objects each one creates,
and records only those. Then run `install.sql` as above.

### Demo data
`supabase/setup/demo-seed.sql` loads 23 fictional employees with attendance,
tasks, leave, two payroll runs and applicants. Idempotent.
`demo-seed-remove.sql` takes it out again and leaves configuration untouched.

## History, honestly
The first install was run at Phase 4, when `install.sql` held migrations
0001–0015. Everything from Phase 5 on — tasks, leave, payroll, recruitment —
did not reach the database until Phase 10, because the bundle was not
re-runnable and re-pasting it failed on the first `create type`. The app spent
that time querying tables that did not exist. That is why step 3 exists and why
the ledger does.

## Environments
- **Development** — a Supabase development project plus Vercel preview deployments per pull request.
- **Production** — deferred until after the MVP is accepted. The architecture assumes a separate Supabase project rather than a shared one.

## Vercel
One Next.js project. The three surfaces are route groups, so they can be served from one domain during MVP and split later by attaching `chfheron.com`, `app.heron.app` and `admin.heron.app` to the same deployment with middleware-based rewrites — no code change required.

## Environment variables
`.env.example` is committed and lists every variable with a placeholder. `.env*` files containing real values are gitignored and never committed.

| Variable | Scope | Notes |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | client + server | |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | client + server | RLS applies |
| `SUPABASE_SERVICE_ROLE_KEY` | **server only** | Never exposed to the browser, never in a `NEXT_PUBLIC_` variable |
| `NEXT_PUBLIC_SITE_URL` | client + server | Redirect validation |
| map provider key | server | Once the provider is chosen |

## Supabase
Schema changes exist only as migration files under `supabase/migrations/`, applied via the Supabase CLI. No structure is ever created by hand in the dashboard. Storage buckets are created by migration too, with their RLS policies. `pg_cron` runs the retention jobs.

## Security posture
Audited in Phase 10 — every rule, the command run to check it, and the result
are in `SECURITY_AUDIT.md`. Two real vulnerabilities were found and fixed in
that pass (a settings policy that let HR weaken the password rules, and a
public form whose rate limit existed only as a comment); both are named at the
top of that document rather than buried.

- RLS enabled and asserted on every company-owned table: 248 assertions, run as
  the real database roles, mutation-tested.
- All buckets private except `public-assets`; private objects reach a browser
  only through a short-TTL signed URL.
- Redirects validated; 11 unit tests cover the attack shapes.
- The public application form is rate-limited in the database, not the action.
- The service-role key appears in exactly one server-only module.
- Safe error messages — no stack traces, no raw codes reaching a user.

## CI
GitHub Actions running lint, typecheck, unit and integration tests and a production build on every pull request. Merge to the phase branch only once the phase's gate passes.
