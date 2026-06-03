"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";

export default function Home() {
  const { t } = useI18n();
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    router.replace(user ? "/friends" : "/login");
  }, [user, loading, router]);

  return (
    <div className="container">
      <p className="muted">{t.common.loading}</p>
    </div>
  );
}
