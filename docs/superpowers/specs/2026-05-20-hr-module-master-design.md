# HR Module — Master Design Spec

> **Status:** Draft v1 (2026-05-20) — awaiting user review
> **Scope:** "Yechimlar"dan keyin yangi top-level **HR** menyu sifatida yangibolim/ (Python FastAPI + SQLite + React) loyihasini moysklad-clone monorepo'siga (NestJS + Prisma + Postgres + Next.js) 1:1 mantiqiy parity bilan integratsiya qilish.
> **Strategy:** Master spec (bu fayl) + 7 ta sub-phase sprint plan (alohida `writing-plans` chaqiruvi bilan).
> **Timeline:** ~6-8 hafta solo, sifat birinchi (CLAUDE.md asosiy qoidasi).
> **Source reference:** `yangibolim/SYSTEM_OVERVIEW.md` (74 KB), `yangibolim/spec/00-04` (272 KB).

---

## 0. CONTEXT & PROBLEM STATEMENT

### Manba loyiha (yangibolim/)

Production'da ishlaydigan `moy.biznesjon.uz` santexnika do'koni boshqaruv tizimi:
- **Backend:** Python 3.12 + FastAPI + SQLAlchemy async + SQLite + Telethon + APScheduler + httpx
- **Frontend:** React 18 + Vite + Tailwind + Zustand + recharts
- **Hajm:** 14 sahifa, 17 router, 14 service, 13+ model, ~25 000 LOC, 209 test

**3 ta katta vazifa:**

1. **MoySklad → Telegram bridge:** Har sotuv/to'lov/buyurtma'da kontragentga avto-xabar (chek + balans + izoh) Telegram MTProto orqali.
2. **Vazifa boshqaruvi:** Admin shablon yaratadi → xodimga Telegram'da yuboriladi → xodim javob beradi → **tekshiruvchi (4-ko'z)** approve/reject → bonus/jarima avtomat.
3. **Oylik + KPI:** Asosiy oylik + sotuv ulushi (KPI tier) + bonus − jarima + commission, har xodim uchun avtomat hisoblanadi.

### Maqsad loyiha (moysklad-clone)

`D:\projects\moysklad` — moysklad.uz 1:1 to'liq parity klon (94 modul, 12 top-menyu, NestJS + Prisma + Next.js 15). Strict 99% fidelity (memory: feedback-strict-fidelity.md). MVP yo'q.

### Integratsiya muammosi

Mavjud moysklad-clone'da yangibolim bilan **semantikasi farqli, lekin nomi bir xil** modullar mavjud:

