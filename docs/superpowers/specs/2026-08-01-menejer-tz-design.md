# TZ — 4-bo'lim: MENEJER (korxona boshqaruvi va ruxsatlar)

**Sana:** 2026-08-01 · **Holat:** dizayn tasdiqlangan (egasi tomonidan) · **Faza:** implementatsiyadan oldingi spetsifikatsiya

> 7 bo'limli tizim TZ'sining **4-qismi**. Oldingilari: [1) Kassa](2026-08-01-kassa-tz-design.md) ·
> [2) Onlayn sotuv / B2B / B2G](2026-08-01-onlayn-sotuv-b2b-b2g-tz-design.md) ·
> [3) Analitika](2026-08-01-analitika-tz-design.md). Keyingilari: 5) Ta'minotchilar, 6) HR, 7) Ombor.

---

## 0. Kontekst — nima allaqachon qurilgan

### 0.1 ERP ruxsat dvigateli (professional darajada yozilgan)
- **`PermissionScope`**: `NO < OWN < OWN_GROUP < OWN_AND_GROUP < ALL`; bir necha rolda **MAX(scope)**
  (`permissions/permissions.types.ts:8`).
- **Matritsa**: `RolePermission(roleId, entity, action, scope)` — `entity` ~100 dan ortiq slug,
  `action` ∈ `view/create/update/delete/approve/print` (`schema.prisma:502`).
- **`@RequirePermission` dekoratori** + **`PermissionsGuard`** — yozuv endpoint'lari himoyalangan.
- `EmployeeRole` — ko'p rol, ruxsatlar UNION/MAX bilan birlashadi.
- `audit-log` moduli mavjud (`catalog-history`, `document-history` testlari bilan).
- `notification` moduli + WebSocket gateway mavjud.

### 0.2 Aniqlangan muammolar

**P1 — Ikkita parallel ruxsat tizimi.**

| Tizim | Model | Daraja | Joyi |
|---|---|---|---|
| ERP | `entity × action × scope` | **rol** | `permissions` moduli |
| HR | `page × section × access` (`full`/`read`/`own_only`) | **xodim** | `hr/hr-employee-permission`, `hr-auth/hr-permission.types.ts` |

Ikkalasi bir-birini bilmaydi. Admin ruxsatni ikki joyda sozlaydi → vaqt o'tib ular bir-biriga
zid bo'ladi va **qaysi biri amal qilishi noaniq** bo'lib qoladi.

**P2 — Yozuv darajasidagi ko'rinish chegarasi amalda ishlamaydi.**
- `Account.recordScopeEnforced` — **default `false`** (`schema.prisma:51`).
- `recordScopeWhere` / `assertRecordAccess` faqat **5 ta faylda** ulangan (`customer-order`,
  `demand` + testlar), API'da ~130 modul bor.
- Natija: menejerga `OWN_GROUP` berilsa ham, u amalda **hamma narsani ko'raveradi**.

**P3 — Individual (xodim darajasidagi) ruxsat ERP tomonida umuman yo'q** — faqat rol orqali.

---

## 1. Maqsad

Menejer — korxonani boshqaradigan odam: xodimlar, plan, tasdiqlashlar, mijoz taqsimoti, narx
siyosati, ombor va ta'minot nazorati. **Uning o'z vakolatlari admin tomonidan beriladi** va aniq
chegaralangan bo'ladi.

---

## 2. Qabul qilingan qarorlar

