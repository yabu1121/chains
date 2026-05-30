import type { ApiErrorBody } from "./types";

const BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8080";

const TOKEN_KEY = "chains.token";

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  window.localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  window.localStorage.removeItem(TOKEN_KEY);
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
  /** When false, no Authorization header is sent (login/register). */
  auth?: boolean;
}

/** apiFetch is the single entry point for talking to the backend. */
export async function apiFetch<T>(
  path: string,
  opts: RequestOptions = {},
): Promise<T> {
  const { method = "GET", body, auth = true } = opts;

  const headers: Record<string, string> = {};
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (auth) {
    const token = getToken();
    if (token) headers["Authorization"] = `Bearer ${token}`;
  }

  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

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
  return `${BASE_URL}/api/users/${userId}/avatar${v}`;
}

function authHeaders(): Record<string, string> {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/** Uploads the caller's avatar (raw image body) and returns the new version. */
export async function uploadAvatar(
  file: File,
): Promise<{ avatar_updated_at: string; content_type: string }> {
  const res = await fetch(`${BASE_URL}/api/me/avatar`, {
    method: "PUT",
    headers: {
      "Content-Type": file.type || "application/octet-stream",
      ...authHeaders(),
    },
    body: file,
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : undefined;
  if (!res.ok) {
    const err = (data as ApiErrorBody | undefined)?.error;
    throw new ApiError(
      res.status,
      err?.code ?? "unknown",
      err?.message ?? `upload failed with status ${res.status}`,
    );
  }
  return data;
}

/** Removes the caller's avatar. */
export async function deleteAvatar(): Promise<void> {
  const res = await fetch(`${BASE_URL}/api/me/avatar`, {
    method: "DELETE",
    headers: authHeaders(),
  });
  if (!res.ok && res.status !== 204) {
    throw new ApiError(res.status, "unknown", `delete failed with status ${res.status}`);
  }
}
