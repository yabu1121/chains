"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import useSWR from "swr";
import { ProfileView } from "./ProfileView";
import { AddFriendDialog } from "./AddFriendDialog";
import { useAuth } from "@/lib/auth";
import { getProfile, useFriends } from "@/lib/hooks";
import { useReveal } from "@/lib/anim";
import { useDialog } from "@/lib/dialog";
import { useI18n } from "@/lib/i18n";
import type { PublicProfile } from "@/lib/types";

export function ProfileModal({
  userId,
  onClose,
  onEditProfile,
}: {
  userId: string;
  onClose: () => void;
  // When viewing your own profile and provided, shows an "Edit profile" action
  // that closes the modal and jumps to the editor.
  onEditProfile?: () => void;
}) {
  const { t } = useI18n();
  const { user } = useAuth();
  const { friends } = useFriends();
  const { data, error, isLoading } = useSWR<PublicProfile>(
    `/api/users/${userId}`,
    () => getProfile(userId),
  );

  const [requested, setRequested] = useState(false);
  const [showDialog, setShowDialog] = useState(false);

  const overlayRef = useReveal<HTMLDivElement>({ y: 0, duration: 250 });
  const cardReveal = useReveal<HTMLDivElement>({ scale: 0.94, y: 8, duration: 360 });
  const dialogRef = useDialog<HTMLDivElement>(onClose);
  // The card needs both the entrance-animation ref and the dialog ref.
  const setCardRef = (node: HTMLDivElement | null) => {
    cardReveal.current = node;
    dialogRef.current = node;
  };

  const isSelf = user?.id === userId;
  const isFriend = friends.some((f) => f.user.id === userId);

  // Portal to <body> so the fixed-position overlay is anchored to the viewport,
  // not to a transformed ancestor (e.g. the framer-motion tab panels), which
  // would otherwise offset and clip it.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  if (!mounted) return null;

  return createPortal(
    <div className="modal-overlay" onClick={onClose} ref={overlayRef}>
      <div
        className="modal-card"
        role="dialog"
        aria-modal="true"
        aria-label={data?.display_name ?? t.settingsTabs.profile}
        onClick={(e) => e.stopPropagation()}
        ref={setCardRef}
      >
        <button className="modal-close" onClick={onClose} aria-label={t.common.close}>
          ×
        </button>

        {error ? (
          <p className="error">{t.profileModal.couldNotLoad}</p>
        ) : isLoading || !data ? (
          <p className="empty">{t.common.loading}</p>
        ) : (
          <ProfileView
            profile={data}
            actions={
              isSelf ? (
                onEditProfile ? (
                  <button
                    onClick={() => {
                      onClose();
                      onEditProfile();
                    }}
                  >
                    {t.profileModal.editProfile}
                  </button>
                ) : (
                  <span className="muted">{t.profileModal.thisIsYou}</span>
                )
              ) : isFriend ? (
                <span style={{ color: "var(--ok)" }}>{t.profileModal.youAreFriends}</span>
              ) : (
                <button
                  onClick={() => setShowDialog(true)}
                  disabled={requested}
                >
                  {requested ? t.common.requested : t.common.addFriend}
                </button>
              )
            }
          />
        )}
      </div>

      {showDialog && data ? (
        <AddFriendDialog
          addresseeId={userId}
          displayName={data.display_name}
          onClose={() => setShowDialog(false)}
          onSent={() => setRequested(true)}
        />
      ) : null}
    </div>,
    document.body,
  );
}
