# Moysklad Clone — Arxitektura va Texnologik Tahlil

> 📚 **HISTORICAL — Stack tahlili Sprint 0 da yakunlangan**
> Bu hujjat dastlabki tech stack qarorini hujjatlashtiradi. Yakuniy qarorlar
> `docs/adr/0001-0006-*.md` da locked (immutable). Joriy holat: `RESUME.md`.

**Maqsad:** Moysklad.uz ning 100% professional clone'ini qurish uchun eng yuqori sifatli, chidamli va kelajakga tayyor tech stack'ni tanlash.

Tahlil darajasi: biznes-domeni chuqurligi (12 modul, 36 hujjat turi, 53 entity, ~127 integratsiya) + O'zbekiston mahalliy talablari + enterprise-darajadagi sifat.

---

## 1. Loyihaning masshtabi (hajmi)

| Parametr | Qiymat | Masshtab natijasi |
|---|---|---|
| Entitylar | 53 | Katta model, ORM kerak |
| Hujjat turlari | 36 | Har biri CRUD + polymorphism |
| Modullar | 12 | Modul bo'linishi kerak |
| Integratsiyalar | 127 | Plugin runtime majburiy |
| Tillar | UZ/RU/EN | i18n asos bo'lishi kerak |
| Tenancy | Ko'p ijaralik | RBAC + row-level isolation |
| Realtime | Dashboard, POS, POS+server sync | WebSocket asoslash |
| Offline | POS (kassa) uchun | IndexedDB/PWA |
| Hujjatlar soni | Potensial millionlab | Partitioning, indexing strategy |

**Natija:** Bu "MVP SaaS" emas, **enterprise-grade ERP**. Har qaror 5 yil'ga qarab qilinadi.

---

## 2. Backend tahlili

### Nomzodlar

| Stek | Tezlik (dev) | Tezlik (runtime) | Ekosistema | ERP'ga mosligi | O'zbekistonda topilish |
|---|---|---|---|---|---|
| **Node.js + TypeScript (NestJS)** | Yuqori | O'rtacha-yuqori | Ulkan | Yaxshi — hujjat, tranzaksiya, ORM mavjud | Keng |
| **Python + FastAPI** | Juda yuqori | O'rtacha | Katta | O'rtacha — async, lekin CPU ortida Go/Java'dan sekin | Keng |
| **Go (Echo/Fiber)** | O'rtacha | Juda yuqori | Yaxshi | Yaxshi — ERP uchun ideal (concurrent + tez) | O'rtacha |
| **Java + Spring Boot** | Past | Yuqori | Ulkan | Moysklad'ning o'zi shu stek! Bank'lar shu stek'da | O'rtacha |
| **C# + .NET 8** | O'rtacha | Juda yuqori | Katta | A'lo | Kam |
| **Elixir + Phoenix** | Yuqori | Juda yuqori (realtime!) | O'rtacha | WebSocket/realtime ideal | Juda kam |

### Tavsiya: **TypeScript + NestJS** (monolith-first, modular, kerak bo'lsa microservices'ga parchalanadi)

**Sabablar:**

1. **Oldinda TypeScript bo'lishi kerak.** ERP — kontrakt-og'ir, schema-first. Type xavfsizligisiz 53×36 matritsa shag'im bilan portlaydi.
2. **NestJS moduli tuzilishi moysklad'ning 12 modulga mos keladi** — har modul alohida `@Module()`, alohida `@Controller`, alohida `@Service`. Mikroservislar kerakmas — monolit + modullar yetarli.
3. **Prisma ORM (TS uchun)** — schema-as-code, migratsiya avtomatlash, type-safe client. 53 entity uchun ideal.
4. **Frontend bilan TS umumiyligi** — bitta til, bitta validator (Zod), bitta type share.
5. **Ekosistemada ERP kerakli barcha paketlar bor**: queue (BullMQ), scheduler (node-cron), file processing (sharp, pdf-lib), Excel (exceljs), realtime (Socket.IO), REST+GraphQL, OpenAPI generator.
6. **Anthropicda ham, O'zbekistonda ham keng DevOps bilim bor** — deployment oddiy.
7. **Kelajakga moslashuvchan** — kerak bo'lsa bottleneck modullarini Go/Rust'ga chiqarish oson (NestJS microservices bilan).

