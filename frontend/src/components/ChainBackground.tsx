"use client";

import { useEffect, useRef } from "react";
import { animate, stagger, svg } from "animejs";
import { prefersReducedMotion } from "@/lib/anim";

// A fixed, full-screen decorative layer that sits behind all content. It draws
// a handful of "chains" (linked dots) that continuously draw themselves in,
// drift, and pulse — so there is always gentle motion somewhere on screen. It
// is purely decorative: pointer-events are off and it respects reduced motion.

// Each chain is a polyline; dots sit on its vertices. Coordinates live in a
// fixed 1200×800 viewBox that is scaled to cover the viewport.
const CHAINS: { d: string; points: [number, number][] }[] = [
  {
    d: "M 60 140 L 240 220 L 430 130 L 620 240 L 820 150",
    points: [
      [60, 140],
      [240, 220],
      [430, 130],
      [620, 240],
      [820, 150],
    ],
  },
  {
    d: "M 1160 580 L 980 500 L 800 620 L 620 520 L 470 640",
    points: [
      [1160, 580],
      [980, 500],
      [800, 620],
      [620, 520],
      [470, 640],
    ],
  },
  {
    d: "M 140 720 L 330 640 L 520 740 L 700 650",
    points: [
      [140, 720],
      [330, 640],
      [520, 740],
      [700, 650],
    ],
  },
  {
    d: "M 1120 120 L 960 230 L 1040 380 L 880 470",
    points: [
      [1120, 120],
      [960, 230],
      [1040, 380],
      [880, 470],
    ],
  },
];

export function ChainBackground() {
  const rootRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root || prefersReducedMotion()) return;

    const lines = Array.from(root.querySelectorAll<SVGPathElement>(".cb-line"));
    const dots = Array.from(root.querySelectorAll<SVGCircleElement>(".cb-dot"));
    const groups = Array.from(root.querySelectorAll<SVGGElement>(".cb-group"));

    // Continuously draw each chain in, hold, then erase — a flowing loop.
    const drawAnim = animate(svg.createDrawable(lines), {
      draw: ["0 0", "0 1", "1 1"],
      duration: 5200,
      delay: stagger(650),
      loop: true,
      ease: "inOutSine",
    });

    // Dots breathe in and out.
    const dotAnim = animate(dots, {
      opacity: [0.12, 0.5, 0.12],
      duration: 3600,
      delay: stagger(140),
      loop: true,
      ease: "inOutSine",
    });

    // Whole chains drift slowly, each on its own offset.
    const floatAnim = animate(groups, {
      translateX: [0, 14],
      translateY: [0, -18],
      duration: 9000,
      delay: stagger(1400),
      loop: true,
      alternate: true,
      ease: "inOutSine",
    });

    return () => {
      drawAnim.revert();
      dotAnim.revert();
      floatAnim.revert();
    };
  }, []);

  return (
    <svg
      ref={rootRef}
      className="chain-bg"
      viewBox="0 0 1200 800"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
    >
      <defs>
        <linearGradient
          id="cb-grad"
          gradientUnits="userSpaceOnUse"
          x1="0"
          y1="0"
          x2="1200"
          y2="800"
        >
          <stop offset="0%" stopColor="#4cb5f5" />
          <stop offset="40%" stopColor="#34675c" />
          <stop offset="74%" stopColor="#b3c100" />
          <stop offset="100%" stopColor="#b7b8b6" />
        </linearGradient>
      </defs>
      {CHAINS.map((chain, i) => (
        <g className="cb-group" key={i}>
          <path
            className="cb-line"
            d={chain.d}
            fill="none"
            stroke="url(#cb-grad)"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          {chain.points.map(([x, y], j) => (
            <circle
              className="cb-dot"
              key={j}
              cx={x}
              cy={y}
              r={5}
              fill="url(#cb-grad)"
            />
          ))}
        </g>
      ))}
    </svg>
  );
}
