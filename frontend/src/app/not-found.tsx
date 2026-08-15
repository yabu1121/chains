import Link from "next/link";
import { TopBrandBar } from "@/components/TopBrandBar";

// An explicit App-Router not-found page. Without it, Next falls back to the
// Pages-Router error page during the build, which imports <Html> and crashes
// prerendering of /404 and /_error.
export const metadata = {
  title: "Not found — chains",
};

export default function NotFound() {
  return (
    <>
      <TopBrandBar />
      <main className="container center-narrow">
        <div className="card">
          <h1 className="section-title mt-0">Page not found</h1>
          <p className="muted">This page doesn’t exist or has moved.</p>
          <Link className="public-profile-cta" href="/">
            Open chains →
          </Link>
        </div>
      </main>
    </>
  );
}
