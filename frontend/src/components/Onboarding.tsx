"use client";

import { useCallback, useState } from "react";
import { createPortal } from "react-dom";
import useSWR from "swr";
import { useAuth } from "@/lib/auth";
import { ApiError } from "@/lib/api";
import { useDialog } from "@/lib/dialog";
import { useMounted } from "./motion/use-mounted";
import {
  getProfile,
  track,
  updateProfile,
  type ProfileInput,
} from "@/lib/hooks";
import { PROGRAMMING_LANGUAGES } from "@/lib/languages";
import { useI18n } from "@/lib/i18n";
import type { PublicProfile } from "@/lib/types";
import { Select } from "./Select";

const STORAGE_KEY = "chains:onboarded";

/** Builds a full ProfileInput from a loaded profile, so onboarding only changes
 *  the fields it captures and preserves everything else. */
function inputFrom(p: PublicProfile): ProfileInput {
  return {
    display_name: p.display_name,
    job_title: p.job_title,
    status_message: p.status_message,
    interests: p.interests,
    looking_for: p.looking_for,
    can_help_with: p.can_help_with,
    building_now: p.building_now,
    x_handle: p.x_handle,
    github_handle: p.github_handle,
    zenn_handle: p.zenn_handle,
    linkedin_url: p.linkedin_url,
    portfolio_url: p.portfolio_url,
    languages: p.languages,
    birth_date: p.birth_date ?? "",
    show_age: p.show_age ?? true,
    show_birth_date: p.show_birth_date ?? false,
    x_handle_visibility: p.link_visibility?.x_handle ?? "friends",
    github_handle_visibility: p.link_visibility?.github_handle ?? "friends",
    zenn_handle_visibility: p.link_visibility?.zenn_handle ?? "friends",
    linkedin_url_visibility: p.link_visibility?.linkedin_url ?? "friends",
    portfolio_url_visibility: p.link_visibility?.portfolio_url ?? "friends",
  };
}

/**
 * Onboarding gathers the few inputs that make everything else work — languages,
 * interests, what you're looking for, what you can help with, and a link — right
 * after sign-up. Without these, News recommendations and discovery have nothing
 * to work with, so this is the single most important step for retention.
 */
export function Onboarding({
  userId,
  onClose,
}: {
  userId: string;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const { refreshUser } = useAuth();
  const { data: profile, mutate } = useSWR<PublicProfile>(
    `/api/users/${userId}`,
    () => getProfile(userId),
  );

  const [languages, setLanguages] = useState<string[]>([]);
  const [interests, setInterests] = useState("");
  const [lookingFor, setLookingFor] = useState("");
  const [canHelpWith, setCanHelpWith] = useState("");
  const [github, setGithub] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mounted = useMounted();

  const finish = useCallback(() => {
    try {
      localStorage.setItem(STORAGE_KEY, "1");
    } catch {
      /* private mode — ignore */
    }
    onClose();
  }, [onClose]);
  const dialogRef = useDialog<HTMLDivElement>(finish);

  function addLanguage(lang: string) {
    if (!lang) return;
    setLanguages((ls) =>
      ls.some((l) => l.toLowerCase() === lang.toLowerCase()) ? ls : [...ls, lang],
    );
  }

  async function onSave() {
    if (!profile) return;
    setError(null);
    setSaving(true);
    try {
      const input = inputFrom(profile);
      input.languages = languages.length ? languages : profile.languages;
      input.interests = interests.trim() || profile.interests;
      input.looking_for = lookingFor.trim() || profile.looking_for;
      input.can_help_with = canHelpWith.trim() || profile.can_help_with;
      const gh = github.trim().replace(/^@/, "");
      if (gh) input.github_handle = gh;
      const updated = await updateProfile(input);
      await mutate(updated, { revalidate: false });
      await refreshUser();
      track("onboarding_completed", { languages: languages.length });
      finish();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t.onboarding.couldNotSave);
      setSaving(false);
    }
  }

  if (!mounted) return null;

  return createPortal(
    <div className="modal-overlay" onClick={finish}>
      <div
        className="modal-card"
        role="dialog"
        aria-modal="true"
        aria-label={t.onboarding.title}
        ref={dialogRef}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="section-title mt-0">{t.onboarding.title}</h2>
        <p className="muted mt-[-4px]">{t.onboarding.intro}</p>

        <label>{t.onboarding.languages}</label>
        <Select
          fullWidth
          value=""
          onChange={addLanguage}
          placeholder={t.editor.addLanguage}
          ariaLabel={t.editor.addLanguageAria}
          options={PROGRAMMING_LANGUAGES.filter(
            (l) => !languages.includes(l),
          ).map((l) => ({ value: l, label: l }))}
        />
        {languages.length > 0 ? (
          <div className="flex flex-wrap gap-[6px] mt-2">
            {languages.map((lang) => (
              <span
                key={lang}
                className="inline-flex items-center gap-[6px] bg-panel-2 border border-border rounded-full pl-3 pr-[6px] py-[3px] text-[13px]"
              >
                {lang}
                <button
                  type="button"
                  onClick={() =>
                    setLanguages((ls) => ls.filter((l) => l !== lang))
                  }
                  aria-label={t.editor.removeLang(lang)}
                  className="border-0 bg-transparent text-muted px-1 py-0 text-[15px] leading-none"
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        ) : null}

        <label htmlFor="ob-int">{t.editor.interests}</label>
        <input
          id="ob-int"
          value={interests}
          onChange={(e) => setInterests(e.target.value.slice(0, 200))}
          placeholder={t.editor.interestsPlaceholder}
        />

        <label htmlFor="ob-look">{t.editor.lookingFor}</label>
        <input
          id="ob-look"
          value={lookingFor}
          onChange={(e) => setLookingFor(e.target.value.slice(0, 200))}
          placeholder={t.editor.lookingForPlaceholder}
        />

        <label htmlFor="ob-help">{t.editor.canHelpWith}</label>
        <input
          id="ob-help"
          value={canHelpWith}
          onChange={(e) => setCanHelpWith(e.target.value.slice(0, 200))}
          placeholder={t.editor.canHelpWithPlaceholder}
        />

        <label htmlFor="ob-gh">{t.editor.githubHandle}</label>
        <input
          id="ob-gh"
          value={github}
          onChange={(e) => setGithub(e.target.value)}
          placeholder="torvalds"
        />

        {error ? <p className="error">{error}</p> : null}

        <div className="mt-4 flex items-center gap-3">
          <button
            type="button"
            className="primary w-auto"
            onClick={onSave}
            disabled={saving || !profile}
          >
            {saving ? t.onboarding.saving : t.onboarding.save}
          </button>
          <button type="button" className="ghost" onClick={finish}>
            {t.onboarding.skip}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/** Reports whether onboarding should run: not yet completed and the profile is
 *  still essentially empty (no languages and no "about" fields). */
export function shouldOnboard(p: PublicProfile): boolean {
  try {
    if (localStorage.getItem(STORAGE_KEY) === "1") return false;
  } catch {
    /* ignore */
  }
  return (
    p.languages.length === 0 &&
    !p.interests.trim() &&
    !p.looking_for.trim() &&
    !p.can_help_with.trim() &&
    !p.building_now.trim()
  );
}
