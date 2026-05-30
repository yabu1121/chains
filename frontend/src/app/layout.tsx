import type { Metadata } from "next";
import type { ReactNode } from "react";
import { AuthProvider } from "@/lib/auth";
import { ChainBackground } from "@/components/ChainBackground";
import "./globals.css";

export const metadata: Metadata = {
  title: "Chains",
  description: "Make connections — friends only.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <AuthProvider>
          <ChainBackground />
          <div className="app-root">{children}</div>
        </AuthProvider>
      </body>
    </html>
  );
}
