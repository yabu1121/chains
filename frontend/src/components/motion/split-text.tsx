"use client";

import { createElement, useEffect, useRef, type ElementType } from "react";
import { useReducedMotion } from "framer-motion";
import { animate, stagger, text } from "animejs";

/**
 * anime.js の text.split で見出しを文字（or 単語）に割り、ビューポート進入時に
 * 一文字ずつ stagger で立ち上げる（anime.js 公式サイト風の字組みモーション）。
 * SSR ではプレーンなテキストとして描画され、reduced-motion では分割せず即時表示。
 */
export function SplitText({
  children,
  as = "span",
  className,
  id,
  by = "char",
  step = 26,
  y = 30,
  duration = 850,
  startDelay = 0,
  threshold = 0.2,
}: {
  children: string;
  as?: ElementType;
  className?: string;
  id?: string;
  /** 分割単位 */
  by?: "char" | "word";
  /** 1 単位あたりの遅延(ms) */
  step?: number;
  /** 立ち上がりの y 移動量(px) */
  y?: number;
  duration?: number;
  startDelay?: number;
  threshold?: number;
}) {
  const ref = useRef<HTMLElement>(null);
  const reduce = useReducedMotion() ?? false;

  useEffect(() => {
    const el = ref.current;
    if (!el || reduce) return;

    const splitter = text.split(el, {
      words: by === "word",
      chars: by === "char",
      // 支援技術には元のテキストを残す
      accessible: true,
    });
    const targets = (by === "word" ? splitter.words : splitter.chars) as
      | HTMLElement[]
      | undefined;
    if (!targets || targets.length === 0) return;

    // 進入前は隠す（フラッシュ防止）
    for (const t of targets) {
      t.style.display = "inline-block";
      t.style.willChange = "transform, opacity";
      t.style.opacity = "0";
    }

    const io = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        io.disconnect();
        animate(targets, {
          y: [y, 0],
          opacity: [0, 1],
          duration,
          delay: stagger(step, { start: startDelay }),
          ease: "out(3)",
        });
      },
      { threshold },
    );
    io.observe(el);

    return () => {
      io.disconnect();
      splitter.revert();
    };
  }, [children, reduce, by, step, y, duration, startDelay, threshold]);

  // ref は DOM 要素へ forward するだけ（描画中に読まない）。誤検知を抑制。
  return createElement(as, { ref, className, id }, children);
}
