# Publication — Hujjat ulashish (Public links)

> Hujjatni public URL orqali tashqi foydalanuvchiga ulashish. Mijoz/sherikga
> sizning ERP'da hisob yo'q — lekin u sizning schyot/buyurtmangizni link
> orqali ko'rishi mumkin. Moysklad'ning «Публикация» funksiyasining 1:1
> klon implementatsiyasi.

**Status**: ✅ Done · Sprint 9
**Code path**: `apps/api/src/modules/publication` + `apps/web/src/app/(app)/settings/publications` + public viewer `apps/web/src/app/p/[token]`
**DB model**: `Publication` (`packages/db/prisma/schema.prisma`)
**Test count**: 21 unit (service, including adversarial QA)

---

## 1. Bu nima?

Klerk hujjatga "Share via link" tugmasini bosadi → server unique URL
yaratadi → bu URL'ni mijozga yuboradi (email, Telegram, ...).

Mijoz URL'ni ochadi → hujjatni ko'radi (login kerak emas).

**Xavfsizlik chizmasi**:
1. **Token** — 32-baytlik random base64url (256 bit entropy). Guessable emas.
2. **Parol** (ixtiyoriy) — argon2id hash bilan saqlanadi. Mijoz havola ochsa avval parol so'raydi.
3. **Muddat** (ixtiyoriy) — `expiresAt`. Muddat tugagach 410 Gone.
4. **Bekor qilish** (revoke) — klerk istalgan vaqtda yopib qo'yishi mumkin. URL ishlamaydi.
5. **Token rotate** — agar URL kimga to'g'ri kelmasa, yangi token generatsiya qilinadi.

---

## 2. Qachon ishlatamiz?

### Senariy A — Schyot mijozga yuborish

ABC MCHJ mijozga InvoiceOut yaratdik (СЧ-2026-00045). Mijozning ERP'da
hisob'i yo'q, lekin schyotni ko'rishi kerak.

