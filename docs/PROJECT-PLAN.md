# Moysklad 1:1 Clone — Yakuniy Loyiha Rejasi

**Versiya:** 1.0 (2026-04-17)
**Maqsad:** `moysklad.uz` ni piksel-level, xatti-harakat-level va ma'lumotlar-level 1:1 klon qilish — O'zbekiston bozori uchun mahalliylashtirilgan holda.
**Natija:** Enterprise-grade bulutli ERP SaaS — 12 modul, 36 hujjat, 53 entity, 127 integratsiya, 3 til.

---

## 0. Falsafa — "1:1" nima degani aniqlik

| Qatlam | 1:1 ma'nosi | Bizning yechim |
|---|---|---|
| **Data model** | Har entity, maydon, validatsiya, munosabat — **identik** | `dev.moysklad.ru` rasmiy API'sidan 100% generatsiya |
| **UX pattern** | Har list, edit, filter, modal — **bir xil xatti-harakat** | 15 ta reusable pattern + Storybook + visual regression tests |
| **Dizayn** | Ranglar, fontlar, spacing, shadow — **piksel aniqligida** | CSS tokenlarni avtomat ekstraktsiya + Playwright screenshot diff |
| **Ish oqimi** | Har status, har triggery, har notifikatsiya — **bir xil** | Workflow engine + explicit FSM (finite state machine) har hujjat uchun |
| **Lokalizatsiya** | O'zbekistonga moslashtirish | MXIK, STIR, ASL Belgisi, Payme, Click, Uzum, Soliq.uz — 1-darajali |

**Muhim chegaralash:** Dizayn tokenlar va funksional xatti-harakat = 1:1. **Lekin** ichki implementatsiya (backend til, arxitektura, database texnologiyasi) = bizning tanlovimiz. Moysklad `Java + Spring` ishlatadi, biz `TypeScript + NestJS`. Bu qonuniy va texnik jihatdan to'g'ri — nusxa **xatti-harakatni**, **foydalanuvchi tajribasini**, va **ma'lumot strukturasini** takrorlaydi, **bytecode'ni emas**.

---

## 1. Uchta asosiy ustun

### Ustun 1 — **Data Model Authority** (rasmiy manbadan)

Manba: `dev.moysklad.ru/doc/api/remap/1.2/`

Bu manba **mukammal** — 53 entity, 36 hujjat, reports, webhooks, audit, notifications — barchasi JSON schema + validation rules + enum values + relations bilan.

**Pipeline:**
```
dev.moysklad.ru (API docs, client-rendered React SPA)
        ↓
Playwright headless (renders JS, extracts rendered DOM tables)
        ↓
Agent orchestra (5 parallel Claude agents, each owns a section)
        ↓
Structured JSON (one file per entity/document)
        ↓
Code generator (Handlebars templates)
        ↓
├─ Prisma schema (packages/db/schema.prisma)
├─ Zod validation schemas (packages/types)
├─ TypeScript interfaces (packages/types)
├─ OpenAPI spec (apps/api/openapi.yaml)
└─ Seeders + fixtures (packages/db/seed)
```

**Qaysi agentlar nima qiladi:**

| Agent | Sohasi | Hujjatlar soni |
|---|---|---|
| A1 | Сущности (Dictionaries) | 53 entity |
| A2 | Документы (Documents) | 36 hujjat |
| A3 | Отчёты (Reports) | ~20 report |
| A4 | Webhooks + Аудит + Уведомления | 3 ta tizim |
| A5 | Pricing, Discounts, Marking, Retail specifics | Kesib o'tuvchi |

**Natija:** `docs/data-model/` papkasi — **rasmiy, aniq, 100% to'liq**.

### Ustun 2 — **Visual Truth** (avtomat capture)

Playwright skript sinfi:

```typescript
// tools/capture/scrape-moysklad.ts
for (const page of ALL_PAGES) {
  await loginSession.goto(page.url);
  await page.screenshot({ path: `captures/${slug}/default.png`, fullPage: true });
  const dom = await page.content();
  const styles = await page.evaluate(() => extractComputedStyles());

  for (const interaction of page.interactions) {
    await interaction.trigger();
    await page.screenshot({ path: `captures/${slug}/${interaction.name}.png` });
    // ... capture modal/dropdown/sideover state
  }
}
```

