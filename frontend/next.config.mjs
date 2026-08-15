/** @type {import('next').NextConfig} */

// When API_ORIGIN is set, the frontend server reverse-proxies /api/* to the
// backend so the browser only ever talks to the frontend's own origin. This
// makes the auth cookie first-party, which is required because Cloud Run's
// per-service *.run.app hosts are treated as separate sites (Public Suffix
// List), so a cross-site backend cookie is a third-party cookie that mobile
// browsers (iOS Safari, Android Chrome) block by default. Unset locally, where
// the app talks to the backend directly via NEXT_PUBLIC_API_BASE_URL.
const apiOrigin = process.env.API_ORIGIN;

const nextConfig = {
  reactStrictMode: true,
  // Emit a self-contained server bundle (.next/standalone) for a small
  // production Docker image.
  output: "standalone",
  async rewrites() {
    if (!apiOrigin) return [];
    return [{ source: "/api/:path*", destination: `${apiOrigin}/api/:path*` }];
  },
};

export default nextConfig;
