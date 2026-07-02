# Products «Тип» filter — §4 inversion-mislabel removed (2026-06-13, 11ad)

**Scope:** one file of behaviour (`apps/web/src/app/(app)/products/page.tsx`,
`KIND_OPTIONS`). The products list «Товары и услуги» → «Фильтр» → «Тип» dropdown
offered a 4th option `{ value: 'consignment', label: 'Модификация' }`. Removed —
moysklad's «Тип» dropdown offers exactly **Все · Товар · Услуга · Комплект**.

## The bug (§4 inversion-mislabel — value ↔ label could never both be right)

The pairing was wrong by the moysklad data model, in *every* interpretation:

| filter value | moysklad data-model term | the codebase showed |
|---|---|---|
| `variant`     | **«Модификация»** (a product variation, e.g. "продукт (мод А)") | — (not an option) |
| `consignment` | **«Серия»** → renamed **«Партия»** (a labeled batch / lot) | **«Модификация»** ❌ |

Grounded against `docs/moysklad-reference/api-docs-official/dictionaries/`:
- `_assortment.md` line 157 — the assortment `type` filter enum is
  `product, service, bundle, variant, consignment` (five distinct types; the
  4th is `variant`=Модификация, the 5th is `consignment`).
- `_consignment.md` line 1 — «Партия … ключевое слово **consignment**».
- `notifications/rename-consignment.md` (2026-03-05) — moysklad renamed the
  entity «Серия» → «Партия» (terminological; API keyword unchanged).

So `consignment` is «Партия», not «Модификация». The label «Модификация» belongs
to `variant`, which this codebase's `ProductKindSchema`
(`product | service | bundle | consignment`) does not even contain. The
value↔label pair was therefore incoherent regardless of moysklad's UI.

The stale comment claimed «Russian literals match moysklad's «Тип товара»
dropdown» (D3 audit, 2026-05-26) — the exact kind of unverified
capture-grounding claim CLAUDE.md §4 warns drifts (cf. the «Себестоимость»
banner, «Показывать»/«Статус» swap history).

## Why removal (not relabel) — domain-owner grounded, capture was the gate

The fix *direction* was the one thing neither code nor the reference could
settle: it depends on what moysklad's «Тип» dropdown actually lists, and there is
**no DOM capture** of it open (`products/states/03-edit-dropdown` is the
row-action menu; `02-filter-applied.png` is a screenshot with no domDump). Per §4
("capture'da yo'q bo'lsa → reference; ikkilanish bo'lsa → defer, don't guess"),
this had been deferred ~10 sessions as "capture-gated".

Resolved by asking the domain owner, who is logged into live moysklad.uz as admin
(2026-06-13): the «Тип» dropdown shows exactly **Все · Товар · Услуга · Комплект**
— no «Модификация», no «Серия/Партия». That matches the «Товары и услуги» list
semantics: it lists Товар/Услуга/Комплект rows; **variants nest** under their
parent product, and **series/batches live in the separate «Серийные номера» tab**
(visible in `02-filter-applied.png`). So the 4th option is a phantom moysklad
never shows → removed, not relabeled.

## Why it's safe (no behaviour change beyond the dropdown)

- `KIND_OPTIONS` is used in **exactly one place** — this filter (grep across
  `apps/web/src`). It is not a column, badge, or detail-card label.
- The product editor has **no kind selector** (`products/new`, `products/[id]`
  expose no `kind` control); products default to `kind: 'product'`
  (`CreateProductSchema`). No UI ever creates a `kind='consignment'` product, and
  `Product.kind='consignment'` is never set or queried anywhere in the API
  (grep-proven) — so the removed option filtered for rows that cannot exist.
- The BE filter (`product.repository.ts:38` `...(filter.kind ? { kind } : {})`)
  is left permissive (still accepts `consignment` — harmless, and matches
  moysklad's API which accepts `type=consignment` via `groupBy`). A stale
  bookmarked `?kind=consignment` URL filters to zero rows with no crash; the
  native select simply shows no selection. No special handling needed.

## Guard (REGRESSION-LOCK)

`apps/web/src/__tests__/products-filter-fields.test.ts` — new test in the §4
grounding block parses the actual `KIND_OPTIONS` source array and asserts it
contains exactly the three `value: '…'` options (Товар/Услуга/Комплект) and does
**not** contain `consignment` or «Модификация». Non-vacuous: it would have failed
against the pre-fix array. Companion to the existing «Тип»/«Показывать» §4 locks.

## Gate (fully green)

- web `tsc --noEmit` — 0 errors
- biome (changed files) — 0
- web Vitest **2186 passed + 1 skipped** (was 2185; **+1** = the new lock; 0 regress)
- api / ds / db — untouched

## HONEST STATUS — Phase-1 structural + source-locked; browser-smoke deferred

The change is a removal from a static literal array rendered by a `NativeSelect`
(no data dependency, no async, no computed branch), source-locked by a unit test
that parses the array. Runtime risk is negligible. A live browser smoke
(open the «Тип» dropdown, count 4 options) was **not run** — the Playwright MCP
server was not connected this session. Labeled **Phase-1, browser-smoke YO'Q**
per CLAUDE.md §1; the dropdown-render confirmation is a cheap QA-backlog item.

## Deferred (out of scope, documented)

- Whether moysklad's products list should expose a `variant`/«Модификация» filter
  at all (it does not, per the domain owner) — no action needed; recorded for
  completeness.
- `ProductKindSchema` including `consignment` as a Product.kind value is itself
  slightly off versus the moysklad model (consignment is a child entity, not a
  product kind), but it is the entity create/update enum and changing it is a
  separate, riskier schema concern — untouched here.
