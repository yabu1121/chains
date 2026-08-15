"use client";

import { useEffect, useRef } from "react";
import { useReducedMotion } from "framer-motion";
import { animate, stagger } from "animejs";

/**
 * anime.js 公式サイト風の「中心から波及するドットグリッド」。装飾。
 * ビューポート進入時に中心から外へ stagger でリップルし、淡く定着する。
 * aria-hidden。reduced-motion では静的に淡く表示するだけ。
 */
export function StaggerGrid({
  cols = 16,
  rows = 9,
  className,
}: {
  cols?: number;
  rows?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion() ?? false;
  const count = cols * rows;

  useEffect(() => {
    const el = ref.current;
    if (!el || reduce) return;
    const cells = el.querySelectorAll<HTMLElement>("[data-cell]");
    for (const c of cells) c.style.opacity = "0";

    const io = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        io.disconnect();
        animate(cells, {
          opacity: [0, 0.55, 0.16],
          scale: [0.2, 1],
          duration: 1400,
          delay: stagger(55, { grid: [cols, rows], from: "center" }),
          ease: "out(3)",
        });
      },
      { threshold: 0.15 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [reduce, cols, rows]);

  return (
    <div
      ref={ref}
      aria-hidden
      className={className}
      style={{
        display: "grid",
        gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
        gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))`,
      }}
    >
      {Array.from({ length: count }).map((_, i) => (
        <span key={i} className="flex items-center justify-center">
          <span
            data-cell
            className="size-1 rounded-[2px] bg-accent opacity-[0.14]"
          />
        </span>
      ))}
    </div>
  );
}
