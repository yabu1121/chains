"use client";

import { useMemo, useState } from "react";
import useSWR from "swr";
import { useAuth } from "@/lib/auth";
import {
  getProfile,
  saveArticle,
  useCardInbox,
  useCardsSent,
  useFriendBeacons,
  useFriends,
  useNewsFeed,
  useSavedArticles,
} from "@/lib/hooks";
import { useReveal } from "@/lib/anim";
import { localeFor, useI18n, type Lang } from "@/lib/i18n";
import { toastError } from "@/lib/toast";
import type {
  ConnectionCard,
  NewsArticle,
  NewsReason,
  PublicProfile,
  SavedArticle,
} from "@/lib/types";
import { Select } from "./Select";
import { SendCardDialog } from "./SendCardDialog";

// Brand-ish colours per source so each item is recognisable at a glance.
const SOURCE_COLOR: Record<string, string> = {
  Zenn: "#3EA8FF",
  Qiita: "#55C500",
  "Hacker News": "#FF6600",
  GitHub: "#181717",
};

/** A short, locale-aware "x ago" / date for an article timestamp. */
function whenLabel(
  iso: string,
  news: ReturnType<typeof useI18n>["t"]["news"],
  lang: Lang,
): string {
  if (!iso) return "";
  const ts = new Date(iso).getTime();
  if (Number.isNaN(ts)) return "";
  const mins = Math.round((Date.now() - ts) / 60_000);
  if (mins < 1) return news.relNow;
  if (mins < 60) return news.relMin(mins);
  const hours = Math.round(mins / 60);
  if (hours < 24) return news.relHour(hours);
  const days = Math.round(hours / 24);
  if (days < 7) return news.relDay(days);
  return new Date(ts).toLocaleDateString(localeFor(lang), {
    month: "short",
    day: "numeric",
  });
}

function reasonText(t: ReturnType<typeof useI18n>["t"], r: NewsReason): string {
  const lang = r.language ?? "";
  switch (r.kind) {
    case "language":
      return t.news.reasonLanguage(lang);
    case "friends":
      return t.news.reasonFriends(lang, r.count ?? 0);
    case "saved":
      return t.news.reasonSaved(lang);
    default:
      return "";
  }
}

function ArticleRow({
  a,
  isSaved,
  onSave,
  onHide,
  onSend,
}: {
  a: NewsArticle;
  isSaved: boolean;
  onSave: () => void;
  onHide: () => void;
  onSend: () => void;
}) {
  const { t, lang } = useI18n();
  const color = SOURCE_COLOR[a.source] ?? "var(--muted)";
  return (
    <div className="news-item">
      <div className="news-item-main">
        <a
          className="news-title-link"
          href={a.url}
          target="_blank"
          rel="noopener noreferrer"
        >
          {a.title}
        </a>
        {a.summary ? <span className="news-summary">{a.summary}</span> : null}
        {a.reasons && a.reasons.length > 0 ? (
          <span className="news-reasons">
            {a.reasons.map((r, i) => (
              <span key={i} className="news-reason">
                {reasonText(t, r)}
              </span>
            ))}
          </span>
        ) : null}
        <span className="news-meta">
          <span className="news-source" style={{ color }}>
            {a.source}
          </span>
          {a.language ? <span className="news-lang">{a.language}</span> : null}
          {a.author ? <span className="news-author">@{a.author}</span> : null}
          <span className="news-when">
            {whenLabel(a.published_at, t.news, lang)}
          </span>
        </span>
      </div>
      <div className="news-actions">
        {isSaved ? (
          <span className="news-saved">{t.news.savedTag}</span>
        ) : (
          <button type="button" className="news-act" onClick={onSave}>
            {t.news.save}
          </button>
        )}
        <button type="button" className="news-act" onClick={onSend}>
          {t.news.sendToFriend}
        </button>
        <button
          type="button"
          className="news-act news-act--muted"
          onClick={onHide}
          aria-label={t.news.hide}
          title={t.news.hide}
        >
          {t.news.hide}
        </button>
      </div>
    </div>
  );
}

