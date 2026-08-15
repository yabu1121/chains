"use client";

import { useState, type FormEvent } from "react";
import useSWR from "swr";
import { Person } from "./Person";
import { ProfileModal } from "./ProfileModal";
import { CommunityMap } from "./CommunityMap";
import { ChevronIcon } from "./ChevronIcon";
import { ConfirmDialog } from "./ConfirmDialog";
import { ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import {
  communityKey,
  createCommunity,
  deleteCommunity,
  getCommunity,
  joinCommunity,
  leaveCommunity,
  useCommunities,
  useNoteSummaries,
} from "@/lib/hooks";
import { useReveal } from "@/lib/anim";
import { useI18n } from "@/lib/i18n";
import type { CommunityDetail, CommunitySummary } from "@/lib/types";

export function CommunityArea() {
  const { t } = useI18n();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  return (
    <>
      <h1 className="area-title">{t.nav.community}</h1>
      {selectedId ? (
        <CommunityDetailView id={selectedId} onBack={() => setSelectedId(null)} />
      ) : (
        <CommunityList onOpen={setSelectedId} />
      )}
    </>
  );
}

function CommunityRow({
  c,
  onOpen,
}: {
  c: CommunitySummary;
  onOpen: (id: string) => void;
}) {
  const { t } = useI18n();
  return (
    <button
      type="button"
      className="settings-menu-item"
      onClick={() => onOpen(c.id)}
    >
      <span className="min-w-0 text-left">
        <span className="block font-semibold truncate">{c.name}</span>
        <span className="block muted text-[13px] truncate">
          {t.community.members(c.member_count)}
          {c.description ? ` · ${c.description}` : ""}
        </span>
      </span>
      <ChevronIcon />
    </button>
  );
}

function CommunityList({ onOpen }: { onOpen: (id: string) => void }) {
  const { t } = useI18n();
  const { communities, error: loadError, isLoading } = useCommunities();
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const formRef = useReveal<HTMLFormElement>();

  const mine = communities.filter((c) => c.is_member);
  const discover = communities.filter((c) => !c.is_member);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    const n = name.trim();
    if (!n) return;
    setError(null);
    setCreating(true);
    try {
      const created = await createCommunity(n, desc.trim());
      setName("");
      setDesc("");
      onOpen(created.id);
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : t.community.couldNotCreate,
      );
    } finally {
      setCreating(false);
    }
  }

  return (
    <>
      <form className="card" onSubmit={onCreate} ref={formRef}>
        <h2 className="section-title">{t.community.create}</h2>
        <p className="muted mt-[-4px] text-[13px]">{t.community.createDesc}</p>
        <label htmlFor="cname">{t.community.name}</label>
        <input
          id="cname"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={60}
          placeholder={t.community.namePlaceholder}
        />
        <label htmlFor="cdesc">{t.community.description}</label>
        <textarea
          id="cdesc"
          value={desc}
          onChange={(e) => setDesc(e.target.value.slice(0, 300))}
          rows={2}
          maxLength={300}
          placeholder={t.community.descriptionPlaceholder}
        />
        <div className="mt-3">
          <button
            className="primary w-auto"
            type="submit"
            disabled={creating || !name.trim()}
          >
            {creating ? t.community.creating : t.community.createButton}
          </button>
        </div>
        {error ? <p className="error">{error}</p> : null}
      </form>

      <div className="card">
        <h2 className="section-title">{t.community.yours}</h2>
        {loadError ? (
          <p className="error">{t.common.couldNotLoad}</p>
        ) : isLoading ? (
          <p className="empty">{t.common.loading}</p>
        ) : mine.length === 0 ? (
          <p className="empty">{t.community.noneJoined}</p>
        ) : (
          <div>
            {mine.map((c) => (
              <CommunityRow key={c.id} c={c} onOpen={onOpen} />
            ))}
          </div>
        )}
      </div>

      <div className="card">
        <h2 className="section-title">{t.community.discover}</h2>
        {loadError ? (
          <p className="error">{t.common.couldNotLoad}</p>
        ) : isLoading ? (
          <p className="empty">{t.common.loading}</p>
        ) : discover.length === 0 ? (
          <p className="empty">{t.community.noneToDiscover}</p>
        ) : (
          <div>
            {discover.map((c) => (
              <CommunityRow key={c.id} c={c} onOpen={onOpen} />
            ))}
          </div>
        )}
      </div>
    </>
  );
}