| Mavjud (moysklad parity) | Yangibolim (HR) | Konflikt |
|---|---|---|
| `Employee` model | username, is_checker, telegram_phone, MoySklad agent link | Field nomi va semantika farq qiladi |
| `Task` model + module | 4-ko'z review + scheduler + bonus/fine + Telegram | Moysklad Task = CRM tipi; HR Task = topshiriq |
| `Payroll` model + module | KPI tier + 5 manba bonus/fine + commission + 6 tab | Moysklad oddiy oylik; HR — formula matematika |
| `Telegram` module (Bot API) | 2 MTProto user akkaunt + flood + chat history | Bot vs user akkaunt |
| `Auth` (JWT) | base64 token (signature yo'q) | yangibolim less professional |

### Asosiy qaror

**B variant — mavjud modullar kengaytiriladi**, ammo strict discriminator/namespace bilan toza ajratiladi (moysklad parity buzilmaydi):

- Mavjud `Employee` modelga HR field'lar additive nullable qo'shiladi.
- Mavjud `Task` modelga `kind` enum + HR nullable field'lar qo'shiladi.
- Mavjud `Payroll` modelga tegmaydi (toza qoladi) — yangi `HrSalaryConfig`, `HrKpiDailyLog`, `HrKpiMonthlyScore`, `HrBonusFineLog` alohida table'lar.
- Mavjud `Telegram` (Bot API) toza qoladi — yangi `HrTelegramAccount` (MTProto) alohida.
- `Auth` JWT'ga yangibolim base64 token o'rniga "professional upgrade" — login flow va permission tizimi yangilanadi.

### MUHIM: Implementation strategiyasi — qayta yozish, copy-paste EMAS

> **Foydalanuvchi qoidasi (2026-05-20):** *"Kodlar bunday bo'lmaydi — to'liq qayta o'zimizning loyihaga qo'shilgan professional, lekin xuddi o'shandek ishlaydigan qilamiz."*

**Yangibolim'ning kodi (Python FastAPI + SQLAlchemy + React JSX + Telethon) — REFERENCE ONLY.**
- ❌ Copy-paste qilinmaydi
- ❌ Mavjud Python kodi tegmaydi (`D:/projects-desktop/projects/moysklad/` papkasi o'zgarmaydi)
- ❌ Avtomat tarjima/codemod ishlatilmaydi
- ✅ Har modul **noldan TypeScript'da** yoziladi, bu loyihaning standart pattern'lariga to'liq mos
- ✅ Yangibolim **manba sifatida ishlatiladi**: biznes mantiq, FSM, formulalar, validation qoidalarini o'rganish uchun

**Stack mapping (qayta yozish jadvali):**

| Yangibolim (manba o'rganish uchun) | Maqsad (bu loyihada qayta yozish) |
|---|---|
| FastAPI router (`routers/*.py`) | NestJS controller (`apps/api/src/modules/hr/*/`*`.controller.ts`) |
| SQLAlchemy model | Prisma schema (`packages/db/prisma/schema.prisma`) — field nomi 1:1 saqlash mumkin |
| Pydantic schema | Zod schema (`*.schema.ts`) — validation qoidalari aynan |
| FastAPI service | NestJS injectable service (`*.service.ts`) — pattern moysklad-clone standart |
| Telethon (Python) | gramjs (TypeScript MTProto) — API farqli, xulq aynan |
| APScheduler | `@nestjs/schedule` (mavjud) — interval/cron aynan |
| React JSX page | Next.js 15 App Router page (`apps/web/src/app/(app)/hr/*/page.tsx`) |
| Zustand store | bu loyihaning standart pattern (mavjud `apps/web/src/hooks/` + `lib/`) |
| Tailwind class | Tailwind class (CSS aynan portable) |
| recharts | Recharts mavjud bu loyihada — komponent qayta yoziladi |
| Telegram session file | DB encrypted (`HrTelegramAccount.sessionEncrypted`) — yangibolim'da file, bizda DB |

**Implementation pattern (har sprint uchun):**

1. **Yangibolim manba o'qish** — relevant `models/*.py`, `routers/*.py`, `services/*.py`, `pages/*.jsx` kuzatib mantiqni tushunish
2. **Bu loyihaning standart pattern'ini topish** — `apps/api/src/modules/<o'xshash mavjud modul>/` ga qarash (e.g. purchase-order yoki demand)
3. **TypeScript'da noldan yozish** — moysklad-clone'ning standart'lariga to'liq mos (`Zod` validation, `@nestjs/common` decorator, Prisma transaction, BigInt money, Tailwind class)
4. **Biznes mantiqni aynan saqlash** — FSM transitions, formula, validation qoidalari yangibolim'dagi kabi
5. **Professional upgrade'lar qo'llanadi** (§ 0 dagi 13 ta gap to'g'rilanadi)
6. **Test yozish** — bu loyihaning Vitest + Playwright pattern'i bilan (yangibolim'ning pytest emas)

### "1:1 parity" ≠ "yangibolim kodini ko'chirish"

Yangibolim'ning haqiqiy kodi (`D:/projects-desktop/projects/moysklad/`) tekshirildi (2026-05-20). Aniqlandi: **yangibolim'da yozilgan spec va haqiqiy kod o'rtasida 13 ta katta farq bor**. Yangibolim spec'da ko'p narsa yozilgan, lekin **kodda chala/bug/yo'q**.

**Bizning yondashuv (foydalanuvchi "juda professional" qoidasi bo'yicha):**

| # | Yangibolim'ning haqiqiy holati | Bizning to'liq qurish strategiyasi |
|---|---|---|
| 1 | Token = base64(JSON) signature yo'q | **JWT** signed (mavjud) |
| 2 | Backend permission enforcement **YO'Q** (faqat frontend hide) — SECURITY ISSUE | `@RequireHrPermission` decorator har endpoint'da qattiq enforce |
| 3 | MoySklad **REST polling 30s** (lag, auth, rate limit) | NestJS EventEmitter domain events (real-time, zero-lag) |
| 4 | Processed-set **in-memory** (restart → state lost) | DB persist (yoki domain events bilan kerakmas) |
| 5 | TZ UTC hardcoded (yangibolim spec da +05 deyilgan, lekin code mix) | `Asia/Tashkent +05` aniq, `date-fns-tz` bilan |
| 6 | Notification template engine **YO'Q** (text template'lar yo'q, faqat metadata matching) | Eta template engine + 5 ta default template seed |
| 7 | Bonus/fine **5 source da faqat 2 ta** implement (manual + rule). `auto_task_reward`, `auto_task_fine`, `auto_expire_fine` — **YO'Q** | 5 ta source ham to'liq quramiz |
| 8 | KPI **commission** component formula'da nomi bor, **calc YO'Q** | To'liq quramiz: `commission = personal_sales * commission_percent / 100` |
| 9 | Task **deadline auto-expire job YO'Q** (yangibolim spec da 60s job deyilgan, code yo'q) | `@Cron('* * * * *')` to'liq quramiz |
| 10 | Task **depends_on chain auto-trigger YO'Q** (field saqlanadi, logic yo'q) | To'liq quramiz (HrTaskLog finalized → dependents dispatch) |
| 11 | KPI cron 23:30 method bor, **scheduler register YO'Q** | `@Cron('30 23 * * *', { timeZone: 'Asia/Tashkent' })` |
| 12 | WebSocket auth **YO'Q** (anonymous connection) | JWT handshake (cookie/query param) |
| 13 | `moysklad_service._request` BUG (private method public'dan chaqirilgan) | Domain event bilan butunlay almashinadi — bug yo'q |

**Xulosa:** "1:1 mantiqiy parity" = **yangibolim spec'da yozilgan biznes mantiqni TO'LIQ qurish + yangibolim'ning chala/buggy joylarini PROFESSIONAL TUZATISH**. Bu **upgrade**, "ko'chirish" emas.

**To'liq match qiluvchi joylar (ko'chiriladi):**
- 4-ko'z FSM transitions
- KPI tier formula matematikasi
- Role comma-separated parse logic
- Permission matrix struktura (8 page + 5 sub-section)
- APScheduler dynamic job pattern (NestJS @nestjs/schedule ekvivalent)
- 2-akkaunt MTProto slot failover pattern
- Retry backoff exponential (30 → 90 → 270s)

### Strict 1:1 qaerda saqlanadi

**Biznes mantiq aynan saqlanadi:**
- 4-ko'z FSM (sent → pending_review → approved/rejected, deadline auto-fine)
- 5 manba bonus/fine (manual, rule, auto_task_reward, auto_task_fine, auto_expire_fine)
- KPI tier formula (achievement % → payout %)
- Salary formula: `base + fix + kpi + bonus − fine + commission`
- 2 MTProto akkaunt failover, flood persist
- Scheduler interval'lari (queue 5s, deadline 60s, KPI 23:30, health 5min)
- Notification template 5 doc type (Demand, PaymentIn, CustomerOrder, Supply, SalesReturn)

**Professional upgrade'lar (yangibolim less mature, biz to'g'rilaymiz):**
- Base64 token → JWT (signed, argon2 hash) ✅ already exists
- SQLite → Postgres (RLS multi-tenant) ✅ already
- MoySklad REST polling → domain event hooks (chunki bu loyiha O'ZI moysklad — lag yo'q, auth yo'q)
- TZ-naive datetime → tz-aware (`Asia/Tashkent +05`) — yangibolim'ning UTC vs lokal nomuvofiqliklari to'g'rilanadi
- Float pul → BigInt minor units (mavjud `@moysklad/money` package)
- "Aynan saqlanadi" deyilgan bug'lar (kpi.py public method, TZ aralashish) — **professional yo'lda tuzatiladi**, master spec'da izohlanadi

---

## 1. ARXITEKTURA OVERVIEW

### Backend modul tuzilishi

```
apps/api/src/modules/
├── auth/                         # mavjud — JWT login flow kengayadi
├── employee/                     # YANGI — mavjud Employee modelga HR endpoint'lar
├── task/                         # mavjud — Task.kind=HR uchun yangi endpoint'lar
├── payroll/                      # mavjud — TEGMAYDI (moysklad parity)
├── telegram/                     # mavjud Bot API — TEGMAYDI
├── notification/                 # mavjud — kengayadi (HR template'lar)
├── audit-log/                    # mavjud — kengayadi (HR actions)
├── hr/                           # YANGI top-level namespace
│   ├── attendance/               # HrAttendance CRUD + FSM
│   ├── hr-task-template/         # HrTaskTemplate CRUD + scheduler
│   ├── hr-task-review/           # 4-ko'z review queue + FSM
│   ├── hr-task-send/             # Manual/scheduled/event trigger pipeline
│   ├── hr-kpi/                   # KpiDailyLog cron + MonthlyScore
│   ├── hr-bonus-fine/            # 5 manba ledger CRUD
│   ├── hr-salary/                # SalaryConfig + final calc + Oylik tab API
│   ├── hr-telegram-bridge/       # MTProto worker + outbox + listeners
│   ├── hr-telegram-account/      # MTProto session management (DB encrypted)
│   ├── hr-messages/              # MessageLog query + ChatPanel API
│   ├── hr-dashboard/             # Real-time summary stat
│   ├── hr-reports/               # Period + top counterparties
│   ├── hr-settings/              # HrRole CRUD + custom dept + permissions matrix
│   ├── hr-scheduler/             # Cron registry (per-template dynamic)
│   ├── hr-events/                # NestJS EventEmitter wiring (domain hooks)
│   └── hr-websocket/             # WS gateways (/ws/hr/sync, /ws/hr/tasks/:id)
└── (mavjud 90+ modul tegmaydi)
```

### Frontend tuzilishi

```
apps/web/src/app/(app)/hr/
├── layout.tsx                    # HR top-menu active + 10 sub-nav
├── page.tsx                      # Bosh sahifa (Dashboard)
├── employees/
│   ├── page.tsx                  # Ro'yxat (CRUD + filter)
│   ├── [id]/
│   │   ├── page.tsx              # Detail
│   │   ├── permissions/page.tsx  # Per-page permission matrix
│   │   └── salary/page.tsx       # Per-employee KPI override
│   └── _components/              # EmployeeModal, SetPasswordModal, MoyskladAgentDropdown
├── attendance/
│   ├── page.tsx                  # Bugun (TodayTab) + Hisobot (ReportTab)
│   └── _components/              # CheckInModal, EditModal
├── tasks/
│   ├── page.tsx                  # Templates + Logs (2 tab)
│   ├── _components/              # TemplateModal (16 input!), LogsFilter, AnswerModal
│   └── (~1700 qator UI parity)
├── review/
│   └── page.tsx                  # Pending review queue
├── my-tasks/
│   └── page.tsx                  # Xodim shaxsiy (Yangi + Barchasi tab)
├── payroll/
│   ├── page.tsx                  # 6-tab (~2945 qator)
│   ├── _tabs/
│   │   ├── overview.tsx          # Tab 1
│   │   ├── kpi.tsx               # Tab 2
│   │   ├── bonus-fine.tsx        # Tab 3
│   │   ├── commission.tsx        # Tab 4
│   │   ├── salary-config.tsx     # Tab 5
│   │   └── final.tsx             # Tab 6
│   └── _components/              # DetailModal (kun-bo'yicha guruh), BonusModal, FineModal
├── messages/
│   ├── page.tsx                  # Pagination + filter + ChatPanel
│   └── _components/              # ChatPanelSlideOver, ResendButton, FilterDropdown
├── reports/
│   └── page.tsx                  # Period + BarChart + Top kontragent PieChart
└── settings/
    ├── page.tsx                  # HR sozlamalar bosh
    ├── roles/page.tsx            # Custom rol CRUD
    ├── telegram/page.tsx         # MTProto akkaunt + login wizard
    ├── notification-templates/page.tsx  # 5 doc type message template
    └── salary-config/page.tsx    # Global SalaryConfig
```

### 5 ta asosiy printsip

1. **Discriminator + namespace ajratish** — mavjud Task table = bitta, `kind` enum (CRM | HR) bilan ajratiladi. Endpoint'lar to'liq alohida (`/api/tasks` mavjud vs `/api/hr/tasks` yangi).
2. **Additive migration** — Prisma migration faqat `ADD COLUMN` nullable + yangi table. Hech qachon `DROP`/`RENAME` mavjud field. Backward compat 100%.
3. **Domain event > polling** — MoySklad REST polling almashtirildi. `DemandService.post()` ichida `EventEmitter.emitAsync('hr.event.demand.posted', payload)` — HR listener'lar reaksiya bildiradi. Lag yo'q, auth yo'q, rate limit yo'q.
4. **MTProto session DB-encrypted** — file storage emas, `HrTelegramAccount.sessionEncrypted` (AES-256-GCM, `HR_SESSION_KEY` env). Boot'da decrypt → gramjs StringSession.
5. **Professional sifat → speed ham** — har sprint oxirida bitta umumiy gate (typecheck + lint + test + build + adversarial QA), sprint ichida sub-task'lar gate qilinmaydi (foydalanuvchi feedback: 2026-05-20).

---

## 2. SUB-SYSTEM TARTIBI (7 SPRINT)

| # | Sprint | Hajm | Bog'liqlik | Asosiy deliverable | Vaqt |
|---|---|---|---|---|---|
| **P0** | Foundation (infra setup) | M | — | Prisma migration (HR field + 16 yangi table), gramjs + websockets paketlar, NestJS EventEmitter, HR module skeleton + sidebar/subnav, i18n keys (uz/ru) | 3-4 kun |
| **P1** | HR-Employee + Auth kengaytma | M-L | P0 | Employee.HR field'lar (telegramPhone, isChecker, moyskladAgentId, salaryConfig, hrRoles); HrEmployeePermission (per-page full/read/own_only); Employees sahifa (CRUD, set-password, MoySklad agent dropdown, custom roles, permissions tab); HrRole entity | 5-7 kun |
| **P2** | HR-Attendance | S-M | P1 | HrAttendance entity; check-in/out/edit FSM; TZ-safe (Asia/Tashkent +05); admin telegram notification; 2-tab UI | 3-4 kun |
| **P3** | HR-Tasks + Review (yadro) | **XL** | P1 + scheduler | HrTaskTemplate (16 input!) + Task kengaytma (kind=HR, checkerId, scheduleConfig, deadline, response_type, reward, fine, depends_on); APScheduler dynamic registry; 4-ko'z FSM; WebSocket `/ws/hr/tasks/:employeeId`; 4 sahifa (Tasks, Review, MyTasks, +TemplateModal); send-to-Telegram pipeline | 10-14 kun |
| **P4** | HR-Telegram bridge + Messages | **XL** | P0 + P3 + Sales/Purchase event hooks | gramjs 2-akkaunt MTProto worker (DB-encrypted session), TelegramOutbox queue (5s + retry backoff), flood_wait persist, entity cache; Notification template engine (5 doc tipi); MoySklad domain event hooks; Messages sahifa (5350+ pagination, filter, ChatPanel); Counterparty telegram linking | 10-14 kun |
| **P5** | HR-Oylik + KPI | **XXL** | P1 + P3 + sales sync | SalaryConfig (fix_weight, kpi_weight, bonus_weight, tiers JSON); KpiDailyLog (cron 23:30); MonthlyScore; HrBonusFineLog (5 manba); Salary formulalari aynan; Oylik sahifa (6 tab, ~2945 qator, detail modal kun-bo'yicha guruh) | 10-14 kun |
| **P6** | HR-Dashboard + Reports | M | P3 + P4 | Realtime stat (jami kontragent, Telegram ulangan, bugun yuborilgan, failed); 7-kun AreaChart; Recent Messages; Reports (period selector, BarChart, Top kontragent PieChart); auto-refresh 30s | 3-4 kun |

**Jami: 44-61 kun** = **6-8.5 hafta** solo, sifat birinchi.

**Commit ritmi:** har sprint = **1 cohesive commit** (sprint oxirida). Sprint ichidagi sub-task'lar uchun alohida commit yo'q. Foydalanuvchi qoidasi (2026-05-20): *"har qisqa ishdan keyin tekshiruv kerak emas — umumiy katta bo'limda 1 ta tekshiruv kerak"*.

**Master spec** (bu fayl) qamrovi: § 1-7 (arxitektura, modul tartibi, data model, auth, infra, migration, testing) + har sprint **scope outline** (entity, FSM, endpoint). Detail implementation plan **alohida** — sprint boshlanganda `writing-plans` chaqiriladi.

---

## 3. DATA MODEL EXTENSION STRATEGIYASI

### Mavjud modellarga additive qo'shilishlar

```prisma
model Employee {
  // ... mavjud 30+ field tegmaydi
  // YANGI HR FIELD'LAR (hammasi nullable yoki default):
  username           String?   @db.VarChar(50)
  isChecker          Boolean   @default(false) @map("is_checker")
  telegramPhone      String?   @map("telegram_phone") @db.VarChar(20)
  moyskladAgentId    String?   @map("moysklad_agent_id") @db.Uuid
  department         String?   @db.VarChar(100)
  hrRoles            String[]  @default([]) @map("hr_roles")
  salaryConfig       Json?     @map("salary_config")

  hrPermissions      HrEmployeePermission[]
  hrTaskLogsAssigned HrTaskLog[]               @relation("HrTaskAssignee")
  hrTaskLogsChecked  HrTaskLog[]               @relation("HrTaskChecker")
  hrAttendances      HrAttendance[]
  hrBonusFines       HrBonusFineLog[]
  hrKpiDaily         HrKpiDailyLog[]
  hrKpiMonthly       HrKpiMonthlyScore[]

  @@unique([accountId, username], name: "Employee_account_username_uk")
}

model Task {
  // ... mavjud field'lar tegmaydi
  kind              TaskKind   @default(CRM)
  // HR-only nullable kengaytmalar:
  hrTemplateId      String?    @map("hr_template_id") @db.Uuid
  hrCheckerId       String?    @map("hr_checker_id") @db.Uuid
  hrResponseType    String?    @default("none") @map("hr_response_type") @db.VarChar(20)
  hrDeadlineMinutes Int?       @map("hr_deadline_minutes")
  hrRewardMinor     BigInt?    @map("hr_reward_minor")
  hrFineMinor       BigInt?    @map("hr_fine_minor")
  hrDependsOnId     String?    @map("hr_depends_on_id") @db.Uuid

  hrTemplate        HrTaskTemplate? @relation(fields: [hrTemplateId], references: [id])
  hrTaskLog         HrTaskLog?
}

enum TaskKind { CRM HR }
```

### Yangi HR table'lar (16 ta)

> **Eslatma:** `Employee.salaryConfig Json?` — per-employee override (ixtiyoriy). Default global config — `HrSalaryConfig` table (per-account singleton). Lookup tartibi: `Employee.salaryConfig ?? HrSalaryConfig`.

```prisma
model HrTaskTemplate {
  id                String    @id @default(uuid()) @db.Uuid
  accountId         String    @map("account_id") @db.Uuid
  title             String    @db.VarChar(255)
  description       String?
  assignedEmployeeId String?  @map("assigned_employee_id") @db.Uuid   // XOR with role
  assignedRole      String?   @map("assigned_role") @db.VarChar(50)   // XOR with employee
  department        String?   @db.VarChar(100)
  priority          String    @default("medium")                       // low|medium|high|urgent
  triggerType       String    @map("trigger_type")                     // manual|scheduled|event
  scheduleConfig    Json?     @map("schedule_config")                  // {time: "09:00", mode: "weekly"|"monthly", days: [1,2,5]|day: 15}
  eventConfig       Json?     @map("event_config")                     // {docType: "demand", state: "posted", largeSaleMin?: BigInt}
  responseType      String    @default("none") @map("response_type")   // none|yes_no|text
  deadlineMinutes   Int?      @map("deadline_minutes")
  rewardMinor       BigInt?   @map("reward_minor")
  fineMinor         BigInt?   @map("fine_minor")
  checkerId         String?   @map("checker_id") @db.Uuid
  dependsOnId       String?   @map("depends_on_id") @db.Uuid
  isActive          Boolean   @default(true) @map("is_active")
  createdAt         DateTime  @default(now()) @map("created_at") @db.Timestamptz()
  updatedAt         DateTime  @updatedAt @map("updated_at") @db.Timestamptz()

  account           Account   @relation(fields: [accountId], references: [id], onDelete: Cascade)
  assignedEmployee  Employee? @relation("HrTemplateAssignee", fields: [assignedEmployeeId], references: [id])
  checker           Employee? @relation("HrTemplateChecker", fields: [checkerId], references: [id])
  dependsOn         HrTaskTemplate? @relation("HrTemplateDeps", fields: [dependsOnId], references: [id])
  logs              HrTaskLog[]
  taskInstances     Task[]

  @@index([accountId, isActive])
  @@index([accountId, triggerType])
  @@map("hr_task_template")
}

model HrTaskLog {
  id              String    @id @default(uuid()) @db.Uuid
  accountId       String    @map("account_id") @db.Uuid
  templateId      String    @map("template_id") @db.Uuid
  taskId          String    @unique @map("task_id") @db.Uuid          // 1:1 with Task (kind=HR)
  employeeId      String    @map("employee_id") @db.Uuid
  status          String                                                // sent|pending_review|answered_yes|answered_no|answered_text|failed
  responseText    String?   @map("response_text")
  sentAt          DateTime  @map("sent_at") @db.Timestamptz()
  answeredAt      DateTime? @map("answered_at") @db.Timestamptz()
  reviewedAt      DateTime? @map("reviewed_at") @db.Timestamptz()
  reviewedById    String?   @map("reviewed_by_id") @db.Uuid
  reviewComment   String?   @map("review_comment")
  telegramMessageId String? @map("telegram_message_id") @db.VarChar(50)
  failReason      String?   @map("fail_reason")

  account     Account        @relation(fields: [accountId], references: [id], onDelete: Cascade)
  template    HrTaskTemplate @relation(fields: [templateId], references: [id])
  task        Task           @relation(fields: [taskId], references: [id], onDelete: Cascade)
  employee    Employee       @relation("HrTaskAssignee", fields: [employeeId], references: [id])
  reviewedBy  Employee?      @relation("HrTaskChecker", fields: [reviewedById], references: [id])
  bonusFines  HrBonusFineLog[]

  @@index([accountId, employeeId, status])
  @@index([accountId, templateId, sentAt(sort: Desc)])
  @@index([accountId, status, sentAt(sort: Desc)])
  @@map("hr_task_log")
}

model HrAttendance {
  id            String    @id @default(uuid()) @db.Uuid
  accountId     String    @map("account_id") @db.Uuid
  employeeId    String    @map("employee_id") @db.Uuid
  checkInTime   DateTime  @map("check_in_time") @db.Timestamptz()
  checkOutTime  DateTime? @map("check_out_time") @db.Timestamptz()
  editedById    String?   @map("edited_by_id") @db.Uuid
  editedAt      DateTime? @map("edited_at") @db.Timestamptz()
  createdAt     DateTime  @default(now()) @map("created_at") @db.Timestamptz()

  account   Account   @relation(fields: [accountId], references: [id], onDelete: Cascade)
  employee  Employee  @relation(fields: [employeeId], references: [id])
  editedBy  Employee? @relation("HrAttendanceEditor", fields: [editedById], references: [id])

  @@index([accountId, employeeId, checkInTime(sort: Desc)])
  @@map("hr_attendance")
}

model HrTelegramAccount {
  id               String    @id @default(uuid()) @db.Uuid
  accountId        String    @map("account_id") @db.Uuid
  slot             Int                                          // 1 yoki 2
  phoneNumber      String    @map("phone_number") @db.VarChar(20)
  apiId            Int       @map("api_id")                     // my.telegram.org dan
  apiHashEncrypted String    @map("api_hash_encrypted")         // AES-GCM
  sessionEncrypted String?   @map("session_encrypted")          // gramjs StringSession encrypted
  isActive         Boolean   @default(false) @map("is_active")
  lastConnectedAt  DateTime? @map("last_connected_at") @db.Timestamptz()
  floodWaitUntil   DateTime? @map("flood_wait_until") @db.Timestamptz()

  account Account @relation(fields: [accountId], references: [id], onDelete: Cascade)

  @@unique([accountId, slot])
  @@map("hr_telegram_account")
}

model HrTelegramSession {
  // flood_wait + entity cache persist (yangibolim'da data/flood_wait.json + data/entity_cache.json)
  id          String   @id @default(uuid()) @db.Uuid
  accountId   String   @map("account_id") @db.Uuid
  accountSlot Int      @map("account_slot")
  key         String   @db.VarChar(100)                          // "flood_wait" | "entity_cache" | ...
  value       Json
  updatedAt   DateTime @updatedAt @map("updated_at") @db.Timestamptz()

  account Account @relation(fields: [accountId], references: [id], onDelete: Cascade)

  @@unique([accountId, accountSlot, key])
  @@map("hr_telegram_session")
}

model HrChatHistory {
  id             String   @id @default(uuid()) @db.Uuid
  accountId      String   @map("account_id") @db.Uuid
  counterpartyId String   @map("counterparty_id") @db.Uuid
  messages       Json     @default("[]")                         // oxirgi 40 ta xabar cache
  updatedAt      DateTime @updatedAt @map("updated_at") @db.Timestamptz()

  account      Account      @relation(fields: [accountId], references: [id], onDelete: Cascade)
  counterparty Counterparty @relation(fields: [counterpartyId], references: [id])

  @@unique([accountId, counterpartyId])
  @@map("hr_chat_history")
}

model HrTelegramOutbox {
  id               String    @id @default(uuid()) @db.Uuid
  accountId        String    @map("account_id") @db.Uuid
  counterpartyId   String?   @map("counterparty_id") @db.Uuid
  employeeId       String?   @map("employee_id") @db.Uuid            // xodimga vazifa yuborish uchun
  toPhone          String    @map("to_phone") @db.VarChar(20)
  messageText      String    @map("message_text")
  status           String    @default("pending")                     // pending|sent|failed|retry
  retryCount       Int       @default(0) @map("retry_count")
  nextRetryAt      DateTime? @map("next_retry_at") @db.Timestamptz()
  sentAt           DateTime? @map("sent_at") @db.Timestamptz()
  failReason       String?   @map("fail_reason")
  sourceEventType  String?   @map("source_event_type") @db.VarChar(50)
  sourceDocId      String?   @map("source_doc_id") @db.Uuid
  telegramMessageId String?  @map("telegram_message_id") @db.VarChar(50)
  createdAt        DateTime  @default(now()) @map("created_at") @db.Timestamptz()

  account      Account       @relation(fields: [accountId], references: [id], onDelete: Cascade)
  counterparty Counterparty? @relation(fields: [counterpartyId], references: [id])
  employee     Employee?     @relation(fields: [employeeId], references: [id])

  @@index([accountId, status, nextRetryAt])
  @@index([accountId, counterpartyId, createdAt(sort: Desc)])
  @@map("hr_telegram_outbox")
}

model HrBonusFineLog {
  id           String   @id @default(uuid()) @db.Uuid
  accountId    String   @map("account_id") @db.Uuid
  employeeId   String   @map("employee_id") @db.Uuid
  kind         String                                              // bonus | fine
  source       String                                              // manual | rule | auto_task_reward | auto_task_fine | auto_expire_fine
  amountMinor  BigInt   @map("amount_minor")
  reason       String?
  taskLogId    String?  @map("task_log_id") @db.Uuid
  ruleId       String?  @map("rule_id") @db.Uuid
  createdById  String?  @map("created_by_id") @db.Uuid             // null = auto
  createdAt    DateTime @default(now()) @map("created_at") @db.Timestamptz()

  account   Account         @relation(fields: [accountId], references: [id], onDelete: Cascade)
  employee  Employee        @relation(fields: [employeeId], references: [id])
  taskLog   HrTaskLog?      @relation(fields: [taskLogId], references: [id])
  rule      HrBonusFineRule? @relation(fields: [ruleId], references: [id])
  createdBy Employee?       @relation("HrBonusCreator", fields: [createdById], references: [id])

  @@index([accountId, employeeId, createdAt(sort: Desc)])
  @@index([accountId, source, createdAt(sort: Desc)])
  @@map("hr_bonus_fine_log")
}

model HrBonusFineRule {
  id          String   @id @default(uuid()) @db.Uuid
  accountId   String   @map("account_id") @db.Uuid
  name        String   @db.VarChar(255)
  kind        String                                                // bonus | fine
  amountMinor BigInt   @map("amount_minor")
  condition   Json                                                  // {type: "checkbox" | "rule", config: {...}}
  isActive    Boolean  @default(true) @map("is_active")
  createdAt   DateTime @default(now()) @map("created_at") @db.Timestamptz()

  account Account          @relation(fields: [accountId], references: [id], onDelete: Cascade)
  logs    HrBonusFineLog[]

  @@map("hr_bonus_fine_rule")
}

model HrSalaryConfig {
  // Account-level singleton (Account.id bilan 1:1)
  id                 String  @id @default(uuid()) @db.Uuid
  accountId          String  @unique @map("account_id") @db.Uuid
  fixWeight          Decimal @default("0.7") @map("fix_weight") @db.Decimal(3, 2)
  kpiWeight          Decimal @default("0.2") @map("kpi_weight") @db.Decimal(3, 2)
  bonusWeight        Decimal @default("0.1") @map("bonus_weight") @db.Decimal(3, 2)
  monthlySalesTarget BigInt  @map("monthly_sales_target")           // minor units
  monthlyKpiBudget   BigInt  @map("monthly_kpi_budget")             // minor units
  commissionPercent  Decimal @default("1.5") @map("commission_percent") @db.Decimal(5, 2)
  kpiTiers           Json    @map("kpi_tiers")                      // [{min: 50, payout: 20}, {min: 75, payout: 50}, ...]
  updatedAt          DateTime @updatedAt @map("updated_at") @db.Timestamptz()

  account Account @relation(fields: [accountId], references: [id], onDelete: Cascade)

  @@map("hr_salary_config")
}

model HrKpiDailyLog {
  id                String   @id @default(uuid()) @db.Uuid
  accountId         String   @map("account_id") @db.Uuid
  employeeId        String   @map("employee_id") @db.Uuid
  date              DateTime @db.Date
  personalSalesMinor BigInt  @map("personal_sales_minor")
  targetMinor       BigInt   @map("target_minor")
  achievementPercent Decimal @map("achievement_percent") @db.Decimal(6, 2)
  createdAt         DateTime @default(now()) @map("created_at") @db.Timestamptz()

  account  Account  @relation(fields: [accountId], references: [id], onDelete: Cascade)
  employee Employee @relation(fields: [employeeId], references: [id])

  @@unique([accountId, employeeId, date])
  @@index([accountId, date(sort: Desc)])
  @@map("hr_kpi_daily_log")
}

model HrKpiMonthlyScore {
  id                 String   @id @default(uuid()) @db.Uuid
  accountId          String   @map("account_id") @db.Uuid
  employeeId         String   @map("employee_id") @db.Uuid
  yearMonth          String   @map("year_month") @db.VarChar(7)     // "2026-05"
  totalSalesMinor    BigInt   @map("total_sales_minor")
  targetMinor        BigInt   @map("target_minor")
  achievementPercent Decimal  @map("achievement_percent") @db.Decimal(6, 2)
  tierPayoutPercent  Decimal  @map("tier_payout_percent") @db.Decimal(6, 2)
  kpiEarnedMinor     BigInt   @map("kpi_earned_minor")
  fixComponentMinor  BigInt   @map("fix_component_minor")
  bonusSumMinor      BigInt   @map("bonus_sum_minor")
  fineSumMinor       BigInt   @map("fine_sum_minor")
  commissionMinor    BigInt   @map("commission_minor")
  finalSalaryMinor   BigInt   @map("final_salary_minor")
  computedAt         DateTime @default(now()) @map("computed_at") @db.Timestamptz()

  account  Account  @relation(fields: [accountId], references: [id], onDelete: Cascade)
  employee Employee @relation(fields: [employeeId], references: [id])

  @@unique([accountId, employeeId, yearMonth])
  @@index([accountId, yearMonth])
  @@map("hr_kpi_monthly_score")
}

model HrEmployeePermission {
  id            String  @id @default(uuid()) @db.Uuid
  accountId     String  @map("account_id") @db.Uuid
  employeeId    String  @map("employee_id") @db.Uuid
  pageKey       String  @map("page_key") @db.VarChar(50)            // dashboard|messages|reports|employees|tasks|oylik|activity|settings
  section       String? @db.VarChar(50)                              // messages:demand|messages:order|...
  accessLevel   String  @default("read") @map("access_level")        // full|read|own_only

  account  Account  @relation(fields: [accountId], references: [id], onDelete: Cascade)
  employee Employee @relation(fields: [employeeId], references: [id], onDelete: Cascade)

  @@unique([accountId, employeeId, pageKey, section])
  @@map("hr_employee_permission")
}

model HrRole {
  id        String  @id @default(uuid()) @db.Uuid
  accountId String  @map("account_id") @db.Uuid
  value     String  @db.VarChar(50)                                  // "admin", "cashier", "warehouse", "staff", "custom_X"
  label     String  @db.VarChar(100)                                 // "Administrator", "Kassir", ...
  isDefault Boolean @default(false) @map("is_default")

  account Account @relation(fields: [accountId], references: [id], onDelete: Cascade)

  @@unique([accountId, value])
  @@map("hr_role")
}

model HrNotificationTemplate {
  id             String  @id @default(uuid()) @db.Uuid
  accountId      String  @map("account_id") @db.Uuid
  docType        String  @map("doc_type") @db.VarChar(50)            // demand|payment_in|customer_order|supply|sales_return
  eventType      String  @map("event_type") @db.VarChar(50)          // posted|created|...
  templateText   String  @map("template_text")                       // Jinja-like: "Hurmatli {{ counterparty.name }}, ..."
  isActive       Boolean @default(true) @map("is_active")
  largeSaleMinThreshold BigInt? @map("large_sale_min_threshold")

  account Account @relation(fields: [accountId], references: [id], onDelete: Cascade)

  @@unique([accountId, docType, eventType])
  @@map("hr_notification_template")
}

model HrActivityLog {
  // yangibolim'da har CRUD yoziladi (audit)
  id          String   @id @default(uuid()) @db.Uuid
  accountId   String   @map("account_id") @db.Uuid
  actorId     String?  @map("actor_id") @db.Uuid                    // null = system
  action      String                                                 // created | updated | deleted | bonus_added | fine_added | ...
  entityType  String   @map("entity_type") @db.VarChar(50)
  entityId    String?  @map("entity_id") @db.Uuid
  diff        Json?                                                  // {before: {...}, after: {...}}
  createdAt   DateTime @default(now()) @map("created_at") @db.Timestamptz()

  account Account   @relation(fields: [accountId], references: [id], onDelete: Cascade)
  actor   Employee? @relation("HrActivityActor", fields: [actorId], references: [id])

  @@index([accountId, createdAt(sort: Desc)])
  @@index([accountId, entityType, entityId, createdAt(sort: Desc)])
  @@map("hr_activity_log")
}
```

**Naming convention:**
- Postgres table: `hr_*` snake_case.
- Prisma model: `Hr*` PascalCase.
- Mavjud Employee/Task field'lar `hr_*` prefix bilan (`hr_template_id`, `hr_checker_id`, `is_checker`, `hr_roles`) — kelishmovchilik yo'q.
- BigInt minor units har pul field uchun (yangibolim Float'i — biz aniqlikni saqlaymiz).

---

## 4. AUTH / RBAC INTEGRATSIYASI

### Token va login flow

**Qaror:** yangibolim'ning base64 token'i AYNAN saqlanmaydi. Mavjud **JWT + argon2** ishlatiladi.

| Aspekt | Yangibolim manba | Maqsad (mavjud + kengaytma) |
|---|---|---|
| Token format | base64(JSON) | **JWT** signed (HS256, JWT_SECRET env) |
| Password hash | bcrypt | **argon2** (mavjud) |
| Login table | `User` (admin) → `Employee` fallback | `Employee` yagona — email yoki username bilan |
| JWT payload | — | `{sub, accountId, email, username, hrRoles[], isChecker, hrPermissions[]}` |
| Comma-separated rol | `"cashier,admin,warehouse"` | `Employee.hrRoles: String[]` |
| Effective admin | `"admin"` in comma list | `hrRoles.includes('admin')` |
| Refresh token | yo'q | Mavjud rotating refresh (HttpOnly cookie) |

### Permission tizimi

**Yangibolim per-sahifa model:**
- `dashboard | messages | reports | employees | tasks | oylik | activity | settings`
- Sub-section: `messages:demand | messages:order | messages:payment_in | messages:supply | messages:salesreturn`
- Access: `full | read | own_only`

**Backend enforcement:**

```ts
// hr/auth/require-hr-permission.decorator.ts
export const RequireHrPermission = (page: HrPageKey, access: HrAccessLevel, section?: string) =>
  SetMetadata('hr_permission', { page, access, section });

// hr/auth/hr-permission.guard.ts
@Injectable()
export class HrPermissionGuard implements CanActivate {
  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const required = this.reflector.get('hr_permission', ctx.getHandler());
    if (!required) return true;
    const user = ctx.switchToHttp().getRequest().user;
    if (user.hrRoles.includes('admin')) return true;       // admin bypass
    const perm = user.hrPermissions.find(p =>
      p.pageKey === required.page &&
      (required.section ? p.section === required.section : !p.section)
    );
    if (!perm) throw new ForbiddenException(`HR permission required: ${required.page}`);
    return hasAccess(perm.accessLevel, required.access);
  }
}

function hasAccess(have: 'full'|'read'|'own_only', need: 'full'|'read'|'own_only'): boolean {
  if (have === 'full') return true;
  if (have === 'read') return need === 'read' || need === 'own_only';
  if (have === 'own_only') return need === 'own_only';
  return false;
}
```

**`own_only` enforce:**
- Service-level: `where: { employeeId: user.sub }` qattiq filter.
- Cross-check: `HrTaskLog` qaytarishda employee_id == user.sub bo'lmasa 404.

### Migration default

```ts
// scripts/seed-hr-defaults.ts
await prisma.$transaction(async (tx) => {
  // 1. Each account: admin owner uchun hrRoles = ['admin'], isChecker = true
  await tx.employee.updateMany({
    where: { roles: { has: 'OWNER' } },
    data: { hrRoles: ['admin'], isChecker: true },
  });

  // 2. Default 4 HrRole har account uchun (admin/cashier/warehouse/staff)
  for (const account of await tx.account.findMany()) {
    await tx.hrRole.createMany({
      data: [
        { accountId: account.id, value: 'admin', label: 'Administrator', isDefault: true },
        { accountId: account.id, value: 'cashier', label: 'Kassir', isDefault: true },
        { accountId: account.id, value: 'warehouse', label: 'Omborchi', isDefault: true },
        { accountId: account.id, value: 'staff', label: 'Xodim', isDefault: true },
      ],
      skipDuplicates: true,
    });

    // 3. Default HrSalaryConfig (yangibolim'dagi typical config)
    await tx.hrSalaryConfig.upsert({
      where: { accountId: account.id },
      create: {
        accountId: account.id,
        monthlySalesTarget: BigInt(20_000_000_00),  // 20M UZS in tiyin
        monthlyKpiBudget:   BigInt(2_000_000_00),
        kpiTiers: [
          { min: 50,  payout: 20 },
          { min: 75,  payout: 50 },
          { min: 100, payout: 100 },
          { min: 120, payout: 130 },
        ],
      },
      update: {},
    });

    // 4. Admin uchun barcha 8 HrEmployeePermission = 'full'
    const adminEmployees = await tx.employee.findMany({
      where: { accountId: account.id, hrRoles: { has: 'admin' } },
    });
    for (const emp of adminEmployees) {
      for (const page of ['dashboard','messages','reports','employees','tasks','oylik','activity','settings']) {
        await tx.hrEmployeePermission.upsert({
          where: { accountId_employeeId_pageKey_section: { accountId: account.id, employeeId: emp.id, pageKey: page, section: null } },
          create: { accountId: account.id, employeeId: emp.id, pageKey: page, accessLevel: 'full' },
          update: {},
        });
      }
    }
  }
});
```

---

## 5. INFRASTRUKTURA

### NPM dependency qo'shilishlar

```jsonc
// apps/api/package.json
"dependencies": {
  // mavjud...
  "telegram": "^2.26.0",              // gramjs MTProto (~2 MB)
  "input": "^1.0.1",                  // OTP prompt CLI (login setup uchun)
  "@nestjs/websockets": "^10.4.0",
  "@nestjs/platform-ws": "^10.4.0",
  "@nestjs/event-emitter": "^2.1.1",
  "ws": "^8.18.0"
}
```

`@nestjs/schedule` v6 — mavjud, cron + interval kerakli (APScheduler ekvivalenti).

### Domain event bus (MoySklad polling almashtirildi)

**Yangibolim:** Tashqi MoySklad REST API'sini har 30 soniyada poll qiladi.

**Bu loyihada:** Bu loyiha O'ZI moysklad — internal event hooks bilan real-time:

```ts
// apps/api/src/modules/demand/demand.service.ts (mavjud)
// BIR QATOR qo'shiladi post() oxirida:
await this.eventEmitter.emitAsync('hr.event.demand.posted', {
  accountId, demandId: demand.id, counterpartyId: demand.counterpartyId,
  totalMinor: demand.totalMinor, postedAt: demand.postedAt,
});
```

```ts
// apps/api/src/modules/hr/hr-telegram-bridge/listeners/demand.listener.ts (yangi)
@OnEvent('hr.event.demand.posted', { async: true, promisify: true })
async handleDemandPosted(payload: DemandPostedEvent) {
  const tpl = await this.tplService.findActive(payload.accountId, 'demand', 'posted');
  if (!tpl) return;
  const counterparty = await this.cpService.findWithTelegram(payload.counterpartyId);
  if (!counterparty?.telegramPhone) return;
  const text = renderTemplate(tpl.templateText, { counterparty, demand: payload });
  await this.outboxService.enqueue({
    accountId: payload.accountId,
    counterpartyId: counterparty.id,
    toPhone: counterparty.telegramPhone,
    messageText: text,
    sourceEventType: 'demand.posted',
    sourceDocId: payload.demandId,
  });
}
```

**5 ta domain event:**
- `hr.event.demand.posted` — Sotuv → chek + balans
- `hr.event.paymentIn.posted` — To'lov qabul qilindi → tasdiq
- `hr.event.customerOrder.created` — Yangi buyurtma → "qabul qilindi"
- `hr.event.supply.posted` — Tovar olish (yetkazib beruvchiga, ixtiyoriy)
- `hr.event.salesReturn.posted` — Qaytarish → eslatma

### Scheduler joblar

Mavjud `@nestjs/schedule` `SchedulerRegistry` bilan:

```ts
// hr/hr-scheduler/hr.scheduler.ts
@Injectable()
export class HrScheduler {
  @Cron('*/5 * * * * *')                          // 5s — yangibolim queue worker
  async telegramOutboxWorker() { /* outbox → MTProto worker */ }

  @Cron('*/30 * * * * *')                         // 30s — yangibolim 30s sync (event hooks bilan almashinadi, lekin orphan retry uchun saqlanadi)
  async outboxRetryRecover() { /* pending+retry status'dagilarni qayta tekshirish */ }

  @Cron('*/300 * * * * *')                        // 5min — yangibolim telegram health
  async telegramHealthCheck() { /* 2 akkaunt connection holatini tekshirish */ }

  @Cron('* * * * *')                              // 60s — yangibolim deadline checker
  async hrTaskDeadlineExpire() {
    // SELECT * FROM hr_task_log WHERE status='sent' AND sent_at + (deadline_minutes * 1m) < NOW()
    // → status='answered_no', auto-fine
  }

  @Cron('30 23 * * *', { timeZone: 'Asia/Tashkent' })  // 23:30 cron
  async kpiDailySnapshot() { /* har employee uchun bugungi sotuv aggregatsiyasi */ }
}

// Per-template scheduled job (dynamic):
@Injectable()
export class HrTemplateSchedulerService {
  async registerTemplate(tpl: HrTaskTemplate) {
    if (tpl.triggerType !== 'scheduled' || !tpl.isActive) return;
    const cronExpr = buildCronFromConfig(tpl.scheduleConfig);  // "0 9 * * 1-5"
    const job = new CronJob(cronExpr, () => this.sendService.dispatchTemplate(tpl.id), null, false, 'Asia/Tashkent');
    this.schedulerRegistry.addCronJob(`hr-template-${tpl.id}`, job);
    job.start();
  }

  async unregisterTemplate(templateId: string) {
    if (this.schedulerRegistry.doesExist('cron', `hr-template-${templateId}`)) {
      this.schedulerRegistry.deleteCronJob(`hr-template-${templateId}`);
    }
  }
}
```

### MTProto worker (gramjs)

```ts
// hr/hr-telegram-bridge/mtproto/mtproto-worker.service.ts
@Injectable()
export class MtprotoWorkerService {
  private clients = new Map<number, TelegramClient>();  // slot → client

  async onModuleInit() {
    const accounts = await this.acctRepo.findAllActive();
    for (const acct of accounts) {
      await this.connect(acct);
    }
  }

  async connect(acct: HrTelegramAccount) {
    const session = acct.sessionEncrypted
      ? new StringSession(decrypt(acct.sessionEncrypted))
      : new StringSession('');
    const client = new TelegramClient(session, acct.apiId, decrypt(acct.apiHashEncrypted), {
      connectionRetries: 5,
    });
    await client.connect();
    if (!await client.isUserAuthorized()) {
      // OTP flow (qo'lda — settings UI orqali)
      this.logger.warn(`Telegram slot ${acct.slot} requires OTP login`);
      return;
    }
    this.clients.set(acct.slot, client);
    await this.acctRepo.markConnected(acct.id);
  }

  async sendMessage(toPhone: string, text: string): Promise<{ slot: number, messageId: string }> {
    for (const slot of [1, 2]) {
      const client = this.clients.get(slot);
      if (!client) continue;
      const floodUntil = await this.sessionRepo.getFloodWait(slot);
      if (floodUntil && floodUntil > new Date()) continue;
      try {
        const entity = await this.resolveEntity(client, toPhone);
        const result = await client.sendMessage(entity, { message: text });
        return { slot, messageId: String(result.id) };
      } catch (e) {
        if (e.errorMessage === 'FLOOD_WAIT') {
          await this.sessionRepo.setFloodWait(slot, new Date(Date.now() + e.seconds * 1000));
          continue;  // boshqa slot ga o'tish
        }
        throw e;
      }
    }
    throw new Error('Both Telegram slots unavailable');
  }

  private async resolveEntity(client: TelegramClient, phone: string) {
    // entity cache via HrTelegramSession (yangibolim entity_cache.json ekvivalenti)
    const cached = await this.sessionRepo.getEntity(phone);
    if (cached) return cached;
    const entity = await client.getEntity(phone);
    await this.sessionRepo.setEntity(phone, serializeEntity(entity));
    return entity;
  }
}
```

**Session encryption:**
- `HR_SESSION_KEY` env (32 byte, base64 encoded — `crypto.randomBytes(32).toString('base64')`)
- AES-256-GCM (Node `crypto` module)
- Encrypted format: `iv:ciphertext:authTag` (hex)

### WebSocket gateway

```ts
// hr/hr-websocket/hr-sync.gateway.ts
@WebSocketGateway({ path: '/ws/hr/sync', cors: true })
export class HrSyncGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server: Server;

  async handleConnection(client: WebSocket, req: IncomingMessage) {
    const token = extractJwtFromCookieOrQuery(req);
    const user = await this.authService.verifyJwt(token);
    if (!user || !user.hrRoles.includes('admin')) {
      client.close(4401, 'unauthorized');
      return;
    }
    // ulanish saqlanadi
  }

  // Telegram worker pushlari:
  emitSyncStatus(payload: { isRunning: boolean, lastSync: Date, messagesSentToday: number }) {
    this.server.clients.forEach(c => c.send(JSON.stringify({ event: 'sync_status', payload })));
  }
}

// hr/hr-websocket/hr-tasks.gateway.ts
@WebSocketGateway({ path: '/ws/hr/tasks/:employeeId' })
// new_task, task_answered, pending_review, task_reviewed event'lar push
```

### Encryption helper

```ts
// hr/hr-shared/crypto.util.ts
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const ALGO = 'aes-256-gcm';
const KEY = Buffer.from(process.env.HR_SESSION_KEY!, 'base64');  // 32 bytes

export function encrypt(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGO, KEY, iv);
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${enc.toString('hex')}:${tag.toString('hex')}`;
}

export function decrypt(ciphertext: string): string {
  const [ivHex, encHex, tagHex] = ciphertext.split(':');
  const decipher = createDecipheriv(ALGO, KEY, Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
  return Buffer.concat([decipher.update(Buffer.from(encHex, 'hex')), decipher.final()]).toString('utf8');
}
```

---

## 6. MIGRATION STRATEGY

### Principle

**Additive only, zero data loss, rollback-safe.** Mavjud production data buzilmaydi.

### Migration tartibi (P0 sprint ichida bitta migration)

```
prisma/migrations/2026MMDD_hr_module_foundation/migration.sql
```

**Bo'limlar:**

1. **Employee additive kengaytma** — 7 ta nullable/default column + unique index
2. **Task discriminator + HR field** — `TaskKind` enum + 7 ta nullable column
3. **16 ta yangi HR table** — to'liq schema (yuqorida § 3 da)
4. **Indekslar** (yuqorida har model uchun aniq)
5. **RLS policy** — har yangi `hr_*` table'da `account_id = current_setting('app.account_id')::uuid`

### Seed

`scripts/seed-hr-defaults.ts` (§ 4 da yuqorida) — per-account default rollar, salary config, admin permissions.

### Rollback strategiyasi

- Prisma migration standart yondashuvi: `prisma migrate resolve --rolled-back`.
- Manual rollback: `_rollback.sql` qo'lda yoziladi (`DROP TABLE hr_*`, `ALTER TABLE Employee DROP COLUMN hr_*`).
- HR tablelar `DROP CASCADE` (qaytariladi).
- Employee/Task field'lar `DROP COLUMN` (data yo'qoladi, lekin nullable → moysklad parity buzilmaydi).

