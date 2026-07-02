Barcha kerakli fayllarni to'liq o'qib chiqdim. Endi tahlil natijasini batafsil strukturali markdown sifatida taqdim etaman.

---

# MANBA Loyiha: Funksional Spetsifikatsiya (Moliya + Sozlama + Shell)

> Stack: React 18 + Vite + react-router-dom v6 (BrowserRouter, future flags `v7_startTransition`, `v7_relativeSplatPath`) + Tailwind + Zustand (+ persist) + axios + react-hot-toast + lucide-react + clsx + date-fns + recharts. Til: o'zbek (lotin). Tema: light/dark (`dark` class `html` elementida).

---

## 0. GLOBAL INFRASTRUKTURA

### 0.1. API klient (`services/api.js`)
Axios instance: `baseURL: '/api'`, `timeout: 30000` ms. Boshqa hech qanday interceptor yo'q. Auth token `api.defaults.headers.common['Authorization'] = 'Bearer <token>'` orqali qo'lda o'rnatiladi (authStore).

### 0.2. Entry point (`main.jsx`)
`ReactDOM.createRoot(#root)` → `<BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>` ichida `<App />` + `<Toaster position="top-right" toastOptions={{ style: { background: '#363636', color: '#fff' } }} />`.

### 0.3. Global CSS klasslar (`index.css`) — 1:1 qayta qurish uchun MAJBURIY
Bular butun UI bo'ylab ishlatiladi. `@layer components`:

