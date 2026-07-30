# «Отгрузки» (demand) — moysklad 1:1 gap backlog (grounded 2026-07-23)

> Manba: real moysklad capture (`demand-0{1,2,3}.*`, r1699) vs hozirgi kod. Funksional/strukturaviy diff.
> **Vizual pixel-diff (bizning `:3100` vs moysklad screenshot) hali QILINMADI** — har sahifa sessiyasida qilinadi.
> Skeptik filtr (§2): ro'yxat capture'i yashirin detail-context tugmalarni ham ushlagan → «ro'yxat toolbar'da
> Добавить из справочника / Задача / Файл / Сохранить yo'q» = **FALSE gap**, tashlab yuborildi (bular list-toolbar emas).

## Xulosa
Demand bo'limi **strukturaviy jihatdan ~90% mavjud** (barcha 3 sahifa, aksar maydon/kolonka/tugma bor). Qolgan
gap'lar aniq va boshqariladigan to'plam. Aksari — mayda wiring yoki vizual guruhlash; 2–3 tasi katta DS ishi.

## Bajarilish jurnali
- **2026-07-30** — **C1 «Ячейка» YOPILDI** (rank #1). Migratsiya `demand_positions.cell_id/cell` + zod + create/update
  `assertCellsInStore` + post/unpost/cancel deltalarida `cellId` + FE ustun (`/new` va `/[id]`, `CellPickerField`).
  Namuna: purchase-return (boshqa chiquvchi hujjat). Test: `demand-cell.test.ts` (10) — manba-skan guard'lari
  o'zgarishdan oldingi faylda 0 mos beradi (bo'sh emasligi o'lchandi). **API runtime tasdiqlandi**: yacheyka
  qoldig'i 30→28 (o'tkazish), 28→30 (bekor, zero-sum), mavjud bo'lmagan yacheyka 400. **Brauzer-QA YO'Q.**
