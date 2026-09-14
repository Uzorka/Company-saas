"use client";

import { useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { Search, SlidersHorizontal } from "lucide-react";
import { DataTable, type Column } from "@/components/ui/data-table";
import { SlideOver } from "@/components/ui/slide-over";
import { StatusPill } from "@/components/ui/status-pill";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input, Select, Field } from "@/components/ui/field";
import { EmptyState, FilteredEmptyState } from "@/components/states";
import {
  employmentStatusLabel,
  employmentStatusTone,
  employmentTypeLabel,
  formatDate,
  fullName,
} from "@/lib/employees/display";
import type { DepartmentRow, EmployeeRow } from "@/lib/employees/queries";
import { cn } from "@/lib/utils";

/**
 * Directory. Row click opens a slide-over rather than navigating — the design
 * is explicit that the list stays behind it, so you keep your place.
 *
 * Filters live in the URL so a filtered directory is linkable and survives a
 * refresh. On a phone they open as a bottom sheet; a dropdown is ruled out.
 */
export function EmployeeDirectory({
  rows,
  departments,
  filters,
  createAction,
}: {
  rows: EmployeeRow[];
  departments: DepartmentRow[];
  orgSlug: string;
  /** The create panel, rendered by the server page when the caller may add. */
  createAction?: React.ReactNode;
  filters: { q: string; department: string; status: string };
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [selected, setSelected] = useState<EmployeeRow | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const isFiltered = Boolean(
    filters.q || filters.department || filters.status,
  );

  function applyFilter(key: string, value: string) {
    const next = new URLSearchParams({
      ...(filters.q ? { q: filters.q } : {}),
      ...(filters.department ? { department: filters.department } : {}),
      ...(filters.status ? { status: filters.status } : {}),
    });
    if (value) next.set(key, value);
    else next.delete(key);
    router.push(`${pathname}?${next.toString()}`);
  }

  const columns: Column<EmployeeRow>[] = [
    {
      key: "name",
      header: "Employee",
      primary: true,
      cell: (row) => (
        <span className="flex items-center gap-2.5">
          <Avatar name={fullName(row)} src={row.photo_url} size="md" />
          <span className="min-w-0">
            <span
              className={cn(
                "block truncate font-medium",
                // Exited people are greyed, never removed.
                row.employment_status === "exited" && "text-text-3",
              )}
            >
              {fullName(row)}
            </span>
            <span className="block truncate font-mono text-[11px] text-text-3">
              {row.employee_no}
            </span>
          </span>
        </span>
      ),
    },
    {
      key: "position",
      header: "Position",
      essential: true,
      cell: (row) => row.position?.title ?? "—",
    },
    {
      key: "department",
      header: "Department",
      cell: (row) => row.department?.name ?? "—",
    },
    { key: "location", header: "Location", cell: (row) => row.location ?? "—" },
    {
      key: "status",
      header: "Status",
      essential: true,
      cell: (row) => (
        <StatusPill tone={employmentStatusTone[row.employment_status]}>
          {employmentStatusLabel[row.employment_status]}
        </StatusPill>
      ),
    },
    {
      key: "hired",
      header: "Start date",
      cell: (row) => (
        <span className="font-mono text-small">{formatDate(row.hire_date)}</span>
      ),
    },
  ];

  const filterControls = (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
      <Field label="Department" htmlFor="department" className="sm:w-48">
        <Select
          id="department"
          value={filters.department}
          onChange={(event) => applyFilter("department", event.target.value)}
        >
          <option value="">All departments</option>
          {departments.map((department) => (
            <option key={department.id} value={department.id}>
              {department.name}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Status" htmlFor="status" className="sm:w-40">
        <Select
          id="status"
          value={filters.status}
          onChange={(event) => applyFilter("status", event.target.value)}
        >
          <option value="">All statuses</option>
          {Object.entries(employmentStatusLabel).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </Select>
      </Field>
    </div>
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-h1">Employees</h1>
          <p className="mt-1 text-body text-text-2">
            {rows.length} {rows.length === 1 ? "person" : "people"}
            {isFiltered ? " matching your filters" : ""}
          </p>
        </div>
        {createAction}
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <Field label="Search" htmlFor="q" className="min-w-[220px] flex-1">
          <span className="relative block">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-text-3"
              aria-hidden
            />
            <Input
              id="q"
              defaultValue={filters.q}
              placeholder="Name, employee number or email"
              className="pl-9"
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  applyFilter("q", event.currentTarget.value);
                }
              }}
            />
          </span>
        </Field>

        <div className="hidden sm:block">{filterControls}</div>

        <Button
          variant="secondary"
          className="sm:hidden"
          onClick={() => setFiltersOpen(true)}
        >
          <SlidersHorizontal aria-hidden />
          Filters
        </Button>
      </div>

      <DataTable
        rows={rows}
        columns={columns}
        getRowKey={(row) => row.id}
        onRowClick={setSelected}
        caption="Employee directory"
        empty={
          isFiltered ? (
            <FilteredEmptyState
              body="No one matches these filters. Try a different search, or widen the department and status filters."
              onClear={() => router.push(pathname)}
            />
          ) : (
            <EmptyState
              heading="No employees yet"
              body="When HR adds people to this organisation they appear here, with their department, position and status."
            />
          )
        }
      />

      <SlideOver
        open={selected !== null}
        onClose={() => setSelected(null)}
        title={selected ? fullName(selected) : ""}
        subtitle={selected?.position?.title ?? undefined}
      >
        {selected ? (
          <dl className="flex flex-col gap-4">
            <Detail label="Employee number" mono>
              {selected.employee_no}
            </Detail>
            <Detail label="Status">
              <StatusPill tone={employmentStatusTone[selected.employment_status]}>
                {employmentStatusLabel[selected.employment_status]}
              </StatusPill>
            </Detail>
            <Detail label="Department">
              {selected.department?.name ?? "—"}
            </Detail>
            <Detail label="Employment type">
              {employmentTypeLabel[selected.employment_type] ??
                selected.employment_type}
            </Detail>
            <Detail label="Location">{selected.location ?? "—"}</Detail>
            <Detail label="Work email">{selected.work_email ?? "—"}</Detail>
            <Detail label="Start date" mono>
              {formatDate(selected.hire_date)}
            </Detail>
            <p className="border-t border-border pt-4 text-small text-text-3">
              Personal details, documents and attendance history arrive with the
              full profile. Compensation is deliberately absent here — it is
              readable only by Accounts and Management, and by the person
              themselves.
            </p>
          </dl>
        ) : null}
      </SlideOver>

      {/* Phone: filters as a sheet, same options in the same order. */}
      <SlideOver
        open={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        title="Filters"
      >
        <div className="flex flex-col gap-4">
          {filterControls}
          <Button
            variant="secondary"
            onClick={() => {
              router.push(pathname);
              setFiltersOpen(false);
            }}
          >
            Clear filters
          </Button>
        </div>
      </SlideOver>
    </div>
  );
}

function Detail({
  label,
  children,
  mono = false,
}: {
  label: string;
  children: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <div>
      <dt className="text-overline uppercase text-text-3">{label}</dt>
      <dd className={cn("mt-1 text-body text-text", mono && "font-mono")}>
        {children}
      </dd>
    </div>
  );
}
