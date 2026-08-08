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
