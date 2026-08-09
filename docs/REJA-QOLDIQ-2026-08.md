# QOLDIQ-REJA — Audit-tuzatish 2-to'lqin (2026-08-09)

> **Manba:** `docs/REJA-AUDIT-FIX-2026-08.md` — 1-to'lqinning 34 fazasi bajarildi (15, 18b/c, 27b/c,
> 29b dan tashqari). Har faza hisobotidagi **«Qolgan qarz / DEFER»** bandlari shu rejaga yig'ildi.
> Har topilmaning to'liq dalili manba-faza hisobotida (`HISOBOT JURNALI → Faza N`) — agent avval
> O'SHA hisobotni o'qib ground-truth qiladi.

**Maqsad:** 1-to'lqindan ochiq qolgan bajarilmagan fazalar, hisobotlarda topilgan yangi bug'lar va
ataylab DEFER qilingan ishlarni fazama-faza, **har birini alohida sessiyada** yopish.

---

## ⛔ O'ZGARMAS QOIDALAR — HAR SESSIYA AGENTI UCHUN

Bu rejani o'qiyotgan agent quyidagilarni **so'zsiz** bajaradi:

1. **Faqat BITTA faza.** Senga topshirilgan faza raqamini bajarasan. Tugagach **TO'LIQ TO'XTAYSAN** —
   keyingi fazani BOSHLAMAYSAN. Bu token-iqtisod qoidasi (CLAUDE.md §0.3), buzilmaydi.
2. **Avval o'qi:** (a) shu rejadagi o'z fazangni, (b) fazada ko'rsatilgan **manba-faza hisobot(lar)ini**
   `docs/REJA-AUDIT-FIX-2026-08.md` → HISOBOT JURNALI'dan, (c) tegishli manba-fayllarni. Da'voni
   **o'z ko'zing bilan kodda tasdiqla** (CLAUDE.md §2) — hisobot yozilganidan beri kod o'zgargan
   bo'lishi mumkin; tasdiqlanmasa hisobotda yoz va to'xta, ko'r-ko'rona o'zgartirma.
3. **TDD:** avval **yiqiladigan test** yoz (bug'ni ko'rsatadigan), yiqilishini ko'r, keyin minimal
   fix, keyin test o'tishini ko'r. Testlar co-located `.test.ts` (vitest).
4. **To'liq gate (majburiy, commit oldidan):**
   - `pnpm --filter @moysklad/api typecheck` → 0 xato *(web tegilsa `@moysklad/web` ham)*
   - `pnpm lint:product` → 0 xato
   - `pnpm i18n:gate` → o'tadi *(UI-matn tegilgan bo'lsa)*
   - Fazaga tegishli test: `pnpm --filter @moysklad/api exec vitest run <modul-yo'li>` + regress
     tekshiruvi. Web uchun `@moysklad/web`, pul uchun `@moysklad/money`.
5. **Halol status (CLAUDE.md §1):** natija **«Phase-1: strukturaviy + unit-tasdiqlangan, browser-smoke
   YO'Q»** deb belgilanadi. «done/production-ready» DEMA. Runtime-QA alohida cohort-sessiyaga qoladi.
6. **Git xavfsizligi (CLAUDE.md §6):** faqat aniq yo'llar bilan `git add <fayllar>`. Commit oldidan
   `git status --short`, commitdan keyin `git show --stat HEAD`. `git reset --hard`/`checkout -- .`/
   `stash` — TAQIQ. Dirty-tree'da seniki bo'lmagan o'zgarish bo'lsa — tegma. Parallel sessiya faol
   bo'lsa hook'larni bir martaga chetlab o'tish mumkin (`-c core.hooksPath=/dev/null`) — u holda
   gate'larni qo'lda TO'LIQ yugurtir va commit xabarida yoz.
7. **Migratsiya (agar sxema tegilsa):** lokal DB = `climart_adopt @ localhost:5432`
   (`climart-adopt-local-db-untracked.md` xotirasi — `_prisma_migrations`-tracked emas,
   `prisma db execute --file` bilan qo'llanadi; `pg_trgm` holatini tekshir). Migratsiya = umumiy
   resurs (§6.4) — yolg'iz sessiyada.
8. **Model:** OPUS/flagship (**Fable**) — Sonnet EMAS (CLAUDE.md §0.1). Mexanik codemod uchun avval
   deterministik skript (fail-closed: anchor topilmasa exit 1), keyin agent.
9. **Hisobot:** faza tugagach **SHU FAYL oxiridagi «HISOBOT JURNALI»** bo'limiga o'z fazang ostiga
   qilgan HAMMA o'zgarishni yoz (fayllar, nima o'zgardi, testlar RED→GREEN, gate natijasi, qolgan
   qarz/DEFER) va faza sarlavhasidagi `◻ HISOBOT` belgisini yangila. Yozishda faqat
   `appendFileSync`/aniq Edit — marker-kesish TAQIQ (`doc-append-marker-truncation` xotirasi).
10. **Commit:** gate yashil bo'lgach ma'noli xabar bilan (`fix(<domen>): faza QN — <qisqa>`).
    Mavjud test-fayl ustidan Write QILMA — faqat Edit (`never-write-over-existing-test-file`).

**Bog'liqlik:** fazalar ustuvorlik bo'yicha (P0→P4); bog'liq faza «Bog'liqlik» qatorida ko'rsatilgan.

---

## 🔧 OPS-QADAMLAR (kod EMAS — foydalanuvchi ishtirokidagi alohida deploy/ops-sessiya)

