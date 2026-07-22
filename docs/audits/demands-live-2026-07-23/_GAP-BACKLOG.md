# «Отгрузки» (demand) — moysklad 1:1 gap backlog (grounded 2026-07-23)

> Manba: real moysklad capture (`demand-0{1,2,3}.*`, r1699) vs hozirgi kod. Funksional/strukturaviy diff.
> **Vizual pixel-diff (bizning `:3100` vs moysklad screenshot) hali QILINMADI** — har sahifa sessiyasida qilinadi.
> Skeptik filtr (§2): ro'yxat capture'i yashirin detail-context tugmalarni ham ushlagan → «ro'yxat toolbar'da
> Добавить из справочника / Задача / Файл / Сохранить yo'q» = **FALSE gap**, tashlab yuborildi (bular list-toolbar emas).

## Xulosa
Demand bo'limi **strukturaviy jihatdan ~90% mavjud** (barcha 3 sahifa, aksar maydon/kolonka/tugma bor). Qolgan
gap'lar aniq va boshqariladigan to'plam. Aksari — mayda wiring yoki vizual guruhlash; 2–3 tasi katta DS ishi.

---

## Cross-cutting (pozitsiya jadvali — detail + create ikkalasiga tegadi)
| # | Gap | Holat | Izoh / qaror |
|---|-----|-------|--------------|
| C1 | **«Ячейка» (bin) kolonka** | DS qo'llab-quvvatlaydi (`customs.cell`), demand'ga wire QILINMAGAN | Ombor-shipping uchun qimmatli. Wire qilish arzon. Bu biznesda bin ishlatiladimi? → **user qaror** |
| C2 | **«Маркировка» kolonka** | DS'da umuman YO'Q (yangi komponent kerak) | Katta ish. Marking/labeling kodlari — biznesda kerakmi? → **user qaror (DEFER ehtimoli)** |
| C3 | **«Прибыль» (profit) qatori** | Nomuvofiq: create'da YO'Q; detail'da faqat posted (`costSumMinor>0`) | moysklad doim ko'rsatadi. Create'da COGS noma'lum → draft'da '—' ko'rsatish mumkin |
| C4 | **«Вес» / «Объём» totals** | YO'Q (ikkala sahifada) | Tovar weight/volume yig'indisi. O'rta ish |

## DETAIL (`demands/[id]`)
| # | Gap | Holat | Izoh |
|---|-----|-------|------|
| D1 | **«Связанные документы» tab doim bo'sh** | tab bor, `relatedGroups={[]}` hardcoded | related-doc grafi qurilmaydi. O'rta ish (BE `/related`?) |
| D2 | **«Отправить (N)» count-badge** | «Отправить» bor, N badge YO'Q | Mayda: yuborilgan-soni badge qo'shish |
| D3 | **«Решения» menyu** | YO'Q | moysklad-ga xos «Decisions». Niche → **user qaror (DEFER ehtimoli)** |
| D4 | **Archive / «Восстановить»** | YO'Q (list+detail) | demand'da archive lifecycle yo'q. BE+FE ish |
| D5 | **Shipping bloki «Грузоотправитель» sarlavhasi ostida guruhlanmagan** | 10 maydon bor, lekin guruhsiz | Vizual/strukturaviy guruhlash |
| D6 | **«Изменения» = collapsible seksiya, bottom-tab EMAS** | mavjud, lekin joylashuvi farq | Mayda strukturaviy |

## CREATE (`demands/new`)
| # | Gap | Holat | Izoh |
|---|-----|-------|------|
| N1 | **Custom-attributes editor YO'Q** | detail'da bor, create'da YO'Q | create'dagi «Другие поля» shipping uchun band → haqiqiy доп.поля create'da kiritib bo'lmaydi |
| N2 | **«Прибыль» YO'Q** | — | C3 ko'r |
| N3 | Shipping «Другие поля» ostida (moysklad'da «Грузоотправитель» bloki) | 10 maydon bor, joyi farq | D5 ko'r |
| — | Header tugmalar minimal (faqat Сохранить/Закрыть/Статус) | moysklad create ham minimal | **PARITY OK** (gap emas) |

## LIST (`demands`)
| # | Gap | Holat | Izoh |
|---|-----|-------|------|
| L1 | **«Грузополучатель» kolonka** | YO'Q (consignee list query'da tanlanmaydi) | O'rta ish |
| L2 | **Filtr «Тип возврата»** | YO'Q | return-type filtr |
| L3 | **Filtr «Товар или группа»** | YO'Q | product/group filtr |
| L4 | **Filtr «Грузополучатель»** | YO'Q (Контрагент bor) | consignee filtr |
| — | Bulk «Статус» dedicated menyu | «Изменить» ichida Провести/Снять bor | PARTIAL — moysklad alohida «Статус». Mayda |

## Bizda ORTIQCHA bor (moysklad capture ko'rsatmadi — saqlanadi, olib tashlanmaydi)
- LIST: Заказ покупателя kolonka, Статус badge, positions-count; ~11 qo'shimcha filtr (Группа контрагента, Договор,
  Организация, Счёт организации, Статус, Проведено, Напечатано, Отправлено, Канал продаж, Владелец, Сумма-range, Когда изменен).
- DETAIL/CREATE: Накладные расходы (overhead) + taqsimot, Счёт организации, План. дата отгрузки/оплаты, editable kurs (/new),
  Задачи/Файлы seksiyalari, email-yuborish dialogi.

## Rank (eng ta'sirlisidan)
1. **C1 Ячейка** · 2. **C3/N2 Прибыль** (create+draft) · 3. **D1 Связанные документы** (bo'sh) · 4. **L1 Грузополучатель kolonka** ·
5. **L2/L3/L4 3 filtr** · 6. **D5/N3 Грузоотправитель guruhlash** · 7. **C4 Вес/Объём** · 8. **D2 Отправить badge** ·
9. **N1 create custom-attrs** · 10. **D4 archive** · 11. **D6 Изменения tab** · 12. **C2 Маркировка** (katta, DEFER?) · 13. **D3 Решения** (niche, DEFER?)

## Keyingi (sahifama-sahifa, spec bo'yicha)
Har sahifa sessiyasida: (a) bizning `:3100`ni ochib **vizual pixel-diff** (screenshot yonma-yon) → vizual delta ro'yxati,
(b) shu sahifaga tegishli funksional gap'larni tuzatish, (c) gate + browser-cert. Boshlash: **CREATE (/new)**.
