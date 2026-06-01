import type { ReactNode } from "react";
import type { PublicProfile } from "@/lib/types";
import { Avatar } from "./Avatar";
import { safeHttpUrl } from "@/lib/url";

type Platform = "X" | "GitHub" | "Zenn" | "LinkedIn" | "Portfolio";

interface LinkItem {
  platform: Platform;
  detail: string;
  href: string;
}

// Brand colours so each icon is recognisable at a glance.
const PLATFORM_COLOR: Record<Platform, string> = {
  X: "#000000",
  GitHub: "#181717",
  Zenn: "#3EA8FF",
  LinkedIn: "#0A66C2",
  Portfolio: "#34675c",
};

// Inline brand marks (24×24, single-path, currentColor) so no icon dependency
// is needed. Portfolio uses a generic globe.
const PLATFORM_PATH: Record<Platform, string> = {
  X: "M18.901 1.153h3.68l-8.04 9.19L24 22.846h-7.406l-5.8-7.584-6.638 7.584H.474l8.6-9.83L0 1.154h7.594l5.243 6.932ZM17.61 20.644h2.039L6.486 3.24H4.298Z",
  GitHub:
    "M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23A11.509 11.509 0 0 1 12 5.803c1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222 0 1.606-.014 2.898-.014 3.293 0 .322.216.694.825.576C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12",
  Zenn: "M.264 23.771h4.984c.264 0 .498-.147.645-.352L19.614.874c.176-.293-.03-.675-.381-.675h-4.721c-.235 0-.44.118-.557.323L.03 23.361c-.088.176.029.41.234.41Zm17.181-.352 6.479-10.408c.205-.323-.029-.733-.41-.733h-4.34c-.235 0-.441.118-.558.323l-6.531 10.46c-.117.205.03.469.264.469h4.867c.234 0 .468-.117.556-.293z",
  LinkedIn:
    "M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 0 1-2.063-2.065 2.064 2.064 0 1 1 2.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.225 0h.002z",
  Portfolio:
    "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm6.93 6h-2.95a15.7 15.7 0 0 0-1.38-3.56A8.03 8.03 0 0 1 18.93 8ZM12 4c.83 1.2 1.48 2.53 1.91 4h-3.82A12.6 12.6 0 0 1 12 4ZM4.26 14a7.96 7.96 0 0 1 0-4h3.38a16.5 16.5 0 0 0 0 4H4.26Zm.81 2h2.95c.34 1.27.8 2.47 1.38 3.56A8.03 8.03 0 0 1 5.07 16Zm2.95-8H5.07a8.03 8.03 0 0 1 4.33-3.56A15.7 15.7 0 0 0 8.02 8ZM12 20c-.83-1.2-1.48-2.53-1.91-4h3.82A12.6 12.6 0 0 1 12 20Zm2.34-6H9.66a14.4 14.4 0 0 1 0-4h4.68a14.4 14.4 0 0 1 0 4Zm.27 5.56c.58-1.09 1.04-2.29 1.38-3.56h2.95a8.03 8.03 0 0 1-4.33 3.56ZM16.36 14a16.5 16.5 0 0 0 0-4h3.38a7.96 7.96 0 0 1 0 4h-3.38Z",
};

function PlatformIcon({ platform }: { platform: Platform }) {
  return (
    <svg
      className="pv-link-icon"
      width={18}
      height={18}
      viewBox="0 0 24 24"
      fill={PLATFORM_COLOR[platform]}
      aria-hidden="true"
    >
      <path d={PLATFORM_PATH[platform]} />
    </svg>
  );
}

