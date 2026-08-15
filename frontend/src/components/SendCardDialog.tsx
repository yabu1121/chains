"use client";

import { useMemo, useRef, useState, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useDialog } from "@/lib/dialog";
import { sendCard, useFriends, type CardInput } from "@/lib/hooks";
import { useI18n } from "@/lib/i18n";
import {
  CARD_TEMPLATES,
  CARD_THEMES,
  type CardBlock,
  type CardLayout,
  type CardTemplate,
  type CardTheme,
  type CardType,
  type UserSummary,
} from "@/lib/types";
import { CardPreview, type PreviewCard } from "./CardPreview";
import { Select } from "./Select";
import { useMounted } from "./motion/use-mounted";

const CARD_TYPES: CardType[] = [
  "talk_again",
  "thanks",
  "article",
  "consult",
  "ui_review",
  "hackathon",
  "status",
  "intro",
  "beacon_reply",
];

const ALL_BLOCKS: CardBlock[] = ["message", "tags", "article", "next_action"];

// Clicking a block on the canvas focuses its field in the editor panel.
const FIELD_ID: Partial<Record<string, string>> = {
  title: "card-topic",
  message: "card-message",
  tags: "card-tags",
  next_action: "card-next",
};

/**
 * SendCardDialog is the Card Studio — a small, full-screen design studio for
 * relationship cards. Pick a template on the left, watch the card take shape in
 * the centre canvas (tap a block to jump to its field), and edit content + layout
 * on the right. Keeps the original props so every entry point (a friend's
 * profile, a beacon reply, News → Card, an inbox reply) opens the studio.
 */
