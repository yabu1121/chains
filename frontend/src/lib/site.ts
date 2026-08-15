/**
 * サイト共通の定数。
 * LP は chains アプリに統合済みなので、登録 CTA は同一アプリの /register へ遷移する
 * （相対パス＝同一オリジン。register ページはログイン済みなら /friends へ自動遷移する）。
 */
export const APP_REGISTER_URL = "/register";

// --- Launch "掲載情報" -------------------------------------------------------
// Public site URL + support contact, single-sourced here so metadata, the web
// manifest and the legal/settings pages all stay in sync. Env-overridable for
// prod/staging, with fallbacks for local dev.

// Public origin, used for metadataBase and absolute OG/Twitter image URLs.
export const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ??
  "https://chains-front-180234550522.asia-northeast1.run.app";

// Support / legal contact address. Shown in Settings and the legal pages.
export const CONTACT_EMAIL =
  process.env.NEXT_PUBLIC_CONTACT_EMAIL ?? "hayabusa115346@gmail.com";

// One-line product description, reused across metadata + the web manifest.
export const SITE_DESCRIPTION =
  "プロフィールに言語とリンクを書き、フレンド申請でつながる。あなたの関係は、そのままネットワークになります。";

export const SITE_NAME = "chains";
export const SITE_TAGLINE = "エンジニアのためのネットワーク";
