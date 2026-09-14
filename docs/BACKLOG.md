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

Resolved 2026-09-14: the client supplied a structured extract of chfheron.com.
See `docs/reference/chfheron-brand.md`. Name, founding year, headline, business
description, office address, phone and emails are now taken from the company's
own pages. The Apapa address previously shown was a directory error and is gone.

**Needs CHF Heron's explicit agreement before it goes on a public URL:**
- Leadership names, titles and photos. The extract records `leadership: null` —
  the company publishes none. Still deliberately empty, see D56.
- Contact email and phone. Both are now known and verified
  (`social@chfheron.com`, `sales@chfheron.com`, `+234 704 410 2187`) and are
  still not published here: a demonstration must not collect enquiries meant
  for them. The contact page links to chfheron.com instead.
- Partner logos. The brand marks belong to their owners; appearing on CHF
  Heron's site is not a licence for ours. Brand names as plain text are fine —
  the company lists them publicly itself.
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

**Demo data: done** (D64). `supabase/setup/demo-seed.sql` adds 23 fictional
employees with attendance, tasks, field visits, leave, two payroll runs and
applicants. Reversible with `demo-seed-remove.sql`.

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
