"use client";

// Small anime.js (v4) helpers used across the app to give every surface a
// smooth entrance and to keep motion consistent. All helpers no-op when the
// user prefers reduced motion, leaving elements at their natural state.

import { useEffect, useLayoutEffect, useRef } from "react";
import { animate, stagger, utils } from "animejs";

// useLayoutEffect runs before paint (so we can hide elements before they flash
// in), but it warns during SSR — fall back to useEffect on the server.
const useIsoLayoutEffect =
  typeof window !== "undefined" ? useLayoutEffect : useEffect;

export function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

interface RevealOptions {
  /** Delay before the entrance starts, in ms. */
  delay?: number;
  /** Initial downward offset, in px. */
  y?: number;
  /** Initial scale (1 = none). */
  scale?: number;
  duration?: number;
}

/**
 * Fades + slides an element in once, on mount. Returns a ref to attach to the
 * element you want to animate (so no extra wrapper is introduced).
 */
export function useReveal<T extends HTMLElement>(opts: RevealOptions = {}) {
  const { delay = 0, y = 12, scale = 1, duration = 600 } = opts;
  const ref = useRef<T>(null);
  useIsoLayoutEffect(() => {
    const el = ref.current;
    if (!el || prefersReducedMotion()) return;
    utils.set(el, { opacity: 0, translateY: y, scale });
    const anim = animate(el, {
      opacity: 1,
      translateY: 0,
      scale: 1,
      duration,
      delay,
      ease: "out(3)",
      // Drop the inline transform/opacity once settled so CSS :hover/:active
      // interactions aren't blocked by leftover inline styles.
      onComplete: () => {
        el.style.transform = "";
        el.style.opacity = "";
      },
    });
    return () => {
      anim.revert();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return ref;
}

interface StaggerOptions {
  y?: number;
  /** Gap between each child's start, in ms. */
  gap?: number;
  duration?: number;
  delay?: number;
}

/**
 * Staggers the direct children of an element in. Re-runs whenever `trigger`
 * changes, so it replays when list contents change (search results, switching
 * tabs, etc.). Returns a ref to attach to the list container.
 */
export function useStagger<T extends HTMLElement>(
  trigger: unknown,
  opts: StaggerOptions = {},
) {
  const { y = 10, gap = 55, duration = 500, delay = 0 } = opts;
  const ref = useRef<T>(null);
  useIsoLayoutEffect(() => {
    const el = ref.current;
    if (!el || prefersReducedMotion()) return;
    const kids = Array.from(el.children) as HTMLElement[];
    if (kids.length === 0) return;
    utils.set(kids, { opacity: 0, translateY: y });
    const anim = animate(kids, {
      opacity: 1,
      translateY: 0,
      duration,
      delay: stagger(gap, { start: delay }),
      ease: "out(3)",
      onComplete: () => {
        for (const k of kids) {
          k.style.transform = "";
          k.style.opacity = "";
        }
      },
    });
    return () => {
      anim.revert();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trigger]);
  return ref;
}
