"use client";

import { useMemo } from "react";

/**
 * 常時ゆっくり漂う点の層（アンビエント）。装飾なので aria-hidden。
 * anime.js 公式サイト的な「止まっていない」気配を、入場アニメとは別に常時与える。
 *
 * 役割分担の外側: これは入場でもインタラクションでもなく「常在モーション」。
 * JS の rAF を増やさないよう CSS keyframe（globals.css の `ambient-drift`）で
 * compositor だけを動かす。各点の方向・速度・不透明度は CSS 変数で個体差を付ける。
 *
 * 位置は決定的（seed つき LCG）なので SSR とクライアントで一致しハイドレーション安全。
 * prefers-reduced-motion 時は globals.css の規則で animation を無効化し、静かな点として置く。
 */

type Tone = "ink" | "accent" | "bg";

const TONE_CLASS: Record<Tone, string> = {
  ink: "bg-ink",
  accent: "bg-accent",
  bg: "bg-bg",
};

/** 決定的な擬似乱数（Mulberry32）。seed から再現可能な 0..1 列を生む。 */
function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Dot = {
  left: string;
  top: string;
  size: number;
  dx: string;
  dy: string;
  o0: number;
  o1: number;
  dur: number;
  delay: number;
};

export function AmbientField({
  count = 18,
  seed = 7,
  tone = "accent",
  className,
  baseOpacity = 0.18,
}: {
  /** 点の数 */
  count?: number;
  /** 配置の seed。セクションごとに変えると見え方が変わる */
  seed?: number;
  /** 点の色 */
  tone?: Tone;
  className?: string;
  /** 不透明度の基準（0..1）。控えめに保つ */
  baseOpacity?: number;
}) {
  const dots = useMemo<Dot[]>(() => {
    const rng = makeRng(seed);
    return Array.from({ length: count }, () => {
      const size = 2 + Math.round(rng() * 4); // 2..6px
      const ang = rng() * Math.PI * 2;
      const dist = 10 + rng() * 26; // 漂う距離 10..36px
      const o = baseOpacity * (0.5 + rng()); // 個体差のある淡さ
      return {
        left: `${(rng() * 100).toFixed(2)}%`,
        top: `${(rng() * 100).toFixed(2)}%`,
        size,
        dx: `${(Math.cos(ang) * dist).toFixed(1)}px`,
        dy: `${(Math.sin(ang) * dist).toFixed(1)}px`,
        o0: Number((o * 0.45).toFixed(3)),
        o1: Number(Math.min(o, 1).toFixed(3)),
        dur: 6 + rng() * 8, // 6..14s
        delay: -rng() * 8, // 負の delay で位相をばらけさせ、初期から動いて見せる
      };
    });
  }, [count, seed, baseOpacity]);

  return (
    <div
      aria-hidden
      className={`pointer-events-none absolute inset-0 overflow-hidden ${className ?? ""}`}
    >
      {dots.map((d, i) => (
        <span
          key={i}
          data-ambient
          className={`absolute rounded-full ${TONE_CLASS[tone]}`}
          style={{
            left: d.left,
            top: d.top,
            width: d.size,
            height: d.size,
            opacity: d.o1,
            animationName: "ambient-drift",
            animationDuration: `${d.dur}s`,
            animationDelay: `${d.delay}s`,
            animationTimingFunction: "ease-in-out",
            animationIterationCount: "infinite",
            animationDirection: "alternate",
            willChange: "transform, opacity",
            // keyframe が参照する個体差。型のため CSSProperties を緩める。
            ["--ambient-dx" as string]: d.dx,
            ["--ambient-dy" as string]: d.dy,
            ["--ambient-o0" as string]: String(d.o0),
            ["--ambient-o1" as string]: String(d.o1),
          }}
        />
      ))}
    </div>
  );
}
