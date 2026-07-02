# settings/stores/[id] — detail page parity audit

Audited 2026-06-01. Rich catalog-card detail (Склад, Настройки → Склады). 4th catalog card
(counterparties · products · projects · **stores**). Reference = live `--detail` capture
(`docs/moysklad-reference/stores/detail/`, route **`#warehouse`** — discovered live by probing
the moysklad UI; `#store` redirects to the onboarding splash). Method:
`pnpm capture-moysklad stores --detail` → 3-dimension `wf-stores-detail-audit.js` (identity /
address / storage-actions-i18n) → Opus judged. Fully i18n (`pages.stores.*`) → the audit is
label-parity + field presence, not leak-hunting.

## Verdict
The warehouse card is structurally rich. **8 fixes applied** (6 label-parity + 1 i18n leak +
1 missing field); the deeper structural deltas (moysklad's flat titleless single-column layout,
its collapsible address widget, and its structured bin-storage «Адресное хранение» Зона/Ячейка
tables) are DEFER (data-model / layout — our sectioned form + free-text zones is a deliberate
simplification). Notably moysklad's store card **does** have «Внешний код» (confirming the
projects externalCode removal was correctly projects-specific). Browser-smoke NOT done.

## A. Structural
| Item | moysklad | ours (resolved RU) | status | sev | action |
|---|---|---|---|---|---|
| Name label | Наименование | was «Название» | delta | high | **FIXED → «Наименование»** |
| Free-text note label | Комментарий | was «Описание» | delta | high | **FIXED → «Комментарий»** (moysklad never «Описание» here) |
| External code label | Внешний код | was «Внешний код (для 1C / sync)» | delta | medium | **FIXED → «Внешний код»** (dropped suffix) |
| Group label | Группа | was «Родительский склад» | delta | medium | **FIXED → «Группа»** (+ root option «— без группы») |
| Apartment label | Квартира/Офис | was «Квартира / офис» | delta | medium | **FIXED → «Квартира/Офис»** (byte: no spaces, capital Офис) |
| Free-text address label | Адрес | was «Адрес (свободный текст)» | delta | medium | **FIXED → «Адрес»** |
| «Комментарий к адресу» field | present (textarea in address widget) | type had `comment`, never rendered | missing_in_ours | medium | **FIXED — rendered FormField (addr.comment) + key `address_comment`** |
| Code label | Код | Код | match | — | — |
| Индекс/Город/Улица/Дом | exact | exact | match | — | — |
| Страна | Страна (dropdown) | «Страна» (plain Input) | delta | low | DEFER — control-type (dropdown vs input) |
| Регион / Район | — (absent) | «Регион» / «Район» | extra_in_ours | low | DEFER — part of address-model review (moysklad address popup = Индекс/Страна/Город/Улица/Дом/Кв-Офис only) |
| Section grouping | titleless, ungrouped single column | «Основное»/«Структ. адрес»/«Структура»/«Дополнительно» FormSections + 2-col grid | delta | medium | DEFER — full layout restructure; our sectioned form is clearer UX |
| Address widget model | single collapsible «Адрес» widget → popup sub-fields | free-text «Адрес» + always-visible grid | delta | medium | DEFER — widget rebuild |
| Page title | — (titleless; name inline) | «Редактировать склад» (EditForm) | delta | low | DEFER — generic EditForm chrome model |
| «Дополнительные поля» (custom fields) | present | — | missing_in_ours | medium | DEFER — account-wide custom-fields engine (cross-cutting) |

## B. Interactive
| Item | moysklad | ours (resolved RU) | status | sev | action |
|---|---|---|---|---|---|
| Save / Close buttons | Сохранить / Закрыть | Сохранить / Закрыть (useEditFormLabels) | match | — | ✓ (fixed in `bb604bf8` sweep) |
| name-required validation | (inline RU) | was hardcoded Uzbek `'Nom majburiy'` | delta | medium | **FIXED → `t('name_required')`** in [id] + new (i18n leak) |
| «Изменить» ▾ {Удалить, Копировать} | dropdown | standalone Delete button, no «Изменить», no Копировать | delta | medium | DEFER — EditForm has no «Изменить» grouping; «Копировать» needs a real clone endpoint (no fake /clone — counterparty 404 lesson) |
| «Копировать» (clone) | enabled | — | missing_in_ours | medium | DEFER — backend clone endpoint required |
| Archive label | Поместить в архив | «Поместить в архив» (common.archive) | match | — | **FIXED — backlog #9 closed `c2aa5722` (2026-06-01): common.archive RU «Архивировать»→«Поместить в архив»; page renders `tCommon('archive')` @line 220 (restore @211 → «Извлечь из архива»)** |
| Archived banner | «Склад находится в архиве» | «В архиве» Badge | delta | low | DEFER — affordance (banner vs badge) |
| «Адресное хранение товаров» (bin storage) | Зона/Ячейка tables + counters (Всего ячеек/Свободно/Занято) + «Проводить инвентаризацию по ячейкам» | free-text zones/slots Textareas | delta | medium | DEFER — structured bin-storage feature (backend/data-model) |
| allowNegativeStock checkbox | — (not on warehouse card) | «Разрешить отрицательный остаток» | extra_in_ours | low | DEFER — moysklad puts negative-stock policy at account/doc level, not the card |
| shared checkbox | — (separate Доступ widget) | «Общий склад (виден другим сотрудникам)» | extra_in_ours | low | DEFER — moysklad handles access via a Доступ widget |
| i18n-sweep (labels/hints) | n/a | all via t()/tForm/tCommon | match | — | clean (no hardcoded labels) |

## Fixed this session (commit pending)
- **6 label-parity fixes** in `pages.stores` (ru + uz): name «Наименование» · description «Комментарий» ·
  external_code «Внешний код» · parent «Группа» (+ parent_root «— без группы») · apartment «Квартира/Офис» ·
  address «Адрес».
- **i18n leak**: hardcoded `'Nom majburiy'` → `t('name_required')` in `settings/stores/[id]` AND
  `settings/stores/new` (new `pages.stores.name_required` ru «Наименование обязательно» / uz «Nomi majburiy»).
- **Rendered «Комментарий к адресу»** field (the `AddressFull.comment` was collected on save but never shown) +
  new `pages.stores.address_comment` key (ru/uz).

Gates: web typecheck 0 · biome clean · web tests (run before commit). Browser-smoke NOT done
(label/field/i18n change).

## DEFER (documented above)
Section grouping / titleless layout · collapsible address-widget model · region/district extras ·
structured bin-storage (Зона/Ячейка) · custom-fields block · «Изменить»▾ + «Копировать» (clone backend) ·
~~archive label «Поместить в архив» (backlog #9)~~ ✅ FIXED `c2aa5722` (2026-06-03 audit gap-close) · archived banner sentence · allowNegativeStock/shared extras ·
Страна dropdown · page-title model. None block parity of the core editable identity+address fields, which are
now label-correct + «Комментарий к адресу» present.

## Route discovery note (for future settings-catalog audits)
moysklad GWT nav has NO static hrefs → routes were found by live UI probing (`scratch/discover-org-route.mjs`):
**Склады = `#warehouse`** (✓ captured). **Юр. лица = `#myorganization`** is a *recognised* route (keeps its
hash, unlike invalid guesses `#organization`/`#store`/`#myorg` that redirect to `#homepage` splash) BUT it hangs
on «Загрузка...» in this (free-tier) account → organizations/[id] capture currently BLOCKED; needs a paid-tier
account or a code+domain audit. Both routes added to `scripts/capture-moysklad-lib.ts` MODULES.
