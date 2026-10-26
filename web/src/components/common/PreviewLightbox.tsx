import { useCallback, useEffect, useRef, useState } from "react";
import type {
  KeyboardEvent as ReactKeyboardEvent,
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
  ReactNode,
} from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Minus, Plus, RotateCcw, X } from "lucide-react";

import { Dialog, DialogOverlay, DialogPortal, DialogTitle } from "@/components/ui/dialog";

/** Natural width of the sheet inside the viewer — its A4 print width (210mm − margins). */
const SHEET_WIDTH = 688;
const MIN_SCALE = 0.15;
const MAX_SCALE = 5;
const FIT_PADDING = 48;
/** One press/wheel-notch zoom step. */
const STEP = 1.25;

type View = { scale: number; x: number; y: number };

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

/**
 * Full-screen "gallery" view for a live form preview (DTR / OB). The sheet is
 * rendered at its A4 print width and behaves like a photo viewer: scroll (or
 * trackpad pinch) to zoom at the pointer, drag to pan, double-click to toggle
 * between fit and 100%, plus toolbar buttons and keyboard (+ / − / 0) for the
 * same actions. Escape or the X closes it. Opening it shows the whole form at
 * a glance instead of scrolling the narrow preview column.
 *
 * <PreviewLightbox open={open} onOpenChange={setOpen} title="… — full view">
 *   <ObPreview form={form} rows={rows} />
 * </PreviewLightbox>
 */
