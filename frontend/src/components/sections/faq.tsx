"use client";

/**
 * FAQ — 実機能の問答（アコーディオン）。
 * 仕様の出典: docs/design-direction.md §5-6 / docs/copy.md §7（問・答は一字一句）。
 *
 * デザインシステムは本体 chains 準拠の新トークン（globals.css @theme）:
 *   bg-bg / bg-panel / border-border / text-ink / text-muted / text-accent /
 *   rounded-card。書体は全て JetBrains Mono 基調（問もモノ、答は本文活字）。
 *
 * モーション:
 *   入場 = useReveal（anime.js）。section に ref、見出しに .reveal。
 *   各 Q = スクロール連動の stagger リビール（framer-motion）。行ごとに自分の
 *     通過進捗で opacity 0→1 + y 24→0 に着地し、上から順に立ち上がって見える。
 *   開閉 = framer-motion（height/opacity）。useReducedMotion 時は duration 0 で即時。
 *   開閉トグルは mono の +/−（回転で − に寄せる）。絵文字は使わない。
 *   transform/opacity 優先・prefers-reduced-motion 厳守（reduce 時は静的可視）。
 *
 * a11y:
 *   - 問はネイティブ <button>。aria-expanded / aria-controls。
 *   - 答領域は role="region" + aria-labelledby（問の id）+ 対応 id（aria-controls 先）。
 *   - キーボード操作可・focus-visible は globals.css の outline が効く。
 *   - 複数同時開閉を許可（排他にしない）。
 */

import { useId, useRef, useState } from "react";
import {
  AnimatePresence,
  motion,
  useReducedMotion,
  useScroll,
  useTransform,
} from "framer-motion";
import { useReveal } from "../book/use-press-entrance";
import { SplitText } from "../motion/split-text";
import { ScrambleText } from "../motion/scramble-text";
import { useMounted } from "../motion/use-mounted";
import copy from "@/content/copy.json";

type QA = {
  q: string;
  a: string;
};

// 問・答は src/content/copy.json（faq.items）で一元管理。
const FAQ_ITEMS: ReadonlyArray<QA> = copy.faq.items;

function FaqRow({ item }: { item: QA }) {
  const [open, setOpen] = useState(false);
  const prefersReduced = useReducedMotion() ?? false;
  const baseId = useId();
  const questionId = `${baseId}-q`;
  const answerId = `${baseId}-a`;

  // 各行が自分の通過進捗でリビール。行 ref に紐づけ、下端から立ち上げる。
  // 行は縦に積むので、上の行ほど先に進捗が満ちる → 自然な stagger になる。
  const rowRef = useRef<HTMLLIElement>(null);
  const { scrollYProgress } = useScroll({
    target: rowRef,
    offset: ["start 0.95", "start 0.62"],
  });
  const opacity = useTransform(scrollYProgress, [0, 1], [0, 1], { clamp: true });
  const y = useTransform(scrollYProgress, [0, 1], [24, 0], { clamp: true });

  // SSR とクライアント初回描画を一致させるため、スクロール連動の style は
  // マウント後にだけ当てる（MotionValue 由来の transform 文字列の不一致を避ける）。
  const ready = useMounted();

  return (
    <motion.li
      ref={rowRef}
      style={ready && !prefersReduced ? { opacity, y } : undefined}
      className="border-b border-border last:border-b-0"
    >
      <h3 className="m-0">
        <button
          type="button"
          id={questionId}
          aria-expanded={open}
          aria-controls={answerId}
          onClick={() => setOpen((v) => !v)}
          className="group flex w-full items-start justify-between gap-5 py-5 text-left
            sm:py-6"
        >
          <span className="font-mono text-base leading-snug tracking-tight text-ink sm:text-lg">
            {item.q}
          </span>
          {/* 開閉インジケータ — mono の十字。open 時に 45° 回して − に寄せる。 */}
          <motion.span
            aria-hidden
            animate={{ rotate: open ? 45 : 0 }}
            transition={
              prefersReduced
                ? { duration: 0 }
                : { type: "spring", stiffness: 420, damping: 28 }
            }
            className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center
              font-mono text-xl leading-none text-accent
              transition-colors group-hover:text-accent-press"
          >
            +
          </motion.span>
        </button>
      </h3>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key="content"
            role="region"
            aria-labelledby={questionId}
            id={answerId}
            initial={prefersReduced ? false : { height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={prefersReduced ? { opacity: 0 } : { height: 0, opacity: 0 }}
            transition={
              prefersReduced
                ? { duration: 0 }
                : {
                    height: { duration: 0.32, ease: [0.22, 1, 0.36, 1] },
                    opacity: { duration: 0.22, ease: "easeOut" },
                  }
            }
            className="overflow-hidden"
          >
            <p className="max-w-2xl pb-6 pr-9 text-[15px] leading-relaxed text-muted sm:text-base">
              {item.a}
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.li>
  );
}

export default function Faq() {
  const sectionRef = useReveal<HTMLElement>();

  return (
    <section
      id="faq"
      ref={sectionRef}
      className="relative px-6 py-24 sm:px-10 sm:py-28 lg:px-14"
    >
      <div className="mx-auto w-full max-w-3xl">
        {/* 見出しブロック */}
        <div className="max-w-2xl">
          <span aria-hidden>
            <ScrambleText
              as="p"
              className="font-mono text-xs uppercase tracking-[0.22em] text-[#cfe1fb]"
            >
              {copy.faq.eyebrow}
            </ScrambleText>
          </span>
          <SplitText
            as="h2"
            by="char"
            className="mt-4 font-display text-3xl tracking-tight text-bg sm:text-4xl"
          >
            {copy.faq.title}
          </SplitText>
        </div>

        {/* 問答。複数同時開閉可（各行が独立 state）。hairline 罫で区切る。
            リビールは各行が自前のスクロール進捗で行う（ul は .reveal しない）。 */}
        <ul className="lit-top mt-12 rounded-card border border-border bg-panel px-6 sm:mt-14 sm:px-8">
          {FAQ_ITEMS.map((item) => (
            <FaqRow key={item.q} item={item} />
          ))}
        </ul>
      </div>
    </section>
  );
}