Bu bandlar hech bir fazaga kirmaydi — ular prod-ma'lumot/deploy qarorlari. Alohida sessiyada
foydalanuvchi bilan birga bajariladi (`/deploy` skill + shu ro'yxat):

1. **Jurnal backfill + recompute** (Faza 10/12 hisobotlari): `backfill-counterparty-balance-journal.ts
   APPLY=1` → `recompute-counterparty-balances.ts` DRY → kerak bo'lsa APPLY. Busiz akt-sverka/metrics
   tarixiy qoldiqni ko'rsatmaydi; tarixiy o'chirilgan qarzlar saldoda turibdi.
2. **InvoiceIn tarixiy ikki-karra qarz** (Faza 13 hisoboti, §«BALANSNI QAYTA-HISOBLASH», SQL tayyor):
   o'lchash → qatorlar bo'lsa `CounterpartyAdjustment` bilan korrektirovka. Jurnal qatorlari O'CHIRILMAYDI.
3. **Supply omborchi-tuzatilgan tarixiy summalar** (Faza 14 hisoboti, SQL tayyor): o'lchash →
   `CounterpartyAdjustment` retsepti.
4. **Bank-import prod dublikatlari** (Faza 20 hisoboti, SQL tayyor): o'lchash → tozalash → shundan
   KEYINGINA partial unique index migratsiyasi (Faza Q9 «Diqqat» bandi).
5. **Prod (`sherset_v2`) DDL'lari** — sxema-drift tufayli `migrate deploy` emas, qo'lda
   `prisma db execute --file`: jurnal-jadval + `doc_id` nullable · gateway `@@unique` (avval dublikat
   tekshir!) · dashboard indekslari (past yuklamada) · `move_positions.base_cost_minor` ·
   `debt_payments.exchange_rate` ×10⁴→×10⁸ · `retail_sales.debt_return_minor`.
6. **🔴 Telegram webhook** (Faza 21 DEPLOY-BLOKER): deploydan keyin har akkaunt uchun
   `POST /telegram/config/webhook` — aks holda inbound Telegram (jonli supply-approval tugmalari)
   TO'XTAYDI. Tekshir: `businessStatus.webhookSecretSet === true`.
7. **Env sirlari** (Faza 22): deploydan OLDIN VPS'da haqiqiy `JWT_SECRET`/`COOKIE_SECRET` borligini
   tekshir — endi yo'q bo'lsa API boot'da YIQILADI.
8. **Rol matritsasi QA** (Faza 23 qattiqlashuvi): `employees:full`siz menejer KPI konfiguratsiyasini
   saqlay olmaydi; `settings`siz «Отделы» yaratilmaydi — rollarni deploydan keyin tekshir/to'ldir.
9. **`retail_sales.agent_id` backfill** audit-hodisalardan (Faza 7 hisoboti tavsiyasi) — legacy qarz
   cheklari qaytarilishi uchun.
10. **PM2/VPS gigiena:** `instances: 1` saqlanishi; yetim poll-sikllar tekshiruvi
    (`deploy-orphan-poll-loops` xotirasi).
11. **Phase-2 QA cohortlari:** BARCHA fazalar Phase-1 (browser-smoke YO'Q) — `/qa-cohort` sessiyalari
    alohida rejalashtiriladi (retail/POS cohort birinchi: Faza 6/7/15/30 o'zgarishlari).

---

# P0 — PUL TO'G'RILIGI (1-to'lqindan bajarilmay qolganlar)

---

### Faza Q1 — Smena naqdi paketi: expected-cash + z-report + close-race + picking-block
**Ustuvorlik:** P0 · **Bog'liqlik:** yo'q · **Manba:** asl reja Faza 15 (bajarilmagan) + Faza 7/8 hisobotlari
**Muammo:** `SALES-02` (HIGH), `SALES-06`, `SALES-07/08` (MEDIUM) — asl reja Faza 15 matni to'liq
amal qiladi. Qo'shimcha, hisobotlarda topilgan 2 jonli bug:
- **(Faza 7 hisoboti):** `cashier-session.zReport` `creditAgg` `method: 'debt'` (kichik harf) bilan
  qidiradi, tender qiymati esa `'DEBT'` (`retail-tenders.ts:34`) → «qarzga sotildi» ko'rsatkichi doim 0.
- **(Faza 8 hisoboti):** `retail-sale.service.ts` `post()`da `parsed.agentId` chekdagi mavjud
  `sale.agentId`dan ustun turadi, lekin chek qatori yangilanmaydi (`!sale.agentId` sharti) → qarz
  daftari bir kontragentga, chek boshqasiga ishora qilishi mumkin (refund noto'g'ri mijozdan yechadi).
**Yechim:** (a) `collectCashInputs`: `salesCashMinor` so'roviga `refundedFromId: null` + `Σ changeMinor`
ayirish. (b) legacy `z-report` `salesAgg` `state:{in:['posted','refunded']}` (yoki yangi zReport'ga
delegatsiya); `creditAgg` tender qiymatini `'DEBT'`ga moslash. (c) `post()` tx ichida sessiyani
`updateMany({where:{id,state:'open'}})` claim; `close()` aggregat+flip bitta Serializable tx.
(d) `close()` draft bilan birga picking/ready cheklarni ham blok/ko'chirish. (e) `post()`da
`parsed.agentId` berilsa chek qatori ham yangilansin (yoki mavjud agent bilan zid bo'lsa 400 —
agent hisobotda asoslab tanlaydi).
**Diqqat:** Faza 7 refund semantikasi o'zgargan (qisman refundda chek `posted` qoladi, oyna cheklar
`refundedFromId` bilan) — Faza 15'ning asl matnini shu yangi haqiqatga moslab qo'lla. Faza 7
hisobotidagi «Faza 15 bilan kesishma» bandini o'qi.
**Fayllar:** Modify `apps/api/src/modules/cashier-session/cashier-session.service.ts`,
`retail-sale/retail-sale.service.ts`, `retail-sale/retail-sale.controller.ts`. (+ testlar).
**Testlar (TDD):** (1) qaytimli+refundli smena → expected-cash to'g'ri (soxta kamomad yo'q). (2)
to'liq-refund chek → z-report netSum 0; qisman-refund ikki marta ayirilmaydi. (3) yopilayotgan smenaga
post → 409. (4) picking chek yopilgan smenada bloklanadi. (5) creditAgg 'DEBT' bilan qarz-sotuvni ko'radi.
(6) agentId-override: daftar va chek bir xil kontragentga.
**Gate:** standart API-gate + `vitest run` cashier-session, retail-sale.
**▶ SESSIYA-BOSHI PROMPT:**
> `docs/REJA-QOLDIQ-2026-08.md` — **Faza Q1** ni bajar. O'ZGARMAS QOIDALARga amal qil. Asl reja
> `docs/REJA-AUDIT-FIX-2026-08.md` Faza 15 matnini + Faza 7/8 hisobotlarining tegishli bandlarini o'qi,
> kodda tasdiqla. expected-cash + z-report + close-race + picking-block + creditAgg 'DEBT' + agentId
> override. TDD: 6 stsenariy. Gate. Hisobotни shu fayl jurnaliга yozib TO'XTA — keyingi fazani BOSHLAMA.
**☑ HISOBOT (2026-08-09):** BAJARILDI — batafsili «HISOBOT JURNALI → Faza Q1» da.

---

### Faza Q2 — WorkOrder weighted-average cost (18b)
**Ustuvorlik:** P0 · **Bog'liqlik:** yo'q (18a tugagan) · **Manba:** Faza 18a hisoboti, `PP-05`
**Muammo:** `work-order.service.ts` 4 delta-nuqtasi (18a-fix'dan oldingi raqamlash `:436,469,553,568`)
`costDeltaMinor: null` — WorkOrder chiqim/chiqarish qiymat balansiga tegmaydi; reversal joriy-BOM'dan.
**Yechim:** Processing dvigatelidagi naqsh bo'yicha weighted-average consume/output: chiqimda per-store
`costBalanceMinor/qty` o'rtacha (18a'dagi `computePerUnitCost` + `buyPrice` fallback), per-unit
pozitsiyaga muzlatiladi, complete→cancel AYNAN muzlatilgan qiymat bilan teskari (zero-sum).
**Fayllar:** Modify `apps/api/src/modules/work-order/work-order.service.ts` (+ testlar; `demand`/`loss`
18a naqshi va `processing` namunasiga qara).
**Testlar (TDD):** (1) WorkOrder complete → komponent store'ida costBalance per-unit o'rtacha × qty ga
kamayadi, output store'iga mos qiymat kiradi. (2) complete→cancel zero-sum (BOM keyin o'zgargan bo'lsa ham).
(3) bo'sh/qiymatsiz stock'da buyPrice fallback, NULL≠0 shartnomasi buzilmaydi.
**Gate:** standart API-gate + `vitest run` work-order, stock, demand (regress).
**▶ SESSIYA-BOSHI PROMPT:**
> `docs/REJA-QOLDIQ-2026-08.md` — **Faza Q2**. O'ZGARMAS QOIDALAR. Faza 18a hisobotini o'qi (naqsh
> tayyor). `PP-05`ni kodda tasdiqla. WorkOrder'ni weighted-avg consume/output + muzlatilgan reversal'ga
> o'tkaz. TDD: 3 stsenariy. Gate. Hisobot, TO'XTA.
**☑ HISOBOT (2026-08-09):** BAJARILDI — batafsili «HISOBOT JURNALI → Faza Q2» da.

---

### Faza Q3 — delete() yo'llari atomik claim (pul-oila + loss 🔴 + skaner qamrov-lock)
**Ustuvorlik:** P0 · **Bog'liqlik:** yo'q · **Manba:** Faza 1, 3, 5 hisobotlari («Qolgan qarz»)
**Muammo:** uch hisobot bir sinfni ochiq qoldirgan:
- **🔴 `loss.delete()`** (`loss.service.ts:516-528`): `findById` check → shartsiz soft-delete update.
  Parallel `post` bilan poyga → yetim StockOperation (hech qachon qaytmaydi). 7 sibling'da
  `updateMany({where:{state:'draft', applicable:false, deletedAt:null}})` bilan yopilgan, loss'da yo'q.
- **Pul-oila `delete()`/`softDelete()`** (7 servis, Faza 1 DEFER): read-check-then-write; parallel
  `post`+`delete` poygasi (draft o'chadi-yu post o'tadi).
- **Invoice-oila `applyPayment` deletedAt-TOCTOU** (Faza 3 DEFER): mavjudlik pre-read'i bilan
  increment orasida soft-delete → increment baribir yoziladi. Yopish: `deletedAt:null`ni update
  WHERE'iga + P2025 catch (xato-shakli o'zgarishini hisobotda hujjatla).
- **Skaner qamrov-lock yo'q** (Faza 5 DEFER): `transition-toctou-class.test.ts` stock-oilada
  `MONEY_SERVICES`dagi kabi nomlar-ro'yxati assert'i yo'q — yangi stock-servis jimgina qamrovdan chetda.
**Yechim:** loss.delete → sibling naqshi; 7 pul-servis delete'iga shartli `updateMany` claim; invoice
applyPayment WHERE'iga deletedAt; skaner'ga stock qamrov-lock + delete-claim assertlari.
**Fayllar:** Modify `loss/loss.service.ts`, 7 pul-servis (`payment-in/out`, `cash-in/out`,
`invoice-out/in`, `counterparty-adjustment`), `shared/transition-toctou-class.test.ts`. (+ testlar).
**Testlar (TDD):** (1) parallel post∥delete → faqat bittasi yutadi (409/404), yetim StockOperation yo'q.
(2) soft-deleted hujjatga applyPayment → rad. (3) qamrov-lock: ro'yxatdan servis o'chirilsa test yiqiladi.
**Gate:** standart API-gate + `vitest run` loss, shared, payment-in/out, cash-in/out, invoice-out/in,
counterparty-adjustment.
**▶ SESSIYA-BOSHI PROMPT:**
> `docs/REJA-QOLDIQ-2026-08.md` — **Faza Q3**. O'ZGARMAS QOIDALAR. Faza 1/3/5 hisobotlarining «Qolgan
> qarz» bandlarini o'qi, kodda tasdiqla. loss.delete + 7 pul-servis delete claim + applyPayment
> deletedAt + skaner qamrov-lock. TDD: 3 stsenariy. Gate. Hisobot, TO'XTA.
**☑ HISOBOT (2026-08-09):** BAJARILDI — batafsili «HISOBOT JURNALI → Faza Q3» da.

---

### Faza Q4 — 18c qoldig'i: supply unpost-guard tozalash + Demand oxirgi-birlik qoldiq
**Ustuvorlik:** P0 · **Bog'liqlik:** Q2 tavsiya (18-oila yakuni) · **Manba:** Faza 18a hisoboti §«QARZ» + Faza 34
**Muammo:** (a) `SupplyPosition.remainingQty` endi COGS uchun O'LIK (faqat legacy-reversal o'zgartiradi)
— supply'da `remainingQty = quantity` yozish va unga asoslangan unpost-guard'lar olib tashlanishi/
moslashtirilishi kerak. (b) Demand to'liq chiqimda (`qty == onHand`) perUnit-yaxlitlashdan
`costBalanceMinor`da ±tiyin qoldiq qoladi. **Diqqat:** Move tomonini Faza 34 allaqachon yopdi
(`move-cost-basis.ts computeTransferCost` + `baseCostMinor`) — o'sha naqshni qayta ishlat, qayta yozma.
**Yechim:** Demand chiqimida `qty == onHand` bo'lsa delta = butun `costBalanceMinor` (Faza 34
`computeTransferCost` naqshi); reversal aniq bo'lishi uchun kerak bo'lsa satr-qiymat saqlash
(`per-unit-snapshot-blocks-exact-cost-fix` xotirasi — teskarilash snapshot'dan hisoblansa yangi ustun
kerakligini tekshir). Supply unpost-guard'larini remainingQty'dan boshqa mezonga o'tkaz yoki olib
tashla (hisobotda asosla).
**Fayllar:** Modify `demand/demand.service.ts`, `supply/supply.service.ts`; ehtimol
`packages/db/prisma/schema.prisma` (+ migratsiya, agar satr-qiymat ustuni kerak bo'lsa). (+ testlar).
**Testlar (TDD):** (1) 1000 tiyin / 3 dona to'liq chiqim → costBalance aynan 0. (2) post↔unpost
bit-ma-bit zero-sum (yangi va eski qatorlar). (3) supply unpost mavjud xulqi regressiz.
**Gate:** standart API-gate (+ migrate agar sxema tegilsa) + `vitest run` demand, supply, stock.
**▶ SESSIYA-BOSHI PROMPT:**
> `docs/REJA-QOLDIQ-2026-08.md` — **Faza Q4**. O'ZGARMAS QOIDALAR. Faza 18a §QARZ + Faza 34 hisobotini
> o'qi (Move naqshi tayyor — qayta ishlat). Demand oxirgi-birlik + supply remainingQty tozalash.
> TDD: 3 stsenariy. Gate. Hisobot, TO'XTA.
**☑ HISOBOT (2026-08-09):** BAJARILDI — batafsili «HISOBOT JURNALI → Faza Q4» da.

---

# P1 — HISOBOT / HR / INTEGRATSIYA (1-to'lqin davomi)

---

### Faza Q5 — Analitika items: DB-paginate + truncated (27b)
**Ustuvorlik:** P1 · **Bog'liqlik:** yo'q · **Manba:** Faza 27a hisoboti (naqsh), `PERF-01`
**Muammo:** `analitika/items.service.ts` hammani RAM'ga tortib JS'da agregat + 10k cap jim kesadi.
**Yechim:** Faza 27a naqshi (search-before-take, SQL where pre-filter, raw-SQL guruh-count,
`truncated: true` bayrog'i) — `stock-balance.service.ts`dagi qo'llanilgan yechimni namuna qilib ol.
**Fayllar:** Modify `apps/api/src/modules/analitika/items.service.ts` (+ testlar).
**Testlar (TDD):** (1) cap'dan katta datasetda total to'g'ri + `truncated` bayroq. (2) qidiruv cap
tashqarisidagi elementni topadi. (3) mavjud javob-shakli regressiz.
**Gate:** standart API-gate + `vitest run` analitika.
**▶ SESSIYA-BOSHI PROMPT:**
> `docs/REJA-QOLDIQ-2026-08.md` — **Faza Q5**. O'ZGARMAS QOIDALAR. Faza 27a hisobotидаги naqshni o'qi.
> `PERF-01`ni kodda tasdiqla. items.service DB-paginate + truncated. TDD: 3 stsenariy. Gate. Hisobot, TO'XTA.
**◻ HISOBOT:** _(agent to'ldiradi)_

---

### Faza Q6 — Akt-sverka: davr-filtri + saldo-forward (27c)
**Ustuvorlik:** P1 · **Bog'liqlik:** yo'q · **Manba:** Faza 27a hisoboti (27c bandi), `PERF-02`
**Muammo:** akt-sverka butun-tarixni tortadi; davr-filtri va davr-boshi saldo-forward yo'q.
**⚠️ Diqqat — audit dalili ESKIRGAN:** «11 parallel findMany» Faza 10'da jurnalga ko'chirilgan;
davr-mashinasi (`foldJournalPeriod`) allaqachon yozilgan — akt-sverka uni ishlatmaydi xolos.
Dalilni QAYTA o'qi, yechimni mavjud jurnal-mashinaga qur.
**Yechim:** `counterparty-statement`ga `dateFrom/dateTo` + davr-boshi saldo-forward
(`foldJournalPeriod` reuse); pozitsiyalarni faqat product-filtr rejimida tortish. FE kontraktga davr
parametrlari (sahifa + print sahifasi).
**Fayllar:** Modify `counterparty-statement/counterparty-statement.service.ts`,
`counterparty-statement/statement-compute.util.ts`; (FE) tegishli sahifa/print. (+ testlar).
**Testlar (TDD):** (1) davr ichi qatorlar + davr-boshi saldo == jurnal folding. (2) `to=now` yakuni
materialized balansga teng (mavjud invariant buzilmaydi). (3) product-filtr rejimi regressiz.
**Gate:** standart API-gate + `vitest run` counterparty-statement; web tegilsa web-gate + i18n.
**▶ SESSIYA-BOSHI PROMPT:**
> `docs/REJA-QOLDIQ-2026-08.md` — **Faza Q6**. O'ZGARMAS QOIDALAR. Faza 27a hisoboti 27c bandini o'qi —
> dalil eskirgan, jurnal-mashina (`foldJournalPeriod`) tayyor. Davr-filtri + saldo-forward. TDD: 3
> stsenariy. Gate. Hisobot, TO'XTA.
**◻ HISOBOT:** _(agent to'ldiradi)_

---

### Faza Q7 — HrAttendance soft-delete + audit + yetim-jarima (29b)
**Ustuvorlik:** P1 · **Bog'liqlik:** yo'q · **Manba:** Faza 29a hisoboti §«29b» (retsept tayyor), `HR-13`
**Muammo:** `HrAttendance.delete` hard-delete auditsiz; `HrBonusFineLog.attendanceId` xom FK —
hard-delete `auto_late` jarimani yetim qoldiradi.
**Yechim (29a hisoboti 3 bandi):** (1) Prisma migratsiya `deletedAt`/`deletedById` (umumiy resurs —
yolg'iz sessiya). (2) `delete()` → soft-delete + auditLog + `LateFineService.syncForAttendance`
storno (mexanizm 29a'da tayyor). (3) BARCHA o'quvchilarga `deletedAt: null` filtri: `listToday`,
`report`, `aggregateEmployeeDay`, davomat dashboard/eksport — grep bilan to'liq ro'yxat chiqarib
hisobotda ko'rsat.
**Fayllar:** Modify `packages/db/prisma/schema.prisma` (+ migration),
`hr/attendance/hr-attendance.service.ts`, o'quvchi servislari. (+ testlar).
**Testlar (TDD):** (1) delete → soft + audit qator. (2) o'chirilgan qator hech bir hisobot/agregatda
ko'rinmaydi. (3) delete'da auto_late jarima storno bo'ladi.
**Gate:** standart API-gate + migrate + `vitest run` hr.
**▶ SESSIYA-BOSHI PROMPT:**
> `docs/REJA-QOLDIQ-2026-08.md` — **Faza Q7**. O'ZGARMAS QOIDALAR. Faza 29a hisoboti «29b» bandini o'qi
> (retsept + migratsiya gotcha'lari yozilgan). Soft-delete + audit + o'quvchi-filtrlar + jarima-storno.
> TDD: 3 stsenariy. Gate + migrate. Hisobot, TO'XTA.
**◻ HISOBOT:** _(agent to'ldiradi)_

---

### Faza Q8 — Tarixiy kurs: qolgan 8 davr-oqim hisoboti
**Ustuvorlik:** P1 · **Bog'liqlik:** yo'q (Faza 17 mexanizmi tayyor) · **Manba:** Faza 17 hisoboti DEFER-1
**Muammo:** tarixiy kurs faqat `pnl` + `cash-flow`da; `profitability`, `sales-by-channel`,
`sales-by-hour`, `average-basket`, `unit-economics`, `purchase-management`, `warehouse-ops`,
`report.service` hamon JORIY kursda konsolidatsiya qiladi (o'tgan davr qayta yoziladi).
**Yechim:** har hisobot SQL/groupBy'siga `rate_value` qo'shib `consolidateToBase(..., docRateValue)`
5-argumentini uzatish (Faza 17 naqshi — identity-qo'riqchi allaqachon helperda). `aging` va
`counterparty-balance`ga TEGMA (ataylab joriy kursda — ochiq-qoldiq revalyatsiyasi).
**Fayllar:** Modify sanab o'tilgan 8 servis `apps/api/src/modules/{report,analitika}/`. (+ testlar).
**Testlar (TDD):** har o'tkazilgan hisobot uchun: kurs o'zgargach o'tgan-davr natijasi O'ZGARMAYDI;
default-kurs (1e8) hujjat joriy kontekstga tushadi (identity-qo'riqchi).
**Gate:** standart API-gate + `vitest run` report, analitika.
**▶ SESSIYA-BOSHI PROMPT:**
> `docs/REJA-QOLDIQ-2026-08.md` — **Faza Q8**. O'ZGARMAS QOIDALAR. Faza 17 hisobotini o'qi (mexanizm +
> identity-qo'riqchi tayyor). 8 hisobotga `rate_value` tarqat. TDD: davr-barqarorlik testlari. Gate.
> Hisobot, TO'XTA.
**◻ HISOBOT:** _(agent to'ldiradi)_

---

### Faza Q9 — Bank-import: crash-oyna tx + INN SQL-lookup
**Ustuvorlik:** P1 · **Bog'liqlik:** yo'q · **Manba:** Faza 20 hisoboti DEFER-1 + Faza 25 hisoboti DEFER-2
**Muammo:** (a) `paymentIn.create` bilan `bankStatementRow.update({paymentInId})` orasida jarayon o'lsa
— bog'lanmagan to'lov, TTL-retry'da dublikat. To'liq yopish: to'lovni qator-bog'lanishi bilan BIR
tranzaksiyada yaratish (`PaymentInService.create` tashqi `tx` qabul qilishi kerak). (b)
`bank-import.service.ts:443` INN-solishtirish butun kontragent jadvalini RAM'ga yuklab JS'da —
SQL-lookup kerak; shundан keyin INN uchun **btree** expression-indeks
(⚠️ `expression-index-must-match-prisma-sql` xotirasi — ifoda Prisma emit qiladigan SQL'ga aynan mos
bo'lsin, EXPLAIN bilan o'lcha).
**Yechim:** `PaymentInService.create`ga ixtiyoriy `tx` parametri (Faza 19'dagi chaqiruvchi ham
foydalanishi mumkin — tekshir, lekin scope'ni bank-import bilan chekla); commit oqimini bitta tx'ga.
INN lookup raw-SQL + btree expression-indeks migratsiyasi.
**Diqqat:** partial unique index QO'YMA — avval prod dublikatlari o'lchanishi kerak (OPS-4).
**Fayllar:** Modify `bank-import/bank-import.service.ts`, `payment-in/payment-in.service.ts`;
`packages/db/prisma/migrations/` (+ raw `.sql`). (+ testlar).
**Testlar (TDD):** (1) commit tx'i yiqilsa PaymentIn ham, bog'lanish ham yo'q (yarim-holat qolmaydi).
(2) INN-lookup to'g'ri kontragentni topadi (JS-yuklamasdan). (3) mavjud dedup testlari regressiz.
**Gate:** standart API-gate + migrate + `vitest run` bank-import, payment-in.
**▶ SESSIYA-BOSHI PROMPT:**
> `docs/REJA-QOLDIQ-2026-08.md` — **Faza Q9**. O'ZGARMAS QOIDALAR. Faza 20 DEFER-1 + Faza 25 DEFER-2'ni
> o'qi, kodda tasdiqla. Create+link bitta tx + INN SQL-lookup + btree expression-indeks (EXPLAIN bilan).
> Unique index QO'YMA (ops-gated). TDD: 3 stsenariy. Gate + migrate. Hisobot, TO'XTA.
**◻ HISOBOT:** _(agent to'ldiradi)_

---

# P2 — XAVFSIZLIK (1-to'lqin DEFER'lari)

---

### Faza Q10 — Guard-siz kontrollerlar: haqiqiy teshiklar paketi
**Ustuvorlik:** P2 · **Bog'liqlik:** yo'q · **Manba:** Faza 23 hisoboti §«HAQIQIY teshik» ro'yxati
**Muammo:** 61 guard-siz handler'dan «haqiqiy teshik» toifasi (ustuvorlik tartibida): `sklad-keeper`
(`PUT /` + `PUT receipt-printer` + `DELETE :skladNo` — `settings` entity), `shift-schedule` va `smena`
(davomat/jarimaga ta'sir), `debt.controller:359 POST pos/pay` (**pul**), `driver-cash`
(`collect`/`hand-over`/`cancel` — **naqd**), `restock-task`, `pick-list` (`sync`/`pick-state`/`printed`),
`hr/attendance-geo/ping.controller` (boshqa xodim nomidan yozish mumkinligini tekshir),
`work-location`, `driver-tracking`/`driver-trip` (DispatcherGuard bor — qisman).
**Yechim:** har biriga tegishli `@RequirePermission(entity.action)`; ping'da self-scope tekshiruvi.
Faza 23 hisobotidagi toifalashni asos qilib ol («ataylab ochiq» ro'yxatiga TEGMA). Ruxsat
qattiqlashuvi = xulq o'zgarishi — har endpoint uchun qaysi rol ta'sirlanishini hisobotda jadval qilib
yoz (deploy-QA uchun, OPS-8 bilan bog'liq).
**Fayllar:** Modify tegishli controllerlar. (+ testlar).
**Testlar (TDD):** har yopilgan endpoint: permissionsiz 403, permission bilan o'tadi; ping self-scope.
**Gate:** standart API-gate + `vitest run` tegishli modullar + `app-boot`.
**▶ SESSIYA-BOSHI PROMPT:**
> `docs/REJA-QOLDIQ-2026-08.md` — **Faza Q10**. O'ZGARMAS QOIDALAR. Faza 23 hisoboti toifalash
> ro'yxatini o'qi. «Haqiqiy teshik» endpointlariga permission-guard. TDD: 403-testlar. Ta'sirlangan
> rollar jadvali hisobotda. Gate. Hisobot, TO'XTA.
**◻ HISOBOT:** _(agent to'ldiradi)_

---

### Faza Q11 — saveConfig PATCH-audit (INT-13 klassi) + webhookSecretSet badge
**Ustuvorlik:** P2 · **Bog'liqlik:** yo'q · **Manba:** Faza 21 hisoboti DEFER-1/4
**Muammo:** (a) `INT-13` naqshi (`X: parsed.X ?? null` — qisman update maydonlarni NULL-reset qiladi)
faqat `telegram` saveConfig'da tuzatilgan; `onec`, `marketplace`, `bank-adapter` va boshqa
integratsiya saveConfig'lari TEKSHIRILMAGAN. (b) `businessStatus.webhookSecretSet` API'da bor, lekin
`telegram-chat-card.tsx` UI'da ko'rsatilmaydi — operator «sozlangan-u ishlamayapti» holatini ko'rmaydi.
**Yechim:** (a) barcha integratsiya saveConfig'larini grep bilan ro'yxatlab, har birini PATCH-semantikaga
(`...(parsed.X !== undefined ? {X} : {})`) o'tkaz — Faza 21'dagi naqsh; «ataylab tozalash» (`''`→null)
saqlansin. (b) `BusinessStatus` tipi + badge (`webhookSecretSet:false` → ogohlantirish) + ru/uz kalitlar.
**Fayllar:** Modify integratsiya servislari (grep natijasiga ko'ra), (FE)
`components/.../telegram-chat-card.tsx`, `messages/{ru,uz}.json`. (+ testlar).
**Testlar (TDD):** har saveConfig: bitta maydon yuborilsa qolganlari SAQLANADI; `''` ataylab tozalaydi.
**Gate:** standart API-gate + web-gate + `i18n:gate` + `vitest run` tegishli modullar.
**▶ SESSIYA-BOSHI PROMPT:**
> `docs/REJA-QOLDIQ-2026-08.md` — **Faza Q11**. O'ZGARMAS QOIDALAR. Faza 21 hisoboti DEFER'larini o'qi.
> INT-13 klassini barcha saveConfig'larda audit+fix, webhookSecretSet badge. TDD: PATCH-semantika
> testlari. Gate (API+web+i18n). Hisobot, TO'XTA.
**◻ HISOBOT:** _(agent to'ldiradi)_

---

### Faza Q12 — Offboarding: access-JWT deny-list
**Ustuvorlik:** P2 · **Bog'liqlik:** yo'q · **Manba:** Faza 23 hisoboti DEFER-1
**Muammo:** offboarding refresh-tokenlarni revoke qiladi, lekin amaldagi 15-daqiqalik access-JWT
muddati tugagunча tirik — bo'shatilgan xodim 15 daqiqa ishlashda davom etadi.
**Yechim:** yengil deny-list: `revokeAllForEmployee` chaqirilganda `employeeId → revokedAt` yozuvi
(DB yoki in-process kesh + DB-fallback; API `instances:1` — Faza 26 `TtlCache` naqshi yaraydi);
`jwt-auth.guard`da token `iat < revokedAt` bo'lsa 401. TTLni qisqartirish YECHIM EMAS (UX ta'siri) —
faqat deny-list. Har so'rovda DB'ga bormaslik uchun qisqa-TTL kesh.
**Fayllar:** Modify `auth/token.service.ts`, `auth/jwt-auth.guard.ts`,
`hr/hr-employee/offboarding.service.ts`; ehtimol `schema.prisma` (+ migration). (+ testlar).
**Testlar (TDD):** (1) offboarding'dan keyin eski access-token 401. (2) boshqa xodim token'i ishlayveradi.
(3) kesh TTL ichida DB bir marta so'raladi.
**Gate:** standart API-gate (+ migrate kerak bo'lsa) + `vitest run` auth, hr.
**▶ SESSIYA-BOSHI PROMPT:**
> `docs/REJA-QOLDIQ-2026-08.md` — **Faza Q12**. O'ZGARMAS QOIDALAR. Faza 23 DEFER'ini o'qi. Access-JWT
> deny-list (iat < revokedAt) + guard + kesh. TDD: 3 stsenariy. Gate. Hisobot, TO'XTA.
**◻ HISOBOT:** _(agent to'ldiradi)_

---

### Faza Q13 — FE media: query-token'dan signed-URL/cookie'ga
**Ustuvorlik:** P2 · **Bog'liqlik:** yo'q · **Manba:** Faza 22 hisoboti DEFER-1 (🔴)
**Muammo:** access-token 5 allowlist marshrutida (`/images/:id/raw`, `/hr/employees/:id/image/raw`,
`/attachments/:id/raw`, `/purchase-orders/list-report`, `/notifications/stream`) hamon URL query'da —
nginx access-log/brauzer-tarix sizishi.
**Yechim:** media 4 marshrut uchun **qisqa muddatli signed-URL** (alohida audience/TTL'li token yoki
HMAC imzo) yoki cookie-auth media-path; SSE (`/notifications/stream`) query-token'da qoladi
(EventSource header yubora olmaydi). FE'da `image-url.ts`/`attachments-section.tsx`/
`purchase-orders/page.tsx` yangi sxemaga; `extract-token.ts` allowlist'i faqat SSE'gacha qisqaradi.
**Fayllar:** Modify `auth/extract-token.ts` (+ yangi signed-URL util/endpoint), (FE)
`apps/web/src/lib/image-url.ts`, `components/.../attachments-section.tsx`,
`app/(app)/purchase-orders/page.tsx`. (+ testlar).
**Testlar (TDD):** (1) media marshruti access-token query bilan endi RAD (401). (2) signed-URL muddati
ichida ochiladi, tugagach 401. (3) SSE yo'li regressiz.
**Gate:** standart API-gate + web-gate + `vitest run` auth; web tegishli testlar.
**▶ SESSIYA-BOSHI PROMPT:**
> `docs/REJA-QOLDIQ-2026-08.md` — **Faza Q13**. O'ZGARMAS QOIDALAR. Faza 22 hisobotini o'qi (5 marshrut
> ro'yxati u yerda). Media signed-URL/cookie-path, allowlist faqat SSE. TDD: 3 stsenariy. Gate (API+web).
> Hisobot, TO'XTA.
**◻ HISOBOT:** _(agent to'ldiradi)_

---

### Faza Q14 — API-token scope UI (`/settings/api-tokens`)
**Ustuvorlik:** P2 · **Bog'liqlik:** yo'q · **Manba:** Faza 24 hisoboti DEFER-2/3/4
**Muammo:** scope-enforcement tayyor, lekin UI yo'q (controller kommenti va'da qilgan sahifa mavjud
emas) — token/scope faqat to'g'ridan-to'g'ri API orqali; mavjud tokenlar `scopes: []` = to'liq kirish;
scope slug'i ro'yxatga solishtirilmaydi (typo faqat 403'da ko'rinadi).
**Yechim:** (a) `/settings/api-tokens` sahifasi (admin-only): ro'yxat/yaratish/bekor qilish + scope
checkbox-matritsa (`_compat/slugs`dan). (b) `SLUGS` reyestrini scope-modulga eksport qilib server
tomonда slug-validatsiya (yaratishda 400). (c) ru/uz i18n.
**Fayllar:** Create `apps/web/src/app/(app)/settings/api-tokens/page.tsx`; Modify
`moysklad-compat/api-token.controller.ts`/`.service.ts`, slug-reyestr eksporti,
`messages/{ru,uz}.json`. (+ testlar).
**Testlar (TDD):** (1) noto'g'ri slug bilan yaratish → 400. (2) sahifa kontrakti (list/create/revoke)
unit darajada. (3) scope-enforcement regressiz.
**Gate:** standart API-gate + web-gate + `i18n:gate` + `vitest run` moysklad-compat.
**▶ SESSIYA-BOSHI PROMPT:**
> `docs/REJA-QOLDIQ-2026-08.md` — **Faza Q14**. O'ZGARMAS QOIDALAR. Faza 24 hisoboti DEFER'larini o'qi.
> Scope UI + slug-validatsiya + i18n. TDD: 3 stsenariy. Gate (API+web+i18n). Hisobot, TO'XTA.
**◻ HISOBOT:** _(agent to'ldiradi)_

---

# P3/P4 — TEXNIK QARZ / FRONTEND

---

### Faza Q15 — Contracts 2-to'lqin: ListResponse codemod + keyingi endpointlar
**Ustuvorlik:** P3 · **Bog'liqlik:** yo'q · **Manba:** Faza 33 hisoboti DEFER-2/3
**Muammo:** `ListResponse` 92 fayldan 91 tasida hali lokal; yirik endpointlar (`GET /demands` —
audit ko'rsatgan `DemandRow`, `/customer-orders`, `/counterparties`, …) kontraktsiz.
**Yechim:** (a) deterministik codemod: lokal `ListResponse`/`ListEnvelope` e'lonlarini
`@moysklad/contracts` importiga almashtirish. **Nuance (hisobotdan):** umumiy tipda `total?: number`
— `data.total`ni to'g'ridan-to'g'ri ishlatadigan sahifalarga `?? 0` kerak, codemod buni hisobga olsin
(fail-closed: anchor topilmasa fayl tegilmaydi, exit 1). (b) 3-5 endpoint kontrakt+provenance
(`GET /demands`dan boshla — provenance reyestri naqshi Faza 33'da tayyor); qolganini hisobotda ro'yxatla.
**Fayllar:** Modify `packages/contracts/*`, codemod tekkan sahifalar, `apps/api` konformans-test. 
**Testlar:** typecheck (asosiy gate); har yangi endpoint uchun server↔kontrakt konformans testi;
web qo'riqchisi (`ADOPTERS`) yangilanadi.
**Gate:** `@moysklad/contracts` + `@moysklad/api` + `@moysklad/web` typecheck + `pnpm lint:product` +
web vitest.
**▶ SESSIYA-BOSHI PROMPT:**
> `docs/REJA-QOLDIQ-2026-08.md` — **Faza Q15**. O'ZGARMAS QOIDALAR. Faza 33 hisobotini o'qi (provenance
> naqshi + `total?` nuance). ListResponse codemod (fail-closed) + 3-5 endpoint. Gate. Hisobot (qolgan
> ro'yxat), TO'XTA.
**◻ HISOBOT:** _(agent to'ldiradi)_

---

### Faza Q16 — Hisobot ko'rinuvchanlik paketi: truncated + unconverted + recentDocs deleted_at
**Ustuvorlik:** P3 · **Bog'liqlik:** yo'q · **Manba:** Faza 27a DEFER-1, Faza 17 DEFER-2/3, Faza 26 DEFER-2
**Muammo:** (a) `truncated` bayrog'i FE'da ko'rsatilmaydi (`/reports/stock-balance`,
`/reports/counterparty-balance`). (b) `unconvertedByCurrency` API'da bor, hech bir hisobot sahifasi
chizmaydi; dashboard vidjetlari (overdue, org-balans, money-chart) maydonga ega emas — kursi yo'q
valyuta 0 bo'lib jim ko'rinadi. (c) `recentDocs` `deleted_at`ni filtrlamaydi — o'chirilgan hujjat
«Недавние документы»da chiqadi (BE, kichik).
**Yechim:** (a) ikkala hisobot sahifasiga truncated-banner (umumiy komponent + ru/uz kalitlar).
(b) umumiy «konvertatsiya qilinmagan» banner-komponenti; avval eng muhim sahifalarga (P&L, cash-flow,
/money) ula; dashboard javob-shakliga maydon qo'shib uchala vidjetda ko'rsat. (c) recentDocs 12 legiga
`deleted_at IS NULL`.
**Fayllar:** Modify (FE) hisobot sahifalari + yangi banner-komponent + `messages/{ru,uz}.json`;
(BE) `report/dashboard.service.ts`. (+ testlar).
**Testlar (TDD):** (1) truncated=true'da banner render. (2) unconverted qatorlar ko'rinadi. (3)
recentDocs SQL'ida 12× `deleted_at IS NULL` (Faza 26 shakl-qulfi uslubi).
**Gate:** standart API-gate + web-gate + `i18n:gate` + `vitest run` report; web tegishli testlar.
**▶ SESSIYA-BOSHI PROMPT:**
> `docs/REJA-QOLDIQ-2026-08.md` — **Faza Q16**. O'ZGARMAS QOIDALAR. Faza 27a/17/26 DEFER'larini o'qi.
> Truncated-banner + unconverted-banner + recentDocs deleted_at. TDD: 3 stsenariy. Gate (API+web+i18n).
> Hisobot, TO'XTA.
**◻ HISOBOT:** _(agent to'ldiradi)_

---

### Faza Q17 — Decimal-primitivlar uyi + qoldiq float'lar
**Ustuvorlik:** P4 · **Bog'liqlik:** yo'q · **Manba:** Faza 34 hisoboti DEFER-4/5
**Muammo:** (a) `demand/fifo-consumer.ts` nomi yolg'on — FIFO 18a'da bekor qilingan, fayl umumiy
decimal-primitivlar uyi (11 import). (b) `analitika/analysis.service.ts:294` va
`count.service.ts:301`da `Number(s.qty)` qoldi (hisobot-agregatlari).
**Yechim:** (a) `shared/decimal.ts`ga ko'chirish — deterministik codemod (11 import), eski fayl
re-eksport bilan bir faza deprecate yoki to'liq ko'chirish (agent tanlaydi, hisobotda asoslaydi).
(b) ikki agregatni BigInt-mikro yo'lga o'tkazish (`parseDecimalScaled` bilan).
**Fayllar:** Create `apps/api/src/modules/shared/decimal.ts`; Modify 11 import fayli,
`analitika/analysis.service.ts`, `analitika/count.service.ts`. (+ testlar).
**Testlar (TDD):** (1) kasr-qty agregatlarda float-drift yo'q (0.1+0.2 klassi). (2) codemod'dan keyin
barcha import'lar typecheck; mavjud testlar regressiz.
**Gate:** standart API-gate + `vitest run` demand, stock, analitika (+ 11 import moduli regress).
**▶ SESSIYA-BOSHI PROMPT:**
> `docs/REJA-QOLDIQ-2026-08.md` — **Faza Q17**. O'ZGARMAS QOIDALAR. Faza 34 DEFER-4/5'ni o'qi.
> fifo-consumer → shared/decimal codemod + analitika float'lari. TDD + regress. Gate. Hisobot, TO'XTA.
**◻ HISOBOT:** _(agent to'ldiradi)_

---

### Faza Q18 — Barcode normalizatsiya/unique (DB-04 haqiqiy yechimi) — ⚠️ ops-gated
**Ustuvorlik:** P4 · **Bog'liqlik:** OPS-4/5 dan keyin (prod o'lchov) · **Manba:** Faza 25 hisoboti DEFER-1
**Muammo:** barcode GIN indeksi POS `findFirst` yo'lida planner tomonidan tanlanmaydi; haqiqiy yechim —
barcode unique/normalizatsiya (dublikatlarni merge qiluvchi data-migration) yoki so'rov shaklini
o'zgartirish.
**Yechim:** (1) dublikatlarni o'lchash skripti (DRY, `APPLY` bayroqli — o'zi yugurtirmaydi). (2)
normalizatsiya: alohida `product_barcodes(barcode, product_id)` jadval yoki normalized ustun +
unique; POS lookup shu jadvaldan (index-friendly teng-qidiruv). (3) Merge-siyosatini hisobotda taklif
qilib foydalanuvchi tasdig'ini kut — **prod ma'lumotiga tegadigan qismi ops-sessiyada**.
**Fayllar:** `packages/db/prisma/schema.prisma` (+ migration), `product/*` lookup yo'llari, o'lchash
skripti `apps/api/src/scripts/`. (+ testlar).
**Testlar (TDD):** (1) barcode lookup yangi yo'ldan (EXPLAIN bilan index-scan lokalda). (2) dublikat
holatida xulq aniq (birinchi/xato — tanlangan siyosat). (3) mavjud POS testlari regressiz.
**Gate:** standart API-gate + migrate + `vitest run` product, retail-sale.
**▶ SESSIYA-BOSHI PROMPT:**
> `docs/REJA-QOLDIQ-2026-08.md` — **Faza Q18** (OPS-4/5 o'lchovidan keyin). O'ZGARMAS QOIDALAR.
> Faza 25 DEFER-1'ni o'qi. Barcode normalizatsiya + lookup + o'lchash skripti (APPLY'ni yugurtirMA).
> TDD: 3 stsenariy. Gate + migrate. Hisobot, TO'XTA.
**◻ HISOBOT:** _(agent to'ldiradi)_

---

## Qamralmagan (backlog — alohida so'ralganda faza qilinadi)

Dizayn-og'ir yoki past-ustuvor qoldiqlar (manba-faza qavsda):

- **Ikki parallel RBAC birlashuvi** — `Role/RolePermission` ∥ `HrEmployeePermission`+`hrRoles`
  (F23; HR-10 ildizi) — arxitektura qarori kerak.
- **moysklad-compat qatlami servis-qoidalarni chetlab o'tadi** — `model:'supply'` to'g'ridan-to'g'ri
  Prisma yozuvi (F14 DEFER) — butun compat qatlami auditi.
- **Outbox provayder-idempotentligi** — MTProto `random_id` adapter-shartnoma o'zgarishi (F28).
- **Gateway PaymentIn avto-post + refund hujjati** (F19 DEFER-2/3).
- **HTTP chegarasida qty/reservedQty string-decimal** — Zod + FE birga (F34 DEFER-2/3).
- **Ko'p valyutali akt-sverka** (F10 DEFER) · **M-13 ikki konvertor yaxlitlash farqi** (F16/17) ·
  **aralash valyutali POS-FIFO allokatsiyasi** (F4 DEFER — `allocateFifo` turli valyutali qarzlarni
  bitta rejaga qo'shadi).
- **PRODUCT_SEARCH_CAP JOIN yechimi** va stock-balance butun-scope jami — egasi qarori (F27a).
- **POS mayda:** numpad `.` tugmasi + `QUICK_AMOUNTS` prop (F30) · `addCashPayment`ga `batchId`
  (F11) · POS `input.currency` konvertatsiyasi (F11) · dinamik i18n kalitlar qamrovi (F32).
- **FK-indeks umumiy auditi** (F25 DEFER-5) · **kesh-invalidatsiya** (F26 DEFER-3).
- **Konformans tip-tekshiruvi** (kalit-mavjudlikdan tashqari, Prisma tiplari bilan) (F33 DEFER-4).
- **`hr/hr-shared/crypto.util.test.ts` flake** (~1/256 «tampered ciphertext» no-op) (F23).
- **Sxema-DB-\* topilmalari** adversarial-verify qilinmagan — faza qilishdan oldin ground-truth shart.

---

# 📋 HISOBOT JURNALI

> Har agent o'z fazasini tugatgach shu yerga yozadi. Format:
> `## Faza QN — <sana> — <status>` keyin: **Fayllar**, **O'zgarish**, **Testlar (RED→GREEN)**,
> **Gate**, **Qolgan qarz/DEFER**. Yozish faqat qo'shimcha (append) tarzida — mavjud yozuvlarga tegilmaydi.

---

## Faza Q1 — 2026-08-09 — **Phase-1: strukturaviy + unit-tasdiqlangan, browser-smoke YO'Q**
### Smena naqdi paketi: expected-cash · z-report · close-race · picking-block · creditAgg · agentId

**Da'volarni tasdiqlash (kodda, o'z ko'zim bilan — 7/7 TASDIQLANDI, hech biri eskirmagan)**

| # | Da'vo | Manba | Holat | Dalil |
|---|---|---|---|---|
| 1 | `creditAgg` `method: 'debt'` ≠ tender `'DEBT'` | Faza 7 hisoboti | ✅ | `cashier-session.service.ts:617` `method: 'debt'` ∥ `retail-tenders.ts:34` `debt: 'DEBT'` |
| 2 | `post()` `parsed.agentId` chek qatorini yangilamaydi | Faza 8 hisoboti | ✅ | `retail-sale.service.ts:671` `debtAgentId = parsed.agentId ?? sale.agentId`, `:714` yozuv sharti `&& !sale.agentId` |
| 3 | `collectCashInputs` qaytarish naqdini ikki tomondan sanaydi | asl reja F15 `SALES-02` | ✅ | `salesCashMinor` so'rovida `refundedFromId` filtri YO'Q; oyna cheklar `posted` ⇒ sotuvga (+), qaytarishga (−) bo'lib bir-birini yeydi — ya'ni qaytarish kutilgan naqdga **umuman** ta'sir qilmaydi |
| 4 | Qaytim (`changeMinor`) kutilgan naqddan ayirilmaydi | asl reja F15 `SALES-02` | ✅ | `cashAmountMinor` = BERILGAN naqd; pul-daftariga esa `cashToDrawer = cashAmount − change` yoziladi (`retail-sale.service.ts:843`) ⇒ ikki manba ajralib turgan |
| 5 | Legacy z-report to'liq refundni 2× ayiradi | asl reja F15 `SALES-06` | ✅ | `retail-sale.service.ts:1390` `salesAgg` `state: 'posted'` — Faza 7 dan keyin to'liq qaytarilgan ASL chek `refunded` bo'lib sotuvlardan tushib qoladi, oyna cheki esa `returnsAgg` da baribir ayiriladi |
| 6 | `close()` faqat `draft` ni bloklaydi | asl reja F15 `SALES-08` | ✅ | `:217` `state: 'draft'`; FSM'da `picking`/`ready` mavjud (`retail-sale-fsm.ts:37`) |
| 7 | `post()` smena holatini tx'dan TASHQARIDA o'qiydi | asl reja F15 `SALES-07` | ✅ | `:615` tekshiruv tx'dan tashqarida; tx ichida `cashierSession.update` **shartsiz** (`:899`) |

**O'zgargan/yaratilgan fayllar**

| Fayl | O'zgarish |
|---|---|
| `apps/api/src/modules/cashier-session/cashier-session.service.ts` | `collectCashInputs` endi birinchi argument sifatida `db: Prisma.TransactionClient` oladi (tx ichidan chaqirsa bo'ladi); `salesCashMinor` so'roviga `refundedFromId: null` + `_sum.changeMinor` qo'shildi, natija `Σcash − Σchange`; `close()` **butunlay Serializable tx ichida** (pending-tekshiruv → agregat → flip); pending ro'yxati `allowedFrom('cancel')` dan (`draft/picking/ready`); `creditAgg` endi `TENDER.debt` konstantasi + `state: {in:['posted','refunded']}` |
| `apps/api/src/modules/retail-sale/retail-sale.service.ts` | `post()`: chek CAS'idan KEYIN, pul/ombor kaskadidan OLDIN **smena claim'i** — `updateMany({where:{id,accountId,state:'open'}, data:{salesCount:+1, salesSumMinor:+total}})` → `count===0` ⇒ 409 (eski shartsiz `cashierSession.update` O'CHIRILDI, agregat claim bilan BIRLASHTIRILDI: qulf va hisob ajralmaydi); `parsed.agentId` chekdagi BOSHQA mijoz bilan zid bo'lsa **400**; legacy `zReport` `salesAgg` `state: {in:['posted','refunded']}` |
| `apps/api/src/modules/cashier-session/shift-cash-faza-q1.test.ts` | **Yangi** — 11 test. Prisma dublyori `where` ni haqiqiy qatorlar ustida BAHOLAYDI (`in` / `not: null` / `null` + ichma-ich `sale: {...}` relyatsion filtri), aks holda `_sum` qaytaruvchi sof mock bug'ni ko'rmasdi |
| `apps/api/src/modules/retail-sale/retail-sale-post-guards.test.ts` | **Yangi** — 6 test. Postgres semantikasi halol modellangan: `findFirst` DETACHED (eskirgan) nusxa, `updateMany` esa JONLI qator ustida shartni atomik baholaydi — aynan poyga oynasi |
| `retail-sale-{freeze,fsm,tenders-wiring,.cas}.test.ts` | **Fixture qarzi** (mahsulot bug'i emas): `cashierSession.update` stublari `updateMany` ga ko'chirildi; `fsm`/`.cas` dagi 3 tasdiq `updateMany` ga, `fsm` ga qo'shimcha `where.state === 'open'` tasdig'i qo'shildi — claim SHARTLI ekani qulflandi |

**QAROR — `agentId` zidligida 400, ustidan yozish EMAS** *(reja ikki variantni ochiq qoldirgan edi)*
Chek — huquqiy hujjat; to'lov oynasi uning kontragentini **jimgina** qayta yozib yuborishi Faza 7/8 bo'ylab
quvilgan «jim divergensiya» klassining o'zi bo'lardi (ma'lumot yo'qoladi, hech bir gate ko'rmaydi). 400 esa
divergensiyani **strukturaviy imkonsiz** qiladi va kassirga aniq yo'l ko'rsatadi («chekni ochib mijozni
to'g'rilang»). Zid BO'LMAGAN holat (chek bo'sh) — mavjud xulq saqlandi: mijoz chekka YOZILADI, ya'ni
SALES-04 shartnomasi buzilmaydi. `/sotuv` bu yo'lga TUSHMAYDI: POS chekni mijozsiz yaratadi va kontragentni
faqat post payloadida yuboradi (Faza 7/8 hisobotlarida o'lchangan) ⇒ regressiya xavfi yo'q.

**Testlar (TDD tartibi kuzatildi — RED JONLI o'lchangan)**
- **RED-1** `shift-cash-faza-q1.test.ts` (fix'dan OLDIN): **7 yiqildi / 11**, sabablari aynan bug:
  - qaytim: `expected 250000n to be 200000n` (Σchange = 50 000 ayirilmagan)
  - qaytarish oyna cheki: `expected 200000n to be 170000n` (+1/−1 bo'lib yo'qolgan)
  - to'liq-refund smenasi: `expected 50000n to be 0n`
  - `close()` `picking` va `ready`: `promise resolved … instead of rejecting` (2 test)
  - Z-hisobot «qarzga sotildi»: `expected '0' to be '90000'`
  - legacy z-report: `salesSumMinor expected '0' to be '100000'` (netSum `−100000` chiqardi)
- **RED-2** `retail-sale-post-guards.test.ts` (fix'dan OLDIN): **2 yiqildi / 6** — yopilgan smenaga post
  `promise resolved … instead of rejecting`; `agentId` zidligi ham `resolved … instead of rejecting`.
- **GREEN:** ikkala yangi fayl **17/17**; `cashier-session` + `retail-sale` modullari **399/399**.
- **Regress:** yuqoridagi 4 fixture fayli (23 yiqilish) — barchasi `tx.cashierSession.updateMany is not a
  function` yoki `variance-wiring` drift-lock'i (`discrepancyMinor: discrepancy`) sababli edi. Mahsulot
  kodiga himoyaviy `?.` **qo'yilmadi** (u haqiqiy nosozlikni yashirardi): stublar real shaklga moslandi va
  `close()` ichidagi o'zgaruvchi nomlari drift-lock kutgan holida saqlandi.

**Gate (to'liq, JONLI o'lchangan)**
- `pnpm --filter @moysklad/api typecheck` → **0 xato**
- `pnpm lint:product` → **0 error** (745 warning — siyosat bo'yicha ruxsat)
- `pnpm --filter @moysklad/api exec vitest run src/modules/cashier-session src/modules/retail-sale` →
  **27 fayl / 399 test yashil, 0 yiqilgan**
- Kengroq regress `src/modules/{shared,debt,money,counterparty-balance}` → **47 fayl / 788 test yashil**
- `pnpm --filter @moysklad/api exec vitest run` (BUTUN suite) →
  **429 fayl yashil + 1 skip · 5588 test yashil + 2 skip · 0 yiqilgan**
- `pnpm i18n:gate` yugurtirilMADI — UI matni tegilmagan (faqat API; web'ga umuman tegilmadi).
- Migratsiya YO'Q — sxema tegilmadi.

**Qolgan qarz / DEFER**
- **Browser-smoke YO'Q.** Kassada qaytimli smenani yopish, `picking` chek bilan yopishga urinish (400
  matni), yopilayotgan smenaga to'lov (409 matni), Z-hisobotdagi «Продано в долг» raqami — hammasi
  Phase-2 QA (retail/POS cohort) ga qoladi.
- **`close()` picking/ready cheklarni «ko'chirmaydi», BLOKLAYDI.** Reja «blok yoki keyingi smenaga
  ko'chirish» degan edi; ko'chirish `sessionId` ni almashtirishni talab qiladi (chek yaratilgan
  smenaning ombori/kassasi boshqa bo'lishi mumkin) — bu hujjat-egaligi qarori, ataylab QILINMADI.
- **`post()` non-debt sotuvda `parsed.agentId` ni chekka YOZMAYDI** (mavjud shart `debtAmount > 0n`).
  Ya'ni mijoz tanlangan NAQD chek `agentId: null` bo'lib qoladi va unga loyalty ball yozilmaydi
  (`accrueLoyalty` `posted.agentId` ni o'qiydi). Bu fazada ATAYLAB tegilmadi — u loyalty xulqini
  o'zgartiradi (yangi ball oqimi), Faza Q1 doirasidan tashqarida. **Yangi qarz sifatida qayd etildi.**
- **`close()` 400 matni ingliz tilida** (`Session has N unresolved sale(s) (draft/picking/ready)…`) —
  fayldagi mavjud konventsiya saqlandi; POS ekranida server matni ko'rinadi. i18n'lash — alohida ish.
- **`retail-sale.controller.ts` tegilmadi** — reja uni fayllar ro'yxatiga kiritgan edi, lekin barcha
  to'rt qo'riqchi servis qatlamida; kontrollerda o'zgarish talab qiladigan narsa topilmadi.
- **`retail_sales.agent_id` backfill** (legacy qarz cheklari) hamon OPS-qadam — bu faza yangi
  divergensiya YARATILISHINI to'xtatadi, MAVJUD tarixiy qatorlarni tuzatmaydi.
- **Serializable tx `close()` da retry YO'Q** — Postgres `40001` (serialization failure) yuqori yuklamada
  chiqishi mumkin; kassir «qayta urinib ko'ring» xatosini oladi. Repo'dagi boshqa Serializable
  chaqiruvlar ham retry'siz (bir xil konventsiya) — o'zgartirilmadi.

**Commit:** `fix(sales): faza q1 — smena naqdi expected-cash + z-report + close-race (SALES-02/06/07/08)`

---

## Faza Q2 — 2026-08-09 — **Phase-1: strukturaviy + unit-tasdiqlangan, browser-smoke YO'Q**
### WorkOrder weighted-average cost (`PP-05`, asl reja 18b)

**Da'voni tasdiqlash (kodda, o'z ko'zim bilan — TASDIQLANDI, satr raqamlari ham siljimagan)**

Faza 18a hisoboti `work-order.service.ts:436,469,553,568` deb yozgan edi. `grep -n costDeltaMinor`
**aynan shu 4 raqamni** qaytardi — hisobot yozilganidan beri fayl tegilmagan:

| Satr | Joy | Nima edi |
|---|---|---|
| `:436` | `applyCompleteCascade` — komponent chiqimi | `costDeltaMinor: null` |
| `:469` | `applyCompleteCascade` — chiqarilgan mahsulot kirimi | `costDeltaMinor: null` |
| `:553` | `applyCancelCascade` — chiqarilgan mahsulot chiqimi | `costDeltaMinor: null` |
| `:568` | `applyCancelCascade` — komponent qaytishi | `costDeltaMinor: null` |

Ya'ni ТЗ **faqat MIQDOR** o'qi bo'yicha ishlagan: komponentlar ombordan chiqib ketardi, lekin
ularning **qiymati** `Stock.costBalanceMinor` da qolardi ⇒ qolgan komponentlarning o'rtacha narxi
har ТЗ dan keyin **shishardi**; tayyor mahsulot esa **0-bazis** bilan kirardi ⇒ uni keyin sotgan
Demand/POS **100% marja** ko'rsatardi. Bu 18a POS/Demand uchun yopgan `STK-02` sinfining ayni o'zi.

**Ikkinchi (rejada ko'rsatilgan) topilma ham tasdiqlandi:** `applyCancelCascade` teskarilashni
**joriy BOM** dan qayta hisoblardi (`bom.components` × `runs`) — ТЗ tugagandan keyin BOM tahrirlansa
(komponent qo'shilsa/miqdori o'zgarsa) bekor qilish **miqdor o'qida ham** zero-sum bo'lmasdi.

### Qaror: muzlatish uchun YANGI USTUN KERAK EMAS — jurnal o'zi muzlatilgan manba

Reja «pozitsiyaga muzlatiladi» degan, lekin **`WorkOrder` da pozitsiya jadvali YO'Q** (BOM
komponentlari umumiy katalog obyektlari — ularga muzlatish yozib bo'lmaydi). Ikki variant ko'rildi:

1. `WorkOrder` ga `Json?` snapshot ustuni (Processing `materialsSnapshot` naqshi) — **migratsiya kerak**;
2. **tanlandi:** teskarilashda ТЗ ning **o'z `StockOperation` qatorlari**ni o'qib aynan negatsiya qilish
   — 18a dagi **`buildRefundCostBasis`** (POS qaytimi) presedenti. `StockOperation` — append-only
   jurnal, ya'ni **allaqachon muzlatilgan yozuv**; snapshot ustuni o'sha ma'lumotni ikkinchi marta
   saqlagan bo'lardi.

⇒ **Migratsiya QILINMADI** (`per-unit-snapshot-blocks-exact-cost-fix` muammosi bu yerda yuzaga
kelmaydi: jurnal per-birlik emas, **aniq qiymat** saqlaydi). Bonus: bu yechim **miqdor o'qini ham**
tuzatadi — teskarilash BOM'ni umuman o'qimaydi, shuning uchun BOM tahriri natijaga ta'sir qila olmaydi.

### Fayllar

| Fayl | O'zgarish |
|---|---|
| `apps/api/src/modules/work-order/work-order-cost.ts` | **YANGI** — `computeConsumptionCost()` (per-store o'rtacha + `buyPrice` fallback + NULL≠0), `buildReversalDeltas()` (jurnaldan aniq negatsiya), `negateDecimalString()` (float'siz ishora agdarish) |
| `apps/api/src/modules/work-order/work-order-cost.test.ts` | **YANGI** — 12 sof-arifmetik test |
| `apps/api/src/modules/work-order/work-order.service.ts` | `applyCompleteCascade` weighted-avg'ga o'tkazildi (`product.findMany` buyPrice fallback bilan); `applyCancelCascade` jurnal-manbali teskarilashga o'tkazildi (+ legacy fallback); sinf doc-kommentiga COST bandi |
| `apps/api/src/modules/work-order/work-order.service.test.ts` | **Edit** (Write EMAS) — `makePrisma` ga `stockOperation.findMany` + `product.findMany` mock'lari, `makeStock(balances)`; **9 yangi servis-testi** |

### O'zgarish mohiyati

**`applyCompleteCascade` (post).** `lockBalances` + `assertAvailable` dan keyin — **aynan o'sha
qulflangan balanslardan** (miqdor tekshirilgan qator bilan qiymat olingan qator hech qachon
ajralmasin) `perUnit = costBalanceMinor ÷ qty`. Qiymatsiz/manfiy ombor ⇒ `product.buyPrice`
(Loss presedenti: chiqim baribir qiymat olib chiqadi, 0 emas). Komponent deltasi
`costDeltaMinor = −scaleMinorByQty(perUnit, qty)`. Chiqarilgan mahsulot **butun sarflangan
qiymatni** oladi (Processing dvigatelidagi `distributeOutputCost` ning N=1 holati) ⇒ ТЗ ning
Σ `costDelta` = **aynan 0**: ish-buyurtma qiymat yaratmaydi ham, yo'q qilmaydi ham — uni
komponentlardan tayyor mahsulotga **ko'chiradi**.

**NULL≠0 shartnomasi** (`retail-cost-freeze-null-contract`). `buyPrice` xaritasiga faqat
**NOT NULL** qiymatlar solinadi. Ombor bazisi ham, `buyPrice` ham yo'q ⇒ `perUnit = null` ⇒
delta `null` (balansga TEGILMAYDI), `0n` EMAS. Farq muhim: `0n` «material bepul edi» degan
da'vo bo'lardi va keyingi sotuvda 100% marja yolg'oniga aylanardi. `buyPrice = 0n` esa
**ma'lum nol** — u `hasCost = true` beradi. Bironta komponentda bazis bo'lmasa chiqarilgan
mahsulot ham `null` oladi (bo'sh BOM holati ham shunday ⇒ **nol-regressiya**).

**`applyCancelCascade` (unpost).** `stockOperation.findMany({ docType:'workorder', docId, reason:'post' })`
→ har qator **aniq negatsiya** (miqdor `negateDecimalString` bilan, qiymat `−costDeltaMinor`;
`null` ⇒ `null`). Qatorlar **birlashtirilmaydi** — BOM bir mahsulotni ikki qatorda ko'rsatgan bo'lsa
ikkita mos qator qaytadi. Yetarlilik tekshiruvi faqat **chiqim** tomonida (teskarilashda miqdori
manfiy bo'lgan qatorlar), qator o'z `storeId` si bo'yicha guruhlanib qulflanadi. `reason:'post'`
filtri o'z `unpost` qatorlarini qayta o'qishdan saqlaydi; FSM `completed` ni bir marta beradi
(`cancelled` — terminal), shuning uchun post-to'plami yagona.

**Legacy fallback.** Jurnalda post-qator topilmasa — eski BOM-qayta-hisoblash yo'li **o'zgarishsiz**
qoladi (miqdor, `cost: null`). Fix'dan OLDIN tugatilgan ТЗ larda esa qatorlar bor, ammo
`costDeltaMinor = NULL` ⇒ teskarilash ham `NULL` beradi = **bugungi xulqning aynan o'zi**
(qiymat hech qachon to'qib chiqarilmaydi).

### Testlar — RED **jonli o'lchandi**, keyin GREEN

**RED** (fix'dan oldin, `vitest run src/modules/work-order`):
`Test Files 2 failed | 1 passed (3)` · `Tests 5 failed | 43 passed (48)`

- `work-order-cost.test.ts` — **butun fayl yuklanmadi** (modul hali yo'q) ⇒ 12 test hisobga ham kirmadi;
- servis-testlarida **5 qizil** (hammasi «Faza Q2» describe'idan):
  1. `complete: components leave at the per-store weighted average` — kutilgan `-50000n`, olingan `null`;
  2. `complete: the produced good absorbs the whole consumed value` — kutilgan `65000n`, olingan `null`;
  3. `complete: valueless store falls back to product buyPrice` — kutilgan `-7000n`, olingan `null`;
  4. `cancel: reverses the FROZEN ledger value bit-for-bit (zero-sum)` — kutilgan `50000n`, olingan `null`;
  5. `cancel: BOM edited AFTER completion cannot corrupt the reversal` — **kutilgan 2 delta, olingan 3**
     (joriy BOM'dagi yangi `salt` komponenti teskarilashga sizib kirgan — miqdor-o'qi bug'i jonli ko'rindi).

Qolgan 4 yangi test ataylab **regressiya-qulfi** (fix'dan oldin ham yashil): legacy NULL teskarilash,
NULL≠0 post, chiqim yetarlilik tekshiruvi, jurnal-bo'sh BOM-fallback.

**GREEN:** `work-order` **60/60** (48 → 60: +12 sof arifmetik).

Reja stsenariylari: (1) komponent store'ida per-unit o'rtacha × qty kamayadi, output store'iga mos
qiymat kiradi ✓ (2) complete→cancel zero-sum, BOM keyin o'zgargan bo'lsa ham ✓ (3) bo'sh/qiymatsiz
stock'da `buyPrice` fallback + NULL≠0 buzilmaydi ✓.

### Gate (jonli o'lchangan)

- `pnpm --filter @moysklad/api typecheck` → **0 xato**
- `pnpm lint:product` → **0 error** (747 warning — siyosat bo'yicha ruxsat)
- `vitest run work-order + stock + demand + loss + processing` → **415/415** (29 fayl)
- **To'liq API suite** → **5609 passed | 2 skipped (431 fayl, 430 passed | 1 skipped)** — regress YO'Q
- `i18n:gate` **kerak emas** (UI-matn tegilmadi) · web **tegilmadi**
- **Migratsiya YO'Q** ⇒ sxema-drift/`prisma generate` qadami qo'llanilmadi (lokal DB tegilmagan).

### Qolgan qarz / DEFER

- **🔴 Browser-smoke YO'Q.** ТЗ tugatish→bekor qilish qiymat-simmetriyasi va tayyor mahsulot
  tannarxining `/stock` da ko'rinishi Phase-2 QA cohort'ida tekshirilishi kerak.
- **Tarixiy ma'lumot tuzatilmaydi.** Fix'dan OLDIN tugatilgan ТЗ lar `Stock.costBalanceMinor` ni
  allaqachon buzgan (komponent qiymati qolib ketgan, tayyor mahsulot 0-bazis). Bu faza yangi
  divergensiya YARATILISHINI to'xtatadi; mavjud qoldiqni tuzatish — **OPS-qadam** (Inventory/Enter
  bilan qayta-baholash yoki `CounterpartyAdjustment` uslubidagi korrektirovka). Hajm **o'lchanmagan**.
- **`runs` hamon float** (`produced / outputQty`, `Number(String(c.qty)) * runs`) — miqdor satri
  `(2 * 5).toString()` kabi hisoblanadi, ya'ni kasrli BOM'da `0.30000000000000004` sinfidagi drift
  mumkin. **Tegilmadi** (mavjud xulq, alohida sinf — `STK-08` / Faza Q4 oxirgi-birlik ishiga yaqin).
  Qiymat o'qi bundan himoyalangan: teskarilash o'sha **satrni** jurnaldan aynan qaytaradi.
- **`delete()` tugatilgan ТЗ ni ombor-teskarilashsiz soft-delete qiladi** — bekor qilinmagan
  `completed` ТЗ o'chirilsa uning stock kaskadi jurnalda qoladi. Mavjud xulq, Faza Q2 doirasidan
  tashqarida; **Faza Q3** (`delete()` yo'llari atomik claim) bilan bir sinfda — o'sha yerda ko'rilsin.
- **Chiqim tannarxi `WorkOrder` qatorida saqlanmaydi** — ТЗ detal sahifasi «Себестоимость» ni
  ko'rsatmaydi (jurnalni o'qish kerak). FE ishi, alohida.
- **Ko'p-chiqimli ТЗ yo'q** — BOM bitta `productId` beradi, shuning uchun `distributeOutputCost`
  kerak bo'lmadi. ТЗ ga qo'shimcha mahsulot/chiqindi qo'shilsa — o'sha helperni ulash kerak.

**Commit:** `fix(cogs): faza q2 — workorder weighted-average cost (PP-05)`

---

## Faza Q3 — 2026-08-09 — **Phase-1: strukturaviy + unit-tasdiqlangan, browser-smoke YO'Q**
### `delete()` yo'llari atomik claim: pul-oila 7 + loss 🔴 + work-order + applyPayment `deletedAt` + skaner qamrov-lock

**Da'volarni tasdiqlash (kodda, o'z ko'zim bilan — 5/5 TASDIQLANDI, hech biri eskirmagan)**

| # | Da'vo | Manba | Holat | Dalil (fix'dan OLDINGI kod) |
|---|---|---|---|---|
| a | 🔴 `loss.delete()` — `findById` check → **shartsiz** soft-delete | Faza 5 «Qolgan qarz» | ✅ | `loss.service.ts:517-528`: `const l = await this.findById(…)` → `if (l.applicable \|\| l.state !== 'draft')` → `loss.update({ where: { id, accountId }, data: { deletedAt } })`. 7 sibling (`supply`/`move`/`enter`/`sales-return`/`purchase-return`/`production`/`processing`) da o'sha yo'l `updateMany({ where: { …, state:'draft', applicable:false, deletedAt:null } })` + `res.count === 0` |
| b | Pul-oilaning 7 `delete()`/`softDelete()` — read-check-then-write | Faza 1 «Qolgan qarz» | ✅ | `payment-in:585`, `payment-out:584`, `cash-in:454`, `cash-out:396`, `invoice-out:854`, `invoice-in:846` — hammasi `findById` → `if (…) throw` → `update({ where: { id, accountId } })`. `counterparty-adjustment.softDelete:270` — `$transaction` bor, lekin claim yo'q va **teskarilash `row.applicable` SNAPSHOT'idan** hisoblanadi |
| c | Invoice-oila `applyPayment` `deletedAt` TOCTOU | Faza 3 «Qolgan qarz» | ✅ | 4 servisda ham `findFirst({ …, deletedAt: null, select: { id: true } })` → `update({ where: { id, accountId } })` — **yozuvda `deletedAt` sharti YO'Q**: `invoice-out:1139`, `invoice-in:1035`, `customer-order:2152`, `purchase-order:1331` |
| d | Skaner'da stock qamrov-lock yo'q | Faza 5 «Qolgan qarz» | ✅ | `transition-toctou-class.test.ts` — `MONEY_SERVICES` uchun nomlar-ro'yxati assert'i bor (`:364-376`), stock uchun **hech qanday** qamrov assert'i yo'q; `delete()` claim'i esa faqat 6 stock servisda pin qilingan, MONEY oilasida umuman pin qilinmagan |
| e | 🔴 `work-order.delete()` tugatilgan ТЗ ni teskarilashsiz o'chiradi | Faza Q2 agenti | ✅ | `work-order.service.ts:700-711`: faqat `in_progress` rad etiladi → `completed` ТЗ (BOM komponentlari yechilgan, chiqim omborga kirgan, **Faza Q2'dan beri QIYMAT bilan**) shartsiz soft-delete bo'ladi; uni teskarilay oladigan yagona hujjat (`completed → cancelled`) ham ro'yxatlardan yo'qoladi ⇒ arvoh qoldiq |

**Poyganing IKKINCHI yo'nalishi (o'z topilmam, rejada yo'q edi).** Faqat `delete()` ni qulflash yetarli EMAS:
`delete` avval commit bo'lsa, `post` claim'i (`WHERE state='draft'`) hamon mos kelardi — hujjat HAM posted,
HAM o'chirilgan bo'lib qolardi. Shuning uchun `transitionWithClaim` WHERE'iga **`deletedAt: null`** qo'shildi
(`transition()` ning `findById` pre-read'i allaqachon shu shartni talab qiladi ⇒ hech bir qonuniy yo'l
yopilmadi, faqat poyga oynasi) va `loss.post()` ning inline claim'iga ham. Test buni to'g'ridan-to'g'ri
o'lchaydi (`post ∥ delete` → aynan bittasi yutadi).

**O'zgargan/yaratilgan fayllar**

| Fayl | O'zgarish |
|---|---|
| `shared/transition-with-claim.ts` | claim WHERE'iga `deletedAt: null` (+ `StateClaimDelegate` tipi). 7 pul-servis + loss unpost/cancel shu primitiv orqali yuradi ⇒ bitta o'zgarish 23 o'tkazish nuqtasini yopdi |
| `loss/loss.service.ts` | `delete()` → sibling naqshi (`updateMany` `state:'draft', applicable:false, deletedAt:null` + `res.count === 0`); `post()` inline claim'iga `deletedAt: null`. Xato matni **o'zgarmadi** |
| `payment-in`, `payment-out`, `cash-in`, `cash-out`, `invoice-out`, `invoice-in` `.service.ts` | `delete()` → shartli `updateMany` claim. Har birining xato matni **o'zgarmadi**. Invoice-juftligida ilgari faqat `state !== 'draft'` tekshirilardi — `applicable: false` qo'shildi (post/unpost/cancel `state` bilan AYNI yozuvda flip qiladi ⇒ faqat kuchaytiradi) |
| `counterparty-adjustment/counterparty-adjustment.service.ts` | `softDelete()` tx'ining **BIRINCHI amali** — snapshot holatini da'vo qiluvchi claim (`state: row.state, applicable: row.applicable, deletedAt: null`), `claim.count === 0` ⇒ **409**; balans teskarilashi claim'dan KEYIN. `ConflictException` importi |
| `invoice-out`, `invoice-in`, `customer-order`, `purchase-order` `.service.ts` | `applyPayment`: increment `update` WHERE'iga `deletedAt: null` + `.catch(isRecordNotFound → NotFoundException)` (matn o'zgarmadi). `isRecordNotFound` importi (`shared/optimistic-lock.js` — mavjud primitiv) |
| `work-order/work-order.service.ts` | `delete()`: `completed` uchun alohida aniq xabar (avval bekor qiling) + atomik `updateMany({ state: { in: ['draft','cancelled'] }, deletedAt: null })` + `res.count === 0` |
| `shared/delete-claim-race.test.ts` | **Yangi** — 36 test: 7 servis (6 pul + loss) × 4 stsenariy + counterparty-adjustment × 4 + work-order × 4 |
| `shared/apply-payment-race.test.ts` | **Edit** (Write EMAS): `update` dublyori endi WHERE'ni JONLI qator ustida baholaydi va mos kelmasa `P2025` otadi; + 8 yangi test (`deletedAt` TOCTOU × 4 servis × 2) |
| `shared/transition-with-claim.test.ts` | **Edit**: WHERE-shakli assert'i yangilandi + soft-deleted qatorni o'tkazmaslik testi |
| `shared/transition-toctou-class.test.ts` | **Edit**: MONEY oilasiga `delete()` pin (7), loss `delete()` pin + post `deletedAt` pin, **work-order bloki** (3 test), **STOCK qamrov-lock** (2 test) |

**QAROR — `completed` work order endi O'CHIRILMAYDI (xulq o'zgarishi, ataylab).**
Ikki yo'l bor edi: (1) `delete()` ichida ombor teskarilashini yugurtirish, (2) `completed` dan o'chirishni
taqiqlash. (1) — `cancel` mantig'ining ikkinchi nusxasi bo'lardi (`applyCancelCascade` bir joydan
chaqirilishi Faza Q2 zero-sum kafolatining asosi), (2) esa butun kodbaza intizomiga mos: stock oilasida
**faqat draft** o'chiriladi. Endi tugatilgan ТЗ ni o'chirish uchun avval `cancel` qilinadi — u AYNAN
muzlatilgan qiymat bilan teskari qiladi, keyin `cancelled` o'chiriladi. `bulkDelete` shu `delete()` ni
chaqiradi ⇒ tanlovga tugatilgan ТЗ tushsa u `failed` bo'lib qaytadi (jimgina arvoh qoldiq qoldirish
o'rniga). Kassa/pul oilasida xulq **umuman o'zgarmadi**.

**XATO-SHAKLI o'zgarishi (ochiq hujjatlanadi, reja talab qilgan)**
- `applyPayment`: `update` endi `deletedAt: null` bilan filtrlanadi ⇒ mos qator yo'q bo'lsa Prisma `P2025`
  otadi. U **ushlanadi** va **`NotFoundException`** ga aylantiriladi, matn pre-read'nikining AYNAN o'zi
  (`InvoiceOut <id> not found` va h.k.) ⇒ **HTTP 404 saqlanadi**. Ushlanmasa, `applyPayment` POST
  marshrutlaridan chaqirilgani uchun global filtr `P2025`ni 400 ga (POST) yoki 500 ga (mapsiz) aylantirardi
  — mijoz shartnomasi buzilardi. Ya'ni **tashqi shakl o'zgarmadi**, faqat ichki sabab boshqa.
- `counterparty-adjustment.softDelete`: raqib amal bo'lsa endi **409 `ConflictException`** qaytaradi
  (ilgari 200 `{ ok: true }` qaytarib balansni IKKINCHI marta teskari qilardi). Bu yagona haqiqiy
  status-kodi o'zgarishi va u ataylab.
- `work-order.delete`: `completed` uchun **400** (ilgari 200). Yuqoridagi QAROR.

**Testlar (TDD tartibi kuzatildi — RED JONLI o'lchangan)**
- **RED-1** `delete-claim-race.test.ts` (fix'dan OLDIN): **27 yiqildi / 36**. Sabablari aynan bug:
  - 7 servisda «rival allaqachon post qilgan» → `promise resolved "{ ok: true }" instead of rejecting`
    (POSTED hujjat soft-delete bo'ldi);
  - 7 servisda `post ∥ delete` → `exactly one of post/delete may win: expected [] to have a length of 1
    but got +0` (IKKALASI ham yutdi ⇒ posted-va-o'chirilgan);
  - 7 servisda ikki parallel `delete` → 0 rad etish;
  - counterparty-adjustment: eskirgan snapshot bilan `softDelete` → **balans ikkinchi marta teskarilandi**;
    ikki parallel `softDelete` va `cancel ∥ softDelete` → 0 rad etish (2× `applyDelta`);
  - work-order: `completed` ni o'chirish → `resolved "{ ok: true }"`; `in_progress` ga o'tkazish ∥ delete →
    0 rad etish.
  O'tgan 9 tasi — «oddiy draft o'chiriladi» va «posted korrektirovka o'chiriladi» regress-qulflari.
- **RED-2** `apply-payment-race.test.ts` yangi bloki (fix mexanik o'chirib o'lchandi): **8 yiqildi / 25** —
  4 servis × 2, hammasi `promise resolved "undefined" instead of rejecting` (increment O'LIK hujjatga
  yozildi).
- **GREEN:** `delete-claim-race` **36/36**, `apply-payment-race` **25/25**, `transition-with-claim` **7/7**,
  `transition-toctou-class` **88/88**.
- **Skaner vakuum EMAS** (`git show HEAD:` ustidan o'sha regexlar bilan alohida o'lchandi):
  pre-fix'da **8/8 delete-pin `false`**, work-order pin `false`, loss post `deletedAt` pin `false`;
  post-fix'da hammasi `true`. Ya'ni 10 ta yangi assert eski kodda qizil bo'lardi.
- **Test-double halolligi:** `findFirst` yield qiladi va **DETACHED** nusxa qaytaradi (qulfsiz o'qish);
  `updateMany`/`update` WHERE'ni **JONLI** qator ustida baholaydi va tanasi yield qilmaydi (qator-qulfi
  ostidagi bitta atomik statement). Eskirgan snapshot `staleSnapshot` orqali modellangan — «raqib
  commit qildi» oynasi deterministik. Naqsh — `money-transition-race.test.ts` / `loss-transition-race.test.ts`.

**Gate (to'liq, JONLI o'lchangan)**
- `pnpm --filter @moysklad/api typecheck` → **0 xato**
- `pnpm lint:product` → **0 error** (747 warning — siyosat bo'yicha ruxsat; 3 `format` xatosi
  `biome format --write` bilan tuzatildi)
- Fazaga tegishli modullar: `loss`, `shared`, `payment-in/out`, `cash-in/out`, `invoice-out/in`,
  `counterparty-adjustment`, `work-order`, `customer-order`, `purchase-order` → **49 fayl / 956 test yashil**
- `pnpm --filter @moysklad/api exec vitest run` (BUTUN suite) → **431 fayl yashil + 1 skipped /
  5667 test yashil + 2 skipped, 0 yiqilgan** (oxirgi o'lchov 5609 edi ⇒ **+58** yangi test, regress YO'Q)
- `i18n:gate` — **kerak emas** (UI-matn tegilmadi, faqat backend)

**Qolgan qarz / DEFER**
- **Browser-smoke YO'Q.** Poyga faqat in-memory Prisma dublyorida o'lchandi; real Postgres'da
  (`post` Serializable tx ∥ standalone `delete` UPDATE → 40001/409) hech qachon yugurtirilmadi —
  Phase-2 QA cohort ishi. `counterparty-adjustment` ning yangi 409'i UI'da qanday ko'rinishi ham.
- **Stock oilasining `post()` claim'larida `deletedAt: null` YO'Q** (`supply`, `sales-return`,
  `purchase-return`, `move`, `enter`, `production`). Ular skanerda `state: 'draft' }` shaklida qattiq
  pin qilingan, ya'ni o'zgartirish 6 regexni ham qayta yozishni talab qiladi — Q3 doirasidan tashqarida.
  Ta'sir kichikroq: ularning `delete()`i allaqachon atomik, demak `delete → post` ketma-ketligi faqat
  `delete` OLDIN commit bo'lgan holatda muhim, va Serializable + `lockBalances` uni pozitsiyali
  hujjatlarda baribir tutadi. **Bo'sh (0 pozitsiyali) hujjatda teshik qoladi** — aynan loss'dagi
  2026-07-29 stsenariysi. **Alohida mayda faza sifatida yopilsin.**
- **Skaner qamrov-lock'ida 5 stock-servis `KNOWN_UNPINNED`**: `demand` (o'z claim'i dd33fac5 da, alohida
  suite'i bor), `inventory`, `retail-sale` (POS FSM — Faza Q1 post+smena claim'ini qattiqlashtirdi),
  `product-cell-move`, `product-cut`. Ular ataylab ro'yxatda — qamrov-lock ularni ko'radi va
  klassifikatsiya talab qiladi, lekin claim-shakli pin QILINMAGAN. **Yangi** stock-servis qo'shilsa test
  yiqiladi (ildiz-sabab yopildi); mavjud 5 tasini pin qilish — keyingi ish.
- **`counterparty-adjustment.softDelete` izolyatsiyasi tegilmadi** — u hamon default ReadCommitted
  (`MONEY_TX_OPTS`siz). Claim qator-qulfini oladi va ikki-karra teskarilashni yopadi; Serializable
  qo'shish `withSerializationRetry` ni ham talab qilardi (aks holda 40001 xom holda chiqadi) va skanerning
  `txCount: 1` assertini o'zgartirardi — ataylab qilinmadi, xavf tahlili yuqoridagi.
- **`applyPayment` `state` yozuvi hamon «oxirgi yozuvchi yutadi»** (Faza 3 qarzi, o'zgarmadi):
  `payedSumMinor` atomik, `state` esa alohida `update`. Real Postgres qator-qulfiga tayanadi.
- **Tarixiy ma'lumot tekshirilmadi:** prod'da allaqachon «posted + deletedAt» yoki «completed + deletedAt»
  yetim hujjatlar bor-yo'qligi **o'lchanmadi** (bu bug 2026-06 dan beri ochiq edi). Bu — OPS-qadam:
  `SELECT` bilan sanash, bo'lsa `CounterpartyAdjustment` / `cancel` bilan korrektirovka.

**Commit:** `fix(api): faza q3 — delete() atomik claim + applyPayment deletedAt (M-01/M-09/STK-01 qoldiqlari)`

---

## Faza Q4 — 2026-08-09 — **Phase-1: strukturaviy + unit-tasdiqlangan, browser-smoke YO'Q**
### 18c qoldig'i: Demand oxirgi-birlik yaxlitlash (`STK-08`) + supply `remainingQty` o'lik-kod tozalash

**Da'volarni tasdiqlash (kodda, o'z ko'zim bilan — 3/3 TASDIQLANDI)**

| Da'vo (Faza 18a §QARZ 2–3) | Kodda ASLIDA (HEAD, Q2/Q3 dan keyin) |
|---|---|
| Demand to'liq chiqimda perUnit-yaxlitlashdan `costBalanceMinor`da ±tiyin qoladi | ✅ `demand.service.ts` post: `perUnit = computePerUnitCost(costBal, onHand)` → `lineCost = scaleMinorByQty(perUnit, qty)`. `qty == onHand` da 1000 tiyin / 3 dona ⇒ chiqim **999**, `qty = 0` qatorda **1 tiyin** osilib qoladi |
| `SupplyPosition.remainingQty` COGS uchun O'LIK | ✅ butun `apps/api/src` bo'yicha `remainingQty: { decrement` **hech qayerda yo'q**; yagona yozuvchilar — supply post (`= quantity`), unpost/cancel (`'0'`), va `demand.reverseLegacyFifo` (**increment**, legacy) |
| Guard `remainingQty` ga asoslanadi | ✅ `supply.service.ts` unpost + cancel: `Number(String(p.remainingQty)) < Number(String(p.quantity))` — ikki Decimal(20,6) **float orqali** solishtiriladi |
| **+1 o'zim topdim** | post `remainingQty: String(Number(String(p.quantity)))` — Decimal(20,6) (20 raqam) **double** orqali (17 raqam) o'tkaziladi: STK-08 sinfining aynan o'zi, lot hajmi qabul qilingan miqdordan farq qilishi mumkin |

### Qaror: variant (ii) — `DemandPosition.baseCostMinor` ustuni (Faza 34 naqshi). (i) Q2-jurnal naqshi YARAMAYDI

Uch yo'l ko'rildi (topshiriq §3a):

1. **(i) `StockOperation` jurnalidan negatsiya (Q2/WorkOrder naqshi)** — **RAD ETILDI, aniq sabab bilan.**
   Q2 da bu ishladi, chunki WorkOrder FSM `completed` ni **bir marta** beradi (`cancelled` — terminal),
   ya'ni `docType:'workorder', reason:'post'` to'plami **yagona**. Demand'da esa `unpost` hujjatni
   `draft` ga qaytaradi va **qayta post qilish mumkin** — post→unpost→post dan keyin jurnalda
   `docType:'demand', reason:'post'` qatorlarining **IKKI** to'plami turadi va negatsiya ikki karra
   teskarilardi. Ularni ajratadigan ishonchli filtr yo'q (`postedAt` deltalardan KEYIN yoziladi,
   `StockOperation` esa append-only — post qatorini «iste'mol qilindi» deb belgilab bo'lmaydi).
2. **(ii) `DemandPosition.baseCostMinor BigInt?` — TANLANDI.** Aynan Faza 34 `MovePosition.baseCostMinor`
   naqshi: nullable ⇒ **eski qatorlar NULL** ⇒ eski `costMinor × qty` formulasi ⇒ Faza Q4 dan oldin
   o'tkazilgan otgruzkalar bit-ma-bit avvalgidek teskarilanadi (**nol-regressiya**), qayta-post esa
   ikkala qiymatni yangidan muzlatadi (idempotent). `per-unit-snapshot-blocks-exact-cost-fix`
   xotirasining talabi shu: yaxlitlash **ma'lumot yo'qotadi**, aniq satr-qiymatni per-birlikdan
   tiklab bo'lmaydi — uni SAQLASH kerak.
3. **(iii) hech narsa qilmaslik / faqat post'ni tuzatish** — RAD: post 1000 olib, unpost 999 qaytarsa
   har to'liq chiqim-bekor sikli **1 tiyin YARATADI** (reja Faza 34 da aynan shu tuzoqni yozgan).

**Move tomoni qayta yozilmadi** — `computeTransferCost()` **qayta ishlatildi** (topshiriq talabi).

### Fayllar

| Fayl | O'zgarish |
|---|---|
| `apps/api/src/modules/demand/demand-cost-basis.ts` | **YANGI** — sof, Nest'siz: `computeOutflowCost()` (Faza 34 `computeTransferCost` ustiga Demand'ning `buyPrice` fallback'i) + `reversalLineCost()` (`baseCostMinor ?? costMinor × qty`) |
| `apps/api/src/modules/demand/demand-cost-basis.test.ts` | **YANGI** — 14 test (9 sof arifmetik + 5 manba-skan qo'riqchisi) |
| `apps/api/src/modules/demand/demand.service.ts` | post: qiymat `computeOutflowCost` orqali, `baseCostMinor` ham muzlatiladi; unpost + cancel: `reversalLineCost`; ikkala reset `costMinor: null, baseCostMinor: null`; `computePerUnitCost`/`scaleMinorByQty` importlari endi kerak emas |
| `apps/api/src/modules/demand/demand-weighted-avg-cogs.test.ts` | **Edit** (Write EMAS) — 18a ning 2 manba-skan invarianti yangi ifodaga moslandi (bazis va zero-sum talabi **o'zgarmadi**) |
| `apps/api/src/modules/supply/supply.service.ts` | post `remainingQty: String(p.quantity)` (float round-trip olib tashlandi); unpost + cancel guard `compareDecimals(...) < 0`; sinf-doc + guard izohi haqiqatga moslandi |
| `apps/api/src/modules/supply/supply.schema.ts` | fayl-doc: «FIFO lot tracking» → «LEGACY lot marker (18a da bekor qilingan)» |
| `apps/api/src/modules/supply/supply-lot-guard.test.ts` | **YANGI** — 5 test (float round-trip yo'qotishini o'lchaydi + guard manba-skani) |
| `packages/db/prisma/schema.prisma` | `DemandPosition.baseCostMinor BigInt? @map("base_cost_minor")` + shartnoma izohi |
| `packages/db/prisma/migrations/20260809210000_demand_position_base_cost_minor/migration.sql` | **YANGI** — `ADD COLUMN IF NOT EXISTS base_cost_minor BIGINT` |

### O'zgarish mohiyati

**(a) Demand oxirgi-birlik.** `computeOutflowCost` **qulflangan** balansdan (yetarlilik tekshiruvi
ishlatgan aynan o'sha `balances` xaritasi) ikki son qaytaradi: `perUnitMinor` (o'rtacha — ekran va
pre-Q4 teskarilash bazisi) va `lineCostMinor` (**haqiqatan chiqib ketgan qiymat**). Chiqim omborni
**bo'shatsa** (`qty === onHand`, `compareDecimals` bilan — float taqqoslash EMAS) satr **butun**
`costBalanceMinor` ni oladi; qisman chiqimda arifmetika **bit-ma-bit eski** (`computeLineCost` va
`scaleMinorByQty` ikkalasi ham `roundHalfUp(qty×unit, 1e6)` — manba o'qib tasdiqlandi, shuning uchun
qisman yo'lda **regressiya nolga teng**). `buyPrice` fallback va uning `?? 0n` shartnomasi
**o'zgarmadi** (manfiy balans ham bazis emas — bo'linsa satrga o'ylab topilgan manfiy narx berilardi).

**Teskarilash simmetriyasi.** unpost/cancel endi `reversalLineCost` orqali **saqlangan aniq satrni**
qaytaradi. `??` (`||` EMAS) ⇒ haqiqiy `0n` satr «yo'q» deb talqin qilinmaydi. **Legacy FIFO yo'li
TEGILMADI:** `reverseLegacyFifo` avvalgidek `remainingQty` ni increment qiladi,
`DemandPositionCostConsumption` qatorlarini o'chiradi va `hadRows` bo'lsa uning `totalCostMinor` i
ustun turadi.

**(b) Supply `remainingQty`.** Ustun **sxemadan o'chirilmadi** (legacy qatorlar unga tayanadi) va post
yozuvi ham **qoldirildi** — lekin `String(Number(String(q)))` float round-trip'i olib tashlandi.
**Guard QOLDIRILDI** (topshiriq: himoyani yo'qotma), ammo endi rostgo'y izoh bilan: `remainingQty <
quantity` faqat **18a dan OLDIN** qabul qilingan lotlarda yuzaga keladi (jadvalda o'sha kamaytirilgan
qoldiq hamon turibdi) va aynan «bu tovar allaqachon sotilgan» signalining yagona qolgan manbasi;
18a dan keyingi lotlarda ikki qiymat **doim teng**, ya'ni guard hech qachon otilmaydi. Taqqoslash
`Number()` dan `compareDecimals` ga o'tkazildi — 2^53 mikro-birlikdan katta lotlarda float ikkala
tomonni bir xil double'ga qisib, **iste'mol qilingan lotni o'tkazib yuborardi**.

**Zamonaviy muqobil mezon ATAYLAB kiritilmadi** (qarz sifatida yozildi): weighted-average modelida
«tovar sotilganmi» ni tekshirishning to'g'ri yo'li — unpost'da omborda joriy qoldiq yetarliligini
tekshirish (`assertAvailable`). Lekin u **bugun qonuniy** bo'lgan teskarilashlarni yangidan rad
etardi (masalan tovar boshqa omborga ko'chirilgan bo'lsa) — bu xulq o'zgarishi Q4 doirasidan tashqari.

### Testlar — RED **jonli o'lchandi**, keyin GREEN

**RED** (fix'dan oldin, `vitest run demand-cost-basis.test.ts supply-lot-guard.test.ts`):
`Test Files 2 failed (2)` · `Tests 2 failed | 3 passed (5)`

- `demand-cost-basis.test.ts` — **butun fayl yuklanmadi** (`Failed to load url ./demand-cost-basis.js`)
  ⇒ 14 test umuman hisobga kirmadi;
- `supply-lot-guard.test.ts` — **2 qizil**: (1) `remainingQty: String(Number(` hamon manbada,
  (2) `compareDecimals(String(p.remainingQty), …)` uchraydigan joylar soni **0**, kutilgan 2.
  Qolgan 3 tasi ataylab yashil — ular **float xatosini o'lchaydigan** dalil testlari
  (`String(Number('99999999999999.999999')) !== '99999999999999.999999'`;
  `Number('…999998') === Number('…999999')`).

Fix'dan keyin `demand-weighted-avg-cogs.test.ts` da **2 qizil** paydo bo'ldi (18a manba-skani eski
ifodani qidirardi) — invariantning **mohiyati** o'zgarmagani uchun ikkala assert yangi ifodaga
moslandi (`Edit`, Write EMAS), izoh bilan.

**GREEN:** `demand + supply` **218/218** · yangi ikki fayl **19/19**.
Reja stsenariylari: (1) 1000 tiyin / 3 dona to'liq chiqim → `costBalance` aynan **0** ✓
(2) post↔unpost bit-ma-bit zero-sum, **yangi** (`baseCostMinor`) va **eski** (NULL ⇒ 999) qatorlarda ✓
(3) supply unpost mavjud xulqi regressiz (218 testda 0 yiqilish) ✓

### Gate (jonli o'lchangan)

| Buyruq | Natija |
|---|---|
| `pnpm --filter @moysklad/api typecheck` | **0 xato** |
| `pnpm lint:product` | **0 error** (747 warning — siyosat bo'yicha ruxsat). Yangi test-fayl avval `format` xatosi bergan edi → `biome format --write` bilan tuzatildi |
| `vitest run demand + supply + stock + move + loss + retail-sale` | **597/597** (47 fayl) |
| **To'liq API suite** (`vitest run`) | **5686 passed \| 2 skipped** · **433 fayl passed \| 1 skipped (434)**. Q3 dan keyingi baza **5667 passed / 2 skipped / 431 fayl** ⇒ **+19 test** (14 demand-cost-basis + 5 supply-lot-guard) va **+2 fayl** — aynan qo'shganim. **Regress YO'Q** |
| Migratsiya | `prisma db execute --file` bilan lokal `climart_adopt @ localhost:5432` ga qo'llandi; `prisma migrate diff` (datamodel↔datasource) chiqishida `demand_positions`/`base_cost_minor` **umuman yo'q** ⇒ o'z obyektim uchun drift **0**; `prisma generate` qayta yugurtirildi |
| `pnpm i18n:gate` | Qo'llanmaydi — UI-matn tegilmadi |
| web | **Tegilmadi** |

### Qolgan qarz / DEFER

1. **🔴 Browser-smoke YO'Q.** Hech bir sahifa real brauzerda ochilmadi. Ayniqsa: to'liq chiqimdan
   keyin `/stock` da omborning **qiymati aynan 0** bo'lishi va otgruzka detalidagi «Себестоимость»
   ustuni — Phase-2 QA cohort'iga.
2. **Prod DDL qarzi (OPS):** `demand_positions.base_cost_minor` **prod'da yo'q** — `sherset_v2`
   sxema-drifti tufayli `migrate deploy` emas, qo'lda `prisma db execute --file` kerak. Reja
   §OPS-QADAM 5 ro'yxatiga qo'shilsin (u yerda `move_positions.base_cost_minor` allaqachon turibdi).
   **Busiz deploy API'ni yiqitadi.**
3. **Tarixiy ma'lumot tuzatilmaydi.** Q4 dan OLDIN to'liq chiqim qilingan otgruzkalar
   `Stock.costBalanceMinor` da allaqachon tiyin-qoldiq qoldirgan (bo'sh omborda osilgan qiymat).
   Hajm **o'lchanmagan** — bu OPS-qadam (Inventory bilan qayta-baholash). Bu faza yangi
   divergensiya YARATILISHINI to'xtatadi.
4. **Hisobotlar hamon `costMinor × qty` o'qiydi** — `analitika/analysis.service.ts` (`select: … costMinor`)
   va `Demand.costSumMinor` (endi `Σ baseCostMinor`) hujjat boshiga bir necha tiyinga farq qilishi
   mumkin. Kosmetik, **jurnal to'g'ri**; Faza 34 ning Move uchun yozgan qarzi bilan bir sinf
   (o'sha yerda ham backfill yo'q).
5. **Supply unpost'da zamonaviy «tovar sotilgan» tekshiruvi YO'Q** (yuqorida asoslandi). Bugungi holat:
   18a dan keyingi lotni unpost qilish omborni **jimgina manfiy**ga tushirishi mumkin
   (`assertAvailable` chaqirilmaydi). Bu **Q4 dan oldin ham shunday edi** — yangi qarz emas, lekin
   endi hujjatlashtirilgan. To'g'ri yechim: unpost'ga `assertAvailable` (store `allowNegativeStock`
   semantikasi bilan) — alohida faza.
6. **`SupplyPosition.remainingQty` ustunining o'zi qolmoqda** — legacy qatorlar va guard unga tayanadi.
   To'liq olib tashlash faqat legacy `DemandPositionCostConsumption` qatorlari arxivlangandan keyin mumkin.
7. **`demand-cost-basis.ts` → `move-cost-basis.ts` importi** — modullararo *sof leaf* import (Faza 34
   `move-cost-basis.ts → demand/fifo-consumer.ts` presedenti bilan bir xil yo'nalishsizlik). Faza 34 ning
   5-qarzi (`fifo-consumer.ts` ni `shared/decimal.ts` ga ko'chirish) bajarilganda bu ikkalasi ham
   `shared/` ga ko'chirilsin.

**Commit:** `fix(cogs): faza q4 — demand oxirgi-birlik + supply remainingQty tozalash (STK-08 sinfi)`
