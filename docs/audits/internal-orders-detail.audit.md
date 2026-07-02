# internal-orders/[id] — detail page parity audit

- **Module:** `internal-orders` (Внутренний заказ — internal order doc) detail/edit page
  (`apps/web/src/app/(app)/internal-orders/[id]/page.tsx`)
- **Date:** 2026-06-03 (session 2026-06-03e — Cohort B: Stock + internal)
- **Protocol:** Cohort batch audit (`scripts/wf-cohort-detail-audit.js`, run `wf_9832a633-948`, 23-agent:
  premise → diff → critic → blind refute-default verify). **Operator (Opus) re-verified every confirmed delta
  against the page code + backend schema/service + i18n (ru+uz) before applying** — no blind apply.
- **Reference:** ⚠️ **CAPTURE CONTAMINATED** — `06-module/internalorder/dom/08-edit-default.html` /
  `58-detail-default.html` have `<title>Корзина</title>` and render a **Заказ поставщику** form (Контрагент ×15,
  Договор ×11), NOT the Внутренний заказ form → failed capture. Audit is **sibling-parity** vs the documented parent
  `purchase-orders/[id]` (the page's own doc-comment lists the differences) MINUS counterparty, plus the cohort
  stock-doc siblings for the externalCode pattern; the contaminated capture is **discounted**. The two label findings
  below are deferred precisely because their only ground-truth (the capture) is unreliable.

## Verdict

internal-orders is a counterparty-less priced **order** doc (positions with price+VAT, totals sidebar with VAT
toggles, deliveryPlannedMoment, read-only movedQuantity progress, Создать→Перемещение menu). The cohort sibling-diff
correctly refuted counterparty/discount/email phantoms. The completeness critic surfaced this cohort's real bugs,
all isolated to this page: **3 hardcoded-Uzbek RU-locale leaks + 1 money-format display bug + 1 read-only field that
should be editable — all 5 FIXED this session.** Two label-parity findings depend on the contaminated capture and are
deferred to Phase-2 QA (clean re-capture).

## A. Structural / field deltas

| # | Element | moysklad/expected | ours (before) | Status | Sev | Disposition |
|---|---|---|---|---|---|---|
| IO-1 | Moved-progress summary «Выполнено: {m}/{t}» (L552-561) | formatted money (minor→major, grouping, currency once), like the sibling processing-orders FulfilmentProgress | `t('moved_progress', {moved: data.movedSumMinor, total: data.sumMinor})` fed **raw minor-unit** BigInt strings → showed e.g. "300000000" (100× + ungrouped, no currency) | delta | high | **FIXED** → `formatMoney(movedSumMinor, currency, {displayAs:'none'})` / `formatMoney(sumMinor, currency)` (imported formatMoney). Money-format bug-class (cf. buyPrice `066d55fb`). |
| IO-2 | «Внешний код» (externalCode) field (L514-521) | editable text input, persisted on save (like all 3 stock siblings + this doc's own `/new` page) | rendered `disabled` bound to raw `data.externalCode`; omitted from FormState/snapshot/save payload → **settable on create, never editable after** (internal inconsistency) | delta | med | **FIXED** → editable Input bound to `form.externalCode` + added to FormState/formFromData/snapshot/save payload. Backend already accepts it (`internal-order.schema.ts:83` update DTO + `service.ts:289`). |
| IO-3 | «Склад» field label (L502/505/670) | family-standard «Склад» (`tFields('store')`); «Целевой/target» wording is a Move-only concept | `t('destination_store')` = «Целевой склад» / «Maqsad ombor» — the lone family member to diverge | uncertain | low | **DEFER (Phase-2, capture contaminated)** — strong family-convention signal (every sibling + parent uses «Склад»), but the only direct ground-truth (internal-order capture) is the contaminated Заказ-поставщику DOM, so the «Склад» evidence is from the wrong form. Needs clean re-capture before changing. |
| IO-4 | Planned-date field label (L488) | parent purchase-orders uses `detail_form.delivery_planned_receipt` = «План. дата приёмки» | `t('delivery_planned')` = «Планируемая дата поставки» | uncertain | low | **DEFER (Phase-2, capture contaminated)** — приёмки-vs-поставки for an *internal* order is genuinely ambiguous and the capture is unreliable. Needs clean re-capture. |

## B. Interactive deltas

All three are the **EditForm hardcoded-Uzbek leak bug-class** (`bb604bf8`) — raw Uzbek literals that render on the RU
locale; cohort-invisible (no sibling has these elements) so only the completeness critic could see them. **All FIXED.**

| # | Element | moysklad/expected | ours (before) | Status | Sev | Disposition |
|---|---|---|---|---|---|---|
| IO-5 | Cancel pill button (L418) | localised «Отменить» (state-cancel verb) | hardcoded literal `Bekor qilish` (= the uz value → RU users saw Uzbek) | delta | high | **FIXED** → `{tTransitions('cancel')}` (`transitions.cancel` = «Отменить»/«Bekor qilish», both already exist). NB the button is internal-orders-specific (parent purchase-orders has no such pill; state-dropdown also offers `cancelled`) — possible redundancy noted for Phase-2, but i18n is the safe fix (no behaviour removed). |
| IO-6 | Moved-progress table headers (L598-600) | localised column headers | hardcoded `Tovar` / `Buyurtma` / `Bajarilgan` | delta | high | **FIXED** → `{tFields('product')}` / `{t('moved_col_ordered')}` / `{t('moved_col_fulfilled')}`; added `pages.internal_order.moved_col_ordered` (ru «Заказано» / uz «Buyurtma») + `moved_col_fulfilled` (ru «Выполнено» / uz «Bajarilgan») to ru+uz. |
| IO-7 | MovedProgressCell tooltip (L192) | localised, reusing the existing `moved_progress` key (already used at L556) | hardcoded `title={`Bajarilgan: ${moved} / ${total}…`}` (module-level component, no `t` in scope) | delta | med | **FIXED** → added a `title: string` prop; caller builds it with `t('moved_progress', {moved, total})` + uom and passes it down. |

## Confirmed mirrors (correct internal-order specifics — NOT deltas)

- No agent/counterparty, no bank-account/contract picker, no currency selector, no discount column, no SendEmail — all
  correct for a counterparty-less internal order (refuted as capture phantoms).
- `DetailTotalsSidebar` + VAT toggles + `docTotals(sum, vat)` (the corrected shared helper, subtotal=sum−vat,
  total=sum) — correct, this doc legitimately HAS the sidebar (unlike the three stock docs).
- Read-only `movedQuantity` progress (server-derived from linked Move docs); Создать→Перемещение createMenu gated on
  `canCreateMove`; deliveryPlannedMoment date-only; UZS-only. First tab «Главная». All correct.

## Fixed this session

| Ref | Fix | File |
|---|---|---|
| IO-1 | moved-progress summary money via `formatMoney` (was raw minor) | `internal-orders/[id]/page.tsx` (+ import) |
| IO-2 | externalCode editable + persisted (FormState/formFromData/snapshot/render/payload) | `internal-orders/[id]/page.tsx` |
| IO-5/6/7 | 3 hardcoded-uz leaks → i18n (`transitions.cancel`, `tFields('product')`, new `moved_col_*`, `moved_progress` tooltip) | `internal-orders/[id]/page.tsx` + `ru.json`/`uz.json` (+2 keys each) |

## Deferred (documented for follow-up)

- **IO-3 store label** «Целевой склад» → ?«Склад» and **IO-4 planned-date label** «...поставки» → ?«План. дата
  приёмки» — both **capture-contaminated** (see Reference); resolve with a clean Внутренний-заказ edit-form capture in
  Phase-2 QA, then a 1-line label swap each.
- Cancel-pill redundancy (IO-5) — whether moysklad shows a separate cancel button at all (vs only the state dropdown)
  needs the clean capture; i18n'd for now.

**Gates:** web typecheck 0 · biome 0 (changed files) · web Vitest 1262 pass/1 skip (no regress) · i18n key-existence
ru+uz (+2 keys) + no-hardcoded. **HONEST: Phase-1** — NOT browser-smoked. The money-format fix (IO-1) and externalCode
editability (IO-2) are backend-grounded (formatMoney is the shared formatter; backend persists externalCode) but a
live "posted internal-order shows formatted сум" + "edit+save externalCode round-trips" smoke belongs to Phase-2 QA.
