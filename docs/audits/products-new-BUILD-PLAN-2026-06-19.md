# /products/new — 1:1 build plan + handoff (2026-06-19)

> Handoff for the `/products/new` rebuild (ITEM 6 of the /products campaign). The LIST route is
> already 1:1 (see [`products-STATUS-2026-06-19.md`](./products-STATUS-2026-06-19.md)); this doc is
> ONLY the create-editor. Target details + the live moysklad ground-truth are in
> [`products-create-detail-spec-2026-06-18.md`](./products-create-detail-spec-2026-06-18.md) — read it first.
>
> **Scope reality:** `/products/new` → 1:1 is a **multi-flagship rebuild**, NOT a single session.
> Do ONE flagship per focused session, **live-ground each on moysklad before building** (the
> «visual≠functional parity» lesson). Do NOT cram (the 34-bug anti-pattern).
>
> **PROGRESS (2026-06-19):**
> - flagship 1 ✅ — 2-column shell (`d80e1c9b`, browser-smoked).
> - flagship 2 ✅ — Цены tab MoneyInput + currency dropdown (human sums) + Вес/Объём/НДС moved to Общие
>   данные (`93f493d3`, browser-smoked: create round-trip, money scale ×100 verified via API).
> - **The FULL form was then live-grounded** → [`products-new-live-groundtruth-2026-06-19.md`](./products-new-live-groundtruth-2026-06-19.md)
>   (AUTHORITATIVE target; supersedes the older spec). It revealed the real form has **7 left cards, not 4**,
>   plus ~8 field-groups several of which need **NEW backend columns** → literal 100% is a left-column
>   rebuild + backend work, multi-session. The gap list + remaining flagships are in that doc.

## Current state (`apps/web/src/app/(app)/products/new/page.tsx`, ~585 lines)

A **flat single-column** form using `DetailToolbar` + `DetailHeader` chrome, with 4 `FormSection`s:
- **Основное:** name (title) · code · article · externalCode · folder (CatalogPicker) ·
  supplier (CatalogPicker) · barcodes (chip add) · description.
- **Цены:** Минимальная · Закупочная · **per-price-type sale rows** (✅ `f84b39eb` — one input per
  non-archived PriceType from `usePriceTypeIds`, currency suffix, stamps real PriceType ids) ·
  vat · uom · mxik · «Запретить скидки» checkbox.
- **Физ. хар-ки:** weight · volume · country.
- **Склад:** minimumBalance · paymentItemType.

**What already works (reusable):** folder + supplier pickers, barcode chips, per-type sale prices,
zod validation (localized), POST /products create + redirect to `/products/[id]`.

## Target (moysklad #good/edit) — rich 2-COLUMN form

Per the spec: **top bar** «Сохранить»/«Закрыть» + «Печать ▾»/«…»; **title** `* Наименование товара`;
**LEFT** stacked cards (Контент-маркетплейс[skip] · Изображения · Общие данные · Дополнительные поля ·
Особенности учета); **RIGHT** tab strip (Цены[active] · Модификации · Аналоги · Упаковка · Остатки ·
История · Файлы · Доп. расходы).

## Remaining flagships (priority order — each its own session)

