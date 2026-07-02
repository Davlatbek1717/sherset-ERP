# publications — LIST parity audit (Cohort L12 · Settings-org)

**Status:** Phase-1 (strukturaviy audit, runtime-tasdiqlanmagan) — **browser-smoke YO'Q**.
**Engine:** `wf-cohort-list-audit.js` (`wf_9bba0f00-850`) — diff + critic both flagged this page (HIGH). Each delta Opus ground-truthed against code + the i18n catalog.
**Ground-truth (§4):** NO clean moysklad capture (the `00-module/*` settings DOMs are CONTAMINATED — `<title>Заказы покупателей</title>`). Sibling-parity only; the doc-type labels are grounded on the existing shared `detail_titles` namespace (created in the Cohort-L detail audit), NOT invented.
**DEDUP:** detail/[id]+new forms i18n'd in cohort L (2026-06-04). This pass = LIST axis — which was **missed**: the list page (`pages.publication` singular ns, 6 chrome keys) was never wired while the forms got the rich `pages.publications` plural ns.

## A. Structural / columns + i18n — 🔴 FIX (whole-page gate-blind Latin-uz leak)
- **Bug:** the LIST page rendered 8 of 9 column headers as hardcoded Uzbek-Latin literals (`'Hujjat turi'`, `'Havola'`, `'Parol'`, `"Ko'rishlar"`, `"Oxirgi ko'rish"`, `'Muddati'`, `'Holat'`, `'Yaratilgan'`), a Latin-uz `TARGET_LABEL_UZ` doc-type map (27 entries → leaked Uzbek into the RU «Тип документа» column), Latin-uz `statusOf()` badge labels (`'Bekor qilingan'`/`'Muddati tugagan'`/`'Aktiv'`), and cell strings (`'Cheksiz'`, `'Boshqarish →'`, `'Copy'`, `title="Havolani nusxa olish"`). The no-hardcoded gate is Cyrillic-only → all of this was gate-blind, breaking RU-locale parity.
- **Fix:** added 14 keys to `pages.publication` (ru+uz) for headers/status/cells; replaced the Latin-uz doc-type map with the canonical `TARGET_TITLE_KEY` map (mirrors `publications/[id]/page.tsx`) resolved through `useTranslations('detail_titles')`; status column header reuses `tCommon('status')`; description header keeps `tFields('description')`=«Комментарий» (correct — the publication description IS an internal comment).
- Columns + sort + cursor pagination were otherwise already correctly wired (real `nextCursor`, sortable views/last-viewed/created).

## B. Interactive chrome — CLEAN
- Search box wired full-stack (`searchInput` + `useDebounce(300)` + params/queryKey). Real cursor pagination (`hasNext={!!data?.nextCursor}`). `richEmpty` onboarding CTA wired. Row → `/settings/publications/[id]` manage link. No bulk bar (publications are created from each document's "Share via link", legitimate absence).

## DEFER / Phase-2
- Namespace inconsistency `pages.publication` (singular, list) vs `pages.publications` (plural, forms) is pre-existing — left as-is to keep this list-axis fix minimal; a future i18n consolidation could merge them.
- Browser-smoke: render the list with mixed statuses (active/expired/revoked) and confirm the RU labels + localized doc-type names (currently runtime-unverified).

## Gates
typecheck 0 (web+api) · biome 0 · i18n key-existence ru+uz ✓ · no-hardcoded ✓ · label-grounding 106 · web Vitest 1374 (+13, 0 regress) · api Vitest 2607 (+2, 0 regress).
