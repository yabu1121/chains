"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Avatar } from "./Avatar";
import { NetworkGraph } from "./NetworkGraph";
import { ProfileModal } from "./ProfileModal";
import { SendCardDialog } from "./SendCardDialog";
import {
  useCardInbox,
  useCardsSent,
  useFriendBeacons,
  useFriends,
} from "@/lib/hooks";
import { useI18n } from "@/lib/i18n";
import type { ConnectionCard, UserSummary } from "@/lib/types";

const DAY = 86_400_000;

/**
 * NetworkDeck is the "travel the network" experience: the relationship graph on
 * top, a horizontally-swiped strip of friend Node Cards below. Selecting a card
 * focuses its node; tapping a node scrolls to its card. Beacons glow, recently-
 * exchanged relationships brighten, and quiet ones fade — turning a contact list
 * into a map you move through.
 */
export function NetworkDeck({ onEditProfile }: { onEditProfile?: () => void }) {
  const { t } = useI18n();
  const { friends } = useFriends();
  const { beacons } = useFriendBeacons();
  const inbox = useCardInbox();
  const sent = useCardsSent();

  const [focusId, setFocusId] = useState<string | null>(null);
  const [profileId, setProfileId] = useState<string | null>(null);
  const [cardTo, setCardTo] = useState<UserSummary | null>(null);
  // A just-sent card: the graph runs a light along the edge to this friend.
  const [spark, setSpark] = useState<{ id: string; at: number } | null>(null);
  const sentRef = useRef(false);
  const cardRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const stripRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef(0);

  const beaconIds = useMemo(
    () =>
      new Set(beacons.map((b) => b.user?.id).filter((x): x is string => !!x)),
    [beacons],
  );
  const beaconMsg = useMemo(() => {
    const m = new Map<string, string>();
    beacons.forEach((b) => {
      if (b.user) m.set(b.user.id, b.message);
    });
    return m;
  }, [beacons]);

  // Most recent card exchange per friend (either direction).
  const lastInteract = useMemo(() => {
    const m = new Map<string, number>();
    const consider = (cards: ConnectionCard[]) =>
      cards.forEach((c) => {
        const pid = c.direction === "sent" ? c.recipient?.id : c.sender?.id;
        if (!pid) return;
        const ts = new Date(c.created_at).getTime();
        m.set(pid, Math.max(m.get(pid) ?? 0, ts));
      });
    consider(inbox.cards);
    consider(sent.cards);
    return m;
  }, [inbox.cards, sent.cards]);

  const recentIds = useMemo(() => {
    const now = Date.now();
    return new Set(
      [...lastInteract].filter(([, ts]) => now - ts < 14 * DAY).map(([id]) => id),
    );
  }, [lastInteract]);
  const staleIds = useMemo(() => {
    const now = Date.now();
    return new Set(
      [...lastInteract].filter(([, ts]) => now - ts > 30 * DAY).map(([id]) => id),
    );
  }, [lastInteract]);

  // Beacon-first, then most recently in touch.
  const sorted = useMemo(
    () =>
      [...friends].sort((a, b) => {
        const ab = beaconIds.has(a.user.id) ? 1 : 0;
        const bb = beaconIds.has(b.user.id) ? 1 : 0;
        if (ab !== bb) return bb - ab;
        return (
          (lastInteract.get(b.user.id) ?? 0) -
          (lastInteract.get(a.user.id) ?? 0)
        );
      }),
    [friends, beaconIds, lastInteract],
  );

  function selectFriend(id: string) {
    setFocusId(id);
    cardRefs.current
      .get(id)
      ?.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
  }

  // Swiping the strip drives the focus: whichever card is nearest the strip's
  // centre becomes active, which zooms the graph to that node. rAF-throttled so a
  // fling doesn't thrash, and idempotent so a programmatic scrollIntoView (from a
  // node tap) just confirms the same focus rather than fighting it.
  function onStripScroll() {
    if (rafRef.current) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = 0;
      const strip = stripRef.current;
      if (!strip) return;
      const rect = strip.getBoundingClientRect();
      const center = rect.left + rect.width / 2;
      let bestId: string | null = null;
      let bestDist = Infinity;
      cardRefs.current.forEach((el, id) => {
        const r = el.getBoundingClientRect();
        const dist = Math.abs(r.left + r.width / 2 - center);
        if (dist < bestDist) {
          bestDist = dist;
          bestId = id;
        }
      });
      if (bestId) setFocusId((prev) => (prev === bestId ? prev : bestId));
    });
  }

  useEffect(
    () => () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    },
    [],
  );

  function lastLabel(id: string): string {
    const ts = lastInteract.get(id);
    if (!ts) return t.deck.noCards;
    return t.deck.lastTalk(Math.floor((Date.now() - ts) / DAY));
  }

  return (
    <div className="deck">
      <div className="deck-graph">
        <NetworkGraph
          onEditProfile={onEditProfile}
          beaconIds={beaconIds}
          recentIds={recentIds}
          staleIds={staleIds}
          focusId={focusId}
          sparkId={spark?.id ?? null}
          sparkAt={spark?.at ?? null}
          onNodeSelect={selectFriend}
        />
      </div>

      {friends.length > 0 ? (
        <div className="deck-strip" ref={stripRef} onScroll={onStripScroll}>
          {sorted.map((f) => (
            <div
              key={f.user.id}
              ref={(el) => {
                if (el) cardRefs.current.set(f.user.id, el);
                else cardRefs.current.delete(f.user.id);
              }}
              className={`node-card${focusId === f.user.id ? " node-card--active" : ""}`}
            >
              {/* Focusable selector — keyboard accessible; the action buttons are
                  siblings so there's no nested-interactive a11y conflict. */}
              <div
                className="node-card-main"
                role="button"
                tabIndex={0}
                aria-label={f.user.display_name}
                onClick={() => selectFriend(f.user.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    selectFriend(f.user.id);
                  }
                }}
              >
                <div className="flex items-center gap-2">
                  <Avatar user={f.user} size={40} />
                  <div className="min-w-0">
                    <div className="font-semibold text-sm truncate">
                      {f.user.display_name}
                    </div>
                    <div className="muted text-[12px] truncate">
                      {lastLabel(f.user.id)}
                    </div>
                  </div>
                </div>
                {beaconMsg.has(f.user.id) ? (
                  <div className="node-card-beacon">
                    <span className="beacon-dot" />
                    <span className="truncate">{beaconMsg.get(f.user.id)}</span>
                  </div>
                ) : null}
                {(f.user.languages ?? []).length > 0 ? (
                  <div className="flex flex-wrap gap-1 mt-1">
                    {(f.user.languages ?? []).slice(0, 4).map((l) => (
                      <span key={l} className="news-lang">
                        {l}
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>
              <div className="flex gap-2 mt-2">
                <button
                  type="button"
                  className="news-act"
                  onClick={() => setCardTo(f.user)}
                >
                  {t.cards.sendCard}
                </button>
                <button
                  type="button"
                  className="news-act"
                  onClick={() => setProfileId(f.user.id)}
                >
                  {t.cards.openProfile}
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {profileId ? (
        <ProfileModal
          userId={profileId}
          onClose={() => setProfileId(null)}
          onEditProfile={onEditProfile}
        />
      ) : null}
      {cardTo ? (
        <SendCardDialog
          recipientId={cardTo.id}
          recipientName={cardTo.display_name}
          onSent={() => {
            sentRef.current = true;
          }}
          onClose={() => {
            const id = cardTo.id;
            setCardTo(null);
            // Once the dialog is dismissed (graph visible again), send the light.
            if (sentRef.current) {
              sentRef.current = false;
              setSpark({ id, at: Date.now() });
              window.setTimeout(
                () => setSpark((s) => (s && s.id === id ? null : s)),
                1600,
              );
            }
          }}
        />
      ) : null}
    </div>
  );
}
