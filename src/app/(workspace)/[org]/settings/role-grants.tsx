"use client";

import { useState, useTransition } from "react";
import { AlertCircle, ShieldCheck } from "lucide-react";
import { Card, CardBody } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusPill } from "@/components/ui/status-pill";
import { CreatePanel } from "@/components/forms/create-panel";
import { Field, Select, Textarea } from "@/components/ui/field";
import type { StatusTone } from "@/lib/status";
import {
  requestRoleGrant,
  approveRoleGrant,
  declineRoleGrant,
  revokeRoleGrant,
  type GrantState,
} from "@/lib/people/grants";
import type { GrantRequestRow, MemberOption } from "@/lib/people/queries";

const STATUS: Record<
  GrantRequestRow["status"],
  { tone: StatusTone; label: string }
> = {
  requested: { tone: "info", label: "Requested" },
  awaiting_second_approver: { tone: "warn", label: "Awaiting approval" },
  active: { tone: "success", label: "Granted" },
  declined: { tone: "mute", label: "Declined" },
  revoked: { tone: "mute", label: "Revoked" },
};

/**
 * Granting a high-risk role: request, then a second person approves.
 *
 * Management, HR and Accounts cannot be handed out by one person. That has
 * been true in the database since migration 0003 and enforced on `user_roles`
 * since 0033 — this screen is the path through it, which the product did not
 * have before.
 *
 * Declined and revoked requests stay on the list. The table has no delete
 * policy precisely so the record survives, and hiding closed rows here would
 * undo that on the way to the reader.
 */
export function RoleGrants({
  org,
  requests,
  members,
  roles,
  currentUserId,
  canManage,
}: {
  org: string;
  requests: GrantRequestRow[];
  members: MemberOption[];
  roles: { id: string; name: string; high_risk: boolean }[];
  currentUserId: string;
  canManage: boolean;
}) {
  const [error, setError] = useState<string | undefined>();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function decide(
    action: (state: GrantState, data: FormData) => Promise<GrantState>,
    requestId: string,
  ) {
    setError(undefined);
    setPendingId(requestId);
    const formData = new FormData();
    formData.set("org", org);
    formData.set("requestId", requestId);
    startTransition(async () => {
      const result = await action({}, formData);
      setPendingId(null);
      if (result.error) setError(result.error);
    });
  }

  return (
    <Card>
      <CardBody className="flex flex-col gap-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-h3">Role grants</h2>
            <p className="mt-1 max-w-[68ch] text-small text-text-2">
              Management, HR and Accounts carry payroll, document, settings and
              audit access, so no one person can grant them. One administrator
              requests; a different one approves. Everything here is permanent
              and appears in the audit log.
            </p>
          </div>
          {canManage ? (
            <CreatePanel
              org={org}
              action={requestRoleGrant}
              label="Request a role"
              title="Request a role grant"
              subtitle="This grants nothing on its own. A second administrator has to approve it."
              submitLabel="Send request"
            >
              <Field label="Who is it for" htmlFor="targetUserId" required>
                <Select id="targetUserId" name="targetUserId" required>
                  <option value="">Choose a person</option>
                  {members.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.label}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Role" htmlFor="roleId" required>
                <Select id="roleId" name="roleId" required>
                  <option value="">Choose a role</option>
                  {roles.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                      {r.high_risk ? " — high risk" : ""}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field
                label="Why"
                htmlFor="reason"
                hint="Kept permanently, and read by whoever approves it. At least a sentence."
                required
              >
                <Textarea id="reason" name="reason" rows={3} required minLength={10} />
              </Field>
            </CreatePanel>
          ) : null}
        </div>

        {error ? (
          <p
            role="alert"
            className="flex items-start gap-2 rounded-lg border border-error-border bg-error-surface p-3 text-small text-danger-fg"
          >
            <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
            {error}
          </p>
        ) : null}

        {requests.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border p-6 text-center text-small text-text-2">
            No role has been requested yet.
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {requests.map((r) => {
              const status = STATUS[r.status];
              const isRequester = r.requestedById === currentUserId;
              const awaiting = r.status === "awaiting_second_approver";
              const busy = pendingId === r.id;

              return (
                <li
                  key={r.id}
                  className="flex flex-col gap-2 rounded-lg border border-border p-4"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-body font-medium">{r.targetName}</span>
                    <span className="text-small text-text-2">as</span>
                    <span className="text-body font-medium">{r.role}</span>
                    {r.roleHighRisk ? (
                      <StatusPill tone="warn">High risk</StatusPill>
                    ) : null}
                    <StatusPill tone={status.tone}>{status.label}</StatusPill>
                  </div>

                  <p className="max-w-[80ch] text-small text-text-2">{r.reason}</p>

                  <p className="text-small text-text-3">
                    Requested by {r.requestedByName} on{" "}
                    {new Date(r.requested_at).toLocaleDateString("en-NG", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                    {r.approvedByName ? ` · approved by ${r.approvedByName}` : ""}
                  </p>

                  {canManage && awaiting ? (
                    isRequester ? (
                      // Saying why the buttons are absent is more useful than
                      // showing buttons that would be refused.
                      <p className="flex items-start gap-2 text-small text-text-2">
                        <ShieldCheck className="mt-0.5 size-4 shrink-0" aria-hidden />
                        You raised this, so someone else has to approve it.
                      </p>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        <Button
                          onClick={() => decide(approveRoleGrant, r.id)}
                          disabled={busy}
                        >
                          {busy ? "Working…" : "Approve and grant"}
                        </Button>
                        <Button
                          variant="secondary"
                          onClick={() => decide(declineRoleGrant, r.id)}
                          disabled={busy}
                        >
                          Decline
                        </Button>
                      </div>
                    )
                  ) : null}

                  {canManage && r.status === "active" && r.targetUserId !== currentUserId ? (
                    <div>
                      <Button
                        variant="secondary"
                        onClick={() => decide(revokeRoleGrant, r.id)}
                        disabled={busy}
                      >
                        {busy ? "Working…" : "Revoke"}
                      </Button>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </CardBody>
    </Card>
  );
}
