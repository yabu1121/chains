"use client";

/**
 * プロフィール — プロフィールカードのモック。
 * 出典: docs/design-direction.md §5-3 / docs/copy.md §4（コピーは一字一句）。
 *
 * 「リンクごとに公開範囲を選べる」を一枚の絵で見せる:
 *  - 各リンク行の公開範囲バッジを別々の値（全員 / フレンドのみ / 自分のみ）で並べる
 *  - 凡例脇に、三段階を実際に巡回する小さなトグル「デモ」を framer-motion で置く
 *    （実在のリンク値は書き換えない＝誤情報にしない。デモは独立した装飾的操作）
 *
 * モーション:
 *  - 説明側 = useReveal（anime.js）。section の ref が拾う .reveal を順に出す。
 *  - カード = framer-motion で「組み上がる」。進入時に rotateX 数度→0 で微かに
 *    起き上がり（transform のみ）、子要素を variants の stagger で
 *    アバター→名前→言語チップ(pop)→リンク行(右からスライド) の順に立てる。
 *  - 視差差 = useScroll。カードは説明列よりゆっくり動かし（小さい y 振幅）、
 *    説明列ラッパは大きめに動かして奥行きの速度差を作る（.reveal とは別レイヤ）。
 *  - ホバー/タップ = framer-motion + PRESS_SPRING。
 *  - transform / opacity のみ。prefers-reduced-motion は全停止
 *    （useReducedMotion 分岐 + スクロール transform も無効化）。
 */

import { useRef, useState } from "react";
import {
  motion,
  useScroll,
  useTransform,
  type Variants,
} from "framer-motion";
import { useReducedMotionSafe } from "../motion/use-reduced-motion-safe";
import { useReveal } from "../book/use-press-entrance";
import copy from "@/content/copy.json";
import { ENTER_SPRING, PRESS_SPRING } from "../book/motion";
import { SplitText } from "../motion/split-text";
import { ScrambleText } from "../motion/scramble-text";
import { withMark } from "../motion/mark";

const LANGS = ["Go", "Rust", "TypeScript", "SQL"] as const;

const VISIBILITY = ["全員", "フレンドのみ", "自分のみ"] as const;
type Visibility = (typeof VISIBILITY)[number];

type Link = { name: string; visibility: Visibility };

// docs/copy.md §4 — リンク行ごとに別の公開範囲。固有名は架空。
const LINKS: ReadonlyArray<Link> = [
  { name: "GitHub", visibility: "全員" },
  { name: "Zenn", visibility: "全員" },
  { name: "LinkedIn", visibility: "フレンドのみ" },
  { name: "ポートフォリオ", visibility: "自分のみ" },
];

/** バッジの見た目を公開範囲ごとに少しだけ変える（藍の濃淡で段階を可読に） */
function visibilityClass(v: Visibility): string {
  switch (v) {
    case "全員":
      return "bg-accent-soft text-accent";
    case "フレンドのみ":
      return "border border-accent/40 text-accent";
    case "自分のみ":
      return "border border-border text-muted";
  }
}

