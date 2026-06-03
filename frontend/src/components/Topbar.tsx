"use client";

import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";

export function Topbar({ onBrandClick }: { onBrandClick?: () => void }) {
  const { t } = useI18n();
  const { user, logout } = useAuth();
  return (
    <div className="topbar">
      <button
        type="button"
        className="brand"
        onClick={onBrandClick}
        title={t.nav.viewProfile}
      >
        ⛓ chains
      </button>
      <div className="actions">
        {user ? <span className="muted">{user.display_name}</span> : null}
        <LanguageSwitcher />
        <button className="ghost" onClick={logout}>
          {t.nav.logout}
        </button>
      </div>
    </div>
  );
}
