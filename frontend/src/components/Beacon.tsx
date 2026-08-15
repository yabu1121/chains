"use client";

import { useState } from "react";
import { Person } from "./Person";
import { ProfileModal } from "./ProfileModal";
import { SendCardDialog } from "./SendCardDialog";
import {
  clearBeacon,
  setBeacon,
  useFriendBeacons,
  useMyBeacon,
} from "@/lib/hooks";
import { useReveal } from "@/lib/anim";
import { useI18n } from "@/lib/i18n";
import { toastError } from "@/lib/toast";
import type { Beacon as BeaconType } from "@/lib/types";

const HOUR = 3_600_000;
const BEACON_LIFETIME = 72 * HOUR;

/**
 * Beacon is the "ok to talk to me about this now" signal. You *light* one — tap a
 * short preset (or write your own) — and it glows for 72h. Friends with an active
 * beacon are shown so you can reply with a Connection Card. It's the spark that
 * turns a static network into live conversation, without becoming a feed.
 */
export function Beacon() {
  const { t } = useI18n();
  const { beacon } = useMyBeacon();
  const { beacons } = useFriendBeacons();
  const [draft, setDraft] = useState("");
  const [custom, setCustom] = useState(false);
  const [busy, setBusy] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [replyTo, setReplyTo] = useState<BeaconType | null>(null);
  const cardRef = useReveal<HTMLDivElement>();

  async function light(message: string) {
    const m = message.trim();
    if (!m) return;
    setBusy(true);
    try {
      await setBeacon(m);
      setDraft("");
      setCustom(false);
    } catch {
      toastError(t.common.somethingWrong);
    } finally {
      setBusy(false);
    }
  }

  async function lower() {
    setBusy(true);
    try {
      await clearBeacon();
    } catch {
      toastError(t.common.somethingWrong);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card" ref={cardRef}>
      <h2 className="section-title">{t.beacon.title}</h2>
      <p className="muted mt-[-4px] text-[13px]">{t.beacon.desc}</p>

      {beacon ? (
        <BeaconLight beacon={beacon} onLower={lower} busy={busy} />
      ) : (
        <>
          <div className="beacon-presets mt-2">
            {t.beacon.presets.map((preset) => (
              <button
                key={preset}
                type="button"
                className="beacon-preset"
                onClick={() => light(preset)}
                disabled={busy}
              >
                <span className="beacon-dot" />
                {preset}
              </button>
            ))}
          </div>
          {custom ? (
            <div className="flex gap-2 mt-2 flex-wrap">
              <input
                className="flex-1 min-w-[180px]"
                value={draft}
                autoFocus
                onChange={(e) => setDraft(e.target.value.slice(0, 140))}
                placeholder={t.beacon.placeholder}
                onKeyDown={(e) => {
                  if (e.key === "Enter") light(draft);
                }}
              />
              <button
                type="button"
                className="primary w-auto"
                onClick={() => light(draft)}
                disabled={busy || !draft.trim()}
              >
                {t.beacon.light}
              </button>
            </div>
          ) : (
            <button
              type="button"
              className="beacon-custom-toggle"
              onClick={() => setCustom(true)}
            >
              {t.beacon.customLabel}
            </button>
          )}
        </>
      )}

      {beacons.length > 0 ? (
        <div className="mt-4">
          <div className="section-title">{t.beacon.friendsTitle}</div>
          <div className="mt-2 flex flex-col gap-1">
            {beacons.map((b) =>
              b.user ? (
                <Person
                  key={b.user.id}
                  user={b.user}
                  subtitle={b.message}
                  onSelect={() => setSelectedId(b.user!.id)}
                  actions={
                    <button type="button" onClick={() => setReplyTo(b)}>
                      {t.beacon.reply}
                    </button>
                  }
                />
              ) : null,
            )}
          </div>
        </div>
      ) : null}

      {selectedId ? (
        <ProfileModal userId={selectedId} onClose={() => setSelectedId(null)} />
      ) : null}
      {replyTo && replyTo.user ? (
        <SendCardDialog
          recipientId={replyTo.user.id}
          recipientName={replyTo.user.display_name}
          prefill={{ type: "beacon_reply", topic: replyTo.message }}
          onClose={() => setReplyTo(null)}
        />
      ) : null}
    </div>
  );
}

/** Your live beacon, shown as a glowing light card with a 72h countdown ring. */
function BeaconLight({
  beacon,
  onLower,
  busy,
}: {
  beacon: BeaconType;
  onLower: () => void;
  busy: boolean;
}) {
  const { t } = useI18n();
  const remMs = Math.max(0, new Date(beacon.expires_at).getTime() - Date.now());
  const remH = Math.ceil(remMs / HOUR);
  const pct = Math.max(0, Math.min(1, remMs / BEACON_LIFETIME));
  const circ = 2 * Math.PI * 15;

  return (
    <div className="beacon-light">
      <span className="beacon-dot" />
      <span className="flex-1 min-w-0">{beacon.message}</span>
      <span
        className="beacon-ring"
        title={t.beacon.remaining(remH)}
        aria-label={t.beacon.remaining(remH)}
      >
        <svg width="36" height="36" viewBox="0 0 36 36" aria-hidden="true">
          <circle
            cx="18"
            cy="18"
            r="15"
            fill="none"
            stroke="var(--border)"
            strokeWidth="3"
          />
          <circle
            cx="18"
            cy="18"
            r="15"
            fill="none"
            stroke="var(--accent)"
            strokeWidth="3"
            strokeLinecap="round"
            strokeDasharray={`${pct * circ} ${circ}`}
            transform="rotate(-90 18 18)"
          />
        </svg>
        <span className="beacon-ring-label">{remH}</span>
      </span>
      <button type="button" className="ghost" onClick={onLower} disabled={busy}>
        {t.beacon.clear}
      </button>
    </div>
  );
}
