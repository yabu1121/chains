"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { ApiError } from "@/lib/api";
import { sendRequest } from "@/lib/hooks";
import { useReveal } from "@/lib/anim";
import { useDialog } from "@/lib/dialog";
import { useI18n } from "@/lib/i18n";

const MAX_MESSAGE = 150;

/**
 * Modal shown when the user taps "Add friend". It sends the request with an
 * optional short message. On success it calls onSent (so the caller can flip
 * its own "requested" state) and then onClose. Portals to <body> so the fixed
 * overlay anchors to the viewport, like ProfileModal.
 */
export function AddFriendDialog({
  addresseeId,
  displayName,
  onClose,
  onSent,
}: {
  addresseeId: string;
  displayName: string;
  onClose: () => void;
  onSent: () => void;
}) {
  const { t } = useI18n();
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const overlayRef = useReveal<HTMLDivElement>({ y: 0, duration: 200 });
  const cardReveal = useReveal<HTMLDivElement>({ scale: 0.94, y: 8, duration: 320 });
  const dialogRef = useDialog<HTMLDivElement>(onClose);
  const setCardRef = (node: HTMLDivElement | null) => {
    cardReveal.current = node;
    dialogRef.current = node;
  };

  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  async function submit() {
    setError(null);
    setSending(true);
    try {
      await sendRequest(addresseeId, message.trim());
      onSent();
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t.common.couldNotSend);
      setSending(false);
    }
  }

  if (!mounted) return null;

  return createPortal(
    <div className="modal-overlay" onClick={onClose} ref={overlayRef}>
      <div
        className="modal-card"
        role="dialog"
        aria-modal="true"
        aria-label={t.addFriendDialog.title}
        onClick={(e) => e.stopPropagation()}
        ref={setCardRef}
      >
        <button className="modal-close" onClick={onClose} aria-label={t.common.close}>
          ×
        </button>
        <h2 className="section-title mt-0">
          {t.addFriendDialog.title}
        </h2>
        <p className="muted mt-[-4px]">
          {t.addFriendDialog.to(displayName)}
        </p>

        <label htmlFor="friend-request-message">
          {t.addFriendDialog.commentLabel}
        </label>
        <textarea
          id="friend-request-message"
          value={message}
          onChange={(e) => setMessage(e.target.value.slice(0, MAX_MESSAGE))}
          maxLength={MAX_MESSAGE}
          rows={3}
          placeholder={t.addFriendDialog.commentPlaceholder}
        />
        <div className="muted text-right text-xs">
          {t.addFriendDialog.chars(message.length)}
        </div>

        {error ? <p className="error">{error}</p> : null}

        <div className="mt-3 flex gap-2">
          <button
            className="primary w-auto"
            type="button"
            onClick={submit}
            disabled={sending}
          >
            {sending ? t.addFriendDialog.sending : t.addFriendDialog.send}
          </button>
          <button
            className="ghost w-auto"
            type="button"
            onClick={onClose}
            disabled={sending}
          >
            {t.common.cancel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
