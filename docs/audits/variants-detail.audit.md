# variants/[id] — detail page parity audit

- **Module:** `variants` (Модификации / Variant — a modification of a parent Product) detail page
  (`apps/web/src/app/(app)/variants/[id]/page.tsx`)
- **Date:** 2026-06-03 (session 2026-06-03i — Cohort F: Catalog items)
- **Protocol:** Cohort batch audit (`scripts/wf-cohort-detail-audit.js`, run `wf_6efce153-ac6`, 28-agent:
  premise → per-page diff + completeness critic → blind refute-default verify). Premise confirmed reference =
  `products/[id]` and immunized the variant-inherited-field false-delta family. **Operator (Opus) ground-truthed every
  delta against the page, backend and the gold capture before applying.**
  - ⚠️ **Self-correction (post-commit `ece60b0d` → follow-up):** the buy-price label was FIRST set to `tFields('cost')`
    («Себестоимость») citing the capture — but that grep hit was a promo banner («Новое решение: Маржа и Себестоимость»),
    NOT a field label. The field edits `buyPrice`, which the products reference (this cohort's parity baseline) labels
    **«Закупочная цена»**; «Себестоимость» is a computed COGS metric, not an editable buy-price. Corrected to
    `t('buy_price_label')` = «Закупочная цена»/«Xarid narxi» (mirrors products; the dvigatel *critic* had this right).
- **Reference:** `products/[id]/page.tsx` + GOLD CAPTURE `04-module/variant` (Модификация). Variants use the separate
  `GET/PATCH /variants/:id` backend (a child of a parent Product).

## Verdict

variants is a correctly-scoped modification form (read-only parent product + characteristics grid + pricing). Two real
issues FIXED on both `[id]` and `/new`: (1) the **buy-price money field was labeled `tCommon('created')`** («Создано» /
«Yaratilgan» — the *Created-date* label); (2) several **hardcoded Latin-Uzbek** strings leaked into RU. One issue is a
**deferred BE feature-gap**: the History/Tarix tab is permanently empty because `variant.service.ts` writes no audit log
at all (the FE slug `"Variant"` is itself correct — do NOT change it).

## A. Structural / field deltas

| # | Element | moysklad/expected | ours (before) | Status | Sev | Disposition |
|---|---|---|---|---|---|---|
| V1 | buy-price `FormField` label (L401 `[id]` + L233 `/new`) | the products-consistent buy-price label «Закупочная цена» (products labels the same `buyPrice` field via `buy_price_label`) | `label={tCommon('created')}` → «Создано»/«Yaratilgan» (a Created-DATE label) on a money input that edits `buyPrice` | delta | high | **FIXED** → `label={t('buy_price_label')}` on both pages; new `pages.variants.buy_price_label` = «Закупочная цена»/«Xarid narxi» (mirrors products). *(First set to `tFields('cost')` «Себестоимость» on a misread capture banner — corrected; see Protocol note.)* |
| V2 | thrown errors (L158/161), header `· Kod:` (L253), row-delete `aria-label` (L377), char placeholders «Color»/«Red» (L365/370) | i18n via `t()` with ru+uz | hardcoded Latin-Uzbek (`"Kamida bitta xarakteristika qo'shing"`, `'Xarakteristika nomi va qiymati to'ldirilishi kerak'`, `· Kod:`, `"Qatorni o'chirish"`) + hardcoded English placeholders | delta | medium | **FIXED** → new `pages.variants.{err_min_one_characteristic,err_characteristic_fields,err_product_required,char_name_placeholder,char_value_placeholder}`, `tFields('code')`, `tCommon('delete_row')`. ru+uz added. |

(Same V1/V2 also fixed on `/new` — incl. `variants/new` L89 `'Mahsulot tanlang'` → `t('err_product_required')`.)

## B. Interactive deltas

(none beyond V1/V2 — save (`PATCH /variants/:id`), archive/restore (`POST /variants/:id/archive|restore`), delete
(`DELETE /variants/:id`) and the characteristics add/remove are correctly wired and target the variant backend, NOT
`/products/:id`. Parent-product picker is correctly read-only/`disabled` on edit.)

## Confirmed mirrors (correct variant specifics — NOT deltas)

- Legitimately **adds** the read-only parent-product reference + the characteristics/«Характеристики» grid (the defining
  fields of a modification).
- Legitimately **omits** parent-owned/inherited catalog fields (product-folder, type, article/country/VAT, weight,
  volume, stock). Not missing fields.
- `buyPrice`/`salePrice` use `BigInt(minor).toString()` — minor-units passthrough, identical to products. NOT float-drift.

## Deferred (documented for Phase-2 / BE-backlog)

- 🟡 **History/Tarix tab permanently empty — BE feature-gap (NOT a slug fix).** `variant.service.ts` writes **zero**
  `auditLog.create` on create/update/archive/restore/delete, so `auditEntity="Variant"` (which is the correct slug)
  matches nothing. Unlike bundles/services (where the backend writes `'Product'` and the slug was the bug), here the fix
  is BACKEND: thread `userId` through the 5 service methods + controller and add a `logAudit` helper writing
  `entity:'Variant'` (mirror `product.service.ts:112-129`). Same class as cohort-D money-doc audit-log + cohort-C
  bom/processingstage catalog change-history defers. **The FE slug is intentionally left as `"Variant"`.**

**Gates:** web tc 0 · biome 0 (changed) · web Vitest 1268 pass/1 skip (0 regress) · i18n key-existence ru+uz +
no-hardcoded (variants route now registered). **HONEST: Phase-1 — NOT browser-smoked.** Live smokes owed (Phase-2):
open a variant → buy-price field labeled «Закупочная цена» (not «Создано»); RU locale → all labels Russian.
