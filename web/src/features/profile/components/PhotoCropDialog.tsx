import { useEffect, useLayoutEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  clampOffset,
  drawPhoto,
  exportPhoto,
  PHOTO_MAX_ZOOM,
  PHOTO_VIEWPORT,
  type PhotoOffset,
  type PhotoSource,
} from "@/lib/photo";

/**
 * "Adjust your photo" — the crop step between picking a file and saving it.
 *
 * The circle is drawn with a real canvas fed by the same `drawPhoto` the
 * export uses, so the framing on screen is the framing that gets saved; a CSS
 * `object-fit`/`transform` preview would drift from the exported file the
 * moment the maths changed.
 *
 * Everything is expressed in preview pixels. The output is the same picture at
 * 256 px, which keeps the drag and zoom feel identical to the result.
 */
export function PhotoCropDialog({
  open,
  source,
  onCancel,
  onUse,
}: {
  open: boolean;
  /** The decoded file being framed; null until one is picked. */
  source: PhotoSource | null;
  onCancel: () => void;
  onUse: (dataUrl: string) => void;
}) {
  /**
   * The canvas lives in state, not a ref, because Radix mounts the dialog's
   * content a commit later than the `open` prop flips. With a plain ref the
   * first paint ran against `null`, found nothing to draw, and — with
   * `[source, zoom, offset]` unchanged — never ran again: the circle stayed
   * empty until the user happened to drag or zoom, which is exactly the bug
   * this fixes. A callback ref re-runs the effect the moment the element
   * exists, whenever that turns out to be.
   */
  const [canvas, setCanvas] = useState<HTMLCanvasElement | null>(null);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState<PhotoOffset>({ x: 0, y: 0 });
  const [error, setError] = useState<string | null>(null);
  /** Where the pointer was on the last move, in preview px. */
  const dragRef = useRef<{ x: number; y: number } | null>(null);

  // Every new picture starts centred and unzoomed, so reopening the dialog on
  // a second file never inherits the first one's framing.
  useEffect(() => {
    if (!open) return;
    setZoom(1);
    setOffset({ x: 0, y: 0 });
    setError(null);
    dragRef.current = null;
  }, [open, source]);

  // Paint the preview. Redrawn on every drag frame and zoom tick — a 240 px
  // canvas is cheap enough that throttling would only add lag.
  useLayoutEffect(() => {
    if (!canvas || !source) return;

    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = PHOTO_VIEWPORT * dpr;
    canvas.height = PHOTO_VIEWPORT * dpr;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    drawPhoto(ctx, source, PHOTO_VIEWPORT, zoom, offset, PHOTO_VIEWPORT * dpr);
  }, [canvas, source, zoom, offset]);

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!source) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { x: event.clientX, y: event.clientY };
  };

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const last = dragRef.current;
    if (!last || !source) return;

    const dx = event.clientX - last.x;
    const dy = event.clientY - last.y;
    dragRef.current = { x: event.clientX, y: event.clientY };
    setOffset((current) =>
      clampOffset(source, PHOTO_VIEWPORT, zoom, { x: current.x + dx, y: current.y + dy }),
    );
  };

  const endDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    dragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  /** Zooming out can leave the picture short of the circle; pull it back in. */
  const onZoom = (next: number) => {
    setZoom(next);
    if (source) setOffset((current) => clampOffset(source, PHOTO_VIEWPORT, next, current));
  };

  const onConfirm = () => {
    if (!source) return;
    try {
      onUse(exportPhoto(source, PHOTO_VIEWPORT, zoom, offset));
    } catch (e) {
      setError(e instanceof Error ? e.message : "That photo could not be prepared.");
    }
  };

  /** The short side is the limiting one — it says how much there is to zoom into. */
  const canCrop = source !== null;

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onCancel()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Adjust your photo</DialogTitle>
          <DialogDescription>
            Drag to move it. The circle is what people will see.
          </DialogDescription>
        </DialogHeader>

        <div className="flex justify-center">
          <div
            role="application"
            aria-label="Drag to reposition your photo"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
            className="relative cursor-grab touch-none overflow-hidden rounded-full border border-border bg-muted active:cursor-grabbing"
            style={{ width: PHOTO_VIEWPORT, height: PHOTO_VIEWPORT }}
          >
            <canvas
              ref={setCanvas}
              style={{ width: PHOTO_VIEWPORT, height: PHOTO_VIEWPORT }}
              className="block select-none"
            />
            {/* A soft inner ring so the circle edge reads on a light photo. */}
            <span
              className="pointer-events-none absolute inset-0 rounded-full ring-1 ring-inset ring-black/10"
              aria-hidden="true"
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <label htmlFor="photo-zoom">Zoom</label>
            <span className="tabular-nums">{zoom.toFixed(1)}×</span>
          </div>
          <input
            id="photo-zoom"
            type="range"
            min={1}
            max={PHOTO_MAX_ZOOM}
            step={0.01}
            value={zoom}
            onChange={(e) => onZoom(Number(e.target.value))}
            disabled={!canCrop}
            className="w-full accent-primary"
          />
          <p className="text-center text-xs text-muted-foreground">
            Saved as a 256 × 256 px square.
          </p>
          {error ? (
            <p role="alert" className="text-center text-xs font-medium text-destructive">
              {error}
            </p>
          ) : null}
        </div>

        <DialogFooter className="gap-2 sm:justify-end">
          <Button variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button onClick={onConfirm} disabled={!source}>
            Use photo
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
