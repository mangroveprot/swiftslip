import { Skeleton } from "@/components/ui/skeleton";

/**
 * Stand-in for a plain card grid (COS / LOA / OT lists) while the list query
 * loads. Form editors each own a layout-specific `*EditorSkeleton.tsx`, their
 * pages differ too much for a shared two-pane placeholder to stay in sync, and
 * the DTR list has its own `RecordsListSkeleton` for its thumbnail cards.
 */
export function ListSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="rounded-xl border bg-card p-4">
          <div className="space-y-2">
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-3 w-1/3" />
          </div>
          <Skeleton className="mt-4 h-3 w-1/2" />
          <Skeleton className="mt-2 h-3 w-2/5" />
        </div>
      ))}
    </div>
  );
}
