# «Возвраты покупателей» (salesreturn) — LIVE capture gap-backlog

**Sana:** 2026-07-23 · **Manba:** jonli moysklad capture (`online.moysklad.ru`, akkount `elektro_sentr`, 1834 real yozuv).
**Capture fayllar (gitignore — real mijoz PII):**
- List: `docs/moysklad-reference/salesreturn/states/` (`01-default`, `02-filter-applied`, `03-edit-dropdown`, `05-print-dropdown`, `07-row-hover`)
- Detail: `docs/moysklad-reference/salesreturn/detail/` (`edit-default` + `.html`, `edit-dropdown-{izmenit,sozdat,pechat,otpravit}`, `edit-tab-{main,linked}` + `.html`)

> **Ground-truth intizom (CLAUDE.md §4):** har delta capture'dan DOM/piksel-rol bilan o'qildi, taxmin EMAS. `/new` alohida capture QISM 1'da olinadi (bu sessiyada faqat list+detail).

---

## LIST — `/sales-returns` vs moysklad `#salesreturn`

**Ustunlar (default-ko'rinadigan), moysklad `01-default`:**
`№ · Время · На склад · Контрагент · Организация · Сумма · Валюта · Оплачено · Отправлено · Напечатано · Комментарий · ⚙`
Bizniki: `№ · Время · На склад · Контрагент · Организация · Сумма · Отправлено · Напечатано · Комментарий`.

| # | Delta | moysklad | bizniki | Qatlam |
|---|---|---|---|---|
| **L1** | «Оплачено» ustuni (qaytarish bo'yicha to'langan/qaytarilgan summa) | bor (0,00) | YO'Q | BE (`payedSumMinor`) + FE ustun |
| **L2** | «Валюта» ustuni default-ko'rinadigan | bor (сум) | def bor, default-yashirin | FE (default'ga qo'sh) |
| **L3** | Filtr maydonlari yetishmaydi | `Дата отгрузки · Оплата · Товар или группа · Счет контрагента · Владелец контрагента · Счет организации · Общий доступ · Кто изменил` | yo'q | FE (+ ba'zilari BE query) |
| **L4** | Bizda ortiqcha filtrlar | — | `Отгрузка · Заказ покупателя · Сумма (from/to)` moysklad salesreturn filtrida YO'Q | FE (1:1 uchun reconcile — olib tashlash yoki «Ещё» ostiga) |
| **L5** | Toolbar «Статус ▾» alohida dropdown | bor | yo'q (bulk-menu ichida emas) | FE |
| **L6** | Toolbar «Создать ▾» (bulk create) | bor | yo'q | FE + BE |
| — | «Изменить ▾» menu (`03-edit-dropdown`) = {Удалить, Массовое редактирование, Провести, Снять проведение} | — | bizning bulk-menu bilan MOS ✓ | — |
| — | «Печать ▾» menu (`05-print-dropdown`) = {Список возвратов, Возврат покупателя, Комплект…, Настроить…, Запросить форму} | — | qisman (base print bor) | print-shablonlar QISM 4 |

---

## DETAIL — `/sales-returns/[id]` vs moysklad `edit-default`

**Meta-grid (ixcham 2-ustun):** `Организация (+ Перечисление to'lov-turi) · Склад` / `Контрагент (+ Баланс) · Договор` / `Проект · Канал продаж` / `Валюта документа`