/** Builds the visible external links, each as a platform + detail row. */
function links(p: PublicProfile): LinkItem[] {
  const out: LinkItem[] = [];
  if (p.x_handle)
    out.push({ platform: "X", detail: `@${p.x_handle}`, href: `https://x.com/${p.x_handle}` });
  if (p.github_handle)
    out.push({ platform: "GitHub", detail: `@${p.github_handle}`, href: `https://github.com/${p.github_handle}` });
  if (p.zenn_handle)
    out.push({ platform: "Zenn", detail: `@${p.zenn_handle}`, href: `https://zenn.dev/${p.zenn_handle}` });
  // linkedin_url / portfolio_url are user-supplied free-form URLs, so verify
  // the scheme is http(s) before trusting them in an href. A non-http URL
  // (e.g. javascript:) is dropped rather than rendered as a clickable link.
  const linkedin = safeHttpUrl(p.linkedin_url);
  if (linkedin)
    out.push({ platform: "LinkedIn", detail: prettyUrl(p.linkedin_url), href: linkedin });
  const portfolio = safeHttpUrl(p.portfolio_url);
  if (portfolio)
    out.push({ platform: "Portfolio", detail: prettyUrl(p.portfolio_url), href: portfolio });
  return out;
}

/** Strips the scheme and trailing slash so a URL reads cleanly in a row. */
function prettyUrl(raw: string): string {
  return raw.replace(/^https?:\/\//, "").replace(/\/$/, "");
}

interface DetailRow {
  label: string;
  value: string;
}

/** Builds the labelled detail rows: age, birth date, joined date. */
function detailRows(p: PublicProfile): DetailRow[] {
  const rows: DetailRow[] = [];
  if (p.age != null) rows.push({ label: "Age", value: String(p.age) });
  if (p.birth_date) {
    const d = new Date(p.birth_date);
    rows.push({
      label: "Born",
      value: d.toLocaleDateString(undefined, {
        year: "numeric",
        month: "long",
        day: "numeric",
      }),
    });
  }
  if (p.created_at) {
    const d = new Date(p.created_at);
    rows.push({
      label: "Joined",
      value: d.toLocaleDateString(undefined, { year: "numeric", month: "long" }),
    });
  }
  return rows;
}

export function ProfileView({
  profile,
  actions,
}: {
  profile: PublicProfile;
  actions?: ReactNode;
}) {
  const items = links(profile);
  const details = detailRows(profile);
  return (
    <div className="profile-view">
      <div className="pv-header">
        <Avatar user={profile} size={64} />
        <div style={{ minWidth: 0 }}>
          <div className="pv-name">{profile.display_name}</div>
          <div className="muted">@{profile.username}</div>
          {profile.job_title ? (
            <span className="pv-job">{profile.job_title}</span>
          ) : null}
        </div>
      </div>

      {profile.status_message ? (
        <p className="pv-bio">{profile.status_message}</p>
      ) : null}

      {details.length > 0 ? (
        <div className="pv-section">
          <div className="section-title">Details</div>
          <dl className="pv-details">
            {details.map((d) => (
              <div className="pv-detail-row" key={d.label}>
                <dt>{d.label}</dt>
                <dd>{d.value}</dd>
              </div>
            ))}
          </dl>
        </div>
      ) : null}

      {profile.languages.length > 0 ? (
        <div className="pv-section">
          <div className="section-title">Languages</div>
          <div className="pv-chips">
            {profile.languages.map((lang) => (
              <span className="pv-chip" key={lang}>
                {lang}
              </span>
            ))}
          </div>
        </div>
      ) : null}

      <div className="pv-section">
        <div className="section-title">Links</div>
        {items.length > 0 ? (
          <div className="pv-links">
            {items.map((l) => (
              <a
                key={l.platform}
                className="pv-link"
                href={l.href}
                target="_blank"
                rel="noopener noreferrer"
              >
                <span className="pv-link-text">
                  <PlatformIcon platform={l.platform} />
                  <span className="pv-link-platform">{l.platform}</span>
                  <span className="pv-link-detail">{l.detail}</span>
                </span>
                <span aria-hidden="true" className="pv-link-go">
                  ↗
                </span>
              </a>
            ))}
          </div>
        ) : (
          <p className="empty">No links to show.</p>
        )}
      </div>

      {actions ? <div className="pv-actions">{actions}</div> : null}
    </div>
  );
}
