import { LegalDoc } from "@/components/LegalDoc";
import { TopBrandBar } from "@/components/TopBrandBar";
import { TermsEN, TermsJA } from "@/components/legal";

export const metadata = {
  title: "Terms of Service — Chains",
};

export default function TermsPage() {
  return (
    <>
      <TopBrandBar />
      <div className="container center-narrow">
        <LegalDoc en={<TermsEN />} ja={<TermsJA />} />
      </div>
    </>
  );
}
