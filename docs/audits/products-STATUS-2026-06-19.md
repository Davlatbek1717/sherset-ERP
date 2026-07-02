# /products — consolidated STATUS (2026-06-19)

> **Verdict in one line:** the `/products` **LIST route is effectively 1:1** with moysklad
> (functional + structural; only moysklad's proprietary icon sprites can't be pixel-copied).
> The `/products` **FAMILY is NOT 1:1** — `/products/new`, `/products/[id]`, `/price-lists`,
> and Import/Export are un-audited or absent.
>
> Prior detail lives in [`products-list-moysklad-live-groundtruth-2026-06-16.md`](./products-list-moysklad-live-groundtruth-2026-06-16.md)
> and [`products-1to1-gap-inventory-2026-06-17.md`](./products-1to1-gap-inventory-2026-06-17.md).
> This doc consolidates the current state after the 2026-06-19 row-hover rollout + confidence audit.

---

## 1. `/products` LIST route — effectively 1:1 ✅

Live-grounded on `online.moysklad.uz` (farrux@climart, restricted employee) on 2026-06-18, and
re-checked in code on 2026-06-19 (no regression). The list matches moysklad on:

- **Toolbar:** 4 separate colored create buttons (Товар green / Услуга amber / Комплект blue /
  Группа blue) · «Фильтр» · search (`Наименование, код или артикул`) · result counter ·
  «Изменить ▾» · «Печать ▾».
- **Filter:** 19/19 fields in moysklad's order (`7113cccb` + `25e4a597`); saved-filters 🔖 wired
  (`7e9af02a`); non-moysklad «●» label dots removed (`b66b8fa9`, all 19 `expandable={false}`).
- **Columns:** 26-column ⚙ customizer in moysklad's exact order + 7 defaults (`17e3e31e`);
  default-visible set (Изображение · Наименование · Код · Артикул · Ед. изм. · Розночная цена ·
  Оптовая цена); **dynamic per-account price-type columns** (`0fd4e8f5` + `ef64cac2`, positional
  keys `price_0…`, per-type currency); rows-per-page 25/50/100 (`2d9ed32a`); no stock columns
  (removed `ac83cb7b` — moysklad has none).
- **«Изменить ▾» menu:** 7/7 functional (delete/copy/mass-edit/move/archive/restore/prices),
  each wired to a real BE bulk endpoint (`0c728b9a`/`de1e09c6`/`85f367e0`/`88c486c0`).
- **Row-hover ⊗ quick-delete:** moysklad's grey circle-× recreated as our own SVG (2026-06-19,
  see §2).

**Honest caveat:** moysklad's exact icon **sprites** are proprietary and not pixel-copyable — ours
are close lucide/SVG equivalents. So the list is **functional + structural 1:1**, not literal
pixel-100% on icon chrome.

