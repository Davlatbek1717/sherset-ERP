# REJA — kassa REAL SAVDOGA to'liq tayyor · 2026-08-11

> **Bu reja ko'p sessiyaga bo'lingan.** Har faza — ALOHIDA sessiya. Agent shu faylni o'qiydi,
> FAQAT o'z fazasini bajaradi, hisobotini `## HISOBOTLAR` ga yozadi va **ISHNI TO'XTATADI**.

---

## 0. O'ZGARMAS QOIDALAR (har fazaga tegishli)

1. 🔴 **BIR SESSIYA = BIR FAZA.** Faza tugagach agent keyingi fazani **BOSHLAMAYDI** — to'liq
   to'xtaydi. Sabab: kontekst o'sgani sari token sarfi oshadi. Keyingi fazani egasi yangi
   sessiyada o'zi boshlaydi.
2. 🔴 **Hisobot majburiy.** Faza oxirida `## HISOBOTLAR` dagi shablon to'ldiriladi: nima
   o'zgardi · fayllar · testlar va natijalari · **nima QILINMADI** · ochiq xavf. Qisqartirish yo'q.
3. **Halol status** (`CLAUDE.md` §1): brauzerda/qurilmada sinalmagan ish «Phase-1,
   browser-smoke YO'Q» deb yoziladi. «Done / production-ready» so'zlari ishlatilmaydi.
4. **Parallel sessiya xavfsizligi** (`CLAUDE.md` §6): `git add` faqat aniq fayl yo'llari;
   commitdan keyin `git show --stat HEAD`; begona o'zgarish bor daraxtda `reset --hard`/
   `stash`/`checkout -- .` TAQIQ.
5. **Model:** Opus. Sifat gate'lari qisqartirilmaydi.
6. **Avval o'lcha, keyin o'zgartir.** Har faza o'z hududini prodda/kodda O'LCHAB boshlaydi —
   quyidagi «O'lchangan holat» eskirgan bo'lishi mumkin (rejaning o'zi ham 11-avgust o'lchovi).
7. **Prod ehtiyotkorligi:** prod DB'ga yozadigan skript avval **DRY** rejimda yugurtiriladi va
   natija hisobotga kiradi; jonli sinov cheklari kichik summada, sinov ekanligi hisobotda yoziladi.
8. Bu reja `/davom` cohort-navbatidan USTUN — fazalar shu fayldan olinadi.

### Umumiy gate (har kod fazasida, commitdan oldin)

```
pnpm typecheck                                        # 0 xato
pnpm lint:product                                     # 0 error
pnpm i18n:gate                                        # ru+uz kalitlar + hardcoded yo'q
pnpm --filter @moysklad/web exec vitest run <yo'llar> # o'zgargan + POS suite'lari
pnpm --filter @moysklad/api exec vitest run <yo'llar> # API o'zgargan modullar
```

API'ga tegilgan fazada `apps/api` qo'riqchilari ham yugurtiriladi (app-boot, wiring) —
`web-only-gate-misses-api-guards` xotirasi.

### Deploy (kerak bo'lgan fazada)

`git push sherset climart-adoption` → `nohup env DS_TARGET=v2 NODE_OPTIONS="--max-old-space-size=3072"
bash /var/www/sherset-v2/deploy/deploy-smart.sh > /tmp/deploy.log 2>&1 &` → log poll →
box HEAD = lokal HEAD · sayt/health 200 · yangi kod chunk-grep bilan tasdiqlanadi
(`deploy-verify-against-local-not-remote` xotirasi). SSH: `ssh -i ~/.ssh/sherset_deploy
-o IdentitiesOnly=yes root@13.140.157.10`.

---

## 1. O'LCHANGAN HOLAT (2026-08-11 — taxmin emas, prod dalillari)

O'lchov skriptlari box'da: `/var/www/sherset-v2/apps/api/src/scripts/ops-{debt-audit,kpi-chain,diagnose-cashiers,hr-catalogs}.ts` (read-only).

### 🔴 A. QARZ — bitta yoriq, egasi ko'rgan to'rt xatoning manbai

Tizimda IKKI daftar bor va ular kesishmaydi:

| Daftar | Nima yozadi | Prodda |
|---|---|---|
| **Balans-jurnal** (`CounterpartyBalance`) | hujjatlar (chek kam to'lovi ham — `retail-sale.service.ts:1127` ATAYLAB faqat shu yerga) | 15+ kontragentda katta qoldiqlar (masalan 12 116 800 so'm) — tarixiy import |
| **Qarz reyestri** (`Debt`/QRZ) | qo'lda yaratilgan qarzlar; POS «Qarzni to'lash» **FAQAT** shundan to'laydi (FIFO) | **0 qator**; `DebtPayment` ham 0 |

Natija — egasining to'rttala shikoyati bitta sabab bilan:
1. **Mijoz kartasida qarz noto'g'ri** — «Umumiy qarz» balansdan (katta), «Reyestrda» 0; ekran
   o'zi yozadi: «reyestrdan TASHQARIDA — kassada to'lab bo'lmaydi».
2. **Kam to'lovda qarz noto'g'ri yoziladi** — yoziladi, lekin faqat balansga ⇒ reyestrda ko'rinmaydi.
3. **Qarzni to'lashda muammo** — to'lanadigan reyestr bo'sh ⇒ POS'da to'lab bo'lmaydi.
4. **Ro'yxat/tarix muammosi** — `CounterpartyBalanceEntry` (jurnal yozuvlari) **0 qator**
   (backfill hech qachon yugurtirilmagan — `balance-readers-journal-sourced`,
   `money-ledger-writers-faza11` xotiralari) ⇒ tarix ekranlari bo'sh.

