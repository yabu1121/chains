/**
 * モーションの共有トークン（docs/design-direction.md §5）。
 * 「印圧スプリング」は CTA・開閉などインタラクションの質感を一冊で揃えるためのもの。
 */

/** 印圧スプリング — whileHover/whileTap の触り心地。少しオーバーシュートしてバウンスする。
 *  framer-motion の transition に渡す。 */
export const PRESS_SPRING = {
  type: "spring",
  stiffness: 400,
  damping: 15,
} as const;

/** 入場スプリング — whileInView/animate の登場でぽんっと弾む（バウンス）。
 *  低めの damping + やや重い mass で 1 回オーバーシュートして収まる。 */
export const ENTER_SPRING = {
  type: "spring",
  stiffness: 300,
  damping: 15,
  mass: 0.9,
} as const;
