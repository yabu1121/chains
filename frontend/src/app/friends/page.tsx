"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion, type Variants } from "framer-motion";
import { PROGRAMMING_LANGUAGES } from "@/lib/languages";
import { prefersReducedMotion, useReveal, useStagger } from "@/lib/anim";
import { Guard } from "@/components/Guard";
import { Select } from "@/components/Select";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { Topbar } from "@/components/Topbar";
import { NavIcon } from "@/components/NavIcon";
import { ChevronIcon } from "@/components/ChevronIcon";
import { LogoutIcon } from "@/components/LogoutIcon";
import { VersionHistory } from "@/components/VersionHistory";
import { Person } from "@/components/Person";
import { FindPeople } from "@/components/FindPeople";
import { Recommendations } from "@/components/Recommendations";
import { FollowUps } from "@/components/FollowUps";
import { Digest } from "@/components/Digest";
import { CardInbox } from "@/components/CardInbox";
import { Beacon } from "@/components/Beacon";
import { Onboarding, shouldOnboard } from "@/components/Onboarding";
import { AccountSettings } from "@/components/AccountSettings";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { toastError } from "@/lib/toast";
import type { UserSummary } from "@/lib/types";
import { QRInvite } from "@/components/QRInvite";
import { NetworkDeck } from "@/components/NetworkDeck";
import { CommunityArea } from "@/components/CommunityArea";
import { NewsArea } from "@/components/NewsArea";
import { BridgeToast } from "@/components/BridgeToast";
import { ProfileEditor } from "@/components/ProfileEditor";
import { ProfileModal } from "@/components/ProfileModal";
import { LegalDoc } from "@/components/LegalDoc";
import { PrivacyEN, PrivacyJA, TermsEN, TermsJA } from "@/components/legal";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import {
  acceptRequest,
  rejectRequest,
  removeFriend,
  blockUser,
  getProfile,
  useFriends,
  useIncomingRequests,
  useOutgoingRequests,
  useIncomingCount,
  useCardUnreadCount,
  type BridgeInfo,
} from "@/lib/hooks";

// Top-level navigation. Friends/Requests/Find are nested inside the Friends
// area (see FriendsArea), so the sidebar only carries these three. Labels are
// resolved from the active dictionary at render time (t.nav[key]).
type Tab = "friends" | "network" | "community" | "news" | "settings";

const TABS: Tab[] = ["friends", "network", "community", "news", "settings"];

// Sub-tabs within the Friends area.
type FriendsSub = "friends" | "cards" | "requests" | "find";

const FRIENDS_TABS: FriendsSub[] = ["friends", "cards", "requests", "find"];

// Sub-tabs within the Settings area.
type SettingsSub =
  | "profile"
  | "account"
  | "changelog"
  | "terms"
  | "privacy"
  | "language";