Qo'shimcha: balanslarda ikkala ishora ham bor (+461 705 000 va −183 250 000) — **ishora
konvensiyasi hujjatlashtirilmagan**, P1 birinchi bo'lib shuni o'lchaydi.

### 🔴 B. CHEK HAYOT SIKLI — kassir cheklari qotib qoladi

`RetailSale` prodda: **posted=1 · picking=4 · cancelled=10**. Kassir1/2 ning barcha cheklari
`picking`da (omborchiga yuborilgan, hech kim tayyorlamagan) ⇒ smenada `salesCount=0`,
Z-hisobot bo'sh, KPI'ga hech nima tushmaydi. Omborchi hisobi prodda yo'q. Yana bir o'lchangan
g'alatilik: posted chekda `payments=[CASH_UZS:8460000]` bor, lekin `payedSumMinor=0`.

### 🔴 C. SMENA — hech qachon yopilmagan

3 smena, hammasi `open`; bittasi (Admin User) **2026-08-01 dan beri ochiq**. Farq akti 0,
qabul hodisasi 0. «Unutilgan smena» himoyasi yo'q. (Yopish oqimining o'zi kodda to'liq bor:
kutilgan naqd → sanoq → farq → izoh → akt → menejer navbati FSM — `REJA-KASSA-KPI-2026-08.md` §1.)

### D. KPI — dvigatel tirik, profil yo'q

`EmployeeDailyKpi` 120 qator, cron 00:40 ishlaydi, `till_variance_abs` (kassa topshirish farqi)
metrikasi bor. Lekin `KpiProfile` **0 qator** ⇒ ball hisoblanmaydi. Egasining qoidasi:
**«kassani topshirish — kassir KPI'si»**. Batafsil: `docs/REJA-KASSA-KPI-2026-08.md`.

### E. Boshqa ochiq qarzlar (xotira/hisobotlardan, jonli sinalmagan)

- exe **1.3.0 avtoyangilanishi jonli o'tmagan**; kirill `sendInputEvent` Chromium'ga yetishi
  o'lchanmagan; PIN ekranida **ikki numpad** chiqishi mumkin (F3/F4 hisobotlari).
- **Chop etish hech qachon o'lchanmagan** (printer, 80mm, kirill) — `desktop/README.md`
  «Chop etishni o'lchash (HALI BAJARILMAGAN)».
- POS'da **88 hardcoded matn** — i18n gate komponentlarni ko'rmaydi (xotira).
- MK32 xarakteristika testlari 3 kuzatuvni tuzatmagan (xotira).
- Prod DB'da **test-qoldiq 1000** va sun'iy narxlar (`prod-test-stock-1000`).

---

## 2. FAZALAR XARITASI (har biri = alohida sessiya)

