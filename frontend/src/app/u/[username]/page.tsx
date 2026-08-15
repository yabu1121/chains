import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ProfileView } from "@/components/ProfileView";
import type { PublicProfile } from "@/lib/types";

// Server-side API origin. The public profile endpoint needs no auth, so this
// page can be statically shareable with rich OGP previews.
const API =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8080";

async function fetchProfile(username: string): Promise<PublicProfile | null> {
  try {
    const res = await fetch(
      `${API}/api/public/users/${encodeURIComponent(username)}`,
      { cache: "no-store" },
    );
    if (!res.ok) return null;
    return (await res.json()) as PublicProfile;
  } catch {
    return null;
  }
}

type Params = { params: Promise<{ username: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { username } = await params;
  const p = await fetchProfile(username);
  if (!p) return { title: "chains" };

  const title = `${p.display_name} (@${p.username}) · chains`;
  const description =
    p.status_message ||
    p.looking_for ||
    p.job_title ||
    `${p.display_name} on chains`;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: "profile",
      siteName: "chains",
      images: ["/chains-logo.png"],
    },
    twitter: { card: "summary", title, description },
  };
}

export default async function PublicProfilePage({ params }: Params) {
  const { username } = await params;
  const p = await fetchProfile(username);
  if (!p) notFound();

  return (
    <main className="public-profile">
      <div className="card">
        <ProfileView profile={p} />
      </div>
      <Link className="public-profile-cta" href="/">
        Open chains →
      </Link>
    </main>
  );
}
