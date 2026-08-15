"use client";

import { useSyncExternalStore } from "react";

/**
 * SSR ハイドレーション安全な「マウント済みか」判定。
 * サーバーと「クライアント初回描画（ハイドレーション）」は false、コミット後に true。
 * useEffect + setState のマウントフラグ（cascading render を誘発し eslint
 * react-hooks/set-state-in-effect に触れる）の置き換え。useSyncExternalStore は
 * server snapshot を SSR/ハイドレーション時に、client snapshot をコミット後に返す。
 */
const emptySubscribe = () => () => {};

export function useMounted(): boolean {
  return useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false,
  );
}
