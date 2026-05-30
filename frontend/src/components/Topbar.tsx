"use client";

import { useAuth } from "@/lib/auth";

export function Topbar({ onBrandClick }: { onBrandClick?: () => void }) {
  const { user, logout } = useAuth();
  return (
    <div className="topbar">
      <button
        type="button"
        className="brand"
        onClick={onBrandClick}
        title="View your profile"
      >
        ⛓ chains
      </button>
      <div className="actions">
        {user ? <span className="muted">{user.display_name}</span> : null}
        <button className="ghost" onClick={logout}>
          Log out
        </button>
      </div>
    </div>
  );
}
