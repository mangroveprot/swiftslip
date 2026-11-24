/**
 * Freezes the page behind an overlay (a drawer, a sheet) while it is open.
 *
 * The app never scrolls the window: `AppShell` gives the content column its own
 * scroller, so `overflow: hidden` on `<body>` alone left a board rolling under
 * an open drawer. This locks the document and every scroller marked
 * `data-app-scroller`, and pays the scrollbar's width back as padding, so the
 * page underneath cannot move and does not jump sideways when the bar goes.
 *
 * A module-level counter makes nesting safe (a photo dialog over a drawer):
 * only the last overlay to close restores the page.
 */
import { useEffect } from "react";

const SCROLLER = "[data-app-scroller]";

let locks = 0;
let restore: Array<() => void> = [];

function applyLock() {
  const body = document.body;
  // The window's bar is invisible to `offsetWidth` (it reports the viewport
  // without it), so measure it against `innerWidth`; the bar belongs to the
  // body's width, so that is where the padding goes.
  const windowBar = Math.max(0, window.innerWidth - document.documentElement.clientWidth);
  const plan: Array<{ element: HTMLElement; bar: number }> = [
    { element: document.documentElement, bar: 0 },
    { element: body, bar: windowBar },
    ...Array.from(document.querySelectorAll<HTMLElement>(SCROLLER)).map((element) => ({
      element,
      bar: Math.max(0, element.offsetWidth - element.clientWidth),
    })),
  ];

  restore = plan.map(({ element, bar }) => {
    const { overflow, overflowY, paddingRight } = element.style;
    element.style.overflow = "hidden";
    element.style.overflowY = "hidden";
    if (bar > 0) {
      const padding = Number.parseFloat(window.getComputedStyle(element).paddingRight) || 0;
      element.style.paddingRight = `${padding + bar}px`;
    }
    return () => {
      element.style.overflow = overflow;
      element.style.overflowY = overflowY;
      element.style.paddingRight = paddingRight;
    };
  });
}

function releaseLock() {
  for (const undo of restore) undo();
  restore = [];
}

/**
 * Locks page scrolling for as long as `active` is true (default: while the
 * calling overlay is mounted).
 */
export function useScrollLock(active = true): void {
  useEffect(() => {
    if (!active) return;
    if (locks++ === 0) applyLock();
    return () => {
      if (--locks === 0) releaseLock();
    };
  }, [active]);
}
