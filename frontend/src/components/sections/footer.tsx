"use client";

/**
 * フッター — 控えめな締め。新しい主張はせず案内に徹する。
 * 仕様の出典: docs/design-direction.md §5-8 / docs/copy.md §9（コピーは一字一句）。
 *
 * デザインシステムは本体 chains 準拠の新トークン（globals.css @theme）:
 *   border-border の上罫 / mono 小活字 / text-muted 中心。bg-bg のまま沈める。
 *
 * モーション: 入場 = useReveal（anime.js）。section に ref、各ブロックに .reveal。
 *   reduced-motion は useReveal が停止。フッターは動きを最小限に。
 *
 * a11y: リンクは <nav aria-label> + <ul>。/terms・/privacy は本体実在の同一オリジン
 *   ページなので素直な <a href>（target なし）。年表記は文として読めるまま。
 */

import { useReveal } from "../book/use-press-entrance";
import { AnimatedName } from "../motion/animated-name";
import copy from "@/content/copy.json";

const LINKS = copy.footer.links;
const SOCIAL = copy.footer.social;

/** ブランド SNS アイコン（24x24・currentColor）。label でパスを切り替える。 */
function SocialIcon({ label }: { label: string }) {
  if (label === "GitHub") {
    return (
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor" aria-hidden>
        <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23A11.5 11.5 0 0 1 12 5.803c1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.91 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222 0 1.606-.014 2.898-.014 3.293 0 .322.216.694.825.576C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
      </svg>
    );
  }
  // X（旧 Twitter）
  return (
    <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="currentColor" aria-hidden>
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231 5.45-6.231Zm-1.161 17.52h1.833L7.084 4.126H5.117l11.966 15.644Z" />
    </svg>
  );
}

export default function Footer() {
  const footerRef = useReveal<HTMLElement>();

  return (
    <footer
      ref={footerRef}
      className="border-t border-white/12 px-6 py-14 sm:px-10 lg:px-14"
    >
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-8 sm:flex-row sm:items-end sm:justify-between">
        {/* ロゴ + 一言 + SNS */}
        <div className="reveal">
          <AnimatedName
            text={copy.brand.name}
            className="font-mono text-lg tracking-tight text-bg"
          />
          <p className="mt-2 font-mono text-xs tracking-[0.04em] text-bg/70">
            {copy.footer.tagline}
          </p>
          {/* SNS リンク（外部）。アイコンのみ・読み上げ用 aria-label 付き。 */}
          <ul className="mt-4 flex items-center gap-3">
            {SOCIAL.map((s) => (
              <li key={s.label}>
                <a
                  href={s.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`chains の ${s.label}`}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/15 text-bg/70 transition-colors hover:border-white/30 hover:text-bg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bg"
                >
                  <SocialIcon label={s.label} />
                </a>
              </li>
            ))}
          </ul>
        </div>

        {/* リンク + 年表記 */}
        <div className="reveal flex flex-col gap-5 sm:items-end">
          <nav aria-label="フッター">
            <ul className="flex flex-wrap gap-x-6 gap-y-2 font-mono text-xs tracking-[0.04em]">
              {LINKS.map((link) => (
                <li key={link.href}>
                  <a
                    href={link.href}
                    className="text-bg/70 underline decoration-white/25 underline-offset-4 transition-colors hover:text-bg hover:decoration-bg"
                  >
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
          <p className="font-mono text-xs tracking-[0.04em] text-bg/70">
            {copy.footer.copyright}
          </p>
        </div>
      </div>
    </footer>
  );
}
