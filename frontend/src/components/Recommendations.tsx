"use client";

import { useState } from "react";
import { Person } from "./Person";
import { AddFriendDialog } from "./AddFriendDialog";
import { ProfileModal } from "./ProfileModal";
import { useRecommendations } from "@/lib/hooks";
import { useReveal, useStagger } from "@/lib/anim";
import { useI18n } from "@/lib/i18n";
import type { Recommendation, UserSummary } from "@/lib/types";

/**
 * Recommendations surfaces "people you might want to talk to next" — second
 * degree connections ranked by mutual friends and shared languages — so the
 * network actively introduces people rather than only visualising them.
 */
export function Recommendations() {
  const { t } = useI18n();
  const { recommendations, isLoading } = useRecommendations();
  const [dialogUser, setDialogUser] = useState<UserSummary | null>(null);
  const [sent, setSent] = useState<Record<string, boolean>>({});
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const cardRef = useReveal<HTMLDivElement>();
  const listRef = useStagger<HTMLDivElement>(recommendations.length);

  // Nothing to suggest (no second-degree connections yet) — stay out of the way.
  if (!isLoading && recommendations.length === 0) return null;

  function reason(r: Recommendation): string {
    const parts: string[] = [];
    if (r.mutual_friends > 0) parts.push(t.recommend.mutual(r.mutual_friends));
    if (r.shared_languages.length > 0) parts.push(r.shared_languages.join(", "));
    return parts.join(" · ");
  }

  return (
    <div className="card" ref={cardRef}>
      <h2 className="section-title">{t.recommend.title}</h2>
      <p className="muted mt-[-4px] text-[13px]">{t.recommend.desc}</p>
      {isLoading ? (
        <p className="empty">{t.common.loading}</p>
      ) : (
        <div className="mt-2" ref={listRef}>
          {recommendations.map((r) => (
            <Person
              key={r.user.id}
              user={r.user}
              subtitle={reason(r)}
              onSelect={() => setSelectedId(r.user.id)}
              actions={
                <button
                  onClick={() => setDialogUser(r.user)}
                  disabled={sent[r.user.id]}
                >
                  {sent[r.user.id] ? t.common.requested : t.common.addFriend}
                </button>
              }
            />
          ))}
        </div>
      )}

      {dialogUser ? (
        <AddFriendDialog
          addresseeId={dialogUser.id}
          displayName={dialogUser.display_name}
          onClose={() => setDialogUser(null)}
          onSent={() => setSent((s) => ({ ...s, [dialogUser.id]: true }))}
        />
      ) : null}
      {selectedId ? (
        <ProfileModal userId={selectedId} onClose={() => setSelectedId(null)} />
      ) : null}
    </div>
  );
}
