# Salesreturn `/new` (QISM 1) — 1:1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Make `apps/web/src/app/(app)/sales-returns/new/page.tsx` (the «Возврат покупателя» create form) visually + functionally 1:1 with moysklad's create form, in grounded slices.

**Architecture:** Pure-FE where possible (this page owns its meta-grid JSX + `POSITION_COLUMNS` array; the shared `PositionTable` renders exactly the keys the page passes). Live «Остаток» reuses the store-stock query pattern already proven on demand `/new`. «Перечисление» (1B) is the only slice needing backend persistence.

**Tech Stack:** Next.js App Router · React Query · `@moysklad/ui` DocumentEditor/PositionTable/DocumentMetaPanel · next-intl (`ru`/`uz`).

**Grounding:** `docs/audits/sales-returns-live-2026-07-23/_GAP-BACKLOG.md` (NEW section, N1–N8) + `docs/moysklad-reference/salesreturn/new/` (gitignored PII — `edit-default.png` create-form screenshot). Understand-workflow `wf_8ed11ec2-520` mapped the reuse patterns.

## Global Constraints

- **Model:** Opus/flagship only (CLAUDE.md §0). Mechanical edits may use a Sonnet codemod but hukm = Opus.
- **Label grounding (CLAUDE.md §4):** every RU label read from capture by DOM-role (`<div class="gwt-Label header">LABEL</div>`), never grep-count. New audited labels → `label-grounding.test.ts` registry.
- **Honesty (CLAUDE.md §1):** result is **«Phase-1: strukturaviy»** until QISM 5 browser-cert. Never «done/100%/production-ready».
- **Gate (every task):** `pnpm typecheck` 0 · `biome check` 0 · i18n key-existence ru+uz + no-hardcoded · web Vitest no-regress.
- **Sibling parity:** demand `/new` is the sibling. Keep salesreturn's defer decisions consistent with demand's (Себест.единицы + marking deferred there too) unless grounding says otherwise.

---

## Grounded facts (from the understand-workflow + live capture)

- **`PositionTable` is 100% page-driven** (packages/design-system/src/document-editor/PositionTable.tsx): the `columns` prop is required; the table renders *only* those keys, in order. Hiding a column = drop its key from the page array (no DS change). The `unit` key is special (rendered inline in «Кол-во», not as its own column).
- **All three moysklad position columns already exist as DS keys** — `stock` («Остаток», read-only, 70px, right), `costPerUnit` («Себест. единицы», read-only, derived from `row.priceMinor`), `rnpt` («РНПТ», editable free-text 150px). No DS change needed to show any of them.
- **«Остаток» is BUILDABLE now** via the demand `/new` pattern: `GET /stocks?storeId=…&assortmentIds=…` → `stockMap` → derived `rowsWithStock` (spread `stock` onto rows) → `<PositionTable rows={rowsWithStock}>`. `NewPositionRow extends DocPositionRow`, which already carries `stock?: string`. i18n `position_cols.stock` = «Остаток»/«Qoldiq» (exists).
- **«Себест. единицы» must be DEFERRED** — the DS `costPerUnit` renders `row.priceMinor` (the *sale* price), NOT a cost. A sales-return's true cost basis is the original outbound COGS, which is not available at draft time (`/products` strips buyPrice; return COGS only known at post). Wiring `costPerUnit` would display the sale price as cost — wrong. Same deferral as demand.
- **«РНПТ» DEFERRED** — the DS `rnpt` column is editable, but `SalesReturnPositionInputSchema` has **no** `rnpt`/marking field (only `gtdNumber`, `gtdSumMinor`, `countryId`), so an editable РНПТ input would silently drop on save. Marking = QISM 4 (BE field first). Consistent with demand (`rnpt` unwired there).
- **«Перечисление» (N1) is net-new** — no `paymentType`/`paymentMethod` concept exists anywhere in apps/api. Live capture: it is a combo directly under Организация whose options come from the org's configured accounts (this org, elektro_sentr, offers a single option «Перечисление» = bank-transfer). Likely relates to the existing `organizationAccountId`. **Persistence + option-list need their own grounding step (Task 3).**
- **Detail (2A) shares nothing at the positions layer yet** — detail uses the older `PositionEditor` pattern (not `PositionTable`/`POSITION_COLUMNS`) and has no currency/Перечисление/Баланс controls. Any shared-column contract is buildable on `/new` first; detail migration is 2A.

