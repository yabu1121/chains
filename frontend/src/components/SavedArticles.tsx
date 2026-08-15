"use client";

import { useMemo, useState } from "react";
import {
  removeSaved,
  setSavedStatus,
  useSavedArticles,
} from "@/lib/hooks";
import { useReveal } from "@/lib/anim";
import { useI18n } from "@/lib/i18n";
import { toastError } from "@/lib/toast";
import type { SavedArticle } from "@/lib/types";
import { SendCardDialog } from "./SendCardDialog";

function SavedRow({
  a,
  onSend,
}: {
  a: SavedArticle;
  onSend: () => void;
}) {
  const { t } = useI18n();
  const read = a.status === "read";
  return (
    <div className={`news-item${read ? " opacity-60" : ""}`}>
      <div className="news-item-main">
        <a
          className="news-title-link"
          href={a.url}
          target="_blank"
          rel="noopener noreferrer"
        >
          {a.title}
        </a>
        <span className="news-meta">
          {a.source ? <span className="news-source">{a.source}</span> : null}
          {a.language ? <span className="news-lang">{a.language}</span> : null}
        </span>
      </div>
      <div className="news-actions">
        <button
          type="button"
          className="news-act"
          onClick={() =>
            setSavedStatus(a.id, read ? "unread" : "read").catch(() =>
              toastError(t.common.somethingWrong),
            )
          }
        >
          {read ? t.news.markUnread : t.news.markRead}
        </button>
        <button type="button" className="news-act" onClick={onSend}>
          {t.news.sendToFriend}
        </button>
        <button
          type="button"
          className="news-act news-act--muted"
          onClick={() =>
            removeSaved(a.id).catch(() => toastError(t.common.somethingWrong))
          }
        >
          {t.common.remove}
        </button>
      </div>
    </div>
  );
}

export function SavedArticles() {
  const { t } = useI18n();
  const { articles, error, isLoading } = useSavedArticles();
  const cardRef = useReveal<HTMLDivElement>();
  const [cardArticle, setCardArticle] = useState<SavedArticle | null>(null);

  const { unread, read } = useMemo(() => {
    const unread = articles.filter((a) => a.status === "unread");
    const read = articles.filter((a) => a.status === "read");
    return { unread, read };
  }, [articles]);

  return (
    <div className="card" ref={cardRef}>
      <h2 className="section-title">{t.news.savedTitle}</h2>
      {error ? (
        <p className="error">{t.common.couldNotLoad}</p>
      ) : isLoading ? (
        <p className="empty">{t.common.loading}</p>
      ) : articles.length === 0 ? (
        <p className="empty">{t.news.savedEmpty}</p>
      ) : (
        <>
          {unread.length > 0 ? (
            <>
              <div className="muted text-[13px] font-semibold mt-1 mb-1">
                {t.news.toRead}
              </div>
              <div className="news-list mt-0">
                {unread.map((a) => (
                  <SavedRow key={a.id} a={a} onSend={() => setCardArticle(a)} />
                ))}
              </div>
            </>
          ) : null}
          {read.length > 0 ? (
            <>
              <div className="muted text-[13px] font-semibold mt-4 mb-1">
                {t.news.alreadyRead}
              </div>
              <div className="news-list mt-0">
                {read.map((a) => (
                  <SavedRow key={a.id} a={a} onSend={() => setCardArticle(a)} />
                ))}
              </div>
            </>
          ) : null}
        </>
      )}

      {cardArticle ? (
        <SendCardDialog
          prefill={{
            type: "article",
            article_url: cardArticle.url,
            article_title: cardArticle.title,
            topic: cardArticle.title,
            tags: cardArticle.language ? [cardArticle.language] : [],
          }}
          onClose={() => setCardArticle(null)}
        />
      ) : null}
    </div>
  );
}
