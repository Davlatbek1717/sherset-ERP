# services/[id] — detail page parity audit

- **Module:** `services` (Услуги / Service — a kind=`service` Product, no stock) detail page
  (`apps/web/src/app/(app)/services/[id]/page.tsx`)
- **Date:** 2026-06-03 (session 2026-06-03i — Cohort F: Catalog items)
- **Protocol:** Cohort batch audit (`scripts/wf-cohort-detail-audit.js`, run `wf_6efce153-ac6`, 28-agent:
  premise → per-page diff + completeness critic → blind refute-default verify). Premise confirmed reference =
  `products/[id]` (services share the Product backend) and immunized the service-physical-stock false-delta family.
  **Operator (Opus) ground-truthed every delta against the page + backend before applying.**
- **Reference:** `products/[id]/page.tsx` + GOLD CAPTURE `04-module/service` (Услуга). Services read/write the Product
  via `GET/PATCH /products/:id`.

## Verdict

services is a correctly-reduced Product form (no physical-stock fields). API wiring is right. Two real issues, both
FIXED: (1) the **History/Tarix tab was permanently empty** because `auditEntity="Service"` never matches the
`entity:'Product'` rows the backend writes for the same row; (2) **hardcoded Latin-Uzbek** in the Zod validation
messages, the `· Kod:` header and two input placeholders leaked into the RU locale.

## A. Structural / field deltas

| # | Element | moysklad/expected | ours (before) | Status | Sev | Disposition |
|---|---|---|---|---|---|---|
| S1 | `DocumentTabs auditEntity` (L374) — History/Tarix tab | a service IS a kind=`service` Product; `product.service.ts` logs `entity:'Product'` for it | `auditEntity="Service"` → `GET /audit-logs?entity=Service` matches **zero** rows → History tab permanently empty (work_order→WorkOrder bug-class) | delta | high | **FIXED** → `auditEntity="Product"` (mirrors `products/[id]:755`; the audit rows already exist under `'Product'`). |
| S2a | Zod messages (L37/42/43/46) | localized via a schema factory (products uses `makeProductFormSchema(t)`) | static `ServiceFormSchema` with hardcoded `'Nomi majburiy'`, `'Faqat raqam'` ×2, `"17 raqamdan iborat bo'lishi kerak"` → render verbatim in RU | delta | medium | **FIXED** → converted to `makeServiceFormSchema(tProduct)` reusing `pages.product_new.{name_required,number_invalid,mxik_invalid}` (no new keys). |
| S2b | header `· Kod:` (L219), uom placeholder `"dona / soat"` (L354), MXIK placeholder `"17 raqam"` (L367) | i18n via `t()`/`tFields()` | hardcoded Latin-Uzbek literals | delta | medium | **FIXED** → `tFields('code')`, new `pages.services.uom_placeholder`, `tProduct('mxik_placeholder')`. ru+uz added. |

(Same S2 leaks + schema-factory conversion also applied to the `/new` sibling `services/new/page.tsx`.)

## B. Interactive deltas

(none — save (`PATCH /products/:id`), archive/restore (`POST /products/:id/archive|restore`), delete
(`DELETE /products/:id`) and the folder picker are correctly wired; the destructive delete-confirm Latin-uz leak is a
shared-hook issue fixed centrally — see `use-destructive-mutation.ts` and the tracking-codes doc.)

## Confirmed mirrors (correct service specifics — NOT deltas)

- Legitimately **omits** every physical-stock field (warehouse/store, min-stock/reorder, packaging/pack-uom, weight,
  volume, per-stock barcode, serial/batch, «Остатки» tab) — a service holds no stock. Not missing fields.
- Keeps the product-shared fields that apply to a service (name, code, folder, description, sale price, VAT, UOM, MXIK).
- No document scaffolding — correct for a catalog entity.

## Deferred (documented for Phase-2)

- 🟢 None specific to services. The History fix (S1) is a working slug fix (the backend already writes the rows).

**Gates:** web tc 0 · biome 0 (changed) · web Vitest 1268 pass/1 skip (0 regress) · i18n key-existence ru+uz +
no-hardcoded (services route now registered). **HONEST: Phase-1 — NOT browser-smoked.** Live smokes owed (Phase-2):
edit+Save a service → History tab shows rows; trigger a validation error in RU locale → Russian message; non-UOM/MXIK
placeholders render Russian.
