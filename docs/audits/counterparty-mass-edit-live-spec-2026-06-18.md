# Counterparty «Массовое редактирование» — live-grounded build spec (2026-06-18)

Grounded LIVE on the user's own climart account (farrux@climart_santex_group) by
selecting 1 counterparty → «Изменить ▾» → «Массовое редактирование» (`#bulkEdit`,
title «Массовое редактирование: Контрагенты»). This is the field-set the user asked
me to confirm BEFORE building ("avval jonli tasdiqlab, to'liq qur"). Screenshot saved
context: a 2-step wizard, each field gated by a left enable-checkbox (check = "change
this field"; unchecked = leave untouched — moysklad's fill/change/clear semantics).

## Wizard shape
- Step 1 «Настройка параметров» (configure)
- Step 2 «Подтверждение» (confirm — shows a diff/summary before applying)
- Header pill: «Выбран N контрагент(а/ов)»
- Info banner: "Массовое редактирование позволяет заполнять, изменять и очищать поля
  сразу в нескольких записях справочников или документов."

## Step-1 field set (grounded order) + model mapping

| # | moysklad field | control | our model field | maps cleanly? |
|---|----------------|---------|-----------------|---------------|
| 1 | Архивный | radio Да/Нет | `archived` | ✅ (already have bulk-archive/restore) |
| 2 | Статус | select (CRM state) | `stateId` | ✅ (already have bulk-set-state) |
| 3 | Установить группы | select | `groupId` (single) | ⚠️ partial — see GROUPS GAP |
| 4 | *Добавить в группы | select | — | ❌ needs many-to-many |
| 5 | *Убрать из групп | select | — | ❌ needs many-to-many |
| 6 | Тип контрагента | select (Юр.лицо…) | `companyType` | ✅ |
| 7 | Пол | select | `uzRequisites.gender` (JSON) | ✅ |
| 8 | Дата рождения | date | `uzRequisites.birthDate` (JSON) | ✅ |
| 9 | Цены (section «Скидки и цены») | select | `priceTypeId` | ✅ |
| 10 | Владелец-сотрудник (section «Доступ») | employee picker | `ownerId` | ✅ |
| 11 | Владелец-отдел | dept picker | `groupId` (single) | ⚠️ conflated with «Группы» |
| 12 | Общий доступ | checkbox | `shared` | ✅ |
| 13 | Усто (section «Дополнительные поля») | per custom attr | `attributes` JSON | ✅ |

## 🔴 GROUPS MODEL GAP (the real blocker for true 1:1)
moysklad separates TWO concepts our model conflates into one `groupId`:
- **«Группы»** — folder-like grouping, MANY per counterparty, edited with three modes
  (Установить = replace, Добавить = add, Убрать = remove). This is what the list
  «Группы» column shows (e.g. "усто сантехник" pills).
- **«Владелец-отдел»** — single access DEPARTMENT (the `OWN_GROUP` access scope).

Our `Counterparty.groupId` is a SINGLE `Group?` relation, used as BOTH the list
«Группы» column AND the access dept. A faithful mass-edit «Группы» (Set/Add/Remove
many) therefore needs a schema change: a many-to-many counterparty↔group relation,
and separating the access-dept field from the grouping field. That is a schema-design
flagship (migration + backfill + reader/writer updates), not just a modal.

## Build plan (when scheduled as its own session)
1. SCHEMA: introduce many-to-many counterparty groups (keep `groupId` as access-dept
   OR rename; backfill existing single group → membership). Decide naming with user.
2. BE: `POST /counterparties/bulk-update` — `{ ids, patch }`, patch fields gated like
   moysklad (only present keys applied). runBulk (Promise.allSettled), per-account
   scoped, NO per-row version (bulk overrides). Reuse update() field logic.
3. FE: `CounterpartyMassEditModal` — 2-step wizard mirroring assortment's
   bulk-actions-dropdown MassEdit (enable-checkbox per field → Настройка → Подтверждение
   diff). Wire `onMassEdit` on the list page → un-greys the existing menu item.
4. TESTS + live-cert on climart-shape data.

## Fields that DO map now (if a subset build is ever chosen)
archived · stateId · companyType · gender · birthDate · priceTypeId · ownerId ·
shared · custom attributes (+ «Установить группы» as single-group set). Only the
many-group Добавить/Убрать modes are blocked by the model gap.