**Capture plan:**
- ~80 sahifa × ~30 holat = ~2400 skrinshot
- 1-2 kun ichida avtomat ishga tushadi (rate-limit + session rotation)
- Har capture: PNG (retina 2x) + DOM HTML + computed CSS JSON
- Saqlanadi: `docs/moysklad-reference/visual-captures/`
- Bitta GitHub Actions cron — har oyda avtomat yangilanadi (Moysklad UI o'zgarganda aniqlaymiz)

**Natija:** "Visual Bible" — qurganda yonida turadigan referens.

### Ustun 3 — **Pattern Library** (inson + agent birga)

Bitta dev (men yoki odam) + bitta agent har pattern uchun **chuqur reference implementation** yaratadi:

| # | Pattern | Reference sahifa (Moysklad'da) | Komponent nomi |
|---|---|---|---|
| 1 | **ListView** | #purchaseorder | `<EntityListView>` |
| 2 | **EditForm** | #purchaseorder/edit | `<DocumentEditor>` |
| 3 | **DetailView** | (hujjat ochilganda) | `<DocumentDetail>` |
| 4 | **FilterPanel** | filter ochilganda | `<AdvancedFilter>` |
| 5 | **CatalogPicker** | "Добавить из справочника" | `<AssortmentPicker>` |
| 6 | **QuickCreateModal** | (+) tugmada | `<EntityQuickCreate>` |
| 7 | **Kanban** | CRM › Воронка | `<FunnelBoard>` |
| 8 | **Wizard** | Onboarding + Inventarizatsiya | `<StepWizard>` |
| 9 | **Dashboard** | #dashboard | `<WidgetGrid>` |
| 10 | **POSTerminal** | Касса web | `<POSShell>` |
| 11 | **ReportViewer** | Отчёты › Прибыль | `<ReportViewer>` |
| 12 | **Timeline** | #audit | `<EventTimeline>` |
| 13 | **BulkActions** | list selection toolbar | `<BulkActionsBar>` |
| 14 | **ImportExport** | Импортировать | `<ImportWizard>` |
| 15 | **IntegrationsMarketplace** | #apps | `<AppCatalog>` |

**Har pattern uchun artefaktlar:**
- `packages/ui/patterns/<Name>/` — React komponent
- `packages/ui/patterns/<Name>/<Name>.stories.tsx` — Storybook
- `packages/ui/patterns/<Name>/<Name>.test.tsx` — Vitest unit
- `packages/ui/patterns/<Name>/<Name>.visual.test.ts` — Playwright visual diff
- `docs/patterns/<Name>.md` — reference + decisions

**Natija:** 15 komponent = **80 sahifaning 90%i qurilgan** (har sahifa ~50-200 qator composition bo'ladi).

---

## 2. Tech stack (yakuniy)

**O'zgarishsiz qoldirilgan tanlov — TypeScript end-to-end:**

| Qatlam | Tanlov | Nega bu yerda |
|---|---|---|
| Backend | **NestJS 10 + TypeScript** | FE↔BE bitta til, Zod shared, tez iteratsiya |
| ORM | **Prisma 5** | 53 entity uchun schema-as-code, avtomat migratsiya |
| DB | **PostgreSQL 16 + Row-Level Security** | ACID, JSONB, pgvector (AI), multi-tenant |
| Cache/Queue | **Redis 7 + BullMQ** | Sessions, job queue, rate limit |
| Realtime | **Socket.IO + Redis adapter** | Dashboard, POS sync, notifications |
| Pul hisobi | **int64 tiyinda (UZS) / BigDecimal emas** | Moysklad ham shunday (API: `sum` integer) |
| Frontend app | **Next.js 15 + React 19 (App Router)** | Moysklad o'zi React |
| Frontend marketing | **Next.js 15 SSG** | Bitrix o'rnida |
| UI primitives | **Radix UI + shadcn/ui** | Accessible, headless |
| Styling | **Tailwind CSS v4** | tokenlardan auto-generated |
| Forms | **React Hook Form + Zod** | Type-safe, performant |
| Server state | **TanStack Query** | Cache, optimistic updates |
| Tables | **TanStack Table + Virtual** | 10k+ qator, virtual scroll |
| Charts | **Tremor / Recharts** | Dashboard |
| i18n | **next-intl (UZ/RU/EN)** | 3 til asos |
| Auth | **Passport.js + JWT + ACL jadval** | Fine-grained RBAC, 53×5 matrix |
| Storage | **S3 (MinIO dev, Wasabi prod)** | Files + images + PDFs |
| Search (MVP) | **PostgreSQL pg_trgm + GIN** | tez yetadi |
| Search (scale) | **Meilisearch** | faza 2+ |
| PDF | **Puppeteer + Handlebars** | Print templates editable |
| Excel | **exceljs** | Import/export |
| Monorepo | **pnpm + Turborepo** | Cached builds |
| Lint/Format | **Biome** | ESLint+Prettier'dan 10x tez |
| Test | **Vitest + Playwright + testcontainers** | Unit + E2E + integration |
| Visual reg | **Playwright visual comparisons (~90% threshold)** | Per-pattern CI |
| CI | **GitHub Actions** | PR + main pipelines |
| Deploy dev | **Docker Compose** | 1 komanda |
| Deploy prod | **Kubernetes (Yandex Cloud UZ zone)** | O'z. ma'lumot qonuni |
| Observability | **Pino + Loki + Prometheus + Grafana + Sentry** | Prod standards |

**Nega Kotlin emas:** Agar Moysklad Spring'da bo'lsa ham, biz 1:1 **xatti-harakatni** va **schema'ni** ko'chiramiz — **bytecode'ni emas**. TypeScript end-to-end 2-3 barobar tez iteratsiya va 10 barobar kengroq dev bozori beradi. Java'ning hech bir afzalligi bu loyihada haqiqiy ahamiyatga ega emas (pul integer tiyinda, transactions PostgreSQL'da, time zone har tilda to'g'ri).

---

## 3. O'zbekistonga maxsus qatlam (1-darajali)

Bu qatlam Moysklad'ning RU versiyasi bera olmaydigan narsa — **biz bu bilan ko'rinamiz**.

### 3.1 Ma'lumot qatlami
- **MXIK/IKPU** kodlari (17-raqam) — har tovar majburiy
- **STIR** (9-raqam taxpayer id) — Kontragent uchun
- **Soliq.uz** ro'yxatiga avtomat integratsiya (STIR bo'yicha to'ldirish)
- **Mahalla / Tuman / Viloyat** — FIAS emas, MFI classifier
- UZS asosiy valyuta (int64 tiyinda = 1 so'm = 100 tiyin)
- VAT 12% default (0% / без НДС variantlari)

### 3.2 Integratsiyalar (majburiy MVP)
| Integratsiya | Turi | Faza |
|---|---|---|
| **Soliq.uz** (EDO) | Hujjat jo'natish/olish | 3 |
| **ASL Belgisi** | Markirovka | 4 |
| **Virtual Kassa (VCR/REGOS)** | Fiskal chek | 5 |
| **Payme** | To'lov qabul | 5 |
| **Click** | To'lov qabul | 5 |
| **Uzum Bank / Multicard** | To'lov qabul | 5 |
| **Uzcard / Humo** | Kartalar | 5 |
| **Eskiz SMS** | SMS gateway | 4 |
| **CBRU** | Valyuta kurslari | 2 |
| **Uzum Market** | Marketplace sync | 6 |
| **Yandex GO UZ** | Yetkazib berish | 6 |
| **Banklar** (Kapital/NBU/Asaka/Anor/Octo/TBC/Alif) | Statement sync | 6 |
| **Didox / E-DOCS** | EDO | 3 |

### 3.3 Til va madaniyat
- UZ (lotin) — asosiy, default
- RU — ikkinchi
- EN — ixtiyoriy
- Haftalik sanalar — Dushanba'dan boshlanadi
- Vaqt formati — 24 soatlik
- Telefon formati — `+998 XX XXX-XX-XX`
- Pul formati — `123 456 789 so'm`
- Dialog terminologiyasi — **moysklad.uz'dan verbatim**, **lokalizatsiya tushunarli so'zlar** (masalan: "Контрагент" → "Hamkor" emas, **"Kontragent"** qoladi — tadbirkorlar shu so'zga o'rganib qolgan)

---

## 4. Yo'l xaritasi — bosqichlar va vaqt

### **Sprint 0 (1-2 hafta): Poydevor + discovery parallel**

Parallel 3 treck:

**Track A — Data extraction (agents)**
- Playwright bilan `dev.moysklad.ru` ni scrape qilish
- 5 agent parallel: Entities / Documents / Reports / Webhooks / Retail-specific
- Output: `docs/data-model/*.json` (ship-ready)
- Sonra: Handlebars template → Prisma schema
- Deliverable: `packages/db/schema.prisma` (53 model, 36 doc type, full relations)

**Track B — Visual capture (Playwright skripti)**
- Login session cookie bilan
- Har sahifani aylanadi — screenshot + DOM + CSS
- ~2400 capture, 1-2 kun
- Deliverable: `docs/moysklad-reference/visual-captures/` (commit qilinadi)

**Track C — Monorepo bootstrap**
- pnpm + Turborepo + Biome + Husky
- Docker Compose (Postgres 16 + Redis 7 + MinIO + Mailhog)
- `apps/api` (NestJS skeleton)
- `apps/web` (Next.js skeleton)
- `apps/marketing` (Next.js SSG skeleton)
- `packages/ui`, `packages/db`, `packages/types`, `packages/i18n`, `packages/config`
- CI workflow (typecheck + lint + test + build)
- Husky hooks (pre-commit lint-staged, commit-msg commitlint)

### **Sprint 1 (hafta 3-4): Design tokens + pattern library boshlanadi**

**Track A — Tokens automation**
- CSS scraper: Moysklad'ning `*.css` fayllarini parse qilib Tailwind config generatsiya qilish
- Montserrat variables, 8px base, #2855AF primary, shadows
- Storybook setup (dark + light themes)
- Deliverable: `packages/ui/tokens.ts` + `tailwind.config.ts` (generated)

**Track B — Auth + multi-tenancy + i18n**
- NestJS: AuthModule (register/login/refresh/reset/verify)
- Prisma: Account, User, Session, Employee, Role, Permission tables
- Row-level security policies
- JWT access (15m) + refresh (7d) rotation
- i18n uz/ru/en bootstrap + lang switcher
- Deliverable: Smoke test — register → verify → login → dashboard → logout

**Track C — Pattern 1 (ListView) deep reference**
- `docs/patterns/ListView.md` — reference design doc
- `<EntityListView>` React komponent (TanStack Table + Virtual)
- Storybook stories (empty / loading / data / selected / filtered)
- Playwright visual regression vs Moysklad screenshot
- Props API: `entity`, `columns`, `filters`, `bulkActions`, `primaryAction`

### **Sprint 2 (hafta 5-6): Patterns 2-7 + Phase 1 marketing**

- **Patterns:** EditForm, DetailView, FilterPanel, QuickCreateModal, CatalogPicker, Wizard
- **Marketing sayt:** moysklad.uz public pages (home, features, pricing, blog) — piksel-level
- **Phase 1 deliverable:** `marketing.moysklad-clone.uz` — live, static, 10 sahifa

### **Sprint 3 (hafta 7-8): Patterns 8-15 + first module (Tovarlar)**

- Qolgan 9 pattern: Kanban, Dashboard, POSTerminal, ReportViewer, Timeline, BulkActions, ImportExport, IntegrationsMarketplace, Settings
- **Module 1 — Tovarlar (Goods)** — eng katta va eng ko'p pattern ishlatiladigan
  - Sub-pages: Tovarlar, Услуги, Комплекты, Модификации, Группы, Типы цен, Единицы, Изображения
  - Per-sub-page: quick-capture + implement using patterns
  - E2E test: tovar yaratish → tahrirlash → arxivlash → qidirish
  - Deliverable: `/products/*` butun oqim

### **Sprint 4 (hafta 9-12): Kontragent + Savdo + Xarid modullari**

- **Module 2 — Kontragentlar (CRM/Counterparty)**
- **Module 3 — Savdo (Sales)** — 5 hujjat
- **Module 4 — Xarid (Purchases)** — 5 hujjat (men allaqachon M02.01 ni chuqur yozdim)
- Har modul: 1-hafta to'liq ish
- Deliverable: B2B savdo oqimi ishlaydi (order → invoice → shipment → return)

### **Sprint 5 (hafta 13-16): Ombor + Pul + Retail**

- **Module 5 — Ombor (Warehouse)** — 5 hujjat
- **Module 6 — Pul (Money)** — 8 hujjat
- **Module 7 — Retail + POS** — 3 hujjat + POS terminal
- **UZ integratsiyalar (1-batch):** Soliq.uz, Didox, CBRU, Eskiz, ASL Belgisi
- Deliverable: To'liq pul + ombor + POS oqimi + UZ EDO

### **Sprint 6 (hafta 17-20): Production + Online + Tasks + Admin**

- **Module 8 — Ishlab chiqarish**
- **Module 9 — Onlayn savdo (marketplace connectors)** — Uzum, WB, Ozon, Yandex Market
- **Module 10 — Vazifalar**
- **Module 11 — Dashboard (widgets)**
- **Module 12 — Решения (apps marketplace)**
- **Admin:** settings, users, roles, permissions matrix, audit log, corzina
- **UZ integratsiyalar (2-batch):** Payme, Click, Multicard, Uzcard/Humo, VCR

### **Sprint 7 (hafta 21-24): Polish + performance + launch prep**

- Observability (Sentry + Loki + Grafana)
- Performance: load testing (k6), query optimization, N+1 qidirish
- Security audit (OWASP Top 10)
- Backup + DR drill
- Yuridik shartlar, maxfiylik, oferta
- Beta launch — 20 kompaniya
- Feedback iteratsiyasi

### **Sprint 8+ (post-MVP): Continuous evolution**

- Vendor API (3rd-party plugin runtime)
- Mobile PWA optimizations
- Native mobile (Capacitor)
- AI xususiyatlari (pgvector + GPT): smart search, invoice scan, category auto-detect
- Advanced analytics (ClickHouse integration)

**Jami MVP:** 24 hafta (~6 oy) minimal viable — biron kichik biznes ishlata oladi.
**Feature parity:** 52-60 hafta (12-15 oy) — Moysklad.uz bilan tenglikda.
**Differentsiatsiya:** 68+ hafta (16-18 oy) — UZ-first features (AI, mahalla integratsiyasi, mahalliy banklar) Moysklad'dan oldinda.

---

## 5. Agent orkestratsiyasi — konkret

### Rol va mas'uliyat

| Rol | Kim | Mas'uliyat |
|---|---|---|
| **Product Owner** | Siz (foydalanuvchi) | Biznes qaror, prioritet, sign-off |
| **Chief Architect** | Claude Opus (sizning $200 akk) | Arxitektura, ADR, pattern dizayn, spec review |
| **Builder Agents** | Claude Sonnet (bir necha parallel) | Modul/komponent implementatsiyasi |
| **QA Agent** | Claude Sonnet | Test yozish, visual regression sozlash |
| **Discovery Agent** | Playwright + Claude agents | API docs scraping, UI capture |

### Ish oqimi (har modul uchun)

```
1. Product Owner: "Endi Xarid modulini qilamiz"
         ↓
2. Chief Architect (Opus):
   - Data model (from Sprint 0 output)
   - Visual captures (from Sprint 0 output)
   - 15 pattern kutubxonasidan foydalaniladiganlari tanlash
   - Spec yozish: routes, screens, flows, acceptance criteria
         ↓
3. Spec Review: Product Owner ko'radi, tasdiqlaydi
         ↓
4. Chief Architect: task breakdown
   - Task 1: Zakaz postavshchiku — list + edit + detail
   - Task 2: Приемка — list + edit + detail + stock ledger impact
   - ...
         ↓
5. Builder Agents (parallel):
   - Sonnet-1: Task 1
   - Sonnet-2: Task 2
   - ...
   Har agent uchun strict kirish:
     * Data model fragment
     * Visual capture fragment
     * Pattern import list
     * Acceptance tests (Playwright visual + E2E)
         ↓
6. QA Agent: test yozadi (Playwright E2E + visual regression)
         ↓
7. Chief Architect: code review, integration
         ↓
8. CI: typecheck + lint + test + build + visual-reg
         ↓
9. Product Owner: final demo, sign-off
         ↓
10. Merge to main, deploy staging
```

### Sifat darvozalari (har step'da)

- **Pre-commit (Husky):** lint-staged (Biome check only on changed files)
- **Commit message (commitlint):** Conventional Commits + signed-off
- **CI (GitHub Actions):**
  - `pnpm typecheck` — har package
  - `pnpm lint` — Biome strict
  - `pnpm test` — Vitest
  - `pnpm test:integration` — testcontainers + PostgreSQL
  - `pnpm test:e2e` — Playwright (faqat asosiy oqimlar)
  - `pnpm test:visual` — visual regression (~90% threshold)
  - `pnpm build` — Turbo cached
  - Coverage: ≥80% `packages/core`, ≥70% `apps/api`
- **Staging deploy:** har main push'da avtomat
- **Prod deploy:** tag + manual approval
- **Post-prod:** Sentry monitoring + uptime alerts

---

## 6. Xavf registri

| Xavf | Ehtimol | Ta'sir | Yumshatish |
|---|---|---|---|
| Moysklad UI o'zgaradi, visual-reg qizil bo'ladi | Yuqori | O'rta | Monthly re-capture cron; per-pattern baseline; realistik threshold |
| API docs to'liq emas yoki noto'g'ri | Past | Yuqori | Live API bilan birgalikda tekshirish (bizning akkount bor) |
| UZ integratsiyalar API'si o'zgarib turadi | Yuqori | O'rta | Adapter pattern, har integratsiya alohida paket, qat'iy integration test |
| Jamoa kengayishi kerak | O'rta | O'rta | Komponent diff-lightning rate tez; hujjatlash to'liq — yangi dev 1 haftada ishga kirishadi |
| Pul hisobi xatosi | Past | Juda yuqori | Integer tiyinda, property-based tests (fast-check), financial transaction tests |
| Multi-tenancy data leak | Past | Katastrofik | RLS + har querryda accountId tekshirish + E2E test bir nechta tenant bilan |
| Scale muammosi | O'rta | O'rta | PgBouncer, read replica, BullMQ offload, ClickHouse analytics (faza 4+) |
| Yuridik — ma'lumot qonuni | Yuqori | Yuqori | Prod — Yandex Cloud UZ zone, backup UZ'da, audit log majburiy |
| Visual-reg CI qizil | Yuqori | Past | Per-component threshold, manual approval button |
| Moysklad tomonidan shikoyat | Past | O'rta | UI "inspiratsiya" — to'liq piksel emas, UZ-brand, farq qiladigan domen |

---

## 7. Hozirgi qadam — aniq

1. **Bu rejani siz tasdiqlang** (yoki o'zgartirishni so'rang)
2. **Men:**
   - Git repo init qilaman (agar hali qilinmagan bo'lsa)
   - `docs/PROJECT-PLAN.md` ni commit qilaman (bu fayl)
   - `tools/capture/` papkasini yarataman
   - Playwright skripti yozaman — avval `dev.moysklad.ru` API docs scrape
   - 5 ta agentni parallel ishga tushuraman (Opus orchestrator + 4 Sonnet builders)
3. **Siz:**
   - Reja bo'yicha fikr-mulohaza bildirasiz
   - Ba'zi biznes qarorlar (masalan: "yoki Kotlin" — rad etildi, lekin siz hali ham xohlashsa, muhokama qilamiz)
   - Hafta yakunida demo ko'rasiz
4. **Birgalikda:**
   - Sprint 0 tugashi bilan siz `docs/data-model/` papkasida 53 entity + 36 hujjat schema'sini ko'rasiz
   - `docs/moysklad-reference/visual-captures/` — 2400 skrinshot
   - `apps/api` + `apps/web` — ishga tushgan skeleton

**Tayyormisiz?**
