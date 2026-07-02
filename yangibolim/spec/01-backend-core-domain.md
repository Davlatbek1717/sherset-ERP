Men barcha kerakli ma'lumotni o'qib chiqdim. Endi to'liq, batafsil funksional spetsifikatsiyani yozaman.

---

# MoySklad↔Telegram Integratsiya Tizimi — 1:1 Qayta Qurish uchun Funksional Spetsifikatsiya

Bu hujjat backend tizimning xodim/vazifa/oylik/davomat/auth qismlarini AYNAN qayta qurish uchun yozilgan. Har bir endpoint, formula, status o'tish va side-effect kuzatilgan kodga asoslangan.

---

## 0. UMUMIY ARXITEKTURA VA KONVENSIYALAR

### 0.1 Texnologiya stack (manba)
- Python 3 + FastAPI, SQLAlchemy async (`AsyncSession`), SQLite (`sqlite+aiosqlite:///./data/app.db`).
- APScheduler (`AsyncIOScheduler`) — cron va interval joblar.
- WebSocket — real-time push.
- Telethon (Telegram user-account MTProto) — xodimlarga xabar yuborish.
- httpx — admin kanaliga Telegram Bot API orqali xabar.

### 0.2 Barcha API yo'llari `/api` prefiksi bilan
| Router | Prefiks |
|---|---|
| auth | `/api/auth` |
| employees | `/api/employees` |
| tasks | `/api/tasks` |
| attendance | `/api/attendance` |
| bonus-fine | `/api/bonus-fine` (E'TIBOR: tire bilan, pastki chiziq emas) |
| activity | `/api/activity` |
| kassa | `/api/kassa` |
| salary | `/api/salary` |
| kpi | `/api/kpi` |

WebSocket: `/ws` (sync status), `/ws/tasks/{employee_id}` (vazifa push).

### 0.3 Sana/vaqt qoidalari (MUHIM — 1:1 takrorlash kerak)
- Modellarda `created_at`, `updated_at` va boshqa datetimelar `DateTime(timezone=True)`, lekin **default = Python `datetime.now()`** (naive local time, UTC emas). SQLite timezone'ni tashlab yuboradi → DB'dan tz-naive qaytadi.
- `datetime.now()` — server lokal vaqti (deploy +05 zonada bo'lgan, masalan O'zbekiston).
- Ba'zi joylarda `datetime.now(timezone.utc)` ishlatilgan (`/tasks/logs/mine`, `/activity/stats`) — bu nomuvofiqlik AYNAN saqlanishi kerak (aks holda filtrlar boshqacha ishlaydi).
- TS qayta qurishda: barcha `created_at`/timestamp default'larini **server lokal vaqti** bilan yozing, UTC bilan emas. `_to_iso` helper'i (3.x.) bu nomuvofiqlikni frontendda tuzatadi.

### 0.4 `_to_iso(dt)` helper (attendance.py:186) — AYNAN mantiq
```
agar dt is None: return None
agar dt.tzinfo is None: dt = dt.astimezone()   # serverning lokal tzinfo'sini biriktiradi
return dt.isoformat()
```
Sababi: SQLite tz'ni tashlaydi → naive datetime qaytadi. JS `new Date(isoString)` naive ISO'ni UTC deb o'qiydi va brauzer zonasiga suradi. +05 serverda bu har vaqtni 5 soat oldinga surardi ("16:46" → "21:46"). `dt.astimezone()` naive datetime'ga serverning lokal offset'ini biriktiradi (masalan `+05:00`), shunda JS round-trip to'g'ri wall-clock qiymatni ko'rsatadi. TS'da: agar datetime'da offset yo'q bo'lsa, server lokal offsetini (`+05:00`) qo'shib ISO qiling.

### 0.5 Auth modeli — tokensiz himoyalanmagan endpointlar
- **MUHIM**: Endpointlarning HECH BIRI tokenni majburiy qilmaydi yoki tekshirmaydi. Token faqat `Authorization` headeridan `user_name`/`user_role` ni activity log uchun olishga ishlatiladi (`decode_token_user`).
- Token format = JWT EMAS. Token = base64(JSON) yengil token. (`utils/auth.py`'da JWT funksiyalari bor, lekin login bularni ISHLATMAYDI — `_make_token` ishlatadi.)
- `utils/auth.py`'dagi `get_current_user`, `create_access_token`, `security = HTTPBearer()` — HECH QAYSI endpointда Depends sifatida ishlatilmaydi (faqat `verify_password`, `get_password_hash` ishlatiladi). TS'da bularni qayta qurish shart emas, lekin parol hash funksiyalarini aynan ko'chiring.

### 0.6 Parol hash — bcrypt (utils/auth.py:18-23)
```
verify_password(plain, hashed) -> bcrypt.checkpw(plain.utf8, hashed.utf8)  -> bool
get_password_hash(password)    -> bcrypt.hashpw(password.utf8, bcrypt.gensalt()).decode()
```
TS'da: `bcrypt` kutubxonasi, `bcrypt.compare(plain, hashed)` va `bcrypt.hash(password, saltRounds)` (gensalt default = 12 round; bcrypt default kostini ishlating).

---

## 1. AUTH MODULI (`/api/auth`)

### 1.1 Token generatsiya/dekodlash (auth.py:16-39)

**`_make_token(sub, role, employee_id, name) -> str`**:
```
payload = {"sub": sub, "role": role, "employee_id": employee_id, "name": name}
return base64encode(json.dumps(payload).utf8).decode()
```
Imzo YO'Q, muddat YO'Q, shifrlash YO'Q. Oddiy base64(JSON).

**`_decode_token(token) -> dict | None`**:
```
try: return json.loads(base64decode(token).decode())
except: return None
```

**`decode_token_user(authorization) -> (user_name, user_role)`** (activity_service.py:42):
```
agar authorization yo'q: return ("Admin", "admin")
token_str = authorization.strip()
agar token_str lower "bearer " bilan boshlanса: token_str = token_str[7:].strip()
try:
    payload = json.loads(base64decode(token_str).decode())
    name = payload.get("name") yoki payload.get("sub") yoki "Admin"
    role = payload.get("role") yoki "admin"
    return (name, role)
except: return ("Admin", "admin")
```

### 1.2 `POST /api/auth/login`

**Body** (`LoginRequest`): `username: str` (majburiy), `password: str` (majburiy).

**Response** (`TokenResponse`):
```
access_token: str
token_type: str = "bearer"
role: str = "admin"
employee_id: int | null = null
name: str = "admin"
is_checker: bool = false
permissions: list[dict] | null = null   # [{"p": "...", "a": "..."}, ...]
```

**Jarayon QADAM-BA-QADAM**:
1. `User` jadvalidan `username == request.username` qidir (admin akkauntlar).
2. Agar `user` topildi VA `verify_password(request.password, user.hashed_password)` True:
   - token = `_make_token(sub=user.username, role="admin", employee_id=None, name=user.username)`
   - Return `TokenResponse(access_token=token, role="admin", employee_id=None, name=user.username)` (is_checker=false, permissions=null).
3. Aks holda: `Employee` jadvalidan `username == request.username` qidir.
4. Agar `emp` topildi VA `emp.hashed_password` mavjud VA `verify_password(request.password, emp.hashed_password)` True:
   - `roles_list = (emp.role yoki "staff").split(",")`
   - `effective_role = "admin" agar "admin" in roles_list aks holda emp.role` (ya'ni rolning to'liq vergulli stringini qaytaradi, masalan `"cashier,warehouse"`)
   - `EmployeePermission` dan `employee_id == emp.id` barcha permissionlarni yukla → `perms = [{"p": p.permission, "a": p.access_level} for ...]`
   - token = `_make_token(sub=emp.username, role=effective_role, employee_id=emp.id, name=emp.name)`
   - Return `TokenResponse(access_token=token, role=effective_role, employee_id=emp.id, name=emp.name, is_checker=bool(emp.is_checker), permissions=perms)`
5. Hech biri mos kelmasa: **HTTP 401**, `detail="Login yoki parol noto'g'ri"`.

**Edge case**: `emp.hashed_password` None bo'lsa (parol o'rnatilmagan xodim) — login rad etiladi (401), chunki shart `emp.hashed_password` ni talab qiladi.

### 1.3 `GET /api/auth/me`

**Kirish**: `Authorization` header (ixtiyoriy).

**Jarayon**:
1. `auth_header = headers.get("Authorization", "")`.
2. Agar `auth_header.lower()` `"bearer "` bilan boshlansa → `token_str = auth_header[7:].strip()`, aks holda `token_str = None`.
3. Agar `token_str` mavjud → `payload = _decode_token(token_str)`. Agar `payload` mavjud VA `"sub" in payload`:
   - Return `UserResponse(id = payload.employee_id yoki 1, username = payload["sub"], is_active=True, is_admin = "admin" in payload.get("role","admin").split(","), role = payload.get("role","admin"), employee_id = payload.get("employee_id"), name = payload.get("name", payload["sub"]))`
4. Token yo'q yoki yaroqsiz → backward-compat fallback: `UserResponse(id=1, username="admin", is_active=True, is_admin=True, role="admin", employee_id=None, name="admin")`.

**`UserResponse`**: `id:int, username:str, is_active:bool, is_admin:bool, role:str="admin", employee_id:int|null, name:str="admin"`.

### 1.4 Default admin (main.py:92-105 startup)
Startupda: `User` jadvalida `username == settings.admin_username` ("admin") yo'q bo'lsa → `User(username="admin", hashed_password=get_password_hash("admin123"), is_admin=True)` yaratiladi. (env: `ADMIN_USERNAME`, `ADMIN_PASSWORD`.)

---

## 2. EMPLOYEES MODULI (`/api/employees`)

### 2.1 Model `Employee` (employee.py:28-47)
| Maydon | Tur | Default | Izoh |
|---|---|---|---|
| id | int PK | | |
| name | str | — | majburiy |
| phone | str? | null | |
| telegram_phone | str? | null | Telegram xabar yuborish uchun |
| role | str | `"staff"` | vergul bilan ajratilgan: `"cashier,warehouse"` |
| department | str? | null | |
| base_salary | float | 0 | |
| is_active | bool | True | |
| is_checker | bool | False | True bo'lsa reviewer sifatida tanlanishi va "Tekshiruv" menyusini ko'rishi mumkin |
| created_at | datetime | `datetime.now()` | |
| updated_at | datetime | `onupdate=datetime.now` | |
| moysklad_agent_id | str? | null | KPI savdo kuzatuvi uchun |
| username | str? unique index | null | login uchun |
| hashed_password | str? | null | |

### 2.2 `Employee` rol helperlari (employee.py:7-25)
**`has_role_filter(role_value)`** — SQL filter (vergulli rol stringi uchun):
```
OR(
  role == role_value,
  role LIKE "{role_value},%",
  role LIKE "%,{role_value}",
  role LIKE "%,{role_value},%"
)
```
**`emp_has_role(emp, role_value) -> bool`** (Python-side):
```
agar not emp.role: return False
return role_value in emp.role.split(",")
```
TS'da bularni AYNAN ko'chiring — vergulli rol matching butun tizimda ishlatiladi.

### 2.3 Model `EmployeePermission` (employee.py:50-77)
| Maydon | Tur | Default |
|---|---|---|
| id | int PK | |
| employee_id | int FK→employees CASCADE, index | majburiy |
| permission | str | majburiy (masalan `"dashboard"`, `"messages:demand"`) |
| access_level | str | `"full"` (`"full"`/`"read"`/`"own_only"`) |
| created_at | datetime | `datetime.now()` |

`permission` format: `"page"` yoki `"page:section"`.

### 2.4 `GET /api/employees/moysklad-agents`
MoySklad'dan xodimlarni oladi (`GET /entity/employee`, limit 100). Response: `{"items": [{"id": <href oxiri>, "name": ..., "uid": ...}]}`. Xatoda **HTTP 502** `f"MoySklad bilan bog'lanib bo'lmadi: {e}"`.

### 2.5 `GET /api/employees/`
**Query**: `search: str?` (null), `role: str?` (null), `active_only: bool = True`.

**Jarayon**:
1. `query = select(Employee)`.
2. Agar `active_only` → `where(is_active == True)`.
3. Agar `role` → `where(has_role_filter(role))`.
4. Agar `search` → `where(OR(name ILIKE %search%, phone ILIKE %search%, telegram_phone ILIKE %search%))`.
5. `order_by(name)`.

**Response**: `{"items": [EmployeeResponse...], "total": <len>}`.

**`EmployeeResponse`**: `id, name, phone?, telegram_phone?, role, department?, base_salary=0, is_active, is_checker=false, moysklad_agent_id?, created_at, updated_at?`.

### 2.6 `POST /api/employees/` → `EmployeeResponse`
**Body** (`EmployeeCreate`): `name:str` (majburiy), `phone:str?`, `telegram_phone:str?`, `role:str="staff"`, `department:str?`, `base_salary:float?=0`, `is_checker:bool?=False`.

**Jarayon**:
1. `emp = Employee(**data)`; `db.add(emp)`.
2. `log_activity(action="created", module="employees", entity_type="employee", entity_title=data.name)` (entity_id YO'Q — commit'dan oldin).
3. commit; refresh; return emp.

### 2.7 `GET /api/employees/{id}` → `EmployeeResponse`
Topilmasa **HTTP 404** `"Xodim topilmadi"`.

### 2.8 `PUT /api/employees/{id}` → `EmployeeResponse`
**Body** (`EmployeeUpdate`, hammasi optional): `name?, phone?, telegram_phone?, role?, department?, base_salary?, is_active?, is_checker?, moysklad_agent_id?`.

**Jarayon**:
1. Topilmasa 404 `"Xodim topilmadi"`.
2. `updates = data.model_dump(exclude_unset=True)` — faqat yuborilgan maydonlar.
3. Har `(k,v)` uchun: `old_val = getattr(emp,k)`; agar `old_val != v` → `changes[k] = {"old": old_val, "new": v}`; `setattr(emp,k,v)`.
4. `log_activity(action="updated", ..., entity_id=emp.id, entity_title=emp.name, changes=changes if changes else None)`.
5. commit; refresh; return emp.

**MUHIM diff mantiqi (butun tizimda takrorlanadi)**: `exclude_unset` — faqat request body'da BERILGAN maydonlar yangilanadi; `changes` faqat haqiqatan o'zgargan maydonlardan iborat; o'zgarish bo'lmasa `changes=None`.

### 2.9 `DELETE /api/employees/{id}`
**Soft-delete**: `emp.is_active = False`. Topilmasa 404. `log_activity(action="deactivated", ...)`. Return `{"status": "ok"}`.

### 2.10 `POST /api/employees/{id}/set-password`
**Body** (`SetPassword`): `username:str` (majburiy), `password:str` (majburiy, **validatsiya: `len(password) >= 4`**, aks holda ValidationError `"Parol kamida 4 ta belgidan iborat bo'lishi kerak"`).

**Jarayon**:
1. Topilmasa 404 `"Xodim topilmadi"`.
2. Boshqa xodimda shu username band: `select Employee where username == data.username AND id != id` → mavjud bo'lsa **HTTP 409** `f"'{data.username}' login allaqachon boshqa xodimda mavjud"`.
3. `emp.username = data.username`; `emp.hashed_password = get_password_hash(data.password)`.
4. `log_activity(action="password_set", ..., entity_id=emp.id, entity_title=emp.name, extra={"username": data.username})`.
5. commit; return `{"status": "ok"}`.

### 2.11 Rollar CRUD (AppSettings key=`custom_roles`)
Default rollar: `[{value:"admin",label:"Bosh admin"},{value:"cashier",label:"Kassir"},{value:"warehouse",label:"Omborxona"},{value:"staff",label:"Xodim"}]`. AppSettings'da `custom_roles` JSON sifatida saqlanadi.

- **`GET /api/employees/meta/roles`** → `{"items": <roles>}`. Saqlangan bo'lmasa default qaytadi.
- **`POST /api/employees/meta/roles`** Body `{value, label}`. Agar `value` mavjud → **HTTP 400** `"Bu rol allaqachon mavjud"`. Aks holda qo'shib saqlaydi → `{"items": <roles>}`.
- **`DELETE /api/employees/meta/roles/{role_value}`**: agar `role_value in ("admin","staff")` → **HTTP 400** `"Bu rolni o'chirib bo'lmaydi"`. Aks holda ro'yxatdan olib tashlab saqlaydi.

### 2.12 Permissionlar
`AVAILABLE_PERMISSIONS` (employees.py:312-329) — qattiq kodlangan ro'yxat:
- `dashboard` (sections: [])
- `messages` (sections: customerorder/demand/supply/salesreturn/purchasereturn/paymentin/move — har biri `messages:<key>`)
- `reports`, `employees`, `tasks`, `oylik`, `activity`, `settings` (sections: [])

- **`GET /api/employees/meta/permissions`** → `{"items": AVAILABLE_PERMISSIONS}`.
- **`GET /api/employees/{employee_id}/permissions`** → `{"items": [{"permission","access_level"}...]}`.
- **`PUT /api/employees/{employee_id}/permissions`** Body `{permissions: [{"permission","access_level"},...]}`:
  1. Xodim yo'q → 404 `"Xodim topilmadi"`.
  2. Shu `employee_id` ning BARCHA `EmployeePermission` larini O'CHIR (DELETE).
  3. Har permission uchun yangi qator qo'sh (`access_level` default `"full"`, `permission` default `""`).
  4. commit; return `{"message": "Huquqlar saqlandi", "count": <len>}`.
  (Replace-all semantikasi — eskilarini o'chirib, yangilarini qo'yadi.)

---

## 3. ATTENDANCE (DAVOMAT) MODULI (`/api/attendance`)

### 3.1 Model `Attendance` (attendance.py:7-16)
| Maydon | Tur | Default |
|---|---|---|
| id | int PK | |
| employee_id | int? | null |
| employee_name | str | majburiy |
| date | Date | majburiy |
| check_in_time | datetime? | null |
| check_out_time | datetime? | null |
| notes | text? | null |
| created_at | datetime | `datetime.now()` |

### 3.2 `_serialize(a)` — har response shu shaklda (attendance.py:202)
```
in_iso = _to_iso(a.check_in_time)
out_iso = _to_iso(a.check_out_time)
return {
  "id", "employee_id", "employee_name",
  "date": a.date.isoformat() agar a.date aks holda None,
  "check_in_time": in_iso, "check_out_time": out_iso,
  "check_in": in_iso,     # frontend alias
  "check_out": out_iso,   # frontend alias
  "notes"
}
```
HAR datetime `_to_iso` orqali o'tkaziladi (0.4-bo'limga qarang).

