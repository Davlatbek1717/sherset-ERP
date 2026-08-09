# MK23 (1-qism) — 1:1 suhbat va o'qitish rejasi: QOIDALAR QATLAMI

**Sana:** 2026-08-09 · **Faza:** MK23 (`docs/REJA-MENEJER-KASSA-2026-08.md`, 4M §8.1/10)
**Status yorlig'i:** ⚠️ **QISMAN — faza YOPILMADI.** Qoidalar qatlami unit-tasdiqlangan
(16 test, mutatsiya-tekshirilgan); **persistensiya, servis, taxta ulanishi va FE YO'Q.**
Browser-smoke YO'Q. «done» / «Phase-1 complete» DEYILMAYDI.

> **Nega bu hisobot alohida faylda, rejaning «HISOBOT JURNALI» ichida emas:**
> `docs/REJA-MENEJER-KASSA-2026-08.md`, `todo.md` va `NEXT.md` — uchalasi ham shu paytda
> **faol parallel sessiyalarning commit qilinmagan tahriri ostida** (CLAUDE.md §6.1: seniki
> bo'lmagan o'zgarishga yozish TAQIQ). Merge retsepti pastda, «Hand-off qarzi» bo'limida.

---

## 1. Nega faza to'liq bajarilmadi (foydalanuvchi qarori bilan)

Sessiya boshida `git status` ish daraxtida **kamida uch parallel sessiyaning** commit
qilinmagan ishini ko'rsatdi:

| Parallel ish | Egallagan fayllar | MK23 ga to'sqinligi |
|---|---|---|
| **MK01** — KPI bonus/jarima | `packages/db/prisma/schema.prisma`, `manager/kpi/*`, migratsiya `20260810030000_*` | MK23 ning 2 ustuni **shu faylga** yozilishi kerak edi |
| **MK05** — jihoz reyestri | `manager/live/accountability.ts`, `hr-employee/offboarding.ts` (+testlari) | «muddati o'tgan suhbat javobgarlik taxtasida» aynan **shu faylga** ulanadi |
| Decimal/COGS refaktori | `analitika/*`, `demand/*`, `shared/decimal*`, ~20 servis | — |

Foydalanuvchidan so'raldi («parallel sessiya faolmi?») → javob: **«Ha — faol, tegmang»**.
Shu sababdan sessiya **faqat yangi fayllar** bilan cheklandi: sxemaga, `accountability.ts` ga
va hujjatlarga TEGILMADI. Yarim-ulangan holat (`orphan-module-dead-feature` bug-klassi)
ataylab **yaratilmadi**: ustunsiz servis yozish typecheck'ni yiqitardi, `DutyInput` ga
`talkOverdueCount?` ni ixtiyoriy qo'shish esa hech qachon to'ldirilmaydigan o'lik maydon
bo'lib qolardi.

## 2. Nima qilindi

**Yangi fayllar (faqat ikkita):**

