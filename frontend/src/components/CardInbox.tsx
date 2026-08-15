"use client";

import { useState } from "react";
import { CardPreview } from "./CardPreview";
import { ProfileModal } from "./ProfileModal";
import { BridgeDialog } from "./BridgeDialog";
import { SendCardDialog } from "./SendCardDialog";
import {
  markCardRead,
  saveArticle,
  useCardInbox,
  useCardsSent,
} from "@/lib/hooks";
import { useReveal } from "@/lib/anim";
import { useI18n } from "@/lib/i18n";
import { toastError } from "@/lib/toast";
import type { ConnectionCard, UserSummary } from "@/lib/types";

/** The counterpart shown on a card (the other person, whichever direction). */
function other(card: ConnectionCard): UserSummary | undefined {
  return card.direction === "received" ? card.sender : card.recipient;
}

function CardRow({
  card,
  onOpen,
}: {
  card: ConnectionCard;
  onOpen: (card: ConnectionCard) => void;
}) {
  const { t } = useI18n();
  const unread = card.direction === "received" && !card.read;

  // Unread cards sit slightly raised off the stack, like a card lifted to read.
  return (
    <div
      className={`card-open${unread ? " card-open--unread" : ""}`}
      role="button"
      tabIndex={0}
      aria-label={t.cards.tapToOpen}
      onClick={() => onOpen(card)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen(card);
        }
      }}
    >
      {unread ? (
        <span className="card-new absolute right-2 top-2 z-10">
          {t.cards.unread}
        </span>
      ) : null}
      <CardPreview card={card} mode="readonly" />
    </div>
  );
}

/** The opened card, enlarged, with its actions on the "back". */
function CardDetail({
  card,
  onClose,
  onReply,
  onProfile,
}: {
  card: ConnectionCard;
  onClose: () => void;
  onReply: (person: UserSummary) => void;
  onProfile: (id: string) => void;
}) {
  const { t } = useI18n();
  const person = other(card);
  const received = card.direction === "received";

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-card"
        role="dialog"
        aria-modal="true"
        aria-label={t.cards.inboxTitle}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          className="modal-close"
          onClick={onClose}
          aria-label={t.common.close}
        >
          ×
        </button>
        <div className="my-2">
          <CardPreview card={card} mode="readonly" />
        </div>
        <div className="flex gap-2 mt-3 flex-wrap">
          {person ? (
            <button
              type="button"
              className="news-act"
              onClick={() => onReply(person)}
            >
              {received ? t.cards.reply : t.cards.sendCard}
            </button>
          ) : null}
          {card.article_url ? (
            <button
              type="button"
              className="news-act"
              onClick={() =>
                saveArticle({
                  url: card.article_url!,
                  title: card.article_title || card.article_url!,
                  source: "Card",
                  published_at: null,
                }).catch(() => toastError(t.common.somethingWrong))
              }
            >
              {t.cards.saveArticle}
            </button>
          ) : null}
          {person ? (
            <button
              type="button"
              className="news-act"
              onClick={() => onProfile(person.id)}
            >
              {t.cards.openProfile}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function CardInbox() {
  const { t } = useI18n();
  const [tab, setTab] = useState<"inbox" | "sent">("inbox");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [openCard, setOpenCard] = useState<ConnectionCard | null>(null);
  const [replyTo, setReplyTo] = useState<UserSummary | null>(null);
  const cardRef = useReveal<HTMLDivElement>();

  const inbox = useCardInbox();
  const sent = useCardsSent();
  const active = tab === "inbox" ? inbox : sent;
  const empty = tab === "inbox" ? t.cards.inboxEmpty : t.cards.sentEmpty;
  const [showBridge, setShowBridge] = useState(false);

  function openCardView(card: ConnectionCard) {
    if (card.direction === "received" && !card.read) {
      markCardRead(card.id).catch(() => {});
    }
    setOpenCard(card);
  }

  return (
    <div className="card" ref={cardRef}>
      <div className="flex justify-end mb-2">
        <button type="button" onClick={() => setShowBridge(true)}>
          {t.bridgeCard.action}
        </button>
      </div>
      <div className="subtabs" role="group" aria-label={t.cards.inboxTitle}>
        {(["inbox", "sent"] as const).map((key) => (
          <button
            key={key}
            aria-pressed={tab === key}
            className={`subtab${tab === key ? " active" : ""}`}
            onClick={() => setTab(key)}
          >
            <span className="subtab-label">
              {key === "inbox" ? t.cards.inboxTab : t.cards.sentTab}
            </span>
          </button>
        ))}
      </div>

      {active.error ? (
        <p className="error">{t.common.couldNotLoad}</p>
      ) : active.isLoading ? (
        <p className="empty">{t.common.loading}</p>
      ) : active.cards.length === 0 ? (
        <p className="empty">{empty}</p>
      ) : (
        <div className="flex flex-col gap-3 mt-3">
          {active.cards.map((c) => (
            <CardRow key={c.id} card={c} onOpen={openCardView} />
          ))}
        </div>
      )}

      {openCard ? (
        <CardDetail
          card={openCard}
          onClose={() => setOpenCard(null)}
          onReply={(person) => {
            setOpenCard(null);
            setReplyTo(person);
          }}
          onProfile={(id) => {
            setOpenCard(null);
            setSelectedId(id);
          }}
        />
      ) : null}
      {replyTo ? (
        <SendCardDialog
          recipientId={replyTo.id}
          recipientName={replyTo.display_name}
          onClose={() => setReplyTo(null)}
        />
      ) : null}
      {selectedId ? (
        <ProfileModal userId={selectedId} onClose={() => setSelectedId(null)} />
      ) : null}
      {showBridge ? <BridgeDialog onClose={() => setShowBridge(false)} /> : null}
    </div>
  );
}
