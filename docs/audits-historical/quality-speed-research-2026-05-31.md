# Sifat-tushmasdan tezroq ishlash uchun real choralar (2026-05-31)

## 1. Hozir mavjud (lekin yetarli ishlatilmagan) — quick wins

Loyihada allaqachon o'rnatilgan, lekin sistematik ishlatilmaydigan asboblar:

**1.1. `superpowers:verification-before-completion` skill — eng katta drift davosi**
- Iron Law: *"NO COMPLETION CLAIMS WITHOUT FRESH VERIFICATION EVIDENCE in current message"*
- Hozirgi drift: `NEXT.md "26/56"` vs `progress.json "16/56"` vs honest recount "22/57" — bir loyihada 3 xil raqam
- **Qabul qilish**: har sessiya oxirida claim qilishdan oldin `pnpm progress` ishga tushir, output'ni commit message'ga embed qil
- ROI: drift class'ini butunlay yopadi (~1 sessiyaga teng "qaytadan hisoblash" ishini har oy yo'qotadi)

**1.2. `subagent-driven-development` skill + `Agent({model: "sonnet"})`**
- CLAUDE.md global qoidasi allaqachon mavjud, lekin amalda kam ishlatilmoqda
- Sonnet implementer + Opus reviewer naqshi token'ni 3-5x kamaytiradi
- **Qabul qilish**: aniq spec bor sessiyalarda (Phase-2 list audit) avtomat Sonnet dispatch
- File: `C:/Users/user/.claude/plugins/cache/claude-plugins-official/superpowers/5.1.0/skills/subagent-driven-development/SKILL.md`

