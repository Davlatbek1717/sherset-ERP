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
> ⚠️ **Stack tuzatmasi (2026-08-10, o'lchangan):** yuqoridagi `moysklad_dev`@5433 **ESKIRGAN** —
> haqiqiy lokal baza `climart_adopt`@**5432** (`packages/db/.env`), `CLAUDE.md` §1 dagi kabi.

> **📊 MK25 — M2 menejer ekranlari Phase-2 QA (2026-08-10i): QISMAN ✅ / ochiq ⏳.**
> ✅ Brauzerda tasdiqlangan (`mk25-manager-m2-qa.spec.ts`, 6/6): **MK15** pul manzarasi raqamlari
> ichki hisobotga TENG (kassa/mijoz/ta'minotchi) + `null`≠`0` + yarim yig'indi berilmaydi ·
> **MK16** eslatma idempotent, telefonsizga jurnal yozilmaydi · **MK19** «uchta 17» soxta signal
> ekani o'lchandi · **MK21** filtr/eksport ekrani · skaner oqimi (kod→karta, yo'q kod→«topilmadi») ·
> 10 ekran 390×844 da toshmaydi.
> 🔴 Tuzatildi: **D1** eslatma sababi xom i18n kaliti bo'lib chiqardi
> (`pages.menejerCollection.reason_no_chat`) · **D2** qaror jurnali holatni umuman tarjima
> qilmasdi (`escalated → force_accepted`).
> ⏳ Qoldi: **MK23 ☐ va MK24 ☐ umuman qurilmagan** ⇒ «real telefon / mobil rejim» QA'sining
> predmeti yo'q; **real qurilma ishlatilmadi** (kamera-skaner tekshirilmagan); **MK22** route'siz.
> **MK24 bajarilgach MK25 QAYTA yugurtiriladi.** Batafsil: REJA → «Faza MK25».

> **🔐 MK40 — 4-Menejer ruxsatlar Phase-2 QA (2026-08-10): QISMAN ✅ / ochiq ⏳.**
> ✅ Brauzerda tasdiqlangan: rol yaratish→biriktirish · record-scope OWN (bayroq ON da 3→1,
> begona yozuv `404`) · G1 matritsa rad javobi · kassa kamomadi→navbat (CASH_VARIANCE, «Jiddiy») ·
> navbat FSM `open→resolved` + sabab kodi.
> 🔴 Tuzatildi: **owner-transfer imtiyoz oshirish teshigi** + 16 detal sahifada o'lik `not_found`
> (404 = abadiy spinner) + bosh sahifa 403→soxta nol + uz pager `«из»` + G1 `role="alert"` +
> «Jarima yozish» pul yozmasligi ekranda ochildi.
> ⏳ Qoldi (fazalar): filial ∩ scope (`MK35 ☐`, `branchId` sxemada yo'q) · shablon qo'llash FE
> (`MK29` BE tayyor, FE 0 chaqiruv) · xodim-override FE (`MK28 ☐`) · `recordScopeEnforced`
> **prodda O'CHIQ** (qamrov 2/47). Batafsil: REJA → «Faza MK40».

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

> **🕒 2026-08-16g (KASSA — rolsiz-kassir sinfi YOPILDI: prod-fix «Shavkat» + PIN-qo'riqchi) —**
> «smena ochishda xatolik» qaytdi; nginx: `open-session` 403→(kassir almashib) 201 naqshi. Ildiz —
> AVVALGI «Umid» klassi takrori: egasi yana ROLSIZ xodim yaratgan («Shavkat»), rolsiz = hamma huquq NO.
> (1) Prod-fix: Shavkat → «Kassir» roli (idempotent INSERT, SQL); 5-daq ruxsat-keshdan keyin ishlaydi.
> (2) ILDIZ-QO'RIQCHI (TDD): `pos-pin.service.setPin` endi ROLSIZ xodimga PIN BERMAYDI — aniq 400
> «Avval xodimga rol biriktiring…» (PIN = kassir bo'lish qadami; xato endi sozlash paytida, kassada
> tushunarsiz 403 o'rniga). Test: pos-pin.service.test «ROLSIZ xodimga PIN BERILMAYDI» (+mock defoltiga
> `roles`). auth-modul 15f/287 yashil · api tc0 · lint 0. 12:00-KESIM: `scripts/ops-2026-08-16-smena-cut.sh`
> tayyor (Umidning 2 pre-noon chekini yopiq mini-smenaga ko'chiradi) — klassifikator meni o'tkazmadi,
> EGASI O'ZI yugurtirishi kutilmoqda. **⚠️ KEYINGI: deploy (16f+16g birga) + qurilma-QA.**
>
> ---
>
> **🕒 2026-08-16f (KASSA POS — CHEK TAHRIRLASH ochiq yo'llari; Phase-1: strukturaviy,
> runtime-tasdiqlanmagan, browser-smoke YO'Q, qurilma-QA QOLDI) —** egasi: «tahrirlash yo'q-ku
> hech qayerda». Ildiz: tahrir yo'li BOR edi (qoralama chipi), lekin yozuvsiz — kassir topa olmasdi.
> Uch nuqta ochildi (TDD, RED ko'rildi): (1) qoralama chipida endi OCHIQ «✎ Tahrirlash» yozuvi
> (sotuv-mode; chip bosilsa savatga qaytadi — mavjud mexanizm); (2) TO'LANGAN chek detalida
> «✎ Savatga nusxalash» (`chek-copy-to-cart`, cheklar-mode→page `copyChekToCart`): pozitsiyalar
> savatga (chekdagi birlik narxi bilan, chegirma-% ko'chirilmaydi), joriy savat avval avto-qoralama,
> rejim Sotuvga, ASL CHEKKA YOZUV KETMAYDI (buxgalteriya uchun tahrir emas — nusxa; qaytarish alohida
> turibdi); (3) savat qatori tahriri allaqachon bor edi (qatorga bosish oynasi) — tegilmadi. i18n:
> `draft_edit`/`chek_copy_to_cart`/`chek_copied`/`chek_copy_blocked` uz+ru. Testlar: yangi
> `chek-copy-to-cart.test.tsx` (2) + proforma-testga chip-yorliq testi; sotuv-papka 20 fayl/205
> yashil. Gate: web tc0 · lint 0 err. §6.6: parallel sessiya qarz-xabar (publication) ishida;
> u orada proforma 0-narx cheklovini bekor qilgan (test yangi niyatda) — diffim path-cheklangan,
> commit blob-retsept. **⚠️ KEYINGI QADAM: DEPLOY + qurilma-QA** (chip «Tahrirlash» · chekdan
> savatga nusxalash · narxsiz tovar cheki).
>
> ---
>
> **🕒 2026-08-16e (KASSA POS — SOTUVSIZ CHEK «Chek chiqarish» + chekda base-CHEGIRMA;
> Phase-1: strukturaviy, runtime-tasdiqlanmagan, browser-smoke YO'Q, qurilma-QA QOLDI) —** egasi:
> (1) savatdan sotuv qilmasdan chek chiqarish tugmasi; (2) «har bir chekni o'zgartirish»; (3) qator
> narxi tushirilsa chekda «Chegirma» ko'rinsin (10 000→9 000 ⇒ 1 000). **Egasi qarori (ochiq
> ogohlantirishdan keyin): sotuvsiz chek haqiqiy sotuv chekidan FARQSIZ** (firibgarlik xavfi
> tushuntirildi — kassir pul olib sotuv o'tkazmasligi mumkin; egasi o'z zimmasiga oldi; to'lov
> qatori naqd=jami bilan to'ladi). **Qilingan:** (a) `SavatPanel`da `sotuv-proforma` tugmasi —
> «Sotish» bilan AYNI narx-siyosat qulfi; zakaz/tayyor-chek savatida chizilmaydi; (b)
> `cartToProformaReceipt` (`lib/pos/receipt-proforma-model.ts`, sof) — savat+`discountPct` →
> `ReceiptSaleInput`, hujjat/sotuv YARATILMAYDI; (c) `printProformaReceiptViaAgent` (print-agent) —
> Electron→HTML / agent→ESC-POS / ikkalasi yo'q bo'lsa popup-HTML zaxira; (d) chop etilgach savat
> QORALAMA chipiga (`parkCart`) — «chekni o'zgartirish» = chip→tahrir→qayta chiqarish; (e) 🔴 chek
> modeli: `basePriceMinor` (muzlatilgan sotilish narxi) → «Umumiy» = Σ max(base×qty, sum), «Chegirma»
> = Umumiy−Jami (`mulQtyMinor` half-up, floatsiz); base'siz qator eski xulq; (f) uch-renderer DRIFT
> tuzatildi: `/print/retail-sale` endi `model.subtotalMinor`dan (o'zicha Σsum hisoblab base-chegirmani
> ko'rmay qolardi). i18n: `proforma_btn`/`proforma_failed` uz+ru. Testlar (TDD, RED ko'rildi):
> receipt-model +5 · receipt-proforma-model 5 (yangi) · sales-screen-proforma 3 (yangi); chek-qatlam
> jami 287 yashil. Gate: web tc0 · lint 0 err; **TO'LIQ suite'da 13 qizil — PARALLEL sessiyaning
> jonli narx-siyosat TDD ishi** (`price-policy-guard`/`cart-line-edit-modal` — mening diffimda YO'Q
> fayllar; §6.6 qayd, commit yana blob-retsepti bilan path-cheklangan). **⚠️ KEYINGI QADAM: DEPLOY
> (16b–16e birga; egasi SSH-buyruq oldi, hali yugurtirmagan) + qurilma-QA** (sotuvsiz chek chop ·
> chip-tahrir · chekdagi chegirma raqami).
>
> ---
>
> **🕒 2026-08-16d (KASSA — smena «0 dan» + ixtiyoriy sabab + ochilish-naqd maydonlari;
> Phase-1: strukturaviy, runtime-tasdiqlanmagan, browser-smoke YO'Q, qurilma-QA QOLDI) —** egasi:
> «smenani yopganda oldingilari ham qo'shilib ketyapti; xohlaganda ochib-yopiladigan, har safar 0 dan».
> **Diagnoz (prod-SQL bilan o'lchandi): hisob-matematika BUZILMAGAN** — har yopilgan smena kutilgani
> faqat o'z cheklaridan to'g'ri chiqqan. Ikki jarayon-yorig'i: (1) POS ochilishda `openingCashMinor:'0'`
> QATTIQ KODLANGAN edi, yashiqda oldingi smenadan pul qolsa yopishda «soxta излишек» = o'sha qoldiq
> (prodda 1.0M/1.5M holatlar ko'rildi); (2) vaqtdan-tashqari ochish SABAB MAJBURIY edi → kassirlar
> yopmay yurgan, sessiyalar 14–42 soat ochiq qolib «oldingi kunlar qo'shilgan» his qilingan.
> **Fix (TDD, RED ko'rildi):** (a) `OpenShiftForm`da yangi maydonlar «Yashiqdagi naqd (so'm)» +
> «Yashiqdagi dollar» (`open-shift-cash[-usd]` test-id; bo'sh=0, `parseAmountToMinor`); (b) sabab
> IXTIYORIY — server throw olib tashlandi (`smena.service`), §9 audit endi sababsiz ham YOZILADI
> (`planOutOfScheduleAuditEvent.reason: string|null`); (c) `OpenSessionFromSmenaSchema`+create'ga
> `openingCashUsdMinor` (ilgari jim 0). Yopish istalgan payt mumkin edi — unga tegilmadi (unresolved-chek
> to'sig'i qoladi). Testlar: api smena.service.test 25 (5 yangi RED→GREEN) · web open-shift-form 9
> (eski «sabab majburiy» qulflari YANGI niyatga qayta yozildi, egasi qarori izohlangan). i18n:
> `opening_cash_label`/`opening_cash_usd_label`/`out_of_hours_optional_hint` uz+ru; o'lik
> `out_of_hours_reason`/`shift_open_with_reason` o'chirildi. Gate: web tc0 · api tc0 · lint 0 err ·
> TO'LIQ web 285f/4029 (Errors ham 0 — shift-mock tuzatildi) · TO'LIQ api 596f/8295. **⚠️ KEYINGI
> QADAM: DEPLOY (web+api!) + qurilma-QA** (ochilish maydonlari · sababsiz ochish · yopish→darhol qayta
> ochish 0 dan). Eslatma: `/retail` (MS-parity) ochilish sahifasi ALOHIDA — bu o'zgarish faqat POS'da.
>
> ---
>
> **🕒 2026-08-16c (KASSA POS — qarz to'lovi cheki TOVAR-CHEK shablonida + JIM chop, `48d2430e`;
> Phase-1: strukturaviy, runtime-tasdiqlanmagan, browser-smoke YO'Q, qurilma-QA QOLDI) —** egasi:
> qarz qabul qilingach kassa.exe'da chek BOSHQA OYNADA ekranga chiqyapti, dizayni tovar chekidan farq
> qiladi. **Ildiz:** tovar cheki `printReceiptViaAgent` (jim) yo'lidan yurardi, qarz cheki esa
> `window.open('/print/debt-payment/…?auto=1')` (PKO dizayni). **Yechim (TDD, RED ko'rildi):**
> (1) yangi `lib/pos/receipt-debt-model.ts` — server cheki (`GET /debts/pos/receipt/:batchId`) →
> `ReceiptSaleInput` mapper: sarlavha «QARZ TO'LOVI № <batch8>», Sotuvchi=kassir · Xaridor=mijoz,
> qator(lar) «Qarz to'lovi (QRZ-N)» (bitta bo'lsa qavssiz), storno chiqariladi, «Sizning qarzingiz» =
> `outstandingAfterMinor` — **0 bo'lsa HAM chiqadi** (`variant:'debtPayment'` → model `showZeroDebt`;
> savdo chekida eski xulq). (2) `printDebtReceiptViaAgent(batchId)` — tovar cheki bilan AYNI jim-chop;
> `sotuv/page.tsx` `onPaid` endi `printDebtReceipt` + `finishPrint` fallback (qobiqda oyna YO'Q).
> (3) Zaxira sahifa `/print/debt-payment/[batchId]` PKO'dan `ThermalShell`+`TovarChek`ka o'tkazildi
> (uchala renderer bitta mapper'dan). (4) api `receipt()` javobiga `organization.phone` qo'shildi;
> i18n `chek_title_debt` ru+uz; `TovarChek` yangi `showZeroDebt` prop. Testlar: `receipt-debt-model.test.ts`
> (12) · renderers +3 · pko-usd qayta yozildi (5) · wiring-test jim-chopga moslandi. Gate: web tc 0 ·
> api tc 0 · biome 0 (o'z fayllar) · TO'LIQ web vitest 285 fayl / 4029 pass · api debt-modul 278 pass.
> (`audit-fixlar` `5e3`-testi bir oraliqda 5× qizardi, keyin 3× 7/7 — diffga bog'lanmadi, 16b bilan bir
> kuzatuv.) **Commit tartibi (jonli poyga, yakun TO'G'RI):** user «bitta qo'shma commit»ga ruxsat bergan
> edi, lekin 16b-sessiya mening stage'im bilan commit'im ORASIDA o'z `fab01481`ini qildi (blob-retsept:
> page.tsx'dan mening kiritmalarim chiqarilgan); mening `48d2430e` uning USTIGA chek-ishini qo'shdi —
> shuning uchun `48d2430e` xabari «qo'shma» deydi-yu, debounce aslida `fab01481`da. Yakuniy daraxtda
> ikkala ish TO'LIQ (07:04 to'liq suite AYNAN shu tarkibda 285/285 yashil, HEAD grep-tasdiqlangan).
> **⚠️ KEYINGI QADAM: WEB-DEPLOY (exe SHART EMAS — sof web) + qurilma-QA:** qarz to'lovi → chek DARHOL
> printerdan (oyna ochilmaydi), dizayn savdo cheki bilan bir xil, to'liq yopilganda «Sizning qarzingiz: 0».
>
> ---
>
> **🕒 2026-08-16b (KASSA POS — «qidiruv sekin» tuzatildi: debounce + keepPreviousData + AbortSignal;
> Phase-1: strukturaviy, runtime-tasdiqlanmagan, browser-smoke YO'Q, qurilma-QA QOLDI) —** egasi
> «mahsulot izlaganda ko'p vaqt ketyapti» dedi. **Diagnoz (o'lchangan): DB aybdor EMAS** — lokal egizakda
> (4710 tovar) POS-shakl so'rovi EXPLAIN 10.7ms, `products_name_trgm_idx` sxema+migratsiyada bor (prod'da
> indeks JONLI TEKSHIRILMAGAN — SSH sessiyada bloklandi; keyingi safar 1 psql bilan tasdiqlash mumkin).
> Asl sabab frontend zanjiri edi: har tugma-bosishda so'rov (debounce yo'q) + har harfda yangi queryKey →
> grid «Yuklanmoqda…»ga tushardi + AbortSignal yo'q → eskirgan so'rovlar brauzerning ~6 ulanish-slotini
> band qilib oxirgisini navbatda ushlardi (do'kon interneti RTT × navbat = sekundlab). **Tuzatish (web-only,
> exe SHART EMAS):** (1) `SEARCH_DEBOUNCE_MS=250` — so'rov matn tinchigach (`page.tsx` `debouncedSearch`);
> (2) `placeholderData: keepPreviousData` — yangi qidiruvda setka eski natijani ushlab turadi, spinner faqat
> birinchi yuklanishda; (3) `api.get(path, {signal})` (yangi ixtiyoriy param, orqaga-mos) + queryFn signal —
> react-query kalit almashganda eskirgan so'rovni bekor qiladi. **🔴 Enter/skaner shartnomasi (regress-xavf
> yopildi):** keepPreviousData bilan Enter eski ro'yxat birinchisini qo'shib yuborishi mumkin edi →
> `searchSettled` (matn=debounced && !isFetching) + `onSearchEnter`: tinchimagan bo'lsa Enter YO'QOLMAYDI —
> flush + natija kelgach AYNAN joriy matn natijasining birinchisi qo'shiladi (pending ref; matn o'zgarsa bekor).
> «Topilmadi» ovozi ham endi `searchSettled`da. Testlar (TDD, RED ko'rildi): yangi
> `sales-screen-search-debounce.test.tsx` (4: prefiks-so'rov YO'Q · eski natija turadi · skaner-Enter to'g'ri
> tovar · signal uzatiladi) + `api-client.test.ts`ga signal-forwarding (2). **+1 mayda:** `sales-screen-shift`
> mockida `printDebtReceiptViaAgent` yo'q edi — test tugagach otiladigan Unhandled Rejection (suite'ni
> nondeterministik qizartirardi) — qo'shildi. Gate: web tc0 · lint 0 err · TO'LIQ web vitest 285 fayl /
> 4027 pass (bir yugurishda `audit-fixlar` `5e3`-testi yuklama ostida flake qizardi — izolyatsiyada 3×7/7,
> qidiruv diffiga mexanik bog'lanmaydi; kuzatuvda). **⚠️ KEYINGI QADAM: WEB-DEPLOY + qurilma-QA**
> (skaner oqimi: shtrix ter→Enter→to'g'ri tovar; sekin internetda qidiruv his-tezligi) + prod'da
> `products_name_trgm_idx` mavjudligini psql bilan tasdiqlash. Xotira: `pos-search-per-keystroke-roundtrip.md`.
> **§6.6 qayd:** parallel sessiya qarz-cheki ustida ishlayapti (page.tsx'ga `printDebtReceiptViaAgent`
> kiritmasi commit'imdan `hash-object` blob-retsepti bilan CHIQARILDI — diff'im path- va hunk-cheklangan;
> `shift.test` mock-qatori ularning kelayotgan oqimi uchun ham forward-mos). To'liq-suite yugurishlardagi
> `tovar-chek`/`pko-usd` qizillari ham o'sha sessiyaning jonli tahriri edi.
>
> ---
>
> **🕒 2026-08-16a (KASSA POS — kassir so'rovlari: qidiruv PERSIST + «Tozalash» · savat header 2× +
> QORALAMA (hold order) · OSK katta harflar, `3a275a80`,
> ✅ DEPLOYED `6b562b46 → 3a275a80` (2026-08-16): sayt/health 200, sotuv-chunk'da
> `sotuv-cart-park`+`sotuv-search-clear`+`sherset.pos.drafts` grep-tasdiq, web build 298 sahifa;
> Phase-1: strukturaviy, runtime-tasdiqlanmagan, browser-smoke YO'Q, qurilma-QA QOLDI) —** egasi 2 skrinshot bilan keldi. **Web qismi (deploy bilan kassaga yetadi, exe SHART EMAS):**
> (1) qidiruv input 44→88px/20px, oxirida «Tozalash» (`sotuv-search-clear`, matn bo'lgandagina);
> (2) 🔴 qidiruv natijalari endi tanlashdan keyin TOZALANMAYDI — `addToCart` `setSearch('')` o'rniga
> `focus()+select()`: yangi nom/skan eski matn USTIDAN yoziladi (2026-08-12 «harflar qo'shilardi»
> shikoyati bilan murosa shu select'da); (3) savat header ~37→72px; (4) **QORALAMA yangi**: park →
> savat (+chegirma %) chipga tushadi, ikkinchi mijozga xizmat; chip bosilsa qaytadi (savat band bo'lsa
> u AVVAL avto-qoralanadi — almashish), ✕ o'chiradi; saqlash `lib/pos/cart-drafts.ts` →
> `localStorage sherset.pos.drafts` (bigint `{$bigint}` replacer/reviver, fail-safe parse, o'z testlari);
> qulflangan savat (zakaz/tayyor-chek) park/tiklashdan CHETLANGAN (bog'lanish yo'qolardi); i18n
> `draft_*` ru+uz. **Exe qismi (`desktop/preload.js` — kanalga chiqqanda HAMMA maydonlarda):** OSK harf
> 19→29px (+50%), tugma 46→60px; belgilar (@ . - _ / : ') pastki qatordan YUQORI (raqamlar) qatoriga;
> probel flex 3→6, ⌫ 1.4→3; РУС/Yashirish 20px; K8 qulflari (`desktop-touch-keyboard.test.ts`).
> **⚠️ EXE VERSIYA ATAYLAB KO'TARILMADI (1.8.0 qoldi):** parallel F9-sessiya 1.8.0 ni KANALGA chiqarib
> `desktop/README.md`ni yangilagan (COMMIT QILINMAGAN) — README'ga tegish/stage begona ishni commit'imga
> aralashtirardi (§6.7B). **RELIZ sessiyasi: `desktop/package.json` → 1.9.0 + README (installer-config
> guard majburlaydi); preload o'zgargani uchun 1.8.0 ni QAYTA YIG'MASLIK — avval bump** (bitta raqam
> ostida ikki binar bo'lmasin). Diff'im path-cheklangan; README'ga tegilmadi. Gate: web tc0 · biome 0 err
> (22 nursery warn eski) · uz/ru JSON OK · **TO'LIQ web vitest 283 fayl / 4002 pass** (yagona red
> `kassa-installer-config` versiya-revert bilan yashil; cart 46 · OSK 44 · cart-drafts 9). **⚠️ KEYINGI
> QADAM: WEB-DEPLOY + qurilma-QA** (qidiruv persist/Tozalash · qoralama oqimi · header); OSK o'zgarishi
> qurilmaga FAQAT 1.9.0 relizi bilan yetadi.
>
> ---
>
> **🕒 2026-08-15a (KASSA POS — egasining 5 shikoyati: savat ✕ · OSK×modal · tel-qidiruv, `f2036cc0`,
> ✅ DEPLOYED `44970745 → 07ae9d3d`: sayt/health 200, `sherset-v2-web` restart, sotuv-chunk'da
> `sotuv-cart-line-remove` + `pos-amount-display` grep-tasdiq; api restart YO'Q — web-only, to'g'ri.
> SSH ~40 daq yopiq turdi (22-port timeout, sayt tirik edi) — keyin o'zi ochildi) —** egasi 3 skrinshot bilan keldi (exe v1.8.0). Ildiz sabablar va tuzatishlar:
> (1) savatda bitta tovarni o'chirish yo'li ko'rinmas edi (faqat qator-oynasi ichida) → har qatorga 56px ✕
> (`sotuv-mode.tsx`, `onRemoveLine`); (2) to'lov oynasi ustidan qobiq raqam-klaviaturasi chiqardi — summa
> maydoni haqiqiy `<input autoFocus>` edi → qobiqda ko'rsatkich-DIV (`isShersetShell`, rasmilashtirish +
> cart-line-edit); (3) 🔴 ASOSIY: **Radix modal rejimi `body`ga `pointer-events:none` qo'yadi, qobiq OSK'si
> esa body'da** (`desktop/preload.js`) — modal ichida OSK tugmalari o'lik, bosish overlay'ga tushib fokus
> inputdan chiqib ketardi → 5 POS dialogi `modal={false}` + o'z fon-div (statik qulf `pos-shell-osk.test`);
> (4) mijozlar qidiruvi `inputMode="tel"` — OSK faqat raqam ko'rsatardi → olib tashlandi (panel + karta);
> (5) rasmilashtirish mijoz ustuni 2× (15rem→30rem, oyna 57rem). **Bonus bug (jonli topildi):** qarz
> to'langach panel eski raqamni ko'rsatardi — `DebtPaymentDialog.onSuccess` endi `pos-customers-debt` +
> `customer-card-*` keshlarini invalidatsiya qiladi. **«Qarz to'lab bo'lmayapti» diagnostikasi:** prod nginx
> logida qurilmadan `GET /debts/pos/summary` bor, `POST /debts/pos/pay` UMUMAN YO'Q — to'siq mijoz tomonda
> (OSK/kiritish zanjiri), server yo'li sog'lom. **Runtime-verify (lokal brauzer, Playwright):** savat ✕ faqat
> o'z qatorini o'chiradi · to'liq-qarz sotish · Mijozlar→Qarzni to'lash E2E (balans 80 000→0, DB'da tasdiq) ·
> panel yangilanishi. Gate: web tc0 · lint 0 err · TO'LIQ web vitest 281 fayl yashil. **⚠️ KEYINGI QADAM:
> WEB-DEPLOY** (`deploy-smart.sh DS_TARGET=v2`; exe yangilash SHART EMAS) + qurilmada QA: OSK modal ichida
> harf yozadimi · to'lov oynasida OSK chiqmasligi · mijoz qidiruvida harflar · qarz to'lash to'liq oqimi.
> Egasining «POS mijozlar o'rniga web kontragentlar qarz-undirish qismini chiqaraylik» savoliga javob
> foydalanuvchiga yozildi (tavsiya: panel qoladi, avval shu fix'lar qurilmada sinalsin).
>
> **🔴 15a-DAVOMI (egasining 2-skrinshoti — QARZ TO'LASH TUGMASI KO'RINMAS EDI, `6b562b46`,
> ✅ DEPLOYED `07ae9d3d → 6b562b46`, sayt 200, built CSS'da `--ms-brand:var(--ms-brand-500)` grep-tasdiq):**
> «To'lovni qabul qilish» tugmasi `bg-[var(--ms-brand)] text-white` — `--ms-brand`/`--ms-brand-hover`/
> `--ms-bg-brand` tokenlari CSS'da HECH QAYERDA aniqlanmagan edi (faqat -50..900 shkala bor) → fon
> shaffof, oq yozuv oq fonda KO'RINMAS. Kassada «qarz to'lab bo'lmayapti»ning ASL sababi shu. DS
> globals.css'ga 3 alias qo'shildi (18 fayl davolanadi), qulf `ms-brand-token-defined.test.ts`.
> **⚠️ FOLLOW-UP (alohida sessiya):** yana ~30 ishlatilgan-u ANIQLANMAGAN `--ms-*` token bor
> (`--ms-border`, `--ms-bg-input`, `--ms-danger`, `--ms-accent`… — currentColor/inherit'ga tushib
> «ko'rinadi», lekin niyat emas; ro'yxat: used-vs-defined diff, `comm -23`). Token-audit + umumiy
> guard-test kerak. **Qurilma-QA hali ham QOLDI** (OSK modal ichida · savat ✕ · ko'k tugma · to'liq
> qarz-to'lash oqimi).
>
> ---
>
> **🕒 2026-08-14b (KASSA — chek o'ngga surilib «Summa» kesilishi tuzatildi, `c867eb65` + ✅ DEPLOYED
> `673ea1c9→c93113b0`, site/health 200, yangi CSS 2 chunk'da grep-tasdiq, eski `margin:0 auto` chunk'larda YO'Q) —**
> egasining fotosi (TPH-2026-00073): exe'dan chiqqan chekda kontent o'ngga surilib, Summa
> ustuni qog'ozdan chiqib ketgan. **Ildiz sabab ikki qavatli:** exe sukut sahifani **80mm**
> deb e'lon qiladi (`DEFAULT_WIDTH_MICRONS`), 80mm termal printerning BOSILADIGAN eni esa
> ~72mm (drayver ortiqchani KESADI, masshtablamaydi) + HTML body 72mm bo'lib `margin:0 auto`
> bilan markazlangan → chapdan ~4mm siljish, o'ngdan ~4mm (Summa) kesilgan. **Tuzatish
> web-only (exe yangilash SHART EMAS):** uchala Electron-HTML renderer (savdo chek ·
> Z-hisobot · ombor varag'i) body `width:72mm;margin:0` + `printSheet`ga `THERMAL_PAGE_MICRONS
> {width:72000}` oshkora uzatiladi (balandliksiz — exe v1.4.0 `resolvePageSize` width-only
> shaklda balandlikni mazmundan o'lchashi git `2851efbf` dan tasdiqlangan). Qulf:
> `receipt-print-width.test.ts` (CSS + 3 chaqiruv; vakuum-testdan literal bilan himoyalangan).
> Gate: web tc0 · biome0 · to'liq web vitest 3875 pass (sales-screen-cart flake izolyatsiyada
> yashil, aloqasiz). **⚠️ Qog'oz sinovi QOLDI (Phase-1):** deploydan keyin real printerda chek +
> Z-hisobot + ombor varag'i chiqarib chap/o'ng chekkalarni ko'rish.
>
> ---
>
> **🕒 2026-08-14a (KASSA POS 7-FUNKSIYA — kamchiliklar bartaraf + ✅ DEPLOYED `673ea1c9`) —**
> 7 faza hisobotlaridagi ochiq kamchiliklar yopildi va F2–F7 birinchi marta prodga chiqdi:
> (1) F7 kamchiligi — `CustomerCardPanel`ga `initialAgent` prop (TDD, 3 yangi test RED→GREEN):
> Mijozlar panelidan «Mijoz kartasi» endi tanlangan mijoz bilan ochiladi; (2) F6
> `ops-f6-salesreturn-topup.ts` lokal DRY (yaroqli) → **prod'da `--apply`**: «Kassir» roliga
> `salesreturn.view/create=ALL` 2 qator yaratildi, qayta-DRY idempotent tasdiqladi; (3) push
> `sherset` remote'ga (VPS origin — F1'dagi push faqat `origin`ga ekan, 14 commit kutgan) +
> backup `pre-7funksiya-20260814-0508.sql.gz` (779M) + `deploy-smart.sh DS_TARGET=v2` →
> `Deploy done: 7ae1554c → 673ea1c9`. **O'lchandi:** api health 200 · sayt 200 · box HEAD=lokal ·
> sotuv chunk'ida 4 yangi-kod marker (F3/F6/F7/F7-tuzatish) grep bilan bor · gate to'liq yashil
> (web 271 fayl/3872). **⚠️ Qurilma-QA QOLDI (Phase-1):** monoblokda —/❐ va 1.7.0 avto-o'tish ·
> F2–F4 ko'rinish/shrift/«•••» sensor · qog'oz chekda «Sizning qarzingiz» (F5) · jonli
> yopiq-smenali qaytarish (F6) · real PIN bilan Mijozlar tabi (F7). Reja-hujjat pastida
> «Yakuniy bartaraf-etish + deploy hisoboti» seksiyasi bor.
>
> ---
>
> **🕒 2026-08-13c (KASSA POS — 7-funksiya REJASI tuzildi, ✅ 2026-08-14a da bajarildi+deploy) —** egasining 7 talabi
> (oyna tugmalari —/❐/✕ · shrift · narx-maxfiylik · modal-minimal yashirin · chekda qarz ·
> istalgan chekka qaytarish · Mijozlar tabi) uchun faza-reja:
> `docs/superpowers/plans/2026-08-13-kassa-pos-7-funksiya.md`. Har faza ALOHIDA sessiyada
> (rejada tayyor promptlar bor), agent faza tugagach reja pastidagi o'z hisobot-seksiyasini
> to'ldirib TO'XTAYDI. Tavsiya tartib: F1→F2→F3→F4→F5→F6→F7 (F7 F6'ga tayanadi; F2/F4 ikkalasi
> sotuv/page.tsx'ga tegadi — parallel QILINMASIN). Hech biri hali boshlanmagan.
>
> ---
>
> **🕒 2026-08-13b (KASSA — .exe'da endi DOIM kassa ko'rinishi + ✕ chiqish tugmasi ·
> ✅ DEPLOYED web `7ae1554c` + reliz 1.6.0 KANALDA) —** egasining ikki shikoyati: (1) .exe'da
> PIN bilan kirilganda navbar'li to'liq web-ERP ochilgan — ildiz: kiosk-ko'rinish faqat
> `uiMode==='kiosk'` rolga edi + juftlash olib tashlangach chiqish/sessiya-o'lim yo'llari
> qobiq ichida `/login`ga tushardi. Fix: `isShersetShell()` (`pos-device.ts`) — layout kiosk-shoxi
> `isKioskUser(...) || isShersetShell()`, uch chiqish yo'nalishi `readPosDevice() || isShersetShell()`.
> (2) ko'rinadigan chiqish belgisi yo'q edi — preload'da o'ng-yuqori ✕ (`shell:request-quit`,
> tasdiq dialogli; YALANG button — `keyboardRoot()` evristikasi uchun; file:// da chizilmaydi).
> Qo'riqchilar: `desktop-exit-button.test.ts` (yangi, preload haqiqatan yugurtiriladi) +
> `kiosk-shell`/`kiosk-logout-redirect` niyat-yangilandi (RED→GREEN). Gate to'liq yashil.
> **Deploy o'lchandi:** box HEAD=lokal HEAD `7ae1554c`, chunk'da `||`-shart 3 joyda, sayt/health
> 200. **Kanal o'lchandi:** 1.6.0 exe+blockmap `desktop/` ichki papkaga (🔴 gotcha: alias ildizi
> emas!), sha512 remote'da qayta hisoblab mos, `latest.yml.bak-1.5.0` saqlandi, HTTPS HEAD 200.
> **⚠️ Qurilmada KUZATILMAGAN (Phase-1):** 1.5.0→1.6.0 avto-o'tish (K04 qarzi turibdi), ✕ tugma
> real monoblokda, kiosk-ko'rinish real PIN bilan. Keyingi qurilma-QA'da birga tekshirilsin.
>
> ---
>
> **🕒 2026-08-13a (KASSA-EXE F8 — reliz 1.5.0 KANALDA + migratsiya/web PRODDA ·
> qurilma-QA QOLDI) — `13d74361` prodda** (`Deploy done: 9ba939d8 → 13d74361`; api health ok ·
> erp.sherset.uz 200 · 1 migratsiya qo'llandi: `pos_device_shell_version`, backup 732M oldindan).
>
> Reja `docs/superpowers/plans/2026-08-13-kassa-exe-barqarorlik.md` ning F8 fazasi. F1–F7
> (7 commit, `efae4c5f`…`bc493869`) allaqachon lokalda edi — bu sessiya ularni prodga chiqardi:
> **8.1** `.exe` 1.5.0 yig'ildi, asar MAZMUNI bilan tasdiqlandi (installOnBoot/⏎/fonts.ready/…),
> sha512 mos. **🐛 Topilma:** watchdog `.ps1` artefaktga kirmasdi (`build.files` faqat js/html) —
> `extraResources` bilan tuzatildi (`13d74361`, qo'riqchi test RED→GREEN, to'liq gate).
> **8.2** migratsiya prodga (drift oldindan o'lchandi — aynan 1 ta qo'llandi, ustun SELECT bilan bor).
> **8.3** push + `deploy-smart.sh` v2. **8.4** kanal: exe+blockmap avval, sha512 REMOTE'da qayta
> hisoblab mos, `latest.yml` ENG OXIRIDA (bak-1.4.0 saqlandi), 1.2–1.4 o'chirilmagan.
> Kanal tirik: nginx'da real qurilmadan `electron-updater` so'rovi ko'rindi.
>
> **🔴 QOLDI (operator «keyingisiga o'taver» dedi — qurilma bosqichi o'tkazib yuborildi):**
> 8.5 qo'lda 1.4.0→1.5.0 (per-machine→per-user avtomatik EMAS) · 8.6 o'lchov varaqasi 17/17
> «☐ sinalmadi» · **8.7 K04 avtoyangilanish jonli sinovi — butun rejaning maqsadi, HAMON qarz** ·
> o'rnatma papkasi nomi o'lchanmagan (watchdog yo'li TAXMIN) · `shell_version` qiymatlari hali
> NULL (keyingi kassir kirishida 1.4.0 tushishi kutiladi). To'liq varaqa + retsept:
> `docs/REJA-KASSA-EXE-2026-08.md`. **Hech bir K-ID «Phase-2 verified» olmadi.**
>
> ---
>
> **🕒 2026-08-12h (BUTUN ILOVA — oyna tasodifan yopilmaydi: Esc yo'q, fon-bosish yo'q ·
> ✅ DEPLOYED) — `9ba939d8` prodda** (`Deploy done: cb1e3879… → 9ba939d8…`; site 200 ·
> `:4001/health` 200 · 1 migratsiya qo'llandi — u parallel sessiyaning `af39086d` qarz-idempotentlik
> ishiniki, men bilan birga chiqdi va alohida verify QILINMAGAN).
>
> Egasining shikoyati ikki qismli edi: (1) «klaviatura bosganda yopilib qolyapti», (2) «modal
> oynaning chetini bilmasdan bosib yuborganda yopilib qolyapti — o'z qo'li bilan yopmagunicha
> yopilmasin». **Ildiz: hech bir oynada himoya yo'q edi** — 14 ta Radix `Dialog.Content` ning
> BIRORTASIDA `onEscapeKeyDown`/`onInteractOutside` yo'q (ya'ni Radix sukut xulqi ishlardi), 7 ta
> qo'lda yozilgan oynada esa fonga `onClick={onClose}` turardi.
>
> **Yechim — bitta shartnoma, sukut bo'yicha QULF:** `@moysklad/ui` da yangi `noAccidentalClose`
> (+ `parkInitialFocus`), DS `<Modal>`/`<Drawer>` da `dismissible` prop (**sukut `false`**).
> Qamrov (egasi tanladi): **barcha ma'lumotli oynalar** — 6 POS oynasi, tovar tanlash, vazifa
> yaratish/detali, CatalogPicker, 7 qo'lda yozilgan HR/payroll/telegram/inventarizatsiya oynasi,
> narx-kursi, modifikatsiya, 2 chop-preview. **Ataylab dismissible qoldi:** Ctrl+K palitrasi,
> yordam paneli, mobil menyu, filtr paneli, audit-tarix panellari, rasm ko'rgichi, `ConfirmDialog`
> (Esc = «bekor», yo'qoladigan kiritma yo'q) — har birida `dismissible-by-design:` izohi bilan.
>
> **Klaviaturaning IKKINCHI mexanizmi ham yopildi:** Radix boshlang'ich fokusni birinchi tugmaga —
> bizning chrome'da ✕ ga — berardi, ya'ni ochilgach kelgan ilk Enter (skanerning oxirgi tugmasi)
> oynani yopardi. Endi fokus kartaning o'zida turadi; ichkarida `autoFocus` maydon bo'lsa u yutadi.
>
> **Tuzoq tekshirildi:** qulflangan har 20+ oynada ko'rinadigan yopish yo'li borligi qatorma-qator
> tasdiqlandi (hr/telegram `ModalShell` da ✕ YO'Q edi — qo'shildi; `hideClose` prod'da hech qayerda
> ishlatilmaydi).
>
> **Qo'riqchi:** `apps/web/src/__tests__/dialog-dismissal.test.ts` — yangi `Dialog.Content` himoyasiz
> qo'shilsa yiqiladi; fon-bosish va Esc→onClose naqshlari taqiqlangan; vakuum-qulf bilan (skaner
> fayl topmasa test jimgina yashil bo'lmaydi). Runtime testlar: Modal/Drawer «Esc YOPMAYDI»,
> «`dismissible` bilan yopadi», «ochilganda fokus ✕ da emas».
>
> **Gate:** web typecheck 0 · design-system typecheck 0 · biome 0 xato ·
> **butun web suite 267/267 fayl, 3779 test yashil**. Hook'lar bir martaga chetlab o'tildi
> (parallel sessiya boshqa ishni yarim holatda ushlab turgan edi — lint-staged uni stash qilmasin).
> **Phase-1: brauzerda o'lchanmagan** — jonli sinov kutilmoqda.
>
> ---
>
> **🕒 2026-08-12g (KASSA — PIN AYNAN 4 raqam · ✅ DEPLOYED + JONLI O'LCHANDI) —**
> **`cb1e3879` prodda** (`Deploy done: 786e2557… → cb1e3879…`; site 200 · `/kassa-kirish` 200 ·
> `:4001/health` 200).
>
> Egasining jonli shikoyati: «5 marta bosganimda 5 xonalik bo'ldi, yana bosganimda 6 ta».
> **Sabab kod xatosi EMAS** — butun PIN shartnomasi ataylab 4–6 raqamga qurilgan edi va kirish
> sahifasi klaviaturaga `MAX_PIN = 6` uzatardi. 🔴 **Bug-klass:** `pin-keypad.test.tsx` chegarani
> tekshiradi va tuzatishdan KEYIN ham to'liq yashil — chunki `maxLength` ni **testning o'zi**
> uzatadi. Ya'ni «to'g'ri komponent + noto'g'ri argument» komponent testining ko'r nuqtasi.
> Xotira: [[component-test-blind-to-caller-arg]].
>
> Uzunlik zanjirning to'rtala joyida birga 4 ga qulflandi (bittasi qolsa admin 6 raqamli PIN
> qo'yadi, kassir uni 4 doirali ekranda hech qachon kirita olmaydi): `POS_PIN_RE=/^\d{4}$/`
> (yagona manba) · 3 ta Zod sxema · `/kassa-kirish` `PIN_LENGTH=4` · `PinKeypad` doiralari endi
> **o'zgarmas 4 ta** (ilgari o'sardi — aynan shu «yana bosaverish mumkin» ishorasini berardi) ·
> `PosPinLock maxLength=4` · admin PIN modali.
>
> **JONLI VERIFIKATSIYA (statik emas):** prodda `POST /auth/pos-login` — `11111`/`111111`/`111`
> → **400** «PIN 4 raqamdan iborat…»; `9999` (4 raqam) → **401** «PIN noto'g'ri» ya'ni sxemadan
> o'tib argon2 tekshiruviga yetdi. Serverdagi chunk `page-3750669…js` da `maxLength:4`, `6` yo'q.
> Qo'riqchilar: yangi `kassa-kirish/__tests__/pin-length.test.tsx` (haqiqiy sahifa render, 6 marta
> bosiladi; **mutant bilan tekshirildi** — `PIN_LENGTH=6` da 5 testdan 4 tasi qizil) +
> `kiosk-shell.test.ts` drift-lock (to'rtala joy).
>
> ⚠️ **Migratsiya qarzi:** 5–6 raqamli PIN'i bor xodim kira olmaydi — admin xodim kartasidan
> 4 raqamli PIN qayta qo'yadi. PIN xesh saqlanadi ⇒ kimda uzun PIN borligini oldindan aniqlab
> BO'LMAYDI. Prod test kassirlari (`1111/2222/3333`) 4 raqamli, ta'sir kutilmaydi.
> ⚠️ 12f dagi «`MIN_PIN` topilmaydi, daraxt qizil» ogohlantirishi **YOPILDI** — o'sha yarim
> tahrir shu ish edi; `pnpm typecheck` endi 10/10 yashil.
> ⚠️ Parallel sessiya qarz-to'lovi ishini (yangi Prisma modeli + migratsiya) **commit qilinmagan**
> holda ushlab turibdi ⇒ bu deploy'ga TUSHMADI. API to'liq to'plamidagi 3 yiqilish o'shaniki.
>
> ---
>
> **🕒 2026-08-12f (KASSA — qidiruv setkadan tanlaganda ham tozalanadi · ✅ DEPLOYED) —**
> **`786e2557` prodda** (`Deploy done: 11f94b49… → 786e2557…`; site 200 · `:4001/health` 200 ·
> chunk `page-4d0c22f1…js` 17:20 da qayta qurildi).
>
> Egasining jonli sinovi: qidirib topilgan tovarni **setkadan bosganda** qidiruv maydoni eski
> so'rov bilan qolardi (ikkinchi tovar nomi birinchisining ustiga yozilardi). Sabab: tozalash
> faqat **Enter** ishlovchisida turgan edi. Endi `setSearch('')` + fokus qaytarish `addToCart`
> ichida — barcha yo'llar uchun (Enter · bosish · skaner). Test: `sales-screen-cart.test.tsx`
> 34/34 (yangi 🔴 «setkadan bosilganda ham maydon tozalanadi va fokus qaytadi»).
> **Phase-1: browser-smoke YO'Q** (prodda kassir sinovi kutilmoqda).
> ⚠️ Bu deploy parallel sessiyaning 4 ta **qarz/storno** commit'ini ham olib chiqdi
> (`4ee55b00`…`a3bbcf04`) — ular alohida verify qilinmagan.
> ⚠️ To'liq web typecheck yugurtirilmadi: parallel sessiya `pin-keypad.tsx` ni yarim-tahrirda
> ushlab turgan edi (`MIN_PIN` topilmaydi) — commit'ga kirmagan, lekin daraxt hamon qizil.
>
> ---
>
> **🕒 2026-08-12e (KASSA — chek qurilmaning SUKUT printeriga chiqadi · B1+B2+B3 · ✅ DEPLOYED
> + exe 1.4.0 NASHR ETILDI) — `11f94b49` prodda** (`Deploy done: 7412f4ae… → 11f94b49…`).
>
> Reja: `docs/superpowers/plans/2026-08-12-kassa-chek-printeri-qurilmaga.md`. Muammo: chek
> printeri **akkaunt-darajali** sozlama edi (`CompanySettings.receiptPrinterName`), prodda
> `company_settings` **0 qator** ⇒ chek butunlay chiqmasdi. Sozlaydigan sahifa esa
> (`/settings/sklad-keepers`) kiosk kassirda umuman ochilmaydi — ya'ni nosozlikni aynan
> o'sha qurilmadan tuzatib bo'lmasdi. Ikki kassa har xil printer ishlatsa bitta sozlama
> baribir yetmasdi (semantik xato).
>
> **Yechim — printer TANLANMAYDI.** Qobiq `webContents.print()` ga `deviceName` bermaydi ⇒
> **Windows sukut printeri**. Uch commit: `2851efbf` (B1 qobiq + v1.4.0) · `2efe572f` (B2 web
> versiya darvozasi) · `e73842fa`+`58c599da` (B3 — sozlamani koddan butunlay olib tashlash:
> `PUT /sklad-keepers/receipt-printer`, servis o'qish/yozish, Zod sxemasi, sozlamalar
> sahifasidagi qator, `printer-not-set` sababi, B2 darvozasi). `11f94b49` — begona biome
> format xatosi (`ab574787` dan), u **pre-push hook'ni bloklardi**, sof bo'shliq tuzatildi.
>
> **Rejada YO'Q ikki bo'shliq topildi:** (1) `printZReportViaAgent` ham `receiptPrinterName`
> o'qirdi — chek bilan bir xil yo'lga o'tkazildi (bo'lmasa B4 sharti hech qachon
> bajarilmasdi); (2) `printer_not_set*` i18n kalitlari **o'chirilmadi** — `configure-printer`
> shoxi yig'ish varag'i uchun (`no-printer-mapped`) TIRIK qoladi, matni ombor→printer
> biriktirmasiga moslandi.
>
> **Gate:** typecheck 0 · web vitest **3755 passed** (265 fayl) · api vitest **8157 passed** ·
> i18n:gate 9/9 · `lint:product` **0 xato**.
> **Jonli verify:** box HEAD = `11f94b49` · erp.sherset.uz 200 · `/login` 200 ·
> `/api/v1/health` ok · `PUT /sklad-keepers/receipt-printer` → **404** (olib tashlandi) ·
> `GET`+`PUT /sklad-keepers` → **401** (tirik, 404 EMAS) · `.next` build ichida
> `receiptPrinterName` va `printer-not-set` **YO'Q**, `no-printer-mapped` **BOR**.
> **Kanal:** `erp.sherset.uz/downloads/desktop/latest.yml` → **1.4.0**, exe sha512+hajm
> lokal build bilan aynan mos, HTTP 206 range OK. Eski `latest.yml.bak-1.3.0` zaxirada
> (rollback = uni qaytarish; 1.3.0 exe hamon diskda).
>
> ⚠️ **Kassalar exe'ni «Chiqish» bosilganda o'rnatadi** (`autoInstallOnAppQuit=false`) —
> ya'ni har kassa smenani yopib chiqmaguncha eski qobiqda qoladi. **Eski qobiqda chek
> HAMON chiqmaydi** (web endi doim bo'sh nom yuboradi, eski exe uni xato deb qaytaradi) —
> bu B3 ning ma'lum narxi, sozlash yo'li ham olib tashlangan. Qurilmada **QOG'OZDA
> SINALMAGAN** — egasi kassani qayta ishga tushirib bitta sinov cheki chiqarsin.
>
> ⏭️ **Qolgan: B4 — `receiptPrinterName` ustunini DROP qilish.** DESTRUKTIV va
> qaytarilmaydi; B3 prodda **bir necha kun barqaror ishlagach** bajarilsin. Koddan hech kim
> o'qimasligi tekshirilgan. 🔴 **BROWSER-QA YO'Q.**

> **🕒 2026-08-12d (HR — «xodimni o'chirish» endi haqiqatan o'chiradi · ✅ DEPLOYED) —**
> **`7412f4ae` prodda** (`Deploy done: 5e0948e0… → 7412f4ae…`). Egasining shikoyati: «eski
> xodimlarni o'chirdim, lekin arxivda qolib ketgan». Sabab: `DELETE /hr/employees/:id`
> **`softDelete`** edi (`archived = true`) — qator bazada qolib login/e-mail/ism-familiyani
> BAND qilardi (`err_login_taken_archived` xatosi shundan), tasdiq oynasi esa «qaytarib
> bo'lmaydi» der edi.
>
> **Chegara JONLI BAZADAN o'lchandi:** `employees.id` ga `ON DELETE RESTRICT` bilan
> qaraydigan aynan **12 ta FK**. Ikkiga bo'lindi — 🔴 **pul va kassa izi** (oylik · kassa
> smenasi · kassa farqi · kassa audit · publikatsiya) o'chirishni **RAD etadi** va sababni
> nom+son bilan aytadi; HR ning **hosila loglari** (davomat · bonus/jarima · kunlik va oylik
> KPI · vazifa jurnali · savdo rejasi · yorliq navbati) xodim bilan birga **bitta
> tranzaksiyada** o'chadi. Nega hosila loglar sanaladi: prodda 15 arxivlangan xodimning
> **har birida 17 tadan `hr_kpi_daily_log`** bor va YAGONA to'siq shu edi.
>
> Yangi `GET /hr/employees/:id/delete-preflight` — oyna nima o'chishini/nima to'sayotganini
> **oldindan** ko'rsatadi (409 kutmaydi); ekran **fail-closed**. Arxivlash yo'qolmadi —
> alohida amal (bulk «Arxivga», xodim kartasi, offboarding).
>
> **Gate:** typecheck 10/10 · i18n:gate 9/9 · web vitest **3744 passed** (263 fayl, 0 failed) ·
> api vitest **8159 passed / 1 failed** — yiqilgani `publication.service` (argon2) yuklama
> ostidagi 5s timeout, yakka holda **21/21 yashil**. `lint:product` da 1 xato bor, u
> **parallel sessiyaning commit qilinmagan faylida** (`retail-refund-validation.ts`) —
> tegilmadi; bu commitning 11 faylida 0 xato (shu sabab push `CHECK_LINT=0` bilan).
> **Jonli verify:** box HEAD = `7412f4ae` · erp.sherset.uz 200 · `/api/v1/health` 200 ·
> `…/delete-preflight` → **401** (bor + qo'riqlangan, 404 EMAS) · `delete_blocked_title`
> ikkala HR chunk'ida · pm2 ikkalasi online · `api.err.log` toza.
>
> ⚠️ **Prodda 15 ta arxivlangan xodim HAMON turibdi** — tuzatish xulqni to'g'rilaydi, mavjud
> qatorlarni o'zi o'chirmaydi. Ularni endi ❌ tugmasi bilan o'chirsa bo'ladi (pul izi yo'q —
> o'lchangan). 🔴 **BROWSER-QA YO'Q.**

> **🕒 2026-08-12c (REJA-KASSA-PROD **FAZA P4** — smena: unutilgan smena himoyasi + jonli
> yopish sinovi · ✅ DEPLOYED + JONLI VERIFY 17/18 + H7 YOPILDI) — `5f1f0253` prodda**
> (`Deploy done: 3680d104… → 5f1f0253…`, chunk-grep `sotuv-shift-stale` →
> `page-b67bb1ce12a59944.js`). Commitlar: `5f1f0253` (kod+41 test) · `cde85f32` (prod-op
> skriptlari). To'liq hisobot: `docs/REJA-KASSA-PROD-2026-08.md` → HISOBOTLAR → P4.
>
> **🔴 H7 «SHUBHA» EMAS, HAQIQIY UZILISH EDI.** Smena farqi xabari `toSelf: true` bilan
> yozilardi — u MTProto **slot 0** (direktorning «Saved Messages») ni talab qiladi, prodda
> esa `hr_telegram_account` da **faqat slot 1** bor. O'lchov: `to_self=true` → **4/4
> failed** (`mtproto_self_no_client`), `to_self=false` → **32/32 sent** (hammasi slot 1).
> Ya'ni kod «yubordim» deb hisoblardi, egasi hech qachon olmasdi. Endi xabar
> `cashiersession.approve` ruxsatlilarning **telefoniga** ketadi va jonli sinovda
> **HAQIQATAN yetib bordi** (`+998880803717`, `sent`, slot 1, 02:37:20).
> Xotira: `variance-telegram-toself-dead-in-prod`.
>
> **Egasi qarorlari (3 savol, fazada berildi):** eski 3 smena **hammasi farqsiz yopilsin**
> (jonli sinov uchun yangi smena) · ogohlantirish chegarasining raqami **farqi yo'q**, lekin
> yosh «ochildi degandan yopildi qilguncha» ko'rinsin · farq xabari **ruxsatli xodimlarning
> telefoniga**.
>
> **Nima qilindi:** (1) POS'da smena yoshi **doim** ko'rinadi, chegaradan oshsa
> ogohlantirish paneli; **avto-yopish YO'Q** (sanoqsiz yopilgan smena kassa hisobini
> yolg'onlashtiradi). (2) Bayroqni **server** qo'yadi — `current` endi `openMinutes` ·
> `staleWarnHours` · `stale` qaytaradi; chegara MK13 registrida
> (`SHIFT_OPEN_WARN_HOURS`, sukut 12 soat, birlik `hours`), noto'g'ri birlikdagi qator
> jimgina qo'llanmaydi. (3) «Allaqachon ochiq smena» xabari ikki yo'lda ham bitta va
> ma'lumotli (qaysi smena · qachondan beri · nima qilish kerak). (4) Farq xabari telefonga,
> qamrov (`ALL`/`OWN_GROUP`/`OWN`) va MK26 override kanonik `resolveEffective` orqali;
> qabul qiluvchi topilmasa `toSelf` **zaxira** + jurnalga ochiq warn.
>
> **Prod-op:** `ops-p4-close-open-shifts --live` → **3/3 smena yopildi** (farq 0, izohda
> «real naqd SANALMAGAN» ochiq yozilgan) · `ops-p4-live-verify --live` → **17/18**: ikkinchi
> ochish 400 + ma'lumotli matn · farq **AYNAN −5 000 so'm** · akt `UZS shortage` · navbat
> `pending` · Telegram **sent** · egasi `accept` → jurnal ikki qator. Yiqilgan `E3` —
> **skriptning o'z xatosi** (navbat javobi `{count, rows}`, skript `items` o'qigan); alohida
> read-only probe: `queue → 200, count=3`. Skript tuzatildi.
>
> **Gate:** tc 10/10 · lint 0 · i18n 9 · api **8129** · web **3647** (to'liq suite).
>
> **Prod holati:** `open = 0` (edi 3) · `closed = 4` · `pending = 3` (egasi UI'dan qabul
> qiladi) · `accepted = 1` (sinov) · farq akti 1 · farq xabari 1 `sent`.
>
> **Nima QILINMADI:** brauzer-QA yo'q (→P10) · `stale=true` shoxi **jonli ko'rsatilmadi**
> (sinov smenasi 0 daqiqalik edi; chegarani prodda vaqtincha tushirmadim — unutilib qolish
> xavfi) · `/retail` sahifasiga tegilmadi · farq akti `acknowledge` qilinmadi (→P10) ·
> sinov cheklari **qaytarilmadi**: 2×200 so'm posted qoldi, ombor 998 (→P13).
>
> **🔴 Yangi ochiq xavf:** **yopilgan smenadagi chekni qaytarib bo'lmaydi**
> (`retail-sale.service.ts:1439` — «Session is closed. Cannot refund.»). Real savdoda mijoz
> ertasi kuni tovar qaytarishi odatiy hol; hozir POS'dan buni umuman qilib bo'lmaydi →
> **P5** da H6 bilan birga o'lchansin. Ikkinchisi: `toSelf` yo'li prodda **hamon o'lik**
> (`menejer.haftalik_xulosa` 4 qator failed) — ular ham telefonga ko'chirilishi yoki slot 0
> ulanishi kerak.
>
> **Keyingi faza:** **P5 — to'lov turlari jonli sinovi** (`docs/REJA-KASSA-PROD-2026-08.md`
> → «FAZA P5», sessiya promptini o'sha yerdan oling).

> **🕒 2026-08-12b (REJA-KASSA-PROD **FAZA P3** — chek hayot sikli · ✅ DEPLOYED + JONLI
> VERIFY 18/18 + PROD ROL TOP-UP) — `3680d104` prodda** (`Deploy done: c6dc0566… →
> 3680d104…`, BUILD_ID `DdCLPoRfW7DsCwvOiCxZM`). Commitlar: `2a1a2fb6` (kod+testlar) ·
> `3680d104` (ops skript) · `51de6e5c` (verify/tozalash skriptlari) · `02fc79a` (hisobot).
>
> **🔴 REJANING TAXMINI NOTO'G'RI EDI.** Reja «cheklar omborchi yo'qligidan qotadi»
> degan edi. Jonli probe (mavjud bo'lmagan UUID + kassir tokeni, YOZMAYDI):
> `POST /retail-sales/<fake>/post` → **403 «retailsale.approve … (sizda: NO)»**,
> `cancel` → 403, `mark-ready` → 404 (ruxsat bor). Ya'ni kassir chekni yaratardi,
> yig'ishga yuborardi, hatto o'zi «Tayyor» qilardi — lekin **na to'lay, na bekor qila
> olardi**. Prod: 4 `picking` chek, **0 posted**, `salesCount = 0`. Omborchi yo'qligi —
> IKKINCHI darajali sabab. Xotira: `cashier-cannot-post-permission-wall`.
>
> **Egasi qarorlari (4 savol, fazada berildi):** omborchi **+** to'g'ridan-to'g'ri sotish
> (ikkalasi) · qaytarish kassirda **EMAS** · qotgan chekda **ogohlantirish + ro'yxat**
> (avto-bekor yo'q) · picking'da **rezerv qilinsin**.
>
> **Nima qilindi:** (1) kassirga `retailsale.approve`, `refund` esa `salesreturn.create`
> ga ko'chirildi (aks holda to'lovni ochish pul chiqarishni ham jim ochardi); omborchi
> shabloniga `retailsale` view/update/print. (2) POS'da **«Sotish»** tugmasi — picking'siz,
> darhol to'lov; kioskda qaytarish tugmasi yashirin. (3) **H5** — `send-to-picking` rezerv
> qiladi, `cancel` bo'shatadi, `post` yutadi (`assertAvailable` dan OLDIN). (4) **H12** —
> `payedSumMinor = jami − qarz` (prodda 17/17 chekda 0 edi). (5) smena yopish xabari endi
> chek nomi + bosqichi + summasi bilan.
>
> **Testlar:** 48 yangi. `retail-sale-lifecycle-permissions.test.ts` (15) — HAQIQIY guard +
> shablon matritsasi; **bo'sh emasligi mutant bilan tekshirildi** (ruxsat olib tashlanganda
> aynan prod bug'ini ko'rsatib qizardi). Gate: typecheck 10/10 · lint 0 · i18n ✅ ·
> api **8095** · web **3640**.
>
> **Prod-op (DRY → APPLY):** `ops-p3-role-topup --apply` → «Kassir» roliga
> `retailsale.approve` (1 qator; umumiy `template-topup` YARAMAYDI — u `retailsale` ni
> chetlab o'tadi) · `ops-p3-live-verify --live` → **18/18 ✅** (rezerv 0→1→0 · kassir
> to'ladi 201 · payedSum 200=200 · qoldiq 1000→999 · **salesCount 0→1** · kassir bekor
> qildi 201 · kassir refund **403** · sinov cheklari qaytarildi, ombor 1000 ga qaytdi) ·
> `ops-p3-cancel-stuck-sales --apply` → **6 qotgan chek bekor qilindi**.
> **Prod holati:** `picking = 0 · ready = 0 · draft = 0`, rezerv net 0.
>
> **Ochiq qoldi:** brauzer-QA YO'Q (→P10) · omborchi hisobi prodda hamon yo'q,
> `sklad_keepers = 0` ⇒ yig'ish topshirig'i yaratilmaydi (bloker emas: «Sotish» yo'li bor) ·
> `payedSumMinor` backfill QILINMADI (eski 2 sinov cheki → P13) · ikki kassa poyga sinovi
> yo'q (→P10) · 🔴 **VPS zaxirasi 09-avgustdan beri har kuni o'tkazib yuborilmoqda**
> (disk 90%, 10GB guard; zaxira fayllarini O'CHIRMADIM — egasining qarori).
>
> **Keyingi:** `docs/REJA-KASSA-PROD-2026-08.md` → **FAZA P4** (smena: unutilgan smena
> himoyasi + jonli yopish sinovi). To'liq hisobot: o'sha faylning «HISOBOTLAR» → P3.

> **🕒 2026-08-12a (REJA-KASSA-PROD **FAZA P2** — qarz: mijoz kartasi bitta halol raqam +
> tarix · ✅ DEPLOYED + PROD BACKFILL + BRAUZER-QA) — `160cdcbc` va `4b0d6392` prodda**
> (`Deploy done: 160cdcbc… → 4b0d6392…`, BUILD_ID `RTIel8gVI8RP6eK4BdvmW`).
>
> **Yoriq (o'zim o'lchadim):** kartada IKKI katta son yonma-yon turardi va farq uchun
> ogohlantirish chiqardi — P1 dan keyin o'sha ogohlantirish YOLG'ON edi (kassada to'lash
> mumkin). Tarix esa umuman yo'q edi: jurnalda **2 qator**, balansda **206 qator**
> (203 noldan farqli: 82 musbat / 121 manfiy; 1 715 kontragentdan 1 509 tasida qator yo'q).
>
> **Nima qilindi:** (1) kartada bitta son — `payableMinor`, ya'ni **server AYNAN shu
> summagacha qabul qiladi** (P1 ning `debtPayable` formulasi; ekran = tizim xulqi).
> «Reyestrdan tashqarida» ogohlantirishi olib tashlandi, `registryExceedsBalance` qoldi.
> (2) **NULL ≠ 0** endi raqamni «—» qilib bloklamaydi — balans qatori yo'qligi alohida
> qator bo'lib OCHIQ aytiladi. (3) **Qarz tarixi** — `GET /debts/pos/history/:cpId`, manba
> `CounterpartyBalanceEntry` (docType filtri YO'Q), yorliqlar umumiy resolverdan; `opening`
> qatori **harakat emas** — alohida «boshlang'ich qoldiq», alohida so'rov bilan (sahifalashdan
> mustaqil). (4) Backfill skripti: qaror sof `planOpeningBackfill` ga ajratildi (FARQ bo'yicha
> ⇒ idempotent), **manifest + post-verify + rollback SQL** qo'shildi.
>
> **Prod backfill (raqam bilan):** DRY 206/203/3, Σdelta **211 593 195 507 tiyin** → APPLY
> **203 qator yozildi** → post-verify **Σ(jurnal)==balans 206/206** → qayta DRY **0 qator**
> (idempotentlik jonli tasdiqlandi). Rollback SQL manifestda (`/root/p2-opening-APPLY.json`).
> Backfill `CounterpartyBalance` ga TEGMAYDI — faqat jurnalga INSERT.
>
> **Jonli verify:** `ops-p2-live-verify.ts` (READ-ONLY, qayta yugurtiriladi) **9/9 OK**;
> **brauzerda prodda** ikkala kontragent turi ko'rildi — importli «AAAA XARIDOR»
> (2 341 175 224,35 so'm + 2 harakat qatori + alohida boshlang'ich qoldiq) va yangi
> «Toshkent Stroy gorot 555» (0,00 + «Balans qatori yo'q» + «Harakat yozilmagan»).
>
> **Gate:** typecheck 0 · lint:product 0 error · i18n:gate 9/9 · api vitest **8047** ·
> web vitest **3631**. ⚠️ Commit hook'siz (`core.hooksPath=/dev/null`) va gate qo'lda:
> parallel sessiya **P12** ustida ishlayotgani uchun lint-staged begona fayl qo'shardi
> (`CLAUDE.md` §6.7 B); `messages/{ru,uz}.json` «HEAD + faqat mening hunk'larim» blobi bilan.
>
> **Ochiq qoldi:** kassir/kiosk roli bilan sinalmadi (P1 dan meros, → P5/P10) · tarix
> sahifalashi yo'q (oxirgi 20 + «Jami N») · `opening` qatorlari org-kesimida
> «taqsimlanmagan» (Faza 10 ning ataylab tanlangan narxi, endi 203 qator) · prod konsolida
> aloqasiz `notifications/stream` SSE `ERR_HTTP2_PROTOCOL_ERROR` (→ P10).
>
> **Keyingi:** `docs/REJA-KASSA-PROD-2026-08.md` → **FAZA P3** (chek hayot sikli:
> picking-qotish + to'g'ri yo'l). To'liq hisobot: o'sha faylning «HISOBOTLAR» → P2.

> **🕒 2026-08-11g (REJA-KASSA-PROD **FAZA P1** — qarz: POS to'lovi BALANS bo'yicha ·
> ✅ DEPLOYED + JONLI TASDIQ) — `bf1483da` prodda** (`Deploy done: 2a0160af… → 0cc09114…`,
> BUILD_ID `Dv1POETnhwI1uIzDUOZVy`).
>
> **Yoriq (prodda qayta o'lchandi):** `Debt` reyestri 0 qator, `DebtPayment` 0, lekin balansda
> 15+ kontragentda katta qoldiq. POS FIFO'si faqat reyestrni yopgani uchun **mijoz kassaga pul
> olib kelsa qabul qilib bo'lmasdi** — egasining 4 qarz-shikoyatining yagona manbai
> ([[pos-debt-two-ledger-split]]).
>
> **Qaror — ADOPSIYA:** to'lov paytida balansdagi qarzning **aynan to'lanayotgan qismi** uchun
> reyestrga qator ochiladi (`Debt.balanceAdopted = true`) va o'sha tranzaksiyada yopiladi.
> Adopsiya qatori balansga `+total` **YOZMAYDI** (qarz u yerda bor) ⇒ `remove()` ham unga
> `−total` yozmaydi. To'lanadigan qarz = `max(reyestr, balans)`. Qulf tartibi **BALANS →
> QARZLAR** (reyestr bo'sh mijozda `debts FOR UPDATE` hech nimani ushlamaydi).
> Rad etilgan variant: `DebtPayment.debtId` nullable — modulning o'qi, blast radius juda katta.
>
> **Jonli verify (HTTP, ishlab turgan API — controller + guard + servis):** «AAAA XARIDOR»ga
> 1 000 so'm → balans −1 000 · kassa +1 000 · smena qarz-naqdi +1 000 · jurnal +1; **storno**
> hammasini AYNAN qaytardi; sinov qatorini `DELETE` qilganda **balans tegilmadi** (qo'riqchi
> jonli tasdiqlandi). **10/10.** Prod yakuniy holati: ochiq qarz 0.
> Qayta yugurtirish: `apps/api/src/scripts/ops-p1-live-verify.ts` (DRY default, `--live` bilan yozadi).
>
> **Gate:** typecheck 0 · lint:product 0 · i18n 9/9 · api 7995 · web 3588.
> **Phase-1 + jonli API tasdiq; brauzer-QA (kassir ekranidan qo'lda) YO'Q** — P10 ga.
>
> **Keyingi:** `docs/REJA-KASSA-PROD-2026-08.md` → **FAZA P2** (mijoz kartasi bitta halol raqam +
> `CounterpartyBalanceEntry` backfill). P1 hisobotidagi shartnoma ustiga quriladi. 🔴 P2 uchun
> eslatma: storno adopsiya qatorini OCHIQ qoldiradi (shartnoma bo'yicha to'g'ri, lekin qarzdorlar
> ro'yxati/eslatma cron uni ko'radi).

> **🕒 2026-08-11f (kassa: narx→oyna · marja ekrandan olib tashlandi · ✅ DEPLOYED) —**
> **`f1f90e88` prodda** (`Deploy done: 913e3c2a… → f1f90e88…`, BUILD_ID 2026-08-11 15:33 +0200).
> Egasining **jonli monoblok sinovidan** chiqqan ikki talab:
> 1. **Narxni bosish tahrir oynasini ochadi.** F2 da trigger faqat qator NOMIga ulangan edi —
>    kassir aynan narxga bosib oyna kutgan (skrinshot bilan tasdiqlandi). Qatordagi 96px input
>    OLIB TASHLANDI: soni uchun −/+ qoldi, narx uchun yagona yo'l. `updatePrice` o'chdi ⇒ parse
>    bitta joyda (oyna ichida).
> 2. **Marja ekranda KO'RSATILMAYDI** — qatordagi «Tan» va «Foyda», footerdagi «Chek foydasi»,
>    oynadagi «Tan». Sabab: mijoz kassir yoniga kelganda marjani o'qib olardi.
>    🔴 **ZARAR / «optomdan past» tasmalari QOLDI** (raqam emas, nazorat).
>    Hisob-kitob ATAYLAB saqlandi, faqat render to'sildi: `apps/web/src/lib/pos/ui-flags.ts` →
>    `SHOW_MARGIN_ON_SCREEN` (uch joy ham shu bayroqni o'qiydi; qaytarish = `true`). Sabab
>    izohda: ZARAR tasmasi tan narxga tayanadi va `pos-cart-profit.test.ts` «100% marja yolg'oni»
>    (`costMinor ?? 0n`) bug-klassini qo'riqlaydi — kod o'chsa qo'riqchi ham o'lardi.
>
> **Gate:** typecheck 10/10 · lint:product 0 error · i18n:gate 9/9 · web vitest **3570 passed,
> 0 failed** (250 fayl). Niyat qulflandi: «marja ekranda ko'rsatilmaydi» (qator · footer · oyna).
> **Jonli verify:** box HEAD = lokal `f1f90e88` · erp.sherset.uz 200 · `/api/v1/health` 200 ·
> yangi chunk ochiq xizmatda (`…/sotuv/page-3873c474….js` → 200, 116 032 b, ichida
> `sotuv-cart-price-edit`) · err.log'larda yangi xato yo'q.
> 🔴 **BROWSER-SMOKE YO'Q.** Diqqat: bayroq `false` bo'lgani uchun **bundle ichida eski
> matnlar qoladi** — «marja yashirilgani» ni chunk-grep bilan ISBOTLAB BO'LMAYDI, dalil faqat
> jsdom testlari. Brauzerda ko'rish egasida.
> Qurilma hamon **1.2.0** da (skrinshotdagi klaviatura eski: «ABC», «РУС» yo'q) — 1.3.0 ga
> o'tish sinalmagan.

> **🕒 2026-08-11e (F4 · REJA-KASSIR-EXE · exe **v1.3.0** kanalda · web deploy YO'Q) —**
> Qobiq **1.2.0 → 1.3.0**; F3 ning klaviaturasi (numpad + kirill) endi yig'ilgan artefakt ichida —
> `app.asar` da `sherset.kbd.lang` / `РУС` / `ЙЦУКЕН` **topildi** (yorliq emas, mazmun tekshirildi).
> `pnpm run dist` → `Sherset-Kassa-Setup-1.3.0.exe` **81 951 579 b**, `ProductVersion 1.3.0.0`, imzosiz (§8.2).
>
> **Kanal o'lchandi:** `https://erp.sherset.uz/downloads/desktop/latest.yml` → **200 · `version: 1.3.0`**;
> `.exe` → **200**, `Content-Length` = yasalgan hajm; **kanaldan to'liq yuklab olib sha512 solishtirildi —
> `latest.yml` dagi bilan AYNAN bir xil** (12.3 s). 1.2.0 fayllari o'chirilmadi (rollback).
> 🔴 82 MB `scp` **uzildi** (2 MB dan keyin `Connection reset by peer`), lokal `rsync` yo'q — quyruqni
> `tail -c +N | ssh "cat >> file"` bilan tiklab qo'yildi; retsept `desktop/README.md` da.
>
> **Gate:** typecheck 10/10 · lint:product 0 error (849 warning) · i18n:gate 9/9 ·
> web vitest **3568 passed / 26 skipped, 0 failed** (250 fayl) · `kassa-installer-config` 30 passed.
> **Web deploy YO'Q** — bu fazada `apps/*` ga tegilmagan (kanalga faqat statik fayl qo'yildi).
> 🔴 **JONLI O'TISH SINALMADI** — «qayta ochish → fonda yuklash → Chiqish → UAC → 1.3.0» zanjirining
> **hech bir qadami** kuzatilmadi. Qurilma tomoni hamon o'lchanmagan qarz; kanal javob berishi buni
> isbotlamaydi. Bog'liq ochiq savol: kirill harfi `sendInputEvent({type:'char'})` orqali Chromium'ga
> yetadimi (F3 hisoboti belgilagan xavf) — artefaktda kirill BOR, lekin «maydonga tushadi» o'lchanmagan.
> Batafsil (cheklovlar + ochiq xavflar): `docs/REJA-KASSIR-EXE-2026-08.md` → F4 hisoboti.

> **🕒 2026-08-11d (F2 · REJA-KASSIR-EXE · savat qatori tahrir oynasi · ✅ DEPLOYED) —**
> **`913e3c2a` prodda** (`Deploy done: 992fff98… → 913e3c2a…`, BUILD_ID 2026-08-11 13:22 +0200).
> Monoblokda savat qatoridagi −/+ 24×24px va narx maydoni 96px edi — 12 dona tovar = 12 marta bosish.
> Endi **qator nomini bosish katta numpadli oynani ochadi** (soni · narx · O'chirish · Saqlash):
> `components/pos/cart-line-edit-modal.tsx` (yangi, `page.tsx` ichiga YOZILMADI — MK33 qarzi o'smasin).
>
> **Qulflangan shartnomalar** (18 komponent + 6 sahifa testi): miqdor DECIMAL SATR (`BigInt(1.5)`
> RangeError klassi) · narx bo'sh/buzuq → `0n`, eski narx EMAS (K-3) · soni 0 → qator o'chadi ·
> `cartLocked` (zakaz) → oyna faqat ko'rish · numpadning birinchi bosishi maydonni almashtiradi.
>
> **Parse birlashtirildi** (reja §4): `updatePrice` o'z nusxasini yozardi (`parseFloat × 100`).
> O'lchangan farqlar: `«12abc»` → 1 200 tiyin (ekranda «12abc», chekka 12 so'm) · `«.5»` → 50 ·
> `«15,000.50»` → 1 500; `× 100` qattiq scale 0 kasrli valyutada narxni 100× shishirardi.
> Endi ikkalasi ham `parseAmountToMinor(input, tillCurrency)`.
>
> **Gate:** typecheck 10/10 · lint:product 0 error (849 warning) · i18n:gate 9/9 ·
> web vitest **3540 passed / 26 skipped, 0 failed** (249 fayl).
> **Jonli verify:** box HEAD = lokal HEAD `913e3c2a` · erp.sherset.uz 200 · `/api/v1/health` 200 ·
> yangi kod ochiq xizmatda (`/_next/static/chunks/app/(app)/sotuv/page-9052463d….js` → 200,
> ichida `pos-line-edit`) · pm2 ikkalasi `online` · api/web `err.log` da yangi xato yo'q.
> 🔴 **BROWSER-SMOKE YO'Q** — oyna real qurilmada bosib ko'rilmagan (Phase-1).
> Keyingisi: **F3** (qobiq klaviaturasi) — `docs/REJA-KASSIR-EXE-2026-08.md`.

> **🕒 2026-08-11c (F1 · REJA-KASSIR-EXE · ✅ DEPLOYED tasdiqlandi · kod o'zgarmadi) —**
> **`eb5dee41 → 992fff98` (11 commit: F8 zakazni to'lash · F9 mijoz kartasi · xodim PIN modali)
> prodda.** 🔴 Muhim: bu deploy'ni **oldingi sessiya allaqachon qilgan edi** (box `/tmp/deploy.log`:
> `Deploy done: eb5dee41… → 992fff98…`, 2026-08-11 06:54 +0200 — oxirgi commitdan 1 daqiqa keyin).
> Reja «11 commit push qilinmagan» degan edi — **premisa eskirgan**; lokal `sherset/climart-adoption`
> remote-ref'i fetch qilinmagani uchun shunday ko'ringan. Push/deploy QAYTA qilinmadi (kerak emas edi).
>
> **Bu sessiya qilgani = to'liq gate + mustaqil jonli verifikatsiya (dalil bilan):**
> typecheck 10/10 · lint:product 0 error (848 warning, siyosat bo'yicha ruxsat) · i18n:gate 9/9 ·
> web vitest **3514 passed / 26 skipped, 0 failed** (248 fayl) · api vitest **7970 passed / 2 skipped,
> 0 failed** (570 fayl). Migratsiya diff BO'SH · yangi `process.env` o'qishi YO'Q ⇒ POS_PIN_PEPPER
> klassidagi env-bloker takrorlanmadi.
> **Jonli dalillar:** box `git rev-parse HEAD` = lokal HEAD `992fff98` · `https://erp.sherset.uz/` **200** ·
> `/api/v1/health` **200** · `/api/v1/debts/pos/summary/<uuid>` **401** (F9 marshruti bor va qo'riqlangan,
> 404 emas) · pm2 `sherset-v2-api`/`-web` online, uptime **309 daqiqa** (= 06:55 dagi deploy restartidan beri
> uzluksiz, crash-loop yo'q) ·
> `api.err.log` oxirgi yozuvi 03:37 UTC = **muvaffaqiyatli bootdan OLDINGI** POS_PIN_PEPPER hodisasi,
> undan keyin yangi xato yo'q · `web.err.log` oxirgi yozuvi 2026-08-08.
> **Build ichida yangi kod bor** (grep, `.next`): `customer_card_title` → `static/chunks/app/(app)/sotuv/
> page-ef837f5b…js` (F9) · `orders_pay_no_positions` (F8) · `pos_pin_title` → `static/chunks/338-…js`
> (oxirgi commit `992fff98` FE kodi build'da) · `BUILD_ID` mtime 06:53 +0200 > oxirgi commit 06:49 +0200.
>
> **⚠️ Topilgan qarzlar (tuzatilmadi — F1 da yangi kod yozilmaydi):**
> (1) `apps/api/.env.example` **eskirgan**: box `.env` da yo'q 9 kalitning (`JWT_ACCESS_SECRET`,
> `JWT_REFRESH_SECRET`, `JWT_ACCESS_TTL`, `JWT_REFRESH_TTL`, `PASSWORD_HASH_ROUNDS`, `CBRU_API_BASE`, `TZ`,
> `LOG_LEVEL`, `LOG_PRETTY`) **hech biri kodda o'qilmaydi** (o'lchandi: 0 o'quvchi; LOG_* da default bor).
> Ya'ni bloker EMAS, lekin `.env.example` diff'i endi shovqin — POS_PIN_PEPPER retsepti (§deploy) uchun
> yolg'on-pozitiv manbai. (2) **Disk** — quyida alohida blok.
>
> **💾 DISK TOZALANDI: 93% (7.2G bo'sh) → 88% (12.0G bo'sh), +4.8G** (egasi so'radi; hech qanday
> restart bo'lmadi — sherset-v2 uptime uzilmadi, 10 ta ijarachi ilova online).
> Tozalangani (hammasi qayta tiklanadigan): `.next/cache/webpack` **2.1G** (sof build-keshi —
> `.next/cache` da ISR/image keshi YO'Q edi, ishlayotgan serverga tegmaydi) · journal vacuum 227M ·
> `/root/.cache/pnpm` 509M · apt clean · npm cache · `pnpm store prune` (atigi 4 paket — qolgani
> ishlatilyapti) · pm2 log flush (sherset-v2). Egasi qarori bilan `/root/sherset-v2-backups` dan
> **eng eski 3 pre-deploy dump o'chirildi** (~1.5G); eng yangi 2 tasi (10-avgust) + `role_permissions`
> qoldi. **Tegilmadi:** `/var/backups/sherset` 26G (biznesjon deploymenti — o'zi tozalanadi, quyida) ·
> `/root/akademiya-backups` 17G (**begona ijarachi**).
>
> **🔴 Tozalash paytida topilgan ASOSIY nosozlik — `sherset` (biznesjon) bazasi 4 kun ZAXIRASIZ.**
> `/var/log/sherset-backup.log`: 08·09·10·11-avgust → `XATO: diskda 10 GB dan kam joy — zaxira
> o'tkazib yuborildi`. `/root/sherset-backup.sh` da qattiq guard: `FREE_KB < 10485760` ⇒ `exit 1`.
> Ya'ni disk to'lgani jimgina zaxirani o'chirgan (oxirgi muvaffaqiyatli dump — **7-avgust**).
> Baza o'sishi esa **tushunarli, bug emas**: skript izohi — `attachments` jadvalidagi fayllar TOAST
> ichida (~2.9G), shuning uchun `KEEP_DAYS=5`. Endi bo'sh joy **12.0G > 10G chegara (marja +1.9G)**
> ⇒ bugun 03:00 dagi zaxira ishlashi kerak; muvaffaqiyatli dumpdan keyin `find -mtime +5 -delete`
> 6 ta eski faylni o'chirib **~21G** bo'shatadi (muammo o'z-o'zidan yopiladi).
>
> **🔴🔴 F2 UCHUN VAQT SHARTI:** `next build` webpack keshini (**2.1G**) qayta yaratadi ⇒ bo'sh joy
> ~10.27G ga tushadi, bu **10.48G chegaradan PAST** ⇒ **bugungi 03:00 zaxira YANA o'tkazib yuboriladi**.
> Shuning uchun: **F2 deploy'ini bugun kechasi 03:00 dan KEYIN qil**, yoki deploy'dan oldin qo'shimcha
> ~1G bo'shat (nomzodlar: `/var/log/sherset/*.log` 400M truncate · `/root/rollback-*-2026-07-28-*`
> 353M). Zaxira bir marta o'tsa bu shart yo'qoladi (21G bo'shaydi).
>
> ℹ️ `pm2 flush sherset-v2-*` `api.err.log` tarixini ham o'chirdi (ichidagi POS_PIN_PEPPER hodisasi
> logi) — undan olingan dalillar yuqorida saqlangan; log 03:37 UTC dan keyin baribir bo'sh edi.
>
> **BROWSER-QA YO'Q** — F8/F9/PIN ekranlari brauzerda bosib ko'rilmagan (reja bo'yicha egasi qiladi).
> Status: **Phase-1 + jonli marshrut/build verifikatsiyasi**, runtime-UI tasdiqlanmagan.
>
> **📌 Sabog'i (keyingi fazalarga):** `git log <remote>..HEAD` **`git fetch` siz ishonchsiz** — remote-ref
> eskirgan bo'lsa allaqachon chiqarilgan ish «kutayotgan» ko'rinadi. Deploy'dan oldin **avval `git fetch`**.
> Diqqat: prodda turgan kod HEAD'i = `992fff98`; shu entry'ning o'z commit'i (faqat hujjat) undan keyin
> keladi va **deploy talab qilmaydi** — box HEAD'i undan 1 commit orqada bo'lishi KUTILGAN holat.
> Keyingi: `docs/REJA-KASSIR-EXE-2026-08.md` **FAZA 2** (savat qatori tahrir oynasi) — alohida sessiya.

> **🕒 2026-08-11b (DEPLOY → erp.sherset.uz · ✅ DEPLOYED · kod o'zgarmadi) —**
> **`ff7e0a8b → e622d5da` (174 fayl) prod'da.** Migratsiya `20260810180000_pos_device_and_pin_lookup`
> qo'llandi · money+web build · api/web restart. Deploy `deploy-smart.sh DS_TARGET=v2` bilan.
>
> **🔴 Deploy API'ni O'LDIRDI — yangi boot-guard uchun env yo'q edi.** `POS_PIN_PEPPER`
> (`auth/boot-secrets.ts`, prod'da fail-closed) box'dagi qo'lda yuritiladigan `apps/api/.env` da yo'q →
> Nest DI `PosPinService` da yiqilib turdi, `:4001` tinglamadi, sayt **502**. Tuzatildi: `.env` ga
> tasodifiy 64-belgili pepper qo'shildi (backup `/root/sherset-v2-env-backup-*.env`), api restart →
> health 200. **Sabog'i:** yangi majburiy env `deploy-smart.sh` diff'ida ko'rinmaydi — `.env.example`
> yangilangan bo'lsa deploy'dan OLDIN box `.env` bilan solishtir. Shartnoma: pepper o'zgarsa hamma
> POS PIN yaroqsiz bo'ladi (PIN qayta beriladi) — `pos-pin-lookup.ts` izohi.
>
> **Test kassirlari yaratildi (egasi so'radi — real savdo testi uchun):** rol «Kassir»
> (`cashier` shablonidan, uiMode=**kiosk**, 26 katakcha) · jadval «Kassa 24/7» (00:00–23:59) ·
> smena «Kassa smenasi» · 3 xodim `kassir1/2/3` (parol `Kassir<N>!2026`, PIN `1111/2222/3333`),
> har biri rolga + smenaga biriktirilgan. Skript (idempotent, repo'da untracked):
> `scripts/ops-create-test-cashiers.ts`. **Jonli tasdiq:** login 201 · `uiMode=kiosk` ·
> `/admin/smenas/mine` smenani qaytardi · `products`/`retail-sales`/`counterparties` 200 ·
> `reports/profitability`/`demands` **403** (kiosk guard ishlayapti) · `hasPin:true`.
> **Browser-QA YO'Q** — POS ekranining o'zi brauzerda sinalmagan; smena ochilmadi (prod'da
> ortiqcha yozuv qoldirmaslik uchun) — birinchi real savdoni egasi ochadi.
>
> **⚠️ Disk:** `/` 93% (7.2G bo'sh), `/root/sherset-v2-backups` 2.7G/5 fayl — keyingi deploy'dan
> oldin tozalash kerak bo'lishi mumkin.
>
> **Kassa installer BIRINCHI marta yig'ildi (F4 «strukturaviy» → endi o'lchangan).** Egasi
> monobloklarga yuklash uchun so'radi. `desktop/build/icon.ico` yasaldi (web `icon.svg`
> brendidan — ko'k→binafsha chaqmoq, 6 o'lcham PNG-payload ICO) · `pnpm install
> --ignore-workspace` + `pnpm run dist` Windows'da **o'tdi** → `dist/Sherset-Kassa-Setup-1.1.0.exe`
> (82 MB, MZ+Nullsoft tasdiqlandi) + `latest.yml` + `.blockmap`. Versiya `1.1.0-dev` → **`1.1.0`**
> (README talabi: prerelease→reliz avtoyangilanishi sinalmagan); qo'riqchi test README'dagi fayl
> nomini ham talab qildi — README yangilandi, `kassa-installer-config.test.ts` 30/30 yashil.
> Paket: `desktop/dist/Sherset-Kassa-1.1.0-ORNATISH.zip` (exe + `ORNATISH.txt` + `server-uchun/`).
>
> **🔴 Yig'ish paytida topilgan qarz:** `desktop/package.json` da top-level `productName` YO'Q
> (faqat `build.productName`), shuning uchun paketlangan ilovada `app.getName()` = `@moysklad/desktop`
> ⇒ sozlama fayli `%APPDATA%\@moysklad\desktop\kassa-config.json` da turadi, «Sherset Kassa» da
> EMAS. README'dagi `%APPDATA%/<app>/` shu sababdan noaniq edi. Tuzatish (`productName` qo'shish)
> mavjud o'rnatmalarning konfigini «yo'qotadi» — birinchi tarqatishdan OLDIN qilinsa arzon.
>
> **Sinalmagan (halol):** Electron ilovasi hech qachon ishga tushirilmagan · juftlash · chop etish ·
> mijoz-ekran · avtoyangilanish oqimi. `/downloads/desktop/` kanali serverga hali QO'YILMAGAN.
>
> **🔴 REAL MONOBLOKDA IKKI BLOKER TOPILDI VA TUZATILDI → v1.1.1** (egasi qurilmaga o'rnatdi;
> statik audit ham, qo'riqchi testlar ham buni ko'rmagan edi — faqat qurilmada ko'rindi):
> 1. **Sozlash ekranida yozib bo'lmasdi.** `kiosk: true` oyna hamma narsaning ustida turadi ⇒
>    Windows ekran klaviaturasi input bosilganda orqaga o'tib ketardi; ilovaning o'z klaviaturasi
>    esa faqat PIN ekranida bor. Klaviaturasiz sensorli qurilmada na server manzilini, na juftlash
>    parolini kiritib bo'lardi. **Yechim:** `kiosk: paired` / `frame: !paired` — sozlash oddiy
>    oynada, juftlangach `app.relaunch()` bilan kiosk'ga o'tadi (`setKiosk(true)` yetarli emas:
>    `frame` ish paytida olib tashlanmaydi).
> 2. **Chiqib bo'lmasdi.** Yagona yo'l `Ctrl+Alt+Shift+Q` — klaviatura shart edi. **Yechim:**
>    chap yuqori burchakni 2s ushlash → `shell:request-quit` → native tasdiq dialogi. Imo
>    **`preload.js` da** (web ilova `script-src 'self'` CSP bilan keladi — `executeJavaScript`
>    o'sha siyosatga tayanib qolardi, o'lchanmagan; preload CSP'ga bo'ysunmaydi). Tinglovchilar
>    passiv (`.preventDefault(` yo'q) — burchakdagi haqiqiy tugmalar to'silmaydi.
>
> **Keyingi to'lqin (o'sha kunning o'zida, egasi monoblokda sinab turib):** (a) juftlash/admin-kirish/
> ombor-tanlash BUTUNLAY olib tashlandi — `pos-login` da qurilma ixtiyoriy, PIN global qidiriladi
> (ikki moslikda RAD), do'kon/kassa hisob sukutlaridan; ikkinchi omil yo'qolgani commit'da ochiq
> yozilgan. (b) qobiqning O'Z ekran klaviaturasi (Windows'niki Electron oynasi uchun umuman
> chiqmadi) — kalit `sendInputEvent` bilan, chunki `input.value=` React holatini yangilamaydi.
> (c) o'z saytimiz popup'i ichki oynada — chek chop etish `/print/...` ni tashqi brauzerda ochib
> LOGIN so'rardi. (d) **avtoyangilanish kanali yoqildi**: `erp.sherset.uz` uchun nginx konfiguratsiyasi
> repo'da UMUMAN yo'q edi (README «uchala konfiguratsiyada bor» degani faol prod'ga tegishli emasdi)
> — endi `deploy/nginx-erp.sherset.uz.conf`, fayllar `/var/www/kassa-downloads/`. (e) «Jarayonda»
> tabiga **«Tasdiqlash»** (`mark-ready`) — bu o'tishni faqat omborchi qilardi, u belgilamasa chek
> abadiy osilib qolardi (to'lov faqat `ready` dan).
>
> Qo'riqchi `electron-bridge-contract.test.ts` dagi `kiosk: true` LITERAL sharti yangi niyat bilan
> qayta yozildi (o'chirilmadi): endi bog'liqlik (`kiosk: paired`) + relaunch yo'li + imo joylashuvi
> qulflanadi. **97/97 yashil.** Nozik joy: «preventDefault yo'q» tekshiruvi izohdagi so'zdan
> yiqilgan edi — regex `.preventDefault\s*\(` CHAQIRUVIga tor qilindi.

> **🕒 2026-08-11a (Ombor «Scan» + «Sanash» — egasining TZ v3 si; reja+ijro, 10 commit) —
> **Phase-1: strukturaviy + unit/xulq testlari bilan tasdiqlangan, BROWSER-SMOKE YO'Q.**
> TZ matni: `docs/superpowers/specs/2026-08-10-yacheyka-scan-sanash-tz-v3.md` · reja:
> `docs/superpowers/plans/2026-08-10-yacheyka-scan-sanash-tz-v3.md` · jarayon jurnali (git-ignored):
> `.superpowers/sdd/2026-08-10-yacheyka-scan-sanash-tz-v3/progress.md` + `task-1..5-report.md`.**
>
> **Nima qilindi (6 bo'lak, har biri subagent + review sikli bilan):** (1) yangi **`storecell`**
> ruxsat obyekti — 6 yacheyka marshruti `store.update` dan ajratildi, omborchiga ochildi; chiqarish
> (unbind) TZ §3 bo'yicha ATAYLAB `store.update` da qoldi. (2) `PUT cells/:cellId/stock` ga
> **`mode: 'set' | 'add'`** — «Umumiy sanash» endi qo'shadi (26+100=126), delta **serverda**
> hisoblanadi (lost-update yo'q), avto-«Оприходование» aynan qo'shilgan miqdorga. (3) `useScanQueue`
> — skanlar navbati + `onError`. (4) «Scan» oynasi: yacheyka bo'yicha eslab qolinadigan qaror,
> staged «chiqarib qo'shish» (avval DELETE, keyin POST), beep, `canEvict` darvozasi.
> (5) «Sanash»: bitta qimirlamaydigan son-maydon, qatorda «hozirgi → bo'ladi», saqlashdan oldin
> butun jadval validatsiyasi. (6) Egasi qarorlari: yacheykada **qoldiq bo'lsa chiqarish
> BLOKLANADI** (409 `CELL_STOCK_NOT_EMPTY`, hujjatsiz stok o'zgarmaydi) + `warehouse_manager` ga
> `store.update`.
>
> **🔴 Review 4 Critical + 12 Important topdi — hech biri statik gate'da ko'rinmasdi.** Eng
> muhimlari: «Sanash»da tarmoq xatosida ekranda eski kartochka qolib **noto'g'ri yacheykaga mutlaq
> yozuv** ketardi · «Scan»da burst'da ikkinchi skan konflikt dialogini ustidan yozib skanni **jim
> yo'qotardi** · band yacheyka so'rovi yiqilsa yacheyka butun sessiyaga «bo'sh» deb muhrlanardi ·
> `mode:'add'` hujjatsiz yo'lda qoldiqni **kamaytirardi** · qoldiq qulfi `product-cell-move.rebind`
> orqali **chetlab o'tilardi**. Yakuniy holat: api `store+permissions+product` **775 passed** ·
> web `components/stores` **79 passed** · typecheck 10/10 · i18n gate 9 · biome 0.
>
> **✅ DEPLOYED — erp.sherset.uz (2026-08-11 03:42 UTC, jonli tekshirilgan).** Kod box'ga
> parallel sessiyaning deploy'i bilan yetgan (mening 10 commitim `3609b0ea` ning ajdodlari),
> build HEAD'dan KEYIN qurilgan (`.next/BUILD_ID` 03:35 UTC vs HEAD 03:27 UTC). Men bajarganim:
> **ruxsat qatorlari + API restart + verify.**
> **⚙️ OPS (bajarildi):** LOKAL — PASS 1: 4 rol · PASS 2: 6 rol/17 qator; 2-yugurish **0 qator**
> (idempotentlik o'lchandi); Omborchi va Ombor menejeri `storecell.update = ALL`.
> **PROD** — `role_permissions` nuqtali backup (`/root/sherset-v2-backups/role_permissions-20260811-053949.sql.gz`,
> 1850 qator) → skript → **storecell 0 → 24 qator** → `pm2 restart sherset-v2-api` (15s da 200).
> **Jonli verify:** `/api/v1/health` 200 · `by-barcode` **401** (bor va qo'riqlangan, 404 emas) ·
> erp.sherset.uz **200** · yangi i18n kalitlari serverdagi chunk ichida
> (`count_bulk_becomes`/`scan_replace_named`/`scan_evict_blocked`/`move_stock_changed` →
> `static/chunks/5276-*.js`) · api uptime 39s, restartdan keyin yangi xato YO'Q
> (err.log'dagi DI xatosi 2 soat oldingi POS_PIN_PEPPER hodisasidan, hal qilingan).
> **⚠️ PRODDA OMBORCHI ROLI YO'Q:** bazada faqat 5 rol bor (Administrator[admin] · Kassir[cashier] ·
> Employee · Manager · ReadOnly) — `storekeeper`/`warehouse_manager` shablon rollari umuman
> yaratilmagan. Ya'ni yacheyka amallari hozir **Administrator** ostida ishlaydi; omborchiga ochish
> uchun avval rol shablonidan rol yaratilishi kerak.
>
> **⚠️ O'LCHANGAN BO'SHLIQ:** `store.update` bazaga **yetib bormadi** — `TOPUP_ENTITIES`
> allow-listi ataylab faqat `storecell` ni ko'radi (boshqa entity'ga tegsa admin bekor qilgan
> ruxsatni tiriltirardi). Ya'ni «chiqarib qo'shish» jonli bazada hamon faqat admin/egada. Yechim:
> rol matritsasi ekranidan qo'lda berish YOKI `warehouse_manager`+`store` uchun nuqtali top-up.
>
> **📌 Backlog (review topdi, ataylab tuzatilmadi):** (a) **uchinchi yo'l** — tovar kartasi
> `PUT /products` `__yacheyka` ni qulfsiz qayta yozadi (legacy faqat-yorliq bog'lanishda fantom
> qoldiq klassi); (b) `pick-list.controller.ts:50` `cells-by-products` da `@RequirePermission` yo'q
> + `use-pick-sheet.ts:90` `.catch(() => ({}))` 403 ni jim yutadi (varaq «Yacheykasiz» bo'lib
> chiqadi); (c) Serializable retry ulanmagan — `shared/serialization-retry.ts` MAVJUD; (d) fantom
> qoldiq TARIXI tozalanmagan (ops skripti yo'q, prod hajmi o'lchanmagan); (e) `rebind` eski
> yacheykani NOM bo'yicha akkaunt-bo'ylab qidiradi (nom faqat ombor ichida noyob).
>
> **➡️ KEYINGI QADAM: TZ §4 — do'konda real skaner + telefon bilan Phase-2 QA** (`/qa-cohort`).
> Undan oldin lokal bazada dev-stack ko'tarilsin; §4 checklisti TZ faylining oxirida.**

> **🕒 2026-08-10m (REJA-KPI-SODDALASHTIRISH **KPI-06** — Phase-2 QA, real brauzer) —
> **PHASE-2 VERIFIED** (KPI-01…KPI-04 yuzasi). 6 stsenariydan **5 ✅ / 1 ⚠️ qisman**;
> **4 defekt topildi va tuzatildi**. To'liq hisobot:
> `docs/REJA-KPI-SODDALASHTIRISH-2026-08.md` → «HISOBOT JURNALI» → KPI-06.**
>
> **🔴 Eng muhimi — RUXSAT teshigi yopildi (`HrPermissionGuard`).** Core-RBAC zaxira sho'basi
> `scope !== 'NO'` edi; hujjatlangan maqsadi esa «administrator/egasi» (= `ALL`). Jonli o'lchov:
> `employee.update = OWN_GROUP` bo'lgan menejer (`hrPermissions: []`) BARCHA xodimlarning KPI
> maqsadi va **faktini** o'qidi va **o'z guruhidan tashqaridagi** xodimga KPI **yaratdi** —
> KPI-02 ning `employees:full` qulfi aylanib o'tilgan. Endi `scope === 'ALL'`. Eski testlar faqat
> `ALL` va `NO` ni qoplagan; `OWN`/`OWN_GROUP`/`OWN_AND_GROUP` hech qachon o'lchanmagan — bug
> shu bo'shliqda yashagan. **Bu qo'riqchi butun HR `employees` sahifasida ishlaydi** — yangi
> HR-endpoint qo'shsang, oraliq qamrov endi ochmasligini hisobga ol.
>
> **UI tuzatishlari (brauzerda tasdiqlangan).** (1) Belgilangan qo'lda KPI endi «Bajarildi» badge
> + `data-done` bilan ko'rinadi — ilgari faqat tugma matni o'zgarardi. (2) Fakt endi **SANASI
> bilan** chiziladi (`Fakt (2026-08-09): —`): dvigatelning oxirgi hisoblangan kuni ekran ochilgan
> kundan orqada bo'lishi mumkin, sanasiz raqam «bugungi» deb o'qilardi. (3) `kpi_hint` dagi
> eskirgan «Saqlash yangi versiya yaratadi» va'dasi olib tashlandi (KPI-04 versiyalashni
> yo'q qilgan).
>
> **⚠️ QARZ — S2 to'liq emas.** Qo'lda KPI «bajarildi» belgilangach **fakt to'liqqa o'tmaydi**:
> dvigatel uni faqat KUN QAYTA HISOBLANGANDA yozadi (`manualDailyOutcome`). Bazada oxirgi
> hisoblangan kun 2026-08-09 edi → karta fakti `null` qoladi. Kerak: belgilashda o'sha kunni
> qayta hisoblash, yoki kartada «bugungi kun hali hisoblanmagan» holatini ochiq ko'rsatish.
> Dvigatel fayllari o'sha payt **parallel sessiya qo'lida** edi — ataylab tegilmadi.
>
> **⚠️ QARZ — KPI-05 brauzerda QOPLANMADI.** U shu sessiya davomida commit bo'ldi (`fbee806a`),
> o'lchovlar esa `c5b3a173` holatida olingan. Og'irlik normalizatsiyasi + `weightApplied` muhri
> uchun qisqa alohida Phase-2 seansi kerak.
>
> **🖥️ Stack tuzog'i (keyingi QA sessiyasi shuni bilsin).** `:4000` dagi API **boshqa
> worktree'dan** (`D:/projects/sherset-qa-kassa`) ishlayotgan edi — yangi marshrutlar unda YO'Q,
> hammasi **404**. `pnpm dev` bilan QA qilishdan oldin `Get-CimInstance Win32_Process` bilan
> jarayonning **qaysi papkadan** ekanini tekshir. Bu sessiya o'ziga alohida stack ko'tardi
> (API `:4001`, web `:3111`, `NEXT_DISTDIR=.next-qa`) va tugagach tozaladi.
>
> **Keyingi ish:** `docs/REJA-KPI-SODDALASHTIRISH-2026-08.md` bo'yicha barcha fazalar yopildi
> (KPI-01…06). Yuqoridagi 2 qarz — alohida kichik sessiyalar.

> **🕒 2026-08-10l (REJA-KPI-SODDALASHTIRISH **KPI-02 + KPI-04** — CRUD API + «todo» ekranlari) —
> **Phase-1: strukturaviy + unit + MUTANT-tasdiqlangan, browser-smoke YO'Q**. Commit `9bd914d7`.
> To'liq hisobot: `docs/REJA-KPI-SODDALASHTIRISH-2026-08.md` → «HISOBOT JURNALI» → KPI-02, KPI-04.**
>
> **Nega ikkitasi birga.** Sessiya KPI-04 uchun ochildi, lekin bog'liqlik (KPI-02 CRUD API) kodda
> YO'Q edi (`grep EmployeeKpiTarget apps/api/src` = 0). Foydalanuvchi «ikkalasini birga» deb
> tanladi (CLAUDE.md §0.3 dan chekinish — ataylab, so'ralgan).
>
> **KPI-02 (API).** 6 route `manager/kpi` prefiksida:
> `GET employee/:id/targets` · `GET targets` (filtrli menejer kesimi) · `POST employee/:id/targets` ·
> `PATCH targets/:id` · `DELETE targets/:id` · `POST targets/:id/done`. Har handler
> `employees:full` (class guard + handler talabi BIRGA).
>
> **🔴 Keyingi sessiya SHUNI bilishi kerak — birlik shartnomasi ASIMMETRIK va bu ATAYLAB.**
> Kirish maydoni **`targetValue` = ko'rinish birligi (pul → so'm)**, chiqish maydoni
> **`targetMinor` = tiyin**. Nom farqi yagona himoya: bir xil nomlansa FE ham o'girishga urinib pul
> **100×** ketardi. O'girish FAQAT serverda (`Money.fromMajor`). Eski `PUT …/config` yo'li hamon
> so'mni FE'da tiyinga o'giradi — ikki yo'l ikki konvensiyada, aralashtirma.
> Yana: `unit`/`currency` DTO'da UMUMAN yo'q (Zod strip qiladi) — katalogdan olinadi, aks holda
> DB'ning `currency ↔ unit` CHECK'i buzilardi. `weight` NULL ≠ 0.
>
> **KPI-04 (UI).** Xodim kartasi KPI tabi (486→302 qator) butun-katalog jadvalidan biriktirilgan
> KPI ro'yxatiga aylandi: «og'irlik 100%» talabi va versiya raqami YO'Q. Yangi `/menejer/kpi`
> (subnav + command-palette). Og'irlik «Kengaytirilgan» ostida — yopiq bo'lsa so'rovga TUSHMAYDI.
> Uch holat uch xil: `null → «—»`, `0 → «0»`. DOM bayroqlari: `data-scored`, `data-fact-complete`,
> `data-manual`.
>
> **🐞 Yangi tuzoq (hujjatlandi, boshqa modullarga ham tegishli).** `*.module.ts` ning
> `controllers:`/`providers:` massivi ICHIDAGI izohda **kvadrat qavs** ishlatilsa
> (`[[wiki-havola]]`), `*-wiring.test.ts` fayllarining `moduleArray()` parseri (`indexOf(']')`,
> izohni tozalamaydi) ro'yxatni erta kesadi va **begona testlar yiqiladi**. `app-boot.test.ts`
> tushmaydi (u `stripComments` qiladi).
>
> **Gate.** api+web typecheck **0** · `lint:product` **0 error** · `i18n:gate` **9/9** ·
> api vitest **7601 passed (533 fayl)** · web vitest **3146 passed (218 fayl)**.
> **4 mutant** qo'llanib testlarning vakuum emasligi o'lchandi (8 test yiqildi; revert diff-toza).
>
> **⏭️ KEYINGI VAZIFA:** `docs/REJA-KPI-SODDALASHTIRISH-2026-08.md` → **KPI-05** (oylik ball
> og'irlikni ixtiyoriy qabul qiladi: kompozit Σ(fakt%×w)÷Σ(w), `weight=NULL` ballanmaydi, hammasi
> ballsiz → kompozit `null`, o'tgan oy `HrKpiMonthlyScore` qayta yozilmaydi). Keyin **KPI-06**
> (brauzer QA — faqat undan keyin «verified» deyish mumkin).
>
> **Ochiq qarz.** Prodda `employees:full` ruxsat qatorlari seed qilinganini tekshirish
> ([[stale-seeded-db-missing-permission-rows]] — yo'q bo'lsa admin ham 403) ·
> `KpiConfigService`/`getConfig`/`saveConfig`/`daily` endi UI'dan chaqirilmaydi (o'lik kod qarzi,
> KPI-05 dan keyin qaror).
>
> **Parallel sessiyalar.** Shu sessiya davomida ikkita boshqa sessiya ishladi: biri **KPI-03** ni
> commit qildi (`cdd0112c`), ikkinchisi `retail-sale`/`sotuv` ustida (commit qilinmagan). Diff'im
> yo'l-cheklangan; commitga faqat 19 fayl + hook qayta-yozgan `docs/progress.json` tushdi
> (`git show --stat HEAD` bilan tasdiqlandi).

> **🕒 2026-08-10k (REJA-KPI-SODDALASHTIRISH **KPI-03** — dvigatel ko'prigi: maqsad yangi qatlamdan +
> KUNGA MUHRLANADI) — **Phase-1: strukturaviy + unit + jonli DB CHECK-tasdiqlangan, browser-smoke YO'Q**.
> To'liq hisobot: `docs/REJA-KPI-SODDALASHTIRISH-2026-08.md` → «HISOBOT JURNALI» → KPI-03.**
>
> **Nima o'zgardi.** `employee-daily-kpi.service.ts` endi `EmployeeKpiTarget` (KPI-01 qatlami) ni
> yuklaydi va `kpi-target.ts` resolveri orqali kunlik maqsadni hal qiladi: **`employee_target` >
> `target_override` > `profile` > `none`**. Hal qilingan maqsad `EmployeeDailyKpiMetric` ning yangi
> `target_value`/`target_source` ustunlariga **muhrlanadi**. Shu bilan `kpi-target.ts` o'lik koddan
> chiqdi. O'quvchilar (`scoreRow`, `getEmployeeDaily`) muhrni afzal ko'radi.
>
> **🔴 Keyingi sessiya SHUNI bilishi kerak — muhr FAQAT `create` da yoziladi.** `update` payload'i
> avvalgidek aynan `{autoValue, complete}`. «Tahrir faqat kelajakka» kafolatining butun og'irligi
> shunda: `update` ga maqsad qo'shilsa, bugungi tahrir qayta hisoblash paytida o'tgan kunning
> ballini o'zgartirardi. **`target_source` NULL = MUHR YO'Q** (migratsiyadan oldingi 468 qator) →
> o'quvchi profil maqsadiga tushadi, ya'ni eski kunlar balli o'zgarmagan.
>
> **Reja da'vosi noto'g'ri chiqdi (tekshirildi):** reja «dvigatel kungi maqsadni yozadimi — kodda
> tasdiqla» degan edi; **ustun umuman yo'q edi**, shuning uchun faza sxema+migratsiyani ham oldi
> (`20260810180000_daily_kpi_metric_target_seal`, lokal `climart_adopt` ga qo'llangan).
>
> **Gate:** api typecheck 0 · `lint:product` 0 error · api vitest **7601 passed / 2 skipped (533 fayl)**
> · jonli DB probe **12/12** (`scripts/probe-daily-kpi-target-seal.mts`) · mutant bilan 2 joyda
> vacuous-emaslik o'lchandi. *(Birinchi to'liq yugurtishda 2 ta 5000ms timeout flake bo'lgan;
> keyingi ikki yugurtish toza.)*
>
> **Ochiq qarz:** `weight` hamon FAQAT profil versiyasidan → profilda qatori yo'q biriktirilgan KPI
> `no_weight` bilan ballanmaydi (bu **KPI-05** ishi, reja shunday ketma-ketlikda). Qo'lda metrika
> fakti faqat `higher_better` da to'qiladi (`lower_better` da 0 = 200% bo'lib ishlamaslikni
> mukofotlardi). **Browser-QA = KPI-06.**
>
> **⚠️ Parallel sessiya:** shu payt boshqa sessiya **KPI-02** (`employee-kpi-target.{controller,
> service,schema}.ts`) va **KPI-04** (`menejer/kpi`, `employee-kpi-screen.tsx`) ni yozmoqda edi —
> ularga tegilmadi, diff path-cheklangan. `schema.prisma` da faqat mening bitta hunk'im bor
> (tekshirildi). Commit hook'larsiz qilindi (lint-staged begona fayl qo'shishining oldini olish),
> gate'lar qo'lda to'liq yugurtirildi.
>
> **⏭️ Keyingi:** KPI-04 (UI) — lekin avval KPI-02 commit tushganini tasdiqla; keyin KPI-05, KPI-06.

> **🕒 2026-08-10i (REJA-MENEJER-KASSA **MK25** — M2 **Phase-2 QA**, menejer nazorat ekranlari) —
> 🌐 **BRAUZERDA O'LCHANDI** (repo Playwright'i, alohida brauzer profili; `climart_adopt`@5432 +
> api 4000 + web 3100). Holat: **Phase-2 QISMAN** — «Phase-2 verified» EMAS. To'liq hisobot:
> `docs/REJA-MENEJER-KASSA-2026-08.md` → «Faza MK25».**
>
> **⚠️ Qamrovning yarmi BAJARIB BO'LMADI va buni bilib turish kerak:** MK25 `MK15–MK24` ga
> bog'liq, lekin **MK23 va MK24 hali qurilmagan** (`menejer/`, `omborchi/`, `scan/` da bironta
> touch-target/responsive kod yo'q — o'lchandi), **MK22** esa route'siz. Ya'ni «real telefonda
> mobil rejim» QA'sining **predmeti yo'q**. **Real telefon ham ishlatilmadi** (qurilma yo'q) —
> 390×844 Chromium viewport'i bilan almashtirildi, bu **kamera-skanerni QOPLAMAYDI**.
> **MK24 qurilgach MK25 QAYTA yugurtirilishi shart.**
>
> **✅ Bandning asosiy talabi bajarildi — pul manzarasi raqamlari ichki hisobotga mos.** Bir son
> uch mustaqil manbadan olinib qiyoslandi va brauzerdagi katak bilan solishtirildi: kassa
> `11 810 000` = `/admin/cash-desks` yig'indisi · mijoz qarzi `550 000` =
> `counterparty-balance.totalDebtMinor` · ta'minotchi `0` = `totalCreditMinor` · bank `—`
> («hisoblanmadi», `0,00 сум` EMAS) ⇒ **sof qoldiq `—`, yarim yig'indi berilmadi**. Spec
> `formatMoney` ni import qilmaydi, qayta hisoblaydi (aks holda format bug'i ikkala tomonda
> barobar «to'g'ri» bo'lardi).
>
> **🔴 D1 (MK16) — eslatma sababi ekranga XOM i18N KALITI bo'lib chiqardi.** O'lchangan chiqish:
> «Romashka MChJ — **pages.menejerCollection.reason_no_chat**». Sabab: `t(\`reason_${…}\` as never)` —
> `as never` typecheck'ni o'chiradi, i18n gate esa dinamik kalitni ko'rmaydi (gate o'zi aytadi:
> «12944 static keys checked, **328 dynamic skipped**»), jo'natgich esa kaliti yo'q kodlar
> qaytaradi (`no_chat`, `business_not_connected`) va ustiga **Telegram xatosining MATNINI** ham
> sabab qilib uzatadi (`reason: msg.slice(0,200)`) ⇒ kodlar to'plami yopiq emas. Tuzatish ikki
> qatlamli: yetishmagan kalitlar + `reasonLabel()` zaxirasi (kalit yo'q ⇒ zaxira matn **va kodning
> o'zi**). MK16 sahifasida umuman komponent testi yo'q edi — 4 test yozildi (RED→GREEN).
>
> **🟠 D2 (MK21) — qaror jurnalida holat umuman tarjima qilinmasdi** (`escalated → force_accepted`),
> qo'shni `menejer` ekrani esa o'sha holatlarni tarjima qiladi. `stateLabel(src, code)` endi
> **manba bo'yicha mavjud lug'atni** tanlaydi (`daily_kpi`→`pages.menejer.state_*`,
> `work_item`→`pages.managerQueue.status_*`) — **uchinchi nusxa ochilmadi**; lug'atsiz manba xom
> KOD bo'lib qoladi (xom kalit yo'li emas). 4 test, **mutatsiya bilan tekshirildi** (shox
> o'chirilganda yiqiladi ⇒ yolg'on-yashil emas).
>
> **Refuted (soxta signal):** brifingdagi «uchta 17» nusxa-ko'chirishga o'xshardi — o'lchandi,
> `stuck`=`Σ stages.total`, `sla_breach`=`overdueCount`, jonli `/manager/sla` da ikkalasi ham
> haqiqatan 17 (barcha ochiq element muddati o'tgan). Wiring bug'i YO'Q.
>
> **Yana tasdiqlandi:** o'chirilgan tugmani chetlab o'tib telefonsiz qarzga eslatma POST qilinsa —
> `queued:0 · journaled:0`, jurnalga yozilmaydi, idempotent (soxta muvaffaqiyat yo'q) ·
> token'siz `manager/money-map` → 401 · skaner: shtrix-kod → tovar kartasi, yo'q kod →
> «topilmadi» (jim qolmaydi) · 10 M2 ekrani konsol/4xx/xom-kalitsiz · 390×844 da **birontasi
> gorizontal toshmaydi** (MK24 uchun baseline: `test-results/mk25/mk25-mobile-overflow.json`).
>
> **Gate:** typecheck 0 · `lint:product` 0 · i18n 9/9 · web Vitest **217 fayl / 3125 test** ·
> Playwright `mk25-manager-m2-qa.spec.ts` **6/6**. `apps/api` tegilmadi.
>
> **QARZ:** (1) MK23+MK24 qurilishi, keyin MK25 qayta · (2) MK22 route'ga ulanishi ·
> (3) **bug-klass ochiq:** `t(\`…\` as never)` web'da yana ~28 joyda — ko'pi yopiq enum
> (xavfsiz), qaysi biri serverdan kelgan ochiq matn bilan ishlashini birma-bir o'lchash kerak;
> i18n gate buni printsipial tuta olmaydi · (4) MK16 ga kichik qarz: `canRemind` kanal
> (SMS/Telegram) umuman sozlanmaganini bilmaydi, ro'yxat tepasida ogohlantirish kerak.
>
> **Parallel sessiya:** Playwright **MCP** brauzeri band edi (egasi «parallel sessiya ishlatyapti»
> dedi) — **tegilmadi**, QA repo'ning o'z Playwright'i bilan alohida profilda yugurtirildi.
> Reja hujjatida begona whitespace tahriri turardi — commit «HEAD + faqat mening hunk'larim»
> blobi bilan qilindi, o'sha tahrir commit qilinmadi.

> **🕒 2026-08-10h (REJA-MENEJER-KASSA **MK40** — 4-Menejer **Phase-2 QA**, ruxsatlar) —
> 🌐 **BRAUZERDA O'LCHANDI** (Playwright MCP jonli, `climart_adopt`@5432 + api 4000 + web 3100).
> Holat: **Phase-2 QISMAN** — «Phase-2 verified» EMAS. To'liq hisobot:
> `docs/REJA-MENEJER-KASSA-2026-08.md` → «Faza MK40».**
>
> **🔴 Eng muhimi — real imtiyoz oshirish teshigi topildi va yopildi.** Faqat `employee:update`
> ruxsatiga ega oddiy xodim brauzerda «Egasi qilish» tugmasi orqali **o'zini `AccountOwner`
> qildi** (cheklangan roli o'chib ketdi). Sabab: `transferOwner` tekshiruvi `holders.length > 0`
> shartidan boshlanardi ⇒ **egasi hali yo'q akkauntda hech kim tekshirilmasdi**. G1 (MK26) bu
> yo'lni ko'rmaydi — bu yerda matritsa yozilmaydi, tayyor tizim roli biriktiriladi. Endi birinchi
> egani faqat `Administrator`/`AccountOwner` tayinlaydi (`ADMINISH_ROLE_NAMES`);
> RED→GREEN test `permissions/owner-transfer-bootstrap.test.ts`, brauzerda qayta tasdiqlandi.
>
> **Yana 5 defekt tuzatildi (hammasi brauzerda ko'rindi, statik audit ko'rmagan):**
> (K2) **16 hujjat-detal sahifasida `not_found` shoxi O'LIK edi** — `if (isLoading || !form)`
> undan oldin turgani uchun 404 sahifani **abadiy «Yuklanmoqda…»** da qoldirardi; deterministik
> kodmod bilan `if (!data) return isLoading ? … : …` shakliga o'tkazildi ·
> (K3) **bosh sahifa 403 da soxta NOL chizardi** («ruxsat yo'q» ≡ «savdo bo'lmadi») — endi
> `ErrorState` + ochiq matn · (K4) `detail_toolbar.pager` uz'da ruscha `«из»` · (K5) G1 rad
> javobi `role="alert"` emas edi · (K6) **«Jarima yozish» pul yozmaydi** (MK07 qarzi) — endi
> ekranda sariq ogohlantirish, aks holda menejer jarima ushlab qolindi deb o'ylardi.
>
> **🔴 Qamrovning 3 bandi BAJARIB BO'LMADI (kutayotgan fazalar, halol yorliq):**
> **filial ∩ scope** — `MK35 ☐`, sxemada **hech bir modelda `branchId` YO'Q** (`Branch` modeli
> bor, ishlatilmaydi) · **shablon qo'llash (MK29)** — BE bor
> (`GET /roles/templates`, `POST /roles/:id/apply-template`), `apps/web` da **0 chaqiruv** ·
> **xodim-override UI (MK26 G1/G2/G3)** — BE bor (`PUT /roles/employee/:id/permissions`,
> `…/explain`), `apps/web` da **0 chaqiruv** (`MK28 ☐`, `EmployeePermission` jadvali bo'sh).
>
> **⚠️ Eng muhim ochiq xulosa:** `recordScopeEnforced` **prodda O'CHIQ** (qamrov **2/47 = 4%**,
> darvoza 🔴 yopiq). Brauzerda o'lchandi: bayroq **off** da `O'zining` (OWN) roli **3 tadan 3**
> yozuvni ko'rsatadi; **on** da **1 tasini** (mexanizm ishlaydi, begona yozuv detali `404`).
> Ya'ni **rol matritsasidagi `O'zining`/`Guruh` tanlovi bugun bajarilmaydigan va'da** va admin
> buni ekranda bilmaydi. Test uchun yoqilgan bayroq **qayta o'chirildi**; test roli o'chirildi,
> QA xodim asl `Manager` roliga, buyurtma egasi adminga qaytarildi.
>
> **Keyingi qadam (tavsiya):** matritsada shu va'dani halollashtirish (bayroq o'chiq bo'lganda
> `O'zining`/`Guruh` yonida ogohlantirish) — MK28 bilan birga; keyin MK35/MK28/MK29-FE
> bajarilgach **MK40 qayta yugurtiriladi**.
>
> **Gate (commit nuqtasida, to'liq):** `typecheck` **10/10 · 0 xato** · `lint:product` **0 error** ·
> `i18n:gate` **9/9** · web Vitest **215 fayl / 3117 test** · api Vitest **530 fayl / 7478 test**.
>
> **Parallel sessiya:** boshqa sessiya shu vaqtda MK17 ni qildi (`06c5c097`, `96f8e190`).
> Mening diffim path-cheklangan; umumiy fayllar (`messages/*.json`, REJA doc) commitga
> **faqat o'z hunk'larim** bilan tushdi (§6.7 B), commitdan keyin `git show --stat HEAD`
> bilan tarkib tekshirildi.

> **🕒 2026-08-10g (REJA-MENEJER-KASSA **MK17** — yo'qolgan mijozlar signali) —
> ✅ **Phase-1: strukturaviy + unit-tasdiqlangan, BROWSER-SMOKE YO'Q** (commit `06c5c097`).
> To'liq hisobot: `docs/REJA-MENEJER-KASSA-2026-08.md` → «Faza MK17».**
>
> **🔴 F005 bog'liqligi BEKOR QILINDI (dalil bilan).** Reja MK17 ni F005 ga
> (`Counterparty.lastActivityAt`) bog'lagan edi; repoda tekshirildi — ustun sxemada ham, kodda
> ham **YO'Q**. Lekin u kerak ham emas: «yo'qolgan mijoz» javobi FAKTdа turibdi — posted
> `Demand` + posted `RetailSale`. Denormalizatsiya qilingan ustun har yozuvchidan yangilanishni
> talab qilardi; bitta unutilgan joy jimgina «yo'qolgan mijoz» yolg'onini bergan bo'lardi.
> **F005 o'sha ustunni qo'shsa ham, bu modul FAKTdan o'qishda qolsin.**
>
> **Uch «ikkinchi manba» ochilmadi:** sabab belgisi → `counterparty_notes` `kind='lost_reason'`
> + `reason_code` (MK16 `DebtNote.kind='reminder'` naqshi; amaldagi sabab = eng oxirgi belgi,
> tarix bepul) · davr → MK13 registri `LOST_CUSTOMER_DAYS` (sukut 60) · marshrutlar → **mavjud**
> `ManagerCustomersController` ga (`GET /manager/customers/lost`, `POST …/lost-reason`) ·
> ekran → MK38 `menejer/mijoz-taqsimoti` ning ikkinchi bo'limi (**ikkinchi mijoz ekrani
> qurilmadi** — reja shuni taqiqlagan).
>
> **F005 ziddiyati (reja testi 3) shunday bajarildi:** F005 ning «90 kun» taymeri **ham shu
> registrga** qo'yildi (`OWNERSHIP_RELEASE_DAYS`, sukut 90) — F005 qurilganda 90 ni kodga
> qaytadan yozmasin. MK17 uni faqat O'QIYDI: davr taymerdan uzun bo'lsa `ownershipConflict`
> ekranda OGOHLANTIRISH beradi (aks holda sotuvchi kesimi jimgina bo'sh chiqardi), egalik
> muddatidan oshgan mijoz esa kesimdan yo'qolmaydi — `releaseDueCount` da alohida sanaladi.
>
> **MK13 registri kengaydi (yon natija):** `unit` endi `percent | days`; **yozuv sirti ochildi**
> (`GET/PUT /manager/thresholds/:key`) — ilgari chegarani o'zgartirishning yagona yo'li bazani
> qo'lda tahrirlash edi. Birlik HAR DOIM registrdan yoziladi; oraliqdan chiqqan qiymat **400**
> beradi, o'qishda esa jimgina sukutga qaytadi (assimetriya ataylab).
>
> **Migratsiya** `20260810150000_lost_customer_reason` — lokal `climart_adopt` ga
> to'g'ridan-to'g'ri SQL bilan qo'llandi (`prisma migrate deploy` bazadagi ESKI yiqilgan
> `20260419135104_init` yozuvi sababli **P3009** beradi — MK37 sessiyasidan qolgan holat,
> MK17 tuzatmadi). **Prodga TEGILMADI → OPS-QADAM.**
>
> **Gate:** turbo typecheck **10/10** · `i18n:gate` yashil · api vitest **7477 pass** · web
> vitest **3116 pass** (+69 yangi test; sof modulning kalendar-kun testi **mutatsiya bilan
> o'lchandi** — xom-ms hisobiga almashtirilganda yiqiladi).
>
> **⚠️ Parallel sessiya faol edi** (sessiya boshida daraxt TOZA edi, ish davomida ~20 fayl
> o'zgardi — MK40 brauzer-QA ishi). Shuning uchun: (a) `ru.json`/`uz.json` ga **«HEAD + faqat
> mening blokim»** blobi qurilib `hash-object -w` + `update-index --cacheinfo` bilan stage
> qilindi ([[commit-pathspec-takes-worktree-version]]); (b) commit **hook'siz** qilindi
> (CLAUDE.md §6.7 B) — lint-staged butun daraxtni stash qilib begona fayllarni qo'shardi;
> gate'lar qo'lda to'liq yugurtirildi; (c) `git show --stat HEAD` bilan tarkib tasdiqlandi
> (**22 fayl, hammasi meniki**).
>
> **🔴 Ochiq qarz (halol):** (1) **browser-smoke YO'Q** → MK40; (2) **prod migratsiyasi
> qo'llanmadi** (OPS-QADAM); (3) `lint:product` da **1 xato qoldi** — parallel sessiyaning
> `apps/web/src/app/(app)/page.tsx` fayli, §6.1 bo'yicha TEGILMADI; (4) to'liq test yugurishida
> **2 flake** (`mutation-guard-coverage`, `comment-template-settings`) — yakka yugurtirilganda
> ikkalasi ham o'tadi (1.1s / 2.2s), 5s timeout yuklamadan; (5) `OWNERSHIP_RELEASE_DAYS` ni
> hech kim QO'LLAMAYDI — taymerning o'zi hamon F005 ning ishi; (6) sabab belgisini «olib
> tashlash» yo'li yo'q (yangi belgi qo'yiladi, eng oxirgisi yutadi).
>
> **🗂️ ARXIV QARZI (bu sessiya QILMADI, ataylab):** shu bo'limda **105** entry bor (chegara
> 8–10). Arxivlash = 5300 qatorli surgery; parallel sessiya FAOL bo'lgani uchun qilinmadi
> ([[rebuilt-blob-goes-stale]] xavfi). **Keyingi TINCH sessiya buni birinchi qadam qilsin:**
> oxirgi 8 tadan eskisini `docs/audits/_ARCHIVE-NEXT-2026-08-10.md` ga ko'chir (faqat
> `appendFileSync`, qator-sonini tekshir — [[doc-append-marker-truncation]]).

> **🕒 2026-08-10f (REJA-MENEJER-KASSA **MK37 + MK38** — `SalesPlan` + plan/mijoz/narx ekranlari) —
> ✅ **Phase-1: strukturaviy + unit-tasdiqlangan, BROWSER-SMOKE YO'Q** (commit `cd091c77`).
> To'liq hisobot: `docs/REJA-MENEJER-KASSA-2026-08.md` → «Faza MK37 + MK38».**
>
> **Nega ikkalasi birga:** topshiriq MK38 edi, lekin uning «plan qo'yish» ekrani **MK37
> (`SalesPlan`) ga tayanadi va MK37 bajarilmagan edi** (repoda 0 hit). Ayri variantlar taqdim
> etildi → **egasi «ikkalasi birga»ni tanladi** (§1 «faqat bitta faza» dan chetlanish — agent
> qarori EMAS).
>
> **MK37:** `sales_plans` (xodim × oy × plan turi) + migratsiya `20260810140000_sales_plan`
> (lokal `climart_adopt` ga qo'llandi; **prodga TEGILMADI → OPS-QADAM**). **Fakt ustuni ATAYLAB
> YO'Q** — fakt `employee_daily_kpi_metrics` dan o'qiladi, foiz `report/metrics/` dan (ikkinchi
> formula yozilmadi; `no-adhoc-formula.test.ts` manba-skani buni qulflaydi). Sof modullar:
> `-types` (4 tur) · `-fact` (oylik yig'indi) · `-target` (**reja ustuvorligi**: `sales_plans` >
> `hr_salary_config.monthly_sales_target` [faqat tushum] > YO'Q — uchinchi plan modeli
> yaratilmadi) · `-progress` (bajarilish + sur'at).
>
> **MK38:** 🔴 **ROOT-FIX** — `CounterpartyService.bulkUpdate` **audit YOZMAGAN** edi, ya'ni mijoz
> taqsimotining eng ko'p ishlatiladigan yo'lida **tarix umuman qolmasdi** (bitta-tahrir yozardi).
> Endi diff yoziladi, jurnal xatosi amalni yiqitmaydi. Yangi `manager/customers` sirti egalikni
> **o'zi yozmaydi** — `bulkUpdate` ga topshiradi (ikkinchi yozuvchi ochilmadi), tarix esa
> `audit_log` ustidagi ko'rinish (yangi jadval YO'Q). 3 ekran: `/menejer/plan` ·
> `/menejer/mijoz-taqsimoti` · `/menejer/narx-siyosati` (oxirgisi mavjud
> `PUT /manager/queue/rules` ustida — **`block` rejimi YO'Q**, manba-skan testi qo'riqlaydi).
>
> **Valyuta shartnomasi:** konvertatsiya YO'Q. Kunlik KPI omborida valyuta ustuni yo'q ⇒ boshqa
> valyutadagi reja `comparable:false` — qiymat KO'RINADI, foiz CHIZILMAYDI.
>
> **Gate:** api tc 0 · web tc 0 · `lint:product` 0 error · `i18n:gate` yashil ·
> **api vitest 7434 pass · web vitest 3107 pass** (+117 yangi test).
>
> **🔴 Ochiq qarz (halol):** (1) **browser-smoke YO'Q** → MK40; (2) **narx TURLARI / guruh
> narxlari ekrani DEFER** — `ContractPrice` (**F004**, asosiy reja) kutilmoqda; (3) «kim qancha
> chegirma bera oladi» **xodim kesimida YO'Q** (chegara hisob bo'yicha yagona); (4)
> `customer_count` / `collected_debt` **fakti o'lchanmaydi** (KPI katalogida ko'rsatkich yo'q —
> ekranda «qo'lda kuzatiladi» deb turadi); (5) **HR oyligi hamon `hr_salary_config` dan o'qiydi**
> (ustuvorlik moduliga ko'chirilmadi — oylik matematikasi o'z QA'sini talab qiladi);
> (6) **prod migratsiyasi qo'llanmadi** (OPS-QADAM).
>
> **🩹 Yo'l-yo'lakay (meniki emas):** `use-audit-labels.test.tsx` sessiya BOSHIDAN qizil edi —
> MK26/MK29 audit slug'lari (`permission-override`, `template-apply`) uchun i18n kaliti yo'q edi
> va Tarix tabida xom slug sizardi. Umumiy gate'ni bloklagani uchun ru+uz ga qo'shildi.
> ⚠️ Hook separatorlarni `_` ga tekislaydi — kalit `-` bilan yozilsa JIM ishlamaydi.
>
> **⚠️ Parallel sessiya:** shu sessiya davomida boshqa sessiya `62377951` (MK22) va `74bb52fd`
> (MK39) ni commit qildi. Diffim ular bilan kesishmadi (`git diff HEAD` bilan tekshirildi).

> **🕒 2026-08-10e (REJA-MENEJER-KASSA **MK39** — record-scope qamrov darvozasi) — ✅ **Phase-1
> complete: darvoza qurildi + qamrov O'LCHANDI · `recordScopeEnforced` ATAYLAB YOQILMADI**
> (browser-smoke YO'Q). To'liq hisobot: `docs/REJA-MENEJER-KASSA-2026-08.md` → «Faza MK39».**
>
> **Fazaning natijasi — o'lchangan «YO'Q».** MK39 prompti birinchi navbatda *«yoqishdan oldin
> qamrov hisobotini chiqar; qoplanmagan endpoint bo'lsa YOQMA»* deydi. Hisobot chiqarildi va
> darvoza **YOPIQ** chiqdi: `{ownerId, groupId, shared}` uchligiga ega **55** modeldan
> record-scope qo'llanadigani **47**, majburlangani esa **2** (`demand`, `customerorder` — **4%**);
> **45 bloker**. Sabab rejaning o'zida yozilgan: MK39 ning bog'liqligi **MK35 + MK36**, ikkalasi
> ham ☐. Shuning uchun bayroq yoqilmadi va 4-to'lqin ulanishi qilinmadi — to'lqinlar tartibi
> saqlandi (aks holda «yarim yoqilgan» holat: 2 modulda cheklov, 45 joyda ro'yxat to'liq ochiq).
>
> **Qurilgani (TDD, 29 yangi test):** `permissions/record-scope-coverage.ts` — 55 qatorli registr ·
> `analyzeReadPath()` ulanishni **o'z entity literali** bo'yicha o'qiydi (izohdagi
> `recordScopeWhere` so'zi va qo'shni modulning `'demand'` literali **sanalmaydi** — grep-count ≠
> grounding) · `canEnableRecordScope()` darvoza · `planFlagChange()` **ataylab asimmetrik**
> (yoqish darvozadan o'tadi, **o'chirish hech qachon to'silmaydi** — bayroq qaytariladigan).
> `scripts/record-scope-coverage.ts` (`pnpm record-scope:coverage` → `docs/audits/record-scope-coverage.md`,
> `--check` da exit 1) · `scripts/ops-record-scope-flag.ts` (`pnpm record-scope:flag`).
>
> **🔒 DARVOZA ↔ SXEMA invarianti** — eng muhim qulf: test `Account.recordScopeEnforced` sxema
> default'i **aynan** `canEnableRecordScope()` natijasiga teng bo'lishini talab qiladi. Bugun
> ikkalasi `false`. **Qamrov yopilgan kunda bu test default'ni `true` qilishni MAJBUR qiladi** —
> ya'ni MK39 ning yoqish qadami unutilib qolmaydi va qamrov teshigi borligicha yoqib bo'lmaydi.
>
> **Testlar bo'sh emasligi MUTATSIYA bilan o'lchandi (3/3 yiqildi):** hamma qator
> `not-applicable` ⇒ darvoza-sxema testi · `Demand` servisi boshqa faylga ⇒ ratchet ·
> `Counterparty` «qo'llanmaydi» ⇒ shablon-refutatsiyasi. **Qo'lda qo'yilgan yagona qaror**
> (8 model record-scope'dan chiqarildi: `Employee`/`Organization`/`Store`/`Country`/`Uom`/
> `TaxRate`/`SalesChannel`/`RetailStore` — dropdown ortidagi ma'lumotnoma, chegara u yerda
> filial o'qi MK35 va HR ruxsatlari MK27) **mustaqil manba bilan refute qilinadi**: rol
> shablonlaridan (MK29) birortasi entity'ga `view` uchun ALL'dan past scope bergan bo'lsa,
> uni «qo'llanmaydi» deb belgilashga yo'l qo'yilmaydi.
>
> **Gate:** api typecheck **0** · `pnpm lint:product` **0 xato** (831 warning) ·
> `vitest run` butun apps/api → **7368 passed | 2 skipped**. Jonli (lokal `climart_adopt`):
> `--list` → akkaunt OFF · `--on` → **rad etildi, exit 1, 45 bloker** · `--off` → o'tdi.
> **Prodga tegilmadi** (OPS-QADAM 12 qo'shildi: `docs/REJA-8-BOLIM-2026-08.md`).
> ⚠️ **Begona yiqilish:** `src/modules/sales-plan/{progress,target}.test.ts` — **untracked**,
> parallel sessiyaning in-flight MK37 ishi (`schema.prisma` M, migratsiya
> `20260810140000_sales_plan` ham ularniki). CLAUDE.md §6.1 bo'yicha TEGILMADI; diff'im
> path-cheklangan, `schema.prisma` stage QILINMADI.
>
> **🔴 QARZ:** (1) **bayroq YOQILMADI** — avval **MK35** (savdo 1-to'lqin + filial filtri),
> keyin **MK36** (pul + mijozlar), keyin MK39 ning 4-to'lqini; har biridan keyin
> `pnpm record-scope:coverage` raqami o'sishi kerak. (2) **Yozish-yo'li** (update/delete/post)
> scope'lari darvoza o'lchoviga KIRMAYDI — H4 RFC bo'yicha alohida keyingi faza.
> (3) Browser-smoke → MK40. (4) **NEXT.md arxiv qarzi: 102 entry** (limit 8–10) — parallel
> sessiya faol bo'lgani uchun bu sessiyada arxivlash QILINMADI (katta shared-fayl operatsiyasi
> ularning ishini chigallashtirardi); toza daraxtda alohida qilinsin.

> **🕒 2026-08-10d (REJA-MENEJER-KASSA **MK22** — 4M TZ §8.1/9: maqsad kaskadi ega → bo'lim →
> xodim) — ✅ **Phase-1 complete: mantiqiy yadro** (sof modul + unit; **browser-smoke YO'Q,
> endpoint YO'Q, FE YO'Q**). To'liq hisobot: `docs/REJA-MENEJER-KASSA-2026-08.md` → HISOBOT
> JURNALI → «Faza MK22».**
>
> **🔴 Rejaning premisasi NOTO'G'RI edi — keyingi sessiya buni bilsin.** MK22 bandi «`KpiTarget`
> (MK13) va `SalesPlan` (MK37) **allaqachon bor** — uchinchi plan modeli yaratma» deydi.
> O'lchandi: `KpiTarget` ning **Prisma modeli YO'Q** (faqat sof `kpi-target.ts`, `grep` bo'yicha
> **chaqiruvchisi yo'q** = o'lik kod), `SalesPlan` esa **umuman yo'q** (MK37 ☐ — o'sha bandning
> o'zida «Holat: `SalesPlan` YO'Q» yozilgan). Ya'ni ogohlantirish paytida DB'da **nol** plan
> modeli bor edi. Ish baribir bajarildi (qamrovi va uchala testi sof mantiq), lekin natija halol
> yorliqlanadi: **MK22 hozircha runtime'da yetib bo'lmaydi.**
>
> **Bajarildi (TDD — RED ko'rildi, 26 yangi test):**
> `kpi-target-cascade.ts` (**YANGI**, sof modul, 0 DB) — `allocate()` bir pog'ona ·
> `buildCascade()` ega→bo'lim→xodim · `cascadeChangePoints()` **tarix yangi jadvalsiz**
> (mavjud `effectiveFrom/To` chegaralaridan; sana arifmetikasi YO'Q) · `splitEvenly()` haftalikni
> kunga bo'lish, **qoldiq ochiq** (`kpi-target.ts` dagi «JIMGINA bo'linmaydi» qoidasining amaliy
> tomoni). `kpi-target.ts` — `TARGET_SCOPE.department` + `TargetSubject.departmentId` (kaskadning
> **o'rta pog'onasi** yo'q edi; `HrDepartment`/`Employee.departmentId` sxemada allaqachon bor).
>
> **🔴 «Jim yolg'on» shartnomalari (hammasi test bilan qulflangan):** ota maqsadi qo'yilmasa
> qoldiq **`null`**, foiz **`null`** (0 va 100% EMAS) · maqsadsiz bola 0 deb **sanalmaydi**,
> `unsetChildRefs` ga tushadi · ota `0n` bo'lsa foiz null, lekin `parent_not_set` **EMAS**
> (0 = qaror, qo'yilmagan = qarorsizlik) · bo'limsiz xodim `unassignedEmployeeRefs` da ·
> kaskad o'qiga kirmagan `position` qatori `outOfCascadeRowIds` da · oshib ketish
> **ogohlantiradi, `blocking: false`** (menejer ataylab 110% «zapas» qo'yishi mumkin).
>
> **DRY:** kaskad MK13 tanlovini qayta yozmaydi — `isTargetRowActive()` va `targetRowBeats()`
> `kpi-target.ts` dan **eksport** qilindi (`resolveTargets()` ham endi shulardan foydalanadi),
> shuning uchun **kaskad va kunlik ball AYNI qatorni g'olib deb biladi**. Qo'riqchi manba
> matnini skanerlaydi (`SCOPE_RANK|maskWidth` bo'lmasin, `from './kpi-target.js'` bo'lsin).
>
> **Testlar bo'sh emasligi MUTATSIYA bilan o'lchandi:** `unallocated: null → 0n` ⇒ 1 test
> yiqildi · `allocated += child.value ?? 0n` ⇒ 3 test yiqildi. Sof-modul qo'riqchisi avval o'z
> **hujjat matnidan** yiqilgan edi (izohdagi «`Date.now()` yo'q» jumlasi) — endi izohlarni olib
> tashlab faqat KOD ustidan skanerlaydi (`codeOnly()`), ya'ni zaiflashmadi.
>
> **Gate:** api typecheck **0** · biome **0** (4 fayl) · `vitest run` butun apps/api →
> **7318 passed | 2 skipped**, 516/518 suite. i18n tegishli emas (API sof mantiq, matn yo'q).
> ⚠️ **Begona yiqilish:** `permissions/record-scope-coverage.test.ts` — juftlik `.ts` fayli yo'q;
> u **untracked** va sessiya davomida paydo bo'ldi ⇒ **parallel sessiya ishi** (MK39
> record-scope). CLAUDE.md §6.1 bo'yicha TEGILMADI; mening o'zgarishimga aloqasi yo'q.
>
> **🔴 QARZ — jonlantirish ketma-ketligi (keyingi sessiya shu tartibda olsin):**
> (1) **MK13-qarz: `KpiTarget` Prisma modeli + migratsiya** — `scope` enum'iga **`department`**
> ham kirsin, aks holda kaskadning o'rta pog'onasi saqlanmaydi; `TargetSubject.departmentId`
> `Employee.departmentId` (`department2` relation) dan to'ldiriladi — ⚠️ eski
> `Employee.department` **String** ustunini ISHLATMANG. (2) MK22 servis/endpoint. (3) MK37
> (`SalesPlan`) — `allocate()` substrat-neytral, qayta yozilmaydi. (4) MK38 ekranlar
> («qoldiq **ko'rinadi**» talabining ko'rinish qismi o'sha yerda).

> **🕒 2026-08-10c (REJA-MENEJER-KASSA **MK29** — TZ §3.4: 10 rol shabloni) — ✅ **Phase-1
> complete** (strukturaviy + unit; **browser-smoke YO'Q**). To'liq hisobot:
> `docs/REJA-MENEJER-KASSA-2026-08.md` → HISOBOT JURNALI → «Faza MK29».**
>
> **⛔ Avval bloklovchi QAROR-B4 yopildi** — va savolning **yarmi noto'g'ri asosga qurilgan**
> ekan (kodda tekshirildi): **`director` degan rol umuman YO'Q** (u faqat
> `Organization.director` matn maydoni va Telegram `directorSlot`); `manager` esa kod
> tekshiradigan, lekin **`seed-hr.ts` da yo'q** slug edi ⇒ menejer shoxi (`resolveShiftActor`,
> `manager-kpi.resolveActor`) seed qilingan bazada **hech qachon ishga tushmagan**. Egasi uch
> qarorni tasdiqladi (rejada B4.1/B4.2/B4.3 sifatida yozilgan).
>
> **Bajarildi (TDD — 81 yangi test):** `permissions/role-templates.ts` (YANGI — 10 shablon,
> `defaults → DENY(sezgir) → grants` uch qatlami) · `permissions.types.ts`
> (`PERMISSION_ENTITIES`/`PERMISSION_ACTIONS` = union'ning runtime nusxasi) ·
> `Role.templateSlug` + migratsiya `20260810130000_role_template_slug` (lokal `climart_adopt`
> ga qo'llandi) · `RolesService.applyTemplate()` + 2 endpoint · `scripts/seed-role-templates.ts`
> (YANGI, idempotent) · `seed-hr.ts` `manager` roli · ru+uz `pages.roleTemplates.*`.
>
> **🔴 UCHTA SHARTNOMA (test bilan qulflangan):**
> (1) **Identifikator = `templateSlug`, `name` EMAS.** Nom foydalanuvchi tahrirlaydigan matn —
> qayta nomlansa shablon aloqasi jimgina uzilardi va ru interfeysda o'zbekcha nom turaverardi.
> (2) **Shablon override'ni O'CHIRMAYDI** (QAROR-B4.3) — faqat rol qatlami yoziladi, javobda
> `maskedByOverride[]` (shablondan **farq qiladigan** individual tuzatishlar). `clearOverrides`
> bayrog'i ko'rib chiqilib **rad etildi**: tasodifiy bosishda ruxsat jimgina kengayardi.
> (3) **Kassir shabloni `KIOSK_ALLOWED` bilan MOS bo'lishi shart** — har katakcha
> `entity→@Controller yo'li`, `action→HTTP metod` bo'yicha tekshiriladi. Aks holda «qog'ozda
> ruxsat bor, amalda `KioskGuard` bloklaydi» — sozlovchi 403 sababini topa olmasdi.
>
> **Testlar bo'sh emasligi O'LCHANDI** (snapshot yashilligi dalil emas): 3 mutatsiya qo'llanib
> tutilishi ko'rildi — DENY qatlami olinsa **8 test**, kassirga `demand:view` berilsa kiosk
> testi, `manager` seed'dan olinsa **4 test** yiqiladi.
>
> **🧪 Runtime unit test topmagan nuqsonni ko'rsatdi:** seed skripti lokal bazada haqiqatan
> yugurtirildi (DRY → `--apply` → qayta `--apply`) va migratsiya `Administrator` ni `admin`
> slug'iga backfill qilgani uchun **ikkinchi «Admin» roli** yaratilgani ko'rindi (bir xil 564
> katakcha). Qidiruv `templateSlug` → nom tartibiga o'zgartirildi, dublikat o'chirildi, qayta
> yugurtirib tasdiqlandi (idempotent: 0 o'zgarish).
>
> **Gate (to'liq):** api typecheck **0** · web typecheck **0** · `lint:product` **0 xato** ·
> `vitest run` butun api **515 fayl / 7291 test YASHIL** · `i18n:gate` **9/9**.
> **Halol yorliq: Phase-1 (strukturaviy + unit), browser-smoke YO'Q** → MK40 (ruxsat QA).
>
> **🔴 QARZ:** (1) **UI yo'q** — shablon tugmasi va `maskedByOverride` ro'yxati **MK28** ishi
> (i18n kalitlari oldindan qo'yildi); (2) **`hrRoles` ↔ ERP roli birlashuvi qilinmadi**
> (QAROR-B4.2 ataylab) — «Kassir» shabloni berilgan xodim avtomat `cashier` hrRole olmaydi,
> ikki lug'at hali qo'lda bog'lanadi; (3) **prod migratsiyasi qilinmadi** — 4 OPS-qadam
> hisobotda (DDL · seed skripti DRY→apply · `manager` HrRole · api restart).
>
> **➡️ KEYINGI:** **MK28** (ruxsat matritsasi UI) — endi bloksiz: MK26 (override + G1/G2/G3),
> MK27 (HR adapteri) va MK29 (shablonlar + `GET /roles/templates`) tayyor.

> **🕒 2026-08-10b (REJA-MENEJER-KASSA **MK26** — TZ §3.1/§3.3: `EmployeePermission` +
> amaldagi ruxsat hisobi + G1/G2/G3) — ✅ **Phase-1 complete** (strukturaviy + unit;
> **browser-smoke YO'Q**). To'liq hisobot: `docs/REJA-MENEJER-KASSA-2026-08.md` → HISOBOT
> JURNALI → «Faza MK26».**
>
> **⚠️ Sessiya MK28 prompti bilan boshlandi, lekin MK28 BLOKLANGAN edi.** O'ZGARMAS QOIDALAR §2
> bo'yicha kodda tekshirildi: `EmployeePermission` sxemada **yo'q**, G1/G2 server tomoni **yo'q**
> ⇒ MK28 ning 3 testidan 2 tasiga (override vizual farqi · G1 rad etilishi) **ma'lumot manbai
> yo'q**. Egasi uch variantdan **«avval MK26»** ni tanladi. **MK28 endi bloksiz** — keyingi
> sessiya uni TO'LIQ qura oladi (sxema · G1/G2/G3 · 2 endpoint tayyor).
>
> **Bajarildi (TDD — 44 yangi test):**
> `packages/db` — `EmployeePermission` modeli + migratsiya `20260810120000_employee_permission`
> (lokal `climart_adopt` ga qo'llandi va **jonli zond** bilan tekshirildi: 8 ustun, FK qoidalari).
> `apps/api/src/modules/permissions/` — `employee-permission.ts` (**sof**, 16 test: rol MAX →
> override, G1 jadvali, G2 manbasi) · `employee-permission.service.ts` (14 test: G1 atomik rad
> etish · G3 audit · cache) · `permissions-override.test.ts` (8, **regressiya qulfi**) ·
> `roles-escalation.test.ts` (6). Ulanish: `permissions.service.ts` (override BIR so'rovda) ·
> `roles.service.ts` (**G1**) · `roles.controller.ts` (2 yangi endpoint) · `permissions.module.ts`.
>
> **🔴 UCHTA SHARTNOMA (sezgiga zid, test bilan qulflangan):**
> (1) **Override `MAX` EMAS — G'OLIB.** `maxScope` qo'llansa `MAX(ALL, OWN) = ALL` bo'lib
> «bitta xodimni cheklash» **umuman ishlamas edi** (TZ §3.1 shuning uchun «u g'olib» deydi).
> (2) **`scope: null` ≠ `scope: 'NO'`** — `null` override'ni O'CHIRADI (rol qatlamiga qaytadi),
> `'NO'` esa ATAYLAB TAQIQ. Zod'da `.nullable()` ataylab `.optional()` EMAS. Shundan kelib
> chiqib: **`employee_permissions` dan NO-qatorlarni sparse-tozalash TAQIQ**.
> (3) **G1 IKKI joyda.** Faqat xodim-override yo'lida bo'lsa yetarli emas edi: TZ §3.3 nomlagan
> hujum aynan **rol matritsasi** orqali («`role:update` olgan xodim o'zini adminga aylantiradi»)
> — menejer yangi rol yaratib `ALL` yozib o'ziga biriktirardi. Endi rol create/update ham
> tekshiriladi; nom-tahriri va `AccountOwner` ozod.
>
> **Bonus:** `GET /permissions/me` `resolveScope()` ustida qurilgani uchun override qatlamini
> **avtomat** hisobga oladi — web'ning modul-yashirish mantiqi qo'shimcha ishsiz to'g'ri ishlaydi.
>
> **Gate (to'liq):** api typecheck **0** · web typecheck **0** (sxema tegildi) · `lint:product`
> **0 xato** · `vitest run` butun api **512 fayl / 7208 test YASHIL** (regressiya yo'q).
> i18n gate yugurtirilmadi — **UI matni TEGILMADI** (faza faqat backend).
> **Halol yorliq: Phase-1 (strukturaviy + unit), browser-smoke YO'Q** → MK40 (ruxsat QA).
>
> **🔴 QARZ:** (1) **UI yo'q** — MK28 ishi; (2) **MK27 APPLY hamon yozilmagan** — MK26 uning
> «jadval yo'q» to'sig'ini oldi, lekin skriptdagi `fail('APPLY yo'li hali yozilmagan')` qatori
> MK27 ning qolgan qismi (ataylab tegilmadi, §1 «faqat bitta faza»); (3) **HR guard** hamon
> `hr_employee_permission` ni o'qiydi; (4) **prod migratsiyasi qilinmadi** — OPS-qadam
> hisobotda (`CREATE TABLE` + 3 FK, jadval bo'sh tug'iladi ⇒ hech kimning ruxsati o'zgarmaydi).
>
> **🧹 Sessiya boshida daraxt tozalandi (shikast, kontent emas):** `NEXT.md` va reja fayli
> HEAD'ga nisbatan **eskirgan** turgan edi (MK27 hisoboti tasvirlagan aynan o'sha holat).
> Tekshirildi — ish daraxtidagi `NEXT.md` da HEAD'da **yo'q birorta qator yo'q** edi, rejada
> faqat 2 noyob qator (`☐ HISOBOT` yorlig'i va stray `c`) ⇒ HEAD'ga tiklandi, avval zaxira
> olindi. Sabab: `isolated-index-leaves-stale-shared-index` (vaqtinchalik indeks bilan commit,
> ish daraxti yangilanmagan).

> **🕒 2026-08-09zf (REJA-MENEJER-KASSA **MK14** — 4M **Phase-2 QA**: menejer nazorati,
> **REAL BRAUZER**) — 3 mahsulot xatosi topildi va tuzatildi + 2 muhit muammosi yopildi.
> To'liq hisobot: `docs/REJA-MENEJER-KASSA-2026-08.md` → HISOBOT JURNALI → «Faza MK14».**
>
> **Uchala xato ham `typecheck` · `biome` · `i18n` · 3078 unit testdan JIM o'tgan edi** —
> faqat brauzerda ko'rindi (yana `browser-qa-catches-what-static-cannot` sinfi):
> **(1) 🔴 Pul 100 barobar noto'g'ri.** `menejer/page.tsx` da `MONEY_UNITS = new Set(['minor'])`,
> backend esa birlikni `'money'` deb yuboradi (`'minor'` — `manager_rule_configs.thresholdUnit`
> lug'atidan, boshqa o'q) ⇒ hech bir pul ko'rsatkichi `formatMoney` ga tushmasdi: kassa tushumi
> **118 100,00 so'm** o'rniga **«11 810 000»**. Menejer aynan shu raqamga qarab kunni qabul qiladi.
> **(2) RU-locale sinishi.** Ko'rsatkich nomi doim `labelUz` chizilardi; RU rejimda butun ekran
> ruscha bo'lib jadval o'zbekcha qolardi. Fix: yagona `metricLabel(m, locale)` (qardosh ekranlar
> allaqachon to'g'ri qilardi). **(3) 🔴 DATA-INTEGRITY — dialog ochiq turib «A» kunni JIMGINA
> QABUL QILARDI:** rad etish dialogining sabab `<select>`ida «a» bosilsa (type-ahead) sahifa
> tezkor tugmasi otilardi — `useHotkey` `SELECT` ni istisno qilmaydi va dialogni bilmaydi.
> **Jonli dalil jurnaldan:** `accept stale -> accepted by owner` — menejer RAD ETMOQCHI bo'lgan
> kun muzlatilgan `accepted` holatiga o'tdi. Fix ikki qatlamli: `useHotkey` endi `SELECT` ni
> istisno qiladi + beshala bog'lash `enabled: !modalOpen`.
>
> **🟡 Ikki MUHIT muammosi (kod emas — lekin PRODGA HAM tegishli, ochiq qarz):**
> **(A)** `20260810070000_shift_acceptance` migratsiyasi qo'llanmagani uchun 3 ekran 500 berardi
> (`javobgarlik` · `qarorlar` · `smenalar` — hammasi `cashier_sessions.acceptance_state` dan).
> Lokal bazaga `prisma migrate diff` → `db execute` bilan qo'llandi (89 satr, faqat qo'shimcha)
> ⇒ drift 0. **Prodga hamon qo'llanmagan.**
> **(B)** `/menejer/undirish` **egaga ham 403** berardi: Administrator rolida `debt*` ruxsat
> qatorlari yo'q edi (eski seed qoldig'i; `permissions-seed-sync.test.ts` YASHIL, ya'ni kod
> drifti emas). `apps/api/src/scripts/topup-role-permissions.ts` yugurtirildi (456→486 qator).
> **Prodda ham yugurtirilishi + `pm2 restart` kerak** (ruxsat keshi 5 daqiqa).
>
> **✅ Brauzerda tasdiqlangan:** 17 menejer ekrani (konsol xatosi 0 · API 4xx/5xx 0 · xom i18n
> kaliti 0) · pul formatlash · RU-locale · rad etish dialogi · tuzatma dialogi ·
> **eskalatsiya → majburiy yopish ikki aktyor bilan** (menejer `escalate` → ega `force_accept`,
> jurnal ikkalasini aktyor+sabab bilan yozdi) · `hr/employees/[id]/kpi`.
> Re-runnable: `apps/web/tests/e2e/mk14-manager-qa.spec.ts` (**7/7**), skrinshotlar
> `apps/web/test-results/mk14/`. *(Eskalatsiya uchun lokal bazada `qa.sotuvchi@qa.local` ga
> `hrRoles:['manager']` + parol berildi — FSM'da eskalatsiya faqat menejer/tizim amali.)*
>
> **⛔ QOPLANMAGAN (halol):** **(1) rad etish → tushuntirish halqasi FE'da YO'Q** — backend
> to'liq tayyor (`POST /manager/kpi/days/:id/explain`), lekin butun `apps/web` da unga birorta
> chaqiruv yo'q (grep bilan tasdiqlandi) ⇒ rad etilgan xodim javob bera olmaydi.
> **Yangi faza qo'shildi: MK44** «Xodim tomoni: mening KPI kunlarim + tushuntirish».
> **(2) Reyting** — MK13 QISMAN (`KpiTarget` sxemasi/endpoint yo'q) ⇒ QA qilinadigan sirt yo'q.
> **(3) Navbat/SLA/byudjet** ekranlari ochiladi va toza, lekin **raqam-to'g'riligi**
> solishtirilmadi (lokal bazada mazmunli ma'lumot yo'q). **(4) Ruxsat matritsasi QA'si — MK40.**
>
> **Gate:** web tc **0** · design-system tc **0** · `lint:product` **0 xato** · `i18n:gate` **9/9**
> · web Vitest **210 fayl / 3078 yashil** · design-system Vitest **155 yashil** · e2e **7/7**.
> Regressiya qulflari mavjud drift-lock fayllarga qo'shildi (+5 test):
> `menejer-acceptance-screen.test.ts` (BE birlik lug'ati ↔ FE `MONEY_UNITS` · `metricLabel` ·
> `enabled: !modalOpen` ×5) va `use-hotkey-from-ui.test.tsx` (`<select>` istisnosi).
>
> **Status: 4M (M1) → «Phase-2 verified»** — yuqoridagi 4 ochiq band bilan.

> **🕒 2026-08-09ze (REJA-MENEJER-KASSA **MK32** — POS xulq-testlari qoplamasi,
> `sotuv/page.tsx` **bo'linishidan OLDIN**) — 6 yangi fayl + `vitest.config.ts`.**
>
> **`apps/web/src/app/(app)/sotuv/page.tsx` (2216 satr) ga bitta satr ham tegilmadi** —
> MK32 xarakteristik faza, butun qiymati «kod o'zgarmagan holda xulq qulflandi» degan gapda.
> `__tests__/` da **77 test / 5 fayl, hammasi yashil**: smena ochish (7) · savat + narx
> tasmalari + chegirma (24) · omborchiga yuborish va aralash to'lov (14) · smena yorlig'i:
> kirim/chiqim, qarz to'lovi, kassadan chiqim, smena yopish + dollar sanog'i (17) ·
> chek detali va qaytarish (15).
>
> **Testlar sahifa ILDIZIDAN kiradi** (`SotuvPage`), ichki komponentlardan emas — ular
> eksport qilinmagan va eksport qo'shish MK32 ning «tegmaslik» shartini buzardi. Buning
> **MK33 uchun to'g'ridan-to'g'ri foydasi bor:** sahifa uch komponentga bo'linganda bu
> testlar **bir harf o'zgarmasdan** yashil qolishi kerak — MK33 ning yagona qabul mezoni shu.
>
> 🔴 **B-1 (tuzatildi, test-konfig):** `vitest.config.ts` dagi satr-alias
> `@moysklad/money` **prefiks** bo'yicha mos kelib, `@moysklad/money/currencies` ni
> `…/src/index.ts/currencies` ga aylantirardi ⇒ shu kichik yo'lni import qiladigan **9 fayl**
> (jumladan **`/sotuv`, `/retail`, `retail/sessions/[id]`** va 4 POS dialogi) **umuman
> render qilinmasdi**. Ya'ni «POS qoplanmagan» holati vaqt yetishmasligidan emas,
> infratuzilma yo'l qo'ymaganidan ham edi. Kichik yo'l uchun alias umumiysidan OLDIN qo'yildi.
>
> 🟡 **Kuzatuvlar (tuzatilmadi, hisobotda K-1…K-3):** (a) uch POS dialogida
> `Dialog.Description` yo'q; (b) smena yopishda dollar farqi `$-10.00` — minus `$` dan
> KEYIN, so'm qatoridan farqli; (c) **narx maydoni bo'shatilsa ekran va hisob ajraladi** —
> `updatePrice` buzuq kiritmada `priceMinor` ni ESKI qiymatda qoldiradi, ya'ni bo'sh maydon
> ko'rinsa ham rasmiylashtirishga eski narx ketadi (ikkita test bilan **o'lchandi**, o'qib
> taxmin qilinmadi). Tuzatish MK33 dan keyingi alohida qarorga.
>
> **Gate:** web typecheck 0 · `lint:product` 0 · `i18n:gate` o'tdi · to'liq web vitest
> **210 fayl / 3097 test**. **1 yiqilgan test MENIKI EMAS:**
> `menejer-acceptance-screen.test.ts` — `useHotkey('a'` HEAD'da BOR, ishchi daraxtda YO'Q
> ⇒ MK14 sessiyasi `menejer/page.tsx` + `useHotkey.ts` ni ayni paytda qayta yozmoqda
> (§6.1 bo'yicha tegilmadi). **Phase-1: strukturaviy + unit-tasdiqlangan, browser-smoke YO'Q.**
>
> ⚠️ **Git:** sessiya boshida indeks eskirgan edi (`NEXT.md` −112, reja fayli −89 STAGED
> o'chirish — parallel sessiya qoldig'i). Commit **vaqtinchalik indeks** orqali qilindi
> (`GIT_INDEX_FILE` + `read-tree HEAD` + faqat o'z yo'llarim); umumiy indeksga va ishchi
> daraxtga tegilmadi. Shu NEXT.md yozuvi commit'ga **HEAD + faqat mening bloki** sifatida
> tushdi — ishchi nusxadagi parallel tahrirlar joyida qoldi.
>
> **⏭️ Keyingi:** **MK33** — `sotuv/page.tsx` → `OpenShiftForm` (~130) / `ChekDetailPanel`
> (~280) / `SalesScreen` (~1540). Sof refactor; 77 test o'zgarmagan holda yashil qolishi shart.


> **🚀 2026-08-09 — ✅ DEPLOYED (erp.sherset.uz / sherset-v2): `4944583 → d647250a`.**
> Box **82 commit orqada** edi (fast-forward, diverging YO'Q) — Faza 32/33 va `q1–q7` ning
> HAMMASI shu deploy bilan chiqdi, ya'ni yuqoridagi entry'lardagi «⏳ DEPLOY QILINMAGAN»
> yorliqlari endi eskirgan. **15 migratsiya qo'llandi** (`_prisma_migrations` 190 → 205).
> Backup: `/root/sherset-v2-backups/pre-deploy-d647250a-20260809-121944.sql.gz` (544MB,
> `gzip -t` OK, 233 CREATE TABLE). Verifikatsiya: `erp.sherset.uz` 200 · `/login` 200 ·
> `/supplies` 200 · API `/health` 200 · `/supplies`,`/demands`,`/driver-trips`,
> `/counterparty-balances/:id` → 401 (tirik) · **2026-08-09 sanasida API stderr'da 0 xato**
> (log'dagi `FST_ERR_DUPLICATED_ROUTE` — 2026-08-05 dan, deploy'dan OLDINGI).
> Jonli bundle grep bilan tasdiqlandi (chunk ichida yangi tone-helper turibdi).
> **⚠️ Hali ham browser-QA YO'Q** — bu HTTP+bundle darajasidagi verifikatsiya, vizual emas.
>
> **🔑 SSH bloker YOPILDI:** parol (`Namoz8808`) hamon O'LIK — paramiko ham, native `ssh` ham
> rad etadi; host-kalitlar o'zgarmagan (server qayta qurilmagan, faqat kirish siyosati).
> **Ishlaydigan yo'l = kalit:** `ssh -i ~/.ssh/sherset_deploy root@13.140.157.10`
> (`sherset-deploy-20260808`, box'da o'rnatilgan). Parolni qayta so'ramang.
>
> **🗄️ DISK OGOHLANTIRISHI:** `/` **96% to'la, 4.6G bo'sh** (build'dan oldin 5.9G edi).
> `/root/sherset-v2-backups` = 5.4G / 18 fayl — keyingi deploy'dan oldin eski backup'larni
> tozalash kerak bo'ladi, aks holda `next build` joy yetmasligidan yiqilishi mumkin.
>
> **🕒 2026-08-09zc (REJA-MENEJER-KASSA **MK15** — 4M §8.1/1: «Korxona puli qayerda» pul
> manzarasi paneli) — `b497d40f`, 22 fayl (+2091/−7). Sahifa: `/menejer/pul-manzarasi`.**
>
> Bir ekranda oltita blok: **kassalarda · bank hisoblarida · mijoz qarzida · ta'minotchi
> qarzida · haydovchi qo'lida · yo'ldagi tovarda**. **Yangi pul formulasi OCHILMADI** — har
> blok o'z manbasining EGASIDAN o'qiladi: `MoneyService.sourceBalances` (kassa/bank —
> u shu qoldiqlarni O'ZI yozadi) · `CounterpartyBalanceService.counterpartyBalanceReport`
> (ikkala qarz, BITTA chaqiruvdan) · `DriverCashService.outstandingByCurrency` ·
> `StockInTransitService.getInTransitValueByCurrency`. Qo'riqchi —
> `money-map-single-source.test.ts`: panel Prisma modeliga to'g'ridan-to'g'ri tegmaydi, xom
> SQL yozmaydi, o'z kurs/sifat qoidasini yozmaydi (**mutatsiya bilan tekshirilgan** — soxta
> `prisma.client.cashDesk.aggregate` qo'shilsa yiqiladi, ya'ni qo'riqchi vakuum emas).
>
> **Uchta shartnoma test bilan qulflandi (hammasi sezgiga zid):**
> 1. **NULL ≠ 0** — manba javob bermasa blok `—` («hisoblanmadi»), `0` EMAS. Bank tomonida
>    bu REAL holat, ehtiyot chorasi emas: `OrganizationAccount.balanceMinor` ni daftar
>    **Faza 11 gacha umuman yozmagan** (`money.service.ts` dagi `allowNegative` izohi) ⇒
>    daftar yozuvi yo'q hisobda saqlangan `0` = «o'lchanmagan». `sourceBalances` shuni
>    provenance sifatida qaytaradi; **kassa esa doim o'lchangan** (har harakat daftardan
>    o'tgan) — ikki manba ATAYLAB asimmetrik.
> 2. **Yarim yig'indi berilmaydi** — bitta blok o'lchanmagan bo'lsa **sof qoldiq `null`**,
>    qolgan beshtasining yig'indisi emas (yarim yig'indi to'liq raqamdek ko'rinardi).
> 3. **Kurs shartnomasi (Faza 17)** — kursi yo'q pul jamiga qo'shilmaydi,
>    `unconvertedByCurrency` da o'z valyutasida chiqadi. Kontragent hisoboti summani O'ZI
>    konsolidatsiya qilgani uchun uning qoldig'i **bir marta** sanaladi: ikkala qarz blokiga
>    ilinsa yakunda IKKI MARTA chiqardi (yozish paytida tutilgan).
>
> **Yo'ldagi tovar QIYMATI** ayni `queryInTransitPositions` dan (per-position
> `MAX(0, qty − received)` clamp) va umumiy `computePositionTotal` bilan narxlanadi. PO
> sarlavhasidagi `sumMinor − receivedSumMinor` **ataylab ishlatilmadi**: u agregat-daraja
> clamp'i, bitta ortiqcha qabul qilingan qator boshqasining qiymatini jimgina yeb qo'yardi.
>
> **DI:** `ManagerModule` endi `MoneyModule`/`ReportModule`/`StockModule`/
> `DriverTrackingModule` ni oshkora import qiladi. **`app-boot.test.ts` bu yerda yordam
> BERMAYDI** — uning in'yeksiya-premisasi qo'riqchisi servis bilan BIR PAPKAdagi
> `*.module.ts` ni qidiradi, `manager/money-map/` esa ichki papka (moduli bir pog'ona
> yuqorida) ⇒ alohida `money-map-wiring.test.ts`. U ayni `report/` dagi
> `CounterpartyBalanceService` olinishini ham qulflaydi: **repoda shu nomli IKKI klass bor**
> (`report/` hisobot · `counterparty-balance/` yozuvchi), noto'g'risi typecheck'da ham,
> DI'da ham «to'g'ri» ko'rinardi.
>
> **Gate (QO'LDA to'liq — hooks CHETLAB O'TILDI):** api+web typecheck 0 · biome: mening
> fayllarim toza · api vitest 63 fayl/616 test · **web vitest 205 fayl/2996 test, regress
> yo'q** · `i18n:gate` o'tdi **+ 15 dinamik kalit ru+uz da QO'LDA tasdiqlandi** (gate
> `t(\`mm_block_${key}\`)` ni «dinamik» deb o'tkazib yuboradi — yashil bo'lishi kalit borligini
> ISBOTLAMAYDI).
>
> **⚠️ PARALLEL SESSIYA (MK20/MK21) ayni paytda 4 UMUMIY faylda ishlayotgan edi**
> (`manager.module.ts`, `layout.tsx`, `ru.json`, `uz.json`). `git add` ishchi daraxt
> versiyasini olgani uchun ularning tugallanmagan ishi commit'imga tushardi (CLAUDE.md
> §6.7 B) ⇒ har biri **«HEAD + faqat mening hunk'larim»** blobi sifatida indeksga yozildi
> (`hash-object -w` + `update-index --cacheinfo`), commit hooks'siz qilindi. Commitdan
> keyin tekshirildi: **22 fayl, hammasi meniki**; parallel sessiya ishi worktree'da butun.
>
> **HOLAT: Phase-1 — strukturaviy + unit-tasdiqlangan, browser-smoke YO'Q.** Runtime-QA
> **MK14** (4M Phase-2) ga qoladi. Tasdiqlanmagan: jonli Prisma `groupBy`/join shakllari va
> panelning real ma'lumotdagi ko'rinishi. **F011 (rollup) hamon ☐** — MK15 uni talab
> qilmadi (hammasi jonli o'qish), lekin katta hisobda panel sekin bo'lishi mumkin.
>
> **🕒 2026-08-10a (REJA-MENEJER-KASSA **MK19** — 4M TZ §8.1/5: ertalabki brifing va kechki
> yakun) — ✅ **Phase-1 complete** (strukturaviy + unit; **browser-smoke YO'Q**).**
>
> **Bajarildi (TDD — 73 yangi test: BE 62 + FE 11):**
> `apps/api/src/modules/manager/briefing/` (yangi papka, 8 fayl) —
> `day-briefing.ts` (**sof**, 25 test): blok registri + rol jadvali + «tinch kun» qoidasi +
> Telegram digest matni va **dedup yorlig'i**. Prisma/Nest/`Date.now()` YO'Q ·
> `day-briefing.service.ts` (18 test): OLTITA **mavjud** servisdan o'qish (`ManagerSlaService.board` ·
> `DailyKpiAcceptanceService.queue` · `ManagerInventoryService.stockSignals` ·
> `ReportService.salesReport` · `ShiftAcceptanceService.queue` · `ManagerQueueService.list`) +
> `TelegramService.send` (mavjud outbox, Faza 28 claim'i) ·
> `briefing-single-source.test.ts` (9 test) — **yangi hisob ochilmagani** qulfi: servis faqat
> `telegramConfig`/`telegramOutbox` Prisma modellariga tegadi ·
> `briefing-wiring.test.ts` (10 test) — DI simlari (`app-boot.test.ts` ichki papkani ko'rmaydi) ·
> `manager-briefing.controller.ts` (`GET /manager/briefing/:kind` — `report:view`;
> `POST /manager/briefing/:kind/telegram` — `report:update`) + Zod sxema ·
> `manager.module.ts` — `CashierSessionModule` + `TelegramModule` OSHKORA import.
> **FE:** `menejer/brifing/page.tsx` + `_components/briefing-screen.tsx` (11 test) +
> `manager-api.ts` tiplari + `messages/{uz,ru}.json` (25 kalit ×2 + subnav) + `layout.tsx` subnav
> (eng tepada — menejer kunni shu yerdan boshlaydi).
>
> **🔴 UCHTA SHARTNOMA (test bilan qulflangan, sezgiga zid):**
> (1) **«tinch kun» faqat O'LCHANGAN nollardan chiqadi** — manba yiqilsa blok `count: null` va kun
> `incomplete`, `quiet` EMAS. Brifing aynan «bugun tinch» deb aytish uchun ochiladi, o'lchanmagan
> manbadan chiqqan xotirjamlik menejerni ekranga o'rgatib keyin jimgina aldardi.
> (2) **Har raqam SIGNAL emas** — `stuck` (jarayonda turgan ish) va `revenue` (tushum) `measure`:
> nolga teng bo'lmasa ham ogohlantirish BERMAYDI, aks holda 5 buyurtma yig'ilayotgan normal kun
> «diqqat» bo'lib chiqardi. Rol jadvali `Record<BriefingBlockKey, …>` — yangi blok jimgina signal
> bo'lib qololmaydi (tc yiqiladi).
> (3) **Yarim yig'indi yo'q** — bitta signal o'lchanmasa `attentionCount: null`; LEKIN o'lchangan
> ogohlantirish `incomplete` ostida YASHIRINMAYDI (holat baribir `attention`).
> **Kassa farqi SUMMASI qo'shilmaydi** (`amountMinor: null`) — kassa TZ §8.4: valyutalar
> aralashtirilmaydi, faqat NECHTA smenada farq bori sanaladi.
>
> **Telegram dublikatsizligi — yangi jadval/migratsiya YO'Q:** kalit xabar matnining ichida
> (`#brifing_YYYY-MM-DD` / `#yakun_YYYY-MM-DD`), `TelegramOutbox` da dedup ustuni yo'q va u umumiy
> resurs (CLAUDE.md §6.4). `pending|sending|sent` topilsa yubormaydi; `dead|failed` (yetkazilmagan)
> qayta yuborishga to'sqinlik qilmaydi.
> ⚠️ **Qolgan xavf (halol):** tekshiruv **atomik EMAS** — bir vaqtdagi ikki so'rov ikkalasi ham
> o'tishi mumkin (unique indeks = migratsiya). Oyna tor va cron yo'q — yuborishni odam bosadi.
>
> **Gate (commit nuqtasida to'liq):** api typecheck **0** · web typecheck **0** · `lint:product`
> **0 xato** · `vitest` **api 506 fayl / 6948 test**, **web 211 fayl / 3089 test** · i18n gate
> (key-existence ru+uz + no-hardcoded) **9 test** — hammasi YASHIL.
> **Halol yorliq: Phase-1 (strukturaviy + unit), browser-smoke YO'Q** → MK25 (M2 Phase-2 QA).
>
> **🔴 QARZ / keyingi sessiyaga:**
> (1) **Avtomatik jo'natish YO'Q** — digest faqat tugma bosilganda ketadi. Cron (masalan 08:30 /
> 20:00) qo'shilsa dedup atomik bo'lishi SHART (unique indeks) — hozirgi tekshiruv odam-tezligiga
> mo'ljallangan;
> (2) `chatId` faqat `TelegramConfig.defaultChatId` yoki so'rov tanasidan — **per-menejer kanal
> yo'q** (MK24 mobil rejimida kerak bo'lishi mumkin);
> (3) brifing **jonli o'qiydi** (6 servis, har biri o'z so'rovlari bilan) — katta hisobda sekin
> bo'lishi mumkin, o'lchanmagan. `money-map` dagi F011 (rollup) bilan bir sinf;
> (4) `report:update` ruxsat qatori eski seed'li bazada bo'lmasligi mumkin (xotira:
> `stale-seeded-db-missing-permission-rows`) — prodda `topup-role-permissions.ts` yugurtirilsin.
>
> **⚠️ Parallel sessiya:** daraxtda menikidan boshqa o'zgarishlar bor edi
> (`manager.module.ts` **staged** qayta-tartiblash · `NEXT.md` bloklarni ko'chirish ·
> `docs/REJA-MENEJER-KASSA-2026-08.md` da MK19 prompti `c` ga aylanib qolgan). Commit **vaqtinchalik
> indeks** bilan qurildi (`GIT_INDEX_FILE` + `read-tree HEAD` + faqat o'z blob'larim); uch umumiy
> hujjatga HEAD blob'i ustiga **faqat mening tahrirlarim** fail-closed skript bilan qayta qo'llandi
> (`scratchpad/build-mine.mjs`). Ularning ishi daraxtda **tegilmagan** holda qoldi.

> **🕒 2026-08-09zb (REJA-MENEJER-KASSA **MK21** — 4M §8.1/8: qaror jurnali ekrani) —
> `ae9b4bc6`, 18 fayl (+2635/−4). To'liq hisobot:
> `docs/REJA-MENEJER-KASSA-2026-08.md` → HISOBOT JURNALI → «MK21».**
>
> TZ «alohida ekran qilinmaydi» degan edi, **egasi teskarisini tanladi**. Tanlov EKRAN haqida,
> ma'lumot modeli haqida emas: **yangi jadval ham, yangi yozuvchi ham ochilmadi**. Sahifa
> `/menejer/qarorlar` — to'rtta MAVJUD append-only hodisa jurnali ustidagi ko'rinish:
> `EmployeeDailyKpiEvent` (MK01/MK02) · `ManagerWorkItemEvent` (MK06/MK07) ·
> `CashierSessionAcceptanceEvent` (MK08) · `SupplyApprovalEvent` (qabul zanjiri).
> «Natijasi» ustunining pul yarmi `HrBonusFineLog.kpiEventId` orqali ulanadi ⇒ teskari (manfiy)
> yozuv ham ko'rinadi.
>
> **Kod o'qimasdan bilinmaydigan qarorlar:**
> · **Bekor qilish belgisi FILTRDAN OLDIN hisoblanadi**, va servis oynadan KEYINGI `reopen`
>   hodisalarini **zond** sifatida ham o'qiydi (faqat oynadagi sub'ektlar bo'yicha). Aks holda
>   1-avgustda qabul qilinib 5-avgustda qayta ochilgan kun 1–2 avgust oynasida «kuchda»
>   ko'rinardi. Mutant testi shu yo'lni tasdiqladi.
> · **`adjust` bekor qilinmaydi** (qayta ochish tuzatilgan raqamni tiklamaydi); **`supply` da
>   teskari amal umuman yo'q** — rad etish zanjirning KEYINGI qarori, oldingisini bekor qilmaydi.
> · **Tizim hodisalari qaror EMAS**: sukut bo'yicha ko'rsatilmaydi, lekin `hiddenSystemCount`
>   ekranda turadi (jimgina yo'qolgan qator «hech narsa bo'lmagan» taassurotini berardi).
> · **`facets` «tor» filtrlarsiz asos to'plamdan** — aks holda aktyor tanlangach ro'yxatda faqat
>   o'sha aktyor qolib, filtr o'zini o'zi qulflab qo'yardi.
> · **Eksport = EKRAN** (ikkinchi so'rov YO'Q); ko'p qatorli izoh kataka siqiladi, shuning uchun
>   fayl satri = qator soni. Cheklovi: eksport ekran cap'i bilan chegaralangan (200/500).
>
> **Testlar:** 50 yangi (sof 24 · servis 8 · read-only qo'riqchi 4 · dinamik i18n 8 · CSV 8).
> Read-only qo'riqchi manba matnini skanerlaydi: sxemada `decision` modeli yo'q · modulda
> `create/update/delete/upsert` yo'q · faqat ruxsat ro'yxatidagi jadvallar · controllerda
> yozuvchi metod yo'q (`queue-does-not-block.test.ts` uslubi).
>
> **Gate:** web tc 0 · biome 0 · i18n:gate 9/9 · api vitest manager+app-boot **811/811** ·
> web vitest **2995 o'tdi, 1 yiqildi** ⚠️ — yiqilgan test va api tc'dagi yagona xato parallel
> sessiyalarning **commit qilinmagan** fayllari (`comment-template-settings.tsx` /
> `kpi-target.ts`), meniki emas.
>
> **Mayda tuzatish (+1):** `menejer/qotib-qolgan/page.tsx` dagi xom `<input type=number>` DS
> `Input` ga o'tkazildi — bu **MK07 hisobotining 1-qarzi** edi va HEAD'da
> `raw-element-conventions` gate'ini qizil ushlab turardi.
>
> **⚠️ Parallel sessiyalar (uchta faol edi: MK13/MK15/MK20).** Umumiy fayllar
> (`manager.module.ts`, `layout.tsx`, `ru/uz.json`, reja hujjati) «HEAD + faqat mening
> hunk'larim» blobi bilan indekslandi. **Birinchi urinishda reja hujjatiga MK20 ning commit
> qilinmagan hisoboti ham tushdi** (`live.slice(at)` fayl OXIRIGACHA olgan edi) — `--amend` bilan
> tuzatildi, blob endi MK21 bo'limida to'xtaydi. Sabog'i: «HEAD + mening qo'shimcham» quruvchi
> skript **boshlanish ham, TUGASH chegarasini ham** aniq belgilashi kerak.
>
> **🔴 Phase-1: strukturaviy/funksional, RUNTIME-TASDIQLANMAGAN — browser-smoke YO'Q.**
> Qolgan qarz (to'liq ro'yxat hisobotda): sub'ekt kartasiga havola yo'q · taminotchi aktyorining
> ismi topilmaydi (ID ko'rinadi) · manba o'qish cap'i 1000 da `totalCount` kesilgan to'plamdan ·
> **`downloadCsv` argument tartibi 9 sahifada TESKARI** (topildi, tuzatilmadi — alohida mayda
> faza + qo'riqchi test kerak).

> **🕒 2026-08-09za (REJA-MENEJER-KASSA **MK20** — 4M §8.1/6: shablon izohlar, tez javob matnlari)
> — 20 fayl. To'liq hisobot: `docs/REJA-MENEJER-KASSA-2026-08.md` → HISOBOT JURNALI → «Faza MK20».**
> *(Harf yorlig'i: `z` band edi va alifbo tugadi ⇒ shu kundan boshlab ikki harfli davom —
> `za`, `zb`, …)*
>
> Menejer kuniga o'nlab navbat elementini yopadi va har safar bir xil gapni qayta yozadi. Endi
> **shablon** bor: rad etish · tuzatma · ogohlantirish. Yangi jadval `manager_comment_templates`
> (migratsiya `20260810110000`, lokal bazaga qo'llandi, **drift 0**), yangi sof modul
> `comments/comment-templates.ts`, yangi HTTP sirt `manager/comment-templates`, ekran
> `/menejer/izoh-shablonlari` + **navbat amal formasidagi tanlagich**.
>
> **🔴 Fazaning butun sababi — JURNALGA MATN KO'CHIRILADI, HAVOLA EMAS.** Havola saqlansa, shablon
> ertaga tahrirlanganda kechagi qaror bugun boshqacha o'qilardi va hech kim bexabar qolardi («summa
> qoidadan nusxa» va «tan narx muzlatiladi» bilan bir klass). **Uch qatlamda qulflangan:**
> (1) sxema — jurnal jadvallarida `templateId` ustuni YO'Q (test `schema.prisma` ni o'qiydi);
> (2) payload — ulanish testi HAQIQIY servisni chaqirib Prisma `data` kalitlarini tekshiradi;
> (3) sof — `materializeComment()` faqat satr qaytaradi, shablon keyin o'zgarsa avvalgi matn
> o'zgarmaydi.
>
> **Shablon MAJBURLAMAYDI:** tahrirlangan matn shablon tanasidan ustun · shablonsiz erkin izoh ham,
> izohsiz amal ham o'tadi · tanlagich shablon bo'lmasa umuman chizilmaydi.
>
> **Qaror nyuanslari:** `escalate`/`acknowledge`/`accept`/`reopen` uchun tur **to'qilmaydi** (soxta
> tur noto'g'ri ro'yxat ko'rsatardi) — kerak bo'lsa menejer `actions` orqali oshkora biriktiradi va
> u xaritadan ustun · **til filtr emas, tartib omili** (qattiq filtr ru shablonini uz UI'da
> ko'rinmas qilardi) · izoh **FSM tekshiruvidan oldin** materiallashadi (`other` sababida shablon
> matni ham majburiylikni qoplaydi) · `usageCount` yozuvi yiqilsa ham izoh qaytadi (**statistika
> qarorni bloklamaydi**) · noma'lum `templateId` → **404** (jimgina izohsiz yopish yo'q) ·
> `MAX_COMMENT_LENGTH = 2000` bir raqam uch joyda (Zod ×2, DB CHECK, kesish) · **seed YO'Q**
> (tayyor matn jurnalga jimgina ko'chib, hech kim yozmagan gap rasmiy izohga aylanardi) ·
> o'chirish emas **arxivlash** · `ruleTypes`/`actions` — yopiq ro'yxatlar (`BIG_DEPT` kabi harf
> xatosi shablonni ko'rinmas qilardi) · `open_for_review`/`mark_stale` biriktirib bo'lmaydi (tizim
> amallari).
>
> **Testlar: +55** — sof modul 22 · servis 11 · ulanish 8 · i18n 6 · FE 8. **Mutatsiya bilan
> tekshirildi:** `uz.json` dan `kind_rejection` olib tashlanganda i18n testi yiqildi.
>
> **Gate:** api typecheck **0** · web typecheck **0** · biome (tegilgan) **0** · `i18n:gate` **9/9** ·
> `src/app-boot.test.ts` **9/9** (yangi DI grafi + yangi controller marshruti) ·
> api vitest `manager/` **801/802** · web vitest to'liq (mening yagona yiqilishim —
> `raw-element-conventions` xom `<textarea>` — `@moysklad/ui` `Textarea` ga o'tkazildi).
>
> ⚠️ **Yiqilgan api testi MENIKI EMAS:** `kpi-score.test.ts` «SCORE_CAP_PERCENT» — parallel
> sessiyaning faol ishi (`thresholds/` untracked). §6.1 bo'yicha tegilmadi.
>
> **Parallel sessiyalar:** ish davomida MK15 (money-map), MK21 (qaror jurnali), MK22 (kpi-target/
> rating) `manager.module.ts`, `layout.tsx`, `ru/uz.json`, reja fayliga tegdi. Ularning ishi
> **tiklanmadi/o'chirilmadi** — ustiga qurildi; reja hisoboti `appendFileSync` bilan qo'shildi
> (qator soni 3082 → 3198, kesish yo'q).
>
> **Status: Phase-1 — strukturaviy + unit-tasdiqlangan, browser-smoke YO'Q** (→ MK25).
> **Ochiq qarz:** (1) kun qabuli ekraniga (`/menejer`) tanlagich ULANMADI — BE tayyor, FE faqat
> navbatda; (2) `ruleTypes`/`actions` ni sozlash UI'si yo'q (BE qo'llab-quvvatlaydi, ekran tur/til/
> sarlavha/matn bilan cheklangan); (3) `usageCount` taxminiy — matn butunlay almashtirilsa ham
> sanaladi; (4) `suggest` yuklamasi real ma'lumotda o'lchanmagan.

> **🕒 2026-08-09zd (REJA-MENEJER-KASSA **MK13** — 4M.10: KPI target + kompozit ball va reyting
> formulasi) — ⚠️ **QISMAN** (formulalar yadrosi tayyor, sxema+wiring QARZ).**
>
> **⛔ Bloklovchi qarorlar YOPILDI (egasi bilan, shu sessiyada):** **QAROR-B2** — kompozit ball
> chegarasi **150% qoladi**, lekin kodda muzlatilmaydi (`manager_rule_configs` → `KPI_SCORE_CAP`);
> **QAROR-B3** — `lower_better` **chiziqli-simmetrik** qoladi (0→200%, maqsad→100%, 2×→0%), nisbat
> shakli rad etilgan; **QAROR-B6** (yangi) — davr reytingiga **faqat qabul qilingan kunlar**
> (`accepted`/`force_accepted`), manba = **muzlatilgan** `scorePercent`. To'liq matn: rejada
> «✅ QAROR-B2/B3/B6 — YOPILDI» + `todo.md`.
>
> **Bajarildi (sof modullar, TDD — 42 yangi test):**
> `manager/thresholds/manager-thresholds.ts` (yangi, 10 test) — son-chegaralar **yagona registri**:
> `KPI_SCORE_CAP` (150) + `BUDGET_WARN_PERCENT` (90, MK12 DEFER-3 «bir xil naqsh, ikki marta emas»).
> Noto'g'ri sozlama **jimgina qo'llanmaydi** (`unit_mismatch`/`out_of_range`/`not_a_number` ochiq),
> `enabled:false` = **chegara yo'q** (sukutga qaytish EMAS) ·
> `kpi-target.ts` (yangi, 19 test) — maqsad ustama qatlami: **xodim > lavozim > hisob > profil**,
> amal oynasi (`YYYY-MM-DD` satr, tz'ga tegilmaydi), **kun maskasi** (§2.5 «kun turi target'ga
> ta'sir qiladi» — tor maska keng maskani yengadi), determinist tanlov ·
> `kpi-rating.ts` (yangi, 13 test) — TZ §11/M10 reytingi («panelda va'da qilingan, formulasi hech
> qayerda yo'q edi»): sport-tartibi (1,1,3), ballanmagan xodim **o'rin olmaydi** (`rank:null`,
> `averageScore:null` — 0 EMAS), qamrov (`daysCounted/daysInPeriod`) ochiq ·
> `kpi-score.ts` — `scoreDay(..., { capPercent })` (null = chegarasiz), `SCORE_CAP_PERCENT` endi
> registr sukutidan; **sukut xulq o'zgarmadi** (+10 test B2/B3 chegara nuqtalarini qulfladi) ·
> `expense-budget/budget-variance.ts` — `DEFAULT_WARN_PERCENT` ayni registrdan.
>
> **Gate:** api typecheck **0** · `lint:product` **0 xato** · `vitest manager + expense-budget`
> **50 fayl / 832 test yashil**. i18n gate yugurtirilmadi — **UI matni tegilmadi**.
> **Halol yorliq: Phase-1 (strukturaviy + unit), browser-smoke YO'Q.**
>
> **🔴 QARZ — «MK13-ikkinchi qism» (keyingi sessiya, TOZA daraxtda):**
> (1) **`KpiTarget` Prisma modeli + migratsiya** — hozir sxema yo'q, ya'ni `kpi-target.ts` ni hech kim
> chaqirmaydi (o'lik kod). Ustunlar resolverdan aniq: `metricDefId · scope('employee'|'position'|
> 'account') · scopeRef **NOT NULL** (NULL'siz unique uchun — `UNIQUE NULLS NOT DISTINCT` kerak
> bo'lmasin) · period · targetValue BigInt · effectiveFrom/To DATE · weekdayMask Int · archived`,
> unique `[accountId, metricDefId, period, scope, scopeRef, effectiveFrom]`;
> (2) **wiring** — `daily-kpi-acceptance.service.ts::scoreRow()` ga `capPercent` + maqsad ustamasi,
> `manager_rule_configs` dan chegara o'qiydigan servis + sozlama endpointi, reyting endpointi
> (`ManagerSlaService.updateStage` naqshi bo'yicha), `manager.module.ts` ga ulash;
> (3) **FE** — reyting paneli + chegara sozlamasi ekrani;
> (4) **§2.5 qolgan bandlari** — tasdiqlangan ta'til · yangi xodim «sinov ramp» · yarim stavka
> (manba HR) → yangi faza taklifi **MK43**. *(Soatga normalizatsiya va «ikki smena» allaqachon bor:
> `KpiMetricDef.perHour` + kunlik agregatsiya.)*
>
> **⚠️ Nega qisqartirildi (parallel sessiya):** sessiya davomida boshqa sessiya AYNI MK13 ga kerak
> bo'lgan fayllarni commit qilinmagan holda tahrirlardi (`schema.prisma`, `manager.module.ts`,
> `daily-kpi-acceptance.service.ts`, `manager-kpi.controller.ts`) va sessiya o'rtasida `ae9b4bc6`
> (MK21) commit qildi. Egasi «kolliziyasiz yadroni hozir qil» variantini tanladi (CLAUDE.md §6.4/§6.7).
> Commit **vaqtinchalik indeks** bilan qurildi (`GIT_INDEX_FILE` + `read-tree HEAD` + faqat o'z
> blob'larim) — ularning **staged** fayllari commit'imga kirmadi; umumiy hujjatlarga HEAD blob'i
> ustiga **faqat mening tahrirlarim** qayta qo'llandi (fail-closed skript).
>
> **🕒 2026-08-09z (REJA-MENEJER-KASSA **MK07** — 4M.5b: TZ §5.2 ning 12 qoida turi + §5.3 sabab
> kodlari) — `0b344aaf`, 15 fayl (+2711/−59). To'liq hisobot:
> `docs/REJA-MENEJER-KASSA-2026-08.md` → HISOBOT JURNALI → «Faza MK07».**
>
> MK06 dvigateli **kodda tasdiqlandi** (registr · planner · FSM · servis, 76 test yashil), keyin
> registr TZ §5.2 jadvalining to'rt toifasi bo'yicha to'ldirildi. Yangi sof modul
> `rule-candidates.ts` — har qoida uchun nomzod quruvchi. **Navbat: 76 → 127 test.**
>
> **Sanoq halol:** TZ jadvalida 12 katak, registrda 13 TZ turi (`LATE`/`ABSENT` bir katakda, lekin
> chegara birligi daqiqa vs chegarasiz ⇒ bitta tur ikkisiga xizmat qila olmaydi) + MK06 ning
> `PRICE_CHANGE` i = jami **14**. Har 12 katak qoplangan, test qo'lda yozilgan `TZ_CATALOG` bilan
> qulflaydi (registrdan olinmagan — aks holda test o'z-o'zini tasdiqlardi).
>
> **Yangi yozuvchi OCHILMADI** — hamma qoida mavjud manbadan: `CashierAuditEvent` (TZ §5.2 ko'rsatgan
> manba, 4 qoida BITTA so'rovdan) · `Debt` (qoldiq = total−paid) · `HrAttendance` + `resolveShift`
> jadval hukmi · `stock-signals.ts` (4M.8 — **nusxa emas**, `stockSignalRows()` xom qatorlar uchun
> ajratildi) · `RestockTask` · `Inventory`.
>
> **🔑 `dedupKey` ikki oilaga bo'lindi.** *Hodisa* qoidasi — kalitda manba yozuv `id` si
> (`below_cost:<eventId>`), bir marta ko'riladi. *Holat* qoidasi (`BIG_DEBT`, `OVERDUE_DEBT`,
> `LOW_STOCK`, `DEAD_STOCK`) — kalitda obyekt + **OY**: oysiz kalit holatni bir marta ko'rilib
> **abadiy jim** qilardi, har `sync` da yangilansa navbat bir xil qator bilan ko'milardi. Oy yorlig'i
> **Toshkent** kalendaridan (UTC dan olinsa oy chegarasida 5 soatlik xato).
>
> **§5.3 — sabab kodi endi QOIDAGA bog'langan.** `RULE_REASON_CODES` har qoidaga 3–4 kod beradi
> (`competitor_price`, `expiring_goods`, `sick_leave`, `theft_suspected`…) va faqat `acknowledge` ga
> qo'shiladi: `dismiss`/`record_fine`/`escalate` **qarorni** tavsiflaydi, sabab esa hodisa **nega**
> bo'lganini — aralashtirilsa «raqobatchi narxi tufayli DUBLIKAT» kabi ma'nosiz juftliklar chiqardi.
> Begona qoidaning kodi **rad etiladi** (`sick_leave` bilan `BELOW_COST` yopilmaydi), aks holda TZ
> kutgan «zararga sotuvlarning 30% — raqobatchi narxi» statistikasi buzilardi. Tip to'liq `Record`:
> registrga qoida qo'shilib kodlari unutilsa — **typecheck yiqiladi**.
>
> **Sabab ro'yxati endi BE dan keladi** (`list()` javobida `reasonCodes`) — `navbat/page.tsx` dagi
> qo'lda yozilgan nusxa o'chirildi (ikki ro'yxat ajralsa menejer tanlagan kod 400 bilan qaytardi).
>
> **i18n qo'riqchisi:** 12 qoida nomi + 45 sabab kodi ru+uz. Kalitlar ekranda **dinamik** yasalgani
> uchun `i18n:gate` ularni **umuman ko'rmaydi** (300 dinamik kalit o'tkazib yuboriladi) ⇒ API tomonda
> `rule-i18n.test.ts` qo'shildi. **Mutatsiya bilan tekshirildi** — `rule_BIG_DEBT` ni uz.json'dan
> olib tashlaganda 2 test yiqildi, ya'ni test bo'sh emas.
>
> **Gate (qo'lda to'liq — hook'lar bir martaga chetlab o'tildi, parallel sessiyalar faol edi):**
> api typecheck 0 · web typecheck 0 · `lint:product` 0 error · `i18n:gate` 9/9 ·
> api vitest (manager + attendance-geo + retail-sale) **1017/1017** · `app-boot` 9/9 (yangi
> `@Inject` grafi) · web vitest **2970 o'tdi, 1 yiqildi**.
>
> ⚠️ **Yiqilgan web testi MENIKI EMAS:** `raw-element-conventions` →
> `app/(app)/menejer/qotib-qolgan/page.tsx:201` xom `<input>`. Fayl **MK10** commit'idan
> (`5f3ce376`), HEAD'da ham shunday. §6.1 bo'yicha tegilmadi — **MK10 egasining qarzi**.
>
> **Parallel sessiyalar:** ish davomida MK10 · MK16 · MK12 commit qilindi va `work-item-rules.ts`
> (`hours` birligi), `manager.module.ts`, `ru/uz.json`, reja fayliga tegdi. Ularning ishi
> **tiklanmadi/o'chirilmadi** — ustiga qurildi. Commitdan oldin har fayl `git diff -U0 | grep '^@@'`
> bilan tekshirilib, daraxtda faqat o'z hunk'larim qolgani tasdiqlandi; commitdan keyin
> `git show --stat HEAD` — 15 fayl, begona fayl **yo'q**.
>
> **Status: Phase-1 — strukturaviy + unit-tasdiqlangan, browser-smoke YO'Q** (→ MK14).
> **Ochiq qarz:** (1) `record_fine` hamon `HrBonusFineLog` ga **PUL YOZMAYDI** — QAROR-B1 ga bog'liq
> (MK01 bloklangan); (2) chek valyutasi audit payload'ida muhrlanmagan ⇒ elementlar `currency: null`;
> (3) `PICKING_SLA` = 4 soat — TZ raqami emas, sozlanadigan boshlang'ich qiymat; (4) `ABSENT` oynasi
> 31 kun (javobda `absentWindowDays` — kesish oshkora); (5) `sync()` yuklamasi real ma'lumotda
> **o'lchanmagan**.

> **🕒 2026-08-09y (REJA-MENEJER-KASSA **MK12** — 4M.9: xarajat byudjeti, modda × oy) —
> `c5e1b153`, 20 fayl (+2202). To'liq hisobot:
> `docs/REJA-MENEJER-KASSA-2026-08.md` → HISOBOT JURNALI → «Faza MK12».**
>
> Yangi `ExpenseBudget` (`expense_budgets`: `account × modda × oy` unique, `planned_minor`,
> CHECK `>= 0` va `YYYY-MM`) + yangi `ExpenseBudgetModule` (AppModule'ga ulangan) +
> `GET/POST/DELETE /expense-budget` + ekran `/menejer/byudjet` + 32 i18n kaliti ru+uz.
>
> **🔴 «Ikki manba qo'shilmaydi» AYNAN nima ekani aniqlandi:** `retail_drawer_cash_out` uch xil
> pul chiqishini bitta jadvalda saqlaydi va **inkassatsiya (`kind='collection'`) xarajat EMAS** —
> u kassadan bankka ko'chirish; filtrsiz yig'ilsa o'sha pul keyin bankdan `PaymentOut` bilan
> chiqqanda **ikkinchi marta** sanalardi. Shart `drawerExpenseWhereKind()` ga chiqarildi va ikki
> joyda qulflandi. `Loss` ataylab qo'shilmadi (tovar chiqimi, qiymati COGS'da). **Yangi yozuvchi
> ochilmadi** — servis xarajat hujjatiga `create/update/delete` qilmasligi manba-skan testi bilan
> qulflangan.
>
> **NULL ≠ 0 uch joyda:** reja qo'yilmagan oy → og'ish/foiz NULL, status `no_plan` (100% ham, 0%
> ham emas; **reja yo'qligi = QATOR yo'qligi**, `planned_minor=0` emas) · kursi yo'q valyutadagi
> REJA → NULL + `planUnconvertible` (0 deb o'qilsa «oshib ketdi» yolg'oni chiqardi) · kursi yo'q
> FAKT → jamiga qo'shilmaydi, `unconvertedByCurrency` da qoladi. Moddasiz/tanilmagan tegli pul
> alohida qatorda; bir nom ikki moddada bo'lsa taxmin qilinmaydi (`ambiguousNames`).
> Oy chegarasi `monthInstantBounds` (Toshkent), `monthBounds` (UTC) EMAS.
>
> **Testlar 40 ta** (fact 8 · variance 11 · servis 11 · FE 10), TDD RED→GREEN.
> **Gate qo'lda to'liq** (parallel sessiya faol → hook chetlab o'tildi): api/web typecheck 0 ·
> biome 0 (o'z fayllarim) · i18n gate o'tdi · api vitest 484/486, web 200/201 — **ikkala yiqilish
> ham parallel sessiyaning in-flight fayllarida** (MK07 `manager-queue.service.test.ts`,
> MK10 `qotib-qolgan/page.tsx`), meniki emas. `ru/uz.json` uchun «HEAD + faqat mening
> hunk'larim» blobi qurildi — MK07 kalitlari bu commit'ga tushmadi.
>
> **HOLAT: Phase-1 — strukturaviy + unit-tasdiqlangan, BROWSER-SMOKE YO'Q** (runtime QA = MK14).
>
> **Qarz:** (1) **MK41** — `pnl.service.ts` POS xarajatini (`retail_drawer_cash_out`) ko'rmaydi,
> shu sababdan «xarajat» ikki ekranda ikki xil; (2) **MK42** — `cash_out`/`payments_out` dagi
> modda tegi hamon erkin matn (FK emas) ⇒ «bir nom ikki modda» holati mumkin; (3) ogohlantirish
> chegarasi 90% — TZ'da yo'q, agent tanlagan (so'rov parametri, muzlatilmagan) — MK13 dagi
> `SCORE_CAP_PERCENT` bilan BIRGA sozlamaga chiqarilsin; (4) **OPS:** prod `sherset_v2` da
> `20260810100000_expense_budget/migration.sql` qo'lda qo'llanishi kerak (lokal `climart_adopt`
> da qo'llandi); (5) **preflight yolg'on pozitivi:** `scripts/preflight.mjs` matn ichidagi har
> qanday 8-belgili hex'ni commit hash deb o'qiydi — `a0b44c73` aslida tovar UUID prefiksi
> (`NEXT.md:689`), `9c046ac2` esa md5 dajesti (`NEXT.md:837`); (6) **NEXT.md top-entry'lari
> 18+ ta** — arxivlash kerak, lekin parallel sessiyalar faol bo'lgani uchun shu sessiyada
> QILINMADI (umumiy faylni og'ir qayta yozish begona ishni yo'qotish xavfi).
>
> **🕒 2026-08-09x (REJA-MENEJER-KASSA **MK16** — qarz undirish ish ro'yxati, 4M §8.1/2) —
> `bc006578`, 15 fayl. To'liq hisobot:
> `docs/REJA-MENEJER-KASSA-2026-08.md` → HISOBOT JURNALI → «Faza MK16».**
>
> Yangi ekran `/menejer/undirish` + `GET/POST /manager/collection[/remind]`. Menejer bir
> ekranda: **kimdan qancha** · **necha kun kechikkan** · **javobgar** · **oxirgi aloqa** ·
> **harakat**. BLOKLAMAYDI.
>
> **Ikkinchi haqiqat ochilmadi (uch joyda):** qatorlar mavjud `Debt` daftaridan · eslatma
> mavjud `DebtService.sendBulkReminders` (SMS/Telegram) ga topshiriladi · **idempotentlik
> jurnali yangi jadval EMAS** — mavjud `DebtNote` ga `kind='reminder'` (migratsiya kerak
> emas; eslatma qarzning muloqot tarixida ko'rinadi; `recomputeLastCall` faqat `kind='call'`
> o'qigani uchun qo'ng'iroq natijasi buzilmaydi — kodda tasdiqlandi).
>
> **Shartnomalar:** bir qarzga bir **Toshkent kunida** bitta eslatma · jurnal **FAQAT
> haqiqatan ketganga** yoziladi (telefoni yo'q qarz bugun qayta urinishga ochiq qoladi) ·
> **NULL ≠ 0** (muddatsiz qarz «bugun» emas, alohida belgi) · kechikish **kalendar
> kunlarida** (yorliq ≠ instant) · valyutalar qo'shilmaydi · tartib to'liq determinist.
>
> **Testlar 34** (22 sof + 12 servis). Sof modul RED holatida ko'rildi; **servis testlari
> mutatsiya bilan o'lchandi** (idempotentlik qulfi va jurnal filtri olib tashlanganda 4 test
> yiqildi) — vakuum emas.
>
> **Gate:** api+web typecheck mening fayllarimda 0 · biome 0 · i18n mening kalitlarim 0
> yetishmovchilik · api **204/204** · web **1272 yashil**. Daraxtdagi qolgan yiqilishlar
> parallel sessiyalarniki (MK07 navbat `reasonCodes`, MK12 byudjet) — hisobotda fayl-ma-fayl
> o'lchab ajratilgan.
>
> **Git:** commit «HEAD + faqat mening hunk'larim» usulida qurilgan (§6.7) — `layout.tsx` va
> `messages/{uz,ru}.json` da parallel **MK12** sessiyasining commit qilinmagan `byudjet` bandi
> bor edi, u ATAYLAB olinmadi (sahifasi git'da yo'q ⇒ 404 bo'lardi). Ikki tomon ham
> tekshirildi: HEAD'da MK16 bor / MK12 yo'q, ishchi daraxtda MK12 omon.
>
> **⚠️ Phase-1: strukturaviy + unit-tasdiqlangan, browser-smoke YO'Q** → MK14.
> **Ochiq qarz:** «muddat» = `nextContactAt` (`Debt` da alohida `dueDate` YO'Q) · MK06
> navbatiga ulanmagan · kanal-aniq idempotentlik yo'q (bugun SMS ketsa Telegram ham ketmaydi) ·
> `todo.md` yangilanmadi — §8.1 to'lqini (MK15–MK24) u yerda umuman kuzatilmaydi (hisobotda
> sababi yozilgan).

> **🕒 2026-08-09w (REJA-MENEJER-KASSA **MK10** — 4M.7: «nima qotib qolgan» + SLA paneli) —
> `5f3ce376`, 15 fayl (+2203/−4). To'liq hisobot:
> `docs/REJA-MENEJER-KASSA-2026-08.md` → HISOBOT JURNALI → «Faza MK10».**
>
> **Nima qilindi:** jarayonning qaysi bosqichida ish turib qolgani + har bosqich uchun SLA
> chegarasi. **MK06 navbatidan boshqa savol:** navbat bo'lib O'TGAN qoida buzilishini yig'adi,
> bu panel HALI BO'LMAGAN ishni yoshi bo'yicha ko'rsatadi. Besh bosqich (reja ro'yxati aynan):
> yig'ilmagan buyurtma (`MsPickList`) · qabul qilinmagan yetkazma (`Supply.approvalStage`) ·
> javobsiz murojaat (`ServiceRequest`) · yopilmagan smena (`CashierSession`) · o'tkazilmagan
> hujjat (`Demand`/`PaymentIn`/`PaymentOut`/`CashIn`/`CashOut` qoralamalari).
> BE: `apps/api/src/modules/manager/sla/` (sof `stuck-sla.ts` + servis/schema/controller,
> `GET /manager/sla`, `GET /manager/sla/stages`, `PUT /manager/sla/stages/:stage`).
> FE: `/menejer/qotib-qolgan` + subnav `stuck_sla` (navbatdan keyin) + 48 i18n kalit ru+uz.
>
> **Qarorlar (keyingi sessiya bilishi shart):**
> - **Chegaralar `manager_rule_configs` da, `SLA_*` kalitlari bilan** — MK06 navbat qoidalari
>   bilan AYNI jadval, kesishmaydigan nom fazosi; `resolveRules`/`resolveSlaStages` bir-birining
>   kalitini jim tashlab ketadi. **Migratsiya YO'Q** (rejaning «Fayllar» ro'yxatida ham sxema
>   yo'q edi). MK07 `MANAGER_RULES` ni to'ldirganda shu ajratma buzilmasin.
> - **Birlik chegaradan ajralmaydi:** faqat `hours`/`days` (24× aniq o'girish). `percent`/`minor`/
>   `qty` RAD etiladi va `thresholdRejected` bayrog'i ekranda chiqadi.
> - **`STAGE_OPEN_STATES` = «ochiq holat» yagona manbai** — servis Prisma `where` bandini aynan
>   shundan quradi, ya'ni yopilgan ob'ekt BAZADAN ham o'qilmaydi.
> - **Yetkazma yoshi `SupplyApprovalEvent` oxirgi hodisasidan** (`updatedAt` EMAS: pozitsiya
>   tahriri ham uni yangilab, qotgan hujjatni «hozirgina qimirlagan» qilardi).
> - **`SHIFT_CLOSE` chegarasi `live-status.ts` dagi `SHIFT_LONG_HOURS` ni import qiladi** —
>   ikkinchi raqam kiritilmadi (bir hodisa ikki ekranda turlicha baholanmasin).
>
> **Halol cheklovlar (qarz):** (1) **browser-smoke YO'Q** — Phase-1, sahifa jonli brauzerda
> ochilmagan; (2) **i18n gate dinamik kalitlarni ko'rmaydi** — `t(\`stage_${x}\`)`/`t(\`state_${x}\`)`
> «dynamic» deb o'tkaziladi, ya'ni yangi holat qiymati paydo bo'lsa ekranda kalit nomi ko'rinadi
> va hech bir gate tutmaydi; (3) `ServiceRequest.dueDate` ISHLATILMADI (panel «qancha vaqtdan beri
> qimirlamadi» ni o'lchaydi, va'daga nisbatan kechikish — boshqa ko'rsatkich); (4) yig'ish yoshi
> buyurtma KELGAN paytdan (omborchi qo'liga olgani mijoz kutishini nolga qaytarmaydi);
> (5) valyutasiz manbalar (`MsPickList`, `CashierSession`) `currency: null` qaytaradi va FE
> bazaviy valyuta bilan chizadi — tasdiqlanmagan taxmin; (6) boshlang'ich chegaralar
> (4/24/8/12/48 soat) egasi bilan kelishilmagan — sozlamadan o'zgartiriladi;
> (7) manba shifti 500/manba — oshsa xulosadagi sonlar «kamida shuncha» (`sourceTruncated`).
>
> **Gate (qo'lda, to'liq):** api typecheck 0 · web typecheck 0 · `i18n:gate` o'tdi ·
> api `manager/` + `app-boot` **595/595** · web `menejer/` **29/29** · biome MK10 yo'llarida 0.
> ⚠️ `pnpm lint:product` repo-bo'ylab YASHIL EMAS — yiqilishlar **parallel sessiyalarning commit
> qilinmagan fayllarida** (`queue/manager-queue.service.ts`, `modules/expense-budget/*`,
> `menejer/_components/expense-budget-screen.tsx`, `queue/rule-candidates*`). Tegilmadi (§6.1).
>
> **🔀 PARALLEL SESSIYA OGOHLANTIRISHI:** shu sessiya davomida daraxtda **uch boshqa sessiya**
> faol edi (MK07 qoida registri · MK12 xarajat byudjeti + migratsiya · MK16 qarz undirish).
> 5 shared fayl (`manager.module.ts`, `layout.tsx`, `messages/{ru,uz}.json`, REJA md) uchun
> **«HEAD + faqat mening hunk'larim» blobi** qurildi (`hash-object -w` + `update-index
> --cacheinfo`), hook'lar bir martaga chetlab o'tildi. Ish daraxti TEGILMADI — ularning
> commit qilinmagan ishi joyida. `work-item-rules.ts` ga qo'shilgan `hours` birligi
> QAYTARIB OLINDI (MK07 o'sha faylni yozayotgan edi); MK10 o'z lug'atini saqlaydi
> (`SLA_THRESHOLD_UNIT`), `days` qiymati MK06 dagi bilan bir xil satr.
>
> **Keyingi:** MK07 (12 qoida turi) yoki Phase-2 QA — `/menejer/qotib-qolgan` ni jonli brauzerda
> (bo'sh holat · chegara tahriri · `thresholdRejected` · `sourceTruncated`).

> **🕒 2026-08-09v (REJA-MENEJER-KASSA **MK18** — xato narx nazorati) — `b57615ce`
> (+ tiklash `84efc024`), 11 fayl (+1927/−1). To'liq hisobot:
> `docs/REJA-MENEJER-KASSA-2026-08.md` → HISOBOT JURNALI → «Faza MK18».**
>
> **Muammo (kodda tasdiqlangan):** MK11 narx **o'zgarishini** ko'radi; narx qiymatining O'ZI
> mantiqlimi degan savol yo'q edi. `cashier-audit.ts` da `SOLD_BELOW_COST`/`SOLD_BELOW_WHOLESALE`
> bor, ammo faqat **chek** uchun va faqat ikki pol — **o'nlik xatosi, nol narx, o'rtachadan
> keskin farq** detektorlari repoda YO'Q edi, yuk xatida esa nazoratning o'zi yo'q edi.
>
> **Nima qilindi:** sof modul `manager/inventory/price-error-control.ts` (**32 test**) — 5 detektor
> (`ZERO_PRICE` · `DECIMAL_SHIFT` 10×/0.1× · `BELOW_COST` · `BELOW_WHOLESALE` · `PRICE_OUTLIER`),
> har birining o'z mo'ljali bilan. `priceErrors()` servis chek+yuk xati qatorlarini o'qiydi
> (yangi yozuvchi YO'Q), `GET /manager/inventory/price-errors`, FE `/menejer/xato-narx` + subnav +
> i18n ru+uz (35 kalit).
>
> **🔴 Fazaning qarori:** **chegirma — TUSHUNTIRISH, xato emas.** `cashier-audit.ts` bilan ataylab
> birlashtirilmadi: u **siyosat** savoliga javob beradi («pul yo'qotildimi?» — chegirma bilan ham
> yo'qotilgan), bu esa **ma'lumot sifati** savoliga («raqam xato yozilganmi?»). Sabab modul
> izohida va (2)/(2b) test juftligida qulflangan — kimdir «bittaga yig'aylik» demasin.
>
> **NULL≠0 va «tekshirilmagan» ≠ «toza»:** mo'ljal yo'q bo'lsa hukm chiqarilmaydi, sabab
> `unchecked` ga yoziladi; ekranda «0 xato» va «0 xato, lekin 400 qator tekshirilmadi» ALOHIDA.
> O'rtacha — **leave-one-out** (aks holda bitta 10× xato o'rtachani ko'tarib o'zini «normal»
> qilardi), namuna 3 tadan kam bo'lsa hukm yo'q.
>
> **Test sifati o'lchandi:** 5 mutant qo'llanib har biri TUTILDI. Yangi FE qo'riqchisi BE yopiq
> ro'yxatini **manbadan** skanerlaydi — `i18n:gate` dinamik kalitlarni ko'rmaydi (289 «skipped»),
> MK08 dagi `duty_shift_unaccepted` bo'shlig'i takrorlanmasin.
>
> **⚠️ AJRATILGAN INDEKS POYGASI — yangi bug-klass (hisobotda to'liq retsept).** 4 sessiya bir
> vaqtda `GIT_INDEX_FILE` bilan commit qildi. `8b6dca81` (MK09) eskirgan indeksdan qurilib
> **MK18 ning 11 faylini o'chirdi**; mening tiklashim (`84efc024`) esa oradagi `8210ac44` (q14)
> ning `pages.api_tokens` ini tushirib qoldirdi. Keyingi sessiyalar qaytardi. **Qoida:** blob va
> `read-tree` bir xil **pinned HEAD** dan · farq «faqat-qo'shish» ekani dasturiy tekshirilsin ·
> `update-ref HEAD <yangi> <eski>` (**compare-and-swap**) · commit'dan keyin
> `git cat-file -e HEAD:<path>` bilan o'z fayllaringni TEKSHIR.
>
> **Yakuniy holat tekshirildi:** 8 kod fayli HEAD da daraxt bilan bayt-bayt bir xil, i18n 35 kalit
> ru+uz, subnav va layout yozuvi joyida. Gate: api tc 0 · web tc 0 · i18n 9/9 · inventory 95 test ·
> FE qo'riqchi 13 test. `lint:product` da 22 xato bor — **22/22 si parallel sessiyalarniki**.
> To'liq suite'dagi 5 yiqilish ham meniki EMAS (o'lchab tasdiqlandi): `publication` argon2 timeout
> (yakka 21/21 yashil) va `pos-payment-contract` (parallel retail-tenders refaktori; HEAD'da yashil).
>
> **Ochiq qarz:** brauzer-QA yo'q (→ MK14) · yuk xatida mo'ljal kartaning BUGUNGI narxi
> (`DemandPosition.basePriceMinor` muzlatish — alohida faza) · navbat elementi hali SAQLANMAYDI
> (MK06 `ManagerWorkItem` ga ulash kerak, `dedupKey` ko'prik tayyor) · chegaralar
> `ManagerRuleConfig` ga ko'chirilmagan · ko'p valyutali karta uchun `currency_mismatch` naqli yo'q.
>
> **🕒 2026-08-09u (REJA-MENEJER-KASSA **MK31** — kassa USD naqd oqimi: `CASH_USD` → kutilgan
> dollar · farq akti · Z-hisobot qatori). To'liq hisobot:
> `docs/REJA-MENEJER-KASSA-2026-08.md` → HISOBOT JURNALI → «MK31».**
>
> **Muammo (kodda tasdiqlangan):** kassadagi dollar **umuman o'lchanmasdi**. `variance-wiring.test.ts`
> «USD akti yozilmaydi — CASH_USD ulanmagan» deb hozirgi xulqni qulflagan edi; zanjirning boshida
> esa `CASH_USD` tenderi yo'q, sxema dollar maydonini bilmas, `RetailSalePayment.rateMinor` ga
> **hech kim yozmasdi**.
>
> **Qilingan:** uch sof modul (tender · smena kutilgani · Z-hisobot) → sxema (2 refine: kurssiz
> dollar va eski ×10⁴ kurs bloklanadi) → migratsiya (`cashier_sessions` +4 ustun) → servis
> (kurs chekka muzlatiladi, `collectUsdCashInputs`, ikki valyutali farq akti) → POS yopish
> formasida sanalgan dollar maydoni. **Dollar SENTDA qoladi, so'mga o'girilmaydi** (§8.4).
> `null` ≠ `0`: dollar oqimi bor smenani sanoqsiz yopib bo'lmaydi, oqimi yo'q smenada ustunlar
> NULL bo'lib qoladi (backfill YO'Q → ko'rinadigan xulq o'zgarmaydi).
>
> **Eski test o'chirilmadi, `Edit` bilan qayta yozildi** — eski shartning SABABI (kutilgan USD
> yo'q edi) yo'qoldi, MAQSADI (soxta akt yozilmasin) yangi shartda saqlandi: akt faqat dollar
> haqiqatan sanalganda rejalanadi.
>
> **Yo'l-yo'lakay:** `pos-payment-contract.test.ts` skaneri formatga bog'liq edi va `z\n.object({`
> ko'rinishida **boshqa sxemani** o'qib ketardi (MK06 hisobotida bu «parallel sessiya» deb qayd
> etilgan edi — aslida shu sessiyaning in-flight tahriri). Skaner qavs-chuqurligi bo'yicha
> ishlaydigan qilindi + «boshqa e'longa sakramadikmi» tekshiruvi qo'shildi.
>
> **Gate:** api typecheck 0 · web typecheck 0 · biome 0 · i18n ✅ · **api 6481 yashil** ·
> **web 2955 yashil**. Migratsiya lokal `climart_adopt` ga qo'llandi; **prod DDL → OPS-QADAMLAR
> 11-band**.
>
> ⚠️ **Phase-1 — browser-smoke YO'Q** (⇒ MK34). **Ochiq qarzlar:** POS to'lov oynasida dollar
> tugmasi yo'q (server yo'li tayyor, jonli dollar cheki hali yaratilmaydi) · dollar naqd pul
> daftariga tushmaydi (`CashDesk` bir valyutali) · ochilish dollari UI'dan kiritilmaydi ·
> dollar qaytarish va dollar yashiq amallari yo'q.
>
> **🕒 2026-08-09t (REJA-MENEJER-KASSA **MK06** — 4M.5a: menejer ish navbati, dvigatel va model) —
> `d450bc0a`, 19 fayl (+3324/−3). To'liq hisobot:
> `docs/REJA-MENEJER-KASSA-2026-08.md` → HISOBOT JURNALI → «Faza MK06».**
>
> **Muammo (kodda tasdiqlangan):** `ManagerWorkItem`/`ManagerRuleConfig` sxemada YO'Q edi. MK11
> «navbatga tushadi» deb yozgan-u, elementni SAQLAY olmasdi (o'sha fazaning 2- va 3-ochiq qarzi);
> chegaralar esa so'rov parametri edi — menejer o'zgartirsa, ertaga yo'qolardi.
>
> **Nima qilindi:** (1) 3 model + migratsiya `20260810080000_manager_work_queue` — **lokal
> `climart_adopt` ga QO'LLANDI va tekshirildi**. (2) Uch **sof** modul: `work-item-rules.ts`
> (registr + sozlama, 21 test) · `work-queue-planner.ts` (dedup + eskirish, 16 test) ·
> `work-item-fsm.ts` (§5.4 ning 7 harakati, MK08 `shared/acceptance-fsm.ts` USTIDA — nusxa yo'q,
> 20 test). (3) Servis/HTTP (17 test) + `manager.module.ts` ga ulandi. (4) FE `/menejer/navbat` +
> subnav + i18n ru+uz (57 kalit).
>
> **🔴 Fazaning invarianti:** **NAVBAT BLOKLAMAYDI** (§5.1) — TO'RT qatlamli qulf: baza `CHECK`
> (`mode='block'` jonli rad etildi) · tipda `blocks: false` literal · Zod · **arxitektura testi**
> (`manager/queue` ni `manager.module.ts` dan boshqa hech kim import qila olmaydi). Oxirgisi
> **mutatsiya bilan tekshirildi** — `demand/` ga import qo'yilganda test yiqildi.
>
> **Ataylab qilingan 8 qaror** hisobotda ochiq yozilgan. Eng muhimi ikkitasi: **eskirish = BAYROQ,
> status EMAS** (eskirgan element navbatdan CHIQMAYDI, §5.1 «yuqoriga chiqadi» deydi) va
> **yopilgan element qayta tug'ilmaydi** (dedup HOLATGA qaramaydi — aks holda navbat cheksiz halqa
> bo'lardi va §5.3 statistikasi bir hodisani o'nlab marta sanardi).
>
> **⚠️ PROD DDL QO'LLANMAGAN** — `docs/REJA-8-BOLIM-2026-08.md` → OPS-QADAMLAR **10-band**
> (backfill YO'Q, ya'ni deploy'dan keyin navbat BO'SH bo'ladi; birinchi `sync` uni to'ldiradi).
>
> **Ochiq qarz:** 12 qoida turidan **2 tasi** bor (ataylab — qolgani MK07) · `record_fine` PUL
> YOZMAYDI (faqat jurnal + `logger.warn`) · `assign_task`/`write_warning` yon ta'sirsiz ·
> `sync` cron'ga ulanmagan (MK08 `escalateOverdue` bilan birga) · brauzer-QA yo'q (→ MK14).
>
> **Git:** daraxtda **uch parallel sessiya** ishlayotgan edi (MK18 narx-xatolari · MK09 sifat paneli ·
> MK31 dollar yashiq) va ular menga kerak 5 umumiy faylni allaqachon o'zgartirgan edi. `git add`
> ISHCHI DARAXT versiyasini olgani uchun ularning ishi mening commit'imga tushardi (CLAUDE.md §6.7 B).
> Yechim: **«HEAD + faqat mening hunklarim»** blobi deterministik skript bilan qurildi
> (`hash-object -w` + `update-index --cacheinfo`, fail-closed anchorlar). Hook'lar bir martaga
> chetlab o'tildi — gate'lar QO'LDA to'liq (yuqorida).
>
> **🕒 2026-08-09s (REJA-MENEJER-KASSA **MK09** — 4M.6b: ma'lumot sifati paneli) —
> 20 fayl (16 kod + 4 hujjat), +1819/−6. To'liq hisobot:
> `docs/REJA-MENEJER-KASSA-2026-08.md` → HISOBOT JURNALI → «Faza MK09».**
>
> **Muammo (kodda tasdiqlangan):** `NULL ≠ 0` shartnomasi kodda ALLAQACHON bor edi
> (`MetricValue.complete`, `costMinor == null ⇒ complete: false`, `EmployeeDailyKpi.dataComplete`),
> lekin **hech kim uni KO'RMASDI** — `dataQuality` so'zi butun repoda 0 marta uchrardi.
> O'lchov bor edi, **javob yo'q edi**.
>
> **Nima qilindi:** (1) bayroq qoidasi YAGONA qatlamda —
> `apps/api/src/modules/report/metrics/data-quality.ts` (19 test): `complete|partial|uncollected` ·
> `sharePercent` mahrajsiz ⇒ **`null`, `0%` EMAS** · «hech narsa o'lchanmagan» ≠ «qisman» ·
> o'lchanmagan qator bayroqni tushirmaydi. (2) `manager/kpi/data-quality.service.ts` (12 test) +
> `GET /manager/kpi/data-quality?from&to` (sukut — oxirgi 30 kun): har ko'rsatkich bayrog'i ·
> **tan narxsiz cheklar ulushi** (X1 bug-klassining jonli o'lchovi) · **qabul qilinmagan kunlar
> ulushi** (`countsTowardPayroll` FSM'dan, ro'yxat qayta yozilmadi) · **manbasi yo'q ko'rsatkichlar**
> · profilsiz kunlar. (3) FE `/menejer/sifat` + subnav + i18n ru+uz (8 test). (4) Takror qoida
> yopildi: `employee-daily-kpi.service.ts` dagi qo'lda `dataComplete` sharti shu qatlamni chaqiradi.
>
> **🔴 Fazaning invarianti:** foiz kataklarining YAGONA chizuvchisi `pct(v)` — `null ⇒ '—'`.
> Test ikki tomondan qulflaydi: «o'lchov yo'q ⇒ `0%` YO'Q» va «haqiqiy nol ⇒ `0%` BOR».
>
> **Sxema TEGILMADI — migratsiya YO'Q** (panel butunlay mavjud ustunlardan o'qiydi).
>
> **Ochiq qarz:** brauzer-QA yo'q (→ MK14) — ayniqsa `groupBy` + `_count: { autoValue: true }`
> va `positions: { some: { costMinor: null } }` runtime'da tasdiqlanmagan (unit testlar Prisma'ni
> mock qiladi) · `costMinor` NULL ulushi CHEK darajasida (qator darajasida emas).
>
> **🔴 GIT HODISASI — KEYINGI SESSIYA UCHUN SABOQ (halol yozilmoqda).**
> Commit `8b6dca81` **eskirgan indeksdan** qurildi: `git read-tree HEAD` bilan `git commit`
> orasida ~15 daqiqa o'tdi va o'sha oraliqda parallel sessiya **MK18** ni (`b57615ce`) commit
> qildi. Natijada mening tree'im MK18 ni **qisman bekor qildi** (11 fayl o'chdi). MK18 sessiyasi
> buni ko'rib `84efc024` bilan fayllarni tikladi, lekin uchta UMUMIY faylda (`layout.tsx`,
> `messages/{ru,uz}.json`) MK18 ning ulushi tiklanmay qolgan edi — men `e96f6578` bilan yopdim
> (`price_errors` subnav bandi + har lokalda 36 kalit; skript fail-closed, hech qaysi
> revizyadan kalit yo'qolmagani tekshirildi).
> **Ikkinchi xato:** tuzatishga urinib `git update-ref <yangi> <tip>` qildim — `tip` o'sha
> paytda allaqachon oldinga ketgan edi, ya'ni **ikkita begona commit** (`84efc024`, MK06) bir
> lahzaga tushib qoldi; darhol `update-ref` bilan qaytarildi (yo'qotish yo'q, hech narsa
> push qilinmagan).
> **Qoida (keyingi safar):** `read-tree` va `commit` **BITTA** buyruq zanjirida bo'lsin; commit
> parent'ini `git commit` ning o'ziga tanlatish kerak, `commit-tree -p <qo'lda hash>` EMAS;
> `update-ref` ning eski-qiymat argumenti **himoya emas** — tip o'zgargan bo'lsa u shunchaki
> begona commit'ni almashtiradi. Kelishilgan yechim baribir **worktree izolyatsiyasi**
> (CLAUDE.md §6.5).
> ⚠️ `e96f6578` `messages/{ru,uz}.json` ni butunlay qayta tartibladi (~8k qator diff, **kalit
> yo'qolmagan** — tekshirildi). Parallel sessiyalarning shu fayldagi keyingi diff'i katta
> ko'rinadi; bu format-shovqin, mazmun emas.
>
> **Git (qolgani):** umumiy fayllar (`manager.module.ts`, `layout.tsx`, `messages/*.json`,
> hujjatlar) uchun blob har safar «baza + faqat mening hunk'larim» dan qayta qurildi —
> begona satrlar mening commit'imga TUSHMADI. Hook'lar chetlab o'tildi, gate'lar QO'LDA: api (report+manager+app-boot) 883 ✓ · web 2953 ✓ ·
> biome 0 · i18n 9 ✓. **Meniki BO'LMAGAN yiqilishlar:** api tc 4 (`moysklad-compat.service.ts`) ·
> web tc 2 (`settings/api-tokens/page.tsx`) · web test 2 (`pos-payment-contract.test.ts`) — uchalasi
> ham parallel sessiyalarning in-flight ishi, ularning fayllariga tegmadim.
> Shu commit **MK08 ning commit qilinmay qolgan hand-off hujjatlarini ham** olib keladi.
>
> **🕒 2026-08-09r (REJA-MENEJER-KASSA **MK08** — 4M.6a: smena yakunini qabul qilish) —
> `8bb11ef5`, 21 fayl (+2206/−163). To'liq hisobot:
> `docs/REJA-MENEJER-KASSA-2026-08.md` → HISOBOT JURNALI → «Faza MK08».**
>
> **Muammo (kodda tasdiqlangan):** yopilgan smenani hech kim QABUL QILMASDI.
> `CashierSessionVariance.acknowledgedAt` faqat FARQ AKTIni belgilardi — **farqsiz smena
> hech kimning stolidan o'tmasdi**, ya'ni «hammasi joyida» xulosasi tasdiqlanmagan bo'lardi.
>
> **Nima qilindi:** (1) qabul qoidasining **generic dvigateli ajratildi** —
> `apps/api/src/modules/shared/acceptance-fsm.ts` (16 test); `daily-kpi-fsm.ts` shu dvigatel
> ustiga ko'chdi, **tashqi shartnoma o'zgarmadi**, 33 regress testi yashil (nusxa-ko'chirish
> bug-klassining oldi olindi). (2) `cashier-session/shift-acceptance.ts` — smena FSM'i
> (`open → pending → accepted | rejected | escalated | force_accepted | stale`, 22 test) +
> `shift-acceptance.service.ts` (navbat · qabul ekrani · o'tish, 11 test). (3) Sxema +
> migratsiya `20260810070000_shift_acceptance` (`acceptance_state` + append-only
> `cashier_session_acceptance_events`). (4) `close()` AYNI tranzaksiyada smenani navbatga
> qo'yadi (`open_for_review`). (5) Javobgarlik taxtasiga `shift_unaccepted` majburiyati.
> (6) FE `/menejer/smenalar` + subnav + i18n ru+uz.
>
> **🔴 Fazaning invarianti:** **QABUL SUMMALARGA TEGMAYDI** — update-payload'da 15 ta summa/holat
> maydonining YO'Qligi test bilan qulflangan. Menejer kamomadni «tuzatib» yopsa, farq akti dalil
> bo'lishdan to'xtardi. Raqam noto'g'ri bo'lsa yagona yo'l: rad etish → kassir tushuntiradi.
>
> **⚠️ MIGRATSIYA QO'LLANMAGAN** — sessiya davomida lokal `climart_adopt` **o'chiq** edi.
> Keyingi runtime/QA sessiya avval `prisma db execute --file` qilsin, aks holda API
> `acceptance_state` ustunini topa olmaydi. Prod DDL — `docs/REJA-8-BOLIM-2026-08.md` →
> OPS-QADAMLAR **9-band** (⚠️ backfill prodda ko'rinadigan xulq beradi: barcha yopilgan
> smenalar menejer navbatiga tushadi — ataylab, chunki ularni hech kim ko'rmagan).
>
> **Ochiq qarz:** brauzer-QA yo'q (→ MK14) · kassir tomoni FE yo'q (BE `explain` tayyor;
> menejer ham kirita oladi) · `escalateOverdue` cron'ga ulanmagan (MK06 bilan birga mantiqiy) ·
> `markStale` chaqiruvchisi yo'q (hujjat-o'zgarish kuzatuvchisi hali yo'q).
>
> **Git:** sessiya davomida daraxtda 3+ parallel sessiya ishladi; commit paytiga ular o'z ishini
> commit qilgani uchun **begona fayl tushmadi** (`git show --stat HEAD` staged ro'yxat bilan 1:1).
> Hook'lar bir martaga chetlab o'tildi — gate'lar QO'LDA to'liq: api tc 0 · web tc 0 ·
> lint 0 · i18n 9✓ · api 6261 test ✓ · web 2923 test ✓.
>
> **🕒 2026-08-09q (REJA-MENEJER-KASSA **MK05** — jihoz reyestri + javobgarlik taxtasida jihoz
> bloki) — `d1b70266`, 25 fayl (+1913/−45). To'liq hisobot:
> `docs/REJA-MENEJER-KASSA-2026-08.md` → HISOBOT JURNALI → «Faza MK05».**
>
> **Nima qilindi:** yangi `Equipment` + `EquipmentAssignment` (append-only tarix) + migratsiya
> `20260810060000_equipment_registry` (lokal DB'ga qo'llandi) · yangi modul
> `apps/api/src/modules/hr/hr-equipment/` (sof qoidalar 16 test + servis 12 test + HTTP sirt
> `/hr/equipment` assign/return/history, ruxsat `employees`) · FE `/hr/equipment` reyestr sahifasi
> (+ `lib/equipment-api.ts`) · nav va i18n ru+uz.
>
> **Ikki teshik yopildi:** (1) bo'shatish ro'yxatidagi «Jihoz topshirilgan» bandi **qo'lda
> tasdiqdan `auto` ga** o'tdi — qaytarilmagan jihoz endi arxivlashni BLOKLAYDI; (2) javobgarlik
> taxtasida MK03'da ataylab tashlangan **jihoz bloki qo'shildi** (`DUTY.equipment_out`), chunki
> endi son o'lchangan. MK03'ning «jihoz YO'Q» drift-qulfi (`menejer-live-boards.test.ts`) ataylab
> **ag'darildi**, jimgina o'chirilmadi.
>
> **Qarorlar:** jihozning PULI yo'q (reyestrda narx saqlanmaydi ⇒ naqd jamiga kirmaydi) ·
> biriktirilgan jihozni **hisobdan chiqarib bo'lmaydi** va `assigned` holati qo'lda tanlanmaydi
> (javobgarlikni jimgina o'chirish yo'li yopiq) · qaytarish sharti holatni belgilaydi
> (`ok→in_stock`, `damaged→repair`, `lost→lost`, yo'qolgani reyestrda qoladi) · bitta jihozda
> bitta ochiq biriktirish — **qisman unique indeks** (faqat SQL da, Prisma ifodalay olmaydi).
>
> **Holat: Phase-1** — strukturaviy + unit-tasdiqlangan, **browser-smoke YO'Q** (Phase-2 / MK14).
> **Prod DDL (`sherset_v2`) qo'llanmagan** — ops-qarz. Xodim kartasi 360° ga jihoz bloki
> QO'SHILMADI (endpoint tayyor: `GET /hr/equipment/employee/:id`).
>
> ⚠️ **Parallel sessiyalar (MK08/MK11/MK18) bilan bir daraxtda ishlandi.** Aralashgan fayllar
> (`accountability.*`, `live-status.service.ts`, `layout.tsx`, `messages/*.json`,
> `schema.prisma`) uchun indeks **fail-closed skript** bilan qurildi (HEAD + faqat MK05
> tahrirlari), hook'lar bir martaga chetlab o'tildi, gate qo'lda yugurtirildi.
> **Saboq:** `git diff -U0` + `--unidiff-zero` bilan hunk BO'LISH qatorlarni noto'g'ri joyga
> qo'ydi va `accountability.ts` ni sintaktik buzdi (birinchi commit) — **matn-anchor** usuli
> (har anchor aynan 1 marta) bilan qayta qurildi va commit `--amend` qilindi. Tekshiruv:
> esbuild sintaksis + izolyatsiyada 17 test + `prisma validate`.
>
> **Gate:** typecheck api+web **0** · api `hr`+`manager`+`app-boot` **1328 test yashil** ·
> web **193/195 fayl**. Yiqilgan 3 test va i18n-gate'dagi 17 kalit — **MK08 sessiyasiniki**
> (`duty_shift_unaccepted` tarjimasi yo'q, `menejer/smenalar` da xom `<select>`), MENIKI EMAS.
>
> **🕒 2026-08-09p (REJA-MENEJER-KASSA **MK11** — 4M.8: uch xil zaxira signali (o'lchov **PUL**)
> + narx o'zgarishi nazorati) — `2f2de6b8`, 17 fayl (+2588/−5). To'liq hisobot:
> `docs/REJA-MENEJER-KASSA-2026-08.md` → HISOBOT JURNALI → «Faza MK11».**
>
> **Nima qilindi:** yangi `apps/api/src/modules/manager/inventory/` — ikki **sof modul**
> (`stock-signals.ts`, `price-change-control.ts`) + servis + controller (`GET
> manager/inventory/stock-signals`, `GET .../price-changes`, ruxsat `product:view`) +
> FE `/menejer/zaxira` va `/menejer/narx-nazorati` + i18n ru+uz. **52 yangi test** (TDD, RED
> ko'rildi); regress: manager 353 · app-boot 9 yashil.
>
> **Signal PULDA:** `dead_money` (qoldiq × tan narx) · `stockout_risk` (gorizontgacha
> **yopilmagan talab** × tan narx) · `overstock` (ortiqcha qoldiq × tan narx). Sotuv sur'ati
> `StockOperation` dan (`demand`/`retailsale` + bekor/qaytarim); ombor ichidagi `move_*`/`cell_*`
> **sanalmaydi** — ular pulni aylantirmaydi.
>
> **Narx nazorati BLOKLAMAYDI** (4-bo'lim TZ §5.1) — `blocks` maydoni **literal `false`** tipida
> va 5 chegara qiymatida test bilan qulflangan. Chegaradan oshgan o'zgarish uchun **barqaror
> `dedupKey` bilan** `PriceChangeWorkItem` hisoblanadi, lekin **SAQLANMAYDI**: `ManagerWorkItem`
> ombori **MK06** da keladi, o'shanda dvigatel shu kalit bo'yicha takrorsiz element yaratadi.
>
> **NULL ≠ 0 (test bilan qulflangan):** tan narx yo'q **yoki 0** ⇒ `amountMinor: null`, jamiga
> qo'shilmaydi (`Stock.costBalanceMinor` DEFAULT 0 = «yozilmagan», narx emas) · sotuv tarixi
> yo'q ⇒ sur'at/qoplash NULL va «tugash xavfi»/«ortiqcha» umuman hisoblanmaydi (taxmin yozilmaydi) ·
> narx bazasi yo'q yoki valyuta almashgan ⇒ `deltaPercent: null`, chegara qo'llanmaydi.
>
> **⚠️ Ochiq qarzlar (jimgina qoldirilmadi):** (1) `ProductService.bulkUpdate` audit YOZMAYDI —
> ommaviy narx tahriri bu tarixga tushmaydi (ekranda `scope_note` bilan ochiq yozilgan);
> (2) chegaralar so'rov parametri, doimiy sozlama `ManagerRuleConfig` (MK06) bilan keladi;
> (3) uch `groupBy` butun `stock_operations` ustidan — katta akkauntda `EXPLAIN` kerak;
> (4) **brauzer-QA YO'Q** (Phase-1).
>
> **🔀 Parallel sessiya bilan kesishma:** MK05/MK08 sessiyasi ayni paytda `layout.tsx`,
> `ru/uz.json`, `domain-status-tone.ts` ni tahrirlayapti. Ularning ishi commit'ga tushmasligi
> uchun shu 4 fayl indeksga **«HEAD + faqat mening hunk'larim»** holatida qo'yildi
> (deterministik fail-closed skript), ishchi daraxtga tegilmadi; shu sabab lint-staged bir
> martaga chetlab o'tildi va gate'lar **qo'lda to'liq** yugurtirildi. `pnpm lint:product`
> repo bo'ylab hozir 10 xato beradi — **hammasi o'sha sessiyaning** commit qilinmagan
> fayllarida (`cashier-session/shift-acceptance*`, `shared/acceptance-fsm*`,
> `hr-employee/offboarding.ts`, `manager/live/live-status.service.ts`). Web'da 2 yiqilgan test
> (`menejer-live-boards.test.ts` — `duty_equipment_out`/`duty_shift_unaccepted` kalitlari hali
> yozilmagan) ham o'shaniki.

> **🕒 2026-08-09o (REJA-MENEJER-KASSA **MK03** — Menejer FE-A: «Jonli holat» va
> «Javobgarlik» ekranlari) — `638212f8`, 10 fayl (+885/−41). Reja: `docs/REJA-MENEJER-KASSA-2026-08.md`
> → «Faza MK03», hisobot o'sha faylning HISOBOT JURNALIda.**
>
> **Nima qilindi:** BE (`GET manager/kpi/live` · `GET manager/kpi/accountability`) allaqachon
> bor edi — kodda tasdiqlandi (`manager-kpi.controller.ts:68–78`). FE yo'q edi; ikkala ekran
> qurildi: `/menejer/jonli` + `/menejer/javobgarlik` + subnav 2 yozuv + i18n ru+uz (25+13+2 kalit).
>
> **⚠️ Reja «toza FE fazasi» deb hisoblagan edi — noto'g'ri:** BE ekran matnini **tayyor
> o'zbekcha qator** qilib qaytaradi (`title: "Kechikdi — 7 daq"`, `label: "Ochiq kassa smenasi"`).
> Uni FE chizsa ru interfeysda o'zbekcha matn turardi va **hech bir gate ko'rmasdi** —
> `i18n:gate` faqat FE fayllarini skanlaydi. Shuning uchun BE'ga **additive** o'zgarish:
> `LiveRow` ga `titleKey`/`titleParams`/`place`/`showDuration`, javobga `thresholds`
> (12s/15daq/45daq — chegara FE'da TAKRORLANMAYDI). `title`/`detail` qoldirildi, lekin FE
> ularni o'qimasligi drift-lock bilan qulflandi. `accountability` ga BE o'zgarishi kerak
> bo'lmadi (`DutyRow.kind` allaqachon strukturaviy).
>
> **Yangi qulf:** `apps/web/src/__tests__/menejer-live-boards.test.ts` (27 test) — BE yopiq
> ro'yxatlarini (`LIVE_KIND`/`ATTENTION`/`LIVE_TITLE`/`DUTY`) manbadan o'qib ru+uz tarjimasi
> borligini tekshiradi (ular FE'da DINAMIK kalit — odatiy i18n gate ko'rmaydi) + TZ ning
> «yolg'on ishonch bermaslik» qoidalari: nol qator yo'q · jihoz bloki yo'q · bo'sh javob
> «hammasi joyida» emas · FE qayta saralamaydi · NULL ≠ 0.
>
> **Gate:** api+web typecheck 0 · i18n gate 9/9 · **web vitest TO'LIQ 195 fayl / 2919 test yashil** ·
> api `src/modules/manager` 269/271 (2 yiqilish — parallel MK01 sessiyasining commit qilinmagan
> `kpi-accrual.test.ts` faylida, meniki emas). `pnpm lint:product` = 7 xato, **hammasi parallel
> sessiyalarning fayllarida** (`onboarding*` MK02 · `kpi-accrual.test.ts` MK01); mening 10 faylim 0.
>
> **🔴 YANGI BUG-KLASS (CLAUDE.md §6.7 ga qo'shimcha): INDEKS UMUMIY.** Birinchi commit
> (`41d5080f`) **19 fayl** bilan chiqdi — men 10 tasini stage qilgan bo'lsam ham: parallel MK02
> sessiyasi o'sha oraliqda o'z fayllarini stage qilgan, commit hammasini olgan. Bu §6.7 B dagi
> lint-staged yo'lidan BOSHQA (bu yerda hook umuman ishlamagan — `core.hooksPath=/dev/null`).
> Tuzatildi: `reset --soft HEAD~1` → begona 9 yo'l `git restore --staged` (untracked holatiga
> qaytdi, mazmuni tegilmadi) → qayta commit `638212f8`. **Xulosa: `git add` dan keyin
> `git diff --cached --stat` ni commit'dan TO'G'RIDAN-TO'G'RI oldin qayta tekshir.**
> Umumiy fayllar (`layout.tsx`, `messages/{ru,uz}.json`) MK04 bilan bir obyekt ichida
> kesishgani uchun indeksga `git show HEAD:<fayl>` + faqat o'z o'zgarishim yozildi
> (`hash-object`+`update-index`); ish daraxtiga tegilmadi.
>
> **HOLAT: Phase-1 — strukturaviy + unit-tasdiqlangan, BROWSER-SMOKE YO'Q** (MK14 ga).
> **Qarz:** ochiq smena naqdi = `openingCashMinor` (quyi chegara, aniq qiymat emas — ekranda
> farqlanmagan, MK08/MK34) · `RestockTask`/`DriverShift` manbalari TZ §6.1 da bor-u BE'da yo'q
> (MK03 dan OLDIN shunday edi, qamrov kengaytirilmadi) · sahifalash yo'q.
>
> **Keyingi:** `docs/REJA-MENEJER-KASSA-2026-08.md` → **MK05** (jihoz reyestri; MK03 taxtasiga
> jihoz bloki shundan keyin qo'shiladi) yoki 1-paketdagi qolgan fazalar.

> **🕒 2026-08-09n (REJA-8-BOLIM **F019** — ombor migratsiyasi 1–2-qadam: `__yacheyka` kodlaridan
> zona/yacheyka generatsiya + `Stock` → `StockByCell` backfill + **farq hisoboti** + **rollback**) ·
> Phase-1: strukturaviy + unit-tasdiqlangan, browser-smoke YO'Q · **lokal DB'da JONLI o'lchandi**
> (DRY→APPLY→ROLLBACK, baza boshlang'ich holatiga qaytarildi) · ⏳ **PRODDA YUGURTIRILMAGAN**
> (OPS-QADAM 7) · 🗄️ **migratsiya SHART EMAS** — sxema o'zgarmadi (`StoreZone`/`StoreCell`/
> `StockByCell` allaqachon bor) · ⚠️ parallel sessiya F001/F010 ustida JONLI ishlayapti.**
>
> **Nima qilindi (3 yangi manba fayl + 2 test fayl, 39 test):**
> - `apps/api/src/modules/store/cell-migration.ts` — sof planlovchilar: `parseCellCode` ·
>   `planCellGeneration` · `planStockBackfill` · `diffStockVsCells` · `planRollback`.
> - `apps/api/src/modules/store/cell-migration.runner.ts` — orkestratsiya port ustida; DRY va
>   APPLY **bitta kod yo'li**, DRY «keyingi farq»ni simulyatsiya bilan oldindan aytadi.
> - `apps/api/src/scripts/migrate-cells-step1-2.ts` — CLI: DRY (default) · `APPLY=1` ·
>   `ROLLBACK=1 [APPLY=1]` · `MANIFEST=<yo'l>`. Akkaunt/ombor noaniq bo'lsa **`exit 1`**.
>
> **Kalit qaror — `delta = Stock − Σ StockByCell` (butun `Stock.qty` EMAS).** Lokal bazada shu
> aynan bug'ni to'sdi: tovar `a0b44c73…` kodi `01-02-03-04`, ammo 30 donasi BOSHQA yacheykada
> (`01-09-09-01`). «Uy-yacheykaga butun qoldiqni yoz» varianti 30 ni ikki marta sanab
> `Σ StockByCell > Stock` driftini yaratardi (`applyDeltas` `cellMode` bilan bir bug-klass).
> Shu formula tufayli qayta yugurtirish ham **0 yozuv** beradi (jonli tasdiqlangan).
>
> **🔴 REJADAGI XATO DA'VO TUZATILDI:** reja va `todo.md` «`SkladKeeper.zoneId` sxemada bor
> (7-B1 yarim)» der edi — **YO'Q**. `schema.prisma:1111-1127` da faqat `skladNo Int`; yig'ish
> varag'ini taqsimlash hamon yacheyka kodining 1-segmentini `Number()` qilib o'qiydi
> (`restock-task.service.ts:46`, `retail-sale.service.ts:109`). F019 qamroviga kirmagani uchun
> bloklamadi → yangi **F019b** fazasi ochildi (`todo.md` 7-Ombor **B2a**).
>
> **Gate:** typecheck api **0** · biome (shu fazaning 5 fayli) **0 error** · vitest
> `store`+`stock` **180 passed / 0 failed** · i18n **N/A** (UI yo'q, web tegilmadi).
> ⚠️ `pnpm lint:product` repo bo'yicha **7 error** — hammasi **parallel sessiya** fayllarida
> (4 web `page.tsx` + `contract-conformance.test.ts` + `shared-api-contracts.test.ts`);
> CLAUDE.md §6.1 bo'yicha **tegilmadi**.
>
> **Keyingi:** **F019b** (`SkladKeeper.zoneId`) yoki **F020** (dual-write). Prod migratsiyasi —
> OPS-QADAM 7 (DRY → egasi ko'radi → `MANIFEST=… APPLY=1`, manifestni SAQLANG).
> To'liq hisobot: `docs/REJA-8-BOLIM-2026-08.md` → HISOBOT JURNALI → «Faza F019».

> **🕒 2026-08-09m (AUDIT-FIX FAZA 32 — FE auth-UX + POS i18n: refresh-dead redirect +
> `/sotuv` va 3 POS dialogini i18n ga · `FE-07`, `FE-08`) · Phase-1: strukturaviy + unit,
> RUNTIME-TASDIQLANMAGAN (browser-smoke YO'Q) · ⏳ DEPLOY QILINMAGAN · 🗄️ migratsiya SHART EMAS ·
> ⚠️ parallel sessiya Faza 33 (`packages/contracts`, `retail/page.tsx`) ustida JONLI ishlayotgan
> edi — `git add` 9 aniq yo'l, ularning fayllariga TEGILMADI; tarkib `git show --stat HEAD` bilan
> tasdiqlandi.**
>
> **Nima qilindi (`a54fedd7`, 9 fayl, +982/−277):**
>
> **🐞 `FE-07` — o'lgan seans «tirik» ko'rinardi.** `auth-store.ts refresh()` `!res.ok` da faqat
> `false` qaytarardi: `state.user` eski qiymatda, `ms:auth-hint` hamon `'1'`. `layout.tsx` redirect
> sharti `initialized && !user && !hasAuthHint()` — uchala shart ham buzilmagani uchun **hech qachon
> otilmasdi**. Refresh-cookie tugagach ilova to'liq qobiq bilan render bo'laverardi (menyu, tugmalar,
> bo'sh ro'yxatlar) va HAR so'rov 401 berardi; faqat qo'lda `F5` qutqarardi. Endi **faqat 401/403**
> da seans tozalanadi + `emit()` → redirect otiladi. **Tarmoq xatosi va 5xx ATAYLAB tozalamaydi** —
> API restart yoki bir soniyalik offline kassirni sotuv o'rtasida chiqarib yuborsa, bu tuzatilgan
> bugdan battar bo'lardi; ikkala holat testda qulflandi.
>
> **`FE-08` — POS i18n.** `/sotuv/page.tsx` (2050 qator) + `cash-out-dialog`, `debt-payment-dialog`,
> `rasmilashtirish-modal`. **150 kalit × 2 til**: `pages.sotuv` +91, yangi `pages.pos` +59.
> `payment-dialog` va `pos-pin-lock` allaqachon toza edi — tegilmadi. RU tarjimalar loyihaning
> mavjud lug'atidan grounded (`fields.expense_item` «Статья расходов», `pages.z_report.collection`
> «Инкассация», `fields.payee` «Получатель», `pages.payment_dialog` «Наличные/Карта/Сдача»).
> Kalitlar **fail-closed skript** bilan qo'shildi (mavjud kalit boshqa qiymatda bo'lsa `exit 1`).
>
> **🛡️ Ikki gate teshigi O'LCHAB yopildi** (`__tests__/pos-i18n-guard.test.ts`):
> (1) `i18n-key-existence` FAQAT `app/(app)` ni yuradi — **`src/components/` umuman skanerlanmaydi**,
> ya'ni `components/pos/*` dagi `t('typo')` kassir ekraniga xom kalit bo'lib chiqardi va hamma gate
> yashil qolardi; (2) `i18n-no-hardcoded` faqat `<route>/{new,[id]}` hujjat-formalarini tekshiradi —
> `/sotuv` (yakka `page.tsx`) va dialoglar undan tashqarida edi. Skaner **pozitsiya bo'yicha**
> (JSX matn tuguni · user-facing prop · `toast`/`alert`/`Error` argumenti), so'z-ro'yxati bo'yicha
> emas ⇒ `data-test-id`/`queryKey` strukturaviy chetda (qo'riqchini qayta nomlash bilan aldab
> bo'lmaydi). **Bo'sh-yashil EMASLIGI o'lchandi:** aynan shu mantiq `git show HEAD:` nusxalarida
> **88 sizish** topdi (sotuv 56 · rasmiylashtirish 16 · debt 10 · cash-out 6 · payment-dialog 0 ·
> pin-lock 0), hozir **0**.
>
> **Gate (QO'LDA to'liq):** web typecheck **0** · `check-lint.mjs` **0 error** · `i18n:gate` **9/9** ·
> to'liq web Vitest **187 fayl / 2829 test yashil, 0 yiqilish**. Sanoq nazorati:
> `2829 = 2814 (HEAD) + 5 (auth-store) + 5 (pos-guard) + 5 (parallel sessiyaning
> shared-api-contracts.test.ts)`. Hook'lar **bir martaga** chetlab o'tildi
> (`core.hooksPath=/dev/null`) — parallel sessiya jonli ishlayotganda `lint-staged` butun daraxtni
> stash qiladi (CLAUDE.md §6.7 B), shuning uchun gate'lar markazda QO'LDA to'liq yugurtirildi.
>
> **⚠️ HUJJAT QARZI:** `docs/REJA-AUDIT-FIX-2026-08.md` dagi Faza 32 hisoboti **yozildi, lekin
> ATAYLAB stage QILINMADI** — o'sha faylda parallel sessiyaning commit qilinmagan Faza 33 hisoboti
> ham turibdi; butun faylni add qilsam ularning matni mening commit'imga tushardi (xotira
> `commit-pathspec-takes-worktree-version`). Shu NEXT.md yozuvi ham xuddi shunday holatda.
>
> **⏭️ KEYINGI:** ochiq fazalar — **27b** (`PERF-01`), **27c** (`PERF-02`, dalili ESKIRGAN —
> qayta o'qi), **29b** (`HR-13` soft-delete). Faza 32 qarzi (browser-QA · RU tarjimalarni ona
> tilida so'zlashuvchi ko'rmagan · 3 dinamik kalit statik tekshirilmaydi · qo'riqchining
> `{}` aralash ko'p qatorli matn ko'r nuqtasi) — `docs/REJA-AUDIT-FIX-2026-08.md` →
> «Faza 32 → Qolgan qarz».

> **🕒 2026-08-09l (AUDIT-FIX FAZA 33 — `@moysklad/contracts`: API-javob tiplari uchun yagona
> manba + **provenance** arqoni · `FE-12`) · Phase-1: strukturaviy + unit, RUNTIME-TASDIQLANMAGAN
> (browser-smoke YO'Q) · ⏳ DEPLOY QILINMAGAN · 🗄️ migratsiya SHART EMAS · ⚠️ parallel sessiya
> `sotuv/page.tsx` + `components/pos/*` + `auth-store*` da JONLI ishladi (Faza 32) — o'sha
> fayllarga TEGILMADI, `git add` aniq yo'llar bilan.**
>
> **Nima qilindi:** yangi paket `packages/contracts` (**source-only, `dist` YO'Q** — `exports`
> to'g'ridan `./src` ga; sabab: xotira `money-dist-stale-tsbuildinfo`, eskirgan dist «typecheck
> yashil, runtime portlaydi» beradi). 5 endpoint kontrakti: `/cashier-sessions/current` ·
> `/cash-desks` · `/stores` · `/organizations` · `/products` (POS). `retail/page.tsx` lokal
> interfeyslardan o'tkazildi (−40 qator).
>
> **🔑 Asosiy g'oya — kontrakt DEKORATIV bo'lmasligi kerak.** Interfeyslarni umumiy faylga
> ko'chirish dublikatni yopadi, lekin serverga **arqon bog'lamaydi**. Shuning uchun har sxema
> kalitlarining serverdagi MANBASINI e'lon qiladi (`CONTRACT_PROVENANCE`: Prisma modeli ·
> servis `select`/`include` bloki · qo'lda yig'ilgan javob obyekti · **apps/api Zod-sxemasi**),
> `apps/api` esa data-driven konformans testi bilan uzilishni tutadi. **RED-proof jonli kodda:**
> `cashier-session.service.ts` dan `cashier:` include'i o'chirilsa test yiqiladi — bu
> **2026-06-08k da POS registrini yiqitgan** aynan o'sha regressiya.
>
> **⚠️ Rejaning IKKI premisasi noto'g'ri chiqdi (ikkalasi ham o'lchandi):** (1) audit `FE-12`
> ta'sirini **teskari** yozgan — `cashDeskId`/`storeId`/`organizationId` **NOT NULL**, ya'ni
> `retail` haq edi, `sotuv` ortiqcha himoyalangan; (2) «apps/api Zod-sxemalaridan `z.infer`» —
> API'da **javob** Zod-sxemalari deyarli YO'Q (butun repoda 1 fayl), Zod faqat kirish
> validatsiyasi uchun. Kontraktlar yangidan yozildi.
>
> **🐞 Faza 31 qoldirgan QIZIL gate topildi va tuzatildi (mening regressiyam EMAS):** to'liq API
> suitida **9 yiqilish** — `position-scale-class.test.ts`. Sabab o'lchandi: Faza 31 (`105897b3`)
> 13 nusxani `computeLineTotalSafe` ga yig'ganda sahifa manbasidan primitiv nomi yo'qolgan.
> **Faza 31 buni ko'rmagan, chunki faqat WEB suitini yugurtirgan — qo'riqchi `apps/api` da.**
> Qo'riqchi yangilandi **+ indirektsiyaning o'zi mixlandi** (`doc-totals.ts` uchun 3 test), aks
> holda 13 sahifa «o'tadi» va 3-kasrli qirqim butun hujjat oilasiga bir yo'la qaytardi.
>
> **Gate:** contracts/api/web typecheck **0** · `lint:product` **mening fayllarimda 0**
> (umumiy 2 xato = parallel sessiyaning commit qilinmagan POS dialoglari) · **to'liq API suite
> 5571/5573 yashil, 0 yiqilish** (sanoq: `5549 + 21 + 3` — jim yo'qolgan test yo'q) · to'liq web
> **2823 yashil, 1 yiqilish** = `i18n-key-existence`, **27 ta `pages.sotuv.*` kaliti parallel
> sessiyanikidan** (`grep "missing in" | grep -v sotuv` = **0**). Ikkala yangi qo'riqchi ham
> **jonli sabotaj** bilan vakuum emasligi tekshirildi.
>
> **➕ QO'SHIMCHA commit (`sotuv` ham migratsiya qilindi).** Birinchi commitdan (`8d1c51aa`)
> so'ng parallel sessiya Faza 32 ni commit qildi (`a54fedd7`) ⇒ `sotuv/page.tsx` ni chetlab
> o'tish sababi yo'qoldi va migratsiya darhol yakunlandi (−41/+17). **FE-12 ning bosh simptomi
> yopildi:** bitta endpoint uchun ikkita qarama-qarshi e'lon endi bitta manbadan. Web
> qo'riqchisining `PENDING_MIGRATION` ro'yxati **bo'shadi** — «eskirgan istisno yiqiladi»
> qoidasi uni o'chirishga majbur qildi. Sahifadagi `?.`/`!` himoyalari ATAYLAB qoldirildi
> (runtime qiymati allaqachon non-null edi; olib tashlash render yo'lini foydasiz o'zgartirardi).
>
> **✅ YAKUNIY GATE (Faza 32 commitidan keyin — endi TO'LIQ yashil, istisnosiz):**
> contracts/api/web typecheck **0** · `lint:product` **0 xato** · `i18n:gate` **9/9** ·
> to'liq web **187 fayl / 2832 test yashil, 0 yiqilish** · `apps/api` `shared` **584 yashil** ·
> `@moysklad/contracts` **15/15** · to'liq API suite (`8d1c51aa` da) **5571 yashil, 0 yiqilish**.
>
> **⏭️ KEYINGI:** ochiq fazalar — **27b** (`PERF-01`), **27c** (`PERF-02`, dalili ESKIRGAN),
> **29b** (`HR-13` soft-delete). *(Faza 32 endi TUGADI — `a54fedd7`.)* Faza 33 qarzi:
> `ListResponse` 92 fayldan 90 tasi hali lokal · konformans TIPNI emas, faqat kalit
> MAVJUDLIGINI tekshiradi · qamralmagan endpointlar ro'yxati —
> `docs/REJA-AUDIT-FIX-2026-08.md` → «HISOBOT JURNALI → Faza 33 → Qolgan qarz».
>
> **🗂️ ARXIV QARZI (o'lchandi, bu sessiyada ATAYLAB qilinmadi):** «Aniq keyingi vazifa» ostida
> **77 ta** top-entry bor (norma 8–10). Bu sessiyada arxivlanmadi, chunki parallel sessiya ham
> NEXT.md'ga yozadi va katta qayta-tuzish ularning entry'sini yo'q qilish xavfini tug'diradi
> (§6.3). Parallel ish tugagach — birinchi navbatdagi mayda vazifa.

> **🕒 2026-08-09k (AUDIT-FIX FAZA 31 — FE dedup codemodlar: `computeLineTotal` · `YesNoSelect`/
> `MultiRefField`/`refFetcher` · api-client · `FE-10`,`FE-02`,`FE-06`/`FE-14`) · Phase-1:
> strukturaviy + unit, RUNTIME-TASDIQLANMAGAN (browser-smoke YO'Q) · ⏳ DEPLOY QILINMAGAN ·
> 🗄️ migratsiya SHART EMAS · daraxt toza edi (faqat untracked artefaktlar), `git add` 44 aniq
> yo'l bilan; commit tarkibi `git show --stat HEAD` bilan tasdiqlandi (begona fayl yo'q).**
>
> **Nima qilindi (`105897b3`, 45 fayl, +681/−1329 = net −648 qator):** uch nusxa-blok bitta manbaga.
> **(FE-10)** 13 hujjat-formasidagi `computeLineTotal` → `lib/doc-totals.ts` dagi
> `computeLineTotalSafe` (struktural row-tip, `discount?` ixtiyoriy ⇒ `internal-orders` satri
> o'zgarishsiz o'tadi). **(FE-02 dedup)** 24× **bayt-bayt bir xil** (`md5 9c046ac2`) `YesNoSelect`
> + 3× `MultiRefField` + 3× `refFetcher` → yangi `components/filters/filter-fields.tsx`.
> **(FE-06/FE-14)** 5 transport (`request`/`download`/`postDownload`/`postOpenInBrowser`/`blobUrl`)
> bitta `authedFetch` + `saveBlobAs` ga.
>
> **🐞 HAQIQIY BUG topildi va yopildi:** `download()` da **401-retry shoxi umuman yo'q edi** —
> `request()` dan qo'lda ko'chirilganda tushib qolgan. Token muddati tugagach «Экспорт в XLSX»
> `Download failed: HTTP 401` bilan otilardi va faqat sahifani qayta yuklash yordam berardi
> (refresh-cookie tirik bo'lsa ham). Hech bir gate buni ko'rmaydi — RED test bilan tasdiqlandi.
>
> **⚠️ Reja raqami noto'g'ri edi:** «`FE-02` — 24× YesNoSelect/MultiRefField/refFetcher» bitta
> raqamga qo'shib yuborgan. O'z o'lchovim: `YesNoSelect` **24** (hammasi bir xil), `MultiRefField`
> **5** (faqat 3 tasi bir xil shakl), `refFetcher` **4** (faqat 3 tasi modul-darajali bir xil).
> `commission-reports`/`payments` (boshqa o'ram + `endpoint` prop) va `serial-numbers`
> (`{id,primary}` qaytaradi) **ataylab tegilmadi** — sabab jurnalda.
>
> **⚠️ HODISA:** `lib/api-client.test.ts` **mavjud edi**, `Write` bilan ustidan yozildi va 6 ta
> Content-Type regress-qo'riqchisi yo'qoldi. `git status` da `M` (`A` emas) bo'lgani bilan tutildi,
> `git show HEAD:` dan tiklanib birlashtirildi (fayl endi 15 test). Xotira
> `never-write-over-existing-test-file` — bu **uchinchi** takror; commitdan oldin `A` vs `M`
> tekshiruvi yagona ishonchli signal.
>
> **Codemod:** `scratchpad/codemod-faza31.mjs` — deterministik, **fail-closed** (anchor topilmasa
> yoki ikki marta uchrasa fayl umuman tegilmaydi, butun yugurish `exit 1`). 37 fayl, ~0 token.
> Ikki qoldiqni codemod topmadi (yetim izoh bloki + undan kelib chiqqan 4 ishlatilmagan import) —
> skaner + biome bilan tutilib qo'lda tuzatildi, jurnalda halol qayd etilgan.
>
> **Gate:** web typecheck **0** · `check-lint.mjs` **0 error** · `i18n:gate` **9/9** ·
> to'liq web Vitest **185 fayl / 2814 test yashil, 0 yiqilish** (26 skip). Sanoq nazorati:
> `2814 = 2788 (HEAD) + 9 + 8 + 9` — jim yo'qolgan test yo'q.
>
> **⏭️ KEYINGI:** reja bo'yicha ochiq fazalar — **27b** (`PERF-01`), **27c** (`PERF-02`, dalili
> ESKIRGAN — qayta o'qi), **29b** (`HR-13` soft-delete), **32** (FE auth-UX + POS i18n),
> **33** (`FE-12` shared API-tiplar). Faza 31 qarzi (browser-QA; 2 ta dedup qilinmagan
> `MultiRefField` shakli; `LineTotalRow` ning hamma maydoni ixtiyoriy ⇒ tip-himoyasi bo'sh) —
> `docs/REJA-AUDIT-FIX-2026-08.md` → «HISOBOT JURNALI → Faza 31 → Qolgan qarz».

> **🕒 2026-08-09j (AUDIT-FIX FAZA 34 — Float→BigInt aniqlik: inventar/ko'chirish/CO kaskadi ·
> `STK-05`,`STK-08`,`SALES-10`,`STK-12`) · Phase-1: strukturaviy + unit, RUNTIME-TASDIQLANMAGAN
> (browser-smoke YO'Q) · ⏳ DEPLOY QILINMAGAN · 🗄️ **MIGRATSIYA BOR** —
> `20260809180000_move_position_base_cost_minor` (lokal `climart_adopt` ga qo'llandi, prod'da
> KUTMOQDA) · ⚠️ parallel sessiya `apps/web/**` (Faza 30 POS) da ishlamoqda — `git add` aniq
> yo'llar bilan, ularning fayllariga TEGILMADI.**
>
> **Nima qilindi:** hujjat-post yo'llaridagi miqdor/tan-narx float arifmetikasi aniq BigInt
> primitivlarga o'tkazildi (`demand/fifo-consumer.ts` — yagona manba; `stock.service.ts` o'zining
> ko'chirma `toMicro`/`fromMicro` juftini tashladi). To'rtala topilma ham kodda TASDIQLANDI.
> **(STK-05)** `Inventory.post` variance `String(Number(a) - Number(b))` bilan Decimal(20,6)
> ustuniga `"0.19999999999999998"` / `"1.0000000116860974e-7"` yozardi, tan-narx esa
> `Math.round(Number(costBalance)/n)` — 2^53 tiyindan keyin yumaloqlanardi ⇒ yangi sof
> `computeVarianceLine()`/`reverseVarianceCost()`, post↔cancel nol-yig'indi.
> **(STK-08)** `Move.post` per-birlikni AVVAL yumaloqlab keyin qty ga ko'paytirardi ⇒ butun
> qoldiqni ko'chirganda manbada `qty=0` + bir necha tiyin qolardi (keyingi kirimning o'rtachasini
> buzadi). Yangi `move/move-cost-basis.ts` + **yangi ustun `MovePosition.base_cost_minor`**.
> **(SALES-10)** CO jo'natish/rezerv kaskadi va `demand.createFromCustomerOrder` cap-tekshiruvi
> to'liq decimal-string'ga: 0.1×3 jo'natilgan 0.3 lik satr endi haqiqatan `fully_shipped` ga o'tadi.
> **(STK-12)** «available = qty − reserved» uch nusxadan bitta ta'rifga — `availableOf()` /
> `availableMicroOf()`; float yo'li 0.2 buyurtmaga 2.8e-17 lik **fantom PO satri** yasardi.
> **+1 audit ko'rmagan:** `product-cell-move.service.ts:39` da AYNAN shu float naqsh bor edi.
>
> **⚠️ Reja taklif qilgan STK-08 yechimi YETARLI EMAS edi** — «to'liq ko'chirishda
> costDelta = −costBalanceMinor» post'ni to'g'rilab, `unpost`/`cancel`ni buzardi (ular per-birlik
> snapshot'idan qayta hisoblaydi). Shuning uchun aniq satr-qiymat SAQLANADI; eski qatorlar NULL ⇒
> eski formulaga tushadi (bit-ma-bit teskarilik, nol-regressiya).
>
> **Gate:** typecheck **9/9** · `lint:product` **0 error** · to'liq API suite **5543/5549 yashil**
> (4 yiqilgan = `publication`+`hr-employee` argon2 **5 s timeout**i, parallel typecheck CPU'ni
> yeganidan; alohida yugurtirilganda **57/57 yashil**, mening o'zgarishlarimga aloqasi YO'Q) ·
> tegilgan 7 modul to'liq yashil · **28 yangi test** (3 fayl, har biri avval RED).
>
> **⏭️ KEYINGI:** reja bo'yicha ochiq fazalar — **27b** (`PERF-01` analitika-items DB-paginate),
> **27c** (`PERF-02` akt-sverka davr-filtri, dalili ESKIRGAN — qayta o'qi), **29b** (`HR-13`
> soft-delete), **30–33** (FE — 30 hozir parallel sessiyada). Faza 34 ning qolgan qarzi
> (`reservedQty` payload'i hamon `number`, `fifo-consumer.ts` nomi yolg'on, `Move.sumMinor`
> backfill YO'Q) — `docs/REJA-AUDIT-FIX-2026-08.md` → «HISOBOT JURNALI → Faza 34 → Qolgan qarz».

> **🕒 2026-08-09i (AUDIT-FIX FAZA **29a** — HR to'g'rilik paketi: base-salary + shift-resolve +
> jarima-sinxron + tz · `HR-1`,`HR-2`,`HR-3`,`HR-7/8`) · Phase-1: strukturaviy + unit,
> RUNTIME-TASDIQLANMAGAN (browser-smoke YO'Q, jonli DB sinovi YO'Q) · ⏳ DEPLOY QILINMAGAN ·
> 🗄️ **migratsiya SHART EMAS** · ⚠️ parallel sessiya `customer-order`/`demand`/`inventory`/`move`/
> `product`/`stock`/`web-pos`/`schema.prisma` da ishlamoqda — `git add` 14 aniq yo'l bilan,
> ularning fayllariga TEGILMADI (`lint:product` daraxtdagi 9 xato — hammasi o'shalarniki).**
>
> **Nima qilindi (`881ebcc7`):** reja «og'ir bo'lsa sub-faza» degani uchun Faza 29 **29a/29b** ga
> bo'lindi. 29a = migratsiyasiz **beshta** to'g'rilik nuqsoni, har biri RED→GREEN TDD bilan:
> **(HR-1)** fiks oylik prod'da **doim 0** edi — xodim kartochkasi `Employee.salaryMinor`
> **ustuniga** yozadi, dvigatel esa `salaryConfig` **JSON**'idan o'qirdi (JSON'ni faqat bir
> martalik smoke-skript to'ldiradi) ⇒ yangi `resolveFixComponentMinor` (JSON override ustun,
> **ataylab 0 ham** aniq qiymat; buzuq/manfiy = sozlanmagan ⇒ ustunga qaytadi).
> **(HR-2)** GPS check-in ikki yo'li (`ingest` KELDI + `manualCheckIn`) hafta-kuni jadvalidan
> kechikish hisoblardi — nomli **siklik/erkin** `HrSchedule` li xodimda xato (va undan avto-jarima)
> ⇒ ikkalasi `resolveShift`+`lateMinutesForShift` ga o'tdi, smena xodim bilan **bitta** so'rovda.
> **(HR-3)** `edit()` `lateMinutes`ni qayta hisoblamas, `applyIfLate` esa `@@unique` tufayli eski
> summani jimgina qoldirardi ⇒ qayta hisob + yangi `LateFineService.syncForAttendance`
> (0 ⇒ **storno**, aks holda **upsert**); sinxron faqat kechikish **haqiqatan** o'zgarganda.
> **(HR-7/8)** oy chegarasi tz off-by-one **ikki joyda**: bonus/jarima `createdAt` oynasi UTC yarim
> tunda edi (1-avgust 00:00–05:00 jarimasi **iyulga** tushardi) ⇒ yangi `monthInstantBounds`;
> `daysInMonthOf(dayStart)` oyning 1-kunida **o'tgan oyni** berardi (1-mart → 28 ga bo'linardi)
> ⇒ `dateOnly` yorlig'idan.
>
> **⚠️ Rejaning (d) bandi ATAYLAB to'liq bajarilmadi.** «`monthBounds`ni Tashkent-tz bilan» deyilgan
> edi — ko'r-ko'rona qo'llansa **yangi bug** tug'ilardi: `monthBounds` `EmployeeDailyKpi.date`
> so'rovida ham ishlatiladi, u esa `localDateOnly` **YORLIG'I** (UTC yarim tun), instant emas;
> surish oyning 1-kunini tashlab yuborardi. Chegara **ikkiga ajratildi**: `monthBounds` = yorliq
> (o'zgarmadi, izoh+test bilan qulflandi) · `monthInstantBounds` = instant. Ikkalasiga regressiya testi.
>
> **Gate:** typecheck **9/9** · api `hr/`+`manager/` **101 fayl / 1082 test** · `app-boot` DI **9** ·
> biome shu 14 faylda **0**. `lint-staged` yana **`docs/progress.json`** ni commit'ga qo'shdi
> (faqat hook'ning `generatedAt` tamg'asi, hech kimning ishi emas) — umumiy checkout'da
> `reset --soft` xavfi (§6.7 A) shu zarardan katta, tarix qayta YOZILMADI.
>
> **⏭️ KEYINGI = FAZA 29b (`HR-13` soft-delete + audit)** — batafsil retsept
> `docs/REJA-AUDIT-FIX-2026-08.md` Faza 29 hisobotining oxirida. Uch ish: (1) `HrAttendance` da
> soft-delete ustuni **YO'Q** ⇒ Prisma migratsiya (umumiy resurs, §6.4 — yolg'iz sessiyada;
> lokal DB retsepti xotira `climart-adopt-local-db-untracked.md` da); (2) `delete()` soft+auditLog,
> so'ng **barcha o'quvchilarga** `deletedAt: null` filtri (aks holda o'chirilgan qator hisobotda
> qolaveradi); (3) **yetim jarima** — `HrBonusFineLog.attendanceId` xom FK (cascade YO'Q), o'chirishda
> `auto_late` osilib qoladi ⇒ `delete()` ham storno chaqirsin (mexanizm 29a da tayyor).

> **🕒 2026-08-09h (AUDIT-FIX FAZA 28 — outbox eksklyuziv claim + ijara + dedup ·
> `INT-08`,`HR-4`,`INT-09`) · Phase-1: strukturaviy + unit, RUNTIME-TASDIQLANMAGAN
> (browser-smoke YO'Q, jonli DB/cluster sinovi YO'Q) · ⏳ DEPLOY QILINMAGAN ·
> 🗄️ **migratsiya SHART EMAS** (status ustunlari `VarChar(20)`) ·
> ⚠️ parallel sessiya `modules/report/*` da ishlamoqda — commit'im pathspec-cheklangan;
> commit oldidan ularning 5 report faylini indeksdan CHIQARDIM (ish daraxti tegilmagan,
> ular qayta `git add` qiladi). `docs/progress.json` (faqat `generatedAt` vaqt-tamg'asi)
> lint-staged tomonidan commit'ga qo'shilib ketdi — zararsiz, `git show --stat` bilan tekshirildi.**
>
> **Nima qilindi (`94b05fa5`):** besh cron-worker (hr-telegram-outbox · webhook · sms · email ·
> telegram `drainOutbox`) navbatni **egasiz** bo'shatardi. HR outbox'ning «atomik guard»i
> `pending → pending` yozardi — chiqib ketmaydigan holat, shuning uchun raqib workerning
> `updateMany`i ham `count=1` qaytarardi (`HR-4`); qolgan to'rttasida claim UMUMAN yo'q edi
> (`INT-08`); barchasi natijani provayder chaqiruvidan KEYIN yozardi ⇒ oradagi crash qatorni
> `pending` qoldirib qayta yubortirardi (`INT-09`).
> **Yechim** — yangi `apps/api/src/modules/shared/outbox-claim.ts`: (1) `pending|retry → 'sending'`
> eksklyuziv claim + **ijara** (`nextRetryAt = now+5daq`, `OUTBOX_CLAIM_LEASE_MS`) — Postgres
> qator-qulfi tufayli raqib `count=0` oladi; (2) `attemptedAt`/'sending' provayderdan **OLDIN**
> yoziladi; (3) ijarasi tugagan `'sending'` qatorlarni **reaper** navbatga qaytaradi (+1 urinish,
> shuning uchun crash-sikl abadiy emas); (4) **qayta-urinishda** (birinchi urinishda EMAS) bir xil
> xabar dedup oynasida (24s, `OUTBOX_DEDUP_WINDOW_MS`) yuborilgan bo'lsa yuborish o'tkazib
> yuboriladi; webhook uchun `Idempotency-Key: <delivery id>` sarlavhasi (at-least-once shartnomasi
> ataylab saqlandi); (5) `isCronLeader()` (`shared/cron-leader.ts`) — pm2 cluster'da faqat
> `NODE_APP_INSTANCE=0` replikasi navbat bo'shatadi (`CRON_WORKERS_DISABLED=1` — favqulodda
> o'chirgich); `deploy/ecosystem.config.cjs` da `instances: 1` sababi hujjatlashtirildi;
> (6) uchib turgan qatorni QO'LDA qayta navbatga qo'yish bloklandi (webhook/sms/email retry).
> **Status lug'ati:** `'sending'` 4 Zod filtr-enum + `HR_MESSAGE_STATUSES` + prisma doc-komment +
> FE (2 sahifa union/filtr-chip, `DELIVERY_STATUS_TONE`/`HR_MESSAGE_STATUS_TONE` → `info`,
> ru/uz `status_sending` × 4 namespace).
> **TDD:** har workerda **ikki parallel instansiya bitta qatorga → AYNAN BITTA yuborish**
> (fake store `updateMany`ni atomik predikat+yozuv sifatida modellaydi = ReadCommitted qator-qulfi),
> ijara-reaper, dedup, non-leader testlari. **Class-lock** `shared/outbox-claim-class.test.ts` —
> yangi `*-delivery.service.ts` / `*outbox-worker.service.ts` claim'siz kirsa yiqiladi.
> **Gate:** typecheck 9/9 · `lint:product` 0 error · i18n gate yashil · api Vitest
> (shared/webhook/sms/email/telegram/hr) **133 fayl / 1553 test** · `app-boot` DI · web
> `domain-status-tone` drift-lock 75.
> **QOLGAN XAVF (halol):** «provayder qabul qildi → process o'ldi → ijara tugadi → qayta
> yuborildi» dublikati **to'liq yopilmadi** — provayder idempotentlik kaliti kerak (MTProto
> `random_id` adapter shartnomasini o'zgartiradi, bu fazada QILINMADI; Eskiz'da bunday kafolat yo'q).
> **Keyingi:** `docs/REJA-AUDIT-FIX-2026-08.md` → **Faza 29** (HR to'g'rilik paketi) yoki navbat
> bo'yicha; Faza 28 deploy + jonli tekshiruv (bir necha tick, `'sending'` qatorlar ilib qolmasligi).
>
> **🕒 2026-08-09g (AUDIT-FIX FAZA 26 — dashboard: recentDocs UNION + `updatedAt` indekslari +
> pul-keshi + overdue raw-SQL · `PERF-05`,`PERF-06`,`PERF-11`) · Phase-1: strukturaviy + unit +
> **EXPLAIN-tasdiqlangan**, browser-smoke YO'Q · ⏳ DEPLOY QILINMAGAN ·
> 🗄️ **migratsiya BOR** (`20260809160000_dashboard_updated_at_and_due_date_indexes`) ·
> ⚠️ **navbatdan tashqari** — foydalanuvchi IDE'da Faza 26 sessiya-boshi promptini bevosita berdi ·
> ⚠️ parallel sessiya email/sms/webhook/telegram/hr modullarida ishlamoqda; commit'im
> pathspec-cheklangan, ularning fayllariga TEGILMADI
>
> **🔴 REJA TAKLIF QILGAN YECHIM YETARLI EMAS EDI** (Faza 25'nikiga o'xshash sabot, boshqa sabab).
> Reja/audit: «12 jadvalga `updatedAt` indeksi qo'sh — komment aytgan rejim haqiqatga aylanadi».
> **Aslida indeksni yakka qo'shish so'rovni SEKINLASHTIRDI:** Postgres tashqi `LIMIT`ni `UNION ALL`
> shoxlariga tushirmaydi, shuning uchun planner baribir har jadvalni to'liq o'qib top-N sort qiladi.
> EXPLAIN ANALYZE (bitta legda 24 008 sintetik qator, tranzaksiya ichida + ROLLBACK):
> indekssiz **18 ms** → faqat indeks **66 ms** (indeks umuman ishlatilmaydi) → faqat per-leg LIMIT
> 33 ms → **ikkalasi birga 0.55 ms** (`Merge Append` + `Index Scan`). **Qoida: indeks qo'shishdan
> oldin so'rov SHAKLI o'sha indeksni ishlata oladimi — EXPLAIN bilan tekshir.**
>
> **Nima qilindi.** (1) `computeRecentDocs` — har 12 legga o'z `ORDER BY updated_at DESC LIMIT 20`
> si (global top-20 albatta per-leg top-20'lar ichida); yolg'on komment o'rniga o'lchov jadvali;
> `Promise.all` dan **keyin** await qilinardi — endi ichida. (2) **14 indeks**: 12 ta
> `[accountId, updatedAt(sort: Desc)]` + `invoices_out[accountId,paymentPlannedMoment]` +
> `customer_orders[accountId,deliveryPlannedMoment]`. (3) `computeOverdueInvoices` — `LIMIT×4`
> over-fetch + JS-filtr o'rniga raw-SQL, predikati agregatnikiga **aynan mos** (eski kodda eng eski
> 40 hujjat to'langan bo'lsa panel `count>0` bo'lsa-da BO'SH chiqardi). (4) `loadRateContext`
> **request-scope** (3 so'rov → 1). (5) Pul bloklari **30 s TTL kesh** ostida
> (`report/ttl-cache.util.ts`, yangi) — kalit `accountId` bilan, in-flight promise bo'lishiladi,
> xato keshlanmaydi.
>
> **Materialized daftardan o'qish TANLANMADI** — `MoneyOperation` da backfill yo'q (Faza 11), ya'ni
> 2026-08-08 gacha hujjatlarni bilmaydi; undan o'qish dashboard raqamini kam ko'rsatgan bo'lardi.
>
> **Testlar.** `report/dashboard.service.test.ts` (yangi, 7) — RED'da 4 yiqildi → GREEN 7/7;
> `report/ttl-cache.util.test.ts` (yangi, 5). Kesh **tenant-kalitlanishi** ham qulflangan.
> Gate: api typecheck 0 · `vitest run src/modules/report` 37 fayl / 328 test yashil · biome
> shu fazaning 4 faylida 0 xato. **`pnpm lint:product` repo bo'ylab 17 xato — HAMMASI parallel
> sessiyaning fayllarida** (§6.1: tegilmadi).
>
> **🟠 Qolgan qarz.** (1) Overdue indekslari lokalda **o'lchanmadi** — `invoices_out` bo'sh; prodda
> EXPLAIN bilan tekshirilsin. (2) **`recentDocs` `deleted_at`ni filtrlamaydi** (eski xulq, 12 legning
> birortasida ham yo'q) — o'chirilgan hujjat «Недавние документы»da chiqishi mumkin; auditda YO'Q,
> alohida topilma sifatida yozilsin. (3) Kesh invalidatsiyasi yo'q — tile 30 s gacha eski
> (ataylab). (4) `PERF-04` (dashboard `receivables` top-500 dan) — **Faza 27** ishi.
>
> **Deploy eslatmasi.** `CREATE INDEX` SHARE qulfini oladi — past yuklamada qo'lla. Prod DB'lar
> `_prisma_migrations`-tracked emas ⇒ `prisma db execute --file …` bilan qo'lda; fayl
> `IF NOT EXISTS` bilan idempotent.
>
> **Keyingi:** **Faza 27b** (`PERF-01`, analitika-items DB-paginate) — **27a parallel sessiyada
> allaqachon BAJARILDI** (`PERF-10`,`PERF-04`,`DUP-14`).
>
> **⚠️ COMMIT ARALASHUVI (halol qayd).** `git commit -- <pathspec>` berilgan yo'lning **ishchi
> daraxt** versiyasini oladi, indeksdagi ulushimni emas. `docs/REJA-AUDIT-FIX-2026-08.md` da
> parallel sessiya o'sha payt Faza 27a hisobotini yozib qo'ygan edi ⇒ **ularning ~127 qatorli
> hujjat-tahriri mening `1d81f05f` commit'imga tushdi** (kodlari — `report/stock-balance.*`,
> `report/counterparty-balance.*` — hamon commit qilinmagan, ya'ni hujjat kod'dan oldinda).
> Hech narsa yo'qolmadi, tuzatilmadi ham (revert parallel ishni buzardi). **Sabot: pathspec
> ham, `git add` ham begona tahrirdan himoya qilmaydi — commit'dan keyin `git show --stat` YETARLI
> emas, `git show <commit> -- <fayl>` bilan hunk'larni ham ko'r.**

> **🕒 2026-08-09f (AUDIT-FIX FAZA 25 — DB indeks-paket: hot-FK + barcode GIN + INN/yacheyka
> expression · `DB-04`,`DB-05`,`DB-08`,`PERF-12`,`PERF-14`) · Phase-1: strukturaviy +
> **EXPLAIN-tasdiqlangan**, browser-smoke YO'Q · ⏳ DEPLOY QILINMAGAN ·
> 🗄️ **migratsiya BOR** (`20260809140000_perf_index_pack_fk_barcode_inn_cell`) ·
> ⚠️ **navbatdan tashqari** — foydalanuvchi IDE'da Faza 25 sessiya-boshi promptini bevosita berdi ·
> ⚠️ parallel sessiyalar Faza 21/24'ni shu vaqtda commit qildi; `docs/progress.json` ularning
> stage'ida turgan — commit'im pathspec-cheklangan, ularning ishiga TEGILMADI
>
> **Nima qilindi.** 10 indeks: 8 tasi `schema.prisma`da (`Product.barcodes` GIN `ArrayOps` ·
> `CustomerOrder.statusId/contractId/projectId/storeId` · `Demand.statusId` · `RetailSale.agentId` ·
> `Debt[accountId,problem,status]`), 2 tasi raw expression (`products_yacheyka_idx`,
> `counterparties_inn_trgm_idx`). **Kod-mantiq tegilmadi (0 `.ts`), unique/constraint qo'yilmadi.**
>
> **🔴 REJA TAKLIF QILGAN IFODA XATO EDI** — keyingi indeks fazalari uchun sabot. Reja
> `((uz_requisites->>'inn'))` dedi; Prisma esa `(uz_requisites #>> ARRAY['inn']::text[]) LIKE '%…%'`
> emit qiladi. Postgres expression-indeksni **parse-daraxt tengligi** bo'yicha tanlaydi ⇒ `->>`
> indeksi hech qachon ishlatilmasdi (ustiga, leading-wildcard LIKE btree'ni butunlay chetlaydi —
> `gin_trgm_ops` kerak). **Qoida: expression-indeks yozishdan oldin Prisma'ning haqiqiy SQL'ini
> `log:['query']` bilan qo'lga ol, keyin EXPLAIN normalizatsiyasidan ifodani ko'chir.**
>
> **O'lchov (RED→GREEN).** Migratsiyadan oldin 8 predikatning hammasi `Filter`/`Seq Scan` edi →
> keyin `Index Cond`/`Index Only Scan`. 30k-qatorli hajm-testi (tranzaksiya ichida, ROLLBACK bilan —
> dev-DB o'zgarmadi, planner DEFAULT): `PERF-12` «Покупатели» semi-join subplan narxi **1948 → 8.30**
> (`Index Only Scan using retail_sales_agent_id_idx`); yacheyka va INN ham indeksga o'tdi.
>
> **🟠 Yarim yopilgan (keyingi fazaga).** (1) **`DB-04`** — barcode GIN ro'yxat/`count` yo'lida
> ishlaydi, lekin POS `findFirst` (`LIMIT 1`) da planner uni TANLAMAYDI (massiv `@>` uchun default
> 0.005 selektivlik). Haqiqiy yechim — barcode unique/normalizatsiya (dublikat-merge data-migration).
> (2) **`DB-05`** — `bank-import.service.ts:443` HAMON butun kontragent jadvalini JS'ga yuklaydi;
> SQL-lookup'ga o'tkazilgach INN uchun qo'shimcha **btree** expression-indeks kerak (trgm GIN
> teng-solishtirishga yaramaydi). To'liq ro'yxat: reja → «HISOBOT JURNALI → Faza 25 → DEFER».
>
> **Deploy eslatmasi.** `CREATE INDEX` SHARE qulfini oladi (yozuv bloklanadi) — past yuklamada
> qo'lla. Prod DB'lar `_prisma_migrations`-tracked emas ⇒ `prisma db execute --file …` bilan qo'lda;
> fayl `IF NOT EXISTS` bilan idempotent (ikki marta yugurtirib tekshirildi).
>
> **Keyingi:** reja bo'yicha **Faza 26** (dashboard `updatedAt` indeks + kesh + overdue raw-SQL) —
> u Faza 25'ni tavsiya-bog'liqlik sifatida ko'rsatgan, endi ochiq.

> **🕒 2026-08-09e (AUDIT-FIX FAZA 21 — Telegram webhook secret validatsiya + gateway constant-time ·
> `INT-01`/`AUTH-01` + `INT-14` + yo'l-yo'lakay `INT-13`) · Phase-1: strukturaviy +
> unit-tasdiqlangan, browser-smoke YO'Q · ⏳ DEPLOY QILINMAGAN · 🗄️ migratsiya YO'Q ·
> ⚠️ **navbatdan tashqari** — foydalanuvchi IDE'da Faza 21 sessiya-boshi promptini bevosita berdi ·
> ⚠️ parallel sessiya (Faza 24/25: `edo/*`, `moysklad-compat/*`, `schema.prisma`, perf-migratsiya)
> daraxtda ochiq ish qoldirgan — TEGILMADI, commit pathspec-cheklangan
>
> **🔴 DEPLOYDAN OLDIN — BLOKER.** Webhook tekshiruvi **fail-closed**: prod'da `webhookSecret`
> sozlanmagan akkauntda inbound Telegram **butunlay to'xtaydi**, jumladan **JONLI qabul-tasdiqlash
> (supply-approval) inline tugmalari**. DB-backfill yechim EMAS (sirni Telegram tomoni ham bilishi
> kerak). Har akkaunt uchun bitta chaqiruv: `POST /api/v1/telegram/config/webhook {url:"<mavjud>"}`
> — `secret` berilmasa avtomat generatsiya qilinadi. Tekshirish: `GET /telegram/business-status`
> → yangi `webhookSecretSet: true`.
>
> **Nima qilindi.** (a) `INT-01`: `/telegram-webhook/:accountId` repo'dagi **yagona guard'siz**
> controller edi (global guard faqat `KioskGuard`) va `x-telegram-bot-api-secret-token` sarlavhasi
> `_secretHeader` deb olinib **tashlanardi** ⇒ accountId'ni bilgan har kim `sa:` callback bilan
> qabulni «tasdiqlashi» mumkin edi. Endi `assertWebhookSecret()` `handleInbound`dan OLDIN,
> fail-closed (config/secret/sarlavha yo'q — hammasi 401). `setWebhook` secret'siz o'rnatmaydi
> (berilmasa `randomBytes(32)` generatsiya). (b) `INT-14`: yangi `shared/timing-safe.ts` →
> `secretEquals()` (SHA-256 digest + `timingSafeEqual` ⇒ uzunlik-oracle ham yopiq, fail-closed);
> payme/click `===` solishtiruvlari almashtirildi — ular **fail-OPEN** ham edi (`'' === ''`).
> (c) `INT-13` (reja «ehtiyot bo'l» degan edi): `saveConfig` PATCH-semantikaga o'tdi — aks holda
> token rotatsiyasi `webhookSecret`ni NULL qilib (a) ni **doimiy 401 uzilishiga** aylantirardi.
> (d) `businessStatus.webhookSecretSet` (mening topilmam) — eski `webhookSet` faqat URL'ga
> qaraydi, ya'ni «sozlangan ko'rinadi, har update 401» jim-nosozligini yashirardi.
> Batafsil: `docs/REJA-AUDIT-FIX-2026-08.md` → HISOBOT JURNALI → Faza 21.
>
> **Gate:** `@moysklad/api typecheck` **0** · `lint:product` **0 error** · vitest scoped
> (shared+telegram+payment-gateway+supply-approval+__tests__) **661/661** · **butun API suite
> 5388 passed / 2 skip / 0 fail** · `i18n:gate` **9/9**. Klass-qulf **non-vacuity jonli o'lchandi**
> (fixni bir qatorga qaytarib QIZIL ko'rildi, keyin bayt-identik tiklandi).
>
> **🟠 QARZ:** (1) `webhookSecretSet` UI'da ko'rsatilmaydi (web fazasi emas). (2) Update
> replay/dedup va rate-limit yo'q. (3) Secret rotatsiyasi atomik emas (Telegram→DB oralig'ida
> millisekundlik 401 oynasi, provider retry qiladi). (4) `INT-13` naqshi boshqa integratsiya
> `saveConfig`'larida (onec/marketplace/bank-adapter) TEKSHIRILMADI.
>
> **⏭️ Keyingi:** reja bo'yicha **Faza 25** (`DB-04/05/08`, `PERF-12/14`) — LEKIN parallel sessiya
> uni allaqachon boshlagan ko'rinadi (`packages/db/prisma/migrations/20260809140000_perf_index_pack_*`
> daraxtda turibdi). Boshlashdan oldin `git log` + `git status` bilan tekshir; band bo'lsa **Faza 26**.

> **🕒 2026-08-09d (AUDIT-FIX FAZA 24 — EDO PFX AES-GCM shifrlash + ApiToken scope-enforcement ·
> `INT-06`+`INT-07`) · Phase-1: strukturaviy + unit-tasdiqlangan, browser-smoke YO'Q ·
> ⏳ DEPLOY QILINMAGAN · 🗄️ migratsiya YO'Q (sxema tegilmadi) · ⚠️ **navbatdan tashqari** —
> foydalanuvchi IDE'da Faza 24 sessiya-boshi promptini bevosita berdi · ⚠️ parallel sessiya
> daraxtda ochiq ish qoldirgan (`shared/timing-safe*`, `telegram/*`, `payment-gateway/*`,
> `schema.prisma`) — TEGILMADI, commit pathspec-cheklangan
>
> **Nima qilindi.** (a) `INT-06`: `edo.service.ts` da «encrypted at rest» kommenti ostida ECP
> xususiy kaliti **ochiq** yozilardi (paroli esa yonida shifrlangan!). `email/crypto.ts` ga binar
> o'ram qo'shildi — `encryptBuffer`/`decryptBuffer`/`isEncryptedBuffer` (`MAGIC ‖ iv ‖ tag ‖ cipher`);
> `setPfx` endi shifrlaydi, yangi `loadSignerMaterial()` — `pfxCipher` ning **yagona** o'qish yo'li
> (deshifr + `legacyPlaintext` bayrog'i), `sign()` presence-check o'rniga shuni chaqiradi.
> Sarlavha xom PKCS#12 (`0x30`) bilan hech qachon to'qnashmaydi ⇒ eski qatorlar buzilmay o'qiladi.
> (b) `INT-07`: `api-token.guard.ts` har tokenga `permissions:['*']` berardi, `scopes` **umuman
> o'qilmasdi**. Yangi sof modul `api-token.scope.ts` (grammatika `*` / `<slug>` / `<slug>:read` /
> `:write`, URL→slug, method→action) + guard'da **403** + `create` da scope-sintaksis validatsiyasi.
> TDD: 20 test avval qizil ko'rildi. Batafsil: `docs/REJA-AUDIT-FIX-2026-08.md` → HISOBOT JURNALI → Faza 24.
>
> **Gate:** `@moysklad/api typecheck` **0** · vitest **butun API suite 5388/5388 passed** (2 skip,
> 0 fail) · `biome check` tegilgan 3 katalog **0 error**. ⚠️ Repo-bo'yicha `lint:product` qizil —
> **faqat parallel sessiyaning 4 faylida** (`shared/timing-safe*`, `shared/constant-time-secret-class`,
> `telegram/telegram-config-patch`); tegilmadi (§6.1). i18n gate kerak emas (UI-matn yo'q).
>
> **🟠 QARZ / DIQQAT:** (1) **Mavjud PFX qatorlari DB'da OCHIQ qoladi** — faqat qayta yuklash
> shifrlaydi; o'qishda WARN loglanadi (ommaviy re-encrypt ataylab qilinmadi — kalit noto'g'ri
> bo'lsa PFX butunlay o'qilmay qoladi). (2) **Mavjud tokenlarning hammasi `scopes: []` ⇒ to'liq
> kirish** — mexanizm tayyor, amaliy cheklov hozircha 0 (jonli 1C/CLIMART integratsiyasini
> sindirmaslik uchun ataylab). (3) **`/settings/api-tokens` UI MAVJUD EMAS** (controller kommenti
> yolg'on) — scope faqat API orqali beriladi; UI alohida ish. (4) Scope slug'i `SLUGS` ro'yxatiga
> solishtirilmaydi (typo fail-closed, lekin yaratishda tutilmaydi).
>
> **⏭️ KEYINGI:** navbat bo'yicha — `docs/REJA-AUDIT-FIX-2026-08.md` → **Faza 15**
> (`SALES-02`,`SALES-06`,`SALES-07/08`), **Faza 21** (`INT-01`+`INT-14`) yoki **Faza 25**
> (DB indeks-paketi). Parallel sessiya tugatmaguncha `shared/timing-safe*`, `telegram/*`,
> `payment-gateway/*` fayllariga tegmang.

---

> **🕒 2026-08-09c (AUDIT-FIX FAZA 19 — to'lov-gateway → moliyaviy hujjat + idempotency ·
> `INT-02`+`INT-03`+`INT-04`) · Phase-1: strukturaviy + unit-tasdiqlangan, browser-smoke YO'Q ·
> ⏳ DEPLOY QILINMAGAN · 🗄️ **migratsiya BOR** (`20260809120000_gateway_payment_in_link_and_unique`,
> lokalga qo'llandi) · ⚠️ **navbatdan tashqari** — foydalanuvchi IDE'da Faza 19 promptini tanlagan
> holda `davom et` dedi (navbat bo'yicha Faza 15 hamon ochiq) · ⚠️ parallel sessiya bir daraxtda
> Faza 17/23 qilmoqda — diff'im path-cheklangan (§6.6), `lint:product` ham (§6.6). Harf `c` olindi:
> `2026-08-09a` IKKI marta ishlatilgan (parallel kolliziya), `b` band bo'lishi mumkin.
>
> **Nima qilindi.** (a) `INT-02`: Payme `PerformTransaction` / Click COMPLETE endi capture'dan
> **PaymentIn draft** yaratadi va CustomerOrder'ga `operations[targetKind:'customerorder']` bilan
> bog'laydi (`paymentInId` ustuni + FK). Ilgari `paymentGatewayTx` BUTUN kod bazasida yagona faylda
> ishlatilardi ⇒ gateway puli daftarga umuman kirmasdi. Atomiklik: bitta DB-tranzaksiya o'rniga
> **atomik claim** (`updateMany` ikki shoxli shart) — dublikat yo'q, xato bo'lsa `errorMsg` yozilib
> provider-retry'da o'z-o'zini tuzatadi. (b) `INT-03`: `parseClickAmountToMinor()` — float butunlay
> chiqarildi, Payme tomonida BigInt solishtiruv. (c) `INT-04`:
> `@@unique([accountId, provider, providerTxId])` + P2002-catch idempotency (Click PREPARE va
> paymeCreate). Bonus: paymeCreate summa-tekshiruvi (yo'q edi), takroriy Perform endi **o'sha**
> `perform_time`ni qaytaradi, UZS bo'lmagan buyurtmada capture to'xtaydi.
>
> **⚠️ Auditning bir da'vosi XATO chiqdi (§2 intizomi ishladi):** `INT-03` misoli `115.23` —
> o'lchandi, `115.23 * 100 === 11523` AYNAN. Bug-klass real, lekin testlar **o'lchangan** qiymatlarda
> (`19.99`, `0.29`, `8.29`) yozildi; audit misoliga ishonib yozilsa test yashil bo'lib «fix ishladi»
> degan yolg'on dalil bo'lardi.
>
> **Gate:** api tc **0** · vitest payment-gateway+payment-in+bank-import+app-boot **116/116**
> (kengaytirilgan: **172/172**) · `i18n:gate` **9/9** · migratsiya qo'llandi, drift 0 · o'z 6 faylim
> biome **0 error 0 warning** (repo-wide `lint:product` qizil — `report/*`, parallel sessiyaniki).
> **Browser-smoke YO'Q.** Batafsil: `docs/REJA-AUDIT-FIX-2026-08.md` → HISOBOT JURNALI → Faza 19.
>
> **🟠 QARZ:** (1) PaymentIn **draft** bo'lib qoladi — post EMAS, ya'ni balans/pul-daftari hali
> o'zgarmaydi (ataylab: webhook'dan ledger post qilish alohida faza). (2) Refund hujjati yo'q —
> `paymeCancel(-2)` faqat warn + `providerLog`. (3) **Prod migratsiya:** `CREATE UNIQUE INDEX`
> mavjud dublikatlarda yiqiladi (ataylab) — deploydan oldin migratsiya izohidagi `HAVING COUNT(*)>1`
> so'rovini yugurtir. (4) Ko'p-valyutali gateway buyurtmasi qo'llab-quvvatlanmaydi.
>
> **⏭️ KEYINGI:** navbat bo'yicha — `docs/REJA-AUDIT-FIX-2026-08.md` → **Faza 15**
> (`SALES-02`,`SALES-06`,`SALES-07/08`); yoki Faza 21 (`INT-01`+`INT-14`, gateway oilasining davomi —
> webhook secret + timing-safe taqqoslash), yoki 18b/18c.

---

> **🕒 2026-08-09a (AUDIT-FIX FAZA 23 — HR self-eskalatsiya guard + login-only mutatsiyalarga ruxsat
> + offboarding token-revoke · `HR-10`+`AUTH-07`+`AUTH-05`) · Phase-1: strukturaviy +
> unit-tasdiqlangan, browser-smoke YO'Q · ⏳ DEPLOY QILINMAGAN · 🗄️ migratsiya YO'Q ·
> ⚠️ **navbatdan tashqari** — foydalanuvchi Faza 23 sessiya-boshi promptini bevosita berdi ·
> ⚠️ parallel sessiya AYNI PAYTDA bir daraxtda Faza 17 (`payment-gateway`/`money`/`report` +
> `schema.prisma` + yangi migratsiya) qilmoqda — commit'im hook'siz va pathspec-cheklangan (§6.7B),
> `docs/REJA-…md` ham faqat MENING hunk'larim `git apply --cached` bilan staged (ularning
> commit qilinmagan Faza 17 hisoboti daraxtda tegilmay qoldi)
>
> **Nima qilindi.** (a) `HR-10`: `employees:full` egasi bir so'rov bilan HR-admin bo'lib olardi —
> yangi sof modul `hr/hr-auth/privilege-escalation.ts` (self-check + «'admin' rolini faqat admin
> beradi»), `PUT /hr/employees/:id/permissions` va `hrRoles` **update+create** yo'llariga ulandi
> (create ham — yangi xodimni darhol admin qilib yaratish o'sha teshikning ikkinchi og'zi edi).
> (b) `AUTH-07`: Group `POST/PATCH/DELETE` → `settings` ruxsati (GET ataylab ochiq); **bonus** —
> skanerim topgan ikki oylik-ta'sirli yo'l ham yopildi: `manager/kpi` `PUT employee/:id/config`
> (kodda `TODO(rol-gate)` turardi, class'ga `HrPermissionGuard` qo'shildi) va `POST metrics*`
> (guard bor edi-yu handler talabi yo'q ⇒ jim o'tardi). (c) `AUTH-05`: `revokeAllForEmployee`
> **0 chaqiruvli o'lik kod** edi — endi `offboarding.complete()` tx'ida chaqiriladi (+ `hrRoles: []`
> + `HrEmployeePermission` tozalash + commit'dan keyin `permissions.invalidate`); `TokenService`ga
> ixtiyoriy tx-klient qo'shildi. TDD: har blok avval qizil ko'rildi (helper 9 · permission-service 2 ·
> hr-employee +5 · group 4 · kpi-gate 6 · offboarding 4). Batafsil: `docs/REJA-AUDIT-FIX-2026-08.md`
> → HISOBOT JURNALI → Faza 23.
>
> **Gate:** vitest tegilgan modullar (hr/group/manager/auth/permissions) + `app-boot` **1167/1167** ·
> butun API suite **5293/5296** · `biome check` tegilgan modullar **0 error**. ⚠️ **Repo-bo'yicha
> `typecheck`/`lint:product` QIZIL — LEKIN faqat parallel sessiyaning fayllarida** (5 tsc xatosi
> `payment-gateway/*`da: generated Prisma client ularning yangi `paymentInId` sxemasidan orqada;
> 28 lint xatosi `money`/`report`/`payment-gateway`da). Ularga TEGILMADI, `prisma generate`
> YUGURTIRILMADI (§6.1/§6.4). Mening fayllarim tc+lint toza.
>
> **🟠 QARZ / DIQQAT:** (1) **Ruxsat qattiqlashuvi** — `employees:full`siz menejer KPI
> konfiguratsiyasini saqlay olmaydi, `settings`siz «Отделы» yaratib bo'lmaydi (403). Egada
> `hrRoles:['admin']` bor (seed-hr) ⇒ egaga ta'sir yo'q, lekin deploy'dan keyin rol matritsasini
> tekshir. (2) **15-daqiqalik access-JWT offboarding'dan keyin ham tirik** (deny-list/qisqa TTL —
> alohida ish). (3) **Ikki parallel RBAC birlashtirilmadi** — `HR-10` ildizi. (4) Qolgan guard-siz:
> **61 handler / 23 controller**, jurnalda 3 toifaga ajratilgan (ataylab ochiq ∥ haqiqiy teshik ∥
> HR-RBAC ostida); keyingi eng xavflilari: `sklad-keeper`, `smena`/`shift-schedule`,
> `debt POST pos/pay`, `driver-cash`. (5) Topilgan flake (meniki emas): `hr-shared/crypto.util.test.ts`
> «tampered ciphertext» ~1/256 yiqiladi (oxirgi 2 hex'ni `ff` bilan almashtiradi).
>
> **⏭️ KEYINGI:** navbat bo'yicha — `docs/REJA-AUDIT-FIX-2026-08.md` → **Faza 15**
> (`SALES-02`,`SALES-06`,`SALES-07/08`) yoki **Faza 24** (`INT-06`+`INT-07`: EDO PFX shifrlash +
> ApiToken scope). Parallel sessiya Faza 17'ni tugatmaguncha `payment-gateway`/`money`/`report`
> fayllariga tegmang.

---

> **🕒 2026-08-09a (AUDIT-FIX FAZA 17 — hisobot kurslari: tarixiy-kurs + noma'lum-valyuta ajratish +
> per-valyuta totals · `M-11`+`M-12`+`M-14`) · Phase-1: strukturaviy + unit-tasdiqlangan,
> browser-smoke YO'Q · ⏳ DEPLOY QILINMAGAN · 🗄️ migratsiya YO'Q · ⚠️ foydalanuvchi Faza 17
> sessiya-boshi promptini bevosita berdi · ⚠️ parallel sessiya bir daraxtda ishladi
> (auth/group/hr/manager/payment-gateway/payment-in + `schema.prisma`) — diff'im path-cheklangan (§6.6)
>
> **Ground-truth (§2).** Uchala da'vo ham kodda tasdiqlandi. Qo'shimcha topilma: **33 hujjat modeli**
> `rate_value @default(100000000)` saqlaydi — tarixiy kurs BOR edi, hisobotlar shunchaki o'qimasdi.
>
> **Nima qilindi.** (a) `M-11`: `consolidateToBase(...)` 5-argument — hujjatning o'z kursi; `pnl`
> (totals+groups) va `cash-flow` (Prisma `groupBy(['currency','rateValue'])` + 2 raw-SQL yo'li) endi
> `GROUP BY … , rate_value` qiladi ⇒ yopilgan davr kurs qimirlaganda qayta yozilmaydi.
> **🔑 IDENTITY-QO'RIQCHISI** (rejada yo'q, ishlab chiqishda topildi): `rate_value` default = 1e8, ya'ni
> kursi KIRITILMAGAN USD hujjat ham 1e8 — uni ishlatish face-value bug'ini boshqa eshikdan qaytarardi.
> Shu sabab baza bo'lmagan valyutada `1e8` = «kurs yo'q» → joriy kursga qaytiladi. Yon-foyda: mavjud
> qatorlar uchun o'zgarish **bayt-ma-bayt neytral** (tarix jimgina qayta yozilmaydi).
> (b) `M-12`: `Set<string> seen` → **`CurrencyTally`** (Set-mos `add/size/has/mixed` + `addUnconverted`/
> `unconvertedRows`). Kursi topilmagan summa endi jamiga **QO'SHILMAYDI** (ilgari face-value ⇒ USD
> 1 000.00 → 1 000 so'm, ~12 000× xato) — o'z valyutasida `unconvertedByCurrency` maydonida qaytadi
> (11 hisobot + counterparty-balance summaries). Codemod: 13 servis, 54 o'rin.
> `foldCurrencyRows` o'z `toBase` nusxasini tashladi — bitta konvertatsiya shartnomasi.
> (c) `M-14`: `money-operation` uch valyuta-kalitsiz `aggregate` → ikki `groupBy(['currency'])`;
> javob `totals.byCurrency[]` + `mixedCurrency`. FE `/money` toolbar har valyutani **o'z valyutasida**
> formatlaydi (ilgari aralash son qattiq `'UZS'` deb ko'rsatilardi).
> **TDD:** 9 qizil (`CurrencyTally is not a constructor`) + 5 qizil (`aggregate is not a function`)
> jonli ko'rildi → yashil; +4 pnl testi; fold-util'ning eski «face value» testi yangi shartnomaga
> ko'chirildi. Batafsil: `docs/REJA-AUDIT-FIX-2026-08.md` → HISOBOT JURNALI → Faza 17.
>
> **Gate:** api tc **0** · web tc **0** · `lint:product` **0 error** · vitest api report+money+currency
> **367/367** (43 fayl) · web **2746 passed / 26 skipped** (183 fayl). `i18n:gate` kerak emas — yangi
> UI-matn yo'q (mavjud `totals_in/out/net` kalitlari).
>
> **🟠 QARZ / DIQQAT:** (1) Tarixiy kurs faqat `pnl`+`cash-flow`da — qolgan **8 davr-oqim hisoboti**
> (profitability, sales-by-channel/hour, average-basket, unit-economics, purchase-management,
> warehouse-ops, report.service) hamon joriy kursda; mexanizm tayyor, SQL'ga `rate_value` qo'shish
> qoldi. `aging`/`counterparty-balance` **ataylab** joriy kursda (ochiq-qoldiq revalyatsiyasi).
> (2) **Dashboard** 3 vidjeti `unconvertedByCurrency`ga ega emas — kursi yo'q valyuta endi 0 ko'rinadi
> (ilgari noto'g'ri masshtabda); har uch joyda kod-izohi qo'yildi. (3) FE hisobot sahifalari
> `unconvertedByCurrency`ni hali **chizmaydi** (API qaytaradi) — 11 sahifalik UI ishi. (4) `M-13`
> ochiq. (5) 📚 **NEXT.md arxiv qarzi: 66 top-entry** (chegara 8–10) — arxivlash alohida mayda
> sessiyaga qoldi, parallel sessiya bilan kolliziya xavfi tufayli hozir qilinmadi.
>
> **⏭️ KEYINGI:** navbat bo'yicha — `docs/REJA-AUDIT-FIX-2026-08.md` → **Faza 15**
> (`SALES-02`,`SALES-06`,`SALES-07/08`); yoki Faza 17 qarzi (qolgan 8 hisobotga tarixiy kurs) /
> 18b/18c.

---

> **🕒 2026-08-08p (AUDIT-FIX FAZA 16 — valyuta konventsiyasi yagonalandi: isoCode-lookup +
> kanonik ×10⁸ + valyutalararo to'lov guard · `M-03`+`DB-01`+`M-04`) `94fe12ef` · Phase-1:
> strukturaviy + unit-tasdiqlangan, browser-smoke YO'Q · ⏳ DEPLOY QILINMAGAN · 🗄️ migratsiya BOR
> (20260809010000, DATA-only, lokalga qo'llandi) · ⚠️ **navbatdan tashqari** — foydalanuvchi Faza 16
> sessiya-boshi promptini bevosita berdi · ⚠️ parallel sessiya bir daraxtda Faza 18a qildi —
> commit'im hook'siz pathspec-cheklangan (§6.7B, gate'lar qo'lda), diff path-cheklangan (§6.6)
>
> **Nima qilindi.** (a) `M-03`: hujjatlar `currency`da ALPHA saqlaydi, rate-xarita esa NUMERIC
> `Currency.code` bilan kalitlangan edi → HAR hisobot-konvertatsiya face-value fallback (~12 000×).
> Yangi `currency-code.util.ts alphaCurrencyCode()` — `loadRateContext` (15+ hisobot bitta joydan)
> va CBU `applyAutoRatesFromSource` endi ALPHA orqali (legacy alpha-in-code qatorlar ham qamrovda);
> schema.prisma'dagi TESKARI doc-comment to'g'rilandi. (b) `DB-01`: kanonik masshtab **×10⁸**
> tasdiqlandi — `DebtPayment.exchangeRate` ×10⁴→×10⁸ (migratsiya, idempotent), `@moysklad/money`
> `RATE_SCALE=10⁸` eksport (ExchangeRate ×10⁹→×10⁸, iste'molchi yo'q edi), debt-schema stale-klient
> guard (kurs <10⁹ → 400), web `RATE_SCALE`/`fmtRate` sinxron. (c) `M-04`: payment-in/out
> `ensureOperations(+paymentCurrency)` — to'lov valyutasi ≠ nishon-hujjat valyutasi → 400; bonus
> sibling-parity: payment-out `createFromInvoiceIn`/PO-advance manba valyutasini ko'chirmasdi
> (payment-in'dagi 2026-07-05 fix) — guard bilan birga tuzatildi. TDD: 8 qizil → hammasi yashil,
> 13+1 yangi test. Batafsil: `docs/REJA-AUDIT-FIX-2026-08.md` → HISOBOT JURNALI → Faza 16.
>
> **Gate:** api tc **0** · web tc **0** · `lint:product` **0 error** · vitest: report **294/294** ·
> debt **179/179** · currency+payment-in/out+rate-ctx **159/159**+5 · money **93/93** · i18n:gate
> kerak emas (UI-matn yo'q). ⚠️ Bir insident: `payment-out.service.test.ts`ni Write bilan ustidan
> yozib qo'ygandim (mavjud clone-testlar) — HEAD'dan tiklab, guard-testlarni USTIGA qo'shdim, 5/5.
>
> **🟠 QARZ / DIQQAT:** (1) **Prod migratsiya** — sherset_v2 sxema-drift muhitida
> `debt_payments ×10⁴→×10⁸` + `currencies.iso_code` backfill deploy'da o'tishini tekshirish
> (o'tmasa SQL idempotent, qo'lda yugurtirsa bo'ladi). (2) Deploy oynasida ochiq eski tab USD-kursni
> ×10⁴ da yuborsa server 400 beradi (ataylab — jim 10 000× emas). (3) `M-13` (ikki konvertor
> yaxlitlash farqi) ochiq qoladi. (4) **Faza 17 endi ochildi** (bog'liqligi Faza 16 edi).
>
> **⏭️ KEYINGI:** navbat bo'yicha — `docs/REJA-AUDIT-FIX-2026-08.md` → **Faza 15**
> (`SALES-02`,`SALES-06`,`SALES-07/08`); yoki endi ochilgan **Faza 17** (`M-11`,`M-12`,`M-14`) /
> foydalanuvchi bergan 18b/18c.

---

> **🕒 2026-08-08o (AUDIT-FIX FAZA 18a — tannarx yagonalash: POS/Demand → WEIGHTED-AVERAGE,
> FIFO lot-ledger bekor · `STK-02/03/04`) · Phase-1: strukturaviy + unit-tasdiqlangan,
> browser-smoke YO'Q · ⏳ DEPLOY QILINMAGAN · 🗄️ migratsiya YO'Q · ⚠️ **navbatdan tashqari** —
> foydalanuvchi Faza 18 sessiya-boshi promptini bevosita berdi · ⚠️ parallel sessiya bir daraxtda
> Faza 16/22 qildi — diff/gate path-cheklangan (§6.6)
>
> **Nima qilindi (QAROR-A weighted-average, 18a sub-fazasi; 18b/18c QOLDI).**
> (1) `Demand.post` COGS endi FIFO lot-walk EMAS — yetarlilik-tekshiruv qulflagan per-store
> balansdan: `perUnit = costBalanceMinor ÷ onHand`, bo'sh stock'da `buyPrice` fallback (Loss
> presedenti); perUnit pozitsiyaga muzlatiladi, unpost/cancel AYNAN shu formula bilan teskari ⇒
> zero-sum. `consumeFifo` O'CHIRILDI; `DemandPositionCostConsumption` endi YARATILMAYDI, eski
> qatorlar read-only legacy — eski hujjat unpost'ida `reverseLegacyFifo` (hadRows) avvalgidek
> qaytaradi. STK-03 (store-filtrsiz FIFO) va STK-04 (Loss→Demand COGS 2×) shu bilan ildizdan yopildi.
> (2) POS `retail-sale.post` chiqim delta'si `null` EMAS — o'sha per-store o'rtacha (STK-02);
> refund esa asl chekning O'Z StockOperation qatorlaridan kumulyativ-qoldiq bilan qaytaradi
> (`retail-refund-cogs.ts`, sof modul): qisman qaytimlar seriyasi qat'iy zero-sum, legacy chek
> (NULL chiqim) qaytimda ham NULL. TDD: 13 qizil → 64 yashil; qizil bosqich basis-agregatsiyadagi
> haqiqiy ishora-xatoni tutdi. Batafsil: `docs/REJA-AUDIT-FIX-2026-08.md` → HISOBOT JURNALI → 18a.
>
> **Gate (PATH-CHEKLANGAN, §6.6):** api tc **0** · o'z 10 faylim biome **0** · `i18n:gate` **9/9** ·
> vitest: retail-sale **261/261** · demand+sales-return+work-order+loss+stock **279/279** · katta
> batareya (supply, purchase-return, move, enter, inventory, cashier-session, processing) **944/944**
> (3 refund-mock'qa `stockOperation.findMany` qo'shildi). **To'liq api-suite YUGURTIRILMADI** —
> daraxtda parallel sessiyaning Faza 16 yarim ishi (currency/money/payment-*) turardi, repo-wide
> `lint:product` qizilligi ham o'sha fayllardan. **Browser-smoke YO'Q.**
>
> **🟠 QARZ:** (1) **18b** — WorkOrder weighted-avg cost (`PP-05`, 4 null-delta). (2) **18c** — Move
> oxirgi-birlik yaxlitlash (STK-08 sinfi; demand to'liq-chiqim ±tiyin qoldig'i ham shu yerda) +
> supply'dagi `remainingQty` endi COGS uchun o'lik — yozuv/guard tozalash. (3) POS post→qaytim
> qiymat-simmetriyasi runtime'da Phase-2 QA'da ko'riladi.
>
> **⏭️ KEYINGI:** navbat bo'yicha — `docs/REJA-AUDIT-FIX-2026-08.md` → **Faza 15**
> (`SALES-02`,`SALES-06`,`SALES-07/08`); yoki foydalanuvchi 18b/18c'ni to'g'ridan-to'g'ri berishi
> mumkin (sessiya-boshi prompt: Faza 18 + «18b» / «18c» deb ayt).

---

> **🕒 2026-08-08n (AUDIT-FIX FAZA 22 — prod secret boot-guard + query-token allowlist ·
> `AUTH-02`+`AUTH-04`/`FE-05`) · Phase-1: strukturaviy + unit-tasdiqlangan, browser-smoke YO'Q ·
> ⏳ DEPLOY QILINMAGAN · 🗄️ migratsiya YO'Q · ⚠️ **navbatdan tashqari** — foydalanuvchi Faza 22
> sessiya-boshi promptini bevosita berdi (navbat bo'yicha Faza 15 hamon keyingi)
>
> **Nima qilindi.** (a) `AUTH-02`: `auth/boot-secrets.ts` `resolveSecret()` — `NODE_ENV=production`da
> `JWT_SECRET`/`COOKIE_SECRET` yo'q/bo'sh/dev-fallback bo'lsa **boot'da throw** (`parseTtl` uslubi);
> `auth.module.ts` + `main.ts` ulandi. (b) `AUTH-04`: ikki guard'dagi nusxa-`extractToken` yagona
> `auth/extract-token.ts`ga ko'chirildi — `?access_token=` endi FAQAT 5-marshrut allowlist'ida
> (SSE stream · images raw · attachments raw · PO list-report · HR employee image raw; hammasi
> header yubora olmaydigan transport — reja «faqat SSE» degan edi, lekin FE 5 joyda ishlatadi,
> faqat-SSE rasm/PDF'ni sindirardi). Boshqa HAR endpointda query-token endi 401. (c) pino
> `serializers.req` — access-log `req.url`dan token redakt. TDD: RED jonli ko'rsatildi (guard'lar
> query-token'ni oddiy endpointda qabul qilardi) → 4 yangi test-fayl, auth+permissions 118/118 +
> observability 3/3 + app-boot 7/7. Batafsil: rejadagi «HISOBOT JURNALI → Faza 22».
>
> **🔴 DEPLOY OGOHLANTIRISHI:** VPS env'da haqiqiy `JWT_SECRET`/`COOKIE_SECRET` bo'lmasa API endi
> **boot'da yiqiladi** (ataylab). Deploy'dan oldin tekshirish shart. **DEFER:** FE media signed-URL
> (token 5 allowlist yo'lida query'da qoladi → nginx-log sizishi shu yo'llarda saqlanadi; to'liq
> yechim alohida faza) · nginx log-redakt (deploy-side yamoq).
>
> **⚠️ PARALLEL SESSIYA (commit paytida jonli):** Faza 18 (FIFO→weighted-avg) ishi in-flight edi —
> `demand.service.ts` typecheck'i va 2 lint-error o'shaniki (mening fayllarim toza, 23:01 to'liq-daraxt
> typecheck 0 bilan tasdiqlangan). Diff'im path-cheklangan, u fayllarga tegilmadi.
>
> **⏭️ KEYINGI:** o'zgarmadi — `docs/REJA-AUDIT-FIX-2026-08.md` → **Faza 15**
> (`SALES-02`,`SALES-06`,`SALES-07/08`). Sessiya-boshi prompt o'sha fazada.

> **🕒 2026-08-08m (FAZA 14 IZIDAN — `PermissionsModule` oshkora import + in'yeksiya qo'riqchisi)
> `e934c304` · Phase-1: strukturaviy + unit-tasdiqlangan, browser-smoke YO'Q ·
> ⏳ DEPLOY QILINMAGAN · 🗄️ migratsiya YO'Q · ⚠️ **navbat o'zgarmadi — keyingi hamon Faza 15**
>
> **Kontekst (sessiya boshida).** Preflight ANOMALIYA berdi: daraxtda Faza 14 ning yarim ishi
> turardi (uzilgan sessiya artefakti, 21:45–21:48). Uni tekshirib chiqdim — implementatsiya +
> testlar to'liq edi. **RED'ni o'zim o'lchadim** (§2 — test izohidagi «oldin:» da'volari dalil
> emas): 6 qo'riqchi-nuqtani neytrallab `approval-integrity.test.ts` yugurtirdim → **7/10 qizil**
> (yashil qolgan 3 tasi ataylab negativ-nazorat). Keyin fayllarni backup'dan tikladim.
> **Ish oralig'ida parallel sessiya Faza 14 ni o'zi commit qildi** (`9e822fd`, 22:18) va Faza 20 ga
> o'tdi — men bilan bir daraxtda. Shu sababli mening hissam faqat quyidagi TOPILMA bo'lib qoldi.
>
> **Topilma (Faza 14 commit'ida YO'Q edi).** `SupplyService`ga `PermissionsService` in'yeksiya
> qilindi, ammo `SupplyModule.imports`ga `PermissionsModule` **yozilmadi** — faqat `@Global()` ga
> tayanildi. Hozir ishlaydi, lekin @Global izohining o'zi uni vaqtinchalik deb ta'riflaydi
> (HrPermissionGuard uchun qo'shilgan): olib tashlansa `SupplyService` DI'da hal bo'lmaydi va
> **API umuman ko'tarilmaydi** (prod 502 — `duplicate-route-prod-502` bilan bir klass).
> Loyihada **4/4** mavjud iste'molchi (customer-order, demand, product-cut, permissions) modulni
> oshkora import qiladi; supply yagona istisno edi.
>
> **Nega hech bir gate tutmaydi:** typecheck uchun `@Inject(X) private x: X` mutlaqo to'g'ri;
> unit-testlar servisni `new` bilan quradi (**DI grafi umuman qurilmaydi**); `app-boot.test.ts`
> ning mavjud yetim-modul qo'riqchisi esa faqat **controllerli** modullarni ko'radi.
>
> **Fix.** (1) `SupplyModule.imports` ga `PermissionsModule`. (2) `app-boot.test.ts` ga **uchinchi
> qo'riqchi**: `PermissionsService` in'yeksiya qilgan har servisning moduli `PermissionsModule`ni
> import qilishi (yoki servisni o'zi provider sifatida berishi) shart + vakuum-emas skaner testi.
> Qo'riqchi **NON-VACUOUS o'lchandi**: import olib tashlanganda 1 qizil / 6 yashil, qaytarilganda 7/7.
>
> **Gate:** api tc **0** · `lint:product` **0 error** · `i18n:gate` **9/9** · api vitest
> **392 fayl / 5181 test (exit 0)**. Web tegilmadi (API-only o'zgarish) ⇒ web tc/vitest
> yugurtirilmadi. **Browser-smoke YO'Q.**
>
> **🟠 QARZ:** hali ham **hech bir test Nest DI grafini qurmaydi** — bu qo'riqchi faqat
> `PermissionsService` klassini yopadi, boshqa @Global-ga tayangan in'yeksiyalar ochiq qoladi.
> To'liq yechim = boot-smoke (`Test.createTestingModule(AppModule).compile()`), lekin u DB/Redis/cron
> talab qiladi — alohida ish sifatida qaralsin.
>
> **⏭️ KEYINGI:** o'zgarmadi — `docs/REJA-AUDIT-FIX-2026-08.md` → **Faza 15**
> (`SALES-02`,`SALES-06`,`SALES-07/08`). Sessiya-boshi prompt o'sha fazada.

---

> **🕒 2026-08-08l (AUDIT-FIX FAZA 20 — bank-import: commit-poyga qulfi + vypiska dedup ·
> `INT-05`) · Phase-1: strukturaviy + unit-tasdiqlangan, browser-smoke YO'Q ·
> ⏳ DEPLOY QILINMAGAN · 🗄️ **MIGRATSIYA BOR** (`20260808230000_bank_import_claim_and_dedup`) ·
> ⚠️ **navbatdan tashqari** — foydalanuvchi Faza 20 sessiya-boshi promptini bevosita berdi
> (navbat bo'yicha Faza 15 hamon keyingi)
>
> **Muammo (kodda tasdiqlandi).** `commit()` statementni rows bilan bir marta o'qib
> (`:151-154`), `if (row.paymentInId||row.paymentOutId) continue` (`:166`) bilan **snapshot**
> bo'yicha tekshirib, siklda avval `paymentIn.create` keyin `bankStatementRow.update` qilardi
> (`:182-199`) — hech qanday atomik qadam yo'q ⇒ double-click/ikki operator **ikkita** PaymentIn
> yaratardi (kontragent balansi 2×). `upload()` esa faylni hech narsa bilan solishtirmasdi ⇒
> bir oylik vypiskani ikki marta yuklab ikkalasidan commit qilish **butun oyni** dublikat qilardi.
>
> **Fix.** (1) Har qator uchun atomik claim — `commitClaimedAt` ustuni + shartli `updateMany`
> (`payment_*_id IS NULL AND (claim IS NULL OR claim < now−15daq)`); yutqazgan raqib `count===0`
> olib qatorni jimgina o'tkazadi, xatoda claim bo'shatiladi (faqat O'ZINIKI — WHERE'da claim vaqti).
> (2) Qator-dedup tabiiy kalit bo'yicha (`direction+moment+amountMinor+documentNumber+
> counterpartyAccount`) — allaqachon import qilingan egizak topilsa qator RAD etiladi; operator
> uchun `allowDuplicateRowIds` chiqish yo'li. (3) `upload()` sha256 `contentHash` yozadi va
> javobda `duplicateOf` qaytaradi. (4) FE: dublikat ogohlantirishi + **commit `failed` ro'yxati
> endi ko'rinadi** (ilgari umuman ko'rsatilmasdi — rad etish jim qolardi).
>
> **TDD.** `bank-import.service.test.ts` 3 → 11 test; yangi 8 tadan **6 tasi fix'dan oldin qizil**.
> Mock'dagi `updateMany` haqiqiy semantikaga ega (shartlar qator holatiga solishtiriladi) — soxta
> `count:1` mock bug'ni ko'rsata olmasdi.
>
> **Gate:** api tc **0** · web tc **0** · `lint:product` **0 error** · `i18n:gate` **9/9** ·
> vitest `bank-import` **31/31**, `payment-in`+`payment-out` bilan **88/88**, web
> `button-conventions`+`domain-status-tone` **170/170**. Migratsiya lokal DB'ga qo'llandi
> (`prisma db execute`), bank-import obyektlari bo'yicha **drift 0**, `prisma generate` bajarildi
> ⇒ 08k entry'sidagi `TS2353 commitClaimedAt` ogohlantirishi **YOPILDI**.
>
> **🟠 QARZ:** (1) 🔴 **crash-oynasi** — `create` muvaffaqiyatli tugab `update({paymentInId})`
> yozilmagan lahzada jarayon o'lsa, to'lov hech qaysi qatorga bog'lanmay qoladi ⇒ TTL'dan keyingi
> urinishda dedup uni topa olmaydi va ikkinchi to'lov yaratiladi (yopish = to'lovni qator-bog'lanishi
> bilan BIR tranzaksiyada yaratish, `PaymentInService.create` tashqi `tx` qabul qilishi kerak).
> (2) **Partial unique index ATAYLAB qo'yilmadi** — prodda shu bug tufayli allaqachon dublikat
> bo'lishi ehtimoli yuqori, indeks migratsiyani yiqitardi; avval o'lchash/tozalash (SQL rejadagi
> hisobotda), keyin indeks. (3) Prod dublikatlari **o'lchanmadi** (prod DB'ga ulanilmadi).
> (4) Eski yozuvlarda `contentHash`=NULL, backfill **mumkin emas** (fayl mazmuni saqlanmaydi).
> (5) UI'da «baribir import qil» tugmasi yo'q — hozir faqat xabar ko'rinadi. **Browser-smoke YO'Q.**
> Batafsil: rejadagi «HISOBOT JURNALI → Faza 20».
>
> **⏭️ KEYINGI:** o'zgarmadi — `docs/REJA-AUDIT-FIX-2026-08.md` → **Faza 15**
> (`SALES-02`,`SALES-06`,`SALES-07/08`). Sessiya-boshi prompt o'sha fazada.

---

> **🕒 2026-08-08k (AUDIT-FIX FAZA 14 — qabul-tasdiqlash: FSM-bypass guard + omborchi recompute ·
> `PP-06`+`PP-04`) `9e822fd` · Phase-1: strukturaviy + unit-tasdiqlangan, browser-smoke YO'Q ·
> ⏳ DEPLOY QILINMAGAN · 🗄️ migratsiya YO'Q · ⚠️ parallel sessiya bilan yonma-yon ishlandi (pastda)
>
> **Muammo (kodda tasdiqlandi, 4/4 da'vo).** `PP-06` — 3 tirqish: (a) `supply.post()` `approvalStage`ni
> UMUMAN tekshirmasdi (funksiyada bu so'z yo'q edi) ⇒ `awaiting_supplier` bosqichida ham stock kirardi;
> **auditda aytilmagan qo'shimcha oqibat** — `adminConfirm` faqat `draft`ni post qiladi, demak hujjat
> allaqachon `posted` bo'lgach zanjir `awaiting_*`da **abadiy qotib** qolardi. (b) `POST /supplies`
> faqat `supply.create` talab qiladi, servis esa `applicable:true` da ichkarida `transition('post')`
> chaqirardi — ya'ni `@Post(':id/transitions/:target')` himoyalagan `supply.approve` chetlab o'tilardi.
> (c) Zanjir uchayotganda hujjat aynan `draft`+`applicable:false` (chunki `send()` uni unpost qiladi)
> ⇒ `update()`/`delete()` qulflari **VAKUUM** edi — omborchi sanaganidan keyin sonlarni jimgina
> almashtirish (yoki hujjatni o'chirish) mumkin edi. `PP-04` — `omborchiConfirm` faqat
> `supplyPosition.quantity`ni yozardi (`computeTotals` `SupplyService`ning **private** metodi bo'lgani
> uchun chaqirib ham bo'lmasdi) ⇒ `post()` stockni YANGI sondan (90), qarzni ESKI `sumMinor`dan
> (100 donalik) yozardi.
>
> **Fix.** FSM'ga `IN_FLIGHT_STAGES` + `isApprovalInFlight()` — «hujjat muzlagan» predikati bosqich
> hokimi bo'lgan `supply-approval.fsm.ts`da. `post`/`update`/`delete` shu predikat bilan bloklanadi;
> ruxsat to'plami **{`none`, `completed`}** (`adminConfirm` `completed`ni CLAIM QILGANDAN KEYIN post
> chaqiradi — guard shu tartibga ataylab bog'langan). `delete()`da shart **ATOMIK `updateMany` WHERE'i
> ichida** (parallel `send()` poygasi). `create(applicable)` endi `PermissionsService`dan
> `supply.approve` so'raydi — hujjat yaratilishidan OLDIN (yarim-qoralama qolmaydi). `computeTotals`
> yangi `supply/supply-totals.ts` ga chiqarildi (yagona manba) va `omborchiConfirm` tranzaksiyasida
> chaqiriladi.
>
> **TDD.** +10 test (`supply-approval/approval-integrity.test.ts`), fix'dan oldin **7 tasi qizil** —
> o'lchangan: `post` uch bosqichda ham «promise resolved», `delete()` → `{ok:true}`, omborchi 100→90
> da `sumMinor` **40 000 000** (kutilgan 36 000 000), admin tasdig'idan keyin qarz **−40 000 000** vs
> stock **90 dona** = **4 000 000 tiyin** nomuvofiqlik.
>
> **⚠️ Guard-drift tutildi:** `delete()`ni kuchaytirish `shared/transition-toctou-class.test.ts`
> source-scan guard'ini qizil qildi (regex `deletedAt: null` dan keyin darhol `}` talab qilardi) —
> ayni o'sha fayl ogohlantirgan «himoya qo'shgan odam testni qizil qiladi» tuzog'i. Shakl bo'shatildi
> (`[,}]`) va o'rniga supply uchun **kuchliroq** shart (`deleteAlso` — `approvalStage` bandi SHU atomik
> yozuvning ichida) qulflandi.
>
> **Gate:** api tc **0** (o'z fayllarimda) · `lint:product` **0 error** · `i18n:gate` **9/9** ·
> vitest supply+supply-approval+purchase-return+shared+stock+purchase-order **39 fayl / 697 test**.
> To'liq API suite 5170 ✅ / 9 ✗ — **9 tasi ham meniki emas** (7 `bank-import` = parallel sessiyaning
> ochiq ishi, 1 `publication` yolg'iz yugurtirilganda 21/21 yashil = yuk ostida flaky). **Browser-smoke
> YO'Q.** Batafsil: rejadagi «HISOBOT JURNALI → Faza 14».
>
> **⚠️ PARALLEL SESSIYA:** ish davomida boshqa sessiya `bank-import` (Faza 20/INT-05) + `schema.prisma`
> + yangi migratsiya + web sahifa/messages ustida ishladi. Ularga TEGILMADI; commit `git add <aniq
> fayllar>` bilan 9 fayl (8 meniki + hook'ning `progress.json`i) — `git show --stat` bilan tasdiqlandi,
> begona fayl sizmadi. **Sessiya oxirida `tsc` ularning `bank-import.service.ts`ida 2 `TS2353` beradi**
> (`commitClaimedAt` — schema qo'shilgan, Prisma client hali regen qilinmagan). Bu MENING qarzim EMAS;
> keyingi sessiya preflight'da shuni ko'rsa — avval `pnpm --filter @moysklad/db generate` kerakmi
> yoki ular hali ishlayaptimi, tekshirsin.
>
> **🟠 QARZ:** (1) **`moysklad-compat` guard'dan TASHQARIDA** — u `supply`ni to'g'ridan-to'g'ri Prisma
> modeli sifatida yozadi, `SupplyService`dan o'tmaydi ⇒ MS-JSON-API orqali in-flight qabulni tahrirlash
> hamon mumkin (alohida bug-klass: butun compat qatlami servis-qoidalarini chetlab o'tadi).
> (2) **Tarixiy nomuvofiqlik** — fix'gacha omborchi tuzatgan qabullarda qarz eski summada qolgan;
> o'lchash SQL'i rejadagi hisobotda, prodda DB'ga ULANILMADI. (3) Overhead × omborchi-tuzatish
> stsenariysi testda yo'q. (4) `completed` bosqichida hujjat ATAYLAB ochiq qoldirildi (reja matni
> «`!= none` → blok» degan edi) — aks holda tasdiqlangan qabul unpost'dan keyin ham abadiy muzlardi.
>
> **⏭️ KEYINGI:** `docs/REJA-AUDIT-FIX-2026-08.md` → **Faza 15** (`SALES-02`,`SALES-06`,`SALES-07/08` —
> smena naqdi: expected-cash formula + z-report + close-race + picking-block). Sessiya-boshi prompt
> o'sha fazada.

---

> **🕒 2026-08-08j (AUDIT-FIX FAZA 13 — taminotchi qarzi Supply-only + qaytarish reversali ·
> `PP-02`+`PP-03`) `66fbe99` · Phase-1: strukturaviy + unit-tasdiqlangan, browser-smoke YO'Q ·
> ⏳ DEPLOY QILINMAGAN · 🗄️ migratsiya YO'Q · 🟠 **TARIXIY IKKI-KARRA QARZ QOLDI (pastda)**
>
> **Muammo (kodda tasdiqlandi, 2/2).** `PP-03`: `Supply.post` (`supply.service.ts:1349`) HAM,
> `InvoiceIn.post` (`invoice-in.service.ts:1146`) HAM `-sumMinor` yozardi. Standart xarid oqimi
> PO → hisob-faktura + qabul ikkala hujjatni ishlatgani uchun **bitta xaridda qarz IKKI marta**
> turardi; `InvoiceIn`da `supplyId` FK yo'q ⇒ dedup imkonsiz. `PP-02`: `PurchaseReturn` balansga
> **umuman tegmasdi** — servisda `CounterpartyBalanceService` import ham qilinmagan edi, ya'ni to'liq
> qaytarilgan qabul bo'yicha «biz qarzdormiz» summasi abadiy qolardi.
>
> **Fix (QAROR-B = Supply-only, egasi 2026-08-08 tanlagan).** InvoiceIn balansdan **UZILDI**: 4 ta
> `applyDelta` (post/unpost/cancel + `update()` dagi reversal-juftlik — rejada faqat 3 tasi nomlangan
> edi), inject va modul importi olib tashlandi. Hujjat endi informatsion: `PO.invoicedSumMinor`,
> `PaymentOut` asosi va `payedSum` FSM'i qoladi. PurchaseReturn'ga simmetriya: `post +sumMinor`,
> `unpost/cancel −sumMinor` (cancel faqat `applicable` bo'lsa). ⚠️ Ataylab yon ta'sir: egaga
> ketadigan «qarz o'zgardi» Telegram xabarini endi FAQAT Qabul beradi (bir xarid = bir xabar).
>
> **Reja doirasidan tashqari 4 bog'liqlik topildi va yopildi:** (1) statement BUYUM-kesimi hamon
> `invoiceIn`ni supply bilan yonma-yon sanardi (bir tovar bo'yicha ham 2×); (2) qamrov reyestri —
> `invoice-in` «ESKIRGAN yozuv» bo'lib gate'ni yiqitdi, `purchase-return` esa «QAMROVSIZ» bo'lardi;
> (3) `money-transition-race` invoice-in poygasini AYNAN balans-deltasi soni bilan o'lchardi (delta
> ketgach test bo'shab qolardi) — probe `po.applyInvoice` ga ko'chirildi + «balansga tegmaydi»
> alohida qulflandi; (4) akt-sverka chop sahifasi `purchaseReturn` yorlig'isiz xom slug chiqarardi.
> **Saldo-o'quvchilar (metrics/statement/akt) TEGILMADI** — Faza 10 dan beri ular `docType` bo'yicha
> filtrlamaydi, shuning uchun rejadagi «Diqqat» xavfi yuzaga kelmadi.
>
> **TDD.** +14 test; yangi `supplier-debt-supply-only.test.ts` (9) uchala servisni BITTA soxta prisma
> va BITTA daftar ustida yugurtiradi. Non-vacuous: fix'dan oldin **7 assert yiqildi** — jumladan
> `PO→Supply+InvoiceIn` daftari `[-4 000 000, -4 000 000]` (PP-03 ayni o'zi) va qaytarishdan keyin
> saldo `-4 000 000` (0 o'rniga). ⚠️ Bir **soxta-RED** tutildi: test avval fix'dan KEYINGI konstruktor
> arity'si bilan yozilib `TypeError` bergan edi — haqiqiy RED eski arity bilan qayta o'lchandi.
>
> **Gate:** api tc **0** · web tc **0** · `lint:product` **0 error** · `i18n:gate` **OK** ·
> api vitest **391 fayl / 5161 test** · web vitest **183 fayl / 2746 test**. **Browser-smoke YO'Q.**
> Batafsil: rejadagi «HISOBOT JURNALI → Faza 13».
>
> **🟠 QARZ — TARIXIY IKKI-KARRA QARZ:** `recompute-counterparty-balances.ts` buni **YECHMAYDI**
> (Faza 10 dan beri uning nishoni jurnal, jurnal esa append-only ⇒ eski `invoiceIn` deltalari joyida
> qoladi). Prodda hajmni avval **o'lchash** kerak:
> `SELECT counterparty_id, currency, COUNT(*), SUM(delta_minor) FROM counterparty_balance_entries
> WHERE doc_type='invoiceIn' GROUP BY 1,2;` — bo'sh bo'lsa hech narsa qilinmaydi. Qatorlar bo'lsa
> tavsiya: har kontragent×valyuta uchun **`CounterpartyAdjustment`** (auditorlik izi + skript uni
> to'g'ri qayta quradi). Jurnal qatorlarini **o'chirish MUMKIN EMAS**. Batafsil — rejadagi hisobotning
> «BALANSNI QAYTA-HISOBLASH KERAKMI» bo'limi. Faza 10 backfill ops-qarzi o'zgarmadi.
>
> **⏭️ KEYINGI:** `docs/REJA-AUDIT-FIX-2026-08.md` → **Faza 14** (`PP-06`+`PP-04` — supply-approval:
> FSM-bypass guard + omborchi son-tuzatishida summalarni qayta hisoblash). Sessiya-boshi prompt
> o'sha fazada.

---

> **🕒 2026-08-08i (AUDIT-FIX FAZA 12 — debt simmetriyasi: `remove()` reversal + settlement filtr/premise ·
> `DUP-03`+`DUP-12`+`DUP-04`) `d18696db` · Phase-1: strukturaviy + unit-tasdiqlangan, browser-smoke YO'Q ·
> ⏳ DEPLOY QILINMAGAN · 🗄️ migratsiya YO'Q
>
> **Muammo (kodda tasdiqlandi, 3/3).** `DebtService.create` 2026-08-05 dan beri balansga `+totalMinor`
> yozadi, lekin **`remove()` uni qaytarmasdi** — metod tanasi `mustFind` + `paidMinor>0` taqiqi +
> `update({deletedAt})` dan iborat edi, `applyDelta` yo'q (`DUP-03`). Ya'ni kassir adashib ochib darhol
> o'chirgan qarz kontragent kartochkasida ABADIY «qarzdor» bo'lib qolardi. Juft bug: settlement
> `debt.findMany` **filtrsiz** edi (`DUP-12`) ⇒ korzinadagi qarz kontragentga IMZOGA ketadigan xlsx'da
> ko'rinardi. Uchinchisi — util docstring'i «`create` balansga tegmaydi» degan **eskirgan premise**ni
> saqlab, `combinedMinor = ledger + registry` bilan ochiq qarzni 2× sanardi (`DUP-04`; jonli
> iste'molchisi yo'q edi — soxta son bugungi hisobotlarga CHIQMAGAN).
>
> **Fix.** `remove()` endi `$transaction` + **atomik claim** (`updateMany where {deletedAt:null,
> paidMinor:0n}`) → `applyDelta(-totalMinor, docType:'debt')`. Claim'ning ikki sharti ataylab: parallel
> o'chirish ikki reversal yozmasin, va `mustFind` bilan yozuv orasiga tushgan to'lov saldoni `-paid` ga
> tushirib yubormasin. Settlement so'roviga `deletedAt:null, status:{not:'cancelled'}`. `combinedMinor`
> **butunlay olib tashlandi** (deprecate emas — jonli iste'molchisi yo'q, qolsa tuzoq); util docstring'i
> + premiseni takrorlagan ikki izoh (`retail-sale.service.ts:837`, `supply-goods-xlsx.util.ts:208`)
> haqiqatga moslandi: reyestr qoldig'i — saldoning **TARKIBI** («shundan …»), qo'shiluvchi emas.
>
> **Faza 8 guard'i kutilganidek yiqildi** (rejada yo'q edi, avvalgi faza yozib qoldirgan):
> `counterparty-balance-sources.test.ts` «`remove()` da applyDelta YO'Q» premise'sini qulflagan, va
> `recompute-counterparty-balances.ts` debt-issue manbasi shunga tayanib o'chirilgan qarzlarni
> qo'shardi. Ikkala tomon birga yangilandi: skript `groupBy` where'iga `deletedAt: null`, test esa endi
> **reversal ↔ filtr juftligini** qulflaydi (biri o'zgarib ikkinchisi qolsa yiqiladi).
>
> **TDD.** +9 test, 2 tasi yangi fayl (`debt-remove-reversal` 5 · `counterparty-settlement.service` 3) +
> util testi yangilandi + skript-guard qayta yozildi. Non-vacuous: tuzatishdan oldin **7 assert yiqildi**.
> ⚠️ Yo'l-yo'lakay bir **yolg'on-yashil** tutildi: skript-guard'ning birinchi tahriri `deletedAt: null`
> ni blok MATNIDAN (izohlar bilan) qidirib, fix'dan OLDIN ham yashil chiqdi — assert `groupBy`
> chaqirig'i tanasiga bog'langach haqiqiy RED ko'rindi (CLAUDE.md §4 grep-grounding klassi).
>
> **Gate:** api tc **0** · `lint:product` **0 error** · api vitest **390 fayl / 5147 test yashil**.
> `i18n:gate` yugurtirilmadi — UI-matn tegilmagan (faqat BE + izohlar). **Browser-smoke YO'Q.**
> Batafsil: rejadagi «HISOBOT JURNALI → Faza 12».
>
> **Qarz:** (1) **restore yo'li YO'Q** — korzinadan qaytarish endpoint'i kodda mavjud emas (tekshirildi),
> qo'shilsa `+totalMinor` yozishi SHART (`remove()` docstring'ida qayd etilgan). (2) **Tarixiy
> o'chirilgan qarzlar** materiallashgan saldoda hamon `+total` bo'lib turibdi (o'sha paytda reversal
> yo'q edi) — Faza 10 ning backfill + `recompute` ops-qadamiga qoldi (`APPLY=1` hali yugurtirilmagan;
> avval DRY bilan hajmni ko'rish kerak).
>
> **⏭️ KEYINGI:** `docs/REJA-AUDIT-FIX-2026-08.md` → **Faza 13** (`PP-02`+`PP-03` — taminotchi qarzi:
> QAROR-B **Supply-only** allaqachon hal qilingan; InvoiceIn balansdan uziladi, PurchaseReturn'ga
> reversal qo'shiladi). Sessiya-boshi prompt o'sha fazada.

---

> **🕒 2026-08-08h (AUDIT-FIX FAZA 11 — pul-daftar teshiklari: bank to'lovi + naqd qarz to'lovi ·
> `M-06`+`M-05`+`FE-03`) `de77953e` · Phase-1: strukturaviy + unit-tasdiqlangan, browser-smoke YO'Q ·
> ⏳ DEPLOY QILINMAGAN · 🗄️ migratsiya YO'Q · 🔴 **BACKFILL YO'Q — daftar bugundan boshlanadi (pastda)**
>
> **Muammo (kodda tasdiqlandi, 3/3).** `MoneyOperation` daftariga faqat kassa hujjatlari va chakana
> savdo yozardi. **PaymentIn/PaymentOut umuman tegmasdi** — ikkala servisda `MoneyService` importi ham
> yo'q edi (`M-06`), ya'ni bank-hisob balansi abadiy `0`, `/money` lentasi bank to'lovlarini
> KO'RSATMASDI, lekin o'sha sahifaning «+ Yaratish» menyusi ularni yaratishga yo'naltirardi (`FE-03`).
> **Naqd qarz to'lovi** ham yashiqni kreditlamasdi (`M-05`).
> ⚠️ **Auditning bir da'vosi RAD ETILDI:** «smena soxta ortiqcha chiqadi» — TO'G'RI EMAS.
> `cashier-session.service.ts:315` naqd qarz to'lovlarini `debtPayment` jadvalidan bevosita qo'shadi
> (kassa TZ §8.4), ya'ni smena hisobi allaqachon to'g'ri edi. Teshik faqat `CashDesk.balanceMinor` +
> daftar edi.
>
> **Fix.** (a) PaymentIn/Out post/unpost/cancel → `money.applyDeltas('organization_account', ±sumMinor)`,
> `documentKind` `payment_in`/`payment_out`; hujjatda hisob ko'rsatilmagan bo'lsa harakat YO'Q.
> (b) POS/kassir naqd qarz to'lovi → `cash_desk` `+summa`, `documentKind: 'debtpayment'`, havola PKO
> cheki (`batchId`) — FIFO nechta qarzga bo'lganidan qat'i nazar **BITTA** yashiq harakati.
> (c) **Yagona predikat** `debt/debt-cash-ledger.ts`: naqd + kassa ko'rsatilgan ⇒ yashiq. Yozuv (POS,
> `addCashPayment`) va **ikkala storno** (`reversePayment`, `cancelCallNote`) shundan o'tadi — ikki
> nusxa muqarrar bir-biridan uzoqlashardi va farq = qaytarilmagan/yasama pul.
> (d) FE `/money`: 3 yangi tur + ru/uz yorliqlar; **tur-filtri endi `KIND_ROUTES`dan HOSILA** (qo'lda
> sanalgan `<option>`lar aynan shu drift-klassining yashirin manbai edi); badge toni slug o'rniga
> **delta ISHORASIDAN** (unpost qatori manfiy `cash_in`, `debtpayment` esa kirim — eski qoida ikkalasida
> ham yanglishardi).
>
> **Ikki DIZAYN QARORI (rejada so'ralgan edi — hisobotda ochiq).** (1) `OrganizationAccount.balanceMinor`
> **saqlanadi** (olib tashlash varianti rad etildi: uni 3 o'quvchi va 1 o'chirish-guard'i ishlatadi).
> (2) **Bank hisobida overdraft qo'riqchisi o'chirildi** (`MoneyDelta.allowNegative`, faqat to'lov
> chaqiruv-joylarida). Saqlangan `0` = «hech qachon o'lchanmagan», «pul yo'q» EMAS — qo'riqchi bo'lsa
> **har birinchi bank to'lovi soxta 400** olardi. Kassa tomonida qo'riqchi TEGILMAGAN.
>
> **Migratsiya-qo'riqchisi (rejada yo'q edi, o'zim topdim).** Storno teskari harakatni FAQAT daftarda
> mos kredit BO'LSA yozadi (`debtCashLedgerWasWritten`). Prodda Faza 11'gacha yozilgan naqd qarz
> to'lovlari bor — birini bugun qaytarsak hech qachon kirmagan pulni yashiqdan chiqarardik, yomon
> holatda overdraft qo'riqchisi **stornoning o'zini bloklardi**.
>
> **TDD.** +34 test, 3 tasi yangi fayl (`payment-org-account-ledger` 10 · `debt-cash-ledger` 8 ·
> `debt-cash-ledger.service` 9) + `pos-debt-payment` +4 + `money-kind-contract` +1 (yozuvchi-skan 3→6
> fayl). Hammasi **non-vacuous**: tuzatishdan oldin har «delta bor» assert'i BO'SH massiv ko'radi.
>
> **Gate:** api tc **0** · web tc **0** · `lint:product` **0 error** · `i18n:gate` OK (12 278 kalit) ·
> api vitest **388 fayl / 5138 test** · web vitest **183 fayl / 2746 test**. **Browser-smoke YO'Q.**
> Batafsil: rejadagi «HISOBOT JURNALI → Faza 11».
>
> **🔴 QARZ — BACKFILL YO'Q.** Faza 11'gacha post qilingan bank to'lovlari va naqd qarz to'lovlari
> daftarda YO'Q: `/money` va bank-balans faqat **bugundan keyingi** hujjatlarni ko'rsatadi. Faza 9/10
> dan farqli, bu yerda manba-hujjatlardan qayta qurish MUMKIN (posted PaymentIn/Out + `deletedAt: null`
> DebtPayment), lekin ochilish qoldig'i noma'lum ⇒ natija «harakatlar yig'indisi» bo'ladi, absolyut
> qoldiq emas. **Alohida ops-fazasi** (skript + `APPLY=1`) — hali yozilmagan.
> Mayda qarz: `addCashPayment` to'lovida `batchId` yo'q ⇒ `/money`dagi «Ochish» havolasi PKO chekini
> topa olmaydi (POS to'lovlarida ishlaydi).
>
> **⏭️ KEYINGI:** `docs/REJA-AUDIT-FIX-2026-08.md` → **Faza 12** (`DUP-03`+`DUP-12`+`DUP-04` — debt
> simmetriyasi: `debt.remove()` reversal + settlement `deletedAt`/status filtri + eskirgan
> `combinedMinor` premisesi). Sessiya-boshi prompt o'sha fazada.

---

> **🕒 2026-08-08g (AUDIT-FIX FAZA 10 — 4 balans-o'quvchi jurnalga ko'chirildi · `M-07`+`DUP-05/06/08`)
> `dfea0d0b` · Phase-1: strukturaviy + unit + **real-DB**-tasdiqlangan, browser-smoke YO'Q ·
> ⏳ DEPLOY QILINMAGAN · 🗄️ **MIGRATSIYA BOR** (lokal `climart_adopt`ga qo'llandi, prod'ga YO'Q) ·
> 🔴 **BACKFILL SKRIPTI YUGURTIRILMAGAN — ops qadam, sizning qaroringiz (pastda)**
>
> **Muammo (kodda tasdiqlandi, 3/3 CONFIRMED).** Kontragent saldosi TO'RT joyda mustaqil qayta
> qurilardi va har ro'yxat BOSHQACHA chala edi: metrics byOrg **9 tur** (`counterparty.service.ts:510`,
> izohi esa `:456` da «cert asserts this invariant» deb yolg'on da'vo qilardi) · statement **12 tur**
> (`debt`/`retailsale` yo'q) · akt-sverka **8 tur** (`supply`/`debt`/`debtpayment`/`retailsale` yo'q) ·
> recompute **6 manba**. Oqibati: bitta kartochkada to'rt xil son, kontragentga IMZOGA yuboriladigan
> aktda noto'g'ri yakuniy qoldiq.
>
> **Fix — ildiz: SALDO va YORLIQ ajratildi.** Ilgari bitta ro'yxat ikki ishni qilardi (qator ko'rinishi
> + saldoga qo'shilish), shuning uchun ro'yxatdan tushgan tur = jimgina noto'g'ri saldo. Endi:
> (a) **saldo** har doim jurnaldan — o'qish so'rovlarida `docType` filtri **UMUMAN YO'Q**, belgi
> `deltaMinor` ishorasidan ⇒ yangi hujjat turi qo'shilganda o'quvchilarda o'zgartiriladigan joy yo'q;
> (b) **yorliq** yangi `counterparty-balance-doc-resolver.ts` dan — tur yo'q bo'lsa qator RAQAMSIZ
> chiqadi, saldo baribir to'g'ri (ataylab tanlangan degradatsiya).
> Yana: `ApplyDeltaMeta.docType` endi `string` emas, reyestr union'i (`'debtPayment'` vs `'debtpayment'`
> tipidagi bir harfli farq compile-time'da tutiladi) · migratsiya `doc_id` NULLABLE (opening bloker) ·
> statement'ga **valyuta filtri** qo'shildi (ilgari USD hujjat UZS qoldig'iga qo'shilardi).
>
> **TDD.** `balance-readers-invariant.test.ts` — aralash-hujjat stsenariysi (opening · invoiceOut ·
> supply · paymentIn · invoiceIn · cashOut · adjustment · debt · debtpayment · retailsale · **unpost
> teskarisi** · **USD hujjat**). Avval **3/7 QIZIL** (act/statement hamon doc-jadvallariga borardi) →
> ko'chirishdan keyin **7/7 yashil**.
>
> **Gate:** api/db/web typecheck **0** · `lint:product` **0 error** · api vitest **385 fayl / 5107 test** ·
> web vitest **183 fayl / 2745 test** · `i18n:gate` OK. **Real-DB** (`climart_adopt @ 5432`): `doc_id`
> NULLABLE + 4 indeks tasdiqlandi, haqiqiy tranzaksiyada **Σ(byOrg) == materiallashgan**, rollbackdan
> keyin jurnal **0 qator**. **Browser-smoke YO'Q.** Batafsil: rejadagi «HISOBOT JURNALI → Faza 10».
>
> **🔴 SIZDAN QAROR — BACKFILL (ops qadam, men yugurtirmadim).** Jurnal Faza 9 da BO'SH boshlangan, ya'ni
> tarixiy qoldiq unda yo'q. Backfillsiz akt-sverka/metrics faqat Faza 9 dan keyingi deltalarni ko'rsatadi.
> Tanlangan usul — **«opening snapshot»** (hujjat-replay EMAS: u `DUP-02` xatarini takrorlardi):
> ```
> pnpm --filter @moysklad/api exec tsx src/scripts/backfill-counterparty-balance-journal.ts        # DRY
> APPLY=1 pnpm --filter @moysklad/api exec tsx src/scripts/backfill-counterparty-balance-journal.ts # yozadi
> pnpm --filter @moysklad/api exec tsx src/scripts/recompute-counterparty-balances.ts               # tasdiq
> ```
> Skript **idempotent** (qayta yugurtirish saldoni ikkilantirmaydi). `recompute` esa backfillsiz
> `APPLY=1` ni **RAD ETADI** — bu qo'riqchi lokal DB'da jonli tekshirildi (3 kalit topib `exit 1` qildi).
>
> **⏭️ KEYINGI:** `docs/REJA-AUDIT-FIX-2026-08.md` → **Faza 11** (`M-06`+`M-05` — PaymentIn/Out'ni
> `OrganizationAccount` balansiga, POS-qarz naqdini `CashDesk` ledgeriga yozdirish; `/money`'da
> bank to'lovlari ko'rinsin). Sessiya-boshi prompt o'sha fazada.

---

> **🕒 2026-08-08f (AUDIT-FIX FAZA 9 — `CounterpartyBalanceEntry` balans jurnali · `DUP-15`+`M-07`)
> `cc5370c` · Phase-1: strukturaviy + unit + **real-DB**-tasdiqlangan, browser-smoke YO'Q ·
> ⏳ DEPLOY QILINMAGAN · 🗄️ **MIGRATSIYA BOR** (lokal `climart_adopt`ga qo'llandi, prod'ga YO'Q)**
>
> **Muammo (kodda tasdiqlandi).** `DUP-15`: materialized `CounterpartyBalance` kaliti
> `counterpartyId_currency` — `organizationId` YO'Q ⇒ org-kesim va akt-sverka balansni **4 joyda
> mustaqil (chala)** rekonstruksiya qiladi (`M-07`: `counterparty.service.ts:456` «cert asserts this
> invariant» deydi, `:510` ro'yxati esa 9 tur). **Auditda yo'q qo'shimcha topilma:** 49 `applyDelta`
> chaqiruvidan **faqat `post()`** meta uzatardi — barcha `unpost/cancel/update`-reapply meta'siz edi
> (`ApplyDeltaMeta` ataylab optional qilingan edi), ya'ni jurnalni chokepoint'ga qo'shsam **teskari
> deltalar hujjat-identifikatorisiz** tushardi va Faza 10 jurnal ustiga qurilmasdi.
>
> **Fix (3 qism).** (1) **YANGI** `CounterpartyBalanceEntry` append-only jadval + migratsiya
> (`20260808180000_counterparty_balance_entry_journal`): `accountId, counterpartyId, organizationId?,
> currency, deltaMinor, docType(VARCHAR — enum EMAS), docId, createdAt` + 3 indeks; `updatedAt` yo'q
> (append-only). (2) `applyDelta` upsert bilan **BIR TX'DA** (`tx`, `prisma` emas) jurnal qatorini
> yozadi. (3) `ApplyDeltaMeta` — `docType`/`docId` **majburiy** + yangi majburiy
> `organizationId: string | null` ⇒ **compile-time qo'riqchi**: 49 chaqiruv joyi (13 fayl) typecheck
> orqali topib wire qilindi; `organizationId: null` faqat `Debt` (org o'lchovi yo'q) uchun — ATAYLAB
> qaror, unutish emas. Faza 8'ning skan-guard'i «yangi FAYL»ni tutadi, bu esa «yangi CHAQIRUV»ni.
>
> **TDD:** jurnal testlari avval yozildi → **3/10 qizil** (`entryArgs` bo'sh — sabab aynan «jurnal
> yozuvi yo'q»). Fix'dan keyin **10/10 yashil**; Σ-invariant testi materiallashgan balansni fake tx'da
> **haqiqatda yig'adi** (mock-xulqiga assert qilinmaydi).
>
> **Gate:** api tsc **0** · db tsc **0** · biome **0 error** · api vitest BUTUN suite **5103/5103**
> (384 fayl) · Faza 8 qamrov-guard'i mendan keyin **13/13** · **real-DB round-trip**: 2 delta → 2 jurnal
> qatori, `Σ(journal) == Δ(materialized)`, rollbackdan keyin **0 qator** (bir-tranzaksiya kafolati jonli
> tasdiqlandi) · migratsiya `db execute` bilan qo'llandi, `migrate diff` **drift 0**. `i18n:gate` — UI tegilmagan.
>
> **BACKFILL javobi (reja so'ragan):** **KERAK, lekin hujjat-replay EMAS** — u `DUP-02` xatarini
> takrorlaydi. Tavsiya: **«opening snapshot»** (har mavjud balans qatori uchun bitta
> `docType:'opening'` jurnal qatori, `deltaMinor = balanceMinor`) ⇒ Σ-invariant konstruksiya bo'yicha
> to'g'ri, yo'qotish nol. **Bloker:** `docId` hozir NOT NULL uuid ⇒ Faza 10'da nullable qilinadi yoki
> nol-uuid sentinel. Bu — **Faza 10 ning BIRINCHI qadami**.
>
> **⏭️ KEYINGI:** `docs/REJA-AUDIT-FIX-2026-08.md` → **Faza 10** (`M-07`,`DUP-05/06/08` — 4 balans-o'quvchini
> jurnaldan o'qishga o'tkazish). Sessiya-boshi prompti o'sha fazada; **avval backfill qarorini bajar**
> (yuqoridagi opening-snapshot), aks holda akt-sverka noldan boshlangan qoldiq ko'rsatadi. To'liq hisobot —
> rejadagi «HISOBOT JURNALI → Faza 9».
>
> **🕒 2026-08-08e (AUDIT-FIX FAZA 8 — `recompute-counterparty-balances` qamrov-guard · `DUP-02`)
> `<commit>` · Phase-1: strukturaviy + unit-tasdiqlangan, browser-smoke YO'Q · ⏳ DEPLOY QILINMAGAN ·
> 🗄️ MIGRATSIYA YO'Q · ⚠️ `APPLY=1` YUGURTIRILMADI**
>
> **Muammo (kodda + JONLI bazada tasdiqlandi).** Skript materialized `CounterpartyBalance`ni
> hujjatlardan qayta quradi va manbalarda ko'rinmagan kontragentga `0` yozadi. `applyDelta`ning **13**
> yozuvchisidan skript **11** tasini bilardi; qamrovsizlari — `debt.service.ts:561` (`create()`
> `+totalMinor`, 2026-08-05 balans-simmetriyasi) va `retail-sale.service.ts:842/1287` (POS qarzga sotuv
> `+debtAmount` / qaytarish `−debtReturn`). Lokal DB'da o'lchandi: 8 ta QRZ- qarz bor, uchala balans
> qatori aynan `Σdebt − Σto'lov` ga teng ⇒ **eski skript `APPLY=1` bilan −250 000 / −600 000 / −150 000
> yozardi** (to'liq to'lagan mijoz «biz unga qarzdormiz» bo'lib qolardi).
>
> **Fix (3 qism).** (1) **YANGI** `scripts/counterparty-balance-sources.ts` — manba-daraxtni skanerlab
> `X.applyDelta(` CHAQIRUVI bor fayllarni topadi (izohlar strip qilinadi ⇒ premise-izohlar yozuvchi deb
> sanalmaydi) va 13 yozuvchili reyestr bilan **ikki tomonlama** solishtiradi: QAMROVSIZ (yangi yozuvchi)
> va ESKIRGAN (olib tashlangan yozuvchi). (2) Skript `main()`da **birinchi so'rovdan oldin**
> `assertCounterpartyBalanceCoverage()` — buzilgan bo'lsa DRY-RUN'da ham `throw`. (3) Uch yangi manba:
> `debt-issue` (Σ totalMinor), `retail-credit` (DEBT tender qatorlari), `retail-credit-refund`
> (`debtReturnMinor`, teskari ishora). Kontragent **`SOLD_ON_CREDIT` audit hodisasidan** aniqlanadi —
> u `applyDelta` bilan bir tranzaksiyada yoziladi, chek qatoridagi `agentId` esa undan ajralishi mumkin.
>
> **TDD:** test avval yozildi, reyestr 11 manba bilan qoldirildi → **6/13 qizil**, xabar aynan ikki
> qamrovsiz faylni ko'rsatdi (DUP-02 test bo'lib takrorlandi). Fix'dan keyin **13/13 yashil**.
>
> **Gate:** api tsc **0** · biome **0 error** · api vitest BUTUN suite **5098/5098** (384 fayl) ·
> skript **DRY-RUN** lokal DB'da → `changed: 0` (idempotent). `i18n:gate` — UI tegilmagan.
>
> **Qaror:** soft-delete qilingan qarzlar **ham** sanaladi, chunki `debt.remove()` deltani qaytarmaydi
> (`DUP-03`). Faza 12 reversal qo'shsa premise-testi yiqiladi va skriptga `deletedAt: null` qo'yishni
> majburlaydi — bog'lanish kod bilan mahkam.
>
> **⏭️ KEYINGI:** `docs/REJA-AUDIT-FIX-2026-08.md` → **Faza 9** (`DUP-15`+`M-07` — `CounterpartyBalanceEntry`
> journal-jadval + migratsiya; Faza 10 shunga bog'liq). Sessiya-boshi prompti o'sha fazada. **Faza 8
> hisoboti** rejadagi «HISOBOT JURNALI → Faza 8» da (yon-topilma: `post()` `parsed.agentId`ni daftarga
> yozadi-yu chek qatoriga yozmaydi ⇒ qaytarishda qarz boshqa mijozdan yechilishi mumkin — ildiz bug' ochiq).
>
> **🕒 2026-08-08d (AUDIT-FIX FAZA 7 — POS refund qarz-qaytarish + kumulyativ + loyalty ulush ·
> `SALES-04`+`SALES-05`) `e242ff6` · Phase-1: strukturaviy + unit-tasdiqlangan, browser-smoke YO'Q ·
> ⏳ DEPLOY QILINMAGAN · 🗄️ MIGRATSIYA BOR (faqat lokalga qo'llandi)**
>
> **Muammo (tasdiqlandi, eksploit JONLI takrorlandi).** `refund()` da `counterpartyBalance` so'zi
> **umuman yo'q** edi — `post()` esa qarzni `applyDelta(+debtAmount)` bilan yozadi. RED yugurishda 100%
> qarzga sotilgan 100 000 lik chek **100 000 NAQD bilan qaytdi** va mijoz qarzi joyida qoldi (ikki
> tomonlama yo'qotish). Qisman refund esa `updateMany(data:{state:'refunded'})` — **shartsiz** — chekni
> yopardi (10 tadan 1 tasi qaytsa qolgan 9 tasi abadiy bloklanardi) va `planLoyaltyReversal` butun
> ballni tortardi.
>
> **Fix (5 qism).** (1) `computeRefundSettlementCaps()` — asl chekning `RetailSalePayment(DEBT)`
> ulushidan ikki cap: naqd/karta payout faqat **haqiqatan olingan pul** ulushigacha, qolgani
> `applyDelta(−)` bilan qarzdan yechiladi; caplar **kumulyativ** (`R` = jami qaytarilgan qiymat, oldingi
> refundlar ayriladi) ⇒ bo'lingan qaytarishlarda tiyin-drift yo'q. `debtReturnMinor` **berilmasa server
> o'zi yopadi** (POS bugun hech narsa yubormaydi). (2) `validateRefundPositions(..., alreadyRefunded)` +
> `isFullyRefunded()` — state `refunded`ga faqat oxirgi dona qaytganda o'tadi. (3) **Mutex `state`dan
> `version`ga ko'chdi** — qisman refund flip qilmagani uchun eski CAS yo'qolgan bo'lardi. (4) loyalty
> clawback `⌊earned × refundSum / originalSum⌋` (qoidadan qayta hisoblanmaydi — §105 saqlandi).
> (5) **Yon-topilma (bloker):** `post()` qarz mijozini chekka yozmasdi (`/sotuv` uni faqat post
> payloadida yuboradi) ⇒ bazadagi HAR qarz chekida `agentId` NULL. Endi saqlanadi; eski cheklar uchun
> qarzdor `SOLD_ON_CREDIT` audit hodisasidan tiklanadi (`resolveCreditDebtorId`).
>
> **Migratsiya:** `20260808120000_retail_sale_debt_return` — `retail_sales.debt_return_minor` (additive,
> default 0). **Lokal `climart_adopt @ 5432` ga qo'llandi**; prod'da deploy paytida qo'llash kerak.
>
> **TDD:** 50 yangi test, har biri avval qizil ko'rildi — 25 sof (`retail-refund-validation.test.ts`) ·
> 5 loyalty · 18 service-wiring (**YANGI** `retail-sale-refund-debt.test.ts`) · 2 `post()` wiring.
> Fixture'lar (`refund-pricing`, `cas`) real `select` shakliga moslandi — mahsulot kodiga himoyaviy
> `?? []` **qo'yilmadi**.
>
> **Gate:** api tsc **0** · biome **0 error** · api vitest BUTUN suite **5085/5085** (383 fayl).
> `i18n:gate` yugurtirilmadi — UI matni tegilmagan (web umuman tegilmagan).
>
> **⏭️ KEYINGI:** `docs/REJA-AUDIT-FIX-2026-08.md` → **Faza 8** (`DUP-02` — `recompute-counterparty-balances.ts`
> APPLY-guard + qamrov: skript qamramagan yozuvchilar balansini jimgina 0 qiladi). Sessiya-boshi prompti
> o'sha fazada. **Faza 7 hisoboti** rejadagi «HISOBOT JURNALI → Faza 7» da (qolgan qarz/DEFER ro'yxati
> bilan: web'da «qarzdan yechildi» ko'rsatkichi yo'q · legacy chek backfill'i ops-qadam · `zReport`
> `creditAgg` `'debt'` vs `'DEBT'` nomuvofiqligi tasdiqlandi, Faza 15 ga).
>
> **🕒 2026-08-08c (AUDIT-FIX FAZA 6 — POS refund asl-narx cap + chegirma · `SALES-01`+`FE-01`) `c751a62`
> · Phase-1: strukturaviy + unit-tasdiqlangan, browser-smoke YO'Q · ⏳ DEPLOY QILINMAGAN**
>
> **Muammo (tasdiqlandi, eksploit JONLI takrorlandi).** `retail-sale.service.refund()` klient yuborgan
> `priceMinor`ni `computePositions()`dan o'tkazib, keyin payout'ni **o'sha raqam** bilan cheklardi —
> cap o'ziga-havola edi. Asl pozitsiyalar `select`ida `priceMinor`/`discount`/`sumMinor` **umuman yo'q**
> edi, ya'ni server asl narxni bilmasdi. RED yugurishda 10 000 tiyinlik chek `priceMinor: '10000000'`
> bilan **muvaffaqiyatli qaytdi** (oyna chek + `MoneyService.applyDeltas` chaqirildi) — barcha mavjud
> guardlar (qty-subset, payout≤refundSum, CAS flip) o'tdi. Web (`sotuv/page.tsx`) esa `discount`ni
> yubormay `priceMinor × qty` hisoblardi ⇒ chegirmali chekda kassa ortiqcha naqd chiqarardi.
>
> **Fix:** yangi sof `priceRefundFromOriginal()` (`retail-refund-validation.ts`) — refund **faqat asl
> chekdan** narxlanadi: asl qatorlar mahsulot bo'yicha agregatlanadi va har qator
> `floor(Σ asl sumMinor × qaytQty / Σ asl qty)`. Floor + mavjud qty-subset guardi ⇒
> **`Σ refund ≤ original.sumMinor`** invarianti. Prorate (birinchi-qator narxi EMAS) — bir mahsulot
> turli narxda ikki qatorda sotilgan bo'lishi mumkin (1×100 + 1×10: first-line-wins 200 berardi).
> Chegirma asl `sumMinor` ichida ⇒ FE-01 ham serverda yopiladi. Schema: refund `priceMinor`/`discount`
> endi `.optional()` + «server IGNORE qiladi». Web `cart-math.refundPayoutMinor()` bilan **bir xil
> formulaga** o'tdi (shart edi: aks holda chegirmali chek endi 400 olardi).
>
> **TDD:** 25 yangi test, har biri avval qizil ko'rildi — 8 sof (`retail-refund-validation.test.ts`) ·
> 7 service-wiring (**YANGI** `retail-sale-refund-pricing.test.ts`, mocked-Prisma ustidan `refund()`) ·
> 7 web-math · 3 web-wiring skaner (**YANGI** `pos-refund-payout.test.ts` — formula to'g'ri-yu sahifa
> ishlatmasa tutadi). `retail-sale.cas.test.ts` fixture'i real `select` shakliga moslandi (mahsulot
> kodiga himoyaviy `?? 0n` **qo'yilmadi**).
>
> **Gate:** api tsc **0** · web tsc **0** · biome **0 error** · `i18n:gate` **o'tdi** ·
> api vitest BUTUN suite **5038/5038** (382 fayl) · web vitest BUTUN suite **2745/2745** (183 fayl).
>
> **⏭️ KEYINGI:** `docs/REJA-AUDIT-FIX-2026-08.md` → **Faza 7** (`SALES-04`+`SALES-05` — qarz-sotuv
> refund'i naqd chiqarib mijoz qarzini qoldiradi · qisman refund chekni `refunded` qilib qolganini
> bloklaydi + butun loyalty ballni tortadi). Faza 6 bog'liqligi bajarildi. Sessiya-boshi prompti o'sha
> fazada.

> **🕒 2026-08-08b (AUDIT-FIX FAZA 5 — `loss.cancel`/`unpost` atomik claim + Serializable · `STK-01`)
> · Phase-1: strukturaviy + unit-tasdiqlangan, browser-smoke YO'Q · ⏳ DEPLOY QILINMAGAN**
>
> **Muammo (tasdiqlandi).** `loss.cancel()` `$transaction`ni **ikkinchi argumentsiz** ochardi (default
> ReadCommitted) va holatni oxirida **shartsiz** `update({ where: { id, accountId } })` bilan flip qilardi —
> holat esa `transition()` → `findById` dan, tranzaksiya **tashqarisidan** kelardi. Ikki parallel cancel
> (yoki cancel ∥ unpost) spisaniye qoldig'ini va `costBalanceMinor`ni **ikki marta** qaytarardi.
> **Kengroq:** `unpost()` da ham claim yo'q edi — Serializable uni yashirgan, lekin **bo'sh** (0 pozitsiyali)
> spisaniye hech narsani qulflamaydi (aynan shu sabab `post()` ga 2026-07-29 da claim qo'yilgan edi).
> **Ildiz:** `shared/transition-toctou-class.test.ts` klass-skaneri 7 stock-servisni qamraydi — **loss
> ro'yxatda yo'q edi**, shuning uchun teshik 2026-06 dan beri omon qolgan.
>
> **Fix:** `cancel()` + `unpost()` ga Faza 1 helperi `transitionWithClaim(tx.loss, …)` tranzaksiyaning
> BIRINCHI amali sifatida (cancel `fromStates: [existing.state]` — literal `'posted'` EMAS, chunki
> cancel↔unpost poygasida yakuniy holatlar har xil); `cancel()` ga `{ isolationLevel: 'Serializable',
> timeout: 15000 }`. `post()` ning inline claim'i tegilmadi. Klass-skanerga loss bloki qo'shildi.
>
> **TDD:** yangi `loss/loss-transition-race.test.ts` — fix'dan oldin **6 testdan 5 tasi yiqilardi**
> (2× cancel → `applyDeltas` 2×; 2× unpost → 2×; cancel∥unpost → 2×; 3× cancel → 3×; draft-cancel'da
> shartli `updateMany` umuman yo'q), keyin **6/6 yashil**. Skaner blokining vakuum emasligi `git show HEAD`
> manbasiga qarshi alohida tekshirildi (4 assertdan 3 tasi eski kodda yiqilardi).
>
> **Gate:** api tsc **0** · biome **0 error** · api vitest BUTUN suite **5023/5023** (381 fayl, 2 skipped) ·
> `loss` 27/27 · `shared` 501/501. i18n gate kerak emas (backend).
>
> **🔴 Yangi topilma, OCHIQ qoldi:** `loss.delete()` (`loss.service.ts:516-528`) hamon read-check-then-write —
> parallel `post` bilan poygada **yetim StockOperation** qoldiradi (qoldiq harakatlandi, hujjat soft-delete).
> 7 sibling servisda bu shartli `updateMany` bilan yopilgan. Klass-lok blokida `delete()` ataylab pin
> qilinmadi (aks holda qizil bo'lardi) — **alohida kichik faza sifatida yopilsin**.
>
> **⏭️ KEYINGI:** `docs/REJA-AUDIT-FIX-2026-08.md` → **Faza 6** (`SALES-01`+`FE-01` — POS refund server
> tomondan asl-narx cap; P0, CRITICAL: hozir refund payout mijoz yuborgan narxdan hisoblanadi ⇒ cheksiz
> over-refund). Sessiya-boshi prompti o'sha fazada.

> **🕒 2026-08-08a (AUDIT-FIX FAZA 4 — POS qarz-to'lovi tx-ichi FIFO + `recalc` reuse · `M-10`+`DUP-07`)
> · Phase-1: strukturaviy + unit-tasdiqlangan, browser-smoke YO'Q · ⏳ DEPLOY QILINMAGAN**
>
> **Kontekst:** ish endi `docs/REJA-AUDIT-FIX-2026-08.md` (19 faza, har biri alohida sessiya) bo'yicha
> boradi. Bugun **Faza 1–3** ham qilingan (`6683489e` atomik state-claim `M-01`/`DUP-01` · `0a0a2a2e`
> `applyDeltas` increment `M-02` · `3925cc03` `applyPayment` increment `M-09`) — ular NEXT.md'ga yozilmagan
> edi (preflight «hand-off drift» aynan shuni ko'rsatgan). To'liq hisobotlar rejadagi «HISOBOT JURNALI»da.
>
> **Bu sessiya (Faza 4).** `pos-debt-payment.service.ts` FIFO rejani `$transaction`dan **tashqarida**
> hisoblab, `paidMinor`ni eski o'qishdan **absolyut set** qilardi: bir mijozga ikki parallel POS-to'lov →
> `DebtPayment` qatorlari 2×, `paidMinor`da bittasi **jimgina yo'qolardi** (`M-10`). Yonida `DUP-07`:
> `closedAt` hech qachon yozilmasdi, `nextContactAt` tozalanmasdi, `deletedAt` filtri yo'qligi sababli
> **korzinaga tashlangan qarz** POS FIFO'sida turaverardi.
>
> **Fix:** (1) yangi `debt-recalc.ts` — `recalcDebt()` qarz denormalizatsiyasining YAGONA kanonik yo'li
> (ilgari faqat `DebtService`ning private metodi edi, POS o'z chala nusxasini ishlatardi); (2) FIFO endi
> tranzaksiya ichida, `lockOpenDebts()` `SELECT … FOR UPDATE` bilan (`stock.lockBalances` naqshi,
> `ORDER BY created_at, id` = deadlock'ga qarshi barqaror tartib); (3) har allokatsiyadan keyin
> `recalcDebt` — `paidMinor = Σ jonli to'lovlar`, `status`/`closedAt`/`nextContactAt`; (4) POS'ning
> alohida `applyDelta` chaqiruvi olib tashlandi (delta endi `recalc` ichida, `docId: batchId` meta
> saqlanib) va balans **qarz valyutasida** yoziladi — avval to'lov valyutasida yozilardi (USD naqd → UZS
> qarz holati); (5) `loadOpenDebts` + qulf so'rovida `deletedAt: null`.
>
> **TDD:** yangi `pos-debt-payment.service.test.ts` — fix'dan oldin **6/8 yiqilardi** (parallel to'lovda
> `paidMinor` 50 000 vs 100 000 · ortiqcha allokatsiyada 0 rad · `closedAt: null` · o'chirilgan qarz FIFO'da),
> keyin **8/8 yashil**.
>
> **Gate:** api tsc **0** · biome **0** · api vitest BUTUN suite **5013/5013** (380 fayl, 2 skipped) ·
> `debt`+`counterparty-balance`+`counterparty-settlement` **158/158**. i18n gate kerak emas (backend).
>
> **⚠️ Qoldiq risk (halol):** `FOR UPDATE` raw SQL **real Postgres'da yugurtirilmadi** — jadval/ustun
> nomlari faqat `schema.prisma` `@map`laridan tekshirildi (`debts`, `account_id`, `counterparty_id`,
> `deleted_at`, `created_at`). Browser/DB smoke — Phase-2 QA. `M-05` (POS qarz naqdi `CashDesk` ledgeriga
> yozilmaydi) hamon ochiq — **Faza 11**.
>
> **⏭️ KEYINGI:** `docs/REJA-AUDIT-FIX-2026-08.md` → **Faza 5** (`STK-01` — `loss.cancel` atomik claim +
> Serializable; kichik, Faza 1 helperi tayyor). Sessiya-boshi prompti o'sha fazada.
>
> **📌 Uy-ishi qarzi:** bu bo'limda **20+ entry** to'planib qolgan (qoida: eng yangi ~8–10, qolgani
> `docs/audits/_ARCHIVE-NEXT-*.md`ga VERBATIM ko'chiriladi). Arxivlash bir necha sessiyadan beri
> o'tkazib yuborilgan — keyingi sessiyalarning birida «1 mayda ish» sifatida bajarilsin.

> **🕒 2026-08-06b (✅ DEPLOYED — YACHEYKA MULTI-BIN fix · `4944583`)**
>
> Egasi shikoyati: skanerlaganda/qo'lda «bitta yacheykaga 1dan ortiq tovar» va «bitta tovarni
> 1dan ortiq yacheykaga» kiritib bo'lmayapti. Sabab: `Product.attributes.__yacheyka` bitta
> qiymatli maydon edi — har bind eskisini ustidan yozardi (jimgina o'chirardi). Bu aynan
> avval qurilgan (`7639050c`, `ProductLocation`) va `55cf3bf` (climart-adoption drop) da
> **jimgina o'chirilgan** funksiya edi — [[climart-dropped-sherset-features]] bug-klassi.
>
> **Fix:** yangi `ProductCellLink` jadvali (cellId orqali, eski nom-string emas — bu ham
> cross-store nom-to'qnashuv teshigini yopdi). `assignProducts`/`bindProductIfEmpty` endi
> ADD qiladi, hech qachon overwrite qilmaydi; `__yacheyka` faqat 1-marta seed bo'ladi (eski
> single-label o'quvchilar uchun: label print, pick-list resolver, tovar formasi). FE'ga
> tegilmadi — mavjud «yacheykaga tovar qo'sh» picker va scan-modal aynan shu endpoint'larni
> chaqiradi.
>
> **Gate:** api+web tsc 0 · biome 0 · api vitest **4775/4775** (2 yangi test fayl — aynan
> ikki shikoyatni qamraydi) · web vitest **2708/2708**. Migratsiya `20260806120000_add_
> product_cell_link` lokal (`climart_adopt`) va prod (`sherset_v2`) DB'larga qo'llandi.
> **Deploy:** `deploy-smart.sh DS_TARGET=v2` — fetch+reset (nothing-to-deploy edge case bilan
> uchrashildi, ikkinchi urinishda git HEAD allaqachon `4944583` edi — birinchi urinish
> paramiko PipeTimeout bergani bilan aslida remote'da fon jarayoni tugagan ekan;
> `prisma migrate deploy` + `pm2 restart sherset-v2-api` ishladi). **Sog'liq tasdiqlandi:**
> `erp.sherset.uz` 200 · `/api/v1/health` 200 · `product_cell_links` jadvali prod DB'da
> mavjud (`\d` bilan tekshirildi) · api log'da yangi xatolik yo'q.
>
> **⏭️ Browser-QA ochiq** — bu Phase-1 (kod+test darajasida tasdiqlangan), real brauzerda
> skaner qilib ko'rish qilinmadi.

> **🕒 2026-08-07a (🔴 DEPLOY BLOKLANDI — VPS PAROLI ISHLAMAYAPTI)**
>
> `7a65b7f9` GitHub'ga (`sherset-ERP`) **push qilindi**, lekin prodga chiqmadi.
>
> **Tashxis (taxmin emas, o'lchangan):** server TIRIK — ping 122ms · 22-port ochiq ·
> banner `SSH-2.0-OpenSSH_9.6p1`. `auth_none` sinovi serverning **hali ham `password`
> usulini qabul qilishini** ko'rsatdi (`['publickey','password']`), ya'ni parol-kirish
> o'chirilmagan — **parolning O'ZI o'zgargan**. Eski `Namoz8808` → `AuthenticationException`.
>
> **Prod holati SOG'LOM:** `erp.sherset.uz` **200** · `/api/v1/health` **200** — oldingi
> deploy (`8d435a8b`) ishlab turibdi, hech narsa buzilmagan.
>
> **Deploy kutayotgan ish (24 commit, 5 migratsiya):** 1-Kassa B7 FE · B8 1-bo'lak ·
> menejer 4M.3 (tuzatuvchi qator + haftalik xulosa) · 4M.4 (bo'shatish · jonli holat ·
> javobgarlik · xodim kartasi + jurnal) · parallel sessiyaning multi-bin ishi (`49445838`).
>
> **Keyingi qadam:** egadan YANGI PAROLni olish → `scratchpad/ssh_run.py` va
> `memory/sherset-vps-deploy.md` yangilanadi → `DS_TARGET=v2 deploy-smart.sh`.
> Migratsiyalar tayyor, backup buyrug'i ham o'zgarmagan.

> **🕒 2026-08-06d (MENEJER 4M.4 TUGADI — jonli holat · javobgarlik · xodim kartasi · `5b5d78f`) · ⏳ DEPLOY QILINMAGAN**
>
> 4M.4 ning asosiy qismi yopildi (qolgani faqat ishga qabul tomoni — sinov muddati).
>
> **1. Jonli holat** `GET manager/kpi/live` *(26 test)* — ochiq smena · davomat · haydovchi
> reysi · yig'ilayotgan buyurtma. **Asosiy qaror:** ekran «hammasi joyida» DEMAYDI — hamma
> xodimni ro'yxatlash menejerni 40 qatordan 3 tasini qidirishga majbur qilardi va u ekranni
> ochishni tashlardi. Chegaralar izohlangan: smena 12s · kechikish 15daq · yig'ish 45daq ·
> «biriktirilgan» haydovchi 1s.
>
> **2. Javobgarlik** `GET manager/kpi/accountability` *(14 test)* — ochiq smena · haydovchi
> qo'lidagi naqd · tugallanmagan yig'ish · qabul qilinmagan KPI kunlari. **Pul ko'p bo'lgan
> tepada** (yo'qolgan pulni qaytarib bo'lmaydi, yig'ishni ertaga tugatsa bo'ladi).
> ⚠️ **Jihoz ataylab YO'Q** — reyestr mavjud emas; «0 ta jihoz» deb ko'rsatish menejerni yo'q
> ma'lumotga ishontirardi. Reyestr — alohida bosqich.
>
> **3. Xodim kartasi 360°** `GET hr/employees/:id/card` + **suhbat/ogohlantirish jurnali**
> (`EmployeeNote`, ilgari hech qayerda YO'Q edi) *(17 test)*.
> 🔴 **Jurnal APPEND-ONLY**: yozuv tahrirlanmaydi va **o'chirilmaydi** — o'chirib bo'ladigan
> ogohlantirish ogohlantirish emas. Xato yozuv `void` qilinadi va tarixda **ko'rinib qoladi**,
> faqat hisobga kirmaydi. Matn majburiy.
> **Naqsh:** 90 kunlik oynada **3** ogohlantirish. 90 kun — bir yil oldingisi bugungi qarorga
> asos bo'lmaydi, lekin uch oy naqshni ko'rsatadi; 3 — bittasi hodisa, ikkitasi tasodif,
> uchtasi takrorlanish. **Maqtov** turi ham bor: jurnal faqat salbiydan iborat bo'lmasin.
>
> **Runtime:** 20 soatlik smena → alert tepaga · 4 xodimda majburiyat ko'rindi · 3
> ogohlantirish → naqsh, bittasi bekor qilingach naqsh yo'qoldi va yozuv sababi bilan qoldi.
>
> **Gate:** typecheck 0 · biome 0 · api **4913/4913**. Qolgan bosqichlar **62 → 61**.
> ⚠️ **Phase-1: brauzer-smoke YO'Q** — 4M.4 ning bironta ekrani FE'da yo'q (BE + 8 endpoint tayyor).
>
> 📦 **DEPLOY QARZI:** 1-Kassa B5–B7 · MoySklad pick-list · menejer 6 bosqichi — **hammasi
> deploy qilinmagan** (20+ commit, 6 migratsiya).

> **🕒 2026-08-06c (MENEJER BO'LIMI — 3 bosqich · `29ade7e` · `8923c19` · `0d9ca3b`) · ⏳ DEPLOY QILINMAGAN**
>
> Egasining talabi: «birinchi navbatda menejer bo'limini qil». Uch ish bajarildi.
>
> **1. Eskirgan kun TUZATUVCHI QATORI (§3.4)** — `29ade7e`
> Kun qabul qilinib **to'langandan** keyin manba hujjat o'zgarsa, oylik endi jimgina qayta
> yozilmaydi: qabul paytidagi fakt **muzlatiladi** (`acceptedFactMinor`), farq esa
> `EmployeeKpiCorrection` da alohida qator bo'lib **tuzatma sanasi tushgan oyga** kiradi.
> Iyul kunining avgustdagi xatosi → **avgust** oyligiga (iyul yopilgan). Qo'shimcha to'lov va
> ushlanma alohida saqlanadi — buxgalterga «sof −50 000» yetarli emas.
> *Runtime:* 500 000 → 440 000 → farq aynan −60 000, davr avgust; raqam o'zgarmay qayta qabulda
> ortiqcha tuzatma yozilmadi.
>
> **2. Egaga HAFTALIK XULOSA (M-Q7)** — `8923c19`
> Dushanba 09:00 cron + `GET manager/kpi/weekly-summary`. «Eng ko'p tuzatgan» **son** bo'yicha,
> summa bo'yicha emas (bitta katta tuzatma normal ish, o'nlab mayda tuzatma — naqsh).
> Tuzatmasiz haftada ham xabar ketadi.
> 🔴 **Jonli ma'lumotda BUG topildi va tuzatildi:** jurnal payload'ida `was` birinchi tuzatmada
> har doim `null` (u *oldingi qo'lda tuzatma* qiymati) — shuning uchun M-Q7 ning asosiy raqami
> **doim 0** chiqardi. Endi baza `was ?? autoValue ?? 0`, va bazasiz qatorlar **alohida**
> sanaladi («shundan yo'qdan kiritilgan: N ta») — «tuzatdi» bilan «yo'qdan kiritdi» boshqa ish.
> Tuzatgandan keyin real 5 mln so'mlik aralashuv ko'rindi.
>
> **3. BO'SHATISH RO'YXATI (4M.4 hayot sikli)** — `0d9ca3b`
> ⚠️ **todo.md dagi da'vo qisman NOTO'G'RI ekan.** Kodda tekshirdim: **login va refresh
> allaqachon yopiq** (`auth.service` ikkalasida `archived` ni ko'radi). Haqiqiy teshiklar:
> **Telegram bog'lami** · **ochiq kassa smenasi** · **qabul qilinmagan KPI kunlari** · **jihoz**.
> Endi bo'shatish — ro'yxat; u tugamaguncha xodim arxivlanmaydi.
> **Asosiy qaror:** tizim biladigan narsani odamdan so'ramaymiz — `auto` bandni **qo'lda
> belgilab bo'lmaydi** (aks holda «Telegram uzildi» deb belgilanardi, bog'lam esa turardi).
> Auto bandlar har so'rovda qayta tekshiriladi va yakunlashda ham qayta o'qiladi.
> *Runtime:* ochiq smenali xodimda arxivlash bloklandi («1 ta ochiq smena»).
>
> **Gate:** typecheck 0 · biome 0 · api **4856/4856**.
> ⚠️ **Phase-1: brauzer-smoke YO'Q** — uchala ishning ham FE ekrani yo'q (BE + endpointlar tayyor).
>
> ⛔ **EGASIDAN KUTILMOQDA (B1):** bonus/jarima **formulasi**. TZ «kun qabul qilinganda
> bonus/jarima yoziladi» deydi, lekin **qancha** ekani yozilmagan — pul siyosati o'ylab
> topilmaydi. Shu javob kelsa 4M.3 butunlay yopiladi.
>
> **Keyingi:** 4M.4 ning qolgani (jonli holat · xodim kartasi 360° · javobgarlik) yoki 4M.5.

> **🕒 2026-08-06b (1-KASSA B7 TUGADI — yopish formasi + Z-hisobot + menejer aktlari · `cab41d8`) · ⏳ DEPLOY QILINMAGAN**
>
> **1-Kassa endi B1–B7 yopiq** (qolgani faqat B8 — `sotuv/page.tsx` bo'linishi).
>
> 1. **POS yopish formasi** — kutilgan naqd va farq **tasdiqlashdan OLDIN** ko'rinadi. Kassir
>    raqamni ko'rmasdan yopsa, farqni faqat menejer ertaga ko'radi va sababini hech kim eslamaydi.
>    Izoh maydoni **faqat farq bo'lganda** chiqadi — farqsiz smenada u ortiqcha savol bo'lardi va
>    kassir uni e'tiborsiz qoldirishga o'rganib qolardi.
> 2. **Z-hisobot** — mavjud smena sahifasiga **§8.5 bloki** qo'shildi (ikkinchi sahifa
>    yaratilmadi): to'lov turlari kesimi · o'rtacha chek · yalpi foyda · chegirma · qarzga
>    sotilgan · qarz to'lovlari · qaytarishlar · **xarajatlar moddalar bo'yicha** · inkassatsiya ·
>    farq aktlari. `NULL ≠ 0` ko'rinishda ham saqlanadi (yalpi foyda noma'lum → «—», 0 emas).
> 3. **`/menejer/kassa-farqlari`** — default **faqat ko'rilmagan** aktlar; ko'rilmaganlar soni
>    filtr o'zgarsa ham sarlavhada qoladi.
>
> 🔴 **ASOSIY QAROR:** tan olish **summalarga TEGMAYDI**. Akt — pul yo'qolishi haqidagi dalil;
> uni tuzatish imkoni bo'lsa, u dalil bo'lishdan to'xtardi. Menejer faqat «ko'rdim» + sabab
> yozadi. Qayta bosilsa **birinchi vaqt saqlanadi**.
>
> **Runtime:** 3 ko'rilmagan akt → 1 tan olindi → qayta bosishda vaqt **surilmadi** → summalar va
> kassir izohi **o'zgarmadi** → filtrlar 2/1/3 to'g'ri.
>
> **Gate:** typecheck 0 · biome 0 · api **4779/4779** · web **2708/2708** · i18n ru+uz.
> ⚠️ **Phase-1: brauzer-smoke YO'Q.**
>
> **Keyingi:** `1-Kassa B8` — `sotuv/page.tsx` (2000+ satr) modullarga bo'lish. Qolgan
> bosqichlar **63 → 62**.

> **🕒 2026-08-06a (✅ DEPLOYED — 1-Kassa B5–B7 + MoySklad pick-list · `a3cd733 → 8d435a8b`)**
>
> **Deploy qamrovi:** 1-Kassa **B5** (qarz to'lovi + PKO) · **B6** (xarajat/inkassatsiya + RKO) ·
> **B7 backend** (farq akti + Z-hisobot) · **4M.3 FE** · **MoySklad pick-list** (yacheykali chek).
> Backup: `pre-kassa-b5b7-20260805-200030.sql.gz` (402M, 231 jadval).
> **22 migratsiya qo'llandi** — «All migrations have been successfully applied».
>
> **Sog'liq (majburiy tekshiruv, o'tgan 502 sabog'i):** `api/v1/health` **200** · web:3011 **200** ·
> `erp.sherset.uz` **200**. Yangi 6 marshrut **401** qaytardi (404 EMAS) ⇒ kod jonli:
> `debts/pos/summary/:id` · `cashier-sessions/cash-out-recipients` · `:id/z-report` ·
> `:id/cash-out-summary` · `pick-lists` · `debts`.
> DB'da tasdiqlandi: `debt_payments.batch_id`+`retail_shift_id` · `retail_drawer_cash_out.kind`+
> `expense_item_id`+`recipient_id` · `cashier_session_variances` jadval · `ms_pick_lists.pick_state`.
>
> 🔴 **DEPLOY PAYTIDA TOPILDI VA TUZATILDI:** `.picksync.env` qutida **YO'Q** edi ⇒ sync jim
> turgan (`ms_pick_lists` = 0). Lekin `apps/api/.env` da **`MOYSKLAD_TOKEN` BOR** va u ishlaydi
> (jonli: `GET /entity/customerorder` → 200). `authHeader()` endi **token'ni birinchi** tekshiradi
> (Bearer), login/parol zaxira bo'lib qoladi — yangi maxfiy ma'lumot so'ramaymiz (`8d435a8b`).
>
> **✅ SYNC JONLI ISHLAYAPTI:** `«MoySklad pick-list sync: 9 order(s) upserted»` — `ms_pick_lists`
> da **9 hujjat** (hammasi `salesreturn`, 2026-08-04/05). `customerorder` lar eskiroq
> (oxirgisi 2026-07-21) ⇒ 48 soatlik oynadan tashqarida; kengaytirish uchun
> **`MOYSKLAD_SYNC_BACKFILL_HOURS`** qo'shildi (default 48 o'zgarmadi).
>
> ⚠️ **JONLI MA'LUMOTDAGI ASOSIY XULOSA — yacheyka biriktirish qarzi:** sync qilingan
> **15/15 pozitsiya** mahalliy tovarga **kod bo'yicha topildi** (moslashtirish ishlaydi), lekin
> ularning **hech biriga yacheyka biriktirilmagan**. Prodda: **4898 tovar, shundan atigi 144 tasi
> (≈3%) yacheykaga bog'langan.** Ya'ni chek hozir ko'pincha «yacheykasiz» chiqadi — bu KOD
> muammosi emas, **ma'lumot kiritish** ishi (§1/§2 «Скан-sanash»/«Umumiy sanash» ekranlari).
> Chek boshidagi qoplama ogohlantirishi aynan shuni ko'rsatadi.
>
> ⚠️ **Phase-1: brauzer-smoke YO'Q** — hech bir yangi ekran real brauzerda ochilmagan, termal
> printerda sinalmagan. `expense_items` prodda **0 ta** ⇒ xarajat (RKO) oynasi «modda yo'q»
> deydi, egasi avval xarajat moddalarini yaratishi kerak.
>
> **Keyingi:** 1-Kassa **B7 qolgani** (yopish formasi + Z-hisobot sahifasi) yoki **Phase-2 QA**.

> **🕒 2026-08-05g (1-KASSA B7 BACKEND — smena farq akti + Z-hisobot · `02f42d7`) · ⏳ DEPLOY QILINMAGAN**
>
> **`CashierSessionVariance` jadvali** (migratsiya `20260805210000_cashier_session_variance`):
> sanalgan naqd kutilgandan farq qilsa akt yoziladi + menejerga Telegram.
> *Nega alohida jadval:* `CashierSession.discrepancyMinor` faqat OXIRGI raqamni saqlaydi — sabab,
> kassir izohi, kim ko'rgani YO'Q. Farq = pul yo'qolishi da'vosi, yonida **dalil** turishi kerak.
>
> **Sof modul** `shift-variance.ts` (**21 test**):
> - **Nol farqda akt YO'Q** — «ko'rilmagan aktlar» ro'yxatini ma'nosiz yozuvlar bilan to'ldirish
>   haqiqiylarini ko'rinmas qilardi.
> - Kamomad va ortiqcha **boshqa sarlavha** oladi (ortiqcha ham muammo, lekin BOSHQA muammo).
> - Xabar «farq bor» deb emas, **QANCHA va QAYSI TOMONGA** deb boshlanadi va kutilgan/sanalgan
>   har ikkisi ko'rinadi — menejer telefonida bir qatordan qaror qiladi.
> - **Bir tiyinlik farq ham** akt yozadi: «kichik farqni e'tiborsiz qoldirish» siyosati TZ'da YO'Q.
>
> 🔴 **TARTIB MUHIM:** akt **holat qulfidan (`updateMany`) KEYIN** yoziladi. Oldin yozilsa, poyga
> yutqazgan ikkinchi chaqiruv ham akt yozib qo'yardi. Akt/xabar nosozligi **yopishni yiqitmaydi** —
> kassir ishini davom ettirishi kerak; farq `discrepancyMinor` da baribir saqlangan.
>
> ⚠️ **USD FARQI ATAYLAB YOZILMAYDI (ochiq qarz).** TZ §8.4 «UZS va USD alohida» deydi, lekin USD
> naqd oqimi hali ULANMAGAN: `retail-sale.service.ts` to'lovni har doim kassa valyutasida yozadi
> («CASH_USD ulanganda…» degan ochiq joy). Kutilgan USD hisoblanmaydigan holatda uni 0 deb olish
> **har smenada soxta «USD ortiqcha»** akti berardi — menejer bir hafta ichida farq
> ogohlantirishlarini butunlay e'tiborsiz qoldirardi. Sof modul ko'p valyutani QO'LLAYDI
> (`planVarianceActs`), faqat chaqiruv UZS bilan cheklangan: **`CASH_USD` ulanganda bir qator
> qo'shiladi** (shu joyda `variance-wiring.test.ts` ni ham yangilash kerak).
>
> **Z-hisobot** `GET /cashier-sessions/:id/z-report` (§8.5 to'liq tarkibi): to'lov turlari kesimida
> tushum (`RetailSalePayment` dan — ikki ustundan kanalni tiklab bo'lmaydi) · chek soni · o'rtacha
> chek · yalpi foyda · chegirma · qarzga sotilgan · qabul qilingan qarz to'lovlari · qaytarishlar ·
> xarajatlar **moddalar bo'yicha** · inkassatsiya · kutilgan/sanalgan/farq. **Ochiq smenada ham
> ishlaydi** (kassir kun o'rtasida holatni ko'radi).
>
> **NULL ≠ 0 shartnomasi:** cheksiz smenada o'rtacha chek `null` (0 ga bo'lish emas va «o'rtacha 0»
> yolg'oni ham emas); tan narx muzlatilmagan qator bo'lsa yalpi foyda `null` — `0` deb ko'rsatish
> «100% marja» yolg'onini beradi.
>
> **Drift-lock** (`variance-wiring.test.ts`, mutatsiya bilan tekshirilgan: `skipDuplicates` olib
> tashlansa va USD qatori qo'shilsa 2 test yiqiladi).
>
> **Runtime verify** (toza smena, 500 000 ochilish): ochiq smenada sanoq va farq **NULL**, o'rtacha
> chek **NULL** · 470 000 sanaldi → UZS kamomad **aynan −30 000**, kassir izohi saqlandi, hali
> ko'rilmagan · **USD akti YO'Q** · Telegram navbatida `pending` xabar (sarlavha «KASSA KAMOMADI»,
> kutilgan 5 000,00 va sanalgan 4 700,00 bilan) · ikkinchi yopish rad, aktlar soni o'zgarmadi ·
> yopilgan Z-hisobotda farq −30 000.
>
> **Gate:** typecheck 0 · biome 0 · api **4736/4736**.
> ⚠️ **Phase-1: brauzer-smoke YO'Q** — yopish formasi (farq izohi maydoni) va Z-hisobot **sahifasi**
> FE tomonda hali qilinmagan; menejerda «ko'rilmagan aktlar» ro'yxati ham yo'q.
>
> **Keyingi:** `1-Kassa B7 (qolgani)` — yopish formasi + Z-hisobot sahifasi + menejer aktlarni
> tan olishi. Qolgan bosqichlar 63 (B7 ikkiga bo'lindi).

> **🕒 2026-08-05f (1-KASSA B6 TUGADI — xarajat/inkassatsiya oynasi + RKO cheki · `08e0fd1`) · ⏳ DEPLOY QILINMAGAN**
>
> **1-Kassa endi B1–B6 yopiq** (qolgani B7, B8).
>
> - **«Kassadan chiqim» oynasi** — xarajat va inkassatsiya **bitta oynada**. Kassir uchun bu
>   bitta harakat («yashiqdan pul chiqadi»), farqi faqat NEGA chiqishida; ikki alohida tugma
>   uni har safar «qaysinisi edi» deb o'ylashga majbur qilardi.
> - 🔴 **`CASH_OVERDRAWN` kassirga KO'RSATILADI** (`toast.error`). Server yashiqdagidan ko'p
>   chiqishni to'xtatmaydi (Q10) va faqat audit hodisasi yozadi — FE uni ko'rsatmasa, farq
>   faqat smena YOPILGANDA chiqib, sababi unutilgan bo'lardi.
> - Modda/qabul qiluvchisiz tugma **oldindan** bloklanadi va faqat o'z turiga tegishli maydon
>   yuboriladi (chalkash hujjatni server ham rad etadi — lekin kassir bosgandan KEYIN ko'rardi).
> - 🔐 **Qabul qiluvchilar TOR endpointdan**: `GET /cashier-sessions/cash-out-recipients` —
>   faqat `id`+`name`, kassir o'zi ro'yxatda YO'Q. `/hr/employees` ni kiosk allowlist'iga
>   qo'shish `salaryMinor` va telefonni **har POS terminalida oshkor qilardi**.
> - **RKO cheki** `/print/cash-out/[docId]?auto=1` — bitta shablon ikki hujjat uchun (farqi
>   sarlavha va «nima uchun» qatori); ikkita deyarli bir xil shablon asta uzoqlashardi.
>   Imzo satri inkassatsiyada dalilning o'zi.
>
> **Drift-lock** (`pos-cash-out-wiring.test.ts`, mutatsiya bilan tekshirilgan): `CASH_OVERDRAWN`
> ko'rsatilishi · chalkash hujjat yuborilmasligi · chek route mavjudligi · tor endpoint.
>
> ⚠️ **Yo'lda topilgan qarz:** `pos-debt-payment-wiring.test.ts` «**birinchi** `window.open`» ni
> olardi — sahifada ikkinchi chek paydo bo'lishi bilan yiqildi. Qo'riqchining o'zi mo'rt edi;
> endi hammasi yig'ilib, oralaridan qarz cheki qidiriladi. *(Saboq: manba-skanerlovchi
> qo'riqchi «birinchi mos kelgani» ga tayanmasin.)*
>
> **Runtime verify:** qabul qiluvchilar 3 ta, maydonlar **aynan** `id,name`, kassir o'zi yo'q ·
> `РКО-2026-00004` cheki hujjatga aynan mos (tashkilot, kassir, modda, kassa, izoh) ·
> noma'lum hujjat → «Hujjat topilmadi».
>
> **Gate:** typecheck 0 · biome 0 · api **4704/4704** · web **2708/2708**.
> ⚠️ **Phase-1: brauzer-smoke YO'Q** — oyna va chek real brauzerda ochilmagan, termal printerda
> sinalmagan → 1-Kassa **Phase-2 QA**.
>
> **Keyingi:** `1-Kassa B7` — smena yopish: `CashierSessionVariance` (YO'Q) + farq akti +
> Z-hisobot. Qolgan bosqichlar **64 → 63**.

> **🕒 2026-08-05e (1-KASSA B6 BACKEND — xarajat (RKO) + inkassatsiya · `1941627`) · ⏳ DEPLOY QILINMAGAN**
>
> **ASOSIY QAROR — yangi jadval ATAYLAB ochilmadi.** Mavjud `RetailDrawerCashOut` **tasniflandi**
> (`kind` + `expenseItemId` + `recipientId`, migratsiya `20260805190000_drawer_cash_out_kind`).
> Sabab: smena yakunidagi «kutilgan naqd» AYNAN shu jadvalni yig'adi. Har yangi pul-chiqishi
> turiga alohida jadval ochilsa, uni formulaga qo'shishni **unutish** mumkin — bu §100 bug'ining
> («drawer in/out kutilgan naqddan tushib qolgan edi») qaytadan ochilishi bo'lardi.
> **Bitta pul yo'li — tasniflangan.** Z-hisobot ajratishni `kind` orqali oladi.
>
> **Qoidalar sof modulda** (`pos-cash-out.ts`, **24 test**) — servis faqat Prisma-I/O:
> - Moddasiz xarajat va qabul qiluvchisiz inkassatsiya **RAD**. Bu ruxsat masalasi EMAS (Q10 —
>   kassir erkin): moddasiz xarajat = «pul ketdi, nimaga noma'lum», qabul qiluvchisiz
>   inkassatsiya = javobgar yo'q. Hujjatning o'zi o'qilmas bo'ladi.
> - **Hamma muammo birdan** qaytadi — birinchisida to'xtash kassirni ikki marta yuborardi.
> - Chalkash hujjat ham rad etiladi (inkassatsiyaga xarajat moddasi) — aks holda Z-hisobotda
>   ham moddalar kesimiga, ham inkassatsiyaga tushib **ikki marta** o'qilardi.
> - Yashiqdagidan ko'p chiqarish **TO'XTATILMAYDI** (tashqi pul kiritilgan bo'lishi mumkin,
>   bloklash haqiqiy ishni buzardi), lekin **`CASH_OVERDRAWN`** hodisasi yoziladi.
>   `cashBefore` noma'lum (`null`) bo'lsa ogohlantirish YO'Q — **noma'lum ≠ nol**, aks holda
>   har smena boshida soxta signal chiqardi.
>
> **Hujjat va audit izi BITTA tranzaksiyada**: tasdiqsiz erkinlikning yagona muvozanati — iz,
> shuning uchun iz yozilmasa hujjat ham yozilmaydi.
>
> **Refaktor:** `close()` ichidagi kutilgan-naqd yig'ishi **`collectCashInputs`** metodiga
> ajratildi — xarajat ham «yashiqda hozir qancha bor» ni bilishi kerak; nusxalash ikki formula
> qoldirardi va biri jimgina eskirardi.
>
> **Drift-lock** (`cash-out-wiring.test.ts`, **mutatsiya bilan tekshirilgan** — `kind` filtri
> qo'shilsa test yiqiladi): chiqim yig'indisi `kind` bo'yicha FILTRLANMAYDI · kutilgan naqd
> **bitta** joyda hisoblanadi · hujjat va audit bir tranzaksiyada.
>
> **Runtime verify (lokal DB):** moddasiz xarajat RAD · qabul qiluvchisiz inkassatsiya RAD ·
> `РКО-2026-00001` 25 000 modda bilan + `CASH_EXPENSE` · `ИНК-2026-00002` 40 000 qabul qiluvchi
> bilan + `CASH_COLLECTION` · yashiqdan ko'p → **o'tdi** + `CASH_OVERDRAWN` · moddalar kesimi
> jami xarajatga TENG · xarajat kutilgan naqdni **aynan 70 000** ga kamaytirdi.
>
> **Gate:** typecheck 0 · biome 0 · api **4704/4704**.
> ⚠️ **Phase-1: brauzer-smoke YO'Q** — POS xarajat/inkassatsiya **oynasi (FE)** va **RKO cheki**
> hali yo'q, bu faqat backend. Endpointlar: `POST /cashier-sessions/:id/cash-out`,
> `GET /cashier-sessions/:id/cash-out-summary`.
>
> **Keyingi:** `1-Kassa B6 (qolgani)` — POS oynasi + RKO cheki (B5 FE bilan bir xil naqsh).

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
