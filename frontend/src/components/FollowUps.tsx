"use client";

import { useState } from "react";
import { Person } from "./Person";
import { ProfileModal } from "./ProfileModal";
import { setFollowUpStatus, useFollowUps } from "@/lib/hooks";
import { useReveal } from "@/lib/anim";
import { useI18n } from "@/lib/i18n";
import { toastError } from "@/lib/toast";
import type { FollowUp, FollowUpStatus } from "@/lib/types";

/** A date n days from now as "YYYY-MM-DD". */
function plusDays(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

/**
 * FollowUps is the weekly task list of people to reconnect with — the "今週連絡
 * したい人" surface. Each row can be processed in one tap (contacted / later /
 * not needed) so the list stays actionable instead of just filling up.
 */
export function FollowUps() {
  const { t } = useI18n();
  const { followUps, isLoading } = useFollowUps();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const cardRef = useReveal<HTMLDivElement>();

  if (isLoading || followUps.length === 0) return null;

  function update(id: string, status: FollowUpStatus, dueOn = "") {
    setFollowUpStatus(id, status, dueOn).catch(() =>
      toastError(t.common.somethingWrong),
    );
  }

  function subtitle(f: FollowUp): string {
    const parts: string[] = [];
    if (f.next_action) parts.push(`→ ${f.next_action}`);
    else if (f.what_discussed) parts.push(f.what_discussed);
    if (f.due_on) parts.push(t.followUps.due(f.due_on));
    return parts.join(" · ") || `@${f.user.username}`;
  }

  return (
    <div className="card" ref={cardRef}>
      <h2 className="section-title">{t.followUps.title}</h2>
      <p className="muted mt-[-4px] text-[13px]">{t.followUps.desc}</p>
      <div className="mt-2">
        {followUps.map((f) => (
          <Person
            key={f.user.id}
            user={f.user}
            subtitle={subtitle(f)}
            note={f.memo || undefined}
            onSelect={() => setSelectedId(f.user.id)}
            actions={
              <>
                <button onClick={() => update(f.user.id, "contacted")}>
                  {t.followUps.markContacted}
                </button>
                <button
                  className="ghost"
                  onClick={() => update(f.user.id, "snoozed", plusDays(7))}
                >
                  {t.followUps.snooze}
                </button>
                <button
                  className="ghost"
                  onClick={() => update(f.user.id, "dismissed")}
                >
                  {t.followUps.dismiss}
                </button>
              </>
            }
          />
        ))}
      </div>
      {selectedId ? (
        <ProfileModal userId={selectedId} onClose={() => setSelectedId(null)} />
      ) : null}
    </div>
  );
}
