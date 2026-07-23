# Demand `/new` — vizual delta + data-feasibility (Task 1 deliverable, 2026-07-23)

> Solishtiruv: bizning `:3100/demands/new` (uz-locale, `our-new-01-uz.png`) vs moysklad `#demand/edit?new`
> (`demand-03-new.png`). Dev-stack: postgres 5432 (D:\pgdata-sherset, toza reset) · migrate deploy 170 · seed ·
> `pnpm dev`. Login `admin@demo.local`/`admin123`.

## A. Vizual delta (bizniki → moysklad; Task 6 tuzatadi)

### A1. Header (status qatori)
- **«Не оплачено» to'lov-pill YO'Q** (bizda). moysklad: `от [sana]`dan keyin sariq/kulrang «Не оплачено» pill. Bizda faqat «Qoralama ▾» (=Статус) + «O'tkazilgan» checkbox.
- Status dropdown: bizda «Qoralama», moysklad «Статус ▾» — moslashtir (moysklad'da alohida «Статус» tugma + rangli-kvadrat popup, `customer-order`dagi shared komponent bilan).
- ✅ Sana bitta katak «DD.MM.YYYY HH:MM» + kalendar-ikon — MOS.
- ✅ «Проведено»/«O'tkazilgan» checkbox — MOS.

### A2. Maydon joylashuvi (ENG KATTA farq)
- **moysklad = ixcham 3-ustunli grid:** chap (Организация → Перечисление subfield, Контрагент, Проект, Валюта документа) · o'rta (Склад, Договор, Канал продаж) · o'ng (Адрес доставки, Комментарий — TEPADA).
- **bizniki = bo'shroq 2-ustun:** Kontragent (to'liq kенг) + Ombor; Tashkilot + Shartnoma; keyin bo'sh to'liq-kенг dropdown qatori; Loyiha + Rejadagi jo'natish sanasi; Rejalashtirilgan to'lov sanasi; Sotuv kanali + Yetkazib berish manzili; Hujjat valyutasi.
- **Delta:** (1) moysklad Адрес доставки + Комментарий'ni **o'ng-tepa** ustunga qo'yadi; bizda Izoh pastда totals yonida. (2) moysklad «Перечисление» (to'lov turi) subfield Организация ostида; bizda bu — labelsiz bo'sh dropdown qatori. (3) umumiy grid zichligi/ustun soni farq. → moysklad 3-ustunli tartibga moslashtirish.
- **«Rejадаги жо'natish / to'lov sanasi»** — bizda bor, moysklad top-formasида ko'rinmaydi (ehtimol «Другие поля»да yoki yo'q). Grounding: capture'да bu 2 maydon top-formada YO'Q edi → bizда ORTIQCHA (saqlanadi, lekin joylashuv moysklad'да «Другие поля»да bo'lishi mumkin — tekshir).

### A3. «Другие поля» / «Boshqa maydonlar»
- moysklad: «▶ Другие поля» — **kichik inline havola**, Валюта документа'dan keyin **TEPADA**.
- bizniki: «Boshqa maydonlar» — **katta disclosure panel**, sahifa **PASTIDA**. → joyni tepaga ko'chirish + inline-havola uslubi. (Shipping 10 maydon shu ichida — plan Task 2/3.)

### A4. Pozitsiya jadvali kolonkalari
- **moysklad:** Наименование ▾ · **Маркировка ▾** · Кол-во · **Остаток** · Цена ▾ · НДС · Скидка · Сумма · **Себест. единицы** ⚙.
- **bizniki:** # · Наименование · Кол-во б. ед. · **Уп.** · Цена · НДС · **Сумма НДС** · Скидка · Сумма.
- **Delta:** bizда YO'Q — **Маркировка** (C2, katta), **Остаток** (jonli qoldiq), **Себест. единицы** (cost/unit), **Ячейка** (moysklad settings-gear ortида?). bizда ORTIQCHA — «#» index, «Уп.» (paket), «Сумма НДС» (alohida ustun). moysklad ustun-sarlavhalarida ▾ dropdown (sort/config).
- **i18n bug:** pozitsiya sarlavhalari bizда **RUSCHA** chiqadi (Наименование/Цена/Уп.) — qolgan UI uz. Aralash-locale (DS PositionTable hardcode yoki alohida namespace). → i18n tuzatish.

