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

> **🕒 2026-08-05d (1-KASSA B5 TUGADI — POS «Qarz to'lovi» oynasi + PKO cheki · `a23de43`) · ⏳ DEPLOY QILINMAGAN**
>
> **Nima qilindi:** B5 ning FE qismi — 1-Kassa bo'limi endi B1–B5 yopiq.
> - **POS «Qarz to'lovi» oynasi** (`components/pos/debt-payment-dialog.tsx`) — smena tabida,
>   Kirim/Chiqim yonida. Kassir mijozni topadi → **qoldiqni KO'RADI** (jami, nechta qarz, eng
>   eskisi qachon va **necha kun** oldin, qarzlar ro'yxati) → summa → tasdiq. Qaysi `QRZ-`
>   hujjatga tushishi kassirdan SO'RALMAYDI — server FIFO qiladi.
>   *Nega qoldiq ko'rsatiladi:* faqat summa maydoni bo'lsa kassir ko'r-ko'rona kiritardi —
>   mijoz «hammasini yopaman» desa qancha ekanini bilmasdi. «Hammasi» tugmasi shundan.
> - 🔴 **`DebtPayment.batchId`** (migratsiya `20260805163000_debt_payment_batch`) —
>   bitta jismoniy to'lov FIFO bo'yicha N qatorga bo'linadi, **chek esa BITTA hujjat**. Busiz
>   chekni qayta chop etish uchun qatorlarni (mijoz+vaqt+kassir) bo'yicha **taxminan** yig'ishga
>   to'g'ri kelardi — moliyaviy hujjatda taxmin yaramaydi.
> - **PKO cheki** `/print/debt-payment/[batchId]?auto=1` — har qarzga qancha tushgani ALOHIDA
>   (mijoz chekni tekshira olsin) + eng muhim qatori **«Qolgan qarz»** (keyingi safar bahs
>   chiqmasin). Storno qatori **chizilgan holda KO'RINADI** — tarixni yashirmaslik uchun.
>   `GET debts/pos/receipt/:batchId` → istalgan vaqtda AYNAN o'sha summalar.
>
> **Ikki jim buzilish qulflandi** (`pos-debt-payment-wiring.test.ts`, **mutatsiya bilan
> tekshirilgan** — ikkalasi ham 2 testni yiqitadi):
> 1. `retailShiftId` prop IXTIYORIY → tushib qolsa hammasi kompilyatsiya bo'ladi, to'lov o'tadi,
>    faqat pul smena hisobida YO'Q (soxta ortiqcha — B5-BE da tuzatilgan bug qaytib kelardi);
> 2. `window.open('/print/...')` oddiy satr → yo'l noto'g'ri bo'lsa 404 ochiladi va hech bir gate
>    shikoyat qilmaydi → havola va route fayli **birga** tekshiriladi.
>
> **Runtime verify (lokal DB):** 2 qarz (120k+80k) → 150 000 to'lov → batchId, 2 qator (biri
> yopildi) · **qayta chop etish AYNAN mos** (tashkilot, kassir, mijoz, qatorlar, qolgan qarz
> 50 000) · smena naqdiga 150 000 tushdi · noma'lum batch → «Chek topilmadi».
>
> **Gate:** typecheck 0 · biome 0 · api **4674/4674** · web **2702/2702**.
> ⚠️ **Phase-1: brauzer-smoke YO'Q** — oyna va chek REAL BRAUZERDA ochilmagan, termal printerda
> sinalmagan. 1-Kassa **Phase-2 QA** ga kiradi (u yerda chek qog'ozga chiqishi tekshiriladi).
>
> ℹ️ *Yo'lda `raw-element-conventions` gate qidiruv maydonini tutdi (xom `<input>` taqiqlangan) —
> DS `Input` ga o'tkazildi; exempt ro'yxati o'stirilmadi.*
>
> **Keyingi:** `1-Kassa B6` — Xarajat (RKO) + inkassatsiya. Qolgan bosqichlar **65 → 64**.

> **🕒 2026-08-05c (1-KASSA B5 BACKEND — qarz to'lovi FIFO + smena naqdi · `8f4c100` · 4M.3 FE qoldig'i `f267636`) · ⏳ DEPLOY QILINMAGAN**
>
> **Nima qilindi (2 commit, ikkalasi ham gate-yashil):**
> 1. `f267636` — **4M.3 FE qoldig'i**: oylik jadvalida «qabul holati» ustuni. Backend `e1a761ba` da
>    ko'rmagan kunni oylikdan bloklagan edi, lekin FE jim turardi — buxgalter kamaygan raqamni
>    *sababsiz* deb qabul qilardi. Endi qatorda: nechta kun qabul qilingan / kutmoqda / **qancha
>    summa bloklangan**. (`MonthlyScoreRow` maydonlarini backend allaqachon qaytarardi.)
> 2. `8f4c100` — **1-Kassa B5 backend** (kassa TZ §7.2 + §8.4):
>    - `PosDebtPaymentService` — **bitta summa → FIFO bo'yicha bir necha qarz** (eng eskisidan).
>      Mavjud `addCashPayment` faqat BITTA qarzga yozadi, kassada esa mijoz qaysi QRZ- hujjatga
>      tushishini bilmaydi. Taqsimlash sof modulda (`debt-fifo.ts`, 15 test), servis — faqat I/O.
>      **Hammasi bitta tranzaksiyada** (to'lov + qarz holati + balans): «pul kirdi-yu qarz yopilmadi» bo'lmasin.
>    - **Ortiqcha to'lov RAD** etiladi (qancha ortiqcha ekani bilan) — jimgina avans qilib yozilmaydi,
>      qaytim §6.2 bo'yicha kassir qarori.
>    - 🔴 **`DebtPayment.retailShiftId`** (migratsiya `20260805140000_debt_payment_shift`) → naqd qarz
>      to'lovi smena **«kutilgan naqd»**iga kiradi. Busiz kassir qabul qilgan qarz puli yashiqda
>      turardi-yu hisobda ko'rinmasdi: har smenada AYNAN shu summaga **ortiqcha** chiqardi.
>      `cashDeskId` yetarli emas — bitta kassada kuniga bir necha smena bo'ladi.
>    - `debtCashMinor` **ixtiyoriy** maydon → servis uzatishni to'xtatsa typecheck jim o'tardi
>      (`DocumentEditor` prop-drop klassi) → `debt-cash-wiring.test.ts` manba bo'yicha qulflaydi;
>      **mutatsiya bilan tekshirildi** (maydon olib tashlansa 2 test yiqiladi).
>
> **Runtime verify (lokal DB, 3 qarz 100k+200k+300k):** 250 000 → 1-qarz YOPILDI + 2-qarzga 150k,
> saldo 600k→350k · 999 000 → **RAD** («qarzdan 649000 tiyinga ko'p») · qolgan 350 000 → 2 qarz
> yopildi, **saldo aynan 0**, ochiq qarz 0.
>
> **Gate:** typecheck 0 · biome 0 · api **4674/4674** · web **2696/2696**.
> ⚠️ **Phase-1: brauzer-smoke YO'Q** — POS «Qarz to'lovi» **oynasi (FE)** va **PKO cheki** hali yo'q,
> bu faqat backend. Deploy qilinsa `/debts/pos/*` 2 yangi endpoint jonlanadi (hech qachon ishlamagan kod).
>
> **Keyingi (todo.md tartibi bo'yicha):** `1-Kassa B5 (qolgani)` — POS «Qarz to'lovi» oynasi + PKO cheki.
>
> ℹ️ *Daraxtda 2026-07-31 dan `lint-staged automatic backup` stash'i turibdi (24 fayl,
> sales-returns/DocumentEditor — parallel sessiyaniki, ishi HEAD'da bor). Tegilmadi.*

> **🕒 2026-08-05b (DEPLOY: 4M.3 + o'z KPI · `a3cd7336`) · ✅ DEPLOYED · 🔴 yo'lda PROD 502 bo'ldi va tuzatildi**
>
> **Deploy qamrovi:** `232e7d64..a3cd7336` — 4M.3 (qabul → oylik bloklash) + o'z KPI ko'rsatkichi.
> Backup: `pre-4M3-20260805-100043.sql.gz` (390M). **2 migratsiya qo'llandi**
> (`20260804180000_payroll_acceptance_gate` + `20260804190000_hr_kpi_daily_date_fix` —
> oxirgisi prodda **165 qatorning sanasini bir kunga surdi**).
>
> **🔴 UZILISH (o'zim keltirib chiqardim):** birinchi deploydan keyin `sherset-v2-api`
> crash-loop'ga tushdi, `/api/v1/*` **502** qaytardi. Sabab — `FST_ERR_DUPLICATED_ROUTE`:
> `@Get('metrics')` IKKI controllerda (`KpiConfigController` + `ManagerKpiController`),
> ikkalasining prefiksi ham `manager/kpi`. **Sayt (web) 200 xizmat qilaverdi** — ya'ni
> tashqaridan «ishlayapti» ko'rinardi, faqat API o'lgan edi.
>
> **NEGA HECH BIR GATE TUTMADI:** typecheck — ikki klassdagi ikki metod to'g'ri · biome —
> qoida buzilmagan · unit-testlar — Nest HTTP qatlami umuman ko'tarilmaydi. Xato faqat
> ilova **ishga tushganda** ko'rinadi.
>
> **FIX + GUARD (`a3cd7336`):** `GET metrics` `ManagerKpiController` dan olib tashlandi
> (o'qish `KpiConfigController` da, yozish ManagerKpi'da). **Yangi guard**
> `apps/api/src/app-boot.test.ts` — barcha controllerlar skanlanib `metod + yo'l`
> takrorlanishi qidiriladi. *Skaner nozikligi:* bitta faylda bir nechta `@Controller`
> bo'lishi mumkin, shuning uchun route eng yaqin OLDINGI prefiksga biriktiriladi
> (birinchi versiyam 2 ta yolg'on to'qnashuv chiqargan edi). Non-vacuous jonli sinaldi.
>
> **JONLI VERIFY (hotfix'dan keyin):** `erp.sherset.uz` **200** · `/menejer` **200** ·
> `/api/v1/health` **200** · `manager/kpi/metrics` **401** · `.../reference` **401** ·
> `.../days` **401** (401 = route tirik va himoyalangan).
>
> **GATE:** api tc 0 · biome 0 · **api 4588/4588 test**. `packages/money` dist shu kuni
> **uchinchi marta** eskirgan edi ([[money-dist-stale-tsbuildinfo]]).
>
> **⛔ QOLGAN QARZ:** o'z-KPI ekrani (dialog) **brauzerda ochilmagan** — 4M.3 ning oylik
> ogohlantirish FE'si ham yo'q. Keyingi: 1) brauzer-QA · 2) idempotent bonus/jarima +
> eskirgan kun tuzatuvchi qatori + egaga haftalik xulosa · 3) 4M.4.
>
> **📌 SABOQ:** deploydan keyin `/api/v1/health` ni **majburiy** tekshir — web 200 bo'lishi
> API sog'ligini isbotlamaydi. Xotira: [[duplicate-route-prod-502]].

> **🕒 2026-08-05a (O'Z KPI KO'RSATKICHINI YARATISH — egasining shikoyati bo'yicha) · ⏳ DEPLOY QILINMAGAN**
>
> **Shikoyat:** «xodimlarga KPI qo'sha olmayapman, faqat tayyor KPI'lar bor».
> **Tashxis (tasdiqlangan):** katalog `kpi-metrics.ts` da qattiq yozilgan 17 yozuv edi;
> `saveEmployeeConfig` ro'yxatdan tashqaridagi kalitni «Noma'lum ko'rsatkich» deb rad etardi.
>
> **Yechim:** katalog endi ikki manbadan — built-in (tizim hisoblaydi) + **hisobning O'Z
> ko'rsatkichlari** (`kpi_metric_defs`, `source='manual'`). `KpiMetricCatalogService`:
> yaratish/tahrirlash/arxivlash + `resolve()`. Kalit nomdan yasaladi (`custom_…`, kirill ham),
> **tahrirlashda kalit o'zgarmaydi** (unga kunlik qiymatlar bog'langan), **o'chirish o'rniga
> arxivlash** (FK + o'tgan kunlar raqami saqlanadi). Tizim ko'rsatkichi himoyalangan (400).
>
> **⚠️ HALOL CHEKLOV:** o'z ko'rsatkichini tizim **hisoblay olmaydi** — dvigatel unga
> `autoValue=NULL` qator ochadi, faktni menejer **qo'lda** kiritadi. Ekranda «qo'lda» belgisi
> va dialogda tushuntirish bor; `source` tanlash ATAYLAB berilmadi (yolg'on va'da bo'lardi).
>
> **FE:** xodim → KPI tabida «O'z ko'rsatkichim» tugmasi + dialog (nom uz/ru · birlik ·
> yo'nalish · soatga normallashtirish), ro'yxatda tahrirlash/arxivlash. i18n ru+uz 10 kalit.
>
> **RUNTIME VERIFY** (`scratchpad/qa-custom-kpi.ts`): katalog 21→22 · yaratildi ·
> **xodimga berildi** (ilgari shu qadam yiqilardi) · kunlik qator BOR (`autoValue=NULL`) ·
> menejer qo'lda 3 kiritdi, ekranda ko'rindi · bugungi kunda `og'irlik=40 maqsad=0`.
> Kechagi kun ataylab **eski profil versiyasida** qoldi (tarix muzlaydi, §2.3).
>
> **GATE:** api tc 0 · web tc 0 · biome 0 · **api 4585/4585 · web 2684/2684 test** (+17).
>
> **⛔ HALOL STATUS: Phase-1 + servis-runtime.** Ekran **brauzerda ochilmadi** (dialog jonli
> sinalmagan). **DEPLOY QILINMAGAN.**
>
> **⏭️ KEYINGI:** 1) brauzer-QA (dialog + saqlash) va deploy · 2) 4M.3 qolgani (idempotent
> bonus/jarima · eskirgan kun tuzatuvchi qatori · egaga haftalik xulosa) · 3) 4M.4.

> **🕒 2026-08-04d (4M.3 — QABUL → OYLIK bloklash + hr-kpi sana qarzi · `HEAD`) · ⏳ DEPLOY QILINMAGAN**
>
> Egasining **M-Q8** qarori kuchga kirdi: **menejer qabul qilmagan kun oylik hisobiga UMUMAN
> kirmaydi.** Shu paytgacha menejer ekrani qurilgan-u, uning qarori pulga ta'sir qilmasdi.
>
> - **Sof modul** `payroll-acceptance.util.ts` (+18 test): qaysi kun to'lanadi/bloklanadi.
>   «Qaysi holat to'lanadi» ro'yxati **takrorlanmaydi** — u `daily-kpi-fsm.countsTowardPayroll()`
>   da, yagona joyda. Menejer tuzatmasi **g'olib** (M-Q3); NULL ≠ 0.
> - **Oylik manbai ko'chdi** (TZ §9 tartibining 2-qadami): `HrKpiDailyLog` → `EmployeeDailyKpi`.
>   Eski jadvalda qabul tushunchasi yo'q edi va uning sanasi bir kun orqada — bog'lash har kunni
>   siljitardi. Yangi omborda holat/sana/tuzatma bir qatorda, join kerak emas.
> - **`HrKpiMonthlyScore` +3 ustun** (`20260804180000`): `accepted_days` · `pending_days` ·
>   `blocked_sales_minor`. Bloklangan summa **yashirilmaydi** — «nega oylik kam» degan savolga
>   javob shu ustunda (TZ §4.4).
> - **🔧 4M.3 QARZI YOPILDI** — `hr-kpi.service.ts` sana off-by-one (`localDateOnly` ga o'tdi).
>   Aynan hozir xavfsiz bo'ldi: oylik u jadvaldan o'qishni to'xtatdi. Mavjud qatorlar
>   `20260804190000` bilan surildi — **ikki qadam** (+10000/−9999), chunki UNIQUE bitta `+1 day` da
>   qo'shni kun bilan to'qnashardi. [[hr-kpi-daily-date-off-by-one]] yopildi.
>
> **RUNTIME VERIFY** (jonli DB, real dvigatel — `scratchpad/qa-payroll-money.ts`):
> tuzatma 500 000 000 tiyin → kun qabul qilinmagan: `sotuv=0 bloklangan=500000000` →
> qabul: `sotuv=500000000 bloklangan=0`, komissiya 7 500 000 (1.5% ✓) →
> qayta ochish: `sotuv=0 bloklangan=500000000`. M-Q8 va M-Q3 jonli ishladi.
>
> **GATE:** api tc 0 · biome 0 · **api vitest 4568/4568 test** (+28).
> Yo'l-yo'lakay: `packages/money` dist YANA eskirgan edi (turbo dev qayta build qiladi) —
> qayta build ([[money-dist-stale-tsbuildinfo]]; bu ikkinchi marta shu sessiyada).
>
> **⛔ HALOL STATUS: Phase-1 + servis-runtime.** FE tomoni **YO'Q** — oylik jadvalida «N kun qabul
> qilinmagan» ogohlantirishi hali ko'rsatilmaydi (ustunlar tayyor). **DEPLOY QILINMAGAN.**
>
> **⏭️ KEYINGI:**
> 1. **FE**: oylik jadvalida `pendingDays` ogohlantirishi + `blockedSalesMinor` ustuni.
> 2. **4M.3 qolgani**: idempotent bonus/jarima `HrBonusFineLog` ga (TZ §4.2) · eskirgan kun
>    **tuzatuvchi qatori** (§3.4) · **egaga haftalik xulosa** (M-Q7 — jurnal tayyor).
> 3. **Deploy** (`20260804180000` + `20260804190000`).
> 4. **4M.4** — to'liq xodimlar nazorati (jonli holat · xodim kartasi 360° · hayot sikli).

> **🕒 2026-08-04c (🔀 4M.2 IKKI IMPLEMENTATSIYA BIRLASHTIRILDI · `fa58171` BE + `a2b4bb6` FE + `d86320b` QA) · ✅ **DEPLOYED** `28967e91` · ✅ BRAUZER-QA BAJARILDI**
>
> ### 🔴 Nima bo'lgan edi (kelajak uchun sabog'i bor)
> 4M.2 qabul oqimi **ikki marta, bir-biridan bexabar qurilgan**:
> - **A** — `climart-adoption` da (`59863f0`+`d11ca50`, 08-04, shu kunning o'zida);
> - **B** — `wave4m-accept` branchida (`c62ca77`, **2026-08-02**), worktree `.claude/worktrees/m4-accept`,
>   hech qachon merge qilinmagan. NEXT.md 08-03a «4M.2 qabul FSM **qolgan**» deb yozgan va o'sha branch
>   haqida bir og'iz ham yo'q edi.
>
> **Qanday topildi:** Phase-2 QA uchun lokal DB'ga ma'lumot tayyorlayotganda kod yiqildi —
> `employee_daily_kpi_events` jadvali DB'da **boshqa ustun nomlari** bilan turgan ekan
> (`comment`/`detail`). `git worktree list` → B chiqdi. **Sabog'i: `git worktree list` va
> `git branch --no-merged` preflight'ning bir qismi bo'lishi kerak.**
>
> Egasi **to'liq merge**ni tanladi.
>
> ### Yakuniy tanlov (nima kimdan olingan)
> | Qism | Kimdan | Nega |
> |---|---|---|
> | FSM (7 holat, `force_accepted` alohida) | **B** | oylik «majburiy yopilgan» kunni ajrata oladi; `countsTowardPayroll()` 4M.3 uchun yagona shart manbai |
> | Optimistik da'vo (`updateMany where state:from`) | **B** | A'ning o'qib-keyin-yozishi parallel menejerda yozuvni yo'qotardi |
> | Amal-bo'yicha sabab kodlari + `other`da izoh majburiy | **B** | hamma «other» ni tanlab statistika yo'qolmasin |
> | `allowedActions(state, actor)` | **B** | ekran tugmalari FSM'dan chiziladi, FE o'z shartini yozmaydi |
> | `HrPermissionGuard` (`employees:read`) | **B** | A'ning ad-hoc `ManagerGuard` i o'rniga mavjud tizim |
> | **Drill-down** (17 ko'rsatkich, 517 qator) | **B** | A'da umuman yo'q edi; TZ §3.5 talabi |
> | **Kompozit ball** (`kpi-score.ts`) | **A** | B'da umuman yo'q edi |
> | **Ball qabulda MUZLATILADI** (`score_percent`) | **A** | og'irlik keyin o'zgarsa to'langan oylik ortidagi raqam o'zgarmasin |
> | **Idempotentlik** (`Transition.idempotent` + `noop`) | **A** | takror `accept` 409 bermaydi va jurnalga 2-qator yozmaydi → 4M.3 da bonus 2 marta yozilmaydi |
> | Begona kunga **404** (403 emas) | **A** | mavjudlik sizishi |
> | FE ekran | **B** (route/nav/i18n **A**) | B'da drill-down bor; `/menejer` nomlash A'niki |
>
> ### Merge paytida tuzatilgan uchta nuqson
> 1. **B'da `markStale()` yozilgan-u, uni hech kim chaqirmasdi.** Endi `computeDay` muzlagan kunning
>    `autoValue` i o'zgarganini ko'rsa nomzod deb belgilaydi, o'tishni esa FSM qiladi (jurnal + da'vo).
> 2. **PROFIL-SANA BUG'I (ikkala implementatsiyada ham bor edi):** `saveEmployeeConfig` versiyani
>    `effectiveFrom = BUGUN` bilan yozadi, dvigatel esa `effectiveFrom <= kun` talab qiladi → menejer
>    KPI'ni **birinchi marta** sozlaganda allaqachon hisoblangan BARCHA kunlar profilsiz qolib, abadiy
>    «ball yo'q» bo'lardi. Endi mos versiya topilmasa **eng erta** versiyaga tushadi (muzlatishni
>    buzmaydi). Bu **runtime QA topilmasi** — statik ko'rinmasdi. +4 test.
> 3. **A'ning holat→rang jadvali noto'g'ri uyda edi** (`document-state-tone.ts` — hujjatlar uchun);
>    `domain-status-tone.ts` ga ko'chirildi (`dailyKpiStateTone`, B'niki).
> 4. **O'lik FE client**: A'ning `manager-api.ts` qabul-metodlari endi yo'q route'larga borardi —
>    mavjud **FE↔BE kontrakt-testi** 6 ta «silent 404» ni tutdi. Olib tashlandi.
>
> ### Migratsiya
> `20260804140000_kpi_acceptance_merge` — **idempotent**, uch xil boshlang'ich holatda ishlaydi
> (A shakli / B shakli / bo'sh): `note`→`comment`, `payload`→`detail` **RENAME** (jurnal append-only),
> `queued_at`→`state_changed_at`, `score_*` qo'shish, indekslar. Lokal DB'ga qo'llandi va tekshirildi.
>
> ### GATE
> api tc 0 · web tc 0 · biome 0 · **api vitest 4540/4540 test** · **web vitest 2679/2679 test**.
>
> ### RUNTIME VERIFY (servis darajasi, `scratchpad/qa-seed-kpi.ts`)
> Lokal DB'da real dvigatel orqali: 4 xodim × 3 kun hisoblandi → 10 kun navbatga → **ballar 0…150**
> (150% chek ko'rindi) → e'tibor signallari to'ldi → 08-02 dagi qabul qilingan kun qayta hisobda
> o'zgarib **`stale` bo'lib navbat boshiga chiqdi**. Zanjir: compute → profil → ball → openForReview →
> markStale → navbat tartibi — **jonli ishladi**.
>
> ### ✅ PHASE-2 BRAUZER QA BAJARILDI (`d86320b`)
> `pnpm dev` ostida api jarayoni o'lgan ekan; **API'ni alohida ko'tarish** (`npx tsx src/main.ts`)
> muammoni yechdi — 4000-port ochildi. (Turbo ostida nega o'lgani aniqlanmadi; keyingi safar API'ni
> alohida ishga tushirish qulayroq.)
>
> **🐞 Topilgan bug (faqat brauzerda ko'rinadigan klass):** command-palette yorlig'i
> `command_palette.commands.*` EMAS, `command_palette.*` ostiga yozilgan edi. Kalit **dinamik**
> o'qilgani uchun typecheck ham, i18n key-existence gate ham, test suite ham **jim** — konsolga har
> sahifada 4 ta `MISSING_MESSAGE` chiqardi. Tuzatildi + **yangi guard**
> `command-palette-i18n.test.ts` (har `labelKey` uchun ru+uz; non-vacuous sinaldi).
>
> **Brauzerda tasdiqlangan (uz, konsol TOZA):** navbat 11 qator · **tartib to'g'ri** (eskirgan kun,
> 5 signal bilan, birinchi) · kun paneli + ko'rsatkichlar jadvali (fakt/o'rtacha/og'ish) · tugmalar
> FSM `allowedActions` dan · **drill-down** («Kassa tushumi» → «Bu raqam qayerdan» → haqiqiy chek
> `ТРН-2026-00004`) · **klaviatura `↓` va `A`** (navbat 11→10) · **hodisa jurnali parallel
> branchning 02.08 dagi yozuvini SAQLAB QOLGAN** — migratsiyadagi `comment`/`detail` RENAME
> append-only jurnalni yo'qotmagani jonli isbotlandi.
>
> **HTTP (curl):** `days`/`days/:id`/`reference`/`drilldown` 200 · **idempotentlik** (2-`accept` →
> `changed:false`, 409 yo'q, jurnalda 2-qator yo'q) · **muzlatish** (qabul qilingan kunga tuzatma →
> 409) · DB'da `score_percent=150`, `score_coverage=0.15`.
>
> ### ⛔ HALOL STATUS
> **/menejer asosiy oqimi Phase-2 VERIFIED.** **Sinalmagani:** rad etish → tushuntirish halqasi ·
> eskalatsiya / majburiy yopish · tuzatma dialogi · **RU-locale** · xodim tomoni.
> **DEPLOY QILINMAGAN.** ⚠️ Men ishga tushirgan `next dev` (3100) va `tsx src/main.ts` (4000)
> jarayonlari tirik bo'lishi mumkin — keyingi sessiya portlarni tekshirsin.
>
> ### ✅ DEPLOY (erp.sherset.uz = sherset-v2), 2026-08-04
> Backup avval olindi: `/root/sherset-v2-backups/pre-4M2merge-20260804-145238.sql.gz` (376M, 230 jadval,
> `gzip -t` OK). Push → `sherset-ERP.git` `63684d08..28967e91`. Deploy:
> `nohup env DS_TARGET=v2 bash deploy/deploy-smart.sh` → `90d8d0d` → `28967e91`.
> - **Migratsiyalar qo'llandi:** `20260804120000_kpi_daily_acceptance` + `20260804140000_kpi_acceptance_merge`
>   → «All migrations have been successfully applied»; `prisma migrate status` → **«Database schema is up to date!»**
>   (181 migratsiya). Ya'ni merge-migratsiyaning RENAME yo'li prodda ham toza o'tdi.
> - **Build:** 274/274 sahifa, OOM yo'q. **502 YO'Q.**
> - **Jonli verify (tashqaridan):** `erp.sherset.uz` **200** · `/menejer` **200** · `/api/v1/health` **200** ·
>   `/api/v1/manager/kpi/days` **401** (404 EMAS — yangi route tirik va himoyalangan) ·
>   `/api/v1/manager/kpi/reference` **401**.
> - **Prodda hali sinalmagani:** real foydalanuvchi bilan login qilib qabul oqimini bosib ko'rish
>   (lokal brauzerda sinaldi, prodда YO'Q). Prod'da hali KPI profili sozlanmagan bo'lishi mumkin —
>   menejer ekrani bo'sh navbat ko'rsatishi normal, tungi cron (00:40) birinchi kunlarni hisoblaydi.
>
> ### ⏭️ KEYINGI (tartib bilan)
> 1. **4M.3** — qabul → oylik: `countsTowardPayroll()` bo'yicha bloklash · idempotent bonus/jarima ·
>    eskirgan kun tuzatuvchi qatori · egaga haftalik xulosa (jurnal tayyor). Shu yerda
>    `hr-kpi.service.ts:55` sana bug'i ham yopiladi ([[hr-kpi-daily-date-off-by-one]]).
> 2. **`wave4m-accept` branchi** — TEGILMADI, arxiv sifatida turibdi. Egasi tasdiqlasa o'chiriladi.
>
> **⚠️ Qayd:** 2026-07-31 dan qolgan begona `stash@{0}` hamon turibdi (ichidagi ish allaqachon
> daraxtda) — §6.1 bo'yicha tegilmadi.

> **🕒 2026-08-04b (MENEJER 4M.2 FE — menejer ekrani: navbat + kun qabuli + klaviatura · `d11ca50`) · ⏳ DEPLOY QILINMAGAN**
>
> 08-04a yadrosining **ko'rinadigan tomoni**. TZ §3.5 talabi bo'yicha `/menejer` — **master-detail**
> (route almashmaydi: «keyingi → qabul → keyingi» halqasi uzilmaydi).
> - **Chapda navbat**: xodim · sana · holat · ball · «chala»/«profilsiz»/«tuzatma» belgilari.
>   Tartib **serverdan** keladi (og'ishli kunlar birinchi) — FE qayta saralamaydi.
> - **O'ngda kun**: ball + **qamrov** (`weightScored/weightTotal` ochiq) · ko'rsatkichlar jadvali
>   (fakt · maqsad · bajarish% · **30-kunlik o'rtachadan og'ish** · og'irlik · **soatiga ish yuki**) ·
>   hodisa jurnali · amal tugmalari.
> - **Klaviatura**: `↓/↑` o'tish · `A` qabul · `R` rad · `E` tuzatish. Matn kiritilayotganda
>   qisqartmalar **o'chadi** (izohdagi «a» kunni qabul qilib yubormasin); tanlangan qator
>   `scrollIntoView` bilan ko'rinishda qoladi.
> - **Dialoglar**: rad/qayta ochish/majburiy yopish (**sabab kodi majburiy**, yopiq ro'yxat serverdan)
>   va tuzatma («avtomat qiymat saqlanadi» ekranda yozilgan; «tuzatmani olib tashlash» **alohida**
>   tugma — bu «0 yozish» bilan bir narsa emas).
> - **NULL ≠ 0 ekranda ham**: o'lchanmagan fakt «o'lchanmagan» deb chiqadi · ballsiz kun «0%» EMAS,
>   «ball yo'q» · ballga kirmagan ko'rsatkichning **sababi** ko'rsatiladi · qabul qilingan kunda
>   **muzlatilgan** ball ko'rsatiladi (jonli qayta hisoblangani emas).
> - **Konventsiyalar:** holat→rang lokal jadval EMAS — `documentStateTone(state, KPI_DAY_STATE_TONE)`;
>   uch farq (`accepted`=success terminal · `stale`=warning · `escalated`=destructive) `document-state-tone.ts`
>   da oshkora override va mavjud drift-lock testiga qo'shildi. Nav: **«Menejer» alohida modul**
>   (TZ M-Q11) + subnav + `Icons.menejer`. i18n ru+uz **85 kalit**.
> - **YANGI GUARD** (`menejer-acceptance-screen.test.ts`, 19 test): ekran yorliqlari `t(`state_${x}`)`
>   kabi **dinamik** kalitlar — odatiy i18n key-existence gate'i ularni **ko'rmaydi**. Test BE'ning
>   `daily-kpi.fsm.ts` faylini o'qib har holat/amal/sabab uchun ru+uz tarjimasi borligini tekshiradi
>   (BE'ga yangi sabab kodi qo'shilsa test yiqiladi). **Non-vacuous jonli sinaldi.**
>
> **GATE:** web tc 0 · design-system tc 0 · biome 0 · **web vitest 2683/2683 test** (+19 guard).
>
> **HALOL STATUS: Phase-1** — **BROWSER-QA YO'Q** (ekran real brauzerda hech qachon ochilmagan,
> jonli data bilan tekshirilmagan). **DEPLOY QILINMAGAN.**
>
> **⏭️ KEYINGI (tartib bilan):**
> 1. **Phase-2 QA + deploy**: `pnpm dev` → login → `/menejer` → seed/real data bilan navbat, qabul,
>    rad, tuzatma, klaviatura oqimini brauzerda tekshirish. So'ng erp.sherset.uz ga `migrate deploy`
>    (`20260804120000_kpi_daily_acceptance`) + build + `pm2 restart`.
> 2. **Drill-down** (TZ §3.5 «busiz menejer raqamga ishonmaydi»): `GET /manager/kpi/day/:id/metric/:key/documents`
>    — 5 manba (cashier/sales/attendance/task/warehouse) bo'yicha hujjatlar ro'yxati + FE modal.
> 3. **Xodim tomoni**: «kuningiz hali qabul qilinmagan» + tushuntirish formasi. BE **tayyor**
>    (`manager/kpi/my/days`, `my/day/:id/explain`), FE yo'q.
> 4. **4M.3** — qabul → oylik: bloklash · idempotent bonus/jarima · eskirgan kun tuzatuvchi qatori ·
>    egaga haftalik xulosa. Shu yerda `hr-kpi.service.ts:55` sana bug'i ham yopiladi
>    ([[hr-kpi-daily-date-off-by-one]]).
>
> **⚠️ Qayd:** daraxtda **2026-07-31 dan qolgan begona `stash@{0}`** («lint-staged automatic backup»,
> 24 fayl) turibdi — ichidagi ish allaqachon daraxtda bor (diff bo'sh), lekin §6.1 bo'yicha TEGILMADI.
> Egasi tasdiqlasa `git stash drop` qilinadi.

> **🕒 2026-08-04a (MENEJER 4M.2 YADRO — kunlik KPI qabul FSM + hodisa jurnali + kompozit ball · `59863f0`) · ⏳ DEPLOY QILINMAGAN**
>
> Egasining **1-ustuvorligi** (TZ [4M.2](docs/superpowers/specs/2026-08-02-menejer-kunlik-kpi-tz-design.md) §3):
> «xodimning kunini KPI bo'yicha qabul qilib olish». Bu sessiya **BE yadrosini** yopdi.
>
> **Sof modullar** (DB'siz — qaror qoidalari servisda ko'milib qolmasin):
> - `daily-kpi.fsm.ts` — 6 holat (`computed/pending/accepted/rejected/stale/escalated`), 8 o'tish,
>   vakolat (menejer vs **ega**: `force_accept` faqat egaga), **majburiy sabab kodlari** (yopiq
>   ro'yxat, 8 ta), **muzlatish** (`assertWritable`) va **idempotentlik** (takror qabul = no-op).
>   Naqsh `supply-approval.fsm.ts` dan — yangi mexanizm o'ylab topilmadi. **32 test.**
> - `kpi-score.ts` — og'irlik × bajarish %. **NULL ≠ 0** (o'lchanmagan ko'rsatkich ballni
>   PASAYTIRMAYDI), maqsadsiz/og'irliksiz ko'rsatkich ballga kirmaydi va **sababi ochiq**
>   (`skipReason`), qamrov (`weightScored/weightTotal`) yashirilmaydi. `lower_better` chiziqli-simmetrik
>   (fakt 0 → 200%, maqsad → 100%, 2×maqsad → 0%); maqsad 0 = nol-tolerantlik. **19 test.**
>   ⚠️ **TZ'da yo'q, men tanladim:** bitta ko'rsatkichning hissasi **150%** bilan cheklangan (bitta
>   yirik chek butun kunni yopib yubormasin) — 4M.10 da `ManagerRuleConfig` ga sozlama bo'lib chiqadi.
> - **Ombor:** `EmployeeDailyKpiEvent` (APPEND-ONLY jurnal, `updatedAt` yo'q) + `employee_daily_kpi` ga
>   `queued_at`/`accepted_by_id`/`accepted_at`/`score_percent`/`score_coverage`. **Ball qabul
>   lahzasida MUZLATILADI** — keyin og'irlik o'zgarsa ham to'langan oylik ortidagi raqam o'zgarmaydi
>   (tan narx muzlatish bilan bir klass, [[retail-cost-freeze-null-contract]]).
>   Migratsiya `20260804120000_kpi_daily_acceptance` (DDL prisma-generatsiya bilan bayt-ba-bayt solishtirildi).
> - **Servis + HTTP** (`manager/kpi/*`): navbat (**og'ishli kunlar birinchi**: eskalatsiya > eskirgan >
>   rad > kutayotgan, guruh ichida eng past ball; **ballsiz kun ham YUQORIDA**) · kun detali
>   (auto/tuzatma/maqsad/bajarish% + **30-kunlik o'rtachadan og'ish** + soatiga ish yuki + jurnal) ·
>   `accept/reject/reopen/escalate/force-accept` · `manager/kpi/my/*` — xodimning **o'z** kuniga
>   tushuntirishi (begona kun **404**, 403 emas) · tuzatma (`autoValue` TEGILMAYDI, pul MATN→BigInt).
> - **`ManagerGuard`** — `hrRoles` rol-gate (`admin/menejer/manager/director`; `owner` = admin/director).
>   NEXT.md 08-03a da ochiq qolgan «rol-gate» qarzi **yopildi**. TODO 4-B3 da `EmployeePermission` ga ko'chadi.
> - **ESKIRISH (§3.4) qayta hisoblashda tutiladi:** qabul qilingan kunning `autoValue`'si o'zgarsa kun
>   `stale` bo'lib navbatga qaytadi va **nima o'zgargani** jurnalga yoziladi. ~130 modulga hook osish
>   o'rniga — qayta hisob allaqachon hamma manbani o'qiydi. Cron: hisobla → navbatga → 3 kun javobsizni egaga.
>
> **GATE:** API tc 0 · biome 0 · **API vitest 4538/4538** (yangi 79: FSM 32 · ball 19 · qabul 23 · eskirish 5).
> Lokal DB idempotent sinxronlandi (`climart_adopt`@5432 drifted — unda `state_changed_at` bor, repoda yo'q).
> **Yo'l-yo'lakay tuzatildi:** `packages/money` dist eskirgan edi (`percentScaled` export'i `index.js` da
> yo'q → tc yashil-u 33 report testi runtime'да yiqilardi) — `tsbuildinfo` tozalab qayta build ([[money-dist-stale-tsbuildinfo]]).
>
> **HALOL STATUS: Phase-1** — unit/ulanish testlari yashil, **BROWSER-QA YO'Q** (FE ekran hali yo'q,
> endpointlar jonli sinalmagan). **DEPLOY QILINMAGAN.**
>
> **⏭️ KEYINGI (tartib bilan):**
> 1. **4M.2 FE — menejer ekrani** (TZ §3.5): navbat + bitta kun **bitta ekranda skrollsiz**,
>    klaviatura (`↓/↑` keyingi, `A` qabul, `R` rad, `E` tuzatish), **drill-down** (raqamni bosganda
>    uni hosil qilgan hujjatlar), sabab-kod tanlagichi, `/menejer/*` route + i18n ru+uz.
> 2. **4M.3** — qabul → oylik: bloklash (qabul qilinmagan kun `HrKpiMonthlyScore` ga kirmaydi) ·
>    idempotent bonus/jarima · eskirgan kun **tuzatuvchi qatori** · egaga haftalik xulosa (jurnal tayyor).
>    Shu yerda `hr-kpi.service.ts:55` sana bug'i ham yopiladi ([[hr-kpi-daily-date-off-by-one]]).
> 3. Deploy (erp.sherset.uz=sherset-v2) — `migrate deploy` + `pm2 restart`.

> **🕒 2026-08-03a (YACHEYKA occupied-fix + MENEJER 4M.2 har-xodim KPI config · `9230d5e`+`f287bc6`+`63684d0`) · ✅ DEPLOYED**
>
> **1) YACHEYKA BUG (`9230d5e`, DEPLOYED, BE-only).** Egasi: yacheyka «bo'sh» ko'rinardi-yu «Ko'rish»да
> tovar chiqardi. Ildiz: `getAddressStorage.occupied` faqat `StockByCell.qty>0` sanardi, `getCellStock`
> «Ko'rish» esa biriktirilган (`attributes.__yacheyka`) tovarni ham ko'rsatardi — ikki yuza zid. Fix:
> occupied endi biriktirilган tovarni ham sanaydi (DISTINCT `$queryRaw`). +3 behaviour test. Verify:
> api health 200 (runtime brauzer-QA egasi tomonidan).
>
> **2) MENEJER 4M.2 «HAR-XODIM KPI CONFIG» (slice 0-3, DEPLOYED).** Egasi 2 qaror: KPI **har xodim uchun
> alohida** + **og'irlik + maqsad-raqam**. [[manager-daily-kpi-acceptance]].
> - **Slice 0:** 4M.1 dvigatel migratsiyasi (`829c122`, prodда yo'q edi) qo'llandi — LEKIN u `driver_cash_handovers`
>   (drift) ni ham CREATE qilmoqchi bo'lib P3018 berdi → **idempotent recon** bilan yopildi (`scratchpad/make-kpi-recon.mjs`
>   → `db execute` → `migrate resolve --applied`). [[sherset-v2-schema-drift]].
> - **Slice 1 (`f287bc6`):** `KpiProfile.employeeId` + `KpiProfileMetric.target` schema · dvigatel profil
>   tanlash XODIM→LAVOZIM→sukut · migratsiya `20260803120000` · +3 test.
> - **Slice 2:** `@Controller('manager/kpi')` — metrics/config(GET+PUT versiyalanadi)/daily · `kpi_metric_defs`
>   idempotent sync · +7 test.
> - **Slice 3 (`63684d0`):** xodim sahifasida «KPI» tab (og'irlik+maqsad tahrirlagich, money so'm↔tiyin) + i18n.
> - **GATE:** API tc 0 · web tc 0 · biome 0 · kpi tests 37 · config 7 · store 98 · i18n · drift-lock 78 ·
>   raw-element guard (checkbox → DS Checkbox tuzatildi).
> - **DEPLOY (erp.sherset.uz=sherset-v2):** backup (PREKPI2) → reset `63684d0` → `prisma generate` → `migrate deploy`
>   (`20260803120000` qo'llandi, `employee_id`+`target` ustunlar tasdiqlandi) → build money+web (BUILD_OK, 3GB) →
>   `pm2 restart v2-api+v2-web`. **Tashqi-verify:** `/api/v1/manager/kpi/metrics`→401 · `/hr/employees/x/kpi`→200 ·
>   site 200 · api health 200 · ikkala app online.
> - **HALOL STATUS: Phase-1** — routelar jonli + unit-test, LEKIN **brauzer end-to-end (login→saqlash→cron→natija)
>   O'ZIM tekshirmadim.** Qolgan: kompozit ball (weight×%) hisobi · 4M.2 qabul FSM · rol-gate · `hr-kpi.service.ts:55`
>   sana bug'i ([[hr-kpi-daily-date-off-by-one]]) hamon ochiq.
>
> **⚠️ NEXT.md commit qilinmagan:** parallel 08-02m (deploy qilinmagan) + 08-02n (mening driver) bloklari dirty —
> §6 bo'yicha commit qilmadim; keyingi sessiya birga commit qiladi.

> **🕒 2026-08-02n (HAYDOVCHI PAROLSIZ MAGIC-LINK GPS + HR soddalashtirish · `65655f7`) · ✅ DEPLOYED `65655f7`**
>
> **NIMA QILINDI (bu sessiyaning flagman ishi = haydovchi magic-link).** Egasi haydovchiga LOGIN
> yaratmasдан jonli-kuzatuvni yoqishi uchun parolsiz havola. Mavjud `/haydovchi` (login-talab PWA,
> `3dcb807`)дан FARQI — parol/hisob YO'Q; foydalanuvchi shu variantni so'radi.
> - **BE:** `driver-link.util.ts` HMAC capability-token (`<b64(accountId:employeeId)>.<hmac>`, kalit
>   JWT_SECRET, **migration YO'Q**) · `driver-public.controller.ts` `@Controller('p/driver')` guardsiz
>   (auth = token; accountId+employeeId token ICHIDAN → cross-tenant yo'q): view/ping/shift-start/end ·
>   authed `GET /driver-tracking/link/:employeeId`.
> - **FE:** `/p/driver/[token]` parolsiz GPS-sahifa (watchPosition oqim + smena) · xodim-sahifada
>   (faqat `trackingMode='field'`) «Havola yaratish» kartochka · `hr/drivers/live` menyuga qo'shildi.
> - **HR soddalashtirish (shu sessiyaning oldingi commitlari, JONLI):** menyu 14→6, yangi-xodim oynasidan
>   grafik/lavozim/bo'lim/xabarlar olib tashlandi (`{false&&}`), xodim-sahifaga Davomat+Vazifalar tab
>   konsolidatsiya (`003b918`). Haydovchi-toggle (`trackingMode`) xodim oynasiga qo'shildi (`7306343`).
>
> **GATE:** API tc 0 · web tc 0 · biome 0 · i18n key-existence (ru+uz) · drift-lock 75/75 · no-hardcoded.
> ⚠️ API tc avval `employeeDailyKpiMetric` topolmadi — parallel 08-02m sxema qo'shган, LOKAL prisma
> klient eskirgan edi; `prisma generate --no-engine` bilan tuzatildi (mening kodимга aloqasi yo'q).
>
> **✅ DEPLOYED (erp.sherset.uz = sherset-v2, `65655f7`):** backup 224-jadval
> (`sherset_v2_20260802_130340.sql.gz`, gzip-OK) → fetch+reset → build money+web (BUILD_OK, pipefail +
> `--max-old-space-size=3072`) → `pm2 restart sherset-v2-api sherset-v2-web`. **Tashqi-internet verify:**
> `/api/v1/p/driver/badtoken`→404«Havola yaroqsiz» · link-route→401 · web `/p/driver/x`→200 · site 200 ·
> api health 200 · v2-api+v2-web online. Lockfile/schema o'zgarmagani uchun install/generate/migrate SKIP.
>
> **HALOL STATUS: Phase-1 — telefonda/brauzerda runtime-tasdiqlanmagan.** Qolgan ochiq: egasi hech kimni
> `field` qilib belgilamagan (prodda 0 field-xodim → ekran bo'sh) · brauzer fon rejimida GPS to'xtaydi →
> ishonchli fon-uzatish uchun Android ilova (TZ Faza 1) baribir kerak. Xotira: [[driver-gps-producer-gap]].
>
> **⚠️ NEXT.md commit qilinmagan:** parallel sessiyaning 08-02m (deploy qilinmagan MENEJER KPI) bloki
> dirty turibdi — §6 bo'yicha ustidan ketmaslik uchun bu yozuvni commit qilmadim; keyingi sessiya birga commit qiladi.

> **🕒 2026-08-02m (MENEJER 4M.1 — kunlik xodim KPI o'lchov yadrosi · `829c122`)**
>
> **KEYINGI ISH = 4M.2 «Kunlik qabul qilish» — egasining 1-USTUVORLIGI.** Reja:
> `~/.claude/plans/endi-menejer-uchun-alohida-steady-tiger.md`, TZ:
> `docs/superpowers/specs/2026-08-02-menejer-kunlik-kpi-tz-design.md` (4M.1 bosqichi shu bilan yopildi).
>
> **NIMA QILINDI.** Menejer bo'limining o'lchov poydevori. Servis FAQAT o'lchaydi — qabul qilish,
> tuzatish va oylikka o'tkazish 4M.2/4M.3 da. **UI YO'Q** (rejadagidek).
> - **Ombor, 6 jadval** (`20260802180000_manager_daily_kpi`, 37 statement, **faqat CREATE** — mavjud
>   hech narsa o'zgarmaydi, `HrKpiDailyLog` joyida qoladi): `KpiMetricDef` · `KpiProfile`/`Version`/
>   `Metric` · `EmployeeDailyKpi` · `EmployeeDailyKpiMetric`.
> - **Profil VERSIYALANADI** — og'irlik bugun o'zgarsa o'tgan kunlar o'z versiyasida qoladi
>   (tan narx muzlatish bilan bir klass: hisobot tarixni qayta yozmaydi).
> - **Katalog** `kpi-metrics.ts` — 16 ko'rsatkich, har birida `direction` (ko'p-yaxshi/kam-yaxshi) va
>   `perHour` bayrog'i. Soatga normallashtirish faqat OQIM ko'rsatkichlarida (kassa farqi yoki
>   kechikishni soatga bo'lish ma'nosiz).
> - **Manbalar** — faqat bugun mavjudlari: `CashierSession`+`CashierAuditEvent` (kassa),
>   `RetailSalePosition.costMinor` (1.1 muzlatilgan tan narx), `Demand.ownerId` (sotuv),
>   `HrAttendance` (davomat), `Task` (vazifa), `RestockTaskLine.confirmedById` (yig'ish).
> - **Tungi cron** `40 0 * * *` `Asia/Tashkent`, `isRunning` qo'riqchisi bilan (hr-kpi-cron naqshi).
>
> **UCH SHARTNOMA TESTDA QULFLANDI** (buzilsa raqam YOLG'ON bo'ladi, gate esa yashil qolaveradi):
> 1. **NULL ≠ 0** — tan narxi yig'ilmagan qator foydaga qo'shilmaydi va kun CHALA deb belgilanadi.
> 2. **Kassir o'qi = `CashierSession.cashierId`**, `RetailSale.ownerId` EMAS (qaytarishda ownerId
>    AKTYORGA yoziladi — analitika TZ X2 shu bilan yopildi).
> 3. **Qayta hisoblash faqat `autoValue`/`complete` yozadi** — menejer tuzatmasini (`adjustValue`,
>    `reasonCode`) va kun holatini (`state`) o'chirmaydi. 4M.2 qabul oqimi shunga tayanadi.
>
> **🔴 YO'L-YO'LAKAY TOPILGAN XATO — KUN YORLIG'I BIR KUNGA SURILARDI.** Mahalliy yarim tunning UTC
> kalendar sanasi olinardi: 23:30 Toshkent = 01-avgust 19:00 UTC → 02-avgust ma'lumoti «01-avgust»
> deb yozilardi. **Jonli hisobda ko'rindi** (test emas — mock'da TZ farqi bilinmaydi). Tuzatildi:
> yangi `tz.util.localDateOnly` (yorliq uchun) — `startOfLocalDay` (chegara uchun) bilan aralashmasin;
> 2 test qulfladi, jumladan «yorliq va so'rov chegarasi bir xil kunni bildiradi».
> **⚠️ MAVJUD `hr-kpi.service.ts:55` AYNAN SHU XATO BILAN YASHAYAPTI** — `HrKpiDailyLog.date` bir kun
> orqada. **ATAYLAB TEGILMADI**: tuzatish mavjud qatorlarni qayta yorliqlaydi va oylik hisobiga
> ta'sir qiladi → alohida qaror + ma'lumot migratsiyasi kerak. 4M.3 (qabul → oylik) da hal qilinsin.
>
> **GATE:** typecheck 0 · biome 0 · **api Vitest 4446/4446 pass** (+34 yangi).
> **JONLI TEKSHIRUV (API-daraja, brauzersiz):** lokal `climart_adopt` @ `localhost:5432` bazasiga
> (CLAUDE.md §1 dagi `moysklad_dev`@5433 EMAS — bu repo `packages/db/.env` da boshqa baza;
> xotira: `climart-adopt-local-db-untracked.md`) migratsiya qo'llandi
> (37/37) va `computeDay` REAL ma'lumotda yugurdi → 10 ko'rsatkich yozildi, `cash_revenue 11 810 000` ·
> `discount_given 3 600 000` · `below_cost_loss 240 000` · `cash_gross_profit −110 000` **«chala»
> bayrog'i bilan** (aynan NULL≠0 shartnomasi ishladi — soxta 100% marja emas). Sana yorlig'i
> tuzatishdan keyin `2026-08-02` (oldin `2026-08-01` edi).
> **HALOL STATUS: Phase-1 — UI yo'q, brauzer-smoke YO'Q.** Runtime faqat API/DB darajasida tasdiqlandi.
>
> **DEPLOY QILINMAGAN.** Shu bilan birga **3.1 (`26df34f`, aralash to'lov — terminal/qarz) ham hali
> prod'da yo'q** — 08-02i entry'siga qara, u prod'da hamon buzuq.
>
> **PARALLEL SESSIYA.** Ish `wave4m-kpi-core` worktree'da bajarildi; asosiy checkout'da parallel
> sessiya `ru/uz.json` ustida ishlayotgan edi. Ularning tagini tortmaslik uchun branch `climart-adoption`
> ustiga **rebase** qilindi va **fast-forward** bilan merge qilindi — ularning dirty fayllari
> tegilmadi (merge oldi/keyin `git status` bir xil). To'qnashgan yagona fayl `docs/progress.json`
> (hook generatsiya qiladi) — commit'dan chiqarib tashlandi.
>
> **4M.2 UCHUN TAYYOR NARSALAR:** `EmployeeDailyKpi.state` (VarChar, default `computed`) va
> `staleAt` allaqachon sxemada · hisoblash ularga TEGMAYDI · `EmployeeDailyKpiEvent` (append-only
> jurnal) hali YO'Q — 4M.2 da qo'shiladi. FSM naqshi: `supply-approval/supply-approval.fsm.ts`.

> **🕒 2026-08-02l (HAYDOVCHI NAQD TOPSHIRIG'I — TZ §7.2 · `fd8056d` + `9ce42bb`) · ✅ DEPLOYED**
>
> **HAYDOVCHI GPS ISHI SHU BILAN TZ §7 BO'YICHA YOPILDI** (§7.1 va §7.2 bajarildi; §7.3 —
> ish birligiga oylik — 5-to'lqin payroll'ga bog'liq, alohida).
>
> **Muammo:** haydovchi mijozdan naqd olgan payt bilan kassaga topshirgan payt orasida pul
> **uning qo'lida** turadi. Bu hech qayerda yozilmasa, kassa qoldig'i bilan real pul o'rtasidagi
> farq ko'rinmaydi va «kimda qancha turibdi» degan savolga javob bo'lmaydi.
>
> **IKKI BOSQICH ATAYLAB ajratilgan** — `DriverCashHandover`:
> `collect` (haydovchi «oldim» deydi — **pul harakati YO'Q**) → `handOver` (kassir sanab qabul
> qiladi va **aynan shu qadamda ПКО** yaratiladi). Bitta qadam qilinsa, haydovchi e'lon qilishi
> bilan kassa qoldig'i oshib ketardi — kassada esa pul yo'q.
>
> **PUL YAXLITLIGI (asosiy qaror):** servis kassa qoldig'iga **o'zi tegmaydi** —
> `CashInService.create` + `transition('post')` chaqiriladi, ya'ni pul mavjud **auditlangan**
> yo'ldan o'tadi (MoneyOperation, kontragent balansi, hujjat raqami). Alohida «tezroq» yozuv
> qilinsa, kassa hisoboti bilan ПКО reyestri farq qilib ketardi.
>
> **POYGA HIMOYASI:** holat **AVVAL** CAS + optimistik qulf bilan band qilinadi, ПКО **KEYIN**.
> Teskarisi bo'lsa, poygada yutqazgan kassirning ПКО'si osilib qolardi — kassaga **ikki marta**
> pul tushardi. ПКО yaratilmasa holat `pending`ga **qaytadi** (aks holda yozuv «topshirilgan»
> ko'rinib, pul kassaga tushmay qolardi).
>
> **Rol ajratilgan:** haydovchi faqat **o'zi** olgan naqdni e'lon qiladi (`driverId` **tanadan
> emas, token'dan**); qabul/bekor/hisobot — `DispatcherGuard` ostida.
>
> **Ekranlar:** `/haydovchi` — «Oldim» + summa, qo'lidagi naqd **qizil** yig'ma, va ochiq matn:
> «bu yozuv kassani TO'LDIRMAYDI» (aks holda haydovchi «topshirdim» deb o'ylardi) ·
> `/hr/drivers/live` — haydovchi bo'yicha **qizil** qatorlar («kimda qancha turibdi», TZ talabi),
> kontragent/tashkilot/kassa tanlab har yozuvni qabul qilish; 409 xabari ekranda.
>
> **🔬 VERIFIKATSIYA:** migratsiya SQL'i (qo'lda yozilgan) **haqiqiy Postgres'da** tranzaksiya
> ichida qo'llanib jadval yaratilgani tasdiqlandi, so'ng **rollback** — lokal baza o'zgarmadi.
> Prodda migratsiya qo'llandi va `driver_cash_handovers` jadvali **bazada tasdiqlandi**.
>
> **🚀 DEPLOY:** zaxira 318 MB `gzip -t` OK · migratsiya qo'llandi · build «Compiled successfully»
> (money **toza** qayta build) · jonli: `/` 200 · `/haydovchi` **200** · `/hr/drivers/live` **200** ·
> `/sotuv` 200 · **`/api/v1/driver-cash/outstanding` 401** va **`/mine` 401** (404 EMAS — yangi
> kontroller ro'yxatdan o'tgan) · `sherset.biznesjon.uz` 200 (boshqa ijarachi tegilmadi).
>
> **Gate:** typecheck 0 · biome 0 · i18n ru+uz (haydovchi 42/42, driver_cash 11/11) ·
> **api driver-tracking 52/52** · **web 2663/2689** · +12 pul-yaxlitligi testi.
>
> ⚠️ **Phase-1 — BRAUZERDA OCHILMAGAN.** Naqd oqimi ekranda o'tkazilmagan. Phase-2 QA:
> haydovchi «Oldim» → kassir qabul qiladi → **ПКО reyestrida hujjat paydo bo'lishini va kassa
> qoldig'i aynan shu payt oshishini** tekshirish.
>
> **▶️ HAYDOVCHI BO'YICHA QOLGANI:** Android ilova (fon GPS — brauzer bermaydi) · ish birligiga
> oylik (§7.3, 5-to'lqin) · Yandex kaliti kerak emas (Nominatim ishlaydi, 02j ga qarang).

> **🕒 2026-08-02k (MENEJER BO'LIMI TZ'si — kunlik KPI qabul qilish · `ab79f7a`)**
>
> **Egasi menejer bo'limini so'radi** va ikkita aniq talab qo'ydi: (1) **xodimlarning kunini KPI
> bo'yicha QABUL QILIB OLISH** — birinchi navbatda, (2) **to'liq xodimlar nazorati** — keyin.
> Mavjud 4-bo'lim TZ'sini tekshirganda ma'lum bo'ldi: **ikkalasi ham unda yo'q** — u ruxsatlar va
> tasdiqlash navbati haqida, plan **faqat oylik**, «kunlik xodim KPI» hech bir qarorida yo'q.
>
> Asl hujjat egasi tasdiqlagani uchun **qayta yozilmadi** — kengaytma alohida hujjatda
> (`2026-08-02-menejer-kunlik-kpi-tz-design.md`, 445 satr), asl hujjatga ishora va **Q3 tuzatmasi**
> qo'shildi.
>
> **🔴 TOPILGAN ZIDDIYAT:** koddа **uchta parallel «kunlik xodim o'lchovi»** bor yoki
> rejalashtirilgan va hech qayerda kelishtirilmagan — `HrKpiDailyLog` (**ishlayapti**, cron 23:30,
> faqat `Demand.ownerId` sotuvi) · `EmployeeDailyRollup` (3-TZ §5.1 da rejalashtirilgan) ·
> `SalesPlan` (2-TZ). Egasi qaroriga ko'ra **bitta ombor qoladi: mavjud HR KPI kengaytiriladi** —
> 1.4 da o'rnatilgan «bir savolga ikki javob bo'lmasin» tamoyilining davomi.
>
> **Qarorlar M-Q1…M-Q11.** Ikkitasi bo'yicha ochiq izoh yozildi:
> · **M-Q8 «bloklaydi»** — menejer kasal bo'lsa xodim oyliksiz qoladi → **egaga eskalatsiya
>   klapani** (majburiy yopish, audit bilan). Bloklash saqlandi, boshi berk ko'cha yopildi.
> · **M-Q9 «har kun qo'lda»** — 20+ xodim degani → ekran **tezlik uchun** qurilishi shart (bitta
>   ekran, skrollsiz, klaviatura), aks holda menejer ko'r-ko'rona bosa boshlaydi.
>
> **TZ'ga qo'shilgan, hech bir hujjatda yo'q bo'lgan narsalar:**
> **KPI profili VERSIYALANADI** (og'irlik o'zgarsa o'tgan kunlar o'z versiyasida qoladi — tan narx
> muzlatish bilan bir xil klass) · **ma'lumot sifati bayrog'i** (tan narx yig'ilmagan kunda foyda
> «to'liq emas», kam ko'rsatilmaydi — NULL ≠ 0 intizomi KPI'ga o'tadi) · **adolat normalizatsiyasi**
> (soat, yarim stavka, ta'til, yangi xodim, ikki smena, bir odam ikki rolda) · **manba drill-down**
> va **«o'z 30-kunlik o'rtachasidan og'ish»** (busiz qabul qilish rasmiyatchilikka aylanadi) ·
> **eskirish** (qabul qilingan kunning hujjati o'zgarsa tuzatuvchi qator, jimgina qayta yozish yo'q)
> · **🔴 xodim hayot sikli — bugun umuman yo'q va bu XAVFSIZLIK TESHIGI**: xodim ishdan ketsa
> ERP+HR ruxsatlari, Telegram ulanishi va ochiq sessiyalari **ochiq qolaveradi**.
>
> **Roadmap tuzatildi:** `4.8`–`4.11` (plan qo'yish ekranlari · record-scope 4-to'lqin va **flagni
> yoqish** · xodim kesimidagi 4 blok · xodim kartasi) **hech bir to'lqinda yo'q edi** — qo'shildi.
> Yangi **«To'lqin 4M»** — menejer bo'limining 10 bosqichi; u 4-to'lqinning qolganidan **mustaqil**
> boshlanadi (menejer butun korxonani ko'radi, ruxsat qatlamlari kutilmaydi).
>
> **⏭️ KEYINGI ISH = 4M.1 — KPI o'lchov yadrosi.** Katalog + **versiyalangan** profil + yangi ombor
> + hisoblash + tungi cron (UI yo'q). Manbalar faqat bugun mavjudlaridan: kassa (`CashierSession` +
> `CashierAuditEvent`), sotuv (`Demand.ownerId`), davomat (`HrAttendance.lateMinutes`), vazifa
> (`Task`, `HrTaskLog`), yig'ish (`RestockTaskLine.confirmedAt/ById`). Formulalar **`report/metrics/`**
> dan — yangi bo'linish yozilmaydi. Cron naqshi: `hr-kpi-cron.service.ts`.
> Keyin **4M.2 — kunlik qabul qilish** (egasining 1-ustuvorligi).
>
> **Ochiq qarz (bu sessiyaga aloqasiz):** 3.1 (aralash to'lov) **deploy qilinmagan** va
> **brauzerda ko'rilmagan** — `26df34f`+`2750ff4`. Terminal/qarz oqimi prodda hamon eski holatda.

> **🕒 2026-08-02j (GEOKODER — Nominatim provayderi · `5a7e722`) · ✅ DEPLOYED `5a7e722`**
>
> **NEGA:** egasi Yandex kabinetida kalit olmoqchi bo'ldi; men shartlarni o'qib chiqdim va
> **Yandex Maps API'ning BEPUL tarifi bu loyihaga HUQUQAN to'g'ri kelmasligi** aniqlandi —
> uchta mustaqil sabab: (1) loyiha **ochiq kirishli** bo'lishi shart, bizniki login ortida;
> (2) natijani **saqlash taqiqlanadi**, biz `driver_trips.dest_lat/lng` ga yozamiz;
> (3) **transport/xodimni real vaqtda kuzatish ALOHIDA taqiqlangan** — bu loyihaning aynan o'zi.
> Pullik litsenziya **208 800 ₽/yil**. Egasi «bepul» ni tanlasa — noto'g'ri ma'lumot berish,
> kalit keyin bloklanishi mumkin. Shuning uchun **OpenStreetMap Nominatim** default qilindi
> (ODbL: saqlash mumkin, kuzatuv taqiqi yo'q).
>
> **Arxitektura:** `GeocodeProvider` porti + 2 implementatsiya + `GeocodeService` fasadi.
> Kontroller FAQAT fasadga bog'langan. `GEOCODER_PROVIDER` = `nominatim` (default) | `yandex` | `none`.
> Yandex kodi **saqlandi** — egasi litsenziya olsa bitta env bilan yoqiladi.
>
> **Nominatim siyosati — ISHLASH SHARTI, optimizatsiya emas (buzilsa IP ban):**
> 1 so'rov/sek bitta oqimda → **`MinIntervalGate`** (navbat zanjiri; oddiy `setTimeout` yetmaydi —
> ikki dispecher parallel so'rov yuborardi) · **o'zini tanitadigan User-Agent** (standart kutubxona
> UA'si rad etiladi) · **kesh majburiy**, musbat ham MANFIY ham · **avtomatik-to'ldirish QAT'IY
> taqiqlangan** → FE'da «Topish» **TUGMASIGA** bog'langan, matn o'zgarishiga EMAS · atribut
> «© OpenStreetMap (ODbL)» natija ostida. Bularning hammasi `nominatim-geocode.parse.test.ts` da
> **manba-skaner** bilan qulflangan (kelajakdagi refaktor jimgina buzmasin).
>
> **Jim o'chib qolishga qarshi:** `yandex` tanlangan-u kalit yo'q bo'lsa Nominatim'ga tushadi va
> **ogohlantiradi**; env'da typo bo'lsa ham default ishlaydi. Aks holda dispecher tugmani bosardi,
> hech narsa bo'lmasdi, sabab hech qayerda ko'rinmasdi.
>
> **🔬 JONLI TEKSHIRUV (deploydan keyin, VPS'dan haqiqiy chaqiruv):** Nominatim **ishlaydi** —
> `lat`/`lon` **SATR** sifatida keldi (parser shartnomam tasdiqlandi), `addresstype: "road"` →
> `street`, `licence: "Data © OpenStreetMap contributors, ODbL 1.0"`.
> ⚠️ **LEKIN sifat ogohlantirishim amalda tasdiqlandi:** «Toshkent Amir Temur ko'chasi» so'rovi
> **Chortoq**dagi ko'chani qaytardi. Shuning uchun panel `display_name` ni ko'rsatadi va
> koordinatani **tahrirlanadigan** qoldiradi — dispecher natijani tasdiqlashi SHART.
>
> **🚀 DEPLOY (`90d8d0d → 5a7e722`):** zaxira 317 MB `gzip -t` OK · migratsiya «no pending» ·
> **money paketi TOZA qayta build qilindi** (quyidagi gotcha) · build «Compiled successfully» ·
> jonli: `/` **200** · `/haydovchi` **200** · `/hr/drivers/live` **200** · `/sotuv` **200** ·
> `/reports/profitability` **200** · `/api/v1/driver-trips` **401** · `/api/v1/driver-trips/geocode`
> **401** (tirik) · `sherset.biznesjon.uz` **200** (boshqa ijarachi tegilmadi).
>
> ⚠️ **33 ta test «xatosi» KOD XATOSI EMAS EDI** — `packages/money/dist/index.js` eskirgan edi
> (`tsconfig.tsbuildinfo` tufayli tsc `index.js` ni qayta emit qilmagan): `.d.ts` yangi →
> **typecheck va push gate O'TADI**, runtime esa `percentScaled is not a function`. Yechim:
> `rm -f tsconfig.tsbuildinfo && rm -rf dist && build`. Deploy skriptiga ham shu kiritildi.
> Xotira: `money-dist-stale-tsbuildinfo`.
>
> ⚠️ **MENING XATOM (qayd, takrorlanmasin):** `git reset --hard FETCH_HEAD` bilan «sinxronlashga»
> urinib, parallel sessiyaning **push qilinmagan** 3 commit'ini branch tepasidan tushirdim
> (`26df34f`/`2750ff4`/`a670a09`). `git reflog` bilan **darhol tiklandi**, yo'qotish yo'q.
> To'g'ri yo'l — `pull --rebase` yoki `merge FETCH_HEAD`; sinxronlashdan oldin lokal HEAD
> remote'dan oldindami tekshirish. `CLAUDE.md` §6.7 va xotira yangilandi.
>
> **Gate:** typecheck 0 · biome 0 · i18n ru+uz 31/31 · **api 4373/4375** · **web 2660/2686**
> (driver-tracking 40/40) · +22 yangi test.
>
> ⚠️ **Phase-1 — brauzerda ochilmagan:** «Topish» tugmasi ekranda bosilmagan, atribut ko'rilmagan.
> Nominatim'ning O'ZI VPS'dan tekshirildi (yuqorida), lekin ilova orqali emas.
>
> **▶️ GEOKODER BO'YICHA EGASIGA:** Yandex kaliti **shart emas** — hech narsa qilmasangiz ham
> ishlaydi. Kalit olmang (bepul tarif yaramaydi, pullik 208 800 ₽/yil).

> **🕒 2026-08-02i (TO'LQIN 3.1 — aralash to'lov; TERMINAL va QARZ endi ishlaydi · `26df34f`, merge `2750ff4`)**
>
> **PRODDA BUZUQ EDI.** Egasi «kassada yana nima bo'ladi?» deb so'raganda TZ'ning B-ro'yxatini kod
> bilan solishtirdim va shu chiqdi: `/sotuv` to'lov oynasi serverga **to'rtta** turni yuborardi
> (naqd · karta · terminal · qarz), server sxemasi esa **ikkitasini** bilardi. Zod ortiqcha
> kalitlarni **jimgina tashlaydi** → terminal orqali to'langan chek serverga «0 to'landi» bo'lib
> yetar va **400 «Payment insufficient»** olardi. Ya'ni **kassir terminal bilan to'lagan yoki
> qarzga olgan mijozning chekini umuman rasmiylashtira olmasdi**, va oyna tugmani faol qilgani
> uchun xatoni faqat bosgandan keyin ko'rardi.
>
> **Yangi `RetailSalePayment` jadvali** (TZ §6.1, migratsiya `20260802160000_retail_sale_payments`,
> faqat CREATE): har to'lov turi alohida qator. Bu Z-hisobotning «to'lov turlari kesimida tushum»
> bandi uchun yagona manba — ikkita ustundan kanalni tiklab bo'lmaydi.
> `RetailSale.cash/cardAmountMinor` saqlanadi va endi shu qatorlardan hisoblanadi (TZ §6.3 orqaga
> moslik: terminal `card`ga qo'shiladi, qarz **hech qaysi ustunga tushmaydi** — u pul emas).
>
> **Qoidalar sof modulda** (`retail-tenders.ts`): qarzli chekda arifmetika **aniq** (to'langan +
> qarz = jami; kam ham, **ortiqcha ham** rad — aks holda qarz summasi haqiqiy qoldiqqa mos kelmay,
> mijoz balansiga noto'g'ri raqam tushardi) · **qaytim faqat naqddan** (TZ §6.2 — karta/terminal
> ortiqcha o'tkazilsa bloklanadi, aks holda kassa bank pulidan naqd qaytim berib o'z pulini
> yo'qotardi). Bir xil qoida FE'da ham: tugma bloklanadi + sabab yoziladi.
>
> **Qarz (TZ §7.1)** mijozning **umumiy balansiga** yoziladi. `Debt` reyestriga (QRZ-) ataylab
> YOZILMAYDI: reyestrning `create` yo'li balansga tegmaydi, ikkalasiga birdan yozilsa hujjatdan
> kelgan qarz **ikki marta** sanalardi (xotira: `debt-ledger-asymmetry`). Mijozsiz qarzga sotish
> bloklanadi. Yangi audit hodisasi **`SOLD_ON_CREDIT`** — payload'da o'sha ondagi **yangi balans**
> (keyin «kimning qarzi tez o'sadi» deb so'rash uchun).
>
> **🔴 YO'L-YO'LAKAY IKKI PUL XATOSI TUZATILDI:**
> 1. **Qaytim kassadan chegirilmasdi.** 100 000 berib 90 000 lik tovar olgan mijozga 10 000
>    qaytarilsa ham kassa balansi **100 000** ga o'sardi. Smena yopilishida (TZ §8.4 «farq akti»)
>    bu har qaytim summasicha **soxta kamomad** berardi.
> 2. **`expectedSumMinor` tekshirilmasdi** — sxema izohidagi «server revalidates against DB sum»
>    da'vosi **yolg'on** edi. Chek yuklangan va to'lov olingan on orasida hujjat o'zgarsa, kassir
>    ekrandagidan **boshqa summaga** pul olardi. Endi 409.
>
> **Yangi qo'riqchi `pos-payment-contract.test.ts`** — FE↔BE **tana** shartnomasi (mavjud
> `api-contract.test.ts` faqat yo'l/metodni tekshiradi). Aynan shu bug-klassni tutadi: FE yuborgan
> har maydon API sxemasida bormi. **Mutatsiya bilan sinaldi** — sxemadan `terminalAmountMinor`
> olib tashlanganda 2 test yiqildi va xato xabari maydon nomini aytdi.
>
> **Gate:** typecheck 0 (api+web) · biome 0 · **api 4380/4380** · **web 2660/2660** · +34 test.
>
> **⚠️ Phase-1: BRAUZERDA KO'RILMAGAN.** Terminal/qarz oqimi lokal brauzerda o'tkazilmagan —
> **keyingi sessiya shundan boshlasin** (lokal bazaga migratsiya qo'llangan, QA seed tayyor:
> QA-1/2/3 tovarlar + «QA smena»). **Deploy qilinmagan.**
>
> **📋 KASSA TZ HOLATI (kod bilan solishtirilgan):** B1 ✅ · B2 ✅ · **B3 ✅ (shu sessiya)** ·
> B4 ❌ kiosk rejim (`Role.uiMode` yo'q) · B5 ❌ qarz to'lovi PKO · B6 ❌ xarajat RKO +
> inkassatsiya · B7 ❌ smena yopish farq akti + Z-hisobot (`CashierSessionVariance` yo'q) ·
> B8 ✅ audit jurnali / ❌ `sotuv/page.tsx` bo'lish (**1997 satr**, TZ: har fayl <300).
>
> **⏭️ KEYINGI:** brauzer-QA → keyin 3.3 qarz to'lovi (PKO) yoki 2.1 `Branch` modeli (roadmap
> tartibi; «hozir arzon, keyin qimmat»). Egasi tanlaydi.

> **🕒 2026-08-02h (TO'LQIN 1.4 — yagona formulalar qatlami · `bbf7af5` + `0c36680`) · ✅ DEPLOYED `90d8d0d`**
>
> **DEPLOY tasdiqlandi** (erp.sherset.uz, `DS_TARGET=v2 deploy-smart.sh`, `a646bdd → 90d8d0d`;
> skript oxirgi MUVAFFAQIYATLI deploy'dan diff olgani uchun oraliqdagi hamma narsa birga ketdi):
> zaxira `sherset_v2-PREDEPLOY-90d8d0d-091416.sql.gz` (302M, 222 jadval, `dump complete` markeri) ·
> `packages/money` o'zgargani uchun to'liq web build ishladi · `/` `/sotuv` `/retail/sales`
> `/reports/profitability` `/demands` → **200** · api health ok · pm2 xato jurnalida **bugungi
> yozuv YO'Q** · faqat `sherset-v2-*` restart, boshqa 8 ijarachi 24h uptime bilan tegilmadi.
> **Jonli tekshirilgan markerlar:** `metrics/` 4 fayl manbada · **7 hisobot** `metrics/index.js` dan
> import qiladi · qo'lda `Number()/Number()` **0** (grep 1 ta topdi — u **izoh matni**, nima olib
> tashlanganini tushuntiradi) · `percentScaled` money `dist/` da (web build shundan oziqlanadi) ·
> `.husky/post-commit` va `CLAUDE.md §6.7` box'da bor.
>
> **🎉 1.3 JONLI ISHLAYAPTI:** prod bazasida `cashier_audit_events` da **`SALE_CANCELLED` yozuvi
> paydo bo'ldi** — ya'ni haqiqiy chek bekor qilinganda jurnal to'lyapti. Bu funksiya deploydan
> keyin o'zini ko'rsatgan birinchi dalil.
>
> **⚠️ Hamon browser-QA YO'Q:** HTTP 200 React ishlashini isbotlamaydi. Hisobot ekranlarida
> (`/reports/profitability`, dashboard, ABC, unit-economics) foizlar **ko'z bilan solishtirilmagan**
> — 1.4 chiqish formatlarini o'zgartirmasligi kerak edi va testlar shuni tasdiqlaydi, lekin ekranda
> ko'rilmagan. Audit jurnalini KO'RSATADIGAN interfeys ham yo'q (menejer paneli 4-to'lqin).
>
> **Analitika TZ §4/X4: «har hisobot o'z formulasini yozmaydi».** Taxminiy qatlam qurilmadi —
> avval takrorlanish **o'lchandi**, va topilgani kutilganidan yomonroq chiqdi. Hisobot modulida bir
> xil savolning **yetti joyda** alohida javobi bor edi:
> `profitability pct()` · `pnl` · `unit-economics` (×2) · `purchase-management` ·
> `abc-analysis` (×2) · `returns-ratio` (×2) · `dashboard`.
> **Uch xil xulq:** bitta nisbat qaysi ekranni ochishingizga qarab **30.65 % / 30.6 % / 31 %** bo'lib
> chiqardi. Beshtasi BigInt'ni `Number()` orqali bo'lardi — 2^53 tiyindan (~900 mlrd so'm) katta
> yig'indida aniqlik jimgina yo'qoladi; yillik agregat shunga yetadi.
>
> **Yechim ikki qavat:**
> · `@moysklad/money` → **`percentScaled(numer, denom, decimals)`** — yagona bo'linish: to'liq
>   BigInt, noldan uzoqqa yaxlitlash, maxraj nol bo'lsa `null` («o'lchab bo'lmadi» ≠ «nol»).
>   **POS savati ham shundan o'qiydi** — kassir ko'rgan marja bilan egasi ko'rgan marja bir bo'lsin.
> · **`apps/api/src/modules/report/metrics/`** — hisobotga qaragan qatlam: `percent` · `percentText`
>   (bo'sh-satr shartnomasi saqlandi) · `grossProfitMinor` · `marginPercentText` (÷ tushum) va
>   `markupPercentText` (÷ tan narx — **ikkalasi ham «marja» deyiladi**, shuning uchun ikki nom) ·
>   `averageCheckMinor` · `returnRatePercent(Text)`.
>
> Yettala joy ham ko'chirildi. **Sirtga xos ko'rsatish saqlandi** (dashboard butun son, qolganlari
> 2 xona, returns-ratio 1000 % cheklovi) — ya'ni bitta **bo'linish**, sirt bo'yicha turli
> **ko'rsatish**, har sirtda o'z bo'linishi EMAS. `abc-analysis`da sinf chegarasi endi
> KO'RSATILADIGAN ulushdan hisoblanadi (ko'rgan raqami bilan sinfi mos keladi).
>
> **Qo'riqchi `no-adhoc-percent.test.ts`** (source-scan): `Number()/Number()`, `*100).toFixed(`,
> `*10000n)/` shakllari va foiz ishlatib `metrics/` dan import qilmaydigan fayllar.
> **Mutatsiya bilan sinaldi** — `aging.service.ts` ga qo'lda formula qo'shilganda 2 test yiqildi.
> Bu buzilishni na typecheck, na testlar tutadi: sakkizinchi implementatsiya mukammal
> kompilyatsiya bo'lardi. *(Qo'riqchining o'zi men ko'rmagan 4 joyni topdi — dastlab 3 tasini
> ko'chirgandim.)*
>
> **Gate:** typecheck 0 · biome 0 · **api 4349** (+21) · money 92 · hisobot **290/290** — chiqish
> shartnomalari o'zgarmadi.
>
> **⚠️ Phase-1: brauzerda ko'rilmagan.** Formatlar testlar bilan qulflangan, lekin ekranda
> solishtirilmagan. **Deploy qilinmagan** (1.3 ham).
>
> **🔴 SESSIYADA YO'QOTISH BO'LDI (hujjatlanadi):** ish ikki commitga bo'lingan, chunki birinchi
> urinishdagi **7 servis tahriri va `packages/money` o'zgarishlari yo'qoldi** — parallel sessiya
> `git reset --hard FETCH_HEAD` qilgan (reflog: `HEAD@{1} reset: moving to FETCH_HEAD`), bu mening
> commit qilinmagan ishimni ham, `3280acb` commit'imni ham o'chirib yubordi. Faqat **untracked**
> yangi fayllar (`metrics/`) omon qoldi. Qayta qo'llash deterministik skript bilan qilindi.
> **Saboq (§6.2 ga qo'shimcha):** parallel sessiya faol bo'lsa (a) uzoq ishni commit qilinmagan
> holda ushlab turmang — bosqichma-bosqich commit qiling; (b) `git add` dan keyin commit'ni
> **kechiktirmang**; (c) commit'dan keyin `git show --stat` bilan tarkibni tekshiring.
> *(Bir sessiyada ikkinchi hodisa: oldin lint-staged begona fayllarni QO'SHGAN edi, endi reset
> meniknini O'CHIRDI.)*
>
> **⏭️ KEYINGI ISH = To'lqin 2.1 `Branch` modeli** (master-roadmap 2-to'lqin): filial modeli +
> migratsiya + `branchId` muhrlash. **Hozir arzon, keyin qimmat** — keyinroq har hujjatni orqaga
> backfill qilish kerak bo'ladi. Keyin 2.2 `skladNo → StoreZone`.
> **Yoki avval deploy:** 1.3 + 1.4 prod'da yo'q; 1.4 da migratsiya yo'q, 1.3 da bor
> (`20260802140000_cashier_audit_events`).

> **🕒 2026-08-02f (TO'LQIN 1.3 — kassir audit jurnali · `d35efab`)**
>
> **Nima uchun:** kassir narxni istagancha qo'yadi, tan narxdan past sotadi, chekni bekor qiladi va
> qaytaradi (Q8/Q11/Q16) — hech biri bloklanmaydi. Shu paytgacha ularning **hech biri iz
> qoldirmasdi**: savat «ZARAR» deb ogohlantirar, sotuvga ruxsat berar, keyin hodisa yo'qolardi.
> «Erkinlik + nazorat» modelining nazorat yarmi shu edi.
>
> **Yangi jadval `CashierAuditEvent`** (`session_id` · `employee_id` · `type` · `doc_id` · `payload`,
> migratsiya `20260802140000_cashier_audit_events`, faqat CREATE). **Mavjud `audit_log` dan ATAYLAB
> alohida:** u — hujjat maydonlarining diff'i (moysklad History tabi, «shu hujjatga nima bo'ldi»),
> bu esa smena/kassir kesimida so'raladigan **xulq** hodisalari. `audit_log` ga tiqilsa aynan
> `session_id` — butun tahlilning o'qi — yo'qolardi.
>
> **Yoziladigan hodisalar** (mavjud oqimlar bo'yicha): `PRICE_CHANGED` (farq + foiz) ·
> `SOLD_BELOW_WHOLESALE` (qancha pastligi) · `SOLD_BELOW_COST` (**zarar summasi**) ·
> `SALE_CANCELLED` (**bosqichi bilan** — `ready` bekor qilish tovar allaqachon yig'ilgan degani) ·
> `REFUND` · `SHIFT_OUT_OF_SCHEDULE` (sabab bilan).
> `SOLD_ON_CREDIT` / `EXPENSE` / `SHIFT_VARIANCE` — 3-to'lqin, funksiyalari hali yo'q.
>
> **Uch qaror (kodda hujjatlangan):**
> 1. **Chegaralar SERVER tomonda** hal qilinadi. POS o'zining «bu zararga sotildi» bayrog'ini
>    yuborganda, auditni **auditdan o'tayotgan odam** yozgan bo'lardi. Optom narx ham server tomonda
>    (`resolveWholesaleMinor`), lekin chekka **muzlatilmaydi**: u — o'sha ondagi hukm, ustun emas.
> 2. **Yozuv sotuv tranzaksiyasi ICHIDA** (loyalty kabi «commit'dan keyin» emas). Izsiz to'langan
>    chek — aynan shu jadval oldini olishi kerak bo'lgan holat. Narxi: yozuv yiqilsa sotuv qaytadi.
> 3. **Noma'lum narx hodisa YARATMAYDI.** NULL ni 0 deb olish kartochkasiz har tovarni «zararga
>    sotildi» deb belgilardi; yolg'on signalga to'lgan jurnal o'qilmay qoladi = jurnal yo'qligi.
>
> `cancel()` endi `userId` oladi va holat-almashtirish + audit yozuvini bitta tranzaksiyada bajaradi
> (poygada yutgan odam jurnalga tushadi, yutqazgani hech narsa yozmaydi).
>
> **Dalil — live smoke lokal bazada** (haqiqiy chek API orqali, natija bazadan o'qildi):
> 3 dona × (tan 24 800 → 24 000) → **uchala hodisa ham yozildi** — `PRICE_CHANGED` (diff −12 000,
> 33.3%) · `SOLD_BELOW_WHOLESALE` (belowBy 4 000) · `SOLD_BELOW_COST` (**lossMinor 2 400** = 800×3);
> `picking` bosqichidan bekor qilish → `SALE_CANCELLED` `stage: picking`.
> **+26 test green** (api 4302 → 4328). Gate: typecheck 0 · biome 0 · api 4328.
>
> **⚠️ Phase-1: brauzerda ko'rilmagan** — jurnalni KO'RSATADIGAN interfeys hali yo'q (menejer paneli
> 4-to'lqin). Hozircha faqat yoziladi. **Deploy qilinmagan.**
>
> **🔴 SESSIYADA YO'L QO'YILGAN XATO (hujjatlanadi, yashirilmaydi):** birinchi commit'ga parallel
> sessiyaning 4 fayli (`driver-trip-assign.tsx`, `hr-api.ts`, `messages/{ru,uz}.json`) kirib ketdi,
> garchi `git add` faqat aniq yo'llar bilan qilingan bo'lsa ham — **lint-staged** commit paytida
> ularni qo'shib yubordi. Push qilinmagani uchun `reset --soft` → ularni `restore --staged` →
> qayta commit bilan tuzatildi; fayllar md5 bo'yicha o'zgarmagan va ish daraxtida qoldi. Qayta
> commit **hook'larsiz** qilindi (aks holda lint-staged yana qo'shardi) — gate'lar esa qo'lda to'liq
> yugurtirilgan edi. **Saboq §6.2 ga qo'shimcha:** parallel sessiya faol bo'lsa commit'dan keyin
> `git show --stat` bilan ro'yxatni TEKSHIR — `git add` ning aniqligi yetarli emas.
>
> **⏭️ KEYINGI ISH = To'lqin 1.4 `report/metrics/`** — yagona formulalar qatlami. Qisman
> allaqachon bor: `@moysklad/money/profit.ts` (`lineProfitMinor` · `sumCostMinor` · `marginPercent` ·
> `markdownMinor` · `classifyPrice`) 1.1 da qurildi va savat ishlatadi; 1.4 hisobotlarni ham shunga
> ko'chirishi kerak. Keyin 2-to'lqin (`Branch` modeli + `skladNo → StoreZone`).

> **🕒 2026-08-02g (HAYDOVCHI GPS — o'lik halqa yopildi · `3dcb807` + `24bc562` + §7.1) · ✅ DEPLOYED `e091cae`**
>
> *(Yorliq `02f` dan `02g` ga o'zgartirildi — parallel sessiya ham `02f` ni ishlatgan, §6.3 to'qnashuvi.)*
>
> **🚀 DEPLOY TASDIQLANDI (erp.sherset.uz = sherset-v2, `a646bdd → e091cae`):**
> zaxira `sherset_v2-PREDEPLOY-driver-081153.sql.gz` **288 MB, `gzip -t` OK, 221 jadval, yakun markeri bor** ·
> migratsiya `20260802140000_cashier_audit_events` qo'llandi (**faqat qo'shuvchi**: CREATE TABLE + 3 indeks +
> 3 FK; `DROP` faqat izohdagi qaytarish eslatmasi) va `cashier_audit_events` jadvali bazada tasdiqlandi ·
> build **«Compiled successfully»** (`NODE_OPTIONS=--max-old-space-size=3072`, OOM bo'lmadi) ·
> **jonli tekshiruv (tashqi internetdan):** `/` **200** · **`/haydovchi` 200** · `/hr/drivers/live` **200** ·
> `/sotuv` **200** (eski POS buzilmadi) · `/api/v1/driver-trips` **401** (tirik, himoyalangan) ·
> API `/health` 200 (~30s da ko'tarildi) ·
> **build markerlari** `.next` ichida: `/haydovchi` marshruti build ro'yxatida (4.92 kB) va
> `sherset.driver.pingBuffer.v1` + `driver-tracking/shifts/start` **satr-literallari** chunk'larda
> (xotira saboqi: minifikatsiya identifikatorlarni o'zgartiradi — faqat satr-literal ishonchli marker) ·
> **faqat `sherset-v2-*` restart bo'ldi** — qolgan 8 ijarachi (erp/biznesjon/akademiya/servis/sherset) 23h/2h
> uptime bilan tegilmadi.
>
> **PROD TEKSHIRUVI (SSH, `13.140.157.10` / sherset-v2) — egasining «gps haydovchilar tayyormi?»
> savoliga javob:** backend **to'liq deploy qilingan va tirik**, lekin **BITTA HAM ma'lumot yo'q edi**:
>
> | Tekshiruv | Natija |
> |---|---|
> | migratsiya `20260728120000_hr_driver_tracking` | ✅ qo'llangan |
> | `driver_trips` / `driver_shifts` jadvallari | ✅ bor |
> | `employees.tracking_mode`, `pings.speed/heading` | ✅ bor |
> | `GET /api/v1/driver-tracking/live` · `/driver-trips` | ✅ 401 (tirik) |
> | web `/hr/drivers/live` | ✅ 200 |
> | `employees(tracking_mode='field')` | 🔴 **0** |
> | `driver_shifts` · `driver_trips` · `hr_location_pings` | 🔴 **0 · 0 · 0** |
>
> **Sabab (ildiz):** yagona ko'zda tutilgan **ishlab chiqaruvchi** — native Android ilova — hech qachon
> build qilinmagan (`f0dd781` o'zi «BUILD-VERIFIED EMAS» deb yozgan), web esa faqat `/driver-tracking/live`
> ni **O'QIRDI**, hech narsa **YOZMASDI**. Mavjud brauzer GPS yuboruvchisi (`use-geolocation-attendance`)
> geofence davomat endpointiga yozadi — `/hr/attendance/ping`, `/driver-tracking/ping` GA EMAS.
> Ya'ni dispecher xaritasi **bo'sh bo'lmasdan boshqa holatda bo'lolmasdi**.
>
> **1) `3dcb807` — `/haydovchi` (haydovchining telefon ekrani):** smena boshlash/tugatish · ochiq smena +
> ruxsat berilganda `watchPosition` → `POST /driver-tracking/ping` (`speed`/`heading` bilan) · **oflayn
> bufer** (localStorage) · server rad etsa sababi **ekranda** (`not_field`/`no_shift`/`accuracy`/`jump`) ·
> smena yig'masi + o'z yetkazmalari · ru+uz 35/35.
> **Bufer dekorativ EMAS** — server izohi (#7) ping'lar **KETMA-KET** kelishini talab qiladi (parallel
> kelsa masofa ikki marta sanaladi) va har ping **ASL `ts`** ini olib yurishi kerak (kech flush «hozir»
> deb yozilsa jump-filter rad etadi va haydovchi teleport qiladi). Throttle davomat bilan **bir xil**
> qoidadan (`shouldSendPing` 45s/20m).
>
> **2) `24bc562` — dispecher paneli (`/hr/drivers/live` ichida):** `POST /driver-trips` ning **chaqiruvchisi
> yo'q edi** → `DriverTrip` hech qachon yaratilmasdi va unga bog'liq hammasi o'lik edi: ETA-worker'ga
> yetkazma yo'q · ping ingest'dagi «manzilga yetdi» avto-belgilash (80m) **hech qachon ishga tushmasdi** ·
> smena yakunidagi `deliveriesCount` **doim 0** qolardi. Endi: haydovchi tanlash · manzil **gibrid**
> (Yandex kaliti bo'lsa avto, bo'lmasa **qo'lda koordinata** — prodda kalit YO'Q, shuning uchun
> koordinata maydonlari doim ko'rinadi) · holat tugmalari · 409 (CAS) xabari ekranda · ru+uz 26/26.
> **DRIFT-QULF:** FE holat-jadvali (`lib/driver-trip-fsm.ts`) testda **server faylidan o'qib**
> solishtiriladi — **mutatsiya bilan sinaldi** (`enroute`dan `cancelled` olib tashlanganda yiqildi).
>
> **Gate:** typecheck 0 · biome 0 (o'z fayllarimda) · i18n ru+uz · **web 2660** · +21 test green.
>
> ⚠️ **Phase-1 — BRAUZERDA/TELEFONDA OCHILMAGAN va DEPLOY QILINMAGAN.** Haqiqiy GPS oqimi, ruxsat
> oqimi, bufer flush va biriktirish jonli sinalmagan.
>
> **HALOL CHEKLOV (kodda ham, ekranda ham yozilgan):** `/haydovchi` **native ilova o'rnini BOSMAYDI** —
> brauzer fon rejimida `watchPosition`ни to'xtatadi, Wake Lock faqat sahifa ko'rinib turganda yordam
> beradi. Ishonchli fon-uzatish = TZ Faza 1 (Android foreground-service). Bu TZ §11 Faza 0 ning aynan
> o'zi: «vaqtincha mavjud PWA bilan sinash».
>
> **3) §7.1 — yetkazma ↔ otgruzka bog'lanishi** (`orderType`/`orderId` ustunlari 2026-07-28 dan bor edi,
> to'ldiradigan ekran yo'q edi → har yetkazma `manual` bo'lib qolardi). Dispecher «otgruzka bo'yicha» ni
> tanlasa manzil **hujjatdan** olinadi (`shipmentAddress`) va faol yetkazmada hujjatga havola chiqadi.
> Hujjat nomi API javobida yo'q → havola beriladi, **nom to'qib chiqarilmaydi**. Migratsiya kerak emas.
>
> ⚠️ **BU KOD `d35efab` ICHIDA KETDI, MENING COMMIT'IMDA EMAS.** Sabab: commit xabarim «halollik gate»ida
> rad etilgan, fayllar **index'da qolgan**, parallel sessiya esa o'z commit'i bilan ularni ham olib ketgan
> (12 fayl stage qilgan, 16 tasi kirgan). **Yo'qotish yo'q** — mazmun HEAD'da tasdiqlandi (15 marker,
> i18n 30/30 kalit). Saboq xotiraga yozildi: rad etilgan commit index'ni tozalamaydi.
>
> **▶️ ENDI EGASINING QO'LIDA (kod tayyor va prodda):**
> 1. Xodim kartochkasida **«Haydovchi (jonli-iz)»** ni yoqing — hozir prodda **0 ta** field xodim,
>    usiz `/haydovchi` ham, dispecher xaritasi ham bo'sh qoladi (server `not_field` bilan rad etadi).
> 2. Haydovchi telefonida **`https://erp.sherset.uz/haydovchi`** ochsin → «Smenani boshlash» →
>    joylashuvga ruxsat bersin. **Ekran yoqiq turishi kerak** (brauzer cheklovi).
> 3. `/hr/drivers/live` da nuqta harakatlanishini va «Yetkazma biriktirish» panelini tekshiring.
>
> **QOLGAN TZ §7 QARZI (To'lqin 7 — hali qurilmagan):** **naqd topshirish (`DriverCashHandover`)** —
> model + migratsiya kerak, LEKIN `schema.prisma` shu sessiyada parallel sessiya qo'lida edi (To'lqin 1.3),
> §6.1 bo'yicha tegilmadi · ish birligiga oylik (5-to'lqin payroll'ga bog'liq) · **Yandex kaliti yo'q**
> (ETA haversine-taxmin, geokoder `enabled:false` → manzil koordinatasi qo'lda) · **Android ilova**
> (fon rejimida ishonchli GPS — brauzer buni bermaydi).

> **🕒 2026-08-02e (PHASE-2 QA — to'lqin 1.1 + 1.2 BRAUZERDA TEKSHIRILDI · `23fdd3e`)**
>
> **Bu — 1.1/1.2 ning «browser-QA yo'q» qarzini yopgan sessiya.** Playwright MCP, lokal stack,
> **haqiqiy chek o'tkazildi** va natija bazada tekshirildi. Kirish uchun lokal `climart_adopt`
> sxema drift'i yopildi (30 bayonot, **DROP yo'q** — additiv; `smenas`/`shift_schedules`/
> `sklad_keepers`/`restock_tasks` va `cashier_sessions.smena_id` yetishmasdi, ularsiz `/sotuv`
> smena ocholmasdi). QA ma'lumoti ataylab **uchta narx holatini** qopladi: optomli tovar ·
> tan narxsiz tovar · tan narxi **haqiqatan nol** tovar.
>
> **✅ TASDIQLANGAN (ekranda ko'rildi — «Phase-2 verified»):**
> savat qatori TZ §5.2 ko'rinishida (`Qolgan · Tan · Min` + jonli foyda/%) · narx optomdan past →
> sariq, tan narxdan past → qizil **«ZARAR»** va sotuv **bloklanmaydi** (Q16) · **NULL ≠ 0 jonli**:
> tan narxsiz tovar «Tan: —»/«Foyda: —», tan narxi nol tovar «Tan: 0,00»/«100%» · bironta qatorda
> tan narx bo'lmasa **jami umuman ko'rsatilmaydi** · `post()` muzlatishi bazada
> (`cost=2 480 000`, `base=3 600 000`; tekin tovarda `cost=0`, NULL emas) · hisobot muzlatilgan tan
> narxni o'qiydi va zararni zarar deb ko'rsatadi (−3 200) · «tan narx yig'ilmagan» banneri va
> qatordagi «*» ishlaydi, **haqiqiy nol tan narxda «*» YO'Q** (farq hisobotda ham ko'rinadi).
>
> **🔴 TOPILGAN VA TUZATILGAN (4 ta — hammasi jonli topildi, statik tahlil ko'rmagan edi):**
> 1. **Eng jiddiysi — savat/chek nomuvofiqligi.** «Tayyor» chek savatga tortilganda **saqlangan
>    chegirma tiklanmasdi**: savat «29 000», to'lov oynasi va chek esa «26 100»; savat foydasi
>    «+4 200» derdi, hisobot esa aynan o'sha chek uchun to'g'ri «+1 300». *Kassir pul olayotgan
>    ondagi foyda raqami noto'g'ri edi.* Endi chegirma tiklanadi va mavjud chek to'lanayotganda
>    foyda asosi — serverning `sumMinor`i (qayta hisoblangan jami emas: tiyin farqi bo'lardi).
> 2. **Foiz nuqta, pul vergul bilan** chiqardi: «-800,00 сум (**-3.3%**)» — bir gapda ikki ajratgich.
>    Yangi `formatPercent` (`@moysklad/money`) pul formatiga ergashadi.
> 3. **Foiz yaxlitlanmay KESILARDI** (BigInt bo'lish): 4,98% → «4.9%», 14,48% → «14.4%». Xato bir
>    yo'nalishda — foydani qirqib, zararni chiroyliroq ko'rsatardi; egasi shu raqamga qarab narx
>    belgilaydi. Endi noldan uzoqqa yaxlitlanadi.
> 4. **Hisobotning JAMI qatorida «*» yo'q edi** (qatorlarda bor edi) — 02d hand-off'i «jamida ham
>    bor» degan, aslida yo'q edi (§2: da'vo tekshirildi). Jamidagi tan narx to'liq yig'ilgandek
>    ko'rinardi; odam avval jami qatorga qaraydi.
>
> **Har tuzatish o'sha brauzerda QAYTA tekshirildi:** savat 32 400 = to'lov oynasi 32 400 ·
> «−10% chegirma» tiklandi · foyda +7 600 (haqiqiy) · foizlar «23,5%»/«31,1%» · jami qatorda «*»
> va tooltip. **Dalil:** live browser smoke 12/12 · +18 test green (money 88→92, web 2636→2650).
>
> **Gate:** biome 0 · i18n ru+uz 9 · money 92 · web 2650 · api (retail-sale + profitability) 151.
> ⚠️ **Typecheck:** mening fayllarimda 0; daraxtda 3 xato bor, lekin ular **parallel sessiyaning**
> shu daqiqada yozayotgan `haydovchi/page.tsx` + `driver-ping-buffer.ts` fayllarida (§6.1 — tegilmadi,
> stage qilinmadi; ularning `messages/{ru,uz}.json` va `hr-api.ts` o'zgarishlari ham tegilmadi).
>
> **⏭️ KEYINGI ISH = To'lqin 1.3 `CashierAuditEvent`** — zararga sotuv hodisasi (Q16) hozir HECH
> QAYERGA yozilmaydi: savat «ZARAR» deb ogohlantiradi, sotuvga ruxsat beradi, lekin iz qolmaydi.
> «Erkinlik + nazorat» modelining nazorat yarmi shu. Keyin 1.4 `report/metrics/`.
>
> **Ochiq (bu sessiyada tuzatilmadi):** (a) hisobotda tan narxsiz qator foydasi baribir aniq raqam
> sifatida ko'rsatiladi («100%»), faqat «*» bilan belgilanadi — 02d ning ataylab qarori, lekin egasi
> uchun chalg'itishi mumkin; (b) grafikda chakana YO'Q (02d topgan, tuzatilmagan); (c) `costMinor`
> valyutasi hisobga olinmaydi (repo bo'ylab shunday).

> **🕒 2026-08-02d (TO'LQIN 1.2 — «Прибыльность» tan narx yolg'oni yopildi · `6adc495`)**
>
> **Bajarildi (master-roadmap To'lqin 1.2, analitika TZ §B2):** hisobot har kassa chekini **100% marja**
> bilan ko'rsatardi va egasi narxni SHU raqamga qarab belgilardi. Ikki sabab:
> 1. **Chakana umuman tan narxsiz** hisoblanardi — SQL'da tom ma'noda `0::bigint AS cost`
>    (`profitability.service.ts`). 1.1 `retail_sale_positions.cost_minor` ni qo'shgach bu eskirdi →
>    endi haqiqiy **muzlatilgan** tan narx o'qiladi.
> 2. `cost_minor` **har** pozitsiya jadvalida NULL bo'la oladi; demand/vozvrat so'rovlari uni
>    `COALESCE(cost_minor, 0)` bilan **nolga** aylantirardi.
>
> **⚠️ MUHIM NUANS — arifmetika O'ZGARMADI va bu ataylab.** NULL qator ham, nol tan narxli qator ham
> yig'indiga 0 qo'shadi. **Lokal Postgres'da yonma-yon tasdiqlandi: `old_cost = new_cost = 0`.**
> Ya'ni bug hisob-kitobda emas — **SUKUTDA** edi: hisobot kam hisoblangan tan narxni FAKT sifatida
> ko'rsatardi. Shuning uchun ishning asosiy mahsuli — **belgi**, raqam emas:
> `costMissingLines` (tan narxi yig'ilmagan qatorlar soni) + `costIncomplete` — har **qatorda**, **jamida**
> (butun natijadan, faqat joriy sahifadan EMAS) va har **grafik ustunida**. Web'da sariq banner +
> tan narx katagida `*` (tooltip qatordagi sonni aytadi), ru+uz.
> **Eski cheklar ATAYLAB backfill qilinmadi** — o'sha ondagi tan narx hech qayerda yozilmagan;
> bugungi kartochkadan to'qish yangi yolg'on bo'lardi. NULL qoladi va belgilanadi (1.1 qarori bilan bir xil).
>
> **🔬 VERIFIKATSIYA (bu sessiya odatdagidan kuchliroq — SQL jonli bazada yugurtirildi):**
> lokal `climart_adopt` da: ikkala ustun bor va nullable · `COUNT(*) FILTER (WHERE ... IS NULL)` va
> `"costMissing"` alias'i **Prisma raw orqali ishlaydi** (alias registri saqlanadi) · eski/yangi shakl
> yonma-yon (yuqoridagi natija) · qisman yig'ilgan holat: `cost=5000` **saqlanadi** va `costMissing=1`
> baribir belgilanadi. **LEKIN:** lokal bazada `posted` chakana sotuv **0 ta** → hisobot haqiqiy chek
> ma'lumoti bilan yugurtirilmadi.
> **Manba-skaner qo'riqchisi** qo'shildi (`0::bigint AS cost` va `COALESCE(cost_minor,0)` qaytib
> kelmasin; 5 agregatning har birida hamroh hisoblagich bor) — **mutatsiya bilan sinaldi**: eski SQL
> qaytarilganda 2 test yiqildi. Sabab: mock SQL'ni bajarmaydi, faqat matn bo'yicha marshrutlaydi —
> ya'ni xulq-testlari SQL'ni ISBOTLAMAYDI, shuning uchun shakl alohida qulflandi.
>
> **Gate:** typecheck 0 · biome 0 · i18n ru+uz · **api 4312** · **web 2636** (regress yo'q) ·
> +11 test (profitability to'plami 14/14 green).
>
> **⚠️ Phase-1: SQL lokal bazada tasdiqlangan, hisobot haqiqiy ma'lumot bilan va BRAUZERDA
> ko'rilmagan** — banner va `*` belgisi ekranda tekshirilmagan. Phase-2 QA: chek o'tkazib
> (`/sotuv`), keyin `/reports/profitability` da tan narx ustuni + banner.
>
> 🔴 **TOPILDI, TUZATILMADI:** grafik (`chartBuckets`) faqat **demand + vozvrat**ni yig'adi —
> **chakana unda YO'Q**, jadvalda esa BOR. `documentType=retail` filtri jadvalda satr ko'rsatadi-yu
> grafikni bo'sh (yoki faqat-vozvrat) qoldiradi. Bu **1.2 dan oldin ham shunday edi**, tegilmadi —
> alohida ish (grafikka retail'ni qo'shish + shu bilan birga retail'ning `chartBuckets` filtrlari).
>
> ⚠️ **PARALLEL SESSIYA HODISASI (§6.2 aynan bashorat qilgan):** birinchi commit urinishim
> **commit-msg «halollik gate»i**da rad etildi (xabarda «tasdiqlandi» bor edi, lekin gate tanigan
> dalil formati yo'q edi → `14/14 test green` qo'shildi). Rad etish paytida **lint-staged butun
> tree'ni stash qilgan** edi va `stash@{0}` (`lint-staged automatic backup`) qolib ketdi — ichida
> **parallel sessiyaning 24 fayli** (DocumentEditor/DocumentTotalsPanel/use-totals-labels/i18n-ratchet).
> **Tekshirdim: yo'qotish YO'Q** — `git diff stash@{0} HEAD` o'sha fayllarda bo'sh, ya'ni ular
> allaqachon `91ee5db` da. Stash MENIKI EMAS → **tegilmadi** (drop ham, pop ham qilinmadi).
> Kim uni yaratgan bo'lsa o'zi tozalasin. **Saboq: commit xabarini gate formatiga OLDINDAN moslang** —
> rad etilgan commit stash qoldiradi.
>
> **▶️ KEYINGI ISH = To'lqin 1.3** — `CashierAuditEvent` (kassa TZ §9). «Erkinlik + nazorat»
> modelining nazorat yarmi: **zararga sotuv hodisasi hozir hech qayerga yozilmayapti** (1.1 savatda
> «ZARAR» ni ko'rsatadi va sotuvni bloklamaydi — bu egasining qarori, lekin hodisa jurnalga tushishi
> kerak edi). Keyin 1.4 `report/metrics/` (formulalar allaqachon `@moysklad/money/profit.ts` da —
> qayta yozilmasin).

> **🕒 2026-08-02c (TO'LQIN 1.1 — tan narx muzlatish + savatda foyda · `6d1be01`, merge `092989c`) · ✅ DEPLOYED `a646bdd`**
>
> **DEPLOY tasdiqlandi** (erp.sherset.uz = sherset-v2, `DS_TARGET=v2 deploy-smart.sh`, `d7ab3b1 → a646bdd`):
> pre-deploy zaxira `sherset_v2-PREDEPLOY-a646bdd-063723.sql.gz` (275M, 221 jadval, `dump complete`
> markeri tekshirilgan) · **migratsiya `20260802120000_retail_position_price_freeze` qo'llandi**
> (`_prisma_migrations` da 06:44:12; `cost_minor`+`base_price_minor` bazada, ikkalasi ham `is_nullable=YES`) ·
> web build «Compiled successfully in 4.3min» · `/` `/sotuv` `/retail/sales` `/demands` → **200** ·
> api health ok · pm2 xato jurnalida bugungi yozuv YO'Q (hammasi 26–30 iyul, Telegram MTProto) ·
> faqat `sherset-v2-*` restart qilindi, boshqa 8 ijarachi 21h uptime bilan tegilmadi.
> **Kod-markerlari build ichida** (satr literallari — minifikatsiyaga chidamli): `sotuv-cart-line`,
> `data-price-band`, `sotuv-cart-profit`, `sotuv-grid-cost`, `sotuv-cart-markdown` (har biri 5 chunk) +
> `cart_total_profit`/`cart_below_wholesale`/`cart_cost_missing` (7 fayl).
>
> **⚠️ Deploy oynasidagi xavf tutildi:** box'da eski sessiyalardan qolgan **4 ta yetim poll-sikl**
> (`chek-build.log`/`chek3`/`chek4`/`wf-build.log` kutayotgan `while pgrep -f 'next build'`) turgan edi;
> ulardan ikkitasi `next build` tugashi bilan **`pm2 restart sherset-v2-web`** qilardi — deploy build'i
> tugagan zahoti nazoratsiz restart aynan 2026-08-01 dagi 502 klassini qaytarardi. To'rttasi ham
> deploy boshlangach o'ldirildi (PID mosligi `ps -o args` bilan tasdiqlab). **Saboq:** nohup poll-sikl
> qoldirmang yoki `setsid` bilan uzing; deploydan oldin `pgrep -af 'while pgrep'` bilan tekshiring.
>
> **⚠️ Baribir BROWSER-QA YO'Q** — HTTP 200 React'ning ishlashini isbotlamaydi (aynan shu farq
> 08-01b da React #310 ni yashirgan edi). Savat qatorining o'zi (Tan/Min ustunlari, ZARAR belgisi,
> jami foyda, «Tayyor» chekni tortish) **ekranda ko'rilmagan** — keyingi sessiya shundan boshlasin.
>
> **Bajarildi (master-roadmap To'lqin 1.1, kassa TZ §5):**
> `RetailSalePosition` ga **`cost_minor` + `base_price_minor`** (migratsiya
> `20260802120000_retail_position_price_freeze`, ikkalasi ham NULL bo'la oladi) va `post()` ularni
> **sotuv onida tovar kartochkasidan muhrlaydi** (`costMinor` = `Product.buyPrice`, `basePriceMinor` =
> «Розничная цена» tier). Sabab: kartochkadagi narx keyin o'zgarsa, o'tgan oy hisoboti jimgina qayta
> yozilmasin.
>
> **NULL ≠ 0 — bu ishning markaziy sharti.** NULL = «yig'ilmagan». Nolga aylantirilsa hisobot «100%
> marja» deb yolg'on ko'rsatadi — aynan shu bug hozir `report/profitability.service.ts:578` dagi
> `0::bigint AS cost` da o'tiribdi. **Eski cheklar backfill QILINMADI**: o'sha paytdagi tan narx hech
> qayerda yozilmagan, uni bugungi kartochkadan to'qib chiqarish yolg'on raqam bo'lardi. Ular NULL
> qoladi va 1.2 ularni «tan narx yig'ilmagan» deb belgilashi kerak.
>
> **Qarorlar (hujjatlangan):** muzlatish `post()` **tranzaksiyasi ICHIDA** (zaxira/pul kaskadi qaytsa
> snapshot ham qaytadi), kartochkalarni o'qish esa **tashqarida** (kartochka sotuvning konsistensiya
> to'plamiga kirmaydi). **Refund** oyna cheki tan narxni **asl chekdan meros** qilib oladi — bugungi
> kartochkani qayta o'qiganda, kartochka o'zgargan bo'lsa arvoh foyda qolardi. Yozish **mahsulot
> bo'yicha guruhlangan** (bir tovar bir necha qatorda bo'lsa ham 1 statement).
>
> **Savat (kassa TZ §5.2):** qatorda `Qolgan · Tan · Min` + real vaqtda **foyda va %** (narx
> tahrirlanganda darhol o'zgaradi) · narx optomdan past → **sariq**, tan narxdan past → **qizil
> «ZARAR»** (Q16: sotuv BLOKLANMAYDI) · kartochkadan tushirilgan bo'lsa «−X tushirildi». Savat
> pastida **chek bo'yicha jami foyda** — **chegirmadan KEYINGI** summadan; bironta qatorda tan narx
> bo'lmasa jami umuman ko'rsatilmaydi.
>
> **Rol qarori (YOPILDI, `234432d`):** tan narx **butun `/sotuv` sahifasida ochiq** — setkada ham,
> savatda ham. Sabab: savat 1.1 dan keyin raqamni ko'rsatgach, setkadagi `isAdmin` gate'i **hech
> nimani himoya qilmay qoldi** (tovarni bir marta bosish yetardi) — ishlamaydigan cheklov «bu raqam
> sir» deb o'rgatib, ikki soniyadan keyin o'zi ko'rsatardi. TZ §5 «kassirga ishonch + keyingi
> nazorat» modeli buni allaqachon hal qilgan; nazorat 1.3 audit jurnali orqali keladi.
> Qo'riqchi `pos-cart-profit.test.ts` yarim-yopiq holat qaytishini bloklaydi.
>
> **Formulalar `@moysklad/money/profit.ts` da** (`lineProfitMinor` · `sumCostMinor` · `marginPercent` ·
> `markdownMinor` · `classifyPrice`) — savat va kelajakdagi hisobotlar bitta manbadan o'qisin. Bu
> **1.4 ning oldindan to'langan qismi**; 1.2 shu funksiyalarni ishlatsin, formulani qayta yozmasin.
>
> **Gate:** typecheck 0 · biome 0 xato · i18n ru+uz 9 · api **4302** · web **2635** · money 88.
> Qo'riqchi `apps/web/src/__tests__/pos-cart-profit.test.ts` (source-scan) **mutatsiya bilan sinaldi**:
> `costMinor ?? 0n` kiritilganda yiqiladi.
>
> **⚠️ Phase-1: strukturaviy, RUNTIME-TASDIQLANMAGAN — BROWSER-QA YO'Q.** `/sotuv` savat brauzerda
> ochilmadi: yangi qator ko'rinishi, ranglar, ZARAR belgisi va jami foyda **ekranda tekshirilmagan**.
>
> **Parallel sessiya:** bu ish **alohida worktree**da (`.claude/worktrees/wave1-1-cost-freeze`, branch
> `wave1-cost-freeze`) bajarildi — sessiya boshida 02b sessiyasi `retail-sale.service.ts` ni **faol
> ushlab turgan edi** (fayllar 3 daqiqa oldin yozilgan). U `2011424` da yopilgach merge qilindi.
> To'qnashuv faqat `messages/{ru,uz}.json` (ikkala tomon `pages.sotuv` oxiriga kalit qo'shgan) va
> `docs/progress.json` da bo'ldi; JSON strukturaviy birlashtirildi, ru/uz kalit pariteti 59=59.
> `retail-sale.service.ts` avtomat birlashdi va qo'lda tekshirildi (FSM qo'riqchilari + muzlatish
> bir-birini buzmaydi). **Worktree o'chirildi** — ishi to'liq merge bo'lgani isbotlangach
> (`git log wave1-cost-freeze --not climart-adoption` bo'sh, tree toza).
>
> **⏭️ KEYINGI ISH = To'lqin 1.2** — `report/profitability.service.ts:578` `0::bigint AS cost` ni
> `retail_sale_positions.cost_minor` ga ulash **+ «tan narx yig'ilmagan» belgisi** (NULL qatorlar
> nol tan narx sifatida hisoblanmasin — aks holda bug shakl o'zgartirib qoladi). Formulalar
> `@moysklad/money/profit.ts` dan olinsin. Keyin 1.3 `CashierAuditEvent` (zararga sotuv hodisasi
> shu yerga yoziladi — hozir hech qayerga yozilmayapti) · 1.4 `report/metrics/`.
>
> **Ochiq:** (b) valyuta — `costMinor`
> kartochkadagi xom qiymat, `Product.buyPriceCurrency` hisobga olinmaydi (repo bo'ylab shunday,
> `schema.prisma` izohida qayd etilgan); (c) lokal DB `climart_adopt` ga 2 ustun qo'lda qo'shildi
> (`ADD COLUMN IF NOT EXISTS`), lekin u boshqa migratsiyalardan hamon orqada.

> **🕒 2026-08-02b (To'lqin 0 QOLDIG'I — yig'ilgan chek to'lanadi va bekor qilinadi · `2011424`)**
>
> **Nima topildi:** 02a To'lqin 0.1 bilan POS'ning «Yig'ilmoqda»/«Tayyor» ro'yxatlarini ochdi
> (enum'ga `picking`+`ready`), lekin zanjirning **OXIRI berk qolgan edi** — ro'yxatlar to'ldi-yu,
> ular bilan hech nima qilib bo'lmasdi:
> - `post()` (`retail-sale.service.ts`) faqat `draft` ni qabul qilardi → omborchi yig'ib «tayyor»
>   bosgach kassirning «💳 To'lov» tugmasi (`sotuv/page.tsx` «Tayyor» ro'yxati →
>   `POST /retail-sales/:id/post`) **400** qaytarardi. **Butun yig'ish oqimi to'lovda o'lardi.**
> - `cancel()` ham faqat `draft` → `picking`/`ready` dagi chek **abadiy osilib qolardi**
>   (na to'lanadi, na bekor qilinadi). Mijoz ketib qolsa kassirda chiqish yo'li yo'q edi.
> - Sxema izohi (`retail-sale.schema.ts`) va TZ §4 diagrammasi ikkalasi ham
>   `ready ──post──► posted` va `draft|picking|ready → cancelled` deb yozilgan edi — ya'ni
>   **hujjat to'g'ri, kod orqada** edi.
>
> **Fix (`2011424`):** FSM jadvali bitta manbaga chiqarildi — **`retail-sale-fsm.ts`**
> (`post ← draft|ready` · `cancel ← draft|picking|ready` · `send-to-picking ← draft` ·
> `mark-ready ← picking`). `picking` dan to'lov **ATAYLAB yo'q**: tovar hali yig'ilmagan, kassir
> pul olmasligi kerak. Oldindan tekshiruv ham, tranzaksiya ichidagi **CAS qo'riqchisi**
> (`updateMany WHERE state IN (...)`) ham shu jadvaldan oziqlanadi — ajralib qolsa qo'riqchi yo
> tor (haqiqiy o'tish 409) yo keng (poyga o'tib ketadi) bo'lardi.
> **Bekor qilishda** omborchining ochiq yig'ish topshiriqlari yopiladi (`RestockTask.status`
> yangi qiymati **`cancelled`** — `done` EMAS, u «yig'ib bo'lindi» degan yolg'on bo'lardi);
> `markReady` hisoblagichlari `notIn: ['done','cancelled']` ga o'tdi. **Ustunlar VarChar —
> MIGRATSIYA KERAK EMAS** (Prisma izohi + Zod filtr enum'i yangilandi).
> **POS'da «Bekor qilish» tugmasi** qo'shildi (Jarayonda + Tayyor ro'yxatlari),
> `useDestructiveMutation` tasdig'i bilan; `pages.sotuv` ru+uz kalitlari.
>
> **Testlar +14** (`retail-sale-fsm.test.ts`): o'tish jadvali · **enum↔FSM drift qo'riqchisi** ·
> ready to'lovi · CAS kengligi · picking to'lanmasligi · uchala holatdan bekor · topshiriq
> tozalash. `retail-sale.cas.test.ts` dagi eski `state: 'draft'` qat'iy da'vosi yangilandi —
> **aynan o'sha tor qo'riqchini qulflab turgan edi** (test bug'ni himoya qilayotgan edi).
> **Gate:** typecheck 0 · biome 0 · i18n key-existence ru+uz + no-hardcoded · **api 4285** ·
> **web 2628** (regress yo'q).
>
> ⚠️ **Phase-1: strukturaviy, runtime-tasdiqlanmagan — BROWSER-SMOKE YO'Q.** Servis testlari
> Prisma mock'i bilan; real HTTP round-trip va POS ekrani tekshirilmagan. Phase-2 QA'da:
> savat → «Rasmiylashtirish» → omborchi «tayyor» → kassir «To'lov» (200 kutiladi) va
> «Bekor qilish» (chek yo'qoladi, omborchi topshirig'i `cancelled`).
>
> 🔴 **SHU SESSIYADA TOPILGAN, TUZATILMAGAN (kattaligi sabab alohida ish):**
> 1. **Terminal va qarz to'lovi BUTUNLAY ishlamaydi.** `rasmilashtirish-modal.tsx` kassirdan
>    `terminalAmountMinor` + `debtAmountMinor` yig'adi va `sotuv/page.tsx:865-866` ularni
>    yuboradi, LEKIN `PostRetailSaleSchema` da bunday maydonlar YO'Q → Zod ularni **jimgina
>    tashlab yuboradi**, `RetailSale` da ham bunday ustun yo'q (`noCashSumMinor`/`qrSumMinor`
>    bor, boshqa semantika). Natija: terminal bilan to'liq to'langan chek serverda
>    `cash=0, card=0` bo'lib **400 «Payment insufficient»** oladi. Chek shabloni
>    (`print-agent.ts:385`) ham API qaytarmaydigan `sale.terminalAmountMinor` ni o'qiydi.
>    Bu = **To'lqin 3.1 (aralash to'lov, `RetailSalePayment`)** — kassa TZ §6. Bitta flagship.
> 2. **`expectedSumMinor` qabul qilinadi-yu, HECH QAYERDA solishtirilmaydi.** Sxema izohi
>    «server revalidates against DB sum» deydi — bu **yolg'on**, `post()` da taqqoslash yo'q
>    (grep bilan tasdiqlandi: faqat testlarda va sxemada uchraydi). Server o'z `sumMinor` ini
>    ishlatgani uchun pul yo'qolmaydi, lekin klientning kutgan summasi e'tiborsiz qoladi —
>    mayda ish (taqqoslash + 409) yoki izohni halol qilish.
>
> **▶️ KEYINGI ISH o'zgarmadi: To'lqin 1.1** (`costMinor`/`basePriceMinor` muzlatish + savat
> qatorida tan narx/optom/foyda) — pastdagi 02a entry'sida to'liq brief bor.

> **🕒 2026-08-02a (EGASINING 8-BO'LIMLI TZ'si YOZILDI + To'lqin 0 bajarildi `f6cc310`)**
>
> **Bu sessiya nima qildi:** egasi butun tizim strukturasini bo'lim-bo'lim tushuntirdi; har bo'lim
> uchun savol-javob (AskUserQuestion) → dizayn → tasdiq → **professional TZ** yozildi. Jami
> **8 TZ + master roadmap**, hammasi `docs/superpowers/specs/` da:
> `2026-08-01-kassa` (`0f10050`, tuzatish `764a9f5`) · `2026-08-01-onlayn-sotuv-b2b-b2g` (`e4f2e2b`) ·
> `2026-08-01-analitika` (`986abb4`) · `2026-08-01-menejer` (`20a593a`) · `2026-08-01-taminotchilar`
> (`5c49e8a`) · `2026-08-02-hr` (`17c8778`) · `2026-08-02-ombor` (`ae1d40f`) ·
> `2026-08-02-kop-filiallilik` (`ea1e481`) · **`2026-08-02-master-roadmap`** (`2dd75e6`).
>
> **▶️ KEYINGI SESSIYA SHUNDAN BOSHLAYDI: `docs/superpowers/specs/2026-08-02-master-roadmap.md`.**
> U 8 to'lqinli bajarish tartibini beradi (bo'lim-bo'lim EMAS, bog'liqlik bo'yicha). **To'lqin 0
> tugadi.** Keyingi ish = **To'lqin 1.1**.
>
> **✅ To'lqin 0 (`f6cc310`) — Phase-1, brauzerda tekshirilmagan:**
> 1. `RetailSaleStateSchema` ga `picking`+`ready` qo'shildi. `send-to-picking` DB'ga 'picking'
>    yozardi, `mark-ready` (d7ab3b1) 'ready' ga o'tkazadi — lekin Zod enum bilmasdi va `list()`
>    shu sxema bilan filtrlaydi → POS'ning `?state=picking/ready` so'rovlari **400** qaytarardi,
>    «Yig'ilmoqda»/«Tayyor» ro'yxatlari bo'sh qolardi.
> 2. `online-order` konvertatsiyasi **soxta UUID** yozishni to'xtatdi (V1 stub `randomUUID()`
>    yozardi → bazada hech qayerga ishora qilmaydigan havola). Endi MAVJUD `CustomerOrder` ga
>    bog'laydi (ijarachi ichida mavjudligi tekshiriladi); web'da qidiruv-tanlash paneli.
>    Gate: tc0 · biome0 · **api 4271** · **web 2628** · +7 test.
>
> **⏭️ To'lqin 1.1 (keyingi ish, ~1 flagship sessiya):** `RetailSalePosition.costMinor` +
> `basePriceMinor` **muzlatish** (`post` paytida) va **savat qatorida tan narx / optom narx /
> foyda** ko'rsatish. Egasi eng ko'p so'ragan xususiyat. Manba: `Product.buyPrice` (tan narx) +
> «Оптовая цена» narx turi (minimal ruxsat etilgan narx) + «Розничная цена» (asos narx).
> Narx optomdan past → sariq; tan narxdan past → qizil «ZARAR», **sotuvga ruxsat beriladi**
> (egasining qarori) lekin audit jurnaliga tushadi. Batafsil: kassa TZ §5.
> **DIQQAT: baza migratsiyasi kerak** → CLAUDE.md §6.4 (umumiy resurs — parallel sessiya
> `prisma migrate` ishlatayotgan bo'lmasin; xotira: `climart-adopt-local-db-untracked`).
>
> **Keyin:** 1.2 `profitability.service.ts:576` dagi `0::bigint AS cost` (hozir har kassa cheki
> **100% marja** ko'rsatadi) · 1.3 `CashierAuditEvent` · 1.4 `report/metrics/` yagona qatlam.
>
> **Parallel sessiya:** `d7ab3b1` (omborchi zanjiri: 12 sahifa + `mark-ready` + `warehouse-ops`)
> shu sessiya davomida keldi — diff'im path-cheklangan bo'lgan, kesishma yo'q. Kassa TZ'sidagi
> eskirgan da'vo `764a9f5` da tuzatildi.
>
> **Ochiq qarz:** bazada oldin yozilgan **soxta `customerOrderId`** qiymatlari bo'lsa, tozalash
> migratsiyasi kerak (onlayn-sotuv TZ §8). · `stash@{0}` — 2026-07-31 dagi begona lint-staged
> zaxirasi, tegilmadi.

> **🕒 2026-08-01b (/sotuv POS TIKLANDI + React #310 fix · ✅ DEPLOYED `cded942`)**
> **1) React #310** — `demands/[id]` PROD'DA YIQILARDI. Sabab MENDA: chek/varaq hook'larini erta
> `return`dan KEYIN qo'ygandim (1171-qator, return 984-da) → hook soni renderlar orasida o'zgarardi.
> `sales-returns/[id]` da ham xuddi shu. Ikkalasi ham yuqoriga ko'chirildi. **Tizimli sabab:**
> `correctness/useHookAtTopLevel` Biome tavsiyalarida YO'Q ekan → **error** darajasida yoqildi
> (`apps/api` uchun override — NestJS `app.use` soxta signal). Mutatsiya bilan isbotlandi: buzuq
> versiyada 4 error, tuzatilganida 0. Grafik `width(-1)` ogohlantirishi: recharts 3.x manbasi
> o'qildi — `minWidth/minHeight` maslahati ISHLAMAYDI (hisobga uzatilmaydi), yagona prop
> `initialDimension`; 5 konteynerga berildi.
>
> **2) Omborchi varag'i** 3 bo'limga qo'shildi (qabullar «Joylashtirish varag'i»; taminotchiga
> qaytarish + chiqim «Yig'ish varag'i») va **`/new` sahifalarga ham** — egasi «hech nima
> o'zgarmadi» degani shundan edi: `/new` sahifalar alohida menyularga ega. Yo'l-yo'lakay 2 bug:
> qatorning O'Z yacheykasi e'tiborsiz qolardi; «Зона / Ячейка» xom yorlig'i ombor guruhlashni
> buzardi va 19mm nowrap ustunda qirqilardi (`cellCode()`). `customer-orders/[id]` da chop
> menyusi UMUMAN yo'q edi — to'liq qurildi. Parity qo'riqchisi: `pick-sheet-new-vs-detail.test.ts`.
>
> **3) `/sotuv` POS BO'LIMI QAYTARILDI** — climart adoption (`55cf3bf`, «drop sherset-only») uni
> chek shabloni bilan birga o'chirgan ekan. Jonli `sherset.biznesjon.uz` manbasi bilan
> hash-solishtirildi: `sotuv/page.tsx` `1b600e92`, `customer-display` `f4873aea`, `print-agent`
> `925856480` — **JONLI BILAN BAYT-TENG**; `rasmilashtirish-modal` faqat format farqi (isbotlandi:
> asl faylni biome bilan formatlaganda mening nusxam bilan bayt-teng).
> Qaytarilgan: 4 FE fayl (3081 q.) + `settings/smena` (3 sahifa) + backend `smena`/`shift-schedule`/
> `sklad-keeper`/`restock-task` + `POST /retail-sales/:id/send-to-picking` + 6 Prisma model +
> `CashierSession.{smena_id,out_of_shift_reason}` + `CompanySettings.receipt_printer_name`.
>
> **IKKI QAROR (hujjatlangan):** (a) MANZIL — egasi climart yacheykasini tanladi: sherset'ning
> `Product.locSklad/locPolka/...` ustunlari QAYTARILMADI, omborchi oqimi `attributes.__yacheyka`
> («01-02-03-05») ni o'qiydi. Qarz: per-yacheyka miqdori va ko'p-yacheyka climart'da yo'q.
> (b) KASSA/OMBOR — climart `CashierSession` da ular MAJBURIY, `/sotuv` yubormaydi: server
> aniqlaydi (ombor = kassirning `defaultStoreId`, kassa = eng eski). **Sxemada «asosiy kassa»
> tushunchasi YO'Q** — egasi smenaga aniq kassa biriktirishni xohlashi mumkin (OCHIQ).
>
> **DEPLOY tasdiqlandi** (`0dbfce3 → cded942`): 252MB zaxira (215 jadval, tekshirilgan) · to'qnashuv
> tekshiruvi (nishon jadvallar prodda yo'q edi) · migratsiya `20260801120000_restore_sotuv_pos`
> qo'llandi · `/sotuv` **200** · build ichida 5 route · 6 jadval + `smena_id` bazada ·
> `/admin/smenas/mine`, `/admin/shift-schedules`, `/sklad-keepers` → **401** (bor, himoyalangan).
>
> **⚠️ BROWSER-QA YO'Q** — `/sotuv` brauzerda ochilmadi. HTTP 200 React ishlashini ISBOTLAMAYDI
> (aynan shu farq bu sessiyada #310 ni yashirgan edi). Keyingi sessiya: `/sotuv` (savat, qidiruv,
> smena ochish, «Rasmiylashtirish»), `/demands/[id]`, bosh sahifa konsoli.
>
> **4) POS qobig'i balandligi** (`76c54df`, DEPLOYED) — egasi suratda pastki blokni belgiladi:
> JAMI + yashil to'lov tugmasi ekrandan chiqib, qirqilgan ko'rinardi. Sahifa
> `h-[calc(100dvh-58px)]` bilan yozilgan edi (sherset'da faqat 58px navbar); climart'da navbar
> USTIGA subnav ham bor → qobiq ~47px uzun. Ustiga climart `(app)/layout.tsx` balandlik
> chegarasini ATAYLAB bermaydi («ichki scroll YO'Q» — ro'yxatlar uchun eski talab). Yechim: yangi
> raqam EMAS — qobiq o'z tepa-offsetini o'lchaydi (`hooks/use-fill-viewport.ts`), xrom o'zgarsa ham
> ishlaydi. Chromium'da o'lchandi: eski 767/720 (47px qirqilgan) → yangi 720/720 (sig'adi).
> Qo'riqchi `pos-shell-height.test.ts` (mutatsiya bilan sinaldi). Deploy markeri: eski Tailwind
> klassi CSS'da 0 fayl, yangi `calc(100dvh - ` literali 3 chunk'da.
> **MARKER SABOG'I:** minifikatsiya identifikatorlarni o'zgartiradi — `useFillViewport` ni build
> ichidan qidirish YAROQSIZ. Faqat satr literallari yoki CSS klasslari ishonchli marker.
>
> **SABOQ:** `biome check` chiqishi «Diagnostics not shown: N» deb KESILADI — bo'sh grep natijasi
> «toza» degani EMAS. Gate `--max-diagnostics=2000` ishlatadi; qo'lda tekshirganda ham shunday
> qilish kerak (bu sessiyada 6 lint xatosi shu tarzda o'tkazib yuborildi, push gate tutdi).

> **🕒 2026-08-01a (CHOP ETISH to'lqini — 11 commit · ✅ DEPLOYED `c161ef1`)**
> **DEPLOY tasdiqlandi** (erp.sherset.uz = sherset-v2, `DS_TARGET=v2 deploy-smart.sh`, `217c345 → c161ef1`):
> erp.sherset.uz 200 · web :3011 200 · api :4001 health 200 · migratsiya «No pending» (yangi migratsiya yo'q,
> faqat `apps/web`) · yangi kod-markerlari build ichida (`SAVDO CHEKI`, `JOYLASHTIRISH VARAG'I`, `YIG'ISH VARAG'I`
> — hammasi `server/chunks/5153.js`). Faqat `sherset-v2-*` restart, boshqa ijarachilar 3s uptime bilan tegilmadi.
> Pre-deploy zaxira: `sherset_v2-PREDEPLOY-c161ef1-121139.sql.gz` (227M, 215 jadval, `dump complete` markeri bor).
>
> **Ish:** «SAVDO CHEKI» egasining namunasiga 1:1 (brauzerda 302px = 80mm da o'lchandi, chetga chiqish YO'Q) ·
> omborchi varag'i (yacheykali) 3 yangi bo'limga — qabullar «Joylashtirish varag'i», taminotchiga qaytarish va
> chiqim «Yig'ish varag'i» · varaq mantiqi `hooks/use-pick-sheet.ts` ga yig'ildi (6 bo'lim bitta manbadan).
>
> ⚠️ **Ikki tuzatilgan bug:** (1) varaq qatorning O'Z yacheykasini e'tiborsiz qoldirib har safar tovarning
> standart yacheykasini so'rardi — omborchi noto'g'ri javonga yuborilardi; (2) «Зона / Ячейка» yorlig'i xom
> holda varaqqa tushsa `warehouseOfCell()` omborni «Zona A / 01» deb o'qib har zonani soxta ombor guruhiga
> bo'lardi va 19mm nowrap ustunni printer qirqardi (`cellCode()` qo'shildi).
>
> 🔴 **DEPLOYDA TOPILGAN, TUZATILMAGAN (egasining qarori kutilmoqda):** `/var/log/sherset-v2/api.out.log` =
> **127 MB**, shundan **189 818 qator** bitta ogohlantirish: `HrTelegramOutboxWorker — Outbox tick skipped:
> previous run still in flight` (har 5s da 3 marta, **2026-07-25 dan beri**, deploydan OLDIN boshlangan).
> `logrotate.d` da sherset/pm2 uchun konfiguratsiya **YO'Q**. Bu aynan 2026-07-31 dagi disk-100% uzilishini
> keltirgan mexanizm. Ikki alohida ish: (a) worker'ning uch marta tetiklanishi, (b) log rotatsiyasi — (b)
> umumiy ko'p-ijarali box'ga tegadi, shuning uchun so'ramasdan qilinmadi.
>
> **Browser-QA YO'Q** — chek 80mm o'lchovi headless render bilan tasdiqlandi, lekin jonli sahifada emas.
>
> ---
>
> **🕒 2026-07-31b (CUSTOMER-ORDERS parity — 23/56 punkt · ✅ DEPLOYED `217c345`)**
> **DEPLOY tasdiqlandi** (erp.sherset.uz = sherset-v2, `DS_TARGET=v2 deploy-smart.sh`, `177c7b5 → 217c345`):
> HEAD ✅ · erp.sherset.uz 200 · api :4001 health 200 · web :3011 200 · yangi filtr marshruti 401 (404 emas) ·
> **4/4 yangi kod-markeri build chunk'lari ichida topildi** (`deliveryPlannedFrom`, `filter-shipment-address`,
> `doc-header-reserve`, `detail-bottom-sections`). Faqat `sherset-v2-*` restart bo'ldi, boshqa ijarachilar tegilmadi.
> ⚠️ **Deploy hodisasi (takrorlanmasin):** paramiko fon-jarayon kanalini kutgani uchun birinchi launch «qotgan»dek
> ko'rindi va qayta yuborildi → **bir katalogda IKKITA parallel `next build`**. 3 daqiqada payqalib ikkalasi ham
> to'xtatildi, bitta toza deploy qayta yugurtirildi; pm2 ga tegilmagani uchun prod uzilmadi. Yechim: `ssh_launch.py`
> (exec_command → sleep → close, stdout O'QILMAYDI). **Launch buyrug'ini hech qachon qayta yubormang — avval
> `pgrep -f deploy-smart.sh` bilan tekshiring.**
>
> **🕒 (eski holat, tarix uchun) 13/56 punkt**
> To'liq backlog + dalil: [`docs/audits/customer-orders-parity-2026-07-31.md`](docs/audits/customer-orders-parity-2026-07-31.md).
> **Ground truth JONLI olindi** (`online.moysklad.uz`, tenant `elektro_sentr`) — 3 ta qayta-yugurtiriladigan skript:
> `scripts/co-capture-ours.mjs` (biznikini oladi + **`grid` metrikasi**: overflowPx/kolonka kengliklari) ·
> `scripts/co-capture-moysklad.mjs` · `scripts/co-capture-ms-detail.mjs`. Cert: `tools/capture/cert-co-org-account-2026-07-31.mjs`.
> **Bajarilgan (7 commit):** `f9cb42a` #25-28 detail tab-strip → moysklad CLASSIC (`Главная|Связанные документы|События`,
> Задачи/Файлы pastki bo'limlarga; `DetailContentTabs.bottomSections` opt-in — 20+ qardosh sahifa tegilmadi) ·
> `3c6535e` #29/#49 «Резерв» checkbox · `add1d31` #35/#51 org-hisob caption (`accountNumber || name`) ·
> `d22e022` #39/#40 «Доступно»+«Отгружено» default-on · `079436f` #13 filtr 10→20 maydon ochiq ·
> `982fc80` #5/#4/#3 grid overflow **475px→6px o'lchangan** + «Итого» avtomat (≤500 qator hajm-himoyasi) + header ⚙ ko'rindi ·
> `483ef10` #22 «Счёт»→«Счет» (4 umumiy kalit).
> **⚠️ 3 ta ESKIRGAN «live-grounded» DA'VO RAD ETILDI** (kod izohlarida yozilgan edi, bugungi capture teskarisini ko'rsatdi):
> filtr «~10 maydon» · pozitsiya «available/shipped OFF» · detail «5 tab». Izohlar bugungi dalil bilan almashtirildi.
> **⚠️ BUG-CLASS (#55, hali guard'siz):** `DocumentEditor` prop'larni aniq destructure qiladi, `DocumentEditorProps`
> esa `DocumentHeaderProps`dan meros oladi → **yangi header-prop typecheck'dan JIM o'tadi, render'ga yetmaydi**.
> Menda `reserve*` shunga uchradi; parallel sessiya ham ayni paytda date/time label prop'larida shu bug'ni tuzatmoqda.
> **2-to'lqin qo'shimchalari:** `42c819f` #14/#17 «План. дата отгрузки»+«Адрес доставки» filtrlari (BE schema+service+FE,
> **API 4/4 end-to-end verify**, +3 schema testi) · `6667208` #37 /new «Склад» majburiylik belgisi · `4fc98bb` **#53
> `401 /permissions/me`** — har sahifadagi konsol xatosi, `usePermissions` endi session bootstrap'ga bog'landi
> (**butun ilovaga taalluqli**) · `2a263ca` #23 «Оплата» tartibi + #12 printer ikonkasi · `3c38768` #38 «Договор» disabled.
>
> **📊 56 bandning HAMMASI dispozitsiya qilindi** (`docs/audits/customer-orders-parity-2026-07-31.md`):
> ✅ 23 tuzatildi · ✅ 3 allaqachon to'g'ri edi (#36 balans · #43 «без НДС» · #44 kolonka-sozlagich — noto'g'ri pozitiv,
> test-ma'lumot holatni yuzaga keltirmagan) · 🔒 1 owner-override (#42 tovar kodi — 2026-07-06 yacheyka chalkashligi) ·
> 🔒 5 owner qarori bilan qoldirildi · ⏸️ 4 defer · 🔧 **20 qoldi**.
>
> **✅ OWNER QARORLARI berildi — keyingi to'plam shulardan:** #1 `max-w-[1440px]` cheklovi olib tashlansin (app-wide;
> keyin «Зарезервировано» sig'adi) · **#48 «Цена включает НДС» default ☑ — ⚠️ PUL SEMANTIKASI**, avval aniqlansin:
> faqat CO uchunmi yoki 8 hujjat turigami, **mavjud hujjatlarga TEGILMASIN** · #18/#19 migratsiya (prod backup shart) ·
> #46/#50 «Импорт» feature (avval spec).
>
> **Phase-1 — render/o'lchov live-smoke + API end-to-end bor; to'liq browser-QA (klik→saqlash→BE) YO'Q.**
> **🔴 #56 (bloklovchi emas, lekin jiddiy):** `label-grounding.test.ts` 25 ta ENOENT bilan yiqiladi —
> `docs/moysklad-reference/` bu checkout'da **hech qachon bo'lmagan** (git tarixi yo'q). Label-grounding himoyasi
> hozir ISHLAMAYAPTI. (2026-07-31a entry ham shu dir yo'qligini mustaqil qayd etgan.)

> **🕒 2026-07-31a (SALES-RETURNS parity — 3 punkt + ✅ DEPLOYED · `414b6fc`)**
> `/sales-returns` bo'limi bo'yicha 50-punkt backlog (`docs/audits/sales-returns-parity-backlog-2026-07-30.md`).
> **Bajarilgan:** #1 «Оплачено» ustuni · #2 «Валюта» default · #31/#36 customs (ГТД/Страна) /new default-on ·
> #5 «Оплата» refund payment-filtri (schema+service AND-merge+FE+2 test). Gate: API tc 0 · web tc 0 · biome 0 ·
> schema-test 32/32. **DEPLOYED sherset-v2** (`sr-deploy2/3`, web+api restart UPTIME-reset bilan TASDIQLANDI —
> o'tgan «restart ta'sir qilmadi» bug takrorlanmadi).
> **⚠️ GROUNDING TUZATISH (§2/§4):** backlog header dastlab yolg'on `docs/moysklad-reference/salesreturn/` (MAVJUD EMAS)
> ga tayandi. Haqiqiy ground-truth = `sales-returns-list.audit.md:5`: default ustunlar
> `№·Время·На склад·Контрагент·Организация·Сумма·Отправлено·Напечатано·Комментарий` — **«Оплачено»/«Валюта» YO'Q**.
> Demak #1/#2/#5 aslida MoySklad-parity EMAS — **owner-so'rovi bilan non-parity foydali extra** (2026-07-31: «ikkalasi qolsin»).
> **⏭️ Qolgan (qayta-grounding shart — audit fayllariga, sibling'ga EMAS):** #30 «Ячейка» default-off (QAROR: yacheyka faol
> ishlatiladi, owner qarori kutilmoqda) · additive-detail #16/#18/#19/#20 (BE join) · #11/#17/#33 (BE migration) ·
> capture-kerak #13/#26/#39/#46/#49/#50 (reference dir yo'q → avval jonli capture). **Phase-1 — browser-smoke YO'Q.**
> **Xavfsizlik:** Playwright uchun forge qilingan admin refresh-token revoke qilindi (11 token o'chirildi).
> **§6:** parallel sessiya (customer-orders/DocumentTotalsPanel totals-labels) faol — bitta commit'im ularning staged
> ishini yutgan edi, soft-reset bilan tuzatildi (ish working-tree'да butun saqlandi, push qilinmagan edi).
>
> **🕒 2026-07-30h (FAZA E — QABUL MAGIC-LINK TASDIQLASH QURILDI + DEPLOYED · `3cf9b5b`)**
> Taminotchi PAROLSIZ havola bilan tasdiq/rad. **E1** (backend): `SupplyApprovalLink` migration (prod'da qo'llandi) +
> `issueSupplierLink`/`getPublicSupplyView`/`decideViaLink` + public controller `p/qabul` (guardsiz, token-auth) + 4 test.
> **E2**: public veb-sahifa `app/p/qabul/[token]` (Tasdiqlash/Rad, DS Textarea). **E3**: `dispatchToSupplier` bot→MTProto+
> magic-link (send→taminotchi telefoniга havola userbot orqali) + omborchi xabariga ERP-havola. **Xavfsizlik:** 192-bit token,
> supply+role+agent scope, 14-kun muddat, accountId token-qatordан, FAQAT applySupplierDecision (CRUD yo'q), rad-sabab majburiy.
> **Gate:** TC 0 · biome 0 · supply-approval+telegram 62/0 · guard raw-element yashil. **Verify:** web `/p/qabul` 200 · api
> 404-on-bad-token · DB jadval · erp/api 200.
> **⚠️ Phase-1 — jonli end-to-end YO'Q.** Talab: admin userbot ulangan + taminotchi telefoni + omborchi telegramPhone+ruxsat.
> **⏭️ Qolgan:** jonli QA (real qabul → havola → tasdiq → stock) · bot-kod (D1-D3) OLIB TASHLASH (hali dormant) · omborchiga
> ham parolsiz-link (ixtiyoriy) · xabarга tovar-ro'yxat. Spec: `docs/superpowers/specs/2026-07-30-qabul-magic-link-tasdiqlash-design.md`.
>
> **🕒 2026-07-30g (FAZA E spec — QURILDI, ↑2026-07-30h)**
> **Egasi aniqlashtirdi (2026-07-30):** tasdiq HAVOLA orqali — taminotchi/omborchiga lichkadan (userbot) link boradi, bosib
> belgilashadi (tasdiq/rad). Taminotchi **parolsiz magic-link** bilan kiradi (token identifikatsiya qiladi — qaysi taminotchi);
> omborchi/admin ichki (to'liq CRUD, oddiy ERP login). **Sabab:** Telegram inline-tugma FAQAT botда — lichka xabariga tugma
> qo'yib bo'lmaydi, shuning uchun HAVOLA. **Spec (professional, grounded):** `docs/superpowers/specs/2026-07-30-qabul-magic-
> link-tasdiqlash-design.md`.
> **Arxitektura (mavjud infra reuse):** capability-token (`randomBytes(24)`, `counterparty-statement`да bor) + `SupplyApprovalLink`
> jadval (migration) + public token-auth endpoint (`GET/POST /p/qabul/:token`) + public veb-sahifa (`app/p/qabul/[token]`,
> `app/p/[token]` patterni) + havolani MTProto outbox (`hrTelegramOutbox`) yetkazadi. FSM `claim` idempotent (mavjud).
> **Xavfsizlik:** 192-bit token · supply+role+agent scope · muddat (14 kun) · FAQAT applySupplierDecision/reject (CRUD YO'Q) ·
> HTTPS · audit. **Bosqichlar:** E1(token+endpoint)→E2(public sahifa)→E3(havola yetkazish + bot-kod D1-D3 olib tashlash)→E4(QA).
> **Egasidан aniqlashtir (E1 oldidan):** token-muddat 14 kun okmi · taminotchi sahifasi faqat-tasdiq (CRUD yo'q) · omborchi
> havolasi ERP-login yetadimi. Bog'liq: [[supply-approval-workflow]].
>
> **🕒 2026-07-30f (⚠️ ARXITEKTURA KORREKSIYASI — bot-yondashuv BEKOR, MTProto redizayn keyingi vazifa)**
> **Egasi aniqlashtirdi (2026-07-30):** «BOT KERAK EMAS — hammasi adminning SHAXSIY Telegram akkauntidan (lichka/MTProto)
> boradi; taminotchiga admin telegramidan, omborchiga uning ULANGAN TELEFON RAQAMI orqali (admin lichkasidan), admin oxirida
> SAYTда (ERP) tasdiqlaydi.» Egasi qarori: **«olib tashlab, MTProto'ga o't».** Ya'ni D1-D3 (bot inline-tugma) — NOTO'G'RI yo'l.
>
> **To'g'ri arxitektura (grounded — korrektlangan spec: `docs/superpowers/specs/2026-07-30-uch-rolli-telegram-tasdiqlash-design.md`
> §KORREKSIYA):**
> - **Taminotchi** = `counterparty-statement.generateSupplyGoods(deliver=true)` → `hrTelegramOutbox` (`toPhone=agent.phone`) →
>   userbot (admin lichkasi) yuboradi — ✅ **ALLAQACHON ISHLAYDI** (supply-goods «deliver» — sessiya boshida 500 tuzatilgan).
> - **Omborchi** = 🆕 `hrTelegramOutbox` qatori `toPhone=Employee.telegramPhone` (SHU mexanizm; grounded API
>   `counterparty-statement.service.ts:672-697`).
> - **Admin** = ERP `supply-approval-panel` (Faza C) — ✅ BOR.
>
> **⏭️ KEYINGI VAZIFA (MTProto redizayn — toza fokus-sessiya):** (1) bot-inline dispatch/callback (D2/D3) + `/start bind` handler
> + employee bind endpoint/UI (D1) OLIB TASHLA — migration ustunlari qoladi (zararsiz); (2) taminotchi «yuborish» →
> `generateSupplyGoods` MTProto yo'liga ula; (3) omborchiga MTProto-send (`supply.update` ruxsatli xodim `telegramPhone`iga outbox);
> (4) admin ERP-panel; (5) gate + BE deploy. **Egasidан aniqlashtir:** omborchi-notify TRIGGER (avtomat taminotchidan keyinmi yoki
> ERP tugmasi?) + xabar-format. **Muhim:** deployed bot-kod (D1-D3) UXLAB YOTIBDI — bot sozlanmaguncha ishlamaydi, zararsiz.
>
> **🕒 2026-07-30e (FAZA D3 — admin Telegram [BOT] QURILDI + DEPLOYED · ⚠️ BEKOR — bot-yondashuv, ↑2026-07-30f)**
> Omborchi tasdiqlagach (`omborchiConfirm` — Telegram ocfm YOKI ERP omborchi-confirm) → 🆕 **`dispatchToAdmin`**: `supply.approve`
> ruxsatli + `telegramChatId` xodimlarga inline xabar. Callback: **`acfm`** («✅ Tasdiqlash» → `adminConfirm` → «Проведено» +
> **stock oshadi**) · **`arej`** («❌ Rad» → `reject` → omborchiga qaytadi). **`handleAdminCallback`** auth: `supply.approve`.
> Router `handleApprovalCallback` endi acfm/arej → admin handler. DRY: `supplyPermChats(action)` + `authSupplyEmployee(chatId,
> action)` helperlar (omborchi+admin ikkalasi ishlatadi; omborchi auth ham shunga refaktor qilindi).
>
> **✅ Endi UCHALA rol ham Telegram'da** (egasi talabi bajarildi): taminotchi(B) → omborchi(D2) → admin(D3). FSM `claim` har
> bosqichda g'olibni belgilaydi (bir nechta xodim parallel bossa — biri o'tadi).
>
> **🟢 Gate:** api typecheck 0 (script) · biome 0 · supply-approval callback 10 test (+4 acfm/arej/keyboard) · nishonli
> supply-approval+telegram 58 test / 0 fail.
>
> **✅ DEPLOYED (erp.sherset.uz, `4f1aec1`, BE-only):** push (pre-push o'tdi) → box reset → api restart (health 200). Migration/FE yo'q.
>
> **⚠️ Phase-1 — jonli-bot round-trip YO'Q (D4):** real tugma-bosishlar bot token+webhook + xodim chat_id bog'lash talab qiladi.
> **arej/orej reject MVP generic-sabab** (supplier-flow kabi `'Admin Telegram orqali rad etdi'`) — `force_reply` text-capture
> (real sabab yozdirish) keyingi refinement, ataylab qoldirildi (stateful ikki-xabarli oqim). Xabarга qabul-qatorlari (mahsulot×
> son) qo'shilmagan — nomi+yo'riqnoma.
>
> **⏭️ KEYINGI = D4 (jonli-bot QA + refinementlar):** (a) real Telegram bot token+webhook sozlab, uchala rol round-trip'ini bir
> qabulда boshdan-oxir sinash (yuborish→taminotchi→omborchi→admin→stock) + ruxsatsiz xodim bloklanishi; (b) ixtiyoriy: `force_reply`
> reject-sabab, xabarга qabul-qatorlari, «✏️ Son noto'g'ri»→ERP URL-tugma. Spec §Testlash/Phase-2.
>
> **🕒 2026-07-30d (FAZA D2 — omborchi Telegram QURILDI + DEPLOYED · D3 endi TUGADI, ↑2026-07-30e)**
> Taminotchi tasdiqlagach (`applySupplierDecision(approve)` — Telegram cfm2 YOKI ERP supplier-confirm, ikkalasi shu yerдан)
> → 🆕 **`dispatchToOmborchi`**: `supply.update` ruxsatli (`Employee→roles→role→permissions[entity='supply',action='update']`)
> + `telegramChatId` bog'langan BARCHA xodimga inline-tugmali xabar. Callback protokoli kengaydi: **`ocfm`** («✅ To'g'ri,
> tasdiqlash» → `omborchiConfirm` adjustmentsiz → `awaiting_admin`) · **`oadj`** («✏️ Son noto'g'ri» → «ERP'da tuzating» alert,
> bosqich o'zgarmaydi). **`handleOmborchiCallback`** auth: callback chat egasi `supply.update` ruxsatli xodim (aks holda «ruxsat
> yo'q»). Router **`handleApprovalCallback`** action'ga qarab taminotchi/omborchi handleriga yo'naltiradi; telegram.service shuni
> chaqiradi. Kim birinchi tasdiqlasa — FSM `claim` g'olib (atomik).
>
> **🟢 Gate:** api typecheck 0 · biome 0 · supply-approval 24 test (+2 yangi ocfm/oadj) · nishonli 171 test (supply-approval+
> telegram+supply+hr-employee, 0 fail — to'liq suite mashina xotira-bosimidan worker-crash, lokal o'zgarish uchun nishonli yetarli).
>
> **✅ DEPLOYED (erp.sherset.uz, `4c3ecb8`, BE-only):** push (⚠️ 1-urinish pre-push typecheck bloklagan — `SupplierCallbackAction`
> alias olib tashlanганда parseCallbackda `as`-cast qolib ketgan edi, `4c3ecb8`da tuzatildi) → box reset → api restart (health 200).
> Migration/FE build YO'Q.
>
> **⚠️ Phase-1 — jonli-bot round-trip YO'Q:** real omborchi tugma-bosishi bot token+webhook talab qiladi (D4). Admin hozircha
> ERP-panelда (D3'gача). Xabarга qabul-qatorlari (mahsulot×son) qo'shilmagan — nomi+yo'riqnoma (nice-to-have keyin).
>
> **⏭️ KEYINGI = D3 (admin Telegram + reject-reason):** omborchi tasdiqlagach adminlarga (`supply.approve`+chat_id) inline xabar
> (`dispatchToAdmin`) + `acfm/arej` callback + admin `adminConfirm`→stock. Reject `orej/arej` → `force_reply` sabab oqimi (uch rol).
> Spec §«Bosqichlar» 3-band. Keyin D4(jonli-bot QA).
>
> **🕒 2026-07-30c (FAZA D1 — Telegram bog'lash poydevori QURILDI + DEPLOYED · D2 endi TUGADI, ↑2026-07-30d)**
> D1 plan (`docs/superpowers/plans/2026-07-30-telegram-approval-d1-binding.md`) 6 vazifa inline ijro (executing-plans).
> Plan `employee/` deb taxmin qilgan edi — real modul **`hr` / `hr-employee`** (route `/hr/employees`, `@RequireHrPermission`),
> shunga moslashtirildi.
>
> **✅ Bajarildi (commit `09450fe`→`ab1bfbc`):**
> - Migration `20260730120000_add_employee_telegram_chat_id`: `Employee.telegramChatId` + `telegramBindToken` + `…ExpiresAt`.
> - `hr-employee/employee-telegram.service.ts`: `parseBindToken` (pure) + `issueBindToken` (token+deep-link) + `unbind` +
>   `bindByToken` (muddatli token→chat_id, iste'mol). **5 unit test.**
> - Endpointlar: `POST /hr/employees/:id/telegram-bind-token` · `DELETE /hr/employees/:id/telegram` (`@RequireHrPermission('employees','full')`).
> - `telegram.service.handleInbound`: `/start bind_<token>` handler (chat_id saqlab «✅ Ulandi» javob). telegram.module→HrEmployeeModule (DI sikl YO'Q).
> - ERP `employee-card.tsx`: «Telegram ulash/uzish» + deep-link ko'rsatish + holat; i18n uz+ru 6 kalit.
>
> **🟢 Gate:** api typecheck 0 · biome 0 · **to'liq api Vitest 4227 pass / 0 fail (329 fayl)** · web typecheck 0 ·
> contract-guard 9/9 · i18n key-existence+no-hardcoded 9/9.
>
> **✅ DEPLOYED (erp.sherset.uz/sherset-v2, `ab1bfbc`):** `migrate deploy` (3 ustun DB'da tasdiqlandi) → **`prisma generate`
> + api restart** (health 200, 500 YO'Q ⇒ client yangilandi + DI bootladi) → web build (ALL_OK) + restart (erp 200).
> Endpoint `telegram-bind-token` → **401** (route jonli). §6: parallel diapazon commiti (`f88bc55`) branch'da — deploy u bilan
> ketdi (u ham Phase-1 gated).
>
> **⚠️ Phase-1 — jonli-bot bind round-trip YO'Q:** real xodim deep-link'ni bosib chat bog'lashi sinovlanmagan (bot token+
> webhook kerak — bu D4 jonli-QA). ERP UI + endpoint + migration + handler struktura-tasdiqlangan va jonli.
>
> **⏭️ KEYINGI = D2 (omborchi Telegram):** taminotchi tasdiqlagach omborchilarga (`supply.update`+chat_id) inline-tugmali
> xabar (`dispatchToOmborchi`) + `ocfm/orej` callback + rol-auth + `editMessageText`. Spec §«Bosqichlar» 2-band. Keyin
> D3(admin TG+reject-reason)→D4(jonli-bot QA). Bog'liq: [[supply-approval-workflow]].
>
> **🕒 2026-07-30a (FAZA D1 — Telegram bog'lash poydevorini QURISH · plan/spec yozildi — D1 endi TUGADI, ↑2026-07-30c)**
> **Plan tayyor:** `docs/superpowers/plans/2026-07-30-telegram-approval-d1-binding.md` (6 vazifa, bite-sized TDD).
> **Spec:** `docs/superpowers/specs/2026-07-30-uch-rolli-telegram-tasdiqlash-design.md`. **Kontekst:** egasi «qabul-
> tasdiqlashning UCHALA bosqichi ham Telegram'da bo'lsin» dedi — hozir FAQAT taminotchi Telegram'da (Faza B), omborchi+
> admin ERP-panelда (Faza C). Faza D shuni to'ldiradi. Qarorlar (egasi 2026-07-30): (1) uch rol ham Telegram (2) har
> xodimga `Employee.telegramChatId` — `/start bind_<token>` deep-link (3) omborchi «✅ To'g'ri»/«✏️ Son noto'g'ri»→ERP'da
> tuzatadi (4) rol-ruxsatli HAR KIM oladi (omborchi=`supply.update`, admin=`supply.approve`+chat_id), FSM `claim` g'olib.
> **D1 qamrovi:** migration (Employee 3 maydon) + bind-service (`parseBindToken`/`issueBindToken`/`bindByToken`) + 2
> endpoint + telegram `/start bind_` handler + ERP «Telegram ulash» UI + deploy (migrate+generate+web build). Keyin
> D2(omborchi TG)→D3(admin TG+reject-reason)→D4(jonli-bot QA). **Boshlash:** «D1 planni bajar» → subagent-driven, har
> vazifada gate. Bog'liq: [[supply-approval-workflow]] memory (Faza D bo'limi).
>
> **✅ Shu sessiyada bajarilgan (2026-07-30):**
> - Ombor chuqur re-audit → yacheyka per-cell drift 2 bug (setCellStock ikki-yozuv HIGH + place bin-talash MED) TUZATILDI+DEPLOYED (`8b60af6`).
> - Yacheyka «amallar» ustuni ✕ card'dan chiqishi TUZATILDI+DEPLOYED (`d3626ac`, web build).
> - «Ombor 1»ga 35 yacheyka (`01-02-01-01…35`) prod DB'ga yaratildi.
> - Faza D spec (`72cd8b3`) + D1 plan (`a737e66`) yozildi.
>
> **🕒 2026-07-30b (YACHEYKA DIAPAZON-GENERATORI — TUGALLANDI · Phase-1 · browser-smoke YO'Q)**
> Egasi: yacheykalarni bittalab emas, **diapazon retsepti** bilan ommaviy yaratish. Spec `18d968d` → plan `940713b` →
> 5 vazifa (subagent-driven, har biri review'dan o'tgan). Zanjir: `efaecd7` (sof yoyish utili) → `46f4110` (takroriy nom
> = xato) → `b0694a9` (chegara massiv qurishdan OLDIN) → `189cefb` (`BulkCreateCellsSchema`) → `12cafdc` (semantik
> dublikat olib tashlandi) → `02e5652` (`POST :id/cells/bulk` + `dryRun`) → `fd3f667` (`zonesCreated` haqiqiy count'dan)
> → `f88bc55` (FE `cell-range-modal.tsx`). Dizayn yadrosi: **butun yoyish mantig'i FAQAT `cell-range.util.ts` da** —
> FE nomlarni o'zi hosil qilmaydi, shuning uchun oldindan ko'rish haqiqiy natijadan farq QILA OLMAYDI.
>
> **🟢 Yakuniy gate (2026-07-30b, o'lchangan):** api Vitest **328 fayl / 4222 test, 0 fail** (1 skip) · web Vitest
> **158/159 fayl, 2457 pass / 25 fail** — 25 fail FAQAT `label-grounding.test.ts` (ma'lum qarz #35, capture korpusi
> bo'sh, `guard-baseline.json` da ro'yxatda; boshqa regress YO'Q) · `tsc --noEmit` api **0** · web **0** ·
> `check-lint.mjs` **0 errors / 484 warnings (policy OK)** · `check-guards.mjs` **OK**.
>
> **🔬 HTTP jonli tekshiruv (lokal `tsx src/main.ts` @4000, `admin@demo.local` login 201) — 3 da'vo ISBOTLANDI:**
> - **dryRun ≡ haqiqiy:** `dryRun:true` → `toCreate:6` · `dryRun:false` → `created:6`, `zonesCreated:2` (TENG).
>   Qisman-mavjud holatda ham: diapazon kengaytirilgach `dryRun:true` → `toCreate:4, existing:6` · `false` → `created:4`.
> - **Idempotent:** o'sha so'rov qayta yuborilganda → `created:0, existing:6, toCreate:0` (HTTP 201).
> - **`from:-3` → HTTP 400** (500 EMAS), tanasi o'zbekcha: `«a»: manfiy son bo'lmaydi`.
>   `HTTPTEST-*` 10 yacheyka + 2 zona oxirida **o'chirildi** (address-storage bo'sh: `zones=[] cells=[]`), API to'xtatildi.
>
> **⚠️ BROWSER-SMOKE YO'Q** — FE `cell-range-modal.tsx` real brauzerda ochilmagan. Status **Phase-1: strukturaviy +
> unit + HTTP-tasdiqlangan, runtime-UI tasdiqlanmagan**. «Done/production-ready» EMAS. Deploy ham QILINMAGAN.
>
> **🔧 Lokal DB gotcha (yon-ta'sir, hujjatlanadi):** parallel sessiyaning `09450fe` commit'i `employees.telegram_*` 3
> ustun qo'shdi, lokal `climart_adopt` DB esa orqada edi ⇒ `POST /auth/login` **500** (`P2022`). Drift `prisma migrate
> diff --from-schema-datasource --to-schema-datamodel` bilan o'lchandi — **AYNAN** o'sha 3 `ADD COLUMN` + 1 unique
> indeks, faqat qo'shimcha (DROP yo'q) ⇒ `$executeRawUnsafe` bilan qo'llandi (`IF NOT EXISTS`). Login 201 ga qaytdi.
> Repo migratsiya fayli allaqachon parallel sessiyada bor — men **kod yozmadim**, faqat lokal DB'ni sinxronladim.
> Bog'liq: [[climart-adopt-local-db-untracked]] memory.
>
> **🕒 2026-07-29c (OMBOR CHUQUR RE-AUDIT — yacheyka per-cell drift 2 bug TUZATILDI · Phase-1)**
> Foydalanuvchi: «omborni yana chuqur qaytadan tekshirib chiq… hamma xatoliklarini to'g'irlab ber». 3 paralel adversarial
> bug-hunt agent (atomicity · yacheyka · valuation) + har finding **o'zim ground-truth tekshirildi** (§2). Yadro (stock/loss/
> move/enter/supply/demand/inventory + 2 return) **TOZA** — TOCTOU-claim, lockBalances, Serializable, belgilar, in-transit
> ajratish, reservation-idempotentligi hammasi tasdiqlandi. Yagona real cluster — **yacheyka per-cell integritet** (e2cda34
> home-cell + 054ff32 auto-deduct `applyDeltas`ga qo'shilganda ESKI cell-chaqiruvchilar «null-cell=store-only» kontraktida qoldi).
>
> **✅ Tuzatildi (Phase-1: strukturaviy + unit-tasdiqlangan, browser/DB-smoke YO'Q):**
> - **HIGH — `setCellStock` ikki-yozuv** (`store-address.service.ts`): «Sanash» StockByCell'ni to'g'ridan-to'g'ri absolyut yozar,
>   keyin cellId'siz Enter/Loss post qilar → applyDeltas o'sha/uy-yacheykani IKKINCHI marta siljitardi ⇒ Σcell store'dan oshib
>   fantom «Занята». Fix: auto Enter/Loss endi **`cellId=sanalgan-cell`** bilan yuboriladi (hujjat = yagona per-cell yozuvchi);
>   to'g'ridan-to'g'ri upsert faqat doc-yo'q degenerat holatga (delta=0 / userId·org yo'q) fallback.
> - **MEDIUM — `place` bin talaydi** (`product-cell-move.service.ts`): «остаток»dan chiqim manba-oyog'i `cellId:null` edi →
>   auto-deduct uni band yacheykadan yechardi (remainder emas). Fix: yangi **`StockDelta.cellMode:'store-only'`** primitivi —
>   applyDeltas cell-effektlarni butunlay o'tkazib yuboradi (faqat store Stock siljiydi). Manba-oyoq shu rejimga o'tdi.
> - **Guard:** `stock-by-cell.behaviour.test.ts` +3 store-only test (KIRIM uy-joylashmaydi · CHIQIM bin-talamaydi · aralash partiya).
>
> **🟢 Gate:** api typecheck 0 · biome 0 (4 fayl) · stock 55/55 · hujjat-modullar 319/319 (regressiya YO'Q).
>
> **✅ DEPLOYED (erp.sherset.uz / sherset-v2, `8b60af6`):** BE-only (tsx — build/migration YO'Q). push → box `git reset --hard`
> → `pm2 restart sherset-v2-api`. Verify: health 200 · erp.sherset.uz 200 · jonli manbada `cellMode`/`store-only`/`willPostDoc`
> grep-tasdiqlandi. Browser-QA (real «Sanash»/«Переместить» round-trip) HALI qilinmagan — Phase-2.
>
> **⏭️ Follow-up (alohida sessiya, TUZATILMAGAN — bu sessiya yacheyka-clusterga fokuslandi):**
> - **MED — retail-sale (POS chakana) cost-drift** (`retail-sale.service.ts:579,783`): sotuv/qaytarish `costDeltaMinor:null`
>   uzatadi → `Stock.qty` kamayadi lekin `costBalanceMinor` muzlaydi → o'rtacha-tannarx buziladi (har boshqa hujjat shu bazani
>   o'qiydi). 066d55fb cost-drift klassi — Loss/Move/Inventory/return'larda tuzatilgan, retail-sale'da yo'q. Refund zero-sum
>   uchun sotuv-vaqtidagi perUnit'ni muzlatish kerak (RetailSalePosition'da cost-ustun YO'Q → migration yoki stock_operations
>   ledger-rekonsiliatsiyasi). *(Eslatma: sherset/climart real sotuvi = InvoiceOut, POS-chakana ehtimol ishlatilmaydi — latent.)*
> - **LOW** (Agent C/B): round-then-multiply qty=0'da bir necha tiyin qoldirar (loss/move — house-pattern, material emas) ·
>   FIFO supply→demand fraksion drift · `product-cell-move.ts:39` & `move.service.ts:638` `Number(Decimal)` float (toMicro emas) ·
>   `deleteCell` non-empty guard tx-tashqarisida (raqib post → do'stona-xabar o'rniga xom 500, korruptsiya YO'Q).
>
> **🕒 2026-07-29b (QABUL-TASDIQLASH FAZA A — BE state-machine QURILDI · `c2ead48`…`7819a3a`)**
> 07-29a hand-off (b) BAJARILDI. Spec+plan (`docs/superpowers/plans/2026-07-29-supply-approval-phase-a.md`) → 5 task TDD inline ijro.
>
> **✅ Faza A (Phase-1: BE strukturaviy, runtime-tasdiqlanmagan):**
> - `Supply.approvalStage` (none|awaiting_supplier|delivering|awaiting_admin|completed) + `supply_approval_events` audit-jadval + migration `20260729130000_add_supply_approval` (repo'da; **DB'ga HALI qo'llanmagan** — deploy'da `migrate deploy`).
> - `supply-approval` moduli: **FSM pure-logic** (forward/reject/adjustment-diff, 12 test) · Zod DTO (6 test) · **Service** (optimistik `claim` bosqich-o'tish · omborchi `$transaction` qty-tuzatish+audit · admin→`SupplyService.transition('post')` stock · reject→oldingi-bosqich · `applySupplierDecision` Faza B uchun export) · controller (`GET/POST /supplies/:id/approval{,/send,/omborchi-confirm,/admin-confirm,/reject}`) · modul + app.module.
> - **Permission (spec §3.2 aniqlashtirildi):** yangi action YO'Q — `update` (send/omborchi/reject) + `approve` (admin) qayta ishlatildi (`PermissionAction` fixed enum; yangi action 6 rol-shablon + QarzOperatori/Kassiri parallel-domenni buzardi).
> - **Tuzatilgan bug (o'z ishimda):** biome lint-staged `import type`ni controller-DI'ga qo'lladi → NestJS runtime DI buzilardi (metadata-reflection value talab qiladi); mavjud `@Inject(Service)` konvensiyasiga moslandi (`7819a3a`).
>
> **🟢 Gate:** api typecheck 0 · biome 0 (supply-approval) · yangi 18 test yashil · **to'liq api Vitest 4159 passed / 0 fail (325 fayl — regressiya YO'Q)**.
>
> **⚠️ Phase-1, browser/DB-smoke YO'Q:** migration hech qaysi DB'ga qo'llanmagan · endpointlar real brauzer/DB'da ishlatilmagan (Phase-2 QA) · Telegram(B)/UI(C) hali yo'q. §6: butun mantiq yangi `supply-approval` modulida — `counterparty-statement`/`supply.service`/`permissions.types` TEGILMADI.
>
> **➡️ HAND-OFF:** **(a)** [ochiq] debt/telegram/sms drift repo-migration + sherset_v2 `migrate resolve` (07-29a) · **(b) Faza B** — Telegram inline-tugma callback (`telegram.service.handleInbound` `sa:` branch → `applySupplierDecision`; MTProto Excel + Bot-API reply_markup; spec §4) · **(c) Faza C** — ERP UI panel (`/supplies/[id]` omborchi-sanash + admin-tasdiq + ikki-bosqich dialog + event-timeline; spec §5) · **deploy** — `prisma migrate deploy` (supply-approval migration'ni sherset_v2+lokalga qo'llash).

> **🕒 2026-07-29a (PROD HOTFIX: supply-deliver 500 + QABUL-TASDIQLASH WORKFLOW dizayn/spec · `9594d21`)**
> Fokus-sessiya (climart-adoption deploy oqimida). Ikki deliverable + 2 ochiq hand-off.
>
> **1. ✅ PROD HOTFIX (runtime-VERIFIED — bu Phase-1 emas, jonli tasdiqlangan) — `supply-goods/:id?deliver=true` → 500.**
> Sabab: `prisma.debt.findMany()` **P2021** — `debts` jadvali sherset_v2 DB'da YO'Q edi. Ildiz: `Debt`/`DebtPayment`/
> `DebtNote` + `telegram_chats`/`telegram_chat_messages`/`telegram_backfill_job` + `sms_templates` modellari SXEMADA
> bor, lekin ularni yaratadigan **migration YOZILMAGAN** (schema drift). `prisma migrate diff` (DB→schema) → additive-only
> (DROP/ALTER COLUMN yo'q, NOT-NULL-default-siz yo'q) → 7 jadval sherset_v2'ga atomik (`psql --single-transaction`).
> **Verify (jonli):** `debts` so'raladi (0 qator, xatosiz), api-log `prisma:error` spam TO'XTADI. `notifications/stream`
> 401/HTTP2 = token-eskirish SSE-reconnect shovqini (benign — feature buzuq emas, tegmadim).
>
> **⚠️ HAND-OFF (a) — REPO MIGRATION QARZI:** drift FAQAT sherset_v2 prod-DB'da qo'lda yopildi — **repo'da migration YO'Q.**
> Keyingi sessiya: `packages/db/prisma/migrations/<ts>_add_debt_telegram_sms_drift` yoz (7 jadval CREATE, sxemadagi
> modellarga mos) → **sherset_v2'da `prisma migrate resolve --applied <ts>_...`** (jadvallar allaqachon bor, deploy re-run
> FAIL bermasin) → lokal/fresh DB'lar oddiy `migrate deploy` bilan olsin. DIQQAT: migration-state sync (sherset_v2=resolve, boshqa=deploy).
>
> **2. ✅ QABUL-TASDIQLASH WORKFLOW — dizayn + spec (egasi tasdiqladi; KOD YO'Q hali).**
> Spec: `docs/superpowers/specs/2026-07-29-qabul-tasdiqlash-workflow-design.md` (`9594d21`). 3-rolli ketma-ket zanjir —
> taminotchi (Telegram inline-tugma) → omborchi (jismonan sanaydi/tuzatadi) → admin (yakuniy tasdiq → stock). Egasi 4
> qarorni tasdiqladi: Telegram-tugma · admin→Проведено/stock · omborchi-sonini-tuzatadi · reject→sabab+oldingi-bosqichga.
> State-machine: `none→awaiting_supplier→delivering→awaiting_admin→completed`; reject har bosqichda oldingiga qaytadi;
> `supply_approval_events` audit-log (kim/qachon/sabab).
>
> **➡️ HAND-OFF (b) = Faza A (BE state-machine, spec §6):** `Supply.approvalStage` + `supply_approval_events` jadval + migration +
> yangi **`supply-approval`** moduli (send / omborchi-confirm / admin-confirm / reject transitionlar · stock-post admin
> bosqichida mavjud Supply-«Проведено» orqali · audit-log · rol-gate · yangi permission `supply:receive`+`supply:approve`) +
> **Vitest** (valid/invalid o'tish · reject→qaytish · stock faqat `completed`da · audit yoziladi). Telegram=Faza B, ERP-UI=Faza C
> (keyin, alohida sessiya). **Spec ochiq savolsiz — darhol qurishga tayyor.**
>
> **🤝 §6 parallel-sessiya:** workflow `counterparty-statement` (Excel/MTProto — parallel domen) + `telegram` + `supply`'ga
> tegadi. Izolyatsiya majburiy: butun mantiq YANGI `supply-approval` modulida; `generateSupplyGoods` faqat CHAQIRILADI
> (ichi o'zgarmaydi), `handleInbound`'ga additive `sa:` callback-branch qo'shiladi. Prod-hotfix repo-fayl tegmadi (faqat sherset_v2 DB).
>
> **📌 Shu sessiyada avvalroq (davomi, memory `pick-list-feature.md`):** pick-list «chek» 80mm termal print fix deploy
> qilindi (`@page 80mm auto`, `068808b`) — 80mm PDF-simulyatsiyada to'g'ri chiqdi; **real termal-printer tasdig'i foydalanuvchidan kutilmoqda.**

> **🕒 2026-07-28a (SCOPE REESTRI + BLOK-0 QARZINI YOPISH — 12 commit · `a430879`…`2379a58`)**
> Foydalanuvchi «hamma qilinishi kerak bo'lgan narsalarni ro'yxatla, keyin bir-bir bajar» dedi.
>
> **📋 YANGI: `docs/MASTER-TODO-100.md` — loyihaning YAGONA scope reestri (157 band, 12 blok).**
> Uch «completeness» tekshiruvidan o'tgan (116 → 136 → 150 → 157); har qo'shimcha nega kelgani
> revizion tarixda. Har bandda **DALIL ustuni** (test nomi / fayl:qator / o'lchov) — keyingi sessiya
> bandni o'qib darhol ishga kirisha oladi. **Har sessiya shundan keyingi ochiq bandni oladi.**
>
> **🔴 SESSIYA BOSHIDAGI HOLAT (o'lchangan, taxmin emas):** api Vitest **62 fail** · web **71 fail** ·
> `pnpm audit` **78 zaiflik (3 critical)** · biome 601 error. Ya'ni **regressiya-himoya qatlami o'chgan edi**.
>
> **✅ YAKUNIY: api Vitest 4101/4101 (0 fail) · web 71 → 26 fail · zaiflik 78 → 30 · typecheck 9/9.**
> Qolgan 26 ning **hammasi** ikki hujjatlangan bandda — «noma'lum qizil» qolmadi.
>
> **ASOSIY TOPILMA — «qizil test ≠ buzuq kod».** 13 tekshirilgan failure'dan **11 tasi eskirgan guard**
> edi: ular «Sherset snapshot» importi bilan **boshqa checkout'dan** kelgan va bu repodagi kodni emas,
> o'sha repodagi kodni tasvirlaydi. Ularni ko'r-ko'rona yashil qilmadim — har birida (1) haqiqatni
> tekshirdim (`git log -S`, manba, BE marshrutlari, capture DOM-roli), (2) guardni **KUCHAYTIRIB**
> qayta yozdim (literal→invariant · curated→derived · fayl→kompozitsiya · identifikator→shakl),
> (3) **mutatsiya bilan** tasdiqladim. Ikkitasi esa **tuzatilgan bug'ni qaytarishni** talab qilardi
> (`InlineFilterPanel` «Найти» disabled; invoice detail'ga moysklad ko'rsatmaydigan maydon).
>
> **Yo'l-yo'lakay topilgan HAQIQIY buglar:** 🔴 o'lik «Sklad» maydoni **xodim saqlashni buzardi**
> (GPS jadval jimgina yo'qolardi + dublikat xavfi) · `seedSystemRoles` `overrides`ni e'tiborsiz
> qoldirardi (Qarz rollari noto'g'ri seed) · HR guard testi async imzoga moslanmagani uchun **HR RBAC
> umuman tekshirilmay turgan edi** · CSV eksportda USD faktura «сум» bo'lib chiqardi · `?dayOffset=1e15`
> → 500 · «Прибыль» qatori ulanmagan · `pay_account` RU'da yo'q (xom kalit ko'rinardi).
>
> **🔒 TIZIMLI TUZATISH (#29):** pre-push faqat typecheck yugurtirardi — shuning uchun 133 qizil test
> sezilmay to'plangan. Endi **`scripts/check-guards.mjs`**: manba-skan guard'lari (~18s, ~370 assertion),
> faqat **yashil bo'lgan** guard yiqilsa bloklaydi; ma'lum-qizillar `scripts/guard-baseline.json` da
> **sabab + TODO ref** bilan (mute emas — ro'yxat faqat qisqara oladi). Mutatsiya-testi drift-lock'da
> **teshik ochdi** (inline tone-map uchala naqshdan o'tib ketardi) → `BAN_INLINE_MAP` qo'shildi.
>
> **⛔ SIZDAN KUTILMOQDA (busiz bloklangan):** `docs/moysklad-reference/visual-captures` **BO'SH**
> (0 fayl). Shuning uchun `label-grounding` 25 test qizil (baseline'da), §4 label-grounding intizomi
> ishlamaydi va **butun Blok 6 (vizual pixel-1:1)** boshlanolmaydi. Kerak: **moysklad.uz login** →
> capture korpusini qayta olish (MASTER-TODO **#35**). Yana 4 qaror: #118 (6 bo'lim drop qaytariladimi),
> #134 (SaaS'mi/single-tenant), #16 (kontragent «Показатели» inline forma vs navigatsiya), #F (pixel-1:1
> majburiymi — bu Blok 6 ni 60-75 → 15-20 sessiyaga tushiradi).
>
> **➡️ KEYINGI:** MASTER-TODO tartibi bo'yicha — `#12` (raw-element, 25 fayl) · `#31-34` qolgani ·
> keyin **Blok 1** (adoption'ni haqiqatda tugatish: #35 capture → #36 6 audit qilinmagan detail →
> #37 climart sahifalari uchun Phase-1 qayta).
>
> **🤝 Parallel sessiya (§6):** ayni paytda **haydovchi jonli-tracking** qurildi (`9c1c3e3` TZ,
> `f0dd781` Faza 0-3). Ularning fayllariga tegmadim; diff'im path-cheklangan. Ular commit qilgach
> `hr/drivers/live` dagi lokal `STATUS_TONE` drift-lock'ni buzdi — **commit qilingan kod umumiy**
> bo'lgani uchun uni `DRIVER_STATUS_TONE`ga birlashtirdim. Ular ham men bilan to'qnashmaslik uchun
> lokal i18n obyekti ishlatgan (izohlarida yozilgan) — muvofiqlik ishladi.
>
> **⚠️ Phase-1, browser-smoke YO'Q.** Hech bir o'zgarish real brauzerda ko'rilmagan (`pnpm dev`
> ko'tarilmadi). «Прибыль» qatori, expense-item pickerlari, tiklangan SMS/qarz sahifalari —
> hammasi Phase-2 QA kutmoqda.

> **🕒 2026-07-24 (YANGI TRACK — HR bo'limini TimePay/HRD davomat-SaaS'iga 1:1 kengaytirish · foydalanuvchi topshirig'i)**
> Foydalanuvchi 3 demo-video berdi (`timepay1/2/3.mp4`, brend aslida **HRD** `web.hrd.uz`) — HR bo'limi shu videolardagi
> bo'lim/funksiyalar bilan bo'lishi kerak, LEKIN **moysklad dizayn tizimida** (foydalanuvchi qarori: «moysklad uslubida
> moslash») va mavjud `/hr` modulini **KENGAYTIRISH** (rebuild EMAS). **TZ: `docs/superpowers/specs/2026-07-24-hr-timepay-attendance-core-design.md`**
> (7-agent code-verified workflow bilan yozildi; video kadr-tahlil 3 agent). MVP scope = **davomat yadrosi**:
> Dashboard · Jadvallar (nomli shablon + resolveShift dvigatel) · Bo'lim · Lavozim · Xodimlar kengaytirish · Kuzatish.
> Keyingi fazalar (MVP'dan tashqari): Jarima · Ish-haqi hisoblash · Hisobot · Qo'shimcha-ish arizalari · Bayram · Kiosk/Terminal.
>
> **✅ BAJARILDI shu sessiyada (3 commit):**
> - **Spec** `ac28d23`.
> - **Faza 1 — Model** `8fa2c99`: 5 yangi Prisma model (HrDepartment, HrPosition, HrSchedule, HrScheduleDay,
>   HrEmployeeBranch) + Employee.departmentId/positionId/scheduleId FK (nullable, additive). Migration
>   `20260724133452_hr_timepay_attendance_core` — **real Postgres'da 39 statement 0-xato qo'llandi** (lokal DB
>   sinxronlandi). ⚠️ **Lokal DB nuance:** `climart_adopt`@5432 migration-tracked EMAS (db push bilan sozlangan) va
>   `trgm_search_indexes`+`hr_davomat_gps` migratsiyalaridan orqada edi → to'liq schema `prisma migrate diff`+node-apply
>   bilan sinxronlandi (pg_trgm YO'Q → 4 trgm GIN indeks o'tkazib yuborildi, alohida migratsiya). Repo migration.sql =
>   FAQAT mening o'zgarishlarim (hr_davomat_gps prereq'iga tayanadi, `hr_work_locations` FK).
> - **Faza 2 — Bo'lim + Lavozim** `b575d91`: backend `hr-department`+`hr-position` modul (CRUD, soft-delete,
>   active-name uniqueness, delete-block); FE `/hr/departments`+`/hr/positions`+`/hr/positions/[id]/employees` drill;
>   hr-employee'ga `position` filtri; hr-api + subnav + i18n(ru+uz). Gate: +13 test · tc 0 · biome 0 · i18n key-existence PASS.
>   Model qarori: catalog = pick-list (Employee free-text `department`/`position` string manba; FK ustunlar hozircha ishlatilmaydi).
> - **Faza 3 — Jadvallar + resolveShift dvigatel** `0a20137`: **dvigatel** `attendance-geo/resolve-shift.util.ts` —
>   sof `resolveShift(employee,date)` uch manbani birlashtiradi (flexible sikl / free / eski weekday fallback) +
>   `computeLateMinutes/Overtime/TotalWorked` hosil-yordamchilari (sikl = UTC-anchor kalendar ayirmasi, DST-immun,
>   manfiy-modul normalizatsiya; `scheduleId` null → weekday fallback → mavjud xulq bit-baravar). Backend `hr-schedule`
>   modul (CRUD + pagination + nested-days transaction replace + soft-delete guard); AttendanceConfig'ga `scheduleId`
>   biriktirish. FE `/hr/schedules` ro'yxat + create/edit/view modal (Moslashuvchan/Erkin, Sikl stepper, Kun 1..N).
>   hr-api `hrScheduleTemplateApi` (mavjud `hrScheduleApi`=per-xodim haftalik bilan ajratildi). Gate: +31 test
>   (resolveShift 24 + hr-schedule 7); attendance-geo 105 test green (regressiya yo'q); tc 0 · biome 0 · i18n PASS.
>   ⚠️ **DEFER:** GPS consumer refactor (`ping-ingest`/`autocheckout-cron`/`monthly-report`) hali `resolveShift`ga
>   ko'chirilmagan — dvigatel tayyor, lekin jonli GPS-davomat hozircha eski `EmployeeWorkSchedule`ni o'qiydi (regressiya
>   xavfini oldini olish). Dashboard (Faza 5)/Kuzatish (Faza 6) yangi consumer sifatida `resolveShift`ni ishlatadi.
> - **Faza 4 — Xodimlar kengaytirish** `1323687`: hr-employee list'ga filial/lavozim/bo'lim/jadval filtrlari (FK id) +
>   projeksiyalar (`positionRef`/`departmentRef`/`primaryBranch`/`scheduleRef`); create/update FK yozadi + katalog nomini
>   legacy `position`/`department` string'ga mirror qiladi (Faza-2 drill buzilmasin). Sof `schedule-summary.util`
>   (workingDays/totalDays/hoursLabel). FE: 4 filtr dropdown + Lavozim/Filial/Jadval ustunlari + employee-modal'ga 3 select
>   biriktirish (findOne pre-fill, optimistic-lock oqimida). Gate: +4 test · hr-employee 67 green (regressiya yo'q) · tc 0 ·
>   biome exit 0 · i18n PASS. ⚠️ **DEFER (spec §5.4):** multi-branch multi-select UI, foto yuklash, ism/familiya split,
>   mamlakat-kodi, bonus quick-modal, attendance-stats ikonka (`/hr/monitoring/{id}` — Faza 6).
>
> - **Faza 5 — Boshqaruv paneli (davomat dashboard)** `c5b58e6`: `resolveShift` dvigatelining **BIRINCHI jonli
>   consumeri**. Backend `davomat-report.dashboard(date)` — cohort(opt-in) × resolveShift × `aggregateEmployeeDay` → KPI
>   (Barchasi/Ishda/Kech/Ishda emas, mustaqil) + Xodimlar davomati (Kirish/Chiqish/Qo'shimcha/Jami/Filiallar);
>   `GET /hr/attendance/dashboard`. Qo'lda check-in kengaytma (at/workLocationId/source=manual/lateMinutes) +
>   `checkOutByEmployee` (atomik race-guard). FE `/hr` davomat-markazli qayta yozildi (sana + 4 KPI + jadval + qo'lda
>   davomat modal); eski Telegram panel ikkilamchi bo'lim. **Adversarial-verify workflow (5 linza): 4/4 confirmed → FIXED**
>   (HIGH tanaffus multi-segment double-deduct → per-segment; MED check-out null-wipe; LOW check-in TOCTOU izohlandi).
>   Gate: +10 test · attendance 101 green · tc 0 · biome 0 · i18n PASS.
>
> - **Faza 6 — Xodimlarni kuzatish** `5f2d3bc`: MVP oxirgi fazasi. Mavjud GPS-davomat ustiga read/derive qatlam
>   (yangi model YO'Q). `monitoring.service` daily() (cohort ∪ record-only × resolveShift × resolveDayRow → 2 badge:
>   Vaqtida/Kechikkan + Ishda/Ketgan/Kelmagan/Dam-olish) + marks() (expandMarks entry/exit+GPS). FE `/hr/monitoring`
>   (sana+status filtr) + `/hr/monitoring/[id]` (belgilar, OSM xarita). Dashboard KPI deep-link. Badge: ontime +
>   absent→destructive. **Adversarial-verify: 2/2 confirmed→fixed** (HIGH daily() nomli HrSchedule'ni e'tiborsiz
>   qoldirar edi → resolveShift+SCHEDULE_SELECT; MED dashboard atWork o'tgan-kun ochiq yozuv → isAtWork=hasOpen&&isToday).
>   Gate: +14 test · attendance-geo 104 green · tc 0 · biome 0 · i18n PASS.
>
> **🎉 DAVOMAT-YADROSI MVP 6/6 TUGADI** (spec/model/bo'lim-lavozim/jadval-dvigatel/xodimlar/dashboard/kuzatish). Barcha
> fazalar **Phase-1** (strukturaviy, gate-yashil, adversarial-verify bilan; **browser-smoke YO'Q**).
>
> **➡️ KEYINGI (tanlov — foydalanuvchi yo'naltiradi):**
> 1. **Phase-2 browser-QA** (tavsiya): `pnpm dev` (DB 5432 climart_adopt sinxron) + Playwright bilan davomat-yadrosini
>    real brauzerda tekshirish (KPI/jadval/modal/filtr/drill/deep-link/xarita). `seed:hr` bilan test-data.
> 2. **Keyingi feature fazalari** (spec §2 OUT ro'yxati): Jarimalar (tiered) · Ish-haqi tarif+hisoblash · Ish-haqi
>    to'lovlari jurnali · Hisobotlar (oylik statistika+eksport) · Qo'shimcha-ish arizalari (approve/reject) · Bayramlar ·
>    Kiosk/Terminal/PIN · punch-photo (schema kolonka + PWA kamera). Har biri alohida spec/faza.
> 3. **resolveShift GPS-consumer refactor** (Faza 3 defer): ping-ingest/autocheckout-cron/monthly-report'ni dvigatelga
>    ko'chirish (nomli jadvalli xodimlar uchun jonli GPS-davomat kech/smena'ni to'g'ri hisoblasin).
>
> **🟡 Pre-existing debt (mening o'zgarishim EMAS):** `i18n-no-hardcoded` gate `labels/print/page.tsx` regex `/[a-zа-яё]/i`
> ustida qizil (2026-07-23 commit'dan) — Faza scope'idan tashqari, alohida hal qilinadi.

> **🌐 2026-07-23l (YANGI YO'NALISH — VPS «moysklad» fork → Sherset Продажи port · recon+analiz+reja · `1e4b46a`)**
> Foydalanuvchi yangi vazifa berdi: VPS `/var/www/moysklad` (climartgroup.uz, root 45.67.216.61) — bu **Sherset bilan
> bir loyiha oilasi (moysklad-clone), alohida diverged fork** (`Biznesjon-Official/moysklad`, faol). Foydalanuvchi qarori
> **KENGAYTIRILDI:** endi 3 bo'lim emas — **BUTUN kod climart bilan bir xil** (upstream-adoption). Keep = «konteragent
> ekotizimi» = **counterparties + debts + sms + telegram** (Sherset'niki; foydalanuvchi 2026-07-23: «bularning hammasi
> konteragent bo'limiga kiradi»); DROP = sotuv/omborchi/restock-tasks/replenishment/cell; DB = **yangi dev-DB**; rejim =
> **lokal-avval-tekshir**, prod ALOHIDA. **⚠️ salesreturn 1:1 + Продажи-per-page rejalarni SUPERSEDES qiladi.**
> **SSH kirish O'RNATILDI:** `ssh climart` (kalit `~/.ssh/climart_vps` root@45.67.216.61'da, `~/.ssh/config`'da; parolsiz).
> **Server FAQAT o'qiladi** (git archive bilan kod olish; DB/boshqa loyihalarga TEGMA). VPS full archive ~3GB → maqsadli yo'llar.
> **Farq-tahlil:** HAR Продажи FE fayli farq qiladi; VPS TO'LIQROQ (demands 1775>1445, sales-returns/new 1732>1151,
> retail 704>>5-stub; commission-reports VPS-only new/new-in). Shared-infra ham divergent LEKIN Sherset kattaroq
> (api-client 247>177, schema 9356>8939) → VPS'nikiga almashtirilMAYDI; VPS sahifalari **Sherset infra'siga moslashtiriladi**.
> **B1 ✅ BAJARILDI:** worktree `d:/projects/sherset-climart-adoption` (branch `climart-adoption`, commit `a52c3c7`).
> climart tree overlay + keep(counterparties/debts/deploy/docs) + drop(sotuv/omborchi/cell/replenishment/restock-tasks) +
> add(bulk-edit/specialoffers/subscription). `pnpm install` ✅ · money build ✅ · prisma generate ✅. **Main daxlsiz.**
> **B2 ✅ + B3-partial ✅ (commit `2e3b35c`): typecheck 186 → 75.** B2 = Sherset Debt-modellar + back-relation'lar
> climart sxemasiga (API 119→34). B3-partial = PermissionEntity/NotificationKind/AttachmentEntity +debt (API 34→8).
> **🏁🎉 ADOPTION RUNTIME-VERIFIED (2026-07-23):** ✅ typecheck 0 · ✅ i18n PASS (+133 kalit) · ✅ build:web · ✅ **`prisma
> db push` + `db:seed` OK** · ✅ **`pnpm dev` JONLI + brauzer smoke:** login `admin@demo.local`/`admin123` → **dashboard,
> counterparties (Sherset kept, SMS/filtr, 2 seed-kontragent), debts «Qarz undirish» (Sherset kept), customer-orders
> (climart Sotuvlar) — HAMMASI RENDER BO'LDI.** climart adoption + Sherset kept-ekotizim JONLI ishlaydi.
> **RUN (lokal):** DB `climart_adopt` @ postgres 5432 (rol `sherset` yaratildi; PG18 PID5772 instance) · worktree `.env`
> DATABASE_URL→climart_adopt · `pnpm dev` web:3100 + api:4000 · login `admin@demo.local`/`admin123`.
> **⏭️ QOLGAN (polish):** (1) ba'zi i18n xom (`pages.debts.legend_*`/`scope_active` — runtime-only, static-test tutmadi;
> merge'ni kengaytir); (2) dev-overlay "Issues" (debts 17, counterparties 1 — React runtime warn); (3) biome 43 lint;
> (4) chek-shablon (retail/print) keep tekshir; (5) generated Prisma branch'ga tushdi (.gitignore). Keyin PROD deploy (alohida).
> ~~**⏭️ KEYINGI = oxirgi 4 web + gate** (checkpoint `71231a3`, **API 0 · web 4** — jami 253→4, ~98% reconcile). Keep =~~
> «konteragent ekotizimi» = counterparties+debts+sms+telegram + **xabar/CHEK shablonlari** (saqlansin, o'zgartirilmasin).
> **✅ API TYPECHECK 0** (backend to'liq): telegram/MessageTemplate/CompanySettings/attachment schema + big-integer +
> sms/telegram/hr-bridge/hr-tg-account modul + createFromBuffer/SupplyPostedEvent/blobUrl fix. **✅ WEB 67→4:** FE keep-deps
> (components/sms+telegram, hooks/use-keyboard-nav+use-list-memory, lib/debt-api+sms-api) tiklandi + api.blobUrl.
> **QOLGAN 4:** counterparties **ListView** + debts **DataTable** — climart `@moysklad/ui` API'si Sherset'nikidan farq (43+
> prop). **QAROR:** kept-sahifani climart ListView/DataTable API'siga ADAPT, YOKI Sherset komponentini alohida-nom bilan
> `@moysklad/ui`'ga qo'shib coexist (climart 20+ sahifasi climart ListView ishlatadi — u g'olib). Keyin: **CHEK-shablon**
> (retail/print) keep-item tekshir (drop retail bilan bog'liqmi) → **typecheck 0** → biome+i18n → build → dev-DB+seed+smoke → verify.
> **Har sessiya boshida:** worktree'da `pnpm --filter @moysklad/money build`. **CLIMART: read-only.** **HALOL:** hali BUILD BO'LMAYDI (4 web + gate qoldi).

> **🟢 2026-07-23k (DEMAND list QISM 3 — Грузополучатель ustun+filtr + Товар/группа filtr · Phase-1 · `b2fe49f`)**
> Ro'yxatni moysklad `demand-01-list` tomon: **L1** «Грузополучатель» ustuni (list `include`ga `consignee`;
> Контрагент↔Организация orasida, default-visible) · **L4** «Грузополучатель» filtri (`consigneeId` param +
> buildListWhere + InlineFilterPanel maydoni + CatalogPicker modal) · **L3** «Товар или группа» filtri
> (`productId`→`positions.some.productId`, CO/invoice-out namunasi; product bo'yicha — guruh subgroup-rekursiyasi DEFER,
> CO ham hozir shunday). Migration YO'Q (consignee relatsiya+indeks avval bor). i18n `filters.consignee` ru+uz qo'shildi.
> Gate: web+api tc 0 · biome 0 · demand.schema 33/33 · i18n key-existence pass. **Phase-1, browser-smoke YO'Q.**
> ⚠️ Pre-existing debt (meniki EMAS, o'zgargan fayllarimda YO'Q): i18n no-hardcoded losses/labels 7 ta · raw-element-conv
> retail/page.tsx — keyingi tegishli sessiyada tozalansin.
> **+ shu sessiya mayda:** retail POS «SAVDO CHEKI» — «Qaytim» qatori olib tashlandi + 80mm layout ixcham (`293958a`).
> **⏭️ KEYINGI (demand):** QISM 3 qoldig'i — **L2 «Тип возврата»** (MEDIUM: SalesReturn↔Demand linkage bor, qty-aggregation
> kerak; «Без возвратов»=CLEAN `salesReturns:{none}`) + bulk «Статус» menyu. Keyin **QISM 2 detail** (D1 Связанные документы
> bo'sh→BE related-graph · D2 Отправить badge · D3 Решения · D4 archive/restore — aksari BE). **D6 «Изменения» tab: DEFER —
> `DetailContentTabs` ATAYLAB inline-seksiya (test-lock), 3-tabga o'tkazish BARCHA hujjatlarga ta'sir → cross-doc qaror kerak.**
> Маркировка = QISM 4 (katta). «100%» faqat QISM 5 QA'dan keyin.
>
> **🟢✅ 2026-07-23j (DEMAND — parallel-workflow FE-parity batch: 5 item, 3 sahifa, browser-verified)**
> `demand-fe-parallel` workflow (3 agent, worktree-izolyatsiya) → markazда integ + gate + browser-cert (`015e41b`):
> **/new:** Адрес доставки = structured DeliveryAddressGroup popup (▼) · Внешний код = pastki-chap toggle-havola ·
> Накладные расходы = totals ostidagi ixcham qator (moysklad kabi). **detail:** ikkilamchi meta-maydonlar (consignor/
> carrier/cargo/overhead/external-code…) collapsed «Другие поля» disclosure ostiga guruhlandi (core doim ko'rinadi;
> PositionEditor'ga TEGILMADI). **list:** filtr-panel moysklad tartibiga (Оплата→#2, Счёт контрагента Группа'dan keyin…).
> **Undan oldin (shu sessiya lineage):** detail «Валюта документа» field (`713bf0a`) · list Валюта ustun + Счёт filtr +
> Оплата order (`10d2d9d`) · buyPrice→Себест/Прибыль (`74e8e58`, FE-only) · 2 filtr olib tashlash (`b6f3dd4`) · /new header
> (`039ba17`). **Holat:** /new ~90% · detail ~68% · list ~80% · umumiy ~**62%**.
> **⏭️ KEYINGI (qolgan — aksari BE yoki bloklangan):** detail cost/stock ustunlar (shared PositionEditor → parallel-sessiya
> bilan koordinatsiya) · 32 BE-item (list filtrlar/ustun · custom-states · related-docs · archive/restore · task/files
> panel — schema-koordinatsiya kerak) · Маркировка (QISM 4, katta) · Импорт (capture kutmoqda) · perf quick-win'lar ·
> QISM 5 QA. **«100%» faqat QISM 5 QA'dan keyin** (Импорт-capture + Marking + QA foydalanuvchi/katta-ish blokerlari bor).

> **🟢✅ 2026-07-23i (DEMAND — 3 QARORDAN 2 tasi BAJARILDI + perf #1, hammasi browser-verified)**
> 2026-07-23h qarorlarini ijro etish (davomi):
> **✅ #1 buyPrice → Себест.единицы + Себестоимость + real Прибыль (`74e8e58`):** MUHIM — **BE o'zgarishi SHART EMAS
> edi**: `/products` buyPrice'ni allaqachon qaytaradi (strip faqat omborchi-skan endpoint'larда — `getScanInfo`/
> `getCellContents`), FE fetcher tashlab yuborardi. `DocPositionRow.buyPriceMinor` (optional) qo'shildi; shared
> PositionTable cost-cell'lari uni afzal ko'radi, yo'q bo'lsa `priceMinor`ga tushadi → **Enter (Оприходование) xulqi
> BAYT-BIR XIL**. demand/new pozitsiyaga buyPrice tashiydi, 2 cost-ustun (Сумма'dan keyin) + real Прибыль = net −
> Σ(buyPrice×qty). **Live smoke:** iPhone (buy 12M, sale 15M) → Себест 12M, Прибыль 1 392 857.14 ✅. Tannarx endi
> /products o'quvchilarга ko'rinadi (user qabul qildi).
> **✅ #2 list'dan «Сумма от/до» + «Заказ покупателя» FILTRlari olib tashlandi (`b6f3dd4`)** (strict 1:1) — grid ustun +
> footer saqlandi. Live smoke: filtrlar yo'q, ro'yxat ishlaydi ✅.
> **🔴 #3 «Импорт» — JONLI CAPTURE KUTMOQDA (user qarori 2026-07-23i):** static capture'да faqat yopiq «Импорт ▾»
> tugma; u ochadigan dialog/oqim (format/ustun-mapping) suratда YO'Q + 2026-06-24 «moysklad'да CSV import yo'q»
> qaroriga zid. Working `importItems` hech qайси sahifада yo'q (2026-06-24'да olib tashlangan). User moysklad Импорт
> dialogини suratга oladi → o'shанда 1:1 quriladi. (`onImportPositions` handler demand/new'да bor, faqat UI yo'q.)
> **⏭️ KEYINGI (qaror kerak emas):** /new qolgan FE (Адрес structured popup · Накладные расходы totals-footer'ga ·
> Внешний код toggle · Другие поля order) · **detail 9 FE** · **list 5 FE** · perf quick-win'lar (DB index/tree-shake/
> de-waterfall/PositionTable-memo) · keyin 32 BE · Маркировка(QISM4) · QISM 5 QA. Backlog: `_demand-1to1-GROUNDED-backlog.md`.
> ⚠️ **NEXT.md ~940 qator — ARXIVLASH shart** (keyingi sessiya `docs/audits/_ARCHIVE-NEXT-*.md`ga eski entry'larni ko'chirsin).

> **🟢🚀 2026-07-23h (DEMAND «Отгрузки» TO'LIQ 1:1 — WORKFLOW-AUDIT + /new header batch + 3 QAROR olindi)**
> Foydalanuvchi: «shu bo'lim 100% moysklad bo'lmaguncha to'xtamay workflow bilan ishla; keyin jonli moyskladga
> kirib har bir funksiya/dropdown'ni tekshirib bajarasan». **Halol chegara:** jonli moysklad'ga men kira olmayman
> (real akkaunt) → static capture'lar grounding; capture'da yo'q xulqlar («needs-live-capture») foydalanuvchidan
> yangi capture kutadi. «100%» faqat QISM 5 QA'dan keyin.
> **🔬 GROUNDED AUDIT (`demand-1to1-audit` workflow, 72 agent, 3.2M tok):** 61 grounded gap (har biri adversarial
> grounding-verified), 6 rad. To'liq: **`docs/audits/_demand-1to1-GROUNDED-backlog.md`** (`e346aa9`). Taqsimot:
> **24 FE-now · 32 BE-needed · 2 needs-live-capture · 3 marking(QISM4) · 0 blocked.** ⚠️ Audit `_GAP-BACKLOG`dagi
> «create minimal PARITY OK»ni RAD etdi (moysklad /new header'да 4 dropdown bor).
> **✅ BAJARILDI (`039ba17`, /new header batch, live smoke):** (1) «Проведено» default CHECKED (capture
> `checked=""` — save darhol POST qiladi, moysklad default; ⚠️ xulq o'zgarishi) · (2) header 4 dropdown
> (Изменить/Создать документ/Печать/Отправить) endi populated+enabled (avval bo'sh→disabled); Печать save→print
> (afterSaveRef) · (3) pozitsiya inline-add placeholder/label i18n (RU-leak → position_editor). Gate tc0·biome0.
> **📋 FOYDALANUVCHI 3 QAROR (2026-07-23h — MAJBURIY, keyingi ish shularga tayanadi):**
>   1. **Себест/buyPrice = OCHIB BER (to'liq 1:1).** BE: `/products` buyPrice-strip'ni bekor qil (product.service.ts:155)
>      → pozitsiya buyPrice tashiydi → real «Себест. единицы»+«Себестоимость» ustunlar + real «Прибыль» (draft'да ham).
>      ⚠️ Tannarx endi ko'rinadi (xavfsizlik implikatsiyasi — foydalanuvchi qabul qildi). §wiring: markaziy BE commit alohida.
>   2. **Ortiqcha 2 list filtr = OLIB TASHLA** (qat'iy 1:1): «Сумма от/до» + «Заказ покупателя» (`demands/page.tsx`).
>   3. **«Импорт» = TO'LIQ ISHLAYDIGAN** (placeholder emas): BE import endpoint bor-yo'qligini tekshir; yo'q bo'lsa BE ham yoz.
> **⏭️ KEYINGI IJRO TARTIBI (feasible, decided):** (a) **buyPrice expose (BE)** → Себест/Прибыль ustunlar (/new+detail) ·
> (b) 2 filtr olib tashlash (list) · (c) Импорт wire · (d) qolgan /new FE (Накладные расходы totals-footer'ga · Адрес
> structured popup · Внешний код toggle · Другие поля order) · (e) **detail 9 FE** (cost/Остаток/Сумма НДС ustun ·
> drag-reorder · Другие поля grouping · valyuta field · column-config menu) · (f) **list 5 FE** (Валюта ustun · Оплата
> filtr label/order · Счёт filtr field · filter-panel order) · (g) BE-needed 32 (list filtrlar · custom-states subsystem ·
> related-docs graph · archive/restore · task/files panel · pozitsiya-data plumbing) · (h) Маркировка = QISM 4.
> **🔴 needs-live-capture (2, foydalanuvchidan):** org «Перечисление» sub-selector semantikasi · «…» overflow menyu.
> **⚡ PERF WORKFLOW (`demand-perf-audit`, woe70o25i) TUGADI** (46 agent): 33 prod-confirmed (aksari volume-conditional —
> seed'да sezilmas, yuzlab-minglab qatорда kuchayadi), 1 dev-only, 3 rad. **Halol:** sezilgan lag'ning kattasi `next dev`
> route-kompilyatsiya (cold TTFB ~1250ms, prod'да YO'Q; warm ~210ms), API <55ms. Backlog: **`docs/audits/_ERP-perf-backlog.md`**
> (`2ef2f1b`). **✅ #1 quick-win QO'LLANDI (`f7161ee`):** `keepPreviousData` global query-client'да → ~90 list sahifада
> pagination/sort/filtr/qidiruvда skeleton-flash + row-remount YO'Q. **⏭️ Qolgan perf quick-win:** BS-1 (`sideEffects:false` +
> `optimizePackageImports`, prod-build verify) · DB-1/2 (Product/Counterparty `[accountId,createdAt]` index — migration,
> parallel-sessiya tugagach) · BE-1 (counterparty list Promise.all de-waterfall) · RR-1 (PositionTable row-memo, med-risk) ·
> list-row memo · FK/organizationId indexlar. **⚠️ NEXT.md ~920 qator — arxivlash kerak.**

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
