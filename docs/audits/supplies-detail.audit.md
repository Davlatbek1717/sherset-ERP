# supplies/[id] — detail page parity audit

- **Module:** `supplies` (Приёмка) detail/edit page (`apps/web/src/app/(app)/supplies/[id]/page.tsx`)
- **Date:** 2026-06-01
- **Protocol:** v2.2 detail-page audit (3rd detail page; template = `demands-detail.audit.md`)
- **Reference:** `docs/moysklad-reference/supplies/detail/` — **clean live capture** via `pnpm capture-moysklad supplies --detail`
  (the new `--detail` mode). Supply opened in moysklad's new table design behind a «Попробуйте новый дизайн» modal;
  the capture switches to «Старый дизайн» (classic) so the reference matches our clone + the demand reference.
- **Method:** operator (Opus) judged each delta directly from the clean capture (metadata dropdown dumps + edit-default
  DOM/screenshot + 2 tabs). Locale = Russian (`ru.json`).

## Verdict

Приёмка mirrors the demand template and already carries the shared fixes (RU position labels, Close=«Закрыть»,
AttributesEditor i18n, customs ГТД/Страна columns). It had the **same three demand-specific deltas**, all fixed this
session. Remaining deltas are *backend/design*, mirroring customer-orders/demands.

## A. Structural

| # | Element | moysklad | ours | Status | Sev | Disposition |
|---|---|---|---|---|---|---|
| S1 | Tab-1 label | «Главная» | was «Позиции» | delta | high | **FIXED** — `positionsLabel={tDetailTabs('main')}` |
| S2 | «Задачи» surface | inline section (+ Задача) | **entirely absent** | missing_in_ours | high | **FIXED** — added inline `<DocumentTasksSection entity="Supply">` (`Supply` ∈ `TASK_ENTITY_WHITELIST`) |
| S3 | Tab strip set | 2 tabs: «Главная» + «Связанные документы» (Файлы/Задачи inline, no История/События) — confirmed | Главная(fixed) · Связанные · **Файлы** · **История** | delta | med | DEFERRED — 2 extra tabs; shared `DetailContentTabs` = customer-orders S3 |
| S4 | Position columns | Наименование · Маркировка · Принято · Остаток · Цена · НДС · Скидка · Сумма · **ГТД · РНПТ · Страна** | product · qty · price · discount · vat · lineTotal + **ГТД · Страна** (customs) | partial | med | PARTIAL — ours has ГТД+Страна (customs config ✓); missing Принято/Остаток (stock, backend) + РНПТ. = customer-orders S7 |
| S5 | «Входящий номер» + date | present (inbound doc field) | present (`incomingNumber`/date) | match | — | parity ✓ (legit for an inbound Приёмка) |
| S6 | Контрагент «Баланс: 0,00 сум» sub-line | shown | absent | missing_in_ours | med | DEFERRED — counterparty balance fetch (backend) = customer-orders S6 |
| S7 | Totals | Промежуточный итог / НДС / Цена включает НДС / Итого + Накладные расходы | same + Накладные расходы | match | — | parity ✓ (overhead present) |
| S8 | New-design availability | moysklad offers a new table design (Позиции tab + РНПТ); we mirror classic | classic only | note | low | DEFERRED — moysklad mid-rollout; classic is the parity baseline for now |

## B. Interactive

| # | Element | moysklad | ours | Status | Sev | Disposition |
|---|---|---|---|---|---|---|
| I1 | Save/Close/pager | «Сохранить»/«Закрыть»/«N из M» | same | match | — | (Close + pager fixed shared earlier) |
| I2 | «Изменить» items | {Удалить, Копировать} | Копировать · **Открыть в API** · Удалить | delta | low | DEFERRED — «Открыть в API» intentional dev superset; shared `DetailToolbar` |
| I3 | «Создать документ» items | **7**: Счёт поставщика · Счёт-фактура полученный · Исходящий платёж · Расходный ордер · Возврат поставщику · Отгрузка · Перемещение | was 2, **mislabeled** («Отгрузки» for a purchase-return, «Приходные ордеры» for a payment-out) | delta | high | **FIXED (structure+labels)** — now 7 in moysklad order; Исходящий платёж + Возврат поставщику functional, other 5 disabled label-parity placeholders. Wiring them = DEFERRED (backend). |
| I4 | «Печать» items | 5: Приходная накладная · Ценник · Термоэтикетка · Комплект... · Настроить... | «Список заказов» + «Настроить...» | delta | med | DEFERRED — needs per-doc print templates; «Список заказов» is the mis-scoped shared label (= customer-orders I7). «Настроить...» = ASCII «...» (byte-match). |
| I5 | «Отправить» items | 2: Приходная накладная · Комплект... | По электронной почте | delta | low | DEFERRED — moysklad sends print forms by email; ours has a generic composer (functional superset) |
| I6 | Position customs (ГТД/Страна) | ГТД + Страна columns | ГТД + Страна (customs config) | match | — | parity ✓ |
| I7 | Status pill + «Проведено» + «?» help | colored pill + ☑ Проведено + «?» | pill + ☑ Проведено (no «?») | delta | low | DEFERRED — help tooltip (shared DetailHeader) |

## Fixed this session

| Ref | Fix | File |
|---|---|---|
| S1 | Tab-1 «Позиции» → «Главная» (`positionsLabel={tDetailTabs('main')}`) | supplies page |
| S2 | Added inline `<DocumentTasksSection entity="Supply">` | supplies page |
| I3 | «Создать документ» 2 mislabeled → 7 items in moysklad order (Исходящий платёж / Возврат поставщику functional; +5 disabled placeholders); fixed the «Отгрузки»/«Приходные ордеры» mislabels | supplies page + new `create_related.facture_in` (ru+uz) |

**Gates:** web typecheck 0 · biome clean · web tests pass — no regression. **HALOL:** not browser-smoked (additive
menu items + label/prop). The 5 new «Создать документ» entries are disabled placeholders pending backend.

## Deferred — backend / design (same as customer-orders/demands)

- **S4** position stock columns (Принято/Остаток) + РНПТ — backend; shared `PositionEditor`.
- **I3 (remaining)** wire the 5 disabled «Создать документ» placeholders to from-supply endpoints.
- **I4** «Печать» 5 named forms — per-doc print-template system; «Список заказов» mis-scoped shared label.
- **S6** Контрагент balance sub-line — backend.
- **S3** «Файлы» tab vs inline + «История» extra tab — shared `DetailContentTabs` restructure.
- **I2/I7** «Открыть в API» extra + «?» help icon — shared `DetailToolbar`/`DetailHeader` decisions.

## Note

The clean capture's `edit-default.png` retains the «Попробуйте новый дизайн» prompt in the top-right corner (it
re-renders after the design switch); it does not occlude the form, toolbar, tabs, or position table, and the DOM +
dropdown metadata are clean. moysklad uses «е» (no ё) in its «Создать документ» labels (Счет/платеж); our app uses
«ё» consistently — a known moysklad internal inconsistency, kept as-is for our app's consistency.
