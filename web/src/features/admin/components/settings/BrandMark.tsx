import type { StorageBackend } from "@swiftslip/shared/schemas";

import { cn } from "@/lib/utils";

/**
 * The two backends' own marks, in place of the "S" / "B2" letter badges.
 *
 * Both files are the vendors' official artwork, self-hosted under
 * `public/brands` rather than hot-linked: no third-party request on a page an
 * admin opens all day, nothing to add to the CSP `img-src` list, and the marks
 * still render in print and offline.
 *
 * - Supabase: their brand page's "icon green transparent" SVG.
 * - Backblaze: the flame from backblaze.com, at the 256 px size they publish
 *   (they ship no SVG of the mark), which is 8× the 32 px tile it lands in.
 */
const BRANDS = {
  supabase: { src: "/brands/supabase-icon.svg", width: 109, height: 113 },
  b2: { src: "/brands/backblaze-icon.png", width: 256, height: 256 },
} as const satisfies Record<StorageBackend, { src: string; width: number; height: number }>;

export function BrandMark({ backend, className }: { backend: StorageBackend; className?: string }) {
  const brand = BRANDS[backend];

  return (
    <span
      className={cn(
        // White paper under the mark in both themes: Supabase's green icon and
        // Backblaze's red flame both sit on a pale tile in the vendors' own
        // material, and neither reads well dropped onto a dark surface.
        "flex size-8 shrink-0 items-center justify-center rounded-lg border border-border bg-paper",
        className,
      )}
      aria-hidden="true"
    >
      <img
        src={brand.src}
        alt=""
        width={brand.width}
        height={brand.height}
        className="size-[18px] object-contain"
      />
    </span>
  );
}
