# B5 / B6 design grounding — captured from LIVE moysklad (2026-06-13)

> Captured from the real paid moysklad (`online.moysklad.uz`, climart_santex_group,
> 5598 goods / 2962 counterparties) — the 04-module reference captures were
> contaminated, so these replace them as the ground truth for the two remaining
> Phase-3 refactors. Screenshots: `docs/moysklad-reference/_live-captures-2026-06-13/`.

## B5 — products/[id] card (`#good/edit`) — `product-card-tabbed-widget.png`

Two-column card.

**LEFT (collapsible form sections, in order):**
1. `*Наименование товара` (big title input at top, full width).
2. «Контент для разных торговых площадок» — AI marketplace-content banner + «Настроить» (skip / not parity-critical).
3. «Изображения» — image grid + «+ Изображение».
4. «Общие данные» (expanded by default): Описание · Группа · Страна · Поставщик · Артикул · Код ·
   Внешний код · Единица измерения · **Вес** · **Объём** · НДС.
5. «Неснижаемый остаток» (collapsed) — minimum-balance.
6. «Особенности учёта» (collapsed) — tracking/serial/markirovka.
7. «Штрихкоды товара» (collapsed).
8. «Доступ» (collapsed) — owner/department/shared.

**RIGHT — the tabbed widget (the B5 gap):** tabs in order —
**`Цены` · `Модификации (N)` · `Аналоги` · `Упаковка (N)` · `Остатки` · `История` · `Файлы (N)`**
- `История` (captured): two tables — **Закупки** (№·Тип документа·Время·Контрагент·Количество·Цена·Валюта)
  and **Продажи** (same columns) — i.e. this product's purchase + sale document history.
- `Модификации`/`Упаковка`/`Файлы` carry a count badge.
- (Our current products/[id] stacks prices in a LEFT section + audit tabs below — the right tabbed
  widget is entirely absent. B5 = build this right widget.)

## B6 — counterparties/[id] card (`#Company/edit`) — `counterparty-card-crm-widget.png`

Two-column card.

**LEFT (collapsible sections):**
1. `*Наименование` title input.
2. «О контрагенте»: **Статус** (editable dropdown, e.g. «Новый») · **Группы** (picker, `?` help) ·
   Телефон · Факс · Электронный адрес · Фактический адрес · Комментарий к адресу · Комментарий ·
   Код · Внешний код.
3. «Контактные лица» (collapsed).
4. «Дополнительные поля» (collapsed).
5. «Реквизиты»: Тип контрагента (e.g. «Юридическое лицо. Россия») · ИНН (+ «Заполнить по ИНН») ·
   Полное наименование · Юридический адрес · Комментарий к адресу · КПП · ОГРН · ОКПО · **«+ Расчётный счёт»**.
6. «Скидки и цены»: Цены · Номер диск. карты.
7. «Доступ»: Сотрудник · Отдел · Общий доступ (checkbox).

**RIGHT — the CRM activity widget (the B6 gap):** tabs —
**`События` · `Задачи` · `Документы` · `Файлы` · `Показатели`**
- `Документы` (captured): sub-tabs **Документы · Договоры · Операции с баллами**; a documents table
  (Тип документа·Номер·Время·Организация·Сумма·Валюта·Статус with status badges) + «Еще N документа»
  + «+ Документ» button.
- (Confirms inventory S13 «Статус» editable, S14 «Группы» picker (not free-text Метки), S15 «Доступ»
  editors, S17 the whole right widget, S18 «Расчётный счёт» CRUD — all real gaps.)

## Build notes (for the Phase-3 sessions)

- Both are LARGE: a tabbed right-widget + the data each tab needs (B5 Цены/Модификации/Остатки/История;
  B6 События/Задачи/Документы/Показатели). Most tabs need a backend feed (history = this entity's
  doc list; counterparty Документы = all docs referencing the agent; Показатели = aggregates).
- Sequence each as its own session: scaffold the right tabbed shell first (matches the captured tab
  set), then wire tabs one at a time against existing endpoints (history/docs lists mostly exist).
- LEFT-column gaps are smaller + independently shippable: B6 «Статус» editable dropdown, «Группы»
  picker (replace free-text Метки), «Доступ» editors, «+ Расчётный счёт» CRUD — each a bounded slice.
