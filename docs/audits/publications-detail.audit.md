# settings/publications — detail parity audit (Cohort L)

**Status:** Phase-1 (strukturaviy audit, runtime-tasdiqlanmagan) — **browser-smoke YO'Q**.
**Reference:** NO moysklad analog — bespoke public share-link page («Поделиться по ссылке»). Parity axis = **i18n completeness**, NOT field structure (premise demoted all EditForm siblings → diffing structure would fabricate deltas for revoke/rotate/expiresAt/target-type which are page-unique).
**Pages:** `settings/publications/[id]`, `settings/publications/new`.

## A. Structural / field deltas

- **FIXED — whole-page hardcoded Uzbek-Latin, ZERO `useTranslations`** on BOTH pages (~30 strings each: headings, status badges, danger-zone, edit-form labels, alerts, hint). Gate-invisible (no-hardcoded gate is Cyrillic-only). → Full i18n via new `pages.publications` namespace (ru+uz, 34 keys), reusing `common.*` (loading/not_found/copied/save/cancel/create/delete/active/status/action_irreversible).
- **FIXED — `new` TARGET_TYPES: 27 hardcoded doc-type labels, 4 mis-transliterated Russian** (`'Peremeshchenie'`/`'Oprixodovanie'`/`'Spisanie'`/`'Texoperatsiya'` — wrong for BOTH locales). → Each `targetType` now maps to its canonical `detail_titles` key; rendered via `tDetailTitles(titleKey)` (app-consistent names in ru+uz). Added 4 missing doc types to `detail_titles` (facture_out/in, commission_report, consignment).
- `[id]` target-doc link now shows the localized `detail_titles` name instead of the raw enum slug.
- **Verified NO drift** (premise extra-check): `[id]` `TARGET_PATH` (28 keys) and `new` `TARGET_TYPES` (28) match the backend `PublicationTargetTypeSchema` enum exactly.

## B. Interactive deltas

- **FIXED (MED, silent-failure) — `revoke` / `rotate-token` / `delete` mutations had NO `onError`** → failures were swallowed with zero user feedback (only `saveMut` had `onError`). Added `onError: (e) => setError(e.message)` to all three; the `error` Alert already renders at top.
- Save → PATCH `/publications/:id`; create → POST `/publications` (UUID-validated). Copy-URL, rotate-token warning, revoke/expiry banners (410 Gone) wired. Password write-only (never hydrated) — intended.
- Date note (low): `expiresAt.slice(0,10)` + `isExpired` use local `new Date()` compare — acceptable for a date-only field; logged, not a structural delta.

## Gates
typecheck 0 · biome 0/0 (fixed pre-existing a11y `noLabelWithoutControl` ×5 caption `<label>`→`<span>`, `noNonNullAssertion` ×2 → guarded locals) · i18n ru+uz ✓ · no-hardcoded (route in DONE_ROUTES) ✓ · web Vitest 1306 green.
