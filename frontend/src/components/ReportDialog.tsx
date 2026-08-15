"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { ApiError } from "@/lib/api";
import { useDialog } from "@/lib/dialog";
import { reportUser } from "@/lib/hooks";
import { useI18n } from "@/lib/i18n";
import { Select } from "./Select";
import { useMounted } from "./motion/use-mounted";

const REASONS = [
  "spam",
  "harassment",
  "impersonation",
  "inappropriate",
  "other",
] as const;

export function ReportDialog({
  reportedId,
  displayName,
  onClose,
}: {
  reportedId: string;
  displayName: string;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const [reason, setReason] = useState<string>("spam");
  const [details, setDetails] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mounted = useMounted();
  const dialogRef = useDialog<HTMLDivElement>(onClose);

  async function onSubmit() {
    setError(null);
    setBusy(true);
    try {
      await reportUser(reportedId, reason, details.trim());
      setSent(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t.report.failed);
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
        aria-label={t.report.title}
        ref={dialogRef}
        onClick={(e) => e.stopPropagation()}
      >
        <button className="modal-close" onClick={onClose} aria-label={t.common.close}>
          ×
        </button>
        {sent ? (
          <>
            <h2 className="section-title mt-0">{t.report.thanksTitle}</h2>
            <p className="muted">{t.report.thanksBody}</p>
            <button type="button" className="primary w-auto" onClick={onClose}>
              {t.common.close}
            </button>
          </>
        ) : (
          <>
            <h2 className="section-title mt-0">{t.report.title}</h2>
            <p className="muted mt-[-4px]">{t.report.to(displayName)}</p>

            <label>{t.report.reason}</label>
            <Select
              fullWidth
              value={reason}
              onChange={setReason}
              ariaLabel={t.report.reason}
              options={REASONS.map((r) => ({
                value: r,
                label: t.report.reasons[r],
              }))}
            />

            <label htmlFor="report-details">{t.report.details}</label>
            <textarea
              id="report-details"
              value={details}
              onChange={(e) => setDetails(e.target.value.slice(0, 1000))}
              rows={3}
              placeholder={t.report.detailsPlaceholder}
            />

            {error ? <p className="error">{error}</p> : null}

            <div className="mt-3 flex items-center gap-3">
              <button
                type="button"
                className="primary w-auto bg-danger"
                onClick={onSubmit}
                disabled={busy}
              >
                {busy ? t.report.submitting : t.report.submit}
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
