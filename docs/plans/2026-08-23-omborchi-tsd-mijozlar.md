# Omborchi va TSD mijozlari — kontrol, vozvrat, TSD APK

> **Yaratilgan:** 2026-08-23 · **Buyurtmachi:** Ozodbek (egasi) · **Holat:** G1 kutilmoqda
> **Ijro tartibi:** har faza ALOHIDA sessiyada. Agent shu faylni va
> `docs/plans/2026-08-23-ombor-restrukturizatsiya.md` ni (F-reja) TO'LIQ o'qiydi,
> O'Z fazasini bajaradi, testlardan o'tkazadi, pastdagi «Hisobotlar»ga yozadi va TO'XTAYDI.
> **O'ZGARMAS QOIDALAR:** F-rejaning 2-bo'limi shu rejaga ham AYNAN tatbiq etiladi
> (bitta sessiya = bitta faza; testlar + i18n ru/uz majburiy; maxfiy ma'lumot yozilmaydi;
> branch/push/deploy retsepti o'sha yerda; jonli bazaga skript avval lokalda).

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
- **Q1 aniqlashtiruvi (F-rejadagi Q1 ustidan, keyingi so'z):** 07-omborda yetmagan
  tovar boshqa ombordan AVTOMATIK ayirilmaydi — bosh omborchiga so'rov boradi, u
  manba yacheykani tanlab TASDIQLAGACH avto-Move (manba ombor → 07) o'tadi va
  ayirish baribir 07 dan bo'ladi. Chek shu paytgacha qoralamada «kutilmoqda» turadi
  (kassir boshqa mijozlar bilan ishlayveradi); smena yopilishida mavjud
  `unresolved` ro'yxati uni baribir ushlaydi.

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
Ikkala rejani to'liq o'qi (omborchi-tsd-mijozlar + ombor-restrukturizatsiya, avvalgi
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
Ikkala rejani to'liq o'qi (avvalgi hisobotlar bilan). Sen G3 fazasini bajarasan
(vozvrat qabul + yorliq). Faqat G3 vazifalari, testlar, deploy, jonli tekshiruv,
hisobot — va TO'XTA.
```

---

### G4 — Yetishmovchilikni bosh omborchi tasdig'i bilan yopish (F5+F6 dan KEYIN)

**Maqsad:** Q1 aniqlashtiruvi (1-bo'lim): omborga yuborilmaydigan sotuvda 07 da
yetmagan tovar — so'rov → bosh omborchi yacheyka tanlab tasdiqlaydi → avto-Move
(manba → 07) → ayirish 07 dan.

**Oldshart:** F5 (split jonlida) va F6 (kaskad dvigateli, rezerv, to'lov-moment)
TUGAGAN bo'lishi kerak — F6 hisobotini o'qi. F6 sof avto-kaskad qurgan bo'lsa,
07dan tashqari qismini shu fazada tasdiq-darvoza orqasiga o'tkaz.

**Vazifalar:**
1. So'rov obyekti: `RestockTask` ustiga yangi tur (`transfer_request`) — chek,
   pozitsiya, yetmagan miqdor; SSE yangi turi bosh omborchiga.
2. Bosh omborchi ekrani: so'rov navbati, tovar bo'yicha omborlar/yacheykalar
   qoldig'i (`GET /pick-lists/cells-by-products` + `StockByCell`), manba yacheyka
   tanlash, TASDIQLASH → avto-Move hujjati (manba ombor+yacheyka → 07) yaratilib
   post bo'ladi. RAD ETISH yo'li ham bo'lsin (kassirga signal — pozitsiya olib
   tashlanadi yoki chek bekor).
3. `MovePosition`ga `cellId` (migratsiya idempotent DDL, F-reja 2.7-qoida;
   inventarizatsiyadagi andoza).
4. Kassir tomoni: chekda «boshqa ombordan kutilmoqda» belgisi, qoralamada qoladi,
   tasdiq/rad SSE bilan jonli yangilanadi; «kutilmoqda» qatori bor chekni post
   qilib bo'lmaydi.
5. Testlar: so'rov→tasdiq→Move→post zanjiri, rad yo'li, cancel teskari yo'li,
   ikki so'rov bitta yacheykaga (poyga).

**Qabul mezoni:** jonlida 07 da yo'q tovar bilan chek ochilib, bosh omborchi
tasdig'idan so'ng ledger'da Move (manba yacheykadan) + 07 dan sotuv ayirmasi
ko'rinadi; tasdiqqacha post bloklangan.

**PROMPT:**
```
Ikkala rejani to'liq o'qi (ayniqsa F5, F6 va G1–G3 hisobotlarini). Sen G4 fazasini
bajarasan (yetishmovchilik tasdiq oqimi). Oldshartlar bajarilmagan bo'lsa foydalanuvchiga
ayt va TO'XTA. Faqat G4 vazifalari, testlar, deploy, jonli tekshiruv, hisobot — va TO'XTA.
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
Ikkala rejani to'liq o'qi (avvalgi hisobotlar bilan). Sen G5 fazasini bajarasan
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
Ikkala rejani to'liq o'qi (ayniqsa G5 va F7 hisobotlarini). Sen G6 fazasini bajarasan
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

### G0 — Reja tuzildi · 2026-08-23
Reja shu sessiyada tuzildi (kassa exe'dan keyingi bosqich: omborchi mijozlari).
Egasining biznes-qoidalari va Q1 aniqlashtiruvi 1-bo'limda. F-reja bilan ish
bo'linishi 1-bo'lim jadvalida — takrorlanish yo'q. Server-poydevor tahlili
(endpointlar, FSM, auth andozalari) suhbat davomida to'liq o'rganilgan; POS post
hozircha ombor-darajada ayirishi tasdiqlangan (`retail-sale.service.ts:1096` —
deltalarda cellId yo'q, buni F6 to'g'irlaydi).