### Production deploy

1. Migration **off-hours** ishga tushiriladi.
2. Smoke test: `pnpm seed:hr-defaults` → `curl /api/hr/dashboard` 200 OK qaytaradimi.
3. Rollback plan documented before deploy.

---

## 7. TESTING + ADVERSARIAL QA STRATEGIYASI

### Per-sprint umumiy gate (sprint OXIRIDA bitta)

| Gate | Komanda | Pass kriteriya |
|---|---|---|
| Typecheck | `pnpm --filter @moysklad/api typecheck` | 0 xato |
| Typecheck web | `pnpm --filter @moysklad/web typecheck` | 0 xato |
| Lint | `pnpm --filter @moysklad/api lint` va `pnpm --filter @moysklad/web lint` | 0 xato, 0 warning |
| Unit test | `pnpm --filter @moysklad/api test` | mavjud N + yangi M yashil |
| Build | `pnpm --filter @moysklad/api build` | OK |
| Prisma | `pnpm prisma validate` va `pnpm prisma migrate status` | OK |

**Sprint ichida sub-task'lar uchun alohida gate yo'q** — foydalanuvchi feedback 2026-05-20: *"har qisqa ishdan keyin tekshiruv kerak emas — umumiy katta bo'limda 1 ta tekshiruv kerak"*.