// Order of the settings menu rows.
const SETTINGS_ITEMS: SettingsSub[] = [
  "profile",
  "account",
  "changelog",
  "terms",
  "privacy",
  "language",
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
  const { t } = useI18n();
  return (
    <>
      {TABS.map((key) => (
        <button
          key={key}
          className={`navbtn${tab === key ? " active" : ""}`}
          onClick={() => setTab(key)}
          // Label as aria-label + native tooltip so the icon stays accessible
          // when the sidebar is collapsed to icons only.
          aria-label={t.nav[key]}
          title={t.nav[key]}
        >
          {withPill && tab === key ? (
            <motion.span
              className="nav-pill"
              layoutId={`${idPrefix}-pill`}
              transition={{ type: "spring", stiffness: 480, damping: 38 }}
            />
          ) : null}
          <NavIcon name={key} />
          <span className="nav-label">{t.nav[key]}</span>
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
  // Desktop sidebar collapse (icons only). Default expanded; the saved choice is
  // read after mount to avoid a server/client hydration mismatch.
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => {
    setCollapsed(localStorage.getItem("chains:sidebar-collapsed") === "1");
  }, []);
  const toggleCollapsed = () =>
    setCollapsed((c) => {
      const next = !c;
      localStorage.setItem("chains:sidebar-collapsed", next ? "1" : "0");
      return next;
    });
  // Sign of the last tab move (+1 right, -1 left) drives the slide direction.
  const [dir, setDir] = useState(0);
  // Clicking the brand opens your own profile in the same modal a network node
  // does (read-only ProfileView), rather than the editor tab.
  const [showOwnProfile, setShowOwnProfile] = useState(false);
  const incomingCount = useIncomingCount();
  const { user, logout } = useAuth();
  const { t } = useI18n();
  const reduce = prefersReducedMotion();

  // First-run onboarding: if the profile is still essentially empty (and not
  // already completed/skipped), prompt the user to fill the few fields that make
  // News and discovery work.
  const [showOnboarding, setShowOnboarding] = useState(false);
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    getProfile(user.id)
      .then((p) => {
        if (!cancelled && shouldOnboard(p)) setShowOnboarding(true);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [user]);

  const changeTab = (next: Tab) => {
    setDir(TABS.indexOf(next) >= TABS.indexOf(tab) ? 1 : -1);
    setTab(next);
  };

  const dist = reduce ? 0 : 28;

  return (
    <div className="app-shell">
      <aside className={`sidebar${collapsed ? " collapsed" : ""}`}>
        <button
          type="button"
          className="brand"
          onClick={() => setShowOwnProfile(true)}
          title={t.nav.viewProfile}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            className="brand-logo"
            src={collapsed ? "/chains_icon.png" : "/chains-logo.png"}
            alt="chains"
          />
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
          <button
            type="button"
            className="collapse-toggle"
            onClick={toggleCollapsed}
            aria-label={collapsed ? t.nav.expand : t.nav.collapse}
            title={collapsed ? t.nav.expand : t.nav.collapse}
          >
            <ChevronIcon />
            {!collapsed ? (
              <span className="nav-label">{t.nav.collapse}</span>
            ) : null}
          </button>
          {!collapsed ? <LanguageSwitcher fullWidth /> : null}
          {!collapsed && user ? (
            <span className="muted">{user.display_name}</span>
          ) : null}
          <button
            className="ghost"
            onClick={logout}
            aria-label={t.nav.logout}
            title={t.nav.logout}
          >
            {collapsed ? <LogoutIcon /> : t.nav.logout}
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
              transition={
                reduce
                  ? { duration: 0 }
                  : // Native-feel page transition: a snappy spring (slides into
                    // place and settles) rather than a fixed-duration ease.
                    { type: "spring", stiffness: 320, damping: 34, mass: 0.85 }
              }
            >
              {tab === "friends" ? <FriendsArea onNavigate={changeTab} /> : null}
              {tab === "network" ? (
                <NetworkDeck onEditProfile={() => changeTab("settings")} />
              ) : null}
              {tab === "community" ? <CommunityArea /> : null}
              {tab === "news" ? <NewsArea /> : null}
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
          withPill
        />
      </nav>

      {showOwnProfile && user ? (
        <ProfileModal
          userId={user.id}
          onClose={() => setShowOwnProfile(false)}
          onEditProfile={() => changeTab("settings")}
        />
      ) : null}

      {showOnboarding && user ? (
        <Onboarding
          userId={user.id}
          onClose={() => setShowOnboarding(false)}
        />
      ) : null}
    </div>
  );
}

// FriendsArea nests the people-focused views — your friends, pending requests
// and finding people — behind a segmented sub-tab strip, so the top-level nav
// stays at Friends / Network / Profile.
function FriendsArea({ onNavigate }: { onNavigate: (t: Tab) => void }) {
  const [sub, setSub] = useState<FriendsSub>("friends");
  const [dir, setDir] = useState(0);
  const incomingCount = useIncomingCount();
  const cardUnread = useCardUnreadCount();
  const { t } = useI18n();
  const reduce = prefersReducedMotion();
  const dist = reduce ? 0 : 24;

  const changeSub = (next: FriendsSub) => {
    setDir(FRIENDS_TABS.indexOf(next) >= FRIENDS_TABS.indexOf(sub) ? 1 : -1);
    setSub(next);
  };

  return (
    <>
      <h1 className="area-title">{t.nav.friends}</h1>
      <div className="subtabs" role="tablist">
        {FRIENDS_TABS.map((key) => (
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
            <span className="subtab-label">{t.friendsTabs[key]}</span>
            {key === "requests" && incomingCount > 0 ? (
              <span className="badge">{incomingCount}</span>
            ) : null}
            {key === "cards" && cardUnread > 0 ? (
              <span className="badge">{cardUnread}</span>
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
          transition={
            reduce
              ? { duration: 0 }
              : { type: "spring", stiffness: 340, damping: 34, mass: 0.8 }
          }
        >
          {sub === "friends" ? (
            <>
              <Beacon />
              <Digest onNavigate={onNavigate} />
              <FollowUps />
              <FriendsTab />
            </>
          ) : null}
          {sub === "cards" ? <CardInbox /> : null}
          {sub === "requests" ? <RequestsTab /> : null}
          {sub === "find" ? (
            <>
              <QRInvite />
              <Recommendations />
              <FindPeople />
            </>
          ) : null}
        </motion.div>
      </AnimatePresence>
    </>
  );
}

// SettingsArea is a menu of sections (Profile / Changelog / Terms / Privacy /
// Language). The landing shows only the menu rows; selecting one drills into
// that section with a back control, like a native settings screen.
function SettingsArea() {
  const [sub, setSub] = useState<SettingsSub | null>(null);
  const { t } = useI18n();
  const reduce = prefersReducedMotion();
  // Soft ease-out (no overshoot) for a smooth, drawn-out slide.
  const ease: [number, number, number, number] = [0.22, 1, 0.36, 1];
  // The detail panel is "pulled out" from the right; the menu eases left.
  const enter = reduce ? 0 : 64;
  const menuShift = reduce ? 0 : 24;

  // Drawer-from-right: the panel springs in from the right, then its contents
  // (the back control, then the section body) rise in with a short stagger, so
  // the section reads as being drawn out and unfolding rather than just sliding.
  const panel: Variants = reduce
    ? { hidden: { opacity: 1 }, visible: { opacity: 1 }, exit: { opacity: 1 } }
    : {
        hidden: { opacity: 0, x: enter },
        visible: {
          opacity: 1,
          x: 0,
          transition: {
            type: "spring",
            stiffness: 260,
            damping: 30,
            delayChildren: 0.08,
            staggerChildren: 0.07,
          },
        },
        exit: { opacity: 0, x: enter, transition: { duration: 0.28, ease } },
      };
  const item: Variants = reduce
    ? { hidden: { opacity: 1 }, visible: { opacity: 1 } }
    : {
        hidden: { opacity: 0, y: 12 },
        visible: {
          opacity: 1,
          y: 0,
          transition: { type: "spring", stiffness: 320, damping: 26 },
        },
      };

  return (
    <>
      <h1 className="area-title">{t.nav.settings}</h1>
      <AnimatePresence mode="wait" initial={false}>
        {sub === null ? (
          <motion.nav
            key="menu"
            className="settings-menu"
            initial={{ opacity: 0, x: -menuShift }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -menuShift }}
            transition={{ duration: reduce ? 0 : 0.34, ease }}
          >
            {SETTINGS_ITEMS.map((key) => (
              <button
                key={key}
                className="settings-menu-item"
                onClick={() => setSub(key)}
              >
                <span>{t.settingsTabs[key]}</span>
                <ChevronIcon />
              </button>
            ))}
          </motion.nav>
        ) : (
          <motion.div
            key={sub}
            variants={panel}
            initial="hidden"
            animate="visible"
            exit="exit"
          >
            <motion.button
              variants={item}
              type="button"
              className="settings-back"
              onClick={() => setSub(null)}
            >
              <ChevronIcon />
              <span>{t.nav.back}</span>
            </motion.button>
            <motion.div variants={item}>
              {sub === "profile" ? <ProfileEditor /> : null}
              {sub === "account" ? <AccountSettings /> : null}
              {sub === "changelog" ? <VersionHistory /> : null}
              {sub === "terms" ? (
                <div className="card">
                  <LegalDoc en={<TermsEN />} ja={<TermsJA />} backHref={null} />
                </div>
              ) : null}
              {sub === "privacy" ? (
                <div className="card">
                  <LegalDoc en={<PrivacyEN />} ja={<PrivacyJA />} backHref={null} />
                </div>
              ) : null}
              {sub === "language" ? (
                <div className="card">
                  <label>{t.common.language}</label>
                  <div className="mt-2">
                    <LanguageSwitcher fullWidth />
                  </div>
                </div>
              ) : null}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

function FriendsTab() {
  const { friends, error, isLoading } = useFriends();
  const { t } = useI18n();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<{
    kind: "remove" | "block";
    user: UserSummary;
  } | null>(null);
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
      <div className="flex justify-between items-center gap-2 flex-wrap">
        <h2 className="section-title m-0">
          {t.friends.yourFriends}
        </h2>
        {availableLanguages.length > 0 ? (
          <Select
            value={language}
            onChange={setLanguage}
            ariaLabel={t.friends.filterByLanguage}
            options={[
              { value: "", label: t.friends.allLanguages },
              ...availableLanguages.map((lang) => ({ value: lang, label: lang })),
            ]}
          />
        ) : null}
      </div>
      {error ? (
        <p className="error">{t.friends.couldNotLoad}</p>
      ) : isLoading ? (
        <p className="empty">{t.common.loading}</p>
      ) : friends.length === 0 ? (
        <p className="empty">{t.friends.noFriends}</p>
      ) : visible.length === 0 ? (
        <p className="empty">{t.friends.noFriendsLang(language)}</p>
      ) : (
        <div ref={listRef}>
          {visible.map((f) => (
            <Person
              key={f.user.id}
              user={f.user}
              onSelect={() => setSelectedId(f.user.id)}
              actions={
                <>
                  <button
                    onClick={() => setConfirm({ kind: "remove", user: f.user })}
                  >
                    {t.common.remove}
                  </button>
                  <button
                    className="danger"
                    onClick={() => setConfirm({ kind: "block", user: f.user })}
                  >
                    {t.friends.block}
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
      {confirm ? (
        <ConfirmDialog
          title={
            confirm.kind === "remove"
              ? t.friends.confirmRemoveTitle
              : t.friends.confirmBlockTitle
          }
          body={
            confirm.kind === "remove"
              ? t.friends.confirmRemoveBody(confirm.user.display_name)
              : t.friends.confirmBlockBody(confirm.user.display_name)
          }
          confirmLabel={
            confirm.kind === "remove" ? t.common.remove : t.friends.block
          }
          danger
          onConfirm={() =>
            confirm.kind === "remove"
              ? removeFriend(confirm.user.id)
              : blockUser(confirm.user.id)
          }
          onClose={() => setConfirm(null)}
        />
      ) : null}
    </div>
  );
}

function RequestsTab() {
  const {
    requests: incoming,
    error: errorIn,
    isLoading: loadingIn,
  } = useIncomingRequests();
  const {
    requests: outgoing,
    error: errorOut,
    isLoading: loadingOut,
  } = useOutgoingRequests();
  const { t } = useI18n();
  // When accepting a request bridges two clusters, the backend tells us so and
  // we surface a brief celebration. New object identity each time → the toast's
  // auto-dismiss timer restarts for back-to-back bridges.
  const [bridge, setBridge] = useState<BridgeInfo | null>(null);
  // Stable identity so BridgeToast's auto-dismiss timer doesn't restart on every
  // unrelated re-render of this (frequently re-rendering) tab.
  const dismissBridge = useCallback(() => setBridge(null), []);
  // Tapping a requester (not their action buttons) opens their profile, same as
  // the friends list — works on mobile via the bottom-sheet modal.
  const [selectedId, setSelectedId] = useState<string | null>(null);

  async function onAccept(requestId: string) {
    try {
      const result = await acceptRequest(requestId);
      if (result) setBridge({ ...result });
    } catch {
      toastError(t.common.somethingWrong);
    }
  }
  function onReject(requestId: string) {
    rejectRequest(requestId).catch(() => toastError(t.common.somethingWrong));
  }
  const inCardRef = useReveal<HTMLDivElement>();
  const outCardRef = useReveal<HTMLDivElement>({ delay: 90 });
  const inListRef = useStagger<HTMLDivElement>(incoming.length);
  const outListRef = useStagger<HTMLDivElement>(outgoing.length);

  return (
    <>
      <div className="card" ref={inCardRef}>
        <h2 className="section-title">{t.friends.incomingRequests}</h2>
        {errorIn ? (
          <p className="error">{t.common.couldNotLoad}</p>
        ) : loadingIn ? (
          <p className="empty">{t.common.loading}</p>
        ) : incoming.length === 0 ? (
          <p className="empty">{t.friends.noIncoming}</p>
        ) : (
          <div ref={inListRef}>
            {incoming.map((r) => (
              <Person
                key={r.request_id}
                user={r.user}
                note={r.message}
                arrow="in"
                onSelect={() => setSelectedId(r.user.id)}
                actions={
                  <>
                    <button onClick={() => onAccept(r.request_id)}>
                      {t.friends.accept}
                    </button>
                    <button
                      className="ghost"
                      onClick={() => onReject(r.request_id)}
                    >
                      {t.friends.decline}
                    </button>
                  </>
                }
              />
            ))}
          </div>
        )}
      </div>

      <div className="card" ref={outCardRef}>
        <h2 className="section-title">{t.friends.sentRequests}</h2>
        {errorOut ? (
          <p className="error">{t.common.couldNotLoad}</p>
        ) : loadingOut ? (
          <p className="empty">{t.common.loading}</p>
        ) : outgoing.length === 0 ? (
          <p className="empty">{t.friends.noSent}</p>
        ) : (
          <div ref={outListRef}>
            {outgoing.map((r) => (
              <Person
                key={r.request_id}
                user={r.user}
                subtitle={t.friends.pending}
                arrow="out"
                onSelect={() => setSelectedId(r.user.id)}
                actions={
                  <button
                    className="ghost"
                    onClick={() => onReject(r.request_id)}
                  >
                    {t.common.cancel}
                  </button>
                }
              />
            ))}
          </div>
        )}
      </div>

      <BridgeToast bridge={bridge} onDismiss={dismissBridge} />

      {selectedId ? (
        <ProfileModal userId={selectedId} onClose={() => setSelectedId(null)} />
      ) : null}
    </>
  );
}
