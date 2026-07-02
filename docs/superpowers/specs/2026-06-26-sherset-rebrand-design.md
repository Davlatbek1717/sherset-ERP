# Design — Sherset rebrand (moysklad clone → Sherset product brand)

- **Date:** 2026-06-26
- **Status:** Approved (design); implementation pending
- **Author:** Claude (Opus) + Ozodbek (product owner)

## Goal

Rebrand the visible identity of the app from the moysklad clone look to the
**Sherset** product brand: place the Sherset logo everywhere it belongs and
retone the accent colour from moysklad teal to Sherset blue — **without
changing any layout, spacing, component structure, or behaviour** (the
moysklad-parity UX stays pixel-stable; only colour values and brand assets
change).

User decisions that scope this work:

1. **Sherset = product brand** that replaces "moysklad" as the product name.
   The logo tagline «электротовары» is therefore **dropped** — only the
   «SHERSET» wordmark is used.
2. **Adopt Sherset blue app-wide** (not just the logo). The accent colour
   moves from moysklad teal `#186999` to Sherset blue `#0652FF`.
3. **Only a wide PNG logo exists** (`Sherset logo.png`, 1063×246, 4.32:1).
   All needed variants are derived from it (chosen approach: faithful PNG
   variants, not an SVG recreation).

## Non-goals (explicitly out of scope)

- **No layout / spacing / component / behaviour changes.** This is colour +
  asset + brand-text only.
- **Internal identifiers are NOT touched:** npm package names (`@moysklad/ui`,
  `@moysklad/db`, …), the `moysklad-compat` API module and its routes
  (`/api/remap/1.2/...`), DB names, and parity-reference comments. These are
  invisible to end users; renaming them would break 110 modules and the
  compat layer for zero user-visible benefit.
- **Print PDF templates and email templates** (`apps/web/src/app/print/*`,
  API email templates) are **deferred to a later phase** (separate templates;
  not part of this pass).
- **No new components, no refactors** beyond what the rebrand requires.

## Brand color system

Single source of truth stays the same — only hex VALUES change. Token NAMES
and semantic mappings (`--ms-bg-navbar: var(--ms-brand-600)`,
`--ms-action-primary: var(--ms-brand-500)`, `--ms-bg-hover:
var(--ms-brand-100)`, etc.) are **unchanged**, so ~145 usages retone
automatically.

New Sherset blue scale (anchored on the measured logo blue `#0652FF` = 500):

| Token | Old (teal) | New (Sherset blue) |
|---|---|---|
| `--ms-brand-50`  | `#ecf8ff` | `#EDF3FF` |
| `--ms-brand-100` | `#e4f1fa` | `#DCE6FF` |
| `--ms-brand-200` | `#dae7f5` | `#B4CBFF` |
| `--ms-brand-300` | `#76acd3` | `#82A8FF` |
| `--ms-brand-400` | `#4893c3` | `#447DFF` |
| `--ms-brand-500` | `#186999` | `#0652FF`  ← measured from logo |
| `--ms-brand-600` | `#1f75a8` | `#0546DB`  ← navbar bg |
| `--ms-brand-700` | `#2076a9` | `#0439B2` |
| `--ms-brand-800` | `#0e4875` | `#032B85` |
| `--ms-brand-900` | `#091739` | `#07194D` |

Also: `--ms-info-500: #186999` (currently equal to old brand) → set to
`#0652FF` to preserve the prior "info == brand" relationship.

**Files:**
- `packages/design-system/src/tokens/colors.ts` — palette source.
- `packages/design-system/src/globals.css` — `--ms-brand-*` light block and
  the dark-mode block (dark mode is disabled, but keep the scale coherent).
- `apps/marketing/src/app/globals.css` — marketing's own `--brand-*`
  (50/100/500/700/900) → matching new values.

**Hardcoded-teal cleanup** (token-bypassing values that must be converted to
tokens so they follow the new brand — grounded list, ~6 real render sites):
- `apps/web/src/app/(app)/counterparties/page.tsx:485` —
  `bg-[#e4f1fa] text-[#186999]` → `bg-[var(--ms-brand-100)] text-[var(--ms-brand-500)]`
- `apps/web/src/app/(app)/enters/page.tsx:399,416` — `bg-[#186999]` → `bg-[var(--ms-brand-500)]`
- `apps/web/src/app/(app)/moves/page.tsx:421,438` — `bg-[#186999]` → `bg-[var(--ms-brand-500)]`
- `packages/design-system/src/navigation/Tabs.tsx:53` — active tab
  `bg-[#1f75a8]` → `bg-[var(--ms-brand-600)]`
- Token-fallback literals (`var(--ms-text-link,#186999)`) in
  `assortment/bulk-actions-dropdown.tsx:584` and
  `assortment/print-dropdown.tsx:73` → update the fallback hex to `#0652FF`
  (cosmetic; the token already wins).
- Comment-only mentions of teal hexes may be left or updated for accuracy;
  they do not affect rendering.

**Accessibility check:** white on `#0652FF` ≈ 9:1 contrast (AA/AAA pass), so
the white navbar logo, white nav tabs, and white button text remain legible.

## Logo assets & component

### Variants (derived from `Sherset logo.png` via a one-off generation script)