### Per-sprint test minimumu

| Sprint | Unit tests | Integration tests | E2E (Playwright) |
|---|---|---|---|
| P0 | — | migration up | — |
| P1 | Employee permission guard (10+ case), JWT enrich payload | login → JWT → /hr/dashboard 200 | login.spec.ts |
| P2 | Attendance FSM (check-in dup, check-out before check-in, TZ boundary) | TZ +05 midnight | attendance.spec.ts |
| P3 | TaskTemplate Zod validation (16 input), 4-ko'z FSM (sent→pending_review→approved/rejected, deadline auto-fine), scheduler dynamic add/remove | template send → log create, scheduled cron fires | tasks-create-send-answer-review.spec.ts |
| P4 | Notification template render (5 doc type), outbox retry backoff, flood handling, encryption round-trip | gramjs 2-akkaunt failover (mock), domain event listener fires | telegram-mtproto-mock.spec.ts |
| P5 | Salary formula (achievement→tier→payout edge cases: 0%, 49%, 50%, 119%, 121%), 5 bonus/fine manba, KPI cron snapshot | end-of-month aggregation | payroll-detail-modal.spec.ts |
| P6 | Dashboard summary aggregation, period selector | realtime WS event | dashboard-live.spec.ts |

### Adversarial QA (har sprint oxirida MAJBURIY)

