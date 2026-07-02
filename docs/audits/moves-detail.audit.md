# moves/[id] — detail page parity audit

- **Module:** `moves` (Перемещение — internal warehouse transfer) detail/edit page (`apps/web/src/app/(app)/moves/[id]/page.tsx`)
- **Date:** 2026-06-01
- **Protocol:** v2.2 detail-page audit (5th detail page; template = `scripts/wf-moves-detail-audit.js`, mirrors demands/supplies)
- **Reference:** `docs/moysklad-reference/moves/detail/` — **clean live capture** via `pnpm capture-moysklad moves --detail`.
  Toolbar dropdowns (Изменить/Печать/Отправить), the two tabs (Главная/Связанные документы) and the edit-form DOM
  captured cleanly. The «Создать документ» dropdown capture "failed" — **correctly**, because a move has no such
  button (0 occurrences of «Создать» in the edit DOM). Файлы/Задачи/События tab captures also "failed" — correctly,
  because they are inline sections, not tabs.
- **Method:** 6-dimension fact-gathering workflow (`moves-detail-audit`, 6 parallel agents) → operator (Opus) judged
  each delta. Locale = Russian (`ru.json`). Agents distinguished VISIBLE columns (PNG) from DOM-only GWT artifacts.

## Verdict

A move mirrors the demand/supply position-document template and already carries the shared sweeps (RU PositionEditor
labels). It had the **same two systemic deltas** (Tab-1 «Позиции»→«Главная», missing inline «Задачи»), plus a cluster
of **moves-specific i18n leaks** the prior position-docs didn't have: hardcoded overhead labels, the comment field
resolving to «Описание» instead of «Комментарий», and the store labels reading «Склад-источник»/«Склад-получатель»
instead of moysklad's «Со склада»/«На склад». All fixed this session. One **cross-cutting** delta surfaced here for
the first time — the author-block label is «Изменения» in moysklad, our shared key was «Изменено» — fixed in the
shared component (improves all detail pages). Remaining deltas are backend/print-template/shared-structure, mirroring
customer-orders/demands/supplies.

## A. Structural

| # | Element | moysklad | ours | Status | Sev | Disposition |
|---|---|---|---|---|---|---|
| S1 | Tab-1 label | «Главная» | was «Позиции» (default, no `positionsLabel`) | delta | high | **FIXED** — `positionsLabel={tDetailTabs('main')}` (systemic S1) |
| S2 | «Задачи» surface | inline section (+ Задача / Нет задач) | **entirely absent** (no `DocumentTasksSection`) | missing_in_ours | high | **FIXED** — added inline `<DocumentTasksSection entity="Move">` (`Move` ∈ server `TASK_ENTITY_WHITELIST`) |
| S3 | «Со склада» field label | «Со склада» | was «Склад-источник» (`fields.source_store`) | delta | high | **FIXED** — new `fields.store_from`=«Со склада» (shared `source_store` key left intact for invoices-out/internal-orders/processing-orders) |
| S4 | «На склад» field label | «На склад» | was «Склад-получатель» (`fields.destination_store`) | delta | high | **FIXED** — new `fields.store_to`=«На склад» (shared key untouched) |
| S5 | Комментарий field label | «Комментарий» | was «Описание» (`tCommon('description')`) | delta | high | **FIXED** — `tFields('description')`=«Комментарий» (matches demands/supplies/customer-orders + moysklad; moves was the odd one out) |
| S6 | Overhead labels | «Накладные расходы» / «Распределить … по цене» | hardcoded RU literals «Накладные расходы» / «Распределять по» + «по весу/цене/объёму/количеству» | delta | med | **FIXED (i18n leak)** — `tDetailForm('overhead_sum'/'overhead_distribution'/'overhead_by_*')` (mirror supplies). Wording «Распределять по» vs moysklad inline «Распределить … по цене» + below-tabs placement = DEFERRED (shared layout) |
| S7 | Tab strip set | 2 tabs: «Главная» + «Связанные документы» (Файлы/Задачи inline, no История/События) — confirmed | Главная(fixed) · Связанные · **Файлы** · **История** | delta | med | DEFERRED — Файлы promoted to tab + extra История tab; shared `DetailContentTabs` = customer-orders/demands/supplies S3 |
| S8 | Position columns | Наименование · Кол-во · **Остаток (со склада)** · **Остаток (на склад)** · **Цена** · **Сумма** (visible); Себестоимость/Вес/Объем DOM-only | `mode="qty-only"`: № · Наименование · Кол-во | partial | med | DEFERRED — stock columns (per-store stock lookup) + Цена/Сумма (move cost) are backend; qty-only is the intentional UI baseline. Себестоимость/Вес/Объем are hidden GWT artifacts (not real deltas) |
| S9 | Totals | Итого (visible); Промежуточный итог/Прибыль/Цена включает НДС DOM-only | none (qty-only, no DetailTotalsSidebar) | delta | med | DEFERRED — needs position sums (backend). «Прибыль» on an internal move is a meaningless hidden artifact → correctly NOT implemented |
| S10 | «Валюта документа» | required field «сум (UZS)» | absent | missing_in_ours | low | DEFERRED — app is UZS-only single-currency; a picker has no functional role |
| S11 | «Дата проведения» | not shown on the move edit form | shown (disabled) | extra_in_ours | low | KEPT — consistent with demands/supplies (both show `posted_at`); removing is a cross-page decision, not moves-specific. moysklad shows posting time in the title «от …» |
| S12 | «№» row-number column | checkbox-select column instead | leading «№» counter | extra_in_ours | low | DEFERRED — shared `PositionEditor` always renders «№» |
| S13 | Field order / row pairing | R1 Орг\|Со склада · R2 На склад\|Проект · R3 Валюта; comment/overhead below tabs | different pairing; overhead/comment in meta panel | delta | med | DEFERRED — shared layout (meta-panel vs below-tabs) |

