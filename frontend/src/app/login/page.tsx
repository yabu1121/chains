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

export default function LoginPage() {
  const { t } = useI18n();
  const { user, loading, login } = useAuth();
  const router = useRouter();
  const brandRef = useReveal<HTMLHeadingElement>({ scale: 0.9, y: 0 });
  const cardRef = useReveal<HTMLFormElement>({ delay: 90 });
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!loading && user) router.replace("/friends");
  }, [loading, user, router]);

  // OAuth callbacks redirect back here with ?error=<code> when social login
  // fails (denied consent, no verified email, …). Read it from the URL once and
  // show a friendly message, then strip the param so a refresh doesn't re-show.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.has("error")) {
      setError(t.login.oauthError);
      window.history.replaceState(null, "", window.location.pathname);
    }
  }, [t]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login(email, password);
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
        <h2 className="section-title">{t.login.title}</h2>
        <label htmlFor="email">{t.login.email}</label>
        <input
          id="email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <label htmlFor="password">{t.login.password}</label>
        <input
          id="password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        <div className="mt-5">
          <button className="primary" type="submit" disabled={submitting}>
            {submitting ? t.login.submitting : t.login.submit}
          </button>
        </div>
        {error ? <p className="error">{error}</p> : null}
        <OAuthButtons />
        <p className="muted mt-4 text-center">
          {t.login.noAccount} <Link href="/register">{t.login.createOne}</Link>
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
