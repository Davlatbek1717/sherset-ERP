# Counterparties list «Фильтр» parity enrichment (5 → 14 fields) + §4 label fix

**Date:** 2026-06-11 (11k) · **Status:** Phase-2 (runtime-verified) · `davom et`, local Opus, ultracode.
**Ground truth:** `docs/moysklad-reference/counterparties/states/02-filter-applied.png` (§4 DOM/pixel-rendered).
**Closes:** recurring backlog **(A) filter-field parity enrichment** for the **counterparties** master-data
list — the largest flagged gap (5 → 38 in the coverage map). Mirrors the products 11j pattern.

---

## 1. What shipped

The counterparties list filter was enriched from **5 → 14 column-backed fields**, plus a §4 label fix.
**No migration** — every wired field is backed by an existing `Counterparty` column.

### 9 new fields (each grounded on the capture, backed by a real column)

| # | RU label (capture) | Backing column | Wiring |
|---|---|---|---|
| Группа контрагента | `groupId` → Group | CatalogPicker `/groups` (the FE "no /groups yet" note was **stale** — it has existed since the customer-orders sweep) |
| Цены | `priceTypeId` → PriceType | CatalogPicker `/price-types` |
| Код | `code` | contains, insensitive (top search does NOT OR `code`, so non-redundant) |
| ИНН | `uzRequisites.inn` (JSON) | Prisma `{ path:['inn'], string_contains }` — our single UZ STIR |
| Адрес | `actualAddress` | contains, insensitive |
| Дисконтная карта | `discountCardNumber` | contains, insensitive |
| Общий доступ | `shared` | tri-state (Все / Да / Нет) |
| Создан | `createdAt` | PeriodPicker half-open day range (createdFrom/To) |
| Когда изменен | `updatedAt` | PeriodPicker half-open day range (updatedFrom/To) |

### §4 label fix (the labels were INVERTED — same class as products 11j)

moysklad renders **archived control = «Показывать»** and **CRM-state dropdown = «Статус»** as two distinct
fields. Our FE had them swapped: the archived toggle read `fields.state` («Статус») and the CRM-state dropdown
read `filters.crm_status` («CRM статус»). The "CRM статус" rename was only a workaround **because** archived had
stolen «Статус». The fix restores both to the captured labels and promotes archived binary → **tri-state**:

- archived control → `filters.show` («Показывать»), tri-state: Только обычные / Только архивные / **Все**
  (`archived='all'` → schema maps to `undefined` → Prisma omits the predicate; `.default(false)` preserved so an
  absent param still = only-non-archived).
- CRM-state dropdown → `fields.state` («Статус») — the collision is gone now that archived is «Показывать».

Kept (unchanged): Тип контрагента (companyType), Метки (tags), Владелец-сотрудник (ownerId).

---

## 2. Deferred (documented — NOT wired, with the reason)

| moysklad field(s) | Why deferred |
|---|---|
| **Баланс · Прибыль · Средний чек · Сумма продаж · Количество продаж · Первая/Последняя продажа · Сумма/Количество возвратов · Сумма предоставленных скидок · Баллы** | **Sales-analytics aggregate block.** The backing columns `salesAmount`/`bonusPoints` exist but are **written ONLY by the moysklad-sync import script** (`sync-from-moysklad.ts`), never by app create/update. A от/до filter on them would be a **dead control** (the 11h dead-column trap). The rest (Прибыль/Средний чек/Количество…) have no column at all. Wiring requires a real sales-aggregation feature. |
| **КПП контрагента · ИНН (УЗ) · ПИНФЛ** | RU-/UZ-plugin requisites. We model the single UZ STIR as `uzRequisites.inn` and surface it as the «ИНН» field; КПП (RU) and ПИНФЛ (UZ individual) are not modeled. |
| **Дата рождения · Пол** | No birthDate / gender columns (verified absent on the model). |
| **Дата события (последнее) · Текст события (последнее)** | No CRM event-log feature. |
| **Кто изменил** | No `updatedById` column (same defer as products 11j). |
| **Владелец-отдел** | The **owner's department** — a different concept from `Counterparty.groupId` (= «Группа контрагента», which we DID wire). No owner-department column. |
| **Проданные товары или группа** | Requires sales analysis. |
| discrete **Наименование · Полное наименование · Телефон · E-mail** | The top search box already ORs `name/legalTitle/email/phone/externalCode`. Discrete versions only add AND-narrowing — deferred for consistency with the products 11j decision (the AND-vs-OR tradeoff is documented, not lost). |