---

## Task 1 — Position-row parity (Остаток live + hide goodPack/vatAmount/discount)   ·  **THIS SESSION**

**Files:**
- Modify: `apps/web/src/app/(app)/sales-returns/new/page.tsx` (POSITION_COLUMNS ~117-135; add stock query/merge near other queries ~139-246; pass `rows={rowsWithStock}` ~785)
- Test (browser-cert): live `:3100` `/sales-returns/new` next to `docs/moysklad-reference/salesreturn/new/edit-default.png`

**Interfaces:**
- Consumes: `GET /stocks?storeId&assortmentIds` → `{ items: Array<{ assortmentId: string; qty: string }> }` (also returns `reservedQty`, `costBalanceMinor` — unused here).
- Produces: nothing downstream (self-contained FE change).

- [ ] **Step 1 — Add the `position_cols` translations hook.** After the existing `tStates` hook (~line 105), add:
```ts
const tCols = useTranslations('position_cols');
```

- [ ] **Step 2 — Reconcile `POSITION_COLUMNS` to moysklad's default-visible set (N4–N7).** Replace the array (currently keys: …quantity, goodPack, price, vat, vatAmount, discount, amount, gtdSumMinor, country, menu) so it DROPS `goodPack`, `vatAmount`, `discount` and ADDS `stock` right after `quantity`:
```ts
const POSITION_COLUMNS: PositionTableColumnConfig[] = [
  { key: 'dragarea' },
  { key: 'select' },
  { key: 'index' },
  { key: 'image' },
  { key: 'name' },
  { key: 'quantity' },
  { key: 'stock', label: tCols('stock') }, // «Остаток» — live store balance (read-only)
  { key: 'price' },
  { key: 'vat' },
  { key: 'amount' },
  // moysklad «Возврат покупателя» customs block (§45): Себестоимость ГТД + Страна.
  { key: 'gtdSumMinor', label: tFields('gtd_cost') },
  { key: 'country' },
  { key: 'menu' },
];
// DEFER (Phase-1, sibling-consistent with demand): Себест. единицы (costPerUnit —
// no valid draft cost basis) + РНПТ (no BE marking field, QISM 4). Not added.
```

- [ ] **Step 3 — Add the store-stock query + merge (copy demand pattern).** Near the other `useQuery` blocks (after `currenciesData`, ~line 246), add:
```ts
// Live «Остаток» — store balance per position, mirroring demand /new.
const assortmentIds = useMemo(
  () => positions.map((p) => p.assortmentId).filter((id): id is string => !!id),
  [positions],
);
const { data: stockData } = useQuery<{ items: Array<{ assortmentId: string; qty: string }> }>({
  queryKey: ['stocks', storeId, assortmentIds.join(',')],
  queryFn: () =>
    api.get(`/stocks?storeId=${storeId}&assortmentIds=${encodeURIComponent(assortmentIds.join(','))}`),
  enabled: !!storeId && assortmentIds.length > 0,
});
const stockMap = useMemo(() => {
  const m = new Map<string, string>();
  for (const r of stockData?.items ?? []) m.set(r.assortmentId, r.qty);
  return m;
}, [stockData]);
const rowsWithStock = useMemo(
  () => positions.map((p) => ({ ...p, stock: p.assortmentId ? stockMap.get(p.assortmentId) : undefined })),
  [positions, stockMap],
);
```

- [ ] **Step 4 — Feed the merged rows to the table.** In the `<PositionTable …>` block (~line 783) change `rows={positions}` → `rows={rowsWithStock}`. Leave `onUpdate`/`onRemove`/`onReorder` bound to the `positions` setters (they key by `row.id`, unaffected by the spread).

- [ ] **Step 5 — Gate.** Run:
```
pnpm --filter @moysklad/web typecheck && pnpm --filter @moysklad/web biome:check && pnpm --filter @moysklad/web test
```
Expected: typecheck 0, biome 0, Vitest no new failures. (i18n `position_cols.stock` already exists ru+uz.)

- [ ] **Step 6 — Browser-cert (Phase-1 visual).** `pnpm dev`, open `:3100` `/sales-returns/new` (uz + ru), add a real product line, and compare the position row to `docs/moysklad-reference/salesreturn/new/edit-default.png`: columns must read `…Кол-во · Остаток · Цена · НДС · Сумма · Себестоимость ГТД · Страна` (no Скидка/Сумма НДС/Ед.); «Остаток» shows the live store qty. Screenshot for the cert note.

