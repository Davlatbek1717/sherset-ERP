# customer-order — CHUQUR JONLI SPEC (xulq-darajada, real moysklad.uz bilan)

> **Manba:** jonli moysklad.uz (Farrux akkaunti), READ-ONLY — hech narsa saqlanmadi/o'zgartirilmadi
> (har dialog «Отмена», hech qachon «Сохранить»). 2026-06-15. Parol hech qayerga log/commit QILINMADI.
> **Maqsad:** master-plan §1 SELF-VERIFY uchun xulq-darajadagi (nafaqat «element bormi») ground-truth.
> **Usul:** har interaktiv elementni JONLI ochib — type qilib, dropdown ochib, modal ochib — kuzatildi.
> Screenshotlar: `moysklad-co-new-0*.png` (repo root, gitignore emas — keyingi sessiyada o'chiriladi).
>
> **⚠️ Bu — pt12-16 «vizual audit»ning XATOSINI tuzatadi:** avval «element bor + o'xshaydi» = parity deb o'ylandi;
> bu spec har elementning ICHKI XULQINI yozadi (bosilganda nima bo'ladi). Status: **JONLI-TASDIQLANGAN**, taxmin EMAS.

---

## 0. ENG MUHIM XULQ-TOPILMALARI (root-cause: avval shularni o'tkazib yuborganman)

| # | Element | moysklad XULQI (jonli) | Bizniki | Gap |
|---|---|---|---|---|
| **A** | **Reference picker** (Организация/Контрагент/Склад/Договор/Проект/Канал/Уста) | `div.search-selector` — **editable input**. **Yozsang → INLINE autocomplete dropdown** (`.selector-popup .suggestions`), har qator = **2-qatorli (nom + tel/kod)**, scroll, yuzlab yozuv. Modal EMAS. | bosilsa **modal** ochiladi | 🔴 KATTA — xulq-model butunlay boshqa |
| **B** | **«Уста» maydoni** | **Custom attribute (доп. поле), type = «Контрагент»** — kontragent-picker (yozsang kontragentlar nom+tel bilan chiqadi). «+» = yangi kontragent yaratish. | **oddiy matn input** | 🔴 — entity-reference custom-attribute qo'llab-quvvatlanmaydi |
| **C** | **2 ta «Комментарий»** | col3 «Комментарий» = `address-widget-comment` (Адрес доставки widget ichi); **hujjat Комментарий = pastda KATTA textarea** (x40, w823, pozitsiya-jadval ostida) | hujjat Комментарий **col3'da** | 🟡 — joylashuv noto'g'ri |
| **D** | **«от» sana** | **bitta editable textbox** `gwt-DateBox` = «DD.MM.YYYY HH:MM» (sana+vaqt birga, tahrirlanadi) + alohida 📅 ikon. Ikon→kalendar; matn→inline tahrir | DatePicker `trigger` (tekshirish: matnni inline tahrirlab bo'ladimi?) | 🟡 |
| **E** | **«Добавить из справочника» modal** | BOY: papka-daraxt + jadval (rasm·Наименование·**Количество**·Остаток·Резерв·Ожидание·Доступно·Код·Артикул·Ед.изм·Розничная·Оптовая⚙) + 15-maydonli filtr + Создать▾ | oddiy | 🔴 ENG KATTA |
| **F** | **CSV import** | YO'Q (toolbar'da umuman yo'q) | bizda BOR | 🟡 — OLIB TASHLASH |
| **G** | **Default qiymatlar** | NEW formada Орг/Склад/**Контрагент**/Валюта/status oldindan to'la (server OrderService) — ehtimol «oxirgi ishlatilgan» (kontragent ham to'la = last-used xotira belgisi) | tekshirish kerak | 🟡 — qaror: last-used xotira qilamizmi? |

---

## 1. TOOLBAR

`Сохранить` (yashil) · `Закрыть` · `Изменить ▾` · `Создать документ ▾` · `🖨 Печать ▾` · `✉ Отправить ▾` · **[egasi popover: «Файзуллоев Ф. / Основной ▾»]**

- **Изменить ▾**: `Удалить` (new'da off) · `Копировать`. Bizda /new'da bo'sh. 🟡
- **Создать документ ▾** (11 ta — saqlangan buyurtmadagina faol; new'da «Сохранить?» dialogi chiqadi):
  Перемещение · Счет покупателю · Волна отбора · Отгрузка · Входящий платеж · Приходный ордер ·
  Предоплата(off) · Заказ поставщику · Заказ поставщику (с учетом «доступно») · Розничная продажа · Снабжение(off). Bizda BO'SH. 🔴
- **egasi popover** (rightSlot): «Сотрудник» selector · «Отдел» selector · ☐ «Общий доступ». Bizda faqat o'qiladigan ism. 🔴
- **CSV import YO'Q.** 🟡 (bizdan olib tashlash)

## 2. HEADER

`Заказ покупателя № [input]` · `от [📅] [DD.MM.YYYY HH:MM editable]` · `◯ Не оплачено` (pill) · `[Запросить оплату]` · `[Текширилмаган ▾]` (rangli status) · `❓` · `☑ Проведено`

## 3. META — 3 ustun (aniq joylashuv, jonli getBoundingClientRect)

**Ustun 1** (label x≈40, kontrol x≈155):
- `*Организация` [search-selector «Фаррухбек Касса»] [✕] [✎] → ostida [org-account dropdown «Сум»]
- `*Контрагент` [search-selector «Устасизлар Фаррухбек»] [✕] [✎] → ostida `Баланс : 0,00 сум`
- `План. дата отгрузки` [📅 DateBox]
- `Канал продаж` [search-selector] [+]
- `*Валюта документа` [search-selector «сум (UZS)»] [✎ kurs]
- `Уста` [search-selector=KONTRAGENT-type] [+]  ·  `Санаси` [📅 DateBox]  ← bitta qatorda

**Ustun 2** (label x≈461, kontrol x≈516):
- `Склад` [search-selector «Иподром Склад»] [✕] [✎]
- `Договор` [search-selector] [+]
- `Проект` [search-selector] [+]

**Ustun 3** (label x≈819, kontrol x≈927):
- `Адрес доставки` [textarea + ▾ expand → strukturali forma: Индекс/Страна/Город/Улица/Дом/Кв/Другое]
- `Комментарий` [textarea — BU adres-widget izohi, `address-widget-comment`]

> **Har reference-maydon pattern:** `[search-selector input ▾] [✕ clear-button] [✎ edit-button]` (Орг/Контр/Склад/Валюта),
> yoki `[search-selector ▾] [+ create]` (Канал/Договор/Проект/Уста). Type→inline autocomplete (§0-A).

## 4. PICKER XULQI (§0-A batafsil — eng muhim shared pattern)

- Input **editable** (readOnly=false). Yozilsa → `gwt-PopupPanel.selector-popup` ochiladi, ichида `.suggestions` ro'yxati.
- Har qator = **nom (1-qator) + telefon/kod (2-qator)** [kontragent uchun]. Scroll bor, yuzlab natija.
- Klaviatura: ↑↓ tanlash, Enter qabul, Esc yopadi.
- **Ikon→modal:** «Выбрать из справочника» to'liq modal alohida ikon orqali (kengaytirilgan tanlov) — bizda ham
  shu bo'lishi kerak, lekin BIRLAMCHI yo'l = type-to-inline.
- **Bizning gap:** `CatalogPickerField`/picker bosilganda DARROV modal ochadi. To'g'risi: input→inline autocomplete, modal — ikkilamchi.

## 5. FILTR PANEL (LIST view — points 5, 6)

- Layout: **4-5 ustunli grid**, keng oraliq (labels x≈64/328/592/839/1120/1384, ikki qator). Tiqilmagan. Ba'zi
  label oldida `•` bullet (saqlangan/aktiv belgisi).
- Maydonlar: Период(вч·сег·нед·мес) · Оплата · Отгружено · Товар или группа · Склад · Проект · Контрагент ·
  Организация · Счет организации · Статус · **Уста** · **Санаси**(вч·сег·нед·мес).
- Reference-filtrlar = `div.search-selector.multi-selector.filter-selector` → **type-to-search + ko'p-tanlash**
  (kontragent kabi inline autocomplete). Bizda: bosilsa modal. 🔴
- Pastda: saqlangan-filtr chiplar («ипадром», «Фаррухбек касса») + [Найти yashil] [Очистить] [🔖] [⚙].

## 6. POZITSIYA jadvali (inline)

Ustunlar: ☐ · `Наименование ▾` · `Кол-во` · `Зарезерв. ▾` · `Остаток` · `Цена ▾` · `НДС` · `Сумма НДС` · `Скидка` · `Сумма ⚙▾`
- `Цена ▾` = bulk-amal menyu (Расценить / Сохранить цены). 🔴
- `Сумма ⚙` = ustun-customizer (Изображение/Ед.изм/Отгружено/Доступно/Остаток/Резерв/Ожидание/Вес/Объём/Сумма НДС). 🔴
- `Наименование ▾`, `Зарезерв. ▾` = ustun-menyu.
- Pastda: `[Добавить позицию — input]` (type→inline product dropdown, §6b) · `[Добавить из справочника]` (§7) · `[Проверить комплектацию]`.

## 6b. INLINE MAHSULOT-QIDIRUV dropdown (points 1, 8 — user screenshot bilan ground-truth)

> «Добавить позицию» input'ga yozilganda ochiladigan dropdown (debounce; jonli user-capture, 2026-06-15).

- **Header qator:** `☑ Сортировать по «Доступно»` (checkbox, DEFAULT belgilangan → natijalar **Доступно kamayish** tartibida: 721·267·191·108·95·88·84·84·72·72…).
- **Har qator (3 qism):** `кодkod` (qalin, chap, masalan `06873`) · `наименование` (qidiruv-substring **highlight/qalin**: «Муфта Шпилка **12**») · o'ngда **rangli «Доступно» qoldiq-badge** (yashil = ko'p stok; ~30px o'ng-tekis raqam, masalan `721`). Rasm bori uchun **thumbnail** chapда.
- **Hover** = sariq fon; **tanlangan** = ko'k fon.
- **Footer 2 havola:** `Еще N товаров` (qolgan natija soni, masalan «Еще 170 товаров») + `Создать новый товар «<query>»` (inline create, query bilan).
- **Kenglik** ~input kengligida (~600px), ~10 qator + header + footer ko'rinadi, scroll.
- **Bizning gap (point 1+8):** (a) bizда ko'rinish boshqacha (kod+nom+stok-badge+highlight+«Еще N»+«Создать» yo'q yoki boshqacha); (b) **overflow bug** — bizда ota-div scroll'i tufayli dropdown pastга tushib ketadi (moyskladда anchored, toza). 🔴

## 7. «ВЫБОР ТОВАРА» BOY MODAL (§0-E — ENG KATTA gap)

- **Top:** «Выбор товара» · 🔄 · `[➕ Создать ▾]` · `[Фильтр]` · `[Наименование, код или артикул]` qidiruv · ✕
- **Filtr (15 maydon):** Наименование · Остаток[▾] · Доступно[▾] · Только с резервом[▾] · Только с ожиданием[▾] ·
  Описание · Артикул · Код · Внешний код · Штрихкод · Код ЕГАИС · Весовой товар[▾] · Тип[▾] · Группа товаров (без подгрупп)[▾] · Поставщик[▾] · [Найти][Очистить][🔖][⚙]
- **Chap:** papka-daraxt («Товары и услуги» root + papkalar, expand ▸).
- **O'ng jadval:** rasm-thumbnail · `Наименование ▲`(sortable) · **`Количество`**(editable input, per-row) · Остаток · Резерв · Ожидание · Доступно · Код · Артикул · Ед.изм · Розничная цена(валюта) · Оптовая цена `⚙`(customizer)
- **Pastda:** `[Выбрать yashil]` `[Отменить]` + pagination.
- **Xulq:** bir nechta qatorga `Количество` kiritib, bitta «Выбрать» bilan HAMMASINI qo'shadi (bulk).

## 8. PASTKI band

- **`Комментарий` (KATTA, x40 w823, pozitsiya-jadval ostida)** = HUJJAT izohi (§0-C — bizда col3'da, noto'g'ri).
- `Внешний код` (ko'k havola → input).
- `☑ НДС` · `☑ Цена включает НДС` · `Промежуточный итог` / `Итого` (statik).
- `▼ Задачи [+ Задача]` · `▼ Файлы [+ Файл]` (Наименование/Размер,МБ/Дата добавления/Сотрудник).

---

## 9. PRIORITETLI IJRO-NAVBATI (foundations birinchi — leverage tartibida)

> Reja §4: pilot umumiy poydevorlarni qurishga majbur qiladi. Tartib = ta'sir-doirasi:

1. **🔴 PICKER inline-autocomplete pattern** (§4) — har reference-maydon + har list-filtr. **Eng ko'p ta'sir** (Орг/Контр/Склад/Договор/Проект/Канал/Уста + barcha list-filtrlar, ~hamma sahifa). Type→inline dropdown (nom+tel/kod), ikon→modal ikkilamchi.
2. **🔴 FILTR panel** (§5) — picker pattern + grid-layout (keng oraliq) + multi-select + saved-filter chiplar. Pickerdan keyin tez (shared).
3. **🔴 «Выбор товара» BOY modal** (§7) — papka-daraxt + stok-ustunlar + per-row qty + 15-filtr. Eng katta alohida komponent.
4. **🔴 Уста = entity-reference custom-attribute** (§0-B) — AttributeInput'ga «Контрагент/Сотрудник/Товар»-type qo'shish (picker §1 ishlatadi).
5. **🟡 Hujjat Комментарий joyini pastga** (§0-C, §8) + col3'ni adres-widget-izohiga ajratish.
6. **🟡 «от» sana inline date+time tahrir** (§0-D).
7. **🟡 CSV import OLIB TASHLASH** (§0-F).
8. **🔴 «Создать документ» 11-menu** (§1) · **egasi popover** (§1) · **✎ inline-edit ruchkalar** · **«Цена ▾» bulk** · **pozitsiya ustun-customizer** (§6).
9. **🟡 default qiymatlar** (§0-G) — last-used xotira qarori.

> **SELF-VERIFY (master-plan §1):** har element qurilgach, MEN jonli moysklad ↔ :3100 yonma-yon, farq qidirib, 0-farq topmaguncha — keyin userга.
