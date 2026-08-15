import { LegalDoc } from "@/components/LegalDoc";
import { TopBrandBar } from "@/components/TopBrandBar";
import { PrivacyEN, PrivacyJA } from "@/components/legal";

export const metadata = {
  title: "Privacy Policy — Chains",
};

export default function PrivacyPage() {
  return (
    <>
      <TopBrandBar />
      <div className="container center-narrow">
        <LegalDoc en={<PrivacyEN />} ja={<PrivacyJA />} />
      </div>
    </>
  );
}
