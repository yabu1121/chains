import type { PublicProfile } from "./types";

// The dimensions that make a profile useful — for discovery, for News
// recommendations, and for giving people a reason to connect. Each key maps to a
// hint string in the i18n `completeness.items` dictionary.
export type CompletenessKey =
  | "avatar"
  | "languages"
  | "interests"
  | "lookingFor"
  | "canHelpWith"
  | "buildingNow"
  | "links";

export interface CompletenessItem {
  key: CompletenessKey;
  done: boolean;
}

export interface Completeness {
  percent: number;
  items: CompletenessItem[];
  missing: CompletenessItem[];
}

/** Scores how complete a profile is, and what's still missing. */
export function profileCompleteness(p: PublicProfile): Completeness {
  const hasLink = !!(
    p.x_handle ||
    p.github_handle ||
    p.zenn_handle ||
    p.linkedin_url ||
    p.portfolio_url
  );
  const items: CompletenessItem[] = [
    { key: "avatar", done: !!p.avatar_updated_at },
    { key: "languages", done: p.languages.length > 0 },
    { key: "interests", done: p.interests.trim() !== "" },
    { key: "lookingFor", done: p.looking_for.trim() !== "" },
    { key: "canHelpWith", done: p.can_help_with.trim() !== "" },
    { key: "buildingNow", done: p.building_now.trim() !== "" },
    { key: "links", done: hasLink },
  ];
  const done = items.filter((i) => i.done).length;
  const percent = Math.round((done / items.length) * 100);
  return { percent, items, missing: items.filter((i) => !i.done) };
}
