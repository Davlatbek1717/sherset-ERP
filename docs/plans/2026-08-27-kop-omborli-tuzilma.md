# Ko'p omborli tuzilmaga o'tish (7+ ombor) — M-REJA

> **Yaratilgan:** 2026-08-27 · **Buyurtmachi:** Ozodbek (egasi) ·
> **Holat:** **M0 ✅ reja tuzildi** · **S-M1 ✅ javob olindi** ·
> **M1 ⚠️ QISMAN — jonlida bajarildi 2026-08-30, ertalabki takroriy tekshiruv (javobgar shaxs) qoldi** ·
> M2…M8 boshlanmagan
>
> **Nega bu reja bor:** 2026-08-27 05:32–05:37 da egasi jonlida **Ombor 03,
> 04, 05, 06, 07** ni yaratdi va yaqin kunlarda ularga tovar joylashtirishni
> rejalashtirmoqda. Bugungi jonli holatda **bu tovar kassaga ko'rinmas bo'ladi**
> (sabab 3-bo'limda, o'lchov bilan). Ya'ni 2026-08-24 dagi «kassa 46 daqiqa
> to'xtadi» hodisasining mexanizmi **qayta kutmoqda**.
>
> Bu reja o'sha o'tishni **bosqichma-bosqich va xavfsiz** qiladi. U
> `2026-08-24-split-kassa-hodisasi.md` dagi **H3** va **H4** fazalarining
> amaliy davomchisi: H4 «split'ni xavfsiz qayta yuritish» deb mavhum qo'yilgan
> edi, bu yerda u **ijro qilinadigan fazalarga** bo'lingan.

---

## 1. O'ZGARMAS QOIDALAR (har sessiya uchun)

> Bu bo'lim egasining 2026-08-27 dagi talabi bilan yozildi va **muhokama
> qilinmaydi.**

1. 🔴 **BITTA SESSIYA = BITTA FAZA.** Faza tugagach agent **KEYINGISINI
   BOSHLAMAYDI** — hisobot yozadi va **TO'XTAYDI**. Sabab: kontekst o'sishi
   bilan token sarfi oshadi. Bu qoidaning istisnosi YO'Q.
2. **Ishni boshlashdan avval** agent shu faylni TO'LIQ o'qiydi (ayniqsa
   avvalgi fazalar hisobotlarini) va **o'z fazasi vazifalaridan tashqariga
   chiqmaydi**.
3. **Ikki tomonlama bog'liqlik (F-reja qoida 10).** Jonli ma'lumotni yoki
   jonli XULQni o'zgartiradigan faza boshlanishidan oldin agent quyidagilarni
   ham o'qiydi: `2026-08-23-ombor-restrukturizatsiya.md` (ayniqsa 2-bo'lim —
   14 qoida), `2026-08-23-omborchi-tsd-mijozlar.md`,
   `2026-08-24-split-kassa-hodisasi.md`, `2026-08-25-bolinadigan-tovar-bolak-hisobi.md`.
   So'ng hisobotda **«bu o'zgarish qaysi mavjud oqimni buzishi mumkin?»**
   savoliga YOZMA javob beradi. «Buzmaydi» deyish ham **dalil bilan** yoziladi.
4. **Testlar majburiy:** typecheck (api'da OOM bo'lsa
   `NODE_OPTIONS=--max-old-space-size=8192`), `apps/api` va `apps/web` vitest
   (kamida o'z moduli + i18n gate'lar: `i18n-key-existence`,
   `i18n-no-hardcoded`), yangi mantiqqa **yangi testlar**. Barcha matnlar i18n
   orqali (ru+uz).
5. 🔴 **HISOBOT MAJBURIY.** Ish oxirida agent shu faylning **«HISOBOTLAR»**
   bo'limiga (10-bo'lim) o'z fazasi ostiga yozadi: nima qilindi (fayllar,
   commitlar), test natijalari **raqam bilan**, deploy holati, ochiq
   qolganlar, keyingi fazaga eslatmalar.
6. **Qabul mezoni — yopish sharti (F-reja qoida 11).** Qabul mezonining biror
   bandi bajarilmasa faza **«TUGADI» deb yopilmaydi**; holati **«QISMAN»**
   bo'ladi. Mezonni uchinchi shaxsga o'tkazish — yopish EMAS.
7. **Qaytarish yo'li majburiy (qoida 12).** Jonli ma'lumotni o'zgartiradigan
   har skript bilan birga uning **TESKARISI** o'sha sessiyada yoziladi, lokal
   dev bazada sinaladi va hisobotda **buyrug'i bilan** ko'rsatiladi.
8. **Jonli o'zgarishdan keyin uchma-uch smoke (qoida 13):** bitta sinov
   **SOTUV** (post → tekshir → cancel), bitta yacheyka **SANASH**, bitta
   **KO'CHIRISH**. «Sahifa 200 + log toza» YETARLI EMAS. Ish soatidan tashqari
   qilingan o'zgarish **savdo boshlanishidan oldin** qayta tekshiriladi.
9. **Jonli holat reyestri (qoida 14):** jonli holatga har tegilganda
   `docs/ops/jonli-holat.md` **o'sha kuni** yangilanadi — JSON bloki, jadval
   VA «O'zgarishlar jurnali» qatori.
10. **Maxfiy ma'lumot bu faylga YOZILMAYDI** (repo public): parollar,
    tokenlar, loginlar. VPS kirishlari egasidan so'raladi.
11. **Git:** commitlar `yacheyka-inventarizatsiya` branch'ida, push →
    `mirfayz` remote. Ishlar faqat `D:\sherset-v2` da.
12. **Kunduzi jonli o'zgarish YO'Q.** Savdo 05:00–20:00. Ombor/qoldiq/kassaga
    tegadigan har amal **20:00 dan keyin**, va **04:30 gacha tugaydi**.

---

## 2. Maqsad-arxitektura

