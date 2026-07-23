# NEXT — Keyingi sessiya entry point

> **Foydalanuvchi shu fayl haqida bilishi shart bo'lgan yagona narsa:**
> Yangi sessiya'da faqat `davom et` deb yozing. Boshqa hech narsa kerak emas.

## 🎯 MAQSAD (o'zgarmas)

**Butun ilovani moysklad.uz bilan 1ga-1 qilish** — ishlashi bilan ham, **ko'rinishi bilan ham**
(o'lcham/rang/shrift/joylashuv/filter/tugma/modal/xulq — moysklad bilan farqsiz). Manba:
`online.moysklad.ru` (real akkaunt). Sifat birinchi · to'liq 1:1 tugaguncha «done/100%» yo'q.

**Umumiy holat (3 qatlam):** strukturaviy/funksional Phase-1 ✅ (63/67 detail + 71 list audit) ·
runtime QA Phase-2 🟡 (qisman, production-ready EMAS) · **vizual pixel-1:1 🚧 endi boshlandi**
(customer-order /new = 1-namuna sahifa, ~90%). To'liq holat: [`docs/PARITY-STATUS.md`](docs/PARITY-STATUS.md).

---

## Avtomat protokol (Claude bajaradi)

> **⚙️ ISH REJIMI (2026-06-07, 2026-06-11d tahriri bilan — MAJBURIY, `CLAUDE.md` §0):** **juda yuqori sifat** (gate +
> adversarial QA + runtime verify) va **HAMMASI OPUS'da** (subagent/fan-out ham Opus — `model:'sonnet'` UZATMA; foydalanuvchi
> 2026-06-11d da QAYTA tasdiqladi: tejash modeldan EMAS). Tezlashtirish = Workflow fan-out (ijro parallel, review markazda).
>
> **💸 TOKEN-IQTISOD PROTOKOLI (2026-06-11d, foydalanuvchi qarori — limit 1 kunda 3 kunlik ketayotgani tahlilidan;
> sifat o'lchovlariga TEGILMAYDI, model OPUS qoladi):**
> 1. **Pre-flight = `node scripts/preflight.mjs`** (~0 token, deterministik: tree-clean · NEXT.md hash'lari git'da bor ·
>    hand-off freshness · progress.json konsistensiya · MEMORY.md limit · portlar). **GO → ishni boshla; session-start-audit
>    workflow FAQAT script ANOMALIYA chiqarsa** (3-4 Opus agent ≈ 250–320k token — jonli o'lchangan; endi default EMAS).
>    `--harness` flag = optimistic-lock jonli battery (runtime-ish oldidan).
> 2. **Sessiya hajmi = 1 flagship (+1 mayda) → commit → SESSIYA TUGAYDI.** Marafon yo'q: kontekst xarajati sessiya
>    uzunligi bilan ~kvadratik o'sadi; 11b'da 16-agent recon sessiya-limitida o'lib qayta to'langan. «Bir necha ish» endi
>    «bir necha SESSIYA» orqali — har biri arzon boshlanadi (NEXT.md hand-off bor).
> 3. **Agentlar TO'LIQ test-suite yugurtirmaydi** — har agent faqat o'z target-faylini testlaydi; to'liq gate markazda,
>    commit-nuqtada 1 marta.
> 4. **Ultracode/Workflow — kerakli joyda** (haqiqiy ko'p-birlik ish: fan-out audit/sweep/recon), har turn'da emas;
>    mexanik ish uchun avval **deterministik script/codemod** (11b sabog'i: extractor > fan-out, 0 token).
> 5. **Katta tool-output kontekstga emas, faylga** (capture/log → fayl + qisqa xulosa); browser-snapshot target'lab.
>
> **🛡️ MULTI-AGENT WIRING XAVFSIZLIK PROTOKOLI (MAJBURIY — 2026-06-08c stash-tangle hodisasidan):** ko'p wiring/codemod agent
> BIR ishchi daraxtda ishlaydi → biri `git stash` ishlatsa hammasini chigallashtiradi. Oldini olish: (1) markaziy qismlarni
> (schema.prisma + migration + regen client) wiring agentlarni ishga tushirishdan OLDIN alohida commit qil; (2) har wiring agent
> prompt'ida «HECH QANDAY git buyrug'i ishlatma (stash/checkout/reset/commit yo'q), faqat nomli fayllarni tahrirla» bo'lsin;
> (3) qaytgach §2-verify — agent hisobotiga emas, fayllarni o'zing grep/awk bilan tekshir; (4) zarur bo'lsa `isolation:'worktree'`.
> Batafsil: xotira `feedback-multi-agent-wiring-protocol.md`.

Foydalanuvchi `davom et` deganda men:
0. **`node scripts/preflight.mjs`** — GO bo'lsa darhol ishga; ANOMALIYA bo'lsagina session-start-audit workflow.
1. Shu `NEXT.md` faylni o'qiyman + loyiha `CLAUDE.md` (§0 ish rejimi + Phase-1/2 + cohort-flow qoidasi auto-loaded)
2. Loyihaning `~/.claude/projects/<shu-mashina-yo'li>/memory/MEMORY.md` allaqachon auto-loaded (aniq yo'l mashina/papkaga qarab o'zgaradi — 2026-07-20'da qattiq yozilgan yo'l ikkinchi marta eskirgani uchun endi bu yerda ham hardcode qilinmaydi; `scripts/preflight.mjs`dagi `findMemoryPath()` avtomat topadi)
3. Eng oxirgi `session-*.md` faylni o'qiyman
4. **🚜 COHORT-FLOW (asosiy audit usuli)**: pastdagi «Cohort audit navbati»dan **keyingi cohort**ni olaman va
   **cohort-dvigatel** (`scripts/wf-cohort-detail-audit.js`) bilan ishlayman: premise (ref auto-correct + bias
   immunize) → per-page diff → completeness critic → har confirmed/critic kandidat **blind-verify**. Keyin har
   **confirmed** delta'ni o'zim ground-truth bilan tekshiraman (ko'r-ko'rona qo'llamayman) → fix (mexanik → Sonnet
   codemod) → gate (tc/biome/web) → commit → audit doc(lar) → navbatni yangilab cohort'ni ✅ qilaman.
   *(Maxsus topshiriq bo'lsa — pastdagi «Aniq keyingi vazifa» ustun turadi.)*
5. **Ortiqcha savol bermayman** — to'g'ridan-to'g'ri ishni boshlayman. Natija doim **«Phase-1, runtime-unverified»**
   deb halol belgilanadi (browser-QA = alohida Phase-2, QA-backlog'ga qara).

---

## 🚜 Cohort audit navbati (`davom et` shu tartibda ishlaydi)

> **DETAIL konveyer: `scripts/wf-cohort-detail-audit.js` — 63 parity-clone sahifa (A–L) TUGADI (Phase-1).**
> Har cohort = 1 oila. Tugagach cohort ✅ + audit doc + Phase-1 commit.
> **⚠️ Hisoblagich nuance (2026-06-06b da ochildi):** `264cc5ba` `settings/print-templates/{new,[id]}` editor sahifasini
> (YANGI feature, biz qurdik — moysklad-parity klon EMAS) qo'shdi → `pnpm progress` `[id]`/`new` dir'larni avtomat sanaydi,
> shu sababli `progress.json` `detail_pages` endi **63/64 (98%)** ko'rsatadi (oldin 63/63). Bu **parity-audit gap EMAS** —
> konveyer barcha 63 mavjud klon-sahifani qopladi; 64-sahifa = post-konveyer feature, parity-audit emas, FE browser-smoke
> qarzi (QA-backlog'da, boshqa 3 track bilan birga). Tarixiy session-loglardagi «63/63» o'sha payt to'g'ri edi (snapshot).

> ✅ **LIST-AUDIT KONVEYER A–L12 TUGADI (2026-06-05).** To'liq L1–L12 cohort tarixi VERBATIM arxivda:
> `docs/audits/_ARCHIVE-NEXT-2026-06-10.md` §1. Har cohort'ning rasmiy hujjati: `docs/audits/*-list.audit.md` (71 ta).

> **Phase-2 detail browser-QA = LOKAL track** (cron EMAS — DB+dev+Playwright kerak), men+siz bilan parallel.

| # | Cohort | Sahifalar | Holat |
|---|---|---|---|
| A | Production-core | processing-orders · processings · productions | ✅ 2026-06-03d (P1 clone tugma · P2 child-qty 1000× · PO1 BOM-math — 3 bug fixed) |
| B | Stock + internal | enters · losses · inventories · internal-orders | ✅ 2026-06-03e (enters/losses TOZA · inventories feature-gap defer · internal-orders 5 fix: money-format + externalCode + 3 uz-leak; ⚠️ capture contaminated 3/4) |
| C | Production-config | production/boms · production/processes · production/stages · production/work-orders | ✅ 2026-06-03f (W3 work-orders auditEntity `work_order`→`WorkOrder` = empty-History HIGH fix · S1/S2 stages materialStore+performers UUID→name (BE incl) · B4 boms outputQty>0 guard+test · W1/W2 work-orders dates+description · P1 processes label-as-error · cohort uz-leak i18n; auditEntity bug-class: tasks ✅, opportunities→G; work-orders/new docDate = BE feature-gap defer) |
| D | Money / returns | prepayments · prepayment-returns · counterparty-adjustments | ✅ 2026-06-03g (P1 retail-split `null`→400 wholesale-save-block HIGH fix [prepayments + prepayment-returns] · P2 prepayment-return refund-currency money-integrity: forced to source currency [over-refund hole] · P3 «remaining to return» net-of-prior-returns · counterparty-adjustments CLEAN; History-tab empty = cohort-wide BE audit-log feature DEFER; org-account scope = 2 of ~13 backlog) |
| E | Retail | retail/sales · retail/sessions | ✅ 2026-06-03h (RS1 hardcoded-Latin-uz leak HIGH fix [both pages, ~27 labels → i18n, RU-locale parity break; no-hardcoded gate is Cyrillic-only so it leaked] · RS2 drawer Внесение/Изъятие «Комментарий» feature-gap [BE accepts description, FE didn't send] · RS3 drawer money Number()*100 → Money.fromMajor · RS4 formatMoney till-currency; auditEntity=retail_sale vacuously-empty = correct) |
| F | Catalog items | bundles · services · variants · tracking-codes | ✅ 2026-06-03i (🔴 **products/[id] `api.put`→`api.patch`**: PATCH-only `@Patch` controller → every product Save 404'd, uncaught [e2e skips edit path] — my GT find, engine treats products as reference · bundles/services `auditEntity` `Bundle`/`Service`→`Product` = empty-History fix [BE logs 'Product'] · variants buy-price label `tCommon('created')`→`t('buy_price_label')` [«Закупочная цена», products-consistent, [id]+/new; dastlab `tFields('cost')` «Себестоимость» qo'yilgan edi — misread capture banner, follow-up'da tuzatildi] · Latin-uz i18n leaks 6 pages [errors·`·Kod:`·aria·placeholders·services zod→factory] · bundles price/vat/mxik validation guards [raw SyntaxError] · shared `useDestructiveMutation` Latin-uz defaults→i18n [~60 callers] · +catalog-api-method source-scan gate · +4 no-hardcoded routes; DEFER: variants History = BE audit-write feature-gap [variant.service writes 0 audit], bundle component-changes audit) |
| G | CRM | opportunities · pipelines · contact-persons · tasks | ✅ 2026-06-04 (`wf_85fba5eb-9ba`; **2 HIGH data-integrity:** opportunities contact-person WIPE-on-load [reactive effect cleared hydrated value → Save sent null] + tasks Edit→DUPLICATE [/tasks/new ignored ?taskId, POSTed new] → made /new edit-aware [PATCH]; opportunities `auditEntity opportunity→Opportunity` empty-History; a11y lost-reason label [cohort-C blocker]; Latin-uz i18n sweep all 4 pages [id]+new + PipelineEditor + localized default funnel stages; pipelines blank-stage guard; `fb7547fd`+`ea54c0bc`; DEFER: opportunities reopen-control feature, tasks formatDate shared-helper) |
| H | E-commerce / pricing | ecommerce/channels · ecommerce/orders · discounts · price-lists | ✅ 2026-06-04 (`wf_48fd9e45-543`, 9 confirmed; channels invalid-settings-JSON silently-dropped [stale-state check]→throw sync + externalRef/externalCode clearing; orders uz-typo «Aylantirildi» + Number()/100→formatMoney; price-lists ~13 Latin-uz leaks→i18n [+3 the gate caught after registration]; discounts CLEAN; `371d27d1`; DEFER: ~~price-lists History = BE audit-write feature-gap~~ ✅ **price-lists History TUZATILDI 2026-06-08g (`690a507f`, live 14/14)**; orders History (ecommerce/orders has no detail History tab — re-confirm if a tab is added); price-lists «Внешний код» field uncertain) |
| I | HR | hr/employees · payrolls | ✅ 2026-06-04 (`wf_ef7df3c0-a3c`, 4 confirmed/6 refuted all LOW; payrolls fmtMoney hardcoded UZS→thread data.currency [4 sites]; employee role-multi-select English aria→i18n; payroll History/auditEntity=Payroll CORRECTLY wired [BE writes it]; `d962bfa2`; DEFER: employee permissions/salary subroutes) |
| J | Analytics *(read-only — yengilroq)* | analitika/buyurtmalar · analitika/kontragentlar · analitika/xodimlar · analitika/sozlamalar/rollar | ✅ 2026-06-04 (`wf_0d7f6fc7-956`, 7 confirmed; **money bug-class**: buyurtmalar+kontragentlar hand-rolled `Number(minor)/100`+«so'm»→`formatMoney` [«сум», BigInt-safe]; buyurtmalar raw `{state}`→`stateLabel`; kontragentlar UTC date-range→local; `0842dee9`; DEFER: xodimlar HR-roles raw codes→hrRoleApi labels. ⚠️ `analitika/sozlamalar/rollar` shu pass'da AUDIT QILINMADI — alohida settings-roles sahifa, keyinroq) |
| K | Settings-finance | settings/bank-accounts · cash-desks · expense-items · tax-rates · price-types | ✅ 2026-06-04 (`wf_d0f91419-ace`, 7 confirmed; bank-accounts+cash-desks Latin-uz `'Nom majburiy'`/`'Tashkilot majburiy'`/placeholder→i18n; expense-items/tax-rates/price-types toza; cash-desks balance allaqachon `formatMoney` read-only [to'g'ri]; `95a599e0`; DEFER: bank-account bankLocation/correspondentAccount fields + currency-change guard [BE] + tax-rate 409-conflict FE map) |
| L | Settings-org | settings/organizations · regions · publications · custom-entities · label-templates · users | ✅ 2026-06-04 (`be6ee9d6`, 63/63 — publications/label-templates whole-page i18n + silent-failure onError + organizations error-string i18n + a11y; regions/custom-entities/users clean. **Phase-1, browser-smoke YO'Q.** Detail konveyer A–L TUGADI) |

*(`settings/projects·stores·uoms` = top-level audit bilan qoplangan — dedup tekshiriladi. `contact-persons` G'da.)*

---

## 🧪 QA-backlog (Phase 2 — alohida cohort sessiyalari kutmoqda)

> **Model**: audit = **Phase 1** (strukturaviy, gate-green, «runtime-tasdiqlanmagan» deb belgilanadi) →
> **Phase 2** = alohida QA sessiyasi, **cohort bo'yicha** (browser + adversarial). To'liq qoida: loyiha
> `CLAUDE.md` → «Audit ikki fazali». Stack: DB `moysklad_dev`@localhost:5433 · `pnpm dev` · `pnpm db:seed`.
> Har audit sessiyasi shu yerga sahifani **Phase-1 ✓ / Phase-2 ⏳** deb qo'shadi; QA sessiyasi ⏳ → ✅ qiladi.

> **🔬✅ Phase-2 BROWSER-QA natijalari (2026-06-08d, Playwright MCP jonli):** (foydalanuvchi «playwright ulanganku» dedi → optimistic-lock
> rollout tugagach browser-QA qildim.) **MCP setup:** orphaned mcp-chrome profil-lock tozalandi (kill chrome tree); auth = httpOnly cookie,
> hard-nav `/auth/refresh` 401 → SPA-nav yoki login-redirect bilan aylanib o'tildi (bu MCP artefakti, real bug EMAS).
> **(1) ✅ OPTIMISTIC-LOCK conflict-dialog E2E — BROWSER-VERIFIED** (customer-order, editable forma): create draft v1 → forma yuklandi (v1) →
> boshqa user out-of-band PATCH (curl) → v2 → brauzerda Izoh tahrirlab Saqlash (stale v1) → **409 → lokalizatsiyalangan dialog** («Yozuv boshqa
> foydalanuvchi tomonidan o'zgartirildi», `role=dialog`, raw `OPTIMISTIC_LOCK` leak YO'Q) → «Ma'lumotni yangilash» → forma server-v2'ga
> **re-hydrate** (stale tahririm tashlandi) → yangi Saqlash → **200, v3 persisted**. Bu butun 6-sessiyalik optimistic-lock rollout'ni real
> brauzerda tasdiqlaydi (oldin faqat payment-in/customer-order rep'lari smoked edi; FE conflict-UX endi to'liq E2E). Test order o'chirildi.
> **(2) ✅ retail/sales RU-locale (RS1) — headers/filtr-pill TOZA:** til-switcher bilan haqiqiy RU'ga o'tib (cookie-set yetarli emas — app
> i18n context'ni almashtirmaydi; native `<select>` change handler kerak) tekshirdim — kolonka sarlavhalari («НОМЕР ЧЕКА/ДАТА/КОНТРАГЕНТ/КАССА/
> СУММА/СТАТУС») + state-pill'lar («Все/Оплачено/Возврат/Черновик/Отменено») hammasi RUS. L10 retail i18n ishi ushlab turibdi.
> **✅ (3) APP-WIDE pagination i18n LEAK — TUZATILDI (2026-06-08, `7673df4c`).** Edi: RU rejimda list-footer Latin-uz chiqarardi
> («Jami: N ta yozuv | Oldingi | Keyingi») + teskari yo'nalishda moyskladStyle range `«из»` UZ UI'ga sizardi (ListView `ofLabel` uzatmasdi).
> **§4-grounded:** moysklad pagination = icon-only image tugma + «N-N из total» range (capture `currency/00-clean-default`: `<td class="pages">
> 1-1 из 0</td>` + `next-page` `<img>`, `«Предыдущая/Следующая»` matni YO'Q) → matnli pager ham parity-gap ham leak edi. **FIX:** (1) `Pagination.tsx`
> `PaginationLabelsProvider` (ModalLabelsProvider mirror); moyskladStyle `of`+4 aria-label `prop ?? context ?? fallback` orqali; (2) `ListView.tsx`
> doim `moyskladStyle` (har list icon-only parity); (3) `layout.tsx` provider'ni `getTranslations('pagination')` bilan mount; (4) i18n `pagination`
> namespace ru(из/…)+uz(dan/…). **Guard +7** (provider injection · aria · ListView moysklad pager DOM · source-scan ListView wiring · i18n parity).
> **Phase-1 + komponent/unit-verified** (guard test haqiqiy ListView render qiladi → moysklad range bor, «Jami:»/«Oldingi sahifa» YO'Q). **Browser-smoke
> ✅ VERIFIED 2026-06-08l:** RU footer «1-1 из 1» (08k'da work-orders list) + **UZ footer «1-1 dan 1»** (08l work-orders list, uz-locale) — moysklad-style
> icon-only pager + range, hech qanday Latin-uz «Jami/Oldingi/Keyingi» leak YO'Q. QA-backlog #3 footer-pixel **YOPILDI**. Gate: web tc0·ds tc0·biome0·web
> Vitest 1439 (+7). Audit: `_PHASE2-pagination-i18n-leak.audit.md`.
> **RS2-RS4 (drawer-in comment, half-tiyin, non-UZS suffix) — bu sessiyada test QILINMADI** (kutmoqda).

> **🔬🐞 Phase-2 BROWSER-QA (2026-06-08j) — optimistic-lock conflict dialogs + HIGH confirm-dialog-in-modal bug:** `roles`
> (config full-page) + `hr-employee` (edit modal) conflict dialog'lari **browser-verified** (409→dialog→reload→re-hydrate→200).
> `hr-employee` modal **HIGH design-system bug** ochdi (ANY Radix modal-ichi `ConfirmDialog`: yashirin+bosib bo'lmas+host modal
> yopadi) → tuzatildi (`--ms-z-confirm` token + `pointer-events-auto` + Modal interact-outside guard). To'liq:
> `_PHASE2-confirm-dialog-in-modal.audit.md`. **Qolgan 8 lock conflict yuza = full-page, representative bilan qoplangan** (roles/
> customer-order/payment-in/production browser-verified); `analitika/staff` re-key remount smoke **✅ 08k da browser-verified** (409→dialog→`key={data.version}` remount re-seed→200).

> **🟡 Conv-6 data-bog'liq vizuallar (2026-06-10h, session-start-audit 10i qayd etdi — OCHIQ QA):** Convention 6'ning 13
> deliberate vizual o'zgarishidan 3 tasi browser-smoked (opp pill · audit-log badge · 25-sahifa render-sweep); **data-bog'liq
> qolganlari browser-VERIFY KUTMOQDA** (real data kerak): bank-import OUT qatori (`out`→destructive, oldin warning) ·
> kanal `lastSyncOk=null` → badge-YO'Q holati · ABC cycle-view badge (report xaritasi). Struktura proof (117 juftlik) +
> guard (75 test) qulflangan — bu faqat rendered-pixel tasdig'i.

**Cohort A — Hujjat-detail (13):**
- **Session-2 (seed-bor 7) — ✅ Phase-2 VERIFIED 2026-06-10c** (`_PHASE2-cohortA-session2-clearfield.audit.md`):
  customer-orders · demands · supplies · cash-in · cash-out · moves · payments-in — A-battery 7/7 PASS +
  B-battery browser 7/7 CLEAN. **Clear-field bug-class fixed** (10 sahifa, `|| undefined`→`|| null`, browser E2E,
  guard +38). ~~🔴 OPEN money-critical: «Summa» input xom minor~~ ✅ **TUZATILDI shu kuni (qism 2):** app-wide
  MoneyInput (`8313b69a`+`2ce81f2e`, browser-proven) — top «Aniq keyingi vazifa» 10-06c entry. customer-order
  lock (08d) + payments-in org-account (06c) qayta qilinmadi.
- **Session-3 (demo-bo'sh 6) — ✅ Phase-2 VERIFIED 2026-06-10c** (`_PHASE2-cohortA-session3-returns-cogs.audit.md`):
  payments-out · invoices-in · invoices-out · sales-returns · purchase-returns · purchase-orders — A-battery 6/6
  PASS + B-battery browser 6/6 TOZA. **🔴 Returns-COGS HIGH fixed** (sales/purchase-return weighted-avg, `2f5d7ebf`,
  runtime-proven + guard +10). **🟡 «Оплачено» raw-minor fixed** (invoices-in/out, `f797e769`, browser-smoke +
  guard +6). 6 deferred bug-class (name/applicable strip · PO rate-snapshot · moment-null epoch · qty=0 · PR
  draft-supply · formatMoney non-UZS) grounding-gated/product-decision — audit doc §DEFERRED. **➡️ Cohort A TO'LIQ
  → Phase-2 7/7 (100%).**

**Cohort B — Katalog (5):** counterparties · products · projects · stores · uoms — **✅ Phase-2 VERIFIED 2026-06-10**
(`_PHASE2-katalog-cohort.audit.md`; A-battery API-adversarial + B-battery browser. All 5 structurally+runtime CLEAN — no
HIGH/MED. counterparty **phone-clear fix `f9ba78e1` confirmed END-TO-END in the real browser** [cleared field → real Saqlash
→ API phone===null, v10→11]. products residuals LOW [stale PUT JSDoc, repo.update no-include] documented. settings-light
History-absence = consistent sibling-parity; projects externalCode omission = capture-gated).

**Stock + internal (4) — 2026-06-03e:** enters · losses · inventories · internal-orders — **✅ Phase-2 VERIFIED 2026-06-10**
(`_PHASE2-stock-internal-cohort.audit.md`; commit `3add5a1`). 🔴 **HIGH FIXED — Loss COGS=0:** posted Списание recorded
`sumMinor=0` + `costDeltaMinor:-0n` (qty-only form → `LossPosition.costMinor` always NULL → `?? 0n`) → inventory **valuation
drift** (qty falls, value stays); buyPrice/cost runtime bug-class, Phase-1 "clean" missed it. Fixed → weighted-average from
`costBalanceMinor/qty` (`computePerUnitCost`; ground-truthed the cost model — Enter carries no FIFO lot so demand-FIFO would
miss it). **Runtime-proven** (enter 10@50000 → loss 3 → sumMinor 150000 was 0; 2nd loss perUnit still 50000 = invariant held;
round-trip; cleanup→0). Guard `loss-cogs.test.ts` +4. internal-orders IO-1/IO-2 ✓ (browser «Bajarilgan 0,00/2 000,00 сум» +
RU «Выполнено …» no Latin-uz leak). **DEFER (documented):** qty=0 acceptance = project-wide ~13-schema class (not a one-off);
inventory-shortage `costDeltaMinor:null` = grounding-gated; enter/loss unposted-draft stale-sumMinor display = grounding-gated.
🔴 **CAPTURE RE-GRAB MAJBURIY**: `06-module/{enter,loss,internalorder}` captures BUZUQ (`<title>Корзина</title>`,
Заказ-поставщик formasini ko'rsatadi) → toza Оприходование/Списание/Внутренний-заказ edit-form capture ol (faqat
`inventory` capture toza edi). **internal-orders runtime smoke**: IO-1 posted-doc «Выполнено: <forматланган сум>»
(xom minor emas), IO-2 externalCode tahrirlab→saqlab→qayta-yuklab round-trip; **IO-3** «Целевой склад»→«Склад»? +
**IO-4** planned-date «...поставки»→«План. дата приёмки»? — toza capture bilan hal qil (1-qatorli label swap har biri).
**inventories feature-gap**: «Дополнить из остатков» (stock-balance'dan count-line to'ldirish) + «Дополнить из
номенклатуры» (bulk) — toza capture'da bor, bizda yo'q (feature task, stock-balance integ.).

**Production-config (4) — 2026-06-03f:** production/boms · processes · stages · work-orders — **Phase-1 ✓ / Phase-2 ✅
VERIFIED** (smoke'lar ikki sessiyada yopildi: W1/W3 = 08l, S1/S2/B4/P1 = 08o — quyida har biri ✅ belgili; bu header
2026-06-10c gacha stale «⏳» turgan, 100%-tasdiq tekshiruvida tuzatildi. Qolgan ochiq item'lar = grounding-gated:
work-orders docDate [BE column], boms cost-split, uz-title savoli — `_PHASE2-100-PLAN.md` §6.)
(NO production gold capture → sibling-parity + intrinsic-critic only; **re-capture the production module** for any
capture-grounded re-audit). **Runtime smokes:** **(W3) ✅ VERIFIED 2026-06-08l** (transition a WO → Tarix/History shows
`Создано`+`В работе`+`Выполнено` rows — and this is where the **app-wide History action-label i18n leak** was found+fixed,
see top 08l entry); **(W1) ✅ VERIFIED 2026-06-08l** («Начато»/«Завершено» = `27.04.2026 07:46`, date+time ru); **(S1/S2) ✅ VERIFIED 2026-06-08o**
(created a stage with a materialStore + `allPerformers=false` + a named performer, **fresh GET reload** of `/production/stages/[id]`
→ store = «Asosiy ombor», performer chip = «Admin User», **0 UUIDs on the page**); **(B4) ✅ VERIFIED 2026-06-08o** (FE «Количество должно
быть больше 0» + no POST; adversarial API-direct `outputQty:'0'`→400, `'-1'`→400); **(P1) ✅ VERIFIED 2026-06-08o** (all 3 sub-cases,
visible red banner: «Название — обязательное поле» / «Выберите этап» / «Добавьте хотя бы один этап» — not «Этапов: 1»). ✅ **work-orders/new docDate = TUZATILDI + RUNTIME-VERIFIED (2026-06-11f, `_WO-DOCDATE-2026-06-11.md`):**
~~editable header date silently dropped on create — `CreateWorkOrderSchema` has NO `date`/`moment` column~~ → moysklad
`processingorder.moment` («Дата документа») 11e'da grounded → `WorkOrder.moment` column qo'shildi (backfill `created_at`'dan),
schema/service/FE `/new`(endi yuboradi)+`/[id]`(ko'rsatadi)/i18n; doc-date-payload guard `moment:`ga kuchaytirildi; live API 8/8 +
browser RU+UZ. (Oldingi «production capture kerak» note eskirgan — UI-label «Дата документа» productions sibling'dan allaqachon grounded edi.) 🟡 **uz title «Tex. zayavkalar» vs ru
«Производственные задания»** (deliberate terminology, no capture → confirm in QA). 🔴 **auditEntity slug bug-class:**
work-orders ✅ + tasks ✅ fixed; **opportunities/[id] `"opportunity"`→`"Opportunity"` DEFERRED to Cohort G** (page has a
pre-existing non-auto-fixable a11y biome error that blocks a scoped commit — fix slug + a11y together in G).
~~bom/processingstage/processingprocess write NO audit log → History vacuously empty~~ ✅ **TUZATILDI + RUNTIME-VERIFIED (2026-06-06b, Track 4):** `logAudit` (create/update/archive/restore + bom setComponents/process setStages) qo'shildi; entity slug exact-match FE; bom History live `[delete,update,create]`. Wiring-lock test (3).

**Money / returns (3) — 2026-06-03g:** prepayments · prepayment-returns · counterparty-adjustments — **Phase-1 ✓ / Phase-2 ✅
VERIFIED 2026-06-08k** (P1/P2/P3 hammasi browser+adversarial — 08k entry'ga qara; bu header 08n+1 sessiyagacha stale «⏳» turgan edi).
(captures CLEAN this time — 07-module/{prepayment,prepaymentreturn,counterpartyadjustment} correct titles). **Runtime smokes
(✅ 08k):** (P1) edit a **wholesale** prepayment + prepayment-return (no retail split) → Save SUCCEEDS (was a silent 400 from
`null` split payload); (P2) try to post a prepayment-return whose currency differs from the source advance → impossible
(currency now read-only/forced to source — verify a foreign-currency over-refund can't be booked); (P3) open a
prepayment-return whose source has a prior partial return → «Остаток к возврату» shows the NET remaining, not the full
source sum. ✅ **History (Tarix) tab DOIM bo'sh — TUZATILDI + RUNTIME-VERIFIED (2026-06-06, `0ce3ba93`):** prepayment /
prepayment-return / counterparty-adjustment services wrote **ZERO** `auditLog.create` → History tab (fetches
`/audit-logs?entity=<PascalCase>` exact-match) always empty. **FIX:** threaded `userId` (user.sub) through
update/transition/softDelete/massEditApply (~9 methods + 3 controllers) + private `logAudit` per service (non-tx sites) +
inline `tx.auditLog.create` for FSM transitions (atomic w/ balance delta); entity strings EXACT-match the web
`auditEntity` props; money `sumMinor.toString()`. **RUNTIME SMOKE (live API + real DB, 13/13):** create→History `[create]`,
post→`[transition:posted,create]`, unpost+delete→`[delete,transition:unposted,transition:posted,create]` for all 3 modules
(proves the null-fieldChanges Json write path + the entity-string contract). **Adversarial money (3/3):** over-refund cap
rejects 4M>3M (localized msg), refund currency-lock forces source USD (client UZS ignored). Gate: tc0·biome0·api Vitest
2616 (+9). **➡️ This is the FIRST QA-backlog item runtime-verified (Phase-2) — others below remain Phase-1.** *(prepayments +
prepayment-returns are also 2 of the ~13 org-account-scope pages below.)* 🟡 **Note (Playwright MCP):** browser
`/api/v1/auth/refresh` 401's in the MCP context → in-app nav bounces to /login (e2e specs work → likely a cookie-persistence
artifact of the MCP browser context, NOT a confirmed user bug; verify in a real browser before treating as a defect).

**Retail (2) — 2026-06-03h:** retail/sales · retail/sessions — **Phase-1 ✓ / Phase-2 ✅ VERIFIED** (RS1=08d ·
RS2/RS3=08k · RS4-yozish=08o; yagona ochiq qism = RS4-DISPLAY yarmi — DS `formatMoney` `/100` non-2-decimal
displayi, bu **grounding-gated istisno** [`_PHASE2-100-PLAN.md` §6, 100% hisobiga kirmaydi]. Header 2026-06-10c
gacha «PARTIAL» turgan — 100%-tasdiq tekshiruvida reja-§0 ta'rifiga moslab tuzatildi.) (captures CLEAN —
08-module/{retaildemand,retailshift}). **Runtime smokes:** **(RS1) ✅ VERIFIED 2026-06-08d** (RU-locale → headers/state-pills
all Russian); **(RS2) ✅ VERIFIED 2026-06-08k** (Внесение with «Комментарий» → drawer-in 201, `description` persisted as
`ВН-2026-00001 · QA Phase-2 browser test`, shows in the session-detail ops list); **(RS3) ✅ VERIFIED 2026-06-08k**
(`150.50` → `Money.fromMajor(.,tillCurrency)` → `sumMinor:"15050"`, correct scale — the POS-register drawer was using
hardcoded `Math.round(*100)`, now mirrors the session-detail drawer); **(RS4) 🟡 PARTIAL — 2026-06-08o** — the cash-WRITE scale is
now browser-verified currency-aware (created a JPY desk; opening "150" → `openingCashMinor` **150** not 15000; closing "150.50"
UZS → `closingCashMinor` **15050** — see the 08o cash-scale fix in «Aniq keyingi vazifa»). The currency-SUFFIX/display half stays
**owed/deferred**: DS `formatMoney` hardcodes `/100` so non-2-decimal desks aren't displayable anywhere (separate grounding-gated
DS effort). 🟠 **NEW FIX 2026-06-08o — register CASH-SCALE bug-class:** open-shift `openingCashMinor` + close-shift `closingCashMinor`
used `parseInt(x)*100` (08k's drawer fix sibling, un-hardened) → **decimal truncation (LIVE, UZS: "150.50"→15000, lost tiyin)** +
hardcoded `*100` (JPY 100× inflation). Fixed → `Money.fromMajor(<entry>, <deskCurrency>).toMinor()` (open=selected-desk currency,
close=`tillCurrency`); browser-verified (above) + guard `retail-cash-scale.test.ts` (+3). payment-dialog OUT-of-class (integer
keypad, no decimals; + `formatMoney /100` blocks JPY display) — documented. 🔴 **NEW HIGH FIX 2026-06-08k — POS register
CRASH:** `/cashier-sessions/current` (`findCurrentForCashier`) omitted the `cashier` include (only method that did, vs
list/findOne/open/close) → FE `session.cashier.name` → client-side TypeError → the **whole /retail register white-screened
whenever a session was open**. Fixed (add include) + browser-verified + api guard (`cashier-session-current-contract.test.ts`).
🟡 **z-report `cashReturnsMinor`/`cardReturnsMinor` fetched but NOT rendered** (interface declares them, render shows only
combined returns) — confirm vs a CLOSED-shift Z-отчёт capture whether moysklad breaks returns down by cash/card (uncertain,
money-safe). 🟡 **POS-register drawer-out label** was hardcoded «Изъятие»; i18n'd + grounded to «Выплата» (the retailshift
capture grounds «Выплата»/«Внесение» — label-grounding test) to match the session-detail sibling; **live toolbar render shows
«Выплата» only after the next web recompile** (next-intl server-side message cache — code+unit-verified, on disk). 🟢
«От кого»/«Основание» drawer fields (seen in `retaildrawercashin` capture) = need BE columns (feature, defer);
acquiring-bank/discount-commission shift totals = LIST column-config, not detail (refuted).

**Catalog items (4) — 2026-06-03i:** bundles · services · variants (+ products edit) — ✅ **Phase-2 VERIFIED (2026-06-06e, `c67c78e8`)**;
tracking-codes = list-axis only (cohort L6), detail NOT browser-QA'd (no owed smoke, Phase-1 intrinsic-only). Audit doc:
`docs/audits/_PHASE2-catalog-cohort.audit.md`. **All 6 owed smokes browser-checked → 4 real runtime bugs found+fixed:**
**(F-PUT ✅)** product edit Save — method already PATCH (no 404), but **was 400** → BUG1; **(F1 ✅)** bundle+service edit →
200 + History rows (`entity=Product`); **(F2 ✅)** variant buy-price = «Xarid narxi»/«Закупочная цена» (not «Создано») +
variant null-field save 200; **(F3 ✅)** RU locale — products/bundles/services/variants [id]+/new all Russian after BUG4;
**(F4 ✅)** decimal bundle price → «Faqat raqam», no POST, no SyntaxError; **(F5 ✅)** delete in RU → ConfirmDialog (DOM
`role=dialog`, NOT window.confirm) + toast all Russian, DELETE 200. **Bugs (all tc/lint/unit-invisible):** 🐞 **BUG1 (HIGH)**
edit-save 400 on any empty optional field — `Update*Schema=Create.partial()` `.optional()` rejects the `null` the edit forms
send to clear → `.nullish()` (schema-only; repo null-safe; minBalance/variant.name stay non-nullable) · 🐞 **BUG2** History
stale-after-save — saves didn't invalidate `['audit-logs']` (eager-mounted query) → invalidate in `useApiMutation`+`useSaveMutation`
· 🐞 **BUG3** double-create on all 10 /new pages — DetailToolbar Save `type` defaulted to submit inside `<form>` → `type="button"`
· 🐞 **BUG4** catalog /new headers hardcoded Latin-uz → i18n (`new_title`+`common.new_state`, 0 new keys). Guards: product/variant
schema null tests · 2 hook audit-logs tests · detail-toolbar type=button + form-no-submit test · catalog-new-header-i18n scan.
**Note (supersedes old DEFER):** the 2026-06-06b Track-4 `logAudit` work already gave bom/process/stage History rows; F1
confirms bundle/service write audit via `/products` (`entity=Product`). ✅ **variant History — TUZATILDI + RUNTIME-VERIFIED
(2026-06-08, `5a44dc7e`):** `variant.service` endi `logAudit` yozadi (`entity:'Variant'` = FE slug; create/update/archive/
restore/delete; `userId`=`user.sub` controller'dan + bulk-*). **BigInt-safe diff** (Variant'da buyPrice/minPrice BigInt — plain
JSON.stringify BigInt'da throw qiladi → bigint→string replacer; diff updated-row key'lari bo'yicha → `product` relation changeset'ga
kirmaydi). **Live smoke 14/14:** create→[create] · edit→[update,create] (bigint-safe `buyPrice {before:"10000",after:"25000"}`) ·
no-op→YANGI row YO'Q (diff-empty guard) · archive→[archived,…] · restore→[restored,…] · delete→[delete,…] (aniq tartib) · GET→404.
Guard: `catalog-history.test.ts` +1 source-scan lock. Gate: api tc0·biome0·api Vitest 2767 (+1). Audit: `_PHASE2-variant-history.audit.md`.
✅ **bundle component-list audit — TUZATILDI 2026-06-08g (`690a507f`, live):** setComponents/removeComponent endi entity='Product' (parent feed) `components {before,after}`/`{removed}` log'laydi. (Oldin: «Still DEFER: bundle component-list edits not audited».)

**Bug-class sweeplar — Phase 2'da 1-2 vakilda spot-verify:** «Главная» first-tab (9 sahifa, `c6be3247`) ·
«Задачи» (9, `2dff3ed6`) · «Создать документ» (6, `6ae563e3`) · EditForm uz-leak (35, `bb604bf8`) ·
**F20 totals VAT math** (9 sahifa, `c6bf7673` — `lib/doc-totals.ts`; `vatIncluded=false` subtotal/total real render bilan tekshirilsin — money-critical) ·
**doc-date moment** (5 /new, `77195e2d` — `__tests__/doc-date-payload.test.ts` gate; create-with-chosen-date → persisted-date live smoke) ·
**local-date-helper residuals:** ✅ **`analitika/kontragentlar/[id]` TUZATILDI 2026-06-08i** (lokal `fmtDate`
[`toLocaleDateString('ru-RU')`, NaN-guard YO'Q] → shared `@moysklad/ui` `formatDateOnly`; bir xil format DD.MM.YYYY +
'—' null-fallback, ENDI NaN-guard ham bor — invalid date → '—', «Invalid Date» emas). 🟡 **`opportunities/board/page.tsx:49`
QASDDAN QOLDIRILDI** (dedup EMAS): u ataylab **ixcham** — faqat kun+oy (yilsiz) + '' null-fallback, kanban kartalari uchun;
shared `formatDateOnly` yil qo'shadi (DD.MM.YYYY) → swap vizual regress bo'lardi. (2026-06-05 audit «byte-dup» degani aniq
emas edi — board helper intentional-compact, dedup nishoni EMAS. Faqat NaN-guard qo'shish kerak bo'lsa alohida mayda ish.)
**Deferred (capture+QA kutmoqda):** productions first-tab · D2 «Запросить оплату» show-vs-hide · invoice-in print ·
purchase-orders related-docs populate (`GET /purchase-orders/:id/related`) ·
✅ **org-account picker SCOPE bug-class (money-critical) — TUZATILDI + RUNTIME-VERIFIED (BE) (2026-06-06):** `organizationAccountFetcher`
`/organization-accounts`'ni `organizationId`'siz chaqirardi → 15 forma boshqa tashkilot hisobini biriktirib pulni noto'g'ri yuridik shaxsga
yo'naltirishga ruxsat berardi (FE picker org bo'yicha filtrlanmasdi, va BE hech bir servis org↔account bog'lanishini tekshirmasdi — ko'pi hatto
`connect`da tenant ham tekshirmasdi). **FIX (2 qatlam):** (1) **BE hard guard** — yangi shared `assertOrgAccountMatchesOrg` (`modules/shared/
org-account.ts`): account tenant (accountId) ichida bor + uning `organizationId` hujjat org'iga mosligini tekshiradi; **11 doc-servis**
create()+update()da chaqiradi (customer-order · invoice-in/out · payment-in/out · prepayment · prepayment-return · supply · purchase-return ·
sales-return · purchase-order; **demand** create/update DTO'da account yo'q → faqat clone, istisno). update guard EFFECTIVE org/account bilan —
org-only o'zgarsa eski account endi cross-org bo'lib qolsa ham tutadi (FE-bypass himoyasi). (2) **FE picker scope** — 15 forma fetcher'iga
`organizationId` thread + org o'zgarganda account+label tozalash (onSelect+onClear; prepayment-returns/[id] org read-only → faqat fetcher;
payments-in/out/new useState; prepayment-returns/new source-prepayment'dan). **Runtime adversarial smoke (live API+DB, 6/6):** create mismatch
→400 «Tanlangan hisob raqami tashkilotga tegishli emas», create match→201, update account-switch→400, update org-switch (account stale)→400,
update both-consistent→200, cleanup→deleted. **Guard tests:** api `shared/org-account.test.ts` (5 unit + 11 service wiring-lock), web
`__tests__/org-account-scope.test.ts` (15 page lock). Gate: tc0(web+api)·biome0·**api Vitest 2632 (+16)**·**web Vitest 1389 (+15)**.
✅ **FE picker scoping BROWSER-VERIFIED (2026-06-06c):** payments-in/new — `?organizationId=…` so'rovda, dropdown org bo'yicha scoped,
org o'zgarganda hisob+label tozalanadi, qayta ochilganda yangi org id; [id] hydration ham. **+ shu paytda YANGI BUG topildi: default
hisob `accountNumber=null` → picker BO'SH/«null» → `accountNumber || name` fallback (3 qatlam, `1f5bb451`).** **DEFER (kichik, sama class):** agentAccount↔agent link BE guard
(FE allaqachon nested-endpoint bilan scoped) · org-account currency↔doc currency match (alohida, mavjud data'ni buzishi mumkin) · demand clone
revalidation. **Deferred (capture+QA kutmoqda):** productions first-tab · D2 «Запросить оплату» show-vs-hide · invoice-in print ·
purchase-orders related-docs populate (`GET /purchase-orders/:id/related`) · work-orders dekorativ docDate (moment yo'q) — alohida.

---

## ⏭️ Aniq keyingi vazifa (har sessiya yakunlanganda yangilanadi)

> **🔬✅ 2026-07-23g (SALES-RETURNS «Возвраты покупателей» — QISM 1 Task 1: /new pozitsiya-qator 1:1 (N4-N7))**
> *(Parallel demand sessiyasi 2026-07-23f custom-attrs qildi; mening diff'im path-cheklangan — faqat
> `sales-returns/new/page.tsx` + salesreturn reja doc. Commit `123025b`. Dev-stack demand sessiyaniki bo'lishi mumkin — TEGMADIM.)*
> **(1) Understand-workflow (5 parallel Opus reader, wf_8ed11ec2):** Остаток pattern (demand /new reuse) · DS ustun-tizimi
> (stock/costPerUnit/rnpt kalitlari ALLAQACHON bor) · BE stock/cost (buyPrice strip, cost DEFER) · detail-2A (PositionEditor,
> shared emas) · Перечисление (net-yangi, paymentType yo'q). *(2 agent stub-natija qaytardi — o'zim aniq-qidiruv bilan tikladim.)*
> **(2) Jonli grounding:** «Перечисление» combo Организация ostida ochildi — bu org (elektro_sentr) uchun **yagona opsiya
> «Перечисление»** (to'lov-forma/hisob-turi, org-hisoblariga bog'liq). **(3) IMPL — Task 1:** `/new` POSITION_COLUMNS'ga
> **«Остаток» jonli ustun** qo'shildi (GET /stocks → rowsWithStock merge, demand pattern; DS 'stock' kaliti bor, i18n
> position_cols.stock ru+uz) · **goodPack/vatAmount/discount OLIB TASHLANDI** (moysklad create default-ko'rinishida yo'q).
> **DEFER (Phase-1, demand bilan mos):** Себест.единицы (costPerUnit=sale-price, return-COGS emas) + РНПТ (BE marking maydoni yo'q, QISM 4).
> **Gate:** web tc0 · biome0 · i18n key-existence ru+uz PASS · Vitest 4 fail = **pre-existing** (stash-baseline bilan bir xil —
> raw-element/header registry-drift migrated-mashinada, sales-returns/new ro'yxatда YO'Q, **regress 0**).
> **HALOL:** Phase-1 strukturaviy — **browser-cert YO'Q** (DB down + parallel dev-stack; QISM 5 QA'da).
> **⏭️ KEYINGI = QISM 1 Task 2 + 3** (reja: `docs/superpowers/plans/2026-07-23-salesreturn-new-1to1.md`):
> **Task 2** meta-grid moysklad tartibiga (Организация/Склад → Контрагент/Договор → Проект/Канал → Валюта yakka; extra fieldlar
> «Другие поля» disclosure'ga — demand `da20554` pattern; N8 «Причина» disclosure'ga) · **Task 3** «Перечисление» (1B) —
> avval jonli opsiya-capture + persistence qarori (yangi paymentType ustun vs organizationAccountId vs attributes), keyin wire.
> **⚠️ NEXT.md 35 entry / 920+ qator** — arxivlash kerak (parallel sessiya faol bo'lgani uchun bu sessiya QILMADI; koordinatsiya kerak).

> **🟢✅ 2026-07-23f (DEMAND «Отгрузки» — QISM 1B: custom-attrs create-parity E2E-verified + Task-2 premise-fix)**
> *(Parallel sessiya 2026-07-23e sales-returns qildi; mening diff'im path-cheklangan — `demands/new/page.tsx`
> + demand audit doc; har commit oldidan staged-set guard bilan tekshirildi.)*
> **Custom-attributes editor create'да** (`bc54662`): funksional gap N1 — доп.поля detailда bor edi, create'да
> yo'q. demand create-schema allaqachon `attributes` qabul qiladi (BE o'zgarishsiz) → detailдаги aynan
> `AttributesEditor entity="Demand"` /new'ga ko'chirildi (inline totals ostida, payload `attributes: customAttrs`
> always-send). **Runtime E2E (Playwright + jonli DB, cleanup):** test доп.поле kiritildi → /new'да «Qo'shimcha
> maydonlar / Test Usta Field» render → to'ldirib saqlash → **DB `demands.attributes = {"test_usta_1a":
> "QA-1B-attr-persist"}`** → detailда re-render. Audit: `docs/audits/_demand-new-1B-attrs.audit.md`.
> **🛑 Task-2 «Грузоотправитель» blok RAD ETILDI (premise-error, §4):** capture'да «Грузоотправитель» = field
> labeli (1×), seksiya-sarlavha EMAS → moysklad shipping'ni bunday guruhlamaydi. GAP-BACKLOG D5/N3 xato.
> **⏭️ KEYINGI = 1B qolgan (BE):** **«Ячейка» (bin)** — `DemandPosition`'да `cell` ustun YO'Q → schema+migration+BE
> (§wiring: markaziy schema commit alohida). *(A4: Ячейка moysklad'да optional gear-ustun, default emas → past-prioritet.)*
> **DEFER:** «Себест. единицы» (buyPrice strip). **«Маркировка» = QISM 4.** Shundan keyin QISM 1 ~tugaydi → **QISM 2 (detal)**.
> **⚙️ DEV ISSIQ:** postgres 5432 (`D:\pgdata-sherset`, bu sessiya qayta ishga tushirdi) · web :3100 + api :4000 ·
> `admin@demo.local`/`admin123`. ⚠️ **NEXT.md 900+ qator** — keyingi sessiya eski entry'larni arxivlasin.

> **🔬✅ 2026-07-23e (SALES-RETURNS «Возвраты покупателей» — QISM 1 GROUNDING: /new capture + roadmap co-locate)**
> *(Parallel demand sessiyasi shu payt 2026-07-23c/d demand ishini qildi; mening diff'im path-cheklangan —
> `scripts/capture-moysklad-references.ts` + `.gitignore` + 2 salesreturn doc. Commit `96bb93e`.)*
> **(1) Roadmap review + co-locate restructure** (`...-salesreturn-section-1to1-ROADMAP.md`): eski monolit «QISM 4 —
> BE» tarqatildi — har BE enabler uni ishlatadigan QISM ichida (`[BE:…]` teg); 3 cross-cutting enabler ajratildi;
> «QISM = milestone, sessiya = sub-item» aniqlandi. **(2) Capture tooling:** `capture-moysklad --create` rejimi
> qo'shildi (mavjud qatorlar bo'lsa ham bo'sh «+ Создать»/new formasini oladi) + openCreateForm bareLabel bug-fix
> («+» ikonka, matn «Возврат»). **Jonli olindi:** salesreturn /new create-form (viaCreateForm:true).
> **(3) Grounding N1-N8** (`_GAP-BACKLOG.md` → NEW bo'limi, DOM-rol+screenshot): «Перечисление» combo Организация
> ostida (`<input value="Перечисление">`; **opsiyalar DEFER — QISM1 impl'da click-capture, §4 taxmin YO'Q**) ·
> meta-grid tartibi · pozitsiya-ustunlar (Остаток/Себест.единицы/РНПТ moysklad'da ko'rinadi; bizda Скидка/Сумма НДС/
> Ед. ORTIQCHA) · «Причина» delta · Создать-menu {Исходящий платеж/Расходный ордер/Списание} create'da ham grounded.
> **⚠️ RE-SEQUENCING topilma:** Остаток/Себест.единицы/РНПТ ustunlari /new(1A) VA detail(2A) — **ikkalasida** default
> → umumiy prerekvizit, **birinchi quriladi** (roadmap detail-only capture'da 2A'ga qo'ygan edi). **(4) PII fix:**
> `.gitignore` `**/new/*.png` + salesreturn `**/*.html` (real akkount elektro_sentr DOM = PII); moysklad-reference
> commit'ga KIRMAYDI. **Gate:** biome0 (skript). **HALOL:** Phase-1 grounding — /new vizual-parity IMPL YO'Q, browser-cert YO'Q.
> **⏭️ KEYINGI = QISM 1 IMPL sessiya:** (a) umumiy pozitsiya-ustun enabler (Остаток/Себест.единицы/РНПТ — BE data +
> DS ustun; РНПТ demand-marking bilan umumiymi tekshir) → (b) `2026-07-23-salesreturn-new-1to1.md` reja yoz →
> (c) 1A meta-grid + N5/6/7 default-yashir → (d) 1B «Перечисление» opsiya click-capture + BE persist. Reja:
> ROADMAP QISM 1. Reference: `docs/moysklad-reference/salesreturn/new/` (gitignored, lokal).
> **⚙️ DEV:** capture `.env.local` cred + `.auth/moysklad.json` sessiya bor (auto-login ishlaydi). `--create` re-run OK.

> **🟢✅ 2026-07-23d (DEMAND «Отгрузки» — QISM 1B QISMAN (2/5) · `/new` position-economics browser-verified)**
> `/new` pozitsiya/totals moysklad'га yaqinlashtirildi (`8a07440`, yagona fayl `demands/new/page.tsx`):
> **(1) «Прибыль» qatori** — `DocumentTotalsPanel profitMinor={0n}` (yangi otgruzka DOIM qoralama → COGS
> o'tkazishда FIFO bilan ma'lum → foyda 0,00 = moysklad create parity), «Кол-во» olib tashlandi.
> **(2) «Остаток» (Qoldiq) jonli kolonka** — mavjud stock-query `rowsWithStock` orqali har qatorga merge
> (derived, jonli), Кол-во'dan keyin; nom-katak soddalashtirildi. **Live smoke** (`:3100`): bo'sh totals
> «Прибыль: 0,00» (Кол-во YO'Q) · UzKabel VVG 2x2.5 → «Qoldiq: 140» (real ombor qoldig'i). Gate: web tc0 ·
> biome0 · i18n `position_cols.stock` ru+uz · demand testlar 15/15. Audit: `docs/audits/_demand-new-1B.audit.md`.
> **⏭️ KEYINGI = 1B qolgan 3 band:** «Грузоотправитель» blok-sarlavha (FE) · custom-attrs editor create'да (FE) ·
> **«Ячейка» (bin)** — ⚠️ `DemandPosition`'да `cell` ustun YO'Q → BE schema+migration kerak (§wiring protokoli,
> markaziy commit alohida). **DEFER:** «Себест. единицы» — /products `buyPrice`'ni QASDDAN strip qiladi +
> qoralamада FIFO-cost yo'q (blocked). **Marking = QISM 4.** Reja: `2026-07-23-demand-new-1to1.md` (Task 2/3/5).
> **⚙️ DEV ISSIQ:** postgres 5432 (`D:\pgdata-sherset`, bu sessiya `postgres.exe -D` bilan qayta ishga tushirdi) ·
> web :3100 + api :4000 · login `admin@demo.local`/`admin123`. Playwright chrome bu sessiyada ishlatildi.
> ⚠️ **NEXT.md 890+ qator** — keyingi sessiya eski entry'larni `docs/audits/_ARCHIVE-NEXT-*.md`ga ko'chirsin.

> **🟢✅ 2026-07-23c (DEMAND «Отгрузки» — QISM 1A VIZUAL MOS TUGADI · `/new` browser-verified · KEYINGI = 1B)**
> *(Parallel sessiya shu payt 2026-07-23b sales-returns ishini qildi; mening diff'im path-cheklangan — faqat
> `apps/web/src/app/(app)/demands/new/page.tsx` + demand audit doc.)*
> `/new` (Отгрузка yaratish) moysklad `demand-03-new.png` bilan **vizual mos** qilindi (`da20554`).
> customer-order/new namunasiga keltirildi: **3-ustunli meta-grid** (tab'lar ustida) · **«Не оплачено» pill +
> kulrang «Статус» popup** (`/states?entityType=demand` bo'sh) · Адрес доставки+Комментарий o'ng-tepа Textarea ·
> **«Другие поля» tepа inline-havola** (план-sanalar shu yerga) · **pozitsiya sarlavha RU-leak tuzatildi**
> (uz kolonka label'lar; ortiqcha #/image/Уп./Сумма НДС olib tashlandi) · **«Цена включает НДС» default checked**.
> **Live browser smoke** (`:3100` uz-locale) `demand-03-new.png` yoniga → core layout ko'rinadigan farqsiz.
> Gate: web tc0 · biome0 · i18n key ru+uz · demand testlar 111/111. Audit: `docs/audits/_demand-new-1A.audit.md`.
> **HALOL:** «100% 1:1» YO'Q — u faqat QISM 5 QA'dan keyin.
> **⚙️ DEV ISSIQ:** postgres 5432 (`D:\pgdata-sherset`) · `pnpm dev` (web :3100 + api :4000) · login
> `admin@demo.local`/`admin123` — ishlab turibdi. Playwright chrome-lock `mcp-chrome-ca8aa68` bu sessiyada reclaim qilindi.
> **⏭️ KEYINGI = QISM 1B (funksional mos)** — ROADMAP `2026-07-23-demand-section-1to1-ROADMAP.md` §1B:
> «Грузоотправитель» blok-sarlavha · custom-attributes editor (create parity) · **«Прибыль» qatori** (pozitsiya
> state'ni `buyPrice` bilan kengaytir → totals «Кол-во»→«Прибыль») · **«Ячейка» (bin) kolonka** (`{key:'cell'}`+BE) ·
> pozitsiya **«Остаток»/«Себест. единицы»**. Reja: `docs/superpowers/plans/2026-07-23-demand-new-1to1.md` (Task 2–5).
> **Marking (Маркировка) = QISM 4.** ⚠️ **NEXT.md 825+ qator > 600** — keyingi sessiya eski entry'larni arxivlasin.

> **🔬✅ 2026-07-23b (SALES-RETURNS «Возвраты покупателей» — Phase-2 JONLI RE-VERIFY (yangi mashina) + 1 leak FIX)**
> Foydalanuvchi moysklad `/salesreturn` list-capture'ini berdi: «shu sahifa bilan bir xil ko'rinishi/funksiyalari
> bo'lsin, kerakli funksiyalarni chuqur o'ylab to'g'irla». Sahifa allaqachon juda to'liq (list 18-filtr + detail +
> /new; 06-10c da Phase-2 verified edi, lekin bu MIGRATSIYA-QILINGAN mashinada jonli tekshirilmagan edi). **Jonli
> Playwright QA (web:3100/api:4000, admin/admin123):** (1) list render TOZA — chrome/18-filtr/ustunlar/empty-state;
> (2) **/new → create E2E** — kontragent+tovar (UzKabel VVG, 770k, QQS 12%=92.4k, Jami 862.4k — matematika to'g'ri) →
> Saqlash → detail redirect ✓; (3) **post (O'tkazilgan) → stock 140→141** (+1, COST-basis cost_delta 550k — to'g'ri
> yo'nalish+baho) + forma qulflandi ✓; (4) **un-post → stock 141→140** (teskari op, data-integrity ✓); (5) print
> `/print/sales-return/:id` → **200** (tarixiy 404 yopiq); (6) «Omborchiga yubordim» restock-modal ochiladi ✓.
> **🐞 FIX — bitta real leak:** detail pozitsiya-jadvalида «Страна» ustun-sarlavhasi + picker-placeholder UZ rejimда
> RUS chiqarardi (qolgan sarlavhalar Tovar/Miqdor/Narx/… uzbekcha) — `PositionEditor`da hardcode, override yo'q edi.
> **Tuzatildi:** `PositionCustomsConfig.countryLabel?` qo'shildi (`?? 'Страна'` default saqlandi) → header+placeholder
> shundan o'qiydi; detail sahifa `countryLabel: tFields('country')` uzatadi. **Browser 2-locale verify:** UZ=«Davlat» ·
> RU=«Страна» (parity saqlandi; RU heading «Возврат покупателя № 00001» + nav «Возвраты покупателей» = referens bilan
> aynan mos). **Gate:** typecheck 9/9 ✓ · biome 0 ✓ · i18n-key-existence ✓. *(Pre-existing RED, MENIKI EMAS: label-grounding
> GROUNDING-LOCK 25 fail = `docs/moysklad-reference/visual-captures/` fixture'lari bu mashinaga migratsiya qilinmagan [ENOENT];
> i18n-no-hardcoded 1 fail = `losses/`+`labels/print/` committed hardcode — ikkalasi ham mening 2 faylimga tegishli EMAS,
> REGRESSION-LOCK 96 pass ✓.)* **Fayllar:** faqat `sales-returns/[id]/page.tsx` + `PositionEditor.tsx` (parallel demand
> ishiga tegmadim). ⚠️ `packages/db/src/generated/schema.prisma` `prisma generate`dan MessageTemplate'ga yangilandi —
> u DEMAND/parallel sessiyaning sxemasi, **stage QILINMADI** (o'sha ish bilan commit bo'lsin).
> **⚙️ DEV-ENV TUZATISH (past 2026-07-23 entry'dagi «seed» endi to'g'ri emas):** `D:\pgdata-sherset` klasteri bu sessiya
> boshida BO'SH edi (sherset roli YO'Q) — VPS dump'idan tiklandi: `D:\projects\Sherset-ERP-vps-backup\sherset-db-20260719-164251.sql.gz`
> → role+db yaratildi → restore (202 jadval, 43962 demand, 4864 tovar) → `prisma migrate deploy` (5 pending) → admin
> paroli `admin123`ga reset (argon2, prod-hash mos emas edi). Klaster `host` pg_hba = **scram** (trust EMAS). Start:
> `Start-Process 'C:\Program Files\PostgreSQL\18\bin\pg_ctl.exe' -Args '-D','"D:\pgdata-sherset"','-l','<log>','start' -WindowStyle Hidden`
> (pg_ctl `-w` PowerShell'da pipe-hang qiladi — Start-Process detached ishlat).

> **🟢🎯 2026-07-23 (DEMAND «Отгрузки» TO'LIQ 1:1 — DASTUR BOSHLANDI · Session-0 recon + Task 1 discovery TUGADI · KOD-FIX HALI YO'Q)**
> Foydalanuvchi: «shu bo'limdagi barcha funksiyalar/hamma narsa moysklad bilan bir xil bo'lsin» — **to'liq 1:1
> (vizual+funksional), 3 sahifa (ro'yxat/detal/yaratish)**. Brainstorming → sahifama-sahifa, capture-birinchi yondashuv.
> **Bajarilgan (commit):** spec `4972867` · 3 moysklad capture+gap-backlog `e5b9928` · /new reja `9ecd782` · **/new
> vizual delta+feasibility `8dc8bc0`**. Hujjatlar: `docs/superpowers/specs/2026-07-23-demand-section-1to1-design.md` ·
> **`docs/superpowers/plans/2026-07-23-demand-section-1to1-ROADMAP.md` (QISMLARGA BO'LINGAN — har qism = tayyor bosqich,
> tartib 1A→1B→2A→2B→3→4→5, «100%» faqat QISM 5 QA'dan keyin)** · `docs/superpowers/plans/2026-07-23-demand-new-1to1.md`
> (QISM 1 detali) · `docs/audits/demands-live-2026-07-23/` (capture-extract'lar + `_GAP-BACKLOG.md` + `_new-visual-delta.md`;
> HTML/PNG gitignore'da — real mijoz PII).
> **⚙️ DEV-MUHIT ISSIQ QOLDIRILDI (keyingi sessiya arzon davom etsin):** postgres **5432** (`D:\pgdata-sherset` — yangi
> user-space klaster, toza reset; Windows service `postgresql-x64-18` DISABLED, admin kerak → user-space ishlatildi;
> pg_hba = trust localhost) · migrate deploy 170 · seed · `pnpm dev` (web `:3100` + api `:4000`) · login
> **`admin@demo.local`/`admin123`**. Agar o'lgan bo'lsa: `& 'C:\Program Files\PostgreSQL\18\bin\postgres.exe' -D D:\pgdata-sherset -p 5432`
> (Start-Process detached — pg_ctl PowerShell'da pipe-hang qiladi), keyin `pnpm dev`. Playwright profil-lock osilsa:
> `mcp-chrome-ca8aa68` chrome-tree kill.
> **KEYINGI = /new tuzatishlarni bajarish** (`2026-07-23-demand-new-1to1.md` reja, subagent-driven). Task-mapping
> `_new-visual-delta.md` §C'da yangilangan. Eng arzon+qimmatli: pozitsiya i18n RU-leak (uz-locale'da ruscha sarlavha) ·
> bin `{key:'cell'}` (DS qo'llaydi) · field-grid 3-ustun · «Прибыль» qatori (state buyPrice bilan kengaytir) ·
> «Не оплачено» pill. **Marking (Маркировка) = ALOHIDA katta sub-project** (DS'da ustun yo'q). Keyin detal, keyin ro'yxat.
> **HALOL:** hech qanday fix hali qilinmagan — bu faqat recon+discovery. Browser-cert bo'lgunча «done» YO'Q.

> **🟢📢 2026-07-21b (UMUMIY SMS-TARQATMA — kontragent + qo'lda raqam, shablon bilan · Phase-2 browser-verified · DEPLOY YO'Q)**
> Foydalanuvchi: qarzdorlardan tashqari ham SMS yuborish. **Yechim:** yangi `POST /sms/broadcast` — tanlangan
> kontragentlar (ro'yxatdan checkbox) **+** qo'lda kiritilgan raqamlarga tayyor shablon bilan. **Backend:**
> `SmsService.broadcast` (MessageTemplateService inject; kontragent nomi render, debt o'zgaruvchilari bo'sh '—'; raqam
> tozalash + dedupe + no_phone/send_error skip) · `BroadcastSmsSchema` · controller (`counterparty.view` ruxsat) ·
> `sms-broadcast.test.ts` 4 test. **Frontend:** `sms-broadcast-modal` (shablon-picker + qo'lda raqam textarea + qabul
> qiluvchi soni) · kontragentlar sahifasiga «SMS tarqatma» tugma (ListView `selectable`/`bulk` allaqachon bor;
> `bulk.selectedIds` → modal) · i18n(ru+uz). **Gate:** api sms 42 test · web tc0 · i18n parity. **BROWSER-VERIFIED
> end-to-end:** kontragent (ABC) belgilash → «SMS tarqatma» → modal (2 shablon ko'rindi: Qarz eslatmasi★ + Umumiy xabar)
> → Umumiy shablon + 2 qo'lda raqam → Yuborish → **3 SmsLog** (ABC nomi render + 2 qo'lda raqam, entity='Broadcast').
> Commit: `cfed73e`(be) + `b777bf9`(fe). ⚠️ DEPLOY YO'Q. **Umumiy 'announcement' shablon lokalда qo'lда qo'yildi** —
> prod uchun seed'ga qo'shilishi yoki UI'дан yaratilishi kerak (hozir template-editor faqat mavjudlarni tahrirlaydi,
> «yangi shablon» tugmasi keyingi ish).


> **🟢📲 2026-07-21 (SMS: O'Z SIM ORQALI BEPUL YUBORISH — telefon-gateway provayderi, Phase-2 lokal-verified, DEPLOY YO'Q)**
> Foydalanuvchi: Eskiz'ga pul to'lamay, o'z SMS-paketli SIM orqali hammaga yuborish. **Yechim:** yangi `phone_gateway`
> provayderi — Android «SMS Gateway» ilovasi (ochiq kodli `sms-gate.app`, bulut rejim) orqali. Sayt bulut API'ga POST →
> bulut telefonga → telefon SIM orqali real SMS. **Qo'shildi:** (1) `phone-gateway.client.ts` — `POST
> api.sms-gate.app/3rdparty/v1/messages` (Basic auth, `{textMessage:{text},phoneNumbers}`) + `phoneGatewayCheck` (`GET
> /device` — login/parolni SMS yubormasdan tekshiradi, `/health`dan farqli auth talab qiladi) + `toE164`; (2) `sms.schema`
> — `phone_gateway` provayder + email-validatsiya superRefine bilan yumshatildi (login email bo'lishi shart emas);
> (3) `sms.service` — `sendQueuedNow`/`testConnection` provayder bo'yicha branch (`email`=login, `passwordCipher`=parol,
> migratsiya YO'Q — mavjud ustunlar reuse); (4) frontend `settings/sms` — provayder tanlovi + shartli Login/Parol maydon +
> bulut-ilova yordam matni + i18n(ru+uz). **Gate:** api sms 38 test · phone-gateway client 4 test · web tc0 · i18n parity.
> **Lokal end-to-end LIVE-verified:** config saqlandi (`provider=phone_gateway`, non-email login) · test-connection soxta
> cred → «Login yoki parol xato» (real /device 401) · bulk SMS → worker → `sendQueuedNow` phone_gateway branch → **real
> sms-gate.app POST → HTTP 401** (fake cred, aynan kutilgan; real ilova login/paroli bilan SMS ketadi) · browser: provayder
> dropdown + Login/Parol + yordam. **YAGONA qolgan:** foydalanuvchi telefonga ilova o'rnatib, bulut login/parolini kiritishi
> → o'sha zahoti real SMS. Commit: `21e8482`(be) + `2474d37`(fe). ⚠️ DEPLOY YO'Q · migratsiya YO'Q (ustun reuse).
> **Eslatma:** bitta SIM ~30–100 SMS/soat (spam-limit) — ilovada rate-limit sozlanadi; ko'p hajm uchun BE throttle keyingi ish.


> **🟢📩 2026-07-20i (QARZDORLARGA OMMAVIY SMS + TAHRIRLANADIGAN SHABLON — Phase-2 BROWSER-VERIFIED, DEPLOY QILINMAGAN)**
> **✅ PHASE-2 BROWSER-SMOKE (2026-07-20, Playwright + user-space Postgres, `8e8f1bf`):** admin huquqisiz lokal DB ko'tarildi
> (`initdb` + `pg_ctl` port 5432, xizmat emas) → `migrate deploy` (168 migratsiya, mening `20260720170000` ham) → seed →
> `pnpm dev` (api:4000, web:3100). **Jonli tekshirildi:** (1) `settings/sms` — Eskiz config + aloqa maydonlari saqlandi
> (DB: `sms_configs` + `company_settings.messaging_*` tasdiqlandi); (2) `settings/sms/templates` — segment hisoblagich
> «149 belgi · 1 SMS», preview render, o'zgaruvchi-tugmalar; **buzuq shablon guard (review #2) BROWSER-VERIFIED** —
> `{{= custamer.name }}` → xato toast «Shablon xato: noto'g'ri o'zgaruvchi...» + DB body O'ZGARMADI; (3) **BULK SMS
> end-to-end:** 2 qarzdor (ABC telefonli / XYZ telefonsiz) tanlab → «Xabar yuborish» modal → SMS → **SmsLog navbat qatori**
> yaratildi (`to_phone`, `status=pending`, body=«Assalomu alaykum ABC MCHJ! Sizda 2 000 000 som...» — shablon+formatSomMinor
> to'g'ri), XYZ `no_phone` bilan skip; (4) **delivery worker jonli** — SmsLog `attempt=3`, xato «Eskiz login HTTP 401» (FAKE
> cred, aynan kutilgan). **YAGONA qolgan: haqiqiy Eskiz hisobi bilan real SMS yetkazish** (kod+wiring 100% ishlaydi).
> **🐞 BROWSER-CAUGHT FIX (`8e8f1bf`):** `sms_templates.description`'dagi `{{= }}` next-intl ICU parserini buzib xom kalit
> ko'rsatardi → tokenlarsiz matn; + shablon saqlash success/error toast (guard endi ko'rinadi). tc0 · i18n parity ✅.
> **🔀 MESSAGE-TEMPLATE REFAKTORIGA MOSLASH (`5ba1471`):** parallel sessiya SMS shablonni kanal-aware `MessageTemplate`
> kutubxonasiga refaktor qildi (`@@map("sms_templates")` + `channel`/`is_default`, controller `/message-templates`,
> `debt.service` endi `findDefault(accountId,'sms')`). Frontend'ni yangi API'ga moslаdim (faqat FE fayllar — `sms-api`
> `messageTemplateApi`, `settings/sms/templates` kanal-segment + default-badge). **Browser-smoke (lokal, `prisma db push`
> + qo'lda 2 shablon seed):** sms shablon yuklandi, bulk SMS→SmsLog `findDefault` yo'li live, XYZ no_phone skip.
> ⚠️ **KOMMIT NOMUVOFIQLIGI:** FE (`/message-templates`) commit qilingan, LEKIN backend refaktori HALI parallel
> sessiyada **uncommitted** (faqat working tree) — parallel backend'ni commit qilgach muvofiqlik tiklanadi. ⚠️ Parallel
> `seed.ts` bug: `id: ${account.id}-sms-debt` yaroqsiz UUID (seed yiqiladi) — parallel sessiya tuzatsin.
> **Ish (12 task, brainstorm→spec→plan→ijro):** Mavjud Telegram xabar yoniga SMS (Eskiz) kanali qo'shildi. Foydalanuvchi
> talabi: sozlamada SMS hisobi, qarzdorlarni checkbox bilan tanlab bittada yuborish, shablon sozlamadan tahrirlanadi.
> **MUHIM kashfiyot:** SMS backend infratuzilmasi ALLAQACHON bor edi (`modules/sms`: config, Eskiz client, SmsLog navbat,
> retry-worker @30s) — noldan qurilmadi, ustiga ulandi. **Qo'shilganlar:** (1) DB — `SmsTemplate` (accountId,key unique,
> ko'p-maqsadli, `debt_reminder` seed) + `CompanySettings.messaging{Phone,Card,CardOwner}` (migration `20260720170000`,
> QO'LDA yozilgan — lokal Postgres o'chiq edi; **prod'da `migrate deploy` QILINMAGAN**). (2) Backend — izolyatsiyalangan
> `sms-render.util` (Eta; HR `template-render.util`ga TEGILMADI — parallel sessiyada), `SmsTemplateService` CRUD, aloqa
> endpointlari, `DebtService.sendBulkReminders(ids, channel)` (skip-sabablar: no_phone/no_debt/sms_not_configured/
> template_disabled/no_telegram_chat), `POST /debts/reminders/bulk`, Telegram `reminderMessage` aloqa-bloki endi
> CompanySettings'dan (fallback konstanta). (3) Frontend — `settings/sms` (config+aloqa), `settings/sms/templates`
> (o'zgaruvchi-inject + jonli segment hisoblagich + preview), qarzdorlar toolbar'iga "Xabar yuborish" tugma + kanal-modal
> (SMS/Telegram). **Gate:** api sms+debt 120 test ✅ · web sms-segments+i18n-key-existence ✅ · db/web typecheck 0 · api
> typecheck 0 (o'z fayllarim; parallel sessiyaning untracked `hr-telegram-bridge/backfill-plan.util.ts` TS-xatosi meniki
> EMAS). i18n-no-hardcoded'dagi eski losses/labels buzilishlari — pre-existing baseline (NEXT.md 07-11a'da qayd etilgan),
> mening sahifalarim ro'yxatda yo'q. **⚠️ Browser-smoke YO'Q** (lokal Postgres o'chiq). Spec/plan:
> `docs/superpowers/{specs,plans}/2026-07-20-sms-debt-reminders*`. **⏭️ NEXT:** (a) `/deploy` — **`migrate deploy` SHART**
> (SmsTemplate jadval + CompanySettings ustunlar), keyin jonli smoke: sozlamada Eskiz hisobi + shablon → qarzdorni tanlab
> SMS → SmsLog `sent` bo'lishini tekshirish; (b) haqiqiy Eskiz hisobi bilan jonli SMS yetkazish testi; (c) settings/sms +
> qarzdor-modal browser-QA (Phase-2).
> **🔎 ADVERSARIAL REVIEW + TUZATISH (commit `7041162`):** feature-dev:code-reviewer 1 Critical + 2 Important + 1 Minor
> topdi, HAMMASI tuzatildi (+4 test → **124 test**): (1) 🔴 SMS partiyasida per-qarzdor `try/catch` (`send_error`) — bitta
> render/send xatosi butun batchni 500 qilib **dublikat-SMS** xavfi tug'dirardi; (2) 🟠 `SmsTemplate.upsert` saqlashdan
> oldin haqiqiy Eta `test-render` (buzuq shablon → keyingi har yuborishda crash edi); (3) 🟠 Telegram `res.reason` uzatiladi
> (hardcode emas); (4) 🔵 o'lik `!counterpartyId` shart olib tashlandi. + i18n `reason_send_error` (ru+uz).
> **⚠️ MULTI-AGENT STASH-TANGLE (CLAUDE.md §6 hodisasi TAKRORLANDI):** review-fix commitim (6 fayl) parallel telegram
> sessiyasi bilan bir vaqtda commit + ularning `git commit --amend`/rebase tufayli ORPHAN bo'ldi (kontent working-tree'ga
> qaytdi, yo'qolmadi) → pathspec-commit (`git commit -- <fayllar>`) bilan qayta commit qilindi (`7041162`). **Zaxira:**
> `scratchpad/review-backup/` (6 fayl). Kontent to'liq va to'g'ri (`send_error`×3 HEAD'da tasdiqlandi). Umumiy tarix
> QAYTA YOZILMADI (protokol §6). **Saboq:** parallel commit oynasida `git restore --staged`/commit qilma — tangle keltiradi.
> **⏭️ DEPLOY QARORI (foydalanuvchi, 2026-07-20i):** deploy KUTILADI — parallel telegram sessiyasi main'ni faol qayta
> yozayotgan va o'z ishi tugallanmagan edi; main HEAD deploy'i mening SMS + ularning tekshirilmagan telegram ishini BIRGA
> chiqarardi (aralash tarix — ajratib bo'lmaydi). Parallel barqarorlashgach ikkalasi birga deploy qilinadi (mening ishim
> commit qilingan, xavfsiz). `migrate deploy` (SmsTemplate + CompanySettings) o'shanda SHART.
>
> **🟢📱 2026-07-20h (OMBOR RESPONSIVE — 1-BOSQICH + YIG'ISH-VARAQA QR OLIB TASHLASH — ✅ DEPLOYED, browser-smoke YO'Q)**
> **Ish:** (1) **App-shell mobil navigatsiya** — `AppShell.tsx` <lg (1024px) da hamburger + `<Drawer>` (asosiy
> modul-tab'lar vertikal), `SubNav.tsx` <lg da "joriy sahifa ▾" `<DropdownMenu>` (13+ kichik-tab o'rniga). Mavjud
> Drawer/DropdownMenu qayta ishlatildi, yangi primitiv YO'Q; ≥lg desktop o'zgarmadi. (2) **Omborlar (Stores) sahifalari
> responsive:** yacheyka jadvallariga `overflow-x-auto`, sarlavha/toolbar `flex-wrap`, tugmalar 36px touch-target,
> owner/sana truncate, address katak `title`. (3) **Yig'ish varaqasi** (`print/picking/[orderId]`): per-qatorli QR
> olib tashlandi, yacheyka kodi (NN-NN-NN-NN) endi eng ko'zga tashlanadigan element (foydalanuvchi talabi).
> **Deploy:** 2 commit (`d6fc105` responsive, `a4f8044` picking) → bundle `ef54914..HEAD` → VPS ff-merge (7 fayl VPS'da
> toza edi) → `pnpm --filter @moysklad/web build` → `pm2 restart sherset-web`. Gate: web tc0 · ds tc0 · biome0 · web
> Vitest regressiya YO'Q (baseline 17-failed/55 → 16/54, SubNav testi getByRole bilan tuzatildi — mobil dropdown
> `<button>` "A" bilan `getByText` ambiguity qildi). ⚠️ **Browser-smoke YO'Q** — lokal Postgres (`postgresql-x64-18`)
> to'xtagan, admin huquqi yo'q → Playwright 375/768/1280 tekshiruvi qilinmadi (foydalanuvchi "vizual tekshiruvsiz
> deploy qil" dedi). Keyingi safar real qurilmada/brauzerda ko'rish tavsiya etiladi.
> **⚠️ PARALLEL SESSIYA (barcode-skaner feature):** `cell-labels/page.tsx`, `product-select-modal.tsx` (+ untracked
> `cell-scan-modal.tsx`, `use-barcode-scanner.ts`, `barcode.util.ts`, `scan/`, va `store-cell.controller.ts`/
> `store.schema.ts`/`product.*`/`hr-telegram*`/`supply.*`/`telegram-lookup.ts` modified) — bu parallel sessiyaning
> commit qilinmagan ishi (VPS'da jonli, git'da yo'q). MENING responsive tuzatishlarim shu 2 web-faylga ham kerak edi,
> LEKIN protokol bo'yicha (faqat o'z fayllarim commit) ularni deploy'ga KIRITMADIM. **Backlog:** parallel sessiya bu
> fayllarni commit qilgach, `cell-labels` header-wrap va `product-select-modal` folder-tree mobil-collapse'ni qo'shish
> kerak (kod lokal working-tree'da tayyor, faqat commit-base kutmoqda). ⚠️ **ef54914 latent build-issue:** 01dab9e
> `address-storage-section`ni `headerExtra`+`CellScanModal`ga ishora bilan commit qilgan, lekin ular untracked —
> repo faqat working-tree fayllar bilan build bo'ladi (fresh-clone CI buziladi). Bu parallel feature yakunlanganda hal bo'ladi.
> **Ombor responsive BACKLOG (foydalanuvchi "keyin qolganlarini bitta-bitta" dedi — 12 sahifa qoldi):** Kirimlar,
> Hisobdan chiqarishlar, Ko'chirishlar, Inventarizatsiya, Terish to'lqinlari, Ichki buyurtmalar, Joylashtirish,
> Omborchi, Yacheyka skaneri (/cell), To'ldirish kerak, Aylanma, O'quv. Har biri alohida sessiyada.

> **🟢💻 2026-07-20 (MASHINA KO'CHIRISH + QARZ-ESLATMA JONLI-CHAT FIX — ✅ DEPLOYED + jonli tasdiqlangan)**
> **DEPLOY (2026-07-20, shu yangi mashinadan birinchi marta):** GitHub o'lik → `git bundle` (a2cc529..HEAD,
> ~9.5KB, inline base64-over-exec) → VPS'da `git fetch <bundle> HEAD:refs/heads/incoming-deploy` + `merge
> --ff-only` (bundle "main" emas "HEAD" nomi bilan yozilishini unutma — refspec shunga moslansin). `pnpm
> install` (3.5s, o'zgarish yo'q) → `@moysklad/money` build → `pnpm build:web` **BIRINCHI URINISH
> MUVAFFAQIYATSIZ**: `OrderTelegramPanel counterpartyName` propiga `string|null` uzatilgan edi (prop
> `string|undefined` kutadi) — lokal muhitda `@moysklad/money` resolve muammosi tufayli to'liq web
> typecheck oldindan ishlamagan, shu bug shu sababli o'tib ketgan edi (VPS'ning haqiqiy `next build`
> typecheck bosqichi tutdi). `?? undefined` bilan tuzatildi, qayta bundle+merge+build → **muvaffaqiyatli**
> (`✓ Compiled successfully in 3.2min`). ⚠️ **paramiko nohup-hang gotcha YANA tasdiqlandi** (07-04j'dagi eski
> yozuvga mos): `nohup cmd & disown` chan.read()'ni hali ham osiltiradi — ishonchli yechim: `setsid bash -c
> {cmd} </dev/null >/dev/null 2>&1 &` yuborib, chan'ni O'QIMASDAN yopish, keyin alohida exec'da
> `while pgrep -f 'next build'; do sleep 5; done` bilan poll qilish. `prisma migrate deploy`: pending yo'q.
> `pm2 restart sherset-api sherset-web` (FAQAT shular — boshqa 6 ta ijarachi pm2 app tegilmadi, uptime
> tasdiqlandi). **Jonli verify**: `sherset.biznesjon.uz` 200 · debts/[id] 200 · api/debts 401-korrekt ·
> `.next` build ichida `order-telegram-panel`/`tg-counterparty-thread` aynan `debts/[id]` chunkida topildi
> (yangi kod haqiqatan deploy qilingani tasdiqlandi, grep bilan). Foydalanuvchi savoli — «qarz xabari
> yuborilganda ism/summa avtomatikmi» — **HA, tasdiqlangan** (backend `counterparty.name` + hisoblangan
> qoldiqni ishlatadi, bug yo'q edi; asl muammo faqat jonli-chat ko'rinmasligi edi, shu deploy bilan hal
> bo'ldi). ⚠️ Browser-UI smoke (haqiqiy operator debts/[id]ga kirib chatni ko'rishi) hali qilinmagan —
> keyingi safar Telegram orqali eslatma yuborib, saytda tekshirish tavsiya etiladi.
> **(1) MASHINA KO'CHIRISH.** Loyiha VPS (`13.140.157.10`)dan yangi kompyuterga to'liq ko'chirildi: SSH ishonchsiz
> (doimiy fon bot-skanerlash — botlar `root`ga tinimsiz login urinmoqda, MAQSADLI EMAS, hech biri muvaffaqiyatli
> bo'lmagan; SFTP ayniqsa tez-tez uzilardi) → `paramiko` + `base64`-over-exec (qayta-ulanish+hajm-tekshiruv bilan)
> transport ishlatildi. `main` — **143 commit, HEAD `a2cc529`, 27 ta commit qilinmagan o'zgarish** (aynan shu holatda
> ko'chirildi, `.env` fayllar bilan). ⚠️ **VPS repo `.git/shallow`li ekan** — tarix `49d9a595` (2026-07-02, birinchi
> deploy commit)dan boshlanadi, undan OLDINGI tarix VPS'ning o'zida ham yo'q edi (bizning ishimiz emas — manba
> cheklovi). Shu sababli **eski (2026-06-02 va undan oldingi) commit-hash'larga ishora qiluvchi NEXT.md yozuvlari
> endi tekshirib bo'lmaydigan hash'larga ega** (`4f9f7805`/`eb82668e`/`70d01ce0`/`fa4973af` — preflight shularni
> «yo'q» deb belgilaydi, bu KONFABULYATSIYA EMAS, faqat shallow-chegaradan oldingi tarix). 26 ta remote-tracking
> branch (`bal`/`bundle`/`kb`/`cld`/…, hammasi avvalgi ko'chirish urinishlaridan qolgan, `main`dan farqli tarix)
> foydalanuvchi tanlovi bilan SAQLANMADI (faqat `main` kerak edi). `sherset-servis`/`sherset-akademiya`/eski nusxa —
> foydalanuvchi tanlovi bilan TEGILMADI (alohida mahsulotlar). DB: faqat `sherset` (asosiy) pg_dump qilindi, 18MB,
> `D:\projects\Sherset-ERP-vps-backup\`da (repo TASHQARISIDA — .git ichiga tushmasin uchun). **Electron desktop
> qobiq manba kodi VPS'da UMUMAN topilmadi** (faqat tayyor `.exe` bor `sherset-updates`da) — kerak bo'lsa boshqa
> joydan qidirilsin. VPS'da vaqtinchalik fayllar tozalandi, hech narsa o'zgartirilmadi/o'chirilmadi.
> **(2) QARZ-ESLATMA JONLI-CHAT FIX.** User: Telegram qarz-eslatma tugmasi bosilgach debtor sahifasida xabar
> ko'rinmasdi. **Tub sabab**: ism/summa avtomatik to'ldirish TO'G'RI ishlagan (bug yo'q edi) — muammo shundaki
> eslatmalar YANGI yo'l (`HrTelegramOutbox`, MTProto userbot) orqali ketadi, lekin debtor sahifasidagi
> `TelegramChatCard` ESKI yo'ldan (`TelegramChatMessage`, Bot API/Business) o'qirdi — ikkala jadval BUTUNLAY
> uzilgan. Loyihada bu muammoni allaqachon to'g'ri hal qiladigan, lekin ISHLATILMAYOTGAN komponent bor edi:
> `OrderTelegramPanel` (`/telegram/counterparty/:id/thread`, ikkala kanalni birlashtiradi, 10s poll). **Fix**:
> `debts/[id]` sahifasida `TelegramChatCard`→`OrderTelegramPanel` almashtirildi; panelga CHEK-RASM ko'rish
> qo'shildi (eski kartada bor edi, yangisida yo'q edi — `counterpartyThread` backend + panel ikkalasi ham
> `attachmentId/fileName/mimeType`ni endi uzatadi); `debts/page.tsx` ro'yxatida eslatma muvaffaqiyatli yuborilgach
> endi avtomatik `/debts/:id`ga o'tkazadi. Gate: `telegram.service.test.ts` 8/8 (+1 yangi, chek-rasm o'tishini
> tekshiradi) · biome 0 (o'z fayllarida) · i18n `telegram_panel.open_file` ru+uz qo'shildi. ⚠️ **Browser-smoke YO'Q**
> — bu mashinada hali lokal Postgres/dev-server sozlanmagan (yangi ko'chirilgan, `pnpm dev` uchun DB kerak).
> **(3) PREFLIGHT GIGIYENASI.** `scripts/preflight.mjs`dagi MEMORY.md yo'li IKKINCHI marta mashina ko'chganda
> buzildi (07-04'da bir marta, endi yana) — endi qattiq yozilgan yo'l o'rniga `~/.claude/projects/*`dan avtomat
> topadigan `findMemoryPath()`ga almashtirildi (kelasi ko'chishda yana buzilmasin).
> ⏭️ **NEXT (keyingi sessiya, tartib bo'yicha emas — kerakli birini tanlang):**
> - **Lokal dev-stack sozlash** (Postgres 5433 + `pnpm db:seed` + `pnpm dev`) — Phase-2 QA va browser-smoke uchun
>   SHART, bu mashinada hali qilinmagan.
> - **NEXT.md arxiv** (628>600 qator, preflight anomaliyasi) — pastdagi eski (2026-07-04 va undan oldingi) entry'larni
>   `docs/audits/_ARCHIVE-NEXT-2026-07-20.md`ga VERBATIM ko'chirish; bu safar `4f9f7805`/`eb82668e`/`70d01ce0`/
>   `fa4973af` ishora qiluvchi eski entry'lar ham arxivga tushadi (ular allaqachon tarix, faol ish emas).
> - **07-07 MULTI-BIN Phase-2 deploy** (pastda) — `migrate deploy` + jonli smoke, HALI QILINMAGAN, foydalanuvchi
>   tasdiqlashi kerak (prod migratsiya).
> - **07-11a QARZ UNDIRISH**: QarzOperatori/QarzKassiri rollarini real xodimlarga biriktirish + Phase-2 QA (real
>   brauzer) — ko'chirishdan oldin ham kutayotgan edi.

> **🟡🔢 2026-07-07 (MULTI-BIN PHASE 2: yacheykaga SON bog'lash, qo'lda — Phase-1 strukturaviy, DEPLOY QILINMAGAN)**
> User: «A tovar 30 dona 1-ombor 1-polka 1-qavat 10-yacheykada, 70 donasi 2-ombor…9-yacheykada — qanday qilaman?»
> → Phase 2 quraldi (per-cell qty, QO'LDA yuritiladi — hech qanday hujjat unga post qilmaydi, null=yuritilmaydi).
> **(1) DB:** `Product.locQty` + `ProductLocation.qty` (Decimal(20,6)); migratsiya `20260704170000_cell_qty` —
> **prod'ga HALI applied EMAS** (lokal db ham down edi — hech qayerda apply qilinmagan, deploy'da `migrate deploy`).
> Generated client qayta generatsiya qilindi (committed). **(2) API:** Create/Update `locQty` qabul qiladi; PUT
> `/products/:id/locations` har qatorda `qty`; `GET /products/cell/:code` har item'da `cellQty` (primary→locQty,
> extra→ProductLocation.qty; locQty javobdan strip); picking-sheets `binLocation`/`extraBins` endi «01-02-03-05 ×30»
> suffiksli — omborchi panel + termoprint hech qanday FE o'zgarishsiz ko'rsatadi. **(3) Web:** tovar kartasi
> «Joylashuv»da «Soni (shu yacheykada)» input (i18n `loc_qty_label` ru+uz) · «Qo'shimcha yacheykalar» kartasida qty
> ustuni (soni placeholder) · `/cell/[kod]`da cellQty ko'k asosiy raqam + «shu yacheykada · jami N» (cellQty yo'q
> bo'lsa eski totalQty rangli ko'rinish). **Gate:** tc0 · biome0 · api product-schema 35/35 (+4 yangi qty test) ·
> web Vitest **0 regress**. ⚠️ **PRE-EXISTING failure'lar hujjatlandi (meniki EMAS — toza HEAD worktree'da AYNAN
> takrorlandi):** web 53 test/16 fayl (convention-lock'lar: label-grounding ×4 modul, money-input-rollout,
> retail-cash-scale, raw-element, header-conventions, i18n-no-hardcoded…) + api 4 (product-filter-parity
> `ProductPackSchema…tasnifCode` regex {0,200} oynasidan `codeType` qo'shilganda chiqib ketgan; product.service.test
> create-mock'ida `variant.findMany` yo'q). **Keyingi sessiya bu lock-qarzni alohida ko'rsin** (relock yoki fix).
> ⚠️ Browser-smoke YO'Q · deploy YO'Q. NEXT.md 620→~590 (3-tur arxiv: 2×2026-06-26 → `_ARCHIVE-NEXT-2026-07-04.md`,
> 06-08o dublikati + 06-10 fragmenti olib tashlandi — arxivda verbatim bor edi). ⏭️ NEXT: `/deploy` (migrate deploy
> shart!) + jonli smoke (kartada qty saqlash → /cell'da ×N → picking'da suffiks); keyin ixtiyoriy Phase 2b: qty
> yig'indisi vs ombor qoldig'i solishtiruv-ogohlantirish; hujjat-post bilan avto-yuritish = KATTA alohida qaror.

> **🟢💰 2026-07-11a (QARZ UNDIRISH MODULI — TZ v2 to'liq · ✅ DEPLOYED + jonli HTTP-verify)**
> Foydalanuvchi TZ'si (`Qarz_undirish_TZ.docx`) bo'yicha yangi mustaqil bo'lim (`9d8cbca`): qarzdorlar ro'yxati
> (§3.1) · mijoz profili 3 ajratilgan bo'lim (§3.2) · qarz berish izoh+sana MAJBURIY (§3.3) · muloqot tarixi
> append-only rol bilan (§3.4) · bugungi qo'ng'iroqlar, overdue qizil (§3.5) · kassa to'lovi, qisman=izoh majburiy
> (§3.6) · karta-screenshot to'lovi attachment'da (§3.7) · 10s polling sinxron (§3.8) · kassir/operator kunlik
> hisobot (§3.9). DB: debts/debt_payments/debt_notes (additive, CounterpartyBalance'ga TEGMAYDI — TZ §7). RBAC:
> 4 entity + QarzOperatori/QarzKassiri (matritsa testda qulflangan, jumladan «kassir hisobot ko'rmaydi» — test
> tutgan real xato). Gate: tc 0+0 · debt test 31/31 · biome 0 · i18n (o'z fayllari) 0. **DEPLOY (bu mashinada
> birinchi)**: GitHub kirish YO'Q edi → git bundle+scp → ff-merge 7549408→9d8cbca; pg_dump zaxira 16MB
> (`/root/backups/sherset_pre_debt_20260711_134720.dump`) → money build → build:web nohup BUILD_OK → migrate
> deploy → seed-debt-roles (prod-xavfsiz, +144 ruxsat qatori, demo-data YO'Q) → pm2 restart faqat sherset-* →
> verify: /debts 200 (chunk'da «Qarz undirish» bor) · API 401-korrekt · boshqa ijarachilar tegilmagan (8D uptime,
> climartgroup 200; climart.biznesjon.uz 410 — OLDINDAN shunday, menga aloqasiz). Lokal dev ham to'liq ko'tarildi
> (PostgreSQL lokal user+db yaratildi, 157 migratsiya, seed). ⚠️ i18n gate'da 7 eski buzilish bor (losses/labels —
> mening ishimdan OLDIN mavjud). ⏭️ NEXT: prod'da QarzOperatori/QarzKassiri rollarini real xodimlarga biriktirish +
> Phase-2 QA (real brauzer); ixtiyoriy: Telegram bildirishnoma (§3.8 tavsiya) + WS o'rniga polling'ni ko'rib chiqish.

> **🟢🖨️ 2026-07-04l (SENIK CHOP ZANJIRI: exe v1.0.3 avto-chop + aniq o'lcham + markazlash — ✅ DEPLOYED)**
> 07-04k davomi, user shikoyatlari ketma-ket hal qilindi: «exe'da avtomatik chiqmayapti» → «o'lcham noto'g'ri» →
> «markazga chiqsin». (1) **mm-birlik** (`c870c43`): label div px→mm (@page bilan aynan mos). (2) **exe'da avto-chop**
> (`d7edf9e`): cell-labels'da Electron'da printer-tanlash (localStorage, per-PC) + «Chop etish (avtomatik)» —
> `printHtmlNative` (print-agent'ga yangi eksport) inline-uslubli HTML'ni silent bosadi; brauzerda window.print
> fallback. (3) **ILDIZ BUG**: desktop `main.js` printSheet 80mm-chek qog'oziga qattiq yozilgan edi (width=80mm,
> height=kontentdan) — label noto'g'ri o'lchamda chiqardi. **exe v1.0.3** (`c571c4a`, feat/desktop-app):
> `pageSizeMicrons` param (10–300mm validatsiya, legacy 80mm saqlanadi); web `printHtmlNative(..., {widthMm,heightMm})`
> uzatadi (`23d9cb4`). Build+upload: `Sherset-Setup-1.0.3.exe`+latest.yml+blockmap → `/var/www/sherset-updates/`
> (82MB exec-kanal, 157s; yml/exe HTTPS 200) — auto-update hamma PC'ga o'zi boradi. (4) **markazlash** (`3569841`):
> label mazmuni space-between emas markazda (preview + native HTML). Jonli: barcha buildlar BUILD_OK, sahifa 200.
> ⚠️ Real label-printerda jonli chop hali USER tomonidan tasdiqlanmagan; siljisa — «Siljitish X/Y» kalibrlash rejada.
> ⚠️ SSH-uzilishlar ko'p kuzatildi (10054, ehtimol 82MB upload paytida) — deploy-poll'ni qayta-ulanish bilan qilish.
> 💡 TAKLIF (3× kuzatilgan muammo): har deploy'da ~5 daqiqalik chunk-400 oynasi bor (build .next ustidan yozadi) —
> ATOMIC DEPLOY (alohida papkada build → symlink swap) keyingi infra-ish sifatida qilinishi kerak.
> Desktop worktree: `../sherset-desktop` (node_modules junction bilan) — kelajak exe-release'lar uchun qoldirildi.

> **🟢🏬 2026-07-04k (YACHEYKA↔OMBOR BOG'I + 58×29mm SENIK + SKLAD'DA SKANER TABI — `96a8936` ✅ DEPLOYED)**
> 07-04j davomi, user: «Omborlar tabi + skaner ombor bilan mos + senik 29×58mm qog'ozga mos». (1) cell-labels
> default 58×29mm (60×40 edi; forma inputlari qoladi); (2) Sklad subnav'ga «Yacheyka skaneri» (/cell) —
> «Omborlar» (07-04i) yonida; (3) `GET /products/cell/:code` javobida `cell.store` (Store.code=sklad raqami
> konvensiyasi, padded/unpadded lookup) → kartochkada «Ombor: <nom>». Gate: tc0 · biome0(1 warn). Jonli verify:
> build+restart OK, cell API 200 (Panasonik topildi), labels sahifasida 58 SSR'da, prod 200. ⚠️ **Prod'da 4 ombor
> ham `code=NULL`** (API bilan tekshirildi) — «Ombor: …» chiqishi uchun user Sozlamalar→Omborlar'da har omborga
> Kod=sklad raqamini kiritishi kerak (masalan Основной=2). Browser-UI smoke YO'Q; 58×29 print real printerda sinalsin.

> **🟢📡 2026-07-04j (YACHEYKA SKANERI: cell barcode → ichidagi tovarlar — `84c9db2` ✅ DEPLOYED + jonli tasdiqlangan)**
> User maqsadi: «yacheyka barcode'ini skanerlasa yoki dasturdan kirsa — unda qanaqa tovar borligi va tovar haqida
> ma'lumot». **API** `GET /products/cell/:code` (NN-NN-NN-NN, unpadded yoki skaner yuboradigan tiresiz 8 raqam —
> label CODE128C formati): asosiy manzil (Product.loc*) ∪ qo'shimcha yacheykalar (ProductLocation) + har tovarga
> ombor qoldiqlari; `cell-code.util.ts` (parseCellCode/segmentWhere, 0-segment=NULL semantika) + 8 vitest. **Web**:
> `/cell` — skaner kirish sahifasi (autofocus input, Enter→kartochka); `/cell/[kod]` — yacheyka kartochkasi (tovarlar,
> rangli qoldiq, → /scan/<id> to'liq info; keyingi yacheykani uzluksiz skanerlash input'i); omborchi panelida
> «Yacheyka skaneri» havolasi. Gate: api·web tsc0 · biome0 · yangi 8/8 · button-conv tegilmagan. ⚠️ product-modulda
> 4 PRE-EXISTING test-fail (filter-parity regex + service-mock findMany) — toza HEAD'da ham tasdiqlandi, mening
> diff'imga aloqasiz, keyingi sessiya triage qilsin. **Jonli verify (prod)**: `cell/02-17-02-15` va `02170215` →
> 200, «Panasonik ramka 4x, qoldiq 59» (real DB mos!); `xx-bad` → 400 uzbek xabari; /cell va /cell/[kod] 200.
> ⚠️ Browser-UI smoke YO'Q. Deploy gotcha tasdiqlandi: paramiko'da nohup-launch kanalni baribir osiltirishi mumkin —
> ishonchli yo'l: launch'ni alohida channel'da o'qimasdan yopish (fire-and-forget) + log-poll alohida exec'da.

> **🟢🏷️ 2026-07-04i (YACHEYKA SENIKLARI LABEL-QOG'OZ FORMATIDA + SKLAD TABIDA «OMBORLAR» — `8e2d1a3` ✅ DEPLOYED)**
> 07-04g davomi, user talabi: «A4 emas — har senik label qog'oz formatida; /stores uchun tab yo'q». (1) Chop endi
> A4 2×5 to'r EMAS: har senik ALOHIDA sahifa, `@page` = label o'lchami (default 60×40mm, formada «Qog'oz (mm)»
> eni/bo'yi inputlari, 20–210mm); kod shrifti enga, shtrix balandligi bo'yga moslashadi. (2) `stockSubNav`ga
> «Omborlar» (/stores) QAYTARILDI (o'chirilgan-dublikat izohi bekor — yacheyka labellari kirish nuqtasi shu yerda;
> `subnav.stock.stores` kaliti mavjud edi). Gate: tc0 · biome0 · navigation-test 47/48 (1 = eski pagination lock).
> Deploy: build BUILD_OK · `pm2 restart sherset-web` (api tegilmadi — pull web-only). Jonli HTTP-verify:
> /stores/cell-labels 200 + yangi matn/inputlar SSR'da («Qog'oz» ×3), /moves HTML'da «Omborlar» tab, /stores 200.
> ⚠️ Browser-UI smoke YO'Q (print-preview'ni real label-printerda sinash qoldi). Paramiko gotcha tasdiqlandi:
> jim (output'siz) uzun kanal PipeTimeout beradi — poll'ni qisqa, chiqishli probe'lar bilan qilish kerak.

> **🟢📊 2026-07-04h (DASHBOARD: VAQT-FILTR TEPADA + MOYSKLAD BO'LIMLARI O'CHDI — `bf89a49` ✅ DEPLOYED, API jonli tasdiqlangan)**
> User: «statistika kartalarining time filtrlarini tepaga joylashtir, pastdagi keraksizlarni olib tashla». **FE**
> (`(app)/page.tsx`, 1100→~390 qator): tepada DateFilterBar — preset pill'lar (Bugun/Kecha/Shu hafta/Shu oy/Shu yil)
> + erkin sana-oralig'i inputlari, kartalarni boshqaradi; Sales(chart)/Overdue/Money/RecentDocs (moysklad Показатели
> merosi) BUTUNLAY o'chirildi (−832 qator; detal ko'rinishlar /sales·/money·/audit'da qoladi); snapshot kartalar
> «(bugungi)»→«(joriy)». **API**: sotuv-dashboard `?dateFrom&dateTo` (legacy `?date` saqlanadi) — `resolveSotuvWindow`
> pure util + 8 vitest; windowed metrikalar diapazon bo'ylab, snapshot'lar joriy-nuqta. button-conventions relock
> (ghost-Button → KPI+filtr markerlari). Gate: api·web tsc0 · biome0 · report-modul 261/261 · button-conv 95/95.
> **Jonli verify (prod)**: sahifa 200 · `?dateFrom=06-28&dateTo=07-04` → kirim 1.89 mlrd (hafta) vs 34.8 mln (bugun),
> legacy/bo'sh param ham to'g'ri. ⚠️ Browser-UI smoke YO'Q (faqat API+200). Deploy gotcha: paramiko `nohup` ishga
> tushirishda `</dev/null` SHART — aks holda kanal EOF kutib timeout (build o'zi ketaveradi, qayta ulanish yetadi).

> **🟢🏷️ 2026-07-04g (YACHEYKA LABELLARI → OMBORLAR SAHIFASI — `fa79a78` ✅ DEPLOYED)**
> **Deploy 07-04:** alohida deploy KERAK BO'LMADI — parallel sessiyaning `bf89a49` deploy'i `fa79a78`ni (ajdodi)
> o'z ichiga olgan. Jonli HTTP-verify: `/stores/cell-labels` 200 + «Yacheyka labellari» SSR-HTML'da, eski
> `/labels/cells` 404, `/settings/stores` 200. ⚠️ Browser-UI smoke (havola bosish, print-preview) hali YO'Q.
> User talabi: yacheyka-label generatori tovar-seniklar sahifasi orqasidan omborlarga ko'chsin. (1) Route ko'chdi:
> `/labels/cells` → `/stores/cell-labels` (`(app)/stores/cell-labels/page.tsx`; `startsWith('/stores')` tufayli
> «Sklad» moduli yonadi); (2) `?sklad=NN` — ombor kodi 0–99 raqam bo'lsa Sklad segmenti prefill, `?store=<nom>` —
> header'da «Ombor: …» (useSearchParams `<Suspense>` bilan); (3) StoresListView har qatorida «Yacheyka labellari»
> ustun-havolasi (`pages.stores.cell_labels` uz/ru); (4) `/labels/print`dagi goto-cell-labels tugmasi o'chirildi.
> Chop formati o'zgarmagan: A4 2×5 87.5×50mm senik-qog'oz + CODE128C. Gate: tc0 · biome0 (print sahifada eskidan
> qolgan nursery-warning) · web Vitest **regress YO'Q** — 53 fail HEAD'da ham aynan shu (stash-tekshiruv bilan
> isbotlandi), 2318 pass. Parallel sessiya: NEXT.md/progress/desktop diff'iga tegilmadi, diff path-cheklangan.

> **🟢🧰 2026-07-04f (CLAUDE MUHITI KUCHAYTIRILDI — `84cf1d1`, kod o'zgarishi YO'Q)**
> Harness-sozlash: (1) **NEXT.md 1691→535 qator** — 06-10…06-25 entry'lar `docs/audits/_ARCHIVE-NEXT-2026-07-04.md`ga
> VERBATIM (qoida: bu bo'limda eng yangi ~8–10 entry qoladi, oshsa arxivga); (2) **CLAUDE.md §5 «Loyiha xaritasi»**
> qo'shildi — kod izlashdan OLDIN shu yerga qara + yo'q global-CLAUDE.md ishoralari tozalandi; (3) **`.claude/commands/`**:
> `/davom` (fokus-sessiya protokoli) · `/deploy` (VPS tartibi+gotcha) · `/qa-cohort` (Phase-2 QA) — gitignore istisno
> qo'shildi; (4) repo TASHQARISIDA: parent papka `.claude/settings.local.json` — bir-martalik permission qatorlar
> wildcard'ga tozalandi (60+→23) + **SessionStart hook**: `node scripts/preflight.mjs` endi har sessiya avto yugadi.
> Memory: `claude-harness-setup.md`. ⚠️ Parallel sessiyaning uncommitted diff'i (labels, stores, desktop/) TEGILMADI.

> **🟢🧭 2026-07-04e (NAV: «Pul»+«CRM» → bitta «Kontragentlar» moduli — `a2b8302` ✅ DEPLOYED)**
> User qarori: 2 topbar bo'lim o'rniga bitta kontragent-markazli sahifa. Topbar'da endi «Kontragentlar» (ichki key
> 'crm' qoldi — ripple kam); strip tablari: Kontragentlar · To'lovlar (/payments birlashgan lenta) · O'zaro
> hisob-kitoblar (/reports/counterparty-balance, module-highlight maxsus-case) · Avanslar · Shartnomalar · Chegirmalar ·
> Ballar · Tuzatishlar · Bank vypiska. Nav'dan olindi (URL ishlaydi): calls · opportunities/kanban/pipelines; /payrolls
> endi HR'ni yoritadi; cash-flow/PnL Hisobotlarda (dublikat edi). NAV_PERMISSIONS.crm pul entitilarini yutdi.
> nav.crm relabel uz/ru. Gate: web tsc0 · biome0 · navigation-test 50/51 (1 = eski pagination lock) · i18n pass.
> Jonli: /counterparties va /payments 200, yangi build restart qilindi. AskUserQuestion timeout → tavsiya variantlar
> qo'llandi (user keyin o'zgartirsa: calls/bitimlarni qaytarish = crmSubNav'ga 2 qator). **⏭️ G'oya (Phase-2):**
> /counterparties sahifasining o'zida haqiqiy Tabs-komponent (hozir strip-nav orqali) + «To'lovlar»da kontragent-filtr
> default. Qolgan umumiy qarzlar 04c/04d entrylarida.

> **🟢💬 2026-07-04d (TELEGRAM BUSINESS — kontragent chatlari EGANING NOMIDAN — `c3aee3f` ✅ DEPLOYED, token kutilmoqda)**
> User: MoySklad'dagi kabi «kontragent kartasida TG chat + mening nomimdan xabar». Yechim = **rasmiy Telegram Business**
> (user Premium bor): «ko'rinmas» bot Settings→Telegram Business→Chatbots'da ulanadi → mijoz botni KO'RMAYDI, xabar
> egasining nomidan ketadi/keladi. **DB** (`20260704160000`, prodga applied): TelegramConfig += businessConnectionId/
> UserId/UserName · yangi `TelegramChat` (accountId+chatId unique, counterparty bind SetNull) + `TelegramChatMessage`
> (in/out). **API:** webhook endi `business_connection`/`business_message`ni parse qiladi (pure util + 5 test);
> setWebhook allowed_updates kengaydi; `/telegram/business-status` · `/telegram/chats` (+?counterpartyId/?unbound/q) ·
> `chats/:id/messages` · `chats/:id/bind` (PUT) · `chats/:id/send` (business_connection_id bilan yuboradi). **Web:**
> `TelegramChatCard` kontragent sahifasi o'ng ustunida (activity widget ostida) — unbound chatni bog'lash, tarix
> (10s poll), egasining nomidan yozish; ru+uz i18n. Gate: api/web tsc0 · biome0 · tg vitest 5/5 · i18n-key pass.
> Jonli: endpoints 200 (`configured:false`). **⏭️ QOLGAN (user amali):** (1) @BotFather'da bot → token; (2) men PUT
> /telegram/config + webhook o'rnataman (url = `…/api/v1/telegram-webhook/<accountId>`, account `…0001`); (3) user
> TG Settings→Telegram Business→Chatbots'da botni ulaydi; (4) sinov: mijoz yozadi → kartada ko'rinadi → javob egasining
> nomidan. Keyin Phase-2: avto-xabarlar (buyurtma holati/qarz) shu kanal orqali. ⚠️ Cheklov: faqat MAVJUD chatlarga.
> (Parallel sessiya shu orada `2ba937b` kassa-KPI + `a71ede3` balances-import qildi — mening diff'im path-cheklangan.)

> **🟢🧹 2026-07-04c (TO'LIQ QAYTA IMPORT: baza tozalandi + MoySklad'dan katalog·kontragent·QOLDIQ — prod'da bajarildi, kod o'zgarishi yo'q)**
> User buyrug'i: «hammasini o'chir, qayta import qil». Bajarilgan runbook (hammasi jonli prod'da): **①** pg_dump →
> `/root/db-backups/pre-full-reimport-20260704-0455.dump` (⚠️ URL'dagi `?schema=` pg_dump'ni yiqitadi — `sed 's/?.*//'`).
> **②** yacheykalar eksporti (`/root/db-backups/export-locations.ts` → locations.json, 4477 yozuv). **③** `cleanup-db.ts`
> (14 sotuv·22 task·8954 stock·1554 CP·4482 tovar o'chdi; users/rollar/sozlamalar qoldi; Move/Loss/Inventory 0 edi —
> FK to'siq yo'q). **④** sync qayta: 59 papka + 4482 tovar + 1553 CP hammasi created (59s). **⑤** yacheykalar qaytarildi
> (restore-locations.ts: 4477/4477, missing 0). **⑥** skladlar qayta qurildi: eski 4 (Ombor 1/2·Иподром·Чуп База) DELETE,
> yangi 4: **Основной склад · Щит цех** (MS externalCode bilan) **· Иподром Склад · Чуп База Склад** (bo'sh); MS
> `report/stock/bystore` → 3092 pozitsiya «Оприходование» ×8 (org=MCHJ Demo, costMinor=buyPrice) POST+post — Щит цех'da
> musbat qoldiq 0 ekan. **⑦** verify: products 4482 · CP 1553 · enters 8 · «Panasonik ramka 4x» stock 59=MS 59.0 aniq,
> yacheyka 2-17-2-15 qaytgan, buy 2 015 000. Gotchalar: store mutatsiyalari **`/admin/stores`**da (GET /stores boshqa);
> products pagination **cursor** (offset emas); MS API gzip-majburiy (python'da gunzip); DELETE'ga Content-Type json
> qo'yma (bo'sh body 400). Skriptlar scratchpad + `/root/db-backups/`da. ⚠️ Omborchi SkladKeeper skladNo↔yangi sklad
> bog'lamalarini QAYTA TEKSHIRISH kerak (storeId emas, skladNo bo'yicha — ehtimol o'zgarish shart emas, lekin smoke yo'q).

> **🟢🔄 2026-07-04b (MOYSKLAD JONLI SYNC — `a4475e5` ✅ DEPLOYED + prod'da yugurtirildi: 1553 kontragent keldi)**
> User to'g'ri akkaunt tokenini berdi (org «Elektro sentr (Sherset)», context/employee bilan tasdiqlandi — avvalgi
> «climart santex» xatosi takrorlanmadi). **Yangi modul** `moysklad-sync`: `POST /moysklad-sync/run` (fon), `GET
> /moysklad-sync/status` (bosqich/progress/natija). remap/1.2: uom → papkalar → tovarlar(+narx-turlari) → kontragentlar;
> identity `externalCode='ms:<id>'` (fayl-import bilan bir xil → qayta yugurtirish YANGILAYDI, dublikat qilmaydi);
> narx 1:1 minor (seed-real ×100 klassiga test-lock); phone/name truncate. Token **VPS `apps/api/.env`da**
> (`MOYSKLAD_TOKEN`) — diqqat: root `/var/www/sherset/.env` YO'Q edi, deploy-doc'dagi symlink sxemasi realda boshqacha,
> API haqiqiy faylni `apps/api/.env`dan o'qiydi. **Jonli natija (91s):** folders 59 upd · products 4477 upd + 5 new
> (=4482, dublikat 0) · **counterparties 1553 created** (prod'da 0 edi) — spot-check: narxlar to'g'ri (Panasonik buy
> 20 150 → retail 23 700 / optom 22 600), telefonlar bilan. Gate: api tsc0 · biome0 · mapper vitest 4/4.
> **⏭️ SYNC KEYINGI:** (1) Settings'da «Sync» tugma + oxirgi natija UI; (2) cron (kechasi avtomat); (3) qoldiqlar
> (оприходование orqali) — user so'rasa. **TG:** infra tayyor (telegram moduli: config+outbox+webhook bor), lekin user
> «bot kerak emas» dedi — botsiz TG'da avto-xabar YO'Q (userbot=ban xavfi); bot yaratishga ko'ndirish yoki SMS(Eskiz).

> **🟢📊 2026-07-04 (OMBOR-OPERATSIYALARI DASHBOARD — `020ff1f` ✅ DEPLOYED + jonli tasdiqlangan)**
> «Muammolarni xal qil» davomi. User so'rovi: qabul→joylashtirish→otish zanjiri ma'lumotlarini dashboardda ko'rish.
> Zanjir o'zi tayyor edi (03-iyul), lekin raqamlar 4 alohida ro'yxatda yashardi. **Yangi:** API
> `GET /reports/warehouse-ops?dateFrom&dateTo` (`warehouse-ops.service.ts`, report-modul konvensiyasida:
> reportDateBounds + loadRateContext/consolidateToBase) — inbound (posted supplies count+sum, drafts) · putaway/picking
> (RestockTask type restock/picking: joriy backlog **davr filtrisiz** + done-in-window updatedAt bo'yicha) · outbound
> (posted demands) · per-omborchi jadval (backlog bo'yicha sort). **FE** `/reports/warehouse-ops`: sana filtrlari,
> 4 stat-tile (har biri o'z ish-ro'yxatiga link: /supplies · /restock-tasks · /omborchi · /demands), omborchilar jadvali;
> reports-landing'da karta; ru+uz i18n. **+mayda:** `fields.products` kaliti (labels/print qarzi) → i18n-key-existence
> testi yana yashil. Gate: api tsc0 · web tsc0 · biome0 · report-modul vitest 253/253 (+3 yangi) · sweep-testlarda
> yangi regress 0 (o'sha eski 9). **Jonli prod-verify:** endpoint real data qaytardi — oxirgi hafta picking done 22
> (Omborchi 1: 14, Omborchi 2: 8), backlog 0; sahifa 200. Diqqat: prod base-currency kodi `"860"` (ISO-raqamli UZS,
> real-import merosi) — displayAs:'none' bo'lgani uchun UI'da ko'rinmaydi, lekin bilib qo'yish kerak.
> **⏭️ QOLGAN:** (1) to'liq web Vitest'dagi ~48 pre-existing fail triage (label-grounding 25 · no-hardcoded 6 ·
> header-conventions · sum-filter va h.k. — 03b'da stash bilan toza HEAD'da tasdiqlangan); (2) desk/store'siz ochiq
> smena yopilish oqimi (03b'dagi null-row); (3) losses/labels'dagi 6 hardcoded literal.

> **🟢🛠️ 2026-07-03b (PROD HOTFIX: /retail/sessions null-crash — `8a10a6e` ✅ DEPLOYED 2026-07-04, jonli tasdiqlangan)**
> User prod console-xatoni tashladi: `Cannot read properties of null (reading 'name')` — chunk-hash probe orqali sahifa
> **`/retail/sessions`** ekani aniqlandi. Ildiz: `CashierSession.cashDesk`/`store` = **SetNull** relations
> (schema.prisma:7264-65) — prod'da kassa/sklad o'chirilgan → eski sessiyalarda `null`, lekin sessions/z-report/
> retail-sales LIST sahifalari ularni non-null deb typing qilib `.name`/`.currency`ni guard'siz render qilardi →
> butun jadval yiqilardi. Fix: 4 sahifada `?.name ?? '—'` / `?.currency ?? 'UZS'` (API'ning o'z fallback'iga mos);
> sessions/[id] · /sotuv · print sahifalar allaqachon guard'langan edi. `retail-z-report-money.test.ts` lock null-safe
> patternga yangilandi. Gate: web tsc0 · biome0 · lock 2/2. ⚠️ **To'liq web Vitest'da 54 PRE-EXISTING fail bor**
> (label-grounding 25 · i18n-key/no-hardcoded · header-conventions · sum-filter va h.k.) — stash bilan toza HEAD'da ham
> aynan shu faillar tasdiqlandi, mening diff'imga aloqasi yo'q, LEKIN bu regress-gate'ni ko'r qiladi — **keyingi sessiya
> triage qilsin**. **✅ DEPLOY 2026-07-04:** VPS parol xotirada ekan (`seed-real-moysklad-import.md`: root/`Namoz8808`,
> paramiko — 580s SSH-timeout uchun build `nohup`+log-poll bilan). pull→money build→build:web (BUILD_OK)→pm2 restart.
> Jonli tasdiq: yangi chunk `page-bbd260c5…`da guard bor (`null==(t=e.cashDesk)?void 0:t.name … "—"`), sahifa 200;
> API'dan aybdor qator ham topildi: session `4f9f7805…` (2026-07-03) — cashDesk HAM store HAM null (ikkalasi prod'da
> o'chirilgan). Endi '—' bilan chiqadi. (Ochiq savol: o'sha smena hali open bo'lsa, desk/store'siz qanday yopiladi — Phase-2'da ko'rilsin.)

> **🟢📥🗄️ 2026-07-03 (XARID→QABUL→JOYLASHTIRISH zanjiri yopildi + MULTI-BIN Phase 1 — hammasi DEPLOYED `bd0ca85`)**
> «Muammolarni xal qilaver» davomi (jonli production ishi). **(1) Supply→putaway (`634e3c5`):** Приёмка post bo'lganda har sklad bo'yicha «joylashtirish» RestockTask omborchiga avtomat yaratiladi + notification (refund→placement mirror; self-scoping — keeper yo'q bo'lsa hech narsa). `/restock-tasks`da ko'rinadi, QR-checklist bilan tasdiqlash. Prod-verified: keepers 2/2 (printerli), 4477/4477 mahsulotda loc bor. **(2) MULTI-BIN Phase 1a+1b (`7639050`+`0d8a9d9`):** bir tovar → BIR NECHTA yacheyka. Yangi `ProductLocation` jadvali (migratsiya `20260703120000`, prodga applied) · API GET/PUT `/products/:id/locations` (replace-all) · mahsulot edit'da «Qo'shimcha yacheykalar» kartasi (izolyatsiyalangan state+save) · picking-sheets `extraBins` qaytaradi → thermal print + agent-text + omborchi ekranida «yana: …». Prod E2E-verified (PUT 2 yacheyka → 200 → tozalandi). **Phase 1 = manzil-only** (per-cell miqdor YO'Q — Phase 2 Stock/FIFO'ga tegadi, user hali so'ramadi). **(3) Nav tozalash (`886abcd`):** Ombor sub-nav 13→11 (o'lik «Остатки» /stock-balance + dublikat «Склады» olindi; funksiya yo'qolmadi). **(4) Test relock (`bd0ca85`):** button-conventions'dagi 4 stale lock (DetailToolbar tertiary→secondary ataylab · CO/new shell rebuild · PO-list shared filter · /retail→/sotuv redirect) yangi holatga qulflandi, 95/95 green. **⚠️ DEPLOY GOTCHA:** VPS deploy skriptida `git fetch`siz `reset --hard origin/main` ESKI keshlangan ref'ga tushadi — doim fetch birinchi! **⏭️ NEXT:** multi-bin Phase 2 (per-cell miqdor) — faqat user so'rasa; Приёмка-chek printerga; parallel sessiya bilan sinxron (sklad-keeper uncommitted WIP bor edi).**

> **🟢📦🔧 2026-07-02 (REAL MoySklad katalog → PRODUCTION + migration-qarzi tasdiqlab yopildi + stale Prisma client tuzatildi — branch `chore/real-import-and-migration-cleanup`; push qilinmagan)**
> `davom et`/«muammolarni xal qil» (jonli production ishi, VPS root SSH). **(1) Real import:** birinchi berilgan MoySklad token (`03b29b…` = "climart santex") NOTO'G'RI account edi → to'g'ri account fayl-export sifatida berildi (`moysklad-export.zip`, faqat katalog: 4477 mahsulot · 59 papka · 64 uom, kontragent YO'Q). Yozildi `packages/db/prisma/import-ms-export.ts` (fayldan-import, MoySklad {meta,rows} shakli; narx 1:1 minor-units; narx-turi externalCode-YOKI-nom bo'yicha; uom=string, FK emas; papka href-id bo'yicha bog'lanadi). Oqim: pg_dump → cleanup-db → `delete price_types where external_code like 'ms:%'` → import. Data loyihaga ko'chirildi: `packages/db/prisma/data/moysklad-export/` (VPS'da). **Natija:** 4477/4477 mahsulot (0 skip), 1832 papkali; login 201, narxlar to'g'ri (Panasonik buy 35280→retail 41500>optom 39500). ⚠️ **Production'da 0 kontragent** (export'da yo'q edi; climart'niki o'chirildi). Xotira: `seed-real-moysklad-import.md`. **(2) `seed-real.ts` 5 bug-fix** (price ×100 overcount → 1:1; narx-turi collapse; MASTER_ONLY; phone/name VarChar-overflow truncate; fetch network-retry). **(3) Migration-qarzi TASDIQLAB YOPILDI:** eski repo-qarz («migrate deploy yetarli emas, db push kerak») aslida `fc1a936`+`20260702120000_sync_schema_to_prisma` da tuzatilган; men toza DB'ga 151 migratsiya deploy qilib `migrate diff` = «empty» → **drift 0, db push KERAK EMAS** (deploy memory tuzatildi). Adashgan `migrations/temp_smena.sql` o'chirildi. **(4) Stale Prisma client:** committed `packages/db/src/generated/*` schema'dan orqada edi (isForward/printerName/forwardMax yo'q) → `prisma generate` bilan sync qilindi, db tc0. Working tree endi TOZA. **⏭️ NEXT:** branch push qilinmagan (user push so'rasa); kontragentlar kerak bo'lsa to'g'ri-account token/export kerak; qolган Faza-2 QA + feature ishlari dev-stack talab qiladi.

> 📦 **Eski sessiya-entry'lar arxivlandi (2026-07-04 kontekst-slimlash, 2-tur):** 2026-06-10 … 2026-06-25
> oralig'idagi «Aniq keyingi vazifa» entry'lari VERBATIM `docs/audits/_ARCHIVE-NEXT-2026-07-04.md`ga ko'chirildi
> (~1170 qator). Hech narsa o'chirilmadi — faqat ko'chirildi. Qoida: bu bo'limda eng yangi ~8–10 entry qoladi,
> eskilari arxivga tushadi (birinchi arxiv: `_ARCHIVE-NEXT-2026-06-10.md`).
> (3-tur, 2026-07-07): 2026-06-26 ikkala entry ham o'sha faylga ko'chirildi; 06-08o dublikati va 06-10 fragmenti olib tashlandi (arxivda verbatim bor edi).

> 📦 **Eski sessiya-entry'lar arxivlandi (2026-06-10 kontekst-slimlash):** 2026-06-08n dan 2026-05-30 gacha BARCHA
> «Aniq keyingi vazifa» entry'lari VERBATIM `docs/audits/_ARCHIVE-NEXT-2026-06-10.md` §2 da (08n History-feed fix,
> 08m/08l History i18n, 08k POS-crash, 08j confirm-in-modal, 08d–08i optimistic-lock seriyasi, L4–L11 cohort'lar,
> backlog #20 DEFER qarori va h.k.). Hech narsa o'chirilmadi — faqat ko'chirildi. Qisqa indeks: `MEMORY.md` (har
> sessiya 1 qator) va `docs/audits/_PHASE2-*.audit.md` (har fix'ning rasmiy hujjati).

### 📊 Halol joriy holat — `pnpm progress` chiqishini ko'r

Live raqamlar `docs/progress.json` faylida. Avtomat hisoblanadi (qo'lda inflyatsiya yo'q).

Muzlatilgan snapshot (FROZEN — 2026-06-03i TARIXIY; «Joriy» EMAS). ⚠️ **Pastdagi sonlar 2026-06-03i holati — bugun ANCHA ilgarilagan; JONLI = `pnpm progress`/`docs/progress.json`:** detail **63/64 = 98%** · list-toolbar **18/56 = 32%** · Phase-2 **7/7 = 100%** · ui_conventions **7/7 locked**. (Eski «~20-25%» / «16/56» raqamlari quyida strike bilan belgilangan — 2026-06-11c session-start-audit tavsiyasi.)
- **List toolbar komponentlar (strukturaviy build, browser-QA EMAS)**: ~~16/56 = 29%~~ → **jonli 18/56 = 32%** (12 dedicated + 3 shared assortment + 1 inline)
- **Detail page audit**: ~~38/63 = 60%~~ → **jonli 63/64 = 98%** (customer-orders · demands · supplies · cash-in · moves · payments-in · **counterparties** · **products** · **projects** · **stores** · **uoms** — 2026-06-01; **cash-out** — 2026-06-02L sibling-parity vs cash-in + «Задачи» bug-class sweep 9 sahifa; **invoices-in** — 2026-06-02M sibling-parity vs invoices-out/supplies + «Создать документ» label bug-class sweep 6 sahifa; **sales-returns** + **purchase-returns** — 2026-06-03 sibling-parity vs demands/supplies (S1 positionsLabel fix ×2 + sales-return print 404 → print sahifa; customs REFUTED-correct; create-menu needs_capture); **invoices-out** — 2026-06-03b sibling-parity vs invoices-in (D1 paymentPlanned read-only→editable + D2 «Запросить оплату» guard + S3 «Главная» first-tab bug-class sweep 9 sahifa; productions DEFERRED — over-reach guard); **purchase-orders** — 2026-06-03c capture-grounded sibling-parity vs customer-orders (Валюта selector + «План. дата приёмки» label + received_sum/«Ожидание» fixes; F20 totals VAT bug-class fix 9 sahifa + print/email surfaces); **payments-out** — 2026-06-03d capture-grounded sibling-parity vs payments-in (F20 clone purchaseOrderId data-loss fix + doc-date moment bug-class 5 /new; org-account scope bug-class → Phase-2 QA); **processing-orders · processings · productions** — 2026-06-03d Cohort-A cohort-engine audit (P1 productions clone wiring + P2 child-qty 1000× display + PO1 processing-orders BOM /outputQty math — 3 bugs fixed); **enters · losses · inventories · internal-orders** — 2026-06-03e Cohort-B cohort-engine audit (enters/losses TOZA; inventories feature-gap defer; internal-orders 5 fix: IO-1 money-format + IO-2 externalCode editable + IO-5/6/7 uz-leak; ⚠️ 06-module capture contaminated 3/4 → sibling-parity); **production/boms · processes · stages · work-orders** — 2026-06-03f Cohort-C cohort-engine audit (`wf_9c1c1462-736`, 15 confirmed: W3 work-orders auditEntity `work_order`≠`WorkOrder` → empty-History HIGH fix; S1/S2 stages materialStore+performers UUID→name via BE include; B4 boms outputQty>0 guard+test; W1/W2 work-orders date-locale+description; P1 processes label-as-error; cohort uz-leak i18n; NO production capture → sibling-parity + intrinsic-critic; **work-orders/new docDate = BE feature-gap defer**, auditEntity class: tasks✅ opportunities→G); **prepayments · prepayment-returns · counterparty-adjustments** — 2026-06-03g Cohort-D money/returns (`wf_b388323a-101`; P1 retail-split `null`→400 wholesale-save-block HIGH; P2 prepayment-return refund-currency forced-to-source [over-refund hole]; P3 «остаток к возврату» net-of-prior; History-tab empty = BE audit-log feature defer); **retail/sales · retail/sessions** — 2026-06-03h Cohort-E retail (`wf_30430cdc-058`; RS1 ~27 hardcoded Latin-uz→i18n HIGH; RS2 drawer «Комментарий» feature-gap; RS3 Money.fromMajor; RS4 till-currency); **bundles · services · variants · tracking-codes** — 2026-06-03i Cohort-F catalog-items (`wf_6efce153-ac6`, 19 confirmed: 🔴 products/[id] `api.put`→`api.patch` PATCH-only-route 404 [GT find]; bundles/services `auditEntity`→`Product` empty-History; variants buy-price label `created`→`buy_price_label` («Закупочная цена»); Latin-uz leaks 6 pages; bundles validation guards; shared `useDestructiveMutation` i18n ~60 callers; variants History = BE audit-write defer));
  denominator: filesystem'dagi real `*/[id]/page.tsx` = **63** (2026-06-01 tuzatildi: eski 62 progress-report.ts depth=3 bug'i sabab `analitika/sozlamalar/rollar/[id]` ni o'tkazib yuborardi; 3 sub-route — hr permissions/salary + webhooks deliveries — ataylab denominatorga kirmaydi, ular ota-entity audit'i ichida). **Barcha seed-bor hujjat modullari TUGADI** (6/6) + **2 katalog detail (counterparties + products) TUGADI**;
  keyingi vazifa = top «Aniq keyingi vazifa» entry (document-form i18n conveyor + #15/#16 cleanup TUGADI; keyingi variantlar:
  Q2 detail davomi / qolgan i18n cleanup / list-nav audit). _(Q2 detail uchun: qolgan katalog detail — product-folders/[id],
  contracts/[id], settings/* — yoki bo'sh hujjat detail'lariga moysklad'da seed yaratish; ko'p modul demo-bo'sh/route-walled.)_
  - ✅ **`--detail` capture endi ISHLAYDI + robust** (eski 03-module buzuqlik tuzatildi): demands + supplies + moves
    toza re-captured (`docs/moysklad-reference/<module>/detail/`). 4 selector/state bug tuzatildi: edit-link
    anchor · GWT-menu closePopups · open-timing · new-design modal («Старый дизайн»). Boshqa modullarga ham ishlaydi.
- **Systemic PositionEditor i18n sweep**: ✅ **13/13 detail sahifa** (2026-06-01) — Uzbek-leak bug-class
  butun hujjat suite'ida yopildi (audit ≠ sweep; bu shared-komponent tuzatishi, audit sonini oshirmaydi)
- **Modal audit**: per-modal **~8 modul tekshirildi (8 toza)** + 3 shared-leak fix (`eb82668e` ConfirmDialog+Modal · `70d01ce0` CatalogPicker · `fa4973af` send-email/HR validation); to'liq 100+ modaldan kichik ulush, lekin 0% EMAS (2026-06-02 per-modal pass). **DOMINANT topilma**: hujjat-forma i18n (`docs/audits/modals-i18n-audit.md` §C)
- **Navigation graph**: 0% ⚠️
- **Mass-edit endpoints**: 23 (smoke 13/13 pass green, 10 skip = seed bo'sh)
- **Captured moysklad**: 22 modul (20 real list + 2 splash-only capture: contact-persons, variants)

**Maqsadga nisbatan (2026-06-03i FROZEN): ~~~20-25%~~** — ⚠️ **ESKIRGAN, JONLI holatni AKS ETTIRMAYDI** (bugun: Phase-2 7/7=100% · 7/7 UI-konvensiya locked · detail 63/64=98%). Joriy progress doimo = `pnpm progress`.

> **Yangilash:** `pnpm progress` ishga tushiring — `docs/progress.json` qayta yaratiladi.


## 🛡️ Sifat qoidalari (CLAUDE.md'dan kelib chiqqan, MAJBURIY)

- **Husky'ni hech qachon skip qilmaslik** (`--no-verify` taqiqlangan)
- **Darvozalar — qaysi bosqichda enforce qilinadi (HALOL, 2026-06-10 wrap'da aniqlashtirildi):**
  - **pre-commit** (Husky): `lint-staged` (biome staged-fayllar) + `progress.json` regen. *(typecheck/test EMAS — per-commit tezlik uchun ataylab.)*
  - **pre-push** (Husky): `turbo run typecheck` **BLOKLAYDI** (2026-06-10'dan; turbo-cached → o'zgarmaganida ~darhol) + list/detail drift-detector (warning).
  - **commit-msg** (Husky): commitlint (Conventional Commits) + honesty-gate («tugadi/verified» da dalil talab).
  - **Har sessiya/faza yakunida QO'LDA (men ishlataman, commit oldidan):** typecheck + biome + Vitest (web+api+ds) yashil. Bu hook EMAS — intizom (global `~/.claude/CLAUDE.md` sifat qoidasi). Test suite pre-push'da YO'Q (juda sekin) — qo'lda enforce qilinadi.
- **"Tugadi" deyish faqat**: 4-faza yashil + side-by-side reference
- Git identity: `GIT_AUTHOR_NAME="Ozodbek" GIT_AUTHOR_EMAIL="ozodbekmirgasimov@gmail.com"` env via inline (no global config)
- Commit subject lowercase (Conventional Commits)

---

## 🔑 Kerakli ma'lumotlar

**Moysklad creds** (`.env.local`'da):
- `MOYSKLAD_URL=https://online.moysklad.uz`
- `MOYSKLAD_EMAIL=admin@ozodbekmirgasimov1`
- `MOYSKLAD_PASSWORD=***`
- Auth saved: `.auth/moysklad.json` (gitignored)

**Dev creds**:
- admin@demo.local / admin123

**Portlar**: PG :5433, API :4000, **Web dev :3100** (`next dev -p 3100`; :3000 faqat production `next start`)

---

## 🧠 Memory papkasi — sessiyalararo eslab qolish

`C:\Users\user\.claude\projects\d--projects-moysklad\memory\`

Auto-loaded:
- `MEMORY.md` — index, har sessiya boshida ko'rsatiladi
- `session-*.md` — har sessiya yakunida yozaman, keyingi sessiya'da o'qiyman
- `feedback-*.md` — sizning afzalliklaringiz
- `project-state.md` — umumiy snapshot

---

## ❓ Foydalanuvchi nima qila olishi mumkin

| Holatda | Aytish |
|---|---|
| Hech qaerdan boshlamasdan davom etish | `davom et` |
| Boshqa yo'nalishga o'tish | `[mavzu] qil` (mas: "browser audit qil") |
| To'xtab plan ko'rib chiqish | `plan` yoki `qanday holatdamiz` |
| Audit progressini ko'rish | `audit holati` |
| Boshqa narsa qilish | Erkin so'rash |

---

> **Eslatma**: Bu fayl har sessiya yakunida Claude tomonidan yangilanadi.
> Foydalanuvchi shu fayl mavjudligini bilishi kerak, lekin ichini o'qishi shart emas.

---

---

> 📦 **Arxiv:** 2026-05-30 davri (Sessiya 1–10, yondashuv, timeline, eski backlog, muzlatilgan snapshot) →
> `docs/audits/_ARCHIVE-NEXT-2026-06-10.md` §3 · Drift-fix sessiyasi (2026-05-31) → §4.
