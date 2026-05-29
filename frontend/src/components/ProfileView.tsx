import type { ReactNode } from "react";
import type { PublicProfile } from "@/lib/types";

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

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  const a = parts[0]?.[0] ?? "?";
  const b = parts.length > 1 ? parts[parts.length - 1][0] : "";
  return (a + b).toUpperCase();
}

export function ProfileView({
  profile,
  actions,
}: {
  profile: PublicProfile;
  actions?: ReactNode;
}) {
  const items = links(profile);
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <span className="avatar" style={{ width: 48, height: 48, fontSize: 18 }}>
          {initials(profile.display_name)}
        </span>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 18 }}>{profile.display_name}</div>
          <div className="muted">@{profile.username}</div>
        </div>
      </div>

      {profile.bio ? (
        <p style={{ marginTop: 14, whiteSpace: "pre-wrap" }}>{profile.bio}</p>
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
      ) : (
        <p className="empty" style={{ marginTop: 14 }}>
          No links yet.
        </p>
      )}

      {actions ? <div style={{ marginTop: 16 }}>{actions}</div> : null}
    </div>
  );
}
