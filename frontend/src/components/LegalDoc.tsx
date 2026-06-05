"use client";

import { type ReactNode } from "react";
import Link from "next/link";
import { useI18n } from "@/lib/i18n";

/**
 * LegalDoc renders a static legal document in English or Japanese. The language
 * follows the global UI language (set via the LanguageSwitcher), so there is no
 * separate in-page toggle. Content for each language is passed in, so callers
 * (the /terms and /privacy pages, and the in-app Settings area) keep a single
 * source of wording. Pass backHref={null} to hide the back link when embedded.
 */
export function LegalDoc({
  en,
  ja,
  backHref = "/login",
}: {
  en: ReactNode;
  ja: ReactNode;
  backHref?: string | null;
}) {
  const { lang, t } = useI18n();

  return (
    <>
      {lang === "ja" ? ja : en}

      {backHref ? (
        <p className="mt-6">
          <Link href={backHref}>← {t.common.back}</Link>
        </p>
      ) : null}
    </>
  );
}
