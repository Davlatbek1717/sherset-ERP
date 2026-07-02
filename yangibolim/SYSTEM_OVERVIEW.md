# MoySklad ↔ Telegram Integration Tizimi — To'liq Hujjat

> **Maqsad:** Bu hujjat butun loyihani **boshqa loyihaga modul sifatida qo'shish** uchun yo'l xaritasi. Har bir bo'lim, modal, tugma, input, klikda nima bo'lishi va bog'liqlik joylari nazariy tarzda yozilgan. **Kod yo'q** — faqat foydalanish va tushunish nuqtai nazaridan.

**Loyiha:** `D:\projects-desktop\projects\moysklad`
**Production URL:** https://moy.biznesjon.uz
**Stack:** FastAPI + SQLAlchemy async + SQLite | React 18 + Vite + Tailwind + Zustand
**Vaqt zonasi:** Asia/Tashkent (UTC+5)

---

## MUNDARIJA

1. [Loyiha umumiy ko'rinishi](#1-loyiha-umumiy-korinishi)
2. [Yuqori darajadagi arxitektura](#2-yuqori-darajadagi-arxitektura)
3. [Auth va Permission tizimi](#3-auth-va-permission-tizimi)
4. [Layout — Sidebar va Header](#4-layout--sidebar-va-header)
5. [Sahifalar](#5-sahifalar)
   - 5.1 [LoginPage](#51-loginpage)
   - 5.2 [DashboardPage](#52-dashboardpage)
   - 5.3 [MessagesPage (Xabarlar)](#53-messagespage-xabarlar)
   - 5.4 [ReportsPage (Hisobotlar)](#54-reportspage-hisobotlar)
   - 5.5 [EmployeesPage (Xodimlar)](#55-employeespage-xodimlar)
   - 5.6 [TasksPage (Vazifalar)](#56-taskspage-vazifalar)
   - 5.7 [ReviewPage (Tekshiruv)](#57-reviewpage-tekshiruv)
   - 5.8 [MyTasksPage (Mening Vazifalarim)](#58-mytaskspage-mening-vazifalarim)
   - 5.9 [AttendancePage (Davomat)](#59-attendancepage-davomat)
   - 5.10 [OylikPage (Oylik)](#510-oylikpage-oylik)
   - 5.11 [SettingsPage (Sozlamalar)](#511-settingspage-sozlamalar)
6. [Backend xizmatlari](#6-backend-xizmatlari)
7. [Real-time arxitektura — WebSocket](#7-real-time-arxitektura--websocket)
8. [Background jobs — APScheduler](#8-background-jobs--apscheduler)
9. [Telegram integratsiya — 2 akkaunt + flood handling](#9-telegram-integratsiya--2-akkaunt--flood-handling)
10. [MoySklad integratsiya](#10-moysklad-integratsiya)
11. [Avtomatlashtirilgan oqimlar (lifecycles)](#11-avtomatlashtirilgan-oqimlar-lifecycles)
12. [DB modellari va munosabatlar](#12-db-modellari-va-munosabatlar)
13. [Production deploy](#13-production-deploy)
14. [Boshqa loyihaga qo'shish — qadam-ba-qadam](#14-boshqa-loyihaga-qoshish--qadam-ba-qadam)

---

## 1. Loyiha umumiy ko'rinishi

### Maqsad

`moy.biznesjon.uz` — santexnika do'koni uchun ichki boshqaruv tizimi:

- **MoySklad ERP** dan real-time savdo/to'lov/buyurtma ma'lumotlarini olib, **Telegram** orqali kontragentlarga avtomatik xabar yuborish (chek, balans, izohlar bilan)
- **Xodimlar boshqaruvi** — rol, login, davomat, oylik, KPI
- **Vazifalar tizimi** — admin xodimlarga Telegram orqali topshiriq beradi, javob oladi, tekshiruvchi tasdiqlaydi, bonus/jarima avtomat hisoblanadi
- **Audit log** — har CRUD harakat yozib qo'yiladi

### Stack

**Backend:**
- Python 3.12, FastAPI, SQLAlchemy 2 (async)
- SQLite (`/var/www/moy/data/app.db`)
- Telethon (MTProto, 2 ta akkaunt)
- APScheduler (cron jobs, intervals)
- httpx (Bot API + MoySklad REST)
- Bcrypt (parol)
- WebSocket (real-time push)

**Frontend:**
- React 18, Vite, JSX
- Tailwind CSS, lucide-react ikonkalar, recharts grafiklar
- Zustand state management (persist middleware)
- Axios HTTP client
- React Router DOM
- React Hot Toast bildirishnomalari

**Deploy:**
- systemd service (`moysklad.service`) — uvicorn host'da, **Docker emas**
- Nginx static + proxy `/api` → 8001
- Bare git repo + post-receive hook (frontend build + backend restart avto)
- Certbot SSL avto-renew

### Ko'rsatkichlar

| O'lcham | Soni |
|---|---|
| Frontend sahifalar | 14 |
| Backend routerlar | 17 |
| Backend xizmatlar | 14 |
| DB modellar | 13+ |
| Backend testlar | 209 |
| Kod qatorlari (taxminan) | ~25 000 |

---

## 2. Yuqori darajadagi arxitektura

```
┌─────────────────────────────────────────────────────────────────┐
│                          BROWSER (React SPA)                      │
│                                                                   │
│  Login  → Dashboard  → Messages  → Tasks  → Review  → Oylik     │
│            ↑                                                      │
│            └─── Sidebar (rol asosida menyu) ─── Header (status) │
│                                                                   │
│  Zustand stores: authStore, syncStore, themeStore                │
│  WebSocket connections: /ws (sync), /ws/tasks/{employee_id}     │
└─────────────────────────────────────────────────────────────────┘
                              ↓ HTTP /api/* + WS
┌─────────────────────────────────────────────────────────────────┐
│                       NGINX (proxy + static)                      │
│                                                                   │
│  /         → /var/www/moy/frontend/dist (no-cache index.html)    │
│  /api/*    → 127.0.0.1:8001                                      │
│  /ws       → 127.0.0.1:8001 (WebSocket upgrade)                  │
│  Certbot SSL on moy.biznesjon.uz                                 │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│              FastAPI BACKEND (systemd: moysklad.service)         │
│                                                                   │
│  17 ROUTERS:    auth, employees, tasks, attendance, messages,    │
│                 reports, settings, telegram, moysklad,           │
│                 counterparties, salary, kpi, bonus_fine,         │
│                 activity, kassa, document_templates              │
│                                                                   │
│  14 SERVICES:   sync, telegram, task, queue_worker, kpi,         │
│                 admin_notifier, notification, moysklad,          │
│                 document_template, activity, ws_manager,         │
│                 db_settings, json_settings                       │
│                                                                   │
│  APScheduler:   sync_all (30s), KPI (23:30), queue (5s),         │
│                 deadline_check (60s), telegram_health (5min)     │
└─────────────────────────────────────────────────────────────────┘
        ↓                       ↓                       ↓
   ┌─────────┐         ┌──────────────┐        ┌──────────────┐
   │ SQLite  │         │  MoySklad     │        │  Telegram    │
   │  DB     │         │  REST API     │        │  MTProto     │
   │         │         │ (Bearer auth) │        │  (Telethon)  │
   │  + JSON │         └──────────────┘        │              │
   │ settings│         ┌──────────────┐        │  +Bot API    │
   │ +cache  │         │ Cloudflare    │        │ (httpx POST) │
   │ +session│         │ Workers proxy │        │              │
   └─────────┘         └──────────────┘        └──────────────┘
```

### Asosiy printsiplar

- **WAPPI pattern** (Write-And-Process-In-the-background): Xabar darhol DB queue'ga yoziladi, foydalanuvchiga 200 OK qaytadi. Worker har 5 soniyada queue'dan birta xabar oladi, yuboradi, retry yoki "failed" deb belgilaydi.
- **2 akkaunt failover:** Telegram MTProto akkaunt 1 da muammo bo'lsa, akkaunt 2 ga o'tib qaytadan urinadi.
- **Idempotent migration:** `ALTER TABLE ADD COLUMN` har startup'da try/except bilan ishlatiladi (column allaqachon bor bo'lsa, e'tiborsiz).
- **Optimistic UI:** Frontend state'ni darhol yangilaydi, keyin server'dan tasdiq oladi (qisqartirish-tugma kabilarda).
- **Time-zone safe:** Server lokal Asia/Tashkent (+05) ga sozlangan, frontend ham doim shu tz'da ko'rsatadi.

---

## 3. Auth va Permission tizimi

### Token formati

**JWT EMAS** — `base64(JSON.stringify({sub, role, employee_id, name}))`. Yengil, sodda, lekin signature yo'q (validation backend'da har endpoint'da emas, faqat login'da). Ish faoliyati uchun yetarli, productionga jiddiy bo'lsa JWT'ga o'tish tavsiya etiladi.

### Login oqimi

`POST /api/auth/login` body: `{username, password}`:

1. **Avval `User` jadvalida tekshiriladi** (admin foydalanuvchilar) — bcrypt parolini moslash. Mosligi bo'lsa: role="admin", employee_id=null
2. **Aks holda `Employee.username + hashed_password`** — xodim login qila olishi
   - Comma-separated rol (`"cashier,admin,warehouse"`) — agar `"admin"` ichida bo'lsa, effective role = "admin"
   - `EmployeePermission` jadvalidan permissions yuklanadi
3. **Token qaytadi:** `{access_token, role, employee_id, name, is_checker, permissions[]}`
4. **Frontend Zustand `authStore`'ga saqlaydi** (localStorage `auth-storage`)
5. **`api.defaults.headers.common['Authorization'] = 'Bearer {token}'`** — har keyingi request avto-attach qiladi

### Permission ro'yxati

| Permission | Sections (ixtiyoriy) | Tushuntirish |
|---|---|---|
| `dashboard` | — | Bosh sahifa |
| `messages` | `messages:demand`, `messages:order`, `messages:payment_in`, `messages:supply`, `messages:salesreturn` | Telegram xabarlar tarixi (sub-section: faqat ma'lum doc turi) |
| `reports` | — | Hisobotlar |
| `employees` | — | Xodimlar boshqaruvi |
| `tasks` | — | Vazifalar |
| `oylik` | — | Oylik |
| `activity` | — | Faoliyat tarixi |
| `settings` | — | Tizim sozlamalari |

### Access levels

- **`full`** — to'liq (o'qish + yozish)
- **`read`** — faqat ko'rish
- **`own_only`** — faqat o'ziga tegishli (masalan, "messages:own_only" → faqat shu xodim ishlatgan kontragentlar)

### Permission cheklovlari

- Backend hozirda **har endpoint'da permission cheklovi qattiq emas** — frontend role asosida sahifalarni yashiradi/ko'rsatadi
- Productionga `is_checker`, `is_admin` flag'lari token ichida + middleware orqali tekshirish tavsiya etiladi

---

## 4. Layout — Sidebar va Header

### Layout.jsx — qo'lqop komponent

**URL:** `/` (har sahifa shu layout ichida)

**Vazifa:**
- `useEffect`'da `initToken()` chaqiriladi — localStorage'dan token olib API header'ga qo'yadi
- Agar token yo'q → `/login`'ga avtomat yo'naltiradi (`<Navigate replace />`)
- Sidebar va Header'ni render qiladi
- Asosiy kontent `<Outlet />` orqali ko'rsatiladi (React Router child route)
- Sidebar collapsed holati `useState`'da, Header tugmasi orqali toggle

### Sidebar.jsx — navigatsiya

**Holat asosida ko'rinadigan menyular:**

**Admin (is_admin=true) ko'radi:**
- **Asosiy:** Dashboard, Xabarlar, Hisobotlar
- **Boshqaruv:** Xodimlar, Vazifalar, Davomat, Oylik
- **Tizim:** Sozlamalar

**Xodim (is_admin=false) ko'radi:**
- **Menyu:** Mening Vazifalarim, Davomat
- **Qo'shimcha (faqat is_checker=true):** Tekshiruv

**Foot section:**
- Foydalanuvchi avatar (ism birinchi harfi) + ism + rol label

**Collapse:**
- Hamburger tugma (Header'da) → sidebar 60→16 px qisqaradi, faqat ikonkalar
- Hover'da tooltip popup chiqadi

### Header.jsx — top bar

**Chap:**
- Hamburger toggle
- WebSocket'dan kelgan oxirgi sync vaqti `HH:MM:SS` formatida

**O'ng:**
| Element | Vazifa | Trigger |
|---|---|---|
| **MoySklad pill** | yashil pulse / kulrang | `syncStore.isRunning` (WS event) |
| **Telegram pill** | wifi yashil / wifi-off kulrang | `GET /api/telegram/status` |
| **Sync Now (RefreshCw)** | bossa darhol sync | `POST /api/moysklad/sync-now` |
| **Theme toggle** | Sun/Moon, dark/light | `themeStore.toggleDarkMode()` (localStorage `theme-storage`) |
| **User badge** | Ism + rol + LogOut tugma | `logout()` → `/login` |

**WebSocket connection** (`/ws`) komponent mount'da o'rnatiladi, `setStatus()` chaqiradi:
- `is_running`, `last_sync`, `messages_sent_today` → syncStore
- 3s reconnect on close

---

## 5. Sahifalar

### 5.1 LoginPage

**URL:** `/login`
**Maqsad:** Admin yoki xodim login qiladi.
**Kim ko'radi:** token bo'lmagan har kim.

**Layout:**
- **Chap panel** (faqat lg: ekranda) — gradient (primary 950 → slate-900), MoySklad logo, feature ro'yxati
- **O'ng panel:**
  - **Username** input
  - **Parol** input + Eye/EyeOff (ko'rinish toggle)
  - **Kirish** tugma (loading'da disabled, "Kirish..." text)
  - **Xato xabar** (qizil badge, agar `error` bor)

**Klikda:**
1. `authStore.login(username, password)` chaqiriladi
2. Backend `POST /auth/login` (yuqorida tushuntirilgan)
3. Muvaffaqiyat → `is_admin ? '/dashboard' : '/my-tasks'`
4. Xato → "Login yoki parol noto'g'ri" toast

---

### 5.2 DashboardPage

**URL:** `/dashboard`
**Maqsad:** Real-time savdo va Telegram statistikasi
**Kim ko'radi:** admin

**Stat kartalar (4 ta):**

| # | Karta | Ma'lumot manbasi | Rang |
|---|---|---|---|
| 1 | Jami kontragentlar (X tasi Telegram ulangan) | `summary.total_counterparties` | ko'k |
| 2 | Bugun yuborilgan | `summary.messages_sent_today` | yashil |
| 3 | Muvaffaqiyatsiz | `summary.failed_messages_today` | qizil/orange |
| 4 | Ulangan ratio (X/Y) | `linked / total` | binafsha |

Loading'da skeleton.

**Grafik:** Recharts AreaChart, "Oxirgi 7 kun aktivligi"
- X: sana, Y: total xabar soni
- Indigo gradient
- Manba: `GET /api/reports/sales?days=7` → `[{date, demands, payments, orders, total}]`

**Recent Messages jadval:** so'nggi 5 ta xabar
- Ustunlar: Kontragent, Tur (Savdo/To'lov/Buyurtma label), Status badge, Vaqt (fmtDateTimeShort)

**Refresh:** `setInterval(30000)` da 3 ta API parallel chaqiriladi

**Endpoint'lar:**
- `GET /api/reports/summary` — kartalar uchun
- `GET /api/reports/sales?days=7` — grafik uchun
- `GET /api/messages?limit=5` — jadval uchun

---

### 5.3 MessagesPage (Xabarlar)

**URL:** `/messages`
**Maqsad:** Telegram orqali yuborilgan xabarlar tarixi (5000+ yozuv)
**Kim ko'radi:** admin (permission='messages')

**Sahifa ustida:**
- "Xabarnomalar tarixi" sarlavha
- "Jami: 5350 ta · har 15 soniyada yangilanadi"
- "Yangilash" tugma (manual)

**Filter bar (jadval ustida):**

3 ta column header dropdown — `Kontragent`, `Tur`, `Status`. Har dropdown ichida:
- **Search input** (4+ opsiya bo'lsa)
- **Barchasi** opsiyasi (umumiy total bilan)
- **Per-value list** (count bilan, count desc bo'yicha sortlangan)

Filter manbasi: `GET /api/messages/filter-options` — butun DB bo'yicha distinct values + counts (faqat hozirgi sahifa emas).

Filter tanlanganda:
- `GET /api/messages/?counterparty_name=...&message_type=...&status=...&page=N&limit=30`
- Active filter chip bar yuqorida ko'rinadi (X bilan o'chirish), "Tozalash" tugma

**Jadval ustunlari:**

| Ustun | Mazmun | Rang/badge |
|---|---|---|
| Kontragent | Avatar (1-harf) + ism + Telegram identifikator (sariq monospace) | ko'k avatar |
| Tur (sm:hidden) | "Sotuv" (demand) / "Tovar olish" (supply) / "To'lov" (payment_in) / "Buyurtma" (order) / "Qaytarish" (return) | matn + doc raqami |
| Xabar | Birinchi 2-3 qator (line-clamp-2) | xira matn |
| Status | "Yuborildi" (yashil) / "Xatolik" (qizil) / "Navbatda" (ko'k) / "Kutmoqda" (sariq) | badge + tooltip xato matni |
| Vaqt (lg:hidden) | `fmtDateTime` | xira |
| Amal | 💬 chat ochish / 🔄 qayta yuborish (faqat failed) | tugmalar |

**Pagination:** "Sahifa N / M", Oldingi/Keyingi tugmalar.

**Auto-refresh:** har 15 soniyada silent fetch (yangilanish indikatorisiz).

**ChatPanel slide-over** (right slide):

Bossa: `openChat(msg)` → side panel ochiladi.

Kontent:
- **Header:** kontragent avatar + ism + Telegram target, Yangilash + Yopish tugmalari (primary-600 fon)
- **Messages:** Telethon orqali olingan oxirgi 40 ta xabar
  - `msg.out: true` → o'ng tomon (primary-600 fon, oq matn)
  - `msg.out: false` → chap tomon (oq fon, qora matn)
  - Vaqt har xabar tagida
  - Media-only xabar: "📎 Media fayl"
- **Compose:**
  - Textarea (Enter yuborish, Shift+Enter yangi qator)
  - Send tugma (paper plane ikonka)
  - `POST /api/telegram/send-to-counterparty {counterparty_id, message}`
  - Yuborilgach `loadHistory()` qayta chaqiriladi

**Endpoint'lar:**

| URL | Method | Vazifa |
|---|---|---|
| `/api/messages/` | GET | Pagination, filter, jadval ma'lumoti |
| `/api/messages/filter-options` | GET | Distinct kontragentlar/turlar/statuslar + count |
| `/api/messages/{id}/resend` | POST | Failed xabarni queue'ga qaytarish |
| `/api/messages/queue-stats` | GET | Queue holati (pending, retry, sent, failed) |
| `/api/telegram/chat/{cp_id}` | GET | Chat tarix (oxirgi 40 xabar) |
| `/api/telegram/send-to-counterparty` | POST | Yangi xabar yuborish |

**Bog'liqlik:**
- `MessageLog` modeli (har yuborilgan xabar uchun yozuv)
- `Counterparty` modeli (kontragent ma'lumotlari)
- `telegram_service` (chat tarixi, xabar yuborish)
- `queue_worker` (resend → queue)
- WebSocket: hozir messages real-time emas, faqat 15s polling

---

### 5.4 ReportsPage (Hisobotlar)

**URL:** `/reports`
**Maqsad:** Sotuv aktivligi statistikasi
**Kim ko'radi:** admin

**Stat kartalar (4 ta):**
- Jami kontragentlar
- Telegram ulangan kontragentlar
- Bugun yuborilgan
- Bugun muvaffaqiyatsiz

**Period selector pills:** "7 kun" / "14 kun" / "30 kun" tugmalari

**Vizualizatsiyalar:**

1. **Xabar aktivligi BarChart** — kun bo'yicha 3 ta bar (Savdo, To'lov, Buyurtma)
   - `GET /api/reports/sales?days=N`
2. **Top kontragentlar** (ikkita ustun, responsive):
   - Chap: 1-5 reyting + progress bar
   - O'ng: PieChart (donut)
   - `GET /api/reports/top-counterparties?limit=5`

**Endpoint'lar:**
- `GET /api/reports/summary`
- `GET /api/reports/sales?days=N`
- `GET /api/reports/top-counterparties?limit=N`

---

### 5.5 EmployeesPage (Xodimlar)

**URL:** `/employees`
**Maqsad:** Xodim CRUD, login/parol o'rnatish, MoySklad agent linking, permissions
**Kim ko'radi:** admin (permission='employees')

**Filter:**
- Search input (ism, telefon, telegram_phone)
- Rol dropdown (Barchasi/admin/cashier/warehouse/staff)

**Jadval ustunlari:**

| Ustun | Mazmun | Belgi |
|---|---|---|
| Ism | Ism + asosiy telefon (kichik) | qora |
| Rol | Rol badge (multi-rol bo'lsa har biri alohida) | ranglar bo'yicha |
| Telegram | telegram_phone yoki "—" | 📱 + raqam |
| Bo'lim | department yoki "—" | xira |
| Amal | 🔑 / ✏️ / ❌ | tugmalar |

**Yuqorida:** "+ Xodim qo'shish" tugma → EmployeeModal yaratish rejimi

**EmployeeModal — yaratish/tahrirlash:**

Inputlar:
- **Ism Familiya*** (text, shart) — "Ahmadov Ahmad"
- **Rol** (select, default "staff") — admin/cashier/warehouse/staff yoki custom
- **Telegram telefon** (text) — "+998901234567" — xabar yuborish uchun
- **Asosiy telefon** (text) — "+998..."
- **Bo'lim** (text, ixtiyoriy) — "Savdo bo'limi"
- **Tekshiruvchi toggle** (checkbox) — `is_checker` flag
  - Tushuntirish: "Boshqa xodimlar topshirgan vazifalarni tasdiq/rad qila oladi. Vazifa shabloni yaratganda tekshiruvchi sifatida tanlash mumkin bo'ladi."

Saqlash:
- POST `/api/employees/` (yangi) yoki PUT `/api/employees/{id}` (tahrir)
- Activity log yozuv: "created" / "updated" + diff

**SetPasswordModal:**

Bossa 🔑 ikonka. Inputlar:
- **Username (login)** — text, shart
- **Yangi parol** — password, kamida 4 belgi

Backend: `POST /api/employees/{id}/set-password {username, password}` — bcrypt hash. `username` unique check.

**Soft-delete:** ❌ tugma → `DELETE /api/employees/{id}` → `is_active=false` (haqiqatda o'chirilmaydi).

**Rol va Permission boshqaruv:**

`EmployeesPage`'da maxsus tab (ehtimol tabga ko'chirilgan) — har xodim uchun:
- Per-page permission ro'yxati (dashboard, messages:demand, ...)
- Access level (full/read/own_only)
- Endpoint: `GET/PUT /api/employees/{id}/permissions`

**Custom rollar:**
- Default 4 ta: admin, cashier, warehouse, staff
- Custom qo'shish: "+ Yangi rol" → `POST /api/employees/meta/roles {value, label}`
- AppSettings'da JSON sifatida saqlanadi (`custom_roles` key)
- Default rollar o'chirib bo'lmaydi

**MoySklad agent linking:**
- `PUT /api/employees/{id} {moysklad_agent_id: "..."}`
- Dropdown manbasi: `GET /api/employees/moysklad-agents` — MoySklad'dan barcha employee'lar
- KPI hisoblash uchun foydalaniladi

**Endpoint'lar:**

| URL | Method | Vazifa |
|---|---|---|
| `/api/employees/` | GET | Filter, ro'yxat |
| `/api/employees/` | POST | Yangi xodim |
| `/api/employees/{id}` | GET/PUT/DELETE | CRUD |
| `/api/employees/{id}/set-password` | POST | Login credentials |
| `/api/employees/moysklad-agents` | GET | MoySklad employee dropdown |
| `/api/employees/{id}/permissions` | GET/PUT | Per-page permissions |
| `/api/employees/meta/roles` | GET/POST | Custom rol CRUD |
| `/api/employees/meta/roles/{value}` | DELETE | Rol o'chirish |
| `/api/employees/meta/permissions` | GET | Mavjud permission ro'yxati |

---

### 5.6 TasksPage (Vazifalar)

**URL:** `/tasks`
**Maqsad:** Vazifa shablonlari + yuborish tarixi (eng katta sahifa, ~1700 qator)
**Kim ko'radi:** admin (permission='tasks')

**2 ta tab:** "Vazifa shablonlar" (TemplatesTab) + "Vazifa tarixi" (LogsTab)

#### 5.6.1 Vazifa shablonlar (TemplatesTab)

**Filter bar (8 ta dropdown):**

1. **Sarlavha** — shablon nomlari, sort A→Я, count
2. **Bo'lim** — department, indigo badge, count
3. **Tekshiruvchi** — checker_name, 🛡 ikonka, "— tekshiruvchisiz —" bucket
4. **Trigger** — Qo'lda/Vaqt bo'yicha/Hodisa, color badge
5. **Vaqt** — schedule_time (HH:MM), Clock ikonka, sort Erta→Kech
6. **Muhimlik** — Oddiy/O'rta/Muhim/Shoshilinch, color badge
7. **Holat** — Faol/Nofaol, yashil/kulrang
8. **Barchasi** count tugma

Har dropdown ichida:
- Sort (asc/desc) tugmalar
- Search input (4+ opsiya)
- Multi-select checkbox
- Per-option count
- Tozalash tugma

Active filter chips yuqorida (X bilan o'chirish), "Tozalash" tugma.

**Jadval ustunlari (9 ta):**

| Ustun | Mazmun | Tafsilotlar |
|---|---|---|
| Sarlavha | title + description (xira) | Subtext'da: trigger ikonka + schedule, depends_on, deadline+reward+fine badge'lar |
| Bo'lim | department badge yoki "—" | indigo |
| Tekshiruvchi | checker_name + 🛡 ikonka yoki "— tekshiruvchisiz —" | ko'k chip |
| Trigger | "Qo'lda"/"Vaqt bo'yicha"/"Hodisa" | color badge |
| Vaqt | schedule_time yoki "—" | matn |
| Muhimlik | priority badge | colored |
| Javob | "Kerak emas"/"Ha/Yo'q"/"Matn" | matn |
| Holat | "Faol"/"Nofaol" | yashil/kulrang |
| Tugmalar | 📤 Send / ✏️ Edit / 🗑️ Delete | flex gap |

**"+ Shablon qo'shish"** tugmasi — TemplateModal yaratish rejimi.

#### 5.6.2 TemplateModal (juda katta forma)

Inputlar (validatsiya bilan):

| # | Field | Type | Validation | Conditional |
|---|---|---|---|---|
| 1 | Sarlavha* | text | shart | — |
| 2 | Tavsif | textarea | — | — |
| 3 | Xodim (aniq) | select (employees) | XOR with role | yoki rol XOR |
| 4 | Yoki rol bo'yicha | select (roles) | XOR with employee | + custom rol qo'shish inline |
| 5 | Bo'lim | select (departments) | — | + custom dept inline |
| 6 | Muhimlik | 4 ta button | enum: low/medium/high/urgent | — |
| 7 | Trigger turi* | select | enum: manual/scheduled/event | — |
| 8a | (scheduled) Vaqt | time HH:MM | regex | trigger=scheduled |
| 8b | (scheduled) Takrorlanish | toggle: Haftalik/Oylik | — | trigger=scheduled |
| 8c | (haftalik) Kunlar | 7 ta day toggle + Har kuni/Du-Ju/Dam olish | min 1 kun | mode=haftalik |
| 8d | (oylik) Kun | 1-31 grid | single select | mode=oylik |
| 9a | (event) Hujjat turi | select (12 ta MoySklad doc type) | — | trigger=event |
| 9b | (event) Hodisa | select (new/updated/large_sale + states) | — | trigger=event |
| 9c | (large_sale) Minimal summa | number | positive | event=large_sale |
| 10 | Javob turi | select | enum: none/yes_no/text | — |
| 11 | Muddat (daqiqa) | quick buttons (30/60/120/240/480) + custom number | positive int | — |
| 12 | Mukofot (bonus) | number | positive | — |
| 13 | Jarima | number | positive | — |
| 14 | **Tekshiruvchi** | select (faqat is_checker=true xodimlar) | optional | + tushuntirish hint |
| 15 | Oldingi vazifa (zanjir) | select (depends_on candidates) | optional | faqat candidates >= 1 |
| 16 | Faol | checkbox | default true | — |

**Saqlash bossa:**

`POST /api/tasks/templates` (yaratish) yoki `PUT /api/tasks/templates/{id}` (tahrir):

1. Backend Pydantic validatsiya
2. DB ga insert/update
3. Activity log "created"/"updated" + diff
4. **Agar trigger=scheduled va is_active=true** → APScheduler'ga `CronTrigger` job qo'shiladi (`task_{id}` ID bilan)
5. Agar update bo'lsa, eski job o'chiriladi → yangi qo'shiladi
6. Modal yopiladi, jadval refresh

#### 5.6.3 Vazifa tarixi (LogsTab)

**ERP-style filter toolbar** (3 qism):

1. **Search input** — javob matnida qidirish (350ms debounce, ilike % wrapped)
2. **Date range** — `datetime-local` from/to
3. **Tozalash** tugma (faqat active filter bo'lsa)

**Active filter chips:**
- "Vazifa: Kassa yopildimi?"
- "Xodim: Bekzod"
- "Holat: Tasdiq kutmoqda"
- "Javob: 'омборхона'"
- Sana oraliq

Har chip X bilan o'chiriladi.

**Jadval ustunlari (7 ta):**

| Ustun | Mazmun |
|---|---|
| **Status indikator** (chap, faqat checker_id bor bo'lsa) | 🔵 ko'k spinner (pending_review) / ✅ yashil tick (tasdiqlangan) / ❌ qizil X (rad qilingan) — tekshiruvchi yo'q vazifalar uchun bo'sh |
| **Vazifa** | template_title + subtext (reviewed_by_name yoki "Tasdiq kutilmoqda") |
| **Xodim** | employee_name |
| **Holat** | status badge (sent/pending_review/answered_yes/answered_no/answered_text/failed) |
| **Javob** | response_text (whitespace-pre-wrap, max-w-xs) |
| **Vaqt** | "Javob: ...", "Yuborildi: ..." |
| **Amal** | inline ✓/✗ tugmalar (canReview) yoki "Javob" tugma (canAnswer) |

**Multi-select column dropdown** har VAZIFA / XODIM / HOLAT ustun header'ida:
- Search input (4+ opsiya)
- Sort tugmalar (asc/desc)
- Per-option count
- Multi-select checkbox

Filter manbasi: `GET /api/tasks/logs/filter-options` — distinct values across full DB:
- `templates` — TaskLog'dagi distinct title'lar **plus** TaskTemplate'da aktiv (count=0) — barcha mavjud shablonlar dropdown'da ko'rinadi
- `employees` — distinct employee_name'lar
- `statuses` — distinct status'lar

**Pagination:** `LOGS_PAGE_SIZE=50`, "« ‹ N/M › »" tugmalar, "1–50 / 250" ko'rsatkich.

**Sort:** har column header bossa `sort_by` + `sort_dir` qo'shiladi (created_at/sent_at/answered_at/template_title/employee_name/status).

**WebSocket** — admin channel `/ws/tasks/0`:
- `new_task` — agar default sort+filter holatida bo'lsa, qator avto-prepend
- `task_answered` — qator status'i in-place yangilanadi

**Inline review** — `canReview(log) = log.status === 'pending_review' && (admin || (is_checker && checker_id === user.employee_id))`:
- ✓ tugma (yashil) → optimistic update + `PATCH /api/tasks/logs/{id}/review {decision: "approve"}`
- ✗ tugma (qizil) → optimistic update + reject

**AnswerModal** (canAnswer'dan):
- yes/no tugmalar (response_type=yes_no)
- textarea (response_type=text)
- "none" → message "Bu vazifa javob talab qilmaydi"
- Saqlash → `PATCH /api/tasks/logs/{id}/answer {status, response_text}`

#### 5.6.4 Backend endpoint'lar

| URL | Method | Vazifa |
|---|---|---|
| `/api/tasks/templates` | GET/POST | Shablon CRUD |
| `/api/tasks/templates/{id}` | PUT/DELETE | Shablon update/delete |
| `/api/tasks/templates/{id}/send` | POST | Manual yuborish |
| `/api/tasks/departments` | GET/POST | Bo'lim CRUD |
| `/api/tasks/departments/{name}` | DELETE | Bo'lim o'chirish |
| `/api/tasks/logs` | GET | Pagination + filter + sort |
| `/api/tasks/logs/filter-options` | GET | Distinct values + counts |
| `/api/tasks/logs/mine` | GET | Xodim o'z vazifalari (employee_id + since_minutes) |
| `/api/tasks/logs/{id}/answer` | PATCH | Xodim javob beradi |
| `/api/tasks/logs/{id}/review` | PATCH | Tekshiruvchi tasdiq/rad |
| `/api/tasks/pending-review` | GET | checker_id bo'yicha pending'lar |

---

### 5.7 ReviewPage (Tekshiruv)

**URL:** `/review`
**Maqsad:** Tekshiruvchi xodimga assign qilingan pending_review vazifalarni tasdiqlaydi/rad qiladi
**Kim ko'radi:** admin (barcha pending'lar) **yoki** xodim (is_checker=true va checker_id=user.employee_id)

**Top section:**
- 🛡 Tekshiruv ikonkasi
- Sarlavha + "Tasdiq kutayotgan vazifalar: N" subtext
- Yangilash tugma

**Boshlang'ich yuklash:**
- Admin: `GET /api/tasks/logs?statuses=pending_review&limit=100&sort_by=answered_at&sort_dir=desc`
- Xodim: `GET /api/tasks/pending-review?checker_id={id}`

**WebSocket** (`/ws/tasks/{checker_id}` yoki `/ws/tasks/0`):
- `pending_review` event → toast + `fetchPending(silent=true)`
- `task_reviewed` event → list'dan o'chiriladi (boshqa tekshiruvchi qaror berdi)

**Vazifa kartochkasi:**

Har vazifa uchun karta:
- Sarlavha (template_title) + 👤 employee + 🕐 answered_at
- Sariq badge: "Tasdiq kutmoqda"
- Javob preview (gray box, whitespace-pre-wrap, message ikonka)
- 2 ta tugma:
  - **✅ Tasdiqlayman** (yashil) → ReviewModal (decision="approve")
  - **❌ Rad qilaman** (qizil) → ReviewModal (decision="reject")

**ReviewModal:**
- Sarlavha + ikonka (yashil/qizil): "Tasdiqlash" / "Rad qilish"
- Xodim javobi (gray box)
- **Izoh** (textarea, optional, autofocus)
- **Bekor** | **Tasdiqlayman/Rad qilaman** tugmalar

Saqlash:
- `PATCH /api/tasks/logs/{id}/review {decision, comment?}`
- Backend logic (lifecycle quyida ko'ring)
- Optimistic: vazifa list'dan darhol o'chiriladi
- Toast: "Tasdiqlandi" yoki "Rad etildi"

---

### 5.8 MyTasksPage (Mening Vazifalarim)

**URL:** `/my-tasks`
**Maqsad:** Xodim o'ziga yuborilgan vazifalarni ko'radi va Telegram'sis web'dan ham javob bera oladi
**Kim ko'radi:** xodim

**Tab'lar:**
- **"Yangi"** (default) — faqat unanswered (status=='sent' && response_type!='none')
- **"Barchasi"** — barcha log'lar

Har tab'da count badge.

**Vazifa kartochkasi:**

| Element | Mazmun |
|---|---|
| Status ikonka | Clock (sent) / Spinner (pending_review) / Check (answered_yes/text) / X (answered_no/failed) |
| Sarlavha | template_title |
| Status badge | "Javob kutilmoqda" / "Tasdiq kutmoqda" / "Ha" / "Yo'q" / "Javob berildi" / "Yuborilmadi" |
| Xabar matni | Telegram'da yuborilgan matn (line-clamp-2) |
| Javob (agar bor) | response_text (italic) |
| Vaqt | sent_at + deadline countdown |
| Deadline countdown | "⏳ 2 soat 30 daqiqa" (yashil) / "⏳ 5 daqiqa" (qizil + pulse) / "⏳ Vaqt tugadi!" |

**"Javob" tugma** — faqat status='sent' && response_type!='none':
- Bossa AnswerModal ochiladi (mobile: bottom sheet, desktop: centered modal)

**AnswerModal:**

| response_type | Ko'rinish |
|---|---|
| `yes_no` | 2 ta katta tugma: ✅ Ha / ❌ Yo'q. "Yo'q" bossa, sabab so'rash matn maydoni ochiladi |
| `text` | Textarea + Yuborish tugma |
| `none` | "Bu vazifa javob talab qilmaydi" |

Saqlash → `PATCH /api/tasks/logs/{id}/answer` → lifecycle (quyida).

**WebSocket** (`/ws/tasks/{employee_id}`):
- `new_task` event → list'ga prepend, toast, browser Notification API (agar ruxsat berilgan)

---

### 5.9 AttendancePage (Davomat)

**URL:** `/attendance`
**Maqsad:** Xodim kelish/ketish vaqtlarini qayd etish va hisobotlash
**Kim ko'radi:** admin (barcha) yoki xodim (faqat o'z davomati — agar permission cheklangan bo'lsa)

**2 ta tab:**
- "Kelish belgisi" (TodayTab) — bugungi
- "Hisobot" (ReportTab) — sana oraliq

#### 5.9.1 TodayTab

**Yuqorida** "Kelishni belgilash" tugma (yangi check-in)

**Jadval ustunlari:**

| Ustun | Mazmun |
|---|---|
| Xodim | ism |
| Kelish | 🕐 yashil + check_in vaqti |
| Ketish | 🕐 qizil + check_out vaqti yoki "—" |
| Holat | "Ishda" (yashil) / "Ketdi" (kulrang) |
| Amal | "Ketishni belgilash" (faqat hali ketmaganlar uchun) + ✏️ tahrirlash |

**CheckInModal:**
- Xodim select (faqat hali bugun check-in qilmaganlar)
- "Belgilash" tugma → `POST /api/attendance/check-in {employee_id}`
- Server `datetime.now()` ni avtomat o'rnatadi
- **Telegram admin'iga xabar:** "✅ {Ism} ishga keldi 🕐 HH:MM" (agar admin'ning telegram_phone bor)

**"Ketishni belgilash" tugma:**
- `POST /api/attendance/{id}/check-out {}` (bo'sh JSON body Pydantic uchun shart)
- Server check_out_time = now(), Asia/Tashkent TZ qo'shadi (yoqida muhim bug edi, hal qilingan)

**EditModal** (✏️ tugma) — admin noto'g'ri vaqtni tuzatish uchun:
- Inputlar: `datetime-local` Kelish + Ketish
- "Tozalash" mini-tugma (RotateCcw) — check_out_time = null → xodim "Ishda" holatga qaytadi
- Saqlash: `PATCH /api/attendance/{id} {check_in_time?, check_out_time?, clear_check_out?}`
- 🗑️ qizil tugma — `DELETE /api/attendance/{id}` butunlay o'chirish

#### 5.9.2 ReportTab

**Filter:**
- Date from/to
- Xodim dropdown (Barchasi yoki bittasi)
- "Qidirish" tugma → `GET /api/attendance/report?date_from=&date_to=&employee_id=`

**Jadval ustunlari:**
- Sana
- Xodim
- Kelish (vaqt + 🕐 yashil)
- Ketish (vaqt + 🕐 qizil yoki "—")
- Davomiylik ("9 soat 25 daqiqa") — duration helper
- Holat ("Tugallangan" / "Ishda")

**Vaqt formatlash:**
- Backend `_to_iso(dt)` — naive datetime'ga server lokal TZ (+05:00) qo'shadi
- Frontend `dateUtils.js` — `Asia/Tashkent` da `Intl.DateTimeFormat` bilan render

**Endpoint'lar:**

| URL | Method |
|---|---|
| `/api/attendance/today` | GET |
| `/api/attendance/report` | GET |
| `/api/attendance/check-in` | POST |
| `/api/attendance/{id}/check-out` | POST |
| `/api/attendance/{id}` | PATCH (tahrir) / DELETE |

---

### 5.10 OylikPage (Oylik)

**URL:** `/oylik`
**Maqsad:** Oylik = base + bonus - fine + KPI hisoblash, bonus/jarima qoidalari, KPI dashboard
**Kim ko'radi:** admin (permission='oylik')
**Sahifa hajmi:** 2700+ qator (eng katta sahifa)

**6 ta tab:**

1. **Hisob-kitob** (HisobTab) — asosiy
2. **Bonuslar** (RulesTab type=bonus) — qoidalar boshqaruvi
3. **Jarimalar** (RulesTab type=fine)
4. **KPI** — kunlik/oylik KPI scores, conditions
5. **Konfiguratsiya** — SalaryConfig per xodim
6. **Xulosa** — oylik ROI summary

#### 5.10.1 HisobTab

**Period selector pills:** Bugun/30 kun/60 kun/90 kun

**Stat kartalar (5 ta):**

| Karta | Mazmun | Rang |
|---|---|---|
| Jami oylik | yig'indi base_salary | kulrang |
| Jami bonus | yig'indi bonuslar | yashil |
| Jami jarima | yig'indi jarimalar | qizil |
| Bugungi | bugun bonus - bugun fine | amber |
| Jami to'lov | net_salary yig'indisi | primary (qalin) |

**Asosiy jadval:**

| Ustun | Mazmun |
|---|---|
| Xodim | ism |
| Rol | rol badge'lar (multi-rol) |
| Oylik | base_salary |
| Bonus | total_bonus, **clickable** → BonusFineDetailModal |
| Jarima | total_fine, **clickable** → BonusFineDetailModal |
| Bugungi | today_bonus - today_fine |
| Jami | net_salary (qalin) |
| Amallar | + bonus / - jarima / ✏️ oylik belgilash |

**BonusFineDetailModal:**
- Click bonus/jarima raqamiga → modal ochiladi
- `GET /api/bonus-fine/logs?employee_id=X&type=bonus&days={period}`
- Yozuvlar **kun bo'yicha guruhlangan**:
  - "3-may, dushanba" header
  - Har yozuv: title, note, source label (Qo'lda/Qoida/Vazifa bajarilgani uchun/Vazifa vaqti tugagani uchun), vaqt, miqdor (yashil/qizil)
- Yuqorida jami summa banner

**"+ bonus / - jarima" tugmalari** → ApplyModal:
- Yildirim: gradient header, "Kunlik vazifalar" / "Jarimalar"
- Per-xodim mavjud rule'lar ro'yxati, har biri:
  - Custom checkbox
  - Vazifa nomi (strikethrough agar tanlangan)
  - Tavsif
  - Summa badge
- Saqlash → faqat o'zgargan elementlar:
  - `toCreate` → `POST /api/bonus-fine/logs`
  - `toDelete` → `DELETE /api/bonus-fine/logs/{id}`

**SalaryModal** (✏️ tugma):
- "Asosiy oylik (so'm)" number input
- `PUT /api/employees/{id} {base_salary}`

#### 5.10.2 Bonuslar / Jarimalar tab (RulesTab)

Per-rol qoidalar boshqaruvi:
- Filter: rol bo'yicha
- "+ Yangi qoida" → RuleModal:
  - Vazifa nomi (text, shart) — "Rejani bajarish"
  - Tavsif (textarea, ixtiyoriy)
  - Summa (number, shart)
  - Rol (select yoki bo'sh = barchaga)
- Jadval: nom, tavsif, summa, rol, harakat (edit/delete)
- Endpoint: `/api/bonus-fine/rules` GET/POST/PUT/DELETE

#### 5.10.3 KPI tab

**Xodim tanlash dropdown.**

**SalaryConfig kartochkasi** (agar mavjud):
- Shablon nomi
- fix_weight, kpi_weight, bonus_weight (foiz)
- monthly_sales_target (so'm)
- Kunlik maqsad = target / kun_sonida

**Kunlik KPI jadval:**
- Sana, Kunlik maqsad, Fakt savdo, Bajarilish %, Daraja, KPI foiz
- Daraja: To'liq (100+%) / Qisman (90-99%) / Bajarilmadi (<90%)

**"Bugun hisoblash"** tugma → `POST /api/salary/calculate-daily` (manual trigger; cron 23:30 da avtomatik ham ishlaydi)

**Oylik ball jadval (KpiMonthlyScore):**
- Per metrika
- Bo'lim (FIX/KPI/BONUS), nomi, vaznoligi, bajarilish %, summa
- Admin/checker `%` ni inline tahrirlay oladi: `PATCH /api/salary/scores/{id}`

#### 5.10.4 Konfiguratsiya tab

Per-xodim SalaryConfig:
- Shablon (KpiTemplate select)
- FIX/KPI/BONUS vaznoliklari (0-1)
- Oylik savdo rejasi (so'm)
- KPI byudjeti (so'm, ixtiyoriy)
- Savdodan foiz (0.005 = 0.5%, ixtiyoriy)
- KPI Daraja JSON: `[{min:100,payout:100},{min:90,payout:80}]`
- Endpoint: `/api/salary/config` POST/PUT

#### 5.10.5 Xulosa tab

Oylik xulosasi jadvali (SalaryReport):
- Asosiy oylik | FIX | KPI | BONUS | JARIMA | **JAMI TO'LOV**
- Formula: base + (fix_weight × base × achievement) + kpi_amount + bonus - fine + commission
- Eksport (CSV/PDF) — agar mavjud

---

### 5.11 SettingsPage (Sozlamalar)

**URL:** `/settings`
**Maqsad:** Tizim konfiguratsiyasi — MoySklad, Telegram, kompaniya, shablonlar
**Kim ko'radi:** admin (permission='settings')

**Bo'limlar (Section'lar):**

#### A) MoySklad sozlamalari

- **API Token** (password input) — "MoySklad admin panelida API bo'limidan olinadi"
- **Polling intervali (sekund)** number, default 30
- **Kuzatiladigan hujjatlar** — checkboxlar: Savdo cheklari / Buyurtmalar / To'lovlar
- **Saqlash** — `PUT /api/settings/`

Polling interval o'zgarsa → sync_service scheduler restart bo'ladi.

#### B) Kompaniya ma'lumotlari

Har Telegram xabar boshiga/oxiriga signature sifatida qo'shiladi.

- Do'kon nomi (text) — "Climart Santexnika do'koni"
- Aloqa telefoni (text) — "(78) 333-47-47"
- `PUT /api/settings/telegram {company_name, contact_phone}`

#### C) Telegram sozlamalari (3 rejim)

**Rejim 1: idle**
- Warning: "my.telegram.org saytiga kirib API ID va API Hash oling"
- API ID + API Hash + Telefon raqam (+998...)
- "Telegram ga ulanish" tugma → `POST /api/telegram/connect`

**Rejim 2: code_sent**
- Info box: "💬 SMS kod yuborildi" yoki "📱 Telegram ilovasiga kod yuborildi"
- 6-raqamli kod input (autofocus, Enter'da verify)
- "Tasdiqlash" / "Bekor qilish" tugmalar
- `POST /api/telegram/verify-code`

**Rejim 3: connected**
- Yashil success box + foydalanuvchi nomi/username/telefon
- **Test xabar yuborish:**
  - Linked counterparty dropdown
  - Xabar matni (default: "🔔 Test xabari...")
  - "Yuborish" → `POST /api/telegram/send-test`
- "Uzish" tugma → `POST /api/telegram/disconnect`

**Session String orqali ulanish** (kod kelmasa):
- Lokal `get_session.py` skript yordamida string olish
- Textarea + "Session String bilan ulanish" → `POST /api/telegram/import-session`

**2 ta slot:** akkaunt 1 va akkaunt 2 — alohida kartochkalar.

#### D) Xabar shablonlari

3 ta textarea (monospace):
- demand_template (Savdo)
- payment_in_template (To'lov)
- order_template (Buyurtma)

Placeholder'lar: `{number}`, `{date}`, `{sum}`, `{positions}`, `{agent}`

`GET/PUT /api/settings/templates`

#### E) Hujjat cheklari (DocumentTemplatesSection)

Per-doc_type print template (chek) tanlash:
- DocTypeCard har doc_type uchun
- Chek nomlari (MoySklad'dan discovered)
- Reorder + enable/disable
- "Yangilash" tugma → MoySklad'dan template'larni qayta yuklash
- `GET /api/document-templates`, `PUT /api/document-templates/{doc_type}`

#### F) Custom rollar

Default 4 ta rol + qo'shimcha custom rol qo'shish/o'chirish.

**Endpoint'lar:**

| URL | Method |
|---|---|
| `/api/settings/` | GET/PUT |
| `/api/settings/telegram` | GET/PUT |
| `/api/settings/templates` | GET/PUT |
| `/api/telegram/connect` | POST |
| `/api/telegram/verify-code` | POST |
| `/api/telegram/import-session` | POST |
| `/api/telegram/disconnect` | POST |
| `/api/telegram/status` | GET |
| `/api/telegram/send-test` | POST |
| `/api/telegram/counterparties-with-telegram` | GET |
| `/api/telegram/clear-flood` | POST |
| `/api/document-templates` | GET |
| `/api/document-templates/{doc_type}` | PUT |

---

## 6. Backend xizmatlari

Har xizmat alohida vazifaga ega va boshqalar bilan koordinatsiya qiladi.

### 6.1 telegram_service.py — MTProto transport

- **2 ta TelegramAccount** (slot 1, slot 2) — har biri Telethon clienti, session fayli, entity cache
- **Failover** — slot 1 muvaffaqiyatsiz bo'lsa → slot 2 ga avtomat o'tadi
- **Flood handling** — `flood_wait.json` faylda persistent (restart'dan keyin ham eslab qoladi)
- **Entity cache** — `entity_cache.json` (User ID lar) — `ImportContacts` API chaqiruvini minimize qiladi
- **Rate limit** — har akkauntda 3s minimal oraliq

Asosiy metodlar:
- `initialize(api_id, api_hash, phone)` — kod request
- `verify_code(code, phone_code_hash, password)` — 2FA bilan
- `import_string_session(...)`
- `send_message(target, text)` — target = +998..., @username, yoki chat_id
- `get_chat_history(target, limit=40)`
- `disconnect(slot)`

**Foydalanuvchi ko'rmaydigan ish:**
- 5 minutda bir health check — har slot `is_user_authorized()` chaqirib ulanish holatini tekshiradi
- Disconnect bo'lsa `_connected = False` — keyingi sync chaqirig'i fail bo'ladi va admin ko'radi

### 6.2 sync_service.py — MoySklad polling

- APScheduler `IntervalTrigger(seconds=30)` — `sync_all()` har 30 soniyada
- `max_instances=1, coalesce=True` — overlap bo'lmaydi
- `_processed_demands/orders/payments/...` set'lar — duplicate'larni filterlaydi
- Order'larda `updated` timestamp ham track — yangi vs o'zgarish ajratilishi

**Polling oqimi:**
1. `_updated_from_param()` — last sync vaqti - 1 minut overlap
2. Parallel fetch 8 ta doc type
3. Har document → kontragent topish, balans yangilash, notification matn yasash, `enqueue_message()`
4. `_trigger_event_tasks()` — large_sale yoki supply event'ga task templates ishga tushirish

**Foydalanuvchi:**
- Header'dagi MoySklad pill yashil pulse = ishlayapti
- "Sync Now" tugma → `POST /api/moysklad/sync-now` (manual trigger)
- Sozlamalar'da polling interval o'zgartirish → restart

### 6.3 task_service.py — vazifa scheduler

- APScheduler bilan har shablon uchun `task_{id}` named cron job
- `reload_schedules()` — barcha aktiv scheduled template'larni qayta yuklash (lifespan startup va template update'da)

Asosiy metodlar:
- `send_task(db, template_id)` — barcha target xodimlarga yuborish
- `send_task_to_employee(db, tmpl, emp)` — bir xodimga (zanjir uchun)
- `send_task_to_role(db, role, title, ...)` — ad-hoc role bo'yicha
- `expire_overdue_tasks()` — har 60s, status='sent' && deadline_at <= now → answered_no + auto-fine
- `notify_employee_of_outcome(log, bonus, fine, comment, reviewed_by_name)` — Telegram'da xodimga natija xabari

### 6.4 admin_notifier.py — Bot API → admin kanal

- Telegram **Bot HTTP API** (Telethon emas) — `httpx` POST
- Admin kanaliga "real-time hisobot"
- 3 turdagi xabar: task answered, task expired, bonus/fine created
- Combined message: bonus/fine yaratilganda alohida emas, vazifa xabari ichida ko'rsatiladi
- `is_enabled()` — `AppSettings.admin_notifications_enabled` (default true)
- Try/except bilan o'ralgan — xabar yuborib bo'lmasa asosiy oqim buzilmaydi

### 6.5 queue_worker.py — async xabar yuborish

WAPPI pattern:
- `enqueue_message()` — `MessageQueue` jadvaliga insert (status=pending)
- APScheduler `IntervalTrigger(seconds=5)` → `process_one()`
- Oldest pending yoki `next_retry_at <= now` retry message olinadi
- Priority: counterparty (3) > usta (5)
- `telegram_service.send_message()` chaqiriladi
- Muvaffaqiyat → status=sent, MessageLog yangilanadi
- Flood → worker pause + "pending" qaytariladi
- "topilmadi" → status=failed (final)
- Boshqa xato → exponential backoff (30s, 90s, 270s), 3 urinish

### 6.6 kpi_service.py — KPI hisoblash

- APScheduler `CronTrigger(hour=23, minute=30)` — har kuni 23:30
- `calculate_daily_kpi()` — barcha SalaryConfig'lar uchun
- `_fetch_monthly_sales()` — MoySklad `/report/profit/byemployee` (90s timeout)
- Per xodim:
  - `monthly_sales_target` vs actual
  - Achievement % → tier lookup → payout %
  - Personal vs total separate `KpiDailyLog`
- Manual trigger: `POST /api/salary/calculate-daily`

### 6.7 moysklad_service.py — REST API client

- Bearer token (afzal) yoki Basic (login:password fallback)
- Endpoint: `/entity/demand`, `/entity/customerorder`, `/entity/paymentin/out`, `/entity/supply`, `/entity/move`, `/entity/salesreturn`, `/entity/purchasereturn`, `/report/profit/byemployee`, `/report/counterparty/{id}`
- Retry: ConnectTimeout/ReadTimeout → 1s wait, 2 ta urinish total
- `get_publication_hrefs()` — print template'lar (chek URL'lari)
- 401 → re-auth talab, 404 → null qaytaradi, timeout → log + None

### 6.8 notification_service.py — xabar matn template

- Per doc type message format
- Default template:
  ```
  Climart Santexnika
  ✅ Sotuv amalga oshirildi!
  15-04-2026 14:30
  🔷 Dokument: INV-2026-001
  👤 Xaridor: ABC +998911234567
  💰 Xarid summa: 1,500,000 so'm
  📋 Balans: -500,000 so'm
  🧾 Chek: [print_link_1] [print_link_2]
  📞 Aloqa: +99890-xxx-xxxx
  ```
- Counterparty refresh balance (MoySklad'dan), targets collect (counterparty + usta), `MessageLog` create, `enqueue_message()`

### 6.9 document_template_service.py — chek shabloni config

- `AppSettings.doc_templates_config` (JSON):
  ```json
  {
    "types": {
      "demand": {"enabled": true, "templates": ["Чек_сум_(FerroSoft)", "Расходная накладная"]},
      "paymentin": {"enabled": false, "templates": []}
    }
  }
  ```
- Cache: `AppSettings.doc_templates_cache` — MoySklad'dan discovered template'lar
- Startup'da idempotent seed (default DOC_TEMPLATES'dan)

### 6.10 activity_service.py — audit log

- `log_activity(db, user_name, user_role, action, module, entity_type, entity_id, entity_title, changes={})`
- `ActivityLog` jadvaliga insert (created_at, user, action, module, entity, JSON changes/extra)
- Har CRUD endpoint'da chaqirilishi kerak (lekin doim emas — coverage to'liq emas)

### 6.11 ws_manager.py — WebSocket per-employee

- `_connections: dict[employee_id, list[WebSocket]]`
- `connect(employee_id, ws)` / `disconnect(employee_id, ws)` / `send_to_employee(employee_id, payload)` / `broadcast_to_admins(payload)`
- `employee_id=0` → admin channel (barcha event'lar)
- Bir xodim bir nechta tab ochishi mumkin — har tab alohida WS

### 6.12 db_settings_service.py + json_settings_service.py

- **DB (`AppSettings` jadval):** `moysklad_token`, `polling_interval`, `admin_notifications_enabled`, `task_departments`, `custom_roles`, `doc_templates_config`
- **JSON (`data/settings.json`):** `telegram_api_id`, `telegram_api_hash`, `telegram_session_string`, `telegram2_*`, `company_name`, `contact_phone`
- Async DB CRUD (`get_setting/set_setting`); Sync file I/O (`get_json_setting/set_json_settings`)

---

## 7. Real-time arxitektura — WebSocket

### `/ws` — sync status

Har 5 soniyada server `sync_status` xabari yuboradi:
```json
{"type":"sync_status","data":{"is_running":true,"last_sync":"2026-05-05T16:00:00+05:00","messages_sent_today":125}}
```

Frontend `syncStore.setStatus(data)` chaqiradi → Header indikator yangilanadi.

### `/ws/tasks/{employee_id}` — per-employee task push

`employee_id=0` → admin (broadcast_to_admins)

**Event'lar:**

| type | qachon | payload |
|---|---|---|
| `new_task` | task yuborilganda | `{task: TaskLog}` |
| `task_answered` | xodim javob berganda | `{task_id, status, response_text, employee_name, ...}` |
| `pending_review` | xodim "Bajardim" deb belgilaganda | `{task_id, employee_id, employee_name, template_title, response_text, checker_id}` |
| `task_reviewed` | tekshiruvchi qaror berganda | `{task_id, status, decision, review_comment, reviewed_by_name, ...}` |

**Frontend:**
- `TasksPage > LogsTab` — admin channel `/ws/tasks/0` — yangi/javob real-time
- `ReviewPage` — `/ws/tasks/{checker_id}` (yoki admin)
- `MyTasksPage` — `/ws/tasks/{employee_id}` — yangi vazifa keldi
- Reconnect: 3s timeout

---

## 8. Background jobs — APScheduler

`task_service.scheduler` (`AsyncIOScheduler`) lifespan'da boshlanadi.

| Job | Trigger | Vazifa |
|---|---|---|
| `main_sync` | IntervalTrigger(30s) | sync_service.sync_all() |
| `task_{template_id}` | CronTrigger(har shablon) | task_service.send_task() |
| `task_deadline_checker` | IntervalTrigger(60s) | task_service.expire_overdue_tasks() |
| `message_queue_worker` | IntervalTrigger(5s) | queue_worker.process_one() |
| `daily_kpi_calc` | CronTrigger(23:30) | kpi_service.calculate_daily_kpi() |
| `telegram_health_check` | IntervalTrigger(5min) | per slot is_user_authorized() |

---

## 9. Telegram integratsiya — 2 akkaunt + flood handling

### Akkaunt strukturasi

Har slot (1 va 2) alohida:
- `api_id`, `api_hash`, `phone` — `data/settings.json`'da
- Session: `data/telegram_session_1.session` va `_2.session` (Telethon SQLite session)
- Yoki `session_string` — settings.json'da (lokal `get_session.py` orqali olingan)

Settings sahifasidan ulanish:
1. `POST /telegram/connect {slot, api_id, api_hash, phone}` → SMS yoki Telegram'ga kod yuboriladi
2. `POST /telegram/verify-code {slot, code, phone_code_hash, password?}` → connected
3. Yoki `POST /telegram/import-session {slot, session_string}` — kod kelmasa

### Flood handling

- Har slot uchun `_flood_until` (Unix timestamp)
- Telegram FloodWaitError keladi → `_flood_until = now + wait_seconds`, `flood_wait.json`'ga yoziladi
- `is_flooded` property True qaytaradi → `send_message` xato qaytaradi
- Flood o'tgach avto-tiklaniadi
- Manual: `POST /api/telegram/clear-flood {slot}`

### Akkaunt tanlash

`telegram_service.send_message(target, text)`:
1. Slot 1 ga urinish (agar connected va not flooded)
2. Xato bo'lsa — slot 2 ga avtomat
3. Ikkalasi ham flood/disconnected → `TelegramSendError` qaytadi
4. queue_worker'ga retry uchun "pending" deb qaytariladi

### Entity cache

- `entity_cache.json` — `{phone: user_id}` mapping
- Telethon `ImportContactsRequest` chaqirig'ini minimize qiladi (har request flood riski)
- Har ulanishdan keyin yangi entity'lar avto-cache qilinadi

---

## 10. MoySklad integratsiya

### Auth

- **Bearer token** (afzal): `Authorization: Bearer eyJ...`
- **Basic fallback**: `login:password` base64 — agar token yo'q

### Polling cycle (har 30s)

1. **Counterparties** (har 10 minutda) — yangi/o'zgargan kontragentlarni `Counterparty` jadvaliga upsert
2. **Demands** (sotuvlar) — har 30s, `_processed_demands` set bilan duplicate filter
3. **Customer orders** — `_processed_orders` dict: `{id: updated_timestamp}` — yangi vs o'zgarish ajratish
4. **Payment-in/out** — to'lovlar
5. **Supplies** — tovar olish (event task uchun trigger)
6. **Sales/Purchase returns** — qaytarishlar
7. **Moves** — omborlar arasi

Har document uchun:
- Agent (xaridor) topish
- Kontragentning balansi MoySklad'dan refresh
- Print template URL'lari (`get_publication_hrefs`)
- Notification matn → `enqueue_message`
- Event task triggers (`large_sale`, `supply`, `kassa_close`)

### Limits

- Polling interval: default 30s, sozlanadigan
- Offset loop limit: 1000 (15+ min data oldin to'xtaydi)
- Timeout: 30s default, 90s `/report/profit/byemployee` uchun

---

## 11. Avtomatlashtirilgan oqimlar (lifecycles)

### 11.1 Vazifa hayot davri

```
                    ┌─────────────────────┐
                    │ Admin TemplateModal │
                    │ "+ Shablon qo'shish"│
                    └──────────┬──────────┘
                               ↓
              ┌──────────────────────────────────┐
              │  POST /api/tasks/templates       │
              │  + APScheduler job (scheduled)   │
              └──────────────────────────────────┘
                               ↓
                    ┌─────────────────────┐
                    │ Trigger ishga tushdi│
                    │ (cron / event /     │
                    │  manual / chain)    │
                    └──────────┬──────────┘
                               ↓
              ┌──────────────────────────────────┐
              │  task_service.send_task()        │
              │  Per target xodim:               │
              │    1. telegram_service.send()    │
              │    2. TaskLog yaratish           │
              │       (status=sent, deadline_at) │
              │       checker_id = template'dan  │
              │    3. WS broadcast: new_task     │
              └──────────────────────────────────┘
                               ↓
                ┌──────────────┴──────────────┐
                │                             │
       ┌────────────────┐         ┌──────────────────┐
       │ Xodim Telegram │         │ Deadline o'tdi    │
       │ orqali javob   │         │ (60s checker job) │
       │ beradi         │         │                  │
       └───────┬────────┘         └────────┬─────────┘
               ↓                            ↓
   ┌───────────────────────┐    ┌───────────────────┐
   │ PATCH /logs/{id}/     │    │ status=answered_no│
   │ answer                │    │ + auto fine       │
   │ {status, response}    │    │ + admin notify    │
   └───────────┬───────────┘    └───────────────────┘
               ↓
   ┌──────────────────────────────────────────────┐
   │  Checker_id bormi?                            │
   ├──────────────────────────────────────────────┤
   │ YES: status="pending_review"                  │
   │      WS broadcast: pending_review (checker'ga)│
   │      Admin notify: YO'Q                       │
   │      Bonus/jarima: YO'Q (hali)                │
   │                                               │
   │ NO:  status="answered_yes/no/text"            │
   │      Auto-bonus (agar yes/text + reward)     │
   │      Auto-fine (agar no + fine)              │
   │      Admin notify: combined message           │
   │      Xodimga Telegram: outcome                │
   │      WS broadcast: task_answered              │
   │      Chain trigger: depends_on templates      │
   └──────────────────────────────────────────────┘
               ↓ (agar pending_review)
   ┌───────────────────────────────────────────┐
   │ Tekshiruvchi (admin yoki is_checker xodim)│
   │ /review sahifasida ko'radi                │
   │ ✅ Tasdiqlayman / ❌ Rad qilaman            │
   └─────────────────┬─────────────────────────┘
                     ↓
   ┌──────────────────────────────────────────────┐
   │ PATCH /logs/{id}/review                      │
   │ {decision, comment?}                          │
   ├──────────────────────────────────────────────┤
   │ approve → status="answered_yes/text"         │
   │           + auto-bonus (agar reward)         │
   │ reject  → status="answered_no"                │
   │           + auto-fine (agar fine)            │
   │ Both:    + reviewed_by_name, review_comment  │
   │          + admin notify (combined)           │
   │          + xodimga Telegram outcome          │
   │          + WS broadcast: task_reviewed       │
   └──────────────────────────────────────────────┘
```

### 11.2 Bonus/jarima manbalari

| Source | Qachon |
|---|---|
| `manual` | Admin OylikPage'dan qo'lda yozadi |
| `rule` | Qoida orqali (RulesTab) |
| `auto_task_reward` | Vazifa "Ha"/"Text" javob (checker yo'q) |
| `auto_task_fine` | Vazifa "Yo'q" javob (checker yo'q) |
| `auto_expire_fine` | Vaqt tugadi (deadline o'tdi) |

Combined Telegram xabar (admin'ga):
```
✅ *Vazifa bajarildi → Bonus*

📋 Kassa yopildimi?
👤 Kamoliddin
💬 Yopildi
💰 Bonus: 50 000 so'm
🕐 03-05-2026 21:00
```

### 11.3 KPI hisoblash

```
23:30 cron → calculate_daily_kpi()
   ↓
Har SalaryConfig (xodim):
   ↓
moysklad_service._fetch_monthly_sales(employee.moysklad_agent_id)
   ↓
Personal sales + total sales
   ↓
achievement % = personal / monthly_target * 100
   ↓
tier lookup: kpi_tiers JSON ([{min:100,payout:100},{min:90,payout:80}])
   ↓
earned = monthly_kpi_budget * payout%
   ↓
KpiDailyLog upsert (employee, date, source="auto", earned, achievement%, ...)
   ↓
Oylik xulosasi yangilanadi (HisobTab + Xulosa tab'da ko'rinadi)
```

### 11.4 Xabar yuborish (queue)

```
sync_service / task_service / API
   ↓
notification_service.enqueue_message(recipient, text, priority, source, ...)
   ↓
MessageQueue insert (status=pending, attempts=0)
   ↓
queue_worker every 5s:
   ├─ oldest pending OR next_retry_at <= now
   ├─ telegram_service.send_message()
   ├─ Success → MessageQueue.status=sent, MessageLog.status=sent
   ├─ Flood → worker.pause(min), MessageQueue.status=pending
   └─ Other error:
       ├─ "topilmadi" → status=failed (permanent)
       └─ retry: status=retry, next_retry_at = now + (30/90/270s)
           after 3 attempts → failed
```

### 11.5 Davomat oqimi

```
Admin "Kelishni belgilash" → CheckInModal → xodim tanlash
   ↓
POST /api/attendance/check-in {employee_id}
   ↓
Attendance row insert (check_in_time = now)
   ↓
Telegram admin'iga: "✅ {Ism} ishga keldi 🕐 16:46"
   ↓
... vaqt o'tadi ...
   ↓
Admin "Ketishni belgilash" → POST /api/attendance/{id}/check-out {}
   ↓
check_out_time = now
   ↓
"Ishlagan vaqt: 9 soat 19 daqiqa" duration UI'da
   ↓
EditModal (✏️) — agar noto'g'ri bo'lsa, vaqtni qo'lda tuzatish
   ↓
PATCH /api/attendance/{id} {check_in_time?, check_out_time?, clear_check_out?}
```

---

## 12. DB modellari va munosabatlar

### Asosiy jadvallar

```
User                          AppSettings
├ id                          ├ key (unique)
├ username (unique)           └ value (JSON yoki string)
├ hashed_password
└ is_admin                    Counterparty
                              ├ id (MoySklad UUID)
Employee                      ├ name
├ id                          ├ telegram_phone, telegram_username, telegram_chat_id
├ name                        ├ usta_telegram_phone (boss aloqa)
├ phone                       ├ moysklad_id, balance
├ telegram_phone              └ notifications_enabled
├ role (comma-separated)
├ department                  TaskTemplate
├ base_salary                 ├ id
├ is_active                   ├ title, description
├ is_checker                  ├ employee_id (FK Employee)  ─┐
├ moysklad_agent_id           ├ assigned_role               │ XOR
├ username (login)            ├ trigger_type (manual/scheduled/event)
└ hashed_password             ├ schedule_time (HH:MM)
                              ├ schedule_days (all|1,2|monthly:N)
EmployeePermission            ├ event_type, large_sale_threshold
├ employee_id (FK)            ├ response_type (none/yes_no/text)
├ permission                  ├ deadline_minutes
└ access_level                ├ reward_amount, fine_amount
                              ├ checker_id (FK Employee, nullable)
Attendance                    ├ depends_on_template_id (self FK)
├ id                          ├ department, priority
├ employee_id (FK)            └ is_active
├ employee_name (denorm)
├ date                        TaskLog
├ check_in_time               ├ id
├ check_out_time              ├ template_id (FK)
└ notes                       ├ template_title, employee_name (denorm)
                              ├ employee_id (FK)
MessageLog                    ├ telegram_target, message_text
├ id                          ├ response_type, response_text
├ counterparty_id, name       ├ status (sent/pending_review/answered_yes/no/text/failed)
├ message_type                ├ sent_at, answered_at, deadline_at
├ message_text                ├ checker_id (FK)
├ status                      ├ review_comment, reviewed_by_name, reviewed_at
├ error_message               └ created_at
└ created_at
                              MessageQueue (worker)
ActivityLog                   ├ id
├ user_name, user_role        ├ recipient, message
├ action, module              ├ priority (1-9)
├ entity_type, entity_id      ├ status (pending/sending/sent/retry/failed)
├ entity_title                ├ attempts, max_attempts (=3)
├ changes (JSON)              ├ next_retry_at, error
└ created_at                  ├ source, message_log_id
                              └ created_at, sent_at

BonusFineRule                 BonusFineLog
├ id                          ├ id
├ type (bonus|fine)           ├ rule_id (FK, nullable)
├ title, description          ├ employee_id (FK)
├ amount                      ├ employee_name (denorm)
└ role                        ├ type (bonus|fine)
                              ├ title, amount, note
                              └ created_at

SalaryConfig                  KpiTemplate
├ employee_id (FK)            ├ id
├ template_id (FK KpiTmpl)    ├ name, role
├ fix_weight, kpi_weight,     └ is_active
│ bonus_weight                
├ monthly_sales_target        KpiSection
├ monthly_kpi_budget          ├ template_id (FK)
├ commission_percent          ├ name (FIX/KPI/BONUS)
└ kpi_tiers (JSON)            └ weight

KpiDailyLog                   KpiCondition
├ employee_id (FK)            ├ section_id (FK)
├ date                        ├ metric, label
├ source (auto|manual)        ├ weight, is_auto
├ personal_sales              └ checker_id (FK Employee)
├ total_sales
├ achievement_percent         KpiMonthlyScore
├ payout_percent              ├ employee_id (FK)
└ earned_amount               ├ period (YYYY-MM)
                              ├ metric, label, section
                              ├ weight, is_auto
                              ├ percent (0-100)
                              └ checker_id (FK)

DocumentTemplate (config)     SalaryReport
└ AppSettings JSON keys:      ├ employee_id (FK)
  doc_templates_config        ├ period (YYYY-MM)
  doc_templates_cache         └ summary (JSON)
```

### Asosiy munosabatlar

- **Employee → TaskTemplate (employee_id)** — vazifa kimga
- **Employee → TaskTemplate (checker_id)** — vazifani kim tekshiradi
- **TaskTemplate → TaskTemplate (depends_on_template_id)** — zanjir
- **TaskLog ← TaskTemplate** — har log bir shablondan
- **TaskLog ← BonusFineLog** (note orqali link, FK emas) — auto-bonus/fine vazifa #ID dan
- **Employee → SalaryConfig (1:1)** — oylik konfiguratsiyasi
- **SalaryConfig → KpiTemplate** — qaysi shablon ishlatilsin
- **KpiTemplate → KpiSection → KpiCondition** — KPI strukturasi
- **EmployeePermission ← Employee** — per-page huquqlar

---

## 13. Production deploy

### Server konfiguratsiyasi

- **VPS:** 167.86.95.237, Ubuntu 24.04
- **Domain:** moy.biznesjon.uz (Certbot SSL avto-renew)
- **Working dir:** `/var/www/moy/`
- **Data dir:** `/var/www/moy/data/` (DB, sessions, settings.json — backup uchun alohida)

### systemd service

`/etc/systemd/system/moysklad.service`:
```ini
[Service]
WorkingDirectory=/var/www/moy
ExecStart=/var/www/moy/venv/bin/uvicorn backend.app.main:app --host 0.0.0.0 --port 8001
Restart=always
```

**Qayta yuklash:** `systemctl restart moysklad.service` — har deploy hook'dan.

### Nginx

`/etc/nginx/sites-enabled/moy.biznesjon.uz`:
- `location /api/ → 127.0.0.1:8001` (proxy)
- `location /ws → 127.0.0.1:8001` (WebSocket upgrade)
- `location / → /var/www/moy/frontend/dist` (SPA fallback)
- **`location = /index.html`** — `Cache-Control: no-store` (eski JS keshlanmaydi)
- `location ~* \.(js|css|svg|...)$` — `expires 1y, immutable` (hash bilan)

### Git deploy

- **Bare repo:** `/var/www/moy.git`
- **post-receive hook** (`hooks/post-receive`):
  ```bash
  git checkout -f main → /var/www/moy
  cd frontend && npm install --silent && npm run build
  systemctl restart moysklad.service
  curl health check (5 urinish)
  ```
- **Lokal push:** `git push deploy main` → hook avto

### Backup strategiyasi

- `/var/www/moy/data/` — DB + sessions + settings.json (separate volume yoki rsync har kuni)
- `/var/www/moy.bak-YYYY-MM-DD/` — major deploy oldidan to'liq snapshot

---

## 14. Boshqa loyihaga qo'shish — qadam-ba-qadam

Bu loyihani **boshqa katta loyihaga modul sifatida** qo'shish uchun.

### Qadam 1: Asosiy zaxiralar

Mahalliy yoki external `D:\projects\moysklad` joylash:

```
D:\projects\moysklad\
  ├ backend\
  │   ├ app\
  │   │   ├ models\           — 13 modellar
  │   │   ├ routers\          — 17 routerlar
  │   │   ├ services\         — 14 services
  │   │   ├ schemas\          — Pydantic
  │   │   ├ utils\            — auth, helpers
  │   │   ├ config.py
  │   │   ├ database.py
  │   │   └ main.py
  │   ├ tests\                — 209 testlar
  │   ├ requirements.txt
  │   └ Dockerfile (lokal dev uchun)
  ├ frontend\
  │   ├ src\
  │   │   ├ pages\            — 14 sahifa
  │   │   ├ components\
  │   │   │   └ layout\       — Sidebar, Header, Layout
  │   │   ├ services\         — api.js (axios)
  │   │   ├ store\            — Zustand stores
  │   │   ├ utils\            — dateUtils
  │   │   └ App.jsx           — routing
  │   ├ package.json
  │   └ vite.config.js
  ├ docs\                     — bu fayl + spec/plan
  └ .gitignore
```

### Qadam 2: Modul integratsiyasi (parent loyihaga)

**Frontend tarafida** ikki yondashuv:
1. **Iframe** (eng oson) — modulni alohida URL'da deploy qilib, parent SPA ichida `<iframe>` orqali ko'rsatish
2. **Sub-route va shared auth** — parent loyiha React Router ichida `/moysklad/*` route, modul build artifact'ini ichkariga qo'yish

**Backend tarafida**:
1. **Standalone API server** — moduli o'z portida (8001), parent uning endpoint'lariga proxy yoki to'g'ridan chaqiradi
2. **Mounted FastAPI** — parent FastAPI app'ga `app.mount("/moysklad", moysklad_app)` orqali ulash

### Qadam 3: Bog'liqlik nuqtalari (bilishingiz kerak)

**Tashqi servislar:**
- MoySklad API (https://api.moysklad.ru) — token kerak
- Telegram MTProto (api.telegram.org) — api_id, api_hash, telefon, kod
- Telegram Bot API — BotFather'dan token, admin kanaliga bot qo'shish

**Local fayllar (data dir):**
- `app.db` — SQLite
- `telegram_session_1.session`, `_2.session` — Telethon
- `settings.json` — credentials
- `entity_cache.json`, `flood_wait.json`

**Background processes:**
- 5 ta APScheduler job (sync 30s, KPI 23:30, queue 5s, deadline 60s, telegram health 5min) — modul start bo'lganda avto-yoqiladi (lifespan)

### Qadam 4: Auth integratsiyasi

Parent loyiha o'z auth tizimi bo'lsa:
1. Modul `Authorization: Bearer ...` headerini qabul qiladi
2. Parent token'ini decode qilish — modul `auth.py` ni o'zgartirish
3. Yoki SSO orqali — parent auth → JWT → modul accept

User mapping:
- Parent `User` ID → modul `Employee` ID (mapping table)
- Yoki har request'da username → Employee lookup

### Qadam 5: Permission sintezi

Parent loyiha permission tizimi bilan moslash:
- Modul `EmployeePermission` jadvalini **parent permission'ga ko'chirish**
- Yoki middleware orqali parent'dan tekshirish
- Frontend Sidebar — parent navigation ichida ko'rsatish

### Qadam 6: DB integratsiyasi

**Variant A** — Modul o'z DB'ni saqlab qoladi (SQLite):
- Eng oson, lekin ma'lumotlar parent bilan integratsiya qilinmagan
- ID konflikt yo'q, lekin "user X" parent va modulda alohida bo'lishi mumkin

**Variant B** — Postgres'ga migratsiya + parent schema'ga qo'shish:
- Konfliktdan saqlash uchun prefix: `moysklad_employee`, `moysklad_task_log`, ...
- Foreign key parent `users` jadvaliga
- Migratsiya skript yozilishi kerak (data export → import)

### Qadam 7: Real-time (WebSocket)

- Modul `/ws` va `/ws/tasks/{id}` endpoint'lari
- Parent loyiha WebSocket gateway'i bo'lsa, proxy orqali pass-through
- Yoki modul WS'ni alohida portda ochib, frontend to'g'ridan ulanishi

### Qadam 8: UI integratsiya

**Sidebar:**
- Parent loyiha sidebar'ida "MoySklad ERP" submenu
- Klikda modul iframe yoki sub-route ochiladi

**Theme:**
- Modul Tailwind primary rangi parent bilan moslash (config'da)
- Dark mode parent themeStore bilan sinxronlash

**Notifications (Toast):**
- Modul o'z `react-hot-toast` ishlatadi — parent bilan ziddiyat bo'lmasligi uchun toaster instance'ini share qilish

### Qadam 9: Testing

- Backend testlar (`pytest`) — 209 ta, parent CI'ga qo'shish
- Frontend smoke test — sahifalar ochilishi
- Integration test — login → vazifa yaratish → Telegram yuborish (mock)

### Qadam 10: Production deploy

- systemd service yangi parent server'da
- Nginx config — sub-path `/moysklad/api` proxy
- Bare git repo + post-receive hook (yoki CI/CD pipeline)
- Backup strategiyasi data dir uchun

---

## XULOSA

**Loyiha 14 sahifa, 17 router, 14 service, ~25 000 qator kod va to'liq integratsiya tizimi.**

**Asosiy moduli:**
1. **Telegram bildirishnoma** (sync_service + queue_worker + telegram_service) — MoySklad'dan har 30s polling, kontragentlarga avtomat xabar
2. **Vazifalar tizimi** (task_service + admin_notifier + ws_manager) — admin vazifa yaratadi, xodim Telegram orqali oladi va javob beradi, tekshiruvchi tasdiqlaydi, bonus/jarima avtomat
3. **KPI + Oylik** (kpi_service + bonus_fine + salary) — kunlik MoySklad savdo'ga asoslangan KPI, oylik xulosasi
4. **Davomat** (attendance) — kelish/ketish + Telegram admin notify
5. **Permission tizimi** (employee + employee_permission) — per-sahifa role-based access

**Background tizim doim ishlab turadi** — APScheduler 5 ta job (sync, queue, deadline, KPI, telegram health). Foydalanuvchi sahifa ochmasa ham, MoySklad → Telegram pipeline ishlamoqda.

**Bog'liqlik joylari muhim:**
- `Employee.telegram_phone` — vazifa va davomat xabarlari shu raqamga
- `Employee.is_checker` — vazifa shabloni'da tekshiruvchi sifatida tanlash uchun
- `Employee.moysklad_agent_id` — KPI hisoblash uchun MoySklad agent bilan link
- `TaskTemplate.checker_id` → Employee — 4-ko'z tasdiqlash oqimi
- `BonusFineLog` — vazifa #ID dan auto, OylikPage'da display
- `MessageLog` ↔ `MessageQueue` — har xabar uchun ikkita yozuv (history + queue)

**Vaqt zonasi qoidasi:** Server lokal +05 (Asia/Tashkent), backend `_to_iso()` helper TZ marker qo'shadi, frontend `dateUtils.js` Intl.DateTimeFormat bilan `Asia/Tashkent` da ko'rsatadi. Browser TZ qanday bo'lsa ham fyrki.

**Production stabil:** 209 backend test, systemd service, Nginx + Certbot, git-based deploy bare repo + post-receive hook (build + restart avto), index.html no-cache.

---

**Hujjat oxiri.** Bu butun tizimning to'liq nazariy xaritasi. Boshqa loyihaga modul sifatida qo'shish jarayonida har sahifa, har endpoint, har bog'liqlikni shu yerdan topishingiz mumkin.
