// Shapes mirror the backend JSON responses (see internal/features/*).

export interface SocialProfile {
  bio: string;
  x_handle: string;
  github_handle: string;
  zenn_handle: string;
  linkedin_url: string;
  portfolio_url: string;
}

export interface User extends SocialProfile {
  id: string;
  email: string;
  username: string;
  display_name: string;
  created_at: string;
}

export interface PublicProfile extends SocialProfile {
  id: string;
  username: string;
  display_name: string;
  languages: string[];
}

export interface UserSummary {
  id: string;
  username: string;
  display_name: string;
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
