# Testing

No tests exist yet. This is the plan; it is filled in phase by phase.

## Stack (proposed)
Vitest for unit and service tests · Testing Library for components · Playwright for end-to-end (Chromium is preinstalled in this environment) · a dedicated Supabase test project or a local Supabase for RLS tests, seeded and torn down per run.

## Unit and service tests
- Permission helpers — union across multiple roles, every one of the six scopes.
- Geofence distance calculation, and classification into office / remote / **uncertain**.
- Poor-GPS handling: accuracy wider than the radius must produce `uncertain` and a review flag, never a confident classification.
- Check-out: duration, forgotten checkout auto-close at midnight, duplicate check-in, duplicate checkout, a session crossing midnight.
- Field-visit distance and the out-of-range block.
- Leave balance arithmetic; balance changes only on final approval.
- Payroll calculation, in SQL, against fixed fixtures; PAYE band boundaries; the immutability of a published run line after a salary change.
- Recruitment stage transitions and the conversion guard against duplicate conversion.

## Authorisation and isolation tests
Each runs as a real signed-in user, not with the service-role key:
- Organisation A cannot read any row belonging to Organisation B — one assertion per company-owned table.
- Employee self-access: own record yes, a colleague's no.
- HOD scoped to the departments they head, and only those.
- HR has full people access and **no** payroll access.
- Accounts has full payroll access and **no** HR access.
- An employee sees only their own published payslips.
- `audit_logs` rejects UPDATE and DELETE from every role including Management.
- Private storage objects are unreachable without a signed URL, and signed URLs expire.
- An automated sweep asserting no sensitive table carries an `authenticated = true` policy.

## End-to-end flows
Mirroring the twelve clickable flows in Phase 8:
employee login · check-in with location and selfie · check-out · HOD attendance review · field task completion with proof · leave request · HOD leave approval · HR leave approval · payroll processing · payroll publication · employee payslip access · public job application · HR applicant review · applicant conversion.

## Design-fidelity checks
Responsive QA at the five designed widths (375, 430, 768, 1280, 1560) asserting the per-device rules — cards under 640px, icon rail at 768px, no horizontal table scroll on a phone. Reduced-motion assertions: with `prefers-reduced-motion`, check-in success must still be visible without transform.

## Gate
Lint, `tsc --noEmit`, unit, integration and a production build after every phase. No phase closes with a critical failure.


## The browser gates (Phase 10)

Two checks drive a real browser against the production build. They exist
because three separate bugs shipped through every other gate:

| Bug | What every other check said |
|---|---|
| `text-white` deleted from every primary button by the class merger (D80) | typecheck, lint and build all passed; the class was correct in the source |
| The product rendered in the system font for nine phases (D84) | the build passed and the fonts downloaded; nothing was applied |
| A contrast regression reintroduced within an hour of being fixed (D83) | nothing in the gate looked at colour |

None of them were visible to reading the code. All of them were obvious the
moment something rendered the page and measured it.

### `npm run test:a11y`
Builds, serves, audits, stops. Seven public pages at 400px and 1280px against
WCAG 2.1 AA via axe-core — fourteen pairs. Fails if a violation is found **or
if any pair could not be checked**: a page that errored silently would
otherwise read as a pass, which is the same false-green shape as D45 and D50.

### `npm run test:e2e`
Twenty-one checks in a real browser: the public journey and its navigation,
the sign-in form's fields, the routes that used to 404, and — asserted rather
than eyeballed — that nothing scrolls sideways at 390px on any public page.

It also carries two explicit regression guards, each naming the bug it exists
for: the computed body font must be Plus Jakarta Sans (D84), and the primary
button's label must compute to white (D80).

### What they do not cover
Everything behind the login. Both need a signed-in session against a live
Supabase project, which the build environment cannot reach. That gap is named
in `BACKLOG.md` rather than hidden behind a suite that tests only what happens
to be reachable.
