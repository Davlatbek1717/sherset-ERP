# customer-order /new — JONLI moysklad.uz audit (har bo'lim · har interaktiv element · bosilganda nima bo'ladi)

> **Manba:** real moysklad.uz, Farrux akkaunti (`farrux@climart_santex_group`), read-only — hech narsa
> o'zgartirilmadi/saqlanmadi (faqat menyu/modal ochib-yopildi). 2026-06-15.
> **Maqsad:** bizning klon (`localhost:3100/customer-orders/new`) ni moysklad bilan element-darajada solishtirish.
> **Status legend:** ✅ MOS · 🟡 QISMAN/FARQ · 🔴 YO'Q (parity-gap) · ⚪ standart (tekshirilmagan, pattern aniq).

---

## 1. TOOLBAR (yuqori panel)

| Element | moysklad: bosilganda | Bizda | Status |
|---|---|---|---|
| **Сохранить** | hujjatni saqlaydi | bor (saqlaydi) | ✅ |
| **Закрыть** | ro'yxatga qaytadi | bor | ✅ |
| **Изменить ▾** | menyu: `Удалить` (yangi'da o'chiq) · `Копировать` | bizda /new'da BO'SH (disabled) | 🟡 (Копировать yo'q) |
| **Создать документ ▾** | **11 opsiya:** Перемещение · Счет покупателю · Волна отбора · Отгрузка · Входящий платеж · Приходный ордер · Предоплата(off) · Заказ поставщику · Заказ поставщику (с учетом «доступно») · Розничная продажа · Снабжение(off) | bizda /new'da BO'SH | 🔴 (katta gap — /new'da related-doc yaratish menyusi yo'q) |
| **Печать ▾** | shablonlar: `Чек_сум_(FerroSoft)` · `Заказ` \| `Комплект...` · `Настроить...` \| «Запросить форму» (support) | bizda printMenu (shablonlar settings'dan) | 🟡 (tekshirish kerak) |
| **Отправить ▾** | bir xil shablonlar (`Чек_сум` · `Заказ` · `Комплект...`) — email orqali | bizda sendMenu | 🟡 |
| **Файзуллоев Ф. / Основной ▾** (egasi) | **«Владелец» popover:** `Сотрудник` selector · `Отдел` selector · ☐ `Общий доступ` | bizda rightSlot = faqat ism (o'qiladi, tahrirlanmaydi) | 🔴 (egasi/bo'lim/umumiy-kirish tahrirlash yo'q) |

---

## 2. HEADER (hujjat sarlavhasi)

| Element | moysklad: bosilganda | Bizda | Status |
|---|---|---|---|
| **№ [input]** | matn kiritish (bo'sh=avto) | bor | ✅ |
| **от [📅 sana]** | kalendar-ikon → date picker | bor (DatePicker) | ✅ |
| **[vaqt]** | HH:MM kiritish | bor | ✅ |
| **◯ Не оплачено** (pill) | to'lov-holati ko'rsatkichi | bor (outline pill) | ✅ |
| **Запросить оплату** | **«Настройте решение Онлайн-оплата»** popover (платежную систему ulang; [Настроить решение]) — Farrux'da integ YO'Q | bizda: saqla→`/payments-in/new?fromOrder=` (OUR-parity, user tasdiqladi) | 🟡 (xulq farqi — ikkalasi ham real-integ emas) |
| **Текширилмаган ▾** (status) | rangli-kvadrat popup (4 status) | bor (DropdownMenu rangli-chip) | ✅ |
| **❓ help** | tooltip | bor | ⚪ |
| **☑ Проведено** | post/draft toggle | bor (checkbox) | ✅ |

---

## 3. META — 3 ustun + custom fields

> **Pattern:** har reference-maydon = [tanlangan qiymat ▾ dropdown] [✕ clear] [✎ edit-pencil] yoki [+ add-create].

| Element | moysklad: bosilganda | Bizda | Status |
|---|---|---|---|
| **Организация ▾** | tashkilot tanlash dropdown | picker | ✅ |
| **Организация ✕** | tozalash | bor | ✅ |
| **Организация ✎** (ruchka) | **«Редактирование юр. лица» MODAL** — tashkilotni hujjatdan chiqmasdan to'liq tahrirlash (nom·tel·rekvizit·rahbar·imzo·muhr·logo·касса·hisob-raqam) | YO'Q | 🔴 (inline-edit ruchka yo'q) |
| **[Сум] org-account ▾** | tashkilot hisob-raqami dropdown (nom bilan: «Сум») | bizda «Банк. счёт (UZS)» picker | 🟡 (named-dropdown vs picker) |
| **Контрагент ▾ / ✕ / ✎** | tanlash / tozalash / **kontragentni inline tahrirlash modal** | picker + create; ✎ YO'Q | 🔴 (✎ yo'q) |
| **Баланс : 0,00 сум** | kontragent balansi (statik caption) | bor | ✅ |
| **План. дата отгрузки 📅** | kalendar → date picker | DatePicker | ✅ |
| **Канал продаж ▾ / +** | tanlash / **+ yangi kanal yaratish** | picker (create yo'q?) | 🟡 |
| **Валюта документа ▾ / ✎** | valyuta tanlash / **✎ kurs tahrirlash** | NativeSelect + kurs-edit (✎) | ✅ |
| **Уста ▾ / +** (custom field) | custom-field qiymat tanlash / + yangi qiymat | AttributeInput | 🟡 (tekshirish) |
| **Склад ▾ / ✕ / ✎** | tanlash / tozalash / **ombor inline tahrirlash** | picker; ✎ yo'q | 🔴 (✎ yo'q) |
| **Договор ▾ / +** | tanlash / + yangi shartnoma | picker | 🟡 |
| **Проект ▾ / +** | tanlash / + yangi loyiha | picker + create | ✅ |
| **Адрес доставки ▾** (expand) | **strukturali manzil-forma OCHILADI:** Индекс · Страна[▾]+ · Город · Улица · Дом · Кв./офис · Другое (+ Комментарий) | bizda /new'da oddiy Textarea (detail'da `DeliveryAddressGroup` bor) | 🟡 (/new'da strukturali expand yo'q) |
| **Комментарий** (col3) | textarea | bor | ✅ |
| **Санаси 📅** (custom date) | kalendar | AttributeInput date | ✅ |

---

## 4. TABS

| Element | moysklad | Bizda | Status |
|---|---|---|---|
| **Главная** | asosiy tab | bor | ✅ |
| **Связанные документы** | bog'liq hujjatlar diagrammasi | bor | ✅ |

---

## 5. POZITSIYALAR jadvali

| Element | moysklad: bosilganda | Bizda | Status |
|---|---|---|---|
| **☐ select-all** | barcha qatorni tanlash | bor | ✅ |
| **Наименование ▾** (column) | ustun-menyu (sort/sozlama) | tekshirish | ⚪ |
| **Зарезерв. ▾** | rezerv ustun-menyu | tekshirish | ⚪ |
| **Цена ▾** | **`Расценить`** (narx-tur bo'yicha qayta-narxlash) · **`Сохранить цены`** (narxlarni товарга qaytar-saqlash) | YO'Q | 🔴 (narx-bulk amallari yo'q) |
| **Сумма ⚙** (gear) | **ustun-customizer checkbox-popup:** ☑Изображение ☑Единица измерения ☐Отгружено ☑Доступно ☑Остаток ☐Резерв ☐Ожидание ☑Вес ☐Объем ☑Сумма НДС | bizda PositionTable qat'iy ustunlar | 🔴 (customizer + Вес/Объем/Отгружено/Резерв/Ожидание/Доступно/Остаток ustunlari yo'q) |
| **Добавить позицию [input]** | nom/kod/штрихкод/артикул bo'yicha qidirish→qator qo'shish | bor (PositionInlineAdd) | ✅ |
| **Добавить из справочника** | **«Выбор товара» BOY MODAL:** chap=mahsulot-papka daraxti · o'ng=jadval (rasm·Наименование·**Количество**·Остаток·Резерв·Ожидание·Доступно·Код·Артикул·Ед.изм·Розничн)·har qatorda ➖qty➕·yuqorida «➕Создать»·«Фильтр»·qidiruv · [Выбрать]/[Отменить] | bizda: bo'sh qator + oddiy per-qator qidiruv-ro'yxat | 🔴 (KATTA gap — papka-daraxt + stok-ustunlar + bulk-qty modal yo'q) |
| **Проверить комплектацию** | komplektatsiya tekshiruvi | bor (handler) | ⚪ |

---

## 6. PASTKI band

| Element | moysklad | Bizda | Status |
|---|---|---|---|
| **Комментарий** (katta, pastki-chap) | hujjat izohi (katta textarea) | bizda Комментарий col3'da (kichik) | 🟡 (joylashuv farqi — moysklad'da pastda KATTA + col3'da emas?) |
| **Внешний код** (ko'k havola) | havola→input ochiladi | bor (havola→input) | ✅ |
| **☑ НДС** | НДС yoqish/o'chirish | bor | ✅ |
| **☑ Цена включает НДС** | narx НДС'ni o'z ichiga oladi | bor | ✅ |
| Промежуточный итог / Итого | hisob (statik) | bor | ✅ |

---

## 7. DISCLOSURE (pastki bo'limlar)

| Element | moysklad | Bizda | Status |
|---|---|---|---|
| **▼ Задачи** | yig'ish/ochish toggle | bor | ✅ |
| **+ Задача** | yangi vazifa qo'shish | disabled (saqlangach) | 🟡 |
| **▼ Файлы** | toggle | bor | ✅ |
| **+ Файл** | fayl biriktirish | disabled (saqlangach) | 🟡 |
| Файлы jadval (Наименование/Размер/Дата/Сотрудник) | fayl ro'yxati | bor | ✅ |

---

## 🔴 ASOSIY PARITY-GAPLAR (eng muhim — implement qilish kerak)

1. **«Добавить из справочника» BOY product-picker modal** — papka-daraxt + stok-ustunlar (Остаток/Резерв/Ожидание/Доступно) + bulk-qty kiritish + «Создать»/«Фильтр». Bizniki juda oddiy. **(eng katta)**
2. **«Создать документ» menyusi /new'da** — 11 ta related-doc (Отгрузка/Счет/Перемещение/…). Bizda BO'SH.
3. **✎ inline-edit ruchkalar** (Организация/Контрагент/Склад) — entity'ni hujjatdan chiqmasdan tahrirlash modal. Bizda yo'q.
4. **«Владелец» popover** (egasi) — Сотрудник/Отдел/Общий доступ tahrirlash. Bizda read-only ism.
5. **«Цена ▾» bulk-amallar** — Расценить (narx-tur) · Сохранить цены. Bizda yo'q.
6. **Изменить → Копировать** /new'da. Bizda bo'sh.
7. **org-account named-dropdown** vs bizning picker (mayda).
8. **Pozitsiya ustun-customizer ⚙** + qo'shimcha ustunlar (Вес/Объем/Отгружено/Резерв/Ожидание/Доступно/Остаток) — jadval boy.
9. **Адрес доставки strukturali expand** (/new'da) — Индекс/Страна/Город/Улица/Дом/Кв/Другое.
10. **«+» inline-create ruchkalar** (Канал продаж/Договор/Проект/Уста) — entity create-modal (ruchka edit-modal kabi pattern).
11. **Pastki KATTA Комментарий** joylashuvi (moysklad pastda; biz col3'da) — aniqlash kerak.

---

## ✅ Audit usuli (halol)
Real moysklad.uz (Farrux akkaunti) read-only: 6 toolbar-menyu · egasi-popover · request-payment · status · Организация-ruchka
edit-modal · «Добавить из справочника» katalog-modal · «Цена» bulk-menyu · Адрес-strukturali-forma · ustun-customizer — JONLI
ochib ko'rildi. Hech narsa saqlanmadi/o'zgartirilmadi (har modal Отмена/yopildi). Standart-pattern elementlar (oddiy ▾ select,
✕ clear, 📅 calendar, ☑ checkbox, disclosure toggle) — alohida jonli bosilmadi (xulqi aniq), lekin yuqorida hujjatlangan.

> **Eslatma:** ⚪ belgili elementlar (column ▾/⚙, Проверить комплектацию, +/calendar/checkbox) standart pattern —
> qo'shimcha jonli tekshiruv davom etmoqda; topilsa shu hujjat yangilanadi.
