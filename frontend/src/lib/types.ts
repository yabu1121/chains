// Shapes mirror the backend JSON responses (see internal/features/*).

export interface SocialProfile {
  job_title: string;
  status_message: string;
  x_handle: string;
  github_handle: string;
  zenn_handle: string;
  linkedin_url: string;
  portfolio_url: string;
}

// Who may see an individual account link.
export type Visibility = "public" | "friends" | "private";

// Per-link visibility levels, keyed by the same field names as SocialProfile's
// links. Returned only to the owner so the editor can prefill its selectors.
export interface LinkVisibility {
  x_handle: Visibility;
  github_handle: Visibility;
  zenn_handle: Visibility;
  linkedin_url: Visibility;
  portfolio_url: Visibility;
}

export interface User extends SocialProfile {
  id: string;
  email: string;
  username: string;
  display_name: string;
  avatar_updated_at: string | null;
  created_at: string;
}

// Free-text "about" fields. Always visible; they convey who someone wants to
// connect with (not just which languages they use).
export interface AboutProfile {
  interests: string;
  looking_for: string;
  can_help_with: string;
  building_now: string;
}

export interface PublicProfile extends SocialProfile, AboutProfile {
  id: string;
  username: string;
  display_name: string;
  languages: string[];
  // Per-link visibility levels — populated only when viewing your own profile
  // (for the editor); null otherwise. Links the viewer may not see are blank.
  link_visibility: LinkVisibility | null;
  avatar_updated_at: string | null;
  created_at: string;
  age: number | null;
  birth_date: string | null;
  // Only populated when viewing your own profile (for the editor); null otherwise.
  show_age: boolean | null;
  show_birth_date: boolean | null;
}

export interface UserSummary {
  id: string;
  username: string;
  display_name: string;
  avatar_updated_at: string | null;
  // Populated only for friend lists; absent elsewhere.
  languages?: string[];
}

export interface AuthResponse {
  token: string;
  expires_at: string;
  user: User;
}

export interface FriendSummary {
  user: UserSummary;
  friends_since: string;
}

export interface RequestSummary {
  request_id: string;
  user: UserSummary;
  message: string;
  created_at: string;
}

// The follow-up workflow state for a person you've logged.
export type FollowUpStatus =
  | "none"
  | "pending"
  | "contacted"
  | "snoozed"
  | "dismissed";

// A private interaction log the viewer keeps about another user. Returned only
// to its owner. saved_at is null when no note has been written yet.
export interface Note {
  target_id: string;
  where_met: string;
  what_discussed: string;
  topic_tags: string[];
  next_action: string;
  met_on: string | null; // "YYYY-MM-DD"
  due_on: string | null;
  follow_up_status: FollowUpStatus;
  memo: string;
  saved_at: string | null;
}

// A compact note row (which people you've logged, and their follow-up state).
export interface NoteSummary {
  target_id: string;
  follow_up_status: FollowUpStatus;
}

// A suggested person (a friend-of-friend) plus why they were suggested.
export interface Recommendation {
  user: UserSummary;
  mutual_friends: number;
  shared_languages: string[];
}

// A person the user should reach out to now (from a friend note).
export interface FollowUp {
  user: UserSummary;
  where_met: string;
  what_discussed: string;
  next_action: string;
  due_on: string | null;
  follow_up_status: FollowUpStatus;
  memo: string;
  saved_at: string;
}

// A report in the moderation queue (admin only).
export interface AdminReport {
  id: string;
  reporter_username: string;
  reported_id: string;
  reported_username: string;
  reason: string;
  details: string;
  status: string;
  created_at: string;
}

// The kinds of Connection Card a friend can send.
export type CardType =
  | "thanks"
  | "talk_again"
  | "article"
  | "intro"
  | "consult"
  | "hackathon"
  | "status"
  | "ui_review"
  | "beacon_reply";

// The colour palette a card is rendered in. The card *type* drives structure;
// the theme is the only design choice the sender makes.
export type CardTheme =
  | "paper"
  | "midnight"
  | "sunset"
  | "mint"
  | "blossom"
  | "slate";

export const CARD_THEMES: CardTheme[] = [
  "paper",
  "midnight",
  "sunset",
  "mint",
  "blossom",
  "slate",
];

// The visual structure family of a card, chosen in the Card Studio. The card
// type drives content; the template drives the layout/look.
export type CardTemplate = "classic" | "postcard" | "clipping" | "passport";

export const CARD_TEMPLATES: CardTemplate[] = [
  "classic",
  "postcard",
  "clipping",
  "passport",
];

// The optional content rows a card can show, in order.
export type CardBlock = "message" | "tags" | "article" | "next_action";

// A card's self-describing layout: persisted with the card so it renders the
// same in the composer, inbox, sent list and history. All fields optional —
// CardPreview derives sensible defaults from the card type when absent.
export interface CardLayout {
  showAvatars?: boolean;
  accent?: string;
  title?: string;
  subtitle?: string;
  blocks?: CardBlock[];
}

// A private Connection Card exchanged between friends.
export interface ConnectionCard {
  id: string;
  direction: "received" | "sent";
  type: CardType;
  topic?: string;
  tags: string[];
  article_url?: string;
  article_title?: string;
  next_action?: string;
  message?: string;
  template: string;
  theme: CardTheme;
  layout: CardLayout;
  read: boolean;
  created_at: string;
  sender?: UserSummary;
  recipient?: UserSummary;
}

// An ephemeral "ok to talk to me about this now" signal. user is present for
// friends' beacons, absent for your own.
export interface Beacon {
  user?: UserSummary;
  message: string;
  expires_at: string;
}

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
  };
}

export interface NetworkNode {
  id: string;
  display_name: string;
  avatar_updated_at: string | null;
  languages: string[];
}

export interface NetworkLink {
  source: string;
  target: string;
}

export interface NetworkGraph {
  nodes: NetworkNode[];
  links: NetworkLink[];
  truncated: boolean;
}

// A community (event / group) in a list.
export interface CommunitySummary {
  id: string;
  name: string;
  description: string;
  member_count: number;
  is_member: boolean;
  is_owner: boolean;
  created_at: string;
}

// One person on a community roster (compatible with UserSummary for <Person>).
export interface CommunityMember {
  id: string;
  username: string;
  display_name: string;
  avatar_updated_at: string | null;
  job_title: string;
}

export interface CommunityDetail extends CommunitySummary {
  members: CommunityMember[];
}

export interface CommunityNode {
  id: string;
  display_name: string;
  avatar_updated_at: string | null;
}

// The relationship sub-graph among a community's members.
export interface CommunityNetwork {
  nodes: CommunityNode[];
  links: NetworkLink[];
}

// A structured, explainable reason an article is recommended (rule-based).
export interface NewsReason {
  kind: "language" | "friends" | "saved";
  language?: string;
  count?: number;
}

// One item in the news feed.
export interface NewsArticle {
  title: string;
  url: string;
  source: string;
  author?: string;
  summary?: string;
  language?: string;
  published_at: string;
  reasons?: NewsReason[];
}

// The news feed for a set of languages (empty languages = a general feed).
export interface NewsFeedResponse {
  languages: string[];
  articles: NewsArticle[];
}

export type SavedStatus = "unread" | "read" | "hidden";

// An article on the user's reading list.
export interface SavedArticle {
  id: string;
  url: string;
  title: string;
  source?: string;
  author?: string;
  summary?: string;
  language?: string;
  published_at: string | null;
  status: SavedStatus;
  saved_at: string;
}
