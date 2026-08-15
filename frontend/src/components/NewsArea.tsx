"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { NewsFeed } from "./NewsFeed";
import { SavedArticles } from "./SavedArticles";
import { useSavedArticles } from "@/lib/hooks";
import { prefersReducedMotion } from "@/lib/anim";
import { useI18n } from "@/lib/i18n";

type Sub = "feed" | "saved";
const SUBS: Sub[] = ["feed", "saved"];

export function NewsArea() {
  const { t } = useI18n();
  const [sub, setSub] = useState<Sub>("feed");
  const [dir, setDir] = useState(0);
  // Reading-list count for the Saved tab badge.
  const { articles: savedList } = useSavedArticles();
  const reduce = prefersReducedMotion();
  const dist = reduce ? 0 : 24;

  const change = (next: Sub) => {
    setDir(SUBS.indexOf(next) >= SUBS.indexOf(sub) ? 1 : -1);
    setSub(next);
  };

  return (
    <>
      <h1 className="area-title">{t.nav.news}</h1>
      <div className="subtabs" role="tablist">
        {SUBS.map((key) => (
          <button
            key={key}
            role="tab"
            aria-selected={sub === key}
            className={`subtab${sub === key ? " active" : ""}`}
            onClick={() => change(key)}
          >
            {sub === key ? (
              <motion.span
                className="subtab-pill"
                layoutId="news-subtab-pill"
                transition={{ type: "spring", stiffness: 480, damping: 38 }}
              />
            ) : null}
            <span className="subtab-label">{t.news.tabs[key]}</span>
            {key === "saved" && savedList.length > 0 ? (
              <span className="badge">{savedList.length}</span>
            ) : null}
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={sub}
          initial={{ opacity: 0, x: dir >= 0 ? dist : -dist }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: dir >= 0 ? -dist : dist }}
          transition={
            reduce
              ? { duration: 0 }
              : { type: "spring", stiffness: 340, damping: 34, mass: 0.8 }
          }
        >
          {sub === "feed" ? <NewsFeed /> : <SavedArticles />}
        </motion.div>
      </AnimatePresence>
    </>
  );
}