export function PreviewLightbox({
  open,
  onOpenChange,
  title,
  sheetWidth = SHEET_WIDTH,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  /** Outer width of the sheet wrapper — defaults to the A4 print width (688).
   *  A sheet with its own fixed width (LOA = 794: an A4-wide page replica with
   *  the template's margins as padding, 738px content) passes its own so
   *  fit() measures right. */
  sheetWidth?: number;
  children: ReactNode;
}) {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<View>({ scale: 1, x: 0, y: 0 });
  const fitScaleRef = useRef(1);
  // Once the user zooms or drags, stop auto-fitting — a late-loading image or
  // window resize must not yank the view out from under them.
  const touchedRef = useRef(false);
  const dragRef = useRef<{ id: number; x: number; y: number } | null>(null);
  const [view, setView] = useState<View>({ scale: 1, x: 0, y: 0 });

  const apply = useCallback((next: View) => {
    viewRef.current = next;
    setView(next);
  }, []);

  /** Scale the sheet so it fits the viewport, centred. */
  const fit = useCallback(() => {
    const vp = viewportRef.current;
    const sheet = contentRef.current;
    if (!vp || !sheet) return;
    const cw = sheet.offsetWidth;
    const ch = sheet.offsetHeight;
    if (!cw || !ch) return;
    const scale = clamp(
      Math.min((vp.clientWidth - FIT_PADDING) / cw, (vp.clientHeight - FIT_PADDING) / ch),
      MIN_SCALE,
      MAX_SCALE,
    );
    fitScaleRef.current = scale;
    apply({ scale, x: (vp.clientWidth - cw * scale) / 2, y: (vp.clientHeight - ch * scale) / 2 });
  }, [apply]);

  /** Zoom by `factor`, keeping the content point under viewport-local (cx, cy) fixed. */
  const zoomAt = useCallback(
    (factor: number, cx: number, cy: number) => {
      const { scale, x, y } = viewRef.current;
      const next = clamp(scale * factor, MIN_SCALE, MAX_SCALE);
      if (next === scale) return;
      const k = next / scale;
      apply({ scale: next, x: cx - (cx - x) * k, y: cy - (cy - y) * k });
    },
    [apply],
  );

  /** Zoom around the centre of the screen (toolbar buttons / keyboard). */
  function zoomFromControls(factor: number) {
    const vp = viewportRef.current;
    if (!vp) return;
    touchedRef.current = true;
    zoomAt(factor, vp.clientWidth / 2, vp.clientHeight / 2);
  }

  function resetToFit() {
    touchedRef.current = false;
    fit();
  }

  // Fresh view each time it opens: fit the whole sheet to the screen.
  useEffect(() => {
    if (!open) return;
    touchedRef.current = false;
    dragRef.current = null;
    apply({ scale: 1, x: 0, y: 0 });
    const raf = requestAnimationFrame(fit);
    return () => cancelAnimationFrame(raf);
  }, [open, apply, fit]);

  // Wheel/pinch zoom — attached natively so preventDefault works (React's root
  // wheel listener is passive).
  useEffect(() => {
    const vp = viewportRef.current;
    if (!open || !vp) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      touchedRef.current = true;
      const rect = vp.getBoundingClientRect();
      const sensitivity = e.ctrlKey ? 0.01 : 0.0025; // pinch fires with ctrlKey
      const factor = clamp(Math.exp(-e.deltaY * sensitivity), 0.5, 2);
      zoomAt(factor, e.clientX - rect.left, e.clientY - rect.top);
    };
    vp.addEventListener("wheel", onWheel, { passive: false });
    return () => vp.removeEventListener("wheel", onWheel);
  }, [open, zoomAt]);

  // Re-fit while untouched, e.g. when the logo image finishes loading and the
  // sheet grows taller, or when the window is resized.
  useEffect(() => {
    const sheet = contentRef.current;
    if (!open || !sheet || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => {
      if (!touchedRef.current) fit();
    });
    ro.observe(sheet);
    const onResize = () => {
      if (!touchedRef.current) fit();
    };
    window.addEventListener("resize", onResize);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", onResize);
    };
  }, [open, fit]);

  function onPointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    if (e.button !== 0) return;
    touchedRef.current = true;
    dragRef.current = { id: e.pointerId, x: e.clientX, y: e.clientY };
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function onPointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    const d = dragRef.current;
    if (!d || d.id !== e.pointerId) return;
    const { scale, x, y } = viewRef.current;
    apply({ scale, x: x + (e.clientX - d.x), y: y + (e.clientY - d.y) });
    d.x = e.clientX;
    d.y = e.clientY;
  }

  function onPointerEnd(e: ReactPointerEvent<HTMLDivElement>) {
    if (dragRef.current?.id !== e.pointerId) return;
    dragRef.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  }

  function onDoubleClick(e: ReactMouseEvent<HTMLDivElement>) {
    const vp = viewportRef.current;
    if (!vp) return;
    const rect = vp.getBoundingClientRect();
    const cx = e.clientX - rect.left;
    const cy = e.clientY - rect.top;
    const { scale } = viewRef.current;
    if (Math.abs(scale - fitScaleRef.current) < 0.01) {
      // Currently fitted — jump to 100% centred on the pointer…
      touchedRef.current = true;
      zoomAt(1 / scale, cx, cy);
    } else {
      // …otherwise fall back to fit.
      resetToFit();
    }
  }

  function onKeyDown(e: ReactKeyboardEvent<HTMLDivElement>) {
    if (e.key === "+" || e.key === "=") {
      e.preventDefault();
      zoomFromControls(STEP);
    } else if (e.key === "-" || e.key === "_") {
      e.preventDefault();
      zoomFromControls(1 / STEP);
    } else if (e.key === "0") {
      e.preventDefault();
      resetToFit();
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPortal>
        <DialogOverlay className="no-print bg-black/90" />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          className="no-print fixed inset-0 z-50 flex flex-col bg-neutral-950/95 text-white outline-none"
          onKeyDown={onKeyDown}
        >
          <header className="flex shrink-0 items-center justify-between gap-3 border-b border-white/10 px-4 py-2.5">
            <DialogTitle className="truncate text-sm font-semibold text-white/90">
              {title}
            </DialogTitle>
            <button
              type="button"
              className="inline-flex size-8 shrink-0 items-center justify-center rounded-md border border-white/20 text-white/80 transition hover:bg-white/10 hover:text-white focus-visible:outline-2 focus-visible:outline-white/60"
              aria-label="Close the full view"
              title="Close (Esc)"
              onClick={() => onOpenChange(false)}
            >
              <X className="size-4" aria-hidden="true" />
            </button>
          </header>

          <div
            ref={viewportRef}
            className="relative min-h-0 flex-1 cursor-grab touch-none select-none overflow-hidden active:cursor-grabbing"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerEnd}
            onPointerCancel={onPointerEnd}
            onDoubleClick={onDoubleClick}
          >
            <div
              ref={contentRef}
              className="absolute left-0 top-0"
              style={{
                width: sheetWidth,
                transform: `translate3d(${view.x}px, ${view.y}px, 0) scale(${view.scale})`,
                transformOrigin: "0 0",
              }}
            >
              {children}
            </div>

            <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 flex flex-col items-center gap-2 p-4">
              <div
                className="pointer-events-auto flex items-center gap-1 rounded-full border border-white/15 bg-black/70 p-1.5 shadow-xl backdrop-blur-md"
                onPointerDown={(e) => e.stopPropagation()}
              >
                <ViewerButton
                  label="Zoom out"
                  title="Zoom out (−)"
                  onClick={() => zoomFromControls(1 / STEP)}
                >
                  <Minus className="size-4" aria-hidden="true" />
                </ViewerButton>
                <span className="w-12 text-center text-xs tabular-nums text-white/80">
                  {Math.round(view.scale * 100)}%
                </span>
                <ViewerButton
                  label="Zoom in"
                  title="Zoom in (+)"
                  onClick={() => zoomFromControls(STEP)}
                >
                  <Plus className="size-4" aria-hidden="true" />
                </ViewerButton>
                <span className="mx-1 h-5 w-px bg-white/15" aria-hidden="true" />
                <ViewerButton label="Fit to screen" title="Fit to screen (0)" onClick={resetToFit}>
                  <RotateCcw className="size-4" aria-hidden="true" />
                  <span className="hidden text-xs sm:inline">Fit</span>
                </ViewerButton>
              </div>
              <p className="text-center text-[11px] text-white/50">
                Scroll to zoom · drag to pan · double-click toggles 100%
              </p>
            </div>
          </div>
        </DialogPrimitive.Content>
      </DialogPortal>
    </Dialog>
  );
}

function ViewerButton({
  label,
  title,
  onClick,
  children,
}: {
  label: string;
  title: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      className="inline-flex size-8 items-center justify-center gap-1.5 rounded-full text-white/80 transition hover:bg-white/10 hover:text-white focus-visible:outline-2 focus-visible:outline-white/60"
      aria-label={label}
      title={title}
      onClick={onClick}
    >
      {children}
    </button>
  );
}
