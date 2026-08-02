# TZ — 6-bo'lim: HR (xodimlar, oylik, davomat, haydovchilar)

**Sana:** 2026-08-02 · **Holat:** dizayn tasdiqlangan (egasi tomonidan) · **Faza:** implementatsiyadan oldingi spetsifikatsiya

> 7+1 bo'limli tizim TZ'sining **6-qismi**. Oldingilari: [1) Kassa](2026-08-01-kassa-tz-design.md) ·
> [2) Onlayn sotuv](2026-08-01-onlayn-sotuv-b2b-b2g-tz-design.md) · [3) Analitika](2026-08-01-analitika-tz-design.md) ·
> [4) Menejer](2026-08-01-menejer-tz-design.md) · [5) Ta'minotchilar](2026-08-01-taminotchilar-tz-design.md).
> Keyingilari: 7) Ombor, 8) Ko'p filiallilik.

---

## 0. Kontekst — loyihaning eng yetuk moduli

HR ~25 submoduldan iborat va ko'p qismi ishlaydi.

| Qism | Joyi | Holat |
|---|---|---|
| **Oylik dvigateli** | `hr/hr-salary/hr-payroll.service.ts` | `finalSalary = fix + KPI + bonus − jarima + komissiya`, hammasi BigInt |
| KPI darajalari (tier) | `hr-salary/tier-lookup.util.ts` | bajarish % → daraja → to'lov % |
| Kunlik KPI snapshot | `HrKpiDailyLog` (`personalSalesMinor`, `targetMinor`, `achievementPercent`) | tunda cron bilan |
| Bonus/jarima | `hr/hr-bonus-fine` — 5 manba: `manual`, `rule`, `auto_task_reward`, `auto_task_fine`, `auto_expire_fine` | qoidalar kutubxonasi bilan |
| **Haydovchi tizimi** | `hr/driver-tracking` — `DriverShift`, ping oqimi, `stop-detection.util`, `dispatcher.guard` | grafiksiz smena, harakat/to'xtash soniyalari pinglardan qayta hisoblanadi |
| Davomat | `hr/attendance`, `hr/attendance-geo` (+ `attendance-notify`) | geo-tekshiruv bilan |
| Jadval | `hr/hr-schedule`, `shift-schedule` | |
| Vazifa va ko'rib chiqish | `hr/hr-task-template`, `hr-task-send`, `hr-task-review` | |
| Telegram ko'prigi | `hr/hr-telegram-bridge` (MTProto worker), `hr-telegram-account` | |
| Bo'lim, lavozim, rol | `hr-department`, `hr-position`, `hr-role`, `hr-employee-permission` | |
| **Oylik hujjati** | `payroll` moduli (alohida) — vedomost: qatorlar, raqamlash, holat o'tishlari, soliqlar, `advance` | |

Ma'lumot modeli: `Employee.salaryConfig` (Json, hozir `{baseSalaryMinor}`) · `Employee.positionId → HrPosition` ·
`Employee.trackingMode` (`geofence` | `field`) · `Employee.groupId` (bo'lim).

### 0.1 Aniqlangan ziddiyatlar

**Z1 — Ikkita oylik tizimi ulanmagan.**
`payroll` = **hujjat** (vedomost: `salary`/`bonus`/`overtime`/`vacation`/`sick`/`tax_income`/`tax_social`/
`advance`/`penalty`/`other` qatorlari, ishorali BigInt).
`hr/hr-salary` = **hisoblash dvigateli**.
Dvigatel oylikni hisoblaydi, hujjat esa **qo'lda** to'ldiriladi — ular bir-birini bilmaydi.

**Z2 — Bonus bazasi ziddiyati.**
HR dvigateli komissiyani `HrKpiDailyLog.personalSalesMinor` — ya'ni **tushumdan** hisoblaydi.
2-bo'limda esa **foydadan** va **pul tushganda** deb qaror qilingan. Ikkalasi bir vaqtda ishlay olmaydi.

**Z3 — Ta'til/ruxsat mexanizmi yo'q.** `payroll` da `vacation`/`sick` qatorlari bor, lekin so'rov,
tasdiqlash va davomatga ta'sir qilish oqimi mavjud emas.

---

## 1. Qabul qilingan qarorlar

| # | Qaror | Tanlangan |
|---|---|---|
| Q1 | Z2 yechimi | **Lavozimga qarab har xil** bonus bazasi |
| Q2 | Oylik sxemalari | fiks · fiks + % · KPI darajali (tier) · **ish birligiga (sdelnaya)** |
| Q3 | Avans | **Ariza → menejer tasdig'i → kassadan** |
| Q4 | Davomat manbalari | kassir smenasi · haydovchi smenasi · **kechikish/yo'qlik avtomatik jarima** |
| Q5 | **Ta'til** (egasi qo'shdi) | so'rov → menejer tasdig'i → o'sha kunlarda davomat talab qilinmaydi, **lekin har kun uchun oylikdan ushlanma alohida yoziladi** |

