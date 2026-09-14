import { PageSkeleton } from "@/components/states/skeleton";

// The task board is columns, not rows — a list skeleton here would collapse
// into the board layout and jump.
export default function Loading() {
  return <PageSkeleton variant="board" />;
}
