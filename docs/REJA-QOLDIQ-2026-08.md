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
   `debt_payments.exchange_rate` ×10⁴→×10⁸ · `retail_sales.debt_return_minor` ·
   **`demand_positions.base_cost_minor`** (Faza Q4 — busiz deploy API'ni yiqitadi) ·
   **`hr_attendance.deleted_at` + `hr_attendance.deleted_by_id`** (Faza Q7 — busiz HR davomat
   endpointlari yiqiladi; migratsiya `20260809230000_hr_attendance_soft_delete`, ikkala ustun
   nullable/defaultsiz ⇒ jadval qayta yozilmaydi) ·
   **`counterparties` 3 ta lookup-indeksi** (Faza Q9 — migratsiya
   `20260809235000_bank_import_inn_lookup_indexes`: `counterparties_inn_expr_idx`,
   `counterparties_bank_account_expr_idx` — EXPRESSION indekslar, sxemada KO'RINMAYDI, faqat shu
   faylda; + `counterparties_account_id_code_idx`. Busiz bank-import auto-match prodda Seq Scan
   qoladi — funksional buzilish EMAS, faqat sekinlik. `CREATE INDEX` SHARE qulfi ⇒ past yuklamada).
6. **🔴 Telegram webhook** (Faza 21 DEPLOY-BLOKER): deploydan keyin har akkaunt uchun
   `POST /telegram/config/webhook` — aks holda inbound Telegram (jonli supply-approval tugmalari)
   TO'XTAYDI. Tekshir: `businessStatus.webhookSecretSet === true`.
7. **Env sirlari** (Faza 22): deploydan OLDIN VPS'da haqiqiy `JWT_SECRET`/`COOKIE_SECRET` borligini
   tekshir — endi yo'q bo'lsa API boot'da YIQILADI.
8. **Rol matritsasi QA** (Faza 23 + **Faza Q10** qattiqlashuvi): `employees:full`siz menejer KPI
   konfiguratsiyasini saqlay olmaydi; `settings`siz «Отделы» yaratilmaydi — rollarni deploydan keyin
   tekshir/to'ldir. **Faza Q10 qo'shdi (16 endpoint, hammasi ilgari HAR xodimga ochiq edi):**
   `settings.update` — `PUT /sklad-keepers`, `PUT /sklad-keepers/receipt-printer`,
   `PATCH /admin/shift-schedules/:id`, `PATCH /admin/smenas/:id`, `POST /pick-lists/sync`,
   `POST /onboarding/{skip,restart,override}` · `settings.create` —
   `POST /admin/{shift-schedules,smenas}` · `settings.delete` — `DELETE /sklad-keepers/:skladNo`,
   `DELETE /admin/shift-schedules/:id`, `DELETE /admin/smenas/:id` · `cashiersession.create` —
   `POST /admin/smenas/open-session` · `debtpayment.create` — `POST /debts/pos/pay` (**pul**) ·
   `salesreturn.update` — `POST /restock-tasks/from-sales-return` · **`DispatcherGuard`
   (`hrRoles: ['admin']`)** — `GET /driver-tracking/link/:employeeId`.
   **Deploydan keyin AYNAN tekshir:** (a) sozlamalar sahifalarini (sklad-keepers / shift-schedules /
   smena) ishlatadigan xodimda `settings` create/update/delete bormi; (b) POS smenani ochadigan
   kassirda `cashiersession.create`, POS qarz to'lovini oladigan kassirda `debtpayment.create`
   bormi (QarzOperatori roli endi POS qarz to'lovini kirita OLMAYDI — TZ §3.6 talabi, kutilgan);
   (c) haydovchi magic-linkini beradigan HR-menejerda `hrRoles: ['admin']` bormi. **ReadOnly** va
   **rolsiz** xodimlar bu 16 yo'lda endi 403 oladi; **Employee** roli `delete`larda 403 oladi
   (`delete: NO`). Egaga (admin) ta'sir YO'Q — seed'da Administrator = hamma joyda `ALL`.
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
**☑ HISOBOT (2026-08-09):** BAJARILDI — batafsili «HISOBOT JURNALI → Faza Q5» da.

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
**☑ HISOBOT (2026-08-09):** BAJARILDI — batafsili «HISOBOT JURNALI → Faza Q6» da.

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
**☑ HISOBOT (2026-08-09):** BAJARILDI — batafsili «HISOBOT JURNALI → Faza Q7» da.

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
**☑ HISOBOT (2026-08-09):** BAJARILDI — batafsili «HISOBOT JURNALI → Faza Q8» da.

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
**☑ HISOBOT (2026-08-09):** BAJARILDI — batafsili «HISOBOT JURNALI → Faza Q9» da.

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
**☑ HISOBOT (2026-08-09):** BAJARILDI — batafsili «HISOBOT JURNALI → Faza Q10» da.

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
**☑ HISOBOT (2026-08-09):** BAJARILDI — batafsili «HISOBOT JURNALI → Faza Q11» da.

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
**☑ HISOBOT (2026-08-09):** BAJARILDI — batafsili «HISOBOT JURNALI → Faza Q15» da.

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
**☑ HISOBOT (2026-08-09):** BAJARILDI — batafsili «HISOBOT JURNALI → Faza Q16» da.

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
**☑ HISOBOT (2026-08-09):** BAJARILDI — batafsili «HISOBOT JURNALI → Faza Q17» da.

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

---

## Faza Q5 — Analitika items: DB-paginate + `truncated` (`PERF-01`, asl reja 27b) (2026-08-09) — **Phase-1: strukturaviy + unit-tasdiqlangan + jonli-DB o'lchangan, browser-smoke YO'Q**

### Topilma tasdiqlanishi (o'z ko'zim bilan kodda) — audit da'vosi QISMAN ESKIRGAN

Reja: «`items.service.ts` hammani RAM'ga tortib JS'da agregat + 10k cap jim kesadi» va yechim
yo'nalishi «qidiruvni `take` dan OLDIN SQL `where` ga tushir». Kod o'qildi (`items.service.ts`,
o'zgarishdan oldingi 438 qator):

| Da'vo qismi | Dalil (fix'dan oldingi qator) | Xulosa |
|---|---|---|
| Cap **10 000** | `:399` `const MAX_PRODUCTS_PER_QUERY = 10_000` | **TASDIQ** |
| Cap **jim** kesadi | javob shakli `{items,total,page,pageSize,totalPages}` — hech qanday bayroq yo'q | **TASDIQ** |
| `total` **kesilgan** ro'yxatdan | `:163` `const total = filtered.length` (⇐ `allRows` ⇐ `take: 10_000`) | **TASDIQ** — 12 000 lik katalogda `total` **10 000** deb yolg'on gapirardi |
| Agregat + saralash JS'da | `:154-165` `filter` → `sort` → `slice` | **TASDIQ** |
| **Qidiruv `take` dan KEYIN** | `:246-254` `buildProductWhere()` ichida `OR: [name/code/article contains]` → `:84` `findMany({ where: baseWhere, take })` | **❌ ESKIRGAN — qidiruv ALLAQACHON SQL `where` da, `take` dan OLDIN** |

Ya'ni Faza 27a dagi `PERF-10` («search-before-take») ning items'dagi ekvivalenti **allaqachon
to'g'ri edi**. Bu ko'r-ko'rona qo'llanmadi: TDD testi buni alohida o'lchadi — «qidiruv cap
oynasidan tashqaridagi tovarni topadi» testi RED bosqichida **faqat `truncated: undefined`**
sababli yiqildi, `total`/`items` da'volari o'sha yerda ham O'TDI (ya'ni qidiruv haqiqatan
ishlayotgan edi). Shu sababli `resolveSearchIds()` naqshi items'ga KO'CHIRILMADI — 2 000 lik
yangi cap qo'shish faqat zarar qilardi.

**+2 QO'SHIMCHA topilma (audit ko'rmagan, o'zim topdim):**

1. **`take: 10_000` da `orderBy` UMUMAN YO'Q edi** (`:83-97`). Ya'ni 12 000 lik katalogdan qaysi
   10 000 tasi tushishi — DB kayfiyati (`Seq Scan` tartibi). `sort='name' asc` so'ralganda ham
   alifbodagi birinchi tovar oynadan tashqarida qolishi va sahifa 1 da **umuman ko'rinmasligi**
   mumkin edi. Bu «yolg'on `total`» dan ham yomonroq: sahifa mazmuni beqaror.
2. **`stats()` ham aynan shu bug'ga ega edi** (`:178-203`): `totalItems: products.length` va
   `noPartnerCount` — ikkalasi ham cap-oyna ichidan. KPI kartochkalari 10 000 da muzlab qolardi.

### Yechim — ikki yo'l, `total` HAR IKKALASIDA butun-scope

Faza 27a naqshi qo'llandi (SQL pre-filtr → `skip`/`take` DB'da → alohida `count` → `truncated`),
lekin items'ning o'ziga xosligi hisobga olindi: saralash maydonlarining bir qismi (`stock`,
`soldQty`, `sellPrice`) SQL'da YO'Q (agregat/JSON), shuning uchun ular uchun cap saqlanadi.

