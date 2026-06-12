"use client";

import dynamic from "next/dynamic";
import { useReducedMotionSafe } from "../motion/use-reduced-motion-safe";

// 3D ネットワーク（R3F）。WebGL/SSR を避けるため ssr:false（Client Component 内なので許容）。
const Network3D = dynamic(() => import("./network-3d"), { ssr: false });

/**
 * Network3DBackground — ヒーローの 3D 網を「ページ全体の固定背景」として常時表示する。
 * `fixed inset-0 -z-10` で全セクションの背後に置き、スクロールしても見え続ける。
 * pointer-events-none でコンテンツのクリックを妨げない（3D のポインタ追従は window の
 * pointermove で駆動するため無効化されない）。reduced / WebGL 非対応は Network3D 側で
 * 静止フォールバック（藍の星座 SVG）。
 *
 * 規範補足: 本来 WebGL はヒーロー限定だが、オーナー指示で全面背景に格上げ。
 */
export function Network3DBackground() {
  const reduced = useReducedMotionSafe();
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10">
      <Network3D reducedMotion={reduced} className="h-full w-full" />
      {/* 背景の左右の濃淡（右ほど少し濃い＝暗い）。ほんの少しだけ。縦方向は均一なので
          スクロールしてもセクションのつなぎ目で色が変わらない。AI メッシュではなく単色。 */}
      <div className="absolute inset-0 [background:linear-gradient(to_right,transparent_38%,rgba(8,15,30,0.20))]" />
    </div>
  );
}
