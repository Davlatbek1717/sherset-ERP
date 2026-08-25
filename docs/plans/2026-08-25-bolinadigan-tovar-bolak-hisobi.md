# Bo'linadigan tovar — bo'lak hisobi (kabel, sim, shlang)

> **Yaratilgan:** 2026-08-25 · **Buyurtmachi:** Ozodbek (egasi) · **Holat:** K0 — reja tuzildi, ish boshlanmagan
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
- **K-S3:** Bir mijozga 2 bo'lak berilganda chekda 2 qator bo'ladimi yoki 1
  qator «180 m (150+30)» bo'ladimi? Soliq/chek talabi tekshirilishi kerak.
- **K-S4:** Kabelning nechta nomenklaturasi bor va taxminan nechta bo'lak
  yotibdi? K5 ning ish hajmi shundan bilinadi.

---

## 10. HISOBOTLAR (har faza o'z hisobotini SHU YERGA yozadi)

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
