# Sales («Продажи») sub-section LIST alignment — execution plan (post-compact handoff)

> Scope NOW = the **LIST page** of each Sales sub-section → moysklad 1:1. The **/new + /[id]
> (detail) editors are SEPARATE** (do them one-by-one later — see the doc-detail campaign +
> `docs/audits/DENGI-MONEY-1to1-PROMPT.md` for the per-page loop). This plan is ONLY the lists.
> Full gap audit: `docs/audits/SALES-1to1-GAP-AUDIT-2026-06-25.md`. Working rules: repo `CLAUDE.md`.

## ✅ Done
- **Audit** of all 9 remaining Sales sub-sections (gap-list saved).
- **invoices-out (Счета покупателям) LIST → footer «Итого»** — commit `455fa90c`. BE
  `GET /invoices-out/aggregate/totals` + FE totals query + `footerMoneyCells`. API-certed
  (6 invoices, Σ 1 500 300,00 сум, Оплачено 500 000,00, currencies ["UZS"]).
- **invoices-out default columns verified 1:1** (screenshot `03-module/invoiceout/01-default.png`):
  №·Время·Контрагент·Организация·Со склада·Сумма·План.дата оплаты·Оплачено·Отгружено·
  Отправлено·Напечатано·Комментарий. `state`/`customer_order`/`currency` are gear-optional,
  NOT in the default set → the earlier "extra Статус+Заказ" gap was a polluted-capture
  artefact, not real. NO change needed.
- **demands (Отгрузки) + sales-returns (Возвраты) LIST → footer «Итого»** — commit `539120c3`.
  BE `aggregate/totals` (record-scoped for demands) + FE `footerMoneyCells`. API-cert 11/11.
- **factures-out + commission-reports LIST → footer «Итого» over WHOLE set** — commit `9ef97c07`.
  Both had a PAGE-SUM footer (wrong past row 100) → server aggregate. commission-report
  extracted `buildListWhereOut` to avoid filter drift. API-cert 16/16 (aggregate Σ == page Σ).

### Deferred / out-of-scope (honest)
- **invoices-out boolean columns** (Отправлено/Напечатано): 3-way render inconsistency across
  siblings (invoices-in `StatusBadge` · invoices-out `Icons.check` · demands/sales-returns
  `Badge` pill). Can't pick the moysklad-correct one without a LIVE true-value (the demo
  captures show empty cells). App-wide concern → DEFER, do not guess.
- **consignments (Товары на реализации)**: our page is a batch/lot list (expiry·barcodes·FEFO),
  NOT moysklad's commission/consignment money report. No money column → no footer. The deeper
  structural divergence is a separate rebuild, out of this footer task.
- **opportunities (Воронка продаж)**: tariff-gated CRM funnel (board + list toggle). The
  grounding account does NOT have funnels enabled (per CRM-subnav session 29591f34) → can't
  ground the board → DEFER.
- **profitability / unit-economics**: already complete functional reports (CSV export, date
  window, totals, store filter present). The plan's "polish" items are not concrete grounded
  moysklad gaps → SKIP (no speculative features).

## Remaining LIST work, in order

### 1. demands (Отгрузки) LIST — footer «Итого»  ← do first (same template, no grounding block)
### 2. sales-returns (Возвраты покупателей) LIST — footer «Итого»  ← same template
### 3. invoices-out LIST — finish remaining gaps
   - **Column defaults**: ours shows extra «Статус» + «Заказ покупателя»; moysklad default grid =
     №·Время·Контрагент·Организация·Со склада·Сумма·Валюта·План.дата оплаты·Оплачено·Отгружено·
     Отправлено·Напечатано·Комментарий (13). ⚠️ **RE-GROUND CLEANLY first** — my capture
     (`tools/capture/ms-invoiceout-list-ground.mjs`) was polluted by an open moysklad doc tab
     (Задачи/Файлы headers + CO filter fields bled in). Close/avoid open-doc tabs, scope to the
     VISIBLE grid, confirm whether Статус/Заказ are truly absent before making them gear-optional.
   - published/printed → cyan pills (not checkmarks); custom-field (доп.поля) filter; «Кто изменил» filter.
