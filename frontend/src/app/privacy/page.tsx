import { LegalDoc } from "@/components/LegalDoc";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { PrivacyEN, PrivacyJA } from "@/components/legal";

export const metadata = {
  title: "Privacy Policy — Chains",
};

export default function PrivacyPage() {
  return (
    <div className="container center-narrow">
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 8 }}>
        <LanguageSwitcher />
      </div>
      <LegalDoc en={<PrivacyEN />} ja={<PrivacyJA />} />
    </div>
  );
}
