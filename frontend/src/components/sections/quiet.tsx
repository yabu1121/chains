"use client";

/**
 * 静けさ（しないこと） — 広告なし・おすすめなし・フィードが無い。
 * 仕様の出典: docs/design-direction.md §5-5 / docs/copy.md §6（コピーは一字一句）。
 *
 * デザインシステムは本体 chains 準拠の新トークン（globals.css @theme）:
 *   bg-bg / bg-panel / border-border / text-ink / text-muted / text-accent /
 *   bg-accent-soft / rounded-card。書体は全て JetBrains Mono 基調（見出しもモノ）。
 *
 * モーション:
 *   入場 = useReveal（anime.js）。見出し・本文の各行に .reveal。
 *   スクロール連動（framer-motion）:
 *     - 反転パネルは通過進捗で opacity 0→1 + y 32→0 で現れる。
 *     - 否定 3 行は左右交互にスライドイン（subject は左/右から x、行ごとに進捗窓をずらす）。
 *     - 「なし」は同じ行の中で少し遅れて opacity で点く（締めの間）。
 *   transform / opacity のみ。prefers-reduced-motion は全停止（完成状態を静的表示）。
 *
 * a11y: h2 見出し + 否定の三点は順不同の事実なので <ul>/<li>。
 *       「—」と「なし」の罫・強調は装飾なので aria-hidden せず、文として読めるまま。
 *       色面反転（bg-ink + text-bg）の締めはコントラスト AA を満たす。
 */

import { useRef } from "react";
import {
  motion,
  useScroll,
  useTransform,
  type MotionValue,
} from "framer-motion";
import { useReducedMotionSafe } from "../motion/use-reduced-motion-safe";
import { useReveal } from "../book/use-press-entrance";
import { SplitText } from "../motion/split-text";
import { ScrambleText } from "../motion/scramble-text";
import { withMark } from "../motion/mark";
import { AmbientField } from "../motion/ambient-field";
import copy from "@/content/copy.json";

type Denial = {
  /** しないことの対象（mono）。 */
  subject: string;
  /** 常に「なし」。誇張語は足さない。 */
  value: string;
};

// 否定の三点は src/content/copy.json（quiet.denials）で一元管理。
const DENIALS: ReadonlyArray<Denial> = copy.quiet.denials;

function DenialRow({
  denial,
  index,
  progress,
  reduce,
}: {
  denial: Denial;
  index: number;
  progress: MotionValue<number>;
  reduce: boolean;
}) {
  // 行ごとに進捗窓をずらす。0 番から順に、各 0.14 進捗で着地。
  const start = 0.22 + index * 0.16;
  const end = start + 0.16;
  // 偶数行は左から、奇数行は右から。変位は控えめ（上質な紙の差し込み）。
  const fromX = index % 2 === 0 ? -28 : 28;

  const x = useTransform(progress, [start, end], [fromX, 0], { clamp: true });
  const opacity = useTransform(progress, [start, end], [0, 1], { clamp: true });
  // 「なし」は行の着地後に少し遅れて点く。
  const valueOpacity = useTransform(progress, [end - 0.03, end + 0.08], [0, 1], {
    clamp: true,
  });

  return (
    <motion.li
      style={reduce ? undefined : { x, opacity }}
      className={
        "relative z-10 flex items-baseline justify-between gap-6 px-6 py-5 sm:px-8" +
        (index > 0 ? " border-t border-white/10" : "")
      }
    >
      <span className="font-mono text-base tracking-tight sm:text-lg">
        {denial.subject}
      </span>
      <span
        aria-hidden
        className="h-px flex-1 translate-y-[-3px] bg-white/15"
      />
      <motion.span
        style={reduce ? undefined : { opacity: valueOpacity }}
        className="font-mono text-base text-bg/60 sm:text-lg"
      >
        {denial.value}
      </motion.span>
    </motion.li>
  );
}

export default function Quiet() {
  const sectionRef = useReveal<HTMLElement>();
  const prefersReduced = useReducedMotionSafe();
  const panelRef = useRef<HTMLUListElement>(null);

  // パネル通過の進捗 0→1。下端から入って上端を抜けるまで。
  const { scrollYProgress } = useScroll({
    target: panelRef,
    offset: ["start 0.9", "end 0.35"],
  });

  // パネル自体の登場（opacity + y）。clip 風に scaleY は使わず軽い持ち上げで。
  const panelOpacity = useTransform(scrollYProgress, [0, 0.22], [0, 1], {
    clamp: true,
  });
  const panelY = useTransform(scrollYProgress, [0, 0.22], [32, 0], {
    clamp: true,
  });

  return (
    <section
      id="quiet"
      ref={sectionRef}
      className="relative px-6 py-24 sm:px-10 sm:py-28 lg:px-14"
    >
      <div className="relative z-10 mx-auto w-full max-w-3xl">
        {/* 見出しブロック */}
        <span aria-hidden>
          <ScrambleText
            as="p"
            className="font-mono text-xs uppercase tracking-[0.22em] text-[#cfe1fb]"
          >
            {copy.quiet.eyebrow}
          </ScrambleText>
        </span>
        <SplitText
          as="h2"
          by="char"
          className="mt-4 font-display text-3xl tracking-tight text-bg sm:text-4xl"
        >
          {copy.quiet.title}
        </SplitText>

        <p className="reveal mt-6 text-base leading-relaxed text-bg/75 sm:text-[17px]">
          {withMark(copy.quiet.prose, "フィード")}
        </p>

        {/* 否定の三点 — 色面を反転して締める。順不同の事実なので ul。
            パネルはスクロールで現れ、各行は左右交互にスライドインする。 */}
        <motion.ul
          ref={panelRef}
          style={
            prefersReduced
              ? undefined
              : { opacity: panelOpacity, y: panelY }
          }
          className="lit-top relative mt-12 overflow-hidden rounded-card bg-ink text-bg"
        >
          {/* 暗面が「生きている」気配。白い点がごく淡く漂う（overflow-hidden で枠内に
              クリップ）。aria-hidden / pointer-events-none / reduce で自動停止。
              行は relative z-10 で前面、点は背面に置く。 */}
          <AmbientField
            count={18}
            seed={73}
            tone="bg"
            baseOpacity={0.1}
          />
          {DENIALS.map((d, i) => (
            <DenialRow
              key={d.subject}
              denial={d}
              index={i}
              progress={scrollYProgress}
              reduce={prefersReduced}
            />
          ))}
        </motion.ul>
      </div>
    </section>
  );
}
