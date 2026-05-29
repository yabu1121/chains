"use client";

import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { PROGRAMMING_LANGUAGES } from "@/lib/languages";
import { prefersReducedMotion, useReveal, useStagger } from "@/lib/anim";
import { Guard } from "@/components/Guard";
import { Select } from "@/components/Select";
import { Topbar } from "@/components/Topbar";
import { Person } from "@/components/Person";
import { FindPeople } from "@/components/FindPeople";
import { QRInvite } from "@/components/QRInvite";
import { NetworkGraph } from "@/components/NetworkGraph";
import { ProfileEditor } from "@/components/ProfileEditor";
import { ProfileModal } from "@/components/ProfileModal";
import { useAuth } from "@/lib/auth";
import {
  acceptRequest,
  rejectRequest,
  removeFriend,
  blockUser,
  useFriends,
  useIncomingRequests,
  useOutgoingRequests,
  useIncomingCount,
} from "@/lib/hooks";

type Tab = "friends" | "requests" | "find" | "network" | "profile";

const TABS: { key: Tab; label: string }[] = [
  { key: "friends", label: "Friends" },
  { key: "requests", label: "Requests" },
  { key: "find", label: "Find" },
  { key: "network", label: "Network" },
  { key: "profile", label: "Profile" },
];

export default function FriendsPage() {
  return (
    <Guard>
      <Dashboard />
    </Guard>
  );
}

function NavLinks({
  tab,
  setTab,
  incomingCount,
  idPrefix,
  withPill = false,
}: {
  tab: Tab;
  setTab: (t: Tab) => void;
  incomingCount: number;
  idPrefix: string;
  // Slide a shared "pill" behind the active item (sidebar only).
  withPill?: boolean;
}) {
  return (
    <>
      {TABS.map(({ key, label }) => (
        <button
          key={key}
          className={`navbtn${tab === key ? " active" : ""}`}
          onClick={() => setTab(key)}
        >
          {withPill && tab === key ? (
            <motion.span
              className="nav-pill"
              layoutId={`${idPrefix}-pill`}
              transition={{ type: "spring", stiffness: 480, damping: 38 }}
            />
          ) : null}
          <span className="nav-label">{label}</span>
          {key === "requests" && incomingCount > 0 ? (
            <span className="badge">{incomingCount}</span>
          ) : null}
        </button>
      ))}
    </>
  );
}

function Dashboard() {
  const [tab, setTab] = useState<Tab>("friends");
  // Sign of the last tab move (+1 right, -1 left) drives the slide direction.
  const [dir, setDir] = useState(0);
  const incomingCount = useIncomingCount();
  const { user, logout } = useAuth();
  const reduce = prefersReducedMotion();

  const changeTab = (next: Tab) => {
    const idx = (t: Tab) => TABS.findIndex((x) => x.key === t);
    setDir(idx(next) >= idx(tab) ? 1 : -1);
    setTab(next);
  };

  const dist = reduce ? 0 : 28;

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <span className="brand">⛓ chains</span>
        <nav className="sidebar-nav">
          <NavLinks
            tab={tab}
            setTab={changeTab}
            incomingCount={incomingCount}
            idPrefix="sidebar"
            withPill
          />
        </nav>
        <div className="sidebar-foot">
          {user ? <span className="muted">{user.display_name}</span> : null}
          <button className="ghost" onClick={logout}>
            Log out
          </button>
        </div>
      </aside>

      <div className="app-main">
        <Topbar />
        <div className={`content${tab === "network" ? " content--full" : ""}`}>
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={tab}
              className={`tab-panel${tab === "network" ? " tab-panel--full" : ""}`}
              initial={{ opacity: 0, x: dir >= 0 ? dist : -dist }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: dir >= 0 ? -dist : dist }}
              transition={{ duration: reduce ? 0 : 0.26, ease: [0.16, 1, 0.3, 1] }}
            >
              {tab === "friends" ? <FriendsTab /> : null}
              {tab === "requests" ? <RequestsTab /> : null}
              {tab === "find" ? (
                <>
                  <QRInvite />
                  <FindPeople />
                </>
              ) : null}
              {tab === "network" ? <NetworkGraph /> : null}
              {tab === "profile" ? <ProfileEditor /> : null}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>

      <nav className="bottombar">
        <NavLinks
          tab={tab}
          setTab={changeTab}
          incomingCount={incomingCount}
          idPrefix="bottom"
        />
      </nav>
    </div>
  );
}

