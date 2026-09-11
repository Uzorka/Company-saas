# Company Management SaaS

Multi-tenant HR, attendance verification, field-visit proof, leave, payroll and
recruitment, plus a public corporate website. Built from an approved Claude
Design handoff.

## The design is the source of truth

`design/` holds the approved design pack — nine files covering 58 screens, 15
components, 8 workflows and 16 animations. It is read-only reference: not
linted, not built, not modified. When a phase file and the Developer Handoff
disagree, the phase file wins.

Read `docs/PHASE_0_PLAN.md` before writing any code.

## Docs

| File | What it holds |
|---|---|
| `docs/PHASE_0_PLAN.md` | Screen, route and component inventories, role matrix, database plan, RLS strategy, phase plan, open conflicts |
| `docs/BUILD_STATE.md` | What is built right now, and what is next |
| `docs/ARCHITECTURE.md` | Shape of the app, layering, authorisation model |
| `docs/SCHEMA.md` | Planned tables, by migration |
| `docs/PERMISSIONS.md` | Roles, scopes, permission slugs |
| `docs/DESIGN_IMPLEMENTATION.md` | Tokens, motion, breakpoints, form rules, non-negotiables |
| `docs/DECISIONS.md` | Decisions taken and why; open ones marked |
| `docs/BACKLOG.md` | Missing inputs and deferred work |
| `docs/TESTING.md` · `docs/DEPLOYMENT.md` | Test and deploy plans |

## Getting started

```bash
npm install
cp .env.example .env.local   # fill in your Supabase project values
npm run dev
```

Then open `/` for the public placeholder, or `/chfheron/dashboard` for the
workspace shell.

## Commands

```bash
npm run dev        # dev server
npm run lint       # eslint
npm run typecheck  # tsc --noEmit
npm run test       # vitest — unit and component
npm run test:db    # migrations + RLS suite against real PostgreSQL
npm run build      # production build
npm run check      # all of the above, in order
```

`npm run check` is the gate. No phase closes with it failing.

## Database

Migrations live in `supabase/migrations/` and are the only way schema changes
happen — nothing is created by hand in the Supabase dashboard.

They are developed against a local PostgreSQL cluster so the policies can
actually be executed and asserted:

```bash
npm run db:start   # start a local cluster (idempotent)
npm run db:reset   # rebuild it, apply every migration, then the seed
npm run test:db    # rebuild and run the RLS suite
```

`supabase/tests/00_supabase_shim.sql` supplies the pieces a real Supabase
project would provide — the `auth` schema, `auth.uid()`, and the
anon/authenticated/service_role roles. It is test-only and never applied to a
real project.

The RLS suite runs as the actual database roles with JWT claims set the way
PostgREST sets them, so a pass reflects what the policies do rather than what
they look like they do. It is mutation-tested: see `docs/DECISIONS.md` D23.

### Against a real Supabase project

1. Apply `supabase/migrations/` in order.
2. Register the access token hook: **Authentication → Hooks → Customize Access
   Token**, pointing at `public.custom_access_token_hook`. **Without this
   there are no permission claims in the token and every policy denies.**
3. Run `supabase/seed.sql` for the tenant, offices and default roles.
4. Attach your account — the steps are at the foot of the seed file.

## Stack

Next.js 16 (App Router) · TypeScript strict · Tailwind v4 · Motion · Lucide ·
Supabase (Postgres, Auth, Storage) · Zod · Recharts · Vitest.

Light mode only, deliberately — the dark ramp is defined but per-screen dark
treatments were never designed, and the design forbids inventing them. See
`docs/DECISIONS.md` D4.
