"use client";

import { useI18n } from "@/lib/i18n";

// Hand-maintained release notes. Add the newest version at the TOP; each item
// is bilingual so it follows the app's language toggle. Keep entries short and
// user-facing (what changed for them, not the commit text).
type Entry = {
  version: string;
  date: string; // YYYY-MM-DD
  items: { ja: string; en: string }[];
};

const ENTRIES: Entry[] = [
  {
    version: "0.5.0",
    date: "2026-06-07",
    items: [
      { ja: "設定をメニュー形式に刷新（プロフィール / バージョン履歴 / 利用規約 / プライバシー / 言語）", en: "Reworked Settings into a menu (profile, changelog, terms, privacy, language)" },
      { ja: "画面の切り替えをネイティブアプリのような滑らかなアニメーションに", en: "Smoother, native-app-style screen transitions" },
      { ja: "ネットワーク図を調整（つながりが広がる表示・上部をコンパクトに・言語フィルタ）", en: "Network tuning: spread-out layout, compact header, language filter" },
      { ja: "スマホのログイン / アカウント作成を画面サイズに最適化", en: "Mobile login / sign-up fitted to the screen" },
      { ja: "フレンドリクエストからもプロフィールを表示できるように", en: "Open profiles from friend requests too" },
      { ja: "フッターの現在地表示を分かりやすく", en: "Clearer active tab in the bottom navigation" },
    ],
  },
  {
    version: "0.4.0",
    date: "2026-06-07",
    items: [
      { ja: "GitHub / Google でログインできるようになりました", en: "Sign in with GitHub or Google" },
      { ja: "ログイン状態を最大180日保持（再ログインの手間を削減）", en: "Stay signed in for up to 180 days" },
      { ja: "ネットワーク図とスマホのヘッダー表示を改善", en: "Cleaner network view and mobile header" },
    ],
  },
  {
    version: "0.3.0",
    date: "2026-06-06",
    items: [
      { ja: "ホーム画面に追加できるアプリ（PWA）に対応・オフライン画面を追加", en: "Installable app (PWA) with an offline screen" },
      { ja: "サイドバーの開閉とナビゲーションのアイコン化", en: "Collapsible sidebar and icon navigation" },
    ],
  },
  {
    version: "0.2.0",
    date: "2026-06-05",
    items: [
      { ja: "ブランド・ビジュアルを刷新（ロゴ・フォント・配色）", en: "Brand and visual refresh (logo, fonts, palette)" },
      { ja: "つながりが2つの輪を結んだときのお祝い表示を追加", en: "Bridge celebration when a connection links two clusters" },
    ],
  },
];

export function VersionHistory() {
  const { lang } = useI18n();
  return (
    <div className="flex flex-col gap-3">
      {ENTRIES.map((e) => (
        <article key={e.version} className="card m-0">
          <header className="flex items-baseline gap-3 mb-2">
            <span className="font-semibold text-ink">v{e.version}</span>
            <time className="muted text-[13px]" dateTime={e.date}>
              {e.date}
            </time>
          </header>
          <ul className="list-disc pl-5 m-0 flex flex-col gap-[6px] text-[14px] leading-relaxed">
            {e.items.map((it, i) => (
              <li key={i}>{lang === "ja" ? it.ja : it.en}</li>
            ))}
          </ul>
        </article>
      ))}
    </div>
  );
}
