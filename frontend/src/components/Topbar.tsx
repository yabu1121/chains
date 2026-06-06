"use client";

import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { LogoutIcon } from "@/components/LogoutIcon";

// Mobile-only header (the desktop layout uses the sidebar). One tidy row:
// the wordmark on the left, then the signed-in name, language and a sign-out
// icon on the right — compact enough to never wrap.
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
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="brand-logo" src="/chains-logo.png" alt="chains" />
      </button>
      <div className="actions">
        {user ? <span className="topbar-name">{user.display_name}</span> : null}
        <LanguageSwitcher />
        <button
          className="ghost icon-btn"
          onClick={logout}
          aria-label={t.nav.logout}
          title={t.nav.logout}
        >
          <LogoutIcon />
        </button>
      </div>
    </div>
  );
}
