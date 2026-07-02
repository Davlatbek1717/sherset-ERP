# MASTER — MoySklad↔Telegram Tizimini 1:1 Qayta Qurish

> **Bu hujjat nima uchun:** Mavjud ishlaydigan tizim (`D:\projects-desktop\projects\moysklad`, Python FastAPI + React) ni boshqa loyihaga (`D:\projects\moysklad` = `moysklad-clone`, TypeScript pnpm monorepo) **bir bo'lim/modul sifatida, AYNAN 1:1 ishlaydigan** qilib qayta qurish uchun to'liq funksional spetsifikatsiya.
>
> **Foydalanish usuli:** Bu papkadagi (`docs/spec/`) 5 ta faylni boshqa Claude/agentga **one-shot prompt** sifatida berib, modulni 1:1 qurdirish. Hech qanday "taxminan", "soddaroq", "keyinroq" yo'q — har formula, status, interval AYNAN.

---

## 1. SPEC FAYLLARI — O'QISH TARTIBI

Quyidagi tartibda o'qing va shu tartibda quring:

| # | Fayl | Mazmun | Hajm |
|---|---|---|---|
| 00 | `00-MASTER.md` | **Shu fayl** — umumiy strategiya, 1:1 kritik qoidalar, qurish tartibi | — |
| 01 | `01-backend-core-domain.md` | Auth, Employees, Attendance, **Task (yadro)**, task_service, bonus/fine, activity, kassa, admin_notifier, ws_manager, scheduler joblari, vazifa hayot davri | ~73 KB |
| 02 | `02-backend-integration-finance.md` | Lifespan, MoySklad REST client, **Sync polling**, queue worker, telegram service (2 akkaunt), notification template, **KPI/oylik formulalari**, reports, settings | ~63 KB |
| 03 | `03-frontend-operational.md` | TasksPage (yadro UI), ReviewPage, MyTasksPage, AttendancePage, EmployeesPage, MessagesPage, DashboardPage — har tugma/modal/state/validatsiya | ~68 KB |
| 04 | `04-frontend-finance-config-shell.md` | Routing, store'lar, Layout/Sidebar/Header, Login, **dateUtils (timezone)**, **OylikPage (2945 qator, 6 tab)**, Settings, hujjat shablonlari, yashirin sahifalar | ~68 KB |

**Jami ~272 KB to'liq spetsifikatsiya.** Har faylda manba `file:line` ko'rsatilgan, formulalar matematik aniq, status mashina jadval bilan.

---

## 2. NIMA QURILMOQDA — UMUMIY MA'NO

Tizim **uchta katta vazifani** bajaradi:

1. **MoySklad → Telegram avtomat xabar:** Har savdo/to'lov/buyurtma/qaytarish/ko'chirishda mijozga Telegram'da chek, balans, izoh bilan avtomat xabar.
2. **Vazifa boshqaruvi (yadro):** Admin vazifa shabloni yaratadi → xodimga Telegram'da yuboriladi → xodim javob beradi → **tekshiruvchi (4-ko'z)** tasdiqlaydi/rad qiladi → bonus/jarima avtomat.
3. **Oylik + KPI + Davomat:** Asosiy oylik + sotuv ulushi (KPI tier) + bonus − jarima, har xodim uchun avtomat yig'iladi.

---

## 3. 1:1 KRITIK QOIDALAR — XATO QILMASLIK UCHUN

Bu qoidalarni buzish = tizim **boshqacha ishlaydi**. Har birini AYNAN takrorlang.

### 3.1 Vaqt zonasi (eng ko'p xato qilinadigan joy)

- Backend datetime'lari **server lokal vaqti** (Asia/Tashkent, UTC+5) sifatida saqlanadi — **UTC EMAS**, tz-naive.
- Ba'zi endpoint'lar `datetime.now(timezone.utc)` ishlatadi (`/tasks/logs/mine`, `/activity/stats`) — bu **nomuvofiqlik AYNAN saqlanishi kerak**, "tuzatish" filterni buzadi.
- API javobida datetime ISO formatda **`+05:00` offset bilan** chiqishi kerak (`_to_iso` helper) — frontend `dateUtils._parse` offset yo'q bo'lsa `+05:00` qo'shadi, keyin `Intl.DateTimeFormat('Asia/Tashkent')` bilan ko'rsatadi. Detallar: spec 04 §7.

### 3.2 Vazifa status mashina (4-ko'z)

```
sent ──(xodim "Ha"/"matn", checker_id BOR)──→ pending_review ──(approve)──→ answered_yes/answered_text
                                                              └──(reject)──→ answered_no
sent ──(xodim "Ha"/"matn", checker_id YO'Q)──→ answered_yes/answered_text   (bonus DARHOL)
sent ──(xodim "Yo'q")──────────────────────→ answered_no                   (jarima DARHOL, tekshiruvsiz)
sent ──(deadline o'tdi, 60s checker job)────→ answered_no                   (auto-fine)
```

