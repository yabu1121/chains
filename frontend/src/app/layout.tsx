import type { Metadata } from "next";
import type { ReactNode } from "react";
import { AuthProvider } from "@/lib/auth";
import { ChainBackground } from "@/components/ChainBackground";
import "./globals.css";

export const metadata: Metadata = {
  title: "Chains",
  description: "Make connections — friends only.",
};

// The API base URL is resolved at request time on the server, so one container
// image can be pointed at any API via an env var (no rebuild). Falls back to
// the build-time NEXT_PUBLIC value for local dev.
const apiBaseUrl =
  process.env.API_BASE_URL ?? process.env.NEXT_PUBLIC_API_BASE_URL ?? "";

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        {/* Runs before the app bundle, so window config is ready for api.ts. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `window.__CHAINS_CONFIG__=${JSON.stringify({ apiBaseUrl })}`,
          }}
        />
        <AuthProvider>
          <ChainBackground />
          <div className="app-root">{children}</div>
        </AuthProvider>
      </body>
    </html>
  );
}
