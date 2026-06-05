"use client";

import useSWR, { mutate } from "swr";
import { apiFetch } from "./api";
import type {
  FriendSummary,
  NetworkGraph,
  PublicProfile,
  RequestSummary,
  SocialProfile,
  UserSummary,
  Visibility,
} from "./types";

// SWR keys are the API paths, so mutations can target them precisely.
const KEYS = {
  friends: "/api/friends",
  incoming: "/api/friends/requests/incoming",
  outgoing: "/api/friends/requests/outgoing",
  incomingCount: "/api/friends/requests/incoming/count",
  blocked: "/api/blocks",
  network: "/api/network",
};

const fetcher = <T>(path: string) => apiFetch<T>(path);

export function useFriends() {
  const { data, error, isLoading } = useSWR<{ friends: FriendSummary[] }>(
    KEYS.friends,
    fetcher,
  );
  return { friends: data?.friends ?? [], error, isLoading };
}

export function useIncomingRequests() {
  const { data, error, isLoading } = useSWR<{ requests: RequestSummary[] }>(
    KEYS.incoming,
    fetcher,
  );
  return { requests: data?.requests ?? [], error, isLoading };
}

export function useOutgoingRequests() {
  const { data, error, isLoading } = useSWR<{ requests: RequestSummary[] }>(
    KEYS.outgoing,
    fetcher,
  );
  return { requests: data?.requests ?? [], error, isLoading };
}

export function useIncomingCount() {
  const { data } = useSWR<{ count: number }>(KEYS.incomingCount, fetcher, {
    refreshInterval: 30_000,
  });
  return data?.count ?? 0;
}

export function useNetwork() {
  const { data, error, isLoading } = useSWR<NetworkGraph>(
    KEYS.network,
    fetcher,
    { refreshInterval: 30_000 },
  );
  return { graph: data, error, isLoading };
}

/** Revalidates everything affected by a relationship change. */
async function revalidateAll() {
  await Promise.all(Object.values(KEYS).map((k) => mutate(k)));
}

export async function searchUsers(
  query: string,
  language?: string,
): Promise<UserSummary[]> {
  const params = new URLSearchParams();
  if (query) params.set("q", query);
  if (language) params.set("lang", language);
  const data = await apiFetch<{ results: UserSummary[] }>(
    `/api/users/search?${params.toString()}`,
  );
  return data.results;
}

export async function sendRequest(
  addresseeId: string,
  message = "",
): Promise<void> {
  await apiFetch("/api/friends/requests", {
    method: "POST",
    body: { addressee_id: addresseeId, message },
  });
  await revalidateAll();
}

/**
 * BridgeInfo is returned when accepting a request joined two previously-separate
 * clusters of the friendship graph. your_side / their_side are the sizes of the
 * two groups the new friendship united (each includes its own endpoint).
 */
export interface BridgeInfo {
  your_side: number;
  their_side: number;
}

/**
 * Accepts a friend request. Resolves to a BridgeInfo when the new friendship
 * bridged two separate clusters (the UI celebrates this), or null for an
 * ordinary accept within an already-connected group.
 */
export async function acceptRequest(
  requestId: string,
): Promise<BridgeInfo | null> {
  const data = await apiFetch<{ bridge: BridgeInfo | null }>(
    `/api/friends/requests/${requestId}/accept`,
    { method: "POST" },
  );
  await revalidateAll();
  return data?.bridge ?? null;
}

export async function rejectRequest(requestId: string): Promise<void> {
  await apiFetch(`/api/friends/requests/${requestId}`, { method: "DELETE" });
  await revalidateAll();
}

export async function removeFriend(userId: string): Promise<void> {
  await apiFetch(`/api/friends/${userId}`, { method: "DELETE" });
  await revalidateAll();
}

export async function blockUser(userId: string): Promise<void> {
  await apiFetch("/api/blocks", { method: "POST", body: { user_id: userId } });
  await revalidateAll();
}

/** Fetches a user's public profile (used when tapping a graph node). */
export function getProfile(userId: string): Promise<PublicProfile> {
  return apiFetch<PublicProfile>(`/api/users/${userId}`);
}

/** Resolves a public profile by username (used by the QR / add-by-link flow). */
export function getProfileByUsername(username: string): Promise<PublicProfile> {
  return apiFetch<PublicProfile>(
    `/api/users/by-username/${encodeURIComponent(username)}`,
  );
}

export interface ProfileInput extends SocialProfile {
  display_name: string;
  languages: string[];
  birth_date: string; // "YYYY-MM-DD" or "" to clear
  show_age: boolean;
  show_birth_date: boolean;
  x_handle_visibility: Visibility;
  github_handle_visibility: Visibility;
  zenn_handle_visibility: Visibility;
  linkedin_url_visibility: Visibility;
  portfolio_url_visibility: Visibility;
}

/** Updates the caller's own profile and refreshes the graph cache. */
export async function updateProfile(
  input: ProfileInput,
): Promise<PublicProfile> {
  const p = await apiFetch<PublicProfile>("/api/me/profile", {
    method: "PUT",
    body: input,
  });
  await mutate(KEYS.network);
  return p;
}
