"use client";

import { useAuth } from "@/lib/auth";

export function Topbar() {
  const { user, logout } = useAuth();
  return (
    <div className="topbar">
      <span className="brand">⛓ chains</span>
      <div className="actions">
        {user ? <span className="muted">{user.display_name}</span> : null}
        <button className="ghost" onClick={logout}>
          Log out
        </button>
      </div>
    </div>
  );
}
