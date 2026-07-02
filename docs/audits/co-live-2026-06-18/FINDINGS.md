# Customer-order — LIVE ground truth (climart account, 2026-06-18, NEW design)

Source: read-only walkthrough of the user's real `online.moysklad.uz`
(farrux@climart) via `tools/capture/co-*.mjs`. Account is on the **NEW design**
(blue table headers, white bg) — matches our clone's target. Screenshots in this
folder (`01-list` · `02-detail` · `03-sozdat-menu` · `04-izmenit-menu`).

## Toolbar (saved order detail = same editable form as /new)
`Сохранить` (green) · `Закрыть` · `1 из 30578` pager + ◄ ► · `Изменить ▾` ·
`Создать документ ▾` · `🖨 Печать ▾` · `✉ Отправить ▾` · [owner: «Бекзод Н. / Основной ▾»]
· «Изменения: Бекзод Н. + avatar».

### «Создать документ ▾» — 11 items (active on SAVED order; /new → «save first»)
1. Перемещение            🔴 (→ move, parallel-session domain)
2. Счет покупателю        ✅ (4b done → invoice-out)
3. Волна отбора           🔴 (picking wave — no such doc in our app yet)
4. Отгрузка               ✅ (4a done → demand)
5. Входящий платеж        ✅ (4c done → payment-in)
6. Приходный ордер        🔴 (cash-in / receipt order)
7. Предоплата             🔴 (prepayment)
8. Заказ поставщику       🔴 (→ purchase-order, PARALLEL-session domain)
9. Заказ поставщику (с учетом «доступно») 🔴 (PO variant)
10. Розничная продажа     🔴 (retail sale, parallel/retail domain)
11. Снабжение             🔴 (supply/procurement)
→ 3 done, 8 missing. ⚠️ CROSS-DOMAIN: #1/#8/#9/#10 create docs owned by other
parallel sessions (purchase-orders, moves, retail). My item navigates +
?fromCustomerOrder; the target /new's pre-fill may need coordination.

