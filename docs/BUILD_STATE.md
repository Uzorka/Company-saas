# Build state

**Current phase:** Phase 1 — foundation. Complete and green.
**Next phase:** Phase 2 — Supabase and security foundation. **Awaiting approval.**

## Completed

### Phase 0 — Design inspection & technical plan
Read all 9 Claude Design files in full (`design/project/`), including the
imported `support.js` (prototype runtime; no product logic). Produced the
screen inventory (58), route map (34 paths across 4 surfaces), component
inventory (15), role-to-screen access matrix, database entity list (~55
tables), storage bucket plan (8 buckets), RLS strategy (10 rules), 10-phase
implementation plan, 16 technical conflicts and 14 missing inputs. See
`PHASE_0_PLAN.md`.

### Phase 1 — Foundation
- Next.js 16 App Router, TypeScript strict, Tailwind v4, ESLint, Vitest.
- **Design tokens** as Tailwind v4 `@theme` custom properties in
  `src/app/globals.css`: the full brand and neutral ramps, four semantic
  pairs, validation surfaces, the 8-step type scale, 5 radii, 4 elevations,
  5 motion durations, 3 easings, shell geometry. Light mode only; the dark
  ramp is declared but not applied.
- IBM Plex Sans and IBM Plex Mono wired through `next/font`.
- Reduced-motion and focus-visible handled globally; a skip-to-content
  utility as the first tab stop.
- **Components:** Button (4 variants x 3 sizes, loading, disabled),
  IconButton (label required), Field + Input + Textarea + Select, Card,
  Avatar, StatusPill, and all four universal states (empty, filtered-empty,
  error, permission).
- **App shell:** 186/58px animated sidebar with role-filtered navigation and
  the restricted-not-hidden lock, topbar with breadcrumb + org identity +
  notification count, mobile bottom nav capped at four items, More bottom
  sheet, and a working command palette on Cmd/Ctrl+K.
- **Supabase clients:** browser, request-scoped server, and a service-role
  client fenced behind `server-only`.
- `.env.example` committed; no real credentials anywhere.

## Routes added
`/` (public placeholder) · `/[org]/dashboard` (workspace shell demo)

## Components added
`ui/button` `ui/field` `ui/card` `ui/avatar` `ui/status-pill` `states/index`
`shell/app-shell` `shell/sidebar` `shell/topbar` `shell/bottom-nav`
`shell/command-palette`

## Database migrations
None yet. Phase 2 begins `001_organizations`.

## Environment variables required
`NEXT_PUBLIC_SUPABASE_URL` `NEXT_PUBLIC_SUPABASE_ANON_KEY`
`SUPABASE_SERVICE_ROLE_KEY` (server-only) `NEXT_PUBLIC_SITE_URL`.
A map provider key is pending the provider decision.

## Tests
16 passing across 4 files: status vocabulary (every tone has a distinct
glyph, so colour is never the only cue), role navigation (HR has no payroll,
Accounts has no HR modules, only Management has audit), motion tokens, and
the sidebar's restricted-not-hidden rule.

## Known limitations
- The workspace layout renders a **fixed demo identity**. Roles and
  permissions come from the session in Phase 2; nothing here is
  authorisation.
- The dashboard and public home are deliberate placeholders. They show
  components, not fabricated statistics.
- Table, slide-over, dialog, bottom-sheet-as-filters, toast, timeline,
  capture panel and evidence viewer are specified but not yet built — they
  land with the modules that use them, from Phase 2 onward.
- No database, no auth, no RLS yet.

## Awaiting decisions
C1 geofence default (10 m vs 150 m) · C2 dark mode · C4 out-of-range field
visits · C6 map provider · C10 selfie/face-matching. Full list in
`PHASE_0_PLAN.md` sections 0.10-0.11.

## Blocked
Remote repository does not exist yet — the GitHub App cannot create one
("Resource not accessible by integration"). Commits are local only until a
repository is created and access granted.
