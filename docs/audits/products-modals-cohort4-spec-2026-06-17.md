# Products list — «Изменить» modals deep spec (cohort 4)

Grounded LIVE on `online.moysklad.uz` (farrux@climart, 2026-06-17) via Playwright
screenshots. These are the two action surfaces where our current implementation is
a **simplified placeholder** vs moysklad's full feature. Use this as the build spec.

## 1. «Цены…» → «Изменить цены» (right-side DRAWER, not a modal)

Opened from «Изменить → Цены…». A right-side drawer.

- Header «Изменить цены» (X close top-left).
- Subtitle: «Обновленные цены будут отображаться в карточках товаров.»
- Badge: «Выбран N товаров».
- **«Цена, которую будем менять *»** (REQUIRED) — price-type dropdown
  «Выберите тип цены». Help: «В карточках выбранных товаров цены этого типа
  поменяют значение».
- Currency segmented toggle: «Валюту не менять» | «Изменить валюту» (+ ⓘ).
- Mode (radio, 3):
  1. «Задать конкретную цену» — set an explicit value.
  2. «На основании себестоимости» (+ ⓘ) — derive from cost (buyPrice).
  3. «На основании другой цены» — base price-type dropdown «Выберите тип цены»
     + `+ / −` toggle + numeric input (0.00) + `ед. / %` toggle.
- Rounding segmented toggle: «Не округлять цены» | «Округлить» (+ ⓘ).
- Footer: «Сохранить новые цены» (disabled until valid) · «Не сейчас».

OURS now: a small centred Modal with retail + wholesale MoneyInputs → simplistic.
REBUILD: drawer + price-type selector + 3 modes (specific / cost-based / other-price
±adjust in unit|%) + currency + rounding. BE bulk-set-prices must accept the mode,
target priceTypeId, base priceTypeId, adjustment (value, unit|percent, +|−), rounding.

## 2. «Массовое редактирование» → FULL PAGE (`#bulkEdit`), not a modal

Opened from «Изменить → Массовое редактирование». Navigates to a full page.

- «Закрыть» button (top-left). Title «Массовое редактирование: Товары».
- Info banner: «Массовое редактирование позволяет заполнять, изменять и очищать
  поля сразу в нескольких записях справочников или документах.» + «Читать
  инструкцию: Массовое редактирование» link.
- 2-step wizard: **Настройка параметров → Подтверждение**.
- Badge «Выбрано N товаров».
- Section «Настройка параметров» — each field has a LEADING CHECKBOX (check =
  this field will be written); fields seen (scroll has more under «Особенности
  учета»):
  - ☐ Архивный → radio Да/Нет
  - ☐ Группа → dropdown
  - ☐ Страна → dropdown + «+»
  - ☐ Единица измерения → dropdown + «+»
  - ☐ Вес → number
  - ☐ Объем → number
  - ☐ НДС → input
  - ☐ Неснижаемый остаток → radio (В сумме на всех складах / Одинаковый на всех
    складах / Задать для каждого склада) + value
  - ☐ Поставщик → dropdown + «+»
  - section «Особенности учета» → (more fields below the fold)
- Step 2 «Подтверждение» — review before apply.

OURS now: a small internal Modal with Поставщик / НДС / Общий доступ (3 fields).
REBUILD: full page (or large drawer) 2-step wizard, ~15+ checkbox-gated fields,
clear-vs-set semantics, confirmation step. BE bulk-update must accept the full
field set + per-field "clear" vs "set".

## 3. «Переместить» (folder picker) — ours is close (folder tree → bulk-move). Re-verify modal chrome.

## Status
These two are genuine FEATURE rebuilds (FE + BE + tests), each substantial — NOT
tweaks. Documented here so the build is reproducible. Until built, our «Цены…» and
«Массовое редактирование» are functionally a fraction of moysklad's.
