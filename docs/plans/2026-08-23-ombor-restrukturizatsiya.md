# Ombor restrukturizatsiyasi — 7+ fizik ombor, yacheyka-birinchi hisob

> **Yaratilgan:** 2026-08-23 · **Buyurtmachi:** Ozodbek (egasi) · **Holat:** F1–F6 va F8 TUGADI (F8 jonlida 2026-08-24); F7 kodi `afd27a47` jonlida, lekin F7 HISOBOTI hali yozilmagan (o'z sessiyasi yozsin)
> **Ijro tartibi:** har faza ALOHIDA sessiyada. Agent shu faylni o'qiydi, O'Z fazasini bajaradi, testlardan o'tkazadi, pastdagi «Hisobotlar»ga yozadi va TO'XTAYDI.

---

## 1. Kontekst (nega bu reja)

- Tizim `D:\sherset-v2` (erp.sherset.uz, VPS'da `/var/www/sherset-v2`, baza `sherset_v2`).
  GitHub: `Davlatbek1717/sherset-ERP` (origin, faqat o'qish) + `Mirfayz1993/sherset-ERP`
  (push shu yerga, branch `yacheyka-inventarizatsiya`).
- **Egasining dizayn tamoyili (2026-08-23): MoySklad-parity MAQSAD EMAS.** Mezon —
  Sherset omborchisiga qulaylik. Eski koddagi «moysklad parity» izohlari tarix, yangi
  qarorlar uchun argument emas.
- **Yacheyka kodi semantikasi:** `01-02-03-04` = ombor raqami · stelaj raqami ·
  stelaj qavati · qavatda o'ngdan o'rin. Birinchi segment omborni belgilaydi.
- **Fizik omborlar 7 ta** (01…07) va soni o'sadi — katta omborchi yangi omborni
  O'ZI qo'sha olishi kerak (bu funksiya, admin-migratsiya emas).
- **Joriy holat (2026-08-23 o'lchandi):** tizimda BITTA Store («Ombor 2»,
  `968f9da2-6dbb-4375-b5e2-d19799b51de6`). 410 yacheyka: prefiks `01-` — 119 ta,
  `02-` — 291 ta (03…07 omborlar raqamlashtirilmagan). Zonalar chalkash: «01» 44,
  «02» 106, «03» 35, «04» 56 yacheyka + 169 ta zonasiz — zonalar stelaj/ombor
  aralash, ishonchsiz; yagona ishonchli manba — YACHEYKA KODI PREFIKSI.
  Qoldiq: ombor jami ≈52,5 mln dona, yacheykalarga biriktirilgani ≈2,95 mln (~6%).
- **Inventarizatsiya qoidasi (2026-08-23, `87cb45d0`):** sanash FAQAT yacheyka
  kesimida; qoralamada ombor-tab ma'lumot xolos; hujjatga faqat cellId'li qatorlar
  yoziladi. Bu qoida saqlanadi — yangi ish uni buzmasligi shart.
- 00112 hodisasi saboqlari: bekor qilish (cancel) deltalarni aynan qaytaradi —
  jonli isbotlangan; ikki joyda kiritish tuzog'i yopilgan.

## 2. O'ZGARMAS QOIDALAR (har sessiya uchun)

1. **Bitta sessiya = bitta faza.** Faza tugagach agent KEYINGISINI BOSHLAMAYDI —
   hisobot yozadi va to'xtaydi. Sabab: kontekst o'sishi bilan token sarfi oshadi.
2. Ishni boshlashdan avval: shu faylni TO'LIQ o'qi (ayniqsa avvalgi fazalar
   hisobotlarini), o'z fazang vazifalaridan tashqariga chiqma.
3. **Testlar majburiy:** typecheck (api'da OOM bo'lsa
   `NODE_OPTIONS=--max-old-space-size=8192`), `apps/api` va `apps/web` vitest
   (kamida o'z moduling + i18n gate'lar: `i18n-key-existence`, `i18n-no-hardcoded`),
   yangi mantiqqa yangi testlar. Barcha matnlar i18n orqali (ru+uz).
4. **Hisobot majburiy:** ish oxirida shu faylning «Hisobotlar» bo'limiga o'z
   fazang ostiga yoz: nima qilindi (fayllar, commitlar), test natijalari (raqam
   bilan), deploy holati, ochiq qolganlar, keyingi fazaga eslatmalar.
5. **Maxfiy ma'lumot bu faylga YOZILMAYDI** (repo public!): parollar, tokenlar,
   loginlar taqiqlangan. VPS/sayt kirishlari kerak bo'lsa foydalanuvchidan so'raladi.
6. Git: commitlar `yacheyka-inventarizatsiya` branch'ida (yoki undan davom),
   push → `mirfayz` remote (`Mirfayz1993/sherset-ERP`). Pre-push hook typecheck
   yuritadi — OOM'da NODE_OPTIONS bilan.
7. **Jonli bazaga yozadigan har qanday skript avval LOKAL dev bazada sinaladi.**
   Lokal dev: `sherset_v2_dev` @ localhost (postgres 18, `pg_trgm` kerak);
   v2 migratsiya zanjiri bo'sh bazada replay BO'LMAYDI — `prisma db push` ishlatiladi.
   Yangi migratsiyalar idempotent DDL (IF NOT EXISTS / DO-EXCEPTION) bo'lsin va
   VPS'da `prisma db execute --file` + `prisma migrate resolve --applied` bilan beriladi.
8. Deploy retsepti (VPS): foydalanuvchidan parol so'rab paramiko orqali —
   `git fetch <mirfayz-url> <branch>:tmp && git merge --ff-only tmp` →
   (migratsiya bo'lsa: db execute + resolve + `prisma generate`) →
   `nohup corepack pnpm build:web` (BUILD_RC poll) → `pm2 restart sherset-v2-web`
   (+ api o'zgargan bo'lsa `sherset-v2-api`) → jonli verify (sahifa 200, chunk marker).
   Diqqat: SSH'da ko'p muvaffaqiyatsiz urinish fail2ban banga olib boradi.
9. Ishlar faqat `D:\sherset-v2` da. Boshqa loyihalarga (VPS'dagi biznesjon,
   global-erp, sherset-servis, akademiya…) TEGILMAYDI.

## 3. Maqsad-arxitektura (hamma faza shu tomon boradi)

| Egasida | Kod segmenti | Tizimda |
|---|---|---|
| Ombor (7+, o'sadi) | 1-chi | `Store` («Ombor 01», «Ombor 02», …) |
| Stelaj | 2-chi | `StoreZone` (ombor ichida, nomi «01», «02», …) |
| Qavat + o'rin | 3–4-chi | yacheyka kodida (`StoreCell.name` to'liq kod) |

- Yacheykaga biriktirilmagan qoldiq — «Taqsimlanmagan» hovuzda ko'rinadi va
  jamoa uni sanash/joylashtirish bilan haqiqiy omborlarga o'tkazib boradi.
- Bitta yacheykada ko'p tovar va bitta tovar ko'p yacheykada — qo'llanadi (hozir ham bor).
- Umumiy (jami) qoldiq har doim ko'rinadi: omborlar kesimi + JAMI qatori.

## 4. Qarorlar (egasi javob berdi, 2026-08-23)

- **Q1 ✅ Kassa/sotuv ayirish siyosati:** tovar **eng yaqin ombordan** ayiriladi —
  **1-navbatda Ombor 07**, yetarli bo'lmasa qolgan omborlardan kaskad bilan.
  Ayirish momenti — **pul to'langanda** (chek yaratilganda emas). Batafsil: F6.
- **Q2 ✅ Katta omborchi ALOHIDA o'rnatiladigan dasturda ishlaydi** (kassa kabi
  .exe) — F8 bajariladi, bekor qilinmaydi.

---

## 5. FAZALAR

### F1 — Qoldiq ko'rinishlari: ombor-kesim (ma'lumot KO'CHIRILMAYDI)

**Maqsad:** hech narsani ko'chirmasdan, yacheyka kodi prefiksidan hisoblab,
foydalanuvchiga «alohida omborlar + umumiy» ko'rinishni berish.

**Vazifalar:**
1. Tovar kartasi «Qoldiqlar» tabi: ombor qatori ostida yacheykalar kesimi
   (qaysi yacheykada nechta; prefiks bo'yicha «Ombor 01/02» guruhlab), va
   «yacheykalarga biriktirilmagan» qoldiq qatori. API: mavjud
   `GET /admin/stores/:id/address-storage?assortmentKind&assortmentId` yoki
   `StockService.getCellsHoldingProduct` ustiga yengil endpoint.
2. «Qoldiqlar» hisoboti (`/reports/stock-balance` sahifasi): prefiks bo'yicha
   guruhlash rejimi — Ombor 01 / Ombor 02 / Taqsimlanmagan / JAMI.
3. i18n ru+uz, testlar (api hisob-mantiq testi + web render/i18n).

**Qabul mezoni:** tovar kartasida yacheyka kesimi ko'rinadi; hisobotda 01/02/
taqsimlanmagan/jami raqamlari DB'dagi haqiqiy sonlarga teng (test bilan qulflangan).

**PROMPT (yangi sessiyaga ko'chirib qo'ying):**
```
D:\sherset-v2 dagi docs/plans/2026-08-23-ombor-restrukturizatsiya.md rejasini to'liq o'qi.
Sen F1 fazasini bajarasan (qoldiq ko'rinishlari: ombor-kesim, ma'lumot ko'chirilmaydi).
Reja qoidalariga qat'iy amal qil: faqat F1 vazifalari, barcha testlar, deploy va jonli
tekshiruv, so'ng reja oxiridagi Hisobotlar bo'limiga to'liq hisobot yozib TO'XTA —
keyingi fazani boshlama.
```

---

### F2 — Inventarizatsiyada «+ Yacheyka qo'shish»

**Maqsad:** omborchi tizim bilmagan yacheykaga ham tovarni sanab kirita olsin
(masalan tovar aslida 03-… yacheykada yotgan bo'lsa). Bu 03…07 omborlarni
raqamlashtirishda ham asosiy vosita bo'ladi.

**Vazifalar:**
1. Inventarizatsiya hujjatining yacheyka tabida: tovar guruhida «+ Yacheyka»
   amali — yacheyka tanlagich (mavjud `cell-picker-field.tsx` komponenti asos)
   yoki kod terish (skaner-do'st: `01-02-03-04` formati, mavjud bo'lmasa aniq xato).
2. Tanlangan (tovar × yacheyka) yangi qator bo'lib qo'shiladi, expected=0 dan
   sanaladi (backend allaqachon qo'llaydi — 2026-08-22 smoke'da isbotlangan).
3. «Faqat yacheyka» qoidasi buzilmasin; i18n ru+uz; web testlar.

**Qabul mezoni:** jonli muhitda tovar ilgari ro'yxatda bo'lmagan yacheykaga
kiritilib, post'da o'sha yacheykaga qoldiq yozilishi tekshirilgan.

**PROMPT:**
```
D:\sherset-v2 dagi docs/plans/2026-08-23-ombor-restrukturizatsiya.md rejasini to'liq o'qi
(avvalgi hisobotlar bilan). Sen F2 fazasini bajarasan (inventarizatsiyada «+ Yacheyka
qo'shish»). Faqat F2 vazifalari, testlar, deploy, jonli tekshiruv, hisobot — va TO'XTA.
```

---

### F3 — Yangi omborni raqamlashtirish vositasi (katta omborchi uchun)

**Maqsad:** katta omborchi yangi omborni O'ZI qo'shsin: ombor raqami + har
stelaj uchun qavat/o'rin sonlari → yacheykalar ommaviy yaratiladi.

**Vazifalar:**
1. Ombor kartasida (yoki Omborlar sahifasida) «Yangi ombor raqamlashtirish»
   oqimi: ombor raqami (masalan 03), stelajlar soni, har stelajda qavatlar,
   har qavatda o'rinlar → `NN-SS-QQ-OO` kodli yacheykalar generatsiyasi
   (mavjud `bulkCreateCells` range-generator + dryRun asos bo'ladi).
2. Zona = stelaj: generatsiya har stelaj uchun zona yaratadi/bog'laydi.
3. Ruxsat: katta omborchi roli uchun (permission entity'lar ro'yxatiga to'g'ri
   qo'shish — `permissions.types` + service + roles + templates, qo'riqchi testlari bor).
4. Hozircha yacheykalar joriy yagona Store ichida yaratiladi (F5 split'i ularni
   prefiks bo'yicha o'z omboriga olib ketadi) — bu hisobotda aniq yozilsin.
5. i18n ru+uz; api+web testlar (generator chegaralari, dublikat kod, dryRun).

**Qabul mezoni:** jonli muhitda katta omborchi (yoki admin) 03-omborni bir
oqimda raqamlashtira oladi; dublikat/xato kiritish himoyalangan.

**PROMPT:**
```
D:\sherset-v2 dagi docs/plans/2026-08-23-ombor-restrukturizatsiya.md rejasini to'liq o'qi
(avvalgi hisobotlar bilan). Sen F3 fazasini bajarasan (yangi omborni raqamlashtirish
vositasi). Faqat F3 vazifalari, testlar, deploy, jonli tekshiruv, hisobot — va TO'XTA.
```

---

### F4 — Ombor-split migratsiyasi: skript + LOKAL dry-run (jonliga TEGILMAYDI)

**Maqsad:** «bitta Store» holatidan «har fizik ombor alohida Store» holatiga
o'tkazadigan, qayta yugurtirsa buzmaydigan (idempotent) migratsiya skriptini
yozish va lokal dev bazada to'liq isbotlash.

**Eslatma:** Q1 hal bo'lgan (4-bo'lim): kassa kaskadi F6 da quriladi; F4/F5 esa
split o'tgunga qadar kassa UZLUKSIZ ishlashini ta'minlaydi (sozlama vaqtincha
«Taqsimlanmagan»da qoladi — id o'zgarmagani uchun hech narsa buzilmaydi).

**Vazifalar:**
1. Skript (packages/db ichida, `node scripts/…` bilan yuritiladigan):
   - prefikslar bo'yicha `Store` yozuvlari («Ombor 01», «Ombor 02», … faqat
     mavjud prefikslar uchun) yaratadi;
   - `StoreCell` + zonalarni (zona=stelaj, 2-segment) o'z omboriga ko'chiradi,
     169 zonasiz va 03/04 chalkash zonalarni kod bo'yicha to'g'rilaydi;
   - `StockByCell` qatorlarini yacheykasi bilan birga ko'chiradi;
   - har ko'chgan miqdor uchun `Stock` (ombor jami) va ledger'ga
     (`stock_operations`, docType masalan `warehouse_split`) halol yozuv beradi —
     eski Store'dan chiqim, yangi Store'ga kirim, JAMI o'zgarmasligi INVARIANT;
   - yacheykasiz qoldiq joriy Store'da qoladi, Store «Taqsimlanmagan» deb
     qayta nomlanadi (id O'ZGARMAYDI — hujjatlar tarixi va sozlamalar buzilmasin);
   - Q1 javobiga ko'ra kassa/sotuv sozlamalari rejasi hisobotga yoziladi.
2. Dry-run rejimi: hech nima yozmay to'liq hisob-kitob va farqlar ro'yxati.
3. Lokal isbot: `sherset_v2_dev`ga jonli bazaning yangi dump'ini yuklab
   (foydalanuvchi paroli bilan VPS'dan olinadi), skript yuritiladi, invariantlar
   test bilan tekshiriladi: Σqoldiq oldin==keyin, Σyacheyka==o'z ombori Stock ichida,
   hisobotlar to'g'ri.
4. Hisobotga: dry-run raqamlari (nechta yacheyka/qator/dona qaysi omborga) kiradi.

**Qabul mezoni:** lokal dump ustida split muvaffaqiyatli, invariant-testlar yashil,
skript ikki marta yuritilsa ikkinchi yugurish no-op.

**PROMPT:**
```
D:\sherset-v2 dagi docs/plans/2026-08-23-ombor-restrukturizatsiya.md rejasini to'liq o'qi
(avvalgi hisobotlar bilan). Sen F4 fazasini bajarasan (ombor-split migratsiya skripti +
LOKAL dry-run; jonli bazaga yozish TAQIQLANGAN). Avval foydalanuvchidan Q1 javobini ol.
Faqat F4 vazifalari, testlar, hisobot — va TO'XTA.
```

---

### F5 — Jonli split (deploy) + verifikatsiya

**Maqsad:** F4 skriptini jonli bazada yuritish va tizimni yangi tuzilmada
to'liq ishlar holatda topshirish.

**Vazifalar:**
1. Tayyorgarlik: jonli bazadan yangi dump (zaxira) olinadi va saqlanadi;
   foydalanuvchi bilan qisqa «to'xtash oynasi» kelishiladi (ish soatidan tashqari).
2. Skript jonli bazada (avval dry-run, keyin real), invariantlar joyida tekshiriladi.
3. Q1 bo'yicha kassa/sotuv sozlamalari yangilanadi; POS jonli sinov (bitta sotuv).
4. UI tekshiruvlari: Omborlar ro'yxatida yangi omborlar, tovar kartasi, qoldiq
   hisoboti, inventarizatsiya yangi omborda, yacheyka skaneri.
5. F1 dagi prefiks-hisoblar endi haqiqiy Store kesimiga o'tadi (kod soddalashishi
   mumkin — moslashtir).

**Qabul mezoni:** jonli muhitda omborlar alohida, jami qoldiq o'zgarmagan
(raqam bilan isbot), kassa sotuvi ishlaydi, inventarizatsiya yangi omborda o'tadi.

**PROMPT:**
```
D:\sherset-v2 dagi docs/plans/2026-08-23-ombor-restrukturizatsiya.md rejasini to'liq o'qi
(ayniqsa F4 hisobotini). Sen F5 fazasini bajarasan (jonli split + verifikatsiya).
Jonli ishga kirishdan avval foydalanuvchidan ruxsat va VPS parolini ol, zaxira dump ol.
Faqat F5 vazifalari, verifikatsiya, hisobot — va TO'XTA.
```

---

### F6 — Kassa: kaskadli ayirish (07 → boshqa omborlar) va to'lov paytida ayirish

**Maqsad:** egasining Q1 qarori (4-bo'lim) joriy etilsin: sotuvda tovar avval
**Ombor 07** dan, yetmasa qolgan omborlardan kaskad bilan ayirilsin; ayirish
**pul to'langan paytda** sodir bo'lsin.

> **⚠️ Q1 aniqlashtiruvi (egasi, 2026-08-23, keyingi so'z):** 07 dan tashqari
> omborlardan ayirish AVTOMATIK EMAS — bosh omborchi tasdig'i orqali (so'rov →
> yacheyka tanlab tasdiqlash → avto-Move 07 ga → ayirish 07 dan). Tasdiq oqimining
> o'zi `docs/plans/2026-08-23-omborchi-tsd-mijozlar.md` G4 fazasida quriladi;
> F6 esa dvigatelni (rezerv, to'lov-moment, 07 dan yacheyka-kesim ayirish) shunday
> qursinki, 07 dan tashqariga chiqish nuqtasi G4 darvozasiga ulanadigan bo'lsin.

**Vazifalar:**
1. Tadqiqot (hisobotga yoziladi): hozir chakana sotuv qoldiqni QACHON ayiradi
   (chek yaratilganda / yopilganda / to'lovda) va qanday rezerv mexanizmi bor —
   `retail-sale`, `retail_sale_payments`, qarzga sotuv (`debt`) oqimlarini o'rgan.
2. Kaskad siyosati: sotuv pozitsiyasi uchun ombor tanlash tartibi 07 → qolganlari
   (tartib sozlanadigan bo'lsin — masalan Store'da `sortOrder`/prioritet maydoni);
   qisman yetishmasa bir pozitsiya bir nechta ombordan bo'linib ayirilishi mumkin.
3. To'lov momenti: to'liq to'lov kelganda ayirish; qarzga/qisman to'lovda qanday
   bo'lishini egasidan aniqlab (bitta savol), shunga mos qur. To'lovgacha tovar
   «sotib qo'yilmasligi» uchun rezerv (StockReservation) ishlatilsin.
4. Yacheyka kesimi: ayirish yacheykalardan to'g'ri ketsin (mavjud avto-ayirish
   katta-birinchi mantiqi ombor ichida ishlayveradi).
5. Testlar: kaskad taqsimot (yetarli/yetarsiz/bo'lingan), to'lov-moment,
   bekor qilish/qaytarish teskari yo'li.

**Qabul mezoni:** jonli sinovda 07-omborda yetarli tovar bo'lsa faqat undan,
yetmasa keyingi ombordan ayirlgani ledger'da ko'rinadi; to'lovsiz chek qoldiqni
kamaytirmaydi (faqat rezerv qiladi).

**PROMPT:**
```
D:\sherset-v2 dagi docs/plans/2026-08-23-ombor-restrukturizatsiya.md rejasini to'liq o'qi
(ayniqsa F5 hisobotini). Sen F6 fazasini bajarasan (kassa kaskadli ayirish + to'lov
paytida ayirish). Faqat F6 vazifalari, testlar, deploy, jonli tekshiruv, hisobot — va TO'XTA.
```

---

### F7 — Omborlararo kundalik oqimlar

**Maqsad:** split'dan keyingi kundalik ish qulay bo'lsin.

**Vazifalar:**
1. «Taqsimlanmagan»dan haqiqiy omborga joylashtirish oqimi: sanash/skan bilan
   tovar yacheykaga qo'yilganda qoldiq Taqsimlanmagan'dan o'sha omborga ko'chsin
   (omborlararo avto-ko'chirish hujjati yoki to'g'ri delta juftligi bilan).
2. Omborlararo ko'chirish (Move) oqimi yacheyka-darajada tekshirilib sozlanadi.
3. Qoldiq/aylanma hisobotlarida ombor filtri va JAMI qatori sayqallanadi.
4. Omborchi ekranlari (skaner, joylashtirish, yig'ish) yangi tuzilmada sinovdan o'tadi.

**Qabul mezoni:** omborchi «tovarni sanadim → tizim o'zi to'g'ri omborga o'tkazdi»
oqimini bitta amal bilan bajara oladi; hisobotlar to'g'ri.

**PROMPT:**
```
D:\sherset-v2 dagi docs/plans/2026-08-23-ombor-restrukturizatsiya.md rejasini to'liq o'qi
(avvalgi hisobotlar bilan). Sen F7 fazasini bajarasan (omborlararo kundalik oqimlar).
Faqat F7 vazifalari, testlar, deploy, jonli tekshiruv, hisobot — va TO'XTA.
```

---

### F8 — Katta omborchi .exe dasturi

**Maqsad:** Q2 qarori (4-bo'lim): katta omborchi ALOHIDA o'rnatiladigan dasturda
ishlaydi — omborchi ekranlari (skaner, inventarizatsiya, joylashtirish, ombor
raqamlashtirish) kassa singari Electron o'ramda beriladi.

**Vazifalar:**
1. Mavjud kassa Electron o'rami qanday qurilganini o'rgan (yangilanish kanali
   `/downloads/` — kassa-downloads naqshi) va omborchi uchun shunga o'xshash
   o'ram qur: erp.sherset.uz omborchi rejimida ochiladi, faqat tegishli bo'limlar.
2. Avto-yangilanish kanali (alohida katalog, masalan omborchi-downloads).
3. O'rnatuvchi .exe yig'ish va VPS'ga joylash; skanerlar (klaviatura-wedge) va
   kamera skaneri ishlashi tekshiriladi.

**Qabul mezoni:** katta omborchi kompyuteriga o'rnatib, login qilib, yangi ombor
raqamlashtirish va inventarizatsiya qila oladi; yangilanish avto keladi.

**PROMPT:**
```
D:\sherset-v2 dagi docs/plans/2026-08-23-ombor-restrukturizatsiya.md rejasini to'liq o'qi
(avvalgi hisobotlar bilan). Sen F8 fazasini bajarasan (katta omborchi .exe dasturi).
Faqat F8 vazifalari, testlar, deploy, jonli tekshiruv, hisobot — va TO'XTA.
```

---

## 6. HISOBOTLAR (har faza o'z hisobotini SHU YERGA yozadi)

> Shablon: **Faza · sana · commit(lar)** — nima qilindi (fayl ro'yxati bilan qisqa),
> test natijalari (raqamlar), deploy holati (jonli tekshiruv dalili), ochiq qolganlar,
> keyingi fazaga eslatmalar.

### F8 — Katta omborchi .exe dasturi · 2026-08-24 · `83027bc2`

**Yondashuv:** alohida papka EMAS — mavjud kassa Electron o'ramiga (desktop/)
**rejim** qo'shildi: bitta jang-sinovidan o'tgan kod bazasi, ikki dastur.
Rejim manbasi `desktop/mode.js`: paketlangan package.json'dagi `shersetMode`
(electron-builder `extraMetadata` yozadi) yoki `SHERSET_SHELL_MODE` env (dev);
preload'ga `additionalArguments` (`--sherset-shell-mode=`) bilan yetadi
(sandbox package.json o'qiy olmaydi).

**«Sherset Omborchi» qobig'i (kassadan farqlari):**
- ODDIY ramkali maksimal oyna (kiosk EMAS); Alt+F4/Ctrl+W bloklanmaydi;
  «X» bilan yopishda tayyor yangilanish o'rnatiladi (quitShell→installOnQuit).
- Kirish `/omborchi` (sessiya bo'lmasa web /login ga olib boradi va qaytaradi);
  boot-yangilanish sharti /login yoki /omborchi pathname.
- Kiosk yordamchilar (chiqish-imosi, suzuvchi uchlik, ekran klaviaturasi,
  zoom-qulf) O'RNATILMAYDI; avtoyuklanish va powerSaveBlocker ham yo'q.
- Kamera skaneri uchun media ruxsati FAQAT o'z serverimiz sahifalariga
  (`setPermissionRequestHandler`); klaviatura-wedge skaner oddiy kiritish.
- Chop etish ko'prigi (printSheet — yig'ish varag'i/etiketka) SAQLANADI.
- userData `%APPDATA%/Sherset Omborchi` (kassa `@moysklad/desktop`dan alohida).

**Muhim web tuzatish:** preload endi `shellKind` beradi; `pos-device.ts →
isShersetShell()` FAQAT kassa qobig'ida true (omborchi .exe ichida ilgari
/kassa-kirish PIN ekrani + kiosk-ko'rinish ochilib qolardi — (app)/layout:69,752).
Eski kassa exe'lari (≤1.9.0, shellKind yo'q) kassa deb taniladi — orqaga mos.

**Yig'ish:** `desktop/omborchi.builder.json` (appId `uz.sherset.omborchi`,
artifact `Sherset-Omborchi-Setup-${version}.exe`, chiqish `dist-omborchi/`,
publish `/downloads/omborchi/`, per-user NSIS) + `pnpm run dist:omborchi`.
Versiya extraMetadata'da (hozir **1.0.0**) — kassa versiyasidan mustaqil.
Ikonka: eski D:\sherset o'chirilishi bilan `build/icon.ico` YO'QOLGAN edi —
omborchi uchun deterministik generator yozildi
(`desktop/tools/icon/gen-omborchi-icon.js`, kutubxonasiz, toza klonda tiklanadi);
kassa ikonkasi hali ham yo'q (keyingi kassa build'idan oldin tiklash kerak!).
`pnpm.onlyBuiltDependencies=[electron]` — postinstall endi approve-builds'siz.

**Testlar:** yangi `omborchi-installer-config.test.ts` 28 + pos-device shellKind 5;
kassa qo'riqchilari (installer 34, bridge-contract 89, touch-keyboard 44,
window-controls 20, kiosk 26) o'zgarishsiz yashil. Web TO'LIQ: 321 fayl /
4258 passed / 0 failed (i18n gate'lar ichida); turbo typecheck 10/10.
Paketlangan smoke (win-unpacked, shu mashina): v1.0.0 ishga tushdi, kanal
`https://erp.sherset.uz/downloads/omborchi/` so'raldi (rejim simlari to'g'ri),
404 jim yutildi, userData ajralgan. ⚠️ Bash muhitida `ELECTRON_RUN_AS_NODE`
o'rnatilgan — exe'ni sinashda `env -u ELECTRON_RUN_AS_NODE` shart.

**Deploy (2026-08-24):** VPS ff-merge `0f4bda63` → **`83027bc2`** (F7 `afd27a47`
+ follow-up `8e0d081e` birga ketdi — F5 dagi F1+F2+F3 naqshidek); build:web
RC=0; pm2 restart web+api; health OK; sahifalar `/`, `/login`, `/omborchi`,
`/stores`, `/inventories`, `/cell`, `/reports/stock-balance` — hammasi 200;
`shellKind` markeri jonli chunk'larda (layout, kassa-kirish, sotuv).
**Kanal:** `/var/www/kassa-downloads/omborchi/` yaratildi (nginx `location
/downloads/` allaqachon butun katalogni beradi — konfiguratsiya o'zgarmadi);
exe (81 926 659 bayt) SFTP bilan uzilishsiz yuklandi, remote sha512 == lokal ==
latest.yml (`1ukUmkar…Zhw==`); HTTPS: latest.yml 200 (`version: 1.0.0`), exe
HEAD 200 + Accept-Ranges. Yuklash tartibi: exe → blockmap → latest.yml OXIRIDA.

**Ochiq qolganlar / eslatmalar:**
- **Qurilma-QA egasida** (kassa relizlari naqshidek): katta omborchi PC'siga
  o'rnatish (SmartScreen → «Подробнее» → «Все равно запустить», UAC yo'q),
  login, ombor raqamlashtirish + inventarizatsiya sinovi, klaviatura-wedge va
  kamera skaneri, keyingi versiyada avto-yangilanish o'tishi. Yuklab olish:
  https://erp.sherset.uz/downloads/omborchi/Sherset-Omborchi-Setup-1.0.0.exe
- F7 hisoboti yozilmagan (kodi `afd27a47` shu deploy bilan jonliga chiqdi,
  testlari commit-xabarida yashil) — F7 sessiyasi hisobotini yozsin; jonli
  F7-tekshiruvlar (joylashtirish oqimi, hovuz-ombor sozlamasi) ham o'sha yerda.
- Kassa `build/icon.ico` yo'qolgan — keyingi kassa build'idan OLDIN tiklash
  kerak (kanaldagi 1.9.0 exe'dan ajratib olish yoki yangi ikonka).
- Omborchi versiyasini ko'tarish retsepti: desktop/README.md «IKKI DASTUR»
  bo'limi (extraMetadata.version + README artefakt nomi + kanalga tartibli
  yuklash).

### F6 — Kassa: kaskadli ayirish + to'lov paytida ayirish · 2026-08-24 · `3ec48ae2` + `9c99bb29` + merge `0f4bda63`

**1-vazifa, tadqiqot (chakana sotuv qoldiqni qachon ayiradi):** ayirish
ALLAQACHON to'lov momentida — `post()` to'lovni tekshiradi (naqd+karta+
terminal+qarz ≥ jami, aks holda 400) va AYNI tranzaksiyada stok kaskadini
yozadi. `draft/picking/ready` ayirmaydi; `send-to-picking` → StockReservation
`reserve` (H5), `cancel` → `release_cancel`, `post` → `release_consume`.
Ya'ni «to'lovsiz chek qoldiqni kamaytirmaydi (faqat rezerv)» qabul mezoni
F6'dan OLDIN ham bajarilgan — bu bandda kod o'zgartirilmadi. **Qarz sotuv:**
chek qarz bilan yopilganda ham post'da ayiriladi (tovar mijoz bilan ketadi) —
**egasi tasdiqladi (2026-08-24): hozirgidek qoladi** (rejadagi «bitta savol»).

**Kaskad dvigateli (yangi `retail-stock-cascade.ts`, sof modul):**
- Prioritet — `Store.attributes.__posPriority` (musbat butun; 1 = birinchi;
  null = kaskadda EMAS). Migratsiya YO'Q — `__yacheyka`/attributes naqshi.
- `orderCascadeStores` (prioritet ↑, teng bo'lsa nom), `allocateAcrossStores`
  (micro-BigInt, pozitsiya bir nechta omborga bo'linadi, yetmagani shortfall).
  Testlar: 12 (sof) + 6 (wiring).
- **Wiring (`retail-sale.service`):** post/sendToPicking stok ombori =
  kaskadning BIRINCHI ombori; kaskad sozlanmagan akkauntda — smena ombori
  (xulq baytma-bayt eski). Yetmasa `assertAvailableCascade` 400 ichida
  `details.cascadePlan` (qolgan kaskad omborlaridan qaysi biridan qancha
  olish mumkin) + «bosh omborchi tasdig'i kerak» xabari — **bu G4
  darvozasining ulanish nuqtasi; 07 dan tashqari ombordan AVTOMATIK ayirish
  YO'Q (Q1 aniqlashtiruvi).** post() rezerv qatorlari qaysi omborlarda bo'lsa
  o'shalarni ham qulflab bo'shatadi; cancel ham rezerv qatorlari ombori
  bo'yicha; refund kirimi kaskad omboriga. Yacheyka-kesim: mavjud
  katta-birinchi avto-ayirish ombor ichida o'zgarishsiz ishlayveradi.
- **Store API/UI:** `store.schema` `posPriority` (int ≥1 | null), service
  o'qishda lift / yozishda attributes'ga; ombor kartasida «Kassa prioriteti
  (POS)» maydoni; i18n ru+uz.

**Testlar:** yangi 20+ (dvigatel 12, wiring 6, store schema, web store-card 2);
TO'LIQ: api 614 fayl / 8564 passed; web 309 fayl / 4169 passed (birinchi
yugurishdagi 4-6 xato parallel-yuklama flake'i — alohida/toza yugurishda 0);
turbo typecheck 10/10; i18n gate'lar yashil.

**Deploy (2026-08-24):** VPS'da yana chetki holat: HEAD `8cec65ad` — boshqa
ish oqimi (tovar-tuzatishlar, climart-adoption) F5 `6a9caa8d` ni O'ZIga merge
qilib deploy qilgan (bu safar reset EMAS — tarix saqlangan). Yechim:
`origin/climart-adoption` lokalga merge (`0f4bda63`, konflikt faqat
docs/progress.json — ours) → push mirfayz → VPS ff-merge `0f4bda63` →
`build:web` RC=0 → pm2 restart web+api → sahifalar `/`, `/login`, `/stores`,
`/sotuv`, `/reports/stock-balance`, `/inventories` hammasi 200, api toza
ko'tarildi (error yo'q).

**Jonli sozlama:** `Taqsimlanmagan`.attributes.__posPriority = 1 (UPDATE 1,
tekshirildi: boshqa omborlarda pp yo'q). Kaskad birinchi ombori == smena
ombori ⇒ jonli xulq HOZIRCHA aynan avvalgidek (xavfsiz yoqish) — lekin endi
yangi kaskad-yo'l orqali. **Ombor 07 raqamlashtirilib (F3 vositasi) unga
posPriority=1 berilsa (Taqsimlanmaganni 2 ga surish/olib tashlash bilan) POS
07 dan ayiradi** — ombor kartasidagi maydon orqali, kod kerak emas.

**Ochiq qolganlar / keyingi fazalarga:**
- «07 dan ayirilgani ledger'da» jonli isboti Ombor 07 yaratilgach bir sotuv
  bilan tekshiriladi (hozir 07 yo'q — bu ish egasi/F7 da).
- G4 (omborchi-tsd rejasi): so'rov-oqimi `assertAvailableCascade` ning 400
  javobidagi `cascadePlan` ga ulanadi.
- Birinchi real sotuvni tekshirish tavsiyasi kuchda (F5 dagi kabi).
- F3 follow-up (TOPUP_ENTITIES'dan warehousenumbering'ni olib tashlash) hali
  turibdi.

### F5 — Jonli split + verifikatsiya · 2026-08-23 · `bd58988f` (+ hisobot commiti)

**⚠️ Kutilmagan hodisa — VPS reset:** F5 boshlanganda VPS `climart-adoption`
branch'i bugun 12:55 (+02) da Davlatbek tomonidan `f41bf559` (kassa smena-qaytarish
fix'i, bizning tarixda YO'Q edi) ga **reset qilinib qayta build qilingan** — bu
2026-08-22/23 dagi yacheyka-inventarizatsiya deploylarini (fe361abf, bebd335d,
87cb45d0) ishlab turgan koddan chiqarib yuborgan edi (DB migratsiyasi joyida
qolgan). Yechim: `f41bf559` lokal branch'ga merge qilindi (`bd58988f`, konflikt
faqat docs/progress.json — ours) — hech ikkala ish oqimi ham yo'qolmadi.
**Saboq: Davlatbek bilan deploy tartibini kelishish kerak** — u reset ishlatadi,
navbatdagi reset bizning ishni yana uchirib yuborishi mumkin.

**Zaxira (split'dan OLDIN):** VPS `/root/sherset_v2-pre-split-20260823.dump`
(6.9M, attachments-data'siz) + `/root/sherset_v2-pre-split-FULL-20260823.dump`
(1.4G, to'liq); yengil nusxa lokalda ham: `D:\sherset-v2-backups\`.

**Deploy (F1+F2+F3+F4 + kassa-fix birga):** ff-merge → VPS HEAD `bd58988f`;
`prisma generate`; `build:web` RC=0; `pm2 restart sherset-v2-web` + `-api`;
`topup-role-permissions.ts` (DATABASE_URL'ni `set -a; . .env` bilan berish kerak
— aks holda env xatosi): PASS1 4 rol/2304 qator (+warehousenumbering), PASS2
shablon rollari OK; keyin api yana restart. Sahifalar: `/`, `/login`, `/stores`,
`/reports/stock-balance`, `/inventories`, `/products` — hammasi 200; yangi build
markeri (warehouse-numbering chunk) joyida; pm2 error loglar toza.
Migratsiya kerak bo'lmadi — `20260822120000_inventory_position_cell` DB'da
allaqachon applied edi (Davlatbek reset'i faqat kodga tekkan).

**Jonli split (15:58 +02):** avval DRY-RUN, keyin `--apply` (VPS'da host
localhost — --allow-remote kerak bo'lmadi):
- **Ombor 01** (`7400bf94-c2b0-4d5c-b12d-f971cd10e187`): 119 yacheyka, 1 zona
  («04»), 0 qator, 0 dona.
- **Ombor 02** (`01662dbe-ee31-405f-a82f-ff8a82dc8809`): 291 yacheyka, 4 zona
  («01» 44, «02» 106, «03» 35, «04» 106), 273 qator, **2 949 007 dona**,
  255 924 725 594 so'm tannarx (F4 lokal isbotidan farq −78 dona — kunlik savdo).
- «Ombor 2» → **«Taqsimlanmagan»** (id `968f9da2-…` O'ZGARMADI), 4 bo'sh eski
  zona o'chirildi; unda qolgan qoldiq 49 574 452.387857 dona.
- Ledger: `warehouse_split` 546 qator, Σqty==0. **V0** (5081 assortiment
  qty/cost/rezerv o'zgarmadi) OK; **V1–V3** OK; alohida `--verify` ham OK;
  qayta-reja bo'sh (idempotent). **Σstocks oldin == keyin ==
  52 523 459.387857** — jami qoldiq o'zgarmagani raqam bilan isbotlangan.

**Kassa uzluksizligi:** kassa omborni `cashier_sessions.store_id` orqali oladi —
eski id, endi «Taqsimlanmagan» (retail_sales.store_id/pos_devices.store_id null).
Split 15:58 da; 16:03 da yangi kassir-sessiya muvaffaqiyatli ochilgan (jonli
dalil), api xatolari yo'q. Split'dan keyin haqiqiy sotuv hali bo'lmagan —
**birinchi real sotuvni egasi bir tekshirib qo'ysin** (chek → qoldiq
Taqsimlanmagan'dan kamayadi, F6 gacha shunday bo'lishi to'g'ri).

**F1 prefiks-hisoblar:** split'dan keyin ham matematik TO'G'RI (endi prefiks ==
haqiqiy Store: yangi omborlarda Σyacheyka==Stock (V3), «Taqsimlanmagan»da
yacheyka yo'q ⇒ unassigned==uning Stock'i). groupBy=warehouse hisoboti va tovar
kartasi kesimi haqiqiy Store raqamlari bilan mos — kod o'zgartirilmadi, chunki
xato YO'Q; soddalashtirish (prefiks-hisobni Store-kesimga almashtirish) F7
sayqal fazasiga qoldirildi (hisobotlar baribir u yerda qayta ko'riladi).

**Ochiq qolganlar / keyingi fazalarga:**
- **Draft inventarizatsiya `30c622d8`** (bugungi, 1 qator: yacheyka 02-01-01-06)
  «Taqsimlanmagan»da qolgan — yacheykasi endi Ombor 02'da, bu hujjat post
  BO'LMAYDI; Ombor 02'da yangidan ochib sanash kerak (044ac293 esa bo'sh draft —
  o'chirsa bo'ladi). Egasiga aytildi.
- UI klik-tekshiruvlar (omborlar ro'yxati, tovar kartasi, hisobot, yangi omborda
  inventarizatsiya, skaner) — sahifalar 200, ma'lumot DB darajasida to'g'ri;
  vizual klik-tur egasi/jamoada.
- F3 follow-up kuchda: topup yugurtirildi — endi `TOPUP_ENTITIES`dan
  `warehousenumbering`ni olib tashlash kichik commit'i kerak.
- POS sozlamalariga TEGILMADI (Q1/F4 rejasi) — 07-omborga o'tish F6 da.
- sudo `use_pty` + paramiko (pty'siz) kombinatsiyasida `sudo -u postgres psql`
  chiqishi yutiladi — keyingi sessiyalar DB'ga to'g'ridan-to'g'ri app
  DATABASE_URL bilan ulanishsin (pg_dump sudo bilan ishlayveradi).

### F4 — Ombor-split migratsiyasi: skript + LOKAL dry-run · 2026-08-23

**Q1 tasdiqlandi** (egasi, shu sessiya): 4-bo'limdagi javob kuchda — kaskad 07→
boshqalar (07 dan tashqarisi bosh omborchi tasdig'i orqali, G4), ayirish pul
to'langanda. **F4/F5 uchun ma'nosi:** kassa/sotuv sozlamalariga TEGILMAYDI —
RetailStore/hujjatlar eski Store id'siga ulanib qolaveradi, u esa split'da
«Taqsimlanmagan» deb qayta nomlanadi (id o'zgarmaydi) ⇒ kassa uzluksiz ishlaydi.
07-omborga o'tish F6 da quriladi.

**Nima qilindi:**
- **`packages/db/scripts/warehouse-split-core.ts`** (yangi) — SOF yadro, SQL'siz:
  `parseCellCode` (NN 1–2 xona → «01» normallash; `00-`/3+ xona ombor emas),
  `buildSplitPlan` — yacheyka prefiksidan reja: yaratiladigan Store'lar
  («Ombor NN»), yacheyka-ko'chishlar (zona = 2-segment «SS»), StockByCell
  qatorlari, cost-basis (apps/api `move-cost-basis.ts` bilan AYNAN bir
  arifmetika: o'rtacha-tortilgan, manba bo'shasa qoldiq tiyin to'liq ketadi,
  sequential — yaxlitlash yo'qotmaydi). Anomaliya turlari: unparsed-cell,
  target-name-clash (shu jumladan ikki manbadan bir nomga), negative-cell-qty,
  cell-exceeds-stock. Idempotent: «yacheyka o'z omborida» → rejaga kirmaydi.
- **`packages/db/scripts/warehouse-split.ts`** (yangi CLI, `npx tsx` /
  `pnpm warehouse-split`) — default DRY-RUN; `--apply` yozadi; `--verify`
  invariantlar; **himoya: lokal bo'lmagan hostga `--apply` faqat
  `--allow-remote` bilan** (F5 shu flag bilan yuritadi). Har ombor alohida
  Serializable tranzaksiya: zonalar upsert → cell.storeId/zoneId → StockByCell
  storeId → Stock juft upsert (qty+costBalanceMinor) → ledger createMany
  (docType **`warehouse_split`**, reason 'post', har (yacheyka×assortiment)
  uchun −/+ juftligi, costDeltaMinor bilan). So'ng: manba Store →
  «Taqsimlanmagan» rename (id saqlanadi; nomzodlar = shu yugurish ∪ ledger'dagi
  split-chiqimlilar — crash-resilient), bo'sh zonalar tozalanadi. Apply o'zi
  V0 snapshot (Σqty/Σcost/Σrezerv har assortiment) oldin/keyin solishtiradi,
  V1–V3 vertifikatsiya va qayta-reja-bo'shligini tekshiradi.
- `packages/db/tsconfig.json` include + `package.json` script qatori.
- **Test:** `apps/api/src/scripts/warehouse-split-core.test.ts` — 20 test
  (parse, reja, zona, cost yaxlitlash/qisman/bo'shatish, idempotentlik,
  clash/anomaliyalar, nomlash).

**LOKAL ISBOT (sherset_v2_dev, jonli dump 2026-08-23):** jonli bazadan yangi
`pg_dump -Fc --exclude-table-data=attachments` (7 MB; attachments 1.24 GB blob,
FK yo'q — polimorf) olinib to'liq tiklandi: 1 store, 410 yacheyka, 273
stock_by_cell, 5081 stocks, 13362 ledger. **Dry-run/apply raqamlari:**
- Ombor 01: 119 yacheyka (hammasi `01-04-…` → 1 zona «04»), 0 qator, 0 dona.
- Ombor 02: 291 yacheyka, 4 zona («01» 44, «02» 106, «03» 35, «04» 106),
  273 qator, **2 949 085 dona**, 255 927 709 992 so'm tannarx.
- «Ombor 2» → «Taqsimlanmagan» (id `968f9da2-…` o'zgarmadi), 4 bo'sh eski zona
  o'chirildi; qolgan qoldiq 49 575 145 dona (4823 assortiment) — jami ≈52,5 mln ✓.
- Ledger +546 qator (273×2). **Invariantlar:** V0 (5081 assortiment bo'yicha
  qty/cost/rezerv o'zgarmadi) OK, V1 sbc↔cell store mosligi OK, V2 split-ledger
  Σ==0 OK, V3 «Ombor NN»da Σyacheyka==Stock OK. **Ikkinchi `--apply` — no-op** ✓.

**Testlar:** yangi core-test 20/20 ✅; typecheck db ✅, api (8G) ✅; web i18n
gate'lar (i18n-key-existence + i18n-no-hardcoded, 19) ✅. Web kodi o'zgarmagan.

**Deploy holati: YO'Q (ataylab)** — F4 faqat skript + lokal isbot; jonli bazaga
yozish taqiqlangan edi va yozilmadi (VPS'dan faqat pg_dump o'qildi, /tmp fayl
o'chirildi). Sxema o'zgarmagan, migratsiya yo'q.

**Ochiq qolganlar / F5 ga eslatmalar:**
- F1+F2+F3 commitlari HALI deploy qilinmagan (F3 hisobotidagi retsept kuchda).
- F5: zaxira dump → `--apply --allow-remote` (avval dry-run!) → V0–V3 chiqishi
  «YAKUN: OK» bo'lishi shart; keyin UI tekshiruvlari va F1 prefiks-hisoblarini
  haqiqiy Store kesimiga moslashtirish.
- «Ombor 01» yacheykalari kod bo'yicha bitta stelajda (`01-04-…`) — bu kod
  haqiqati; egasi bilan F5 da bir tekshirib olish mumkin (03…07 raqamlashda F3
  vositasi to'g'ri `NN-SS` beradi).
- Yangi Store'larda `code = NN` (bo'sh bo'lsa), sozlamalar (shared,
  allowNegativeStock, owner/group) asosiy manba ombordan nusxalanadi.
- POS/RetailStore sozlamalari split'dan keyin ham «Taqsimlanmagan»ni ko'rsatadi
  (Q1 rejasi) — F6 gacha shunday qoladi.

### F3 — Yangi omborni raqamlashtirish vositasi · 2026-08-23 · `8eb0128c`

**Nima qilindi:**
- **API:** `POST /admin/stores/:id/warehouse-numbering` (store.controller) →
  `StoreAddressService.numberWarehouse`. Kirish: `{warehouseNo, stelajlar:
  [{qavatlar, orinlar}…], dryRun}`. Yoyish — `expandWarehouseNumbering`
  (cell-range.util): mavjud `expandCellRange` ustida, har o'lcham 1–99, jami
  ≤ 5000 (arifmetik, massiv qurilishidan OLDIN), xatolar stelaj raqami bilan
  o'zbekcha. **Zona = stelaj, nomi `NN-SS`** (masalan «03-01») — yalang'och
  «SS» ATAYLAB emas: yacheykalar hozircha yagona umumiy Store ichida
  yaratiladi va «01» u yerdagi eski chalkash zonalarga yopishib ketardi;
  F4/F5 zonalarni baribir kodning 2-segmentidan qayta chiqaradi.
- **Refaktor:** `bulkCreateCells` yozish qismi `createMissingCells` private
  metodiga ajratildi — diapazon-generator va raqamlashtirish BITTA yozish
  yo'lidan yuradi (dryRun aynan real hisob, idempotentlik, haqiqiy `created`).
- **Ruxsat — yangi entity `warehousenumbering`** (katta omborchi `store.update`siz
  raqamlashtira olsin): permissions.types (union + PERMISSION_ENTITIES) +
  permissions.service seedSystemRoles + packages/db/prisma/seed.ts +
  scripts/topup-role-permissions.ts NEW_ENTITIES + **TOPUP_ENTITIES** +
  roles.controller KNOWN_ENTITIES/kategoriya + rol shablonlari:
  ombor menejeri (`warehouse_manager`) view+create ALL, omborchi
  (`storekeeper`) ATAYLAB NO. Snapshotlar yangilandi (6).
- **Web:** `warehouse-numbering-modal.tsx` — ombor raqami, stelajlar soni,
  har stelaj qatori (qavatlar × o'rinlar, yangi qator oxirgisining nusxasi,
  «1-stelajni hammasiga qo'llash»), 400ms debounce dryRun oldindan ko'rish
  (jami/yangi/mavjud/zonalar/sample), server xato matni shundoq. Tugma —
  ombor kartasi address-storage bo'limida, `can('warehousenumbering','create')`
  bilan. Yaratilgach etiketka oynasi ombor diapazoni (`[{NN,NN},null,null,null]`)
  bilan ochiladi. access-sections «Sklad» bo'limiga qator; i18n ru+uz
  (numbering_* 11 kalit + access_entity_warehousenumbering).
- Yo'l-yo'lakay: F2 sessiyasidan staged qolgan progress.json va untracked
  G-reja fayli commit qilindi (`5f95166d`).

**Testlar:** yangi — util 9, behaviour (fake Prisma: dryRun yozmaydi, zona
bog'lanadi, idempotent, kengayish) 5, permission-lock 5, schema 4, web modal 6.
TO'LIQ to'plamlar: api 611 fayl / 8523 passed; web 307 fayl / 4165 passed
(26 skipped), i18n gate'lar yashil. Typecheck api (8G) ✅ web ✅ db ✅.

**Deploy holati: KUTILMOQDA (VPS paroli so'raldi).** Navbatda F1 (`54eb1da3`) +
F2 (`b323d5ce`) + F3 (`8eb0128c`) birga ketadi. Retsept: ff-merge → build:web →
`pm2 restart sherset-v2-web` va **api ham** (F1/F3 api'ga tekkan) → so'ng
**MAJBURIY:** apps/api'da `npx tsx src/scripts/topup-role-permissions.ts`
(jonli rollarga `warehousenumbering` qatorlari; scriptdan keyin api restart —
perm cache) → jonli tekshiruv: admin bilan ombor kartasida «Yangi ombor
raqamlashtirish» → dryRun preview → kichik sinov (masalan 09-ombor, 1 stelaj
1×1) → yacheyka/zona paydo bo'ldi → xohlasa o'chirish (qoldiqsiz yacheyka
o'chadi). Migratsiya YO'Q (sxema o'zgarmagan).

**Ochiq qolganlar / keyingi fazaga:**
- Deploy + jonli tekshiruv parol berilgach (yuqoridagi retsept). Topup
  yugurtirilib tasdiqlangach `TOPUP_ENTITIES`dan `warehousenumbering`ni olib
  tashlash kerak (template-topup.ts qoidasi) — kichik follow-up commit
  (warehouse-numbering-permission.test.ts dagi TOPUP asserti ham birga).
- F5 split'ida: F3 yaratgan `NN-SS` zonalari o'z Store'iga ko'chirilganda
  «SS»ga qayta nomlash mumkin (maqsad-arxitektura 3-bo'lim) — F4 skripti
  zonani kodning 2-segmentidan chiqargani uchun bu avtomatik hal bo'ladi.
- Etiketka chop etish oqimi diapazon bilan ochiladi — 5000 gacha yacheykada
  sinash jonlida bir marta qilinsin (F5 dan oldin shart emas).

### F2 — Inventarizatsiyada «+ Yacheyka qo'shish» · 2026-08-23 · `b323d5ce`

**Nima qilindi:**
- `apps/web/src/components/inventories/add-cell-picker.tsx` (yangi) —
  `InventoryAddCell`: yacheyka-tabda tovar guruhiga «+ Yacheyka» amali.
  Skaner-do'st kod terish: Enter'da kod AYNAN mos yacheykani oladi
  (`resolveCellByCode` — trim, katta-kichik farqsiz), topilmasa kod bilan aniq
  xato («{code} yacheykasi topilmadi»); dublikat (tovar × yacheyka) ham aniq
  xato. Muqobil: input ostida filtrlangan ro'yxatdan bosib tanlash. Panel
  skaner uchun ochiq qoladi, fokus kod maydoniga qaytadi. Ma'lumot — mavjud
  `GET /admin/stores/:id/address-storage` (cell-picker-field bilan bir endpoint).
- `inventory-positions-panel.tsx` — har tovar guruhining sahifadagi oxirgi
  qatoridan keyin qo'shish qatori (faqat qoralamada); `addCellCount`:
  yangi qator cellId'li, actualQty='0', untouched store-qator double-count
  guard bilan tushiriladi (setCellActual bilan bir xil). «Faqat yacheyka»
  qoidasi buzilmadi — backend'ga o'zgarish KERAK BO'LMADI (assertCellsInStore
  + post'da StockByCell yo'q bo'lsa expected=0 allaqachon bor).
- i18n ru+uz: `pages.inventories.add_cell*` (7 kalit).

**Testlar:** yangi — `add-cell-picker.test.tsx` (6) +
`inventory-positions-panel.add-cell.test.tsx` (2, jumladan actual>0 store-qator
saqlanishi). Web vitest TO'LIQ: 306 fayl, 4159 passed / 26 skipped. i18n
gate'lar (62) yashil. Typecheck web ✅, api ✅ (NODE_OPTIONS 8G). API inventory
moduli 28 passed (api kodi o'zgarmagan).

**Deploy holati: KUTILMOQDA** — foydalanuvchi «Deploy keyinroq» dedi (parol
berilmadi). Diqqat: **F1 (`54eb1da3`) ham hali deploy qilinmagan** ko'rinadi
(F1 sessiyasi hisobot yozmagan; VPS holati tekshirilmagan). Keyingi deploy
`b323d5ce` ni olib borsa F1+F2 birga ketadi — F1 apps/api'ga tekkani uchun
**pm2 restart sherset-v2-api HAM kerak** (web bilan birga). Jonli qabul
mezoni (yangi yacheykaga kiritish → post → StockByCell) deploy'dan keyin
tekshirilishi shart — xavfsiz naqsh: post → tekshir → cancel (deltalar aynan
qaytadi, 00112 da isbotlangan).

**Ochiq qolganlar / keyingi fazaga:**
- F2 jonli tekshiruv deploy bilan birga qoldi (yuqoridagi retsept).
- F1 hisoboti yo'q edi — bu commitda F1 mazmuni commit-xabaridan ma'lum
  (`54eb1da3`: groupBy=warehouse hisoboti, /reports/stock-balance/cells,
  tovar kartasi yacheyka kesimi; testlari o'z sessiyasida yashil deb yozilgan).
- `docs/plans/2026-08-23-omborchi-tsd-mijozlar.md` hali untracked (G-reja,
  boshqa ish oqimi) — kim birinchi tegsa commit qilsin.
- Q1 aniqlashtiruv bloki (F6 ustidagi ⚠️) avvalgi sessiyadan uncommitted
  qolgan edi — shu hisobot commitiga kiritildi.

### F0 — Reja tuzildi · 2026-08-23
Reja shu sessiyada tuzildi. Oldin bajarilgan tayanch ishlar (alohida, reja-oldi):
yacheyka inventarizatsiyasi (`fe361abf`+`bebd335d`), «faqat yacheyka» qoidasi
(`87cb45d0`) — hammasi jonlida. 00112 xato hujjati cancel qilingan, qoldiq tiklangan.
Joriy o'lchovlar 1-bo'limda. Q1 va Q2 egasi tomonidan hal qilindi (4-bo'lim):
kassa kaskadi (07 → boshqalar, to'lov paytida) — F6; katta omborchi .exe — F8.
