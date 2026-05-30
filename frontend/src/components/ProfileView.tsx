import type { ReactNode } from "react";
import type { PublicProfile } from "@/lib/types";
import { Avatar } from "./Avatar";

interface LinkItem {
  label: string;
  href: string;
}

/** Builds the visible external links from a profile's handles/urls. */
function links(p: PublicProfile): LinkItem[] {
  const out: LinkItem[] = [];
  if (p.x_handle) out.push({ label: `X @${p.x_handle}`, href: `https://x.com/${p.x_handle}` });
  if (p.github_handle)
    out.push({ label: `GitHub @${p.github_handle}`, href: `https://github.com/${p.github_handle}` });
  if (p.zenn_handle)
    out.push({ label: `Zenn @${p.zenn_handle}`, href: `https://zenn.dev/${p.zenn_handle}` });
  if (p.linkedin_url) out.push({ label: "LinkedIn", href: p.linkedin_url });
  if (p.portfolio_url) out.push({ label: "Portfolio", href: p.portfolio_url });
  return out;
}

/** Builds the muted meta line: age · born · joined date. */
function profileMeta(p: PublicProfile): string {
  const parts: string[] = [];
  if (p.age != null) parts.push(`Age ${p.age}`);
  if (p.birth_date) {
    const d = new Date(p.birth_date);
    parts.push(
      `Born ${d.toLocaleDateString(undefined, {
        year: "numeric",
        month: "long",
        day: "numeric",
      })}`,
    );
  }
  if (p.created_at) {
    const d = new Date(p.created_at);
    parts.push(
      `Joined ${d.toLocaleDateString(undefined, {
        year: "numeric",
        month: "long",
      })}`,
    );
  }
  return parts.join(" · ");
}

export function ProfileView({
  profile,
  actions,
}: {
  profile: PublicProfile;
  actions?: ReactNode;
}) {
  const items = links(profile);
  const meta = profileMeta(profile);
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <Avatar user={profile} size={48} />
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 18 }}>{profile.display_name}</div>
          <div className="muted">@{profile.username}</div>
          {profile.job_title ? (
            <div style={{ color: "var(--accent)", fontSize: 14, fontWeight: 600 }}>
              {profile.job_title}
            </div>
          ) : null}
        </div>
      </div>

      {meta ? (
        <div className="muted" style={{ marginTop: 12, fontSize: 13 }}>
          {meta}
        </div>
      ) : null}

      {profile.status_message ? (
        <p style={{ marginTop: 14, whiteSpace: "pre-wrap" }}>
          {profile.status_message}
        </p>
      ) : null}

      {profile.languages.length > 0 ? (
        <div style={{ marginTop: 14 }}>
          <div className="section-title">Languages</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {profile.languages.map((lang) => (
              <span
                key={lang}
                style={{
                  background: "var(--panel-2)",
                  border: "1px solid var(--border)",
                  borderRadius: 999,
                  padding: "3px 10px",
                  fontSize: 13,
                }}
              >
                {lang}
              </span>
            ))}
          </div>
        </div>
      ) : null}

      {items.length > 0 ? (
        <div style={{ marginTop: 14, display: "flex", flexWrap: "wrap", gap: 8 }}>
          {items.map((l) => (
            <a
              key={l.label}
              href={l.href}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                border: "1px solid var(--border)",
                borderRadius: 999,
                padding: "5px 12px",
                fontSize: 13,
              }}
            >
              {l.label} ↗
            </a>
          ))}
        </div>
      ) : profile.links_visible ? (
        <p className="empty" style={{ marginTop: 14 }}>
          No links yet.
        </p>
      ) : (
        <p className="empty" style={{ marginTop: 14 }}>
          🔒 Links are shared with friends only. Add {profile.display_name} as a
          friend to see them.
        </p>
      )}

      {actions ? <div style={{ marginTop: 16 }}>{actions}</div> : null}
    </div>
  );
}
