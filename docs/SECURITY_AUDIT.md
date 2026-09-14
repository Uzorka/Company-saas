# Security audit — Phase 10

Every rule the brief set, with what was actually checked and what it returned.
Where a check is a command, it is the command that was run, not a paraphrase.

Two real vulnerabilities were found and fixed during this phase. They are at
the top rather than buried in a table, because a clean audit that quietly omits
what it found is a marketing document.

---

## Found and fixed

### 1. Settings were writable by roles that should not touch them

`org_settings_update` admitted all three settings scopes and left the choice of
*columns* to the server action. The anon key is public and the session JWT sits
in the browser, so any signed-in user could call PostgREST directly and write
whatever the policy allowed — no server action in the path.

Confirmed against the running database before changing anything:

| Role | Could do |
|---|---|
| HR | set `password_min_length` to 8, `session_timeout_minutes` to 999 |
| Accounts | cut `audit_retention_years` from 7 to 1 |

Fixed in migration 0030: `settings.manage` only. Nothing was lost — HR's real
area is `leave_types` and Accounts' is `statutory_rates`/`paye_bands`, each with
its own policy. Six assertions cover it; restoring the old policy fails the
suite. See D72.

### 2. The public form had no rate limit, and a comment saying it did

`apply_for_job()` listed four guards in its header, the fourth being "a simple
per-request rate limit, described below". There was none. This is the only
unauthenticated write in the product.

Fixed in migration 0032: five per source per hour, sixty per organization per
hour, enforced inside the function — `anon` holds execute on the RPC, so a
check in TypeScript would be advice rather than a control. Nine assertions,
mutation-tested. See D79.

---

## The checklist

| Rule | How it was checked | Result |
|---|---|---|
| Never expose the service-role key | `grep -rn "SERVICE_ROLE" src` | One reference, in `src/lib/supabase/admin.ts`, which is `import "server-only"`. Used by one server action. |
| No `.env` with real credentials committed | `git ls-files \| grep .env` | Only `.env.example`. |
| Server-side authorization | Every page calls `requireOrg()`; every mutation re-checks | Verified per route. |
| Row Level Security | 248 assertions run as the real `authenticated`/`anon` roles with PostgREST-shaped claims | Pass. Mutation-tested: 9 deliberate regressions each fail the suite. |
| Private storage | `supabase/migrations/0015_storage.sql` | Every bucket private except `public-assets`. Applicant CVs and attendance selfies reach a browser only through a signed URL. |
| Validate inputs on the server (Zod) | Every server action parses before touching SQL | Verified per action. |
| Safe error messages | `humanise()` / `describeWriteError()` | Database messages written for a reader pass through; anything else is replaced wholesale, so no schema detail leaks. |
| No unsafe SQL from user strings | `grep -rnE "\.rpc\(\|format\(" src` | Every database call is a parameterised `.rpc()` or a PostgREST query builder. No string-built SQL anywhere in the app. |
| Validate redirects | `src/lib/auth/redirect.ts` + 11 unit tests | Absolute URLs, protocol-relative `//evil`, backslash variants and `javascript:` are all refused. |
| Protect public forms | Migration 0032 | See finding 2. |
| Document the rate-limiting strategy | This file, and the migration's own header | Done. |
| No authorization state in localStorage | `grep -rn "localStorage" src` | One use: the company code on the sign-in form, a convenience with no authority. Nothing about identity or permission is read from the browser. |
| Never trust a browser-supplied role | Claims come from the verified JWT via `getClaims()` | The org slug in the URL is checked against the token, never believed. |
| No `role === 'hr'` style checks | `grep -rnE "role\s*===\s*['\"]"` | No hits in application code. Authorization is permission slugs throughout. |
| No `authenticated = true` on a sensitive table | Structural audit, `20_rls_audit.sql` | Pass. Three named exceptions, each asserted rather than excused — see below. |
| No reusable passwords committed | `supabase/seed.sql`, `demo-seed.sql` | Neither creates an auth user. Demo employees have `user_id` null and cannot sign in. |
| Users cannot edit audit history | Trigger + revoked grants + audit assertions | `audit_logs` has no insert policy for any app role; a trigger rejects every update and delete; `anon`, `authenticated` and `service_role` are all revoked by name. |
| Server-authoritative timestamps | `check_in()`, `check_out()`, `submit_field_visit()` | Times are `now()` in the database. The browser's clock is never trusted for a time anyone is paid against. |
| Every schema change is a migration | 33 migrations; `install.sql` is generated from them | No hand-applied structure. The generator is the only writer of the bundle. |

### The three named exceptions

The structural audit refuses to be relaxed, so anything legitimate is named and
then pinned by an assertion that fails if it grows:

1. **`anon` may read `jobs`** — filtered to `published` in the policy itself.
   Published roles are public by definition. A second public table would have
   to be a decision someone makes in the audit file.
2. **`permissions` is readable by any signed-in user** — the product's shared
   vocabulary (slug, module, description), identical for every tenant and
   carrying no tenant data. The roles matrix needs it to render.
3. **`public_form_submissions` has no policies at all** — the rate-limit ledger.
   Zero policies is a denial, not a gap, but only while it stays zero: two
   assertions fail if it ever gains a policy or a grant.

---

## Not covered, and why

**Penetration testing.** None was performed. This is a code and policy audit.

**The authenticated surface in a browser.** The accessibility and end-to-end
gates cover public pages only; both need a signed-in session against a live
Supabase project, which the build environment cannot reach. Everything behind
the login is covered by the database suite and unit tests, which is not the
same thing.

**Supabase project configuration.** Auth settings, email templates, JWT expiry
and network restrictions live in the dashboard, not the repository. `verify.sql`
checks what is visible from SQL; the rest is the operator's.

**Dependency vulnerabilities.** `npm audit` is not in the gate. Worth adding.

**`middleware.ts` is deprecated in Next 16.** It still runs, and it is what
refreshes the session and keeps unauthenticated callers out of the workspace.
It is deliberately not renamed yet: a rename that silently stopped being picked
up would disable both without failing a build or a test.
