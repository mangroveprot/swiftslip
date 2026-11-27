import { useEffect, useRef } from "react";
import type { RefObject } from "react";

/** One eye: the group to move, and where its centre sits in that group's own
 *  user space. */
export type GazeTarget = {
  ref: RefObject<SVGGElement | null>;
  cx: number;
  cy: number;
  /** The resting transform, for artwork that draws the pupil off-centre. */
  base?: { x: number; y: number };
};

type GazeOptions = {
  /** Distance, in user units, at which the pupil reaches full travel. */
  reach?: number;
  /** How far the pupil may stray from its resting place, in user units. */
  maxOffset?: number;
  /** Share of the remaining distance covered per frame; lower is lazier. */
  ease?: number;
};

/**
 * Aims an SVG character's pupils at the pointer, like a portrait whose eyes
 * follow you around the room.
 *
 * The pointer is mapped into each target's own coordinate system with
 * `getScreenCTM()`, so it does not matter how the drawing is scaled, stretched
 * or animated on its way to the screen. Offsets are written straight to the
 * `transform` attribute inside a rAF loop: a pointer moving over a large
 * drawing must not re-render React sixty times a second.
 *
 * The loop settles and stops as soon as the pupils reach their goal; the next
 * pointer move wakes it again. Leaving the window eases them back to centre.
 */
export function usePointerGaze(targets: GazeTarget[], options: GazeOptions = {}) {
  const targetsRef = useRef(targets);
  const optionsRef = useRef(options);

  // Read through refs so the listeners are installed once, however often the
  // caller re-renders with a fresh array or options object.
  useEffect(() => {
    targetsRef.current = targets;
    optionsRef.current = options;
  });

  useEffect(() => {
    let pointer: { x: number; y: number } | null = null;
    let frame = 0;
    const offsets = new Map<SVGGElement, { x: number; y: number }>();

    const step = () => {
      frame = 0;
      const { reach = 60, maxOffset = 2.4, ease = 0.2 } = optionsRef.current;
      let settling = false;

      for (const target of targetsRef.current) {
        const element = target.ref.current;
        if (!element) continue;
        const screen = element.getScreenCTM();
        if (!screen) continue;

        let goalX = 0;
        let goalY = 0;
        if (pointer) {
          const local = new DOMPoint(pointer.x, pointer.y).matrixTransform(screen.inverse());
          const dx = local.x - target.cx;
          const dy = local.y - target.cy;
          const distance = Math.hypot(dx, dy);
          if (distance > 0.001) {
            const travel = Math.min(1, distance / reach) * maxOffset;
            goalX = (dx / distance) * travel;
            goalY = (dy / distance) * travel;
          }
        }

        const offset = offsets.get(element) ?? { x: 0, y: 0 };
        offset.x += (goalX - offset.x) * ease;
        offset.y += (goalY - offset.y) * ease;
        offsets.set(element, offset);

        if (Math.abs(goalX - offset.x) > 0.01 || Math.abs(goalY - offset.y) > 0.01) {
          settling = true;
        }
        const base = target.base ?? { x: 0, y: 0 };
        element.setAttribute(
          "transform",
          `translate(${(base.x + offset.x).toFixed(2)} ${(base.y + offset.y).toFixed(2)})`,
        );
      }

      if (settling) frame = requestAnimationFrame(step);
    };

    const wake = () => {
      if (!frame) frame = requestAnimationFrame(step);
    };

    const onPointerMove = (event: PointerEvent) => {
      pointer = { x: event.clientX, y: event.clientY };
      wake();
    };

    const onPointerLeave = () => {
      pointer = null;
      wake();
    };

    window.addEventListener("pointermove", onPointerMove, { passive: true });
    document.addEventListener("pointerleave", onPointerLeave);
    window.addEventListener("blur", onPointerLeave);

    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      document.removeEventListener("pointerleave", onPointerLeave);
      window.removeEventListener("blur", onPointerLeave);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);
}