| # | Qaror | Tanlangan |
|---|---|---|
| Q1 | Menejer qamrovi | xodimlar (rol/dostup/plan/bonus-jarima) · tasdiqlash navbati · mijoz taqsimoti va narx siyosati · ombor va ta'minot nazorati |
| Q2 | Dostup berish | **Rol shabloni + xodimga individual tuzatish** |
| Q3 | Ko'rinish chegarasi | **`OWN_GROUP` yoqiladi** (o'z bo'limi/guruhi) |
| Q4 | Tasdiqlash qamrovi | kassa kamomadi · katta chegirma/zararga sotuv · katta qarz va muddati o'tgan qarz |
| Q5 | Xarajatlar | **tasdiqlanmaydi** — erkin qoladi (1-bo'lim Q10 bilan izchil), faqat analitikada ko'rinadi |
| Q6 | Tasdiqlash tabiati | **bloklamaydi** — keyingi ko'rib chiqish navbati (§5) |

---

## 3. Yagona ruxsat modeli (P1 + P3 yechimi)

### 3.1 Ikki qatlam

```
Amaldagi ruxsat = ROL qatlami → XODIM qatlami (override)

1. RolePermission(roleId, entity, action, scope)          — shablon (mavjud)
2. EmployeePermission(employeeId, entity, action, scope)  — individual override (YANGI)
```

**Hisoblash tartibi:**
1. Xodimning barcha rollari bo'yicha `MAX(scope)` — mavjud qoida saqlanadi.
2. Shu (entity, action) uchun `EmployeePermission` bo'lsa — **u g'olib** (rol natijasini
   ko'taradi ham, tushiradi ham).

Sabab: «individual tuzatish» aynan ikki tomonlama bo'lishi kerak — bitta xodimga qo'shimcha
berish ham, bitta xodimni cheklash ham. `MAX` qilinsa cheklash imkonsiz bo'lib qoladi.

### 3.2 HR ruxsatlarini birlashtirish
- `HR_PAGE_KEYS` (`dashboard`, `messages`, `reports`, `employees`, `tasks`, `oylik`, `activity`,
  `settings`) → ERP `entity` slug'lariga **xaritalanadi**.
- `HR_ACCESS_LEVELS` → scope'ga: `full → ALL`, `read → ALL (faqat view)`, `own_only → OWN`.
- **HR UI o'zgarmaydi** — u adapter orqali yagona omborga yozadi. Ma'lumot bitta joyda saqlanadi.
- Migratsiya: mavjud `hr_employee_permissions` yozuvlari `EmployeePermission` ga ko'chiriladi
  (bir martalik skript + tekshiruv hisoboti).

### 3.3 Majburiy qo'riqchilar

**G1 — Imtiyoz oshirish taqiqi (privilege escalation).**
Menejer **o'zida yo'q ruxsatni** boshqaga bera olmaydi va **o'zidan yuqori scope** tayinlay olmaydi.
Aks holda bir marta `role:update` ruxsatini olgan xodim o'zini adminga aylantiradi.
Tekshiruv **server tomonda** (UI'da yashirish yetarli emas), alohida testlar bilan.

**G2 — «Nega bu ruxsat bor?» (explainability).**
Har xodim kartasida har ruxsat qatorida manbasi ko'rsatiladi:
```
demand : view : ALL     ← «Savdo menejeri» rolidan
debt   : update : OWN   ← individual berilgan · 2026-08-01 · Admin
```
Sabab: tushunarsiz ruxsat tizimi **noto'g'ri sozlanadi**. Bu — xavfsizlik xususiyati, qulaylik emas.

**G3 — Audit.**
Har ruxsat o'zgarishi `audit-log` ga: kim, kimga, qaysi entity/action, eski→yangi scope, qachon.

### 3.4 Rol shablonlari (boshlang'ich to'plam)
`Egasi` · `Admin` · `Savdo menejeri` · `Ombor menejeri` · `Kassir` (kiosk) · `Sotuvchi (B2B/B2G)` ·
`Omborchi` · `Buxgalter` · `Ta'minotchi` · `Haydovchi`.
Har biri tayyor matritsa bilan seed qilinadi; admin ularni tahrirlaydi yoki yangisini yaratadi.

---

## 4. Ko'rinish chegarasi — `OWN_GROUP` (P2 yechimi)

### 4.1 Halol baho
Mexanizm bor, lekin **ish katta**: hozir 5 fayl ulangan, ~130 modul bor. Bir sessiyada bajarilmaydi.

### 4.2 To'lqinlar

| To'lqin | Modullar | Sabab |
|---|---|---|
| **1** | `customer-order` ✓, `demand` ✓, `invoice-out`, `retail-sale`, `sales-return` | eng maxfiy — kim kimga, qanday narxda sotgani |
| **2** | `payment-in/out`, `cash-in/out`, `debt`, `counterparty-balance` | moliyaviy maxfiylik |
| **3** | `counterparty`, `contract`, `call`, `task`, `opportunity` | mijoz bazasi (sotuvchilar raqobati) |
| **4** | qolgan modullar (katalog, ombor, hisobotlar) | to'liqlik |

### 4.3 Qoidalar
- **`Account.recordScopeEnforced` flagi to'lqin tugagach yoqiladi.** Yarim yoqilgan holat xavfli:
  bir ro'yxatda cheklangan, boshqasida ochiq ma'lumot — foydalanuvchi buni tizim xatosi deb biladi.
- **Avtomatik qo'riqchi:** yozuv-scope talab qiladigan yangi modul qo'shilib, `recordScopeWhere`
  ulanmasa — **test yiqiladi** (kodda shunga o'xshash qo'riqchi naqshlari bor:
  `demand-position-endpoint.test.ts` manba matnini tekshiradi). Aks holda chegaralar asta-sekin
  «teshiladi».
- **Guruh manbai:** `Employee.groupId` — HR bo'limi (6-bo'lim `hr-department`) bilan bog'lanadi;
  ikki xil «bo'lim» tushunchasi bo'lmasligi kerak.
- **Mavjudlik sizib chiqishi (existence leak):** ruxsatsiz yozuvga murojaatda `403` emas, `404`
  qaytariladi (kodda bu naqsh allaqachon bor — `customer-order.service.ts:271` izohi).

---

## 5. Tasdiqlash navbati (Q4, Q6)

### 5.1 Tabiati — bloklamaydi
Kassir va sotuvchi erkin qoldirilgan (1-bo'lim Q4/Q8/Q11, 2-bo'lim). Shuning uchun bu navbat —
**to'siq emas, keyingi ko'rib chiqish**. Sotuv ketaveradi, menejer keyin ko'radi va choralar ko'radi.

### 5.2 Yagona qoida modeli
```
ApprovalRule { type, threshold, mode: 'review' | 'block' }   // default: 'review'
```
Kod o'zgarmasdan qat'iylikni oshirish mumkin: kelajakda biror qoidani `block` ga o'tkazish —
sozlama, yangi ishlab chiqish emas.

| Qoida turi | Chegara (sozlanadi) | Boshlang'ich rejim |
|---|---|---|
| `CASH_VARIANCE` — kassa kamomadi/ortiqchasi | har qanday farq | review |
| `BIG_DISCOUNT` — katta chegirma | masalan > 10% | review |
| `BELOW_COST` — tan narxdan past sotuv | har qanday | review |
| `BIG_DEBT` — katta qarz | masalan > 5 000 000 so'm | review |
| `OVERDUE_DEBT` — muddati o'tgan qarz | masalan > 30 kun | review |

### 5.3 Navbat elementi
Har element: **hodisa turi · kim · qancha · qachon · hujjatga havola · kontekst** (masalan
kassirning shu oydagi o'rtacha chegirmasi — bitta hodisa emas, naqsh ko'rinsin).

**Menejer harakatlari:** `Tasdiqlash` · `Tushuntirish so'rash` (xodimga bildirishnoma) ·
`Jarima yozish` (→ 6-bo'lim `hr-bonus-fine`) · `Tekshiruv boshlash` (inventarizatsiya/audit).

Har qaror `audit-log` ga; javobsiz qolgan element **eskirish belgisi** bilan yuqoriga chiqadi
(3 kundan ortiq ko'rilmagan).

### 5.4 Nima tasdiqlanmaydi
**Xarajatlar va hisobdan chiqarish** — egasining qarori bo'yicha erkin (Q5). Ular faqat analitikada
va audit jurnalida ko'rinadi. Kerak bo'lsa keyin `ApprovalRule` ga yangi tur qo'shiladi — model buni
qo'llab-quvvatlaydi.

---

## 6. Xodimlar va siyosat boshqaruvi

| Blok | Mazmun | Bog'lanish |
|---|---|---|
| **Plan qo'yish** | oylik plan: xodim / bo'lim / kanal kesimida (summa yoki foyda) | 2-bo'lim `SalesPlan`, 3-bo'lim panellari |
| **Bonus va jarima** | tayinlash, tarix, oylikka ta'siri | 6-bo'lim `hr-bonus-fine` |
| **Mijoz taqsimoti** | egasini o'zgartirish, erkin havzadan biriktirish, bonus istisnosi (`bonusToId`) | 2-bo'lim §3 |
| **Narx siyosati** | narx turlari, guruh narxlari, chegirma chegaralari (`ApprovalRule.threshold`) | 1-, 2-bo'limlar |
| **Xodim kartasi** | rol, individual ruxsat, plan, natija, jarima/bonus tarixi — **bitta ekranda** | 6-bo'lim |

---

## 7. Ombor va ta'minot nazorati (kirish nuqtasi)
Menejer paneli orqali: qoldiqlar va o'lik zaxira · inventarizatsiya buyurtmasi ·
ta'minotchiga buyurtma tasdig'i · yetkazish nazorati.
**Batafsil mantiq 5- va 7-bo'limlarda**, bu yerda faqat kirish nuqtasi va ruxsat modeli.

## 8. Menejer paneli
3-bo'limdagi menejer paneli (plan/fakt, xodimlar reytingi, og'ishlar, tugab qolayotgan tovarlar,
muddati o'tgan qarzlar) + **tasdiqlash navbati hisoblagichi** (nechta element kutmoqda).

---

## 9. Baza o'zgarishlari

| O'zgarish | Tafsilot |
|---|---|
| `EmployeePermission` | yangi: `employeeId, entity, action, scope` — individual override qatlami |
| `ApprovalRule` | yangi: `type, threshold, mode, enabled` |
| `ApprovalItem` | yangi: `ruleType, subjectEmployeeId, docType, docId, amountMinor, state, decidedById, decision, note` |
| `Employee.groupId` | mavjud — HR bo'limi bilan bog'lanadi (6-bo'lim) |
| `Account.recordScopeEnforced` | mavjud — to'lqinlar tugagach `true` ga o'tkaziladi |
| HR ruxsat migratsiyasi | `hr_employee_permissions` → `EmployeePermission` (bir martalik skript + hisobot) |

---

## 10. Testlash

### 10.1 Unit
- Amaldagi ruxsat: rol MAX → xodim override (ko'tarish **va** tushirish holatlari)
- **G1**: menejer o'zida yo'q ruxsatni bera olmasligi; o'zidan yuqori scope tayinlay olmasligi
- **G2**: har ruxsat qatorining manbasi to'g'ri aniqlanishi
- HR adapter xaritalash: `full/read/own_only` → scope
- `ApprovalRule` chegaralari: chegara ustida/ostida hodisa hosil bo'lishi
- Record-scope: `OWN` / `OWN_GROUP` / `ALL` uchun `where` bandlari (mavjud testlar kengaytiriladi)

### 10.2 Qo'riqchi testlari
- Yozuv-scope talab qiladigan modul ro'yxati vs `recordScopeWhere` ulangan modullar — **farq bo'lsa
  test yiqiladi**
- Ruxsatsiz yozuvga murojaat `404` qaytarishi (mavjudlik sizib chiqishiga qarshi)

### 10.3 E2E
Admin rol yaratadi → menejerga beradi → menejer o'z bo'limi hujjatlarini ko'radi, boshqasini
ko'rmaydi → kassada kamomad chiqadi → menejer navbatida paydo bo'ladi → jarima yozadi →
HR oyligida aks etadi.

### 10.4 Gate
`typecheck 0` · `biome 0` · i18n (ru+uz) · Vitest regressiyasiz · **Phase-2 QA** real brauzerda.

---

## 11. Bosqichlar

| Bosqich | Mazmun | Sabab |
|---|---|---|
| **B1** | `EmployeePermission` qatlami + amaldagi ruxsat hisobi + G1/G2/G3 | «Rol + individual» talabining yadrosi |
| **B2** | HR ruxsatlarini birlashtirish (adapter + migratsiya) | Ikki tizim ziddiyatini yopadi |
| **B3** | Ruxsat matritsasi UI (entity × action × scope) + rol shablonlari | Admin ishlay boshlaydi |
| **B4** | Tasdiqlash navbati: `ApprovalRule` + `ApprovalItem` + menejer ekrani | Nazorat halqasi |
| **B5** | Record-scope 1-to'lqin (savdo hujjatlari) + qo'riqchi test | Maxfiylik — eng muhim modullar |
| **B6** | Record-scope 2–3-to'lqin (pul, mijozlar) | Kengaytirish |
| **B7** | Plan qo'yish, mijoz taqsimoti, narx siyosati ekranlari | Boshqaruv vositalari |
| **B8** | Record-scope 4-to'lqin + `recordScopeEnforced` yoqish | To'liq chegara |

---

## 12. Boshqa bo'limlarga bog'liqliklar

| Bog'liqlik | Qayerga |
|---|---|
| Kassa kamomadi, zararga sotuv hodisalari | **1-bo'lim (Kassa)** |
| Chegirma, qarz, mijoz egaligi, bonus istisnosi | **2-bo'lim (Onlayn/B2B/B2G)** |
| Menejer paneli ko'rsatkichlari | **3-bo'lim (Analitika)** |
| Ta'minotchiga buyurtma tasdig'i | **5-bo'lim (Ta'minotchilar)** |
| Bo'lim (`groupId`), jarima/bonus, xodim kartasi | **6-bo'lim (HR)** |
| Inventarizatsiya buyurtmasi, ombor nazorati | **7-bo'lim (Ombor)** |
