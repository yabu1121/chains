"use client";

import { motion } from "framer-motion";
import { useReducedMotionSafe } from "./use-reduced-motion-safe";

/**
 * AnimatedName — ブランド名を文字ごとに微かに上下させて「生きている」気配を出す。
 * 位相をずらした緩い波。whileInView で見えている間だけ動かす（軽量）。
 * a11y: ラッパに aria-label で語を 1 度だけ読ませ、各文字は aria-hidden。
 * reduced-motion では静止。
 */
export function AnimatedName({
  text,
  className,
}: {
  text: string;
  className?: string;
}) {
  const reduce = useReducedMotionSafe();
  const letters = [...text];
  return (
    <span className={className} aria-label={text}>
      {letters.map((ch, i) => (
        <motion.span
          key={i}
          aria-hidden
          className="inline-block"
          whileInView={reduce ? undefined : { y: [0, -2.5, 0] }}
          viewport={{ once: false, amount: 0 }}
          transition={
            reduce
              ? undefined
              : {
                  duration: 2.4,
                  repeat: Infinity,
                  ease: "easeInOut",
                  delay: i * 0.12,
                }
          }
        >
          {ch === " " ? " " : ch}
        </motion.span>
      ))}
    </span>
  );
}
