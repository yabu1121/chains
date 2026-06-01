"use client";

import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
} from "react";
import useSWR from "swr";
import { useAuth } from "@/lib/auth";
import { ApiError, deleteAvatar, uploadAvatar } from "@/lib/api";
import { getProfile, updateProfile, type ProfileInput } from "@/lib/hooks";
import { PROGRAMMING_LANGUAGES } from "@/lib/languages";
import { useReveal } from "@/lib/anim";
import type { PublicProfile, Visibility } from "@/lib/types";
import { Avatar } from "./Avatar";
import { AvatarCropper } from "./AvatarCropper";
import { Select } from "./Select";

// Cap on the *source* image the user picks. The cropper re-encodes to a small
// square JPEG, so this can be generous; it only guards against absurd files.
const MAX_SOURCE_BYTES = 15 * 1024 * 1024;

// Visibility levels offered for each account link, widening to narrowing.
const VISIBILITY_OPTIONS = [
  { value: "public", label: "Everyone" },
  { value: "friends", label: "Friends only" },
  { value: "private", label: "private" },
];

// The account-link fields, each paired with its visibility key. Driving the
// link inputs from this list keeps each value and its selector in sync.
const LINK_FIELDS: {
  key: "x_handle" | "github_handle" | "zenn_handle" | "linkedin_url" | "portfolio_url";
  visKey:
    | "x_handle_visibility"
    | "github_handle_visibility"
    | "zenn_handle_visibility"
    | "linkedin_url_visibility"
    | "portfolio_url_visibility";
  label: string;
  placeholder: string;
}[] = [
  { key: "x_handle", visKey: "x_handle_visibility", label: "X handle (without @)", placeholder: "elonmusk" },
  { key: "github_handle", visKey: "github_handle_visibility", label: "GitHub handle", placeholder: "torvalds" },
  { key: "zenn_handle", visKey: "zenn_handle_visibility", label: "Zenn handle", placeholder: "catnose" },
  { key: "linkedin_url", visKey: "linkedin_url_visibility", label: "LinkedIn URL", placeholder: "https://linkedin.com/in/…" },
  { key: "portfolio_url", visKey: "portfolio_url_visibility", label: "Portfolio URL", placeholder: "https://example.com" },
];

const EMPTY: ProfileInput = {
  display_name: "",
  job_title: "",
  status_message: "",
  x_handle: "",
  github_handle: "",
  zenn_handle: "",
  linkedin_url: "",
  portfolio_url: "",
  languages: [],
  birth_date: "",
  show_age: true,
  show_birth_date: false,
  x_handle_visibility: "friends",
  github_handle_visibility: "friends",
  zenn_handle_visibility: "friends",
  linkedin_url_visibility: "friends",
  portfolio_url_visibility: "friends",
};

