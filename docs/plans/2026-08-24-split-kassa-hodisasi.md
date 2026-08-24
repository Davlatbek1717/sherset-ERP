# Hodisa: ombor-split kassani to'xtatdi — tahlil va tuzatish rejasi

> **Yaratilgan:** 2026-08-24 · **Buyurtmachi:** Ozodbek (egasi) · **Holat:** H0, H1 TUGADI · navbat H2 · **S1 savoli hamon JAVOBSIZ** (6-bo'lim)
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

## 6. EGASIGA SAVOL (rejaning yo'nalishini belgilaydi)

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

### H2 — Jonli holat reyestri + tekshirgich skript

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
- **S1 savoliga egasidan javob olingan** (6-bo'lim);
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

### H5 — Soxta «mashq» qoldig'ini hisobdan chiqarish (egasi bilan kelishilgan)

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
