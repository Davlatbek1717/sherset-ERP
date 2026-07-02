# Phase 0 — Foundation (Poydevor)

> ⚠️ **HISTORICAL — SUPERSEDED**
> Phase 0 to'liq bajarilgan. Monorepo + tech stack + quality gates + auth (Sprint 2.1) +
> i18n (next-intl, 2026-04-21) + UI kit (`@moysklad/ui`) + 6 ADR — hammasi joyida.
> Joriy holat: `RESUME.md` → `docs/HANDOFF.md`.

**Maqsad:** Keyingi barcha 7 faza ustida qurish uchun monorepo, tech stack, quality gates, auth, i18n, UI kit va hujjat tizimini tayyorlash.

**Muddati:** 10–14 ish kun (taxminiy)

**Natija:** Ishga tushgan "Hello World" monorepo — foydalanuvchi ro'yxatdan o'tadi, kirishi mumkin, dashboardda profilini ko'radi, UZ/RU/EN til almashtira oladi. Hech qanday business modul hali yo'q.

---

## 1. Oldindan shart

- Tech stack tasdiqlangan (`ARCHITECTURE-ANALYSIS.md`)
- Discovery hujjatlari mavjud (`docs/moysklad-reference/`)
- `CLAUDE.md` global qoidalari amal qiladi

---

## 2. Tarkib

