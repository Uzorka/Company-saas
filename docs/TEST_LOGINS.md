# Setting up your logins — step by step

You have six things to do. Each one takes a few minutes. Do them in order.

Your app: **https://company-saas-nine.vercel.app/**
Your company code: **chfheron** (you type this on the sign-in screen)

Nowhere in this guide do you type a password into a file. You choose two
passwords yourself, and the app generates the rest and shows them to you once.

---

## Step 1 — Check the demo data loaded

Go to your Supabase dashboard → **SQL Editor** → paste this → Run:

```sql
select 'Staff records'      as thing, count(*)::text as how_many from employees
union all select 'Attendance days',   count(*)::text from attendance_records
union all select 'Tasks',             count(*)::text from tasks
union all select 'Leave requests',    count(*)::text from leave_requests
union all select 'Leave balances',    count(*)::text from leave_balances
union all select 'Payroll runs',      count(*)::text from payroll_periods
union all select 'Payslips',          count(*)::text from payslips
union all select 'Job adverts',       count(*)::text from jobs
union all select 'Job applicants',    count(*)::text from job_applications
union all select 'People who can sign in', count(*)::text from organization_members
order by thing;
```

**You should see roughly this:**

| thing | how_many |
|---|---|
| Attendance days | 400–500 |
| Job adverts | 3 |
| Job applicants | 9 |
| Leave balances | 92 |
| Leave requests | 4 |
| Payroll runs | 2 |
| Payslips | 23 |
| People who can sign in | 2 |
| Staff records | 23 |
| Tasks | 10 |

If **People who can sign in** says `1`, stop — you still need the second
administrator. Go back and run the script that attaches
`contact@elvisuzorka.com`.

If anything else is `0`, tell me which one before going further.

---

## Step 2 — Sign in

Open **https://company-saas-nine.vercel.app/** and click Sign in.

Three boxes:

| Box | What to type |
|---|---|
| Company code | `chfheron` |
| Email | `elvis.uzorka909@gmail.com` |
| Password | the one you set for that account |

You should land on the dashboard with real-looking numbers on it.

---

## Step 3 — Make the Head of Department login

1. Click **Employees** in the left menu.
2. Click the **Create account** button (top right).
3. Fill in:
   - **Full name** — `Emeka Obi`
   - **Email** — `hod@heron.test`
   - **Role** — choose **Head of Department**
   - **Link to a staff record** — pick `Emeka Obi · CHF-1002` from the list
4. Click the button to create it.

**A password appears on the screen. Copy it now.** Write it in the table at
the bottom of this page, or anywhere you keep passwords.

It is shown once and cannot be shown again. If you lose it, delete that user
in Supabase (Authentication → Users) and do this step again.

Do not close the panel until you have copied it.

---

## Step 4 — Make the Employee login

Exactly the same as Step 3, but:

- **Email** — `staff@heron.test`
- **Role** — **Employee**
- **Link to a staff record** — pick `Adaeze Okonkwo · CHF-1003`

Copy the password again.

> **Why linking matters:** an employee record and a login are two different
> things. Linking them is what lets that person see *their own* payslip, leave
> and tasks. Without it those screens are correctly empty.

---

## Step 5 — Make the HR login

HR is different. It can see everyone's personal data, so **one person cannot
create it alone**. It takes two steps and two people.

### 5a. Create the account as an ordinary Employee

Same as Step 4, but:

- **Email** — `hr@heron.test`
- **Role** — **Employee** (yes, Employee — you change it in a moment)
- **Link to a staff record** — pick `Amaka Nwachukwu · CHF-1021`

Copy the password.

### 5b. Ask for the HR role

1. Click **Settings** in the left menu.
2. Find the **Role grants** box.
3. Click **Request a role**.
4. Fill in:
   - **Who is it for** — `Amaka Nwachukwu`
   - **Role** — **HR**
   - **Why** — write a real sentence, e.g.
     `Taking over people records and hiring from this month.`
5. Send it.

Nothing has changed yet. It now says **Awaiting approval**, and you will
notice there are no approve buttons for you. That is deliberate — you asked
for it, so someone else has to agree.

### 5c. Approve it as your second account

1. Sign out.
2. Sign in as `contact@elvisuzorka.com` (company code `chfheron`).
3. Go to **Settings → Role grants**.
4. Click **Approve and grant**.

Done. `hr@heron.test` is now HR.

---

## Step 6 — Make the Accounts login

Repeat Step 5 exactly, changing three things:

- **Email** — `accounts@heron.test`
- **Link to a staff record** — `Ifeoma Balogun · CHF-1018`
- **Role to request** — **Accounts**

---

## Your logins

Fill this in as you go.

| Sign in as | Role | Password |
|---|---|---|
| elvis.uzorka909@gmail.com | Management | _(you set it)_ |
| contact@elvisuzorka.com | Management | _(you set it)_ |
| hod@heron.test | Head of Department | |
| staff@heron.test | Employee | |
| hr@heron.test | HR | |
| accounts@heron.test | Accounts | |

Company code for all of them: **chfheron**

---

## Try this once you are done

Sign in as each one and notice what changes. This is the whole point of the
product, and it is the part worth showing a client.

- **`staff@heron.test`** — Payslips shows their payslip and nobody else's.
  Employees shows only them.
- **`hod@heron.test`** — Employees shows their department only. Search for
  someone from another department and they do not appear. Not hidden —
  genuinely not there for that session.
- **`hr@heron.test`** — owns people and hiring, and Payroll says they cannot
  see pay figures. That is correct, not a fault.
- **`accounts@heron.test`** — sees every salary, and cannot touch recruitment.
- **`elvis.uzorka909@gmail.com`** — sees everything, including the Audit log,
  which shows the role grants you just made. Nobody can edit it, including you.

---

## If something goes wrong

**"Those details didn't match."**
Wrong password, or wrong email. The message is deliberately the same for both.

**A new role has not appeared.**
Sign out and back in. Roles are read when you sign in.

**The Create account button is missing.**
You are not signed in as a Management account.

**The approve buttons are missing.**
You are the person who asked. Sign in as the other administrator.

**You lost a generated password.**
It cannot be recovered — that is by design. In Supabase go to
Authentication → Users, delete that user, and create the account again.
