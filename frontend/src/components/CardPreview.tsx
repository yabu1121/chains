"use client";

import { type KeyboardEvent } from "react";
import { Avatar } from "./Avatar";
import { useI18n } from "@/lib/i18n";
import type {
  CardBlock,
  CardLayout,
  CardTheme,
  CardType,
  UserSummary,
} from "@/lib/types";

// The minimum a card needs to render. ConnectionCard satisfies this, and so does
// an in-progress draft in the composer (which has no id yet).
export interface PreviewCard {
  type: CardType;
  theme: CardTheme;
  template?: string;
  topic?: string;
  tags?: string[];
  article_url?: string;
  article_title?: string;
  next_action?: string;
  message?: string;
  layout?: CardLayout;
  sender?: UserSummary | null;
  recipient?: UserSummary | null;
}

// Which content rows have something to show, in a stable order. Used as the
// default when a card carries no explicit block list.
function filledBlocks(card: PreviewCard): CardBlock[] {
  const blocks: CardBlock[] = [];
  if (card.message?.trim()) blocks.push("message");
  if (card.tags && card.tags.length > 0) blocks.push("tags");
  if (card.article_title?.trim() || card.article_url?.trim())
    blocks.push("article");
  if (card.next_action?.trim()) blocks.push("next_action");
  return blocks;
}

/**
 * deriveLayout returns the card design with sensible defaults filled in. A card's
 * persisted layout wins; absent fields fall back to the card type + filled
 * content, so a freshly-typed draft and a stored card render the same way.
 */
export function deriveLayout(card: PreviewCard): Required<CardLayout> {
  const l = card.layout ?? {};
  return {
    showAvatars: l.showAvatars ?? true,
    accent: l.accent ?? "",
    title: l.title ?? card.topic?.trim() ?? "",
    subtitle: l.subtitle ?? "",
    blocks: l.blocks ?? filledBlocks(card),
  };
}

/**
 * CardPreview renders a Connection Card as a finished "card work" — the same look
 * in the Card Studio (mode="compose", shows placeholders and lets you click a
 * block to edit it) and everywhere a sent card appears (mode="readonly", empty
 * rows are dropped). Content comes from the card type; layout from the template;
 * colour from the theme.
 */
export function CardPreview({
  card,
  mode = "readonly",
  selectedBlock,
  onSelectBlock,
}: {
  card: PreviewCard;
  mode?: "compose" | "readonly";
  // Studio-only: which block is selected, and a handler to select one by tapping
  // it on the canvas (so the matching field can be focused).
  selectedBlock?: string;
  onSelectBlock?: (key: string) => void;
}) {
  const { t } = useI18n();
  const compose = mode === "compose";
  const layout = deriveLayout(card);
  const { sender, recipient } = card;
  const template = card.template || "classic";
  const interactive = compose && !!onSelectBlock;
  const avatarSize = template === "passport" ? 44 : 24;

  // In compose mode show the chosen blocks (with placeholders) so the canvas
  // reads as a card from the first keystroke and reflects the layout controls;
  // readonly shows only what was actually filled.
  const blocks: CardBlock[] = compose
    ? (card.layout?.blocks ?? ["message", "tags", "article", "next_action"])
    : layout.blocks;

  const title = layout.title || (compose ? t.cards.topicPlaceholder : "");

  // Tapping a block on the canvas selects it (studio only).
  const sel = (key: string) =>
    interactive
      ? {
          role: "button" as const,
          tabIndex: 0,
          onClick: () => onSelectBlock!(key),
          onKeyDown: (e: KeyboardEvent) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              onSelectBlock!(key);
            }
          },
        }
      : {};
  const selClass = (key: string) =>
    `${interactive ? " cardp-selectable" : ""}${selectedBlock === key ? " cardp-sel" : ""}`;

  return (
    <div
      className={`cardp cardp--${card.theme} cardp--tpl-${template}${compose ? " cardp--compose" : ""}`}
      aria-label={t.cards.types[card.type]}
    >
      <div className="cardp-band">
        <span className="cardp-kind">{t.cards.types[card.type]}</span>
        <span className="cardp-brand">chains</span>
      </div>

      {layout.showAvatars && (sender || recipient) ? (
        <div className="cardp-people">
          {sender ? (
            <span className="cardp-person">
              <Avatar user={sender} size={avatarSize} />
              <span className="truncate">{sender.display_name}</span>
            </span>
          ) : null}
          {sender && recipient ? (
            <span className="cardp-arrow" aria-hidden="true">
              →
            </span>
          ) : null}
          {recipient ? (
            <span className="cardp-person">
              <Avatar user={recipient} size={avatarSize} />
              <span className="truncate">{recipient.display_name}</span>
            </span>
          ) : null}
        </div>
      ) : null}

      <div
        className={`cardp-title${layout.title ? "" : " cardp-title--ghost"}${selClass("title")}`}
        {...sel("title")}
      >
        {title}
      </div>
      {layout.subtitle ? (
        <div className="cardp-subtitle">{layout.subtitle}</div>
      ) : null}

      <div className="cardp-body">
        {blocks.map((block) => {
          switch (block) {
            case "message":
              return card.message?.trim() ? (
                <p
                  key="message"
                  className={`cardp-message${selClass("message")}`}
                  {...sel("message")}
                >
                  {card.message}
                </p>
              ) : compose ? (
                <p
                  key="message"
                  className={`cardp-message cardp-ghost${selClass("message")}`}
                  {...sel("message")}
                >
                  {t.cards.messagePlaceholder}
                </p>
              ) : null;
            case "tags":
              return card.tags && card.tags.length > 0 ? (
                <div
                  key="tags"
                  className={`cardp-tags${selClass("tags")}`}
                  {...sel("tags")}
                >
                  {card.tags.map((tg) => (
                    <span key={tg} className="cardp-tag">
                      #{tg}
                    </span>
                  ))}
                </div>
              ) : compose ? (
                <div
                  key="tags"
                  className={`cardp-tags${selClass("tags")}`}
                  {...sel("tags")}
                >
                  <span className="cardp-tag cardp-ghost">#{t.cards.tags}</span>
                </div>
              ) : null;
            case "article":
              return card.article_title?.trim() || card.article_url?.trim() ? (
                <blockquote
                  key="article"
                  className={`cardp-article${selClass("article")}`}
                  {...sel("article")}
                >
                  <span className="cardp-article-mark" aria-hidden="true">
                    ❝
                  </span>
                  <span>{card.article_title || card.article_url}</span>
                </blockquote>
              ) : null;
            case "next_action":
              return card.next_action?.trim() ? (
                <div
                  key="next"
                  className={`cardp-next${selClass("next_action")}`}
                  {...sel("next_action")}
                >
                  → {card.next_action}
                </div>
              ) : compose ? (
                <div
                  key="next"
                  className={`cardp-next cardp-ghost${selClass("next_action")}`}
                  {...sel("next_action")}
                >
                  → {t.cards.nextActionPlaceholder}
                </div>
              ) : null;
            default:
              return null;
          }
        })}
      </div>
    </div>
  );
}