- [ ] **Step 7 — Commit.**
```
git add apps/web/src/app/(app)/sales-returns/new/page.tsx
git commit -m "feat(salesreturn): /new position-row 1:1 — Остаток jonli + goodPack/vatAmount/discount yashir (N4-N7)"
```

> **Task 1 status label:** «Phase-1 strukturaviy + live-smoke» — NOT «done» (full 1A needs Task 2 + 3; runtime QA = QISM 5).

---

## Task 2 — Meta-grid reorder to moysklad order (N2/N3/N8)   ·  NEXT SESSION

**File:** `apps/web/src/app/(app)/sales-returns/new/page.tsx` (the `tabs[0].content` `DocumentMetaPanel`, ~579-781).

**Target order (grounded, edit-default.png):**
```
Организация* (+ «Перечисление» slot below)  |  Склад*
Контрагент* (+)                             |  Договор
Проект (+)                                  |  Канал продаж (+)
Валюта документа* (standalone row, ✎ rate helper)
```
Extra fields our form has that moysklad hides on create (Счёт организации, Счёт контрагента, Внешний код, linked «Отгрузка», «Причина») → move into a **«Другие поля»/«Ещё» disclosure** (reuse the pattern demand `/new` added in commit `da20554` — read `demands/new/page.tsx` for the exact `DocumentDisclosurePanel`/inline-link approach). N8: «Причина» is NOT a top-level field on moysklad create — it belongs in that disclosure, not deleted (the `reason` schema field stays wired).

- [ ] Step 1 — Read demand `/new`'s «Другие поля» disclosure implementation; note the component + placement.
- [ ] Step 2 — Reorder the 4 `DocumentMetaRow` blocks to the target order; keep the Организация→bankAccount helper and Валюта→rate helper intact.
- [ ] Step 3 — Move Счёт организации / Счёт контрагента / Внешний код / linked-demand / Причина into the disclosure.
- [ ] Step 4 — Gate + browser-cert meta-grid vs edit-default.png.
- [ ] Step 5 — Commit.

> Leave a placeholder comment where «Перечисление» goes (Task 3 fills it).

---

## Task 3 — «Перечисление» combo (N1) — 1B functional   ·  NEXT SESSION (grounding-first)

**Net-new field; no existing pattern.** Do NOT guess. Two grounded sub-steps before wiring:

- [ ] **Step 1 — Live option-capture (§4).** With the create form open on moysklad (`.auth/moysklad.json` session), click the «Перечисление» combo under Организация with the real element handle and enumerate ALL options (this org showed a single «Перечисление»; a cash-configured org may also show «Наличные»). Record the grounded option set. (Last attempt's coordinate/arrow click only surfaced the selected value — use the input's own dropdown-open interaction.)
- [ ] **Step 2 — Persistence decision.** Determine whether moysklad's field selects the org **payment-form** (Наличные/Перечисление) or maps to the org **account** (`organizationAccountId`, which the schema already has). Decide: reuse `organizationAccountId` presentation vs a new `paymentType` enum column (Prisma migration) vs the existing `CreateSalesReturnSchema.attributes` record. Record rationale.
- [ ] **Step 3 — Add the combo** under Организация (matching Task 2's slot), wire create + persist, round-trip test.
- [ ] Step 4 — Gate + browser-cert save round-trip 1:1.
- [ ] Step 5 — Commit.

---

## Deferred (documented Phase-1 parity gaps — not silent)

- **«Себест. единицы»** — no valid draft cost basis (sale-price ≠ return COGS). Revisit when return-COGS source is decided (cross-cutting with demand).
- **«РНПТ» / Маркировка** — needs a BE marking field on `SalesReturnPositionInputSchema` first; QISM 4 (may share the demand marking DS work).

## Self-review

- Spec coverage: N1(Task 3) · N2/N3(Task 2) · N4(Task 1 cols) · N5/N6/N7(Task 1 hide) · N8(Task 2 disclosure) · Себест/РНПТ(Deferred). ✓ all mapped.
- No placeholders in Task 1 (complete code). Tasks 2–3 carry grounding sub-steps for genuinely-unknown areas (not placeholders).
- Type consistency: `stock`/`rowsWithStock`/`stockMap` names match demand's proven code and the DS `DocPositionRow.stock` field.
