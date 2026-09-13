"use client";

import { useState } from "react";
import { LayoutGrid, List, MapPin, ShieldOff, Camera, ClipboardCheck } from "lucide-react";
import { motion } from "motion/react";
import { StatusPill } from "@/components/ui/status-pill";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/ui/avatar";
import { SlideOver } from "@/components/ui/slide-over";
import { DataTable, type Column } from "@/components/ui/data-table";
import { EmptyState } from "@/components/states";
import { formatDate } from "@/lib/employees/display";
import { duration, ease } from "@/lib/motion";
import { cn } from "@/lib/utils";
import {
  BOARD_COLUMNS, isOverdue, priorityLabel, priorityTone,
  statusLabel, statusTone, verificationMode, visitStateLabel, visitStateTone,
  type TaskStatus,
} from "@/lib/tasks/model";
import type { TaskRow } from "@/lib/tasks/queries";

const modeIcon = {
  none: ShieldOff,
  photo: Camera,
  location: MapPin,
  photo_location: MapPin,
  photo_location_report: ClipboardCheck,
} as const;

/**
 * Task board. Source: Phase 5 - Tasks, Field Visits, Leave.
 *
 * Board on desktop, filtered list under 768px — the design rules out a
 * horizontally scrolling board on a phone. Both views render from the same
 * rows, so they cannot drift.
 */
export function TaskBoard({ rows }: { rows: TaskRow[] }) {
  const [view, setView] = useState<"board" | "list">("board");
  const [selected, setSelected] = useState<TaskRow | null>(null);

  if (rows.length === 0) {
    return (
      <EmptyState
        heading="No tasks yet"
        body="Tasks assigned to you, or to a department you head, appear here — with any proof they require marked on the card."
      />
    );
  }

  const overdue = rows.filter((row) => isOverdue(row.due_date, row.status)).length;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-h1">Tasks</h1>
          <p className="mt-1 text-body text-text-2">
            {rows.length} {rows.length === 1 ? "task" : "tasks"}
            {overdue > 0 ? (
              <span className="text-warn-fg"> · {overdue} overdue</span>
            ) : null}
          </p>
        </div>

        {/* Board is desktop-only; the toggle would be a lie on a phone. */}
        <div className="hidden items-center gap-1 rounded-md border border-border p-0.5 md:flex">
          <Button
            variant={view === "board" ? "secondary" : "ghost"}
            size="sm"
            onClick={() => setView("board")}
          >
            <LayoutGrid aria-hidden />
            Board
          </Button>
          <Button
            variant={view === "list" ? "secondary" : "ghost"}
            size="sm"
            onClick={() => setView("list")}
          >
            <List aria-hidden />
            List
          </Button>
        </div>
      </div>

      {/* Under 768px: always the list. */}
      <div className="md:hidden">
        <TaskList rows={rows} onOpen={setSelected} />
      </div>

      <div className="hidden md:block">
        {view === "board" ? (
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {BOARD_COLUMNS.map((column) => (
              <BoardColumn
                key={column}
                status={column}
                rows={rows.filter((row) => row.status === column)}
                onOpen={setSelected}
              />
            ))}
          </div>
        ) : (
          <TaskList rows={rows} onOpen={setSelected} />
        )}
      </div>

      <TaskDetail task={selected} onClose={() => setSelected(null)} />
    </div>
  );
}

function BoardColumn({
  status,
  rows,
  onOpen,
}: {
  status: TaskStatus;
  rows: TaskRow[];
  onOpen: (row: TaskRow) => void;
}) {
  return (
    <section className="flex flex-col gap-2" aria-label={statusLabel[status]}>
      <header className="flex items-center justify-between px-1">
        <h2 className="text-small font-semibold">{statusLabel[status]}</h2>
        <span className="font-mono text-[11px] text-text-3" data-numeric>
          {rows.length}
        </span>
      </header>

      <div className="flex min-h-[80px] flex-col gap-2 rounded-xl bg-surface p-2">
        {rows.length === 0 ? (
          <p className="px-2 py-4 text-center text-small text-text-3">Nothing here</p>
        ) : (
          rows.map((row, index) => (
            <motion.div
              key={row.id}
              // First paint only — refiltering must never re-run entrances.
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{
                duration: duration.base,
                ease: ease.enter,
                delay: Math.min(index * 0.03, 0.2),
              }}
            >
              <TaskCard row={row} onOpen={onOpen} />
            </motion.div>
          ))
        )}
      </div>
    </section>
  );
}