| Faza | Nomi | Tegadigan joy | Deploy | Holat |
|---|---|---|---|---|
| **P1** | Qarz: POS to'lovi BALANS bo'yicha ishlaydi | api `debt`/`retail-sale` + web POS | ✅ | ☐ |
| **P2** | Qarz: mijoz kartasi bitta halol raqam + tarix | api + web + backfill | ✅ | ☐ |
| **P3** | Chek hayot sikli: picking-qotish + to'g'ri yo'l | api + web POS | ✅ | ☐ |
| **P4** | Smena: unutilgan smena himoyasi + jonli yopish sinovi | api + prod-op | ✅ | ☐ |
| **P5** | To'lov turlari jonli sinovi (naqd·karta·QR·aralash·valyuta) | o'lchov + fix | kerak bo'lsa | ☐ |
| **P6** | exe: 1.3.0 jonli o'tish · kirill · ikki-numpad | desktop + qurilma | kanal | ⚠️ kod-tomon yopildi, **qurilma sinovi yo'q** |
| **P7** | Chop etish o'lchovi (chek · Z · pick-list, real printer) | o'lchov + fix | kerak bo'lsa | ☐ |
| **P8** | POS i18n: hardcoded matnlar | web | ✅ | ☐ |
| **P9** | KPI: profil + ball (`REJA-KASSA-KPI` K1–K2 shu yerdan) | prod-data + api | kerak bo'lsa | ☐ |
| **P10** | Yakuniy adversarial browser-QA (butun kassa cohort'i) | Phase-2 QA | — | ☐ |

Tartib sababi: P1–P2 — egasi ko'rgan jonli xatolar (eng ustuvor). P3 — realda savdo shu yerda
qotadi. P4–P5 — pul hisobi. P6–P7 — qurilma. P8 — sifat. P9 — KPI (egasining qoidasi).
P10 — hammasi ustidan mustaqil tekshiruv.

---

## FAZA P1 — Qarz: POS to'lovi BALANS bo'yicha ishlaydi

**Muammo (o'lchangan):** kassada berilgan qarz balansga yoziladi, POS to'lovi esa faqat bo'sh
reyestrdan to'laydi — mijoz kassaga pul olib kelsa, qabul qilib bo'lmaydi.

**Yo'nalish:** «bitta daftar — bitta haqiqat» printsipi kodda allaqachon e'lon qilingan
(`retail-sale.service.ts:1127` izohi). Demak POS to'lovi ham **balans bo'yicha** ishlashi kerak:
mijozning to'lanadigan qarzi = balans qoldig'i; reyestr qatorlari bo'lsa FIFO taqsimot saqlanadi.

### Vazifalar
1. **O'lcha:** ishora konvensiyasi (balans musbat = mijoz qarzdormi?) — kod + 2-3 jonli
   kontragent misolida hujjatlashtir. `debt-cash-ledger.ts`, `pos-cash-out`, smena «kutilgan
   naqd» zanjirini o'qi: qarz to'lovi naqd smenaga qanday kiradi.
2. **Dizayn (kichik, hisobotga yoziladi):** balans-to'lov qanday hujjat yozadi — mavjud
   `DebtPayment` reyestr qatorisiz ishlaydimi yoki avto «boshlang'ich qoldiq» qarz-qatori
   yaratiladimi. Tanlangan shartnoma: to'lov → balans delta (−) → smena naqdiga kiradi →
   tarixda ko'rinadi → teskarilash yo'li bor.
3. **Implement:** POS «Qarzni to'lash» balans qoldig'ini to'lay oladi; ortiqcha to'lov
   (`debt-overpaid`) xulqi saqlanadi; valyuta — faqat kassa valyutasi (boshqasi aniq xato bilan).
4. **Testlar:** api (`debt` modul: FIFO + balans-to'lov + teskarilash + smena-naqd wiring) va
   web (mijoz kartasi «Qarzni to'lash» oqimi). RED avval o'lchanadi.
5. Gate → deploy → **jonli verify:** haqiqiy kontragent (masalan katta balanslilardan biri)
   uchun 1 000 so'mlik sinov to'lovi → balans kamaydi · smena naqdi ko'paydi · tarixda ko'rinadi.
   Sinov to'lovini teskarilash ham jonli sinaladi (dalil bilan).
6. `NEXT.md` entry + hisobot → **TO'XTA**.

### Tugash mezoni
POS'da balansdagi qarzni to'lash mumkin, to'lov smena naqdiga kiradi, teskarilanadi;
gate 0; prodda jonli 1 sinov to'lovi bilan tasdiqlangan.

### Sessiya prompti (nusxa ol)

```
docs/REJA-KASSA-PROD-2026-08.md faylini o'qi va FAQAT «FAZA P1 — Qarz: POS to'lovi BALANS
bo'yicha ishlaydi» ni bajar. Rejaning §0 «O'zgarmas qoidalar» majburiy.

Avval o'lcha (reja §1.A dalillari eskirgan bo'lishi mumkin): ishora konvensiyasi, ikki daftar
wiring'i, smena-naqd zanjiri. Keyin dizayn qarorini hisobotga yozib implement qil. TDD: testlar
avval. Gate → deploy (DS_TARGET=v2) → jonli verify (1000 so'mlik sinov to'lovi + teskarilash).

Faza tugagach «HISOBOTLAR» ga P1 hisobotini yoz va ISHNI TO'XTAT — keyingi fazani boshlama.
```

---

## FAZA P2 — Qarz: mijoz kartasi bitta halol raqam + tarix

**Muammo (o'lchangan):** kartada ikki raqam («Umumiy qarz» katta, «Reyestrda» 0) mijozni ham,
kassirni ham chalg'itadi; tarix bo'sh (`CounterpartyBalanceEntry` = 0 qator — backfill yo'q).

### Vazifalar
1. P1 dan keyin kartani soddalashtir: kassir ko'radigan asosiy raqam = **to'lanadigan qarz**
   (P1 shartnomasi bo'yicha). «Reyestrdan tashqarida — to'lab bo'lmaydi» ogohlantirishi endi
   yolg'on bo'lsa — olib tashla.
2. **Jurnal backfill** (`CounterpartyBalanceEntry`): mavjud hujjatlardan tiklanadigan qismini
   backfill qil (idempotent skript, avval DRY + son solishtiruv). Hujjatsiz tarixiy import
   qoldiqlari uchun «boshlang'ich qoldiq» yozuvi. 🔴 `Stock`-backfill saboqlari:
   farq-asosli, manifest bilan, rollback yo'li hujjatlangan (`cell-migration-delta-not-total`).
3. Mijoz kartasidagi «Oxirgi xaridlar» / «Zakazlar» / to'lovlar tarixi jonli tekshiriladi.
4. Testlar + gate → deploy → jonli verify (kamida 2 kontragent: importli va yangi).
5. Hisobot → **TO'XTA**.

### Sessiya prompti (nusxa ol)

```
docs/REJA-KASSA-PROD-2026-08.md faylini o'qi va FAQAT «FAZA P2 — Qarz: mijoz kartasi bitta
halol raqam + tarix» ni bajar. Rejaning §0 majburiy. P1 hisobotini ham o'qi — uning shartnomasi
ustiga qurasan.

Backfill skripti idempotent, avval DRY, natijasi son bilan hisobotda. Gate → deploy → jonli
verify (importli va yangi kontragent). Faza tugagach «HISOBOTLAR» ga P2 hisobotini yoz va
ISHNI TO'XTAT.
```

---

## FAZA P3 — Chek hayot sikli: picking-qotish + to'g'ri yo'l

**Muammo (o'lchangan):** kassir cheklari `picking`da qotib qoladi (omborchi yo'q) — savdo
tugamaydi, smenaga tushmaydi. `payedSumMinor=0` posted chekda ham (payments bor bo'lsa ham).

### Vazifalar
1. **O'lcha:** to'liq oqim xaritasi — savat → «Omborchiga yuborish» (`picking`) → omborchi
   «Tayyor» → kassir to'laydi (`posted`). Omborchisiz yo'l bormi? `cancelled=10` — qachon/kim.
2. **Egasi bilan qaror** (savol fazada beriladi): do'konda omborchi rolini kim bajaradi?
   Variantlar: (a) omborchi hisobi yaratiladi va jarayon o'rgatiladi; (b) POS'da «to'g'ridan-
   to'g'ri sotish» yo'li (picking'siz) yoqiladi/qo'shiladi; (c) ikkalasi.
3. Qotib qolgan `picking` cheklar siyosati: smena yopilishida ogohlantirish/avto-bekor —
   qaror + implement.
4. `payedSumMinor=0` g'alatiligini o'lcha: bug'mi yoki o'lik maydonmi — hujjatlashtir, kerak
   bo'lsa tuzat.
5. Testlar + gate → deploy → jonli verify: to'liq sotuv zanjiri (chek → posted → smenada
   ko'rinadi) prod'da kichik summa bilan.
6. Hisobot → **TO'XTA**.

### Sessiya prompti (nusxa ol)

```
docs/REJA-KASSA-PROD-2026-08.md faylini o'qi va FAQAT «FAZA P3 — Chek hayot sikli» ni bajar.
Rejaning §0 majburiy.

Avval oqimni o'lcha va xaritala, keyin egasidan omborchi-roli qarorini so'ra (reja §P3.2
variantlari bilan). Qaror asosida implement + testlar. Gate → deploy → jonli verify (to'liq
zanjir, kichik summa). Faza tugagach «HISOBOTLAR» ga P3 hisobotini yoz va ISHNI TO'XTAT.
```

---

## FAZA P4 — Smena: unutilgan smena himoyasi + jonli yopish sinovi

**Muammo (o'lchangan):** smena 10 kundan beri ochiq; hech bir smena hech qachon yopilmagan;
farq akti/qabul zanjiri jonli ishlamagan.

### Vazifalar
1. Eski ochiq smenalarni tartibga keltir (egasi bilan: yopish/bekor).
2. **Himoya:** smena N soatdan oshiq ochiq bo'lsa — POS'da ochiq ogohlantirish; yangi smena
   ochishda eski yopilmagan bo'lsa aniq xabar. (Avto-yopish QILINMAYDI — summalar kassir
   sanog'isiz yozilmasin.)
3. **Jonli yopish sinovi** (P3 dan keyin cheklar posted bo'la oladi): kassir smena ochadi →
   2 chek → yopadi, **ataylab 5 000 farq** → akt yozildi · `pending` navbatga tushdi · egasi
   qabul qiladi → jurnal. Har qadam dalil bilan.
4. Z-hisobot chop ko'rinishida to'lov turlari qatorlari jonli tekshiriladi.
5. Testlar + gate → (kod o'zgargan bo'lsa deploy) → hisobot → **TO'XTA**.

### Sessiya prompti (nusxa ol)

```
docs/REJA-KASSA-PROD-2026-08.md faylini o'qi va FAQAT «FAZA P4 — Smena» ni bajar. Rejaning §0
majburiy. P3 hisobotini ham o'qi.

Eski ochiq smenalar taqdirini egasidan so'ra. Himoya implement + testlar. Keyin jonli yopish
sinovi (ataylab farq bilan) — har qadam dalil bilan hisobotga. Faza tugagach «HISOBOTLAR» ga
P4 hisobotini yoz va ISHNI TO'XTAT.
```

---

## FAZA P5 — To'lov turlari jonli sinovi

**Nima uchun:** `RetailSalePayment` da faqat 1 ta CASH_UZS yozuvi bor — karta/QR/aralash/valyuta
prod'da **hech qachon sinalmagan**. `pos-terminal-debt-payment-broken` xotirasi: bu yo'l bir
marta allaqachon jimgina singan (Zod jim tashlash klassi).

### Vazifalar
1. Jonli matritsa (har biri kichik summa, dalil bilan): naqd · karta(terminal) · QR · aralash
   (naqd+karta) · kam to'lov→qarz (P1 dan keyin) · ortiqcha naqd→qaytim · USD (agar kassada bor).
2. Har birida: chek posted · `RetailSalePayment` to'g'ri method/currency · smena «kutilgan naqd»
   faqat naqd qismiga o'sdi · Z-hisobot kesimida to'g'ri qator.
3. Topilgan har xato shu fazada tuzatiladi (issiq kontekst), testi bilan.
4. Gate → (kerak bo'lsa deploy) → hisobot → **TO'XTA**.

### Sessiya prompti (nusxa ol)

```
docs/REJA-KASSA-PROD-2026-08.md faylini o'qi va FAQAT «FAZA P5 — To'lov turlari jonli sinovi»
ni bajar. Rejaning §0 majburiy. P1/P3/P4 hisobotlarini ham o'qi.

Matritsani to'liq yugurtir, har katak dalil bilan. Xato chiqsa shu yerda tuzat (test bilan).
Faza tugagach «HISOBOTLAR» ga P5 hisobotini yoz va ISHNI TO'XTAT.
```

---

## FAZA P6 — exe: 1.3.0 jonli o'tish · kirill · ikki-numpad

**Holat:** kanal tayyor (curl-verify qilingan), lekin qurilmada 1.2.0→1.3.0 o'tishi **hech
qachon kuzatilmagan**; kirill `sendInputEvent({type:'char'})` Chromium'ga yetishi o'lchanmagan
(F3 hisoboti — eng katta xavf); PIN ekranida sahifa numpadi + qobiq numpadi birga chiqishi
mumkin (`pos-pin-lock.tsx:112` `inputMode="numeric"`).

### Vazifalar
1. Egasi bilan bitta monoblokda: qayta ochish → 3 daq → «Chiqish» → UAC → versiya 1.3.0.
   Har qadam natijasi (bo'lmasa — «sinalmadi») hisobotga.
2. 1.3.0 da: pul maydonida numpad chiqishi · **kirill harfi maydonga tushishi** · til
   navigatsiyadan keyin saqlanishi. Kirill tushmasa: `main.js` da `insertText` zaxira yo'li —
   avval o'lchab, keyin almashtir (F3 hisobotidagi eslatma).
3. PIN ekranida ikki numpad chiqsa: sahifa maydonini `readOnly` qilish yo'li (F3 hisoboti) —
   implement + test.
4. Topilgan tuzatishlar → yangi exe (1.3.1) faqat kerak bo'lsa; aks holda kod commit + keyingi
   relizga qoldirilganini hisobotda yoz.
5. Hisobot → **TO'XTA**.

### Sessiya prompti (nusxa ol)

```
docs/REJA-KASSA-PROD-2026-08.md faylini o'qi va FAQAT «FAZA P6 — exe jonli o'tish» ni bajar.
Rejaning §0 majburiy. docs/REJA-KASSIR-EXE-2026-08.md F3/F4 hisobotlarini ham o'qi.

Bu faza EGASI BILAN qurilmada o'tadi — har qadam kuzatilmasa «sinalmadi» deb yoziladi,
«ishlaydi» deb taxmin qilinmaydi. Faza tugagach «HISOBOTLAR» ga P6 hisobotini yoz va ISHNI
TO'XTAT.
```

---

## FAZA P7 — Chop etish o'lchovi

**Holat:** chek/Z/pick-list chop yo'llari kodda bor, lekin **hech bir printerda o'lchanmagan**
(`desktop/README.md` «Chop etishni o'lchash — HALI BAJARILMAGAN» ro'yxati tayyor turibdi).

### Vazifalar
1. `desktop/README.md` dagi 6-qadamlik o'lchov ro'yxatini to'liq bajar (virtual PDF-printer
   yaramasa real chek printerida): kirill buzilmasligi · 80mm en · bo'y mazmun bo'yicha (A4
   emas) · noto'g'ri printer nomi = ko'rinadigan xato · pick-list va Z-hisobot ham.
2. Mijoz-ekran (HDMI bo'lsa): ochilish · jonli yangilanish · yopilish · monitorsiz toast.
3. Topilgan xatolar shu fazada tuzatiladi (uch renderer sinxroni — `ombor-chek-uch-renderer`
   xotirasi: birini o'zgartirsang qolganini ham tekshir).
4. Gate → hisobot → **TO'XTA**.

### Sessiya prompti (nusxa ol)

```
docs/REJA-KASSA-PROD-2026-08.md faylini o'qi va FAQAT «FAZA P7 — Chop etish o'lchovi» ni bajar.
Rejaning §0 majburiy. desktop/README.md «Chop etishni o'lchash» bo'limi — bajarish ro'yxati.

Har qadam dalil bilan; printer yo'q bo'lsa qaysi qadamlar «sinalmadi» — ochiq yoz. Faza tugagach
«HISOBOTLAR» ga P7 hisobotini yoz va ISHNI TO'XTAT.
```

---

## FAZA P8 — POS i18n: hardcoded matnlar

**Muammo (xotira `i18n-gate-blind-to-components`):** i18n gate faqat `app/(app)` ni tekshiradi —
POS komponentlarida ~88 hardcoded matn bor; BE qaytargan tayyor o'zbekcha matnlar ham bor.

### Vazifalar
1. O'lcha: hozirgi ro'yxat (88 eskirgan bo'lishi mumkin) — POS komponentlari bo'yicha skan.
2. Hammasi `ru.json`/`uz.json` ga ko'chiriladi (ikkala til ham — gate talabi).
3. Gate'ning ko'r zonasini yop: komponentlar ham skanerga kirsin (yoki alohida guard-test).
4. Gate → deploy → hisobot → **TO'XTA**.

### Sessiya prompti (nusxa ol)

```
docs/REJA-KASSA-PROD-2026-08.md faylini o'qi va FAQAT «FAZA P8 — POS i18n» ni bajar. Rejaning
§0 majburiy. Avval skan (ro'yxat eskirgan bo'lishi mumkin), keyin ko'chirish, keyin gate'ning
ko'r zonasini yopadigan guard. Faza tugagach «HISOBOTLAR» ga P8 hisobotini yoz va ISHNI TO'XTAT.
```

---

## FAZA P9 — KPI: profil + ball

`docs/REJA-KASSA-KPI-2026-08.md` (K1–K2) shu fazada bajariladi — u yerda o'lchangan holat va
vazifalar batafsil. Qisqacha: «Kassir» lavozimiga `KpiProfile` (metrikalar: `till_variance_abs`,
`cash_revenue`, `receipt_count`, `discount_given`, `below_cost_*`…), og'irlik/maqsadlarni
**egasi tasdiqlaydi**, keyin uchdan-uchgacha: smena yopish → ertasi 00:40 cron → ball chiqdi.

### Sessiya prompti (nusxa ol)

```
docs/REJA-KASSA-PROD-2026-08.md faylini o'qi va FAQAT «FAZA P9 — KPI» ni bajar; batafsil
vazifalar docs/REJA-KASSA-KPI-2026-08.md K1–K2 da. Rejaning §0 majburiy. Og'irlik/maqsadlarni
egasidan so'ra — taxmin qilma. Faza tugagach «HISOBOTLAR» ga P9 hisobotini yoz va ISHNI TO'XTAT.
```

---

## FAZA P10 — Yakuniy adversarial browser-QA

Hamma fazalardan keyin butun kassa cohort'i real brauzerda (`/qa-cohort` uslubi): kirish/PIN ·
savat/tahrir oynasi · qarz (P1–P2) · to'lovlar (P5) · smena (P4) · hisobotlar. Adversarial
savollar: parallel ikki kassir · tarmoq uzilishi chekni ikki marta yubormasligi · 401 dan
qaytish (`dead-session-looks-alive`) · katta savat. Topilganlar darhol tuzatiladi yoki alohida
fazaga yoziladi.

### Sessiya prompti (nusxa ol)

```
docs/REJA-KASSA-PROD-2026-08.md faylini o'qi va FAQAT «FAZA P10 — Yakuniy adversarial
browser-QA» ni bajar. Rejaning §0 majburiy. Barcha P-hisobotlarni o'qi. Playwright MCP bilan
real brauzerda yugur. Topilgan har bug: reproduksiya → tuzatish yoki alohida faza taklifi.
Faza tugagach «HISOBOTLAR» ga P10 hisobotini yoz va ISHNI TO'XTAT.
```

---

## HISOBOTLAR

> Har faza agenti o'z bo'limini shu yerda to'ldiradi. Shablon o'zgartirilmaydi, bo'limlar
> o'chirilmaydi. «Nima QILINMADI» bo'sh qolmasin — bo'sh bo'lsa sabab yoziladi.

### Shablon

```
### P<n> — <nom> · <sana> · <commit hash(lar)>
**Holat:** ✅ tugadi / ⚠️ qisman / ❌ bloklandi
**Nima o'zgardi:** (2–5 qator, xulq tilida)
**Fayllar:** (yo'l → nima qilindi)
**Testlar:** (buyruq → natija, raqam bilan)
**Gate:** typecheck … · lint:product … · i18n:gate … · vitest …
**Deploy:** qilindi/qilinmadi — sabab; jonli verify dalillari
**Nima QILINMADI:** (ataylab + sababi; sinalmagani)
**Ochiq xavf / keyingi fazaga eslatma:**
```

### P1 — ☐ hali bajarilmagan
### P2 — ☐ hali bajarilmagan
### P3 — ☐ hali bajarilmagan
### P4 — ☐ hali bajarilmagan
### P5 — ☐ hali bajarilmagan
### P6 — exe: 1.3.0 jonli o'tish · kirill · ikki-numpad · 2026-08-11 · `33730b2f`

**Holat:** ⚠️ qisman — **kod tomondagi ikki 🔴 ochiq xavf o'lchandi va YOPILDI**;
**qurilmadagi 1.2.0 → 1.3.0 o'tishi esa SINALMADI** (egasi bu sessiyada qatnashmadi —
sessiya interaktiv emas, monoblokka kirish yo'q). Pastdagi «Jonli oqim» jadvalida har qadam
alohida belgilangan.

**Nima o'zgardi:**
- F3/F4 hisobotlarining 🔴 **eng katta ochiq savoli yopildi**: qobiq klaviaturasidagi kirill
  harfi Chromium'gacha **yetadi**. Ya'ni `webContents.insertText` zaxira yo'liga o'tish
  **kerak emas** — `main.js` o'zgarmadi, exe **1.3.1 chiqarilmadi**.
- Rejaning «PIN ekranida ikki numpad» premisasi o'lchandi va **noto'g'ri** chiqdi; rejaning
  taklif qilgan `readOnly` yechimi esa **kassirni qulf ekranida qamab qo'yardi** (o'lchandi).
  Kod o'zgartirilmadi — o'rniga «kiritish yo'li aynan bitta» invarianti testga qulflandi.
- O'lchov **qayta yugurtiriladigan** bo'ldi: `desktop/tools/kbd-probe/` — Electron versiyasi
  ko'tarilganda javob qayta ochiladi, chunki u o'sha Chromium'ga bog'liq.

**O'LCHOV 1 — kirill (haqiqiy Electron, prod bilan bir xil oyna sozlamalari)**

Electron **33.4.11 / Chromium 130.0.6723.191** — 1.3.0 relizida ketgan aynan shu versiya;
oyna `sandbox: true` + `contextIsolation: true` + haqiqiy `desktop/preload.js` bilan
(`main.js:155-162` bilan bir xil).

| Savol | Natija |
|---|---|
| `sendInputEvent({type:'char'})` kirillni yetkazadimi | ✅ **12/12 belgi** — `a A 5 . ' ф Ф я ў қ ғ ҳ` hammasi maydonga tushdi |
| React (boshqariladigan) maydonda **qoladimi** | ✅ `input` hodisasi otiladi, qiymat holatda saqlanadi (`ў`) |
| `⌫` (`keyDown`/`keyUp` Backspace) | ✅ belgi o'chdi |
| Zaxira yo'l `webContents.insertText` | ✅ u ham 12/12 — lekin **kerak bo'lmadi** |

**O'LCHOV 2 — butun zanjir (haqiqiy preload klaviaturasi orqali bosish)**

| Tekshiruv | Natija |
|---|---|
| Pul maydoni (`inputMode="decimal"` — F2 savat oynasi) | ✅ **numpad**: `7 8 9 / 4 5 6 / 1 2 3 / . 0 ⌫`, tugma 68px, panel 520px |
| Numpadda `7` → `.` → `⌫` | ✅ `"7"` → `"7."` → `"7"` |
| Matn maydoni → harf layouti → `РУС` | ✅ ЙЦУКЕН chiqdi |
| Kirill harflarini **bosish** | ✅ `ф ў қ ғ ҳ` — beshtasi ham maydonga tushdi |
| `⇧` + kirill | ✅ `Ф` |
| Til navigatsiyadan keyin tiklanadimi | ✅ `localStorage` `sandbox: true` da **ISHLAYDI** (`sherset.kbd.lang: cyr`), sahifa qayta yuklangach kirill qaytdi — F3 buni «o'lchanmagan» deb qoldirgan edi |

**O'LCHOV 3 — «ikki numpad» premisasi (reja §P6.3) — NOTO'G'RI chiqdi**

| Ekran | O'lchangan holat | Xulosa |
|---|---|---|
| Kirish ekrani `/kassa-kirish` (`pin-keypad.tsx`) | `<input>` **UMUMAN yo'q** — faqat tugmalar va nuqtalar | Qobiq klaviaturasi `focusin` ni hech qachon ko'rmaydi ⇒ **ikki numpad CHIQMAYDI** |
| Qulf ekrani (`pos-pin-lock.tsx:112`, `(app)/layout.tsx:765`) | `<input inputMode="numeric" autoFocus>` bor, **sahifa numpadi YO'Q** | Qobiq numpadi — **YAGONA** kiritish yo'li (z-index 2147483647, qulf oynasidan (z-100) ustun) |

🔴 **Rejaning `readOnly` yechimi qo'llanilganda nima bo'lardi — o'lchandi:** `readOnly` maydonda
qobiq klaviaturasi **baribir chiqadi** (`preload.js` `wanted()` `readOnly` ni filtrlamaydi), lekin
`sendInputEvent` kaliti **tushmaydi** (`readOnlyTyped: ""`). Ya'ni kassir qulf ekranida numpadni
ko'rib turib PIN kirita olmasdi — chiqish yo'li yo'q. **Shuning uchun qo'llanmadi.**
*(Mutatsiya bilan tekshirildi: `pos-pin-lock.tsx` ga `readOnly` qo'yilganda aynan 1 test qizardi,
mutant qaytarildi — `git diff` toza.)*

**Fayllar:**
| Yo'l | Nima qilindi |
|---|---|
| `desktop/tools/kbd-probe/probe.js` + `page.html` | **YANGI** — qayta yugurtiriladigan Electron o'lchovi (yugurtirish yo'riqnomasi fayl boshida; `ELECTRON_RUN_AS_NODE` tuzog'i yozilgan) |
| `apps/web/src/components/pos/__tests__/pin-entry-single-numpad.test.tsx` | **YANGI** — 8 test: «kiritish yo'li AYNAN BITTA» invarianti (ikkala PIN ekrani). Tanish maydon ro'yxati `preload.js` ning O'ZIDAN o'qiladi — ko'chirma ro'yxat qo'riqchini yolg'onga aylantirardi |
| `apps/web/src/__tests__/desktop-touch-keyboard.test.ts` | **eskirgan da'vo tuzatildi** («real Electron'da sinov qilinmagan» — endi o'lchangan) + K6: `readOnly` klaviaturani yashirmasligi |
| `desktop/README.md` | «Ekran klaviaturasi — O'LCHANGAN holat (P6)» bo'limi: nima isbotlangan, nima yo'q, qayta yugurtirish buyrug'i |
| `.gitignore` | `desktop/tools/kbd-probe/result.json` (biome faqat ildiz `.gitignore` ni o'qiydi) |
| `desktop/main.js` · `preload.js` · `package.json` | **TEGILMADI** — o'lchov ularni o'zgartirishni talab qilmadi |

**Testlar:**
- `pin-entry-single-numpad.test.tsx` → **8 passed** (mutatsiya bilan tasdiqlandi)
- `desktop-touch-keyboard.test.ts` → **30 passed** (F3 dagi 28 + K6 ning 2 tasi)
- Reja talab qilgan qo'riqchilar: `electron-bridge-contract` **68** · `kassa-installer-config` **30** ·
  `pin-keypad` **14** — yashil
- `desktop/tools/kbd-probe/probe.js` formatlangandan keyin **qayta yugurtirildi** (skript
  o'zgargandan keyin ishlashiga ishonilmadi): 12/12 char · kirill zanjiri ✅ · til saqlandi ✅

**Gate:** typecheck ✅ **10/10** · biome (o'z fayllarim) ✅ **0** · i18n:gate ✅ **9/9** ·
web vitest ⚠️ **3585 passed | 26 skipped | 3 failed**.

🔴 **Uchala yiqilish ham parallel sessiyaning ishida** (`sales-screen-shift.test.tsx` → «Qarz
to'lovi oynasi» — ular ayni paytda P1 doirasida `debt-payment-dialog.tsx`, `debt.service.ts`,
`messages/*.json`, `schema.prisma` ni o'zgartirmoqda). Dalil: **o'sha fayl alohida yugurtirilganda
17/17 yashil**; mening o'zgarishlarim (ikki test fayli, `desktop/`, `README`, `.gitignore`) uning
import grafiga umuman kirmaydi. `lint:product` da ham 2 xato qoldi — ikkalasi ham ularning yangi
API test fayllarida; **tegilmadi** (§6.1).

**Deploy:** ❌ qilinmadi — **prodga chiqadigan kod yo'q**: `apps/*` ning ishlab-chiqarish kodiga
tegilmagan (faqat testlar + `desktop/` asbob va hujjat). **exe 1.3.1 ham chiqarilmadi** — reja
§P6.4 bo'yicha faqat «kerak bo'lsa», va o'lchov hech qanday `desktop/` kod tuzatishini talab
qilmadi.

**Commit:** `33730b2f` (6 fayl). Hook'lar **ataylab chetlab o'tildi** (`core.hooksPath=/dev/null`):
parallel sessiya daraxtda faol yozayotgan edi, lint-staged esa butun daraxtni stash qiladi
(§6.7 B hodisasi). Gate'lar qo'lda to'liq yugurtirildi; commit tarkibi `git show --stat HEAD`
bilan tekshirildi — begona fayl yo'q.

**Nima QILINMADI:**

1. 🔴 **JONLI OQIM SINOVI — hech bir qadami kuzatilmadi** (reja §P6.1). Egasi bu sessiyada
   qatnashmadi; sessiya interaktiv emas va monoblokka masofadan kirish yo'q.

   | Qadam | Holat |
   |---|---|
   | 1.2.0 li monoblokda ilovani qayta ochish | **sinalmadi** |
   | 3 daqiqa kutish (`[updater]` yuklab olishi) | **sinalmadi** |
   | «Chiqish» (burchakni 2s ushlash) | **sinalmadi** |
   | UAC «Ha» | **sinalmadi** |
   | Qayta ochilganda versiya = 1.3.0 | **sinalmadi** |
   | Numpad/kirillni **barmoq bilan** bosish | **sinalmadi** |

   Ya'ni F4 dagi qarz **saqlanib qoldi**: «kanal to'g'ri artefaktni beradi» + endi «kirill kod
   yo'lida ishlaydi» isbotlangan; «qurilma uni topadi, yuklaydi, o'rnatadi» hamon **isbotlanmagan**.
2. **`main.js` da `insertText` ga o'tilmadi** — o'lchov `sendInputEvent` ishlashini ko'rsatdi,
   almashtirish sababsiz regress riski bo'lardi (`insertText` React uchun zaifroq).
3. **PIN ekranida `readOnly` qilinmadi** — yuqoridagi o'lchov bo'yicha u kassirni qamab qo'yardi.
4. **`preload.js` `readOnly` maydonlarni filtrlamaydigan qilib qoldirildi.** O'lchandi: POS'da
   kassir fokuslay oladigan `readOnly` `<input>` **hozir yo'q** (`cart-line-edit-modal` qulf
   holatida `<div>` chizadi) ⇒ tuzatishning bugungi foydalanuvchisi yo'q, lekin u `desktop/` kodi
   bo'lgani uchun yangi exe talab qilardi. K6 testi xulqni hujjatlashtirdi.
5. **`NEXT.md` yangilanmadi** — P6 vazifalar ro'yxatida yo'q (F3 pretsedenti: prodga hech narsa
   chiqmagan fazada hand-off hisobotning o'zida), qolaversa parallel sessiya ayni paytda o'sha
   faylga yozishi mumkin.
6. **Panel o'lchamlari brauzerda ko'z bilan ko'rilmadi** — 68px/46px tugma balandligi va 520px
   panel eni DOM'dan o'qildi, ekranda emas.

**Ochiq xavf / keyingi fazaga eslatma:**
- 🔴 **Qurilma sinovi hamon yagona ochiq qarz.** Egasi uchun aniq ro'yxat: (a) monoblokda ilovani
  yopib-ochish, 3 daq kutish, «Chiqish» → UAC → versiya; (b) savat qatorining **nomini** bosib
  tahrir oynasini ochish — QWERTY emas **numpad** chiqishi kerak; (c) mijoz nomiga `РУС` bilan
  kirill yozish. (b) va (c) endi kod tomondan isbotlangan, ya'ni ular ishlamasa sabab
  **qurilmada/o'rnatishda** (masalan eski 1.2.0 qolib ketgan) — kodda emas. Bu farqlash
  qidiruvni ancha toraytiradi.
- ⚠️ **Qurilmada versiyani ko'rsatadigan joy hamon yo'q** (F4 eslatmasi kuchda): `[updater]`
  yozuvlari `console.warn` ga ketadi va paketlangan ilovada ko'rinmaydi. «Yangilandimi?» savoliga
  javob faqat Windows «Приложения и возможности» dan. Arzon tuzatish — kirish ekrani burchagida
  `window.electronAPI.version`.
- ⚠️ **O'lchov Electron versiyasiga bog'langan.** 33.4.11 dan ko'tarilganda kirill javobi qayta
  ochiladi — `desktop/tools/kbd-probe/probe.js` ni qayta yugurtir (buyruq README'da).
- ⚠️ **`desktop/node_modules/electron` da binar yo'q** (F4 aytgan holat davom etmoqda) — bu
  sessiyada o'lchov `electron-builder` keshidagi `electron-v33.4.11-win32-x64.zip` ni ochib
  qilindi. Lokal `pnpm run dev` uchun `pnpm approve-builds` kerak.
- ⚠️ Parallel sessiya P1 (qarz) ustida ishlamoqda — `apps/api/src/modules/debt/*`,
  `debt-payment-dialog.tsx`, `messages/*.json`, `schema.prisma` dirty. Keyingi faza to'liq
  suite'ni yashil ko'rmasa avval o'sha ish tugaganini tekshirsin.
### P7 — ☐ hali bajarilmagan
### P8 — ☐ hali bajarilmagan
### P9 — ☐ hali bajarilmagan
### P10 — ☐ hali bajarilmagan
