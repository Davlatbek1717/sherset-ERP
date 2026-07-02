# App-wide money entry: tiyin → som (the MoneyInput overhaul)

**Date:** 2026-06-10c · **Trigger:** the Cohort A Session-2 QA surfaced a money-critical finding (money-doc
«Summa» input accepted raw minor units / tiyin → 100× manual-entry hazard). **User decision:** «To'liq
app-wide (hozir)» — convert ALL money inputs to major (som) entry. **Commits:** `8313b69a` (foundation +
PositionEditor) + `<C2>` (consumer rollout). **Status:** runtime-verified (two surfaces browser-proven E2E).

## The bug-class (app-wide convention, not a one-off)
Every editable money input bound the raw `*Minor` string (tiyin). A user typing "300000" in a price/sum
field booked a **3 000,00 сум** document (100× too small). The UZ position label even read "Narx (tiyin)";
the RU label was just "Цена" (no hint) — so a RU user had no warning. moysklad enters **som** — this was a
parity + data-integrity defect across the whole app. Confirmed via the shared PositionEditor (`value={p.priceMinor}`,
label "Narx (tiyin)") and `formatMoney`'s own hardcoded `/100`.

## Fix — a reusable `<MoneyInput>` (packages/design-system)
`MoneyInput(valueMinor, onChangeMinor)` is a **drop-in** for the old `<Input value={x.sumMinor}
onChange={e => set(e.target.value)} />`: it DISPLAYS/ACCEPTS major (som) but stores/emits minor (tiyin), so
every caller keeps its **minor-based state, totals math, validation, and save payload unchanged** — only the
input element changes (`value`→`valueMinor`, `onChange`→`onChangeMinor`). An internal draft holds exactly
what the user types and emits the parsed minor each keystroke (live totals); blur / external change re-syncs
to the canonical major. Scale is `/100` (UZS), matching `formatMoney`'s display scale (full non-UZS is a
separate, grounding-gated DS effort). Helpers `minorToMajorInput` / `majorToMinorInput` (+13 unit tests:
whole/fractional/comma/space/negative/invalid/round-trip).

## Surfaces converted (every editable money input app-wide)
- **Shared `PositionEditor`** (price, cost, gtd-sum) → fixes line-item price/cost entry on **all ~15
  line-item documents at once** (customer-orders, demands, supplies, invoices-in/out, sales/purchase-returns,
  enters, losses, moves, internal-orders, processings, processing-orders, …). Dropped "(tiyin)" from the UZ
  pricePerUnit/costPerUnit labels.
- **Money documents** (cash-in/out, payments-in/out — both `[id]` + `/new`): document Сумма + each
  allocation/operation amount (10 inputs across 8 files).
- **Prepayments + prepayment-returns** (`[id]` + `/new`): Сумма + the three payment-split inputs
  (cash/noCash/qr) — 16 inputs across 4 files.
- **counterparty-adjustments** (`[id]` + `/new`): Сумма.
- **hr/payroll** config (monthlySalesTarget, monthlyKpiBudget) + **payrolls** line amounts (`new` + `[id]`).
- **products** (`[id]`): buyPrice / salePriceDefault / minPrice (via react-hook-form `Controller`).
- **invoices-in/out** balance display (`remainingMinor`): was a disabled input showing raw minor → now
  `formatMoney(remainingMinor)` (display polish — it was read-only, not an entry hazard).
- **i18n**: every "(tiyin)/(тийин)" money label/hint updated to som — `position_editor.pricePerUnit/costPerUnit`,
  `price_minor`, `alloc_col_amount` (×4 docs), product `buy/sale/min_price_hint`, payroll `cfg_minor_hint` /
  `amount_som_hint`. Zero "tiyin/тийин" strings remain in messages.

## Method
Foundation + shared PositionEditor (commit 1) built + browser-proven by the operator. The ~20 uniform consumer
pages were converted by an 8-agent Workflow fan-out (`wf_0de0c87e-26e`, wiring protocol: MoneyInput committed
first · no git · named files only · money fields ONLY); the operator did the special cases (products RHF,
invoices, payrolls) + all i18n. **Every agent diff was operator-verified**: a `valueMinor=` audit confirmed
NO non-money field (qty/discount/vat/text) was wrapped, and a source-scan guard confirms each page uses
`<MoneyInput>` with no surviving raw-minor editable binding.

## Browser-proven E2E (both directions, two surfaces)
- **Positions** (draft customer-order): a position at priceMinor 10000000 shows "100000" in the price input;
  typing "200000" → live line total "672 000,00" → save → API priceMinor=20000000, sumMinor=67200000.
- **Money doc** (draft cash-out): sumMinor 5000 shows "50"; typing "250000" → save → API sumMinor=25000000.

## Guards
- `packages/design-system/src/lib/format.test.ts` +13 (conversion math, round-trip).
- `apps/web/src/__tests__/money-input-rollout.test.ts` +52 (each converted page uses `<MoneyInput>`;
  non-vacuous ban on the old raw-minor bindings; invoices balance uses formatMoney).

## Deferred (documented, NOT done — lower-risk, different shape)
- **List-page «Сумма от/до» filters** (`filterValues.sumMinorFrom/To`, ~25 list pages): still tiyin. These
  are query-convenience inputs with a **number** state shape (not a minor string), so they need a small
  adapter, not the drop-in swap. No data-integrity risk (filtering, not writing). Tracked as a follow-up.
- **Non-UZS display** (`formatMoney` hardcodes `/100`): unchanged — the same grounding-gated DS effort noted
  in 08o. The MoneyInput scale is `/100` to match it (UZS-correct); multi-currency input+display move together.

## Gate
ds tc0 · web tc0 · biome0 · ds Vitest 127 (+13) · web Vitest 1551 (rollout +52, was 1499) · api Vitest 2818
(unchanged, no api files touched). Env restored (all ZZ-QA / draft probe records deleted).
