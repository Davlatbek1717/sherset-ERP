# 🏁 List-Audit Conveyor — COMPLETE (A–L12)

> **Status:** Phase-1 structural audit conveyor fully complete. **Browser-smoke YO'Q** for the list axis
> except where noted — every unit below is **"Phase-1, runtime-unverified"** unless a Phase-2 entry says otherwise.
> Authoritative running hand-off remains `NEXT.md`; live counters in `docs/progress.json` (`pnpm progress`).
>
> Generated 2026-06-06 to formally close the list conveyor (the option-3 deliverable promised in NEXT.md).

## Headline counters (grounded — `docs/progress.json`)

- **Detail-audit conveyor (A–L): 63/63 = 100%** (`detail_pages.audited_pct: 100`, 63 `*-detail.audit.md` on disk).
- **List-audit conveyor (L1–L12): 71 audit docs** (`list_audits.audited: 71`, 71 `*-list.audit.md` on disk).
- Gates held every cohort: typecheck 0 · biome 0 · i18n key-existence ru+uz · label-grounding guard · web/api Vitest (0 regress).

> Note: `list_pages.total_target: 56` vs `actual_routes_in_app: 57` in progress.json is an **older toolbar-component
> build metric** (`toolbar_components_built: 16`), NOT audit coverage. Audit coverage = `list_audits` (71). The 56/57
> is a pre-existing build-tracking quirk, not a missed list page.

## Method (the conveyor engine)

