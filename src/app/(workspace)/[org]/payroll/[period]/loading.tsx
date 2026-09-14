import { PageSkeleton } from "@/components/states/skeleton";

// A run is a wide table of figures; rows read closer than cards.
export default function Loading() {
  return <PageSkeleton variant="list" rows={10} />;
}
