"use client";

import { useState } from "react";
import { Guard } from "@/components/Guard";
import { Topbar } from "@/components/Topbar";
import { Person } from "@/components/Person";
import { FindPeople } from "@/components/FindPeople";
import { NetworkGraph } from "@/components/NetworkGraph";
import { ProfileEditor } from "@/components/ProfileEditor";
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
}: {
  tab: Tab;
  setTab: (t: Tab) => void;
  incomingCount: number;
}) {
  return (
    <>
      {TABS.map(({ key, label }) => (
        <button
          key={key}
          className={`navbtn${tab === key ? " active" : ""}`}
          onClick={() => setTab(key)}
        >
          <span>{label}</span>
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
  const incomingCount = useIncomingCount();
  const { user, logout } = useAuth();

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <span className="brand">⛓ chains</span>
        <nav className="sidebar-nav">
          <NavLinks tab={tab} setTab={setTab} incomingCount={incomingCount} />
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
          {tab === "friends" ? <FriendsTab /> : null}
          {tab === "requests" ? <RequestsTab /> : null}
          {tab === "find" ? <FindPeople /> : null}
          {tab === "network" ? <NetworkGraph /> : null}
          {tab === "profile" ? <ProfileEditor /> : null}
        </div>
      </div>

      <nav className="bottombar">
        <NavLinks tab={tab} setTab={setTab} incomingCount={incomingCount} />
      </nav>
    </div>
  );
}

function FriendsTab() {
  const { friends, isLoading } = useFriends();

  return (
    <div className="card">
      <h2 className="section-title">Your friends</h2>
      {isLoading ? (
        <p className="empty">Loading…</p>
      ) : friends.length === 0 ? (
        <p className="empty">No friends yet. Head to “Find people” to connect.</p>
      ) : (
        friends.map((f) => (
          <Person
            key={f.user.id}
            user={f.user}
            actions={
              <>
                <button onClick={() => removeFriend(f.user.id)}>Remove</button>
                <button className="danger" onClick={() => blockUser(f.user.id)}>
                  Block
                </button>
              </>
            }
          />
        ))
      )}
    </div>
  );
}

function RequestsTab() {
  const { requests: incoming, isLoading: loadingIn } = useIncomingRequests();
  const { requests: outgoing, isLoading: loadingOut } = useOutgoingRequests();

  return (
    <>
      <div className="card">
        <h2 className="section-title">Incoming requests</h2>
        {loadingIn ? (
          <p className="empty">Loading…</p>
        ) : incoming.length === 0 ? (
          <p className="empty">No incoming requests.</p>
        ) : (
          incoming.map((r) => (
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
          ))
        )}
      </div>

      <div className="card">
        <h2 className="section-title">Sent requests</h2>
        {loadingOut ? (
          <p className="empty">Loading…</p>
        ) : outgoing.length === 0 ? (
          <p className="empty">No pending sent requests.</p>
        ) : (
          outgoing.map((r) => (
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
          ))
        )}
      </div>
    </>
  );
}