export function NewsFeed() {
  const { t } = useI18n();
  const { user } = useAuth();
  const cardRef = useReveal<HTMLDivElement>();

  // Pull the caller's registered languages to populate the filter.
  const { data: profile } = useSWR<PublicProfile>(
    user ? `/api/users/${user.id}` : null,
    () => getProfile(user!.id),
  );
  const myLanguages = useMemo(() => profile?.languages ?? [], [profile]);

  const [language, setLanguage] = useState("");
  const [cardArticle, setCardArticle] = useState<NewsArticle | null>(null);
  const { feed, isLoading, error } = useNewsFeed(language);

  // Signals for "who would this article restart a conversation with?" — all
  // already-loaded client data, no extra fetch: friends' languages, their live
  // beacons, and the tags on cards previously exchanged with each of them.
  const { friends } = useFriends();
  const { beacons } = useFriendBeacons();
  const inbox = useCardInbox();
  const sent = useCardsSent();

  const beaconByFriend = useMemo(() => {
    const m = new Map<string, string>();
    for (const b of beacons) if (b.user) m.set(b.user.id, b.message.toLowerCase());
    return m;
  }, [beacons]);

  const tagsByFriend = useMemo(() => {
    const m = new Map<string, Set<string>>();
    const add = (cards: ConnectionCard[]) => {
      for (const c of cards) {
        const pid = c.direction === "sent" ? c.recipient?.id : c.sender?.id;
        if (!pid) continue;
        const set = m.get(pid) ?? new Set<string>();
        for (const tg of c.tags ?? []) set.add(tg.toLowerCase());
        m.set(pid, set);
      }
    };
    add(inbox.cards);
    add(sent.cards);
    return m;
  }, [inbox.cards, sent.cards]);

  // Rule-based recipient suggestions: a language the friend uses scores highest,
  // a beacon mentioning the topic next, and a shared past-card tag is a nudge.
  const suggestFor = (a: NewsArticle): string[] => {
    const lang = (a.language ?? "").toLowerCase();
    if (!lang) return [];
    return friends
      .map((f) => {
        const u = f.user;
        let score = 0;
        if ((u.languages ?? []).some((l) => l.toLowerCase() === lang)) score += 2;
        const bm = beaconByFriend.get(u.id);
        if (bm && bm.includes(lang)) score += 2;
        if (tagsByFriend.get(u.id)?.has(lang)) score += 1;
        return { id: u.id, score };
      })
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5)
      .map((x) => x.id);
  };
  // The full saved set (incl. hidden) lets us mark saved articles and drop
  // hidden ones from the feed.
  const { articles: saved } = useSavedArticles("all");
  const savedByUrl = useMemo(() => {
    const m = new Map<string, SavedArticle>();
    for (const s of saved) m.set(s.url, s);
    return m;
  }, [saved]);

  const visible = useMemo(
    () =>
      (feed?.articles ?? []).filter(
        (a) => savedByUrl.get(a.url)?.status !== "hidden",
      ),
    [feed, savedByUrl],
  );

  const forLine =
    feed && feed.languages.length > 0
      ? t.news.forLanguages(feed.languages.join(", "))
      : t.news.general;

  return (
    <div className="card" ref={cardRef}>
      <div className="flex justify-between items-center gap-2 flex-wrap">
        <p className="section-title m-0">{forLine}</p>
        {myLanguages.length > 0 ? (
          <Select
            value={language}
            onChange={setLanguage}
            ariaLabel={t.news.filterByLanguage}
            options={[
              { value: "", label: t.news.forYou },
              ...myLanguages.map((l) => ({ value: l, label: l })),
            ]}
          />
        ) : null}
      </div>

      {error ? (
        <p className="error">{t.news.couldNotLoad}</p>
      ) : isLoading || !feed ? (
        <p className="empty">{t.common.loading}</p>
      ) : visible.length === 0 ? (
        <p className="empty">{t.news.empty}</p>
      ) : (
        <div className="news-list">
          {visible.map((a) => (
            <ArticleRow
              key={a.url}
              a={a}
              isSaved={!!savedByUrl.get(a.url)}
              onSave={() =>
                saveArticle(a).catch(() => toastError(t.common.somethingWrong))
              }
              onHide={() =>
                saveArticle(a, "hidden").catch(() =>
                  toastError(t.common.somethingWrong),
                )
              }
              onSend={() => setCardArticle(a)}
            />
          ))}
        </div>
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
          suggest={suggestFor(cardArticle)}
          onClose={() => setCardArticle(null)}
        />
      ) : null}
    </div>
  );
}
