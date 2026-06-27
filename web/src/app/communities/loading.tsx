// Instant skeleton for the (force-dynamic) communities hub while the server fetch runs.
import { LoadingSkeleton } from "@/components/loading-skeleton";

export default function Loading() {
  return <LoadingSkeleton rows={3} />;
}