**Alternativa:** Agar kelajakda juda yuqori yuklama (10 000+ RPS) kutilsa, **POS bo'limini alohida Go xizmatchasiga** chiqarish mumkin. Lekin MVP va 99% holatda NestJS yetadi.

---

## 3. Ma'lumotlar bazasi tahlili

### Nomzodlar

| DB | ACID | Yuridik hisobot | Multi-tenant | Full-text | Vector (AI) | ERP'ga mosligi |
|---|---|---|---|---|---|---|
| **PostgreSQL** | ★★★★★ | ★★★★★ | Row-level security | pg_trgm, GIN | pgvector | **A'lo** |
| **MySQL/MariaDB** | ★★★★ | ★★★★ | DB-per-tenant | ok | yo'q | Yaxshi |
| **SQL Server** | ★★★★★ | ★★★★★ | Schema-per-tenant | ok | built-in | A'lo (lekin litsenziya) |
| **CockroachDB** | ★★★★★ | Yaxshi | Geo-distributed | ok | yo'q | Global SaaS uchun |

### Tavsiya: **PostgreSQL 16** (row-level multi-tenant)

**Sabablar:**

1. **ACID + Serializable isolation** — moliyaviy hujjatlar uchun majburiy (stock ledger, money ledger).
2. **Row-level security (RLS)** — `account_id` bo'yicha avtomatik filtrlash — xavfsiz multi-tenant.
3. **JSONB** — custom attributes, meta refs, audit diff'lari uchun ideal.
4. **pg_partman** — millionlab hujjatlarni yil/oy bo'yicha partition qilish.
5. **pgvector** — kelajakda AI tavsiyalari uchun (masalan, "o'xshash tovarlar").
6. **pg_trgm + GIN** — lotin+kiril+o'zbek qidiruv (Meilisearch/Elasticsearch'siz ham yetadi MVP uchun).
7. **Ochiq manba, O'zbekiston cloud'larda mavjud** (Yandex Cloud, DigitalOcean, Linode, Vultr).
8. **Stream replication** — geo-replika oson.
9. **pgbouncer + PostgREST ekosistema** — API ham oson.

**Qo'shimcha:**
- **Redis** — cache + session + queue (BullMQ)
- **ClickHouse** (keyinroq, faza 4+) — analytics/hisobotlar uchun (kolonna-orientir, 100x tez)
- **S3-compatible** (MinIO / Backblaze B2 / Wasabi) — fayl, rasm, PDF arxivi
- **Meilisearch** (faza 2+) — blog va katalogni tez qidirish

---

## 4. Frontend tahlili

### Nomzodlar (app uchun)

| Stek | SPA vs SSR | Tezlik | DX | ERP'ga mosligi |
|---|---|---|---|---|
| **Next.js + React** | Ikkalasi | Yuqori | A'lo | Yaxshi — SSR qiymat kam |
| **Remix** | SSR-first | A'lo | Yaxshi | Yaxshi |
| **Nuxt + Vue** | Ikkalasi | Yuqori | A'lo | Yaxshi |
| **SvelteKit** | Ikkalasi | Juda yuqori | Yaxshi | O'rtacha (kam ERP kutubxonalari) |
| **Angular** | SPA | O'rtacha | O'rtacha | Yaxshi (enterprise) |

### Tavsiya: **Next.js 15 (App Router) + React 19** (app), **Next.js SSG** (marketing sayt)

**Sabablar:**

1. **Moysklad o'zi React'da yozilgan** (CSS Modules, `card-C6RbpM` hash'lari). Dizayn pattern'larini ko'chirish oson.
2. **App Router** — server components + client components kombinatsiyasi — 12 modul uchun ideal navigatsiya.
3. **Streaming + Suspense** — hujjat ro'yxatlari katta bo'lganda qulay.
4. **Ekosistema**:
   - **TanStack Query** (ex-React Query) — server state cache, optimistic updates
   - **TanStack Table** — 53 entity uchun ro'yxat jadvallari
   - **TanStack Virtual** — 10k+ qatorlar uchun virtualization
   - **React Hook Form + Zod** — 100+ forma uchun type-safe validation
   - **shadcn/ui + Radix** — headless komponentlar, customizable
   - **Lucide icons** — moysklad'dek minimalist
5. **i18n** — `next-intl` yoki `react-intl` — UZ/RU/EN.
6. **Marketing sayt alohida Next.js SSG app** — Bitrix CMS o'rniga. SEO + blog + hujjatlar tez.
7. **Design system: Tailwind CSS v4** — utility-first, tez, Montserrat + tokenlar.

### POS uchun alohida strategy

POS (kassa) offline ishlashi kerak. 2 yondashuv:
- **A)** PWA + IndexedDB (Next.js'da) — bitta codebase
- **B)** Native Tauri/Electron — desktop yorliq