**Audit honesty (2026-06-19):** an adversarial confidence audit (workflow `wf_8598d798`) ran
toolbar + backend dimensions → **0 confirmed gaps** (4 findings all refuted, e.g. the «Изменить»
separators match moysklad's real menu screenshot). The **filter / columns / row+hover** finders
**failed twice on API 529 (overload)** and were NOT freshly adversarially re-audited this session —
they were verified against the 2026-06-18 live-grounding doc + a current-code regression check
(19 filter fields, 26 columns, saved-filters, dots removed — all intact). A fresh adversarial
re-run of those 3 dims remains available when the API recovers.

---

## 2. Row-hover ⊗ quick-delete rollout — 2026-06-19 (this session)

moysklad reveals a grey circle with a white ✕ at the right edge of a list row on hover (measured
live; a ~16px medium-grey disc + white cross). Recreated as **our own** two-tone SVG
(`RowDeleteCircle.tsx`, `Icons.rowDelete`) — NOT extracted from moysklad's sprite — and generalized
into `useBulkDocumentActions` as `bulk.rowDelete(id)` (hover-revealed, confirm → `/{entity}/bulk-delete`).

**Safety (documents):** every document service blocks deleting a POSTED doc (only `draft` deletes);
a posted row comes back `200 { failed:[…] }`, and the shared `bulkDelete` now **toasts the backend's
localized reason** instead of a silent no-op. Verified end-to-end (live): posted demand 06846 → ✕ →
toast «Faqat 'draft' holatidagi otgruzkani o'chirish mumkin» + row stays; guard re-confirmed via API
on demand/supply/sales-return (each posted delete → `succeeded=0, failed=1`, doc still posted).

**Covered — 24 list pages** (commits `88043e00` · `f78cb04f` · `79ae1748` · `2008ae9c` · `d3258d6e`):
- **Catalog (4):** products, variants, services, bundles
- **CRM (4):** contact-persons, opportunities, tasks, calls
- **Documents (16):** demands, supplies, sales-returns, purchase-returns, invoices-in, invoices-out,
  payments-in, payments-out, cash-in, cash-out, losses, inventories, enters, prepayments,
  prepayment-returns, counterparty-adjustments

**Also this session:** `d8278183` — removed the non-moysklad selection bar on 18 list pages (bulk
actions moved into «Изменить ▾» via the hook's `editMenu`).

**Deferred (NOT done):**
- **10 pages without a `headerEndSlot` gear column** (no trailing cell to host the ✕): internal-orders,
  payrolls, price-lists, processing-orders, processings, productions, production/work-orders,
  service-requests, settings/uoms, settings/projects. → need a gear column added first.
- **4 parallel-session-owned pages** — a paste-ready prompt was handed to the user:
  counterparties, moves, customer-orders, purchase-orders.

---

## 3. `/products` FAMILY — remaining for "products 100%" (ITEM 6)

Each is a separate route + its own flagship; per the «visual≠functional parity» lesson, each needs a
**live element-by-element moysklad walkthrough FIRST**.

| Surface | Path | Lines | State |
|---|---|---|---|
| Create editor | `/products/new` | ~1050 | **FUNCTIONAL 1:1 for all real usage ✅** — shell `d80e1c9b` · prices `93f493d3` · «Доступ» BE+FE (`284f29a7`+`40159f1b`) · label-LEFT `236fe25` · 7-card rebuild `fd98faec` (Контент/Изображения/Общие данные/Неснижаемый остаток[3-mode]/Особенности/Штрихкоды/Доступ; grounded combos) · **ТАСНиф persist** `cc5afc42` · **image upload** `38b4b5e9` (stage→create-then-upload) · supplier[+]/uom✎ `38b4b5e9` · **TYPED-BARCODE** `91eadeab`+`5e086d07` (additive `barcode_types`); ALL browser-cert :3100. **+ Маркировка-persist** `498256be` (Тип продукции→trackingType; .uz codes added additively to product + ASL/tracking-code enums; required-GTIN flow; cert ALCOHOL+GTIN) · **paymentItemType aligned** `4e1a2e0a` (COMMODITY→GOOD, EXCISABLE_GOODS→EXCISABLE_GOOD per moysklad official ref + data-migration backfill; cert GOOD persists, COMMODITY→400). **Functional + structural 1:1 ✅** (incl. previously-unused features) · **toolbar trim** `7d65b70a` (/new = Сохранить/Закрыть+Печать; opt-in `hideEditMenu`/`hideSendMenu` on shared DetailToolbar). **The 4 re-audit "remaining" items are now resolved (2026-06-20):** **Ед.изм → combo** ✅ `f86278ad` (Combobox over /uoms, stores uom name; live-cert «кг» persisted) · **Страна → combo** ✅ `f86278ad` (Combobox over new static ISO-3166 dataset `lib/countries.ts`, stores ISO-2; live-cert «UZ» persisted) · **price-row ✏** ✅ `be22dd3b` (user chose multi-currency) — sale-price rows gain a real `/currencies` dropdown (per-price `currencyCode`, persisted via existing SalePriceSchema; no migration) + the ✏ opens the live-grounded «Курс валюты документа» dialog (`PriceRateDialog`, reference vs custom rate). Scope = SALE prices only; buy/min stay base-currency (a foreign buy/min would ripple into analitika/bom/variant cost math — a separate app-wide money change). Live-cert: row→USD, create round-trip persisted `salePrices=[{value:10000,currencyCode:"USD"}]`. · **«Поиск ТАСНИф»** ⏸ DECLINED by user (2026-06-20) — soliq.uz MXIK/ИКПУ national-catalog search (external integration we lack; manual ИКПУ/ТАСНиф entry already works). Both documented w/ screenshots in [products-new-grounding-2026-06-20/](./products-new-grounding-2026-06-20/FINDINGS-price-pencil-and-tasnif.md). · **buy/min currency** `ca82a8d5`+`4ce17e77` (all 4 price rows now have a /currencies dropdown + ✏; additive `buyPriceCurrency`/`minPriceCurrency` columns; live-cert buyPriceCurrency=USD persisted) · **app-wide ⓘ hints** `50e7c27a` (FormField `hint`→ⓘ icon beside the label w/ tooltip = moysklad pattern, replaces text-below; Артикул/Код ⓘ added → audit's last 2 gaps closed; browser-cert /products/new + /counterparties/new). **AUDIT-TO-CONVERGENCE (2026-06-20):** adversarial re-audit (5 fresh agents, refute-default) → only 2 hint gaps → fixed → 2nd-pass re-audit (2 fresh agents) = **0 gaps**. **/products/new is 1:1 with moysklad on every structural + functional dimension** (7 cards, all fields, all 4 price-row currencies+✏, combos, ⓘ-hints, toolbar, tabs, full backend persistence). **Known deliberate omissions:** soliq.uz «Поиск по ТАСНиф» auto-search (user-declined; manual code entry works) + full multi-currency COST-MATH correctness (app-wide future work — account is UZS-only). **⚠️ CORRECTION (user live-review 2026-06-20) — the «0 gaps / 1:1» above was PREMATURE:** the convergence audit compared a STATIC capture doc and missed two live-interaction gaps it could not see. (1) **placeholders** — moysklad inputs are EMPTY (no placeholder hint-text); ours had them → **FIXED `f72a0fa7`** (0 placeholders, browser-cert). (2) **dual-mode reference inputs** — moysklad's Группа/Страна/Поставщик/Ед.изм/Доступ are TYPEABLE (inline typeahead) AND have a ▾ load-picker + [+] add (live-grounded: each = typeable text-box + `clear`/`load`/`add`/`edit` buttons); OURS uses **modal-only `CatalogPickerField`** for Группа/Поставщик/Сотрудник/Отдел (no inline typeahead) → **NOT 1:1, OPEN TASK**. Fix = rebuild those as a typeahead combo + [+] (note: `Combobox.onChange` yields value-not-item → needs a label-state or a small component tweak; `CatalogPickerField` is used app-wide, so this is a shared-pattern rework). **LESSON: a static-doc audit cannot catch interactive behavior — must live click-through every input/filter.** ([groundtruth](./products-new-live-groundtruth-2026-06-19.md) + 2026-06-20 addenda) |
| Detail card | `/products/[id]` | 875 | un-audited (multi-tab: Основное/Цены/Себестоимость/Остатки/Документы/Производство/Файлы/Модификации) |
| Price lists | `/price-lists` (+ `[id]`, `new`) | 712 | never audited |
| Import / Export | — | — | **absent feature** (Excel/CSV/1С/ЭДО) — moysklad has it prominently |

**Execution order (each = own focused session, live-ground first):**
1. `/products/new` — **flagship 1 (2-column shell) ✅ `d80e1c9b`**; flagships 2-6 remain (see
   [`products-new-BUILD-PLAN-2026-06-19.md`](./products-new-BUILD-PLAN-2026-06-19.md)).
2. `/products/[id]` (tab-by-tab).
3. `/price-lists`.
4. Import/Export (scope with the user; adversarial-QA: axios-timeout, mapping, race, big-file).

There is already a partial spec: [`products-create-detail-spec-2026-06-18.md`](./products-create-detail-spec-2026-06-18.md)
and [`products-modals-cohort4-spec-2026-06-17.md`](./products-modals-cohort4-spec-2026-06-17.md) — read before building `/new`.

---

## 4. Process lessons (this session)

- **Shared working tree / git index hazard:** parallel Claude sessions share ONE index. A `git rm`
  left staged after a failed commit leaked into another session's commit (`23285a55`). FIX: never
  leave the index dirty; stage only own files by explicit path; verify `git diff --cached` before AND
  `git show --stat` after every commit; never `git add -A` / `git commit -a`. Worktree isolation is
  the real fix if it recurs.
- **Honesty gate:** commit messages claiming verified/done need the literal word `live`/`smoke` or a
  concrete count.
- **API 529 overload** can kill workflow agents mid-run (0 tokens) — fall back to a direct
  main-agent audit grounded in the live-capture docs + code.

---

## 5. NEXT

`/products/new` **f1 (shell, `d80e1c9b`) + f2 (prices/MoneyInput, `93f493d3`) done**, then the full real
form was **live-grounded** → [`products-new-live-groundtruth-2026-06-19.md`](./products-new-live-groundtruth-2026-06-19.md)
(AUTHORITATIVE target). That revealed the real form is **7 left cards + ~8 field-groups, several needing
NEW backend columns** — so literal 100% = a **left-column rebuild + backend work, multi-session**. Next:
work the gap list in that doc — frontend first (7-card layout + label-left + price ✏ pencil), then the
backend columns (Фасовка / Тип учета / Маркировка / typed-barcode / per-store min-balance / Доступ). Keep
labelling **Phase-1 structural** until each is browser-smoked; don't claim 1:1 until the doc's gaps close.
