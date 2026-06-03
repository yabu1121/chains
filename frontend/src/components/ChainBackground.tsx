"use client";

import { useEffect, useMemo, useRef } from "react";
import { animate, stagger, svg } from "animejs";
import { prefersReducedMotion } from "@/lib/anim";

// A fixed, full-screen decorative layer behind all content: a faint network of
// ink hairlines and small nodes, like a schematic drafted on paper — echoing
// the app's friend graph. No glow, no gradients: just thin ink lines that draw
// themselves in once (a "drafting" gesture) and then settle, plus a quiet
// parallax drift. This deliberately reads as printed/analog, not neon.
// Purely decorative: pointer-events off, respects reduced motion.
// Coordinates live in a fixed 1200×800 viewBox scaled to cover the viewport.

// Network nodes. `r` varies the size so some read as heavier joints.
const NODES: { x: number; y: number; r: number }[] = [
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

// Build the network: connect each node to its nearest neighbours within a
// distance, capping per-node degree so the web stays tidy. Runs once.
function buildEdges(maxDist: number, maxDeg: number) {
  const pairs: { i: number; j: number; d: number }[] = [];
  for (let i = 0; i < NODES.length; i++) {
    for (let j = i + 1; j < NODES.length; j++) {
      const dx = NODES[i].x - NODES[j].x;
      const dy = NODES[i].y - NODES[j].y;
      const d = Math.hypot(dx, dy);
      if (d <= maxDist) pairs.push({ i, j, d });
    }
  }
  pairs.sort((a, b) => a.d - b.d); // prefer the shortest links
  const deg = new Array(NODES.length).fill(0);
  const edges: { x1: number; y1: number; x2: number; y2: number }[] = [];
  for (const { i, j } of pairs) {
    if (deg[i] >= maxDeg || deg[j] >= maxDeg) continue;
    deg[i]++;
    deg[j]++;
    edges.push({ x1: NODES[i].x, y1: NODES[i].y, x2: NODES[j].x, y2: NODES[j].y });
  }
  return edges;
}

export function ChainBackground() {
  const rootRef = useRef<SVGSVGElement>(null);
  const edges = useMemo(() => buildEdges(250, 3), []);

  useEffect(() => {
    const root = rootRef.current;
    // Skip looping/parallax on reduced-motion and on mobile/touch: keep the
    // background painted once and cheap there.
    const lightweight =
      typeof window !== "undefined" &&
      window.matchMedia("(max-width: 768px), (pointer: coarse)").matches;
    if (!root || prefersReducedMotion() || lightweight) return;

    const lines = Array.from(root.querySelectorAll<SVGLineElement>(".cb-edge"));
    const near = root.querySelector<SVGGElement>(".cb-near");

    // Edges draw themselves in once, like a hand drafting the network, then settle.
    const drawIn = animate(svg.createDrawable(lines), {
      draw: ["0 0", "0 1"],
      duration: 1800,
      delay: stagger(55, { from: "center" }),
      ease: "outQuart",
    });

    // A very slow parallax drift keeps the field from feeling static.
    const drift = near
      ? animate(near, {
          translateX: [0, 16],
          translateY: [0, -12],
          duration: 22000,
          loop: true,
          alternate: true,
          ease: "inOutSine",
        })
      : null;

    return () => {
      drawIn.revert();
      drift?.revert();
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
        <g className="cb-nodes">
          {NODES.map((n, i) => (
            <circle className="cb-node" key={i} cx={n.x} cy={n.y} r={n.r} />
          ))}
        </g>
      </g>
    </svg>
  );
}