| Egasida | Kod segmenti | Tizimda |
|---|---|---|
| Ombor (7+, o'sadi) | 1-chi | `Store` («Ombor 01» … «Ombor 07») |
| Stelaj | 2-chi | `StoreZone` (ombor ichida) |
| Qavat + o'rin | 3–4-chi | yacheyka kodida (`StoreCell.name`) |

- **«Taqsimlanmagan»** — yacheykaga biriktirilmagan qoldiq hovuzi. O'tish
  tugagach u faqat hovuz bo'lib qoladi, kassa ombori bo'lmaydi.
- **«Ombor 99»** — BRAK. Kaskadga HECH QACHON kirmaydi.
- **«Ombor 07»** — «Kassa oldidagi ombor» (`__posFrontStore`): yolg'iz qoplasa
  **birinchi**, bo'linishda **eng oxirgi**.

---

## 3. 🔴 BOSHLANG'ICH JONLI HOLAT (2026-08-27 15:00–16:30 da o'lchandi)

Bu bo'lim **o'lchov**, taxmin emas. Keyingi fazalar undan boshlanadi.

### 3.1 Omborlar

| Ombor | id (qisqa) | Yaratilgan | Yacheyka | Qoldiq | `__posPriority` | Boshqa bayroq |
|---|---|---|---|---|---|---|
| Taqsimlanmagan | `968f9da2` | 2026-07-25 | **974** | **51 229 696,41** | **1** | `__cellInventory: false` |
| Ombor 01 | `7400bf94` | 2026-08-23 | 0 | 0 | **yo'q** | — |
| Ombor 02 | `01662dbe` | 2026-08-23 | 0 | 0 | **2** | — |
| Ombor 03 | `1e5df878` | **2026-08-27 05:32** | 0 | 0 | **yo'q** | `__cellInventory: true` |
| Ombor 04 | `b628f0d0` | **2026-08-27 05:33** | 0 | 0 | **yo'q** | `__cellInventory: true` |
| Ombor 05 | `75878ad6` | **2026-08-27 05:34** | 0 | 0 | **yo'q** | `__cellInventory: true` |
| Ombor 06 | `ed80b5ce` | **2026-08-27 05:35** | 0 | 0 | **yo'q** | `__cellInventory: true` |
| Ombor 07 | `02016d74` | **2026-08-27 05:37** | 0 | 0 | **yo'q** | `__cellInventory: true` |
| Ombor 99 (BRAK) | `d4b4ff85` | 2026-08-26 22:52 | 27 | 0 | yo'q (ataylab) | `__brakStore: true` |

Yacheykalardagi qoldiq: **1 426 457**; yacheykasiz ≈ **49,8 mln** (~97 %).

### 3.2 🔴 XAVF — nega bu reja shoshilinch

`apps/api/src/modules/retail-sale/retail-allocation.ts:214`:

    const cascade = stores.filter((s) => s.posPriority !== null && !s.isBrak)

**Prioriteti yo'q ombordagi qoldiq taqsimotga UMUMAN ko'rinmaydi.** Ombor
01 va 03–07 da prioritet yo'q ⇒ **birinchi tovar tushgan zahoti kassa uni
sotolmaydi.**

Battari yomoni — xabar YOLG'ON bo'ladi. `buildShortfallMessage` da ikkita
sabab bor (`insufficient` · `no-single-source`), **uchinchisi — «tovar BOR,
lekin POS yeta olmaydi» — YO'Q**. Shuning uchun kassir quyidagini ko'radi:

> «Tizimdagi hech bir omborda yetarli miqdor yo'q»

Bu 2026-08-24 stsenariysida **noto'g'ri gap**: tovar bor, u shunchaki
kaskaddan tashqarida. Kodning o'zi `no-single-source` uchun aynan shu xatoni
**ataylab** oldini olgan («„Yetmaydi" deyish YOLG'ON bo'lardi»), lekin bu
mulohaza uchinchi holatga tatbiq etilmagan. **M2 aynan shuni yopadi.**

### 3.3 Boshqa o'lchangan haqiqatlar

- **Reyestr eskirgan:** `docs/ops/jonli-holat.md` da **4 ombor**, jonlida
  **9 ta**. Ombor 03–07 hech qayerda yozilmagan (`reyestrda-yoq` drifti —
  `ogohlantirish` darajali, `EXIT` ni buzmaydi).
- **Serverdagi reyestr nusxasi bundan ham eski** (`61780120` dan) ⇒
  `warehouse-state.ts` jonlida `EXIT=2` beradi va bu **kutilgan**.
- **Yig'ish topshirig'i ombor raqamini `Store` dan EMAS, yacheyka kodidan
  oladi** (`skladNoOf(cell)` + `skladKeeper`) — ya'ni ombor kesimi bugun
  ham ishlaydi. **Lekin** topshiriq `product.attributes.__yacheyka`
  TAXMINIDAN quriladi, `retail_sale_position_allocations` dan emas (**D2**)
  ⇒ tovar bir necha omborga tarqalgach topshiriq **noto'g'ri omborchiga**
  tushadi. **M4 shuni yopadi.**
- **Jonlida omborchi ROLI ham, XODIMI ham yo'q** (8 rol, hammasi
  kassir/admin). `sklad_keepers` da uchala sklad → «Admin User».
- **Sanash ketyapti:** 2026-08-26 19:45 dan beri **62 ta** `СП-…`
  «avto-tenglash» hujjati, **−622 671 dona** — har biri 9 000–11 000
  oralig'ida, ya'ni soxta «mashq» qoldig'i tozalanmoqda (H5 ning maqsadi,
  qo'lda bajarilmoqda). Sotuvning yacheyka kesimidagi ulushi bor-yo'g'i −289.

---

## 4. ✅ S-M1 — JAVOB OLINDI (egasi, 2026-08-27)

Kaskad tartibi «kassaga yaqinlik» bo'yicha quriladi (egasining Q1 qarori:
«tovar **eng yaqin ombordan** ayiriladi»). Tizim buni o'zi bilmaydi.

**Savol edi:** Ombor 01 … 07 ni kassaga yaqinligi bo'yicha tartiblang.

> **JAVOB: `07 → 01 → 02 → 03 → 04 → 05 → 06`.**
> Ya'ni **Ombor 07 kassaga eng yaqin** («kassa oldidagi ombor»), qolganlari
> raqam tartibida.

**KANONIK KASKAD JADVALI** (M1 shuni yozadi):

| O'rin | Ombor | id (qisqa) | `__posPriority` |
|---|---|---|---|
| 1 | **Ombor 07** | `02016d74` | **1** — kassaga eng yaqin |
| 2 | Ombor 01 | `7400bf94` | **2** |
| 3 | Ombor 02 | `01662dbe` | **3** (hozir 2 — H6/1 shu yerda yopiladi) |
| 4 | Ombor 03 | `1e5df878` | **4** |
| 5 | Ombor 04 | `b628f0d0` | **5** |
| 6 | Ombor 05 | `75878ad6` | **6** |
| 7 | Ombor 06 | `ed80b5ce` | **7** |
| 8 | **Taqsimlanmagan** | `968f9da2` | **8 — ENG OXIRIDA** (hozir 1) |
| — | Ombor 99 (BRAK) | `d4b4ff85` | **YO'Q** — ataylab, kaskadga kirmaydi |

### ✅ «Taqsimlanmagan eng oxirida» — egasining tuzatishi (2026-08-27)

Rejaning birinchi tahririda `Taqsimlanmagan` **1-o'rinda qoldirilgan** edi
(«bugun butun sotuv o'shandan ketadi, xulq o'zgarmasin»). **Egasi buni rad
etdi:** hovuz ta'rifi bo'yicha **eng oxirida** turishi kerak.

**Tekshirildi — ehtiyotkorlik ortiqcha edi.** Bo'sh omborni kaskad boshiga
qo'yish bugun xulqni O'ZGARTIRMAYDI, va bu taxmin emas, beshta o'lchov:

| # | Shubha | Natija |
|---|---|---|
| 1 | Bo'sh omborlar taqsimotni buzadimi? | ❌ Yo'q — qoldig'i 0 ⇒ hissasi 0, reja `Taqsimlanmagan` ga tushib ketaveradi. Natija **aynan bir xil** |
| 2 | Qulflash faqat `cascade[0]` da qoladimi? | ❌ Yo'q — kod `extraStoreIds` orqali **hamma plan omborini** qulflaydi (`retail-sale.service.ts:1193–1207`), tartibdan qat'i nazar |
| 3 | `allowNegativeStock` `cascade[0]` dan olinadi (`:970`, `:3844`) — farq bo'ladimi? | ❌ Yo'q — **to'qqizala omborda ham `false`** (jonlida o'lchandi) ⇒ qiymat o'zgarmaydi |
| 4 | `posSessionStore` kaskad BOSHI bo'lishi shartmi? | ❌ Yo'q — **E5 buni yumshatgan**: «kaskadda BO'LSIN» (`warehouse-state-core.ts:29`). Taqsimlanmagan kaskadda qoladi ⇒ shart bajariladi |
| 5 | `assertAvailable` asosiy ombor balansini talab qiladimi? | ❌ Yo'q — u `post()` da **chaqirilmaydi** (faqat izohlarda qolgan). Yetarlilik **ajratmaning o'zi** bilan kafolatlanadi (`:3631`). `[alloc-invariant]` esa faqat `logger.warn` — sotuvni to'xtatmaydi |