export default function Profile() {
  const sectionRef = useReveal<HTMLElement>();
  const prefersReduced = useReducedMotionSafe();

  // 凡例脇の「デモ」だけが状態を持つ。実リンクの値は固定（誤情報防止）。
  const [demoIndex, setDemoIndex] = useState(0);
  const demoValue = VISIBILITY[demoIndex];
  const cycleDemo = () => setDemoIndex((i) => (i + 1) % VISIBILITY.length);

  // 視差差: セクション通過進捗を 1 本取り、説明列とカードに別振幅を割り当てる。
  const gridRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: gridRef,
    offset: ["start end", "end start"],
  });
  // 説明列は大きめ、カードは小さめ（=ゆっくり）に動かして奥行きの速度差を作る。
  const proseY = useTransform(scrollYProgress, [0, 1], [44, -44]);
  const cardY = useTransform(scrollYProgress, [0, 1], [22, -22]);

  // カード組み上げの variants（reduce 時は親で停止）。
  const cardStagger: Variants = {
    hidden: {},
    show: {
      transition: { staggerChildren: 0.09, delayChildren: 0.05 },
    },
  };
  const riseItem: Variants = {
    hidden: { opacity: 0, y: 12 },
    show: {
      opacity: 1,
      y: 0,
      transition: { type: "spring", stiffness: 360, damping: 26 },
    },
  };
  const popItem: Variants = {
    hidden: { opacity: 0, scale: 0.7 },
    show: {
      opacity: 1,
      scale: 1,
      transition: { type: "spring", stiffness: 460, damping: 20 },
    },
  };
  const slideItem: Variants = {
    hidden: { opacity: 0, x: 16 },
    show: {
      opacity: 1,
      x: 0,
      transition: { type: "spring", stiffness: 380, damping: 28 },
    },
  };

  // reduce 時は variants を渡さず、子も常時可視のまま静止させる。
  const viewport = { once: true, amount: 0.4 } as const;

  return (
    <section
      id="profile"
      ref={sectionRef}
      aria-labelledby="profile-heading"
      className="relative px-6 py-24 sm:px-10 sm:py-32"
    >
      <div
        ref={gridRef}
        className="relative z-10 mx-auto grid w-full max-w-5xl gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:items-center lg:gap-20"
      >
        {/* 説明側 — 子は .reveal（anime.js）。ラッパに視差 y（別レイヤなので衝突なし）。 */}
        <motion.div
          style={prefersReduced ? undefined : { y: proseY }}
          className="max-w-prose"
        >
          <ScrambleText
            as="p"
            className="font-mono text-[11px] tracking-[0.22em] text-[#cfe1fb]"
          >
            {copy.profile.eyebrow}
          </ScrambleText>
          <SplitText
            as="h2"
            by="char"
            id="profile-heading"
            className="mt-4 font-display text-3xl leading-tight tracking-tight text-bg sm:text-4xl"
          >
            {copy.profile.title}
          </SplitText>
          <p className="reveal mt-6 text-[15px] leading-[1.9] text-bg/80 sm:text-base">
            {withMark(copy.profile.prose, "公開範囲")}
          </p>

          {/* 公開範囲の凡例 + 巡回デモ */}
          <div className="reveal mt-8 flex flex-col gap-4">
            <p className="font-mono text-[11px] tracking-[0.16em] text-bg/70">
              {copy.profile.legend}
            </p>
            <div className="flex items-center gap-3">
              <motion.button
                type="button"
                onClick={cycleDemo}
                whileHover={prefersReduced ? undefined : { y: -1 }}
                whileTap={prefersReduced ? undefined : { scale: 0.96 }}
                transition={PRESS_SPRING}
                aria-label={`公開範囲を切り替えるデモ。現在: ${demoValue}。押すと次の段階に変わります`}
                className="inline-flex items-center gap-2 rounded-card border border-border bg-panel px-3 py-2 font-mono text-[11px] tracking-[0.12em] text-ink transition-colors hover:border-accent/50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              >
                <span aria-hidden className="text-muted">
                  {copy.profile.demoPrefix}
                </span>
                <motion.span
                  key={demoValue}
                  initial={prefersReduced ? false : { opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.22, ease: [0.2, 0.8, 0.2, 1] }}
                  className={`rounded-full px-2.5 py-1 ${visibilityClass(
                    demoValue,
                  )}`}
                >
                  {demoValue}
                </motion.span>
              </motion.button>
              <span className="font-mono text-[11px] tracking-[0.12em] text-bg/70">
                {copy.profile.demoNote}
              </span>
            </div>
          </div>
        </motion.div>

        {/* プロフィールカードのモック — framer-motion で「組み上がる」。
            進入時に rotateX 数度→0 で微かに起き上がり、子を variants で順に立てる。
            視差 y はホバー y と衝突しないよう外側ラッパに持たせる。 */}
        <motion.div style={prefersReduced ? undefined : { y: cardY }}>
          {/* 常在の微細フロート（呼吸）。視差 cardY（外側）・入場 variants（article）・
              ホバー y（article）とは別レイヤなので衝突しない。reduce では静止。
              役割分担: これは入場ではなく常在ループなので framer-motion。 */}
          <motion.div
            // 軽量化: 画面内のときだけ呼吸させる（オフスクリーンで停止）
            whileInView={prefersReduced ? undefined : { y: [0, -6, 0] }}
            viewport={{ once: false, amount: 0 }}
            transition={
              prefersReduced
                ? undefined
                : {
                    duration: 7,
                    ease: "easeInOut",
                    repeat: Infinity,
                    repeatType: "loop",
                  }
            }
          >
          <motion.article
            aria-label="プロフィールカードの見本"
            style={prefersReduced ? undefined : { transformPerspective: 1000 }}
            initial={prefersReduced ? false : { opacity: 0, rotateX: 7, y: 24 }}
            whileInView={prefersReduced ? undefined : { opacity: 1, rotateX: 0, y: 0 }}
            viewport={viewport}
            whileHover={prefersReduced ? undefined : { y: -4 }}
            transition={ENTER_SPRING}
            className="lit-top rounded-card border border-border bg-panel p-6 shadow-[0_1px_0_rgba(22,24,29,0.03),0_18px_40px_-24px_rgba(22,24,29,0.28)] sm:p-8"
          >
            <motion.div
              variants={prefersReduced ? undefined : cardStagger}
              initial={prefersReduced ? false : "hidden"}
              whileInView={prefersReduced ? undefined : "show"}
              viewport={viewport}
            >
            {/* ヘッダー: アバター + 表示名 + 職種 */}
            <div className="flex items-start gap-4">
              <motion.div
                variants={prefersReduced ? undefined : popItem}
                aria-hidden
                className="flex size-14 shrink-0 items-center justify-center rounded-full bg-accent-soft font-display text-lg font-medium text-accent"
              >
                AS
              </motion.div>
              <motion.div
                variants={prefersReduced ? undefined : riseItem}
                className="min-w-0"
              >
                <p className="font-display text-xl font-medium tracking-tight text-ink">
                  Aoi Sasaki
                </p>
                <p className="mt-1 font-mono text-[11px] tracking-[0.14em] text-muted">
                  Backend Engineer
                </p>
              </motion.div>
            </div>

            {/* ひとこと（ステータス） */}
            <motion.p
              variants={prefersReduced ? undefined : riseItem}
              className="mt-5 text-sm leading-relaxed text-ink/85"
            >
              分散システムと、たまに Rust。
            </motion.p>

            <hr aria-hidden className="my-6 border-t border-border" />

            {/* 言語タグ — pop stagger で一つずつ立つ */}
            <div>
              <motion.p
                variants={prefersReduced ? undefined : riseItem}
                className="font-mono text-[11px] tracking-[0.16em] text-muted"
              >
                言語
              </motion.p>
              <motion.ul
                variants={prefersReduced ? undefined : cardStagger}
                className="mt-3 flex flex-wrap gap-2"
              >
                {LANGS.map((lang) => (
                  <motion.li
                    key={lang}
                    variants={prefersReduced ? undefined : popItem}
                    whileHover={prefersReduced ? undefined : { y: -2 }}
                    transition={PRESS_SPRING}
                    className="rounded-full bg-accent-soft px-3 py-1 font-mono text-xs tracking-[0.04em] text-accent"
                  >
                    {lang}
                  </motion.li>
                ))}
              </motion.ul>
            </div>

            {/* リンク + 公開範囲バッジ — 右からスライドで一行ずつ */}
            <div className="mt-6">
              <motion.p
                variants={prefersReduced ? undefined : riseItem}
                className="font-mono text-[11px] tracking-[0.16em] text-muted"
              >
                リンク
              </motion.p>
              <motion.ul
                variants={prefersReduced ? undefined : cardStagger}
                className="mt-3 flex flex-col"
              >
                {LINKS.map((link, i) => (
                  <motion.li
                    key={link.name}
                    variants={prefersReduced ? undefined : slideItem}
                    whileHover={prefersReduced ? undefined : { x: 2 }}
                    transition={PRESS_SPRING}
                    className={`flex items-center justify-between gap-4 py-2.5 ${
                      i > 0 ? "border-t border-border" : ""
                    }`}
                  >
                    <span className="truncate text-sm text-ink">
                      {link.name}
                    </span>
                    <motion.span
                      whileHover={prefersReduced ? undefined : { scale: 1.05 }}
                      transition={PRESS_SPRING}
                      className={`shrink-0 rounded-full px-2.5 py-1 font-mono text-[11px] tracking-[0.08em] ${visibilityClass(
                        link.visibility,
                      )}`}
                    >
                      {link.visibility}
                    </motion.span>
                  </motion.li>
                ))}
              </motion.ul>
            </div>
            </motion.div>
          </motion.article>
          </motion.div>
        </motion.div>
      </div>
    </section>
  );
}
