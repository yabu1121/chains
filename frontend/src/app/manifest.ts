import type { MetadataRoute } from "next";

// Web App Manifest, served at /manifest.webmanifest by Next's metadata route.
// Drives "Add to Home Screen" / installability on Android Chrome and iOS Safari.
// Colours mirror the design tokens in globals.css (warm paper + editorial ink).
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Chains — friends only",
    short_name: "Chains",
    description: "Make connections — friends only.",
    start_url: "/friends",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#faf8f4",
    theme_color: "#faf8f4",
    lang: "ja",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-192-maskable.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/icons/icon-512-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
