import { avatarUrl } from "@/lib/api";

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.[0] ?? "?";
  const second = parts.length > 1 ? parts[parts.length - 1][0] : "";
  return (first + second).toUpperCase();
}

interface AvatarUser {
  id: string;
  display_name: string;
  avatar_updated_at: string | null;
}

/** Round avatar: the user's image when set, otherwise their initials. */
export function Avatar({ user, size = 36 }: { user: AvatarUser; size?: number }) {
  if (user.avatar_updated_at) {
    return (
      <span
        className="avatar"
        style={{ width: size, height: size, padding: 0, overflow: "hidden" }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={avatarUrl(user.id, user.avatar_updated_at)}
          alt={user.display_name}
          width={size}
          height={size}
          style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
        />
      </span>
    );
  }
  return (
    <span
      className="avatar"
      style={{ width: size, height: size, fontSize: Math.round(size * 0.42) }}
    >
      {initials(user.display_name)}
    </span>
  );
}
