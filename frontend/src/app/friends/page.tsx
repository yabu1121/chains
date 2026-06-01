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
import { LegalDoc } from "@/components/LegalDoc";
import { PrivacyEN, PrivacyJA, TermsEN, TermsJA } from "@/components/legal";
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

// Top-level navigation. Friends/Requests/Find are nested inside the Friends
// area (see FriendsArea), so the sidebar only carries these three.
type Tab = "friends" | "network" | "news" | "settings";

const TABS: { key: Tab; label: string }[] = [
  { key: "friends", label: "Friends" },
  { key: "network", label: "Network" },
  { key: "news", label: "News" },
  { key: "settings", label: "Settings" },
];

// Sub-tabs within the Friends area.
type FriendsSub = "friends" | "requests" | "find";

const FRIENDS_TABS: { key: FriendsSub; label: string }[] = [
  { key: "friends", label: "Friends" },
  { key: "requests", label: "Requests" },
  { key: "find", label: "Find" },
];

// Sub-tabs within the Settings area.
type SettingsSub = "profile" | "privacy" | "terms";

const SETTINGS_TABS: { key: SettingsSub; label: string }[] = [
  { key: "profile", label: "Profile" },
  { key: "privacy", label: "Privacy" },
  { key: "terms", label: "Terms" },
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
          {key === "friends" && incomingCount > 0 ? (
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
  // Clicking the brand opens your own profile in the same modal a network node
  // does (read-only ProfileView), rather than the editor tab.
  const [showOwnProfile, setShowOwnProfile] = useState(false);
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
        <button
          type="button"
          className="brand"
          onClick={() => setShowOwnProfile(true)}
          title="View your profile"
        >
          ⛓ chains
        </button>
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
        <Topbar onBrandClick={() => setShowOwnProfile(true)} />
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
              {tab === "friends" ? <FriendsArea /> : null}
              {tab === "network" ? (
                <NetworkGraph onEditProfile={() => changeTab("settings")} />
              ) : null}
              {tab === "news" ? (
                <div
                  className="card"
                  style={{ textAlign: "center", padding: "48px 24px" }}
                >
                  <h2 style={{ marginTop: 0 }}>News</h2>
                  <p className="muted">Coming soon</p>
                </div>
              ) : null}
              {tab === "settings" ? <SettingsArea /> : null}
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

      {showOwnProfile && user ? (
        <ProfileModal
          userId={user.id}
          onClose={() => setShowOwnProfile(false)}
          onEditProfile={() => changeTab("settings")}
        />
      ) : null}
    </div>
  );
}

// FriendsArea nests the people-focused views — your friends, pending requests
// and finding people — behind a segmented sub-tab strip, so the top-level nav
// stays at Friends / Network / Profile.
function FriendsArea() {
  const [sub, setSub] = useState<FriendsSub>("friends");
  const [dir, setDir] = useState(0);
  const incomingCount = useIncomingCount();
  const reduce = prefersReducedMotion();
  const dist = reduce ? 0 : 24;

  const changeSub = (next: FriendsSub) => {
    const idx = (s: FriendsSub) => FRIENDS_TABS.findIndex((x) => x.key === s);
    setDir(idx(next) >= idx(sub) ? 1 : -1);
    setSub(next);
  };

  return (
    <>
      <div className="subtabs" role="tablist">
        {FRIENDS_TABS.map(({ key, label }) => (
          <button
            key={key}
            role="tab"
            aria-selected={sub === key}
            className={`subtab${sub === key ? " active" : ""}`}
            onClick={() => changeSub(key)}
          >
            {sub === key ? (
              <motion.span
                className="subtab-pill"
                layoutId="friends-subtab-pill"
                transition={{ type: "spring", stiffness: 480, damping: 38 }}
              />
            ) : null}
            <span className="subtab-label">{label}</span>
            {key === "requests" && incomingCount > 0 ? (
              <span className="badge">{incomingCount}</span>
            ) : null}
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={sub}
          initial={{ opacity: 0, x: dir >= 0 ? dist : -dist }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: dir >= 0 ? -dist : dist }}
          transition={{ duration: reduce ? 0 : 0.24, ease: [0.16, 1, 0.3, 1] }}
        >
          {sub === "friends" ? <FriendsTab /> : null}
          {sub === "requests" ? <RequestsTab /> : null}
          {sub === "find" ? (
            <>
              <QRInvite />
              <FindPeople />
            </>
          ) : null}
        </motion.div>
      </AnimatePresence>
    </>
  );
}

// SettingsArea groups account settings behind a sub-tab strip: the profile
// editor plus the in-app Privacy Policy and Terms of Service.
function SettingsArea() {
  const [sub, setSub] = useState<SettingsSub>("profile");
  const [dir, setDir] = useState(0);
  const reduce = prefersReducedMotion();
  const dist = reduce ? 0 : 24;

  const changeSub = (next: SettingsSub) => {
    const idx = (s: SettingsSub) => SETTINGS_TABS.findIndex((x) => x.key === s);
    setDir(idx(next) >= idx(sub) ? 1 : -1);
    setSub(next);
  };

  return (
    <>
      <div className="subtabs" role="tablist">
        {SETTINGS_TABS.map(({ key, label }) => (
          <button
            key={key}
            role="tab"
            aria-selected={sub === key}
            className={`subtab${sub === key ? " active" : ""}`}
            onClick={() => changeSub(key)}
          >
            {sub === key ? (
              <motion.span
                className="subtab-pill"
                layoutId="settings-subtab-pill"
                transition={{ type: "spring", stiffness: 480, damping: 38 }}
              />
            ) : null}
            <span className="subtab-label">{label}</span>
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={sub}
          initial={{ opacity: 0, x: dir >= 0 ? dist : -dist }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: dir >= 0 ? -dist : dist }}
          transition={{ duration: reduce ? 0 : 0.24, ease: [0.16, 1, 0.3, 1] }}
        >
          {sub === "profile" ? <ProfileEditor /> : null}
          {sub === "privacy" ? (
            <div className="card">
              <LegalDoc en={<PrivacyEN />} ja={<PrivacyJA />} backHref={null} />
            </div>
          ) : null}
          {sub === "terms" ? (
            <div className="card">
              <LegalDoc en={<TermsEN />} ja={<TermsJA />} backHref={null} />
            </div>
          ) : null}
        </motion.div>
      </AnimatePresence>
    </>
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
                arrow="in"
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
                arrow="out"
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
