"use client";

/**
 * つながり方（How it works） — 3 ステップ。
 * 仕様の出典: docs/design-direction.md §5-2 / docs/copy.md §3（コピーは一字一句）。
 *
 * デザインシステムは本体 chains 準拠の新トークン（globals.css @theme）:
 *   bg-bg / bg-panel / border-border / text-ink / text-muted / text-accent /
 *   bg-accent-soft / rounded-card。書体は全て JetBrains Mono 基調（見出しもモノ）。
 *
 * モーション:
 *   入場 = useReveal（anime.js）。section に ref、各カードと見出しに .reveal。
 *          スクロール進入で 01→02→03 が順に組み上がる（stagger）。
 *   深さ視差 = framer-motion useScroll。各カード内側ラッパに、カードごと速度差の
 *          ある y を与えて立ち上がりに前後の奥行きを出す（.reveal とは別レイヤなので
 *          anime.js の translateY と衝突しない）。
 *   連結罫 = ol の通過進捗に連動して 01→02→03 の順に scaleX/scaleY で「描く」。
 *   番号 = ビューポート進入時に scale でカウントイン的に強調。
 *   インタラクション = framer-motion。カードのホバーで PRESS_SPRING の微小 lift。
 *   transform / opacity のみ・prefers-reduced-motion は全停止（useReducedMotion 分岐 +
 *   useReveal/MotionConfig）。スクロール transform も reduce 時は無効。
 *
 * a11y: h2 見出し + 順序のある手順なので <ol>/<li>。番号は装飾の `01` ではなく
 *       リスト構造そのものが順序を担い、見える番号は aria-hidden。
 */

import { useRef } from "react";
import {
  motion,
  useScroll,
  useSpring,
  useTransform,
  type MotionValue,
} from "framer-motion";
import { useReveal } from "../book/use-press-entrance";
import { ENTER_SPRING, PRESS_SPRING } from "../book/motion";
import { SplitText } from "../motion/split-text";
import { ScrambleText } from "../motion/scramble-text";
import { CountUp } from "../motion/count-up";
import { useReducedMotionSafe } from "../motion/use-reduced-motion-safe";
import { FlowLine } from "../motion/flow-line";
import { withMark } from "../motion/mark";
import copy from "@/content/copy.json";

type Step = {
  /** 表示用のラベル番号（mono・accent）。順序は <ol> が担うので装飾扱い。 */
  label: string;
  title: string;
  body: string;
};

// 3 ステップの文言は src/content/copy.json（how.steps）で一元管理。
const STEPS: ReadonlyArray<Step> = copy.how.steps;

/** カードごとの視差速度（px）。手前(01)ほど大きく動かし、奥に向かって減衰させる。 */
const DEPTH = [40, 24, 12] as const;

export default function How() {
  // 入場はややゆったりめ・stagger を広げて、見出し→3カードが順に流れ込む滑らかさを出す。
  const sectionRef = useReveal<HTMLElement>({ y: 22, stagger: 120, duration: 900 });
  const prefersReduced = useReducedMotionSafe();

  // 連結罫の「描く」進捗 — ol の通過進捗に連動。
  const listRef = useRef<HTMLOListElement>(null);
  const { scrollYProgress } = useScroll({
    target: listRef,
    // 罫はカードが画面中央付近に来てから引き始め、抜ける前に引き終える。
    offset: ["start 0.85", "center 0.4"],
  });
  // スクロール進捗をバネで緩衝してから視差・罫に渡す。これでスクロールのカクつきが
  // そのまま出ず、視差も罫も「遅れて滑らかに追従」してグライドする（滑らかさの肝）。
  const smoothProgress = useSpring(scrollYProgress, {
    stiffness: 85,
    damping: 25,
    mass: 0.35,
    restDelta: 0.0005,
  });

  return (
    <section
      id="how"
      ref={sectionRef}
      className="relative px-6 py-24 sm:px-10 sm:py-28 lg:px-14"
    >
      {/* 流れる点線（装飾）。 */}
      <FlowLine className="absolute right-6 top-20 h-2 w-36 -rotate-6 text-[#cfe1fb] opacity-40 sm:right-12" />
      <div className="relative z-10 mx-auto w-full max-w-5xl">
        {/* 見出しブロック */}
        <div className="max-w-2xl">
          <span aria-hidden>
            <ScrambleText
              as="p"
              className="font-mono text-xs uppercase tracking-[0.22em] text-[#cfe1fb]"
            >
              {copy.how.eyebrow}
            </ScrambleText>
          </span>
          <SplitText
            as="h2"
            by="char"
            className="mt-4 font-display text-3xl tracking-tight text-bg sm:text-4xl"
          >
            {copy.how.title}
          </SplitText>
          <p className="reveal mt-5 text-base leading-relaxed text-bg/75">
            {withMark(copy.how.lead, "三手")}
          </p>
        </div>

        {/* 3 ステップ。順序のある手順なので ol。lg+ で横 3 列、md 以下で縦積み。 */}
        <ol
          ref={listRef}
          className="mt-14 grid grid-cols-1 gap-5 lg:grid-cols-3 lg:gap-6"
        >
          {STEPS.map((step, i) => (
            <StepItem
              key={step.label}
              step={step}
              index={i}
              isLast={i === STEPS.length - 1}
              progress={smoothProgress}
              prefersReduced={prefersReduced}
            />
          ))}
        </ol>
      </div>
    </section>
  );
}

