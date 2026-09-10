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
npm run test       # vitest
npm run build      # production build
npm run check      # all of the above, in order
```

`npm run check` is the gate. No phase closes with it failing.

## Stack

Next.js 16 (App Router) · TypeScript strict · Tailwind v4 · Motion · Lucide ·
Supabase (Postgres, Auth, Storage) · Zod · Recharts · Vitest.

Light mode only, deliberately — the dark ramp is defined but per-screen dark
treatments were never designed, and the design forbids inventing them. See
`docs/DECISIONS.md` D4.
