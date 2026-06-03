"use client";

import { useEffect, useMemo, useRef } from "react";
import { animate, stagger, svg } from "animejs";
import { prefersReducedMotion } from "@/lib/anim";

// A fixed, full-screen decorative layer behind all content: a constellation —
// a field of glowing blue stars linked by faint lines into a network, echoing
// the app's friend graph. Edges draw themselves in once, then breathe; stars
// twinkle; the whole field drifts on a slow parallax. A dim far layer of dust
// adds depth. Purely decorative: pointer-events off, respects reduced motion.
// Coordinates live in a fixed 1200×800 viewBox scaled to cover the viewport.

// Star nodes. `r` varies the size so some read as brighter.
const STARS: { x: number; y: number; r: number }[] = [
  { x: 90, y: 130, r: 2.6 },
  { x: 250, y: 230, r: 3.4 },
  { x: 180, y: 380, r: 2 },
  { x: 360, y: 110, r: 2.2 },
  { x: 430, y: 300, r: 3 },
  { x: 320, y: 470, r: 2.4 },
  { x: 560, y: 180, r: 2.6 },
  { x: 600, y: 380, r: 3.6 },
  { x: 500, y: 560, r: 2.2 },
  { x: 720, y: 280, r: 2.8 },
  { x: 760, y: 470, r: 2.4 },
  { x: 680, y: 640, r: 2 },
  { x: 880, y: 160, r: 2.6 },
  { x: 900, y: 360, r: 3.2 },
  { x: 860, y: 560, r: 2.4 },
  { x: 1040, y: 250, r: 2.8 },
  { x: 1080, y: 460, r: 2.2 },
  { x: 1000, y: 640, r: 2.6 },
  { x: 1160, y: 130, r: 2 },
  { x: 1150, y: 620, r: 2.4 },
  { x: 140, y: 620, r: 2.6 },
  { x: 340, y: 680, r: 2.2 },
  { x: 540, y: 710, r: 2 },
  { x: 220, y: 540, r: 1.8 },
  { x: 760, y: 110, r: 2 },
  { x: 1020, y: 120, r: 1.8 },
];

// Per-star tint (by index) — mostly cool blues/cyans with occasional warm
// gold/rose accents and whites that melt into the light background.
const STAR_TINT = [
  "blue", "cyan", "white", "gold", "blue", "cyan", "rose", "white", "blue",
  "gold", "cyan", "blue", "rose", "white", "blue", "cyan", "gold", "blue",
  "white", "cyan", "rose", "blue", "gold", "cyan", "white", "blue",
];

// Dim dust fills — soft tints that blend into white.
const DUST_TINT = ["#cfe6ff", "#fff0c2", "#ffd8df", "#eef4ff", "#dcd2ff"];

// Build the network: connect each star to its nearest neighbours within a
// distance, capping per-node degree so the web stays tidy. Runs once.
function buildEdges(maxDist: number, maxDeg: number) {
  const pairs: { i: number; j: number; d: number }[] = [];
  for (let i = 0; i < STARS.length; i++) {
    for (let j = i + 1; j < STARS.length; j++) {
      const dx = STARS[i].x - STARS[j].x;
      const dy = STARS[i].y - STARS[j].y;
      const d = Math.hypot(dx, dy);
      if (d <= maxDist) pairs.push({ i, j, d });
    }
  }
  pairs.sort((a, b) => a.d - b.d); // prefer the shortest links
  const deg = new Array(STARS.length).fill(0);
  const edges: { x1: number; y1: number; x2: number; y2: number }[] = [];
  for (const { i, j } of pairs) {
    if (deg[i] >= maxDeg || deg[j] >= maxDeg) continue;
    deg[i]++;
    deg[j]++;
    edges.push({ x1: STARS[i].x, y1: STARS[i].y, x2: STARS[j].x, y2: STARS[j].y });
  }
  return edges;
}

// Dim background "dust": many tiny faint stars for depth (no links).
const DUST: { x: number; y: number; r: number }[] = Array.from(
  { length: 46 },
  (_, i) => {
    // Deterministic pseudo-scatter (no Math.random at module load).
    const gx = (i * 137.5) % 1200;
    const gy = (i * 83.3 + (i % 5) * 47) % 800;
    return { x: gx, y: gy, r: 0.6 + ((i * 7) % 10) / 12 };
  },
);

