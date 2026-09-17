"use client";

import { useState, useTransition } from "react";
import {
  AlertCircle,
  CalendarClock,
  CheckCircle2,
  Mail,
  MailWarning,
  PauseCircle,
  UserRoundCheck,
  X,
} from "lucide-react";
import { Card, CardBody } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusPill } from "@/components/ui/status-pill";
import { Avatar } from "@/components/ui/avatar";
import { SlideOver } from "@/components/ui/slide-over";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { Reveal } from "@/components/ui/reveal";
import { EmptyState } from "@/components/states";
import { BOARD_STAGES, stageLabel, stageTone, type Stage } from "@/lib/recruitment/model";
import { formatDate } from "@/lib/employees/display";
import {
  moveApplicant,
  holdApplicant,
  scheduleInterview,
  hireApplicant,
  type PipelineState,
} from "@/lib/recruitment/pipeline";

export type Applicant = {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string | null;
  location: string | null;
  cover_letter: string | null;
  stage: Stage;
  created_at: string;
  on_hold_at: string | null;
  on_hold_reason: string | null;
  interview_at: string | null;
  interview_location: string | null;
  job: { title: string } | null;
};

type Option = { id: string; label: string };

/** Which actions the current stage actually offers. */
type Action = "shortlist" | "interview" | "hire" | "reject" | "hold";

function actionsFor(applicant: Applicant): Action[] {
  switch (applicant.stage) {
    case "applied":
    case "screening":
      return ["shortlist", "hold", "reject"];
    case "shortlisted":
      return ["interview", "hold", "reject"];
    case "interview":
    case "offered":
      return ["hire", "interview", "hold", "reject"];
    // Hired, rejected and withdrawn are the end of it. Offering a button that
    // reopens someone's rejection is a decision this screen should not make
    // casually — the applicant record stays readable either way.
    default:
      return [];
  }
}

/**
 * The hiring pipeline, and the decisions it takes.
 *
 * The board was read-only: it could display an applicant and do nothing to
 * one, so every stage move happened in someone's inbox and nothing was
 * recorded. Each action here calls a database function that writes the move
 * and its history in the same statement, and queues the email in the same
 * breath — so a candidate who was told something and a candidate whose record
 * says they were told it cannot come apart.
 */
