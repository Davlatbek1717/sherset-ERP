# «Возвраты покупателей» (salesreturn) to'liq 1:1 — QISMLARGA BO'LINGAN YO'L XARITASI

> **Maqsad:** 3 sahifa (ro'yxat / detal / yaratish) moysklad bilan **100% bir xil** (vizual + funksional).
> **Qoida:** har QISM = mustaqil «tayyor» bosqich + **browser-cert** (`:3100` moysklad capture yoniga qo'yib tasdiqlanadi).
> «100%» yorlig'i FAQAT oxirgi QISM (Phase-2 QA) tugagach beriladi (`CLAUDE.md` halollik-qoidasi).
> **Grounding:** `docs/audits/sales-returns-live-2026-07-23/_GAP-BACKLOG.md` (jonli capture, 1834 real yozuv) +
> `docs/moysklad-reference/salesreturn/` (gitignore — PII). Har QISM = alohida sessiya (CLAUDE.md §0).

Har delta `[ ]` = tugallanmagan. Sessiya oxirida browser-cert bo'lgan bosqich `[x]` bo'ladi.
Tartib: **0 ✅ → 1A→1B → 2A→2B → 3 → 4 (kerakli BE 1B/2B'dan oldin) → 5**.

---

## QISM 0 — GROUNDING  ·  ✅ **TAYYOR (2026-07-23)**
- [x] Capture tool'ga `salesreturn` moduli qo'shildi (`scripts/capture-moysklad-lib.ts`)
- [x] Jonli capture: list (5 state) + detail (10 state, HTML+PNG) — auto-login OK
- [x] `_GAP-BACKLOG.md` yozildi (list L1-L6 · detail D1-D10 · I7 «Создать документ» GROUNDED)

> **QISM 0 TAYYOR** = moysklad referens bor, deltalar taxminsiz aniqlangan.

---

## QISM 1 — YARATISH sahifasi (`/new`)  ·  reja: `2026-07-23-salesreturn-new-1to1.md` (QISM 1 boshida yoziladi)

> ⚠️ `/new` alohida capture QISM 1 boshida olinadi (`capture-moysklad salesreturn --new` yoki Playwright bilan); layout detalga o'xshash, lekin cert uchun o'z screenshot'i kerak.

### 1A — Vizual mos  →  **TAYYOR when:** `/new` moysklad create-form bilan ko'rinadigan farqsiz (browser-cert)
- [ ] Meta-grid ixcham 2-ustun tartibga: `Организация (+ Перечисление) · Склад` / `Контрагент · Договор` / `Проект · Канал продаж` / `Валюта документа` (D2/D3/D4)
- [ ] Pozitsiya sarlavha to'plami 2B/QISM4 bilan izchil
- [ ] Totals bloki (Промежуточный итог/НДС/Цена включает НДС/Итого/Кол-во) joylashuvi

### 1B — Funksional mos  →  **TAYYOR when:** `/new` save round-trip 1:1, browser-cert
- [ ] «Перечисление» to'lov-turi selektori (D2) — create'da tanlanadi, saqlanadi
- [ ] `/new` mavjud funksiya (kontragent/tovar/valyuta/kurs/save) regressiyasiz (2026-07-23b jonli tasdiq bor)

> **QISM 1 TAYYOR** = yangi qaytarish formasi moysklad bilan **to'liq bir xil**.

---

## QISM 2 — DETAL sahifasi (`[id]`)

### 2A — Vizual+struktura  →  **TAYYOR when:** ochilgan qaytarish moysklad `edit-default` bilan farqsiz
- [ ] D3 «Валюта документа» tahrirlanadigan selektor (hozir detalda yo'q)
- [ ] D2 «Перечисление» to'lov-turi dropdown (Организация ostida)
- [ ] D4 meta-grid ixchamlashtir (Sabab/Отгрузка/Заказ/Счета/Внешний код — «Ещё» ostiga yoki moysklad tartibiga)
- [ ] D10 tab-strip: «Главная» + «Связанные документы» (2 tab); Файлы/История tab'ni inline/olib tashla (Задачи/Файлы allaqachon inline)
- [ ] «Себестоимость ГТД» RU-label mosligini tasdiqla; «Скидка» ustun default-holatini moyskladga moslashtir

### 2B — Funksional mos  →  **TAYYOR when:** detal amallari 1:1, browser-cert
- [ ] D1 «Баланс (нам должны): …» qizil sub-qator Контрагент ostida (QISM 4 BE'dan)
- [ ] D8 «Создать документ ▾» menyu = {Исходящий платеж, Расходный ордер, Списание} (I7 — GROUNDED; QISM 4 BE relations)
- [ ] D9 «Отправить ▾» dropdown parity
- [ ] «Связанные документы» tab to'ldiriladi (bo'sh bo'lsa) — BE related-graph

> **QISM 2 TAYYOR** = bitta qaytarishni ochib ko'rish/tahrirlash moysklad bilan **to'liq bir xil**.

---

## QISM 3 — RO'YXAT sahifasi  →  **TAYYOR when:** ro'yxat moysklad `01-default` bilan farqsiz + funksional
- [ ] L1 «Оплачено» ustuni (QISM 4 `payedSumMinor` BE'dan)
- [ ] L2 «Валюта» ustunini default-ko'rinadigan qil
- [ ] L3 filtr qo'shish: `Дата отгрузки · Оплата · Товар или группа · Счет контрагента · Владелец контрагента · Счет организации · Общий доступ · Кто изменил`
- [ ] L4 ortiqcha filtrlarni reconcile (`Отгрузка/Заказ/Сумма from-to` — moysklad salesreturn filtrida yo'q)
- [ ] L5 «Статус ▾» alohida bulk-dropdown
- [ ] L6 «Создать ▾» bulk-dropdown (list-level)
- [ ] Toolbar/print-menu parity (Изменить = {Удалить/Массовое ред./Провести/Снять}; Печать = {Список возвратов/Возврат покупателя/Комплект/Настроить/Запросить форму})

> **QISM 3 TAYYOR** = qaytarishlar ro'yxati (ustun/filtr/bulk/toolbar) moysklad bilan **to'liq bir xil**.

---

## QISM 4 — BACKEND / DS UMUMIY  →  **TAYYOR when:** 1/2/3 shu enablerlarni wire qiladi
- [ ] D5 pozitsiya «Остаток» (jonli qoldiq) ustuni — BE per-row stock join + DS ustun
- [ ] D6 pozitsiya «Себест. единицы» (birlik tannarxi) ustuni — BE cost + DS ustun
- [ ] D7 pozitsiya «РНПТ» (marking/partiya) ustuni — DS yangi ustun-turi + BE maydon (demand QISM-4 marking bilan umumiy bo'lishi mumkin)
- [ ] D1 Контрагент «Баланс» — BE balance fetch (`counterparty_balances`)
- [ ] L1/D-refund «Оплачено» + «Исходящий платеж/Расходный ордер»→return bog'lash — BE `payedSumMinor` + refund-payment flow
- [ ] Nomli print-shablonlar (Список возвратов / Возврат покупателя / Комплект) — print-template tizimi

> **QISM 4 TAYYOR** = umumiy BE/DS enablerlar tayyor; sahifalar to'liq wire bo'ladi.

---

## QISM 5 — PHASE-2 QA  →  **TAYYOR when:** 3 sahifa moysklad capture yonida browser-cert
- [ ] `/new` · `/[id]` · list — har biri moysklad screenshot bilan yonma-yon farqsiz
- [ ] Adversarial runtime QA (concurrency/timeout/data-integrity/edge-case)
- [ ] Gate: typecheck 0 · biome 0 · i18n ru+uz · web Vitest regressiyasiz

> **QISM 5 TAYYOR = «100%»** — FAQAT shu yerda «bir xil» deb belgilanadi.

---

## Holat jadvali
| QISM | Nima | Holat |
|---|---|---|
| 0 | Grounding (capture + gap-backlog) | ✅ TAYYOR |
| 1 | /new (1A vizual · 1B funksional) | ⏳ |
| 2 | /[id] detal (2A vizual · 2B funksional) | ⏳ |
| 3 | list (ustun/filtr/bulk/toolbar) | ⏳ |
| 4 | Backend/DS umumiy enablerlar | ⏳ |
| 5 | Phase-2 QA → «100%» | ⏳ |