---

## 2. Lavozimga bog'langan oylik sxemasi (Q1 + Q2)

### 2.1 Ikki qatlamli sozlama
```
HrPosition.paySchemeConfig  — lavozim uchun STANDART sxema      (yangi)
Employee.salaryConfig       — xodim uchun INDIVIDUAL istisno    (mavjud, kengaytiriladi)
```
Bu — 4-bo'limdagi «rol shabloni + individual tuzatish» naqshining aynan o'zi. Yangi xodim
lavozimga qo'yilishi bilan to'g'ri sxemani oladi; istisno kerak bo'lsa — faqat o'shanga yoziladi.

### 2.2 Sxema tuzilishi
```jsonc
{
  "base":       "fix" | "none",
  "baseSalaryMinor": "500000000",
  "variable":   "none" | "percent" | "tier" | "piece",
  "bonusBase":  "revenue" | "profit" | "units",
  "cashBasis":  true | false,          // pul tushganda hisoblansinmi
  "percent":    "3.5",                 // variable=percent uchun
  "tierTableId": "...",                // variable=tier uchun (mavjud tier tizimi)
  "pieceRateMinor": "1500000",         // variable=piece uchun (bir birlik narxi)
  "pieceUnit":  "delivery" | "km" | "order" | "position"
}
```

### 2.3 Lavozimlar bo'yicha standart

| Lavozim | `base` | `variable` | `bonusBase` | `cashBasis` |
|---|---|---|---|---|
| **Sotuvchi (B2B/B2G)** | fix | percent + tier | **profit** | **true** |
| **Kassir** | fix | percent | **revenue** | false |
| **Omborchi** | fix | piece (`order` yoki `position`) | units | false |
| **Haydovchi** | fix | piece (`delivery` yoki `km`) | units | false |
| **Buxgalter / ma'muriyat** | fix | none | — | — |

### 2.4 Kassir teshigini yopish (majburiy qo'shimcha)
> **Muammo:** kassir bonusi **tushumdan** bo'lsa va u narxni erkin tushira olsa (1-bo'lim Q8),
> chegirma unga hech narsa turmaydi — aksincha, arzon sotib ko'proq tushum qilish foydali bo'ladi.

**Yechim:** kassir bonusi tushumdan qoladi (egasining qarori), **lekin avtomatik korreksiya** qo'shiladi:
```
kassir_bonusi = tushum × % − korreksiya
korreksiya    = Σ (optomdan past sotilgan farq) + Σ (tan narxdan past sotilgan zarar)
```
Manba: 1-bo'limdagi `CashierAuditEvent` (`SOLD_BELOW_WHOLESALE`, `SOLD_BELOW_COST`).
Shunday qilib **erkinlik saqlanadi**, teshik yopiladi. Korreksiya oylik varaqasida **alohida qator**
bo'lib ko'rinadi — kassir nima uchun kamayganini biladi.

