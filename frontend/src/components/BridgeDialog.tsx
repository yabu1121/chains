"use client";

import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { ApiError } from "@/lib/api";
import { useDialog } from "@/lib/dialog";
import { sendBridge, useFriends } from "@/lib/hooks";
import { useI18n } from "@/lib/i18n";
import { Select } from "./Select";
import { useMounted } from "./motion/use-mounted";

/**
 * BridgeDialog introduces two of your friends to each other — the most
 * network-native action in chains. It shows what they have in common, takes a
 * reason, and sends each an intro card naming the other.
 */
export function BridgeDialog({
  initialA,
  initialB,
  onClose,
}: {
  initialA?: string;
  initialB?: string;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const { friends } = useFriends();
  const [a, setA] = useState(initialA ?? "");
  const [b, setB] = useState(initialB ?? "");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mounted = useMounted();
  const dialogRef = useDialog<HTMLDivElement>(onClose);

  const common = useMemo(() => {
    if (!a || !b) return [];
    const la = friends.find((f) => f.user.id === a)?.user.languages ?? [];
    const lb = new Set(friends.find((f) => f.user.id === b)?.user.languages ?? []);
    return la.filter((l) => lb.has(l));
  }, [a, b, friends]);

  async function onSubmit() {
    if (!a || !b || a === b) {
      setError(t.bridgeCard.pickTwo);
      return;
    }
    setError(null);
    setBusy(true);
    try {
      await sendBridge(a, b, reason.trim());
      setSent(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t.bridgeCard.failed);
      setBusy(false);
    }
  }

  if (!mounted) return null;

  return createPortal(
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-card"
        role="dialog"
        aria-modal="true"
        aria-label={t.bridgeCard.title}
        ref={dialogRef}
        onClick={(e) => e.stopPropagation()}
      >
        <button className="modal-close" onClick={onClose} aria-label={t.common.close}>
          ×
        </button>
        {sent ? (
          <>
            <h2 className="section-title mt-0">{t.bridgeCard.sentTitle}</h2>
            <p className="muted">{t.bridgeCard.sentBody}</p>
            <button type="button" className="primary w-auto" onClick={onClose}>
              {t.common.close}
            </button>
          </>
        ) : (
          <>
            <h2 className="section-title mt-0">{t.bridgeCard.title}</h2>
            <p className="muted mt-[-4px]">{t.bridgeCard.desc}</p>

            <label>{t.bridgeCard.personA}</label>
            <Select
              fullWidth
              value={a}
              onChange={setA}
              ariaLabel={t.bridgeCard.personA}
              placeholder={t.bridgeCard.choose}
              options={friends
                .filter((f) => f.user.id !== b)
                .map((f) => ({ value: f.user.id, label: f.user.display_name }))}
            />

            <label>{t.bridgeCard.personB}</label>
            <Select
              fullWidth
              value={b}
              onChange={setB}
              ariaLabel={t.bridgeCard.personB}
              placeholder={t.bridgeCard.choose}
              options={friends
                .filter((f) => f.user.id !== a)
                .map((f) => ({ value: f.user.id, label: f.user.display_name }))}
            />

            {common.length > 0 ? (
              <p className="muted text-[13px] mt-2">
                {t.bridgeCard.common(common.join(", "))}
              </p>
            ) : null}

            <label htmlFor="bridge-reason">{t.bridgeCard.reason}</label>
            <textarea
              id="bridge-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value.slice(0, 1000))}
              rows={3}
              placeholder={t.bridgeCard.reasonPlaceholder}
            />

            {error ? <p className="error">{error}</p> : null}

            <div className="mt-3 flex items-center gap-3">
              <button
                type="button"
                className="primary w-auto"
                onClick={onSubmit}
                disabled={busy}
              >
                {busy ? t.bridgeCard.sending : t.bridgeCard.send}
              </button>
              <button type="button" className="ghost" onClick={onClose}>
                {t.common.cancel}
              </button>
            </div>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}
