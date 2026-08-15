"use client";

import Link from "next/link";
import { LanguageSwitcher } from "./LanguageSwitcher";

/**
 * Slim page-top bar shared across the standalone pages (login, register, legal,
 * add): the app icon on the left (links home) and the language switcher on the
 * right. Keeps branding and the JA/EN control consistent and top-right on every
 * page.
 */
export function TopBrandBar() {
  return (
    <header className="brandbar">
      <Link href="/" className="brandbar-mark" aria-label="chains — home">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/chains_icon.png" alt="" width={34} height={34} />
      </Link>
      <LanguageSwitcher />
    </header>
  );
}
