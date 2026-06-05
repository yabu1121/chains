import type { ReactNode } from "react";
import type { UserSummary } from "@/lib/types";
import { Avatar } from "./Avatar";
import { RequestArrow } from "./RequestArrow";

export function Person({
  user,
  subtitle,
  note,
  actions,
  onSelect,
  arrow,
}: {
  user: UserSummary;
  subtitle?: string;
  // Optional free-text note shown under the handle (e.g. a friend request
  // message). Rendered only when non-empty.
  note?: string;
  actions?: ReactNode;
  onSelect?: () => void;
  // When set, render an animated dashed "→" between the person and the
  // actions to show a pending request direction.
  arrow?: "in" | "out";
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
        <span className="min-w-0">
          <div className="name">{user.display_name}</div>
          <div className="email">{subtitle ?? `@${user.username}`}</div>
          {note ? (
            <div className="muted text-[13px] mt-0.5 whitespace-pre-wrap break-words">
              “{note}”
            </div>
          ) : null}
        </span>
      </div>
      {arrow ? <RequestArrow dir={arrow} /> : null}
      {actions ? <div className="actions">{actions}</div> : null}
    </div>
  );
}
