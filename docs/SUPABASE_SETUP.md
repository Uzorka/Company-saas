# Supabase setup

Everything needed to take this project from "validated locally" to "running".
Roughly 15 minutes.

**Project:** `xhnvlydfdocybzhhqkxa` — API URL `https://xhnvlydfdocybzhhqkxa.supabase.co`

Direct links for this project:

| Step | Link |
|---|---|
| SQL editor | https://supabase.com/dashboard/project/xhnvlydfdocybzhhqkxa/sql/new |
| Auth hooks | https://supabase.com/dashboard/project/xhnvlydfdocybzhhqkxa/auth/hooks |
| Auth users | https://supabase.com/dashboard/project/xhnvlydfdocybzhhqkxa/auth/users |
| API keys | https://supabase.com/dashboard/project/xhnvlydfdocybzhhqkxa/settings/api |

> **Note on the links.** This build environment's network policy blocks
> `supabase.com`, so none of these could be checked against the live
> dashboard. They follow the standard dashboard path scheme; if one 404s, the
> page is reachable from the sidebar. The project ref above is not a secret —
> it appears in every request a browser makes — but the keys on the API page
> are, and the service-role one especially so.

---

## 1. Create the project

**→ [supabase.com/dashboard/new](https://supabase.com/dashboard/new)**

- **Name:** `company-saas-dev` (make a separate `-prod` project later — do not
  develop against production)
- **Region:** closest to Lagos. `eu-west-1` (Ireland) or `eu-west-3` (Paris)
  are the usual choices; Supabase has no African region.
- **Database password:** generate a strong one and put it in your password
  manager. You will need it only for direct database connections.

Provisioning takes a couple of minutes.

---

## 2. Install the schema

**→ [SQL editor](https://supabase.com/dashboard/project/_/sql/new)**

Paste the entire contents of **`supabase/setup/install.sql`** and run it.

That file is generated from `supabase/migrations/` by
`scripts/build-setup-sql.sh` — the migrations remain the source of truth, and
the bundle is just all seven of them concatenated and wrapped in a
transaction. If anything fails, the whole thing rolls back and nothing is left
half-applied.

---

## 3. Register the access token hook

**→ [Authentication → Hooks](https://supabase.com/dashboard/project/_/auth/hooks)**

- Enable **Customize Access Token (JWT) Claims**
- Choose **Postgres** as the hook type
- Select the function **`public.custom_access_token_hook`**
- Save

**This step is not optional.** The hook is what puts `organization_id`,
`roles` and `permissions` into the signed token. Without it every Row Level
Security policy evaluates against an empty claim set and denies everything —
you will sign in successfully and then see nothing at all, which looks like a
broken app rather than a missing setting.

---

## 4. Seed the tenant

**→ [SQL editor](https://supabase.com/dashboard/project/_/sql/new)**

Paste and run **`supabase/seed.sql`**.

This creates the CHF Heron tenant, its settings, four offices and the five
default roles. It deliberately creates **no user accounts and no passwords** —
committing reusable credentials to a repository is how test passwords reach
production.

Office coordinates and geofence radii in the seed are the design's sample
values, pending your real ones.

---

## 5. Create your account and attach it

**→ [Authentication → Users](https://supabase.com/dashboard/project/_/auth/users)**

Click **Add user → Create new user**, with your email and a password you
choose. Tick *Auto Confirm User* so you skip the email round-trip.

Then, in the SQL editor, attach that account to the tenant and give it a role.
Replace the email; everything else is filled in for you:

```sql
-- Attach your account to the tenant as Management.
with me as (
  select id from auth.users where email = 'you@example.com'
),
org as (
  select id from organizations where slug = 'chfheron'
)
insert into organization_members (organization_id, user_id, status)
select org.id, me.id, 'active' from me, org
on conflict (organization_id, user_id) do update set status = 'active';

with me as (
  select id from auth.users where email = 'you@example.com'
),
org as (
  select id from organizations where slug = 'chfheron'
)
insert into user_roles (organization_id, user_id, role_id)
select org.id, me.id, r.id
from me, org
join roles r on r.organization_id = org.id and r.slug = 'management'
on conflict do nothing;
```

To test the other roles later, repeat with `'hr'`, `'accounts'`, `'hod'` or
`'employee'` — ideally as separate accounts, since that is how you will see
whether the permission matrix actually holds.

---

## 6. Verify

**→ [SQL editor](https://supabase.com/dashboard/project/_/sql/new)**

Paste and run **`supabase/setup/verify.sql`**. Every row should read `PASS`.

The output contains only counts and yes/no answers — no keys, no personal
data — so it is safe to paste back into a conversation. It names precisely
which step is incomplete.

---

## 7. Collect the keys

**→ [Project Settings → API](https://supabase.com/dashboard/project/_/settings/api)**

You need three values:

| Value | Where | Sensitivity |
|---|---|---|
| **Project URL** | top of the API settings page | Public |
| **anon** / **publishable** key | "Project API keys" | Public by design — it ships to every browser and is useless without RLS, which this project enforces |
| **service_role** / **secret** key | same page, behind *Reveal* | **Secret. Bypasses all Row Level Security.** |

Supabase has been renaming these — older projects show `anon` and
`service_role`, newer ones `publishable` and `secret`. They are the same two
things in the same place.

Put them in `.env.local` (already gitignored):

```bash
cp .env.example .env.local
```

```
NEXT_PUBLIC_SUPABASE_URL="https://<your-ref>.supabase.co"
NEXT_PUBLIC_SUPABASE_ANON_KEY="<anon / publishable key>"
SUPABASE_SERVICE_ROLE_KEY="<service_role / secret key>"
NEXT_PUBLIC_SITE_URL="http://localhost:3000"
```

> **Never paste the service-role key into a chat, an issue, or a commit.** It
> bypasses every policy in this project. If it is ever exposed, rotate it on
> the same API settings page.

---

## 8. Run it

```bash
npm install
npm run dev
```

Open `http://localhost:3000/auth/login`, sign in with **company code
`chfheron`** and the email and password from step 5.

Expected: you land on `/chfheron/dashboard` with the Management sidebar —
eleven items, no locks. Sign in as an Employee instead and you should see
seven items, with the rest still visible and locked.

---

## Troubleshooting

**Signed in, but every page is empty.** The access token hook is not
registered, or was registered after you signed in. Tokens are stamped at
sign-in: sign out and back in. If it persists, re-check step 3.

**"Supabase isn't configured yet".** `.env.local` is missing or the dev server
was not restarted after it was created.

**Redirected to the workspace picker in a loop.** Your account has no active
membership — step 5 did not take. Run `verify.sql`; checks 11 and 12 will say
so.

**Sign-in fails with correct details.** Confirm the user is marked confirmed
on the Users page. The app gives one message for a wrong password and an
unknown address alike, on purpose, so it cannot tell you which.

---

## Optional: let this build environment reach Supabase

Not required — the schema is developed and tested against local PostgreSQL,
and the app is built without ever contacting a project. But if you want Claude
to verify sign-in end to end rather than handing you a script to run, the
environment's network policy has to allow `supabase.com` and
`*.supabase.co`. Policies are chosen when an environment is created:
[code.claude.com/docs/en/claude-code-on-the-web](https://code.claude.com/docs/en/claude-code-on-the-web).


---

# Deploying to Vercel

The live deployment is **https://company-saas-nine.vercel.app**.

## Environment variables

| Name | Vercel "Type" | Value |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Config | `https://<ref>.supabase.co` — **no `/rest/v1/`** |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Config | anon / publishable key |
| `NEXT_PUBLIC_SITE_URL` | Config | the deployment's own address, no trailing slash |
| `SUPABASE_SERVICE_ROLE_KEY` | **Secret** | service_role / secret key |

### Choose the Type at creation time

Vercel **refuses to save** a `NEXT_PUBLIC_*` variable as Secret — the prefix
means the value is sent to the browser, so "secret" is a contradiction. And a
variable already saved as Secret **cannot be converted** to Config: saved
secrets are write-only.

Between those two rules you can deadlock: an existing Secret with a
`NEXT_PUBLIC_` name can be neither saved nor converted. The only way out is to
delete it and recreate it as Config.

So pick the Type before the first save. Only `SUPABASE_SERVICE_ROLE_KEY`
should be Secret.

### Do not add the Vercel Supabase integration

The import screen offers a Supabase integration under "Optional Integrations".
It provisions a **new** Supabase project and injects its own variables, which
will point the app at an empty database. Skip it and set the four variables by
hand.

### The URL trap

Supabase's Data API page shows `https://<ref>.supabase.co/rest/v1/`. That is
the REST endpoint, not the project URL. The client appends `/rest/v1/` itself,
so pasting the longer form produces `/rest/v1/rest/v1/` and every request
fails. Use the bare `https://<ref>.supabase.co`.

## Supabase URL configuration

**Authentication → URL Configuration**, once the deployment URL exists:

- **Site URL:** `https://<your-app>.vercel.app`
- **Redirect URLs:** `https://<your-app>.vercel.app/**`

Supabase will not send an auth link to a domain it does not recognise, so
without this password reset fails silently — the mail sends, the link bounces.

## Free tier

Supabase pauses a free project after roughly a week of inactivity. A dead-
looking app is usually a paused database; there is a Restore button on the
dashboard.