**A. DB-paginate (cap'siz).** Shart: `sort ∈ {name, code}` **va** `lowStock` yoqilmagan.
`orderBy: [{sort: order}, {id:'asc'}]` + `skip: (page-1)*pageSize` + `take: pageSize`.
Node'ga **faqat bir sahifa** (≤200 qator) keladi, agregatlar ham faqat shu sahifa uchun.
`total = product.count(where)`, `truncated: false`. Bu — FE ning DEFAULT rejimi
(`page.tsx` da `sort` boshlang'ich qiymati `'name'`), ya'ni real yuklamaning katta qismi.

**B. Agregat-yo'l (cap saqlanadi, lekin JIM EMAS).** Shart: `sort ∈ {stock, soldQty, sellPrice}`
yoki `lowStock`. `orderBy: [{name:'asc'},{id:'asc'}]` (**deterministik oyna** — 1-qo'shimcha
topilma), `take: MAX_PRODUCTS_PER_QUERY`. `truncated = scopeTotal > MAX_PRODUCTS_PER_QUERY`.
`total` = butun-scope `count` (`lowStock` dan tashqari — pastdagi «Qolgan qarz» 1-band).

**`stats()`**: `totalItems` va `noPartnerCount` endi ikkita SQL `count` (butun scope, cap'siz,
`Promise.all` da). `lowStockCount` cap-oyna ichida qoladi (sabab quyida) + `truncated` bayrog'i.

### Fayllar

| Fayl | O'zgarish |
|---|---|
| `apps/api/src/modules/analitika/items.service.ts` | `ItemsResponse.truncated` + `ItemsStats.truncated` (yangi maydonlar, ADDITIV); `list()` ikki yo'lga bo'lindi (A: `skip`/`take`/`orderBy` DB'da, B: deterministik cap-oyna); `total` ⇐ `product.count(where)`; `stats()` da `totalItems`/`noPartnerCount` ⇐ `count`; `MAX_PRODUCTS_PER_QUERY` endi **eksport** qilinadi (test qulflaydi) + izohi «cap bor, ammo jim emas» ga yozildi |
| `apps/api/src/modules/analitika/items.service.test.ts` | **Edit** (Write EMAS — `never-write-over-existing-test-file`; `git status` da ` M`). Mavjud 9 test SAQLANDI; `makePrisma` dubli `skip`/`take`/`count(where.supplierId)` DB-semantikasiga o'tkazildi (servis endi DB-paginate qiladi ⇒ dubl ham kesishi SHART); **+10 yangi test** (`CAP+5` = 10 005 qatorli sun'iy katalog, `where`→`orderBy`→`skip`/`take` ni baholaydigan dubl) |

**FE tegilmadi.** `apps/web/src/app/(app)/analitika/mahsulotlar/page.tsx` javob shaklini
o'zining LOKAL `interface ItemsResponse`/`ItemsStatsData` si bilan o'qiydi — yangi maydon
qo'shilishi uni buzmaydi (grep bilan tekshirildi: butun `apps/web` da items API ning yagona
iste'molchisi shu sahifa). `truncated` ni FE ko'rsatishi — Faza Q16 ishi.

### Testlar (TDD — RED JONLI o'lchandi)

**RED** (`vitest run src/modules/analitika/items.service.test.ts`): **9 failed | 9 passed (18)**.
Yiqilganlar (aynan xabarlar):

| # | Test | RED xabari |
|---|---|---|
| 1 | sort=name da sahifani DB dan oladi + total butun-scope | `expected 10000 to be 10005` |
| 2 | sort=name asc alifbodagi birinchi tovarni topadi | `expected 'Tovar-000000' to be 'AAA-alifboda-birinchi'` |
| 3 | DB-paginate sahifa 2 ni skip bilan oladi | `expected undefined to be 25` (`skip` umuman uzatilmasdi) |
| 4 | sort=stock cap ga uriladi — total butun-scope, truncated TRUE | `expected 10000 to be 10005` |
| 5 | cap dan kichik to'plamda truncated=false | `expected undefined to be false` |
| 6 | qidiruv cap oynasidan tashqaridagi tovarni topadi | `expected undefined to be false` ⇐ **faqat `truncated`**; `total===1` va nom mosligi O'TDI ⇒ qidiruv allaqachon to'g'ri edi |
| 7 | lowStock cap ga urilganda truncated TRUE | `expected undefined to be true` |
| 8 | stats totalItems/noPartnerCount butun-scope | `expected 10000 to be 10005` |
| 9 | kichik to'plamda stats truncated=false | `expected undefined to be false` |

Fix'dan keyin +1 qulf-test qo'shildi (`MAX_PRODUCTS_PER_QUERY === 10_000` — konstanta jimgina
o'zgarsa `CAP+5` stsenariylari «cap'dan katta» ni tekshirishni to'xtatib qo'yardi).

**GREEN:** `src/modules/analitika` → **13 fayl / 132 test yashil** (items fayli: 19/19).

### Jonli DB o'lchovi (`climart_adopt @ localhost:5432`, rollback-tranzaksiya)

Unit-dubl so'rov SHAKLINI tasdiqlaydi, lekin PLANNI emas. Shu sababli lokal bazada
rollback-tranzaksiyasi ichida **12 000** sun'iy tovar seed qilinib (`Q5SEED-*`), uchala so'rov
`EXPLAIN (ANALYZE, BUFFERS)` bilan o'lchandi:

```
mavjud tovarlar = 8 → seed keyin = 12 008
A) YANGI count(*)                    2.713 ms · buffers 267 · Seq Scan
B) YANGI ORDER BY name,id LIMIT 50   5.356 ms · buffers 267 · top-N heapsort (Memory 29kB, rows=50)
C) ESKI  LIMIT 10000 (width=200)     2.342 ms · buffers 224 · Seq Scan, ORDER BY YO'Q
rollback keyin tovarlar = 8  OK (seed qolmadi) · Q5SEED qoldiq = 0
```

**O'qilishi (halol):** DB-vaqti bo'yicha eski yo'l tez ko'rinadi (2.3 ms) — chunki PG uchun
og'irlik u yerda emas. Farq Node tomonida: eski yo'l **10 000 × width 200 ≈ 2 MB** ni Prisma
orqali deserializatsiya qilardi, keyin 5 ta agregat-so'rovga **10 000 elementli `IN (…)`**
uzatardi va 10 000 obyektni JS'da yig'ib-saralardi. Yangi A-yo'lida bu **≤ pageSize (max 200)**
ga tushdi. B ustuni `Sort → top-N heapsort … rows=50` ni ko'rsatadi: PG faqat 50 qatorni
materializatsiya qiladi, 12 008 tasini emas. Va C plani `ORDER BY` siz — bu 1-qo'shimcha
topilmaning jonli dalili: qaysi 10 000 tushishi rejada belgilanmagan.

O'lchov skripti scratchpad'da qoldi, **commit'ga kiritilmadi** (bir martalik).

### Gate (jonli)

| Gate | Natija |
|---|---|
| `pnpm --filter @moysklad/api typecheck` | **0 xato** |
| `pnpm lint:product` | **0 error** (747 warning — siyosat bo'yicha ruxsat) |
| `vitest run src/modules/analitika src/modules/report` | **50 fayl / 466 test yashil** |
| To'liq API suite (`--shard=1/3`, `2/3`, `3/3` — watchdog uchun bo'lindi) | 145+145+143 fayl / **5696 passed, 2 skipped** (1 fayl skip). Baza 5686+2 edi, +10 = mening yangi testlarim. **Regress 0** |
| `pnpm i18n:gate` | Qo'llanmaydi — UI-matn tegilmadi |

### Qolgan qarz / DEFER

1. **`lowStock` rejimida `total` hamon oyna ichidan.** Sabab: «qoldiq < 10» sharti `Stock`
   jadvalidagi **yig'indiga** bog'liq va Prisma tovar-`where` ustidan aggregate-filtr bermaydi.
   To'g'ri yechim — `products ⋈ stocks` raw-SQL `GROUP BY … HAVING SUM(qty) < 10` (Faza 27a
   `countGroups()` uslubida), lekin u `buildProductWhere()` ni (shu jumladan `ILIKE` qidiruv va
   `inCartIds`) SQL'da TAKRORLASHNI talab qiladi ⇒ drift xavfi. Hozircha: oyna ichida ANIQ son +
   `truncated: true`. Ayni sabab bilan `stats().lowStockCount` ham cap-oyna ichida.
2. **B-yo'lida `page > cap/pageSize` bo'sh sahifa qaytaradi** (`total` butun-scope, lekin xizmat
   ko'rsatiladigan qatorlar 10 000 tasi). Bu ATAYLAB: reja «`total` butun-scope bo'lsin» deydi va
   `truncated: true` buni oshkor qiladi. FE bunday sahifaga o'tsa bo'sh jadval ko'radi.
3. **`truncated` FE'da KO'RSATILMAYDI** — Faza 27a ning 1-qarzi bilan bir xil sinf, Faza Q16 ga.
4. **`loadAggregates()` dagi `lastSupplies take: 5000` — hamon JIM cap.** B-yo'lida 10 000 tovarga
   5 000 ta pozitsiya yetmasligi mumkin ⇒ ba'zi qatorlar `lastPartnerName: null` bo'lib qoladi va
   buni hech kim aytmaydi. A-yo'lida xavf yo'q (≤200 tovar). Bu **boshqa o'q** (qator ichidagi
   maydon, ro'yxat emas) — shu fazada tegilmadi.
5. **`(account_id, name)` indeksi YO'Q.** A-yo'li `top-N heapsort` bilan ishlaydi (12 000 da 5 ms —
   yaxshi), lekin katalog o'nlab minglarga chiqsa index-scan bilan haqiqiy top-N bo'lardi.
   `products_name_trgm_idx` (GIN) faqat `contains` qidiruvga yaraydi, `ORDER BY` ga emas.
   O'lchangan, **hozircha shart emas** — indeks qo'shish OPS-qadam.
6. **Browser-smoke YO'Q.** `/analitika/mahsulotlar` real brauzerda ochilmadi — Phase-2 QA sessiyasiga.
   Ayniqsa tekshirilsin: sahifalagich endi haqiqiy `total` ni ko'rsatadi (katta katalogda sahifa
   soni O'ZGARADI) va `sort=name` sahifasi endi DB-collation bo'yicha (ilgari JS `localeCompare`)
   tartiblanadi — kirill/lotin aralash nomlarda tartib biroz farq qilishi mumkin.

### Parallel sessiya sharoiti (CLAUDE.md §6)

Ish daraxtida `docs/REJA-QOLDIQ-2026-08.md` da **Faza Q4** sessiyasining commit qilinmagan 2 qatorli
OPS-tahriri turgan edi (OPS-5 ga `demand_positions.base_cost_minor` bandi). Q4 ning o'zi
`8655feb2` da commit qilingan, ya'ni bu — yakunlangan sessiyaning qolib ketgan doc-yozuvi;
Faza 34 presedenti bo'yicha u shu doc-commit bilan birga keladi. Mening yozuvim faylga
`appendFileSync` bilan qo'shildi — **marker-kesish YO'Q** (`doc-append-marker-truncation`),
Q1–Q4 yozuvlariga TEGILMADI. `git add` faqat 3 aniq yo'l bilan.

**Commit:** `fix(report): faza q5 — analitika items db-paginate + truncated (PERF-01)`

---

## Faza Q6 — Akt-sverka: davr-filtri + saldo-forward (`PERF-02`, asl reja 27c) (2026-08-09) — **Phase-1: strukturaviy + unit-tasdiqlangan, browser-smoke YO'Q**

### 1. Dalil qanchalik eskirgan edi (o'z ko'zim bilan HEAD kodida)

Audit matni: «akt-sverka 11 ta parallel `findMany` bilan butun tarixni tortadi». HEAD'da o'lchandim:

| Da'vo | HEAD holati | Xulosa |
|---|---|---|
| «11 parallel `findMany`» | `counterparty-statement.service.ts:168-173` — BITTA `listJournalEntries` + `resolveBalanceDocs` | **ESKIRGAN** (Faza 10 da ko'chirilgan) |
| «davr-filtri yo'q» | `aggregate()` da `from`/`to` tushunchasi UMUMAN yo'q edi | **TASDIQ** |
| «davr-boshi saldo yo'q» | `computeStatement()` running balansni har doim `0n` dan boshlardi | **TASDIQ** |
| «pozitsiyalar har doim tortiladi» | `:173` `resolveBalanceDocs(…, { withItems: true })` — BUTUN tarix uchun | **TASDIQ** |
| davr-mashinasi tayyormi | `counterparty-balance-journal.util.ts:184` `foldJournalPeriod(entries, periodStart, periodEnd)` — `openingMinor`/`lines`/`closingMinor` bilan | **TAYYOR** |

**Muhim aniqlik (ikki xil «akt» bor, chalkashmasin):**
- `report/counterparty-act.service.ts` (FE `/print/reconciliation-act`, chop etiladigan «Акт сверки
  взаимных расчётов») — davr-filtri va saldo-forward **ALLAQACHON BOR** (`:88-89`, `:131`), FE ham
  `from`/`to` ni allaqachon uzatadi (`metrics-create-forms.tsx:164-165`). Bu yerda ish YO'Q edi —
  tekshirildi, o'zgartirilmadi.
- `counterparty-statement` (Excel akt-sverka, kontragent kartochkasidagi «Akt-sverka» kartochkasi) —
  davr o'qi YO'Q edi. **Faza Q6 aynan shu ikkinchisini yopadi.**

### 2. O'zgarishlar

| Fayl | O'zgarish |
|---|---|
| `apps/api/src/modules/counterparty-statement/statement-compute.util.ts` | `computeStatement(docs, openingMinor = 0n)` — running balans davr-boshi qoldig'idan boshlanadi; `StatementData.openingMinor` qo'shildi. `turnoverMinor` ATAYLAB faqat davr harakatlari (opening unga kirmaydi) |
| `…/counterparty-statement.service.ts` | `aggregate(accountId, cpId, opts: StatementAggregateOptions)` (ilgari `productId?: string`) — `from`/`to`/`productId`. Jurnal yo'li: `resolveBalanceDocs` (sanalar) → `foldJournalPeriod(dated, periodStart, lt)` → `computeStatement(raw, folded.openingMinor)`. Davr chegaralari `reportDateBounds` dan (o'z formulasi YOZILMADI). `generate()` ham `opts` qabul qiladi; Excel «Davr:» sarlavhasi endi haqiqiy davrni yozadi (`periodLabelOf`) |
| `…/counterparty-statement.schema.ts` (**yangi**) | `StatementQuerySchema` — `productId`/`dateFrom`/`dateTo` + `dateFrom <= dateTo` refine |
| `…/counterparty-statement.controller.ts` | `@Query('dateFrom')`/`@Query('dateTo')`; noto'g'ri qiymat → 400 (zod `safeParse`) |
| `…/xlsx-builder.util.ts` | `openingRow()` — ikkala varaqda («Sodda» C/F, «Batafsil» C/I) «Boshlang'ich qoldiq» qatori. Qoldiq **0** bo'lsa qator umuman chizilmaydi ⇒ davrsiz aktning ko'rinishi eski holida qoladi (mavjud 6 xlsx testi qator-raqamlarini qattiq tekshiradi — ular tegilmadi) |
| `apps/web/src/components/counterparties/akt-sverka-card.tsx` | «Davr» bloki: ikkita `type="date"` input (`cp-akt-date-from` / `cp-akt-date-to`), `dateFrom`/`dateTo` so'rov parametrlari. Davr ikkala doiraga ham (barcha savdo + buyum bo'yicha) amal qiladi |
| `apps/web/src/messages/{ru,uz}.json` | 1 yangi kalit: `pages.counterparties.akt_period` — RU **«Период»** (loyihaning o'z lug'atidan grounded: `counterparty_activity.metric_period` = «Период», `ru.json` da 10+ joyda shu qiymat), UZ «Davr». `С`/`По` uchun yangi kalit QO'SHILMADI — mavjud `common.from`/`common.to` aria-label sifatida qayta ishlatildi |

**IKKI BOSQICHLI RESOLVE (`PERF-02` ning perf qismi) — rejadan ONGLI CHEKINISH.** Reja «pozitsiyalarni
faqat product-filtr rejimida tort» deydi. To'g'ridan-to'g'ri bajarilsa to'liq aktning «Batafsil»
varag'idagi tovar qatorlari (egasining 2026-07-28 talabi: chegirma ochiq ustunda) JIMGINA yo'qolardi —
ya'ni perf tuzatishi funksiya-regressiga aylanardi. Buning o'rniga: 1-bosqich sana/raqamni
pozitsiyalarSIZ oladi (sana HAR qatorga kerak — davr aynan u bo'yicha kesiladi), 2-bosqich
pozitsiyalarni **faqat davr ichida qolgan** hujjatlar uchun oladi. Natija: bir yillik kontragentda
oylik akt endi ~12 baravar kam pozitsiya o'qiydi, ko'rinish esa aynan saqlanadi. Test (3) buni
mexanik qulflaydi.

**Davr HUJJAT sanasi bo'yicha kesiladi, `createdAt` bo'yicha EMAS** — `foldJournalPeriod` ning o'z
qoidasi (jurnal `where` da davr filtri ATAYLAB yo'q, `journal-where-shape` testi buni ushlab turadi).
Orqaga sanalgan hujjat (iyul sanasi, avgustda post qilingan) shu sabab o'z davridagi aktda qoladi —
fixture'da ataylab shunday qator bor (`su-1`).

### 3. TDD — RED jonli o'lchandi

**RED** (`vitest run src/modules/counterparty-statement`): **8 failed / 28 passed (36)**.
Yiqilish sabablari: `data.openingMinor` → `undefined`; `aggregate()` uchinchi argumentni davr sifatida
umuman tanimasdi (`opening` qatori qator bo'lib qolar, davr kesilmasdi); `TypeError: Cannot mix BigInt
and other types` (`openingMinor` yo'qligidan).

**GREEN**: `counterparty-statement` + `counterparty-balance` → **53/53** (shu jumladan Faza 10
invarianti `balance-readers-invariant.test.ts` **7/7 — o'zgarishsiz yashil**).

Yangi testlar:
- `counterparty-statement-period.test.ts` (**yangi fayl**, 5 test): (1) davr ichi qatorlar +
  davr-boshi saldo == jurnal folding'i (opening 1 250 000 = backfill 250 000 + iyun sotuvi;
  yakun 550 000; `opening + debet − kredit == yakun`); (2) davrsiz yakun == materiallashgan Σ(jurnal);
  (2b) butun tarixni qamragan davr ham o'sha yakunni beradi; (3) davr tashqarisidagi hujjat uchun
  pozitsiya so'rovi UMUMAN yuborilmaydi; (4) product-filtr rejimi regresssiz + davr SQL `moment`
  chegaralari bilan kesiladi (RAM'da emas).
- `statement-compute.util.test.ts` (**Edit**, +3 test — fayl ustidan Write QILINMADI): opening'dan
  boshlanuvchi running balans; `opening + debet − kredit == yakun`; opening berilmasa 0 (eski xulq).

### 4. Gate (jonli o'lchangan)

- `pnpm --filter @moysklad/api typecheck` → **0** · `@moysklad/web typecheck` → **0**
- `pnpm lint:product` → **0 error** (747 warning — siyosat bo'yicha ruxsat)
- `pnpm i18n:gate` → **o'tdi** (407 fayl, 12 338 kalit)
- `vitest run counterparty-statement counterparty-balance counterparty report` → **52 fayl / 528 test yashil**
- API BUTUN suite, 3 shard: **1864 + 1765 + 2075 = 5704 passed / 2 skipped** (baza 5696/2 → **+8**,
  aynan yangi testlar soni; regress YO'Q)
- Web BUTUN suite: **187 fayl / 2832 passed / 26 skipped**
- **Browser-smoke YO'Q.**

### 5. Qolgan qarz / DEFER

1. **Ko'p valyutali akt** — statement hamon `UZS` bilan cheklangan (Faza 10 qarori, o'zgartirilmadi).
   Davr o'qi valyutaga bog'liq emas, shuning uchun ko'p valyuta qo'shilganda bu ish qayta qilinmaydi.
2. **`CounterpartyStatement` jadvali davrni SAQLAMAYDI** — saqlangan aktlar ro'yxatida qaysi davr
   uchun ekani ko'rinmaydi (faqat Excel ichidagi «Davr:» sarlavhasida). Ustun qo'shish = migratsiya
   (umumiy resurs, §6.4) ⇒ ataylab qilinmadi.
3. **`take`/paginatsiya hamon YO'Q** — davrsiz akt butun jurnalni RAM'ga oladi. Davr bergan
   foydalanuvchi uchun muammo yo'q, «butun tarix» esa aktning ma'nosi bo'yicha to'liq bo'lishi kerak
   (kesish = jim yo'qolgan qator). Cheklov kerak bo'lsa — alohida qaror, o'z fazasi bilan.
4. **Davr presetlari (вч/сег/нед/мес) Excel kartochkasida YO'Q** — chop-etiladigan aktda bor
   (`metrics-create-forms.tsx`). Mayda UI qarzi.
5. **Browser-smoke YO'Q** — kontragent kartochkasi «Akt-sverka» kartochkasi (davr inputlari + hosil
   bo'lgan Excel'ning «Boshlang'ich qoldiq» qatori) Phase-2 QA cohortiga qoladi.

### Parallel sessiya sharoiti (CLAUDE.md §6)

Ish daraxtida faqat foydalanuvchining untracked fayllari bor edi (`qabullar-amallar-royxati.txt`,
`*.xlsx`, `chek.png`, `SAYT-PROMPT.txt`, `scratchpad/`) — TEGILMADI. Bu yozuv faylga
`appendFileSync` bilan qo'shildi (**marker-kesish YO'Q**, `doc-append-marker-truncation` xotirasi),
Q1–Q5 yozuvlariga TEGILMADI. `git add` faqat aniq yo'llar bilan.

**Commit:** `fix(report): faza q6 — akt-sverka davr-filtri + saldo-forward (PERF-02)`

---

## Faza Q7 — HrAttendance soft-delete + audit + yetim-jarima (`HR-13`, asl reja 29b)

**Sana:** 2026-08-09 · **Status:** ✅ BAJARILDI — **Phase-1: strukturaviy + unit-tasdiqlangan,
browser-smoke YO'Q** (CLAUDE.md §1). Runtime-QA HR cohortiga qoladi.

### 1. Da'volar HEAD kodida tasdiqlandi (CLAUDE.md §2)

Faza 29a hisobotining «◻ 29b» bloki uch band yozgan edi; uchalasi ham **o'z ko'zim bilan** qayta
tekshirildi (hisobot yozilganidan beri kod o'zgarmagan, faqat satr raqamlari siljigan):

| 29a da'vosi | HEAD dagi holat | Tasdiq |
|---|---|---|
| `HrAttendance` da soft-delete ustuni YO'Q | `schema.prisma:9319–9347` — `deletedAt`/`deletedById` yo'q (bor: `editedById`/`editedAt`) | ✔ tasdiqlandi |
| `delete()` hard-delete, auditsiz | `hr-attendance.service.ts:256–263` — `findFirst` → `hrAttendance.delete({where:{id}})`, `auditLog` chaqiruvi yo'q | ✔ tasdiqlandi |
| `HrBonusFineLog.attendanceId` xom FK ⇒ `auto_late` jarima yetim qoladi | `schema.prisma:9472` — `attendanceId String? @map("attendance_id") @db.Uuid`, `@relation`/cascade YO'Q; `@@unique([attendanceId, source])` bor | ✔ tasdiqlandi |
| `LateFineService.syncForAttendance` mexanizmi tayyor (qayta ishlatilsin) | `late-fine.service.ts:90–121` — nol-shoxda `deleteMany({attendanceId, source:'auto_late'})` | ✔ tasdiqlandi, qayta ishlatildi |

**Qo'shimcha o'lchov (grep, butun `apps/api/src`):** `hrAttendance.*` bo'yicha **23 o'quvchi** +
**4 shartli yozuv** (`updateMany`) + **1 hard-delete** topildi. RED test aynan shu 23/4/1 ni
ro'yxatladi (pastda) — ya'ni grep va test bir xil raqamga keldi.

### 2. O'zgarishlar

**(a) Migratsiya — `20260809230000_hr_attendance_soft_delete`**
`packages/db/prisma/schema.prisma` (`HrAttendance`): `deletedAt DateTime? @map("deleted_at")` +
`deletedById String? @map("deleted_by_id")`. `deletedById` — **xom FK, relation YO'Q** (ayni
modeldagi `workLocationId` naqshi): `Employee`ga yangi back-relation qo'shish sxemaning boshqa
joyiga tegishni talab qilardi, foyda esa yo'q (kim o'chirgani `auditLog.userId` da FK bilan turadi).

Lokal DB (`climart_adopt @ localhost:5432`, `_prisma_migrations`-tracked EMAS) uchun xotira
retsepti (`climart-adopt-local-db-untracked.md`, «2026-08-08 ENG SODDA YO'L»):
`prisma db execute --file …` → **«Script executed successfully»** → `prisma migrate diff
--from-schema-datasource --to-schema-datamodel --script` da `hr_attendance|deleted_at|deleted_by`
bo'yicha **0 qator** (o'z obyektlarim uchun drift 0; diff'da qolgan narsa — oldindan mavjud
`RenameIndex` shovqini, meniki emas, TEGILMADI) → `prisma generate` (99.8s).
DDL ikkala ustun ham nullable/defaultsiz ⇒ prod'da jadval qayta yozilmaydi.

**(b) `delete()` → soft-delete + audit + jarima storno**
`apps/api/src/modules/hr/attendance/hr-attendance.service.ts`:
- `findFirst({ id, accountId, deletedAt: null })` (+ `employee.name` — audit uchun snapshot);
- **bitta shartli yozuv** `updateMany({ where:{ id, accountId, deletedAt: null }, data:{ deletedAt: new Date(), deletedById } })`,
  `res.count === 0` ⇒ `NotFound` — ikki parallel o'chirish ikki audit qatori/ikki storno yozmaydi
  (loyihadagi «atomic claim» naqshi);
- `lateFine.stornoForAttendance(accountId, id)` — yetim jarima yopiladi;
- `auditLog.create({ entity:'HrAttendance', entityId:id, action:'delete', userId:deletedById,
  fieldChanges:{ employeeId, employeeName, checkInTime, checkOutTime, lateMinutes } })` — qator
  endi ro'yxatlarda ko'rinmagani uchun **tarkibi audit ichida saqlanadi**. `try/catch` (best-effort)
  — `hr-employee.service.ts:296` naqshi: audit yozuvi muvaffaqiyatli o'chirishni bekor qilmaydi.
- `hr-attendance.controller.ts`: `svc.delete(user.accountId, id, user.sub)` — «kim o'chirdi» yoziladi.

`apps/api/src/modules/hr/hr-attendance-notify/late-fine.service.ts`: yangi
`stornoForAttendance(accountId, attendanceId)` — `syncForAttendance` ning nol-shoxidan **ajratilgan**
(o'sha shox endi shuni chaqiradi, ya'ni dublikat mantiq yo'q). Farqi ataylab: storno
**konfiguratsiyani umuman o'qimaydi** — o'chirilgan davomatning jarimasi `lateFineEnabled` holatidan
qat'i nazar ketishi kerak. `where` ga `accountId` ham qo'shildi (ilgari faqat `attendanceId+source`).

**(c) `deletedAt: null` filtri — 23 o'quvchi + 4 shartli yozuv (to'liq ro'yxat)**

*O'quvchilar (23) — 12 fayl, 6 modul:*

| # | Fayl:satr | Metod |
|---|---|---|
| 1–2 | `hr/attendance/hr-attendance.service.ts:58, 73` | `findMany` — `listToday`, `report` |
| 3–7 | `hr/attendance/hr-attendance.service.ts:100, 148, 177, 201, 257` | `findFirst` — `checkIn` dublikat-guard, `checkOutByEmployee`, `checkOut`, `edit`, `delete` |
| 8 | `hr/attendance-geo/attendance-notify.service.ts:97` | `findFirst` — kunlik Telegram digest |
| 9 | `hr/attendance-geo/davomat-autocheckout.cron.ts:45` | `findMany` — tungi avto-yopish |
| 10–12 | `hr/attendance-geo/davomat-report.service.ts:79, 112, 180` | `findMany` — oylik hisobot (+eksport shu orqali), `live` tablosi, dashboard |
| 13 | `hr/attendance-geo/davomat-status.service.ts:45` | `findFirst` — xodim jonli statusi |
| 14–15 | `hr/attendance-geo/monitoring.service.ts:82, 155` | `findMany` — monitoring ro'yxati + xodim tafsiloti |
| 16–18 | `hr/attendance-geo/ping-ingest.service.ts:175, 272, 340` | `findFirst` — GPS ochiq-qator qidiruvi (3 yo'l) |
| 19 | `hr/hr-attendance-notify/attendance-notifier.service.ts:169` | `findMany` — «ishlangan vaqt» yorlig'i |
| 20 | `hr/hr-employee/employee-card.service.ts:67` | **`aggregate`** — xodim kartochkasi (oylik kechikish yig'indisi) |
| 21 | `manager/kpi/daily-kpi-drilldown.service.ts:311` | `findMany` — KPI drilldown «davomat» |
| 22 | `manager/kpi/employee-daily-kpi.service.ts:375` | `findMany` — kunlik KPI davomat-metrikasi |
| 23 | `manager/live/live-status.service.ts:167` | `findMany` — direktor jonli paneli |

*Shartli yozuvlar (4) — soft-delete qilingan qator fon-jarayonlar tomonidan yopilmasligi uchun:*
`hr-attendance.service.ts:161` (`checkOutByEmployee`) · `davomat-autocheckout.cron.ts:64` (tungi cron) ·
`ping-ingest.service.ts:219, 355` (GPS ketish).

`update({where:{id}})` chaqiruvlari (`checkOut`, `edit`) ATAYLAB tegilmadi — Prisma'da unique-`where`
talab qilinadi va ikkalasi ham allaqachon filtrlangan `findFirst` dan keyin keladi.

**Xom SQL yo'q:** `apps/api/src` da `hr_attendance` ga `$queryRaw`/`$executeRaw` chaqiruvi
umuman topilmadi (grep) ⇒ filtrsiz qolgan «ko'rinmas» o'quvchi yo'q.

**FE:** `apps/web/src/lib/hr-api.ts:348` — `remove: (id) => api.delete<{ ok: true }>(...)`.
Javob shakli **o'zgarmadi** (`{ ok: true }`) ⇒ FE tegilmadi, yangi UI-matn yo'q ⇒ i18n gate kerak emas.

### 3. Testlar (TDD — RED jonli o'lchandi)

**Yangi klass-lock:** `apps/api/src/modules/hr/attendance/hr-attendance-soft-delete-class.test.ts`
(`transition-toctou-class.test.ts` naqshi). Fayl tizimidan hosil qilingan skan: butun `apps/api/src`
bo'yicha har `hrAttendance.<o'quvchi-metod>(` chaqiruvining argument bloki qavs-balansi bilan
kesib olinadi va `deletedAt` borligi talab qilinadi. **Filtrsiz yangi o'quvchi qo'shilgan kuni
test qizaradi** — «bitta o'quvchi qolib ketdi» bug-klassiga qarshi yagona doimiy himoya.
4 tekshiruv: (1) skan buzilmagani (≥23 sayt, ≥4 modul — vakuum emas), (2) har o'quvchida filtr,
(3) har shartli yozuvda filtr, (4) daraxtda **hech qayerda hard-delete yo'q**.

**RED (o'lchandi, fix'dan OLDIN):** `14 failed | 32 passed (46)`, 3 fayl qizil.
Klass-lock aynan **23 filtrsiz o'quvchi**, **4 filtrsiz `updateMany`**, **1 hard-delete**
(`hr-attendance.service.ts:261`) ro'yxatini chiqardi — grep bilan olingan raqam bilan mos.
Qolgan qizillar: `stornoForAttendance is not a function` (3), `delete` soft emas edi (5),
`listToday/report/checkIn` filtrsiz (3).

**GREEN (fix'dan keyin, o'sha uchta fayl):** `46 passed (46)` — 0 qizil.

Reja so'ragan 3 stsenariy + qo'shimchalar: soft-delete + `deletedById` · audit qatori (kim/nima) ·
`auto_late` storno · `NotFound` (allaqachon o'chirilgan) · poyga yutqazilsa (`count 0`) audit ham
storno ham YO'Q · `delete/listToday/report/checkIn` da `deletedAt: null` · `stornoForAttendance`
faqat `auto_late` ga tegadi / konfiguratsiyani o'qimaydi / idempotent.

### 4. Gate (jonli, hammasi shu sessiyada yugurtirildi)

| Gate | Natija |
|---|---|
| `pnpm --filter @moysklad/api typecheck` | **0 xato** |
| `pnpm --filter @moysklad/db typecheck` | **0 xato** |
| `pnpm lint:product` | **0 error** (747 warning — siyosat bo'yicha ruxsat). Birinchi yugurishda 1 `format` xatosi chiqdi (`attendance-notify.service.ts`) → `biome format --write` bilan tuzatildi. |
| `vitest run src/modules/hr src/modules/manager` | **102 fayl / 1097 test yashil** |
| To'liq suite, 3 shard | 1/3: **1876** · 2/3: **1779** · 3/3: **2064 (+2 skipped)** ⇒ **jami 5719 passed / 2 skipped** |

Baza Q6 dan keyin **5704 passed / 2 skipped** edi ⇒ **+15 test**, regress **0**.

### 5. Qolgan qarz / DEFER

1. **🔴 PROD DDL (deploy-bloker)** — `hr_attendance.deleted_at` + `hr_attendance.deleted_by_id`
   OPS-QADAMLAR 5-bandiga qo'shildi. Prod (`sherset_v2`) sxema-drift tufayli `migrate deploy`
   ishlamaydi ⇒ qo'lda `prisma db execute --file`. **Busiz deploydan keyin HR davomat
   endpointlari (`/hr/attendance/*`, monitoring, KPI, jonli panel) darhol yiqiladi** — ustunlar
   endi HAR o'quvchining `where` ida.
2. **Tarixiy yetim jarimalar tozalanmadi** — bu fazadan OLDIN hard-delete qilingan davomatlarning
   `auto_late` jarimalari prod'da hamon `HrBonusFineLog` da (mavjud bo'lmagan `attendance_id` ga
   ishora qiladi) va oylikdan pul ushlab turibdi. Kod ularni yechmaydi (retroaktiv emas).
   Retsept: `DELETE FROM hr_bonus_fine_log l WHERE l.source='auto_late' AND l.attendance_id IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM hr_attendance a WHERE a.id = l.attendance_id);` — avval `SELECT`
   bilan o'lchash, keyin foydalanuvchi qarori bilan. Ops-sessiya ishi, kod fazasi emas.
3. **O'chirilgan qatorlarni ko'rish/tiklash UI YO'Q** — `deletedAt` faqat filtr sifatida ishlaydi;
   «savatcha» ekrani yoki `restore()` endpointi yozilmadi (reja so'ramagan). Audit jurnalidan
   (`entity='HrAttendance'`) kim/qachon ko'rinadi.
4. **`HrBonusFineLog.attendanceId` hamon xom FK** — cascade/relation qo'shilmadi (yana migratsiya +
   mavjud yetim qatorlar tufayli FK yaratilmasligi mumkin). Yetimlik endi *kod* darajasida
   yopiq (`delete()` storno qiladi), *DB* darajasida emas.
5. **Indeks qo'shilmadi** — o'quvchilar mavjud `(account_id, employee_id, check_in_time DESC)`
   indeksidan foydalanadi, `deleted_at IS NULL` esa filtr sifatida qo'llanadi. Davomat jadvali
   kichik; partial indeks kerak bo'lsa — o'lchovdan keyin, alohida qaror.
6. **Browser-smoke YO'Q** — HR davomat sahifasi (o'chirish tugmasi → qator ro'yxatdan ketadimi,
   oylik hisobot/eksport/monitoring o'zgardimi) Phase-2 QA cohortiga qoladi.

### Parallel sessiya sharoiti (CLAUDE.md §6)

Ish daraxtida faqat foydalanuvchining o'z fayllari bor edi (`todo.md` (M), `qabullar-amallar-royxati.txt`,
`*.xlsx`, `chek.png`, `SAYT-PROMPT.txt`, `docs/REJA-8-BOLIM-2026-08.md`, `docs/audits/…`,
`scratchpad/`) — HECH BIRIGA TEGILMADI, `git add` faqat aniq yo'llar bilan. Migratsiya (§6.4 umumiy
resurs) yolg'iz sessiyada qo'llandi. Bu yozuv faylga **append** bilan qo'shildi —
**marker-kesish YO'Q** (`doc-append-marker-truncation` xotirasi), Q1–Q6 yozuvlariga TEGILMADI.

**Commit:** `fix(hr): faza q7 — hrattendance soft-delete + audit + jarima storno (HR-13)`

---

## Faza Q8 — Tarixiy kurs: qolgan 8 davr-oqim hisoboti (`M-11`) (2026-08-09) — **Phase-1: strukturaviy + unit-tasdiqlangan, browser-smoke YO'Q**

**Manba:** Faza 17 hisoboti DEFER-1. Mexanizm yangidan YOZILMADI — Faza 17 ning
`consolidateToBase(amount, code, ctx, tally, docRateValue?)` 5-argumenti va uning
**identity-qo'riqchisi** (`report-rate-ctx.util.ts:103-112`) o'zgarishsiz qayta ishlatildi;
bu faza faqat `rate_value` ni har hisobotning guruh-kalitiga olib borib, argument sifatida uzatadi.
Namuna: `pnl.service.ts` + `cash-flow.service.ts`.

### Da'volarni kodda tasdiqlash (§2) — 8/8 HAQIQIY

Rejadagi ro'yxat 2026-08-09 holatida hamon to'g'ri: sakkizala servis ham `consolidateToBase` ni
**5-argumentsiz** chaqirardi, ya'ni har biri Currency jadvalining BUGUNGI kursida konsolidatsiya
qilardi ⇒ kurs qimirlaganda yopilgan davr qayta yozilardi. Grep bilan tekshirilgan chaqiruv o'rinlari
(fix'dan oldingi qator raqamlari): `profitability` 476/486/842/852 · `sales-by-channel` 150 ·
`sales-by-hour` 120 · `average-basket` 145 · `unit-economics` 181 · `purchase-management` 195-198 ·
`warehouse-ops` 117/123 · `report.service` 279/280/287/408/421/422/483/494/500/600.
**«Konvertatsiya qilmaydi, tegilmadi»** toifasiga tushgan hisobot BO'LMADI — hammasi ko'p-valyutali
konsolidatsiya qilardi. Sxema tomoni ham tasdiqlandi: `Demand`, `SalesReturn`, `Supply`,
`PurchaseOrder` (va yana 29 hujjat modeli) `rate_value BigInt @default(100000000)` saqlaydi.

**TEGILMAGAN (ataylab, rejaning o'z qoidasi):** `aging` va `counterparty-balance` — ular ochiq
qoldiqni **bugungi** kursda revalyatsiya qiladi (Faza 17 qarori). Kod o'zgarmadi.

**Bitta ichki shox TEGILMADI (o'lchangan, ko'r-ko'rona emas):** `profitability.queryRetailSales`
SQL'i `'UZS' AS currency` ni **qattiq yozadi** (chakana hamisha baza valyutada) ⇒
`consolidateToBase` u yerda identity qaytaradi, konvertatsiya umuman bo'lmaydi, demak muzlatilgan
kursning ma'nosi yo'q. Kodda izoh qoldirildi (chakana valyutasi ochilsa `rs.rate_value` qo'shiladi).

### O'zgarishlar (7 servis + 1 Prisma-groupBy servis)

| Fayl | O'zgarish |
|---|---|
| `report/sales-by-channel.service.ts` | `Row.rate_value`; SELECT + `GROUP BY … d.currency, d.rate_value`; revenue → 5-argument |
| `report/sales-by-hour.service.ts` | shu naqsh (`GROUP BY hour, d.currency, d.rate_value`) |
| `report/average-basket.service.ts` | shu naqsh, `$queryRawUnsafe` pozitsion so'rovida (`GROUP BY bucket, d.currency, d.rate_value`) |
| `report/unit-economics.service.ts` | qator endi (product, currency, **rate_value**); revenue → 5-argument (COGS baza, tegilmadi) |
| `report/purchase-management.service.ts` | `po.rate_value` kalitga; **to'rtala** pul ustuni (ordered/received/invoiced/payed) bitta `docRate` bilan |
| `report/warehouse-ops.service.ts` | Prisma `groupBy(['currency'])` → `groupBy(['currency','rateValue'])` — Supply (kirim) va Demand (chiqim) |
| `report/profitability.service.ts` | 4 o'rin: agregat demand + agregat return + chart `salesBuckets` + chart `returnBuckets`; `SalesRow.rate_value?` (retail shoxi uchun ixtiyoriy) |
| `report/report.service.ts` | **uchala mexanizm**: `$queryRaw` totals (demands + sales_returns), `groupByDate` (demands + sales_returns), Prisma `groupByFk` (`by:[fk,'currency','rateValue']`), `groupByProduct` (`d.rate_value`) |

Javob shakliga **yangi maydon qo'shilmadi** (`unconvertedByCurrency` allaqachon Faza 17'da bor) ⇒
FE iste'molchilari tegilmadi, web build'iga ta'sir yo'q.

### TDD — RED jonli o'lchandi

Avval 29 test yozildi (8 fayl), **RED: `20 failed / 342 passed` (362)**, 8 test fayli qizil.
Fix'dan keyin **`362 passed` (38 fayl), 0 failed**.
> Qizil bo'lmagan 9 test — ataylab **negativ-nazorat**: identity-qo'riqchi testlari (`rate_value = 1e8`
> ⇒ joriy kontekst kursi) fix'dan OLDIN ham yashil bo'lishi SHART, aks holda qo'riqchi ishlamayapti
> degani. Ular fix'dan keyin ham yashil qoldi ⇒ o'zgarish mavjud (default-kursli) qatorlar uchun
> bayt-ma-bayt neytral.

Har hisobot uchun bir xil uchlik: (a) **hujjat o'z kursida** baholanadi (11 000, joriy 12 000 EMAS);
(b) **davr barqarorligi** — joriy kurs 12 000 → 15 000 bo'lganda o'tgan davr natijasi O'ZGARMAYDI;
(c) **identity-qo'riqchi** — `rate_value = 1e8` bo'lgan USD hujjat joriy kontekst kursiga tushadi
(120 000 000). Qo'shimcha: `profitability` — qaytarish o'z kursida (netto foyda); `report.service` —
FK-fold va product-fold alohida; `warehouse-ops` — chiqim (Demand) tomoni ham.

| Test fayli | Holat | Yangi testlar |
|---|---|---|
| `sales-by-channel.service.test.ts` | Edit (append) | +3 |
| `sales-by-hour.service.test.ts` | Edit (append) | +3 |
| `average-basket.service.test.ts` | Edit (append) | +3 |
| `unit-economics.service.test.ts` | Edit (append) | +3 |
| `purchase-management.service.test.ts` | Edit (append) | +3 |
| `profitability.service.test.ts` | Edit (append) | +4 |
| `report.service.test.ts` | Edit (append) | +5 |
| `warehouse-ops.service.test.ts` | **YANGI fayl** | +5 (1 ko'p-valyuta bazasi + 4 M-11) |

Mavjud test-fayllar ustidan **Write QILINMADI** — faqat oxiriga append
(`never-write-over-existing-test-file` xotirasi); har faylning qator soni append oldidan/keyin
o'lchandi (115→177, 74→118, 68→124, 114→156, 109→162, 372→476, 147→302).

### Gate (jonli o'lchangan)

- `pnpm --filter @moysklad/api typecheck` → **0 xato**
- `pnpm lint:product` → **0 error** (747 warning — siyosat bo'yicha ruxsat)
- `vitest run report + analitika + money + currency` → **555/555 yashil** (59 fayl)
- Regress, 3 shard (`--shard=N/3 --reporter=dot`): **1884 + 1789 + 2075 = 5748 passed / 2 skipped**
  (Faza Q7 bazasi 5704+ dan yuqori; yangi 29 testni ayirsak 5719 — regress YO'Q)
- Web tegilmadi (javob shakli o'zgarmadi) ⇒ `@moysklad/web` typecheck kerak emas. `i18n:gate` —
  UI-matn tegilmadi. Migratsiya YO'Q (sxemaga tegilmadi; `rate_value` ustunlari allaqachon bor).

### Qolgan qarz / DEFER

1. **`dashboard.service.ts` (4 o'rin: 745, 852, 931-932) hamon joriy kursda** — rejadagi 8 nishon
   ro'yxatiga kirmagan, shuning uchun bu fazada TEGILMADI. `money-chart` va org-balans vidjetlari
   davr-oqim xarakterida ⇒ ehtimol keyingi faza ishi; balans-tipidagilari esa `counterparty-balance`
   bilan bir toifada (ataylab joriy kurs) bo'lishi mumkin — **qaror qabul qilinmagan, o'lchash kerak**.
2. **`aging` + `counterparty-balance`** — ataylab joriy kursda (revalyatsiya); o'zgarmadi.
3. **`profitability` chakana shoxi** `'UZS'` ga qattiq bog'langan — chakana valyutasi ochilganda
   `rs.rate_value` qo'shilishi kerak (kodda izoh bor).
4. **Tarixiy ma'lumot uchun ta'sir hozircha NOL** — mavjud qatorlarning deyarli hammasi
   `rate_value = 1e8` (default) ⇒ identity-qo'riqchi ularni joriy kontekstga yuboradi. Haqiqiy
   tarixiy-kurs xulqi faqat hujjatlarda kurs muzlatila boshlagach ko'rinadi (bu — hujjat-yozish
   tomonining qarzi, hisobot tomoniniki emas).
5. **`M-13`** (ikki konvertor yaxlitlash farqi) — Faza 16'dan qolgan, hamon ochiq.
6. **`unconvertedByCurrency` FE'da ko'rsatilmaydi** — Faza Q16 ishi (bu fazada ATAYLAB tegilmadi).
7. **Browser-smoke YO'Q** — real ma'lumotda 8 hisobotning davr-barqarorligi Phase-2 QA cohortiga.

### Parallel sessiya sharoiti (CLAUDE.md §6)

Daraxtda foydalanuvchining o'z fayllari bor edi (`todo.md` (M), `docs/REJA-8-BOLIM-2026-08.md`,
`qabullar-amallar-royxati.txt`, `*.xlsx`, `chek.png`, `SAYT-PROMPT.txt`, `docs/audits/…`,
`scratchpad/`) — HECH BIRIGA TEGILMADI, `git add` faqat aniq yo'llar bilan. Bu yozuv faylga
**append** bilan qo'shildi — **marker-kesish YO'Q** (`doc-append-marker-truncation` xotirasi),
Q1–Q7 yozuvlariga TEGILMADI.

**Commit:** `fix(report): faza q8 — tarixiy kurs qolgan davr-oqim hisobotlarida (M-11)`

---

## Faza Q9 — Bank-import: crash-oyna tx + INN SQL-lookup (`INT-05`, `DB-05`) (2026-08-09) — **Phase-1: strukturaviy + unit-tasdiqlangan, browser-smoke YO'Q**

### 1. Da'volarni HEAD kodida tasdiqlash (reja §2)

Ikkala DEFER ham **TASDIQLANDI** — hisobotlar 2026-08-08/09 dan, lekin kod o'shandan beri
o'zgarmagan (satr raqamlari surildi, mazmun bir xil):

| Manba | Da'vo | HEAD'dagi dalil | Holat |
|---|---|---|---|
| Faza 20 DEFER-1 | `paymentIn.create` va `bankStatementRow.update({paymentInId})` — ikki alohida yozuv, oradagi crash yetim to'lov qoldiradi | `bank-import.service.ts:254` create → `:269` update (`in`), `:275`→`:288` (`out`); orada hech qanday tranzaksiya yo'q | ✅ |
| Faza 25 DEFER-2 | `buildMatchMap` butun kontragent jadvalini RAM'ga yuklab JS'da solishtiradi | `bank-import.service.ts:438` `counterparty.findMany({ accountId, archived: false })` + `:446-462` JS sikli | ✅ |

**🔴 Bitta da'vo ANIQLASHTIRILDI (manba-hisobot noaniq yozgan edi).** Faza 20 va reja ikkalasi ham
«`PaymentInService.create` **hozir o'z tranzaksiyasini ochadi**» deydi. Bu **NOTO'G'RI**: HEAD'da
`create` hech qanday `$transaction` ochmaydi — u `this.prisma.client` ustida **ketma-ket mustaqil
yozuv/o'qishlar** qiladi (ref-tekshiruvlar → `allocateDocumentNumber` → `paymentIn.create` (nested
`operations` bilan) → `logAudit`). Ya'ni crash-oynasi hisobotda yozilganidan **kengroq** edi:
raqam allokatsiyasi bilan hujjat yozuvi orasida ham, hujjat bilan audit orasida ham. Fix shu
sababdan «mavjud tx'ni tashqariga chiqarish» emas, **butun `create`ni bitta tranzaksiyaga
sig'dira oladigan qilish** bo'ldi.

### 2. O'zgarishlar

| Fayl | O'zgarish |
|---|---|
| `apps/api/src/modules/payment-in/payment-in.service.ts` | `create(accountId, userId, raw, **tx?**)` — ixtiyoriy tashqi tranzaksiya. Ichida `const db = tx ?? this.prisma.client` va HAMMA yozuv `db` orqali: `ensureRefs`, `assertOrgAccountMatchesOrg`, `ensureOperations`, `nextPaymentName` (`allocateDocumentNumber` + seed), `group.findFirst`, `paymentIn.create`, `logAudit`. Yordamchilarga `db` **default-parametr** bilan qo'shildi ⇒ mavjud chaqiruvlar va testlar o'zgarmadi |
| `apps/api/src/modules/payment-out/payment-out.service.ts` | Aynan shu simlash (`create(..., tx?)`) — bank-import `commit()` ikkala yo'nalishni ham shu sikldan yuritadi, `out` shoxida crash-oynasi bir xil edi |
| `apps/api/src/modules/shared/group-stamp.ts` | `resolveCreatorGroupId(db: PrismaClient)` → `db: Pick<PrismaClient, 'employee'>`. Faqat kengaytirish (barcha mavjud chaqiruvchilar mos); ilgari `TransactionClient` uzatib bo'lmasdi |
| `apps/api/src/modules/bank-import/bank-import.service.ts` | (a) `commit()` sikli: to'lov + qator-bog'lash **bitta `$transaction`** (`COMMIT_TX_OPTS = { timeout: 15_000 }`); `create` `undefined` qaytarsa `NO_RECORD_ERROR` sentinel bilan **rollback**. (b) `buildMatchMap` → **raw SQL lookup** (`Prisma.sql`), `import type { Prisma }` → `import { Prisma }`. (c) Fayl boshidagi «QOLDIQ XAVF» doc-bloki yangilandi |
| `packages/db/prisma/schema.prisma` | `Counterparty` ga `@@index([accountId, code])` (+ izoh: ikkita hamroh EXPRESSION indeks faqat migratsiya faylida yashaydi) |
| `packages/db/prisma/migrations/20260809235000_bank_import_inn_lookup_indexes/migration.sql` | **YANGI** — 3 ta `CREATE INDEX IF NOT EXISTS` |
| `apps/api/src/modules/bank-import/bank-import.service.test.ts` | 11 → **20** test (Edit, Write EMAS) |
| `apps/api/src/modules/payment-in/payment-in.service.test.ts` | 3 → **5** test (Edit) |

#### (a) Crash-oyna — nima aynan yopildi

```
OLDIN:  claim -> [paymentIn.create OK] --- X jarayon o'ldi --- update({paymentInId}) X
        => yetim to'lov: dedup (findImportedTwin) uni topa olmaydi => TTL'dan keyin IKKINCHI to'lov

KEYIN:  claim -> $transaction{ paymentIn.create(..., tx) ; tx.bankStatementRow.update }
        => ikkisi bitta commit; oraliqdagi har qanday o'lim TO'LIQ rollback
```

**Ataylab tashqarida qolgan uch narsa** (halol qayd):

1. **`claimRow` / `releaseClaim` tranzaksiyadan TASHQARIDA.** Claim — ish-taqsimoti belgisi, poyga
   qulfi; uni tx ichiga kiritsak rollback claim'ni ham qaytarib, ikki parallel commit yana bir
   qatorga kirishi mumkin bo'lardi. Xatoda claim eski holicha bo'shatiladi.
2. **`webhookFire.fireForEvent`** — fire-and-forget, o'z ulanishida yozadi. Tashqi tx rollback
   bo'lsa mavjud bo'lmagan hujjat haqida webhook navbatga tushishi mumkin (best-effort quyi tizim;
   hujjat yozuvini bloklamaydi). Doc-blokda yozildi.
3. **Izolyatsiya darajasi DEFAULT** (`ReadCommitted`), `MONEY_TX_OPTS`ning `Serializable`i EMAS:
   poyga-himoyasi allaqachon shartli `updateMany` claim'ida, `Serializable` qo'shimcha kafolat
   bermay faqat 40001-abort xavfini olib kelardi. `timeout` esa pul-oilasi bilan bir xil — 15s.

#### (b) INN SQL-lookup + expression-indekslar

Yangi so'rov (servisdagi matn bilan **belgi-ma-belgi** bir xil ifodalar):

```sql
SELECT id, (uz_requisites #>> '{inn}'::text[]) AS inn,
           (uz_requisites #>> '{account}'::text[]) AS acct, code
FROM counterparties
WHERE account_id = $1::uuid AND archived = false
  AND (  (uz_requisites #>> '{inn}'::text[])     = ANY($2::text[])
      OR (uz_requisites #>> '{account}'::text[]) = ANY($3::text[])
      OR code                                    = ANY($2::text[]) )
```

⚠️ `expression-index-must-match-prisma-sql` sabog'i qo'llandi: `->>` YOZILMADI (Postgres uchun bu
**boshqa funksiya**; Faza 25 aynan shu xatoni tutgan). Bu yerda so'rov raw bo'lgani uchun ifodani
biz to'liq boshqaramiz — indeks bilan matn ayni bir xil yozildi, va **unit-test SQL matnini
qulflaydi** (`expect(sql).not.toContain('->>')`).

**Uchala indeks ham KERAK** (bu fazaning asosiy o'lchov-topilmasi): OR-shoxlaridan bittasi
indekssiz qolsa planner butun so'rovni **Seq Scan** qiladi va INN indeksi umuman ishlatilmaydi —
ya'ni «faqat INN indeksi» yechimi Faza 25 DEFER'idagi «yarim yopildi» holatini takrorlagan bo'lardi.

**Ikki-o'tishli map qurish:** haqiqiy rekvizit-INN endi har doim `code`-fallback'dan ustun (bir
o'tishda natija SQL qaytargan qator tartibiga bog'lanib qolardi).

### 3. Testlar — RED to GREEN (jonli o'lchangan)

**`bank-import.service.test.ts`** — mock'lar HAQIQIY semantikaga keltirildi: `$transaction` endi
**jurnal** bilan ishlaydi (callback ichidagi yozuvlar faqat callback muvaffaqiyatli tugagach
qo'llanadi ⇒ throw = ROLLBACK); to'lov-yaratuvchi mock `tx` berilsa jurnalga, berilmasa darhol
yozadi (Faza Q9'gacha bo'lgan xulq). `vi.fn(async (fn) => fn(client))` mock'i bug'ni **ko'rsata
olmasdi** — unda rollback bo'lmaydi.

| # | Test | RED sababi |
|---|---|---|
| 1 | bog'lash yozuvi paytida yiqilsa NA to'lov, NA bog'lanish qoladi (**in**) | fix'dan oldin to'lov allaqachon commit bo'lgan ⇒ `committedPayments = ['pi-1']` |
| 2 | xuddi shu — **out** yo'nalishi | ✔ |
| 3 | create+link BITTA tranzaksiyada; `create` 4-argument sifatida tx oladi | `$transaction` umuman chaqirilmasdi |
| 4 | PaymentOut yo'nalishi ham tx oladi | ✔ |
| 5 | mavjud «still imports the row» — bog'lash endi **tx mijozida** | bazaviy `client...update`da edi |
| 6-10 | INN SQL-lookup: inn / hisob / `code` bo'yicha topish · SQL-matn qulfi (`#>>` bor, `->>` yo'q) · ko'rsatma bo'lmasa SQL umuman yuborilmaydi | `$queryRaw` chaqirilmasdi, `findMany` chaqirilardi |

O'lchangan: `vitest run bank-import.service.test.ts` → **9 failed / 11 passed (20)** → fix'dan keyin
**20 passed (20)**.

**`payment-in.service.test.ts`** — `create(..., tx)` shartnomasi (prop-drop bug-klassiga qarshi:
typecheck `db`ni ishlatmasdan ham yashil qoladi). Probe ikki bir xil soxta mijoz beradi (`base`/`tx`)
va HAR chaqiruvni yorliqlaydi:

- «tx berilganda hujjat, raqam-hisoblagich va audit AYNAN tx'da» + **`base:` prefiksli chaqiruvlar 0 ta**
- «tx berilmasa hammasi bazaviy mijozda» (eski chaqiruvchilar buzilmaydi)

RED **jonli o'lchandi**: `create`dagi `tx ?? this.prisma.client` vaqtincha neytrallashtirilib
(`(tx && false) || ...`) yugurtirildi → **1 failed / 4 passed**; qaytarilgach → **5 passed**.

**EXPLAIN RED→GREEN (jonli, `climart_adopt @ localhost:5432`, PG18).** 30 000 sintetik kontragent
tranzaksiya ichida yaratildi → `ANALYZE` → `EXPLAIN (ANALYZE, BUFFERS)` → **`ROLLBACK`**
(o'lchovdan keyin `count(*)` = 5, ya'ni DB'da **iz qolmadi**). Planner sozlamalari **DEFAULT** —
hech narsa o'chirilmadi. Probe skripti bir martalik edi, o'lchovdan keyin **o'chirildi**.

| so'rov | OLDIN (indekssiz) | KEYIN |
|---|---|---|
| `buildMatchMap` to'liq so'rovi (3 shoxli OR) | **`Seq Scan`**, 30 004 qator filtrlandi, `Buffers: shared hit=804`, **19.854 ms** | **`BitmapOr`** → 3 ta `Bitmap Index Scan` (`counterparties_inn_expr_idx`, `counterparties_bank_account_expr_idx`, `counterparties_account_id_code_idx`), `Buffers: shared hit=8`, **0.102 ms** |
| faqat INN predikati | `Bitmap Index Scan` on **`counterparties_inn_trgm_idx`** (cost 596.52, 168 buffer, 3.624 ms) — GIN trgm tenglikni *qoplaydi*, lekin qimmat | **`Index Scan using counterparties_inn_expr_idx`** (cost 8.30, 3 buffer, **0.025 ms**) |

Ya'ni ~**195×** (19.854 → 0.102 ms) va **100× kamroq buffer**. Trgm GIN indeksi (Faza 25) o'rnini
bosmaydi — u `LIKE '%...%'` uchun.

### 4. Migratsiya

- `20260809235000_bank_import_inn_lookup_indexes/migration.sql` — 3 ta `CREATE INDEX IF NOT EXISTS`.
- Lokal DB `_prisma_migrations`-tracked emas ⇒ `prisma db execute --file` bilan qo'llandi
  («Script executed successfully»); **ikkinchi marta** yugurtirildi → yana muvaffaqiyatli =
  **idempotent**.
- `prisma migrate diff --from-schema-datasource --to-schema-datamodel --script` → chiqishda
  **`counterpart` so'zi 0 marta**; qolgan 9 ta `RENAME INDEX` mening ishimdan OLDIN ham bor edi
  (Faza 25 hisobotida ham qayd etilgan) — **yangi drift YO'Q**. Expression indekslarni Prisma
  introspection umuman ko'rmaydi ⇒ `DROP` ham chiqarmaydi.
- `prisma generate` → OK.
- **OPS-QADAMLAR 5-bandiga qo'shildi** (prod `sherset_v2`da qo'lda qo'llanadi).

### 5. Gate (jonli o'lchangan)

- `pnpm --filter @moysklad/api typecheck` → **0** · `@moysklad/db typecheck` → **0**
- `pnpm lint:product` → **0 error** (747 warning — siyosat bo'yicha ruxsat)
- `vitest run bank-import payment-in payment-out payment-gateway counterparty` → **351/351**
  (jumladan `payment-gateway.service.test.ts` **12/12** — Faza 19 chaqiruvchisi buzilmadi)
- Butun API suite **3 shardda** (`--reporter=dot`): 1884 + 1791 + 2084 = **5759 passed / 2 skipped**,
  435 fayl. Baza (Faza Q8) **5748 / 2** ⇒ **+11** (aynan yangi testlar soni), **regress 0**.
- `i18n:gate` yugurtilmadi — UI-matn tegilmadi (0 `.tsx`, 0 `messages/*.json` o'zgarishi).
- **Browser-smoke YO'Q.**

### 6. 🟠 Qolgan qarz / DEFER

1. **⛔ Partial unique index HAMON QO'YILMADI — ATAYLAB.** `bank_statement_rows` uchun
   `(account_id, direction, moment, amount_minor, document_number)` bo'yicha partial unique
   indeks ikki HAR XIL vypiskadan parallel commit oynasini (row-claim qoplamaydigan yagona
   qolgan poyga) to'liq yopardi, lekin prod dublikatlari **hali o'lchanmagan** (OPS-4) —
   indeks migratsiyasi prodda **yiqilardi**. Tartib o'zgarmaydi: avval o'lchash/tozalash,
   keyin indeks. Faza 20 hisobotidagi o'lchash SQL'i o'z kuchida.
2. **Ikki HAR XIL vypiskadan parallel commit** — shu sababdan ochiq qoladi: `findImportedTwin()`
   o'qishdir, qulf emas. Ehtimollik past (bir vaqtda ikki operator ikki faylni commit qilishi),
   oqibat — dublikat to'lov.
3. **Webhook yetim navbat** (yuqorida): tashqi tx rollback bo'lsa `paymentin/paymentout CREATE`
   webhook'i mavjud bo'lmagan hujjat uchun navbatga tushishi mumkin. To'g'ri yechim — outbox'ni
   tx ICHIGA ko'chirish (`outbox-exclusive-claim-lease` xotirasidagi naqsh), bu alohida ish.
4. **`assertMassEditRefsInTenant` / `attrs.validateAndNormalize` tx'dan tashqarida** — ikkalasi ham
   faqat O'QIYDI (tenant-validatsiya), yozuv qilmaydi, shuning uchun atomiklikka ta'sir qilmaydi.
   Bank-import ularni umuman ishga tushirmaydi (`ownerId`/`groupId` uzatmaydi).
5. **Hujjat-raqami tx ichida allokatsiya qilinadi** ⇒ `document_sequences` qatorining qulfi endi
   butun tranzaksiya davomida ushlanadi (~ms). Ketma-ket commit sikli uchun muammo emas; ammo
   parallel bank-import commit'lari o'sha akkauntda **seriyalanadi** (deadlock emas — qulf tartibi
   bir xil). Rollback raqamni qaytaradi (gap qolmaydi) — eski xulqdan farq, lekin yaxshi tomonga.
6. **Boshqa `PaymentInService.create` chaqiruvchilari `tx` UZATMAYDI** (`createFromInvoiceOut`,
   `payment-gateway.service.ts:651`) — ular uchun xulq **bit-ma-bit eski**. Gateway capture'ining
   o'z crash-oynasi (`gateway-capture-payment-in-draft` xotirasi) bu fazada **ataylab** tegilmadi:
   scope bank-import.
7. **`organizations` jadvalidagi bir xil INN-filtri** (Faza 25 DEFER-3) hamon indekssiz — jadval
   o'nlab qatorli, foyda yo'q.
8. **O'lchov sintetik.** 30k qatorda INN/hisob qiymatlari bir xil naqshda generatsiya qilingan;
   prod statistikasida planner boshqacha qaror qilishi mumkin (Faza 25 DEFER-1 dagi barcode
   sabog'i). Plan **shakli** (BitmapOr + 3 index scan) esa ifoda mosligining to'g'ridan-to'g'ri
   dalili.
9. **Browser-smoke YO'Q** — bank-import commit oqimi (dublikat ogohlantirishi, `failed` ro'yxati,
   ikki tabdan parallel commit) Phase-2 QA cohortida ko'riladi.

### 7. Git gigienasi (CLAUDE.md §6)

Daraxtda menikimas o'zgarishlar bor edi — `todo.md` (modified), `docs/REJA-8-BOLIM-2026-08.md`
(untracked) va foydalanuvchining untracked fayllari (`qabullar-amallar-royxati.txt`, `*.xlsx`,
`chek.png`, `SAYT-PROMPT.txt`, `docs/audits/...`, `scratchpad/`) — **HECH BIRIGA TEGILMADI**,
`git add` faqat aniq yo'llar bilan. Bir martalik EXPLAIN-probe skripti (`scripts/probe-q9-...`)
o'lchovdan keyin **o'chirildi** — repoga kirmaydi. Bu yozuv faylga **append** bilan qo'shildi —
**marker-kesish YO'Q** (`doc-append-marker-truncation` xotirasi), Q1-Q8 yozuvlariga TEGILMADI.

**Commit:** `fix(bank-import): faza q9 — create+link bitta tx + inn sql-lookup (INT-05, DB-05)`

---

## Faza Q10 — Guard-siz kontrollerlar: haqiqiy teshiklar paketi (`AUTH-07`) (2026-08-09) — **Phase-1: strukturaviy + unit-tasdiqlangan, browser-smoke YO'Q**

### 1. Da'volarni kodda tasdiqlash (reja §2) — Faza 23 ro'yxati QISMAN eskirgan

Faza 23 hisoboti «61 handler / 23 controller» degan edi. **O'z skanerim bilan qayta o'lchandi**
(`apps/api/src/modules/**/*.controller.ts` — har `@Post/@Put/@Patch/@Delete` dekorator bloki):
**875 mutatsiya-handler, shundan 56 tasi guard-siz** (ruxsat metadatasi ham, HR-RBAC ham,
rol-guard ham yo'q). Farq (61 → 56) — oraliqda yopilgan/o'chgan handlerlar; ro'yxat qayta yig'ildi,
Faza 23 raqami ko'r-ko'rona olinmadi.

**Nishonlar bo'yicha ground-truth (har biri kodda o'z ko'zim bilan):**

| Faza 23 nishoni | Haqiqiy holat (2026-08-09, o'lchangan) |
|---|---|
| `sklad-keeper` PUT / · PUT receipt-printer · DELETE :skladNo | **OCHIQ edi** — faqat `JwtAuthGuard` (kodning o'z kommentida tan olingan: «no fine-grained permission entity yet») → **YOPILDI** |
| `shift-schedule` POST/PATCH/DELETE | **OCHIQ edi** → **YOPILDI** |
| `smena` POST/PATCH/DELETE + `POST open-session` | **OCHIQ edi** → **YOPILDI** (open-session ayniqsa: `CashierSessionController#open` `cashiersession.create` talab qiladi, bu esa **o'sha sessiyani ruxsatsiz ochadigan ikkinchi eshik** edi) |
| `debt.controller` `POST pos/pay` (**pul**) | **OCHIQ edi** → **YOPILDI** (`debtpayment.create`) |
| `driver-cash` `collect`/`hand-over`/`cancel` | **ALLAQACHON YOPIQ** — `hand-over` va `cancel` da handler-darajasida `@UseGuards(DispatcherGuard)`; `collect` esa self-scope (`driverId` **tanadan emas, `user.sub` dan**). TEGILMADI |
| `restock-task` (3 handler) | `from-sales-return` **OCHIQ edi** → **YOPILDI** (`salesreturn.update`); `confirmLine`/`confirmScan` → **DEFER** (pastda §5) |
| `pick-list` `sync`/`pick-state`/`printed` | `sync` **OCHIQ edi** → **YOPILDI** (`settings.update`); qolgan ikkisi → **DEFER** (§5) |
| `hr/attendance-geo/ping.controller` — «boshqa xodim nomidan ping yozish mumkinmi?» | **MUMKIN EMAS, tasdiqlandi.** To'rtala handler `user.sub` ni uzatadi (`ping.controller.ts:23,33,39,45`) va `PingSchema` (`attendance-geo.schema.ts:5-9`) faqat `lat/lng/accuracy` — **`employeeId` maydoni umuman YO'Q**, ya'ni tanadan boshqa xodimni ko'rsatishning yo'li yo'q. TEGILMADI |
| `work-location` | **ALLAQACHON YOPIQ** — `@UseGuards(JwtAuthGuard, HrPermissionGuard)` + har mutatsiyada `@RequireHrPermission('employees','full')`. Faza 23 ro'yxati shu bandda ESKIRGAN. TEGILMADI |
| `driver-trip` | **ALLAQACHON YOPIQ** — klass darajasida `@UseGuards(JwtAuthGuard, DispatcherGuard)`. TEGILMADI |
| `driver-tracking` | Self-endpointlar (`ping`, `shifts/start|end`) ataylab self-scope; dispecher `live`/`route` da `DispatcherGuard` bor. **LEKIN `GET link/:employeeId` da guard YO'Q edi** — kodda «DISPECHER» deb yozilgan-u, tekshiruv yo'q → **YOPILDI** (pastda) |

**Reja ro'yxatida BO'LMAGAN topilma (Faza 23 toifalashini tuzatadi) — `onboarding`.**
Faza 23 uni «ataylab ochiq (o'z qadamlari)» toifasiga qo'ygan edi. O'lchov buni **rad etadi**:
`onboarding.service.ts:51/63/74/98` — hammasi `onboardingProgress.update({ where: { accountId } })`,
ya'ni progress **xodimniki emas, AKKAUNTNIKI** (bitta qator). Demak har xodim
`POST /onboarding/restart` bilan butun tenantning sozlash-sehrgarini nolga qaytara olardi
(`completedSteps: []`), `skip` bilan uni «o'tkazib yuborilgan» qilardi, `override` bilan esa
istalgan qadamga qo'yardi — oxirgi ikkitasining kodidagi izohda ochiq «admin» deb yozilgan-u,
hech qanday tekshiruv yo'q edi. **Holatni BUZUVCHI uchtasi yopildi**, `complete-step` (additiv,
sehrgar oqimining o'zi) ataylab ochiq qoldirildi.

### 2. O'zgarishlar (8 fayl + 1 yangi test)

| Fayl | O'zgarish |
|---|---|
| `sklad-keeper/sklad-keeper.controller.ts` | `PUT /` + `PUT receipt-printer` → `settings.update`; `DELETE :skladNo` → `settings.delete`. `GET` ataylab ochiq (omborchi ekrani o'z zonasini shundan oladi) — klass-izoh yangilandi |
| `shift-schedule/shift-schedule.controller.ts` | `POST/PATCH/DELETE` → `settings.create/update/delete`; izohda **nega**: jadval `late-minutes.util` orqali kechikish daqiqalarini va shundan kelib chiquvchi jarimani belgilaydi ⇒ jadvalni siljitish = davomat tarixini qayta yozish |
| `smena/smena.controller.ts` | `POST/PATCH/DELETE` → `settings.*`; **`POST open-session` → `cashiersession.create`** (`CashierSessionController#open` bilan bir xil ruxsat) |
| `debt/debt.controller.ts` | `POST pos/pay` → **`debtpayment.create`** — kassa to'lovi (`POST :id/payments`) bilan AYNAN bir xil. Ilgari TZ §6 ajratmasi («operator kassa to'lovini kirita OLMAYDI») POS oynasi orqali chetlab o'tilardi |
| `pick-list/pick-list.controller.ts` | `POST sync` → `settings.update` (integratsiya pull-triggeri; `onec` sync-endpointlari precedenti). `pick-state`/`printed` DEFER — sababi izohda |
| `restock-task/restock-task.controller.ts` | `POST from-sales-return` → `salesreturn.update` (manba hujjat aynan vozvrat; bu yo'l omborchiga bildirishnoma yuboradi). Tasdiqlash handlerlari DEFER |
| `onboarding/onboarding.controller.ts` | `skip`/`restart`/`override` → `settings.update`; klass-izohda Faza 23 toifalashining tuzatilishi hujjatlandi |
| `hr/driver-tracking/driver-tracking.controller.ts` | `GET link/:employeeId` → **`@UseGuards(DispatcherGuard)`**. Ilgari HAR xodim ISTALGAN `employeeId` uchun doimiy HMAC-token yasay olardi (`driver-link.util` — token **saqlanmaydi**, bekor qilish faqat `JWT_SECRET` rotatsiyasi bilan), so'ng `POST /p/driver/:token/{ping,shift/start,shift/end}` bilan **boshqa haydovchi nomidan GPS va smena** yozardi ⇒ davomat/marshrut soxtalashtirish |
| `permissions/mutation-guard-coverage.test.ts` | **YANGI** — pastda |

**Ruxsat slug'lari mavjud lug'atdan olindi, yangisi O'YLAB TOPILMADI** (`permissions.types.ts`
`PermissionEntity` union'i). `settings` — `company-settings`, `edo`, `email`, `app-install`,
`attribute-metadata`, `onec`, `group` (Faza 23) bilan bir xil naqsh; `cashiersession`,
`debtpayment`, `salesreturn` — o'z modullaridagi mavjud chaqiruvlarga aynan mos.

### 3. Testlar (TDD — RED jonli o'lchandi)

**Yangi fayl:** `apps/api/src/modules/permissions/mutation-guard-coverage.test.ts` (**51 test**).
Mavjud test-fayl ustidan `Write` QILINMADI — bu yagona yangi fayl (`git status`: `??`).

- **(A) Endpoint-daraja, 16 yopilgan handler × 3 test = 48:** (1) dekorator metadatasi aynan
  kutilgan `entity.action`; (2) **ruxsatsiz aktor → `ForbiddenException`**; (3) **ruxsatli aktor →
  `true`**. Testlar **haqiqiy `PermissionsGuard` + haqiqiy `Reflector` + controller
  prototipidagi HAQIQIY handler** orqali yuradi (faqat `PermissionsService.require` stub — u
  loyihaning o'z `isAtLeast` funksiyasini ishlatadi). Ya'ni «metadata yozilgan-u guard o'qimaydi»
  holati ham tutiladi.
- **+ POS qarz to'lovi (TZ §6):** `debtpayment.create` metadatasi + `debt.view` va
  `debtcardpayment.create` bor (ya'ni **QarzOperatori**) aktor **403 oladi** — TZ ajratmasi
  mexanik qulflandi.
- **+ Haydovchi magic-link:** `Reflect.getMetadata('__guards__', …driverLink)` ichida
  `DispatcherGuard` borligi.
- **(B) KLASS-QULF (4 test):** skaner butun `apps/api` ni o'qib har guard-siz mutatsiya-handlerni
  topadi va **oshkora `INTENTIONALLY_OPEN` allowlist'iga** solishtiradi (40 qator, **har biri
  sababi bilan**: login/webhook/magic-link/self-scope/egasi qarori/DEFER). Uch yo'nalishda qulf:
  (a) allowlist'da yo'q yangi ochiq handler → qizil; (b) **eskirgan** allowlist qatori (endi yopiq
  yoki o'chgan) → qizil (allowlist «axlat» to'plamiga aylanmaydi); (c) sababsiz qator → qizil.
  Vakuum-qarshi tekshiruv ham bor (skaner ≥700 handler topishi va ma'lum ikki nuqtani ko'rishi shart).

**RED → GREEN (jonli o'lchangan):**
- RED (fix'dan OLDIN): `vitest run src/modules/permissions/mutation-guard-coverage.test.ts` →
  **33 failed / 18 passed (51)**. Klass-qulf yiqilishi aynan 16 handlerni nomma-nom sanab berdi
  (`DebtController#posPay`, `SkladKeeperController#upsert`, … `SmenaController#openSession`).
- GREEN (fix'dan KEYIN): **51/51 passed**.

### 4. 🔴 ROL-TA'SIR JADVALI (deploy-QA uchun — OPS-8)

Seed'lar o'qildi: `packages/db/prisma/seed.ts:140-225` (system rollar + Administrator adminга
biriktiriladi) va `permissions.service.ts:328+` (`SYSTEM_ROLE_TEMPLATES` bo'yicha top-up).
**Administrator = har entity/action uchun `ALL` ⇒ EGAGA TA'SIR YO'Q** (Faza 23 dagidek).
Guard `minScope` bermaganda `'OWN'` talab qiladi ⇒ `NO` dan boshqa har qanday scope o'tadi.

| Endpoint (avval: **har autentifikatsiyalangan xodim**) | Qo'shilgan talab | Kim endi 403 oladi |
|---|---|---|
| `PUT /sklad-keepers` | `settings.update` | ReadOnly · QarzOperatori · QarzKassiri · **rolsiz xodim** |
| `PUT /sklad-keepers/receipt-printer` | `settings.update` | ⇑ o'sha |
| `DELETE /sklad-keepers/:skladNo` | `settings.delete` | ⇑ + **Employee** (`delete: NO`) |
| `POST /admin/shift-schedules` | `settings.create` | ReadOnly · Qarz rollari · rolsiz |
| `PATCH /admin/shift-schedules/:id` | `settings.update` | ⇑ o'sha |
| `DELETE /admin/shift-schedules/:id` | `settings.delete` | ⇑ + **Employee** |
| `POST /admin/smenas` | `settings.create` | ReadOnly · Qarz rollari · rolsiz |
| `PATCH /admin/smenas/:id` | `settings.update` | ⇑ o'sha |
| `DELETE /admin/smenas/:id` | `settings.delete` | ⇑ + **Employee** |
| `POST /admin/smenas/open-session` | `cashiersession.create` | ReadOnly · QarzOperatori · QarzKassiri · rolsiz *(Employee/Manager o'tadi — `create: ALL`)* |
| `POST /debts/pos/pay` (**pul**) | `debtpayment.create` | **QarzOperatori** (TZ §3.6 — KUTILGAN va TALAB QILINGAN) · ReadOnly · rolsiz *(QarzKassiri o'tadi — override)* |
| `POST /pick-lists/sync` | `settings.update` | ReadOnly · Qarz rollari · rolsiz |
| `POST /restock-tasks/from-sales-return` | `salesreturn.update` | ReadOnly · Qarz rollari · rolsiz *(FE chaqiruvchisi YO'Q — grep bilan tekshirildi ⇒ jonli oqim buzilmaydi)* |
| `POST /onboarding/skip` · `restart` · `override` | `settings.update` | ReadOnly · Qarz rollari · rolsiz *(`override` da FE chaqiruvchisi yo'q)* |
| `GET /driver-tracking/link/:employeeId` | `DispatcherGuard` (JWT `hrRoles ∋ 'admin'`) | `hrRoles` da `admin` bo'lmagan HAR KIM — shu jumladan `employees:full` li HR-menejer |

**Rol shablonlari bo'yicha xulosa:** `Administrator` — ta'sir yo'q · `Manager` — ta'sir yo'q
(create `ALL`, update/delete `OWN_GROUP` ⇒ `OWN` dan yuqori) · `Employee` — faqat **uch `DELETE`**
yo'lida 403 (`delete: NO`) · `ReadOnly` — 15 yo'lda 403 (to'g'ri: u faqat ko'rishi kerak) ·
`QarzOperatori`/`QarzKassiri` — `settings`/`cashiersession` yo'llarida 403 (ular sozlamalar
roli emas) · **rolsiz xodim** — hammasida 403 (bu eng katta deploy-riski, OPS-8 ga yozildi).

### 5. Qolgan qarz / DEFER

1. **🟡 `PickListController#setPickState` · `#markPrinted` · `RestockTaskController#confirmLine` ·
   `#confirmScan` — DEFER (4 handler, ataylab).** Sabab: **mos entity-slug YO'Q.** `msPickList`
   qatori MoySklad «Заказ покупателя» **va** «Возврат» ni aralash saqlaydi (bitta slug ikkalasini
   yolg'onsiz qoplay olmaydi), `restockTask` esa umuman o'z entity'si. Mavjud lug'atdan biror
   slug olish = semantik yolg'on; yangi slug o'ylab topish reja §5 bo'yicha TAQIQ. Xavf-tarozi:
   bu ikki ekran **omborchining yagona API-sirti** (`/pick-lists`, `/restock-tasks/[id]` —
   boshqa ruxsat-talab qiluvchi chaqiruvi yo'q, grep bilan tekshirildi), noto'g'ri slug prodda
   ombor ishini to'xtatadi — Faza 23 dagi rol-matritsa hodisasining aynan takrori bo'lardi.
   Zarar tahlili: bu to'rtalasi **pul ham, ombor qoldig'i ham o'zgartirmaydi** (`markConfirmed` —
   faqat `confirmedAt` + task statusi; `setPickState` — holat mashinasi; `markPrinted` — birinchi
   chop etish vaqti), hammasi izlanuvchan va qaytariladigan. **Yechim (alohida faza):**
   `picklist`/`restocktask` entity'lari + seed-matritsa qatorlari + rol-UI, keyin shu 4 handler.
   Ular klass-qulf allowlist'ida **`DEFER Q10`** izohi bilan turibdi — «unutildi» emas, «qaror».
2. **🟡 `OnboardingController#completeStep` ochiq qoldi** — akkaunt-bo'ylab qator bo'lsa-da,
   amali **additiv** (qadamni bajarilgan deb belgilaydi, hech narsani o'chirmaydi) va sehrgar
   oqimining o'zi. Buzuvchi uchtasi yopildi.
3. **🟡 `GET` yo'llari qattiqlashtirilmadi.** Bu faza mutatsiyalarga qaratilgan (klass-qulf ham
   `@Post/@Put/@Patch/@Delete` ni skanlaydi). Ma'lum ochiq o'qish yo'llari: `GET /debts/pos/summary/:id`
   va `GET /debts/pos/receipt/:batchId` (kassa oynasi ochilishini buzmaslik uchun ataylab
   tegilmadi), `GET /sklad-keepers`, `GET /admin/{smenas,shift-schedules}` (picker'lar).
   `GET`-qamrov alohida faza talab qiladi (breakage yuzasi ancha keng).
4. **🟡 `DispatcherGuard` hamon JWT `hrRoles: ['admin']` ga tayanadi** (`dispatcher.guard.ts:18`,
   o'z TODO'si bilan) — ya'ni haydovchi-link endi HR-adminga cheklandi, lekin «dispecher» roli
   sifatida ajratilmadi. Ikki parallel RBAC birlashuvi (Faza 23 DEFER) — o'sha qarz.
5. **🟡 Rolsiz xodim = 403 hamma joyda.** Prod'da ba'zi xodimlarda core `Role` biriktirmasi
   bo'lmasligi mumkin (HR tomonidan yaratilgan xodim avtomatik rol olmaydi). Bu 16 endpoint
   uchun deploydan keyin rol to'ldirish SHART — OPS-8 ga aniq ro'yxat bilan yozildi.
6. **Browser-smoke YO'Q — Phase-1.** Runtime tekshiruv (Phase-2 cohort): `/settings/sklad-keepers`
   saqlash, `/settings/shift-schedules` CRUD, `/settings/smena` CRUD + `/sotuv` dan smena ochish,
   POS «Qarz to'lovi» oynasidan to'lash, `/pick-lists` sync tugmasi, HR xodim kartochkasidan
   haydovchi-link olish.

### 6. Gate (jonli, commit oldidan)

- `pnpm --filter @moysklad/api typecheck` → **0 xato**
- `pnpm lint:product` → **0 error** (748 warning — siyosat bo'yicha ruxsat). *(Yangi test fayli
  avval `format` xatosi berdi → `biome format --write` bilan tuzatildi, keyin qayta yugurtirildi.)*
- Tegilgan modullar + `permissions` + `auth` + `app-boot` + `hr/attendance-geo` + `hr/driver-tracking`:
  **55 fayl / 559 test — hammasi yashil.**
- To'liq API suite **3 shardda** (`vitest run --shard=N/3 --reporter=dot`):
  **1884 + 1810 + 2116 = 5810 passed / 2 skipped**, 0 failed. Baza (Faza Q9 dan keyin)
  **5759 passed / 2 skipped** ⇒ **+51 = aynan shu fazaning yangi testlari**, regress YO'Q.
- `i18n:gate` — kerak emas (UI-matn tegilmadi; FE umuman tegilmadi).

### 7. Git gigienasi (CLAUDE.md §6)

Daraxtda menikimas o'zgarishlar bor edi — `todo.md` (modified), `docs/REJA-8-BOLIM-2026-08.md`
(untracked) va foydalanuvchining untracked fayllari (`qabullar-amallar-royxati.txt`, `*.xlsx`,
`chek.png`, `SAYT-PROMPT.txt`, `docs/audits/...`, `scratchpad/`) — **HECH BIRIGA TEGILMADI**;
`git add` faqat aniq yo'llar bilan, commitdan keyin `git show --stat HEAD` bilan tarkib tekshirildi.
Bir martalik skaner skripti sessiya scratchpad'ida qoldi — **repoga kirmaydi**. Bu yozuv faylga
**append** bilan qo'shildi — **marker-kesish YO'Q** (`doc-append-marker-truncation` xotirasi),
Q1–Q9 yozuvlariga TEGILMADI.

**Commit:** `fix(auth): faza q10 — guard-siz mutatsiya endpointlariga permission (AUTH-07)`

---

## Faza Q11 — saveConfig PATCH-audit (`INT-13` klassi) + `webhookSecretSet` badge (2026-08-09) — **Phase-1: strukturaviy + unit-tasdiqlangan, browser-smoke YO'Q**

Manba: Faza 21 hisoboti DEFER-1 (`webhookSecretSet` UI'da ko'rinmaydi) va DEFER-4 (`INT-13` naqshi
boshqa integratsiyalarda tekshirilmagan).

### 1. Da'volarni kodda tasdiqlash (O'ZGARMAS QOIDALAR §2) — 2/2 TASDIQLANDI

- **DEFER-1 TASDIQLANDI.** `telegram.service.ts:1023` `businessStatus` haqiqatan
  `webhookSecretSet: !!cfg?.webhookSecret` qaytaradi (+ Faza 21 izohi joyida), lekin
  `apps/web/src/components/counterparties/telegram-chat-card.tsx:19-25` dagi `BusinessStatus`
  interfeysida bu maydon **YO'Q edi** va hech qayerda render qilinmasdi. Ya'ni operator uchun
  «webhook sozlangan, lekin secret yo'q ⇒ har inbound update 401» holati **butunlay ko'rinmas** edi.
- **DEFER-4 TASDIQLANDI (qisman — quyida halol o'lchov).** `telegram` fixdan keyin ham `INT-13`
  naqshi **uchta boshqa** konfiguratsiya-yozuvchida qolgan edi.

### 2. Audit — barcha konfiguratsiya-yozuvchilari (grep + har birini KODDA o'qib)

Kashfiyot: `apps/api/src/modules` ostidagi `async (save|upsert|update)*Config(` — **23 fayl**
(servis + controller). Ulardan haqiqiy yozuvchi-servislar 12 ta; qolganlari delegatsiya qiluvchi
controllerlar. Har birining `data` obyekti o'qib chiqildi:

| # | Yozuvchi | `?? null` naqshi bor edimi | Sabab / holat |
|---|---|---|---|
| 1 | `telegram/telegram.service.ts` | **bor edi — Faza 21 da TUZATILGAN** | referens naqsh (namuna) |
| 2 | `email/email.service.ts` | **BOR EDI** (`fromName`, `replyTo`) | ikkalasi sxemada `nullish` + `''`→null preprocess ⇒ TUZATILDI |
| 3 | `sms/sms.service.ts` | **BOR EDI** (`senderId`) | `optionalEmpty(20)` ⇒ TUZATILDI |
| 4 | `payment-gateway/payment-gateway.service.ts` | **BOR EDI** (`callbackUrl`) | + sxema tuzatildi (pastda) ⇒ TUZATILDI |
| 5 | `edo/edo.service.ts` | yo'q edi | sirlar allaqachon `...(X !== undefined ? …)` naqshida; qolgan maydonlar sxemada MAJBURIY |
| 6 | `marking/marking.service.ts` | yo'q edi | `apiToken` `!== undefined` naqshida; `stir`/`apiBaseUrl` majburiy |
| 7 | `integrations/onec/onec.service.ts` | yo'q edi | `password` `!== undefined`; qolgani majburiy |
| 8 | `integrations/bank/bank.service.ts` | yo'q edi | `creds` `!== undefined`; qolgani majburiy |
| 9 | `integrations/marketplace/marketplace.service.ts` | yo'q edi | `creds` `!== undefined`; qolgani majburiy |
| 10 | `app-install/app-install.service.ts` | yo'q edi | `config` sxemada `.nullable()` (MAJBURIY) ⇒ `null` = OSHKORA tozalash niyati, `undefined` emas |
| 11 | `hr/hr-attendance-notify/…service.ts` | yo'q edi | allaqachon to'liq PATCH (`...(dto.X !== undefined && {X})`) |
| 12 | `hr/hr-salary/hr-salary.service.ts` | yo'q edi | barcha maydon majburiy, to'liq-almashtirish upsert |
| — | `manager/kpi/kpi-config.service.ts` | `note: input.note ?? null` **bor, lekin BUG EMAS** | har saqlash `kpiProfileVersion` ning **YANGI** qatorini yaratadi (versiyalash) — saqlanadigan oldingi qiymat yo'q ⇒ klass-qulf ALLOWLIST'iga sabab bilan yozildi |

**Halol nuans (ortiqcha da'vo qilmaslik uchun):** 2–4 dagi ta'sir `telegram`nikidan PASTROQ.
`telegram` sxemasida HAMMA maydon ixtiyoriy edi ⇒ haqiqiy qisman so'rov oson yuz berardi.
`email`/`sms`/`payment-gateway` sxemalarida bir necha maydon MAJBURIY, ya'ni tana baribir «deyarli
to'liq» keladi va bug faqat ixtiyoriy maydon (`fromName`/`replyTo`/`senderId`/`callbackUrl`)
tashlab yuborilganda otiladi. Bu **haqiqiy**, lekin «har rotatsiyada butun inbound o'ladi» darajasi
emas. `payment-gateway/config` ning esa web-UI'si umuman **yo'q** (chaqiruvchi tashqi/admin
integratsiya) ⇒ u yerda qisman tana eng ehtimolli.

### 3. O'zgarishlar

**API (3 servis + 1 sxema):**
1. `email/email.service.ts` — `fromName: parsed.fromName ?? null` va `replyTo: … ?? null` →
   `...(parsed.X !== undefined ? { X: parsed.X } : {})`. Sabab-izoh yozildi.
2. `sms/sms.service.ts` — `senderId` uchun xuddi shunday. `token: null` / `tokenIssuedAt: null`
   **ataylab qoldirildi** (saqlash = keyingi ishlatishda qayta-auth majburiyati, bu maydon
   operator kiritmaydigan kesh).
3. `payment-gateway/payment-gateway.service.ts` — `callbackUrl` PATCH-semantikaga.
4. `payment-gateway/payment-gateway.schema.ts` — **`callbackUrl` sxemasi ham o'zgardi**:
   `z.string().url().max(500).optional()` → `z.preprocess('' → null, z.string().url().max(500).nullish())`.
   **Nega majburiy:** eski sxemada `''` `url()` dan o'tmasdi ⇒ «ataylab tozalash»ning YAGONA yo'li
   maydonni tashlab yuborish edi. PATCH-semantikaga o'tish o'sha yo'lni yopardi va operator callback
   URL'ini **umuman o'chira olmay qolardi**. Endi telegram/sms'dagi `optionalEmpty` naqshi.
   `''` dan boshqa noto'g'ri qiymat baribir `url()` bilan rad etiladi (test bilan qulflandi).

**FE (badge, DEFER-1):**
5. `apps/web/src/components/counterparties/telegram-chat-card.tsx` — `BusinessStatus` ga
   `webhookSecretSet: boolean` (+ sabab-docblock) va kartochka tanasining boshida ogohlantirish
   qatori: `status.webhookSet && !status.webhookSecretSet` ⇒ warn-ohangdagi strip
   (`data-test-id="tg-webhook-secret-warn"`). `webhookSet:false` bo'lsa CHIQMAYDI (u boshqa muammo).
6. `apps/web/src/messages/{ru,uz}.json` — `telegram_chat.webhook_secret_missing`.
   **Label grounding (CLAUDE.md §4):** matn o'zimdan to'qilmadi, mavjud lug'atdan yig'ildi —
   RU `«Webhook»` + `«секрет»` (`pages.webhook_admin.field_secret` = «HMAC-секрет») +
   `«Входящие»` (`audit.group_payments_in`) + `«…не настроен — администратор должен…»`
   (`telegram_chat.not_configured` qolipi); UZ `«Webhook»`/`«webhook'ni»`
   (`pages.webhook_admin.delete_confirm`) + `«kalit»` (`field_secret` = «HMAC kalit»,
   `driver_trips.geocode_disabled` = «Yandex kaliti yo'q») + `«kiruvchi»`
   (`audit.group_payments_in`) + `«sozlangan/sozlanmagan»` (`not_configured`).

**Klass-qulf (yangi):**
7. `apps/api/src/modules/shared/config-patch-semantics-class.test.ts` — **kashfiyot asosida**:
   `modules/` daraxtini o'zi skanlaydi, har `async *Config(` metodining **TANASINI** `{}` juftligi
   bo'yicha kesib oladi (butun fayl EMAS — o'sha fayllarning `create` yo'llari `?? null` ni
   HAQLI ishlatadi: `email` send-log, `sms` log, `marking` code-allocate) va tanada
   `X: parsed|dto|input.Y ?? null|undefined` naqshini taqiqlaydi. Kommentlar `stripComments()`
   bilan tashlanadi — **Faza 21 dagi aynan tuzoq**: fixning o'z izohi («Ilgari
   `parsed.webhookUrl ?? null` uslubi…») aks holda yolg'on-qizil berardi. ALLOWLIST kalit
   `<fayl>: <aniq qator>` (fayl darajasida emas) ⇒ o'sha fayldagi KEYINGI haqiqiy INT-13 jim
   o'tmaydi. **Yangi `saveConfig` `?? null` bilan qo'shilsa — ro'yxatga hech narsa qo'shmasdan
   test yiqiladi.**

### 4. Testlar (TDD — RED jonli o'lchandi, keyin GREEN)

**RED (fixdan OLDIN, jonli):**
- Klass-qulf: **1 failed / 2 passed** — `offenders` ro'yxati aynan 5 qatorni ko'rsatdi:
  `email.service.ts: fromName…`, `email.service.ts: replyTo…`,
  `payment-gateway.service.ts: callbackUrl…`, `sms.service.ts: senderId…`,
  + `manager/kpi/kpi-config.service.ts: note…` (tekshirilib **yolg'on-musbat** deb topildi va
  sabab bilan allowlist'ga o'tdi — bu qulfning o'zini kalibrlagan topilma).
- Xulq testlari: **4 failed / 9 passed** (3 fayl). Dalillar: `sms` — «expected … to not have
  property "senderId"; Received: null» (ya'ni NULL-reset HAQIQATAN yozilardi);
  `payment-gateway` — «BadRequestException: Invalid url» (`''` bilan tozalash yo'li HAQIQATAN
  yopiq edi, sxema tuzatishi taxmin emas — o'lchov).
- **RED jami: 5 failed / 11 passed (4 fayl).**

**GREEN (fixdan keyin):** yangi 4 fayl / **16 test** yashil; tegilgan modullar
(`shared`+`email`+`sms`+`payment-gateway`+`telegram`+`manager/kpi`) **63 fayl / 1055 test** yashil.

**Web (badge) — non-vacuity JONLI o'lchandi:** yangi
`apps/web/src/components/counterparties/telegram-chat-card.test.tsx` (3 test, RTL +
`renderWithProviders`) yashil; keyin ogohlantirish bloki **vaqtincha olib tashlanib** yugurtirildi
→ 1-test QIZIL («webhook bor, secret yo'q → ogohlantirish ko'rinadi»), so'ng fayl tiklanib
`cmp` bilan **bayt-identik** ekani tasdiqlandi. Ya'ni test haqiqatan badge'ni ushlab turadi.

### 5. Gate (jonli o'lchangan)

- `pnpm --filter @moysklad/api typecheck` → **0 xato**
- `pnpm --filter @moysklad/web typecheck` → **0 xato**
- `pnpm lint:product` → **0 error** (748 warning — siyosat bo'yicha ruxsat). *(Yangi klass-qulf
  fayli avval `format` xatosi berdi → `biome format --write`, keyin qayta yashil.)*
- `pnpm i18n:gate` → **9/9 passed** (407 fayl, 12338 statik `t()` kaliti tekshirildi)
- To'liq API suite **3 shardda** (`--shard=N/3 --reporter=dot`):
  **1893 + 1845 + 2088 = 5826 passed / 2 skipped**, 0 failed. Baza (Faza Q10 dan keyin)
  **5810 passed / 2 skipped** ⇒ **+16 = aynan shu fazaning yangi API testlari**, regress YO'Q.
- Web suite: **2835 passed / 26 skipped** (188 fayl). Baza **2832 / 26** ⇒ **+3 = badge testi**,
  regress YO'Q.
- Migratsiya YO'Q (sxema tegilmadi — o'zgargan `payment-gateway.schema.ts` **Zod** sxemasi,
  Prisma emas). **Browser-smoke YO'Q.**

### 6. Git gigienasi (CLAUDE.md §6)

Daraxtda menikimas o'zgarishlar bor edi — `todo.md` (modified), `docs/REJA-8-BOLIM-2026-08.md`
(untracked) va foydalanuvchining untracked fayllari (`qabullar-amallar-royxati.txt`, `*.xlsx`,
`chek.png`, `SAYT-PROMPT.txt`, `docs/audits/…`, `scratchpad/`) — **HECH BIRIGA TEGILMADI**;
`git add` faqat aniq yo'llar bilan, commitdan keyin `git show --stat HEAD` bilan tarkib tekshirildi.
Bu yozuv faylga **append** bilan qo'shildi — **marker-kesish YO'Q**
(`doc-append-marker-truncation` xotirasi), Q1–Q10 yozuvlariga TEGILMADI.

### 7. 🟠 Qolgan qarz / DEFER

1. **Browser-smoke YO'Q** — badge real brauzerda ko'rilmadi (RTL + happy-dom bilan tasdiqlangan).
   Kontragent detali cohortining Phase-2 QA sessiyasiga qoladi.
2. **Zod `default()` reset klassi tekshirilmadi.** `INT-13` `?? null` haqida; lekin
   `provider`/`testMode`/`port`/`secure` kabi `default(...)` li maydonlar ham qisman tanada
   **standart qiymatga qaytadi** (masalan `testMode` yuborilmasa `true` bo'lib qoladi). Bu alohida
   (yumshoqroq) klass — shu fazada ATAYLAB tegilmadi, chunki barcha chaqiruvchilar to'liq tana
   yuboradi va o'zgartirish sozlash-formalarining hozirgi semantikasini buzishi mumkin.
3. **`webhookSecretSet` faqat bitta joyda ko'rsatiladi** — kontragent kartochkasida. Sozlamalar
   sahifasida (agar Telegram sozlash UI'si bo'lsa) ham chiqarish foydali bo'lardi; bu fazada
   `businessStatus`ning YAGONA iste'molchisi shu kartochka ekani grep bilan tasdiqlandi.
4. **Faza 21 ning boshqa DEFER'lari ochiq qoladi** (2 — rate-limit/replay dedup, 3 — secret
   rotatsiyasi atomik emas, 5 — `!creds.secretKey` ortiqcha old-tekshiruvi). Ular Q11 doirasida emas.

**Commit:** `fix(integrations): faza q11 — saveconfig patch-semantika + webhook secret badge (INT-13)`

---

## Faza Q15 — Contracts 2-to'lqin: `ListResponse` codemod + 5 yangi endpoint kontrakti (`FE-12`) (2026-08-09) — **Phase-1: strukturaviy + unit-tasdiqlangan, browser-smoke YO'Q**

**Manba:** Faza 33 hisoboti DEFER-2/3 (`docs/REJA-AUDIT-FIX-2026-08.md`). Mexanizm (`packages/contracts`
source-only + provenance reyestri + `apps/api` konformans testi + web qo'riqchisi) Faza 33'da qurilgan —
bu faza uni **qayta ishlatdi**, yangisini o'ylab topmadi.

### 0. O'Z O'LCHOVIM (hisobotdagi raqam ko'r-ko'rona olinmadi)

Faza 33 hisoboti «92 fayl, 91 tasi lokal» degan edi. Sessiya boshida qayta sanadim:

```
grep -rn "interface ListResponse|type ListResponse" apps/web/src → 90 uchrash, 90 fayl
```

Ya'ni **90** (92 emas): Faza 33 `retail` + `sotuv` ni allaqachon o'tkazgan. Hisobotda shu 90 raqami
ishlatiladi.

Shakl bo'yicha taqsimot (deterministik analiz skripti, `scratchpad/analyze-listresponse.mjs`):

| shakl | fayl |
|---|---|
| `{ items, nextCursor?, total }` | 66 |
| `{ items, total }` | 14 |
| `{ items }` | 4 |
| **umumiy `ListEnvelope` ga MOS KELMAYDIGAN** | **6** |

### 1. (a) `ListResponse` codemod — 84 fayl

**Skript:** `scratchpad/codemod-listresponse.mjs` (deterministik, ~0 token — CLAUDE.md §0.1).
**Fail-closed konstruksiya** (`doc-append-marker-truncation` sabog'i):

- har anchor **aynan bitta** marta uchrashi shart: `interface ListResponse` 1 marta, `type ListResponse`
  0 marta, `export`langan bo'lmasligi, faylda `@moysklad/contracts` yoki `ListEnvelope` bo'lmasligi,
  e'londan keyin kamida 1 ta `ListResponse` ishlatilishi;
- birortasi buzilsa fayl **umuman tegilmaydi** va **butun yugurish `exit 1`**;
- yozish **butun pass tozalanmaguncha kechiktiriladi** (`pending` Map) — ya'ni bitta fayl guard'ni
  buzsa, avvalgi 83 fayl ham yozilmaydi (yarim qo'llanish yo'q);
- **ineligible ≠ failure:** umumiy envelope tavsiflay olmaydigan javob shakli (`page`/`pageSize`/`totals`/
  `pagination`/`balanceTotalMinor`/`rows`/`nextCursor: string | null`) — hisobot qatori, xato emas.

**Transformatsiya:** lokal e'lon o'chiriladi → `import type { ListEnvelope as ListResponse } from
'@moysklad/contracts'` qo'shiladi (Faza 33 adopter'lari — `retail`/`sotuv` — bilan **aynan bir xil**
alias naqshi) → qolgan har bir yalang' `ListResponse` → `ListResponse<ElementType>` → keyin biome
`organizeImports` import'ni joyiga qo'yadi.

**`total?` NUANCE (hisobotdan, tasdiqlandi):** umumiy `ListEnvelope` da `total?: number`, chunki API'ning
uch xil javob shakli bor. Codemod, faqat `total: number` (majburiy) deb e'lon qilgan fayllarda,
optional-chain qilinmagan `data.total` ni `data.total ?? 0` ga o'girdi — **27 faylda 27 joy**
(hammasi `subtitle={data ? tCommon('records_count', { count: data.total }) : …}` naqshi).
Busiz web typecheck qizil bo'lardi; **birinchi urinishdayoq 0 xato** — ya'ni qoida to'liq qamradi.

**Natija:** 84 fayl o'tkazildi · 6 fayl ineligible · **0 fayl guard'ni buzdi** · skript **idempotent**
(ikkinchi yugurish `wrote 0 file(s)`). Codemod **birorta test faylini tegmadi** (`git status`da web'da
o'zgargan yagona `.test.ts` — qo'lda `Edit` qilingan qo'riqchi).

Umumiy envelope'ga mos kelmagan 6 fayl (endi web qo'riqchisida `NON_ENVELOPE_LISTS` sifatida
sababi bilan qayd etilgan — 7-chisi paydo bo'lsa test yiqiladi):

| fayl | nega |
|---|---|
| `analitika/kontragentlar/page.tsx` | `{ partners, groups, pagination }` — `items` umuman yo'q |
| `commission-reports/page.tsx` | `page`/`pageSize` + 5 raqamli `totals` bloki |
| `counterparties/page.tsx` | `balanceTotalMinor` — BUTUN filtrlangan to'plamning «Итого Баланс»i |
| `money/page.tsx` | valyuta-kesimli `totals`, va `nextCursor: string \| null` (oshkora null) |
| `payments/page.tsx` | `page`/`pageSize` + kirim/chiqim `totals` |
| `settings/employees/page.tsx` | massiv nomi `rows` (`items` emas), `page`/`limit` |

### 2. (b) 5 yangi endpoint kontrakti + provenance

Yangi fayllar: `packages/contracts/src/document-list.ts`, `packages/contracts/src/counterparty.ts`.

| kontrakt | endpoint | provenance manbalari |
|---|---|---|
| `DemandRowSchema` (40 maydon — audit aynan shuni ko'rsatgan) | `GET /demands` | `model: Demand` + `select: demand.service#list` + **`method: demand.service#enrichListRows`** |
| `CustomerOrderRowSchema` | `GET /customer-orders` | `model: CustomerOrder` + `select: customer-order.service#list` |
| `SupplyRowSchema` | `GET /supplies` | `model: Supply` + `select: supply.service#list` |
| `InvoiceOutRowSchema` | `GET /invoices-out` | `model: InvoiceOut` + `select: invoice-out.service#list` |
| `CounterpartyRowSchema` | `GET /counterparties` | `model: Counterparty` + **`select … block:'include'`** + `method: counterparty.service#list` + **`zod: counterparty.schema#UzRequisitesSchema`** |

**Ehtiyot bandi tasdiqlandi:** butun `apps/api` da **javob** Zod-sxemasi deyarli yo'q — 5 kontraktdan
faqat bittasida `zod` provenance ishlatildi (`UzRequisitesSchema`, u ham **yozish** validatsiyasi
sxemasi, lekin `uzRequisites` JSON ustunining ICHKI kalitlarini (`inn/pinfl/kpp/birthDate/gender`)
bog'laydigan yagona server manbasi). Qolgan hamma kalit `select` bloki / Prisma modeliga bog'landi.

#### Mexanizmga qo'shilgan ikki haqiqiy tuzatish (ikkalasi ham konformans testi TOPDI, taxmin emas)

1. **`select` anchor'i noto'g'ri blokni o'qiyotgan edi.** `selectBlockKeys` metod ichidagi BIRINCHI
   `select:`/`include:` ga tushadi. `counterparty.service#list` esa custom-attr filtri uchun avval
   `attributeMetadata.findMany({ select: { code: true } })` chaqiradi ⇒ default anchor **bir kalitli**
   blokni o'qib, kontraktni jimgina «deyarli hech narsani isbotlamaydigan» holga keltirardi.
   → `ProvenanceSource` ga `block?: 'include'` qo'shildi, `selectBlockKeys(src, method, block)` uchinchi
   argument oldi. **Yangi RED-test tuzoqni ko'rsatadi:** default anchor `['code']` qaytaradi,
   `'include'` anchor `['id','name','owner']`.
2. **`methodObjectKeys` SHORTHAND xossalarni ko'rmasdi.** `objectKeysIn` faqat `key:` ni topadi;
   `counterparty.service#list` esa `return { ...rest, balanceMinor, salesCount, averageCheckMinor,
   profitMinor }` deb qaytaradi. Konformans testi shu 3 kalitni «hech qayerda ishlab chiqarilmaydi»
   deb qizil berdi — **haqiqiy extractor teshigi** (`contract-provenance.ts` faylining o'zi
   «bo'sh to'plam qaytaradigan extractor butun suite'ni no-op qiladi» deb ogohlantiradi).
   → `shorthandKeysIn()` qo'shildi, faqat permissiv `methodObjectKeys` da ishlatiladi;
   aniq `selectBlockKeys` da ATAYLAB ishlatilmaydi (Prisma doim `key: true` yozadi) — buni ham
   alohida test qulflaydi.

#### Sahifalar kontraktni QABUL QILDI (faqat e'lon ko'chirish emas)

`scratchpad/adopt-row-contracts.mjs` (fail-closed) 5 sahifaning lokal qator-interfeysini o'chirib
kontrakt tipiga o'tkazdi: `demands` (`DemandRow`), `customer-orders` (`CustomerOrderRow`), `supplies`
(`SupplyRow`), `invoices-out` (`InvoiceOutRow as InvoiceRow`), `counterparties`
(`CounterpartyRow as Counterparty`). Web typecheck **birinchi urinishda 0 xato** — ya'ni kontrakt
tipi sahifa ishlatayotgan haqiqiy shakl bilan struktura jihatdan mos.

#### Web qo'riqchisi kuchaytirildi (`apps/web/src/__tests__/shared-api-contracts.test.ts`, faqat `Edit`)

- `ADOPTERS`: 2 → **7** sahifa;
- `OWNED_BY_CONTRACTS`: `['CurrentSession']` → `+ DemandRow, CustomerOrderRow, SupplyRow`
  (nomi bir ma'noli bo'lganlari; `Counterparty` va `InvoiceRow` **ataylab QO'SHILMADI** — bu nomlar
  web'da boshqa (picker/detail, `invoices-in`) shakllar uchun ham ishlatiladi);
- **yangi global skan:** butun `src/` da `interface ListResponse` faqat `NON_ENVELOPE_LISTS` dagi 6
  faylda bo'lishi mumkin; 7-chisi paydo bo'lsa test yiqiladi. Eskirgan yozuv ham yiqitadi (fayl
  migratsiya qilinsa exemption'ni o'chirishga majbur qiladi). Bu per-adopter `ListResponse`
  tekshiruvidan kuchliroq — shuning uchun o'sha eski per-adopter it() o'rniga keldi.

### 3. O'zgargan/yangi fayllar

**Yangi (2):** `packages/contracts/src/document-list.ts` · `packages/contracts/src/counterparty.ts`
**Modify (4 + 84):**
`packages/contracts/src/{index,provenance}.ts` ·
`apps/api/src/modules/shared/{contract-provenance.ts,contract-conformance.test.ts}` ·
`apps/web/src/__tests__/shared-api-contracts.test.ts` ·
84 web sahifa/komponent (codemod) — shundan 5 tasi qator-kontraktni ham qabul qildi.

### 4. Gate (jonli o'lchangan) + SANOQ NAZORATI

| gate | natija |
|---|---|
| `@moysklad/contracts typecheck` | **0** |
| `@moysklad/api typecheck` | **0** |
| `@moysklad/web typecheck` | **0** |
| `pnpm lint:product` | **0 error** (783 warning — siyosat ruxsat beradi) |
| web `vitest run` (to'liq) | **2849 passed / 26 skipped** (189 fayl) |
| api `vitest run` 3 shard | **1925 + 1870 + 2148 = 5943 passed / 2 skipped** |

**Sanoq nazorati — codemod jimgina test yo'qotmadi (arifmetika aynan yopiladi):**

- web bazasi **2835** + mening `shared-api-contracts.test.ts` dagi +10 test (per-adopter 3×2=6 → 2×7=14,
  global 2 → 4) + parallel sessiyaning yangi `profitability-cashier-slice.test.ts` faylidagi **4** test
  = **2849** ✓ (o'lchandi: o'sha faylda `grep -c` → 4).
- api bazasi **5826** + mening `contract-conformance.test.ts` dagi +16 test (5 kontrakt → 10 kontrakt =
  +10 registry testi, +4 extractor testi, +1 yangi RED-proof, +1 include-anchor throw testi) = 5842;
  qolgan +101 — parallel sessiyaning yangi **untracked** modullari (`modules/branch/*`,
  `store/cell-migration*` (27+12), `online-order.{inbound,webhook}`), mening ishimga aloqasi yo'q.
- Codemod tekkan **84 faylning birortasi ham test fayli emas** (tekshirildi).

### 5. Parallel sessiya (CLAUDE.md §6)

Bu checkout'da parallel sessiya faol edi (`modules/branch/`, `store/cell-migration*`, `permissions/*`,
`schema.prisma`, `seed.ts`, `todo.md`, `REJA-8-BOLIM`/`REJA-MENEJER-KASSA`). **Ularning birorta fayliga
tegilmadi va `git add` qilinmadi.** Ish o'rtasida ularning `store/cell-migration.runner.ts` fayli
`apps/api typecheck` ni 3 xato bilan yiqitdi (`formatDecimalScaled`/`parseDecimalScaled` topilmadi) —
o'sha payt mening o'zgarishlarim bilan API typecheck allaqachon **yashil** o'lchangan edi; keyingi
yugurishda ular tuzatdi va yakuniy gate yashil. **Tegilmadi** (§6.1).

### 6. Qolgan qarz / DEFER — 3-to'lqin uchun ro'yxat

1. **6 ta non-envelope ro'yxat** (yuqoridagi jadval). Ular uchun umumiy tip yozish = uch-to'rt xil
   javob shaklini bitta ittifoqqa siqish; hozircha lokal e'lon **to'g'riroq**. Agar kerak bo'lsa —
   `PagedEnvelope<T>` (`page`/`pageSize`/`totals`) alohida tip sifatida.
2. **17 ta `<Nom>ListResponse` variant e'loni — codemod QAMROVIDAN TASHQARIDA** (nomi `ListResponse`
   emas, shuning uchun anchor mos kelmaydi; bir nechtasi `export` qilingan ⇒ boshqa modul bog'liq):
   `analitika/inventerizatsiya/_lib/types.ts` (`CountListResponse`, `ReasonListResponse` — ikkalasi
   `export`) · `analitika/page.tsx` · `analitika/sozlamalar/_components/reason-codes-view.tsx` ·
   `analitika/xodimlar/page.tsx` (`HrListResponse`) · `bundles` · `ecommerce/page.tsx` ·
   `production/boms` · `production/work-orders` · `products` · `services` · `settings/audit-log` ·
   `variants` · `components/document-tasks-section.tsx` · `components/products/product-select-modal.tsx`
   (×2) · `lib/debt-api.ts` (`DebtListResponse`, `export`).
3. **Kontraktsiz qolgan yirik `GET` endpointlar** (ustuvorlik bo'yicha, har biri o'z qator-tipini
   qo'lda e'lon qiladi): `/products` + `/variants` + `/bundles` + `/services` (to'rtovi bitta
   `Product` modelini turli proyeksiyada o'qiydi — bitta oilaviy kontrakt qilish mumkin) ·
   `/invoices-in` · `/purchase-orders` · `/moves` · `/enters` · `/losses` · `/inventories` ·
   `/sales-returns` · `/purchase-returns` · `/retail/sales` + `/retail/sessions` · `/payments-in|out` ·
   `/cash-in|out` · `/tasks` · `/calls` · `/opportunities` · `/contracts` · `/contact-persons` ·
   `/projects` · `/stores` (to'liq qator) · `/organizations` (to'liq qator) · `/employees` ·
   `/price-lists` · `/processings` + `/processing-orders` · `/productions` · `/serial-numbers` ·
   `/tracking-codes` · `/audit-logs`.
4. **Konformans testi TIPNI tekshirmaydi** (Faza 33 dagi bilan bir xil chegara): ustun `Int → String`
   bo'lsa test yashil qoladi; endpoint umuman ishlayotganini ham isbotlamaydi. Bu — **Phase-2 brauzer/
   runtime** ishi, bu fazada YOPILMADI.
5. **`methodObjectKeys` endi shorthand'ni ham oladi ⇒ yanada permissiv** — destrukturizatsiya
   naqshlari (`const { balances, ...rest } = cp`) ham «ishlab chiqarilgan» hisoblanadi. Bu ataylab:
   u allaqachon hujjatlangan permissiv extractor va u tutadigan yagona holat — kalitning
   YO'QOLISHI. Aniqroq variant (haqiqiy AST) — alohida ish.

**Commit:** `refactor(web): faza q15 — listresponse codemod + yangi endpoint kontraktlari (FE-12)`

---

## Faza Q16 — Hisobot ko'rinuvchanlik paketi: `truncated` + `unconvertedByCurrency` + `recentDocs deleted_at` (2026-08-09) — **Phase-1: strukturaviy + unit-tasdiqlangan, browser-smoke YO'Q**

**Manba:** Faza 27a DEFER-1 · Faza Q5 DEFER-3 · Faza 17 DEFER-2/3 · Faza Q8 DEFER-6 · Faza 26 DEFER-2.

### 1. Da'volarni HEAD kodida tasdiqlash (§2) — 3/3 HAQIQIY, 1 ta reja-formulasi NOTO'G'RI

| Da'vo | Dalil (fix'dan oldingi holat) | Xulosa |
|---|---|---|
| `truncated` FE'da o'qilmaydi | `reports/stock-balance/page.tsx` `StockBalanceReport` (`items/total/summaries`) — maydon YO'Q; `reports/counterparty-balance/page.tsx` `CpBalanceReport` — YO'Q; `analitika/mahsulotlar/page.tsx` `ItemsResponse` — YO'Q. API tomonda esa bor: `stock-balance.service.ts:50`, `counterparty-balance.service.ts:43`, `analitika/items.service.ts:57,65` | **TASDIQ** |
| `unconvertedByCurrency` hech qayerda chizilmaydi | 12 servis maydonni qaytaradi (`aging`,`average-basket`,`cash-flow`,`counterparty-balance`,`pnl`,`profitability`,`purchase-management`,`report`,`sales-by-channel`,`sales-by-hour`,`unit-economics`,`warehouse-ops`); FE'da `grep unconvertedByCurrency apps/web` → **0 natija** | **TASDIQ** |
| `recentDocs` `deleted_at` ni filtrlamaydi | `dashboard.service.ts` UNION'ining 12 legida ham faqat `WHERE account_id = …` | **TASDIQ** |
| *(reja)* «`/money` ga ham unconverted-banner ula» | `money-operation.service.ts:87-110` — javob `totals.byCurrency` (**per-valyuta**, konsolidatsiya YO'Q) ⇒ `CurrencyTally` ham, `unconvertedByCurrency` ham u yerda YO'Q va **ma'noga ega emas** | **❌ REJA FORMULASI XATO** — `/money` konvertatsiya qilmaydi, demak «konvertatsiya qilinmagan qoldiq» tushunchasi unga tegishli emas. Sahifa Faza 17'da allaqachon per-valyuta qatorlar bilan ULANGAN. TEGILMADI (asos shu yerda) |

**Yon-topilma (bonus, rejada yo'q edi):** har 12 servisda `unconvertedByCurrency` aynan `mixedCurrency` dan
KEYINGI qator — ya'ni ikkalasi bitta interfeysning qo'shni maydonlari. Shu sababli FE tomonida ham
codemod anchor'i `mixedCurrency` bo'la oldi (deterministik, fail-closed).

### 2. O'zgarishlar

**(a) `truncated` banneri — 3 sahifa**

| Sahifa | Manba maydon | `data-test-id` |
|---|---|---|
| `/reports/stock-balance` | `data.truncated` (`PERF-10`) | `sb-truncated-warn` |
| `/reports/counterparty-balance` | `data.truncated` (`PERF-04`) | `cp-balance-truncated-warn` |
| `/analitika/mahsulotlar` | `pg.truncated` YOKI `stats.truncated` (`PERF-01`) | `items-truncated-warn` |

`/analitika/mahsulotlar` da IKKALA so'rov ham (`items` + `items/stats`) `truncated` qaytaradi va ikkisi
mustaqil cap'ga uriladi (Faza Q5 DEFER-1: `lowStockCount` hamon cap-oyna ichida) — shuning uchun banner
mantiqiy-YOKI bilan ikkalasini oqizadi, aks holda faqat KPI-lentasi yolg'on bo'lgan holat jim qolardi.

**(b) «Konvertatsiya qilinmagan» banneri — 12 hisobot sahifasi + dashboard (2 vidjet)**

FE: `aging`, `average-basket`, `cash-flow`, `counterparty-balance`, `pnl`, `profitability`,
`purchase-management`, `sales`, `sales-by-channel`, `sales-by-hour`, `unit-economics`, `warehouse-ops`
(10 tasi deterministik codemod bilan — anchor = `currency_mixed_warn` banner-quyrug'i, 1 martadan
uchrashi tekshirilib; `profitability` + `warehouse-ops` qo'lda, ular banner'ni boshqa ichki blokda
chizadi). Har birida javob-interfeysiga `unconvertedByCurrency: UnconvertedAmountRow[]` qo'shildi —
busiz prop abadiy `undefined` bo'lib banner **hech qachon** yonmasdi (bu aynan Q16'gacha bo'lgan holat).

BE — dashboard javob-shakli KENGAYTIRILDI (Faza 17 DEFER-2 aynan shuni so'raydi):
- `dashboard.schema.ts`: `OverdueBlock.unconvertedByCurrency` + `DashboardResult.money.unconvertedByCurrency`.
- `computeOverdueInvoices` → `seen.unconvertedRows()`.
- `loadMoneyByOrg` → endi `{ rows, unconvertedByCurrency }` qaytaradi; `TtlCache<MoneyByOrgResult>`.
  **Sabab (kesh gotcha'si):** tally rows bilan BIR keshda yurishi shart — kesh-hit tally'ni tashlab
  yuborsa banner 30 s ga o'chib qolar, u ogohlantirayotgan raqamlar esa ekranda qolardi.
- `computeOverdueOrders` → `[]` **ataylab**: u umuman konsolidatsiya qilmaydi (`aggregate` `sum_minor` ni
  valyutalar bo'ylab face-value qo'shadi), demak «tashlab ketilgan» summa yo'q. Yolg'on bo'sh emas —
  **haqiqiy** bo'sh; face-value jamining o'zi esa alohida ochiq topilma (quyida DEFER-1).
- `loadMoneyChart` tally'si ATAYLAB qaytarilmaydi: grafik by-org bilan bir xil 4 jadvalni bir xil
  `state='posted'` predikati bilan o'qiydi va faqat 6 oylik oyna qo'shadi ⇒ uning konvertatsiya
  qilinmagan valyutalar to'plami by-org'nikining **osti-to'plami**. Bitta banner butun «Деньги»
  bo'limini (jami + org-jadval + grafik) qoplaydi; ikki oynani jamlash esa yolg'on son berardi.
  Bu argument kodda ham, sxemada ham yozib qo'yildi.

**(c) `recentDocs` `deleted_at IS NULL` — 12 leg.** Deterministik skript (anchor 12 marta topilmasa
`exit 1`) `WHERE account_id = accountId::uuid` → `… AND deleted_at IS NULL`. **Faza 26 shakl-qulfi
SAQLANDI:** har legning `ORDER BY updated_at DESC LIMIT 20` i tegilmadi va endi test IKKALA yarmini ham
alohida qulflaydi (12 filtr VA 12 limit) — chunki 0.55 ms vs 66 ms o'lchovi so'rov SHAKLIga bog'liq,
`WHERE` bandiga emas, va keyingi sessiya filtr qo'shayotib limitni «ortiqcha» deb olib tashlamasligi kerak.
Sxema tekshirildi: 12 modelning HAMMASIDA `deletedAt` ustuni bor.

**(d) Umumiy komponent** — `apps/web/src/components/reports/report-notices.tsx` (yangi):
`TruncatedNotice` + `UnconvertedNotice`. Ikkalasi ham hech nima aytilmasa `null` qaytaradi (doim
ko'rinadigan banner = shovqin = bannersizlik). Stil mavjud `currency_mixed_warn` banneridan olindi.
Element `<output>` (biome `a11y/useSemanticElements` `role="status"` li `div` ni rad etadi; `<output>`
ning implicit roli aynan `status` — a11y yo'qolmadi). Summa o'z valyutasida, `displayAs:'none'` bilan
formatlanadi va kod matn shablonidan chiqadi (banner mazmuni AYNAN valyuta kodi).

**(e) i18n** — yangi top-level namespace `report_notices` (ru + uz), 3 kalit:
`truncated` · `unconverted_title` · `unconverted_row`.
**Grounding (CLAUDE.md §4):** bu MoySklad'da mavjud bo'lmagan yangi banner (capture'da field-roli yo'q,
`moysklad-reference` dir ham yo'q — `moysklad-reference-dir-missing` xotirasi), shuning uchun
**loyihaning o'z lug'atidagi ogohlantirish-registri** baza qilib olindi: «Внимание: …» prefiksi
lug'atda **14 marta** field-rolда uchraydi (`currency_mixed_warn` ×12, `duplicate_warning`,
`cash_overdrawn_warning`); «не найден» naqshi ham lug'atda o'nlab marta. Field-label KO'CHIRILMADI,
ya'ni §4 ning misground bug-klassi bu yerga taalluqli emas — hujjatlashtirildi.

### 3. TDD — RED jonli o'lchandi

| Test fayl | RED | GREEN |
|---|---|---|
| `apps/api/…/report/dashboard.service.test.ts` (**Edit**, +5 test) | **4 failed / 8 passed (12)** — `deleted_at IS NULL` ×12 → `undefined`; `overdueInvoices.unconvertedByCurrency` → `undefined`; `money.unconvertedByCurrency` → `undefined` (×2) | **12/12** |
| `apps/web/src/components/reports/report-notices.test.tsx` (yangi, 6 test) | **1 fayl failed, 0 test collected** — `Failed to resolve import './report-notices'` | **6/6** |
| `apps/web/src/__tests__/report-notices-wiring.test.ts` (yangi, 21 test) | **16 failed / 5 passed (21)** | **21/21** |

5 ta yangi API testdan **1 tasi ataylab yashil tug'ildi** — Faza 26 shakl-qulfini qayta-tasdiqlovchi
regress-test (12 `ORDER BY … LIMIT`); u RED bo'lishi kerak EMAS, u filtr qo'shilishi shaklni
buzmaganini isbotlaydi.

Stsenariylar: (1) `truncated: true` da banner render / `false` da umuman render yo'q / `undefined` da
yo'q; (2) `unconvertedByCurrency` qatorlari valyuta-kodi + major summasi bilan ko'rinadi, bo'sh
ro'yxatda banner yo'q; (3) `recentDocs` SQL'ida **12 ta `deleted_at IS NULL` VA 12 ta per-leg
`ORDER BY … LIMIT`** (ikkalasi ham, alohida assert).

`report-notices-wiring.test.ts` — `pos-i18n-guard.test.ts` naqshi (`i18n-gate-blind-to-components`
xotirasi): key-existence skaneri `app/(app)` dan tashqarini KO'RMAYDI, shuning uchun yangi komponent
kalitlari shu test bilan ikkala lokalda qoplandi. Qo'shimcha invariant — banner **mount qilingan**mi
va sahifaning o'z tipida maydon **bor**mi (ikkinchisi bo'lmasa prop abadiy `undefined`).

### 4. Gate (jonli o'lchangan)

- `pnpm --filter @moysklad/web typecheck` → **0 xato**
- `pnpm --filter @moysklad/api typecheck` → **11 xato, HAMMASI parallel sessiyaning fayli**
  `hr/hr-employee/onboarding.service.ts` da (`employeeOnboarding` Prisma-modeli hali generatsiya
  qilinmagan — ular `schema.prisma` ustida ishlamoqda). Mening 3 API faylimda 0. §6.1 bo'yicha tegilmadi.
- `pnpm i18n:gate` → **9/9 yashil** (417 fayl, 12 422 kalit)
- `pnpm lint:product` → **10 xato, HAMMASI parallel sessiyaniki** (`hr-employee/onboarding*`,
  `lib/domain-status-tone.ts`, `hr/employees/_components/note-journal*`, `menejer/{javobgarlik,jonli}`).
  O'z 27 faylimda: `npx biome check <ro'yxat>` → **0 xato**, 13 warning (tegilmagan qatorlardagi eski
  `nursery/useSortedClasses`).
- `pnpm --filter @moysklad/api exec vitest run src/modules/report src/modules/analitika` →
  **52 fayl / 513 test yashil**
- Web to'liq suite → **195 fayl / 2919 passed / 26 skipped**
- API to'liq suite, 3 shard → 1946 + 1902 + 2200 = **6048 passed / 2 skipped**

**Sanoq nazorati (baza: Faza Q15 — API 5943/2, web 2849/26):**
- API `5943 + 5 (meniki) = 5948`, o'lchangan **6048** ⇒ **+100 parallel sessiyadan**
  (hr-onboarding, manager-kpi, live-status, employee-note testlari — hammasi ularning untracked
  fayllarida). **Regress 0.**
- Web `2849 + 27 (meniki) = 2876`, o'lchangan **2919** ⇒ **+43 parallel sessiyadan**
  (menejer-live-boards, employee-card-360, note-journal). Skip soni **26 → 26 o'zgarmadi**.
- Shard-2 da **4 yiqilish ko'rindi** (`publication.service.test.ts` ×3,
  `permissions/mutation-guard-coverage.test.ts` ×1) — hammasi ~5 000 ms da, ya'ni **timeout**, xato
  emas. Yakka yugurtirilganda: **72/72 yashil** (371 ms / 306 ms / 1 919 ms). Sabab: argon2 CPU-bound
  hashlar + og'ir DI-graf testi to'liq-suite yuklamasida vitest'ning 5 s chegarasiga urildi. Mening
  o'zgarishim `report/` ichida — bu ikki modulga tegmaydi.

### 5. Parallel sessiya sharoiti (CLAUDE.md §6)

Daraxtda parallel sessiya faol (hr-employee onboarding/note, manager kpi/live, menejer sahifalari,
`schema.prisma`, `layout.tsx`, `lib/{hr-api,manager-api,domain-status-tone}.ts`) + foydalanuvchining
o'z fayllari. HECH BIRIGA TEGILMADI.

**`messages/{ru,uz}.json` — UMUMIY fayl, hunk-darajasida ajratildi.** Ikkala fayl ham parallel
sessiyaning ~100 qatorini VA mening 5 qatorimni saqlaydi. `git add` butun faylni oladi, `git add -p`
bu muhitda yo'q ⇒ indeks blob'i **qo'lda yasaldi**: `git show HEAD:<fayl>` + faqat mening
`report_notices` blokim → `git hash-object -w` → `git update-index --cacheinfo`. Ishchi daraxt
TEGILMADI (ularning tahriri joyida qoldi), commit'ga esa faqat mening 5 qatorim tushdi.
Hook'lar bir martaga chetlab o'tildi (`-c core.hooksPath=/dev/null`) — §6.7 B: lint-staged butun
daraxtni stash/restore qilib begona faylni commit'ga qo'shadi. Gate'lar shu sababli **qo'lda to'liq**
yugurtirildi (yuqoridagi raqamlar).

Bu yozuv faylga **append** bilan qo'shildi — marker-kesish YO'Q (`doc-append-marker-truncation`
xotirasi), Q1–Q15 yozuvlariga TEGILMADI.

### 6. Qolgan qarz / DEFER

1. **`overdueOrders` valyutalarni face-value qo'shadi** (`customerOrder.aggregate({_sum: {sumMinor}})`)
   — USD buyurtma UZS tiyin bilan bir xil songa qo'shiladi. Bu M-12 bug-klassining **buyurtma
   tomonidagi qolgan qismi**; Faza 17 uni faqat schyot/pul yo'llarida yopgan. Banner bu yerda halol
   bo'sh, chunki tashlab ketilgan summa yo'q — **noto'g'ri qo'shilgan** summa bor. To'g'ri yechim:
   `GROUP BY currency` + `consolidateToBase` (overdue-invoice naqshi). O'lchanmagan, alohida faza.
2. **`dashboard.service.ts` ning 4 konsolidatsiya o'rni hamon JORIY kursda** (Faza Q8 DEFER-1) —
   tarixiy kurs (`rate_value`) bu fazada tegilmadi, faqat ko'rinuvchanlik qo'shildi.
3. **`/reports/{abc-analysis,returns-ratio,slow-movers,inventory-variance}`** sahifalarida banner YO'Q —
   ularning servislari `unconvertedByCurrency` maydonini umuman qaytarmaydi (tekshirildi: 12 servis
   ro'yxatida yo'q). Ular pul-konsolidatsiya qilsa — avval BE tomoni kerak.
4. **`truncated` faqat 3 sahifada.** Boshqa cap'li hisobotlar bo'lsa, ular avval API'da bayroq
   chiqarishi kerak — hozircha bayroq aynan shu 3 endpointda bor (o'lchandi).
5. **Grafik tally'si javobda yo'q** (§2b, ataylab). Agar kelajakda grafik oynasi by-org predikatidan
   ajralib ketsa (masalan boshqa `state` filtri), osti-to'plam argumenti buziladi — o'sha o'zgarish
   bilan birga alohida maydon kerak bo'ladi. Kodda izoh qo'yilgan.
6. **Kesh + banner nomuvofiqligi oynasi** — `money.unconvertedByCurrency` 30 s TTL keshdan keladi
   (Faza 26). Kurs kiritilgandan keyin banner yarim daqiqagacha qolishi mumkin. Ataylab: bu raqamlar
   bilan bir xil eskirish, ikkisi hech qachon bir-biriga zid bo'lmaydi.
7. **Browser-smoke YO'Q.** 16 sahifaning birortasi ham real brauzerda ochilmadi; bannerlar faqat
   RTL/happy-dom da render bo'ldi. Ayniqsa tekshirilishi kerak: dashboard `OverduePanel` ichida
   banner `<section>` oxirida joylashuvi va `/analitika/mahsulotlar` KPI-lentasi ostidagi joylashuv —
   Phase-2 QA cohortiga.

**Commit:** `feat(report): faza q16 — truncated + konvertatsiyasiz bannerlar, recentdocs deleted_at`

---

## Faza Q17 — Decimal-primitivlar uyi (`shared/decimal.ts`) + qoldiq float'lar (2026-08-09) — **Phase-1: strukturaviy + unit-tasdiqlangan, browser-smoke YO'Q**

**Manba:** Faza 34 hisoboti DEFER-4/DEFER-5 + Faza Q4 hisoboti DEFER-7.

### Da'volarni tasdiqlash (kodda, o'z ko'zim bilan)

| Da'vo (manba) | Kodda ASLIDA (HEAD `65275f68`) |
|---|---|
| Reja: «`demand/fifo-consumer.ts` — 11 import» | ❌ **11 EMAS.** O'z o'lchovim: `from '…fifo-consumer.js'` **21 faylda**; qo'shimcha 2 faylda (`loss/loss-cogs.test.ts`, `sales-return/returns-cogs.test.ts`) yo'l **escape-regex** sifatida source-scan qulfida turibdi (import EMAS — resolver ko'rmaydi), 1 faylda (`stock/stock.service.ts:87`) izohda. Faza 34 dan beri o'sgan |
| F34 DEFER-4: `analysis.service.ts:294`, `count.service.ts:301` `Number(s.qty)` | ✅ ikkalasi ham aynan shu satrlarda; **+2 qo'shimcha** o'zim topdim: `analysis.service.ts:275,285` `Number(r.quantity)` va undan yasalgan **float pul** (`BigInt(Math.round(q * Number(r.priceMinor)))`), `count.service.ts:718` `Number(stock.qty)` (DB'ga **yoziladigan** `expectedQty`) |
| Q4 DEFER-7: `demand-cost-basis.ts → move-cost-basis.ts` modullararo leaf-import | ✅ `demand/demand-cost-basis.ts:13` `import { computeTransferCost } from '../move/move-cost-basis.js'` |
| **+1 o'zim topdim (auditda yo'q)** | `sales-return.service.ts:355` `available: String(Number(onHand) - Number(reserved))` — **`STK-12` ning UCHINCHI nusxasi**. Faza 34 `customer-order` va `internal-order` dagi ikkitasini yopib `availableOf()` yaratgan, bu esa qolib ketgan va mijozga `"2.8000000000000003"` jo'natardi |
| **+1 o'zim topdim** | `sales-return.createFromDemand` / `purchase-return.createFromSupply`: `remaining = Number(qty) − alreadyReturned` **stringga qaytariladi** (`String(remaining)`) → to'liq qaytarilgan satrda float qoldig'i `5.5e-17`, ya'ni `"5.5e-17"` — **eksponent literal, Decimal EMAS** ⇒ hech narsa qolmagan satr uchun **fantom pozitsiya** oldindan to'ldiriladi. `+ 1e-7` epsilon guard aynan shu drift'ni yopish uchun qo'yilgan edi |

### Qaror: **to'liq ko'chirish + `demand/fifo-consumer.ts` deprecate re-eksport shim**

Ikki variant ko'rildi (topshiriq §3a):

1. **Eski faylni butunlay o'chirish** — **RAD ETILDI**, chunki undan import qiladigan ikki fayl
   (`store/cell-migration.ts`, `store/cell-migration.runner.ts`) shu paytda **parallel sessiyaning
   egaligida** (CLAUDE.md §6.1 — begona faylga yozish TAQIQ). O'chirish ularning ishini yiqitardi.
2. **Re-eksport shim — TANLANDI.** Implementatsiya **butunlay** `shared/decimal.ts` ga ko'chdi
   (nusxa YO'Q — Faza 34 aynan nusxa-sinfini `stock.service.ts` dan o'chirgan edi), eski faylda
   faqat `export { … } from '../shared/decimal.js'` va `@deprecated` izohi qoldi.
   **Qarz ko'rinadigan qilindi:** `decimal-home.test.ts` da `LEGACY_IMPORTERS` allowlist bor va
   ikki test uni ikki tomondan qulflaydi — (a) allowlist'dan tashqari hech kim eski yo'lni import
   qilmasligi, (b) allowlist **aynan** shu ikki fayl ekani (ya'ni **o'sa olmaydi**, faqat qisqaradi).
   Uchinchi test shim'da arifmetika qolmaganini tekshiradi (`function` / `const SCALE` yo'qligi).

**Q4 DEFER-7 ham yopildi:** ikkala sof cost-basis leaf `shared/` ga ko'chdi
(`shared/move-cost-basis.ts`, `shared/demand-cost-basis.ts`) ⇒ `demand/… → ../move/…`
yo'nalishsiz modullararo import endi **lokal** (`./move-cost-basis.js`). Test fayllari
**o'z domenida qoldirildi** (`demand/demand-cost-basis.test.ts`, `move/move-cost-basis.test.ts`) —
ular `readFileSync(join(__dirname, 'demand.service.ts'))` bilan **domen manbasini** skanerlaydi,
ko'chirilsa o'sha yo'llar buzilardi.

### Codemod — deterministik, fail-closed (0 token)

`scratchpad/q17-codemod.mjs`. Naqsh: har import spetsifikatori faylning **ESKI** katalogiga nisbatan
rezolv qilinadi va faylning **YANGI** katalogiga nisbatan qayta yoziladi (ya'ni ko'chayotgan faylning
o'z importlari ham to'g'ri qayta hisoblanadi). Yozishdan **oldin** uch tekshiruv:
(1) o'zgargan fayllar to'plami `EXPECTED_FILES` bilan **aynan** teng, (2) har `TEXT_ANCHORS`
(escape-regex source-scan qatorlari) topilgan, (3) `FROZEN` (parallel sessiya) fayllari hamon shim'ni
ishlatadi. Har qanday nomuvofiqlikda **hech narsa yozilmaydi va `exit 1`**.

Jonli isbot: birinchi `--check` yugurishi **4 xato bilan to'xtadi** (2 anchor escape-darajasi noto'g'ri
+ 1 kutilmagan fayl + 2 kutilgan-lekin-o'zgarmagan) — hech narsa yozilmadi. Tuzatilgandan keyin
`--check` toza, `--apply` bajarildi. **Ikkinchi `--apply` yana fail-closed to'xtadi**
(`MOVE SOURCE MISSING` / `TARGET ALREADY EXISTS`) — ya'ni skript qayta-yugurishda jimgina yarim ish
qilmaydi.

**O'lchov: 26 fayl o'zgardi, 27 spetsifikator/anchor qayta yozildi** (shundan 4 tasi `git mv`).

### Fayllar

| Fayl | O'zgarish |
|---|---|
| `apps/api/src/modules/demand/fifo-consumer.ts` → `apps/api/src/modules/shared/decimal.ts` | **KO'CHDI** (`git mv`, implementatsiya bit-ma-bit o'zgarmadi) + fayl-doc tarixni va yangi shartnomani yozadi |
| `apps/api/src/modules/demand/fifo-consumer.test.ts` → `apps/api/src/modules/shared/decimal.test.ts` | **KO'CHDI** (`git mv` + import yo'li) |
| `apps/api/src/modules/move/move-cost-basis.ts` → `apps/api/src/modules/shared/move-cost-basis.ts` | **KO'CHDI** (Q4 DEFER-7) |
| `apps/api/src/modules/demand/demand-cost-basis.ts` → `apps/api/src/modules/shared/demand-cost-basis.ts` | **KO'CHDI** (Q4 DEFER-7); `../move/…` importi `./move-cost-basis.js` bo'ldi |
| `apps/api/src/modules/demand/fifo-consumer.ts` | **YANGI (shim)** — `@deprecated`, 9 nomni re-eksport qiladi, arifmetika YO'Q; o'chirish sharti izohda |
| `apps/api/src/modules/shared/decimal-home.test.ts` | **YANGI** — 6 test (primitivlar + float-dalil + 3 ta uy/allowlist qulfi) |
| `apps/api/src/modules/analitika/analysis.service.ts` | qty agregatlari **mikro-bigint**, pul `computeLineCost` bilan (float ko'paytma yo'q); DTO chegarasida bir marta `Number(formatDecimalScaled(…))`; `soldShare` maxraji mikro-bigint |
| `apps/api/src/modules/analitika/count.service.ts` | yangi `decimalQty()` yordamchisi (parse→format→Number); `stockByProduct` va `loadStockQty` shunga o'tdi |
| `apps/api/src/modules/analitika/analitika-qty-precision.test.ts` | **YANGI** — 6 test (float-drift dalili + 2^53 + izohsizlantirilgan manba-skan) |
| `apps/api/src/modules/sales-return/sales-return.service.ts` | `available` → `subtractDecimals` (`STK-12` 3-nusxa); `createFromDemand` remaining/guard → `subtractDecimals`+`compareDecimals` (`1e-7` epsilon olib tashlandi); post-vaqt kümülativ cap → `addDecimals`/`compareDecimals` |
| `apps/api/src/modules/purchase-return/purchase-return.service.ts` | ayni o'zgarishlar `createFromSupply` + post-vaqt cap uchun |
| `apps/api/src/modules/sales-return/returns-qty-precision.test.ts` | **YANGI** — 5 test |
| `apps/api/src/modules/sales-return/returns-cogs.test.ts` | **Edit** (Write EMAS) — import-qulfi ko'p-nomli blokka moslandi (invariant o'zgarmadi) |
| 19 ta import-fayli | `customer-order`, `demand` (2), `internal-order`, `inventory`, `loss` (2), `move`, `product` (2), `purchase-return`, `retail-sale` (2), `sales-return` (2), `stock`, `supply` (2), `work-order` (2) — codemod bilan |

### Testlar — RED **jonli o'lchandi**, keyin GREEN

**RED-1** (`decimal-home.test.ts` + `analitika-qty-precision.test.ts`, fix'dan oldin):
`Test Files 2 failed (2)` · `Tests no tests` — ikkala suite **yuklanmadi**
(`Failed to load url ./decimal.js` / `../shared/decimal.js`), ya'ni 12 test umuman hisobga kirmadi.

**RED-2** (`returns-qty-precision.test.ts`): `Test Files 1 failed (1)` · `Tests no tests` — o'sha sabab.

**Oraliq RED** (codemod + fix'dan keyin, birinchi to'liq yugurish):
`Test Files 3 failed | 50 passed (53)` · `Tests 7 failed | 927 passed (934)`. Yettitasi **haqiqiy
signal** edi, ikki turli sinfda:
- **4 tasi mening test xatolarim** — (a) shim-regex `.*` yangi qatordan o'tmaydi; (b) float-dalil
  sifatida tanlagan `0.1+0.2+0.3+0.1+0.3` **aynan 1 chiqadi** (drift YO'Q — taxminim noto'g'ri edi,
  `node` bilan o'lchab `0.1+0.1+0.1 = 0.30000000000000004` ga almashtirdim); (c) `Math.round(0.615*100)`
  **62 qaytaradi**, ya'ni misolim teskari edi — o'lchab `1.005*100 = 100.49999999999999` (float **100**,
  aniq half-up **101**) ga almashtirdim; (d) manba-skan **o'z izohimni** kod deb hisoblab qizil bo'ldi
  → skan izohsizlantirilgan manbada ishlaydigan qilindi.
  *(«Audit misollari o'lchanmagan» xotirasining aynan takrori — bu safar RED o'lchovi tutdi.)*
- **2 tasi haqiqiy regress** — `returns-cogs.test.ts` ning import-qulfi bir nomli `import { … }` qatorini
  kutardi; men ikkala servisga bir necha primitiv qo'shganim uchun blok ko'p-nomli bo'lgan.
  Invariant **mohiyatan o'zgarmagani** uchun ifoda kengaytirildi (`Edit`, Write EMAS).

**GREEN:** `shared + analitika + sales-return + purchase-return` → **53 fayl / 934 test**, 0 yiqilish.
Yangi + ko'chgan 4 fayl yakka yugurtirilganda **51/51**.

### Gate (jonli o'lchangan, path-cheklangan — parallel sessiya ishi ajratildi)

| Buyruq | Natija |
|---|---|
| `pnpm --filter @moysklad/api typecheck` | **2 xato — ikkalasi ham PARALLEL sessiyaniki**: `hr/hr-employee/offboarding.service.ts(57,5)` va `manager/live/live-status.service.ts(132,24)` (`openEquipmentCount` maydoni ularning yangi `AutoFacts`/`DutyInput` tipida). **Mening 26 faylimda 0 xato** — hech biri xato ro'yxatida yo'q |
| `npx biome check <mening 32 faylim>` | **0 error**, 2 warning (`noNonNullAssertion`, `useTemplate` — ikkalasi ham ko'chgan fayldagi eski kod, siyosat bo'yicha ruxsat). `pnpm lint:product` TO'LIQ yugurtirilmadi: u parallel sessiyaning formatlanmagan yangi fayllarini (`shared/acceptance-fsm.ts` va h.k.) ham qamraydi va meniki bo'lmagan xatolar beradi |
| `vitest run` (topshiriqdagi 12 modul + `shared`, `sales-return`, `purchase-return`, `store`) | **128 fayl / 1913 test — 0 yiqilish** |
| To'liq API suite, **3 shard** (`--shard=N/3 --reporter=dot`) | **465 fayl (1 skip) / 6236 test** — **6228 passed · 2 skipped · 6 failed**. Oltala yiqilish **PARALLEL sessiyaniki**: 5 tasi `hr/hr-equipment/equipment.service.test.ts` (butun katalog `git status` da **untracked** — ularning yangi moduli, yuqoridagi typecheck xatolari bilan bir sabab), 1 tasi `permissions/mutation-guard-coverage.test.ts` — u **yakka yugurtirilganda 51/51 yashil** (shard'da CPU raqobati timeout'i, Faza 34 hujjatlagan sinf) |
| **Sanoq nazorati** | Baza (topshiriq): **6048 passed / 2 skipped**. Hozir: **6228 passed**. Δ = **+180**. Shundan **meniki +17** (6 `decimal-home` + 6 `analitika-qty-precision` + 5 `returns-qty-precision`; `decimal.test.ts` **ko'chdi**, test qo'shmadi). Qolgan **+163** — parallel sessiyaning yangi testlari (`hr-equipment`, `manager/kpi/kpi-accrual*`, `manager/live/accountability`, `hr-employee/offboarding` — hammasi `git status` da untracked/modified va meniki emas). **Jim yo'qolgan test YO'Q** |
| Migratsiya / `i18n:gate` / web | Qo'llanmaydi — sxema, UI-matn va web tegilmadi |

### O'zgarish mohiyati (b qismi)

**`analysis.service.ts`.** Ilgari har satr `Number(r.quantity)` ga aylanib **yig'ilardi**
(`cur.qty += q`, keyin `purchasedQtyTotal += pur.qty`) — minglab kasr satrda drift kafolatlangan.
Yomonrog'i, **pul** ham o'sha float'dan yasalardi: `BigInt(Math.round(q * Number(r.priceMinor)))` —
(a) float ko'paytma yaxlitlash chegarasining **noto'g'ri tomoniga** tushishi mumkin (test:
`1.005 × 100` ⇒ float 100, aniq 101), (b) `Number(priceMinor)` 2^53 tiyindan katta narxni **qisadi**.
Endi qty **mikro-bigint**da yig'iladi, satr qiymati esa **`computeLineCost`** bilan — ya'ni hisobot
har posting yo'li ishlatadigan **aynan o'sha** arifmetikani ishlatadi (hisobot va jurnal
konstruksiya bo'yicha kelishadi). `number` ga aylantirish **faqat DTO chegarasida**, bir marta
(`AnalysisProduct` shartnomasi `number` — o'zgartirilmadi, FE'ga tegmaslik uchun).

**`count.service.ts`.** `decimalQty()` — parse→format→Number. Bu **kanonikalizatsiya**: 20-raqamli
Prisma Decimal to'g'ridan-to'g'ri double'ga tushmaydi va yaxlitlash nuqtasi **bitta oshkora qadam**
bo'ladi. Chegarasi hisobotda halol yozilgan (pastda, qarz 3).

**Qaytarish hujjatlari.** `remaining` endi `subtractDecimals`, taqqoslash `compareDecimals` —
shu sababli **`+ 1e-7` epsilon guard'lari olib tashlandi** (ular faqat float drift'ini yopish uchun
bor edi; ikkala tomon aniq bo'lgach, ular **haqiqiy** kam-oshiq qaytarishni ham o'tkazib yuboradigan
teshik). Diqqat: bu **qat'iylashtirish** — ilgari `1e-7` gacha oshiq qaytarish o'tardi, endi o'tmaydi.
Kiruvchi `quantities` Zod'da `^\d+(\.\d{1,6})?$` bilan qulflangani tasdiqlandi, ya'ni
`parseDecimalScaled` uchun kirish har doim yaroqli.

### Qolgan qarz / DEFER

1. **🔴 Browser-smoke YO'Q.** Hech bir sahifa real brauzerda ochilmadi — Phase-2 QA cohortiga.
   Ayniqsa: kontragent **«Анализ»** ekrani (qty/pul jamlari endi boshqa arifmetikadan keladi —
   eski float qiymatlardan bir necha tiyin/mikro farq qilishi **kutilgan**), `analitika/count`
   `expectedQty`, va qaytarish hujjatlarining «Доступно» ustuni.
2. **`demand/fifo-consumer.ts` shim'i qoldi** — `store/cell-migration.ts` va
   `store/cell-migration.runner.ts` parallel sessiya egaligida bo'lgani uchun. Ular bo'shagach
   ikki importni `../shared/decimal.js` ga o'tkazib **shim faylni o'chirish** kerak;
   `decimal-home.test.ts` dagi `LEGACY_IMPORTERS` ham bo'shatiladi (o'sha test allowlist o'sishini
   bloklaydi, ya'ni qarz jim kengaya olmaydi).
3. **`AnalitikaCount.expectedQty` hamon `number` sifatida DB'ga yoziladi** — 2^53 mikro-birlikdan
   (≈9×10⁹ dona) katta miqdorlar **yozuvda** hamon yaxlitlanadi. To'liq yechim = ustunni va
   `computeVarianceStatus` ni decimal-stringga o'tkazish, ya'ni **API-shartnoma o'zgarishi**
   (`CountProductRow`, `variance-status.util.ts`, FE) — alohida ish. Kod izohida yozilgan.
4. **`AnalysisProduct` / `AnalysisStats` DTO'lari hamon `number`** — servis ichi endi aniq, lekin
   HTTP chegarasi float. Faza 34 DEFER-2/3 bilan bir paket (`qty/reservedQty` string-decimal).
5. **Yopilmagan bir sinfdagi qoldiq float'lar (o'lchandi, ro'yxatlandi, TEGILMADI).** Grep
   (`Number(` + `qty|quantity|reserved`) bo'yicha topilgan, kamayish tartibida:
   - **Yozuv yo'lida (eng xavflisi, keyingi faza nomzodlari):** `bom/bom.service.ts:338`
     (`Math.round(Number(c.qty) * 1e6)` — `STK-08` sinfi), `edo/edo.service.ts:394` (ayni shakl),
     `processing-order/processing-order.service.ts:204,410` (`×1000` skalasi float orqali).
   - **Guard/hisob-kitob:** `purchase-order.service.ts:1476`, `counterparty-statement.service.ts:472`,
     `supply/overhead-distribution.ts:57`, `inventory.service.ts:294` (ro'yxat ko'rinishi),
     `product/product.service.ts:533` (`Number(s.qty.toFixed(6))` yig'indisi).
   - **Sof hisobot-agregatlari (past xavf):** `analitika/items.service.ts` (4 joy),
     `analitika/order.service.ts:112`, `report/*` (~12 joy: `abc-analysis`, `average-basket`,
     `inventory-variance`, `profitability`, `report.service`, `returns-ratio`, `sales-by-channel`,
     `sales-by-hour`), `print-template/*` (3 joy), `pick-list/*` (2 joy),
     `moysklad-compat.service.ts:887`.
   - **TEGILMADI (parallel sessiya):** `store/store-address.service.ts:449,474`.
6. **Sxema-fayl nomi va tarixi.** `shared/decimal.ts` git tarixi `demand/fifo-consumer.ts` dan davom
   etadi (`git mv` — `git log --follow` ishlaydi), lekin **eski commit'lardagi yo'l** boshqa.
   Kelajakdagi arxeologiya uchun shu yerda qayd etildi.
7. **`pnpm lint:product` to'liq yashil emas** — parallel sessiyaning formatlanmagan yangi fayllari
   sababli. Mening fayllarim uchun `biome check` **0 error**. Ular commit qilgach gate qayta
   yugurtirilishi kerak.

**Commit:** `refactor(api): faza q17 — decimal primitivlar shared/decimal.ts ga + qoldiq float'lar`
**Parallel sessiya sharoiti (CLAUDE.md §6):** bu checkout'da MK/HR sessiyasi faol
(`manager/kpi/*`, `hr/hr-equipment/*`, `hr/hr-employee/offboarding*`, `manager/live/*`,
`permissions/*`, `store/*`, `packages/db/prisma/schema.prisma`, `NEXT.md`, `todo.md`,
`docs/REJA-8-BOLIM-*`, `docs/REJA-MENEJER-KASSA-*`). Ularning **hech bir fayliga tegilmadi** va
`git add` faqat aniq yo'llar bilan qilindi; codemod'ning `FROZEN` ro'yxati buni mexanik ravishda
kafolatladi.
