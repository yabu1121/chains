"use client";

import useSWR, { mutate } from "swr";
import { apiFetch } from "./api";
import type {
  AboutProfile,
  AdminReport,
  Beacon,
  CardLayout,
  CardTheme,
  CardType,
  ConnectionCard,
  CommunityDetail,
  CommunityNetwork,
  CommunitySummary,
  FollowUp,
  FollowUpStatus,
  FriendSummary,
  NoteSummary,
  NetworkGraph,
  NewsFeedResponse,
  Note,
  PublicProfile,
  Recommendation,
  RequestSummary,
  SavedArticle,
  SavedStatus,
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
  recommendations: "/api/recommendations",
  communities: "/api/communities",
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

/**
 * The personalised news feed. With no language it is tailored to the caller's
 * registered languages; passing a language narrows it to that one. Refreshes
 * occasionally since the backend caches upstream results anyway.
 */
export function useNewsFeed(language?: string) {
  const path = language
    ? `/api/news/feed?lang=${encodeURIComponent(language)}`
    : "/api/news/feed";
  const { data, error, isLoading } = useSWR<NewsFeedResponse>(path, fetcher, {
    refreshInterval: 5 * 60_000,
    revalidateOnFocus: false,
  });
  return { feed: data, error, isLoading };
}

/** People you might want to connect with (friends-of-friends with reasons). */
export function useRecommendations() {
  const { data, error, isLoading } = useSWR<{
    recommendations: Recommendation[];
  }>(KEYS.recommendations, fetcher);
  return { recommendations: data?.recommendations ?? [], error, isLoading };
}

// --- Saved articles (reading list) ------------------------------------------

export const savedKey = (status?: string) =>
  status ? `/api/saved?status=${status}` : "/api/saved";

/** Revalidates every saved-articles view (reading list, hidden, the feed's map). */
function revalidateSaved() {
  return mutate(
    (key) => typeof key === "string" && key.startsWith("/api/saved"),
  );
}

/** The caller's saved articles. status: undefined → reading list (unread+read),
 *  "all" → everything incl. hidden, or a specific status. */
export function useSavedArticles(status?: string) {
  const { data, error, isLoading } = useSWR<{ articles: SavedArticle[] }>(
    savedKey(status),
    fetcher,
  );
  return { articles: data?.articles ?? [], error, isLoading };
}

/** The minimal article shape needed to save (the feed and cards both satisfy it). */
export interface SaveArticleInput {
  url: string;
  title: string;
  source?: string;
  author?: string;
  summary?: string;
  language?: string;
  published_at: string | null;
}

/** Saves an article from the feed (status unread by default, or "hidden"). */
export async function saveArticle(
  article: SaveArticleInput,
  status?: SavedStatus,
): Promise<void> {
  await apiFetch("/api/saved", {
    method: "POST",
    body: {
      url: article.url,
      title: article.title,
      source: article.source,
      author: article.author,
      summary: article.summary,
      language: article.language,
      published_at: article.published_at,
      status,
    },
  });
  await revalidateSaved();
  track(status === "hidden" ? "article_hidden" : "article_saved", {
    source: article.source,
    language: article.language,
  });
}

/** Changes a saved article's status (unread / read / hidden). */
export async function setSavedStatus(
  id: string,
  status: SavedStatus,
): Promise<void> {
  await apiFetch(`/api/saved/${id}`, { method: "PATCH", body: { status } });
  await revalidateSaved();
}

/** Removes an article from the reading list entirely. */
export async function removeSaved(id: string): Promise<void> {
  await apiFetch(`/api/saved/${id}`, { method: "DELETE" });
  await revalidateSaved();
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

export interface ProfileInput extends SocialProfile, AboutProfile {
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

/** SWR key for the private note the caller keeps about a user. */
export const noteKey = (userId: string) => `/api/notes/${userId}`;
const followUpsKey = "/api/notes/follow-ups";
const noteSummariesKey = "/api/notes";

/** Revalidates every note-derived view (the note itself, follow-ups, summaries). */
function revalidateNotes(userId?: string) {
  return Promise.all([
    userId ? mutate(noteKey(userId)) : Promise.resolve(),
    mutate(followUpsKey),
    mutate(noteSummariesKey),
  ]);
}

/** People the user should reach out to now (pending / due follow-ups). */
export function useFollowUps() {
  const { data, error, isLoading } = useSWR<{ follow_ups: FollowUp[] }>(
    followUpsKey,
    fetcher,
  );
  return { followUps: data?.follow_ups ?? [], error, isLoading };
}

/** Compact list of everyone the caller has logged a note about. */
export function useNoteSummaries() {
  const { data, error, isLoading } = useSWR<{ notes: NoteSummary[] }>(
    noteSummariesKey,
    fetcher,
  );
  return { notes: data?.notes ?? [], error, isLoading };
}

export interface NoteInput {
  where_met: string;
  what_discussed: string;
  topic_tags: string[];
  next_action: string;
  met_on: string; // "YYYY-MM-DD" or ""
  due_on: string;
  follow_up_status: FollowUpStatus;
  memo: string;
}

/** Fetches the caller's private note about a user (empty when none saved). */
export function getNote(userId: string): Promise<Note> {
  return apiFetch<Note>(noteKey(userId));
}

/** Creates or updates the caller's private note about a user. */
export async function saveNote(
  userId: string,
  input: NoteInput,
): Promise<Note> {
  const note = await apiFetch<Note>(noteKey(userId), {
    method: "PUT",
    body: input,
  });
  await mutate(noteKey(userId), note, { revalidate: false });
  await revalidateNotes();
  track("note_saved", { follow_up_status: input.follow_up_status });
  return note;
}

/** Quick follow-up status change (contacted / snoozed / dismissed). dueOn is
 *  used when snoozing (the date it should resurface). */
export async function setFollowUpStatus(
  userId: string,
  status: FollowUpStatus,
  dueOn = "",
): Promise<void> {
  await apiFetch(`/api/notes/${userId}/status`, {
    method: "PATCH",
    body: { follow_up_status: status, due_on: dueOn },
  });
  await revalidateNotes(userId);
  const done = status === "contacted" || status === "dismissed";
  track(done ? "followup_completed" : "followup_set", { status });
}

/** Deletes the caller's private note about a user. */
export async function deleteNote(userId: string): Promise<void> {
  await apiFetch(noteKey(userId), { method: "DELETE" });
  await revalidateNotes(userId);
}

// --- Analytics --------------------------------------------------------------

/** Fire-and-forget first-party analytics event. Never throws or blocks the UI. */
export function track(name: string, props?: Record<string, unknown>): void {
  void apiFetch("/api/events", { method: "POST", body: { name, props } }).catch(
    () => {},
  );
}

// --- Account & safety -------------------------------------------------------

/** Downloads everything chains holds about the caller as a JSON file. */
export async function exportData(): Promise<void> {
  const data = await apiFetch<unknown>("/api/me/export");
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "chains-export.json";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** Files a report against another user. */
export async function reportUser(
  reportedId: string,
  reason: string,
  details: string,
): Promise<void> {
  await apiFetch("/api/reports", {
    method: "POST",
    body: { reported_id: reportedId, reason, details },
  });
}

const adminReportsKey = "/api/admin/reports";

/** The moderation queue (admin only; errors with 403 for non-admins). */
export function useAdminReports() {
  const { data, error, isLoading } = useSWR<{ reports: AdminReport[] }>(
    adminReportsKey,
    fetcher,
    { shouldRetryOnError: false },
  );
  return { reports: data?.reports ?? [], error, isLoading };
}

/** Updates a report's moderation status (admin only). */
export async function setReportStatus(
  id: string,
  status: string,
): Promise<void> {
  await apiFetch(`/api/admin/reports/${id}`, {
    method: "PATCH",
    body: { status },
  });
  await mutate(adminReportsKey);
}

// --- Connection Cards -------------------------------------------------------

export interface CardInput {
  recipient_id: string;
  type: CardType;
  topic: string;
  tags: string[];
  article_url: string;
  article_title: string;
  next_action: string;
  message: string;
  template?: string;
  theme?: CardTheme;
  layout?: CardLayout;
}

const cardInboxKey = "/api/cards/inbox";
const cardSentKey = "/api/cards/sent";
const cardUnreadKey = "/api/cards/inbox/unread/count";

/** Revalidates the card lists, unread badge, and any open per-person history. */
function revalidateCards() {
  return Promise.all([
    mutate(cardInboxKey),
    mutate(cardSentKey),
    mutate(cardUnreadKey),
    mutate(
      (key) => typeof key === "string" && key.startsWith("/api/cards/with/"),
    ),
  ]);
}

/** Cards received by the caller. */
export function useCardInbox() {
  const { data, error, isLoading } = useSWR<{ cards: ConnectionCard[] }>(
    cardInboxKey,
    fetcher,
  );
  return { cards: data?.cards ?? [], error, isLoading };
}

/** Cards the caller has sent. */
export function useCardsSent() {
  const { data, error, isLoading } = useSWR<{ cards: ConnectionCard[] }>(
    cardSentKey,
    fetcher,
  );
  return { cards: data?.cards ?? [], error, isLoading };
}

/** Unread received-card count (for the nav badge). Polls occasionally. */
export function useCardUnreadCount() {
  const { data } = useSWR<{ count: number }>(cardUnreadKey, fetcher, {
    refreshInterval: 30_000,
  });
  return data?.count ?? 0;
}

/** Sends a Connection Card to a friend. */
export async function sendCard(input: CardInput): Promise<ConnectionCard> {
  const card = await apiFetch<ConnectionCard>("/api/cards", {
    method: "POST",
    body: input,
  });
  await revalidateCards();
  track("card_sent", { type: input.type });
  return card;
}

/** All cards exchanged with one person (both directions), newest first. */
export function useCardHistory(userId: string | null) {
  const { data, isLoading } = useSWR<{ cards: ConnectionCard[] }>(
    userId ? `/api/cards/with/${userId}` : null,
    fetcher,
  );
  return { cards: data?.cards ?? [], isLoading };
}

/** Marks a received card read. */
export async function markCardRead(id: string): Promise<void> {
  await apiFetch(`/api/cards/${id}/read`, { method: "PATCH" });
  await Promise.all([mutate(cardInboxKey), mutate(cardUnreadKey)]);
}

/** Introduces two friends: sends each an intro card naming the other. */
export async function sendBridge(
  userAId: string,
  userBId: string,
  reason: string,
): Promise<void> {
  await apiFetch("/api/cards/bridge", {
    method: "POST",
    body: { user_a_id: userAId, user_b_id: userBId, reason },
  });
  await revalidateCards();
  track("bridge_sent");
}

// --- Beacons ----------------------------------------------------------------

const myBeaconKey = "/api/beacons/me";
const friendBeaconsKey = "/api/beacons";

/** The caller's active beacon (null when none). */
export function useMyBeacon() {
  const { data, isLoading } = useSWR<{ beacon: Beacon | null }>(
    myBeaconKey,
    fetcher,
  );
  return { beacon: data?.beacon ?? null, isLoading };
}

/** Active beacons among the caller's friends. */
export function useFriendBeacons() {
  const { data, isLoading } = useSWR<{ beacons: Beacon[] }>(
    friendBeaconsKey,
    fetcher,
    { refreshInterval: 60_000 },
  );
  return { beacons: data?.beacons ?? [], isLoading };
}

/** Raises (or replaces) the caller's beacon for ~72h. */
export async function setBeacon(message: string): Promise<void> {
  await apiFetch(myBeaconKey, { method: "PUT", body: { message } });
  await Promise.all([mutate(myBeaconKey), mutate(friendBeaconsKey)]);
  track("beacon_set");
}

/** Lowers the caller's beacon. */
export async function clearBeacon(): Promise<void> {
  await apiFetch(myBeaconKey, { method: "DELETE" });
  await Promise.all([mutate(myBeaconKey), mutate(friendBeaconsKey)]);
}

// --- Communities ------------------------------------------------------------

/** All communities, with member counts and whether the caller has joined. */
export function useCommunities() {
  const { data, error, isLoading } = useSWR<{
    communities: CommunitySummary[];
  }>(KEYS.communities, fetcher);
  return { communities: data?.communities ?? [], error, isLoading };
}

export const communityKey = (id: string) => `/api/communities/${id}`;
export const communityNetworkKey = (id: string) =>
  `/api/communities/${id}/network`;

/** Fetches a community with its roster. */
export function getCommunity(id: string): Promise<CommunityDetail> {
  return apiFetch<CommunityDetail>(communityKey(id));
}

/** Fetches the relationship sub-graph among a community's members. */
export function getCommunityNetwork(id: string): Promise<CommunityNetwork> {
  return apiFetch<CommunityNetwork>(communityNetworkKey(id));
}

/** Creates a community (the caller auto-joins) and refreshes the list. */
export async function createCommunity(
  name: string,
  description: string,
): Promise<CommunitySummary> {
  const created = await apiFetch<CommunitySummary>(KEYS.communities, {
    method: "POST",
    body: { name, description },
  });
  await mutate(KEYS.communities);
  return created;
}

/** Joins a community and refreshes the list + that community's detail. */
export async function joinCommunity(id: string): Promise<void> {
  await apiFetch(`/api/communities/${id}/join`, { method: "POST" });
  await Promise.all([
    mutate(KEYS.communities),
    mutate(communityKey(id)),
    mutate(communityNetworkKey(id)),
  ]);
}

/** Leaves a community and refreshes the list + that community's detail. */
export async function leaveCommunity(id: string): Promise<void> {
  await apiFetch(`/api/communities/${id}/leave`, { method: "DELETE" });
  await Promise.all([
    mutate(KEYS.communities),
    mutate(communityKey(id)),
    mutate(communityNetworkKey(id)),
  ]);
}

/** Deletes a community entirely (owner only) and refreshes the list. */
export async function deleteCommunity(id: string): Promise<void> {
  await apiFetch(`/api/communities/${id}`, { method: "DELETE" });
  await mutate(KEYS.communities);
}