### 3.3 `GET /api/attendance/today`
`today = date.today()`. `select Attendance where date == today`. Return `[_serialize(a) for a in items]` (massiv, obyekt emas).

### 3.4 `GET /api/attendance/report`
**Query**: `from_date: date?`, `to_date: date?`, `employee_id: int?`.
**Jarayon**: `select Attendance`; agar from_date → `where date >= from_date`; agar to_date → `where date <= to_date`; agar employee_id → `where employee_id == employee_id`; `order_by(date DESC, check_in_time DESC)`. Return massiv `_serialize`.

### 3.5 `POST /api/attendance/check-in`
**Body** (`CheckIn`): `employee_id:int` (majburiy), `notes:str?`.

**Jarayon QADAM-BA-QADAM**:
1. `today = date.today()`.
2. `select Employee where id == employee_id` → yo'q bo'lsa **HTTP 404** `"Xodim topilmadi"`.
3. Dublikat tekshiruv: `select Attendance where employee_id == data.employee_id AND date == today` → mavjud bo'lsa **HTTP 400** `"Bugun allaqachon belgilangan"`.
4. `now = datetime.now()`; `record = Attendance(employee_id=emp.id, employee_name=emp.name, date=today, check_in_time=now, notes=data.notes)`.
5. `db.add(record)`; commit; refresh.
6. **Side-effect (non-fatal, try/except pass)**: `company = get_json_setting("company_name", "")`; barcha `has_role_filter("admin") AND is_active==True` xodimlar uchun, `telegram_phone` bo'lsa: `telegram_service.send_message(admin.telegram_phone, f"{company}\n✅ {emp.name} ishga keldi\n🕐 {now:%H:%M}")`. Xato bo'lsa jim o'tadi.
7. Return `_serialize(record)`.

### 3.6 `POST /api/attendance/{id}/check-out`
**Body** (`CheckOut`): `notes:str?`.
**Jarayon**: `select Attendance where id == id` → yo'q → 404 `"Topilmadi"`. Agar `record.check_out_time` allaqachon to'lgan → **HTTP 400** `"Allaqachon chiqib ketilgan"`. `record.check_out_time = datetime.now()`; agar `data.notes` → `record.notes = data.notes`. commit; refresh; return `_serialize`.

### 3.7 `PATCH /api/attendance/{id}` — admin tuzatish
**Body** (`AttendanceEdit`): `check_in_time:datetime?`, `check_out_time:datetime?`, `notes:str?`, `clear_check_out:bool=False`, `clear_check_in:bool=False`.

**Jarayon**:
1. Topilmasa 404 `"Topilmadi"`.
2. Agar `clear_check_in` True → `check_in_time = None`; **aks holda** agar `check_in_time is not None` → `check_in_time = data.check_in_time`.
3. Agar `clear_check_out` True → `check_out_time = None`; **aks holda** agar `check_out_time is not None` → `check_out_time = data.check_out_time`.
4. Agar `notes is not None` → `record.notes = data.notes`.
5. commit; refresh; return `_serialize`.

