# Faza F3 — Qurilma reyestri (server tomoni) · 2026-08-13 · `2b56504f`

**Holat:** ✅ to'liq (Phase-1: strukturaviy, runtime-tasdiqlanmagan)

**Yopilgan ID'lar:** K07

**Nima o'zgardi:**
- `PosDevice.shellVersion` (`shell_version VARCHAR(32) NULL`) — qurilmadagi Electron
  qobig'i versiyasi endi har muvaffaqiyatli pos-login'da bazaga yoziladi. Sabab: «kassa-2
  da qaysi exe?» savoli hozirgacha faqat telefon orqali javob topardi.
- `registerSuccess(deviceId, shellVersion?)` — `undefined` bo'lsa ustun TEGILMAYDI:
  brauzerdan kirish (qobiq versiyasi yubormaydi) reyestrni NULL bilan o'chirib yubormasin.
  Buni alohida test qo'riqlaydi.
- `PosLoginSchema.shellVersion?: string (max 32)` — ixtiyoriy, hech qanday qarorga ta'sir
  qilmaydi, faqat qayd.
- Web `auth-store.posLogin` tanasi endi `electronAPI.isSherset && electronAPI.version`
  bo'lsa `shellVersion`ni yuboradi; brauzerda maydon umuman ketmaydi.

**Fayllar:**

| Yo'l | Nima qilindi |
|---|---|
| `packages/db/prisma/schema.prisma` | `PosDevice.shellVersion String?` (lastSeenAt'dan keyin) |
| `packages/db/prisma/migrations/20260813120000_pos_device_shell_version/migration.sql` | Qo'lda yozilgan `ALTER TABLE` (sabab: pastda «chetlanishlar») |
| `apps/api/src/modules/auth/pos-device.service.ts` | `registerSuccess` ikkinchi ixtiyoriy parametr |
| `apps/api/src/modules/auth/pos-device.service.test.ts` | +2 test (K07 yozadi · undefined ustidan yozmaydi) |
| `apps/api/src/modules/auth/auth.schema.ts` | `PosLoginSchema.shellVersion` |
| `apps/api/src/modules/auth/pos-login.service.ts` | `registerSuccess(device.id, input.shellVersion)` |
| `apps/api/src/modules/auth/pos-login.service.test.ts` | Mavjud imzo-assert yangilandi + wiring testi (input → chaqiruv) |
| `apps/web/src/lib/auth-store.ts` | `shellVersion()` helper + payload; qo'riqchi shakli saqlangan |
| `docs/progress.json` | pre-commit hook avtomatikasi (men stage qilmaganman — hook o'zi qo'shadi) |

**Testlar:** yangi 3 ta (pos-device 2 + pos-login wiring 1), o'zgargan 1 ta (pos-login imzo).
RED tartibi: K07 testi implementatsiyadan OLDIN yozilib yiqilgani ko'rildi (aynan
`shellVersion` yo'qligi sababli); pos-login imzo-testi ham o'zgarishdan keyin avval qizarib,
yangilangach yashil bo'ldi. «undefined ustidan yozmaydi» testi tabiatan boshdan yashil
(qo'riqchi-test) — bu kutilgan.

**Gate:** typecheck 10/10 ✓ · lint:product 0 error ✓ · i18n:gate 19/19 ✓ ·
web vitest 268 fayl / 3805 ✓ · api vitest 595 fayl / 8252 ✓
Commitdan keyin `git show --stat HEAD` tekshirildi: 8 mening faylim + hook'ning
`docs/progress.json`i — begona fayl YO'Q.

**O'LCHANGAN vs O'LCHANMAGAN:**
- ✅ o'lchangan: prod (`sherset_v2`) `SELECT count(*) FROM pos_devices WHERE revoked_at
  IS NULL;` → **3** — reyestr TIRIK (uxlab turgani yo'q), faza to'liq foydali.
- ✅ o'lchangan: migratsiya lokal `climart_adopt`ga qo'llandi va
  `SELECT shell_version FROM pos_devices LIMIT 1` bilan ustun mavjudligi tasdiqlandi.
  `prisma migrate diff --from-schema-datasource --to-schema-datamodel` da `shell_version`
  bo'yicha drift 0 (qo'lda yozilgan SQL sxemaga aynan mos). Diff'da 3 ta MENDAN OLDINGI,
  aloqasiz lokal drift ko'rindi (`roles_account_id_template_slug_idx` drop,
  `sales_plans.updated_at` default, bitta indeks nomi) — tegilmadi.
- ⚠️ o'lchanmagan: haqiqiy exe'dan login qilib bazada versiya paydo bo'lishi — F8'da
  (browser-smoke YO'Q, qurilmada sinalmagan).
- ⚠️ o'lchanmagan: **migratsiya PRODGA QO'LLANMAGAN** — bu F8 qarzi. Prod'da ustun
  yo'qligi sabab, yangi API kod prodga F8'dan OLDIN deploy qilinsa pos-login'da
  Prisma «column does not exist» bilan yiqiladi — deploy tartibi: avval migratsiya,
  keyin API (F8 baribir shunday qiladi).

**Nima QILINMADI va nega:**
- `apps/web/src/app/(app)/settings/**` — qurilmalar ro'yxati sahifasi repo'da MAVJUD EMAS
  (`PosDevice`ga tegishli hech qanday settings-sahifa topilmadi), shuning uchun «ustun
  qo'shish» bandi qo'llanmadi. Versiyani hozircha faqat SQL bilan ko'rish mumkin.
- `prisma migrate dev` ISHLATILMADI: shadow-DB'da tarixdagi
  `20260806120000_add_product_cell_link` toza bazaga qayta qo'llanmaydi (P3006, `products`
  jadvali hali yo'q bosqichda ishga tushadi) va lokal `climart_adopt`da `_prisma_migrations`
  tarixi umuman yo'q (225 migratsiya «not yet applied»). Repo konvensiyasi bo'yicha
  migratsiya qo'lda yozildi (SQL Prisma generatsiyasi shakliga mos) va lokalga
  `prisma db execute` bilan qo'llandi.
- `kassa-kirish-wiring.test.ts` qo'riqchisi (ruxsat ro'yxatidan tashqari fayl)
  O'ZGARTIRILMADI — aksincha, `auth-store` tanasi qo'riqchi talab qilgan
  `creds ? {…, pin} : { pin }` shakliga moslab yozildi (semantika bir xil).

**Keyingi fazaga eslatma / ochiq xavf:**
- F8: `20260813120000_pos_device_shell_version` prodga qo'llanishi SHART (API deploy'idan
  oldin). Prod'dagi `_prisma_migrations` holati deploy'dan oldin tekshirilsin —
  lokaldagidek tarix-drift bo'lsa `migrate deploy` kutilmagan ro'yxatni qo'llashga urinadi
  (xotira: `sherset-v2-schema-drift`).
- Qobiq (desktop) tomoni allaqachon tayyor edi: `preload.js:24` `version`ni beradi —
  F3 hech qanday desktop o'zgarishisiz ishlaydi (shu sabab `desktop/` ga tegilmagan).
- Versiyani operator ko'radigan UI yo'q — xohlansa keyingi rejalarga «settings'da
  qurilmalar ro'yxati» sifatida kiritilsin.

**TO'XTADIM.** Keyingi faza — F4. Uni boshlash uchun yangi sessiya kerak.