1. `sherset-wordmark.png` — blue «SHERSET», **tagline cropped off**,
   transparent bg, trimmed to the blue bounding box. For light backgrounds
   (login card, marketing on white).
2. `sherset-wordmark-white.png` — white «SHERSET» (blue pixels recoloured to
   white, alpha preserved). For the blue navbar.
3. `sherset-mark.png` — square «S» mark cropped from the wordmark's first
   glyph, padded to a square canvas. For the app icon / favicon and tight
   spaces. A white variant `sherset-mark-white.png` if a mark is ever needed
   on the blue navbar at small sizes.

Generated at 2× (and a 512px square for the icon) so they stay crisp at our
display sizes (navbar ~24px tall, login ~40px, favicon up to 512px). The
generation script lives in `scripts/` and is idempotent (re-runnable from the
source PNG).

**Asset hosting:** PNG variants live in each app's public dir under a `brand/`
folder: `apps/web/public/brand/` and `apps/marketing/public/brand/`. They are
referenced by absolute path `/brand/<file>` which resolves in both apps.

### Component

Replace `packages/design-system/src/icons/MoyskladLogo.tsx` with
`ShersetLogo.tsx` (and update `icons/index.ts` export):

```
<ShersetLogo variant="white" | "wordmark" | "mark" height={number} />
```

- Renders an `<img>` with the matching `/brand/...` source, `alt="Sherset"`,
  `height` driving the size (width auto from aspect ratio), `shrink-0`-safe.
- Navbar uses `variant="white"`; login uses `variant="wordmark"`.
- The old `MoyskladLogo` export is removed; the single navbar import site is
  updated.

## Brand text / name changes (visible only)

- `apps/web/src/app/(app)/layout.tsx:529-533` — navbar brand slot: swap
  `MoyskladLogo` for `<ShersetLogo variant="white" height={24} />`; update the
  `aria-label` "Moysklad — bosh sahifa" → "Sherset — bosh sahifa".
- `apps/web/src/app/login/page.tsx:37-39` — replace the hardcoded «МойСклад»
  `<h1>` with the logo. The panel bg is `--ms-brand-500` (now Sherset blue),
  so a blue wordmark would be blue-on-blue. **Default decision: use
  `<ShersetLogo variant="white" height={36} />`** on the existing blue panel
  (keeps the moysklad-style coloured login header, logo legible in white).
  Keep the existing subtitle `t('login_title')`.
- `apps/web/src/app/layout.tsx:20-21` — `metadata.title` "Moysklad Clone —
  O'zbekiston uchun ERP" → "Sherset — Biznes boshqaruv tizimi" (or similar);
  description may stay.
- `apps/marketing/src/app/layout.tsx` + `components/header.tsx` +
  `components/footer.tsx` — product name and logo → Sherset.
- i18n catalogs: any user-visible «МойСклад» / «Moysklad» brand strings in
  `apps/web/src/messages/{uz,ru}.json` → «Sherset». (Functional/parity
  strings that merely mention moysklad in comments or compat contexts stay.)

## Favicon / app icon

- `apps/web/src/app/icon.png` ← `sherset-mark.png` (512px square). Next.js App
  Router auto-emits the favicon `<link>`. Same for `apps/marketing/src/app/icon.png`.
- Remove/replace any stale favicon if one exists in `public/`.

## Error handling / edge cases

- **Login panel contrast:** the login header bg is `--ms-brand-500` (now
  Sherset blue). A blue wordmark on a blue panel is unreadable — the design
  uses the **white** wordmark there (see brand-text section). Confirm in the
  browser; if undesirable, the fallback is a white panel.
- **Wordmark width in navbar:** at height 24px the wordmark is ~104px wide;
  confirm it fits beside the nav tabs (tabs scroll horizontally, so it will).
- **Image crispness:** verify the downscaled PNGs are sharp (use 2× assets);
  if any blur, regenerate at higher density.

## Testing / verification

No new unit tests are required (this is colour + asset only; per project's
"less unit-testing" rule). Verification is gate + browser:

1. `pnpm --filter @moysklad/ui typecheck` and `@moysklad/web` typecheck — 0 errors.
2. `pnpm lint` (biome) — 0 errors.
3. Existing Vitest suite (esp. any colour/convention guard tests) still green;
   if a guard test asserts the old teal hex, update it to the new brand token.
4. `label-grounding.test.ts` and i18n gates unaffected (no label changes) —
   confirm still green.
5. **Browser smoke** (`pnpm dev`, fresh port): navbar logo (white, legible on
   blue), login (logo + retoned panel), a list page (links/badges/selected-row
   tints are Sherset blue, layout unchanged), favicon in the tab. Screenshot
   before/after to confirm only colour + logo changed, not layout.

## Repo / git note

This working copy (`d:\projects\sherset`) is **not a git repository** (no
`.git`). The brainstorming flow's "commit the spec" step cannot run here. The
spec is saved to disk; if/when this copy is put under git (or work moves to
the `d:\projects\moysklad` repo), commit it then. Implementation will likewise
be verified by gates + browser rather than commits.

## Rollback

All changes are localized: revert the `--ms-brand-*` values, the marketing
`--brand-*` values, the ~6 hardcoded-teal edits, the `ShersetLogo` component +
imports, the brand text strings, and remove the `brand/` assets + `icon.png`.
No schema, API, or data changes — rollback is purely cosmetic.
