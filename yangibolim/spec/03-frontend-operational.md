Barcha kerakli fayllar o'qildi. Endi to'liq, batafsil funksional spetsifikatsiyani tayyorlayman. Bu hisobot 1:1 qayta qurish uchun yetarli detallarni o'z ichiga oladi.

---

# OPERATSION SAHIFALAR — TO'LIQ FUNKSIONAL SPETSIFIKATSIYA (1:1 qayta qurish uchun)

Manba: `D:\projects-desktop\projects\moysklad\frontend\src` — React 18 + Vite + Tailwind + Zustand + axios + react-hot-toast + lucide-react + clsx + react-router-dom + recharts.

---

## 0. UMUMIY INFRASTRUKTURA (barcha sahifalar uchun zarur)

### 0.1 API client — `services/api.js`
```
axios.create({ baseURL: '/api', timeout: 30000 })
```
Hech qanday interceptor yo'q. `Authorization: Bearer <token>` header `authStore` orqali `api.defaults.headers.common['Authorization']` ga qo'yiladi (login paytida va rehydrate paytida).

### 0.2 Auth store — `store/authStore.js` (Zustand + persist)
- State: `token` (null), `user` (null), `isLoading` (false), `error` (null).
- `user` shakli: `{ username, name, role, employee_id, is_admin, is_checker }`.
- `login(username, password)`: `POST /auth/login {username,password}` → javobdan `access_token` olinadi, header o'rnatiladi. `user` quriladi:
  - `username` = `data.name || username`
  - `name` = `data.name || username`
  - `role` = `data.role || 'admin'`
  - `employee_id` = `data.employee_id ?? null`
  - `is_admin` = `(data.role === 'admin')`
  - `is_checker` = `!!data.is_checker`
  - Xato: `error = err.response?.data?.detail || "Login yoki parol noto'g'ri"`, `return false`. Muvaffaqiyat: `return true`.
- `logout()`: header o'chiriladi, `token=null, user=null`.
- `initToken()`: agar token bor bo'lsa headerga qo'yadi.
- Persist: `name: 'auth-storage'`, `partialize` faqat `{token, user}`. `onRehydrateStorage`: agar `token === 'no-auth-token'` bo'lsa tozalaydi; aks holda headerga qo'yadi.

### 0.3 Vaqt formatlash — `utils/dateUtils.js`
Server naive datetime'ni `Asia/Tashkent` (UTC+5) da yozadi. Ba'zilarida offset bor (`+05:00`), ba'zilarida yo'q.
- `_parse(iso)`: bo'sh bo'lsa `null`. Regex `/Z$|[+-]\d{2}:\d{2}$/` bilan offset bormi tekshiradi; yo'q bo'lsa `iso + '+05:00'` qo'shadi. `new Date(...)`, `isNaN` bo'lsa `null`.
- `_parts(d)`: `Intl.DateTimeFormat('en-GB', {timeZone:'Asia/Tashkent', hour12:false, year/month/day/hour/minute: '2-digit' yoki 'numeric'})` orqali `{dd,mm,yyyy,hh,min}`.
- `fmtDateTime(iso)` → `"13.03.2026 15:07"`; bo'sh → `'—'`.
- `fmtDateTimeShort(iso)` → `"13.03 15:07"`.
- `fmtTime(iso)` → `"15:07"`.
- `fmtDate(iso)` → `"13.03.2026"`.

