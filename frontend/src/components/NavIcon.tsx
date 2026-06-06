import type { SVGProps } from "react";

// Top-nav glyphs, hand-drawn to match the app's visual language: thin monoline
// strokes (like the chain background), currentColor so they inherit the link/
// active colour, round caps. Deliberately NOT a generic icon set — the motifs
// echo the product:
//   friends   → two nodes joined by a single link (one connection)
//   network   → a small node graph (the whole web of connections)
//   news      → a printed page with text rules (the "printed matter" theme)
//   settings  → control sliders (calmer than the cliché gear)
type NavIconName = "friends" | "network" | "news" | "settings";

const COMMON: SVGProps<SVGSVGElement> = {
  width: 20,
  height: 20,
  viewBox: "0 0 20 20",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.6,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": true,
  focusable: false,
};

export function NavIcon({ name }: { name: NavIconName }) {
  switch (name) {
    case "friends":
      // Two nodes tied by one link — a single friendship, the atom of "chains".
      return (
        <svg {...COMMON} className="nav-ico">
          <circle cx="6" cy="6" r="2.3" />
          <circle cx="14" cy="14" r="2.3" />
          <line x1="7.7" y1="7.7" x2="12.3" y2="12.3" />
        </svg>
      );
    case "network":
      // A central node radiating to three others — the connection graph.
      return (
        <svg {...COMMON} className="nav-ico">
          <line x1="10" y1="10" x2="10" y2="4.2" />
          <line x1="10" y1="10" x2="5" y2="15" />
          <line x1="10" y1="10" x2="15" y2="15" />
          <circle cx="10" cy="3" r="1.7" />
          <circle cx="4" cy="16" r="1.7" />
          <circle cx="16" cy="16" r="1.7" />
          <circle cx="10" cy="10" r="2" />
        </svg>
      );
    case "news":
      // A printed page: framed sheet with a headline rule and body lines.
      return (
        <svg {...COMMON} className="nav-ico">
          <rect x="3.5" y="4" width="13" height="12" rx="1.6" />
          <line x1="6" y1="7.4" x2="11" y2="7.4" />
          <line x1="6" y1="10.2" x2="14" y2="10.2" />
          <line x1="6" y1="12.6" x2="14" y2="12.6" />
        </svg>
      );
    case "settings":
      // Three control sliders; knobs filled with the panel colour so the track
      // reads as passing behind them.
      return (
        <svg {...COMMON} className="nav-ico">
          <line x1="3" y1="6" x2="17" y2="6" />
          <line x1="3" y1="10" x2="17" y2="10" />
          <line x1="3" y1="14" x2="17" y2="14" />
          <circle cx="8" cy="6" r="1.8" fill="var(--panel)" />
          <circle cx="13" cy="10" r="1.8" fill="var(--panel)" />
          <circle cx="6" cy="14" r="1.8" fill="var(--panel)" />
        </svg>
      );
  }
}
