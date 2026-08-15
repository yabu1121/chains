# Design Review: Chains — Visual Refresh

Reviewed against: `.design/visual-refresh/DESIGN_BRIEF.md`
Philosophy: "Printed matter for engineers" (warm, crafted, analog, grown-up)
Date: 2026-06-03

## Screenshots Captured

| Screenshot | Breakpoint | Status |
| --- | --- | --- |
| — | Desktop 1280 | NOT CAPTURED |
| — | Tablet 768 | NOT CAPTURED |
| — | Mobile 375 | NOT CAPTURED |

> ⚠️ No browser automation is available in this environment (no Playwright MCP,
> no cursor-ide-browser, no headless Chromium/Puppeteer installed). Per the
> skill's last-resort path, **visual verification is pending owner-provided
> screenshots** (login, register, friends list, requests, network, a modal — at
> 1280 / 768 / 375). The findings below are from code + the brief; anything
> needing pixels is marked **[needs eyes]**.

## Summary

The refresh executes the brief's direction in code: warm paper, ink + 藍 indigo
accent (one accent per view), Fraunces/Hanken/JetBrains-Mono, gradients and glow
removed, paper-grain + ink-hairline schematic for atmosphere, ledger detailing
(mono handles, stamped avatars, hairline rules). Typecheck passes; all routes
compile and return 200. Biggest open items: dashboard visual hierarchy is flat
(every card title is a tiny mono label, no large Fraunces heading anywhere except
the auth wordmark), and modals have semantics + Escape + focus restore but no
true focus *trap*.

## Must Fix

_None identified at code level._ (Visual must-fixes may surface once screenshots
are available — **[needs eyes]**.)

## Should Fix

1. **Dashboard visual hierarchy is flat.** `friends/page.tsx` uses
   `h2.section-title` (now an 11px mono ledger label) for "Your Friends",
   "Incoming requests", etc. There is no large Fraunces heading on any in-app
   view, so the editorial type scale from the brief is only visible on
   login/register. _Fix: add a page/area title in `--font-display` at
   `--step-h1` above the sub-tab strip (e.g. "Friends" / "Network")._
2. **Empty states lack a clear action.** `t.friends.noFriends` only *mentions*
   "Find people" as text (`friends/page.tsx`). baseline-ui: every empty state
   needs one clear next action. _Fix: render a button that switches to the Find
   sub-tab._
3. **Modal focus trap missing.** `lib/dialog.ts` adds Escape + initial focus +
   focus restore, but Tab can still leave the dialog. Per baseline-ui /
   fixing-accessibility, custom traps should not be hand-rolled. _Fix: adopt a
   primitive (Base UI / Radix Dialog) for the 3 modals — small, scoped migration._

## Could Improve

1. **ProfileView heading not on-system.** `.pv-name` is `font-weight:700` body,
   not Fraunces. _Suggestion: set `.pv-name { font-family: var(--font-display) }`._
2. **Nested Escape.** A nested AddFriendDialog inside ProfileModal closes both on
   Escape (both document listeners fire). _Suggestion: only the topmost dialog
   should consume Escape._
3. **tabular-nums coverage.** Applied to `.badge`; could extend to other numeric
   mono metadata for aligned figures.
4. **Sidebar brand glyph.** The ⛓ in the sidebar `.brand` is not `aria-hidden`
   (login/register marks already are). _Suggestion: wrap it in an aria-hidden span._
5. **Mobile-first.** Media queries are `max-width` (desktop-first). Works, but
   the checklist prefers `min-width` mobile-first. _Suggestion: defer; larger refactor._

## Post-review fixes applied (2026-06-03)

- ✅ Should-fix #1 — added `.area-title` (Fraunces, `--step-h1`) headings to the
  Friends and Settings areas, so the editorial type scale now appears in-app.
- ✅ Could-improve #1 — `.pv-name` now uses `--font-display`.
- ✅ Could-improve #4 — sidebar brand ⛓ glyph wrapped in `aria-hidden`.

Still open (opt-in): Should-fix #2 (empty-state action — needs sub-tab callback
plumbing) and #3 (Radix/Base UI focus trap for the 3 modals).

## What Works Well

- **Aesthetic fidelity is high.** Ink + single indigo accent, no gradients, no
  glow, warm paper, paper-grain, ink-hairline network — all match the brief and
  read deliberately, not auto-generated.
- **Token discipline.** Colours/fonts go through `:root` variables; the indigo
  swap and font swap are each one-line changes. Few one-off hex values remain.
- **Contrast verified (computed) — all AA for text on warm paper #faf8f4:**
  ink `#16181d` ≈ 15:1; accent `#2d4f7c` ≈ 7.9:1; muted `#5b616f` ≈ 5.9:1
  (deepened from the old grey); danger `#b8412c` ≈ 5.2:1.
- **Motion is cheap and respectful.** ChainBackground rewritten to one-shot
  draw-in + transform-only parallax (was looping opacity on many glow nodes);
  global `prefers-reduced-motion` block already neutralizes animation and hides
  the background.
- **Reused existing components** (Person, Avatar, Select, modals) and the
  existing motion stack rather than reimplementing.
```
