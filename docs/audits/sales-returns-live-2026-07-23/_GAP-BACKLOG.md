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

## Xulosa — 3 qatlam
- **Funksional core** (create/post→stock/un-post/print/restock) — ✅ jonli tasdiqlangan (2026-07-23b, `329ed1b`).
- **Vizual/struktura deltalar** — L1-L6, D2-D4, D9-D10 (asosan FE).
- **Backend enablerlar** — D1(balance), D5(остаток), D6(себест), D7(РНПТ), D8(Создать docs), L1(payedSumMinor/Оплачено), print-shablonlar.
