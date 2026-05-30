"use client";

import { useState, type FormEvent } from "react";
import { Person } from "./Person";
import { Select } from "./Select";
import { ApiError } from "@/lib/api";
import { searchUsers, sendRequest } from "@/lib/hooks";
import { PROGRAMMING_LANGUAGES } from "@/lib/languages";
import { useReveal, useStagger } from "@/lib/anim";
import type { UserSummary } from "@/lib/types";

export function FindPeople() {
  const [query, setQuery] = useState("");
  const [language, setLanguage] = useState("");
  const [results, setResults] = useState<UserSummary[] | null>(null);
  const [sent, setSent] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  const cardRef = useReveal<HTMLDivElement>();
  const resultsRef = useStagger<HTMLDivElement>(results);

  async function onSearch(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const q = query.trim();
    if (!q && !language) {
      setError("Type a name or pick a language");
      return;
    }
    if (q && q.length < 2) {
      setError("Type at least 2 characters");
      return;
    }
    setSearching(true);
    try {
      setResults(await searchUsers(q, language));
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
    <div className="card" ref={cardRef}>
      <h2 className="section-title">Find people</h2>
      <form onSubmit={onSearch} style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <input
          placeholder="Search by name or email"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          style={{ flex: 1, minWidth: 160 }}
        />
        <Select
          value={language}
          onChange={setLanguage}
          ariaLabel="Filter by language"
          options={[
            { value: "", label: "Any language" },
            ...PROGRAMMING_LANGUAGES.map((lang) => ({ value: lang, label: lang })),
          ]}
        />
        <button type="submit" disabled={searching}>
          {searching ? "…" : "Search"}
        </button>
      </form>

      {error ? <p className="error">{error}</p> : null}

      {results === null ? null : results.length === 0 ? (
        <p className="empty">No users found.</p>
      ) : (
        <div style={{ marginTop: 8 }} ref={resultsRef}>
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
