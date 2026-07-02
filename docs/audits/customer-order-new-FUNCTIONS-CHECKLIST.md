# customer-order /new — TO'LIQ FUNKSIYA RO'YXATI (parity checklist)

> Bitta sahifaning HAR funksiyasi. Belgilar: ✅ moysklad-mos (qurilgan) · 🟡 qisman · 🔴 yo'q.
> Manba: jonli deep-spec (`customer-order-DEEP-LIVE-SPEC.md`) + qurilgan kod. 2026-06-16.

## 1. TOOLBAR (yuqori panel)
- [x] 1. Сохранить — saqlash ✅
- [x] 2. Закрыть — yopish (ro'yxatga qaytadi) ✅
- [ ] 3. Изменить ▾ — menyu tugma 🟡
  - [ ] 3a. → Удалить (/new'da o'chiq) 🟡
  - [ ] 3b. → Копировать (/new'da o'chiq — saqlangач) 🔴
- [x] 4. Создать документ ▾ — menyu tugma ✅
  - [x] 4a. → Отгрузка ✅
  - [x] 4b. → Счёт покупателю ✅
  - [x] 4c. → Входящий платёж ✅
  - [ ] 4d. → Перемещение 🔴
  - [ ] 4e. → Волна отбора 🔴
  - [ ] 4f. → Приходный ордер 🔴
  - [ ] 4g. → Заказ поставщику 🔴
  - [ ] 4h. → Заказ поставщику (с учётом «доступно») 🔴
  - [ ] 4i. → Розничная продажа 🔴
  - [ ] 4j. → Снабжение 🔴
- [x] 5. Печать ▾ — print shablonlar menyusi ✅
- [x] 6. Отправить ▾ — email shablonlar menyusi ✅
- [x] 7. Egasi «Владелец» popover ✅
  - [x] 7a. → Сотрудник selector ✅
  - [x] 7b. → Отдел selector ✅
  - [x] 7c. → ☐ Общий доступ ✅

## 2. SARLAVHA (header)
- [x] 8. № input (raqam, bo'sh=avto) ✅
- [x] 9. от — sana yozish (DD.MM.YYYY HH:MM) ✅
- [x] 10. от — kalendar ikon (bosilsa kalendar) ✅
- [x] 11. ◯ Не оплачено — to'lov-holati pill ✅
- [x] 12. Запросить оплату — tugma ✅
- [x] 13. Status ▾ — rangli statuslar dropdown (har statusni tanlash) ✅
- [x] 14. ❓ — help tooltip ✅
- [x] 15. ☐ Проведено — checkbox ✅

## 3. MAYDONLAR (meta — 3 ustun)
### Организация
- [x] 16. dropdown (yozsang ro'yxat / tanlash) ✅
- [x] 17. ✕ tozalash ✅
- [x] 18. ✎ tahrirlash (yangi tabда) ✅
- [x] 19. org-hisob dropdown (ostida, «Сум») ✅
### Контрагент
- [x] 20. dropdown (yozsang — ism + telefon) ✅
- [x] 21. ✕ tozalash ✅
- [x] 22. ✎ tahrirlash ✅
- [x] 23. + yangi kontragent ✅
- [x] 24. «Баланс : 0,00 сум» caption ✅
### План. дата отгрузки
- [x] 25. sana input ✅
- [x] 26. kalendar ikon ✅
### Канал продаж
- [x] 27. dropdown ✅
- [x] 28. + yangi kanal ✅
### Валюта документа
- [x] 29. dropdown ✅
- [x] 30. ✎ kurs tahrirlash ✅
### Уста (custom field, type=Контрагент)
- [x] 31. dropdown (kontragent picker) ✅
- [x] 32. + yangi ✅
### Санаси (custom field, sana)
- [x] 33. sana input ✅
- [x] 34. kalendar ✅
### Склад
- [x] 35. dropdown ✅
- [x] 36. ✕ ✅
- [x] 37. ✎ ✅
### Договор
- [x] 38. dropdown ✅
- [x] 39. + ✅
### Проект
- [x] 40. dropdown ✅
- [x] 41. + ✅
### Счёт контрагента
- [x] 42. dropdown ✅
### Адрес доставки (expand)
- [x] 43. ▾ ochish (strukturali forma) ✅
- [x] 44. Индекс ✅
- [x] 45. Страна dropdown ✅
- [x] 46. Город ✅
- [x] 47. Улица ✅
- [x] 48. Дом ✅
- [x] 49. Кв./офис ✅
- [x] 50. Другое ✅
- [x] 51. Комментарий (adres izohi) ✅

## 4. TABLAR
- [x] 52. Главная ✅
- [x] 53. Связанные документы ✅

## 5. POZITSIYA JADVALI
- [x] 54. ☐ select-all ✅
- [x] 55. # (tartib raqami) ✅
- [ ] 56. Наименование ▾ — ustun-menyu 🟡
- [x] 57. Кол-во ✅
- [x] 58. Остаток ✅
- [x] 59. Доступно ✅
- [x] 60. Цена ▾ — bulk menyu ✅
  - [x] 60a. → Расценить (narx-tur bo'yicha) ✅
  - [x] 60b. → Сохранить цены ✅
- [x] 61. НДС ✅
- [x] 62. Сумма НДС ✅
- [x] 63. Скидка ✅
- [x] 64. Вес ✅
- [x] 65. Сумма ⚙ — ustun-customizer ✅
  - [x] 65a-i. checkbox×9: Изображение/Зарезерв./Остаток/Доступно/Ожидание/Отгружено/Вес/Объём/Сумма НДС ✅
- [x] 66. qator: drag (tartib) ✅
- [x] 67. qator: ✕ o'chirish ✅
- [x] 68. qator: katak tahrir (qty/narx/chegirma/НДС) ✅

## 6. POZITSIYA QO'SHISH (past panel)
- [x] 69. «Добавить позицию» input — inline ro'yxat (kod+nom+qoldiq-badge+«Еще N»+«Создать») ✅
- [x] 70. Добавить из справочника — MODAL ochadi ✅
- [x] 71. Проверить комплектацию ✅

## 7. «ВЫБОР ТОВАРА» MODAL (ichki funksiyalar)
- [x] 72. Sarlavha «Выбор товара» ✅
- [x] 73. Qidiruv input ✅
- [x] 74. ✕ yopish ✅
- [x] 75. Chap: papka-daraxt (har papka filtr) ✅
- [x] 76. Jadval ustunlari: 🖼рам/Наименование▲/Кол-во/Остаток/Резерв/Ожидание/Доступно/Код/Артикул/Ед.изм/narx-turlari⚙ ✅
- [x] 77. Har qatorда Количество input (ko'p-tovar) ✅
- [x] 78. Выбрать (bulk qo'shadi) ✅
- [x] 79. Отменить ✅
- [x] 80. Фильтр panel — core API-supported (Тип/Показывать/Штрихкод/Ниже минимума) ✅ `8f093a78` · 🟡 qolgan 11 maydon (Только с резервом/ожиданием/Описание/Внешний код/Код ЕГАИС/Весовой/Группа/Поставщик…) backend-filtr yo'q
- [x] 81. Создать ▾ (modal ichida yangi tovar) ✅ `ea52aa26`
- [x] 82. Ustun-bo'yicha sort (Наименование/Код, server-side) ✅
- [x] 83. Narx-turi ustunlari + ⚙ customizer (Розничная/Оптовая = akkaunt narx-turlari; default=asosiy, ⚙ qolganini ochadi) ✅ · 🟡 demo akkaunt narx-turlari ifloslangan («RT-Price-Updated-*» test-leak) → moysklad'cha «Розничная/Оптовая» ko'rinishi uchun seed tozalash kerak
- [x] 84. Rasm-thumbnail (mainImageId → /api/v1/images/:id/raw, rasm yo'qda placeholder) ✅ · 🟡 demo tovarlarida rasm yo'q → placeholder ko'rinadi
- [x] 85. 🔄 yangilash ✅

## 8. PAST BAND
- [x] 86. Комментарий (katta textarea — hujjat izohi) ✅
- [x] 87. Внешний код (havola → input) ✅
- [x] 88. ☐ НДС ✅
- [x] 89. ☐ Цена включает НДС ✅
- [x] 90. Промежуточный итог (statik) ✅
- [x] 91. Итого (statik) ✅
- [x] 92. Кол-во (jami, statik) ✅

## 9. ЗАДАЧИ / ФАЙЛЫ (disclosure)
- [x] 93. ▼ Задачи toggle ✅
- [x] 94. + Задача ✅
- [x] 95. ▼ Файлы toggle ✅
- [x] 96. + Файл ✅
- [x] 97. Файлы jadval (Наименование/Размер/Дата/Сотрудник) ✅

---

## 📊 JAMI HISOB (yangilandi 2026-06-16 — «Выбор товара» modal TUGADI)
- **Jami funksiya: ~97 element** (kichik-kichiklar bilan)
- ✅ Mos (qurilgan): **~92** (modal ICHI #72–85 endi to'liq: thumbnail/Артикул/narx-turlari⚙/sort/refresh + Фильтр/Создать)
- 🟡 Qisman: **~3** (Изменить-menyu · Наименование pozitsiya-ustun-menyu · modal Фильтр'da 11 backend-yo'q maydon)
- 🔴 Yo'q: **~9** (Создать exotic-8 = katta backend sub-sistema · Копировать /new'da N/A)

**Eng katta qolgan blok = «Создать документ» exotic oqimlar (#4d–4j, 8 ta)** — har biri backend+frontend sub-sistema
(Перемещение/Волна отбора/Приходный ордер/Заказ поставщику/Розничная продажа/Снабжение) — ko'p-sessiyalik ish.

**⚠️ Demo-data tozalash (kod EMAS, seed):** demo akkaunt narx-turlari ifloslangan («Default» + 11×«RT-Price-Updated-*»
test-leak) → modal narx-ustunlari moysklad'cha «Розничная/Оптовая» ko'rinishi uchun seed'da toza 2 narx-turi kerak.
Demo tovarlarida rasm yo'q → thumbnail ustuni placeholder ko'rsatadi (kod to'g'ri, real rasm bo'lsa render bo'ladi).
