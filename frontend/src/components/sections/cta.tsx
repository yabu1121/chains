"use client";

/**
 * クロージング CTA — LP の締め。メール受付はせず、本体 chains の登録へ送る。
 * 藍ベタの反転面に、スクロールで現れる大きな宣言とボタン。
 * コピー: docs/copy.md §8（クロージング CTA）。
 */

import { motion, useReducedMotion } from "framer-motion";
import { useReveal } from "../book/use-press-entrance";
import { PRESS_SPRING } from "../book/motion";
import { APP_REGISTER_URL } from "@/lib/site";
import { SplitText } from "../motion/split-text";
import { ScrambleText } from "../motion/scramble-text";
import { StaggerGrid } from "../motion/stagger-grid";
import { FlowLine } from "../motion/flow-line";
import { withMark } from "../motion/mark";
import copy from "@/content/copy.json";

export default function Cta() {
  const sectionRef = useReveal<HTMLElement>({ y: 24, stagger: 110 });
  const reduce = useReducedMotion();

  return (
    <section
      id="cta"
      ref={sectionRef}
      className="lit-top relative overflow-hidden rounded-[28px] bg-accent-press px-6 py-32 text-bg shadow-[0_2px_4px_rgba(10,18,38,0.18),0_50px_90px_-50px_rgba(8,14,30,0.7)] sm:px-10 sm:py-40 lg:px-14"
    >
      {/* 流れる点線（装飾）。 */}
      <FlowLine className="absolute right-8 top-16 h-2 w-40 -rotate-3 text-[#cfe1fb] opacity-45 sm:right-16" />

      {/* 背景の中心波及グリッド（装飾）。藍ベタに薄く重ねる。 */}
      <StaggerGrid
        cols={18}
        rows={10}
        className="pointer-events-none absolute inset-0 -z-0 opacity-40 [&_[data-cell]]:bg-bg"
      />

      {/* 背景の微かなノード網（装飾）。スクロールで漂う */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-0">
        {DOTS.map((d, i) => (
          <motion.span
            key={i}
            className="absolute rounded-full bg-bg/25"
            style={{ left: `${d.x}%`, top: `${d.y}%`, width: d.r, height: d.r }}
            // 軽量化: 画面内のときだけ漂わせる（オフスクリーンでループ停止）
            whileInView={
              reduce ? undefined : { y: [0, d.dy, 0], opacity: [0.25, 0.5, 0.25] }
            }
            viewport={{ once: false, amount: 0 }}
            transition={
              reduce
                ? undefined
                : {
                    duration: d.dur,
                    repeat: Infinity,
                    ease: "easeInOut",
                    delay: d.delay,
                  }
            }
          />
        ))}
      </div>

      <div className="relative mx-auto max-w-3xl text-center">
        <span aria-hidden>
          <ScrambleText
            as="p"
            className="font-mono text-xs uppercase tracking-[0.24em] text-bg/70"
          >
            {copy.cta.eyebrow}
          </ScrambleText>
        </span>
        <h2 className="mt-5 font-display text-[clamp(1.75rem,6vw,4rem)] font-medium leading-[1.12] tracking-tight text-bg">
          <SplitText as="span" by="char" className="inline">
            {copy.cta.heading[0]}
          </SplitText>
          <br className="hidden sm:block" />
          <SplitText as="span" by="char" className="inline" startDelay={260}>
            {copy.cta.heading[1]}
          </SplitText>
        </h2>
        <p className="reveal mx-auto mt-7 max-w-md text-base leading-relaxed text-bg/80 sm:text-lg">
          {withMark(copy.cta.sub, "数十秒")}
        </p>

        <div className="reveal mt-10 flex flex-wrap items-center justify-center gap-x-6 gap-y-4">
          <motion.a
            href={APP_REGISTER_URL}
            whileHover={{ y: -2 }}
            whileTap={{ y: 1, scale: 0.985 }}
            transition={PRESS_SPRING}
            className="inline-flex items-center justify-center rounded-card bg-bg px-9 py-4 text-sm font-medium text-accent shadow-[0_8px_34px_-4px_rgba(207,225,251,0.5)] transition-shadow hover:shadow-[0_12px_46px_-4px_rgba(207,225,251,0.75)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bg"
          >
            {copy.cta.button}
          </motion.a>
          <a
            href="#how"
            className="font-mono text-xs tracking-[0.14em] text-bg/80 underline decoration-bg/40 underline-offset-[6px] transition-colors hover:decoration-bg"
          >
            {copy.cta.backLink}
          </a>
        </div>
      </div>
    </section>
  );
}

/** 背景の漂うノード（決定的な手置き。装飾） */
const DOTS = [
  { x: 8, y: 22, r: 6, dy: -14, dur: 7, delay: 0 },
  { x: 18, y: 70, r: 4, dy: 12, dur: 9, delay: 0.6 },
  { x: 32, y: 40, r: 5, dy: -10, dur: 8, delay: 1.2 },
  { x: 48, y: 80, r: 3, dy: 10, dur: 10, delay: 0.3 },
  { x: 66, y: 28, r: 5, dy: -12, dur: 7.5, delay: 0.9 },
  { x: 78, y: 64, r: 4, dy: 14, dur: 8.5, delay: 0.2 },
  { x: 90, y: 38, r: 6, dy: -8, dur: 9.5, delay: 1.5 },
  { x: 60, y: 14, r: 3, dy: 9, dur: 11, delay: 0.8 },
] as const;
