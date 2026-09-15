"use client";

import { useState, useTransition } from "react";
import { AlertCircle, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { setLeaveBalance, openLeaveYear } from "@/lib/leave/balances";
import type { FormState } from "@/lib/forms/result";
import type { EmployeeBalances } from "@/lib/leave/queries";
import type { LeaveTypeRow } from "@/lib/leave/queries";

/**
 * Entitlements, per person per leave type.
 *
 * Edited in place rather than through a panel: the job is usually "give these
 * four people two more days", and a slide-over per cell would make that four
 * round trips through a form.
 *
 * `taken_days` is shown and not editable. It moves only when a request is
 * finally approved — typing over it would be a way around the approval chain,
 * not a way to fix a number.
 */
export function BalancesTable({
  org,
  year,
  rows,
  types,
  canManage,
}: {
  org: string;
  year: number;
  rows: EmployeeBalances[];
  types: LeaveTypeRow[];
  canManage: boolean;
}) {
  const [state, setState] = useState<FormState>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const capped = types.filter((t) => t.annual_entitlement_days !== null);
  const missing = rows.filter((r) =>
    capped.some((t) => r.byType[t.id] === undefined),
  ).length;

  function save(employeeId: string, leaveTypeId: string, value: string) {
    const key = `${employeeId}:${leaveTypeId}`;
    setState({});
    setBusy(key);
    startTransition(async () => {
      const formData = new FormData();
      formData.set("org", org);
      formData.set("employeeId", employeeId);
      formData.set("leaveTypeId", leaveTypeId);
      formData.set("year", String(year));
      formData.set("entitledDays", value);
      setState(await setLeaveBalance({}, formData));
      setBusy(null);
    });
  }

  function openYear() {
    setState({});
    setBusy("year");
    startTransition(async () => {
      const formData = new FormData();
      formData.set("org", org);
      formData.set("year", String(year));
      setState(await openLeaveYear({}, formData));
      setBusy(null);
    });
  }

  return (
    <div className="flex flex-col gap-4">
      {canManage && missing > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-warn-border bg-warn-surface p-4">
          <p className="max-w-[70ch] text-small text-text-2">
            <span className="font-medium">
              {missing} {missing === 1 ? "person has" : "people have"} no
              entitlement for {year}.
            </span>{" "}
            Until they do, every request they make against a capped type is
            refused with &ldquo;you have 0 days left&rdquo; — the check reads
            the balance, and a missing row counts as nothing left.
          </p>
          <Button onClick={openYear} disabled={busy !== null}>
            {busy === "year" ? "Working…" : `Open ${year}`}
          </Button>
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

      {state.done ? (
        <p className="flex items-start gap-2 rounded-lg border border-success-border bg-success-surface p-3 text-small text-success-fg">
          <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden />
          Saved.
        </p>
      ) : null}

      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] border-collapse text-small">
          <caption className="sr-only">
            Leave entitlement and days taken, by employee and leave type, for{" "}
            {year}
          </caption>
          <thead>
            <tr className="border-b border-border">
              <th scope="col" className="py-2 pr-3 text-left font-medium">
                Employee
              </th>
              {types.map((t) => (
                <th key={t.id} scope="col" className="px-3 py-2 text-left font-medium">
                  {t.name}
                  <span className="mt-0.5 block text-[11px] font-normal text-text-3">
                    {t.annual_entitlement_days === null
                      ? "uncapped"
                      : `${t.annual_entitlement_days} days standard`}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.employeeId} className="border-b border-border">
                <th scope="row" className="py-2.5 pr-3 text-left font-normal">
                  {row.name}
                  <span className="mt-0.5 block font-mono text-[11px] text-text-3">
                    {row.employeeNo}
                    {row.department ? ` · ${row.department}` : ""}
                  </span>
                </th>
                {types.map((type) => {
                  const balance = row.byType[type.id];
                  const key = `${row.employeeId}:${type.id}`;

                  if (type.annual_entitlement_days === null) {
                    return (
                      <td key={type.id} className="px-3 py-2.5 text-text-3">
                        Uncapped
                      </td>
                    );
                  }

                  return (
                    <td key={type.id} className="px-3 py-2.5">
                      {canManage ? (
                        <label className="flex items-center gap-2">
                          <span className="sr-only">
                            {type.name} entitlement for {row.name}
                          </span>
                          <Input
                            type="number"
                            min={0}
                            max={365}
                            step="0.5"
                            className="w-20"
                            defaultValue={balance?.entitled ?? ""}
                            placeholder="—"
                            disabled={busy === key}
                            onBlur={(event) => {
                              const value = event.currentTarget.value;
                              const before = balance?.entitled;
                              if (value === "" ) return;
                              if (before !== undefined && Number(value) === before) return;
                              save(row.employeeId, type.id, value);
                            }}
                          />
                        </label>
                      ) : (
                        <span>{balance ? balance.entitled : "—"}</span>
                      )}
                      <span className="mt-1 block text-[11px] text-text-3">
                        {balance
                          ? `${balance.taken} taken · ${balance.entitled - balance.taken} left`
                          : "no entitlement set"}
                      </span>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
