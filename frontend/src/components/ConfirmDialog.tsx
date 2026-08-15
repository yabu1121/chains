"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { useDialog } from "@/lib/dialog";
import { useI18n } from "@/lib/i18n";
import { useMounted } from "./motion/use-mounted";

/**
 * ConfirmDialog is a small confirm step for hard-to-reverse actions (remove a
 * friend, block a user). It runs the action with a busy state and surfaces an
 * inline error on failure, matching the dialog flows — so the highest-stakes
 * actions stop being silent one-click fire-and-forget.
 */
export function ConfirmDialog({
  title,
  body,
  confirmLabel,
  danger,
  onConfirm,
  onClose,
}: {
  title: string;
  body?: string;
  confirmLabel: string;
  danger?: boolean;
  onConfirm: () => Promise<void> | void;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const mounted = useMounted();
  const dialogRef = useDialog<HTMLDivElement>(onClose);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!mounted) return null;

  async function confirm() {
    setError(null);
    setBusy(true);
    try {
      await onConfirm();
      onClose();
    } catch {
      setError(t.common.somethingWrong);
      setBusy(false);
    }
  }

  return createPortal(
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-card"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        ref={dialogRef}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="section-title mt-0">{title}</h2>
        {body ? <p className="muted">{body}</p> : null}
        {error ? <p className="error">{error}</p> : null}
        <div className="mt-3 flex items-center gap-3">
          <button
            type="button"
            className={`primary w-auto${danger ? " bg-danger" : ""}`}
            onClick={confirm}
            disabled={busy}
          >
            {busy ? t.common.loading : confirmLabel}
          </button>
          <button
            type="button"
            className="ghost"
            onClick={onClose}
            disabled={busy}
          >
            {t.common.cancel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
