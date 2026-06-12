"use client";

/**
 * News（お知らせ） — 運営からの製品アップデート告知。
 *
 * 注意: ここは「運営の更新告知（changelog/お知らせ）」であって、ユーザー投稿の
 * フィードではない。chains にタイムラインフィードは無い（docs/design-brief.md）。
 * 中身は copy.json の news.items（サンプル）。差し替え前提。
 *
 * デザイン: 本体トークン準拠。藍を前面に出す（日付・タグ・左罫が藍）。淡い紙パネルの上に
 * 新しい順で並べる。見出しは他セクションと同じ ScrambleText / SplitText。
 *
 * モーション:
 *   入場 = useReveal（anime.js）でヘッダを .reveal リビール。
 *   各エントリは framer-motion の whileInView で下から軽くせり上がる（行ごとに遅延）。
 *     viewport once:false / amount で「見えている分だけ」動かし常時ループを避ける（軽量）。
 *   ホバーは PRESS_SPRING の微小 lift。transform / opacity のみ・reduced で全停止。
 *
 * a11y: 時系列の更新履歴なので <ol>。各エントリは <article>。日付は <time dateTime>。
 *   タグは装飾ではなく分類なので読み上げ可能なテキストのまま。
 */

import { motion } from "framer-motion";
import { useReducedMotionSafe } from "../motion/use-reduced-motion-safe";
import { useReveal } from "../book/use-press-entrance";
import { SplitText } from "../motion/split-text";
import { ScrambleText } from "../motion/scramble-text";
import { ENTER_SPRING, PRESS_SPRING } from "../book/motion";
import { withMark } from "../motion/mark";
import copy from "@/content/copy.json";

type NewsItem = {
  date: string;
  tag: string;
  title: string;
  body: string;
};

const ITEMS: ReadonlyArray<NewsItem> = copy.news.items;

/** "2026-06-10" → "2026.06.10"（表示用）。dateTime 属性には元の ISO を残す。 */
function displayDate(iso: string): string {
  return iso.replaceAll("-", ".");
}

function NewsRow({
  item,
  index,
  reduce,
}: {
  item: NewsItem;
  index: number;
  reduce: boolean;
}) {
  return (
    <motion.li
      // reduced へ切替後も可視ターゲットを保つ（whileInView を消すと初回の opacity:0 が
      // 固定され項目が不可視になる）。reduced は duration 0 で即時着地。
      initial={reduce ? false : { opacity: 0, y: 18 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.35 }}
      transition={
        reduce ? { duration: 0 } : { ...ENTER_SPRING, delay: index * 0.06 }
      }
      className="border-t border-border first:border-t-0"
    >
      <motion.article
        whileHover={reduce ? undefined : { y: -3 }}
        transition={PRESS_SPRING}
        className="relative grid gap-3 px-5 py-6 sm:grid-cols-[8.5rem_1fr] sm:gap-6 sm:px-7 sm:py-7"
      >
        {/* 左罫（藍）。各エントリの頭を藍で示す。 */}
        <span
          aria-hidden
          className="absolute left-0 top-6 h-6 w-0.5 rounded-full bg-accent sm:top-7"
        />

        {/* メタ: 日付 + タグ */}
        <div className="flex items-center gap-3 sm:flex-col sm:items-start sm:gap-2.5">
          <time
            dateTime={item.date}
            className="font-mono text-xs tracking-wide text-accent"
          >
            {displayDate(item.date)}
          </time>
          <span className="inline-flex items-center rounded-full bg-accent-soft px-2.5 py-0.5 font-mono text-[11px] tracking-wide text-accent">
            {item.tag}
          </span>
        </div>

        {/* 本体: タイトル + 説明 */}
        <div className="min-w-0">
          <h3 className="text-base font-medium leading-snug tracking-tight text-ink sm:text-[17px]">
            {item.title}
          </h3>
          <p className="mt-2 text-sm leading-relaxed text-muted sm:text-[15px]">
            {item.body}
          </p>
        </div>
      </motion.article>
    </motion.li>
  );
}

export default function News() {
  const sectionRef = useReveal<HTMLElement>();
  const reduce = useReducedMotionSafe();

  return (
    <section
      id="news"
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
            {copy.news.eyebrow}
          </ScrambleText>
        </span>
        <SplitText
          as="h2"
          by="char"
          className="mt-4 font-display text-3xl tracking-tight text-bg sm:text-4xl"
        >
          {copy.news.title}
        </SplitText>
        <p className="reveal mt-5 text-base leading-relaxed text-bg/75 sm:text-[17px]">
          {withMark(copy.news.lead, "新機能")}
        </p>

        {/* 告知リスト（新しい順）。時系列の履歴なので ol。 */}
        <ol className="lit-top reveal mt-12 overflow-hidden rounded-card border border-border bg-panel/90 shadow-[0_1px_2px_rgba(22,24,29,0.04),0_18px_48px_-28px_rgba(22,24,29,0.20)]">
          {ITEMS.map((item, i) => (
            <NewsRow key={item.date + item.title} item={item} index={i} reduce={reduce} />
          ))}
        </ol>
      </div>
    </section>
  );
}
