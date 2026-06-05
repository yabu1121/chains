"use client";

import { useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { useAuth } from "@/lib/auth";
import { useReveal } from "@/lib/anim";
import { useI18n } from "@/lib/i18n";

/**
 * Shows the signed-in user's personal QR code. It encodes a link to
 * `/add/<username>`; a friend scans it with their phone camera to open the app
 * and send a friend request — handy for swapping contacts in person.
 */
export function QRInvite() {
  const { t } = useI18n();
  const { user } = useAuth();
  const cardRef = useReveal<HTMLDivElement>();
  // origin is only known in the browser; compute after mount to avoid an SSR
  // hydration mismatch.
  const [origin, setOrigin] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  if (!user) return null;

  const link = origin ? `${origin}/add/${user.username}` : "";

  async function copy() {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard may be unavailable; ignore */
    }
  }

  return (
    <div className="card" ref={cardRef}>
      <h2 className="section-title">{t.qr.title}</h2>
      <p className="muted mt-0 text-sm">
        {t.qr.desc}
      </p>
      <div className="flex justify-center py-3">
        <div className="bg-white p-4 rounded-xl border border-border">
          {link ? (
            <QRCodeSVG
              value={link}
              size={208}
              level="M"
              marginSize={0}
              fgColor="#1a1d24"
              bgColor="#ffffff"
            />
          ) : (
            <div className="w-52 h-52" />
          )}
        </div>
      </div>
      <div className="flex gap-2 items-center justify-center flex-wrap">
        <span className="muted text-[13px] break-all">
          {origin ? `${origin}/add/${user.username}` : "…"}
        </span>
        <button type="button" onClick={copy} disabled={!link}>
          {copied ? t.qr.copied : t.qr.copyLink}
        </button>
      </div>
    </div>
  );
}