### 2.5 Sotuvchi uchun cash-basis
2-bo'lim Qoida 2 bo'yicha: bonus **to'langan ulush** bo'yicha tan olinadi.
```
tan_olingan_bonus = umumiy_bonus × (to'langan_summa ÷ hujjat_summasi)
```
`BonusAccrual` (2-bo'lim) HR dvigateliga manba bo'ladi — `HrKpiDailyLog` esa **tushum** o'lchovi
sifatida saqlanadi (kassir va hisobot uchun kerak).

---

## 3. Z1 yechimi — dvigatel va hujjatni ulash

```
HR dvigateli (oylik hisobi)
   ↓ avtomatik
Payroll hujjati (vedomost)  — qatorlar bilan to'ldiriladi:
   + salary      (fiks)
   + bonus       (KPI + komissiya + bonus ledger)
   − penalty     (jarima + kassir korreksiyasi)
   − advance     (tasdiqlangan avanslar)
   − vacation    (ta'til kunlari ushlanmasi — §5)
   − tax_income / tax_social
   ↓
Menejer tekshiradi → holat o'tishi → to'lov
```

Qoidalar:
- Hisob **qayta yugurtiriladigan** (idempotent) — `HrKpiMonthlyScore` upsert qilinadi (mavjud xulq).
- Hujjat **to'langan** holatga o'tgach — qayta hisoblash uni o'zgartirmaydi (muzlatiladi).
- Har qator **manbasiga havola** saqlaydi (`meta` maydoni mavjud): qaysi bonus yozuvi, qaysi avans
  arizasi, qaysi ta'til kuni. Xodim «nega bunday?» deb so'rasa — javob bir klikda.

---

## 4. Avans (Q3)

`HrAdvanceRequest`: xodim · summa · sabab · so'rov sanasi · holat
(`kutmoqda → tasdiqlandi → berildi → rad etildi`) · tasdiqlovchi · izoh.

Oqim:
1. Xodim tizimda (yoki Telegram orqali) ariza yozadi.
2. Menejerga bildirishnoma → tasdiqlaydi yoki rad etadi (4-bo'lim navbatida ham ko'rinadi).
3. Tasdiqlangach kassada **RKO** chiqadi (1-bo'lim §8.2 xarajat mexanizmi, lekin moddasi = «avans»).
4. `Payroll` hujjatiga **`advance` qatori (manfiy)** avtomatik tushadi.

**Qo'riqchi:** tasdiqlanmagan avans kassadan berilmaydi; berilgan avans oylikdan **albatta** ushlanadi
(unutilishi mumkin bo'lgan joy — shuning uchun avtomatik).

---

## 5. Ta'til va ruxsat (Q5 — egasi qo'shgan talab)

`HrLeaveRequest`: xodim · turi (`vacation` / `sick` / `unpaid`) · boshlanish va tugash sanasi ·
sabab · holat (`kutmoqda → tasdiqlandi → rad etildi`) · tasdiqlovchi.

### 5.1 Davomatga ta'siri
Tasdiqlangan sanalarda:
- **davomat belgilash talab qilinmaydi**;
- **kelmaganlik jarimasi yozilmaydi** (§6 dagi avtomatik jarima qoidalaridan istisno);
- davomat hisobotida kun «ta'til» deb belgilanadi (yo'qlik emas) — 3-bo'lim intizom ko'rsatkichi
  buzilmaydi.

### 5.2 Oylikka ta'siri (egasining aniq talabi)
Har ta'til kuni uchun **alohida ushlanma qatori** yoziladi:
```
kunlik_stavka = fiks_oylik ÷ oydagi_ish_kunlari
ushlanma      = kunlik_stavka × ta'til_kunlari
```
`Payroll` hujjatida bu **kun-bay** ko'rinadi (bitta yig'ma summa emas) — xodim qaysi kun uchun
qancha ushlanganini aniq ko'radi. Shaffoflik nizoni oldini oladi.

> **Qabul qilingan taxmin:** `oydagi_ish_kunlari` — xodimning jadvali bo'yicha (mavjud
> `hr-schedule`), kalendar kunlari emas. Jadval yo'q bo'lsa — hisobot davri ish kunlari soni.
> *Egasi buni tuzatishi mumkin (masalan doim 26 kun deb belgilash).*