## B. Interactive

| # | Element | moysklad | ours | Status | Sev | Disposition |
|---|---|---|---|---|---|---|
| I1 | Save / Close / pager | «Сохранить» / «Закрыть» / «N из M» | same (shared `DetailToolbar`) | match | — | parity ✓ |
| I2 | «Создать документ» button | **absent** (a move spawns no related docs) | **absent** (no `createMenuItems`) | match | — | **parity ✓** — `DetailToolbar` only renders the dropdown when `createItems.length>0` |
| I3 | «Изменить» items | { Удалить, Копировать } | Копировать · **Открыть в API** · Удалить | delta | low | DEFERRED — «Открыть в API» intentional dev superset (= supplies I2); item order differs (shared `DetailToolbar`) |
| I4 | «Печать» items | 5: ТОРГ-13 · Ценник (70x49,5мм) · Термоэтикетка (58х40мм) · Комплект... · Настроить... | «Список заказов» (disabled, mislabeled) + «Настроить...» | delta | high | DEFERRED — 4 named print forms need the per-doc print-template system (= customer-orders I7 / supplies I4). «Список заказов» is the mis-scoped shared default. «Настроить...» = ASCII «...» byte-match ✓ |
| I5 | «Отправить» items | 2: ТОРГ-13 · Комплект... | «По электронной почте» (disabled) | delta | med | DEFERRED — moysklad forwards print forms by email; ours is a generic composer (shared `DetailToolbar`) |
| I6 | «Проведено» toggle | ☑ Проведено | ☑ Проведено (DetailHeader) | match | — | parity ✓ |
| I7 | Author block (avatar / name / «Основной») | shown | shown | match | — | parity ✓ |
| I8 | Modified-by label | «Изменения: <name> <date>» | was «Изменено: <name> <date>» | delta | med | **FIXED (shared)** — `detail_header.changed` «Изменено»→«Изменения» (ru) / «O'zgartirilgan»→«O'zgarishlar» (uz). Affects ALL detail pages uniformly per moysklad; README + customer-orders comment synced |
| I9 | Status control | grey «Статус ▾» (tenant custom-statuses; demo has none) | colored FSM pill «Черновик/Проведён/Отменён ▾» | delta | med | DEFERRED — moysklad move statuses are user-defined custom statuses (not modeled); demo account has none → option set unverifiable |
| I10 | «?» help icon near status | shown | absent | missing_in_ours | low | DEFERRED — shared `DetailHeader` cosmetic affordance |
| I11 | Payment / shipment chips | **absent** (internal transfer) | **absent** (no `pillsSlot`) | match | — | **parity ✓** — verified 0 «оплач»/«отгру» in both reference tabs |
| I12 | Position actions | Добавить из справочника · Проверить комплектацию · Импорт ▾ | inline «Добавить позицию» + per-row picker | delta | med | DEFERRED — bulk catalog-add dialog / kit-check / Excel-import are functional features (backend/UX) |
| I13 | Custom-attributes block | none defined on demo account | `<AttributesEditor entity="Move">` (title i18n'd, renders null when empty) | match | — | parity ✓ (no metadata in demo → both empty) |

## Fixed this session

| Ref | Fix | File |
|---|---|---|
| S1 | Tab-1 «Позиции» → «Главная» (`positionsLabel={tDetailTabs('main')}` + `tDetailTabs` hook) | moves page |
| S2 | Added inline `<DocumentTasksSection entity="Move" entityId={data.id}>` (+ import) | moves page |
| S3/S4 | Store labels → «Со склада»/«На склад» via new `fields.store_from`/`store_to` (ru+uz); field labels, placeholders, picker titles | moves page + ru/uz.json |
| S5 | Комментарий: `tCommon('description')` («Описание») → `tFields('description')` («Комментарий») | moves page |
| S6 | Overhead i18n leak: hardcoded «Накладные расходы»/«Распределять по»/«по весу…» → `tDetailForm('overhead_*')` | moves page |
| I8 | Shared `detail_header.changed` «Изменено»→«Изменения» (ru) / «O'zgartirilgan»→«O'zgarishlar» (uz) — all detail pages | ru/uz.json + README + customer-orders comment |
| infra | `scripts/wf-*.js` added to biome ignore (Workflow-runtime top-level `return` contract, like `.claude/workflows`) → detail-audit wf templates now committable durably | biome.json |

**Gates:** web typecheck 0 · biome clean · web tests **1214 passed / 1 skipped** (no regression — the shared
`detail_header.changed` change broke nothing). **HALOL:** not browser-smoked (pure i18n/label/prop additive changes;
no logic touched). The 4 missing «Печать»/2 «Отправить» named forms and all position cost/stock columns are
backend/print-template features, deferred below.

## Deferred — backend / print-template / shared-structure (same classes as customer-orders/demands/supplies)

- **I4/I5** «Печать» 4 named forms (ТОРГ-13/Ценник/Термоэтикетка/Комплект...) + «Отправить» 2 forms — per-doc
  print-template system; «Список заказов»/«По электронной почте» are mis-scoped shared `DetailToolbar` defaults.
- **S8/S9** position stock columns (Остаток со/на склад) + Цена/Сумма + Итого total — backend (per-store stock +
  move cost). qty-only is the intentional UI baseline.
- **I12** position action buttons (Добавить из справочника / Проверить комплектацию / Импорт) — functional features.
- **S7** Файлы tab vs inline + extra История tab — shared `DetailContentTabs` restructure.
- **I3/I10** «Открыть в API» extra + «?» help icon + Изменить item order — shared `DetailToolbar`/`DetailHeader`.
- **I9** custom-status control vs FSM pill — moysklad tenant-custom statuses (not modeled; demo empty).
- **S10** «Валюта документа» — UZS-only single-currency app.
- **S11** «Дата проведения» extra — cross-page decision (demands/supplies also show it).
- **S13** field order / overhead+comment placement (meta-panel vs below-tabs) — shared layout.

## Note

The «Создать документ» dropdown capture timing-out is **correct behaviour**, not a capture bug: a Перемещение has no
such button in moysklad (verified 0 «Создать» in the edit DOM), and our page correctly omits it (parity ✓). Likewise
the Файлы/Задачи/События "tab not found" capture warnings confirm those are inline sections, not tabs. The store-label
fix deliberately introduced **move-specific** keys (`store_from`/`store_to`) rather than renaming the shared
`source_store`/`destination_store` keys, because those are also used by invoices-out/internal-orders/processing-orders
where moysklad's wording may differ — to be confirmed when those pages are audited (the moves **list** page columns
still use the old keys and are a follow-up).
