"use client";

/**
 * ScreenCarousel — デバイス枠（ブラウザ窓 / スマホベゼル）を「丸ごと」横にスライドさせる
 * スライドショー。アクティブな枠を中央に置き、両隣の画面も左右に覗く（ピーク／カバーフロー）。
 *
 * 操作:
 *   - 自動再生（進行バーが満ちると次の画面へ）。ホバー / フォーカス / ドラッグ中は一時停止。
 *   - 横スワイプ / ドラッグ、矢印ボタン、ドットでも移動。
 *   - prefers-reduced-motion では自動送り・遷移アニメを止め即時切替（操作は可能）。
 *
 * 役割分担: インタラクション = framer-motion。入場（枠のせり上がり）は親 showcase の anime.js。
 *
 * a11y: role=group / aria-roledescription。矢印・ドットは button。現在ラベルは aria-live。
 *   非アクティブのスライドは aria-hidden。
 */

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { motion, useMotionValue, type PanInfo } from "framer-motion";
import { useReducedMotionSafe } from "./use-reduced-motion-safe";

export type Screen = {
  src: string;
  alt: string;
  label: string;
  url?: string;
};

const GAP = 28; // 枠と枠の間隔（px）

export function ScreenCarousel({
  screens,
  variant,
  sizes,
  intervalMs = 5200,
}: {
  screens: ReadonlyArray<Screen>;
  variant: "browser" | "phone";
  sizes: string;
  /** 各スライドの表示時間（進行バーが満ちるまで）。 */
  intervalMs?: number;
}) {
  const reduce = useReducedMotionSafe();
  const n = screens.length;
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [vw, setVw] = useState(0);
  const viewportRef = useRef<HTMLDivElement>(null);
  const x = useMotionValue(0);

  // ビューポート全幅を測る。1 枚の枠幅と中央寄せオフセットをここから計算する。
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setVw(el.clientWidth));
    ro.observe(el);
    setVw(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  // 枠幅: 最大値とビューポートの 84% の小さい方（両隣を覗かせる余白を残す）。
  // フルブリード（画面横いっぱい）で映えるよう、広い画面では枠を大きめに。
  const maxFrame = variant === "browser" ? 760 : 330;
  const frameW = vw > 0 ? Math.min(maxFrame, vw * 0.84) : maxFrame;
  const stride = frameW + GAP;

  const goTo = useCallback((i: number) => setIndex(((i % n) + n) % n), [n]);

  // 各スライドの位置は「現在からの最短相対オフセット」で決める（ループ）。
  // 例: index=0 のとき最後の画面は rel=-1 となり、先頭の「左隣」に回り込む。
  const relOffset = useCallback(
    (i: number) => {
      let rel = i - index;
      if (rel > n / 2) rel -= n;
      if (rel < -n / 2) rel += n;
      return rel;
    },
    [index, n],
  );

  // 位置は CSS transform（relOffset）で決める。x はドラッグ追従専用（離すと 0 に戻る）。
  // 自動送りは進行バーの onAnimationEnd。

  const onDragEnd = (_e: unknown, info: PanInfo) => {
    const { offset, velocity } = info;
    if (offset.x < -stride * 0.18 || velocity.x < -480) goTo(index + 1);
    else if (offset.x > stride * 0.18 || velocity.x > 480) goTo(index - 1);
    else goTo(index);
    setPaused(false);
  };

  const current = screens[index];

  return (
    <div
      role="group"
      aria-roledescription="カルーセル"
      aria-label="chains アプリの画面"
      className="relative w-full"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
    >
      {/* 全幅ビューポート。アクティブ枠を中央に、両隣（と回り込んだ最後/最初）が左右に覗く。 */}
      <div ref={viewportRef} className="relative w-full overflow-hidden">
        {/* 高さ確保の不可視スペーサ（アクティブ枠と同寸）。スライドは絶対配置で重ねる。 */}
        <div
          aria-hidden
          className="invisible mx-auto"
          style={{ width: frameW }}
        >
          <DeviceFrame variant={variant} screen={current} sizes={sizes} priority={false} />
        </div>

        {/* スライド層: ドラッグで全体が指追従、離すと原点へ戻る（dragSnapToOrigin）。
            各スライドの位置は relOffset の CSS transform で決まり、index 変化で滑らかに回る。 */}
        <motion.div
          className="absolute inset-0 cursor-grab active:cursor-grabbing"
          style={{ x }}
          drag={n > 1 ? "x" : false}
          dragSnapToOrigin
          dragElastic={0.55}
          dragConstraints={{ left: 0, right: 0 }}
          onDragStart={() => setPaused(true)}
          onDragEnd={onDragEnd}
        >
          {screens.map((s, i) => {
            const rel = relOffset(i);
            const active = rel === 0;
            const dist = Math.abs(rel);
            return (
              <div
                key={s.src}
                onClick={active ? undefined : () => goTo(i)}
                aria-hidden={!active}
                className={
                  "absolute left-1/2 top-0 transition-[transform,opacity] duration-500 ease-out " +
                  (active ? "" : "cursor-pointer")
                }
                style={{
                  width: frameW,
                  transform: `translateX(calc(-50% + ${rel * stride}px)) scale(${active ? 1 : 0.9})`,
                  transformOrigin: "bottom center",
                  opacity: active ? 1 : dist === 1 ? 0.42 : 0.16,
                  zIndex: 20 - dist,
                  pointerEvents: dist <= 2 ? "auto" : "none",
                  transitionDuration: reduce ? "0ms" : undefined,
                }}
              >
                <DeviceFrame variant={variant} screen={s} sizes={sizes} priority={i === 0} />
              </div>
            );
          })}
        </motion.div>
      </div>

      {/* 進行バー（スライドショーの自動送り）。満ちたら次へ。reduced / 単一画面では出さない。 */}
      {!reduce && n > 1 && (
        <div
          aria-hidden
          className="mx-auto mt-6 h-0.5 w-28 overflow-hidden rounded-full bg-bg/20"
        >
          <div
            key={index}
            onAnimationEnd={() => goTo(index + 1)}
            style={{
              animationName: "slideshow-fill",
              animationDuration: `${intervalMs}ms`,
              animationTimingFunction: "linear",
              animationFillMode: "forwards",
              animationPlayState: paused ? "paused" : "running",
            }}
            className="h-full w-full origin-left bg-bg/80"
          />
        </div>
      )}

      {/* コントロール: 矢印 + ドット + 現在ラベル。 */}
      <div className="mt-5 flex items-center justify-center gap-4">
        <CarouselButton label="前の画面" onClick={() => goTo(index - 1)} dir="prev" />
        <div className="flex items-center gap-2" role="tablist" aria-label="画面を選ぶ">
          {screens.map((s, i) => (
            <button
              key={s.src}
              type="button"
              role="tab"
              aria-selected={i === index}
              aria-label={`${i + 1}枚目: ${s.label}`}
              onClick={() => goTo(i)}
              className={
                "h-2 rounded-full transition-all duration-300 " +
                (i === index ? "w-6 bg-bg" : "w-2 bg-bg/40 hover:bg-bg/70")
              }
            />
          ))}
        </div>
        <CarouselButton label="次の画面" onClick={() => goTo(index + 1)} dir="next" />
      </div>

      <p aria-live="polite" className="mt-3 text-center text-sm text-bg/85">
        <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-bg/55">
          {String(index + 1).padStart(2, "0")} / {String(n).padStart(2, "0")}
        </span>
        <span aria-hidden className="mx-2 text-bg/30">
          ·
        </span>
        {current.label}
      </p>
    </div>
  );
}