function FriendsTab() {
  const { friends, isLoading } = useFriends();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [language, setLanguage] = useState("");
  const cardRef = useReveal<HTMLDivElement>();
  const listRef = useStagger<HTMLDivElement>(`${language}|${friends.length}`);

  // Only offer languages that at least one friend actually lists.
  const availableLanguages = useMemo(() => {
    const present = new Set(friends.flatMap((f) => f.user.languages ?? []));
    return PROGRAMMING_LANGUAGES.filter((lang) => present.has(lang));
  }, [friends]);

  const visible = language
    ? friends.filter((f) => (f.user.languages ?? []).includes(language))
    : friends;

  return (
    <div className="card" ref={cardRef}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 8,
          flexWrap: "wrap",
        }}
      >
        <h2 className="section-title" style={{ margin: 0 }}>
          Your friends
        </h2>
        {availableLanguages.length > 0 ? (
          <Select
            value={language}
            onChange={setLanguage}
            ariaLabel="Filter friends by language"
            options={[
              { value: "", label: "All languages" },
              ...availableLanguages.map((lang) => ({ value: lang, label: lang })),
            ]}
          />
        ) : null}
      </div>
      {isLoading ? (
        <p className="empty">Loading…</p>
      ) : friends.length === 0 ? (
        <p className="empty">No friends yet. Head to “Find people” to connect.</p>
      ) : visible.length === 0 ? (
        <p className="empty">No friends use {language}.</p>
      ) : (
        <div ref={listRef}>
          {visible.map((f) => (
            <Person
              key={f.user.id}
              user={f.user}
              onSelect={() => setSelectedId(f.user.id)}
              actions={
                <>
                  <button onClick={() => removeFriend(f.user.id)}>Remove</button>
                  <button
                    className="danger"
                    onClick={() => blockUser(f.user.id)}
                  >
                    Block
                  </button>
                </>
              }
            />
          ))}
        </div>
      )}
      {selectedId ? (
        <ProfileModal userId={selectedId} onClose={() => setSelectedId(null)} />
      ) : null}
    </div>
  );
}

function RequestsTab() {
  const { requests: incoming, isLoading: loadingIn } = useIncomingRequests();
  const { requests: outgoing, isLoading: loadingOut } = useOutgoingRequests();
  const inCardRef = useReveal<HTMLDivElement>();
  const outCardRef = useReveal<HTMLDivElement>({ delay: 90 });
  const inListRef = useStagger<HTMLDivElement>(incoming.length);
  const outListRef = useStagger<HTMLDivElement>(outgoing.length);

  return (
    <>
      <div className="card" ref={inCardRef}>
        <h2 className="section-title">Incoming requests</h2>
        {loadingIn ? (
          <p className="empty">Loading…</p>
        ) : incoming.length === 0 ? (
          <p className="empty">No incoming requests.</p>
        ) : (
          <div ref={inListRef}>
            {incoming.map((r) => (
              <Person
                key={r.request_id}
                user={r.user}
                actions={
                  <>
                    <button onClick={() => acceptRequest(r.request_id)}>
                      Accept
                    </button>
                    <button
                      className="ghost"
                      onClick={() => rejectRequest(r.request_id)}
                    >
                      Decline
                    </button>
                  </>
                }
              />
            ))}
          </div>
        )}
      </div>

      <div className="card" ref={outCardRef}>
        <h2 className="section-title">Sent requests</h2>
        {loadingOut ? (
          <p className="empty">Loading…</p>
        ) : outgoing.length === 0 ? (
          <p className="empty">No pending sent requests.</p>
        ) : (
          <div ref={outListRef}>
            {outgoing.map((r) => (
              <Person
                key={r.request_id}
                user={r.user}
                subtitle="Pending…"
                actions={
                  <button
                    className="ghost"
                    onClick={() => rejectRequest(r.request_id)}
                  >
                    Cancel
                  </button>
                }
              />
            ))}
          </div>
        )}
      </div>
    </>
  );
}