export function PipelineBoard({
  org,
  rows,
  departments,
  positions,
  canMove,
  canHire,
  emailReady,
}: {
  org: string;
  rows: Applicant[];
  departments: Option[];
  positions: Option[];
  canMove: boolean;
  canHire: boolean;
  emailReady: boolean;
}) {
  const [selected, setSelected] = useState<Applicant | null>(null);
  const [action, setAction] = useState<Action | null>(null);
  const [state, setState] = useState<PipelineState>({});
  const [pending, startTransition] = useTransition();

  function open(applicant: Applicant) {
    setSelected(applicant);
    setAction(null);
    setState({});
  }

  function run(
    fn: (prev: PipelineState, data: FormData) => Promise<PipelineState>,
    formData: FormData,
  ) {
    formData.set("org", org);
    if (selected) formData.set("applicationId", selected.id);
    setState({});
    startTransition(async () => {
      const result = await fn({}, formData);
      setState(result);
      // Closing on success would take the mail outcome off the screen with it,
      // and "did that email actually go?" is the question this screen exists
      // to answer. The panel stays; the board behind it has already updated.
      if (result.done) setAction(null);
    });
  }

  const actions = selected ? actionsFor(selected) : [];
  const shown = canMove ? actions : [];

  return (
    <>
      {!emailReady ? (
        <p className="flex items-start gap-2 rounded-lg border border-warn-border bg-warn-bg p-3 text-small text-warn-fg">
          <MailWarning className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>
            <strong>No email provider is configured.</strong> Shortlist,
            interview and offer messages are still written and kept, and they
            will send the moment a key is added — nothing is lost. See
            docs/DEPLOYMENT.md.
          </span>
        </p>
      ) : null}

      {rows.length === 0 ? (
        <EmptyState
          heading="No applicants yet"
          body="Applications from the careers site land here. Publish a role to start receiving them."
        />
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {BOARD_STAGES.map((stage) => {
            const inStage = rows.filter((row) => row.stage === stage);
            return (
              <section
                key={stage}
                aria-label={stageLabel[stage]}
                className="flex flex-col gap-2 rounded-xl bg-surface p-3"
              >
                <header className="flex items-center justify-between gap-2">
                  <h2 className="text-small font-semibold">{stageLabel[stage]}</h2>
                  <StatusPill tone={stageTone[stage]}>{inStage.length}</StatusPill>
                </header>

                {inStage.length === 0 ? (
                  <p className="py-4 text-center text-small text-text-3">Empty</p>
                ) : (
                  inStage.map((row, index) => (
                    <Reveal key={row.id} index={index}>
                      <button
                        type="button"
                        onClick={() => open(row)}
                        className="w-full text-left"
                      >
                        <Card interactive>
                          <CardBody className="flex flex-col gap-2 p-3 sm:p-3">
                            <span className="flex items-center gap-2">
                              <Avatar
                                name={`${row.first_name} ${row.last_name}`}
                                size="sm"
                              />
                              <span className="min-w-0 flex-1 truncate text-small font-medium">
                                {row.first_name} {row.last_name}
                              </span>
                            </span>
                            <span className="truncate text-[11px] text-text-3">
                              {row.job?.title ?? "Role removed"}
                            </span>
                            {row.on_hold_at ? (
                              <StatusPill tone="warn">On hold</StatusPill>
                            ) : null}
                            {row.interview_at && row.stage === "interview" ? (
                              <span className="font-mono text-[11px] text-text-3">
                                {new Date(row.interview_at).toLocaleString("en-GB", {
                                  day: "numeric",
                                  month: "short",
                                  hour: "2-digit",
                                  minute: "2-digit",
                                })}
                              </span>
                            ) : null}
                          </CardBody>
                        </Card>
                      </button>
                    </Reveal>
                  ))
                )}
              </section>
            );
          })}
        </div>
      )}

      <SlideOver
        open={selected !== null}
        onClose={() => setSelected(null)}
        title={selected ? `${selected.first_name} ${selected.last_name}` : ""}
        subtitle={selected?.job?.title ?? undefined}
      >
        {selected ? (
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center gap-2">
              <StatusPill tone={stageTone[selected.stage]}>
                {stageLabel[selected.stage]}
              </StatusPill>
              {selected.on_hold_at ? (
                <StatusPill tone="warn">On hold</StatusPill>
              ) : null}
            </div>

            {selected.on_hold_reason ? (
              <p className="rounded-lg border border-warn-border bg-warn-surface p-3 text-small text-text-2">
                {selected.on_hold_reason}
              </p>
            ) : null}

            <dl className="grid gap-3 sm:grid-cols-2">
              <Detail label="Email">{selected.email}</Detail>
              <Detail label="Phone">{selected.phone ?? "—"}</Detail>
              <Detail label="Location">{selected.location ?? "—"}</Detail>
              <Detail label="Applied" mono>
                {formatDate(selected.created_at)}
              </Detail>
              {selected.interview_at ? (
                <Detail label="Interview" mono>
                  {new Date(selected.interview_at).toLocaleString("en-GB", {
                    dateStyle: "medium",
                    timeStyle: "short",
                  })}
                  {selected.interview_location
                    ? ` · ${selected.interview_location}`
                    : ""}
                </Detail>
              ) : null}
            </dl>

            {selected.cover_letter ? (
              <div className="rounded-lg border border-border p-3">
                <p className="text-overline text-text-3">Cover letter</p>
                <p className="mt-1 whitespace-pre-wrap text-small text-text-2">
                  {selected.cover_letter}
                </p>
              </div>
            ) : null}

            {state.error ? (
              <p
                role="alert"
                className="flex items-start gap-2 rounded-lg border border-error-border bg-error-surface p-3 text-small text-danger-fg"
              >
                <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
                {state.error}
              </p>
            ) : null}

            {state.done ? <MailResult mail={state.mail} /> : null}

            {shown.length === 0 ? (
              <p className="border-t border-border pt-4 text-small text-text-3">
                {canMove
                  ? "This application is closed. The record stays searchable."
                  : "Your role can read applications but not move them."}
              </p>
            ) : action === null ? (
              <div className="flex flex-wrap gap-2 border-t border-border pt-4">
                {shown.includes("shortlist") ? (
                  <Button
                    onClick={() => {
                      const data = new FormData();
                      data.set("stage", "shortlisted");
                      run(moveApplicant, data);
                    }}
                    disabled={pending}
                  >
                    <CheckCircle2 aria-hidden />
                    Shortlist
                  </Button>
                ) : null}

                {shown.includes("interview") ? (
                  <Button
                    variant={selected.stage === "shortlisted" ? "primary" : "secondary"}
                    onClick={() => setAction("interview")}
                    disabled={pending}
                  >
                    <CalendarClock aria-hidden />
                    {selected.interview_at ? "Reschedule" : "Schedule interview"}
                  </Button>
                ) : null}

                {shown.includes("hire") && canHire ? (
                  <Button onClick={() => setAction("hire")} disabled={pending}>
                    <UserRoundCheck aria-hidden />
                    Make an employee
                  </Button>
                ) : null}

                {shown.includes("hold") ? (
                  <Button
                    variant="secondary"
                    onClick={() => setAction("hold")}
                    disabled={pending}
                  >
                    <PauseCircle aria-hidden />
                    Put on hold
                  </Button>
                ) : null}

                {shown.includes("reject") ? (
                  <Button
                    variant="destructive"
                    onClick={() => setAction("reject")}
                    disabled={pending}
                  >
                    <X aria-hidden />
                    Reject
                  </Button>
                ) : null}
              </div>
            ) : null}

            {action === "reject" ? (
              <form
                action={(data) => {
                  data.set("stage", "rejected");
                  run(moveApplicant, data);
                }}
                className="flex flex-col gap-3 border-t border-border pt-4"
              >
                <Field
                  label="Why"
                  htmlFor="note"
                  hint="Kept permanently and required — a rejection with no reason is not a record. This is not emailed to the candidate."
                  required
                >
                  <Textarea id="note" name="note" rows={3} required minLength={10} />
                </Field>
                <div className="flex gap-2">
                  <Button type="submit" variant="destructive" loading={pending}>
                    Reject
                  </Button>
                  <Button variant="ghost" onClick={() => setAction(null)}>
                    Cancel
                  </Button>
                </div>
              </form>
            ) : null}

            {action === "hold" ? (
              <form
                action={(data) => run(holdApplicant, data)}
                className="flex flex-col gap-3 border-t border-border pt-4"
              >
                <Field
                  label="Why, if you want a note"
                  htmlFor="reason"
                  hint="They stay at this stage. Any later decision lifts the hold."
                >
                  <Textarea id="reason" name="reason" rows={2} />
                </Field>
                <div className="flex gap-2">
                  <Button type="submit" loading={pending}>
                    Put on hold
                  </Button>
                  <Button variant="ghost" onClick={() => setAction(null)}>
                    Cancel
                  </Button>
                </div>
              </form>
            ) : null}

            {action === "interview" ? (
              <form
                action={(data) => run(scheduleInterview, data)}
                className="flex flex-col gap-3 border-t border-border pt-4"
              >
                <Field
                  label="Date and time"
                  htmlFor="at"
                  hint="In your own timezone. The email shows it in the company's."
                  required
                >
                  <Input id="at" name="at" type="datetime-local" required />
                </Field>
                <Field label="Where" htmlFor="location">
                  <Input
                    id="location"
                    name="location"
                    placeholder="Head Office, Victoria Island — or a meeting link"
                  />
                </Field>
                <Field
                  label="Anything they should bring or know"
                  htmlFor="note"
                  hint="Added to the email in your words."
                >
                  <Textarea id="note" name="note" rows={2} />
                </Field>
                <div className="flex gap-2">
                  <Button type="submit" loading={pending}>
                    <Mail aria-hidden />
                    Schedule and email them
                  </Button>
                  <Button variant="ghost" onClick={() => setAction(null)}>
                    Cancel
                  </Button>
                </div>
              </form>
            ) : null}

            {action === "hire" ? (
              <form
                action={(data) => run(hireApplicant, data)}
                className="flex flex-col gap-3 border-t border-border pt-4"
              >
                <p className="text-small text-text-2">
                  This creates their staff record and emails the offer. It does
                  not create a sign-in — that is issued from Employees, where
                  the password is shown once. Pay is set on their profile by
                  someone with payroll access, and the offer email says terms
                  follow separately.
                </p>

                <Field
                  label="Employee number"
                  htmlFor="employeeNo"
                  hint="Letters, a dash, then digits — CHF-1042."
                  required
                >
                  <Input id="employeeNo" name="employeeNo" placeholder="CHF-1042" required />
                </Field>

                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Department" htmlFor="departmentId">
                    <Select id="departmentId" name="departmentId" defaultValue="">
                      <option value="">Not set</option>
                      {departments.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.label}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Position" htmlFor="positionId">
                    <Select id="positionId" name="positionId" defaultValue="">
                      <option value="">Not set</option>
                      {positions.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.label}
                        </option>
                      ))}
                    </Select>
                  </Field>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Start date" htmlFor="hireDate" required>
                    <Input id="hireDate" name="hireDate" type="date" required />
                  </Field>
                  <Field label="Employment type" htmlFor="employmentType" required>
                    <Select id="employmentType" name="employmentType" defaultValue="full_time" required>
                      <option value="full_time">Full time</option>
                      <option value="part_time">Part time</option>
                      <option value="contract">Contract</option>
                      <option value="intern">Intern</option>
                      <option value="nysc">NYSC</option>
                    </Select>
                  </Field>
                </div>

                <div className="flex gap-2">
                  <Button type="submit" loading={pending}>
                    <UserRoundCheck aria-hidden />
                    Hire and send the offer
                  </Button>
                  <Button variant="ghost" onClick={() => setAction(null)}>
                    Cancel
                  </Button>
                </div>
              </form>
            ) : null}
          </div>
        ) : null}
      </SlideOver>
    </>
  );
}

