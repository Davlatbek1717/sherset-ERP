# Hodisa: ombor-split kassani to'xtatdi — tahlil va tuzatish rejasi

> **Yaratilgan:** 2026-08-24 · **Buyurtmachi:** Ozodbek (egasi) · **Holat:** H0, H1 TUGADI · **H2 QISMAN** (kod+testlar tayyor, jonli yugurtirish kutilmoqda) · **H5 QISMAN** (kod+testlar+lokal isbot tayyor, jonli dry-run egasining tasdig'i bilan) · navbat H3 · **✅ S1 JAVOB OLINDI** (6-bo'lim: tasdiqsiz ko'p omborli avto-taqsimot — G4 qayta yozildi)
> **Ijro tartibi:** F-reja (`2026-08-23-ombor-restrukturizatsiya.md`) va G-reja
> (`2026-08-23-omborchi-tsd-mijozlar.md`) bilan bir xil: bitta sessiya = bitta faza,
> hisobot shu faylning oxiriga, so'ng TO'XTA.
> **O'ZGARMAS QOIDALAR:** F-rejaning 2-bo'limi (testlar, i18n, maxfiylik, deploy
> retsepti, jonli skript intizomi) shu rejaga ham AYNAN tatbiq etiladi.
> **10–14 bandlari (shu hodisadan tug'ilgan) endi F-rejaning 2-bo'limida —
> KANONIK matn o'sha yerda, bu yerdagi H1 tavsifi tarixiy.**

---

## 1. XULOSA (bir qarashda)

2026-08-23 kuni bajarilgan jonli ombor-split tovarning 5,4 % ini kassa yeta
olmaydigan omborga ko'chirib qo'ydi. Ertalabki savdo shiddatida (06:00–06:46,
110 ta sotuv soatida) kassir ekranda tovar sonini ko'rib turib chekni yopolmadi.
06:46 da shoshilinch yozilgan skript bilan hammasi kassa omboriga qaytarildi.

**Ma'lumot yo'qolmagan** (ledger Σ=0, jami qoldiq o'zgarmagan), lekin:
- jonli holat endi reja maqsadidan chetda (split amalda YO'Q);
- tuzatish skripti git'ga kirmagan, hodisa hech qaysi rejada yozilmagan;
- **ayni sabab qayta yuz berishi mumkin** — split qayta yugurtirilsa muammo qaytadi.

Bu reja: hodisani hujjatlashtiradi, ildiz sabablarini yopadi va split'ni xavfsiz
qayta yuritish shartlarini belgilaydi.

---

## 2. XRONOLOGIYA (dalillar bilan)

| Vaqt (server) | Hodisa | Dalil |
|---|---|---|
| **2026-08-23 15:58:36** | F5 jonli split bajarildi: 291 yacheyka + 2 949 007 dona → «Ombor 02»; 119 yacheyka → «Ombor 01» (0 dona); eski store `968f9da2` → «Taqsimlanmagan» (49,57 mln, yacheykasiz) | ledger `warehouse_split` 546 qator, Σqty=0; F5 hisoboti |
| 2026-08-23 16:03 | Yangi kassir-sessiya ochildi — «kassa uzluksiz» deb qayd etildi | F5 hisoboti |
| 2026-08-23 15:00–17:00 | 20 ta sotuv o'tdi (ta'sirlanmagan tovarlar) | ledger `retailsale` |
| **Kechasi** | Hech kim jonli SOTUV bilan tekshirmadi. F5 hisoboti: «birinchi real sotuvni egasi bir tekshirib qo'ysin» | F5 hisoboti, «Ochiq qolganlar» |
| 2026-08-24 (ertalab) | F6 kaskad deploy qilindi; `Taqsimlanmagan.__posPriority = 1`; xulosa: «jonli xulq HOZIRCHA aynan avvalgidek (xavfsiz yoqish)» | F6 hisoboti |
| 2026-08-24 05:00–06:46 | Ertalabki savdo: 05:00 da 13, **06:00 da 110 ta sotuv**. Shu oynada kassir ~11 000 dona ko'rinib turgan tovarni sotolmadi — chek yopilmadi | revert skript sarlavhasi (prod hodisasi izohi), ledger soatlik kesim |
| **2026-08-24 06:45** | VPS'da `packages/db/scripts/warehouse-split-revert.ts` YOZILDI (git'ga kiritilmagan) | fayl vaqti, `git status` → `??` |
| **2026-08-24 06:46:16** | `--from "Ombor 02" --apply --allow-remote` yugurtirildi: 291 yacheyka + butun qoldiq «Taqsimlanmagan» ga qaytdi | ledger `warehouse_split_revert` 546 qator, Σqty=0, `created_by_id=NULL` (skript) |
| 2026-08-24 07:00–08:00 | Savdo normal davom etdi (31 + 89 sotuv) | ledger |

**Ta'sir doirasi:** 5082 qoldiqli tovardan **273 tasi** (5,4 %) yacheykaga
biriktirilgan edi — faqat o'shalar sotilmay qoldi. Shu sabab nosozlik
«ba'zan ishlamayapti» ko'rinishida bo'lgan va darhol tushunilmagan.

---

## 3. NEGA BUNDAY BO'LDI — mexanizm

Uch narsa birga kelganda kassa to'xtaydi:

1. **Split tovarni ombor bo'yicha ajratdi.** Yacheykaga biriktirilgan qoldiq
   `968f9da2` («Taqsimlanmagan») dan `01662dbe` («Ombor 02») ga ko'chdi.
2. **Kassa faqat BITTA ombordan ayiradi.** POS smena ombori —
   `cashier_sessions.store_id = 968f9da2`, F6 kaskadining birinchi ombori ham
   o'sha (`__posPriority = 1`). Ya'ni kassa «Ombor 02» dagi tovarga yeta olmaydi.
3. **Boshqa ombordan olish yo'li YOPIQ.** Egasining Q1 aniqlashtiruviga ko'ra
   07 dan tashqari ombordan AVTOMATIK ayirish yo'q — bosh omborchi tasdig'i
   (G4) orqali bo'lishi kerak. **G4 esa hali qurilmagan.**

Natija: `assertAvailableCascade` 400 qaytardi («bosh omborchi tasdig'i kerak»),
kassir uchun bu «chek yopilmayapti» bo'lib ko'rindi. Tovar ekranda bor —
chunki tovar kartasi JAMI qoldiqni ko'rsatadi (barcha omborlar bo'yicha).

> **Muhim nuqta:** nosozlik F6 dan EMAS, F5 (split) dan boshlangan. F6 xulqni
> o'zgartirmadi — u faqat nosozlikni **payqamadi**.

---

## 4. ILDIZ SABABLAR

### IS-1 — Bog'liqlik faqat bir tomonlama yozilgan (asosiy sabab)

G-rejada «**G4** — faqat F5 va F6 dan keyin» deb yozilgan. Ya'ni «G4 F5 ni
kutadi». Lekin teskarisi — «**F5 xavfsiz bo'lishi uchun G4 (yoki uning o'rnini
bosuvchi yechim) kerak**» — hech qayerda yozilmagan.

F5 sessiyasining prompti faqat F-rejani o'qishni talab qiladi, G-rejani emas.
Shu sabab split qiluvchi sessiya «bu tovarni kassa yeta olmaydigan joyga
ko'chirish ekan» degan xulosaga kelish uchun ma'lumotga ega emas edi.

**Yopish:** ikki tomonlama bog'liqlik jadvali + F-faza promptlari G-rejani ham
o'qisin (H1).

### IS-2 — Qabul mezoni bajarilmay faza «TUGADI» deb yopilgan

F5 qabul mezoni **to'g'ri** yozilgan edi: «jonli muhitda omborlar alohida, jami
qoldiq o'zgarmagan, **kassa sotuvi ishlaydi**, inventarizatsiya yangi omborda
o'tadi».

«Kassa sotuvi ishlaydi» bandi bajarilmadi — hisobotda «Split'dan keyin haqiqiy
sotuv hali bo'lmagan — birinchi real sotuvni **egasi** bir tekshirib qo'ysin»
deb egaga o'tkazib yuborildi, faza esa TUGADI deb yopildi. F6 hisoboti ham shu
qarzni takrorladi («tavsiya kuchda») — lekin yopmadi.

**Yopish:** bajarilmagan qabul mezoni bilan faza yopilmaydi (H1 qoidalari).

### IS-3 — «Xavfsiz yoqish» xulosasi noto'g'ri bazaga qurilgan

F6: «Kaskad birinchi ombori == smena ombori ⇒ jonli xulq HOZIRCHA aynan
avvalgidek». Bu **kod xulqi** haqida to'g'ri, lekin **tizim holati** haqida
noto'g'ri: taqqoslash bazasi split'dan OLDINGI holat emas, split'dan KEYINGI
(allaqachon buzilgan) holat edi.

**Yopish:** jonli tekshiruv «sahifa 200 + log toza» bilan cheklanmaydi — ma'lumot
oqimini uchma-uch sinaydigan smoke majburiy (H1, H3).

### IS-4 — Qaytarish yo'li OLDINDAN tayyorlanmagan

F5 zaxira dump oldi (to'g'ri qadam), lekin **qaytarish skripti** yo'q edi.
Dump'dan tiklash esa amalda yaroqsiz: orada o'tган savdo yo'qoladi.

Natijada tuzatish skripti **savdo shiddatida, 06:45 da, shoshilinch** yozildi.
Bu safar omadimiz keldi (skript toza yozilgan: dry-run, remote-qo'riqchi,
tranzaksiya, invariant) — lekin bu jarayon emas, tasodif.

**Yopish:** jonli ma'lumot o'zgartiradigan har skript uchun teskarisi O'SHA
sessiyada yoziladi va lokal bazada sinaladi (H1 qoidalari, H2).

### IS-5 — Nosozlik SIGNALI yo'q

Kassir 400 xatosini ko'rdi; tizimda hech qanday ogohlantirish, alert yoki
hisobot yo'q. Egasi buni faqat odam aytgani uchun bildi. Nosozlik ~46 daqiqa
(eng shiddatli savdo soatida) davom etdi.

`assertAvailableCascade` ning 400 javobi kodda «kutilgan biznes-holat» deb
qaraladi — lekin split'dan keyin u **tizim nosozligi** edi va farqlanmadi.

**Yopish:** «tovar bor, lekin kassa yeta olmaydi» holati alohida hodisa sifatida
yoziladi va ko'rinadi (H3).

### IS-6 — Favqulodda tuzatish izsiz qolgan

Revert skripti git'da yo'q, ikkala rejada ham yozuv yo'q, xotirada ham yo'q.
Oqibatlari: (a) keyingi sessiya jonli holatni «split bajarilgan» deb o'ylaydi —
aslida qaytarilgan; (b) skript yo'qolishi mumkin; (c) saboq yozilmagan.

**Yopish:** H0 (bu sessiyada bajarildi) + protokol (H1 qoidalari).

### IS-7 — Jonli HOLAT hech qayerda deklarativ yozilmagan

Kod git'da versiyalanadi. Jonli ma'lumot holati — qaysi ombor bor, qaysi
`posPriority` kimda, yacheykalar qaysi omborda, hovuz belgisi qayerda — hech
qayerda yozilmagan. Shuning uchun **drift ko'rinmaydi**: bugun ertalabgacha
hech kim jonli holat rejadan chetga chiqqanini bilmasdi.

**Yopish:** jonli holat reyestri + uni tekshiradigan skript (H2).

---

## 5. HOZIRGI JONLI HOLAT (2026-08-24 o'lchandi)

| Store | id (qisqa) | Yacheyka | Zona | StockByCell | Qoldiq (dona) | POS prioritet |
|---|---|---|---|---|---|---|
| Ombor 01 | `7400bf94` | 119 (`01-04-…`) | 1 | 0 | 0 | — |
| Ombor 02 | `01662dbe` | **0** | 4 (bo'sh) | 0 | 0 | 2 |
| Taqsimlanmagan | `968f9da2` | **291** (`02-…`) | 0 | 273 | **52 513 521** | **1** |

- `__unassignedSource` (F7 hovuz belgisi) — hech bir omborda YOQILMAGAN.
- 291 yacheykaning **zonasi yo'q** (revert `zoneId=null` qilgan; split qayta
  yugurtirilganda zona kod 2-segmentidan qayta hosil bo'ladi).
- Yacheykalarda 2 948 688 dona, yacheykasiz 49,56 mln dona.
- **Soxta «mashq» qoldig'i:** 4428 tovarda 9 000–11 000 oralig'ida yacheykasiz
  qoldiq (jami ≈48,65 mln dona) — kassirlar mashqi uchun kiritilgan, hisobdan
  chiqarilishi kerak (egasi bilan kelishildi: bosqichma-bosqich).

### Ochiq xavflar

| # | Xavf | Oqibat |
|---|---|---|
| **R1** | «Ombor 02» da `__posPriority = 2` qolgan | Split qayta yugurtirilsa AYNI nosozlik qaytadi |
| **R2** | Revert skripti git'da yo'q | Yo'qolishi mumkin; keyingi sessiya bilmaydi |
| **R3** | Rejalarda hodisa yozuvi yo'q | Keyingi sessiya «split jonlida» deb noto'g'ri ish tutadi |
| **R4** | «Ombor 01» da prioritet YO'Q | U yerga tovar tushsa POS umuman yeta olmaydi (kaskad rejasida ham ko'rinmaydi) |
| **R5** | 291 yacheyka zonasiz | Yacheyka tanlagichda stelaj guruhlanishi yo'qolgan (kosmetik, lekin sanashda noqulay) |
| **R6** | Soxta 10 000 lar turibdi | Qoldiq hisoboti va kassa haqiqatni ko'rsatmaydi |

---

## 6. ✅ S1 — JAVOB OLINDI (egasi, 2026-08-24)

> **JAVOB: HA — avtomatik, tasdiqsiz.** Egasining so'zi: «**omborchi ruxsati
> degan narsa yo'q**; kassir barcha omborlardan mahsulot ro'yxatini tuza olishi
> kerak». Ya'ni tanlov quyidagi variantlardan **B** (tasdiqsiz avto-taqsimot),
> lekin vaqtinchalik emas — **DOIMIY qoida**, va yacheyka kesimida.
>
> To'liq qoida (Q1-v2) G-rejaning 1-bo'limida jadval bilan yozilgan; uni
> quradigan faza — **G4 (butunlay qayta yozildi:** «tasdiq oqimi» → «ko'p
> omborli avto-taqsimot + yacheyka tavsiyasi»**)**. Qisqacha: 07 yolg'iz
> qoplasa 07 dan; aks holda yolg'iz qoplaydigan ENG KICHIK yacheykadan
> to'liq; hech biri qoplamasa — bo'linadi va **07 eng oxirida** (u kassa
> oldidagi tez-xizmat ombori, boshqa omborlardan to'ldiriladi). Kassir
> taqsimotni ko'radi va o'zgartira oladi.
>
> **H4 uchun ma'nosi:** split endi «G4 tayyor bo'lgach» emas, **«G4 (yangi
> tahriri) jonliga chiqqach»** yuritiladi — chunki aynan o'sha faza kassani
> ko'p omborli qiladi. Ombor 07 (variant A) alohida, keyingi ish sifatida
> qoladi: u savdo omborini fizik ajratadi, lekin split uchun SHART emas.

<details>
<summary>Tarixiy: savolning asl matni (2026-08-24 ertalab)</summary>

**S1. Split qayta yugurtirilganda kassa boshqa ombordan AVTOMATIK olsinmi?**

Q1 aniqlashtiruvida «07 dan tashqari ombordan avtomatik ayirish YO'Q — bosh
omborchi tasdig'i orqali» deb kelishilgan edi. Bu qoida **fizik jihatdan
ajratilgan omborlar** uchun mantiqiy (tovarni boshqa binodan olib kelish kerak).

Lekin hozirgi holatda «Ombor 01/02» — bitta binoning stelajlari, «Taqsimlanmagan»
esa umuman fizik ombor emas, hisob-kitob hovuzi. Ular orasida tasdiq talab qilish
ish qo'shadi, foyda bermaydi.

**Uch variant:**

| Variant | Mohiyati | Narxi | Tavsiya |
|---|---|---|---|
| **A** | **Ombor 07 ni raqamlashtirib, kassa tovarini o'sha yerga o'tkazish** — POS pp=1 Ombor 07 da bo'ladi, tovar ham o'sha yerda | O'rta (F3 vositasi tayyor, tovarni ko'chirish kerak) | ✅ Reja maqsadiga aynan mos |
| **B** | **Vaqtinchalik avto-kaskad** — sozlama bilan tasdiqsiz ayirish yoqiladi (G4 tayyor bo'lguncha) | Kichik (bir sozlama + qo'riqchi) | Tez unblock, lekin Q1 qaroriga zid — **egasi tasdiqlashi shart** |
| **C** | **G4 ni qurib, keyin split** | Katta (butun tasdiq oqimi) | To'g'ri, lekin split uzoq kutadi |

**Mening tavsiyam: A + B birga** — Ombor 07 asosiy yechim, B esa split kunidagi
xavfsizlik to'ri (yoqilgan holda split hech qachon savdoni to'xtatmaydi).
Egasi B ga rozi bo'lmasa — faqat A, lekin unda split **faqat** Ombor 07 tayyor
bo'lgach yuritiladi.

