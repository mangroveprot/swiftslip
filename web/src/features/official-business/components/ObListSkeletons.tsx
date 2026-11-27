/* Shared by the OB list page and the router's pending fallback for the same loading shape. */
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/* One neutral box for every status: the status colour now lives only in the
   folder tab, so the grid reads as a quiet grey deck instead of four brightly
   outlined boxes. A touch stronger than `--border` so it stays visible on the
   cream dashboard surface; dark mode gets the same grey lifted for contrast. */
export const CARD_BORDER = "border-[#c9cec8] dark:border-[#4a514b]";

export function ObListSkeleton() {
  return (
    <div className="mt-5 grid grid-cols-1 gap-8 @2xl:grid-cols-2" aria-label="Loading forms">
      {Array.from({ length: 4 }).map((_, index) => (
        <div key={index} className="flex flex-col items-start">
          <Skeleton className="relative z-10 -mb-px h-7 w-28 rounded-t-lg" />
          <div
            className={cn(
              "w-full flex-1 rounded-xl rounded-tl-none border bg-card p-5",
              CARD_BORDER,
            )}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-2">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-3 w-20" />
              </div>
              <Skeleton className="h-7 w-32" />
            </div>
            <Skeleton className="mt-4 h-3 w-3/4" />
            <Skeleton className="mt-2 h-3 w-1/2" />
            <Skeleton className="mt-2 h-3 w-2/3" />
            <Skeleton className="mt-4 h-3 w-1/3" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function PlaceListSkeleton() {
  return (
    <div className="mt-3 space-y-2" aria-label="Loading destinations">
      {Array.from({ length: 6 }).map((_, index) => (
        <Skeleton key={index} className="h-6 w-full" />
      ))}
    </div>
  );
}
