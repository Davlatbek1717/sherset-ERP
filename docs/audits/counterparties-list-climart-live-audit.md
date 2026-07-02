# counterparties LIST — climart LIVE audit (2026-06-18)

**Ground-truth account = the USER'S OWN single account: `farrux@climart_santex_group`**
(`online.moysklad.uz`, new blue-header design). Live read-only audit. This SUPERSEDES the stale
repo capture `counterparties/states/01-default.png` (that was `admin@ozodbekmirgasimov1` — NOT the
user's account; the user confirmed "menda 1ta akk borku" = I have one account).

> ⚠️ moysklad's counterparty list is **per-user customizable** (⚙ gear) and the toolbar is
> **plan-gated**. So "1:1" = match THIS account's actual rendered view + offer the same gear column
> set. The ozodbek capture showed 16 cols + Рассылки/Импорт/Экспорт — climart does NOT; do not build
> from the ozodbek view.

## Toolbar (live-DOM confirmed, left→right)
`⊕ Контрагент` · `Фильтр` · search(«Наим, тел, email, событ, коммент, ко…») · `0` counter ·
`Изменить ▾` · `Статус ▾` (disabled until row-selection → BULK set CRM status) · `🖨 Печать ▾` ·
`Создать задачи`.
- **NO «Рассылки», NO «Импорт», NO «Экспорт»** in climart's toolbar (those were ozodbek-only).
- ⚙ column-settings gear sits at the **grid header right end**, not the toolbar.

### Toolbar menu contents (to capture live in the build session — partial)
- `Изменить ▾` (ozodbek metadata, re-confirm on climart): Удалить · Копировать · Массовое
  редактирование · Поместить в архив · Извлечь из архива · Объединить.
- `Статус ▾`: bulk-set CRM State on the selected counterparties (disabled w/o selection).
- `Печать ▾` (ozodbek metadata): Список контрагентов · Список контрагентов (Узбекистан) · Настроить…
- `Создать задачи` — **LIVE-CAPTURED 2026-06-18** (right-side drawer «Создание N задачи»,
  "Заполненные параметры применятся ко всем созданным задачам" — bulk-creates ONE task per selected
  counterparty). Fields:
  - **Описание задач*** (required textarea, placeholder «Опишите, что надо сделать для всех задач»)
  - **Срок выполнения** (due-date picker, default «Не ограничен»)
  - **Тип задач** (select, «Выберите тип» — from settings task-types)
  - **Исполнитель*** (required select, default «Владелец-сотрудник» → hint «В каждой задаче
    подставится владелец контрагента»)
  - **Связи с контрагентами** (section — links each task to its counterparty)
  - Buttons: **«Создать N задачу»** (primary) · **«Не сейчас»** (cancel)

## Pixel grounding (measured live via getComputedStyle, climart new design)
- **Grid header cell**: color `#186999` (rgb 24,105,153) · 11px · weight 400 · text-transform none · Tahoma.
- **Data cell**: color `#222` (rgb 34,34,34) · 11px · weight 400 · row height **30px** · border-bottom
  `0.8px solid #ddd` (rgb 221,221,221) · Tahoma.
- **Name cell**: plain `#222` · 11px · weight 400 · **NO underline** (it is clickable but NOT a blue
  link — our app renders it blue/medium/hover-underline → MISMATCH, fix to plain dark).
- **«Группы» badge**: light-blue pill — bg `#e4f1fa` (rgb 228,241,250) · text `#186999` · 11px ·
  border-radius 10px · padding 0 6px (our app uses a gray `<Badge tone="neutral">` → MISMATCH).

## ⚙ Column customizer — FULL available set (climart, in gear order)
✅ = default-visible (checked). 43 columns total (incl. 2 account-custom fields):

| # | Column | default | maps to our field |
|---|--------|:---:|---|
| 1 | Наименование | ✅ | name |
| 2 | Код | ☐ | code |
| 3 | Создан | ☐ | createdAt |
| 4 | Телефон | ✅ | phone |
| 5 | Факс | ☐ | fax |
| 6 | E-mail | ☐ | email |
| 7 | Дата рождения | ☐ | (no field) |
| 8 | Пол | ☐ | (no field) |
| 9 | Статус | ✅ | state (colored pill) |
| 10 | Дисконтная карта | ☐ | discountCardNumber |
| 11 | Фактический адрес | ✅ | actualAddress |
| 12 | Комментарий | ✅ | description |
| 13 | Группы | ✅ | group |
| 14 | Тип контрагента | ☐ | companyType |
| 15 | Полное наименование | ☐ | legalTitle |
| 16 | Юридический адрес | ☐ | legalAddress |
| 17 | ИНН | ☐ | uzRequisites.inn |
| 18 | ИНН (УЗ) | ☐ | uzRequisites.inn (UZ variant) |
| 19 | ПИНФЛ | ☐ | (no field) |
| 20 | КПП | ☐ | (no field) |
| 21 | Банк | ☐ | bankAccounts |
| 22 | Расчетный счет | ☐ | bankAccounts |
| 23 | Цены | ☐ | priceType |
| 24 | Общий доступ | ☐ | shared |
| 25 | Владелец-отдел | ☐ | group/owner dept |
| 26 | Владелец-сотрудник | ☐ | owner |
| 27 | Первая продажа | ☐ | computed (min demand moment) |
| 28 | Последняя продажа | ✅ | lastSaleDate (computed) |
| 29 | Количество продаж | ✅ | salesCount (computed) |
| 30 | Сумма продаж | ☐ | salesAmount |
| 31 | Средний чек | ☐ | averageCheck (computed) |
| 32 | Количество возвратов | ☐ | computed (returns) |
| 33 | Сумма возвратов | ☐ | computed (returns) |
| 34 | Сумма скидок | ☐ | computed (discounts) |
| 35 | Баланс | ✅ | balanceMinor (computed) |
| 36 | Прибыль | ☐ | computed (profit) |
| 37 | Баллы | ☐ | bonusPoints |
| 38 | Дата события (последнее) | ☐ | CRM event (not wired) |
| 39 | Текст события (последнее) | ☐ | CRM event (not wired) |
| 40 | Когда изменен | ✅ | updatedAt |
| 41 | Кто изменил | ☐ | (no modifiedBy on counterparty yet) |
| 42 | Усто | ☐ | ACCOUNT-CUSTOM attribute (climart-only) |
| 43 | tgid | ☐ | ACCOUNT-CUSTOM attribute (climart-only) |

**climart default grid order (10):** Наименование · Телефон · Статус · Фактический адрес ·
Комментарий · Группы · Последняя продажа · Количество продаж · Баланс · Когда изменен.

## Filter panel (climart, live)
Создан · Дата события (последнее) · Текст события (последнее) · Наименование · Телефон · Адрес ·
Показывать(«Только обычные») · Баланс(от/до) · Статус · Владелец-сотрудник · **Усто**(custom) ·
**tgid**(custom). (Our app's filter has a different/larger set from the ozodbek-era 11k work —
reconcile in a filter-parity pass.)

## Toolbar reconciliation status (2026-06-18)
Current app toolbar: Контрагент · Фильтр · Изменить · **Статус** · Печать · Импорт.
climart target:        Контрагент · Фильтр · Изменить · **Статус** · Печать · **Создать задачи**.
- ✅ «Статус ▾» — ALREADY built+wired (commit 503965da), renders in correct order, bulk-set-state
  BE endpoint live. (verified rendering on :3100 as «Holat».)
- ✅ «Экспорт» standalone button REMOVED — it was added off the stale ozodbek account; climart has none.
- ⚠️ «Импорт» — KEPT for now (standard feature; climart's absence looks plan-gated, not removed).
  Confirm with user whether to drop it for strict climart parity.
- ✅ «Создать задачи» — BUILT + live-certified end-to-end (86e7a747): toolbar button (correct order) +
  CounterpartyCreateTasksModal + BE POST /counterparties/bulk-create-tasks (one Task per selected cp,
  agentId=cp.id, assignee=cp.ownerId). Modal matches captured fields. Task persisted in /tasks.

TOOLBAR NOW = climart 1:1 (Контрагент · Фильтр · Изменить · Статус · Печать · Создать задачи) **+ extra Импорт** (flagged).

## Build queue to reach climart 1:1 (each = its own gated flagship)
1. **DONE**: default-visible cols → climart's 10 + add «Когда изменен» (updatedAt) col.
2. Gear must offer the full set above (add: Дата рождения/Пол/ИНН(УЗ)/ПИНФЛ/КПП/Банк/Расч.счет/
   Общий доступ/Владелец-отдел/Первая продажа/возвраты/скидки/Прибыль/Баллы/Кто изменил — many need
   backend data or are account-custom).
3. Toolbar: add `Статус ▾` (bulk set CRM state — new BE endpoint) + `Создать задачи` (link to Task).
   REMOVE `Импорт`/`Экспорт` from default toolbar to match climart? — confirm with user (Импорт is a
   standard feature; may be plan-hidden on climart, not absent).
4. `Дата/Текст события` need a CRM event-log source.
5. Account-custom columns (Усто, tgid) — these are per-account custom attributes; our app would model
   them via Counterparty.attributes, not as fixed columns.

## moysklad API ground-truth (2026-06-18, read-only token, GET /entity/counterparty/metadata)
Definitive data-model for the remaining gear columns:
- **States** (CRM «Статус»): «Новый» (#E67E16) · «Курувчи» (#999999) · «Карзга тел кил» (#E93A19).
  Our app supports counterparty States; the demo account just has none defined → empty column.
  (Seeding these 3 would make our «Статус» render like climart — but they're account-specific data.)
- **Custom attributes** (the «Усто» / «tgid» gear columns): «Усто» type=`counterparty` (a
  counterparty-LINK custom field — the master/usta relation), «tgid» type=`string`. Both are
  CUSTOM ATTRIBUTES → modelled in our `Counterparty.attributes` Json. Showing them as list columns
  needs a custom-attribute-column feature (moysklad's «Дополнительные поля»), NOT fixed columns.

### Gear-column build — FINAL state (2026-06-18, this session)
- ✅ DONE (40 standard columns): Первая/Последняя продажа · Количество продаж · Средний чек ·
  Прибыль · Количество/Сумма возвратов · Баланс · Банк · Расчетный счет · Кто изменил (migration
  add_counterparty_modified_by + stamping) · ИНН(УЗ) · Владелец-отдел · ПИНФЛ · КПП · Дата рождения ·
  Пол (uzRequisites JSON + create&edit form inputs, create live-certified) · Цены · Дисконтная карта ·
  Общий доступ · Баллы · Юр.адрес · … plus the climart-default 10.
- ✅ DONE (custom fields): dynamic «Дополнительные поля» columns — one per account-defined
  attribute-metadata (entity=Counterparty). «Усто» (counterparty-ref) / «tgid» (string) appear as
  columns once defined for the account (our demo defines none). This is moysklad-capable parity.
- ⬜ DEFERRED — «Сумма скидок» (1): DemandPosition stores discount as a PERCENTAGE only (no amount).
  The money sum = Σ(priceMinor × qty × discount/100) across positions needs a raw join + careful
  pre/post-discount semantics. Deferred on purpose — rushing it = silent-wrong money (the worst
  bug-class). Needs a dedicated money-grounded flagship.
- NOTE — «Статус» column shows data only once the account defines counterparty States (climart has
  Новый/Курувчи/Карзга тел кил; our demo has none) — account data, not code.

**NOT done — Phase-1 ground-truth only. No feature here is browser-smoke certified.**
