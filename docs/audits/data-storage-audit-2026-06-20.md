# Ma'lumot saqlash — to'liq audit (2026-06-20)

> **Manba:** `data-storage-audit` workflow — 5 ta agent kodni parallel o'qidi (4 probe + 1 synthesis),
> 468k token, 145 tool-call. **51 ta saqlash-joyi + 23 red-flag** topildi, har biri `file:line` bilan
> asoslangan. Savol: *«to'liq barchasi ma'lumot bazasidami, qayerda saqlanadi?»*

---

## ⭐ Xulosa (sodda til — biznes egasi uchun)

Deyarli **butun real biznes-ma'lumotingiz** (mijozlar, buyurtmalar, tovarlar, ombor, pul, hisob-fakturalar,
hatto **yuklangan fayllar va rasmlar**) **bitta PostgreSQL bazasida** yotadi va server o'chib-yonsa ham
**yo'qolmaydi**. Bazadan tashqarida faqat **zararsiz shaxsiy sozlamalar** (ustun ko'rinishi, til, login token)
saqlanadi — ularni yo'qotsangiz, faqat sozlama tiklanadi yoki qayta kirasiz, biznes-ma'lumot yo'qolmaydi.

Moysklad tokeni — jonli ilovaning ma'lumot manbai **EMAS**: u faqat bir martalik **"nusxa ko'chirgich"** —
dasturchi real ma'lumotni bir marta o'z bazamizga ko'chiradi, keyin ilova butunlay mustaqil o'z bazasida ishlaydi.

**Halol ogohlantirishlar (3 ta):**
1. **Bu hozir dasturchining LOKAL bazasi** — production server emas, professional backup yo'q. Backupsiz
   yo'qolsa — ma'lumot yo'qoladi. Biznesga tayanishdan oldin production deploy + backup kerak.
2. **Ba'zi amallar tugallanmagan (stub):** onlayn-buyurtma → mijoz-buyurtmaga aylantirish soxta havola yasaydi
   (real buyurtma yaratmaydi); Marking/EDO/e-faktura lokal yozuvni saqlaydi, lekin tashqi davlat organiga
   haqiqatan yubormaydi.
3. **iPhone / Samsung / AirPods** — namuna (demo) ma'lumot, real tovar emas.

---

## 1. Qaysi bazalar ishlatiladi

| Baza | Qayerda | Roli |
|------|---------|------|
| **PostgreSQL `moysklad_dev`** | `localhost:5433` | **Yagona haqiqat manbai** — Prisma ORM orqali kiriladi |
| PostgreSQL `moysklad_shadow` | lokal | Faqat Prisma migratsiya soyа-bazasi — **app ma'lumoti yo'q** |

- **185 ta Prisma modeli · 133 ta SQL migratsiya** — hammasi bitta Postgres datasource'dan o'tadi.
- **Konteyner yo'q:** repo'da `docker-compose.yml`/`Dockerfile` yo'q — Postgres native lokal o'rnatma.
- **`survivesRestart: true`** — baza diskka yozadi, restart'da yo'qolmaydi.

## 2. Biznes-ma'lumot — hammasi bazada (`businessDataAllInDb: true`)