### 2.1 Monorepo bootstrap
- `pnpm init` + `pnpm-workspace.yaml`
- `turbo.json` — build/test/lint pipeline
- `tsconfig.base.json` — strict mode, path aliases
- `biome.json` — lint + format (Biome Prettier+ESLint'dan tezroq)
- `.gitignore`, `.nvmrc` (Node 22 LTS), `.npmrc`
- `packages/config` — shared tsconfig, biome, test configs

### 2.2 Quality gates
- `.husky/pre-commit` — lint-staged (biome check)
- `.husky/commit-msg` — commitlint (Conventional Commits)
- `.github/workflows/ci.yml` — PR validation:
  - `pnpm install`
  - `pnpm typecheck` (every package)
  - `pnpm lint` (biome check)
  - `pnpm test` (vitest)
  - `pnpm build` (turbo)
- Pipeline FAIL on any error — zero tolerance

### 2.3 Dev environment (Docker Compose)
- PostgreSQL 16
- Redis 7
- MinIO (S3-compatible)
- Mailhog (SMTP catcher for dev)
- `docker compose up -d` → ready to code

### 2.4 Database schema (`packages/db`)
Initial Prisma schema with just foundational entities:
- `Account` (tenant) — id, name, plan, createdAt, timezone, currency
- `User` — id, accountId, email, emailVerified, passwordHash, createdAt
- `Session` — id, userId, tokenHash, expiresAt, userAgent, ip
- `EmailVerificationToken`
- `PasswordResetToken`
- `AuditLog` — id, accountId, userId, action, entityType, entityId, changes, createdAt
- `Employee` — id, accountId, userId, firstName, lastName, role (enum: ADMIN/MANAGER/CASHIER/etc — temporary; will be expanded)

Migration: `pnpm db:migrate`
Seed script: `pnpm db:seed` — creates test account + super-admin user

### 2.5 Backend (`apps/api`)
NestJS 10 + Fastify adapter
- `AppModule` → Imports AuthModule, HealthModule, I18nModule
- `AuthModule`:
  - POST `/auth/register` — creates Account + User + Employee (admin role)
  - POST `/auth/login` — email+password → JWT (access + refresh)
  - POST `/auth/refresh`
  - POST `/auth/logout`
  - POST `/auth/verify-email`
  - POST `/auth/forgot-password` + reset flow
  - GET `/auth/me` — current user + account
- `HealthModule`:
  - GET `/healthz` — 200 OK with DB + Redis ping
  - GET `/readyz` — fully warm
- Global:
  - Pino logger with request ids
  - Sentry integration
  - Request-id middleware
  - Global validation pipe (Zod via nestjs-zod)
  - Rate limiting (@nestjs/throttler)
  - Helmet security headers
  - CORS (strict allowlist)

### 2.6 App frontend (`apps/web`)
Next.js 15 App Router
- `/` — marketing teaser → redirect to `/login` or `/dashboard` based on session
- `/login` — login form
- `/register` — registration form
- `/forgot-password` / `/reset-password` / `/verify-email`
- `/dashboard` — authenticated route, shows user profile placeholder + lang switcher
- `/settings/profile` — basic profile page
- `/settings/account` — account settings stub
- Protected route wrapper (AuthProvider)

### 2.7 UI kit (`packages/ui`)
- Tailwind CSS v4 + Montserrat font
- shadcn/ui components added: Button, Input, Form, Label, Card, Dialog, DropdownMenu, Toast, Avatar, Alert, Skeleton, Tabs, Table, Select, Popover
- `theme.ts` — exports design tokens (primary #2855AF, text #232D4B, radius 8px)
- `tokens.css` — CSS variables for light + dark
- Storybook minimal (optional — can defer to Phase 1)

### 2.8 i18n (`packages/i18n`)
- `next-intl` provider in app
- Language files: `uz.json`, `ru.json`, `en.json`
- Namespaces: `common`, `auth`, `errors`, `validation`
- Lang switcher component in header (UZ default, fallback UZ → RU → EN)
- RTL ready (for future Arabic if needed)

### 2.9 Design system validation
Marketing-site style homepage lives under `apps/marketing` (also Next.js) — just the hero section of moysklad.uz piksel-level cloned. Purpose: prove tokens match before Phase 1.

### 2.10 Documentation
- `README.md` — how to run
- `CONTRIBUTING.md` — coding standards, commit conventions, quality gates
- `docs/adr/0001-tech-stack.md` — copy of ARCHITECTURE-ANALYSIS
- `docs/adr/0002-monorepo-structure.md`
- `docs/adr/0003-multi-tenant-strategy.md`

### 2.11 Deploy stub
- `Dockerfile` for api + web + marketing
- `docker-compose.prod.yml` — production-ready compose for VPS
- GitHub Actions deploy to staging on merge-to-main (optional — can defer)

---

## 3. Darvozalar (quality gates, faza yakunidagi)

Faza "Tayyor" deyiladi agar:

- [ ] `pnpm install` toza o'rnatiladi
- [ ] `docker compose up` + `pnpm db:migrate` + `pnpm db:seed` ishlaydi
- [ ] `pnpm dev` ikkala app'ni ishga tushiradi
- [ ] Ro'yxatdan o'tish, email tasdiqlash, kirish, chiqish oqimlari ishlaydi
- [ ] `pnpm typecheck` yashil
- [ ] `pnpm lint` yashil
- [ ] `pnpm test` yashil, coverage ≥ 80% `packages/db` + auth modullarda
- [ ] `pnpm build` yashil (turbo cache ishlaydi)
- [ ] CI yashil (har PR)
- [ ] Lighthouse dashboard sahifasida Performance ≥ 90, Accessibility ≥ 95
- [ ] Til almashtirish ishlaydi (UZ ↔ RU ↔ EN)
- [ ] Marketing sayt hero section moysklad.uz bilan piksel-level mos (tokenlar to'g'ri)
- [ ] Commitlar Conventional Commits bo'yicha
- [ ] Production Docker image 200 MB'dan kichik

---

## 4. Test strategiyasi

- **Unit:** `packages/db` (prisma helpers), `packages/core` (domain helpers), auth guards
- **Integration:** auth flow (testcontainers + real PostgreSQL)
- **E2E (Playwright):** register → verify email → login → dashboard → logout (smoke oqimi)
- **Contract tests:** Zod schemalari API ↔ web o'rtasida moslik

---

## 5. Xavf va yumshatish

| Xavf | Ehtimol | Ta'sir | Yumshatish |
|---|---|---|---|
| Prisma schema RLS bilan kam qo'llanadi | O'rta | Yuqori | Har querryda `accountId` shart qilib yozamiz; test'larda xato tenant kelsa — fail |
| i18n keyincha qo'shish qiyin | Past | Yuqori | Faza 0'da i18n majburiy — bitta ham hardcoded string qolmaydi |
| Monorepo package bog'liqligi chalkashadi | O'rta | O'rta | Turborepo cache + `"dependencies"` aniq yoziladi |
| Docker image katta bo'ladi | Past | O'rta | Multi-stage Dockerfile, alpine base |
| Email deliverability | O'rta | O'rta | Resend + domain DKIM sozlash |

---

## 6. Keyingi faza (Phase 1) — Marketing sayt

Phase 0 tugagach, Phase 1: moysklad.uz'ning to'liq ochiq sayti — piksel-level clone, SEO, barcha URL'lar, blog, tariflar.

---

## 7. Nima bu fazada YO'Q

Shu fazada biz QILMAYMIZ (chegara aniqligi uchun):
- ❌ Biror biznes modul (tovarlar, buyurtmalar, ...) — Phase 2+
- ❌ Marketing sayt'ning to'liq sahifalari — Phase 1
- ❌ Multi-tenancy UI (organizatsiya o'zgartirish) — Phase 2 boshida
- ❌ Ilg'or auth (SSO, OAuth, passkey, MFA) — keyinroq
- ❌ Real deploy (domain, SSL) — Phase 1 oxirida
- ❌ Integratsiyalar katalogi — Phase 6
- ❌ POS/kassa — Phase 5
- ❌ Fiskal integratsiya (Soliq.uz) — Phase 5

---

## 8. Success kriteri

Foydalanuvchi:
1. `https://localhost:3000` ga kiradi
2. "Ro'yxatdan o'tish" bosadi → ism, email, parol kiritadi → account yaratiladi
3. Email'ga tasdiq link keladi (Mailhog'da ko'riladi) → bosib tasdiqlaydi
4. Kirish formasiga o'tadi → email+parol bilan kiradi
5. Dashboard'ga o'tadi → "Salom, <ismim>" ko'radi
6. Til tanlagichdan UZ → RU → EN switch qiladi → barcha matn tarjima bo'ladi
7. "Chiqish" bosadi → login sahifasiga qaytadi
8. Bir necha akkaunt ochib ko'radi — bir akkaunt ma'lumoti ikkinchisidan ko'rinmaydi

Agar hamma yettitasi ishlasa — Phase 0 yashil, Phase 1'ga o'tamiz.

---

## 9. Tasdiqlash so'rovi

Iltimos:
1. Ushbu Phase 0 tarkibi to'g'rimi?
2. Tech stack tanlovi (`ARCHITECTURE-ANALYSIS.md`) qabul qilinadimi?
3. Birinchi faza davomiyligi (10–14 kun) realistikmi?
4. Qo'shish kerak biror narsa bormi (masalan, dark mode, telegram login, bot etc)?

Tasdiqlang — keyin `writing-plans` skill'ini ishga tushirib, har bo'limning bajarilish rejasini yozamiz, so'ng `executing-plans` bilan birinchi faza amalga oshiriladi.