> Bu savolga javob H4 fazasining shaklini belgilaydi. Javob olinmaguncha H4
> boshlanmaydi.

</details>

---

## 7. FAZALAR

### H0 — Hodisani hujjatlashtirish va izni saqlash ✅ (shu sessiyada bajarildi)

**Maqsad:** hodisa va tuzatish izi yo'qolmasin; keyingi sessiya jonli holatni
to'g'ri bilsin.

**Vazifalar:**
1. Bu tahlil-rejani yaratish (shu fayl).
2. `warehouse-split-revert.ts` ni VPS'dan olib repoga kiritish.
3. F-rejaga (F5/F6 hisobotlari ustiga) va G-rejaga (G4 oldsharti) hodisa
   havolasini qo'yish.
4. Xotirani yangilash (jonli holat: split QAYTARILGAN).

**Qabul mezoni:** repoda revert skripti bor; uchala reja va xotira bir xil
haqiqatni aytadi; keyingi sessiya bu faylni o'qib to'g'ri qaror qabul qila oladi.

---

### H1 — Jarayon qoidalari: bunday hodisa qaytmasin ✅ (bajarildi — hisobot 9-bo'limda)

**Maqsad:** IS-1, IS-2, IS-4, IS-6 ni jarayon darajasida yopish — kod emas,
qoida ishi.