function StepItem({
  step,
  index,
  isLast,
  progress,
  prefersReduced,
}: {
  step: Step;
  index: number;
  isLast: boolean;
  progress: MotionValue<number>;
  prefersReduced: boolean;
}) {
  // 深さ視差: カードごとに速度差を付け、立ち上がりに前後の奥行きを出す。
  // .reveal が乗るのは <li>、ここは内側 article なので anime.js と別レイヤで衝突しない。
  const depth = DEPTH[index] ?? 12;
  const y = useTransform(progress, [0, 1], [depth, -depth]);

  // 連結罫の伸長: 各セグメントに進捗ウィンドウを割り当て、01→02→03 の順に引く。
  // セグメント i は [i/n, (i+1)/n] の窓で 0→1。
  const segCount = 2; // 罫は STEP 間 2 本
  const start = index / segCount;
  const end = (index + 1) / segCount;
  const drawRaw = useTransform(progress, [start, end], [0, 1], {
    clamp: true,
  });
  const draw = prefersReduced ? 1 : drawRaw;

  return (
    <li className="group reveal relative flex">
      {/* ステップ間を結ぶ細い罫 + 進行の矢印。進捗連動で順に伸びる（装飾）。 */}
      {!isLast && (
        <span
          aria-hidden
          className="pointer-events-none absolute z-10 flex items-center justify-center
            /* 縦積み(〜md): カード下端の中央に下向き */
            -bottom-5 left-1/2 h-5 w-px -translate-x-1/2
            /* lg+: カード右端の中央に右向き */
            lg:bottom-auto lg:left-auto lg:top-1/2 lg:-right-5
            lg:h-px lg:w-6 lg:translate-x-1/2 lg:-translate-y-1/2"
        >
          {/* 縦積み: 上から下へ scaleY で描く */}
          <motion.span
            aria-hidden
            style={{ scaleY: draw }}
            className="absolute inset-0 origin-top bg-border lg:hidden"
          />
          {/* lg+: 左から右へ scaleX で描く */}
          <motion.span
            aria-hidden
            style={{ scaleX: draw }}
            className="absolute inset-0 hidden origin-left bg-border lg:block"
          />
          {/* 矢頭は罫の伸びに追従して現れる。カード（group）にホバーすると
              くるっと一回転する（motion-safe のみ・360° なので向きは戻る）。 */}
          <motion.span
            aria-hidden
            style={{ opacity: draw, scale: draw }}
            className="absolute font-mono text-[11px] leading-none text-muted/70
              -bottom-3 lg:bottom-auto lg:-right-3"
          >
            <span className="inline-block motion-safe:transition-transform motion-safe:duration-500 motion-safe:ease-out motion-safe:group-hover:rotate-[360deg] lg:hidden">
              ↓
            </span>
            <span className="hidden motion-safe:transition-transform motion-safe:duration-500 motion-safe:ease-out motion-safe:group-hover:rotate-[360deg] lg:inline-block">
              →
            </span>
          </motion.span>
        </span>
      )}

      <motion.article
        style={prefersReduced ? undefined : { y }}
        whileHover={prefersReduced ? undefined : { y: -3 }}
        transition={PRESS_SPRING}
        className="lit-top flex h-full w-full flex-col rounded-card border border-border bg-panel p-7
          shadow-[0_1px_2px_rgba(22,24,29,0.04),0_8px_24px_-12px_rgba(22,24,29,0.12)]
          sm:p-8"
      >
        {/* ラベル番号 — mono・accent。見えるのは装飾、順序は ol が担う。
            進入時に scale でカウントイン的に強調（reduce 時は静止）。 */}
        <div className="flex items-baseline gap-3">
          {/* 番号は CountUp で 0→N に立ち上がる（anime.js・1 回・reduce/SSR は最終値即時）。
              外側の motion.span は従来の press-in scale を併用（数字が「カウントしながら起き上がる」）。
              見える番号は装飾で、順序は <ol> が担うため aria-hidden を維持。 */}
          <motion.span
            aria-hidden
            initial={prefersReduced ? false : { scale: 0.72, opacity: 0, y: 6 }}
            whileInView={{ scale: 1, opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.6 }}
            transition={{ ...ENTER_SPRING, delay: 0.1 + index * 0.12 }}
            className="origin-left font-mono text-2xl font-medium leading-none tracking-tight text-accent"
          >
            <CountUp
              to={index + 1}
              pad={2}
              duration={900}
              threshold={0.6}
            />
          </motion.span>
          <span
            aria-hidden
            className="h-px flex-1 translate-y-[-2px] bg-border"
          />
        </div>

        <h3 className="mt-6 font-display text-xl tracking-tight text-ink">
          {step.title}
        </h3>
        <p className="mt-3 text-[15px] leading-relaxed text-muted">
          {step.body}
        </p>
      </motion.article>
    </li>
  );
}
