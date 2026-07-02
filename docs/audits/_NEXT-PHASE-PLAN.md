# Keyingi faza rejasi — Detail-konveyerdan keyin (2026-06-04)

> **Maqsad:** detail-audit konveyeri (63/63 Phase-1) tugadi. Bu hujjat qolgan **butun ishni**
> aniq, cron «davom et» bilan haydaydigan navbatga aylantiradi — xuddi detail-konveyer kabi.
> Har birlik **Phase-1, browser-smoke YO'Q** deb halol belgilanadi.

---

## 0. Uchta track (cron-mosligi bo'yicha)

| # | Track | Joy | Holat |
|---|---|---|---|
| **1** | **LIST-page parity audit (Phase-1)** | **CRON** (strukturaviy, brauzer kerak emas) | 0/12 cohort — **cron birinchi shu yerda ishlaydi** |
| **2** | **Phase-2 detail browser QA** | **LOKAL** (DB@5433 + `pnpm dev` + Playwright) | 0/12 cohort — men+siz lokal sessiyalarda |
| **3** | **BE-backlog** (auditLog-write + endpointlar) | **CRON** (backend kod) | Track 1 tugagach navbatda |

Track 1 (cron) va Track 2 (lokal) **parallel** boradi — bir-biriga xalaqit bermaydi.

---

## 1. TRACK 1 — LIST-AUDIT KONVEYER (cron «davom et» shuni qiladi)

### 1a. Jarayon (detail bilan bir xil, isbotlangan)
Har «davom et» = 1 list-cohort:
1. NEXT.md → «LIST-AUDIT navbati»dan keyingi cohort'ni oladi.
2. **List-dvigatel** (`scripts/wf-cohort-list-audit.js` — quriladi) bilan auditlaydi:
   premise (referens auto-correct + bias-immunize) → per-page list-diff → completeness-critic → blind refute-verify.
3. Har confirmed delta **DOM-rol bilan ground-truth** (§4) — ko'r-ko'rona qo'llanmaydi.
4. Fix → **gate** (typecheck 0 · biome 0/0 · i18n-key ru+uz · no-hardcoded · web Vitest no-regress).
5. **Phase-1 halol commit** (`fix(list): cohort … (N/12)`) + `git push origin main`.
6. Audit doc (`docs/audits/<page>-list.audit.md`) + `progress.json` yangilanadi.
7. **12/12 da** konsolidatsiya hisoboti yoziladi va **to'xtaydi**.

### 1b. List-dvigatel nimani auditlaydi (detail'dan FARQI)
List-page parity o'qi (moysklad list-capture yoki sibling-parity bilan):
- **Column set + labellari** (DOM-rol/§4 — grep-count emas) — moysklad ustunlari bormi, tartibi, nomi.
- **Filtrlar** (status/sana/counterparty/store/… filter chiplari + saqlangan filtrlar).
- **Sort** (har ustun sort qilinadimi, default sort).
- **Bulk-actions** (tanlash + bulk-delete/transition/export dropdown).
- **Toolbar** (Create tugma + nomi, import/export, print, refresh).
- **Empty-state** (matn + CTA), **pagination/infinite-scroll**, **row-click → detail**.
- **Money/sana formati** (formatMoney, sana-locale) — detail bug-class'lari list'da ham.
- **i18n** (Cyrillic + Latin-uz leak — no-hardcoded gate-blind class).

### 1c. LIST-cohort navbati (detail oilalariga MOS — 12 cohort)
> Har cohort boshida engine premise-fazasi aniq sahifa ro'yxatini tasdiqlaydi (detail'dagidek).

- **L1 · Money-docs lists:** cash-in · cash-out · payments-in · payments-out · prepayments · prepayment-returns · counterparty-adjustments
- **L2 · Sales lists:** customer-orders · demands · invoices-out · sales-returns
- **L3 · Purchase lists:** supplies · purchase-orders · invoices-in · purchase-returns · commission-reports · consignments · factures-in · factures-out
- **L4 · Stock/internal lists:** moves · enters · losses · inventories · internal-orders
- **L5 · Production lists:** productions · processings · processing-orders · production/boms · production/processes · production/stages · production/work-orders
- **L6 · Catalog lists:** products · product-folders · bundles · services · variants · tracking-codes
- **L7 · CRM lists:** counterparties · contact-persons · opportunities · tasks · pipelines
- **L8 · E-commerce/pricing lists:** ecommerce/channels · ecommerce/orders · discounts · price-lists · price-types
- **L9 · HR lists:** payrolls (+ hr/* agar parity-scope'da)
- **L10 · Retail lists:** retail/sales · retail/sessions
- **L11 · Settings-finance lists:** settings/bank-accounts · cash-desks · expense-items · tax-rates · currencies · exchange-rates · mxik
- **L12 · Settings-org lists:** settings/organizations · regions · custom-entities · publications · label-templates · users · stores · uoms · projects · webhooks · attributes · print-templates · task-types

---

## 2. TRACK 2 — Phase-2 DETAIL BROWSER QA (lokal, cron EMAS)
- **Stack:** PostgreSQL `moysklad_dev` @5433 · `pnpm dev` (turbo) · `pnpm db:seed`/`seed-real` · Playwright MCP.
- **Cohort tartibi:** detail A→L (eng yuqori-risk avval: D money/returns, G CRM data-integrity, F catalog Save-404 class).
- **Tekshiruv (global CLAUDE.md adversarial QA):** real Save/edit/transition · concurrency (2+ user) · timeout/abort · data-integrity (Decimal vs float, currency snapshot) · edge (null/unicode/overflow) · authorization (role matrix).
- **Natija:** sahifa «Phase-1» → «Phase-2 verified»; topilgan buglar issiq-kontekstda darhol tuzatiladi.

---

## 3. TRACK 3 — BE-BACKLOG (cron, Track 1 tugagach)
- **auditLog-write feature:** money-docs · variants · online-orders · price-lists — `userId` threading + `auditLog.create` (History tab'lar bo'sh; cross-cutting).
- **users/[id] edit + role:** GET `/admin/employees/:id` · GET `/admin/roles` · POST roles · PATCH · archive/restore.
- **Mayda:** bank-account missing fields · currency-change guard · tax-rate 409-map · hr/employees permissions+salary subroutes.

---

## 4. Cron «davom et» kontrakti (bitta run)
1. `git fetch` + NEXT.md o'qi → joriy track + keyingi cohort.
2. Dvigatel → ground-truth (§4) → fix → gate (hammasi yashil bo'lishi shart, aks holda commit YO'Q).
3. Phase-1 halol commit (`done/verified/tugadi` so'zlari YO'Q — honesty-hook) + `git push origin main`.
4. NEXT.md/progress/MEMORY yangilab, audit doc yoz.
5. Track tugasa → konsolidatsiya hisoboti + keyingi track'ga o't (yoki to'xta).
6. **Har birlik: «Phase-1, browser-smoke YO'Q».**

## 5. «Avval professional» — cron yoqishdan oldin quriladi
- [ ] `scripts/wf-cohort-list-audit.js` — list-dvigatel (detail engine'ni 1b o'qiga moslab).
- [ ] List-audit doc shabloni + `progress.json` list-audit hisoblagichi (12-cohort denominator).
- [ ] NEXT.md «LIST-AUDIT navbati» bo'limi (cron o'qiydi).
- [ ] Cron routine (chat tugagach yoqiladi).
