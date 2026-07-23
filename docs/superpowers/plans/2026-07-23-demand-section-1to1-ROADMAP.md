# «Отгрузки» (demand) to'liq 1:1 — QISMLARGA BO'LINGAN YO'L XARITASI

> **Maqsad:** 3 sahifa (ro'yxat/detal/yaratish) moysklad bilan **100% bir xil** (vizual+funksional).
> **Qoida:** har QISM = mustaqil «tayyor» bosqich + **browser-cert** (`:3100` moysklad yoniga qo'yib tasdiqlanadi).
> «100%» yorlig'i FAQAT oxirgi QISM (Phase-2 QA) tugagach beriladi (`CLAUDE.md` halollik-qoidasi).
> Manba: `docs/audits/demands-live-2026-07-23/` (capture + `_GAP-BACKLOG.md` + `_new-visual-delta.md`).

Har qism `[ ]` = tugallanmagan. Sessiya oxirida browser-cert bo'lgan bosqich `[x]` bo'ladi.

---

## QISM 1 — YARATISH sahifasi (`/new`)  ·  reja: `2026-07-23-demand-new-1to1.md`

### 1A — Vizual mos  →  ✅ **TAYYOR 2026-07-23** (`da20554`, live browser smoke `:3100` vs `demand-03-new.png`; audit `docs/audits/_demand-new-1A.audit.md`)
- [x] Maydon-grid moysklad 3-ustunli ixcham tartibga (chap/o'rta/o'ng) — customer-order metaPanel namunasi, tab'lar USTIDA
- [x] «Адрес доставки» + «Комментарий» o'ng-tepа ustunga (Textarea)
- [x] Header'ga «Не оплачено» to'lov-pill; status «Статус» rangli-kvadrat popup (`/states?entityType=demand`, bo'sh→kulrang)
- [x] «Другие поля» tepа inline-havola (metaPanel'dan keyin, tab'lar oldida) — план-sanalar shu yerga ko'chdi
- [x] Pozitsiya sarlavha **i18n RU-leak** tuzatish (har kolonkaga tCols/tPos label) + ortiqcha #/image/Уп./Сумма НДС olib tashlandi
- [x] «Цена включает НДС» default = checked (vatIncluded=true, grounding). *(totals «Кол-во»→«Прибыль» swap = QISM 1B, chunki Прибыль create-COGS state kerak)*

### 1B — Funksional mos  →  **TAYYOR when:** `/new` save round-trip 1:1 (marking'dan tashqari), browser-cert · **QISMAN (3/5 + 1 rad, `bc54662`)**
- [x] ~~Shipping 10 maydon «Грузоотправитель» sarlavhali blok~~ **RAD ETILDI (premise-error, §4):** capture'да «Грузоотправитель» = field labeli, seksiya-sarlavha EMAS → moysklad bunday blok qilmaydi. GAP D5/N3 xato.
- [x] Custom-attributes editor create'da (detail parity) — `AttributesEditor entity="Demand"` (detail bilan bir xil, inline totals ostida) + payload `attributes`. **E2E DB round-trip verified** (`_demand-new-1B-attrs.audit.md`) ✅
- [x] «Прибыль» qatori — `DocumentTotalsPanel profitMinor={0n}` (qoralama COGS FIFO-at-post → 0,00, moysklad create parity) + «Кол-во» olib tashlandi. Live smoke ✅
- [ ] «Ячейка» (bin) kolonka — *(keyingi sessiya: `DemandPosition`'да `cell` ustun YO'Q → BE schema+migration, §wiring protokoli)*
- [x] Pozitsiya **«Остаток»** (jonli qoldiq) — `rowsWithStock` merge + `{key:'stock'}`, Кол-во'dan keyin, live smoke «Qoldiq: 140» ✅. *(«Себест. единицы» = DEFER: /products buyPrice'ni QASDDAN strip qiladi + qoralamada FIFO-cost yo'q)*

> **QISM 1 TAYYOR** = yangi otgruzka formasi moysklad bilan **to'liq bir xil** (marking bundan mustasno, u QISM 4).

---

## QISM 2 — DETAL sahifasi (`[id]`)

### 2A — Vizual+struktura  →  **TAYYOR when:** ochilgan otgruzka moysklad detali bilan ko'rinadigan farqsiz
- [ ] Maydon-grid + «Грузоотправитель» blok + «Другие поля» joylashuvi (1A bilan izchil)
- [ ] «Изменения» bottom-tab sifatida (hozir inline bottom-seksiya). **⚠️ CROSS-DOC QAROR KERAK:** `DetailContentTabs` ATAYLAB Изменения'ni inline-seksiya qiladi (Файлы/Задачи bilan birga), test-lock bilan (`detail-content-tabs.test.tsx:38-39`). moysklad = 3-tab. O'zgartirish BARCHA hujjat-detallariga ta'sir qiladi → demand-only emas, userdan so'ralsin. DEFER.
- [ ] Pozitsiya kolonka to'plami + i18n (1B bilan izchil)

### 2B — Funksional mos  →  **TAYYOR when:** detal amallari 1:1, browser-cert
- [ ] «Прибыль» doim ko'rsatiladi (hozir faqat posted)
- [ ] «Связанные документы» tab **to'ldiriladi** (hozir bo'sh `[]`) — BE related-graph
- [ ] «Отправить (N)» count-badge
- [ ] «Решения» menyu (moysklad Decisions)
- [ ] Archive / «Восстановить» lifecycle (BE+FE)
- [ ] «Ячейка» + «Остаток»/«Себест.» kolonkalari (1B bilan izchil)

> **QISM 2 TAYYOR** = bitta otgruzkani ochib ko'rish/tahrirlash moysklad bilan **to'liq bir xil**.

---

## QISM 3 — RO'YXAT sahifasi  →  **TAYYOR when:** ro'yxat moysklad `demand-01-list` bilan ko'rinadigan farqsiz + funksional · **QISMAN (3/6, `b2fe49f`)**
- [x] «Грузополучатель» kolonka (consignee list `include` + ustun, Контрагент↔Организация orasida, default-visible) — migration YO'Q (relatsiya+indeks avval bor). Phase-1.
- [x] Filtr «Грузополучатель» (`consigneeId` param + buildListWhere + InlineFilterPanel maydoni + CatalogPicker modal). Phase-1.
- [x] Filtr «Товар или группа» (`productId` → `positions.some.productId`, CO/invoice-out namunasi) — **product bo'yicha**; guruh (folder subgroup rekursiyasi) DEFER (CO ham hozir faqat product). Phase-1.
- [ ] Filtr «Тип возврата» (return-type) — MEDIUM: `SalesReturn.demandId`/`SalesReturnPosition.demandPositionId` linkage bor, ammo qty-aggregation kerak («Без возвратов» = CLEAN `salesReturns: { none }`; Частично/Полностью = 2-bosqichli query yoki denormalizatsiya). Keyingi sessiya.
- [ ] Bulk «Статус» alohida menyu (hozir «Изменить» ichida)
- [ ] Toolbar parity (Печать/Создать документ/Импорт tekshir)

> **QISM 3 TAYYOR** = otgruzkalar ro'yxati (kolonka/filtr/bulk/toolbar) moysklad bilan **to'liq bir xil**.

---

## QISM 4 — МАРКИРОВКА (marking) — 3 sahifaga UMUMIY  →  **TAYYOR when:** marking ustuni ro'yxat+detal+yaratishда ishlaydi
- [ ] Design-system'da yangi «Маркировка» ustun-turi (DS'da hozir yo'q)
- [ ] BE: pozitsiya marking maydoni (schema + migration)
- [ ] 3 sahifaga wire (POSITION_COLUMNS + PositionEditor)
- [ ] browser-cert har 3 sahifada

> **QISM 4 TAYYOR** = marking (Честный знак va h.k.) 3 sahifada moysklad'dek.

---

## QISM 5 — PHASE-2 QA (butun bo'lim)  →  **TAYYOR when:** 3 sahifa runtime-tasdiqlangan → «100% 1:1» yorlig'i
- [ ] 3 sahifa real brauzer + adversarial QA (concurrency / pul-integrity / edge-case / authorization)
- [ ] moysklad yonma-yon YAKUNIY vizual diff (har 3 sahifa) — ko'rinadigan farq qolmasin
- [ ] Audit doc'lar + progress.json + NEXT.md «Отгрузки: Phase-2 verified, 100% 1:1»

> **QISM 5 TAYYOR = BUTUN «Отгрузки» BO'LIMI 100% 1:1** (halol, browser-tasdiqlangan).

---

## Xulosa (halol taxmin)
- ~6-8 fokusli sessiya (QISM 1 va 2 har biri 1-2 sessiya bo'lishi mumkin).
- Har sessiya = 1 QISM/milestone → commit → browser-cert → NEXT.md hand-off (keyingi arzon boshlanadi).
- **«100%» faqat QISM 5 tugagach** yoziladi — undan oldin har commit «Phase-1 / vizual-verified» deb halol belgilanadi.
- Tartib: **1A → 1B → 2A → 2B → 3 → 4 → 5** (yaratish eng tayyor, undan boshlaymiz; marking oxirroqда umumiy).
