"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/auth";
import { ApiError } from "@/lib/api";
import { useReveal } from "@/lib/anim";
import { useI18n } from "@/lib/i18n";
import { TopBrandBar } from "@/components/TopBrandBar";
import { OAuthButtons } from "@/components/OAuthButtons";

export default function RegisterPage() {
  const { t } = useI18n();
  const { user, loading, register } = useAuth();
  const router = useRouter();
  const brandRef = useReveal<HTMLHeadingElement>({ scale: 0.9, y: 0 });
  const cardRef = useReveal<HTMLFormElement>({ delay: 90 });
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!loading && user) router.replace("/friends");
  }, [loading, user, router]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!agreed) {
      setError(t.register.agreeError);
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      await register(email, username, password, displayName);
      router.replace("/friends");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t.common.somethingWrong);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <TopBrandBar />
      <div className="auth-page">
        <header ref={brandRef} className="auth-hero">
        <h1 className="auth-wordmark">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="auth-logo" src="/chains-logo.png" alt="chains" />
        </h1>
        <p className="auth-eyebrow">{t.login.eyebrow}</p>
      </header>
      <form ref={cardRef} className="card auth-card" onSubmit={onSubmit}>
        <h2 className="section-title">{t.register.title}</h2>
        <label htmlFor="name">{t.register.displayName}</label>
        <input
          id="name"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          required
          maxLength={50}
        />
        <label htmlFor="username">{t.register.username}</label>
        <input
          id="username"
          value={username}
          onChange={(e) => setUsername(e.target.value.toLowerCase())}
          required
          minLength={3}
          maxLength={30}
          pattern="[a-z0-9_]+"
          placeholder={t.register.usernamePlaceholder}
        />
        <label htmlFor="email">{t.register.email}</label>
        <input
          id="email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <label htmlFor="password">{t.register.password}</label>
        <input
          id="password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          minLength={8}
        />
        <label
          htmlFor="agree"
          className="flex items-start gap-2 mt-4 cursor-pointer"
        >
          <input
            id="agree"
            type="checkbox"
            checked={agreed}
            onChange={(e) => setAgreed(e.target.checked)}
            className="w-auto mt-[3px]"
          />
          <span>
            {t.register.agreePre}
            <Link href="/terms" target="_blank">
              {t.register.agreeTermsLink}
            </Link>
            {t.register.agreePost}
          </span>
        </label>
        <div className="mt-5">
          <button
            className="primary"
            type="submit"
            disabled={submitting || !agreed}
          >
            {submitting ? t.register.submitting : t.register.submit}
          </button>
        </div>
        {error ? <p className="error">{error}</p> : null}
        <OAuthButtons />
        <p className="muted mt-4 text-center">
          {t.register.haveAccount} <Link href="/login">{t.register.login}</Link>
        </p>
        <p className="muted mt-1 text-center">
          <Link href="/terms">{t.legal.terms}</Link> ·{" "}
          <Link href="/privacy">{t.legal.privacy}</Link>
        </p>
        </form>
      </div>
    </>
  );
}
