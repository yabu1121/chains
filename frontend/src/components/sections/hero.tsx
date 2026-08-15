"use client";

import { useRef } from "react";
import Image from "next/image";
import { motion, useScroll, useTransform } from "framer-motion";
import { useReveal } from "../book/use-press-entrance";
import { PRESS_SPRING } from "../book/motion";
import { ScrambleText } from "../motion/scramble-text";
import { useReducedMotionSafe } from "../motion/use-reduced-motion-safe";
import { withMark } from "../motion/mark";
import { Name3D } from "../motion/name-3d";
import { FlowLine } from "../motion/flow-line";
import copy from "@/content/copy.json";

// 3D ネットワークはページ全体の固定背景（Network3DBackground / page.tsx）に移管。
// ヒーローはその背景を透かし、自前の scrim / glow で前景を読ませる。

// ── 漂う mono ラベル群（装飾） ────────────────────────────────────────────
// 3D グラフの前景に、handle + 言語だけの小さな mono チップをゆっくり漂わせて
// 「ノード＝エンジニア」の気配を足す。フィード投稿の捏造を避けるため文章は持たせない。
// 位置は決定的（SSR 安全）、transform/opacity のみ、framer-motion の無限ループで常在。
// pointer-events-none・aria-hidden。前景コピー（左の max-w-2xl 帯）の裏に重ねないよう
// 配置は画面の縁・右側に寄せ、不透明度も淡く保つ。
type FloatLabel = {
  handle: string;
  lang: string;
  // 配置（%）。左帯のコピーを避けるため右寄り・縁に置く。
  left: number;
  top: number;
  // 漂う変位（px）と位相。
  dx: number;
  dy: number;
  dur: number;
  delay: number;
  o: number; // 上限不透明度（淡く）
};

const FLOAT_LABELS: ReadonlyArray<FloatLabel> = [
  { handle: "rin", lang: "Go", left: 72, top: 18, dx: 14, dy: -18, dur: 11, delay: 0, o: 0.5 },
  { handle: "kab", lang: "Rust", left: 86, top: 40, dx: -16, dy: 12, dur: 13, delay: -3.5, o: 0.42 },
  { handle: "nao", lang: "TS", left: 64, top: 62, dx: 12, dy: 16, dur: 12, delay: -6, o: 0.46 },
  { handle: "yui", lang: "Python", left: 82, top: 74, dx: -12, dy: -14, dur: 14, delay: -2, o: 0.38 },
  { handle: "sho", lang: "Elixir", left: 91, top: 22, dx: -10, dy: 18, dur: 12.5, delay: -8, o: 0.4 },
  { handle: "mei", lang: "SQL", left: 58, top: 32, dx: 16, dy: -12, dur: 13.5, delay: -5, o: 0.34 },
];

function FloatingLabels({ reduced }: { reduced: boolean }) {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 z-0 hidden overflow-hidden sm:block"
    >
      {FLOAT_LABELS.map((l) => (
        <motion.span
          key={l.handle}
          className="absolute inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-white/20 bg-white/10 px-2.5 py-1 font-mono text-[11px] tracking-[0.04em] text-bg/80"
          style={{
            left: `${l.left}%`,
            top: `${l.top}%`,
            opacity: l.o,
            willChange: "transform, opacity",
          }}
          // 軽量化: ヒーローが画面内のときだけ漂わせる（オフスクリーンで停止）
          whileInView={
            reduced
              ? undefined
              : {
                  x: [0, l.dx, 0],
                  y: [0, l.dy, 0],
                  opacity: [l.o * 0.55, l.o, l.o * 0.55],
                }
          }
          viewport={{ once: false, amount: 0 }}
          transition={
            reduced
              ? undefined
              : {
                  duration: l.dur,
                  delay: l.delay,
                  repeat: Infinity,
                  ease: "easeInOut",
                }
          }
        >
          <span className="text-bg/90">@{l.handle}</span>
          <span className="h-2.5 w-px bg-white/25" />
          <span className="text-[#cfe1fb]">{l.lang}</span>
        </motion.span>
      ))}
    </div>
  );
}

