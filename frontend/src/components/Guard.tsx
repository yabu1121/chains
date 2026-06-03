"use client";

import { useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";

/** Guard renders children only for authenticated users, else redirects. */
export function Guard({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [loading, user, router]);

  if (loading) {
    return (
      <div className="container">
        <p className="muted">{t.common.loading}</p>
      </div>
    );
  }
  if (!user) return null;
  return <>{children}</>;
}
