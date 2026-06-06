"use client";

import { useEffect, useState } from "react";
import { fetchOAuthProviders, oauthStartUrl } from "@/lib/api";
import { useI18n } from "@/lib/i18n";

// OAuthButtons renders a "Continue with …" link for each social-login provider
// the backend has configured. It asks the backend which providers are on, so a
// provider that isn't set up never shows a dead button. Each button is a plain
// full-page link: the OAuth flow is a browser redirect, not an XHR call.
export function OAuthButtons() {
  const { t } = useI18n();
  const [providers, setProviders] = useState<string[]>([]);

  useEffect(() => {
    fetchOAuthProviders().then(setProviders);
  }, []);

  if (providers.length === 0) return null;

  return (
    <div className="mt-5">
      <div className="flex items-center gap-3 text-[13px] text-[color:var(--muted)]">
        <span className="h-px flex-1 bg-[color:var(--border)]" />
        {t.login.or}
        <span className="h-px flex-1 bg-[color:var(--border)]" />
      </div>

      <div className="flex flex-col gap-2.5 mt-4">
        {providers.includes("github") ? (
          <a className="oauth-btn" href={oauthStartUrl("github")}>
            <GithubMark />
            {t.login.withGithub}
          </a>
        ) : null}
        {providers.includes("google") ? (
          <a className="oauth-btn" href={oauthStartUrl("google")}>
            <GoogleMark />
            {t.login.withGoogle}
          </a>
        ) : null}
      </div>
    </div>
  );
}

function GithubMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
      <path d="M12 .5C5.37.5 0 5.87 0 12.5c0 5.3 3.44 9.8 8.21 11.39.6.11.82-.26.82-.58 0-.29-.01-1.04-.02-2.05-3.34.73-4.04-1.61-4.04-1.61-.55-1.39-1.34-1.76-1.34-1.76-1.09-.74.08-.73.08-.73 1.2.08 1.84 1.24 1.84 1.24 1.07 1.83 2.81 1.3 3.5.99.11-.78.42-1.3.76-1.6-2.67-.3-5.47-1.34-5.47-5.95 0-1.31.47-2.39 1.24-3.23-.12-.3-.54-1.52.12-3.18 0 0 1.01-.32 3.3 1.23a11.5 11.5 0 0 1 6.01 0c2.29-1.55 3.3-1.23 3.3-1.23.66 1.66.24 2.88.12 3.18.77.84 1.24 1.92 1.24 3.23 0 4.62-2.81 5.64-5.49 5.94.43.37.81 1.1.81 2.22 0 1.6-.01 2.89-.01 3.29 0 .32.21.7.82.58A12.01 12.01 0 0 0 24 12.5C24 5.87 18.63.5 12 .5Z" />
    </svg>
  );
}

function GoogleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#4285F4" d="M23.52 12.27c0-.82-.07-1.6-.21-2.36H12v4.46h6.46a5.52 5.52 0 0 1-2.4 3.62v3h3.88c2.27-2.09 3.58-5.17 3.58-8.72Z" />
      <path fill="#34A853" d="M12 24c3.24 0 5.96-1.08 7.94-2.91l-3.88-3c-1.08.72-2.45 1.15-4.06 1.15-3.12 0-5.77-2.11-6.71-4.95H1.28v3.1A12 12 0 0 0 12 24Z" />
      <path fill="#FBBC05" d="M5.29 14.29a7.2 7.2 0 0 1 0-4.58v-3.1H1.28a12 12 0 0 0 0 10.78l4.01-3.1Z" />
      <path fill="#EA4335" d="M12 4.75c1.76 0 3.34.6 4.59 1.79l3.43-3.43C17.95 1.18 15.23 0 12 0A12 12 0 0 0 1.28 6.61l4.01 3.1C6.23 6.86 8.88 4.75 12 4.75Z" />
    </svg>
  );
}