`scripts/wf-cohort-list-audit.js` per cohort (1 family): **premise** (auto-correct the reference + bias-immunize the
operator's own brief) → per-page **diff** vs moysklad parity baseline → **completeness critic** (intrinsic/runtime
bug-classes the sibling-diff can't see) → **blind-verify** each candidate (refute-default). Every confirmed delta was
then ground-truthed by Opus directly (never applied blind); mechanical fixes via Sonnet codemod. §4 discipline: labels
grounded on **DOM role** (`>LABEL<`, `title=`), never grep-count; absent capture → products-reference parity, defer on
doubt. Permanent guard: `apps/web/src/__tests__/label-grounding.test.ts` (GROUNDING-LOCK + REGRESSION-LOCK), grown each cohort.

## List cohorts (L1–L12)

| Cohort | Family | Pages | Headline outcome |
|--------|--------|-------|------------------|
| **L1** | Money-docs | cash-in/out · payments-in/out · prepayments · prepayment-returns · counterparty-adjustments | 30 confirmed — column labels (Контрагент/Время/Приход·Расход/Назначение платежа) + balance-list i18n + mass-edit |
| **L2** | Sales lists | customer-orders · demands · invoices-out · sales-returns | counterparty→Контрагент ×4 · date→Время · directional store · invoiced_sum · currency-col off-default |
| **L3** | Purchase lists | supplies · purchase-orders · invoices-in · purchase-returns · commission-reports · consignments · factures-in/out | counterparty Поставщик/Покупатель→Контрагент ×6 · supplies whole-page Latin-uz i18n · directional store |
| **L4** | Stock/internal | moves · enters · losses · inventories · internal-orders | grid-header label bug-class (Дата→Время ×5, Себестоимость→Сумма ×4) · +Организация col · `'UZS'`→`r.currency` |
| **L5** | Production | productions · processings · processing-orders · boms · processes · stages · work-orders | productions degraded scaffold fixed (dead pagination/bulk) · date/money labels · microqtyToWhole BigInt-safe |
| **L6** | Catalog | products · product-folders · bundles · services · variants · tracking-codes | money `displayAs:'none'` ×6 · folder col Папка→Группа · product-folders whole-page i18n · **tracking-codes dead pagination (HIGH) fixed** |
| **L7** | CRM | counterparties · contact-persons · opportunities · tasks · pipelines | counterparties i18n gate-blind (mixed STIR/ИНН per-locale) · date cohort-bug → shared helpers · chrome drift |
| **L8** | E-commerce/pricing | sales-channels · online-orders · discounts · price-lists · price-types | orders money `formatSum`→`formatMoney` (BigInt-safe) · date→shared `formatDate` ×2 |
| **L9** | HR | employees · payroll | employees clean (richer set intentional) · **payroll: fmtMinor `-0`, dead snapshot-refresh (qc), silent-failure onError** |
| **L10** | Retail | retail/sales · retail/sessions | **sessions dead search box WIRED full-stack** · Latin-uz `Holat`→status · fetched-unrendered Склад/Организация cols · «Cheklarlar»→«Cheklar» |
| **L11** | Settings-finance | bank-accounts · cash-desks · expense-items · tax-rates · currencies · exchange-rates · mxik | **tax-rates dead/inert search box WIRED full-stack** (rate-OR-comment) · rest clean (real cursor + BigInt money) |
| **L12** | Settings-org | publications · users · task-types · uoms · regions · organizations · webhooks · print-templates · label-templates · custom-entities · stores · projects · attributes | **publications whole-page Latin-uz i18n** + 27-entry doc-type map · users position col + dead search removed · BE search honesty (regions/orgs OR + INN JSON-path) · uoms §4 DOM realign · several dead-control wirings |

Recurring bug-classes the conveyor surfaced (gate-invisible to typecheck/biome/i18n-key):
- **Money in list cells:** hand-rolled `Number(minor)/100` + locale suffix → BigInt-unsafe + wrong separator → shared `formatMoney(…,{displayAs:'none'})`, CSV cellText keeps suffix.
- **Dates in list cells:** raw `toLocaleDateString` → shared `formatDate`/`formatDateOnly` (NaN-guard, dedup).
- **Dead/inert controls:** search boxes rendered but not threaded (FE) and/or not applied in the service `where` (BE) → wired end-to-end (L10 sessions, L11 tax-rates).
- **Dead pagination:** BE `take:200` + `total: items.length` + no cursor, FE `hasNext={false}` → real cursor+count (L6 tracking-codes HIGH).
- **Latin-uz leaks on LIST pages:** the `no-hardcoded` gate scans only document forms, so list-page Latin-uz leaked into RU locale → i18n keys.
- **Fetched-but-unrendered columns:** BE `include` returns a column moysklad shows but the grid never rendered → added (L4/L5/L10).

## Detail cohorts (A–L) — already complete (recap)

A Production-core · B Stock+internal · C Production-config · D Money/returns · E Retail · F Catalog-items · G CRM ·
H E-commerce/pricing · I HR · J Analytics · K Settings-finance · L Settings-org. 63/63 pages. Notable HIGH fixes:
products `api.put`→`@Patch` 404 (F); opportunities contact-person wipe-on-load + tasks Edit→duplicate (G); retail
hardcoded-Latin-uz leak ~27 labels (E); prepayment retail-split `null`→400 wholesale-save-block (D).

## What is NOT covered by this conveyor (open, see NEXT.md)

- **Phase-2 runtime/browser QA** for the audited pages — was 0%; first item now verified (see below).
- Navigation graph (0%), modals (~8/100+), reports/import-export/permissions/e2e breadth, staging/rollout.
- BE feature-gaps: `/admin/employees`, print-template editor, catalog change-history (boms/processes/stages), org-account picker scope.

## Phase-2 progress (runtime-verified)

- **2026-06-06 — auditLog-write (cohort-D money-docs History tab):** implemented (`0ce3ba93`) AND runtime-verified against
  the live API + real DB — create/transition/delete audit rows now populate the History tab for prepayment /
  prepayment-return / counterparty-adjustment (13/13 API smoke), plus 3/3 adversarial money checks (over-refund cap,
  refund currency-lock). **First QA-backlog item taken from Phase-1 → Phase-2 verified.**

— end —