### 4. factures-out (Счета-фактуры) LIST — ~70%; footer + bulk-print. (detail = 20% SKELETON, blocked on VAT/soliq → DEFER.)
### 5. opportunities (Воронка) LIST — ~50%; needs LIVE grounding of moysklad's board/list-toggle question first.
### 6. reports polish (4 reports already ~90%, FUNCTIONAL not stubs):
   - commission-reports: +CSV export btn, +agent drill-down link.
   - consignments: +CSV export, +qty column, +product drill-down.
   - profitability / unit-economics: trivial (date presets / store filter).

## The footer-«Итого» template (PROVEN — copy exactly)
Reference: invoices-out commit `455fa90c`; invoices-in `db27e75e`.
- **BE** `apps/api/src/modules/<doc>/<doc>.service.ts`: add `async aggregateTotals(accountId, rawFilter)`
  right after `list()` — `parse(filter)` → `buildListWhere(accountId, filter)` → `prisma.<doc>.aggregate({where,_count,_sum:{sumMinor,vatSumMinor,payedSumMinor,shippedSumMinor}})`
  + `groupBy({by:['currency'],where})` → return `{count, ...toStr sums, currencies}`. (Use only the
  money fields that EXIST on that model — check schema; demand/sales-return may differ.)
- **BE controller**: `@Get('aggregate/totals')` + `@RequirePermission` **BEFORE** `@Get(':id')`.
- **FE** `apps/web/src/app/(app)/<doc>/page.tsx`: import `footerMoneyCells` (alphabetical, lowercase
  group). After `const params = …`: `totalsParams` = clone minus cursor/limit/sortBy/sortDir → useQuery
  `['<doc>-totals', qs]` → `footerRow = footerMoneyCells(totals, { <colKey>: totals?.<minor> ?? '0', … })`
  (keys MUST match the column keys, e.g. sum/paid/shipped). Pass `footerRow={footerRow}` to `<ListView>`.

## Gotchas / discipline (this environment)
- **Live grounding**: moysklad `#<entity>` (invoiceout/demand/salesreturn/…); the session RESTORES open
  doc tabs that pollute `th`/label scans → scope to VISIBLE elements or close tabs. Screenshot = truth;
  JSON often contaminated by GWT sibling templates. NEVER click Сохранить/Удалить/Создать.
- **Cert**: api = `tsx watch` (auto-reload, but DIES every few min → restart `pnpm --filter @moysklad/api dev`).
  API-cert the aggregate endpoint (deterministic). Browser-cert on an ISOLATED `NEXT_DISTDIR=.next-cert
  pnpm --filter @moysklad/web exec next dev -pNNNN` (turbo is FLAKY → plain webpack; never share :3100's
  `.next`; `rm -rf .next-cert` after; login needs Enter fallback; Modal/Combobox/MultiCombobox = `data-testid`).
- **Commit**: path-limited (`git commit -F msg -- <files>`); parallel session shares ru/uz.json + the git
  index → stage ONLY your hunks (`git add -p` y/…/q, or `scripts/_extract-hunk.mjs <marker>`); verify
  `git show HEAD` has 0 parallel keys. Conventional Commit, lowercase subject, body lines ≤100 chars,
  end with `Co-Authored-By: Claude Opus 4.8`. Husky lint-staged auto-stamps `docs/progress.json` (benign).
- **Honesty**: mark Phase-1 structural vs browser-verified; report per the «report at 100%» rule.

## Pointers
- Gap audit: `docs/audits/SALES-1to1-GAP-AUDIT-2026-06-25.md`
- Reference LIST (1:1 proven): `apps/web/src/app/(app)/customer-orders/page.tsx`, `invoices-in/page.tsx`
- Detail/new convergence (SEPARATE): `customer-orders/[id]` + `DENGI-MONEY-1to1-PROMPT.md`