---

## 3. Verification (Phase-2, runtime-verified)

- **Gate (fully green):** api tc0 · web tc0 · biome0 (changed source) · **api Vitest 2876 (+8, 0 regress)** ·
  **web Vitest 2118 (+28, 0 regress)** · i18n ru/uz parity for all 7 new keys · ds untouched. (Smoke script
  carries the documented CLI `noConsoleLog` notice, identical to the committed product smoke.)
- **Runtime smoke `tools/scripts/verify-counterparty-filter-smoke.mjs` — 18/18 PASS** (live API + self-reverting
  DB): each filter genuinely **narrows** GET /counterparties — groupId/priceTypeId equality, code/address/discountCard
  contains (insensitive), **inn JSON-path** contains (+ a non-existent inn → none), shared tri-state both branches,
  created/updated range bounds (future/past exclude all, today-spanning window includes), archived tri-state
  (false=non-archived only, true=archived only, **all=both**), and AND-semantics (code AND inn → none).
- **Browser smoke (Playwright, RU locale):** all **14/14** field labels render exactly matching the capture —
  Тип контрагента · **Группа контрагента** · **Статус** · Метки · Владелец-сотрудник · **Цены** · **Код** · **ИНН** ·
  **Адрес** · **Дисконтная карта** · **Общий доступ** · **Показывать** · **Создан** · **Когда изменен**. The §4 fix
  is browser-confirmed (archived=«Показывать», state=«Статус», not inverted); archived options render «Только
  обычные / Только архивные / Все»; no raw-key i18n leak; console clean (favicon 404 only).
- **Adversarial-verify Workflow (`wf_003e825f-61d`, 5 read-only lenses):** label-grounding · guard-vacuity ·
  dead-filter/write-path · BE-correctness · defer-completeness — **all returned NONE** (every claim verified
  against actual file content). Confirms: no inverted labels, no vacuous guards, no dead wired columns, JSON-path
  query safe for null rows, defer set honest (no birthDate/gender/pinfl/kpp columns missed, no wireable field
  wrongly deferred).

### Guards (regression-lock)
- `apps/web/src/__tests__/counterparties-filter-fields.test.ts` (28): render + **SPREAD-anchored** forwarding
  (the 11j guard-vacuity lesson — object-shorthand fields anchored to `...(x ? { x } : {})` so the JSX prop
  `value={shared}` can't satisfy them) + react-query-key membership + picker endpoints + **§4 label-lock**
  (archived=filters.show NOT fields.state; state=fields.state NOT crm_status; tri-state).
- `apps/api/.../counterparty.schema.test.ts` (+8): archived tri-state (`all`→undefined, `.default(false)`
  preserved, unknown sentinel rejected) + discrete contains/range/shared/priceTypeId parse.

---

## 4. Honest status

**Phase-2 (runtime-verified)** — live API + self-reverting DB probe (both tri-state branches, range bounds,
JSON-path, AND-semantics) + browser render (14 labels vs capture, RU) + 5-lens adversarial verify. §4 labels
capture-grounded and browser-confirmed. **NOT** a full pixel-sweep of every applied-filter result (the battery
covered behavior; the browser covered labels). The deferred sales-analytics block is a genuine product feature,
not an oversight.

## 5. Next

**(A)** filter-field parity — **next entity** (payments-in/out 14→25, cash-out 16→25, supplies/invoices ~18→24/25),
each capture-grounded from `<entity>/states/02-filter-applied.png`, mirror this pattern · **(B)** «Тип» open-dropdown
capture (products) to ground KIND_OPTIONS · **(C)** «Ожидание» in-transit (PO→Stock.inTransitQty) · **(D)** vestigial
`stock_minor` 3-column DROP · **(E)** box (2/3) GROUNDING (Производство trial / retail POS) · **(F)** Phase-3
master-plan.
