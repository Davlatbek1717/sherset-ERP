# Omborchi va TSD mijozlari — kontrol, vozvrat, TSD APK

> **Yaratilgan:** 2026-08-23 · **Buyurtmachi:** Ozodbek (egasi) · **Holat:** G1+G2 KOD TAYYOR (deploy kutilmoqda — egasi «keyinroq» dedi; G2 deploy'ida `topup-role-permissions.ts` MAJBURIY — `retailcontrol`)
> **Ijro tartibi:** har faza ALOHIDA sessiyada. Agent shu faylni va
> `docs/plans/2026-08-23-ombor-restrukturizatsiya.md` ni (F-reja) TO'LIQ o'qiydi,
> O'Z fazasini bajaradi, testlardan o'tkazadi, pastdagi «Hisobotlar»ga yozadi va TO'XTAYDI.
> **O'ZGARMAS QOIDALAR:** F-rejaning 2-bo'limi shu rejaga ham AYNAN tatbiq etiladi
> (bitta sessiya = bitta faza; testlar + i18n ru/uz majburiy; maxfiy ma'lumot yozilmaydi;
> branch/push/deploy retsepti o'sha yerda; jonli bazaga skript avval lokalda).
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

> 🔴 **2026-08-24 HODISASI — bu fazaning ahamiyati o'zgardi.** F5 split jonlida
> bajarilgan edi-yu, AYNAN shu faza (G4) yo'qligi sabab kassa to'xtab qoldi:
> tovar «Ombor 02» ga ko'chgach POS unga yeta olmadi (avto-ayirish yo'q, tasdiq
> oqimi ham yo'q) va split shoshilinch QAYTARILDI. Ya'ni **G4 endi F5 ning
> oldsharti** ham (yoki uning o'rnini bosuvchi yechim — Ombor 07 ga o'tish yoki
> vaqtinchalik avto-kaskad). Batafsil, egasiga savol (S1) va qayta yuritish
> shartlari: **`docs/plans/2026-08-24-split-kassa-hodisasi.md`** (H4 fazasi).

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

### G1 — Vozvrat pulini kassadan qaytarish · 2026-08-24 · `8b39a083`

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
