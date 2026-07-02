# productions — LIST parity audit (Cohort L5)

**Status:** Phase-1 (strukturaviy audit, runtime-tasdiqlanmagan) — **browser-smoke YO'Q**.
**Engine:** `wf-cohort-list-audit.js` (`wf_68a1e798-7d2`, 41 agents, 25 confirmed cohort-wide).
**Ground-truth (§4):** productions has **NO clean moysklad capture** — the `10-module/productionorder` capture is CONTAMINATED (renders «Заказы покупателей»), and there is no standalone «Производство» list capture. All deltas are **sibling-parity** against the money+FSM doc siblings `processings` / `processing-orders` (verified by both diff + critic + blind-verify agents) plus BE-capability grounding. The dominant finding: productions is a **degraded older scaffold** relative to its siblings.

## B. Interactive / data deltas — scaffold (FIXED, mirror siblings)

- 🔴 **Dead pagination [HIGH]** — `ListResponse.nextCursor` was declared but never read; `LIMIT=50`, no cursor state, no `hasNext/onNext/hasPrevious/onPrevious`. The list was permanently capped at the first 50 rows even though the BE paginates (`production.service.ts` `take: limit+1` → `nextCursor`). **Fix:** added `cursor` state + `params.set('cursor', …)` + the 4 pagination props + cursor reset on search/sort/filter/clear. Mirrors `processings`/`processing-orders`.
- 🟠 **No bulk-action bar [MED]** — no row selection, no `useBulkDocumentActions`, despite BE `POST /productions/bulk-delete` + `/productions/bulk-transition` (`production.controller.ts`). **Fix:** wired `useBulkDocumentActions('productions', listQueryKey, { hasFSM:true })` + `{...bulk.listViewProps}` + `bulkActionBar={bulk.bar}` → row checkboxes + bulk post/unpost/cancel/delete. **No** `onMassEditClick` (no `/productions/mass-edit` BE endpoint) and **no** `hasBulkPrint` (no endpoint) — those stay unwired by design.
- 🟠 **No toolbar refresh [MED]** — `refetch` was in scope but never wired. **Fix:** `onRefresh={() => refetch()}`.
- 🟠 **Empty-state [MED]** — only `emptyTitle`/`emptyDescription`, constant regardless of filter. **Fix:** filter-aware title (`hasActiveFilter ? tCommon('no_results') : t('empty_title')`) + `richEmpty` (heading/helper/cta) mirroring siblings (+2 new keys `empty_rich_heading`/`empty_rich_helper` ru+uz).
- 🟠 **Filter panel — dead `ownerId` param [MED]** — `ownerId` was pushed into query params but had no UI control, and `applicable` (BE-supported) was absent. **Fix:** added a «Владелец-сотрудник» owner picker (+ `'owner'` picker state + `CatalogPicker`) and a «Проведено» applicable tri-state select.
- 🟢 **Create button [LOW]** — `onCreate={() => window.location.href}` (full reload, end-placement) → `createHref="/productions/new"` (SPA `<Link>`) + `createPosition="start"` (right of title), matching every doc sibling.

## A. Structural / column deltas (FIXED — cohort-family parity)

- **doc-number column** `t('col_name')` («Номер») → `tFields('number')` («№») — moysklad doc lists use the «№» glyph (DOM-grounded on captured siblings processings/work-orders); cohort-family parity.
- **date column** `t('col_moment')` («Дата») → `tFields('time')` («Время») — cohort-wide date-label bug-class; both captured production-doc siblings (processings, work-orders) ground «Время» (`10-module/{processing,productiontask}/dom/00-clean-default.html`). productions has no own capture → family-parity.

## DEFER (Phase-2 / BE feature — documented, not fixed)

- 🟡 **Full filter-panel completeness** vs `processing-orders` (Проект / Напечатано / Отправлено / Владелец-отдел / «Когда изменён») — `ProductionFilterSchema` does not support project/printed/published/updated/group → BE feature-gap.
- 🟡 **moysklad default column set unconfirmed** — no «Производство» list capture exists; the current column set (name/state/organization/store/customerOrder/sum/moment/orders) is sibling-derived. Re-capture the «Производство» list in Phase-2 to confirm column order/trailing cols (Отправлено/Напечатано/Комментарий).
- 🟢 **`+ Производство` create label** vs siblings' «Новая …» phrasing — cosmetic, kept (no capture grounding).

## Gates
typecheck 0 · biome 0/0 (staged files) · i18n key-existence ru+uz ✓ · no-hardcoded ✓ · label-grounding ✓ · web Vitest 1331 pass/1 skip (no regress).
