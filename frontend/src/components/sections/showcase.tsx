"use client";

/**
 * Showcase（the app） — ページの藍の地をそのまま「舞台」にして、本体 chains の実画面を
 * 大きなデバイス枠＋横スクロールのスライドショーで見せる。読み物の紙カード群とは対照的に、
 * ここだけ藍を開けて白いデバイスを浮かせる（編集的なリズム）。背面の網平面も藍の上で覗く。
 *
 * 画面素材は本体アプリ（/home/yabu1121/prog/wip/chains）を起動し Playwright で API を
 * モックして撮影した実スクリーンショット（public/showcase/app-*-desktop|mobile.png）。
 *   - デスクトップ枠: フレンド一覧 → ネットワーク → 公開プロフィール
 *   - スマホ枠: 公開プロフィール → フレンド一覧 → QR
 * 枠（ブラウザのタイトルバー / スマホのベゼル）と操作（スワイプ・矢印・ドット・自動送り）は
 * ScreenCarousel が担う。
 *
 * モーション:
 *   入場 = anime.js。進入 1 回で デスクトップ枠 → スマホ枠 の順にせり上がる（非バウンス）。
 *   スライド送り・スワイプ = framer-motion（ScreenCarousel 内）。
 *   transform / opacity のみ。prefers-reduced-motion で入場・自動送りを無効（操作は可能）。
 *
 * a11y: 全体を figure として aria-label。カルーセルは内部で role=group・矢印/ドット button・
 *   現在ラベルの aria-live を持つ。藍 #2d4f7c に対する紙色テキストは AA を満たす。
 */

import { useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { createTimeline } from "animejs";
import { useReducedMotionSafe } from "../motion/use-reduced-motion-safe";
import { ScreenCarousel, type Screen } from "../motion/screen-carousel";
import { withMark } from "../motion/mark";
import copy from "@/content/copy.json";

// 実スクリーンショット（純データなので copy.json ではなくここに置く）。
const DESKTOP_SCREENS: ReadonlyArray<Screen> = [
  {
    src: "/showcase/app-friends-desktop.png",
    alt: "chains のフレンド一覧画面。サイドバー（フレンド／ネットワーク／ニュース／設定）と承認済みのフレンド一覧。",
    label: "フレンド一覧",
    url: "chains.app/friends",
  },
  {
    src: "/showcase/app-requests-desktop.png",
    alt: "chains のフレンド申請画面。受け取った申請（承認 / 拒否）と、自分が送った申請（キャンセル）の一覧。",
    label: "フレンド申請",
    url: "chains.app/requests",
  },
  {
    src: "/showcase/app-network-desktop.png",
    alt: "chains のネットワークグラフ画面。ノードがユーザー、線がフレンド関係を表す力学グラフ。",
    label: "ネットワーク",
    url: "chains.app/network",
  },
  {
    src: "/showcase/app-profile-desktop.png",
    alt: "chains の公開プロフィール画面。表示名・職種・登録言語・公開範囲つきリンク・フレンド申請。",
    label: "公開プロフィール",
    url: "chains.app/u/yuki",
  },
  {
    src: "/showcase/app-qr-desktop.png",
    alt: "chains の QR / さがす画面。自分の QR コードと、名前や言語で人を探す検索。",
    label: "QR でつながる",
    url: "chains.app/add",
  },
  {
    src: "/showcase/app-settings-desktop.png",
    alt: "chains の設定画面。プロフィール設定・バージョン履歴・利用規約・プライバシー・言語設定。",
    label: "設定",
    url: "chains.app/settings",
  },
];

const MOBILE_SCREENS: ReadonlyArray<Screen> = [
  {
    src: "/showcase/app-profile-mobile.png",
    alt: "chains の公開プロフィール画面（スマホ）。表示名・職種・登録言語・公開範囲つきリンク・フレンド申請。",
    label: "公開プロフィール",
  },
  {
    src: "/showcase/app-friends-mobile.png",
    alt: "chains のフレンド一覧画面（スマホ）。承認済みのフレンドと言語チップ・下部のタブバー。",
    label: "フレンド一覧",
  },
  {
    src: "/showcase/app-requests-mobile.png",
    alt: "chains のフレンド申請画面（スマホ）。受け取った申請と、自分が送った申請の一覧。",
    label: "フレンド申請",
  },
  {
    src: "/showcase/app-qr-mobile.png",
    alt: "chains の QR 画面（スマホ）。自分の QR コードを相手に読み取ってもらってフレンド申請。",
    label: "QR でつながる",
  },
  {
    src: "/showcase/app-settings-mobile.png",
    alt: "chains の設定画面（スマホ）。プロフィール設定・バージョン履歴・規約・プライバシー・言語設定。",
    label: "設定",
  },
];

export default function Showcase() {
  const reduce = useReducedMotionSafe();
  const sceneRef = useRef<HTMLDivElement>(null);
  const browserRef = useRef<HTMLDivElement>(null);
  const phoneRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const scene = sceneRef.current;
    const browser = browserRef.current;
    const phone = phoneRef.current;
    if (!scene || !browser || !phone) return;

    // reduced: 入場アニメは行わず、確実に可視へ戻す（reduce は初回 false→マウント後 true に
    // 変わるため、直前の非 reduced レンダーで当たった opacity:0 をここで解除する）。
    if (reduce) {
      browser.style.opacity = "1";
      phone.style.opacity = "1";
      return;
    }

    browser.style.opacity = "0";
    phone.style.opacity = "0";

    let started = false;
    const run = () => {
      if (started) return;
      started = true;
      io.disconnect();
      createTimeline({ defaults: { ease: "out(3)" } })
        .add(browser, {
          opacity: [0, 1],
          translateY: [28, 0],
          scale: [0.985, 1],
          duration: 420,
        })
        .add(
          phone,
          {
            opacity: [0, 1],
            translateY: [34, 0],
            scale: [0.965, 1],
            duration: 440,
          },
          "-=260",
        );
    };

    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) run();
      },
      { threshold: 0.15 },
    );
    io.observe(scene);
    return () => io.disconnect();
  }, [reduce]);

  return (
    <section
      id="app"
      className="relative px-6 py-24 text-bg sm:px-10 sm:py-28 lg:px-14"
    >
      <div className="relative z-10 mx-auto w-full max-w-6xl">
        {/* 見出しブロック（藍の地に紙色テキスト） */}
        <div className="max-w-xl">
          <p
            className="font-mono text-xs uppercase tracking-[0.22em] text-bg/65"
            aria-hidden
          >
            {copy.showcase.eyebrow}
          </p>
          <h2 className="mt-4 font-display text-3xl tracking-tight text-bg sm:text-4xl">
            {copy.showcase.title}
          </h2>
          <p className="mt-5 text-base leading-relaxed text-bg/80">
            {withMark(copy.showcase.lead, "スワイプ")}
          </p>
        </div>

        {/* デバイス・シーン。デスクトップ枠スライドショー → スマホ枠スライドショーを
            縦に積み、それぞれ「枠ごと」横スライドする。
            コンテンツ幅を抜けて画面横いっぱい（フルブリード = 100vw）に広げ、
            両隣の画面が大きく左右に覗くようにする。 */}
        <figure
          aria-label="chains アプリの実際の画面（スワイプで切り替えられるスライドショー）"
          className="relative left-1/2 mt-14 w-screen -translate-x-1/2 sm:mt-16"
        >
          <div ref={sceneRef} className="space-y-16 sm:space-y-20">
            {/* ── デスクトップ枠スライドショー（全幅） ── */}
            <motion.div ref={browserRef} className="origin-bottom">
              <ScreenCarousel
                screens={DESKTOP_SCREENS}
                variant="browser"
                sizes="(min-width: 768px) 680px, 88vw"
              />
            </motion.div>

            {/* ── スマホ枠スライドショー（全幅） ── */}
            <motion.div ref={phoneRef} className="origin-bottom">
              <ScreenCarousel
                screens={MOBILE_SCREENS}
                variant="phone"
                sizes="300px"
              />
            </motion.div>
          </div>
        </figure>
      </div>
    </section>
  );
}
