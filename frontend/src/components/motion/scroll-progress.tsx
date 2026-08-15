"use client";

import { motion, useScroll, useSpring } from "framer-motion";

/**
 * ページ上端のスクロール進捗バー（藍の細線）。
 * framer-motion の useScroll を spring で滑らかに追従させる。
 * reduced-motion は MotionConfig（layout）で transform 変化が抑制される。
 */
export default function ScrollProgress() {
  const { scrollYProgress } = useScroll();
  const scaleX = useSpring(scrollYProgress, {
    stiffness: 120,
    damping: 30,
    mass: 0.3,
  });

  return (
    <motion.div
      aria-hidden
      style={{ scaleX }}
      className="fixed inset-x-0 top-0 z-50 h-0.5 origin-left bg-accent"
    />
  );
}
