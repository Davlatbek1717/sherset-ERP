# Audit-tuzatish REJASI — Sherset/Climart ERP (2026-08-08)

> **Manba:** `scratchpad/audit-2026-08-08/SINTEZ-HISOBOT.md` (9 tema) va
> `scratchpad/audit-2026-08-08/TOLIQ-TOPILMALAR.txt` (173 topilma, har biri `file:line` dalil bilan).
> Har topilma ID (masalan `M-01`, `SALES-01`) shu faylda to'liq izohlangan — agent shu ID'ni o'qib
> ground-truth qiladi.

**Maqsad:** auditda topilgan pul-yo'qolishi, ma'lumot-butunligi, xavfsizlik, scale va texnik-qarz
muammolarini fazama-faza, har birini alohida sessiyada, xavfsiz tuzatish.

---

## ⛔ O'ZGARMAS QOIDALAR — HAR SESSIYA AGENTI UCHUN

Bu rejani o'qiyotgan agent quyidagilarni **so'zsiz** bajaradi:

1. **Faqat BITTA faza.** Senga topshirilgan faza raqamini bajarasan. Tugagach **TO'LIQ TO'XTAYSAN** —
   keyingi fazani BOSHLAMAYSAN. Bu token-iqtisod qoidasi (CLAUDE.md §0.3), buzilmaydi.
2. **Avval o'qi:** (a) shu rejadagi o'z fazangni, (b) `TOLIQ-TOPILMALAR.txt`'dan fazadagi topilma
   ID'larini, (c) tegishli manba-fayllarni. Da'voni **o'z ko'zing bilan kodda tasdiqla** (CLAUDE.md §2)
   — audit xato o'qigan bo'lishi mumkin; tasdiqlanmasa hisobotda yoz va to'xta, ko'r-ko'rona o'zgartirma.
3. **TDD:** avval **yiqiladigan test** yoz (bug'ni ko'rsatadigan), yiqilishini ko'r, keyin minimal
   fix, keyin test o'tishini ko'r. Testlar co-located `.test.ts` (vitest).
4. **To'liq gate (majburiy, commit oldidan):**
   - `pnpm --filter @moysklad/api typecheck` → 0 xato *(web-fazasida `@moysklad/web` ham)*
   - `pnpm lint:product` → 0 xato
   - `pnpm i18n:gate` → o'tadi *(UI-matn tegilgan bo'lsa)*
   - Fazaga tegishli test: `pnpm --filter @moysklad/api exec vitest run <fayl-yo'li>` (+ regress yo'qligini
     tekshir: butun modul testi). Web uchun `@moysklad/web`, pul uchun `@moysklad/money`.
5. **Halol status (CLAUDE.md §1):** natija **«Phase-1: strukturaviy + unit-tasdiqlangan, browser-smoke
   YO'Q»** deb belgilanadi. «done/production-ready» DEMA. Runtime-QA alohida cohort-sessiyaga qoladi.
6. **Git xavfsizligi (CLAUDE.md §6):** faqat aniq yo'llar bilan `git add <fayllar>` — hech qachon
   `git add -A`/`-a`. Commit oldidan `git status --short` bilan faqat o'z fayllaring turганini tasdiqla.
   `git reset --hard`/`checkout -- .`/`stash` — TAQIQ (parallel sessiya ishini o'chirmaslik uchun).
   Dirty-tree'da seniki bo'lmagan o'zgarish bo'lsa — tegma.
7. **Migratsiya (agar sxema tegilsa):** lokal DB = `climart_adopt @ localhost:5432`
   (`climart-adopt-local-db-untracked.md` xotirasi — `pg_trgm`/`psql` yo'q, raw index Prisma raw-migration
   bilan). Migratsiya nomini ma'noli ber.
8. **Modeli:** OPUS/flagship (Fable) — Sonnet EMAS (CLAUDE.md §0.1). Mexanik codemod uchun avval
   deterministik skript o'yla, keyin agent.
9. **Hisobot:** faza tugagach shu reja **oxiridagi «HISOBOT JURNALI»** bo'limiga o'z fazang ostiga
   qilgan HAMMA o'zgarishni yoz (fayllar, nima o'zgardi, testlar, gate natijasi, qolgan qarz/DEFER).
10. **Commit:** `pnpm --filter` gate yashil bo'lgach, ma'noli commit xabari bilan
    (`fix(<domen>): <faza> — <ID'lar>`). NEXT.md'ni ham yangilash tavsiya (keyingi faza qaysi).

**Bog'liqlik:** fazalar ustuvorlik bo'yicha (P0→P4) tartiblangan, lekin ba'zilari bir-biriga bog'liq
(«Bog'liqlik» qatorida ko'rsatilgan). Bog'liq faza tugamaguncha keyingisini boshlama.

---

## 🟠 QAROR TALAB QILADIGAN NUQTALAR (foydalanuvchi hal qiladi)

Bu ikki qaror biznes/buxgalteriya tanlovi — agent o'zi hal qilMAYDI. Tegishli faza boshida
foydalanuvchidan so'raladi (fazada belgilangan).

