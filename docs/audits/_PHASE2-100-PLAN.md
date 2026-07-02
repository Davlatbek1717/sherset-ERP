# PHASE-2 → 100% MASTER-PLAN (22 qolgan sahifa)

**Yozilgan:** 2026-06-10 (plan-sessiya; ijro — keyingi `davom et` sessiyalarida)
**Maqsad:** Phase-2 QA-backlog'ni **100%** ga yetkazish — 7/7 cohort runtime-verified, har biri dalil bilan.
**Hozirgi holat:** 🏁 **7/7 cohort ✅ — REJA TO'LIQ BAJARILDI (2026-06-10c, Session-3 bilan).** Catalog items
(`c67c78e8`) · Money/returns (08k) · Production-config (08l W1/W3 + 08o S1/S2/B4/P1) · Retail (RS1-3 + RS4-yozish
08o; RS4-display grounding-gated §6) · Stock+internal (`3add5a1`, 2026-06-10b — Loss-COGS HIGH fix) · Katalog B
(2026-06-10b) · **Cohort A (2026-06-10c: Session-2 seed-bor 7 + Session-3 demo-bo'sh 6 — Returns-COGS HIGH
`2f5d7ebf` + «Оплачено» `f797e769`)**. Bu «production-ready» EMAS (§0) — Phase-3/4 boshlanmagan; §6
grounding-gated ro'yxat ochiq.
**SESSION-1 (Cohort S+B) ✅ BAJARILDI 2026-06-10b.**
**SESSION-2 (Cohort A seed-bor 7) ✅ BAJARILDI 2026-06-10c** — A-battery 7/7 + browser 7/7 toza; clear-field
bug-class sweep 10 sahifa (`|| undefined`→`|| null`, guard +38); ~~🔴 OPEN Summa-input topilma~~ ✅ shu kuni
qism-2'da app-wide MoneyInput bilan TUZATILDI (`8313b69a`+`2ce81f2e`, §6).
**SESSION-3 (Cohort A demo-bo'sh 6) ✅ BAJARILDI 2026-06-10c** — A-battery 6/6 + browser 6/6 toza; 🔴 Returns-COGS
HIGH fix + 🟡 «Оплачено» raw-minor fix; audit: `_PHASE2-cohortA-session3-returns-cogs.audit.md`.

---

## 0. Ta'riflar — «100%» nimani anglatadi (halol chegara)

- **Phase-2 ✅ (sahifa)** = quyidagi B-battery (browser) + A-battery (API-adversarial) bandlari bajarilgan,
  topilgan har bug **shu sessiyada** tuzatilgan (issiq kontekst), guard-test qo'shilgan, gate yashil.
- **Phase-2 ✅ (cohort)** = cohort'ning barcha sahifalari ✅ + cohort-commit + NEXT.md QA-backlog header «⏳»→«✅».
- **100% = 7/7 cohort ✅.** Bu **«production-ready» degani EMAS** — global CLAUDE.md 4-fazali modelida bu faqat
  Phase-2 tugashi; Phase-3 (staging) va Phase-4 (gradual rollout) alohida turadi va bu reja doirasiga KIRMAYDI.
- **Grounding-gated istisnolar 100% hisobiga KIRMAYDI** (§6) — ular moysklad capture/foydalanuvchi inputisiz
  ko'r-ko'rona qilinmaydi (loyiha qoidasi: §4 label grounding). Ular alohida ro'yxatda turadi va foydalanuvchi
  capture bersa alohida sessiyada yopiladi.

## 1. Qolgan scope — 3 cohort / 22 sahifa

### Cohort S — Stock + internal (4) — Session-1
| Sahifa | Maxsus tekshiruvlar (QA-backlog'dan) | Eslatma |
|---|---|---|
| enters | standart battery | Phase-1 «toza» degan |
| losses | standart battery | Phase-1 «toza» degan |
| inventories | standart battery | «Дополнить из остатков/номенклатуры» = FEATURE-gap, QA EMAS — skip |
| internal-orders | **IO-1**: posted doc «Выполнено: <formatlangan sum>» (xom minor EMAS) · **IO-2**: externalCode edit→save→reload round-trip | IO-3 («Целевой склад»→«Склад»?) + IO-4 («План. дата приёмки»?) = CAPTURE-GATED → §6 |

### Cohort B — Katalog (5) — Session-1
| Sahifa | Maxsus | Eslatma |
|---|---|---|
| counterparties | edit-save round-trip (×11 `.nullish()` maydon, 08e klassi — null bilan FE-shaped PATCH), type-change, archive/restore | bank-account History 08n da verified — qayta qilinmaydi |
| products | yengil re-check: load + money + History-after-edit | edit-flow 06e da to'liq verified (`c67c78e8`) — faqat residual |
| projects | standart battery (settings-light) | |
| stores | standart battery (settings-light) | |
| uoms | standart battery (settings-light) | |

### Cohort A — Hujjat-detail (13) — Session-2 (7) + Session-3 (6)
**Session-2 (seed-bor):** customer-orders · demands · supplies · cash-in · cash-out · moves · payments-in
**Session-3 (yarmi demo-bo'sh — avval yozuv yaratiladi):** payments-out · invoices-in · invoices-out ·
sales-returns · purchase-returns · purchase-orders

Maxsus eslatmalar:
- **cash-in/cash-out:** posting kassa balansini o'zgartiradi → FAQAT o'z ZZ-QA doc'larida post/unpost, zanjir
  to'liq tozalanadi (08k pattern: unpost→delete, balans tiklanadi).
- **customer-orders:** optimistic-lock conflict-dialog 08d da browser-verified — qayta qilinmaydi; qolgan battery.
- **payments-in:** org-account scope 06c da browser-verified — qayta qilinmaydi; qolgan battery.
- **demands:** «Грузополучатель» ustuni = BE-include DEFER (list-axis) — detail-QA scope'iga kirmaydi.
- **moves:** L4 money-fix (`r.currency`) cell-render'ini browserda ko'rish.

## 2. Metod — «ikki yarim» modeli (tezlik × sifat)

Har sahifaning Phase-2 ishi ikki yarimga bo'linadi:

**A-battery (API-adversarial yarim) — parallel agentlar bajaradi** (Workflow fan-out, har sahifaga 1 agent):
- A1. Login (`admin@demo.local`/`admin123`, BASE `http://localhost:4000/api/v1`); sahifa kodidan API path va
  **FE-shaped save payload**ni chiqarish (save handler'ni o'qib — taxmin EMAS).
- A2. ZZ-QA-prefiksli yozuv yaratish → 201 (demo-bo'sh entitylarda bu majburiy birinchi qadam).
- A3. GET detail → sahifa render qiladigan maydonlar javobda BOR (include'lar joyida — POS-crash klassi).
- A4. Edit-save round-trip **FE-shaped payload** bilan, bo'sh optional'lar `null` qilib → 200 (08e klassi).
- A5. FSM bo'lsa: post → 200 + state; `GET /audit-logs?entity=<slug>&entityId=` → qatorlar BOR, har action
  `audit.action_*` lug'atida resolve bo'ladi (08l/08m klassi); unpost → tiklanadi.
- A6. Money: `sumMinor` string'lar, totals = positions yig'indisi (F20 klassi spot-check).
- A7. Tozalash: o'z yozuvlarining HAMMASI o'chiriladi, FAQAT bitta draft browser uchun qoldiriladi (URL qaytariladi).
- Har band uchun **dalil** (real status-kod + javob parchasi) — da'vo emas.

**B-battery (browser/visual yarim) — operator (men) serial bajaradi** (Playwright MCP):
- B1. Seed yozuvni ochish — crash yo'q, console error yo'q.
- B2. Money cell'lar formatlangan (xom minor yo'q, suffix to'g'ri).
- B3. RU lokal sweep (label/tugma/sarlavha kirill, Latin-uz leak yo'q) + UZ spot-check.
- B4. Maydon tahrirlash → Save → 200 + re-render.
- B5. FSM tugma («Провести») → state badge + History tab qatorlari lokalizatsiyalangan.
- B6. Sahifa-maxsus bandlar (recon checklist'idan, masalan IO-1/IO-2).
- B7. Throwaway yozuvni ConfirmDialog (`role=dialog`) orqali o'chirish — tozalash ham smoke.

**Nega bu professional:** API-yarim to'liq parallellashadi (eng katta vaqt yutuq), browser-yarim esa baribir
bitta MCP brauzerga bog'liq (serial) — operator faqat vizual hukm talab qiladigan ishni qiladi. Hech bir band
qisqartirilmaydi.

## 3. Workflow agent shartnomasi (Session-1..3 da aynan shu ishlatiladi)

- **Model:** agentlar sessiya modelini inherit qiladi (loyiha §0: `model:'sonnet'` UZATILMAYDI).
- **TAQIQLAR (har prompt'da, 08c stash-hodisasi protokoli):** hech qanday git buyrug'i YO'Q · fayl tahriri YO'Q ·
  mavjud seed-yozuvlar holatiga TEGILMAYDI (post/unpost faqat o'z ZZ-QA doc'larida) · faqat read-only kod-o'qish +
  jonli API probe + o'z yozuvlarini tozalash.
- **Output (StructuredOutput JSON):**
  `{page, apiPath, entitySlug, seededRecordId, seededRecordUrl, apiResults:[{check,status:pass|fail|skipped,evidence}], browserChecklist:[…], suspectedBugs:[{severity,desc,file,evidence}], deferred:[…]}`
- **Operator trust-but-verify (§2):** har agent natijasidan keyin men kamida 1 ta apiResult'ni mustaqil
  qayta-tekshiraman (random sample) + suspectedBugs'ning har birini ground-truth qilaman.

## 4. Sessiya taqsimoti va commit kadansi

| Sessiya | Ish | Hajm | Commit |
|---|---|---|---|
| **Session-1** | Cohort S (4) + Cohort B (5): 9-agent fan-out → browser → fix'lar | 9 sahifa | 2 commit (`fix(qa): phase-2 stock+internal …`, `fix(qa): phase-2 katalog …`) |
| **Session-2** | Cohort A birinchi yarim (seed-bor 7) | 7 sahifa | 1 commit |
| **Session-3** | Cohort A ikkinchi yarim (demo-bo'sh 6, avval yozuv yaratish) + **yakuniy 100% wrap-up** | 6 sahifa | 1-2 commit |

Wrap-up (Session-3 oxiri): NEXT.md QA-backlog'da 7/7 header ✅ · MEMORY.md yakuniy entry · halol yakuniy hisobot
(«Phase-2 100%; Phase-3/4 boshlanmagan; grounding-gated ro'yxat alohida»).

Sig'im qoidasi: sessiya erta tugasa keyingi cohort'dan ish oldinga tortiladi; sig'masa qolgani aniq sahifa-ro'yxat
bilan keyingi sessiyaga o'tadi (hech qachon «yarim-verified» deb belgilanmaydi).

## 5. Har sessiya pre-flight (majburiy, o'zgarmas)

1. `NEXT.md` + `MEMORY.md` **yangidan** o'qish (parallel-sessiya drift'iga qarshi — 08e protokoli).
2. Anti-konfabulyatsiya: `node scripts/verify-optimistic-lock-smoke.mjs` → **180/180** (yoki joriy son) yashil.
3. Stack: web :3100 · api :4000 · db :5433 listening; bo'lmasa `pnpm dev` + `pnpm db:seed`.
4. Playwright MCP: orphaned mcp-chrome profil-lock bo'lsa chrome tree kill (takrorlanuvchi hodisa).
5. Gate baseline: joriy api/web Vitest sonlarini yozib olish (regress-nuqta).

## 6. Grounding-gated istisnolar (100% hisobiga KIRMAYDI — foydalanuvchi capture/input kutilmoqda)

| Item | Nima kerak |
|---|---|
| ~~Summa-input scale (money-header docs)~~ ✅ **HAL QILINDI 2026-06-10c** | App-wide MoneyInput (som display, tiyin storage) — foydalanuvchi «to'liq app-wide» dedi → PositionEditor + barcha money doc/prepayment/adjustment/payroll/product money input som-entry'ga o'tdi (`8313b69a` + consumer commit). Browser-proven E2E. **Qolgan kichik surface:** list-page «Сумма от/до» filterlari (~25 sahifa, number-state, lower-risk) — alohida follow-up. |
| RS4-display: DS `formatMoney` `/100` hardcode (non-2-decimal valyuta displayi) | moysklad non-UZS retail kassa capture — DS-wide ish |
| IO-3/IO-4: internal-orders «Целевой склад»→«Склад»? / «План. дата приёмки»? | toza Внутренний-заказ edit-form capture (mavjudi buzuq: `<title>Корзина</title>`) |
| boms cost-split («Оплата труда»/«Затраты на производство») | production module capture |
| work-orders docDate (BE column yo'q) | capture + BE schema qarori |
| «От кого»/«Основание» drawer maydonlari (retail) | BE columns + capture |
| inventories «Дополнить из остатков/номенклатуры» | FEATURE (stock-balance integratsiya) — QA emas |

**Foydalanuvchiga so'rov:** bu 6 item ham yopilsin desangiz — moysklad'dan tegishli capture'larni
(`internalorder` edit-form, production module, non-UZS retail) berib qo'ying; alohida grounding-sessiya qilamiz.

## 7. Risk reestri

- **Kassa/stok balans korruptsiyasi:** agentlar faqat O'Z doc'larini post/unpost qiladi, zanjir teskari tartibda
  tozalanadi (unpost→delete). Sessiya oxirida balanslar spot-check.
- **MCP brauzer artefaktlari:** hard-nav `/auth/refresh` 401 → SPA-nav ishlatish (ma'lum artefakt, bug emas).
- **Parallel sessiya to'qnashuvi:** faqat o'z fayllarini commit qilish, `git stash/reset` YO'Q, NEXT.md append-only.
- **Agent over-claim:** §2 trust-but-verify — random sample + har suspectedBug ground-truth; dalilsiz «pass» rad etiladi.
- **Demo-bo'sh entitylar:** Session-3 sahifalari uchun A2 (create) majburiy birinchi band — agent buni biladi.

## 8. Muvaffaqiyat mezoni (yakuniy hisobot formati)

Session-3 oxirida: «Phase-2: **7/7 cohort ✅ (100%)**, N sahifa runtime-verified, M bug topildi+tuzatildi
(har biri guard bilan), gate: api tcX/webX/Vitest±. Grounding-gated K item ochiq (capture kutilmoqda).
Phase-3/4 boshlanmagan — production-ready da'vosi YO'Q.»
