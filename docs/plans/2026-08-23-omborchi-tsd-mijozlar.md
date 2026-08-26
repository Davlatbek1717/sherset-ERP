# Omborchi va TSD mijozlari — kontrol, vozvrat, TSD APK

> **Yaratilgan:** 2026-08-23 · **Buyurtmachi:** Ozodbek (egasi) · **Holat:** **G1 ⚠️ QISMAN** (kod tayyor va HEAD'da butunligi 2026-08-25 da qayta tasdiqlandi; qabul mezoni jonli tasdiqni kutmoqda — egasi 2026-08-25 da deploy'ni «hozir yo'q» dedi; `9fe25d15` da bitta o'lik i18n kaliti tuzatildi) · G2+G3 KOD TAYYOR · **G4 2a (backend) TAYYOR** — kassa endi ko'p ombordan AVTOMATIK sotadi (tasdiq-to'sig'i olib tashlandi); 2b qoldi: POS UI, yig'ish topshiriqlari, H2/H3 (E5) · **G5 QISMAN** — TSD auth + APK skeleti · **G6 QISMAN** — TSD ish ekranlari (yig'ish + yetishmovchilik, joylashtirish, sanash) tayyor, **APK ENDI HAQIQATAN QURILADI** (`BUILD SUCCESSFUL`), lekin jonli qurilmada tekshirilmagan (qoida 11). **Deploy kutilmoqda** — egasi «keyinroq» dedi VA 2026-08-24 hodisasi hal bo'lmagan (`docs/plans/2026-08-24-split-kassa-hodisasi.md`). Deploy'da: `topup-role-permissions.ts` MAJBURIY (`retailcontrol` + `returnacceptance` + **`piecetracking`**); G-rejaning O'Z migratsiyalari BESHTA (G1 `…120000_drawer_cash_out_sales_return`, G3 `…170000_sales_return_retail_sale`, G4 `20260825020000_retail_sale_position_allocation`, G5 `20260825170000_tsd_device`, G6 `20260825200000_tsd_work_screens`), lekin **BUTUN DELTA — 12 migratsiya** (Q/A/K bilan birga; tartib dossierda); **egasi qo'lida:** Ombor 07 kartasiga «Kassa oldidagi ombor» checkbox'i (busiz «07 bo'linishda oxirida» qoidasi ishlamaydi). ⚠️ Bu deploy JONLI XULQNI o'zgartiradi — G4 2a hisobotidagi «Jonli sozlash» NI VA G6 hisobotining 1-bandini (omborchiga yacheyka ko'chirish OCHILADI) o'qing
>
> 📋 **DEPLOY DOSSIERI — `docs/ops/2026-08-25-deploy-dossieri.md` (2026-08-26 da QAYTA YOZILDI).**
> Sarlavhadagi «BESHTA» — G-rejaning O'Z migratsiyalari; dossierning birinchi
> tahriridagi «YETTITA» esa ESKIRGAN. **Joriy raqamlar: delta
> `62a27024..HEAD` = 73 commit, 12 migratsiya** (G1–G6 + Q1–Q6 + A1–A3 +
> K1–K6 + H2/H5 + E5). Dossierda migratsiyalarning TARTIBI va qadamma-qadam
> retsept bor.
> ✅ **B0 (push), B1 (12/12 migratsiya lokal isbotlangan), B2 (down skriptlar
> sinalgan), B3 (deploy qo'riqchisi) va E5 — 2026-08-26 da YOPILDI.**
> 🔴 **B3 tuzog'i endi MEXANIK:** `deploy-smart.sh` `reset --hard` HEAD ni
> ORQAGA suradigan bo'lsa TO'XTAYDI (`origin/climart-adoption` jonlidan
> 8 commit orqada — F6/F7/F8 aynan o'sha 8 tada). Baribir faqat qo'lda
> ff-merge (F-reja 2.8) — `/deploy` ISHLATILMAYDI.
> 🔴 **B5: `warehouse-state.ts` jonli HEAD'da YO'Q** (H2 hali deploy
> qilinmagan) ⇒ «deploy'dan OLDIN yugurtir» qadami bu BIRINCHI deploy uchun
> bajarilmaydi; u deploy'dan KEYINGI smoke'ga ko'chirildi.
> ✅ **E5 (D1)** — `warehouse-state-core.ts` endi G4-2a haqiqatida
> (`needs_approval` bekor, `reachable` = kaskaddagi hammasi, reyestrda
> `posFront`). G4 2b ning qolgan bandlari: POS UI + yig'ish topshiriqlari.
>
> **Ijro tartibi:** har faza ALOHIDA sessiyada. Agent shu faylni va
> `docs/plans/2026-08-23-ombor-restrukturizatsiya.md` ni (F-reja) TO'LIQ o'qiydi,
> O'Z fazasini bajaradi, testlardan o'tkazadi, pastdagi «Hisobotlar»ga yozadi va TO'XTAYDI.
> **O'ZGARMAS QOIDALAR:** F-rejaning 2-bo'limi shu rejaga ham AYNAN tatbiq etiladi
> (bitta sessiya = bitta faza; testlar + i18n ru/uz majburiy; maxfiy ma'lumot yozilmaydi;
> branch/push/deploy retsepti o'sha yerda; jonli bazaga skript avval lokalda).
> **Jumladan 2026-08-24 hodisasidan keyin qo'shilgan 10–14 bandlari:**
> (10) ikki tomonlama bog'liqlik — hisobotda «bu o'zgarish nimani buzishi mumkin?»
> savoliga yozma javob; (11) bajarilmagan qabul mezoni bilan faza YOPILMAYDI va
> keyingi faza boshlanmaydi; (12) jonli skriptning teskarisi o'sha sessiyada
> yoziladi va sinaladi; (13) jonli o'zgarishdan keyin uchma-uch smoke
> (sotuv + sanash + ko'chirish); (14) VPS'da yozilgan skript o'sha kuni git'ga.
>
> 🔴 **2026-08-24 hodisasi:** jonli split kassani to'xtatib qo'ydi va qaytarildi.
> Jonli ma'lumotga tegadigan faza boshlanishidan oldin
> **`docs/plans/2026-08-24-split-kassa-hodisasi.md`** o'qiladi (u yerda yangi
> majburiy qoidalar: qaytarish yo'li, qabul mezoni bilan yopish, uchma-uch smoke).

---

## 1. Kontekst va chegaralar (F-reja bilan bo'linish)

Bu reja F-rejani TAKRORLAMAYDI. Quyidagilar **F-rejaga tegishli, bu yerda qilinmaydi**:

| Ish | Qayerda |
|---|---|
| 7 omborga split, «Taqsimlanmagan» hovuz | F4/F5 |
| Yangi ombor raqamlashtirish vositasi + katta omborchi permissionlari | F3 |
| Kassada sotuv ayirishning yacheyka kesimiga o'tishi (delta cellId) | F6 |
| Kaskad ayirish dvigateli (07 → boshqalar), to'lov-moment, rezerv | F6 |
| Omborlararo Move yacheyka-darajada, «Taqsimlanmagan»dan joylashtirish | F7 |
| Katta omborchi Electron .exe QOBIG'I + avto-yangilanish kanali | F8 |

Bu reja esa **mijoz-oqimlarni** beradi: kassir↔ombor kontrol zanjiri, vozvrat qabul
va pulini kassadan qaytarish, yetishmovchilikni bosh omborchi tasdig'i bilan yopish,
kichik omborchilar uchun TSD (Android, qo'l terminali) ilovasi. G3 ekranlari F8
qobig'i ichida ochiladi; G4 faza F5+F6 tugaganini kutadi.

**Egasining biznes-qoidalari (2026-08-23 suhbatda kelishildi):**
- Katta omborchi kontrolda SKANERLAMAYDI — yig'ilgan buyurtmani ko'z bilan tekshirib
  «To'liq» deydi, kerak bo'lsa tarkibni TAHRIRLAYDI va bu kassirga darhol ko'rinadi.
- Vozvrat pulini KASSIR qaytaradi: mijoz profilida qaytim summasi chiqadi, qaytargan
  kassirning kassasidan naqd kamayadi (smena hisobiga tushadi).
- Tovarga yorliq yopishtirilmaydi (shtrix yacheykada); FAQAT vozvrat tovarlariga
  yorliq bosiladi (tovar shtrixi + yacheyka kodi), topish oson bo'lishi uchun.
- Ombor xodimlari narx ko'rmaydi; kirim narxi faqat katta omborchiga (permission).
- ~~**Q1 aniqlashtiruvi (2026-08-23):** 07-omborda yetmagan tovar boshqa ombordan
  AVTOMATIK ayirilmaydi — bosh omborchiga so'rov boradi, u manba yacheykani tanlab
  TASDIQLAGACH avto-Move (manba ombor → 07) o'tadi…~~
  🔴 **BEKOR QILINDI (egasi, 2026-08-24) — pastdagi Q1-v2 kuchda.** Aynan shu
  «tasdiq» qoidasi 2026-08-24 da kassani to'xtatib qo'ydi
  (`docs/plans/2026-08-24-split-kassa-hodisasi.md`).

- **🔵 Q1-v2 — KO'P OMBORLI AVTO-TAQSIMOT (egasi, 2026-08-24, YAKUNIY):**
  **Omborchi tasdig'i degan narsa YO'Q.** Kassir buyurtma yozganda tizim tovarni
  BARCHA omborlarning yacheykalari kesimida ko'radi va o'zi taqsimlaydi:

  | # | Holat | Qaror |
  |---|---|---|
  | 1 | **07 dagi yacheyka butun miqdorni qoplaydi** | 07 dan olinadi (kassa oldida, eng tez — yig'ish kerak emas) |
  | 2 | 07 yetmaydi, boshqa yacheykalardan **biri yolg'iz qoplaydi** | O'sha BITTA yacheykadan hammasi olinadi — bo'linish yo'q, bitta omborchi, bitta yurish. Bir nechtasi qoplasa — **yetadigan ENG KICHIGI** (yacheyka bo'shaydi, javonda joy ochiladi, kichik qoldiqlar yig'ilib qolmaydi) |
  | 3 | Hech bir yacheyka yolg'iz qoplamaydi | Bo'linadi: **avval boshqa omborlar**, **07 ENG OXIRIDA** |

  **Nega 07 bo'linishda oxirgi:** u kassa oldidagi ombor, donali xarid qiladigan
  mijozga tez xizmat uchun turibdi va baribir boshqa omborlardan to'ldiriladi —
  buyurtmalar uni bo'shatib qo'ymasligi kerak.

  **Kassir huquqi:** tizim o'zi taqsimlaydi, kassir ekranda yacheykalarni KO'RADI
  va kerak bo'lsa boshqa yacheyka/omborni tanlaydi (o'zgartira oladi).

  > 🔴 **Q1-v2 ISTISNOSI — BO'LINADIGAN TOVAR (egasi, 2026-08-25).**
  > `pieceTracked = true` tovarlarda (kabel, sim, shlang — rulondan metrlab
  > sotiladigan) **3-holat QO'LLANMAYDI**: 180 m ni «100 + 80» deb ikki
  > yacheykadan taqsimlash mijozga yaroqsiz, chunki unga UZLUKSIZ bo'lak kerak.
  > Bunday tovarda avto-taqsimot butunlay o'chadi — tizim bo'laklarni ko'rsatadi,
  > qarorni kassir mijoz bilan kelishib qabul qiladi.
  > To'liq tavsif, model va fazalar:
  > **`docs/plans/2026-08-25-bolinadigan-tovar-bolak-hisobi.md`** (K-reja, 7-bo'lim).
  > G4 yoki taqsimot mantiqiga tegadigan har qanday faza SHU FAYLNI ham o'qiydi.
  > Diqqat: K-reja shtrix unikalligi qoidasiga ham istisno kiritadi (7.3).

**Tayyor poydevor (qayta qurilmaydi):** RetailSale FSM `draft→picking→ready→posted`;
`send-to-picking` yacheyka-prefiks bo'yicha sklad-kesim `RestockTask`lar ochib
`SkladKeeper` orqali biriktiradi; `mark-ready`, `PATCH /retail-sales/:id/edit`;
`SalesReturn` (pozitsiyada `cellId`, `post` = qoldiq + mijoz balansi bitta tx);
label moduli + print-agent (17777); SSE `/notifications/stream`
(`picking_assigned`, `restock_assigned`, `return_to_warehouse`); `PosDevice`+PIN
auth va kiosk-allowlist andozasi; `android/driver-app` (Kotlin, offline bufer) andozasi.

**Diqqat (ikkala rejaga ham):** shtrixlar ataylab UNIKAL EMAS — har skaner mijozi
multi-hit tanlovni qo'llashi shart (`apps/web/src/app/(app)/scan/page.tsx` naqshi).

---

## 2. FAZALAR

### G1 — Vozvrat pulini kassadan qaytarish (backend + POS)

**Maqsad:** ombor qabul qilgan `SalesReturn` uchun mijozga pulni kassir bersin,
pul izi kassa/smena hisobida to'liq ko'rinsin.

**Vazifalar:**
1. Yangi endpoint `POST /cashier-sessions/:id/customer-payout`:
   `SalesReturn`ga bog'langan chiqim (mavjud `RetailDrawerCashOut` mexanizmi
   ustiga yangi `kind`, masalan `return_payout` + `salesReturnId`), kassirning
   `CashDesk.balanceMinor` kamayadi, joriy smenaning expected-cash formulasi va
   Z-hisobotga kiradi. `SalesReturn.payedSumMinor` cap — bitta vozvratni ikki
   marta to'lab bo'lmaydi (qisman to'lash mumkin). `CashierAuditEvent` yoziladi.
2. POS mijoz profili: «To'lanmagan vozvratlar» bloki (post bo'lgan, to'liq
   to'lanmagan SalesReturn ro'yxati + jami qaytim), to'lash oqimi, chek chop etish.
3. Ruxsat: kassir roliga payout, kiosk-allowlist'ga yangi marshrut.
4. Testlar: cap, ikki valyuta ehtiyoti (payout faqat UZS deb boshlaymiz —
   hisobotda qayd et), smena yopilishida hisob to'g'riligi, audit.

**Qabul mezoni:** jonlida sinov-vozvrat post qilinib, POS'da mijoz profilida
summasi chiqadi, to'langach smena expected-cash aynan shu summaga kamayadi,
ikkinchi to'lov urinishi rad etiladi.

**PROMPT (yangi sessiyaga ko'chirib qo'ying):**
```
D:\sherset-v2 dagi docs/plans/2026-08-23-omborchi-tsd-mijozlar.md va
docs/plans/2026-08-23-ombor-restrukturizatsiya.md rejalarini to'liq o'qi.
docs/plans/2026-08-24-split-kassa-hodisasi.md ni ham o'qi (qoida 10).
Sen G1 fazasini bajarasan (vozvrat pulini kassadan qaytarish). Faqat G1 vazifalari,
testlar, deploy, jonli tekshiruv, hisobot shu faylga — va TO'XTA.
```

---

### G2 — Kontrol oqimi: katta omborchi navbati + tarkib tahriri kassirga jonli

**Maqsad:** yig'ilgan cheklar katta omborchi navbatiga tushsin; u ko'z bilan
tekshirib «To'liq» desin yoki tarkibni o'zgartirsin — o'zgarish kassirda darhol.

**Vazifalar:**
1. Kontrol navbati API: `picking` holatidagi, HAMMA sklad-tasklari yopilgan
   cheklar filtri (`GET /retail-sales` kengaytmasi yoki alohida endpoint).
2. Kontrol ekrani (web, omborchi bo'limi ostida — keyin F8 qobig'iga kiradi):
   navbat ro'yxati, chek tafsiloti (skanersiz, faqat ko'rish), «To'liq» →
   `mark-ready`; «Tahrirlash» → `PATCH /retail-sales/:id/edit` (qator o'chirish,
   son o'zgartirish). Kim tekshirgani chek tarixida qolsin.
3. Yangi SSE bildirishnoma turi `sale_edited` (+ kerak bo'lsa `sale_ready`):
   kassir POS'i ochiq qoralama/kutish chekni avtomatik qayta yuklaydi va
   o'zgargan qatorlarni ko'rsatadi.
4. Ruxsatlar: `warehouse_manager` uchun; `storekeeper`ga kontrol YO'Q.
5. Testlar: navbat filtri (qisman yopilgan tasklar tushmasin), edit→SSE→POS
   yangilanishi, FSM chegaralari (ready'dan keyin tahrir yo'q).

**Qabul mezoni:** jonlida 2 skladli chek yig'ilib navbatga tushadi, tarkibdan
bitta qator o'chirilganda kassir ekranida summa o'zgargani ko'rinadi, «To'liq»dan
so'ng kassir post qila oladi.

**PROMPT:**
```
Ikkala rejani va docs/plans/2026-08-24-split-kassa-hodisasi.md ni to'liq o'qi (omborchi-tsd-mijozlar + ombor-restrukturizatsiya, avvalgi
hisobotlar bilan). Sen G2 fazasini bajarasan (kontrol oqimi). Faqat G2 vazifalari,
testlar, deploy, jonli tekshiruv, hisobot — va TO'XTA.
```

---

### G3 — Vozvrat qabul ekranlari + vozvrat yorlig'i

**Maqsad:** katta omborchi vozvratni bir oqimda qabul qilsin: hujjat → holat
(sifatli/brak) → yacheyka → yorliq → post.

**Vazifalar:**
1. Vozvrat qabul oqimi (web, omborchi bo'limi): mijoz/agent tanlash, iloji bo'lsa
   manba hujjatga bog'lash (`POST /sales-returns/from-demand/:demandId` bor;
   POS-cheklar uchun qanday bog'lashni tadqiq qilib hisobotga yoz), pozitsiyalar,
   har pozitsiyaga sifatli/brak tanlovi va yacheyka (`SalesReturnPosition.cellId`).
   Brak — alohida BRAK zonasi yacheykalariga (zona-konventsiya, yangi maydonsiz;
   yetmasa pozitsiyaga belgi qo'shish mumkin — o'zing hal qilib hisobotga yoz).
2. Yorliq chop etish: har qabul qilingan pozitsiya uchun tovar shtrixi + yacheyka
   kodi (label moduli `POST /labels/render` + print-agent; vozvrat-yorliq shabloni).
3. `post` mavjud mantiqda qoladi (qoldiq + balans); G1 bilan bog'lanish: post
   bo'lgan vozvrat kassirda «to'lanmagan» bo'lib chiqishini uchma-uch tekshir.
4. Kirim narxlari ko'rinishi: `warehouse_manager`ga `supply: view` berilishini
   tekshir/sozla (kod emas — permission), `storekeeper`da yo'qligini test bilan qulfla.
5. Testlar + i18n.

**Qabul mezoni:** jonlida to'liq zanjir: qabul → yorliq chop → post → kassirda
qaytim ko'rinadi → (G1) to'lov; brak tovar sotuv qoldig'iga aralashmaydi
(BRAK zonasida turgani hisobotda ko'rinadi).

**PROMPT:**
```
Ikkala rejani va docs/plans/2026-08-24-split-kassa-hodisasi.md ni to'liq o'qi (avvalgi hisobotlar bilan). Sen G3 fazasini bajarasan
(vozvrat qabul + yorliq). Faqat G3 vazifalari, testlar, deploy, jonli tekshiruv,
hisobot — va TO'XTA.
```

---

### G4 — Ko'p omborli avto-taqsimot + yacheyka tavsiyasi (QAYTA YOZILDI 2026-08-24)

> 🔴 **BU FAZA BUTUNLAY QAYTA YOZILDI.** Eski G4 «bosh omborchi tasdig'i» oqimi
> edi (so'rov → tasdiq → Move → 07 dan ayirish). Egasi 2026-08-24 da uni BEKOR
> QILDI: «**omborchi ruxsati degan narsa yo'q**». Sabab ham amalda ko'rindi —
> aynan o'sha tasdiq-to'siq 2026-08-24 da kassani to'xtatib qo'ydi
> (`docs/plans/2026-08-24-split-kassa-hodisasi.md`). Eski tavsif git tarixida.

**Maqsad:** Q1-v2 (1-bo'lim): kassir buyurtma yozganda tizim tovarni BARCHA
omborlarning yacheykalari kesimida ko'rsatsin va o'zi taqsimlasin — hech kimning
tasdig'isiz. Yig'ish topshirig'i tovar turgan omborga ketadi.

**Taqsimot qoidasi (1-bo'limdagi jadval — KANONIK):**
1. 07 dagi yacheyka butun miqdorni qoplasa → **07 dan** (yig'ish kerak emas).
2. Aks holda, yolg'iz qoplaydigan yacheykalar orasidan **yetadigan ENG KICHIGI** →
   hammasi o'sha bitta yacheykadan (bo'linish yo'q).
3. Hech biri yolg'iz qoplamasa → bo'linadi: **avval boshqa omborlar, 07 oxirida**.

**Oldshart:** F6 (kaskad dvigateli — `retail-stock-cascade.ts`, rezerv,
to'lov-moment) jonlida — BAJARILGAN. F5 split SHART EMAS: bu faza aksincha
split'ni xavfsiz qiladi (H-reja H4).

**Vazifalar:**
1. **Taqsimot dvigatelini qoidaga moslash** (`retail-stock-cascade.ts`):
   mavjud `allocateAcrossStores` faqat «prioritet tartibida ketma-ket ol» qiladi —
   u Q1-v2 ni ifodalay olmaydi (07 goh birinchi, goh oxirgi). Yangi sof funksiya:
   kirish — YACHEYKA kesimidagi mavjudlik (`StockByCell` × ombor), chiqish —
   (yacheyka × miqdor) ro'yxati. Uch bosqich: (a) 07 yolg'iz qoplaydimi;
   (b) yolg'iz qoplaydigan eng kichik yacheyka; (c) bo'linish — 07 oxirida.
   Micro-BigInt arifmetika (mavjud naqsh), rezerv chegirilgan «доступно».
2. **«Kassa oldidagi ombor» belgisi:** 07 ni ajratish uchun `Store.attributes`
   ga yangi bayroq (`__posFrontStore`, `__posPriority`/`__unassignedSource`
   naqshi — MIGRATSIYA YO'Q) + ombor kartasida checkbox + i18n ru/uz.
   Prioritet (`__posPriority`) tartib uchun qoladi, bayroq esa «bo'linishda
   oxirgi» xulqini beradi.
3. **🔴 Tasdiq-to'sig'ini OLIB TASHLASH** (`retail-sale.service` →
   `assertAvailableCascade`): hozir u rejani hisoblab, keyin uni 400 xato ichida
   tashlaydi («…FAQAT bosh omborchi tasdig'i bilan…»). O'rniga reja BAJARILADI:
   `post()` deltalari ko'p omborli bo'ladi (har ombor uchun o'z `storeId`,
   yacheyka kesimi bilan), rezerv (`sendToPicking`) ham shu reja bo'yicha
   omborlarga bo'linadi, `cancel`/refund teskari yo'li ham.
   Haqiqiy defitsit (butun tizimda yetmasa) avvalgidek 400 — lekin xabar endi
   «tasdiq kerak» emas, «tizimda jami N ta yetmayapti».
4. **Kassirga yacheyka tavsiyasi (POS UI):** pozitsiya qatorida «qayerdan
   olinadi» — ombor + yacheyka + miqdor (masalan «01-02-05-03 · 100 ta»).
   Bir nechta yacheykaga bo'lingan bo'lsa hammasi ko'rinadi. **Kassir
   o'zgartira oladi:** boshqa yacheyka/ombor tanlash (mavjud yacheyka-tanlagich
   naqshi), tanlov chek pozitsiyasida saqlanadi va taqsimot qayta hisoblanmaydi.
5. **Yig'ish topshiriqlari:** `send-to-picking` allaqachon yacheyka prefiksi
   bo'yicha ombor kesimida `RestockTask` ochadi va `SkladKeeper` ga biriktiradi —
   endi u taqsimot natijasidan (yacheyka × miqdor) foydalansin, taxmindan emas.
6. **Testlar:** sof dvigatel (uch holat + chegaralar: 07 aynan yetadi, ikki
   yacheyka teng, hammasi yetmaydi, rezerv chegirilishi), wiring (ko'p omborli
   deltalar, rezerv taqsimoti, cancel teskarisi), kassir o'zgartirishi,
   permission/i18n. G2 kontrol zanjiri buzilmasin (regress).

**Qabul mezoni:** jonlida 07 da yetmaydigan tovar bilan chek ochiladi →
tizim boshqa ombordagi yacheykani ko'rsatadi → **hech qanday tasdiqsiz** chek
yig'ishga ketadi va post bo'ladi; ledgerda ayirish AYNAN o'sha ombor(lar)dan
ko'rinadi; 07 dagi qoldiq bo'linish holatida oxirgi bo'lib kamayadi.

**⚠️ KOD BILAN SOLISHTIRILDI (2026-08-24, H1/H2 sessiyasi) — tavsifdagi besh bo'shliq.**
Quyidagilar yuqoridagi vazifalarni BEKOR QILMAYDI, ularni aniqlashtiradi. Har biri
kodda tekshirilgan; G4 sessiyasi ularni hisobga olmasa faza yarim yo'lda to'xtaydi.

**E1 — 🔴 Qoldiqning ~94 % i YACHEYKASIZ (eng katta xavf).**
Jonlida 52,5 mln donadan yacheykalarga biriktirilgani atigi ~2,95 mln
(`docs/ops/jonli-holat.md`). Ya'ni **faqat `StockByCell` ga tayangan taqsimot
tovarlarning aksariyati uchun umuman reja qura olmaydi** — kassa to'xtaydi
(06:46 hodisasining boshqa shakli). Tavsif buni aytmaydi.
Talab: dvigatel **ikki qatlamli** bo'lsin — (a) yacheyka kesimidagi
`StockByCell`; (b) yacheykasiz qoldiq (`Stock.qty − ΣStockByCell`) uchun
**ombor-darajali** ajratma, ekranda «yacheyka ko'rsatilmagan» deb. Yacheykasiz
qism uchun mavjud «katta-birinchi» avto-ayirish saqlanadi.
**Qo'shimcha manba:** tovarning uy-yacheykasi `Product.attributes.__yacheyka`
(picking hozir SHUNDAN foydalanadi) — `StockByCell` bo'sh bo'lsa ham tavsiya
berish mumkin. Ikki yacheyka qatlami borligini unutmang.

**E2 — Taqsimot natijasini saqlaydigan JOY YO'Q (migratsiya kerak).**
`RetailSalePosition` da `storeId` ham, `cellId` ham, `attributes` ham YO'Q
(`packages/db/prisma/schema.prisma` — faqat quantity/price/discount/sum +
frozen cost). 3-holat (bo'linish) bitta pozitsiyani BIR NECHTA yacheykaga
bo'ladi — ya'ni bitta ustun ham yetmaydi.
Talab: **bola-jadval** (masalan `retail_sale_position_allocations`:
positionId, storeId, cellId?, qty) + idempotent DDL migratsiya (qoida 2.7).
4-vazifadagi «tanlov chek pozitsiyasida saqlanadi» hozirgi sxemada bajarib
bo'lmaydi. Bu jadval bir vaqtning o'zida rezerv, picking va post uchun
YAGONA haqiqat bo'ladi.

**E3 — `post()` deltalari BITTA ombor va yacheykasiz (3-vazifaning og'ir qismi).**
`apps/api/src/modules/retail-sale/retail-sale.service.ts:1188–1209` — deltalar
`stockPositions.map` bilan quriladi va HAMMASI bitta `storeId` oladi, `cellId`
umuman yo'q. F6 buni O'ZGARTIRMAGAN (uning hisoboti: «yacheyka-kesim: mavjud
katta-birinchi avto-ayirish ombor ichida o'zgarishsiz ishlayveradi»).
Talab: deltalar **pozitsiyadan emas, AJRATMADAN** qurilsin (har ajratma → o'z
`storeId` + `cellId`), tannarx har ombor uchun o'sha ombor balansidan hisoblansin
(hozirgi `computePerUnitCost` bitta ombor balansiga tayanadi — ko'p omborda
har biriga alohida kerak). `cancel`/refund teskari yo'li ham AJRATMA bo'yicha.
Rezerv (`sendToPicking` → `StockReservation`) ham ajratma kesimida.

**E4 — BRAK ombori ISTISNO qilinmagan.**
G3 BRAK ni alohida OMBOR qildi (`Store.attributes.__brakStore`) va u kaskaddan
`__posPriority` YO'Qligi bilan chiqib turardi. Yangi dvigatel esa kaskad
tartibidan emas, **yacheykalar kesimidan** ishlaydi — ya'ni BRAK yacheykalarini
ham «bor» deb sanaydi va brak tovarni mijozga sotib yuboradi.
Talab: `__brakStore` omborlari taqsimot manbalaridan OCHIQ chiqarilsin + test.

**E5 — H2/H3 bilan kesishma (o'sha fazada yangilanadi).**
G4 «POS yeta olmaydigan qoldiq» tushunchasini TUBDAN o'zgartiradi: POS endi
hamma omborga o'zi yetadi, ya'ni `warehouse-state-core.ts` dagi
`needs_approval` bosqichi ma'nosini yo'qotadi va `outside_cascade` mezoni
qayta yoziladi (kaskad tartibi endi yagona filtr emas).
Talab, SHU fazada: (a) `packages/db/scripts/warehouse-state-core.ts` yadrosi va
testlari yangilansin; (b) `docs/ops/jonli-holat.md` reyestriga yangi
`__posFrontStore` bayrog'i qo'shilsin; (c) H3 ning deploy-oldi qo'riqchisi
nimani xato deb sanashi qayta belgilansin. Aks holda G4 dan keyin tekshirgich
yolg'on qizil bera boshlaydi.

**Qoidalar 10–14 bo'yicha majburiy (F-reja 2-bo'lim):** hisobotda «bu o'zgarish
qaysi oqimni buzishi mumkin?» savoliga yozma javob (qoida 10); jonli
o'zgarish/skript bo'lsa teskarisi o'sha sessiyada (12); deploy'dan keyin
uchma-uch smoke — sinov sotuv (post → tekshir → cancel) + yacheyka sanash +
ko'chirish, va `warehouse-state.ts` (13); qabul mezonining biror bandi
bajarilmasa faza «QISMAN» bo'lib qoladi (11).

**Oldshart aniqlashtiruvi:** G1+G2+G3 hali JONLIDA EMAS (kod tayyor, deploy
kutilmoqda). G4 o'sha delta ustiga qo'shiladi — ya'ni jonli qabul mezonini
tekshirish uchun avval G1–G3 deploy'i kerak (yoki G4 ham «QISMAN» bo'lib turadi).

**PROMPT:**
```
Ikkala rejani va docs/plans/2026-08-24-split-kassa-hodisasi.md ni to'liq o'qi
(ayniqsa 1-bo'limdagi Q1-v2 jadvali, F6 va G1–G3 hisobotlari). Sen G4 fazasini
bajarasan (ko'p omborli avto-taqsimot + yacheyka tavsiyasi; TASDIQ OQIMI YO'Q).
Faqat G4 vazifalari, testlar, deploy, jonli tekshiruv, hisobot — va TO'XTA.
```

---

### G5 — TSD auth + APK skeleti

**Maqsad:** kichik omborchilar TSD'da xavfsiz kirsin; APK asosi tayyor bo'lsin.

**Vazifalar:**
1. TSD device-auth: mavjud `PosDevice`+PIN sxemasini TSD turiga kengaytir
   (qurilma turi maydoni yoki alohida jadval — tadqiq qilib hisobotga yoz);
   TSD uchun tor marshrut-allowlist (`kiosk-policy.ts` andozasi): restock-tasks,
   scan-lookup, cell-move/place, cell-stock sanash, notifications. NARX
   endpointlari allowlist'da YO'Q.
2. APK skeleti (`android/tsd-app`, Kotlin — `driver-app` andozasi): pairing +
   PIN login, tasklar ro'yxati (`GET /restock-tasks` — meniki), SSE yoki polling
   bilan yangi task signali, offline amal-navbati buferi (`PingBuffer` naqshi).
3. Skaner: TSD modeli aniqlangach intent/broadcast integratsiyasi (Zebra
   DataWedge / Urovo / Newland); modelgacha — klaviatura-wedge rejimi ishlasin.
   Multi-hit shtrix tanlovi majburiy.
4. UI: katta tegish nishonlari ANIQ pikselda (`min-h-[44px]` va yirikroq) —
   dizayn-tizim `rem` bazasi 12px ekanini yodda tut (web ekranlarga ham tegishli).
5. Testlar: api allowlist qo'riqchi testi; APK — qo'lda smoke (hisobotga qadamlar).

**Qabul mezoni:** TSD (yoki oddiy Android telefon) pairing qilinib PIN bilan
kiradi, o'z tasklarini ko'radi, aloqasiz rejimda amal navbatda turib aloqada
serverga yetadi; narx hech qayerda ko'rinmaydi.

**PROMPT:**
```
Ikkala rejani va docs/plans/2026-08-24-split-kassa-hodisasi.md ni to'liq o'qi (avvalgi hisobotlar bilan). Sen G5 fazasini bajarasan
(TSD auth + APK skeleti). Faqat G5 vazifalari, testlar, hisobot — va TO'XTA.
```

---

### G6 — TSD ish ekranlari: yig'ish, joylashtirish, sanash

**Maqsad:** kichik omborchining uch asosiy ishi TSD'da to'liq yursin.

**Oldshart:** G5. F7 tugagan bo'lsa uning hisobotini o'qi (joylashtirish
oqimlari bilan mos bo'lsin).

**Vazifalar:**
1. Yig'ish (picking): taskni ochish, qatorlar yacheyka tartibida, qator
   tasdiqlash (`POST /restock-tasks/:id/lines/:lineId/confirm`) va skan bilan
   (`confirm-scan`), yetishmovchilik belgisi (kontrolga ko'rinadi), task yakuni.
2. Joylashtirish/ko'chirish: vozvrat-tasklar (restock), yacheykadan yacheykaga
   ko'chirish — FAQAT yangi qatlam endpointlari (`cell-move`, `cell-place`)
   orqali, eski `__yacheyka` satriga yozilmaydi.
3. Inventarizatsiya sanash: ochiq hujjat bo'yicha yacheyka skan → sanash
   (`PUT /admin/stores/:id/cells/:cellId/stock`, `set`/`add`) — «faqat yacheyka»
   qoidasi (F-reja) buzilmaydi.
4. Skan-ma'lumot ekrani: tovar nomi, qoldiq, yacheykalar — NARXSIZ.
5. Testlar + qo'lda smoke jonli TSD'da (hisobotga video/qadamlar).

**Qabul mezoni:** jonlida bitta chek TSD bilan yig'ilib kontrolga tushadi (G2
zanjiri), vozvrat tovari TSD bilan yacheykaga joylanadi, bitta yacheyka TSD'da
sanaladi va hujjatda to'g'ri ko'rinadi.

**PROMPT:**
```
Ikkala rejani va docs/plans/2026-08-24-split-kassa-hodisasi.md ni to'liq o'qi (ayniqsa G5 va F7 hisobotlarini). Sen G6 fazasini bajarasan
(TSD ish ekranlari). Faqat G6 vazifalari, testlar, jonli tekshiruv, hisobot — va TO'XTA.
```

---

## 3. Tartib va bog'liqliklar

- **Hozir boshlash mumkin (F-rejaga bog'liq emas):** G1, G2, G3, G5.
- **G4** — faqat F5 va F6 dan keyin.
- **G6** — G5 dan keyin; F7 bilan muvofiqlashtiriladi.
- **G3 ekranlari** web'da quriladi; F8 exe qobig'i ularni o'z ichiga oladi
  (F8 sessiyasi shu rejadagi omborchi sahifalarini qobiqqa kiritsin).

## 4. HISOBOTLAR (har faza o'z hisobotini SHU YERGA yozadi)

> Shablon: **Faza · sana · commit(lar)** — nima qilindi (fayl ro'yxati bilan qisqa),
> test natijalari (raqamlar), deploy holati (jonli tekshiruv dalili), ochiq qolganlar,
> keyingi fazaga eslatmalar.

### G1 — Vozvrat pulini kassadan qaytarish · ⚠️ QISMAN (qoida 11) · 2026-08-25 · `9fe25d15`

> **Bu ikkinchi G1 sessiyasi.** Birinchisi (2026-08-24, `8b39a083`) KODNI yozdi —
> uning hisoboti pastda o'z holicha turibdi. Bu sessiya deploy + jonli smoke uchun
> chaqirilgan edi; **egasi deploy'ni RAD ETDI** («C — hozir deploy YO'Q», 2026-08-25).
> Shu sabab G1 qoida 11 bo'yicha **YOPILMAYDI**: qabul mezoni jonli tasdiqni talab
> qiladi. Sessiya kod tomonini yopdi, bitta HAQIQIY nuqson topib tuzatdi va TO'XTADI.

**1. G1 kodi HEAD'da butunligi tasdiqlandi** (43 commit o'tgandan keyin — G2…G6,
Q1–Q3, A1, A2 ustidan). Dalil kod o'qish bilan emas, TEST bilan:
`customer-payout.test.ts` 13/13 ✅; `cashier-session` + `sales-return` modullari
36 fayl / **492 test** ✅. Marshrutlar, `CASH_OUT_KIND.returnPayout`,
`summarizeCashOut.returnPayoutMinor`, `BALANCE_DOC_TYPE.returnPayout`,
doc-resolver va `recompute` bloki — hammasi joyida. A1 (`customerPrepay`) aynan
G1 ning ko'zgusi qilib qurilgan, ya'ni G1 poydevor sifatida allaqachon ishlatilgan.

**2. 🔴 TOPILGAN NUQSON — G1 ning O'ZI kiritgan o'lik i18n kaliti.**
G1 sessiyasi `pages.pos.customer_card_doc.returnPayout` = «Vozvrat puli»
kalitini qo'shgan, lekin `apps/web/src/components/pos/customer-card-panel.tsx`
dagi `KNOWN_DOC_TYPES` ro'yxatiga tegmagan. O'sha ro'yxat — yorliq ko'rsatishning
qo'riqchisi (`KNOWN_DOC_TYPES.has(docType) ? tDoc(docType) : docType`). Natija:
**POS mijoz kartasida vozvrat to'lovi qatorida yorliq o'rniga xom `returnPayout`
satri chiqardi.** i18n gate buni TUTA OLMAYDI — kalit MAVJUD, faqat hech kim
o'qimaydi. Deploy qilinganda kassir buni birinchi vozvrat to'lovidayoq ko'rardi.

Shu bilan birga G1 hisobotining o'z «ochiq qolganlar» bandi ham yopildi:
`salesReturn` (vozvratning O'ZI — to'lovning jufti, balans reyestrida
2026-08-12 dan beri bor) ikkala xaritada ham yorliqsiz edi.

Tuzatildi (`9fe25d15`):

| Fayl | O'zgarish |
|---|---|
| `apps/web/src/components/pos/customer-card-panel.tsx` | `KNOWN_DOC_TYPES` += `returnPayout`, `salesReturn` |
| `apps/web/src/app/print/reconciliation-act/page.tsx` | `ACT_DOC_TYPES` += `salesReturn` |
| `apps/web/src/messages/{ru,uz}.json` | `pages.print.act.doc_types.salesReturn` + `pages.pos.customer_card_doc.salesReturn` (ru «Возврат от покупателя» / uz «Mijozdan qaytarish») |
| `apps/web/src/components/pos/__tests__/customer-card-panel.test.tsx` | 2 yangi test |

**Teskari nazorat (yangi testlar haqiqatan qulflaydimi):** tuzatish vaqtincha
olib tashlanib qayta yugurtirildi → `2 failed | 2 passed | 21 skipped`.
Tuzatish qaytarilgach → **25/25 ✅**. Ya'ni testlar bo'sh emas.

Saldo va pul mantiqiga TEGILMADI — faqat yorliq ro'yxatlari va i18n.

**3. Qoida 12/14 — rollback skripti git'ga kiritildi.**
`packages/db/scripts/rollback/20260824120000_drawer_cash_out_sales_return_down.sql`
(deploy-dossieri tekshiruvida retrospektiv yozilgan, lekin **untracked** turardi —
yo'qolish xavfi, aynan IS-6 naqshi) endi versiyalangan.
⚠️ **Lokal dev bazada HALI SINALMAGAN** — `sherset_v2_dev` paroli bu sessiyaga
berilmagan (dossier B1/B4 dagi AYNI to'siq). Qoida 12 «yoziladi VA sinaladi»
deydi ⇒ bu band **ochiq qarz** bo'lib qoladi.

**4. Testlar (yolg'iz yugurtirilgan, toza o'lchov):**

| Gate | Natija |
|---|---|
| `apps/api` vitest (to'liq) | 654 fayl (1 skip) · **9227 passed** · 2 skipped · **0 failed** ✅ |
| `apps/web` vitest (to'liq) | 327 fayl · **4309 passed** · 26 skipped · **0 failed** ✅ |
| `turbo typecheck` api+web+db | ✅ 4/4 successful |
| `node scripts/check-lint.mjs` | ✅ 0 error, 1192 warning (siyosat: warning ruxsat) |
| i18n gate'lar (`pnpm i18n:gate`) | ✅ 19/19 — 1115 fayl, 15807 kalit |

> ⚠️ **Ikkinchi halol qayd — DARAXT SOF EMAS EDI.** Sessiya davomida
> `apps/api/src/modules/debt/pos-customer-debt.ts` ga **boshqa sessiya**
> A3 ishini (`customerStanding()`) yozdi — ya'ni ishchi daraxtda men
> yozmagan o'zgarish paydo bo'ldi (dossier B6 bilan bir naqsh). O'zgarish
> sof ADDITIV (yangi eksport funksiya, mavjud kodga tegmaydi) va suite
> yashil qoldi, lekin yuqoridagi raqamlar TO'LIQ toza HEAD niki emas.
> Mening ikkala commit'im ATAYLAB aniq pathspec bilan qilindi — o'sha fayl
> ularga TUSHMAGAN (uni A3 sessiyasi o'zi commit qiladi).
>
> ⚠️ **O'lchov usuli haqida halol qayd.** Birinchi urinishda ikkala suite
> BIR VAQTDA yugurtirildi → api 1 failed, web 8 failed (5 fayl). Har biri
> alohida qayta yugurtirilganda **ikkalasi ham 0 failed**. Ya'ni o'sha 9 ta
> xato — parallel-yuklama timeout flake'i (dossier D4 bilan bir klass),
> regressiya EMAS. Yuqoridagi jadval **alohida** yugurishlarniki.

**5. Deploy holati: ⛔ BAJARILMADI — egasining qarori (2026-08-25).**
Sessiya boshida holat aniq qilib qo'yildi: G1 ni YOLG'IZ chiqarib bo'lmaydi —
branch deltasi `62a27024..HEAD` endi **43 commit / 7 migratsiya** va ichida
G1–G6 + Q1–Q3 + A1 + A2 aralash (dossier B5). Egasiga uch yo'l berildi
(A — butun branch, B — tor branch G4siz, C — deploy yo'q); **egasi C ni tanladi.**
⇒ jonli tekshiruv qilinmadi, `warehouse-state.ts` yugurtirilmadi (jonli baza
ochilmadi), VPS HEAD tekshirilmadi. Deploy retsepti o'z holicha kuchda:
`docs/ops/2026-08-25-deploy-dossieri.md`.

> ⏳ **TARIXIY RAQAMLAR** — «43 commit / 7 migratsiya» 2026-08-25 kunidagi
> o'lchov. Joriy holat: **73 commit / 12 migratsiya** (sarlavhadagi dossier
> blokiga qarang). Dossierning bo'lim raqamlari ham o'zgargan: deploy
> retsepti endi **6-bo'lim**.

**6. QABUL MEZONI — bandma-band (qoida 11):**

| # | Mezon | Holat |
|---|---|---|
| 1 | jonlida sinov-vozvrat post qilinadi | ❌ deploy yo'q |
| 2 | POS'da mijoz profilida summasi chiqadi | ❌ deploy yo'q |
| 3 | to'langach smena expected-cash AYNAN shu summaga kamayadi | ❌ deploy yo'q |
| 4 | ikkinchi to'lov urinishi rad etiladi | ❌ deploy yo'q (testda ✅: cap 400 + poyga 409) |

**To'rttadan biri ham jonlida bajarilmagan ⇒ G1 «QISMAN».** Yopish sharti —
deploy + dossier **6-bo'lim 8-qadamidagi** G1 zanjiri (bo'lim/qadam raqamlari 2026-08-26 tahririda o'zgardi).

**7. QOIDA 10 — «bu o'zgarish qaysi mavjud oqimni buzishi mumkin?»**

Bu sessiyaning o'zgarishi (`9fe25d15`) **jonli ma'lumotga ham, pul mantiqiga ham
TEGMAYDI** — u ikkita `Set` ga qator qo'shadi va ikkita i18n kalit yozadi.
«Buzmaydi» degani dalil bilan:

- **Saldo/qoldiq:** balans hisobi `docType` bo'yicha UMUMAN filtrlamaydi
  (`counterparty-balance-doc-types.ts` sarlavhasidagi shartnoma: «Saldo hech
  qachon reyestrga bog'liq emas»). `ACT_DOC_TYPES` / `KNOWN_DOC_TYPES` faqat
  YORLIQ tanlaydi, qator YO'QOTMAYDI (akt sahifasi, `docTypeLabel`).
  ⇒ hech bir summa o'zgarmaydi.
- **Ko'rinadigan o'zgarish:** ilgari `salesReturn` / `returnPayout` qatorida xom
  kalit ko'rinardi, endi tarjima. Ya'ni **faqat matn** o'zgaradi.
- **i18n gate:** kalitlar ru+uz ikkalasiga ham qo'shildi (parity ✅).
- **Nimaga BARIBIR e'tibor kerak:** shu ro'yxatlarda `customerPrepay` (A1),
  `prepayPayment` (A2), `counterpartyAdjustment` va `opening` HAMON YO'Q —
  ya'ni AYNI nuqson ikkala yangi avans turida ham takrorlangan. Men ularga
  ATAYLAB tegmadim (G1 chegarasidan tashqarida) — 9-bo'limda eslatma qoldirildi.
- **G1 KODINING jonli xulqi haqida:** G1 kodi 2026-08-24 dan beri o'zgarmagan;
  uning deploy'da nimani buzishi mumkinligi birinchi G1 hisobotida va dossier
  4-bo'limida turibdi. Bu sessiya u tahlilni o'zgartiradigan hech narsa topmadi.

**8. Ochiq qolganlar (G1 ni yopish uchun kerak bo'lganlar):**

1. **Deploy + jonli smoke** (6-bo'limdagi 4 band) — egasi tayyor bo'lganda.
2. **G1 rollback skripti lokal dev bazada sinalmagan** (qoida 12) —
   `sherset_v2_dev` paroli kerak. Zanjir: DOWN → DOWN (no-op) → UP.
3. **USD payout qurilmagan** (ataylab, G1 chegarasi) — o'zgarishsiz.
4. ⚠️ **Uchta rollback skripti hamon UNTRACKED:**
   `…_sales_return_retail_sale_down.sql` (G3),
   `…_retail_sale_position_allocation_down.sql` (G4),
   `…_debt_source_doc_down.sql` (Q1). Men faqat G1 nikini kiritdim (o'z
   chegaram). Qolgan uchtasi va `docs/ops/2026-08-25-deploy-dossieri.md`
   ning o'zi ham git'da YO'Q — **qoida 14 bo'yicha bu qarz**, egalari
   (G3/G4/Q1 yoki deploy sessiyasi) kiritishi kerak.

**9. Keyingi fazaga eslatmalar:**

- **A1/A2 sessiyalariga:** `customer-card-panel.tsx` `KNOWN_DOC_TYPES` va
  `reconciliation-act/page.tsx` `ACT_DOC_TYPES` ga `customerPrepay` va
  `prepayPayment` qo'shilmagan ⇒ avans qatorlari POS mijoz kartasida va aktda
  **xom kalit** bilan chiqadi. Bu G1 da topilgan nuqsonning AYNI takrori.
  i18n kalitlari bor-yo'qligini tekshiring; yo'q bo'lsa ru+uz ikkalasiga.
- **Deploy sessiyasiga:** G1 uchun migratsiya bitta —
  `20260824120000_drawer_cash_out_sales_return`, lokal dev bazada 2× isbotlangan
  (birinchi G1 hisoboti). Rollback skripti endi git'da, LEKIN sinalmagan.
  Qaytarishdan oldin fayl boshidagi «pul izi» blokini o'qish MAJBURIY:
  `SELECT count(*) FROM "retail_drawer_cash_out" WHERE "sales_return_id" IS NOT NULL;`

### G6 — TSD ish ekranlari · ⚠️ QISMAN (qoida 11) · 2026-08-25 · `700ba30e`

**Holat: QISMAN.** Kod, migratsiya, testlar tayyor va **APK birinchi marta
HAQIQATAN QURILDI** (G5 ning ochiq bandi yopildi). Lekin qabul mezoni JONLI
qurilmada tekshirilmagan (terminal yo'q, deploy ham kutilmoqda) ⇒ faza
«TUGADI» deb yopilmaydi. Qo'lda smoke qadamlari `android/tsd-app/README.md`
oxirida — javobgar va vaqt o'sha yerda to'ldiriladi.

**Ikki tomonlama bog'liqlik javobi (qoida 10 — «bu nima buzishi mumkin?»):**

1. **🔴 RUXSAT KENGAYDI — eng katta o'zgarish va u JONLI xulqni o'zgartiradi.**
   `POST /products/:id/cell-move` va `/cell-place` bazaviy talabi
   `store.update` dan **`storecell.update`** ga tushirildi. Sabab majburiy edi:
   reja G6.2 «joylashtirish FAQAT shu ikki endpoint orqali» deydi, TSD
   foydalanuvchisi esa kichik omborchi (`storekeeper`) va uning shablonida
   `store.update = NO` — ATAYLAB (`store-cell-permission.test.ts`). Ya'ni
   G6.2 birinchi klikdayoq 403 bo'lardi.
   **Nima buziladi:** web tovar kartasidagi «Переместить» tugmasi ruxsat bilan
   YASHIRILMAGAN (u har doim ko'rinadi, cheklov faqat serverda edi) ⇒ deploy'dan
   keyin **jonli «Omborchi» roli o'sha tugmani HAQIQATAN ishlata boshlaydi**.
   Ilgari u 403 berardi. Egasi buni bilishi kerak.
   **Nega bu yangi QOBILIYAT emas:** `storecell.update` allaqachon store-darajali
   qoldiqni o'zgartira oladi — «Sanash» yo'li avto Оприходование/Списание
   yozadi. Ya'ni omborchi qoldiqni siljitish huquqiga allaqachon ega edi,
   endi unga TO'G'RI (hujjatli, ledger'li) yo'l ochildi.
   **Nima YOPIQ qoldi:** ombor KARTOCHKASI (`store.update`) va OMBORLARARO
   ko'chirish — u hamon `store.update` talab qiladi, ISTISNO faqat hovuz-ombor
   (`__unassignedSource`, «Taqsimlanmagan»), chunki hovuzdan haqiqiy omborga
   ko'chirish aynan F7 ning kundalik oqimi. Qaror sof modulda
   (`product-cell-move-scope.ts`) va 12 ta test bilan qulflangan.
   `cell-rebind` (tovar kartasi tahriri) ham `product.update` da QOLDI.

2. **Kassa oqimi — TEGILMADI, dalil bilan.** `post()`, `sendToPicking`,
   G4 taqsimoti, rezerv, kaskad — bir qatori ham o'zgarmagan. `retail-sale`
   servisiga YAGONA o'zgarish `controlQueue` ning `select` iga
   yetishmovchilik qatorlarini qo'shish (faqat O'QISH, additiv maydon).
   Butun `retail-sale` moduli yashil.

3. **Topshiriq HOLATI endi sof moduldan hisoblanadi** (`resolveTaskStatus`).
   Yetishmovchilik yo'q bo'lganda natija AVVALGIDEK (test bilan qulflangan).
   **Bitta xulq ATAYLAB o'zgardi:** ilgari `markConfirmed` BEKOR QILINGAN
   topshiriqni ham qayta hisoblab `in_progress`/`done` ga ko'tarishi mumkin
   edi — endi `cancelled` tegilmaydi. Bekor qilingan chekning topshirig'i
   «yig'ib bo'lindi» deb ko'rinishi yolg'on bo'lardi.

4. **`GET /restock-tasks/:id` qatorlar TARTIBI o'zgardi** (`position` →
   yacheyka marshruti). Iste'molchilar: TSD va web checklist
   (`/restock-tasks/[id]`) — ikkalasi ham AYNI ishni qiladi, ya'ni ikki xil
   tartib ikki xil marshrut degani bo'lardi. Chop etish varag'i
   (`picking-sheets`) BOSHQA metod va u tegilmagan (egasining 2026-08-16
   «bitta varaq» qarori saqlanadi).

5. **Yangi jadval `client_operations` — kalitsiz so'rovga TEGMAYDI.**
   Web ekranlari `clientOpId` yubormaydi ⇒ na o'qish, na yozish bo'ladi
   (test: kalitsiz yo'lda `findFirst` CHAQIRILMAYDI). Ya'ni brauzerdagi
   xulq bir bayt ham o'zgarmaydi.

6. **H2/H3, K-reja, Q-reja — tegilmadi.** G6 ombor holati modeliga
   (`warehouse-state-core.ts`), taqsimotga yoki qarz reyestriga kirmaydi.
   `docs/ops/jonli-holat.md` reyestriga qo'shiladigan yangi JONLI HOLAT
   ham yo'q (yangi bayroq/ombor yaratilmadi).

---

**1-vazifa — YIG'ISH (picking) va YETISHMOVCHILIK.**

🔴 **Rejada aytilgan «yetishmovchilik belgisi (kontrolga ko'rinadi)» — bu
fazaning eng muhim bandi bo'lib chiqdi, chunki usiz KASSA TO'XTAYDI.**
Zanjir: omborchi javonda tovarni topolmasa qatorni tasdiqlay olmaydi (bu
yolg'on bo'lardi) ⇒ topshiriq ochiq qoladi ⇒ chek **kontrol navbatiga
TUSHMAYDI** (G2 sharti: hamma topshiriq yopiq) ⇒ kassir chekni yopolmaydi.
Bu 2026-08-24 hodisasining boshqa shakli: tizim ishlayotgandek ko'rinadi,
savdo esa to'xtaydi.

- **Sxema:** `restock_task_lines` ga `shortage_qty` + `note`/`at`/`by_id`/
  `by_name`. **Ustun ALOHIDA, qator `quantity` si kamaytirilMAYDI** — qator
  kassir chekining nusxasi va uni omborchi o'zgartirsa chek bilan topshiriq
  jimgina ajralardi. Chekni FAQAT kontrol tahrirlaydi (`control-edit`, G2 —
  u ham faqat KAMAYTIRADI).
- **Endpoint** `POST /restock-tasks/:id/lines/:lineId/shortage`
  `{qty, note?, clientOpId?}`. `qty` **MUTLAQ** son (delta emas): oflayn
  navbat amalni qayta yuborsa natija AYNI bo'lsin. `0` = belgini olib
  tashlash (omborchi tovarni keyin topib olishi normal holat).
  Ruxsat qator tasdiqlash bilan BIR XIL — ataylab ochiq (Q10 DEFER naqshi),
  chunki u chekni o'zgartirmaydi, faqat XABAR beradi;
  `mutation-guard-coverage` klass-qulfiga SABAB bilan yozildi.
- **Sof modul `restock-task-progress.ts`:** `isLineClosed` (ikki yo'l:
  tasdiq YOKI yetishmovchilik), `resolveTaskStatus`, `planShortage`,
  `collectedQty`, `sortLinesByRoute`. Qoida servis ichida qolsa hech qachon
  testda qulflanmasdi (G2 `retail-control.ts` naqshi).
- **Kontrolga ko'rinishi:** `GET /retail-sales/control-queue` javobiga
  `shortages[]` qo'shildi va `/omborchi/kontrol` kartasida sariq blok
  chiqadi: «{tovar}: N ta yetmadi (M tadan)» + izoh + ko'rsatma
  («kamaytiring yoki o'chiring, aks holda mijoz yo'q tovar uchun pul
  to'laydi»). i18n ru+uz.
- **Web checklist** (`/restock-tasks/[id]`) belgini KO'RSATADI (⚠ + kim
  qo'ygani) va o'sha qatorda «Joylandi» tugmasini yashiradi; «bajarildi»
  hisobi yetishmovchilikni ham sanaydi (aks holda ro'yxat 100 % ga hech
  qachon yetmasdi). Belgi QO'YISH — terminal ekranining ishi.

**2-vazifa — JOYLASHTIRISH / KO'CHIRISH (`PlaceScreen.kt`).**
Uch skan: tovar → manba (mavjud yacheykalardan biri **yoki** «yacheykasiz
qoldiq») → maqsad yacheyka → miqdor. Manba yacheyka bo'lsa `cell-move`,
yacheykasiz bo'lsa `cell-place` (F7 `pool-placement.ts`: o'z ombori → hovuz →
uy). **Eski `__yacheyka` satriga hech qachon yozilmaydi** — `cell-rebind`
TSD allowlist'ida umuman yo'q. Yacheykasiz yo'l ATAYLAB birinchi darajali:
jonlida qoldiqning ~94 % i yacheykasiz (`docs/ops/jonli-holat.md`).

**3-vazifa — SANASH (`CountScreen.kt`).**
Yacheyka yorlig'ini skan → tarkib → har tovarga son →
`PUT /admin/stores/:id/cells/:cellId/stock`.
🔴 **FAQAT `mode: 'set'`** (mutlaq), `add` ATAYLAB ishlatilmaydi: sanash
natijasi ta'rifiga ko'ra mutlaq, va bu yo'lda server idempotentlik kalitini
o'qiy olmaydi (u yerda yagona tranzaksiya yo'q — avto Оприходование/Списание
hujjatlari alohida yoziladi). Shuning uchun himoya SEMANTIKADA. Shu sababdan
sanash oflayn navbatga ham QO'YILMAYDI — aloqa yo'q bo'lsa ekran shuni aytadi
va son maydonda turadi (jim yo'qotish yo'q).

**4-vazifa — SKAN-MA'LUMOT (`ScanInfoScreen.kt`).** Nom, jami qoldiq,
yacheykalar kesimi. **Narx yo'q** — bu ekranning intizomi emas, server
shartnomasi (`/tsd/scan` oq ro'yxati; `/products` TSD'ga yopiq).
Bo'lak kodi (`BLK-`, K-reja 7.3) taniladi va tovar tanlovini OCHMAYDI.

**5-vazifa — OFLAYN NAVBAT (G5 ning ochiq bandi) va IDEMPOTENTLIK.**

G5 da navbat faqat YOZILARDI. Endi `QueueSender.kt` uni bo'shatadi va ilova
ochilganda avtomatik urinadi. Ikki xil xato — ikki xil qaror:
tarmoq/5xx ⇒ navbat JOYIDA qoladi; 4xx ⇒ amal navbatdan chiqadi (aks holda
boshdagi joyni band qilib butun navbatni abadiy to'xtatardi), lekin
**JIMGINA emas** — sabab bilan «RAD ETILGAN amallar» ro'yxatiga tushadi va
ekranda turadi (IS-5 klassi).

🔴 **Nega idempotentlik kaliti kerak bo'ldi (yangi `client_operations`
jadvali).** Uzilish server amalni BAJARGANDAN KEYIN — javob yo'lda ekan —
ham bo'ladi: klient «yetib bormadi» deb qayta yuboradi, aslida bajarilgan.
Kalitsiz `cell-move` 10 dona o'rniga 20 ni ko'chirardi. Eng nozik joyi
`confirm-scan`: u qatorga MANZILLANGAN EMAS (birinchi ochiq qatorni topadi),
ya'ni bitta tovar chekda ikki qatorda bo'lsa takror skan IKKINCHISINI ham
yopardi — olinmagan tovar «olindi» bo'lib qolardi. **Test buni ikki tomondan
ko'rsatadi:** kalit bilan — takror hech nimani yopmaydi; kalitsiz — aynan
o'sha xulq qaytadi.
**Da'vo IKKI QADAMDA** (`shared/client-op.ts`): (a) tranzaksiyadan OLDIN
o'qish — odatiy takror shu yerda to'xtaydi; (b) tranzaksiya ICHIDA yozish —
poyga uchun. Ikkinchisi effekt bilan BIR tranzaksiyada bo'lishi shartning
o'zi: tashqarida yozilsa va effekt yiqilsa kalit «bajarilgan» bo'lib qolib
qayta urinish JIM RAD etilardi (ish yo'qoladi); effektdan keyin yozilsa
oradagi qulash kalitni yo'qotardi (ildiz muammoning o'zi).
Postgres'da tranzaksiya ichidagi unikal-buzilish butun tranzaksiyani abort
qiladi — shuning uchun poygada `DuplicateClientOpError` otiladi va u
TASHQARIDA yutiladi. **Javob TANASI saqlanmaydi:** takrorga joriy holat
qayta o'qib beriladi (saqlangan nusxa kontrol tahririni yashirardi).
Kalit MAJBURIY EMAS ⇒ web yo'li o'zgarmaydi.

**6-vazifa — TSD ilovasi qayta tuzildi.** `MainActivity` endi QOBIQ
(juftlash, PIN, router, skaner marshruti, navbat); ish ekranlari alohida
fayllarda va `Activity` ni ko'rmaydi (`Shell`/`Screen` shartnomasi, `Ui.kt`).
Skan AVVAL joriy ekranga beriladi (u bosqichga qarab talqin qiladi), ekran
uni yemasa umumiy narxsiz skan-ma'lumot ochiladi. Skan maydoni ekranlar
almashganda ham fokusda QOLADI — klaviatura-wedge skaner aynan fokusdagi
maydonga yozadi, aks holda har o'tishda birinchi skan yo'qolardi.
**«Tayyor» tugmasi ATAYLAB YO'Q** (G2 hisobotining G6 ga eslatmasi): TSD
`mark-ready` bilan flip qilmaydi — hamma qator yopilgach chek KONTROLGA
tushadi va ekran shuni aytadi.

---

**🔴 APK QURILDI (G5 ning ochiq bandi YOPILDI).**
G5 «Android toolchain yo'q» degan edi; bu sessiyada toolchain shu mashinada
topildi (`D:/dev/java/jdk-17`, `D:/dev/android-sdk`, platform `android-34`)
va Gradle 8.7 alohida yuklab olindi (mashinadagi Gradle 9.1 AGP 8.5.0 bilan
MOS EMAS). Natija: **`BUILD SUCCESSFUL`, ogohlantirishsiz**,
`app/build/outputs/apk/debug/app-debug.apk` ≈ **7,1 MB**.
Ya'ni G5+G6 ning butun Kotlin qismi endi kompilyatsiyadan o'tgan
(ilgari u UMUMAN tekshirilmagan edi). Buyruq va shartlar
`android/tsd-app/README.md` «Build» bo'limida.

**Testlar:** yangi 4 fayl — `restock-task-progress` **24**,
`restock-task-shortage-wiring` **12**, `shared/client-op` **15**,
`product/product-cell-move-scope` **12**; mavjud fayllarga:
`tsd-policy` **+1** (yetishmovchilik marshruti + `exact` + metod),
web `omborchi/kontrol/page` **+2** (yetishmovchilik bloki bor/yo'q).
Jami **+66**.
TO'LIQ: **api 646 fayl / 9098 passed (2 skipped, 0 xato)**;
**web 326 fayl / 4291 passed (26 skipped, 0 xato)**;
typecheck api(8G)/web/db yashil; i18n gate'lar yashil;
biome yangi/tegilgan fayllarda xatosiz (kontrol sahifasidagi 20 ta
`useSortedClasses` ogohlantirishi mening ishimdan OLDIN ham AYNAN 20 ta edi —
o'lchab tekshirildi).

**Migratsiya `20260825200000_tsd_work_screens`** (idempotent DDL):
`restock_task_lines` ga 5 ustun + `client_operations` jadvali (unikal
`(account_id, client_op_id)`).
**Qaytarish yo'li (qoida 12):**
`packages/db/scripts/rollback/20260825200000_tsd_work_screens_down.sql` —
buyrug'i faylning boshida, ikkita SHARTI ham u yerda yozilgan (terminallar
ishlamayotgan payt + ochiq topshiriqlarda yetishmovchilik belgisi bo'lmasin).

~~⚠️ **BAJARILMAGAN QADAM (halol qayd — qoida 7):** migratsiya **lokal dev
bazada YUGURTIRILMAGAN**…~~

✅ **YOPILDI 2026-08-26 (deploy-tayyorlik sessiyasi, dossier B1/B2).**
`20260825200000_tsd_work_screens` `sherset_v2_dev` da to'liq zanjirdan o'tdi:
**UP → UP (no-op) → zond → DOWN → DOWN (no-op) → UP.**
Zond tasdiqladi: `restock_task_lines` ga 5 ta NULLABLE ustun
(`shortage_qty` numeric · `shortage_note` text · `shortage_at` timestamptz ·
`shortage_by_id` uuid · `shortage_by_name` varchar) + `client_operations`
jadvali (6 ustun) + **unikal indeks `(account_id, client_op_id)`** + indeks
`(account_id, created_at)` + FK `account_id` CASCADE — hisobotdagi tavsifga
AYNAN mos. Down skript ham sinaldi (DOWN×2 idempotent, UP tuzilmani aynan
tiklaydi).

**Deploy holati: KUTILMOQDA** — G1+G2+G3+G4+G5 bilan bir deltada boradi.
Deploy'da **BESHINCHI migratsiya** qo'shiladi: `20260825200000_tsd_work_screens`
(`prisma db execute --file …` → `prisma migrate resolve --applied …` →
oxirida `prisma generate`).
**Yangi ruxsat-entity YO'Q** ⇒ `topup-role-permissions.ts` ga G6 hech narsa
qo'shmaydi.
🔴 **Lekin jonli XULQ O'ZGARADI** — yuqoridagi 1-band: «Omborchi» roli
tovar kartasidagi «Переместить по ячейкам» ni HAQIQATAN ishlata boshlaydi
(ilgari 403 edi). Egasi buni tasdiqlashi kerak.

**Ochiq qolganlar / keyingi ishlarga:**
- **Jonli tekshiruv qilinmagan ⇒ faza QISMAN (qoida 11).** Qabul mezoni:
  chek TSD bilan yig'ilib kontrolga tushishi, vozvrat tovarining yacheykaga
  joylanishi, yacheykaning TSD'da sanalishi. 8 bandli qo'lda smoke
  `android/tsd-app/README.md` da (javobgar/vaqt maydonlari bilan).
- ✅ ~~Migratsiya lokal bazada sinalmagan~~ — **2026-08-26 da isbotlandi**
  (yuqorida; down skript ham sinaldi).
- **TSD qurilmalarini boshqarish EKRANI hamon yo'q** (G5 dan qolgan):
  juftlash/bekor qilish faqat API orqali.
- **Sanash oflayn ishlamaydi** (ataylab, yuqorida) — kerak bo'lsa
  `setCellStock` ni yagona tranzaksiyaga yig'ish alohida ish.
- **`client_operations` tozalanmaydi** — jadval o'sib boradi (qator kichik:
  bitta smenada bir necha yuz qator). Vaqti kelganda kunlik `DELETE … WHERE
  created_at < now() - interval '30 days'` cron'i qo'shilsin; indeks
  (`account_id, created_at`) shu uchun allaqachon bor.
- **Ruscha TSD matnlari yo'q** (`values-ru/strings.xml` — G5 qarori kuchda:
  ombor xodimlari o'zbekchada ishlaydi).
- **Boshqa sessiyaning qoldig'i (mening ishim emas, G5 dan beri turibdi):**
  K-reja fayli va uning F-rejaga qo'shgan 10-qoida qatori, hamda
  `cell-contents-modal` o'zgarishlari commit qilinmagan.

### G5 — TSD auth + APK skeleti · ⚠️ QISMAN (qoida 11) · 2026-08-25 · `623c6a18`

**Holat: QISMAN.** Kod, migratsiya va testlar tayyor; qabul mezoni JONLI
qurilmada tekshirilmagan (terminal hali yo'q, deploy ham kutilmoqda) ⇒ faza
«TUGADI» deb yopilmaydi. Qo'lda smoke qadamlari `android/tsd-app/README.md`
oxirida — javobgar va vaqt o'sha yerda to'ldiriladi.

**Ikki tomonlama bog'liqlik javobi (qoida 10 — «bu nima buzishi mumkin?»):**
- **Kassa oqimi — TEGILMADI, dalil bilan.** `pos_devices` jadvali, `PosLoginService`,
  `PosDeviceService`, `kiosk-policy.ts` dagi KIOSK QATORLARI — hech biri o'zgarmagan.
  TSD o'z jadvali (`tsd_devices`) va o'z servislari bilan yuradi. `pos-login`
  `pos_devices` dan o'qiydi va TSD qatorini KO'RMAYDI ⇒ terminal kaliti bilan
  kassa smenasi ochib bo'lmaydi (tuzilmaviy, unutilgan `where` ga bog'liq emas).
- **Umumiy kod ikkita — ikkalasi ham testlar bilan qulflangan:**
  (a) `kiosk-policy.ts` ning mos-kelish MANTIG'I `route-allowlist.ts` ga ko'chdi
  (qoidalar RO'YXATI o'zgarmadi). Xavf: matcher xatosi kassa allowlist'ini
  buzardi. Yopildi — mavjud `kiosk-policy.test.ts` va
  `kiosk-policy-customer-card.test.ts` bir qatori ham o'zgartirilmasdan yashil.
  (b) `token.service` — `createRefreshToken` ga 4-chi IXTIYORIY parametr,
  `rotateRefreshToken` javobiga yangi maydon. Mavjud chaqiruvchilar
  (`auth.service.login`, `pos-login.issueBundle`) tegilmagan; TSD bo'lmagan
  yo'lda qiymat `null` va bu test bilan qulflangan.
- **`auth.service.refresh()` — YANGI so'rov qo'shildi**, lekin FAQAT
  `tsdDeviceId` bo'lgan qatorda. Oddiy sessiyada qo'shimcha DB so'rovi YO'Q
  (test: `loadActive` chaqirilmasligi).
- **Global guard qo'shildi (`TsdGuard`)** — har so'rovdan o'tadi. Xavf: xato
  qilsa BUTUN tizim yiqilardi. Shuning uchun birinchi shart eng arzon va eng
  tor: `user.deviceMode !== 'tsd'` ⇒ darhol `true`. `deviceMode` da'vosi
  faqat `tsd-login` beradi, ya'ni bugungi HECH BIR tokenda u yo'q va guard
  amalda hech kimga tegmaydi (testlar: oddiy, kiosk va ESKI token).
- **Migratsiya** — yangi jadval + `refresh_tokens` ga NULLABLE ustun. Mavjud
  qatorlar o'zgarmaydi; FK `RESTRICT` bo'lgani uchun eski qatorlar bloklanmaydi
  (ular `NULL`).
- **H2/H3, G4 taqsimoti, ombor qoldig'i — UMUMAN tegilmadi:** bu faza qoldiq
  yozadigan biror kod yo'liga kirmaydi.

---

**1-vazifa TADQIQOTI — «qurilma turi maydoni yoki alohida jadval» (reja shuni so'ragan):**

**Qaror: ALOHIDA jadval `tsd_devices`.** Uch sabab, ikkinchisi hal qiluvchi:

1. **Sxema mos kelmaydi.** `pos_devices.cash_desk_id` va `organization_id`
   NOT NULL — chunki `CashierSession` uchalasini talab qiladi. TSD da kassa
   YO'Q. `kind` ustuni yo'lini tanlasak bu ikkalasini nullable qilish kerak
   edi, ya'ni `PosDeviceContext.cashDeskId: string` → `string | null` va
   null-ishlov JONLI kassa yo'liga kirib borardi. 2026-08-24 hodisasidan
   keyingi 10-qoida aynan shunday yon ta'sir haqida.
2. **Fail-closed.** TSD kaliti kassa smenasini ocholmasligi TUZILMAVIY bo'lishi
   kerak. Alohida jadval bilan `pos-login` TSD qatorini umuman ko'rmaydi;
   `kind` ustuni bilan esa butun xavfsizlik BITTA unutilgan `where kind='pos'`
   ga bog'liq bo'lardi.
3. Terminalga ombor kerak, kassa/tashkilot kerak emas — ustunlarning yarmi
   bo'sh turadigan jadval «ikki narsani bitta jadvalda saqlash» belgisi.

**Nusxa-kod xavfi yopildi:** qulf chegaralari (`POS_DEVICE_MAX_ATTEMPTS`,
`POS_DEVICE_LOCKOUT_MS`) NUSXALANMADI — `pos-device.service.js` dan import
qilinadi, ya'ni ikki qurilma sirtining qulf siyosati jimgina ajralib ketmaydi.

**2-tadqiqot — sessiya belgisi qayerda yashaydi (rejada yo'q, lekin fazani hal qiladi):**
`uiMode` YARAMAYDI: u xodimning ROLlaridan hisoblanadi, ya'ni omborchini
brauzerda ham cheklab qo'yardi. Kerak bo'lgan narsa — SESSIYA belgisi, shuning
uchun yangi ixtiyoriy JWT da'vosi `deviceMode: 'tsd'`.
🔴 **Va shu yerda tuzoq bor edi:** `AuthService.refresh()` yangi tokenni
XODIMDAN qayta quradi (rollar, hr-ruxsatlar) — ya'ni da'vo 15 daqiqadan keyin
birinchi refresh'da JIMGINA yo'qolardi va terminal sessiyasi cheklovsiz ERP
sessiyasiga aylanardi. Shuning uchun bog'lanish `refresh_tokens.tsd_device_id`
da SAQLANADI, rotatsiyada MEROS bo'ladi va refresh'da qurilma HALI HAM tirikligi
tekshiriladi. Beshta test aynan shu zanjirni qulflaydi.

---

**Nima qilindi (backend):**

1. **Sxema + migratsiya `20260825170000_tsd_device`** (idempotent DDL):
   `tsd_devices` jadvali (argon2 `secret_hash`, `store_id`, `app_version`,
   `revoked_at`, bazadagi qulf hisoblagichi) + `refresh_tokens.tsd_device_id`
   (FK **RESTRICT** — ataylab `SET NULL` EMAS: qurilma qatori o'chsa null
   qolgan sessiya cheklovsiz sessiyaga KO'TARILARDI).
   **Lokal dev bazada (`sherset_v2_dev`) 2 marta yugurtirilib isbotlangan**
   (ikkinchisi no-op); ustunlar/FK siyosati (`confdeltype='r'` = RESTRICT)/
   indekslar SQL bilan tekshirildi.
2. **`packages/db/scripts/rollback/20260825170000_tsd_device_down.sql`
   (qoida 12).** Teskarisi O'SHA sessiyada yozildi va lokal bazada sinaldi:
   DOWN → DOWN (no-op) → UP. Buyrug'i faylning boshida. Fayl ATAYLAB migratsiya
   papkasidan tashqarida (prisma u yerda faqat `migration.sql` ni kutadi).
3. **`auth/tsd-device.service.ts`** — juftlash/tanish/qulf. Qo'shimcha:
   juftlashda ombor SHU akkauntniki ekani tekshiriladi (`pos_devices` da
   `store_id` uchun FK yo'q edi — begona ID yozib qo'yish mumkin bo'lardi).
   `loadActive()` — refresh yo'li uchun KALITSIZ tiriklik tekshiruvi.
4. **`auth/tsd-login.service.ts`** + `POST /auth/tsd-login`. Kassadan farqi:
   **qurilma kaliti MAJBURIY** (`TsdLoginSchema`, `.strict()`). Sabab yozildi:
   kassada egasi 2026-08-11 da juftlashni ixtiyoriy qilgan, chunki kassa
   kompyuteri qulflangan xonada va brauzer zaxirasi kerak edi; TSD esa ombor
   bo'ylab yuradigan QO'L terminali va uning zaxira yo'li allaqachon bor
   (omborchi brauzerdan oddiy login qiladi).
   Refresh-token javob TANASIDA ham qaytadi — Android klientida cookie idorasi
   yo'q. Javobdagi xodim kaliti `id` (parol/POS login bilan bir xil).
5. **`auth/tsd-policy.ts` + `auth/tsd.guard.ts`** — default-deny marshrut
   ro'yxati va uni bajaradigan GLOBAL guard (`KioskGuard` naqshi, `APP_GUARD`).
   Ikkala guard MUSTAQIL: kesishma har doim ikkalasidan tor.
6. **`auth/route-allowlist.ts`** — mos-kelish mantig'i kiosk siyosatidan
   AJRATILDI (`normalizePath`, segment-chegara, `exact`, `Method`, `Rule`).
   Nusxalash shu repoda nomi bor xato-klassi bo'lardi. Kiosk QOIDALARI
   o'zgarmadi va mavjud testlari bir qatori ham tegilmasdan yashil.
7. **`token.service.ts`** — `deviceMode` da'vosi imzolanadi;
   `createRefreshToken(..., tsdDeviceId?)`; `rotateRefreshToken` bog'lanishni
   MEROS qiladi (faol rotatsiyada ham, grace-oynasidagi qardosh tokenda ham)
   va qaytaradi.
8. **`auth.service.refresh()`** — `tsdDeviceId` bo'lsa qurilma tirikligi
   tekshiriladi va `deviceMode` TIKLANADI; bekor qilingan yoki boshqa
   akkauntga o'tgan qurilma → 401 (yo'qolgan terminal admin bekor qilgach
   ko'pi bilan bitta access-JWT muddatida o'ladi).
9. **`POST /auth/tsd-device/pair`** — JWT + `@RequirePermission({employee, update})`.
   `@RequireHrPermission` ATAYLAB ishlatilmadi (2026-08-10 hodisasi: bu
   controllerda HR guard ulanmagan, dekorator jim bezak bo'lardi).

**🔴 NARX MUAMMOSI VA UNING YECHIMI (qabul mezonining «narx hech qayerda
ko'rinmaydi» bandi).**
Reja allowlist'ga «scan-lookup» ni kiritishni so'raydi. Lekin mavjud skan
yo'llarining HAMMASI narx oqizadi: `GET /products` to'liq tovar qatorini
(`buyPrice`, `minPrice`, `salePrices`) qaytaradi, `GET /products/:id/scan`
esa faqat `buyPrice`/`minPrice` ni kesadi — `salePrices` qoladi. Ekranda
ko'rsatmaslik himoya EMAS: token haqiqiy, `curl` bor.
⇒ **`/products` TSD ro'yxatiga UMUMAN kiritilmadi**, o'rniga narxsiz sirt:
- **`modules/tsd/tsd-scan.ts`** (sof) — ustunlarning **OQ RO'YXATI**
  (`TSD_PRODUCT_SELECT`, qora ro'yxat EMAS: kelajakda yangi narx ustuni
  qo'shilsa u o'z-o'zidan kirmaydi), multi-hit tanlovi va kod tasnifi;
- **`modules/tsd/tsd.service.ts` + `GET /tsd/scan`** — tovar nomi, kod,
  shtrixlar, o'lchov, jami qoldiq, YACHEYKA kesimi. Servis ataylab
  `ProductService` ni chaqirmaydi (uning har o'quv yo'li narx bilan keladi).
Testlar buni ikki tomondan qulflaydi: javobda narx-nomli kalit yo'qligi VA
so'rovda narx ustuni SO'RALMAGANI.

**K-reja bilan kesishma (qoida 10, `2026-08-25-bolinadigan-tovar-bolak-hisobi.md` 7.3):**
bo'lak yorliqlari `BLK-` makonida va MUTLAQO unikal, tovar shtrixlari esa
ataylab unikal emas. Skaner ularni ajratmasa omborchi bo'lakni skanerlaganda
multi-hit TOVAR tanlovi ochilib, kesim oqimi buzilardi. K-reja hali
boshlanmagan, shuning uchun `/tsd/scan` bo'lak kodini TANIYDI va
`kind: 'piece', supported: false` qaytaradi — ilova «bu bo'lak kodi, hali
qo'llab-quvvatlanmaydi» deydi va JIMGINA noto'g'ri tovarni ochmaydi.
K1 qurilgach shu shox to'ldiriladi (test allaqachon turibdi).

**TSD allowlist'i (`tsd-policy.ts`) — nimalar OCHIQ:**
`GET /restock-tasks` (+ detali), qator tasdiqlash (qo'lda va `confirm-scan`),
`GET /tsd/scan`, `GET /admin/stores/cells/by-barcode`, `POST /products/:id/cell-move`
va `cell-place` (AYNAN shu ikkisi, `exact`), `GET|PUT /admin/stores/:id/cells/:cellId/stock`
(+ `…/products` — sanash ro'yxati), `/notifications`, `/auth`, `/health`,
`/permissions/me`.
**YOPIQ (test bilan):** `/products` va butun tovar kartasi, `/price-*`,
`/supply`, hisobotlar, `/retail-sales`, `/cashier-sessions`, `/cash-out`,
`/debts`, `/counterparties`, `/hr/*`, `POST /restock-tasks/from-sales-return`
(terminal topshiriqni BAJARADI, ochmaydi), `cell-rebind` (tovar kartasi tahriri).
Ro'yxatga narx-nomli prefiks kirmasligini alohida qo'riqchi testi tekshiradi.

**Nima qilindi (APK skeleti — `android/tsd-app`):**
`driver-app` andozasi bo'yicha, farqlari sabab bilan yozilgan:
- `DeviceStore.kt` — kalit va refresh-token **EncryptedSharedPreferences** da
  (`driver-app` da oddiy prefs edi; u har safar parol so'rardi, TSD esa
  kalitni DOIMIY saqlaydi). **PIN hech qachon saqlanmaydi** — ikki omil bitta
  joyda yotsa bir omilga aylanadi.
- `ApiClient.kt` — faqat allowlist ichidagi yo'llar. Yangi topshiriq signali
  **polling** (SSE emas): SSE ni Android'da tirik ushlash foreground-service
  talab qilardi, ya'ni `driver-app` ning butun murakkabligi; terminal esa
  qo'lda va ekran ochiq. Narxi (kechikish ≤ interval) izohda yozilgan.
- `ActionQueue.kt` — oflayn FIFO amal navbati. `PingBuffer` dan TUBDAN farqi
  izohda: yo'qolgan ping zararsiz, yo'qolgan «tasdiqlandi» esa ish yo'qotadi,
  ikki marta yuborilgani esa qoldiqni ikki marta siljitardi ⇒ qat'iy ketma-ket
  yuborish + `clientOpId` (server hali o'qimaydi — G6) + navbat to'lsa
  YANGISI rad etiladi (eng eskisi tashlanmaydi: jim yo'qotish — IS-5 klassi).
- `ScannerBridge.kt` — **ikki rejim birga**: klaviatura-wedge (sukut, hamma
  terminalda sozlashsiz) va DataWedge/Urovo/Newland broadcast (model
  aniqlangach FAQAT `config.xml` to'ldiriladi, kod tegilmaydi).
- `MainActivity.kt` — juftlash → PIN → topshiriqlar → skan; **multi-hit
  majburiy** (ilova o'zi birortasini tanlamaydi).
- `dimens.xml` — tegish nishonlari **56dp/64dp**. Reja «`min-h-[44px]` va
  yirikroq, rem bazasi 12px» deydi; web'da `min-h-11` amalda 33px bo'lib
  chiqadi. Android'da `dp` mutlaq o'lchov ⇒ tuzoq yo'q, va qiymat ataylab
  Material minimumidan (48dp) yirikroq (qo'lqop, harakat, sovuq ombor).
- Manifestda **kamera va lokatsiya ruxsati YO'Q** (`driver-app` dan asosiy
  farq): terminal kuzatuv qilmaydi, skan apparat skanerdan keladi.
- `README.md` — endpoint kontrakti, build qadamlari va **qo'lda smoke
  ro'yxati** (jumladan: TSD tokeni bilan `GET /products` → 403; refresh'dan
  keyin yana 403; `revoked_at` qo'yilgach `/auth/refresh` → 401).
- **Build-verified EMAS** — `driver-app` bilan bir xil chegara (bu repoda
  Android toolchain yo'q). Bu qabul mezonining ochiq qismi.

**Testlar:** yangi 7 fayl — `tsd-policy` **20**, `tsd.guard` **10**,
`tsd-device.service` **10**, `tsd-login.service` **14**, `tsd-session-refresh`
**5**, `tsd/tsd-scan` **12**, `tsd/tsd.service` **8**; mavjud fayllarga:
`pos-endpoint-guards` **+3** (TSD juftlash qo'riqchisi, tokensiz login,
`TsdGuard` global ulangani), `token.service.test` **+4** (bog'lanish
merosi). Jami **+86**.
`mutation-guard-coverage` KLASS-QULFI yangi endpointni O'ZI USHLADI —
`tsdLoginHandler` `INTENTIONALLY_OPEN` ga SABAB bilan qo'shildi (qo'riqchi
ishlayapti).
TO'LIQ: **api 641 fayl / 9004 passed (2 skipped, 0 xato)**;
**web 325 fayl / 4283 passed (26 skipped, 0 xato)**; typecheck api(8G)/web/db
yashil; biome yangi/tegilgan fayllarda xatosiz (qolgan 3 ta `useTemplate`
ogohlantirishi — mening ishimdan OLDINGI qatorlar).

**Deploy holati: KUTILMOQDA** — G1+G2+G3+G4 bilan bir deltada boradi
(egasining «keyinroq» qarori + 2026-08-24 hodisasi hal bo'lmagan).
Deploy'da **TO'RTINCHI migratsiya** qo'shiladi:
`20260825170000_tsd_device` (`prisma db execute --file …` →
`prisma migrate resolve --applied …` → oxirida `prisma generate`).
**Yangi ruxsat-entity YO'Q** ⇒ `topup-role-permissions.ts` ga G5 hech narsa
qo'shmaydi. **Jonli xulq O'ZGARMAYDI:** `deviceMode` da'vosi bugungi hech bir
tokenda yo'q, `TsdGuard` hech kimga tegmaydi, `/tsd/scan` esa faqat yangi
marshrut. Terminal juftlanmaguncha `tsd_devices` bo'sh turadi.

**Ochiq qolganlar / keyingi fazaga (G6):**
- **Jonli tekshiruv qilinmagan ⇒ faza QISMAN (qoida 11).** Qabul mezoni:
  pairing → PIN → o'z tasklari → oflayn navbat → narx yo'qligi. Qadamlar
  `android/tsd-app/README.md` da; qurilma kelgach bajariladi.
- **APK build qilinmagan** (Android toolchain yo'q) — `gradle wrapper` +
  `assembleDebug` birinchi marta Android Studio bo'lgan mashinada yuriladi.
- **`clientOpId` ni server QABUL QILMAYDI** — idempotentlik G6 da
  `restock-tasks` confirm yo'liga qo'shiladi. Klient kalitni HOZIRDAN
  yuboradi, chunki keyin qo'shish APK yangilanishini talab qilardi.
- **Oflayn navbat AVTOMATIK bo'shamaydi** — hozir faqat yoziladi; yuborish
  siklidan (WorkManager yoki oddiy retry) G6 mas'ul.
- **Ish ekranlari yo'q** (yig'ish qatorlari, joylashtirish, sanash) — G5
  doirasi auth + skelet edi; ulanish nuqtalari (`ApiClient` metodlari) tayyor.
- **TSD qurilmalarini boshqarish EKRANI yo'q** — juftlash/bekor qilish hozir
  faqat API orqali (`pos-device/pair` da ham web UI yo'q — bir xil holat).
  Bekor qilish uchun hozircha `tsd_devices.revoked_at` ni qo'yish kerak;
  kichik admin ekrani alohida ish sifatida qoldirildi.
- **`/auth` prefiksi TSD ro'yxatida `['*']`** — kiosk ro'yxati bilan parity.
  Ikkinchi qulf ruxsat matritsasi (`tsd-device/pair` uchun `employee.update`,
  omborchida yo'q). Torroq qilish mumkin, lekin bu allowlist'ning umumiy
  naqshini o'zgartiradi (G5 doirasidan tashqari).
- **G6 uchun eslatma:** G2 hisobotidagi band kuchda — TSD'da «tayyor» oqimi
  `mark-ready` orqali flip QILMAYDI, chek kontrolga tushadi; UX shuni
  ko'rsatsin.
- **Boshqa sessiyaning qoldig'i (mening ishim emas):** K-reja fayli
  (`docs/plans/2026-08-25-bolinadigan-tovar-bolak-hisobi.md`) va uning
  F-rejaga qo'shgan 10-qoida qatori **commit qilinmagan** holda turibdi —
  o'sha sessiya yakunlashi kerak.

### G4 · 2a-bosqich — kassa AJRATMADAN ayiradi (backend TUGADI) · 2026-08-25 · `b4c27d24`

**🔴 Bu deploy JONLI XULQNI O'ZGARTIRADI.** 1-bosqichda hech narsa ulanmagan edi;
endi kassa haqiqatan ham ko'p ombordan avtomatik sotadi. Deploy'dan oldin
pastdagi «Jonli sozlash» bandini o'qing.

**Ikki tomonlama bog'liqlik javobi (qoida 10):**
- **Kassa oqimi** — eng katta o'zgarish: `post()` va `sendToPicking` endi
  yetarlilikni `assertAvailable` bilan emas, TAQSIMOT bilan hal qiladi.
  Xavf: taqsimot bo'sh qolsa har sotuv 400 bo'lardi. Yopildi — kaskad
  sozlanmagan/ombor topilmagan holatda `resolveAllocStores` SINTETIK zaxira
  ombor qaytaradi, ya'ni eski xulq (smena omboridan sotish) saqlanadi; testi bor.
- **Sanash ishi (H5)** — endi TUZALDI (pastda, `store-only`).
- **G2 kontrol / G3 vozvrat** — tegilmadi (testlar yashil).
- **H2/H3** — «POS yeta olmaydigan qoldiq» modeli endi ma'nosini o'zgartirdi,
  ular YANGILANMAGAN (E5, pastdagi ochiq bandlar).

**Nima qilindi:**

1. **`post()` deltalari AJRATMADAN quriladi** (E3). Ilgari hamma pozitsiya bitta
   `storeId` olardi va `cellId` umuman yo'q edi. Endi har ajratma → o'z ombori,
   o'z yacheykasi, o'z `docPositionId` si. **Tannarx har omborning O'Z o'rtachasidan**
   (ilgari bitta ombornikiga tayanardi — ko'p omborli ayirishda bu boshqa ombor
   qiymatini yozardi).

2. **🔴 `cellMode: 'store-only'` yacheykasiz ajratmada — egasining savoli shu bilan
   yopiladi.** Egasi so'ragan edi: «sotilgan tovar yacheyka sonidan ayriladimi yoki
   qolgan qiymatdanmi?» Javob edi: yacheykadan, chunki delta `cellId`siz ketardi va
   `stock.service` chiqimni band yacheykalardan KATTA-BIRINCHI o'zi ayirardi.
   Endi: ajratma yacheykali bo'lsa — AYNAN o'sha yacheyka siljiydi; yacheykasiz
   bo'lsa — `store-only`, ya'ni **sanalgan yacheykaga TEGILMAYDI**. Ya'ni
   omborchining 4–5 kunlik sanash ishi endi sotuvlar tufayli buzilmaydi.

3. **`sendToPicking` rezervi ham ajratma bo'yicha** — hold tovar TURGAN omborda
   yoziladi (ilgari doim kaskadning birinchisida). Aks holda rezerv bir omborda,
   yechim boshqasida bo'lib, hech qachon bo'shamaydigan hold paydo bo'lardi.
   Ajratma o'sha yerda SAQLANADI.

4. **Saqlangan ajratma `post()` da USTUVOR.** `sendToPicking` tovarni aynan shu
   yacheykada band qilgan va omborchi o'sha yerdan yig'gan — qayta rejalashtirsak
   jismonan olingan joy bilan hisobdan chiqarilgan joy mos kelmay qolardi.
   Reja faqat saqlangan qatorlar qoplamasa yoki eskirgan bo'lsa quriladi
   (miqdor + mavjudlik tekshiruvi bilan); ikkala yo'lga ham test bor.

5. **❌ Tasdiq-to'sig'i OLIB TASHLANDI** — `assertAvailableCascade` metodi
   o'chirildi (o'rnida sabab yozilgan izoh qoldi). 400 endi FAQAT haqiqiy
   defitsitda va xabari «tizimdagi hech bir omborda yetarli miqdor yo'q»;
   «bosh omborchi tasdig'i kerak» matni yo'q. `allowNegativeStock` yoqilgan
   omborda eski erkinlik saqlanadi (qoplanmagan qism asosiy ombordan).

6. **Qulflash** — taqsimotga kiradigan HAMMA ombor `lockBalances` bilan, **ID
   bo'yicha saralangan** tartibda (deadlock oldini olish). Reja qulflangan
   `qty − rezerv` dan o'qiydi, ya'ni ikki kassir bir yacheykani ikki marta
   sotolmaydi.

**Testlar:** F6 ning uchta wiring testi Q1-v2 ga QAYTA YOZILDI (o'chirilmadi):
«kaskad birinchisidan ayirish» → «tovar turgan ombordan»; «400 + kaskad-reja» →
«boshqa ombordan avtomatik» + «hech qayerda yetmasa 400». Yangi: yacheykali
ajratma (cellId + cellMode), bo'linish (ikki delta + ikki qator), BRAK sotilmasligi,
saqlangan ajratma ustuvorligi va uning yetmagan holati. `retail-sale` moduli
**39 fayl / 539 test**; TO'LIQ **api 634 fayl / 8901 passed (2 skipped, 0 xato)**; typecheck yashil.

Mock'larga `stockByCell.findMany` va `retailSalePositionAllocation` qo'shildi
(24 joy) — post() endi shu ikkalasini o'qiydi/yozadi.

**🔴 Jonli sozlash (deploy'dan keyin, egasi qo'lida):**
1. **Ombor kartasida «Kassa oldidagi ombor» checkbox'ini 07 ga qo'ying.**
   Busiz «bo'linishda 07 eng oxirida» qoidasi ISHLAMAYDI — tartibni `posPriority`
   belgilaydi va pp=1 bo'lgan 07 birinchi bo'lib bo'shab ketadi. Test bu tuzoqni
   izohda qayd etgan.
2. Kaskadda qatnashishi kerak bo'lgan HAR omborga `posPriority` qo'yilsin —
   prioritetsiz ombordagi tovarni kassa hech qachon ko'rmaydi.
3. BRAK ombori yaratilgach unga prioritet BERILMASIN (u baribir istisno, lekin
   ikki qavat himoya yaxshiroq).

**Ochiq qolganlar (2b):**
- **POS UI** — kassir pozitsiya qatorida «qayerdan olinadi» ni ko'rishi va
  o'zgartira olishi (`manual` ustuni tayyor, backend qabul qilishga tayyor emas).
- **Yig'ish topshiriqlari** (`createPickingTasksForSale`) hamon yacheyka
  prefiksidan taxmin qiladi — ajratmadan qurilsin.
- ✅ **E5 — H2/H3: BAJARILDI (2026-08-26, deploy-tayyorlik sessiyasi).**
  `warehouse-state-core.ts` da `needs_approval` bosqichi BEKOR QILINDI,
  `reachable` endi kaskaddagi HAMMA ombor (BRAK istisno — `resolveAllocStores`
  bilan bir xil filtr), reyestrga `posFront` (`__posFrontStore`) maydoni va
  ikkita yangi drift qo'shildi, «POS ombori kaskad BOSHI bo'lsin» sharti
  «kaskadda BO'LSIN» ga aylandi. `docs/ops/jonli-holat.md` ham yangilandi.
  Testlar 24 → **29** (teskari nazorat: eski model qaytarilsa 3 test yiqiladi).
  ⇒ `warehouse-state.ts` endi deploy'dan keyin yolg'on qizil BERMAYDI.
  **H3 ning O'ZI (signal + audit yozuvi) hamon qurilmagan** — u alohida faza.
- **`cancel()` ajratma qatorlarini o'chirmaydi** — bekor qilingan chekda eski
  qatorlar qolib ketadi (zararsiz, lekin `store` FK RESTRICT bo'lgani uchun
  ombor o'chirishni bloklashi mumkin).
- `retail-stock-cascade.ts` dagi `allocateAcrossStores` ning ishlab turgan
  chaqiruvchisi qolmadi — G4 to'liq o'tirgach o'chiriladi.
- **Jonli tekshiruv qilinmagan** ⇒ faza QISMAN (qoida 11): deploy'dan keyin
  uchma-uch smoke (sinov sotuv → tekshir → cancel) + `warehouse-state.ts` SHART.

### G4 — Ko'p omborli avto-taqsimot · ⚠️ 1-BOSQICH (2 dan) · 2026-08-25 · `3ebc9ffe`

**Holat: QISMAN (qoida 11).** Bu sessiya ATAYLAB ikkiga bo'lingan: 1-bosqich
`retail-sale.service.ts` ga TEGMAYDI (parallel sessiya bilan kolliziya xavfi —
CLAUDE.md §6). Ya'ni jonli xulq HALI O'ZGARMAGAN: kassa avvalgidek ishlaydi.

**Ikki tomonlama bog'liqlik javobi (qoida 10 — «bu nima buzishi mumkin?»):**
1-bosqichda HECH NARSA: yangi sof modul hech kim tomonidan chaqirilmaydi, yangi
jadval bo'sh turadi, `posFrontStore` bayrog'i esa hozircha faqat SAQLANADI
(uni o'qiydigan yagona joy — o'sha chaqirilmagan modul). Yagona xavf sxema
o'zgarishida edi va u to'liq test to'plami bilan tekshirildi (pastda).

**Nima qilindi:**

1. **`apps/api/src/modules/retail-sale/retail-allocation.ts`** — sof taqsimot
   dvigateli (Prisma yo'q). Q1-v2 ning uch qoidasi:
   - **1-holat** — «kassa oldidagi ombor» (07) dagi manba butun miqdorni
     qoplasa → o'shandan (yig'ish kerak emas);
   - **2-holat** — aks holda YOLG'IZ qoplaydigan manbalar orasidan ENG KICHIGI;
   - **3-holat** — bo'linish: boshqa omborlar avval, **07 ENG OXIRIDA**;
     ombor ichida KATTADAN kichikka (omborchining yurishi kamaysin).
   Chiqishda `rule` maydoni (`front`/`single`/`split`/`none`) — POS ekrani ham,
   testlar ham qaysi qoida ishlaganini ko'radi.

2. **🔴 E1 — yacheykasiz qoldiq ham MANBA.** Jonlida qoldiqning ~94 % i hech bir
   yacheykaga biriktirilmagan. Faqat `StockByCell` ga tayangan dvigatel
   tovarlarning aksariyati uchun reja qura olmasdi va kassa to'xtardi. Har ombor
   uchun yacheykasiz qoldiq `cellId = null` psevdo-manba sifatida qatnashadi.
   **Qaror:** 2-holatda REAL yacheyka kattaroq bo'lsa ham yacheykasizdan AFZAL —
   «eng kichigi» qoidasining maqsadi yacheykani BO'SHATISH (javonda joy ochilsin),
   yacheykasiz qoldiqni «bo'shatish» esa hech narsa bermaydi va omborchiga
   manzil ham qolmaydi.

3. **🔴 E4 — BRAK ombori manba EMAS** (test bilan qulflangan). F6 kaskadida u
   `__posPriority` yo'qligi bilan chiqib turardi; bu dvigatel yacheykalardan
   ishlagani uchun istisno OCHIQ yozilgan.

4. **E2 — yangi jadval `retail_sale_position_allocations`** + migratsiya
   `20260825020000_retail_sale_position_allocation` (idempotent DDL).
   Ustun emas, JADVAL: 3-holat bitta pozitsiyani bir necha yacheykaga bo'ladi.
   `cell_id` NULL bo'la oladi (E1). FK: position CASCADE, store RESTRICT,
   cell SET NULL. **Lokal dev bazada 2 marta yugurtirilib isbotlangan**
   (ikkinchisi no-op); ustunlar/FK siyosati/indekslar SQL bilan tekshirildi.

5. **«Kassa oldidagi ombor» bayrog'i `__posFrontStore`** (migratsiya yo'q,
   `__brakStore` naqshi): `store.schema` + servis lift/yozish + ombor kartasida
   checkbox + i18n ru/uz. **Nega prioritetning o'zi yetmaydi:** `__posPriority`
   faqat TARTIBNI beradi, 07 esa ikki xil ishlatiladi — yolg'iz qoplasa
   BIRINCHI, bo'linishda ENG OXIRGI. Bitta raqam buni ifodalay olmaydi.

**Yo'l-yo'lakay tuzatilgan ikki test (ikkalasi ham G4 mantig'iga tegishli emas):**
- **`kpi-target-cascade.test.ts` (MK22 qo'riqchisi) — TORAYTIRILDI.** U BUTUN
  sxemadan `/cascade|allocation/i` ni qidirardi, ya'ni istalgan domendagi model
  uni uyg'otardi. Qo'riqchining maqsadi — KPI/plan domenida uchinchi model
  ochilmasligi; endi faqat `Kpi*`/`*Plan*` nomlari tekshiriladi. **O'chirilmadi.**
- **`onboarding.service.test.ts` — KALENDAR BOMBASI.** Fikstura absolyut sanaga
  bog'langan (sinov 2026-09-01 da tugaydi), holat esa `now` ga qarab hisoblanadi.
  **2026-08-25 da** `daysLeft` aynan 7 = `EVALUATION_WARN_DAYS` bo'ldi va
  `in_probation` → `due_soon` ga o'tdi. G4 ga aloqasi YO'Q — sana o'zgargani
  uchun yiqildi. Vaqt muzlatildi (`toFake: ['Date']`, faqat Date — async oqim
  o'zgarmaydi) + `afterEach` da tiklanadi.

**Testlar:** yangi 3 fayl — taqsimot yadrosi **23**, sxema qulfi **9**, web ombor
kartasi **3**; `store.schema.test.ts` ga +3.
TO'LIQ: **api 632 fayl / 8839 passed (2 skipped, 0 xato)**; **web 325 fayl / 4283 passed (26 skipped, 0 xato)**; turbo typecheck api/web/db yashil;
i18n gate'lar yashil (key-existence 15 779 kalit); biome yangi fayllarda xatosiz.

**Deploy holati: KUTILMOQDA** — G1+G2+G3 bilan bir deltada boradi. Deploy'da
**uchinchi migratsiya** qo'shiladi: `20260825020000_retail_sale_position_allocation`
(`prisma db execute` → `migrate resolve --applied` → `prisma generate`).
Jonli xulq 1-bosqichda O'ZGARMAYDI — bayroq qo'yilmaguncha va 2-bosqich
simlanmaguncha kassa avvalgidek ishlaydi.

**2-BOSQICH REJASI (holati pastdagi 2a hisobotida):**
1. **E3 — `post()` deltalarini AJRATMADAN qurish.** Hozir
   `retail-sale.service.ts:1188–1209` hamma pozitsiyaga bitta `storeId` beradi va
   `cellId` umuman yo'q. Kerak: har ajratma → o'z `storeId` + `cellId`; tannarx
   har ombor balansidan alohida (`computePerUnitCost` hozir bitta omborga
   tayanadi); `cancel`/refund teskari yo'li ham ajratma kesimida.
2. **Rezerv** (`sendToPicking` → `StockReservation`) ajratma kesimida.
3. **`assertAvailableCascade` ni almashtirish** — «tasdiq kerak» 400 o'rniga
   reja BAJARILADI; haqiqiy defitsitda xabar «tizimda jami N ta yetmayapti».
4. **Yig'ish topshiriqlari** (`send-to-picking`) taxmindan emas, AJRATMADAN.
5. **POS UI** — pozitsiya qatorida «qayerdan olinadi» + kassir o'zgartira olishi
   (`manual = true` ustuni tayyor).
6. **E5 — H2/H3 ni yangilash:** G4 dan keyin «POS yeta olmaydigan qoldiq» modeli
   o'zgaradi (`needs_approval` bosqichi ma'nosini yo'qotadi) ⇒
   `warehouse-state-core.ts`, `docs/ops/jonli-holat.md` (+ `__posFrontStore`
   qatori) va H3 qo'riqchisi shu bosqichda qayta yoziladi.

**✅ Ochiq savol YOPILDI (egasi, 2026-08-25):** «07 da 1 ta mahsulot faqat 1 ta
yacheykada bo'ladi». Ya'ni «07 da yetarli, lekin bitta yacheykasi yolg'iz
qoplamaydi» degan holat TO'G'RI ma'lumotda umuman yuz bermaydi — 1-holat
tekshiruvi 07 uchun to'liq yetarli, taqsimot qoidasi O'ZGARMADI.

**Invariant kodga yozildi (`0ada8ce5`).** Faqat izoh bilan
qoldirilmadi: ma'lumot buzilsa (07 da bir tovar ikki yacheykada) taqsimot
jimgina 2/3-holatga tushib ketardi va hech kim buni bilmasdi — bu IS-5
(«nosozlik signali yo'q») xatosining aynan takrori bo'lardi. Endi:
- natijada yangi `warnings: [{ code: 'front-multi-cell', assortmentId, storeId, cells }]`;
- **xulq ATAYLAB o'zgarmaydi** — sotuv boshqa ombordan o'tadi, **kassa
  TO'XTAMAYDI** (buzilgan ma'lumot savdoni to'xtatmasligi kerak);
- ikki yangi test: invariant buzilganda ogohlantirish chiqishi va sotuv baribir
  o'tishi; to'g'ri ma'lumotda `warnings` BO'SH bo'lishi.
2-bosqichda bu ogohlantirish api log'iga va (kerak bo'lsa) `CashierAuditEvent` ga
ulanadi — H3 ning «ko'rinadigan signal» naqshi bilan bir xil.

### G3 — Vozvrat qabul ekranlari + vozvrat yorlig'i · 2026-08-24 · `6022e58c` (+ `acdf5ea7` lint)

**1-vazifa tadqiqoti — POS chekini vozvratga QANDAY bog'lash (reja shuni so'ragan):**
Uch yo'l ko'rildi, ikkitasi rad etildi:
- **`RetailSalesReturn` modeli (sxemada BOR) — O'LIK KOD.** `apps/api` va `apps/web`
  da unga BIRORTA murojaat yo'q; `positions` relationi ham yo'q (moysklad-parity
  qoldig'i). Ishlatib bo'lmaydi.
- **`SalesReturn.demandId`** — POS sotuvi `Demand` YARATMAYDI (u `RetailSale`),
  ya'ni bu ustun POS yo'lini umuman ifodalay olmaydi.
- **`attributes` JSON (F6 `__posPriority` naqshi)** — `SalesReturn` da ISHLAMAYDI:
  `AttributeMetadataService.validateAndNormalize` chiqishni FAQAT ro'yxatdan
  o'tgan meta-kodlardan quradi, ya'ni `__retailSaleId` jimgina TASHLANARDI.
  (Store'da ishlagani — u boshqa yo'l bilan yoziladi.)
⇒ **Yangi ustun** `sales_returns.retail_sale_id` (FK → `retail_sales`, ON DELETE
SET NULL, indeks) — G1 ning `retail_drawer_cash_out.sales_return_id` naqshi.

**Ikkinchi tadqiqot natijasi — POS'ning O'Z qaytarish yo'li (muhim):**
kassadagi tez qaytarish `RetailSale` mirror cheki (`refundedFromId`) bilan
ishlaydi: pul DARHOL beriladi, tovar esa kaskad omboriga **yacheykasiz** qaytadi
(`retail-sale.service` refund yo'li). Ya'ni **mirror chek qabul manbasi BO'LA
OLMAYDI** — uning tovari qoldiqqa allaqachon kirgan, ustiga ВП yozish qoldiqni
IKKI marta oshirardi. Kod buni ochiq rad etadi va omborchini to'g'ri ishga
yo'naltiradi: mirror chek tovarini yacheykaga **joylashtirish** kerak (F7
`cell-place`), qabul qilish emas. Mavjud `sendToWarehouse`
(`attributes.__sentToWarehouse` + SSE `return_to_warehouse`) faqat qo'ng'iroq
chaladi — uning ombor tomonida ekrani YO'Q (G6/F7 uchun ochiq band).

**Nima qilindi (backend):**
- **Sof yadro `sales-return-acceptance.ts`** (SQL yo'q):
  - `computeReturnableLines` — chek bo'yicha cap **IKKALA yo'nalishdan**:
    sotilgan − POS mirror qaytarishlari − shu chekka bog'langan avvalgi ВП lar
    (`state != cancelled`, draft ham band qiladi). Busiz mijoz kassadan pulni
    olib, keyin omborda yana qaytim yozdirib, G1 orqali IKKINCHI marta pul
    olardi. Cap TOVAR kesimida — POS'ning `validateRefundPositions` guard'i ham
    aynan shu kesimda ishlaydi.
  - `planAcceptance` — so'ralgan qatorlarni tekshirib OMBOR kesimida hujjatlarga
    bo'ladi; narx/chegirma CHEKDAN olinadi (so'rovdan EMAS — `priceRefundFromOriginal`
    naqshi).
  - `readBrakStore` / `BRAK_STORE_KEY`.
- **`sales-return-acceptance.service/controller`** — `GET …/acceptance/targets`
  (omborlar + BRAK + standart = kaskad boshi), `GET …/acceptance/receipts`
  (faqat ASL, o'tkazilgan cheklar), `GET …/acceptance/source/:id` (qatorlar +
  cap), `POST …/acceptance/from-retail-sale/:id` (hujjat(lar) yaratib
  o'tkazadi). Javobda har pozitsiya uchun YORLIQ ma'lumoti (shtrix + yacheyka
  kodi) — ekran qo'shimcha so'rovsiz chop etadi.
- **Migratsiya `20260824170000_sales_return_retail_sale`** (idempotent DDL).
  **Lokal dev bazada (`sherset_v2_dev`) 2 marta yugurtirilib isbotlangan**
  (ikkinchisi no-op); ustun/FK(`confdeltype=n` = SET NULL)/indeks tekshirildi.
- **`create()` da manba-chek butunligi:** chek shu tenantniki, `posted|refunded`
  va mirror EMAS — aks holda 400.
- **G1 ning ochiq bandi YOPILDI:** `assertNotPaid` — `payedSumMinor > 0` bo'lgan
  vozvratni `unpost`/`cancel` qilib bo'lmaydi. Tekshiruv TRANZAKSIYA ICHIDA,
  holat claim'idan KEYIN (parallel `customer-payout` bilan poyga bo'lmasin).

**BRAK qarori (reja «o'zing hal qilib hisobotga yoz» degan band):**
brak **ZONA emas, alohida OMBOR** — `Store.attributes.__brakStore = true`
(migratsiya yo'q, F6/F7 naqshi) + ombor kartasida maydon.
**Sabab:** kassa kaskadi (F6) omborni tanlaydi, ya'ni «sotiladigan» birlik —
OMBOR. Bir ombor ichidagi «BRAK zonasi» ombor-darajadagi `Stock` ni sotuvga
ochiq qoldirardi va `assertAvailableCascade` brakni ham «bor» deb sanardi —
ya'ni qabul mezoni («brak sotuv qoldig'iga aralashmaydi») BAJARILMASDI.
BRAK ombori kaskadda qatnashmaydi (`posPriority` bo'sh) ⇒ POS unga hech qachon
yetmaydi. Bitta ВП = bitta ombor (`assertCellsInStore`), shuning uchun
sifatli+brak aralash qabul **IKKI hujjat** bo'lib yoziladi (bu ataylab:
`SalesReturn.storeId` ni pozitsiya darajasiga tushirish post/unpost/cancel
deltalari va cost-freeze zanjirini qayta qurishni talab qilardi).
Pozitsiyaga yangi «brak» maydoni QO'SHILMADI — yacheykaning o'zi tasnif.

**Nima qilindi (web):**
- **`/omborchi/vozvrat`** — qabul ekrani: chek qidiruvi (raqam yoki mijoz nomi),
  qolgan miqdor chek raqamlari bilan, har qatorda son + «Sifatli/Brak» +
  yacheyka kodi (skaner-do'st `resolveCellByCode`), qabul → yorliq oynasi.
  Tegish nishonlari ANIQ pikselda (`min-h-[44px]`, `h-11`) — dizayn-tizim rem
  bazasi 12px. Ekran NARX YUBORMAYDI (test bilan qulflangan).
- **`return-label-print.tsx`** — 58×40mm vozvrat yorlig'i: tovar nomi + soni,
  BRAK belgisi, KATTA yacheyka kodi, Code128 tovar shtrixi.
  **`POST /labels/render` ATAYLAB ishlatilmadi:** u tovar × nusxa sonini
  template geometriyasi bilan qaytaradi va javobida YACHEYKA tushunchasi UMUMAN
  yo'q (`label.service` faqat `id/name/code/article/barcodes/salePrices` o'qiydi),
  vozvrat yorlig'ining butun ma'nosi esa «shu tovar SHU yacheykada» juftligi.
  Repodagi mavjud naqsh olindi — yacheyka yorlig'i ham, narx yorlig'i ham
  mijoz tomonda SVG bilan chiziladi va `window.print()` ga beriladi.
- `/omborchi` panelida «Vozvrat qabuli» havolasi (`can('returnacceptance','view')`);
  ombor kartasida «BRAK ombori» belgisi; `access-sections` «Retail» qatori.
- i18n ru+uz: `pages.omborchi_vozvrat` (30 kalit) + `stores.brak_store*` (2) +
  `access_entity_returnacceptance`.

**Ruxsatlar (reja 4-vazifasi ham shu yerda):**
- **Yangi entity `returnacceptance`** (`salesreturn` EMAS): qabul oqimi hujjat
  yaratib O'TKAZADI, ya'ni umumiy `salesreturn.create`+`approve` kerak bo'lardi va
  bu katta omborchiga butun `/sales-returns` modulini (mass-edit, delete,
  ixtiyoriy narxda hujjat) ochib yuborardi. G2 `retailcontrol` naqshi.
  warehouse_manager `view+create`; storekeeper/kassir NO. Ro'yxatlar: types +
  PERMISSION_ENTITIES + seedSystemRoles + seed.ts + topup NEW_ENTITIES +
  **TOPUP_ENTITIES (vaqtincha!)** + roles.controller (KNOWN + kategoriya) +
  shablon + snapshot.
- **🔴 `supply` STOREKEEPER'dan OLIB TASHLANDI.** Egasining qoidasi: «Ombor
  xodimlari narx ko'rmaydi; kirim narxi faqat katta omborchiga». Ta'minot hujjati
  aynan kirim narxini ko'rsatadi, ya'ni `storekeeper.supply.view` shu qoidaning
  to'g'ridan-to'g'ri buzilishi edi. warehouse_manager'da `supply.view = ALL`
  (PURCHASE_DOCS) — tekshirildi, o'zgartirilmadi.
  ⚠️ **Bu SHABLON o'zgarishi — jonli rolga o'z-o'zidan tatbiq BO'LMAYDI**
  (topup faqat QO'SHADI). Jonli «Omborchi» rolidan `Ta'minot` qatorlarini egasi
  rol matritsasidan olib tashlashi kerak (deploy retseptida).

**Testlar:** yangi 7 fayl — sof yadro 21, wiring 20, ruxsat 26, to'lov qo'riqchisi 6,
**G3↔G1 zanjiri 5** (qabul → posted → kassirning `unpaid-returns` ro'yxatida
qaytim summasi bilan chiqishi; qoralama tushmasligi; mijozsiz chek qabul
qilinmasligi), ombor sxemasi +2; web qabul sahifasi 9, ombor kartasi 2.
TO'LIQ: **api 628 fayl / 8754 passed** (2 skipped, 0 xato); **web 324 fayl / 4280 passed** (26 skipped, 0 xato — birinchi yugurishdagi 1 ta 5s-timeout `sales-screen-shift.test.tsx` da parallel-yuklama flake'i edi, toza yugurishda 0, F6 hisobotidagi bilan bir klass);
typecheck api(8G)/web yashil; i18n gate'lar (key-existence 15777 kalit,
no-hardcoded, raw-element, dead-route-links) yashil; pre-push guard + lint
gate yashil; `role-templates` snapshotlari yangilandi (returnacceptance qatorlari
+ storekeeper'dan `supply` chiqishi).

**Deploy holati: KUTILMOQDA (ataylab).** Sabablari:
1) G1 va G2 deploy'i egasining «keyinroq» qarori bilan kutib turibdi — G3 o'sha
   delta ustiga qo'shildi (`62a27024..HEAD` = G1+G2+G3 birga ketadi);
2) **2026-08-24 06:46 dagi hodisa** (`docs/plans/2026-08-24-split-kassa-hodisasi.md`):
   jonli split shoshilinch qaytarilgan, H1 navbatda, egasiga savol S1 javobsiz.
   Ombor tuzilmasiga tegadigan deploy'ni hodisa rejasidan OLDIN yuritish noto'g'ri
   bo'lardi;
3) VPS paroli bu sessiyada berilmagan (F-reja 2.5/2.8 qoidasi).
Push qilingan: `mirfayz` remote, branch HEAD **`acdf5ea7`**.

**Deploy retsepti (G1+G2 retseptiga G3 qo'shimchalari):**
1) VPS HEAD tekshir (Davlatbek tuzog'i) → `git merge --ff-only`;
2) **Migratsiyalar (ikkitasi):** G1 `20260824120000_drawer_cash_out_sales_return`
   va G3 `20260824170000_sales_return_retail_sale` — har biri
   `prisma db execute --file …` → `prisma migrate resolve --applied …` →
   oxirida `prisma generate`;
3) `build:web` → pm2 restart **web va api**;
4) **MAJBURIY:** `npx tsx src/scripts/topup-role-permissions.ts`
   (`retailcontrol` + `returnacceptance` qatorlari) → api yana restart (perm cache)
   → so'ng follow-up commit: TOPUP_ENTITIES'dan ikkalasini olib tashlash;
5) **Egasi qo'lda (rol matritsasi):** «Omborchi» rolidan `Ta'minot` (supply)
   qatorlarini olib tashlash — shablon o'zgarishi jonli rolga ko'chmaydi;
6) **Egasi qo'lda (BRAK ombori):** F3 «Yangi ombor raqamlashtirish» bilan BRAK
   ombori yaratilsin (masalan 99), yacheykalari raqamlansin, ombor kartasida
   «BRAK ombori» belgilansin va **POS prioriteti BO'SH qoldirilsin**. Shu
   qilinmaguncha ekranda «Brak» tugmasi o'chiq turadi (ataylab, test bilan);
7) **Jonli tekshiruv (qabul mezoni):** mijozli sinov-chek → `/omborchi/vozvrat` da
   chek topiladi → 1 qator sifatli + 1 qator brak → qabul → yorliqlar chop →
   kassirda mijoz profilida qaytim summasi chiqadi → G1 to'lovi → brak tovar
   BRAK omborida turgani qoldiq hisobotida ko'rinadi va POS uni ko'rmaydi.
   Storekeeper bilan `/omborchi/vozvrat` 403 berishini ham tekshirish.

**Ochiq qolganlar / keyingi fazalarga:**
- **🔴 H-reja bilan kesishma (H2/H3 uchun MUHIM):** BRAK ombori — bu ATAYLAB
  «POS yeta olmaydigan qoldiq». H3 ning deploy-oldi qo'riqchisi («POS yeta
  olmaydigan qoldiq > 0 ⇒ chiqish kodi 2») va H2 holat reyestri BRAK omborini
  ISTISNO qilishi shart, aks holda birinchi brak qabulidan keyin har deploy
  bloklanadi va signal «bo'ri keldi» qilib qoladi. R4 xavfi bilan bir shakl,
  lekin sabab boshqa.
- Qabul ikki hujjat yozganda ular KETMA-KET yaratiladi (bitta tashqi tranzaksiya
  emas — `create()` o'z tranzaksiyasini ochadi). Ikkinchisi yiqilsa birinchisi
  post bo'lgan holda qoladi: har hujjat mustaqil to'g'ri va cap keyingi urinishda
  allaqachon post bo'lganini hisobga oladi, lekin omborchiga «brak qatori
  yozilmadi» deb qayta urinish kerak bo'ladi.
- **Egasiga savol:** brak tovar uchun ham mijozga to'liq qaytim beriladimi?
  Hozirgi xulq — HA (ikkala hujjat ham mijoz balansiga kredit yozadi, G1 ikkalasini
  ham to'laydi). Boshqacha bo'lsa — alohida ish.
- Qabul FAQAT chekdan boshlanadi (chek-siz erkin vozvrat qurilmadi): narxsiz
  qabul qilishning yagona ishonchli manbasi mijoz to'lagan chek. Chek-siz
  vozvrat mavjud `/sales-returns/new` (back-office) ekranida qoladi.
- POS mirror cheklari uchun ombor tomonida ekran hali yo'q (`__sentToWarehouse`
  faqat bildirishnoma) — bu qabul emas, JOYLASHTIRISH ishi: F7 `cell-place`
  ustiga G6 (TSD) yoki alohida kichik ekran bilan yopilsin.
- READ_ONLY_BASE'li shablonlar (sales_manager, accountant, supplier)
  `returnacceptance.view` oladi (zararsiz — `create` YO'Q); xohlasa egasi yopadi.
- `guard-baseline.json` dagi `label-grounding.test.ts` («#18 / #35») qatori hamon
  PASS bo'lib turibdi (G2 hisobotidagi eslatma kuchda, alohida tozalash).

### G2 — Kontrol oqimi · 2026-08-24 · `2b6068b9`

**Nima qilindi (backend):**
- **Navbat:** `GET /retail-sales/control-queue` — `picking` holatidagi, HAMMA
  yig'ish topshiriqlari (`RestockTask type=picking`) yopiq cheklar, FIFO
  (moment asc), har kartada sklad/omborchi/holat cheklar. Sof shart —
  `retail-control.ts#isControlReady`: **topshiriqsiz chek navbatga TUSHMAYDI**
  (sabab: `send-to-picking` topshiriqlarni tx tashqarisida best-effort ochadi —
  0-topshiriqli oynada kontrol yig'ilmagan chekni tasdiqlashi mumkin edi;
  bunday chek kassirning o'z «tayyor» tugmasi bilan yopiladi).
- **«To'liq»:** `POST /retail-sales/:id/control-approve` — `picking→ready`
  CAS-flip; ochiq topshiriq bo'lsa 400; **KIM tekshirgani** flip bilan bir
  tranzaksiyada `CashierAuditEvent CONTROL_APPROVED` (employeeId=kontrolchi,
  payload'da tasdiqlangan tarkib); kassirga `sale_ready` SSE.
- **Tahrir:** `PATCH /retail-sales/:id/control-edit` — qator o'chirish / sonni
  o'zgartirish, FAQAT `picking` da (FSM: ready'dan keyin tahrir yo'q — test).
  **Qaror: faqat KAMAYTIRISH** — ko'paytirish omborchi yig'magan (rezerv
  qilinmagan) tovarni chekka qo'shish bo'lardi; oshirish kerak bo'lsa kassir
  yangi chek ochadi. Sof reja moduli `planControlEdit` (narx/chegirma
  tegilmaydi, summa `computePositionTotal` bilan qayta); yozuv versiya+holat
  BIR filtrda (poyga → 409); **rezerv ham kamayadi** — delta hold turgan
  (store×product) qatorlar bo'yicha net-cap bilan, `release_manual`,
  cancel() dagi lockBalances intizomi; `CONTROL_EDITED` audit (qaysi qatorlar,
  eski→yangi); kassirga `sale_edited` SSE — body'da o'zgargan qatorlar NOMI.
  (Rejadagi «Tahrirlash → PATCH :id/edit» bajarilmadi-o'zgartirildi: mavjud
  `:id/edit` POSTED chekning pul qatlamini tahrirlaydi — boshqa klass;
  picking-tarkib uchun alohida endpoint to'g'ri.)
- **`markReady` o'zgarishi (zanjir o'zagi):** o'z topshirig'i bor chaqiruvchi
  (kichik omborchi) endi flip qilMAYDI — topshiriqlari yopilib chek kontrol
  navbatiga tushadi. Topshiriqsiz chaqiruvchi (kassirning 2026-08-11 zaxira
  yo'li) eski xulqda: hammasini yopadi va flip qiladi — omborchi kelmay qolgan
  chek qotib qolmaydi.
- **Ruxsat — yangi entity `retailcontrol`** (`retailsale` EMAS, chunki uning
  view/update'i storekeeper'da ham bor): warehouse_manager view+update ALL;
  storekeeper/kassir NO (lifecycle-permission testlari qulflaydi).
  **Diqqat — bu yerda qulf BITTA:** kiosk-allowlist'da `/retail-sales` prefiksi
  `methods: ['*']` bilan ochiq (kassa asosiy ishi), ya'ni marshrut kiosk'ga
  yetadi va kontrolni FAQAT ruxsat matritsasi to'xtatadi (kassirda
  `retailcontrol=NO` ⇒ PermissionsGuard 403). Fail-closed va yetarli, lekin
  «ikkinchi qatlam» yo'q — kim kassir shabloniga `retailcontrol` bersa,
  marshrut darhol ochiladi. Ro'yxatlar: types +
  PERMISSION_ENTITIES + seedSystemRoles + seed.ts + topup NEW_ENTITIES +
  **TOPUP_ENTITIES (vaqtincha!)** + roles.controller + shablon + snapshot (6).
- **SSE:** `NotificationKind` + `sale_edited`/`sale_ready`, ikkalasi
  «Розница» qatori (notification-settings-filter). Qabul qiluvchi — chek
  smenasining kassiri.
- **`GET /retail-sales` filtri:** `assigneeId` endi HAQIQIY (sxema uni ilgari
  jimgina kesib tashlar edi — omborchi paneli 2026-08 dan beri yuboradi-yu har
  omborchi HAMMA chekni ko'rardi); `assigneeOpen=1` — faqat ochiq topshiriqli
  cheklar. Diqqat: endi topshiriqsiz omborchi ro'yxati bo'sh (fail-closed).

**Nima qilindi (web):**
- **`/omborchi/kontrol`** — kontrol ekrani (skanersiz): FIFO navbat (8s poll +
  SSE invalidatsiya), kartada chek/summa/kassir/sklad-cheklar, «Ko'rish»
  (tafsilot `GET /retail-sales/:id`), «To'liq» (tasdiq dialogi), «Tahrirlash»
  (DS Input h-11, qator o'chirish/qaytarish, bo'sh chek bloklanadi). i18n ru+uz
  (`pages.omborchi_kontrol.*` 24 kalit). F8 qobig'i /omborchi ichida — yo'l mos.
- `/omborchi` paneli: «Kontrol» havolasi (`can('retailcontrol','view')`),
  picking so'roviga `assigneeOpen=1` — omborchi «Tayyor» bosgach karta
  ro'yxatidan chiqadi (chek kontrolda).
- `use-notification-stream`: `sale_edited`/`sale_ready` da POS
  `retail-sales-picking/ready/session` + kontrol keshlari invalidatsiya —
  kassir 8s poll kutmaydi, toast'da o'zgargan qatorlar ko'rinadi.
- `access-sections` «Retail» bo'limiga `retailcontrol` qatori + i18n.

**Testlar:** yangi — `retail-control.test.ts` 21 (navbat sharti, tahrir
rejasi chegaralari, sxema), `retail-sale-control-wiring.test.ts` 18 (navbat
filtri qisman/topshiriqsiz, approve flip+audit+SSE/400/409, edit yozuv+rezerv
net-cap+409/400/noop, markReady flip-yo'q/zaxira-yo'l, assigneeId simlari),
lifecycle-permissions +12 (retailcontrol qulfi), web kontrol sahifa 5, stream 2.
TO'LIQ: **api 8674 passed (2 skipped, 0 xato); web 322 fayl / 4269 passed
(26 skipped, 0 xato)**; typecheck api(8G)/web/db yashil; biome yangi fayllarda
xatosiz; snapshotlar faqat `retailcontrol` qatorlari bilan yangilandi.

**Deploy holati: KUTILMOQDA** — G1 deploy'i ham egasi aytganidek kutib turibdi
(«keyinroq»), G2 o'sha delta ustiga qo'shildi: keyingi deploy `62a27024..HEAD`
ni birga olib boradi (G1+G2). **Retsept (G1 retsepti + G2 qo'shimchalari):**
1) VPS HEAD tekshir (Davlatbek tuzog'i) → ff-merge;
2) G1 migratsiyasi (`20260824120000_drawer_cash_out_sales_return` — db execute
   + resolve + generate); G2 da YANGI MIGRATSIYA YO'Q (sxema o'zgarmagan);
3) `build:web` → pm2 restart web **va api**;
4) **MAJBURIY:** apps/api'da `npx tsx src/scripts/topup-role-permissions.ts`
   (jonli rollarga `retailcontrol` qatorlari) → api yana restart (perm cache) →
   so'ng follow-up commit: TOPUP_ENTITIES'dan `retailcontrol`ni olib tashlash
   (template-topup qoidasi; testdagi TOPUP asserti bilan birga);
5) Jonli tekshiruv (qabul mezoni): 2 skladli sinov-chek → omborchilar «Tayyor» →
   chek kontrol navbatida → bitta qator o'chirilganda kassir ekranida summa
   o'zgaradi (SSE toast) → «To'liq» → kassir post qila oladi; storekeeper bilan
   /omborchi/kontrol 403 berishini tekshirish.

**Ochiq qolganlar / keyingi fazalarga:**
- Deploy + jonli tekshiruv egasining ruxsati/VPS paroli bilan (yuqoridagi
  retsept); topup'dan keyin `retailcontrol`ni TOPUP_ENTITIES'dan olib tashlash.
- Kontrol tahriri POSTED chekka tegmaydi (ataylab) — u `PATCH :id/edit`
  (pul qatlami) bilan qoladi; picking-tahrir narx/chegirmaga ham tegmaydi.
- `sale_edited` bildirishnomasi faqat smena kassiriga boradi — kassir
  almashgan smenada (admin boshqa kassaga kirsa) toast o'sha kassirga ketadi;
  ro'yxatlar baribir 8s poll bilan yangilanadi.
- G6 (TSD) uchun: TSD'da «tayyor» oqimi ham `mark-ready` orqali — flip
  bo'lmasligi TSD UX'ida hisobga olinsin (chek «kontrolda» deb ko'rsatilsin).
- READ_ONLY_BASE'li boshqa shablonlar (sales_manager, accountant, supplier)
  `retailcontrol.view` oladi (navbatni ko'rish — zarasiz, update YO'Q);
  xohlasa egasi rol matritsasidan yopadi.
- Kontrol marshrutlari kiosk-allowlist'ning keng `/retail-sales` prefiksi
  ostida qoladi (yuqoridagi «qulf bitta» izohi) — xohlansa alohida deny-qator
  qo'shish mumkin, lekin bu allowlist'ning umumiy naqshini o'zgartiradi
  (G2 doirasidan tashqari deb qoldirildi).
- Push paytida pre-push guard eslatmasi chiqdi: `label-grounding.test.ts`
  baseline yozuvi («#18 / #35») endi PASS bo'lib turibdi — sababi bo'sh
  `visual-captures` korpusi (25 test skip). G2 ga aloqasi yo'q, lekin
  `scripts/guard-baseline.json` dan o'sha qatorni olib tashlash kerak
  (kichik tozalash, alohida commit).

### G1 — Vozvrat pulini kassadan qaytarish · 1-SESSIYA (kod) · 2026-08-24 · `8b39a083`

> ℹ️ Bu G1 ning BIRINCHI sessiyasi (kod yozildi). Ikkinchisi — deploy uchun chaqirilgan 2026-08-25 sessiyasi — yuqorida, `9fe25d15` ostida.

**Nima qilindi (backend):**
- **Yangi endpoint `POST /cashier-sessions/:id/customer-payout`** (controller +
  `CustomerPayoutSchema`): `RetailDrawerCashOut` ustiga yangi `kind='return_payout'`
  (hujjat raqami `ВВ-YYYY-#####`) + yangi `salesReturnId` ustuni; bitta
  Prisma-tranzaksiyada TO'RT iz: (1) hujjat; (2) pul daftari — `CashDesk.balanceMinor`
  kamayadi, overdraft qo'riqchisi 400 bilan orqaga qaytaradi; (3) mijoz balansi
  `+summa` (yangi docType `returnPayout`) — **muhim qaror:** `SalesReturn.post()`
  allaqachon `−sumMinor` yozadi (qarz kamayadi), naqd berilganda o'sha kredit
  yopilmasa mijoz IKKI marta olardi (qarz kamayishi HAM, pul HAM); (4)
  `RETURN_PAYOUT` `CashierAuditEvent` (+ kutilgan naqddan oshsa `CASH_OVERDRAWN`).
- **CAP:** `SalesReturn.payedSumMinor` optimistik qulf bilan (`updateMany where
  payedSumMinor=<o'qilgan>` → count=0 ⇒ 409) — bitta vozvratni ikki marta to'lab
  bo'lmaydi, **qisman to'lash mumkin** (`sumMinor` ixtiyoriy, default qolgan qaytim).
  To'liq to'langaniga urinish / qolgandan katta summa → 400.
- **Kutilgan-naqd (§8.4):** kod o'zgarishsiz o'z-o'zidan qamraydi — hujjat
  `retailDrawerCashOut` jadvalida, `collectCashInputs.drawerOutMinor` HAMMA
  posted qatorlarni yig'adi (kind'dan qat'i nazar). **Z-hisobot:** yangi
  `returnPayoutMinor` qatori (sof `summarizeCashOut` bucket'i — `other`ga
  aralashmaydi, `totalMinor`ga kiradi; `buildZReport` input + javob + chek).
- **`GET /cashier-sessions/unpaid-returns?agentId=`** — post bo'lgan,
  `payedSumMinor < sumMinor` vozvratlar ro'yxati + jami qaytim; valyutalilar
  ko'rinadi lekin `payable=false` va jamiga kirmaydi.
- **G1 chegarasi (rejadagi «ikki valyuta ehtiyoti»):** to'lov FAQAT UZS —
  kassa UZS bo'lishi `loadOpenShiftForDrawer`da tekshiriladi (mavjud qo'riqchi),
  valyutali `SalesReturn` OCHIQ 400 oladi. Dollar-payout kelajak ishi.
- **Ruxsat/kiosk (reja 3-band):** endpointlar ATAYLAB `/cashier-sessions` ostida —
  kassirning mavjud `cashiersession` view/create ruxsati va kiosk-allowlist'dagi
  `/cashier-sessions` prefiks qoidasi (methods `*`) ikkalasini allaqachon ochadi;
  YANGI allowlist qatori kerak bo'lmadi (`cash-out-recipients` bilan bir naqsh).
- **DUP-02 qamrovi:** `cashier-session.service.ts` yangi balans-yozuvchi —
  `recompute-counterparty-balances.ts`ga `SOURCE: return-payouts` bloki,
  `counterparty-balance-sources.ts` reyestri, `counterparty-balance-doc-resolver.ts`
  (ВВ- yorlig'i) va akt `ACT_DOC_TYPES` + i18n doc-type xaritalari yangilandi.
  (Qamrov qulfi testi buni o'zi ushladi — qo'riqchi ishlayapti.)
- **Migratsiya `20260824120000_drawer_cash_out_sales_return`** (idempotent DDL):
  `retail_drawer_cash_out.sales_return_id` UUID + FK RESTRICT (to'langan
  vozvratni o'chirib bo'lmaydi — pul izi) + indeks. **Lokal dev bazada
  (`sherset_v2_dev`) 2 marta yugurtirilib isbotlangan** (ikkinchisi no-op).

**Nima qilindi (POS/web):**
- `customers-panel.tsx`: «To'lanmagan vozvratlar» bloki (jami qaytim + qator
  kesimi: raqam, sana, qisman to'langani, qolgani), «To'lash» → summa maydoni
  (default qolgan qaytim; ortiq summa tugmani o'chiradi) → POST → chek chop
  (`/print/cash-out/:id?auto=1` payout varianti: MIJOZ nomi + VOZVRAT raqami +
  «Oldim (mijoz)» imzo qatori) → qarz-raqam va blok invalidate. `sessionId`
  prop `sotuv/page.tsx`dan.
- Z-hisobot uch renderer + `/retail/sessions/[id]` ekranida «Vozvrat puli» qatori.
- i18n ru+uz: `pages.pos.unpaid_returns_*` (7), `pages.z_report.return_payout`,
  doc-type xaritalari (3 joy).

**Testlar:** yangi `customer-payout.test.ts` 13 (to'liq/qisman to'lov, cap 400,
poyga 409 + hech narsa yozilmasligi, draft/USD 400, overdraft rollback
payedSumMinor'ni ham qaytarishi, balans-delta argumentlari, unpaidReturns filtri,
sof modul: bucket/prefiks/audit) + web panel 4 yangi (blok yo'qligi, ro'yxat+jami,
to'liq to'lov POST+print, qisman va cap-bloklash). TO'LIQ: **api 621 fayl /
8624 passed (2 skipped, 0 xato — birinchi parallel yugurishdagi 1 xato flake emas,
DUP-02 qamrov qo'riqchisi edi va tuzatildi); web 321 fayl / 4262 passed
(26 skipped)**; turbo typecheck api+web+db yashil; i18n gate'lar yashil;
pre-push guard/lint gate'lari yashil.

**Deploy holati: KUTILMOQDA** — egasi «Deploy keyinroq» dedi (2026-08-24),
jonli sinov rejimi: «faqat texnik verify». Push qilingan: `mirfayz` remote,
branch HEAD `8b39a083`. **Deploy retsepti (F-reja 2.8 + shu faza):**
1) VPS HEAD holatini TEKSHIR (Davlatbek reset tuzog'i — F5 saboqi!) →
   `git fetch <mirfayz-url> yacheyka-inventarizatsiya:tmp && git merge --ff-only tmp`;
2) **Migratsiya:** `prisma db execute --file prisma/migrations/20260824120000_drawer_cash_out_sales_return/migration.sql`
   → `prisma migrate resolve --applied 20260824120000_drawer_cash_out_sales_return`
   → `prisma generate`;
3) `build:web` (nohup, RC poll) → `pm2 restart sherset-v2-web` va **API HAM**
   (`sherset-v2-api` — api'ga tegilgan);
4) Texnik verify: sahifalar 200, pm2 error loglar toza, DB'da ustun/indeks bor;
   funksional zanjir (sinov-vozvrat → POS blok → to'lov → expected-cash −summa →
   ikkinchi to'lov rad) kassir/egasi tomonidan POS'da.
Eslatma: F7 (`afd27a47`) va F8 (`83027bc2`+`62a27024`) F8 sessiyasi tomonidan
2026-08-24 da ALLAQACHON jonliga chiqarilgan (VPS HEAD kutilishicha `62a27024`) —
G1 deploy'i faqat `8b39a083..a84431b1` deltasi. F7 hisoboti F-reja faylida
haligacha YO'Q (o'z sessiyasi yozishi kerak).

**Ochiq qolganlar / keyingi fazalarga:**
- Valyutali (USD) vozvrat payout'i qurilmagan (ataylab, G1 chegarasi) — ehtiyoj
  chiqsa dollar-yashiq (§8.4 USD oqimi) bilan birga alohida ish.
- `SalesReturn.unpost/cancel` `payedSumMinor`ni TEKSHIRMAYDI (to'langan vozvratni
  cancel qilish balans/pul izini buzishi mumkin) — hozircha to'lov FK RESTRICT
  hujjatni himoya qiladi, lekin cancel-yo'lga «to'langan bo'lsa taqiqla»
  qo'riqchisi G3 da qo'shilsin (vozvrat oqimi o'sha fazada quriladi).
- G3 bilan bog'lanish nuqtasi tayyor: post bo'lgan vozvrat kassirda avtomatik
  «to'lanmagan» bo'lib chiqadi (`unpaid-returns` mezoni: posted + qisman/to'lanmagan).
- Akt/statement'da eski `salesReturn` doc-type yorlig'i i18n xaritalarda YO'Q edi
  (mening ishimdan oldingi bo'shliq) — raqam chiqadi, tur yorlig'i «—»; kichik
  follow-up sifatida qo'shsa bo'ladi.

### G0 — Reja tuzildi · 2026-08-23
Reja shu sessiyada tuzildi (kassa exe'dan keyingi bosqich: omborchi mijozlari).
Egasining biznes-qoidalari va Q1 aniqlashtiruvi 1-bo'limda. F-reja bilan ish
bo'linishi 1-bo'lim jadvalida — takrorlanish yo'q. Server-poydevor tahlili
(endpointlar, FSM, auth andozalari) suhbat davomida to'liq o'rganilgan; POS post
hozircha ombor-darajada ayirishi tasdiqlangan (`retail-sale.service.ts:1096` —
deltalarda cellId yo'q, buni F6 to'g'irlaydi).