**1.3. `scripts/progress-report.ts` — anti-inflation truth source**
- Allaqachon yozilgan, `pnpm progress` ishlaydi, lekin NEXT.md manual update'ga qaramlik saqlanmoqda
- **Qabul qilish**: NEXT.md raqamlarini olib tashla, faqat `docs/progress.json` link qoldir; pre-commit hook'ga `pnpm progress` qo'sh (drift'ni yozish jarayonida ushlaydi)

**1.4. `scripts/smoke-mass-edit.sh` — 13/23 endpoint ishlatilgan, lekin 91% gap**
- Live-smoke faqat 8.8% destructive endpoint'larni qamrab oladi (13/147)
- **Qabul qilish**: bash'ni generic `smoke-bulk.sh` ga fork qil (endpoint shape arg), bulk-delete/archive/restore'ni qamrab ol; "adversarial pack faqat birinchi modulda" bug'ini olib tashla (har modulda ishlasin — payload shape bir xil)

**1.5. Shared backend helpers — to'liq tayyor, ko'pchilik bilmaydi**
- `apps/api/src/modules/shared/bulk.ts` — `BulkIdsSchema` + `runBulk` (Promise.allSettled)
- `apps/api/src/modules/shared/mass-edit.ts` — `MassEditBaseSchema` + `assertPatchHasAtLeastOneField`
- `apps/api/src/modules/shared/mass-print.ts` — `BulkMarkPrintedSchema`
- 51 endpoint `/bulk-delete`, 27 `/bulk-transition`, 23 `/mass-edit` — naqsh isbotlangan, har yangi modul **majburiy** shu helper'ni ishlatishi kerak

**1.6. Shared frontend hooks**
- `apps/web/src/hooks/use-bulk-actions.tsx::useBulkDocumentActions` — bitta hook butun bulk action bar'ni qaytaradi (`selectedIds`, `bulkDelete`, `bulkTransition`, `bulkArchive`, `bulkRestore`, `massEdit`, `bulkPrint`, `bar`, `listViewProps`)
- `apps/web/src/components/document-detail/` — 33/36 detail page foydalanadi, lekin yangi sahifalar README skeleton'ni o'qimasdan boshlanadi
- **Qabul qilish**: har yangi list/detail sahifa boshida `README.md` skeleton template'ni o'qish majburiy

**1.7. `Playwright toMatchAriaSnapshot()` — eng katta hozirgi yetishmovchilik**
- Playwright stack'da, narx 0, hozirgi `metadata.json` qo'lda diff'idan 10-20x tezroq
- URL: https://playwright.dev/docs/aria-snapshots
- **Qabul qilish**: 22 mavjud audited sahifaga `.aria.yml` golden file qo'sh — CI'da regression auto-detect

---

## 2. Real internet'dan topilgan eng yaxshi 5 ta texnika

| # | Texnika | URL | Nima uchun bu loyiha uchun |
|---|---------|-----|---------------------------|
| 1 | **Playwright ARIA snapshots** | https://playwright.dev/docs/aria-snapshots | YAML accessibility-tree diff — toolbar/dropdown parity uchun mukammal granularity. Git-diff'able, human-readable. `--update-snapshots` regeneratsiya. Bepul, stack'da bor |
| 2 | **Martin Fowler — Feature Parity pattern** | https://martinfowler.com/articles/patterns-legacy-displacement/feature-parity.html | Aynan "big bang parity" tuzog'iga ogohlantirish. End-to-end business-process slicing tavsiya qiladi (15-20 process vs 145 fragment). Loyihaning hozirgi "0/66 detail" gap muammosini hal qiladi |
| 3 | **Playwright MCP server** | https://github.com/microsoft/playwright-mcp + https://www.builder.io/blog/playwright-mcp-server-claude-code | Claude'ga live browser accessibility-tree beradi. Locator'lar real DOM'dan tug'iladi, taxmin qilinmaydi. Trace-native generation $0.02-0.08/test |
| 4 | **Spec-driven development (Kiro/Spec Kit)** | https://www.augmentcode.com/guides/what-is-spec-driven-development | Feb 2026 study: 110k AI bug production'da "vibe coding" tufayli. Executable spec → plan → atomic task. Loyihaning `PARITY-AUDIT-PROTOCOL.md` ni shu naqshga ko'tarish kerak |
| 5 | **Applitools Visual AI / Argos hybrid** | https://argos-ci.com/ + https://applitools.com/ | Anti-aliasing, font, subpixel diff'ni avto-suppress qiladi. Moysklad.uz live data (counters, dates, avatars) noise-dominated bo'ladi — pixel diff'siz ishlamaydi. Argos = Playwright bilan 1-2 soat setup, bepul tier |

Qo'shimcha (lekin past ROI): Percy (commits-based baseline, cross-product uchun yaramaydi), Chromatic (Storybook-centric, mos kelmaydi), Browser-Use (overkill — exploration kerak emas, capture ishlamoqda).

---

## 3. Eng yaxshi natija beradigan 10 ta amaliy chora

### #1. `pnpm audit:module <name>` — kompozit CLI

- **Nima qiladi**: `capture-moysklad` → metadata diff → smoke → typecheck → module-scoped test → stage → draft commit message — bitta verb'da
- **Sifat ta'siri**: capture+diff+smoke har doim birga ishlaydi — "live smoke unutdim" drift'ini yopadi
- **Tezlik ta'siri**: per-module overhead 30-45min → 3min CLI; 34 unaudited sahifa × 15min = ~8 sessiya tejaladi
- **Effort**: 2-3 soat (mavjud script'larni `scripts/audit-module.ts` da kompozit qilish)
- **Fit**: dominant workflow ("Sessiya 1 — 6 modul captured+audited+committed") to'liq mos
- **Yangi fayl**: `D:/projects/moysklad/scripts/audit-module.ts`

### #2. Playwright ARIA snapshot baseline — 22 audited sahifaga retroactive

- **Nima qiladi**: har list page uchun `*.aria.yml` golden file; `toMatchAriaSnapshot({name: 'sales-orders-toolbar.aria.yml'})`; strict `children: 'equal'` toolbar/dropdown'da, partial dinamik content'da
- **Sifat ta'siri**: `"26/56"` claim qilib bo'lmaydi agar 4 ta `.aria.yml` CI'da fail bo'lsa — drift class butunlay yopiladi
- **Tezlik ta'siri**: per-page audit ~2 soat → ~15 min (capture once, regenerate on demand)
- **Effort**: 1 sessiya (capture-moysklad-aria helper + 22 baseline file)
- **Fit**: mavjud capture harness va Playwright stack'ni qayta ishlatadi
- **Anti-inflation**: file IS source of truth

### #3. Business-process slice tracking (Fowler) — `22/57` o'rniga `4/18 process`

- **Nima qiladi**: 57 list + 66 detail + 22 modal = 145 surface'ni 15-20 macro process'ga bo'l (Sales, Purchase, Production, Inventory-Count, Money-In, Money-Out, HR-Hire, HR-Pay, Retail-Sale ...). Slice = list+detail+create+edit+bulk+relations
- **Sifat ta'siri**: detail audit'ga skip imkoniyati yo'qoladi — har slice'ga ichkari kiradi; F (Inter-connections) checklist majburlanadi
- **Tezlik ta'siri**: cognitive overhead "101 sessiya qoldi" → "15-20 slice, 5-7 sessiya har biri"; demolar ko'rinadi (user qabul qilishi mumkin)
- **Effort**: 1 sessiya — `MOYSKLAD-PARITY-AUDIT-PROTOCOL.md` ni qayta yozish
- **Fit**: hozirgi `0/66 detail` gap'ni hal qiladi

### #4. `progress-report.ts` pre-commit hook

- **Nima qiladi**: `.husky/pre-commit` ga `pnpm progress && git add docs/progress.json` qo'sh
- **Sifat ta'siri**: NEXT.md raqami va reality o'rtasidagi drift yozish jarayonida ushlanadi
- **Tezlik ta'siri**: sessiya boshida "haqiqiy raqam nima?" tergov vaqti yo'qoladi (~10-15min/sessiya)
- **Effort**: 5 daqiqa
- **Fit**: scripts allaqachon yozilgan, faqat hook'ga ulanish

### #5. Sonnet subagent default — Phase-2 list audit uchun

- **Nima qiladi**: ARIA snapshot bor sahifalarda spec aniq — `Agent({model: "sonnet", prompt: <CLAUDE.md template>})` dispatch
- **Sifat ta'siri**: trust-but-verify pattern + adversarial review Opus'da
- **Tezlik ta'siri**: token sarfi 3-5x kamayadi, parallelizm imkoni
- **Effort**: 0 (skill mavjud, CLAUDE.md qoida bor — faqat amalda ishlatish)
- **Fit**: aniq spec (capture metadata) + isbotlangan naqsh (money-docs-menu) = Sonnet'ga ideal
- **Cheklov**: 2-3 parallel ceiling (4 parallel session limit'ga urilgan tarix bor)

### #6. Generic `smoke-bulk.sh` — 8.8% → 68% destructive endpoint coverage

- **Nima qiladi**: `smoke-mass-edit.sh` ni endpoint shape arg oladigan generic versiya, bulk-delete/archive/restore qamrab ol; adversarial pack har modulda ishlasin
- **Sifat ta'siri**: 91.2% destructive endpoint live-verified emas hozir — silent regression xavfi katta
- **Tezlik ta'siri**: yangi modul audit'ida "live verified" claim oson
- **Effort**: 2-3 soat (bash refactor + smoke jadval)
- **Fit**: mavjud `pnpm smoke <module>` naqshini kengaytirish

### #7. Capture harness `08-selection-1` bug fix

- **Nima qiladi**: 95% capture failure (Playwright selector timeout) — silent uncovered 22 module
- **Sifat ta'siri**: capture metadata'ning eng muhim state'i (qator tanlangan toolbar) yo'q bo'lib chiqdi — parity audit yarim
- **Tezlik ta'siri**: hozir har modulda manual capture qayta urinish ~10-15min — bug yopilsa avto
- **Effort**: 1-2 soat (firstRowSelector hozir to'g'rilangan, lekin 08-selection-1 alohida tekshirish kerak)
- **Fit**: blocker — capture-compare-fix workflow'ning birinchi qadami buzilgan

### #8. Shared `useBulkDocumentActions` hook — har yangi list page'da majburiy

- **Nima qiladi**: 17 detail page allaqachon `document-detail` shell'dan foydalanadi, lekin list page'da `use-bulk-actions` kam tarqalgan — har yangi list audit'da copy-paste o'rniga hook ishlatish
- **Sifat ta'siri**: bulk action UX bir xil, naqsh isbotlangan (counterparties + projects)
- **Tezlik ta'siri**: per-list page bulk action coding ~1 soat → ~10min
- **Effort**: 0 (hook bor, faqat sessiya boshida `README` o'qish odat)
- **Fit**: PARITY-AUDIT-PROTOCOL.md'da B (Bulk actions) qadami uchun default

### #9. Skill `parity-audit-runner` yarat (`skill-creator` orqali)

- **Nima qiladi**: capture → diff → fix → smoke → commit workflow'ni reusable skill sifatida package; `/parity-audit <module>` slash command
- **Sifat ta'siri**: PARITY-AUDIT-PROTOCOL.md har sessiyada o'qilmasligi xavfi yo'qoladi (skill avto-trigger)
- **Tezlik ta'siri**: yangi sessiya boshlanish vaqti ~5-10min → 0 (skill prompt yuklab oladi)
- **Effort**: 2-3 soat (`writing-skills` skill'ni followup qilish)
- **Fit**: solo dev — protocol'ni esda saqlash o'rniga avtomatlashtir
- **File**: `~/.claude/skills/parity-audit-runner/SKILL.md`

### #10. `superpowers:writing-plans` — har "Plan-N" sessiya boshida

- **Nima qiladi**: 2-5 min step, full code blocks, exact test commands + expected output. Hech narsa placeholder qabul qilmaydi
- **Sifat ta'siri**: sessiya o'rtasida "shu narsani qanday qilamiz?" pauza yo'q — qaror oldindan
- **Tezlik ta'siri**: implementation 2-3x tez (qaror qabul qilish vaqti yo'q)
- **Effort**: 1 sessiya har "Plan-N" boshida (lekin tejov bir necha sessiya bo'yicha)
- **Fit**: Analytics moduli kabi katta sub-loyihalarda majburiy
- **File**: `docs/superpowers/plans/2026-05-31-<feature>.md`

---

## 4. Workflow naqsh (per sessiya turi)

### List page Phase-2 sessiya

```
1. pnpm progress                                  # ground truth, drift check
2. pnpm capture-moysklad <module>                 # reference state
3. cat docs/moysklad-reference/<module>/states/metadata.json | review delta
4. Dispatch Sonnet subagent (CLAUDE.md template):
   - scope: dropdown menu items + i18n keys
   - mirror: apps/web/src/components/money/document-toolbar-menus.tsx
   - quality gates: typecheck + module test + capture-diff zero
   - return: file diff summary + commit draft
5. Trust-but-verify: git diff + pnpm typecheck + pnpm test --filter
6. pnpm smoke <module>                            # live verify
7. Update .aria.yml baseline                      # toMatchAriaSnapshot
8. Commit (Husky auto-runs progress hook)
9. Append session-YYYY-MM-DD.md
```

**Sessiya 1-tasi: 4-6 modul** (currently: 1-3)

### Detail page audit sessiya

```
1. Identify business-process slice (Sales-Order, etc.) — NOT individual detail page
2. pnpm capture-moysklad <module> + open detail page state manually
3. Compare against apps/web/src/components/document-detail/ skeleton
4. Slice-DoD: list + detail + create modal + edit modal + bulk + relationships
5. .aria.yml golden for detail toolbar + meta panel + position table
6. Live smoke: detail GET, edit POST, relationship navigation
7. Commit per-slice (not per-page) — feat(sales-orders): slice complete
```

**Sessiya 1-tasi: 1 slice (5-7 surface)** = Fowler naqshi

### Test depth sessiya

```
1. pnpm progress → identify modules with <20% test coverage
2. Pick 1 module (current: 97/204 schema-only = 47.5% shallow)
3. TDD strictly: RED test first → verify RED → GREEN → verify GREEN
4. Integration > unit for parity logic (real DB, not mocked)
5. Adversarial cases: null, empty, unicode, concurrent, FK
6. Commit batches per layer: schema → service → controller → e2e
```

### Modal audit sessiya

```
1. Modal capture state alohida: capture-moysklad <module> --state modal-create
2. .aria.yml: modal title + form fields + buttons (children: 'equal')
3. MassEditModal hideOwner/hideProject if needed (per session memory pattern)
4. Live smoke: modal open → fill → submit → close → list refresh
5. Adversarial: validation errors, network fail mid-submit, double-click submit
```

---

## 5. Avtomatlashtirish opportunities

### 5.1. `scripts/audit-module.ts` (yuqorida #1) — har sessiya boshida ishlatiladi

```typescript
// pnpm audit:module sales-orders
// → capture + diff + smoke + typecheck + test + stage + commit-draft
```

### 5.2. `scripts/scaffold-module.ts` — yangi modul skeleton

```bash
pnpm scaffold:module <name> --pattern=document|catalog|setting
# Creates: api controller+service+test+module + web list+detail+create
# Mirrors: existing isbotlangan modulni shabloni (counterparties/sales-orders)
```

- Hozir: yo'q (no yeoman/plop/hygen)
- Effort: 4-6 soat
- ROI: yangi modul ~4 soat → ~30 min

### 5.3. Pre-commit hook kengaytma

`.husky/pre-commit`:
```bash
npx lint-staged
pnpm progress && git add docs/progress.json
# Optional: pnpm typecheck if staged .ts files
```

- Effort: 10 daqiqa
- ROI: drift class butunlay yopiladi

### 5.4. GitHub Actions CI — hozir `.github/` yo'q

```yaml
# .github/workflows/quality-gate.yml
- pnpm typecheck
- pnpm test
- pnpm smoke:all (against ephemeral postgres)
- aria snapshot regression check
```

- Effort: 2-3 soat
- ROI: pushdan oldin local-only gates — server-side gate yo'q (regression xavfi)

### 5.5. `scripts/extend-smoke.ts` — bulk-delete/archive/restore generic smoke

- Hozir: `smoke-mass-edit.sh` bash, 13 endpoint
- Maqsad: 100+ endpoint coverage, har payload shape uchun adversarial pack
- Effort: 2-3 soat
- ROI: 8.8% → 68% destructive endpoint live-verified

### 5.6. `scripts/capture-aria-snapshot.ts` — Playwright ARIA wrapper

- Mavjud `capture-moysklad-lib.ts` ni qayta ishlatadi, `.aria.yml` chiqaradi
- Effort: 3-4 soat
- ROI: parity oracle (truth source)

### 5.7. `RemoteTrigger` / `CronCreate` — off-hours captures

- `capture-moysklad` Playwright sekin (~30-60min/sessiya hozir burn qiladi)
- Cron: kechasi `pnpm capture-moysklad --all --refresh` ishlatish
- Effort: 30 daqiqa
- ROI: ish sessiyalari faqat fix/audit'ga sarflanadi

---

## 6. Halol "ROI ranking" — birinchi 5 ta

| Rank | Chora | Nima uchun bu birinchi |
|------|-------|------------------------|
| 1 | **`pnpm audit:module <name>` kompozit CLI** (#1) | Mavjud script'larni birlashtirish — yangi kod minimal. Har sessiyada 30-45min tejaydi. 34 sahifa × 15min = ~8 sessiya. Capture+diff+smoke har doim birga = drift yo'qoladi. **Boshlanish narxi 2-3 soat, qaytim har sessiyada.** |
| 2 | **Playwright ARIA snapshot baseline** (#2) | Truth source: file IS reality. "26/56 vs 22/57" muammosi to'liq yopiladi (drift'ni CI ushlaydi). Bepul, stack'da bor, 1 sessiya setup. Har keyingi audit 10-20x tezroq. |
| 3 | **`progress-report` pre-commit hook** (#4) | 5 daqiqalik chora — drift yozish jarayonida ushlanadi. Sessiya boshida "haqiqiy raqam nima?" tergov yo'qoladi. **Eng past effort/yuqori impact nisbati.** |
| 4 | **Business-process slice tracking** (#3) | `0/66 detail audit` gap'ni hal qiladi. Demolar ko'rinadi (user qabul qilishi mumkin), psixologik motivatsiya kuchayadi. Fowler tasdig'i — isbotlangan naqsh. |
| 5 | **Sonnet subagent default + CLAUDE.md template** (#5) | 0 effort (allaqachon bor), token 3-5x tejaladi, parallelizm imkoni (2-3 ceiling). **Eng kuchli token efficiency lever.** |

**Nima uchun aynan shu tartib**: 1+3 = sessiya overhead'ni darhol pasaytiradi (asboblar). 2 = haqiqat manbasini o'rnatadi (truth). 4 = strategiya qayta yozish (focus). 5 = token tejov (scale). Boshqalar (visual diff, MCP, Applitools) — qo'shimcha qiymat, lekin avval shu beshtasi tayyor bo'lsin.

---

## 7. Anti-pattern'lar (qaytarmaslik kerak)

**7.1. 4+ parallel subagent dispatch**
- Tajriba: sessiya limit'ga urilgan, 0 commit yetkazilgan
- Pragmatik shift: 2-3 parallel, ko'pi shared apps/web/src/components/ tree'da merge pain
- Source: session memory + `dispatching-parallel-agents` skill warning

**7.2. Percy / Chromatic visual regression**
- Commits-based baseline model — cross-product (moysklad.uz vs local) UNCHIN noto'g'ri
- Storybook centric (Chromatic) — loyihada Storybook yo'q
- Alternative: Argos (Playwright integration, 1-2h setup) yoki DIY pixelmatch + Claude vision

**7.3. `frontend-design` skill — bu loyiha uchun NOTO'G'RI**
- Anti AI-slop, BOLD aesthetic
- Moysklad = parity clone — moysklad.uz aesthetic'ni MATCH qilish kerak, distinctive design qilmaslik
- Skill description aldamasin: solo dev "ajoyib UI" deyilsa ishlatishi mumkin — lekin DoD parity emas, divergence keladi

**7.4. Browser-use yoki OpenAI Operator autonomous exploration**
- $0.50-2.00/flow — solo dev byudjet uchun katta
- Loyihada exploration kerak emas — capture harness ishlamoqda
- Manual capture + adversarial pack 100x arzon va aniqroq

**7.5. "MVP scope cut" yoki "good-enough subset" naqshlar**
- Twenty CRM, NocoDB — ataylab 80% slice
- User explicit rad qilgan (memory: `feedback-strict-fidelity.md`)
- Fowler "slice by business-process" ≠ scope cut — har slice'da full parity, ammo o'lchov birligi process

**7.6. "Phase 1 ishladi" = "tugadi" claim**
- CLAUDE.md NOLINCHI ASOSIY QOIDA 2: real-data smoke + adversarial QA + concurrent + edge case majburiy
- "Yashil typecheck + green test" = development gate, "done" emas
- Eski 34 bug aynan shu drift'dan kelgan — qaytarmaslik

**7.7. `git add -A` yoki `git add .`**
- Sensitive fayllar (.env, .auth/) tasodifan staging'ga tushishi mumkin
- Har doim specific path: `git add apps/web/src/components/foo`

**7.8. `--no-verify` yoki husky bypass**
- Husky restored 2026-05-24 (memory: `husky-noop-state.md`)
- Husky fail = signal, bypass = signal'ni o'chirish
- Fix the issue, never skip the hook

---

## 8. Yakuniy tavsiya (3 sentence)

**Birinchi sessiyada `pnpm audit:module <name>` kompozit CLI'ni yozing va `progress-report` pre-commit hook'ni o'rnating — har sessiyada 30-45min va drift class'ni butunlay yopadi (jami 5-10 sessiya bo'yicha 8+ sessiya tejov).** Ikkinchi sessiyada Playwright `toMatchAriaSnapshot` baseline'ni 22 audited sahifaga retroactive qo'shing — truth source `.aria.yml` faylga ko'chadi, "26 vs 22" tipidagi inflation imkoni yo'qoladi. **Uchinchi sessiyadan boshlab Sonnet subagent default + business-process slice tracking (Fowler) ga o'ting — bu strategik o'zgarish loyihaning "0/66 detail gap"ini yopadi va demo'lar paydo bo'ladi (psixologik momentum).**