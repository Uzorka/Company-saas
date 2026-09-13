import { Check, X, Clock } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Timeline. Source: Developer Handoff section 06.
 *
 * Three node states — done, active, todo. The active node shows how long a
 * stage has been waiting, because "waiting on HR" without a duration tells
 * the requester nothing about whether to chase it.
 *
 * The connector between nodes is filled up to the active one, so the shape of
 * the chain is readable without reading the labels.
 */
export type TimelineNode = {
  label: string;
  state: "done" | "active" | "todo" | "rejected";
  detail?: string;
  /** e.g. "waiting 3 days" — shown on the active node. */
  waiting?: string;
};

export function Timeline({ nodes }: { nodes: TimelineNode[] }) {
  return (
    <ol className="flex flex-col">
      {nodes.map((node, index) => {
        const last = index === nodes.length - 1;
        const Icon =
          node.state === "done" ? Check : node.state === "rejected" ? X : Clock;

        return (
          <li key={node.label} className="flex gap-3">
            <div className="flex flex-col items-center">
              <span
                className={cn(
                  "grid size-6 shrink-0 place-items-center rounded-pill",
                  node.state === "done" && "bg-success-bg text-success-fg",
                  node.state === "rejected" && "bg-danger-bg text-danger-fg",
                  node.state === "active" && "bg-warn-bg text-warn-fg",
                  node.state === "todo" && "bg-canvas text-text-3",
                )}
              >
                {node.state === "todo" ? (
                  <span className="size-1.5 rounded-pill bg-current" aria-hidden />
                ) : (
                  <Icon className="size-3.5" aria-hidden />
                )}
              </span>
              {!last ? (
                <span
                  className={cn(
                    "w-px flex-1",
                    node.state === "done" ? "bg-success-fg/40" : "bg-border",
                  )}
                  aria-hidden
                />
              ) : null}
            </div>

            <div className={cn("min-w-0 flex-1", last ? "pb-0" : "pb-5")}>
              <p
                className={cn(
                  "text-small font-medium",
                  node.state === "todo" ? "text-text-3" : "text-text",
                )}
              >
                {node.label}
              </p>
              {node.detail ? (
                <p className="mt-0.5 text-small text-text-2">{node.detail}</p>
              ) : null}
              {node.state === "active" && node.waiting ? (
                <p className="mt-0.5 font-mono text-[11px] text-warn-fg">
                  {node.waiting}
                </p>
              ) : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
