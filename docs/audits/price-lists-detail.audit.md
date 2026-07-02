# price-lists/[id] — detail page parity audit

- **Module:** `price-lists` (Прайс-листы — a price-list document: positions = product + price-type columns) detail page
  (`apps/web/src/app/(app)/price-lists/[id]/page.tsx` + `/new`, shared `PriceMatrixEditor`)
- **Date:** 2026-06-04 (Cohort H — e-commerce/pricing)
- **Protocol:** Cohort batch audit (`wf_48fd9e45-543`). Premise classified price-lists as a positions-DOCUMENT whose grid
  is (product + price columns), NOT (qty/discount/VAT/sum) — demoted customer-orders/demand PositionEditor as a column
  baseline. Operator ground-truthed each delta + the backend audit-write gap.
- **Reference:** positions-document grid shell + GOLD capture `04-module/pricelist`.

## Verdict

price-lists is a correctly-scoped price-list document (org + name + a product×price-type matrix editor, locked when
posted). Real issue: many **hardcoded Latin-uz** literals (aria-labels, button/title text, thrown errors,
placeholders) — FIXED. History tab is a **BE feature-gap** (deferred; slug «PriceList» is correct).

## A. Structural / field deltas

| # | Element | expected | ours (before) | Status | Sev | Disposition |
|---|---|---|---|---|---|---|
| H-PL2 | hardcoded Latin-uz on `[id]` + `/new` + `PriceMatrixEditor` | i18n via t() (uz+ru) | `+ Narx turi`, `title="Narx turi ustunini qo'shish"`, `"Mahsulot qo'shish"`, aria `"Amallar"`/`"Qatorni o'chirish"`/`Ustunni olib tashlash: …`, `throw 'Forma yuklanmadi'`, `throw 'Tashkilotni tanlang'`, placeholders `"Masalan: …"`/`"Tashkilot tanlang"`/`"Izoh"`, titles `"Tashkilotni tanlash"`/`"Default narx turini tanlash"`/`"Fayllar"` | delta | high | **FIXED** → `t()`/`tCommon()`/`tForm()`/`tFields()`/`tTabs()`: reused `common.{actions,delete_row}`, `form.{select_organization,organization_picker_title}`, `fields.{organization,description}`, `detail_tabs.files`; +new `price_list.{add_price_type,add_price_type_title,remove_column_aria,err_not_loaded,name_placeholder,default_price_type_picker_title}` (ru+uz). |

## B. Interactive deltas

| # | Element | expected | ours (before) | Status | Sev | Disposition |
|---|---|---|---|---|---|---|
| H-PL1 | History/Tarix tab | populated change history | `auditEntity="PriceList"` (slug CORRECT) but `price-list.service` writes **zero** auditLog → History permanently empty | delta | med | **DEFERRED (BE feature-gap)** — like variants/cohort-D: thread `userId` + `auditLog.create` into the price-list mutators (mirror `inventory.service`); the FE slug is already correct, not changed. |

## Confirmed mirrors (correct price-list specifics — NOT deltas)

- Grid columns = product + price-type prices (NOT qty/discount/VAT/sum); no counterparty/agent, no money sidebar, no
  VAT-posting — correct for a price-list. `settings`-style locking when posted is correct.

## Deferred (Phase-2 / BE / uncertain)

- 🟡 **H-PL1** price-list History — BE audit-write feature.
- 🟡 **«Внешний код» (externalCode)** — present on the model/schema/clone but absent from the form (UNCERTAIN: a missing
  field vs intentional). Needs a populated `04-module/pricelist` capture to confirm before adding — **no guess**.

**Gates:** web tc 0 · biome 0 · web Vitest no-regress · i18n key-existence ru+uz + no-hardcoded (route registered — it
caught 3 extra `tanlang/tanlash` leaks the diff agent missed). **HONEST: Phase-1 — NOT browser-smoked.**
