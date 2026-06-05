"use client";

import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
} from "react";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import { useAuth } from "@/lib/auth";
import { ApiError, deleteAccount, deleteAvatar, uploadAvatar } from "@/lib/api";
import { getProfile, updateProfile, type ProfileInput } from "@/lib/hooks";
import { PROGRAMMING_LANGUAGES } from "@/lib/languages";
import { useReveal } from "@/lib/anim";
import { useI18n } from "@/lib/i18n";
import type { PublicProfile, Visibility } from "@/lib/types";
import { Avatar } from "./Avatar";
import { AvatarCropper } from "./AvatarCropper";
import { Select } from "./Select";
import { LanguageSwitcher } from "./LanguageSwitcher";

// Cap on the *source* image the user picks. The cropper re-encodes to a small
// square JPEG, so this can be generous; it only guards against absurd files.
const MAX_SOURCE_BYTES = 15 * 1024 * 1024;

// The account-link fields, each paired with its visibility key. Driving the
// link inputs from this list keeps each value and its selector in sync. The
// label is a dictionary key resolved against `t.editor` at render time.
const LINK_FIELDS: {
  key: "x_handle" | "github_handle" | "zenn_handle" | "linkedin_url" | "portfolio_url";
  visKey:
    | "x_handle_visibility"
    | "github_handle_visibility"
    | "zenn_handle_visibility"
    | "linkedin_url_visibility"
    | "portfolio_url_visibility";
  labelKey: "xHandle" | "githubHandle" | "zennHandle" | "linkedinUrl" | "portfolioUrl";
  placeholder: string;
}[] = [
  { key: "x_handle", visKey: "x_handle_visibility", labelKey: "xHandle", placeholder: "elonmusk" },
  { key: "github_handle", visKey: "github_handle_visibility", labelKey: "githubHandle", placeholder: "torvalds" },
  { key: "zenn_handle", visKey: "zenn_handle_visibility", labelKey: "zennHandle", placeholder: "catnose" },
  { key: "linkedin_url", visKey: "linkedin_url_visibility", labelKey: "linkedinUrl", placeholder: "https://linkedin.com/in/…" },
  { key: "portfolio_url", visKey: "portfolio_url_visibility", labelKey: "portfolioUrl", placeholder: "https://example.com" },
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
  const { t } = useI18n();
  // Visibility levels offered for each account link, widening to narrowing.
  const VISIBILITY_OPTIONS = [
    { value: "public", label: t.editor.visEveryone },
    { value: "friends", label: t.editor.visFriends },
    { value: "private", label: t.editor.visPrivate },
  ];
  const { user, refreshUser, logout } = useAuth();
  const router = useRouter();
  const { data: profile, mutate } = useSWR<PublicProfile>(
    user ? `/api/users/${user.id}` : null,
    () => getProfile(user!.id),
  );

  const [form, setForm] = useState<ProfileInput>(EMPTY);
  const [status, setStatus] = useState<"idle" | "saving" | "saved">("idle");
  const [error, setError] = useState<string | null>(null);

  // Account deletion (danger zone).
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deletePassword, setDeletePassword] = useState("");
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  async function onDeleteAccount() {
    setDeleteError(null);
    setDeleting(true);
    try {
      await deleteAccount(deletePassword);
      await logout(); // clears local session; cookies already cleared server-side
      router.push("/login");
    } catch (err) {
      setDeleteError(
        err instanceof ApiError ? err.message : t.editor.couldNotDelete,
      );
      setDeleting(false);
    }
  }

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
      setAvatarError(t.editor.imageTooBig);
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
        err instanceof ApiError ? err.message : t.editor.uploadFailed,
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
        err instanceof ApiError ? err.message : t.editor.deleteFailed,
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
      setError(err instanceof ApiError ? err.message : t.editor.couldNotSave);
    }
  }

  return (
    <>
    <form className="card" onSubmit={onSubmit} ref={formRef}>
      <h2 className="section-title">{t.editor.title}</h2>

      <label>{t.common.language}</label>
      <div className="max-w-[200px] mb-1">
        <LanguageSwitcher fullWidth />
      </div>

      <label>{t.editor.photo}</label>
      <div className="flex items-center gap-[14px]">
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
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={avatarBusy}
          >
            {avatarBusy ? t.editor.uploading : t.editor.changePhoto}
          </button>
          {profile?.avatar_updated_at ? (
            <button
              type="button"
              className="danger"
              onClick={onRemoveAvatar}
              disabled={avatarBusy}
            >
              {t.common.remove}
            </button>
          ) : null}
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          onChange={onPickAvatar}
          className="hidden"
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

      <label htmlFor="dn">{t.editor.displayName}</label>
      <input
        id="dn"
        value={form.display_name}
        onChange={(e) => set("display_name", e.target.value)}
        required
        maxLength={50}
      />

      <label htmlFor="jt">{t.editor.jobTitle}</label>
      <input
        id="jt"
        value={form.job_title}
        onChange={(e) => set("job_title", e.target.value)}
        maxLength={60}
        placeholder={t.editor.jobPlaceholder}
      />

      <label htmlFor="sm">{t.editor.statusMessage(form.status_message.length)}</label>
      <input
        id="sm"
        value={form.status_message}
        onChange={(e) => set("status_message", e.target.value.slice(0, 100))}
        placeholder={t.editor.statusPlaceholder}
      />

      <label htmlFor="bd">{t.editor.birthDate}</label>
      <input
        id="bd"
        type="date"
        value={form.birth_date}
        max={new Date().toISOString().slice(0, 10)}
        onChange={(e) => set("birth_date", e.target.value)}
      />
      <div className="flex flex-wrap gap-4 mt-2 text-sm">
        <label className="flex items-center gap-[6px] m-0">
          <input
            type="checkbox"
            checked={form.show_age}
            onChange={(e) => set("show_age", e.target.checked)}
            className="w-auto"
          />
          {t.editor.showAge}
        </label>
        <label className="flex items-center gap-[6px] m-0">
          <input
            type="checkbox"
            checked={form.show_birth_date}
            onChange={(e) => set("show_birth_date", e.target.checked)}
            className="w-auto"
          />
          {t.editor.showBirthDate}
        </label>
      </div>

      <label>{t.editor.languagesLabel}</label>
      <Select
        fullWidth
        // Always shows the placeholder: picking a language adds it and resets.
        value=""
        onChange={addLanguage}
        disabled={form.languages.length >= 30}
        placeholder={
          form.languages.length >= 30
            ? t.editor.maxLanguages
            : t.editor.addLanguage
        }
        ariaLabel={t.editor.addLanguageAria}
        options={PROGRAMMING_LANGUAGES.filter(
          (lang) => !form.languages.includes(lang),
        ).map((lang) => ({ value: lang, label: lang }))}
      />
      {form.languages.length > 0 ? (
        <div className="flex flex-wrap gap-[6px] mt-2">
          {form.languages.map((lang) => (
            <span
              key={lang}
              className="inline-flex items-center gap-[6px] bg-panel-2 border border-border rounded-full pl-3 pr-[6px] py-[3px] text-[13px]"
            >
              {lang}
              <button
                type="button"
                onClick={() => removeLanguage(lang)}
                aria-label={t.editor.removeLang(lang)}
                className="border-0 bg-transparent text-muted px-1 py-0 text-[15px] leading-none"
              >
                ×
              </button>
            </span>
          ))}
        </div>
      ) : null}

      <label className="mt-1">{t.editor.linksVisibility}</label>
      <p className="muted mt-[-4px] text-[13px]">
        {t.editor.linksVisibilityDesc}
      </p>
      {LINK_FIELDS.map((f) => (
        <div key={f.key} className="mb-[10px]">
          <label htmlFor={f.key}>{t.editor[f.labelKey]}</label>
          <div className="flex gap-2 items-center">
            <input
              id={f.key}
              value={form[f.key]}
              onChange={(e) => set(f.key, e.target.value)}
              placeholder={f.placeholder}
              className="flex-1 min-w-0"
            />
            <div className="w-[150px] flex-shrink-0">
              <Select
                fullWidth
                value={form[f.visKey]}
                onChange={(v) => set(f.visKey, v as Visibility)}
                ariaLabel={t.editor.linkVisibilityAria(t.editor[f.labelKey])}
                options={VISIBILITY_OPTIONS}
              />
            </div>
          </div>
        </div>
      ))}

      <div className="mt-[18px] flex items-center gap-3">
        <button className="primary w-auto" type="submit" disabled={status === "saving"}>
          {status === "saving" ? t.editor.saving : t.editor.save}
        </button>
        {status === "saved" ? <span className="text-ok">{t.editor.saved}</span> : null}
      </div>
      {error ? <p className="error">{error}</p> : null}
    </form>

    <section className="card mt-[18px] border-danger">
      <h3 className="mt-0">{t.editor.deleteAccount}</h3>
      <p className="muted">{t.editor.deleteDesc}</p>
      {!confirmingDelete ? (
        <button type="button" className="ghost" onClick={() => setConfirmingDelete(true)}>
          {t.editor.deleteMyAccount}
        </button>
      ) : (
        <div className="flex flex-col gap-[10px] max-w-[360px]">
          <label>
            {t.editor.confirmPassword}
            <input
              type="password"
              autoComplete="current-password"
              value={deletePassword}
              onChange={(e) => setDeletePassword(e.target.value)}
            />
          </label>
          {deleteError ? <p className="error">{deleteError}</p> : null}
          <div className="flex gap-[10px]">
            <button
              type="button"
              className="primary w-auto bg-danger"
              disabled={deleting || deletePassword.length === 0}
              onClick={onDeleteAccount}
            >
              {deleting ? t.editor.deleting : t.editor.permanentlyDelete}
            </button>
            <button
              type="button"
              className="ghost"
              disabled={deleting}
              onClick={() => {
                setConfirmingDelete(false);
                setDeletePassword("");
                setDeleteError(null);
              }}
            >
              {t.common.cancel}
            </button>
          </div>
        </div>
      )}
    </section>
    </>
  );
}
