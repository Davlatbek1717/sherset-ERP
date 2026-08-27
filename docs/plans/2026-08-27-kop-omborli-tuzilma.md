# Ko'p omborli tuzilmaga o'tish (7+ ombor) — M-REJA

> **Yaratilgan:** 2026-08-27 · **Buyurtmachi:** Ozodbek (egasi) ·
> **Holat:** **M0 ✅ reja tuzildi** · **S-M1 ✅ javob olindi** ·
> **M1 boshlashga TAYYOR** · M2…M8 boshlanmagan
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

**Vazifalar:**

1. **Kaskad prioritetlarini qo'yish** (jonli, `stores.attributes` jsonb) —
   qiymatlar **4-bo'limdagi KANONIK JADVALDAN** olinadi (S-M1 javobi:
   `07 → 01 → 02 → 03 → 04 → 05 → 06`). Taqsimlanmagan **1 da qoladi**,
   Ombor 99 ga prioritet **berilmaydi**.
   Buyruq shakli (`attributes` — `jsonb`):

       UPDATE stores SET attributes = coalesce(attributes,'{}'::jsonb)
              || '{"__posPriority": N}'::jsonb
        WHERE id = '<uuid>';

   **Qaytarish (qoida 12):** `UPDATE stores SET attributes = attributes -
   '__posPriority' WHERE id = '<uuid>';` — har ombor uchun alohida yozilsin.
2. **Avval LOKAL dev bazada** sinash (qoida 7). Lokal baza mavjud bo'lmasa —
   jonlida `BEGIN … tekshirish … ROLLBACK` bilan DRY, so'ng AYNAN o'sha
   bayonot `COMMIT` bilan; usul hisobotda yoziladi.
3. **`docs/ops/jonli-holat.md` ni to'liq yangilash** (qoida 14): 1-bo'limdagi
   JSON reyestriga **to'qqizala ombor**, 2-bo'limdagi jadval,
   «O'zgarishlar jurnali» qatori.
4. **`warehouse-state.ts` ni lokalda yugurtirish** — reyestr yangilangach
   drift qolmasligi kerak.
5. Testlar: `warehouse-state-core.test.ts` ga yangi reyestr shakli uchun
   test; kaskad tartibi testi (`retail-stock-cascade` / `retail-allocation`).

**Qabul mezoni:**
- jonlida to'qqizala ombor prioriteti reyestrdagi bilan **aynan mos**;
- `warehouse-state.ts` jonlida yuritilganda **prioritet va reyestr driftlari
  YO'Q** (serverdagi reyestr nusxasi eski bo'lsa — bu hisobotda aniq
  yoziladi va faza «QISMAN» bo'ladi);
- **«POS yeta olmaydigan qoldiq: 0»**;
- qoida 13 smoke bajarilgan.

**PROMPT:**
```
D:\sherset-v2 dagi docs/plans/2026-08-27-kop-omborli-tuzilma.md ni TO'LIQ o'qi.
Qoida 3 bo'yicha docs/plans/2026-08-23-ombor-restrukturizatsiya.md (2-bo'lim),
docs/plans/2026-08-24-split-kassa-hodisasi.md va docs/ops/jonli-holat.md ni ham o'qi.
Sen M1 fazasini bajarasan (kaskad sozlamasi + jonli holat reyestri).
S-M1 javobi ALLAQACHON olingan — 4-bo'limdagi KANONIK JADVALNI ishlat.
Egasidan faqat VPS parolini so'ra.
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
