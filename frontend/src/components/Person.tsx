import type { ReactNode } from "react";
import type { UserSummary } from "@/lib/types";
import { Avatar } from "./Avatar";

export function Person({
  user,
  subtitle,
  actions,
  onSelect,
}: {
  user: UserSummary;
  subtitle?: string;
  actions?: ReactNode;
  onSelect?: () => void;
}) {
  return (
    <div className="row">
      <div
        className={`person${onSelect ? " clickable" : ""}`}
        onClick={onSelect}
        role={onSelect ? "button" : undefined}
        tabIndex={onSelect ? 0 : undefined}
        onKeyDown={
          onSelect
            ? (e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onSelect();
                }
              }
            : undefined
        }
      >
        <Avatar user={user} />
        <span style={{ minWidth: 0 }}>
          <div className="name">{user.display_name}</div>
          <div className="email">{subtitle ?? `@${user.username}`}</div>
        </span>
      </div>
      {actions ? <div className="actions">{actions}</div> : null}
    </div>
  );
}