export default function Hero() {
  const prefersReduced = useReducedMotionSafe();
  // 前景コピーの段階リビール（anime.js）。.reveal を子に振る。
  const revealRef = useReveal<HTMLDivElement>({ y: 16, stagger: 90 });

  // スクロール連動: ヒーローを抜ける間にグラフと前景を視差で動かす
  const sectionRef = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ["start start", "end start"],
  });
  const copyY = useTransform(scrollYProgress, [0, 1], [0, -70]);
  const copyOpacity = useTransform(scrollYProgress, [0, 0.55], [1, 0]);

  return (
    <section
      id="top"
      ref={sectionRef}
      className="relative isolate flex min-h-svh flex-col overflow-hidden"
    >
      {/* 背景の 3D 網はページ全体の固定背景（page.tsx の Network3DBackground）。
          ヒーローはそれを透かし、下の scrim / 右の glow で前景を読ませる。 */}

      {/* 右側の光ブルームは全セクション固定の背景（Network3DBackground / page.tsx）へ移管。 */}

      {/* 流れる点線（装飾）。網に走る信号のように、ところどころに。 */}
      <FlowLine className="absolute bottom-24 left-6 -z-[5] h-2 w-44 text-[#cfe1fb] opacity-60 sm:left-12" />

      {/* 前景可読性の scrim はオーナー指示で撤去。固定背景（3D＋光＋地色）がそのまま透ける。 */}

      {/* 漂う mono ラベル群（装飾）。graph と copy の間（z-0）。reduced で静止。 */}
      <FloatingLabels reduced={prefersReduced} />

      {/* ヘッダー */}
      <header className="relative z-10 flex items-center justify-between px-6 pt-8 sm:px-12 sm:pt-10">
        <Name3D
          text={copy.brand.name}
          className="font-mono text-lg font-medium tracking-tight text-bg"
        />
        <ScrambleText
          as="p"
          className="font-mono text-[11px] tracking-[0.16em] text-bg/70"
        >
          {copy.brand.eyebrow}
        </ScrambleText>
      </header>

      {/* 前景コピー — 左寄せ。スクロールで上へ抜けながらフェード。 */}
      <motion.div
        ref={revealRef}
        style={prefersReduced ? undefined : { y: copyY, opacity: copyOpacity }}
        className="relative z-10 flex flex-1 flex-col justify-center px-6 py-12 sm:px-12"
      >
        <div className="max-w-2xl">
          <h1 className="font-mono text-[clamp(2.5rem,8vw,5.5rem)] font-medium leading-[1.05] tracking-tight text-bg">
            {/* 見出し（「つながりが、」「そのまま地図になる。」）はロゴ一枚に置き換え（オーナー指示）。
                ロゴは明るい地用で暗い地だと読めないため、背後にだけ柔らかい光のにじみを敷く。 */}
            <motion.span
              className="relative mb-3 inline-block"
              initial={prefersReduced ? false : { opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
            >
              <span
                aria-hidden
                className="pointer-events-none absolute -inset-6 rounded-[2.5rem] blur-[28px] [background:radial-gradient(ellipse_at_center,rgba(250,248,244,0.9),rgba(250,248,244,0.36)_58%,transparent_80%)]"
              />
              <Image
                src="/chains-logo.png"
                alt="chains"
                width={493}
                height={307}
                priority
                className="relative h-auto w-[min(82%,400px)]"
              />
            </motion.span>
          </h1>

          <p className="reveal mt-6 max-w-md text-base leading-relaxed text-bg/75 sm:text-lg">
            {withMark(copy.hero.subcopy, "ネットワーク")}
          </p>

          {/* CTA 行 */}
          <div className="reveal mt-9 flex flex-wrap items-center gap-x-6 gap-y-4">
            <motion.a
              href="#cta"
              whileHover={{ y: -2 }}
              whileTap={{ y: 1, scale: 0.985 }}
              transition={PRESS_SPRING}
              className="inline-flex items-center justify-center rounded-card bg-bg px-8 py-3.5 text-sm font-medium text-accent shadow-[0_6px_28px_-4px_rgba(207,225,251,0.45)] transition-shadow hover:bg-white hover:shadow-[0_10px_40px_-4px_rgba(207,225,251,0.7)]"
            >
              {copy.hero.cta}
            </motion.a>
            <p className="font-mono text-[11px] tracking-[0.14em] text-bg/70">
              {copy.hero.ctaNote}
            </p>
          </div>

          {/* 補助リンク */}
          <a
            href="#how"
            className="reveal mt-7 inline-block font-mono text-xs tracking-[0.14em] text-bg underline decoration-white/30 underline-offset-[6px] transition-colors hover:decoration-bg"
          >
            {copy.hero.scrollLink}
          </a>
        </div>

        {/* グラフ注記 — aria-hidden な canvas の意味を補うテキスト。 */}
        <p className="reveal mt-12 max-w-md font-mono text-[11px] leading-relaxed tracking-[0.04em] text-bg/70 sm:mt-16">
          {copy.hero.graphNote}
        </p>
      </motion.div>
    </section>
  );
}
