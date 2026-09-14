import { PageSkeleton } from "@/components/states/skeleton";

// Covers every workspace screen that does not define its own.
export default function Loading() {
  return <PageSkeleton variant="cards" rows={6} />;
}
