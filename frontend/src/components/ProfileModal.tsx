"use client";

import { useState } from "react";
import useSWR from "swr";
import { ProfileView } from "./ProfileView";
import { useAuth } from "@/lib/auth";
import { ApiError } from "@/lib/api";
import { getProfile, sendRequest, useFriends } from "@/lib/hooks";
import type { PublicProfile } from "@/lib/types";

export function ProfileModal({
  userId,
  onClose,
}: {
  userId: string;
  onClose: () => void;
}) {
  const { user } = useAuth();
  const { friends } = useFriends();
  const { data, error, isLoading } = useSWR<PublicProfile>(
    `/api/users/${userId}`,
    () => getProfile(userId),
  );

  const [requested, setRequested] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const isSelf = user?.id === userId;
  const isFriend = friends.some((f) => f.user.id === userId);

  async function onAdd() {
    setActionError(null);
    try {
      await sendRequest(userId);
      setRequested(true);
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : "Could not send request");
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose} aria-label="Close">
          ×
        </button>

        {error ? (
          <p className="error">Could not load this profile.</p>
        ) : isLoading || !data ? (
          <p className="empty">Loading…</p>
        ) : (
          <ProfileView
            profile={data}
            actions={
              isSelf ? (
                <span className="muted">This is you.</span>
              ) : isFriend ? (
                <span style={{ color: "var(--ok)" }}>You are friends ✓</span>
              ) : (
                <>
                  <button onClick={onAdd} disabled={requested}>
                    {requested ? "Requested" : "Add friend"}
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
