# purchase-orders LIST — remaining gaps to 100% (live-grounded 2026-06-18, climart)

Audit found the STRUCTURE matches (toolbar 3 dropdowns after «Отправить» revert `3bf77728`,
13 columns, 24 filter fields, menu contents, header #186999/11px + label #222/12px). But the
user (correctly) found these BEHAVIOUR/INTERACTION/SCOPE gaps my audit missed — visual≠functional:

## 1. Filter fields — picker INTERACTION + modal appearance ⬜ NOT DONE
- moysklad filter reference-fields support **type-to-search AND open a picker on click**.
  - `Товар или группа` → the **rich «Выбор товара» modal** (+ Товар / + Услуга / + Группа,
    Фильтр, search, left group-tree, right table w/ thumbnail·Код·Артикул·Ед.изм·Розничная·Оптовая
    price cols + ⚙). Screenshot: user 2026-06-18.
  - `Группа контрагента` → a **checkbox multi-select dropdown** (курувчи · мижозлар · таминотчилар …).
  - `Контрагент`, `Склад`, `Проект`, `Договор`, `Организация`, owners … → reference pickers.
- OUR filter pickers differ from moysklad's (the «yana shu xato» — same class as the CO catalog modal
  in [[feedback-visual-parity-not-functional-parity]]). NEEDS: per-field grounding of picker TYPE
  (type-search / checkbox-dropdown / rich-modal) + match the modal to moysklad.

## 2. Totals footer — ALL-PAGES + PINNED ⬜ NOT DONE
- moysklad: a **pinned (sticky) bottom row** with column-aligned sums computed across **ALL filtered
  records** (e.g. Сумма 39 449 376 181,33 · Выставлено 14 154 840 · Оплачено 893 637 287,85 · Принято
  23 939 538 362,45 · В ожидании 89 338 613,12 over all 2 361) + «1-100 из 2 361» pager beside it.
- OURS: `footerRow` sums only the VISIBLE 100 rows; not all-pages; pinning unverified.
- FIX: add BE `GET /purchase-orders/aggregate/totals?<filters>` (mirror customer-order
  `aggregateTotals` — extract a shared list-WHERE builder so totals respect the active filter set);
  wire FE `footerRow` to the aggregate; make the footer sticky. ⚠️ pinning is in parallel-owned ListView.

## 3. Toolbar action buttons JOINED ⬜ NOT DONE
- moysklad: Изменить ▾ · Создать ▾ · Печать ▾ render as ONE **joined segmented group** (shared 1px
  borders, no gaps, radius only on the ends). OURS: separate buttons with `gap-2`.
- FIX: segmented-group styling. ⚠️ lives in parallel-owned ListView toolbar render.

## 4. Save-filter (🔖) + settings (⚙) buttons ⬜ NOT DONE
- Under «Найти / Очистить» moysklad shows 🔖 (save filter) + ⚙ (filter settings). User: should be
  right-placed, larger, and FUNCTIONAL. NEEDS grounding of exact placement/size/behaviour + wiring.

## Method note
GROUND EACH before building (the «Отправить» misground `143f2809`→revert `3bf77728` proves it). Live
moysklad capture tooling: `tools/capture/co-login.mjs` (refresh session from `.env.local`) then a
`*-capture.mjs` using `.credentials/moysklad-storage-state.json`. `po-capture.mjs` + `po-header-measure.mjs`
already exist. ⚠️ ListView.tsx owned by parallel session — coordinate or worktree-isolate for gaps #2,#3.