- /invoices-out/[id] sahifasida "Share via link" → publication yaratiladi
- Tizim URL beradi: `https://app.uz/p/AbCdEf123…`
- URL'ni Telegram orqali mijozga yuboramiz
- Mijoz URL'ni ochadi → schyotni ko'radi (login yo'q)
- View count counter +1
- Klerk dashboardda ko'radi: "Mijoz schyotni ko'rdi 14:32 da"

### Senariy B — Parol himoyalangan kontrakt

VIP mijoz uchun maxsus shartnoma narxlari bor. Email orqali yuborish
xavfli (boshqa odam o'qishi mumkin).

- Publication yaratish + parol qo'shish
- URL: `https://app.uz/p/Xyz789…`
- Parol: `vip2026` (mijozga alohida kanaldan yuboriladi)
- Email orqali: faqat URL
- Mijoz URL'ni ochadi → 🔒 parol so'raladi
- To'g'ri parol → kontrakt ochiladi
- Noto'g'ri parol 3 marta → ko'rishlar ko'paymaydi, klerk noto'g'ri urinishni audit'da ko'radi

### Senariy C — Vaqtinchalik narx ro'yxati

"Q2 sale prices" PriceList yaratdik, bu narxlar faqat may oyida amal qiladi.

- Publication, `expiresAt = 2026-05-31`
- Mijozlarga URL yuboriladi
- 1-iyun da URL avtomat 410 Gone qaytaradi (revoke qilishga hojat yo'q)
- Audit jurnalida tarix qoladi

### Senariy D — Mijoz URL'ni boshqalarga uzatdi

Mijoz "bu narxlar maxfiy emas" deb URL'ni raqobatchilarga yubordi. Klerk
sezdi (view count keskin oshib ketdi).

- /settings/publications/[id] da "Bekor qilish" tugmasini bosadi
- URL darhol 410 Gone qaytaradi
- Yoki "Token'ni yangilash" → yangi URL beriladi (eski URL ishlamaydi)
- Asl mijozga yangi URL yuboriladi

---

## 3. Qayerda chiqadi?

### Asosiy joylar

1. **Sub-nav**: `Sozlamalar → Public havolalar`
   — URL: `/settings/publications`

2. **Har hujjat /[id] sahifasi**: kelajakda "Share via link" tugmasi
   (hozircha to'g'ridan-to'g'ri /settings/publications/new orqali ID
   bilan)

3. **Public viewer**: `/p/[token]` — tashqi URL, auth yo'q

### List ko'rinishi (`/settings/publications`)

| # | Ustun | Misol |
|---|-------|-------|
| 1 | Hujjat turi | Mijozga schyot |
| 2 | Izoh | "ABC MCHJ uchun" |
| 3 | Havola | /p/AbCdEf12… [Copy] |
| 4 | Parol | 🔒 yoki — |
| 5 | Ko'rishlar | 5 |
| 6 | Oxirgi ko'rish | 12.05.2026 14:32 |
| 7 | Muddati | 31.05.2026 yoki Cheksiz |
| 8 | Holat | Aktiv / Bekor qilingan / Muddati tugagan |
| 9 | Yaratilgan | 10.05.2026 |
| 10 | [Boshqarish →] |

### `/[id]` boshqaruv sahifasi

- Public URL (copy tugma)
- Hujjatga link
- Analytics card (ko'rishlar, oxirgi ko'rish, holat)
- Tahrirlash: izoh, muddat, parol
- "Bekor qilish" tugmasi (revoke)
- "Token yangilash" (rotate)
- "Yozuvni o'chirish" (soft-delete, audit qoladi)

### Public viewer (`/p/[token]`)

- Parol bor bo'lsa 🔒 prompt
- Parol to'g'ri → hujjat metadata ko'rsatiladi
- View counter avtomat
- 404 / 410 holatlari uchun toza error UI

---

## 4. Token + xavfsizlik

**Token format**: 32 bayt random → base64url → 43 ASCII chars (`A-Z`,
`a-z`, `0-9`, `_`, `-`). Brute-force imkonsiz (2^256 ehtimollik).

**Parol hash**: argon2id (industry-standard). Plain-text parol hech
qachon DB'da saqlanmaydi.

**API javoblarda `passwordHash` chiqarilmaydi** — service `list()` va
`findById()` da sanitize qilingan. Klerk faqat `passwordProtected: true`
flag'ni ko'radi.

**410 vs 404**:
- 410 Gone: token mavjud, lekin revoked yoki expired (semantically "was
  here but gone now")
- 404 Not Found: token noma'lum yoki soft-deleted (semantically "never
  existed for you")

**View counter**: best-effort increment. Eventual consistency — bir
nechta parallel ko'rish ham bo'lsa, faqat counter +1/+2/+N bo'ladi.
Strict atomicity yo'q (counter audit emas, UX uchun).

---

## 5. API endpointlar

### Authenticated (tenant-scoped)

```
GET    /api/v1/publications              # ro'yxat (sanitized — passwordHash chiqmaydi)
GET    /api/v1/publications/:id          # bitta
POST   /api/v1/publications              # yaratish (idempotent — re-publish unrevokes)
PATCH  /api/v1/publications/:id          # tahrirlash (description / expiry / password)
POST   /api/v1/publications/:id/revoke
POST   /api/v1/publications/:id/rotate-token
DELETE /api/v1/publications/:id          # soft delete
```

### Public (no auth, token-only)

```
GET    /api/v1/p/:token                  # metadata (passwordProtected, expiresAt, viewCount)
POST   /api/v1/p/:token/verify           # body: { password } — verify access
POST   /api/v1/p/:token/view             # bump view counter
```

### Yaratish (POST) namunasi

```json
{
  "targetType": "invoiceout",
  "targetId": "00000000-0000-0000-0000-000000000050",
  "description": "ABC MCHJ uchun СЧ-00045",
  "expiresAt": "2026-06-30",
  "password": "vip2026"
}
```

Response:
```json
{
  "id": "...",
  "token": "AbCdEf12345...",
  "description": "ABC MCHJ uchun СЧ-00045",
  "passwordProtected": true,
  "expiresAt": "2026-06-30T00:00:00Z",
  "viewCount": 0
}
```

Public URL: `${origin}/p/AbCdEf12345...`

---

## 6. Test coverage

21 unit test (adversarial QA):

**Create**:
- ✅ Token URL-safe, 43 chars, base64url alphabet
- ✅ Idempotent — re-publish returns existing row
- ✅ Re-publish un-revokes if previously revoked
- ✅ Password hashed via argon2 (verifiable)
- ✅ Past expiresAt rejected

**Public viewer (resolve)**:
- ✅ Returns metadata on valid token
- ✅ 404 on unknown token
- ✅ 410 on revoked
- ✅ 410 on expired
- ✅ 404 on soft-deleted
- ✅ passwordProtected flag accurate

**Verify password**:
- ✅ Correct password → ok
- ✅ Wrong password → ForbiddenException
- ✅ No password set → no-op success
- ✅ Revoked publication rejected

**Record view**:
- ✅ viewCount increments + lastViewedAt stamped
- ✅ Does NOT increment for revoked

**Admin lifecycle**:
- ✅ Revoke stamps revokedAt; resolve returns 410
- ✅ Rotate generates new 43-char token; old URL 404
- ✅ Soft-delete excludes from findById
- ✅ List sanitises passwordHash (never leaks)

---

## 7. Kelajakda

- [ ] Har hujjat /[id] sahifasiga "Share via link" tugmasi
- [ ] Public viewer'da to'liq hujjat ko'rinishi (hozircha metadata only)
- [ ] OTP / one-time codes (parol o'rniga email/SMS verification)
- [ ] Watermark — kim ko'rganini PDF'ga bosish
- [ ] IP whitelist / blacklist (xavfsiz mijozlar uchun)
- [ ] Webhook — mijoz hujjatni ko'rganida klerk telegram'ga xabar oladi

---

**Tegishli kod**:
- Backend: `apps/api/src/modules/publication/`
  - `publication.controller.ts` — 2 controller (authenticated + public `/p/*`)
  - `publication.service.ts` — token generation, password hashing, view counter
- Frontend authenticated:
  - `apps/web/src/app/(app)/settings/publications/page.tsx`
  - `apps/web/src/app/(app)/settings/publications/[id]/page.tsx`
  - `apps/web/src/app/(app)/settings/publications/new/page.tsx`
- Frontend public viewer:
  - `apps/web/src/app/p/[token]/page.tsx` — auth yo'q, alohida layout
- i18n: `pages.publication`, `nav.settings.publications`
- Permissions: `apps/api/src/modules/permissions/permissions.types.ts` (`publication`)
- DB model: `packages/db/prisma/schema.prisma` — Publication
- Migration: `20260512110122_add_publication`