| # | Flagship | Notes |
|---|---|---|
| 1 | ✅ **2-column shell + layout** (`d80e1c9b`) | DONE. Left card-stack + right tab strip built on `/new`. **Decision taken: /new-only + shared layout primitives, NOT a shared `<ProductForm>`** — the two pages genuinely diverge (per-type vs legacy default+wholesale prices; POST vs PATCH+optimistic-version+conflict-reload; toolbar/right-col/state), so unifying = a big-bang refactor of the working 875-line `[id]` page in a shared tree. New `apps/web/src/components/product-form-layout.tsx` (`ProductFormShell` + collapsible `ProductFormCard`) is shared so `[id]` can adopt the same shell later (**unify-later debt**). |
| 2 | **MoneyInput on prices** | replace raw-integer inputs (`1500000000`) with human-amount MoneyInput + currency dropdown (mirror the `[id]` editor's «Оптовая цена» MoneyInput + the «Изменить цены» currency work). Minor↔human conversion. |
| 3 | **«Особенности учета» card** | add Код упаковки ТАСНИф + Штрихкод ТАСНИф (BE ready — ProductPack, used by bulk-update item 5) · ИКПУ (have) · Фасовка · Неснижаемый остаток (have, relabel) · (ЕГАИС/Маркировка/Код вида = UZ-fiscal — ground whether the .uz account shows them active before building; may be out-of-market). |
| 4 | **Изображения card** | image upload (infra exists: ProductImage model · image controller · mainImageId · editor ImageGallery on `[id]`). |
| 5 | **Дополнительные поля** | account custom fields (доп.поля) — `[id]` detail already wires them; reuse. |
| 6 | **Right-column tabs** | Модификации · Аналоги · Упаковка · Остатки · История · Файлы — several already exist on `[id]`; most are empty/disabled for a brand-new product (moysklad shows them but inert pre-create). |

**Architectural recommendation (RESOLVED 2026-06-19):** the original idea was a shared `<ProductForm>`
for both pages. On evaluation that was rejected — the two pages diverge in substance, not just layout
(see flagship-1 row above), so it would be a big-bang refactor of a working 875-line page in a shared
tree (34-bug + shared-tree hazard). **Taken route:** build the shell on `/new` alone + extract shared
*layout primitives* (`ProductFormShell` / `ProductFormCard`). `/products/[id]` keeps its own
FormSection layout and can adopt the shell incrementally in a later flagship (unify-later debt).

## Reuse map (don't rebuild what exists)

- `apps/web/src/app/(app)/products/[id]/page.tsx` (875 lines) — tabs, B5 widget, MoneyInput, доп.поля, Упаковка.
- `usePriceTypeIds()` (`lib/sale-price.ts`) — per-account price types + currency.
- Image: ProductImage model · `/images/:id/raw` · `mainImageId` on the list API · `ImageGallery` on `[id]`.
- `MoneyInput`, `CatalogPicker`, `FormSection`, `FormField`, `NativeSelect`, `DetailToolbar`, `DetailHeader` (@moysklad/ui).
- BE `POST /products` already accepts: name, code, article, externalCode, description, country,
  productFolderId, supplierId, buyPrice, minPrice, **salePrices[{priceTypeId,value}]**, discountProhibited,
  barcodes, vat, uom, weightG, volumeML, minimumBalanceMinor, mxikCode, paymentItemType.

## Per-flagship checklist (every session)

1. **Live-ground** the relevant moysklad surface first (online.moysklad.uz, farrux@climart — restricted
   employee; read-only). Capture the exact field set / control types / order. (climart has a ~3-min
   connection limit + GWT-opaque DOM — screenshot is the authoritative basis per CLAUDE.md §4.)
2. Build the ONE flagship; reuse from the map above.
3. Gate: `pnpm --filter web typecheck` (your files clean) + `npx biome check <file>`.
4. **Browser-smoke** on :3100 (admin@demo.local/admin123): render + a real create round-trip
   (fill → Save → GET the created product → assert the new fields persisted), then clean up the test row.
5. Commit (honesty gate needs literal `live`/`smoke` + a count). Label **Phase-1 structural** until smoked.

## Shared-tree caution (parallel sessions active)

Stage ONLY your own files by explicit path; verify `git diff --cached` before AND `git show --stat`
after each commit; never `git add -A`/`commit -a`. `docs/progress.json` is hook-regenerated (expected
in every commit). Other sessions own counterparties/moves/customer-orders/purchase-orders.

## Then: `/products/[id]`, `/price-lists`, Import/Export

After `/new`, the rest of ITEM 6 (per `products-STATUS-2026-06-19.md` §3): `/products/[id]` detail card
(tab-by-tab), `/price-lists` (+ `[id]`/`new`), and Import/Export (absent feature — scope with the user,
adversarial-QA the file/timeout/race/mapping per global CLAUDE.md before building).
