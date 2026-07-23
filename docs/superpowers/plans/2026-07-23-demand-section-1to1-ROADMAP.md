# «Отгрузки» (demand) to'liq 1:1 — QISMLARGA BO'LINGAN YO'L XARITASI

> **Maqsad:** 3 sahifa (ro'yxat/detal/yaratish) moysklad bilan **100% bir xil** (vizual+funksional).
> **Qoida:** har QISM = mustaqil «tayyor» bosqich + **browser-cert** (`:3100` moysklad yoniga qo'yib tasdiqlanadi).
> «100%» yorlig'i FAQAT oxirgi QISM (Phase-2 QA) tugagach beriladi (`CLAUDE.md` halollik-qoidasi).
> Manba: `docs/audits/demands-live-2026-07-23/` (capture + `_GAP-BACKLOG.md` + `_new-visual-delta.md`).

Har qism `[ ]` = tugallanmagan. Sessiya oxirida browser-cert bo'lgan bosqich `[x]` bo'ladi.

---

## QISM 1 — YARATISH sahifasi (`/new`)  ·  reja: `2026-07-23-demand-new-1to1.md`

### 1A — Vizual mos  →  **TAYYOR when:** `/new` moysklad `demand-03-new.png` bilan ko'rinadigan farqsiz (browser-cert screenshot)
- [ ] Maydon-grid moysklad 3-ustunli ixcham tartibga (chap/o'rta/o'ng)
- [ ] «Адрес доставки» + «Комментарий» o'ng-tepа ustunga
- [ ] Header'ga «Не оплачено» to'lov-pill; status «Статус» rangli-kvadrat popup (shared komponent)
- [ ] «Другие поля» tepа inline-havola (pastdagi katta panel emas)
- [ ] Pozitsiya sarlavha **i18n RU-leak** tuzatish (uz-locale'da uzbekcha)
- [ ] «Цена включает НДС» default = checked (grounding); totals «Кол-во» ortiqcha holatini moslashtir

### 1B — Funksional mos  →  **TAYYOR when:** `/new` save round-trip 1:1 (marking'dan tashqari), browser-cert
- [ ] Shipping 10 maydon «Грузоотправитель» sarlavhali blok
- [ ] Custom-attributes editor create'da (detail parity)
- [ ] «Прибыль» qatori (pozitsiya state'ni `buyPrice` bilan kengaytir)
- [ ] «Ячейка» (bin) kolonka (`{key:'cell'}` — DS qo'llaydi) + BE
- [ ] Pozitsiya «Остаток» (jonli qoldiq) + «Себест. единицы» kolonkalari

> **QISM 1 TAYYOR** = yangi otgruzka formasi moysklad bilan **to'liq bir xil** (marking bundan mustasno, u QISM 4).

---

## QISM 2 — DETAL sahifasi (`[id]`)

### 2A — Vizual+struktura  →  **TAYYOR when:** ochilgan otgruzka moysklad detali bilan ko'rinadigan farqsiz
- [ ] Maydon-grid + «Грузоотправитель» blok + «Другие поля» joylashuvi (1A bilan izchil)
- [ ] «Изменения» bottom-tab sifatida (hozir collapsible seksiya)
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

## QISM 3 — RO'YXAT sahifasi  →  **TAYYOR when:** ro'yxat moysklad `demand-01-list` bilan ko'rinadigan farqsiz + funksional
- [ ] «Грузополучатель» kolonka (consignee list query + ustun)
- [ ] Filtr «Тип возврата» (return-type)
- [ ] Filtr «Товар или группа» (product/group)
- [ ] Filtr «Грузополучатель»
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
