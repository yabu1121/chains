"use client";

import { useState, type FormEvent } from "react";
import { Person } from "./Person";
import { ApiError } from "@/lib/api";
import { searchUsers, sendRequest } from "@/lib/hooks";
import type { UserSummary } from "@/lib/types";

export function FindPeople() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<UserSummary[] | null>(null);
  const [sent, setSent] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);

  async function onSearch(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (query.trim().length < 2) {
      setError("Type at least 2 characters");
      return;
    }
    setSearching(true);
    try {
      setResults(await searchUsers(query.trim()));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Search failed");
    } finally {
      setSearching(false);
    }
  }

  async function onSend(userId: string) {
    setError(null);
    try {
      await sendRequest(userId);
      setSent((s) => ({ ...s, [userId]: true }));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not send request");
    }
  }

  return (
    <div className="card">
      <h2 className="section-title">Find people</h2>
      <form onSubmit={onSearch} style={{ display: "flex", gap: 8 }}>
        <input
          placeholder="Search by name or email"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <button type="submit" disabled={searching}>
          {searching ? "…" : "Search"}
        </button>
      </form>

      {error ? <p className="error">{error}</p> : null}

      {results === null ? null : results.length === 0 ? (
        <p className="empty">No users found.</p>
      ) : (
        <div style={{ marginTop: 8 }}>
          {results.map((u) => (
            <Person
              key={u.id}
              user={u}
              actions={
                <button
                  onClick={() => onSend(u.id)}
                  disabled={sent[u.id]}
                >
                  {sent[u.id] ? "Requested" : "Add friend"}
                </button>
              }
            />
          ))}
        </div>
      )}
    </div>
  );
}
