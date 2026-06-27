// Instant skeleton for the (force-dynamic) public profile while the server fetch runs.
import { LoadingSkeleton } from "@/components/loading-skeleton";

export default function Loading() {
  return <LoadingSkeleton rows={4} />;
}
