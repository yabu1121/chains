"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";

type Lang = "en" | "ja";

/**
 * LegalDoc renders a static legal document in English or Japanese with an
 * in-page language toggle. Content for each language is passed in, so callers
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
  const [lang, setLang] = useState<Lang>("en");

  return (
    <>
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginBottom: 8 }}>
        <button
          type="button"
          className={lang === "en" ? "primary" : "ghost"}
          style={{ width: "auto", padding: "4px 12px" }}
          onClick={() => setLang("en")}
        >
          English
        </button>
        <button
          type="button"
          className={lang === "ja" ? "primary" : "ghost"}
          style={{ width: "auto", padding: "4px 12px" }}
          onClick={() => setLang("ja")}
        >
          日本語
        </button>
      </div>

      {lang === "ja" ? ja : en}

      {backHref ? (
        <p style={{ marginTop: 24 }}>
          <Link href={backHref}>← {lang === "ja" ? "戻る" : "Back"}</Link>
        </p>
      ) : null}
    </>
  );
}