function CommunityDetailView({
  id,
  onBack,
}: {
  id: string;
  onBack: () => void;
}) {
  const { t } = useI18n();
  const { user } = useAuth();
  const { notes } = useNoteSummaries();
  const { data, error, isLoading, mutate } = useSWR<CommunityDetail>(
    communityKey(id),
    () => getCommunity(id),
  );
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [selectedUser, setSelectedUser] = useState<string | null>(null);

  // Attendees you've met here but haven't written a note about yet.
  const notedIds = new Set(notes.map((n) => n.target_id));
  const unnoted =
    data?.members.filter((m) => m.id !== user?.id && !notedIds.has(m.id)) ?? [];

  async function toggleJoin() {
    if (!data) return;
    setBusy(true);
    try {
      if (data.is_member) await leaveCommunity(id);
      else await joinCommunity(id);
      await mutate();
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button type="button" className="settings-back" onClick={onBack}>
        <ChevronIcon />
        <span>{t.community.back}</span>
      </button>

      {error ? (
        <div className="card">
          <p className="error">{t.common.couldNotLoad}</p>
        </div>
      ) : isLoading || !data ? (
        <div className="card">
          <p className="empty">{t.common.loading}</p>
        </div>
      ) : (
        <>
          <div className="card">
            <div className="flex justify-between items-start gap-3 flex-wrap">
              <div className="min-w-0">
                <h2 className="section-title m-0">{data.name}</h2>
                <p className="muted text-[13px] mt-1 mb-0">
                  {t.community.members(data.member_count)}
                </p>
              </div>
              <div className="flex flex-col items-end gap-2">
                <button
                  className={data.is_member ? "" : "primary w-auto"}
                  onClick={toggleJoin}
                  disabled={busy}
                >
                  {data.is_member ? t.community.leave : t.community.join}
                </button>
                {data.is_owner ? (
                  <button
                    type="button"
                    className="danger"
                    onClick={() => setConfirmDelete(true)}
                    disabled={busy}
                  >
                    {t.community.delete}
                  </button>
                ) : null}
              </div>
            </div>
            {data.description ? (
              <p className="pv-bio mt-3">{data.description}</p>
            ) : null}
            <CommunityMap communityId={id} onSelect={setSelectedUser} />
          </div>

          {data.is_member && data.member_count > 1 ? (
            <div className="card">
              <h2 className="section-title">{t.community.unnotedTitle}</h2>
              <p className="muted mt-[-4px] text-[13px]">
                {t.community.unnotedDesc}
              </p>
              {unnoted.length === 0 ? (
                <p className="text-ok text-sm mt-2">{t.community.allNoted}</p>
              ) : (
                <div className="mt-2">
                  {unnoted.map((m) => (
                    <Person
                      key={m.id}
                      user={m}
                      subtitle={m.job_title || `@${m.username}`}
                      onSelect={() => setSelectedUser(m.id)}
                    />
                  ))}
                </div>
              )}
            </div>
          ) : null}

          <div className="card">
            <h2 className="section-title">{t.community.roster}</h2>
            {data.members.length === 0 ? (
              <p className="empty">{t.community.noMembers}</p>
            ) : (
              <div>
                {data.members.map((m) => (
                  <Person
                    key={m.id}
                    user={m}
                    subtitle={m.job_title || `@${m.username}`}
                    onSelect={() => setSelectedUser(m.id)}
                  />
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {selectedUser ? (
        <ProfileModal
          userId={selectedUser}
          onClose={() => setSelectedUser(null)}
        />
      ) : null}
      {confirmDelete ? (
        <ConfirmDialog
          title={t.community.deleteConfirmTitle}
          body={t.community.deleteConfirmBody}
          confirmLabel={t.community.delete}
          danger
          onConfirm={async () => {
            await deleteCommunity(id);
            onBack();
          }}
          onClose={() => setConfirmDelete(false)}
        />
      ) : null}
    </>
  );
}