export function ChainBackground() {
  const rootRef = useRef<SVGSVGElement>(null);
  const edges = useMemo(() => buildEdges(250, 3), []);

  useEffect(() => {
    const root = rootRef.current;
    // Skip the looping/parallax animations on reduced-motion and on mobile /
    // touch devices: animating inside the SVG blur filter forces the whole
    // filtered layer to re-rasterise every frame, which tanks the frame rate on
    // mobile GPUs (and makes scrolling feel janky). Left static, the filter is
    // painted once and cached, so the background stays cheap.
    const lightweight =
      typeof window !== "undefined" &&
      window.matchMedia("(max-width: 768px), (pointer: coarse)").matches;
    if (!root || prefersReducedMotion() || lightweight) return;

    const lines = Array.from(root.querySelectorAll<SVGLineElement>(".cb-edge"));
    const stars = Array.from(root.querySelectorAll<SVGCircleElement>(".cb-star"));
    const dust = Array.from(root.querySelectorAll<SVGCircleElement>(".cb-dust"));
    const near = root.querySelector<SVGGElement>(".cb-near");
    const far = root.querySelector<SVGGElement>(".cb-far");

    // Edges draw themselves in once, then settle.
    const drawIn = animate(svg.createDrawable(lines), {
      draw: ["0 0", "0 1"],
      duration: 1800,
      delay: stagger(60, { from: "center" }),
      ease: "outQuart",
    });

    // Links breathe faintly so the network feels alive.
    const lineGlow = animate(lines, {
      opacity: [0.12, 0.4, 0.12],
      duration: 7000,
      delay: stagger(120),
      loop: true,
      ease: "inOutSine",
    });

    // Stars twinkle in brightness (varied base sizes stay, glow does the rest).
    const starAnim = animate(stars, {
      opacity: [0.25, 0.95, 0.25],
      duration: 3200,
      delay: stagger(150, { from: "center" }),
      loop: true,
      ease: "inOutSine",
    });

    const dustAnim = animate(dust, {
      opacity: [0.05, 0.4, 0.05],
      duration: 4200,
      delay: stagger(90),
      loop: true,
      ease: "inOutSine",
    });

    // Parallax: the near network drifts more than the far dust.
    const nearDrift = near
      ? animate(near, {
          translateX: [0, 18],
          translateY: [0, -14],
          duration: 16000,
          loop: true,
          alternate: true,
          ease: "inOutSine",
        })
      : null;
    const farDrift = far
      ? animate(far, {
          translateX: [0, -10],
          translateY: [0, 8],
          duration: 24000,
          loop: true,
          alternate: true,
          ease: "inOutSine",
        })
      : null;

    return () => {
      drawIn.revert();
      lineGlow.revert();
      starAnim.revert();
      dustAnim.revert();
      nearDrift?.revert();
      farDrift?.revert();
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
        {/* Edge blend: cool blues with soft warm accents that fade to white. */}
        <linearGradient
          id="cb-grad"
          gradientUnits="userSpaceOnUse"
          x1="0"
          y1="0"
          x2="1200"
          y2="800"
        >
          <stop offset="0%" stopColor="#8fd4ff" />
          <stop offset="32%" stopColor="#4f7cff" />
          <stop offset="58%" stopColor="#a78bfa" />
          <stop offset="80%" stopColor="#ffcaa8" />
          <stop offset="100%" stopColor="#7fe6f0" />
        </linearGradient>
        {/* Radial star fills — light centre melting into a tint. */}
        <radialGradient id="cb-s-blue" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0%" stopColor="#eaf6ff" />
          <stop offset="45%" stopColor="#6cc5ff" />
          <stop offset="100%" stopColor="#2f6bff" />
        </radialGradient>
        <radialGradient id="cb-s-cyan" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0%" stopColor="#f0fdff" />
          <stop offset="45%" stopColor="#7df0fb" />
          <stop offset="100%" stopColor="#22d3ee" />
        </radialGradient>
        <radialGradient id="cb-s-white" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="55%" stopColor="#eaf2ff" />
          <stop offset="100%" stopColor="#bcd6ff" />
        </radialGradient>
        <radialGradient id="cb-s-gold" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0%" stopColor="#fffdf3" />
          <stop offset="45%" stopColor="#ffe8a8" />
          <stop offset="100%" stopColor="#f5c451" />
        </radialGradient>
        <radialGradient id="cb-s-rose" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0%" stopColor="#fff4f6" />
          <stop offset="45%" stopColor="#ffc2cf" />
          <stop offset="100%" stopColor="#ff7a90" />
        </radialGradient>
        {/* Layered bloom so stars glow. */}
        <filter id="cb-glow" x="-150%" y="-150%" width="400%" height="400%">
          <feGaussianBlur stdDeviation="4.5" result="wide" />
          <feGaussianBlur in="SourceGraphic" stdDeviation="1.6" result="tight" />
          <feMerge>
            <feMergeNode in="wide" />
            <feMergeNode in="wide" />
            <feMergeNode in="tight" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* Far dust layer (slow parallax, dim). */}
      <g className="cb-far">
        <g filter="url(#cb-glow)">
          {DUST.map((d, i) => (
            <circle
              className="cb-dust"
              key={i}
              cx={d.x}
              cy={d.y}
              r={d.r}
              fill={DUST_TINT[i % DUST_TINT.length]}
            />
          ))}
        </g>
      </g>

      {/* Near network: edges then star nodes. */}
      <g className="cb-near">
        <g className="cb-edges">
          {edges.map((e, i) => (
            <line
              className="cb-edge"
              key={i}
              x1={e.x1}
              y1={e.y1}
              x2={e.x2}
              y2={e.y2}
            />
          ))}
        </g>
        <g filter="url(#cb-glow)">
          {STARS.map((s, i) => (
            <circle
              className="cb-star"
              key={i}
              cx={s.x}
              cy={s.y}
              r={s.r}
              fill={`url(#cb-s-${STAR_TINT[i] ?? "blue"})`}
            />
          ))}
        </g>
      </g>
    </svg>
  );
}
