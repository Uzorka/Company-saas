# Deployment

Nothing is deployed yet. This is the plan.

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

## Security posture at deploy
- RLS enabled and asserted on every company-owned table before any environment holds real data.
- All buckets private except `public-assets`; private objects served only via short-TTL signed URLs.
- Redirects validated against an allowlist.
- Public forms (contact, job application) rate-limited; the strategy is documented alongside the implementation in Phase 8.
- Safe error messages — no stack traces, no raw codes reaching a user.

## CI
GitHub Actions running lint, typecheck, unit and integration tests and a production build on every pull request. Merge to the phase branch only once the phase's gate passes.
