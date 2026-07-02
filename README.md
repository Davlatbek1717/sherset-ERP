# Moysklad Clone — O'zbekiston uchun

1:1 klon `moysklad.uz` ning — O'zbekiston bozori uchun mahalliylashtirilgan, enterprise-grade bulutli ERP.

## Maqsad

**Moysklad.uz ning har modul, har sahifa, har hujjat turi — to'liq funksional paritet bilan.** Plus O'zbekistonga maxsus integratsiyalar (Soliq.uz, ASL Belgisi, MXIK, Payme, Click, Uzum, Didox, mahalliy banklar).

Masshtab: **12 modul**, **53 entity**, **36 hujjat turi**, **127 integratsiya**, **3 til** (UZ / RU / EN).

## Tech stack

| Qatlam | Tanlov |
|---|---|
| Backend | TypeScript + NestJS 10 |
| ORM | Prisma 5 |
| DB | PostgreSQL 16 (native install, RLS) |
| Cache/Queue | Redis 7 (Memurai on Windows) |
| Frontend app | Next.js 15 + React 19 (App Router) |
| Marketing sayt | Next.js 15 SSG |
| UI | Tailwind CSS v4 + shadcn/ui + Radix |
| Realtime | Socket.IO + Redis adapter |
| Auth | Passport + JWT + RBAC (o'zimiz) |
| Storage | S3-mos (MinIO local, Wasabi prod) |
| PDF | Puppeteer + Handlebars |
| Monorepo | pnpm + Turborepo |
| Lint | Biome |
| Test | Vitest + Playwright |
| Deploy | VPS + PM2 + Nginx + Let's Encrypt |

**Docker yo'q** — native install dev'da, bare metal prod'da.

## Repo tuzilishi

```
moysklad-clone/
├── apps/
│   ├── api/                  # NestJS backend
│   ├── web/                  # Next.js app (logged-in UI)
│   ├── marketing/            # Next.js SSG (public site)
│   └── admin/                # Super-admin panel
├── packages/
│   ├── db/                   # Prisma schema + migrations + seeders
│   ├── core/                 # Domain logic (shared BE/FE)
│   ├── ui/                   # Design system + 15 pattern komponenti
│   ├── money/                # Decimal-safe UZS/multi-currency
│   ├── types/                # Shared Zod + TS types
│   ├── i18n/                 # uz/ru/en translations
│   ├── integrations-uz/      # Soliq, Payme, Click, Uzum, etc.
│   ├── config/               # tsconfig, biome, ... shared configs
│   └── workflow/             # FSM engine (document statuses)
├── tools/
│   ├── capture/              # Playwright scrapers (API docs + UI)
│   └── codegen/              # Schema → Prisma + Zod + OpenAPI
├── docs/
│   ├── adr/                  # Architecture Decision Records
│   ├── data-model/           # 53 entities + 36 documents specs
│   ├── moysklad-reference/   # Discovery artifacts (captured)
│   ├── patterns/             # 15 UI pattern references
│   └── specs/                # Sprint specs
├── tests/
│   ├── e2e/                  # Playwright
│   └── fixtures/             # Test data
├── .github/workflows/        # CI
├── pnpm-workspace.yaml
├── turbo.json
├── tsconfig.base.json
├── biome.json
└── package.json
```

## Development — mahalliy o'rnatish

**Shartlar:**
- Node.js 20.x (`.nvmrc`)
- pnpm 9.x (`corepack enable`)
- PostgreSQL 16 (native — [postgresql.org/download/windows](https://www.postgresql.org/download/windows/))
- Redis 7 (Windows — [Memurai](https://www.memurai.com/) bepul dev)
- MinIO (S3 emulatsiyasi — [min.io/download](https://min.io/download))
- Mailhog (test SMTP — [github.com/mailhog/MailHog](https://github.com/mailhog/MailHog))

**Boshlash:**

```bash
pnpm install
cp .env.example .env    # o'z qiymatlaringizni to'ldiring
pnpm db:migrate          # Prisma migratsiya
pnpm db:seed             # test ma'lumotlari
pnpm dev                 # apps/api + apps/web + apps/marketing parallel
```

## Sifat darvozalari

Har faylni saqlash / har commit / har PR'da:
- `pnpm typecheck` — TypeScript strict
- `pnpm lint` — Biome
- `pnpm test` — Vitest
- `pnpm test:e2e` — Playwright (smoke only)
- `pnpm test:visual` — Visual regression (~90% threshold)
- `pnpm build` — Turbo

Pre-commit hook (Husky + lint-staged) faqat o'zgartirilgan fayllarda tekshiradi.

## Loyiha holati

Hozirda **Sprint 0** (Foundation). Ishlab chiqilmoqda:
- [ ] Foundation hujjatlar (ADR'lar, glossariy, mahsulot spec)
- [ ] Monorepo bootstrap
- [ ] API docs scraper (Playwright)
- [ ] Visual capture (Playwright)
- [ ] Prisma schema codegen
- [ ] Native dev environment

Batafsil: [`docs/PROJECT-PLAN.md`](docs/PROJECT-PLAN.md)

## Litsenziya

Xususiy — clone ichki foydalanish uchun.
