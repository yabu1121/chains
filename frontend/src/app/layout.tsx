import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { JetBrains_Mono, IBM_Plex_Sans_JP } from "next/font/google";
import { AuthProvider } from "@/lib/auth";
import { I18nProvider } from "@/lib/i18n";
import { ChainBackground } from "@/components/ChainBackground";
import { ServiceWorkerRegister } from "@/components/ServiceWorkerRegister";
import "./globals.css";

// Latin / English type: JetBrains Mono. Exposed as --font-mono and placed first
// in the app font stack so all Latin text renders in JetBrains Mono.
const mono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
  weight: ["400", "500", "700"],
});

// Japanese type: IBM Plex Sans JP. Exposed as --font-jp and placed AFTER
// --font-mono in the stack, so Japanese glyphs (absent from JetBrains Mono)
// fall through to it automatically while Latin stays in JetBrains Mono.
// `preload: false` — CJK fonts are large; don't block first paint preloading them.
const jp = IBM_Plex_Sans_JP({
  variable: "--font-jp",
  display: "swap",
  weight: ["400", "500", "600", "700"],
  preload: false,
});

export const metadata: Metadata = {
  title: "Chains",
  description: "Make connections — friends only.",
  // Favicon / app icon come from the App Router convention files
  // src/app/icon.png and src/app/apple-icon.png; the web manifest comes from
  // src/app/manifest.ts.
  applicationName: "Chains",
  // iOS standalone (Add to Home Screen): run full-screen, no Safari chrome.
  appleWebApp: {
    capable: true,
    title: "Chains",
    statusBarStyle: "default",
  },
  formatDetection: { telephone: false },
};

// Mobile-app viewport: lock zoom for an app-like feel, extend under the notch
// (viewport-fit=cover, paired with env(safe-area-inset-*) in globals.css), and
// paint the browser UI / status bar in the warm-paper background colour.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: "#faf8f4",
};

// Render at request time (not build time) so process.env.API_BASE_URL is read
// from the runtime container env rather than frozen into static HTML.
export const dynamic = "force-dynamic";

export default function RootLayout({ children }: { children: ReactNode }) {
  // The API base URL is resolved per request on the server, so one container
  // image can be pointed at any API via an env var (no rebuild). Falls back to
  // the build-time NEXT_PUBLIC value for local dev.
  const apiBaseUrl =
    process.env.API_BASE_URL ?? process.env.NEXT_PUBLIC_API_BASE_URL ?? "";
  return (
    <html lang="ja" className={`${mono.variable} ${jp.variable}`}>
      <head>
        {/* Next emits the modern `mobile-web-app-capable` and strips the legacy
            apple-prefixed name, but older iOS Safari still keys standalone
            launch off it — inject it raw so Add to Home Screen runs full-screen
            there too. */}
        <meta name="apple-mobile-web-app-capable" content="yes" />
      </head>
      <body>
        {/* Runs before the app bundle, so window config is ready for api.ts. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `window.__CHAINS_CONFIG__=${JSON.stringify({ apiBaseUrl })}`,
          }}
        />
        <ServiceWorkerRegister />
        <I18nProvider>
          <AuthProvider>
            <ChainBackground />
            <div className="app-root">{children}</div>
          </AuthProvider>
        </I18nProvider>
      </body>
    </html>
  );
}