| # | Delta | moysklad | bizniki | Qatlam | Eski audit |
|---|---|---|---|---|---|
| **D1** | «Баланс (нам должны): …» qizil sub-qator Контрагент ostida | `1 689 061 969,67 сум` | YO'Q | BE (balance fetch) + FE | S6 |
| **D2** | «Перечисление» to'lov-turi dropdown Организация ostida | bor | YO'Q | BE + FE |  |
| **D3** | «Валюта документа» tahrirlanadigan selektor | `сум (UZS)` | detalda YO'Q (faqat /new'da) | FE |  |
| **D4** | Meta-grid ixchamligi/tartibi | ixcham | bizda yoyilgan (Sabab/Отгрузка/Заказ/Счета/Внешний код alohida qatorlar) | FE (2A) |  |
| **D5** | Pozitsiya «Остаток» ustuni (jonli qoldiq) | `687` | YO'Q | BE (per-row stock) + FE | S4 |
| **D6** | Pozitsiya «Себест. единицы» ustuni | `10 167,50` | YO'Q | BE (unit cost) + FE | S5 |
| **D7** | Pozitsiya «РНПТ» ustuni (marking/partiya) | bor (bo'sh) | YO'Q | BE + DS ustun-turi |  |
| **D8** | Toolbar «Создать документ ▾» (`edit-dropdown-sozdat`) = {**Исходящий платеж, Расходный ордер, Списание**} | bor | YO'Q | FE + BE (I7 endi GROUNDED — taxmin emas) | I7 |
| **D9** | Toolbar «Отправить ▾» parity | bor | generic | FE |  |
| **D10** | Tab-strip: faqat «Главная» + «Связанные документы»; Задачи/Файлы **inline**; История/Файлы TAB yo'q | 2 tab | bizda +Файлы/История tab | FE (DS restructure) | S3 |
| — | Pozitsiya «Себестоимость ГТД» = bizning «GTD tannarxi» | mos ✓ (RU label «Себестоимость ГТД» ekanini tekshir) | — | — | — |
| — | «Скидка» ustuni moysklad detalda default-KO'RINMAYDI; bizda «Skidka %» bor | reconcile | — | FE | — |
| — | Totals (Промежуточный итог/НДС/Цена включает НДС/Итого/Кол-во) | mos ✓; «Прибыль» faqat profit-config bo'lsa (shartli) | — | — | S5 |

> **Diqqat:** «Чаты и уведомления … от Wappi» — bu moysklad'ning 3-tomon app-vidjeti (Wappi integratsiya), CORE emas → parity'ga KIRMAYDI.

---

## NEW — `/new` create-form grounding (2026-07-23, QISM 1 boshi)

**Manba:** jonli capture `pnpm capture-moysklad salesreturn --create` (yangi `--create` rejimi qo'shildi) →
`docs/moysklad-reference/salesreturn/new/` (`edit-default.png` + `.html`, dropdown/tab holatlar). `viaCreateForm: true`.
Detail edit-formidan farqli — quyidagilar **faqat create-formda** ko'rildi va DOM-rol/piksel bilan grounded.

**Meta-grid (create, aniq tartib — screenshot + DOM):**
```
* Организация [✎]              |  * Склад [✎]
  «Перечисление» [combo]       |
* Контрагент [+]               |  Договор
  Проект [+]                   |  Канал продаж [+]
* Валюта документа [✎]         |  (bo'sh)
```

| # | Delta (create-form) | moysklad `/new` | bizning `/new` | Qatlam |
|---|---|---|---|---|
| **N1** | «Перечисление» — label'siz combo Организация **ostida** (`<input class="text-box" value="Перечисление">`, GWT combo, тип-оплаты) | bor | YO'Q (helper-slot bank-account'ni tutadi) | BE (persist: yangi ustun **yoki** `attributes` — impl qaror) + FE. **Opsiya-ro'yxati DEFER** (coord-click toza ochilmadi; QISM 1 impl'da element-handle bilan click-capture, §4: taxmin YO'Q) |
| **N2** | Meta-grid tartibi | Организация/Склад → Контрагент/Договор → Проект/Канал → Валюта(yakka) | bizda: Контрагент/Склад → Организация/Демандо → Проект/Валюта → Договор/Канал → Счёт/Внешний код | FE (1A reorder) |
| **N3** | «Валюта документа» — yakka to'liq qator (chap-past), ✎ bilan | bor | bor, lekin Проект bilan juftlashgan | FE |
| **N4** | Pozitsiya default-ko'rinadigan ustunlar | `Наименование · Кол-во · Остаток · Цена · НДС · Сумма · Себест. единицы · Себестоимость ГТД · РНПТ · Страна` | `… goodPack · vat · vatAmount · discount · amount · gtdSumMinor · country` | FE + **shared BE/DS** |
| **N5** | «Скидка» ustuni create-form DOM'da **umuman yo'q** | yo'q | bizda `discount` ko'rinadi | FE (default-yashir/olib tashla — 1:1) |
| **N6** | «Сумма НДС» (vatAmount) — DOM'da bor, lekin **default-yashirin** | yashirin | bizda ko'rinadi | FE (default-yashir) |
| **N7** | «Ед.» (goodPack) — moysklad default-ko'rinishda yo'q | yo'q | bizda ko'rinadi | FE (default-yashir) |
| **N8** | «Причина» (reason) alohida input | YO'Q (faqat «Комментарий» textarea) | bizda reason Input bor | FE (reconcile: olib tashla/Ещё) |
| — | Toolbar «Создать документ» = {Исходящий платеж, Расходный ордер, Списание} | ✓ (D8/I7 create-formda ham GROUNDED) | — | — |
| — | «Печать» (/new) = {Возврат покупателя, Комплект…, Настроить…, Запросить форму} — «Список возвратов» YO'Q (list-darajali) | — | — | print-shablon QISM |
| — | «Отправить» (/new) = {Возврат покупателя, Комплект…} · «Изменить» = {Удалить(disabled)} | — | — | — |
| — | Валюта selektori create-formda ✓ (D3: detalda yo'q, /new'da bor — tasdiqlandi) · Задачи/Файлы inline · tab {Главная, Связанные документы} ✓ | mos | — | — |

**Full column set (DOM `gwt-Label header`, yashirinlar bilan):** Кол-во · Ячейка · Остаток · Вес · Объем · Цена · Цена · НДС · Сумма НДС · Сумма · Себест. единицы · Себестоимость ГТД · РНПТ · Страна.

> ⚠️ **Re-sequencing topilma (grounded):** **Остаток (D5) · Себест. единицы (D6) · РНПТ (D7)** ustunlari `/new`(1A) **va** detail(2A) — **ikkalasida** default-ko'rinadi. Demak bu **umumiy pozitsiya-ustun enabler'i har ikki sahifaning vizual-parity'si uchun PREREKVIZIT** — birinchi qurilishi kerak (roadmap eski detail-only capture'da 2A'ga qo'ygan edi). РНПТ ustun-turi demand QISM-4 marking bilan umumiy bo'lishi mumkin.

---

## Xulosa — 3 qatlam
- **Funksional core** (create/post→stock/un-post/print/restock) — ✅ jonli tasdiqlangan (2026-07-23b, `329ed1b`).
- **Vizual/struktura deltalar** — L1-L6, D2-D4, D9-D10 (asosan FE).
- **Backend enablerlar** — D1(balance), D5(остаток), D6(себест), D7(РНПТ), D8(Создать docs), L1(payedSumMinor/Оплачено), print-shablonlar.
