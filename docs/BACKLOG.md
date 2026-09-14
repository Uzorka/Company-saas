# Backlog

## Blocking Phase 1
- **Repository placement** — see `DECISIONS.md` D20.
- **Supabase project + credentials** — URL, anon key, service-role key; one project or separate dev/prod.

## Blocking Phase 4
- **Map tile provider** — Mapbox / Google Static Maps / self-hosted OSM. Needed by the capture panel, evidence viewer and contact page. Cost and CSP both depend on it.
- Real office coordinates and geofence radii per site.
- Shift patterns and expected start times per department.
- Attendance policy: what counts as late, how a missed check-out is handled, whether remote check-in is open to all roles or field staff only.

## Blocking Phase 7
- Current PAYE band table, and confirmation that pension 8%/10% and NHF 2.5% are current.
- Confirmation of the leave policy (Annual 20d at 1.67/mo, Sick 10d with a certificate at 3+ days, Compassionate 5d, Maternity 16 weeks, Unpaid uncapped).

## Blocking Phase 8
Answered: CHF Heron Nigeria is the real client. This deployment is a pitch
demonstration, not their commissioned website — see `DECISIONS.md` D56.

**Verify before the demo is shown to CHF Heron.** `chfheron.com` is unreachable
from the build environment, so the content in `src/content/company.ts` marked
`CONFIRM` came from public directory listings, not from the company's own site:
- The four **services** — wording is ours, derived from the company's public
  description of itself as a full-service FMCG distributor. Check against
  chfheron.com.
- Both **office addresses** (Apapa; Victoria Island). Directory data goes stale.
- The **legal name** as it should appear — "CHF Heron Nigeria", "C.H.F. Heron
  Nigeria Limited", or their own preferred form.
- **Founding year and headcount.** Third-party listings say 1989 and ~130 staff.
  Not published anywhere in the app, because neither is confirmed.

**Needs CHF Heron's explicit agreement before it goes on a public URL:**
- Leadership names, titles and photos — deliberately empty, see D56.
- Contact email and phone, and whether an enquiry form should reach them.
- Client and brand logos (permission required from the brand owners, not only
  from CHF Heron).
- Logo and brand assets (SVG) plus a favicon set.
- Production domain(s), and whether `company.demo.isDemo` should be turned off.

## Needed before payroll runs for real
- **Confirm the statutory rates and PAYE bands.** The seeded values are the
  design's samples. They need checking against current FIRS, PenCom and NHF
  guidance and against the client's own practice. They are effective-dated
  data, so correcting them is an insert.
- Bank account details per employee, if a bank CSV export is wanted.

## Needed for Phase 6 (leave)
- **The public holiday calendar.** Leave day counts exclude weekends only.
  Nigerian public holidays need the client's actual list — guessing would
  miscount leave silently. Approved requests store their day count, so adding
  this later is safe.
- Confirmation that the seeded leave types match the client's real policy.

## Found by the Phase-8 system review — still open
The structural repairs are done (see `DECISIONS.md` D57-D59). These remain:

**Create paths: done** (D60). Employee, department, position, task, leave
request, payroll period and job can all be created through the UI. Still
missing: creating an office (attendance settings, which is part of the
unbuilt settings screen), and inviting an employee to sign in — an employee
record and a login are separate things in this schema and the invite flow
has not been built.

**Five screens do not exist**: reports, settings, audit log, documents,
notifications. They render as "Soon" in the nav.

**No demo data.** `supabase/seed.sql` creates the organization, offices,
departments, positions, shift patterns, leave types, PAYE bands and roles —
and no employees, attendance, tasks, leave, payroll or jobs. Every screen is
empty, and with no create flow there is no way to fill it.

**The notification bell is removed** until a notifications screen and table
exist.

## Design gaps — no screen exists
- Notifications centre (a bell with a count appears in the shell; no screen designed).
- Announcements composer (required by the brief; the design shows announcements only as dashboard content).
- Shift-pattern administration.
- Employee org chart (listed in the Phase 8 inventory, designed nowhere).

## Deferred past MVP — the design's own open items
- **Biometric check-in** — offered on second sign-in, or required by policy? Build: offer enrolment on the second successful sign-in, never the first; password fallback always available.
- **Same-period payroll reversal** — build next-period adjustment only; leave the data model able to represent a reversal without shipping the UI.
- **Retention limits** — 24/12 months were design assumptions; needs checking against the Nigeria Data Protection Act. Build as configurable values defaulting as designed.
- **Dark mode** — schedule as its own design phase.
- **Offline depth** — check-in and visit capture only for now; whether tasks and leave queue too is a scope decision.

## Explicitly out of scope for MVP
Bank transfer integration · automatic PAYE remittance · pension API integration · tax authority filing · government filing · any presentation of payroll output as final statutory compliance advice · billing (the design says platform admin excludes it).
