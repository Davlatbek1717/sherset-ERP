# TZ — 8-bo'lim: KO'P FILIALLILIK

**Sana:** 2026-08-02 · **Holat:** dizayn tasdiqlangan (egasi tomonidan) · **Faza:** implementatsiyadan oldingi spetsifikatsiya

> Tizim TZ'sining **8-qismi** (egasi tomonidan keyin qo'shilgan). Oldingilari:
> [1) Kassa](2026-08-01-kassa-tz-design.md) · [2) Onlayn sotuv](2026-08-01-onlayn-sotuv-b2b-b2g-tz-design.md) ·
> [3) Analitika](2026-08-01-analitika-tz-design.md) · [4) Menejer](2026-08-01-menejer-tz-design.md) ·
> [5) Ta'minotchilar](2026-08-01-taminotchilar-tz-design.md) · [6) HR](2026-08-02-hr-tz-design.md) ·
> [7) Ombor](2026-08-02-ombor-tz-design.md).

---

## 0. Kontekst — hozirgi darajalar

| Daraja | Model | Mazmun |
|---|---|---|
| Ijarachi | `Account` | butun tizim; **hamma narsa `accountId` bilan ajratilgan** (ko'p-ijarachilik tayyor) |
| Yuridik shaxs | `Organization` | STIR, direktor, QQS, bank rekvizitlari — **83 ta havola** |
| Ombor | `Store` | **ierarxiya bor**: `parentId`, `pathName` — **70 ta havola** |
| Zona / yacheyka | `StoreZone` / `StoreCell` / `StockByCell` | 7-bo'lim |
| Kassa | `CashDesk` | |
| Bo'lim | `Employee.groupId` | 4-, 6-bo'limlar |

**«Filial» tushunchasi yo'q.** 7-bo'limda `Store` darajasi ataylab bo'sh qoldirilgan edi —
zonalar (sklad 1..N) `Store` **ichida** joylashdi, aynan shu bo'lim uchun.

---

## 1. Qabul qilingan qarorlar

| # | Qaror | Tanlangan |
|---|---|---|
| Q1 | Filial mohiyati | **Claude tanlagan** (egasi topshirdi): bitta yuridik shaxs + alohida `Branch` ob'ekti — §2 |
| Q2 | Umumiy resurslar | **narxlar · mijozlar bazasi · xodimlar** (+ katalog — §1.1) |
| Q3 | Filiallararo harakat | **Ichki ko'chirish (Move) — tasdiq bilan** |
| Q4 | Ko'rinish | **Filial boshlig'i — faqat o'z filiali; egasi — hammasi** |

### 1.1 Katalog haqida (aniqlashtirilgan taxmin)
Egasi **narxlarni umumiy** deb belgiladi, lekin **tovar katalogini** belgilamadi. Narxlar
(`SalePrice`) tovar kartasida saqlanadi — katalog umumiy bo'lmasa, umumiy narx ma'nosini yo'qotadi.
Shuning uchun: **tovar katalogi umumiy**, **qoldiq esa har filialda alohida** (`Stock` va
`StockByCell` allaqachon `storeId` bo'yicha ajratilgan).
*Egasi buni tuzatishi mumkin: agar filiallarda turli assortiment kerak bo'lsa — filial bo'yicha
«ko'rinadigan tovarlar» filtri qo'shiladi (model o'zgarmaydi).*

---

## 2. Filial modeli (Q1 — asoslangan qaror)

### 2.1 Nega bitta yuridik shaxs
Egasining boshqa javoblari shu tomonga ishora qiladi:
- **«Ichki ko'chirish (Move)»** tanlandi — alohida yuridik shaxslar orasida tovar ko'chirish
  huquqiy jihatdan **rasmiy sotuv** bo'lishi shart (faktura bilan), oddiy ko'chirish emas.
- **Umumiy mijozlar bazasi** va **umumiy xodimlar** — bir yuridik shaxs belgisi.

### 2.2 Nega `Store` filialga aylantirilmaydi
- Bitta filialda **bir nechta ombor** bo'lishi mumkin (asosiy ombor + savdo zali).
- Filialda kassa, xodimlar, plan, hisobot bor — bular **ombor xususiyati emas**.
- `Store` allaqachon o'z ierarxiyasiga ega (`parentId`) va 7-bo'limda zonalar bilan band.

### 2.3 Model
```
Branch (filial)                       ← YANGI
  ├─ organizationId  → Organization   (yuridik shaxs; bugun hammasida bir xil)
  ├─ Store[]         (omborlar → zonalar → yacheykalar — 7-bo'lim)
  ├─ CashDesk[]      (kassalar — 1-bo'lim)
  └─ Employee[]      (ko'p-ko'pga: xodim bir necha filialda ishlashi mumkin)
```

**`organizationId` nega bor:** bugun hamma filial bitta STIR ostida. Ertaga alohida yuridik shaxs
ochilsa — model **buzilmaydi**, faqat o'sha filialga boshqa `Organization` biriktiriladi va
filiallararo harakat §5.2 bo'yicha rasmiy sotuvga o'tadi. Hujjatlarda `organizationId` allaqachon bor.

---

## 3. Filial o'lchovi hujjatlarda

### 3.1 Muhrlash (stamping)
Har hujjat yaratilganda **`branchId` muhrlanadi** — foydalanuvchining **faol filiali**dan.
Nega hisoblab olinmaydi (`storeId` orqali): `storeId` ba'zi hujjatlarda `null` bo'ladi
(masalan to'lov, vazifa, qo'ng'iroq), va tarixiy hujjat filiali ombor keyin boshqa filialga
o'tkazilsa **o'zgarib ketardi**. Muhrlangan qiymat — tarixiy haqiqat.

Muhrlanadigan hujjatlar: barcha savdo hujjatlari · pul hujjatlari (`cash-in/out`,
`payment-in/out`) · ombor hujjatlari (`supply`, `enter`, `loss`, `move`, `inventory`) ·
kassa sessiyasi · CRM (`task`, `call`, `opportunity`).

Muhrlanmaydi (umumiy): tovar, narx turi, kontragent, xodim, rol — bular filialga tegishli emas.

### 3.2 Faol filial (branch switcher)
- Xodimga bir yoki bir necha filial biriktiriladi + **`defaultBranchId`**.
- Interfeys yuqorisida **filial almashtirgich** (faqat bir nechta filialga ruxsati borlarda ko'rinadi).
- Kiosk kassir (1-bo'lim §3.1) almashtira **olmaydi** — uning filiali kassasidan aniqlanadi.
- Faol filial **server tomonda** tekshiriladi: ruxsat berilmagan filial `branchId` bilan hujjat
  yaratish rad etiladi (UI'ni chetlab o'tishga qarshi).

---

## 4. Umumiy va ajratilgan resurslar (Q2)

| Resurs | Holat | Izoh |
|---|---|---|
| **Tovar katalogi** | umumiy | §1.1 |
| **Narxlar** | umumiy | filial bo'yicha istisno — kelajak imkoniyati, hozir qurilmaydi |
| **Mijozlar bazasi** | umumiy | mijoz istalgan filialda xizmat oladi |
| **Mijoz qarzi** | **umumiy (konsolidatsiya)** | §4.1 |
| **Xodimlar** | umumiy (ko'p-ko'pga) | menejer bir necha filialni boshqarishi mumkin |
| **Qoldiq** | **filial bo'yicha** | `Stock`/`StockByCell` — `storeId` orqali |
| **Kassa va pul** | **filial bo'yicha** | har filialning o'z kassasi va smenalari |
| **Plan va KPI** | **filial bo'yicha** | 2-, 6-bo'limlar; xodim bir necha filialda ishlasa — plan filial kesimida |
| **Ta'minotchilar** | umumiy | buyurtma filialga yetkaziladi (`Supply.branchId`) |

### 4.1 Mijoz qarzi — umumiy (muhim qaror)
Mijoz A filialida qarzga oldi, B filialida to'lasa — **balans bitta**. Aks holda bir mijoz har
filialda alohida qarzdor bo'lib qoladi va undirish imkonsiz bo'ladi.
- Kassa (1-bo'lim §7.2) qarz to'lovi **umumiy balansga** tushadi — bu allaqachon shunday.
- Hisobotda **qaysi filialda qarz paydo bo'lgani** va **qaysi filialda to'langani** alohida ko'rinadi
  (bonus va nazorat uchun — 2-bo'lim Qoida 2).

---

## 5. Filiallararo harakat (Q3)

### 5.1 Ichki ko'chirish — tasdiq bilan
```
A filiali: Move yaratadi va jo'natadi  →  [YO'LDAGI TOVAR]  →  B filiali: qabul qiladi va tasdiqlaydi
```
- Jo'natilgan tovar A qoldig'idan **chiqadi**, B qoldig'iga **hali kirmaydi** — «yo'lda» holatida
  alohida ko'rinadi. Bu — 5-bo'limdagi `supply-approval` naqshining aynan o'zi
  (jo'natish ≠ qabul; qoldiq faqat tasdiqdan keyin).
- Qabul qilishda **kam/buzuq** belgilash mumkin → farq akti va javobgarlik (7-bo'lim §8 bilan bir xil).
- Yacheyka: chiqishda **manba yacheykasi**, kirishda **maqsad yacheykasi** (7-bo'lim intizomi).
- Kodda `move` va `internal-order` modullari mavjud — ular ustiga quriladi.

### 5.2 Alohida yuridik shaxs holati (kelajak)
Agar filialga boshqa `Organization` biriktirilsa — ichki ko'chirish o'rniga **rasmiy sotuv**
(`Demand` + `InvoiceOut` + EDO faktura) va qarshi tomonda **xarid** (`Supply` + `InvoiceIn`)
hujjatlari yaratiladi. Model buni qo'llab-quvvatlaydi; oqim **hozir qurilmaydi**, lekin
`Branch.organizationId` mavjudligi buni keyin qo'shishga imkon beradi.

---

## 6. Ko'rinish va ruxsat (Q4)

4-bo'limdagi ruxsat modeliga **filial o'qi** qo'shiladi:

```
Amaldagi ko'rinish = ruxsat scope (NO…ALL)  ∩  ruxsat berilgan FILIALLAR
```

- Xodimga **ruxsat berilgan filiallar ro'yxati** biriktiriladi.
- Filial boshlig'i: `ALL` scope, lekin **faqat o'z filiali** — hamma narsani ko'radi, o'z filialida.
- Egasi / bosh menejer: **barcha filiallar** + **konsolidatsiya**.
- Kiosk kassir: o'z filiali, o'z smenasi (1-bo'lim §3.3).
- **Server tomonda majburiy** — 4-bo'lim §4 dagi record-scope to'lqinlariga filial filtri **birga**
  qo'shiladi (ikki marta ish qilmaslik uchun bitta to'lqinda).

**Qo'riqchi:** filial filtri **default `deny`** — yangi ro'yxat endpoint'i filial filtrini
qo'llamasa, test yiqiladi (4-bo'lim §4.3 naqshi).

---

## 7. Analitika — filial kesimi (3-bo'lim bilan)

- **Barcha ko'rsatkichlarga filial o'lchovi** qo'shiladi (3-bo'lim §4 kesimlar ro'yxatiga).
- Rollup jadvallariga `branchId` (3-bo'lim §5.1) — panel filial bo'yicha ham, konsolidatsiya
  bo'yicha ham ochiladi.
- **Filiallar solishtiruvi** — egasi uchun asosiy ekran: tushum, foyda, marja, qarz, ombor qiymati,
  o'lik zaxira, xodim samaradorligi — filiallar yonma-yon.
- **Filiallararo oqim** hisoboti: qaysi filialdan qaysisiga qancha tovar ketdi (§5.1).

---

## 8. Baza o'zgarishlari

| O'zgarish | Tafsilot |
|---|---|
| `Branch` | yangi: `accountId, name, code, address, organizationId, archived, sortOrder` |
| `Store.branchId` | `uuid?` → `Branch` |
| `CashDesk.branchId` | `uuid?` → `Branch` |
| `EmployeeBranch` | yangi ko'p-ko'pga: `employeeId, branchId` |
| `Employee.defaultBranchId` | `uuid?` |
| Hujjatlarda `branchId` | §3.1 ro'yxati bo'yicha — muhrlanadi |
| Rollup jadvallarida `branchId` | 3-bo'lim §5.1 |
| `Move` — «yo'lda» holati | §5.1 (mavjud `move` moduliga holat qo'shiladi) |

### 8.1 Migratsiya (mavjud ma'lumot)
1. Bitta **standart filial** («Asosiy») yaratiladi, `organizationId` = mavjud yagona tashkilot.
2. Barcha `Store` va `CashDesk` shunga biriktiriladi.
3. Barcha xodimlar shunga biriktiriladi, `defaultBranchId` = shu.
4. Mavjud hujjatlarga `branchId` = shu filial (backfill).
5. Shundan keyin yangi filial qo'shish — oddiy amal; hech narsa buzilmaydi.

**Muhim:** bu ketma-ketlik tizimni **bir filialli holatda ham to'g'ri** ishlashini ta'minlaydi —
ko'p filiallilik yoqilmaguncha foydalanuvchi hech qanday o'zgarish sezmaydi.

---

## 9. Testlash

### 9.1 Unit
- Hujjat yaratishda `branchId` muhrlanishi; ruxsatsiz filial bilan yaratish rad etilishi
- Ko'rinish: scope ∩ filial kesishmasi (filial boshlig'i boshqa filial hujjatini ko'rmasligi)
- Qarz konsolidatsiyasi: A filialida qarz, B filialida to'lov → bitta balans
- Filiallararo ko'chirish: jo'natishda A dan chiqishi, tasdiqqacha B ga **kirmasligi**
- Migratsiya: bir filialli holatda hech narsa o'zgarmasligi (regressiya qulfi)

### 9.2 Qo'riqchi testlari
- Filial filtri qo'llanmagan ro'yxat endpoint'i — **test yiqiladi** (default deny)
- Faol filial almashtirilganda ma'lumot **to'liq** yangilanishi (kesh qoldiqlari qolmasligi)

### 9.3 E2E
Ikki filial yaratish → A filialida sotuv → B filialida o'sha mijoz qarzini to'lash →
A dan B ga tovar ko'chirish (yo'lda holati) → B qabul qilishi → egasi panelida ikki filial
solishtiruvi.

### 9.4 Gate
`typecheck 0` · `biome 0` · i18n (ru+uz) · Vitest regressiyasiz · **Phase-2 QA** real brauzerda.

---

## 10. Bosqichlar

| Bosqich | Mazmun | Sabab |
|---|---|---|
| **B1** | `Branch` modeli + migratsiya (§8.1) — bitta «Asosiy» filial | Poydevor; hech narsa o'zgarmaydi |
| **B2** | `Store`/`CashDesk`/`Employee` bog'lanishi + filial almashtirgich | Boshqaruv imkoniyati |
| **B3** | Hujjatlarda `branchId` muhrlash + backfill | Hisobot va ko'rinish uchun shart |
| **B4** | Ko'rinish: scope ∩ filial + qo'riqchi test | Maxfiylik (4-bo'lim to'lqinlari bilan **birga**) |
| **B5** | Filiallararo ko'chirish: «yo'lda» holati + qabul tasdig'i | Operatsion ehtiyoj |
| **B6** | Analitika: rollup'ga `branchId` + filiallar solishtiruvi | Egasining asosiy ekrani |
| **B7** | Filial bo'yicha plan/KPI (2-, 6-bo'limlar bilan) | Boshqaruv |

---

## 11. Boshqa bo'limlarga bog'liqliklar

| Bog'liqlik | Qayerga |
|---|---|
| Kassa filiali, kiosk kassir filial almashtira olmasligi | **1-bo'lim (Kassa)** |
| Filial bo'yicha plan, mijoz egaligi (filiallararo) | **2-bo'lim (Onlayn/B2B/B2G)** |
| Filial o'lchovi barcha ko'rsatkichlarda, solishtiruv | **3-bo'lim (Analitika)** |
| Ruxsat modeliga filial o'qi — **bitta to'lqinda** | **4-bo'lim (Menejer)** |
| Ta'minot buyurtmasi qaysi filialga yetkaziladi | **5-bo'lim (Ta'minotchilar)** |
| Xodim bir necha filialda, oylik filial kesimida | **6-bo'lim (HR)** |
| `Store` → zonalar → yacheykalar ierarxiyasi | **7-bo'lim (Ombor)** |

---

## 12. Qabul qilingan taxminlar

1. **Tovar katalogi umumiy** (§1.1) — narxlar umumiy bo'lgani uchun. Filiallarda turli assortiment
   kerak bo'lsa — «ko'rinadigan tovarlar» filtri qo'shiladi.
2. Bugun **barcha filiallar bitta `Organization`** ostida; model boshqasini ham qo'llab-quvvatlaydi.
3. Narx filial bo'yicha **farqlanmaydi** (mintaqaviy narx — kelajak imkoniyati).
4. Xodim bir necha filialda ishlashi mumkin, lekin **bir vaqtda bitta faol filial** bilan ishlaydi.
