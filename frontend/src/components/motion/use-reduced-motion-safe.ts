"use client";

import { useReducedMotion } from "framer-motion";
import { useMounted } from "./use-mounted";

/**
 * SSR ハイドレーション安全な reduced-motion 判定。
 * サーバーは reduced を検知できないため、SSR と「クライアント初回描画」は常に
 * false（＝モーション有り）を返して一致させ、マウント後に実際の設定へ切り替える。
 * これで「reduced 時に SSR だけモーション style を出力して食い違う」不一致を防ぐ。
 */
export function useReducedMotionSafe(): boolean {
  const reduced = useReducedMotion() ?? false;
  const mounted = useMounted();
  return mounted ? reduced : false;
}
