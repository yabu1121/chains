/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Emit a self-contained server bundle (.next/standalone) for a small
  // production Docker image.
  output: "standalone",
};

export default nextConfig;