**Tavsiya:** A (PWA). Service Worker + IndexedDB + background sync. Moysklad ham shu yo'ldan (brauzerda ishlaydi).

---

## 5. Realtime qatlami

**Talab:** Dashboard yangilanishlar, POS chek printeri bilan, ombor qoldiqlarining sinxron yangilanishi, bildirishnomalar.

**Tanlov: Socket.IO + Redis adapter** — NestJS native qo'llab-quvvatlaydi, brauzer barqaror, reconnect avtomatik.

Muqobil: **Pusher/Ably** (cloud) — agar infra sozlamasini kamaytirishni xohlasak; lekin vendor lock-in.

**Tavsiya:** Socket.IO (o'z-xost), keyinchalik agar shkala oshsa **NATS** ga ko'chirish.

---

## 6. Plugin runtime (integratsiyalar marketplace)

**Talab:** 127 integratsiyani ko'rsatish, har biri o'ziga xos sozlama + sinxronlash.

**3 model:**

| Model | Kuchi | Zaifligi |
|---|---|---|
| **Monolit integratsiyalar** (har birini ichga yozish) | Oddiy | Scale qilmaydi, 3rd-party qo'shib bo'lmaydi |
| **Webhook-based** | Oson boshlash | 3rd-party ishonchsizlikka duchor |
| **Vendor API + Apps marketplace** (Moysklad'dagidek) | Moslashuvchan, uchinchi tomon yozadi | Murakkab |

**Tavsiya:** Gibrid —
- **Birinchi 10-15 integratsiya** (Payme, Click, Uzum, Didox, Soliq, ASL, Telegram, Eskiz, WB, Ozon, Yandex GO) — monolit ichida (`apps/integrations/*`).
- **Keyinchalik** — Vendor API (OAuth + webhook subscriptions + sandbox) ochib, 3rd-party dev'lar o'z app'larini yozishiga imkon beramiz. Bu keyingi fazada.

---

## 7. Autentifikatsiya va avtorizatsiya

**Talab:**
- Email/parol + magic link + Google OAuth + (keyinchalik) Apple/Telegram login
- MFA (TOTP)
- RBAC: default rollar (Super-admin, Admin, Menejer, Kassir, Omborchi, Buxgalter) + custom role'lar
- Permissions matritsasi 53 entity × 5 action (view/create/update/delete/approve)
- Audit log har amal uchun
- API token (Vendor API uchun)
- Session management (revoke, device list)

**Tanlov:**

| Yechim | Tavsifi | Bahosi |
|---|---|---|
| **Auth.js (NextAuth)** | Next.js-native, muvofiq | Yaxshi, lekin enterprise RBAC cheklangan |
| **Clerk** | Cloud, oson | $25/oy/mingta, UZ'da cheklangan |
| **Keycloak** | O'z-xost, to'liq funksional | Java, og'ir konfiguratsiya |
| **Ory Kratos + Keto** | Ochiq, kuchli | Murakkab, microservice |
| **O'z yechimingiz (NestJS @guards + Prisma)** | To'liq boshqaruv | Ko'proq kod, lekin aniq |

**Tavsiya:** **O'z yechimimiz** (NestJS Passport + JWT + Prisma ACL jadvallari).

Sababi: ERP uchun fine-grained permissions kerak (har entity × action × own/org/all skopu). Tayyor yechim yetmaydi; o'zimiz yozishimiz aniq va xavfsiz. Enterprise ERP'larning hammasi bu yo'lni tanlaydi.

---

## 8. O'zbekistonga xos qatlam

Majburiy integratsiyalar:
- **Soliq.uz / DidoX** — EDO (счет-фактура, акт)
- **ASL Belgisi** — milliy markirovka
- **MXIK/IKPU** — tovar identifikatorlari (17-raqamli)
- **Virtual Kassa (VCR/REGOS)** — fiskal chek
- **Payme / Click / Uzum Bank / Multicard / Paynet** — to'lovlar
- **Uzcard / Humo** — kartalar
- **Eskiz / Play Mobile** — SMS
- **Central Bank of Uzbekistan (CBRU)** — valyuta kurslari (kundalik)
- **Banklar:** Kapitalbank, NBU, Asaka, Anor, Octobank, TBC, Alif — open API har xil

**Tavsiya:** `@moysklad-clone/integrations-uz` — alohida paket (monorepo pnpm workspace). Har integratsiya o'z folder'ida: `apps/integrations-uz/payme/`, `apps/integrations-uz/click/` va h.k.

---

## 9. Observability / monitoring

| Qatlam | Tanlovi |
|---|---|
| Loglar | Pino + Loki (yoki Grafana Cloud) |
| Metrika | Prometheus + Grafana |
| Tracing | OpenTelemetry → Tempo (yoki Jaeger) |
| Error tracking | Sentry (self-hosted yoki cloud) |
| Uptime | Better Stack / self-hosted Uptime Kuma |
| Audit | PostgreSQL jadval + `audit_log` entity |

---

## 10. CI/CD va quality gates

| Qatlam | Tanlovi |
|---|---|
| Monorepo | pnpm + Turborepo |
| Typecheck | `tsc --noEmit` har package'da |
| Lint | Biome yoki ESLint + Prettier |
| Test (unit) | Vitest (tez) |
| Test (integration) | Vitest + testcontainers (PostgreSQL) |
| Test (e2e) | Playwright |
| Migratsiya | Prisma Migrate |
| Seed | `prisma db seed` |
| Pre-commit | Husky + lint-staged |
| Commit message | Conventional Commits + commitlint |
| CI | GitHub Actions |
| Deployment | Docker Compose (dev), Kubernetes (prod) |
| Image registry | GHCR yoki Docker Hub |
| Secrets | Doppler yoki `.env` + `dotenv-vault` |

**Sifat darvozalari (global CLAUDE.md'da aytilganidek):**
- Har fayl o'zgarishi → typecheck + lint + tests
- Har faza yakuni → to'liq gate (typecheck + lint + format + test + build + commit)
- Husky pre-commit, commit-msg hook
- CI yashil bo'lmasa merge qilinmaydi

---

## 11. Hosting va infra

| Qatlam | MVP (arzon) | Production |
|---|---|---|
| App server | 1× VPS (2 vCPU, 4 GB) — Hetzner / Contabo | Kubernetes (DigitalOcean / Yandex Cloud) |
| DB | PostgreSQL da shu VPS | Managed PostgreSQL (DO / Yandex) + read replica |
| Redis | O'sha VPS | Managed Redis |
| Object storage | MinIO yoki S3 | S3-compatible (Wasabi / Backblaze) |
| CDN | Cloudflare (bepul) | Cloudflare Pro |
| Domain / TLS | `*.moysklad-clone.uz` | Let's Encrypt |
| Email | Resend / Postmark | Resend |

**O'zbekiston host kerakligi:** Yuridik talablarga ko'ra foydalanuvchi ma'lumoti O'zbekistonda saqlanishi kerak (Personal Data Law 2019). Shuning uchun production — **Yandex Cloud UZ zone** yoki **O'zCloud**.

---

## 12. Monorepo tarkibi

```
moysklad-clone/
├── apps/
│   ├── api/                 # NestJS backend
│   ├── web/                 # Next.js app (moysklad.uz app)
│   ├── marketing/           # Next.js SSG (moysklad.uz landing)
│   ├── admin/               # Internal tools (super-admin)
│   └── pos/                 # PWA kassa (may be part of web/)
├── packages/
│   ├── db/                  # Prisma schema + migrations
│   ├── core/                # Domain logic (shared)
│   ├── ui/                  # Design system (shadcn-based)
│   ├── i18n/                # UZ/RU/EN translations
│   ├── types/               # Shared TS types (Zod schemas)
│   ├── integrations-uz/     # Payme, Click, Uzum, Didox, ASL, etc.
│   └── config/              # tsconfig, eslint, biome configs
├── tests/
│   ├── e2e/                 # Playwright
│   └── fixtures/            # Test data seeders
├── docs/
│   ├── moysklad-reference/  # (done) discovery artifacts
│   ├── specs/               # Per-phase specs
│   ├── plans/               # Per-phase implementation plans
│   └── adr/                 # Architecture decision records
├── .github/workflows/       # CI
├── docker-compose.yml       # Dev environment
├── pnpm-workspace.yaml
├── turbo.json
├── tsconfig.base.json
├── biome.json
├── .husky/
└── package.json
```

---

## 13. Final tech stack (yagona tanlov)

| Qatlam | Tanlov |
|---|---|
| Backend | **TypeScript + NestJS 10** |
| ORM | **Prisma 5** |
| DB | **PostgreSQL 16** (RLS) |
| Cache | **Redis 7** |
| Queue | **BullMQ** |
| Realtime | **Socket.IO** + Redis adapter |
| Search (mvp) | **PostgreSQL pg_trgm + GIN** |
| Search (scale) | **Meilisearch** (faza 2+) |
| Storage | **S3-compatible** (MinIO dev, Wasabi prod) |
| App frontend | **Next.js 15 + React 19** |
| Marketing frontend | **Next.js 15 SSG** |
| UI | **Tailwind CSS v4 + shadcn/ui + Radix** |
| Forms | **React Hook Form + Zod** |
| Server state | **TanStack Query** |
| Tables | **TanStack Table + Virtual** |
| Charts | **Tremor / Recharts** |
| i18n | **next-intl** |
| Auth | **O'z yechim (Passport + JWT + Prisma ACL)** |
| PDF | **pdfkit / puppeteer** |
| Excel | **exceljs** |
| Monorepo | **pnpm + Turborepo** |
| Lint/Format | **Biome** (tez) |
| Test | **Vitest + Playwright + testcontainers** |
| CI | **GitHub Actions** |
| Deploy | **Docker Compose (dev) + Kubernetes (prod)** |
| Host | **Yandex Cloud UZ zone** (prod) |
| Observability | **Pino + Loki + Prometheus + Grafana + Sentry** |

---

## 14. Nima uchun bu BEST?

1. **TypeScript end-to-end** — bitta til, bitta schema (Zod), qat'iy type xavfsizlik
2. **Moysklad'dan pattern'larni ko'chirish oson** — u ham React + Java. Biz React + TS (lightweight mock)
3. **Ekosistema teng darajada katta** — har kerakli kutubxona bor
4. **Post-MVP scale path aniq:**
   - Bottleneck modul → Go microservice
   - Read-heavy analytics → ClickHouse
   - Search yuklama → Meilisearch/Elastic
   - Realtime shkala → NATS/Kafka
5. **DevOps arzon** — bitta VPS'da hamma narsa ishlaydi MVP uchun
6. **O'zbekistonlik dev'lar topish oson** — TS + React + Postgres eng keng tarqalgan
7. **Kelajak AI-tayyor** — pgvector ishlatiladi, JSON schema Zod'dan generatsiya qilinadi, OpenAPI va MCP server'larini oson yoziladi
8. **Quality gates o'rnatilgan** — global qoida: sifat tezlikdan ustun

---

## Keyingi qadam

Bu tech stack tasdiqlansa, **Phase 0 (Foundation) spec'iga** o'tamiz:

Phase 0 tarkibi:
- Monorepo + tool bootstrap (pnpm + Turborepo)
- Docker dev environment (Postgres + Redis + MinIO)
- NestJS scaffolding + health endpoint
- Next.js scaffolding + health page
- Prisma bootstrap + Account/User/Session schema
- Auth (register + login + JWT + refresh token)
- UI kit foundation (Tailwind + shadcn/ui + Montserrat)
- i18n bootstrap (UZ/RU/EN)
- CI (GitHub Actions) + Husky + commitlint
- Observability stub (Pino + Sentry)

Bir necha haftalik ish — lekin keyingi barcha 7 faza shu asos ustida tez quriladi.

**Sizdan:** Tech stack tanlovini tasdiqlang yoki biror qatlamni almashtirishni so'rang. Tasdiqlasangiz, Phase 0 spec'ini batafsil yozaman.
