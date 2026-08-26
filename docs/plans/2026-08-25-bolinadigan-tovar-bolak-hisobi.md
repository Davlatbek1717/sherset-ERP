# Bo'linadigan tovar — bo'lak hisobi (kabel, sim, shlang)

> **Yaratilgan:** 2026-08-25 · **Buyurtmachi:** Ozodbek (egasi) · **Holat:** **K1 ⚠️ QISMAN** (`bc92330a`) + **K2 ⚠️ QISMAN** + **K3 ⚠️ QISMAN** — poydevor (model, migratsiya, sverka) va bo'lak reyestri boshqaruvi ekrani + yorliq tayyor; K1 migratsiyasi LOKAL dev bazada to'liq isbotlangan (UP×2 → zond → DOWN×2 → UP), K2 esa migratsiya QO'SHMAYDI. **Uchalasi ham jonli tasdiq kutmoqda** — egasi 2026-08-25 da deploy'ni rad etdi, shu sabab uchala faza BIRGA, bitta deploy bilan yopiladi. 🔴 **Deploy'da `topup-role-permissions.ts` MAJBURIY** (yangi entity `piecetracking`). Jonli xulq HOZIRCHA o'zgarmaydi: bayroq hech qayerda yoqilmagan, jadval bo'sh. **K3 (kassir ko‘rinishi + 7.1 avto-taqsimot istisnosi) KOD TAYYOR** — migratsiyasiz, yangi ruxsatsiz, jonli xulq bayroq yoqilmaguncha o‘zgarmaydi. **K4 ⚠️ QISMAN (2026-08-26)** — omborchi KESIM oqimi + posting: migratsiya `20260826000000_stock_piece_cut` LOKAL bazada to‘liq isbotlangan (UP×2 → zond → DOWN×2 → UP) va TSD APK qurilgan (`BUILD SUCCESSFUL`), lekin jonli tasdiq kutmoqda. 🔴 **Kesim STOK-NEYTRAL** — egasining 2026-08-25 qarori bo‘yicha chiqindi ham, kesim yo‘qotishi ham FAQAT reyestrdan chiqadi, QOLDIQQA TEGILMAYDI (tuzatish K5 da). **K-S3 YOPILDI**: chekda BITTA qator «180 m (150+30)». **K5 ⚠️ QISMAN (2026-08-26, `2c3bf228`)** — ommaviy kiritish: SANASH (inventarizatsiya) reyestrni sanoq natijasiga tenglashtiradi (mutlaq, lekin o'zgarish MINIMAL — o'zgarmagan bo'lakning yorlig'i qayta BOSILMAYDI), PRIYOMKA kelgan rulonlarni qo'shadi (faqat BUTUN rulon), VOZVRAT qaytgan bo'lakni AYNAN o'sha qator bilan tiklaydi; uchalasi BITTA matn formati bilan («250x3+BLK-000041:200+?:150») va uchalasi ham STOK-NEYTRAL. Migratsiya `20260826120000_stock_piece_intake` LOKAL bazada to'liq isbotlangan (UP×2 → zond → DOWN×2 → UP; qoldiq har qadamda AYNAN o'zgarmagan). **K6 boshlanmagan.**
>
> **Ijro tartibi:** har faza ALOHIDA sessiyada. Agent shu faylni, F-rejani
> (`2026-08-23-ombor-restrukturizatsiya.md`), G-rejani
> (`2026-08-23-omborchi-tsd-mijozlar.md`) va hodisa hujjatini
> (`2026-08-24-split-kassa-hodisasi.md`) TO'LIQ o'qiydi, O'Z fazasini bajaradi,
> testlardan o'tkazadi, pastdagi «Hisobotlar»ga yozadi va TO'XTAYDI.
>
> **O'ZGARMAS QOIDALAR:** F-rejaning 2-bo'limi (1–14 bandlari) shu rejaga ham
> AYNAN tatbiq etiladi — bitta sessiya = bitta faza; testlar + i18n ru/uz
> majburiy; maxfiy ma'lumot yozilmaydi; branch/push/deploy retsepti o'sha yerda;
> jonli bazaga skript avval lokalda; ikki tomonlama bog'liqlik (10); qabul
> mezoni bilan yopish (11); qaytarish yo'li (12); uchma-uch smoke (13);
> favqulodda tuzatish protokoli (14).
>
> 🔴 **Bu reja MAVJUD IKKI QOIDANI o'zgartiradi** (Q1-v2 avto-taqsimot va
> «tovarga yorliq yopishtirilmaydi»). 7-bo'limga qarang — G-rejani
> bajaradigan agent ham shuni o'qishi shart.

---

## 1. Muammo (nega bu reja)

UzKabel VVG 2x2.5 omborga **rulonda** keladi, har rulonda 250 m. Mijozlar 50,
100, 180, 200 m olib ketishadi — natijada omborda turli uzunlikdagi bo'laklar
yig'iladi.

**Jismonan omborda:** `250 + 250 + 250 + 200 + 150 + 70 + 50`
**Tizimda:** `1220 m`

Kassir 1220 ni ko'rib mijozga «4 ta rulon bor» deydi. Omborga borilganda 3 tagina
butun rulon borligi ma'lum bo'ladi — mijoz oldida sharmandalik.

**Ildiz sabab:** qoldiq bitta son sifatida saqlanadi (`StockByCell.qty`,
`Decimal(20,6)`). O'sha son **nechta jismoniy bo'lakdan tashkil topgani** hech
qayerda yozilmagan. Sotuvda «180 m kesildi» deganda tizim faqat
`1220 − 180 = 1040` ni biladi — qaysi bo'lakdan kesilgani yozilmagani uchun
tarkib har sotuvda yo'qoladi.

Ya'ni bu «kassada ko'rsatmayapmiz» muammosi EMAS — **ma'lumotning o'zi yo'q.**

**Mavjud `Consignment` modeli yechim emas:** u butun sxemada hech qayerga
ulanmagan (`consignmentId` degan maydon bitta ham yo'q), ya'ni bo'sh qobiq.

---

## 2. Asosiy g'oya: kesish qoldiqni O'ZGARTIRMAYDI

250 m lik rulondan 180 m kesilganda ombordagi kabel kamaymaydi:
`250` o'rniga `180 + 70` bo'ladi. Jami — o'sha 250.

> **Kesim faqat TARKIBNI o'zgartiradi, MIQDORNI emas.**
> Qoldiq faqat **to'lov paytida** kamayadi (F-reja Q1: ayirish momenti — pul
> to'langanda). Bu qoida o'zgarmaydi.

Buning ikki og'ir oqibati **o'z-o'zidan** hal bo'ladi:

1. **Kassa vaqti va ombor vaqti orasida teshik yo'q.** Kesim stok-neytral
   bo'lgani uchun `SUM(bo'laklar) = StockByCell.qty` invarianti HAR DOIM
   saqlanadi — «kesildi lekin hali to'lanmadi» oralig'ida ham.
2. **Mijoz kesilgandan keyin voz kechsa** (kabel kesilgan, qaytarib ulab
   bo'lmaydi) hech nima buzilmaydi: 180 m yorliq bilan bo'lak bo'lib omborda
   qolaveradi, ertaga boshqa mijozga ketadi. Qoldiq bir grammga ham o'zgarmaydi.

---

## 3. Model: butun rulon ≠ bo'lak

Egasining qarori: **butun rulonlarda yorliq bo'lmaydi, bo'laklarda bo'ladi.**
Bu chuqur ma'noga ega — butun rulonlar bir-biridan farq qilmaydi (uchala 250 m
bir xil, qaysinisini olish farqsiz), bo'laklar esa har biri o'ziga xos.

| | Yorliq | Ma'nosi |
|---|---|---|
| **Butun rulon** | YO'Q | Almashtiriladigan. UI da guruhlanadi: `250 m × 3` |
| **Bo'lak** | BOR (unikal) | Individ. Har biri alohida: `#038 = 200 m` |

**Jadval sxemasi (taklif — K1 fazasi aniqlashtiradi):**

```
model StockPiece {
  id             String   @id @default(uuid())
  accountId      String
  storeId        String
  cellId         String
  assortmentKind String   @default("product")   // StockByCell bilan bir xil kalit
  assortmentId   String
  length         Decimal  @db.Decimal(20, 6)    // QOLGAN uzunlik
  whole          Boolean  @default(false)       // butun rulonmi
  label          String?  @unique               // «BLK-000041»; whole=true → NULL
  sourcePieceId  String?                        // qaysi bo'lakdan kesilgan (tarix)
  status         String   @default("active")    // active | consumed
}
```

**Qoidalar:**

- **Bitta qator = bitta jismoniy bo'lak.** Butun rulonlar ham alohida qator
  (`whole=true`, `label=null`), UI ularni guruhlab `250 × 3` deb ko'rsatadi.
- `whole = true` ⟹ `label = null`. Invariant sifatida qulflanadi.
- **INVARIANT:** `SUM(length) WHERE assortment+cell AND status='active'`
  **=** `StockByCell.qty` — faqat `pieceTracked` tovarlar uchun.
  Farq chiqsa **kassa TO'XTAMAYDI** — sverka signali beriladi (K1).

**Tovar bayrog'i:** `Product.pieceTracked` — «Bo'lak hisobi yuritilsin».

---

## 4. Vakolat chegarasi (egasining qarori)

| Kim | Nimani hal qiladi |
|---|---|
| **Kassir** | Nechta bo'lak va qaysi UZUNLIKLAR (mijoz bilan kelishilgani: «150 + 30 ga rozi bo'ldi») |
| **Omborchi** | Qaysi JISMONIY bo'lakdan olish/kesish |

**Tizim hech qachon o'zi bo'lmaydi va o'zi tanlamaydi** — faqat ko'rsatadi va
taklif qiladi.

Kassir ekranida:

```
UzKabel VVG 2x2.5 — so'raldi: 180 m
Bo'laklar: 250 · 250 · 250 · 200 · 150 · 70 · 50
Eng uzun uzluksiz: 250 m
⚠️ 180 m uzluksiz bor (250 dan kesiladi) · yoki 150 + 30
```

Texnik talab: **bitta sotuv pozitsiyasi bir nechta bo'lakdan iborat bo'la
olishi kerak.**

---

## 5. Oqim (mavjud FSM ustiga quriladi)

Egasi tasvirlagan oqim allaqachon kodda bor —
`RetailSale` FSM: `draft → picking → ready → posted`.

| # | Qadam | Kim | Tizimda |
|---|---|---|---|
| 1 | Mijoz buyurtma beradi, kassir bo'laklarni ko'radi va taklif qiladi | Kassir | `draft` |
| 2 | Omborchiga yuboriladi | Kassir | `send-to-picking` → `RestockTask` + SSE |
| 3 | Omborchi bo'lak tanlaydi, kesadi, **qolgan uzunlikni kiritadi**, **yorliq bosadi** | Omborchi | `StockPiece` yangilanadi (stok-neytral) |
| 4 | «Bajardim» | Omborchi | `mark-ready` |
| 5 | Kassir ko'radi, pul oladi, chek | Kassir | `posted` → qoldiq ayriladi + bo'lak chiqadi |
| 6 | Tovar ombordan ayriladi | Omborchi | — |

**Yangi topshiriq mexanizmi QURILMAYDI** — mavjud picking topshirig'iga
«bo'linadigan tovar» qadami qo'shiladi, xolos.

**Haqiqiy uzunlik chekka tushadi:** omborchi 180 o'rniga 178 kesib qo'ysa yoki
bo'lak kaltaroq chiqsa, mijoz BOR narsaga to'laydi. Bu ham yangi ish emas —
G-rejada allaqachon qoida bor: *«katta omborchi tarkibni TAHRIRLAYDI va bu
kassirga darhol ko'rinadi»*.

