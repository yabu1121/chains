import type { ReactNode } from "react";
import type { UserSummary } from "@/lib/types";

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.[0] ?? "?";
  const second = parts.length > 1 ? parts[parts.length - 1][0] : "";
  return (first + second).toUpperCase();
}

export function Person({
  user,
  subtitle,
  actions,
}: {
  user: UserSummary;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="row">
      <div className="person">
        <span className="avatar">{initials(user.display_name)}</span>
        <span style={{ minWidth: 0 }}>
          <div className="name">{user.display_name}</div>
          <div className="email">{subtitle ?? `@${user.username}`}</div>
        </span>
      </div>
      {actions ? <div className="actions">{actions}</div> : null}
    </div>
  );
}
