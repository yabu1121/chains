import { LegalDoc } from "@/components/LegalDoc";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { TermsEN, TermsJA } from "@/components/legal";

export const metadata = {
  title: "Terms of Service — Chains",
};

export default function TermsPage() {
  return (
    <div className="container center-narrow">
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 8 }}>
        <LanguageSwitcher />
      </div>
      <LegalDoc en={<TermsEN />} ja={<TermsJA />} />
    </div>
  );
}
