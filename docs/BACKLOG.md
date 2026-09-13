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
- Is *CHF Heron Nigeria* the real client, or design placeholder content?
- Real company copy: legal name, registered details, services, leadership names/titles/photos, office addresses, client logos (with permission), contact desks.
- Logo and brand assets (SVG) plus a favicon set.
- Production domain(s).

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