**Vazifalar:**
1. **F-reja 2-bo'limiga yangi bandlar** (ikkala rejaga ham tegishli):
   - **(10) Ikki tomonlama bog'liqlik.** Jonli ma'lumot yoki xulq
     o'zgartiradigan faza boshlanishidan oldin agent IKKALA rejani ham o'qiydi va
     «bu o'zgarish qaysi mavjud oqimni buzishi mumkin?» degan savolga hisobotda
     YOZMA javob beradi. F-faza promptlariga G-reja qo'shiladi (va aksincha).
   - **(11) Qabul mezoni — yopish sharti.** Qabul mezonining biror bandi
     bajarilmasa faza «TUGADI» deb yopilmaydi; holati «QISMAN — jonli tasdiq
     kutilmoqda» bo'ladi va **keyingi faza boshlanmaydi**. Mezonni uchinchi
     shaxsga (egasi/jamoa) o'tkazish — yopish EMAS.
   - **(12) Qaytarish yo'li majburiy.** Jonli ma'lumotni o'zgartiradigan har
     skript bilan birga uning TESKARISI o'sha sessiyada yoziladi, lokal bazada
     sinaladi va hisobotda buyrug'i bilan ko'rsatiladi. Zaxira dump — yetarli
     EMAS (oradagi savdo yo'qoladi).
   - **(13) Jonli o'zgarishdan keyin uchma-uch smoke.** Ombor/qoldiq/kassa
     tegadigan har o'zgarishdan keyin: bitta sinov SOTUV (post → tekshir →
     cancel), bitta yacheyka sanash, bitta ko'chirish. **Ish soatidan tashqari
     qilingan o'zgarish savdo boshlanishidan oldin tekshiriladi** — javobgar
     shaxs va vaqt hisobotda yoziladi.
   - **(14) Favqulodda tuzatish protokoli.** VPS'da yozilgan har qanday skript
     O'SHA KUNI git'ga kiritiladi va tegishli rejaga hodisa yozuvi qo'shiladi.
     Jonli holatga qo'lda tegilgan bo'lsa — reyestr (H2) yangilanadi.
2. Shu bandlarni F-reja va G-rejaga kiritish (nusxa emas, havola).
3. `CLAUDE.md` ga qisqa yo'naltiruvchi qator (agar loyihada bor bo'lsa) —
   «jonli ma'lumot o'zgartirishdan oldin: docs/plans/2026-08-24-split-kassa-hodisasi.md».

**Qabul mezoni:** yangi sessiya F yoki G fazasini boshlaganda bu qoidalarni
o'qimasdan o'ta olmaydi; qoidalar ikkala rejada ham bir xil.

**PROMPT:**
```
D:\sherset-v2 dagi docs/plans/2026-08-24-split-kassa-hodisasi.md ni to'liq o'qi.
Sen H1 fazasini bajarasan (jarayon qoidalari). Faqat H1 vazifalari, hisobot — va TO'XTA.
```

---

### H2 — Jonli holat reyestri + tekshirgich skript ⚠️ QISMAN (hisobot 9-bo'limda)

**Maqsad:** IS-7 ni yopish — jonli holat yozib qo'yiladi va drift avtomatik
ko'rinadi.

**Vazifalar:**
1. **`docs/ops/jonli-holat.md`** (yangi): kutilayotgan jonli holat —
   omborlar ro'yxati (nom, id, roli), `__posPriority` kimda, `__unassignedSource`
   kimda, yacheyka prefiksi → ombor xaritasi, POS smena ombori. Har jonli
   o'zgarishdan keyin YANGILANADI (sana + kim + nima uchun).
