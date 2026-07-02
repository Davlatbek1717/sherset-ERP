# P-S — Sozlamalar (Settings) ref-parity audit

**Sana:** 2026-05-28
**Referens:** `D:\projects-desktop\projects\KONTRAGENTLAR\src\app\(dashboard)\settings\*` (1743 satr) + `src/app/api/{admin/{audit,reason-codes},auth/change-password}/route.ts`.
**Hozirgi:** `apps/web/src/app/(app)/analitika/sozlamalar/page.tsx` (variance + reason-codes inline, ~190 satr — sodda).

---

## Referens komponentlar

| Fayl | Satr | Vazifa |
|---|---|---|
| `settings/page.tsx` | 69 | Root: profil ma'lumotlari + password-form |
| `settings/password-form.tsx` | 195 | Parol o'zgartirish (eski/yangi/tasdiq + validation) |
| `admin/page.tsx` | 54 | Wrapper |
| `admin/admin-settings-view.tsx` | 344 | Variance chegaralari + reason-codes config (multi-tab) |
| `admin/admin-settings-tabs.tsx` | 63 | Tab navigation komponenti |
| `audit/page.tsx` | 7 | Wrapper |
| `audit/audit-view.tsx` | 320 | Audit log viewer: filter (actor/action/dateRange) + jadval |
| `reason-codes/page.tsx` | 7 | Wrapper (alohida route) |
| `reason-codes/reason-codes-view.tsx` | 355 | Sabab kodlari CRUD (richer than mine) |
| `roles/page.tsx` | 7 | Wrapper |
| `roles/roles-list-view.tsx` | 181 | Rollar ro'yxati + count + system badge |
| `roles/[id]/page.tsx` + `role-detail-view.tsx` | — | Rol tafsiloti + permission matrix |
| `roles/new/page.tsx` + `new-role-view.tsx` | — | Yangi rol |
| `roles/role-permission-matrix.tsx` | 141 | Entity × action matrix komponenti |

## Referens API endpointlar

- `GET /api/admin/audit` — filter (actor/action/from/to) + pagination
- `GET /api/admin/audit/actors` — distinct actors list (dropdown)
- `GET/POST /api/admin/reason-codes`, `PUT/DELETE [id]`
- `POST /api/auth/change-password`

## Moysklad'da nima bor (qayta ishlatish)

- ✅ `audit-log` modul: `GET /audit-logs` va `GET /admin/audit-logs` endpointlari mavjud (filter shape moslashuvi tekshirilishi kerak).
- ✅ `permissions` modul: `Role`+`RolePermission` modeli, `PermissionsService.SYSTEM_ROLE_TEMPLATES`, `GET /permissions/me`. Roles CRUD endpoint **yo'q** (frontend uchun kerak).
- ✅ `auth`: `POST /login`, `/refresh`, `/logout`, `GET /me`. **`change-password` endpoint yo'q** — qo'shiladi.
- ✅ Reason-codes endpoint analitika ichida (P-1 da yozilgan) — UI'ni alohida routega ko'chirish.

## Yangi backend ish

1. **`auth.controller`** ga `POST /auth/change-password` qo'shish (oldPassword/newPassword + argon2 verify+hash).
2. **`permissions.controller`** ga:
   - `GET /roles` — accountId bo'yicha rollar + memberCount
   - `GET /roles/:id` — bitta rol + permission matrix
   - `POST /roles` — yangi rol (name/description/permissions)
   - `PUT /roles/:id` — yangilash (permissions matrix)
   - `DELETE /roles/:id` — o'chirish (faqat `isSystem=false`)

## Yangi UI ish

Joriy `/analitika/sozlamalar` (variance+reason inline) qayta tashkil:

- `sozlamalar/layout.tsx` — sub-nav strip (Profil / Admin / Audit / Sabab kodlari / Rollar) + sarlavha
- `sozlamalar/page.tsx` — Profil + password-form (yangi)
- `sozlamalar/admin/page.tsx` — variance config (existing logic ko'chiriladi)
- `sozlamalar/audit/page.tsx` — audit log viewer (filter + jadval, mavjud `/audit-logs` endpoint'idan)
- `sozlamalar/sabab-kodlari/page.tsx` — reason-codes CRUD (existing ko'chiriladi)
- `sozlamalar/rollar/page.tsx` — rollar ro'yxati
- `sozlamalar/rollar/[id]/page.tsx` — permission matrix
- `sozlamalar/rollar/yangi/page.tsx` — yangi rol

## Sketch ish hajmi

- Backend: ~250 satr (change-password endpoint + roles CRUD + Zod schemas + tests)
- Web `_components/settings-nav`: 60 satr
- Web `_lib/types` + helpers: 80 satr
- Web 7 sahifa (profil+password / admin / audit / reason-codes / roles list / role detail / new role): ~1200 satr
- i18n: 60+ kalit (uz + ru)
- Tests: schema/service tests
- Live smoke

**Jami: 2-3 sessiya.**

## Bu sessiyada bajariladigan minimal scope (P-S-1 foundation)

1. Audit doc commit ← hozir
2. Backend: `change-password` endpoint + tests
3. Backend: roles list + get endpoints (CRUD'ning read tomoni)
4. Web: settings layout + sub-nav + 5 ta skeleton sahifa (profil/admin/audit/sabab/rollar) — existing sozlamalar logic ko'chiriladi
5. Profil + password-form sahifasi (richest yangi qism)
6. Audit log viewer sahifasi
7. Smoke + commit

Rollar CRUD (yaratish/o'zgartirish/permission matrix UI) — P-S-2 (keyingi sessiya).
