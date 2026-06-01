"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";

type Lang = "en" | "ja";

/**
 * LegalDoc renders a static legal document in English or Japanese with an
 * in-page language toggle. The content for each language is passed in, so the
 * page stays a server component (keeping its metadata).
 */
export function LegalDoc({
  en,
  ja,
}: {
  en: ReactNode;
  ja: ReactNode;
}) {
  const [lang, setLang] = useState<Lang>("en");

  return (
    <div className="container center-narrow">
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

      <p style={{ marginTop: 24 }}>
        <Link href="/login">← {lang === "ja" ? "戻る" : "Back"}</Link>
      </p>
    </div>
  );
}