2. **`packages/db/scripts/warehouse-state.ts`** (yangi, faqat O'QISH):
   jonli holatni chiqaradi va reyestr bilan solishtiradi —
   - omborlar, yacheyka/zona/qator/qoldiq kesimi;
   - `posPriority` taqsimoti va **POS kaskadi yeta olmaydigan qoldiq**
     (eng muhim qator — H3 ning asosi);
   - yacheyka prefiksi ↔ ombor mosligi (split holati: bajarilgan/qaytarilgan/qisman);
   - farq topilsa `chiqish kodi 2` + aniq ro'yxat.
3. Deploy retseptiga qadam: deploy'dan keyin `warehouse-state.ts` yugurtiriladi
   va natijasi hisobotga kiradi.
4. Testlar: sof qismi (holat → farqlar ro'yxati) uchun birlik testlari, jonli
   baza kerak bo'lmagan holda.

**Qabul mezoni:** skript jonlida yugurtirilib hozirgi holatni to'g'ri chiqaradi
(«split QAYTARILGAN, 291 yacheyka Taqsimlanmagan'da, POS yeta olmaydigan qoldiq
= 0»); reyestrdan farq yasalganda qizil beradi.

**PROMPT:**
```
D:\sherset-v2 dagi docs/plans/2026-08-24-split-kassa-hodisasi.md ni to'liq o'qi.
Sen H2 fazasini bajarasan (jonli holat reyestri + warehouse-state skripti).
Faqat H2 vazifalari, testlar, jonli o'qish-tekshiruv, hisobot — va TO'XTA.
```

---

### H3 — «Tovar bor, lekin kassa yeta olmaydi» — signal va qo'riqchi

**Maqsad:** IS-5 ni yopish. Ayni nosozlik yana yuz bersa — 46 daqiqa emas,
birinchi urinishda ko'rinadi.

**Vazifalar:**
1. **Backend signal:** `assertAvailableCascade` 400 qaytarganda, agar `cascadePlan`
   bo'sh EMAS bo'lsa (ya'ni tovar boshqa omborda BOR, faqat yetib bo'lmayapti) —
   bu alohida holat:
   - api log'ga aniq qator (`[stock-unreachable] sale=… product=… qty=… stores=…`);
   - `CashierAuditEvent` yangi turi (masalan `STOCK_UNREACHABLE`) — kim, qachon,
     qaysi tovar, qaysi omborda turibdi;
   - javob matni kassirga tushunarli bo'lsin (hozirgi «bosh omborchi tasdig'i
     kerak» — to'g'ri, lekin qaysi ombor va qancha borligi ham chiqsin).
2. **Ko'rinadigan joy:** admin/omborchi uchun kichik ro'yxat yoki mavjud
   bildirishnoma oqimiga (SSE) yangi tur — «kassada yetib bo'lmaydigan tovar».
   Minimal variant: kunlik hisobot sahifasida qator.
3. **Deploy-oldi qo'riqchisi:** `warehouse-state.ts` (H2) da «POS yeta olmaydigan
   qoldiq > 0» bo'lsa — chiqish kodi 2. Ombor tegadigan har deploy shu tekshiruvdan
   o'tadi.
4. Testlar: kaskad yetmagan holat (tovar boshqa omborda bor) — audit yozuvi va
   log qatori; tovar umuman yo'q holat — eski xulq (shovqin qilmasin); i18n ru+uz.

**Qabul mezoni:** sinov muhitida tovar boshqa omborga ko'chirilib sotuvga
urinilganda audit yozuvi paydo bo'ladi va xabar qaysi omborda qancha borligini
aytadi; tovar umuman yo'q bo'lsa yangi yozuv YOZILMAYDI.

**PROMPT:**
```
D:\sherset-v2 dagi docs/plans/2026-08-24-split-kassa-hodisasi.md ni to'liq o'qi
(F-rejaning F6 hisoboti bilan). Sen H3 fazasini bajarasan (yetib bo'lmaydigan
qoldiq signali). Faqat H3 vazifalari, testlar, deploy, jonli tekshiruv, hisobot — va TO'XTA.
```

---

### H4 — Split'ni XAVFSIZ qayta yuritish (S1 javobidan keyin)

**Maqsad:** reja maqsad-arxitekturasiga (har fizik ombor alohida Store) qaytish —
bu safar savdo to'xtamasdan.

**Oldshartlar (hammasi SHART):**
- ✅ **S1 javob olindi** (6-bo'lim): kassa ko'p omborli, tasdiqsiz →
  **G4 (yangi tahriri) JONLIDA bo'lishi shart** — split'ni xavfsiz qiladigan
  faza aynan o'sha;
- H2 (holat reyestri) va H3 (signal) jonlida;
- Variant A tanlansa: Ombor 07 raqamlashtirilgan va POS tovari o'sha yerda;
- Variant B tanlansa: avto-kaskad sozlamasi qurilgan va yoqilgan;
- Variant C tanlansa: G4 jonlida.

**Vazifalar:**
1. Tanlangan variantni qurish/sozlash (A: F3 vositasi bilan 07 ni raqamlashtirish
   + tovarni ko'chirish rejasi; B: sozlama + qo'riqchi testlar; C: G4 ga havola).
2. `warehouse-split.ts` ga **POS-yetuvchanlik tekshiruvi**: reja bajarilishidan
   OLDIN hisoblab beradi — «split'dan keyin POS yeta olmaydigan qoldiq: N dona,
   M tovar». N > 0 bo'lsa `--apply` **rad etiladi** (`--i-know-what-i-am-doing`
   kabi ongli flagsiz).
3. Qaytarish skripti (`warehouse-split-revert.ts`) repoda, testlangan va
   hisobotda buyrug'i bilan tayyor turadi.
4. Split yuritish **ish soatidan tashqari** + darhol uchma-uch smoke:
   sinov sotuv (post → tekshir → cancel), yacheyka sanash, ko'chirish.
5. Savdo boshlanishidan oldin (ertalab) — takroriy smoke va `warehouse-state.ts`.
6. Zonalarni tiklash (R5): split zonani kod 2-segmentidan qayta hosil qiladi.

**Qabul mezoni:** split bajarilgan; `warehouse-state.ts` da «POS yeta olmaydigan
qoldiq = 0»; jonli sinov sotuvi o'tgan (ledger'da ko'rinadi); ertalabki savdo
shikoyatsiz o'tgan (birinchi 2 soat kuzatiladi).

**PROMPT:**
```
D:\sherset-v2 dagi docs/plans/2026-08-24-split-kassa-hodisasi.md ni to'liq o'qi
(F-reja va G-reja hisobotlari bilan). Sen H4 fazasini bajarasan (split'ni xavfsiz
qayta yuritish). Oldshartlar bajarilmagan bo'lsa foydalanuvchiga ayt va TO'XTA.
Faqat H4 vazifalari, testlar, deploy, jonli tekshiruv, hisobot — va TO'XTA.
```

---

### H5 — Soxta «mashq» qoldig'ini hisobdan chiqarish (egasi bilan kelishilgan) ⚠️ QISMAN (hisobot 9-bo'limda)

**Maqsad:** kassirlar mashqi uchun kiritilgan ≈48,65 mln dona soxta qoldiq
haqiqiy sanalgan songa almashsin — kassa faqat borini ko'rsin.

> **Kelishilgan usul (egasi, 2026-08-24): BOSQICHMA-BOSQICH.** Sanash davom
> etadi; sanab bo'lingan tovarlarning ortiqchasi muntazam (masalan har kuni)
> hisobdan chiqariladi. Hali sanalmagan tovar kassada eski son bilan
> sotilaveradi — savdo to'xtamaydi.

**Muhim texnik shart (kodda tekshirilgan):** ombor-darajali «farq yozish»
ISHLATILMAYDI — `stock.service.ts` ombor-darajali chiqimni yacheykalardan
**katta-birinchi** ayiradi va endigina sanalgan yacheykani buzadi. Shuning uchun
skript **faqat yacheykasiz ortiqchani** kamaytiradi, StockByCell'ga TEGMAYDI.

**Vazifalar:**
1. **`packages/db/scripts/stock-baseline-cleanup.ts`** (yangi):
   - har tovar uchun: `ortiqcha = Stock.qty − Σ StockByCell.qty` (shu ombor ichida);
   - **faqat sanab bo'lingan tovarlar** uchun ishlaydi — mezon: tovarning
     kamida bitta yacheykali qatori bor (yoki `--since <sana>` bilan shu sanadan
     keyin sanalganlar);
   - `cellMode: 'store-only'` mantig'iga mos yozuv — ombor jamisi kamayadi,
     yacheykalar TEGILMAYDI;
   - ledger `docType='stock_baseline_writeoff'`, `docId` bitta (bekor qilish
     uchun), tannarx ham mos kamayadi (o'rtacha-tortilgan, `move-cost-basis`
     arifmetikasi);
   - **rezerv himoyasi:** rezervdan pastga tushirmaydi;
   - DRY-RUN default; `--apply --allow-remote`; **teskarisi**
     (`--revert <docId>`) O'SHA skriptda (qoida 12).
2. Sof yadro + testlar (hisob, rezerv chegarasi, idempotentlik, tannarx).
3. Lokal dev bazada jonli dump ustida isbot.
4. Jonli: avval DRY-RUN → **ro'yxat egasiga ko'rsatiladi** (qaysi tovardan
   qancha o'chadi) → tasdiqdan keyin `--apply`.
5. Muntazam yuritish tartibi hisobotga yoziladi (kim, qachon, qanday tekshiradi).

**Qabul mezoni:** dry-run raqamlari egasi tomonidan tasdiqlangan; apply'dan keyin
sanalgan tovarlarning jami qoldig'i = yacheykalar yig'indisi; sanalmaganlarga
tegilmagan; bitta buyruq bilan qaytarish ishlaydi (sinovda isbotlangan).

**PROMPT:**
```
D:\sherset-v2 dagi docs/plans/2026-08-24-split-kassa-hodisasi.md ni to'liq o'qi.
Sen H5 fazasini bajarasan (soxta mashq-qoldig'ini bosqichma-bosqich hisobdan
chiqarish). Jonli apply FAQAT egasining tasdig'i bilan. Faqat H5 vazifalari,
testlar, lokal isbot, dry-run ro'yxati, hisobot — va TO'XTA.
```

---

### H6 — Kichik qarzlar (hodisadan kelib chiqqan tozalash)

**Maqsad:** hodisa ochgan mayda-chuyda qarzlarni yopish.

**Vazifalar:**
1. **R1:** «Ombor 02» dagi `__posPriority = 2` — H4 gacha OLIB TASHLANADI
   (bo'sh ombor kaskadda turishining ma'nosi yo'q va chalkashlik beradi).
2. **R4:** prioritet siyosati hujjatlashtiriladi (kim pp=1, nega) — H2 reyestrida.
3. **R5:** 291 yacheykaning zonasi — H4 (split) da avtomatik tiklanadi;
   H4 kechiksa alohida kichik skript bilan kod 2-segmentidan tiklash.
4. F7 hisoboti F-rejada YO'Q (F8 sessiyasi aniqlagan) — F7 sessiyasi yozsin
   yoki kod/commit asosida qisqa hisobot tiklanadi.
5. `scripts/guard-baseline.json` dagi `label-grounding.test.ts` qatori
   (G2 hisobotida qayd etilgan) — olib tashlash.

**Qabul mezoni:** har band yopilgan yoki tegishli fazaga havola bilan
o'tkazilgan; reyestr yangilangan.

**PROMPT:**
```
D:\sherset-v2 dagi docs/plans/2026-08-24-split-kassa-hodisasi.md ni to'liq o'qi.
Sen H6 fazasini bajarasan (kichik qarzlar). Faqat H6 vazifalari, testlar,
hisobot — va TO'XTA.
```

---

## 8. TARTIB VA BOG'LIQLIKLAR

```
H0 (bajarildi)
 ├─→ H1 (qoidalar)        ── mustaqil, DARHOL
 ├─→ H2 (holat reyestri)  ── mustaqil
 ├─→ H5 (soxta qoldiq)    ── mustaqil, egasining ishi bilan parallel
 ├─→ H6 (kichik qarzlar)  ── mustaqil
 └─→ H3 (signal) ──┐
                   ├─→ H4 (split qayta) ── S1 javobi + H2 + H3 SHART
      S1 javobi ───┘
```

- **Darhol boshlanadi:** H1, H2, H5, H6.
- **H3** — H2 dan keyin qulayroq (yetuvchanlik hisobi o'sha yerda).
- **H4** — eng oxirida, oldshartlar to'liq bajarilgach.
- **Egasining ishi (sanash)** hech qaysi fazaga bog'liq emas — bugundan
  boshlanaveradi (yacheykalar «Taqsimlanmagan» kartasida).

---

## 9. HISOBOTLAR (har faza o'z hisobotini SHU YERGA yozadi)

> Shablon: **Faza · sana · commit(lar)** — nima qilindi, test natijalari
> (raqamlar), deploy holati (jonli dalil), ochiq qolganlar, keyingi fazaga
> eslatmalar.

### JONLI O'ZGARISHLAR JURNALI

> Qoida 14: jonli holatga tegilgan har amal SHU YERGA yoziladi (sana, nima,
> dalil, qaytarish yo'li). H2 reyestri qurilgach u yerga ko'chadi.

**2026-08-24 · Yacheykalarni bitta omborga yig'ish + yetishmayotganlarini yaratish**
· skript `packages/db/scripts/create-cells.ts` (`5df1bcb0`) + mavjud
`warehouse-split-revert.ts`

*Sabab:* omborchi javondagi yorliqni skanerlaganda «Kod topilmadi» chiqardi.
Tekshiruvda ma'lum bo'ldiki yorliqlar to'g'ri, lekin **yacheykalar tizimda
yaratilmagan**: 1-omborda faqat `01-04` stelaji bor edi (`01-01`, `01-02`,
`01-03`, `01-05` YO'Q), `01-04` da faqat 1-qavat, `02-04` da faqat 1–2-qavat.
240 ta tovar mavjud bo'lmagan yacheykaga ishora qilardi.

*Bajarildi (ikkalasi ham DRY-RUN dan keyin):*
1. **119 ta `01-04-…` yacheyka «Ombor 01» dan «Taqsimlanmagan» ga ko'chirildi**
   (qoldiq 0 — ledger yozuvi yo'q, docId `bc15470b`). Sabab: kassa faqat
   prioritetli ombordan (`Taqsimlanmagan`, pp=1) sotadi; boshqa omborda
   sanalgan tovar sotilmay qolardi — bu aynan 06:46 hodisasining takrori
   bo'lardi. Endi HAMMA yacheyka bitta omborda.
2. **490 ta yacheyka yaratildi** (402 + 18 + 70): `01-01` 3×9, `01-02` 4×44,
   `01-03` 4×25, `01-05` 3×33, `01-04` 2-qavat, `02-04` 3–4-qavat. O'lchamlar
   tovarlarning `__yacheyka` yozuvlaridan olingan ENG KAM chegara (egasi:
   «shunday yarataver, keyin keraklisini qo'shib olamiz»). Zonasiz (hovuzdagi
   qolgan yacheykalar ham zonasiz).

*Natija (o'lchandi):* jami yacheyka **410 → 900**, hammasi «Taqsimlanmagan» da;
«Ombor 01» va «Ombor 02» bo'sh. **Mavjud bo'lmagan yacheykaga ishora qiluvchi
tovar: 240 → 0.** Qoldiqqa TEGILMADI (Σ o'zgarmagan, ledgerga yozuv yo'q).

*Qaytarish yo'li:* `create-cells.ts … --revert --apply` (faqat BO'SH va hech
qayerda ishlatilmagan yacheykalarni o'chiradi); yacheykalarni omborlarga
qaytarish — H4 dagi `warehouse-split.ts` (kod prefiksi bo'yicha, idempotent).

*Ochiq:* stelaj o'lchamlari eng kam chegarada — sanash paytida yetmasa
qo'shiladi (o'sha skript, idempotent). `01-04` (1-qavat o'rin 47–169) va
`02-04` (1-qavat o'rin 1–93) tarixiy irregular diapazonlar — to'ldirilmadi.

### H5 — Soxta «mashq» qoldig'ini hisobdan chiqarish · ⚠️ QISMAN · 2026-08-24

**Nega shoshilinch bo'lib qoldi (egasining savoli):** egasi 4–5 kun davomida
yacheykalarni qo'shib, har biriga haqiqiy sonni yozib chiqmoqchi. Kod tekshirildi
va javob shu: **sotilgan tovar yacheykadan ayriladi, tahminiy qoldiqdan emas.**
POS sotuvi deltasida `cellId` yo'q (`retail-sale.service.ts:1188`), shuning uchun
`stock.service.ts:353–380` chiqimni band yacheykalardan **katta-birinchi** o'zi
ayiradi. Ya'ni H5 siz: har kun sanalgan yacheykalar sotuvlar tufayli kamayadi,
soxta 48,65 mln esa **tegilmay turaveradi** — sanash ishi teskari tomonga ketadi.
Shu sabab H5 G4 dan oldinga qo'yildi.

**Ikki tomonlama bog'liqlik javobi (qoida 10 — «bu nima buzishi mumkin?»):**
Skript ombor jamisini (`Stock.qty`) KAMAYTIRADI — ya'ni printsipial jihatdan
POS'ni «yetarli emas» holatiga tushira oladi. Bu 06:46 hodisasining aynan shakli.
Uchta himoya qo'yildi (pastda): imzo-oralig'i, yacheyka/rezerv poli, va
«faqat savdo tugagach» tartibi. `StockByCell` ga TEGILMAYDI ⇒ sanash ishi
buzilmaydi; G2/G3/G4 oqimlariga tegishli joyi yo'q.

**Nima qilindi:**

1. **`packages/db/scripts/stock-baseline-cleanup-core.ts`** — sof yadro (SQL yo'q):
   `buildCleanupPlan` (ortiqcha → o'chiriladigan miqdor + tannarx deltasi + skip
   sabablari), `buildRevertPlan`, `writeOffCost`.
2. **`packages/db/scripts/stock-baseline-cleanup.ts`** — CLI: DRY-RUN default,
   `--apply`, `--allow-remote`, `--since`, `--band-min/--band-max`, `--json`,
   **`--revert <docId>`** (qoida 12 — teskarisi O'SHA skriptda).

**🔴 Rejaga QO'SHILGAN yechim — IMZO-ORALIG'I (`--band-min`/`--band-max`, default 9 000–11 000).**
Reja «sanab bo'lingan tovarlarning ortiqchasini o'chir» degan edi. Bu YETARLI EMAS:
tovar bir necha yacheykada bo'ladi va omborchi ularni 4–5 kunga bo'lib sanaydi.
Birinchi yacheyka sanalgach ortiqchani to'liq o'chirsak, hali sanalmagan
yacheykalardagi HAQIQIY tovar ham hisobdan chiqadi ⇒ ombor jamisi tushadi ⇒
kassir chekni yopolmaydi. **Yechim:** hodisa tahlilida O'LCHANGAN imzo — soxta
qoldiq 4428 tovarda aynan 9 000–11 000 oralig'ida. Haqiqiy qoldiq bu tor oraliqda
deyarli uchramaydi, shuning uchun skript faqat SHU oraliqdagi ortiqchani oladi.
Oraliq `--band-min 0 --band-max 0` bilan ONGLI ravishda o'chiriladi.

**Qo'riqchilar (hammasi test bilan qulflangan):**
- **`StockByCell` ga TEGILMAYDI** — skript `Stock` qatorini o'zi yozadi
  (`cellMode:'store-only'` semantikasi), ledger'ga `cellId = null`. Sabab yuqorida:
  oddiy chiqim yozganda endigina sanalgan yacheyka buzilardi.
- **Pol = max(yacheykalar yig'indisi, rezerv)** — qoldiq na sanalgan sondan, na
  rezervdan past tushmaydi; rezerv to'sganda qisman o'chadi (`cappedByReserve`).
- **Faqat sanalgan tovarlar** (`requireCell`, default) — yacheykasi yo'q tovar
  eski son bilan sotilaveradi (egasining «bosqichma-bosqich» qarori).
- **Tannarx** — o'rtacha tortilgan, `move-cost-basis.computeTransferCost` bilan
  AYNAN bir arifmetika; qoldiqni bo'shatsa butun `costBalanceMinor` ketadi
  (yaxlitlash tiyini qty=0 qatorda osilib qolmasin).
- **Ikki marta qaytarish RAD ETILADI.**
- **Yozish paytida qayta hisob:** har satr o'z `Serializable` tranzaksiyasida
  balansni QAYTA o'qib rejani shu tovar uchun qayta quradi — dry-run va apply
  orasida sotuv o'tgan bo'lsa eskirgan raqam yozilmaydi.

**Lokal isbot (uchma-uch, `sherset_v2_dev`):** tovar `Aelifv E21`,
yacheykada 1000, jamiga soxta 9960 qo'shildi (jami 10 960, tannarx 1 000 000 tiyin):

```
DRY-RUN : Ombor 02 | Aelifv E21 | 10960 | 1000 | 0 | 9960 | 1000
APPLY   : qty 10960 -> 1000 · cost 1000000 -> 93640 · yacheykada 1000 (O'ZGARMADI)
          ledger: stock_baseline_writeoff  -9960 / -906360 · cellId = null
QAYTA   : no-op (idempotent)
REVERT  : qty -> 10960 · cost -> 1000000  (sikl NOL yig'indi)
2x REVERT: RAD ETILDI
```

Isbotdan keyin dev baza asl holatiga tiklandi va vaqtinchalik skript o'chirildi.

**Testlar:** yangi `apps/api/src/scripts/stock-baseline-cleanup-core.test.ts` —
**26 test**: asosiy hisob (egasining aynan keysi 10 000/40), sanalgan yacheyka
kamaymasligi, idempotentlik, Decimal kasrlari; imzo-oralig'i (past/yuqori/inklyuziv
chegara/o'chirish); sanash mezoni va `--since`; rezerv himoyasi (qisman/to'liq
to'siq); tannarx (proporsional, bo'shatish, nol); jamlar; qaytarish (teskari,
jamlash, null tannarx, **sikl nol yig'indi**).
TO'LIQ: **api 630 fayl / 8804 passed (2 skipped, 0 xato)**; `packages/db`
typecheck yashil; biome — 0 xato (18 ogohlantirish: skriptlardagi `console.log`,
`warehouse-split.ts` bilan bir xil klass).

**Deploy holati:** deploy talab qilmaydi (skript qo'lda/CI'da yuriladi).
**Jonli holat: HALI YUGURTIRILMAGAN** — reja 4-vazifasi: avval DRY-RUN, ro'yxat
EGASIGA ko'rsatiladi, tasdiqdan keyin `--apply --allow-remote`. Shu sabab faza
QISMAN (qoida 11).

**Muntazam yuritish tartibi (reja 5-vazifasi):**
1. **Kunduzi** — omborchi sanaydi. Skript YUGURTIRILMAYDI (ombor jamisini
   kunduzi pasaytirish kassani to'xtatishi mumkin — qoida 13).
2. **Savdo tugagach** — `npx tsx scripts/stock-baseline-cleanup.ts --since <bugun>`
   (DRY-RUN). Ro'yxat: qaysi tovardan qancha o'chadi.
3. Ro'yxat ko'zdan kechirilgach — o'sha buyruq `--apply --allow-remote` bilan.
   Chiqishdagi **qaytarish buyrug'ini SAQLANG** (bitta `docId`).
4. **Ertasi ertalab, savdo boshlanishidan OLDIN** —
   `npx tsx scripts/warehouse-state.ts` (H2) + bitta sinov sotuv
   (post → tekshir → cancel). Nosozlik bo'lsa: `--revert <docId> --apply --allow-remote`.
5. Har yugurish `docs/ops/jonli-holat.md` ning o'zgarishlar jurnaliga yoziladi (qoida 14).

**Ochiq qolganlar / keyingi fazalarga:**
- **🔴 Jonli DRY-RUN** — H5 ni yopish uchun birinchi qadam. Faqat O'QISH,
  istalgan payt xavfsiz: `cd /var/www/sherset-v2/packages/db && npx tsx
  scripts/stock-baseline-cleanup.ts`. Ro'yxat egasiga ko'rsatiladi.
- **Imzo-oralig'ini jonli raqam bilan tekshirish shart:** 9 000–11 000 hodisa
  tahlilidagi o'lchovdan olingan. Jonli dry-run boshqa manzara ko'rsatsa oraliq
  moslanadi (`--band-min/--band-max`).
- **Mezon (ombor × tovar) kesimida ishlaydi.** Hozir hammasi bitta omborda
  («Taqsimlanmagan») — muammo yo'q. **H4 (split) dan keyin** tovarning
  yacheykalari bir omborda, soxta qoldig'i boshqasida qolishi mumkin va u holda
  skript ishlamaydi. H4 sessiyasi buni tekshirsin.
- Skript sotuv oqimiga TEGMAYDI: sanalgan yacheykadan ayirish muammosining
  ILDIZI — POS deltasida `cellId` yo'qligi. Uni **G4/E3** yopadi.
- Avtomatlashtirishning keyingi bosqichi (agar kerak bo'lsa): inventarizatsiya
  hujjatida «to'liq sanaldi — ortiqchani o'chir» belgisi, post bilan bir
  tranzaksiyada. Hozircha kechalik yugurish yetarli va xavfsizroq.

### H2 — Jonli holat reyestri + warehouse-state.ts · ⚠️ QISMAN · 2026-08-24

**Holat qoida 11 bo'yicha: «QISMAN — jonli tasdiq kutilmoqda».** Kod, reyestr va
testlar tayyor va yashil; qabul mezonining «skript JONLIDA yugurtirilib hozirgi
holatni to'g'ri chiqaradi» bandi bajarilMAGAN — bu sessiyada jonli baza kirishi
berilmagan. O'zim yozgan qoidani o'zimga tatbiq qildim: faza «TUGADI» deb
yopilmaydi (aynan F5 ni yopib yuborgan xato).

**Ikki tomonlama bog'liqlik javobi (qoida 10 — «bu nima buzishi mumkin?»):**
HECH NARSA. `warehouse-state.ts` da birorta `create/update/delete/executeRaw` YO'Q,
`--apply` flagi ham ataylab yo'q — u faqat `findMany`/`groupBy` qiladi. Yagona
tashqi ta'siri — chiqish kodi 2 (kelajakdagi H3 deploy-qo'riqchisi uchun).
Reyestr fayli — hujjat. G-reja bo'yicha tekshirildi: G3 ning BRAK ombori yadroda
ISTISNO qilingan (pastda), G1/G2 ga tegishli joyi yo'q.

**Nima qilindi:**

1. **`docs/ops/jonli-holat.md`** — jonli holat reyestri. Ikki qatlam bitta faylda:
   - **1-bo'lim: mashina o'qiydigan json bloki** (`split`, `posSessionStore`,
     `allowUnreachableQty`, `stores[]` → `posPriority`/`brak`/`unassignedSource`);
   - **2–4-bo'limlar: odam uchun** — o'lchangan jadval, «nega hozir shunday»
     izohlari (R1/R4 xavflari nomi bilan), tekshirish buyruqlari va
     **o'zgarishlar jurnali** (qoida 14).

   *Qaror:* `.md` + alohida `.json` ko'rildi va RAD ETILDI — ikki fayl bir-biridan
   ajralib ketardi va aynan IS-7 («hujjat haqiqatni aytmaydi») qaytardi.
   Skript md ichidan json blokini o'qiydi; blok yo'q bo'lsa OCHIQ yiqiladi
   (jimgina «farq yo'q» demaydi — silent-wrong-0 tuzog'i).

2. **`packages/db/scripts/warehouse-state-core.ts`** — SOF yadro (SQL yo'q):
   - `buildWarehouseState` → ombor kesimi (yacheyka/zona/zonasiz, ombor qoldig'i,
     yacheykalardagi, **yacheykasiz = ayirma**), kaskad tartibi, split holati;
   - **`ReachStatus` — fazaning o'zagi:** `reachable` (kaskadning BIRINCHI ombori —
     POS avtomatik ayiradi), `needs_approval` (kaskadda bor, birinchi emas → G4
     tasdig'i kerak, **G4 hali YO'Q**), `outside_cascade` (kaskadda umuman yo'q),
     `brak` (ataylab yopiq). **«POS yeta olmaydigan qoldiq» = birinchi ikkalasi.**
   - **BRAK ombori ISTISNO** — G3 hisobotidagi ogohlantirish bajarildi: busiz
     birinchi brak qabulidan keyin har deploy bloklanardi va signal «bo'ri keldi»
     bo'lib qolardi;
   - **kaskad sozlanmagan holat** — F6 zaxira yo'li: POS smena omboridan ishlaydi,
     shuning uchun «reachable» ochiq smenalar ombori bo'ladi;
   - split holati yacheyka kodi prefiksidan: `bajarilgan` / `qaytarilgan` /
     `qisman` / `yacheyka yoq` + yetishmayotgan ombor nomlari;
   - `diffAgainstRegistry` → `xato` / `ogohlantirish` darajali driftlar;
     `exitCodeFor` → 0 yoki 2.
   - ⚠️ `readPosPriority` va kaskad tartibi apps/api dagi `retail-stock-cascade.ts`
     ning TAKRORI (packages/db app qatlamiga qaray olmaydi — `warehouse-split-core`
     dagi cost-basis takrori bilan bir sabab). Ikkalasida ham izoh qo'yilgan;
     testda qoida aynan qulflangan.

3. **`packages/db/scripts/warehouse-state.ts`** — 🔒 FAQAT O'QISH CLI.
   `--json` (mashina uchun), `--no-registry` (faqat o'lchov). Har akkaunt bo'yicha
   jadval + drift ro'yxati; oxirida `process.exitCode`.

4. **Deploy retseptiga qadam** (F-reja 2-bo'lim, 8-band): ombor/qoldiq/kassaga
   tegadigan deploy'dan **OLDIN va KEYIN** skript yugurtiriladi, chiqishi hisobotga
   ko'chiriladi; kod 2 bo'lsa sabab aniqlanmaguncha davom etilmaydi.

**🔴 Eng muhim natija — detektor hodisani QAYTA TIKLADI.**
Lokal dev bazasi (`sherset_v2_dev`) split QILINGAN holatning nusxasi ekan, va
skript birinchi yugurishdayoq aynan 06:46 nosozligini ko'rsatdi:

```
Ombor 02 | — | 291 | 4 | 0 | 2949085 | 2949085 | 0 | 0 | kaskadda YO‘Q
Taqsimlanmagan | — | 0 | 0 | 0 | 49575145.387857 | 0 | ... | 8 | POS SOTADI

🔴 POS YETA OLMAYDIGAN QOLDIQ: 2949085 dona
   · Ombor 02: 2949085 (kaskadda YO‘Q)
```

2 949 085 dona — hodisa xronologiyasidagi **2 949 007** bilan bir xil kattalik
(dev nusxasi biroz boshqa paytda olingan). Ya'ni bu skript 2026-08-23 kuni mavjud
bo'lganida, split'dan KEYINGI birinchi yugurishda — savdo boshlanishidan oldin —
qizil bergan bo'lardi va 46 daqiqalik to'xtash bo'lmasdi. Chiqish kodi: **2**
(tekshirildi), `--no-registry` bilan **0**.

**Testlar:**
- yangi `apps/api/src/scripts/warehouse-state-core.test.ts` — **24 test**
  (`warehouse-split-core.test.ts` joylashuv naqshi): prioritet o'qish qoidasi 9 holat;
  yetuvchanlik — hodisaning aynan shakli, `outside_cascade`, **BRAK istisnosi**,
  bo'sh ombor shovqin qilmasligi (hozirgi R1 holati), kaskadsiz zaxira yo'l,
  kaskad tartibi; split 4 holat; yacheykasiz qoldiq va Decimal kasrlari (float yo'q);
  reyestr parse + OCHIQ yiqilish; drift 8 holat, jumladan «POS ombori kaskad boshi
  emas» va «yangi ombor faqat ogohlantirish»; **haqiqiy `docs/ops/jonli-holat.md`
  faylining o'zi parse bo'lishi va POS omborining pp=1 ekani**.
- TO'LIQ: **api 629 fayl / 8778 passed (2 skipped, 0 xato, RC=0)** — G3 hisobotidagi
  628/8754 ustiga aynan +1 fayl / +24 test.
- `packages/db` typecheck yashil; biome yangi 3 faylda xatosiz (formatlash qo'llandi).
- **Web TEGILMADI** (bu fazada web fayli yo'q) — shuning uchun web vitest
  yugurtirilmadi; i18n gate'lar ham web/api matnlariga tegilmagani uchun mavzuga
  aloqasiz. Skript chiqishi — CLI matni, i18n emas (mavjud `warehouse-split.ts`
  naqshi).

**Deploy holati:** talab qilinmaydi (skript CI/qo'lda yuritiladi, jonliga chiqmaydi).

**Qabul mezoni bo'yicha:**
- «reyestrdan farq yasalganda qizil beradi» — ✅ lokal yugurishda 4 ta drift +
  chiqish kodi 2; birlik testlarida har drift turi alohida.
- «skript jonlida yugurtirilib hozirgi holatni to'g'ri chiqaradi» — ❌ **BAJARILMADI**
  (jonli baza kirishi yo'q). Shu sabab faza QISMAN.

**Ochiq qolganlar / keyingi fazalarga:**
- **🔴 Jonli yugurish** — H2 ni yopish uchun yagona qolgan ish. Kerak: VPS'da
  `cd /var/www/sherset-v2/packages/db && npx tsx scripts/warehouse-state.ts`.
  Skript FAQAT O'QISH, savdo ustida ham xavfsiz. Natija shu hisobotga qo'shiladi va
  reyestrdagi raqamlar (900 yacheyka va h.k.) tasdiqlanadi — ular hozircha
  **parallel sessiyaning jurnalidan** olingan, o'z o'lchovim emas.
- Reyestrdagi `Ombor 02 → posPriority 2` **ataylab** hozirgi (noto'g'ri) haqiqatni
  yozadi, chunki reyestr = KUTILAYOTGAN holat va hozir u shunday. **H6/1-band** uni
  olib tashlagach reyestrda `null` ga o'zgartirilishi SHART, aks holda skript
  darhol qizil beradi.
- **BRAK ombori yaratilgach** (G3 deploy'i) reyestrga `brak: true`,
  `posPriority: null` qatori qo'shiladi — busiz birinchi brak qabuli har deploy'ni
  bloklaydi.
- **H3 uchun tayyor ulanish nuqtasi:** `report.unreachableQty` va
  `report.unreachable[]` — deploy-oldi qo'riqchisi (H3/3-band) aynan shularni
  o'qiydi; `exitCodeFor` allaqachon 2 beradi.
- Skript yacheyka ZONASINI ham sanaydi (`zonasiz` ustuni) — R5 (zonasiz yacheykalar)
  shu ustunda ko'rinadi, H4 dan keyin 0 bo'lishi kutiladi.
- Reyestr faqat TUZILMANI tekshiradi, qoldiq RAQAMLARINI emas (ular kunlik
  o'zgaradi). «Soxta 10 000 lar» (R6) H5 ning ishi.
- **Parallel sessiya ogohlantirishi:** shu sessiya davomida repoda boshqa Claude
  sessiyasi ishladi (`073e6b52`, Fable 5) va AYNI shu faylga yozdi hamda jonlida
  490 yacheyka yaratdi. Diffim path-cheklangan, ularning matni saqlandi
  (CLAUDE.md §6). Reyestrdagi 2026-08-24 ~21:00 qatori — o'sha ish.

### H1 — Jarayon qoidalari · 2026-08-24

**Nima qilindi (kod yo'q — jarayon/hujjat ishi):**

1. **10–14-bandlar F-rejaning 2-bo'limiga KANONIK matn sifatida kiritildi**
   (`docs/plans/2026-08-23-ombor-restrukturizatsiya.md`, 9-banddan keyin).
   Nusxa qilinmadi — G-reja va H-reja sarlavhalarida **havola** turadi
   (bir haqiqat, bir joyda). Har bandda uni tug'dirgan ildiz sabab qavs ichida
   ko'rsatilgan (IS-1 … IS-6), ya'ni «nega bu qoida bor» savoli hujjatda javobli.
2. **Promptlar tuzatildi (qoida 10 ning amaliy qismi — IS-1 ning haqiqiy yopilishi):**
   - F-rejadagi **8 ta** faza-prompti (F1…F8) endi G-rejani VA hodisa rejasini ham
     o'qishni talab qiladi;
   - G-rejadagi **5 ta** «Ikkala rejani to'liq o'qi» prompti (G2–G6) va **G1** prompti
     hodisa rejasini qo'shdi.
   Sabab: qoidani faqat 2-bo'limga yozish yetarli emas edi — F5 sessiyasi aynan
   PROMPT bo'yicha ishlagan va prompt G-rejani so'ramagan edi.
3. **Qoida (11) RETROSPEKTIV tatbiq etildi** — bu bandning birinchi haqiqiy sinovi:
   - F-reja sarlavhasidagi «Holat» qatori qayta yozildi: **F5 endi «TUGADI» emas,
     «QISMAN, TUGAMAGAN»** (qabul mezonining «kassa sotuvi ishlaydi» bandi
     bajarilmagan va split qaytarilgan) → H4 yopadi;
   - **F7 ham «QISMAN»** (kodi jonlida, hisoboti yo'q) → H6/4-band;
   - F5 hisoboti sarlavhasiga `⚠️ QISMAN (yopilmagan)` belgisi qo'yildi.
   Ya'ni endi rejani o'qigan sessiya «F5 tugagan» degan noto'g'ri xulosaga
   kela olmaydi — sarlavhaning O'ZI to'g'ri holatni aytadi.
4. **`CLAUDE.md` ga 5.5-bo'lim** («Jonli OMBOR/QOLDIQ/KASSA ma'lumotiga tegishdan
   oldin») — har sessiya auto-load qiladigan faylda, hodisa rejasiga yo'naltiruvchi
   + 10–14 bandlarining bir qatorlik xulosasi + reyestr yo'llari.

**Fayllar:** `docs/plans/2026-08-23-ombor-restrukturizatsiya.md` (2-bo'lim +8 band,
sarlavha, 8 prompt, F5 hisobot sarlavhasi); `docs/plans/2026-08-23-omborchi-tsd-mijozlar.md`
(sarlavha + 6 prompt); `docs/plans/2026-08-24-split-kassa-hodisasi.md` (sarlavha + shu hisobot);
`CLAUDE.md` (yangi 5.5).

**Testlar:** bu fazada kod o'zgarmadi — vitest/typecheck uchun yangi narsa yo'q.
Tekshiruv o'rniga **deterministik tatbiq**: har tahrir anchor-asosli skript bilan
qilindi (`assert` bilan — anchor topilmasa skript TO'XTAYDI, «jimgina yarim
qo'llanish» bo'lmaydi, `CLAUDE.md` §6.5 saboqi). Sanoq natijalari skript chiqishida:
F 8/8 prompt, G 5+1 prompt.

**Deploy holati:** talab qilinmaydi (faqat hujjat).

**Qabul mezoni tekshiruvi** (qoida 11 o'zini ham qamraydi):
- «yangi sessiya F yoki G fazasini boshlaganda bu qoidalarni o'qimasdan o'ta olmaydi»
  — ✅ uch yo'l bilan qulflangan: (a) prompt matni ikkala rejani + hodisa rejasini
  so'raydi, (b) F-reja 2-bo'limi kanonik matn, (c) `CLAUDE.md` auto-load bo'lgani
  uchun prompt buzilgan holatda ham 5.5-bo'lim ko'rinadi.
- «qoidalar ikkala rejada ham bir xil» — ✅ nusxa emas, havola (matn bitta joyda).

**Ochiq qolganlar / keyingi fazalarga:**
- `docs/ops/jonli-holat.md` va `packages/db/scripts/warehouse-state.ts` ga havolalar
  (CLAUDE.md 5.5 va qoida 14 da) **H2 da yaratiladi** — H2 gacha bu ikki yo'l mavjud emas.
- Qoida (13) ning «uchma-uch smoke» ni KIM bajaradi degan tomoni ochiq: hozircha
  «javobgar shaxs hisobotda yoziladi» deb qo'yildi. Jonli sotuv sinovini agent o'zi
  qila olmaydi (kassa POS'i odam qo'lida) — H4 da bu javobgarlik aniq ismga
  biriktirilishi kerak.
- Qoida (11) bo'yicha **G4 ham hozir boshlanmaydi**: uning oldsharti F5, F5 esa endi
  rasman «QISMAN». G4 ning yo'li S1 javobiga bog'liq (variant C).

### H0 — Hodisa hujjatlashtirildi · 2026-08-24

**Nima qilindi:**
- Bu tahlil-reja yaratildi: xronologiya (ledger dalillari bilan), mexanizm,
  7 ta ildiz sabab, hozirgi jonli holat (o'lchangan raqamlar), 6 ta ochiq xavf,
  egasiga 1 savol (S1), 6 faza (H1–H6).
- `packages/db/scripts/warehouse-split-revert.ts` VPS'dan olinib repoga kiritildi
  (u yerda git'ga kirmagan holda yotardi — R2 yopildi).
- F-reja va G-rejaga hodisa havolasi qo'yildi.
- Xotira yangilandi: jonli holat = **split QAYTARILGAN**.

**Tekshiruv (faqat O'QISH, jonli bazada):** ledger `warehouse_split` 546 qator
(2026-08-23 15:58:36) va `warehouse_split_revert` 546 qator (2026-08-24 06:46:16),
ikkalasida ham Σqty=0 — ma'lumot yo'qolmagani raqam bilan tasdiqlandi.
Omborlar kesimi 5-bo'limdagi jadvalda. Ta'sir doirasi: 5082 tovardan 273 tasi.

**Ochiq qolganlar:** H1–H6 (yuqorida), S1 savoli egasida.
