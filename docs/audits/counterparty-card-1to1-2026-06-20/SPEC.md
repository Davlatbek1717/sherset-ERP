# Counterparty CARD — live-grounded 1:1 spec (2026-06-20)

Logged into the REAL climart account (`farrux@climart_santex_group`, online.moysklad.uz, read-only
walkthrough) to ground the counterparty card/form against my clone. Evidence screenshots in this folder:
`ms-cp-list-live.jpeg` (list), `ms-cp-card-live.jpeg` (real moysklad card), `clone-cp-card.jpeg` (my clone).

## LIST — already 1:1 ✅ (confirmed live)
Toolbar «Контрагент»/«Фильтр»/search/«Изменить ▾»/«Статус ▾»/«Печать ▾»/«Создать задачи»; filter row
Создан · Дата события · Текст события · Наименование · Телефон · Адрес · Показывать · Баланс · Статус ·
Владелец-сотрудник · **Усто** · **tgid**; columns Наименование · Телефон · Статус · Фактический адрес ·
Комментарий · **Группы** · Последняя продажа · Количество продаж · Баланс · Когда изменен · tgid · ⚙.
All present in my clone. Status pill («Новый» orange) + Группы membership pills («усто сантехник») match.

## CARD — NOT 1:1 ❌ (structural layout gap = the remaining work)

| | REAL moysklad (`ms-cp-card-live`) | My clone (`clone-cp-card`) |
|---|---|---|
| Layout | **2-column** | **single-column stacked** |
| Title | `* Наименование` IS the top input (no title row) | title «Усто…» + type-badge + Arxivlash/Faol row, THEN a separate «Nomi» field (duplicated) |
| Left col | collapsible cards: **«Налоги»** (▶) · **«О контрагенте»** (▼) · (Контактные лица · Реквизиты below) | n/a — flat `FormSection`s full-width |
| Field labels | **label-LEFT** (label left, field right) | **label-TOP** (label above field) |
| «О контрагенте» fields (in order) | **Статус** (orange dropdown) · **Группы** (+? help) · Телефон · Факс · Электронный адрес · Фактический адрес · Комментарий к адресу · Комментарий · Код | scattered: Статус in its own section, Группы separate, access separate; «Asosiy ma'lumotlar» instead holds Nomi/Тип/Цены/То'liq nomi/manzillar |
| Right col | **tabs**: События · Задачи · **Документы** (active, shows a docs table) · Файлы · Показатели — BESIDE the form | activity widget STACKED at the very bottom |

### Status MANAGEMENT placement (FIX#2 caveat — now grounded)
moysklad manages CRM statuses **inline**: «Статус» is a coloured dropdown ON the card (and the list
toolbar «Статус ▾»); the editor is reached via «Настроить…» INSIDE that dropdown. There is **no
«Настройки → Статусы контрагентов» Settings page** in moysklad. My `/settings/counterparty-statuses`
page is functionally complete + a useful admin surface, but the moysklad-exact entry point is the
inline «Настроить…». (Our clone's `/settings/customer-order-statuses` has the same non-1:1 placement —
a consistent clone choice, not moysklad-parity.)

### Access (Владелец/Отдел/Общий доступ) — FIX#5 confirmed correct
Counterparty has real `owner`/`group`/`shared`/`state` fields (API-confirmed). moysklad's create =
edit form (same `#company/edit`), so the create form DOES expose Статус + Доступ — my FIX#5 (adding
them to /new) is correct 1:1. On the moysklad card the access fields live in a lower section (not the
top «О контрагенте» card); my clone's «Доступ» FormSection is the right idea, placement to refine in
the 2-col rebuild.

## Rebuild plan (next focused flagship — same scale as products/new 2-col shell)
1. 2-column shell: top full-width `* Наименование` input + LEFT collapsible cards + RIGHT activity tabs.
2. LEFT card «О контрагенте» = Статус (dropdown) + Группы (+help) + Телефон/Факс/Email/Адрес/Комментарии/Код,
   **label-LEFT**. Other left cards: «Налоги», «Контактные лица», «Реквизиты», «Доступ».
3. RIGHT = move the existing `CounterpartyActivityWidget` (События/Задачи/Документы/Файлы/Показатели)
   from the bottom into the right column as tabs.
4. (smaller, optional) inline «Настроить…» in the «Статус» dropdown → opens the status editor as a modal
   (reuse the /settings/counterparty-statuses logic) for moysklad-exact status management.
- Risk: this is a big-bang refactor of the working ~900-line edit form — do it as a dedicated flagship
  (the products/new lesson: rebuild deliberately, not at a session tail). New + edit should share the shell.

## PROGRESS (2026-06-20 — same session, after grounding)
- ✅ Increment 1+2 (`commit, counterparty-form-layout` + 2-col): card is now 2-column — left form
  cards + right activity tabs (was single-column stacked). Browser-smoke :3100.
- ✅ Increment 3a (`c1d40ff7`): 6 left sections → collapsible CounterpartyFormCard (chevron
  disclosure, like moysklad). Browser-smoke: 6 cards + 5 right tabs. STRUCTURALLY 1:1 now.
- ✅ LAST-MILE done on /[id] (Increment 3a `c1d40ff7`): single top «О контрагенте» card
  (Статус · Группы · contacts · Код), «* Наименование» in the shell top slot, DetailHeader
  dropped for a minimal author block.

## /new REBUILT (2026-06-21 — commit `58df1afd`)
Applied the same 2-column shell to `/counterparties/new`, mirroring /[id] (live-grounded fresh
against the real moysklad NEW form, `ms-cp-new-live-2026-06-21.jpeg` + `ms-cp-new-scroll-…`):
- top «* Наименование» + LEFT label-LEFT cards (О контрагенте / Основные / УЗ Реквизиты /
  Идентификаторы / Доступ / Доп.поля) + RIGHT activity tabs (empty pre-save, counterpartyId=null).
- toolbar trimmed to Сохранить + Закрыть (new opt-in `DetailToolbar.hidePrintMenu`); moysklad's
  counterparty create has no Изменить/Печать/Отправить.
- added «Комментарий к адресу» (addInfo) for parity; preserved dual-mode inputs + Статус/Доступ/
  Группы/custom-attrs. header-conventions guard: counterparties/{new,[id]} → PAIRING_EXEMPT.
- Live cert :3100: create round-trip POST→201→/[id] persisted name+phone(E.164)+addInfo, 0 console-err.

## ⏳ NEXT (paired /new + /[id] — keep them consistent, moysklad uses ONE form)
The fresh NEW-form grounding (`ms-cp-new-scroll-2026-06-21.jpeg`) shows moysklad's REAL left-card
grouping differs from our current split. Regroup BOTH pages together (NOT one, or create↔edit drift):
- **«Реквизиты»** = Тип контрагента · ИНН · Полное наименование · Юридический адрес · Комментарий
  к адресу · ОКЭД · + Расчётный счёт  (we split these across Основные / УЗ Реквизиты today).
- **«Скидки и цены»** = Цены (price type) + discount-card  (we keep Тип цен in Основные).
- **«Контактные лица»** card (collapsed on NEW) · **«Налоги»** card (top; we have no tax model — DEFER, §4).
- «О контрагенте» ends with Код + Внешний код (we keep Внешний код in Идентификаторы).
Risk: moving ~8 wired field blocks between cards on BOTH pages — typecheck + browser-smoke per card.