Quyidagilarning **barchasi** DB-backed:
- Kontragentlar · mijoz-buyurtmalar + pozitsiyalar · ta'minot-buyurtmalar · tovarlar/variantlar/komplektlar
- Har hujjat turi (otgruzka, postupleniye, hisob-faktura, kassa/to'lov, qaytarish, ko'chirish, chakana, ishlab chiqarish)
- **Ombor:** append-only `StockOperation` ledger + materializatsiyalangan `Stock` qoldiq + rezervlar
- Pul ledgerlari · audit-log · hujjat-raqami ketma-ketliklari
- **Yuklangan fayllar:** hujjat-ilovalar + tovar-rasmlari **`bytea` (binary) ustun** sifatida bazada
  (diskda yoki S3'da emas — `attachment.service.ts:115`)

## 3. Bazadan TASHQARIDA nima bor (zararsiz)

| Joy | Nima | Izoh |
|-----|------|------|
| Browser `localStorage` | ustun ko'rinishi (`ms:column-visibility:*`), ustun kengligi, print-rejim, mavzu | Faqat sozlama |
| Browser cookie | til (`NEXT_LOCALE`), refresh-token (`ms_rt`, HttpOnly) | Token'ning hash'i DB'da ham bor |
| Browser xotira (JS) | JWT access-token | XSS himoyasi uchun ataylab; reload'da refresh'dan qayta olinadi |
| Server xotira | 5-daqiqali permission-kesh, realtime notification push-kanali (RxJS), PDF-render navbati, HR-Telegram pool | Hammasi DB'dan qayta tiklanadi; **notification yozuvlari avval DB'ga saqlanadi** |

## 4. Real moysklad API roli — runtime EMAS (`realMoyskladApiRole`)

- `api.moysklad.ru` **faqat qo'lda CLI skriptlar** (`seed-real.ts`, `sync-from-moysklad.ts`) tomonidan chaqiriladi —
  real climart akkountni bir marta tortib, Postgres'ga upsert qiladi (`ms:<uuid>` tegi bilan).
- Ishlayotgan API yoki web'da **request/page yo'lida moyskladga BITTA ham chaqiruv yo'q** (grep bilan tasdiqlangan).
- Yagona haqiqiy runtime tashqi chaqiruv — **`cbu.uz`** (markaziy bank valyuta kursi), DB'ga keshlanadi. Moysklad emas.

## 5. Mock / stub / tugallanmagan (`mockedOrInMemory`)

- **Demo data** (iPhone/Samsung/AirPods + `СФ-00001` kabi fiks-UUID hujjatlar) — `seed.ts`'da qattiq yozilgan,
  `pnpm db:seed` bilan bir marta Postgres'ga yoziladi. **DB'da bor + bardoshli**, lekin namuna fixtura.
- **Online-order → customer-order** — STUB: soxta `randomUUID()` saqlaydi, real buyurtma **yaratmaydi**
  (`online-order.service.ts:175-199`).
- **Marking (ASL Belgisi) / EDO / e-faktura imzo** — lokal DB-ledger real, tashqi provayder chaqiruvi stub.
- **App-marketplace katalogi** — kodda qattiq massiv (DB-jadval yo'q); o'rnatish-holati DB'da saqlanadi.
- `document-sequence.mock.ts` — faqat **test** uchun; production'da real DB-counter ishlaydi.

## 6. Red flags (23 — to'liq ro'yxat)

**Production / durability:**
1. Konteyner yo'q (docker-compose/Dockerfile yo'q) — durability dasturchining lokal PG data-katalogiga bog'liq.
2. `.env.example` 5432-portni, haqiqiy `.env` 5433-ni ishlatadi — yangi contributor bo'sh/noto'g'ri bazaga uradi.
3. `.env.example`'da Redis/MinIO-S3/SMTP yozilgan, lekin **ulanmagan** (package.json'da dependency yo'q) — bugun hammasi Postgres orqali.
4. Faqat lokal dev baza; production deploy/backup/HA **yo'q**.
5. Barcha fayllar Postgres `bytea` ichida — to'g'ri, lekin masshtabda DB/backup shishadi.

**Xavfsizlik:**
6. Haqiqiy tokenlar working-tree `.env` fayllarda (`apps/api/.env:16` MOYSKLAD_TOKEN, `.env.local` REAL tokenlar + HR_SESSION_KEY) — gitignore'da, lekin git'ga tushmasligi nazorat qilinishi shart.
7. Token env-nomlari skriptlar orasida nomuvofiq (MOYSKLAD_TOKEN vs MOYSKLAD_REAL_API_TOKEN) — server hech birini o'qimaydi.

**Tugallanmagan biznes-amallar (stub):**
8. Online-order → customer-order konvertatsiyasi = soxta UUID, real order yo'q.
9. EDO `submit()` = `STUB-...` providerEhfId, real provayderga yubormaydi.
10. Marking allocate/verify/retire = Soliq'ga chaqirmaydi (lokal ledger real).
11. `CustomerOrder.markPrinted` real `printed` flag'ni o'zgartiradi, lekin PDF-render hali qurilmagan.
12. `reject()` rad-sababini saqlamaydi (V2 ustun).

**Seed / import:**
13. `pnpm db:seed` faqat `seed.ts` (3 demo tovar) — 2 678 ta real kontragentni YUKLAMAYDI; `seed-real.ts` qo'lda `tsx` bilan ishga tushiriladi.
14. CLAUDE.md/MEMORY `seed-real`/`seed:real` skriptga ishora qiladi, lekin package.json'da faqat `db:seed` ulangan (doc drift).
15. `seed-real.ts` fidelity caveat: float→BigInt `Math.round(v*100)` drift; out-of-set FK birinchi kontragent/org/store'ga tushadi; `applicable`→`posted` (real FSM emas).

**Masshtab / resilience (data-loss EMAS):**
16. Notification realtime = bitta in-process RxJS Subject — ko'p-instansli API'da boshqa node'dagi push tushib qoladi (yozuvlar DB'da, badge qayta tiklanadi).
17. HR-Telegram client-pool + login OTP wizard = process-xotirada, single-instance; restart ulanishni uzadi (yakuniy session DB'da shifrlangan).
18. App-marketplace katalogi qattiq-kodda — yangi app qo'shish = deploy, ma'lumot o'zgarishi emas.
19. Access-token in-memory + har refresh'da rotatsiya — cross-tab race ochiq (documented).

**Boshqa (by-design):**
20. `APP_CATALOG` qattiq metadata (install-holati saqlanadi).
21. PermissionsService 5-daqiqali in-memory kesh (DB-manbali, role o'zgarganda invalidate).
22. `LOW_STOCK_THRESHOLD=5` — sozlash konstantasi, soxta ma'lumot emas.
23. localStorage yozuvlari quota/private-mode xatosini jim yutadi — to'g'ri fallback, biznes-ma'lumot bog'liq emas.

---

## 7. Yakuniy hukm

Ma'lumot **puxta tashkillangan va bitta bazada bardoshli** saqlanadi — lekin hozircha **ishonchli dev-tizim**.
Biznesga to'liq tayanishdan oldin: **(1)** real backup bilan production deploy · **(2)** stub-amallarni
yakunlash (online-order konvertatsiya, EDO/marking real ulanish) · **(3)** `.env` port-drift + sirlarni tartibga solish.
