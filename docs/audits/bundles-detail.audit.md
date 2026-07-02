# bundles/[id] — detail page parity audit

- **Module:** `bundles` (Комплекты / Bundle — a kind=`bundle` Product made of components) detail page
  (`apps/web/src/app/(app)/bundles/[id]/page.tsx`)
- **Date:** 2026-06-03 (session 2026-06-03i — Cohort F: Catalog items)
- **Protocol:** Cohort batch audit (`scripts/wf-cohort-detail-audit.js`, run `wf_6efce153-ac6`, 28-agent:
  premise → per-page diff + completeness critic → blind refute-default verify). Premise confirmed the reference =
  `products/[id]` (bundles share the Product backend) and immunized the doc-scaffolding / physical-stock / extra-
  components false-delta families. **Operator (Opus) independently ground-truthed every confirmed delta against the
  page, the backend services and the gold capture before applying** (no blind apply; no guessed translations).
- **Reference:** `products/[id]/page.tsx` + GOLD CAPTURE `04-module/bundle` (Комплект). Bundles edit the bundle Product
  via `PATCH /products/:id` and the component list via `PUT /bundles/:id/components`.

## Verdict

bundles is a correctly-scoped composite-product form (main fields + a components/«Состав» section + pricing). API
wiring is right. Three real issues, all FIXED: (1) the **History/Tarix tab was permanently empty** because
`auditEntity="Bundle"` never matches the `entity:'Product'` rows the backend actually writes; (2) seven **hardcoded
Latin-Uzbek strings** leaked into the RU locale (the no-hardcoded gate is Cyrillic-only); (3) the price/VAT/MXIK inputs
had **no validation before `BigInt()`/`Number()` coercion**, so a non-integer surfaced a raw JS `SyntaxError`.

## A. Structural / field deltas

| # | Element | moysklad/expected | ours (before) | Status | Sev | Disposition |
|---|---|---|---|---|---|---|
| B1 | `DocumentTabs auditEntity` (L524) — History/Tarix tab | must equal the audit-log `entity` the backend writes; bundle main-field edits go through `product.service.ts` which logs `entity:'Product'` | `auditEntity="Bundle"` → `GET /audit-logs?entity=Bundle` matches **zero** rows → History tab permanently empty (same class as work_order→WorkOrder) | delta | high | **FIXED** → `auditEntity="Product"` (mirrors `products/[id]:755`; surfaces the field-edit/archive/delete rows that actually exist). |
| B2 | thrown errors (L225-229), header `· Kod:` (L334), row-delete `aria-label` (L470), MXIK placeholder (L517) | all user-facing text via `t()` with ru+uz keys | hardcoded Latin-Uzbek literals (`'Nom majburiy'`, `"Kamida bitta component qo'shing"`, `'Har componentda tovar tanlang'`, `"Miqdor 0 dan katta bo'lsin"`, `· Kod:`, `"Qatorni o'chirish"`, `"17 raqam"`) — leak into RU build (EditForm uz-leak bug-class) | delta | high | **FIXED** → `tCommon('field_required',{field})`, new `pages.bundles.err_*`, `tFields('code')`, `tCommon('delete_row')`, `tProduct('mxik_placeholder')`. ru+uz added. |
| B3 | price/VAT/MXIK inputs | localized field-level validation before numeric coercion (products zod: `/^\d*$/` → `number_invalid`, `/^$\|^\d{17}$/` → `mxik_invalid`) | salePrice→`BigInt()`, vat→`Number()`, mxik passed raw with **no guard** → `BigInt('1500.50')` throws a raw untranslated `SyntaxError` into the Alert | delta | medium | **FIXED** → regex guards before `api.patch`, throwing `tProduct('number_invalid')` / `tProduct('mxik_invalid')` (mirrors the products schema; `BigInt(minor)` itself is correct, NOT float-drift). |

(Same B2/B3 leaks + gap also fixed on the `/new` sibling `bundles/new/page.tsx`.)

## B. Interactive deltas

(none beyond B1/B3 above — save/archive/restore/delete + component picker/add/remove are correctly wired:
`PATCH /products/:id` for fields, `PUT /bundles/:id/components` [a real `@Put(':id/components')` route] for the list,
`POST /products/:id/archive|restore`, `DELETE /products/:id`. Save path invalidates `['bundle','bundle-components','products']`.)

## Confirmed mirrors (correct bundle specifics — NOT deltas)

- Legitimately **lacks** the physical-stock/catalog fields products has (article, externalCode, country, buyPrice,
  minPrice, barcodes, weight, volume, minimumBalance, paymentItemType, supplier/folder pickers, images, attachments) —
  a bundle holds no own stock; its price/cost derive from components. Not missing fields.
- Legitimately **adds** the components/«Состав» section (GET/PUT `/bundles/:id/components`) — bundle-specific, not a stray addition.
- No document scaffolding (FSM/DOC_STATE, totals sidebar, counterparty/org pickers, doc-date, create-menu, email) — correct for a catalog entity.

## Deferred (documented for Phase-2 / BE-backlog)

- 🟡 **Component-list change history is not audited** — `bundle.service.ts` writes no `auditLog.create` for
  `setComponents`/`removeComponent`, so even after the `auditEntity="Product"` fix the History tab shows only the
  parent-product field edits, never component edits. Capturing those needs a BE audit write (thread `userId` +
  `auditLog.create`), same class as the cohort-D money-doc audit-log feature-gap. **Phase-2 / BE-backlog.**

**Gates:** web tc 0 · biome 0 (changed) · web Vitest 1268 pass/1 skip (0 regress; +4 new `catalog-api-method` source-scan
tests) · i18n key-existence ru+uz + no-hardcoded (bundles route now registered in the no-hardcoded gate). **HONEST:
Phase-1 — NOT browser-smoked.** Live smokes owed (Phase-2): edit+Save a bundle → History tab shows rows; enter a decimal
price → localized validation error (not raw SyntaxError); switch to RU locale → all labels render Russian.
