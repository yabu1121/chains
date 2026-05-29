"use client";

import { useEffect, useState, type FormEvent, type KeyboardEvent } from "react";
import useSWR from "swr";
import { useAuth } from "@/lib/auth";
import { ApiError } from "@/lib/api";
import { getProfile, updateProfile, type ProfileInput } from "@/lib/hooks";
import type { PublicProfile } from "@/lib/types";

const EMPTY: ProfileInput = {
  display_name: "",
  bio: "",
  x_handle: "",
  github_handle: "",
  zenn_handle: "",
  linkedin_url: "",
  portfolio_url: "",
  languages: [],
};

export function ProfileEditor() {
  const { user, refreshUser } = useAuth();
  const { data: profile, mutate } = useSWR<PublicProfile>(
    user ? `/api/users/${user.id}` : null,
    () => getProfile(user!.id),
  );

  const [form, setForm] = useState<ProfileInput>(EMPTY);
  const [newLang, setNewLang] = useState("");
  const [status, setStatus] = useState<"idle" | "saving" | "saved">("idle");
  const [error, setError] = useState<string | null>(null);

  // Prefill from the loaded profile (includes languages).
  useEffect(() => {
    if (!profile) return;
    setForm({
      display_name: profile.display_name,
      bio: profile.bio,
      x_handle: profile.x_handle,
      github_handle: profile.github_handle,
      zenn_handle: profile.zenn_handle,
      linkedin_url: profile.linkedin_url,
      portfolio_url: profile.portfolio_url,
      languages: profile.languages,
    });
  }, [profile]);

  function set<K extends keyof ProfileInput>(key: K, value: ProfileInput[K]) {
    setForm((f) => ({ ...f, [key]: value }));
    setStatus("idle");
  }

  function addLanguage() {
    const lang = newLang.trim();
    if (!lang) return;
    const exists = form.languages.some((l) => l.toLowerCase() === lang.toLowerCase());
    if (!exists && form.languages.length < 30) {
      set("languages", [...form.languages, lang]);
    }
    setNewLang("");
  }

  function onLangKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      addLanguage();
    }
  }

  function removeLanguage(lang: string) {
    set(
      "languages",
      form.languages.filter((l) => l !== lang),
    );
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setStatus("saving");
    try {
      const updated = await updateProfile(form);
      await mutate(updated, { revalidate: false });
      await refreshUser();
      setStatus("saved");
    } catch (err) {
      setStatus("idle");
      setError(err instanceof ApiError ? err.message : "Could not save profile");
    }
  }

  return (
    <form className="card" onSubmit={onSubmit}>
      <h2 className="section-title">Your profile</h2>

      <label htmlFor="dn">Display name</label>
      <input
        id="dn"
        value={form.display_name}
        onChange={(e) => set("display_name", e.target.value)}
        required
        maxLength={50}
      />

      <label htmlFor="bio">Bio ({form.bio.length}/160)</label>
      <textarea
        id="bio"
        value={form.bio}
        onChange={(e) => set("bio", e.target.value.slice(0, 160))}
        rows={3}
        style={{
          width: "100%",
          padding: "10px 12px",
          background: "var(--panel-2)",
          border: "1px solid var(--border)",
          borderRadius: 8,
          color: "var(--text)",
          font: "inherit",
          resize: "vertical",
        }}
      />

      <label>Languages (programming languages you've worked with)</label>
      <div style={{ display: "flex", gap: 8 }}>
        <input
          value={newLang}
          onChange={(e) => setNewLang(e.target.value)}
          onKeyDown={onLangKeyDown}
          placeholder="e.g. Go, then press Enter"
          maxLength={40}
        />
        <button type="button" onClick={addLanguage}>
          Add
        </button>
      </div>
      {form.languages.length > 0 ? (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
          {form.languages.map((lang) => (
            <span
              key={lang}
              style={{
                background: "var(--panel-2)",
                border: "1px solid var(--border)",
                borderRadius: 999,
                padding: "3px 6px 3px 12px",
                fontSize: 13,
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              {lang}
              <button
                type="button"
                onClick={() => removeLanguage(lang)}
                aria-label={`Remove ${lang}`}
                style={{
                  border: "none",
                  background: "transparent",
                  color: "var(--muted)",
                  padding: "0 4px",
                  fontSize: 15,
                  lineHeight: 1,
                }}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      ) : null}

      <label htmlFor="x">X handle (without @)</label>
      <input id="x" value={form.x_handle} onChange={(e) => set("x_handle", e.target.value)} placeholder="elonmusk" />

      <label htmlFor="gh">GitHub handle</label>
      <input id="gh" value={form.github_handle} onChange={(e) => set("github_handle", e.target.value)} placeholder="torvalds" />

      <label htmlFor="zenn">Zenn handle</label>
      <input id="zenn" value={form.zenn_handle} onChange={(e) => set("zenn_handle", e.target.value)} placeholder="catnose" />

      <label htmlFor="li">LinkedIn URL</label>
      <input id="li" value={form.linkedin_url} onChange={(e) => set("linkedin_url", e.target.value)} placeholder="https://linkedin.com/in/…" />

      <label htmlFor="pf">Portfolio URL</label>
      <input id="pf" value={form.portfolio_url} onChange={(e) => set("portfolio_url", e.target.value)} placeholder="https://example.com" />

      <div style={{ marginTop: 18, display: "flex", alignItems: "center", gap: 12 }}>
        <button className="primary" type="submit" disabled={status === "saving"} style={{ width: "auto" }}>
          {status === "saving" ? "Saving…" : "Save profile"}
        </button>
        {status === "saved" ? <span style={{ color: "var(--ok)" }}>Saved ✓</span> : null}
      </div>
      {error ? <p className="error">{error}</p> : null}
    </form>
  );
}
