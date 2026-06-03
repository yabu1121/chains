"use client";

import { Select } from "./Select";
import { useI18n, type Lang } from "@/lib/i18n";

/**
 * Language dropdown built on the shared Select. Reads/writes the global
 * language from the i18n context, so placing it anywhere switches the whole UI.
 */
export function LanguageSwitcher({ fullWidth = false }: { fullWidth?: boolean }) {
  const { lang, setLang, t } = useI18n();
  return (
    <Select
      value={lang}
      onChange={(v) => setLang(v as Lang)}
      ariaLabel={t.common.language}
      fullWidth={fullWidth}
      options={[
        { value: "ja", label: "日本語" },
        { value: "en", label: "English" },
      ]}
    />
  );
}