⇒ **Bitta jonli o'zgarish yetadi**, ikkitasi emas: M1 yakuniy tartibni darrov
yozadi va **M7 endi faqat `posFront` bayrog'ini** qo'yadi.

⚠️ **`posPriority` va `posFront` — ikki BOSHQA narsa.** Bu jadval kaskad
TARTIBINI beradi. «Kassa oldidagi ombor» bayrog'i (`__posFrontStore`,
taqsimotda yolg'iz qoplasa birinchi / bo'linishda oxirgi) **M7 da** qo'yiladi.

🔴 **M1 dan keyin qoida 13 smoke MAJBURIY** — kaskad boshi o'zgarardi, ya'ni
`storeId` (qulflanadigan asosiy ombor) endi `Ombor 07`. Yuqoridagi besh
o'lchov «xulq o'zgarmaydi» deydi, lekin buni **jonli sinov sotuvi** tasdiqlashi
kerak (IS-3 saboqi: kod xulqi haqidagi to'g'ri xulosa tizim holati haqida
noto'g'ri bo'lishi mumkin).

---

## 5. FAZALAR — BOG'LIQLIK TARTIBI

```
M1 (kaskad + reyestr) ──┬─→ M3 (yacheyka raqamlash) ──┐
                        │                              ├─→ M6 (tovarni ko'chirish = H4)
M2 (H3 signali) ────────┴─→ M4 (D2: topshiriq)  ───────┤
                                                       │
M5 (T1: bo'lak reyestri) ──────────────────────────────┘
                                                        └─→ M7 (posFront 07)
                                                            └─→ M8 (omborlararo hujjat)
```

- **Darhol boshlanadi:** M1 (S-M1 javobidan keyin), M2, M5.
- **M6 — eng xavfli faza.** Oldshartlari: M1 + M2 + M3 + M4 + M5 **hammasi**.
- **M8** — egasi «tez orada kerak» dedi, lekin u M6 dan keyin ma'noga kiradi.

---

## 6. FAZALAR

### M1 — Kaskad sozlamasi va jonli holat reyestri

**Maqsad:** hamma ombor POS kaskadida to'g'ri o'rin olsin va reyestr
haqiqatni aytsin — **tovar joylashtirilishidan OLDIN**.

**Oldshart:** ✅ S-M1 javobi olingan (4-bo'lim) — **M1 BOSHLASH MUMKIN**.

**Oyna:** jonli o'zgarish ⇒ **20:00 dan keyin** (qoida 12).

---

#### M1.0 · Ijrodan OLDIN (o'lchov va qaytarish nuqtasi)

```bash
# VPS: root@13.140.157.10 (parol egasida)
cd /var/www/sherset-v2
set -a; . apps/api/.env; set +a
PGURL="${DATABASE_URL%%\?*}"          # 🔴 ?schema=public tuzog'i (2026-08-26 da o'lchangan)

# 1) HOZIRGI holatni yozib ol — bu QAYTARISH nuqtasi (qoida 12)
psql "$PGURL" -At -F"|" -c \
  "select id, name, coalesce(attributes::text,'{}') from stores order by name" \
  | tee /root/m1-stores-before-20260827.txt

# 2) Kaskadga tegishli qoldiq bormi (bo'sh omborlar kutiladi)
psql "$PGURL" -At -F"|" -c \
  "select s.name, coalesce(sum(st.qty),0) from stores s
     left join stocks st on st.store_id = s.id group by s.name order by s.name"
```

🔴 **TO'XTASH SHARTI:** `Ombor 01…07` dan birortasida qoldiq **0 dan katta**
bo'lsa — 3.1-jadval eskirgan, tovar allaqachon joylashtirilgan. Davom
etmang, egasiga ayting va rejani qayta hisoblang.

> **Nega `pg_dump` emas:** bu faza faqat **9 qatorning `attributes` ustunini**
> o'zgartiradi. Yuqoridagi `…-before-…txt` — aniq va to'liq qaytarish nuqtasi.
> Dump bu yerda ortiqcha (va u oradagi savdoni yo'qotadi).

---

#### M1.1 · Kaskad prioritetlari — avval DRY (`ROLLBACK`)

Qiymatlar **4-bo'limdagi KANONIK JADVALDAN**. Avval **`ROLLBACK` bilan**
yuriting va zondni tekshiring:

```sql
BEGIN;

-- 1  Ombor 07  (kassaga eng yaqin)
UPDATE stores SET attributes = coalesce(attributes,'{}'::jsonb) || '{"__posPriority": 1}'::jsonb
 WHERE id = '02016d74-e750-4333-808a-a5ceda7e3970';
-- 2  Ombor 01
UPDATE stores SET attributes = coalesce(attributes,'{}'::jsonb) || '{"__posPriority": 2}'::jsonb
 WHERE id = '7400bf94-c2b0-4d5c-b12d-f971cd10e187';
-- 3  Ombor 02   (hozir 2 → 3; H6/1 = R1 xavfi shu bilan yopiladi)
UPDATE stores SET attributes = coalesce(attributes,'{}'::jsonb) || '{"__posPriority": 3}'::jsonb
 WHERE id = '01662dbe-ee31-405f-a82f-ff8a82dc8809';
-- 4  Ombor 03
UPDATE stores SET attributes = coalesce(attributes,'{}'::jsonb) || '{"__posPriority": 4}'::jsonb
 WHERE id = '1e5df878-e447-464b-9b28-01e4aa497e67';
-- 5  Ombor 04
UPDATE stores SET attributes = coalesce(attributes,'{}'::jsonb) || '{"__posPriority": 5}'::jsonb
 WHERE id = 'b628f0d0-a95c-4749-9fb3-d94230abae8b';
-- 6  Ombor 05
UPDATE stores SET attributes = coalesce(attributes,'{}'::jsonb) || '{"__posPriority": 6}'::jsonb
 WHERE id = '75878ad6-6a4d-4539-ad14-a4655c203cb4';
-- 7  Ombor 06
UPDATE stores SET attributes = coalesce(attributes,'{}'::jsonb) || '{"__posPriority": 7}'::jsonb
 WHERE id = 'ed80b5ce-55ca-4770-a8a6-6b5f4c4d514a';
-- 8  Taqsimlanmagan  (hozir 1 → 8, ENG OXIRIDA)
UPDATE stores SET attributes = coalesce(attributes,'{}'::jsonb) || '{"__posPriority": 8}'::jsonb
 WHERE id = '968f9da2-6dbb-4375-b5e2-d19799b51de6';

-- Ombor 99 (BRAK) ga TEGILMAYDI — u kaskadda bo'lmasligi SHART.

-- Zond: kutilgan tartib chiqishi kerak
SELECT name, attributes->>'__posPriority' AS pp
  FROM stores ORDER BY (attributes->>'__posPriority')::int NULLS LAST, name;

ROLLBACK;     -- 🔴 DRY bosqichi: hozircha QAYTARILADI
```

**Kutilgan zond natijasi:**

| Ombor | pp | | Ombor | pp |
|---|---|---|---|---|
| Ombor 07 | 1 | | Ombor 05 | 6 |
| Ombor 01 | 2 | | Ombor 06 | 7 |
| Ombor 02 | 3 | | Taqsimlanmagan | 8 |
| Ombor 03 | 4 | | Ombor 99 | *(bo'sh)* |
| Ombor 04 | 5 | | | |

🔴 **TO'XTASH:** zond boshqacha chiqsa — `COMMIT` QILMANG.

---

#### M1.2 · Ijro va qaytarish

Ijro: **aynan o'sha blok**, faqat oxirgi qator `ROLLBACK;` → **`COMMIT;`**.

**Qaytarish buyrug'i (qoida 12) — bitta blok, asl holatni AYNAN tiklaydi:**

```sql
BEGIN;
UPDATE stores SET attributes = coalesce(attributes,'{}'::jsonb) || '{"__posPriority": 1}'::jsonb
 WHERE id = '968f9da2-6dbb-4375-b5e2-d19799b51de6';   -- Taqsimlanmagan → 1 (asl)
UPDATE stores SET attributes = coalesce(attributes,'{}'::jsonb) || '{"__posPriority": 2}'::jsonb
 WHERE id = '01662dbe-ee31-405f-a82f-ff8a82dc8809';   -- Ombor 02 → 2 (asl)
UPDATE stores SET attributes = attributes - '__posPriority'
 WHERE id IN ('02016d74-e750-4333-808a-a5ceda7e3970',  -- Ombor 07
              '7400bf94-c2b0-4d5c-b12d-f971cd10e187',  -- Ombor 01
              '1e5df878-e447-464b-9b28-01e4aa497e67',  -- Ombor 03
              'b628f0d0-a95c-4749-9fb3-d94230abae8b',  -- Ombor 04
              '75878ad6-6a4d-4539-ad14-a4655c203cb4',  -- Ombor 05
              'ed80b5ce-55ca-4770-a8a6-6b5f4c4d514a'); -- Ombor 06
COMMIT;
```

Natija `/root/m1-stores-before-20260827.txt` bilan solishtirib tasdiqlanadi.

> ℹ️ **API restart KERAK EMAS — o'lchangan.** `resolveStockCascade` va
> `resolveAllocationStores` har `post()` da `store.findMany` bilan **qaytadan
> o'qiydi** (`retail-sale.service.ts:3513`, `:3526`) — kesh yo'q. Ruxsat
> keshidan farqli o'laroq bu yerda restart shart emas (qilinsa ham zararsiz).

---

#### M1.3 · Reyestrni yangilash (qoida 14) — `docs/ops/jonli-holat.md`

**1-bo'limdagi JSON** to'qqizala omborga to'ldiriladi:

```json
{
  "split": "qisman",
  "posSessionStore": "Taqsimlanmagan",
  "allowUnreachableQty": "0",
  "stores": [
    { "name": "Ombor 07", "posPriority": 1, "brak": false, "posFront": false },
    { "name": "Ombor 01", "posPriority": 2, "brak": false, "posFront": false },
    { "name": "Ombor 02", "posPriority": 3, "brak": false, "posFront": false },
    { "name": "Ombor 03", "posPriority": 4, "brak": false, "posFront": false },
    { "name": "Ombor 04", "posPriority": 5, "brak": false, "posFront": false },
    { "name": "Ombor 05", "posPriority": 6, "brak": false, "posFront": false },
    { "name": "Ombor 06", "posPriority": 7, "brak": false, "posFront": false },
    { "name": "Taqsimlanmagan", "posPriority": 8, "brak": false, "unassignedSource": false, "posFront": false },
    { "name": "Ombor 99", "posPriority": null, "brak": true, "posFront": false }
  ]
}
```

⚠️ **`posSessionStore` hamon `Taqsimlanmagan`** — kassir smenalari o'sha
omborda ochiladi, va u kaskadda (8-o'rinda) qolgani uchun shart bajariladi
(E5: «kaskadda **BO'LSIN**», boshi bo'lishi shart emas).

Shuningdek yangilanadi: **2-bo'limdagi jadval** (to'qqiz qator) va
**«O'zgarishlar jurnali»** qatori.

---

#### M1.4 · Tekshirish

```bash
cd /var/www/sherset-v2/packages/db
set -a; . ../../apps/api/.env; set +a
npx tsx scripts/warehouse-state.ts; echo "EXIT=$?"
```

⚠️ **Serverdagi `jonli-holat.md` nusxasi ESKI** (`61780120` dan) ⇒ jonlida
`EXIT=2` chiqadi va bu **kutilgan**; yangilangan reyestr serverga keyingi
deploy bilan boradi. Shuning uchun **haqiqiy tekshiruv LOKALDA**: yangilangan
reyestr bilan `--json` chiqishini jonli o'lchov bilan solishtiring.

🔴 **Ikkala tomonda ham SHART:** «POS yeta olmaydigan qoldiq: **0**».

---

#### M1.5 · Uchma-uch smoke (qoida 13) — MAJBURIY

Kaskad **boshi o'zgardi**: qulflanadigan asosiy ombor (`storeId = cascade[0]`)
endi `Taqsimlanmagan` emas, **`Ombor 07`**. 4-bo'limdagi besh o'lchov «xulq
o'zgarmaydi» deydi, lekin buni **jonli sinov** tasdiqlashi kerak — IS-3
saboqi aynan shu: kod xulqi haqidagi to'g'ri xulosa **tizim holati** haqida
noto'g'ri bo'lishi mumkin.

| # | Amal | Kutilgan |
|---|---|---|
| 1 | Sinov **SOTUV**: chek → post → qoldiq kamaydi → **cancel** | cancel deltalarni aynan qaytaradi; ajratma qatori `store_id = Taqsimlanmagan` bo'ladi (tovar o'sha yerda) |
| 2 | Yacheyka **SANASH** | hujjatda to'g'ri ko'rinadi |
| 3 | **KO'CHIRISH** (yacheykadan yacheykaga) | jami qoldiq o'zgarmaydi |

🔴 **TO'XTASH:** sotuv 400 bersa yoki «Tizimdagi hech bir omborda yetarli
miqdor yo'q» xabari chiqsa — **darhol M1.2 dagi qaytarish blokini** yuriting.

**Ertalab (04:00–05:00, savdo boshlanishidan OLDIN):** `warehouse-state.ts`
+ bitta sinov sotuv. **Javobgar shaxs va vaqt hisobotda yoziladi.**

---

#### M1.6 · Testlar (kodda)

- `warehouse-state-core.test.ts` — to'qqiz omborli reyestr shakli;
- kaskad tartibi testi (`retail-allocation` / `retail-stock-cascade`):
  **bo'sh omborlar boshda turganda ham** reja to'g'ri omborga tushishi;
- BRAK ombori kaskadga **kirmasligi** (mavjud testni buzmaslik).

---

**Qabul mezoni:**
- jonlida to'qqizala ombor prioriteti **kanonik jadval bilan aynan mos**;
- «POS yeta olmaydigan qoldiq: **0**»;
- `jonli-holat.md` — JSON, jadval va jurnal **uchalasi** yangilangan;
- **qoida 13 smoke bajarilgan** (uchala band) va **ertalabki takroriy
  tekshiruv** javobgar shaxs bilan yozilgan.

**PROMPT:**
```
D:\sherset-v2 dagi docs/plans/2026-08-27-kop-omborli-tuzilma.md ni TO'LIQ o'qi.
Qoida 3 bo'yicha docs/plans/2026-08-23-ombor-restrukturizatsiya.md (2-bo'lim),
docs/plans/2026-08-24-split-kassa-hodisasi.md va docs/ops/jonli-holat.md ni ham o'qi.

Sen M1 fazasini bajarasan (kaskad sozlamasi + jonli holat reyestri).
Ijro materiali TAYYOR — 6-bo'limdagi M1.0…M1.6 bloklarini KETMA-KET bajar:
aniq SQL, qaytarish bloki, reyestr JSON'i va smoke ro'yxati o'sha yerda.
S-M1 javobi olingan — 4-bo'limdagi KANONIK JADVALNI ishlat.
Egasidan faqat VPS parolini so'ra.

MUHIM: bu JONLI o'zgarish — faqat 20:00 dan keyin. M1.1 (DRY/ROLLBACK) ni
o'tkazib yuborma. Smoke MAJBURIY.
Faqat M1 vazifalari, testlar, jonli tekshiruv, hisobot shu faylning
10-bo'limiga — va TO'XTA. Keyingi fazani BOSHLAMA.
```

---

### M2 — H3: «tovar bor, lekin kassa yeta olmaydi» signali

**Maqsad:** IS-5 ni yopish. Ayni nosozlik yana yuz bersa — 46 daqiqa emas,
**birinchi urinishda** ko'rinadi.

> 🔴 **DIQQAT — H-rejadagi H3 ta'rifi ESKIRGAN.** U signalni
> `assertAvailableCascade` ga bog'lagan, lekin o'sha metod **2026-08-25 da
> o'chirilgan** (G4-2a, `b4c27d24`). Ilgak endi
> `apps/api/src/modules/retail-sale/retail-allocation.ts` da.

**Oldshart:** yo'q (mustaqil).

**Vazifalar:**

1. **Uchinchi `ShortfallReason` — `unreachable`.** Hozir ikkita bor
   (`insufficient` · `no-single-source`). Yangi holat: **jami qoldiq YETADI,
   lekin u kaskadga kirmagan omborda** (prioriteti yo'q; BRAK **hisobga
   olinmaydi** — u ataylab sotilmaydi).
   Buning uchun taqsimot kaskaddan TASHQARIDAGI omborlarni ham **o'qishi**
   (lekin ULARDAN AJRATMASLIGI) kerak — «qayerda turibdi» ni aytish uchun.
2. **Halol xabar:** «Tizimdagi hech bir omborda yetarli miqdor yo'q» o'rniga —
   qaysi omborda qancha borligi va **nima qilish kerakligi** (omborga
   `__posPriority` qo'yish yoki tovarni ko'chirish).
3. **Log qatori:** `[stock-unreachable] sale=… product=… qty=… stores=…`.
4. **`CashierAuditEvent` yangi turi** (`STOCK_UNREACHABLE`): kim, qachon,
   qaysi tovar, qaysi omborda, qancha.
5. **Ko'rinadigan joy:** minimal variant — omborchi/admin sahifasida qator
   yoki mavjud bildirishnoma oqimiga yangi tur.
6. Testlar: (a) tovar kaskaddan tashqarida ⇒ `unreachable`, audit yozuvi va
   log bor; (b) tovar **umuman yo'q** ⇒ eski xulq, yangi yozuv YO'Q
   (shovqin qilmasin); (c) BRAK ombordagi qoldiq `unreachable` deb
   hisoblanmaydi; i18n ru+uz.

**Qabul mezoni:** sinov muhitida tovar kaskaddan tashqaridagi omborga
qo'yilib sotuvga urinilganda **audit yozuvi paydo bo'ladi** va xabar
**qaysi omborda qancha borligini aytadi**; tovar umuman yo'q bo'lsa yangi
yozuv **YOZILMAYDI**.

**PROMPT:**
```
D:\sherset-v2 dagi docs/plans/2026-08-27-kop-omborli-tuzilma.md ni TO'LIQ o'qi
(ayniqsa 3.2-bo'lim). Qoida 3 bo'yicha docs/plans/2026-08-24-split-kassa-hodisasi.md
(IS-5 va H3) va docs/plans/2026-08-23-omborchi-tsd-mijozlar.md (G4) ni ham o'qi.
Sen M2 fazasini bajarasan (yetib bo'lmaydigan qoldiq signali). H-rejadagi H3
ta'rifi eskirgan — ilgak retail-allocation.ts da, sabab 3.2 da yozilgan.
Faqat M2 vazifalari, testlar, hisobot shu faylning 10-bo'limiga — va TO'XTA.
```

---

### M3 — Ombor 03–07 yacheykalarini raqamlash

**Maqsad:** yangi omborlar fizik tuzilmaga ega bo'lsin (stelaj/qavat/o'rin),
kod konventsiyasi buzilmasin.

**Oldshart:** M1 (prioritet qo'yilgan bo'lsin — aks holda raqamlangan ombor
darhol «yetib bo'lmaydigan» ga aylanadi).

**Vazifalar:**

1. Egasidan har ombor uchun stelaj/qavat/o'rin sonini olish.
2. `packages/db/scripts/create-cells.ts` bilan **avval DRY-RUN**, so'ng
   `--apply --allow-remote`. Yacheyka kodi: `<ombor>-<stelaj>-<qavat>-<o'rin>`.
3. **Zonalar** (`StoreZone`) kod 2-segmentidan hosil bo'lsin (R5 saboqi:
   revert zonalarni `null` qilib yuborgan edi).
4. Reyestr va jurnalni yangilash (qoida 14).
5. Testlar: kod formati va unikallik; `warehouse-state.ts` split holatini
   to'g'ri o'qishi (yangi yacheykalar **o'z** omborida ⇒ «mos»).

**Qabul mezoni:** har omborda yacheykalar yaratilgan, kodi konventsiyaga mos,
zonalar bor, `warehouse-state.ts` **yangi drift bermaydi**, reyestr yangilangan.

**PROMPT:**
```
D:\sherset-v2 dagi docs/plans/2026-08-27-kop-omborli-tuzilma.md ni TO'LIQ o'qi
(M1 hisobotini ham). Qoida 3 dagi rejalarni ham o'qi.
Sen M3 fazasini bajarasan (Ombor 03–07 yacheykalarini raqamlash).
Egasidan har ombor uchun stelaj/qavat/o'rin sonini so'ra. DRY-RUN majburiy.
Faqat M3 vazifalari, testlar, hisobot 10-bo'limga — va TO'XTA.
```

---

### M4 — D2: yig'ish topshirig'i AJRATMADAN qurilsin

**Maqsad:** tovar bir necha omborga tarqalgach yig'ish topshirig'i **to'g'ri
omborchiga** tushsin.

> **Bugungi holat (o'lchangan):** `createPickingTasksForSale` guruhlashni
> `product.attributes.__yacheyka` (tovarning UY yacheykasi) prefiksidan
> qiladi — `retail_sale_position_allocations` dan EMAS. Bitta omborda bu
> farq qilmaydi; **bir nechta omborda topshiriq noto'g'ri odamga ketadi.**
> Jonlida **4417/5090 tovarning yacheykasi yo'q** ⇒ ular `NULL_SKLAD`
> guruhiga tushib **birinchi omborchiga** boradi.

**Oldshart:** M1.

**Vazifalar:**

1. `createPickingTasksForSale` ni `retail_sale_position_allocations` dan
   qurish: har ajratma qatori o'z `storeId`/`cellId` si bilan tegishli
   omborchiga ketsin.
2. Ajratma yo'q holat (eski cheklar, qoralamalar) uchun **eski yo'l zaxira**
   sifatida qolsin — lekin log bilan («ajratmasiz chek»).
3. `sklad_keepers` xaritasi ombor **raqami** bilan ishlaydi — `Store` bilan
   moslashtirilsin (`skladNoOf` konventsiyasi buzilmasin).
4. `sklad_keepers.printer_name` bo'sh — yig'ish varaqasi chop etilmaydi;
   to'ldirish yo'li hisobotda ko'rsatilsin.
5. Testlar: ikki omborli chek ⇒ ikkita topshiriq, har biri o'z omborchisiga;
   ajratmasiz chek ⇒ zaxira yo'l + log; `NULL_SKLAD` xulqi qulflansin.

**Qabul mezoni:** ikki omborli sinov chekida har topshiriq **o'z omborining**
omborchisiga tushadi; ajratmasiz chek eski xulqni saqlaydi.

**PROMPT:**
```
D:\sherset-v2 dagi docs/plans/2026-08-27-kop-omborli-tuzilma.md ni TO'LIQ o'qi.
Qoida 3 dagi rejalarni, ayniqsa docs/plans/2026-08-23-omborchi-tsd-mijozlar.md
dagi G2 va G4 hisobotlarini o'qi (D2 bandi deploy dossierida ham bor).
Sen M4 fazasini bajarasan (yig'ish topshirig'i ajratmadan qurilsin).
Faqat M4 vazifalari, testlar, hisobot 10-bo'limga — va TO'XTA.
```

---

### M5 — T1: `packages/db` skriptlari bo'lak reyestrini bilsin

**Maqsad:** M6 (tovarni ko'chirish) ning bloklovchi to'sig'ini olib tashlash.

> **O'lchangan (2026-08-26 auditi):** `warehouse-split-core.ts`,
> `stock-baseline-cleanup-core.ts` va `warehouse-state-core.ts` da «piece»
> so'zi **nol marta** uchraydi, `stock_pieces` da esa `store_id` + `cell_id`
> bor. Jadval bo'sh ekan — zararsiz; **bo'sh bo'lmagan kundan H4/H5
> YURITILMAYDI**, chunki «Σ tarkib === miqdor» sharti buziladi.

**Oldshart:** yo'q (mustaqil, kodda bajariladi).

**Vazifalar:**

1. `warehouse-split.ts` — ombor/yacheyka ko'chirilganda `stock_pieces` ning
   `store_id`/`cell_id` si ham ko'chsin (bitta tranzaksiyada).
2. `stock-baseline-cleanup.ts` — bayrog'i yoqilgan (bo'linadigan) tovarga
   **TEGMASIN**, chunki u `Stock.qty` ni kamaytiradi, reyestrga tegmaydi.
3. `warehouse-state.ts` — bo'lak reyestri bilan qoldiq o'rtasidagi
   nomuvofiqlikni drift sifatida ko'rsatsin.
4. Testlar: har uch skript uchun bo'lakli stsenariy; «Σ tarkib === miqdor»
   invarianti qulflansin.

**Qabul mezoni:** uch skript ham bo'lakli tovarda to'g'ri ishlaydi va
invariant test bilan qulflangan; T1 to'sig'i **yopiq** deb yozilgan.

**PROMPT:**
```
D:\sherset-v2 dagi docs/plans/2026-08-27-kop-omborli-tuzilma.md ni TO'LIQ o'qi.
Qoida 3 bo'yicha docs/plans/2026-08-25-bolinadigan-tovar-bolak-hisobi.md (K-reja)
va docs/plans/2026-08-24-split-kassa-hodisasi.md (H4 → T1 bandi) ni ham o'qi.
Sen M5 fazasini bajarasan (skriptlar bo'lak reyestrini bilsin).
Faqat M5 vazifalari, testlar, hisobot 10-bo'limga — va TO'XTA.
```

---

### M6 — 🔴 Tovarni haqiqiy omborlarga ko'chirish (H4 ning ijrosi)

**Maqsad:** «Taqsimlanmagan» dagi yacheykali qoldiqni o'z omborlariga
o'tkazish — **savdo to'xtamasdan**.

> 🔴 **BU REJANING ENG XAVFLI FAZASI.** Aynan shu amal 2026-08-23 da
> bajarilib, ertasi kuni kassani **46 daqiqa** to'xtatgan. Oldshartlari
> to'liq bajarilmasa **BOSHLANMAYDI**.

**Oldshartlar (HAMMASI SHART):**
- ✅ M1 (kaskad + reyestr) · ✅ M2 (signal) · ✅ M3 (yacheykalar) ·
  ✅ M4 (topshiriq) · ✅ M5 (T1);
- `warehouse-split-revert.ts` repoda, **lokal bazada sinalgan**;
- zaxira dump olingan (`PGURL="${DATABASE_URL%%\?*}"` — `?schema=public`
  tuzog'i, 2026-08-26 da o'lchangan).

**Vazifalar:**

1. `warehouse-split.ts` ga **POS-yetuvchanlik tekshiruvi**: reja
   bajarilishidan OLDIN hisoblab beradi — «split'dan keyin POS yeta
   olmaydigan qoldiq: N dona, M tovar». **N > 0 ⇒ `--apply` RAD ETILADI**
   (ongli `--i-know-what-i-am-doing` flagsiz).
2. **Bosqichma-bosqich ko'chirish:** bir kechada BITTA ombor (hammasi emas).
   Har bosqichdan keyin smoke va ertalabki tekshiruv.
3. Zonalarni tiklash (R5).
4. Ko'chirish **ish soatidan tashqari** + darhol qoida 13 smoke.
5. **Savdo boshlanishidan oldin** takroriy smoke va `warehouse-state.ts`.
6. Har bosqichda reyestr va jurnal yangilanadi (qoida 14).

**Qabul mezoni:** ko'chirilgan ombor uchun — jami qoldiq **o'zgarmagan**,
`warehouse-state.ts` **«POS yeta olmaydigan qoldiq: 0»**, sinov sotuvi o'sha
ombordan **o'tadi**, ertalabki takroriy tekshiruv bajarilgan va **javobgar
shaxs bilan hisobotda yozilgan**.

**PROMPT:**
```
D:\sherset-v2 dagi docs/plans/2026-08-27-kop-omborli-tuzilma.md ni TO'LIQ o'qi
(M1…M5 hisobotlari bilan). Qoida 3 dagi TO'RTALA rejani ham o'qi, ayniqsa
docs/plans/2026-08-24-split-kassa-hodisasi.md ni TO'LIQ (bu faza aynan o'sha
hodisaning takrorlanish xavfini ko'taradi).
Sen M6 fazasini bajarasan (tovarni haqiqiy omborlarga ko'chirish).
Oldshartlarning BIRORTASI bajarilmagan bo'lsa — BOSHLAMA, egasiga ayt.
Bir kechada BITTA ombor. Faqat M6 vazifalari, testlar, jonli tekshiruv,
hisobot 10-bo'limga — va TO'XTA.
```

---

### M7 — «Kassa oldidagi ombor» (07) va yakuniy taqsimot tartibi

**Maqsad:** Q1 qoidasini to'liq yoqish — 07 yolg'iz qoplasa birinchi,
bo'linishda oxirgi; «Taqsimlanmagan» kaskad **oxiriga** o'tadi.

**Oldshart:** M6 (kamida 07 ko'chirilgan bo'lsin).

**Vazifalar:**

1. Ombor 07 kartasida **«Kassa oldidagi ombor»** bayrog'i
   (`__posFrontStore`) — UI orqali.
2. **Reyestrda `"posFront": true`** yozilishi SHART — aks holda
   `warehouse-state.ts` darhol drift beradi (`kassa-oldidagi-ombor-reyestrda-yoq`,
   `xato` darajali).
3. ~~`Taqsimlanmagan` ni oxirgi raqamga o'tkazish~~ — **M1 da bajarildi**
   (egasining 2026-08-27 tuzatishi, 4-bo'lim). M7 da qayta tartiblash YO'Q.
4. Testlar: `posFront` ning ikki xulqi (yolg'iz qoplasa birinchi, bo'linishda
   oxirgi) — `retail-allocation` testlarida qulflansin.

**Qabul mezoni:** sinov chekida 07 dagi tovar **birinchi** ayiriladi;
bo'linish holatida 07 **oxirgi** bo'ladi; reyestr mos.

**PROMPT:**
```
D:\sherset-v2 dagi docs/plans/2026-08-27-kop-omborli-tuzilma.md ni TO'LIQ o'qi
(M6 hisoboti bilan). Qoida 3 dagi rejalarni, ayniqsa G4 (Q1-v2 taqsimot
jadvali) ni o'qi. Sen M7 fazasini bajarasan (kassa oldidagi ombor + yakuniy
tartib). Faqat M7 vazifalari, testlar, hisobot 10-bo'limga — va TO'XTA.
```

---

### M8 — Omborlararo ko'chirish HUJJAT sifatida

**Maqsad:** egasining 2026-08-27 talabi — «kim qaysi ombordan qaysi omborga
berdi» rasman qolsin.

**Oldshart:** M6 (kamida ikki ombor tovarli bo'lsin).

**Vazifalar:**

1. Omborlararo ko'chirish hujjati (`move`) — omborchi oqimida: manba ombor +
   yacheyka → nishon ombor + yacheyka, miqdor, izoh.
2. Ruxsatlar: `warehouse_manager` — to'liq; `storekeeper` — **faqat o'z
   ombori ichida** (assimetriya `role-templates.ts` da qulflanadi).
3. TSD oqimi bilan moslik (G6 `cell-move`/`cell-place` qatlami buzilmasin).
4. Hisobot: ombor bo'yicha kirim/chiqim tarixi.
5. Testlar: ruxsat assimetriyasi, qoldiq invarianti (jami o'zgarmaydi),
   i18n ru+uz.

**Qabul mezoni:** jonlida bitta tovar A ombordan B omborga hujjat bilan
ko'chiriladi, jami qoldiq o'zgarmaydi, tarixda kim/qachon ko'rinadi, oddiy
omborchi boshqa omborga ko'chira **olmaydi** (403).

**PROMPT:**
```
D:\sherset-v2 dagi docs/plans/2026-08-27-kop-omborli-tuzilma.md ni TO'LIQ o'qi
(M6 va M7 hisobotlari bilan). Qoida 3 dagi rejalarni, ayniqsa
docs/plans/2026-08-23-ombor-restrukturizatsiya.md dagi F7 bandini o'qi.
Sen M8 fazasini bajarasan (omborlararo ko'chirish hujjati).
Faqat M8 vazifalari, testlar, jonli tekshiruv, hisobot 10-bo'limga — va TO'XTA.
```

---

## 7. Boshqa rejalar bilan bog'liqlik

| Bu reja | Manba | Nima o'zgardi |
|---|---|---|
| **M2** | H-reja **H3** | H3 ta'rifi eskirgan (`assertAvailableCascade` o'chirilgan) ⇒ M2 uni **qayta yozilgan holda** bajaradi. H3 yopilgan deb belgilanadi |
| **M5** | H-reja **H4 → T1** | Aynan o'sha band |
| **M6** | H-reja **H4** | H4 ning ijro shakli. **Egasi 2026-08-27 da H4 KERAK dedi** («omborlararo ko'chirish tez orada kerak») |
| **M1/6-band** | H-reja **H6/1** (R1) | «Ombor 02 dagi `__posPriority=2`» — M1 da to'g'ri qiymatga almashtiriladi |
| **M4** | Deploy dossieri **D2** | Aynan o'sha band |
| **M7** | F-reja **Q1** + G4 | «07 birinchi» qoidasi |
| **M8** | F-reja **F7** | F7 kodi jonlida, lekin **hisoboti yo'q** — M8 uni ham yopadi |

---

## 8. Bu reja QAMRAMAYDIGAN ishlar

- **2- va 3-kecha deploy'lari** (A1–A3 · Q4–Q6 + K1–K6 + E5) — ular
  `docs/ops/2026-08-27-kecha-rejasi.md` va deploy dossierida;
- **Omborchi ROLI va XODIMI yaratish** — bu kechaning B bloki;
- **H5** (soxta «mashq» qoldig'i) — jamoa sanash orqali qo'lda bajarmoqda;
- **K-reja** (bo'linadigan tovar) — M5 dan boshqa kesishmasi yo'q.

---

## 9. Xavflar reyestri

| # | Xavf | Qaysi faza yopadi |
|---|---|---|
| X-1 | Prioritetsiz omborga tovar tushsa kassa sotolmaydi **va yolg'on xabar beradi** | M1 (oldini oladi) + M2 (ko'rsatadi) |
| X-2 | Yig'ish topshirig'i noto'g'ri omborchiga tushadi | M4 |
| X-3 | Ko'chirish bo'lak reyestrini buzadi | M5 |
| X-4 | Ko'chirish savdoni to'xtatadi (2026-08-24 takrori) | M6 (bosqichma-bosqich + yetuvchanlik qo'riqchisi) |
| X-5 | Reyestr haqiqatni aytmaydi (IS-7) | M1, keyin har fazada qoida 14 |
| X-6 | `sklad_keepers` da kassir turgan bo'lsa cheklar qotib qoladi | M4 (tekshiruv qo'shiladi) |

---

## 10. HISOBOTLAR (har faza o'z hisobotini SHU YERGA yozadi)

> Format: faza · holat (✅ TUGADI / ⚠️ QISMAN) · sana · commit ·
> nima qilindi (fayllar) · test natijalari **raqam bilan** · deploy holati ·
> **qoida 3 javobi** («qaysi oqimni buzishi mumkin?») · ochiq qolganlar ·
> keyingi fazaga eslatmalar.

### M0 — Reja tuzildi · ✅ · 2026-08-27

**Kim:** deploy operatori sessiyasi (1-kecha deploy'ini tekshirish uchun
boshlangan, jonli o'lchov davomida bu reja ehtiyoji aniqlandi).

**Nima qilindi:** shu reja yozildi. Undan oldin jonli holat noldan
o'lchandi (3-bo'lim) va kod o'qildi.

**O'lchov natijalari (hammasi faqat-o'qish, savdo davomida):**

1. **Jonlida 9 ombor bor, reyestrda 4 ta.** Ombor 03–07 **2026-08-27
   05:32–05:37** da yaratilgan (egasi tasdiqladi), hammasi bo'sh, hammasida
   `__posPriority` **YO'Q**.
2. **X-1 xavfi kodda tasdiqlandi:** `resolveAllocStores`
   (`retail-allocation.ts:214`) prioritetsiz omborni taqsimotdan chiqaradi,
   `buildShortfallMessage` esa bu holatni `insufficient` deb ataydi ⇒ xabar
   **«hech bir omborda yetarli miqdor yo'q»** bo'lib chiqadi, bu esa YOLG'ON.
   Uchinchi sabab (`unreachable`) yo'q.
3. **H3 ta'rifi eskirgan:** `assertAvailableCascade` 2026-08-25 da
   o'chirilgan (`retail-sale.service.ts:3631` dagi izoh) ⇒ H3 ni yozilganidek
   bajarib bo'lmaydi. M2 uni qayta yozilgan holda oladi.
4. **H3 ning 6 bandidan 1 tasi bajarilgan** — deploy qo'riqchisi
   (`warehouse-state.ts`, E5 orqali). Log, audit, xabar, ko'rinadigan joy va
   testlar — yo'q.
5. **Yacheyka qoldig'i kamayishi tushuntirildi:** 62 ta `СП-2026-00120…00181`
   «Sanash (yacheyka …) — avto-tenglash» hujjati, **−622 671 dona**, har biri
   9 000–11 000 oralig'ida ⇒ soxta «mashq» qoldig'i sanash orqali qo'lda
   tozalanmoqda. Sotuvning yacheyka kesimidagi ulushi **−289** ⇒ **X1
   («sotuv sanalgan yacheykani buzmaydi») jonlida kuchida.**
6. **`reyestrda-yoq` drifti `ogohlantirish` darajali** ⇒ Ombor 03–07
   `warehouse-state.ts` ning chiqish kodini buzmaydi (faqat `xato` darajali
   driftlar buzadi: `prioritet`, `split-holati`, `ombor-yoq`,
   `kassa-oldidagi-ombor-reyestrda-yoq`).

**Qoida 3 javobi (qaysi oqimni buzishi mumkin?):** bu faza **hech qanday kod
va jonli ma'lumot o'zgartirmadi** — faqat o'qish so'rovlari va hujjat.
Buzilishi mumkin bo'lgan oqim yo'q.

**Ochiq qolganlar:**
- ✅ **S-M1 javob olindi** (egasi, 2026-08-27): `07 → 01 → 02 → 03 → 04 → 05 → 06`
  ⇒ kanonik jadval 4-bo'limga yozildi, **M1 bloklanmagan**;
- reyestr (`jonli-holat.md`) hamon 4 omborli — M1 yangilaydi;
- H-rejadagi H3 va H4 bandlariga «M-rejaga ko'chirildi» yozuvi qo'shilishi
  kerak (M1 sessiyasi qo'shsin yoki alohida kichik ish).

**Keyingi faza:** **M1** — bloklanmagan, alohida sessiyada boshlanadi
(prompti 6-bo'limda).

---

### M1 — Kaskad sozlamasi va jonli holat reyestri · ⚠️ QISMAN · 2026-08-30

**Kim:** Claude (egasi «hozir bajar» dedi — reja 20:00 oynasidan ONGLI
chetlashish; savdo ochiq edi, 4 ta smena ishlab turgan). **Commit: YO'Q**
(branch `yacheyka-inventarizatsiya`, ish daraxtida).

**Nima qilindi:**

| Qadam | Natija |
|---|---|
| M1.0 | Oldshart o'lchandi: `Ombor 01…07` da qoldiq **0** ⇒ to'xtash sharti ishga TUSHMADI; 3.1-jadval eskirmagan. Qaytarish nuqtasi `/root/m1-stores-before-20260830.txt` (9 qator) |
| M1.1 | DRY jonlida: `BEGIN → oldinga → zond → qaytarish → zond → ROLLBACK`. **Ikkala yo'nalish bitta tranzaksiyada sinaldi** — qaytarish zondi asl 9 qatorni AYNAN tikladi (qoida 12 shu bilan bajarildi; alohida lokal dev baza kerak bo'lmadi) |
| M1.2 | `COMMIT`. Kanonik jadval jonlida: `07=1 · 01=2 · 02=3 · 03=4 · 04=5 · 05=6 · 06=7 · Taqsimlanmagan=8`; `Ombor 99` (BRAK) tegilmadi; `__cellInventory` saqlandi |
| M1.3 | `docs/ops/jonli-holat.md` — JSON (9 ombor), 2-bo'lim jadvali (9 qator) va jurnal qatori |
| M1.4 | `warehouse-state.ts` o'zgarishdan OLDIN va KEYIN: **EXIT=0**, «Reyestrga MOS — farq yo'q», **POS yeta olmaydigan qoldiq: 0** |
| M1.5 | Qoida 13 smoke — pastda |
| M1.6 | Testlar: `warehouse-state-core.test.ts` (kanonik kaskad + prioritetlar 1…8 takrorsiz + BRAK tashqarida) va `retail-stock-cascade.test.ts` («kaskad boshidagi 7 BO'SH ombor rejani o'zgartirmaydi»). **43/43 yashil** |

**Fayllar:** `packages/db/scripts/m1-pos-priority-apply.sql` ·
`packages/db/scripts/m1-pos-priority-rollback.sql` ·
`apps/api/src/scripts/ops-m1-live-smoke.ts` (yangi) ·
`apps/api/src/scripts/warehouse-state-core.test.ts` ·
`apps/api/src/modules/retail-sale/retail-stock-cascade.test.ts` ·
`docs/ops/jonli-holat.md`.

**M1.5 — qoida 13 smoke (uchala band, `ops-m1-live-smoke.ts --live`):**

1. **SOTUV** — chek → post: qoldiq AYNAN −1; **ajratma «Taqsimlanmagan» dan
   olindi, bo'sh «Ombor 07» hech nima TORTMADI** (M1 ning asosiy sharti
   jonlida isbotlandi) → vozvrat: jami AYNAN tiklandi.
2. **SANASH** — yacheyka `02-02-03-42` chernovigi ochildi, `position-meta`
   qoldiqni (22 700) to'g'ri ko'rsatdi, chernovik o'chirildi.
3. **KO'CHIRISH** — `02-02-03-42` → `01-04-01-105` 1 dona: ombor jamisi
   o'zgarmadi, teskari ko'chirish yacheyka kesimini tikladi.

Skript izini O'ZI tozalaydi (`--restore-stray` rejimi ham bor). Sinov
hujjatlari `description` da «M1 jonli smoke» belgisi bilan qidiriladi.

**Qoida 3 javobi («qaysi oqimni buzishi mumkin?»):** kassa sotuvi/vozvrati
(`retail-sale.service.ts` kaskadi), taqsimot (`retail-allocation.ts`),
yacheyka sanash/ko'chirish. Uchalasi ham smoke bilan jonlida o'lchandi —
buzilish topilmadi.

**⚠️ Yo'l-yo'lakay o'lchangan ikki narsa (ikkalasi ham NUQSON emas):**

1. **Vozvrat tovarni `cascade[0]` ga, ya'ni endi «Ombor 07» ga qaytaradi**
   (`retail-sale.service.ts:2389–2390`). Bu **F6/Q1 ning ATAYLAB qilingan
   xulqi** — «mijoz tovarni jismonan do'konga olib keladi ⇒ kassaga eng yaqin
   omborga kiradi». M1 gacha ko'rinmasdi (`cascade[0]` hovuz edi). **Yangi
   qaror kerak emas**, va bu **M7/`posFront` bilan bog'liq EMAS** (u TAQSIMOT
   tartibini belgilaydi, vozvrat omborini emas). Amaliy oqibat: «Ombor 07» da
   hali yacheyka yo'q (**M3**) ⇒ qaytgan tovar u yerda «yacheykasiz» turadi.
2. **Yacheykalar soni 974 → 1 243** (269 yangi). Kim/qachon yaratgani
   jurnalda YOZILMAGAN — qoida 14 buzilgan. Reyestr haqiqatga tenglashtirildi.

**Qabul mezoni — holat:**

- ✅ to'qqizala ombor prioriteti kanonik jadval bilan aynan mos;
- ✅ «POS yeta olmaydigan qoldiq: 0»;
- ✅ `jonli-holat.md` — JSON, jadval va jurnal uchalasi yangilangan;
- ⚠️ qoida 13 smoke **uchala bandi bajarildi**, LEKIN **ertalabki takroriy
  tekshiruv (savdo boshlanishidan oldin, javobgar shaxs ismi bilan) HALI
  YO'Q** ⇒ qoida 11 bo'yicha faza **«QISMAN»** bo'lib qoladi.

**Ochiq qolganlar:** ertalabki takroriy tekshiruv · commit · (M7 ning 3-bandi
ARTIQ KERAK EMAS — `Taqsimlanmagan` ni oxirgi raqamga o'tkazish shu fazada
bajarildi).

**Keyingi fazaga eslatma:** **M3** (yacheyka raqamlash) endi ilgarigidan
muhimroq — «Ombor 07» kaskad boshi bo'lgani uchun vozvratlar o'sha yerga
tusha boshlaydi, yacheykasi esa yo'q.
