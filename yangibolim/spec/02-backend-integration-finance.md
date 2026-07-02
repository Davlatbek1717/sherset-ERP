`moysklad_service.request` (public, kpi.py `_get_moysklad_sales`'da chaqirilgan) — bu metod mavjud emas (faqat `_request` bor). Bu kod yo'lining bug ekanini qayd qilaman. Spetsifikatsiya uchun yetarli ma'lumot to'plandi. To'liq funksional spetsifikatsiyani tayyorlayman.

---

# FUNKSIONAL SPETSIFIKATSIYA — MoySklad↔Telegram Integratsiya (Integratsiya + Moliya zonasi)

> Manba: Python FastAPI + SQLAlchemy (async, SQLite). Maqsad: TypeScript'da 1:1 qayta qurish. Hamma son, formula, interval AYNAN koddan olingan.

---

## 0. ARXITEKTURA UMUMIY KO'RINISHI

**Stack:** FastAPI (async), SQLAlchemy async ORM, SQLite (`sqlite+aiosqlite:///./data/app.db`), APScheduler (AsyncIOScheduler), Telethon (MTProto user-account, BOT EMAS), httpx (REST client).

**3 ta scheduler instansiyasi:**
1. `sync_service.scheduler` — MoySklad polling (`AsyncIOScheduler`)
2. `task_service.scheduler` — vazifa cron + KPI cron + queue worker + deadline checker + telegram health (`AsyncIOScheduler`)

**Sozlama 2 joyda saqlanadi:**
- **DB settings** (`app_settings` jadvali, key-value): `moysklad_token`, `polling_interval`, `sync_demands`, `sync_orders`, `sync_payments`, `language`, `dark_mode`, `demand_template`, `payment_in_template`, `order_template`, `doc_templates_config`, `doc_templates_cache`, `admin_notifications_enabled`. Barcha qiymatlar **string** sifatida saqlanadi (bool → `"true"`/`"false"`, int → `str(int)`, dict/list → `json.dumps`).
- **JSON file settings** (`data/settings.json`): `telegram_api_id`, `telegram_api_hash`, `telegram_phone`, `telegram_session_string`, `telegram2_api_id`, `telegram2_api_hash`, `telegram2_phone`, `telegram2_session_string`, `company_name`, `contact_phone`.

**Boshqa fayl-state:**
- `data/flood_wait.json` — `{ "1": <epoch_until>, "2": <epoch_until> }` (faqat flooded akkauntlar)
- `data/entity_cache.json` — `{ "<phone>": <telegram_user_id> }` (persistent telefon→ID xarita)
- `data/telegram_session_1.session`, `data/telegram_session_2.session` — Telethon SQLite session fayllari

**Pul birligi konvensiyasi:** MoySklad summalarni **tiyin (kopecks)** da qaytaradi. Har joyda `/ 100` qilib so'mga aylantiriladi (balance, sum, price, sellSum, returnSum).

---

## 1. LIFESPAN — STARTUP/SHUTDOWN (`main.py`)

### 1.1 Startup ketma-ketligi (AYNAN shu tartibda)

1. `init_db()` — `Base.metadata.create_all` (barcha jadvallarni yaratadi agar yo'q bo'lsa).
2. **Migration ALTER TABLE ro'yxati** — `engine.begin()` ichida har biri alohida `try/except: pass` bilan (xato bo'lsa = ustun mavjud, e'tibormaslik). AYNAN shu tartibda:

```
ALTER TABLE counterparties ADD COLUMN usta_telegram_phone VARCHAR
ALTER TABLE employees ADD COLUMN username VARCHAR
ALTER TABLE employees ADD COLUMN hashed_password VARCHAR
ALTER TABLE task_logs ADD COLUMN response_type VARCHAR DEFAULT 'none'
ALTER TABLE employees ADD COLUMN base_salary FLOAT DEFAULT 0
ALTER TABLE task_templates ADD COLUMN depends_on_template_id INTEGER REFERENCES task_templates(id) ON DELETE SET NULL
ALTER TABLE task_templates ADD COLUMN department VARCHAR
ALTER TABLE task_templates ADD COLUMN priority VARCHAR DEFAULT 'medium'
ALTER TABLE task_templates ADD COLUMN reward_amount FLOAT
CREATE TABLE IF NOT EXISTS activity_logs (id INTEGER PRIMARY KEY, created_at DATETIME DEFAULT (datetime('now')), user_name TEXT, user_role TEXT, action TEXT, module TEXT, entity_type TEXT, entity_id INTEGER, entity_title TEXT, changes TEXT, extra TEXT)
ALTER TABLE employees ADD COLUMN moysklad_agent_id VARCHAR
CREATE TABLE IF NOT EXISTS message_queue (id INTEGER PRIMARY KEY, recipient TEXT NOT NULL, message TEXT NOT NULL, priority INTEGER DEFAULT 5, status TEXT DEFAULT 'pending', attempts INTEGER DEFAULT 0, max_attempts INTEGER DEFAULT 3, next_retry_at DATETIME, error TEXT, source TEXT, message_log_id INTEGER, counterparty_name TEXT, created_at DATETIME DEFAULT (datetime('now')), sent_at DATETIME)
DROP INDEX IF EXISTS uix_kpi_daily_emp_date
CREATE UNIQUE INDEX IF NOT EXISTS uix_kpi_daily_emp_date_source ON kpi_daily_logs (employee_id, date, source)
ALTER TABLE salary_configs RENAME COLUMN daily_sales_target TO monthly_sales_target
ALTER TABLE kpi_conditions ADD COLUMN checker_id INTEGER REFERENCES employees(id) ON DELETE SET NULL
ALTER TABLE kpi_monthly_scores ADD COLUMN checker_id INTEGER REFERENCES employees(id) ON DELETE SET NULL
ALTER TABLE salary_configs ADD COLUMN commission_percent FLOAT
ALTER TABLE salary_configs ADD COLUMN kpi_tiers TEXT
ALTER TABLE kpi_templates ADD COLUMN tiers TEXT
CREATE TABLE IF NOT EXISTS employee_permissions (id INTEGER PRIMARY KEY, employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE, permission TEXT NOT NULL, access_level TEXT DEFAULT 'full', created_at DATETIME DEFAULT (datetime('now')))
CREATE INDEX IF NOT EXISTS ix_emp_perm_eid ON employee_permissions (employee_id)
ALTER TABLE task_templates ADD COLUMN fine_amount FLOAT
ALTER TABLE task_templates ADD COLUMN deadline_minutes INTEGER
ALTER TABLE task_logs ADD COLUMN deadline_at DATETIME
ALTER TABLE task_templates ADD COLUMN checker_id INTEGER REFERENCES employees(id) ON DELETE SET NULL
ALTER TABLE employees ADD COLUMN is_checker INTEGER DEFAULT 0
ALTER TABLE task_logs ADD COLUMN checker_id INTEGER REFERENCES employees(id) ON DELETE SET NULL
ALTER TABLE task_logs ADD COLUMN review_comment TEXT
ALTER TABLE task_logs ADD COLUMN reviewed_by_name TEXT
ALTER TABLE task_logs ADD COLUMN reviewed_at DATETIME
```

3. **Default admin user**: agar `users` da `username == settings.admin_username` (default `"admin"`) yo'q bo'lsa — `User(username="admin", hashed_password=bcrypt("admin123"), is_admin=True)` yaratadi.
4. `ensure_admin_notifications_default(db)` — `admin_notifications_enabled` kalitini idempotent yaratadi.
5. `document_template_service.ensure_defaults_seeded(db)` — `doc_templates_config` ni seed qiladi (1.5 bo'limga qarang).
6. DB'dan `moysklad_token` o'qib `moysklad_service.update_token()`.
7. DB'dan `polling_interval` o'qiydi; agar bor bo'lsa `int(...)`, aks holda `settings.polling_interval` (default **30**).
8. **Telegram sessiyalarni tiklash**: `[(1, "telegram"), (2, "telegram2")]` uchun loop. Har slot uchun JSON'dan `{prefix}_api_id`, `{prefix}_api_hash`, `{prefix}_session_string` o'qiydi; agar `api_id` va `api_hash` bor bo'lsa `acc.restore_session(int(api_id), api_hash, session_string=...)`.
9. `notification_service.set_company_info(company_name, contact_phone)` — JSON'dan.
10. `sync_service.start(interval)` — polling scheduler.
11. `task_service.start()` + `task_service.reload_schedules()`.
12. **Scheduler joblarni qo'shish** (hammasi `task_service.scheduler` ga, `replace_existing=True`):

| Job ID | Trigger | Qiymat | Funksiya |
|---|---|---|---|
| `daily_kpi_calc` | `CronTrigger` | `hour=23, minute=30` (har kuni 23:30) | `kpi_service.calculate_daily_kpi` |
| `task_deadline_checker` | `IntervalTrigger` | `seconds=60` | `task_service.expire_overdue_tasks` |
| `message_queue_worker` | `IntervalTrigger` | `seconds=5` | `queue_worker.process_one` |
| `telegram_health_check` | `IntervalTrigger` | `minutes=5` | inline `_telegram_health_check` |
| `main_sync` | `IntervalTrigger` | `seconds=interval` (default 30) | `sync_service.sync_all` (sync_service.scheduler'da) |

`main_sync` job opsiyalari: `max_instances=1`, `coalesce=True`, `misfire_grace_time=interval`.

`_telegram_health_check`: slot 1 va 2 uchun — agar `acc.client and acc._connected`, `acc.client.is_user_authorized()` chaqiradi; agar `False` bo'lsa `acc._connected = False`.

### 1.2 Shutdown
`sync_service.stop()` → `task_service.stop()` → `telegram_service.close()` (graceful, session fayllarni saqlaydi).

### 1.3 CORS / Middleware
- `ProxyHeadersMiddleware(trusted_hosts="*")`
- `CORSMiddleware`: `allow_origins=settings.origins_list` (`"*"` → `["*"]`, aks holda vergulli list), `allow_credentials=True`, `allow_methods=["*"]`, `allow_headers=["*"]`.

### 1.4 Router prefikslari
`/api/auth`, `/api/moysklad`, `/api/telegram`, `/api/counterparties`, `/api/messages`, `/api/settings`, `/api/reports`, `/api/employees`, `/api/tasks`, `/api/kassa`, `/api/attendance`, `/api/bonus-fine`, `/api/activity`, `/api/kpi`, `/api/salary`. `document_templates` router o'z prefiksi bilan: `/api/document-templates`. Health: `GET /api/health` → `{"status":"ok","version":"1.0.0"}`.

### 1.5 WebSocket'lar
- `GET /ws` — har 5 sekundda `{"type":"sync_status","data":{"is_running","last_sync"(ISO yoki null),"messages_sent_today"}}` yuboradi (`asyncio.sleep(5)` loop).
- `GET /ws/tasks/{employee_id}` — `task_ws_manager` orqali; `employee_id=0` = admin kanali (barcha task eventlari). Client matni qabul qilinadi va tashlanadi (keep-alive).

### 1.6 Config defaultlar (`config.py`)
- `secret_key="CHANGE-ME-..."`, `algorithm="HS256"`, `access_token_expire_minutes=60*24*7` (7 kun)
- `database_url="sqlite+aiosqlite:///./data/app.db"`
- `allowed_origins="*"`
- `admin_username="admin"`, `admin_password="admin123"`
- `moysklad_base_url="https://api.moysklad.ru/api/remap/1.2"`
- `polling_interval=30`
- Env validator: bo'sh string `""` → `None` (token/login/parol/telegram maydonlar uchun).

---

## 2. MOYSKLAD REST CLIENT (`moysklad_service.py`)

### 2.1 Autentifikatsiya
`_get_headers()`: agar `_token` (runtime) yoki `settings.moysklad_token` bor bo'lsa → `Authorization: Bearer <token>`, `Content-Type: application/json`, `Accept-Encoding: gzip`. Aks holda `moysklad_login`+`moysklad_password` bo'lsa → Basic auth (`base64(login:password)`). Aks holda faqat `Content-Type: application/json`.

### 2.2 `_request(method, endpoint, params=None, data=None, timeout=30.0)`
- URL = `base_url + endpoint`.
- **Retry strategiyasi**: jami **2 urinish** (`for attempt in range(2)`). Faqat `httpx.ConnectTimeout` yoki `httpx.ReadTimeout` da retry; 1-urinish (attempt==0) muvaffaqiyatsiz bo'lsa **1 sekund** `sleep`, keyin qayta. (Docstring "3 second" deydi lekin kod `asyncio.sleep(1)`.)
- `HTTPStatusError` → darhol `raise` (retry yo'q).
- Boshqa Exception → darhol `raise`.
- 2 urinishdan keyin ham bo'lmasa `raise last_exc`.

> **DIQQAT (bug)**: `reports.py::_get_moysklad_sales` va `kpi.py` `moysklad_service.request(...)` (underscore'siz) chaqiradi — bunday metod YO'Q, faqat `_request` bor. Bu kod yo'li har doim Exception beradi va `_get_moysklad_sales` har doim `None` qaytaradi. 1:1 portda: `request` public alias yarating yoki bu yo'lni `_request` ga ko'chiring (mantiqni saqlash uchun shu bug'ni ham saqlash mumkin — natija: KPI report item moysklad_sales auto-fill ishlamaydi).

### 2.3 Endpoint metodlari

| Metod | HTTP | Endpoint | Params |
|---|---|---|---|
| `get_counterparties(limit=100, offset=0)` | GET | `/entity/counterparty` | `limit, offset, expand=tags,contactpersons,attributes` |
| `get_counterparty_balance(id)` | GET | `/report/counterparty/{id}` | — (qaytadi `balance/100`, xatoda `None`) |
| `get_organization()` | GET | `/entity/organization` | `limit=1` (rows[0] yoki None) |
| `get_demands(limit=50, offset=0, updated_from=None)` | GET | `/entity/demand` | `limit, offset, expand=agent,agent.attributes,attributes,positions.assortment, order=updated,desc` + agar updated_from: `filter=updated>={updated_from}` |
| `get_supplies(...)` | GET | `/entity/supply` | bir xil expand/order/filter |
| `get_sales_returns(...)` | GET | `/entity/salesreturn` | bir xil |
| `get_purchase_returns(...)` | GET | `/entity/purchasereturn` | bir xil |
| `get_moves(...)` | GET | `/entity/move` | `expand=positions.assortment, order=updated,desc` (+filter) |
| `get_customer_orders(...)` | GET | `/entity/customerorder` | bir xil expand/order/filter |
| `get_payments_in(...)` | GET | `/entity/paymentin` | `expand=agent,agent.attributes, order=updated,desc` (+filter) |
| `get_payments_out(...)` | GET | `/entity/paymentout` | `expand=agent, order=updated,desc` (+filter) |
| `test_connection()` | GET | `/entity/counterparty?limit=1` | bool |

`filter` formati AYNAN: `updated>=YYYY-MM-DD HH:MM:SS` (probel bilan, T emas).

### 2.4 Publication (chek havolasi) — `get_publication_hrefs(doc_type, doc_id, db=None)`
- `desired` ro'yxati: agar `db` berilgan bo'lsa `document_template_service.get_enabled_templates(db, doc_type)`; xatoda yoki db yo'q bo'lsa `DOC_TEMPLATES.get(doc_type, [])`. Agar `desired` bo'sh → `[]`.
- `httpx.AsyncClient(timeout=10.0)` bilan:
  1. `GET /entity/{doc_type}/{doc_id}/publication` — 404 bo'lsa `[]` (publications qo'llab-quvvatlanmaydi). Mavjudlarni `existing_by_tmpl[template_href] = pub_href` xaritaga yig'adi.
  2. `_resolve_templates(client, doc_type)` (process davomida cache'lanadi): `embeddedtemplate` va `customtemplate` metadatasini olib (`GET /entity/{doc_type}/metadata/{kind}`, 200 bo'lsa rows), `DOC_TEMPLATES` tartibida nom bo'yicha match. Match: avval **aniq nom tengligi**, keyin **startswith fallback** (MoySklad dublikat nomlarga ` (1)` qo'shadi).
  3. Har desired template uchun: agar `tmpl_meta.href` `existing_by_tmpl` da bo'lsa o'shani qo'shadi; aks holda `POST /entity/{doc_type}/{doc_id}/publication` body `{"template":{"meta":tmpl_meta}}` bilan yangi yaratadi, `href` ni oladi.
  4. Natija `[(template_name, pub_href), ...]` tartibli list. Hamma xato `[]` (warning log).

### 2.5 `DOC_TEMPLATES` (hardcoded fallback, tartib muhim)
```
demand:         ["Расходная накладная", "Чек_сум_(FerroSoft)", "Чек_сум_с_балансом_(FerroSoft)"]
customerorder:  ["Заказ", "Чек_сум_(FerroSoft)"]
supply:         ["Чек_сум_(FerroSoft)"]
paymentin:      []                      ← chek YO'Q
salesreturn:    ["Чек_возврата_сум_(FerroSoft)", "Чек_сум_(FerroSoft)"]
purchasereturn: ["Возврат поставщику", "Чек_возврата_сум_(FerroSoft)"]
move:           ["Climart Перемещение"]
```

---

## 3. SYNC POLLING (`sync_service.py`) — ENG MUHIM

### 3.1 In-memory state (process davomida)
- `_processed_demands: Set[str]`
- `_processed_orders: Dict[str, str]` — `order_id → oxirgi ko'rilgan "updated" timestamp`
- `_processed_payments: Set[str]`
- `_processed_payments_out: dict`
- `_processed_supplies: Set[str]`
- `_processed_sales_returns: Set[str]`
- `_processed_purchase_returns: Set[str]`
- `_processed_moves: Set[str]`
- `_last_sync: Optional[datetime]` (UTC, `datetime.utcnow()`)
- `_last_cp_sync` (atribut, faqat sync_counterparties chaqirilganda o'rnatiladi)
- `_stats`: `total_counterparties, total_demands, total_orders, total_payments, messages_sent_today, errors_today`

### 3.2 `start(interval_seconds=None)`
`interval = interval_seconds or settings.polling_interval` (30). Avvalgi scheduler ishlasa `shutdown(wait=False)`. `main_sync` job: `IntervalTrigger(seconds=interval)`, `max_instances=1`, `coalesce=True`, `misfire_grace_time=interval`. Keyin `scheduler.start()`, `_is_running=True`.

### 3.3 `_updated_from_param()` — overlap mantiqi (AYNAN)
- Agar `_last_sync` bor: `(_last_sync - timedelta(minutes=1)).strftime("%Y-%m-%d %H:%M:%S")` qaytaradi.
- Aks holda `None`.
- **1 daqiqalik overlap** — soat farqi (clock skew) tufayli hujjat o'tkazib yuborilmasligi uchun.

### 3.4 `sync_all(db=None)` — har sikl
1. `now = datetime.utcnow()`.
2. **Counterparties sync** faqat har **600 sekund (10 daqiqa)**: agar `_last_cp_sync` yo'q yoki `(now - _last_cp_sync).total_seconds() >= 600` → `sync_counterparties(session)`, `_last_cp_sync = now`.
3. **Hamma doc sync parallel** (`asyncio.gather(..., return_exceptions=True)`): `sync_demands, sync_supplies, sync_sales_returns, sync_purchase_returns, sync_payments, sync_payments_out, sync_orders, sync_moves`.
4. Oxirida `_last_sync = datetime.utcnow()`.

> **MUHIM**: `_last_sync` faqat sikl OXIRIDA o'rnatiladi. Birinchi sikl davomida `_last_sync is None` → barcha `_process_doc` chaqiruvlari `False` qaytaradi (initial load skip). Lekin processed-set'lar to'ldiriladi → keyingi sikllarda faqat YANGI hujjatlar xabar oladi.

### 3.5 `_process_doc(db, doc, processed_set, event_type, doc_type)` → bool
1. `doc_id = doc.get("id")`. Agar yo'q yoki `doc_id in processed_set` → `False`.
2. `processed_set.add(doc_id)`.
3. Agar `not _last_sync` → `False` (initial load skip; lekin set'ga qo'shilgan).
4. `agent = doc.get("agent", {})`; `agent_id = agent.get("id")`. Agar yo'q → `False`.
5. **Agent tgid**: `agent.attributes` ichida `name=="tgid"` bo'lsa `doc["_agent_tgid"] = str(value)`.
6. **"Уста" attribut**: `doc.attributes` ichida `name=="Уста"` va `type=="counterparty"` bo'lsa — `value.meta.href` dan oxirgi segment = `usta_ms_id`. Local DB'dan `Counterparty.moysklad_id == usta_ms_id` topiladi; agar bor bo'lsa `target = usta_cp.usta_telegram_phone or telegram_phone or telegram_username or telegram_chat_id`; `target` bo'lsa `doc["_usta_from_attr"]=target`, `doc["_usta_name"]=value.name`.
7. `pub_hrefs = await moysklad_service.get_publication_hrefs(doc_type, doc_id, db=db)`; bo'sh bo'lmasa `doc["_pub_hrefs"]=pub_hrefs`.
8. `message = notification_service.build_message(doc, event_type, doc_type)`.
9. `sent = await notification_service.send_notification(db, agent_id, event_type, doc, message)`.
10. `return sent`.

### 3.6 Doc-type sikllari

Har biri `try/except` (xatoda `_stats["errors_today"] += 1`). `limit=50`, `updated_from=_updated_from_param()`.

- **sync_demands**: `_process_doc(..., _processed_demands, "demand", "demand")`. `sent` bo'lsa: `messages_sent_today += 1`, `total_demands += 1`, va `total_sum = (doc.sum or 0)/100`, `_trigger_event_tasks(db, "large_sale", doc, total_sum)`.
- **sync_supplies**: `is_new = doc_id not in _processed_supplies` (process_doc'dan oldin tekshiriladi). `_process_doc(..., "supply", "supply")`. `sent` bo'lsa `messages_sent_today += 1`. Agar `is_new and _last_sync` → `_trigger_event_tasks(db, "supply", doc)` (har yangi hujjat uchun bir marta).
- **sync_sales_returns**: `_process_doc(..., "salesreturn", "salesreturn")`. `sent` → `messages_sent_today += 1`.
- **sync_purchase_returns**: `_process_doc(..., "purchasereturn", "purchasereturn")`.
- **sync_payments** (in): `_process_doc(..., _processed_payments, "payment_in", "paymentin")`. `sent` → `messages_sent_today += 1`, `total_payments += 1`.
- **sync_payments_out**: `_process_doc(..., _processed_payments_out, "payment_out", "paymentout")`.
- **sync_moves**: agentsiz. `doc_id not in _processed_moves` → `_processed_moves.add(doc_id)`. Xabar yuborilmaydi, faqat `len(rows)` log qilinadi.

### 3.7 `sync_orders` — yangi/o'zgartirilgan mantiqi (AYNAN)
Har order uchun:
- `order_id = order.get("id")` (yo'q bo'lsa skip).
- `updated_ts = order.get("updated", "")`; `prev_ts = _processed_orders.get(order_id)`.
- **`prev_ts is None`** (yangi order): `_process_doc(db, order, set(), "order", "customerorder")` (e'tibor: bo'sh `set()` uzatiladi — process_doc o'z dedup'ini ishlatmaydi, `_processed_orders` o'zi tracking qiladi). `_processed_orders[order_id] = updated_ts`. `sent` bo'lsa `messages_sent_today += 1`, `total_orders += 1`.
- **`updated_ts and updated_ts != prev_ts`** (o'zgartirilgan): `_processed_orders[order_id] = updated_ts`. Agar `not _last_sync` → skip (initial). `agent_id` yo'q bo'lsa skip. `pub_hrefs = get_publication_hrefs("customerorder", order_id, db=db)` → `order["_pub_hrefs"]`. `message = build_message(order, "order_updated", "customerorder")`. `send_notification(db, agent_id, "order_updated", order, message)`. `sent` → `messages_sent_today += 1`.

### 3.8 `sync_counterparties(db)` — upsert mantiqi
- `offset=0`, sahifa `limit=100`. Loop: `get_counterparties(limit=100, offset)`.
- Har `cp_data` uchun (`cp_id = cp_data.get("id")`, yo'q bo'lsa skip):
  - `Counterparty.moysklad_id == cp_id` topiladi.
  - `balance = (cp_data.balance or 0) / 100`.
  - **Telefon normalizatsiya**: `ms_phone = cp_data.phone or ""`. Agar bo'sh emas: faqat raqam va `+` belgilarini qoldiradi (`"".join(c for c in ms_phone if c.isdigit() or c == "+")`); agar `+` bilan boshlanmasa oldiga `+` qo'shadi.
  - **Usta kontakt** (`usta_phone=""`): 
    1. `cp_data.attributes` ichida `name=="tgid"` bo'lsa `usta_phone = str(value)` (break).
    2. Aks holda `contactpersons.rows[0].phone` ni olib normalizatsiya (raqam+`+`, `+` prefiks).
  - **Mavjud** bo'lsa: `name, email` yangilanadi (qiymat bo'lmasa eski qoladi), `balance` har doim, `ms_phone` bo'lsa `phone` va `telegram_phone` ga, `usta_phone` bo'lsa `usta_telegram_phone` ga. `telegram_linked = bool(telegram_phone or telegram_username or telegram_chat_id)`.
  - **Yangi** bo'lsa: `Counterparty(moysklad_id, name, phone=ms_phone, email, balance, telegram_phone=ms_phone, usta_telegram_phone=usta_phone, telegram_linked=bool(ms_phone))`.
  - `total += 1`.
- Har sahifadan keyin `db.commit()`.
- `total_count = meta.size`. `offset += len(rows)`. **To'xtash sharti**: `offset >= total_count` YOKI `len(rows) < 100` YOKI `offset >= 1000` (MoySklad timeout'idan saqlanish — maksimum 1000 yozuv).
- `_stats["total_counterparties"] = total`.

### 3.9 `_trigger_event_tasks(db, event_type, doc, amount=0)`
- `TaskTemplate` qidiradi: `trigger_type=="event"`, `event_type==<event_type>`, `is_active==True`.
- Har template uchun: agar `event_type=="large_sale"` va `tmpl.large_sale_threshold` bor va `amount < tmpl.large_sale_threshold` → skip.
- `context = f"Hujjat: {doc.name}"`; agent nomi bor bo'lsa `+ "\nMijoz: {agent_name}"`; large_sale va amount bor bo'lsa `+ "\nSumma: {amount:,.2f}"`.
- `task_service.send_task(db, tmpl.id, context)`.
- Event turlari (TaskTemplate.event_type): `supply`, `large_sale`, `kassa_close`, `kassa_not_closed`. (Faqat `large_sale` va `supply` sync_service'dan trigger qilinadi. `tasks.py` da `_EVENT_TYPES = {"supply", "large_sale", "kassa_close"}`. `kassa_close` ni sync_service trigger qilmaydi — kassa close router'ida alohida admin xabari yuboriladi, 7-bo'limga qarang.)

### 3.10 `moysklad.py` router endpointlari
- `GET /api/moysklad/counterparties|demands|orders|payments` — proxy, to'g'ridan-to'g'ri MoySklad'dan (`limit=50, offset=0`; payments uchun `payment_type` "in"/"out"). Xato → 502.
- `GET /api/moysklad/sync-status` — `sync_service.get_status()` + jonli DB count'lar (`total_counterparties` = `count(Counterparty)`, `messages_sent_today` = bugungi `MessageLog.status=="sent"` count).
- `POST /api/moysklad/sync-now?since=YYYY-MM-DD` — agar `since` bor: `_last_sync = datetime.strptime(since,"%Y-%m-%d")`, barcha processed-set'larni `.clear()` (8 ta: demands, orders, payments, supplies, sales_returns, purchase_returns, moves — `_processed_payments_out` clear QILINMAYDI), `sync_all()`. Aks holda `sync_all()`.
- `GET /api/moysklad/test-connection` → `{"connected": bool}`.

---

## 4. QUEUE WORKER (`queue_worker.py`) — XABAR NAVBATI

### 4.1 Konstantalar (AYNAN)
```
WORKER_INTERVAL = 5            # sekund (scheduler interval, lifespan'da)
RETRY_BACKOFF = [30, 90, 270]  # sekund: 1-fail→30s, 2-fail→90s, 3-fail→270s
```
`QueuedMessage` defaultlari: `priority=5`, `status="pending"`, `attempts=0`, `max_attempts=3`.

### 4.2 `is_paused` (property)
- Agar `_pause_until` bor va `now < _pause_until` → `True`.
- Agar `_pause_until` bor va `now >= _pause_until` → `_paused=False`, `_pause_until=None` (avtomatik tozalanadi).
- Aks holda `_paused`.

### 4.3 `pause(seconds)`
`_paused=True`, `_pause_until = now + timedelta(seconds=seconds)`.

### 4.4 `process_one()` — har 5 sekund (AYNAN qadamlar)
1. Agar `is_paused` → return.
2. Agar `not telegram_service.any_available()` → return.
3. **Xabar tanlash** (1 ta): `QueuedMessage` WHERE `status=="pending"` OR (`status=="retry"` AND `next_retry_at <= now`). ORDER BY `priority ASC`, `created_at ASC`. LIMIT 1. (`now = datetime.now()` — local time.)
4. Yo'q bo'lsa return.
5. `msg.status="sending"`, `msg.attempts += 1`, commit.
6. `telegram_service.send_message(msg.recipient, msg.message)`.
7. **Muvaffaqiyat**: `status="sent"`, `sent_at=now`, `error=None`, `_stats["sent"]+=1`, `total_today+=1`. Agar `msg.message_log_id` bor → `MessageLog.status="sent"`, `error_message=None`.
8. **`TelegramSendError`**:
   - `err_str = str(e)`, `msg.error = err_str[:500]`.
   - **Flood** (`"cheklov"` yoki `"flood"` err'da, lowercase): regex `(\d+)\s*daqiqa` → daqiqa*60; aks holda `(\d+)\s*soniya` → sekund; aks holda **300** (default 5 min). `self.pause(pause_secs)`. `msg.status="pending"`, `msg.attempts -= 1` (urinish hisoblanmaydi — xabar navbatga qaytadi).
   - **User topilmadi** (`"topilmadi"` yoki `"not found"`): `status="failed"`, `_stats["failed"]+=1`. MessageLog → `failed`, `error_message=err_str[:200]`. (Retry qilinmaydi — foydalanuvchi Telegram'da yo'q.)
   - **`attempts >= max_attempts`**: `status="failed"`, `_stats["failed"]+=1`. MessageLog → `failed`.
   - **Aks holda (retry)**: `backoff_idx = min(attempts-1, len(RETRY_BACKOFF)-1)`; `backoff_secs = RETRY_BACKOFF[backoff_idx]`; `status="retry"`, `next_retry_at = now + timedelta(seconds=backoff_secs)`.
9. **Boshqa Exception**: `msg.error=str(e)[:500]`. `attempts>=max_attempts` → `failed`,`_stats["failed"]+=1`; aks holda `status="retry"`, `next_retry_at = now + RETRY_BACKOFF[min(attempts-1, 2)]`.
10. commit.

**Retry backoff jadvali** (attempts → kechikish):
| attempts (increment'dan keyin) | backoff_idx | delay |
|---|---|---|
| 1 | 0 | 30s |
| 2 | 1 | 90s |
| 3 | 2 | 270s → lekin attempts(3) >= max_attempts(3) bo'lgani uchun **failed** bo'ladi |

Demak amalda: 1-urinish fail → 30s kutib retry; 2-urinish fail → 90s kutib retry; 3-urinish fail → **failed** (270s hech qachon ishlatilmaydi standart max_attempts=3 da; faqat max_attempts > 3 bo'lsa).

### 4.5 `get_stats()`
Kunlik reset: agar `_today != bugun` → `_stats={sent:0,failed:0,total_today:0}`. Qaytaradi `{...stats, paused: is_paused, pause_until: ISO yoki null}`.

### 4.6 `enqueue_message(recipient, message, priority=5, source="notification", message_log_id=None, counterparty_name=None)`
Yangi `QueuedMessage` yaratadi, commit, refresh, qaytaradi. (WAPPI async pattern — darhol qaytadi.)

### 4.7 `GET /api/messages/queue-stats`
Status bo'yicha count (`pending, retry, sending, sent, failed`), `worker.get_stats()`, va telegram akkaunt holatlari (`connected, flooded, flood_min`).

---

## 5. TELEGRAM SERVICE (`telegram_service.py`) — 2 AKKAUNT

### 5.1 Tuzilma
- `accounts = {1: TelegramAccount(1), 2: TelegramAccount(2)}`.
- `_entity_id_cache: dict` — `{phone: telegram_user_id}` (persistent, `entity_cache.json`).
- `_global_last_send: float` — barcha akkauntlar bo'ylab global rate limit.
- Init'da `_load_flood_timers()` + `_load_entity_id_cache()`.

### 5.2 `TelegramAccount` per-instance state
- `slot` (1/2), `client` (Telethon), `_session_file = data/telegram_session_{slot}`.
- `_entity_cache: dict` (in-memory `{phone: user_entity}`).
- `_flood_until: float` (epoch), `_last_send_time: float`, `_resolve_timestamps: list`.
- `_MAX_RESOLVES_PER_HOUR = 20` (klass konstanta; lekin `resolve_and_send` da amalda ishlatilmaydi — `_can_resolve`/`_record_resolve` aniqlangan, lekin chaqirilmaydi).

### 5.3 Flood
- `is_flooded`: `_flood_until > 0 and time.time() < _flood_until`.
- `flood_remaining_min`: `int((_flood_until - time.time())/60)`.
- `set_flood(seconds)`: `_flood_until = time.time() + seconds`.
- `clear_flood()`: `_flood_until = 0`.
- **Persist**: `data/flood_wait.json` = `{"1": until_epoch, "2": until_epoch}` (faqat flooded). Restart'da `_load_flood_timers()` tiklaydi (faqat `until > now`). Hech biri flooded bo'lmasa fayl o'chiriladi. Har send urinishidan keyin `_save_flood_timers()` chaqiriladi.

### 5.4 Rate limiting (AYNAN)
- **Per-account** `_rate_limit()`: `elapsed = now - _last_send_time`; agar `elapsed < 3` → `sleep(3 - elapsed)`; `_last_send_time = now`.
- **Global** `_global_rate_limit()`: `elapsed = now - _global_last_send`; agar `elapsed < 3` → `sleep(3 - elapsed)`; `_global_last_send = now`. (Docstring "8s" deydi lekin kod **3 sekund**.)
- `resolve_and_send` da `ImportContacts`dan oldin qo'shimcha `asyncio.sleep(3)`.

### 5.5 Akkaunt tanlash / failover
- `any_available()`: biror akkaunt `_connected and not is_flooded`.
- `_get_active_account()`: `_connected` akkauntlardan — non-flooded birinchisi; agar hammasi flooded → eng kam `_flood_until` ga ega bittasi; hech biri connected emas → `None`.
- `_get_failover_account(failed_slot)`: ikkinchi slot (`2 if failed==1 else 1`); agar `_connected and not is_flooded` → o'sha; aks holda `None`.

### 5.6 `send_message(target, message)` — to'liq oqim
1. `acc = _get_active_account()`; yo'q bo'lsa `TelegramSendError("Telegram ulanmagan...")`.
2. `_global_rate_limit()`.
3. **Target turi aniqlash**:
   - `is_phone = target.startswith("+")` YOKI (`target.lstrip("+").isdigit()` AND `7 <= len(target) <= 15`).
   - Agar `is_phone`: `normalized = _normalize_phone(target)` (raqam+`+`, `+` prefiks); `cached_id = _entity_id_cache.get(normalized)`; bor bo'lsa `target = str(cached_id)`.
   - `is_user_id = not target.startswith("+") and target.isdigit() and len(target) >= 6`.
4. **Primary urinish**:
   - `is_user_id`: `acc.send_message(int(target), message)`. Agar `TelegramSendError` va `"PeerUser"` yoki `"entity"` xatoda → `return True` (telefon xabari allaqachon alohida yuborilgan deb hisoblaydi).
   - `is_phone`: `acc.resolve_and_send(normalized, message)`; muvaffaqiyatda resolved entity ID ni `_persist_entity(phone, entity.id)`.
   - Aks holda: `acc.send_message(target, message)` (username/`@...`).
5. Xato (`TelegramSendError` yoki boshqa) → `_get_failover_account()`; yo'q bo'lsa `raise`.
6. **Failover urinish**: yana `_global_rate_limit()`, keyin xuddi shu logika failover akkauntda. Xatoda: `"topilmadi"`/`"not found"` → `TelegramSendError("Telegram raqam noto'g'ri yoki ro'yxatdan o'tmagan: ...")`; aks holda `TelegramSendError("Telegram xatolik: ...")`.

### 5.7 `TelegramAccount.send_message(target, message)`
- Agar `not client` yoki `not is_connected()` → `TelegramSendError("Akkaunt {slot} ulanmagan.")`.
- Agar `is_flooded` → `TelegramSendError("Akkaunt {slot}: {flood_remaining_min} daqiqa cheklov")`.
- `_rate_limit()`.
- `entity = _entity_cache.get(str(target)) or target`; `client.send_message(entity, message, parse_mode="md")`.
- `FloodWaitError` → `set_flood(e.seconds)`, `raise`.
- Boshqa → `TelegramSendError("Akkaunt {slot} xatolik: {e}")`.

### 5.8 `resolve_and_send(phone, message)`
1. connected/flood tekshiruvi, `_rate_limit()`.
2. **Strategiya 1** (FREE): `_entity_cache.get(phone)` bor → `client.send_message(cached, message, parse_mode="md")`. FloodWaitError → set_flood+raise. Boshqa Exception → `del _entity_cache[phone]`.
3. **Strategiya 2** (`ImportContacts`): `asyncio.sleep(3)`. `ImportContactsRequest([InputPhoneContact(client_id=random(1, 2^31), phone=phone, first_name="Mijoz", last_name="")])`. `result.users` bo'sh → `TelegramSendError("Foydalanuvchi topilmadi: {phone}")`. Aks holda `user=result.users[0]`, `_entity_cache[phone]=user`, `client.send_message(user, message, parse_mode="md")`.

### 5.9 Connect/Verify/Import oqimi (`telegram.py` router)

**`POST /api/telegram/connect`** `{api_id:int, api_hash:str, phone:str, slot:1|2}`:
- `prefix = "telegram"` (slot 1) yoki `"telegram2"` (slot 2).
- JSON'ga `{prefix}_api_id, {prefix}_api_hash, {prefix}_phone` saqlaydi.
- `acc.initialize(api_id, api_hash, phone)`:
  - Telefon `+` bilan boshlamasa: `"+" + phone.lstrip("0")`.
  - `TelegramClient(_session_file, api_id, api_hash, flood_sleep_threshold=0)`, `connect()`.
  - Agar `is_user_authorized()` → `{"status":"already_connected"}` (va `_save_session_string`).
  - Aks holda `send_code_request(phone)`. Xatolar: `FloodWaitError`→"Telegram so'rovlar cheklovi: {seconds} soniya kuting.", `PhoneNumberInvalidError`→"Telefon raqami noto'g'ri", `PhoneNumberBannedError`→"...bloklangan", `ApiIdInvalidError`→"API ID yoki API Hash noto'g'ri".
  - Qaytadi `{"status":"code_sent","phone_code_hash":...,"code_via":"Telegram ilovasi"|"SMS"}` (`code_via`: result.type nomida "App" bo'lsa "Telegram ilovasi", aks holda "SMS").

**`POST /api/telegram/verify-code`** `{code, phone_code_hash?, password?, slot}`:
- `acc.verify_code(code, phone_code_hash, password)`:
  - `client.sign_in(_phone, code, phone_code_hash=...)`.
  - `SessionPasswordNeeded` (2FA): agar `password` berilgan → `sign_in(password=password)`; `PasswordHashInvalid`→"2FA parol noto'g'ri"; aks holda "2FA xatolik". Password yo'q → `TelegramSendError("2FA_REQUIRED")`.
  - `PhoneCodeInvalid`→"Kod noto'g'ri.", `PhoneCodeExpired`→"Kod muddati o'tgan...".
- `_save_session_string(acc, prefix)` → JSON'ga `{prefix}_session_string`.
- Qaytadi `{"status":"connected","message":"Telegram akkaunt {slot} muvaffaqiyatli ulandi"}`.

**`POST /api/telegram/import-session`** `{api_id, api_hash, phone, session_string, slot}`:
- JSON'ga 4 kalit saqlanadi (`+session_string`).
- `acc.import_string_session(...)`: `StringSession` orqali tekshiradi (`is_user_authorized` bo'lmasa "Session string yaroqsiz..."), keyin auth'ni **FILE session**'ga ko'chiradi (`session.set_dc(...)`, `session.auth_key=...`, `session.save()`), file session bilan ishlaydi. Qaytadi `{"status":"connected","user":{id,first_name,username,phone}}`.

**`_save_session_string(acc, prefix)`**: `StringSession()` yaratib `set_dc(dc_id, server_address, port)`, `auth_key`, `.save()` → JSON `{prefix}_session_string`.

**Boshqa endpoint'lar**:
- `GET /status` → `telegram_service.get_status()` (har slot: `connected, user{id,first_name,username,phone}, flooded, flood_remaining_min` + `any_connected`, `any_available`).
- `POST /disconnect?slot=0` — `slot=0` = hammasi. `disconnect()` session faylni **o'chiradi** (`.session`, `.session-journal`). `slot` bo'lsa JSON `{prefix}_session_string=""`.
- `POST /clear-flood?slot=0` — flood timer tozalash.
- `POST /send-test` `{target, message}` — to'g'ridan-to'g'ri `send_message` (queue EMAS). Xato → 502.
- `POST /send-to-counterparty` `{counterparty_id, message}` — `target = cp.telegram_username or telegram_phone or telegram_chat_id`. To'g'ridan-to'g'ri yuboradi.
- `GET /chat/{counterparty_id}?limit=40` — `get_chat_history` (ikkala akkauntdan birlashtirib, `(date, text[:100])` bo'yicha dedup, sana DESC, `[:limit]`).
- `GET /counterparties-with-telegram` — `telegram_linked==True` ro'yxati.

### 5.10 `restore_session(api_id, api_hash, session_string=None)`
- `{_session_file}.session` fayli bor bo'lsa → file session ishlatadi (afzal, restart'da saqlanadi).
- Yo'q bo'lsa va `session_string` bor → StringSession'dan auth'ni file session'ga ko'chiradi.
- Hech biri yo'q → `False`.
- `connect()` + `is_user_authorized()` → `_connected=True` / `False`.

---

## 6. NOTIFICATION TEMPLATE (`notification_service.py`)

### 6.1 `EVENT_META` (emoji + sarlavha + path) — AYNAN
```
demand:         ✅ "Sotuv amalga oshirildi!"            path=demand
supply:         📥 "Tovar qabul qilindi!"               path=supply
salesreturn:    ↩️ "Qaytarish amalga oshirildi!"       path=salesreturn
purchasereturn: ↩️ "Xariddan qaytarildi!"              path=purchasereturn
payment_in:     💳 "To'lov qabul qilindi!"              path=paymentin
payment_out:    💸 "Chiquvchi to'lov amalga oshirildi!" path=paymentout
order:          📋 "Yangi buyurtma!"                    path=customerorder
order_updated:  🔄 "Buyurtma o'zgartirildi!"            path=customerorder
```
Noma'lum event → `{emoji:"🔔", title:"Yangi hujjat!", path:doc_type}`.

### 6.2 `build_message(doc, event_type, doc_type, counterparty=None)` — xabar formati AYNAN

Qatorlar tartibi (har biri alohida qator, `"\n".join`):
1. `company_name` (agar bo'sh bo'lmasa) — JSON `company_name`.
2. `{emoji} {title}` (EVENT_META'dan).
3. `format_date(doc.moment)` — sana.
4. `🔷 Dokument: {doc.name yoki "—"}`.
5. `👤 Xaridor: {agent_name}` + agar `agent_phone` bor: ` {agent_phone}`. (`agent_name = agent.name or "—"`; `agent_phone = agent.phone` yoki bo'lmasa `counterparty.phone`.)
6. `💰 Xarid summa: {format_sum(total_sum)}` (`total_sum = (doc.sum or 0)/100`).
7. `📋 Balans: {format_sum(counterparty.balance)}` — **faqat** `counterparty` bor bo'lsa.
8. Har chek havolasi uchun alohida qator: `🧾Chek: {url}` — `paymentin` da chek YO'Q (`is_payment` → `chek_links=[]`); aks holda `_doc_links(doc, meta_path)` tartibida.
9. `📞 Malumot uchun: {contact_phone}` — agar JSON `contact_phone` bo'sh emas.

**`format_sum(amount)`**: `None`→`"0"`; aks holda `f"{amount:,.0f}".replace(",", " ")` (probelli ming ajratish, kasrsiz). Masalan `1234567.89` → `"1 234 568"`.

**`format_date(date_str)`**: `None`/bo'sh → `"—"` (U+2014). Aks holda `datetime.fromisoformat(date_str.replace("Z","+00:00"))` → `strftime("%d.%m.%Y %H:%M")`. Parse xatosida xom string qaytariladi.

### 6.3 `_doc_links(doc, doc_type)` — havola prioriteti
1. `doc["_pub_hrefs"]` bor → `[(name,url) for name,url if url]`.
2. `doc["_pub_href"]` (legacy string) → `[("", pub_href)]`.
3. `doc.meta.uuidHref` → `[("", uuidHref)]`.
4. `doc.id` → `[("", f"https://online.moysklad.ru/app/#{doc_type}?id={doc_id}")]`.
5. Aks holda `[]`.

### 6.4 `send_notification(db, counterparty_moysklad_id, message_type, document, message_text)` → bool
1. `Counterparty` WHERE `moysklad_id == counterparty_moysklad_id` AND `notifications_enabled == True`. Yo'q bo'lsa `False`.
2. **Yangi balans**: `moysklad_service.get_counterparty_balance(counterparty_moysklad_id)`; `None` emas bo'lsa `cp.balance = fresh_balance`.
3. `doc_type = EVENT_META[message_type].path`; `full_message = build_message(document, message_type, doc_type, cp)` (qayta quriladi — balans bilan).
4. **Target collection** (unique):
   - `primary = cp.telegram_username or cp.telegram_phone or cp.telegram_chat_id` → bor bo'lsa `("counterparty", primary)`.
   - `usta_phone = cp.usta_telegram_phone` → bor va `!= primary` → `("usta", usta_phone)`.
   - `doc["_usta_from_attr"]` → bor va `.startswith("+")` AND not in `{primary, usta_phone}` → `("usta_attr", doc_usta)`.
   - Bo'sh bo'lsa `False`.
5. Har target uchun `MessageLog` yaratadi (`status="pending"`), commit, refresh.
6. Har log uchun: `log.status="queued"`, `enqueue_message(recipient=target, message=full_message, priority=3 if recipient_type=="counterparty" else 5, source="notification", message_log_id=log.id, counterparty_name=cp.name)`.
7. commit. **Har doim `True`** (xabar navbatga qo'yilgan).

> **Priority**: counterparty xabari = **3**, usta/usta_attr = **5**. Queue worker `priority ASC` bo'yicha tanlaydi → counterparty oldin yuboriladi.

---

## 7. KASSA (`kassa.py` + `models/kassa.py`)

### 7.1 `KassaSession` model
`session_date (Date), cashier_id, cashier_name, opening_amount(0), cash_received(0), terminal_amount(0), transit_amount(0), safe_amount(0), terminal_confirmed(False), terminal_bank_deposited(False), status("open"), opened_at, closed_at, notes`.

### 7.2 Endpointlar
- `GET /api/kassa/today` — bugungi sessiya (`session_date == today`, `ORDER BY id DESC`), yo'q bo'lsa `{"session":null,"date":...}`.
- `GET /api/kassa/history?limit=30` — `ORDER BY session_date DESC`.
- `POST /api/kassa/open` `{cashier_id?, cashier_name?, opening_amount=0}` — agar bugun `status=="open"` sessiya bor → 400 "Kassa allaqachon ochiq". `cashier_name` yo'q bo'lsa `cashier_id`'dan employee nomi. `opened_at=now`. Activity log.
- `PUT /api/kassa/{id}` `{cash_received?, terminal_amount?, transit_amount?, safe_amount?, terminal_confirmed?, terminal_bank_deposited?, notes?}` — `status=="closed"` bo'lsa 400. `model_dump(exclude_unset=True)` bilan setattr.
- `POST /api/kassa/{id}/close` `{safe_amount, terminal_confirmed?, notes?}`:
  - `status=="closed"` → 400.
  - **Yopish sharti**: `safe_amount < session.cash_received` → 400 "Seyfdagi pul ({safe_amount}) kassa tushumidan ({cash_received}) kam...".
  - `session.safe_amount=data.safe_amount`, `notes`, `terminal_confirmed`, `status="closed"`, `closed_at=now`. Activity log.
  - **Admin Telegram xabari** (non-fatal, `try/except: pass`): `company = JSON company_name`. `has_role_filter("admin")` + `is_active==True` xodimlar. Xabar AYNAN:
    ```
    {company}
    🔒 Kassa yopildi!
    📅 {session_date}
    💵 Naqd: {cash_received:,.2f}
    💳 Terminal: {terminal_amount:,.2f}
    🏦 Seyfga: {safe_amount:,.2f}
    🕐 {closed_at:%H:%M}
    ```
    Har admin uchun `admin.telegram_phone` bor bo'lsa `telegram_service.send_message(...)` (to'g'ridan-to'g'ri, queue EMAS).
- `POST /api/kassa/{id}/send-to-safe` `{amount}` — `amount<=0` → 400. `status=="closed"` → 400. `safe_amount += amount`, `transit_amount = max(0, transit_amount - amount)`.

`has_role_filter(role)`: vergulli role string uchun OR — `role==value` OR `role LIKE "value,%"` OR `role LIKE "%,value"` OR `role LIKE "%,value,%"`.

---

## 8. KPI / OYLIK FORMULALARI — ENG MUHIM

### 8.1 Ma'lumot modeli

**`SalaryConfig`** (`salary_configs`): `employee_id`, `template_id`, `fix_weight`(default 0.40), `kpi_weight`(0.40), `bonus_weight`(0.20), `monthly_sales_target`(nullable), `monthly_kpi_budget`(nullable), `commission_percent`(nullable, masalan 0.005=0.5%), `kpi_tiers`(TEXT JSON), `is_active`(True).

**`KpiTemplate`** (`kpi_templates`): `name`, `role`, `description`, `is_active`, `tiers`(TEXT JSON), `created_at`.
**`KpiSection`** (`kpi_sections`): `template_id`, `name`, `weight`(0..1, masalan 0.40), `sort_order`.
**`KpiCondition`** (`kpi_conditions`): `section_id`, `name`, `description`, `weight`(0..1 section ichida), `source_type`(`manual`|`moysklad_sales`|`moysklad_sales_total`|`auto`), `target_value`(nullable), `checker_id`(nullable), `sort_order`.

**`KpiDailyLog`** (`kpi_daily_logs`): `employee_id`, `date`(string, oylik uchun `"YYYY-MM-01"`), `daily_target`, `actual_sales`, `achievement_percent`, `tier`(string), `kpi_earned`, `source`(`auto`|`auto_total`|`manual`), `note`. UNIQUE `(employee_id, date, source)`.

**`KpiMonthlyScore`** (`kpi_monthly_scores`): `employee_id`, `period`(`"YYYY-MM"`), `metric`(`"tmpl_{condition_id}"`), `label`, `section`(section nomi), `weight`(condition weight), `percent`(0..100), `amount`, `is_auto`, `checker_id`, `note`.

**`BonusFineLog`** (`bonus_fine_logs`): `employee_id`, `employee_name`, `type`(`bonus`|`fine`), `title`, `amount`, `note`, `created_at`.

### 8.2 Tier mantiqi (`kpi_service._calculate_tier`, `_parse_tiers`) — AYNAN

**Default tiers** (kalit yo'q bo'lsa):
```json
[{"min":100,"payout":100,"label":"To'liq"},
 {"min":90, "payout":80, "label":"Qisman"},
 {"min":0,  "payout":0,  "label":"Bajarilmadi"}]
```

**`_parse_tiers(tiers_json)`**: agar JSON string bor va `json.loads` muvaffaqiyatli va non-empty list → `sorted(tiers, key=lambda t: -t["min"])` (min bo'yicha kamayuvchi). Aks holda `DEFAULT_TIERS`.

**`_calculate_tier(achievement_percent, budget, tiers=None)` → (label, earned, payout_pct)**:
- `tiers` None bo'lsa `DEFAULT_TIERS`.
- `sorted(tiers, key=lambda t: -t["min"])` — min DESC. **Birinchi `achievement_percent >= tier["min"]` match yutadi.**
- `payout_pct = tier["payout"]`; `earned = round(budget * payout_pct / 100)`; `label = tier.get("label", f"{payout_pct}%")`.
- Hech biri match bo'lmasa `("Bajarilmadi", 0, 0)`.

**Misol**: achievement=95%, default tiers → 100 (95<100 yo'q), 90 (95>=90 ✓) → payout=80, earned=round(budget*0.8).

### 8.3 Oylik KPI cron (`kpi_service.calculate_monthly_kpi`) — qadam-ba-qadam

**Qachon**: `daily_kpi_calc` cron har kuni **23:30** (`CronTrigger(hour=23, minute=30)`). Yoki manual `POST /api/salary/calculate-daily?date_str=YYYY-MM-DD`. `calculate_daily_kpi = calculate_monthly_kpi` (alias).

1. `target_date = date.today()` (yoki berilgan).
2. `period = f"{year}-{month:02d}"`; `days_in_month = monthrange(year, month)[1]`.
3. `Employee JOIN SalaryConfig` WHERE `SalaryConfig.is_active==True` AND `Employee.is_active==True` AND `moysklad_agent_id IS NOT NULL` AND `moysklad_agent_id != ""`. Bo'sh bo'lsa return.
4. **`_fetch_monthly_sales(year, month)`** (1 ta API chaqiruv):
   - `moment_from = f"{year}-{month:02d}-01 00:00:00"`, `moment_to = f"{year}-{month:02d}-{days} 23:59:59"`.
   - `moysklad_service._request("GET", "/report/profit/byemployee", params={"momentFrom":..., "momentTo":...}, timeout=90)`. **Timeout = 90 sekund**.
   - Xato → `{}`. `"rows"` yo'q → `{}`.
   - Har row: `emp_href = row.employee.meta.href`, `emp_id = emp_href.rsplit("/",1)[-1]`. `sell = (row.sellSum or 0)/100`, `ret = (row.returnSum or 0)/100`, `net = sell - ret`. `grand_total += net`. `sales[emp_id] = net`.
   - Qaytadi `{emp_id: net, ..., "__TOTAL__": grand_total}`.
5. **Template KPI weight + tiers pre-load**: har `template_id` uchun `KpiTemplate.tiers` → `_parse_tiers`; `KpiSection`'lardan `kpi_weight = sum(s.weight for s in secs if 'kpi' in s.name.lower())` (section nomida "kpi" bo'lsa weight'lar yig'indisi).
6. `grand_total_sales = month_sales["__TOTAL__"]`.
7. Har `(emp, cfg)` uchun:
   - `personal_sales = month_sales.get(emp.moysklad_agent_id, 0)`.
   - `monthly_target = cfg.monthly_sales_target or 0`.
   - `kpi_weight = template_weights.get(cfg.template_id, 0)`.
   - **`monthly_budget = (emp.base_salary or 0) * kpi_weight`**.
   - `achievement = (personal_sales / monthly_target) * 100` agar `monthly_target>0`, aks holda `0`.
   - `tier, earned, payout_pct = _calculate_tier(achievement, monthly_budget, tiers)`.
   - `month_key = f"{period}-01"`.
   - **`_upsert_kpi_log`** (source=`"auto"`): personal_sales record. UNIQUE `(employee_id, date=month_key, source)` — bor bo'lsa update, yo'q bo'lsa insert. `achievement_percent = round(pct, 1)`.
   - **Total record** (source=`"auto_total"`): `total_achievement = (grand_total_sales / monthly_target) * 100`; `total_tier, total_earned, _ = _calculate_tier(total_achievement, monthly_budget, tiers)`. `_upsert_kpi_log(..., grand_total_sales, total_achievement, total_tier, total_earned, "auto_total")`.
8. commit.

### 8.4 Yakuniy oylik formulasi (`salary.py::salary_summary`, `GET /api/salary/summary?period=YYYY-MM`)

Har faol xodim uchun:
- `base = emp.base_salary or 0`.
- `cfg = SalaryConfig` (active).
- **section_weights**: `cfg.template_id` bor bo'lsa `_get_template_metrics(db, template_id)` dan `{section_name: section_weight}`.
- **scores**: `KpiMonthlyScore` WHERE `employee_id`, `period`. Section nomi bo'yicha guruhlash (`by_section`).
- **sw_lookup**: section_weights kalitlari `.strip().lower()` qilib normalizatsiya.
- **Har section uchun**:
  - `total_w = sum(s.weight for s in sec_scores) or 1`.
  - `pct = sum(s.weight / total_w * s.percent for s in sec_scores)` ← shartlarning weighted o'rtachasi (percent 0..100).
  - `sec_weight = sw_lookup.get(sec_name.strip().lower(), 0)`.
  - **`amount = round(base * sec_weight * pct / 100)`**.
  - `section_amounts[sec_name] = amount`; `section_percents[sec_name] = round(pct,1)`.
- **KPI sales** (`kpi_sales_amount`): `KpiDailyLog` WHERE `employee_id`, `date == f"{period}-01"` (HAMMA source: auto + auto_total). `kpi_sales_amount = sum(l.kpi_earned for l in kpi_logs)`. `kpi_days = len(kpi_logs)`.
- **Bonus/Fine**: `BonusFineLog` WHERE `employee_id`, `created_at` ∈ [`period_start`, `period_end`]. `extra_bonus = sum(amount WHERE type=="bonus")`, `fine_amount = sum(amount WHERE type=="fine")`. (`period_start = datetime(y,m,1)`, `period_end = datetime(y,m,last_day,23,59,59)`.)
- **Commission**: agar `cfg.commission_percent` bor va `> 0`: `personal_sales = KpiDailyLog.actual_sales` WHERE `date==f"{period}-01"`, `source=="auto"` (skalar). `commission_amount = round(personal_sales * cfg.commission_percent)`. Aks holda `0`.
- `total_sections = sum(section_amounts.values())`.

**YAKUNIY FORMULA (AYNAN)**:
```
total_salary = total_sections + kpi_sales_amount + commission_amount + extra_bonus - fine_amount
```
Bunda:
- `total_sections = Σ round(base × section_weight × section_pct / 100)` (har KPI template section bo'yicha)
- `section_pct = Σ (score.weight / Σscore.weight × score.percent)` (section ichidagi shartlar weighted o'rtachasi, 0..100)
- `kpi_sales_amount = Σ kpi_earned` (KpiDailyLog auto + auto_total, oylik record)
- `commission_amount = round(personal_sales × commission_percent)` (faqat source=auto actual_sales)
- `extra_bonus`, `fine_amount` = BonusFineLog yig'indilari

> **DIQQAT**: `fix_weight`/`kpi_weight`/`bonus_weight` SalaryConfig'da bor, lekin `salary_summary` ularni ISHLATMAYDI — section weight'lar **KPI template'dan** (`KpiSection.weight`) olinadi. `monthly_kpi_budget` ham summary'da ishlatilmaydi (faqat `KpiDailyLog.kpi_earned` orqali bilvosita, u esa `base_salary × kpi_section_weight` dan).

### 8.5 `_get_template_metrics(db, template_id)`
`KpiSection` (`sort_order`) → har section uchun `KpiCondition` (`sort_order`). Har condition uchun:
```
{metric: f"tmpl_{cond.id}", label: cond.name, description, section: sec.name,
 section_weight: sec.weight, weight: cond.weight, source_type: cond.source_type,
 is_auto: source_type in ("moysklad_sales","moysklad_sales_total","auto"),
 target_value, condition_id: cond.id, checker_id}
```

### 8.6 `GET /api/salary/scores?employee_id&period` — auto-fill
1. `cfg` topiladi; `template_id` yo'q → `{"items":[], "error":"KPI shablon tanlanmagan"}`.
2. `KpiMonthlyScore` WHERE `employee_id`, `period`. Yo'q bo'lsa template'dan auto-yaratadi (har metric uchun `KpiMonthlyScore`, commit, qayta o'qiydi). Template bo'sh → error.
3. **Auto metrics fill**: `metric → source_type` xarita. Har `s.is_auto` score uchun: `source_type=="moysklad_sales"` → `source_filter="auto"`; `"moysklad_sales_total"` → `"auto_total"`; aks holda skip. `KpiDailyLog` WHERE `employee_id`, `date==f"{period}-01"`, `source==source_filter` → bor bo'lsa `s.percent=log.achievement_percent`, `s.amount=log.kpi_earned`, extras `{actual_sales, target, tier}`.
4. `section_weights` template'dan. Qaytadi items + `section_weights`.

### 8.7 Salary config endpointlari
- `GET /api/salary/config` — barcha active config + employee nomi.
- `POST /api/salary/config` `{employee_id, template_id?, fix_weight=0, kpi_weight=0, bonus_weight=0, monthly_sales_target?, monthly_kpi_budget?, commission_percent?, kpi_tiers?}` — upsert (employee bo'yicha). Mavjud bo'lsa update (`monthly_kpi_budget`, `bonus_weight` mavjudda yangilanmaydi — kodda `cfg.fix/kpi/bonus_weight, monthly_sales_target, commission_percent, template_id, kpi_tiers` set qilinadi; insert'da `**data.model_dump()`).
- `DELETE /api/salary/config/{id}`.
- `GET /api/salary/daily-kpi?employee_id&period` — KpiDailyLog ro'yxati.
- `POST /api/salary/daily-kpi` `{employee_id, date, actual_sales?, kpi_earned?, note?}` — manual. `daily_target = (cfg.monthly_sales_target or 0)/days_in_month`. KPI weight = template KPI section'lar yig'indisi. `daily_budget = base * kpi_weight / days_in_month`. `achievement = actual/daily_target*100`. `tier, earned = _calculate_tier(achievement, daily_budget)`. `kpi_earned` berilsa override. Upsert `(employee_id, date)`.
- `POST /api/salary/calculate-daily?date_str` → `kpi_service.calculate_monthly_kpi`.
- `GET /api/salary/scores`, `PATCH /api/salary/scores/{id}` `{percent, note?}`, `GET /api/salary/my-checks?checker_id&period`.
- `_invalidate_scores_for_template(db, template_id)`: template o'zgarganda — yangi metrics olib, `current_period = now %Y-%m` uchun mavjud scores'dan: ro'yxatda yo'q metric'lar o'chiriladi; yangi metric'lar qo'shiladi; mavjudlar uchun `label/section/weight/is_auto` yangilanadi (**percent saqlanadi**).

### 8.8 KPI router (`kpi.py`)
- `GET/POST/PUT/DELETE /api/kpi/templates` — KpiTemplate CRUD (sections+conditions nested). PUT'da sections berilsa hammasi o'chirilib qayta yaratiladi (SQLite FK cascade ishonchsiz — avval `KpiCondition` keyin `KpiSection` o'chiriladi), keyin `_invalidate_scores_for_template`.
- `GET/POST /api/kpi/reports`, `PATCH /reports/{id}/items/{item_id}`, `POST /reports/{id}/confirm`, `DELETE /reports/{id}`.
- **`_recalculate_report`**: items section bo'yicha guruhlanadi. Har section: `total_cond_weight = sum(it.weight) or 1`; `sec_score = Σ (it.weight/total_cond_weight) × (it.percent/100)`; `total += sec_weight × sec_score × 100`. `report.total_percent = round(total,1)`; **`report.total_amount = round(base_salary × total/100, 0)`**.
- `update_report_item`: `is_fulfilled` set; `is_fulfilled and percent is None` → `percent=100`. Keyin `_recalculate_report`.
- `confirm_report`: recalculate, `status="confirmed"`, `confirmed_at=now`, `confirmed_by="admin"`.

---

## 9. REPORTS (`reports.py`)

> Eslatma: bu yerda "savdo" emas, **xabar log'lari** proxy sifatida ishlatiladi (local DB moliyaviy xom data saqlamaydi).

- **`GET /api/reports/sales?days=7`**: `MessageLog` WHERE `created_at >= now - timedelta(days=days)`. GROUP BY `date(created_at), message_type`. Har kun: `{date, demands:0, payments:0, orders:0, total:0}`. `col = message_type + "s"` (masalan `demand`→`demands`); agar `col in daily_data[day]` o'rnatadi; `total += count`. Qaytadi `{data:[...], period_days:days}`.
- **`GET /api/reports/top-counterparties?limit=10`**: `MessageLog` WHERE `counterparty_id IS NOT NULL`. GROUP BY `counterparty_id, counterparty_name`. ORDER BY `count(id) DESC`. LIMIT. Qaytadi `[{name, id, count}]`.
- **`GET /api/reports/summary`**: `total_counterparties = count(Counterparty)`; `linked_counterparties = count WHERE telegram_linked==True`; `messages_sent_today = count(MessageLog) WHERE date(created_at)==today AND status=="sent"`; `failed_messages_today = same AND status=="failed"`.

---

## 10. MESSAGES (`messages.py`)

- **`GET /api/messages/?page=1&limit=20&status?&message_type?&counterparty_name?`**: filtrlangan `MessageLog`, ORDER BY `created_at DESC`. Pagination: `offset=(page-1)*limit`, `pages=(total+limit-1)//limit`. Response `MessageLogResponse` schema (`id, counterparty_id, counterparty_name, telegram_target, message_type, document_id, document_number, message_text, status, error_message, sent_at, created_at`).
- **`GET /api/messages/filter-options`**: distinct counterparties/types/statuses + count'lar (butun jadval bo'ylab), ORDER BY count DESC.
- **`POST /api/messages/{id}/resend`**: `MessageLog` topiladi (`telegram_target` yo'q → 400). `enqueue_message(recipient=telegram_target, message=message_text, priority=3, source="resend", message_log_id=id, counterparty_name=...)`. `msg.status="queued"`, `error_message=None`.
- **`GET /api/messages/queue-stats`**: 4.7-bo'limga qarang.

---

## 11. COUNTERPARTIES (`counterparties.py`)

- **`GET /api/counterparties/?page=1&limit=20&search?&notifications_only=false`**: `Counterparty`. `search` → `ILIKE %search%` (name, phone, email, telegram_username, OR). `notifications_only` → `notifications_enabled==True`. ORDER BY `name`. Pagination bir xil.
- **`GET /api/counterparties/{id}`** — bitta.
- **`PUT /api/counterparties/{id}`** `CounterpartyUpdate` (`model_dump(exclude_unset=True)` setattr). `telegram_linked = bool(telegram_username or telegram_phone or telegram_chat_id)`.
- **`PATCH /api/counterparties/{id}/toggle-notifications`** — `notifications_enabled = not notifications_enabled`.

`Counterparty` model: `moysklad_id (unique), name, phone, email, balance(0.0), tags, telegram_username, telegram_phone, telegram_chat_id, notifications_enabled(True), telegram_linked(False), usta_telegram_phone`.

---

## 12. SETTINGS (`settings.py` router) + service'lar

### 12.1 DB settings service
- `get_setting(db, key)` → string yoki None.
- `set_setting(db, key, value)`: dict/list → `json.dumps(ensure_ascii=False)`; aks holda `str(value)` (None bo'lmasa); upsert.
- `get_all_settings(db)` → `{key: value}`.

### 12.2 JSON settings service (`data/settings.json`, UTF-8, indent=2)
- `get_json_setting(key, default=None)`, `set_json_settings(updates_dict)` (merge), `get_all_json_settings()`.

### 12.3 Settings router
- **`GET /api/settings/`**: `{moysklad:{token, polling_interval(int,def 30), sync_demands/orders/payments(bool, "true" tekshiruvi)}, telegram:{api_id, api_hash, phone, api_id2, api_hash2, phone2, session_active(telegram_service.is_connected), company_name, contact_phone}, templates:{demand_template, payment_in_template, order_template}, language(def "UZ"), dark_mode(bool)}`.
- **`PUT /api/settings/`** `SettingsUpdate`: `moysklad_token` set → `moysklad_service.update_token`; `polling_interval` set → `sync_service.start(interval)` (scheduler restart!); bool'lar `str(...).lower()` ("true"/"false"); `language`, `dark_mode`.
- **`PUT /api/settings/telegram`** `TelegramSettingsUpdate`: JSON'ga `telegram_api_id/hash/phone`, `telegram2_*`, `company_name`, `contact_phone`. `notification_service.set_company_info(...)`.
- **`GET /api/settings/telegram`** — JSON'dan slot 1 + company.
- **`GET/PUT /api/settings/templates`** — `demand_template`, `payment_in_template`, `order_template` DB'da; `notification_service.update_templates` (bu eski mexanizm, `build_message` aslida bu template'larni ishlatmaydi — chek havolalari publication orqali).

### 12.4 Document templates (`document_templates.py` + service)
- **`doc_templates_config`** (DB JSON): `{version:1, updated_at(ISO Z), updated_by, types:{<doc_type>:{enabled:bool, templates:[str]}}}`. Seed: `DOC_TEMPLATES` da bor bo'lsa `{enabled:True, templates:[...]}`, aks holda `{enabled:False, templates:[]}`.
- **`doc_templates_cache`** (DB JSON): `{fetched_at, types:{<doc_type>:[{name, kind, meta}]}}`.
- **Registry** (`_DOC_TYPES`, 20 ta): sync_supported=True bo'lganlar: `demand, customerorder, supply, paymentin, paymentout, salesreturn, purchasereturn, move`. Qolganlari (invoicein/out, cashin/out, retaildemand, retailsalesreturn, loss, enter, inventory, processingorder, purchaseorder, internalorder) sync_supported=False.
- `GET /api/document-templates` (auth): config + cache + `cache_age_hours` (now − fetched_at, soatlarda, round 1). Har doc_type uchun `configured_templates`, `available_templates`, `missing_templates` (configured lekin cache'da yo'q).
- `PUT /api/document-templates/{doc_type}?allow_empty=0` `{enabled, templates, expected_updated_at?}`: noma'lum doc_type → 404; dublikat template → 422; `enabled and not templates and not allow_empty` → 422 `empty_templates_requires_allow_empty`; `expected_updated_at != cfg.updated_at` → 409 `stale_update`. Saqlaydi, `updated_at=now`, warnings (cache'da yo'q template'lar).
- `POST /api/document-templates/refresh`: har doc_type uchun `embeddedtemplate`+`customtemplate` metadata (`httpx timeout=15.0`), 404 skip, xato bo'lsa o'sha doc_type yangilanmaydi (eski cache saqlanadi). `fetched_at=now`.
- `POST /api/document-templates/reset/{doc_type}` — DOC_TEMPLATES default'ga qaytaradi.
- `get_enabled_templates(db, doc_type)`: config'dan; `enabled` emas yoki entry yo'q → `[]` (fail-closed).

---

## 13. 1:1 PORT UCHUN MUHIM E'TIBORLAR / NOZIKLIKLAR

1. **Vaqt zonalari**: `sync_service._last_sync` = `datetime.utcnow()` (UTC). `queue_worker` `datetime.now()` (local). `kpi_service` `date.today()` (local). `MessageLog.created_at` default `datetime.now` (local). Port'da bu farqni AYNAN saqlang (sync UTC, qolganlar local).
2. **`_processed_*` set'lar process davomida** (in-memory, persist YO'Q). Restart → birinchi sikl `_last_sync is None` → barcha mavjud hujjatlar skip qilinadi (set'larga to'ldiriladi, xabar yo'q). Bu **dizayn** — restart'da eski hujjatlar uchun spam bo'lmaydi.
3. **`sync_orders` bo'sh `set()` uzatadi** `_process_doc` ga — order dedup `_processed_orders` dict orqali (timestamp tracking), process_doc set orqali emas.
4. **Birinchi sikl counterparties**: `_last_cp_sync` atribut yo'q → birinchi `sync_all` da `sync_counterparties` chaqiriladi (`hasattr` False).
5. **Flood regex**: `(\d+)\s*daqiqa` (daqiqa→×60), `(\d+)\s*soniya` (soniya→×1), default 300. Bu matnlar `telegram_service` xato xabarlaridan keladi (`"Akkaunt {slot}: {N} daqiqa cheklov"`).
6. **Global rate limit 3s** (docstring 8s noto'g'ri). Per-account ham 3s. `ImportContacts` oldidan +3s sleep. Effektiv: yangi telefon resolve = global 3s + account 3s + 3s import sleep.
7. **`monthly_kpi_budget` ishlatilmaydi** — KPI budget har doim `base_salary × kpi_section_weight` (template'dagi nomida "kpi" bo'lgan section'lar weight yig'indisi).
8. **Tier earned**: `round(budget × payout / 100)` — Python `round()` (banker's rounding emas, lekin amalda butun son). TS'da `Math.round` (lekin `.5` holatlarda Python `round(0.5)=0`, `round(1.5)=2` — banker's rounding; aniq 1:1 uchun shu nozik holatni hisobga oling, garchi pul summalarida kam uchraydi).
9. **`reports.py::_get_moysklad_sales` va `kpi.py` `moysklad_service.request(...)` bug** — public `request` metodi yo'q. Port'da xuddi shu xulq (KPI report auto-fill ishlamaydi) yoki to'g'rilash — biznes qaroriga bog'liq.
10. **`sync-now?since=` `_processed_payments_out` ni clear QILMAYDI** (7 set clear, payments_out emas) — replay'da payments_out dublikat bo'lmasligi mumkin.
11. **`telegram_service.send_message` user_id "PeerUser"/"entity" xatosi → `return True`** (telefon xabari allaqachon yuborilgan deb hisoblaydi — usta_attr/user_id holati uchun).
12. **`Counterparty` `notifications_enabled==True` bo'lmasa xabar YO'Q** — `send_notification` darhol `False`.
13. **`build_message` da balans faqat `counterparty` obyekt berilganda** ko'rsatiladi. `_process_doc` → `build_message(doc, event_type, doc_type)` (counterparty YO'Q) → birinchi qurishda balans yo'q; `send_notification` ichida qayta `build_message(document, message_type, doc_type, cp)` (cp BOR) → yakuniy xabarda balans bor. Queue'ga `full_message` (cp bilan) ketadi.
14. **APScheduler semantikasi**: `main_sync` `max_instances=1, coalesce=True, misfire_grace_time=interval`. TS'da ekvivalent: bir vaqtda 2 sync ishlamasin, kechikkan fire'lar bittaga birlashtirilsin, 1 interval gача kechikishga ruxsat.
15. **`KpiDailyLog.date` oylik record uchun `"YYYY-MM-01"`** (kun har doim 01). UNIQUE `(employee_id, date, source)` — bir oyda `auto`, `auto_total`, `manual` alohida yozuvlar.

---

### Kalit fayllar (absolyut yo'llar)
- `D:\projects-desktop\projects\moysklad\backend\app\services\sync_service.py` — polling
- `D:\projects-desktop\projects\moysklad\backend\app\services\queue_worker.py` — navbat/retry
- `D:\projects-desktop\projects\moysklad\backend\app\services\telegram_service.py` — 2 akkaunt/flood
- `D:\projects-desktop\projects\moysklad\backend\app\services\kpi_service.py` — KPI cron/tier
- `D:\projects-desktop\projects\moysklad\backend\app\services\notification_service.py` — xabar template
- `D:\projects-desktop\projects\moysklad\backend\app\services\moysklad_service.py` — REST client
- `D:\projects-desktop\projects\moysklad\backend\app\services\document_template_service.py` — chek shablon config
- `D:\projects-desktop\projects\moysklad\backend\app\routers\salary.py` — oylik formula (summary)
- `D:\projects-desktop\projects\moysklad\backend\app\routers\kpi.py`, `reports.py`, `messages.py`, `settings.py`, `telegram.py`, `kassa.py`, `moysklad.py`, `counterparties.py`, `document_templates.py`
- `D:\projects-desktop\projects\moysklad\backend\app\models\kpi.py` — SalaryConfig/KpiDailyLog/KpiMonthlyScore/KpiTemplate/Section/Condition
- `D:\projects-desktop\projects\moysklad\backend\app\models\message_queue.py`, `message_log.py`, `counterparty.py`, `kassa.py`, `bonus_fine.py`, `settings.py`, `employee.py`
- `D:\projects-desktop\projects\moysklad\backend\app\main.py` — lifespan/scheduler/migration
- `D:\projects-desktop\projects\moysklad\backend\app\config.py`, `database.py`, `utils\helpers.py`

Spetsifikatsiya yakunlandi. Barcha formula, interval (polling 30s, queue 5s, cp sync 600s, retry [30,90,270], rate limit 3s, KPI cron 23:30, profit report timeout 90s, publication timeout 10s, cache refresh 15s, deadline checker 60s, health check 5min), tier mantiqi va oylik formulasi koddan AYNAN olingan.