CLAUDE.md 2-asosiy qoida bo'yicha — *"yashil ≠ ready"*. Har sprint uchun savollar:

1. **Concurrency:**
   - 2 admin bir vaqtda bir vazifa template'ni edit qilsa? `updated_at` optimistic lock kerakmi?
   - 2 xodim bir vazifaga bir vaqtda javob bersa? `SELECT ... FOR UPDATE` kerakmi?
   - 2 ta tekshiruvchi (admin va checker) bir vazifani bir vaqtda approve qilsa? FSM idempotent mi?
   - MTProto worker 2-akkaunt: parallel send → flood detect → boshqa slot ga o'tish ishlaydimi yoki ikkala slot ham flood bo'ladimi?

2. **Timeout / network:**
   - MTProto disconnect mid-send → outbox status to'g'rimi (sent vs pending vs failed)?
   - Flood wait → worker pause vs retry loop (infinite?)?
   - gramjs reconnect avtomat ishlaydimi yoki manual restart kerakmi?
   - WebSocket client uzilsa → reconnect (3s) ishlaydimi?

3. **Data integrity:**
   - Bonus/fine BigInt (tiyin) ishlatiladimi (Float emas) — KPI matematikasi aniq.
   - KPI achievement % yaxlitlash: `Math.floor` vs `Math.round` — qaror yozilsin, edge cases (49.99% → 49% tier, 50.00% → 50% tier).
   - Currency mix: agar employee.salaryCurrency != UZS — qanday ko'rsatadi (xato yoki conversion)?
   - Salary final = `base + fix + kpi + bonus − fine + commission` — barcha BigInt, hech qanday narsa Number'ga aylantirilmaydi.