### A5. Pozitsiya toolbar
- moysklad: Добавить из справочника · Проверить комплектацию · **Импорт ▾**.
- bizniki: Katalogdan qo'shish · Komplektni tekshirish (Импорт ko'rinmaydi bu render'da — kod'да bor, tekshir).

### A6. Totals bloki
- moysklad: Промежуточный итог · НДС ☑ · **Цена включает НДС ☑ (default CHECKED)** · Итого · **Прибыль (0,00)** · + **«Накладные расходы [0] Распределить по цене»** (overhead, totals ostида).
- bizniki: Промежуточный итог · НДС ☑ · Цена включает НДС ☐ (**UNchecked**) · Итого · Кол-во. YO'Q — **Прибыль**; overhead bu render'да ko'rinmaydi.
- **Delta:** (1) **Прибыль qatori qo'sh** (C3). (2) «Цена включает НДС» default = CHECKED (moysklad) — bizда unchecked; grounding: capture default checked → default'ni moslashtir. (3) overhead «Накладные расходы» totals ostида ko'rsatilishi (bizда bor, joylashuv tekshir). (4) bizда «Кол-во» totals'да — moysklad totals'да Кол-во ko'rsatmaydi (pozitsiyада emas) — tekshir.

### A7. Komментарий
- moysklad: Комментарий **o'ng-tepа** (asosiy) + ikkinchi Комментарий totals yonida.
- bizniki: faqat «Izoh» totals yonida (pastда). → tepа-o'ng Комментарий qo'sh (A2 bilan birga).

### A8. Branding (ATAYLAB farq — 1:1 EMAS)
- Bizning tepа-panel = to'q-ko'k SHERSET brendi; moysklad = oq panel + ko'k nav. Bu **brend farqi**, klon qilinmaydi. Faqat **forma-ichi** 1:1 bo'ladi.

## B. Data-feasibility (keyingi tasklar uchun)
- **C1 Ячейка (bin):** ✅ ARZON. `PositionTable` `'cell'` kolonkani qo'llaydi (`PositionTable.tsx:58,1017`). `/new` `POSITION_COLUMNS`ga `{key:'cell'}` qo'sh + BE cell qabul qilsin.
- **C2 Маркировка (marking):** ⚠️ KATTA. `PositionTable`да `marking` YO'Q. Yangi DS ustun-turi kerak → **alohida sub-project** (list/detail/new hammasi).
- **C3/N2 Прибыль (profit):** ⚠️ QO'SHIMCHA ISH. `/new` pozitsiya state faqat `salePrices` tashiydi, `buyPrice`/cost YO'Q (`new/page.tsx:55`). moysklad «Себест. единицы» + «Прибыль» ko'rsatadi → 1:1 uchun pozitsiya qo'shilganда product `buyPriceMinor` olib state kengaytirilsin, keyin profit = Σ(sell−buy)×qty. Feasible, lekin state+add-flow o'zgaradi (Task 4 feasibility-gate = «kengaytir», DEFER emas).

## C. Task-mapping yangilanishi (rejaga)
- Task 2 (shipping «Грузоотправитель» guruh) — A3 bilan birga «Другие поля»ni TEPAGA ko'chirish.
- Task 4 (profit) — B/C3: pozitsiya state'ni buyPrice bilan kengaytirish (DEFER emas, feasible).
- Task 5 (bin) — B/C1: arzon, `{key:'cell'}`.
- Task 6 (visual-fix) — A1/A2/A4/A6/A7: field-grid 3-ustun · «Не оплачено» pill · Комментарий tepа-o'ng · totals Прибыль+ВАТ-default · pozitsiya i18n(RU-leak)+kolonka to'plami · «Другие поля» tepа inline.
- YANGI (rejада yo'q edi): **A4 i18n RU-leak** pozitsiya sarlavhаларида (uz-locale'да ruscha) · **Остаток**/**Себест. единицы** pozitsiya kolonkаlari · **«Цена включает НДС» default** · totals **Кол-во** ortiqcha.
