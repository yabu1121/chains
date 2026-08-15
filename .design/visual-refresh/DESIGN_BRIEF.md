# Design Brief: Chains — Visual Refresh

> Output of the design pipeline, step 2 (`design-brief`), following step 1 (`grill-me`).
> Source of truth for steps 3–7 (frontend-design → baseline-ui → fixing-accessibility
> → fixing-motion-performance → design-review).

## Problem

The current UI is technically solid but **淡泊 (bland)** — it reads as a default
light SaaS dashboard. Earlier attempts to add impact slid into **generic "AI"
aesthetics** (oversized hero type, kicker + marketing tagline, trendy grotesque
fonts, soft multi-colour gradients). The owner wants something that feels
**deliberately designed by a human**, with warmth and craft, for a network of
real friends.

## Solution

A **warm, crafted, almost analog interface for engineers** — closer to a
well-set printed directory / ledger of the people you actually know than to a
mass social network. Precision (a developer's tool) meets the warmth of printed
matter (paper, ink, letterpress detailing). The product feels hand-made and
quietly confident, never childish, toy-like, or auto-generated.

## Experience Principles

1. **Craft over flash** — impact comes from typography, materials (paper, ink,
   rules) and meticulous spacing, NOT from big-hero drama or gradients.
2. **Earned ornament** — every characterful detail must have a reason in the
   domain (mono for code/handles, the chain/network as a real motif). No
   decoration for its own sake.
3. **Quiet confidence, grown-up** — restrained and premium; explicitly avoid
   playful/childish/toy-like registers.

## Aesthetic Direction

- **Philosophy**: "Printed matter for engineers" — editorial/letterpress warmth
  on warm paper, with developer-tool precision. Think a risograph-printed
  directory or a quality technical journal, set with care.
- **Tone**: warm, crafted, analog, calm, precise. Adult, not cute.
- **Reference points**: editorial print / zines; the craft level of Linear;
  letterpress & ledger typography; Japanese hanko/朱 (seal-red) as a warm,
  cultural accent.
- **Anti-references**: Facebook / LinkedIn-style mass social UI; AI-generated
  landing pages (hero + eyebrow + tagline); childish or toy-like UI; soft
  multi-colour / purple gradients; generic fonts (Inter, Roboto, Space Grotesk).

## Existing Patterns (must respect or extend)

- **Typography (just introduced)**: display **Fraunces** (`--font-display`),
  body **Hanken Grotesk** (`--font-body`), mono **JetBrains Mono**
  (`--font-mono`). Keep — this trio already fits the direction.
- **Colors** (`globals.css :root`): warm paper `--bg #faf8f4`, ink `--ink/--text
  #16181d`, `--panel #fff`, `--border #e6e1d8`, `--muted #6b7180`, brand pine
  `--grad #34675c` (currently solid, gradient dropped on purpose).
- **Spacing / shape**: `--radius 16px`, sidebar 240px, mobile bottombar 60px.
- **Components**: `Person`, `Avatar`, `Select` (custom), `Topbar`, `NetworkGraph`
  (react-force-graph-2d), `ProfileModal`, `QRInvite`, sub-tab strips with a
  framer-motion sliding pill. Motion stack: anime.js (entrances) + framer-motion
  (interactions). Plain CSS — **no Tailwind** (note for baseline-ui).
- **Layout**: desktop = sidebar + main; mobile = bottombar. Both must keep working.

## Proposed Decisions (recommended — pending owner thumbs-up)

- **Accent (decided)**: **藍/indigo ink-blue (`--accent #2d4f7c`, pressed
  `#223c5e`)** used sparingly (active states, the chain glyph, key affordances).
  Owner chose blue; indigo (藍染め / fountain-pen ink / blueprint) keeps the
  warm-analog-craft, grown-up, non-AI register rather than a bright SaaS sky-
  blue. Ink (`#16181d`) stays the dominant text colour; indigo is the spark.
  The old bright `--accent #2f6bff` and `--bluesky #4cb5f5` are retired from
  primary use.
- **Material/atmosphere (no gradients)**: a very faint **paper grain / noise**
  overlay + **hairline rules** for an "edited page" feel. Depth from texture and
  layered solids, never gradient washes.
- **Detailing**: mono "spec" captions (handles, languages) like a ledger; small
  caps / wide-tracked labels used sparingly; thin ruled dividers over heavy cards.

## Component Inventory

| Component | Status | Notes |
| --- | --- | --- |
| Color tokens (`:root`) | Modify | add accent (朱), grain, refined neutrals |
| Login / Register | Modify | restrained editorial, already de-AI'd; align both |
| `Avatar` | Modify | flat pine circle → crafted ledger style (initials, ink) |
| `Person` row | Modify | ledger row: mono handle/languages, hairline rules |
| Sidebar / nav pill | Modify | accent + craft detailing |
| `NetworkGraph` | Modify | node/edge styling to match warm-ink palette |
| Section headings | Modify | Fraunces, real hierarchy (replace tiny grey caps) |
| Paper-grain overlay | New | subtle global texture layer |

## Key Interactions

- Tab / sub-tab switches: keep framer-motion sliding pill + directional slide.
- Card/list entrances: keep anime.js staggers; ensure reduced-motion path.
- Hover: rows/cards lift subtly; accent appears on active/selected, not at rest.

## Responsive Behavior

- Desktop ≥ ~960px: sidebar + main. Mobile: bottombar nav, single column.
- Network graph fills the main area on its tab; touch pan/zoom preserved.
- Type scale via `clamp()` so heroes shrink gracefully on mobile.

## Accessibility Requirements

- Body text & UI ≥ WCAG AA (4.5:1); large headings ≥ 3:1. Verify ink-on-paper
  and accent-on-paper pairings (seal-red on warm paper must pass for text use,
  else accent is for non-text/again large only).
- Full keyboard nav; visible focus rings (not just colour); honour
  `prefers-reduced-motion` (already partially wired via `prefersReducedMotion`).
- Custom `Select`, modals: proper roles, focus trap/restore, ESC to close.

## Out of Scope

- New features or routes (this is purely a visual/interaction refresh).
- Dark mode (light/warm-paper only for now).
- Backend / data model changes.
- Replacing the motion stack or the custom Select.