- `apps/api/src/modules/hr/hr-employee/talk-plan.ts` — sof qoidalar moduli (DB'siz sinaladi)
- `apps/api/src/modules/hr/hr-employee/talk-plan.test.ts` — 16 test

**Asosiy dizayn qarori — YANGI JURNAL OCHILMADI (rejaning talabi).** Reja yozuvi ham
**mavjud** `EmployeeNote` jurnalining qatori, faqat boshqa `kind` bilan:

- `PLAN_KIND.talk = 'talk_plan'` — rejalashtirilgan 1:1 (sana + mavzu)
- `PLAN_KIND.training = 'training'` — o'qitish rejasining bandi

**Yopish UPDATE bilan emas** — natija o'sha rejaga **farzand yozuv** (`parentId`) sifatida
qo'shiladi. Shu tanlov jurnalning append-only shartnomasini buzmaydi: «bajarildi» faktini
kim va qachon yozgani tarixda qoladi, va rejaning o'zi hech qachon tahrirlanmaydi.

**Qulflangan qoidalar (har biri testda):**

| Qoida | Nega shunday |
|---|---|
| **Bekor qilingan natija rejani QAYTA OCHADI** | Natijani xato yozib keyin bekor qilish rejani «bajarildi» holatida qoldirsa, **o'tkazilmagan suhbat jimgina yo'qolardi** — MK23 ning butun ma'nosi shu nuqtada buziladi |
| Boshqa rejaning natijasi bu rejani yopmaydi | `parentId` mos kelmasa — begona yozuv |
| `dueOn = NULL` → ochiq, lekin **hech qachon kechikkan emas** | O'qitish bandiga sana ko'pincha qo'yilmaydi; uni qizil qilish javobgarlik taxtasini yolg'on ogohlantirishga to'ldirardi |
| Bajarilgan/bekor qilingan reja **ogohlantirmaydi** | Kechikkan kun uchun abadiy qizil bayroq ekranni ishlatib bo'lmas holga keltiradi (`probationStatus` dagi bilan bir xil qaror) |
| Reja bo'lmagan turlar (`talk`/`warning`/`praise`) reja deb **sanalmaydi** | Kartaga jurnalning HAMMA qatori tushadi; filtrsiz har ogohlantirish «muddatsiz ochiq band» bo'lib qolardi |
| Sanalar **DATE yorlig'i** bilan solishtiriladi (`dateLabel`, Toshkent) | Pastdagi §3 ga qara — bu qulf mutatsiya-tekshiruvda **yolg'on** chiqdi va qayta yozildi |

`dateLabel()` **qayta ishlatildi** (`onboarding.ts` dan import) — tz qoidasi ikki joyda ikki
xil bo'lsa, ogohlantirish bir kun sakrab ketardi (`month-bounds-label-vs-instant` bug-klassi).
`PLAN_WARN_DAYS = 7` ataylab `EVALUATION_WARN_DAYS` bilan bir xil (TZ'da raqam YO'Q — tanlov
hujjatlashtirilgan).

## 3. Mutatsiya-tekshiruvi — bitta test YOLG'ON chiqdi va tuzatildi

Testlar yashil bo'lgani qulf borligini isbotlamaydi, shuning uchun 6 mutant qo'llandi
(har biri deterministik skript bilan: anchor topilmasa `exit 1`, keyin fayl tiklandi):

| Mutant | Natija |
|---|---|
| bekor qilingan natija ham yopadi | **KILLED** |
| reja-turi filtri o'chirildi | **KILLED** |
| muddatsiz band kechikkan bo'ladi | **KILLED** |
| bajarilgan reja hamon ogohlantiradi | **KILLED** |
| «eng qadimgi kechikkan» → eng yangisi | **KILLED** |
| `dateLabel(now)` → xom `now` (tz qoidasi) | 🔴 **SURVIVED** → test qayta yozildi → **KILLED** |

**Nega yolg'on edi:** dastlabki test `now = 12-avgust 19:30Z` (Toshkent 13-avgust 00:30) olgan
edi. `Math.round` ni hisobga olmaganim uchun xom arifmetika ham, yorliq arifmetikasi ham
**bir xil** `daysLeft = 0` beradi (farq 4.5 soat = 0.19 kun, yaxlitlashda yo'qoladi) — ya'ni
test tz qoidasini umuman tekshirmasdi. Farq ajratadigan holat o'lchab topildi va yozildi:

- `now = 13-avgust 12:30Z` (**Toshkent 17:30, suhbat kuni**) → yorliq: `due` (daysLeft 0) ·
  xom: `-1` = **overdue**. Ya'ni ish kuni davom etayotib taxta «o'tkazib yuborilgan» derdi.
- `now = 12-avgust 12:30Z` (Toshkent 17:30, bir kun oldin) → yorliq: `due_soon` (1) ·
  xom: `0` = «bugun».

`Math.round` → `Math.floor` mutanti SURVIVED, lekin u **ekvivalent mutant**: ikki tomon ham
aniq kun-ko'paytmasi, bo'linma butun son — hech qanday test ularni ajratib bo'lmaydi.
(Bu — `audit-findings-examples-unverified` sabog'ining amaliy takrori: raqamni o'zim o'lchadim,
misolga ishonmadim.)

## 4. Gate natijasi (HALOL)

| Gate | Natija |
|---|---|
| `vitest run src/modules/hr/hr-employee/talk-plan.test.ts` | ✅ **16/16** (RED ko'rildi: modul yo'q ⇒ 0 test → GREEN) |
| `biome check` (2 faylim) | ✅ 0 xato (`organizeImports` 1 xato topildi va tuzatildi) |
| `hr-employee` modul regressiyasi | ✅ **212/212** (12 fayl) — mening 16 tam ichida, regress yo'q |
| `pnpm --filter @moysklad/api typecheck` | ✅ **0 xato** |
| `i18n:gate` | ⏭️ Yugurtirilmadi — sababi: UI matni tegilmadi, modul **hech qanday ekran matni saqlamaydi** (`topic` ma'lumotdan keladi, `LABELS` mapi yo'q) |

⚠️ **O'lchov oynasi (halol qayd).** Sessiya o'rtasida ikkala gate ham QIZIL edi va sabab men
EMAS edim: parallel MK05 sessiyasi `offboarding.ts`/`accountability.ts` sof modullariga
`openEquipmentCount` qo'shib, chaqiruvchilarini hali yangilamagan edi (typecheck 2 xato ·
`offboarding.service.test.ts` 3 yiqilish). Men ishlayotgan payt o'sha sessiya ulashni tugatdi
va oxirgi o'lchov yashil chiqdi. **Ish daraxti jonli** — yuqoridagi yashil natijalar
2026-08-09 sessiyasining OXIRIDAGI holat; keyingi sessiya gate'ni o'zi qayta o'lchashi kerak
(§6.1 bo'yicha men ularning fayllariga tegmadim).

## 5. Nima QILINMADI (keyingi sessiya uchun aniq retsept)

Tartib muhim: **MK05 va MK01 commit qilinganidan KEYIN** boshlanadi (ikkalasi ham MK23 ning
fayllariga tegadi).

1. **Sxema** (`packages/db/prisma/schema.prisma`, `model EmployeeNote`) — ikki nullable ustun:
   - `dueOn DateTime? @map("due_on") @db.Date` — rejalashtirilgan sana (yorliq semantikasi;
     `talk-plan.ts` shunday kutadi)
   - `parentId String? @map("parent_id") @db.Uuid` + self-relation (`onDelete: SetNull`) —
     natijani rejaga bog'lash
   - indeks: `@@index([accountId, dueOn])` — taxtaning «kechikkanlar» so'rovi uchun
     (⚠️ `index-needs-matching-query-shape`: so'rov shakli indeksga mos bo'lsin)
   - migratsiya: yangi papka, **lokal DB'ga qo'llash umumiy resurs** (§6.4) — yolg'iz sessiyada;
     prod (`sherset_v2`) uchun DDL rejadagi «OPS-QADAMLAR» ro'yxatiga yoziladi
2. **Kind validatsiyasi:** `employee-note.ts` → `addNote` faqat `talk`/`warning`/`praise` ni
   qabul qiladi. Reja turlari **alohida** endpoint bilan yozilsin (`dueOn`/`topic` majburiy),
   `isNoteKind` ga qo'shib qo'yish `dueOn`siz «reja» yaratish yo'lini ochardi.
   Shu bilan birga `summarizeNotes()` ni tekshir: reja qatorlari jurnal `total`ini
   shishirmasligi kerak (hozir sanaydi).
3. **Servis + controller:** `POST hr/employees/:id/talk-plans` (reja) ·
   `POST .../talk-plans/:planId/outcome` (natija = farzand yozuv) · bekor qilish **mavjud**
   `voidNote` orqali (yangi yo'l kerak emas).
4. **Xodim kartasi:** `employee-card.service.ts` → `summarizePlans(...)` natijasini `plans`
   bloki sifatida qo'sh (rejaning 3-testi: «o'qitish bandi tugallanmasa ochiq turadi»).
   ⚠️ `DocumentEditor prop-drop` bug-klassi: FE'ga prop **uzatilganini** ham tekshir.
5. **Javobgarlik taxtasi:** `accountability.ts` → yangi `DUTY.talkOverdue`, `DutyInput` ga
   `overdueTalkCount` + `live-status.service.ts` da to'ldirish (`summarizePlans().overdueTalks`).
   ⚠️ Belgi: bu **menejerning** qarzi (xodimning emas) — yorlig'i shunday yozilsin.
6. **FE + i18n:** karta tabida rejalar bloki, ru+uz kalitlar. ⚠️ `i18n-gate-blind-to-components`
   — `components/` ni gate ko'rmaydi, qo'lda tekshir.
7. **Phase-2 QA:** MK25 (M2 QA) ga qo'shiladi.

## 6. Hand-off qarzi (BAJARILMADI — sabab: fayllar parallel sessiyada)

Uchala qadam ham mexanik; MK01/MK05 commit qilingach bajarilsin:

- `docs/REJA-MENEJER-KASSA-2026-08.md`: MK23 sarlavhasidagi `☐ HISOBOT` **hamon `☐`** — faza
  yopilmagani uchun bu **to'g'ri holat**. Shu fayl oxiridagi «HISOBOT JURNALI»ga shu hisobotning
  qisqartmasi + havolasi `appendFileSync` bilan qo'shilsin (⚠️ `doc-append-marker-truncation`:
  marker bo'yicha kesish TAQIQ, qator-sonini tekshir).
- `todo.md`: MK23 katakchasi **`[ ]` qoladi** (qisman ish), lekin «qoldiq bosqichlar» izohiga
  «qoidalar qatlami tayyor» belgisi qo'shilsin.
- `NEXT.md`: top-entry — ushbu fayl havolasi + §5 retsepti.

**Preflight qo'shimchasi (o'lchangan, tuzatilmagan):** `scripts/preflight.mjs` «NEXT.md
top-entry'larda git'da YO'Q hash'lar: a0b44c73, 9c046ac2» deb ANOMALIYA berdi — ikkisi ham
**soxta ogohlantirish**: `a0b44c73…` = hisobot matnidagi **tovar kodi**, `9c046ac2` = FE-dedup
yozuvidagi **md5**. Ekstraktor prozadagi 8-belgili hex'ni commit-hash deb oladi. Skript
parallel sessiya ishi ostida bo'lganidan tuzatilmadi (o'z qarzi sifatida qayd etildi).
