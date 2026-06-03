"use client";

import { useState } from "react";
import useSWR from "swr";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Guard } from "@/components/Guard";
import { ProfileView } from "@/components/ProfileView";
import { useAuth } from "@/lib/auth";
import { ApiError } from "@/lib/api";
import { getProfileByUsername, sendRequest, useFriends } from "@/lib/hooks";
import { useReveal } from "@/lib/anim";
import { useI18n } from "@/lib/i18n";
import type { PublicProfile } from "@/lib/types";

export default function AddPage() {
  return (
    <Guard>
      <AddByUsername />
    </Guard>
  );
}

function AddByUsername() {
  const { t } = useI18n();
  const params = useParams<{ username: string }>();
  const username = params.username;
  const { user } = useAuth();
  const { friends } = useFriends();
  const cardRef = useReveal<HTMLDivElement>();

  const { data, error, isLoading } = useSWR<PublicProfile>(
    username ? `/api/users/by-username/${username}` : null,
    () => getProfileByUsername(username),
  );

  const [requested, setRequested] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const isSelf = !!data && user?.id === data.id;
  const isFriend = !!data && friends.some((f) => f.user.id === data.id);

  async function onAdd() {
    if (!data) return;
    setActionError(null);
    try {
      await sendRequest(data.id);
      setRequested(true);
    } catch (err) {
      setActionError(
        err instanceof ApiError ? err.message : t.common.couldNotSend,
      );
    }
  }

  return (
    <div className="container center-narrow">
      <h1 className="brand" style={{ textAlign: "center", marginBottom: 24 }}>
        ⛓ chains
      </h1>
      <div className="card" ref={cardRef}>
        {error ? (
          <>
            <p className="error">
              {error instanceof ApiError && error.status === 404
                ? t.add.notFound
                : t.add.couldNotLoad}
            </p>
            <p style={{ marginTop: 12 }}>
              <Link href="/friends">{t.add.backToChains}</Link>
            </p>
          </>
        ) : isLoading || !data ? (
          <p className="empty">{t.common.loading}</p>
        ) : (
          <ProfileView
            profile={data}
            actions={
              isSelf ? (
                <Link href="/friends">{t.add.ownCode}</Link>
              ) : isFriend ? (
                <span style={{ color: "var(--ok)" }}>
                  {t.add.alreadyFriends}
                </span>
              ) : requested ? (
                <div>
                  <p style={{ color: "var(--ok)", margin: "0 0 8px" }}>
                    {t.add.requestSent}
                  </p>
                  <Link href="/friends">{t.add.backToChainsPlain}</Link>
                </div>
              ) : (
                <>
                  <button className="primary" onClick={onAdd} style={{ width: "auto" }}>
                    {t.common.addFriend}
                  </button>
                  {actionError ? <p className="error">{actionError}</p> : null}
                </>
              )
            }
          />
        )}
      </div>
    </div>
  );
}
