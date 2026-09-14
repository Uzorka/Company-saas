"use client";

import { useRouter } from "next/navigation";
import { Field, Select, Input } from "@/components/ui/field";
import { Button } from "@/components/ui/button";

/**
 * Audit filters.
 *
 * Submits as a plain GET form, so the filtered view has its own URL: an
 * auditor's whole job is to be able to say "here is what I looked at", and a
 * filter held in component state cannot be linked to or bookmarked.
 */
export function AuditFilters({
  org,
  actions,
  entities,
  current,
}: {
  org: string;
  actions: string[];
  entities: string[];
  current: { action?: string; entity?: string; from?: string; to?: string };
}) {
  const router = useRouter();
  const isFiltered = Object.values(current).some(Boolean);

  return (
    <form
      action={`/${org}/audit`}
      method="get"
      className="flex flex-wrap items-end gap-3 rounded-xl border border-border bg-surface p-4"
    >
      <Field label="Module" htmlFor="action" className="min-w-[150px]">
        <Select id="action" name="action" defaultValue={current.action ?? ""}>
          <option value="">All</option>
          {actions.map((action) => (
            <option key={action} value={action}>
              {action.charAt(0).toUpperCase() + action.slice(1).replace(/_/g, " ")}
            </option>
          ))}
        </Select>
      </Field>

      <Field label="Record type" htmlFor="entity" className="min-w-[160px]">
        <Select id="entity" name="entity" defaultValue={current.entity ?? ""}>
          <option value="">All</option>
          {entities.map((entity) => (
            <option key={entity} value={entity}>
              {entity.replace(/_/g, " ")}
            </option>
          ))}
        </Select>
      </Field>

      <Field label="From" htmlFor="from">
        <Input id="from" name="from" type="date" defaultValue={current.from ?? ""} />
      </Field>

      <Field label="To" htmlFor="to">
        <Input id="to" name="to" type="date" defaultValue={current.to ?? ""} />
      </Field>

      <div className="flex gap-2">
        <Button type="submit" variant="secondary">
          Apply
        </Button>
        {isFiltered ? (
          <Button
            type="button"
            variant="ghost"
            onClick={() => router.push(`/${org}/audit`)}
          >
            Clear
          </Button>
        ) : null}
      </div>
    </form>
  );
}
