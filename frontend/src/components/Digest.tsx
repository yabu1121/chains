"use client";

import useSWR from "swr";
import { useAuth } from "@/lib/auth";
import { getProfile, useFollowUps, useSavedArticles } from "@/lib/hooks";
import { profileCompleteness } from "@/lib/completeness";
import { useReveal } from "@/lib/anim";
import { useI18n } from "@/lib/i18n";
import type { PublicProfile } from "@/lib/types";

/**
 * Digest is the in-app "weekly check-in": the three things worth coming back for
 * — people to reconnect with, unread saved articles, and profile gaps. It's the
 * digest a PWA push would deliver; surfaced in-app so the value exists with no
 * notification infrastructure. Tapping a stat jumps to where you act on it.
 */
export function Digest({
  onNavigate,
}: {
  onNavigate?: (tab: "news" | "settings") => void;
}) {
  const { t } = useI18n();
  const { user } = useAuth();
  const cardRef = useReveal<HTMLDivElement>();

  const { followUps } = useFollowUps();
  const { articles: saved } = useSavedArticles();
  const unread = saved.filter((a) => a.status === "unread").length;

  const { data: profile } = useSWR<PublicProfile>(
    user ? `/api/users/${user.id}` : null,
    () => getProfile(user!.id),
  );
  const missing = profile ? profileCompleteness(profile).missing.length : 0;

  // Nothing to nudge about — don't show an empty digest.
  if (followUps.length === 0 && unread === 0 && missing === 0) return null;

  return (
    <div className="card" ref={cardRef}>
      <h2 className="section-title">{t.digest.title}</h2>
      <div className="digest-grid">
        <div className="digest-stat">
          <span className="digest-num">{followUps.length}</span>
          <span className="muted text-[13px]">{t.digest.followUps}</span>
        </div>
        <button
          type="button"
          className="digest-stat digest-stat--btn"
          onClick={() => onNavigate?.("news")}
        >
          <span className="digest-num">{unread}</span>
          <span className="muted text-[13px]">{t.digest.unread}</span>
        </button>
        <button
          type="button"
          className="digest-stat digest-stat--btn"
          onClick={() => onNavigate?.("settings")}
        >
          <span className="digest-num">{missing}</span>
          <span className="muted text-[13px]">{t.digest.profile}</span>
        </button>
      </div>
    </div>
  );
}
