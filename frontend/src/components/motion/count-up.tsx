"use client";

import { createElement, useEffect, useRef, type ElementType } from "react";
import { useReducedMotion } from "framer-motion";
import { animate } from "animejs";

/**
 * ビューポート進入で 0 → target にカウントアップする数字（anime.js）。
 * 「数字が立ち上がる」勢いを出す入場モーション。整数のみ。
 *
 * SSR / reduced-motion では最終値を即時表示（DOM の初期テキストが最終値）。
 * pad で桁を 0 埋め（例 pad=2 で 1 → "01"）。1 回だけ発火。
 */
export function CountUp({
  to,
  from = 0,
  duration = 1100,
  pad = 0,
  prefix = "",
  suffix = "",
  as = "span",
  className,
  threshold = 0.5,
}: {
  to: number;
  from?: number;
  duration?: number;
  /** 0 埋め桁数。0 で無効 */
  pad?: number;
  prefix?: string;
  suffix?: string;
  as?: ElementType;
  className?: string;
  threshold?: number;
}) {
  const ref = useRef<HTMLElement>(null);
  const reduce = useReducedMotion() ?? false;

  const format = (n: number) => {
    const s = String(Math.round(n));
    return prefix + (pad > 0 ? s.padStart(pad, "0") : s) + suffix;
  };

  useEffect(() => {
    const el = ref.current;
    if (!el || reduce) return;

    const io = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        io.disconnect();
        const state = { v: from };
        animate(state, {
          v: to,
          duration,
          ease: "out(3)",
          onUpdate: () => {
            el.textContent = format(state.v);
          },
          onComplete: () => {
            el.textContent = format(to);
          },
        });
      },
      { threshold },
    );
    io.observe(el);
    return () => io.disconnect();
    // format は from/to/pad/prefix/suffix に依存。これらが変われば貼り直す。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [to, from, duration, pad, prefix, suffix, reduce, threshold]);

  // 初期テキスト＝最終値（SSR/JS 無効/reduced で正しい値が出る）。
  return createElement(as, { ref, className }, format(to));
}