4. **Input edges:**
   - Username: unicode (Cyrl+Latin), bo'sh string, "0", whitespace, max 50 char.
   - telegram_phone format: +998901234567 / 998901234567 / 8901234567 — qaysi to'g'ri? Normalize qilinadi?
   - deadline_minutes: 0 / negative / 525600 (1 yil) / 1e9 (overflow).
   - bonus 0 yoki manfiy (admin kiritsa).
   - Cron expr noto'g'ri (TemplateModal'da time = "25:99") — Zod validation.

5. **Authorization edges:**
   - Admin impersonate ichida HR-only endpoint — JWT'da `impersonating_admin_id` bo'lsa?
   - Xodim boshqa xodimning task_log'ini ko'ra oladimi (`own_only` enforce)?
   - Tekshiruvchi o'z task'ini approve qila oladimi (anti-self-approval: `checker_id != employee_id`)?
   - Bir tekshiruvchi boshqa qaror bergan vazifani approve qilolmaydimi (race condition)?

6. **UX edges:**
   - "Xato" generic xabar yo'q — Telegram disconnect → "Telegram akkaunt 1 ulanmagan, akkaunt 2 ga o'tilmoqda" aniq.
   - Scheduler down → admin notification (sentry alert + telegram bot).
   - Outbox 1000+ pending bo'lsa → admin dashboard'da warning badge.
   - 30 daqiqa avval scheduled job ishga tushmagan bo'lsa → catch-up va admin notify.

### Real data smoke test (P3, P4, P5 oxirida MAJBURIY)

- **P3:** 1 ta scheduled template yarat → 60 soniya kut → log avto-yaratiladimi → xodim javob bersa pending_review'ga o'tadimi.
- **P4:** Real Telegram akkaunt bilan login (OTP yangibolim'ning manba akkauntini ishlatish mumkin yoki yangi test akkaunt) → 1 ta Demand post qil → kontragent telegram'iga real xabar keladimi.
- **P5:** 1 oy simulatsiya — 30 ta Demand + 5 ta task reward + 3 ta task fine → oylik to'g'ri hisoblanadimi (Excel'da qo'lda matematik tekshirish).

### Sprint DONE kriteriyalar

Sprint **DONE** deyish uchun:
- ✅ Per-sprint umumiy gate (typecheck+lint+test+build+prisma)
- ✅ Adversarial QA savollarining barchasi tekshirilgan (yoki "n/a" deb belgilangan)
- ✅ Real data smoke test (P3+P4+P5 uchun)
- ✅ Conventional Commits (`feat(hr-tasks): ...`) + Husky pre-commit + commit-msg hooks pass
- ✅ Git identity: `Ozodbek <ozodbekmirgasimov@gmail.com>` (env: GIT_AUTHOR_*, GIT_COMMITTER_*)
- ✅ i18n keys (uz/ru) qo'shilgan
- ✅ Memory snapshot (`project-state.md`) sprint oxirida yangilanadi

Sprint *PARTIAL* bo'lsa — halol aytaman: *"Happy path ishlaydi, adversarial QA chala — production deploy uchun yana shu narsalar kerak."*

---

## 8. NUANSLAR VA EDGE CASES

### Yangibolim chala feature'lar — biz to'liq quramiz

Bu joylar yangibolim spec'da yozilgan, lekin haqiqiy kodda chala/yo'q (subagent 2026-05-20 audit'i). Bizning sprintlar bularni **birinchi marotaba to'liq amalga oshiradi**:

| Feature | Yangibolim kod holati | Bizning sprint | To'liq qurish strategiyasi |
|---|---|---|---|
| Bonus/fine 5 source | 2 ta implement (`manual` + `rule`). `auto_task_reward`, `auto_task_fine`, `auto_expire_fine` **YO'Q** | P5 | HrTaskLog FSM finalize callback → HrBonusFineLog insert; deadline expire job → auto_expire_fine |
| KPI commission component | Formula'da nomi bor, **calc method YO'Q** | P5 | `commissionMinor = totalSalesMinor * commissionPercent / 100` (BigInt math) |
| Task deadline auto-expire | 60s job spec'da, **code YO'Q** | P3 | `@Cron('* * * * *')` — pending vazifalar deadline o'tganlarni `status='answered_no'` + auto_expire_fine |
| Task depends_on chain | Field saqlanadi, **trigger logic YO'Q** | P3 | HrTaskLog FSM finalize → `findMany({ dependsOnId: this.templateId })` → dispatch |
| KPI cron 23:30 scheduler register | Method bor, **registration YO'Q** | P5 | `@Cron('30 23 * * *', { timeZone: 'Asia/Tashkent' })` |
| WebSocket auth | **YO'Q (anonymous)** | P3 (tasks) + P6 (sync) | JWT handshake validation, unauthorized → close(4401) |
| Backend permission enforcement | **YO'Q decorator/guard** (faqat frontend) | P1 (har sprint endpoint'larida) | `@RequireHrPermission(page, access, section?)` har HR endpoint'da |
| Notification template engine | Text engine YO'Q, faqat metadata matching | P4 | Eta template engine + 5 ta default seed |
| Processed-set restart-safety | In-memory Set (restart → state lost) | P4 (domain events bilan kerakmas) | Domain events real-time, processed-set kerakmas |

### Yangibolim spec'da yozilgan, biz qabul qilamiz (1:1 ko'chirish)

| Decision | Manba | Bizning amalga oshirish |
|---|---|---|
| `kpi.py` da `moysklad_service.request` BUG | yangibolim 00-MASTER §7 | Bu loyihada `_` prefiks private API yo'q — domain event hook orqali ishlaydi, bug avtomat g'oyib bo'ladi |
| TZ aralashish (UTC + lokal mix) | yangibolim 01 §13, 02 §13, 04 §7 | Har joyda `db.Timestamptz()` + service `Asia/Tashkent` conversion. O'zbekistonda DST yo'q — boundary test midnight. |
| Float pul vs Decimal | yangibolim 00-MASTER §7 | BigInt minor units (mavjud `@moysklad/money`) — KPI, oylik, bonus/fine matematikasi aniq |
| Username uniqueness scope | yangibolim noaniq | `(account_id, username)` unique (multi-tenant) |
| Comma-separated rol | yangibolim string | Postgres `String[]` (`hr_roles: text[]`) |
| Permission sub-section semantika | yangibolim aralash | `section` field alohida + `accessLevel` enum alohida |
| Dual storage confusion (AppSettings DB + JSON files) | yangibolim'da chaos | Bizda DB-only (HrSalaryConfig, HrRole, HrNotificationTemplate alohida table) |

### Validation source (audit log)

Subagent audit'i (2026-05-20, claude opus-4-7) yangibolim haqiqiy kodini o'rganib chiqdi:
- `backend/app/routers/auth.py` (login flow + permission)
- `backend/app/models/employee.py`, `task.py`, `bonus_fine.py`, `kpi.py`, `attendance.py`, `message_log.py`, `settings.py`
- `backend/app/services/sync_service.py`, `kpi_service.py`, `task_service.py`, `telegram_service.py`, `queue_worker.py`
- `frontend/src/store/authStore.js`, `services/api.js`
- `backend/app/config.py` (env vars)

13 ta farq (8 critical bug/missing + 5 design difference) aniqlandi va yuqorida jadval'da. Bu spec **yangibolim'dan yaxshi** — chunki spec'da to'liq amalga oshirilishi shart, yangibolim'da esa chala.

### Decimal scale qoidalar

- `kpi_weight`, `fix_weight`, `bonus_weight`: Decimal(3,2) — `0.70`, `0.20`, `0.10`. Sum = 1.00.
- `achievement_percent`, `tier_payout_percent`: Decimal(6,2) — 0.00 dan 9999.99 gacha.
- `commission_percent`: Decimal(5,2) — 0.00 dan 999.99 gacha.
- Pul: BigInt tiyin (UZS minor units). Hech qanday Float.

### KPI tier lookup qoidasi (aniq)

```ts
// hr/hr-kpi/tier-lookup.util.ts
function lookupTierPayout(achievement: Decimal, tiers: KpiTier[]): Decimal {
  const sorted = [...tiers].sort((a, b) => Number(b.min) - Number(a.min)); // desc
  for (const t of sorted) {
    if (achievement.gte(t.min)) return new Decimal(t.payout);
  }
  return new Decimal(0); // hech bir tier ga yetmadi
}
```

Edge cases:
- achievement = 0% → 0% payout
- achievement = 49.99% → 0% (50% tier'ga yetmadi)
- achievement = 50.00% → 20% payout
- achievement = 1000% → 130% payout (top tier — cap'lanmaydi, yangibolim ham shunday)

### Bonus/fine 5 manba (aniq)

| source | trigger | amount | actor |
|---|---|---|---|
| `manual` | Admin OylikPage'dan qo'lda | admin kiritadi | `created_by_id = admin` |
| `rule` | HrBonusFineRule checkbox tanlandi | rule.amountMinor | `created_by_id = admin`, `rule_id` |
| `auto_task_reward` | Vazifa bajarildi (yes/text, checker yo'q YOKI approve) | template.rewardMinor | `created_by_id = null` (system) |
| `auto_task_fine` | Vazifa "Yo'q" javob | template.fineMinor | `created_by_id = null` |
| `auto_expire_fine` | Deadline o'tdi javobsiz (60s job) | template.fineMinor | `created_by_id = null` |

Hammasi `HrBonusFineLog` ga insert, OylikPage detail modal'da kun bo'yicha guruh.

### MoySklad agent linking

- Yangibolim'da: `GET /api/employees/moysklad-agents` → MoySklad REST'dan har xodim list.
- Bu loyihada: o'zining Employee'lari (boshqa moysklad emas) → endpoint `/api/hr/employees/moysklad-agents` → `prisma.employee.findMany({ where: { accountId, hrRoles: { isEmpty: false } } })`.
- `Employee.moyskladAgentId` — bu yangibolim ekvivalentligi uchun saqlanadi (foreign Employee ID). Bu loyihada **`Employee.id` o'zi** ishlatiladi (link.id = employee.id).

### Notification template engine

5 ta default template (P4 oxirida seed):
```
demand.posted:    "Hurmatli {{counterparty.name}}, sizga {{demand.totalFormatted}} so'mlik tovar berildi. Yangi qarz: {{balance.formatted}}. {{demand.linkUrl}}"
paymentIn.posted: "Hurmatli {{counterparty.name}}, sizdan {{payment.sumFormatted}} so'm to'lov qabul qilindi. Yangi balans: {{balance.formatted}}."
customerOrder.created: "Hurmatli {{counterparty.name}}, buyurtmangiz qabul qilindi: №{{order.number}}, summa {{order.totalFormatted}}."
supply.posted:    "Yetkazib beruvchi {{counterparty.name}}: {{supply.totalFormatted}} so'mlik tovar qabul qilindi."
salesReturn.posted: "Hurmatli {{counterparty.name}}, qaytarish qabul qilindi: {{returnDoc.totalFormatted}}."
```

Render: Handlebars yoki [Eta](https://eta.js.org/) (light, ~10 KB). Tavsiya: **Eta** — Mavjud paketlar bilan kelishmovchilik kichik.

### Dependency chain (vazifa zanjiri)

`HrTaskTemplate.dependsOnId` — `auto_send` mode: oldingi vazifa `answered_yes` bo'lsagina keyingisi avtomat yuboriladi.

```ts
// hr/hr-task-send/dispatch.service.ts
async onTaskLogFinalized(taskLogId: string, status: string) {
  if (status !== 'answered_yes' && status !== 'answered_text') return;
  const log = await this.logRepo.findOne(taskLogId);
  // Topish: bu template ga depends_on qilingan keyingi template'lar
  const dependents = await this.tplRepo.findMany({ where: { dependsOnId: log.templateId, isActive: true } });
  for (const dep of dependents) {
    await this.dispatchTemplate(dep.id, log.employeeId);  // bir xil xodimga
  }
}
```

### TZ-safe Asia/Tashkent helpers

```ts
// hr/hr-shared/tz.util.ts
const TZ = 'Asia/Tashkent';

export function toLocalIso(d: Date | null): string | null {
  if (!d) return null;
  return formatInTimeZone(d, TZ, "yyyy-MM-dd'T'HH:mm:ssXXX");  // "+05:00"
}

export function startOfLocalDay(d: Date): Date {
  return zonedTimeToUtc(formatInTimeZone(d, TZ, 'yyyy-MM-dd 00:00:00'), TZ);
}
```

Library: `date-fns-tz` (qo'shamiz) — `~50 KB`.

---

## 9. APPENDIX: SOURCE REFERENCES

| Topic | Source file (yangibolim) |
|---|---|
| Full system overview | `yangibolim/SYSTEM_OVERVIEW.md` (74 KB, 14 page details) |
| Business rules booklet | `yangibolim/BIZNES_QOLLANMA.md` (43 KB) |
| Master strategy + 1:1 rules | `yangibolim/spec/00-MASTER.md` (11 KB) |
| Backend core (auth, employees, attendance, tasks) | `yangibolim/spec/01-backend-core-domain.md` (75 KB) |
| Integration + finance (MoySklad, telegram, KPI) | `yangibolim/spec/02-backend-integration-finance.md` (65 KB) |
| Frontend operational (tasks, review, dashboard) | `yangibolim/spec/03-frontend-operational.md` (70 KB) |
| Frontend finance/config/shell (Oylik 6-tab) | `yangibolim/spec/04-frontend-finance-config-shell.md` (70 KB) |

---

## 10. SUCCESS CRITERIA (master, sprint-aggregated)

Master deliverable **DONE** bo'lishi uchun (P0+P1+...+P6 hammasi):

- [ ] 14 ta yangibolim sahifa moysklad-clone'da 1:1 mantiqiy parity bilan ishlaydi
- [ ] 5 ta domain event hook (Demand, PaymentIn, CustomerOrder, Supply, SalesReturn) → MTProto Telegram bridge
- [ ] 2 MTProto akkaunt failover + DB-encrypted session
- [ ] APScheduler ekvivalent (queue 5s, deadline 60s, KPI 23:30, health 5min, per-template cron)
- [ ] 4-ko'z review FSM aynan (sent → pending_review → approved/rejected, deadline auto-fine)
- [ ] 5 manba bonus/fine ledger
- [ ] KPI tier formula aynan (achievement → payout → final salary)
- [ ] WebSocket realtime (sync status + tasks per employee)
- [ ] Per-page RBAC (full/read/own_only) qattiq enforce
- [ ] i18n uz/ru har sahifa
- [ ] Adversarial QA 6 ta savol guruhi har sprint uchun tekshirilgan
- [ ] Real data smoke test P3, P4, P5 da yashil
- [ ] Mavjud 137+ test buzilmagan, yangi 100+ test qo'shilgan
- [ ] HR menyu "Yechimlar"dan keyin, 10 ta sub-nav: Bosh sahifa, Xodimlar, Davomat, Vazifalar, Tekshiruv, Mening vazifalarim, Oylik, Xabarlar, Hisobotlar, Sozlamalar

---

**Spec status:** Draft v1 yozildi (2026-05-20).

**Keyingi qadam:** foydalanuvchi spec'ni o'qib chiqsin, kerak bo'lsa o'zgartirishlar talab qilsin. So'ng `superpowers:writing-plans` skill chaqirilib **P0 sprint plan** (birinchi sprint detail markdown) tuziladi.
