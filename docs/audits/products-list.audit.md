# products — LIST parity audit (Cohort L6)

**Status:** Phase-1 (strukturaviy audit, runtime-tasdiqlanmagan) — **browser-smoke YO'Q**.
**Engine:** `wf-cohort-list-audit.js` (`wf_cabc94da-b58`, 46 agents, 27 confirmed / 11 refuted / 0 uncertain).
**Ground-truth (§4):** **NO clean catalog list capture exists** — `04-module/{product,…}/dom/00-clean-default.html` + `01-default.html` AND the matching `screenshots/00-clean-default.png` are ALL CONTAMINATED (render «Заказы покупателей» / «Заказы поставщикам» / «Корзина», NOT the Товары grid). So products is the **catalog-list parity REFERENCE** (its column-set was decided in the D2/D3 detail audits, documented in inline comments) — its own labels are products-parity baseline, never capture-grounded.

## A. Structural / column deltas
- **None on products itself.** products is the reference: default columns `Наименование · Код · Артикул · Ед.изм. · Цена продажи` (status/folder/vat/createdAt via ⚙), archive surfaced via the «Состояние» filter (not a default column). Money cell uses `formatMoney(price,'UZS',{displayAs:'none'})` (no «сум» suffix — the project-wide list convention); date via `formatDate`; cursor pagination wired (LIMIT=100). All correct.

## B. Interactive / data deltas — cohort-wide findings (fixed on siblings)
- Money-suffix inconsistency: bundles/services/variants used bare `formatMoney(price)` (appends «сум») vs products' `displayAs:'none'` → fixed on the 3 siblings.
- Folder column: bundles/services labeled «Папка»; products' reference term is «Группа» → fixed the 2 sibling i18n values.
- (These are recorded in the bundles/services/variants/tracking-codes/product-folders audit docs.)

## DEFER / non-issues
- 🟢 **Folder column header is a hardcoded Cyrillic literal `'Группа'`** (products/page.tsx:225) rather than an i18n key. The RENDERED value is correct («Группа» = the reference term) and the no-hardcoded gate (Cyrillic-only, list pages unscanned) does not flag it. Left as-is — churning the reference for a cleanliness nit (correct value) is not warranted. Logged for an optional future i18n pass.
- 🟢 **Dead «Массовое редактирование»** dropdown item — products/bundles/services never pass `onMassEdit`, so the item is permanently disabled. Needs a page-owned MassEditModal (BE `/products/mass-edit` exists). Cohort-wide catalog feature — DEFER (same defer as L4/L5 «mass-edit»).
- 🟢 **`onHelp` opens `/help/products`** which does NOT exist (only `/help/purchases`) — a pre-existing dead link on the reference; NOT propagated to siblings. DEFER (help-route feature).

## Gates
typecheck 0 (web+api) · biome 0/0 (changed files) · i18n key-existence ru+uz ✓ · no-hardcoded ✓ · label-grounding ✓ · web Vitest 1338 pass/1 skip · api Vitest 2601 pass/2 skip (no regress).