### 5.3 Kelajak (bu TZ'da emas)
Yillik ta'til balansi (necha kun qoldi), ta'til jadvali, kasallik varaqasi hujjati —
keyingi fazada. Model shunga tayyor bo'lib quriladi (`type` maydoni ochiq).

---

## 6. Davomat (Q4)

| Manba | Kim uchun | Mexanizm |
|---|---|---|
| **`cashier-session`** ochish/yopish | kassir | smena ochilishi = kelish, yopilishi = ketish. **Alohida belgilash shart emas** |
| **`DriverShift`** boshlash/tugatish | haydovchi | grafiksiz; GPS pinglari ishni tasdiqlaydi (mavjud) |
| Mavjud `attendance` (+ geo ixtiyoriy) | qolganlar | `attendance-geo` moduli saqlanadi, majburiy emas |

### 6.1 Avtomatik jarima
`hr-bonus-fine-rule` kutubxonasi ustiga (mavjud `auto_*` manbalari):
- **Kechikish**: jadval boshlanishidan N daqiqa keyin → qoida bo'yicha summa (daqiqaga yoki qat'iy).
- **Kelmaganlik**: davomat yo'q va **tasdiqlangan ta'til ham yo'q** → qoida bo'yicha jarima.
- Har avtomatik jarima **manbasini ko'rsatadi** va menejer uni bekor qila oladi (audit bilan).

