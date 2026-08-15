"use client";

import { useEffect, useState, type KeyboardEvent } from "react";
import useSWR from "swr";
import { ApiError } from "@/lib/api";
import { getNote, noteKey, saveNote, type NoteInput } from "@/lib/hooks";
import { useI18n } from "@/lib/i18n";
import type { FollowUpStatus, Note } from "@/lib/types";
import { Select } from "./Select";

const EMPTY: NoteInput = {
  where_met: "",
  what_discussed: "",
  topic_tags: [],
  next_action: "",
  met_on: "",
  due_on: "",
  follow_up_status: "none",
  memo: "",
};

const STATUSES: FollowUpStatus[] = [
  "none",
  "pending",
  "snoozed",
  "contacted",
  "dismissed",
];

/**
 * FriendNote is the private interaction log the viewer keeps about another user:
 * when/where they met, topic tags, the next action and its due date, a follow-up
 * status, and a free memo. Only the owner ever sees it. It's what lets chains
 * answer "who was that, and what was I going to do about it?" weeks later.
 */
export function FriendNote({ userId }: { userId: string }) {
  const { t } = useI18n();
  const { data, mutate } = useSWR<Note>(noteKey(userId), () => getNote(userId));

  const [form, setForm] = useState<NoteInput>(EMPTY);
  const [tagDraft, setTagDraft] = useState("");
  const [status, setStatus] = useState<"idle" | "saving" | "saved">("idle");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!data) return;
    setForm({
      where_met: data.where_met,
      what_discussed: data.what_discussed,
      topic_tags: data.topic_tags,
      next_action: data.next_action,
      met_on: data.met_on ?? "",
      due_on: data.due_on ?? "",
      follow_up_status: data.follow_up_status,
      memo: data.memo,
    });
  }, [data]);

  function set<K extends keyof NoteInput>(key: K, value: NoteInput[K]) {
    setForm((f) => ({ ...f, [key]: value }));
    setStatus("idle");
  }

  function addTag(raw: string) {
    const tag = raw.trim();
    if (!tag) return;
    setForm((f) =>
      f.topic_tags.some((x) => x.toLowerCase() === tag.toLowerCase()) ||
      f.topic_tags.length >= 10
        ? f
        : { ...f, topic_tags: [...f.topic_tags, tag] },
    );
    setStatus("idle");
  }

  function onTagKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addTag(tagDraft);
      setTagDraft("");
    }
  }

  async function onSave() {
    setError(null);
    setStatus("saving");
    try {
      const saved = await saveNote(userId, form);
      await mutate(saved, { revalidate: false });
      setStatus("saved");
    } catch (err) {
      setStatus("idle");
      setError(err instanceof ApiError ? err.message : t.note.couldNotSave);
    }
  }

  return (
    <section className="pv-section border-t border-border mt-4 pt-4">
      <div className="section-title">{t.note.title}</div>
      <p className="muted mt-[-2px] text-[13px]">{t.note.privacyHint}</p>

      <div className="flex gap-2 flex-wrap mt-2">
        <div className="flex-1 min-w-[140px]">
          <label htmlFor="note-met-on">{t.note.metOn}</label>
          <input
            id="note-met-on"
            type="date"
            value={form.met_on}
            max={new Date().toISOString().slice(0, 10)}
            onChange={(e) => set("met_on", e.target.value)}
          />
        </div>
        <div className="flex-1 min-w-[140px]">
          <label htmlFor="note-where">{t.note.whereMet}</label>
          <input
            id="note-where"
            value={form.where_met}
            onChange={(e) => set("where_met", e.target.value.slice(0, 200))}
            placeholder={t.note.whereMetPlaceholder}
            maxLength={200}
          />
        </div>
      </div>

      <label htmlFor="note-what">{t.note.whatDiscussed}</label>
      <input
        id="note-what"
        value={form.what_discussed}
        onChange={(e) => set("what_discussed", e.target.value.slice(0, 200))}
        placeholder={t.note.whatDiscussedPlaceholder}
        maxLength={200}
      />

      <label htmlFor="note-tags">{t.note.topicTags}</label>
      <input
        id="note-tags"
        value={tagDraft}
        onChange={(e) => setTagDraft(e.target.value)}
        onKeyDown={onTagKey}
        onBlur={() => {
          addTag(tagDraft);
          setTagDraft("");
        }}
        placeholder={t.note.topicTagsPlaceholder}
      />
      {form.topic_tags.length > 0 ? (
        <div className="flex flex-wrap gap-[6px] mt-2">
          {form.topic_tags.map((tag) => (
            <span
              key={tag}
              className="inline-flex items-center gap-[6px] bg-panel-2 border border-border rounded-full pl-3 pr-[6px] py-[3px] text-[13px]"
            >
              #{tag}
              <button
                type="button"
                onClick={() =>
                  set(
                    "topic_tags",
                    form.topic_tags.filter((x) => x !== tag),
                  )
                }
                aria-label={t.common.removeItem(tag)}
                className="border-0 bg-transparent text-muted px-1 py-0 text-[15px] leading-none"
              >
                ×
              </button>
            </span>
          ))}
        </div>
      ) : null}

      <label htmlFor="note-next">{t.note.nextAction}</label>
      <input
        id="note-next"
        value={form.next_action}
        onChange={(e) => set("next_action", e.target.value.slice(0, 200))}
        placeholder={t.note.nextActionPlaceholder}
        maxLength={200}
      />

      <div className="flex gap-2 flex-wrap mt-1">
        <div className="flex-1 min-w-[150px]">
          <label>{t.note.followUpLabel}</label>
          <Select
            fullWidth
            value={form.follow_up_status}
            onChange={(v) => set("follow_up_status", v as FollowUpStatus)}
            ariaLabel={t.note.followUpLabel}
            options={STATUSES.map((s) => ({
              value: s,
              label: t.note.statuses[s],
            }))}
          />
        </div>
        {form.follow_up_status === "snoozed" ||
        form.follow_up_status === "pending" ? (
          <div className="flex-1 min-w-[140px]">
            <label htmlFor="note-due">{t.note.dueOn}</label>
            <input
              id="note-due"
              type="date"
              value={form.due_on}
              onChange={(e) => set("due_on", e.target.value)}
            />
          </div>
        ) : null}
      </div>

      <label htmlFor="note-memo">{t.note.memo}</label>
      <textarea
        id="note-memo"
        value={form.memo}
        onChange={(e) => set("memo", e.target.value.slice(0, 1000))}
        placeholder={t.note.memoPlaceholder}
        rows={3}
        maxLength={1000}
      />

      <div className="mt-3 flex items-center gap-3">
        <button
          type="button"
          className="primary w-auto"
          onClick={onSave}
          disabled={status === "saving"}
        >
          {status === "saving" ? t.note.saving : t.note.save}
        </button>
        {status === "saved" ? (
          <span className="text-ok">{t.note.saved}</span>
        ) : null}
      </div>
      {error ? <p className="error">{error}</p> : null}
    </section>
  );
}
