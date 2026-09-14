import { PageSkeleton } from "@/components/states/skeleton";

export default function Loading() {
  return <PageSkeleton variant="cards" rows={6} />;
}
