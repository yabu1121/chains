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

export interface PublicProfile extends SocialProfile {
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
  created_at: string;
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
