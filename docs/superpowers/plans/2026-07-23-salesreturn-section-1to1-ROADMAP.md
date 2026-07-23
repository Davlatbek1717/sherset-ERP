# «Возвраты покупателей» (salesreturn) to'liq 1:1 — QISMLARGA BO'LINGAN YO'L XARITASI

> **Maqsad:** 3 sahifa (ro'yxat / detal / yaratish) moysklad bilan **100% bir xil** (vizual + funksional).
> **Qoida:** har QISM = mustaqil «tayyor» milestone + **browser-cert** (`:3100` moysklad capture yoniga qo'yib tasdiqlanadi).
> «100%» yorlig'i FAQAT oxirgi QISM (Phase-2 QA) tugagach beriladi (`CLAUDE.md` halollik-qoidasi).
> **Grounding:** `docs/audits/sales-returns-live-2026-07-23/_GAP-BACKLOG.md` (jonli capture, 1834 real yozuv) +
> `docs/moysklad-reference/salesreturn/` (gitignore — PII).

**QISM ≠ SESSIYA** (2026-07-23, co-locate qarori). QISM = mustaqil-tayyor **milestone**; u bir necha sessiyaga
cho'zilishi mumkin. **Sessiya birligi = sub-item** (1A · 1B · 2A · 2B …) — CLAUDE.md §0 «1 sessiya = 1 flagship».
Har sub-item **o'zining BE/DS tilimini o'z ichida** olib yuradi (eski monolit «QISM 4 — BE» tarqatildi) — shuning
uchun har QISM haqiqatan mustaqil yopiladi, boshqa QISMning BE'siga tashqi bog'liqlik yo'q.

**Umumiy (cross-cutting) enablerlar** — bir necha QISM ishlatadi, birinchi kerak bo'lgan joyda quriladi, keyin qayta-ishlatiladi:
- **Pozitsiya-ustun to'plami: Остаток (D5) · Себест. единицы (D6) · РНПТ (D7)** → **`/new`(1A) VA detail(2A) — IKKALASIDA** default-ko'rinadi (2026-07-23 `/new` capture bilan grounded). Shuning uchun bu **har ikki sahifaning vizual-parity'si uchun PREREKVIZIT** — QISM 1 boshida (yoki 2A'dan oldin) **birinchi qurilishi** kerak, keyin `/new` + detail wire qiladi. РНПТ ustun-turi demand QISM-4 marking bilan umumiy DS ustun-turi bo'lishi mumkin — qurishdan oldin demand'nikini tekshir, duplicat qilma.
- **`payedSumMinor` + refund-payment flow** (Исходящий платеж/Расходный ордер → return bog'lash) → **L1 «Оплачено»** (QISM 3) va **D8 «Создать документ»** (QISM 2B) ikkisi ham ishlatadi. Birinchi kerak bo'lgan QISMda qurilib, ikkinchisi wire qiladi.
- **Nomli print-shablonlar** (Список возвратов / Возврат покупателя / Комплект) → list print-menu (QISM 3) + detail print-menu (QISM 2). Print-template tizimida bir marta qo'shiladi.

Tartib: **0 ✅ → 1A→1B → 2A→2B → 3 → 4(QA)**. Har delta `[ ]` = tugallanmagan; browser-cert bo'lgan sub-item `[x]`.

---

## QISM 0 — GROUNDING  ·  ✅ **TAYYOR (2026-07-23)**
- [x] Capture tool'ga `salesreturn` moduli qo'shildi (`scripts/capture-moysklad-lib.ts`)
- [x] Jonli capture: list (5 state) + detail (10 state, HTML+PNG) — auto-login OK
- [x] `_GAP-BACKLOG.md` yozildi (list L1-L6 · detail D1-D10 · I7 «Создать документ» GROUNDED)

> **QISM 0 TAYYOR** = moysklad referens bor, deltalar taxminsiz aniqlangan.

---

## QISM 1 — YARATISH sahifasi (`/new`)  ·  reja: `2026-07-23-salesreturn-new-1to1.md` (impl sessiya boshida yoziladi)

> ✅ **`/new` capture OLINDI (2026-07-23):** `pnpm capture-moysklad salesreturn --create` (yangi `--create` rejimi) →
> `docs/moysklad-reference/salesreturn/new/`. Deltalar N1-N8 gap-backlog'da grounded (screenshot + DOM-rol).
> **Prerekvizit:** 1A vizual-parity pozitsiya-ustun to'plamini (Остаток/Себест.единицы/РНПТ) talab qiladi — bu
> **umumiy enabler** (yuqoriga qara), 1A'dan oldin qurilishi kerak (detail 2A ham shuni ishlatadi).

### 1A — Vizual mos  →  **TAYYOR when:** `/new` moysklad create-form bilan ko'rinadigan farqsiz (browser-cert)
- [ ] N2/N3 Meta-grid moysklad tartibiga: `Организация (+ «Перечисление» ostida) · Склад` / `Контрагент · Договор` / `Проект · Канал продаж` / `Валюта документа` (yakka qator)
- [ ] N4 Pozitsiya ustunlari = umumiy enabler'dan (Остаток/Себест.единицы/РНПТ ko'rinadi)
- [ ] N5/N6/N7 «Скидка» + «Сумма НДС» + «Ед.»(goodPack) default-yashir (moysklad create-formda ko'rinmaydi)
- [ ] N8 «Причина» rean-input reconcile (moysklad faqat «Комментарий») — olib tashla/«Ещё»
- [ ] Totals bloki (Промежуточный итог/НДС/Цена включает НДС/Итого) joylashuvi

### 1B — Funksional mos  →  **TAYYOR when:** `/new` save round-trip 1:1, browser-cert
- [ ] N1 «Перечисление» combo (D2) — Организация ostida; **opsiya-ro'yxatini avval jonli click-capture qil** (§4, taxmin YO'Q), keyin create'da tanlash + saqlash **[BE: yangi ustun yoki `attributes` — impl qaror]**
- [ ] `/new` mavjud funksiya (kontragent/tovar/valyuta/kurs/save) regressiyasiz (2026-07-23b jonli tasdiq bor)

> **QISM 1 TAYYOR** = yangi qaytarish formasi moysklad bilan **to'liq bir xil**.

---

## QISM 2 — DETAL sahifasi (`[id]`)

### 2A — Vizual+struktura+pozitsiya-ustunlar  →  **TAYYOR when:** ochilgan qaytarish moysklad `edit-default` bilan farqsiz
- [ ] D3 «Валюта документа» tahrirlanadigan selektor (hozir detalda yo'q)
- [ ] D2 «Перечисление» to'lov-turi dropdown (Организация ostida)
- [ ] D4 meta-grid ixchamlashtir (Sabab/Отгрузка/Заказ/Счета/Внешний код — «Ещё» ostiga yoki moysklad tartibiga)
- [ ] D5 pozitsiya «Остаток» (jonli qoldiq) ustuni **[BE: per-row stock join + DS ustun]**
- [ ] D6 pozitsiya «Себест. единицы» (birlik tannarxi) ustuni **[BE: unit cost + DS ustun]**
- [ ] D7 pozitsiya «РНПТ» (marking/партия) ustuni **[cross-cutting: demand QISM-4 marking bilan umumiy DS ustun-turi bo'lishi mumkin — avval tekshir]**
- [ ] D10 tab-strip: «Главная» + «Связанные документы» (2 tab); Файлы/История tab'ni inline/olib tashla (Задачи/Файлы allaqachon inline)
- [ ] «Себестоимость ГТД» RU-label mosligini tasdiqla; «Скидка» ustun default-holatini moyskladga moslashtir

### 2B — Funksional mos  →  **TAYYOR when:** detal amallari 1:1, browser-cert
- [ ] D1 «Баланс (нам должны): …» qizil sub-qator Контрагент ostida **[BE: balance fetch `counterparty_balances`]**
- [ ] D8 «Создать документ ▾» menyu = {Исходящий платеж, Расходный ордер, Списание} (I7 — GROUNDED) **[BE: related-doc create + payedSumMinor/refund flow — cross-cutting L1 bilan]**
- [ ] D9 «Отправить ▾» dropdown parity
- [ ] «Связанные документы» tab to'ldiriladi (bo'sh bo'lsa) **[BE: related-graph]**

> **QISM 2 TAYYOR** = bitta qaytarishni ochib ko'rish/tahrirlash moysklad bilan **to'liq bir xil**.

---

## QISM 3 — RO'YXAT sahifasi  →  **TAYYOR when:** ro'yxat moysklad `01-default` bilan farqsiz + funksional
- [ ] L1 «Оплачено» ustuni **[BE: `payedSumMinor` — cross-cutting D8 refund-flow bilan; birinchi qurilgan joydan qayta-ishlat]**
- [ ] L2 «Валюта» ustunini default-ko'rinadigan qil
- [ ] L3 filtr qo'shish: `Дата отгрузки · Оплата · Товар или группа · Счет контрагента · Владелец контрагента · Счет организации · Общий доступ · Кто изменил` **[ba'zilari BE query]**
- [ ] L4 ortiqcha filtrlarni reconcile (`Отгрузка/Заказ/Сумма from-to` — moysklad salesreturn filtrida yo'q → «Ещё» ostiga yoki olib tashla)
- [ ] L5 «Статус ▾» alohida bulk-dropdown
- [ ] L6 «Создать ▾» bulk-dropdown (list-level) **[BE]**
- [ ] Toolbar/print-menu parity (Изменить = {Удалить/Массовое ред./Провести/Снять}; Печать = {Список возвратов/Возврат покупателя/Комплект/Настроить/Запросить форму} — **cross-cutting print-shablon tizimi**)

> **QISM 3 TAYYOR** = qaytarishlar ro'yxati (ustun/filtr/bulk/toolbar) moysklad bilan **to'liq bir xil**.

---

## QISM 4 — PHASE-2 QA  →  **TAYYOR when:** 3 sahifa moysklad capture yonida browser-cert
- [ ] `/new` · `/[id]` · list — har biri moysklad screenshot bilan yonma-yon farqsiz
- [ ] Adversarial runtime QA (concurrency/timeout/data-integrity/edge-case)
- [ ] Gate: typecheck 0 · biome 0 · i18n ru+uz · web Vitest regressiyasiz

> **QISM 4 TAYYOR = «100%»** — FAQAT shu yerda «bir xil» deb belgilanadi.

---

## Holat jadvali
| QISM | Nima | Holat |
|---|---|---|
| 0 | Grounding (capture + gap-backlog) | ✅ TAYYOR |
| 1 | /new (1A vizual · 1B funksional + BE-tilim) | ⏳ |
| 2 | /[id] detal (2A vizual+ustunlar · 2B funksional + BE-tilim) | ⏳ |
| 3 | list (ustun/filtr/bulk/toolbar + BE-tilim) | ⏳ |
| 4 | Phase-2 QA → «100%» | ⏳ |

> **BE/DS eslatma:** eski «QISM 4 — umumiy BE» tarqatildi (2026-07-23 co-locate qarori). Har BE enabler uni
> ishlatadigan QISM ichida (`[BE: …]` teg bilan). Cross-cutting 3 ta enabler (payedSumMinor/refund · РНПТ ustun-turi ·
> print-shablonlar) yuqoridagi «Umumiy enablerlar» ro'yxatida — birinchi kerak bo'lgan QISMda qurilib qayta-ishlatiladi.