// ── デバイス枠（chrome + 実画面）。枠は親（スライド）幅いっぱい。 ───────────────

function DeviceFrame({
  variant,
  screen,
  sizes,
  priority,
}: {
  variant: "browser" | "phone";
  screen: Screen;
  sizes: string;
  priority: boolean;
}) {
  if (variant === "browser") {
    return (
      <div className="w-full overflow-hidden rounded-card border border-border bg-panel shadow-[0_2px_4px_rgba(10,18,38,0.18),0_30px_70px_-28px_rgba(10,18,38,0.55),inset_0_1px_0_rgba(255,255,255,0.7)]">
        <div
          aria-hidden
          className="flex items-center gap-3 border-b border-border bg-panel-2 px-4 py-2.5"
        >
          <div className="flex gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-border" />
            <span className="h-2.5 w-2.5 rounded-full bg-border" />
            <span className="h-2.5 w-2.5 rounded-full bg-border" />
          </div>
          <div className="flex flex-1 items-center justify-center">
            <span className="max-w-full truncate rounded-[7px] border border-border bg-panel px-3 py-1 font-mono text-[11px] text-muted">
              {screen.url ?? "chains.app"}
            </span>
          </div>
          <div className="w-[42px]" />
        </div>
        <div className="relative w-full bg-bg" style={{ aspectRatio: "16 / 10" }}>
          <Image
            src={screen.src}
            alt={screen.alt}
            fill
            sizes={sizes}
            priority={priority}
            draggable={false}
            className="pointer-events-none select-none object-cover object-top"
          />
        </div>
      </div>
    );
  }
  return (
    <div className="w-full rounded-[2.6rem] border-[3px] border-ink bg-ink p-1.5 shadow-[0_2px_4px_rgba(10,18,38,0.22),0_36px_80px_-22px_rgba(10,18,38,0.6),inset_0_1.5px_0_rgba(255,255,255,0.18)]">
      <div
        className="relative overflow-hidden rounded-[2.2rem] bg-bg"
        style={{ aspectRatio: "1170 / 2532" }}
      >
        <Image
          src={screen.src}
          alt={screen.alt}
          fill
          sizes={sizes}
          priority={priority}
          draggable={false}
          className="pointer-events-none select-none object-cover object-top"
        />
      </div>
    </div>
  );
}

function CarouselButton({
  label,
  onClick,
  dir,
}: {
  label: string;
  onClick: () => void;
  dir: "prev" | "next";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="flex h-9 w-9 items-center justify-center rounded-full border border-white/25 bg-white/10 text-bg transition-colors hover:bg-white/20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bg"
    >
      <svg
        viewBox="0 0 24 24"
        className="h-4 w-4"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        {dir === "prev" ? <path d="M15 18l-6-6 6-6" /> : <path d="M9 18l6-6-6-6" />}
      </svg>
    </button>
  );
}