**Qoida:** `checker_id` bor VA javob `answered_yes`/`answered_text` → `pending_review` (bonus YO'Q hali). `answered_no` har doim to'g'ridan finalize (tekshiruvsiz). Detallar: spec 01 §4.

### 3.3 Bonus/Jarima — 5 manba (aynan)

| Manba kaliti | Qachon | Summa |
|---|---|---|
| `manual` | Admin OylikPage'dan qo'lda | admin kiritadi |
| `rule` | Qoida checkbox tanlanganda | rule.amount |
| `auto_task_reward` | Vazifa bajarildi (yes/text, checker yo'q YOKI approve) | template.reward_amount |
| `auto_task_fine` | Vazifa "Yo'q" javob | template.fine_amount |
| `auto_expire_fine` | Deadline o'tdi javobsiz | template.fine_amount |

Telegram'da combined message (alohida emas, vazifa xabari ichida). Detallar: spec 01 §7.

### 3.4 KPI/oylik formulasi (matematik aniq)

`SalaryConfig`: `fix_weight`, `kpi_weight`, `bonus_weight`, `monthly_sales_target`, `monthly_kpi_budget`, `commission_percent`, `kpi_tiers` (JSON `[{min,payout}]`).

- Achievement % = personal_sales / monthly_sales_target × 100
- Tier lookup: achievement %'ga mos eng yuqori `min` → `payout` %
- KPI earned = monthly_kpi_budget × payout%
- Yakuniy: **base + fix komponent + kpi earned + bonus − fine + commission** (har komponent aniq formula: spec 02 §8)

### 3.5 Scheduler joblar (aniq interval)

| Job | Trigger | Detal |
|---|---|---|
| MoySklad sync | interval, `polling_interval` (default 30s) | spec 02 §3 |
| Queue worker | interval 5s | spec 02 §4 |
| Deadline checker | interval 60s | spec 01 §5 |
| KPI hisoblash | cron 23:30 | spec 02 §8 |
| Telegram health | interval 5 min | spec 01 §12 |
| Har vazifa shabloni (scheduled) | cron (HH:MM + kunlar/oy) | spec 01 §5 |

### 3.6 Queue retry backoff (aniq)

Exponential: urinishlar oralig'i va max attempts AYNAN spec 02 §4 da. "Topilmadi" → darhol `failed` (retry yo'q). Flood → worker pause + `pending` qaytariladi.

### 3.7 2 Telegram akkaunt

Slot 1 → fail → slot 2 failover. Flood `data/flood_wait.json` da persist. Entity cache `data/entity_cache.json`. Detallar: spec 02 §5.

### 3.8 Auth (JWT EMAS)

`base64(JSON{sub,role,employee_id,name})`. Login: avval `User` jadval (admin) → keyin `Employee.username` fallback. Comma-separated rol, `"admin"` ichida bo'lsa effective=admin. `is_checker`, `permissions[]` token bilan qaytadi. Detallar: spec 01 §1.

---

## 4. QURISH TARTIBI (BOG'LIQLIK BO'YICHA)

Quyidagi tartibni buzmang — har qadam oldingisiga tayanadi:

1. **Ma'lumotlar modeli** — barcha jadvallar (Employee, TaskTemplate, TaskLog, Attendance, BonusFineLog/Rule, MessageLog, MessageQueue, ActivityLog, SalaryConfig, KpiDailyLog/MonthlyScore, Counterparty, AppSettings, ...). Manba modellar: spec 01 + 02 da har model field'i bilan.
2. **Auth + permission** — login, token, EmployeePermission. (spec 01 §1)
3. **Settings infra** — DB settings + JSON settings ikkilik. (spec 02 §12)
4. **Employees CRUD** — xodim, rol, is_checker, MoySklad agent link. (spec 01 §2)
5. **Task yadro** — template CRUD, scheduler, send, answer, review, deadline, chain. (spec 01 §4–6)
6. **Bonus/fine + activity** — 5 manba, audit log. (spec 01 §7–8)
7. **MoySklad client + sync polling** — REST, polling, event trigger. (spec 02 §2–3)
8. **Notification + queue + telegram** — template, queue worker, 2 akkaunt. (spec 02 §4–6)
9. **KPI/oylik** — formulalar, cron, salary config. (spec 02 §8)
10. **Attendance** — check-in/out/edit, TZ. (spec 01 §3)
11. **Frontend shell** — routing, stores, layout, login, dateUtils. (spec 04 §1–7)
12. **Frontend operatsion** — Tasks, Review, MyTasks, Attendance, Employees, Messages, Dashboard. (spec 03)
13. **Frontend moliya/config** — Oylik (6 tab), Settings, Reports, hujjat shablonlari. (spec 04 §8–11)
14. **WebSocket** — `/ws` + `/ws/tasks/{employee_id}`, event xaritasi. (spec 03 §9)

---

## 5. TARGET STACK MOSLASH

Manba: Python FastAPI + SQLAlchemy + SQLite + React JSX.
Target (`moysklad-clone`): TypeScript pnpm monorepo (`apps/api`, `apps/web`, `packages/db` Prisma, `packages/workflows` FSM, ...).

**Moslash qoidalari:**

| Manba | Target ekvivalent |
|---|---|
| FastAPI router | `apps/api` controller/route |
| SQLAlchemy model | Prisma schema (`packages/db`) — field nomlari 1:1 saqlanadi |
| APScheduler job | target scheduler (cron/interval — aynan interval) |
| Telethon | target Telegram MTProto kutubxonasi (xulq 1:1) |
| Pydantic validatsiya | Zod schema (aynan qoidalar) |
| Vazifa FSM | `packages/workflows` FSM (status o'tishlari aynan) |
| React JSX sahifa | `apps/web` sahifa (funksional 1:1, piksel emas) |
| Zustand store | target state (xulq aynan) |
| `_to_iso` / `dateUtils` | aynan TZ mantiqi (Asia/Tashkent, +05:00) |

**O'zgartirmaslik kerak:** formulalar, interval qiymatlari, status o'tish shartlari, validatsiya qoidalari, bonus/fine manba mantiqi, KPI tier hisoblash, vazifa lifecycle. Bular biznes-mantiq — 1:1.

**Moslashtirish mumkin:** fayl tuzilishi (monorepo), til sintaksisi, ORM API, UI komponent kutubxonasi (lekin xulq aynan).

---

## 6. VERIFIKATSIYA CHECKLIST (qurilgandan keyin)

Modul 1:1 ekanini tasdiqlash uchun:

- [ ] Auth: admin login → token → `is_admin`, xodim login → `is_checker`/`permissions`
- [ ] Vazifa shabloni: 16 input, conditional (scheduled/event/large_sale), validatsiya
- [ ] Scheduled vazifa belgilangan vaqtda avtomat yuboriladi (cron aniq)
- [ ] Xodim "Ha" + checker yo'q → bonus DARHOL; checker bor → pending_review
- [ ] Tekshiruvchi approve → bonus, reject → fine, ikkalasida Telegram outcome
- [ ] Deadline 60s job: javobsiz vazifa → answered_no + auto-fine
- [ ] 5 bonus/fine manba to'g'ri yoziladi, OylikPage detail modal kun bo'yicha guruhlaydi
- [ ] KPI cron 23:30, tier formula achievement→payout aniq
- [ ] Oylik xulosa: base+fix+kpi+bonus−fine+commission aynan
- [ ] Sync polling `polling_interval`, processed-set duplicate filter, event trigger
- [ ] Queue worker 5s, retry backoff aniq, flood pause
- [ ] 2 telegram akkaunt failover, flood persist
- [ ] Davomat check-in/out/edit, vaqt Asia/Tashkent (5 soat siljimaydi)
- [ ] WebSocket: new_task/task_answered/pending_review/task_reviewed real-time
- [ ] dateUtils: tz-naive ISO → +05:00 → Asia/Tashkent ko'rsatish
- [ ] Activity log: har CRUD yoziladi
- [ ] Permission: per-sahifa full/read/own_only

---

## 7. MA'LUM BUG/NOZIKLIKLAR (subagentlar topdi — 1:1 da qaror qabul qiling)

- `kpi.py` da `moysklad_service.request` (public) chaqirilgan, lekin faqat `_request` mavjud → bu kod yo'li bug. 1:1 da: ya buggi takrorlang (xulq aynan), yoki **ataylab tuzating va izohlab qo'ying**. Tavsiya: tuzatib, spec'ga eslatma.
- Timezone nomuvofiqligi (ba'zi joy UTC, ko'pi lokal) — spec 01 §13, spec 02 §13, spec 04 §7 da batafsil. 1:1 uchun **aynan** takrorlang; keyin alohida "TZ-unify" refaktori sifatida hal qiling.
- Float pul (Decimal emas) — manba shunday. Target'da Decimal'ga o'tish mumkin, lekin yaxlitlash xulqi farq qilmasligi uchun test bilan tasdiqlang.

Batafsil noziklik ro'yxati: har spec faylning oxirgi bo'limi ("MUHIM XULOSALAR / NUANSLAR / EDGE CASE").

---

## 8. YAKUN

Bu 5 fayl (`00`–`04`) **butun tizimning funksional DNK'si**. Hech qanday qo'shimcha savol bermasdan, hech narsa "taxmin qilmasdan" 1:1 modul qurish uchun yetarli. Har formula, status, interval, validatsiya — kuzatilgan koddan olingan va manba `file:line` bilan tasdiqlangan.

**Tartib:** 00 (strategiya) → 01 (backend yadro) → 02 (integratsiya/moliya) → 03 (frontend operatsion) → 04 (frontend moliya/shell). Qurish §4 dagi 14 qadam bo'yicha.
