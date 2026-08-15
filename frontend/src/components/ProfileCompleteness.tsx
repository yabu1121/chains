"use client";

import { profileCompleteness } from "@/lib/completeness";
import { useI18n } from "@/lib/i18n";
import type { PublicProfile } from "@/lib/types";

/**
 * ProfileCompleteness shows how complete a profile is and what to add next,
 * tying each gap to a concrete payoff ("add interests → better news"). It makes
 * the value of filling in a profile legible instead of leaving fields to languish.
 */
export function ProfileCompleteness({ profile }: { profile: PublicProfile }) {
  const { t } = useI18n();
  const { percent, missing } = profileCompleteness(profile);

  return (
    <section className="card">
      <div className="flex justify-between items-center">
        <h2 className="section-title m-0">{t.completeness.title}</h2>
        <span className="font-display font-semibold text-lg">{percent}%</span>
      </div>
      <div className="completeness-bar">
        <span style={{ width: `${percent}%` }} />
      </div>
      {percent >= 100 ? (
        <p className="text-ok text-sm mt-2 mb-0">{t.completeness.done}</p>
      ) : (
        <ul className="completeness-list">
          {missing.slice(0, 3).map((m) => (
            <li key={m.key}>{t.completeness.items[m.key]}</li>
          ))}
        </ul>
      )}
    </section>
  );
}
