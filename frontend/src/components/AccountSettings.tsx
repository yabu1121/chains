"use client";

import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { exportData } from "@/lib/hooks";
import { useReveal } from "@/lib/anim";
import { useI18n } from "@/lib/i18n";
import { CONTACT_EMAIL } from "@/lib/site";

/**
 * AccountSettings groups launch-readiness account actions: your shareable public
 * profile link (with OGP previews), a full data export, and a contact address.
 */
export function AccountSettings() {
  const { t } = useI18n();
  const { user } = useAuth();
  const cardRef = useReveal<HTMLDivElement>();
  const [copied, setCopied] = useState(false);
  const [exporting, setExporting] = useState(false);

  const publicUrl =
    user && typeof window !== "undefined"
      ? `${window.location.origin}/u/${user.username}`
      : "";

  async function copy() {
    if (!publicUrl) return;
    try {
      await navigator.clipboard.writeText(publicUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable — ignore */
    }
  }

  async function onExport() {
    setExporting(true);
    try {
      await exportData();
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="flex flex-col gap-4" ref={cardRef}>
      <section className="card">
        <h2 className="section-title">{t.account.publicProfile}</h2>
        <p className="muted text-[13px] mt-[-4px]">
          {t.account.publicProfileDesc}
        </p>
        {publicUrl ? (
          <div className="flex gap-2 items-center flex-wrap mt-2">
            <a
              href={publicUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="break-all text-accent"
            >
              {publicUrl}
            </a>
            <button type="button" onClick={copy}>
              {copied ? t.qr.copied : t.qr.copyLink}
            </button>
          </div>
        ) : null}
      </section>

      <section className="card">
        <h2 className="section-title">{t.account.exportTitle}</h2>
        <p className="muted text-[13px] mt-[-4px]">{t.account.exportDesc}</p>
        <button
          type="button"
          className="mt-2 w-auto"
          onClick={onExport}
          disabled={exporting}
        >
          {exporting ? t.account.exporting : t.account.exportButton}
        </button>
      </section>

      {CONTACT_EMAIL ? (
        <section className="card">
          <h2 className="section-title">{t.account.contactTitle}</h2>
          <p className="muted text-[13px] mt-[-4px]">{t.account.contactDesc}</p>
          <a
            className="inline-block mt-2 text-accent"
            href={`mailto:${CONTACT_EMAIL}?subject=chains`}
          >
            {CONTACT_EMAIL}
          </a>
        </section>
      ) : null}
    </div>
  );
}
