# POS redizayn — F7 hisobot: ko'p-kassir, server (PIN-switch)

**Sana:** 2026-08-14 · **Faza:** F7 (`docs/superpowers/plans/2026-08-14-kassa-pos-redizayn.md`)
· **Qamrov:** faqat `apps/api` (web'ga TEGILMADI — F8) · **Holat: Phase-1 —
strukturaviy, runtime-tasdiqlanmagan** (qurilma/brauzer sinovi YO'Q, F9).

Commitlar: `b24b3c2b` (F7.2 candidates) · `00f76357` (F7.3 switch) ·
`4f370f18` (F7.4 qulf-testlar).

---

## 1. Recon xaritasi (7.1)

| Savol | Topilma (fayl-blok o'qilgan, grep-satr emas) |
|---|---|
| pos-pin fayllari | `auth.controller.ts` (barcha `/auth/pos-pin*` marshrutlar), `pos-pin.service.ts` (PIN xesh/lookup + `verifyPin` — 5-xato lockout, hisoblagich XOTIRADA `attempts` Map), `pos-login.service.ts` (PIN-kirish + javob-quruvchi), `pos-device.service.ts` (`verify` — qurilma-juftlik, DB'dagi qulf), `pos-pin-lookup.ts` (HMAC lookup) |
| kiosk-aniqlash | Server tomonda IKKI mavjud mexanizm: (a) JWT da'vosi `uiMode === 'kiosk'` (`KioskGuard` shu bilan cheklaydi, rollardan `resolveUiMode`); (b) qurilma-kalit `devices.verify(deviceId, deviceSecret)` — 2026-08-11 egasi qarori bilan pos-login'da IXTIYORIY |
| login-javob shakli | `{ accessToken, user, device }` + `ms_rt` (refresh) va `ms_mt` (media) HttpOnly cookie'lar. `user` shakli `LoginResponse['user']` (auth.schema.ts) |
| smena-a'zolik | `SmenaEmployee` jadvali (`@@id([smenaId, employeeId])`); `openSessionFromSmena` tekshiruvi `smena.service.ts:240` — `smenaEmployee.findFirst({ smenaId, employeeId })`. Employee tomonda relation: `smenaAssignments` |
| audit-jurnal | `CashierAuditEvent` YARAMAYDI — `sessionId` majburiy FK, switch esa aynan sessiya YO'Q paytda bo'ladi. Ishlatildi: umumiy `AuditLog` (`entity/entityId/action/context`, loyihada 15+ yozuvchi naqshi) |

## 2. Qilingan ish

### `GET /auth/pos-pin/candidates` (F7.2, `b24b3c2b`)

- Javob: `{ cashiers: [{ employeeId, name }] }` — **hech qanday sir qaytmaydi**
  (select faqat `id, name`; test qulflagan).
- Mezon `openSessionFromSmena` bilan **bitta manba**: faol (arxivlanmagan)
  smenaga biriktirilgan + `posPinHash` bor + `archived: false` + so'rovchi
  akkaunti. **Do'kon/tashkilot bo'yicha alohida filtr ATAYLAB yo'q** —
  `openSessionFromSmena` ham a'zolikdan tashqari do'konni tekshirmaydi (ombor
  kassir sukutidan keladi); ikkinchi mezon ro'yxat va haqiqiy ochilish
  huquqini jimgina ajratib yuborardi. «Boshqa do'kon qaytmaydi» testi tenant
  (akkaunt) chegarasida qulflangan.
- Kiosk sharti: `uiMode === 'kiosk'` bo'lmasa 403. GET'da qurilma kalitini
  xavfsiz uzatib bo'lmaydi (query-string logga tushadi) — shuning uchun bu
  endpointda qurilma-muqobili yo'q.

### `POST /auth/pos-pin/switch` (F7.3, `00f76357`)

Body: `{ employeeId, pin, deviceId?, deviceSecret? }` — Zod `.strict()`
(tana-shartnoma: noma'lum kalit jim tashlanmaydi, 400). Tekshiruv TARTIBI
(reja shartnomasi, testlar qulflagan):

1. **Kiosk-juftlik:** kalit berilsa `devices.verify` (423 qulf / 401 notanish
   / begona akkaunt → 403); kalit berilmasa `uiMode === 'kiosk'` shart
   (pos-login'dagi 2026-08-11 ixtiyoriylik qarori bilan bir xil).
2. **Joriy kassirning ochiq sessiyasi yo'q:** bor bo'lsa **409** (xabarda
   smena nomi) — almashinuv har doim toza nuqtada, PIN tekshirilmaydi.
3. **Target `candidates` mezonida:** bitta where-shakl (a'zolik + PIN +
   arxiv + akkaunt) — bo'lmasa 403; PIN bu holatda ham tekshirilmaydi
   (a'zo-bo'lmagan orqali lockout kuydirib bo'lmaydi).
4. **Xodim-qo'riqchilari:** `assertEmployeeMayLogin` — parol/PIN-login bilan
   AYNAN bir xil (lockedUntil, loginAllowed, IP-ro'yxat).
5. **PIN — MAVJUD lockout:** `posPin.verifyPin(accountId, target, pin)` —
   xotiradagi hisoblagich, 5 xato → 401 `lockout: true`, xatoda `remaining`.
6. **Audit — fail-closed:** `AuditLog { entity: 'employee', action:
   'pos-cashier-switch', entityId: target, userId: joriy, context: { from,
   to, deviceId, ip, userAgent } }`. Jurnal yozilmasa almashinuv ham
   bo'lmaydi (izsiz almashinuv yo'q).
7. **Javob:** `pos-login` bilan **BIR XIL** — bitta `issueBundle`
   javob-quruvchi (login ham, switch ham shuni chaqiradi; nusxa ajralib
   ketishi mumkin emas — `copy-paste-loses-a-branch` saboq). Cookie'lar ham
   xuddi login'dagidek qo'yiladi. F8 javobni `auth-store`ga to'g'ridan-to'g'ri
   beradi.

### Token-invalidatsiya semantikasi (OCHIQ — F8 agenti shunga qaraydi)

- **Bekor qilinadi:** joriy (eski) kassirning **shu qurilmadagi**
  refresh-tokeni — controller `ms_rt` cookie qiymatini servisga uzatadi,
  servis `tokens.revokeRefreshToken(oldRt)` bilan DB'da o'ldiradi; keyin
  cookie yangi kassirniki bilan USTIDAN yoziladi. Media-cookie ham yangisi
  bilan almashadi.
- **Bekor qilinMAYDI (ataylab):** (a) eski kassirning amaldagi
  **access-JWT'i** — u stateless, maksimum 15 daqiqada o'zi o'ladi; uni
  darhol o'ldirishning yagona mavjud vositasi deny-list flooru
  (`revokeAllForEmployee`) xodimni **barcha** qurilmalardan chiqarib
  yuborardi — bu offboarding vositasi, almashinuv emas; (b) eski kassirning
  **boshqa qurilmalardagi** sessiyalari. F8 UI uchun amaliy ma'no: switch'dan
  keyin web darhol yangi tokenni ishlatadi, eski token faqat qurilma
  xotirasida qolsa ham refresh qilolmaydi (zanjir o'lik).
- Muvaffaqiyatsiz switch (409/403/401) eski sessiyaga TEGMAYDI — kassir
  ishlashda davom etadi.

### Kiosk-allowlist (F7.4, `4f370f18`)

Yangi qoida **KERAK BO'LMADI** — `/auth` qoidasi `methods: ['*']` ikkala
yo'lni qamraydi (F5 pretsedenti). Bu fakt `kiosk-policy.test.ts`da 2 test
bilan qulflandi (kimdir `/auth`ni toraytirsa darhol qizaradi).
`pos-endpoint-guards.test.ts`ga 2 marshrutning qo'riqchi-testlari qo'shildi:
JWT majburiy, `@RequirePermission` ataylab yo'q (kiosk kassirida
employee-huquqlari yo'q va bo'lmasligi kerak).

## 3. Testlar

- `pos-login.service.test.ts` (Edit): **+17** — 5 candidates (mezon-shakl,
  sir-yo'qligi, 403×2, javob shakli), 12 switch (javob-shakl F8 shartnomasi,
  strict-body, 403 kiosk/tenant/a'zolik, 409 + tartib, PIN-401 + audit
  yozilmasligi, bloklangan xodim, audit-tarkib, refresh-bekor, hisoblagich
  tozalash, qurilma-yo'l).
- `kiosk-policy.test.ts` (Edit): +2 allowlist-qulf.
- `pos-endpoint-guards.test.ts` (Edit): +2 qo'riqchi-test.
- Mavjud test-fayl ustidan Write ishlatilmadi (faqat Edit).

## 4. Gate (to'liq, raqamlar aynan)

| Gate | Natija |
|---|---|
| `pnpm typecheck` | 10/10 ✓ (0 xato) |
| `pnpm lint:product` | 0 error, 1053 warning (policy: warnings allowed) ✓ |
| `pnpm i18n:gate` | 19/19 ✓ (web'ga tegilmagan — o'zgarish yo'q) |
| `pnpm --filter @moysklad/web test` | **3945 passed**, 26 skipped (279 fayl) ✓ — F6-baseline bilan aynan teng, web-regress yo'q |
| `pnpm --filter @moysklad/api test` | **8288 passed**, 2 skipped (596 fayl) ✓ — F5-baseline 8267 + 21 yangi (5 candidates · 12 switch · 2 kiosk-qulf · 2 qo'riqchi) |

Eslatma (halollik): birinchi gate-yugurishda web (8 test) va api (3 fayl)
yiqildi — ikkala to'liq suite **parallel** yugurtirilgan edi (resurs-raqobat:
setup 1307s). Yakka qayta yugurishda ikkalasi ham to'liq yashil — yiqilishlar
yuk-flake ekani isbotlandi; gate natijalari KETMA-KET yugurishlardan olindi.

**Konvensiya-qo'riqchilar tutgan 2 haqiqiy kamchilik** (to'liq suite'siz
o'tib ketardi — `changed-tests-gate-misses-convention-guards` sabog'i yana
tasdiqlandi):
1. `mutation-guard-coverage` (api): `switchPosCashier` guard-siz mutatsiya —
   `INTENTIONALLY_OPEN` ga sabab bilan kiritildi (himoya servisda, tartib
   hujjatlangan).
2. `use-audit-labels` (web): yangi `pos-cashier-switch` audit-slug'i tarix
   oynasida xom ko'rinardi — `audit.action_pos_cashier_switch` ru+uz
   qo'shildi. **Rejadan og'ish (ochiq):** «Web'ga TEGMA» sharti bor edi;
   bu F8-UI ishi EMAS, BE-slug uchun gate-majburiy i18n yorlig'i — 2 qator,
   boshqa web fayliga tegilmagan.

## 5. CHALA / keyingi fazalarga

- **F8 (web):** kassir-tanlash ekrani, smena-mode tugmasi, pos-pin-lock
  moslashuvi — bu faza web'ga ATAYLAB tegmadi. F8 uchun tayyor kontraktlar:
  `GET /auth/pos-pin/candidates` → `{ cashiers }`; `POST /auth/pos-pin/switch`
  → login-javob; 401 javobida `remaining`/`lockout` (pos-pin-lock'dagi mavjud
  xulq bilan bir xil).
- Switch'da `shellVersion` qabul qilinmaydi (pos-login'da bor) — almashinuv
  ishlayotgan qobiq ichida bo'ladi, versiya boot-login'da allaqachon qayd
  etilgan (YAGNI). Kerak bo'lsa F8/F9'da qo'shish arzon.
- Target kassirning BOSHQA qurilmadagi ochiq sessiyasi switch'ni bloklamaydi
  — u smenani ochmoqchi bo'lganda mavjud `openSessionFromSmena` 400/409
  beradi (P4 xabari). Bu ataylab: switch autentifikatsiya, smena-siyosat emas.
- `attempts` hisoblagichi xotirada (mavjud dizayn) — API restart nolga
  tushiradi; switch shu hisoblagichni QAYTA ISHLATADI, yangi zaiflik
  qo'shilmadi (hujjatlangan murosa).

## 6. O'LCHANMAGAN (halollik bo'limi)

- Endpointlar real HTTP orqali (Nest boot + Fastify) chaqirilmagan — barcha
  tekshiruvlar unit-darajada (servis + manba-matn qo'riqchilari). Marshrut
  registratsiyasi/`ZodExceptionFilter` 400-tarjimasi runtime'da ko'rilmagan.
- Lockout oqimi jonli ketma-ketlikda (5 marta xato terish) o'lchanmagan.
- Cookie almashinuvi brauzerda kuzatilmagan.
- Bularning barchasi F8 ko'z-tekshiruvi + F9 qurilma-QA qamroviga kiradi.