- **QAROR-A (Tannarx modeli): ✅ HAL QILINDI (2026-08-08) → WEIGHTED-AVERAGE (o'rtacha tortilgan).**
  Butun tizim o'rtacha-tortilgan tan narxga o'tadi; FIFO lot-ledger (`SupplyPosition.remainingQty`,
  `DemandPositionCostConsumption`) olib tashlanadi/bekor qilinadi. → **Faza 18** shu bo'yicha ishlaydi.
- **QAROR-B (Taminotchi qarzi): ✅ HAL QILINDI (2026-08-08) → SUPPLY-ONLY.**
  Xaridda kontragent qarzini faqat **Supply** (tovar qabuli) yozadi; **InvoiceIn qarzga TEGMAYDI**
  (faqat informatsion/rasmiy hujjat bo'lib qoladi). → **Faza 13** shu bo'yicha ishlaydi.

---

# P0 — PUL / MA'LUMOT YO'QOLISHI (darhol)

---

### Faza 1 — `transitionWithClaim()` helper + pul-hujjat oilasi TOCTOU-qulfi
**Ustuvorlik:** P0 · **Bog'liqlik:** yo'q
**Muammo:** `M-01`, `DUP-01` (CRITICAL). Stock oilasida yopilgan atomik state-claim naqshi pul-hujjat
oilasiga ko'chirilmagan.
**Nima buzilgan:** payment-in/out, cash-in/out, invoice-out/in, counterparty-adjustment post/unpost/cancel'da:
holat tekshiruvi `$transaction` TASHQARISIDA, izolyatsiya ReadCommitted (default), `update` WHERE'da state
sharti yo'q. Ikki parallel «Провести» → balans/payedSum 2×.
**Yechim:** stock-oiladagi naqshni umumlashtir — `apps/api/src/modules/shared/`'ga
`transitionWithClaim(tx, model, {id, accountId, fromStates, toState})` helper (tx ichida birinchi amal:
`updateMany({where:{id,accountId,state:{in:fromStates}}, data:{state:toState}})`, `count===0` → `ConflictException`).
Har pul-servisning post/unpost/cancel'ini shu helper + `$transaction({isolationLevel:'Serializable'})` +
`withSerializationRetry` bilan o'ra; holatni tranzaksiya ICHIDA qayta o'qi.
**Fayllar:**
- Create: `apps/api/src/modules/shared/transition-with-claim.ts` (+ `.test.ts`)
- Modify: `payment-in/payment-in.service.ts`, `payment-out/payment-out.service.ts`,
  `cash-in/cash-in.service.ts`, `cash-out/cash-out.service.ts`, `invoice-out/invoice-out.service.ts`,
  `invoice-in/invoice-in.service.ts`, `counterparty-adjustment/counterparty-adjustment.service.ts`
- Modify (guard): `shared/transition-toctou-class.test.ts` — skanerni pul-oilaga ham yoy.
**Testlar (TDD):** (1) helper unit: `fromStates` mos kelmasa `count=0`→throw; mos kelsa flip. (2) Har
servisga concurrency-test: ikki parallel `post()` — bittasi 409, `applyDelta` bir marta chaqirilgan
(mock/spy bilan balans deltasi 1× ekanini tasdiqla). (3) Guard-test pul-servislarni qamrashini tekshir.
**Gate:** standart API-gate + `vitest run` payment-in/out, cash-in/out, invoice-out/in, counterparty-adjustment, shared.
**Diqqat:** `applyPayment`/`applyDelta` chaqiruvlari endi Serializable ichida — deadlock bo'lmasligi uchun
delta-tartibini (stock `lockBalances` uslubi) saqla. `retail-sale` allaqachon atomik flip ishlatadi — namuna.
**▶ SESSIYA-BOSHI PROMPT:**
> `docs/REJA-AUDIT-FIX-2026-08.md` — **Faza 1** ni bajar. O'ZGARMAS QOIDALARga amal qil. `TOLIQ-TOPILMALAR.txt`'dan
> `M-01` va `DUP-01`'ni o'qi, kodda tasdiqla. `shared/transition-with-claim.ts` helper yaratib, 7 pul-servisning
> post/unpost/cancel'iga atomik claim + Serializable + retry qo'sh, guard-testni pul-oilaga yoy. TDD: avval
> concurrency-yiqiladigan test. Gate to'liq. Faza tugagach hisobotni rejaga yozib TO'XTA — keyingi fazani BOSHLAMA.
**☑ HISOBOT (2026-08-08):** BAJARILDI — batafsili «HISOBOT JURNALI → Faza 1» da.

---

### Faza 2 — MoneyService.applyDeltas: haqiqiy qulf + increment
**Ustuvorlik:** P0 · **Bog'liqlik:** yo'q (Faza 1 bilan mustaqil, lekin bir domen)
**Muammo:** `M-02` (CRITICAL). Komment «SELECT … FOR UPDATE» deydi, aslida `findUnique` (qulfsiz) +
o'qi-qo'shib-yoz (absolute set). Ikki parallel POS → CashDesk balansi buziladi, overdraft-guard chetlanadi.
**Nima buzilgan:** `money.service.ts:52-104` — `findUnique` → `newBalance = row.balanceMinor + delta` →
`update({balanceMinor:newBalance})`. Qulf yo'q, increment emas.
**Yechim:** balansni `update({data:{balanceMinor:{increment:d.deltaMinor}}})` bilan atomik oshir; overdraft
tekshiruvini increment'dan KEYIN o'qib qil (`select` bilan yangi qiymatni ol, `< 0n` → throw + rollback),
YOKI `$queryRaw` `SELECT … FOR UPDATE` (stock `lockBalances` uslubi) bilan qulfla. Komment-yolg'onni tuzat.
Overdraft-throw tranzaksiyani rollback qilishini tekshir.
**Fayllar:** Modify `apps/api/src/modules/money/money.service.ts` (+ `money.service.test.ts` yaratish/kengaytirish).
**Testlar (TDD):** (1) ikki parallel `applyDeltas` bir manbaga → yakuniy balans = ikki delta yig'indisi
(lost-update yo'q). (2) overdraft: increment manfiyga tushirsa throw + balans o'zgarmagan (rollback). (3)
currency-mismatch/tenant-guard hali ishlaydi.
**Gate:** standart API-gate + `vitest run` money.
**Diqqat:** chaqiruvchilar (cash-in/out, retail-sale) hozir ReadCommitted `$transaction` — increment atomik
bo'lgani uchun lost-update yopiladi, lekin overdraft-check «read-after-increment» bo'lishi kerak (aks holda
ikki parallel manfiyga tushirishi mumkin). Serializable'ga o'tkazish ixtiyoriy, lekin increment shart.
**▶ SESSIYA-BOSHI PROMPT:**
> `docs/REJA-AUDIT-FIX-2026-08.md` — **Faza 2**. O'ZGARMAS QOIDALAR. `M-02`'ni o'qib kodda tasdiqla
> (`money.service.ts:52-104`). `applyDeltas`'ni increment + read-after (yoki FOR UPDATE) qulfga o'tkaz,
> komment-yolg'onni tuzat. TDD: parallel lost-update testi. Gate to'liq. Hisobot yozib TO'XTA.
**☑ HISOBOT (2026-08-08):** BAJARILDI — batafsili «HISOBOT JURNALI → Faza 2» da.

---

### Faza 3 — applyPayment: payedSumMinor increment (yo'qolgan-yangilanish)
**Ustuvorlik:** P0 · **Bog'liqlik:** yo'q
**Muammo:** `M-09` (HIGH). `invoice-out/in`, `customer-order`, `purchase-order`'ning `applyPayment`'i
o'qi-keyin-yoz (`newPayed = invoice.payedSumMinor + amount; update({payedSumMinor:newPayed})`) — absolute set,
qulf yo'q. Ikki parallel to'lov → bittasi yo'qoladi, holat noto'g'ri.
**Yechim:** `payedSumMinor: {increment: amountMinor * sign}` + `updateMany`'dan keyin qiymatni o'qib
`state`'ni (`partially_paid`/`paid`) hisobla. To'rt servisda ham bir xil.
**Fayllar:** Modify `invoice-out/invoice-out.service.ts`, `invoice-in/invoice-in.service.ts`,
`customer-order/customer-order.service.ts`, `purchase-order/purchase-order.service.ts` (+ testlar).
**Testlar (TDD):** ikki parallel `applyPayment` bitta hujjatga → yakuniy `payedSumMinor` = ikki summa;
state chegara qiymatida to'g'ri (`==sum`→paid).
**Gate:** standart API-gate + `vitest run` invoice-out/in, customer-order, purchase-order.
**Diqqat:** Faza 1 pul-hujjatlarni Serializable qiladi — bu faza pozitsiya-hujjatlar (CO/PO/invoice) tomonini
yopadi; ikkalasi birga to'liq simmetriya beradi. Tartib muhim emas.
**▶ SESSIYA-BOSHI PROMPT:**
> `docs/REJA-AUDIT-FIX-2026-08.md` — **Faza 3**. O'ZGARMAS QOIDALAR. `M-09`'ni tasdiqla. 4 servisning
> `applyPayment`'ini increment'ga o'tkaz, state'ni keyin hisobla. TDD: parallel to'lov testi. Gate. Hisobot, TO'XTA.
**◻ HISOBOT:** _(agent to'ldiradi)_

---

### Faza 4 — POS qarz-to'lovi: tranzaksiya-ichi FIFO + DebtService.recalc
**Ustuvorlik:** P0 · **Bog'liqlik:** yo'q
**Muammo:** `M-10` (HIGH) + `DUP-07` (HIGH). `pos-debt-payment.service.ts`: `loadOpenDebts` va FIFO reja
`$transaction`'dan TASHQARIDA o'qiladi, `paidMinor` absolute set; `closedAt` yozilmaydi, soft-deleted qarzlar
FIFO'ga kiradi. Ikki parallel to'lov → ortiqcha allokatsiya/yo'qolgan to'lov.
**Yechim:** `loadOpenDebts` + FIFO'ni tranzaksiya ICHIGA ko'chir (`SELECT … FOR UPDATE` yoki har qarzni
tx-ichi qayta o'qish); `loadOpenDebts`'ga `deletedAt:null` qo'sh; har allokatsiyadan keyin absolute set
o'rniga `DebtService.recalc(tx, debtId)` chaqir (`closedAt`/`nextContactAt`/`status`ni to'lovlardan qayta
o'qiydigan kanonik yo'l) — kod dublikatini yo'q qil.
**Fayllar:** Modify `apps/api/src/modules/debt/pos-debt-payment.service.ts`; `debt/debt.service.ts` (`recalc`'ni
export/reuse qilinadigan qil). (+ testlar).
**Testlar (TDD):** (1) ikki parallel POS-to'lov bir mijozga → `paidMinor` summasi to'g'ri, ortiqcha
allokatsiya yo'q. (2) yopilgan qarzda `closedAt` yoziladi. (3) soft-deleted qarz FIFO'da ko'rinmaydi.
**Gate:** standart API-gate + `vitest run` debt.
**Diqqat:** M-05 (POS-qarz naqdi kassaga yozilmaydi) — **Faza 11**da; bu faza faqat qarz-reyestr tomonini yopadi.
**▶ SESSIYA-BOSHI PROMPT:**
> `docs/REJA-AUDIT-FIX-2026-08.md` — **Faza 4**. O'ZGARMAS QOIDALAR. `M-10`+`DUP-07`'ni tasdiqla.
> `pos-debt-payment`'ni tx-ichi FIFO + `DebtService.recalc` reuse + `deletedAt:null` filtr bilan tuzat.
> TDD: parallel to'lov + closedAt + soft-delete testlari. Gate. Hisobot, TO'XTA.
**◻ HISOBOT:** _(agent to'ldiradi)_

---

### Faza 5 — Loss.cancel: atomik claim + Serializable
**Ustuvorlik:** P0 · **Bog'liqlik:** yo'q (kichik, tez)
**Muammo:** `STK-01` (HIGH). `loss.service.ts:808-848` cancel'da `updateMany(where:state)` claim YO'Q va
izolyatsiya default — sibling'larda (move/enter/inventory) bor. Ikki parallel cancel qoldiqni 2× tiklaydi.
**Yechim:** cancel'ni move.cancel bilan bir xil qil: tx boshida `loss.updateMany({where:{id,accountId,
state:existing.state}, data:{state:'cancelled'}})`, `count===0`→409; Serializable + retry (unpost namunasi).
Faza 1 helperi tayyor bo'lsa uni ishlat.
**Fayllar:** Modify `apps/api/src/modules/loss/loss.service.ts` (+ test).
**Testlar (TDD):** ikki parallel `cancel` → bittasi 409, `applyDeltas(+qty)` bir marta.
**Gate:** standart API-gate + `vitest run` loss.
**▶ SESSIYA-BOSHI PROMPT:**
> `docs/REJA-AUDIT-FIX-2026-08.md` — **Faza 5**. O'ZGARMAS QOIDALAR. `STK-01`'ni tasdiqla. `loss.cancel`'ga
> atomik claim + Serializable qo'sh (Faza 1 helperi bo'lsa ishlat). TDD: parallel cancel testi. Gate. Hisobot, TO'XTA.
**◻ HISOBOT:** _(agent to'ldiradi)_

---

### Faza 6 — POS refund: server tomondan asl-narx cap + chegirma
**Ustuvorlik:** P0 · **Bog'liqlik:** yo'q
**Muammo:** `SALES-01` (CRITICAL) + `FE-01` (web, CRITICAL). Refund payout mijoz yuborgan `priceMinor`'dan
hisoblanadi (o'ziga havola cap) → cheksiz over-refund (kassadan pul o'g'irlash); chegirma e'tiborsiz.
**Yechim (server, asosiy):** `retail-sale.service.ts` refund()'da asl chek pozitsiyalarining
`priceMinor`/`discount`/`sumMinor`'ini O'QI; har refund qatori narxini asl qator narxi bilan **cap** qil (yoki
umuman klientdan narx olmay, asl `sumMinor`'dan proporsional hisobla); invariant: `Σ(refund sumMinor) ≤
original.sumMinor`. `validateRefundAmount`'ga asl-summani ber. **Yechim (web):** `sotuv/page.tsx` refundMut'ga
`discount: p.discount` qo'sh, `cashRefund`'ni `p.sumMinor` (server chegirmali summa) asosida proporsional hisobla.
**Fayllar:** Modify `apps/api/src/modules/retail-sale/retail-sale.service.ts`,
`retail-sale/retail-refund-validation.ts`; `apps/web/src/app/(app)/sotuv/page.tsx`. (+ testlar).
**Testlar (TDD):** (1) refund payout > asl qator narxi → 400 (over-refund bloklandi). (2) chegirmali chek:
refund summasi asl to'langan (chegirmali) summaga teng, ortiqcha emas. (3) `Σ refund ≤ original` invariant.
**Gate:** standart API-gate + `vitest run` retail-sale; web: `@moysklad/web vitest run` sotuv testlari + `i18n:gate`.
**Diqqat:** qarz-sotuv refund va qisman-refund — **Faza 7**da (alohida). Bu faza faqat over-refund teshigini
yopadi (eng xavflisi). `retail-refund-validation.ts` adversarial-testlangan — mavjud testlarni buzma.
**▶ SESSIYA-BOSHI PROMPT:**
> `docs/REJA-AUDIT-FIX-2026-08.md` — **Faza 6**. O'ZGARMAS QOIDALAR. `SALES-01`+web `FE-01`'ni tasdiqla.
> Server refund payout'ni asl chek narxi bilan cap qil (`Σ refund ≤ original.sumMinor`), web'da chegirmani
> yubor. TDD: over-refund 400 + chegirmali refund summasi testlari. Gate (API+web+i18n). Hisobot, TO'XTA.
**◻ HISOBOT:** _(agent to'ldiradi)_

---

### Faza 7 — POS refund: qarz-sotuv qaytarish + qisman-refund kumulyativ + loyalty prorate
**Ustuvorlik:** P0 · **Bog'liqlik:** Faza 6 tugagach
**Muammo:** `SALES-04` (HIGH), `SALES-05` (HIGH). Qarzga sotilgan chek refund'da naqd chiqadi, mijoz qarzi
qolaveradi (ikki yo'qotish); qisman refund chekni `refunded` qiladi (qolganini qaytarib bo'lmaydi) + butun
loyalty ballni tortadi.
**Yechim:** (a) refund sxemasiga `debtReturnMinor` qo'sh; asl chekning `RetailSalePayment(method='DEBT')`
qatoridan qarz ulushini o'qib, refundda avval `counterpartyBalance.applyDelta(−)` bilan qarzni yop, naqd/karta
payout'ni faqat haqiqatan pul olingan ulushga cheklab. (b) kumulyativ refund: `state`'ni `refunded`'ga faqat
`Σ(qaytarilgan qty) == sotilgan qty` bo'lganda o'tkaz; `validateRefundPositions`'ga oldingi refundlar
yig'indisini ber (sales-return cumulative-cap naqshi). (c) loyalty reversal'ni refund ulushiga proporsional qil.
**Fayllar:** Modify `retail-sale/retail-sale.service.ts`, `retail-sale/retail-sale.schema.ts`,
`retail-sale/retail-refund-validation.ts`, `retail-sale/retail-loyalty.ts`. (+ testlar).
**Testlar (TDD):** (1) 100% qarz chek refund → mijoz balansi qarzdan tozalanadi, naqd 0 chiqadi. (2) 10 tadan
1 refund → chek `posted` qoladi, qolgan 9 qaytarilishi mumkin. (3) qisman refundda loyalty ulushga mos kamayadi.
**Gate:** standart API-gate + `vitest run` retail-sale.
**▶ SESSIYA-BOSHI PROMPT:**
> `docs/REJA-AUDIT-FIX-2026-08.md` — **Faza 7** (Faza 6 tugagan bo'lsin). O'ZGARMAS QOIDALAR. `SALES-04`+`SALES-05`.
> `debtReturnMinor` + kumulyativ refund + loyalty prorate. TDD: qarz-refund, qisman-refund, loyalty testlari.
> Gate. Hisobot, TO'XTA.
**◻ HISOBOT:** _(agent to'ldiradi)_

---

### Faza 8 — recompute-counterparty-balances.ts: APPLY-guard + qamrov
**Ustuvorlik:** P0 · **Bog'liqlik:** yo'q (ops-skript)
**Muammo:** `DUP-02` (CRITICAL). Skript `APPLY=1` bilan yugursa qamralmagan yozuvchilar (debt-issue, POS
qarz-sotuv) balansini **jimgina 0 qiladi** — pul-ma'lumot yo'qolishi.
**Yechim:** skriptga debt-issue (`Σ totalMinor` per kontragent, `deletedAt`/cancelled siyosati bilan) va
retail-sale qarz-tender manbasini QO'SH; qamrov to'liqligini kod bilan kafolatla (barcha `applyDelta`
chaqiruvchilar ro'yxati vs skript manbalari — bitta testda qulfla, aks holda skript ishlashdan oldin `throw`).
Yaxshiroq varianti Faza 9 (journal-jadval) bilan — o'shanda bu skript butunlay journal'dan qayta quradi.
**Fayllar:** Modify `apps/api/src/scripts/recompute-counterparty-balances.ts` (+ qamrov-guard test).
**Testlar (TDD):** guard-test: `applyDelta` chaqiruvchi har `docType` skript-manbalarida borligini
manba-skan bilan tasdiqla (yangi yozuvchi qo'shilsa test yiqilsin).
**Gate:** standart API-gate + `vitest run` shu test.
**Diqqat:** APPLY=1 ni hech qachon o'zing yugurtirma. Faza 9 rejalashtrilgan bo'lsa, bu fazani «guard qo'yish»
bilan cheklab, to'liq re-arxitekturани Faza 10'ga qoldirsa ham bo'ladi — hisobotda ayt.
**▶ SESSIYA-BOSHI PROMPT:**
> `docs/REJA-AUDIT-FIX-2026-08.md` — **Faza 8**. O'ZGARMAS QOIDALAR. `DUP-02`'ni tasdiqla. Skriptga
> debt-issue + POS-qarz manbasini qo'sh, qamrov-guard test yoz (yangi yozuvchi → test yiqilsin). APPLY=1
> yugurtirMA. Gate. Hisobot, TO'XTA.
**◻ HISOBOT:** _(agent to'ldiradi)_

---

# P1 — MOLIYAVIY IZCHILLIK / ARXITEKTURA

---

### Faza 9 — CounterpartyBalanceEntry journal-jadval (ildiz-yechim, yozuv tomoni)
**Ustuvorlik:** P1 · **Bog'liqlik:** yo'q (lekin Faza 10 shunga bog'liq)
**Muammo:** `DUP-15`/`DB-15` (dizayn ildizi), `M-07`/`DUP-05/06/08` (oqibatlar). Materialized
`CounterpartyBalance`'da `organizationId` yo'q → balansni org-kesimda va akt-sverkada 4 joyda mustaqil
(chala) rekonstruksiya qilishga majbur → drift.
**Yechim:** har `applyDelta` uchun bir qator yozadigan append-only `CounterpartyBalanceEntry` jadvali
(`accountId, counterpartyId, organizationId?, currency, deltaMinor, docType, docId, createdAt`). `applyDelta`
chokepoint'ida (`counterparty-balance.service.ts`) shu qatorni ham yoz (mavjud materialized upsert bilan bitta
tranzaksiyada). Bu — kelajakdagi barcha o'quvchilar uchun yagona manba.
**Fayllar:** Modify `packages/db/prisma/schema.prisma` (+ migration); `counterparty-balance/counterparty-balance.service.ts` (+ test).
**Testlar (TDD):** har `applyDelta` chaqiruvida journal-qator yaraladi; `Σ(journal.deltaMinor per
counterparty,currency) == materialized balanceMinor` invariant testi.
**Gate:** standart API-gate + migration ishga tushishi (`pnpm --filter @moysklad/db migrate`) + `vitest run`
counterparty-balance.
**Diqqat:** migratsiya `climart_adopt @ 5432`'da; mavjud balanslarni backfill qilish kerakmi — hisobotda ayt
(dastlab faqat yangi deltalar journal'ga tushadi; to'liq backfill alohida ops-qadam).
**▶ SESSIYA-BOSHI PROMPT:**
> `docs/REJA-AUDIT-FIX-2026-08.md` — **Faza 9**. O'ZGARMAS QOIDALAR. `DUP-15`+`M-07`'ni tasdiqla.
> `CounterpartyBalanceEntry` journal-jadval + migration, `applyDelta`'da yozdirilsin. TDD: journal-yaraladi +
> Σ==materialized invariant. Gate + migrate. Hisobot (backfill kerakmi — ayt), TO'XTA.
**◻ HISOBOT:** _(agent to'ldiradi)_

---

### Faza 10 — Balans-o'quvchilarni journal'ga ko'chirish (metrics/statement/act/recompute)
**Ustuvorlik:** P1 · **Bog'liqlik:** Faza 9 tugagach
**Muammo:** `M-07`, `DUP-05`, `DUP-06`, `DUP-08`. To'rt xil rekonstruksiya (metrics byOrg,
counterparty-statement, report/counterparty-act, recompute-skript) turli chala hujjat-ro'yxatlari bilan →
akt-sverka materialized balansdan farq qiladi.
**Yechim:** to'rt o'quvchini ham **Faza 9 journal-jadvalidan** o'qishga o'tkaz (org-kesim endi journal'da bor).
Chala `docType` ro'yxatlarini (metrics 9-tur, statement 12-tur, act 8-tur) yo'q qilib, journal `groupBy`'ga
almashtir. «cert invariant» izohlarini haqiqatga moslab test bilan qulfla.
**Fayllar:** Modify `counterparty/counterparty.service.ts` (metrics byOrg),
`counterparty-statement/statement-compute.util.ts` + `counterparty-statement.service.ts`,
`report/counterparty-act.service.ts`, `scripts/recompute-counterparty-balances.ts`. (+ testlar).
**Testlar (TDD):** har o'quvchi yakuniy qoldig'i (`to=now`) materialized balansga teng (bir necha hujjat-turi
aralash stsenariyda: supply, POS-qarz, debt-issue, invoice, payment).
**Gate:** standart API-gate + `vitest run` counterparty, counterparty-statement, report.
**▶ SESSIYA-BOSHI PROMPT:**
> `docs/REJA-AUDIT-FIX-2026-08.md` — **Faza 10** (Faza 9 tugagan). O'ZGARMAS QOIDALAR. `M-07`,`DUP-05/06/08`.
> 4 balans-o'quvchini journal-jadvaldan o'qishga o'tkaz, «closing==materialized» invariantini test bilan qulfla.
> TDD: aralash-hujjat stsenariy. Gate. Hisobot, TO'XTA.
**◻ HISOBOT:** _(agent to'ldiradi)_

---

### Faza 11 — Ledger-teshiklar: Payment→OrganizationAccount + POS-qarz→CashDesk
**Ustuvorlik:** P1 · **Bog'liqlik:** Faza 2 (MoneyService) tugagach
**Muammo:** `M-06` (HIGH), `M-05` (HIGH). PaymentIn/Out `MoneyService`/`OrganizationAccount` balansiga
tegmaydi → bank-hisob balansi doim 0, `/money` bank to'lovlarini ko'rsatmaydi (`FE-03`). POS qarz-to'lovi naqdi
`CashDesk` ledgeriga yozilmaydi → smena soxta ortiqcha.
**Yechim:** (a) PaymentIn/Out post/unpost/cancel'ga `organizationAccountId` bo'lsa
`money.applyDeltas('organization_account', ±sumMinor, {documentKind, documentId})` qo'sh. (b)
`pos-debt-payment.service.ts`'da `method` naqd + `cashDeskId` berilganda tx ichida
`money.applyDeltas('cash_desk', +appliedMinor, {documentKind:'debtpayment', documentId})` qo'sh. (c) `/money`
sahifasi endi bank to'lovlarini ko'rsatishini tekshir (FE tomoni — `money/page.tsx` `LedgerKind`'ga qo'shish
yoki banner). Chaqiruvchilar Faza 2'dagi increment/lock bilan ishlaydi.
**Fayllar:** Modify `payment-in/payment-in.service.ts`, `payment-out/payment-out.service.ts`,
`debt/pos-debt-payment.service.ts`; (FE) `apps/web/src/app/(app)/money/page.tsx`. (+ testlar).
**Testlar (TDD):** (1) PaymentIn post → OrganizationAccount.balanceMinor mos oshdi + MoneyOperation qator.
(2) POS qarz naqd to'lov → CashDesk.balanceMinor oshdi. (3) unpost/cancel teskari.
**Gate:** standart API-gate + `vitest run` payment-in/out, debt; web money.
**Diqqat:** M-06 alternativi — `OrganizationAccount.balanceMinor`'ni butunlay olib tashlab docstring'larni
haqiqatga moslash. Bu **dizayn qaror** — agent hisobotda ikki variantni ko'rsatib, «balans kerak» deb faraz
qiladi (UI'da bank-balans ko'rsatiladi). Ikkilanish bo'lsa DEFER + foydalanuvchidan so'ra.
**▶ SESSIYA-BOSHI PROMPT:**
> `docs/REJA-AUDIT-FIX-2026-08.md` — **Faza 11** (Faza 2 tugagan). O'ZGARMAS QOIDALAR. `M-06`+`M-05`.
> PaymentIn/Out'ni OrganizationAccount balansiga, POS-qarz naqdini CashDesk'ga yozdir; `/money`'da ko'rin.
> TDD: balans oshdi/teskari testlari. Gate (API+web). Hisobot, TO'XTA.
**◻ HISOBOT:** _(agent to'ldiradi)_

---

### Faza 12 — Debt simmetriyasi: remove-reversal + settlement filtr/premise
**Ustuvorlik:** P1 · **Bog'liqlik:** Faza 9/10 tavsiya (lekin mustaqil ishlaydi)
**Muammo:** `DUP-03` (HIGH), `DUP-12` (MEDIUM), `DUP-04` (HIGH). `debt.remove()` create'ning +totalMinor
deltasini qaytarmaydi (o'chirilgan qarz balansda qoladi); settlement so'rovi `deletedAt`/status filtrsiz;
`combinedMinor` premisesi eskirgan (endi ledger create'da yozadi → ikki marta sanaydi).
**Yechim:** (a) `debt.remove()` tx'ida `applyDelta(−debt.totalMinor)` (paidMinor==0 kafolatlangan); restore
bo'lsa +total. (b) `counterparty-settlement.service.ts` debt-so'roviga `deletedAt:null, status:{not:'cancelled'}`.
(c) `counterparty-settlement.util.ts` premisesini yangi haqiqatga moslab `combinedMinor`'ni deprecate/o'chir,
eski-premise assertlarni yangila.
**Fayllar:** Modify `debt/debt.service.ts`, `counterparty-settlement/counterparty-settlement.service.ts`,
`counterparty-settlement/counterparty-settlement.util.ts`. (+ testlar).
**Testlar (TDD):** (1) qarz create→remove → balans 0 ga qaytadi. (2) soft-deleted qarz settlement-qoldig'ida
yo'q. (3) settlement `combinedMinor` ikki marta sanamaydi.
**Gate:** standart API-gate + `vitest run` debt, counterparty-settlement.
**▶ SESSIYA-BOSHI PROMPT:**
> `docs/REJA-AUDIT-FIX-2026-08.md` — **Faza 12**. O'ZGARMAS QOIDALAR. `DUP-03`,`DUP-12`,`DUP-04`.
> debt.remove reversal + settlement deletedAt-filtr + combinedMinor premise-tuzatish. TDD: 3 stsenariy. Gate.
> Hisobot, TO'XTA.
**◻ HISOBOT:** _(agent to'ldiradi)_

---

### Faza 13 — Taminotchi qarzi: PurchaseReturn reversal + double-debt → SUPPLY-ONLY ✅
**Ustuvorlik:** P1 · **Bog'liqlik:** yo'q · **QAROR-B HAL QILINDI: Supply-only**
**Muammo:** `PP-02` (HIGH), `PP-03` (HIGH). PurchaseReturn post kontragent balansini tuzatmaydi (Supply qarz
yozadi, qaytarish yo'q); Supply HAM InvoiceIn HAM −sumMinor yozadi → bir xaridda qarz 2×.
**Yechim (Supply-only — foydalanuvchi 2026-08-08 tanladi):**
- (a) **InvoiceIn'ni balansdan uz:** `invoice-in.service.ts` post/unpost/cancel'dagi
  `balance.applyDelta(−/+ sumMinor)` chaqiruvlarini OLIB TASHLA — InvoiceIn endi qarzga tegmaydi, faqat
  informatsion/PO-invoicedSum hujjati bo'lib qoladi. Qarzni faqat Supply yozadi (mavjud
  `supply.service.ts:1349` o'zgarmaydi).
- (b) **PurchaseReturn simmetriyasi:** `purchase-return.post()`'ga `balance.applyDelta(+sumMinor)`
  (unpost/cancel teskari) qo'sh — Supply'ning −sumMinor'iga simmetrik (tovar qaytdi → qarz kamaydi).
- (c) **Mavjud ma'lumot:** ilgari InvoiceIn post qilib qarz yozgan hujjatlar bo'lsa — balans endi ikki marta
  sanamaydi, lekin tarixiy yozuvlar qoladi; hisobotda «balansni qayta-hisoblash (Faza 8/10 skripti) kerakmi»
  deb ayt (InvoiceIn deltalari endi qamrovdan chiqadi).
**Fayllar:** Modify `invoice-in/invoice-in.service.ts`, `purchase-return/purchase-return.service.ts`. (+ testlar).
**Testlar (TDD):** (1) InvoiceIn post → kontragent balansi O'ZGARMAYDI (faqat Supply yozadi). (2) PO→Supply+InvoiceIn
oqimida taminotchi qarzi faqat 1× (Supply summasi). (3) to'liq PurchaseReturn → taminotchi balansi qarzdan tozalanadi.
**Gate:** standart API-gate + `vitest run` invoice-in, purchase-return, supply.
**Diqqat:** InvoiceIn balansdan uzilgach, `counterparty` metrics/statement/act (Faza 10) `docType:'invoiceIn'`ni
qarz-manba sifatida SANAMASLIGI kerak — Faza 10 bilan izchillikni tekshir (agar Faza 10 avval qilingan bo'lsa,
o'sha ro'yxatдan invoiceIn'ni chiqar). Tartib: Faza 13'ni Faza 10'dan KEYIN qilish tavsiya (yoki hisobotda ogohlantir).
**▶ SESSIYA-BOSHI PROMPT:**
> `docs/REJA-AUDIT-FIX-2026-08.md` — **Faza 13**. O'ZGARMAS QOIDALAR. QAROR-B allaqachon **Supply-only** deb hal
> qilingan. `PP-02`+`PP-03`'ni tasdiqla. InvoiceIn'ni balansdan uz (faqat Supply qarz yozsin), PurchaseReturn'ga
> reversal qo'sh. TDD: 3 stsenariy. Balans qayta-hisoblash kerakmi — hisobotda ayt. Gate. TO'XTA.
**◻ HISOBOT:** _(agent to'ldiradi)_

---

### Faza 14 — Supply-approval: FSM-bypass guard + omborchi recompute totals
**Ustuvorlik:** P1 · **Bog'liqlik:** yo'q
**Muammo:** `PP-06` (HIGH), `PP-04` (HIGH). To'g'ridan-to'g'ri post FSM'ni chetlab o'tadi
(`create(applicable)` permission-bypass, mid-approval edit/delete); omborchi son-tuzatishi supply summalarini
qayta hisoblamaydi (stock yangi qty, qarz eski summa).
**Yechim:** (a) `supply.post()`'ga `approvalStage ∈ {none, completed}` guard; `create/update`'dagi ichki
`transition('post')` oldidan approve-permission tekshiruvi; `approvalStage != none` supply'da update/delete
blok. (b) `omborchiConfirm` tx ichida pozitsiyalar yangilangach `computeTotals`'ni qayta hisoblab
`supply.sumMinor/vatSumMinor/costSumMinor`'ni yoz.
**Fayllar:** Modify `supply/supply.service.ts`, `supply/supply.controller.ts`,
`supply-approval/supply-approval.service.ts`. (+ testlar).
**Testlar (TDD):** (1) `awaiting_supplier` bosqichida post → rad. (2) omborchi 100→90 tuzatsa → sumMinor 90
donaga qayta hisoblanadi, qarz mos. (3) create(applicable) approve-permissionsiz → rad.
**Gate:** standart API-gate + `vitest run` supply, supply-approval.
**▶ SESSIYA-BOSHI PROMPT:**
> `docs/REJA-AUDIT-FIX-2026-08.md` — **Faza 14**. O'ZGARMAS QOIDALAR. `PP-06`+`PP-04`. FSM-bypass guard +
> omborchi computeTotals. TDD: 3 stsenariy. Gate. Hisobot, TO'XTA.
**◻ HISOBOT:** _(agent to'ldiradi)_

---

### Faza 15 — Smena naqdi: expected-cash formula + z-report + close-race
**Ustuvorlik:** P1 · **Bog'liqlik:** yo'q
**Muammo:** `SALES-02` (HIGH), `SALES-06` (MEDIUM), `SALES-07`/`SALES-08` (MEDIUM). «Kutilgan naqd» qaytim
(change) ayirmaydi + refund naqdini ikki marta sanaydi → soxta kamomad; legacy z-report refundni 2× ayiradi;
yopilayotgan smenaga parallel post; picking/ready cheklar yopilgan smenada osilib qoladi.
**Yechim:** (a) `cashier-session.service.ts collectCashInputs`: `salesCashMinor` so'roviga `refundedFromId:null`
qo'sh + `Σ changeMinor`'ni aggregate qilib `expectedCash`'dan ayir. (b) legacy `z-report` `salesAgg`'ini
`state:{in:['posted','refunded']}` ga tuzat yoki endpointni yangi zReport'ga delegatsiya. (c) `post()` tx ичida
sessiyani `updateMany({where:{id,state:'open'}})` bilan claim + close()'da aggregat+flip bitta Serializable tx.
(d) close() draft bilan birga picking/ready'ni ham blok/ko'chir.
**Fayllar:** Modify `cashier-session/cashier-session.service.ts`, `retail-sale/retail-sale.service.ts`,
`retail-sale/retail-sale.controller.ts`. (+ testlar).
**Testlar (TDD):** (1) qaytimli+refundli smena → expected-cash to'g'ri (soxta kamomad yo'q). (2) to'liq-refund
chek → z-report netSum 0. (3) yopilayotgan smenaga post → 409 yoki keyingi smenaga. (4) picking chek yopilgan
smenada bloklanadi.
**Gate:** standart API-gate + `vitest run` cashier-session, retail-sale.
**▶ SESSIYA-BOSHI PROMPT:**
> `docs/REJA-AUDIT-FIX-2026-08.md` — **Faza 15**. O'ZGARMAS QOIDALAR. `SALES-02`,`SALES-06`,`SALES-07/08`.
> expected-cash formula + z-report + close-race + picking-block. TDD: 4 stsenariy. Gate. Hisobot, TO'XTA.
**◻ HISOBOT:** _(agent to'ldiradi)_

---

### Faza 16 — Valyuta konventsiyasini yagonalash
**Ustuvorlik:** P1 · **Bog'liqlik:** yo'q · **🟠 kanonik-masshtab qarori (agent taklif qiladi)**
**Muammo:** `M-03` (HIGH), `DB-01` (HIGH), `M-04` (HIGH). `Currency.code` NUMERIC ('860') ∥ hisobot/CBU ALPHA
('USD') zidligi → face-value fallback (~12000× xato); kurs 3 masshtabda (×10^8/×10^4/Decimal); valyutalararo
to'lov konvertatsiyasiz.
**Yechim:** (a) rate-lookup va CBU-matching'ni `isoCode` (alpha) ustuniga o'tkaz; `loadRateContext`
select'iga `isoCode` qo'sh. (b) kanonik rate-masshtab (×10^8) tanla, `DebtPayment.exchangeRate`/
`RetailSalePayment.rateMinor`'ni backfill-migratsiya bilan o'tkaz; `@moysklad/money`'da `Rate` tipini majbur.
(c) `ensureOperations`'da to'lov-valyuta ≠ invoice-valyuta → 400 (yoki hujjat-kursida konvertatsiya).
**Fayllar:** Modify `currency/currency.service.ts`, `currency/currency.schema.ts`,
`report/report-rate-ctx.util.ts`, `payment-in/payment-in.service.ts`, `invoice-out/invoice-out.service.ts`,
`packages/db/prisma/schema.prisma` (+ migration), `packages/money/src/exchange-rate.ts`. (+ testlar).
**Testlar (TDD):** (1) yangi valyuta (isoCode) hisobotda to'g'ri kurs bilan konvertatsiya (fallback yo'q). (2)
CBU cron numeric-kodli valyutani yangilaydi. (3) valyutalararo to'lov → 400.
**Gate:** standart API-gate + migrate + `vitest run` currency, report, payment-in, `@moysklad/money`.
**Diqqat:** kanonik-masshtab tanlovi — agent hisobotda asoslab, ×10^8'ni faraz qilib davom etadi; test bilan
qulflaydi. Katta backfill bo'lsa DEFER + hisobotda ops-qadam sifatida ayt.
**▶ SESSIYA-BOSHI PROMPT:**
> `docs/REJA-AUDIT-FIX-2026-08.md` — **Faza 16**. O'ZGARMAS QOIDALAR. `M-03`,`DB-01`,`M-04`. isoCode-lookup +
> kanonik rate-masshtab (×10^8) + valyutalararo to'lov guard. TDD: 3 stsenariy. Gate + migrate. Hisobot
> (backfill kerakmi), TO'XTA.
**◻ HISOBOT:** _(agent to'ldiradi)_

---

### Faza 17 — Hisobot kurslari: tarixiy-kurs + noma'lum-valyuta + aralash-jami
**Ustuvorlik:** P1 · **Bog'liqlik:** Faza 16 tugagach
**Muammo:** `M-11` (MEDIUM), `M-12` (MEDIUM), `M-14` (MEDIUM). Hisobotlar tarixiy hujjatni JORIY kursda
konvertatsiya qiladi (o'tgan davr P&L qayta yoziladi); noma'lum valyuta face-value qo'shiladi; MoneyOperation
jami valyutalarni aralashtiradi.
**Yechim:** (a) hisobot konsolidatsiyasida hujjatning o'z `rateValue`'sini ishlat (`SUM(sum_minor*rate_value)
/1e8` SQL'da); joriy kursni faqat ochiq-qoldiq revalyatsiyada. (b) noma'lum valyuta fallback'ini jamidan
chiqarib alohida «konvertatsiya qilinmagan» qatorda ko'rsat (yoki xato). (c) MoneyOperation totals'ni
`groupBy(['currency'])` bilan per-valyuta qaytar.
**Fayllar:** Modify `report/report-rate-ctx.util.ts`, `report/pnl.service.ts`,
`report/cash-flow-consolidate.util.ts`, `money/money-operation.service.ts`. (+ testlar).
**Testlar (TDD):** (1) o'tgan davr P&L kurs o'zgargach o'zgarmaydi. (2) noma'lum valyuta jamiga qo'shilmaydi.
(3) MoneyOperation totals per-valyuta.
**Gate:** standart API-gate + `vitest run` report, money.
**▶ SESSIYA-BOSHI PROMPT:**
> `docs/REJA-AUDIT-FIX-2026-08.md` — **Faza 17** (Faza 16 tugagan). O'ZGARMAS QOIDALAR. `M-11`,`M-12`,`M-14`.
> Tarixiy-kurs + noma'lum-valyuta ajratish + per-valyuta totals. TDD: 3 stsenariy. Gate. Hisobot, TO'XTA.
**◻ HISOBOT:** _(agent to'ldiradi)_

---

### Faza 18 — Tannarx modeli yagonalash → WEIGHTED-AVERAGE ✅
**Ustuvorlik:** P1 (yirik) · **Bog'liqlik:** yo'q · **QAROR-A HAL QILINDI: weighted-average**
**Muammo:** `STK-02`/`STK-03`/`STK-04` (HIGH), `PP-05` (HIGH). Ikki parallel tannarx tizimi (FIFO-lot ∥
weighted-avg) zid: POS `costDeltaMinor:null` → qiymat kamaymaydi; FIFO store-filtrsiz → per-store cost manfiy;
Loss/Inventory/Move lotga tegmaydi → COGS 2×; WorkOrder null-cost + joriy-BOM reversal.
**Yechim (weighted-average, YAGONA model — foydalanuvchi 2026-08-08 tanladi):**
- **POS (retail-sale) va Demand chiqimini o'rtacha-tortilgan tan narxga o'tkaz:** har chiqimda
  `costDeltaMinor`'ni `Stock.costBalanceMinor` dan hisoblangan per-unit o'rtacha bilan ber
  (`costBalanceMinor/qty × chiqim-qty`, mikro-birlik). `costDeltaMinor:null` (STK-02) yo'qotiladi.
- **FIFO lot-ledgerni bekor qil:** `demand`'dagi `consumeFifo`/`reverseFifo` va `DemandPositionCostConsumption`
  yozuvlari o'rniga weighted-average COGS; `SupplyPosition.remainingQty` endi COGS uchun ishlatilmaydi
  (unpost-guardlar remainingQty o'rniga boshqa mezonga o'tkaziladi — hisobotda ayt).
- **Loss/Inventory/Move/Enter allaqachon weighted-avg** — endi ular yagona model, zidlik yo'qoladi (STK-04);
  Move per-unit yaxlitlash qoldig'ini oxirgi-birlik tuzatish bilan yop (STK-08 bilan bog'liq).
- **WorkOrder:** null-cost o'rniga Processing dvigatelidagi kabi weighted-average consume/output (PP-05).
- `Stock.costBalanceMinor` PER-STORE bo'lgani uchun (STK-03 ildizi) — chiqim o'sha store'ning o'rtachasidan
  hisoblanadi; store-filtr endi avtomatik to'g'ri (FIFO cross-store bug yo'qoladi).
**Fayllar:** Modify `demand/demand.service.ts` (+ `fifo-consumer.ts` — o'rtacha-avg helperga),
`retail-sale/retail-sale.service.ts`, `work-order/work-order.service.ts`, `stock/stock.service.ts`,
`move/move.service.ts`; ehtimol `supply/supply.service.ts` (unpost-guard). (+ testlar).
**Testlar (TDD):** (1) POS sotuvdan keyin `costBalanceMinor` per-unit o'rtacha × qty ga kamayadi (shishmaydi).
(2) ko'p-omborli chiqim o'z store o'rtachasini ishlatadi (cross-store manfiy yo'q). (3) Loss→Demand ketma-ketligida
COGS ikki marta chiqmaydi. (4) WorkOrder complete→cancel zero-sum. (5) unpost/cancel simmetrik teskari.
**Gate:** standart API-gate + `vitest run` demand, loss, inventory, move, enter, retail-sale, work-order, stock, `@moysklad/money`.
**Diqqat:** Bu eng katta faza. Tavsiya — sub-fazaga bo'lish: **18a** POS+Demand weighted-avg COGS (STK-02/03 +
FIFO bekor); **18b** WorkOrder cost (PP-05); **18c** Move oxirgi-birlik + unpost-guard tozalash. Agent birinchi
sessiyada hajmni baholab, kerak bo'lsa 18a'ni qilib qolganini alohida sessiyalarga qoldiradi (har biri commit).
FIFO lot-ledgerni o'chirish tarixiy ma'lumotга ta'sir qilishi mumkin — mavjud `DemandPositionCostConsumption`
qatorlarini o'chirmasdan «read-only legacy» qoldirib, faqat yangi yo'lni weighted-avg qilish xavfsizroq (ayt).
**▶ SESSIYA-BOSHI PROMPT:**
> `docs/REJA-AUDIT-FIX-2026-08.md` — **Faza 18**. O'ZGARMAS QOIDALAR. QAROR-A allaqachon **weighted-average** deb
> hal qilingan — FIFO'ni so'raMA, weighted-avg'ni qo'lla. `STK-02/03/04`+`PP-05`'ni tasdiqla. POS/Demand chiqimini
> o'rtacha-tortilgan COGS'ga o'tkaz, FIFO lot-ledgerni bekor qil (eski qatorlarни legacy qoldir), WorkOrder cost.
> Hajm katta — 18a/18b/18c sub-fazaga bo'lishni taklif qil, faqat 18a'ni qilsang ham bo'ladi. TDD: 5 stsenariy.
> Gate. Hisobot, TO'XTA.
**◻ HISOBOT:** _(agent to'ldiradi)_

---

### Faza 19 — To'lov-gateway → moliyaviy hujjat + idempotency
**Ustuvorlik:** P1 · **Bog'liqlik:** Faza 3/11 tavsiya
**Muammo:** `INT-02` (HIGH), `INT-03` (HIGH), `INT-04` (HIGH). Payme/Click «captured» ERP moliyasiga o'tmaydi;
Click PREPARE summa-tekshiruvi float (to'g'ri to'lov rad); `providerTxId` unique emas + Click idempotency yo'q.
**Yechim:** (a) `paymePerform`/Click COMPLETE ichida (tx) PaymentIn draft yaratib CustomerOrder'ga bog'la;
`paymeCancel` uchun qaytarish yoki admin-notification. (b) Click summa-tekshiruvini
`BigInt(Math.round(Number(amount)*100)) !== order.sumMinor` (yoki decimal-parse) qil. (c)
`@@unique([accountId, provider, providerTxId])` migration + create'ni upsert/try-catch(P2002); Click PREPARE'da
existing-check.
**Fayllar:** Modify `payment-gateway/payment-gateway.service.ts`, `packages/db/prisma/schema.prisma`
(+ migration). (+ testlar).
**Testlar (TDD):** (1) captured Payme → PaymentIn draft + order to'lov-holat. (2) tiyinli summa (115.23) Click
PREPARE o'tadi. (3) takroriy providerTxId → bitta qator (P2002).
**Gate:** standart API-gate + migrate + `vitest run` payment-gateway.
**▶ SESSIYA-BOSHI PROMPT:**
> `docs/REJA-AUDIT-FIX-2026-08.md` — **Faza 19**. O'ZGARMAS QOIDALAR. `INT-02`,`INT-03`,`INT-04`. Gateway→PaymentIn
> + Click-amount BigInt + providerTxId unique/idempotency. TDD: 3 stsenariy. Gate + migrate. Hisobot, TO'XTA.
**◻ HISOBOT:** _(agent to'ldiradi)_

---

### Faza 20 — Bank-import: commit-poyga + vypiska-dedup
**Ustuvorlik:** P1 · **Bog'liqlik:** yo'q
**Muammo:** `INT-05` (HIGH). Commit avval o'qiydi keyin `paymentIn.create` — parallel ikki commit dublikat
PaymentIn; bir faylni qayta yuklab commit qilsa oy to'lovlari dublikat.
**Yechim:** har row uchun atomik claim `updateMany({where:{id, paymentInId:null, paymentOutId:null},
data:{...}})` (yoki tx + advisory lock); upload'da fayl-hash yoki (sana,summa,documentNumber) bo'yicha mavjud
PaymentIn'ga ogohlantirish/dedup.
**Fayllar:** Modify `bank-import/bank-import.service.ts` (+ schema hash-ustun kerak bo'lsa migration). (+ test).
**Testlar (TDD):** (1) ikki parallel commit bir row → bitta PaymentIn. (2) bir fayl 2× yuklab commit → dedup.
**Gate:** standart API-gate + `vitest run` bank-import.
**▶ SESSIYA-BOSHI PROMPT:**
> `docs/REJA-AUDIT-FIX-2026-08.md` — **Faza 20**. O'ZGARMAS QOIDALAR. `INT-05`. Row-level atomik claim +
> fayl/qator dedup. TDD: parallel-commit + qayta-yuklash testlari. Gate. Hisobot, TO'XTA.
**◻ HISOBOT:** _(agent to'ldiradi)_

---

# P2 — XAVFSIZLIK

---

### Faza 21 — Telegram webhook secret + gateway timing-safe
**Ustuvorlik:** P2 · **Bog'liqlik:** yo'q
**Muammo:** `INT-01`/`AUTH-01` (HIGH), `INT-14` (LOW). Telegram inbound webhook secret-token
TEKSHIRILMAYDI → autentifikatsiyasiz supply-tasdiqlash callback in'eksiyasi; gateway secret solishtirish
constant-time emas.
**Yechim:** (a) `telegram-webhook.controller.ts`'da `handleInbound` oldidan `TelegramConfig.webhookSecret` bilan
`x-telegram-bot-api-secret-token`'ni `crypto.timingSafeEqual` orqali solishtir, mos kelmasa 401; secret yo'q
config uchun ham talab. (b) `payme.protocol.ts`/`click.protocol.ts` string `===`'ni `timingSafeEqual`'ga
almashtir. (c) Faza 13 (INT-13 saveConfig NULL-reset) bilan ehtiyot — bu fazada ham ko'r.
**Fayllar:** Modify `telegram/telegram-webhook.controller.ts`, `telegram/telegram.service.ts`,
`payment-gateway/payme.protocol.ts`, `payment-gateway/click.protocol.ts`. (+ testlar).
**Testlar (TDD):** (1) noto'g'ri/yo'q secret bilan webhook → 401, `handleInbound` chaqirilmaydi. (2) to'g'ri
secret → o'tadi. (3) timing-safe compare mos ishlaydi.
**Gate:** standart API-gate + `vitest run` telegram, payment-gateway.
**▶ SESSIYA-BOSHI PROMPT:**
> `docs/REJA-AUDIT-FIX-2026-08.md` — **Faza 21**. O'ZGARMAS QOIDALAR. `INT-01`+`INT-14`. Webhook secret
> validatsiya (timingSafeEqual) + gateway constant-time compare. TDD: 401-testlari. Gate. Hisobot, TO'XTA.
**◻ HISOBOT:** _(agent to'ldiradi)_

---

### Faza 22 — Boot-guard JWT/COOKIE + query-token cheklovi
**Ustuvorlik:** P2 · **Bog'liqlik:** yo'q
**Muammo:** `AUTH-02` (HIGH), `AUTH-04`/`FE-05` (MEDIUM). `JWT_SECRET`/`COOKIE_SECRET` env yo'q bo'lsa
`'dev-secret-change-in-prod'` ga tushadi → auth-bypass; `access_token` URL query-param'da har endpointda →
nginx-log/brauzer-tarix sizishi.
**Yechim:** (a) boot'da `NODE_ENV=production` bo'lsa `JWT_SECRET`/`COOKIE_SECRET` mavjud VA dev-fallback EMAS
ekanini majburiy tekshir (`parseTtl` kabi loudly throw). (b) query-param token'ni faqat aniq SSE marshrutlarga
cheklab qo'y (alohida guard/path-check); FE'da rasm/fayl uchun qisqa-muddatli signed-URL yoki cookie-media path.
**Fayllar:** Modify `auth/auth.module.ts`, `main.ts`, `auth/jwt-auth.guard.ts`, `permissions/permissions.guard.ts`;
(FE) `apps/web/src/lib/image-url.ts`, `attachments-section.tsx`, `purchase-orders/page.tsx`. (+ testlar).
**Testlar (TDD):** (1) prod + secret yo'q → boot throw. (2) query-token non-SSE endpointda rad (yoki faqat SSE).
**Gate:** standart API-gate + `vitest run` auth, permissions; web build.
**Diqqat:** FE signed-URL — katta o'zgarish bo'lsa DEFER + hisobotda ayt; minimal: query-token'ni SSE'ga cheklash
(server) darhol qilinadi, media-URL alohida fazaga.
**▶ SESSIYA-BOSHI PROMPT:**
> `docs/REJA-AUDIT-FIX-2026-08.md` — **Faza 22**. O'ZGARMAS QOIDALAR. `AUTH-02`+`AUTH-04`/`FE-05`. Boot-guard
> (prod secret majbur) + query-token SSE-cheklov. TDD: boot-throw + guard testlari. Gate. Hisobot (media-URL
> DEFER bo'lsa ayt), TO'XTA.
**◻ HISOBOT:** _(agent to'ldiradi)_

---

### Faza 23 — HR self-eskalatsiya + login-only mutatsiyalar + offboarding-revoke
**Ustuvorlik:** P2 · **Bog'liqlik:** yo'q
**Muammo:** `HR-10` (MEDIUM), `AUTH-07` (MEDIUM), `AUTH-05` (MEDIUM). `employees:full` egasi o'ziga HR-admin
bera oladi; Group create/delete rol-tekshiruvsiz; xodim ketganda `revokeAllForEmployee` chaqirilmaydi.
**Yechim:** (a) o'z-o'ziga permission/`hrRoles` o'zgartirishni taqiqla (`actorId===employeeId`→403), 'admin'
rolini faqat admin bersin. (b) `@RequirePermission`'siz controllerlarni audit qilib (grep bilan ro'yxat →
o'qib tasdiq) mutatsiyalarga tegishli `entity.action` qo'sh (Group birinchi). (c) offboarding complete tx'ida
`tokens.revokeAllForEmployee(id)` + `permissions.invalidate(id)` + HR permission/rol tozalash.
**Fayllar:** Modify `hr/hr-employee-permission/hr-employee-permission.controller.ts` + `.service.ts`,
`hr/hr-employee/hr-employee.service.ts`, `group/group.controller.ts`, `hr/hr-employee/offboarding.service.ts`,
`auth/token.service.ts` (reuse). (+ testlar).
**Testlar (TDD):** (1) o'ziga admin-rol → 403. (2) Group create permissionsiz rol → 403. (3) offboarding →
refresh-tokenlar revoke.
**Gate:** standart API-gate + `vitest run` hr, group, auth.
**Diqqat:** `@RequirePermission`'siz controller ro'yxati katta bo'lishi mumkin — bu fazada Group + eng xavfli
2-3 tasini yop, qolganini hisobotda ro'yxatlab keyingi fazaga qoldirish mumkin.
**▶ SESSIYA-BOSHI PROMPT:**
> `docs/REJA-AUDIT-FIX-2026-08.md` — **Faza 23**. O'ZGARMAS QOIDALAR. `HR-10`,`AUTH-07`,`AUTH-05`. Self-eskalatsiya
> guard + Group permission + offboarding token-revoke. TDD: 3 stsenariy. Gate. Hisobot (qolgan guard-siz
> controllerlar ro'yxati), TO'XTA.
**◻ HISOBOT:** _(agent to'ldiradi)_

---

### Faza 24 — EDO PFX shifrlash + ApiToken scopes
**Ustuvorlik:** P2 · **Bog'liqlik:** yo'q
**Muammo:** `INT-06` (MEDIUM), `INT-07` (MEDIUM). EDO PFX xususiy kaliti DB'da SHIFRLANMAGAN (komment yolg'on);
`ApiToken.scopes` tekshirilmaydi → har token `permissions:['*']`.
**Yechim:** (a) `pfxBytes`'ni AES-GCM (`encryptBuffer` varianti) bilan o'rab yoz, o'qishda deshifrlab; komment
haqiqatga. (b) `api-token.guard.ts`'da `apiToken.scopes`'ni o'qib `permissions`'ga map (bo'sh scopes = '*'
faqat ochiq hujjatlansa); slug-darajali scope tekshiruvi.
**Fayllar:** Modify `edo/edo.service.ts`, `edo/crypto`(yoki mavjud `crypto.ts`),
`moysklad-compat/api-token.guard.ts`, `moysklad-compat/api-token.service.ts`. (+ testlar).
**Testlar (TDD):** (1) PFX yozilib-o'qilganda shifrlangan (DB'da ochiq emas), deshifr to'g'ri. (2) scope-cheklangan
token faqat o'sha entity'ga kiradi.
**Gate:** standart API-gate + `vitest run` edo, moysklad-compat.
**▶ SESSIYA-BOSHI PROMPT:**
> `docs/REJA-AUDIT-FIX-2026-08.md` — **Faza 24**. O'ZGARMAS QOIDALAR. `INT-06`+`INT-07`. PFX AES-GCM shifrlash +
> ApiToken scope-enforcement. TDD: shifr + scope testlari. Gate. Hisobot, TO'XTA.
**◻ HISOBOT:** _(agent to'ldiradi)_

---

# P3 — SCALE

---

### Faza 25 — DB indeks-paket (hot FK + barcode/INN/yacheyka)
**Ustuvorlik:** P3 · **Bog'liqlik:** yo'q
**Muammo:** `DB-04`, `DB-05`, `DB-08`, `PERF-12`, `PERF-14`. Yetishmayotgan indekslar: `RetailSale.agentId`,
`CustomerOrder.statusId/contractId/projectId/storeId`, `Demand.statusId`, `Debt.problem`; `Product.barcodes`
GIN yo'q; INN/yacheyka JSON ichida indekssiz.
**Yechim:** migratsiya-paket: kompozit `@@index`'lar + `Product.barcodes` uchun GIN
(`CREATE INDEX … USING GIN (barcodes)`) + expression-indekslar `((uz_requisites->>'inn'))` va
`((attributes->>'__yacheyka'))` (raw-migration, `WHERE deleted_at IS NULL`). Faqat indeks — kod-mantiq tegilmaydi.
**Fayllar:** Modify `packages/db/prisma/schema.prisma` (+ raw-migration `.sql`). (+ mavjud query-testlar regress yo'q).
**Testlar:** indeks migratsiyasi ishga tushadi; `EXPLAIN` bilan (ixtiyoriy) index-scan tasdiqlanadi. Regress: mavjud
modul testlari yashil.
**Gate:** `pnpm --filter @moysklad/db migrate` + standart API-gate (typecheck/biome/test regress).
**Diqqat:** `pg_trgm` lokal DB'da yo'q bo'lishi mumkin (`climart-adopt-local-db-untracked.md`) — GIN barcode
`array_ops` bilan (trgm shart emas). Barcode/INN **unique** cheklovini bu fazada QO'YMA (avval dublikatlarni
merge qilish kerak — alohida data-migration); faqat indeks.
**▶ SESSIYA-BOSHI PROMPT:**
> `docs/REJA-AUDIT-FIX-2026-08.md` — **Faza 25**. O'ZGARMAS QOIDALAR. `DB-04/05/08`,`PERF-12/14`. Hot-FK indeks +
> barcode GIN + INN/yacheyka expression-indeks migration (unique EMAS, faqat indeks). Gate + migrate + regress.
> Hisobot, TO'XTA.
**◻ HISOBOT:** _(agent to'ldiradi)_

---

### Faza 26 — Dashboard: updatedAt indeks + kesh + recentDocs/overdue tuzatish
**Ustuvorlik:** P3 · **Bog'liqlik:** Faza 25 tavsiya
**Muammo:** `PERF-05` (MEDIUM), `PERF-06` (MEDIUM), `PERF-11` (MEDIUM). Dashboard 12-jadval UNION `updated_at`
indekssiz (komment «bor» deydi); butun-tarix pul-agregat har ochilishda; kesh qatlami yo'q; overdue over-fetch
evristikasi noto'g'ri.
**Yechim:** (a) 12 jadvalga `@@index([accountId, updatedAt(sort:Desc)])` migration. (b) pul-bloklarni
materialized manbadan o'qi (MoneyService balance) yoki qisqa-TTL (30-60s) in-memory kesh; `loadRateContext`'ni
request-scope. (c) overdue items'ni raw-SQL predikat bilan (over-fetch o'rniga).
**Fayllar:** Modify `packages/db/prisma/schema.prisma` (+ migration), `report/dashboard.service.ts`. (+ testlar).
**Testlar (TDD):** overdue items = agregat-predikat bilan mos; kesh TTL ichida bir marta so'raydi.
**Gate:** standart API-gate + migrate + `vitest run` report.
**▶ SESSIYA-BOSHI PROMPT:**
> `docs/REJA-AUDIT-FIX-2026-08.md` — **Faza 26**. O'ZGARMAS QOIDALAR. `PERF-05/06/11`. updatedAt-indeks + kesh +
> overdue raw-SQL. TDD: overdue-mos + kesh testlari. Gate + migrate. Hisobot, TO'XTA.
**◻ HISOBOT:** _(agent to'ldiradi)_

---

### Faza 27 — Hisobot paginatsiya/agregat to'g'riligi
**Ustuvorlik:** P3 · **Bog'liqlik:** yo'q
**Muammo:** `PERF-01`, `PERF-02`, `PERF-04`, `PERF-10`, `DUP-14`. Hisobotlar hammani RAM'ga tortib JS'da
agregat + qattiq cap jim kesadi (analitika-items 10k, akt-sverka butun-tarix, balans top-N/5000, stock-balance
search-after-take).
**Yechim:** (a) items/stock-balance: search'ni `take`'dan OLDIN product-id pre-filter'ga (SQL where); sort='name'
uchun DB-paginate. (b) balans-hisobot jami'ni butun-where bo'yicha `groupBy/aggregate` (top-N emas). (c) akt-sverka'ga
davr-filtri (dateFrom/dateTo) + davr-boshi saldo-forward; pozitsiyalarni faqat product-filtr rejimida tort. (d)
`report/counterparty-balance` relation-filtrni SQL JOIN'ga (5000-cap yo'q).
**Fayllar:** Modify `analitika/items.service.ts`, `counterparty-statement/counterparty-statement.service.ts`,
`report/counterparty-balance.service.ts`, `report/stock-balance.service.ts`. (+ testlar).
**Testlar (TDD):** (1) cap'dan katta datasetda total to'g'ri (truncation-flag). (2) qidiruv cap tashqarisidagi
elementni topadi. (3) balans-jami butun-where bo'yicha.
**Gate:** standart API-gate + `vitest run` analitika, counterparty-statement, report.
**Diqqat:** Bu 4 hisobotni bitta sessiyada qilish og'ir bo'lsa, agent hajmni baholab sub-fazaga bo'lishni taklif qiladi.
**▶ SESSIYA-BOSHI PROMPT:**
> `docs/REJA-AUDIT-FIX-2026-08.md` — **Faza 27**. O'ZGARMAS QOIDALAR. `PERF-01/02/04/10`,`DUP-14`. Search-before-take
> + SQL-agregat + davr-filtr. TDD: 3 stsenariy. Og'ir bo'lsa sub-faza taklif. Gate. Hisobot, TO'XTA.
**◻ HISOBOT:** _(agent to'ldiradi)_

---

### Faza 28 — Cron single-instance: outbox atomik-claim + dedup
**Ustuvorlik:** P3 · **Bog'liqlik:** yo'q
**Muammo:** `INT-08` (MEDIUM), `HR-4` (HIGH→MEDIUM), `INT-09` (MEDIUM). Outbox «atomik claim»i aslida
qulflamaydi (`pending→pending`) → cluster'da dublikat xabar; yuborish→keyin-status tartibi crash'da dublikat.
**Yechim:** claim'ni chiqib-ketadigan holatga (`status:'processing'` yoki `$queryRaw FOR UPDATE SKIP LOCKED`) +
`WHERE status IN ('pending','retry')`, faqat `count=1` bo'lsa yubor; yuborishdan OLDIN `attemptedAt`/`sending`
yoz; provider dedup-kalit (idempotency) yoki (toPhone+body-hash) kunlik dedup. `ecosystem.config.cjs`'ga
«instances:1 shart» komment/guard.
**Fayllar:** Modify `hr/hr-telegram-bridge/hr-telegram-outbox-worker.service.ts`,
`webhook/webhook-delivery.service.ts`, `sms/sms-delivery.service.ts`, `email/email-delivery.service.ts`,
`telegram/telegram.service.ts`, `deploy/ecosystem.config.cjs`. (+ testlar).
**Testlar (TDD):** ikki parallel worker-claim bir qatorga → faqat bittasi yuboradi (`count=1`).
**Gate:** standart API-gate + `vitest run` hr, webhook, sms, email, telegram.
**▶ SESSIYA-BOSHI PROMPT:**
> `docs/REJA-AUDIT-FIX-2026-08.md` — **Faza 28**. O'ZGARMAS QOIDALAR. `INT-08`,`HR-4`,`INT-09`. Outbox exclusive
> claim (processing/SKIP LOCKED) + sending-first + dedup. TDD: parallel-claim testi. Gate. Hisobot, TO'XTA.
**◻ HISOBOT:** _(agent to'ldiradi)_

---

### Faza 29 — HR to'g'rilik paketi (base-salary + shift + fine + tz + soft-delete)
**Ustuvorlik:** P3 · **Bog'liqlik:** yo'q
**Muammo:** `HR-1` (HIGH), `HR-2` (HIGH), `HR-3` (HIGH), `HR-7`/`HR-8` (MEDIUM), `HR-13` (MEDIUM). Base salary
prod'da doim 0 (salaryConfig yozilmaydi); GPS check-in `resolveShift`'siz (noto'g'ri kechikish); avto-jarima
davomat tuzatishi bilan sinxron emas; oy/kun tz off-by-one; `HrAttendance.delete` hard-delete auditsiz.
**Yechim:** (a) `extractBaseSalaryMinor` fallback `Employee.salaryMinor` (yoki update sinxron yozsin). (b)
`ping-ingest` KELDI yo'lida `resolveShift + lateMinutesForShift` ishlat (hr-attendance uslubi). (c) `edit()`da
`lateMinutes` qayta hisob + auto_late jarima storno/update; `delete()` soft-delete + auditLog. (d) `monthBounds`/
`daysInMonthOf`'ni Tashkent-tz (`localDateOnly`/`fromZonedTime`) bilan. 
**Fayllar:** Modify `hr/hr-salary/hr-payroll.service.ts` + `payroll-formula.util.ts`,
`hr/attendance-geo/ping-ingest.service.ts`, `hr/attendance/hr-attendance.service.ts`,
`hr/hr-bonus-fine/hr-bonus-fine.service.ts`, `hr/hr-kpi/hr-kpi.service.ts`. (+ testlar).
**Testlar (TDD):** (1) base salary hisobga kiradi. (2) siklik jadvalli xodim GPS-kechikishi to'g'ri. (3)
check-in tuzatilsa jarima qayta hisob. (4) oy-chegarasi (00:00-05:00) to'g'ri oyga. (5) delete soft+audit.
**Gate:** standart API-gate + `vitest run` hr.
**Diqqat:** HR paketi katta — agent har topilmani alohida commit qilib, kerak bo'lsa sub-fazaga bo'lishni taklif qiladi.
**▶ SESSIYA-BOSHI PROMPT:**
> `docs/REJA-AUDIT-FIX-2026-08.md` — **Faza 29**. O'ZGARMAS QOIDALAR. `HR-1/2/3/7/8/13`. Base-salary + shift-resolve
> + fine-sync + tz + soft-delete. TDD: 5 stsenariy. Og'ir bo'lsa sub-faza. Gate. Hisobot, TO'XTA.
**◻ HISOBOT:** _(agent to'ldiradi)_

---

# P4 — TEXNIK QARZ / FRONTEND

---

### Faza 30 — FE POS: refund-crash + pul-parse + float-total
**Ustuvorlik:** P4 · **Bog'liqlik:** Faza 6 tavsiya
**Muammo:** `FE-02` (web, HIGH — `BigInt(1.5)` crash), `FE-08`/`FE-09` (web-arch, MEDIUM — 4 pul-parse variant),
`FE-01` (web-arch, HIGH — retail float total server BigInt bilan rad).
**Yechim:** (a) `returnQty`'ni string (decimal) sifatida saqla, pul hisobini micro-birlik ko'paytmasi bilan
(`BigInt(1.5)` yo'q). (b) `lib/pos/parse-amount.ts` bitta funksiya (`Money.fromMajor` asosida), 4 dialog shunga.
(c) `retail/page.tsx` cart-total'ni `lib/pos/cart-math` + `computePositionTotal`'ga (sotuv/ bilan bir xil).
**Fayllar:** Modify `apps/web/src/app/(app)/sotuv/page.tsx`, `retail/page.tsx`,
`components/pos/{payment-dialog,debt-payment-dialog,rasmilashtirish-modal,cash-out-dialog}.tsx`; Create
`lib/pos/parse-amount.ts`. (+ testlar).
**Testlar (TDD):** (1) kasr-qty chekda refund crash emas. (2) parse-amount 0/3-kasr valyutada to'g'ri. (3) retail
cart-total server BigInt bilan mos (rad yo'q).
**Gate:** `@moysklad/web` typecheck + `vitest run` (pos, retail) + `pnpm lint:product` + `i18n:gate`.
**▶ SESSIYA-BOSHI PROMPT:**
> `docs/REJA-AUDIT-FIX-2026-08.md` — **Faza 30**. O'ZGARMAS QOIDALAR. Web `FE-02`,`FE-08/09`,`FE-01`. Refund-crash
> string-qty + `lib/pos/parse-amount` + retail cart-math. TDD: 3 stsenariy. Gate (web). Hisobot, TO'XTA.
**◻ HISOBOT:** _(agent to'ldiradi)_

---

### Faza 31 — FE dedup codemodlar (computeLineTotal, YesNoSelect, api-client)
**Ustuvorlik:** P4 · **Bog'liqlik:** yo'q
**Muammo:** `FE-10` (13× computeLineTotal), `FE-02` (24× YesNoSelect/MultiRefField/refFetcher), `FE-06`/`FE-14`
(api-client blob/401 4× nusxa + retry-teshigi).
**Yechim:** (a) `lib/doc-totals.ts`'ga `computeLineTotalSafe` — 13 import bilan almashtir (deterministik codemod).
(b) `components/filters/`'ga `YesNoSelect`/`MultiRefField`/`refFetcher` — 24 fayl shunga. (c) `api-client`'da
bitta `authedFetch` (401-retry) + `saveBlobAs` helper — download()'ga ham retry qo'sh (FE-06 teshigi).
**Fayllar:** Modify `apps/web/src/lib/api-client.ts`, `lib/doc-totals.ts`, `components/filters/*`, +13/+24 sahifa.
Create umumiy komponentlar. (+ testlar).
**Testlar (TDD):** (1) doc-totals helper aniqligi. (2) download() 401→refresh→retry. (3) codemod'dan keyin
sahifalar typecheck.
**Gate:** `@moysklad/web` typecheck + `vitest run` + `pnpm lint:product`.
**Diqqat:** Mexanik — deterministik codemod skript (0 token) afzal, agent faqat verifikatsiya qiladi (CLAUDE.md §0.1).
**▶ SESSIYA-BOSHI PROMPT:**
> `docs/REJA-AUDIT-FIX-2026-08.md` — **Faza 31**. O'ZGARMAS QOIDALAR. `FE-10`,`FE-02`,`FE-06/14`. computeLineTotal +
> YesNoSelect + api-client helper dedup (codemod). TDD: helper + 401-retry. Gate (web). Hisobot, TO'XTA.
**◻ HISOBOT:** _(agent to'ldiradi)_

---

### Faza 32 — FE auth-UX + POS i18n
**Ustuvorlik:** P4 · **Bog'liqlik:** yo'q
**Muammo:** `FE-07` (refresh o'lganda «tirik» ko'rinadi, redirect yo'q), `FE-08` (web-correct, POS hardcoded
o'zbekcha — til almashmaydi).
**Yechim:** (a) `auth-store.ts refresh()`da `res.status===401` bo'lsa state tozala + `writeAuthHint(false)` +
`emit()` → layout redirect ishga tushadi; tarmoq-xatoni 401'dan farqla. (b) POS matnlarini `pages.sotuv/pos`
nomfazolariga ko'chir; i18n hardcoded-guard skanerini `components/pos`+`sotuv`ga yoy.
**Fayllar:** Modify `apps/web/src/lib/auth-store.ts`, `app/(app)/layout.tsx`, `app/(app)/sotuv/page.tsx`,
`components/pos/*.tsx`, `messages/{ru,uz}.json`, i18n-guard test. (+ testlar).
**Testlar (TDD):** (1) refresh 401 → auth tozalanadi/redirect. (2) POS matnlari i18n-key, hardcoded-guard o'tadi.
**Gate:** `@moysklad/web` typecheck + `vitest run` + `pnpm i18n:gate` + `pnpm lint:product`.
**▶ SESSIYA-BOSHI PROMPT:**
> `docs/REJA-AUDIT-FIX-2026-08.md` — **Faza 32**. O'ZGARMAS QOIDALAR. `FE-07`+`FE-08`. Refresh-dead redirect +
> POS i18n ko'chirish. TDD: redirect + i18n testlari. Gate (web+i18n). Hisobot, TO'XTA.
**◻ HISOBOT:** _(agent to'ldiradi)_

---

### Faza 33 — API-tip umumiy manba (contracts)
**Ustuvorlik:** P4 · **Bog'liqlik:** yo'q
**Muammo:** `FE-12` (MEDIUM). API-tip kontraktlari har sahifada qo'lda → server javobi o'zgarsa typecheck jim
(DocumentEditor prop-drop bug-klassi); `CashDesk` null-farqi kabi runtime-crashlar.
**Yechim:** apps/api Zod-sxemalaridan `z.infer` tiplarni umumiy paketga (`packages/contracts`) eksport, yoki
OpenAPI→ts-client generatsiya. Boshlash: eng ko'p ishlatiladigan 3-5 endpoint tipini markazlashtir, sahifalarni
lokal interfeysdan bosqichma-bosqich o'tkaz.
**Fayllar:** Create `packages/contracts` (yoki `apps/web/src/lib/api-types` re-export); Modify tanlangan sahifalar.
**Testlar:** typecheck (tip-mos); bitta endpoint uchun server-Zod ↔ FE-tip mosligi test.
**Gate:** `@moysklad/api` + `@moysklad/web` typecheck + `pnpm lint:product`.
**Diqqat:** To'liq migratsiya katta — bu faza infratuzilma + 3-5 endpoint bilan cheklanadi, qolgani keyingi
sessiyalarga (hisobotda ro'yxat).
**▶ SESSIYA-BOSHI PROMPT:**
> `docs/REJA-AUDIT-FIX-2026-08.md` — **Faza 33**. O'ZGARMAS QOIDALAR. `FE-12`. Zod→shared-type infra + 3-5 endpoint.
> Test: server-Zod↔FE-tip moslik. Gate. Hisobot (qolgan endpointlar ro'yxati), TO'XTA.
**◻ HISOBOT:** _(agent to'ldiradi)_

---

### Faza 34 — Float→BigInt aniqlik (inventory/move/CO)
**Ustuvorlik:** P4 · **Bog'liqlik:** Faza 18 tavsiya
**Muammo:** `STK-05` (inventory variance float), `STK-08` (move per-unit rounding qoldiq), `SALES-10`/`STK-12`
(CO shipment/rezerv/available float `Number()`).
**Yechim:** `stock.service`/`fifo-consumer` primitivlarini (`toMicro`/`compareDecimals`/`computeLineCost`)
inventory variance, move per-unit, CO kaskadi va `available = qty − reserved` hisoblariga tarqat; `StockService`ga
`availableOf(balance): string` helper. Float-arifmetikani BigInt mikro-birlikka.
**Fayllar:** Modify `inventory/inventory.service.ts`, `move/move.service.ts`, `customer-order/customer-order.service.ts`,
`internal-order/internal-order.service.ts`, `stock/stock.service.ts`. (+ testlar).
**Testlar (TDD):** (1) kasr-qty variance to'g'ri (0.1+0.2 klass). (2) to'liq-ko'chirishda costBalance qoldiqsiz.
(3) available BigInt yo'l float bilan mos.
**Gate:** standart API-gate + `vitest run` inventory, move, customer-order, internal-order, stock.
**▶ SESSIYA-BOSHI PROMPT:**
> `docs/REJA-AUDIT-FIX-2026-08.md` — **Faza 34**. O'ZGARMAS QOIDALAR. `STK-05`,`STK-08`,`SALES-10`,`STK-12`.
> Float→BigInt primitivlarni tarqat + `availableOf` helper. TDD: 3 stsenariy. Gate. Hisobot, TO'XTA.
**◻ HISOBOT:** _(agent to'ldiradi)_

---

## Qamralmagan (keyingi to'lqin — past ustuvorlik)

Bu topilmalar rejaga kiritilmadi (past xavf yoki hujjatlangan-qaror); alohida so'ralganda faza qilinadi:
`AUTH-03` (record-scope default), `AUTH-06` (rate-limit — infra), `AUTH-08`/`PP-11` (magic-link one-time),
`PP-07/08/09/10/12/13/14/15`, `STK-06/07/09/10/11/13/14/15`, `M-08/M-13/M-15`, `DUP-09/10/11/13`,
`SALES-11/12/13/14/15`, `FE-03/04/05/11/13/15` (web), `HR-5/6/9/11/12/14/15`, `INT-10/11/12/13/15`,
`DB-02/03/06/07/09/10/11/12/13/14/15`, `PERF-03/07/08/09/13/15`. Sxema-DB-* topilmalari adversarial-verify
qilinmagan (Fable-limit) — faza qilishdan oldin ground-truth qayta-tekshirish shart.

---

# 📋 HISOBOT JURNALI

> Har agent o'z fazasini tugatgach shu yerga yozadi. Format:
> `## Faza N — <sana> — <status>` keyin: **Fayllar**, **O'zgarish**, **Testlar**, **Gate**, **Qolgan qarz/DEFER**.

## Faza 1 — 2026-08-08 — **Phase-1: strukturaviy + unit-tasdiqlangan, browser-smoke YO'Q**

**Topilma tasdiqlanishi (o'z ko'zim bilan kodda).** `M-01` va `DUP-01` **HAR IKKALASI TASDIQLANDI** —
audit xato o'qimagan. Ettala servisda ham naqsh aynan bir xil edi:
holat tekshiruvi `$transaction` TASHQARISIDA (`transition()` ichidagi `findById` snapshotidan),
`$transaction(...)` da `isolationLevel` YO'Q (⇒ ReadCommitted), va yakuniy flip
`tx.<model>.update({ where: { id, accountId } })` — WHERE'da state sharti YO'Q.
Dalil (fix'dan oldingi qatorlar): payment-in `:630 / :634 / :668`, payment-out `:629 / :633 / :670`,
cash-in `:554 / :558 / :597`, cash-out `:461 / :465 / :503`, invoice-out `:1193 / :1199 / :1200`,
invoice-in `:1094 / :1100 / :1101`, counterparty-adjustment `:348 / :346 / :349`.

**Fayllar**

| Fayl | O'zgarish |
|---|---|
| `apps/api/src/modules/shared/transition-with-claim.ts` | **YANGI** — `transitionWithClaim()` primitivi + `MONEY_TX_OPTS` (`Serializable`, `timeout: 15000`) |
| `apps/api/src/modules/shared/transition-with-claim.test.ts` | **YANGI** — helper unit-testi (6 ta) |
| `apps/api/src/modules/shared/money-transition-race.test.ts` | **YANGI** — 7 servis × haqiqiy parallel poyga (30 ta test) |
| `apps/api/src/modules/shared/transition-toctou-class.test.ts` | Skaner **pul-oilasiga yoyildi** (+`MONEY_SERVICES` 7 ta + qamrov-lock) |
| `payment-in`, `payment-out`, `cash-in`, `cash-out`, `invoice-out`, `invoice-in`, `counterparty-adjustment` `.service.ts` | claim + Serializable + retry |
| `counterparty-adjustment.service.test.ts` | mock'ga `updateMany` (claim'ni hurmat qiladigan) qo'shildi — prod xulq o'zgarmagan |

**O'zgarish (har servisda bir xil, 3 qism)**
1. `transition()` endi `withSerializationRetry(async () => { const existing = await this.findById(…); … })` —
   `findById` **retry closure'i ICHIDA** qayta o'qiladi (move/enter pretsedenti): Serializable konfliktni
   eski snapshot bilan qayta urinish allaqachon post qilingan hujjatni IKKINCHI marta post qilardi.
2. Har `post/unpost/cancel` `$transaction` ichidagi **BIRINCHI amal** — `transitionWithClaim(tx.<model>, …)`
   (`updateMany WHERE {id, accountId, state:{in:fromStates}}` → `count===0` ⇒ `ConflictException` 409).
   `cancel` (va invoice-out'ning `unpost`i) **snapshot holatini** (`existing.state`) da'vo qiladi — raqib
   unpost allaqachon posted→draft qilgan bo'lsa ikki marta teskari qilinmaydi.
3. Har `$transaction`ga `MONEY_TX_OPTS` (`Serializable` + 15s).

**Rejadan chekinish (1 ta, ataylab).** Reja `transitionWithClaim(tx, model, {…})` (model = string) deb yozgan
edi; amalda **`transitionWithClaim(tx.<model>, {…})`** (delegat uzatiladi). Sabab: `tx['paymentIn']` kabi
indekslash Prisma delegat-tiplari birlashmasini «chaqirib bo'lmaydigan» qiladi (union call-signature) va
`as never` cast talab qilardi. Chaqiruv joyi baribir `tx.paymentIn` — manba-skaner model bo'yicha taniydi.

**Testlar (TDD tartibi kuzatildi)**
- RED-1: `transition-with-claim.test.ts` → modul yo'q (yiqildi) → helper yozildi → 6/6 yashil.
- RED-2: `money-transition-race.test.ts` → **24/30 yiqildi** (`applyDelta` 2 marta chaqirilgan — poyga JONLI
  ko'rsatildi) → 7 servis tuzatildi → **30/30 yashil**.
- Guard: `transition-toctou-class.test.ts` **71/71** (stock 6 + processing + money 7×5 + qamrov-lock).
- Poyga testi mock-asosli (bu repo'da servis testlari real DB'siz): `updateMany` WHERE-state filtrini
  atomik (yield qilmaydigan tana bilan) bajaradi = Postgres qator-qulfi semantikasi.

**Gate (to'liq, jonli o'lchangan)**
- `pnpm --filter @moysklad/api typecheck` → **0 xato**
- `pnpm lint:product` → **0 error** (728 warning — siyosat bo'yicha ruxsat)
- `pnpm --filter @moysklad/api exec vitest run` (BUTUN suite) → **377 fayl / 4985 test yashil, 0 yiqilgan**
- `pnpm --filter @moysklad/money test` → 92/92 yashil
- `i18n:gate` — **kerak emas** (UI-matn tegilmadi, faqat backend).

**Yo'l-yo'lakay topilgan, tuzatilgan (manba EMAS, artefakt).** Birinchi to'liq suite'da **38 test**
`percentScaled is not a function` bilan yiqildi — sababi `packages/money/dist/index.js` **eskirgan** edi
(`percentScaled` re-eksport qilinmagan). Bu Faza 1 bilan bog'liq EMAS, ma'lum bug-klass
(xotira: `money-dist-stale-tsbuildinfo`). `tsbuildinfo` o'chirilib `@moysklad/money` qayta build qilindi —
`dist/` git-ignored, hech qanday manba fayl o'zgarmadi.

**Qolgan qarz / DEFER**
- **Browser-smoke YO'Q.** Ikki parallel «Провести» real Postgres'da (Serializable → 40001/P2034 → retry →
  409) hech qachon jonli yugurtirilmadi. Bu Phase-2 QA cohort ishi.
- **`counterparty-adjustment.post` holat-mashinasi teginilmadi:** u `applicable` bo'yicha gate qiladi, shuning
  uchun `cancelled` (applicable=false) korrektirovkani post qilish HAMON mumkin. Bu poyga emas, FSM savoli —
  ataylab o'zgartirilmadi (test'da `postFromCancelledAllowed` bayrog'i bilan ochiq hujjatlangan).
- **`delete()` / `softDelete()` yo'llari bu fazada TEGILMADI.** Stock oilasida ular ham claim'lashtirilgan
  (`res.count === 0`); pul-oilasida `delete()` hali read-check-then-write. Poyga: parallel `post` + `delete`.
  Ta'siri kichikroq (faqat draft o'chiriladi), lekin **ochiq qarz** — alohida mayda faza qilishga arziydi.
- **Faza 5 (`loss.cancel`)** endi shu helperni ishlata oladi — reja aynan shuni tavsiya qilgan.
- **Faza 3 (`applyPayment` increment)** hali ochiq: bu faza hujjat holatini qulflaydi, lekin
  `payedSumMinor` absolute-set poygasi (M-09) TEGILMADI — u pozitsiya-hujjatlar tomonida.

**Commit:** `fix(money): Faza 1 — pul-hujjat oilasiga atomik state-claim + Serializable (M-01, DUP-01)`

---

## Faza 2 — 2026-08-08 — **Phase-1: strukturaviy + unit-tasdiqlangan, browser-smoke YO'Q**

**Topilma tasdiqlanishi (o'z ko'zim bilan kodda).** `M-02` **TASDIQLANDI**, audit to'g'ri o'qigan.
Fix'dan oldingi qatorlar: `money.service.ts:54` `// SELECT ... FOR UPDATE via unique id + update` —
**yolg'on komment**, ostidagi kod `findUnique({ where: { id } })` (Prisma'da bu HECH QANDAY qulf olmaydi);
`:70` va `:94` `const newBalance = row.balanceMinor + d.deltaMinor`; `:76-79` va `:100-103`
`update({ data: { balanceMinor: newBalance } })` — **absolyut set, increment EMAS**. Overdraft tekshiruvi
(`:71`, `:95`) ham o'sha qulfsiz o'qishdan hisoblangan qiymatga tayangan.

**Fayllar**

| Fayl | O'zgarish |
|---|---|
| `apps/api/src/modules/money/money-lost-update.test.ts` | **YANGI** — M-02 poyga-regressi (3 test) |
| `apps/api/src/modules/money/money.service.ts` | ikkala manba-turida `{ increment }` + read-after overdraft; 2 komment-yolg'on tuzatildi |
| `apps/api/src/modules/money/money.service.test.ts` | test-double halollashtirildi (`{increment}` semantikasi + Prisma kabi yangilangan qatorni QAYTARADI) — prod xulq da'volari o'zgarmadi |

**O'zgarish (ikkala tarmoqda ham bir xil, 3 qism)**
1. `findUnique` endi **faqat validatsiya** uchun (`select: { accountId, currency }`) — `balanceMinor` undan
   umuman o'qilmaydi. Tenant/valyuta/mavjudlik xatolari va ularning matnlari o'zgarmadi.
2. Balans **atomik increment** bilan siljiydi: `update({ data: { balanceMinor: { increment: d.deltaMinor } },
   select: { balanceMinor: true } })` — SQL'da `SET balance_minor = balance_minor + $d`, qator-qulfi
   tranzaksiya oxirigacha ushlanadi.
3. **Overdraft tekshiruvi increment'dan KEYIN** — Prisma qaytargan yangilangan qiymat `< 0n` bo'lsa
   `BadRequestException` (matn endi `delta X → balance Y`). Increment'ni chaqiruvchining `$transaction`'i
   qaytaradi (rollback).

**Rollback shartnomasi tekshirildi (da'vo emas, grep bilan).** `MoneyService.applyDeltas`ning **8 ta**
chaqiruv joyi bor va **hammasi** `$transaction` closure'i ichida: `cash-in.service.ts:577/658/736`,
`cash-out.service.ts:485/564/641`, `retail-sale.service.ts:787` (tx `:651`) va `:1132` (tx `:1020`).
Demak «increment qilib, keyin throw» hech qayerda yarim-yozuv qoldirmaydi.

**Testlar (TDD tartibi kuzatildi)**
- RED: `money-lost-update.test.ts` → **3/3 yiqildi**, aynan bug sababidan:
  (1) ikki parallel kirim 1000+500+500 → **1500** (kutilgan 2000, yo'qolgan yangilanish JONLI);
  (2) ikki parallel chiqim org-hisobda 10000−2500−2500 → **7500** (kutilgan 5000);
  (3) balans 100, ikki parallel −100 → **0 ta rad etish** (kutilgan 1) — overdraft-guard poyga bilan chetlanadi.
- GREEN: fix'dan keyin **3/3 yashil**; `money` moduli **21/21**.
- Test-double halolligi: `findUnique` **yield qiladi** va DETACHED snapshot qaytaradi (qulfsiz o'qish),
  `update` tanasi esa yield qilmaydi va yangilangan qatorni qaytaradi (qator-qulfi ostidagi atomik yozuv) —
  Faza 1 `money-transition-race.test.ts` bilan bir xil uslub (bu repo'da servis testlari real DB'siz).
- Eski `money.service.test.ts` double'i `update`dan `{}` qaytarardi va absolyut qiymatni yozib olardi —
  increment semantikasiga moslashtirildi (aks holda u testlar prod xatosidan emas, double eskirganidan yiqilardi).

**Gate (to'liq, jonli o'lchangan)**
- `pnpm --filter @moysklad/api typecheck` → **0 xato**
- `pnpm lint:product` → **0 error** (728 warning — siyosat bo'yicha ruxsat)
- `pnpm --filter @moysklad/api exec vitest run` (BUTUN suite) → **378 fayl / 4988 test yashil, 0 yiqilgan**
  (Faza 1 dagi 4985 + shu fazadagi 3 yangi)
- `i18n:gate` — **kerak emas** (UI-matn tegilmadi, faqat backend).

**Qolgan qarz / DEFER**
- **Browser-smoke YO'Q.** Ikki parallel POS-sotuv real Postgres'da yugurtirilmadi — Phase-2 QA cohort ishi.
  Poyga faqat unit-double bilan ko'rsatildi (lekin non-vakuum: fix'dan oldin 3/3 yiqilardi).
- **Serializable'ga o'tkazilmadi (ataylab, reja ruxsati bilan).** `cash-in/cash-out` allaqachon Faza 1 da
  Serializable; `retail-sale` ReadCommitted qoladi — increment + read-after ReadCommitted'da ham to'g'ri
  (ikkinchi yozuvchi qator-qulfida kutadi va o'z increment'idan keyingi haqiqiy qiymatni o'qiydi).
- **`getBalance` tegilmadi** — u materialized ustunni o'qiydi, poyga emas.
- **Ledger vs materialized invariant testi yo'q** (`Σ MoneyOperation.deltaMinor == balanceMinor` butun DB
  bo'yicha). Yangi testda bitta manba doirasida tekshiriladi; global invariant — Faza 9/10 (journal) ishi.
- **M-05/M-06 ochiq:** PaymentIn/Out hamon `MoneyService`ga tegmaydi, POS qarz-to'lovi kassaga yozilmaydi —
  **Faza 11** (u shu fazaga bog'liq edi, endi bloki ochildi).

**Commit:** `fix(money): faza 2 — applyDeltas atomik increment + read-after overdraft (M-02)`
