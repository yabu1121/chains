"use client";

import { createElement, useEffect, useRef, type ElementType } from "react";
import { useReducedMotion } from "framer-motion";
import { animate } from "animejs";

const GLYPHS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789/<>_-#@";

/**
 * mono の小見出し（eyebrow）を「文字が解読されていく」スクランブルで出す。
 * anime.js を進捗ドライバに使い、各文字を確定時刻まではランダムなグリフで描く。
 * SSR / reduced-motion では確定テキストをそのまま表示。
 */
export function ScrambleText({
  children,
  as = "span",
  className,
  duration = 900,
  threshold = 0.4,
}: {
  children: string;
  as?: ElementType;
  className?: string;
  duration?: number;
  threshold?: number;
}) {
  const ref = useRef<HTMLElement>(null);
  const reduce = useReducedMotion() ?? false;

  useEffect(() => {
    const el = ref.current;
    if (!el || reduce) return;
    const final = children;
    const n = final.length;

    const io = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        io.disconnect();
        const state = { p: 0 };
        animate(state, {
          p: 1,
          duration,
          ease: "out(2)",
          onUpdate: () => {
            // p に応じて左から確定。未確定の非空白文字はランダムグリフ。
            const revealed = Math.floor(state.p * n);
            let out = "";
            for (let i = 0; i < n; i++) {
              const ch = final[i];
              if (ch === " " || i < revealed) out += ch;
              else out += GLYPHS[(Math.floor(state.p * 97) + i * 7) % GLYPHS.length];
            }
            el.textContent = out;
          },
          onComplete: () => {
            el.textContent = final;
          },
        });
      },
      { threshold },
    );
    io.observe(el);

    return () => io.disconnect();
  }, [children, reduce, duration, threshold]);

  // ref は DOM 要素へ forward するだけ（描画中に読まない）。誤検知を抑制。
  return createElement(as, { ref, className }, children);
}