**Mantiq nuance**: `clear_*` bayroq `check_*_time` dan ustun. `check_*_time` faqat `not None` bo'lganda yoziladi (yuborilmagan = o'zgarmaydi). Bu "yuborilmadi" vs "null qilindi" ni ajratish uchun (chunki JSON'da `null` ni Python `None` qiladi, shu sababli alohida `clear_*` bayroqlar). TS'da: `clear_*` true → null; aks holda field undefined emas (kelgan) bo'lsa → o'rnat.

### 3.8 `DELETE /api/attendance/{id}` — hard delete
Topilmasa 404 `"Topilmadi"`. `db.delete(record)`; commit; return `{"status": "ok"}`.

**Eslatma**: Attendance endpointlari activity log YOZMAYDI (boshqa modullardan farqli).

---

## 4. TASK (VAZIFA) MODULI — TIZIMNING YADROSI (`/api/tasks`)

### 4.1 Model `TaskTemplate` (task.py:7-40)
| Maydon | Tur | Default | Izoh |
|---|---|---|---|
| id | int PK | | |
| title | str | — | majburiy |
| description | text? | null | |
| employee_id | int? FK→employees SET NULL | null | aniq xodim |
| assigned_role | str? | null | `admin/cashier/warehouse/staff/all` |
| trigger_type | str | `"manual"` | `manual/scheduled/event` |
| schedule_time | str? | null | `"HH:MM"` |
| schedule_days | str? | null | `"all"` yoki `"1,2,3,4,5"` (Dush=1) yoki `"monthly:N"` |
| event_type | str? | null | `supply/large_sale/kassa_close/kassa_not_closed` |
| large_sale_threshold | float? | null | |
| department | str? | null | |
| priority | str | `"medium"` | `low/medium/high/urgent` |
| depends_on_template_id | int? FK→task_templates SET NULL | null | zanjir |
| reward_amount | float? | null | bajarilganda avto-bonus |
| fine_amount | float? | null | bajarilmadi/muddat o'tdi → avto-jarima |
| deadline_minutes | int? | null | javobgача daqiqa, keyin avto-expire |
| checker_id | int? FK→employees SET NULL | null | reviewer; agar bor → javoblar `pending_review` ga |
| response_type | str | `"none"` | `none/yes_no/text` |
| is_active | bool | True | |
| created_at | datetime | `datetime.now()` | |
| updated_at | datetime | `onupdate=datetime.now` | |

### 4.2 Model `TaskLog` (task.py:43-69)
| Maydon | Tur | Default | Izoh |
|---|---|---|---|
| id | int PK | | |
| template_id | int? FK SET NULL | null | |
| template_title | str | | jo'natish vaqtidagi nusxa |
| employee_id | int? FK SET NULL | null | |
| employee_name | str | | nusxa |
| telegram_target | str | | |
| message_text | text | | yuborilgan matn |
| status | str | `"sent"` | `sent/pending_review/answered_yes/answered_no/answered_text/failed` |
| response_type | str | `"none"` | template'dan nusxa |
| response_text | str? | null | |
| deadline_at | datetime? | null | avto-expire vaqti |
| sent_at | datetime? | null | |
| answered_at | datetime? | null | |
| checker_id | int? FK SET NULL | null | jo'natishda template'dan nusxa |
| review_comment | text? | null | |
| reviewed_by_name | str? | null | |
| reviewed_at | datetime? | null | |
| created_at | datetime | `datetime.now()` | |

### 4.3 Validatsiya konstantalari (tasks.py:17-20)
- `_TRIGGER_TYPES = {"manual","scheduled","event"}`
- `_RESPONSE_TYPES = {"none","yes_no","text"}`
- `_EVENT_TYPES = {"supply","large_sale","kassa_close"}` (E'tibor: model komментida `kassa_not_closed` ham bor, lekin bu set'da yo'q — set hech qayerda validatsiyaga ishlatilmagan, faqat e'lon qilingan)
- `_TIME_RE = ^\d{2}:\d{2}$`

### 4.4 `TemplateCreate` validatsiya (tasks.py:23-62)
Maydonlar 4.1'dagi modelга mos. Validatorlar:
- `trigger_type` ∈ `_TRIGGER_TYPES` aks holda ValueError `f"trigger_type must be one of {...}"`.
- `response_type` ∈ `_RESPONSE_TYPES` aks holda ValueError.
- `schedule_time` agar not None → `^\d{2}:\d{2}$` mos kelishi shart, aks holda `"schedule_time must be in HH:MM format"`.
(`priority`, `assigned_role`, `event_type` ga validator YO'Q — har qanday string qabul.)

### 4.5 `TemplateUpdate` — hamma maydon optional, faqat `schedule_time` validatori (HH:MM) bor.

### 4.6 Departments (AppSettings DB key=`task_departments`, JSON list)
- **`GET /api/tasks/departments`**: `get_setting("task_departments")` → JSON list; PLUS template'larda ishlatilgan distinct `department` lar; `list(dict.fromkeys(saved + used))` (tartibni saqlab dedupe). Return ro'yxat (massiv).
- **`POST /api/tasks/departments`** Body `{name:str}`: `name = data.name.strip()`; agar `name` bo'sh emas VA ro'yxatda yo'q → qo'shib saqla. Return yangilangan ro'yxat.
- **`DELETE /api/tasks/departments/{name}`**: ro'yxatdan `name` ni filtrlab tashlab saqla. Return yangilangan ro'yxat.

### 4.7 `GET /api/tasks/templates`
`select TaskTemplate order_by created_at DESC`. N+1 oldini olish: `employee_id` va `checker_id` larni bitta `select Employee.id, Employee.name where id IN (...)` bilan oladi → `emp_lookup`. `tmpl_lookup = {t.id: t.title}` (depends_on title uchun).

Har element:
```
{id, title, description, employee_id,
 employee_name: emp_lookup.get(employee_id) agar employee_id aks holda null,
 assigned_role, trigger_type, schedule_time, schedule_days,
 event_type, large_sale_threshold, response_type, is_active,
 department, priority: t.priority yoki "medium",
 depends_on_template_id,
 depends_on_title: tmpl_lookup.get(depends_on_template_id) agar bor aks holda null,
 reward_amount, fine_amount, deadline_minutes,
 checker_id, checker_name: emp_lookup.get(checker_id) agar bor aks holda null,
 created_at: isoformat yoki null}
```

### 4.8 `POST /api/tasks/templates`
**Jarayon**:
1. `tmpl = TaskTemplate(**data.model_dump())`; `db.add(tmpl)`.
2. `log_activity(action="created", module="tasks", entity_type="task_template", entity_title=data.title)`.
3. commit; refresh.
4. Agar `tmpl.trigger_type == "scheduled" AND tmpl.is_active` → `task_service._schedule_template(tmpl)` (APScheduler cron job qo'shadi).
5. Return `{"id": tmpl.id, "status": "ok"}`.

### 4.9 `PUT /api/tasks/templates/{id}`
**Jarayon**:
1. Topilmasa **HTTP 404** `"Shablon topilmadi"`.
2. `updates = data.model_dump(exclude_unset=True)`; diff mantiqi (2.8 kabi) → `changes`.
3. `log_activity(action="updated", ..., entity_id=id, entity_title=tmpl.title, changes=...)`.
4. commit; refresh.
5. Re-schedule: `job_id = f"task_{tmpl.id}"`; `scheduler.remove_job(job_id)` (try/except pass); agar `trigger_type=="scheduled" AND is_active` → `_schedule_template(tmpl)`.
6. Return `{"status": "ok"}`.

### 4.10 `DELETE /api/tasks/templates/{id}`
**Hard delete**. Topilmasa 404 `"Shablon topilmadi"`. `scheduler.remove_job(f"task_{tmpl.id}")` (try/except pass). `log_activity(action="deleted", ...)`. `db.delete(tmpl)`; commit; return `{"status": "ok"}`.

### 4.11 `POST /api/tasks/templates/{id}/send` — qo'lda yuborish
**Jarayon**:
1. `tmpl` ni titel uchun ol (`select where id==id`).
2. `sent = await task_service.send_task(db, id)` (4.16'ga qarang).
3. `log_activity(action="sent", ..., entity_id=id, entity_title=tmpl.title if tmpl else None, extra={"sent_count": sent})`.
4. commit; return `{"sent": sent}`.

### 4.12 `GET /api/tasks/logs` — paginatsiya + multi-filtr
**Query**:
- `limit:int=50`, `offset:int=0`
- `employee_id:int?` (legacy single), `status:str?` (legacy single)
- `template_titles:List[str]?`, `employee_names:List[str]?`, `statuses:List[str]?` (multi-select; takror param yoki CSV qabul — `_split_csv`)
- `response_search:str?` (case-insensitive contains, `response_text` bo'yicha)
- `date_from:datetime?`, `date_to:datetime?` (`created_at` bo'yicha)
- `sort_by:str="created_at"`, `sort_dir: "asc"|"desc" = "desc"`

**`_split_csv`**: har value uchun `,` bo'yicha bo'lib, strip qilib, bo'sh bo'lmaganlarni yig'adi. Takror param VA bitta CSV ikkalasini ham qo'llaydi.

**Filtr semantikasi**: ustunlar orasida AND, ustun ichida OR (IN). Bo'sh ro'yxat = filtersiz.

**Sort maydonlari** (`_LOG_SORT_FIELDS`): `created_at, sent_at, answered_at, template_title, employee_name, status`. Noma'lum `sort_by` → `created_at`.

**Jarayon**: query qur → legacy filtrlar → multi IN filtrlar → response_search ILIKE → date range → order_by → `total = count(subquery)` → `offset/limit`.

**Response**:
```
{"items": [{id, template_title, employee_id, employee_name, telegram_target,
  message_text, status, response_type, response_text, checker_id,
  review_comment, reviewed_by_name, reviewed_at,
  sent_at, answered_at, deadline_at, created_at}...],
 "total", "limit", "offset"}
```

### 4.13 `GET /api/tasks/logs/filter-options`
Distinct + count har filterlanadigan ustun uchun (butun TaskLog jadval bo'yicha).
- `templates`: TaskLog title'lari count bilan; PLUS barcha aktiv TaskTemplate title'lari (count=0 agar hech yuborilmagan); saralash: `key=(-count, value)` (logли bor — desc count, keyin alifbo).
- `employees`: `employee_name` distinct + count, count DESC.
- `statuses`: `status` distinct + count, count DESC.
- `total`: jami TaskLog soni.
Return `{"total", "templates":[{value,count}], "employees":[...], "statuses":[...]}`.

### 4.14 `PATCH /api/tasks/logs/{id}/answer` — XODIM JAVOBI (MUHIM)

**Body** (`AnswerUpdate`): `status: Literal["answered_yes","answered_no","answered_text"]` (majburiy), `response_text:str?`.

**Jarayon QADAM-BA-QADAM**:
1. `select TaskLog where id==id` → yo'q → **HTTP 404** `"Topilmadi"`.
2. Template'ni ol: agar `log.template_id` → `select TaskTemplate where id==log.template_id` → `tmpl` (yoki None).
3. **Checker aniqlash**: `has_checker = bool(log.checker_id OR (tmpl AND tmpl.checker_id))`.
4. `is_completion_claim = data.status in ("answered_yes","answered_text")`.
5. `deferred_for_review = has_checker AND is_completion_claim`.
6. **Agar `deferred_for_review`**:
   - `log.status = "pending_review"`
   - `log.response_text = data.response_text`
   - `log.answered_at = datetime.now()`
   - Agar `log.checker_id` yo'q VA `tmpl AND tmpl.checker_id` → `log.checker_id = tmpl.checker_id` (template checker'ini log'ga ko'chir)
7. **Aks holda** (checker yo'q YOKI status=`answered_no`):
   - `log.status = data.status`
   - `log.response_text = data.response_text`
   - `log.answered_at = datetime.now()`
8. `log_activity(action="answered", module="tasks", entity_type="task_log", entity_id=id, entity_title=log.template_title, extra={"status": log.status, "response_text": data.response_text, "deferred_for_review": deferred_for_review})`.
9. commit.

**A) Pending-review yo'li** (`deferred_for_review` True):
- `payload = {"type":"pending_review","task_id":log.id,"employee_id","employee_name","template_title","response_text","checker_id"}`
- Agar `log.checker_id` → `task_ws_manager.send_to_employee(log.checker_id, payload)`
- `task_ws_manager.broadcast_to_admins(payload)`
- **Return `{"status": "pending_review"}`** (bonus/fine YO'Q, admin notify YO'Q, chain YO'Q).

**B) To'g'ridan-finalize yo'li** (checker yo'q, yoki `answered_no`):
- **Auto-bonus/fine** (agar `tmpl` mavjud):
  - Agar `data.status ∈ {answered_yes, answered_text}` VA `tmpl.reward_amount` VA `tmpl.reward_amount > 0`:
    - `BonusFineLog(employee_id=log.employee_id, employee_name=log.employee_name yoki "Xodim", type="bonus", title=f"Vazifa mukofoti: {tmpl.title}", amount=tmpl.reward_amount, note=f"Avtomatik — vazifa #{log.id} bajarildi")`; add; commit; refresh; `bonus_amount = tmpl.reward_amount`.
  - Aks holda agar `data.status == "answered_no"` VA `tmpl.fine_amount` VA `> 0`:
    - `BonusFineLog(... type="fine", title=f"Vazifa bajarilmadi: {tmpl.title}", amount=tmpl.fine_amount, note=f"Avtomatik — vazifa #{log.id} rad etildi")`; add; commit; refresh; `fine_amount = tmpl.fine_amount`.
- **Admin Telegram**: `admin_notifier.notify_task_answered(log, bonus_amount, fine_amount)` (try/except, xato log).
- **Xodimga Telegram**: agar `bonus_amount` yoki `fine_amount` → `task_service.notify_employee_of_outcome(log, bonus_amount, fine_amount, rejected=(data.status=="answered_no"))` (try/except).
- **Admin panel WS**: `broadcast_to_admins({"type":"task_answered","task_id":id,"employee_id","employee_name","template_title","status":data.status,"response_text":data.response_text})`.
- **Chain trigger** (agar `log.template_id` VA `log.employee_id`):
  - `emp = select Employee where id==log.employee_id`. Agar `emp`:
    - `next_templates = select TaskTemplate where depends_on_template_id == log.template_id AND is_active==True`.
    - Har `nt` uchun `applies` aniqla:
      - `nt.employee_id AND nt.employee_id == emp.id` → True
      - elif `nt.assigned_role == "all"` → True
      - elif `nt.assigned_role AND emp_has_role(emp, nt.assigned_role)` → True
    - Agar `applies` → `task_service.send_task_to_employee(db, nt, emp)` (4.17'ga qarang).
- **Return `{"status": "ok"}`**.

### 4.15 STATUS MASHINA (vazifa) — to'liq jadval

| Boshlang'ich | Hodisa | Shart | Yangi status | Side-effect |
|---|---|---|---|---|
| (yo'q) | `send_task` muvaffaqiyat | telegram yuborildi | `sent` | WS new_task, deadline_at o'rnatiladi |
| (yo'q) | `send_task` muvaffaqiyatsiz | telegram xato | `failed` | WS new_task (status=failed), sent_at=None |
| `sent` | answer `answered_yes`/`answered_text` | checker BOR (log.checker_id yoki tmpl.checker_id) | `pending_review` | checker+admin WS, **bonus YO'Q** |
| `sent` | answer `answered_yes`/`answered_text` | checker YO'Q | `answered_yes`/`answered_text` | reward_amount>0 → bonus; admin+emp Telegram; chain |
| `sent` | answer `answered_no` | (checker borligidan qat'i nazar) | `answered_no` | fine_amount>0 → jarima; admin+emp Telegram; chain (darhol jarima — "iqror" — review yo'q) |
| `sent` | deadline o'tdi (expire job) | `deadline_at <= now` | `answered_no` | response_text="⏰ Vaqt tugadi — avtomatik"; fine_amount>0 → jarima; admin Telegram; admin WS |
| `pending_review` | review `approve` | response_type=="text" | `answered_text` | reward_amount>0 → bonus; admin+emp Telegram |
| `pending_review` | review `approve` | response_type != "text" | `answered_yes` | reward_amount>0 → bonus; admin+emp Telegram |
| `pending_review` | review `reject` | — | `answered_no` | fine_amount>0 → jarima; admin+emp Telegram |
| `pending_review` | review (review_task) | `log.status != "pending_review"` | (o'zgarmaydi) | **HTTP 400** `f"Vazifa tekshiruv kutmoqda emas (joriy status: {log.status})"` |

**KRITIK nuance**: `answered_no` HECH QACHON `pending_review` ga bormaydi — xodim o'zi "bajarmadim" desa, bu darhol finalize bo'ladi (review uni qutqara olmaydi). Faqat `answered_yes`/`answered_text` (completion claim) checker bo'lganda `pending_review` ga boradi. Pending-review path'da chain trigger ISHGA TUSHMAYDI (faqat review approve/reject'dan keyin emas — review_task chain trigger qilmaydi! Chain faqat `answer_task`ning to'g'ridan-finalize yo'lida. Bu MUHIM — checker'li vazifalarda zanjir review'dan keyin ham ishga tushmaydi).

### 4.16 `GET /api/tasks/pending-review`
**Query**: `checker_id:int` (majburiy).
`select TaskLog where status=="pending_review" AND checker_id==checker_id order_by answered_at DESC`. Return `{"items":[{id, template_title, employee_id, employee_name, telegram_target, message_text, response_type, response_text, checker_id, sent_at, answered_at, deadline_at, created_at}...], "total": len}`.

### 4.17 `PATCH /api/tasks/logs/{id}/review` — REVIEWER QARORI (MUHIM)

**Body** (`ReviewUpdate`): `decision: Literal["approve","reject"]` (majburiy), `comment:str?`.

**Jarayon QADAM-BA-QADAM**:
1. `select TaskLog where id==id` → yo'q → **HTTP 404** `"Topilmadi"`.
2. Agar `log.status != "pending_review"` → **HTTP 400** `f"Vazifa tekshiruv kutmoqda emas (joriy status: {log.status})"`.
3. `(user_name, user_role) = decode_token_user(...)`.
4. Status hisoblash:
   - `decision == "approve"` → `log.status = "answered_text" agar log.response_type == "text" aks holda "answered_yes"`.
   - `decision == "reject"` → `log.status = "answered_no"`.
5. `log.review_comment = data.comment`; `log.reviewed_by_name = user_name yoki "Tekshiruvchi"`; `log.reviewed_at = datetime.now()`.
6. `log_activity(action="reviewed", module="tasks", entity_type="task_log", entity_id=id, entity_title=log.template_title, extra={"decision","comment","final_status": log.status})`.
7. commit.
8. **Auto-bonus/fine** (agar `log.template_id` → tmpl ol):
   - `decision=="approve"` VA `tmpl.reward_amount>0` → `BonusFineLog(type="bonus", title=f"Vazifa mukofoti: {tmpl.title}", amount=tmpl.reward_amount, note=f"Avtomatik — vazifa #{log.id} tasdiqlandi ({log.reviewed_by_name})")`; commit; refresh; `bonus_amount`.
   - `decision=="reject"` VA `tmpl.fine_amount>0` → `BonusFineLog(type="fine", title=f"Vazifa rad etildi: {tmpl.title}", amount=tmpl.fine_amount, note=f"Avtomatik — vazifa #{log.id} rad etildi ({log.reviewed_by_name})")`; commit; refresh; `fine_amount`.
9. **Admin Telegram**: `admin_notifier.notify_task_answered(log, bonus_amount, fine_amount)` (try/except).
10. **Xodimga Telegram**: `task_service.notify_employee_of_outcome(log, bonus_amount, fine_amount, comment=data.comment, reviewed_by_name=log.reviewed_by_name, rejected=(decision=="reject"))` (try/except).
11. **Admin WS**: `broadcast_to_admins({"type":"task_reviewed","task_id":id,"employee_id","employee_name","template_title","status":log.status,"decision":data.decision,"review_comment":data.comment,"reviewed_by_name":log.reviewed_by_name})`.
12. **Return `{"status": "ok", "final_status": log.status}`**.

(Eslatma: review_task chain trigger qilmaydi — checker'li vazifalar zanjirni ishga tushirmaydi.)

### 4.18 `GET /api/tasks/logs/mine`
**Query**: `employee_id:int` (majburiy), `since_minutes:int=120`.
`since = datetime.now(timezone.utc) - timedelta(minutes=since_minutes)` (**E'TIBOR: UTC ishlatilgan**, lekin `created_at` lokal vaqtda saqlanadi — bu nomuvofiqlik aynan saqlanishi kerak, aks holda filtr +5 soat oynani noto'g'ri kesadi). `select TaskLog where employee_id==employee_id AND created_at >= since order_by created_at DESC`. Return `{"items":[{id, template_title, employee_name, telegram_target, message_text, status, response_type, response_text, sent_at, answered_at, deadline_at, created_at}...], "total": len}`.

---

## 5. TASK SERVICE (vazifa biznes mantig'i) — `task_service.py`

### 5.1 Scheduler (`AsyncIOScheduler`)
- `start()` — running emas bo'lsa start.
- `stop()` — `shutdown(wait=False)`.
- `reload_schedules()` — barcha `task_` prefiksli joblarni o'chir; `select TaskTemplate where is_active==True AND trigger_type=="scheduled"`; har biri uchun `_schedule_template`.

### 5.2 `_schedule_template(tmpl)` — cron job qo'shish
```
agar not tmpl.schedule_time: return
try: hour, minute = schedule_time.split(":")  except ValueError: return
days_raw = tmpl.schedule_days yoki "all"
job_id = f"task_{tmpl.id}"

# Oylik: "monthly:3" = har oyning 3-kuni
agar days_raw "monthly:" bilan boshlanса:
   try: day_of_month = int(days_raw.split(":")[1]) except: return
   add_job(_run_template, CronTrigger(hour, minute, day=day_of_month), id=job_id, args=[tmpl.id], replace_existing=True)
   return

# Haftalik: "all" yoki "1,2,3,4,5" (Dush=1)
agar days_raw == "all": day_of_week = "mon,tue,wed,thu,fri,sat,sun"
aks holda:
   day_map = {"1":"mon","2":"tue","3":"wed","4":"thu","5":"fri","6":"sat","7":"sun"}
   days = [day_map.get(d.strip(), d.strip()) for d in days_raw.split(",")]
   day_of_week = ",".join(days)
add_job(_run_template, CronTrigger(hour, minute, day_of_week=day_of_week), id=job_id, args=[tmpl.id], replace_existing=True)
```
TS'da: cron kutubxonasi (masalan `node-cron`/`cron`). `monthly:N` → har oy N-kun HH:MM. `all` → har kun HH:MM. `"1,2,3"` → tegishli hafta kunlarida HH:MM. Dush=1 ... Yak=7.

### 5.3 `send_task(db, template_id, extra_context="") -> int`
1. `select TaskTemplate where id==template_id` → yo'q YOKI `not is_active` → return 0.
2. `employees = _get_target_employees(db, tmpl)` (5.6).
3. Har `emp` uchun:
   - `target = emp.telegram_phone`; agar yo'q → skip (continue).
   - `text = _build_message(tmpl, emp, extra_context)` (5.8).
   - `success = telegram_service.send_message(target, text)`; `TelegramSendError` ushlanса `success=False`.
   - `now = datetime.now()`; `deadline = now + timedelta(minutes=tmpl.deadline_minutes) agar tmpl.deadline_minutes aks holda None`.
   - `TaskLog(template_id, template_title=tmpl.title, employee_id=emp.id, employee_name=emp.name, telegram_target=target, message_text=text, response_type=tmpl.response_type, status="sent" agar success aks holda "failed", sent_at=now agar success aks holda None, deadline_at=deadline, checker_id=tmpl.checker_id)`; add.
   - Agar success → `sent += 1`.
4. commit.
5. Har log uchun refresh; `payload = {"type":"new_task","task":{id, template_title, employee_id, employee_name, message_text, response_type, status, sent_at(iso/null), answered_at:null, deadline_at(iso/null), response_text:null, created_at(iso/null)}}`; `send_to_employee(emp.id, payload)`; `broadcast_to_admins(payload)`.
6. return `sent`.

### 5.4 `_run_template(template_id)` — scheduler chaqiradi: yangi `AsyncSessionLocal` ochib `send_task(db, template_id)`.

### 5.5 `send_task_to_employee(db, tmpl, emp) -> bool` — chain trigger ishlatadi
`target = emp.telegram_phone`; yo'q → return False. `text=_build_message(tmpl, emp)`. send → success/False. `now`, `deadline` (xuddi 5.3). `TaskLog(...)` **lekin `checker_id` o'rnatilmaydi** (E'TIBOR: chain orqali yuborilgan loglarда `checker_id` = None, hatto template'da bo'lsa ham — bu nuance: zanjirdagi vazifa javobi `pending_review` ga bormaydi, chunki `log.checker_id` None va `answer_task`da tmpl yana qaraladi → aslida `has_checker` tmpl.checker_id orqali True bo'ladi. Demak amalda chain log'ning template'i checker'li bo'lsa, javob baribir pending_review ga boradi, lekin send vaqtida log.checker_id None). add; commit; refresh; WS payload (deadline_at yo'q `answered_at:null` versiyasi — `send_task_to_employee`da payload'da `deadline_at` MAVJUD EMAS, faqat `send_task`da bor; aynan saqlang). Return success.

### 5.6 `_get_target_employees(db, tmpl) -> List[Employee]`
`base_filters = [is_active==True, telegram_phone IS NOT NULL, telegram_phone != ""]`.
- Agar `tmpl.employee_id` → `select Employee where id==tmpl.employee_id AND *base_filters` → `[emp]` yoki `[]`.
- elif `tmpl.assigned_role AND tmpl.assigned_role != "all"` → `select where has_role_filter(assigned_role) AND *base_filters` → hammasi.
- else → `select where *base_filters` → hammasi (barcha aktiv telegramli xodimlar).

### 5.7 `send_task_to_role(db, role, title, description, response_type="none", extra_context="") -> int`
Dinamik (template'siz). `select Employee where has_role_filter(role) AND is_active==True AND telegram_phone IS NOT NULL AND telegram_phone != ""`. Har biriga matn: `f"📋 *{title}*\n\n{description}"`; agar extra_context → `+ f"\n\n{extra_context}"`; agar `response_type=="yes_no"` → `+ "\n\n✅ Ha / ❌ Yo'q"`. send; `TaskLog(template_title=title, employee_id, employee_name, telegram_target, message_text, response_type, status, sent_at)` (template_id YO'Q). commit; WS payload (har biriga). return sent. (Bu kodbazada hech qayerdan chaqirilmagan — dead code, lekin to'liqlik uchun.)

### 5.8 `_build_message(tmpl, emp, extra_context="") -> str` — AYNAN format
```
now = datetime.now().strftime("%d-%m-%Y %H:%M")
lines = [f"📋 *{tmpl.title}*", f"🕐 {now}"]
agar tmpl.deadline_minutes:
   h = deadline_minutes // 60
   m = deadline_minutes % 60
   dl = f"{h} soat {m} daqiqa" agar h aks holda f"{m} daqiqa"
   lines.append(f"⏳ Muddat: {dl}")
agar tmpl.description: lines.append(f"\n{tmpl.description}")
agar extra_context: lines.append(f"\n{extra_context}")
agar response_type=="yes_no": lines.append("\n✅ Ha yoki ❌ Yo'q deb javob bering")
elif response_type=="text": lines.append("\nIzoh bilan javob bering")
return "\n".join(lines)
```

### 5.9 `expire_overdue_tasks()` — har 60 soniyada (IntervalTrigger 60s)
1. `now = datetime.now()` (lokal).
2. Yangi session. `select TaskLog where status=="sent" AND deadline_at IS NOT NULL AND deadline_at <= now`.
3. Bo'sh bo'lsa return.
4. Har `log` uchun:
   - `log.status = "answered_no"`
   - `log.response_text = "⏰ Vaqt tugadi — avtomatik"`
   - `log.answered_at = now`
   - Agar `log.template_id` → tmpl ol; agar `tmpl.fine_amount > 0` → `BonusFineLog(type="fine", title=f"Vazifa bajarilmadi: {tmpl.title}", amount=tmpl.fine_amount, note=f"Avtomatik — vazifa #{log.id} muddati o'tdi")`; add; `fine_amount = tmpl.fine_amount`.
   - `pending.append((log, fine_bf, fine_amount))`.
5. commit. Har fine_bf refresh.
6. Har `(log, fine_bf, fine_amount)` uchun: `admin_notifier.notify_task_expired(log, fine_amount)` (try/except); `broadcast_to_admins({"type":"task_answered","task_id":log.id,"employee_id","employee_name","template_title","status":"answered_no","response_text":"⏰ Vaqt tugadi"})`.

**MUHIM**: Faqat `status=="sent"` loglar expire bo'ladi. `pending_review` dagi loglar **HECH QACHON expire bo'lmaydi** (reviewer cheksiz kuta oladi). Expire'da xodimga Telegram YUBORILMAYDI (faqat admin). Expire jarima manbasi `note` da "muddati o'tdi" deb belgilanadi (admin_notifier'da `auto_expire_fine` label'i bilan mos).

### 5.10 `notify_employee_of_outcome(log, *, bonus_amount=None, fine_amount=None, comment=None, reviewed_by_name=None, rejected=False)` — AYNAN format
```
target = log.telegram_target; agar yo'q → return (no-op)
is_reject = rejected
header = "❌ *Vazifa rad etildi*" agar is_reject aks holda "✅ *Vazifa tasdiqlandi*"
agar (reviewed_by_name yo'q) VA fine_amount VA (bonus_amount yo'q): header = "❌ *Vazifa bajarilmadi*"
elif (reviewed_by_name yo'q) VA bonus_amount: header = "✅ *Vazifa bajarildi*"
lines = [header, "", f"📋 {log.template_title yoki '—'}"]
agar reviewed_by_name: lines.append(f"🧑‍⚖ Tekshiruvchi: {reviewed_by_name}")
agar bonus_amount > 0: lines.append(f"💰 Bonus: +{int(round(bonus_amount)):,} so'm".replace(",", " "))
agar fine_amount > 0: lines.append(f"💰 Jarima: -{int(round(fine_amount)):,} so'm".replace(",", " "))
agar comment: lines.append(f"💬 Izoh: {comment}")
text = "\n".join(lines)
telegram_service.send_message(target, text)  # try/except — xato bo'lsa faqat warn, oqim buzilmaydi
```
Raqam formati: `int(round(x))` → minglik ajratgich bo'sh joy (masalan `50000` → `50 000`).

---

## 6. SYNC EVENT TRIGGER (event-trigger vazifalar) — `sync_service.py`

### 6.1 `_trigger_event_tasks(db, event_type, doc, amount=0)` (sync_service.py:459)
```
select TaskTemplate where trigger_type=="event" AND event_type==event_type AND is_active==True
har tmpl uchun:
   agar event_type=="large_sale" VA tmpl.large_sale_threshold:
      agar amount < tmpl.large_sale_threshold: continue   # ostona bajarilmadi → skip
   doc_name = doc.get("name","")
   agent_name = doc.agent.name (agar dict)
   context = f"Hujjat: {doc_name}"
   agar agent_name: context += f"\nMijoz: {agent_name}"
   agar event_type=="large_sale" VA amount: context += f"\nSumma: {amount:,.2f}"
   await task_service.send_task(db, tmpl.id, context)
```

### 6.2 Chaqirilish nuqtalari
- **`large_sale`**: `sync_demands` da har yangi demand uchun: `total_sum = (doc.sum yoki 0) / 100` (MoySklad summani tiyinda beradi, 100ga bo'linadi); `_trigger_event_tasks(db, "large_sale", doc, total_sum)`.
- **`supply`**: `sync_supplies` da yangi hujjat (`is_new AND self._last_sync`): `_trigger_event_tasks(db, "supply", doc)` (amount=0).
- `kassa_close`/`kassa_not_closed`: `_EVENT_TYPES` da `kassa_close` e'lon qilingan, lekin kodbazada `_trigger_event_tasks(... "kassa_close" ...)` chaqiruvi **YO'Q** (kassa close endpoint event task trigger qilmaydi). TS'da bu xulq saqlanadi (yoki kelajak uchun qoldiriladi).

`_last_sync` — birinchi yuklashda event triggerlar ishlamaydi (`if not self._last_sync: continue/return`) — eski hujjatlar uchun spam oldini olish.

---

## 7. BONUS/FINE MODULI (`/api/bonus-fine`)

### 7.1 Model `BonusFineRule` (bonus_fine.py:7-19)
| Maydon | Tur | Default |
|---|---|---|
| id | int PK | |
| type | str | majburiy (`"bonus"`/`"fine"`) |
| title | str | majburiy |
| description | str? | null |
| amount | float | majburiy (default 0) |
| role | str? | null (`admin/cashier/warehouse/staff` yoki null=all) |
| is_active | bool | True |
| created_at | datetime | `datetime.now()` |
| updated_at | datetime | `onupdate` |

### 7.2 Model `BonusFineLog` (bonus_fine.py:22-34)
| Maydon | Tur | Default |
|---|---|---|
| id | int PK | |
| rule_id | int? FK→bonus_fine_rules | null |
| employee_id | int FK→employees | majburiy |
| employee_name | str | majburiy |
| type | str | majburiy (`bonus`/`fine`) |
| title | str | majburiy |
| amount | float | majburiy |
| note | str? | null |
| created_at | datetime | `datetime.now()` |

### 7.3 Validatsiya
- `_VALID_TYPES = {"bonus","fine"}`, `_VALID_ROLES = {"admin","cashier","warehouse","staff"}`.
- `RuleCreate.type` ∈ `_VALID_TYPES` aks holda `"type must be 'bonus' or 'fine'"`. `RuleCreate.role` agar not None → ∈ `_VALID_ROLES` aks holda `f"role must be one of {sorted(...)}"`.
- `LogCreate.type` ∈ `_VALID_TYPES`.

### 7.4 Rule endpointlari
- **`GET /api/bonus-fine/rules`** Query `type?, role?, active_only=True`. `select BonusFineRule`; agar active_only → is_active==True; agar type → type==type; agar role → `where OR(role==role, role==None)` (rol-spetsifik + universal); `order_by created_at DESC`. Return `{"items":[RuleResponse...], "total"}`.
- **`POST /api/bonus-fine/rules`** → `RuleResponse`. `BonusFineRule(**data)`; add; `log_activity(action="created", module="bonus_fine", entity_type="bonus_rule", entity_title=f"{type}: {title}", extra={"amount","type"})`; commit; refresh.
- **`PUT /api/bonus-fine/rules/{rule_id}`** → `RuleResponse`. Yo'q → 404 `"Qoida topilmadi"`. `RuleUpdate` (title?, description?, amount?, role?, is_active?). Diff (2.8). `log_activity(action="updated", entity_id=rule_id, ...)`. commit; refresh.
- **`DELETE /api/bonus-fine/rules/{rule_id}`** — **soft** (`is_active=False`). Yo'q → 404 `"Qoida topilmadi"`. `log_activity(action="deleted", ...)`. Return `{"ok": True}`.

### 7.5 `GET /api/bonus-fine/logs`
**Query**: `type?, employee_id?, month:int?, year:int?, days:int?`.
- `select BonusFineLog`; agar type → type filter; agar employee_id → filter.
- **Agar `days`**: `start = datetime.combine(date.today() - timedelta(days=days-1), datetime.min.time())`; `where created_at >= start`. (`days=1` = bugun; `days=30` = oxirgi 30 kun.)
- **elif `month AND year`**: `where extract(month,created_at)==month AND extract(year,created_at)==year`.
- `days` ustun (ikkalasi berilsa days g'olib).
- `order_by created_at DESC`. Return `{"items":[LogResponse...], "total"}`.

### 7.6 `GET /api/bonus-fine/logs/today/{employee_id}`
**Query**: `type?`. `today_start = datetime.combine(date.today(), datetime.min.time())`. `select BonusFineLog where employee_id==employee_id AND created_at >= today_start`; agar type → filter. Return `{"items":[LogResponse...]}` (total YO'Q).

### 7.7 `DELETE /api/bonus-fine/logs/{log_id}`
Yo'q → 404 `"Log topilmadi"`. `log_activity(action="deleted", module="bonus_fine", entity_type="bonus_fine_log", entity_id=log_id, entity_title=f"{type}: {title} — {employee_name}")`. `db.delete(log)`; commit; return `{"ok": True}`.

### 7.8 `POST /api/bonus-fine/logs` → `LogResponse` — qo'lda bonus/jarima
**Body** (`LogCreate`): `rule_id:int?`, `employee_id:int` (majburiy), `type:str` (majburiy, validatsiya), `title:str` (majburiy), `amount:float` (majburiy), `note:str?`.

**Jarayon**:
1. `select Employee where id==data.employee_id` → yo'q → **HTTP 404** `"Xodim topilmadi"`.
2. `BonusFineLog(rule_id, employee_id, employee_name=emp.name, type, title, amount, note)`; add.
3. `log_activity(action="created", module="bonus_fine", entity_type="bonus_fine_log", entity_title=f"{type}: {title} — {emp.name}", extra={"amount","type","employee": emp.name})`.
4. commit; refresh.
5. **Admin Telegram**: `source = "rule" agar data.rule_id aks holda "manual"`; `admin_notifier.notify_bonus_fine_created(log, source=source)` (try/except).
6. Return log.

### 7.9 `GET /api/bonus-fine/summary` — OYLIK HISOB-KITOB (MUHIM formula)
**Query**: `days:int?`, `month:int?`, `year:int?`.

**Jarayon**:
1. `employees = select Employee where is_active==True order_by name`.
2. `today = date.today()`.
3. **Davr loglari**: agar `days` → `start = datetime.combine(today - timedelta(days=days-1), min.time())`; `where created_at >= start`. elif `month AND year` → extract filter. Aks holda filtersiz (HAMMA loglar).
4. **Bugungi loglar** (har doim alohida): `today_start = datetime.combine(today, min.time())`; `where created_at >= today_start`.
5. `log_map[eid] = {total_bonus, total_fine}` — davr loglarini employee_id bo'yicha yig'; type=="bonus" → total_bonus += amount; aks holda total_fine += amount.
6. `today_map[eid] = {today_bonus, today_fine}` — xuddi shunday bugungi loglar uchun.
7. Har `emp` uchun:
   - `base = emp.base_salary yoki 0`
   - **`net_salary = base + total_bonus - total_fine`**
   - `{"employee_id","employee_name","role","base_salary": base, "total_bonus","total_fine","today_bonus","today_fine","net_salary"}`
8. Return `{"items": [...]}`.

**Asosiy formula**: `net_salary = base_salary + Σ(bonus.amount) − Σ(fine.amount)` (davr ichida). KPI/komissiya bu endpointga kirmaydi (salary router alohida).

### 7.10 Avto-bonus/jarima — 5 MANBA (admin_notifier `_SOURCE_LABELS`)
| Manba kaliti | Label | Qachon yaratiladi | amount |
|---|---|---|---|
| `manual` | "Qo'lda" | `POST /bonus-fine/logs`, rule_id yo'q | request.amount |
| `rule` | "Qoida asosida (avtomatik)" | `POST /bonus-fine/logs`, rule_id bor | request.amount |
| `auto_task_reward` | "Avtomatik — vazifa bajarilgani uchun" | answer/review approve, tmpl.reward_amount>0 | tmpl.reward_amount |
| `auto_task_fine` | "Avtomatik — vazifa bajarilmagani uchun" | answer answered_no/review reject, tmpl.fine_amount>0 | tmpl.fine_amount |
| `auto_expire_fine` | "Avtomatik — vazifa vaqti tugagani uchun" | expire job, tmpl.fine_amount>0 | tmpl.fine_amount |

**MUHIM kuzatish**: `answer_task`/`review_task`/`expire_overdue_tasks` `BonusFineLog` ni TO'G'RIDAN-TO'G'RI yaratadi (`POST /bonus-fine/logs` ni chaqirmaydi) va `admin_notifier.notify_bonus_fine_created(... source=...)` ni ALOHIDA chaqirmaydi — ular `notify_task_answered`/`notify_task_expired` orqali BIRLASHTIRILGAN xabar yuboradi ("Vazifa bajarildi → Bonus"). `auto_task_*`/`auto_expire_fine` source label'lari faqat ta'rifda mavjud, amalda `notify_bonus_fine_created` ga uzatilmaydi (kombinatsiyalangan xabar ishlatiladi). TS'da: avto-bonus/jarima `BonusFineLog` qatori yaratiladi (`note` matni bilan: "Avtomatik — vazifa #N bajarildi/rad etildi/muddati o'tdi"), lekin alohida bonus/fine Telegram xabari emas, kombinatsiyalangan task xabari yuboriladi.

---

## 8. ACTIVITY LOG MODULI (`/api/activity`)

### 8.1 Model `ActivityLog` (activity_log.py:7-19)
| Maydon | Tur | Default |
|---|---|---|
| id | int PK | |
| created_at | datetime | `datetime.now()` |
| user_name | str | "Admin" yoki xodim ismi |
| user_role | str | admin/cashier/... |
| action | str | created/updated/deleted/sent/answered/opened/closed/activated/deactivated/password_set/reviewed |
| module | str | employees/tasks/bonus_fine/kassa/settings |
| entity_type | str | task_template/employee/bonus_rule/kassa_session/task_log/bonus_fine_log |
| entity_id | int? | null |
| entity_title | str? | null |
| changes | text? (JSON) | `{"field": {"old": v, "new": v}}` |
| extra | text? (JSON) | qo'shimcha kontekst |

### 8.2 `log_activity(db, *, user_name, user_role, action, module, entity_type, entity_id=None, entity_title=None, changes=None, extra=None)`
`ActivityLog(...)`; `changes` va `extra` → `json.dumps(..., ensure_ascii=False)` agar mavjud aks holda None. `db.add(log)`. **commit QILMAYDI — chaqiruvchi commit qiladi.** Barcha xato jim yutiladi (asosiy mantiqni buzmaydi). Bu pattern: routerlar avval `log_activity` chaqiradi (add), keyin asosiy o'zgarishlardan keyin yagona `db.commit()` qiladi.

### 8.3 `GET /api/activity`
**Query**: `limit:int=50`, `offset:int=0`, `module:str?`, `action:str?`, `search:str?`.
`select ActivityLog order_by created_at DESC`; agar module → filter; agar action → filter; agar search → `where OR(entity_title ILIKE %search%, user_name ILIKE %search%)`. `total = count(subquery)`; offset/limit.

**Response** har element: `{id, created_at(iso/null), user_name, user_role, action, action_label, module, module_label, entity_type, entity_id, entity_title, changes (json.loads yoki null), extra (json.loads yoki null)}`. `total`.

**`ACTION_LABELS`** (activity.py:11): created→"Yaratildi", updated→"O'zgartirildi", deleted→"O'chirildi", sent→"Yuborildi", answered→"Javob berildi", opened→"Ochildi", closed→"Yopildi", activated→"Faollashtirildi", deactivated→"O'chirildi", password_set→"Parol o'zgartirildi". Noma'lum action → o'zi.

**`MODULE_LABELS`**: employees→"Xodimlar", tasks→"Vazifalar", bonus_fine→"Bonus/Jarima", kassa→"Kassa", settings→"Sozlamalar". Noma'lum → o'zi.

(`reviewed` action `ACTION_LABELS` da yo'q — label sifatida "reviewed" o'zi qaytadi. Bu nuance saqlansin.)

### 8.4 `GET /api/activity/stats`
`since = datetime.now(timezone.utc) - timedelta(days=30)` (**UTC**). `select module, count(id) where created_at >= since group_by module`. Return `{module: count, ...}` (oddiy dict).

---

## 9. KASSA MODULI (`/api/kassa`)

### 9.1 Model `KassaSession` (kassa.py:7-23)
| Maydon | Tur | Default |
|---|---|---|
| id | int PK | |
| session_date | Date | majburiy |
| cashier_id | int? | null |
| cashier_name | str? | null |
| opening_amount | float | 0.0 |
| cash_received | float | 0.0 (jami naqd savdo) |
| terminal_amount | float | 0.0 (karta to'lovlari) |
| transit_amount | float | 0.0 (yo'ldagi pul) |
| safe_amount | float | 0.0 (seyfdagi tasdiqlangan) |
| terminal_confirmed | bool | False |
| terminal_bank_deposited | bool | False |
| status | str | `"open"` (`open`/`closed`) |
| opened_at | datetime | `datetime.now()` |
| closed_at | datetime? | null |
| notes | text? | null |

`_serialize(s)` — barcha maydonlar, datetimelar `.isoformat()` yoki null (E'TIBOR: `_to_iso` ishlatilmaydi, oddiy `.isoformat()`).

### 9.2 Endpointlar
- **`GET /api/kassa/today`**: `select KassaSession where session_date==today order_by id DESC` → birinchisi. Yo'q → `{"session": None, "date": today.isoformat()}`. Bor → `{"session": _serialize(...)}`.
- **`GET /api/kassa/history`** Query `limit:int=30`. `order_by session_date DESC limit limit`. Return massiv `_serialize`.
- **`POST /api/kassa/open`** Body (`KassaOpen`): `cashier_id:int?`, `cashier_name:str?`, `opening_amount:float=0.0`. Agar `session_date==today AND status=="open"` mavjud → **HTTP 400** `"Kassa allaqachon ochiq"`. Agar cashier_name yo'q lekin cashier_id bor → Employee'dan name ol. `KassaSession(...)`; add; `log_activity(action="opened", module="kassa", entity_type="kassa_session", entity_title=f"Kassa {today}", extra={...})`; commit; refresh; return `{"session": _serialize(...)}`.
- **`PUT /api/kassa/{id}`** Body (`KassaUpdate`): cash_received?, terminal_amount?, transit_amount?, safe_amount?, terminal_confirmed?, terminal_bank_deposited?, notes?. Yo'q → 404 `"Topilmadi"`. `status=="closed"` → **HTTP 400** `"Yopilgan kassa o'zgartirilmaydi"`. `exclude_unset` bilan setattr. commit; refresh. (activity log YO'Q.)
- **`POST /api/kassa/{id}/close`** Body (`KassaClose`): `safe_amount:float` (majburiy), `terminal_confirmed:bool?`, `notes:str?`. Yo'q → 404 `"Topilmadi"`. `status=="closed"` → 400 `"Allaqachon yopilgan"`. **Shart: `if data.safe_amount < session.cash_received` → HTTP 400** `f"Seyfdagi pul ({safe_amount}) kassa tushumidan ({cash_received}) kam. Avval barcha pulni seyfga o'tkazing."`. `safe_amount` o'rnatiladi; notes (yoki eski); terminal_confirmed agar not None; `status="closed"`; `closed_at=datetime.now()`. `log_activity(action="closed", ...)`. commit; refresh. Side-effect (non-fatal): admin'larga Telegram hisobot (`{company}\n🔒 Kassa yopildi!\n📅 {session_date}\n💵 Naqd: {cash_received:,.2f}\n💳 Terminal: {terminal_amount:,.2f}\n🏦 Seyfga: {safe_amount:,.2f}\n🕐 {closed_at:%H:%M}`). return `{"session": _serialize(...)}`.
- **`POST /api/kassa/{id}/send-to-safe`** Body (`SafeTransfer`): `amount:float`. Agar `amount <= 0` → **HTTP 400** `"Miqdor 0 dan katta bo'lishi kerak"`. Yo'q → 404 `"Kassa sessiyasi topilmadi"`. closed → 400 `"Yopilgan kassaga o'zgartirish kiritib bo'lmaydi"`. `safe_amount += amount`; `transit_amount = max(0, transit_amount - amount)`. commit; refresh. (activity log YO'Q.)

---

## 10. ADMIN NOTIFIER (admin kanaliga Telegram Bot API) — `admin_notifier.py`

### 10.1 Transport
- AppSettings key `admin_notifications_enabled` (default `"true"`). `is_enabled()`: key yo'q → True; `(value yoki "").strip().lower() == "true"`. Xatoda **fail-open** (True).
- `_send_via_bot(text)`: `token=settings.admin_bot_token`, `chat_id=settings.admin_chat_id`. Ikkalasi yo'q → warn + no-op. URL `https://api.telegram.org/bot{token}/sendMessage`; POST JSON `{chat_id, text, parse_mode:"Markdown", disable_web_page_preview:True}`; timeout 10s; `raise_for_status()`.
- Startupda `ensure_admin_notifications_default(db)`: key yo'q bo'lsa `AppSettings(key="admin_notifications_enabled", value="true")` (idempotent).

### 10.2 Format helperlar
- `_fmt_amount(amount)`: None → `"0 so'm"`; `round(float(x))`; `f"{value:,}".replace(",", " ") + " so'm"` (masalan `50 000 so'm`). Xato → `"0 so'm"`.
- `_fmt_dt(dt)`: None → `"—"`; `dt.strftime("%d-%m-%Y %H:%M")`; xato → `"—"`.

### 10.3 Xabar matnlari (AYNAN)

**`_build_task_answered_text(log, bonus_amount, fine_amount)`**:
```
is_no = log.status == "answered_no"
has_bonus = bonus_amount > 0
has_fine = fine_amount > 0
header: has_bonus → "✅ *Vazifa bajarildi → Bonus*"
        elif has_fine → "❌ *Vazifa bajarilmadi → Jarima*"
        elif is_no → "❌ *Vazifa bajarilmadi*"
        else → "✅ *Vazifa bajarildi*"
resp = log.response_text yoki "(matnsiz)"
lines = [header, "", f"📋 {log.template_title yoki '—'}", f"👤 {log.employee_name yoki '—'}", f"💬 {resp}"]
agar has_bonus: lines.append(f"💰 *Bonus:* {_fmt_amount(bonus_amount)}")
elif has_fine: lines.append(f"💰 *Jarima:* {_fmt_amount(fine_amount)}")
lines.append(f"🕐 {_fmt_dt(log.answered_at)}")
```

**`_build_task_expired_text(log, fine_amount)`**:
```
has_fine = fine_amount > 0
header = "❌ *Vazifa bajarilmadi → Jarima*" agar has_fine aks holda "❌ *Vazifa bajarilmadi*"
resp = log.response_text yoki "Vaqt tugadi — avtomatik"
lines = [header, "", f"📋 {template_title}", f"👤 {employee_name}", f"💬 {resp}"]
agar has_fine: lines.append(f"💰 *Jarima:* {_fmt_amount(fine_amount)}")
lines.append(f"🕐 {_fmt_dt(answered_at)}")
```

**`_build_bonus_fine_text(bf, source)`**:
```
is_bonus = bf.type == "bonus"
header = "➕ *Bonus*" agar is_bonus aks holda "➖ *Jarima*"
note = bf.note yoki "(izohsiz)"
source_label = _SOURCE_LABELS.get(source, source)
return f"{header}\n\n👤 {employee_name}\n💰 {_fmt_amount(amount)}\n📌 {title}\n📝 {note}\n🕐 {_fmt_dt(created_at)}\n🏷 Manba: {source_label}"
```

**Public**: `notify_task_answered(log, bonus_amount, fine_amount)`, `notify_task_expired(log, fine_amount)`, `notify_bonus_fine_created(bf, source="manual")` — har biri `is_enabled()` tekshiradi, matn quradi, `_send_via_bot`, barcha xato yutiladi (faqat log).

---

## 11. WEBSOCKET MANAGER (`ws_manager.py`)

### 11.1 `TaskWSManager`
- `_connections: Dict[int, List[WebSocket]]`. `employee_id=0` = admin kanali.
- `connect(employee_id, ws)`: `ws.accept()`; `_connections.setdefault(employee_id, []).append(ws)`.
- `disconnect(employee_id, ws)`: ro'yxatdan olib tashlaydi.
- `send_to_employee(employee_id, data)`: shu id ning barcha ws'lariga `send_json(data)`; xato bergan ws'lar `dead` ga, keyin disconnect.
- `broadcast_to_admins(data)` = `send_to_employee(0, data)`.

### 11.2 WS endpoint `/ws/tasks/{employee_id}` (main.py:305)
`task_ws_manager.connect(employee_id, ws)`; loop'da `ws.receive_text()` (ping discard); disconnect'da `task_ws_manager.disconnect`. **Avtorizatsiya YO'Q** — istalgan `employee_id` bilan ulanish mumkin (xodim o'z id'si, admin 0).

### 11.3 WS xabar turlari (barcha task payloadlari)
| type | qachon | payload maydonlari |
|---|---|---|
| `new_task` | send_task / send_task_to_employee / send_task_to_role | `{type, task:{id, template_title, employee_id, employee_name, message_text, response_type, status, sent_at, answered_at:null, [deadline_at], response_text:null, created_at}}` |
| `pending_review` | answer_task deferred | `{type, task_id, employee_id, employee_name, template_title, response_text, checker_id}` |
| `task_answered` | answer_task finalize / expire | `{type, task_id, employee_id, employee_name, template_title, status, response_text}` |
| `task_reviewed` | review_task | `{type, task_id, employee_id, employee_name, template_title, status, decision, review_comment, reviewed_by_name}` |

`new_task` → tegishli `send_to_employee(emp.id, ...)` VA `broadcast_to_admins(...)`. `pending_review` → `send_to_employee(checker_id, ...)` (agar bor) VA admin. `task_answered`/`task_reviewed` → faqat admin broadcast.

`/ws` (main.py:275) — alohida sync status WS, har 5s `{"type":"sync_status","data":{is_running, last_sync, messages_sent_today}}` yuboradi.

---

## 12. STARTUP / SCHEDULER JOBLARI (main.py lifespan)

Startupda ishga tushadigan rejalashtirilgan joblar (TS'da ekvivalent kerak):
1. **`task_service.reload_schedules()`** — barcha scheduled template'lar uchun cron.
2. **`daily_kpi_calc`** — `CronTrigger(hour=23, minute=30)` har kun → `kpi_service.calculate_daily_kpi`.
3. **`task_deadline_checker`** — `IntervalTrigger(seconds=60)` → `task_service.expire_overdue_tasks` (5.9).
4. **`message_queue_worker`** — `IntervalTrigger(seconds=5)` → `queue_worker.process_one`.
5. **`telegram_health_check`** — `IntervalTrigger(minutes=5)` → 2 ta Telegram akkaunt sessiyasini tekshiradi.

DB migratsiyalari (`ALTER TABLE ... ADD COLUMN`, `CREATE TABLE IF NOT EXISTS`) startupда idempotent ishga tushadi (try/except pass). TS'da ORM migratsiyalari (Prisma/TypeORM) shu sxemaga mos kelishi kerak — 4.1/4.2 jadvallaridagi barcha ustunlar mavjud bo'lishi shart.

---

## 13. EDGE CASE'LAR VA NOZIK NUQTALAR (1:1 takrorlash uchun KRITIK)

1. **Tokensiz endpointlar**: barcha CRUD endpointlar himoyalanmagan; istalgan kishi chaqira oladi. Token faqat activity log atribusi uchun. TS'da ham shu — yoki middleware qo'shsangiz, original xulq token yo'q bo'lsa "Admin"/"admin" deb log qiladi.
2. **`answered_no` review'ni chetlab o'tadi**: checker bo'lsa ham, xodim "yo'q" desa darhol `answered_no` + jarima (review yo'q). Faqat `answered_yes`/`answered_text` checker bilan `pending_review` ga.
3. **`pending_review` expire bo'lmaydi**: expire faqat `status=="sent"` ni oladi. Reviewer kutayotgan vazifa abadiy kutadi.
4. **Chain trigger faqat to'g'ridan-finalize yo'lida**: checker'li vazifada `pending_review` ga ketsa zanjir ishlamaydi; va `review_task` ham zanjir trigger qilmaydi. Demak checker'li template'ga depends_on bog'langan child template HECH QACHON avtomatik ishga tushmaydi (kuzatilgan xulq, ehtimoliy bug, lekin 1:1 takrorlanishi kerak).
5. **`send_task_to_employee` log'da `checker_id` o'rnatmaydi** (`send_task` o'rnatadi). Lekin `answer_task` da `tmpl.checker_id` ham tekshiriladi, shu sababli amalda chain-yuborilgan vazifa javobi baribir `pending_review` ga boradi (agar template'da checker bor). Faqat `log.checker_id` ustuni bo'sh bo'ladi (`tmpl.checker_id` dan log'ga ko'chiriladi answer paytida).
6. **Vaqt zonasi nomuvofiqligi**: `created_at` lokal vaqt, lekin `/tasks/logs/mine` va `/activity/stats` UTC `now()` ishlatadi. Bu mavjud nomuvofiqlik — TS'da ham aynan: bu ikki endpoint UTC, qolganlari lokal. (Aks holda `/logs/mine` filtri server +5 zonada noto'g'ri oynani kesadi.)
7. **`_to_iso` faqat attendance'da**; kassa/tasks `.isoformat()` oddiy ishlatadi. Frontend mosligi uchun bu farq saqlansin.
8. **`exclude_unset` diff pattern**: PUT endpointlar faqat YUBORILGAN maydonlarni yangilaydi va faqat HAQIQATAN o'zgargan maydonlarni `changes` ga yozadi. `null` yuborish vs maydonni yubormaslik FARQLI (attendance'da `clear_*` bayroqlar bu uchun).
9. **MoySklad summa tiyinda**: `large_sale` triggerда `doc.sum / 100`.
10. **`log_activity` commit qilmaydi**: chaqiruvchi commit qiladi. Agar log_activity'dan keyin commit bo'lmasa, log saqlanmaydi. Barcha routerlar `log_activity` → (o'zgarishlar) → bitta `db.commit()` patternini kuzatadi.
11. **Soft vs hard delete**: Employee=soft (is_active=False), BonusFineRule=soft, TaskTemplate=HARD (db.delete), Attendance=HARD, BonusFineLog=HARD.
12. **Telegram xato hech qachon asosiy oqimni buzmaydi**: barcha telegram/notify chaqiruvlar try/except bilan o'ralgan (faqat log/warn).
13. **`_build_message` Markdown**: `parse_mode="md"` (Telethon). Admin notifier `parse_mode="Markdown"` (Bot API). Title'lar `*...*` bilan bold.
14. **Status `failed`**: telegram yuborilmasa log `status="failed"`, `sent_at=None`, lekin `deadline_at` baribir hisoblanadi. `failed` loglar expire bo'lmaydi (faqat `sent`).
15. **`schedule_days` formatlari**: `"all"` (har kun), `"1,2,3,4,5"` (Dush-Jum, 1=Dush..7=Yak), `"monthly:N"` (har oy N-kun). HH:MM majburiy (yo'q bo'lsa schedule qilinmaydi).
16. **`assigned_role` "all" yoki null**: ikkalasi ham → barcha aktiv telegramli xodimlar (`_get_target_employees` else branch). `employee_id` ustun (agar bor, faqat o'sha xodim).
17. **Bonus/fine `employee_name` snapshot**: log yaratilganda xodim ismi nusxalanadi (keyin xodim nomi o'zgarsa log o'zgarmaydi).
18. **`net_salary` da KPI yo'q**: `/bonus-fine/summary` faqat `base + bonus - fine`. KPI/komissiya `/api/salary` da alohida (so'rov doirasidan tashqari, lekin oylik = base+bonus-fine bu yerda).

---

## 14. ASOSIY FAYL YO'LLARI (manba)

| Modul | Fayl |
|---|---|
| Auth router | `D:\projects-desktop\projects\moysklad\backend\app\routers\auth.py` |
| Auth schemas | `D:\projects-desktop\projects\moysklad\backend\app\schemas\auth.py` |
| Auth utils (bcrypt) | `D:\projects-desktop\projects\moysklad\backend\app\utils\auth.py` |
| Employees router | `D:\projects-desktop\projects\moysklad\backend\app\routers\employees.py` |
| Tasks router | `D:\projects-desktop\projects\moysklad\backend\app\routers\tasks.py` |
| Task service | `D:\projects-desktop\projects\moysklad\backend\app\services\task_service.py` |
| Attendance router | `D:\projects-desktop\projects\moysklad\backend\app\routers\attendance.py` |
| Bonus/Fine router | `D:\projects-desktop\projects\moysklad\backend\app\routers\bonus_fine.py` |
| Activity router | `D:\projects-desktop\projects\moysklad\backend\app\routers\activity.py` |
| Activity service | `D:\projects-desktop\projects\moysklad\backend\app\services\activity_service.py` |
| Admin notifier | `D:\projects-desktop\projects\moysklad\backend\app\services\admin_notifier.py` |
| WS manager | `D:\projects-desktop\projects\moysklad\backend\app\services\ws_manager.py` |
| Kassa router | `D:\projects-desktop\projects\moysklad\backend\app\routers\kassa.py` |
| Sync (event trigger) | `D:\projects-desktop\projects\moysklad\backend\app\services\sync_service.py` (459-488, 274-317) |
| Telegram service | `D:\projects-desktop\projects\moysklad\backend\app\services\telegram_service.py` |
| Models | `D:\projects-desktop\projects\moysklad\backend\app\models\{task,employee,attendance,bonus_fine,activity_log,user,kassa,settings}.py` |
| DB settings | `D:\projects-desktop\projects\moysklad\backend\app\services\db_settings_service.py` |
| JSON settings | `D:\projects-desktop\projects\moysklad\backend\app\services\json_settings_service.py` |
| Startup/jobs | `D:\projects-desktop\projects\moysklad\backend\app\main.py` |
| Seed (default data) | `D:\projects-desktop\projects\moysklad\backend\seed.py` |
| Test (review flow) | `D:\projects-desktop\projects\moysklad\backend\tests\integration\test_task_review_flow.py` |

---

## 15. XULOSA — VAZIFA HAYOT DAVRI (to'liq oqim)

```
TEMPLATE YARATISH (POST /tasks/templates)
   ↓ (trigger_type bo'yicha)
┌─ manual:    POST /tasks/templates/{id}/send  → send_task
├─ scheduled: APScheduler cron (_schedule_template) → _run_template → send_task
└─ event:     sync_service._trigger_event_tasks (large_sale: sum/100 >= threshold; supply) → send_task
   ↓
send_task: _get_target_employees (employee_id > assigned_role > all; faqat aktiv+telegramli)
   ↓ har xodim: _build_message → telegram_service.send_message
   ↓ TaskLog(status="sent"/"failed", deadline_at=now+deadline_minutes, checker_id=tmpl.checker_id)
   ↓ WS "new_task" → xodim + admin
   ↓
XODIM JAVOB BERADI (PATCH /tasks/logs/{id}/answer, status=answered_yes/no/text)
   ├─ has_checker(log.checker_id OR tmpl.checker_id) AND status∈{yes,text}:
   │     → status="pending_review", response_text saqlanadi, answered_at=now
   │     → WS "pending_review" → checker + admin
   │     → STOP (bonus/fine/chain YO'Q)
   │        ↓
   │     REVIEWER (PATCH /tasks/logs/{id}/review, decision=approve/reject)
   │        ├─ approve: status = (response_type=="text" ? answered_text : answered_yes)
   │        │     → reward_amount>0 → BonusFineLog(bonus, "Vazifa mukofoti")
   │        ├─ reject:  status = answered_no
   │        │     → fine_amount>0 → BonusFineLog(fine, "Vazifa rad etildi")
   │        → review_comment/reviewed_by_name/reviewed_at saqlanadi
   │        → admin_notifier.notify_task_answered (kombinatsiyalangan xabar)
   │        → notify_employee_of_outcome (xodimga Telegram)
   │        → WS "task_reviewed" → admin
   │        → (chain YO'Q)
   │
   └─ checker yo'q YOKI status==answered_no:
         → status = data.status, response_text, answered_at=now
         ├─ yes/text AND reward_amount>0 → BonusFineLog(bonus)
         ├─ no AND fine_amount>0 → BonusFineLog(fine)
         → admin_notifier.notify_task_answered
         → bonus/fine bor bo'lsa notify_employee_of_outcome
         → WS "task_answered" → admin
         → CHAIN: depends_on_template_id==log.template_id AND is_active==True bo'lgan
                  template'lar; applies (employee_id==emp.id | assigned_role=="all" |
                  emp_has_role(emp, assigned_role)) → send_task_to_employee

DEADLINE O'TDI (har 60s expire_overdue_tasks)
   status=="sent" AND deadline_at<=now bo'lgan loglar:
      → status="answered_no", response_text="⏰ Vaqt tugadi — avtomatik", answered_at=now
      → tmpl.fine_amount>0 → BonusFineLog(fine, "Vazifa bajarilmadi", note="muddati o'tdi")
      → admin_notifier.notify_task_expired (xodimga Telegram YO'Q)
      → WS "task_answered" (status=answered_no) → admin

OYLIK (GET /bonus-fine/summary): net = base_salary + Σbonus.amount − Σfine.amount (davr ichida)
```

Bu spetsifikatsiya barcha kuzatilgan endpointlar, formulalar, status o'tishlar, side-effectlar va edge case'larни qamrab oladi. TypeScript'da qayta qurishda 13-bo'limdagi nozik nuqtalar (vaqt zonasi nomuvofiqligi, chain faqat to'g'ridan-finalize, answered_no review'ni chetlab o'tishi, pending_review expire bo'lmasligi, exclude_unset diff pattern, soft/hard delete farqlari) AYNAN takrorlanishi shart — aks holda xulq 1:1 bo'lmaydi.