### 6.2 Istisnolar
Tasdiqlangan `HrLeaveRequest` kunlari · dam olish kunlari (jadval bo'yicha) ·
smena jadvalidan tashqarida ochilgan kassa smenasi (1-bo'lim: sabab bilan).

---

## 7. Haydovchilar (mavjud tizim kengaytiriladi)

**Bor:** `trackingMode='field'` · `DriverShift` (idempotent start, `one_open_per_driver` partial-unique) ·
GPS ping oqimi · to'xtash aniqlash · harakat/to'xtash soniyalari va yetkazmalar soni **pinglardan
qayta hisoblanadi** (yagona haqiqat manbai) · `dispatcher.guard`.

**Qo'shiladi:**
1. **Yetkazma ↔ buyurtma bog'lanishi** — haydovchi qaysi `CustomerOrder`/`Demand` ni yetkazayotgani
   (2-bo'lim §4.7). Hozir yetkazmalar soni pinglardan hisoblanadi, hujjatga bog'lanmagan.
2. **Naqd topshirish** — haydovchi mijozdan naqd olsa, u kassaga topshirilishi kerak:
   `DriverCashHandover` yozuvi → 1-bo'lim kassa kirim (PKO). **Topshirilmagan naqd** haydovchi
   kartasida qizil bo'lib turadi.
3. **Ish birligiga oylik** — yetkazma soni yoki km bo'yicha (§2.2 `piece`), manba `DriverShift`.
4. Marshrut tarixi va samaradorlik (o'rtacha yetkazish vaqti, to'xtashlar) — 3-bo'lim.

---

## 8. Xodim kartasi — bitta ekranda

| Blok | Manba |
|---|---|
| Shaxsiy ma'lumot, lavozim, bo'lim | `hr-employee`, `hr-position`, `hr-department` |
| **Rol va individual ruxsat** | 4-bo'lim (`EmployeePermission`) |
| **Oylik sxemasi** (lavozim standarti + istisno) | §2 |
| Plan va natija | 2-, 3-bo'limlar |
| Davomat (oylik kalendar) | §6 |
| Bonus / jarima tarixi | `hr-bonus-fine` |
| Avans va ta'til arizalari | §4, §5 |
| Haydovchi bo'lsa: smenalar, marshrutlar, topshirilmagan naqd | §7 |

---

## 9. Baza o'zgarishlari

| O'zgarish | Tafsilot |
|---|---|
| `HrPosition.paySchemeConfig` | `Json?` — lavozim standart oylik sxemasi (§2.2) |
| `Employee.salaryConfig` | mavjud — to'liq sxema tuzilishiga kengaytiriladi (orqaga mos: `baseSalaryMinor` saqlanadi) |
| `HrAdvanceRequest` | yangi (§4) |
| `HrLeaveRequest` | yangi (§5) |
| `DriverCashHandover` | yangi (§7.2) |
| `DriverShift.orderIds` yoki `DriverDelivery` | yangi — yetkazma ↔ hujjat bog'lanishi (§7.1) |
| `Payroll.sourceScoreId` | oylik hujjati ↔ `HrKpiMonthlyScore` bog'lanishi (§3) |
| `PayrollLine.meta` | mavjud — har qator manbasiga havola saqlaydi |

---

## 10. Testlash

### 10.1 Unit
- Har oylik sxemasi: fiks · fiks+% · tier · piece — chegaraviy holatlar (0 sotuv, plandan 200%)
- **Kassir korreksiyasi** (§2.4): optomdan past va tan narxdan past hodisalar bonusdan ayrilishi
- **Cash-basis** (§2.5): qisman to'lovda bonus ulushi
- Ta'til: tasdiqlangan kunlarda jarima **yozilmasligi** + kunlik ushlanma to'g'ri hisoblanishi
- Avans: tasdiqsiz berilmasligi; berilgani oylikdan **albatta** ushlanishi
- Davomat: kassir smenasi va haydovchi smenasi davomatga aylanishi
- Oylik hujjati idempotent qayta hisoblanishi; **to'langan** hujjat o'zgarmasligi

### 10.2 E2E
Xodim ta'til so'raydi → menejer tasdiqlaydi → o'sha kunda jarima yozilmaydi →
oy oxirida oylik hisoblanadi → `Payroll` hujjati avtomatik yaratiladi (ta'til ushlanmasi kun-bay
ko'rinadi) → avans ushlanadi → menejer tasdiqlaydi.

### 10.3 Gate
`typecheck 0` · `biome 0` · i18n (ru+uz) · Vitest regressiyasiz · **Phase-2 QA** real brauzerda.

---

## 11. Bosqichlar

| Bosqich | Mazmun | Sabab |
|---|---|---|
| **B1** | `HrPosition.paySchemeConfig` + sxema hal qiluvchi (4 tur) | Barcha oylik hisobining poydevori |
| **B2** | Z2: lavozimga qarab bonus bazasi + **kassir korreksiyasi** (§2.4) | Erkinlik teshigini yopadi |
| **B3** | Z1: dvigatel → `Payroll` hujjati avtomatik yaratilishi | Ikkita tizimni birlashtiradi |
| **B4** | `HrLeaveRequest` — ta'til so'rovi, tasdiq, davomat istisnosi, kun-bay ushlanma | Egasining yangi talabi |
| **B5** | `HrAdvanceRequest` — ariza, tasdiq, kassa RKO, oylikdan ushlash | Pul intizomi |
| **B6** | Davomat manbalari: kassir smenasi + haydovchi smenasi → attendance | Ikki marta belgilashni yo'q qiladi |
| **B7** | Avtomatik jarima qoidalari (kechikish, yo'qlik) + istisnolar | Intizom |
| **B8** | Haydovchi: yetkazma↔buyurtma, naqd topshirish, ish birligiga oylik | Yetkazish halqasini yopadi |
| **B9** | Xodim kartasi (bitta ekran) | Menejer ish o'rni |

---

## 12. Boshqa bo'limlarga bog'liqliklar

| Bog'liqlik | Qayerga |
|---|---|
| `CashierAuditEvent` (kassir korreksiyasi), smena = davomat, avans RKO, naqd topshirish PKO | **1-bo'lim (Kassa)** |
| `BonusAccrual`, cash-basis, yetkazish buyurtmasi | **2-bo'lim (Onlayn/B2B/B2G)** |
| Intizom va faollik ko'rsatkichlari, haydovchi samaradorligi | **3-bo'lim (Analitika)** |
| Avans/ta'til tasdig'i, jarima bekor qilish, `EmployeePermission` | **4-bo'lim (Menejer)** |
| Omborchi ish birligi (yig'ilgan zakas/pozitsiya) | **7-bo'lim (Ombor)** |
| Filial bo'yicha xodim va oylik ajratish | **8-bo'lim (Ko'p filiallilik)** |
