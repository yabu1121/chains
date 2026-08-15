"use client";

import { useEffect, useRef } from "react";
import { useReducedMotion } from "framer-motion";
import { animate, stagger } from "animejs";

/**
 * スクロール連動の段階リビール（anime.js）。
 * 返した ref をコンテナに付け、現れさせたい子要素に `reveal` クラスを振る。
 * 初期非表示は globals.css の `.js .reveal { opacity: 0 }` が担う
 * （JS 無効・reduced-motion では可視のまま）。ビューポート進入時に 1 回だけ発火。
 * 進入前にフォーカスが入った場合（キーボード操作）は即時に出して可視化する。
 */
export function useReveal<T extends HTMLElement>(options?: {
  y?: number;
  stagger?: number;
  duration?: number;
}) {
  const { y = 18, stagger: step = 80, duration = 720 } = options ?? {};
  const ref = useRef<T>(null);
  const prefersReduced = useReducedMotion() ?? false;

  useEffect(() => {
    const root = ref.current;
    if (!root || prefersReduced) return;
    const targets = Array.from(root.querySelectorAll<HTMLElement>(".reveal"));
    if (targets.length === 0) return;

    let started = false;
    const run = () => {
      if (started) return;
      started = true;
      io.disconnect();
      root.removeEventListener("focusin", run);
      animate(targets, {
        opacity: [0, 1],
        translateY: [y, 0],
        delay: stagger(step),
        duration,
        // バウンス: 目標を少し行き過ぎてから戻る（ぽんっと弾む登場）。
        ease: "outBack(1.6)",
      });
    };

    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) run();
      },
      { threshold: 0.15 },
    );
    io.observe(root);
    root.addEventListener("focusin", run);

    return () => {
      io.disconnect();
      root.removeEventListener("focusin", run);
    };
  }, [prefersReduced, y, step, duration]);

  return ref;
}

/** @deprecated 旧 letterpress 版の別名。新規は useReveal を使う。 */
export const usePressEntrance = useReveal;