- **`.card`**: `bg-white dark:bg-gray-800/80 rounded-2xl shadow-card border border-gray-100 dark:border-gray-700/60`
- **`.card-md`**: yuqoridagidek, lekin `shadow-card-md`
- **`.btn-primary`**: `inline-flex items-center justify-center gap-2 bg-primary-600 hover:bg-primary-700 active:bg-primary-800 text-white text-sm font-medium px-4 py-2 rounded-xl shadow-sm hover:shadow-md transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none`
- **`.btn-secondary`**: `bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 ... border border-gray-200 dark:border-gray-600 ... rounded-xl px-4 py-2`
- **`.btn-danger`**: `bg-red-600 hover:bg-red-700 active:bg-red-800 text-white ... px-4 py-2 rounded-xl`
- **`.btn-ghost`**: `text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700/60 ... px-3 py-2 rounded-xl`
- **`.input`**: `w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-xl px-3.5 py-2.5 text-sm text-gray-900 dark:text-gray-100 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500/30 focus:border-primary-400 transition-all duration-150 shadow-sm`. Disabled: `opacity-60 cursor-not-allowed bg-gray-50 dark:bg-gray-700`
- **`.label`**: `block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1.5`
- **`.badge`** + variantlar: `.badge-green` (emerald-50/700), `.badge-red`, `.badge-yellow` (amber), `.badge-blue`, `.badge-purple` (violet), `.badge-gray`. Asos: `inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium`
- Animatsiyalar: `.animate-in` → `slideUp 0.2s ease-out both` (opacity 0→1, translateY 6px→0). Kod ichida ham `animate-fade-in`, `animate-slide-up`, `animate-card-enter` ishlatiladi (Tailwind config'da — bu fayl zonamda emas, lekin nomlari shu).
- Scrollbar: 5px, thumb `#d1d5db` light / `#374151` dark, radius 99px. `scrollbar-none` utility (config'da) — gorizontal scroll tab barlarda.
- Maxsus rang nomlari: `primary-*` (asosiy brend), `sidebar`, `sidebar-border`, `sidebar-text`, `sidebar-muted`, `shadow-glow`, `shadow-card` — Tailwind config'da aniqlangan (zonamda emas, lekin nomlari shu, qayta qurishda mos rang palitra kerak).

---

## 1. SHELL: ROUTING (`App.jsx`)

### 1.1. Tuzilma
`<Routes>`:
- **Public**: `/login` → `<LoginPage />`
- **Protected**: `/` → `<Layout />` (parent route, Layout `<Outlet/>` orqali bolalarni render qiladi):
  - `index` (ya'ni `/`) → `<HomeRedirect />`
  - `dashboard` → `<DashboardPage />`
  - `messages` → `<MessagesPage />`
  - `settings` → `<SettingsPage />`
  - `reports` → `<ReportsPage />`
  - `employees` → `<EmployeesPage />`
  - `tasks` → `<TasksPage />`
  - `attendance` → `<AttendancePage />`
  - `my-tasks` → `<MyTasksPage />`
  - `review` → `<ReviewPage />`
  - `oylik` → `<OylikPage />`
- **Catch-all**: `path="*"` → `<Navigate to="/" replace />`

### 1.2. YASHIRIN ROUTE'lar (kommentariya qilingan, fayl mavjud, App.jsx'da ishlatilmaydi)
- `counterparties` → CounterpartiesPage `// vaqtincha yashirilgan`
- `demands` → DemandsPage
- `payments` → PaymentsPage
- `orders` → OrdersPage
- `kassa` → KassaPage

Import'lari ham kommentariyada. **MUHIM**: bu sahifalarga UI orqali hech qanday yo'l yo'q (Sidebar'da ham yo'q). Faqat fayllar saqlangan.

### 1.3. `HomeRedirect()` mantiqi (AYNAN)
```
user = useAuthStore(s => s.user)
token = useAuthStore(s => s.token)
if (!token) → <Navigate to="/login" replace />
else → <Navigate to={user?.is_admin ? '/dashboard' : '/my-tasks'} replace />
```
**Permission/AdminRoute komponenti YO'Q.** Hech qanday `<AdminRoute>` yoki per-route ruxsat tekshiruvi yo'q. Yagona himoya: `Layout` token yo'qligini tekshiradi. Rolga qarab filtrlash faqat **Sidebar menyusi** va **HomeRedirect** darajasida — ya'ni xodim `/employees` URL'ni qo'lda yozsa, frontend uni to'smaydi (backend himoyaga tayanadi).

### 1.4. `App()` komponenti
`darkMode` ni `useThemeStore`'dan oladi. `useEffect([darkMode])`: agar `darkMode` → `document.documentElement.classList.add('dark')`, aks holda `.remove('dark')`.

---

## 2. SHELL: STORE'lar

### 2.1. `authStore.js` (Zustand + persist)
**State shakli**: `{ token: null, user: null, isLoading: false, error: null }`

**`user` obyekti shakli** (login muvaffaqiyatida quriladi):
```js
{
  username: data.name || username,
  name:     data.name || username,
  role:     data.role || 'admin',
  employee_id: data.employee_id ?? null,
  is_admin: (data.role === 'admin'),     // STRICT: faqat role==='admin'
  is_checker: !!data.is_checker,         // "Tekshiruv" menyu uchun
}
```
> Diqqat: `permissions` maydoni YO'Q (topshiriqda so'ralgan, lekin kodda mavjud emas). Faqat shu 6 maydon.

**`login(username, password)`**:
1. `set({ isLoading: true, error: null })`
2. `POST /auth/login` body `{ username, password }`
3. `data.access_token` ni oladi → `api.defaults.headers.common['Authorization'] = 'Bearer ' + access_token`
4. yuqoridagi `user` obyektini quradi → `set({ token: access_token, user, isLoading: false })` → `return true`
5. Xato: `set({ error: err.response?.data?.detail || "Login yoki parol noto'g'ri", isLoading: false })` → `return false`

**`logout()`**: `delete api.defaults.headers.common['Authorization']`; `set({ token: null, user: null })`

**`initToken()`**: agar `get().token` bor bo'lsa, `api.defaults.headers.common['Authorization']` ni o'rnatadi.

**Persist konfiguratsiyasi**:
- `name: 'auth-storage'` (localStorage kaliti)
- `partialize`: faqat `{ token, user }` saqlanadi
- `onRehydrateStorage`: agar saqlangan `token === 'no-auth-token'` (eski dummy) bo'lsa — `token=null, user=null` (legacy tozalash). Aks holda token bor bo'lsa, Authorization header'ni tiklaydi.

### 2.2. `syncStore.js` (Zustand, persist YO'Q)
**State**: `{ isRunning: false, lastSync: null, messagesSentToday: 0, moyskladConnected: false, telegramConnected: false }`
- `setStatus(data)`: `isRunning = data.is_running`, `lastSync = data.last_sync`, `messagesSentToday = data.messages_sent_today || 0`
- `setMoySkladConnected(val)`, `setTelegramConnected(val)`

### 2.3. `themeStore.js` (Zustand + persist)
**State**: `{ darkMode: false }`; `toggleDarkMode()` → `darkMode: !darkMode`. Persist `name: 'theme-storage'` (butun state saqlanadi).

---

## 3. SHELL: LAYOUT (`Layout.jsx`)

- `useState sidebarCollapsed = false`
- `{ token, initToken } = useAuthStore()`
- `useEffect([])`: `initToken()` (mount'da bir marta)
- **Himoya**: `if (!token) return <Navigate to="/login" replace />`
- Tuzilma: `div.flex.h-screen.overflow-hidden.bg-slate-50.dark:bg-gray-950` → `<Sidebar collapsed={sidebarCollapsed} />` + `div.flex-1.flex.flex-col` → `<Header onMenuToggle={() => setSidebarCollapsed(!sidebarCollapsed)} />` + `<main className="flex-1 overflow-y-auto p-6 space-y-0"><Outlet /></main>`

---

## 4. SHELL: SIDEBAR (`Sidebar.jsx`)

### 4.1. Rol aniqlash
```js
isAdmin = !user || user.is_admin || user.role === 'admin'
```
> Diqqat: `user` yo'q (null) bo'lsa ham `isAdmin = true` (fallback).

### 4.2. Menyu massivlari (AYNAN)

**Agar `isAdmin === true`**, 3 bo'lim ko'rsatiladi:

1. **"Asosiy"** (`mainNavItems`):
   - `/dashboard` — icon `LayoutDashboard` — "Dashboard"
   - `/messages` — icon `MessageSquare` — "Xabarlar"
   - `/reports` — icon `BarChart3` — "Hisobotlar"

2. **"Boshqaruv"** (`employeeManagementItems`):
   - `/employees` — `UserCog` — "Xodimlar"
   - `/tasks` — `ClipboardList` — "Vazifalar"
   - `// /kassa` — `Banknote` — "Kassa" (KOMMENTIYADA, ko'rinmaydi)
   - `/attendance` — `CalendarCheck` — "Davomat"
   - `/oylik` — `Award` — "Oylik"
   - Izoh kommentariya: admin uchun "Tekshiruv" ko'rsatilmaydi — admin Vazifa tarixidagi indikator orqali pending_review'ni ko'radi/tasdiqlaydi.

3. **"Tizim"** (`settingsNavItems`):
   - `/settings` — `Settings` — "Sozlamalar"

**Agar `isAdmin === false`** (oddiy xodim), 1 bo'lim:

- **"Menyu"** (`employeeNavItems`):
  - `/my-tasks` — `CheckSquare` — "Mening Vazifalarim"
  - `/attendance` — `CalendarCheck` — "Davomat"
- **Qo'shimcha shart**: agar `user?.is_checker` truthy → qo'shimcha element `{ to: '/review', icon: ShieldCheck, label: 'Tekshiruv' }` (`reviewNavItem`)

### 4.3. `ROLE_LABELS` (footer badge uchun)
`{ admin: 'Administrator', cashier: 'Kassir', warehouse: 'Omborchi', staff: 'Xodim' }`

### 4.4. Vizual tafsilotlar
- Width: `collapsed ? 'w-16' : 'w-60'`, `transition-all duration-300 ease-in-out`. Klass `bg-sidebar border-r border-sidebar-border`.
- Logo blok (h-16): gradient kvadrat (`from-primary-500 to-primary-700 rounded-xl`, `Zap` icon `strokeWidth={2.5}`). Collapsed emas bo'lsa: "MoySklad" (bold) + `user?.name || 'Admin'` (truncate max-w-130px).
- `SectionLabel`: collapsed bo'lsa faqat `border-t border-sidebar-border/60`; aks holda `<p className="px-3 pt-4 pb-1 text-[10px] font-bold uppercase tracking-widest text-slate-500">{label}</p>`
- `NavItem`: `NavLink` + `clsx`. Active: `bg-primary-600/90 text-white shadow-sm`; inactive: `text-sidebar-text hover:bg-sidebar-muted hover:text-slate-200`. Icon `w-4 h-4`, inactive'da `group-hover:scale-110`. Collapsed bo'lsa label o'rniga hover tooltip (absolute, `bg-gray-900 text-white text-xs`, o'q bilan).
- Footer (user bor bo'lsa): collapsed → kichik kvadrat ichida `(user.role || 'A')[0]`; aks holda avatar + `user.name || 'Admin'` + `ROLE_LABELS[user.role] || user.role`.

---

## 5. SHELL: HEADER (`Header.jsx`)

- Store'lar: themeStore (`darkMode, toggleDarkMode`), syncStore (`isRunning, lastSync, telegramConnected, setStatus, setTelegramConnected`), authStore (`logout, user`). `useNavigate`.
- **WebSocket** (`useEffect([])`): `wsRef`. `connectWS()`: protocol `wss:`/`ws:` (sahifa protokoliga qarab), URL `${protocol}//${window.location.host}/ws`. `onmessage`: JSON parse, agar `data.type === 'sync_status'` → `setStatus(data.data)`. `onclose`: `setTimeout(connectWS, 3000)` (qayta ulanish). Mount'da ham `GET /telegram/status` → `setTelegramConnected(r.data.connected)`. Unmount: `wsRef.current?.close()`.
- **`handleSyncNow`**: `POST /moysklad/sync-now` → toast success "Sinxronizatsiya boshlandi" / error "Sinxronizatsiya xatosi".
- Tuzilma (h-16): Chap: menu toggle tugma (`Menu` icon, `onMenuToggle`); `lastSync` bor bo'lsa yashil nuqta + `format(new Date(lastSync), 'HH:mm:ss')` (date-fns). O'ng:
  - **MoySklad pill**: `isRunning` → emerald (`animate-pulse` nuqta) / gray. Matn "MoySklad".
  - **Telegram pill**: `telegramConnected` → sky + `Wifi` icon / gray + `WifiOff`. Matn "Telegram".
  - Sync tugma: `RefreshCw` (`isRunning && animate-spin`), title "Hozir sync".
  - Dark mode tugma: `darkMode ? Sun : Moon`.
  - User blok: `user?.name || 'Admin'` + `user?.role || 'admin'` (capitalize). Logout tugma (`LogOut` icon): `onClick={() => { logout(); navigate('/login', { replace: true }) }}`, title `Chiqish (${user?.name || ''})`.

---

## 6. LOGIN SAHIFASI (`LoginPage.jsx`)

### 6.1. State
`username=''`, `password=''`, `showPw=false`. authStore'dan `{ login, isLoading, error, token, user, initToken }`. `useNavigate`.

### 6.2. Redirect mantiqi (`useEffect([token, user])`)
1. `initToken()` chaqiriladi
2. agar `token && user` → `navigate(user.is_admin ? '/dashboard' : '/my-tasks', { replace: true })`

### 6.3. `handleSubmit(e)`
1. `e.preventDefault()`
2. Validatsiya: `if (!username.trim() || !password.trim())` → `toast.error("Login va parolni kiriting")`, return
3. `success = await login(username.trim(), password)` — diqqat: parol `.trim()` QILINMAYDI
4. agar `success`: `u = useAuthStore.getState().user`; `toast.success("Xush kelibsiz, " + (u?.name || username) + "!")`; `navigate(u?.is_admin ? '/dashboard' : '/my-tasks', { replace: true })`

### 6.4. Layout (split-screen)
- Chap panel (faqat `lg:` da, `lg:w-1/2`): gradient `from-primary-950 via-primary-900 to-slate-900`, dekorativ doiralar, `Zap` logo (w-20 h-20), "MoySklad" h1, "Telegram Integration" subtitle, 3 ta feature ro'yxati: "Real-time savdo bildirishnomalar", "Xodimlar boshqaruvi va vazifalar", "Kassa va davomat nazorati".
- O'ng (form, `max-w-sm`): mobil logo, "Xush kelibsiz" h2 + "Davom etish uchun tizimga kiring".
- Form: 
  - "Foydalanuvchi nomi" label + text input (placeholder "admin", `autoComplete="username"`, `autoFocus`, `required`)
  - "Parol" label + input `type={showPw ? 'text' : 'password'}` (`pr-11`, placeholder "••••••••", `autoComplete="current-password"`, `required`) + ko'z tugmasi (`Eye`/`EyeOff`) o'ngda absolute
  - `error` bor bo'lsa: qizil quti (`bg-red-50 ... rounded-xl px-4 py-3`)
  - Submit tugma `btn-primary py-3`: `isLoading` → `Loader2 animate-spin` + "Kirish..."; aks holda "Kirish"
- Pastida: `Default: admin / admin123` (mono).

---

## 7. dateUtils.js — TIMEZONE (AYNAN MUHIM)

`TZ = 'Asia/Tashkent'`

### 7.1. `_parse(iso)`
- `if (!iso) return null`
- `hasOffset = /Z$|[+-]\d{2}:\d{2}$/.test(iso)` — ya'ni string oxirida `Z` YOKI `+HH:MM`/`-HH:MM` borligini tekshiradi
- `str = hasOffset ? iso : iso + '+05:00'` — agar TZ marker yo'q bo'lsa, `+05:00` qo'shadi (server naive UTC+5 yozadi, JS uni UTC deb o'qib 5 soat surib yubormasligi uchun)
- `d = new Date(str)`; `return isNaN(d) ? null : d`

### 7.2. `_parts(d)`
`Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Tashkent', hour12: false, year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit' }).formatToParts(d)`. Qaytaradi: `{ dd, mm, yyyy, hh, min }` (har biri `formatToParts`'dan tegishli `type` value, topilmasa `''`).

### 7.3. Formatlar (har biri `_parse` qaytarmasa `'—'`)
- **`fmtDateTime(iso)`** → `"${dd}.${mm}.${yyyy} ${hh}:${min}"` (masalan `13.03.2026 15:07`)
- **`fmtDateTimeShort(iso)`** → `"${dd}.${mm} ${hh}:${min}"` (`13.03 15:07`)
- **`fmtTime(iso)`** → `"${hh}:${min}"` (`15:07`)
- **`fmtDate(iso)`** → `"${dd}.${mm}.${yyyy}"` (`13.03.2026`)

> Eslatma: OylikPage va KassaPage o'zlarining LOKAL `fmtTime`/`formatDate` funksiyalarini ishlatadi (`toLocaleTimeString`/`toLocaleString('uz-UZ')`) — dateUtils'ni import qilmaydi. Bu farq qayta qurishda saqlanishi kerak (quyida har modalda aniq ko'rsatilgan).

---

## 8. OYLIK SAHIFASI (`OylikPage.jsx`) — ASOSIY MODUL (2945 qator)

### 8.0. Umumiy konstantalar va helperlar

**`ROLES`** massivi (4 element, har birida `value, label, icon, color, headerBg, badge`):
| value | label | icon | badge klassi |
|---|---|---|---|
| `admin` | Bosh admin | `UserCog` | `bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400` |
| `cashier` | Kassir | `Banknote` | blue |
| `warehouse` | Omborxona | `Warehouse` | yellow |
| `staff` | Xodim | `User` | gray |

- **`roleLabel(role)`** = `ROLES.find(r => r.value === role)?.label || role || 'Barchasi'`
- **`fmt(n)`** = `Number(n || 0).toLocaleString('uz-UZ')` — butun sonlarni bo'sh joy bilan formatlash (1 000 000)
- **`SOURCE_LABELS`** = `{ manual: "Qo'lda tasdiqlash", moysklad_sales: 'MoySklad savdo', moysklad_stock: 'MoySklad ombor', auto: 'Avtomatik' }` + `SOURCE_COLORS` (mos ranglar)

**`ModalBackdrop({ children, onClose })`**: `fixed inset-0 z-50 flex items-end sm:items-center justify-center`, ichida `bg-black/50 backdrop-blur-sm animate-fade-in` (onClick=onClose) + content wrapper. Mobil: bottom sheet; desktop: markaz.

### 8.1. Asosiy komponent `OylikPage()` — TAB ARXITEKTURASI

**State**: `tab='hisob'`, `employees=[]`, `rules=[]`, KPI uchun: `kpiTemplates`, `kpiReports`, `kpiConfigs`, `kpiRoles`, `kpiModal=null`, `kpiPeriod=new Date().toISOString().slice(0,7)` (`YYYY-MM`), `shablonTab='templates'`.

**Fetch funksiyalari** (useCallback):
- `fetchEmployees`: `GET /employees/?active_only=true` → `res.data.items || res.data`
- `fetchRules`: `GET /bonus-fine/rules` → `res.data.items || []`
- `fetchKpiTemplates`: `GET /kpi/templates`
- `fetchKpiReports`: `GET /kpi/reports?period={kpiPeriod}`
- `fetchKpiConfigs`: `GET /salary/config`
- `fetchKpiRoles`: `GET /employees/meta/roles`

**Yuklash mantiqi**:
- Mount (`useEffect`): faqat `fetchEmployees()` + `fetchRules()`
- `useEffect([tab, kpiPeriod, ...])`: agar `tab !== 'shablonlar'` → return; aks holda `fetchKpiTemplates() + fetchKpiConfigs() + fetchKpiRoles() + fetchKpiReports()` (lazy load)

**Template/Report handlerlar** (asosiy komponentda):
- `handleDeleteTemplate(t)`: `confirm("${t.name} shablonini o'chirmoqchimisiz?")` → `DELETE /kpi/templates/${t.id}` → toast → fetchKpiTemplates
- `handleDeleteReport(r)`: `confirm("Hisobotni o'chirmoqchimisiz?")` → `DELETE /kpi/reports/${r.id}` → fetchKpiReports
- `handleConfirmReport(reportId)`: `POST /kpi/reports/${reportId}/confirm` → `toast.success("Tasdiqlandi: ${res.data.total_percent}%")` → fetchKpiReports

**`tabs` massivi (6 ta — aniq tartib)**:
| key | label | icon | active rang |
|---|---|---|---|
| `hisob` | Hisob-kitob | `DollarSign` | primary-600 |
| `kpi` | KPI | `Target` | amber-600 |
| `xulosa` | Xulosa | `CircleDollarSign` | — |
| `bonus` | Bonuslar | `TrendingUp` | green-600 |
| `fine` | Jarimalar | `TrendingDown` | red-600 |
| `shablonlar` | Shablonlar | `BarChart3` | — |

> Topshiriqdagi "RulesTab bonus + RulesTab fine + KPI + Konfiguratsiya + Xulosa" — aslida 6 tab: hisob, kpi, xulosa, bonus, fine, shablonlar. "Konfiguratsiya" alohida tab emas — u **KpiTab ichidagi SalaryConfigModal** VA **Shablonlar tabidagi `configs` sub-tab** (SalaryConfigSection) sifatida mavjud.

**Header**: h1 "Oylik" + subtitle "Xodimlar oyligi, bonus va jarimalar hisob-kitobi". Tab bar: gorizontal scroll mobil (`scrollbar-none`), `bg-gray-100 dark:bg-gray-800 rounded-xl p-1`, active `bg-white dark:bg-gray-700 shadow-sm`.

**Tab render**:
- `hisob` → `<HisobTab employees rules onRefresh={fetchEmployees} />`
- `kpi` → `<KpiTab />`
- `xulosa` → `<XulosaTab />`
- `bonus` → `<RulesTab key="bonus" type="bonus" />`
- `fine` → `<RulesTab key="fine" type="fine" />`
- `shablonlar` → maxsus blok (quyida 8.7)

Wrapper: `<div className="animate-fade-in" key={tab}>` — tab o'zgarganda fade animatsiya.

**KPI Modallar** (sahifa darajasida):
- `(kpiModal === 'add-template' || (kpiModal && kpiModal.id && kpiModal.sections))` → `<TemplateModal template={kpiModal === 'add-template' ? null : kpiModal} roles={kpiRoles} onClose onSave={fetchKpiTemplates} />`
- `kpiModal === 'add-report'` → `<ReportModal templates={kpiTemplates} employees={employees} onClose onSave={fetchKpiReports} />`

---

### 8.2. TAB 1 — HisobTab (Hisob-kitob)

**Props**: `{ employees, rules, onRefresh }`

**State**: `summary=[]`, `loading=true`, `salaryModal=null`, `applyModal=null`, `detailModal=null` (`{employee, type}`), `period=30`

**PERIODS konstanta** (period selector pill'lari — AYNAN qiymatlar):
```
[ {value:1, label:'Bugun'}, {value:30, label:'30 kun'}, {value:60, label:'60 kun'}, {value:90, label:'90 kun'} ]
```
> "Bugun" = `value: 1` (1 kun). Default `period=30`.

**`fetchSummary` (useCallback, `[period]`)**: `GET /bonus-fine/summary?days={period}` → `setSummary(res.data.items || [])`. Xato → toast "Yuklanmadi". `useEffect([fetchSummary])` → period o'zgarsa qayta yuklaydi.

**`totals` hisoblash** (`summary.reduce`):
```js
base        = Σ s.base_salary
bonus       = Σ s.total_bonus
fine        = Σ s.total_fine
net         = Σ s.net_salary
today_bonus = Σ (s.today_bonus || 0)
today_fine  = Σ (s.today_fine || 0)
```

**5 STAT KARTA** (`statsCards`, AYNAN qiymatlar):
| # | label | value (formula) | icon | rang |
|---|---|---|---|---|
| 1 | "Jami oylik" | `totals.base` | `Banknote` | gray |
| 2 | "Jami bonus" | `totals.bonus` | `TrendingUp` | green |
| 3 | "Jami jarima" | `totals.fine` | `TrendingDown` | red |
| 4 | "Bugungi" | `totals.today_bonus - totals.today_fine` | `Calendar` | rang: natija `>= 0` ? green : red; iconBg amber |
| 5 | "Jami to'lov" | `totals.net` | `CircleDollarSign` | primary, maxsus `bg-primary-50/50 ring-1 ring-primary-200/50` |

Grid: `grid-cols-2 lg:grid-cols-5`. 5-karta mobil'da `col-span-2 lg:col-span-1` (to'liq kenglik). Qiymat `fmt(s.value)` + "so'm". Yuklanayotganda `Loader2 animate-spin` period selektor yonida.

**JADVAL ustunlari (Desktop, `md:block`)**:
`Xodim | Rol | Oylik | Bonus | Jarima | Bugungi | Jami | Amallar`

Har qator (`summary.map(row)`), `todayNet = (row.today_bonus||0) - (row.today_fine||0)`:
- **Xodim**: `row.employee_name`
- **Rol**: `(row.role || 'staff').split(',').map(...)` — har rol uchun badge (`ROLES.find(r=>r.value===rv)?.badge`), label `roleLabel(rv)`. Ko'p rol vergul bilan.
- **Oylik**: `fmt(row.base_salary)`
- **Bonus**: agar `row.total_bonus > 0` → tugma (yashil, hover:underline) `+{fmt(row.total_bonus)}`, click → `setDetailModal({employee: row, type: 'bonus'})`; aks holda `--`
- **Jarima**: agar `row.total_fine > 0` → tugma (qizil) `-{fmt(row.total_fine)}`, click → detailModal type 'fine'; aks holda `--`
- **Bugungi**: agar `todayNet !== 0` → badge (`todayNet > 0` ? green : red), `todayNet > 0 ? '+'+fmt : fmt`; aks holda `--`
- **Jami**: `fmt(row.net_salary)`, rang `row.net_salary >= 0 ? 'text-gray-900 dark:text-white' : 'text-red-600'`
- **Amallar**: 3 tugma:
  - Bonus (yashil, `TrendingUp`): `setApplyModal({type:'bonus', employee: row})`
  - Jarima (qizil, `TrendingDown`): `setApplyModal({type:'fine', employee: row})`
  - Oylik (gray, `Edit2`): `setSalaryModal(row)`

**Totals qatori** (`bg-gray-50 font-semibold`): "Jami" (colSpan 2) | base | `totals.bonus > 0 ? '+'+fmt : '--'` | `totals.fine > 0 ? '-'+fmt : '--'` | bugungi (delta != 0 ? rangli : '--') | net | bo'sh.

**Mobil kartalar** (`md:hidden`): har xodim alohida `.card`. Yuqori: rol ikonkasi (`roleInfo.headerBg`) + ism + rollar matni + 3 tugma (bonus/jarima/oylik). O'rta: 3 ustunli grid (Oylik / Bonus tugma / Jarima tugma — bonus/fine `disabled={!row.total_X}`, click detailModal). Past: "Jami:" + net + `todayNet !== 0` bo'lsa "bugun ±X" badge. Mobil totals karta ham bor.

**Bo'sh holat**: `Users` icon + "Xodimlar topilmadi" + "Avval Xodimlar sahifasidan xodimlarni qo'shing".

**Modallar** (HisobTab oxirida):
- `salaryModal` → `<SalaryModal employee onClose onSave={() => { fetchSummary(); onRefresh?.() }} />`
- `applyModal` → `<ApplyModal type employees rules preselectedEmployee={applyModal.employee} onClose onSave={fetchSummary} />`
- `detailModal` → `<BonusFineDetailModal employee type period onClose />`

---

### 8.3. MODAL — SalaryModal

**Props**: `{ employee, onClose, onSave }`
**State**: `salary = employee.base_salary || ''`, `saving=false`
**`handleSave`**: `PUT /employees/${employee.employee_id || employee.id}` body `{ base_salary: Number(salary) || 0 }` → toast "Oylik saqlandi" → `onSave()` → `onClose()`. Xato → "Xatolik".
**UI**: `max-w-sm`. Header: "Oylik belgilash" + `employee.employee_name || employee.name`. Bitta input: label "Asosiy oylik (so'm)", `type="number"`, placeholder "5 000 000", `autoFocus`, `text-lg`. Footer: "Saqlash" (`btn-primary flex-1`, saving→Loader2) + "Bekor qilish".

---

### 8.4. MODAL — RuleModal (bonus/jarima qoidasi yaratish/tahrirlash)

**Props**: `{ rule, type, role, onClose, onSave }`. `isEdit = !!rule`. `isBonus = type === 'bonus'`.
**State `form`**: `{ title: rule?.title||'', description: rule?.description||'', amount: rule?.amount||'' }`, `saving=false`
**`handleSave` validatsiya**:
1. `if (!form.title.trim())` → toast "Nomi kiritilmagan", return
2. `if (!form.amount || Number(form.amount) <= 0)` → toast "Summa kiritng", return
3. Payload: `{ type, title: form.title.trim(), description: form.description.trim() || null, amount: Number(form.amount), role }`
4. `isEdit` → `PUT /bonus-fine/rules/${rule.id}` ; aks holda `POST /bonus-fine/rules`
5. toast `isEdit ? 'Yangilandi' : "Qo'shildi"` → onSave → onClose. Xato → "Xatolik".

**UI** (`max-w-md`): Header ikonkasi `isBonus ? TrendingUp (green) : TrendingDown (red)`, title `isEdit ? 'Tahrirlash' : "Yangi " + (isBonus?'bonus':'jarima')`, sub `roleLabel(role)+" uchun"`. 3 input:
- "Vazifa nomi *" (placeholder `isBonus ? 'Rejani bajarish' : 'Kechikib kelish'`, autoFocus)
- "Tavsif (ixtiyoriy)" (placeholder "Qo'shimcha izoh...")
- "Summa (so'm) *" (`type="number"`, placeholder "100 000")
Footer: "Saqlash" tugma rangi `isBonus ? green-600 : red-600`; saving→Loader2; + "Bekor qilish".

---

### 8.5. MODAL — ApplyModal (checklist, kunlik bonus/jarima qo'llash)

**Props**: `{ type, employees, rules, preselectedEmployee, onClose, onSave }`

**Xodim aniqlash**:
```js
empId   = preselectedEmployee?.employee_id || preselectedEmployee?.id
emp     = employees.find(e => e.id === empId) || preselectedEmployee
empName = emp?.name || preselectedEmployee?.employee_name || ''
empRole = emp?.role || preselectedEmployee?.role || ''
empRoles = (empRole || '').split(',').filter(Boolean)   // ko'p rol uchun
```
**Qoida filtri**: `empRules = rules.filter(r => r.type === type && (!r.role || empRoles.includes(r.role)))` — ya'ni roli yo'q (umumiy) yoki xodim rollaridan biriga mos qoidalar.

**State**: `checked={}`, `existingLogs={}` (`{ruleId: logId}`), `loading=true`, `saving=false`

**Mount yuklash** (`useEffect([empId, type])`): `GET /bonus-fine/logs/today/${empId}?type=${type}` → `res.data.items`. Har log uchun `if (log.rule_id)`: `checkedMap[log.rule_id]=true`, `logMap[log.rule_id]=log.id`. → setChecked/setExistingLogs.

**`toggle(ruleId)`**: `setChecked(prev => ({ ...prev, [ruleId]: !prev[ruleId] }))`

**Hisoblash**:
- `checkedRules = empRules.filter(r => checked[r.id])`
- `totalAmount = Σ r.amount` (checkedRules)
- `progress = empRules.length>0 ? (checkedRules.length / empRules.length) * 100 : 0`

**`handleSave` — DIFF MANTIQI (AYNAN)**:
```js
toCreate = checkedRules.filter(r => !existingLogs[r.id])           // belgilangan, lekin log yo'q
toDelete = Object.entries(existingLogs)
            .filter(([ruleId]) => !checked[Number(ruleId)])         // log bor, lekin belgilanmagan
            .map(([, logId]) => logId)
for (rule of toCreate):
   POST /bonus-fine/logs { rule_id: rule.id, employee_id: empId, type, title: rule.title, amount: rule.amount, note: null }
for (logId of toDelete):
   DELETE /bonus-fine/logs/${logId}
if (toCreate.length===0 && toDelete.length===0): toast "O'zgarish yo'q"
else: toast parts.join(', ')  // parts: "+N bonus/jarima", "-N bekor qilindi"
onSave() → onClose()
```

**UI**: To'liq ekran (`fixed inset-0`, NOT ModalBackdrop). Rangli gradient header (`isBonus ? from-green-600 to-emerald-600 : from-red-600 to-rose-600`): title `isBonus ? 'Kunlik Vazifalar' : 'Jarimalar'`, sub `empName — roleLabel(empRole)`. Progress bar: `{checkedRules.length} / {empRules.length} bajarildi` + `{isBonus?'+':'-'}{fmt(totalAmount)} so'm`, bar `width: progress%`.
Body: loading→Loader2; bo'sh→empty state (`isBonus ? ClipboardCheck : FileWarning`, "Bonus vazifalari yo'q"/"Jarima sabablari yo'q", "Avval Bonuslar/Jarimalar tabidan qo'shing"); aks holda checklist — har element tugma: aylana checkbox (belgilangan→`Check` icon, rang green/red), `{idx+1}. {rule.title}` (belgilangan→`line-through`), description, summa badge `{isBonus?'+':'-'}{fmt(rule.amount)}`.
Footer: summary quti (`{checkedRules.length} ta vazifa` + `±{fmt(totalAmount)} so'm`) + "Bekor qilish" + "Saqlash" (rangi type'ga qarab).

---

### 8.6. MODAL — BonusFineDetailModal (bonus/jarima tafsiloti)

**Props**: `{ employee, type, period, onClose }`. `isBonus = type==='bonus'`.

**`BF_SOURCE_LABELS`** (source → label mapping, AYNAN):
```
manual:             "Qo'lda"
rule:               'Qoida'
auto_task_reward:   'Vazifa bajarilgani uchun'
auto_task_fine:     'Vazifa bajarilmagani uchun'
auto_expire_fine:   'Vazifa vaqti tugagani uchun'
```

**Fetch** (`useEffect([employee.employee_id, type, period])`, cancellable): 
`GET /bonus-fine/logs` params `{ employee_id: employee.employee_id, type, days: period }` → `setItems(res.data.items || [])`. Xato → toast "Yuklanmadi".

**`total`** = `Σ (x.amount || 0)`

**Kun bo'yicha guruhlash** (API tartibi saqlanadi — eng yangi birinchi):
```js
groups = items.reduce((acc, x) => {
  day = (x.created_at || '').slice(0, 10) || "Noma'lum"   // YYYY-MM-DD
  (acc[day] ||= []).push(x); return acc
}, {})
groupOrder = Object.keys(groups)
```

**`sourceFromNote(it)` — note matni → source mapping (AYNAN)**:
```js
if (it.rule_id)                       return 'rule'
note = it.note || ''
if (/muddati o'tdi/i.test(note))      return 'auto_expire_fine'
if (/bajarildi/i.test(note))          return 'auto_task_reward'
if (/rad etildi/i.test(note))         return 'auto_task_fine'
return 'manual'
```
→ label = `BF_SOURCE_LABELS[src] || src`

**`fmtTime(iso)`** (LOKAL, dateUtils EMAS): `new Date(iso).toLocaleTimeString('uz-UZ', { hour:'2-digit', minute:'2-digit' })`, try/catch→''
**`fmtDateHeader(day)`**: agar `'Noma'lum'` → o'zi; aks holda `new Date(day).toLocaleDateString('uz-UZ', { day:'2-digit', month:'long', year:'numeric', weekday:'long' })`

**UI**: `sm:max-w-2xl`, `max-h-[90vh]`. Header: ikona (`TrendingUp`/`TrendingDown`), title `isBonus ? 'Bonus tarixi' : 'Jarima tarixi'`, sub `{employee.employee_name} · {items.length} ta yozuv`. Total banner: "Jami ({period} kun)" + `{isBonus?'+':'-'}{fmt(total)} so'm`. List: loading→3 skeleton; bo'sh→`FileText` + "Bonus/Jarima yo'q"; aks holda guruhlar: har kun header (`Calendar` + fmtDateHeader), har element: `it.title || '—'`, `it.note`, source label badge + `fmtTime(it.created_at)`, summa `{isBonus?'+':'-'}{fmt(it.amount)}`. Footer: "Yopish" tugma.

---

### 8.7. TAB 2/3 — RulesTab (Bonuslar / Jarimalar)

**Props**: `{ type }` (`'bonus'` yoki `'fine'`). `key` prop bilan render qilinadi (state reset).

**State**: `rules=[]`, `loading=true`, `modal=null`, `dynamicRoles=[]`, `activeRole=''`

**Dynamic roles** (`useEffect([])`): `GET /employees/meta/roles` → `res.data.items`; agar bor va `activeRole` yo'q → `setActiveRole(items[0].value)`. Xato → fallback `ROLES.map(r => ({value, label}))`, `activeRole='admin'`.

**`fetchRules` (useCallback `[type]`)**: `GET /bonus-fine/rules?type={type}` → `res.data.items || []`. `useEffect([fetchRules])`.

**`handleDelete(rule)`**: `confirm("${rule.title} ni o'chirmoqchimisiz?")` → `DELETE /bonus-fine/rules/${rule.id}` → toast "O'chirildi" → fetchRules.

**Filtr**: `roleRules = rules.filter(r => r.role === activeRole)` (faqat tanlangan rol qoidalari).

**UI**:
- Rol tab bar (gorizontal scroll): `dynamicRoles.map(role)`. Har rol uchun count = `rules.filter(r => r.role === role.value).length`. Icon = `ROLES.find(...)?.icon || User`. Active'da count badge rangi `isBonus ? green : red`.
- Header + "Vazifa qo'shish" tugma (`isBonus ? green-600 : red-600`): `setModal({ role: activeRole })`
- Bo'sh holat: `isBonus ? Sparkles : AlertTriangle`, "Bonus vazifalari yo'q"/"Jarima sabablari yo'q" + "Birinchi vazifani qo'shing" tugma
- Desktop jadval (`sm:block`): ustunlar `# | Vazifa | Summa | (amallar)`. Har qator: index+1, title+description, `{isBonus?'+':'-'}{fmt(rule.amount)} so'm` (rang type'ga qarab), Edit2 (→ `setModal({role:activeRole, rule})`) + Trash2 (→ handleDelete)
- Mobil kartalar (`sm:hidden`): index aylana, title/description/summa, Edit/Delete tugmalar
- `modal` → `<RuleModal rule={modal.rule||null} type role={modal.role} onClose onSave={fetchRules} />`

---

### 8.8. TAB — KpiTab (KPI scorecard)

**State**: `employees=[]`, `configs=[]`, `loading=true`, `period=YYYY-MM (joriy)`, `selectedEmp=null`, `scores=[]`, `sectionWeights={}`, `calculating=false`, `updating=null`, `configModal=false`

**Fetch**:
- `fetchEmployees`: `GET /employees/?active_only=true`
- `fetchConfigs`: `GET /salary/config` → `res.data.items || []`
- Mount: `Promise.all([fetchEmployees, fetchConfigs]).finally(setLoading(false))`
- `loadEmployeeData(empId)` (useCallback `[period]`): `GET /salary/scores?employee_id={empId}&period={period}` → `setScores(res.data.items||[])`, `setSectionWeights(res.data.section_weights||{})`
- `useEffect([selectedEmp, period])`: agar selectedEmp → loadEmployeeData
- Auto-select: agar `!selectedEmp && configs.length>0` → `setSelectedEmp(configs[0].employee_id)`

**`handleCalcToday`**: `POST /salary/calculate-daily` → toast "Bugungi KPI hisoblandi" → agar selectedEmp loadEmployeeData. Xato → `err?.response?.data?.detail || 'Xatolik'`. (Tugma label: "Savdo KPI hisoblash" / mobil "Hisoblash")

**`handleScoreToggle(score)`**: `newPct = score.percent >= 100 ? 0 : 100` → `PATCH /salary/scores/${score.id}` body `{ percent: newPct }`. Lokal yangilash (reorder oldini olish): `setScores(prev => prev.map(s => s.id===score.id ? {...s, percent:newPct} : s))`. Xato → "Xatolik".

**Section guruhlash** (template'dan dinamik):
```js
sectionGroups = {}; sectionOrder = []
for (s of scores):
  if (!sectionGroups[s.section]): sectionGroups[s.section]=[]; sectionOrder.push(s.section)
  sectionGroups[s.section].push(s)
```

**Kunlik grid hisob** (ishlatilmaydi, lekin hisoblanadi):
```js
[y, m] = period.split('-').map(Number)
daysInMonth = new Date(y, m, 0).getDate()
days = Array.from({length: daysInMonth}, (_, i) => `${period}-${String(i+1).padStart(2,'0')}`)
```

**`SECTION_COLORS_CYCLE`** — 6 ta rang tema (blue, amber, green, purple, rose, cyan), `si % 6` bilan tanlanadi. Har biri `{bg, border, accent, text, badge}`.

**SECTION SCORECARD FORMULASI (AYNAN MUHIM)**:
```js
secWeight   = sectionWeights[secName] || 0           // bo'lim vazni (0..1)
totalW      = Σ it.weight (items)  || 1              // shart vaznlari yig'indisi
sectionPct  = Σ (it.weight / totalW) * it.percent    // o'rtacha bajarilish foizi
sectionAmt  = sectionPct / 100 * secWeight * baseSalary   // bo'lim summasi
```
`baseSalary = selectedEmployee?.base_salary || 0`. `cfg = configs.find(c => c.employee_id === selectedEmp)`.

**Bo'lim header'da**: nom, `{Math.round(secWeight*100)}%` badge, agar `baseSalary>0 && secWeight>0` → `{fmt(Math.round(baseSalary*secWeight))}/{fmt(Math.round(sectionAmt))}` (potensial/erishilgan), `{Math.round(sectionPct)}%` (rang: `>=80` green / `>0` amber / 0 gray).

**Har score qatori**:
- `score.is_auto` → `RefreshCw` ikona (avtomatik, MoySklad'dan); aks holda checkbox tugma `handleScoreToggle` (`score.percent >= 100` → yashil `Check`; `updating===score.id` → Loader2)
- `score.label`
- agar `is_auto && score.actual_sales != null`: "Savdo: {fmt(round(actual_sales))}", agar `score.target>0` "/ Reja: {fmt(round(target))}", agar `score.amount>0` "KPI: +{fmt(round(amount))}", `score.tier` badge (`"To'liq"`→green, `"Qisman"`→amber, boshqa→gray)
- `{Math.round(score.weight*100)}%` (shart vazni)
- `{score.percent>0 ? Math.round(score.percent)+'%' : '0%'}` (rang `>=100` green / `>0` amber / 0 gray)

**Bo'sh holatlar**: `!selectedEmp` → "Xodimni tanlang"; `scores.length===0 && !loading` → "Bu xodim uchun KPI sozlanmagan" + "Sozlamalar tugmasini bosib KPI shablonini biriktiring".

**Yuqori panel**: `<input type="month">` (period), `<select>` xodim (faqat `configs` ichidagilar), "Savdo KPI hisoblash" tugma (handleCalcToday), "Sozlamalar" tugma (`setConfigModal(true)`).

`configModal` → `<SalaryConfigModal configs employees onClose onSave={fetchConfigs} />`

---

### 8.9. MODAL — SalaryConfigModal (KPI sozlamalari — "Konfiguratsiya")

**Props**: `{ configs, employees, onClose, onSave }`
**State `form`**: `{ employee_id:'', template_id:'', monthly_sales_target:'', commission_percent:'' }`, `saving=false`, `editingId=null`, `templates=[]`

**Mount**: `GET /kpi/templates` → setTemplates.

**`handleEdit(c)`**: `editingId=c.id`; form'ga `employee_id=String(c.employee_id)`, `template_id=String(c.template_id||'')`, `monthly_sales_target=String(c.monthly_sales_target||'')`, `commission_percent = c.commission_percent ? String(c.commission_percent * 100) : ''` (foiz → %ga aylantirish, ya'ni saqlangan 0.5 → "50")

**`handleSave` (AYNAN payload)**:
1. `if (!form.employee_id)` → "Xodimni tanlang"; `if (!form.template_id)` → "KPI shablonni tanlang"
2. `POST /salary/config`:
```js
{
  employee_id: parseInt(form.employee_id),
  template_id: parseInt(form.template_id),
  fix_weight: 0, kpi_weight: 0, bonus_weight: 0,    // har doim 0 (legacy maydonlar)
  monthly_sales_target: parseFloat(form.monthly_sales_target) || 0,
  commission_percent: form.commission_percent ? parseFloat(form.commission_percent) / 100 : null,  // 50 → 0.5
}
```
3. toast "Saqlandi" → onSave. Xato → `err?.response?.data?.detail || 'Xatolik'`

**`handleDelete(id)`**: `confirm("O'chirmoqchimisiz?")` → `DELETE /salary/config/${id}` → onSave

**UI** (`sm:max-w-lg`, `max-h-[90vh]`, sticky header/footer): 
- "Mavjud sozlamalar" ro'yxati: har config bosiluvchi (`handleEdit`), ko'rsatadi: `c.employee_name`, `tmpl.name || 'Shablon yo'q'` + `Reja: {fmt(c.monthly_sales_target)}/oy` + agar commission `· Komissiya: {(c.commission_percent*100).toFixed(1)}%`. Edit2 + Trash2 tugmalar.
- "Yangi qo'shish"/"Tahrirlash" forma:
  - templates bo'sh → ogohlantirish "Avval Shablonlar tabida shablon yarating"
  - Xodim select (`employees.filter(e => editingId || !configs.find(c=>c.employee_id===e.id))` — yangi qo'shishda allaqachon configga ega bo'lmaganlar)
  - KPI shablon select (`templates.filter(t=>t.is_active)`, label `{t.name} ({t.sections?.length||0} bo'lim)`)
  - Tanlangan shablon preview: nom, har section `{s.name} — {round(s.weight*100)}% · {s.conditions?.length||0} shart`, tiers JSON parse → har tier `≥{tier.min}% → {tier.payout}% ({tier.label})` (`sort((a,b)=>b.min-a.min)`)
  - "Oylik savdo rejasi (so'm)" `type=number` (placeholder "46000000")
  - "Savdodan komissiya (%)" `type=number step=0.01` (placeholder "0.5 (bo'sh = yo'q)"), izoh "Shaxsiy savdo × foiz = komissiya. Bo'sh qolsa — komissiya yo'q."
- Footer: "Yangilash"/"Saqlash" (`disabled={saving || !form.template_id}`) + "Yopish"

---

### 8.10. MODAL — TemplateModal (KPI shablon yaratish/tahrirlash)

**Props**: `{ template, roles, onClose, onSave }`. `isEdit = !!template && template !== 'add'`.

**`DEFAULT_TIERS`**:
```js
[ {min:100, payout:100, label:"To'liq"}, {min:90, payout:80, label:'Qisman'}, {min:0, payout:0, label:'Bajarilmadi'} ]
```

**State**: `name`, `role`, `description`, `sections` (edit'da template.sections'dan map: `weight: Math.round(s.weight*100)` — ya'ni 0.3 → 30, har condition ham `weight: Math.round(c.weight*100)`, `source_type, target_value, checker_id, sort_order`), `tiers` (edit'da `JSON.parse(template.tiers)` yoki DEFAULT_TIERS), `collapsed={}`, `employees=[]`, `saving=false`

**Mount**: `GET /employees/?active_only=true` → setEmployees

**`COND_SOURCES`** (shart manbalar — AYNAN):
```
manual:               "Qo'lda" ✋
moysklad_sales:       'MoySklad (shaxsiy)' 📊
moysklad_sales_total: 'MoySklad (umumiy)' 🏪
```

**Section CRUD**: `addSection` (`{name:'', weight:0, sort_order:s.length, conditions:[]}`), `removeSection`, `updateSection(i,field,val)`, `addCondition(si)` (`{name:'', description:'', weight:0, source_type:'manual', target_value:'', checker_id:'', sort_order}`), `removeCondition`, `updateCondition`. `toggleCollapse(i)`.

**Tier CRUD**: `updateTier(i,field,val)` (label'dan tashqari `Number(val)`), `addTier` (`{min:0, payout:0, label:'Yangi daraja'}`), `removeTier`.

**Vazn validatsiya**: `totalWeight = Σ (parseInt(sec.weight)||0)`; `weightOk = totalWeight === 100`

**`handleSave` (AYNAN payload — vaznlar 100'dan bo'linadi)**:
1. `if (!name.trim())` → "Shablon nomini kiriting"
2. `if (sections.length===0)` → "Kamida 1 ta bo'lim qo'shing"
3. `if (!weightOk)` → "Bo'limlar vaznlari jami 100% bo'lishi kerak"
4. Payload:
```js
{
  name: name.trim(), role: role || null, description: description || null,
  tiers: JSON.stringify(tiers),
  sections: sections.map((s, si) => ({
    name: s.name,
    weight: (parseInt(s.weight)||0) / 100,         // 30 → 0.3
    sort_order: si,
    conditions: s.conditions.map((c, ci) => ({
      name: c.name, description: c.description || null,
      weight: (parseInt(c.weight)||0) / 100,        // 50 → 0.5
      source_type: c.source_type,
      target_value: c.target_value ? parseFloat(c.target_value) : null,
      checker_id: c.checker_id ? parseInt(c.checker_id) : null,
      sort_order: ci,
    })),
  })),
}
```
5. `isEdit` → `PUT /kpi/templates/${template.id}` ("Shablon yangilandi"); aks holda `POST /kpi/templates` ("Shablon yaratildi"). Xato → `err?.response?.data?.detail || 'Xatolik'`

**UI**: To'liq ekran (`fixed inset-0`). `SECTION_THEMES` (6 ta: blue, amber, green, purple, rose, cyan — `si % 6`). 
- Basic: "Shablon nomi *" (autoFocus), "Lavozim (rol)" select (`roles`)
- Vazn summary bar: `{totalWeight}% / 100%` (rang `weightOk` green / `>100` red / amber), gorizontal segment bar (har section rangi)
- Sections (collapsible, `border-l-4` rang): header — `ChevronDown` (collapsed→`-rotate-90`), nom inputi, vazn input (`type=number min=0 max=100`, spinner yashirilgan), "{N} shart" badge, Trash2. Body: conditions — har biri index, nom input, X tugma; ostida vazn input (%) + source select (`COND_SOURCES`) + checker select (`👤 Admin tekshiradi` + `employees.map(👤 {emp.name})`). "Bo'lim ichidagi jami {condWeightTotal}% / 100%". "Shart qo'shish" tugma.
- "Bo'lim qo'shish" (dashed border tugma)
- "KPI darajalari (savdo %)" bo'limi: tiers `sort((a,b)=>b.min-a.min)`, har tier: `≥` + min input + `→` + payout input + `% to'lov` + label input + X. Izoh "Savdo rejasi bajarilish foizi → to'lanadigan KPI foizi. Tepadan pastga tekshiriladi."
- Footer (sticky): "Saqlash"/"Yaratish" (`disabled={saving || !weightOk}`) + "Bekor qilish"

---

### 8.11. MODAL — ReportModal (KPI hisobot yaratish)

**Props**: `{ templates, employees, onClose, onSave }`
**State `form`**: `{ template_id:'', employee_id:'', period:YYYY-MM, base_salary:'' }`
**`handleSave`**: validatsiya `template_id && employee_id && period` → "Barcha maydonlarni to'ldiring". `POST /kpi/reports` body `{ ...form, template_id:parseInt, employee_id:parseInt, base_salary: parseFloat(form.base_salary) || selectedEmployee?.base_salary || 0 }` → toast "KPI hisobot yaratildi".
**UI** (`max-w-md`): "KPI shablon" select (`is_active`), "Xodim" select (tanlanganda `base_salary` ni emp'dan oladi), "Davr (oy)" month input, "Bazaviy maosh" number. "Yaratish" + "Bekor qilish".

---

### 8.12. KOMPONENT — ReportDetail (KPI hisobot tafsiloti)

**Props**: `{ report, onUpdate, onConfirm }`. `isConfirmed = report.status === 'confirmed'`.
**`toggleItem(item)`**: `PATCH /kpi/reports/${report.id}/items/${item.id}` body `{ is_fulfilled: !item.is_fulfilled, percent: !item.is_fulfilled ? 100 : 0 }` → onUpdate. Xato → "Xatolik".
**Section guruhlash**: `for (it of report.items)` → `sections[it.section_name || '—'] = { weight: it.section_weight, items: [...] }`
**UI**: Accordion. Header: ism, period, `{Math.round(report.total_percent)}%` (rang `>=80` green / `>=50` amber / red), `{fmt(report.total_amount)} so'm`, status badge (`confirmed`→"Tasdiqlangan" green / "Qoralama" amber). Ochilganda: "Bazaviy maosh: {fmt(report.base_salary)}", agar `!isConfirmed` → "Tasdiqlash" tugma (`onConfirm(report.id)`). Har section: nom + `{Math.round(secData.weight*100)}%`. Har item: checkbox (`!isConfirmed && toggleItem`), `item.condition_name`, agar `target_value != null` → "Reja: {fmt(target_value)} · Fakt: {fmt(actual_value)}", `{Math.round(item.weight*100)}%`, `item.is_fulfilled ? '100%' : '0%'`.

---

### 8.13. KOMPONENT — SalaryConfigSection (Shablonlar tab → "Sozlamalar" sub-tab)

**Props**: `{ configs, employees, templates, onSave }`
Mantiq SalaryConfigModal bilan deyarli bir xil (handleEdit/handleSave/handleDelete — payload aynan: `fix_weight:0, kpi_weight:0, bonus_weight:0`, `commission_percent / 100`). Farqi: modal emas, 2 ustunli grid (chap: mavjud configlar ro'yxati `.card`; o'ng: forma `.card`). handleSave muvaffaqiyatda `handleCancelEdit()` ham chaqiradi.

---

### 8.14. TAB — XulosaTab (yakuniy oylik xulosa)

**State**: `data=[]`, `loading=true`, `period=new Date().toISOString().slice(0,7)` (YYYY-MM)

**`fetchSummary` (useCallback `[period]`)**: `GET /salary/summary?period={period}` → `setData(res.data.items || [])`. `useEffect([fetchSummary])`.

**`grandTotal`** = `Σ (d.total_salary || 0)` (barcha data)

**UI**: Yuqori: `<input type="month">` + "Jami: {fmt(grandTotal)} so'm". Bo'sh → `CircleDollarSign` + "Bu oy uchun ma'lumot yo'q".

**JADVAL** (faqat `data.filter(d => d.has_config)` qatorlar):
Ustunlar (dinamik):
- "Xodim" (`d.employee_name` + `d.role`)
- "Bazaviy" (`fmt(d.base_salary)`)
- **Dinamik section ustunlari**: `Object.keys(data[0]?.sections || {})` — har section uchun ustun (rang `SECTION_COLORS_CYCLE[si%6]`). Hujayrada: `fmt(val.amount)` + `{Math.round(val.percent)}%`
- "KPI savdo" (`fmt(d.kpi_sales)`, blue)
- "Komissiya" (`d.commission > 0 ? fmt(d.commission) : '—'`, indigo)
- "Bonus" (`d.extra_bonus > 0 ? '+'+fmt : '—'`, green)
- "Jarima" (`d.fine_amount > 0 ? '-'+fmt : '—'`, red)
- "JAMI" (`fmt(d.total_salary)`, primary, bold)

**Tfoot "Jami" qatori**: har ustun bo'yicha `data.filter(d=>d.has_config).reduce(...)` yig'indisi (base_salary, har section amount, kpi_sales, commission, extra_bonus, fine_amount), oxirgi `grandTotal`.

> **YAKUNIY OYLIK FORMULASI (backend hisoblaydi, frontend faqat ko'rsatadi)**: `total_salary = Σ sections[*].amount + commission + extra_bonus − fine_amount`. Frontend backend qaytargan `d.total_salary` ni to'g'ridan-to'g'ri ko'rsatadi (qayta hisoblamaydi). Har section.amount = (KpiTab formulasidagidek) `sectionPct/100 × section.weight × base_salary`. `commission = shaxsiy_savdo × commission_percent`. KPI savdo bo'limi tier'lar orqali hisoblanadi (`actual/target` foiz → tier payout %).

---

### 8.15. SHABLONLAR TAB (sahifa darajasida render, 3 sub-tab)

**Sub-tab bar** (`shablonTab` state): `templates` (icon `Target`, "Shablonlar"), `configs` (`Settings2`, "Sozlamalar"), `reports` (`BarChart3`, "Hisobotlar")

**`templates` sub-tab**:
- "Shablon qo'shish" tugma → `setKpiModal('add-template')`
- Bo'sh → `Target` + "Hali shablon yo'q"
- Har template `.card`: header (nom, `{kpiRoles.find(r=>r.value===t.role)?.label || t.role || 'Belgilanmagan'} · {t.sections?.length||0} bo'lim`, Edit2→`setKpiModal(t)`, Trash2→`handleDeleteTemplate`). Tana: har section (`SECTION_THEMES[si%6]`, `border-l-4`): nom, "{N} shart" badge, `{Math.round(s.weight*100)}%`. Tiers JSON: `sort((a,b)=>b.min-a.min)`, har tier `≥{min}% → {payout}% · {label}`.

**`configs` sub-tab**: `<SalaryConfigSection configs={kpiConfigs} employees={employees} templates={kpiTemplates} onSave={fetchKpiConfigs} />`

**`reports` sub-tab**: `<input type="month">` (kpiPeriod) + "Hisobot yaratish" (→ `setKpiModal('add-report')`). Bo'sh → "Bu oy uchun hisobotlar yo'q". Har report: `<ReportDetail report onUpdate={fetchKpiReports} onConfirm={handleConfirmReport} />` + agar `r.status !== 'confirmed'` hover'da Trash2 (`handleDeleteReport`).

---

## 9. SOZLAMALAR SAHIFASI (`SettingsPage.jsx`)

`max-w-4xl`. Header: "Sozlamalar" + "Tizim konfiguratsiyasi". Yuklanayotganda `Loader2` (h-64).

**`Section({title, children})`** wrapper: `.card p-6 space-y-4`, h2 (border-b pb-3).

### 9.1. State (barchasi)
`settings`, `templates`, `loading`, `saving`. Telegram: `tgStep='idle'`, `tgApiId`, `tgApiHash`, `tgPhone`, `tgCode`, `tgPhoneCodeHash`, `tgCodeVia`, `tgSessionString`, `tgImporting`, `tgMe`. Kompaniya: `companyName`, `contactPhone`. Test: `counterparties`, `selectedCpId`, `testMessage='🔔 Test xabari MoySklad Telegram integratsiyasidan!'`, `sendingTest`. MoySklad: `msToken`, `pollingInterval=30`, `syncDemands=true`, `syncOrders=true`, `syncPayments=true`.

### 9.2. `fetchSettings()` (mount'da)
`Promise.all([GET /settings/, GET /settings/templates])`. `s = settingsRes.data`:
- `msToken = s.moysklad?.token || ''`, `pollingInterval = s.moysklad?.polling_interval || 30`, `syncDemands = s.moysklad?.sync_demands ?? true`, `syncOrders ?? true`, `syncPayments ?? true`
- `tgApiId = s.telegram?.api_id || ''`, `tgApiHash = s.telegram?.api_hash || ''`, `tgPhone = s.telegram?.phone || ''`, `companyName = s.telegram?.company_name || ''`, `contactPhone = s.telegram?.contact_phone || ''`
- `GET /telegram/status`: agar `connected` → `tgStep='connected'`, `tgMe = statusRes.data.user`, `fetchCounterparties()`

`fetchCounterparties()`: `GET /telegram/counterparties-with-telegram` → setCounterparties

### 9.3. Bo'lim 1 — "MoySklad sozlamalari"
- "API Token" (`type=password`, mono)
- "Polling intervali (sekund)" (`type=number min=10 max=300`, `w-32`)
- "Kuzatiladigan hujjatlar" — 3 checkbox: "Savdo cheklari" (`syncDemands`), "Buyurtmalar" (`syncOrders`), "To'lovlar" (`syncPayments`)
- "Saqlash" tugma → `saveMoySkladSettings`: `PUT /settings/` body `{ moysklad_token: msToken, polling_interval: parseInt(pollingInterval), sync_demands, sync_orders, sync_payments }` → toast "MoySklad sozlamalari saqlandi"

### 9.4. Bo'lim 2 — "Kompaniya ma'lumotlari"
Izoh: "Ushbu ma'lumotlar har bir Telegram xabarining boshiga va oxiriga qo'shiladi." 2 input: "Do'kon / Kompaniya nomi" (placeholder "Climart Santexnika do'koni"), "Aloqa telefon raqami" (placeholder "(78) 333-47-47"). "Saqlash" tugma → `PUT /settings/telegram` body `{ company_name: companyName, contact_phone: contactPhone }` → toast "Saqlandi".

### 9.5. Bo'lim 3 — "Telegram sozlamalari" (3 REJIM — AYNAN OQIM)

**Rejim oqimi**: `idle → connecting → code_sent → connected` (yoki idle → connected import orqali).

**A) `tgStep === 'connected'`**:
- Yashil quti: "Telegram ulangan" + `tgMe`: `{tgMe.first_name}{tgMe.username?` (@${username})`:''}{tgMe.phone?` · +${phone}`:''}`
- "Test xabar yuborish": agar `counterparties.length===0` → "Telegram biriktirilgan kontragentlar topilmadi..."; aks holda `<CounterpartyCombobox>`. Xabar matn input + "Yuborish" tugma → `sendTest`
- "Uzish" tugma (`btn-danger`) → `disconnectTelegram`

**B) `tgStep === 'code_sent'`**:
- Ko'k quti: `tgCodeVia === 'SMS' ? '💬 SMS kod yuborildi' : '📱 Telegram ilovasiga kod yuborildi'`. Tavsif SMS uchun "{tgPhone} raqamiga SMS yuborildi", aks holda "{tgPhone} bilan bog'liq Telegram ilovasini oching — 'Telegram' xizmat chatidan 5 raqamli kod keladi"
- "Tasdiqlash kodi" input (`w-44 text-center text-xl tracking-widest`, placeholder "12345", `maxLength=6`, `autoFocus`, Enter→verifyCode)
- "Tasdiqlash" tugma (`verifyCode`) + "Bekor qilish" (→ `tgStep='idle'`, `tgCode=''`)

**C) `tgStep` boshqa (idle/connecting) — boshlang'ich forma**:
- Amber quti: "my.telegram.org saytiga kirib API ID va API Hash oling..."
- "API ID" (placeholder "12345678"), "API Hash" (`type=password` mono), "Telefon raqam" (`w-60`, placeholder "+998901234567")
- "Telegram ga ulanish" tugma (`connectTelegram`, `disabled={tgStep==='connecting'}`, connecting→"Ulanmoqda...")
- Pastki blok "Kod kelmasa — Session String orqali ulanish": izoh "Lokal kompyuterda get_session.py skriptini ishlatib string oling", textarea (2 qator, mono), "Session String bilan ulanish" tugma (`importSession`, `disabled={tgImporting || !tgSessionString.trim()}`)

**Telegram API funksiyalari (AYNAN)**:
- **`connectTelegram`**: validatsiya `tgApiId && tgApiHash && tgPhone` → "Barcha maydonlarni to'ldiring". `tgStep='connecting'`. `PUT /settings/telegram` body `{ api_id: tgApiId, api_hash: tgApiHash, phone: tgPhone }`. Keyin `POST /telegram/connect` body `{ api_id: parseInt(tgApiId), api_hash: tgApiHash, phone: tgPhone }`. Agar `res.data.status === 'already_connected'` → `tgStep='connected'`, fetchCounterparties, `GET /telegram/status` → tgMe, toast "Allaqachon ulangan". Aks holda: `tgPhoneCodeHash = res.data.phone_code_hash`, `tgCodeVia = res.data.code_via`, `tgStep='code_sent'`, toast (`code_via==='SMS'` ? "💬 SMS kod yuborildi" : "📱 Telegram ilovasiga kod yuborildi"). Xato → toast detail, `tgStep='idle'`.
- **`verifyCode`**: `if (!tgCode)` → "Kodni kiriting". `POST /telegram/verify-code` body `{ code: tgCode, phone_code_hash: tgPhoneCodeHash }`. → `tgStep='connected'`, `tgCode=''`, fetchCounterparties, `GET /telegram/status` → tgMe, toast "Telegram ulandi!". Xato → `err.response?.data?.detail || "Noto'g'ri kod"`.
- **`importSession`**: validatsiya `tgApiId && tgApiHash && tgPhone && tgSessionString.trim()`. `tgImporting=true`. `POST /telegram/import-session` body `{ api_id: parseInt, api_hash, phone, session_string: tgSessionString.trim() }`. → `tgStep='connected'`, `tgMe = res.data.user`, `tgSessionString=''`, fetchCounterparties, toast "Telegram ulandi!".
- **`disconnectTelegram`**: `POST /telegram/disconnect` → `tgStep='idle'`, tgMe=null, tgCode='', counterparties=[], selectedCpId=null, toast "Telegram uzildi".
- **`sendTest`**: `if (!selectedCpId)` → "Kontragent tanlang". `POST /telegram/send-to-counterparty` body `{ counterparty_id: selectedCpId, message: testMessage }` → `toast.success("Xabar yuborildi: " + res.data.name)`.

**`CounterpartyCombobox`**: searchable dropdown. Outside click → close. Filtr: name/telegram_phone/telegram_username `includes(query.toLowerCase())`. Tanlanган ko'rsatish: `{name} ({selected.target || telegram_phone || telegram_username})`. Search box (`Search` icon, autoFocus). Options ro'yxati `max-h-48`.

### 9.6. Bo'lim 4 — "Xabar shablonlari" (faqat `templates` bor bo'lsa)
O'zgaruvchilar matni: `{number}, {date}, {sum}, {positions}, {agent}`. 3 textarea (`font-mono h-36`):
- "Savdo cheki shabloni" (`demand_template`)
- "To'lov shabloni" (`payment_in_template`)
- "Buyurtma shabloni" (`order_template`)
"Shablonlarni saqlash" tugma → `saveTemplates`: `PUT /settings/templates` body `{ demand_template, payment_in_template, order_template }` → toast "Shablonlar saqlandi".

### 9.7. Bo'lim 5 — "Hujjat cheklari"
`<DocumentTemplatesSection />` (quyida 10).

---

## 10. DOCUMENT TEMPLATES KOMPONENTLARI

### 10.1. `services/documentTemplates.js`
- `listDocumentTemplates()` → `GET /document-templates` → data
- `saveDocumentTypeConfig(docType, {enabled, templates, expectedUpdatedAt, allowEmpty})` → `PUT /document-templates/{encodeURIComponent(docType)}{allowEmpty?'?allow_empty=1':''}` body `{ enabled, templates, expected_updated_at: expectedUpdatedAt ?? null }`
- `refreshDocumentTemplatesCache()` → `POST /document-templates/refresh`
- `resetDocumentTypeConfig(docType)` → `POST /document-templates/reset/{encodeURIComponent(docType)}`

### 10.2. `DocumentTemplatesSection.jsx`
State: `data=null`, `loading=true`, `refreshing=false`. `reload()`: listDocumentTemplates → setData (xato toast "Sozlamalarni yuklashda xatolik"). Mount → reload.
**`handleRefresh`**: refreshDocumentTemplatesCache → `toast.success("{result.total_templates} ta shablon yangilandi")`; agar `result.errors?.length` → `toast("{N} ta tur yuklanmadi — log ga qarang", {icon:'⚠️'})`; reload.
**`ageWarn`** = `data.cache_age_hours != null && data.cache_age_hours > 24`. Agar → amber ogohlantirish "Shablon ro'yxati {Math.round(cache_age_hours)} soat oldin yangilangan. 'Yangilash' tugmasini bosing."
Render: izoh + "Yangilash" tugma (`btn-ghost`). Har `data.types` → `<DocTypeCard view configUpdatedAt={data.config_updated_at} onChanged={reload} />`.

### 10.3. `DocTypeCard.jsx`
**Props**: `{ view, configUpdatedAt, onChanged }`
State: `expanded=view.enabled`, `enabled=view.enabled`, `templates=view.configured_templates`, `saving=false`, `dirty=false`. `useEffect([view.enabled, view.configured_templates])` → sync state, dirty=false.
**`handleSave(allowEmpty=false)`**: agar `enabled && templates.length===0 && !allowEmpty` → `window.confirm("Yoqilgan holatda, lekin chek yo'q. Faqat matn yuboriladi. Davom etamizmi?")`; rad→return; tasdiq→`handleSave(true)`. Aks holda `saveDocumentTypeConfig(view.doc_type, {enabled, templates, expectedUpdatedAt: configUpdatedAt, allowEmpty})`. Agar `result.warnings?.length` → har biri `toast(w, {icon:'⚠️'})`. toast.success "{view.label_ru} saqlandi", dirty=false, onChanged. **409 xato** → toast.error "Sozlama boshqa admin tomonidan yangilandi. Sahifani qayta yuklang." (optimistic concurrency); boshqa xato → detail.
**`handleReset`**: `window.confirm("{view.label_ru} uchun default qiymatlarga qaytarilsinmi?")` → resetDocumentTypeConfig → toast "Default ga qaytarildi" → onChanged.
**`statusIcon`** = `enabled ? '✅' : '⭕'`. **`summary`**: enabled→(templates 0 ? "Yoqiq, chek yo'q (faqat matn)" : "{N} ta chek: {slice(0,3).join(' → ')}{>3?'...':''}") : "O'chiq".
UI: accordion. Header: chevron, statusIcon, `{view.label_ru} ({view.doc_type})` + summary, enabled toggle checkbox. Ochilganda: agar `!view.sync_supported` → amber ogohlantirish "Backend hozircha bu hujjat turini sync qilmaydi...". `<TemplateList>` + `<TemplateSelect>` + "Saqlash" (`disabled={!dirty || saving}`) + "Default" tugmalar.

### 10.4. `TemplateList.jsx`
**Props**: `{ templates, missing=[], onChange }`. `removeAt(i)`, `swap(i,j)` (chegara tekshiruvi). Bo'sh→"Hech qanday chek tanlanmagan.". Har element (`ol`): `{i+1}.` + nom (`missing.includes(name)` → amber bg + `line-through`, `AlertTriangle` icon tooltip "MoySklad kesh da topilmadi — publication paytida skip qilinadi"), yuqoriga (`ChevronUp` disabled i===0), pastga (`ChevronDown` disabled i===len-1), o'chirish (`X`).

### 10.5. `TemplateSelect.jsx`
**Props**: `{ available, configured, onAdd }`. `candidates = available.filter(t => !configuredSet.has(t.name))`. Bo'sh→"Barcha mavjud shablonlar qo'shilgan.". Tugma "Shablon qo'shish" → dropdown: har candidate `{t.name} ({t.kind.replace('template','')})` → `onAdd(t.name)`.

---

## 11. HISOBOTLAR SAHIFASI (`ReportsPage.jsx`)

**State**: `salesData=[]`, `topCps=[]`, `summary=null`, `days=7`, `loading=false`. `COLORS = ['#3b82f6','#10b981','#f59e0b','#ef4444','#8b5cf6']`.
**`fetchData`** (`useEffect([days])`): `Promise.all([GET /reports/sales?days={days}, GET /reports/top-counterparties?limit=5, GET /reports/summary])` → `salesData=salesRes.data.data||[]`, `topCps=topRes.data||[]`, `summary=summaryRes.data`. Xato → "Yuklanmadi".
**UI**:
- Header: "Hisobotlar" + "Statistika va tahlil" + "Yangilash" tugma
- Summary kartalar (`summary` bor bo'lsa, `grid-cols-2 lg:grid-cols-4`): "Jami kontragentlar" (`total_counterparties`, blue), "Telegram ulangan" (`linked_counterparties`, green), "Bugun yuborildi" (`messages_sent_today`, purple), "Muvaffaqiyatsiz" (`failed_messages_today`, red) — har biri `text-3xl font-bold`
- Period selektor: `[7, 14, 30]` tugmalar (`{d} kun`), active `bg-primary-600 text-white`
- "Xabar aktivligi" — recharts `BarChart` (`salesData`): X=`date` (`v?.slice(5)`), 3 Bar: `demands` "Savdo" (#3b82f6), `payments` "To'lov" (#10b981), `orders` "Buyurtma" (#f59e0b). Bo'sh → "Ma'lumot yo'q"
- "Top kontragentlar" (`topCps` bor bo'lsa): chap — ranked ro'yxat (progress bar `width: (cp.count / topCps[0].count) * 100%`); o'ng — recharts `PieChart` (`dataKey=count, nameKey=name`, label `{(percent*100).toFixed(0)}%`)

---

## 12. YASHIRIN SAHIFALAR (App.jsx'da kommentariya — fayl bor, lekin route/sidebar'da YO'Q, ishlatilmaydi)

> Quyidagilar **hozirda ishlatilmayapti** (App.jsx'da route kommentariyada, Sidebar'da menyu yo'q). Faqat fayl saqlangan. Qisqa qamrov:

### 12.1. `CounterpartiesPage.jsx` — Kontragentlar
**Maqsad**: MoySklad kontragentlar ro'yxati + Telegram bog'lash.
**State**: `data={items,total,pages}`, `page=1`, `search=''`, `loading`, `editingCp`, `syncing`.
**API**: `GET /counterparties/?page&limit=20&search` (paginatsiya). `PATCH /counterparties/{id}/toggle-notifications`. `POST /moysklad/sync-now` (3s keyin reload).
**Jadval ustunlari**: Nom | Kontakt (phone/email) | Telegram (Ulangan/Ulanmagan badge + @username) | Balans (rang ±) | Xabar (`Bell`/`BellOff` toggle) | (Edit2).
**EditModal**: `telegram_username, telegram_phone, telegram_chat_id, notifications_enabled` → `PUT /counterparties/{id}`. Asosiy tugmalar: "Yangilash" (sync), qidiruv, paginatsiya (Oldingi/Keyingi).

### 12.2. `DemandsPage.jsx` — Savdo cheklari
**Maqsad**: MoySklad demand'lari ro'yxati (faqat o'qish).
**API**: `GET /moysklad/demands?limit=20&offset={n}` (offset paginatsiya). 502 → "MoySklad ulanmagan. Sozlamalarda API token kiriting."
**Jadval**: Raqam | Sana (`format(new Date, 'dd.MM.yyyy HH:mm')`) | Kontragent (`row.agent?.name`) | Summa (`(sum/100).toLocaleString('uz-UZ')` — KOPEK→so'm) | Holat (`row.payedSum >= row.sum` ? "To'langan" green : "To'lanmagan" yellow). "Yangilash" tugma + paginatsiya.

### 12.3. `OrdersPage.jsx` — Buyurtmalar
**Maqsad**: MoySklad customerorder ro'yxati.
**API**: `GET /moysklad/orders?limit=20&offset={n}`. 502 → "MoySklad ulanmagan".
**Jadval**: Raqam | Sana | Kontragent | Summa (sum/100) | Status (`state?.name || 'Yangi'` badge-blue). "Yangilash" + paginatsiya.

### 12.4. `PaymentsPage.jsx` — To'lovlar
**Maqsad**: MoySklad to'lovlar (kiruvchi/chiquvchi).
**State**: `type='in'` (`'in'`=paymentIn, `'out'`=paymentOut).
**API**: `GET /moysklad/payments?limit=20&offset={n}&payment_type={type}`. 502 → "MoySklad ulanmagan".
**Tablar**: "Kiruvchi" (`ArrowUpCircle`, green active) / "Chiquvchi" (`ArrowDownCircle`, red active).
**Jadval**: Raqam | Sana | Kontragent | Summa (`{type==='in'?'+':'-'}{sum/100}` rang green/red). Paginatsiya.

### 12.5. `KassaPage.jsx` — Kassa (eng katta yashirin, 664 qator)
**Maqsad**: Kunlik kassa boshqaruvi (ochish/yopish/seyf).
**State (asosiy)**: `tab='today'` (`today`/`history`), `employees`.
**`fmt(val)`** = `Number(val).toLocaleString('uz-UZ')`. **`formatDate(iso)`** = `new Date(iso).toLocaleString('uz-UZ', {day,month,year,hour,minute 2-digit})` (LOKAL, dateUtils EMAS).

**TodayTab**:
- `GET /kassa/today` → `res.data.session`. 404 → session=null.
- Session yo'q → "Kassa yopiq" + "Kassani ochish" tugma → `OpenKassaModal`
- `isOpen = session.status === 'open'`. Status banner (green/red border-l-4). 4 `AmountCard`: "Naqd pul" (`cash_received`), "Terminal" (`terminal_amount`), "Yo'ldagi pullar" (`transit_amount`), "Seyf" (`safe_amount`).
- isOpen tugmalar: "Summalarni yangilash" (`UpdateAmountsModal`), "Seyfga o'tkazish" (`SafeTransferModal`), "Kassani yopish" (`CloseKassaModal`).

**Modallar**:
- **OpenKassaModal**: `POST /kassa/open` `{ cashier_id: Number, opening_amount: Number||0 }`. Kassir select = `employees.filter(e => e.role==='cashier' || e.role==='admin')`. Validatsiya `cashier_id`.
- **CloseKassaModal**: validatsiya `(safe_amount||0) >= (cash_received||0)` ("Kassa yopilishi uchun barcha naqd pul seyfda bo'lishi kerak"). `POST /kassa/{session.id}/close` `{ notes, terminal_confirmed, safe_amount }`. Summary ko'rsatadi (naqd/terminal/seyf, `safeOk` → CheckCircle/XCircle).
- **SafeTransferModal**: validatsiya `amount>0` va `amount <= cash_received`. `POST /kassa/{session.id}/send-to-safe` `{ amount: Number }`.
- **UpdateAmountsModal**: `PUT /kassa/{session.id}` `{ cash_received, terminal_amount, transit_amount }` (bo'sh emas bo'lsa `Number`, aks holda `undefined`).

**HistoryTab**: `GET /kassa/history`. Jadval: Sana | Kassir | Naqd | Terminal | Seyf | Holat (`open`→"Ochiq" green / "Yopiq" gray).

---

## 13. QAYTA QURISH UCHUN MUHIM NUANSLAR (CHECKLIST)

1. **Auth strict admin**: `is_admin = (data.role === 'admin')` — faqat shu. `is_checker = !!data.is_checker`. `permissions` maydoni YO'Q.
2. **Himoya darajasi**: Faqat `Layout` token tekshiradi + Sidebar/HomeRedirect rolga qarab. Per-route AdminRoute YO'Q — backend himoyaga tayanadi.
3. **Timezone**: dateUtils `Asia/Tashkent`, TZ marker yo'q → `+05:00` qo'shish. LEKIN OylikPage va KassaPage o'z lokal `toLocaleString('uz-UZ')` ishlatadi (dateUtils EMAS) — bu farqni saqlash.
4. **Sonlar formati**: hamma joyda `toLocaleString('uz-UZ')` (bo'sh joy ajratuvchi: 1 000 000).
5. **MoySklad summalari**: yashirin sahifalarda KOPEK → so'm uchun `/100`.
6. **KPI vazn konvertatsiyasi**: TemplateModal'da UI'da % (0-100), backend'ga `/100` (0-1). Edit'da `Math.round(weight*100)`.
7. **Commission konvertatsiya**: UI'da % (50), backend'ga `/100` (0.5). Edit'da `c.commission_percent * 100`.
8. **SalaryConfig payload har doim**: `fix_weight:0, kpi_weight:0, bonus_weight:0` (legacy).
9. **ApplyModal diff mantiqi**: toCreate = belgilangan & log yo'q; toDelete = log bor & belgilanmagan. Har biri alohida API call (POST/DELETE loop).
10. **Section formula**: `sectionPct = Σ (it.weight/totalW)*it.percent`; `sectionAmt = sectionPct/100 * secWeight * baseSalary`.
11. **BonusFineDetailModal source**: `rule_id` bor→'rule'; regex `muddati o'tdi`→expire_fine, `bajarildi`→task_reward, `rad etildi`→task_fine; aks→manual.
12. **Period qiymatlar**: HisobTab PERIODS = `[1(Bugun), 30, 60, 90]` (kunlar), default 30. ReportsPage = `[7,14,30]`, default 7.
13. **KPI/Xulosa period format**: `new Date().toISOString().slice(0,7)` = `YYYY-MM`, `<input type="month">`.
14. **Lazy loading**: KPI ma'lumotlari faqat `tab==='shablonlar'` bo'lganda yuklanadi. HisobTab/RulesTab/KpiTab/XulosaTab o'zlari mustaqil yuklaydi.
15. **kpiModal turi tekshiruvi**: TemplateModal `(kpiModal==='add-template' || (kpiModal && kpiModal.id && kpiModal.sections))` — ya'ni 'add-template' string yoki section'lari bor obyekt.
16. **WebSocket**: `/ws`, `sync_status` type → syncStore.setStatus, onclose → 3s qayta ulanish.
17. **Optimistic concurrency**: DocTypeCard save'da `expected_updated_at` yuboriladi, 409 → "boshqa admin yangiladi".
18. **Toast**: `react-hot-toast`, position top-right, dark bg `#363636`.
19. **localStorage kalitlari**: `auth-storage` (token+user), `theme-storage` (darkMode).
20. **API endpoint'lar to'plami** (zonam bo'yicha): `/auth/login`, `/employees/`, `/employees/{id}`, `/employees/meta/roles`, `/bonus-fine/summary`, `/bonus-fine/rules`, `/bonus-fine/rules/{id}`, `/bonus-fine/logs`, `/bonus-fine/logs/{id}`, `/bonus-fine/logs/today/{empId}`, `/salary/config`, `/salary/config/{id}`, `/salary/scores`, `/salary/scores/{id}`, `/salary/calculate-daily`, `/salary/summary`, `/kpi/templates`, `/kpi/templates/{id}`, `/kpi/reports`, `/kpi/reports/{id}`, `/kpi/reports/{id}/confirm`, `/kpi/reports/{id}/items/{itemId}`, `/settings/`, `/settings/templates`, `/settings/telegram`, `/telegram/status`, `/telegram/connect`, `/telegram/verify-code`, `/telegram/import-session`, `/telegram/disconnect`, `/telegram/counterparties-with-telegram`, `/telegram/send-to-counterparty`, `/document-templates` (+ /{docType}, /refresh, /reset/{docType}), `/moysklad/sync-now`, `/reports/sales`, `/reports/top-counterparties`, `/reports/summary`, `/counterparties/` (yashirin), `/moysklad/demands|orders|payments` (yashirin), `/kassa/*` (yashirin).

---

**Tegishli fayllar (absolute)**:
- `D:\projects-desktop\projects\moysklad\frontend\src\App.jsx`
- `D:\projects-desktop\projects\moysklad\frontend\src\main.jsx`
- `D:\projects-desktop\projects\moysklad\frontend\src\index.css`
- `D:\projects-desktop\projects\moysklad\frontend\src\services\api.js`, `documentTemplates.js`
- `D:\projects-desktop\projects\moysklad\frontend\src\store\authStore.js`, `syncStore.js`, `themeStore.js`
- `D:\projects-desktop\projects\moysklad\frontend\src\utils\dateUtils.js`
- `D:\projects-desktop\projects\moysklad\frontend\src\components\layout\Layout.jsx`, `Sidebar.jsx`, `Header.jsx`
- `D:\projects-desktop\projects\moysklad\frontend\src\components\DocumentTemplatesSection.jsx`, `DocTypeCard.jsx`, `TemplateList.jsx`, `TemplateSelect.jsx`
- `D:\projects-desktop\projects\moysklad\frontend\src\pages\OylikPage.jsx` (2945 qator — asosiy)
- `D:\projects-desktop\projects\moysklad\frontend\src\pages\SettingsPage.jsx`, `LoginPage.jsx`, `ReportsPage.jsx`
- Yashirin: `CounterpartiesPage.jsx`, `DemandsPage.jsx`, `OrdersPage.jsx`, `PaymentsPage.jsx`, `KassaPage.jsx`

Bu spetsifikatsiya boshqa stack'da 1:1 qayta qurish uchun yetarli: har tab, modal, formula, API chaqiruvi, validatsiya, state shakli va vizual tafsilotlar aniq ko'rsatilgan.