/** What happened to the message this action queued. */
function MailResult({ mail }: { mail?: PipelineState["mail"] }) {
  if (!mail) {
    return (
      <p className="flex items-start gap-2 rounded-lg border border-success-border bg-success-surface p-3 text-small text-success-fg">
        <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden />
        Done.
      </p>
    );
  }

  if (mail.queued) {
    return (
      <p className="flex items-start gap-2 rounded-lg border border-warn-border bg-warn-surface p-3 text-small text-text-2">
        <MailWarning className="mt-0.5 size-4 shrink-0" aria-hidden />
        Done, and the message is written and waiting — no email provider is
        configured yet, so nothing has been delivered.
      </p>
    );
  }

  if (mail.failed > 0) {
    return (
      <p className="flex items-start gap-2 rounded-lg border border-error-border bg-error-surface p-3 text-small text-danger-fg">
        <MailWarning className="mt-0.5 size-4 shrink-0" aria-hidden />
        The applicant was moved, but the email did not send. It is kept and can
        be retried — the reason is recorded against it.
      </p>
    );
  }

  return (
    <p className="flex items-start gap-2 rounded-lg border border-success-border bg-success-surface p-3 text-small text-success-fg">
      <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden />
      Done{mail.sent > 0 ? ", and the email has been sent." : "."}
    </p>
  );
}

function Detail({
  label,
  mono,
  children,
}: {
  label: string;
  mono?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <dt className="text-overline text-text-3">{label}</dt>
      <dd className={mono ? "mt-1 font-mono text-small" : "mt-1 text-small"}>
        {children}
      </dd>
    </div>
  );
}