export function ProfileEditor() {
  const { user, refreshUser } = useAuth();
  const { data: profile, mutate } = useSWR<PublicProfile>(
    user ? `/api/users/${user.id}` : null,
    () => getProfile(user!.id),
  );

  const [form, setForm] = useState<ProfileInput>(EMPTY);
  const [status, setStatus] = useState<"idle" | "saving" | "saved">("idle");
  const [error, setError] = useState<string | null>(null);

  const fileRef = useRef<HTMLInputElement>(null);
  const formRef = useReveal<HTMLFormElement>();
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  // Object URL of the picked image while the square cropper is open.
  const [cropSrc, setCropSrc] = useState<string | null>(null);

  function closeCropper() {
    setCropSrc((url) => {
      if (url) URL.revokeObjectURL(url);
      return null;
    });
  }

  // Revoke any outstanding object URL on unmount.
  useEffect(() => {
    return () => {
      if (cropSrc) URL.revokeObjectURL(cropSrc);
    };
  }, [cropSrc]);

  function onPickAvatar(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-picking the same file
    if (!file) return;
    setAvatarError(null);
    if (file.size > MAX_SOURCE_BYTES) {
      setAvatarError("画像は15MBまでにしてください");
      return;
    }
    // Open the cropper; the actual upload happens on confirm.
    setCropSrc(URL.createObjectURL(file));
  }

  async function onCropped(blob: Blob) {
    closeCropper();
    setAvatarBusy(true);
    try {
      const file = new File([blob], "avatar.jpg", { type: "image/jpeg" });
      await uploadAvatar(file);
      await mutate();
      await refreshUser();
    } catch (err) {
      setAvatarError(
        err instanceof ApiError ? err.message : "アップロードに失敗しました",
      );
    } finally {
      setAvatarBusy(false);
    }
  }

  async function onRemoveAvatar() {
    setAvatarError(null);
    setAvatarBusy(true);
    try {
      await deleteAvatar();
      await mutate();
      await refreshUser();
    } catch (err) {
      setAvatarError(
        err instanceof ApiError ? err.message : "削除に失敗しました",
      );
    } finally {
      setAvatarBusy(false);
    }
  }

  // Prefill from the loaded profile (includes languages).
  useEffect(() => {
    if (!profile) return;
    setForm({
      display_name: profile.display_name,
      job_title: profile.job_title,
      status_message: profile.status_message,
      x_handle: profile.x_handle,
      github_handle: profile.github_handle,
      zenn_handle: profile.zenn_handle,
      linkedin_url: profile.linkedin_url,
      portfolio_url: profile.portfolio_url,
      languages: profile.languages,
      birth_date: profile.birth_date ?? "",
      show_age: profile.show_age ?? true,
      show_birth_date: profile.show_birth_date ?? false,
      x_handle_visibility: profile.link_visibility?.x_handle ?? "friends",
      github_handle_visibility: profile.link_visibility?.github_handle ?? "friends",
      zenn_handle_visibility: profile.link_visibility?.zenn_handle ?? "friends",
      linkedin_url_visibility: profile.link_visibility?.linkedin_url ?? "friends",
      portfolio_url_visibility: profile.link_visibility?.portfolio_url ?? "friends",
    });
  }, [profile]);

  function set<K extends keyof ProfileInput>(key: K, value: ProfileInput[K]) {
    setForm((f) => ({ ...f, [key]: value }));
    setStatus("idle");
  }

  function addLanguage(lang: string) {
    if (!lang) return;
    const exists = form.languages.some(
      (l) => l.toLowerCase() === lang.toLowerCase(),
    );
    if (!exists && form.languages.length < 30) {
      set("languages", [...form.languages, lang]);
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
    <form className="card" onSubmit={onSubmit} ref={formRef}>
      <h2 className="section-title">Your profile</h2>

      <label>Photo</label>
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        {user ? (
          <Avatar
            user={{
              id: user.id,
              display_name: form.display_name || user.display_name,
              avatar_updated_at:
                profile?.avatar_updated_at ?? user.avatar_updated_at,
            }}
            size={64}
          />
        ) : null}
        <div style={{ display: "flex", gap: 8 }}>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={avatarBusy}
          >
            {avatarBusy ? "Uploading…" : "Change photo"}
          </button>
          {profile?.avatar_updated_at ? (
            <button
              type="button"
              className="danger"
              onClick={onRemoveAvatar}
              disabled={avatarBusy}
            >
              Remove
            </button>
          ) : null}
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          onChange={onPickAvatar}
          style={{ display: "none" }}
        />
      </div>
      {avatarError ? <p className="error">{avatarError}</p> : null}

      {cropSrc ? (
        <AvatarCropper
          src={cropSrc}
          onCancel={closeCropper}
          onConfirm={onCropped}
        />
      ) : null}

      <label htmlFor="dn">Display name</label>
      <input
        id="dn"
        value={form.display_name}
        onChange={(e) => set("display_name", e.target.value)}
        required
        maxLength={50}
      />

      <label htmlFor="jt">Job title</label>
      <input
        id="jt"
        value={form.job_title}
        onChange={(e) => set("job_title", e.target.value)}
        maxLength={60}
        placeholder="Software Engineer"
      />

      <label htmlFor="sm">Status message ({form.status_message.length}/100)</label>
      <input
        id="sm"
        value={form.status_message}
        onChange={(e) => set("status_message", e.target.value.slice(0, 100))}
        placeholder="What are you up to?"
      />

      <label htmlFor="bd">Birth date</label>
      <input
        id="bd"
        type="date"
        value={form.birth_date}
        max={new Date().toISOString().slice(0, 10)}
        onChange={(e) => set("birth_date", e.target.value)}
      />
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 16,
          marginTop: 8,
          fontSize: 14,
        }}
      >
        <label
          style={{ display: "flex", alignItems: "center", gap: 6, margin: 0 }}
        >
          <input
            type="checkbox"
            checked={form.show_age}
            onChange={(e) => set("show_age", e.target.checked)}
            style={{ width: "auto" }}
          />
          Show my age
        </label>
        <label
          style={{ display: "flex", alignItems: "center", gap: 6, margin: 0 }}
        >
          <input
            type="checkbox"
            checked={form.show_birth_date}
            onChange={(e) => set("show_birth_date", e.target.checked)}
            style={{ width: "auto" }}
          />
          Show my birth date
        </label>
      </div>

      <label>Languages (programming languages you&apos;ve worked with)</label>
      <Select
        fullWidth
        // Always shows the placeholder: picking a language adds it and resets.
        value=""
        onChange={addLanguage}
        disabled={form.languages.length >= 30}
        placeholder={
          form.languages.length >= 30
            ? "Maximum 30 languages"
            : "Add a language…"
        }
        ariaLabel="Add a programming language"
        options={PROGRAMMING_LANGUAGES.filter(
          (lang) => !form.languages.includes(lang),
        ).map((lang) => ({ value: lang, label: lang }))}
      />
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

      <label style={{ marginTop: 4 }}>Links &amp; visibility</label>
      <p className="muted" style={{ marginTop: -4, fontSize: 13 }}>
        Choose who can see each link: everyone, friends only, or just you.
      </p>
      {LINK_FIELDS.map((f) => (
        <div key={f.key} style={{ marginBottom: 10 }}>
          <label htmlFor={f.key}>{f.label}</label>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input
              id={f.key}
              value={form[f.key]}
              onChange={(e) => set(f.key, e.target.value)}
              placeholder={f.placeholder}
              style={{ flex: 1, minWidth: 0 }}
            />
            <div style={{ width: 150, flexShrink: 0 }}>
              <Select
                fullWidth
                value={form[f.visKey]}
                onChange={(v) => set(f.visKey, v as Visibility)}
                ariaLabel={`${f.label} visibility`}
                options={VISIBILITY_OPTIONS}
              />
            </div>
          </div>
        </div>
      ))}

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