function TaskCard({ row, onOpen }: { row: TaskRow; onOpen: (row: TaskRow) => void }) {
  const overdue = isOverdue(row.due_date, row.status);
  const mode = verificationMode[row.verification_mode];
  const ModeIcon = modeIcon[row.verification_mode];
  const visit = row.visits?.[0];

  return (
    <button
      type="button"
      onClick={() => onOpen(row)}
      className="w-full rounded-lg border border-border bg-bg p-3 text-left shadow-e1 transition-shadow duration-(--duration-fast) hover:shadow-e2"
    >
      <div className="flex items-start justify-between gap-2">
        <span className="font-mono text-[10px] text-text-3">{row.reference}</span>
        <StatusPill tone={priorityTone[row.priority]}>
          {priorityLabel[row.priority]}
        </StatusPill>
      </div>

      <p className="mt-1.5 text-small font-medium text-text">{row.title}</p>

      {row.target ? (
        <p className="mt-1 flex items-center gap-1 text-[11px] text-text-2">
          <MapPin className="size-3 shrink-0" aria-hidden />
          {row.target.name}
        </p>
      ) : null}

      <div className="mt-2.5 flex flex-wrap items-center gap-2">
        {row.verification_mode !== "none" ? (
          <span className="inline-flex items-center gap-1 rounded-sm bg-info-bg px-1.5 py-0.5 text-[10px] font-medium text-info-fg">
            <ModeIcon className="size-3" aria-hidden />
            {mode.label}
          </span>
        ) : null}

        {visit ? (
          <StatusPill tone={visitStateTone[visit.state]}>
            {visitStateLabel[visit.state]}
          </StatusPill>
        ) : null}

        {row.due_date ? (
          <span
            className={cn(
              "font-mono text-[10px]",
              overdue ? "font-semibold text-danger-fg" : "text-text-3",
            )}
          >
            {overdue ? "Overdue · " : ""}
            {formatDate(row.due_date)}
          </span>
        ) : null}
      </div>

      {row.assignees?.length > 0 ? (
        <div className="mt-2.5 flex -space-x-1.5">
          {row.assignees.slice(0, 3).map((a) => (
            <Avatar
              key={a.employee.id}
              name={`${a.employee.first_name} ${a.employee.last_name}`}
              size="sm"
              className="ring-2 ring-bg"
            />
          ))}
          {row.assignees.length > 3 ? (
            <span className="grid size-6 place-items-center rounded-pill bg-canvas text-[10px] text-text-2 ring-2 ring-bg">
              +{row.assignees.length - 3}
            </span>
          ) : null}
        </div>
      ) : null}
    </button>
  );
}

function TaskList({
  rows,
  onOpen,
}: {
  rows: TaskRow[];
  onOpen: (row: TaskRow) => void;
}) {
  const columns: Column<TaskRow>[] = [
    {
      key: "title",
      header: "Task",
      primary: true,
      cell: (row) => (
        <span className="min-w-0">
          <span className="block truncate font-medium">{row.title}</span>
          <span className="block font-mono text-[11px] text-text-3">
            {row.reference}
          </span>
        </span>
      ),
    },
    {
      key: "status",
      header: "Status",
      essential: true,
      cell: (row) => (
        <StatusPill tone={statusTone[row.status]}>
          {statusLabel[row.status]}
        </StatusPill>
      ),
    },
    {
      key: "priority",
      header: "Priority",
      cell: (row) => (
        <StatusPill tone={priorityTone[row.priority]}>
          {priorityLabel[row.priority]}
        </StatusPill>
      ),
    },
    {
      key: "proof",
      header: "Proof",
      cell: (row) => verificationMode[row.verification_mode].label,
    },
    {
      key: "due",
      header: "Due",
      essential: true,
      cell: (row) => (
        <span
          className={cn(
            "font-mono text-small",
            isOverdue(row.due_date, row.status) && "font-semibold text-danger-fg",
          )}
        >
          {formatDate(row.due_date)}
        </span>
      ),
    },
  ];

  return (
    <DataTable
      rows={rows}
      columns={columns}
      getRowKey={(row) => row.id}
      onRowClick={onOpen}
      caption="Tasks"
    />
  );
}

function TaskDetail({
  task,
  onClose,
}: {
  task: TaskRow | null;
  onClose: () => void;
}) {
  const visit = task?.visits?.[0];
  const mode = task ? verificationMode[task.verification_mode] : null;

  return (
    <SlideOver
      open={task !== null}
      onClose={onClose}
      title={task?.title ?? ""}
      subtitle={task?.reference}
    >
      {task && mode ? (
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap gap-2">
            <StatusPill tone={statusTone[task.status]}>
              {statusLabel[task.status]}
            </StatusPill>
            <StatusPill tone={priorityTone[task.priority]}>
              {priorityLabel[task.priority]}
            </StatusPill>
            {visit ? (
              <StatusPill tone={visitStateTone[visit.state]}>
                {visitStateLabel[visit.state]}
              </StatusPill>
            ) : null}
          </div>

          {task.description ? (
            <p className="text-body text-text-2">{task.description}</p>
          ) : null}

          <section className="rounded-lg border border-border p-3">
            <h3 className="text-small font-semibold">Proof required</h3>
            <p className="mt-1 text-small text-text-2">{mode.description}</p>
          </section>

          {task.target ? (
            <section className="rounded-lg border border-border p-3">
              <h3 className="text-small font-semibold">Where</h3>
              <p className="mt-1 text-small text-text-2">
                {task.target.name}
                {task.target.address ? ` · ${task.target.address}` : ""}
              </p>
              <p className="mt-1 font-mono text-[11px] text-text-3">
                must be within {task.target.allowed_radius_m} m
              </p>
            </section>
          ) : null}

          <dl className="flex flex-col gap-3">
            <Detail label="Department">{task.department?.name ?? "—"}</Detail>
            <Detail label="Due">{formatDate(task.due_date)}</Detail>
            <Detail label="Assigned to">
              {task.assignees?.length
                ? task.assignees
                    .map((a) => `${a.employee.first_name} ${a.employee.last_name}`)
                    .join(", ")
                : "Nobody yet"}
            </Detail>
          </dl>

          <p className="border-t border-border pt-4 text-small text-text-3">
            Comments, attachments and the capture flow open from the task page.
            A visit can only be submitted from the site itself — the app checks
            range before the camera opens.
          </p>
        </div>
      ) : null}
    </SlideOver>
  );
}

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-overline uppercase text-text-3">{label}</dt>
      <dd className="mt-0.5 text-body text-text">{children}</dd>
    </div>
  );
}
