"use client";

import { CardPreview } from "./CardPreview";
import { useCardHistory } from "@/lib/hooks";
import { useI18n } from "@/lib/i18n";

/**
 * CardHistory shows the cards exchanged with one person as a stack of the actual
 * cards — turning a profile into a lightweight relationship timeline of finished
 * card works, newest first.
 */
export function CardHistory({ userId }: { userId: string }) {
  const { t } = useI18n();
  const { cards, isLoading } = useCardHistory(userId);

  if (isLoading || cards.length === 0) return null;

  return (
    <section className="pv-section border-t border-border mt-4 pt-4">
      <div className="section-title">{t.cardHistory.title}</div>
      <div className="flex flex-col gap-3 mt-3">
        {cards.map((c) => (
          <div key={c.id} className="flex items-start gap-2">
            <span
              className={`text-[13px] mt-1 ${c.direction === "sent" ? "text-accent" : "text-muted"}`}
              aria-hidden="true"
              title={c.direction}
            >
              {c.direction === "sent" ? "↑" : "↓"}
            </span>
            <div className="min-w-0 flex-1">
              <CardPreview card={c} mode="readonly" />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
