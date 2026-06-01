import type { ApiErrorBody } from "./types";

// Resolve the API base URL at call time: prefer the runtime value injected by
// the server (window.__CHAINS_CONFIG__, see app/layout.tsx) so the same build
// can target any API; otherwise the build-time NEXT_PUBLIC value, then a local
// default.
function baseUrl(): string {
  if (typeof window !== "undefined") {
    const cfg = (
      window as unknown as { __CHAINS_CONFIG__?: { apiBaseUrl?: string } }
    ).__CHAINS_CONFIG__;
    if (cfg?.apiBaseUrl) return cfg.apiBaseUrl;
  }
  return process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8080";
}

/** ApiError carries the backend's stable error code and HTTP status. */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

interface RequestOptions {
  method?: string;
  body?: unknown;
  /**
   * When false, a 401 will NOT trigger a silent token refresh + retry. Used by
   * the auth endpoints themselves (login/register), where a 401 is a real
   * answer rather than an expired access token.
   */
  refreshOn401?: boolean;
}

// Authentication is carried entirely by httpOnly cookies set by the backend,
// so every request must opt into sending credentials. The access token is
// short-lived; a 401 on a normal request usually just means it expired, so we
// transparently refresh once and retry.

/** Single-flight refresh so concurrent 401s don't stampede /auth/refresh. */
let refreshInFlight: Promise<boolean> | null = null;

function refreshSession(): Promise<boolean> {
  if (!refreshInFlight) {
    refreshInFlight = fetch(`${baseUrl()}/api/auth/refresh`, {
      method: "POST",
      credentials: "include",
    })
      .then((res) => res.ok)
      .catch(() => false)
      .finally(() => {
        refreshInFlight = null;
      });
  }
  return refreshInFlight;
}

/** apiFetch is the single entry point for talking to the backend. */
export async function apiFetch<T>(
  path: string,
  opts: RequestOptions = {},
): Promise<T> {
  const { method = "GET", body, refreshOn401 = true } = opts;

  const send = () => {
    const headers: Record<string, string> = {};
    if (body !== undefined) headers["Content-Type"] = "application/json";
    return fetch(`${baseUrl()}${path}`, {
      method,
      headers,
      credentials: "include",
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  };

  let res = await send();
  if (res.status === 401 && refreshOn401) {
    if (await refreshSession()) {
      res = await send();
    }
  }

  return parse<T>(res);
}

async function parse<T>(res: Response): Promise<T> {
  if (res.status === 204) {
    return undefined as T;
  }

  const text = await res.text();
  const data = text ? JSON.parse(text) : undefined;

  if (!res.ok) {
    const err = (data as ApiErrorBody | undefined)?.error;
    throw new ApiError(
      res.status,
      err?.code ?? "unknown",
      err?.message ?? `request failed with status ${res.status}`,
    );
  }

  return data as T;
}

/** Public URL for a user's avatar image. `version` (avatar_updated_at) busts the cache. */
export function avatarUrl(userId: string, version: string | null): string {
  const v = version ? `?v=${encodeURIComponent(version)}` : "";
  return `${baseUrl()}/api/users/${userId}/avatar${v}`;
}

/** Uploads the caller's avatar (raw image body) and returns the new version. */
export async function uploadAvatar(
  file: File,
): Promise<{ avatar_updated_at: string; content_type: string }> {
  const res = await fetch(`${baseUrl()}/api/me/avatar`, {
    method: "PUT",
    headers: { "Content-Type": file.type || "application/octet-stream" },
    credentials: "include",
    body: file,
  });
  return parse(res);
}

/** Permanently deletes the caller's account after re-confirming the password. */
export async function deleteAccount(password: string): Promise<void> {
  await apiFetch<void>("/api/me", {
    method: "DELETE",
    refreshOn401: false,
    body: { password },
  });
}

/** Removes the caller's avatar. */
export async function deleteAvatar(): Promise<void> {
  const res = await fetch(`${baseUrl()}/api/me/avatar`, {
    method: "DELETE",
    credentials: "include",
  });
  if (!res.ok && res.status !== 204) {
    throw new ApiError(res.status, "unknown", `delete failed with status ${res.status}`);
  }
}
