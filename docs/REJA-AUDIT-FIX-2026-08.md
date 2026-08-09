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
**☑ HISOBOT (2026-08-08):** BAJARILDI — batafsili «HISOBOT JURNALI → Faza 3» da.

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
**☑ HISOBOT (2026-08-08):** BAJARILDI — batafsili «HISOBOT JURNALI → Faza 4» da.

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
**☑ HISOBOT (2026-08-08):** BAJARILDI — batafsili «HISOBOT JURNALI → Faza 5» da.

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
**☑ HISOBOT (2026-08-08):** BAJARILDI — batafsili «HISOBOT JURNALI → Faza 6» da.

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
**☑ HISOBOT (2026-08-08):** BAJARILDI — batafsili «HISOBOT JURNALI → Faza 7» da.

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
**☑ HISOBOT (2026-08-08):** BAJARILDI — batafsili «HISOBOT JURNALI → Faza 8» da.

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
**☑ HISOBOT (2026-08-08):** BAJARILDI — batafsili «HISOBOT JURNALI → Faza 9» da. **Backfill: KERAK, lekin
hujjat-replay EMAS — «opening snapshot»** (sabab va retsept hisobotda; Faza 10 boshida hal qilinadi).

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
**☑ HISOBOT (2026-08-08):** BAJARILDI — batafsili «HISOBOT JURNALI → Faza 10» da. **Backfill skripti
yozildi, lekin `APPLY=1` bilan YUGURTIRILMAGAN** (ops-qadam, foydalanuvchi qaroriga qoldirildi);
`recompute` backfillsiz `APPLY=1` ni RAD ETADI (halokat-guard).

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
**☑ HISOBOT (2026-08-08):** BAJARILDI — batafsili «HISOBOT JURNALI → Faza 11» da. **Backfill YO'Q:
daftar bugundan boshlanadi** (eski bank to'lovlari `/money`da ko'rinmaydi).

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
**☑ HISOBOT (2026-08-08):** BAJARILDI — batafsili «HISOBOT JURNALI → Faza 12» da. **Faza 8 premise-guard'i
kutilganidek yiqildi** → `recompute` skriptining debt-issue manbasiga `deletedAt: null` qo'shildi
(ikkala tomon bitta testda qulflandi). **Tarixiy o'chirilgan qarzlar** saldoda hamon turibdi —
Faza 10 backfill/`recompute` ops-qadamiga qoldi.

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
**☑ HISOBOT (2026-08-08):** BAJARILDI — batafsili «HISOBOT JURNALI → Faza 13» da. **Balans
qayta-hisoblash: `recompute` KERAK EMAS (u jurnaldan yozadi, tarixiy `invoiceIn` deltalarini
o'chirmaydi), lekin TARIXIY IKKI-KARRA QARZ o'z-o'zidan yo'qolmaydi — korrektirovka qadami kerak
(hisobotda buyruqlar bilan).**

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
**☑ HISOBOT (2026-08-08):** BAJARILDI — batafsili «HISOBOT JURNALI → Faza 14» da.

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
**☑ HISOBOT (2026-08-08):** BAJARILDI — batafsili «HISOBOT JURNALI → Faza 16» da. **Backfill: lokal DB'da
0 qator (bo'sh o'tdi); prod (sherset_v2)da migratsiya deploy'da `debt_payments.exchange_rate`ni ×10⁴→×10⁸
o'tkazadi (idempotent guard bilan) — lekin sherset-v2 sxema-drift tufayli migratsiya oqimi tekshirilsin.**

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
**☑ HISOBOT (2026-08-09):** BAJARILDI — batafsili «HISOBOT JURNALI → Faza 17» da. **Diqqat:** tarixiy
kurs `pnl`+`cash-flow`da qo'llandi (mexanizm umumiy helperda tayyor); qolgan 8 davr-oqim hisoboti
DEFER, `aging`/`counterparty-balance` esa ataylab joriy kursda (ochiq-qoldiq revalyatsiyasi).

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
**◑ HISOBOT (2026-08-08): 18a BAJARILDI** (POS+Demand weighted-avg, FIFO bekor, legacy read-only) —
batafsili «HISOBOT JURNALI → Faza 18a» da. **18b (WorkOrder/PP-05) va 18c (Move oxirgi-birlik +
unpost-guard tozalash) QOLDI** — alohida sessiyalarda.

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
**☑ HISOBOT (2026-08-09):** BAJARILDI — batafsili «HISOBOT JURNALI → Faza 19» da. **Diqqat:** audit
keltirgan `115.23` misoli o'lchab ko'rilganda NOTO'G'RI chiqdi (`115.23*100 === 11523` aynan) — bug-klass
real, testlar `19.99`/`0.29`/`8.29` da yozildi. **Qarz:** PaymentIn `draft` bo'lib qoladi (post EMAS) ·
refund hujjati yo'q · bitta DB-tranzaksiya o'rniga atomik claim + retry (qoldiq oyna hujjatlangan) ·
prod'da `CREATE UNIQUE INDEX` dublikatlar bo'lsa yiqiladi (ataylab).

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
**☑ HISOBOT (2026-08-08):** BAJARILDI — batafsili «HISOBOT JURNALI → Faza 20» da. **Crash-oynasi
(create↔link) TO'LIQ yopilmadi** — sabab va yopish yo'li hisobotda.

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
**☑ HISOBOT (2026-08-09):** BAJARILDI — batafsili «HISOBOT JURNALI → Faza 21» da. Reja aytgan
`INT-13`ni ham yopdim (u fail-closed tekshiruv bilan JIM sozlama-yo'qolishidan TO'LIQ UZILISHGA
aylanardi). **🔴 DEPLOY-BLOKER:** tekshiruv fail-closed ⇒ prod'da `webhookSecret` sozlanmagan
akkauntda inbound Telegram (jumladan JONLI supply-approval tugmalari) deploydan keyin ISHLAMAY
QOLADI — `POST /telegram/config/webhook` qayta chaqirilishi SHART (secret avtomat generatsiya
qilinadi). Yangi `businessStatus.webhookSecretSet` shu holatni ko'rsatadi.

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
**☑ HISOBOT (2026-08-08):** BAJARILDI — batafsili «HISOBOT JURNALI → Faza 22» da. **FE media signed-URL —
DEFER** (query-token 5 allowlist marshrutida qoldi, pino-redakt qo'shildi); **prod deploy'dan OLDIN env'da
haqiqiy `JWT_SECRET`/`COOKIE_SECRET` borligini tekshir — endi yo'q bo'lsa API boot'da YIQILADI.**

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
**☑ HISOBOT (2026-08-09):** BAJARILDI — batafsili «HISOBOT JURNALI → Faza 23» da. Uchala topilma kodda
tasdiqlandi va yopildi; qo'shimcha **KPI-config + KPI-metrics** yo'llari ham gate ostiga olindi (oylikka
ta'sir qiladi). **Qolgan guard-siz: 61 handler / 23 controller** — jurnalda uch toifaga ajratilgan
(ataylab ochiq ∥ haqiqiy teshik ∥ HR-RBAC ostida). **Ikki parallel RBAC birlashtirilmadi** (HR-10 ildizi)
va **amaldagi 15-daqiqalik access-JWT offboarding'dan keyin ham tirik** — ikkalasi alohida fazaga.
**DIQQAT (ruxsat qattiqlashuvi):** `employees:full`siz menejer KPI konfiguratsiyasini saqlay olmaydi,
`settings` ruxsatisiz «Отделы» yaratib bo'lmaydi — deploy'dan keyin rol matritsasini tekshir.

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
**☑ HISOBOT (2026-08-09):** BAJARILDI — batafsili «HISOBOT JURNALI → Faza 24» da. Ikkala topilma kodda
tasdiqlandi va yopildi. **Xulq o'zgarishi YO'Q bo'lgan ikki joy (halol):** (a) mavjud PFX qatorlari
DB'da OCHIQ qoladi — faqat qayta yuklash shifrlaydi (o'qish yo'li ikkalasini ham qo'llab-quvvatlaydi,
WARN yozadi); (b) mavjud tokenlarning hammasi `scopes: []` ⇒ **to'liq kirish** (ataylab: jimgina
integratsiya sindirmaslik). **`/settings/api-tokens` UI MAVJUD EMAS** — scope faqat API orqali
beriladi; UI alohida ishga qoldi.

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
**☑ HISOBOT (2026-08-09):** BAJARILDI — batafsili «HISOBOT JURNALI → Faza 25» da. Beshala topilma
sxemada tasdiqlandi; 10 indeks (8 sxema + 2 expression) qo'shildi va lokal DB'ga qo'llandi.
**DIQQAT — reja taklif qilgan ifoda XATO edi:** `((uz_requisites->>'inn'))` Prisma emit qiladigan
`#>>ARRAY['inn']::text[]` ifodasiga MOS KELMAYDI (Postgres expression-indeksni parse-daraxt
tengligi bo'yicha tanlaydi) — indeks hech qachon ishlatilmasdi. To'g'ri ifoda + `gin_trgm_ops`
(so'rov `LIKE '%…%'`, btree yaramaydi) qo'llandi, EXPLAIN bilan RED→GREEN o'lchandi.
**Qolgan qarz:** barcode GIN `findFirst` (LIMIT 1) yo'lida planner tomonidan TANLANMAYDI (o'lchandi,
30k qatorda) — DB-04 ning haqiqiy yechimi unique/normalizatsiya, u data-migration talab qiladi.

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
**☑ HISOBOT (2026-08-09):** BAJARILDI — batafsili «HISOBOT JURNALI → Faza 26» da. Uchala topilma
kodda tasdiqlandi; 14 indeks + migratsiya qo'llandi, overdue items raw-SQL'ga, pul bloklari 30 s
TTL kesh + request-scope rate-context.
**DIQQAT — reja taklif qilgan yechim YETARLI EMAS edi:** faqat `updatedAt` indekslarini qo'shish
recentDocs so'rovini **sekinlashtirdi** (18 ms → 66 ms, indeks umuman ishlatilmadi) — Postgres tashqi
`LIMIT`ni `UNION ALL` shoxlariga tushirmaydi. Har legga o'z `ORDER BY … LIMIT 20` si qo'shilgach
`Merge Append` + `Index Scan` bo'lib **0.55 ms** ga tushdi (EXPLAIN ANALYZE bilan o'lchandi).
**Qolgan qarz:** overdue indekslari lokalda o'lchanmadi (jadval bo'sh); `recentDocs` `deleted_at`ni
filtrlamaydi (eski xulq, alohida topilma); `PERF-04` Faza 27'da.

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
**☑ HISOBOT (2026-08-09) — SUB-FAZAGA BO'LINDI:** hajm baholanib foydalanuvchi **27a** ni tanladi.
**27a BAJARILDI** (`PERF-10`,`PERF-04`,`DUP-14` — `report/stock-balance` + `report/counterparty-balance`);
batafsili «HISOBOT JURNALI → Faza 27a» da. Uchala topilma kodda tasdiqlandi; raw-SQL guruh-count jonli
`climart_adopt` DB'da rollback-tranzaksiyada mustaqil ground-truth bilan o'lchandi (14/14).
**◻ 27b — `PERF-01`** (`analitika/items.service.ts` DB-paginate + truncated). KUTMOQDA.
**◻ 27c — `PERF-02`** (akt-sverka davr-filtri + saldo-forward). KUTMOQDA. **Diqqat: audit dalili
ESKIRGAN** — «11 parallel findMany» Faza 10 da jurnalga ko'chirilgan; davr-mashinasi
(`foldJournalPeriod`) allaqachon yozilgan, akt-sverka uni ishlatmaydi xolos. Dalilni qayta o'qi.

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
**✅ HISOBOT (2026-08-09h, `94b05fa5`) — Phase-1: strukturaviy + unit, RUNTIME-TASDIQLANMAGAN:**
Yangi `apps/api/src/modules/shared/outbox-claim.ts` (siyosat) + `shared/cron-leader.ts` (lider-qo'riqchi).
Besh worker ham bir xil intizomga o'tdi: (1) **eksklyuziv claim** `pending|retry → 'sending'` + **ijara**
(`nextRetryAt = now+5daq`; `OUTBOX_CLAIM_LEASE_MS`). Reja `'processing'` deyardi — `'sending'` olindi, chunki
`webhook.schema.test.ts` aynan `'processing'` so'zini rad etishni qulflab qo'ygan. `$queryRaw FOR UPDATE SKIP
LOCKED` KERAK BO'LMADI: shartli `updateMany` ReadCommitted'da qator-qulfini oladi va raqib predikatni qayta
baholab `count=0` ko'radi (naqsh `transition-with-claim.ts` bilan bir xil, raw SQL'siz). (2) **sending-first** —
`attemptedAt`/'sending' provayder chaqiruvidan OLDIN yoziladi. (3) **reaper** — ijarasi tugagan `'sending'`
qatorlar navbatga qaytariladi, urinish +1 (crash-sikl abadiy bo'lmasligi uchun). (4) **dedup** — FAQAT
qayta-urinishda (birinchi urinishda emas, aks holda ataylab bir xil ikki xabar bo'g'ilardi): bir xil
kontragent+matn 24 soat ichida `sent` bo'lgan bo'lsa yuborilmaydi (`OUTBOX_DEDUP_WINDOW_MS`). Webhook uchun
esa `Idempotency-Key: <delivery id>` sarlavhasi — u yerda at-least-once shartnomasi ATAYLAB saqlandi.
(5) `isCronLeader()` — pm2 cluster'da faqat `NODE_APP_INSTANCE=0`; `ecosystem.config.cjs` da `instances: 1`
sababi yozildi (`pm_id` ISHLATILMAYDI — u pm2-global, api `pm_id=1` bo'lishi mumkin). (6) Uchib turgan qatorni
qo'lda qayta navbatga qo'yish bloklandi (webhook 409 / sms+email 400).
**Status lug'ati:** `'sending'` → 4 Zod filtr-enum, `HR_MESSAGE_STATUSES`, prisma doc-kommentlari, FE (2 sahifa
union+filtr-chip, tone→`info`, ru/uz `status_sending` × 4 namespace). **Migratsiya SHART EMAS** (`VarChar(20)`).
**Testlar:** 3 yangi delivery test-fayli + HR worker testiga 7 yangi holat + `outbox-claim`/`cron-leader` unit +
**class-lock** `shared/outbox-claim-class.test.ts` (yangi outbox-worker claim'siz kirsa yiqiladi, registry
to'liqligi ham tekshiriladi). Asosiy stsenariy har workerda: **ikki parallel instansiya bitta qatorga → AYNAN
BITTA yuborish** (fake store `updateMany`ni atomik predikat+yozuv sifatida modellaydi).
**Gate:** typecheck 9/9 · `lint:product` 0 error · i18n gate · api Vitest (shared/webhook/sms/email/telegram/hr)
133 fayl / 1553 test · `app-boot` DI · web `domain-status-tone` drift-lock 75.
**QOLGAN XAVF (halol):** «provayder qabul qildi → process o'ldi → ijara tugadi → qayta yuborildi» dublikati
to'liq YOPILMADI — provayder idempotentlik kaliti kerak (MTProto `random_id` adapter shartnomasini
o'zgartiradi ⇒ bu fazada qilinmadi; Eskiz'da bunday kafolat yo'q). Jonli tekshiruv (bir necha tick,
`'sending'` qatorlar ilib qolmasligi) DEPLOY'dan keyin.

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

**✅ HISOBOT — 29a (2026-08-09i, `881ebcc7`) — Phase-1: strukturaviy + unit, RUNTIME-TASDIQLANMAGAN:**
Reja «og'ir bo'lsa sub-faza» degani uchun **29a / 29b** ga bo'lindi. 29a = kod-only beshta to'g'rilik
nuqsoni (migratsiyasiz); 29b = soft-delete + auditLog (Prisma migratsiya kerak — umumiy resurs, §6.4).

| # | Topilma | Ildiz sabab (o'zim ground-truth qildim) | Yechim |
|---|---|---|---|
| HR-1 | fiks oylik prod'da **doim 0** | Xodim kartochkasi (`hr-employee.service` create/update) `Employee.salaryMinor` **USTUNIGA** yozadi; dvigatel esa `salaryConfig` **JSON**'idan o'qirdi. JSON'ning yagona yozuvchisi — `apps/api/scripts/verify-payroll-kpi-smoke.ts` (bir martalik smoke). | `resolveFixComponentMinor({salaryConfig, salaryMinor})`: JSON override ustun turadi (**ataylab 0 ham** aniq qiymat — «fiks yo'q»), buzuq/manfiy = «sozlanmagan» ⇒ ustunga qaytadi. `findFirst` `select`iga `salaryMinor` qo'shildi. |
| HR-2 | GPS check-in kechikishi noto'g'ri | `ingest()` KELDI yo'li ham, `manualCheckIn()` ham `employeeWorkSchedule.findUnique` (hafta-kuni) dan `computeLateMinutes` chaqirardi. Nomli **siklik/erkin** `HrSchedule` biriktirilgan xodimda bu jadval mos emas ⇒ kechikish va undan kelib chiqqan **avto-jarima** xato. | Ikkala yo'l `resolveShift` + `lateMinutesForShift` ga o'tdi (`hr-attendance.checkIn` bilan **bir xil** manba, §5.1). Xodim + smenasi bitta `findFirst` da (`CHECKIN_EMPLOYEE_SELECT`) — qo'shimcha so'rov yo'q. |
| HR-3 | tuzatilgan davomat ↔ jarima **desink** | `edit()` `lateMinutes`ni qayta hisoblamas edi; `applyIfLate` esa faqat `create` qiladi va `@@unique(attendanceId, source)` tufayli qayta chaqirilganda eski summani jimgina qoldiradi. | `edit()` kelish vaqti berilganda kechikishni qayta hisoblaydi (`recomputeLateMinutes`, `checkIn` bilan umumiy) + yangi `LateFineService.syncForAttendance` — 0 bo'lsa **storno** (`deleteMany`), aks holda **upsert**. Sinxron faqat kechikish **haqiqatan** o'zgarganda (izoh tahriri jarima yaratib yubormasin). |
| HR-7/8 (a) | bonus/jarima oyi 5 soat surilgan | `monthBounds` UTC yarim tun beradi, `HrBonusFineLog.createdAt` esa **haqiqiy instant** ⇒ 1-avgust 00:00–05:00 dagi jarima **iyulga** tushardi. | Yangi `monthInstantBounds(yearMonth, tz=HR_TZ)` — Toshkent yarim tuni. |
| HR-7/8 (b) | kunlik maqsad oyning 1-kunida noto'g'ri | `daysInMonthOf(dayStart)` — `dayStart` mahalliy yarim tunning UTC instanti (Toshkentda oldingi kun 19:00), UTC maydonlari **o'tgan oyni** beradi ⇒ 1-mart uchun 31 emas, **28** ga bo'linardi. | `daysInMonthOf(dateOnly)` — yorliqdan (`localDateOnly`). |

**⚠️ Rejaning (d) bandi ATAYLAB to'liq bajarilmadi — u qo'llanilsa YANGI bug tug'ilardi.**
Reja «`monthBounds`/`daysInMonthOf`ni Tashkent-tz bilan» deydi. Tekshirdim: `monthBounds` yana
`EmployeeDailyKpi.date` so'rovida ishlatiladi, u esa `localDateOnly` **YORLIG'I** (UTC yarim tun,
`manager/kpi/employee-daily-kpi.service.ts:45`) — instant emas. Uni Toshkentga surish oyning
**1-kunini tashlab**, o'tgan oyning oxirgi kunini **qo'shib** yuborardi. Shuning uchun chegara
**ikkiga ajratildi**: `monthBounds` = yorliq (o'zgarmadi, izoh bilan qulflandi) ·
`monthInstantBounds` = instant (yangi). Ikkalasiga ham regressiya testi bor.

**Testlar (TDD, hammasi avval RED ko'rildi):** `payroll-formula.util` +11 · `hr-payroll.service` +5
(+1 mavjud test **tuzatildi** — u eski UTC oynasini, ya'ni aynan HR-7/8 bug'ini qulflab qo'ygan edi) ·
`ping-ingest.service` +6 · `late-fine.service` +5 · `hr-attendance.service` +7 · `hr-kpi.service` +5.
Reja so'ragan 5 stsenariyning 4 tasi qoplandi (5-si — soft-delete — 29b da).

**Gate:** typecheck **9/9** · api `hr/` + `manager/` **101 fayl / 1082 test** yashil · `app-boot` DI **9** ·
`hr/` qayta yugurtirildi (87 fayl / 841) · biome: shu **14 faylda 0 xato**.

**Parallel sessiya sharoiti (§6):** commit paytida daraxtda ikkinchi sessiyaning faol ishi bor edi
(`customer-order`, `demand`, `inventory`, `move`, `product`, `stock`, `web/pos`, `schema.prisma` +
yangi migratsiya). `git add` faqat **14 aniq yo'l** bilan qilindi; ularning fayllariga tegilmadi.
`pnpm lint:product` daraxt bo'yicha **9 xato** ko'rsatadi — hammasi o'sha uchib turgan fayllarda,
ATAYLAB tuzatilmadi. `lint-staged` commit'ga **15-fayl** (`docs/progress.json`) qo'shdi — o'zgarish
faqat hook'ning o'z `generatedAt` tamg'asi, hech kimning ishi emas ⇒ `reset --soft` bilan tarix
QAYTA YOZILMADI (umumiy checkout'da HEAD'ni surish §6.7 A xavfi shu zarardan katta). §6.7 B
hodisasining ikkinchi takrori.

**◻ 29b (KEYINGI SESSIYA) — `HR-13` soft-delete + audit:**
1. `HrAttendance` da **soft-delete ustuni YO'Q** (sxema tekshirildi, 9300–9328) ⇒ Prisma migratsiya
   kerak (`deletedAt`/`deletedById`). Lokal DB uchun retsept: xotira `climart-adopt-local-db-untracked.md`
   («2026-08-08 — ENG SODDA ISHLAYDIGAN YO'L»). Migratsiya = umumiy resurs (§6.4), yolg'iz sessiyada.
2. `delete()` hozir **hard-delete, auditsiz**. Soft-delete'dan keyin barcha o'quvchilarga
   (`listToday`, `report`, `aggregateEmployeeDay`, davomat dashboard/eksport) `deletedAt: null`
   filtri qo'shilishi shart — aks holda o'chirilgan qator hisobotda qolaveradi.
3. **Yetim jarima:** `HrBonusFineLog.attendanceId` — xom FK (relation/cascade YO'Q, 9463-qator).
   Hard-delete `auto_late` jarimani osilgan holda qoldiradi. `delete()` ham
   `syncForAttendance`/storno chaqirishi kerak (mexanizm 29a da tayyor).

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
**☑ HISOBOT:** 2026-08-09 — HISOBOT JURNALI → «Faza 30». `FE-02` ning crash qismi allaqachon yopiq edi
(qoldiq: kasr-qty kirita bo'lmasligi) · `parse-amount.ts` + 4 dialog + `currency` prop · retail cart-math.

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
**☑ HISOBOT:** 2026-08-09 — HISOBOT JURNALI → «Faza 31» (`105897b3`, −648 qator). 13× `computeLineTotal` +
24× `YesNoSelect` + 3× `MultiRefField`/`refFetcher` yig'ildi; 4 transport bitta `authedFetch` ga.
**Haqiqiy bug:** `download()` da 401-retry umuman yo'q edi (XLSX eksporti token tugagach otilardi).
Reja «24× MultiRefField/refFetcher» deb qo'shib yuborgan — aslida dedup qilinadigani 3+3, qolgan 4 tasi
boshqa shaklda (ataylab tegilmadi).

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
**☑ HISOBOT:** 2026-08-09 — HISOBOT JURNALI → «Faza 32» (`a54fedd7`). `FE-07` refresh 401/403 →
seans tozalanadi (tarmoq/5xx ATAYLAB emas). `FE-08` 150 kalit × 2 til (`pages.sotuv` +91,
yangi `pages.pos` +59). Yangi `pos-i18n-guard.test.ts` ikki gate teshigini yopdi
(key-existence `components/**` ni ko'rmasdi; no-hardcoded `/sotuv` ni qamramasdi) —
HEAD'da 88 sizish o'lchandi, hozir 0.

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
**✅ HISOBOT (2026-08-09) — Phase-1: strukturaviy + unit-tasdiqlangan, browser-smoke YO'Q:**
`packages/contracts` (source-only, `dist` yo'q) + **provenance reyestri** — har sxema kalitlari
serverdagi manbaga (Prisma modeli / `select` bloki / qo'lda yig'ilgan javob / apps/api Zod-sxemasi)
bog'lanadi, `apps/api` konformans testi uzilishni tutadi. 5 endpoint; `retail/page.tsx` migratsiya
qilindi. Batafsili «HISOBOT JURNALI → Faza 33» da.
**DIQQAT — rejaning ikki premisasi noto'g'ri chiqdi:** (1) audit `FE-12` ta'sirini **teskari**
yozgan — ground-truth bo'yicha `cashDesk`/`store`/`organization` **NOT NULL**, ya'ni `retail` haq
edi, `sotuv` emas; (2) «apps/api Zod-sxemalaridan `z.infer`» — API'da **javob** Zod-sxemalari
deyarli yo'q (butun repoda 1 fayl), Zod faqat kirish validatsiyasi uchun. Shu sababli kontraktlar
yangidan yozilib, **provenance** orqali serverga bog'landi.
**Parallel sessiya:** `sotuv/page.tsx` (Faza 32 jonli edi) ATAYLAB tegilmadi — qarz web
qo'riqchisining `PENDING_MIGRATION` ro'yxatida mashina tomonidan kuzatiladi.

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
**✅ HISOBOT (2026-08-09) — Phase-1: strukturaviy + unit-tasdiqlangan, browser-smoke YO'Q:**
To'rtala topilma kodda TASDIQLANDI (`STK-05` audit «confirmed» degani to'g'ri chiqdi; qolgan uchta
«unverified» ham dalil-qatorlarida aynan turibdi). Batafsili «HISOBOT JURNALI → Faza 34» da.
**DIQQAT — reja taklif qilgan yechim STK-08 uchun YETARLI EMAS edi:** «to'liq ko'chirishda
costDelta = −costBalanceMinor» qoidasi *unpost/cancel*ni buzardi — ular bazadagi per-birlik
`costMinor` snapshot'idan `perUnit × qty` bilan qayta hisoblaydi, ya'ni post ≠ reversal bo'lib
qolardi. Shu sababli **migratsiya qo'shildi** (`MovePosition.base_cost_minor`, nullable) — aniq
satr-qiymati saqlanadi, eski qatorlar NULL bo'lib eski formulaga tushadi (bit-ma-bit teskarilik).
**Qo'shimcha topildi:** `product-cell-move.service.ts:39` da AYNAN shu float naqsh bor edi (audit
ko'rmagan) — u ham bir xil helper'ga o'tkazildi.

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

---

## Faza 3 — 2026-08-08 — **Phase-1: strukturaviy + unit-tasdiqlangan, browser-smoke YO'Q**

**Topilma tasdiqlanishi (o'z ko'zim bilan kodda).** `M-09` **TASDIQLANDI va audit aytganidan KENGROQ** —
reja «4 servis» degan edi, to'rttasida ham naqsh aynan bir xil ekani qatorma-qator tekshirildi.
Fix'dan oldingi qatorlar: invoice-out `:1119` `findFirst` (qulfsiz) → `:1132` `const newPayed =
invoice.payedSumMinor + amountMinor * sign` → `:1151-1157` `update({ data: { payedSumMinor: newPayed } })`;
invoice-in `:1025 / :1038 / :1053`; customer-order `:2068 / :2077 / :2112-2120`;
purchase-order `:1327 / :1343 / :1371-1379`. Hammasi **absolyut set**, WHERE'da hech qanday shart yo'q.

**Chaqiruv-joyi shartnomasi tekshirildi (da'vo emas, grep + qator-tartibi bilan).** `applyPayment`ning
**20 ta** chaqiruv joyi bor: **18 tashqi** (`cash-in` ×3 `:603/683/758`, `cash-out` ×3 `:510/588/663`,
`payment-in` ×6 `:668/677/757/766/829/838`, `payment-out` ×6 `:666/676/745/754/817/826`) — har biri o'z
faylidagi `$transaction` closure'i ICHIDA (qator-tartibi bilan tasdiqlandi) — va **2 kaskad**
(`invoice-out`→CO `:1199`, `invoice-in`→PO `:1096`), ular qabul qilgan `tx`ni uzatadi. Demak «increment
qilib, keyin throw» hech qayerda yarim-yozuv qoldirmaydi — rollback kafolatlangan (Faza 2 dagi shartnoma).

**Fayllar**

| Fayl | O'zgarish |
|---|---|
| `apps/api/src/modules/shared/apply-payment-race.test.ts` | **YANGI** — 4 servis × poyga/chegaraviy holat regressi (17 test) |
| `invoice-out/invoice-out.service.ts` | `applyPayment`: `{ increment }` + read-after; holat-guard va audit endi qulflangan qatordan |
| `invoice-in/invoice-in.service.ts` | shu naqsh |
| `customer-order/customer-order.service.ts` | shu naqsh (yonidagi `applyInvoiced` allaqachon increment edi — endi izchil) |
| `purchase-order/purchase-order.service.ts` | shu naqsh |

**O'zgarish (to'rttasida ham bir xil, 3 qism)**
1. `findFirst` endi **faqat mavjudlik** uchun (`select: { id: true }`, `deletedAt: null`) —
   `payedSumMinor`/`state` undan **umuman o'qilmaydi**. `NotFoundException` matni o'zgarmadi.
2. `payedSumMinor` **atomik increment** bilan siljiydi:
   `update({ data: { payedSumMinor: { increment: amountMinor * sign } }, select: {…} })` — SQL'da
   `SET payed_sum_minor = payed_sum_minor + $d`, qator-qulfi tranzaksiya oxirigacha ushlanadi.
3. **Har qaror increment QAYTARGAN qatordan** hisoblanadi: holat-guard (`applicableStates`), manfiylik
   tekshiruvi, `newState` (`paid`/`partially_paid`/`closed`…) va audit'ning `before` qiymati
   (`newPayed − amountMinor*sign`). Holat o'zgarsa **ikkinchi** `update({ data: { state } })` yoziladi;
   o'zgarmasa — umuman yozilmaydi (ilgari har chaqiruvda `state` qayta yozilardi).

**Nima uchun guard endi increment'dan KEYIN (ataylab, xulq o'zgarishi).** Ilgari `applicableStates`
qulfsiz pre-read'dan tekshirilardi — bu TOCTOU: raqib tranzaksiya hujjatni `cancelled` qilib commit qilsa,
pre-read eski holatni ko'rib to'lovni o'tkazib yuborardi. Endi tekshiruv increment qaytargan (qator-qulfi
ostidagi, raqibning commit'ini ko'rgan) holatga qo'yilgan; rad etilsa `throw` → chaqiruvchining
`$transaction`'i increment'ni qaytaradi. Xato matni va turi (`BadRequestException`) o'zgarmadi.

**Testlar (TDD tartibi kuzatildi)**
- RED: `apply-payment-race.test.ts` → **8/17 yiqildi**, aynan bug sababidan (har 4 servisda 2 tadan):
  (1) ikki parallel 400 000 to'lov → `payedSumMinor` **400 000** (kutilgan 800 000 — bitta to'lov JONLI
  yo'qoldi); (2) 100 000 to'langan hujjatga ikki parallel 100 000 revert → **0 ta rad etish**
  (kutilgan 1) — ikkalasi ham 0 hisoblab, bittasi jimgina yutildi.
- GREEN: fix'dan keyin **17/17 yashil**.
- Qolgan 9 test — regress-qulfi (fix'dan oldin ham yashil edi): ketma-ket to'lovlar `partially_paid`→`paid`/
  `closed`ga o'tishi, nolgacha revert boshlang'ich holatni tiklashi, `cancelled` invoice-out'ga to'lov rad etilishi.
- **Bir test-da'vosi noto'g'ri chiqdi (mening xatoyim, kod emas):** `CustomerOrder` uchun qisman to'lovdan
  keyin `partially_paid` kutgandim — `OrderStateSchema`da bunday a'zo YO'Q (`customer-order.schema.ts:11-20`),
  CO/PO to'liq to'langunicha holatini ataylab o'zgartirmaydi. Test-jadvaliga `partialState` ustuni qo'shildi.
- Test-double halolligi: `findFirst` **yield qiladi** va DETACHED snapshot qaytaradi (qulfsiz o'qish),
  `update` tanasi yield qilmaydi va yangilangan qatorni qaytaradi (qator-qulfi ostidagi atomik yozuv) —
  Faza 1/2 bilan bir xil uslub (bu repo'da servis testlari real DB'siz).

**Gate (to'liq, jonli o'lchangan)**
- `pnpm --filter @moysklad/api typecheck` → **0 xato**
- `pnpm lint:product` → **0 error** (728 warning — siyosat bo'yicha ruxsat)
- `pnpm --filter @moysklad/api exec vitest run` (BUTUN suite) → **379 fayl / 5005 test yashil, 0 yiqilgan**
  (1 fayl / 2 test skipped — oldindan shunday)
- Fazaga tegishli modullar alohida: invoice-out/in, customer-order, purchase-order, payment-in/out,
  cash-in/out, shared → **31 fayl / 679 test yashil**
- `i18n:gate` — **kerak emas** (UI-matn tegilmadi, faqat backend).

**Qolgan qarz / DEFER**
- **Browser-smoke YO'Q.** Ikki parallel to'lov real Postgres'da yugurtirilmadi — Phase-2 QA cohort ishi.
  Poyga faqat unit-double bilan ko'rsatildi (lekin non-vakuum: fix'dan oldin 8/17 yiqilardi).
- **`deletedAt: null` hamon TOCTOU.** Mavjudlik pre-read'i bilan increment orasida hujjat soft-delete
  qilinsa, increment baribir yoziladi. Yopish yo'li: `deletedAt: null`ni `update` WHERE'iga qo'yib
  Prisma `P2025`ni tutish — lekin bu xato-shaklini o'zgartiradi (500 vs 404), M-09 doirasidan tashqarida.
  **Ochiq qarz**, alohida mayda faza.
- **Holat o'zgarishi hamon «oxirgi yozuvchi yutadi».** `payedSumMinor` endi atomik, ammo `state` alohida
  `update` bilan yoziladi. Real Postgres'da poyga yo'q (qator-qulfi commit'gacha ushlanadi ⇒ ikkinchi
  chaqiruv birinchisining commit'idan keyin ishlaydi), lekin bu **qulf semantikasiga tayanadi**, WHERE
  shartiga emas. Faza 1 helperi (`transitionWithClaim`) bu yerda ishlatilmadi — `applyPayment`da
  «kutilgan boshlang'ich holat» tushunchasi yo'q (u ko'p holatdan chaqiriladi).
- **`sumMinor` o'zgarishi bilan poyga tekshirilmadi:** to'lov ketayotganda hujjat pozitsiyalari tahrirlanib
  `sumMinor` o'zgarsa `paid` chegarasi eskirishi mumkin. Bu boshqa bug-klass (hujjat-tahrir FSM'i) — Faza 14
  yaqinroq.
- **Faza 4 (`pos-debt-payment` FIFO)** — hamon ochiq, `M-10`+`DUP-07` bu fazada TEGILMADI.

**Commit:** `fix(money): faza 3 — applyPayment payedSumMinor atomik increment (M-09)`

---

## Faza 4 — 2026-08-08 — **Phase-1: strukturaviy + unit-tasdiqlangan, browser-smoke YO'Q**

**Topilma tasdiqlanishi (o'z ko'zim bilan kodda).** Ikkalasi ham **TASDIQLANDI**, fix'dan oldingi qatorlar:
- `M-10`: `pos-debt-payment.service.ts:80` `const rows = await this.loadOpenDebts(…)` — `$transaction`
  (`:101`) dan **oldin**; `:85` `allocateFifo(rows…)` ham tashqarida. Ichkarida `:123-130`
  `const paid = debt.paidMinor + alloc.amountMinor` → `tx.debt.update({ data: { paidMinor: paid, … } })` —
  ya'ni **tx tashqarisidagi eski o'qishdan hisoblangan absolyut qiymat**.
- `DUP-07`: o'sha `:124-130` `update`da `closedAt` **umuman yo'q**, `nextContactAt` tozalanmaydi, `paidMinor`
  to'lovlardan qayta o'qilmaydi; `loadOpenDebts` (`:243-260`) WHERE'ida `deletedAt: null` **yo'q**.
  Kanonik yo'l — `debt.service.ts:191-233` `recalc` (aggregate → `paidMinor`, `closedAt`, balans deltasi).
- **Bitta atama aniqligi:** DUP-07 sarlavhasi «paidMinor increment» deydi; aslida u SQL-increment EMAS,
  **eski o'qishga asoslangan absolyut set** edi (topilma matnining `ev:` qismi buni to'g'ri keltirgan).
  Farqi muhim: SQL-increment poygada yo'qolmasdi, absolyut set esa yo'qotadi.

**Fayllar**

| Fayl | O'zgarish |
|---|---|
| `apps/api/src/modules/debt/debt-recalc.ts` | **YANGI** — `recalcDebt()` + `deriveDebtStatus()`: qarz denormalizatsiyasining YAGONA kanonik yo'li |
| `apps/api/src/modules/debt/pos-debt-payment.service.test.ts` | **YANGI** — 8 test (poyga · closedAt · soft-delete) |
| `apps/api/src/modules/debt/pos-debt-payment.service.ts` | FIFO tx ichiga + `lockOpenDebts` (`FOR UPDATE`) + `recalcDebt` reuse + `deletedAt: null` |
| `apps/api/src/modules/debt/debt.service.ts` | `recalc`/`deriveStatus` endi `debt-recalc.ts` ga delegatsiya (tanasi ko'chirildi, mantiq o'zgarmadi) |

**O'zgarish (5 qism)**
1. **FIFO reja tranzaksiya ICHIDA**, qulflangan qatorlardan: yangi `lockOpenDebts(tx,…)` —
   `SELECT id FROM debts WHERE account_id=$1::uuid AND counterparty_id=$2::uuid AND deleted_at IS NULL
   AND status NOT IN ('paid','cancelled') ORDER BY created_at ASC, id ASC FOR UPDATE`, keyin o'sha id'lar
   bo'yicha `findMany` (qulf ostidagi yangi qiymatlar). Naqsh — `stock.lockBalances` (`$queryRaw`, chunki
   Prisma'da qator-qulfi yo'q). `ORDER BY created_at, id` = FIFO tartibining o'zi ⇒ deadlock'ga qarshi
   barqaror qulflash tartibi. Qulf olingandan keyin Postgres WHERE'ni qayta baholaydi (EvalPlanQual) —
   raqib tranzaksiya qarzni yopib ulgurgan bo'lsa u qator to'plamdan **tushadi**.
2. **`paidMinor` endi absolyut set emas:** har allokatsiyadan keyin `recalcDebt(tx, balances, {…})` —
   `paidMinor = Σ jonli (reversedAt: null) to'lovlar`, `status` = hosila, `closedAt` yoziladi, yopilganda
   `nextContactAt` `null`ga tushadi (§3.6). Ya'ni `DUP-07` ning uchala oqibati ham yopildi.
3. **Balans daftari:** POS'ning alohida `applyDelta(−plan.appliedMinor)` chaqiruvi **olib tashlandi** —
   endi delta `recalcDebt` ichida har qarz uchun `paid_yangi − paid_eski` sifatida yoziladi. Yig'indi aynan
   o'sha (`appliedMinor`), `meta` esa saqlanadi: `{ docType: 'debtpayment', docId: batchId }` — buxgalter
   jurnaldan **chekka** boradi (ixtiyoriy qarz qatoriga emas). **Xulq farqi:** bitta batch endi N ta
   `COUNTERPARTY_BALANCE_CHANGED` hodisasi chiqaradi (avval 1 ta), `docId` hammasida bir xil `batchId`.
   Hodisa iste'molchisi `source` bo'yicha filtrlaydi, POS `source` uzatmaydi ⇒ no-op (tekshirildi).
4. **Valyuta (kichik, lekin haqiqiy tuzatish):** balans deltasi endi **qarzning** valyutasida yoziladi
   (`recalcDebt` `debt.currency`ni oladi), avval **to'lovning** valyutasida yozilardi. UZS qarzga USD naqd
   qabul qilinsa (`input.currency='USD'`) avvalgi kod balansni **USD kesimida** kamaytirardi — qarz esa UZS.
   Schema shartnomasi ham shunday: `DebtPayment.amountMinor` HAR DOIM qarz valyutasida.
5. **Chekdagi «yopildi» belgisi** endi REJAdan emas, `recalc` qaytargan HAQIQIY holatdan
   (`updated.status === 'paid'`) olinadi.

**Testlar (TDD tartibi kuzatildi)**
- RED (fix'dan oldin): **6/8 yiqildi** — (1) ikki parallel 50 000 to'lov → `paidMinor` **50 000**
  (kutilgan 100 000; `DebtPayment` qatorlari esa 100 000 — daftar uzilgan); (2) 100 000 lik qarzga ikki
  parallel 100 000 to'lov → **0 ta rad** (kutilgan 1), ya'ni 200 000 allokatsiya; (3) to'liq to'lovda
  `closedAt: null`; (4) `nextContactAt` tozalanmagan; (5,6) soft-delete qilingan **eskiroq** qarz FIFO'ni
  yeb ketardi va `summary()`da ham ko'rinardi.
- GREEN: **8/8 yashil**.
- Test-double halolligi (Faza 1–3 uslubi, bu repo'da servis testlari real DB'siz): `$queryRaw` = qulf oladi,
  band bo'lsa **kutadi**, qulfdan keyin WHERE'ni **qayta baholaydi**; `findMany`/`aggregate` = qulfsiz o'qish
  (`await` bilan yield qiladi ⇒ ikki chaqiruvchi haqiqatan interleave bo'ladi); `update`/`create` = birinchi
  `await`gacha sinxron ⇒ qulflangan qator yozuvi kabi atomik; `$transaction` tugaganda qulflar bo'shaydi.
  Cheklov ochiq yozilgan: qulf **kontragent** kesimida modellanadi (real `FOR UPDATE` — qator kesimida);
  hech bir test yo'li «yozib bo'lib keyin throw» qilmagani uchun double rollback modellamaydi.

**Gate (to'liq, jonli o'lchangan)**
- `pnpm --filter @moysklad/api typecheck` → **0 xato**
- `pnpm lint:product` → **0 error** (728 warning — siyosat bo'yicha ruxsat)
- `pnpm --filter @moysklad/api exec vitest run` (BUTUN suite) → **380 fayl / 5013 test yashil, 0 yiqilgan**
  (1 fayl / 2 test skipped — oldindan shunday)
- Fazaga tegishli modullar alohida: `debt`, `counterparty-balance`, `counterparty-settlement` →
  **11 fayl / 158 test yashil**
- `i18n:gate` — **kerak emas** (UI-matn tegilmadi, faqat backend).

**Qolgan qarz / DEFER**
- **Browser-smoke YO'Q va raw SQL real Postgres'da YUGURTIRILMADI.** `FOR UPDATE` so'rovi faqat
  `schema.prisma` `@map`lari bo'yicha tekshirildi (jadval `debts`; ustunlar `account_id`,
  `counterparty_id`, `deleted_at`, `status`, `created_at`) — sintaksis/qulf xulqi Phase-2 QA'da (yoki
  `pnpm dev` + ikki parallel POS to'lovi bilan) tasdiqlanishi kerak. **Bu fazadagi eng katta qoldiq risk.**
- **Izolyatsiya ReadCommitted qoldi (ataylab, reja ruxsati bilan):** `FOR UPDATE` bu yo'l uchun yetarli —
  Serializable + retry qo'shilmadi (40001 qayta-urinishlarini POS yo'liga olib kirmaslik uchun).
- **Qulfdan KEYIN yaratilgan qarz rejaga kirmaydi** — bu to'g'ri xulq (o'qish paytida mavjud bo'lmagan
  qarzga pul tushmasligi kerak), lekin natijada «ortiqcha to'lov» xatosi chiqishi mumkin. Kassir summani
  qayta kiritadi; jimgina noto'g'ri allokatsiyadan xavfsizroq.
- **Aralash valyutali FIFO hamon qamralmagan:** `allocateFifo` turli valyutali qarzlarni bitta rejaga
  qo'shadi, `DebtPayment.currency` esa bitta. Bu **oldindan mavjud** kamchilik (bu faza doirasidan
  tashqarida); endi hech bo'lmasa balans daftari har qarzning o'z valyutasida yuritiladi (4-band).
- **Har allokatsiyaga +2 so'rov** (`aggregate` + `findFirstOrThrow`) — POS batch'i odatda 1–3 qarz, jonli
  o'lchov qilinmadi.
- **`M-05` OCHIQ:** POS qarz-to'lovi naqdi hamon `CashDesk` ledgeriga yozilmaydi — **Faza 11** ishi
  (bu faza faqat qarz-reyestr tomonini yopdi, reja shunday aytgan edi).
- **`summary()`/`receipt()` qulfsiz o'qiydi** — ular faqat ko'rsatish uchun, pul yozmaydi (ataylab).

**Commit:** `fix(debt): faza 4 — POS qarz-to'lovi tx-ichi FIFO + recalc reuse (M-10, DUP-07)`

---

## Faza 5 — 2026-08-08 — **Phase-1: strukturaviy + unit-tasdiqlangan, browser-smoke YO'Q**

**Topilma tasdiqlanishi (o'z ko'zim bilan kodda).** `STK-01` **TASDIQLANDI** — va aslida topilma
aytganidan **bitta kengroq**:
- `cancel()` (fix'dan oldin `loss.service.ts:809`): `return this.prisma.client.$transaction(async (tx) => {…})`
  — **ikkinchi argument umuman yo'q**, ya'ni default ReadCommitted; ichida birinchi amal `applyDeltas(+qty)`,
  holat esa oxirida `tx.loss.update({ where: { id, accountId }, … })` bilan **shartsiz** flip qilinardi.
  Holat `existing.state` orqali `transition()` → `findById` dan, ya'ni **tranzaksiya tashqarisidan** kelardi.
- **QO'SHIMCHA (topilma `fix:` qatorida ishora qilingan, sarlavhada yo'q):** `unpost()` da ham claim **yo'q
  edi** (`:782` `tx.loss.update({ where: { id, accountId }, data: { state: 'draft', … } })`). U Serializable
  ostida yugurgani uchun bug **yashiringan**: pozitsiyalari bor hujjatda ikki raqib bir xil `Stock` qatorlariga
  tegadi ⇒ mag'lub 40001 bilan tushadi. Lekin **bo'sh** (0 pozitsiyali) spisaniye hech narsani qulflamaydi —
  aynan shu teshik uchun `post()` ga 2026-07-29 da claim qo'shilgan edi (`:607-624` izohi buni yozib qo'ygan).
  Shuning uchun unpost ham shu fazada yopildi.
- **Nega loss chetda qolgan:** `shared/transition-toctou-class.test.ts` klass-skaneri 7 stock-servisni
  qamraydi (supply, sales-return, purchase-return, move, enter, production, processing) — **loss ro'yxatda
  yo'q edi**. Guard yo'qligi teshikning 2026-06 dan beri omon qolishining bevosita sababi.

**Fayllar**

| Fayl | O'zgarish |
|---|---|
| `apps/api/src/modules/loss/loss-transition-race.test.ts` | **YANGI** — 6 test, haqiqiy parallel `transition()` poygasi |
| `apps/api/src/modules/loss/loss.service.ts` | `cancel()` + `unpost()` ga `transitionWithClaim` (Faza 1 helperi); `cancel()` ga `{ isolationLevel: 'Serializable', timeout: 15000 }` |
| `apps/api/src/modules/shared/transition-toctou-class.test.ts` | loss uchun klass-lock bloki (+4 test) — skaner endi loss'ni ham qamraydi |

**O'zgarish (3 qism)**
1. **`cancel()` — snapshot holatini da'vo qiladi:** tranzaksiyaning BIRINCHI amali
   `transitionWithClaim(tx.loss, { id, accountId, fromStates: [existing.state], toState: 'cancelled' })`.
   `existing.state` (literal `'posted'` EMAS) ataylab — move/enter qoidasi: **cancel↔unpost poygasi**da ikki
   o'tkazish turli yakuniy holatga boradi, shuning uchun faqat snapshot holati ularni ketma-ketlashtiradi.
2. **`cancel()` endi Serializable + 15s timeout** — `post()`/`unpost()` allaqachon shunday edi; cancel yagona
   default-izolyatsiyali qoldiq-qaytaruvchi yo'l edi. `transition()` allaqachon `withSerializationRetry`
   ichida va `findById`ni retry closure ICHIDA qayta o'qiydi (40001'dan keyin eski snapshot bilan qayta
   urinish bo'lmaydi) — o'zgartirilmadi.
3. **`unpost()` — `fromStates: ['posted']` claim** (yuqoridagi «bo'sh hujjat» teshigi uchun).
   `post()` ning inline claim'i **tegilmadi** (ishlaydi, testi bor) — shu sababli faylda ikki shakl bor:
   post inline, unpost/cancel esa shared helper. Sabab hisobotda ochiq: ishlayotgan kritik yo'lni sabab
   ko'rsatmasdan qayta yozmaslik.

**Testlar (TDD tartibi kuzatildi)**
- RED (fix'dan oldin, jonli o'lchangan): **6 testdan 5 tasi yiqildi** —
  (1) ikki parallel `cancel` → `applyDeltas` **2×** (kutilgan 1), 0 rad;
  (2) ikki parallel `unpost` → **2×**;
  (3) `cancel` ∥ `unpost` → **2×** (aynan STK-01 impact'idagi ikkinchi stsenariy);
  (4) uchta parallel `cancel` → **3×**;
  (5) draft spisaniyeni cancel qilishda shartli `updateMany` **umuman yo'q edi**.
  Yagona o'tgan test — ikki parallel `post` (2026-07-29 claim'i, regress-lock sifatida qoldirildi).
- GREEN: **6/6 yashil**.
- Klass-skaner blokining **vakuum emasligi alohida tekshirildi** (`git show HEAD:…loss.service.ts` ustidan
  o'sha regexlar): pre-fix'da `unpost claim: false`, `cancel claim: false`, `Serializable count: 2` (guard 3
  kutadi) — ya'ni 4 ta yangi assertdan 3 tasi eski kodda yiqilardi.
- Test-double halolligi: `updateMany` WHERE `state` filtrini (`'x'` ham, `{ in: [...] }` ham) hurmat qiladi
  va tanasi **yield qilmaydi** ⇒ Postgres'ning qator-yozuv qulfi semantikasi; `findFirst` **detached nusxa**
  qaytaradi (aks holda bir chaqiruvchining claim'i ikkinchisining snapshotini retroaktiv o'zgartirib,
  poygani yashirardi). Harness shakli — `shared/money-transition-race.test.ts` (Faza 1) bilan bir xil.

**Gate (to'liq, jonli o'lchangan)**
- `pnpm --filter @moysklad/api typecheck` → **0 xato**
- `pnpm lint:product` → **0 error** (728 warning — siyosat bo'yicha ruxsat)
- `pnpm --filter @moysklad/api exec vitest run` (BUTUN suite) → **381 fayl / 5023 test yashil, 0 yiqilgan**
  (1 fayl / 2 test skipped — oldindan shunday)
- `loss` moduli alohida: **3 fayl / 27 test**; `shared`: **22 fayl / 501 test**
- `i18n:gate` — **kerak emas** (UI-matn tegilmadi, faqat backend).

**Qolgan qarz / DEFER**
- **Browser-smoke YO'Q.** Poyga faqat in-memory Prisma double'da o'lchandi; real Postgres'da Serializable +
  claim xulqi (409 matni UI'da qanday ko'rinishi ham) Phase-2 QA'ga qoladi.
- **🔴 `loss.delete()` HAMON himoyasiz (yangi topilma, bu faza doirasidan tashqarida).**
  `loss.service.ts:516-528` — `findById` bilan `applicable`/`state` tekshiriladi, keyin **shartsiz**
  `update({ where: { id, accountId }, data: { deletedAt } })`. Parallel `post` bilan poygada: post qoldiqni
  harakatlantiradi, delete esa hujjatni soft-delete qiladi ⇒ **yetim StockOperation** (hech qachon qaytmaydi).
  7 sibling servisda bu yo'l `updateMany({ where: { …, state: 'draft', applicable: false, deletedAt: null } })`
  bilan yopilgan; loss'da yo'q. Shuning uchun yangi klass-lok blokida `delete()` **ataylab pin qilinmadi** —
  aks holda test qizil bo'lardi. **Tavsiya: alohida kichik faza (yoki Faza 14 yonida) sifatida yopilsin.**
- **Klass-skaner qamrovi kengaydi, lekin to'liq emas:** loss qo'shildi (post/unpost/cancel + Serializable
  soni), lekin skanerda hamon «barcha stock-servislar ro'yxatda bormi» degan **qamrov-lock yo'q** (MONEY
  oilasida bunday lock bor: `MONEY_SERVICES` nomlar ro'yxati assert qilinadi). Yangi stock-hujjat qo'shilsa
  u ham jimgina qamrovdan tashqarida qoladi — bu aynan STK-01 ning ildiz sababi edi.
- **Bir faylda ikki claim shakli** (post inline ∥ unpost/cancel helper) — ataylab; birlashtirish istalsa
  alohida mexanik refaktor.

**Commit:** `fix(stock): faza 5 — loss cancel/unpost atomik claim + Serializable (STK-01)`

---

## Faza 6 — 2026-08-08 — **Phase-1: strukturaviy + unit-tasdiqlangan, browser-smoke YO'Q**

**Topilma tasdiqlanishi (o'z ko'zim bilan kodda).** `SALES-01` va `FE-01` — **IKKALASI HAM TASDIQLANDI**,
topilmalar aytganidek:
- `retail-sale.service.ts:981-996` (fix'dan oldin): `refundPositions = this.computePositions(parsed.positions
  .map(… priceMinor: p.priceMinor, discount: p.discount …))` — narx **to'g'ridan-to'g'ri so'rov tanasidan**;
  keyin `validateRefundAmount(refundPositions.totalMinor, cashReturn, cardReturn)`. Ya'ni **cheklovchi ham,
  cheklanayotgan ham bir manbadan** (o'ziga-havola cap). Asl pozitsiyalar `select`ida (`:951-958`)
  `priceMinor`/`discount`/`sumMinor` **umuman yo'q edi** — server asl narxni bilmasdi.
- `sotuv/page.tsx:277-291`: refund payload `priceMinor: p.priceMinor` yuborardi va
  `cashRefund = Σ BigInt(pos.priceMinor) × BigInt(pos.quantity)` — **chegirmasiz** to'liq narx;
  `:512-515` ekrandagi «Qaytariladigan summa» ham xuddi shu formula.
- **Eksploit jonli takrorlandi (dalil, taxmin emas):** yangi service-testning RED yugurishida 10 000 tiyinlik
  chek `priceMinor: '10000000'` bilan **muvaffaqiyatli qaytdi** — `cashAmountMinor: 10000000n` bilan oyna chek
  yaratildi va `MoneyService.applyDeltas` chaqirildi. Barcha mavjud guardlar (qty-subset, payout≤refundSum,
  CAS state-flip) o'tdi.

**Fayllar**

| Fayl | O'zgarish |
|---|---|
| `apps/api/src/modules/retail-sale/retail-refund-validation.ts` | **YANGI** `priceRefundFromOriginal()` + `OriginalPricedLine`/`PricedRefund` tiplari |
| `apps/api/src/modules/retail-sale/retail-refund-validation.test.ts` | +8 test (sof funksiya: chegirma, prorate, aralash-narx, floor-invariant, kasr qty) |
| `apps/api/src/modules/retail-sale/retail-sale-refund-pricing.test.ts` | **YANGI** — 7 service-darajali test (wiring: `refund()` mocked-Prisma ustidan) |
| `apps/api/src/modules/retail-sale/retail-sale.service.ts` | `select`ga `priceMinor`/`discount`/`sumMinor`; `computePositions(klient narxi)` → `priceRefundFromOriginal(asl chek, faqat miqdor)` |
| `apps/api/src/modules/retail-sale/retail-sale.schema.ts` | refund `priceMinor`/`discount` → **`.optional()`** + «server IGNORE qiladi» izohi |
| `apps/api/src/modules/retail-sale/retail-sale.cas.test.ts` | fixture'ga pul-ustunlari qo'shildi (real `select` shakliga moslash) |
| `apps/web/src/lib/pos/cart-math.ts` | **YANGI** `refundPayoutMinor()` — asl `sumMinor`dan proporsional, pastga yaxlitlash |
| `apps/web/src/lib/pos/cart-math.test.ts` | +7 test (chegirma, prorate, floor, kasr qty, nol-miqdor) |
| `apps/web/src/app/(app)/sotuv/page.tsx` | refundMut + ekran-summasi `refundPayoutMinor`'ga; payload endi narx yubormaydi |
| `apps/web/src/__tests__/pos-refund-payout.test.ts` | **YANGI** — 3 test, WIRING regress-lock (formula to'g'ri-yu sahifa ishlatmasa tutadi) |

**O'zgarish (3 qism)**
1. **Server narxni klientdan UMUMAN olmaydi.** `priceRefundFromOriginal(original, requested)` — asl chek
   qatorlarini **mahsulot bo'yicha agregatlaydi** (`validateRefundPositions` ham aynan shunday: cap
   qator emas, mahsulot darajasida) va har qaytarish qatorini
   `⌊ Σ(asl sumMinor) × qaytQty / Σ(asl qty) ⌋` bilan narxlaydi.
   - **Nega prorate, «birinchi qator narxi» emas:** bir chek bir mahsulotni **turli narxda** ikki qatorda
     sotishi mumkin (1×100 + 1×10 = 110). First-line-wins 2 dona uchun 200 berardi — invariantni buzardi.
   - **Nega floor:** `validateRefundPositions` qty ≤ sotilgan qty ni kafolatlaydi, shuning uchun floor'lar
     yig'indisi **hech qachon** asl summadan oshmaydi. Mijoz bo'lingan qisman qaytarishda qatoriga 1 tiyingacha
     yutqazishi mumkin — chekdan **ortiq** to'lash esa aynan yopilayotgan zarar.
   - Chegirma **asl `sumMinor` ichida** bo'lgani uchun FE-01 ham server tomondan yopiladi.
   - Asl `priceMinor`/`discount` oyna qatorga **ko'chiriladi** (provenance/ko'rsatish uchun) — pul ulardan
     hisoblanMAYDI.
   - Asl chekda yo'q mahsulot **0 tiyin** narxlanadi (`validateRefundPositions` uni allaqachon rad etadi;
     bu — guardlar tartibi kelajakda o'zgarsa pul yaralmasligi uchun ikkinchi qatlam).
2. **Schema halollashtirildi:** refund `priceMinor`/`discount` endi `.optional()` va izohda «server IGNORE
   qiladi» yozilgan. Eski klientlar buzilmaydi (yuborsa qabul qilinadi, e'tiborga olinmaydi).
3. **Web ikkala joyda bir formuladan:** `refundPayoutMinor()` — server bilan **bir xil** (asl `sumMinor`dan
   proporsional, floor). Bu shart edi: SALES-01 tuzatilgach eski FE formulasi chegirmali chekda payout > cap
   berib **400 olardi**, ya'ni chegirmali chekni umuman qaytarib bo'lmasdi. Miqdor `Math.round(n*1e6)` bilan
   mikro-birlikka o'tadi — yon-foyda: `BigInt(1.5)` otilishi (FE-02 klassi) bu yo'lda yo'q.

**Testlar (TDD tartibi kuzatildi)**
- RED-1 (sof funksiya): 8/8 yiqildi — `priceRefundFromOriginal is not a function`.
- RED-2 (service wiring, fix'dan OLDIN, jonli o'lchangan): **7/7 yiqildi**, sabablari aynan bug:
  over-refund `promise resolved … instead of rejecting`; `expected 10000000n to be 10000n`;
  chegirmali chek `expected 1000000n to be 900000n`; prorate `expected 300000n to be 270000n`.
- RED-3 (web): `refundPayoutMinor` yo'q (7 test) + wiring-skaner 3/3 qizil.
- GREEN: yangi testlar 8+7+7+3 = **25 ta yashil**.
- **Regress:** `retail-sale.cas.test.ts` ning refund-CAS testi yiqildi (fixture'da `sumMinor` yo'q edi →
  BigInt mix). Bu **fixture qarzi**, mahsulot bug'i emas — real Prisma `select` endi bu ustunlarni qaytaradi;
  fixture real shaklga moslandi (mahsulot kodiga himoyaviy `?? 0n` **qo'yilmadi** — u haqiqiy nosozlikni
  yashirardi).

**Gate (to'liq, jonli o'lchangan)**
- `pnpm --filter @moysklad/api typecheck` → **0 xato** *(dastlab 1 xato tutdi: Prisma `quantity`/`discount`
  = `Decimal`, `string` emas — `String()` bilan tuzatildi)*
- `pnpm --filter @moysklad/web typecheck` → **0 xato**
- `pnpm lint:product` → **0 error** (728 warning — siyosat bo'yicha ruxsat)
- `pnpm i18n:gate` → **o'tdi** (9 test; 12281 kalit)
- `pnpm --filter @moysklad/api exec vitest run` (BUTUN suite) → **382 fayl / 5038 test yashil, 0 yiqilgan**
- `pnpm --filter @moysklad/web exec vitest run` (BUTUN suite) → **183 fayl / 2745 test yashil, 0 yiqilgan**

**Qolgan qarz / DEFER**
- **Browser-smoke YO'Q.** Real kassada chegirmali chekni qaytarish, 400 xabarining UI'da ko'rinishi va
  yaxlitlash bir tiyinining kassirga qanday ko'rinishi — Phase-2 QA (retail cohort) ga qoladi.
- **Faza 7 doirasi (ataylab tegilmadi):** qarz-sotuv refund'i hamon naqd chiqaradi va mijoz qarzi qolaveradi
  (`SALES-04`); qisman refund chekni `refunded` qilib qolganini qaytarib bo'lmaydigan qiladi + butun loyalty
  ballni tortadi (`SALES-05`). **Diqqat:** endi prorate ishlaydigani uchun qisman refund summasi TO'G'RI —
  lekin kumulyativ cap yo'qligi sababli chek baribir bir marta qaytariladi.
- **`costMinor`/`basePriceMinor` hamon «birinchi qator yutadi»** (`originalFrozen`) — bir mahsulot turli
  narxda sotilgan chekda muzlatilgan tan narx aniq emas. Pul-payout endi prorate bo'lgani uchun bu **faqat
  COGS/marja hisobotiga** ta'sir qiladi; Faza 18 (weighted-average) shu joyni qayta ko'radi.
- **`this.computePositions` refund yo'lida endi ishlatilmaydi** (create/update'da qoladi) — o'chirilmadi.

**Commit:** `fix(sales): faza 6 — POS refund asl-narx cap + chegirma (SALES-01, FE-01)`

---

## Faza 7 — 2026-08-08 — **Phase-1: strukturaviy + unit-tasdiqlangan, browser-smoke YO'Q**

**Topilma tasdiqlanishi (o'z ko'zim bilan kodda).** `SALES-04` va `SALES-05` — **IKKALASI HAM TASDIQLANDI**:
- `retail-sale.service.ts` `refund()` (fix'dan oldin, 934–1169): butun metodda `counterpartyBalance` so'zi
  **umuman yo'q** — `post()` esa `:802-810` da qarzni `applyDelta(+debtAmount)` bilan yozadi. Ya'ni qarz
  yoziladi, hech qachon qaytarilmaydi. Refund sxemasida qarz maydoni ham yo'q edi.
- `:1042-1045` `updateMany({where:{state:'posted'}, data:{state:'refunded'}})` — **shartsiz**; qisman refund
  ham chekni yopardi va ikkinchi refund `:971` da 400 olardi.
- `retail-loyalty.ts:64-70` `planLoyaltyReversal` — `return { points: earnedOp.bonusValue }`, ulushga
  qaramaydi.
- **Yon-topilma (audit ko'rmagan, SALES-04 fix'i uchun BLOKER):** `post()` `debtAgentId = parsed.agentId ??
  sale.agentId` bilan qarzni yozadi-yu, `agentId`ni chekka **YOZMAYDI**; `/sotuv` (`page.tsx:1014`) mijozni
  faqat post payloadida yuboradi. Demak bazadagi HAR qarz chekida `agentId` NULL — qarz kimniki ekani faqat
  `SOLD_ON_CREDIT` audit hodisasida qolgan.

**Fayllar**

| Fayl | O'zgarish |
|---|---|
| `packages/db/prisma/schema.prisma` | `RetailSale.debtReturnMinor` (`debt_return_minor`, BigInt, default 0) |
| `packages/db/prisma/migrations/20260808120000_retail_sale_debt_return/migration.sql` | **YANGI** — additive `ALTER TABLE ADD COLUMN` |
| `apps/api/src/modules/retail-sale/retail-refund-validation.ts` | `validateRefundPositions(..., alreadyRefunded)` kumulyativ; **YANGI** `isFullyRefunded()`, `computeRefundSettlementCaps()`, `validateRefundSettlement()` |
| `apps/api/src/modules/retail-sale/retail-refund-validation.test.ts` | +25 test (kumulyativ qty, to'liq-qaytarish sharti, ikki cap, yaxlitlash-drift sikllari) |
| `apps/api/src/modules/retail-sale/retail-loyalty.ts` | `planLoyaltyReversal(earnedOp, refundSum, originalSum)` — ulushga proporsional (floor) |
| `apps/api/src/modules/retail-sale/retail-loyalty.test.ts` | mavjud 4 test yangi imzoga; +5 test (ulush, floor-invariant, nol-holatlar) |
| `apps/api/src/modules/retail-sale/retail-sale.schema.ts` | refund'ga `debtReturnMinor` (**optional** — berilmasa server o'zi hisoblaydi) |
| `apps/api/src/modules/retail-sale/retail-sale.service.ts` | `refund()`: `payments` select, oldingi refundlarni o'qish, kumulyativ guard, ikki cap, qarz `applyDelta(−)`, versiya-CAS, shartli state-flip, loyalty ulushi; **YANGI** `resolveCreditDebtorId()`; `post()`: qarz mijozini chekka yozish |
| `apps/api/src/modules/retail-sale/retail-sale-refund-debt.test.ts` | **YANGI** — 18 service-darajali test (SALES-04/05 wiring) |
| `apps/api/src/modules/retail-sale/retail-sale-tenders-wiring.test.ts` | +2 test (qarz mijozi chekka yoziladi / mavjudi qayta yozilmaydi) |
| `apps/api/src/modules/retail-sale/retail-sale-refund-pricing.test.ts`, `retail-sale.cas.test.ts` | fixture'lar real `select` shakliga (`version`, `sumMinor`, `payments`, `findMany`) |

**O'zgarish (5 qism)**
1. **Qaytarish qanday «to'lanishi» chekning o'zidan kelib chiqadi (SALES-04).**
   `computeRefundSettlementCaps` asl chekning `RetailSalePayment(method='DEBT')` ulushidan ikki cap chiqaradi:
   `moneyCap(R) = ⌊(sum − debt) × R / sum⌋`, `debtCap(R) = R − moneyCap(R)` (`debt` bilan clamp) — bu yerda
   **R = KUMULYATIV** qaytarilgan qiymat, keyin oldingi refundlar qaytargani ayriladi. 100% qarz chekda
   `moneyCap = 0` → kassadan bir tiyin ham chiqmaydi; `debtCap = R` → qarz shu summaga kamayadi.
   - **Nega kumulyativ, per-refund emas:** floor'ni har refundda alohida hisoblash bo'lingan qaytarishlarda
     tiyin-drift to'plardi. Kumulyativ hisoblashda `R = sum` da ikki cap **aynan** chekning naqd va qarz
     ulushiga teng bo'ladi.
   - `debtReturnMinor` **berilmasa** — server `debtCap`ni o'zi qo'llaydi. Ataylab shunday: POS bugun hech
     narsa yubormaydi, va «tovar qaytdi, qarz qolaverdi» — aynan yopilayotgan bug. Berilgan qiymat cheklanadi.
2. **Kumulyativ qisman refund (SALES-05).** `refund()` shu chekning barcha oyna cheklarini o'qiydi
   (`refundedFromId`, `state ∈ {posted, refunded}`) va `validateRefundPositions`ga **oldingi qatorlarni** beradi.
   State `refunded`ga faqat `isFullyRefunded` (har mahsulotning sotilgan qty'si qoplangan) bo'lganda o'tadi.
   Xizmat qatorlari (`productId = null`) chekni ochiq ushlab turmaydi — ular qaytarilmaydi.
3. **Mutex `state`dan `version`ga ko'chdi.** Eski CAS `posted → refunded` flip'ining o'zi edi; qisman refund
   endi flip qilmagani uchun u **yo'qolgan bo'lardi** — ikki parallel refund bir xil «oldingi refundlar»
   ro'yxatini o'qib, ikkalasi ham qolgan summani to'liq qaytarardi. Endi
   `updateMany(where:{state:'posted', version}, data:{version:{increment:1}, …})` — yutqazgan 409 oladi.
4. **Loyalty ulushga proporsional (SALES-05).** `⌊earned × refundSum / originalSum⌋`, dastur qoidasidan
   **qayta hisoblanMAYDI** (§105 saqlanadi). Floor tufayli bo'lingan refundlar yig'indisi hech qachon
   berilgan balldan oshmaydi; bir ballga yetmagan ulush 0 op yaratmaydi.
5. **Qarzdorni topish (bloker yon-topilma).** `post()` endi qarz mijozini chekka yozadi (mavjudini qayta
   yozmaydi). Bundan OLDIN sotilgan cheklar uchun `resolveCreditDebtorId()` `SOLD_ON_CREDIT` audit
   hodisasidan (balans deltasi bilan **bir tranzaksiyada** yozilgan) mijozni tiklaydi — busiz bazadagi har
   qarz cheki qaytarib bo'lmaydigan bo'lardi.

**Testlar (TDD tartibi kuzatildi)**
- RED-1 (sof modullar): **24/59 yiqildi** — `computeRefundSettlementCaps/isFullyRefunded/validateRefundSettlement
  is not a function`, loyalty ulush testlari `expected {points:1000} to equal {points:100}`.
- RED-2 (service wiring, fix'dan OLDIN, jonli o'lchangan): **13/15 yiqildi**, sabablari aynan bug:
  qarz refund'da `applyDelta` «called 0 times»; naqd-qaytarish `promise resolved instead of rejecting`
  (100% qarz chekdan 100 000 naqd CHIQDI — eksploit takrorlandi); qisman refund `expected 'refunded' to be
  undefined`; kumulyativ over-refund o'tib ketdi.
- RED-3 (`post()` mijozni saqlashi): 1/12 yiqildi — `expected {state:'posted',…} to match {agentId}`.
- RED-4 (legacy qarzdor audit izidan): 1/18 yiqildi.
- GREEN: **25 + 5 + 18 + 2 = 50 yangi test yashil**; modul jami 242/242.
- **Regress:** `retail-sale-refund-pricing.test.ts` va `retail-sale.cas.test.ts` fixture'lari yiqildi
  (`retailSale.findMany` yo'q, `version`/`sumMinor`/`payments` yo'q) — bu **fixture qarzi**, mahsulot bug'i
  emas: real `findFirst` bu ustunlarni qaytaradi. Mahsulot kodiga himoyaviy `?? []` **qo'yilmadi** (u haqiqiy
  nosozlikni yashirardi) — fixture'lar real shaklga moslandi.

**Gate (to'liq, jonli o'lchangan)**
- `pnpm --filter @moysklad/api typecheck` → **0 xato**
- `pnpm lint:product` → **0 error** (728 warning — siyosat bo'yicha ruxsat)
- `pnpm --filter @moysklad/api exec vitest run` (BUTUN suite) → **383 fayl / 5085 test yashil, 0 yiqilgan**
- Migratsiya lokal `climart_adopt @ 5432` ga qo'llandi (idempotent skript; `_prisma_migrations` sinxron emas —
  xotira `climart-adopt-local-db-untracked`). Ustun mavjudligi so'rov bilan tasdiqlandi.
- `i18n:gate` yugurtirilMADI — UI matni tegilmagan (faqat API); web ham tegilmagan.

**Qolgan qarz / DEFER**
- **Browser-smoke YO'Q.** Kassada qarz chekini qaytarish, qisman qaytarishdan keyin chekning «Qaytarilgan»
  ko'rinishi, 409/400 xabarlarining UI'da ko'rinishi — Phase-2 QA (retail cohort) ga qoladi.
- **Web POS `debtReturnMinor` yubormaydi** — server default'i (qarz ulushini avtomatik yopish) shu holat
  uchun ataylab tanlandi, lekin kassir ekranida «qancha qarzdan yechildi» **ko'rinmaydi**. UI ko'rsatkichi —
  alohida ish (Faza 7 fayl ro'yxati API-only edi).
- **Legacy qarz cheklari:** audit izi ham bo'lmasa (juda eski/import qilingan chek) qaytarish 400 beradi;
  chiqish yo'li xabarda ko'rsatilgan — `debtReturnMinor: '0'` (tovar qaytadi, kassadan pul CHIQMAYDI, qarz
  qo'lda tuzatiladi). Ommaviy backfill (audit hodisalaridan `retail_sales.agent_id`ni to'ldirish) — **ops
  qadam sifatida tavsiya**, bu fazada bajarilMADI.
- **`SALES-06` (legacy z-report) qisman yaxshilandi, lekin yopilmagan:** qisman refundda asl chek endi
  `posted` bo'lib qolgani uchun `salesAgg`dan tushib qolmaydi (netSum to'g'ri chiqadi); **to'liq** refundda
  esa eski ikki-marta-ayirish bug'i o'z holicha qoladi → **Faza 15**.
- **`cashier-session.zReport` `creditAgg` `method: 'debt'` (kichik harf) bilan qidiradi**, tender qiymati esa
  `'DEBT'` (`retail-tenders.ts:34`) → «qarzga sotildi» ko'rsatkichi doim 0. Tasdiqlandi, **tegilmadi**
  (Faza 15 doirasiga yaqin) — hisobotda qayd etildi.
- **Faza 15 bilan kesishma:** `collectCashInputs` refund oyna cheklarining naqdini ikki marta sanashi
  (`SALES-02`) — bu faza uni **na yomonlashtirdi, na tuzatdi** (ikki holatda ham oyna chek `posted`).

**Commit:** `fix(sales): faza 7 — POS refund qarz-qaytarish + kumulyativ + loyalty ulush (SALES-04, SALES-05)`

---

## Faza 8 — 2026-08-08 — **Phase-1: strukturaviy + unit-tasdiqlangan, browser-smoke YO'Q**
### `recompute-counterparty-balances.ts` — APPLY-guard + qamrov (`DUP-02`)

**Da'vo tasdiqlandi (kodda, o'z ko'zim bilan).** `applyDelta` chaqiruvchilari skanerlandi — 13 fayl.
Skript 11 tasini bilardi, IKKITASI qamrovsiz edi:
- `debt/debt.service.ts:561` — `create()` `applyDelta(+totalMinor, {docType:'debt'})` (2026-08-05
  «BALANS SIMMETRIYASI» o'zgarishi);
- `retail-sale/retail-sale.service.ts:842` — post `+debtAmount`, `:1287` — refund `−debtReturn`.

**Runtime-tasdiq (lokal `climart_adopt @ 5432`, DRY-RUN, yozuvsiz).** Bazada 8 ta QRZ- qarz bor va uchala
materialized qatorning qiymati aynan `Σdebt − Σto'lov` ga teng:

| kontragent | balans (bor) | Σ QRZ- totalMinor | ESKI skript nishoni (= balans − Σdebt) |
|---|---|---|---|
| `0000…0001` | 500 000 | 750 000 (3 qarz) | **−250 000** |
| `99de5186…` | 0 | 600 000 (3 qarz) | **−600 000** |
| `5495a6bd…` | 50 000 | 200 000 (2 qarz) | **−150 000** |

Ya'ni bugun eski skript `APPLY=1` bilan yugurtirilganda **to'liq to'lagan mijoz «biz unga 600 ming
qarzdormiz»** bo'lib yozilardi — auditda bashorat qilingan oqibat aynan shu. Tuzatilgan skript shu bazada
`changed: 0` beradi (idempotent, drift yo'q).

**O'zgargan/yaratilgan fayllar**
- **Yangi** `apps/api/src/scripts/counterparty-balance-sources.ts` — QAMROV REYESTRI + skaner:
  - `scanBalanceWriters()` — `apps/api/src` daraxtini o'qib `X.applyDelta(` CHAQIRUVI bor fayllarni topadi.
    Izohlar oldindan olib tashlanadi (`counterparty-settlement.util.ts` va
    `counterparty-statement.service.ts` `applyDelta` ni faqat premise-izohida tilga oladi — ular yozuvchi
    EMAS); `*.test.ts` va e'lonning o'zi (`counterparty-balance.service.ts`) chiqarib tashlanadi.
  - `DECLARED_BALANCE_WRITERS` — 13 yozuvchi, har biri skriptdagi manba nomiga (`SCRIPT_SOURCES`) va
    «nima yozadi» izohiga bog'langan.
  - `assertCounterpartyBalanceCoverage()` — IKKI tomonlama: **QAMROVSIZ** (kodda bor, reyestrda yo'q →
    `APPLY=1` uning saldosini jimgina 0 qilardi) va **ESKIRGAN** (reyestrda bor, kodda yo'q → skript endi
    mavjud bo'lmagan deltani qo'shadi). Xato xabari nima qilish kerakligini aytadi.
- **Modify** `apps/api/src/scripts/recompute-counterparty-balances.ts`:
  - `main()` **birinchi so'rovdan ham oldin** `assertCounterpartyBalanceCoverage()` chaqiradi — qamrov
    buzilgan bo'lsa skript DRY-RUN'da ham `throw` qiladi (rejadagi «aks holda skript ishlashdan oldin
    throw» talabi).
  - **`SOURCE: debt-issue`** — `prisma.debt.groupBy` `Σ totalMinor` per (account, counterparty, currency).
    `totalMinor` create'dan keyin o'zgarmaydi (Debt'ni tahrirlaydigan yo'l yo'q) ⇒ Σ = Σ yozilgan delta.
  - **`SOURCE: retail-credit`** — `RetailSalePayment` `method=TENDER.debt` qatorlari (summa + valyuta aynan
    `applyDelta` olgan qiymat, bir tranzaksiyada yozilgan), chek holati `posted|refunded`. Bu ikkilik aynan
    «post yugurgan» to'plam: FSM'da `posted` dan `cancel` YO'Q (`retail-sale-fsm.ts`).
  - **`SOURCE: retail-credit-refund`** — `RetailSale.debtReturnMinor > 0` qatorlari, teskari ishora bilan;
    valyuta smena kassasidan.
  - **Kontragentni aniqlash — faithful mirror:** qarz-sotuvda `SOLD_ON_CREDIT` audit hodisasi BIRLAMCHI
    manba (u `applyDelta` bilan bir tranzaksiyada, aynan o'sha `debtAgentId` bilan yoziladi), chek
    qatoridagi `agentId` — zaxira. Sabab: `post()` chekdagi `agentId` ni faqat u BO'SH bo'lsa to'ldiradi,
    ya'ni chekda boshqa mijoz turgan holatda daftar va chek qatori AJRALADI. Qaytarish tomonida esa
    `resolveCreditDebtorId` tartibi (avval `agentId`, keyin hodisa) aynan takrorlandi.
  - **Mijozi aniqlanmagan qarz qatori → `throw`** (jimgina o'tkazib yuborish o'sha chekning qarzini
    yo'qotib, kimningdir saldosini kamaytirib yozardi).
  - **`ONLY_CP` endi MARKAZDA (`add()` ichida) filtrlanadi.** Ilgari har so'rovda edi; yangi manbalarda
    kontragent so'rovdan KEYIN (audit hodisasidan) aniqlanadi, shuning uchun so'rov-filtri ularni
    `ONLY_CP` rejimida tushirib qoldirib, o'sha kontragent saldosini «ortiqcha» ko'rsatardi.
- **Yangi** `apps/api/src/scripts/counterparty-balance-sources.test.ts` — 13 test.

**TDD (qizil ko'rildi)**
Test avval yozildi, reyestr esa faqat skript BUGUN bilgan 11 manbani e'lon qildi → **6 yiqilgan / 13**:
qamrov-testi xabarida aynan `modules/debt/debt.service.ts` va `modules/retail-sale/retail-sale.service.ts`
«QAMROVSIZ» deb chiqdi (ya'ni test DUP-02 ni takrorlab ko'rsatdi), qolgan 5 tasi skriptda `SOURCE:`
bloklari yo'qligidan yiqildi. Fix'dan keyin **13/13 yashil**.

**Testlar (nima qulflandi)**
1. Skaner ishlaydi (≥12 yozuvchi topadi) — non-vakuum lang'ar.
2. E'lon (`async applyDelta(`), testlar va **izohdagi** eslatmalar yozuvchi deb sanalmaydi.
3. `assertCounterpartyBalanceCoverage()` real daraxtda yiqilmaydi.
4. **Yangi yozuvchi → QAMROVSIZ deb yiqiladi** (rejadagi asosiy talab).
5. Eskirgan reyestr yozuvi → ESKIRGAN deb yiqiladi.
6. Reyestrdagi har manba skriptda `SOURCE: <nom>` markeri bilan MAVJUD — «reyestrga yozdim, skriptni
   yangilashni unutdim» holati ham yiqiladi.
7. Skript qamrovni **birinchi `counterpartyBalance.upsert` dan OLDIN** tekshiradi (indeks solishtiruvi).
8. debt-issue / retail-credit / retail-credit-refund manbalari kutilgan so'rov shakli bilan mavjud.
9. **Premise-qulf:** `debt.remove()` da hali `applyDelta` yo'q — skriptning «soft-delete qilinganlarni ham
   sana» siyosati shunga tayanadi (pastga qarang).

**Gate (to'liq, jonli o'lchangan)**
- `pnpm --filter @moysklad/api typecheck` → **0 xato**
- `pnpm lint:product` → **0 error** (728 warning — siyosat bo'yicha ruxsat)
- `pnpm --filter @moysklad/api test` (BUTUN suite) → **384 fayl / 5098 test yashil, 0 yiqilgan** (1 skip)
- Skript **DRY-RUN** bilan lokal DB'da yugurtirildi → `changed: 0, unchanged: 3` (runtime-tasdiq: qamrov
  guard'i o'tadi, oltita manba so'rovi ham haqiqiy bazada ishlaydi).
- **`APPLY=1` YUGURTIRILMADI** (reja talabi).
- `i18n:gate` yugurtirilMADI — UI matni tegilmagan (faqat API-skript + test).

**Qaror: soft-delete qilingan qarzlar HAM sanaladi (va nega)**
`DebtService.remove()` create'ning `+totalMinor` deltasini QAYTARMAYDI (`DUP-03`, Faza 12). Ya'ni daftarda
o'sha delta hali turibdi. Bugun `deletedAt: null` filtri qo'yilsa skript o'chirilgan qarzlarni «ortiqcha»
deb saldodan ayirib yuborardi — ya'ni bir bug'ni ikkinchisi bilan yopish. Shuning uchun rekonstruksiya
**yozuvchilarga sodiq** qoldi. Faza 12 reversal qo'shgan kuni yuqoridagi 9-test yiqiladi va skriptga
`deletedAt: null` qo'shish kerakligini aytadi — bog'lanish kod bilan mahkamlandi.

**Rejaning «Diqqat» bandiga javob:** qamrov **TO'LIQ** yopildi (13/13 yozuvchi), ya'ni `APPLY=1` bugun
xavfsiz — faza «faqat guard qo'yish» bilan cheklanmadi. Lekin **journal'dan qayta qurish (ildiz-yechim)
hamon Faza 9/10'ga qoladi**: hozirgi rekonstruksiya har yozuvchining shaklini alohida taqlid qiladi, ya'ni
yozuvchi semantikasi o'zgarsa skript ham o'zgarishi kerak. Skaner buni **«yangi fayl»** darajasida tutadi,
**«o'zgargan ishora»** darajasida EMAS.

**Qolgan qarz / DEFER**
- **Browser-smoke YO'Q** — bu ops-skript, UI'siz. O'rniga qoida: prod'da `APPLY=1` dan oldin **majburiy
  DRY-RUN + `changed` sonini ko'z bilan tekshirish**.
- **Prod-DB'da drift bor-yo'qligi tekshirilMAGAN** — DRY-RUN faqat lokal `climart_adopt`da yugurtirildi.
  Prod (`sherset_v2`) uchun bu ops-qadam: avval DRY-RUN, chiqishni saqlash, keyin qaror.
- **Yangi topilma (bu fazada tuzatilMADI, faqat qayd):** `post()` da `parsed.agentId` chekdagi mavjud
  `sale.agentId` dan USTUN turadi, lekin chek qatori yangilanmaydi (`retail-sale.service.ts:706` —
  `!sale.agentId` sharti). Ya'ni daftar bir kontragentga, chek qatori boshqasiga ishora qilishi mumkin;
  keyin `resolveCreditDebtorId` qaytarishda chek qatoridagini oladi ⇒ qarz **boshqa** mijozdan yechilishi
  mumkin. Skript buni to'g'ri qayta quradi (audit hodisasidan o'qiydi), lekin **ildiz bug' ochiq** —
  alohida mayda faza yoki Faza 15 uchun nomzod.
- **Faza 13 bilan bog'lanish ishlaydi:** InvoiceIn balansdan uzilganda `fixed-docs` ro'yxatidan
  `prisma.invoiceIn` olib tashlanishi shart. O'shanda skaner `invoice-in`ni yozuvchi sifatida ko'rmay
  qoladi ⇒ reyestr **ESKIRGAN** deb yiqiladi va buni majburlaydi.

**Commit:** `fix(scripts): faza 8 — recompute-balances qamrov-guard + debt/POS-qarz manbalari (DUP-02)`

---

## Faza 9 — 2026-08-08 — **Phase-1: strukturaviy + unit + real-DB-tasdiqlangan, browser-smoke YO'Q**
### `CounterpartyBalanceEntry` append-only balans jurnali (`DUP-15`/`DB-15` ildizi, `M-07` oqibati)

**Da'volar tasdiqlandi (kodda, o'z ko'zim bilan).**
- **`DUP-15`** — `counterparty-balance.service.ts:74-88` upsert kaliti `counterpartyId_currency`; modelda
  (`schema.prisma`, eski holat) `organizationId` YO'Q, faqat `@@unique([counterpartyId, currency])`.
  Ya'ni org-kesim materiallashgan jadvaldan **printsipial** olinmaydi — audit to'g'ri.
- **`M-07`** — `counterparty.service.ts:456-457` izohi «Σ(byOrg) === materialized … the cert asserts this
  invariant» deydi, `:510-525` groupBy ro'yxati esa 9 tur (supply/debt/debtPayment/retailsale yo'q).
- **Auditda YO'Q, o'zim topgan qo'shimcha (fazani hal qiluvchi):** 49 `applyDelta` chaqiruv joyidan **faqat
  `post()` yo'llari** `docType/docId` uzatardi — **barcha `unpost`/`cancel`/`update`-reapply joylari
  meta'siz** edi (`ApplyDeltaMeta` ataylab optional qilingan, docstring: «kept optional so the ~40 existing
  call sites compile unchanged»). Jurnalni faqat chokepoint'ga qo'shib qo'ysam, **teskari deltalarning
  yarmi hujjat-identifikatorisiz** tushardi va Faza 10 o'quvchilari (statement/akt qatorlari, org-kesim)
  jurnal ustiga qurilmasdi. Shu sababli faza qamrovi kengaytirildi (pastda).

**O'zgargan/yaratilgan fayllar**
- **Yangi** `packages/db/prisma/migrations/20260808180000_counterparty_balance_entry_journal/migration.sql`
  + `schema.prisma` `model CounterpartyBalanceEntry` (+ 3 back-relation: Account/Counterparty/Organization):
  `id, accountId, counterpartyId, organizationId?, currency, deltaMinor, docType(VARCHAR 40), docId(uuid), createdAt`.
  - Indekslar: `(account, counterparty, currency, createdAt)` — statement/akt davr kesimi;
    `(account, organization, currency)` — «Balans po organizatsiyam»; `(account, docType, docId)` —
    hujjat bo'yicha teskari qidiruv.
  - `updatedAt` **ataylab yo'q** — jadval append-only, unpost/cancel teskari belgili YANGI qator yozadi.
  - `docType` **enum EMAS** (VARCHAR): yangi yozuvchi qo'shilganda sxema migratsiyasi kerak bo'lmasin —
    aynan «N ta ro'yxatni yangilash majburiyati» DUP-15 ning ildizi edi.
- **Modify** `counterparty-balance/counterparty-balance.service.ts`:
  - `applyDelta` upsert bilan **BIR TRANZAKSIYADA** (`tx`, `this.prisma` EMAS) jurnal qatorini yozadi.
  - `ApplyDeltaMeta`: `docType`/`docId` **majburiy** bo'ldi + **yangi majburiy `organizationId: string | null`**.
    Bu — compile-time qo'riqchi: yangi balans-yozuvchi meta'ni **unutolmaydi** (Faza 8 ning skan-guard'i
    «yangi FAYL» darajasida tutadi, bu esa «yangi CHAQIRUV» darajasida). `source?` optional qoldi — u
    faqat HR owner-debt notifikatori uchun, jurnalga yozilmaydi (xulq o'zgarmadi).
- **Modify — 49 chaqiruv joyi 13 faylda** (typecheck ro'yxatga oldi, hech biri qo'lda topilmadi):
  `cash-in`(3) · `cash-out`(3) · `invoice-in`(5) · `invoice-out`(5) · `payment-in`(3) · `payment-out`(3) ·
  `supply`(3) · `prepayment`(5) · `prepayment-return`(5) · `counterparty-adjustment`(5) · `retail-sale`(2) ·
  `debt`(1 + recalc yo'li) · `debt-recalc`(pass-through) · `pos-debt-payment`(1).
  - `organizationId` manbasi: pul/hujjat oilasida `existing.organizationId` (Prisma'da NOT NULL);
    invoice `update()` re-apply'da mavjud `effectiveOrgId` (`parsed.organizationId ?? existing.organizationId`) —
    ya'ni org o'zgarsa jurnal YANGI org'ga yozadi, reversal esa eskisiga (juftlik to'g'ri yopiladi).
  - `organizationId: null` **ataylab**: `Debt` modelida organizatsiya o'lchovi umuman yo'q,
    `RetailSale.organizationId` optional. Majburiy maydon bo'lgani uchun bu **qaror**, unutish emas.
  - `debt-recalc.ts`: `meta` majburiy; `DebtService.recalc()`ga `docId` parametri qo'shildi —
    `docType:'debtpayment'`, `docId` = to'lov ID'si ma'lum bo'lsa o'sha (`paymentId`/`created.id`/`payment.id`),
    aks holda qarz kartochkasi ID'si (delta to'lovlar YIG'INDISIDAN keladi). POS yo'li avvalgidek `batchId`.
- **Modify** `counterparty-balance.service.test.ts` — 5 → **10 test**.

**TDD (qizil ko'rildi)**
Jurnal testlari avval yozildi → **3 yiqilgan / 10**: `entryArgs` bo'sh (`expected [] to deeply equal
['cp-1|USD','cp-1|UZS','cp-2|UZS']`), `organizationId` `undefined`. Ya'ni yiqilish sababi aynan «jurnal
yozuvi yo'q», sintaksis/typo emas. Model + migratsiya + chokepoint yozuvidan keyin **10/10 yashil**.

**Testlar (nima qulflandi)**
1. Har qo'llangan delta uchun **bitta** jurnal qatori, to'liq shakl (`accountId/counterpartyId/
   organizationId/currency/deltaMinor/docType/docId`) — `toEqual` bilan, ya'ni ortiqcha maydon ham tutiladi.
2. `deltaMinor === 0n` → jurnalga **hech narsa** yozilmaydi (materiallashgan upsert ham yo'q).
3. Valyuta rad etilsa (`USDT`) → jurnal qatori ham yozilmaydi (validatsiya yozuvdan OLDIN).
4. Organizatsiyasiz hujjat (`Debt`) → `organizationId` **null** (jimgina tashlash emas).
5. **Σ-invariant:** 7 chaqiruvli aralash stsenariy (2 kontragent × 2 valyuta, musbat/manfiy/nol) —
   `Σ(journal.deltaMinor)` per (counterparty, currency) **==** materiallashgan balans. Fake `tx`
   materiallashgan qiymatni **haqiqatda yig'adi** (mock-xulqiga assert qilinmaydi).

**Runtime-tasdiq (lokal `climart_adopt @ 5432`) — mock EMAS**
- Migratsiya `prisma db execute` bilan qo'llandi (bu DB `_prisma_migrations`-tracked emas, xotira:
  `climart-adopt-local-db-untracked`), so'ng `prisma migrate diff` bilan **drift 0** ekani tasdiqlandi;
  `prisma generate` qayta yugurtirildi.
- DB'dan o'qib tekshirildi: 9 ustun (`organization_id` NULLABLE), **3 indeks + pkey**, **3 FK**,
  `ROW COUNT = 0` (backfill yo'q).
- **Haqiqiy `applyDelta` round-trip** (real `PrismaClient`, real tranzaksiya, oxirida ataylab throw →
  rollback): 2 delta → 2 jurnal qatori (biri `organizationId` uuid bilan, biri `null`);
  `Σ(journal) = 100 000` **==** `Δ(materialized) = 500 000 → 600 000`; **rollbackdan keyin jurnal 0 qator**
  — ya'ni «bitta tranzaksiya» kafolati real DB'da ham ishlaydi (invariant hech qachon yarim qolmaydi).

**Gate (to'liq, jonli o'lchangan)**
- `pnpm --filter @moysklad/api typecheck` → **0 xato** · `pnpm --filter @moysklad/db typecheck` → **0**
- `pnpm lint:product` → **0 error** (731 warning — siyosat bo'yicha ruxsat)
- `pnpm --filter @moysklad/api exec vitest run` (BUTUN suite) → **384 fayl / 5103 test yashil, 0 yiqilgan** (1 skip)
- Faza 8'ning qamrov-guard testi (parallel sessiya commit qildi: `0ee9a8c1`) mening o'zgarishimdan keyin
  qayta yugurtirildi → **13/13 yashil** (yozuvchi FAYLLAR to'plami o'zgarmadi, faqat chaqiruv argumentlari).
- `i18n:gate` yugurtirilMADI — UI matni tegilmagan (API + sxema).
- **Browser-smoke YO'Q.**

**BACKFILL — javob: KERAK, lekin hujjat-replay bilan EMAS (Faza 10 boshida hal qilinadi)**
Jurnal bo'sh boshlandi ⇒ bugun **`Σ(journal) ≠ materialized`** (materiallashgan qiymatda butun tarix bor).
Shuning uchun Faza 10 o'quvchilarini jurnalga ko'chirishdan OLDIN backfill shart, aks holda akt-sverka
noldan boshlangan qoldiqni ko'rsatadi. Ikki variant:
- **(a) Hujjat-replay** (tarixiy hujjatlarni qayta o'qib delta yozish) — **TAVSIYA ETILMAYDI**: bu aynan
  `DUP-02` xatarini takrorlaydi (chala hujjat-ro'yxati → jimgina yo'qolgan/qo'shilgan saldo), va unpost
  qilingan/o'chirilgan hujjatlar tarixini aniq tiklash imkoni yo'q.
- **(b) «Opening snapshot»** — **TAVSIYA**: har mavjud `CounterpartyBalance` qatori uchun **bitta** jurnal
  qatori (`deltaMinor = balanceMinor`, `docType:'opening'`, `organizationId: null`). Σ-invariant
  **konstruksiya bo'yicha** aniq to'g'ri bo'ladi, ma'lumot yo'qolishi **nol**, tarixiy davr esa
  «taqsimlanmagan boshlang'ich qoldiq» sifatida ko'rinadi (buxgalteriyada normal amaliyot).
  **Bloker:** `docId` hozir NOT NULL `uuid` va opening qatorining hujjati yo'q ⇒ Faza 10'da yo ustun
  nullable qilinadi, yoki nol-uuid sentinel ishlatiladi. Bu — **Faza 10 ning birinchi qadami**.

**Qolgan qarz / DEFER**
- **O'quvchilar hali ko'chirilmagan** — bu faza faqat YOZUV tomoni. `counterparty.metrics` byOrg,
  `counterparty-statement`, `report/counterparty-act`, `recompute` skripti hamon o'z chala hujjat
  ro'yxatlaridan o'qiydi ⇒ `M-07`/`DUP-05/06/08` **hali OCHIQ** (Faza 10).
- **`docType` lug'ati kelishildi, lekin markazlashtirilmadi:** `invoiceOut/invoiceIn/paymentIn/paymentOut/
  cashIn/cashOut/prepayment/prepaymentReturn/adjustment/supply/debt/debtpayment/retailsale`. Faza 10'da
  bu to'plamni `counterparty-balance-sources.ts` (Faza 8) reyestri bilan **bitta konstantaga** birlashtirish
  kerak — hozir ikki joyda mustaqil ro'yxat bor (kichik dublikat, lekin DUP-15 klassining urug'i).
- **`docId` konventsiyasi bir joyda asimmetrik:** `debtpayment` uchun POS yo'li `batchId` (bir batch N
  qarzni to'laydi), debt-modul yo'li to'lov/qarz ID'si. `docType` bo'yicha guruhlash to'g'ri ishlaydi,
  lekin «docId → hujjat» yechimi Faza 10'da turga qarab bo'lishi kerak.
- **Jurnalning o'zi hali hech kim tomonidan O'QILMAYDI** ⇒ bu fazadan keyin yozuv xarajati bor (har
  applyDelta'ga +1 INSERT), foyda Faza 10'da keladi. Ataylab shunday (reja tartibi).
- **Prod (`sherset_v2`) migratsiyasi qo'llanMAGAN** — deploy-vaqtidagi ops-qadam; xotira
  `sherset-v2-schema-drift` bo'yicha bu DB'da drift tarixi bor, `migrate deploy` emas, qo'lda DDL kerak
  bo'lishi mumkin.
- **Browser-smoke YO'Q** — Phase-2 QA cohort'ga qoladi (kontragent kartochkasi + akt-sverka Faza 10'dan
  keyin birga tekshirilsa mantiqli).

**Commit:** `feat(counterparty-balance): faza 9 — CounterpartyBalanceEntry jurnal + majburiy applyDelta meta (DUP-15, M-07)`

---

## Faza 10 — 2026-08-08 — **Phase-1: strukturaviy + unit + real-DB-tasdiqlangan, browser-smoke YO'Q**
### 4 balans-o'quvchi jurnalga ko'chirildi (`M-07`, `DUP-05`, `DUP-06`, `DUP-08`)

**Da'volar tasdiqlandi (kodda, o'z ko'zim bilan — hammasi CONFIRMED).**
- **`M-07` / `DUP-05`** — `counterparty.service.ts:456-457` izohi «Σ(byOrg) === materiallashgan
  CounterpartyBalance … the cert asserts this invariant» deydi; `:510-525` esa 9 jadval groupBy'i
  (`supply`, `debt`, `debtpayment`, `retailsale` YO'Q). Izoh yolg'on edi.
- **`DUP-06`** — `counterparty-act.service.ts:70-71` docstring «closing balance equals the materialized
  balance when `to` is now» deydi; `:113-126` esa 8 turli QATTIQ ro'yxat (+adjustment).
- **`DUP-08`** — `statement-compute.util.ts:21-33` `StatementDocType` = 12 tur, `'debt'` va `'retailsale'`
  yo'q; servis `:179-183` debtPayment'ni oladi, debt-issue va POS qarz-tenderni olmaydi.

**ARXITEKTURA QARORI: saldo va yorliq AJRATILDI (bug-klassning ildizi shu edi)**
Ilgari bitta hujjat-turlari ro'yxati ikki ishni birdan qilardi: (a) qatorda qaysi hujjat KO'RINADI,
(b) saldoga nima QO'SHILADI. Shu sababli ro'yxatdan tushib qolgan tur — jimgina NOTO'G'RI SALDO berardi.
Endi:
- **SALDO** har doim jurnaldan (`counterparty-balance-journal.util.ts`), o'qish so'rovlarida `docType`
  filtri **UMUMAN YO'Q**, belgi ham qatorning o'zidan (`deltaMinor` ishorasi) keladi ⇒ yangi hujjat
  turi qo'shilganda 4 o'quvchida o'zgartiriladigan joy YO'Q;
- **YORLIQ** `counterparty-balance-doc-resolver.ts` dan (audit DUP-06 tavsiyasi: «bitta shared
  balance-doc-registry, N iste'molchi»). U yerda tur qo'shilmagan bo'lsa qator **raqamsiz** chiqadi —
  ya'ni ro'yxatni unutishning eng yomon oqibati endi «—» yorliq, ilgarigi «yo'qolgan saldo» emas.

**Yangi fayllar**
- `counterparty-balance/counterparty-balance-doc-types.ts` — 13 `docType` ning yagona reyestri +
  `OPENING_DOC_TYPE`. `ApplyDeltaMeta.docType` endi `string` emas, shu union ⇒ `'debtPayment'` va
  `'debtpayment'` kabi bir harfli farq compile-time'da tutiladi (aks holda jimgina yangi tur yaratib
  jurnal guruhlarini ikkiga bo'lardi). Typecheck 47 chaqiruv joyida **0 xato** berdi — reyestr aniq.
- `counterparty-balance/counterparty-balance-journal.util.ts` — `journalWhere()` (shakli testda
  qulflangan), `listJournalEntries()`, `sumJournalByOrganization()`, sof `foldJournalPeriod()`.
- `counterparty-balance/counterparty-balance-doc-resolver.ts` — docType→model xaritasi, tur bo'yicha
  BITTA `IN (…)` so'rovi (N+1 yo'q), `withItems` opsiyasi (tovar qatorlari faqat statement Excel'iga).
- `scripts/backfill-counterparty-balance-journal.ts` — «opening snapshot», DRY default, **idempotent**
  (mavjud jurnal yig'indisini hisobga olib faqat FARQNI yozadi).
- `counterparty-balance/balance-readers-invariant.test.ts` — 7 test, 4 o'quvchini birdan qamraydi.
- Migratsiya `20260808210000_counterparty_balance_entry_opening` — `doc_id` **NULLABLE** (Faza 9
  hisobotidagi bloker) + `(account, docType, createdAt)` indeksi.

**O'zgargan o'quvchilar**
1. **`counterparty.service.ts` metrics byOrg** — 9 jadval groupBy → bitta jurnal groupBy. `organizationId`
   endi `string | null`: null bandi «taqsimlanmagan» (Debt'da org o'lchovi yo'q, `RetailSale.organizationId`
   optional, `opening` org'siz). U **ataylab tashlanmaydi** — tashlansa Σ(byOrg) materiallashgandan farq qilardi.
2. **`report/counterparty-act.service.ts`** — 8 turli ro'yxat butunlay olib tashlandi. Qatorlar jurnaldan,
   debet/kredit `deltaMinor` ishorasidan. **Shartnoma filtri** jurnalda yo'q (delta shartnoma o'lchovini
   saqlamaydi) ⇒ u HUJJAT darajasida, resolverdan kelgan `contractId` bo'yicha qo'llanadi.
   **Davr filtri so'rovda EMAS**: qatorlar hujjatning O'Z sanasi (`moment`) bo'yicha kesiladi — `createdAt`
   filtri bo'lsa orqaga sanalgan hujjat (iyul sanasi, avgustda post qilingan) iyul aktidan jimgina tushib qolardi.
3. **`counterparty-statement.service.ts` aggregate** — 11 ta `findMany` → 1 jurnal + resolver.
   `statement-compute.util.ts` dagi `StatementDocType` union va `DEBIT_TYPES` to'plami **o'chirildi**;
   `RawDoc.sumMinor` (mutlaq) → `RawDoc.deltaMinor` (belgili). `DOC_TYPE_LABEL` endi `Record<string,string>`
   + `docTypeLabel()` fallback'i. **Buyum-bo'yicha** (productId) yo'li balans ko'rinishi EMAS, shuning uchun
   u doc-manbada qoldi (ishora endi chaqiruv joyida ochiq beriladi).
4. **`scripts/recompute-counterparty-balances.ts`** — nishon endi `Σ(jurnal)`. Hujjatlardan qayta-qurish
   **SAQLANDI, lekin faqat CROSS-CHECK** («hujjatlar X deydi, jurnal Y deydi») ⇒ Faza 8 ning qamrov-guardi
   ma'nosini saqlaydi, lekin uning xatosi endi ma'lumotni buza olmaydi.

**BACKFILL QO'RIQCHISI (o'zim qo'shdim — auditda yo'q, lekin halokat oldini oladi)**
Jurnal Faza 9 da bo'sh boshlangan. Backfillsiz `recompute` `APPLY=1` butun tarixiy saldoni **nolga
tushirardi** — bu aynan `DUP-02` halokati, faqat boshqa eshikdan. Shuning uchun skript materiallashgan
jadvalda bor-u jurnalda umuman ko'rinmagan kalitni topsa **to'xtaydi** va backfill buyrug'ini ko'rsatadi.
Lokal DB'da jonli tekshirildi: 3 kalit topildi → `exit 1`, hech narsa yozilmadi.

**TDD (qizil ko'rildi)**
`balance-readers-invariant.test.ts` avval yozildi → **3 yiqilgan / 7** (act va statement `TypeError:
Cannot read properties of undefined (reading 'in')` — ya'ni ular hamon doc-jadvallariga borardi;
metrics ham jurnalni o'qimasdi). Ko'chirishdan keyin **7/7 yashil**.

**Testlar (nima qulflandi)**
1. `journalWhere()` da `docType` kaliti YO'Q (chala-ro'yxat bug-klassining mexanik qulfi) va `createdAt` ham yo'q.
2. `organizationId: undefined` (filtrlamaslik) ≠ `null` (org'siz qatorlar).
3. `opening` qatori davrdan qat'i nazar boshlang'ich qoldiqqa tushadi (backfill BUGUN yozilgan bo'lsa ham).
4. **metrics**: `Σ(byOrg) == materiallashgan` + null-org bandi mavjud.
5. **akt**: har org uchun `closing == o'sha org jurnal yig'indisi`; `opening + debit − credit == closing`;
   `supply` qatori bor (ilgari 8-turli ro'yxatda YO'Q edi).
6. **statement**: `finalBalance == materiallashgan`; `debt` va `retailsale` qatorlari bor.
7. **recompute nishoni**: `Σ(jurnal) == materiallashgan`.

Aralash-hujjat stsenariysi: opening · invoiceOut · supply · paymentIn · invoiceIn · cashOut ·
adjustment · debt · debtpayment · retailsale · **cashOut unpost teskarisi** · **USD hujjat** (UZS
o'quvchilariga tushmasligi kerak).
`statement-compute.util.test.ts` yangi shartnomaga ko'chirildi va **noma'lum tur** testi qo'shildi
(«kelajakdagi-yangi-tur» qatorga tushadi va saldoga qo'shiladi).

**Runtime-tasdiq (lokal `climart_adopt @ 5432`) — mock EMAS**
- Migratsiya `prisma db execute` bilan qo'llandi, `prisma migrate diff` → **`counterparty_balance_entries`
  uchun drift 0** (fayldagi qolgan drift — bu DB'ning eski indeks-nom tarixi, bu fazaga aloqasi yo'q).
- DB'dan o'qildi: `doc_id` **NULLABLE**, 4 indeks + pkey.
- **Haqiqiy tranzaksiya** (real `PrismaClient`, oxirida ataylab throw → rollback): opening (`docId: NULL`)
  + 2 delta → `Σ(jurnal byOrg) = 680 000` **==** materiallashgan `680 000`; org bandlari
  `org=300 000 · NULL=380 000`; **rollbackdan keyin jurnal 0 qator**.
- `backfill…` DRY: «3 materiallashgan qator | opening yoziladi: 2» — yozilmadi.
- `recompute` DRY: cross-check 2 farqni ko'rsatdi va backfill-guard `exit 1` qildi (kutilgan xulq).

**Gate (to'liq, jonli o'lchangan)**
- `pnpm --filter @moysklad/api typecheck` → **0** · `@moysklad/db` → **0** · `@moysklad/web` → **0**
- `pnpm lint:product` → **0 error** (738 warning — siyosat bo'yicha ruxsat)
- `pnpm --filter @moysklad/api exec vitest run` (BUTUN suite) → **385 fayl / 5107 test yashil** (1 fayl,
  2 test skip)
- `pnpm --filter @moysklad/web exec vitest run` → **183 fayl / 2745 test yashil** (26 skip)
- `pnpm i18n:gate` → **o'tdi** (12 281 kalit tekshirildi) — UI matni tegilgan (akt doc_types ru+uz)
- **Browser-smoke YO'Q.**

**Qolgan qarz / DEFER**
- **BACKFILL HALI YUGURTIRILMAGAN** (na lokal, na prod). Bu — **ops qadami**, kod emas: `APPLY=1` bilan
  yugurtirilmaguncha akt-sverka/metrics tarixiy qoldiqni ko'rsatmaydi (faqat Faza 9 dan keyingi deltalarni).
  Tartib: (1) `backfill… APPLY=1` → (2) `recompute…` DRY bilan tasdiqla → (3) kerak bo'lsa `recompute APPLY=1`.
  **Foydalanuvchi qaroriga qoldirildi** (reja §6: ma'lumot yozadigan skriptni o'zim yugurtirmayman).
- **Prod (`sherset_v2`) migratsiyasi qo'llanMAGAN** — `doc_id` NOT NULL cheklovini olib tashlash kerak;
  xotira `sherset-v2-schema-drift` bo'yicha bu DB'da qo'lda DDL kerak bo'lishi mumkin.
- **Statement valyuta filtri xulqni O'ZGARTIRDI**: ilgari `aggregate()` valyuta bo'yicha umuman
  filtrlamasdi, ya'ni dollarlik hujjat so'mlik running-balansga qo'shilib ketardi (hujjatlanmagan
  mavjud xato). Endi `UZS` bilan cheklangan — Excel sarlavhasi va `CounterpartyStatement.currency`
  allaqachon `'UZS'` edi. **Ko'p valyutali akt** — alohida ish (DEFER).
- **`opening` qatori org'siz** ⇒ backfilldan OLDINGI tarix org-kesimida «taqsimlanmagan» bandiga
  tushadi. Ataylab: materiallashgan jadvalda ham org o'lchovi YO'Q edi (aynan `DUP-15`), org-taqsimotni
  o'ylab topish = ma'lumot yasash bo'lardi.
- **`debtpayment` docId asimmetriyasi** (Faza 9 dan qolgan) — resolverda **hal qilindi** (ketma-ket
  `DebtPayment.id` → `batchId` → `Debt.id`), lekin yozuv tomonidagi asimmetriya o'zi qoldi.
- **Akt `typeKey` endi yopiq union EMAS** — FE'da tarjimasiz tur kelsa turning o'zi ko'rsatiladi
  (`ACT_DOC_TYPES` to'plami + fallback). Eski `counterpartyAdjustment` i18n kaliti qoldirildi
  (yangi qiymat — `adjustment`); tozalash — mayda qarz.
- **`DUP-03` (debt.remove reversal yo'q) hamon OCHIQ** — Faza 12. Jurnal buni sodiqlik bilan aks
  ettiradi (o'chirilgan qarzning +delta'si daftarda turibdi), ya'ni o'quvchilar «to'g'ri noto'g'ri»ni
  ko'rsatadi. Faza 12 reversal qo'shganda jurnal o'z-o'zidan tuzaladi.
- **Browser-smoke YO'Q** — kontragent kartochkasi «Показатели» tab + akt-sverka chop etish + akt-sverka
  Excel Phase-2 QA cohort'ga qoladi.

**Commit:** `dfea0d0b` — `fix(counterparty-balance): faza 10 — 4 balans-o'quvchi jurnaldan o'qiydi (M-07, DUP-05/06/08)`

---

## Faza 11 — Ledger-teshiklar: Payment→OrganizationAccount + POS-qarz→CashDesk

**Sana:** 2026-08-08 · **ID'lar:** `M-06` (HIGH), `M-05` (HIGH→MEDIUM), `FE-03` (HIGH→MEDIUM)
**Commit:** `de77953e` — `fix(money): faza 11 — Payment→OrganizationAccount + qarz-naqd→CashDesk`

### Da'volarni kodda tasdiqlash (reja §2)

| ID | Da'vo | Kodda holat |
|----|-------|-------------|
| `M-06` | PaymentIn/Out `MoneyService`ga umuman tegmaydi | ✅ **TASDIQLANDI** — ikkala servisda `MoneyService` importi ham yo'q edi; `post()` faqat `balance.applyDelta` + `applyPayment`. `money-operation.service.ts:7-9` docstring'i esa «union of CashIn/CashOut/**PaymentIn/PaymentOut**» deb va'da berardi. |
| `M-05` | POS qarz-to'lovi kassa daftariga yozilmaydi | ✅ **QISMAN** — `CashDesk.balanceMinor` + `MoneyOperation` haqiqatan yozilmasdi. **LEKIN** auditning «smena soxta ortiqcha chiqadi» qismi TO'G'RI EMAS: `cashier-session.service.ts:315` naqd qarz to'lovlarini `debtPayment` jadvalidan to'g'ridan-to'g'ri qo'shadi (kassa TZ §8.4). Ya'ni **smena hisobi allaqachon to'g'ri edi**; haqiqiy teshik — kassa qoldig'i va `/money` lentasi. |
| `FE-03` | `/money` bank to'lovlarini ko'rsatmaydi, «+ Yaratish» esa taklif qiladi | ✅ **TASDIQLANDI** — `LedgerKind = 'cash_in' \| 'cash_out' \| 'retailsale'`, `NEW_ROUTES` esa `paymentin`/`paymentout`ni ko'rsatardi. |

### Dizayn qarori (reja «Diqqat» bandiga javob)

Reja ikki variantni ko'rsatgan edi: (a) balansni yozdirish, (b) `OrganizationAccount.balanceMinor`ni
umuman olib tashlash. **(a) tanlandi** — UI bank-balansni ko'rsatadi (`organization-account.service`
har `find*` da qaytaradi; `organization.service` tashkilot kartochkasida chiqaradi; hisob o'chirishda
`balanceMinor !== 0n` guard'i bor). Balansni olib tashlash uch o'quvchini va bir guard'ni buzardi.

**Ikkinchi qaror — overdraft qo'riqchisi bank hisobida O'CHIRILDI** (`MoneyDelta.allowNegative`, faqat
to'lov chaqiruv-joylarida `true`). Sabab: `OrganizationAccount.balanceMinor` hech qachon
materiallashtirilmagan, ya'ni saqlangan `0` = «hech qachon o'lchanmagan», «pul yo'q» EMAS. Faza 2
qo'riqchisini shu yerda qo'llash **har birinchi bank to'lovini soxta 400 bilan rad etardi** (prodda
barcha hisoblar 0). Bank hisobi qonuniy ravishda minusga ham tushadi (overdraft/kredit liniyasi) —
kassa tortmasi esa hech qachon. **Kassa tomonida qo'riqchi tegilmagan.** Ochilish qoldiqlari
kiritilgach (bank-vypiska importi) bayroqni olib tashlash mumkin.

### O'zgarishlar

**BE — bank tomoni (`M-06`)**
- `money/money.service.ts` — `MoneyDelta.allowNegative?: boolean` (har delta uchun opt-in, servis-keng
  kalit EMAS) + ikkala overdraft tekshiruvi shuni hisobga oladi. Nega kerakligi docstring'da.
- `payment-in/payment-in.service.ts` · `payment-out/payment-out.service.ts` — `MoneyService` inyeksiyasi
  (cash-in/out bilan bir xil pozitsiyada: `prisma, targets, money, balance, …`) + `bankDeltas()` private
  helper (hujjatda `organizationAccountId` bo'lmasa `[]` — `applyDeltas([])` no-op, shuning uchun har
  chaqiruv-joy shartsiz uzatadi) + 3 chaqiruv-joy: post `±sumMinor`, unpost/cancel teskari
  (cancel faqat `applicable` bo'lsa). `documentKind`: `payment_in` / `payment_out`.
- `payment-in.module.ts` · `payment-out.module.ts` · `debt.module.ts` — `MoneyModule` importi.

**BE — kassa tomoni (`M-05`)**
- **Yangi** `debt/debt-cash-ledger.ts` — YAGONA predikat: `method === 'cash' && cashDeskId != null`
  ⇒ yashiq harakati. Jismoniy summa = `amountOriginalMinor ?? amountMinor` `currency`da (sxema:
  `amountMinor` HAR DOIM qarz valyutasida, `currency`/`amountOriginalMinor` — mijoz bergan asl pul).
  Yana: `debtLedgerDocumentId()` (POS'da `batchId`, qolganda `payment.id`) va
  `debtCashLedgerWasWritten()` (migratsiya-qo'riqchisi, pastda).
- `debt/pos-debt-payment.service.ts` — tx ICHIDA, allokatsiyalardan keyin **BIR** delta (`+appliedMinor`,
  `documentId = batchId`): bitta jismoniy to'lov = bitta yashiq harakati, FIFO nechta qarzga bo'lganidan
  qat'i nazar.
- `debt/debt.service.ts` — (1) `addCashPayment` ham yozadi (**auditning `files:` ro'yxatidan TASHQARI,
  ataylab** — bu AYNAN o'sha jismoniy hodisa: kassir `cashDeskId` bilan naqd oladi; qoldirilsa storno
  predikati hech qachon kreditlanmagan yashiqni debetlardi); (2) yangi private
  `reverseCashDeskDelta()` — IKKALA storno yo'li (`reversePayment`, `cancelCallNote`) shundan o'tadi.

**Migratsiya-qo'riqchisi (o'zim topgan, rejada yo'q edi)**
Storno teskari harakatni FAQAT daftarda mos kredit BO'LSA yozadi. Prod bazada Faza 11'gacha yozilgan
naqd qarz to'lovlari bor; ularning birini bugun qaytarsak, hech qachon kirmagan pulni yashiqdan
chiqarardik — qoldiq noto'g'ri kamayardi, yomon holatda **overdraft qo'riqchisi stornoning O'ZINI
400 bilan bloklardi** (operator xato to'lovni qaytara olmay qolardi). Tekshiruv daftarning o'zidan
o'qiydi — sana yoki migratsiya bayrog'i kerak emas.

**FE (`FE-03`)**
- `money/page.tsx` — `LedgerKind` +3 tur; `KIND_ROUTES` (`payment_in→/payments-in`,
  `payment_out→/payments-out`, `debtpayment→/print/debt-payment` — PKO chek sahifasi, `batchId` bo'yicha
  yagona mavjud hujjat ko'rinishi); **tur-filtri endi `KIND_ROUTES`dan HOSILA** (qo'lda sanalgan 3
  `<option>` aynan shu drift-klassining yashirin manbai edi); **badge toni slug o'rniga delta
  ISHORASIDAN** (`documentKind.endsWith('in')` unpost qatorida ham, `debtpayment`da ham noto'g'ri edi).
- `messages/{ru,uz}.json` — `pages.money.kinds`: `payment_in` «Входящий платёж» / «Kiruvchi to'lov»,
  `payment_out` «Исходящий платёж» / «Chiquvchi to'lov», `debtpayment` «Оплата долга» / «Qarz to'lovi».
  **Grounding (§4):** RU qiymatlar repo ichidagi parity-baseline'dan — `pages.payments_in.title`
  «Входящие платежи» / `pages.payments_out.title` «Исходящие платежи» (kolonka-badge uchun birlik shakl);
  `debtpayment` — MoySklad'da yo'q (bizning modul), `pages.debts` lug'atidan.
- `money-operation.schema.ts` — filtr enum +3 (yozuvchisiz slug qo'shilmasin degan izoh bilan).

### Testlar (TDD — avval yiqildi, keyin yashil)

| Fayl | Test | Nimani ushlaydi |
|------|------|-----------------|
| **yangi** `shared/payment-org-account-ledger.test.ts` | 10 | PaymentIn/Out post/unpost/cancel deltalari, `net == 0`, draft-cancel harakatsiz, hisobsiz hujjat ⇒ qator yo'q, `allowNegative` |
| **yangi** `debt/debt-cash-ledger.test.ts` | 8 | predikat: naqd+kassa / terminal / karta / kassasiz / 0-summa / valyuta / storno ishorasi / `allowNegative` yo'qligi |
| **yangi** `debt/debt-cash-ledger.service.test.ts` | 9 | `addCashPayment` yozuvi · `reversePayment` + `cancelCallNote` stornosi · **legacy qator ⇒ harakatsiz** · **POS stornosi `batchId` ostida** |
| `debt/pos-debt-payment.service.test.ts` | +4 | POS naqd bir marta · N qarzga bo'lingan to'lov ham BIR harakat · terminal/kassasiz ⇒ yo'q |
| `web/money-kind-contract.test.ts` | +1, skan 3→6 fayl | yozuvchi⊆enum==KIND_ROUTES⊆i18n zanjiri yangi 3 turni qamraydi + `<option>` qo'lda sanalmasligi |

**Non-vacuous:** tuzatishdan oldingi kodda har «delta bor» assert'i BO'SH massiv ko'radi
(`applyDeltas` umuman chaqirilmasdi). Legacy-qo'riqchi testi qo'riqchisiz `1` qator ko'radi.
Konstruktor pozitsiyalari o'zgargani uchun `money-transition-race.test.ts`, `payment-out.service.test.ts`,
`debt-bulk-reminder.test.ts` yangilandi (xulq o'zgarmagan).

### Gate (jonli o'lchangan)
- `pnpm --filter @moysklad/api typecheck` → **0** · `@moysklad/web typecheck` → **0**
- `pnpm lint:product` → **0 error** (738 warning — siyosat bo'yicha ruxsat)
- `pnpm i18n:gate` → **o'tdi** (12 278 kalit)
- `pnpm --filter @moysklad/api exec vitest run` → **388 fayl / 5138 test yashil** (1 fayl, 2 test skip)
- `pnpm --filter @moysklad/web exec vitest run` → **183 fayl / 2746 test yashil** (26 skip)
- **Browser-smoke YO'Q.**

### Qolgan qarz / DEFER
- 🔴 **BACKFILL YO'Q — daftar BUGUNDAN boshlanadi.** Faza 11'gacha post qilingan bank to'lovlari va naqd
  qarz to'lovlari `MoneyOperation`da yo'q; `/money` va bank-balans faqat yangi hujjatlarni ko'rsatadi.
  Faza 9/10 backfill'idan farqli, bu yerda **manba-hujjatlardan qayta qurish MUMKIN** (posted
  PaymentIn/Out + `deletedAt: null` DebtPayment) — lekin ochilish qoldig'i noma'lum bo'lgani uchun
  natija «harakatlar yig'indisi» bo'ladi, absolyut qoldiq emas. **Alohida ops-fazasi** (skript + `APPLY=1`).
- **`allowNegative` bank hisobida** — vaqtinchalik. Ochilish qoldiqlari kiritilgach olib tashlansin.
- **Valyuta mos kelmasligi endi 400 beradi:** bank hisobi/kassa valyutasi to'lov valyutasidan farq qilsa
  `MoneyService` rad etadi (ilgari bu yo'llarda umuman tekshiruv yo'q edi). Bu — to'g'ri xulq (`M-04`
  bilan bir intizom), lekin **xulq o'zgarishi**: ko'p valyutali tenant'da USD to'lovni UZS hisobiga
  yozib bo'lmaydi. POS web-klienti `currency` yubormaydi (tekshirildi:
  `debt-payment-dialog.tsx:136`), shuning uchun POS oqimida risk yo'q.
- **`addCashPayment` to'lovida `batchId` YO'Q** ⇒ `/money`dagi «Ochish» havolasi
  `/print/debt-payment/<paymentId>` PKO chekini topa olmaydi (POS to'lovlarida ishlaydi). Yechim —
  kassir to'loviga ham `batchId` berish; **mayda qarz**.
- **POS `input.currency`** hamon konvertatsiyasiz: berilsa `amountMinor` qarz valyutasida qolib,
  qator boshqa valyuta yorlig'ini oladi (Faza 11'gacha ham shunday edi). Endi bu MoneyService valyuta
  guard'ida 400 bo'lib **ko'rinadi** — jimgina buzilish o'rniga. Alohida ish.
- **Browser-smoke YO'Q** — `/money` lentasida bank to'lovi + PKO qarz to'lovi qatorlari, «Ochish»
  havolalari, tur-filtri va In/Out/Net jamilar Phase-2 QA cohort'iga qoladi.

---

## Faza 12 — Debt simmetriyasi: remove-reversal + settlement filtr/premise

**Sana:** 2026-08-08 · **ID'lar:** `DUP-03` (HIGH), `DUP-12` (MEDIUM), `DUP-04` (HIGH→MEDIUM)

### Da'volarni kodda tasdiqlash (reja §2)

| ID | Da'vo | Kodda holat |
|----|-------|-------------|
| `DUP-03` | `debt.remove()` create'ning `+totalMinor` deltasini qaytarmaydi | ✅ **TASDIQLANDI** — `debt.service.ts:2000-2010` (tuzatishdan oldingi raqamlash): `mustFind` → `paidMinor > 0` taqiqi → `debt.update({ deletedAt })`. Butun metod tanasi shu, `applyDelta` chaqirig'i yo'q. `create()` (:616) esa `applyDelta(+totalMinor, { docType: 'debt' })` yozadi. |
| `DUP-12` | settlement debt-so'rovi `deletedAt`/`status` filtrsiz | ✅ **TASDIQLANDI** — `counterparty-settlement.service.ts:43-46` `where: { accountId, counterpartyId }` — boshqa hech narsa. Qiyos: `DebtService` ro'yxatlari (`:286`, `:438`) va `pos-debt-payment.service.ts:288` `deletedAt: null` + `status notIn` ishlatadi. |
| `DUP-04` | `combinedMinor` premisesi eskirgan → ikki marta sanaydi | ✅ **TASDIQLANDI** — util docstring'i «`DebtService.create` balansga umuman tegmaydi» derdi, `create` esa 2026-08-05 dan beri yozadi; `:112` `combined = ledger + registry` ⇒ ochiq QRZ- qarz 2×. **Jonli iste'molchi YO'Q** (grep: statement faqat `ledgerBalanceMinor` + `debtRegistryOutstandingMinor` ni oladi) — ya'ni bugungi hisobotlarda soxta son CHIQMAGAN, xavf kelajak iste'molchida edi. |

**Reja doirasidan tashqari, o'zim topgan bog'liqlik:** Faza 8 ataylab
`counterparty-balance-sources.test.ts` ga **premise-guard** qo'yib ketgan edi («`remove()` da
`applyDelta` YO'Q») va `recompute-counterparty-balances.ts` ning debt-issue manbasi aynan shu
premise'ga tayanib o'chirilgan qarzlarni ham qo'shardi. Reversal qo'shilgach guard yiqildi —
**bu kutilgan hodisa, avvalgi faza uni yozib qoldirgan**; ikkala tomon shu fazada birga yangilandi.

### O'zgarishlar

**`DUP-03` — `debt/debt.service.ts` `remove()`**
- Endi `$transaction` ichida: **atomik claim** `updateMany({ where: { id, accountId, deletedAt: null,
  paidMinor: 0n }, data: { deletedAt } })` → `count === 0` bo'lsa sabab qayta o'qiladi
  (`paidMinor > 0` ⇒ 403, aks holda 404), keyin `applyDelta(-debt.totalMinor,
  { docType: 'debt', docId: id, organizationId: null })`.
- Claim'dagi ikki shart ATAYLAB: `deletedAt: null` — ikki parallel o'chirish ikki reversal yozmasin;
  `paidMinor: 0n` — `mustFind` bilan yozuv orasiga tushgan to'lov `−total` reversalini yo'l qo'ymasin
  (aks holda saldo `−paid` ga tushib ketardi). `paidMinor > 0` taqiqlangani uchun reversal to'liq
  `−totalMinor`: to'lovi bor qarz umuman o'chmaydi, ya'ni `−paid` deltalarini hisoblash kerak emas.

**`DUP-12` — `counterparty-settlement/counterparty-settlement.service.ts`**
- `debt.findMany` where'iga `deletedAt: null, status: { not: 'cancelled' }`.
  ⚠️ `'cancelled'` bugun `DebtStatusSchema` (`unpaid|partial|paid`) da YO'Q — filtr `pos-debt-payment`
  (`status: { notIn: ['paid','cancelled'] }`) bilan **parity uchun** qo'shildi (ustun `VarChar(20)`,
  enum emas). `'paid'` ataylab CHIQARILMAYDI — servis docstring'i tushuntirganidek qoldiq
  `total−paid` dan hisoblanadi (status-drift'ga bardosh).

**`DUP-04` — `counterparty-settlement/counterparty-settlement.util.ts`**
- `combinedMinor` maydoni **BUTUNLAY OLIB TASHLANDI** (deprecate emas — jonli iste'molchisi yo'q edi,
  qolgan taqdirda «egasi konvensiyani tanladi» deb yoqilishi mumkin bo'lgan tuzoq bo'lib qolardi).
- Modul docstring'i yangi haqiqatga ko'chirildi: QRZ- qarz bosh daftarga to'liq tushadi
  (`create +total` · to'lov `−paid` · o'chirish `−total`), ya'ni `debtRegistryOutstandingMinor` —
  saldoning **TARKIBI** («shundan …»), qo'shiluvchi emas. Tarixiy ogohlantirish qoldirildi:
  2026-08-05 dan OLDIN ochilgan qarz daftarga tushmagan bo'lishi mumkin (prodda o'sha kuni 0 qarz /
  0 to'lov bo'lgani tekshirilgan — xotira `debt-ledger-asymmetry`).
- Premiseni takrorlagan ikki izoh ham tuzatildi: `retail-sale.service.ts:837` («reyestrning `create`
  yo'li balansga tegmaydi» → «AYNAN shu balansga `+total` yozadi») va
  `counterparty-statement/supply-goods-xlsx.util.ts:208` («alohida» → «tarkib»).

**Bog'liqlik (Faza 8 guard'i)**
- `scripts/recompute-counterparty-balances.ts` — debt-issue `groupBy` where'i endi `deletedAt: null`
  (hujjat cross-checki reversal bilan mos bo'lsin; Faza 10'dan keyin bu blok faqat **cross-check**,
  hech narsa yozmaydi — shuning uchun ma'lumot xavfi yo'q edi).
- `scripts/counterparty-balance-sources.test.ts` — premise-test **teskarisiga aylantirildi**: endi
  `remove()` da `applyDelta(-debt.totalMinor)` BORLIGI **va** skript filtri BIRGA qulflanadi (biri
  o'zgarib ikkinchisi qolib ketsa yiqiladi).

### Testlar (TDD — avval yiqildi, keyin yashil)

| Fayl | Test | Nimani ushlaydi |
|------|------|-----------------|
| **yangi** `debt/debt-remove-reversal.test.ts` | 5 | create→remove saldo **aynan 0** · reversal `docType:'debt'` havolasi · **ikki parallel o'chirish ⇒ BIR reversal** (ikkinchisi 404) · to'lovli qarz 403 + daftar tegilmagan · **TOCTOU**: o'qish bilan yozuv orasiga tushgan to'lov o'chirishni to'xtatadi |
| **yangi** `counterparty-settlement/counterparty-settlement.service.test.ts` | 3 | korzinadagi qarz reyestr qoldig'ida yo'q · `cancelled` yo'q · tirik `paid` qarz qoldiqni shishirmaydi |
| `counterparty-settlement.util.test.ts` | −2 assert, +1 test | reyestr qoldig'i saldo ICHIDA; `combinedMinor` **umuman berilmaydi** (`Object.keys` bilan) |
| `scripts/counterparty-balance-sources.test.ts` | 1 (qayta yozildi) | reversal ↔ skript `deletedAt` filtri juftligi |

**Non-vacuous (jonli o'lchangan):** tuzatishdan oldingi kodda 7 assert yiqildi — saldo `500000n` (0
o'rniga), reversal delta `undefined`, parallel o'chirishda 0 rad, settlement qoldig'i `50000n`/`65000n`
(`20000n`/`15000n` o'rniga), `combinedMinor` kalit ro'yxatida bor.

⚠️ **Bir yolg'on-yashil tutildi:** skript-guard testining birinchi tahriri `deletedAt: null` ni butun
**blok matnidan** (izohlar bilan birga) qidirgani uchun tuzatishdan OLDIN ham yashil chiqdi — regex
kodni emas, izohdagi so'zni tutdi (CLAUDE.md §4 grep-grounding klassi). Assert `groupBy` chaqirig'ining
tanasiga bog'landi va shundan keyingina haqiqiy RED ko'rindi.

### Gate (jonli o'lchangan)
- `pnpm --filter @moysklad/api typecheck` → **0**
- `pnpm lint:product` → **0 error** (738 warning — siyosat bo'yicha ruxsat)
- `pnpm --filter @moysklad/api exec vitest run` → **390 fayl / 5147 test yashil** (1 fayl, 2 test skip)
- `pnpm i18n:gate` — **yugurtirilmadi**: UI-matn tegilmagan (faqat BE + izohlar), web o'zgarishi yo'q.
- **Browser-smoke YO'Q.**

### Qolgan qarz / DEFER
- **Restore (korzinadan qaytarish) yo'li YO'Q** — reja «restore bo'lsa +total» degan edi; kodda
  `DebtService`da ham, kontrollerda ham restore endpoint'i mavjud emas (grep bilan tekshirildi),
  shuning uchun hech narsa qo'shilmadi. Kelajakda restore qo'shilsa `+debt.totalMinor` yozishi SHART —
  `remove()` docstring'ida qayd etilgan.
- **Tarixiy ma'lumot:** Faza 12'gacha o'chirilgan qarzlar daftarda `+total` bo'lib qolgan (reversal
  o'sha paytda yo'q edi). Ular endi cross-check'dan chiqdi, lekin **materiallashgan saldoda hamon
  turibdi** — tuzatish yo'li: `backfill-counterparty-balance-journal.ts` + `recompute` (Faza 10 ops-qadam,
  `APPLY=1` hali yugurtirilmagan). Prodda hajm noma'lum — DRY yugurtirib ko'rish kerak.
- **`status: { not: 'cancelled' }`** — mavjud bo'lmagan statusga qarshi mudofaa. `Debt`ga haqiqiy
  bekor-qilish oqimi qo'shilsa, `computeSettlement` va POS FIFO filtrlari bir vaqtda ko'rib chiqilsin.
- **Browser-smoke YO'Q** — qarz kartochkasini o'chirish → kontragent «Balans» kartasi 0 ga tushishi va
  «Qabul tovarlari» xlsx'dagi «shundan …» qatori Phase-2 QA cohort'iga qoladi.

---

## Faza 13 — Taminotchi qarzi: PurchaseReturn reversal + double-debt → SUPPLY-ONLY

**Sana:** 2026-08-08 · **ID'lar:** `PP-02` (HIGH), `PP-03` (HIGH) · **QAROR-B:** Supply-only (egasi tanlagan)

### Da'volarni kodda tasdiqlash (reja §2)

| ID | Da'vo | Kodda holat |
|----|-------|-------------|
| `PP-03` | `Supply.post` HAM, `InvoiceIn.post` HAM `-sumMinor` yozadi ⇒ bitta xaridda qarz 2× | ✅ **TASDIQLANDI** — `supply.service.ts:1349` `applyDelta(..., -existing.sumMinor, { source:'invoiceIn', docType:'supply' })` va `invoice-in.service.ts:1146` `applyDelta(..., -existing.sumMinor, { docType:'invoiceIn' })` (tuzatishdan oldingi raqamlash). Ikkalasi ham `applicable` gate'i ostida, dedup yo'q. Qo'shimcha: `InvoiceIn.update()` da yana IKKI chaqiruv (reversal :749 + qayta-qo'llash :790) — reja ularni nomlab ko'rsatmagan edi, ular ham olib tashlandi. |
| `PP-02` | `PurchaseReturn.post` kontragent balansini tuzatmaydi | ✅ **TASDIQLANDI** — `purchase-return.service.ts` da `CounterpartyBalanceService` **import ham qilinmagan** edi; post/unpost/cancel faqat `stock.applyDeltas` + PO kaskadi + audit. |

**Reja doirasidan tashqari, o'zim topgan bog'liqliklar (hammasi shu fazada yopildi):**
1. **`counterparty-statement` BUYUM-kesimi** hamon `invoiceIn`ni qarz-manba deb sanardi
   (`-1n`, supply bilan yonma-yon) — ya'ni bitta tovar bo'yicha ham xarid 2× chiqardi.
2. **Qamrov reyestri** (`counterparty-balance-sources.ts`) — `invoice-in` yozuvchi bo'lib qolsa
   «ESKIRGAN yozuv» qo'riqchisi gate'ni yiqitardi (yiqitdi ham), `purchase-return` esa yangi yozuvchi
   sifatida «QAMROVSIZ» bo'lib qolardi.
3. **`money-transition-race.test.ts`** invoice-in poygasini AYNAN `balance.applyDelta` soni bilan
   o'lchardi — delta olib tashlangach test bo'shab qolardi (yiqildi ham).
4. **Akt-sverka chop etish sahifasi** (`print/reconciliation-act`) `docType` yorliqlarini oq ro'yxatdan
   oladi — `purchaseReturn` qo'shilmasa qator xom slug bilan chiqardi.

### O'zgarishlar

**(a) `PP-03` — `invoice-in/invoice-in.service.ts`: balansdan UZILDI**
- **4 ta** `balance.applyDelta` chaqirig'i olib tashlandi: `post` (−sum), `unpost` (+sum),
  `cancel` (+sum, `wasApplicable` ostida) va `update()` dagi juftlik (eski `−`ni qaytarish +
  yangisini qo'llash). `CounterpartyBalanceService` **import va inject'i ham** olib tashlandi
  (qamrov-skaneri fayl bo'yicha ishlaydi; o'lik inject qolsa skaner/o'quvchini chalg'itardi).
- `invoice-in.module.ts` dan `CounterpartyBalanceModule` chiqarildi (sababi izohda).
- Sinf docstring'i yozildi: hujjat endi **informatsion/rasmiy** — PO `invoicedSumMinor`,
  `PaymentOut` uchun asos va o'z `payedSum` FSM'i saqlanadi, balans esa YO'Q.
- ⚠️ **Yon ta'sir (ataylab):** InvoiceIn post qilinganda egaga ketadigan «qarz o'zgardi» Telegram
  xabari (`source: 'invoiceIn'` → `counterparty-debt-notifier`) endi CHIQMAYDI. Xabarni Qabul
  (`Supply.post`, o'sha `source` bilan) beradi — ya'ni bitta xaridda bitta xabar, ikkita emas.

**(b) `PP-02` — `purchase-return/purchase-return.service.ts`: simmetriya qo'shildi**
- `post()` → `applyDelta(+existing.sumMinor, { docType:'purchaseReturn', docId, organizationId })`;
  `unpost()` va `cancel()` (faqat `wasApplicable`) → `-existing.sumMinor`.
- `source` ATAYLAB berilmadi: u faqat egaga «yangi qarz» xabari uchun, qarz KAMAYISHI bunday xabar
  chiqarmaydi (notifier `source: undefined` da no-op).
- ⚠️ **Ikki o'lchov ataylab har xil** va docstring'da yozib qo'yildi: zaxira tomoni tannarxda
  (weighted-average, `p.costMinor`), balans tomoni **hujjat summasida** (`sumMinor`) — chunki
  taminotchiga qaytariladigan pul shartnoma narxi, tannarx emas.
- `purchase-return.module.ts` ga `CounterpartyBalanceModule`.

**(c) Jurnal reyestri va o'quvchilar (Faza 10 bilan izchillik)**
- `counterparty-balance-doc-types.ts` — yangi tur **`purchaseReturn`**. `invoiceIn` reyestrda
  **QOLDIRILDI** (o'chirilmadi): Faza 13'gacha yozilgan jurnal qatorlari shu satr bilan saqlangan,
  o'chirilsa akt/statement qatorlari hujjat raqamisiz yetim qolardi. Izohda «TARIXIY — hech kim
  yozmaydi» deb belgilandi.
- `counterparty-balance-doc-resolver.ts` — `GOODS_TYPES` ga `purchaseReturn` (docType = Prisma
  delegat nomi, sikl `client[t]` bilan indekslaydi) + `BalanceDocClient` ga maydon.
- `counterparty-statement/statement-compute.util.ts` — `DOC_TYPE_LABEL.purchaseReturn`.
- `counterparty-statement.service.ts` — **BUYUM-kesimi** ro'yxatidan `invoiceIn` chiqarildi,
  `purchaseReturn` (+1n) qo'shildi. Endi u jurnal-manbali kesim bilan bir xil semantikada.
- **Metrics / statement / akt saldosi** o'zgartirilmadi va o'zgartirilishi ham SHART EMAS —
  Faza 10 dan beri ular jurnalni `docType` bo'yicha FILTRLAMASDAN o'qiydi (`balance-readers-invariant`
  testi buni qulflaydi). Reja «Diqqat» bandidagi xavf shu sababdan yuzaga kelmadi.
- `apps/web/.../print/reconciliation-act/page.tsx` + `ru.json`/`uz.json` — `purchaseReturn` yorlig'i
  («Возврат поставщику» / «Ta'minlovchiga qaytarish» — repodagi mavjud tarjimalar bilan bir xil).

**(d) Rekonstruksiya skripti (`scripts/recompute-counterparty-balances.ts`)**
- `fixed` ro'yxatidan `prisma.invoiceIn` (−1n) **chiqarildi**, `prisma.purchaseReturn` (**+1n**)
  qo'shildi; sarlavhadagi formula ham yangilandi.
- ⚠️ Bu faqat **CROSS-CHECK** (Faza 10 dan beri skript nishoni — jurnal). Tarixiy `invoiceIn`
  qatorlari jurnalda qolgani uchun o'sha kontragentlarda cross-check farq ko'rsatadi — bu
  **KUTILGAN**, izohda yozib qo'yilgan.
- `scripts/counterparty-balance-sources.ts` — `invoice-in` yozuvi **olib tashlandi** (o'rniga sababni
  tushuntiruvchi izoh), `purchase-return` **qo'shildi**. Bonus: Faza 12 dan keyin eskirib qolgan
  `debt.service.ts` izohi («remove() reversal YOZMAYDI») haqiqatga moslandi.

### Testlar (TDD — avval yiqildi, keyin yashil)

| Fayl | Test | Nimani ushlaydi |
|------|------|-----------------|
| **yangi** `purchase-return/supplier-debt-supply-only.test.ts` | 9 | Uchala servis (Qabul · Hisob-faktura · Qaytarish) BITTA soxta prisma va BITTA daftar ustida: InvoiceIn post daftarga tegmaydi · PO kaskadi baribir ishlaydi · post→unpost izsiz · **PO→Supply+InvoiceIn ⇒ FAQAT `[-4 000 000, docType:'supply']`** · to'liq qaytarish ⇒ **aynan 0** · reversal `docType:'purchaseReturn'` havolasi · unpost/cancel teskarisi · draft cancel daftarga tegmaydi |
| `shared/money-transition-race.test.ts` | +3, 4 qayta yozildi | invoice-in poyga-probe'i `balance.applyDelta` → `po.applyInvoice` ga ko'chirildi (aks holda test bo'shab qolardi) **va** «balansga umuman tegmaydi» alohida 3 test bilan qulflandi |
| `scripts/counterparty-balance-sources.test.ts` | +2 | InvoiceIn: servis + reyestr + skript **birga** (uchtasidan biri qaytsa yiqiladi) · PurchaseReturn qamrovda va skriptda `+1n` |
| `shared/apply-payment-race.test.ts` | 0 (arity) | InvoiceIn konstruktori 6 → 5 parametr |

**Non-vacuous (jonli o'lchangan, tuzatishdan OLDINGI kodda):** 7 assert yiqildi —
`PO→Supply+InvoiceIn` daftari `[-4 000 000]` o'rniga **`[-4 000 000, -4 000 000]`** (PP-03 ayni
o'zi), qaytarishdan keyin saldo `0` o'rniga `-4 000 000`, qaytarish deltalari massivi bo'sh,
unpost/cancel teskarilari yo'q, InvoiceIn post 1 marta `applyDelta` chaqirdi.

⚠️ **Bir soxta-RED tutildi:** birinchi urinishda test InvoiceIn'ni **fix'dan keyingi** 5-parametrli
konstruktor bilan qurdi — natijada RED `this.balance.applyDelta is not a function` (TypeError) bo'lib
chiqdi, ya'ni bug'ni EMAS, arity siljishini ko'rsatardi. Test vaqtincha 6-parametrli (fix'dan
oldingi) shaklga qaytarilib **haqiqiy RED** o'lchandi, keyin fix + yakuniy 5-parametrli shakl.

### Gate (jonli o'lchangan)
- `pnpm --filter @moysklad/api typecheck` → **0**
- `pnpm --filter @moysklad/web typecheck` → **0**
- `pnpm lint:product` → **0 error** (738 warning — siyosat bo'yicha ruxsat)
- `pnpm --filter @moysklad/api exec vitest run` → **391 fayl / 5161 test yashil** (1 fayl, 2 test skip)
- `pnpm --filter @moysklad/web exec vitest run` → **183 fayl / 2746 test yashil** (26 skip)
- `pnpm i18n:gate` → **o'tdi** (2 yangi kalit ru+uz)
- **Browser-smoke YO'Q.** Status: **Phase-1 — strukturaviy + unit-tasdiqlangan.**

### ⚠️ BALANSNI QAYTA-HISOBLASH KERAKMI (reja shuni so'ragan edi)

**Qisqa javob: `recompute` skripti bu muammoni YECHMAYDI, lekin ALOHIDA korrektirovka qadami KERAK
(agar prodda Faza 13'gacha post qilingan InvoiceIn bo'lsa).**

1. **Nega `recompute` yechmaydi:** Faza 10 dan beri uning nishoni — `CounterpartyBalanceEntry`
   **jurnali** (hujjatlar emas). Jurnal **append-only**: Faza 13'gacha `InvoiceIn.post` yozgan
   `-sumMinor` qatorlari o'sha yerda TURIBDI. Skript `APPLY=1` bilan yugurtirilsa u faqat keshni
   jurnalga tenglaydi — ikki-karra qarz saqlanib qoladi (Σ o'zgarmaydi).
2. **Nega baribir yangi zarar yo'q:** «Σ(jurnal) == materiallashgan balans» invarianti buzilmagan;
   barcha o'quvchilar (metrics · statement · akt · kontragent kartochkasi) bir xil (garchi tarixan
   shishirilgan) sonni ko'rsatadi. Ya'ni **yangi drift paydo bo'lmaydi**, faqat eski xato qoladi.
3. **Ta'sir doirasini o'lchash** (avval shuni yugurtiring — ehtimol 0 qator):
   ```sql
   SELECT counterparty_id, currency, COUNT(*) AS rows, SUM(delta_minor) AS overstated_minor
   FROM counterparty_balance_entries
   WHERE doc_type = 'invoiceIn'
   GROUP BY 1, 2 ORDER BY 4;
   ```
   Har qator — o'sha kontragentda **ortiqcha yozilgan qarz** (manfiy = «biz qarzdormiz» tomonga).
   Natija bo'sh bo'lsa **hech narsa qilish shart emas** va bu bandning qolgani ahamiyatsiz.
4. **Agar qatorlar bo'lsa — IKKI yo'l:**
   - **(tavsiya) `CounterpartyAdjustment`** har kontragent×valyuta uchun teskari summaga: auditorlik
     izi qoladi, mavjud UI orqali ko'rinadi, jurnalga `docType:'adjustment'` bilan tushadi va
     rekonstruksiya-skriptining `adjustments` manbasi uni to'g'ri qayta quradi.
   - (muqobil) bir-martalik skript: har (kontragent, valyuta) uchun bitta kompensatsiya qatori.
     ⚠️ `docType` sifatida `invoiceIn` ISHLATILMASIN — u endi «yozilmaydigan tur», aks holda
     keyingi audit uni tirik yozuvchi deb o'qiydi.
   - ❌ **Jurnal qatorlarini O'CHIRISH mumkin EMAS** (append-only shartnoma + `opening` backfill
     mantig'i shunga tayanadi).
5. **Faza 10 ops-qarzi o'zgarmadi:** `backfill-counterparty-balance-journal.ts` (opening snapshot)
   hamon yugurtirilmagan; `recompute` `APPLY=1` undan OLDIN ishlashni o'zi rad etadi.

### Qolgan qarz / DEFER
- **Tarixiy ikki-karra qarz** — yuqoridagi 3–4 bandlar. Prodda hajm **noma'lum** (bu sessiyada DB'ga
  ulanilmagan). Ops-qadam sifatida qoldi.
- **`InvoiceIn` uchun to'lov semantikasi tekshirilmadi:** `PaymentOut`/`CashOut` hamon `+sumMinor`
  yozadi (o'zgarmagan). Ya'ni faktura bo'yicha to'lov qarzni kamaytiradi, garchi qarzni Qabul yozgan
  bo'lsa ham — bu **to'g'ri** (yagona kontragent saldosi), lekin tovar kelmasdan oldin to'lov
  qilinsa saldo musbat tomonga o'tadi. Bu Faza 13 dan OLDIN ham shunday edi (o'zgarish yo'q).
- **Browser-smoke YO'Q** — «Возврат поставщику» ni «Провести» → kontragent «Balans» kartasi va
  akt-sverka qatori Phase-2 QA cohort'iga qoladi.
- **Qisman qaytarish** birlik-testda alohida stsenariy sifatida yozilmadi (formula `sumMinor` bo'yicha
  chiziqli, to'liq qaytarish testi uni qamraydi) — Phase-2 da real ma'lumot bilan ko'riladi.

---

## Faza 14 — Qabul-tasdiqlash: FSM-bypass guard + omborchi recompute totals

**Sana:** 2026-08-08 · **ID'lar:** `PP-06` (HIGH security), `PP-04` (HIGH data-integrity)
**Status:** **Phase-1: strukturaviy + unit-tasdiqlangan, browser-smoke YO'Q**

### Da'volarni kodda tasdiqlash (reja §2)

| ID | Da'vo | Kodda holat (fix'dan OLDINGI qatorlar) |
|----|-------|----------------------------------------|
| `PP-06` (a) | `post()` `approvalStage`ni tekshirmaydi | ✅ **TASDIQLANDI** — `supply.service.ts:1199-1230` `post()`da yagona shart `existing.state !== 'draft'`; `approvalStage` so'zi funksiyada UMUMAN yo'q. Zanjir `awaiting_supplier`da bo'lsa ham `POST :id/transitions/post` stockni kirgizadi. **Qo'shimcha oqibat (auditda aytilmagan):** post'dan keyin `adminConfirm` (`supply-approval.service.ts:187`) faqat `state==='draft'` bo'lsa post qiladi ⇒ hujjat `posted` bo'lgani uchun zanjir `awaiting_*`da abadiy qotib qoladi. |
| `PP-06` (b) | `create(applicable)` `supply.approve`ni chetlab o'tadi | ✅ **TASDIQLANDI** — `supply.controller.ts:92-93` `@Post()` faqat `{entity:'supply', action:'create'}`; `supply.service.ts:768-770` `if (parsed.applicable) return await this.transition(..., 'post')`. Ya'ni AYNAN `@Post(':id/transitions/:target')` (`:118-119`, `action:'approve'`) himoyalagan amal ruxsatsiz bajariladi. |
| `PP-06` (c) | Zanjir o'rtasida `update`/`delete` ochiq | ✅ **TASDIQLANDI** — `update()` (`:841`) faqat `existing.applicable`ni, `delete()` (`:1063`) faqat `state:'draft', applicable:false`ni qaraydi. Zanjir uchayotganda hujjat aynan `draft`+`applicable:false` (chunki `send()` (`:120`) uni unpost qiladi) ⇒ ikkala qulf ham VAKUUM. |
| `PP-04` | Omborchi tuzatishi summalarni qayta hisoblamaydi | ✅ **TASDIQLANDI** — `supply-approval.service.ts:147-155` tx'da faqat `tx.supplyPosition.update({data:{quantity}})`; `computeTotals` chaqirilmaydi (u `SupplyService`ning **private** metodi bo'lgani uchun chaqirib ham bo'lmasdi). Keyin `post()` stock deltalarini YANGI `p.quantity`dan (`:1295-1306`), qarzni esa ESKI `existing.sumMinor`dan (`:1349-1354`) yozadi. |

### Fayllar

| Fayl | O'zgarish |
|---|---|
| `apps/api/src/modules/supply/supply-totals.ts` | **YANGI** — `computeSupplyTotals()` + `ComputedTotals`/`SupplyTotalsPosition`. Jami-formulaning YAGONA manbasi (ilgari `SupplyService` private metodi edi ⇒ tasdiqlash oqimi undan foydalana olmasdi). |
| `apps/api/src/modules/supply-approval/approval-integrity.test.ts` | **YANGI** — 10 test (PP-06 ×7, PP-04 ×3). |
| `apps/api/src/modules/supply-approval/supply-approval.fsm.ts` | `IN_FLIGHT_STAGES` + `isApprovalInFlight()` — «hujjat muzlagan» predikati FSM'da (bosqichlar bo'yicha yagona hokim). |
| `apps/api/src/modules/supply-approval/supply-approval.service.ts` | `omborchiConfirm` tx'iga `recomputeTotals()` (yangi private metod) — bosqich-da'vosi bilan BIR tranzaksiyada. |
| `apps/api/src/modules/supply/supply.service.ts` | `PermissionsService` inyeksiyasi; `create()` approve-gate; `update()`/`delete()`/`post()` in-flight guard; `computeTotals` → `supply-totals.ts`ga delegatsiya. |
| `apps/api/src/modules/shared/transition-toctou-class.test.ts` | delete-guard shakli endi QO'SHIMCHA shartga ruxsat beradi (`[,}]`) + supply uchun `deleteAlso` bilan `approvalStage` bandini aynan SHU atomik yozuv ichida qulflaydi. |
| `apps/api/src/modules/purchase-return/supplier-debt-supply-only.test.ts` | Faza 13 harness'iga 10-konstruktor argumenti (permissions dubli). |

### O'zgarish (4 qism)

1. **`post()` in-flight guard** — `isApprovalInFlight(existing.approvalStage)` → `ConflictException`.
   Ruxsat etilgan to'plam **{`none`, `completed`}**: zanjirsiz odatdagi qabul, va admin allaqachon
   tasdiqlagani. `adminConfirm` `completed`ni **CLAIM QILGANDAN KEYIN** post chaqiradi
   (`supply-approval.service.ts:176` → `:188`), shuning uchun tasdiq oqimi guard'dan bemalol o'tadi —
   bu tasodif emas, guard shu tartibga ataylab bog'langan.
2. **`create(applicable:true)` → `permissions.require(userId,'supply','approve')`**, hujjat
   yaratilishidan **OLDIN** (yarim-qoralama qolmaydi). `PermissionsModule` `@Global` ⇒ modul-import
   o'zgarmadi. `userId` = `user.sub` = employeeId — `PermissionsGuard:60-65` bilan bir xil kalit.
   Rol-shablonlari tekshirildi: `Administrator`/`Manager`/`Employee` `approve` ≥ `OWN` oladi
   (`permissions.types.ts:179-212`), `ReadOnly` esa allaqachon `create:'NO'` — ya'ni bu gate hech
   bir qonuniy foydalanuvchini yo'qotmaydi.
3. **`update()`/`delete()` in-flight freeze.** `delete()`da shart pastdagi ATOMIK `updateMany`
   WHERE'iga ham qo'shildi (`approvalStage: { notIn: [...IN_FLIGHT_STAGES] }`) — parallel `send()`
   (`none → awaiting_supplier`) o'chirishni o'tkazib yubora olmasligi uchun; findById-tekshiruvi
   faqat aniq xabar uchun.
4. **`omborchiConfirm` → `recomputeTotals(tx, …)`** — bosqich-da'vosidan keyin, SHU tranzaksiyada:
   pozitsiyalarni qayta o'qib `computeSupplyTotals` bilan `sumMinor/vatSumMinor/costSumMinor` yoziladi.
   Faqat `detail.length > 0` bo'lganda (tuzatish bo'lmasa yozuv ham yo'q).

### Testlar (TDD — avval yiqildi, non-vacuous)

Fix'dan OLDIN o'lchangan (10 testdan **7 tasi qizil**):
- `post` `awaiting_supplier`/`delivering`/`awaiting_admin`da → «promise resolved» (o'tib ketardi, stock kirardi);
- `create(applicable)` ruxsatsiz → `TypeError` (tekshiruvning o'zi yo'q edi);
- `update()` zanjir o'rtasida → guard'siz o'tib, `logAudit`'da `Do not know how to serialize a BigInt`ga yetardi;
- `delete()` zanjir o'rtasida → `{ ok: true }` (hujjat o'chib ketardi);
- omborchi 100→90 → `sumMinor` **40 000 000** (kutilgan 36 000 000);
- admin tasdig'idan keyin qarz **−40 000 000**, stock esa **90 dona** ⇒ **4 000 000 tiyin** nomuvofiqlik.

Fix'dan keyin **10/10 yashil**. Reja talab qilgan 3 stsenariy + 4 qo'shimcha (in-flight `delivering`/
`awaiting_admin`, `{none, completed}` ijobiy nazorat, approve-gate faqat `applicable`da so'ralishi,
tuzatishsiz idempotentlik).

### Gate

| Gate | Natija |
|---|---|
| `pnpm --filter @moysklad/api typecheck` | **0 xato** (mening fayllarimda; ish boshida to'liq toza o'tgan). ⚠️ Sessiya oxirida parallel sessiya `bank-import.service.ts`da 2 `TS2353` chiqardi (`commitClaimedAt` — ular schema qo'shgan, Prisma client hali regen qilinmagan). Meniki emas, tegilmadi (§6.1). |
| `pnpm lint:product` | **0 xato**, 738 ogohlantirish (siyosat: ruxsat) |
| `pnpm i18n:gate` | **9/9 ✅** |
| `vitest` — supply · supply-approval · purchase-return · shared · stock · purchase-order | **697/697 ✅** (39 fayl) |
| To'liq API suite | 5170 ✅ / 9 ✗ — **9 tasi ham meniki emas**: 7 ta `bank-import` (parallel sessiyaning ochiq ishi, Faza 20/INT-05), 1 ta `publication` (yolg'iz yugurtirilganda 21/21 yashil — yuk ostida flaky), 1 ta `transition-toctou-class` — **bu meniki edi va tuzatildi** (guard shakli, quyida). |

**Guard-drift eslatmasi:** `delete()`ni kuchaytirish `transition-toctou-class.test.ts` source-scan
guard'ini qizil qildi (regex `deletedAt: null` dan keyin darhol `}` talab qilardi). Bu aynan o'sha
fayl o'zi ogohlantirgan tuzoq — «himoya qo'shgan odam testni qizil qiladi». Shakl bo'shatildi
(`[,}]`) va o'rniga supply uchun `deleteAlso` bilan **kuchliroq** shart (approvalStage bandi SHU
atomik yozuvning ichida) qulflandi.

### Qolgan qarz / DEFER

- **`moysklad-compat` guard'dan TASHQARIDA.** `moysklad-compat.service.ts:152-161` `supply`ni
  to'g'ridan-to'g'ri Prisma-model sifatida (`model:'supply'`) yozadi — `SupplyService`dan
  o'tmaydi, ya'ni MS-JSON-API qatlami orqali in-flight qabulni ham tahrirlash mumkin. **Alohida
  bug-klass** (butun compat qatlami servis-qoidalarini chetlab o'tadi), Faza 14 doirasidan tashqari.
- **`unpost` ataylab guard'siz** — `send()` (`supply-approval.service.ts:120`) posted qabulni
  unpost qilib zanjirni boshlaydi; unpost'ga guard qo'yilsa oqim o'ladi. Zanjir uchayotganda
  hujjat allaqachon `draft` bo'lgani uchun bu tirqish emas.
- **`completed` bosqichida hujjat OCHIQ** (reja matni «`approvalStage != none` → blok» degan edi).
  Ataylab: `completed` = admin tasdiqlagan va hujjat `posted` ⇒ `update`/`delete` mavjud
  `applicable`/`state` qulflari bilan allaqachon yopiq. Barchasini blok qilish tasdiqlangan
  qabulni **abadiy** muzlatardi (unpost'dan keyin ham tuzatib bo'lmasdi). Guard to'plami shu
  sababli aynan `post()` ruxsati ({`none`,`completed`})ning to'ldiruvchisi.
- **Overhead × omborchi-tuzatish o'zaro ta'siri sinovdan o'tmagan.** `recomputeTotals` overheadni
  qo'shmaydi (draft `costSumMinor` overheadsiz bo'lishi — mavjud kontrakt; `post()` uni
  `cleanBase + overheadSumMinor` bilan qayta yozadi). Overheadli qabulda omborchi sonni
  tuzatgan stsenariy **birlik-testda yo'q** — Phase-2 QA'ga.
- **Tarixiy nomuvofiqlik tuzatilmadi.** Fix'gacha omborchi tuzatgan qabullarda `sumMinor` eski
  sonda qolgan va qarz o'sha eski summada yozilgan. Ta'sir doirasini o'lchash (prodda, DB'ga
  ulanib):
  ```sql
  SELECT s.id, s.name, s.sum_minor
  FROM supplies s
  JOIN supply_approval_events e
    ON e.supply_id = s.id AND e.action = 'omborchi_ok' AND e.detail IS NOT NULL
  WHERE s.state = 'posted';
  ```
  Har qator — qarzi tovar sonidan farq qilishi mumkin bo'lgan qabul. Bu sessiyada DB'ga
  ULANILMADI, hajm **noma'lum**. Tuzatish yo'li — `CounterpartyAdjustment` (Faza 13 hisobotidagi
  bilan bir xil retsept), jurnal qatorlarini O'CHIRMASDAN.
- **`PP-05`** (WorkOrder `costDeltaMinor:null`) va **`PP-01`/`PP-07`–`PP-09`** shu fazada
  TEGILMADI — o'z fazalarida.
- **Browser-smoke YO'Q** — «Проведено» belgilab saqlash (403 yo'lini FE qanday ko'rsatishi),
  omborchi tuzatgandan keyin detail-sahifadagi «Сумма», va zanjir o'rtasidagi 409 xabari
  Phase-2 QA cohort'ida ko'riladi.

**Commit:** `fix(supply): faza 14 — tasdiq-FSM bypass guard + omborchi recompute (PP-06, PP-04)`

---

## Faza 18a — Tannarx yagonalash: POS/Demand → WEIGHTED-AVERAGE, FIFO bekor (`STK-02/03/04`)
**2026-08-08 — Phase-1: strukturaviy + unit-tasdiqlangan, browser-smoke YO'Q — 18b/18c QOLDI**

### Da'voni kodda tasdiqlash (reja §2) — 4/4 TASDIQLANDI

- **`STK-02`** — `retail-sale.service.ts` post `:777` va refund `:1254` **`costDeltaMinor: null`**:
  POS chiqim/qaytim qiymat balansiga umuman tegmasdi ⇒ qty tushadi, `costBalanceMinor` turadi ⇒
  har POS-sotuv keyingi iste'molchilar (Loss/Demand/hisobot) uchun o'rtachani SHISHIRADI.
- **`STK-03`** — `consumeFifo` SQL'ida (`:1010-1023`) store-filtr YO'Q edi (faqat account+assortment+
  posted) ⇒ B-ombor otgruzkasi A-ombor lotlaridan narx olar, balansni esa B'dan kamaytirardi.
- **`STK-04`** — `remainingQty`ga faqat supply/demand tegadi (grep 7 fayl); Loss/Inventory/Move/Enter
  weighted-avg bilan chiqim qilib lotni tegmaydi ⇒ keyingi Demand o'sha qabul qiymatini FIFO'dan
  YANA hisoblaydi (COGS 2×).
- **`PP-05`** — `work-order.service.ts` 4 delta-nuqtasi (`:436,469,553,568`) `costDeltaMinor: null` —
  **18b'da**, bu sessiyada TEGILMADI.

### Qilingan (18a — QAROR-A weighted-average, foydalanuvchi 2026-08-08)

- **Demand.post** endi COGS'ni yetarlilik-tekshiruv ishlatgan **o'sha per-store qulflangan balans**dan
  oladi: `perUnit = costBalanceMinor ÷ onHand` (`computePerUnitCost`), bo'sh/qiymatsiz stock'da
  `product.buyPrice` fallback (Loss presedenti — manfiy-stock chiqim ham qiymat olib chiqadi, 0 emas).
  `perUnit` pozitsiyaga MUZLATILADI (`costMinor`), delta = `−scaleMinorByQty(perUnit, qty)`.
- **Demand.unpost/cancel** — AYNAN shu formula bilan teskari (`scaleMinorByQty(p.costMinor, qty)`) ⇒
  post↔unpost qat'iy zero-sum. **Legacy yo'l saqlanadi:** FIFO davrida o'tkazilgan hujjatda
  `DemandPositionCostConsumption` qatorlari bor — `reverseLegacyFifo` ularni avvalgidek qaytaradi
  (`remainingQty` increment + delete), `hadRows=false` bo'lsa muzlatilgan perUnit ishlaydi.
- **FIFO bekor:** `consumeFifo` (94 satr, 2 ta raw SQL) O'CHIRILDI; endi hech narsa
  `DemandPositionCostConsumption` YARATMAYDI va lot `remainingQty`ni KAMAYTIRMAYDI — eski qatorlar
  read-only legacy (rejadagi xavfsiz variant: tarixiy ma'lumot o'chirilmadi).
- **POS (retail-sale).post** — chiqim delta'si endi xuddi Loss kabi per-store o'rtachadan; fallback —
  chekka muzlatilgan `buyPrice` snapshot (`frozen`), NULL≠0 kontrakti buzilmadi.
- **POS refund** — qaytim AYNAN asl chek chiqarganini qaytaradi: asl chekning o'z `StockOperation`
  qatorlaridan bazis (`buildRefundCostBasis`), oldingi qisman qaytimlar ayirilib **kumulyativ qoldiq**
  bo'yicha (`consumeRefundCost`) ⇒ qaytimlar seriyasi asl chiqimga nisbatan qat'iy zero-sum (333+334+333
  testda). **Legacy chek** (fix'dan oldin o'tgan, NULL chiqim) qaytimda ham NULL — hech qachon qiymat
  to'qib chiqarilmaydi. Bir qaytimda bir mahsulot ikki qatorda kelsa — qoldiqdan ketma-ket olinadi.

### TDD (RED o'lchandi)

Yangi 3 fayl: `demand-weighted-avg-cogs.test.ts` (10), `retail-cogs.test.ts` (6),
`retail-refund-cogs.test.ts` (13, sof-xulqiy). Fix'dan oldin **13/16 qizil** (3 yashil — mavjud
helperlar ustidagi maqsad-model arifmetikasi). Qizil bosqich **`buildRefundCostBasis`dagi haqiqiy
ishora-xatoni tutdi** (sign ikki marta agdarilib qoldiq 0 chiqar edi). Eski FIFO class-lock
`demand-cogs-uncovered.test.ts` O'CHIRILDI (himoya qilgan kod yo'q). Reja stsenariylari: (1) POS
qiymat-kamayish ✓ (2) per-store o'rtacha ✓ (3) Loss→Demand 2× yo'q ✓ (5) unpost simmetrik ✓ +
legacy-reversal ✓; (4) WorkOrder zero-sum — **18b'da**.

### Gate (PATH-CHEKLANGAN — parallel sessiya Faza 16 ustida faol edi)

api tc **0** · o'z 10 faylim biome **0** · `i18n:gate` **9/9** · vitest: retail-sale **261/261**,
demand+sales-return+work-order+loss+stock **279/279**, katta batareya (supply, purchase-return, move,
enter, inventory, cashier-session, processing) **944/944** (2 yiqilish mock'da `stockOperation.findMany`
yo'qligidan edi — mock'lar to'ldirildi). **To'liq api-suite YUGURTIRILMADI** — daraxtda parallel
sessiyaning Faza 16 (currency/rate-scale) yarim ishi turibdi, natija attributsiya qilib bo'lmasdi.

### 🟠 QARZ / keyingi sub-fazalar

1. **18b** — WorkOrder weighted-avg cost (`PP-05`): 4 null-delta + Processing naqshidagi consume/output.
2. **18c** — Move per-unit yaxlitlash qoldig'i (oxirgi-birlik tuzatish, STK-08 sinfi) + supply
   unpost-guard: `remainingQty` endi COGS uchun O'LIK (faqat legacy-reversal o'zgartiradi) — supply'da
   `remainingQty = quantity` yozish va unga asoslangan har qanday kelajak-guard olib tashlanishi kerak.
3. Demand'da to'liq chiqimda (qty == onHand) perUnit-yaxlitlashdan `costBalanceMinor`da ±tiyin qoldiq
   qolishi mumkin (Loss'dagi bilan bir sinf) — 18c oxirgi-birlik tuzatish umumiy yechadi.
4. **Browser-smoke YO'Q** — POS sotuv→qaytim va otgruzka post→unpost qiymat-simmetriyasi Phase-2 QA'da.

**Commit:** `fix(cogs): faza 18a — POS/Demand weighted-average COGS, FIFO lot-ledger bekor (STK-02/03/04)`

---

## Faza 20 — Bank-import: commit-poyga + vypiska-dedup (`INT-05`)
**2026-08-08 — Phase-1: strukturaviy + unit-tasdiqlangan, browser-smoke YO'Q**

### Da'voni kodda tasdiqlash (reja §2)

`INT-05` **TASDIQLANDI, audit xato o'qimagan.** Fix'dan oldingi `bank-import.service.ts`:

- `:151-154` — `commit()` statementni `rows` bilan **bir marta** o'qiydi (snapshot).
- `:166` — `if (row.paymentInId || row.paymentOutId) continue;` — tekshiruv **faqat o'sha
  snapshot'ga** tayanadi.
- `:182-199` / `:202-217` — siklda avval `paymentIn.create(...)` / `paymentOut.create(...)`,
  **keyin** `bankStatementRow.update({ data: { paymentInId } })`.

Ya'ni «o'qi → tekshir → yarat → belgila» ketma-ketligida hech qanday atomik qadam yo'q: ikki
parallel commit (double-click, retry, ikki operator) ikkalasi ham `paymentInId = null` ko'radi va
**ikkita** PaymentIn yaratadi. Dedup ham umuman yo'q edi — `upload()` (`:71-109`) faylni hech
narsa bilan solishtirmasdan yangi statement yaratardi, ya'ni bir oylik vypiskani ikki marta
yuklab ikkalasidan commit qilish oyning **hamma** to'lovlarini dublikat qilardi.

### O'zgarishlar

| Fayl | O'zgarish |
|---|---|
| `packages/db/prisma/schema.prisma` | `BankStatementRow.commitClaimedAt` (claim belgisi) · `BankStatement.contentHash` (sha256) · 2 indeks (`[accountId, contentHash]`, `bank_statement_rows_dedup_idx`) |
| `packages/db/prisma/migrations/20260808230000_bank_import_claim_and_dedup/migration.sql` | **YANGI** — 2 ustun + 2 indeks (hammasi `IF NOT EXISTS`) |
| `apps/api/src/modules/bank-import/bank-import.service.ts` | `COMMIT_CLAIM_STALE_MS` (15 daq) · `claimRow()` / `releaseClaim()` / `findImportedTwin()` · `commit()` sikli: dedup → claim → yaratish → bog'lash, xatoda claim bo'shatiladi · `upload()`: content-hash + `duplicateOf` |
| `apps/api/src/modules/bank-import/bank-import.schema.ts` | `allowDuplicateRowIds` — operator dedup'ni **aniq qator** uchun ataylab chetlab o'tishi (haqiqiy bir xil summali ikki to'lov holati) |
| `apps/web/src/app/(app)/bank-import/page.tsx` | `duplicateOf` ogohlantirish Alert'i · **commit `failed` ro'yxati endi ko'rinadi** (ilgari umuman ko'rsatilmasdi — dedup rad etishi jim qolardi) · yangi yuklashda `commitMut.reset()` |
| `apps/web/src/messages/{ru,uz}.json` | `pages.bank_import.duplicate_warning`, `.commit_failed_title` |

**Claim mexanikasi:** `updateMany({ where: { id, accountId, paymentInId: null, paymentOutId: null,
OR: [{ commitClaimedAt: null }, { commitClaimedAt: { lt: now − TTL } }] }, data: { commitClaimedAt: now } })`
— yagona shartli yozuv, qator-qulfini oladi, yutqazgan raqib `count === 0` oladi va qatorni
**jimgina o'tkazib yuboradi** (`failed`ga yozilmaydi: bu xato emas, ish taqsimoti). Bo'shatish
WHERE'da `commitClaimedAt: <o'zimizning vaqt>` bilan — TTL bo'yicha qatorni qayta olgan raqibning
claim'ini o'chirib yubormaslik uchun.

**Dedup tabiiy kaliti:** `direction + moment + amountMinor + documentNumber + counterpartyAccount`
(fayl nomi/qator raqami EMAS — ular qayta yuklashda o'zgaradi). `null` maydonlar `IS NULL` bo'lib
solishtiriladi. Topilsa qator `failed`ga
`Duplicate of already-imported row <id> (statement <stmt>)` bilan tushadi.

### Testlar (TDD — avval yiqildi, keyin yashil)

`bank-import.service.test.ts` — 3 tadan 11 taga. Mock'dagi `updateMany` **haqiqiy semantikaga ega**
(shartlar joriy qator holatiga solishtiriladi) — `vi.fn(async () => ({ count: 1 }))` bug'ni
ko'rsata olmasdi.

Yangi 8 testdan **6 tasi fix'dan oldin qizil** edi (2 tasi — «release» va «allow-duplicate» —
o'sha paytda trivial yashil bo'lgani uchun kuchaytirildi: birinchisiga claim olindi-VA-bo'shatildi
tasdig'i qo'shildi):

1. `Promise.all` ikki `commit()` bir qatorga → `paymentIn.create` **1 marta**, `succeeded` jami `['row-1']`.
2. Xuddi shu — `paymentOut` yo'nalishi.
3. `create` throw qilsa claim `null`ga qaytadi va **keyingi urinish** qatorni import qiladi.
4. Boshqa vypiskadan import qilingan egizak bor → `create` **chaqirilmaydi**, `failed`da dedup xabari.
5. Dedup so'rovi aynan tabiiy kalit bo'yicha (`id: { not: … }` bilan) yuboriladi.
6. `allowDuplicateRowIds` berilgan qator dedup'dan o'tadi va import qilinadi.
7. `upload()` `contentHash` = sha256(content) yozadi, dublikat yo'qda `duplicateOf: null`.
8. Bir xil mazmun qayta yuklansa `duplicateOf` = oldingi statement (id/fayl/sana/import soni/holat).

### Gate (jonli o'lchangan)

- `pnpm --filter @moysklad/api typecheck` → **0** · `pnpm --filter @moysklad/web typecheck` → **0**
- `pnpm lint:product` → **0 error** (738 warning — siyosat bo'yicha ruxsat)
- `pnpm i18n:gate` → **9/9 passed** (ru+uz key-existence + no-hardcoded)
- `vitest run src/modules/bank-import` → **31/31** · regress: `payment-in` + `payment-out` bilan
  birga **88/88**
- Web: `button-conventions` + `domain-status-tone` → **170/170**
- Migratsiya lokal DB'ga (`climart_adopt @ 5432`) `prisma db execute` bilan qo'llandi;
  `prisma migrate diff` da **bank-import obyektlari bo'yicha drift 0** (fayldagi qolgan drift —
  oldingi fazalardan qolgan indeks-nom o'zgartirishlari, meniki emas, tegilmadi).

### Qolgan qarz / DEFER

- **🔴 Crash-oynasi TO'LIQ yopilmadi.** `paymentIn.create` muvaffaqiyatli tugab, undan keyingi
  `bankStatementRow.update({ paymentInId })` **hali yozilmagan** lahzada jarayon o'lsa — yaratilgan
  to'lov hech qaysi qatorga bog'lanmagan qoladi, shuning uchun TTL'dan keyingi qayta-urinishda
  `findImportedTwin()` uni topa olmaydi va **ikkinchi to'lov yaratiladi**. Oyna millisekundlar va
  jarayon o'limini talab qiladi. To'liq yopish = to'lovni qator-bog'lanishi bilan **bir**
  tranzaksiyada yaratish, buning uchun `PaymentInService.create` tashqi `tx` qabul qilishi kerak
  (hozir o'z tranzaksiyasini ochadi) — **alohida ish**.
- **Parallel commit ikki HAR XIL vypiskadan** — row-claim faqat bir qatorni himoya qiladi; ikki
  statement'dagi bir xil bank tranzaksiyasi uchun ikkala commit ham `findImportedTwin()` o'qishidan
  o'tib ketishi mumkin (read, qulf emas). To'liq atomik yechim — `(account_id, direction, moment,
  amount_minor, document_number)` bo'yicha **partial unique index**. **ATAYLAB QO'YILMADI:** prod
  bazasida shu bug tufayli allaqachon dublikatlar bo'lishi ehtimoli yuqori ⇒ indeks yaratish
  migratsiyani yiqitardi. To'g'ri tartib: avval prod dublikatlarini o'lchash/tozalash, keyin indeks.
- **Prod dublikatlarini o'lchash — bu sessiyada QILINMADI** (prod DB'ga ulanilmadi, hajm
  **noma'lum**). O'lchash so'rovi:
  ```sql
  SELECT direction, moment, amount_minor, document_number, count(*) AS n,
         array_agg(id) AS row_ids
  FROM bank_statement_rows
  WHERE payment_in_id IS NOT NULL OR payment_out_id IS NOT NULL
  GROUP BY 1,2,3,4 HAVING count(*) > 1;
  ```
  Har qator — ikki marta import qilingan bank tranzaksiyasi. Tuzatish — ortiqcha PaymentIn/Out'ni
  `CounterpartyAdjustment` bilan teskarilash (Faza 12/13 retsepti), jurnal qatorlarini
  **O'CHIRMASDAN**.
- **Bir fayl ichidagi haqiqiy egizak to'lovlar.** Dedup butun `accountId` bo'yicha qidiradi, shu
  jumladan o'sha vypiskaning boshqa qatorlarini ham. Bir kunda bir kontragentga hujjat raqamsiz
  ikkita haqiqiy bir xil summali to'lov bo'lsa — ikkinchisi rad etiladi. Chiqish yo'li bor
  (`allowDuplicateRowIds`) va rad etish endi UI'da ko'rinadi, lekin **UI'da «baribir import qil»
  tugmasi hali yo'q** — operator hozir faqat xabarni ko'radi. Kichik FE ishi, Phase-2 QA'ga.
- **Eski (migratsiyagacha) yozuvlarda `contentHash` = NULL** — ular hech qachon dublikat sifatida
  tanilmaydi. Backfill qilinmadi (fayl mazmuni saqlanmaydi — hash'ni qayta hisoblash **mumkin
  emas**). Faqat yangi yuklashlar himoyalangan; qator-dedup esa eski qatorlarga ham ishlaydi.
- **`upload()` bloklamaydi** — ataylab: qayta-parse qonuniy stsenariy (mos-kelishuvni tuzatgandan
  keyin). Haqiqiy himoya commit'dagi qator-dedup'da.
- **Browser-smoke YO'Q** — dublikat ogohlantirishi, commit `failed` ro'yxati va ikki tab'dan
  parallel commit Phase-2 QA cohort'ida ko'riladi.

**Commit:** `fix(bank-import): faza 20 — row-claim poyga qulfi + vypiska dedup (INT-05)`

## Faza 22 — 2026-08-08 — **Phase-1: strukturaviy + unit-tasdiqlangan, browser-smoke YO'Q**

**Topilma tasdiqlanishi (o'z ko'zim bilan kodda).** Ikkalasi ham TASDIQLANDI:
- `AUTH-02`: `auth.module.ts:41` `?? 'dev-secret-change-in-prod'`, `main.ts:44`
  `?? 'dev-cookie-secret-change-in-prod'` — sir uchun hech qanday boot-assert yo'q edi (TTL uchun
  `parseTtl` bor edi). `driver-link.util.ts:14-15` allaqachon to'g'ri (throw) — tegilmadi.
- `AUTH-04`/`FE-05`: `jwt-auth.guard.ts` va `permissions.guard.ts` — IKKI NUSXA `extractToken`,
  `?access_token=` query-param HAR endpointda qabul qilinardi (komment «SSE uchun» desa ham).

**Rejaga aniqlik (muhim).** Reja «faqat SSE'ga chekla» degan, lekin FE'da query-token **5 marshrutda**
jonli ishlatiladi (hammasi header yubora olmaydigan transport): `/notifications/stream` (EventSource),
`/images/:id/raw` va `/hr/employees/:id/image/raw` (`<img src>`, jumladan customer-display),
`/attachments/:id/raw`, `/purchase-orders/list-report` (top-level `window.open` PDF). Faqat-SSE cheklov
rasm/fayl/PDF'ni sindirardi ⇒ allowlist shu 5 marshrut qilib qo'yildi. FE'ga tegilmadi.

**Fayllar**

| Fayl | O'zgarish |
|---|---|
| `apps/api/src/modules/auth/boot-secrets.ts` | **YANGI** — `resolveSecret()`: prod'da sir yo'q/bo'sh/dev-fallback ⇒ boot-throw |
| `apps/api/src/modules/auth/boot-secrets.test.ts` | **YANGI** — 6 test (prod-throw ×3, prod-pass, dev-fallback ×2) |
| `apps/api/src/modules/auth/extract-token.ts` | **YANGI** — yagona `extractToken()` + `isQueryTokenRoute()` (5-regex allowlist) |
| `apps/api/src/modules/auth/jwt-auth.guard.ts` | private `extractToken` o'chirildi → shared helper |
| `apps/api/src/modules/auth/jwt-auth.guard.test.ts` | **YANGI** — 9 test (header-hamma-joyda, SSE/media-pass, oddiy-endpoint-401, prefiks-o'xshash-401) |
| `apps/api/src/modules/permissions/permissions.guard.ts` | private `extractToken` o'chirildi → shared helper (backfill yo'li ham yopildi) |
| `apps/api/src/modules/permissions/permissions.guard.test.ts` | **YANGI** — 3 test (regressiya qulfi: APP_GUARD backfill yo'li) |
| `apps/api/src/modules/auth/auth.module.ts` | `JWT_SECRET` → `resolveSecret(...)` |
| `apps/api/src/main.ts` | `COOKIE_SECRET` → `resolveSecret(...)` |
| `apps/api/src/observability.ts` | `scrubAccessTokenFromUrl()` + pino `serializers.req` — access-log'dagi `req.url`dan token qiymati redakt (AUTH-04 fix-tavsiyasidagi «log redaktor» qismi) |
| `apps/api/src/observability.test.ts` | **YANGI** — 3 test |

**Testlar (TDD tartibi kuzatildi).** RED: `jwt-auth.guard.test` + `permissions.guard.test`'ning
«query-token oddiy endpointda RAD» case'lari hozirgi kodda **yiqildi** (guard `true` qaytardi — bug jonli
ko'rsatildi), `boot-secrets.test` modul-yo'q bilan yiqildi. Fix'dan keyin: auth+permissions modullari
**10 fayl / 118 test yashil** (regress yo'q), + `observability.test.ts` 3/3, + `app-boot.test.ts` 7/7
(DI grafi buzilmagan).

**Gate (halol, parallel-sessiya izohi bilan).**
- `vitest run` auth + permissions + observability + app-boot → **128/128 yashil**.
- `typecheck`: mening o'zgarishlarim kirgan holda 23:01 da **to'liq daraxt 0 xato** o'tdi; 23:04 dagi
  qayta-yugurtirishda 3 xato chiqdi — **hammasi `demand.service.ts`da** (`consumeFifo`/`reverseFifo`),
  bu **parallel sessiyaning Faza 18 (FIFO→weighted-avg) yarim-yo'ldagi ishi**, mening fayllarimda xato yo'q.
- `lint:product`: mening fayllarim 0 error (observability.test format xatosi topilib tuzatildi); qolgan
  2 error parallel sessiyaning in-flight fayllarida (`report-rate-ctx.util.test.ts`,
  `retail-sale.service.ts`) — §6.1 bo'yicha TEGILMADI.
- `i18n:gate` kerak emas (UI-matn yo'q), web build kerak emas (FE fayl tegilmadi).

**Qolgan qarz / DEFER**
- **🔴 FE media signed-URL / cookie-media path — DEFER** (reja «Diqqat» bandi ruxsat bergan minimal yo'l).
  Token 5 allowlist marshrutida hali ham query'da yuradi ⇒ nginx access-log sizishi **shu 5 yo'lda
  qoladi** (API'ning o'z pino-logida endi redakt). To'liq yechim — qisqa muddatli signed-URL yoki
  cookie-auth media-path — alohida faza. Vaqtinchalik nginx-yamoq (deploy-side, bu repoda emas):
  log_format'da `access_token=[^&]*` ni redakt qilish.
- **🔴 PROD DEPLOY OGOHLANTIRISHI:** VPS env'ida `JWT_SECRET`/`COOKIE_SECRET` yo'q yoki dev-fallback'ga
  teng bo'lsa API endi **boot'da yiqiladi** (jim ishlamaydi — ataylab). Deploy'dan oldin
  `deploy/ecosystem.config.cjs` / `.env` da ikkala sir haqiqiy ekanini tekshirish SHART.
- Query-token'ni yangi marshrutga ochish kerak bo'lsa — `extract-token.ts` allowlist'iga regex qo'shiladi
  (testlari bilan); guard'larга alohida nusxa qaytarmaslik.
- Browser-smoke YO'Q — SSE oqimi, rasm/fayl ko'rinishi, PDF-print Phase-2 QA cohort'ida runtime tekshiriladi.

**Commit:** `fix(auth): faza 22 — prod secret boot-guard + query-token allowlist (AUTH-02, AUTH-04)`

---

## Faza 16 — Valyuta konventsiyasini yagonalash (2026-08-08) ✅

**Topilmalar kodda tasdiqlandi (§2):** `M-03` — hujjatlar `currency`da ALPHA ('UZS') saqlaydi
(schema default), `loadRateContext` esa xaritani `Currency.code` (yangi konventsiyada NUMERIC '860')
bilan kalitlagan → baseCode '860' ≠ 'UZS', HAR konvertatsiya face-value fallback; CBU
`applyAutoRatesFromSource` alpha `Ccy`ni numeric `code` bilan solishtirgan → AUTO kurs hech qachon
yangilanmasdi. `DB-01` — 4 vakillik jonli: rateValue ×10⁸ ∥ DebtPayment.exchangeRate ×10⁴ ∥
RetailSalePayment.rateMinor hujjatlanmagan ∥ ExchangeRate (CBU kesh) Decimal(20,6) + packages/money
ExchangeRate ×10⁹ (hech kim ishlatmagan). `M-04` — payment-in/out `ensureOperations` faqat `{id}`
tekshiradi, `applyPayment`da valyuta tushunchasi yo'q. Qo'shimcha tasdiqlangan fakt: schema.prisma
Currency doc-comment ESKI konventsiyani (code=alpha) da'vo qilardi — Zod/seed'ga zid.

**Kanonik masshtab qarori: ×10⁸** (reja farazi tasdiqlandi) — barcha hujjat `rateValue`lari allaqachon
×10⁸; ozchilik (DebtPayment ×10⁴) ko'pchilikka o'tkazildi, `@moysklad/money`da `RATE_SCALE = 10⁸n`
eksport qilinib test bilan qulflandi.

**Fayllar:**
| Fayl | Nima o'zgardi |
|---|---|
| `currency/currency-code.util.ts` | **YANGI** — `alphaCurrencyCode()`: qator qaysi avlod bo'lsa ham ALPHA kodni topadi (isoCode→code fallback) |
| `report/report-rate-ctx.util.ts` | xarita ALPHA kalit + raw-code zaxira kalit; baseCode = default qatorning alpha'si; select'ga isoCode (M-03a) — 15+ hisobot-servis bitta joydan tuzaldi |
| `currency/currency.service.ts` | `applyAutoRatesFromSource`: `OR[isoCode,code] IN keys` + alpha orqali match (M-03b) |
| `payment-in/payment-in.service.ts` | `ensureOperations(+paymentCurrency)`: InvoiceOut/CustomerOrder currency select + mismatch→400 (M-04) |
| `payment-out/payment-out.service.ts` | xuddi shu guard (InvoiceIn/PurchaseOrder) + **sibling-parity fix**: `createFromInvoiceIn`/`createFromPurchaseOrderAdvance` endi manba hujjatning `currency/rateValue`sini ko'chiradi (payment-in'dagi 2026-07-05 fix bu yerda yo'q edi — guard bilan birga shart bo'ldi) |
| `debt/debt.schema.ts` | exchangeRate ×10⁸ hujjatlandi + `≥10⁹` stale-klient guard (eski ×10⁴ qiymat 400) + `usdCentsToSomTiyin()` sof helper (RATE_SCALE import) |
| `debt/debt.service.ts` | markCall USD→so'm: `/10_000n` → `usdCentsToSomTiyin` (×10⁸); tarix-labelda `/1e8` |
| `packages/money/exchange-rate.ts` + `index.ts` | SCALE ×10⁹→×10⁸ (kanonik), `RATE_SCALE` eksport; klass iste'molchisi apps'da YO'Q (grep) — xavfsiz |
| `packages/db/prisma/schema.prisma` | Currency.code/isoCode doc-comment TO'G'RILANDI (code=NUMERIC, isoCode=ALPHA); DebtPayment.exchangeRate ×10⁸; RetailSalePayment.rateMinor ×10⁸ deb e'lon (yozuvchi yo'q — CASH_USD ulanmagan) |
| `migrations/20260809010000_unify_rate_scale_e8_currency_isocode` | DATA-only: `debt_payments.exchange_rate × 10000` (guard `<10⁹` — idempotent) + legacy `currencies.iso_code = UPPER(code)` (code alpha bo'lsa) |
| web: `debt-api.ts`, `debts/[id]/page.tsx`, `call-outcome-modal.tsx` | `RATE_SCALE 10⁴→10⁸`, `fmtRate /1e8` — wire-format server bilan sinxron |

**Testlar (TDD: avval 8 qizil ko'rildi, fix'dan keyin yashil):** `report-rate-ctx.util.test` +4
(numeric-konventsiya baseCode/xarita/konvertatsiya + legacy-almashgan qator), `currency.service.test`
**YANGI** 3 (CBU: numeric-kod match ×1e8 qiymat bilan, legacy regress-lock, feed'da-yo'q tegilmaydi),
`payment-in.service.test` **YANGI** 3 (USD→UZS 400 · UZS→UZS o'tadi · customerorder mismatch),
`payment-out.service.test` +2 (mavjud clone-testlar SAQLANDI, guard qo'shildi), `debt.schema.test` +1
(usdCentsToSomTiyin + eski-masshtab reject) + qiymatlar ×10⁸ga, `money.test` +1 (RATE_SCALE=10⁸ qulfi).

**Gate:** api typecheck 0 · web typecheck 0 · `lint:product` 0 error · vitest: report-modul **294/294**,
debt-modul **179/179**, tegilgan modullar **159/159** + payment-out 5/5, money **93/93** · migratsiya
lokal `climart_adopt`ga qo'llandi (`prisma db execute`), holat tekshirildi: `debt_payments` kursli qator
0 ta (lokal backfill bo'sh), `currencies` yagona qator allaqachon yangi konventsiyada. `i18n:gate`
kerak emas (UI-matn tegilmadi — faqat konstanta/komment).

**Backfill javobi (reja savoli):** KATTA EMAS — bitta UPDATE, migratsiya ichida, deploy'da avtomatik.
Lokalda 0 qator. **Prod diqqat:** sherset_v2'da qo'lda yaratilgan debt-jadvallar bor (sxema-drift
xotirasi) — deploy'da migratsiya oqimi o'tishini tekshirish kerak; o'tmasa SQL'ni qo'lda yugurtirish
(idempotent).

**Qolgan qarz / DEFER:**
- `M-13` (packages/money ExchangeRate ↔ currency-convert yaxlitlash farqi) — masshtab yagonalandi,
  lekin ikki konvertor hali ham alohida (truncation vs half-away). Alohida topilma, bu faza qamrovida emas.
- Hisobotlar joriy kursda (`M-11`) — Faza 17 (endi ochiq, bog'liqlik hal).
- Stale-klient oynasi: deploy paytida ochiq turgan eski tab ×10⁴ kurs yuborsa server 400 beradi
  (jim 10 000× xato o'rniga) — bu ataylab.
- Browser-smoke YO'Q — **Phase-1: strukturaviy + unit-tasdiqlangan**; debts UI + hisobot valyuta
  konsolidatsiyasi Phase-2 QA cohort'ida runtime tekshiriladi.

**Commit:** `94fe12ef` `fix(currency): faza 16 — valyuta konventsiyasi yagonalandi (M-03, DB-01, M-04)`
*(hook'siz pathspec-commit — parallel Faza 18a sessiyasining staged-indexi faol edi, §6.7B; gate'lar
qo'lda to'liq yugurtirildi).*

---

## Faza 17 — Hisobot kurslari: tarixiy-kurs + noma'lum-valyuta + aralash-jami (`M-11`,`M-12`,`M-14`)

**Sana:** 2026-08-09 · **Status:** **Phase-1: strukturaviy + unit-tasdiqlangan, browser-smoke YO'Q** ·
⏳ DEPLOY QILINMAGAN · 🗄️ migratsiya YO'Q (sxemaga tegilmadi) ·
⚠️ parallel sessiya bir daraxtda ishladi (auth/group/hr/manager/payment-gateway/payment-in +
`schema.prisma`) — diff'im path-cheklangan, gate o'z yo'llarimda (§6.6).

### Ground-truth tekshiruvi (§2 — audit da'volari ko'r-ko'rona olinmadi)
Uchala topilma ham **kodda tasdiqlandi**: `report-rate-ctx.util.ts:24-25` va
`cash-flow-consolidate.util.ts:86-87` haqiqatan `rate ? toBaseMinor(...) : amountMinor` (face-value);
`money-operation.service.ts:75-86` haqiqatan valyuta kalitsiz `aggregate`. `M-11` uchun qo'shimcha:
**33 hujjat modeli** `rate_value BigInt @default(100000000)` saqlaydi (schema.prisma), ya'ni tarixiy
kurs mavjud — faqat hisobotlarda o'qilmasdi.

### Nima qilindi

**(a) `M-11` — tarixiy kurs.** `consolidateToBase(amount, code, ctx, tally, docRateValue?)` — 5-argument
hujjatning o'z `rate_value`'si. SQL endi kursni ham kalitga oladi:
- `pnl.service.ts` — totals va groups: `GROUP BY currency, rate_value` (4+4 so'rov).
- `cash-flow.service.ts` — Prisma `groupBy(['currency','rateValue'])` + ikki raw-SQL yo'lida
  (`groupByDate`, `groupByFk`) UNION segmentlariga `rate_value`.
- `cash-flow-consolidate.util.ts` — `CurrencyAwareRow.rateValue?`, `foldCurrencyRows` endi o'z
  `toBase` nusxasini emas, umumiy `consolidateToBase`ni chaqiradi (ikkinchi konvertor yo'qoldi).

**🔑 IDENTITY-QO'RIQCHISI (rejada yo'q edi, ishlab chiqishda topildi).** `rateValue` sxemada
`@default(100000000)` — **kurs kiritilmagan USD hujjat ham 1e8** bo'lib turadi. Uni ko'r-ko'rona
ishlatish face-value bug'ini (M-12 klassi) boshqa eshikdan qaytarardi. Shu sabab: *baza bo'lmagan
valyutada `docRateValue === 1e8` ⇒ «kurs yo'q»*, joriy kontekst kursiga qaytiladi. Yon-foyda: mavjud
qatorlarning HAMMASI default kursda ⇒ o'zgarish ular uchun **bayt-ma-bayt neytral**, tarix jimgina
qayta yozilmaydi.

**(b) `M-12` — noma'lum valyuta ajratildi.** `Set<string> seen` → `CurrencyTally` klassi
(`add`/`size`/`has`/`mixed` — Set bilan mos, plus `addUnconverted`/`unconvertedRows`). Kursi topilmagan
summa endi **jamiga qo'shilmaydi** (`0n` qaytadi) va o'z valyutasida tally'ga to'planadi. 11 hisobot
javobiga + counterparty-balance `summaries`ga yangi maydon: `unconvertedByCurrency: UnconvertedAmount[]`.
`RateContext` egaligi `cash-flow-consolidate` → `report-rate-ctx`ga ko'chdi (aylanma import yo'q).
Codemod: 13 servis, 54 o'rin (deterministik skript, anchor topilmasa to'xtaydi).

**(c) `M-14` — per-valyuta totals.** `money-operation.service.ts`: uch `aggregate` → ikki
`groupBy(['currency'])` (kirim/chiqim) + `mergeCurrencyTotals`. Javob:
`totals: { byCurrency: [{currency,inMinor,outMinor,netMinor}], mixedCurrency }`. Faqat chiqimi bor
valyuta ham qatorda qoladi (ikkinchi tomon 0). FE `/money` sahifasi har valyuta uchun alohida
totals-qatori chizadi va summani **o'z valyutasida** formatlaydi (ilgari qattiq `'UZS'` yozilgan edi —
ya'ni aralash son «so'm» deb ko'rsatilardi).

### TDD (RED jonli o'lchandi)
- `report-rate-ctx.util.test.ts` — **9 qizil** (`CurrencyTally is not a constructor`) → 17/17 yashil.
  M-11: hujjat kursi ustun · davr barqarorligi (kurs 12 000→15 000, natija bir xil) · identity-qo'riqchi ·
  baza-valyuta identity. M-12: 0 qaytadi · summa tally'da to'planadi · hujjat kursi bo'lsa konvertatsiya
  bo'ladi · Set-shartnomasi saqlanadi.
- `money-operation.service.test.ts` (YANGI) — **5 qizil** (`aggregate is not a function`) → 5/5 yashil.
- `pnl.service.test.ts` — +4 test (tarixiy kurs, davr barqarorligi, bir valyutaning ikki kursli bucket'i,
  M-12 `unconvertedByCurrency`).
- `cash-flow-consolidate.util.test.ts` — eski «unknown currency falls back to face value» testi
  **yangi shartnomaga ko'chirildi** (0 + tally, hujjat soni yo'qolmaydi) + `rateValue` ustunligi testi.

### Gate
api typecheck **0** · web typecheck **0** · `pnpm lint:product` **0 error** (743 warning — siyosat bo'yicha
ruxsat) · vitest `report`+`money`+`currency`: **367/367** (43 fayl) · web suite: quyida. `i18n:gate` —
UI-matn qo'shilmadi (mavjud `totals_in/out/net` kalitlari qayta ishlatildi, yangi matn yo'q).

### Qolgan qarz / DEFER (ochiq, keyingi fazaga)
1. **Tarixiy kurs faqat pnl + cash-flow'da.** Boshqa davr-oqim hisobotlari (`profitability`,
   `sales-by-channel`, `sales-by-hour`, `average-basket`, `unit-economics`, `purchase-management`,
   `warehouse-ops`, `report.service`) hamon **joriy** kursda konsolidatsiya qiladi — mexanizm
   (`docRateValue` argumenti) tayyor, har biriga SQL'ga `rate_value` qo'shish qoldi. `aging` va
   `counterparty-balance` **ataylab** joriy kursda qoladi (ochiq-qoldiq revalyatsiyasi — rejaning
   o'z qoidasi).
2. **Dashboard vidjetlari** (`overdue`, org-balans, money-chart) `unconvertedByCurrency` maydoniga ega
   emas — kursi yo'q valyuta endi 0 sifatida ko'rinadi (ilgari noto'g'ri masshtabda ko'rinardi).
   Har uch joyda kod-izohi qo'yildi; to'liq yechim = dashboard javob-shaklini kengaytirish.
3. **FE `unconvertedByCurrency` ni hech qayerda chizmaydi** — API qaytaradi, hisobot sahifalari hali
   ko'rsatmaydi (11 sahifa UI ishi). `/money` sahifasi esa per-valyuta totals bilan **ulandi**.
4. `M-13` (ikki konvertor yaxlitlash farqi) — Faza 16'dan qolgan, hamon ochiq.
5. **Browser-smoke YO'Q** — Phase-2 QA cohort'ida runtime tekshiriladi (ayniqsa `/money` toolbar va
   P&L davr-barqarorligi real ma'lumotda).

---

## Faza 23 — HR self-eskalatsiya + login-only mutatsiyalar + offboarding-revoke (2026-08-09) — **Phase-1: strukturaviy + unit-tasdiqlangan, browser-smoke YO'Q**

**Topilmalar kodda tasdiqlandi (§2) — uchalasi ham HAQIQIY, audit xato o'qimagan:**
- `HR-10` — `hr-employee-permission.controller.ts:24-33` `PUT /hr/employees/:employeeId/permissions` faqat
  `@RequireHrPermission('employees','full')`; `employeeId === user.sub` tekshiruvi na controller'da, na
  `service.replace` (17-32) da bor edi. `hr-employee.service.ts:480` `hrRoles: input.hrRoles` — aktor
  cheklovsiz; `hr-permission.guard.ts:54` `hrRoles.includes('admin')` → BARCHA HR-tekshiruvini bypass.
  Ya'ni `employees:full` egasi bir so'rov bilan to'liq HR-admin bo'lib olardi.
- `AUTH-07` — `group.controller.ts:29-56` faqat `@UseGuards(JwtAuthGuard)`, `@RequirePermission` YO'Q;
  `permissions.guard.ts:39` talab metadatasi bo'lmasa `true` qaytaradi (opt-in) ⇒ har autentifikatsiyalangan
  xodim «Отделы» yaratishi/o'chirishi mumkin edi (kodning o'z kommentida tan olingan).
- `AUTH-05` — `token.service.ts:145` `revokeAllForEmployee` **butun `apps/api` bo'yicha 0 chaqiruv**
  (grep bilan tasdiqlandi); `offboarding.service.ts:187-196` arxivlash tranzaksiyasi faqat
  `archived:true` + `completedAt` yozardi.

**Qo'shimcha (o'z skanerim topdi, auditda yo'q):** oylikka ta'sir qiluvchi ikki yo'l ham rol-tekshiruvsiz edi —
`manager/kpi/kpi-config.controller.ts:33` `PUT employee/:id/config` (kodda `TODO(rol-gate)` turardi) va
`manager-kpi.controller.ts` `POST metrics` / `metrics/:key` / `metrics/:key/archive` (class'da `HrPermissionGuard`
bor-u, handler'larda talab yo'q ⇒ guard jim o'tkazadi). Ikkalasi ham shu fazada yopildi.

**Fayllar**

| Fayl | O'zgarish |
|---|---|
| `hr/hr-auth/privilege-escalation.ts` | **YANGI** sof modul: `assertNoSelfPrivilegeChange` (aktor==nishon → 403), `grantsAdminRole` (diff: admin BERILDIMI), `assertAdminRoleGrantAllowed` ('admin' rolini faqat admin beradi) |
| `hr/hr-employee-permission/hr-employee-permission.service.ts` | `replace(..., actorId?)` — o'ziga yozish 403, DB'ga umuman tegilmaydi |
| `hr/hr-employee-permission/hr-employee-permission.controller.ts` | `user.sub` aktor sifatida uzatiladi |
| `hr/hr-employee/hr-employee.service.ts` | `update`: `input.hrRoles !== undefined` shoxida self-check + admin-grant check (`current` select'ga `hrRoles` qo'shildi); `create`: admin-grant check (yangi xodimni darhol admin qilib yaratish — o'sha eskalatsiyaning ikkinchi yo'li); `actorHrRoles()` private helper |
| `group/group.controller.ts` | `POST/PATCH/DELETE` → `@RequirePermission({entity:'settings', action:'create'/'update'/'delete'})`; `GET` ATAYLAB ochiq (bo'lim ro'yxatini ko'plab picker'lar o'qiydi) — komment yangilandi |
| `manager/kpi/kpi-config.controller.ts` | class'ga `HrPermissionGuard`, `PUT employee/:id/config` → `employees:full` (eski `TODO(rol-gate)` yopildi) |
| `manager/kpi/manager-kpi.controller.ts` | `createMetric`/`updateMetric`/`archiveMetric` → `employees:full`; `explain` ATAYLAB ochiq qoldi (xodim o'z kunini tushuntiradi — mavjud dizayn) |
| `auth/token.service.ts` | `revokeAllForEmployee(employeeId, client?)` — ixtiyoriy tranzaksiya klienti (`RevokeClient` tor tip), chaqiruvchi arxivlash bilan BIR tx'da uzadi |
| `hr/hr-employee/offboarding.service.ts` | `complete()` interaktiv `$transaction`ga o'tdi: `archived:true` + **`hrRoles: []`** + `completedAt` + **`hrEmployeePermission.deleteMany`** + **`tokens.revokeAllForEmployee(id, tx)`**; commit'dan KEYIN `permissions.invalidate(id)` |
| `hr/hr-employee/hr-employee.module.ts` | `PermissionsModule` **oshkora** import (@Global'ga tayanmaslik — `global-di-injection-unguarded` sabog'i) |

**Testlar (TDD: har biri avval QIZIL ko'rildi, keyin yashil):**
- `hr-auth/privilege-escalation.test.ts` **YANGI** 9 — self/o'zga/aktorsiz · admin-grant diff (bor→bor, olib tashlash) · admin bo'lmagan aktor 403.
- `hr-employee-permission/hr-employee-permission.service.test.ts` +2 — o'ziga yozish 403 va `$transaction` **umuman chaqirilmaydi**; o'zgaga yozish o'tadi. ⚠️ **Insident (Faza 16'dagi bilan bir xil klass):** bu faylni `Write` bilan ustidan yozib, mavjud 5 testni yo'q qilgandim — `git show HEAD:` dan tiklab, o'z blokimni USTIGA qo'shdim; 7/7 yashil. *(Sabog'i: mavjud test-faylga faqat qo'shimcha, hech qachon Write.)*
- `hr-employee/hr-employee.service.test.ts` +5 — update self-403 · non-admin admin-grant 403 · admin grant o'tadi · non-admin oddiy rol o'tadi · create admin-grant 403 (mavjud 31 test saqlandi).
- `group/group.controller.test.ts` **YANGI** 4 — POST/PATCH/DELETE metadata + `GET` ataylab ochiqligi qulflandi.
- `manager/kpi/kpi-permission-gate.test.ts` **YANGI** 6 — class'da `HrPermissionGuard` ro'yxatdan o'tgani (**guard bo'lmasa talab metadatasi o'lik** — shuning uchun ikkisi birga tekshiriladi) + 4 handler talabi + `explain` ochiqligi.
- `hr-employee/offboarding.service.test.ts` **YANGI** 4 — revoke O'SHA `tx` bilan chaqiriladi · `hrEmployeePermission` tozalanadi + `hrRoles: []` · `permissions.invalidate` · allaqachon yakunlangan bo'lsa qayta revoke YO'Q (idempotent).

**Gate:** `vitest` — tegilgan modullar (hr, group, manager, auth, permissions) + `app-boot.test.ts`
**1167/1167 yashil**; butun API suite **5293/5296** (2 skip + quyidagi 1 flake; suite tiklashdan
OLDIN yugurtirilgan — tiklash faqat 5 ta mavjud testni qaytardi). `biome check` tegilgan
5 modul: 0 error (13 warning — mavjud, meniki emas). `i18n:gate` — kerak emas (UI-matn tegilmadi).
**Yakuniy repo-gate: `pnpm --filter @moysklad/api typecheck` → 0 xato · `pnpm lint:product` → 0 error**
(743 warning, siyosat bo'yicha ruxsat).
> ⚠️ Ish o'rtasida ikkalasi ham QIZIL edi — **faqat parallel sessiyaning yarim-holati sababli**
> (`payment-gateway`/`money`/`report` + `schema.prisma` + yangi migratsiya ularning daraxtida ochiq
> turardi; 5 tsc xatosi generated Prisma client ularning yangi `paymentInId` sxemasidan orqada
> qolganidan edi). Ularning fayllariga TEGILMADI va `prisma generate` YUGURTIRILMADI (§6.1/§6.4);
> ular `57416518` bilan commit qilgach ikkala gate ham o'z-o'zidan yashil bo'ldi.
> **§6.7B yana takrorlandi:** o'sha commit (`fix(report): faza 17`) mening commit qilinmagan
> `NEXT.md` va `docs/REJA-…md` matnimni ham olib ketdi (280+95 qator) — yo'qolish yo'q, lekin
> Faza 23 hisoboti/hand-off'i **`57416518` ichida**, kod esa quyidagi o'z commit'imda.

**Qolgan guard-siz mutatsiya-controllerlar (reja so'ragan ro'yxat) — 61 handler / 23 controller.**
Skaner: har `@Post/@Patch/@Put/@Delete` handler'ining dekorator bloki `@RequirePermission` YOKI
`@RequireHrPermission` bilan yopilganmi. Uch toifa:

1. **ATAYLAB ochiq (ruxsat KERAK EMAS — token/self-scope o'z himoyasi):** `auth.controller` (login/refresh/
   logout/change-password/pos-pin — o'zi autentifikatsiya sirti; `PATCH me` self-scope), `telegram-webhook`,
   `payment-gateway` (webhook — provider imzosi), `supply-approval-public` + `driver-public` + `publication`
   (magic-link token), `presence` (heartbeat), `notification` (mark-read — o'z bildirishnomasi),
   `user-settings` (`PUT` — o'z sozlamasi), `saved-filter` (o'z filtri), `onboarding` (o'z qadamlari),
   `manager-kpi.explain` (xodim o'z kuni), `product :id/sale-price` (**egasi qarori 2026-07-17: har kassir
   qila oladi** — kodda hujjatlangan, TEGILMADI).
2. **HAQIQIY teshik, keyingi fazaga (ustuvorlik tartibida):** `sklad-keeper` (`PUT /` + `PUT receipt-printer`
   + `DELETE :skladNo` — kompaniya sozlamasi, `settings` entity aniq), `shift-schedule` va `smena`
   (ish-jadval/smena CRUD — davomat va jarimaga ta'sir), `debt.controller:359 POST pos/pay` (**pul** —
   qarz to'lovi), `driver-cash` (`collect`/`hand-over`/`cancel` — **naqd** inkassatsiya),
   `restock-task`, `pick-list` (`sync`/`pick-state`/`printed`), `hr/attendance-geo/ping.controller`
   (`my/*` self-scope, lekin `ping` boshqa xodim nomidan yozilishi mumkinmi — tekshirish kerak),
   `work-location`, `driver-tracking`/`driver-trip` (`DispatcherGuard` bor — qisman yopiq).
3. **HR-RBAC ostidagilar** (`@RequireHrPermission` bor) skanerda «yopiq» sanaladi — ular ikkinchi
   RBAC bilan boshqariladi; `HR-10` bilan bir sinfdagi ikki-RBAC birlashuvi qarzi ochiq qoladi.

**Qolgan qarz / DEFER:**
- **Amaldagi access-JWT (15 daq) offboarding'dan keyin ham tirik** — deny-list yoki qisqaroq TTL bu fazada
  QILINMADI (auditning o'zi ham «ko'rib chiq» degan). Refresh yo'li endi darhol yopiladi.
- **Ikki parallel RBAC** (core `Role/RolePermission` ∥ `HrEmployeePermission`+`hrRoles`) birlashtirilmadi —
  `HR-10`ning strukturaviy ildizi shu; alohida faza talab qiladi.
- `kpi-config` **o'ziga** konfiguratsiya yozish: endi `employees:full` kerak, lekin `employees:full` egasi
  hamon O'Z KPI maqsadini qo'ya oladi (self-check faqat ruxsat/rol yo'llariga qo'yildi). Oylik-eskalatsiya
  qoldig'i — hujjatlandi.
- **Ruxsat qattiqlashuvi QA talab qiladi:** `employees:full`siz menejer endi KPI konfiguratsiyasini saqlay
  olmaydi va `settings` ruxsatisiz foydalanuvchi «Отделы» yarata olmaydi (403). Egada `hrRoles:['admin']`
  bor (seed-hr) ⇒ egaga ta'sir yo'q.
- **Topilgan flake (meniki emas, tuzatilmadi — boshqa faza):** `hr/hr-shared/crypto.util.test.ts` «tampered
  ciphertext» testi oxirgi 2 hex belgini `ff` bilan almashtiradi — shifrmatn allaqachon `ff` bilan tugasa
  «buzish» no-op bo'lib test yiqiladi (~1/256 ehtimol; to'liq suite'da bir marta yiqildi, yakka ishga
  tushirishda yashil).
- Browser-smoke YO'Q — **Phase-1**. Runtime tekshiruv: «Отделы» CRUD, HR ruxsat ekrani, KPI konfiguratsiya
  saqlash, bo'shatishni yakunlash → xodim darhol chiqib ketishi — Phase-2 QA cohort'iga.

---

## Faza 19 — To'lov-gateway → moliyaviy hujjat + idempotency (`INT-02`,`INT-03`,`INT-04`) (2026-08-09) — **Phase-1: strukturaviy + unit-tasdiqlangan, browser-smoke YO'Q**

### Da'volarni kodda tasdiqlash (reja §2) — 3/3, lekin BITTA MISOL NOTO'G'RI
- **`INT-02` TASDIQLANDI.** `paymePerform` faqat `status:'captured'` yozardi; `handleClickCallback`
  action=1 ham shunday. `grep -rl paymentGatewayTx apps/api/src` → **yagona fayl** (boshqa iste'molchi
  yo'q) ⇒ gateway puli daftarga umuman kirmasdi.
- **`INT-03` TASDIQLANDI, misoli esa YO'Q.** Kod haqiqatan `Number(order.sumMinor) !== Number(params.amount) * 100`
  edi. Ammo audit keltirgan misol (`115.23 → 11523.000000000002`) **noto'g'ri**: o'lchandi —
  `115.23 * 100 === 11523` AYNAN. Bug-klass real, uni ko'rsatuvchi qiymatlar boshqa:
  `0.29 → 28.999999999999996`, `8.29 → 828.9999999999999`, `19.99 → 1998.9999999999998`.
  Test ana shu **o'lchangan** qiymatlarda yozildi (audit misoli bilan yozilsa test yashil bo'lib,
  «fix ishladi» degan yolg'on dalil bo'lardi).
- **`INT-04` TASDIQLANDI.** `schema.prisma` da faqat `@@index([providerTxId])`; Click PREPARE mavjudlik
  tekshiruvisiz `create` qilardi, `paymeCreate` esa check-then-act edi.

### O'zgarishlar
1. **`INT-02` — capture → PaymentIn draft.** `settleCapture()` (yangi): (a) **atomik claim**
   `updateMany({where:{id, OR:[{status:{not:'captured'}}, {paymentInId:null, errorMsg:{not:null}}]}})` —
   parallel ikki Perform'dan faqat bittasi `count===1` oladi; (b) `writeCapturePaymentIn()` —
   `PaymentInService.create` orqali **draft** PaymentIn + `operations:[{targetKind:'customerorder'}]`
   bog'lanishi; (c) `paymentInId` tx'ga yoziladi. Xato bo'lsa `errorMsg` yoziladi va xato yuqoriga
   otiladi ⇒ Payme/Click qayta chaqiradi va claim'ning **ikkinchi shoxi** qayta urinadi (o'z-o'zini
   tuzatish). Click COMPLETE ham shu yo'ldan; xatoda `FAILED_TO_UPDATE_USER` qaytadi.
   `paymeCancel` capture'dan keyingi bekorda **loud warn + `providerLog.refundPendingPaymentInId`**.
2. **`INT-03` — float yo'q qilindi.** `parseClickAmountToMinor()` (click.protocol.ts): o'nlik STRING
   butun/kasr qismga bo'linib BigInt tiyin yig'iladi; yaroqsiz format → `null` ⇒ INCORRECT_AMOUNT
   (NaN jim o'tmaydi). Payme tomonida `paymeAmountMatches()` — `BigInt` solishtiruv
   (`Number(sumMinor)` 2^53 dan katta summada yaxlitlardi).
3. **`INT-04` — DB darajasida idempotency.** `@@unique([accountId, provider, providerTxId])` +
   migratsiya `20260809120000_gateway_payment_in_link_and_unique`. `paymeCreate` va Click PREPARE:
   existing-check → `create` → **P2002 catch** → g'olib yaratgan qatorni qaytarish
   (`findByProviderTxIdOnConflict`). NULL `providerTxId` (operator `initiatePayment`) cheklovga
   tushmaydi — Postgres NULL'larni teng deb hisoblamaydi.
4. **Yo'l-yo'lakay (mening topilmam, rejada yo'q edi):** (a) `paymeCreate` summani buyurtma bilan
   **umuman tekshirmasdi** — endi `amountMinor` to'g'ridan-to'g'ri PaymentIn summasiga aylangani uchun
   bu majburiy bo'ldi (aks holda soxta CreateTransaction hujjatga yolg'on summa yozardi);
   (b) takroriy `PerformTransaction` har safar **yangi `perform_time`** qaytarardi — Payme uni
   solishtiradi; endi saqlangan `capturedAt` qaytariladi; (c) UZS bo'lmagan buyurtmada capture
   **TO'XTAYDI** (gateway UZS tiyinda ishlaydi; `M-03/M-04` sinfidagi ~12 000× xatoning oldi olindi).
5. **`PaymentInService.create(accountId, userId: string|null, raw)`** — webhook'da inson-aktor yo'q.
   Soxta «tizim xodimi» O'YLAB TOPILMADI (u kimningdir ismi ostida yolg'on audit-iz qoldirardi):
   egalik buyurtmadan (`ownerId`/`groupId`) meros oladi, `AuditLog.userId` esa `null` (ustun nullable).
6. **Modul simlash + qo'riqchi.** `PaymentGatewayModule.imports += PaymentInModule` (OSHKORA —
   `global-di-injection-unguarded` sinfi). `app-boot.test.ts` dagi «in'yeksiya premisasi» bloki
   `describe.each(INJECTION_PREMISES)` ga aylantirildi; ro'yxatga `PaymentInService→PaymentInModule`
   qo'shildi. **Vakuum emasligi o'lchandi**: importni olib tashlab yugurtirildi → test QIZIL.

### Testlar (TDD — avval yiqildi, keyin yashil)
`payment-gateway.service.test.ts` (yangi, 12 test). **RED jonli o'lchandi: 9 qizil / 3 yashil**
(3 yashil = ataylab negativ-nazorat: haqiqiy nomuvofiq summa, buzuq `'abc'`, ketma-ket paymeCreate).
Soxta Prisma `updateMany` semantikasi **haqiqiy** (shart joriy qator holatiga solishtiriladi) —
`vi.fn(async()=>({count:1}))` mock'i claim-poygasini ko'rsata olmasdi. Qamrov: Payme Perform →
PaymentIn (barcha maydonlar + `userId===null`) · Click COMPLETE → PaymentIn · **takroriy Perform →
PaymentIn FAQAT 1 marta + o'sha `perform_time`** · PaymentIn yiqilsa → `errorMsg` + keyingi retry
qayta yaratadi · 19.99/0.29/8.29 PREPARE'dan o'tadi · nomuvofiqlik va `'abc'` hamon rad · Payme 2^53+1
aniqlik · takroriy PREPARE/CreateTransaction bitta qator · P2002 poygasi.

### Gate (jonli o'lchangan)
- `@moysklad/api typecheck` → **0**
- vitest: `payment-gateway` + `payment-in` + `bank-import` + `app-boot` → **116/116**
  (+ `customer-order`/`money` bilan kengaytirilgan yugurtish → **172/172**)
- `i18n:gate` → **9/9** (UI-matn tegilmadi)
- Migratsiya lokal `climart_adopt`ga qo'llandi; `migrate diff` → mening obyektlarim uchun **drift 0**
  (qolgan diff = oldindan mavjud indeks-RENAME'lar, meniki emas). `prisma generate` bajarildi.
- ⚠️ **`pnpm lint:product` PATH-CHEKLANGAN (§6.6):** repo-wide qizil — `apps/api/src/modules/report/*`
  (parallel sessiyaning Faza 17 ishi, daraxtda commit qilinmagan holda turibdi). **Mening 5 faylim
  biome: 0 error, 0 warning** (alohida yugurtirildi).
- **Browser-smoke YO'Q.**

### 🟠 Qolgan qarz / DEFER
1. **Bitta DB-tranzaksiya emas** (reja «(tx) ichida» degan edi). `PaymentInService.create` o'z
   klientida ishlaydi; uni tashqi `tx`ga o'tkazish butun servisni qayta simlashni talab qilardi.
   O'rniga atomik claim + retry-shoxi qo'yildi. **Qoldiq oyna (halol):** claim yozildi-yu hujjat
   yozilmadi VA provider boshqa retry yubormasa — qator `captured + paymentInId=null + errorMsg`
   bo'lib qoladi. Bu **ko'rinadigan** qarz (operator filtri), jimgina yo'qolish emas.
2. **Refund hujjati YO'Q.** `paymeCancel(-2)` faqat ogohlantiradi + `providerLog`ga yozadi; teskari
   moliyaviy hujjat avtomatik yaratilmaydi (reja ham «qaytarish YOKI admin-xabar» deb qoldirgan edi).
3. **PaymentIn `draft` bo'lib qoladi** — post qilinmaydi, ya'ni balans/pul-daftari **hali** o'zgarmaydi.
   Bu ataylab: avtomatik post qilish Faza 3/11 ledger yo'llarini webhook'dan ishga tushirardi.
   Operator draft'ni ko'radi va o'zi post qiladi. To'liq avtomatlashtirish — alohida faza.
4. **UZS bo'lmagan buyurtmada capture to'xtaydi** (yuqorida) — ko'p-valyutali gateway alohida ish.
5. **Prod migratsiya xavfi:** `sherset_v2` sxema-drift muhitida `CREATE UNIQUE INDEX` mavjud
   dublikatlar bo'lsa **yiqiladi** (ataylab — pul qatorlari jimgina o'chirilmaydi). Deploydan oldin
   migratsiya izohidagi `SELECT ... HAVING COUNT(*) > 1` so'rovini yugurtirish kerak.
   Lokalda tekshirildi: jadval bo'sh (0 qator).
6. `initiatePayment` (operator yo'li) capture'ga ulanmagan — Payme/Click redirect oqimida ishlatilmaydi.

---

## Faza 24 — EDO PFX shifrlash + ApiToken scopes (2026-08-09) — **Phase-1: strukturaviy + unit-tasdiqlangan, browser-smoke YO'Q**

**Topilmalar kodda tasdiqlandi (§2) — ikkalasi ham HAQIQIY, audit xato o'qimagan:**
- `INT-06` — `edo.service.ts:99-114`: `/** Upload PFX bytes (binary) — encrypted at rest. */` kommenti
  ostida `data: { pfxCipher: pfxBytes, pfxPassCipher: encryptPassword(pfxPass) }`. Ya'ni ECP xususiy
  kaliti **o'z holicha** (maydon nomi `Cipher` bo'lsa-da), paroli esa **yonida shifrlangan** yozilardi.
  Butun repo bo'yicha `pfxCipher` ning yagona o'quvchisi `sign()` (218-220) edi — u ham faqat
  «bor/yo'q» tekshirardi, hech qachon deshifr qilmasdi (shuning uchun bug hech qayerda «sezilmasdi»).
- `INT-07` — `api-token.guard.ts:66`: `permissions: ['*']` qat'iy; `apiToken.scopes` guard'da **umuman
  o'qilmasdi** (grep bilan tasdiq: `scopes` moysklad-compat ichida faqat `api-token.service.ts:25`
  list-select va `:49` create-yozuv). `ApiTokenGuard` esa faqat `MoyskladCompatController` da ishlatiladi
  (butun `apps/api` bo'yicha 2 chaqiruv joyi) ⇒ enforcement uchun yagona nuqta shu guard.

**Fayllar**

| Fayl | O'zgarish |
|---|---|
| `email/crypto.ts` | **+3 eksport**: `encryptBuffer` / `decryptBuffer` / `isEncryptedBuffer` — `Bytes` ustunlar uchun binar AES-256-GCM o'ram. Format: `MAGIC('MSENCB1'):7 ‖ iv:12 ‖ tag:16 ‖ cipher:N`. Mavjud `encryptPassword`/`decryptPassword` **tegilmadi** (10 modul chaqiradi) |
| `edo/edo.service.ts` | `setPfx` → `pfxCipher: encryptBuffer(pfxBytes)`; komment haqiqatga keltirildi (bug tarixi bilan). **YANGI** `loadSignerMaterial(accountId)` — `pfxCipher` ning yagona o'qish yo'li: deshifr + parol + `legacyPlaintext` bayrog'i. `sign()` endi presence-check o'rniga shu metodni chaqiradi (deshifr yo'li **tirik**, imzolashda yaroqsiz kalit aniq xato beradi) |
| `moysklad-compat/api-token.scope.ts` | **YANGI** sof modul (DI'siz, prisma'siz): `normalizeScopes`, `isScopeSyntaxValid`, `scopesGrantFullAccess`, `slugFromRemapUrl`, `actionFromMethod`, `isCompatActionAllowed`, `scopesToPermissions` |
| `moysklad-compat/api-token.guard.ts` | Token topilgach: `scopes` normallashtiriladi → URL'dan slug + method'dan action → ruxsat yo'q bo'lsa **403 `ForbiddenException`**; `permissions: ['*']` → `scopesToPermissions(scopes)` |
| `moysklad-compat/api-token.service.ts` | `create` — scope sintaksisi tekshiriladi (`BadRequestException`) va normallashtirilib saqlanadi (`input.scopes ?? []` o'rniga) |

**Scope shartnomasi (hujjatlangan qaror):**
`*` = hammasi · `<slug>` = o'sha slug'ga read+write · `<slug>:read` = faqat o'qish · `<slug>:write` = yozish (read'ni ham qamraydi).
- **Bo'sh `scopes` = TO'LIQ KIRISH** — reja «bo'sh scopes = '*' faqat ochiq hujjatlansa» degan edi, shu
  yerda va modul doc-blokida oshkora hujjatlandi. Sabab: **mavjud tokenlarning hammasi `scopes: []`**
  (UI yo'q, `CreateTokenSchema` default `[]`) — «bo'sh = hech narsa» qilsak, jonli 1C/CLIMART-proxy
  integratsiyalari deploy kunida to'liq o'lardi. Cheklash = scope'ni **atay nomlash**.
- Qolgan hamma narsa **fail-closed**: noma'lum/typo slug hech narsa ochmaydi. Shuning uchun typo
  yaratish paytida rad etiladi (birinchi 403 dan emas).
- Slug **URL'dan** o'qiladi (`req.params` emas): compat router prod'da global prefiks ostida
  (`/api/v1/api/remap/1.2/...`), testda esa prefikssiz — URL yagona barqaror manba.
- `_compat/slugs` (discovery) scope'siz o'tadi — akkaunt ma'lumoti bermaydi, faqat qo'llab-quvvatlanadigan
  slug nomlari.
- Scoped token `permissions` ga **`compat:<slug>:<action>`** oladi — bu ataylab ichki
  `entity.action` nomlar fazosiga MOS EMAS: ertaga kimdir compat marshrutiga `PermissionsGuard` qo'ysa,
  natija wildcard emas, **rad** bo'lishi kerak.

**Testlar (TDD: 20 test avval QIZIL ko'rildi — `20 failed | 90 passed`, keyin implementatsiya):**
- `email/crypto.test.ts` **+10** (mavjud 6 saqlandi) — binar round-trip · shifrmatnda ochiq bayt YO'Q
  (`cipher.includes(plaintext)` = false) · tasodifiy IV · `isEncryptedBuffer` xom PFX'ni ajratadi
  (PKCS#12 `0x30` bilan boshlanadi ⇒ ASCII magic bilan kolliziya bo'lishi mumkin emas) · buzilgan
  auth-tag → throw · **belgisiz (eski) kirishni deshifr qilishni RAD etadi** (axlat qaytarmaydi) ·
  boshqa kalit → throw · 4KB blob · bo'sh kirish.
- `edo/edo.service.test.ts` **YANGI 7** — DB'ga yozilgan bayt shifrlangan va `PRIVATE-KEY-MATERIAL`
  ni O'Z ICHIGA OLMAYDI · `bytes` haqiqiy (o'ram emas) uzunlik · yozib-o'qish round-trip aynan ·
  **eski shifrlanmagan qator o'qilaveradi** (`legacyPlaintext: true`) · PFX yo'q → `BadRequest` ·
  `sign()` regress: PFX yo'q → rad, shifrlangan PFX bilan → `signed`.
- `moysklad-compat/api-token.scope.test.ts` **YANGI 35** — grammatika, normalizatsiya, URL→slug
  (prefiksli/prefikssiz/`?query`/`/positions`/`/metadata`/katta harf), read≠write, typo fail-closed.
- `moysklad-compat/api-token.guard.test.ts` **YANGI 10** — scoped token o'z slug'iga kiradi ·
  **boshqa slug'ga 403** (asosiy teshik) · read-scope bilan POST → 403 · detail/positions/metadata
  marshrutlari ham qamrab olingan · bo'sh scopes → o'tadi va `permissions: ['*']` · `lastUsedAt`
  bump regress · revoked/`Basic`/topilmagan token uchun eski auth xulqi o'zgarmagan.
- `moysklad-compat/api-token.service.test.ts` **YANGI 4** — normalizatsiya · bo'sh scope · yaroqsiz
  scope rad (`create` **umuman chaqirilmaydi**) · plaintext token formati regress.

### Gate (jonli o'lchangan)
- `pnpm --filter @moysklad/api typecheck` → **0 xato**
- `vitest run` **butun API suite → 414 fayl / 5388 passed, 0 failed** (2 skip) — regress yo'q.
  Tegishli modullar alohida: `edo` + `moysklad-compat` + `email` → **172/172**.
- `biome check` tegilgan 3 katalog (`edo`, `email`, `moysklad-compat`) → **0 error** (8 warning —
  `moysklad-compat.service.ts` dagi mavjud `any`lar, meniki emas).
- ⚠️ **`pnpm lint:product` PATH-CHEKLANGAN (§6.6):** repo-wide 4 format-xatosi bilan qizil —
  `shared/timing-safe.ts(+test)`, `shared/constant-time-secret-class.test.ts`,
  `telegram/telegram-config-patch.test.ts`. Bular **parallel sessiyaning** daraxtda ochiq turgan
  ishi (§6.1) — TEGILMADI. Mening 5 faylim format'dan o'tkazildi va toza.
- `i18n:gate` — kerak emas (UI-matn tegilmadi).
- Migratsiya — **YO'Q** (sxema tegilmadi: `pfxCipher` allaqachon `Bytes`, `scopes` allaqachon `String[]`).
- **Browser-smoke YO'Q.**

### 🟠 Qolgan qarz / DEFER
1. **Mavjud PFX qatorlari DB'da OCHIQ qoladi.** Kod ikkala formatni ham o'qiydi; shifrlash faqat
   **qayta yuklashda** bo'ladi. Migratsiya-skript yozilmadi (ataylab: kalit `EMAIL_ENCRYPTION_KEY`
   prod'da to'g'ri o'rnatilganini bilmasdan ommaviy re-encrypt qilish — kalitni yo'qotsa PFX ni
   o'qib bo'lmay qolish xavfi). O'qishda `WARN [EdoService] ... stored UNENCRYPTED (pre-Faza-24 row)`
   loglanadi — operator ko'rib qayta yuklaydi. **Prod'da EDO hali ulanmagan** (signer/provider stub),
   shuning uchun ehtimol 0 qator.
2. **Mavjud tokenlar hamon to'liq kirishga ega** (`scopes: []`). Enforcement mexanizmi tayyor, lekin
   **hech bir tokenda scope yo'q** ⇒ bugungi kunda amaliy cheklov 0. Cheklash uchun admin scope
   berishi kerak.
3. **`/settings/api-tokens` UI MAVJUD EMAS** — `api-token.controller.ts:23` kommenti «UI:
   /settings/api-tokens (admin-only)» deydi, lekin `apps/web` da bunday sahifa yo'q (grep:
   `admin/api-tokens` bo'yicha 0 frontend chaqiruvi). Token va scope faqat to'g'ridan-to'g'ri API
   orqali beriladi. Scope UI (checkbox-matritsa + slug ro'yxati `_compat/slugs` dan) — alohida ish.
4. **Scope slug'i ro'yxatga solishtirilmaydi** — faqat sintaksis. `SLUGS` konstanta
   `moysklad-compat.service.ts` ichida yopiq; uni scope-modulga eksport qilish servis-import
   bog'liqligini keltirardi. Typo fail-closed bo'lgani uchun xavfsiz, lekin admin xatosini
   yaratish paytida tutmaydi (403 da ko'rinadi).
5. **`apiTokenCipher` (EDO provider tokeni) hech qachon deshifr qilinmaydi** — `submit()` da
   `decryptPassword` chaqiruvi komment ichida turibdi, provider HTTP hali simlangan emas. Bu
   `INT-06` dan tashqarida, faza-doirasidan chetda qoldi.

---

## Faza 21 — Telegram webhook secret + gateway timing-safe (`INT-01`/`AUTH-01`, `INT-14`, +`INT-13`) (2026-08-09) — **Phase-1: strukturaviy + unit-tasdiqlangan, browser-smoke YO'Q**

### Da'volarni kodda tasdiqlash (reja §2) — 3/3 TASDIQLANDI
- **`INT-01`/`AUTH-01` TASDIQLANDI.** `telegram-webhook.controller.ts:20` sarlavhani
  `@Headers('x-telegram-bot-api-secret-token') _secretHeader` deb olardi va **hech qayerda
  solishtirmasdi** (underscore + «V2: validate» komment). Controller'da `@UseGuards` yo'q;
  `app.module.ts:286` dagi yagona global guard `KioskGuard` (kassir izolyatsiyasi), auth EMAS —
  ya'ni endpoint haqiqatan **butunlay ochiq** edi. `handleInbound` (`telegram.service.ts`) esa
  `cbq.data.startsWith('sa:')` bo'lsa to'g'ridan-to'g'ri `supplyApproval.handleApprovalCallback`
  ga o'tardi ⇒ accountId'ni bilgan har kim qabulni «tasdiqlashi» mumkin edi.
- **`INT-14` TASDIQLANDI.** `payme.protocol.ts:127` `return pass === secretKey;`,
  `click.protocol.ts:113` `return expected === params.sign_string;` — ikkalasi ham guard'siz
  ochiq POST endpointlar orqasida. **Audit ko'rmagan qo'shimcha:** xom `===` shu bilan birga
  **fail-OPEN** ham edi — sozlanmagan (bo'sh) sirda `'' === ''` ⇒ `true`.
- **`INT-13` TASDIQLANDI** (reja «bu fazada ham ko'r» degan edi, va haqli ekan):
  `telegram.service.ts:114-116` `webhookUrl: parsed.webhookUrl ?? null` (+secret, +defaultChatId)
  — faqat botToken yangilangan so'rov uchala maydonni NULL'ga reset qilardi. `INT-01` fixidan
  keyin bu **MEDIUM bug'dan HIGH ta'sirli uzilishga** aylanardi (secret null ⇒ hamma update 401).

### O'zgarishlar
1. **Yangi umumiy helper `shared/timing-safe.ts` — `secretEquals(a, b)`.** Ikkala tomon avval
   **SHA-256 digest**iga o'tkaziladi, keyin `crypto.timingSafeEqual`. Digest doim 32 bayt bo'lgani
   uchun (a) uzunlik farq qilsa xom `timingSafeEqual` kabi **throw qilmaydi**, (b) odatdagi
   `a.length !== b.length` erta-qaytishi qoldiradigan **uzunlik-oracle ham yopiladi**.
   **FAIL-CLOSED:** `undefined`/`null`/`''` tomon hech qachon mos kelmaydi.
2. **`INT-01` — `TelegramService.assertWebhookSecret(accountId, header)`** (yangi) + controller
   uni `handleInbound`dan **OLDIN** `await` qiladi. 401 beradigan holatlar: sarlavha yo'q/bo'sh ·
   sir mos kelmadi · config'da `webhookSecret` null · akkaunt config'i umuman yo'q. Ya'ni
   «sozlanmagan sir = tekshiruvsiz o'tkazish» YO'Q (reja shuni talab qilgan edi).
3. **`setWebhook` endi secret'siz webhook o'rnatmaydi.** Operator bermasa
   `randomBytes(32).toString('hex')` generatsiya qilinadi va Telegram'ga ham, DB'ga ham
   **o'sha qiymat** yoziladi. Aks holda (2) bilan birga «o'rnatdim-u hech narsa kelmayapti»
   tuzog'i tug'ilardi.
4. **`businessStatus` ga `webhookSecretSet` qo'shildi** (rejada yo'q, MENING topilmam). Eski
   `webhookSet` faqat `!!cfg.webhookUrl` ga qaraydi ⇒ fail-closed'dan keyin «URL bor, secret yo'q»
   holati UI'da **«sozlangan» bo'lib ko'rinib**, amalda har update 401 bo'lardi — aynan jim-nosozlik
   klassi. Endi ikkinchi signal bor.
5. **`INT-14` — ikkala protokolda `secretEquals`.** `verifyPaymeAuth`: `pass === secretKey` →
   `secretEquals(pass, secretKey)`; `verifyClickSign`: `expected === params.sign_string` →
   `secretEquals(...)`. (Click MD5'ning o'zi provider protokoli majburiyati — unga chora yo'q.)
6. **`INT-13` — `saveConfig` da PATCH-semantika.** `...(parsed.X !== undefined ? {X: parsed.X} : {})`
   uslubi (email/sms saveConfig'lardagi mavjud naqsh). Schema `optionalEmpty` bo'sh stringni `null`
   qilgani uchun **ataylab tozalash** hamon ishlaydi — «kelmagan» (undefined) va «tozala» (`''`)
   farqlanadi.

### Testlar (TDD — avval yiqildi, keyin yashil)
**RED jonli o'lchandi: 5 fayl / 14 test qizil, 41 yashil.** Yangi fayllar:
`shared/timing-safe.test.ts` (7) · `shared/constant-time-secret-class.test.ts` (4, klass-qulf) ·
`telegram/telegram-webhook.auth.test.ts` (9) · `telegram/telegram-config-patch.test.ts` (4) ·
+1 test mavjud `payment-gateway.schema.test.ts` ga qo'shildi (`git add` bilan Edit, ustidan
Write QILINMADI — `never-write-over-existing-test-file` xotirasi).
Muhim RED dalili: controller testi «promise resolved `{ok:true}` instead of rejecting» bilan
yiqildi — ya'ni soxta secret bilan `handleInbound` **haqiqatan chaqirilardi**.
- **Klass-qulf non-vacuity JONLI O'LCHANDI:** `secretEquals(pass, secretKey)` bir qatorini
  `pass === secretKey` ga qaytarib yugurtirildi → klass-qulf **VA** xulq-testi ikkalasi QIZIL;
  keyin tiklandi va `diff` bilan **bayt-identik** ekani tasdiqlandi. Qulf kommentlarni
  `stripComments()` bilan tashlaydi — aks holda fixning o'z izohi («ilgari `pass === secretKey`
  edi») regressiya deb o'qilib yolg'on-qizil berardi (bu birinchi yugurtishda haqiqatan yuz berdi).
- Timing'ning O'ZI test qilinmaydi (o'lchov flaky bo'lardi) — shuning uchun `timingSafeEqual`
  ishlatilgani **manba darajasidagi klass-qulf** bilan lock qilingan, xulq esa fail-closed
  testlari bilan.

### Gate (jonli o'lchangan)
- `@moysklad/api typecheck` → **0**
- `pnpm lint:product` → **0 error** (743 warning, siyosat bo'yicha ruxsat)
- vitest scoped: `shared` + `telegram` + `payment-gateway` + `supply-approval` + `__tests__` →
  **661/661**; **butun API suite → 5388 passed / 2 skipped / 0 fail** (415 fayl)
- `i18n:gate` → **9/9** (UI-matn tegilmadi; 401 xabari mashinaga ketadi)
- Migratsiya YO'Q (sxema tegilmadi). **Browser-smoke YO'Q.**

### 🔴 DEPLOY-BLOKER (deploydan OLDIN o'qi)
Tekshiruv **fail-closed**. Prod'da `TelegramConfig.webhookSecret` sozlanmagan (null) akkauntda
deploydan keyin **inbound Telegram butunlay to'xtaydi** — jumladan **JONLI qabul-tasdiqlash
(supply-approval) inline tugmalari**. DB-backfill bu yerda YECHIM EMAS: sirni Telegram tomoni ham
bilishi kerak, u esa faqat `setWebhook` chaqiruvi bilan o'rnatiladi.
**Tuzatish (har akkaunt uchun, 1 chaqiruv):** `POST /api/v1/telegram/config/webhook`
`{ "url": "<mavjud webhook URL>" }` — `secret` berilmasa avtomat generatsiya qilinadi va ikkala
tomonga yoziladi. Tekshirish: `GET /api/v1/telegram/business-status` → `webhookSecretSet: true`.

### 🟠 Qolgan qarz / DEFER
1. **`webhookSecretSet` UI'da ko'rsatilmaydi** — API qaytaradi, `telegram-chat-card.tsx` dagi
   `BusinessStatus` tipi va badge yangilanmadi (web fazasi emas). Operator hozircha endpointdan
   ko'radi.
2. **Rate-limit / replay himoyasi yo'q.** Secret to'g'ri bo'lsa update cheksiz qabul qilinadi;
   Telegram `update_id` bo'yicha dedup ham yo'q (takroriy yetkazishda `sa:` callback ikki marta
   ishlanishi mumkin — `supply-approval` o'z FSM qulfiga tayanadi).
3. **Secret rotatsiyasi atomik emas** — `setWebhook` avval Telegram'ga, keyin DB'ga yozadi; ikki
   yozuv orasida kelgan update eski sir bilan 401 oladi (oyna millisekundlar, Telegram retry qiladi).
4. **`INT-13` faqat `telegram` saveConfig'da tuzatildi** — boshqa integratsiya saveConfig'larida
   (`onec`, `marketplace`, `bank-adapter`…) shu naqsh borligi TEKSHIRILMADI, faza doirasidan tashqarida.
5. `payment-gateway.service.ts:184` dagi `!creds.secretKey` old-tekshiruvi qoldirildi (endi
   ortiqcha, chunki `secretEquals` fail-closed) — zararsiz ikki qatlam.

---

## Faza 25 — DB indeks-paket: hot-FK + barcode GIN + INN/yacheyka expression (`DB-04`,`DB-05`,`DB-08`,`PERF-12`,`PERF-14`) (2026-08-09) — **Phase-1: strukturaviy + EXPLAIN-tasdiqlangan, browser-smoke YO'Q**

**Topilma tasdiqlanishi (o'z ko'zim bilan `schema.prisma`da).** Beshalasi ham TASDIQLANDI — audit
xato o'qimagan. Indeks bloklari fix'dan oldin:
- `RetailSale` (7980-7983): `[accountId,sessionId,state]`, `[accountId,state,moment]`,
  `[accountId,customerOrderId]` — **`agentId` YO'Q** (`Demand`da `[accountId,agentId]` bor) ⇒ `PERF-12` ✔
- `CustomerOrder` (5226-5231): name, state+deletedAt, agentId, moment, ownerId, salesChannelId —
  **statusId/contractId/projectId/storeId YO'Q** ⇒ `DB-08` ✔
- `Demand` (6170-6187): contractId/projectId **bor**, lekin **statusId YO'Q** ⇒ `DB-08` ✔ (drift dalili)
- `Debt` (10494-10503): **`problem` YO'Q** ⇒ `DB-08` ✔
- `Product` (5030-5041): faqat `name` trgm GIN — **`barcodes` GIN YO'Q** (`DB-04` ✔),
  **`attributes` uchun hech narsa YO'Q** (`PERF-14` ✔)
- `Counterparty` (2059-2065): `uz_requisites` uchun hech narsa YO'Q ⇒ `DB-05` ✔

### 🔴 Reja taklif qilgan ifoda XATO edi (fazaning eng muhim topilmasi)

Reja `((uz_requisites->>'inn'))` va `((attributes->>'__yacheyka'))` expression-indekslarini aytdi.
**Ikkalasi ham hech qachon ishlatilmasdi.** Sabab — Postgres expression-indeksni **parse-daraxt
tengligi** bo'yicha tanlaydi, ORM filtri qanday o'qilishi bo'yicha emas. Prisma 5.22 nima emit
qilishini `log: ['query']` bilan **jonli qo'lga oldim**:

| so'rov joyi | Prisma emit qiladi | reja taklifi | mos keladimi |
|---|---|---|---|
| `counterparty.service.ts:174` (`string_contains`) | `(uz_requisites #>> ARRAY['inn']::text[]) LIKE '%…%'` | `->>` btree | **YO'Q** — (a) `#>>` ≠ `->>` (ikki xil funksiya), (b) `%…%` leading-wildcard btree'ni butunlay chetlaydi |
| `product.service.ts:556` (`path`+`equals`) | `(attributes #> ARRAY['__yacheyka']::text[])::jsonb::jsonb = $1` | `->>` btree | **YO'Q** — `#>` **jsonb** qaytaradi, `->>` **text**; taqqoslash ham jsonb |

To'g'ri ifodalar EXPLAIN normalizatsiyasidan olindi (`::jsonb` no-op cast'lar tushib qoladi):
`(attributes #> '{__yacheyka}'::text[])` va `(uz_requisites #>> '{inn}'::text[])` + **`gin_trgm_ops`**
(LIKE uchun yagona ishlaydigan opclass).

**Fayllar**

| Fayl | O'zgarish |
|---|---|
| `packages/db/prisma/schema.prisma` | 8 ta `@@index` (+ sabab-kommentlari): `Product.barcodes` GIN `ArrayOps`; `CustomerOrder.statusId/contractId/projectId/storeId`; `Demand.statusId`; `RetailSale.agentId`; `Debt [accountId,problem,status]` |
| `packages/db/prisma/migrations/20260809140000_perf_index_pack_fk_barcode_inn_cell/migration.sql` | **YANGI** — 10 `CREATE INDEX IF NOT EXISTS` (8 sxema-hosilaviy + 2 expression) + `CREATE EXTENSION IF NOT EXISTS pg_trgm` |

Kod-mantiq **tegilmadi** (0 `.ts` o'zgarishi). Unique/constraint **qo'yilmadi** (reja talabi).

**Qaror: FK indekslar bir ustunli (`[statusId]`, `[agentId]` — `[accountId, …]` EMAS).**
Reja `[accountId, statusId]` degan edi, lekin `DB-08`ning o'z impact-matni FK-skan haqida:
ota-yozuv o'chganda `ON DELETE SET NULL` **`WHERE status_id = $1`** yuritadi — unda `account_id`
YO'Q, ya'ni `accountId` yetakchi kompozit indeks **bu skanni umuman qoplamaydi**. Bu UUID FK'lar
allaqachon akkaunt-unique bo'lgani uchun bir ustunli indeks list-filtrni ham to'liq qoplaydi.
Jonli dalil (quyida): RI-skan fix'dan oldin `Seq Scan`, keyin `Index Scan`.

**`Debt.problem` — partial EMAS, kompozit.** Reja `WHERE problem` partial indeksni aytdi (kichikroq),
lekin uni Prisma sxemada e'lon qila olmaydi. `[accountId, problem, status]` — aynan
`debt.service.ts:470` (`scope==='problem'`) predikati, va sxemada ko'rinadi.

### Testlar — EXPLAIN RED→GREEN (jonli, lokal `climart_adopt@5432`)

TDD bu yerda unit-test emas, **EXPLAIN**: har predikat migratsiyadan oldin/keyin o'lchandi
(`enable_seqscan=off` — kichik dev-jadvalda indeksning *yaroqliligini* narx afzalligidan ajratish uchun).

| topilma | OLDIN | KEYIN |
|---|---|---|
| `PERF-14` yacheyka | `Filter: (attributes #> …)` | **`Index Cond`** → `products_yacheyka_idx` |
| `DB-08` CustomerOrder statusId | `Filter: (status_id = …)` | **`Index Cond`** → `customer_orders_status_id_idx` |
| `DB-08` CustomerOrder store/contract/project | `Filter` (3 ta) | **`Index Cond`** (3 ta) |
| `DB-08` Demand statusId | `Filter` | **`Index Cond`** → `demands_status_id_idx` |
| `DB-08` Debt problem-scope | `Filter: (problem AND status…)` | **`Index Cond`** (uchala ustun) |
| `PERF-12` semi-join | `Seq Scan on retail_sales` | **`Index Only Scan`** → `retail_sales_agent_id_idx` |
| RI-skan `DELETE state → customer_orders` | **`Seq Scan`** | **`Index Scan`** |
| RI-skan `DELETE counterparty → retail_sales` | `Seq Scan` | **`Index Scan`** |

**Hajm-testi (30k qator, tranzaksiya ichida INSERT + `ANALYZE` → `ROLLBACK`, dev-DB o'zgarmadi;
planner sozlamalari DEFAULT — hech narsa o'chirilmagan):**
- `PERF-12` «Покупатели»: `retail_sales` 30k → **`Index Only Scan using retail_sales_agent_id_idx`**
  (subplan narxi 1948 → 8.30). Fazaning eng katta yutug'i.
- `PERF-14` yacheyka: **`Index Scan using products_yacheyka_idx`** (583 → 4.17 LIMIT bilan).
- `DB-05` INN: **`Bitmap Index Scan using counterparties_inn_trgm_idx`**.
- `DB-04` barcode: ro'yxat-so'rovi (`ORDER BY name LIMIT 50`) va `count(*)` → **GIN ishlatiladi**;
  `findFirst` (`LIMIT 1`) → **SEQ SCAN qoladi** (pastda, DEFER-1).

### Gate (jonli o'lchangan)
- `@moysklad/api typecheck` → **0** · `@moysklad/db typecheck` → **0**
- `pnpm lint:product` → **0 error** (743 warning, siyosat bo'yicha ruxsat)
- `prisma db execute` → migratsiya lokal DB'ga qo'llandi; **10/10 indeks `pg_indexes`da tasdiqlandi**;
  fayl **ikkinchi marta** yugurtirildi → idempotent (`IF NOT EXISTS`)
- `prisma migrate diff` (drift) → **yangi drift YO'Q** (mavjud 9 ta kosmetik `RENAME INDEX` mening
  ishimdan OLDIN ham bor edi — tegilmadi)
- `prisma generate` → OK
- vitest: modul-scoped (product/counterparty/customer-order/demand/retail-sale/debt) **902/902**;
  **butun API suite → 5390 passed / 2 skipped / 0 fail** (414 fayl) — regress YO'Q
- `i18n:gate` yugurtilmadi — UI-matn tegilmadi (0 `.ts`/`.tsx` o'zgarishi)
- **Browser-smoke YO'Q.**

### 🟠 Qolgan qarz / DEFER
1. **`DB-04` yarim yopildi.** Barcode GIN **mavjud va mos keladi** (dalil: account-predikatsiz so'rovda
   `Bitmap Index Scan`), lekin POS-ning `findFirst` (`LIMIT 1`) yo'lida planner uni TANLAMAYDI:
   Postgres massiv `@>` uchun default 0.005 selektivlik beradi (30k'da `rows=150`), shuning uchun
   «erta chiqish» bilan seq scan arzonroq ko'rinadi — **noto'g'ri skanda esa butun jadval o'qiladi**.
   Haqiqiy yechim `DB-04`ning o'zi aytgani: barcode **unique/normalizatsiya** (dublikatlarni merge
   qiluvchi data-migration) yoki so'rov shaklini o'zgartirish — ikkalasi ham «faqat indeks»
   doirasidan tashqarida. *(Eslatma: bu o'lchov sintetik 30k qatorda — barcode'lar bir xil naqshda;
   prod statistikasida planner boshqacha qaror qilishi mumkin.)*
2. **`DB-05` yarim yopildi.** Indeks kontragent ro'yxatidagi INN-filtrni tezlashtiradi, lekin
   `bank-import.service.ts:443` HAMON butun kontragent jadvalini xotiraga yuklab JS'da solishtiradi —
   buni faqat **kod o'zgarishi** (SQL-lookup) yopadi. Shu bajarilgach INN uchun qo'shimcha **btree**
   expression-indeks kerak bo'ladi (trgm GIN teng-solishtirishga yaramaydi).
3. **`organizations` jadvalidagi bir xil INN-filtri** (`organization.service.ts:31`) indekslanmadi —
   jadval o'nlab qatorli, foyda yo'q; hajm o'sganda o'sha ifoda bilan qo'shiladi.
4. **Expression-indekslar sxemada ko'rinmaydi** (Prisma ularni ifodalay olmaydi). Drift **O'LCHANDI**:
   `migrate diff` ularni `DROP` qilMAYDI (Prisma introspection ularni umuman ko'rmaydi) — ya'ni
   kutilgan xavf yuzaga chiqmadi. Lekin ular faqat migration-faylda hujjatlangan.
5. **Mavjud kompozit FK indekslar RI-skanni qoplamaydi** (masalan `Demand`ning
   `[accountId,contractId]`/`[accountId,projectId]`, `[accountId,agentId]`) — bu fazada `DB-08`
   ro'yxatidan tashqari jadval/ustunlarga tegilmadi. Umumiy FK-indeks auditi alohida faza.
6. **Prod deploy:** `CREATE INDEX` SHARE qulfini oladi (yozuvlarni bloklaydi). Hozirgi hajmda
   soniyalar, lekin **past yuklamada** qo'llash kerak. `CONCURRENTLY` ishlatilmadi — Prisma
   migratsiyani tranzaksiya ichida yuritadi. Prod DB'lar `_prisma_migrations`-tracked emas ⇒
   `prisma db execute --file` bilan qo'lda qo'llanadi (fayl idempotent).

---

## Faza 26 — Dashboard: recentDocs UNION + updatedAt indekslari + pul-keshi + overdue raw-SQL (`PERF-05`,`PERF-06`,`PERF-11`) (2026-08-09) — **Phase-1: strukturaviy + unit + EXPLAIN-tasdiqlangan, browser-smoke YO'Q**

### Tasdiqlash (kodda, o'z ko'zim bilan)

| ID | Da'vo | Holat |
|----|-------|-------|
| `PERF-05` | 12 jadvalli UNION `updated_at` bo'yicha saralanadi, lekin sxemada birorta `updatedAt` indeksi yo'q; kod kommenti «indeks bor» deydi | **TASDIQLANDI** — `grep '@@index' schema.prisma | grep updatedAt` → 0 (486 indeks ichida), yolg'on komment `dashboard.service.ts:464-467` |
| `PERF-06` | Pul bloklari har ochilishda butun tarixni UNION-agregat qiladi; kesh qatlami yo'q; `loadRateContext` takror yuklanadi | **TASDIQLANDI** — `WITH ledger` da sana chegarasi yo'q; `loadRateContext` bitta so'rovda **3 marta** chaqirilardi (654 / 731 / 792-qatorlar) |
| `PERF-11` | Overdue-invoys paneli `LIMIT×4` over-fetch + JS-filtr — o'sish bilan noto'g'ri | **TASDIQLANDI** — `take: OVERDUE_LIMIT * 4` + `.filter(r => r.payedSumMinor < r.sumMinor)`; agregat esa raw-SQL'da to'g'ri predikat bilan sanaydi ⇒ `count: N > 0`, `items: []` mumkin |

### REJA TAKLIF QILGAN YECHIM YETARLI EMAS EDI (o'lchov bilan aniqlandi)

Reja (va audit) `PERF-05` uchun «12 jadvalga `@@index([accountId, updatedAt])` qo'sh — komment aytgan
rejim shunda haqiqatga aylanadi» deydi. **Bu noto'g'ri.** Postgres tashqi `LIMIT`ni `UNION ALL`
shoxlariga o'zi tushirmaydi, shuning uchun indeks qo'shilgani bilan planner baribir har jadvalni
to'liq o'qib top-N sort qiladi.

O'lchov — `EXPLAIN (ANALYZE)`, Postgres 18, lokal `climart_adopt`, bitta legda 24 008 sintetik qator
(tranzaksiya ichida yaratilib **rollback** qilindi — DB'da iz qolmadi):

| indeks | per-leg `ORDER BY … LIMIT` | plan | vaqt |
|--------|---------------------------|------|------|
| ✗ | ✗ (shipped kod) | `Append` + top-N `Sort` (24 014 qator) | **18 ms** |
| ✓ | ✗ (**rejaning taklifi**) | `Append` + top-N `Sort`, **Seq Scan** — indeks umuman ishlatilmaydi | **66 ms** |
| ✗ | ✓ | `Merge Append` + har legda `Sort` | 33 ms |
| ✓ | ✓ (**qo'llandi**) | `Merge Append` + `Index Scan using demands_account_id_updated_at_idx` | **0.55 ms** |

Ya'ni ikkala yarim ham kerak: indeksni **so'rov shakli** yoqadi. Shu jadval migratsiya-faylda ham,
servis kommentida ham yozildi (keyingi sessiya «per-leg LIMIT ortiqcha» deb olib tashlamasin), va
unit-test shakl'ni qulflaydi (12 ta `ORDER BY updated_at DESC LIMIT`).

### O'zgarishlar

**`packages/db/prisma/schema.prisma`** (+14 indeks) va
**`packages/db/prisma/migrations/20260809160000_dashboard_updated_at_and_due_date_indexes/migration.sql`**:
- `PERF-05` — 12 hujjat jadvaliga `@@index([accountId, updatedAt(sort: Desc)])`:
  `customer_orders`, `demands`, `invoices_out`, `invoices_in`, `supplies`, `sales_returns`,
  `purchase_orders`, `purchase_returns`, `cash_in`, `cash_out`, `payments_in`, `payments_out`.
- `PERF-11` qo'llab-quvvatlash — `invoices_out(account_id, payment_planned_moment)` va
  `customer_orders(account_id, delivery_planned_moment)`: ikkala overdue paneli aynan shu ustun
  bo'yicha filtrlaydi VA saralaydi, hech bir mavjud indeks bu ustundan boshlanmasdi.
- SQL nomlari `prisma migrate diff` chiqargani bilan **aynan** (drift bo'lmasin); har `CREATE INDEX`
  `IF NOT EXISTS` bilan (prod DB'lar `_prisma_migrations`-tracked emas, fayl qo'lda ham qo'llanadi).
- Lokal DB'ga `prisma db execute --file` bilan qo'llandi (`Script executed successfully`), keyin
  qayta o'lchandi: `Merge Append` + `Index Scan`, **0.572 ms**.

**`apps/api/src/modules/report/dashboard.service.ts`**:
- `computeRecentDocs` — har 12 legga `ORDER BY updated_at DESC LIMIT 20` qo'shildi (global top-20
  albatta per-leg top-20'lar ichida). Yolg'on komment o'chirildi, o'rniga o'lchov jadvali.
  Yangi `RECENT_DOCS_LIMIT = 20` konstantasi ikkala joyda ishlatiladi.
- `computeRecentDocs` `Promise.all`dan **keyin** `await` qilinardi — endi ichida (12 legli UNION
  boshqa hamma blokdan keyin ketma-ket ishlardi, hech qanday bog'liqliksiz).
- `computeOverdueInvoices` — over-fetch + JS-filtr o'rniga raw-SQL: `payed_sum_minor < sum_minor`
  predikati agregatnikiga **aynan mos**, `LIMIT 10`. Kontragent nomlari yangi `resolveAgentNames()`
  helper'i orqali (bitta so'rov; `computeRecentDocs` ham shunga ko'chirildi).
- `loadRateContext` **request-scope**: `dashboard()` bir marta yuklab, uchala pul-blokiga uzatadi
  (ilgari har biri o'zi yuklardi = 3 so'rov). Yon foyda: uch blok bazaviy valyuta haqida kelisha
  olmay qolishi endi imkonsiz.
- `computeMoneyByOrg` / `computeMoneyChart` — 30 s TTL kesh ostida. Kalitlar: `accountId` va
  `accountId + oyning boshi`. **Materialized `MoneyOperation` daftaridan o'qish YO'LI TANLANMADI** —
  unda backfill yo'q (Faza 11), ya'ni 2026-08-08 gacha bo'lgan hujjatlarni bilmaydi va dashboard
  har tenant uchun kam raqam ko'rsatgan bo'lardi.

**`apps/api/src/modules/report/ttl-cache.util.ts`** (yangi) — kichik in-process TTL kesh:
`getOrLoad` **pending promise**ni saqlaydi (50 foydalanuvchi bir vaqtda dashboard ochsa loader 1 marta
ishlaydi), rad etilgan yuklama darhol chiqarib tashlanadi (xato keshlanmaydi), `maxEntries` bilan eng
eski kalit siqib chiqariladi. API `exec_mode: 'fork', instances: 1` (`deploy/ecosystem.config.cjs`)
⇒ jarayon keshi = butun kesh, Redis kerak emas.

### Testlar (TDD — RED ko'rildi, keyin GREEN)

`apps/api/src/modules/report/dashboard.service.test.ts` (yangi, 7 test) —
RED: 4 yiqildi (`items: []`, `currency.findMany` 3 marta, `WITH ledger` 2 marta), GREEN: 7/7.
- `PERF-11`: eng eski 40 hujjat to'liq to'langan holatda ham panel jonli qarzdorlarni ko'rsatadi
  (auditda tasvirlangan aynan buzilish); `invoiceOut.findMany` endi umuman chaqirilmaydi.
- `PERF-05`: recentDocs SQL'ida 11 ta `UNION ALL` + **12 ta** `ORDER BY updated_at DESC LIMIT`.
- `PERF-06`: `loadRateContext` so'rovga 1 marta; TTL ichida `WITH ledger`/`WITH ops` 1 martadan;
  **kesh akkaunt bo'yicha kalitlanadi** (`acc-1` → `acc-2` ⇒ 2 marta so'raladi — tenant sizmasligi);
  TTL tugagach qayta so'raydi.

`apps/api/src/modules/report/ttl-cache.util.test.ts` (yangi, 5 test) — TTL chegarasi, in-flight
bo'lishish, rad etilgan yuklama keshlanmasligi, `maxEntries` siqib chiqarishi, `clear()`.

### Gate

- `pnpm --filter @moysklad/api typecheck` → **0 xato**
- `pnpm --filter @moysklad/api exec vitest run src/modules/report` → **37 fayl / 328 test yashil** (regress yo'q)
- `npx biome check <shu fazaning 4 fayli>` → **0 xato** (3 warning — tegilmagan qatorlardagi eski `noNonNullAssertion`)
- `pnpm lint:product` (repo bo'ylab) → **17 xato, HAMMASI parallel sessiyaning uchayotgan fayllarida**
  (`email/*`, `sms/*`, `webhook/*`, `telegram/*`, `hr-telegram-bridge/*`, `shared/cron-leader.test.ts`,
  `report/counterparty-balance.service.test.ts`). CLAUDE.md §6.1 bo'yicha tegilmadi — bu fazadan
  oldin ham shunday edi.
- `pnpm i18n:gate` — **yugurtirilmadi**: UI-matn tegilmagan (rule 4 shartli), `ru/uz.json` esa
  parallel sessiyada o'zgarmoqda.
- Migratsiya lokal DB'ga qo'llandi + `EXPLAIN` bilan qayta o'lchandi.

### Qolgan qarz / DEFER

1. **Overdue indekslari EXPLAIN bilan O'LCHANMADI** — lokal `invoices_out` da 0 qator,
   `customer_orders` da 3 ta. Indeks strukturaviy jihatdan to'g'ri (yetakchi ustun = filtr va sort
   ustuni), lekin planner tanlovi shu yerda tasdiqlanmagan. Prodda `EXPLAIN` bilan tekshirilsin.
2. **`recentDocs` `deleted_at` ni filtrlamaydi** (12 legning birortasida ham yo'q — bu faza
   boshlanguncha ham shunday edi). O'chirilgan hujjat «Недавние документы» da chiqishi mumkin.
   Bu **xulq** o'zgarishi, PERF fazasi doirasidan tashqarida; audit ro'yxatida ham yo'q — alohida
   topilma sifatida yozilsin.
3. **Kesh invalidatsiyasi yo'q** — to'lov post qilingach dashboard tile 30 s gacha eski qoladi.
   Ataylab: modullararo bog'liqlik (`payment-*`/`cash-*` → report) qo'shishdan ko'ra qisqa TTL
   arzonroq. Kerak bo'lsa `TtlCache.clear()` allaqachon bor.
4. **`PERF-04` (dashboard `receivables` top-500 dan sanaladi) shu fazada YOPILMADI** — u
   **Faza 27** ishi (`counterparty-balance` agregati). Dashboard'dagi `limit: 500` va uning
   «V2 follow-up» kommenti ataylab tegilmasdan qoldirildi.
5. **Browser-smoke YO'Q.** Dashboard sahifasi real brauzerda ochilmadi — Phase-2 QA sessiyasiga.

---

## Faza 27a — Hisobot cap-to'g'riligi: stock-balance search-before-take + counterparty-balance butun-where agregat (`PERF-10`,`PERF-04`,`DUP-14`) (2026-08-09) — **Phase-1: strukturaviy + unit + jonli-DB tasdiqlangan, browser-smoke YO'Q**

### Sub-faza qarori (reja ruxsat bergan)

Faza 27 to'rt hisobotni o'z ichiga oladi. Hajm baholandi va foydalanuvchi **27a** ni tanladi:

| sub-faza | qamrov | holat |
|---|---|---|
| **27a** | `PERF-10` (stock-balance) + `PERF-04`/`DUP-14` (counterparty-balance) | **shu yozuv** |
| 27b | `PERF-01` — `analitika/items.service.ts` DB-paginate + truncated | KUTMOQDA |
| 27c | `PERF-02` — akt-sverka davr-filtri + saldo-forward (API+FE kontrakt) | KUTMOQDA |

Ajratish sababi: 27a/27b sof server-tomon, 27c esa yangi so'rov-parametrlari, XLSX sarlavhasi va FE
davr-tanlagichini talab qiladi (kontrakt o'zgarishi). Rejadagi 3 TDD stsenariydan **2 tasi** aynan 27a
ga tushadi («qidiruv cap tashqarisidagi elementni topadi», «balans-jami butun-where bo'yicha»),
uchinchisi (truncation-flag) ikkala servisda ham qo'yildi.

### Topilma tasdiqlanishi (o'z ko'zim bilan kodda)

| ID | Dalil | Xulosa |
|---|---|---|
| `PERF-10` | `stock-balance.service.ts:196-207` `groupBy … take: filter.limit` → `:211-219` `hideEmpty` JS-filtri → `:264-275` `search` JS-filtri | **TASDIQ** — ikkala filtr ham `take` dan KEYIN. Ustiga `total: items.length` (audit aytmagan, lekin bir bug-klass) |
| `PERF-04` | `counterparty-balance.service.ts:106-115` `findMany({take: filter.limit})` → `:141` `computeSummaries(items…)` | **TASDIQ** — jami faqat sahifadan. Kodning o'z komenti tan oladi: «V2 follow-up» |
| `DUP-14` | `counterparty-balance.service.ts:87-91` `counterparty.findMany({take: 5000})` → `counterpartyId: {in: […]}` | **TASDIQ** |

**Audit dalili eskirgan bo'lgan joy:** `PERF-02` (27c ga qoldi) «11 ta parallel `findMany`» deydi —
bu **Faza 10** da jurnalga (`listJournalEntries` + `resolveBalanceDocs`) ko'chirilgan. Muammoning
o'zi (davr-filtri yo'q, `take` yo'q) qoladi, lekin 27c agenti dalilni QAYTA o'qishi shart. Foydali
topilma: davr-mashinasi (`foldJournalPeriod`, opening/closing bilan) **allaqachon yozilgan**, akt-sverka
uni ishlatmaydi xolos.

### Fayllar

| Fayl | O'zgarish |
|---|---|
| `apps/api/src/modules/report/stock-balance.schema.ts` | `offset` (`min(0).default(0)`) qo'shildi |
| `apps/api/src/modules/report/stock-balance.service.ts` | `resolveSearchIds()` — ikkala rejim uchun YAGONA qidiruv pre-filtri; grouped rejimda `where.assortmentId` + Prisma `having` (`hideEmpty`) + `skip`/`take`; `countGroups()` raw-SQL guruh-count; `truncated`; `emptyReport()`; `export PRODUCT_SEARCH_CAP = 2000` (eski izohsiz `500`) |
| `apps/api/src/modules/report/stock-balance.service.test.ts` | Mavjud 5 test (§6 «Доступно» in-transit) SAQLANDI + **7 yangi** test qo'shildi. Yangi blok Prisma-dubl DB semantikasini (where → having → order → skip/take) taqlid qiladi; eski dublga `$queryRaw` qo'shildi (servis endi guruh-count so'raydi) |
| `apps/api/src/modules/report/counterparty-balance.service.ts` | `buildWhere()` — 5000-ID pre-fetch o'rniga `counterparty` relation-filtri (Prisma JOIN'ga kompilyatsiya qiladi); `aggregateSummaries()` + `aggregateBySign()` — jamilar butun-`where` SQL-agregatidan; `aggregateByCounterparty()` — ko'p-valyutali `groupBy=counterparty` uchun net-per-kontragent; `truncated`; `rowCount = total` |
| `apps/api/src/modules/report/counterparty-balance.service.test.ts` | Dubl DB-semantikasiga o'tkazildi (`where`-baholovchi, `take`, `groupBy`); **7 yangi test** qo'shildi, mavjud 4 tasi saqlandi |

### Muhim texnik qarorlar

1. **`hideEmpty` → SQL `HAVING`**, JS-filtr emas: `having: { OR: [{qty:{_sum:{not:0}}}, {reservedQty:{_sum:{not:0}}}] }`.
   Aks holda `take` dan keyin kesilgani uchun sahifa to'la bo'lolmasdi.
2. **`aggregateBySign` `where` ni USTIGA YOZMAYDI, `AND` bilan birikadi.** `{...where, balanceMinor:{gt:0}}`
   yozilsa `signFilter: 'creditors'` so'roviga debitorlar oqib kirardi — test shuni qulflaydi.
3. **`groupBy=counterparty` da jami net-per-kontragent bo'yicha.** Valyuta bitta bo'lsa
   `@@unique([counterpartyId, currency])` tufayli har kontragentda bitta qator ⇒ arzon (2 agregat)
   yo'l AYNIYAT. Faqat ko'p-valyutali scope'da uchinchi, qimmatroq `groupBy(['counterpartyId','currency'])`
   ishga tushadi. Ya'ni 99% UZ-akkaunt uchun qo'shimcha narx yo'q.
4. **`unconvertedByCurrency` (M-12) endi butun-scope'dan.** Ilgari u sahifa qatorlaridan yig'ilardi —
   kursi yo'q valyutadagi qoldiq sahifadan tashqarida bo'lsa hisobotda umuman ko'rinmasdi. Ko'rinish
   uchun `collapseByCounterparty` ga **alohida bir martalik tally** beriladi (aks holda ikki marta sanalardi).
5. **`total` grouped rejimda raw-SQL guruh-count.** Prisma `groupBy` count qaytarmaydi, `take`siz
   chaqirish esa butun guruh-to'plamini Node'ga tortadi (aynan qochilayotgan narsa).

### Testlar (TDD — RED avval ko'rildi)

- `stock-balance.service.test.ts` — **7/7 RED** (`p3 topilmadi`, `sahifa 2 o'rniga 3`, `total 2 ≠ 7`,
  `offset e'tiborsiz`, `truncated undefined` ×2) → fix → **7/7 GREEN**.
- `counterparty-balance.service.test.ts` — **7/7 yangi RED** (`truncated undefined`,
  `counterparty.findMany 1 marta chaqirildi` ×2, `totalCredit '20' ≠ '100'`, `mixedCurrency false`,
  `unconverted [] ≠ EUR`, `groupBy=counterparty debt '1200000' ≠ '700'`) → fix → **11/11 GREEN**
  (mavjud 4 multi-currency testi ham yashil).

### Jonli DB verifikatsiyasi (unit-testlar qoplamaydigan qism)

`countGroups()` ning RAW SQL'i (jadval/ustun nomlari, `HAVING` joyi, `Prisma.join` separatori,
`::bigint` kasti, `IN (…::uuid)`) dublda TASDIQLANMAYDI. Shu sababli `climart_adopt @ localhost:5432`
da **rollback-tranzaksiyasida** 6 sun'iy qator (nol / manfiy / faqat-rezerv) seed qilinib, raw-SQL
natijasi **mustaqil ground-truth** (Prisma'ning o'z `groupBy` i, `take`siz) bilan solishtirildi:

```
seed'dan keyin: jami guruh=10 · bo'sh emas=9
✓ grouped total (filtrsiz) 10 · sahifa 2 · truncated true
✓ grouped total (hideEmpty=HAVING) 9        ← HAVING haqiqatan diskriminatsiya qildi
✓ grouped truncated (limit yetarli) false · items == total 9
✓ grouped total (assortmentKind / storeId / search) — uchalasi ground-truth bilan mos
✓ flat offset siljishi · flat total · flat truncated · grouped offset siljishi
✓ rollback (seed qolmadi) 0
14/14 O'TDI
```

Tekshiruv skripti ataylab **commit'ga kiritilmadi** (bir martalik).

### Gate

| Gate | Natija |
|---|---|
| `pnpm --filter @moysklad/api typecheck` | **0 xato** |
| `pnpm lint:product` | Mening 5 faylimda **0 xato** (`biome check` bilan alohida tasdiqlandi). Repo bo'yicha 17 xato qoladi — **hammasi parallel Faza-28 sessiyasining fayllarida** (`email`/`sms`/`webhook`/`telegram`/`hr-telegram-bridge`/`shared/cron-leader`/`shared/outbox-claim-class`), ularga TEGILMADI (CLAUDE.md §6.1) |
| `vitest run src/modules/report/` | **37 fayl / 328 test yashil** (regress yo'q; parallel sessiyaning `ttl-cache`/`dashboard` testlari ham shu ichida) |
| `pnpm i18n:gate` | Qo'llanmaydi — UI-matn tegilmadi |

### 🔴 Yaqin-halokat: mavjud test-fayl ustidan `Write` (xotira bug-klassi TAKRORLANDI)

`stock-balance.service.test.ts` **allaqachon mavjud edi** (218 qator, 5 test — §6 «Доступно»
in-transit formulasi). Modul ro'yxati `head -40` bilan kesilgani uchun ko'rinmadi va fayl `Write`
bilan ustidan yozildi ⇒ 5 test JIMGINA o'chdi. Yangi 7 test yashil edi, gate ham yashil bo'lardi.

Tutildi: commit oldidan `git status --short` da fayl `??` (yangi) emas, **` M` (modified)** turgani
ko'zga tashlandi. `git show HEAD:<fayl>` bilan asl versiya olinib, 5 test tiklandi (jami 12 yashil).

**Qoida (xotira `never-write-over-existing-test-file.md` ni kuchaytiradi):** «yangi test fayli
yaratdim» degan har holatda commit oldidan `git status` dagi belgini tekshir — `M` bo'lsa `Write`
mavjud faylni yeb qo'ygan. Fayl mavjudligini `ls | head` bilan tekshirish YETARLI EMAS (kesiladi).

### Parallel sessiya sharoiti (CLAUDE.md §6)

Bu sessiya davomida shu checkout'da yana **ikki** sessiya ishlagan: **Faza 26** (`dashboard.service.ts`,
`ttl-cache.util.ts`) va **Faza 28** (`outbox-claim`, `webhook`/`sms`/`email`/`telegram`). Ularning
fayllariga tegilmadi, `git add` faqat aniq yo'llar bilan qilindi. **`docs/REJA-AUDIT-FIX-2026-08.md`
ATAYLAB stage QILINMADI** — faylda Faza-26 sessiyasining commit qilinmagan jurnal yozuvi turibdi, uni
o'z commit'imga tortib ketmaslik uchun. Shu yozuv ish daraxtida qoladi va uni keyingi doc-commit oladi.

**Ikki hodisa ro'y berdi (ikkalasi ham §6 da hujjatlangan bug-klass):**

1. **Birinchi commit urinishi commit-msg gate'da rad etildi** (header 117 > 100 belgi). Rad etilgan
   commit'dan keyin indeks parallel Faza-28 sessiyasiniki bo'lib qoldi (mening 5 faylim
   unstaged'ga tushdi). Ish daraxti butun qoldi. §6.2 bo'yicha o'sha sessiyaning commit'i
   (`94b05fa5`) kutildi, keyin qayta stage qilindi. Xotira:
   `lint-staged-stash-on-rejected-commit.md` — commit xabarini OLDINDAN moslash kerak.
2. **`lint-staged` commit'ga 6-faylni qo'shdi** (`docs/progress.json`) — `git add` da 5 ta aniq yo'l
   berilgan bo'lsa ham, va u ataylab `git restore --staged` bilan chiqarilgan bo'lsa ham. §6.7 B
   aynan shu. Tekshirildi: o'zgarish — hook'ning o'zi yangilagan bitta `generatedAt` vaqt tamg'asi
   (03:31→03:32), **hech kimning ishi emas**. Shu sababli `reset --soft` bilan tarix qayta
   YOZILMADI — umumiy checkout'da HEAD'ni orqaga surish parallel sessiyaning commit'ini o'chirish
   xavfi (§6.7 A) shu zarardan katta.

### Qolgan qarz / DEFER

1. **`truncated` FE'da KO'RSATILMAYDI.** Bayroq API-da bor, `/reports/stock-balance` va
   `/reports/counterparty-balance` sahifalari uni o'qimaydi. Sabab: reja «Fayllar» ro'yxati faqat API
   servislarini beradi, FE banneri ru+uz i18n kalitlarini talab qiladi. **Asosiy zarar yopilgan**
   (qidiruv endi cap tashqarisini ham topadi), bu qolgan cap uchun ko'rinuvchanlik. → FE fazasiga.
2. **`PRODUCT_SEARCH_CAP = 2000` hali ham CAP.** Undan ko'p tovarga mos keladigan qidiruv kesiladi —
   lekin endi `truncated: true` bilan, jimgina emas. To'liq yechim: `Stock`↔`Product` ni raw SQL JOIN
   bilan bitta so'rovga yig'ish.
3. **`summaries.totalQty/totalReserved/…` (stock-balance) hamon SAHIFA bo'yicha.** Bu ataylab —
   interfeys komenti («across the visible page») shundoq turibdi va FE ularni sahifa-jami sifatida
   ko'rsatadi. `counterparty-balance` da esa jamilar butun-scope'ga o'tkazildi (`PERF-04` aynan shuni
   talab qiladi) — ikki hisobot bu jihatdan endi ASSIMETRIK. Agar egasi stock-balance'da ham
   butun-scope jami xohlasa — alohida topilma.
4. **Grouped rejimda `total` uchun +1 so'rov** (raw count). O'lchanmagan; guruh-count `stocks` ning
   `(account_id, assortment_kind, assortment_id)` indeksidan foydalanishi kutiladi, lekin `EXPLAIN`
   bilan tasdiqlanmagan.
5. **Browser-smoke YO'Q.** Ikkala hisobot sahifasi real brauzerda ochilmadi — Phase-2 QA sessiyasiga.

---

## Faza 34 — 2026-08-09 — **Phase-1: strukturaviy + unit-tasdiqlangan, browser-smoke YO'Q**

**Topilma tasdiqlanishi (o'z ko'zim bilan kodda).** To'rttasi ham TASDIQLANDI:

| ID | Dalil | Holat |
|---|---|---|
| `STK-05` | `inventory.service.ts:627-652` (`Number(expectedQty)`, `String(actualNum - expectedNum)`, `Math.round(Number(costBalance)/expectedNum)`) + `:760-763` cancel | ✅ aynan shunday edi |
| `STK-08` | `move.service.ts:638` `BigInt(Math.round(Number(bal.qty) * 1_000_000))` + `:639-640` round-then-multiply | ✅ aynan shunday edi |
| `SALES-10` | `customer-order.service.ts:1799-1807`, `:1920`; `demand.service.ts:496` `Number(String(cop.quantity)) - Number(String(cop.shippedQty))` | ✅ aynan shunday edi |
| `STK-12` | `customer-order.service.ts:399` ≡ `internal-order.service.ts:207` (`Math.max(0, Number(s.qty) - Number(s.reservedQty))`) vs `stock.service.ts:585` BigInt yo'li | ✅ uchta nusxa |

**+1 QO'SHIMCHA (audit ko'rmagan, o'zim topdim):** `product/product-cell-move.service.ts:39` —
`BigInt(Math.round(Number(bal.qty) * 1_000_000))`, ya'ni STK-08 ning ayni nusxasi (bundan tashqari
per-birlikni **kesib** tashlardi, yumaloqlamasdan). Bir xil helperga o'tkazildi.

### Yagona primitiv qatlam

`demand/fifo-consumer.ts` (import'siz leaf modul; 8 modul allaqachon undan import qiladi) endi
**yagona** manba. `stock.service.ts` o'zining KO'CHIRMA `toMicro`/`fromMicro` juftini tashladi —
nomlar qoldi (fayl lug'ati), lekin implementatsiya bitta.

### Fayllar

| Fayl | O'zgarish |
|---|---|
| `stock/stock.service.ts` | lokal `toMicro`/`fromMicro` → `parseDecimalScaled`/`formatDecimalScaled` alias; **YANGI eksport** `availableMicroOf()` (ishorali) + `availableOf()` (0 ga qisilgan); `assertAvailable` shunga o'tdi |
| `inventory/inventory.service.ts` | **YANGI eksport** `computeVarianceLine()` + `reverseVarianceCost()`; `post()` va `cancel()` shularga o'tdi |
| `move/move-cost-basis.ts` | **YANGI FAYL** — sof `computeTransferCost()` (Nest servisidan tashqarida, `product-cell-move` ham ishlatsin uchun) |
| `move/move.service.ts` | `post()` → `computeTransferCost`; `baseCostMinor` yoziladi; `lineCostsByPosition` `p.baseCostMinor ?? scaleMinorByQty(...)` |
| `product/product-cell-move.service.ts` | `costOfUnits()` → `computeTransferCost` |
| `customer-order/customer-order.service.ts` | **YANGI eksport** `remainingToShip()` + `computeHoldAfterShipment()`; `getSupplyShortfall`, `adjustReservationForShipment`, `applyShipment`, `computeShippedSum`, `update()` floor-guard, `runReservationSet` (+4 chaqiruvchi) — hammasi decimal-string |
| `internal-order/internal-order.service.ts` | `getSupplyShortfall` → `availableOf` + `subtractDecimals` |
| `demand/demand.service.ts` | `createFromCustomerOrder` cap → `remainingToShip`/`compareDecimals`; `bal.reservedQty` patch → `addDecimals`/`subtractDecimals` |
| `packages/db/prisma/schema.prisma` + migratsiya `20260809180000_move_position_base_cost_minor` | `MovePosition.baseCostMinor BigInt?` |

### Reja taklif qilgan yechim STK-08 uchun YETARLI EMAS edi

Reja: «agar ko'chirilayotgan qty == butun qoldiq bo'lsa, costDelta = −costBalanceMinor». Bu **post**ni
to'g'rilaydi, lekin `unpost()`/`cancel()` bazadagi per-birlik `costMinor` snapshot'idan
`scaleMinorByQty(costMinor, qty)` bilan qayta hisoblaydi — post ≠ reversal bo'lib, hujjatni bekor
qilish endi **yangi** drift yaratardi. Aniq satr-qiymatni per-birlikdan tiklab bo'lmaydi (yumaloqlash
ma'lumot yo'qotadi), shuning uchun uni SAQLASH kerak → `base_cost_minor` ustuni (nullable).
Eski qatorlar NULL ⇒ eski `costMinor × qty` formulasiga tushadi ⇒ Faza-34 dan oldin o'tkazilgan
hujjatlar bit-ma-bit avvalgidek teskarilanadi (nol-regressiya).

### Chegara qarori: `availableOf` ikki shaklda

`assertAvailable` **ishorali** qiymatga muhtoj — allaqachon manfiy qoldiqda kamomad
`so'ralgan − (−5)`, 0 ga qisish uni kamaytirib ko'rsatardi. Shu sababli bitta ayirma ustida ikki
shakl: `availableMicroOf()` (xom, ishorali) va `availableOf()` (0 ga qisilgan string — shortfall
endpointlarining eski `Math.max(0, …)` semantikasi). Uchala chaqiruvchi bitta ta'rifda.

### Testlar (TDD — avval RED, keyin GREEN)

Uchta yangi test-fayl, **28 test**. Har biri float xatosini AVVAL o'lchaydi (`expect(0.3 - 0.1)
.not.toBe(0.2)` uslubida), keyin aniq natijani talab qiladi:

| Fayl | Stsenariylar |
|---|---|
| `stock/available-of.test.ts` (6) | 0.1+0.2 klassi · **fantom shortfall** (0.2 buyurtma, 0.3−0.1 qoldiq ⇒ float 2.8e-17 lik PO satri o'ylab topardi) · manfiy/0-qisish · 2^53 dan katta qty · **source-scan**: CO va internal-order'da float formula qolmagani |
| `inventory/inventory-variance.test.ts` (6) | `varianceQty` "0.19999999999999998" emas · **eksponent** ("1.0000000116860974e-7" Decimal literali EMAS) · 2^53 dan katta tan-narx · post↔cancel nol-yig'indi (1000 tiyin / 3 dona) · buyPrice fallback + NULL-shartnoma · kamomad ishorasi |
| `move/move-cost-basis.test.ts` (5) | **butun qoldiqni ko'chirish qoldiqsiz** (1000/3 ⇒ eski yo'l 999 olib, bo'sh omborda 1 tiyin qoldirardi) · qisman ko'chirishda qoldiq JOYIDA qoladi · qty'ni float'siz parse · bazasiz no-op · kasr qty |
| `customer-order/co-quantity-math.test.ts` (11) | `remainingToShip` aniqligi · **to'liq jo'natilgan satrda qoldiq yo'q** (0.1×3 ⇒ float 5.5e-17 qoldirib `fully_shipped` ga hech qachon o'tmasdi) · haqiqiy over-ship'ni rad, artefaktni emas · hold: ship/revert/applicable-emas/0-dan past tushmaslik/qoldiq bilan cheklash · **source-scan**: CO va demand'da float qolmagani |

### Gate

| Buyruq | Natija |
|---|---|
| `pnpm typecheck` (turbo, butun monorepo) | **9/9 muvaffaqiyatli** |
| `pnpm lint:product` | **0 error** (746 warning — siyosat bo'yicha ruxsat) |
| `pnpm --filter @moysklad/api exec vitest run` (to'liq API suite) | **427 fayl / 5549 test** — 5543 yashil, 2 skip, **4 yiqildi**. Yiqilganlar: `publication.service.test.ts` (3) + `hr/hr-employee/hr-employee.service.test.ts` (1) — hammasi **argon2 parol-xeshlash 5 s timeout**i, mening o'zgarishlarimga aloqasi YO'Q (bir vaqtda `turbo typecheck` yugurayotgani uchun CPU yetmadi). Alohida yugurtirilganda **57/57 yashil** (o'sha testlar 303–385 ms). Faza 34 tekkan modullarning barchasi (`stock`, `inventory`, `move`, `product`, `customer-order`, `demand`, `internal-order`) to'liq yashil |
| Migratsiya | `prisma db execute` bilan lokal `climart_adopt` ga qo'llandi; `migrate diff` bo'yicha `base_cost_minor` drift'i **0** (qolgan diff — parallel sessiyaning indeks qayta-nomlashlari, meniki emas); `prisma generate` qayta yugurtirildi |
| `pnpm i18n:gate` | Qo'llanmaydi — UI-matn tegilmadi |

### Qolgan qarz / DEFER

1. **Browser-smoke YO'Q.** Hech bir sahifa real brauzerda ochilmadi — Phase-2 QA sessiyasiga.
   Ayniqsa `move` detali: `costMinor × quantity` bilan hisoblanadigan FE «Сумма» ustuni endi
   `baseCostMinor` dan bir necha tiyinga farq qilishi mumkin (kosmetik, ledger to'g'ri).
2. **`CustomerOrderPosition.reservedQty` payload'i hamon `number`** (Zod `.transform(Number)`).
   Servis ichi endi to'liq decimal-string, lekin HTTP chegarasi float bo'lib qoladi;
   `(… ?? 0).toFixed(6)` bilan eksponent-notatsiyadan himoyalandi (`String(1e-7)` = `"1e-7"`
   Decimal literali EMAS va `parseDecimalScaled` uni rad etadi). To'liq yechim = schema'ni
   string-decimal'ga o'tkazish (FE bilan birga) — alohida ish.
3. **`customer-order.service.ts` `p.quantity` hamon Zod'dan `number`** — floor-taqqoslash
   `String(p.quantity)` orqali aniq, lekin manba tipi float. Yuqoridagi (2) bilan bir paket.
4. **`analitika/analysis.service.ts:294` va `count.service.ts:301`** da `Number(s.qty)` qoldi —
   ular hisobot-agregatlari (yozuv emas), Faza 34 doirasidan tashqari; alohida topilma sifatida
   qayd etildi.
5. **`fifo-consumer.ts` nomi endi yolg'on** — FIFO Faza 18a da bekor qilingan, fayl umumiy decimal
   primitivlar uyi. `shared/decimal.ts` ga ko'chirish tavsiya (11 import'ni yangilash — mexanik
   codemod), lekin bu sessiyada QILINMADI (scope).
6. **`Move.sumMinor` endi `Σ baseCostMinor`** — eski hujjatlarda `Σ round(perUnit × qty)` bo'lib
   qolaveradi (backfill YO'Q). Farq hujjat boshiga bir necha tiyin.

### Parallel sessiya sharoiti (CLAUDE.md §6)

Bu checkout'da parallel **Faza 30** (FE POS: `lib/pos/parse-amount.ts`, `cart-math.ts`,
`retail/page.tsx`, `sotuv/page.tsx`, `components/pos/*`) sessiyasi ishlayapti. Ularning
`apps/web/**` fayllariga TEGILMADI; `git add` faqat aniq yo'llar bilan qilindi.
`docs/REJA-AUDIT-FIX-2026-08.md` da **Faza 27a** sessiyasining commit qilinmagan jurnal yozuvi
turgan edi — o'sha sessiya «keyingi doc-commit oladi» deb yozib qoldirgan, shu sababli u shu
commit bilan birga keladi (o'z yozuvim uning ustiga `appendFileSync` bilan qo'shildi, marker-kesish
YO'Q).

---

## Faza 30 — FE POS: refund string-qty + yagona pul-parse + retail cart-math (`FE-02`, `FE-08`/`FE-09`, `FE-01`) (2026-08-09) — **Phase-1: strukturaviy + unit-tasdiqlangan, browser-smoke YO'Q**

### Ground-truth (rejadagi da'volar o'z ko'zim bilan tekshirildi)

| Topilma | Reja nima deydi | Kodda ASLIDA |
|---|---|---|
| `FE-02` (web, HIGH) | `BigInt(1.5)` render-crash | **Allaqachon TUZATILGAN** — `sotuv/page.tsx` footer va mutatsiya `refundPayoutMinor` (mikro-birlik) ishlatadi, `BigInt(returnQty)` yo'q. **Qoldiq bor:** maydon hamon `Record<string, number>` edi ⇒ (a) kassir kasr miqdor **kirita olmasdi** (`type="number"` da «1.» oraliq holati bo'sh satr qaytaradi, nuqta o'chib ketardi — og'irlik bilan sotilgan tovarni qisman qaytarib bo'lmasdi), (b) `String(number)` chegaraviy qiymatda eksponent (`1e-7`) berardi va server sxemasi (`^\d+(\.\d{1,6})?$`) uni 400 bilan rad etardi. Shu qoldiq tuzatildi. |
| `FE-08`/`FE-09` (web-arch) | 4 mustaqil pul-parse varianti | **TASDIQLANDI** — `payment-dialog:31,63,113` `parseInt(s,10)*100`; `debt-payment-dialog:61`, `rasmilashtirish-modal:107`, `cash-out-dialog:40` `BigInt(Math.round(n*100))`. Hammasida scale QATTIQ `100`. |
| `FE-01` (web-arch, HIGH) | retail float total server BigInt bilan rad | **TASDIQLANDI va qo'lda hisoblab isbotlandi** — `retail/page.tsx:245,589` `BigInt(Math.round(qty*Number(priceMinor)*(1-d/100)))`. 115 tiyin × 1, −10%: float `Math.round(103.49999999999999)` = **103**, server `computePositionTotal` = **104** ⇒ `retail-sale.service.ts` `expectedSumMinor !== sale.sumMinor` bilan chekni RAD etadi. |

### O'zgarishlar

| Fayl | Nima |
|---|---|
| `apps/web/src/lib/pos/parse-amount.ts` | **YANGI** — `parseAmountToMinor(raw, currency)` (`Money.fromMajor` + **half-up**, buzuq/manfiy/bo'sh → `0n`, istisno OTMAYDI), `formatAmountInput(minor, currency)` (tiyin → maydon matni, `Number` orqali EMAS), `ceilAmountInput(minor, currency)` («Aniq» tugmasi uchun butun major-birlikkacha yuqoriga). Qabul qilinadigan grammatika ataylab qat'iy: `^\d+([.,]\d+)?$` (probellar tozalanadi) — bu klaviatura maydoni, hujjat importi emas. |
| `apps/web/src/lib/pos/parse-amount.test.ts` | **YANGI** — 19 test (JPY 0-kasrli scale, `1.005` half-up, 17-raqamli kiritma = FE-12 klassi, buzuq kiritma, teskari konversiya). |
| `apps/web/src/lib/pos/cart-math.ts` | `discountedLineTotalMinor` / `discountedCartTotalMinor` — **server formulasi** (`computePositionTotal`, BigInt); `normalizeQtyDecimal` (+ ichki `normalizeDecimalString`) — server sxemasiga kanonik decimal; `clampReturnQty` — qaytarish maydoni uchun **satr** qisish (yozilayotgan «1.» saqlanadi); `RefundableLine.returnQty` endi `number | string`. |
| `apps/web/src/lib/pos/cart-math.test.ts` | Mavjud 28 test SAQLANDI (fayl `Write` bilan EMAS, `Edit` bilan kengaytirildi) + **21 yangi** test. |
| `apps/web/src/components/pos/payment-dialog.tsx` | `currency?: CurrencyCode` prop; `parseInt*100` × 4 joy → `parseAmountToMinor`; `handleExact` → `ceilAmountInput`; `handleQuickAdd` → `formatAmountInput`. |
| `apps/web/src/components/pos/debt-payment-dialog.tsx` | `currency` prop; lokal `toMinor` va `minorToInput` O'CHIRILDI → umumiy funksiyalar. |
| `apps/web/src/components/pos/rasmilashtirish-modal.tsx` | `currency` prop; lokal `toMinor` (×3 maydon) → `parseAmountToMinor`; `handleExact` dagi `String(Number(left)/100)` → `formatAmountInput`. |
| `apps/web/src/components/pos/cash-out-dialog.tsx` | `currency` prop; lokal `toMinor` → `parseAmountToMinor`. |
| `apps/web/src/app/(app)/retail/page.tsx` | `cartTotal` va qator-jami → `discountedCartTotalMinor`/`discountedLineTotalMinor`; `PaymentDialog`ga `currency={tillCurrency}`. |
| `apps/web/src/app/(app)/sotuv/page.tsx` | `returnQty: Record<string,string>`; input `type="text" inputMode="decimal"` + `clampReturnQty`; so'rov va ekran `normalizeQtyDecimal` orqali; 3 dialogga `currency={tillCurrency}`. |
| `apps/web/src/__tests__/pos-debt-payment-wiring.test.ts` | Manba-skan qo'riqchisi yangi invariantga moslandi (`formatAmountInput(outstanding, currency)`) + **yangi qo'riqchi**: `parseAmountToMinor(amountInput, currency)` bo'lishi va lokal `Math.round(… * 100)` QAYTIB kelmasligi. |

### TDD

RED avval yugurtirildi: **21 yiqilish** (`… is not a function` / modul yo'q), keyin 9 ta qo'shimcha RED (`formatAmountInput`/`ceilAmountInput`). GREEN — `src/lib/pos/` 68/68 yashil.
Rejadagi 3 stsenariy: (1) kasr-qty qaytarish — `clampReturnQty`/`normalizeQtyDecimal` + `refundPayoutMinor` satr-shartnomasi; (2) parse-amount 0-kasrli valyuta va scale'dan ortiq kasr; (3) retail cart-total server BigInt bilan mos (104n, float 103n).

### Gate

| Tekshiruv | Natija |
|---|---|
| `pnpm --filter @moysklad/web typecheck` | **0 xato** |
| `pnpm --filter @moysklad/web exec vitest run` (to'liq) | **184 fayl / 2787 test yashil**, 26 skip; **1 flaky yiqilish** — `components/assortment/bulk-actions-dropdown.test.tsx` (drawer timing, mening o'zgarishlarim tegmagan fayl): to'la yuklangan parallel yugurishda yiqildi, alohida yugurtirilganda **13/13 yashil**. |
| `pnpm i18n:gate` | **9/9 yashil** (UI-matn qo'shilmadi) |
| `pnpm lint:product` | **Mening 12 faylimda 0 xato** (`biome check` scoped). Global gate 13 xato bilan QIZIL — **hammasi `apps/api/**` da**, parallel sessiyalarning commit qilinmagan HR/stock/move ishida (`git status` bilan tasdiqlandi; ikki yugurish orasida ro'yxat o'zgardi = jonli tahrir). §6.1 bo'yicha TEGILMADI. |

### Qolgan qarz / DEFER

1. **Klaviaturada nuqta yo'q.** `parseAmountToMinor` kasr qabul qiladi, lekin 4 dialogning ham numpad'i faqat raqam va `000` beradi — tiyin kiritish hamon imkonsiz (UZS'da bu ataylab). Kasr valyuta kerak bo'lganda `.` tugmasi qo'shilishi kerak.
2. **`QUICK_AMOUNTS` qattiq tiyinda** (`payment-dialog.tsx:20` — `1000_00n`…): 0 kasrli kassada bu tugmalar 100× katta summa qo'shadi. Prop qilib chiqarish kerak; hozircha kassa UZS.
3. **`currency` prop defolti `'UZS'`.** Chaqiruvchi uzatmasa eski xulq saqlanadi (regressiyasiz migratsiya), lekin bu «jim defolt» — yangi chaqiruvchi uzatishni unutsa hech narsa shikoyat qilmaydi.
4. **FE-08 ning i18n qismi (POS hardcoded o'zbekcha matn) BU FAZADA QILINMADI** — reja Faza 30 ga faqat pul-parse qismini bergan; POS matnlarini `pages.sotuv` nomfazosiga ko'chirish alohida ish bo'lib qoladi.
5. **Browser-smoke YO'Q.** POS to'lov/qaytarish oqimlari real brauzerda ochilmadi; ayniqsa `type="text" inputMode="decimal"` maydoni va retail chekining serverda QABUL qilinishi (400 yo'qligi) Phase-2 QA sessiyasida tekshirilsin.

---

## Faza 31 — FE dedup codemodlar: computeLineTotal · YesNoSelect/MultiRefField/refFetcher · api-client (`FE-10`, `FE-02`, `FE-06`/`FE-14`) (2026-08-09) — **Phase-1: strukturaviy + unit-tasdiqlangan, browser-smoke YO'Q**

**Commit:** `105897b3` · 45 fayl (44 meniki + `docs/progress.json` hook-artefakti), **+681 / −1329** (net −648 qator).

### O'z o'lchovim (reja raqamlari tasdiqlandi)

Reja raqamlari ko'r-ko'rona olinmadi — har biri qayta sanaldi (xotira:
`audit-findings-examples-unverified`):

| Reja da'vosi | Mening o'lchovim | Xulosa |
|---|---|---|
| `FE-10` — 13× `computeLineTotal` | **13 fayl**, har biri `md5` bo'yicha bir xil semantika (12 tasi bayt-bayt bir xil tana; `internal-orders/new` yagona farq: `discount: '0'` qattiq) | ✅ aniq |
| `FE-02` — 24× `YesNoSelect` | **24 fayl**, hammasining tanasi **bir xil md5 `9c046ac2`** — bayt-bayt | ✅ aniq |
| `FE-02` — `MultiRefField`/`refFetcher` | `MultiRefField` **5 ta** (3 bir xil `onSearch`-shakl + 2 boshqa shakl: `commission-reports`, `payments` — `InlineFilterPanel.Field` o'rami + `endpoint` prop); `refFetcher` **4 ta** (3 modul-darajali bir xil + `serial-numbers` ichida **boshqa qaytaruv shakli** `{id, primary}`) | ⚠️ reja «24×» deb bitta raqamga qo'shib yuborgan; dedup qilinadigani **3+3**, qolgan 4 tasi **ataylab tegilmadi** (shakl boshqa) |
| `FE-06`/`FE-14` — blob/401 4× nusxa + retry-teshigi | 4 transport (`download`, `postDownload`, `postOpenInBrowser`, `blobUrl`) — hammasi `request()` dan qo'lda ko'chirilgan; **`download()` da 401-retry shoxi umuman yo'q** | ✅ teshik jonli, RED test bilan tasdiqlandi |

### Topilgan HAQIQIY bug — `download()` 401-retry teshigi (`FE-06`)

`request()` (JSON) birinchi kundan beri 401 da `refresh()` qilib qayta urinadi.
Uchta binar transport undan **qo'lda ko'chirilgan**, va `download()` ko'chirishda
retry shoxini yo'qotgan:

```ts
// oldin — retry shoxi YO'Q:
const res = await fetch(`${BASE}${path}`, { headers, credentials: 'include' });
if (!res.ok) throw new Error(`Download failed: HTTP ${res.status}`);
```

Simptom: access-token muddati tugagach «Экспорт в XLSX» `Download failed: HTTP 401`
bilan otiladi va foydalanuvchi sahifani qayta yuklashga majbur — refresh-cookie
esa hamon tirik. **Typecheck/biome/i18n gate'larining hech biri buni ko'rmaydi**
(sintaktik jihatdan mutlaqo to'g'ri kod). RED test avval yozildi va aynan shu ikki
assert bilan qizil bo'ldi:

```
× download() retries the export once with the refreshed token (FE-06 hole)
    → promise rejected "Error: Download failed: HTTP 401" instead of resolving
× download() gives up after ONE retry (no infinite refresh loop)
    → expected "spy" to be called 2 times, but got 1 times
```

Yechim: barcha transport bitta `authedFetch(path, init, retry = true)` ga o'tdi
(auth-header + 401→refresh→retry bitta joyda), blob-saqlash `saveBlobAs()` ga.
`retry` rekursiv chaqiruvda iste'mol qilinadi ⇒ yangilangan tokenga ham 401
kelsa **aniq 2 so'rovdan keyin** to'xtaydi, sikl yo'q. Token umuman bo'lmasa
refresh urinilmaydi (anonim 401 — muddat emas, javob).

### Codemod — deterministik, fail-closed

`scratchpad/codemod-faza31.mjs` (37 fayl, ~0 token). Prinsip: **anchor topilmasa
yoki ikki marta uchrasa — fayl umuman tegilmaydi va butun yugurish `exit 1`**
(xotira: `doc-append-marker-truncation` — «jimgina yarim qo'llanish» yo'q).
Import tozalash `bodyOnly()` (import-statementlar o'chirilgan matn) ustida
sanaladi, ya'ni faqat haqiqiy foydalanish hisoblanadi.

**Codemod topmagan 2 qoldiq — qo'lda tuzatildi** (halol qayd):
1. Izoh-blokni «yutish» evristikasi faylda oldinroq `/**` bo'lsa ishlamay qolgan
   ⇒ `customer-orders/{new,[id]}` da o'chirilgan funksiyani ta'riflaydigan
   **yetim izoh bloki** qolgan. Skaner bilan topildi (5 nomzoddan 3 tasi
   `git show HEAD:` bilan **oldindan bor** ekani tasdiqlandi), 2 tasi o'chirildi.
2. O'sha izohlar `computePositionTotal` / `MultiCombobox` so'zlarini o'z ichiga
   olgani uchun 4 faylda import «hamon ishlatilmoqda» deb sanalgan ⇒ biome
   `noUnusedImports` bilan tutildi, qo'lda olib tashlandi.

### Testlar (TDD — RED avval)

| Fayl | Test | Nimani qulflaydi |
|---|---|---|
| `lib/doc-totals.test.ts` | **+9** | VAT ichida/tashqarisida, chegirma VAT'dan oldin, **`discount` maydoni yo'q satr** (internal-orders shakli), bo'sh satr = 0 (NaN emas), `vatEnabled=false` da `vat` e'tiborsiz, kasr НДС (`7.5`) BigInt RangeError bermaydi, parse-xatosida nol qaytaradi |
| `lib/api-client.test.ts` | **+9** | Har 5 transport uchun 401→refresh→retry, aniq bir marta, refresh yiqilsa retry yo'q, tokensiz refresh urinilmaydi, Content-Disposition nomi vs fallback |
| `components/filters/filter-fields.test.tsx` | **+8** (yangi) | Tri-state kontrakt (bo'sh ⇒ `undefined`, `'false'` ≠ unset), opsiya tartibi `['', 'false', 'true']`, `testId` ixtiyoriy, `refFetcher` URL-enkodlash + `limit=20` + `{value,label}` shakli |

### ⚠️ HODISA — mavjud test-fayl ustidan Write

`apps/web/src/lib/api-client.test.ts` **allaqachon mavjud edi** (6 ta Content-Type
regress-qo'riqchisi: body-siz so'rovda `Content-Type` yubormaslik — 2026-06-06
Phase-2 QA da topilgan, 49 ta `api.delete` ni jimgina buzgan bug). Men uni
`Write` bilan ustidan yozdim. `git status` da `M` (`A` emas) ko'rinishidan
tutildi, `git show HEAD:` bilan tiklandi va yangi suite bilan **birlashtirildi** —
fayl endi **15 test**. Xotira `never-write-over-existing-test-file` aynan shu
haqda ogohlantirgan edi; bu **uchinchi** takror. Yagona ishonchli signal —
commitdan oldin `git status --short` da `A` vs `M` ni tekshirish.

### Sanoq nazorati (jim yo'qolgan test yo'qligini isbotlash)

`2814 = 2788 (HEAD) + 9 + 8 + 9` — codemoddan keyingi oraliq yugurish 2808
bergan edi (6 ta yo'q qilingan Content-Type testi bilan), tiklangach aynan +6.
Test-fayllar soni 185 (yangi `filter-fields.test.tsx` bilan).

### Gate

| Tekshiruv | Natija |
|---|---|
| `pnpm --filter @moysklad/web exec tsc --noEmit` | **0 xato** |
| `node scripts/check-lint.mjs` (lint gate) | **0 error** (746 warning — siyosat bo'yicha ruxsat) |
| `pnpm i18n:gate` | **9/9 yashil** (UI-matn o'zgarmadi — `common.yes/no` o'sha joyda) |
| `pnpm --filter @moysklad/web exec vitest run` (to'liq) | **185 fayl / 2814 test yashil**, 26 skip, **0 yiqilish** |
| `git show --stat HEAD` | 45 fayl — begona fayl yo'q, stash bo'sh (§6.7 B tekshiruvi) |

### Qolgan qarz / DEFER

1. **Browser-smoke YO'Q (Phase-2 qarzi).** 24 ro'yxat sahifasining filtr paneli va
   13 hujjat formasining «Итого» footeri real brauzerda ochilmadi. `download()`
   retry'i ham faqat unit darajada — jonli muddati tugagan token bilan XLSX
   eksporti sinalmagan.
2. **`commission-reports` / `payments` dagi `MultiRefField` dedup qilinmadi** —
   ular `InlineFilterPanel.Field` o'ramini va `endpoint` propni oladi (biri
   `byName` ham). Umumlashtirish uchun shared komponentga ikkinchi rejim kerak;
   bu alohida ish.
3. **`serial-numbers` dagi `refFetcher` tegilmadi** — u `{value,label}` emas,
   `{id, primary}` (PickerItem) qaytaradi va komponent ichida yashaydi.
4. **`LineTotalRow` ning hamma maydoni ixtiyoriy** ⇒ TypeScript deyarli har
   qanday obyektni qabul qiladi (chaqiruv joyi o'zgaruvchi uzatsa excess-property
   tekshiruvi ishlamaydi). 13 chaqiruv joyi hozir `DocPositionRow` avlodini
   uzatadi, lekin bu «jim defolt» klassi — kelajakda noto'g'ri obyekt uzatilsa
   typecheck jim qoladi.
5. **`internal-orders/new`da xulq-ekvivalentlik shartli.** Eski nusxa `discount`
   ni qattiq `'0'` qilardi; umumiy helper satrning `discount` maydonini o'qiydi.
   Hozir bu xavfsiz (o'sha faylda `discount` faqat bitta joyda va doim `'0'`,
   grep bilan tasdiqlandi), lekin kelajakda chegirmali satr manbadan kelsa
   footer o'zgaradi.
6. **`supplies-filter-fields.test.ts` yangilandi** — u sahifa matnida
   `function MultiRefField` borligini talab qilardi; endi import + `<MultiRefField`
   ishlatilishiga bog'landi. Qo'riqchining maqsadi o'zgarmadi (modal picker emas,
   inline dropdown), faqat langar ko'chdi.

---

## Faza 33 — 2026-08-09 — **Phase-1: strukturaviy + unit-tasdiqlangan, browser-smoke YO'Q**

**Topilma tasdiqlanishi (o'z ko'zim bilan kodda) — `FE-12` TASDIQLANDI, LEKIN AUDIT TA'SIRNI
TESKARI YOZGAN.** Ikki POS sahifasi AYNI endpoint (`GET /cashier-sessions/current`) uchun
`CurrentSession` ni alohida-alohida e'lon qilgani rost: `retail/page.tsx:38` `cashDesk: CashDesk`,
`sotuv/page.tsx:67` `cashDesk: CashDesk | null`. Audit «retail `cashDesk.currency` ga to'g'ridan-
to'g'ri kiradi ⇒ null-farqlar runtime'da portlaydi» degan — **ya'ni retail'ni xato deb bilgan.
Ground-truth teskari:** `schema.prisma:7733,7738,7739` da `cashDeskId`/`storeId`/`organizationId`
**NOT NULL**, `findCurrentForCashier` esa uchala relyatsiyani shartsiz `include` qiladi ⇒
relyatsiya **hech qachon null emas**, **retail HAQ edi**, sotuv esa ortiqcha himoyalangan.
Kontrakt ground-truth bo'yicha non-null yozildi. *(Xotira: `audit-findings-examples-unverified` —
audit misollari o'lchanmagan; bu shu klassning yana bir misoli.)*

**Rejaning yechim taklifi ham qisman noto'g'ri edi.** Reja «apps/api Zod-sxemalaridan `z.infer`
tiplarni eksport qil» deydi. Tekshirdim: `apps/api/**/*.schema.ts` da **javob (response)
sxemalari deyarli YO'Q** — `grep "ResponseSchema|Response = z\."` butun API bo'ylab **1 fayl**
(`exchange-rate`). Zod bu yerda **kirish validatsiyasi** uchun; FE og'rig'i esa **javob**
tiplarida. Ya'ni «z.infer qilib eksport qilish» uchun eksport qiladigan narsaning o'zi yo'q edi.

### Nima qurildi

**`packages/contracts` — yangi paket (`@moysklad/contracts`), `dist` YO'Q (source-only).**
`exports` to'g'ridan-to'g'ri `./src/index.ts` ga qaraydi: tsc `.ts` ni o'zining deklaratsiyasi
sifatida o'qiydi, vitest/vite uchib transpile qiladi, web esa faqat `import type` ishlatadi
(bundlega hech narsa tushmaydi). Sabab — xotira `money-dist-stale-tsbuildinfo`: `@moysklad/money`
ning eskirgan `dist`i bir marta «typecheck yashil, runtime `X is not a function`» bergan. Build
bosqichi bo'lmasa, o'sha nosozlik klassi umuman mavjud emas.

| Fayl | Mazmun |
|---|---|
| `src/wire.ts` | Sim-ustidagi primitivlar + **uchta loyiha-bo'ylab serializatsiya qoidasi** hujjatlangan: `BigInt → string` (`main.ts:19` global `toJSON`), `Prisma.Decimal → string`, `DateTime → ISO`. Shu qoidalar hech qayerda yozilmagan edi. |
| `src/envelope.ts` | `listEnvelope`/`ListEnvelope<T>`. **92 web fayli** o'z `interface ListResponse` ini e'lon qiladi va ular **kelishmaydi**: `{items,total,nextCursor}` (cash-desk, store) vs `{items}` (product) ⇒ `total`/`nextCursor` haqiqatan ixtiyoriy. |
| `src/reference.ts` | `CashDeskRef`/`CashDeskRow`/`StoreRef`/`OrganizationRef`/`UserRef`. |
| `src/cashier-session.ts` | `CurrentSessionSchema` (+ `nullable` javob shakli). |
| `src/product.ts` | `PosProductRowSchema` + `ProductStockSchema` + `SalePriceEntrySchema`. |
| `src/provenance.ts` | **`CONTRACT_PROVENANCE` reyestri** + `flattenSchemaKeys`. |

**Asosiy g'oya — `provenance.ts`: kontrakt DEKORATIV bo'lmasligi uchun.** Interfeyslarni umumiy
faylga ko'chirish dublikatni yopadi, lekin **arqonni bog'lamaydi** — server o'zgarsa baribir hech
narsa yiqilmaydi. Shuning uchun **har sxema o'z kalitlarining serverdagi MANBASINI e'lon qilishi
shart** (4 tur: Prisma modeli · servis metodidagi `select`/`include` bloki · qo'lda yig'ilgan
javob obyekti · **apps/api Zod-sxemasi** ← rejadagi «server-Zod ↔ FE-tip» tekshiruvining aynan
o'zi). Reyestrga qo'shilmagan yangi sxema ham yiqiladi (to'liqlik testi bor).

**5 endpoint qoplandi:** `GET /cashier-sessions/current` · `GET /cash-desks` · `GET /stores` ·
`GET /organizations` · `GET /products` (POS proyeksiyasi).

### Testlar (TDD — avval RED)

1. **`apps/api/src/modules/shared/contract-conformance.test.ts` (21 test).** Reyestr ustidan
   data-driven yuradi: sxema kalitlarini yassilaydi va har birini e'lon qilingan manbadan
   **haqiqiy manba fayldan** o'qib topadi. **RED ko'rildi** (modul yo'q → keyin 3 ta HAQIQIY
   ekstraktor nuqsoni): (a) `sliceMethod` generikali metodni (`attachStock<T …>`) topa olmasdi;
   (b) `select`/`include` Prisma kalit so'zlari javob-kaliti sifatida sanalardi; (c) sabotaj
   testim **noto'g'ri metodni** buzayotgan edi (`list`/`findOne`/`open`/`close` da bayt-bayt bir
   xil `cashier:` bloki bor, `/m` + global-siz `replace` birinchisini oladi) — ya'ni proof'ning
   o'zi no-op bo'lib qolgan edi.
2. **Tarixiy halokatga qarshi RED-proof.** Jonli `cashier-session.service.ts` dan `cashier:`
   include'i o'chiriladi va kontrakt buzilishi tasdiqlanadi — bu **2026-06-08k da POS registrini
   yiqitgan** aynan o'sha regressiya (`session.cashier.name` → `undefined`).
3. **Ekstraktor o'z-testlari** (fixture ustida, doimiy): har biri langar topilmasa **THROW**
   qiladi — jimgina bo'sh to'plam qaytarsa butun konformans suiti no-op bo'lib qolardi.
4. **`packages/contracts/src/contracts.test.ts` (15 test).** Sxemalar realistik payload'ni qabul
   qiladi; **son ko'rinishidagi minor-summani RAD etadi** (`BigInt → string` qoidasi);
   `flattenSchemaKeys` self-referential sxemada ham to'xtaydi.
5. **`apps/web/src/__tests__/shared-api-contracts.test.ts` (5 test).** Drift-back qo'riqchisi:
   butun `web/src` skanlanadi, hech bir fayl kontrakt-egalik qilgan tipni qayta e'lon qila
   olmaydi; `PENDING_MIGRATION` yozuvi **eskirsa yiqiladi** (migratsiya qilingach istisnoni
   o'chirishga majbur qiladi).

**Ikkala qo'riqchi ham JONLI sabotaj bilan tekshirildi** (vakuum emas): kontraktga soxta kalit
qo'shilganda konformans yiqildi (`bogusServerKey`); sotuv istisnosi olib tashlanganda web
qo'riqchisi `app/(app)/sotuv/page.tsx::CurrentSession` ni tutdi. Ikkalasi ham qaytarildi.

### +1 mayda ish: Faza 31 qoldirgan QIZIL gate tuzatildi (mening regressiyam EMAS)

To'liq API suitini yugurtirganda **9 ta yiqilish** chiqdi — `position-scale-class.test.ts`,
9 ta `/new` hujjat sahifasi. Kelib chiqishi o'lchandi: `git show 105897b3^:…demands/new/page.tsx`
da `scaleMinorByQty(|computePositionTotal(` **1 marta bor**, `HEAD` da **0** — ya'ni **Faza 31
(`105897b3`)** 13 nusxani `computeLineTotalSafe` ga yig'ganda sahifa manbasidan primitiv nomi
yo'qolgan, qo'riqchi esa sahifa manbasini skanlaydi. **Faza 31 buni ko'rmagan, chunki u faqat WEB
suitini yugurtirgan — qo'riqchi `apps/api` da yashaydi.** Kod to'g'ri (`computeLineTotalSafe`
`computePositionTotal` ga delegatsiya qiladi, tekshirildi), **qo'riqchi eskirgan edi**.
Tuzatish: uchinchi qabul qilinadigan shakl qo'shildi **+ indirektsiyaning o'zi mixlandi** —
`doc-totals.ts` uchun 3 yangi test (helper primitivga delegatsiya qilishi shart), aks holda 13
sahifa «o'tadi» va 3-kasrli qirqim butun hujjat oilasiga bir yo'la qaytardi. Bu pin ham sabotaj
bilan tekshirildi. `docMeasureTotals` dagi `round3` **ataylab chetlab o'tildi** — u «Вес»/«Объём»
(gramm/ml), pul emas; butun fayl bo'yicha taqiq display-yumaloqlashni pul-regressiyasi deb
belgilardi.

### Gate

- `@moysklad/contracts` typecheck **0** · `@moysklad/api` typecheck **0** · `@moysklad/web`
  typecheck **0** *(quyidagi ogohlantirishga qarang)*
- `pnpm lint:product` — **mening fayllarimda 0 xato**; umumiy natija **2 xato**, ikkalasi ham
  parallel sessiyaning commit qilinmagan fayllarida (`components/pos/cash-out-dialog.tsx`,
  `rasmilashtirish-modal.tsx`) — tegilmadi. `scripts/check-lint.mjs` SCOPE'iga
  `packages/contracts/src` qo'shildi (aks holda yangi paket linsiz ketardi).
- **To'liq API suite: 427 fayl / 5571 test yashil, 0 yiqilish** (2 skip). Sanoq nazorati:
  `5573 = 5549 (Faza 34 bazasi) + 21 + 3` — jim yo'qolgan test yo'q. Faza 34 dagi 4 ta argon2
  timeout takrorlanmadi.
- **To'liq web suite: 2823 yashil, 1 yiqilish** (26 skip) — yiqilgan yagona test
  `i18n-key-existence`, **27 ta `pages.sotuv.*` kaliti yetishmaydi va HAMMASI parallel
  sessiyaning commit qilinmagan Faza 32 ishidan**. O'lchov: `grep "missing in" | grep -v sotuv`
  = **0**. Mening o'zgarishlarim UI-matnga umuman tegmaydi (retail diff'i faqat tip e'lonlari).
- `pnpm i18n:gate` — **shu sababdan QIZIL**, o'z qamrovimda toza. Bu gate parallel sessiya o'z
  kalitlarini qo'shgach yashil bo'ladi.

### ⚠️ Parallel sessiya bilan to'qnashuv — `sotuv/page.tsx` ATAYLAB MIGRATSIYA QILINMADI

Sessiya o'rtasida `git status` parallel sessiyaning **jonli** ishini ko'rsatdi (Faza 32 — POS
i18n): `sotuv/page.tsx`, `components/pos/{cash-out-dialog,debt-payment-dialog,rasmilashtirish-modal}.tsx`,
`lib/auth-store.ts(+test)`, keyin yangi `__tests__/pos-i18n-guard.test.ts`. Men `sotuv/page.tsx`
ni allaqachon tahrirlagan edim — **tahririmni qo'lda qaytardim** (`git checkout --`/`stash`
ISHLATILMADI, CLAUDE.md §6.7-A). Sabab: u faylni commit qilsam, ularning tugallanmagan i18n ishi
mening commitimga tushardi (xotira: `commit-pathspec-takes-worktree-version`). Shuning uchun bu
fazada faqat **`retail/page.tsx`** migratsiya qilindi; `sotuv` qarzi web qo'riqchisining
`PENDING_MIGRATION` ro'yxatida **mashina tomonidan kuzatiladi** (1 import + 1 blok o'chirish).

Xuddi shu sababdan web typecheck'ning 4 xatosi ham ularniki (`pos-i18n-guard.test.ts`, sessiya
davomida paydo bo'lgan yangi untracked fayl). O'z qamrovim yashilligi ularning fayliga TEGMASDAN
o'lchandi: vaqtinchalik `tsconfig.faza33-scope.json` (o'sha bitta fayl `exclude`) → **exit 0**,
so'ng scratch config o'chirildi.

### Qolgan qarz / DEFER (keyingi sessiyalar uchun ro'yxat)

1. **`sotuv/page.tsx` migratsiyasi** — Faza 32 commit qilingandan KEYIN (yuqoriga qarang).
2. **`ListResponse` — 92 faylning 91 tasi hali lokal.** `retail` o'tkazildi. Bu mexanik codemod
   ishi, LEKIN bir nuance bor: umumiy `ListEnvelope` da `total?: number` (API'ning uch xil
   javob shakli sababli), shuning uchun `data.total` ni to'g'ridan-to'g'ri `number` sifatida
   ishlatadigan sahifalar `?? 0` talab qiladi — codemod buni hisobga olsin.
3. **Qamralmagan yirik endpointlar** (keyingi to'lqin, taxminiy ustuvorlik tartibida):
   `GET /demands` (`DemandRow` — 40+ maydon, audit aynan shuni ko'rsatgan) · `GET /customer-orders` ·
   `GET /counterparties` · `GET /supplies` · `GET /invoices-out` · `GET /invoices-in` ·
   `GET /retail-sales` · `GET /payments-in|out` · `GET /cash-in|out` · `GET /variants` ·
   `GET /bundles` · `GET /price-types` · `GET /employees`.
4. **Konformans TIPNI tekshirmaydi, faqat kalit MAVJUDLIGINI.** Ustun `Int → String` ga o'zgarsa
   test o'tadi. Buni yopish uchun Prisma modelining ustun tiplarini o'qib `wire.ts` qoidalari
   bilan solishtirish kerak — alohida ish.
5. **`kind:'method'` manbasi ataylab yumshoq** — metod ichidagi begona kalit ham «bor» deb
   sanaladi. Qo'lda yig'ilgan bloklarni qoplashning narxi; kalit YO'QOLSA baribir yiqiladi.
6. **Runtime tekshiruvi yo'q.** Hech bir test haqiqiy so'rov yubormaydi — endpoint yetib
   borishi, avtorizatsiya, real JSON — hammasi **Phase-2 browser-QA** da qoladi.

---

## Faza 32 — FE auth-UX + POS i18n (`FE-07`, `FE-08`) (2026-08-09) — **Phase-1: strukturaviy + unit-tasdiqlangan, browser-smoke YO'Q**

**Commit:** `a54fedd7` — 9 fayl, +982/−277.

### `FE-07` — o'lgan seans «tirik» ko'rinardi

| | |
|---|---|
| Da'vo | «refresh o'lganda redirect yo'q» |
| Holat | **TASDIQLANDI** — `auth-store.ts refresh()` `!res.ok` da faqat `false` qaytarardi; `state.user` eski qiymatda, `ms:auth-hint` hamon `'1'` qolardi. `layout.tsx` redirect sharti `initialized && !user && !hasAuthHint()` — uchala shart ham buzilmagani uchun **hech qachon otilmasdi**. |
| Ta'sir | Refresh-cookie muddati tugagach ilova to'liq qobiq bilan render bo'laverardi: menyu, tugmalar, bo'sh ro'yxatlar — va HAR so'rov 401. Faqat qo'lda `F5` qutqarardi (u `bootstrapSession` ning o'z tozalash shoxiga tushardi). |
| Yechim | `clearSession()` — `state` + hint + `emit()`. **Faqat 401/403** da chaqiriladi. |

**ATAYLAB tozalamaydigan hollar:** tarmoq xatosi (`catch`) va 5xx. Sabab — «server javob berdi: bu token o'lik» bilan
«so'rab ham bo'lmadi» bir narsa emas. API restart yoki bir soniyalik offline kassirni sotuv o'rtasida `/login` ga
otib yuborsa, bu tuzatilayotgan bugdan battar bo'lardi. Ikkala holat testda qulflandi.

**TDD:** `auth-store.test.ts` ga 5 test qo'shildi (fayl **ustidan yozilmadi** — `Edit`, `git status` da `M`).
RED bosqichi o'lchandi: 401/403/subscriber testlari yiqildi, ikki negativ test (tarmoq, 5xx) allaqachon yashil edi —
ya'ni ular haqiqatan yangi xulqni emas, saqlanishi kerak bo'lgan xulqni qulflaydi.
Subscriber testi `renderHook(useAuth)` bilan `initialized && !user` — layout redirect shartining AYNAN o'zi.

### `FE-08` — POS matnlari i18n ga

**Qamrov:** `/sotuv/page.tsx` (2050 qator) + `components/pos/{cash-out-dialog,debt-payment-dialog,rasmilashtirish-modal}`.
`payment-dialog` va `pos-pin-lock` **allaqachon toza edi** (`pages.payment_dialog`, `pages.posLock`) — tegilmadi.

**150 kalit × 2 til:** `pages.sotuv` +91 (mavjud 60 ga qo'shildi), yangi `pages.pos` +59 (uch dialog uchun umumiy).
RU tarjimalar loyihaning mavjud lug'atidan grounded: «Статья расходов» (`fields.expense_item`), «Инкассация»
(`pages.z_report.collection`), «Получатель» (`fields.payee`), «Наличные/Карта/Сдача» (`pages.payment_dialog`),
«Кассир» (`pages.retail_sales.cashier`). *(⚠️ `/sotuv` — sherset'ning O'Z sahifasi, moysklad-parity klon EMAS →
CLAUDE.md §4 capture-grounding bu yerda qo'llanmaydi, chunki solishtiriladigan moysklad capture'i yo'q.)*

**Kalitlar deterministik skript bilan qo'shildi** (`scratchpad/add-pos-keys.mjs`, ~0 token): fail-closed — kalit
allaqachon BOSHQA qiymat bilan mavjud bo'lsa butun yugurish `exit 1` (parallel sessiya ishini jimgina bosmasin);
bir xil qiymatda idempotent. Namespace ichi alifbo tartibiga keltirildi (diff barqarorligi uchun).

### Yangi qo'riqchi — ikki gate teshigi o'lchab yopildi

`apps/web/src/__tests__/pos-i18n-guard.test.ts`:

1. **`i18n-key-existence.test.ts` FAQAT `app/(app)` ni yuradi** (`walk(APP_DIR)`, 18–19-qator) — `src/components/**`
   umuman skanerlanmaydi. POS to'lov oqimining katta qismi `components/pos/*` da: u yerdagi `t('typo')` kassir ekraniga
   xom kalit satri bo'lib chiqardi va **hamma gate yashil qolardi**.
2. **`i18n-no-hardcoded.test.ts`** faqat `DONE_ROUTES` ro'yxatidagi `<route>/{new,[id]}/page.tsx` ni tekshiradi —
   `/sotuv` (yakka `page.tsx`) va dialoglar undan **butunlay tashqarida** edi.

Skaner **pozitsiya bo'yicha** ishlaydi (JSX matn tuguni · user-facing prop · `toast`/`alert`/`new Error` argumenti),
so'z-ro'yxati bo'yicha emas: `data-test-id`, `queryKey`, API yo'llari va CSS klasslari **strukturaviy** chetda qoladi,
ya'ni qo'riqchini `data-test-id` ni qayta nomlab aldab bo'lmaydi.

**O'LCHANDI (bo'sh-yashil emas):** aynan shu skaner mantiqi `git show HEAD:` nusxalariga qo'llanganda
**88 sizish** topdi (sotuv 56 · rasmiylashtirish 16 · debt-payment 10 · cash-out 6 · payment-dialog 0 · pin-lock 0),
hozir **0**.

**Soxta-musbat tuzatildi:** TS generic yopuvchi `>` JSX teg yopuvchisidan farq qilmaydi —
`useState<'savat' | 'smena'>('savat')` dan keyingi kod «ekran matni» deb o'qildi. Kod-shakl bo'yicha rad etiladi
(`;`/`=` bor yoki `(` bilan boshlanadi). Apostrof **ataylab** rad etilmaydi: «Do'kon», «yo'q» — aynan tutilishi
kerak bo'lgan imlo. Regressiya testi bilan qulflandi.

### Gate (QO'LDA, to'liq)

web typecheck **0** · `check-lint.mjs` **0 error** (745 warning — siyosat ruxsat) · `i18n:gate` **9/9** ·
to'liq web Vitest **187 fayl / 2829 test yashil, 0 yiqilish** (26 skip).
**Sanoq nazorati:** `2829 = 2814 (HEAD) + 5 (auth-store) + 5 (pos-guard) + 5 (parallel sessiyaning
`shared-api-contracts.test.ts`)` — jim yo'qolgan test yo'q.

**Hook'lar bir martaga chetlab o'tildi** (`-c core.hooksPath=/dev/null`): parallel sessiya ayni damda
`apps/web/src/app/(app)/retail/page.tsx` + `packages/contracts/` ustida ishlayapti, `lint-staged` esa butun daraxtni
stash qiladi (CLAUDE.md §6.7 B). Shu sababli gate'lar markazda QO'LDA to'liq yugurtirildi.
`git add` 9 aniq yo'l; `git show --stat HEAD` bilan tasdiqlandi — begona fayl yo'q.

### Qolgan qarz

1. **Browser-QA YO'Q.** Til-almashtirgichni bosib POS ni RU da ko'rish qilinmadi — Phase-2. Statik gate
   «kalit bor» deydi, «RU matn to'g'ri joyga tushdi» demaydi.
2. **RU tarjimalar tekshirilmagan.** Ular loyiha lug'atidan grounded, lekin ona tilida so'zlashuvchi ko'rmagan.
   Ayniqsa: «Оформить» (`checkout_submit`), «Сдать» (`cash_out_submit_collection`), «Записывается на: {name}».
3. **3 dinamik kalit statik tekshirilmaydi** — `t(\`type_${kind}\`)` (`type_oddiy`/`type_usta`/`type_dokon`).
   Ular mavjud, lekin imlo xatosi gate'dan o'tib ketardi. Qo'riqchida dinamik kalitlar soni ≤3 shiftiga qo'yildi
   (qamrov jimgina dinamiklashib ketmasin).
4. **`'POS qaytarish'` ataylab i18n QILINMADI** — bu DB'da saqlanadigan hujjat izohi, ekran matni emas; kassir tiliga
   bog'lansa bir xil hujjat kim yaratganiga qarab turlicha yozilib, qidiruv/hisobot buzilardi. Qo'riqchining
   `ALLOWED_NON_UI` ro'yxatida, chaqiruv joyida izoh bilan.
5. **`fmtDate` `'uz-UZ'` qattiq yozilgan** (`debt-payment-dialog.tsx`) — `dd.mm.yyyy` ikkala tilda bir xil
   chiqqani uchun sizish EMAS, lekin lokal-bog'liq format kerak bo'lsa qarz.
6. **Qo'riqchining ko'r nuqtasi:** ko'p qatorli JSX matn tuguni ichida `{}` bo'lsa o'tkazib yuboriladi
   (ifoda bilan aralash matn). Bu fazadan keyin bunday qoldiq yo'q, lekin yangisi qo'shilsa tutilmaydi.