### 0.4 Routing — `App.jsx`
- Public: `/login`.
- Protected (Layout ichida, Layout token yo'q bo'lsa `/login` ga yo'naltiradi):
  - `index` → `HomeRedirect`: token yo'q → `/login`; bor → `user?.is_admin ? '/dashboard' : '/my-tasks'`.
  - `/dashboard`, `/messages`, `/settings`, `/reports`, `/employees`, `/tasks`, `/attendance`, `/my-tasks`, `/review`, `/oylik`.
  - `*` → `/`.
- Dark mode: `themeStore.darkMode` → `documentElement.classList` da `dark` toggle.

### 0.5 Sidebar — rol asosida ko'rsatish (`components/layout/Sidebar.jsx`)
- `isAdmin = !user || user.is_admin || user.role === 'admin'`.
- **Admin** ko'radi 3 bo'lim:
  - "Asosiy": `/dashboard` (LayoutDashboard), `/messages` (MessageSquare), `/reports` (BarChart3).
  - "Boshqaruv": `/employees` (UserCog), `/tasks` (ClipboardList), `/attendance` (CalendarCheck), `/oylik` (Award). **MUHIM: admin uchun "Tekshiruv" (/review) sidebar'da KO'RSATILMAYDI** — admin pending_review'ni Vazifa tarixi ustunidagi indikator orqali ko'radi.
  - "Tizim": `/settings` (Settings).
- **Xodim (non-admin)** ko'radi: "Menyu" — `/my-tasks` (CheckSquare), `/attendance` (CalendarCheck). Agar `user.is_checker === true` bo'lsa qo'shimcha `/review` (ShieldCheck, "Tekshiruv").
- Collapsed holatda (`w-16` vs `w-60`): label yashiriladi, hover tooltip ko'rsatiladi.
- Footer: rol badge. `ROLE_LABELS = {admin:'Administrator', cashier:'Kassir', warehouse:'Omborchi', staff:'Xodim'}`.

### 0.6 WebSocket umumiy pattern (TasksPage Logs, ReviewPage, MyTasksPage da bir xil)
```
const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
const ws = new WebSocket(`${protocol}//${window.location.host}/ws/tasks/${targetId}`)
```
- Keep-alive: har 25000ms `ws.send('ping')` (agar `readyState === OPEN`).
- `onclose`: pingTimer tozalanadi; agar `!closed` bo'lsa 3000ms dan keyin `connect()` qayta urinadi (auto-reconnect).
- `onerror`: `ws.close()`.
- Cleanup: `closed=true`, `clearTimeout(reconnectTimer)`, `wsRef.current?.close()`.
- `targetId`: xodim uchun `employee_id`; admin kanal uchun `0`; checker uchun `checker_id`.
- Xabarlar JSON.parse qilinadi, malformed bo'lsa jim e'tiborsiz qoldiriladi.

---

## 1. SAHIFA: TasksPage (`/tasks`) — `pages/TasksPage.jsx` (2067 qator)

Bu admin sahifasi. 2 tab: **"Vazifa shablonlar"** (templates) va **"Vazifa tarixi"** (logs).

### 1.0 Asosiy komponent — `TasksPage`
- State: `tab` (default `'templates'`, qiymatlar `'templates' | 'logs'`), `employees` (default `[]`).
- Mount'da: `GET /employees/ ?active_only=true` → `setEmployees(res.data.items || res.data)`. Xato jim yutiladi.
- Header: h1 "Vazifalar", subtitle "Vazifa shablonlari va yuborish tarixi".
- Tab tugmalari (segmented control, `bg-gray-100` konteyner):
  - "Vazifa shablonlar" (ClipboardList ikonka) → `setTab('templates')`.
  - "Vazifa tarixi" (History ikonka) → `setTab('logs')`.
  - Active tab: `bg-white dark:bg-gray-700 shadow-sm`.
- Content: `tab === 'templates' ? <TemplatesTab employees={employees}/> : <LogsTab/>`.

### 1.1 Konstantalar (1:1 ko'chirish kerak)

**TRIGGER_LABELS**: `{manual:"Qo'lda", scheduled:"Vaqt bo'yicha", event:'Hodisa'}`
**TRIGGER_COLORS**: manual → `bg-gray-100 text-gray-700 ...`; scheduled → `bg-blue-100 text-blue-700 ...`; event → `bg-purple-100 text-purple-700 ...`

**DOC_TYPES** (12 ta, `value` + `label` + `states` massivi):
| value | label | states |
|---|---|---|
| customerorder | Buyurtma | ['Текширилмаган','Текширилди','Карз колди','Туланди'] |
| demand | Sotish (chiqim) | ['Status','Xabar yuborish'] |
| supply | Kirim (tovar olish) | ['Киритилди','Текширилди'] |
| salesreturn | Qaytarish (sotuvdan) | [] |
| purchasereturn | Qaytarish (kirimdan) | [] |
| move | Ko'chirish (omborlar arasi) | [] |
| paymentin | Kiruvchi to'lov | [] |
| paymentout | Chiquvchi to'lov | [] |
| loss | Hisobdan chiqarish | [] |
| enter | Kirim (qo'shimcha) | [] |
| inventory | Inventarizatsiya | ['Яратилди','Списание','Оприходование','Ревизия килинди'] |
| purchaseorder | Yetkazuvchiga buyurtma | [] |

**ACTIONS** (3 ta): `{new:'Yangi yaratildi', updated:"O'zgartirildi", large_sale:'Katta summa (>X)'}`

**EVENT_LABELS** (legacy compat): `{supply:'Kirim (tovar olish)', large_sale:'Katta summa', kassa_close:'Kassa yopish'}`

**`eventLabel(eventType)`**: bo'sh → `''`. Agar `EVENT_LABELS[eventType]` bor → uni qaytaradi. Agar `:` bor → `[doc,action]` ga ajratadi, `DOC_TYPES`/`ACTIONS` dan label topadi → `"${docLabel} → ${actLabel}"`. Aks holda `eventType` o'zi.

**STATUS_COLORS**: sent→blue, pending_review→amber, answered_yes→green, answered_no→red, answered_text→teal, failed→gray (to'liq class string'lar yuqorida).
**STATUS_LABELS**: `{sent:'Yuborildi', pending_review:'Tasdiq kutmoqda', answered_yes:'Ha', answered_no:"Yo'q", answered_text:'Javob berildi', failed:'Yuborilmadi'}`

**WEEK_DAYS**: `[{value:'1',label:'Du',full:'Dushanba'}, ...'2'Se/Seshanba, '3'Cho/Chorshanba, '4'Pa/Payshanba, '5'Ju/Juma, '6'Sha/Shanba, '7'Ya/Yakshanba]`

**PRIORITY_OPTIONS**: `low`→"Oddiy"(gray), `medium`→"O'rta"(blue), `high`→"Muhim"(amber), `urgent`→"Shoshilinch"(red). `PRIORITY_MAP = Object.fromEntries(...)`.

**EMPTY_TEMPLATE** (yangi shablon default):
```js
{
  title:'', description:'', employee_id:'', assigned_role:'',
  trigger_type:'manual', schedule_time:'09:00', schedule_days:'all',
  schedule_mode:'weekly', schedule_month_day:'1',
  event_type:'customerorder:new', _event_doc:'customerorder', _event_action:'new',
  large_sale_threshold:'', response_type:'none', is_active:true,
  depends_on_template_id:'', department:'', priority:'medium',
  reward_amount:'', fine_amount:'', deadline_minutes:'', checker_id:''
}
```

---

### 1.2 SUB-KOMPONENT: TemplatesTab

**State:**
- `templates` (`[]`) — shablonlar ro'yxati.
- `departments` (`[]`) — bo'limlar.
- `roles` (`[]`) — rollar (API'dan dinamik).
- `loading` (`true`).
- `modal` (`null`) — `null | 'add' | <template object>`.
- `sending` (`null`) — qaysi template ID hozir yuborilmoqda.
- `colFilters` (`{department:[], trigger:[], status:[], priority:[], time:[], assignee:[]}`) — multi-select filtrlar.
- `sortState` (`{field:null, dir:null}`).
- `activeFilter` (`null`) — ochiq dropdown field nomi.

**API chaqiruvlar (mount'da, `useEffect`):**
- `fetchTemplates`: `GET /tasks/templates` → `setTemplates(res.data.items || res.data)`. Xato → toast.error('Shablonlar yuklanmadi'). `finally` loading=false.
- `fetchDepartments`: `GET /tasks/departments` → `setDepartments(res.data)`. Xato jim.
- `fetchRoles`: `GET /employees/meta/roles` → `setRoles(res.data.items || [])`. Xato jim.

**Tugmalar:**
- **"Shablon qo'shish"** (Plus ikonka, o'ng yuqorida): `setModal('add')` → TemplateModal ochiladi (yangi rejim).
- **Send ikonka** (har qatorda, "Hozir yuborish" title): `handleSendNow(t)` → `setSending(t.id)`, `POST /tasks/templates/${t.id}/send` → success toast 'Yuborildi', xato 'Yuborishda xatolik'. `finally setSending(null)`. Yuborilayotganda Loader2 spinner.
- **Edit ikonka** (Edit2, "Tahrirlash"): `setModal(t)` → TemplateModal ochiladi (tahrir rejim, `t` obyekti bilan).
- **Trash ikonka** (Trash2, "O'chirish"): `handleDelete(t)` → `confirm("\"${t.title}\" shablonini o'chirmoqchimisiz?")`. OK → `DELETE /tasks/templates/${t.id}`, success "O'chirildi" + `fetchTemplates()`, xato 'Xatolik'.

**Filter mantiqi (client-side, MUHIM AYNAN):**

Unique qiymatlar quriladi:
- `uniqueDepts = [...new Set(templates.map(t=>t.department).filter(Boolean))]`
- `uniqueTriggers = [...new Set(templates.map(t=>t.trigger_type).filter(Boolean))]`
- `uniqueTimes = [...new Set(templates.map(t=>t.schedule_time).filter(Boolean))].sort()`

`filtered = templates.filter(t => {...})` — har shart:
- `colFilters.department.length && !colFilters.department.includes(t.department || '')` → chiqarib tashlash.
- `colFilters.trigger.length && !colFilters.trigger.includes(t.trigger_type)` → chiqarish.
- `colFilters.status.length` bo'lsa: `isActive = t.is_active`. Agar `status` faqat 'active' (inactive yo'q) va `!isActive` → chiqarish. Agar faqat 'inactive' va `isActive` → chiqarish. (Ya'ni ikkalasi tanlangan bo'lsa hammasi qoladi.)
- `colFilters.priority.length && !colFilters.priority.includes(t.priority || 'medium')` → chiqarish.
- `colFilters.time.length && !colFilters.time.includes(t.schedule_time || '')` → chiqarish.
- `colFilters.assignee.length`: `key = t.checker_id ? 'chk:'+t.checker_id : 'none'`. `!colFilters.assignee.includes(key)` → chiqarish.

**Sort mantiqi:** `sorted = [...filtered].sort(...)`. `!sortState.field || !sortState.dir` → 0. `dir = asc?1:-1`. Field bo'yicha:
- `title`: `a.title||''` vs `b.title||''`.
- `department`: `a.department||''`.
- `trigger`: `a.trigger_type||''`.
- `priority`: order map `{low:0,medium:1,high:2,urgent:3}`, `order[a.priority||'medium'] ?? 1`.
- `status`: `a.is_active?1:0`.
- `time`: `a.schedule_time||''`.
- Solishtirish: number bo'lsa `(va-vb)*dir`, string bo'lsa `va.localeCompare(vb,'uz')*dir`.

`totalFilters = Object.values(colFilters).reduce((s,a)=>s+a.length,0)`.
`clearAll()`: barcha colFilters'ni bo'sh massivga, sortState'ni `{field:null,dir:null}` ga.

**assigneeBuckets** (Tekshiruvchi filtri uchun):
- Map quriladi: har template uchun `key = t.checker_id ? 'chk:'+t.checker_id : 'none'`, `label = t.checker_id ? '🛡 '+(t.checker_name || 'Tekshiruvchi #'+t.checker_id) : '— tekshiruvchisiz —'`, `count++`.
- `[...map.values()].sort((a,b)=>b.count-a.count)` (count kamayish bo'yicha).

**filterCols** — 8 ustun konfiguratsiyasi (`field, label, sortLabels, options`):
1. `title` "Sarlavha" — options: unique titlelar, har biri `{value, label, count: templates.filter(x=>x.title===t).length}`.
2. `department` "Bo'lim" — badge: indigo nuqta + nom.
3. `assignee` "Tekshiruvchi" — `assigneeBuckets`.
4. `trigger` "Trigger" — badge: TRIGGER_COLORS bilan.
5. `time` "Vaqt" — sortLabels `['Erta → Kech','Kech → Erta']`, badge: Clock ikonka + vaqt.
6. `priority` "Muhimlik" — sortLabels `['Oddiy → Shoshilinch','Shoshilinch → Oddiy']`, badge: PRIORITY color.
7. `status` "Holat" — sortLabels `['Faol → Nofaol','Nofaol → Faol']`, options: `active`("Faol", green nuqta, count), `inactive`("Nofaol", gray nuqta, count).

**Filter Bar** (faqat `!loading && templates.length>0` bo'lganda ko'rinadi):
- "Barchasi {templates.length}" tugma — `clearAll()`. `totalFilters===0` bo'lsa primary rangda.
- Har `filterCols` uchun tugma: label + agar `sel.length>0` bo'lsa primary doiradagi son + sort strelka + ChevronDown (ochiq bo'lsa `rotate-180`). Bosilganda `setActiveFilter(activeFilter===col.field ? null : col.field)`.
- Ochiq bo'lsa `<TaskColumnFilter>` render qilinadi (pastda batafsil).
- Active filter teglari (`totalFilters>0`): department (indigo), trigger (TRIGGER_COLORS), time (blue), priority (PRIORITY color), status (green) — har biri X tugma bilan o'chiriladi (`setColFilters(f=>({...f, <field>: f.<field>.filter(x=>x!==v)}))`). Oxirida X tugma `clearAll()`.

**Jadval ustunlari (9 ta):** Sarlavha | Bo'lim | Tekshiruvchi | Trigger | Vaqt | Muhimlik | Javob | Holat | (amallar).
- Loading: 3 ta `h-14` skeleton pulse.
- Bo'sh (`templates.length===0`): ClipboardList ikonka + "Shablonlar topilmadi".
- Filter natijasi bo'sh (`sorted.length===0`): "Filter natijasi bo'sh".

**Har qator (sorted.map):**
- **Sarlavha ustuni:** `t.title` (bold). `t.description` bor → kichik gray (`truncate max-w-xs`). Agar `trigger_type==='scheduled'` → ko'k qatorda Clock + `t.schedule_time` + kun matni:
  - `schedule_days` `'monthly:'` bilan boshlansa → ` · Har oyning {split(':')[1]}-sanasi`
  - `'all'` → ` · Har kuni`
  - `'1,2,3,4,5'` → ` · Du–Ju`
  - `'6,7'` → ` · Dam olish`
  - boshqa → ` · {kunlar WEEK_DAYS label'lari vergul bilan}`
  - Agar `trigger_type==='event'` → binafsha Zap + `eventLabel(t.event_type)`.
  - Agar `t.depends_on_title` → amber Link + `{depends_on_title} → keyin`.
  - Agar `deadline_minutes||reward_amount||fine_amount` → kichik teglar: `⏳ {>=60 ? Xs Yd : Xd}` (amber), `+{reward.toLocaleString('uz-UZ')}` (green), `-{fine.toLocaleString('uz-UZ')}` (red).
- **Bo'lim:** `t.department` bor → indigo pill; yo'q → "—".
- **Tekshiruvchi:** `t.checker_id` bor → ShieldCheck + `t.checker_name || '#'+checker_id` (blue pill); yo'q → "— tekshiruvchisiz —".
- **Trigger:** TRIGGER_COLORS pill + TRIGGER_LABELS.
- **Vaqt:** `t.schedule_time` yoki "—".
- **Muhimlik:** `PRIORITY_MAP[t.priority||'medium'] || medium` → color pill + label.
- **Javob:** `response_type==='none'?'Kerak emas':'yes_no'?"Ha / Yo'q":'Matn'`.
- **Holat:** `t.is_active` → "Faol" (green), aks → "Nofaol" (gray).
- **Amallar:** Send (sending===t.id bo'lsa spinner) | Edit2 | Trash2.

**Modal render:** `modal && <TemplateModal template={modal==='add'?null:modal} employees={employees} allTemplates={templates} departments={departments} onDeptChange={setDepartments} roles={roles} onRolesChange={setRoles} onClose={()=>setModal(null)} onSave={()=>{fetchTemplates();fetchDepartments()}} />`.

---

### 1.3 SUB-KOMPONENT: TaskColumnFilter (qayta ishlatiluvchi dropdown)

Props: `options, selected, onChange, onClear, sort, onSort, onClose, sortLabels`.

- State: `search` (`''`). `ref` — dropdown DOM.
- `useEffect`: `mousedown` listener — agar `ref.current && !ref.current.contains(e.target)` → `onClose()`. Cleanup'da olib tashlanadi.
- `filteredOptions = options.filter(o => o.label.toLowerCase().includes(search.toLowerCase()))`.
- `toggleValue(val)`: `selected.includes(val)` ? `onChange(selected.filter(v=>v!==val))` : `onChange([...selected,val])`.

**Tuzilishi (absolyut pozitsiyalangan, `top-full left-0 mt-1`):**
1. **Sort qismi** (yuqori, border-b):
   - "↑ {sortLabels?.[0] || 'A → Я'}" tugma — `onSort(sort==='asc'?null:'asc'); onClose()`. Active (`sort==='asc'`) primary rangda.
   - "↓ {sortLabels?.[1] || 'Я → A'}" tugma — `onSort(sort==='desc'?null:'desc'); onClose()`.
2. **Qidiruv** (faqat `options.length>4` bo'lganda): Search ikonka + autoFocus input, `value=search`.
3. **"FILTRLASH"** label.
4. **Optionlar ro'yxati** (`max-h-[220px] overflow-y-auto`):
   - Bo'sh → "Topilmadi".
   - Har option: tugma, chap tomonda checkbox kvadrat (`checked` bo'lsa primary fon + CheckCircle), keyin `opt.badge || opt.label`, o'ngda `opt.count` (agar `!= null`). Bosilganda `toggleValue(opt.value)`.
5. **Footer** (`selected.length>0`): "Tozalash ({selected.length})" — `onClear()`.

---

### 1.4 SUB-MODAL: TemplateModal (eng muhim — 16+ input)

Props: `template, employees, allTemplates, departments, onDeptChange, roles, onRolesChange, onClose, onSave`.

- `isEdit = !!template`.
- Lokal state: `newDept` (`''`), `newRole` (`''`), `showRoleAdd` (`false`), `saving` (`false`).
- **`form` state init:**
  - Agar `template` bor (tahrir): har field `template.<x> || default`. Maxsus:
    - `schedule_days`: agar `template.schedule_days?.startsWith('monthly:')` → `'all'`, aks `template.schedule_days || 'all'`.
    - `schedule_mode`: `startsWith('monthly:')` → `'monthly'`, aks `'weekly'`.
    - `schedule_month_day`: `monthly:` → `split(':')[1]`, aks `'1'`.
    - `_event_doc`: `(template.event_type||'').split(':')[0] || 'customerorder'`.
    - `_event_action`: `(template.event_type||'').split(':')[1] || 'new'`.
    - `is_active`: `template.is_active !== false`.
  - Aks holda: `{...EMPTY_TEMPLATE}`.
- `set(key,val) = setForm(f=>({...f,[key]:val}))`.

**Dept/Role qo'shish/o'chirish:**
- `handleAddDept`: `name=newDept.trim()`. Bo'sh → return. `POST /tasks/departments {name}` → `onDeptChange(res.data)`, `set('department',name)`, `setNewDept('')`. Xato → toast.error('Xatolik').
- `handleAddRole`: `val=newRole.trim().toLowerCase().replace(/\s+/g,'_')`. Bo'sh → return. Agar `roles` ichida `r.value===val` bor → toast.error('Bu rol mavjud') return. `POST /employees/meta/roles {value:val, label:newRole.trim()}` → `onRolesChange(res.data.items)`, reset, `setShowRoleAdd(false)`.
- `handleDeleteRole(e,roleValue)`: `e.stopPropagation()`. Agar `roleValue==='admin'||'staff'` → toast.error("Bu rolni o'chirib bo'lmaydi") return. `DELETE /employees/meta/roles/${roleValue}` → `onRolesChange(res.data.items)`, agar `form.assigned_role===roleValue` → `set('assigned_role','')`.

**`handleSave()` — VALIDATSIYA va PAYLOAD (AYNAN):**
1. `if (!form.title.trim()) { toast.error("Sarlavha kiritng"); return }`
2. `if (!form.employee_id && !form.assigned_role) { toast.error("Xodim yoki rol tanlang"); return }`
3. `setSaving(true)`.
4. `scheduleDays = form.schedule_mode==='monthly' ? 'monthly:'+form.schedule_month_day : form.schedule_days`.
5. `form` dan `schedule_mode`, `schedule_month_day` chiqarib tashlanadi (`...rest`).
6. **payload:**
```js
{
  ...rest,                                  // _event_doc, _event_action ham boradi
  schedule_days: scheduleDays,
  employee_id: form.employee_id ? Number(form.employee_id) : null,
  assigned_role: form.employee_id ? null : (form.assigned_role || null),
  large_sale_threshold: form.large_sale_threshold ? Number(...) : null,
  depends_on_template_id: form.depends_on_template_id ? Number(...) : null,
  department: form.department || null,
  priority: form.priority || 'medium',
  reward_amount: form.reward_amount ? Number(...) : null,
  fine_amount: form.fine_amount ? Number(...) : null,
  deadline_minutes: form.deadline_minutes ? Number(...) : null,
  checker_id: form.checker_id ? Number(...) : null,
}
```
7. `isEdit` → `PUT /tasks/templates/${template.id}` payload; aks → `POST /tasks/templates` payload.
8. Success: toast `isEdit?'Yangilandi':"Shablon qo'shildi"`, `onSave()`, `onClose()`.
9. Xato → toast.error('Xatolik yuz berdi'). `finally setSaving(false)`.

**Modal inputlari (tartib bo'yicha, `max-w-lg`, `max-h-[90vh] overflow-y-auto`):**

1. **Sarlavha \*** — text input, placeholder "Kassa yopish hisoboti", `value=form.title`.
2. **Tavsif** — textarea rows=2, `value=form.description`.
3. **Xodim (aniq)** — select. `<option value="">— Xodimni tanlang —</option>` + `employees.map(emp => option value=emp.id label=emp.name)`. onChange: `set('employee_id', val)`; agar val bor → `set('assigned_role','')`.
4. **Yoki rol bo'yicha** — label o'ngida (faqat `!form.employee_id`) "Rol qo'shish" tugma (`setShowRoleAdd(v=>!v)`). Select: `disabled={!!form.employee_id}`. Optionlar: `""→"— Xodim tanlang —"`, `"all"→"Barchaga"`, `roles.map(r=>option value=r.value label=r.label)`. onChange: `set('assigned_role',val)`; val bor → `set('employee_id','')`.
   - Rol teglari (faqat `!form.employee_id` va `roles` da admin/staff bo'lmagan rollar bor): har biri pill + X (handleDeleteRole).
   - `showRoleAdd` bo'lsa inline: input (autoFocus, Enter→handleAddRole) + "Qo'sh" tugma + X (close+reset).
5. **Bo'lim** — FolderOpen ikonka label. Select: `""→"— Bo'lim tanlang —"` + `departments.map`. Pastda: input (`newDept`, Enter→handleAddDept) + "Qo'shish" tugma (`disabled={!newDept.trim()}`). Dept teglari: har biri pill + X — onClick: `DELETE /tasks/departments/${encodeURIComponent(d)}` → `onDeptChange(res.data)`, agar `form.department===d` → `set('department','')`.
6. **Muhimlik darajasi** — 4 tugma (PRIORITY_OPTIONS). Active: `p.color + ' border-current shadow-sm'`. onClick `set('priority',p.value)`.
7. **Trigger turi \*** — select, `Object.entries(TRIGGER_LABELS)` (manual/scheduled/event).
8. **Scheduled bloki** (faqat `form.trigger_type==='scheduled'`, ko'k border):
   - **Vaqt** — `type="time"`, `value=form.schedule_time`.
   - **Takrorlanish turi** — 2 tugma "Haftalik"/"Oylik" → `set('schedule_mode', ...)`.
   - **Weekly** (`schedule_mode==='weekly'`): 7 kun tugmalari (WEEK_DAYS). `selectedDays = schedule_days==='all' ? ['1'..'7'] : schedule_days.split(',').filter(Boolean)`. Tugma bosilganda: `isSelected` ? olib tashlash : qo'shish+sort. Agar `newDays.length===0` → `[wd.value]`. `set('schedule_days', newDays.length===7?'all':newDays.join(','))`. Pastda quick-tugmalar: "Har kuni"(`'all'`), "Du–Ju"(`'1,2,3,4,5'`), "Dam olish"(`'6,7'`).
   - **Monthly** (`schedule_mode==='monthly'`): 1–31 grid (7 ustun). `set('schedule_month_day', String(day))`. Pastda info matn "Har oyning {schedule_month_day}-sanasida soat {schedule_time} da yuboriladi".
9. **Event bloki** (faqat `trigger_type==='event'`, binafsha border) — IIFE:
   - `selectedDoc = DOC_TYPES.find(d=>d.value===form._event_doc)`. `docStates = selectedDoc?.states||[]`. `actionOptions = [...ACTIONS, ...docStates.map(s=>({value:s,label:'Status: '+s}))]`.
   - **Hujjat turi** select — `DOC_TYPES`. onChange: `set('_event_doc',doc)`, `set('_event_action','new')`, `set('event_type', doc+':new')`.
   - **Hodisa** select — `actionOptions`. onChange: `set('_event_action',action)`, `set('event_type', form._event_doc+':'+action)`.
   - Agar `_event_action==='large_sale'` → **Minimal summa (so'm)** number input, `value=form.large_sale_threshold`.
   - Info matn: doc + (`new`→'yangi yaratilganda', `updated`→"o'zgartirilganda", `large_sale`→"katta summa bo'lganda", aks→`"${action}" statusga o'tganda`) + "vazifa avtomatik yuboriladi".
10. **Javob turi** — select: `none`→"Javob kerak emas", `yes_no`→"Ha / Yo'q", `text`→"Matnli javob".
11. **Muddat (daqiqa)** — preset tugmalar `[30,60,120,240,480]` (`m<60?'X daq':'X soat'`), active: `Number(form.deadline_minutes)===m`. Yana number input (`w-24`, placeholder "Boshqa", min=1). Agar `deadline_minutes` bor → amber matn "⏳ {>=60? X soat Y daqiqa : X daqiqa} ichida bajarilmasa avtomatik 'Yo'q' bo'ladi".
12. **Mukofot (bonus)** + **Jarima (fine)** — 2 ustun, number inputlar. Agar to'ldirilsa: yashil "+{toLocaleString('uz-UZ')}" / qizil "-{...}".
13. **Tekshiruvchi** (ko'k blok) — IIFE: `checkers = employees.filter(e=>e.is_checker)`. Select: `disabled={checkers.length===0}`. Optionlar: `""→"— Tekshiruvsiz (avto) —"` + `checkers.map(c=>option value=c.id label=c.name)`. Info matn 3 holat: `form.checker_id` bor → "Xodim 'Bajardim' desa, vazifa shu odamning tasdig'iga yuboriladi..."; `checkers.length===0` → "Tekshiruvchi tayinlash uchun Xodimlar bo'limida..."; aks → "Tekshiruvchi tanlanmasa, xodim 'Ha' deganda darhol bajarilgan...".
14. **Oldingi vazifa (zanjir)** (amber blok) — IIFE: `candidateTemplates = allTemplates.filter(t => { if(isEdit && t.id===template.id) return false; if(form.employee_id) return t.employee_id===Number(form.employee_id); if(form.assigned_role) return t.assigned_role===form.assigned_role; return false })`. Faqat `candidateTemplates.length>0` bo'lsa render. Select: `""→"— Mustaqil (zanjir yo'q) —"` + candidate'lar. Tanlansa amber info matn.
15. **Shablon faol** — checkbox `id="is_active"`, `checked=form.is_active`.

**Footer:** "Saqlash" tugma (`disabled=saving`, saving bo'lsa Loader2) + "Bekor qilish" (`onClose`).

---

### 1.5 SUB-MODAL: AnswerModal (LogsTab uchun — admin javob beradi)

Props: `log, onClose, onSave`.
- State: `answer` (`''`), `saving` (`false`). `isYesNo = log.response_type === 'yes_no'`.
- `handleAnswer(val)`: `setSaving(true)`. payload: `val==='yes'?{status:'answered_yes'}:val==='no'?{status:'answered_no'}:{status:'answered_text',response_text:val}`. `PATCH /tasks/logs/${log.id}/answer` payload → success 'Javob saqlandi', `onSave()`, `onClose()`. Xato 'Xatolik yuz berdi'. `finally saving=false`.
- UI: h3 "Javob yozish", `log.template_title`.
  - `isYesNo` → 2 tugma: "Ha" (CheckCircle, btn-primary, `handleAnswer('yes')`), "Yo'q" (XCircle, btn-danger, `handleAnswer('no')`). Pastda alohida "Bekor qilish".
  - aks (text) → textarea rows=3 (`value=answer`), "Yuborish" tugma (`disabled=saving||!answer.trim()`) + "Bekor qilish".

---

### 1.6 SUB-KOMPONENT: LogsTab

`LOGS_PAGE_SIZE = 50`.

**State:**
- `logs` (`[]`), `total` (`0`), `loading` (`true`), `answerModal` (`null`). `wsRef` (ref).
- `colFilters` (`{templates:[], employees:[], statuses:[]}`).
- `activeFilter` (`null`).
- `responseSearch` (`''`) — qo'llaniladigan qidiruv (debounced).
- `searchInput` (`''`) — input qiymati (debounce manbasi).
- `dateFrom` (`''`), `dateTo` (`''`) — `datetime-local` qiymatlari.
- `sortState` (`{field:'created_at', dir:'desc'}`) — **default sort vaqt kamayish**.
- `page` (`1`).
- `filterOptions` (`{total:0, templates:[], employees:[], statuses:[]}`) — butun TaskLog jadvalidan distinct + count.
- `filtersRef` — har renderda yangilanadi: `{colFilters,responseSearch,dateFrom,dateTo,sortState,page}` (WS handlerlari uchun snapshot).

**Debounce (350ms):** `useEffect([searchInput])` → 350ms `setTimeout`: agar `searchInput !== responseSearch` → `setResponseSearch(searchInput)`, `setPage(1)`. Cleanup'da `clearTimeout`.

**API chaqiruvlar:**
- `fetchLogs(silent=false)`: `!silent` → loading=true. params:
```js
{ limit:LOGS_PAGE_SIZE, offset:(page-1)*LOGS_PAGE_SIZE, sort_by:sortState.field, sort_dir:sortState.dir }
```
  - `colFilters.templates.length` → `params.template_titles = join(',')`.
  - `colFilters.employees.length` → `params.employee_names = join(',')`.
  - `colFilters.statuses.length` → `params.statuses = join(',')`.
  - `responseSearch` → `params.response_search`.
  - `dateFrom` → `params.date_from`; `dateTo` → `params.date_to`.
  - `GET /tasks/logs` {params} → `setLogs(res.data.items||[])`, `setTotal(res.data.total||0)`. Xato (non-silent) → toast.error('Tarix yuklanmadi'). Deps: page, sort, colFilters.*, responseSearch, dateFrom, dateTo.
- `fetchFilterOptions`: `GET /tasks/logs/filter-options` → `setFilterOptions(res.data)`. Xato jim.
- `useEffect`: `fetchLogs()` har deps o'zgarganda.
- `useEffect`: `fetchFilterOptions()` mount'da + `setInterval(...,60000)` har 1 daqiqada.

**WebSocket (admin kanal, targetId=0):** `ws://.../ws/tasks/0`.
- `new_task`: `task=data.task`. `isDefault = f.page===1 && f.sortState.field==='created_at' && f.sortState.dir==='desc' && barcha colFilters bo'sh && !responseSearch && !dateFrom && !dateTo`. Agar isDefault → `setLogs(prev => prev.find(l=>l.id===task.id) ? prev : [task,...prev])`. Toast `Yangi vazifa yuborildi: ${task.template_title}` (icon 📋).
- `task_answered`: `setLogs(prev => prev.map(l => l.id===data.task_id ? {...l, status:data.status, response_text:data.response_text||l.response_text, answered_at:data.answered_at||l.answered_at} : l))`. Toast.success `${data.employee_name||'Xodim'} javob berdi`.

**Conditional rendering shartlari (AYNAN):**
- `canAnswer(log) = log.status==='sent' && log.response_type && log.response_type!=='none'`.
- `user = useAuthStore(s=>s.user)`. `canReview(log) = log.status==='pending_review' && (user?.is_admin || (user?.is_checker && log.checker_id===user.employee_id))`.

**`quickReview(log,decision)`** (inline, modalsiz, izohsiz): `PATCH /tasks/logs/${log.id}/review {decision}` → `setLogs(prev=>prev.map(l => l.id===log.id ? {...l, status:res.data.final_status, reviewed_by_name:user?.name} : l))`. Toast.success `decision==='approve'?'Tasdiqlandi':'Rad etildi'`. Xato → `err.response?.data?.detail || 'Xatolik'`.

**StatusIcon ({log})** — chap ustun, FAQAT review holati:
- `if (!log.checker_id) return null` (tekshiruvchisiz vazifalar uchun ikona yo'q).
- `log.status==='pending_review'` → ko'k doira + spinning Loader2, title "Tasdiq kutilmoqda".
- `log.reviewed_by_name && (status==='answered_yes'||'answered_text')` → yashil doira + Check (strokeWidth=3), title `${reviewed_by_name} tasdiqladi`.
- `log.reviewed_by_name && status==='answered_no'` → qizil doira + X, title `${reviewed_by_name} rad qildi`.
- Aks holda `return null` (qisqa tutashgan holatlar).

**Boshqa state:**
- `useEffect([activeFilter])`: agar `activeFilter` bor → `click` listener `setActiveFilter(null)`.
- `totalSelected = templates.length+employees.length+statuses.length`.
- `hasAnyFilter = totalSelected>0 || responseSearch || dateFrom || dateTo`.
- `totalPages = Math.max(1, Math.ceil(total/LOGS_PAGE_SIZE))`.
- `clearAll()`: colFilters bo'sh, responseSearch/searchInput/dateFrom/dateTo bo'sh, sortState `{created_at,desc}`, page=1.

**Sub-komponentlar:**
- `Chip ({label,onRemove})` — primary pill + X.
- `ColumnHeader ({field,sortField,label,options,filterField,sortLabels})` — `<th>` ichida tugma: label + selected son badge + sort strelka + ChevronDown. Bosilganda `setActiveFilter(open?null:field)`. Ochiq → `<TaskColumnFilter>`:
  - `onChange`: `setColFilters(f=>({...f,[filterField]:v}))`, `setPage(1)`.
  - `onClear`: bo'sh + page=1.
  - `onSort(dir)`: `dir==null` → `setSortState({field:'created_at',dir:'desc'})`; aks → `setSortState({field:sortField,dir})`. `setPage(1)`.

**Render:**
- **Filter toolbar** (`card p-3 mb-3`):
  - Qidiruv input (`searchInput`, placeholder "Javob matnida qidirish..."). Agar `searchInput` bor → X tugma (input/responseSearch bo'sh, page=1).
  - Calendar ikonka + 2 `datetime-local`: `dateFrom` (onChange page=1), "—", `dateTo` (onChange page=1).
  - `hasAnyFilter` → "Tozalash" tugma (`clearAll`, ml-auto).
  - `hasAnyFilter` → chiplar: Filter ikonka + "{total} ta natija" + har kriteriya chip: `Vazifa: {t}`, `Xodim: {e}`, `Holat: {STATUS_LABELS[s]||s}`, `Javob: "{responseSearch}"`, `{dateFrom||'…'} — {dateTo||'…'}`.
- **Jadval:**
  - Loading: 4 ta `h-12` skeleton.
  - `logs.length===0` → History ikonka + (`hasAnyFilter?"Filter bo'yicha natija topilmadi":'Tarix mavjud emas'`).
  - Ustunlar: (StatusIcon, w-10) | **Vazifa** (ColumnHeader, filterField=templates, options=`filterOptions.templates.map(o=>({value:o.value,label:o.value,count:o.count}))`) | **Xodim** (employees) | **Holat** (statuses, label=`STATUS_LABELS[o.value]||o.value`) | Javob (oddiy th) | **Vaqt** (oddiy th, tugma: bosilganda `next = sortState.field==='created_at'&&dir==='desc'?'asc':'desc'`, `setSortState({created_at,next})`, page=1) | (amallar).
  - Har qator:
    - StatusIcon ustuni.
    - Vazifa: `log.template_title||'—'` (bold). Agar `reviewed_by_name` → kichik gray ShieldCheck + (`status==='answered_no'? reviewed_by_name+' rad qildi' : reviewed_by_name+' tasdiqladi'`). Agar `status==='pending_review' && !reviewed_by_name` → ko'k spinner + "Tasdiq kutilmoqda".
    - Xodim: `log.employee_name||'—'`.
    - Holat: `STATUS_COLORS[log.status]||failed` pill + `STATUS_LABELS[log.status]||log.status`.
    - Javob: `log.response_text||'—'` (`whitespace-pre-wrap break-words max-w-xs`).
    - Vaqt: agar `answered_at` → yashil "Javob: {fmtDateTime(answered_at)}" + br + "Yuborildi: {fmtDateTime(sent_at)}"; aks → `fmtDateTime(sent_at)`.
    - Amallar: agar `canReview(log)` → 2 tugma Check (`quickReview(log,'approve')`, yashil) + X (`quickReview(log,'reject')`, qizil); aks agar `canAnswer(log)` → "Javob" tugma (`setAnswerModal(log)`); aks → null.
  - **Pagination** (faqat `total>LOGS_PAGE_SIZE`): chapda "{(page-1)*50+1}–{min(page*50,total)} / {total}". O'ngda: «(page=1), "Oldingi"(`p=>max(1,p-1)`), "{page} / {totalPages}", "Keyingi"(`min(totalPages,p+1)`), »(page=totalPages). Tegishli disabled.
- `answerModal && <AnswerModal log={answerModal} onClose={()=>setAnswerModal(null)} onSave={()=>fetchLogs(true)} />`.

---

## 2. SAHIFA: ReviewPage (`/review`) — `pages/ReviewPage.jsx`

Tekshiruvchi (yoki admin) tasdiq kutayotgan vazifalarni ko'radi/hal qiladi.

**State:**
- `user = useAuthStore(s=>s.user)`. `checkerId = user?.is_admin ? null : user?.employee_id`.
- `items` (`[]`), `loading` (`true`), `reviewing` (`null` — `{log,decision}`), `submitting` (`false`). `wsRef`.

**API — `fetchPending(silent=false)`:**
- Agar `!checkerId && !user?.is_admin` → `setLoading(false)` return (boshqa hech narsa).
- `!silent` → loading=true.
- Agar `user?.is_admin` → `GET /tasks/logs ?statuses=pending_review&limit=100&sort_by=answered_at&sort_dir=desc` (admin barcha checkerlarni ko'radi).
- Aks → `GET /tasks/pending-review ?checker_id=${checkerId}` (faqat o'z navbati).
- `setItems(res.data.items||[])`. Xato (non-silent) → toast.error('Yuklanmadi'). `finally` non-silent loading=false.
- `useEffect`: mount'da `fetchPending()`.

**WebSocket:** agar `!checkerId && !user?.is_admin` → return (ulanmaydi). `targetId = user?.is_admin ? 0 : checkerId`. `ws://.../ws/tasks/${targetId}`.
- `pending_review` → `fetchPending(true)` (to'liq qayta yuklash) + toast `Yangi tekshiruv: ${data.template_title}` (icon 🔍).
- `task_reviewed` → `setItems(prev=>prev.filter(l=>l.id!==data.task_id))` (boshqa tekshiruvchi hal qildi, ro'yxatdan olib tashlash).

**`submitReview(comment)`:** agar `!reviewing` return. `setSubmitting(true)`. `PATCH /tasks/logs/${reviewing.log.id}/review {decision:reviewing.decision, comment}` → toast.success `approve?'Tasdiqlandi':'Rad etildi'`, `setReviewing(null)`, optimistik `setItems(prev=>prev.filter(l=>l.id!==reviewing.log.id))`. Xato → `err.response?.data?.detail||'Xatolik'`. `finally submitting=false`.

**UI:**
- Header: ShieldCheck ikonka, h1 "Tekshiruv", "Tasdiq kutayotgan vazifalar: {items.length}". O'ngda "Yangilash" tugma (`fetchPending()`, `disabled=loading`, loading bo'lsa spin).
- Loading → 3 ta `h-24` skeleton.
- `items.length===0` → History ikonka + "Tasdiq kutayotgan vazifa yo'q".
- Har item card:
  - Sarlavha `log.template_title`. Meta: User ikonka + `log.employee_name`, Clock + `fmtDateTime(log.answered_at)`. O'ngda amber "Tasdiq kutmoqda" pill.
  - Javob bloki: MessageSquare + `log.response_text || (kursiv "(matnsiz javob)")`.
  - 2 tugma: "Tasdiqlayman" (CheckCircle, yashil `bg-green-600`, `setReviewing({log,decision:'approve'})`), "Rad qilaman" (XCircle, qizil `bg-red-600`, `setReviewing({log,decision:'reject'})`).
- `reviewing && <ReviewModal log={reviewing.log} decision={reviewing.decision} submitting={submitting} onClose={()=>setReviewing(null)} onConfirm={submitReview} />`.

**SUB-MODAL: ReviewModal** — Props: `log, decision, onClose, onConfirm, submitting`.
- State: `comment` (`''`). `isApprove = decision==='approve'`.
- Header: ikona (approve→yashil CheckCircle, reject→qizil XCircle) + h3 (`isApprove?'Tasdiqlash':'Rad qilish'`) + `log.template_title`. O'ngda X (`onClose`).
- Javob ko'rsatish bloki: "{log.employee_name} javobi:" + `log.response_text || (kursiv "(matnsiz)")`.
- **Izoh (ixtiyoriy)** — textarea rows=3, autoFocus, placeholder (`isApprove?'Yaxshi bajardi, hammasi joyida...':'Sabab — masalan, yarim bajardi'`), `value=comment`.
- Footer: "Bekor" (`onClose`) + tasdiq tugma (`isApprove?'Tasdiqlayman':'Rad qilaman'`, mos rang, `disabled=submitting`, submitting→spin). Bosilganda `onConfirm(comment.trim() || null)` — **izoh bo'sh bo'lsa `null` yuboriladi, validatsiya yo'q (ixtiyoriy)**.

---

## 3. SAHIFA: MyTasksPage (`/my-tasks`) — `pages/MyTasksPage.jsx`

Xodim o'z vazifalarini ko'radi/javob beradi. Mobil-birinchi dizayn (bottom sheet).

### 3.0 STATUS_CONFIG (har status uchun label/color/badge/border/icon)
- `sent`: "Javob kutilmoqda", amber, Clock.
- `pending_review`: "Tasdiq kutmoqda", blue, Clock.
- `answered_yes`: "Ha", emerald, CheckCircle.
- `answered_no`: "Yo'q", red, XCircle.
- `answered_text`: "Javob berildi", primary, MessageSquare.
- `failed`: "Yuborilmadi", gray, XCircle.

### 3.1 Asosiy komponent — MyTasksPage
**State:**
- `user`, `employee_id = user?.employee_id`. `location = useLocation()`.
- `logs` (`[]`), `loading` (`true`), `refreshing` (`false`), `answerModal` (`null`), `popup` (`null`).
- `filter` (`'unanswered'` — `'unanswered' | 'all'`).
- `seenIds = useRef(new Set())` — popup takror chiqmasligi uchun.
- `wsRef`, `autoOpenDone = useRef(false)`.

**Notification ruxsati:** `useEffect` mount → agar `'Notification' in window && Notification.permission==='default'` → `Notification.requestPermission()`.

**`showNewTaskNotification(task)`:** agar `seenIds.has(task.id)` → return. `seenIds.add(task.id)`, `setPopup(task)`. Agar `Notification.permission==='granted'` → `new Notification('Yangi vazifa!', {body:task.template_title, icon:'/vite.svg'})`. Toast 'Yangi vazifa keldi!' (icon 🔔).

**`fetchLogs()`:** agar `!employee_id` return. `GET /tasks/logs/mine ?employee_id=${employee_id}&since_minutes=480` → `items=res.data.items||[]`, `setLogs(items)`, har item `seenIds.add(l.id)` (reconnect'da takror popup bo'lmasligi uchun). **Auto-open:** `openTaskId = location.state?.openTaskId`. Agar `openTaskId && !autoOpenDone.current` → `autoOpenDone.current=true`, `target = items.find(l=>l.id===openTaskId)`, agar `target && target.status==='sent' && target.response_type!=='none'` → `setAnswerModal(target)`. Xato → toast.error('Yuklanmadi'). `finally loading=false`.

**`handleRefresh()`:** `setRefreshing(true)`, `await fetchLogs()`, `setRefreshing(false)`, toast.success('Yangilandi').

**WebSocket** (`useEffect [employee_id, fetchLogs, showNewTaskNotification]`): agar `!employee_id` return. `fetchLogs()` chaqiriladi, keyin WS ulanadi `ws://.../ws/tasks/${employee_id}`.
- `new_task`: `task=data.task`. `setLogs(prev=>prev.find(l=>l.id===task.id)?prev:[task,...prev])`. Agar `task.status==='sent' && task.response_type!=='none'` → `showNewTaskNotification(task)`. Aks agar `task.status==='sent'` (info-only) → agar `!seenIds.has(task.id)` → `seenIds.add`, toast `Yangi xabar: ${task.template_title}` (icon 📋).

**`handleAnswerDone(logId,status,responseText)`:** `setLogs(prev=>prev.map(l => l.id===logId ? {...l, status, response_text:responseText||null} : l))` — instant UI update.

**No employee_id holati:** ClipboardList ikona + "Xodim ID aniqlanmadi. Qayta kiring." (sahifa shu yerda to'xtaydi).

**Hisoblanadigan:**
- `unanswered = logs.filter(l => l.status==='sent' && l.response_type!=='none')`.
- `displayLogs = filter==='unanswered' ? unanswered : logs`.

**UI:**
- Header: h1 "Mening Vazifalarim", pulsing yashil nuqta + "Real-time ulanish faol". O'ngda: agar `unanswered.length>0` → qizil badge (Bell + son, pulse). Refresh tugma (`handleRefresh`, `disabled=refreshing`, refreshing→spin).
- Filter tablar: "Yangi" (Bell, `setFilter('unanswered')`, agar `unanswered.length>0` qizil son badge), "Barchasi" (ClipboardList, `setFilter('all')`, agar `logs.length>0` → `({logs.length})`).
- Ro'yxat: loading → `LoadingSkeleton` (4 ta card); `displayLogs.length===0` → `EmptyState` (Inbox + "Vazifalar yo'q"); aks → `displayLogs.map((log,i)=><TaskCard log index onAnswer={l=>setAnswerModal(l)} />)`.
- `popup && <TaskNotificationPopup log onAnswer={log=>{setAnswerModal(log);setPopup(null)}} onDismiss={()=>setPopup(null)} />`.
- `answerModal && <AnswerModal log onClose={()=>setAnswerModal(null)} onDone={handleAnswerDone} />`.

### 3.2 SUB-KOMPONENT: TaskCard
Props: `log, index, onAnswer`.
- `config = STATUS_CONFIG[log.status]||failed`. `needsAnswer = log.status==='sent' && log.response_type!=='none'`.
- Animatsiya delay: `Math.min(index*60,300)ms`.
- Card: chap border `config.border` rangda. Ikona quti (needsAnswer→amber, aks gray) + `config.icon`.
- Sarlavha `log.template_title` + status badge `config.badge`+`config.label`.
- Message preview: `log.message_text` (`line-clamp-2`).
- Agar `log.response_text` → MessageSquare + kursiv (`line-clamp-1`).
- Timestamp: Clock + `fmtDateTimeShort(log.sent_at || log.created_at)`.
- **Deadline** (faqat `log.deadline_at && log.status==='sent'`): `remaining = Math.max(0, Math.floor((new Date(log.deadline_at)-new Date())/60000))`. `isUrgent = remaining<=10`. Badge (urgent→qizil pulse, aks amber): `⏳ {remaining>0 ? (remaining>=60?'Xs Yd':'X daqiqa') : 'Vaqt tugadi!'}`.
- Agar `needsAnswer` → "Javob berish" tugma (MessageSquare) → `onAnswer(log)`.

### 3.3 SUB-KOMPONENT: TaskNotificationPopup
Props: `log, onAnswer, onDismiss`. Mobil: yuqoridan tushadi (full-width); desktop: yuqori-o'ng `w-96`.
- Bell ikona + "YANGI VAZIFA" + `log.template_title` + `log.message_text` (`line-clamp-2`).
- Agar `log.response_type !== 'none'` → "Javob berish" tugma (`onAnswer(log)`). Doim "Yopish" tugma (`onDismiss`).

### 3.4 SUB-MODAL: AnswerModal (MyTasks versiyasi — MUHIM, ReviewPage/Logs'dagidan farqli)
Props: `log, onClose, onDone`.
- State: `text` (`''`), `saving` (`false`), `showNoReason` (`false`), `noReason` (`''`). `backdropRef`.
- `isYesNo = log.response_type==='yes_no'`. `isText = log.response_type==='text'`.

**`submit(val)` — AYNAN:**
- **Agar `val==='no' && !showNoReason`** → `setShowNoReason(true)`, return (ya'ni "Yo'q" bosilganda avval sabab so'raladi, hali API ketmaydi).
- `setSaving(true)`. payload:
  - `val==='yes'` → `{status:'answered_yes'}`
  - `val==='no'` → `{status:'answered_no', response_text: noReason || 'Sabab ko\'rsatilmagan'}` (sabab bo'sh bo'lsa default matn)
  - aks → `{status:'answered_text', response_text:val}`
- `PATCH /tasks/logs/${log.id}/answer` payload → toast.success('Javob saqlandi'), `onDone(log.id, payload.status, payload.response_text)`, `onClose()`. Xato 'Xatolik yuz berdi'. `finally saving=false`.

**Backdrop click:** `e.target===backdropRef.current` → `onClose()`.

**UI** (mobil bottom-sheet `rounded-t-3xl`, desktop centered `sm:max-w-md`):
- Drag handle (mobil only).
- Title: Bell ikona + `log.template_title` + `fmtDateTime(log.sent_at||log.created_at)`.
- Message body: `log.message_text` (`max-h-40 overflow-y-auto whitespace-pre-wrap`).
- **`isYesNo && !showNoReason`** → 2 tugma: "Ha" (emerald, CheckCircle, `submit('yes')`), "Yo'q" (red, XCircle, `submit('no')`).
- **`isYesNo && showNoReason`** → "Nega bajarmadingiz?" + textarea (`noReason`, autoFocus) + "Yuborish" (`submit('no')`) + "Orqaga" (`setShowNoReason(false); setNoReason('')`).
- **`isText`** → textarea (`text`, autoFocus) + "Yuborish" tugma (`disabled=saving||!text.trim()`, `submit(text)`).
- **`!isYesNo && !isText`** (info-only) → "Bu vazifa javob talab qilmaydi."
- Doim pastda "Yopish" tugma (`onClose`).
- Mobil pastki safe-area padding (`env(safe-area-inset-bottom, 8px)`).

---

## 4. SAHIFA: AttendancePage (`/attendance`) — `pages/AttendancePage.jsx`

2 tab: "Kelish belgisi" (today) va "Hisobot" (report).

### 4.0 Helperlar
- `duration(inIso,outIso)`: ikkalasi bo'lmasa "—". `parse(s) = new Date(/Z$|[+-]\d{2}:\d{2}$/.test(s)?s:s+'+05:00').getTime()`. `mins = Math.round((parse(out)-parse(in))/60000)`. `mins<0`→"—". `h=floor(mins/60), m=mins%60`. `h===0`→`"${m} daqiqa"`; aks→`"${h} soat ${m>0?m+' daqiqa':''}"`.
- `isoToInputValue(iso)`: `iso.match(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2})/)` → `m[1]` (datetime-local uchun, offset olib tashlanadi).
- `inputValueToIso(v)`: bo'sh→null; aks→`v + ':00+05:00'` (Tashkent local sifatida).

### 4.1 Asosiy — AttendancePage
- State: `tab` (`'today'`), `employees` (`[]`).
- Mount: `GET /employees/ ?active_only=true` → `setEmployees(...)`.
- Header h1 "Davomat" + subtitle. Tablar: "Kelish belgisi" (UserCheck), "Hisobot" (Calendar).
- `tab==='today' ? <TodayTab employees/> : <ReportTab employees/>`.

### 4.2 SUB-KOMPONENT: TodayTab
**State:** `records` (`[]`), `loading` (`true`), `modal` (`false`), `checkingOut` (`null` — record id), `editingRecord` (`null` — record obyekti).

**API:**
- `fetchToday`: `GET /attendance/today` → `setRecords(res.data.items||res.data)`. Xato → `err.response?.data?.detail||'Yuklanmadi'`. Mount'da chaqiriladi.
- `handleCheckOut(record)`: `setCheckingOut(record.id)`, `POST /attendance/${record.id}/check-out {}` (**bo'sh body JSON kerak**) → success 'Ketish belgilandi', `fetchToday()`. Xato → `detail||'Xatolik yuz berdi'`. `finally checkingOut=null`.
- `checkedInIds = records.filter(r=>!r.check_out).map(r=>r.employee_id)` — ochiq kelishi borlar.

**UI:**
- "Kelishni belgilash" tugma (UserCheck) → `setModal(true)`.
- Loading → 3 skeleton. `records.length===0` → UserX + "Bugun hali hech kim kelmagan".
- Jadval: Xodim | Kelish | Ketish | Holat | (amallar).
  - `isOpen = !rec.check_out`.
  - Kelish: Clock(yashil) + `fmtTime(rec.check_in)`.
  - Ketish: `rec.check_out` → Clock(qizil) + `fmtTime(check_out)`; aks → "—".
  - Holat: `isOpen` → "Ishda" (green); aks → "Ketdi" (gray).
  - Amallar: agar `isOpen` → "Ketishni belgilash" tugma (UserX, `handleCheckOut(rec)`, `disabled=checkingOut===rec.id`, spin). Agar `!isOpen` → `duration(check_in,check_out)` matni. Doim Edit2 tugma → `setEditingRecord(rec)`.
- `modal && <CheckInModal employees alreadyCheckedIn={checkedInIds} onClose onSave={fetchToday} />`.
- `editingRecord && <EditModal record={editingRecord} onClose onSaved={fetchToday} />`.

### 4.3 SUB-MODAL: CheckInModal
Props: `employees, alreadyCheckedIn, onClose, onSave`.
- `available = employees.filter(e=>!alreadyCheckedIn.includes(e.id))`.
- State: `employeeId` (`''`), `saving` (`false`).
- `handleCheckIn`: agar `!employeeId` → toast.error('Xodimni tanlang') return. `setSaving(true)`, `POST /attendance/check-in {employee_id:Number(employeeId)}` → success 'Kelish belgilandi', `onSave()`, `onClose()`. Xato → `detail||'Xatolik yuz berdi'`. `finally saving=false`.
- UI: UserCheck + "Kelishni belgilash". Select "Xodim *" (`""→"— Xodimni tanlang —"` + `available`). Agar `available.length===0` → "Barcha xodimlar belgilangan". Tugmalar: "Belgilash" (`disabled=saving||!employeeId`), "Bekor qilish".

### 4.4 SUB-MODAL: EditModal (davomatni tahrirlash — qo'lda tuzatish)
Props: `record, onClose, onSaved`.
- State: `checkIn` (`isoToInputValue(record.check_in)`), `checkOut` (`isoToInputValue(record.check_out)`), `saving` (`false`).
- **`save()` — payload differensial quriladi:**
  - `payload={}`. `newIn=inputValueToIso(checkIn)`, `newOut=inputValueToIso(checkOut)`.
  - Agar `newIn !== record.check_in` → `payload.check_in_time = newIn`.
  - Agar `record.check_out && !checkOut` (tozalangan) → `payload.clear_check_out = true`.
  - Aks agar `newOut && newOut !== record.check_out` → `payload.check_out_time = newOut`.
  - Agar `Object.keys(payload).length===0` → `onClose()` return (o'zgarish yo'q).
  - `PATCH /attendance/${record.id}` payload → success 'Saqlandi', `onSaved()`, `onClose()`. Xato → `detail||'Xatolik'`.
- **`remove()`:** `window.confirm("Bu yozuvni butunlay o'chirasizmi?")`. OK → `DELETE /attendance/${record.id}` → success "O'chirildi", `onSaved()`, `onClose()`. Xato `detail||'Xatolik'`.
- `revertCheckOut() = setCheckOut('')`.
- UI: h3 "Davomatni tahrirlash". `record.employee_name · fmtDate(record.check_in)`. "Kelish vaqti" datetime-local (`checkIn`). "Ketish vaqti" datetime-local (`checkOut`) — agar `checkOut` bor → "Tozalash (Ishda holatiga qaytarish)" tugma (RotateCcw, `revertCheckOut`). Info matn. Tugmalar: "Saqlash" (`disabled=saving`, spin) + "Bekor" + Trash2 (`remove`, `disabled=saving`).

### 4.5 SUB-KOMPONENT: ReportTab
**State:**
- `today = new Date().toISOString().slice(0,10)`. `weekAgo = new Date(Date.now()-6*86400000).toISOString().slice(0,10)`.
- `dateFrom` (`weekAgo`), `dateTo` (`today`), `employeeId` (`''`), `records` (`[]`), `loading` (`false`).
- `fetchReport`: `GET /attendance/report ?date_from=${dateFrom}&date_to=${dateTo}&employee_id=${employeeId||undefined}` → `setRecords(res.data.items||res.data)`. Xato → toast.error('Hisobot yuklanmadi'). `useEffect` deps `[dateFrom,dateTo,employeeId]` — har o'zgarganda avto qayta yuklanadi.
- UI filtrlar: "Dan" date, "Gacha" date, "Xodim" select (`""→"Barcha xodimlar"`), "Qidirish" tugma (`fetchReport`).
- Jadval: Sana (`fmtDate(check_in)`) | Xodim | Kelish (Clock yashil + `fmtTime`) | Ketish (`check_out`?Clock qizil+fmtTime:"—") | Davomiylik (`duration`) | Holat (`!check_out`→"Ishda" green, aks→"Tugallangan" gray).

---

## 5. SAHIFA: EmployeesPage (`/employees`) — `pages/EmployeesPage.jsx`

**Konstantalar — ROLES** (4 ta): `admin`→"Bosh admin"(red), `cashier`→"Kassir"(blue), `warehouse`→"Omborxona"(yellow), `staff`→"Xodim"(gray). `roleInfo(role) = ROLES.find(r=>r.value===role) || ROLES[3]`.

**Asosiy — EmployeesPage:**
- State: `employees` (`[]`), `loading` (`true`), `search` (`''`), `roleFilter` (`''`), `modal` (`null` — `null|'add'|emp`), `pwModal` (`null` — emp).
- `fetchEmployees`: `GET /employees/ ?search=${search}&role=${roleFilter||undefined}` → `setEmployees(res.data.items||res.data)`. Xato → toast.error('Yuklanmadi'). `useEffect` deps `[search,roleFilter]` — **debounce YO'Q, har keystroke'da so'rov ketadi**.
- `handleDeactivate(emp)`: `confirm("${emp.name} ni o'chirmoqchimisiz?")`. OK → `DELETE /employees/${emp.id}` → success "O'chirildi", `fetchEmployees()`. Xato 'Xatolik'.
- UI: Header h1 "Xodimlar" + "Xodim qo'shish" tugma (`setModal('add')`). Filtrlar: Search input (`search`), rol select (`""→"Barcha rollar"` + ROLES).
- Jadval: Ism (`emp.name` bold + `emp.phone` kichik) | Rol (`roleInfo` color pill) | Telegram (`emp.telegram_phone`?Phone+raqam:"—") | Bo'lim (`emp.department||'—'`) | Amallar: KeyRound (`setPwModal(emp)`) + Edit2 (`setModal(emp)`) + UserX (`handleDeactivate`).
- `modal && <EmployeeModal employee={modal==='add'?null:modal} onClose onSave={fetchEmployees} />`.
- `pwModal && <SetPasswordModal employee={pwModal} onClose />`.

**SUB-MODAL: EmployeeModal:**
- `isEdit=!!employee`. `form` init: `{name:emp?.name||'', phone:emp?.phone||'', telegram_phone:emp?.telegram_phone||'', role:emp?.role||'staff', department:emp?.department||'', is_checker:!!emp?.is_checker}`.
- `handleSave`: `if(!form.name.trim()){toast.error('Ism kiritng');return}`. `isEdit`→`PUT /employees/${employee.id}` form; aks→`POST /employees/` form. Success toast `isEdit?'Yangilandi':"Xodim qo'shildi"`, `onSave()`, `onClose()`. Xato 'Xatolik yuz berdi'.
- Inputlar: "Ism Familiya *" (text), "Rol" (select ROLES), "Telegram telefon" (text), "Asosiy telefon" (text), "Bo'lim (ixtiyoriy)" (text), **Tekshiruvchi checkbox** (`is_checker`, tushuntirish matni bilan). Footer: "Saqlash" (spin) + "Bekor qilish".

**SUB-MODAL: SetPasswordModal:**
- `form` init: `{username:employee.username||'', password:''}`.
- `handleSave`: `if(!form.username.trim()){toast.error('Username kiritng');return}`. `if(form.password.length<4){toast.error("Parol kamida 4 ta belgi bo'lishi kerak");return}`. `POST /employees/${employee.id}/set-password` form → success "Login va parol o'rnatildi", `onClose()`. Xato → `detail||'Xatolik yuz berdi'`.
- Inputlar: "Username (login)" (text), "Yangi parol (kamida 4 ta belgi)" (`type="password"`). Footer: "Saqlash" (spin) + "Bekor qilish".

---

## 6. SAHIFA: MessagesPage (`/messages`) — `pages/MessagesPage.jsx`

**Konstantalar — TYPE_LABELS:** `{demand:'Sotuv', supply:'Tovar olish', salesreturn:'Qaytarish', purchasereturn:'Xarid qaytarish', payment_in:"To'lov", order:'Buyurtma'}`.

**Asosiy — MessagesPage:**
- State: `data` (`{items:[],total:0,pages:0}`), `page` (`1`), `loading` (`false`), `resending` (`null` — msg id), `chatCp` (`null`), `intervalRef`, `colFilters` (`{kontragent:'', tur:'', status:''}` — **single-select string**, multi emas!), `activeFilter` (`null`), `filterSearch` (`''`), `filterOptions` (`{total:0,counterparties:[],types:[],statuses:[]}`). `colFiltersRef` har renderda yangilanadi.
- `useEffect [activeFilter]`: `setFilterSearch('')` (dropdown almashganda reset); agar `activeFilter` → `click` listener `setActiveFilter(null)`.
- `fetchFilterOptions`: `GET /messages/filter-options` → `setFilterOptions(res.data)`. Xato jim.
- `fetchData(silent=false)`: `!silent`→loading. params `{page, limit:30}`. `cf=colFiltersRef.current`. `cf.kontragent`→`params.counterparty_name`; `cf.tur`→`params.message_type`; `cf.status`→`params.status`. `GET /messages/` {params} → `setData(res.data)`. Xato (non-silent) → toast.error('Yuklanmadi').
- `useEffect` deps `[page, colFilters.kontragent, colFilters.tur, colFilters.status]`: `fetchData()` + `setInterval(()=>fetchData(true),15000)` (**har 15s avto-yangilash, silent**).
- `useEffect []`: `fetchFilterOptions()` + `setInterval(...,60000)` (har 1 daqiqa).
- `handleResend(id)`: `setResending(id)`, `POST /messages/${id}/resend` → agar `res.data.status==='sent'||'queued'` → toast.success("Navbatga qo'shildi — tez orada yuboriladi"); aks agar `res.data.error` → toast.error(error); aks → toast.error("Yuborib bo'lmadi"). `fetchData(true)`. Xato 'Xatolik'. `finally resending=null`.
- `openChat(msg)`: agar `!msg.counterparty_id && !msg.telegram_target` → return. `setChatCp({id:msg.counterparty_id, name:msg.counterparty_name||msg.telegram_target, target:msg.telegram_target})`.
- `statusBadge(status,error)`: `sent`→green "Yuborildi"; `failed`→red "Xatolik" (title=error); `queued`→blue "Navbatda"; aks→yellow "Kutmoqda".

**UI:**
- Header: h1 "Xabarnomalar tarixi", "Jami: {data.total} ta • har 15 soniyada yangilanadi". "Yangilash" tugma (`fetchData()`, `disabled=loading`, spin).
- `hasAnyFilter = Object.values(colFilters).some(v=>v)`.
- Filter natija banneri (`hasAnyFilter`): Filter + "{data.total} ta xabar topildi" + "Tozalash" (`setColFilters({kontragent:'',tur:'',status:''})`, page=1).
- Jadval ustunlari: **Kontragent** (MsgFilterHeader field=kontragent) | **Tur** (field=tur, `hidden sm:table-cell`) | Xabar (oddiy) | **Status** (field=status) | Vaqt (`hidden lg:table-cell`) | Amal.
- **MsgFilterHeader ({label,field,options,className})** — `<th>` ichida tugma (label + Filter ikona, agar `colFilters[field]` faol → primary). Ochiq (`activeFilter===field`):
  - `q = filterSearch.trim().toLowerCase()`. `filtered = q ? options.filter(o=>(o.label||'').toLowerCase().includes(q)) : options`.
  - Agar `options.length>4` → qidiruv input (autoFocus, `filterSearch`).
  - Agar `!q` → "Barchasi" item (count=`totalAll=filterOptions.total`, onClick: `setColFilters(f=>({...f,[field]:''}))`, page=1, close) + divider.
  - `filtered.length===0` → "Topilmadi"; aks → har item: onClick toggle (`colFilters[field]===opt.value ? '' : opt.value`), page=1, close.
  - **MUHIM: single-select** — bitta qiymat tanlanadi, qayta bossangiz bo'shaydi.
- Options manbasi: kontragent → `filterOptions.counterparties.map(o=>({value:o.value,label:o.value,count:o.count}))`; tur → `types.map(...label:TYPE_LABELS[o.value]||o.value)`; status → `statuses.map(...label: sent?'Yuborildi':failed?'Xatolik':queued?'Navbatda':'Kutmoqda')`.
- Loading → 6×6 skeleton grid. `filtered.length===0` → colSpan=6 (`hasAnyFilter?'Filter bo\'yicha natija topilmadi':'Hali xabar yo\'q'`).
- Har qator (`onClick={()=>openChat(msg)}`, `cursor-pointer`, title "Telegram chatni ko'rish"):
  - Kontragent: avatar (`counterparty_name[0]`) + `msg.counterparty_name||'—'` + `msg.telegram_target` (mono).
  - Tur: `TYPE_LABELS[msg.message_type]||msg.message_type||'—'` + agar `document_number` → kichik.
  - Xabar: `msg.message_text?.split('\n').slice(0,3).join(' • ')` (`line-clamp-2`).
  - Status: `statusBadge`. Agar `failed && error_message` → qizil matn (`error_message.replace('Foydalanuvchi topilmadi:','Telegram yo\'q:').replace('Akkaunt','Akk.')`, truncate).
  - Vaqt: `fmtDateTime(msg.created_at)`.
  - Amal (`onClick={e=>e.stopPropagation()}` — qator clickni to'xtatadi): MessageCircle (`openChat(msg)`) + agar `status==='failed'` → RotateCcw (`handleResend(msg.id)`, `disabled=resending===msg.id`, spin).
- **Pagination** (`data.pages>1`): "Sahifa {page} / {data.pages}" + "Oldingi" (`p=>max(1,p-1)`, `disabled=page===1`) + "Keyingi" (`p=>min(data.pages,p+1)`, `disabled=page===data.pages`).
- `chatCp && <ChatPanel counterparty={chatCp} onClose={()=>setChatCp(null)} />`.

**SUB-KOMPONENT: ChatPanel (Telegram chat slide-over):**
- Props: `counterparty, onClose`.
- State: `messages` (`[]`), `loading` (`true`), `sendText` (`''`), `sending` (`false`). `bottomRef`.
- `useEffect [counterparty?.id]`: agar `counterparty` → `loadHistory()`.
- `useEffect [messages]`: `bottomRef.current?.scrollIntoView({behavior:'smooth'})` (auto-scroll pastga).
- `loadHistory`: `GET /telegram/chat/${counterparty.id}?limit=40` → `setMessages([...(res.data.messages||[])].reverse())` (**API newest-first qaytaradi, reverse qilinadi** xronologik tartib uchun). Xato → `detail||'Chat tarixi yuklanmadi'`.
- `handleSend`: agar `!sendText.trim()` → return. `setSending(true)`, `POST /telegram/send-to-counterparty {counterparty_id:counterparty.id, message:sendText.trim()}` → `setSendText('')`, `await loadHistory()`. Xato → `detail||'Yuborilmadi'`. `finally sending=false`.
- UI: slide-over o'ngdan (`max-w-md`), backdrop click → `onClose`.
  - Header (primary fon): avatar (`counterparty.name[0]`), nom, `counterparty.target`. RefreshCw (`loadHistory`) + X (`onClose`).
  - Messages: loading→spin; bo'sh→MessageCircle+"Hali xabar yo'q"; aks → har `msg`: `msg.out` ? o'ngda (primary) : chapda (oq). `msg.text` ko'rsatiladi; agar `msg.media && !msg.text` → "📎 Media fayl". Vaqt: `fmtDateTimeShort(msg.date)`.
  - Compose: textarea (`sendText`, **Enter (Shift'siz) → handleSend, preventDefault**) + Send tugma (`disabled=sending||!sendText.trim()`, spin).

---

## 7. SAHIFA: DashboardPage (`/dashboard`) — `pages/DashboardPage.jsx`

Admin bosh sahifa (recharts diagramma bilan).

- State: `summary` (`null`), `chartData` (`[]`), `recentMessages` (`[]`), `loading` (`true`).
- `useEffect` mount: `fetchData` → `Promise.all([GET /reports/summary, GET /reports/sales?days=7, GET /messages?limit=5])` → `setSummary(summaryRes.data)`, `setChartData(chartRes.data.data||[])`, `setRecentMessages(messagesRes.data.items||[])`. Xato → `console.error`. `finally loading=false`. **`setInterval(fetchData, 30000)` — har 30s avto-yangilash.**
- `statusBadge(status)`: `sent`→badge-green "Yuborildi", `failed`→badge-red "Xatolik", `pending`→badge-yellow "Kutmoqda", aks→badge-gray.
- UI:
  - Header h1 "Dashboard" + "Real-time savdo ma'lumotlari".
  - **4 StatCard:**
    1. "Jami kontragentlar" = `summary?.total_counterparties ?? '—'`, subtitle `${summary?.linked_counterparties ?? 0} ta Telegram ulangan`, Users, blue.
    2. "Bugun yuborilgan" = `summary?.messages_sent_today ?? '—'`, "Telegram xabarlar", MessageSquare, green.
    3. "Muvaffaqiyatsiz" = `summary?.failed_messages_today ?? '—'`, "Bugungi xatoliklar", AlertCircle, orange.
    4. "Ulangan" = `${summary?.linked_counterparties ?? 0}/${summary?.total_counterparties ?? 0}`, "Telegram aktivatsiya", CheckCircle, purple.
    - StatCard loading → pulse skeleton.
  - **Chart** ("Oxirgi 7 kun aktivligi"): `chartData.length>0` → recharts AreaChart (`dataKey="total"`, gradient, XAxis `date` `tickFormatter=v.slice(5)`); aks → "Ma'lumot mavjud emas".
  - **Oxirgi xabarlar** jadval: `recentMessages.length===0` → "Hali xabar yuborilmagan"; aks → Kontragent (`msg.counterparty_name||'—'`) | Tur (`demand?'Savdo':payment_in?"To'lov":'Buyurtma'`) | Status (`statusBadge`) | Vaqt (`fmtDateTimeShort(msg.created_at)`).

---

## 8. API ENDPOINT XARITASI (operatsion sahifalar bo'yicha to'liq ro'yxat)

| Endpoint | Method | Sahifa | Parametr/Body |
|---|---|---|---|
| `/auth/login` | POST | (authStore) | `{username,password}` |
| `/employees/` | GET | Tasks, Attendance, Employees | `?active_only=true` yoki `?search=&role=` |
| `/employees/` | POST | Employees | EmployeeModal form |
| `/employees/{id}` | PUT | Employees | EmployeeModal form |
| `/employees/{id}` | DELETE | Employees | — |
| `/employees/{id}/set-password` | POST | Employees | `{username,password}` |
| `/employees/meta/roles` | GET | Tasks | — |
| `/employees/meta/roles` | POST | Tasks(TemplateModal) | `{value,label}` |
| `/employees/meta/roles/{value}` | DELETE | Tasks(TemplateModal) | — |
| `/tasks/templates` | GET | Tasks | — |
| `/tasks/templates` | POST | Tasks(TemplateModal) | payload (1.4) |
| `/tasks/templates/{id}` | PUT | Tasks(TemplateModal) | payload (1.4) |
| `/tasks/templates/{id}` | DELETE | Tasks | — |
| `/tasks/templates/{id}/send` | POST | Tasks | — |
| `/tasks/departments` | GET | Tasks | — |
| `/tasks/departments` | POST | Tasks(TemplateModal) | `{name}` |
| `/tasks/departments/{name}` | DELETE | Tasks(TemplateModal) | encodeURIComponent |
| `/tasks/logs` | GET | Tasks(Logs), Review(admin) | params (1.6) |
| `/tasks/logs/filter-options` | GET | Tasks(Logs) | — |
| `/tasks/logs/mine` | GET | MyTasks | `?employee_id=&since_minutes=480` |
| `/tasks/logs/{id}/answer` | PATCH | Tasks(Answer), MyTasks(Answer) | `{status, response_text?}` |
| `/tasks/logs/{id}/review` | PATCH | Tasks(quickReview), Review | `{decision, comment?}` |
| `/tasks/pending-review` | GET | Review(non-admin) | `?checker_id=` |
| `/attendance/today` | GET | Attendance | — |
| `/attendance/check-in` | POST | Attendance | `{employee_id}` |
| `/attendance/{id}/check-out` | POST | Attendance | `{}` (bo'sh body shart) |
| `/attendance/{id}` | PATCH | Attendance(Edit) | `{check_in_time?, check_out_time?, clear_check_out?}` |
| `/attendance/{id}` | DELETE | Attendance(Edit) | — |
| `/attendance/report` | GET | Attendance | `?date_from=&date_to=&employee_id=` |
| `/messages/` | GET | Messages | `?page=&limit=30&counterparty_name=&message_type=&status=` |
| `/messages` | GET | Dashboard | `?limit=5` |
| `/messages/filter-options` | GET | Messages | — |
| `/messages/{id}/resend` | POST | Messages | — |
| `/telegram/chat/{cpId}` | GET | Messages(ChatPanel) | `?limit=40` |
| `/telegram/send-to-counterparty` | POST | Messages(ChatPanel) | `{counterparty_id,message}` |
| `/reports/summary` | GET | Dashboard | — |
| `/reports/sales` | GET | Dashboard | `?days=7` |
| WS `/ws/tasks/{id}` | WS | Tasks(Logs)=0, Review=checkerId/0, MyTasks=employee_id | ping/JSON events |

---

## 9. WEBSOCKET EVENT XARITASI (kanal bo'yicha)

| Sahifa | Kanal (targetId) | Event | Reaksiya |
|---|---|---|---|
| MyTasks | `employee_id` | `new_task` | `setLogs([task,...prev])` (agar yo'q bo'lsa). `status==='sent' && response_type!=='none'` → popup + browser notif + toast 🔔. Aks `status==='sent'` → faqat toast 📋 |
| TasksPage Logs | `0` (admin) | `new_task` | Faqat default sort/filter/page=1 bo'lsa `[task,...prev]`. Doim toast 📋 |
| TasksPage Logs | `0` | `task_answered` | `setLogs` map: status/response_text/answered_at yangilanadi. Toast.success "{employee_name} javob berdi" |
| ReviewPage | `0`(admin)/`checkerId` | `pending_review` | `fetchPending(true)` (to'liq refresh) + toast 🔍 |
| ReviewPage | `0`/`checkerId` | `task_reviewed` | `setItems(filter l.id!==task_id)` (ro'yxatdan olib tashlash) |

---

## 10. STATUS / BADGE / RANG MANTIQI (jamlanma)

**Task log statuslari** (TasksPage STATUS_COLORS/LABELS, MyTasks STATUS_CONFIG):
| status | label (uz) | rang |
|---|---|---|
| `sent` | "Yuborildi" / "Javob kutilmoqda" (MyTasks) | blue / amber (MyTasks) |
| `pending_review` | "Tasdiq kutmoqda" | amber / blue (MyTasks) |
| `answered_yes` | "Ha" | green / emerald |
| `answered_no` | "Yo'q" | red |
| `answered_text` | "Javob berildi" | teal / primary |
| `failed` | "Yuborilmadi" | gray |

**Message statuslari:** `sent`→green "Yuborildi", `failed`→red "Xatolik", `queued`→blue "Navbatda", `pending`/aks→yellow "Kutmoqda".

**Attendance:** ochiq (`!check_out`) → green "Ishda"/"Ketdi" yoki "Tugallangan"(report).

**Trigger:** manual→gray "Qo'lda", scheduled→blue "Vaqt bo'yicha", event→purple "Hodisa".
**Priority:** low→gray "Oddiy", medium→blue "O'rta", high→amber "Muhim", urgent→red "Shoshilinch".

---

## 11. MUHIM XULOSALAR / TUZOQLAR (1:1 qayta qurishda e'tibor bering)

1. **AnswerModal ikki xil:** TasksPage versiyasi (admin, sodda) vs MyTasksPage versiyasi (xodim, "Yo'q" bossa avval sabab so'raydi — `showNoReason` flow, mobil bottom-sheet). Ularni adashtirmaslik kerak.
2. **MyTasks "Yo'q" flow:** birinchi "Yo'q" bosish API YUBORMAYDI — faqat `showNoReason=true`. Ikkinchi "Yuborish" bosish API yuboradi. Sabab bo'sh → `'Sabab ko\'rsatilmagan'`.
3. **TasksPage filtrlar = multi-select** (massiv, client-side). **MessagesPage filtrlar = single-select** (string, server-side). LogsTab filtrlar = multi-select lekin **server-side** (join(',') bilan params).
4. **EMPTY_TEMPLATE da `_event_doc`/`_event_action`** payload'ga ham boradi (`...rest` orqali) — backend ularni e'tiborsiz qoldirishi kutiladi, lekin yuborilishi aniq.
5. **payload transform:** bo'sh string → `null` (employee_id, large_sale_threshold va h.k. `Number()` yoki `null`); `assigned_role` employee tanlangan bo'lsa majburan `null`.
6. **schedule_days monthly format:** `monthly:{day}` string sifatida saqlanadi; modal'da `schedule_mode` + `schedule_month_day` ga ajratiladi va saqlashda qayta yig'iladi.
7. **canReview:** `pending_review && (is_admin || (is_checker && log.checker_id===employee_id))`. **canAnswer:** `sent && response_type && !=='none'`.
8. **StatusIcon faqat `log.checker_id` bor bo'lsa** ko'rinadi (tekshiruvchisiz vazifalarda chap ustun bo'sh).
9. **WS `new_task` faqat default holatda prepend** (page=1, sort created_at desc, filtrsiz) — aks holda qator sakramasligi uchun e'tiborsiz qoldiriladi (lekin toast baribir chiqadi).
10. **Pagination:** Logs offset = `(page-1)*50`, LOGS_PAGE_SIZE=50; Messages limit=30 (server `pages` qaytaradi). Filter o'zgarsa har doim `setPage(1)`.
11. **Debounce faqat LogsTab qidiruvida (350ms)**. EmployeesPage qidiruvi debounce'siz (har keystroke API). MessagesPage filter dropdown qidiruvi (`filterSearch`) faqat client-side option filtrlash, API'ga ketmaydi.
12. **Auto-refresh intervallari:** Dashboard 30s, Messages 15s (silent) + filter-options 60s, LogsTab filter-options 60s, ReviewPage faqat WS+manual.
13. **`/employees/` trailing slash bilan** (POST/GET); `/messages/` ham trailing slash (Messages sahifasi), lekin Dashboard `/messages` (slashsiz) ishlatadi.
14. **datetime-local ↔ ISO:** AttendancePage `inputValueToIso` har doim `+05:00` qo'shadi (Tashkent). `isoToInputValue` offset olib tashlaydi.
15. **react-hot-toast** ishlatiladi (`toast`, `toast.success`, `toast.error`, `toast(msg,{icon})`). `confirm()`/`window.confirm()` native dialog (Tasks delete, Employees delete, Attendance delete).
16. **clsx** barcha conditional class'larda. **lucide-react** barcha ikonkalar. TypeScript portda bu lib'lar mavjud (yoki ekvivalent).
17. **Login javobi `data.name`** ishlatiladi username sifatida ham (`data.name || username`). `is_admin` faqat `role==='admin'` bo'lganda true.
18. **HomeRedirect:** token yo'q → `/login`; admin → `/dashboard`; non-admin → `/my-tasks`.

Ushbu spetsifikatsiya barcha operatsion sahifalarning state, API, tugma xulqi, modal validatsiyasi, filter mantiqi, WebSocket reaksiyalari va status badge'larini AYNAN o'qilgan JSX'dan qamrab oladi — TypeScript/Next.js'da funksional 1:1 qayta qurish uchun yetarli.