export function SendCardDialog({
  recipientId,
  recipientName,
  prefill,
  suggest,
  onClose,
  onSent,
}: {
  recipientId?: string;
  recipientName?: string;
  prefill?: Partial<CardInput>;
  suggest?: string[];
  onClose: () => void;
  onSent?: () => void;
}) {
  const { t } = useI18n();
  const { friends } = useFriends();
  const { user } = useAuth();

  const [recipient, setRecipient] = useState(recipientId ?? "");
  const [type, setType] = useState<CardType>(prefill?.type ?? "talk_again");
  const [template, setTemplate] = useState<CardTemplate>(
    (prefill?.template as CardTemplate) ?? "classic",
  );
  const [theme, setTheme] = useState<CardTheme>(prefill?.theme ?? "paper");
  const [topic, setTopic] = useState(prefill?.topic ?? "");
  const [tags, setTags] = useState<string[]>(prefill?.tags ?? []);
  const [tagDraft, setTagDraft] = useState("");
  const [nextAction, setNextAction] = useState(prefill?.next_action ?? "");
  const [message, setMessage] = useState(prefill?.message ?? "");
  const [blocks, setBlocks] = useState<CardBlock[]>(
    prefill?.layout?.blocks ?? ALL_BLOCKS,
  );
  const [showAvatars, setShowAvatars] = useState(
    prefill?.layout?.showAvatars ?? true,
  );
  const [selectedBlock, setSelectedBlock] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mounted = useMounted();
  const dialogRef = useDialog<HTMLDivElement>(onClose);
  const dragIdx = useRef<number | null>(null);

  const articleUrl = prefill?.article_url ?? "";
  const articleTitle = prefill?.article_title ?? "";

  const me: UserSummary | null = user
    ? {
        id: user.id,
        username: user.username,
        display_name: user.display_name,
        avatar_updated_at: user.avatar_updated_at,
      }
    : null;

  const recipientSummary: UserSummary | null = useMemo(() => {
    const friend = friends.find((f) => f.user.id === recipient)?.user;
    if (friend) return friend;
    if (recipient && recipientName)
      return {
        id: recipient,
        username: "",
        display_name: recipientName,
        avatar_updated_at: null,
      };
    return null;
  }, [friends, recipient, recipientName]);

  const suggested = useMemo(
    () =>
      (suggest ?? [])
        .map((id) => friends.find((f) => f.user.id === id))
        .filter((f): f is NonNullable<typeof f> => !!f),
    [suggest, friends],
  );

  function draftFor(tpl: CardTemplate): PreviewCard {
    return {
      type,
      theme,
      template: tpl,
      topic,
      tags,
      article_url: articleUrl,
      article_title: articleTitle,
      next_action: nextAction,
      message,
      layout: { showAvatars, blocks },
      sender: me,
      recipient: recipientSummary,
    };
  }
  const draft = draftFor(template);

  function selectBlock(key: string) {
    setSelectedBlock(key);
    const id = FIELD_ID[key];
    if (id) {
      const el = document.getElementById(id) as HTMLElement | null;
      el?.scrollIntoView({ block: "nearest" });
      el?.focus();
    }
  }

  function toggleBlock(b: CardBlock) {
    setBlocks((prev) =>
      prev.includes(b) ? prev.filter((x) => x !== b) : [...prev, b],
    );
  }
  function moveBlock(b: CardBlock, dir: -1 | 1) {
    setBlocks((prev) => {
      const i = prev.indexOf(b);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= prev.length) return prev;
      const next = [...prev];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  }
  function dropAt(targetVisibleIdx: number) {
    const from = dragIdx.current;
    dragIdx.current = null;
    if (from == null || from === targetVisibleIdx) return;
    setBlocks((prev) => {
      const next = [...prev];
      const [moved] = next.splice(from, 1);
      next.splice(targetVisibleIdx, 0, moved);
      return next;
    });
  }
  const orderedBlocks = [
    ...blocks,
    ...ALL_BLOCKS.filter((b) => !blocks.includes(b)),
  ];

  function addTag(raw: string) {
    const tag = raw.trim();
    if (!tag) return;
    setTags((ts) =>
      ts.some((x) => x.toLowerCase() === tag.toLowerCase()) || ts.length >= 10
        ? ts
        : [...ts, tag],
    );
  }
  function onTagKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addTag(tagDraft);
      setTagDraft("");
    }
  }

  async function onSubmit() {
    if (!recipient) {
      setError(t.cards.pickFriend);
      return;
    }
    setError(null);
    setBusy(true);
    const layout: CardLayout = { showAvatars, blocks };
    if (topic.trim()) layout.title = topic.trim();
    try {
      await sendCard({
        recipient_id: recipient,
        type,
        topic: topic.trim(),
        tags,
        article_url: articleUrl,
        article_title: articleTitle,
        next_action: nextAction.trim(),
        message: message.trim(),
        template,
        theme,
        layout,
      });
      setSent(true);
      onSent?.();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t.cards.failed);
      setBusy(false);
    }
  }

  if (!mounted) return null;

  return createPortal(
    <div className="studio-overlay">
      <div
        className="studio"
        role="dialog"
        aria-modal="true"
        aria-label={t.cards.studioTitle}
        ref={dialogRef}
      >
        <div className="studio-head">
          <h2 className="section-title m-0">{t.cards.studioTitle}</h2>
          <div className="flex items-center gap-2">
            {!sent ? (
              <button
                type="button"
                className="primary w-auto"
                onClick={onSubmit}
                disabled={busy}
              >
                {busy ? t.cards.sending : t.cards.send}
              </button>
            ) : null}
            <button
              type="button"
              className="ghost"
              onClick={onClose}
              aria-label={t.common.close}
            >
              {t.common.close}
            </button>
          </div>
        </div>

        {sent ? (
          <div className="studio-sent">
            <h3 className="section-title">{t.cards.sentTitle}</h3>
            <p className="muted">{t.cards.sentBody}</p>
            <div className="studio-sent-card">
              <CardPreview card={draft} mode="readonly" />
            </div>
          </div>
        ) : (
          <div className="studio-body">
            {/* Left: template gallery + themes */}
            <aside className="studio-pane studio-left">
              <label className="studio-label">{t.cards.templateLabel}</label>
              <div className="studio-templates">
                {CARD_TEMPLATES.map((tpl) => (
                  <button
                    key={tpl}
                    type="button"
                    className={`studio-tpl${template === tpl ? " studio-tpl--active" : ""}`}
                    aria-pressed={template === tpl}
                    onClick={() => setTemplate(tpl)}
                  >
                    <span className="studio-tpl-thumb">
                      <CardPreview card={draftFor(tpl)} mode="readonly" />
                    </span>
                    <span className="studio-tpl-name">
                      {t.cards.templates[tpl]}
                    </span>
                  </button>
                ))}
              </div>

              <label className="studio-label">{t.cards.theme}</label>
              <div className="cardp-themes">
                {CARD_THEMES.map((th) => (
                  <button
                    key={th}
                    type="button"
                    className={`cardp-swatch cardp--${th}${theme === th ? " cardp-swatch--active" : ""}`}
                    aria-label={t.cards.themes[th]}
                    aria-pressed={theme === th}
                    title={t.cards.themes[th]}
                    onClick={() => setTheme(th)}
                  />
                ))}
              </div>
            </aside>

            {/* Centre: the live canvas */}
            <div className="studio-canvas">
              <div className="studio-canvas-card">
                <CardPreview
                  card={draft}
                  mode="compose"
                  selectedBlock={selectedBlock}
                  onSelectBlock={selectBlock}
                />
              </div>
            </div>

            {/* Right: content + layout editor */}
            <aside className="studio-pane studio-right">
              {recipientId ? (
                <p className="muted mt-0">{t.cards.to(recipientName ?? "")}</p>
              ) : (
                <>
                  {suggested.length > 0 ? (
                    <>
                      <label className="studio-label">
                        {t.cards.suggestedTitle}
                      </label>
                      <div className="flex flex-wrap gap-[6px] mb-1">
                        {suggested.map((f) => (
                          <button
                            key={f.user.id}
                            type="button"
                            className="news-act"
                            aria-pressed={recipient === f.user.id}
                            onClick={() => setRecipient(f.user.id)}
                          >
                            {recipient === f.user.id ? "✓ " : ""}
                            {f.user.display_name}
                          </button>
                        ))}
                      </div>
                    </>
                  ) : null}
                  <label className="studio-label">{t.cards.pick}</label>
                  <Select
                    fullWidth
                    value={recipient}
                    onChange={setRecipient}
                    ariaLabel={t.cards.pick}
                    placeholder={t.cards.pickFriend}
                    options={friends.map((f) => ({
                      value: f.user.id,
                      label: f.user.display_name,
                    }))}
                  />
                </>
              )}

              <label className="studio-label">{t.cards.type}</label>
              <Select
                fullWidth
                value={type}
                onChange={(v) => setType(v as CardType)}
                ariaLabel={t.cards.type}
                options={CARD_TYPES.map((ct) => ({
                  value: ct,
                  label: t.cards.types[ct],
                }))}
              />

              <label htmlFor="card-topic" className="studio-label">
                {t.cards.topic}
              </label>
              <input
                id="card-topic"
                value={topic}
                onChange={(e) => setTopic(e.target.value.slice(0, 200))}
                placeholder={t.cards.topicPlaceholder}
                maxLength={200}
              />

              <label htmlFor="card-tags" className="studio-label">
                {t.cards.tags}
              </label>
              <input
                id="card-tags"
                value={tagDraft}
                onChange={(e) => setTagDraft(e.target.value)}
                onKeyDown={onTagKey}
                onBlur={() => {
                  addTag(tagDraft);
                  setTagDraft("");
                }}
                placeholder={t.cards.tagsPlaceholder}
              />
              {tags.length > 0 ? (
                <div className="flex flex-wrap gap-[6px] mt-2">
                  {tags.map((tag) => (
                    <span
                      key={tag}
                      className="inline-flex items-center gap-[6px] bg-panel-2 border border-border rounded-full pl-3 pr-[6px] py-[3px] text-[13px]"
                    >
                      #{tag}
                      <button
                        type="button"
                        onClick={() => setTags(tags.filter((x) => x !== tag))}
                        aria-label={t.common.removeItem(tag)}
                        className="border-0 bg-transparent text-muted px-1 py-0 text-[15px] leading-none"
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              ) : null}

              <label htmlFor="card-next" className="studio-label">
                {t.cards.nextAction}
              </label>
              <input
                id="card-next"
                value={nextAction}
                onChange={(e) => setNextAction(e.target.value.slice(0, 200))}
                placeholder={t.cards.nextActionPlaceholder}
                maxLength={200}
              />

              <label htmlFor="card-message" className="studio-label">
                {t.cards.message}
              </label>
              {type === "beacon_reply" ? (
                <div className="flex flex-wrap gap-[6px] mb-1">
                  {t.beacon.replyPhrases.map((phrase) => (
                    <button
                      key={phrase}
                      type="button"
                      className="news-act"
                      onClick={() => setMessage(phrase)}
                    >
                      {phrase}
                    </button>
                  ))}
                </div>
              ) : null}
              <textarea
                id="card-message"
                value={message}
                onChange={(e) => setMessage(e.target.value.slice(0, 1000))}
                placeholder={t.cards.messagePlaceholder}
                rows={3}
                maxLength={1000}
              />

              <label className="studio-label">{t.cards.layoutTitle}</label>
              <div className="card-blocks">
                <label className="card-block-toggle">
                  <input
                    type="checkbox"
                    className="w-auto"
                    checked={showAvatars}
                    onChange={(e) => setShowAvatars(e.target.checked)}
                  />
                  {t.cards.showAvatars}
                </label>
                {orderedBlocks.map((b) => {
                  const vIdx = blocks.indexOf(b);
                  const visible = vIdx >= 0;
                  return (
                    <div
                      key={b}
                      className={`card-block-row${visible ? " card-block-row--drag" : ""}`}
                      draggable={visible}
                      onDragStart={() => {
                        if (visible) dragIdx.current = vIdx;
                      }}
                      onDragOver={(e) => {
                        if (visible) e.preventDefault();
                      }}
                      onDrop={() => {
                        if (visible) dropAt(vIdx);
                      }}
                    >
                      <label className="card-block-toggle">
                        {visible ? (
                          <span className="card-block-grip" aria-hidden="true">
                            ⠿
                          </span>
                        ) : null}
                        <input
                          type="checkbox"
                          className="w-auto"
                          checked={visible}
                          onChange={() => toggleBlock(b)}
                        />
                        {t.cards.blocks[b]}
                      </label>
                      <span className="card-block-move">
                        <button
                          type="button"
                          onClick={() => moveBlock(b, -1)}
                          disabled={!visible || vIdx <= 0}
                          aria-label={t.cards.moveUp}
                        >
                          ↑
                        </button>
                        <button
                          type="button"
                          onClick={() => moveBlock(b, 1)}
                          disabled={!visible || vIdx >= blocks.length - 1}
                          aria-label={t.cards.moveDown}
                        >
                          ↓
                        </button>
                      </span>
                    </div>
                  );
                })}
              </div>

              {error ? <p className="error">{error}</p> : null}
            </aside>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
