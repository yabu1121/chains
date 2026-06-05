"use client";

import { useState, type FormEvent } from "react";
import { Person } from "./Person";
import { Select } from "./Select";
import { AddFriendDialog } from "./AddFriendDialog";
import { ApiError } from "@/lib/api";
import { searchUsers } from "@/lib/hooks";
import { PROGRAMMING_LANGUAGES } from "@/lib/languages";
import { useReveal, useStagger } from "@/lib/anim";
import { useI18n } from "@/lib/i18n";
import type { UserSummary } from "@/lib/types";

export function FindPeople() {
  const { t } = useI18n();
  const [query, setQuery] = useState("");
  const [language, setLanguage] = useState("");
  const [results, setResults] = useState<UserSummary[] | null>(null);
  const [sent, setSent] = useState<Record<string, boolean>>({});
  // The user whose "Add friend" dialog is currently open, if any.
  const [dialogUser, setDialogUser] = useState<UserSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  const cardRef = useReveal<HTMLDivElement>();
  const resultsRef = useStagger<HTMLDivElement>(results);

  async function onSearch(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const q = query.trim();
    if (!q && !language) {
      setError(t.find.errTypeNameOrLang);
      return;
    }
    if (q && q.length < 2) {
      setError(t.find.errMin2);
      return;
    }
    setSearching(true);
    try {
      setResults(await searchUsers(q, language));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t.find.errSearchFailed);
    } finally {
      setSearching(false);
    }
  }

  return (
    <div className="card" ref={cardRef}>
      <h2 className="section-title">{t.find.title}</h2>
      <form onSubmit={onSearch} className="flex gap-2 flex-wrap">
        <input
          placeholder={t.find.searchPlaceholder}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="flex-1 min-w-[160px]"
        />
        <Select
          value={language}
          onChange={setLanguage}
          ariaLabel={t.find.filterByLanguage}
          options={[
            { value: "", label: t.find.anyLanguage },
            ...PROGRAMMING_LANGUAGES.map((lang) => ({ value: lang, label: lang })),
          ]}
        />
        <button type="submit" disabled={searching}>
          {searching ? "…" : t.find.search}
        </button>
      </form>

      {error ? <p className="error">{error}</p> : null}

      {results === null ? null : results.length === 0 ? (
        <p className="empty">{t.find.noUsers}</p>
      ) : (
        <div className="mt-2" ref={resultsRef}>
          {results.map((u) => (
            <Person
              key={u.id}
              user={u}
              actions={
                <button
                  onClick={() => setDialogUser(u)}
                  disabled={sent[u.id]}
                >
                  {sent[u.id] ? t.common.requested : t.common.addFriend}
                </button>
              }
            />
          ))}
        </div>
      )}

      {dialogUser ? (
        <AddFriendDialog
          addresseeId={dialogUser.id}
          displayName={dialogUser.display_name}
          onClose={() => setDialogUser(null)}
          onSent={() =>
            setSent((s) => ({ ...s, [dialogUser.id]: true }))
          }
        />
      ) : null}
    </div>
  );
}