- **2026-07-30** — **C3+C4+N2 totals bloki YOPILDI** (rank #2, #7). Capture ground-truth: `Промежуточный итог ·
  НДС · Итого · Прибыль · Вес · Объем · Кол-во`. «Прибыль» endi ikkala sahifada doim ko'rinadi — tannarx
  ma'lum bo'lsa son, qoralamada «—» (DS `profitUnknown` propi). **Son o'ylab topilmaydi**: `sum − 0` daromadni
  foyda deb ko'rsatgan bo'lardi. «Вес»/«Объём» — `docMeasureTotals` (apps/web/src/lib/doc-totals.ts, 7 test),
  xom birlikda (g/ml) — pozitsiya ustunidagi `lineMeasure` bilan aynan bir xil, aks holda footer qatorlarga
  qarama-qarshi bo'lardi. Create'da `weightG/volumeML` uch tanlash joyida to'ldiriladi (yakka, ommaviy,
  «Заменить») — ilgari umuman o'qilmasdi. **Brauzer-QA YO'Q.**
- **2026-07-30** — **N1 create доп.поля YOPILDI**. Backend `CreateDemandSchema` `attributes`ni allaqachon
  qabul qilardi — faqat forma maydon bermasdi, ya'ni MAJBURIY custom maydoni bor akkauntda /new dan jo'natma
  yaratib bo'lmasdi. Endi asosiy meta-panelda (customer-orders/new naqshi). Runtime: maydon yaratildi →
  jo'natma o'sha qiymat bilan yaratildi → o'qishda qaytdi. Noma'lum kod 201 qaytaradi, lekin
  `validateAndNormalize` chiqishni faqat ma'lum metalardan quradi — noma'lum kalit SAQLANMAYDI (oq ro'yxat).
- **2026-07-30** — **L1 «Грузополучатель» kolonka** allaqachon yopilgan ekan (web ustun + API `consignee` select);
  ro'yxat 2026-07-23 dan eskirgan edi.
- Eslatma: C2 «Маркировка» uchun «DS'da umuman YO'Q» dan'vosi ham **eskirgan** — `DocPositionRow.marking` mavjud
  (`packages/design-system/src/document-editor/PositionTable.tsx`). Qayta baholash kerak.

---

## Cross-cutting (pozitsiya jadvali — detail + create ikkalasiga tegadi)
| # | Gap | Holat | Izoh / qaror |
|---|-----|-------|--------------|
| C1 | **«Ячейка» (bin) kolonka** | ✅ **BAJARILDI 2026-07-30** — uchdan-uchgacha (DB→API→FE), runtime tasdiqlangan | Brauzer-QA hali yo'q |
| C2 | **«Маркировка» kolonka** | DS'da umuman YO'Q (yangi komponent kerak) | ✅ **QURILADI** (user 2026-07-23). KATTA ish → ehtimol alohida sub-project |
| C3 | **«Прибыль» (profit) qatori** | ✅ **BAJARILDI 2026-07-30** — qator doim ko'rinadi; tannarx noma'lum bo'lsa «—» | Son O'YLAB TOPILMAYDI (daromadni foyda deb ko'rsatish xavfi) |
| C4 | **«Вес» / «Объём» totals** | ✅ **BAJARILDI 2026-07-30** — `docMeasureTotals`, ikkala sahifada | Xom birlik (g/ml) — pozitsiya ustuni bilan bir xil |

## DETAIL (`demands/[id]`)
| # | Gap | Holat | Izoh |
|---|-----|-------|------|
| D1 | ~~«Связанные документы» tab doim bo'sh~~ | ✅ **ALLAQACHON BOR** (2026-07-30 tekshiruvi) — `relatedGroups={[]}` ishlatilmaydigan eski prop; tarkib `relatedSlot`→`<RelatedDocsTab>` orqali keladi: BE `GET /demands/:id/related` (Заказ покупателя + Возвраты + Перемещения) + qo'lda «Привязать документ» | Ro'yxatdagi asl da'vo NOTO'G'RI edi |
| D2 | **«Отправить (N)» count-badge** | «Отправить» bor, N badge YO'Q | Mayda: yuborilgan-soni badge qo'shish |
| D3 | **«Решения» menyu** | YO'Q | ✅ **QURILADI** (user 2026-07-23). moysklad «Decisions» |
| D4 | **Archive / «Восстановить»** | YO'Q (list+detail) | ✅ **QURILADI** (user 2026-07-23). BE+FE ish |
| D5 | **Shipping bloki «Грузоотправитель» guruhlash** | ✅ **BAJARILDI 2026-07-30** — alohida blok; bizning qo'shimchalar «Другие поля»ga chiqarildi | Ikkala sahifada bir xil |
| D6 | **«Изменения» = collapsible seksiya, bottom-tab EMAS** | tarix MAVJUD (`DocumentHistoryLink` + `auditEntity="Demand"`, `historyInline={false}`) — faqat joylashuvi farq | Mayda strukturaviy, funksional gap emas |

## CREATE (`demands/new`)
| # | Gap | Holat | Izoh |
|---|-----|-------|------|
| N1 | **Custom-attributes editor YO'Q** | ✅ **BAJARILDI 2026-07-30** — доп.поля asosiy meta-panelda (customer-orders/new naqshi) | Runtime: yaratish→o'qish qiymat saqlandi |
| N2 | **«Прибыль» YO'Q** | ✅ **BAJARILDI 2026-07-30** — «—» bilan (qoralamada tannarx yo'q) | C3 ko'r |
| N3 | Shipping «Грузоотправитель» bloki | ✅ **BAJARILDI 2026-07-30** | D5 ko'r |
| — | Header tugmalar minimal (faqat Сохранить/Закрыть/Статус) | moysklad create ham minimal | **PARITY OK** (gap emas) |

## LIST (`demands`)
| # | Gap | Holat | Izoh |
|---|-----|-------|------|
| L1 | ~~«Грузополучатель» kolonka~~ | ✅ **ALLAQACHON BOR** — web ustuni standart ko'rinadi + API `consignee: {select}` | Ro'yxat eskirgan edi |
| L2 | **Filtr «Тип возврата»** | ❌ YO'Q — **ATAYLAB** | moysklad'da bu akkaunt-maxsus (custom) maydon, standart emas. Panel izohida hujjatlangan. Gap deb hisoblanmaydi |
| L3 | ~~Filtr «Товар или группа»~~ | ✅ **ALLAQACHON BOR** — FE `products` holati → `productIds` → BE `positions.some.productId in` | Ro'yxat eskirgan edi |
| L4 | ~~Filtr «Грузополучатель»~~ | ✅ **ALLAQACHON BOR** — FE `consignees` → `consigneeIds` → BE `consigneeId in` | Ro'yxat eskirgan edi |
| — | Bulk «Статус» dedicated menyu | «Изменить» ichida Провести/Снять bor | PARTIAL — moysklad alohida «Статус». Mayda |

## Bizda ORTIQCHA bor (moysklad capture ko'rsatmadi — saqlanadi, olib tashlanmaydi)
- LIST: Заказ покупателя kolonka, Статус badge, positions-count; ~11 qo'shimcha filtr (Группа контрагента, Договор,
  Организация, Счёт организации, Статус, Проведено, Напечатано, Отправлено, Канал продаж, Владелец, Сумма-range, Когда изменен).
- DETAIL/CREATE: Накладные расходы (overhead) + taqsimot, Счёт организации, План. дата отгрузки/оплаты, editable kurs (/new),
  Задачи/Файлы seksiyalari, email-yuborish dialogi.

## ⚠️ Ro'yxatning ishonchliligi (2026-07-30 qayta-tekshiruvi)
12 gap'dan **5 tasi aslida allaqachon bajarilgan** edi (L1, L3, L4, D1 va qisman D6), 1 tasi ataylab rad etilgan
(L2 — akkaunt-maxsus maydon). Ya'ni 2026-07-23 dagi ro'yxat kodni to'liq tekshirmasdan yozilgan.
**Sabog'i: bu jadvalni ko'r-ko'rona ish ro'yxati sifatida olmang** — har bandni kodda tasdiqlang.
**Holat 2026-07-30 sessiyasi oxirida** — 13 banddan **11 tasi yopiq**:
- Shu sessiyada bajarildi: **C1, C3, C4, N1, N2, D5/N3**
- Allaqachon bor edi (ro'yxat noto'g'ri): **L1, L3, L4, D1, D6**
- Ataylab rad etilgan: **L2** (akkaunt-maxsus maydon)
- **HAQIQATAN OCHIQ qolgani: D2** (Отправить badge) · **D3** (Решения menyu) ·
  **D4** (arxiv, BE+FE) · **C2** (Маркировка — katta, alohida quyi-loyiha)

## Rank (eng ta'sirlisidan)
1. **C1 Ячейка** · 2. **C3/N2 Прибыль** (create+draft) · 3. **D1 Связанные документы** (bo'sh) · 4. **L1 Грузополучатель kolonka** ·
5. **L2/L3/L4 3 filtr** · 6. **D5/N3 Грузоотправитель guruhlash** · 7. **C4 Вес/Объём** · 8. **D2 Отправить badge** ·
9. **N1 create custom-attrs** · 10. **D4 archive** · 11. **D6 Изменения tab** · 12. **C2 Маркировка** (katta, DEFER?) · 13. **D3 Решения** (niche, DEFER?)

## Keyingi (sahifama-sahifa, spec bo'yicha)
Har sahifa sessiyasida: (a) bizning `:3100`ni ochib **vizual pixel-diff** (screenshot yonma-yon) → vizual delta ro'yxati,
(b) shu sahifaga tegishli funksional gap'larni tuzatish, (c) gate + browser-cert. Boshlash: **CREATE (/new)**.