### «Изменить ▾» — DETAIL = 2 items ONLY ✅ (confirmed via reliable MCP, 2026-06-18)
Detail toolbar «Изменить» = **Удалить · Копировать** (2 items). The earlier 8-item
dump (Массовое редактирование/Объединить/Провести/Снять проведение/Зарезервировать/
Очистить резерв) was the **LIST bulk-«Изменить» menu** (multi-select), NOT the detail.
So the old checklist (#3a/#3b) was right. On /new: Удалить disabled, Копировать N/A.

### «Печать ▾» / «Отправить ▾» (confirmed via MCP)
Items: [account custom templates, e.g. «Чек_сум_(FerroSoft)» = climart DATA, NOT
clonable] · **Заказ** (default) · **Комплект…** (комплектация) · **Настроить…**
(Печать only). Отправить = same templates emailed. Our build: default «Заказ» +
«Настроить» + render account templates dynamically.

### Reliable LIVE-capture method (use this, scripts were flaky)
MCP browser (parallel-safe `--isolated`): login online.moysklad.uz form
`j_username`/`j_password`/`#submitButton` → `#customerorder` → snapshot, click an
order-number cell by ref (opens `edit?id=…` in-place) → toolbar buttons get stable
refs (Сохранить/Изменить/Создать документ/Печать/Отправить) → click → snapshot menu.
GWT list grid has NO `<a>`/`<td>` (canvas) so scripted row-clicks are unreliable;
the MCP accessibility tree DOES expose rows (`cell "03837"`) — use refs.

## Positions table columns (this account's column config)
#, **Наименование ▾**, Кол-во, **Зарезерв.**, Остаток, **Цена ▾**, НДС, Сумма НДС,
Скидка, **Сумма ⚙**. (Note: this account shows «Зарезерв.» as a column; «Доступно»/
«Вес» not shown here — column-customizer dependent.)

## Header / meta (matches our build closely)
№ + от (date+time+📅) · «Текширилмаган ▾» custom status (red) · ❓ · ☑ Проведено ·
Запросить оплату. Meta: Организация(+Сум acct) · Контрагент(+Баланс) · План.дата
отгрузки · Канал продаж · Валюта · Уста(custom) · Санаси(custom) · [Склад · Договор ·
Проект · Счёт контрагента behind menu] · Адрес доставки · Комментарий. Footer:
Промежуточный итог · ☑НДС · ☑Цена включает НДС · Итого · Кол-во. Задачи/Файлы disclosures.

## Execution priority (in-domain first, cross-domain coordinated)
1. **«Изменить» menu → 8 items** (in-domain, /[id]) — biggest accurate gap.
2. **«Создать документ» → in-domain targets** (Приходный ордер/cash-in, Предоплата,
   Снабжение/supply) — navigate + pre-fill.
3. **Cross-domain targets** (Перемещение, Заказ поставщику ×2, Розничная продажа) —
   menu item + navigate; pre-fill coordinated with the owning session.
4. **Волна отбора** — no such doc subsystem yet (defer / scope decision).
5. /new gating: menus show all items but «save first» when unsaved.

## «Добавить из справочника» → «Выбор товара» modal (LIVE, screenshot 05)
- Title «Выбор товара» + 🔄 + «Создать ▾» (green) + «Фильтр» + search «Наименование, код или артикул» + ✕.
- **Filter panel is OPEN by default** in this account — a full field grid (NOT a closed button):
  Наименование · Остаток(Любой) · Доступно(Любое) · Только с резервом(Нет) · Только с ожиданием(Нет) ·
  Описание · Артикул · Код · Внешний код · Штрихкод · Код ЕГАИС · Весовой товар · Тип(Все) ·
  Группа товаров(без подгрупп) · Поставщик. Buttons: Найти(green)·Очистить·🔖·⚙. (• bullet on some
  labels = optional/addable filter.)
- Left folder tree «Товары и услуги» + groups (Азия Бест Строй … Роял; ▸ = expandable subgroups).
- **Table columns (default):** [thumb] · Наименование▲ · Количество(input) · Остаток · Резерв · Ожидание ·
  Доступно · Код · Артикул · Ед.изм. · **Страна** · (scroll →) Вес · Объем · Учет по серийным номерам ·
  НДС · **Розночная цена + Оптовая цена** (TWO price-type cols).
- Footer: «Выбрать» (green) · «Отменить».
- ⚠️ vs OURS (verified earlier this session): ours opened with Фильтр CLOSED, no «Страна» col, 1 price-type
  col. Real = filter-open + Страна + 2 price types. → behaviour/layout gaps to reconcile (NOT presence).

## Honest status (per feedback-visual-parity-not-functional-parity)
This is PARTIAL live grounding (toolbar menus + the product modal). NOT yet walked: every meta dropdown's
type-to-filter/options, the ✎ pencil edit-modals, owner «Владелец» popover, Печать/Отправить menu contents,
position «Наименование▾» + «Цена▾» menus, column-customizer DEFAULT set, row-hover actions, layout-FILL
(do columns stretch to container width?), locale, and ADDED-non-moysklad audit. True 1:1 across list+/new+/[id]
is a large multi-session effort. I will report verified-vs-unverified only; the USER declares parity.


## ⭐ DESIGN DECISION (user, 2026-06-18): target the NEW design
User picked moysklad's NEW design (the «Попробуйте новый дизайн» variant) for the
customer-order document. Captured live (screenshots co-design-new2.png). The NEW
design differs structurally from our current clone (which mirrors the OLD form):

- **5 TABS** replace the old «Главная/Связанные»: «Позиции · Связанные документы N ·
  Файлы · Задачи · События». Задачи/Файлы are now TABS, not bottom disclosures; new «События».
- **Positions area = a toolbar row above the table:** «Все N · Расценить · Сохранить
  цены · Скидка · [search Shift+Ctrl+F] · ⟦НДС toggle⟧ · ⟦Цена включает НДС toggle⟧ · ⚙».
  «Проверить комплектацию» + «Добавить из справочника» sit top-right of the positions tab.
- **Per-row ⋮ kebab** (Дублировать/Удалить) replaces the bare row ✕.
- Header: «от» date in a bordered box; «✓ Оплачено» green-check pill; green status
  dropdown «Туланди Накт ▾»; ❓ + «☑ Проведено».
- Meta 3-region: LEFT (Организация+Сум, Контрагент+Баланс, План.дата, Канал, Валюта,
  Уста, Санаси) · MIDDLE (Склад, Договор, Проект) · RIGHT (Адрес доставки, Комментарий).
- Toolbar unchanged (Сохранить/Закрыть/Изменить/Создать документ/Печать/Отправить/owner).

### Scope implication (honest)
Targeting NEW = a substantial REDESIGN of the document form, and most of it lives in
SHARED components (DocumentEditor/DocumentHeader/PositionTable — 26/17+ consumers) used
by ~26 other doc /new pages owned/edited by the parallel sessions. Architectural choice
needed: (a) make a CO-specific new-design form (diverge from the shared framework), or
(b) evolve the shared framework to the new design (affects all 26 doc pages → must be
coordinated across the 4 sessions). Either way this is multi-session + cross-session
coordination, NOT a single-session in-domain build. The earlier «converge /[id]→/new»
plan assumed the OLD design; with NEW chosen, BOTH /new and /[id] move to the new design.
