"use client";

import { useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { BridgeInfo } from "@/lib/hooks";
import { useI18n } from "@/lib/i18n";
import { prefersReducedMotion } from "@/lib/anim";

// How long the celebration stays before auto-dismissing.
const VISIBLE_MS = 6000;

// Easing shared with the app's card entrance, so this feels native.
const EASE = [0.2, 0.7, 0.2, 1] as const;

/**
 * BridgeToast celebrates the moment an accepted friend request joined two
 * previously-separate clusters of the network — see detectBridge on the
 * backend. Render it once near the top of a view and pass the BridgeInfo that
 * accepting a request returned (or null to hide it).
 */
export function BridgeToast({
  bridge,
  onDismiss,
}: {
  bridge: BridgeInfo | null;
  onDismiss: () => void;
}) {
  const { t } = useI18n();
  const reduce = prefersReducedMotion();

  // Auto-dismiss after a few seconds. The timer resets whenever a new bridge
  // arrives (a fresh object identity), so back-to-back accepts each get their
  // full moment.
  useEffect(() => {
    if (!bridge) return;
    const id = setTimeout(onDismiss, VISIBLE_MS);
    return () => clearTimeout(id);
  }, [bridge, onDismiss]);

  return (
    <AnimatePresence>
      {bridge ? (
        <motion.div
          className="bridge-toast"
          role="status"
          aria-live="polite"
          onClick={onDismiss}
          initial={reduce ? false : { opacity: 0, y: 22, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={reduce ? { opacity: 0 } : { opacity: 0, y: 22, scale: 0.97 }}
          transition={{ duration: 0.36, ease: EASE }}
        >
          <BridgeMark reduce={reduce} />
          <p className="bridge-toast__title">{t.bridge.title}</p>
          <p className="bridge-toast__body">
            {t.bridge.body(bridge.your_side, bridge.their_side)}
          </p>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

/**
 * Two ink nodes joined by an indigo link that draws itself in — a tiny diagram
 * of the chain that was just closed. Decorative; the figures live in the text.
 */
function BridgeMark({ reduce }: { reduce: boolean }) {
  return (
    <svg
      className="bridge-toast__mark"
      viewBox="0 0 76 36"
      width="76"
      height="36"
      aria-hidden="true"
    >
      <motion.line
        x1="18"
        y1="18"
        x2="58"
        y2="18"
        stroke="var(--accent)"
        strokeWidth="3.5"
        strokeLinecap="round"
        initial={reduce ? false : { pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 0.55, delay: 0.18, ease: "easeOut" }}
      />
      <circle cx="18" cy="18" r="9.5" fill="var(--ink)" />
      <circle cx="58" cy="18" r="9.5" fill="var(--ink)" />
    </svg>
  );
}