**Yorliq qoidasi (qat'iy):**

- Har kesim **yorliq bosilishi bilan tugaydi**, undan oldin emas. Butun rulon
  kesilsa, qolgani BO'LAK bo'ladi va o'sha zahoti yorliq oladi.
- Yorliqda: **unikal shtrix-kod + uzunlik matni** (omborchi skanersiz ham
  ko'radi; kassir «200 m likni oling» deganda mijoz o'zi topadi).
- Kesimdan keyin yorliq **QAYTA bosiladi**. Eski uzunlik yozilgan yorliq eng
  xavfli narsa — odam tizimga emas, yorliqqa ishonadi.
- Qolgani **1 m dan kam** bo'lsa yorliq bosilmaydi: u chiqindi va **hisobdan
  chiqariladi** (aks holda qoldiqda «bor» bo'lib turaveradi).

**O'z-o'zini tuzatish (ikki nuqta):**

- Omborchi qolgan uzunlikni **o'zgartira oladi**. Tizim `250 − 180 = 70` deb
  taklif qiladi; haqiqatda 68 bo'lsa omborchi tuzatadi, farq avtomatik hisobdan
  chiqariladi. Kesim yo'qotishi shunday yopiladi.
- Bo'lak «tugadi» deb belgilanganda qog'ozda qolgan har qanday uzunlik hisobdan
  chiqariladi. «250 m yozilgan rulonda aslida 247 m bor edi» aynan shu payt
  oshkor bo'ladi.

---

## 6. Qarorlar (egasi javob berdi, 2026-08-25)

- **K-Q1 ✅ Kesish qayerda:** **omborda** (kassada emas).
- **K-Q2 ✅ To'lov momenti:** mijoz kassaga buyurtma beradi → omborchi bajaradi →
  «bajardim» → kassir ko'radi → pul oladi va chek beradi → tovar ayriladi.
  Ya'ni **kesim to'lovdan OLDIN**.
- **K-Q3 ✅ Yorliq:** bo'laklarda BOR, butun rulonlarda YO'Q.
- **K-Q4 ✅ Qaysi bo'lakdan kesish — OMBORCHI hal qiladi.** Tizim majburlamaydi.
  Egasining so'zi: *«agar u 20 m ni sotish qulay deb topsa 200 metrlikdan kesib
  beradi, agar 70 m sotish qulay bo'lsa 250 m likdan kesib beradi»*.
- **K-Q5 ✅ Uzluksiz bo'lak yetmasa** (180 so'raldi, eng uzuni 150) —
  **kassir taklif qiladi** («150 + 30 bo'lib beramiz»). Shuning uchun kassirga
  barcha bo'laklar ko'rinishi SHART. Tizim o'zi bo'lmaydi.
- **K-Q6 ✅ Eng kichik foydali bo'lak — 1 m.** Undan kaltasi chiqindi.
- **K-Q7 ✅ Boshlang'ich ro'yxat — yacheykani sanashda kiritiladi** (har
  yacheykada nechta rulon, nechta bo'lak va uzunliklari). F-rejaning «sanash
  faqat yacheyka kesimida» qoidasiga mos tushadi.
- **K-Q8 ✅ Yechim kabelga emas, «bo'linadigan tovar» TURIGA quriladi**
  (sim, shlang, zanjir, lenta…).
- **K-Q9 ✅ Bayroqni kim yoqadi:** tovar kartochkasida **qo'lda**, «m»
  birligidagi YANGI tovarda **yoqilgan holda keladi** (o'chirish bir bosishda).
  Huquq — **katta omborchi** (+ egasi/menejer), alohida permission.
  Sabab: jim ishlamaslikdan ko'ra shovqinli ishlamaslik yaxshi — bayroq yoqilgan
  bo'lsa ortiqchaligi birinchi kunda bilinadi; o'chiq bo'lsa kerakligi mijoz
  ketib qolganda bilinadi.
- **K-Q10 ✅ Yoyish bosqichma-bosqich:** avval FAQAT kabel guruhi, 1–2 hafta
  jonli kuzatuv, keyin kengaytirish. Butun «m» tovarlarga bir kunda yoqish —
  2026-08-24 kabi bir zarbali o'zgarish bo'ladi.

---

## 7. 🔴 MAVJUD QOIDALAR BILAN TO'QNASHUV (G-rejani bajaradigan agent O'QISIN)

### 7.1 Q1-v2 avto-taqsimot bo'linadigan tovarni BO'LIB YUBORADI

G-rejadagi Q1-v2 qoidasi: hech bir yacheyka yolg'iz qoplamasa — miqdor
yacheykalar orasida **bo'linadi**.

Kabelda bu halokat: mijoz 180 m **uzluksiz** so'raydi, tizim «100 + 80» deb ikki
yacheykadan taqsimlaydi. Mijozga ikki bo'lak berib bo'lmaydi.

> **TUZATISH:** `pieceTracked = true` tovarlar uchun avto-taqsimot **O'CHADI**.
> Tizim bo'laklarni ko'rsatadi va kutadi. Bitta bo'lak butun miqdorni qoplashi
> shart; qoplamasa — bo'lish emas, kassirga ogohlantirish
> («uzluksiz 180 m yo'q, eng uzuni 150 — mijoz 150+30 ga rozimi?»).
> Qaror mijoznikida.

Eslatma: Q1-v2 dagi **«yetadigan eng kichigi»** falsafasi bo'laklarga aynan mos
tushadi (kichik qoldiqlar yig'ilib qolmaydi) — lekin K-Q4 bo'yicha bu faqat
**TAVSIYA** bo'lib qoladi, majburlash emas.

### 7.2 «Tovarga yorliq yopishtirilmaydi» qoidasiga ikkinchi istisno

G-rejada: *«Tovarga yorliq yopishtirilmaydi (shtrix yacheykada); FAQAT vozvrat
tovarlariga yorliq bosiladi»*. Endi **bo'laklar ikkinchi istisno**.
Yorliq moduli va print-agent (17777) tayyor.

### 7.3 ⚠️ Shtrix unikalligi — texnik tuzoq

G-rejada: *«shtrixlar ataylab UNIKAL EMAS — har skaner mijozi multi-hit
tanlovni qo'llashi shart»*.

**Bo'lak yorlig'i esa aksincha — mutlaqo UNIKAL bo'lishi shart**, chunki u aynan
bitta jismoniy bo'lakni bildiradi.

> **TALAB:** bo'lak kodlari alohida makonda (`BLK-` prefiksi), skaner uni tovar
> shtrixidan AJRATA olishi kerak. Aks holda omborchi bo'lakni skanerlaganda
> tovar tanlovi (multi-hit) ochiladi va butun mantiq quladi.

---

## 8. FAZALAR

### K1 — Poydevor: model + sverka (jonli XULQqa TEGMAYDI)

**Maqsad:** ma'lumot modelini qurish va invariantni o'lchaydigan vosita berish.
Hech qanday oqim o'zgarmaydi, bayroq hech qayerda yoqilmaydi.

**Vazifalar:**

1. `Product.pieceTracked` bayrog'i + idempotent migratsiya (default `false`).
2. `StockPiece` jadvali + idempotent migratsiya (3-bo'lim sxemasi).
   `label` UNIQUE, `whole=true ⟹ label IS NULL` — DB check yoki servis guardi.
3. Sverka servisi + hisobot: `SUM(StockPiece.length)` vs `StockByCell.qty`,
   faqat `pieceTracked` tovarlar kesimida. Farq → ogohlantirish, **kassa
   to'xtamaydi**.
4. Qaytarish skripti (qoida 12): jadval + ustunni tushiradigan DDL.
5. Testlar: invariant testi, guard testi, sverka hisobi testi. i18n ru+uz.

**Qabul mezoni:** migratsiya lokal dev bazada va jonlida qo'llangan; sverka
hisoboti ochiladi va «farq yo'q» beradi (reyestr bo'sh, bayroq o'chiq);
uchma-uch smoke (qoida 13) o'tgan — sotuv/sanash/ko'chirish avvalgidek ishlaydi.

**PROMPT (yangi sessiyaga ko'chirib qo'ying):**

```
Qoida (10): D:\sherset-v2 da docs/plans/2026-08-23-ombor-restrukturizatsiya.md (F-reja),
docs/plans/2026-08-23-omborchi-tsd-mijozlar.md (G-reja) va
docs/plans/2026-08-24-split-kassa-hodisasi.md (hodisa qoidalari) ni TO'LIQ o'qi.
So'ng docs/plans/2026-08-25-bolinadigan-tovar-bolak-hisobi.md (K-reja) ni to'liq o'qi.
Sen K1 fazasini bajarasan (model poydevori + sverka; jonli xulqqa TEGILMAYDI).
Faqat K1 vazifalari, testlar, qaytarish skripti, deploy, jonli tekshiruv,
so'ng K-rejaning Hisobotlar bo'limiga to'liq hisobot yozib TO'XTA.
```

---

### K2 — Bo'lak reyestri boshqaruvi (katta omborchi ekrani)

**Maqsad:** bo'laklarni qo'lda kiritish/tuzatish va yorliq bosish. Bu butun
rejaning «qo'l tormozi» — keyingi fazalarda nimadir chalkashsa, shu ekran
orqali tuzatiladi.

**Vazifalar:**

1. Tovar × yacheyka kesimida bo'laklar ro'yxati: qo'shish, uzunlikni tuzatish,
   «tugadi» deb yopish, boshqa yacheykaga ko'chirish.
2. Butun rulon qo'shish: «250 m × 3» → 3 ta `whole=true` qator (yorliqsiz).
3. Yorliq bosish: `BLK-` prefiksli unikal kod + uzunlik matni, mavjud label
   moduli + print-agent (17777) orqali. Qayta bosish amali.
4. Har o'zgarish sverkani buzsa — ekranda darhol ko'rinadi (K1 servisi).
5. Permission (`piecetracking` yoki shunga o'xshash), i18n ru+uz, testlar.

**Qabul mezoni:** bitta sinov tovarda 3 butun rulon + 4 bo'lak kiritilib, sverka
`StockByCell.qty` bilan to'liq mos kelgani ko'rsatilgan; yorliq jonli printerda
bosilgan va skanerlanganda AYNAN o'sha bo'lak ochilgan (multi-hit ochilmagan).

**PROMPT:** K1 andozasi bo'yicha — «Sen K2 fazasini bajarasan (bo'lak reyestri
boshqaruvi + yorliq)».

---

### K3 — Kassir ko'rinishi (FAQAT O'QISH) + avto-taqsimot istisnosi

**Maqsad:** egasi so'ragan asosiy natija — kassir bo'laklarni ko'rsin.

**Vazifalar:**

1. POS tovar kartochkasida bo'lak tarkibi: `3 × 250 · 200 · 150 · 70 · 50` va
   alohida qator **«Eng uzun uzluksiz: 250 m»**.
2. So'ralgan miqdor kiritilganda ogohlantirish: uzluksiz bo'lak bormi, yo'qmi;
   yo'q bo'lsa taklif variantlari (`150 + 30`). **Tizim o'zi tanlamaydi.**
3. Sotuv pozitsiyasi bir nechta bo'lakdan iborat bo'la olishi (kassir
   uzunliklarni belgilaydi).
4. **7.1 tuzatishi:** `pieceTracked` tovarlarda Q1-v2 avto-taqsimoti o'chadi.
5. Tovar kartasi «Qoldiqlar» tabida ham bo'lak tarkibi (F1 ustiga).
6. i18n ru+uz, testlar (hisob-mantiq + render).

**Qabul mezoni:** bayroq yoqilgan sinov tovarda kassa ekranida tarkib va «eng
uzun uzluksiz» DB dagi haqiqiy bo'laklarga teng (test bilan qulflangan);
bayroq O'CHIQ tovarlarda kassa ekrani va taqsimot **mutlaqo o'zgarmagan**.

**PROMPT:** andoza bo'yicha, K3.

---

### K4 — Omborchi kesim oqimi (picking ichida) + posting

**Maqsad:** kesim tizimga yozilsin — reyestr shu bilan tirik qoladi.

**Vazifalar:**

1. Picking topshirig'ida bo'linadigan tovar qadami: bo'lakni tanlash yoki
   **yorliqni SKANERLASH**, kesilgan uzunlik, qolgan uzunlik (tizim taklif
   qiladi, omborchi tuzatishi mumkin).
2. Kesim **stok-neytral** amal: manba bo'lak → mijozga ketadigan bo'lak +
   qoldiq bo'lak. `StockByCell.qty` GA TEGILMAYDI.
3. Qolgan < 1 m → yorliq yo'q, avtomatik hisobdan chiqarish.
4. Omborchi tuzatgan farq (kesim yo'qotishi) → avtomatik hisobdan chiqarish.
5. Yorliq avtomatik bosiladi; amal yorliqsiz YOPILMAYDI.
6. `retail-sale` posting'ida (`posted`) mijozga ketgan bo'lak reyestrdan
   chiqadi — mavjud qoldiq ayirish tranzaksiyasi ICHIDA (G4 2-bosqichi bilan
   bir joyda).
7. TSD (Android) ekrani — G-reja andozasi bo'yicha, offline bufer bilan.
8. Testlar: stok-neytrallik testi, invariant testi post'dan keyin,
   mijoz voz kechgan ssenariy testi. i18n ru+uz.

**Qabul mezoni:** sinov tovarda uchma-uch: buyurtma → kesim → «bajardim» →
to'lov → qoldiq. Har qadamda sverka farq bermagan; mijoz kesimdan keyin voz
kechgan ssenariyda qoldiq o'zgarmagani va yangi bo'lak yorliq bilan qolgani
jonli tekshirilgan.

**⚠️ DIQQAT:** bu faza `retail-sale.service` ga tegadi — G4 2-bosqichi bilan
to'qnashuv ehtimoli bor. Boshlashdan oldin G-rejadagi G4 holati tekshiriladi.

**PROMPT:** andoza bo'yicha, K4.

---

### K5 — Ommaviy kiritish: inventarizatsiya + priyomka

**Maqsad:** reyestr bir marta to'lsin va yangi kelgan rulonlardan eskirmasin.

**Vazifalar:**

1. **Inventarizatsiyada** (K-Q7): yacheyka sanashda bo'linadigan tovar uchun
   «nechta butun rulon (uzunligi) + nechta bo'lak (har birining uzunligi)»
   kiritish. Sanoq natijasi `StockByCell.qty` bilan avtomatik solishtiriladi.
   F-rejaning «faqat yacheyka kesimida» qoidasi BUZILMAYDI.
2. **Priyomkada** (Supply): bo'linadigan tovar pozitsiyasida «5 ta rulon ×
   250 m» kiritish → 5 ta `whole=true` qator. Faqat «1250 m» yozish
   bo'linadigan tovar uchun taqiqlanadi.
3. Vozvratda qaytgan bo'lak — yorliq bilan reyestrga qaytadi (G2 bilan bog'liq).
4. Testlar + i18n ru+uz.

**Qabul mezoni:** jonli bitta yacheyka kabel bo'yicha sanalib, reyestr va
`StockByCell.qty` mos kelgani; bitta jonli priyomka rulon soni bilan kiritilib
reyestrga tushgani.

**PROMPT:** andoza bo'yicha, K5.

---

### K6 — Bayroq siyosati + jonli pilot (kabel guruhi)

**Maqsad:** yoyish, lekin bosqichma-bosqich (K-Q10).

**Vazifalar:**

1. Tovar kartochkasida «Bo'lak hisobi yuritilsin» bayrog'i (permission bilan).
2. Birligi «m» bo'lgan YANGI tovar yaratilganda bayroq **yoqilgan** holda
   keladi (K-Q9).
3. **«Hal qilinmagan» ro'yxati:** birligi «m», lekin bayroq bo'yicha qaror
   qilinmagan tovarlar alohida ekranda. Ha yoki yo'q deyilgach ro'yxatdan
   chiqadi. Shu bilan yangi nomenklatura unutilib qolmaydi.
4. **Jonli pilot:** bayroq FAQAT kabel guruhiga yoqiladi. 1–2 hafta kuzatuv:
   omborchilar yorliq bosishni unutmayaptimi, sverka farq bermayaptimi.
5. Kunlik sverka hisoboti — farq chiqsa katta omborchiga signal.

**Qabul mezoni:** kabel guruhi jonlida 1 hafta ishlagan; sverka hisobotida
tizimli farq yo'q; kassirlardan «bo'laklar to'g'ri ko'rinyapti» tasdig'i olingan
(javobgar shaxs va sana hisobotda). Bu mezon bajarilmaguncha faza
«QISMAN — jonli tasdiq kutilmoqda» (qoida 11).

**PROMPT:** andoza bo'yicha, K6.

---

## 9. OCHIQ SAVOLLAR (egasidan)

- **K-S1:** Bir yacheykada bir nechta bo'lak yotadimi, yoki har bo'lak alohida
  o'ringa qo'yiladimi? (Reyestr ikkalasini ham qo'llaydi — savol omborchining
  bo'lakni TOPISHI qanchalik oson bo'lishi haqida.)
- **K-S2:** Bo'lak narxi butun rulon narxidan farq qiladimi (qoldiq bo'lakni
  arzonroq sotish)? Hozircha **farq qilmaydi** deb qabul qilindi.
- **K-S3 ✅ JAVOB OLINDI (egasi, 2026-08-26):** chekda **BITTA qator** —
  «180 m (150+30)», tarkib esa izoh sifatida. K3 ning xulqi shunga qurilgan
  edi va K4 kesimni AYNAN shu bitta pozitsiyaga bog'laydi
  (`stock_pieces.reserved_position_id`). Soliq/chek talabi hamon
  tekshirilmagan — agar keyin 2 qator kerak bo'lsa, bu ALOHIDA ish
  (savat, `computePositions` va kesim bog'lanishi qayta ko'riladi).
- **K-S4:** Kabelning nechta nomenklaturasi bor va taxminan nechta bo'lak
  yotibdi? K5 ning ish hajmi shundan bilinadi.

---

## 10. HISOBOTLAR (har faza o'z hisobotini SHU YERGA yozadi)

### K5 — Ommaviy kiritish: inventarizatsiya + priyomka + vozvrat · ⚠️ QISMAN (qoida 11) · 2026-08-26 · `2c3bf228`

**Holat: QISMAN.** Kod, migratsiya, sirt, i18n va testlar tayyor; migratsiya
**LOKAL dev bazada TO'LIQ isbotlangan** (UP ×2 → zond → DOWN ×2 → UP) va har
qadamdan keyin qoldiq o'lchandi. Qabul mezonining **jonli** bandi
BAJARILMAGAN (deploy yo'q ⇒ jonli yacheykada sanash ham, jonli priyomka ham
qilinmadi). Faza «TUGADI» deb yopilmaydi. K1+K2+K3+K4 bilan BIR deployda
yopiladi; **K5 deploy deltasiga O'NINCHI migratsiyani qo'shadi**
(`20260826120000_stock_piece_intake`). Yangi ruxsat-entity YO'Q ⇒
`topup-role-permissions.ts` ga K5 hech narsa qo'shmaydi (u K2 uchun baribir
MAJBURIY).

---

**1. Ikki tomonlama bog'liqlik javobi (qoida 10 — «bu o'zgarish qaysi mavjud
oqimni buzishi mumkin?»).**

| Oqim | Ta'sir | Dalil |
|---|---|---|
| **Qoldiq (`Stock`/`StockByCell`)** | **YO'Q** | Uch qavat qulf: (a) yangi modul manbasida `stock.create/update/upsert`, `stockByCell.*`, `executeRaw`, `applyDeltas` so'zlari UMUMAN yo'q — test manba matnini o'qib tekshiradi; (b) wiring testlarining fake klientida `stock`/`stockByCell` berilmagan (chaqirilsa TypeError); (c) **lokal zond**: sanash sikli (yopish + tuzatish + yangi qator) davomida `stocks` (5354 / 52 524 230.387857) va `stock_by_cell` (273 / 2 949 085) bir grammga ham o'zgarmadi. |
| **Inventarizatsiya post'i** | 🔴 **O'ZGARADI, lekin FAQAT bayrog'i yoqilgan tovarda VA tarkib kiritilgan qatorda** | Qoldiq deltalaridan KEYIN, AYNI tranzaksiyada yangi qadam: reyestr sanoq natijasiga tenglashadi. Shart — `pieceEntry && pieceTracked`; ikkalasi ham bo'lmasa blok umuman ishlamaydi. Jonlida bayroq hech qayerda yoqilmagan (K1 o'lchovi: 5086 tovarning hammasida `false`) ⇒ deploy kuni jonli xulq O'ZGARMAYDI. Variance/delta hisobiga bir bayt ham tegilmagan (test bilan qulflangan). |
| **Priyomka post'i** | AYNI qoida | Kelgan rulonlar `whole=true` qator bo'lib qo'shiladi. Faqat QO'SHADI — mavjud qatorlarni o'qimaydi ham (test: `findMany` chaqirilmaydi). |
| **Vozvrat post'i** | AYNI qoida | Qaytgan bo'lak `active` ga qaytadi. Bayroqsiz/tarkibsiz qatorda reyestrga so'rov KETMAYDI. |
| **Kassa sotuvi (`retail-sale`)** | **YO'Q** | Modulga bir bayt ham tegilmagan; `retail-allocation.ts`, `post()`, `cancel()`, rezerv — hammasi o'z holicha. `retail-sale` moduli yashil. |
| **Yig'ish topshirig'i (G6) / kesim (K4)** | **YO'Q** | `restock-task` va `stock-piece-cut.service` tegilmagan. K4 ning `PIECE_CONSUMED_REASON` lug'atiga BITTA qiymat (`recount`) qo'shildi — mavjud to'rttasi va ularning xulqi o'zgarmadi. |
| **G3 vozvrat QABUL oqimi** | Additiv maydon | `AcceptReturnSchema.positions[]` ga ixtiyoriy `pieceEntry` qo'shildi; yuborilmasa `null` va xulq eski. `planAcceptance` uni hujjat qatoriga o'tkazadi, xolos (cap/narx mantiqiga tegilmagan). |
| **Hujjat CLONE (inventarizatsiya)** | ATAYLAB nusxalanmaydi | Nusxa `actualQty = 0` bilan keladi; tarkib eski miqdorniki bo'lardi va Σ tekshiruvidan o'tmasdi. Izoh kodda. |
| **Ruxsat matritsasi / rollar** | **YO'Q** | Yangi entity qo'shilmadi. Uchala oqim o'z hujjatining mavjud ruxsati ostida (`inventory`, `supply`, `returnacceptance`). |
| **H2/H3 (jonli holat reyestri)** | **YO'Q** | Ombor TUZILMASIGA (`Store`, `__posPriority`, `__posFrontStore`, `__brakStore`) tegilmadi; `docs/ops/jonli-holat.md` ga qo'shiladigan yangi JONLI HOLAT yo'q. |
| **Eng yomon holat** | Reyestr haqiqatdan uzilib qoladi | Kassa avvalgidek ishlayveradi (qoldiq alohida), sverka farqni ko'rsatadi. K5 ning birorta yo'li savdoni TO'XTATA olmaydi. |

🔴 **Ikki ochiq xavf, ochiq yozilgan.**

1. **Σ tarkib === miqdor SHART.** Bayrog'i yoqilgan tovarda tarkib kiritilib
   miqdorga teng chiqmasa hujjat 400 oladi. Bu ATAYLAB (aks holda reyestr va
   qoldiq post bo'lgan zahoti bir-biriga zid bo'lardi va sverka birinchi
   kundan qizil bo'lib, signal «bo'ri keldi» ga aylanardi — G3/H2 dagi AYNI
   xato-klass). Yumshatuvchi uchta narsa: (a) tarkib IXTIYORIY — kiritilmasa
   hujjat avvalgidek o'tadi; (b) ekran Σ ni O'ZI hisoblab sanoq maydoniga
   qo'yadi, ya'ni normal oqimda farq umuman chiqmaydi; (c) xato matni ikkala
   sonni ham aytadi.
2. **Sanash MUTLAQ.** Yacheykada sanalmagan bo'lak reyestrdan chiqadi
   (`recount`). Bu to'g'ri semantika, lekin omborchi tarkibni chala yozsa
   reyestr kamayadi. Yumshatuvchi: **«Reyestrdan olish»** tugmasi joriy
   holatni maydonga qo'yadi va omborchi faqat FARQNI tuzatadi.

---

**2. Nima qilindi.**

**Sxema + migratsiya `20260826120000_stock_piece_intake`** (idempotent DDL):

| Jadval | Qo'shildi | Nega |
|---|---|---|
| `inventory_positions` | `piece_entry` (text) | Omborchi SANAGAN tarkib. Post reyestrni shunga tenglashtiradi. |
| `supply_positions` | `piece_entry` (text) | Kelgan RULONLAR («250x5»). |
| `sales_return_positions` | `piece_entry` (text) | Mijozdan QAYTGAN bo'lak («BLK-000041:180»). |
| `stock_pieces` | CHECK ga `recount` | «Sanashda topilmadi». Alohida sabab ATAYLAB: `closed` («tugadi», qo'lda) bilan aralashsa sverkadagi farqning MANBAI ko'rinmay qolardi (IS-5). |

**Kanonik matn formati** (uchala oqimda BITTA):

```
250x3 + BLK-000041:200 + ?:150
└───┘   └────────────┘   └───┘
butun    mavjud bo'lak   yangi bo'lak
rulon    (yorlig'i bor)  (yorliq beriladi)
```

JSON EMAS, ataylab: matn omborchining ekranida shundoq turadi, DB'da odam
o'qiy oladi va K4 ning `piece_lengths` («150+30») naqshi bilan bir oilada
(bir xil `+` ajratgichi, bir xil `parseLengthInput` — vergul ham nuqtaga
o'giriladi).

**Sof yadro `piece-intake-core.ts`** (Prisma yo'q):
`parsePieceEntry` / `formatPieceEntry` (xato KODI va GURUH raqami bilan —
K4 `parsePieceLengths` dan farqi shu: bu yerda yaroqsiz guruh jimgina
tashlanmaydi), `matchQuantity`, `planRecount`, `planSupplyIntake`,
`planPieceReturn`, `intakeErrorMessage`.

**🔴 `planRecount` — o'zgarish MINIMAL.** Sanash MUTLAQ (yacheykadagi reyestr
sanoq natijasiga tenglashadi — omborchining ko'zi haqiqat manbai), lekin:
· yorlig'i sanalgan va uzunligi bir xil bo'lak — TEGILMAYDI (`keep`), ya'ni
  **yorliq QAYTA BOSILMAYDI**;
· uzunligi boshqa — MAVJUD qator tuzatiladi, yorliq RAQAMI saqlanadi, lekin
  qayta bosiladi (unda eski uzunlik yozilgan — reja 5-bo'limining eng qat'iy
  bandi);
· `?` — yangi qator + yangi yorliq;
· sanashda uchramagan — `close` (`recount` sababi bilan).
Butun rulonlar ALMASHTIRILADIGAN (K-Q3): (uzunlik → son) kesimida
solishtiriladi — kami yaratiladi, ortig'i yopiladi, tengi tegilmaydi.

**Servis `stock-piece-intake.service.ts`** — `stock_pieces` ga yozadigan
UCHINCHI (va oxirgi) yo'l: `applyPieceRecount`, `applySupplyPieceIntake`,
`applyReturnPieceIntake`. Sinf EMAS, funksiyalar — K4 ning
`consumePiecesForSale` naqshi (DI qo'shish uchala servisning konstruktorini
va mavjud test fayllarini MAZMUNSIZ o'zgartirardi).

**Hujjat wiring'i:** uchala servisda AYNI shakl — `create`/`update` da tarkib
tekshiriladi (erta signal, bayroqdan qat'i nazar), `post` da esa faqat
`pieceTracked` tovarda reyestr hizalanadi va bu **qoldiq deltalari bilan BIR
TRANZAKSIYADA** ketadi. `pieceTracked` mavjud so'rovlarga qo'shildi — uchala
oqimda ham **qo'shimcha so'rov YO'Q** (K3 naqshi). Natija hujjat javobiga
additiv maydon bo'lib qaytadi (`pieceRecount` / `pieceReturn`) — bosilishi
kerak bo'lgan yorliqlar va ogohlantirishlar shundan olinadi; audit'ga ham
raqamlar yoziladi.

**Web:** `lib/piece-entry.ts` (klient parseri) + `components/stock-piece/piece-entry-field.tsx`
(uchala oqim ishlatadigan BITTA maydon: yig'indi avtomat, «Reyestrdan olish»
tugmasi, ogohlantirishlar). Ulandi: inventarizatsiya yacheyka-tabi
(`position-meta` endi `pieceTracked` va joriy reyestrni ham qaytaradi —
bayroqli tovar bo'lmasa so'rov UMUMAN ketmaydi), priyomka yacheyka ustuni
(`wholeOnly`), `/omborchi/vozvrat` qatorlari. i18n **ru+uz** (9 kalit).

---

**3. Rejadan ONGLI CHETLASHISHLAR (uchta).**

1. **Priyomkada FAQAT butun rulon.** Reja «5 ta rulon × 250 m» deydi va
   bo'lak haqida jim. Qaror: bo'lak (yorliqli ham, `?` ham) RAD etiladi.
   Sabab: priyomka ekranida yorliq bosish oqimi yo'q, ya'ni bo'lakni jimgina
   qabul qilish uni YORLIQSIZ qoldirardi — reyestrdagi yorliqsiz bo'lakni
   esa omborchi javondan topa olmaydi (K1 ning `piece-without-label` guardi
   ham aynan shu). Qoldiq bo'lak K2 ekranida yorliq bilan qo'shiladi.
2. **Inventarizatsiya `cancel()` da reyestrga TEGILMAYDI.** Hujjat bekor
   qilinganda qoldiq deltalari qaytariladi, bo'lak reyestri esa sanalgan
   holatida QOLADI. Sabab: sanash natijasi — omborchining KO'ZI bilan ko'rgan
   jismoniy haqiqati; javondagi rulonlar hujjat bekor qilingani uchun
   o'zgarmaydi. Reyestrni «orqaga qaytarish» yolg'on bo'lardi. Sverka farqni
   KO'RSATADI va bu TO'G'RI signal («qoldiq qaytarildi, tarkib esa haqiqiy»).
   ⚠️ Bu ochiq qarz sifatida 10-bandda yozilgan.
3. **Vozvratda `alreadyActive` ogohlantirishi ekranda KO'RSATILMAYDI.**
   Server uni javobda qaytaradi (`pieceReturn.alreadyActive`) va u audit'da
   ham bor, lekin `/omborchi/vozvrat` ekrani hozircha faqat yorliq oynasini
   ochadi. Holat kam uchraydi (o'sha yorliq allaqachon omborda), lekin jim
   ham emas — javobda turibdi. 10-bandda qayd etilgan.

---

**4. Testlar.**

| Gate | Natija |
|---|---|
| Yangi `piece-intake-core.test.ts` | **40** (matn o'qish 15, format 2, miqdor 2, sanash 9, priyomka 3, vozvrat 6, lug'at 1, kanonik 2) |
| Yangi `stock-piece-intake.service.test.ts` | **17** (🔴 qoldiqqa tegmaslik 2, 400 yo'li 2, sanash 6, priyomka 3, vozvrat 4) |
| Yangi `stock-piece-intake-schema.test.ts` | **10** (sxema 3, migratsiya 4, rollback 3 — jumladan **kod va SQL AYNI lug'atni aytishi**) |
| Yangi `inventory-piece-recount.test.ts` | **11** (bayroq o'chiq 2, hizalanish 5, Σ sharti 3, qoldiq 1) |
| Yangi `supply-piece-intake.test.ts` | **6** |
| Yangi `sales-return-piece-return.test.ts` | **6** |
| Yangi web `lib/__tests__/piece-entry.test.ts` | **15** (🔴 server bilan SINXRONLIK qulfi) |
| Yangi web `piece-entry-field.test.tsx` | **10** |
| **Jami yangi** | **+115** |
| `apps/api` vitest TO'LIQ | 679 fayl (1 skip) · **9834 passed** · 2 skipped · **0 failed** ✅ |
| `apps/web` vitest TO'LIQ | 337 fayl · **4411 passed** · 26 skipped · **0 failed** ✅ |
| `turbo typecheck` (api, web, db, contracts…) | ✅ **10/10 successful** |
| i18n gate'lar (`apps/web/src/__tests__`) | ✅ 92 fayl / **1517 passed** |
| biome — YANGI fayllar (12 ta) | ✅ **0 xato, 0 ogohlantirish** |
| biome — `omborchi/vozvrat/page.tsx` | 20 ogohlantirish — **mening ishimdan OLDIN ham AYNI 20 ta** (bazaviy holat o'lchab solishtirildi) |

**Mavjud testga ATAYLAB tegilgan BITTA joy (o'chirilmadi, sabab bilan):**
`omborchi/vozvrat/page.test.tsx` — qabul payload'ida endi `pieceEntry: null`
ham ketadi (bo'linmaydigan tovarda). Izoh o'sha yerda yozilgan.

**🔴 Klient ↔ server sinxronlik qulfi.** Klient parseri (`lib/piece-entry.ts`)
serverning ikkinchi nusxasi — u ekranga «jami: 1220» deb yozadi va sanoq
maydonini o'zi to'ldiradi (har harfda serverga so'rov yuborish qulay ham,
ishonchli ham emas: aloqasiz omborda ekran o'lik bo'lib qolardi). Ikki nusxa
jimgina ajralib ketmasligi uchun **web testi server testidagi AYNI misollarni
AYNI kutilgan natijalar bilan qulflaydi** (repodagi mavjud naqsh —
`warehouse-state-core` ↔ `retail-stock-cascade` takrori bilan bir sabab).

---

**5. LOKAL ISBOT (`sherset_v2_dev` @ localhost, PG 18 — qoida 7 va 12).**

Baza jonli nusxa: 5354 `stocks`, 273 `stock_by_cell`, `stock_pieces` 0 qator.

| Qadam | Natija |
|---|---|
| Migratsiya, 1-yugurish | EXIT=0 |
| Migratsiya, 2-yugurish | EXIT=0, **to'liq no-op** |
| Ustunlar | `piece_entry` — `inventory_positions`, `supply_positions`, `sales_return_positions` (uchalasi `text`, `NULLABLE`) ✅ |
| CHECK | `stock_pieces_consumed_reason_known` → `('sold','scrap','cut-loss','closed','recount')` ✅ |
| **Qoldiq** | `stocks` 5354 / `sum(qty)` **52 524 230.387857** — migratsiyadan keyin ham AYNAN o'sha |

**Zond (`apps/api/src/scripts/k5-local-piece-intake-probe.sql`, o'zi ROLLBACK qiladi):**

```
1. USTUNLAR: uchala jadvalda `piece_entry` text / NULLABLE  ✅
2. `recount` sababi CHECK dan O`TADI (recount_qatorlar = 1)  ✅
3. OK — to`sildi: notanish `consumed_reason`                 ✅
4. SANASH sikli: 950 → 750, 4 qator (250+250+180+70)         ✅
5. stocks_qatorlar/jami · sbc_qatorlar/jami — TO'RTALASI ham `t`  🔴✅
6. ROLLBACK dan keyin zond qatorlari = 0                     ✅
```

Ya'ni **sanash sikli (yopish + uzunlik tuzatish + yangi qator) jismoniy bazada
o'lchandi va qoldiq bir grammga ham o'zgarmadi.**

**Qaytarish yo'li (qoida 12) — YOZILDI VA SINALDI:**
`packages/db/scripts/rollback/20260826120000_stock_piece_intake_down.sql`

```
cd packages/db && npx prisma db execute --schema prisma/schema.prisma \
  --file scripts/rollback/20260826120000_stock_piece_intake_down.sql
npx prisma migrate resolve --rolled-back 20260826120000_stock_piece_intake
npx prisma generate
```

Sikl lokal bazada: **DOWN** (uchala ustun ketdi, CHECK eski to'rt qiymatga
qaytdi) → **DOWN 2-marta** (to'liq no-op) → **UP** (3 ustun qaytdi, 23
cheklov — K4 dagi bilan AYNI son). Har qadamdan keyin qoldiq o'lchandi —
**o'zgarmadi**. Fayl boshida nima yo'qolishi, eksport buyruqlari va
tekshiruv so'rovi yozilgan.

🔴 **Rollback'ning nozik joyi ochiq yozilgan:** CHECK qaytarilganda `recount`
sababli qatorlar eski lug'atga sig'maydi va `ADD CONSTRAINT` YIQILARDI —
shuning uchun rollback avval ularni `closed` ga o'giradi. Bu YO'QOTISH
(farqning manbai «sanashda topilmadi» dan «qo'lda yopildi» ga aylanadi) va
fayl boshida shunday deb aytilgan.

**Drift:** `prisma migrate diff` da `piece_entry` bo'yicha bironta qator YO'Q.
Chiqishdagi boshqa qatorlar (`client_operations`, `restock_task_lines.shortage_*`,
`company_settings.sale_debt_term_days`, `updated_at DROP DEFAULT` naqshi)
mening ishimdan OLDIN ham bor edi — dev baza G6 va Q4 migratsiyalaridan orqada
(K1/K4 hisobotlari ham shuni qayd etgan).

---

**6. Deploy holati: ⛔ BAJARILMADI.**

Egasining 2026-08-25 dagi «Deploy YO'Q» qarori kuchda (G1 sessiyasidagi «C
yo'li», K1…K4 sessiyalarida takrorlangan). Jonli baza ochilmadi,
`warehouse-state.ts` yugurtirilmadi, VPS HEAD tekshirilmadi.

**K5 deploy deltasiga qo'shadigan narsa:** faqat **migratsiya**
(`prisma db execute --file …/20260826120000_stock_piece_intake/migration.sql`
→ `prisma migrate resolve --applied 20260826120000_stock_piece_intake` →
oxirida `prisma generate`). Yangi ruxsat-entity, yangi topup qadami, yangi
jonli sozlama YO'Q. **Jonli XULQ K5 dan o'zgarmaydi**: bayroq hech qayerda
yoqilmagan, `stock_pieces` bo'sh, yangi ustunlar NULL.

---

**7. QABUL MEZONI — bandma-band (qoida 11).**

| # | Mezon | Holat |
|---|---|---|
| 1 | **jonli** bitta yacheyka kabel bo'yicha sanalib, reyestr va `StockByCell.qty` mos kelgani | ⚠️ QISMAN — **lokal bazada zond bilan** ✅ (sanash sikli, qoldiq o'zgarmagani raqam bilan) va test darajasida ✅ (yadro 40 + wiring 11), **jonlida ❌** |
| 2 | **jonli** bitta priyomka rulon soni bilan kiritilib reyestrga tushgani | ⚠️ QISMAN — test darajasida ✅ (6 wiring testi: 5 ta yorliqsiz `whole` qator, bo'lak RAD, Σ sharti), **jonlida ❌** |
| 3 | vozvratda qaytgan bo'lak yorliq bilan reyestrga qaytishi | ⚠️ QISMAN — test darajasida ✅ (yorlig'i tanilsa AYNAN o'sha qator tiklanadi, yacheykaga ko'chadi), **jonlida ❌** |
| 4 | testlar + i18n ru+uz | ✅ |

**Uchtasi jonli tasdiq kutmoqda ⇒ K5 «QISMAN».** Yopish sharti: deploy +
8-banddagi smoke.

---

**8. Qoida 13 — uchma-uch smoke.** Bajarilmadi (deploy yo'q). Deploy kunida
bajariladigan minimal ro'yxat (K1…K4 ro'yxatlariga QO'SHIMCHA):

1. sinov tovarga (kabel) bayroq yoqilgan bo'lsin (K2 ekrani);
2. **PRIYOMKA:** yangi qabul → o'sha tovar qatori → yacheyka ustunida
   «250x5» → miqdor O'ZI 1250 bo'lsin → **post'dan OLDIN va KEYIN qoldiq
   yozib olinsin** (qoldiq +1250 bo'lishi KUTILADI — bu priyomkaning O'Z
   ishi) → K2 ekranida 5 ta yorliqsiz rulon paydo bo'lgani ko'rinsin;
3. **SANASH:** o'sha yacheykaga inventarizatsiya → tarkib maydonida
   «Reyestrdan olish» → `250x5` chiqsin → bittasini olib tashlab `250x4`
   qilinsin va miqdor O'ZI 1000 ga tushsin → post → qoldiq 1000 ga
   tenglashsin VA reyestrda 4 ta rulon qolsin (5-si `recount` sababi bilan
   chiqsin) → `/reports/piece-reconciliation` da «Farq yo'q» bo'lsin;
4. **Σ SHARTI:** tarkib «250x4» turganda miqdorni qo'lda 900 ga o'zgartirib
   post qilishga urinilsin → **400 va matn ikkala sonni aytsin**;
5. **VOZVRAT:** kesilgan bo'lak sotilgan chek bo'yicha `/omborchi/vozvrat` →
   qatorda yorliq maydoniga `BLK-…:180` → qabul → bo'lak reyestrda `active`
   bo'lib qaytsin va AYNI yorliq raqami saqlansin (skanerlanganda o'sha
   bo'lak ochilsin);
6. **bayrog'i O'CHIQ oddiy tovar bilan** bitta sotuv (post → tekshir →
   cancel), bitta yacheyka **sanash** (tarkibsiz), bitta **ko'chirish** —
   avvalgidek;
7. `packages/db` da `npx tsx scripts/warehouse-state.ts` — chiqish kodi 0.

Javobgar shaxs va vaqt deploy sessiyasida shu yerga yoziladi.

---

**9. ⚠️ Parallel sessiya va halol qaydlar (CLAUDE.md §6).**

- Sessiya boshida daraxt SOF EMAS edi: Q6 sessiyasining fayllari
  (`NEXT.md`, `debt/*`, `counterparty-settlement/*`, `scripts/q6-*`) va
  `docs/plans/2026-08-23-ombor-restrukturizatsiya.md` o'zgargan, deploy
  dossieri hamda uchta eski rollback `.sql` untracked turardi — **hech
  biriga tegilmadi** (§6.1). Commit aniq pathspec bilan qilindi va tarkibi
  `git show --name-only` bilan tekshirildi: begona fayl YO'Q.
- ⚠️ **`git stash` ishlatildi (bir marta, path-cheklangan).** Biome
  ogohlantirishlarining BAZAVIY sonini o'lchash uchun FAQAT o'z faylim
  (`omborchi/vozvrat/page.tsx`) stash qilinib darhol qaytarildi va holat
  tekshirildi. §6.7 A stash'ni umumiy daraxtda ogohlantiradi — shuning
  uchun bu yerda qamrov bitta faylga tortildi va natija qayd etilmoqda.
- **Lokal dev baza paroli** shu sessiyada foydalanuvchidan so'ralib olindi
  (K2 va G6 sessiyalari aynan shu to'siqqa tushib, isbotsiz qolgan edi).
  Parol repoga YOZILMADI: `packages/db/.env` yaratilmadi, buyruqlar
  `DATABASE_URL` env bilan yuritildi (qoida 5).

---

**10. Ochiq qolganlar / keyingi fazalarga.**

- **🔴 K1+K2+K3+K4+K5 ni yopish uchun:** bitta deploy +
  `topup-role-permissions.ts` (K2 uchun) + 8-banddagi smoke + oldingi
  fazalarning smoke ro'yxatlari.
- **Inventarizatsiya `cancel()` reyestrni qaytarmaydi** (3-bo'lim,
  2-chetlashish). Kerak bo'lsa: qatorlarni hujjatga bog'laydigan ustun
  (`recount_doc_id`) va teskari reja — alohida ish, K6 pilotining qarori.
- **Vozvratdagi `alreadyActive` ogohlantirishi ekranda ko'rsatilmaydi**
  (javobda bor). Kichik UI qo'shimchasi.
- **TSD'da tarkib kiritish yo'q** — sanash terminalda `CountScreen` orqali
  ketadi va u bo'lak tarkibini yubormaydi. Ya'ni bo'linadigan tovarni
  hozircha WEB'da sanash kerak. G6/K4 naqshi bilan qo'shilishi mumkin —
  alohida ish.
- **Yorliq raqami poygasi** (`stock-piece-intake.service.ts` docblock):
  Serializable yo'lda (inventarizatsiya) `40001` bo'lib chiqadi va
  `withSerializationRetry` uni avtomat qayta yuritadi; boshqa izolyatsiyada
  `P2002` bo'lib ANIQ xato qaytadi. Jim dublikat YO'Q (unikal indeks).
- **K6 ga:** bayroq siyosati (tovar kartochkasidagi joyi, «m» birligidagi
  yangi tovarda yoqilgan kelishi, «hal qilinmagan» ro'yxati) hamon K6 da.
  Pilotda kuzatilsin: Σ shartidan chiqqan 400 lar soni va omborchilar
  tarkibni yozishni unutmayaptimi.
- **Egasiga savollar:** **K-S4 endi JAVOB TALAB QILADI** — nechta kabel
  nomenklaturasi va taxminan nechta bo'lak yotibdi. K5 vositalari tayyor,
  lekin birinchi to'ldirishning HAJMI shundan bilinadi (bir yacheyka bir
  hujjat bo'lsa nechta hujjat kerak). K-S1 va K-S2 hamon ochiq.

### K4 — Omborchi kesim oqimi (picking ichida) + posting · ⚠️ QISMAN (qoida 11) · 2026-08-26

**Holat: QISMAN.** Kod, migratsiya, sirt, TSD ekrani, i18n va testlar tayyor;
migratsiya **LOKAL dev bazada to'liq isbotlangan** (UP ×2 → zond → DOWN ×2 → UP)
va **APK HAQIQATAN QURILDI** (`BUILD SUCCESSFUL`). Qabul mezonining **jonli**
bandi BAJARILMAGAN (deploy yo'q ⇒ jonli tovarda, jonli terminalda va jonli
printerda tekshirilmadi). Faza «TUGADI» deb yopilmaydi. K1+K2+K3 bilan BIR
deployda yopiladi; **K4 deploy deltasiga TO'QQIZINCHI migratsiyani qo'shadi**
(`20260826000000_stock_piece_cut`). Yangi ruxsat-entity YO'Q ⇒
`topup-role-permissions.ts` ga K4 hech narsa qo'shmaydi (u K2 uchun baribir
MAJBURIY).

---

**0. Egasidan olingan IKKI JAVOB (K4 ni boshlashdan oldin so'raldi).**

| Savol | Javob | Ma'nosi |
|---|---|---|
| **K-S3** — bir mijozga 2 bo'lak berilganda chekda nechta qator? | **1 qator: «180 m (150+30)»** | K3 ning xulqi saqlanadi; kesim BITTA pozitsiyaga bog'lanadi, tarkib esa izoh. Reja 9-bo'limidagi «K4 dan OLDIN javob talab qiladi» bandi shu bilan YOPILDI. |
| **Chiqindi (<1 m) va kesim yo'qotishi bilan nima qilinsin?** | **Faqat REYESTRDAN chiqsin, QOLDIQQA TEGILMASIN** | Reja «avtomatik hisobdan chiqarish» degan edi va bu ikki xil o'qilardi. Egasi stok-neytral yo'lni tanladi ⇒ **K4 ham K1/K2/K3 kabi qoldiqqa umuman tegmaydi**. Farqni sverka KO'RSATADI, tuzatish inventarizatsiya ishi (K5). |

Ikkinchi javob K4 ning xavf-profilini TUBDAN o'zgartirdi: kesim oqimi jonli
QOLDIQ mexanizmiga (2026-08-24 hodisasining sinfi) umuman kirmaydi.

---

**1. Ikki tomonlama bog'liqlik javobi (qoida 10 — «bu o'zgarish qaysi mavjud
oqimni buzishi mumkin?»).**

| Oqim | Ta'sir | Dalil |
|---|---|---|
| **Qoldiq (`Stock`/`StockByCell`)** | **YO'Q** | Kesim STOK-NEYTRAL: 250 → 180 + 70, jami o'sha 250. Uch qavat qulf: (a) `stock-piece-cut.service.ts` manbasida `stock.create/update/upsert`, `stockByCell.*`, `executeRaw`, `applyDeltas` so'zlari UMUMAN yo'q — test manba matnini o'qib tekshiradi; (b) wiring testlarining fake klientida `stock`/`stockByCell` berilmagan — chaqirilsa TypeError bilan yiqilardi; (c) **lokal zond**: butun kesim+bekor+to'lov sikli davomida `stocks` (5354 qator / 52 524 230.387857) va `stock_by_cell` (273) bir grammga ham o'zgarmadi. |
| **Kassa sotuvi — TAQSIMOT** | YO'Q | `retail-allocation.ts` ga BIR BAYT ham tegilmagan. K3 ning 7.1 istisnosi o'z holicha. |
| **Kassa — `post()`** | 🔴 **O'ZGARADI, lekin FAQAT bayrog'i yoqilgan tovarda** | Qoldiq ayirish TRANZAKSIYASI ICHIDA yangi qadam: mijozga ketgan bo'laklar `consumed`/`sold` bo'ladi. Shart — `pieceTrackedIds.size > 0`, ya'ni bo'linadigan tovarsiz chekda reyestrga **so'rov ham ketmaydi**. Jonlida bayroq hech qayerda yoqilmagan (K1 o'lchovi: 5086 tovarning hammasida `false`) ⇒ deploy kuni jonli xulq O'ZGARMAYDI. Test bilan qulflangan («bo'lagi yo'q chek — sotuv avvalgidek»). |
| **Kassa — `cancel()`** | AYNI qoida | Bo'laklar `status` i TEGILMAYDI, faqat «mijoz oldida turibdi» bog'lanishi uziladi (pastda, 3-band). Bayroqsiz chekda so'rov ketmaydi. |
| **Kassa — chek YARATISH** | Yangi IXTIYORIY maydon | `positions[].pieceLengths` (`['150','30']`). Yuborilmasa ustun `NULL` — bugungi hamma chaqiruvchi uchun xulq o'zgarmaydi. Miqdorga TA'SIR QILMAYDI (K-S3). |
| **Yig'ish topshirig'i (G6)** | 🔴 **Qator YOPILISH SHARTI qattiqlashdi — faqat bo'linadigan tovarda** | `confirm` va `confirm-scan` endi kesim yozilganini talab qiladi. **LEKIN** reyestr BO'SH bo'lsa talab QO'YILMAYDI (`not-required`) — K3 ning `no-registry` qoidasi bilan AYNI sabab: jonlida reyestr bo'sh va kesimni majburiy qilish birinchi kundayoq har kabel yig'ishini to'xtatardi. Uch test buni ikki tomondan qulflaydi. |
| **Topshiriq javobi (`GET /restock-tasks/:id`)** | Additiv maydonlar | Bayrog'i o'chiq qatorda faqat `pieceTracked: false` qo'shiladi va **reyestrga so'rov KETMAYDI** (test). G6 ning TSD ekrani va web checklist'i eski maydonlarni o'qiydi — ular o'zgarmadi. |
| **TSD skan (`/tsd/scan`)** | Xulq o'zgardi (KUTILGAN) | `BLK-` kodi endi `supported: false` emas, BO'LAK qaytaradi. K1 hisoboti aynan shuni «K4 to'ldiradi» deb yozgan va test allaqachon turgan edi — u yangilandi (o'chirilmadi). Narx maydoni yo'qligi alohida test bilan qulflandi. |
| **TSD allowlist** | Bitta `exact` qator | `POST /restock-tasks/:id/lines/:lineId/cut`. Reyestrning qolgani (`/stock-pieces`) TSD'ga HAMON YOPIQ — test bilan. |
| **Ruxsat matritsasi / rollar** | YO'Q | Yangi entity qo'shilmadi. Kesim yo'li qator tasdiqlash bilan BIR sirt (`INTENTIONALLY_OPEN`, sababi bilan) — **klass-qulf `mutation-guard-coverage` uni O'ZI USHLADI**, ya'ni qo'riqchi ishlayapti. |
| **G2 kontrol / G3 vozvrat / G4 taqsimoti / Q-A rejalari** | YO'Q | Bu modullarga tegilmagan; to'liq to'plamlar yashil. |
| **H2/H3 (jonli holat reyestri)** | YO'Q | Ombor TUZILMASIGA (`Store`, `__posPriority`, `__posFrontStore`, `__brakStore`) tegilmadi; `docs/ops/jonli-holat.md` ga qo'shiladigan yangi JONLI HOLAT yo'q. |
| **Eng yomon holat** | Reyestr haqiqatdan uzilib qoladi | Kassa avvalgidek ishlayveradi (qoldiq alohida), sverka farqni ko'rsatadi. Kesim oqimining o'zi savdoni TO'XTATA olmaydi — yagona qattiq shart (kesimsiz yopilmaslik) reyestr TO'LA bo'lgandagina kuchga kiradi. |

🔴 **Bitta ochiq xavf, ochiq yozilgan.** Reyestr to'ldirilgan tovarda omborchi
kesimni yozmasdan qatorni yopa olmaydi. Bu ATAYLAB (K4/5-vazifa), lekin
**yig'ishni sekinlashtiradigan yagona nuqta**. Yumshatuvchi uchta narsa:
(a) reyestr bo'sh tovarda shart umuman yo'q; (b) xato matni NIMA QILISHNI
aytadi; (c) K6 pilotida bayroq faqat kabel guruhiga yoqiladi.

---

**2. Nima qilindi.**

**Sxema + migratsiya `20260826000000_stock_piece_cut`** (idempotent DDL, faqat
QO'SHADI):

| Jadval | Qo'shildi | Nega |
|---|---|---|
| `stock_pieces` | `reserved_sale_id`, `reserved_position_id` (FK → **SET NULL**) | Kesilgan bo'lak QAYSI chek qatoriga ajratilgani. SET NULL ataylab: chek bekor qilinsa yoki qatorini kontrol o'chirsa bo'lak omborda YORLIG'I bilan qolaveradi (kesilgan kabelni qaytarib ulab bo'lmaydi). |
| `stock_pieces` | `consumed_reason` (`sold`\|`scrap`\|`cut-loss`\|`closed`) + 2 CHECK | Sverkadagi farqni tushuntiradigan YAGONA joy. Chiqindi/yo'qotish qoldiqqa tegmagani uchun farq KO'RINADI — sababsiz kamayish IS-5 xatosi bo'lardi. |
| `retail_sale_positions` | `piece_lengths` (text, «150+30») | Kassirning mijoz bilan KELISHUVI. K3 uni faqat savatda saqlardi (K3 hisobotining «K4 uchun ASOSIY qarz» bandi) — endi omborchiga yetib boradi. |
| `restock_task_lines` | `position_id` (FK → SET NULL) | Yig'ish qatori qaysi chek pozitsiyasidan chiqqani. Busiz kesim pozitsiyani `(chek, tovar)` juftligidan TAXMIN qilardi va kassir bir tovarni ikki qator qilsa bo'lak noto'g'ri qatorga biriktirilardi. |

**Sof yadro `apps/api/src/modules/stock-piece/piece-cut-core.ts`** (Prisma yo'q):

- `planCut` — kesim rejasi. **ZANJIR INVARIANTI**: `mijoz + qoldiq + chiqindi +
  yo'qotish = manba` (funksiya ichida ham tekshiriladi — `chain-mismatch`).
  Chiqindi chegarasi 1 m (K-Q6, inklyuziv: aynan 1 m yorliq oladi).
- **`take-whole` alohida hukm**: mijoz manbaning HAMMASINI olsa jismonan hech
  narsa kesilmaydi ⇒ yangi yorliq ham, yangi qator ham ochilmaydi, manbaning
  O'ZI qatorga biriktiriladi.
- `parsePieceLengths` / `formatPieceLengths` — kelishuv matni (vergul nuqtaga
  o'giriladi; BITTA bo'lak kelishuv EMAS va saqlanmaydi).
- `evaluateCutCoverage` / `canConfirmPieceLine` — qator yopilishi sharti,
  `not-required` SUKUT bilan (yuqoridagi `no-registry` qoidasi).
- `planSaleConsumption` — to'lovda qaysi bo'laklar chiqadi + `mismatches`
  (sotuvni TO'XTATMAYDI).

**Servis `stock-piece-cut.service.ts`** — `stock_pieces` ga yozadigan IKKINCHI
(va oxirgi) yo'l: `findSource` (id yoki `BLK-` yorlig'i), `cut`, `nextSeq`,
`releasePosition`. Chek hayotiy sikli esa **sof funksiyalar**
(`consumePiecesForSale`, `releasePiecesForSale`) — sabab 3-bandda.

**Yig'ish oqimi (`restock-task`):** yangi `POST /restock-tasks/:id/lines/:lineId/cut`
(`clientOpId` bilan — oflayn navbat takroridan himoya), qator KESIMSIZ
yopilmasligi (`confirm` va `confirm-scan` ikkalasida), `findById` javobiga
bo'lak konteksti (`pieceOptions`, `cutPieces`, `agreedLengths`, `cutCoverage`).
Kesim + qator yopilishi **BITTA tranzaksiyada**; yorliq poygasi `P2002` da
qayta uriniladi (`MAX_LABEL_RETRIES` endi K2 bilan BIR joyda).

**Kassa (`retail-sale`):** `post()` da bo'laklar `sold` (qoldiq ayirish
tranzaksiyasi ICHIDA), `cancel()` da bog'lanish uziladi, `create/update` da
`pieceLengths` chek qatoriga yoziladi, `createPickingTasksForSale` qatorga
`positionId` beradi.

**TSD (Kotlin):** yangi `CutScreen.kt` (manba tanlash/skan → kesilgan uzunlik →
qolgan uzunlik → yorliq raqamlari), `TaskDetailScreen` da «✂ Kesish» tugmasi,
`ScanInfoScreen` da bo'lak ko'rinishi, `ApiClient.cut`, 16 yangi matn.

**Web:** `/restock-tasks/[id]` — qatorda kelishuv va kesilgan bo'laklar, kesim
oynasi (skaner-do'st `BLK-` maydoni + manba ro'yxati + kesilgan/qolgan uzunlik)
va **kesimdan keyin AVTOMATIK ochiladigan yorliq oynasi** (K2 ning
`PieceLabelPrintOverlay` i qayta ishlatildi). POS savatidagi `pieceLengths`
endi chekka ketadi. i18n **ru+uz** (14 kalit).

---

**3. Rejadan ONGLI CHETLASHISHLAR (to'rtta).**

1. **🔴 Chiqindi va kesim yo'qotishi QOLDIQNI kamaytirmaydi** — reja
   «avtomatik hisobdan chiqarish» degan edi. **Egasining 2026-08-25 qarori**
   (0-band): faqat reyestrdan chiqadi. Ular `consumed` qator bo'lib YOZILADI
   (`scrap` / `cut-loss` sababi bilan) — ya'ni zanjir yig'indisi manbaga teng
   qoladi va sverkadagi farq TUSHUNTIRILADI.
2. **Chek hayotiy sikli — servis metodi emas, SOF FUNKSIYA.**
   `RetailSaleService` ga 8-chi DI parametrini qo'shish **27 ta mavjud test
   faylini** mazmunsiz o'zgartirardi (har biri servisni qo'lda quradi).
   Funksiya `tx` ni argument oladi, holati yo'q ⇒ DI ham, yangi modul importi
   ham kerak emas. Modul chegarasi buzilmadi: `stock_pieces` ga yozadigan kod
   HAMON `stock-piece` modulida.
3. **TSD kesimi OFLAYN NAVBATGA qo'yilmaydi** (reja «offline bufer bilan»
   degan). Sabab `CountScreen` (sanash) dagi bilan bir sinf, lekin dalil
   boshqa: **yorliq RAQAMINI server beradi**, ya'ni aloqasiz kesimni yozib
   bo'lmaydi — omborchi bosadigan yorliqda raqam bo'lmasdi, kesimning butun
   ma'nosi esa yorliqda. Ekran «aloqa yo'q» deydi va kiritilgan sonlar joyida
   qoladi (jim yo'qotish yo'q, IS-5).
4. **Yorliq TERMINALDA bosilmaydi** — TSD'ga printer ulanmagan. Terminal yangi
   `BLK-` raqamlarini KO'RSATADI, chop etish web/K2 ekranida (o'sha
   `PieceLabelPrintOverlay`). Web oqimida yorliq oynasi kesimdan keyin O'ZI
   ochiladi, ya'ni reja 5-bo'limining «yorliq bilan tugaydi» sharti web'da
   to'liq, terminalda esa raqam berilishi darajasida bajarildi.

---

**4. Testlar.**

| Gate | Natija |
|---|---|
| Yangi `piece-cut-core.test.ts` | **25** (kelishuv 4, kesim rejasi 11, qator yopilishi 6, to'lov 3, xato matnlari 1) |
| Yangi `stock-piece-cut.service.test.ts` | **10** (🔴 qoldiqqa tegmaslik, kesim, `take-whole`, chiqindi+yo'qotish qatorlari, yorliq makoni, to'lov, bekor qilish, ketma-ketlik) |
| Yangi `restock-task-cut-wiring.test.ts` | **15** (kesim yozuvi 8, kesimsiz yopilmaslik 5, topshiriq konteksti 2) |
| Yangi `retail-sale-piece-lifecycle.test.ts` | **5** (post 3, cancel 1, `pieceLengths` 1) |
| Yangi web `restock-tasks/[id]/page.test.tsx` | **6** |
| `tsd.service.test.ts` | **+2** (bo'lak topiladi / topilmaydi) + 1 tasi qayta yozildi (`supported:false` → bo'lak) |
| `tsd-policy.test.ts` | **+1** (kesim ochiq, `/stock-pieces` yopiq) |
| `mutation-guard-coverage.test.ts` | `INTENTIONALLY_OPEN` ga sabab bilan qator |
| **Jami yangi** | **+64** |
| `apps/api` vitest TO'LIQ | 673 fayl (1 skip) · **9718 passed** · 2 skipped · **0 failed** ✅ |
| `apps/web` vitest TO'LIQ | 335 fayl · **4385 passed** · 26 skipped · **0 failed** ✅ (raw-element gate tuzatilgach) |
| `turbo typecheck` api+web+db+contracts | ✅ 4/4 |
| i18n gate'lar (`apps/web/src/__tests__`) | ✅ 92 fayl / **1517 passed** |
| biome (yangi/tegilgan fayllar) | ✅ 0 xato (formatlash qo'llandi) |
| **TSD APK** | ✅ **`BUILD SUCCESSFUL`** — `app-debug.apk` **7,78 MB** (G6 dagi 7,1 MB dan yangi ekran hisobiga o'sgan) |

**Mavjud testlarga ATAYLAB tegilgan joylar (o'chirilmadi, sabab bilan):**
`restock-task-shortage-wiring` va `picking-sheets-grouping` — servis
konstruktoriga uchinchi bog'liqlik qo'shildi va fake klientga bayroq so'rovi
(bayroq O'CHIQ, ya'ni G6 o'lchovlari o'zgarmadi); `retail-sale-piece-alloc-wiring`
— `post()` endi bayroqli tovarda reyestrni ham yopadi (bu dunyoda reyestr
bo'sh); `tsd.service.test` — yuqorida.

**⚠️ Halol qayd — web'dagi bitta gate MENING ishimdan yiqildi va TUZATILDI:**
`raw-element-conventions` xom `<select>` ni taqiqlaydi; kesim oynasidagi manba
tanlagichi dizayn-tizimning `NativeSelect` iga ko'chirildi. Ya'ni yuqoridagi
«0 failed» tuzatishdan KEYINGI o'lchov.

---

**5. LOKAL ISBOT (`sherset_v2_dev` @ localhost, PG 18 — qoida 7 va 12).**

Baza jonli nusxa: 5354 `stocks`, 273 `stock_by_cell`, `stock_pieces` 0 qator,
bayroqli tovar 0.

| Qadam | Natija |
|---|---|
| Migratsiya, 1-yugurish | EXIT=0 |
| Migratsiya, 2-yugurish | EXIT=0, **to'liq no-op** |
| Ustunlar | `reserved_sale_id`/`reserved_position_id` uuid, `consumed_reason` varchar, `piece_lengths` text, `position_id` uuid — **5 ta** |
| FK siyosati | uchalasi ham `confdeltype = n` (**SET NULL**) — loyihalanganidek |
| CHECK | `stock_pieces_*` bo'yicha **6 ta** (K1 ning 4 tasi + K4 ning 2 tasi) |
| Indekslar | 3 tasi ham joyida |
| **Qoldiq** | `stocks` 5354 / `sum(qty)` **52 524 230.387857** — migratsiyadan keyin ham AYNAN o'sha |

**Zond (`apps/api/src/scripts/k4-local-piece-cut-probe.sql`, o'zi ROLLBACK qiladi):**

```
2. ZANJIR: manba=250, bolalar yig`indisi=250.000000  ✅ TENG
   FAOL (reyestrda sanaladigan) = 248.000000 (kutilgan 248)
3. OK — to`sildi: notanish `consumed_reason`
   OK — to`sildi: FAOL bo`lakda `consumed_reason`
4. BEKOR: bo`lak holati=active, uzunlik=180.000000  ✅ OMBORDA QOLDI
5. TO`LOV: sabab=sold, reyestrda sanaladimi=YO`Q ✅
6. stocks_ozgarmadi=true · stock_by_cell_ozgarmadi=true
7. ROLLBACK dan keyin zond qatorlari = 0
```

Ya'ni **kesim → bekor qilish → to'lov** siklining hammasi jismoniy bazada
o'lchandi va **qoldiq bir grammga ham o'zgarmadi**.

**Qaytarish yo'li (qoida 12) — YOZILDI VA SINALDI:**
`packages/db/scripts/rollback/20260826000000_stock_piece_cut_down.sql`
```
cd packages/db && npx prisma db execute --schema prisma/schema.prisma \
  --file scripts/rollback/20260826000000_stock_piece_cut_down.sql
npx prisma migrate resolve --rolled-back 20260826000000_stock_piece_cut
npx prisma generate
```
Sikl lokal bazada: **DOWN** (5 ustun ham ketdi, K1 jadvali JOYIDA) → **DOWN
2-marta** (to'liq no-op) → **UP** (5 ustun qaytdi, 23 cheklov). Har qadamdan
keyin qoldiq o'lchandi — **o'zgarmadi**. Fayl boshida nima yo'qolishi va
qaytarishdan oldingi eksport buyruqlari yozilgan.

**Drift:** `prisma migrate diff` da K4 ga tegishli yangi qator YO'Q. Ikkita
mavjud qator (`stock_pieces.updated_at DROP DEFAULT` — K1 qayd etgan naqsh;
`restock_task_lines.shortage_at` — dev baza G6 migratsiyasidan orqada) mening
ishimdan OLDIN ham bor edi.

---

**6. Deploy holati: ⛔ BAJARILMADI.**

Egasining 2026-08-25 dagi «Deploy YO'Q» qarori kuchda (G1 sessiyasidagi «C
yo'li», K1/K2/K3 sessiyalarida takrorlangan). Jonli baza ochilmadi,
`warehouse-state.ts` yugurtirilmadi, VPS HEAD tekshirilmadi.

**K4 deploy deltasiga qo'shadigan narsa:** faqat **migratsiya**
(`prisma db execute --file …/20260826000000_stock_piece_cut/migration.sql` →
`prisma migrate resolve --applied 20260826000000_stock_piece_cut` →
oxirida `prisma generate`). Yangi ruxsat-entity, yangi topup qadami, yangi
jonli sozlama YO'Q. **Jonli XULQ K4 dan o'zgarmaydi**: bayroq hech qayerda
yoqilmagan, `stock_pieces` bo'sh, yangi ustunlar NULL.

---

**7. QABUL MEZONI — bandma-band (qoida 11).**

| # | Mezon | Holat |
|---|---|---|
| 1 | sinov tovarda uchma-uch: buyurtma → kesim → «bajardim» → to'lov → qoldiq | ⚠️ QISMAN — **lokal bazada zond bilan** ✅ (kesim/bekor/to'lov sikli, qoldiq o'zgarmagani raqam bilan) va test darajasida ✅ (wiring 15 + lifecycle 5), **jonlida ❌** |
| 2 | har qadamda sverka farq bermagan | ⚠️ QISMAN — zondda FAOL bo'laklar 248 = kutilgan qoldiq, `stocks` o'zgarmadi; jonli sverka ekranida ❌ |
| 3 | mijoz kesimdan keyin voz kechgan ssenariyda qoldiq o'zgarmagani va yangi bo'lak yorliq bilan qolgani **jonli tekshirilgan** | ⚠️ QISMAN — zond + test ✅ (`cancel()` `status` ga TEGMAYDI), **jonlida ❌** |
| 4 | stok-neytrallik, invariant, i18n ru+uz, testlar | ✅ |

**Uchtasi jonli tasdiq kutmoqda ⇒ K4 «QISMAN».** Yopish sharti: deploy +
8-banddagi smoke.

---

**8. Qoida 13 — uchma-uch smoke.** Bajarilmadi (deploy yo'q). Deploy kunida
bajariladigan minimal ro'yxat (K1/K2/K3 ro'yxatlariga QO'SHIMCHA; TSD tomoni
`android/tsd-app/README.md` dagi «K4 qabul mezoni» bo'limida, 9 band):

1. sinov tovarga (kabel) bayroq yoqilgan va 3 butun rulon + 4 bo'lak kiritilgan
   (K2 ekrani);
2. kassada 180 m bilan chek → «Omborchiga yuborish» → topshiriqda qator
   **«Kesish»** tugmasi bilan chiqsin, kassir kelishuvi («150 + 30») ko'rinsin;
3. **kesimdan OLDIN va KEYIN qoldiq yozib olinsin — bir grammga ham
   o'zgarmasligi SHART** (eng muhim band);
4. kesim → yorliq oynasi O'ZI ochilsin → BOSILSIN → skanerlanganda AYNAN o'sha
   bo'lak ochilsin;
5. qator O'ZI yopilsin va chek KONTROLGA tushsin (G2 zanjiri buzilmagan);
6. boshqa kabel qatorida kesimsiz «Joylandi» → **rad etilsin**;
7. chekni to'lash → qoldiq kamaysin, bo'lak reyestrdan chiqsin, sverka farq
   bermasin;
8. yangi chekda kesim yozib chekni BEKOR qilish → bo'lak omborda yorlig'i
   bilan QOLSIN, qoldiq o'zgarmasin;
9. **bayrog'i O'CHIQ oddiy tovar bilan bitta sotuv** (post → tekshir → cancel),
   bitta yacheyka **sanash**, bitta **ko'chirish** — avvalgidek;
10. `packages/db` da `npx tsx scripts/warehouse-state.ts` — chiqish kodi 0.

Javobgar shaxs va vaqt deploy sessiyasida shu yerga yoziladi.

---

**9. ⚠️ Parallel sessiya (CLAUDE.md §6 — HALOL QAYD).**

Sessiya davomida repoda boshqa Claude sessiyasi (Q6 — jonli tekshiruv
skriptlari) ishladi: `NEXT.md`, `apps/api/src/modules/debt/*`,
`apps/api/src/modules/counterparty-settlement/*` va `apps/api/src/scripts/q6-*`
fayllari. **Hech biriga tegilmadi** va commitga kiritilmadi (§6.1). Commit
aniq pathspec bilan qilindi va tarkibi `git show --stat` bilan tekshirildi.
Deploy dossieri va uchta eski rollback `.sql` hamon UNTRACKED — ular ham
meniki emas (K3 hisobotidagi qayd kuchda).

---

**10. Ochiq qolganlar / keyingi fazalarga.**

- **🔴 K1+K2+K3+K4 ni yopish uchun:** bitta deploy + `topup-role-permissions.ts`
  (K2 uchun) + 8-banddagi smoke + TSD README dagi 9 bandli terminal smoke.
- **APK jonli qurilmada sinalmagan** (terminal hali yo'q) — G5/G6 dan meros
  qarz, K4 uni kengaytiradi (kesim ekrani).
- **Yorliq terminalda bosilmaydi** (3-band, 4-chetlashish) — kerak bo'lsa
  ESC/POS print-agent yoki bluetooth printer alohida ish.
- **`take-whole` da mijoz bo'lagi yorliqsiz ketishi mumkin** (butun rulon
  to'lig'icha ketsa). Bu TO'G'RI (K-Q3: butun rulonda yorliq yo'q), lekin
  kassir «qaysi rulonni bering» deyishda faqat uzunlikka tayanadi.
- **Vozvratda qaytgan bo'lak** reyestrga QAYTMAYDI — K5/3-vazifa (reja
  8-bo'limi) o'z fazasida quriladi.
- **Kesim `sourcePieceId` zanjiri hisobotda ko'rsatilmaydi** — «bu bo'lak
  qaysi rulondan chiqqan» savoliga javob DB'da bor, ekranda yo'q. Kerak
  bo'lsa K5/K6 da kichik qo'shimcha.
- **Egasiga savollar:** K-S1, K-S2, K-S4 hamon ochiq (K-S3 shu sessiyada
  YOPILDI). **K-S4** (nechta kabel nomenklaturasi, taxminan nechta bo'lak) —
  K5 ning ish hajmi shundan bilinadi.
- **K5 ga tayyor ulanish nuqtalari:** `planCut` (inventarizatsiyada ham
  ishlatiladi), `PIECE_CONSUMED_REASON`, `StockPieceCutService.releasePosition`
  (kesimni qayta yozish), `parsePieceLengths` (kelishuvni o'qish).

### K3 — Kassir ko'rinishi + avto-taqsimot istisnosi · ⚠️ QISMAN (qoida 11) · 2026-08-25

**Holat: QISMAN.** Kod, sirt, i18n va testlar tayyor; qabul mezonining **jonli**
bandi BAJARILMAGAN (deploy yo'q ⇒ jonli tovarda tekshirilmadi). Faza «TUGADI»
deb yopilmaydi. K1+K2 bilan BIR deployda yopiladi — K3 **migratsiya
QO'SHMAYDI** va `topup-role-permissions.ts` ga ham hech narsa qo'shmaydi
(yangi ruxsat-entity YO'Q).

---

**1. Ikki tomonlama bog'liqlik javobi (qoida 10 — «bu o'zgarish qaysi mavjud
oqimni buzishi mumkin?»).**

| Oqim | Ta'sir | Dalil |
|---|---|---|
| **Kassa sotuvi — TAQSIMOT** | 🔴 **O'ZGARADI, lekin FAQAT bayrog'i yoqilgan tovarda** | `pieceTracked = true` bo'lsa Q1-v2 ning **3-holati (bo'linish) o'chadi**: bitta manba butun miqdorni qoplashi shart, aks holda `no-single-source` sababi bilan 400. Bayroq o'chiq tovarda to'plam BO'SH ⇒ dvigatel bir qadam ham boshqacha yurmaydi (test: «bayroq O'CHIQ: 180 ikki yacheykadan BO'LINADI»). Jonlida bayroq **hech qayerda yoqilmagan** (K1 lokal o'lchovi: 5086 tovarning hammasida `false`) ⇒ deploy kuni jonli xulq O'ZGARMAYDI. |
| **Kassa — rezerv (`sendToPicking`)** | AYNI qoida | Rezerv ham ajratmadan quriladi. Ataylab: rezerv ikki ombordan tushib `post()` uni rad etsa — hech qachon bo'shamaydigan hold (G4 2a hisobotining 3-bandi bilan bir sabab). Xato mijoz oldida emas, savat bosilgan lahzada chiqadi. |
| **Yetishmovchilik XABARI** | Matn ikkiga bo'lindi | `insufficient` uchun matn **bir harf ham o'zgarmagan** (test bilan qulflangan); `no-single-source` uchun yangi matn — «yetmaydi» deyish YOLG'ON bo'lardi (tovar BOR, faqat bir bo'lakda emas) va kassir mijozni bekorga qaytarardi. |
| **Qoldiq (`Stock`/`StockByCell`)** | YO'Q | K3 birorta yozuv yo'lini ochmaydi. Yangi servis faqat `findFirst`/`findMany` qiladi — test bilan qulflangan («yozish metodlarini UMUMAN chaqirmaydi»). |
| **Bo'lak reyestri (K1/K2)** | YO'Q | K3 `stock_pieces` ga YOZMAYDI, faqat o'qiydi. K2 ekrani va K1 sverkasi tegilmagan. |
| **Ruxsat matritsasi / rollar** | YO'Q | Yangi entity QO'SHILMADI. Yangi yo'l `product.view` ostida — kassirda (`role-templates.ts` → `cashier`) allaqachon bor ⇒ topup, seed va snapshotlar TEGILMAGAN. |
| **Kiosk allowlist** | Bitta `exact` qator | `GET /stock-pieces/availability` — AYNAN shu yo'l. Reyestrning qolgani (ro'yxat, qo'shish, tuzatish, «tugadi», bayroq, sverka) kioskka YOPIQ, test bilan (`kiosk-policy.test.ts` +3). Ikki qulf birga: marshrut + ruxsat. |
| **BRAK ombori (G3/E4)** | ISTISNO qilingan | Brak bo'laklari kassir ekranida «bor» bo'lib ko'rinmaydi (test). Aks holda kassir mijozga sotib bo'lmaydigan tovarni va'da qilardi. |
| **TSD (G5/G6)** | YO'Q | `tsd-scan.ts`, `tsd-policy.ts` tegilmagan; `/tsd/scan` hamon `supported: false` (K4 to'ldiradi). |
| **H2/H3 (jonli holat reyestri)** | YO'Q | Ombor TUZILMASIGA (`Store`, `__posPriority`, `__posFrontStore`, `__brakStore`) tegilmadi; yangi JONLI HOLAT yo'q ⇒ `docs/ops/jonli-holat.md` ga qo'shiladigan qator yo'q. |
| **Eng yomon holat** | Reyestr noto'g'ri yoki bo'sh | Panel JIM turadi va hech narsani to'smaydi; taqsimot esa bayroq yoqilgan tovarda bo'lishni rad etadi — ya'ni eng yomon holat «kassir qatorni qo'lda bo'ladi», savdo to'xtamaydi. |

🔴 **Bitta ochiq xavf, ochiq yozilgan.** Bayroq yoqilgan tovarda qoldiq ko'p
yacheykaga sochilgan bo'lsa (masalan 2 dona: 07 da 1, 02 da 1) chek **400 oladi**
va kassir qatorni bo'lishi kerak. Bu ATAYLAB (K-reja 7.1), lekin **savdoni
sekinlashtiradigan yagona nuqta** — shuning uchun K6 pilotida bayroq FAQAT
kabel guruhiga yoqiladi va birinchi hafta kuzatiladi. Yumshatuvchi uchta narsa
kodda: (a) manba = yacheyka YOKI **yacheykasiz hovuz**, ya'ni jonlidagi ~94 %
qoldiq bitta manba bo'lib qatnashadi; (b) `allowNegativeStock` yoqilgan omborda
eski erkinlik saqlanadi; (c) xabar kassirga NIMA QILISHNI aytadi (eng katta
bo'lak qancha).

---

**2. Nima qilindi.**

**Sof yadro `apps/api/src/modules/stock-piece/piece-offer-core.ts`** (Prisma yo'q):

- `buildPieceComposition` — butun rulonlar GURUHLANADI (`250 × 3`), bo'laklar
  individ qator; `registryQty`, `activePieces`, **`longest` (eng uzun uzluksiz)**.
  Faqat `status='active'` — K1 sverkasi bilan AYNI qoida.
- `planPieceOffer` — uch hukm: **`single`** (yolg'iz qoplaydigan ENG KICHIK
  bo'lak — Q1-v2 falsafasi, lekin K-Q4 bo'yicha faqat TAVSIYA),
  **`needs-split`** (`150 + 30` taklifi, kattadan kichikka), **`not-enough`**
  (jami ham yetmaydi).
- 🔴 **`no-registry` — SUKUT.** Reyestr bo'sh yoki miqdor hali kiritilmagan
  bo'lsa hukm ham, ogohlantirish ham YO'Q. Bayroq yoqilgan-u reyestr
  to'ldirilmagan holat K5 gacha NORMAL; o'sha paytda «bo'lak yo'q» deb
  qichqirish kassirni yo'q muammo bilan to'xtatardi.
- Teng uzunlikda **kesilgan bo'lak butun rulondan afzal**: butun rulonni kesish
  javonda yangi qoldiq tug'diradi.

**Servis `stock-piece-availability.service.ts`** (FAQAT O'QISH) +
**`GET /stock-pieces/availability`** (`assortmentId`, ixtiyoriy `storeId`,
`quantity`). Bayrog'i O'CHIQ tovarda `stock_pieces` ga **umuman so'rov
ketmaydi** va javob bo'sh. BRAK omborlari filtrlanadi. Ruxsat —
**`product.view`**: bu tovar kartochkasining KO'RINISHI, reyestr BOSHQARUVI
emas (`piecetracking` — yozuv huquqi, K-Q9).

**Taqsimot istisnosi (7.1)** — `retail-sale/retail-allocation.ts`:

- `AllocationInput.pieceTracked?: ReadonlySet<string>`; 3-holat (bo'linish) shu
  tovarlarda QO'LLANMAYDI;
- `AllocationShortfall` endi **`reason`** (`insufficient` | `no-single-source`)
  va `largestSingle` bilan; `buildShortfallMessage` — sabab bo'yicha ikki matn;
- **`collectPieceTracked`** — bayroq POZITSIYA bilan birga o'qiladi
  (`product: { select: { pieceTracked } }`), **qo'shimcha so'rov YO'Q** (test:
  post() da `product.findMany` hamon BITTA marta — narx snapshot'i uchun);
- `retail-sale.service.ts`: `post()` va `sendToPicking()` to'plamni uzatadi,
  ikkala 400 ham yangi xabar funksiyasidan quriladi.

**Kiosk** (`kiosk-policy.ts`): `exact` qator `GET /stock-pieces/availability`.

**Web:**

- `components/pos/piece-offer-panel.tsx` — qator oynasida bo'lak tarkibi,
  «Eng uzun uzluksiz» qatori, hukm bloki (yashil/sariq/qizil), ombor kesimi va
  **«Shunday bo'lib berish»** tugmasi. Bayroq o'chiq yoki reyestr bo'sh bo'lsa
  `null` qaytaradi (ekran bir bayt ham o'zgarmaydi).
- `components/pos/cart-line-edit-modal.tsx` — panel + kassir kelishuvi qatori;
  `CartLineEditTarget.pieceTracked`, natijada `pieceLengths`. **Miqdorga QO'LDA
  tegilsa kelishuv BEKOR** (eski tarkib yangi miqdorga yolg'on ko'rsatma
  bo'lardi).
- `sotuv/page.tsx` + `_components/pos-types.ts` — `pieceTracked` tovar
  qatoridan savatga ko'chadi, `pieceLengths` savat qatorida saqlanadi;
  `_components/sotuv-mode.tsx` — savat qatorida `180 (150 + 30)`.
- `lib/piece-composition.ts` — tarkib matni **bitta manbadan**: kassa ekrani va
  tovar kartochkasi bir xil o'qishi shart.
- `components/product-detail-widget.tsx` — «Qoldiqlar» tabida har ombor ostida
  bo'lak qatori (`250 × 3 · 200 · 150` + eng uzun uzluksiz), F1 ning yacheyka
  kesimidan YUQORIDA.
- `packages/contracts/src/product.ts` — `PosProductRow.pieceTracked`
  (ixtiyoriy). Tekshirildi: `/products` javobida maydon HAQIQATAN keladi
  (repository `include` → `...rest` bilan hamma skalyar yoyiladi).
- i18n **ru+uz**: yangi `pages.pieces` (9 kalit), `pages.sotuv.line_edit_pieces`,
  `product_detail_widget.stock_pieces` + `stock_pieces_longest`.

---

**3. Rejadan ONGLI CHETLASHISHLAR (uchta).**

1. **🔴 3-vazifa («pozitsiya bir nechta bo'lakdan iborat bo'la olishi») SAVAT
   darajasida bajarildi, SERVERDA emas.** Kassir uzunliklarni belgilaydi, ular
   savat qatorida va oynada ko'rinadi — lekin chekka YOZILMAYDI: `RetailSale`
   pozitsiyasida bunday maydon yo'q va uni qo'shish migratsiya + posting yo'liga
   tegish demakdir, ya'ni **K4 ning ishi** (kesim oqimi, `sourcePieceId`
   zanjiri). K3 ning o'z sarlavhasi «FAQAT O'QISH» deydi — chegara shu yerda
   tortildi. **Ochiq qarz sifatida 9-bandda yozilgan.**
2. **Taqsimot istisnosi YACHEYKA/hovuz darajasida ishlaydi, BO'LAK darajasida
   emas.** «Bitta manba qoplasin» sharti bajarilsa sotuv o'tadi, garchi o'sha
   yacheykada 180 m uzluksiz bo'lak bo'lmasligi mumkin (100 + 80). Sabab
   ataylab: reyestrni sotuvning SHARTI qilib qo'yish jonlida (reyestr hali
   bo'sh) har kabel sotuvini to'xtatardi. Bo'lak darajasidagi haqiqat kassirga
   PANEL orqali ko'rinadi, qaror mijoz bilan kelishiladi (K-Q5). Reyestr
   to'lgach (K5) shartni qattiqlashtirish mumkin — K6 pilotining qarori.
3. **Bayroq o'chiq tovarda ham so'rov ketadi** (server bo'sh javob qaytaradi):
   POS'da panel `line.pieceTracked` bo'yicha chizilgani uchun so'rov
   YUBORILMAYDI, tovar kartochkasida esa har tovarda bitta yengil so'rov
   bo'ladi. Alternativa (kartochkada shartli so'rov) `pieceTracked` ni sahifa
   yuklanishidan oldin bilishni talab qilardi — arzimas foyda uchun ortiqcha sim.

---

**4. Testlar.**

| Gate | Natija |
|---|---|
| Yangi `piece-offer-core.test.ts` | **21** (tarkib 8, `single` 5, `needs-split` 4, `not-enough` 1, sukut 3) |
| Yangi `stock-piece-availability.service.test.ts` | **11** (faqat-o'qish 4, bayroq o'chiq 1, BRAK 1, ombor kesimi 1, kirish 4) |
| Yangi `retail-sale-piece-alloc-wiring.test.ts` | **6** (post 4, sendToPicking 2) |
| `retail-allocation.test.ts` | **+9** (istisno 6, xabar 3) → fayl jami 44 |
| `kiosk-policy.test.ts` | **+3** (yo'l ochiq, qolgani yopiq, faqat GET) → fayl jami 111 |
| Yangi web `piece-offer-panel.test.tsx` | **11** |
| Yangi web `cart-line-edit-pieces.test.tsx` | **6** |
| Yangi web `lib/__tests__/piece-composition.test.ts` | **5** |
| **Jami yangi** | **+72** |
| `apps/api` vitest TO'LIQ | 666 fayl (1 skip) · **9600 passed** · 2 skipped · **0 failed** ✅ |
| `apps/web` vitest TO'LIQ | 334 fayl · **4380 passed** · 26 skipped · **0 failed** ✅ |
| `turbo typecheck` (api, web, db, contracts) | ✅ 5/5 |
| i18n gate'lar (`apps/web/src/__tests__` to'liq) | ✅ 92 fayl / 1517 passed |
| biome — YANGI fayllar | ✅ 0 xato, **0 ogohlantirish** |
| biome — `cart-line-edit-modal.tsx` | 2 ogohlantirish — **mening ishimdan OLDIN ham AYNI 2 ta** (HEAD nusxasi bilan o'lchab solishtirildi) |

**Ikkita MAVJUD test ATAYLAB yangilandi (o'chirilmadi):**
`retail-allocation.test.ts` va `retail-sale-cascade-wiring.test.ts` dagi
`shortfalls` shakli endi `reason` maydonini ham kutadi; sabab izoh bilan
o'sha yerda yozilgan.

⚠️ **Halol qayd:** K1 va K2 hisobotlarida qayd etilgan yiqilgan web testlari
(A3/Q4 sessiyalarining i18n va typecheck qarzlari) bu sessiyada **YO'Q** —
ikkala suite ham 0 failed, ya'ni o'sha qarzlar oradagi commitlarda yopilgan.

---

**5. Deploy holati: ⛔ BAJARILMADI.**

Egasining 2026-08-25 dagi «Deploy YO'Q» qarori kuchda (G1 sessiyasidagi «C
yo'li», K1 va K2 sessiyalarida takrorlangan). Jonli baza ochilmadi,
`warehouse-state.ts` yugurtirilmadi, VPS HEAD tekshirilmadi.

**K3 deploy deltasiga hech narsa QO'SHMAYDI:** migratsiya yo'q, yangi
ruxsat-entity yo'q, topup qadami yo'q, jonli sozlama yo'q. U K1+K2 bilan
bitta deployda boradi.

**Qaytarish yo'li (qoida 12).** K3 jonli MA'LUMOTGA tegadigan skript ham,
migratsiya ham qo'shmaydi ⇒ teskari DDL kerak emas. Qaytarish ikki bosqichli:
(1) kod — `git revert` (panel va yo'l yo'qoladi, `stock_pieces` qolaveradi);
(2) **jonli xulqni bir soniyada qaytarish** — bayroqni o'chirish
(`POST /stock-pieces/flag`, K2 ekrani): bayroq o'chgan zahoti taqsimot AVVALGI
(bo'linadigan) yo'lga qaytadi va panel yo'qoladi. Ya'ni qaytarish uchun deploy
ham, skript ham shart emas — bu ATAYLAB shunday qurilgan (2026-08-24 saboqi:
qaytarish yo'li OLDIN tayyor bo'lsin).

---

**6. QABUL MEZONI — bandma-band (qoida 11).**

| # | Mezon | Holat |
|---|---|---|
| 1 | bayroq yoqilgan sinov tovarda kassa ekranida **tarkib** va **«eng uzun uzluksiz»** DB dagi haqiqiy bo'laklarga teng (test bilan qulflangan) | ⚠️ QISMAN — TEST darajasida ✅ (yadro egasining `250×3 · 200 · 150 · 70 · 50 = 1220` misolini raqam bilan qulflaydi; servis testi DB→yadro simlarini, web testi ekranga chiqishini), **jonlida ❌** |
| 2 | bayroq **O'CHIQ** tovarlarda kassa ekrani **mutlaqo o'zgarmagan** | ✅ test bilan: panel chizilmaydi VA so'rov umuman yuborilmaydi; server bo'sh javob qaytaradi va reyestrga bormaydi |
| 3 | bayroq **O'CHIQ** tovarlarda **taqsimot** mutlaqo o'zgarmagan | ✅ test bilan: sof dvigatel (`split` o'z holicha), wiring (ikki delta), xabar matni baytma-bayt eski |
| 4 | i18n ru+uz, testlar | ✅ |

**Birinchi band jonli tasdiq kutmoqda ⇒ K3 «QISMAN».** Yopish sharti: deploy +
7-banddagi smoke (bayroq yoqilgan bitta sinov tovar bilan).

---

**7. Qoida 13 — uchma-uch smoke.** Bajarilmadi (deploy yo'q). Deploy kunida
bajariladigan minimal ro'yxat (K1/K2 ro'yxatlariga QO'SHIMCHA):

1. sinov tovarga (kabel) bayroq yoqiladi (K2 ekrani) va 3 butun rulon +
   4 bo'lak kiritiladi;
2. kassada o'sha tovar savatga qo'shiladi → qator oynasida tarkib
   `250 × 3 · 200 · 150 · 70 · 50` va «Eng uzun uzluksiz: 250» ko'rinadi;
3. miqdor 180 → yashil «uzluksiz bor»; 400 → sariq «uzluksiz yo'q» + taklif;
   5000 → qizil «yetmaydi»;
4. **bayrog'i O'CHIQ oddiy tovar** bilan bitta sotuv — ekran ham, taqsimot ham
   avvalgidek (post → tekshir → cancel);
5. bitta yacheyka **sanash** va bitta **ko'chirish** — avvalgidek;
6. `packages/db` da `npx tsx scripts/warehouse-state.ts` — chiqish kodi 0.

Javobgar shaxs va vaqt deploy sessiyasida shu yerga yoziladi.

---

**8. ⚠️ Parallel sessiya (CLAUDE.md §6 — HALOL QAYD).**
Sessiya boshida daraxt SOF EMAS edi: `docs/plans/2026-08-23-ombor-restrukturizatsiya.md`
(F-reja) o'zgargan, `docs/ops/2026-08-25-deploy-dossieri.md` va uchta rollback
`.sql` untracked holda turardi — **hech biriga tegilmadi** va commitga
kiritilmadi (§6.1). Commit aniq pathspec bilan qilindi.

---

**9. Ochiq qolganlar / keyingi fazalarga.**

- **🔴 K1+K2+K3 ni yopish uchun:** bitta deploy + `topup-role-permissions.ts`
  (K2 uchun) + 7-banddagi smoke.
- **🔴 K4 uchun ASOSIY qarz:** kassir kelishgan bo'lak tarkibi (`pieceLengths`)
  hozircha FAQAT savatda yashaydi — serverga ketmaydi va omborchi uni chekda
  ko'rmaydi. K4 kesim oqimini qurganda uni pozitsiya ajratmasi bilan birga
  saqlasin, aks holda kassirning mijoz bilan kelishuvi omborga yetib bormaydi.
- **K4 ga tayyor ulanish nuqtalari:** `planPieceOffer(...).single` — omborchiga
  ko'rsatiladigan tavsiya manba; `buildPieceComposition` — TSD ekranidagi
  ro'yxat; `AllocationShortfall.reason === 'no-single-source'` — kesim oqimining
  kirish signali; `StockPieceAvailabilityService` modulda EXPORT qilingan.
- **K6 ga:** bayroq siyosati (tovar kartochkasidagi joyi, «m» birligidagi yangi
  tovarda yoqilgan kelishi, «hal qilinmagan» ro'yxati) hamon K6 da — K3 bayroqni
  faqat O'QIYDI. Pilotda 1-banddagi «ochiq xavf» kuzatilsin: bayroq yoqilgan
  tovarda 400 lar soni.
- **Bo'lak darajasidagi qat'iy tekshiruv** (3-bo'limning 2-chetlashishi) —
  reyestr to'lgach (K5) qayta ko'riladi.
- **Egasiga savollar hamon ochiq:** K-S1…K-S4. **K-S3 endi K4 dan OLDIN javob
  talab qiladi:** bir mijozga 2 bo'lak berilganda chekda 2 qator bo'ladimi yoki
  1 qator «180 m (150+30)» — hozirgi K3 xulqi ikkinchisiga qurilgan (bitta
  pozitsiya, tarkib esa izoh sifatida), soliq/chek talabi tekshirilmagan.

### K2 — Bo'lak reyestri boshqaruvi + yorliq · ⚠️ QISMAN (qoida 11) · 2026-08-25

**Holat: QISMAN.** Ekran, API, ruxsat entity'si, yorliq va testlar tayyor;
qabul mezonining **jonli** bandlari BAJARILMAGAN (deploy yo'q ⇒ jonli printer
va jonli skaner sinovi ham yo'q). Faza «TUGADI» deb yopilmaydi.

🔴 **Qoida 11 dan CHETLASHISH — egasining ko'rsatmasi bilan.** K1 hisoboti
«K2 BOSHLANMAYDI» deb yozgan edi (K1 ning jonli tasdig'i yo'qligi uchun).
Egasi shu sessiyada K2 ni bajarishni ANIQ so'radi. Shuning uchun K2 kodi
yozildi, lekin **ikkala faza ham QISMAN bo'lib qoladi** va ikkalasi
BIR VAQTDA, bitta deploy bilan yopiladi (K2 K1 ning jadvalisiz umuman
ishlamaydi). Yopish sharti pastda, 6-bandda.

---

**1. Ikki tomonlama bog'liqlik javobi (qoida 10 — «bu o'zgarish qaysi mavjud
oqimni buzishi mumkin?»).**

| Oqim | Ta'sir | Dalil |
|---|---|---|
| **Kassa sotuvi** (`retail-sale.service`, taqsimot, rezerv, post/cancel) | YO'Q | K2 `retail-sale` moduliga bir bayt ham tegmaydi. Yangi yo'llar `/stock-pieces` ostida va faqat `stock_pieces` + `products.piece_tracked` ga yozadi. |
| **Qoldiq ayirish** (`stock.service`, `StockByCell`) | YO'Q | 🔴 Test bilan qulflangan: `stock-piece-registry.service.test.ts` → «K2 servisi qoldiqqa YOZMAYDI» (fake klientda `stock`/`stockByCell` da faqat `findFirst`/`findMany` bor; servis manbasida `stock*.create/update/delete/upsert` va `executeRaw` YO'Q). Kesim/yopish STOK-NEYTRAL. |
| **Inventarizatsiya** | YO'Q | Tegilmagan (bo'lak kiritish inventarizatsiyaga K5 da qo'shiladi). |
| **TSD skan (G5/G6)** | YO'Q | `tsd-scan.ts` ga tegilmagan; `/tsd/scan` hamon `supported: false` (K4 to'ldiradi). Yangi `GET /stock-pieces/lookup` — ALOHIDA yo'l va u `BLK-` makonidan tashqaridagi kodni UMUMAN qidirmaydi (400 qaytaradi) ⇒ tovar multi-hit tanlovi bilan to'qnashmaydi (7.3). |
| **Ruxsat matritsasi / rollar** | 🔴 **O'ZGARADI** | Yangi entity `piecetracking`. `warehouse_manager` view+create+update oladi; `storekeeper`/`cashier` yozish OLMAYDI. Boshqa rollarda faqat `READ_ONLY_BASE` ning umumiy `view/print` i (har yangi entity kabi — `warehousenumbering` bilan bir naqsh). **Deploy'da `topup-role-permissions.ts` MAJBURIY qadam** (G2/G3 naqshi) — K1 dan farqi shu. |
| **Sverka hisoboti (K1)** | YO'Q | `report.view` ostida qolaveradi; K2 unga tegmadi. Ekrandagi sverka va hisobotdagi sverka BIR XIL son berishi test bilan qulflangan. |
| **H2/H3 (jonli holat reyestri)** | YO'Q | Ombor TUZILMASIGA (`Store`, `StoreCell`, `__posPriority`, `__brakStore`) tegilmaydi. |
| **Q/A rejalari (kassa qarzi, avans)** | YO'Q | Kesishmaydigan modullar (parallel sessiya bilan fayl to'qnashuvi — 8-band). |
| **Eng yomon holat** | Reyestr noto'g'ri to'ldiriladi | Kassa avvalgidek ishlayveradi: reyestr qoldiqning YONIDA turadi, uning O'RNIDA emas. Sverka farqni ko'rsatadi, hech nima to'xtamaydi. |

---

**2. Nima qilindi.**

**Sof yadro `apps/api/src/modules/stock-piece/stock-piece-registry-core.ts`**
(Prisma yo'q, SQL yo'q):

- `parseLengthInput` — omborchi kiritgan qiymatni `Decimal(20,6)` satriga
  keltiradi. 🔴 **Vergul nuqtaga o'giriladi** (`250,5` → `250.5`): uz/ru
  klaviaturasi vergul beradi va u jimgina yiqilsa kesim yo'qotishi aynan
  shunday yo'qolardi. Kasr 6 xonagacha, butun qismi 14 xonagacha.
- `parsePieceLabelSeq` / `nextPieceSeq` / `issuePieceLabels` — **yorliq
  ketma-ketligi** (K1 «`seq` ni kim beradi — K2 hal qiladi» deb qoldirgan edi).
- `planPieceCreation` — «qo'shish» rejasi: butun rulon ⇒ YORLIQSIZ qatorlar
  (K-Q3), bo'lak ⇒ ketma-ket yorliq; 1 m dan kalta RAD (K-Q6); bir bosishda
  ko'pi bilan 200 qator. Har qator K1 ning `validatePiece` guardidan o'tadi.
- `buildRegistryView` — ekran ko'rinishi: butun rulonlar GURUHLANADI
  (`250 m × 3`), bo'laklar alohida qator; har yacheyka uchun sverka;
  «eng uzun uzluksiz» (K3 shu sondan foydalanadi).

**🔴 Yorliq raqami — QANDAY berilishi (K1 ning ochiq savoli).** Hisoblagich
JADVALI qo'yilmadi: u yangi migratsiya bo'lardi va deploy deltasiga to'qqizinchi
migratsiyani qo'shardi. O'rniga `label DESC` bo'yicha BITTA qator o'qiladi
(yorliqlar 6 xonaga to'ldirilgan ⇒ leksikografik tartib 9 999 999 gacha raqamli
tartib bilan bir xil), poyga esa `P2002` da **qayta urinish** bilan yopiladi
(`analitika/order.service` naqshi, 5 urinish). DB unikal indeksi (K1,
`@@unique([accountId, label])`) oxirgi to'siq bo'lib qoladi — ya'ni poyga
«yashirin dublikat» emas, ochiq xato beradi.

**Servis `stock-piece-registry.service.ts`** — `list`, `lookup`, `create`,
`update`, `close`, `setFlag`. Har mutatsiya javobida (ombor × tovar) kesimidagi
YANGILANGAN sverka qaytadi (K2/4-vazifa: «har o'zgarish sverkani buzsa —
ekranda darhol ko'rinadi»). Doira tekshiruvi: ombor va tovar akkauntniki,
**yacheyka SHU omborniki** (aks holda bo'lak begona joyga «yopishib» qolardi va
sverka abadiy farq berardi).

**API (`stock-piece.controller.ts`):**

| Yo'l | Ruxsat |
|---|---|
| `GET /stock-pieces/reconciliation` (K1) | `report.view` — **o'zgarmadi** |
| `GET /stock-pieces?storeId=&assortmentId=` | `piecetracking.view` |
| `GET /stock-pieces/lookup?code=BLK-…` | `piecetracking.view` |
| `POST /stock-pieces` | `piecetracking.create` |
| `PATCH /stock-pieces/:id` | `piecetracking.update` |
| `POST /stock-pieces/:id/close` | `piecetracking.update` |
| `POST /stock-pieces/flag` | `piecetracking.update` |

**`DELETE` ATAYLAB YO'Q:** «tugadi» = `status='consumed'`, o'chirish emas —
`sourcePieceId` tarix zanjiri uzilmasin (K4 kesim zanjiri shunga tayanadi).
Test buni qulflaydi (`piecetracking.delete` hech bir rolda yo'q).

**Ruxsat `piecetracking`** — 8 joyga ulandi: `permissions.types.ts` (union +
runtime nusxa), `role-templates.ts` (warehouse_manager grant),
`template-topup.ts` (`TOPUP_ENTITIES`), `topup-role-permissions.ts`,
`permissions.service.ts`, `roles.controller.ts` (ro'yxat + guruh),
`packages/db/prisma/seed.ts`, `apps/web/src/lib/access-sections.ts`
(admin ekranda bera/ola olishi uchun — `storecell` dagi I4 sabog'i).
Rol shabloni snapshotlari yangilandi (6 ta).

**Web:**
- `/omborchi/bolaklar` — ombor + tovar tanlash, yorliq skaneri, sverka satri
  (Qoldiq · Reyestr · Farq · Faol bo'laklar · Eng uzun uzluksiz), butun
  rulon/bo'lak qo'shish, uzunlikni tuzatish, yacheykaga ko'chirish, «tugadi»,
  yorliq bosish/qayta bosish;
- `components/omborchi/piece-label-print.tsx` — bo'lak yorlig'i (58×40 mm):
  **UZUNLIK eng katta element** + `BLK-` Code128 shtrixi + kod matni + tovar
  nomi va yacheyka kodi;
- `/omborchi` panelida «Bo'laklar» havolasi (`piecetracking.view` bilan);
- i18n **ru+uz** (50 kalit + `access_entity_piecetracking`).

---

**3. Rejadan UCHTA ONGLI CHETLASHISH.**

1. **🔴 Bayroq tugmasi K2 ekraniga qo'yildi** (reja bo'yicha bayroq siyosati —
   K6). Sabab: sverka mezoni FAQAT `pieceTracked = true` tovarlar
   (`buildPieceReconciliation`), bayroqni yoqadigan birorta sirt esa hali yo'q
   edi ⇒ K2 ning qabul mezonini — «reyestr `StockByCell.qty` bilan mos kelgani
   KO'RSATILGAN» — bajarib bo'lmasdi. Bu yerda faqat **shu ekrandagi tugma**
   bor; tovar kartochkasidagi joyi, «m» birligidagi yangi tovarda yoqilgan
   kelishi va «hal qilinmagan» ro'yxati — hamon K6 da. Ruxsat K-Q9 ga mos:
   `piecetracking.update` (katta omborchi + egasi/menejer).
2. **Yorliq `window.print()` bilan bosiladi, print-agent (17777) orqali EMAS**
   (reja «label moduli + print-agent» degan edi). Sabab G3 vozvrat yorlig'i
   bilan AYNI: `POST /labels/render` tovar × nusxa sonini template
   geometriyasi bilan qaytaradi va javobida na yacheyka, na bo'lak tushunchasi
   bor; print-agent esa ESC/POS matn bosadi. Repodagi UCHALA yorliq sirti ham
   (`cell-label-print`, `qr-price-tag-print`, `return-label-print`) mijoz
   tomonda SVG chizib `window.print()` ga beradi — o'sha naqsh olindi.
   Printerga yo'naltirish brauzer/Electron chop dialogida qoladi.
3. **Bo'lakni boshqa OMBORGA ko'chirish YO'Q** — faqat ombor ICHIDA yacheyka
   almashadi. Omborlararo ko'chirish qoldiqni ham ko'chirishni talab qiladi
   (`Move` hujjati), ya'ni STOK-NEYTRALLIK buziladi. Reja «boshqa yacheykaga
   ko'chirish» deydi — aynan shu bajarildi.

**Yana bir ONGLI xulq (nuqson emas):** «tugadi» bosilganda reyestr kamayadi,
qoldiq esa joyida qoladi ⇒ sverka DARHOL farq ko'rsatadi. Bu K2/4-vazifaning
o'zi: ekran «endi qoldiqni ham tuzatish kerak» deb aytadi. Qoldiqning o'zini
tuzatish — inventarizatsiya/hisobdan chiqarish ishi (K4/K5). Test buni
qulflaydi (`«tugadi» bosilgach sverka DARHOL farqni ko'rsatadi`).

---

**4. Testlar.**

| Gate | Natija |
|---|---|
| Yangi `stock-piece-registry-core.test.ts` | **43** (uzunlik kiritish 12, yorliq 11, kiritish rejasi 9, ekran ko'rinishi 8, **ekran ↔ K1 hisoboti mosligi 2**) |
| Yangi `stock-piece-registry.service.test.ts` | **31** (qoldiqqa yozmaslik 2, create 10, update/close 8, lookup 4, bayroq 2, list 4, boshqalar) |
| Yangi `piece-tracking-permission.test.ts` | **23** (entity/amal shartnomasi, rollar, tor entity ma'nosi, topup) |
| Yangi web `omborchi/bolaklar/page.test.tsx` | **14** |
| `stock-piece` moduli JAMI | **152** (K1 ning 55 tasi ham yashil, bir qatori ham o'zgartirilmagan) |
| `apps/api` vitest TO'LIQ | 662 fayl · **9492 passed** · 2 skipped · **0 failed** |
| `apps/web` vitest TO'LIQ | 331 fayl · **4354 passed** · 26 skipped · **3 failed** (pastda — meniki EMAS) |
| `turbo typecheck` api + db | ✅ |
| `apps/web` typecheck | 1 xato — **meniki emas** (pastda) |
| biome (yangi/tegilgan fayllar) | ✅ 0 xato |
| i18n `key-existence` (ru+uz) va `no-hardcoded` | ✅ yashil |

> ⚠️ **HALOL QAYD — yiqilgan 3 test va 1 typecheck xatosi MENING ISHIMDAN
> EMAS.** Uchalasi ham parallel sessiyaning (Q4 — kassa qarzi muddati)
> COMMIT QILINMAGAN fayllaridan:
> - `domain-status-tone.test.ts` → aybdor fayl `app/(app)/menejer/undirish/page.tsx`;
> - `raw-element-conventions.test.ts` → aybdor fayl `app/(app)/settings/company/page.tsx`;
> - `pos/__tests__/customer-card-panel.test.tsx` → A3 avans tarixi yorlig'i;
> - typecheck TS2532 → `app/(app)/menejer/undirish/page.test.tsx:210`.
>
> Hech birida mening fayllarim yoki kalitlarim uchramaydi. §6.1 bo'yicha
> ularga TEGILMADI.
>
> ✅ **K1 hisoboti ogohlantirgan A3 i18n qarzi YOPILGAN** — `pages.pos.prepay_*`
> va `customer_card_prepaid*` kalitlarini shu sessiya davomida parallel sessiya
> ru+uz ga qo'shdi; web i18n gate endi YASHIL. (K1 hisobotining 8-bandidagi
> «deploy'dan oldin yopilsin» talabi bajarilgan.)

---

**5. Deploy holati: ⛔ BAJARILMADI.**

Egasining 2026-08-25 dagi «Deploy YO'Q» qarori kuchda (G1 sessiyasidagi «C
yo'li», K1 sessiyasida takrorlangan). Jonli baza ochilmadi,
`warehouse-state.ts` yugurtirilmadi, VPS HEAD tekshirilmadi.

**K2 MIGRATSIYA QO'SHMAYDI** — jadval va ustun K1 da (`20260825230000_
stock_piece_registry`). Deploy deltasi shu sababdan o'smaydi. **Lekin K2
YANGI DEPLOY QADAMI qo'shadi:**

```
# migratsiyalardan keyin, pm2 restart'dan OLDIN:
cd apps/api && npx tsx src/scripts/topup-role-permissions.ts
```

Usiz `piecetracking` hech bir jonli rolda bo'lmaydi va ekran HECH KIMDA
ochilmaydi (G2/G3 da aynan shu tuzoqqa tushilgan). Prod topup yugurtirilgach
`TOPUP_ENTITIES` dan `piecetracking` **DARHOL olib tashlanadi** va
`piece-tracking-permission.test.ts` dagi tegishli assert ham (test izohida
yozib qo'yilgan).

**Qaytarish yo'li (qoida 12).** K2 jonli MA'LUMOTNI o'zgartiradigan skript
ham, migratsiya ham qo'shmaydi ⇒ alohida teskari DDL kerak emas. Qaytarish
uch bosqichli va hammasi mavjud vositalar bilan:
1. kod — `git revert` (ekran va yo'llar yo'qoladi, jadval qolaveradi);
2. ruxsat qatorlari — `RolePermission` dan `entity='piecetracking'` ni
   o'chirish (yozuvchi sirt yo'qolgach ular ta'sirsiz qoladi);
3. kiritilgan bo'laklar — K1 ning rollback skripti
   (`packages/db/scripts/rollback/20260825230000_stock_piece_registry_down.sql`,
   K1 sessiyasida lokal bazada sinalgan) jadvalning o'zini tushiradi.
   Faqat bo'laklarni tozalash kerak bo'lsa:
   `DELETE FROM stock_pieces WHERE account_id = $1;` — qoldiqqa ta'sir
   qilmaydi, chunki `stock_pieces` hech qayerga ulanmagan.

---

**6. QABUL MEZONI — bandma-band (qoida 11).**

| # | Mezon | Holat |
|---|---|---|
| 1 | sinov tovarda **3 butun rulon + 4 bo'lak** kiritilib, sverka `StockByCell.qty` bilan to'liq mos kelgani ko'rsatilgan | ⚠️ QISMAN — TEST darajasida ✅ (`stock-piece-registry-core.test.ts` aynan shu ssenariyni — `250×3` yacheykada + `250·200·150·70·50` yacheykasiz = 1220 — qulflaydi va K1 hisoboti bilan bir xil son berishini isbotlaydi), **jonlida ❌** |
| 2 | yorliq **jonli printerda** bosilgan | ❌ deploy yo'q |
| 3 | yorliq **skanerlanganda AYNAN o'sha bo'lak** ochilgan (multi-hit YO'Q) | ⚠️ QISMAN — API darajasida ✅ (`lookup` massiv emas, BITTA obyekt qaytaradi; `BLK-` makonidan tashqaridagi kodni umuman qidirmaydi — test bilan qulflangan), **jonli skaner bilan ❌** |
| 4 | ruxsat, i18n ru+uz, testlar | ✅ |

**To'rttadan bittasi bajarilmagan, ikkitasi qisman ⇒ K2 «QISMAN».**
Yopish sharti: deploy + `topup-role-permissions.ts` + jonli 1–3 bandlar.

---

**7. Qoida 13 — uchma-uch smoke.** Bajarilmadi (deploy yo'q). Deploy kunida
bajariladigan minimal ro'yxat (K1 ning ro'yxatiga QO'SHIMCHA):
1. `topup-role-permissions.ts` yugurtirilgan va katta omborchida
   «Bo'laklar» havolasi KO'RINADI, oddiy omborchida yozish tugmalari YO'Q;
2. sinov tovarda 3 butun rulon + 4 bo'lak kiritilib, ekrandagi «Farq yo'q»
   va `/reports/piece-reconciliation` dagi «Farq yo'q» BIR XIL bo'lgani;
3. bitta yorliq bosilgan va SKANER bilan o'qilganda aynan o'sha bo'lak
   ochilgani (tovar multi-hit tanlovi OCHILMAGANI);
4. bitta sinov **SOTUV** (post → tekshir → cancel), bitta yacheyka **sanash**,
   bitta **ko'chirish** — avvalgidek o'tishi SHART;
5. `packages/db` da `npx tsx scripts/warehouse-state.ts` — chiqish kodi 0.
Javobgar shaxs va vaqt deploy sessiyasida shu yerga yoziladi.

---

**8. ⚠️ Parallel sessiya bilan to'qnashuv (CLAUDE.md §6.7 — HALOL QAYD).**

Sessiya davomida repoda boshqa Claude sessiyasi (Q4 — kassa qarzi muddati)
ishladi. **`apps/web/src/messages/{ru,uz}.json` IKKALAMIZ ham tahrirladik**:
mening 50 + 1 kalitim va ularning `settings.company` / `menejer_undirish` /
A3 avans kalitlari bitta ishchi nusxada turibdi. Commit'ga faqat MENING
kalitlarim kirishi uchun bu ikki fayl `git hash-object` + `git update-index
--cacheinfo` bilan aniq mazmun sifatida indeksga qo'yildi (ishchi daraxtga
TEGILMADI, ularning kalitlari joyida qoldi va o'z commitlariga tushadi).
Shu sabab commit hook'siz qilindi (§6.7 B — lint-staged butun daraxtni stash
qilib, tayyorlangan indeksni buzardi); gate'lar QO'LDA to'liq yugurtirildi
(4-band).

Mening boshqa fayllarim aniq pathspec bilan stage qilindi va commitdan keyin
`git show --stat` bilan tekshirildi.

---

**9. Ochiq qolganlar / keyingi fazalarga.**

- **🔴 K1 va K2 ni yopish uchun:** bitta deploy + `topup-role-permissions.ts`
  + 7-banddagi smoke.
- **Lokal DB isboti YO'Q** (K1 da bor edi): bu sessiyada `packages/db/.env`
  mavjud emas va `psql` PATH'da yo'q ⇒ dev bazaga ulanib bo'lmadi. K2
  migratsiya QO'SHMAGANI uchun isbotlanadigan DDL ham yo'q; isbot darajasi —
  sof yadro + servis wiring testlari. Deploy sessiyasi 7-banddagi ro'yxat
  bilan shu bo'shliqni yopadi.
- **K3 ga tayyor ulanish nuqtalari:** `buildRegistryView(...).totals.longest`
  — «eng uzun uzluksiz» (K3/1-vazifa) shu yerdan olinadi;
  `RegistryCellGroup.wholeGroups` — `3 × 250 · 200 · 150 · 70 · 50` tarkibini
  chizish uchun tayyor shakl. `StockPieceRegistryService` modulda EXPORT
  qilingan.
- **K4 ga:** kesim `sourcePieceId` bilan zanjir quradi — `close` DELETE emas,
  `consumed` qilgani shuning uchun. `MAX_LABEL_RETRIES` va `nextSeq` kesim
  paytida ham ishlaydi (yangi qoldiq bo'lagi yorliq oladi).
- **K6 ga:** bayroq tugmasi hozircha FAQAT `/omborchi/bolaklar` da. K6 uni
  tovar kartochkasiga ko'chiradi, «m» birligidagi yangi tovarda yoqilgan
  keladigan qiladi va «hal qilinmagan» ro'yxatini quradi. `POST
  /stock-pieces/flag` yo'li o'zgarishsiz ishlatiladi.
- **Yorliq raqami 9 999 999 dan oshsa** `label DESC` leksikografik tartibi
  raqamli tartibdan chetlashadi — raqam «sakraydi», unikallik buzilmaydi.
  Jonli omborda erishib bo'lmaydigan chegara, lekin qayd etib qo'yildi.
- **Bo'lakni omborlararo ko'chirish** — 3-bo'limdagi 3-chetlashish. Kerak
  bo'lsa `Move` hujjati bilan birga alohida ish.
- **Egasiga savollar hamon ochiq:** K-S1…K-S4. K-S4 (nechta kabel
  nomenklaturasi, taxminan nechta bo'lak) endi K5 dan oldin JAVOB TALAB
  QILADI — reyestrni qo'lda to'ldirish hajmi shundan bilinadi.

---

### K1 — Poydevor: model + sverka · ⚠️ QISMAN (qoida 11) · 2026-08-25 · `bc92330a`

**Holat: QISMAN.** Model, migratsiya, sverka servisi, hisobot sahifasi va testlar
tayyor; migratsiya LOKAL dev bazada to'liq isbotlangan (UP ×2 → zond → DOWN ×2 →
UP). Qabul mezonining **jonli** bandlari BAJARILMAGAN — egasi 2026-08-25 da
deploy'ni rad etdi (G1 sessiyasidagi «C yo'li» kuchda). Shu sabab faza «TUGADI»
deb yopilmaydi va **K2 boshlanmaydi**.

---

**1. Ikki tomonlama bog'liqlik javobi (qoida 10 — «bu o'zgarish qaysi mavjud
oqimni buzishi mumkin?»).** «Buzmaydi» degani dalil bilan:

| Oqim | Ta'sir | Dalil |
|---|---|---|
| **Kassa sotuvi** (`retail-sale.service`, G4 taqsimoti, rezerv, post/cancel) | YO'Q | Bu fazada `retail-sale` moduliga bir bayt ham tegilmagan (`git show --stat`). Yangi jadvalni o'qiydigan YAGONA joy — sverka servisi, u esa faqat `findMany` qiladi. |
| **Qoldiq ayirish** (`stock.service`, `applyDeltas`) | YO'Q | Migratsiyada `stocks`/`stock_by_cell` so'zlari UMUMAN uchramaydi (test bilan qulflangan: `stock-piece-schema.test.ts` → «migratsiya MAVJUD jadvallarga TEGMAYDI»). Yagona `ALTER TABLE` — `products` ga ustun qo'shish. Lokal isbotda `sum(qty)` bir tiyin o'zgarmadi. |
| **Inventarizatsiya** («faqat yacheyka kesimida», F-reja) | YO'Q | Inventarizatsiya kodiga tegilmagan; K5 ga qadar bo'lak kiritish oqimi umuman yo'q. |
| **TSD skan** (G5/G6) | XULQ O'ZGARMAYDI, kod bir joyga yig'ildi | `tsd-scan.ts` dagi `PIECE_CODE_PREFIX` endi yadrodan import qilinadi. Qiymat AYNAN o'sha (`BLK-`), `classifyScanCode` mantig'i tegilmagan; `tsd` moduli 20/20 test yashil, ular bir qatori ham o'zgartirilmagan. `/tsd/scan` hamon `supported: false` qaytaradi (K4 gacha shunday to'g'ri). |
| **Ruxsat matritsasi / rollar** | YO'Q | Yangi permission-entity qo'shilmadi (pastda, 3-band) ⇒ `topup-role-permissions.ts` ga qo'shimcha YO'Q, snapshotlar o'zgarmadi. |
| **H2/H3 (`warehouse-state.ts`, jonli holat reyestri)** | YO'Q | Bo'lak reyestri ombor TUZILMASIGA (`Store`, `StoreCell`, `__posPriority`, `__brakStore`) tegmaydi; reyestrga qo'shiladigan yangi JONLI HOLAT ham yo'q (jadval bo'sh, bayroq o'chiq). |
| **Q/A rejalari (kassa qarzi, avans)** | YO'Q | Kesishmaydigan modullar. |
| **Eng yomon holat** | Reyestr noto'g'ri bo'ladi | Kassa avvalgidek ishlayveradi (K-reja 10-bo'lim 5-band). Bu ATAYLAB: 2026-08-24 da savdo aynan qoldiq mexanizmiga tegilgani uchun 46 daqiqa to'xtagan edi. |

---

**2. Nima qilindi.**

**Model (`packages/db/prisma/schema.prisma`, +89 qator, faqat QO'SHISH):**
- `Product.pieceTracked` — «Bo'lak hisobi yuritilsin», `default(false)`;
- `StockPiece` — bitta qator = bitta jismoniy bo'lak; `Account`/`Store`/`StoreCell`
  ga back-relation.

**Rejadagi sxemadan UCHTA ONGLI CHETLASHISH** (reja «K1 fazasi aniqlashtiradi»
degani uchun):

1. **🔴 `cellId` NULL bo'la oladi** (rejada `cellId String`). Sabab — G-reja E1
   bilan AYNI: jonlida qoldiqning ~94 % i hech bir yacheykaga biriktirilmagan
   (`docs/ops/jonli-holat.md`). Faqat yacheykali bo'lakni qo'llaganda reyestr
   aynan eng katta qismni ko'ra olmasdi va sverka uni «farq» deb YOLG'ON qizil
   berardi. NULL = «ombordagi yacheykasiz qoldiq» — G4 ajratmasidagi naqsh.
2. **🔴 Yorliq unikalligi AKKAUNT ichida** (`@@unique([accountId, label])`,
   rejada global `label String? @unique`). Yorliq raqami akkaunt bo'yicha
   yuritiladi (`BLK-000001`), global unikallik esa ikkinchi tenantning birinchi
   yorlig'ini yozdirmasdi — `products.code` naqshi. 7.3 ning talabi
   («skanerlaganda AYNAN bitta bo'lak») baribir bajariladi: skan yo'llari
   akkaunt kesimida ishlaydi.
3. **`consumedAt` ustuni qo'shildi** (rejada yo'q) — `status='consumed'` ning
   qachon bo'lgani. K4 posting'iga kerak, kichik va additiv.

**Migratsiya `20260825230000_stock_piece_registry`** (idempotent DDL):
`ADD COLUMN IF NOT EXISTS` + `CREATE TABLE IF NOT EXISTS` + 4 FK
(`duplicate_object` bilan) + 4 indeks (`IF NOT EXISTS`).
FK siyosati: account **CASCADE**, store **RESTRICT** (bo'lagi bor ombor jimgina
o'chmasin), cell **SET NULL** (yacheyka o'chsa bo'lak ombor darajasiga TUSHADI —
CASCADE bo'lsa jismonan omborda turgan bo'lak hisobdan JIM yo'qolardi),
sourcePiece **SET NULL**.

**🔴 Guardlar IKKI QAVAT** (reja «DB check yoki servis guardi» degan edi —
ikkalasi ham qo'yildi, sabab bilan):

| Qoida | DB CHECK | Sof modul |
|---|---|---|
| `whole = true` ⟹ `label IS NULL` (K-Q3) | `stock_pieces_whole_has_no_label` | `whole-with-label` |
| uzunlik manfiy emas | `stock_pieces_length_nonnegative` | `length-negative` |
| FAOL bo'lak qat'iy musbat (`consumed` da 0 RUXSAT) | `stock_pieces_active_length_positive` | `active-length-not-positive` |
| holat yopiq lug'at | `stock_pieces_status_known` | `unknown-status` |
| bo'lak yorliqsiz bo'lmaydi | — (ikki qadamli yozishni bloklamaslik uchun) | `piece-without-label` |
| yorliq `BLK-` makonida | — | `label-outside-piece-space` |

Nega ikkala qavat: **lokal `prisma db push` bilan qurilgan bazada CHECK
BO'LMAYDI** (push sxemadan quradi, sxema esa CHECK'ni ifodalay olmaydi).
Ya'ni jonlida DB to'sadi, lokal dev'da esa faqat servis guardi — shuning uchun
guard sof modulda va testlar bilan qulflangan.

**Sof yadro `apps/api/src/modules/stock-piece/stock-piece-core.ts`** (Prisma yo'q):
- yorliq makoni — `PIECE_LABEL_PREFIX`, `isPieceLabel`, `formatPieceLabel`;
- guard — `validatePiece` / `assertValidPiece` (K2 yozishdan oldin chaqiradi);
- chiqindi chegarasi — `MIN_USEFUL_LENGTH = '1'`, `isScrapLength` (K-Q6);
- **`buildPieceReconciliation`** — sverka.

**🔴 Sverka IKKI QATLAMLI** (rejadagi invariant bitta qatlam edi):
(a) yacheykali bo'g'in — `StockByCell.qty`; (b) yacheykasiz bo'g'in —
`Stock.qty − Σ StockByCell.qty`. Ikkalasining yig'indisi ombor jamisiga TENG,
ya'ni tovarning har donasi sverkaga kiradi va reyestr «yarim to'la» bo'lib
qolmaydi. Faqat `status='active'` bo'laklar sanaladi.
Chiqishda `rows` (`ok`/`excess`/`missing`), `totals`, `warnings` va `truncated`.

**Ogohlantirishlar (IS-5 — jim qolgan nosozlik bo'lmasin):**
- `pieces-without-flag` — bayroq O'CHIQ, lekin reyestrda bo'lak bor;
- `invalid-piece` — qator model qoidasini buzadi (lokal push-bazasi yoki qo'lda
  yozilgan ma'lumot). Buzilgan qator BARIBIR sanaladi — sverka to'xtamaydi.
`truncated` — chegara tufayli ko'rsatilmagan qatorlar soni (jim kesish YO'Q).

**API:** `GET /stock-pieces/reconciliation` (`stock-piece.module/controller/
stock-piece-reconcile.service`), FAQAT O'QISH (`warehouse-state.ts` intizomi).
Filtrlar: `storeId`, `assortmentId`, `onlyDiff`, `limit` (≤2000, default 500).
**Ruxsat `report.view`, YANGI permission-entity ATAYLAB YO'Q** — yangi entity
`topup-role-permissions.ts` ni majburiy deploy qadamiga aylantirardi
(G2/G3 dagi `retailcontrol`/`returnacceptance` naqshi), K1 esa jonli holatga
imkon qadar kam tegishi kerak. K2 (yozadigan ekran) O'Z entity'sini oladi.

**Web:** `/reports/piece-reconciliation` — ombor filtri, «faqat farqlar»,
jamilar qatori, «farq yo'q» bloki, ogohlantirishlar bloki, CSV eksport;
`/reports` sahifasiga karta. i18n **ru+uz** (30 kalit + 2 karta kaliti).

**🔴 `BLK-` prefiksining YAGONA uyi endi yadro.** `tsd-scan.ts` dagi
`PIECE_CODE_PREFIX` shundan qayta eksport qilinadi. Sabab: ikki joyda ikki
qiymat bo'lib ketishi aynan K-reja 7.3 ogohlantirgan xato-klass bo'lardi
(omborchi bo'lakni skanerlaganda TOVAR multi-hit tanlovi ochilishi). Test
ikkalasi bir xilligini qulflaydi.

---

**3. LOKAL ISBOT (`sherset_v2_dev` @ localhost, PG 18 — qoida 7 va 12).**

Baza jonli nusxa: 259 jadval, 5086 tovar, 5354 `stocks`, 273 `stock_by_cell`.

| Qadam | Natija |
|---|---|
| Migratsiya, 1-yugurish | EXIT=0 |
| Migratsiya, 2-yugurish | EXIT=0, **to'liq no-op** (6 ta `skipping` NOTICE, FK lar `duplicate_object` bilan yutildi) |
| Ustun | `piece_tracked` boolean NOT NULL DEFAULT false; **5086 tovarning HAMMASI `false`** |
| Jadval | 14 ustun, `length` = numeric(20,6) — `StockByCell.qty` bilan AYNAN bir xil aniqlik |
| CHECK | 4 tasi ham bazadan o'qib tasdiqlandi |
| FK siyosati | `confdeltype` = **c** (account), **r** (store), **n** (cell), **n** (sourcePiece) |
| Indekslar | 5 ta (pkey + unikal `(account_id,label)` + 3 ta) — nomlari Prisma nikiga AYNAN mos |
| Qoldiq | `stocks` 5354, `stock_by_cell` 273, `sum(qty)` **52 524 230.387857** — migratsiyadan keyin ham AYNAN o'sha |

**Zond (`apps/api/src/scripts/k1-local-stock-piece-probe.sql`, o'zi ROLLBACK qiladi):**
```
1. 3 butun rulon (250×3) + 2 bo'lak (200, 70) yozildi → 5 qator, 1020 m
2. OK — to`sildi: whole rulonda yorliq
   OK — to`sildi: manfiy uzunlik
   OK — to`sildi: faol bo`lak nol uzunlikda
   OK — to`sildi: notanish holat
   OK — `consumed` da nol uzunlik RUXSAT
   OK — to`sildi: takroriy yorliq
3. yacheykasiz bo'lak YOZILDI (E1 yo'li ishlaydi)
4. yorliqsiz (NULL) rulonlar CHEKSIZ — unikal indeks to'smaydi
5. stocks_ozgarmadi=t · stock_by_cell_ozgarmadi=t · jami_qoldiq_ozgarmadi=t
6. ROLLBACK → zonddan keyingi qatorlar = 0
```

**Qaytarish yo'li (qoida 12) — YOZILDI VA SINALDI:**
`packages/db/scripts/rollback/20260825230000_stock_piece_registry_down.sql`
```
cd packages/db && npx prisma db execute --schema prisma/schema.prisma \
  --file scripts/rollback/20260825230000_stock_piece_registry_down.sql
npx prisma migrate resolve --rolled-back 20260825230000_stock_piece_registry
npx prisma generate
```
Tsikl lokal bazada: **DOWN** (jadval NULL, ustun 0) → **DOWN 2-marta**
(to'liq no-op, ikkala `skipping`) → **UP** (jadval qaytdi, 19 cheklov,
bayroqli tovarlar 0). Fayl boshida yo'qoladigan ma'lumot ogohlantirishi va
eksport buyruqlari yozilgan; qaytarishdan oldingi tekshiruv so'rovi ham
o'sha yerda (K1 dan keyin ikkala son ham 0 ⇒ qaytarish MUTLAQO izsiz).

**Drift:** `prisma migrate diff` — `stock_pieces` bo'yicha yagona qator
`ALTER COLUMN "updated_at" SET DEFAULT CURRENT_TIMESTAMP`, ya'ni **mavjud
naqsh**: bazada 10 ta jadval aynan shunday (jumladan G4 ning
`retail_sale_position_allocations` va G5 ning `tsd_devices`). Yangi drift-klass
YO'Q. ⚠️ Yon topilma (K1 ga aloqasi yo'q): dev baza G6 migratsiyasidan orqada
(`restock_task_lines.shortage_*` va `client_operations` yo'q).

---

**4. Testlar.**

| Gate | Natija |
|---|---|
| Yangi `stock-piece-core.test.ts` | **30** (yorliq makoni 4, guard 8, sverka 18) |
| Yangi `stock-piece-schema.test.ts` | **17** (sxema qulfi, migratsiya idempotentligi, CHECK/FK, rollback fayli) |
| Yangi `stock-piece-reconcile.service.test.ts` | **8** (faqat-o'qish, bo'sh doirada so'rov ketmasligi, filtr simlari, 400) |
| Yangi web `piece-reconciliation/page.test.tsx` | **7** |
| `apps/api` vitest TO'LIQ | 659 fayl · **9347 passed** · 2 skipped · 3 failed (pastda) |
| `apps/web` vitest TO'LIQ | 328 fayl · **4324 passed** · 26 skipped · 4 failed (pastda) |
| `turbo typecheck` api+web+db | ✅ 4/4 successful |
| biome (yangi/tegilgan fayllar) | ✅ 0 xato |
| `tsd` moduli (regress) | ✅ 20/20 — testlar bir qatori ham o'zgartirilmagan |

> ⚠️ **HALOL QAYD — yiqilgan 7 test MENING ISHIMDAN EMAS.**
>
> **api (3 test, 2 fayl):** `auth/tsd-device.service.test.ts` va
> `publication/publication.service.test.ts` — ikkalasi ham **argon2** hashlash
> testlari (har biri 0,4–0,6 s), to'liq parallel yuklamada 5 s timeout'dan
> oshadi. Alohida yugurtirilganda **31/31 yashil**. Birinchi to'liq yugurishda
> 4 fayl/18 test, ikkinchisida 2 fayl/3 test yiqildi — ro'yxat har safar
> BOSHQA, ya'ni flake (F6/G3 hisobotlaridagi bilan bir klass).
>
> **web (4 test, 3 fayl):** `i18n-key-existence`, `pos-i18n-guard`,
> `pos/__tests__/customer-card-panel` — hammasi **parallel sessiyaning (A3)
> yetishmayotgan `pages.pos.prepay_*` / `customer_card_prepaid*` kalitlari**.
> Chiqishda mening kalitlarim (`piece_reconciliation`) **0 marta** uchraydi.
> Batafsili 8-bandda.

---

**5. Deploy holati: ⛔ BAJARILMADI — egasining qarori (2026-08-25).**

Sessiya boshida uch yo'l berildi (A — deploy yo'q, B — faqat K1 migratsiyasi
jonliga, C — butun delta); **egasi «Deploy YO'Q» ni tanladi** (G1 sessiyasidagi
qaror bilan bir xil). ⇒ jonli baza umuman ochilmadi, `warehouse-state.ts`
yugurtirilmadi, VPS HEAD tekshirilmadi.

K1 migratsiyasi endi deploy deltasiga **8-chi** bo'lib qo'shiladi
(`docs/ops/2026-08-25-deploy-dossieri.md`). Deploy retsepti:
`prisma db execute --file …/20260825230000_stock_piece_registry/migration.sql`
→ `prisma migrate resolve --applied 20260825230000_stock_piece_registry`
→ `prisma generate`. **`topup-role-permissions.ts` ga K1 hech narsa
qo'shmaydi.** Jonli XULQ K1 dan o'zgarmaydi (bayroq o'chiq, jadval bo'sh).

---

**6. QABUL MEZONI — bandma-band (qoida 11).**

| # | Mezon | Holat |
|---|---|---|
| 1 | migratsiya **lokal dev bazada** qo'llangan | ✅ UP ×2 (2-si no-op), zond, DOWN ×2, UP |
| 2 | migratsiya **jonlida** qo'llangan | ❌ deploy yo'q (egasining qarori) |
| 3 | sverka hisoboti ochiladi va «farq yo'q» beradi | ⚠️ QISMAN — lokal/test darajasida ✅ (yadro va sahifa testlari «farq yo'q» yo'lini qulflaydi), jonlida ❌ |
| 4 | reyestr bo'sh, bayroq o'chiq | ✅ lokal bazada o'lchandi: 0 qator, 5086 tovarda `false` |
| 5 | uchma-uch smoke (qoida 13) — sotuv/sanash/ko'chirish | ❌ deploy yo'q ⇒ bajarib bo'lmaydi |

**Beshtadan ikkitasi bajarilmagan, bittasi qisman ⇒ K1 «QISMAN».**
Yopish sharti: deploy + 3 bandli jonli tekshiruv. **K2 boshlanmaydi.**

---

**7. Qoida 13 — uchma-uch smoke.** Bajarilmadi, chunki deploy yo'q. Deploy
kunida bajariladigan minimal ro'yxat (K1 uchun):
1. `/reports/piece-reconciliation` ochiladi va «Farq yo'q» beradi (reyestr bo'sh);
2. bitta sinov **SOTUV** (post → tekshir → cancel) — K1 dan keyin ham
   avvalgidek o'tishi SHART (jadval sotuvga umuman ulanmagan);
3. bitta yacheyka **sanash** va bitta **ko'chirish**;
4. `packages/db` da `npx tsx scripts/warehouse-state.ts` — chiqish kodi 0.
Javobgar shaxs va vaqt deploy sessiyasida shu yerga yoziladi.

---

**8. ⚠️ Parallel sessiya bilan to'qnashuv (CLAUDE.md §6.7 B — HALOL QAYD).**

Sessiya davomida repoda boshqa Claude sessiyasi (A3 — avans) ishladi va
`526dda5c` commitini qildi. O'sha commit **mening `apps/web/src/messages/
{ru,uz}.json` o'zgarishimni O'ZIGA yutib yubordi** (36+36 qator = aynan mening
30 kalitim + 2 karta kalitim) — `lint-staged` butun daraxtni stash qilib
tiklaganda sodir bo'ladigan naqsh. Kalitlarim MAVJUD va to'g'ri (ikkala tilda
30 tadan), faqat ular boshqa commitda turibdi. Men u commitga TEGMADIM.

🔴 **Va o'sha commit A3 ning O'Z i18n kalitlarisiz ketdi:**
`pages.pos.prepay_refunded`, `customer_card_prepaid`, `customer_card_prepaid_hint`,
`prepay_refund_btn`, `prepay_refund_hint`, `prepay_refund_confirm`,
`pages.z_report.prepay_refund`, `pages.counterparties.balance_prepaid_hint` —
ru+uz IKKALASIDA ham YO'Q. Natijada **HEAD'da web i18n gate QIZIL** va POS mijoz
kartasi deploy qilinsa kassirga xom kalit satrlari ko'rinadi (G1 sessiyasi
topgan nuqsonning aynan takrori). Bu **A3 sessiyasining qarzi** — men uni
tuzatmadim (§6.1: seniki bo'lmagan o'zgarishga tegilmaydi), lekin deploy
qilinishidan OLDIN yopilishi shart.

Mening commitim (`bc92330a`) aniq pathspec bilan qilindi va tarkibi tekshirildi:
18 ta o'z faylim + `docs/progress.json` (hook o'zi yangilaydi). Begona fayl
tushmagan.

---

**9. Ochiq qolganlar / keyingi fazalarga.**

- **🔴 K1 ni yopish uchun:** deploy + 6-bo'limdagi 2, 3, 5-bandlar.
- **K2 ga tayyor ulanish nuqtalari:** `StockPieceReconcileService` modulda
  EXPORT qilingan (K2/4-vazifa: «har o'zgarish sverkani buzsa darhol ko'rinadi»);
  `assertValidPiece` — yozishdan oldin; `formatPieceLabel(seq)` — yorliq
  generatsiyasi. **K2 O'Z permission-entity'sini qo'shadi** (`piecetracking`) va
  `topup-role-permissions.ts` ni deploy qadamiga kiritadi.
- **Yorliq raqamining KETMA-KETLIGI qurilmagan** (K1 doirasidan tashqari):
  `formatPieceLabel` faqat formatlaydi, `seq` ni kim beradi — K2 hal qiladi
  (hisoblagich jadvali yoki `max(label)` + qulf; poyga xavfi bor, unikal indeks
  uni 500 emas, ochiq xato bilan to'sadi).
- **`/tsd/scan` hamon `supported: false`** qaytaradi — bu TO'G'RI holat, chunki
  bo'lakni ochadigan ekran (K2/K4) hali yo'q. K4 o'sha shoxni to'ldiradi
  (`tsd.service.test.ts` da test allaqachon turibdi).
- **Variantlar (`assortmentKind='variant'`) bo'lak hisobidan TASHQARIDA** —
  bayroq faqat `Product` da. Kabel guruhida variant ishlatilmaydi; kerak
  bo'lsa alohida ish.
- **Sverka hisobotining ish unumdorligi**: bayroq ko'p tovarga yoqilganda
  `stocks`/`stock_by_cell` so'rovi `assortmentId IN (...)` bilan ketadi. K6
  pilotida (faqat kabel guruhi) muammo yo'q; butun «m» tovarlariga yoyilsa
  o'lchash kerak.
- **Egasiga savollar hamon ochiq:** K-S1…K-S4 (9-bo'lim). K-S4 (nechta kabel
  nomenklaturasi va taxminan nechta bo'lak) — K5 ning ish hajmi shundan
  bilinadi, K2 dan oldin so'rash foydali.
- **A3 sessiyasining i18n qarzi** (8-band) — deploy'dan oldin yopilsin.

### K0 — Reja tuzildi · 2026-08-25

Egasi bilan suhbat asosida tuzildi. Kod o'zgarmadi, migratsiya yo'q,
jonliga tegilmadi.

**Suhbatda aniqlangan va tekshirilgan faktlar:**

- Kasr miqdor POS'dan serverga to'liq oqadi: server sxemasi `Decimal(20,6)`
  (`retail-sale.schema.ts`), POS savati miqdorni SATR sifatida yuritadi
  (`apps/web/src/lib/pos/cart-math.ts`, F8 audit tuzatishi). Ya'ni 12.5 m
  sotish bugun ham ishlaydi — muammo miqdorda emas, TARKIBDA.
- `StockByCell.qty` — `Decimal(20,6)`, kalit
  `(accountId, storeId, cellId, assortmentKind, assortmentId)`. Tarkib haqida
  ma'lumot yo'q.
- `Consignment` modeli bazada bor, lekin **hech qayerga ulanmagan** —
  butun sxemada `consignmentId` maydoni yo'q. Yechim sifatida ishlatib
  bo'lmaydi.
- `Uom` da «м» bor; `ProductPack` (multiplier ×1000) alternativ o'ram beradi,
  lekin bo'lak tarkibini SAQLAMAYDI.
- `RetailSale` FSM `draft→picking→ready→posted`, `RestockTask`, `mark-ready`,
  `PATCH /retail-sales/:id/edit`, SSE, label moduli + print-agent (17777) —
  hammasi tayyor poydevor.

**Qoida 10 — bu o'zgarish qaysi mavjud oqimni buzishi mumkin?**

1. **Q1-v2 avto-taqsimot (G-reja)** — bo'linadigan tovarni yacheykalar orasida
   bo'lib yuboradi, bu kabel uchun yaroqsiz. 7.1 da tuzatish yozildi.
   K3 fazasi shuni amalga oshiradi.
2. **«Shtrixlar unikal emas» qoidasi (G-reja)** — bo'lak yorlig'i unikal
   bo'lishi shart. 7.3 da alohida makon (`BLK-`) talab qilindi. Buzilsa
   omborchi skanerida multi-hit ochiladi va kesim oqimi ishlamaydi.
3. **`retail-sale.service` posting yo'li (F6 + G4 2-bosqich)** — K4 o'sha
   tranzaksiyaga tegadi. To'qnashuv ehtimoli bor, K4 boshlanishidan oldin G4
   holati tekshiriladi.
4. **Inventarizatsiya «faqat yacheyka kesimida» qoidasi (F-reja)** — K5 uni
   BUZMAYDI, faqat yacheyka qatoriga bo'lak tafsiloti qo'shadi.
5. **Qoldiq ayirish mantiqi** — K1–K3 unga UMUMAN tegmaydi (reyestr alohida
   jadval, `StockByCell` o'z holicha qoladi). Eng yomon holatda reyestr
   noto'g'ri bo'ladi, kassa esa avvalgidek ishlayveradi. Bu ataylab shunday:
   2026-08-24 da kassa aynan qoldiq mexanizmiga tegilgani uchun to'xtagan edi.

**Keyingi qadam:** K1.
