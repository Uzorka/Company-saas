import { PageSkeleton } from "@/components/states/skeleton";

export default function Loading() {
  return <PageSkeleton variant="list" rows={10} />;
}
