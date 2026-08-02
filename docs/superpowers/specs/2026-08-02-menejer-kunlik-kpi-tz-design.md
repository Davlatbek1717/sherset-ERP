# TZ — 4-bo'lim KENGAYTMASI: MENEJER — kunlik KPI qabul qilish va xodimlar nazorati

**Sana:** 2026-08-02 · **Holat:** dizayn tasdiqlangan (egasi tomonidan) · **Faza:** implementatsiyadan oldingi spetsifikatsiya

> Bu hujjat [4-bo'lim: MENEJER](2026-08-01-menejer-tz-design.md) TZ'sining **kengaytmasi**, o'rnini
> bosuvchisi EMAS. Asl hujjat kuchda qoladi (ruxsat qatlamlari, `OWN_GROUP` to'lqinlari, tasdiqlash
> navbati asosi) — bu yerda **u qamramagan** qism yoziladi: xodimning kunini KPI bo'yicha qabul
> qilish va xodimlar nazorati.
>
> Bog'liq: [1) Kassa](2026-08-01-kassa-tz-design.md) · [3) Analitika](2026-08-01-analitika-tz-design.md) ·
> [6) HR](2026-08-02-hr-tz-design.md) · [Master roadmap](2026-08-02-master-roadmap.md).

---

## 0. Nima uchun bu hujjat kerak bo'ldi

Egasi menejer bo'limini so'raganda ikkita aniq talab qo'ydi:

1. **Xodimlarning kunini KPI bo'yicha qabul qilib olish** — birinchi navbatda.
2. **To'liq xodimlar nazorati** — keyin.

Asl 4-bo'lim TZ'sini tekshirganda ma'lum bo'ldi: unda **«kunlik xodim KPI» hech bir qarorida yo'q**.
U ruxsatlar (Q1–Q3), tasdiqlash navbati (Q4–Q6) va boshqaruv vositalari haqida. Plan **faqat oylik**
(§6). Ya'ni egasining asosiy talabi hech qayerda spetsifikatsiyalanmagan.

### 0.1 Uchta parallel «kunlik xodim o'lchovi» — kelishtirilmagan

| Manba | Holati | Nimani o'lchaydi |
|---|---|---|
| `HrKpiDailyLog` + `HrKpiMonthlyScore` | **kodda ishlayapti**, cron 23:30 (`hr-kpi-cron.service.ts`) | FAQAT `Demand.ownerId` bo'yicha posted sotuv, target = oylik plan ÷ oydagi kunlar |
| `EmployeeDailyRollup` | 3-bo'lim TZ §5.1 — **rejalashtirilgan** | sotuv, foyda, chegirma, qarz, vazifa, davomat |
| `SalesPlan` | 2-bo'lim TZ | oylik plan |

Hech bir hujjat «bular bittaga birlashadimi yoki ikkalasi ham qoladimi» degan savolga javob bermaydi.
HR TZ §0.1 dagi **Z2** faqat *bonus bazasi* ziddiyatini hal qiladi, *KPI jadval* ziddiyatini emas.

**Qaror (M-Q5):** bitta ombor qoladi — **mavjud HR KPI kengaytiriladi**. Bu 2026-08-02 da
`report/metrics/` (1.4) da o'rnatilgan tamoyilning davomi: *bir savolga ikki javob bo'lmasin*.

### 0.2 Ma'lumot ishonchliligi — bugungi holat

KPI'ni yolg'on qiladigan xatolar (analitika TZ §0.1):

| Xato | Holat |
|---|---|
| **X1** `profitability.service.ts` da `0::bigint AS cost` → har kassa cheki 100% marja | ✅ tuzatildi (1.2, `6adc495`) |
| **X3** chegirma o'lchovi yo'q (`basePriceMinor` yozilmaydi) | ✅ tuzatildi (1.1, `6d1be01`) |
| **X4** formulalar tarqoq (7 joyda 3 xil foiz) | ✅ tuzatildi (1.4, `bbf7af5` + `0c36680`) |
| **X2** kassir kesimi `rs.owner_id` (hujjat egasi), kassir emas | ⚠️ **qisman** — `CashierAuditEvent.employeeId` endi bor va indekslangan; `RetailSale.ownerId` **refundda aktyorga** yoziladi, shuning uchun kassir o'qi = `CashierSession.cashierId` yoki audit hodisasi |
| `Account.recordScopeEnforced = false` | ⚠️ ochiq — lekin menejer «hammasini ko'radi» qarori (M-Q1) bilan **bloker emas** |

Ya'ni: **o'lchov poydevori tayyor**. Endi o'lchangan raqamni **qaror**ga aylantiradigan qatlam kerak.

---

## 1. Qabul qilingan qarorlar

| # | Savol | Qaror |
|---|---|---|
| **M-Q1** | Menejer kim | **Bitta umumiy menejer roli** — butun korxonani ko'radi |
| **M-Q2** | Kunlik KPI bilan nima qiladi | Avtomat hisoblanadi → menejer **ko'radi va QABUL QILADI** |
| **M-Q3** | Pulga ta'siri | **Darhol** — qabul qilingan kun bonus/jarimaga o'tadi |
| **M-Q4** | Ogohlantirish qamrovi | zararga sotuv/katta chegirma · qarz · smena va davomat · ombor |
| **M-Q5** | KPI ombori | **Mavjud HR KPI kengaytiriladi**, alohida qurilmaydi |
| **M-Q6** | Ogohlantirish shakli | **Ish navbati**: yangi → ko'rildi → yopildi (**sabab kodi bilan**) |
| **M-Q7** | Menejerni kim nazorat qiladi | **Egaga haftalik xulosa** — har qo'lda tuzatma ko'rinadi |
| **M-Q8** | Kun qabul qilinmasa | **Ochiq qoladi va oylikni BLOKLAYDI** |
| **M-Q9** | Ko'rish tartibi | **Har xodimning har kuni qo'lda ko'riladi** |
| **M-Q10** | Nazorat qamrovi | jonli holat · xodim kartasi · ishga qabul/bo'shatish · javobgarlik |
| **M-Q11** | Analitika bilan munosabat | **Alohida bo'lim**; faqat **ma'lumot qatlami** umumiy |

### 1.1 Asl TZ'ning Q3 qarori TUZATILADI

Asl 4-bo'lim TZ **Q3**: menejer qamrovi = `OWN_GROUP` (o'z bo'limi).
Egasining 2026-08-02 qarori (**M-Q1**): menejer **butun korxonani** ko'radi.

**Tuzatish:** menejer roli `view: ALL`; yozuv/tasdiq amallari torroq beriladi.
`OWN_GROUP` mexanizmi **bekor qilinmaydi** — u **sotuvchilar** uchun kerak (mijoz bazasi raqobati,
asl TZ §4.2 1-to'lqin). Ya'ni to'lqinlar rejasi kuchda, faqat menejerning o'zi ular ostida emas.

### 1.2 Ikki qaror bo'yicha ochiq izoh

**M-Q8 (bloklash) nosozlik rejimi.** Menejer kasal yoki ta'tilda bo'lsa, xodimlar oyliksiz qoladi.
Bu qaror kuchda qoladi, lekin **boshi berk ko'cha yopiladi**:
- **Egaga eskalatsiya klapani** — kun `N` kundan ortiq qabul qilinmasa, egasining navbatiga o'tadi;
- egasi **sabab bilan majburiy yopa oladi** (audit yozuvi bilan, `force_accepted` deb belgilanadi);
- xodim o'z ekranida «kuningiz hali qabul qilinmagan» deb ko'radi — kutilmagan hodisa bo'lmaydi.

**M-Q9 (har kun qo'lda) natijasi.** 20+ xodim × har kun degani — ekran **tezlik uchun** qurilishi
shart: bitta xodim kuni **bitta ekranda, skrollsiz**, klaviatura bilan (keyingi → qabul → keyingi).
Aks holda menejer 20 ta sekin ekrandan keyin ko'r-ko'rona bosa boshlaydi va qabul qilish o'z ma'nosini
yo'qotadi. **Tartib: og'ishli kunlar birinchi.**

### 1.3 Analitika bilan chegara (M-Q11)

Menejer bo'limi **alohida** quriladi. Sabab: analitika — «qarab tushunish» (egasi, buxgalter, o'z
raqamini ko'rayotgan sotuvchi); menejer — «qaror qilib yopish» (kunlik ish ro'yxati). Ikkalasi bir
ekranga qo'shilsa, na hisobot, na vazifa ro'yxati bo'ladi; ruxsatlar ham chalkashadi (o'qish vs
pulni o'zgartiradigan amal).

**Umumiy bo'ladigan yagona narsa — ma'lumot qatlami:**
- formulalar **`report/metrics/`** dan (1.4 da qurilgan yagona qatlam);
- KPI ombori bitta (M-Q5).

Menejer ekranidagi raqam bilan hisobotdagi raqam **bir manbadan** keladi.
`/reports/*` (17 hisobot) va `/analitika/*` bu ishda **tegilmaydi**.

---

## 2. Kunlik KPI o'lchov modeli

### 2.1 Ko'rsatkich katalogi

Hozirgi `HrKpiDailyLog` — **yopiq uch ustun** (`personalSalesMinor`, `targetMinor`,
`achievementPercent`). Yangi ko'rsatkich qo'shish uchun har safar migratsiya kerak bo'ladi.

Yangi model: har ko'rsatkich **kalit** bilan ta'riflanadi.

| Maydon | Mazmun |
|---|---|
| `key` | `sales_revenue`, `gross_profit`, `discount_given`, `below_cost_count`, `cancel_count`, `refund_sum`, `till_variance`, `credit_given`, `late_minutes`, `hours_worked`, `tasks_done`, `tasks_overdue`, `picked_lines`, `pick_avg_seconds` … |
| `labelRu` / `labelUz` | ekranda ko'rinadigan nom |
| `unit` | `money` · `count` · `percent` · `minutes` |
| `direction` | `higher_better` · `lower_better` — reyting va rang shundan |
| `source` | qaysi moduldan hisoblanadi |

### 2.2 Lavozim bo'yicha KPI profili

Kassirni va omborchini bir xil o'lchash ma'nosiz. Har lavozim uchun profil: **qaysi ko'rsatkichlar**
va **qanday og'irlik** bilan.

| Lavozim | Asosiy ko'rsatkichlar |
|---|---|
| Kassir | tushum · yalpi foyda · berilgan chegirma · zararga sotuv soni · bekor qilingan chek · kassa farqi · qarzga berilgan |
| Sotuvchi (B2B/B2G) | tushum · yalpi foyda · yangi mijoz · undirilgan qarz · o'rtacha chek |
| Omborchi | yig'ilgan qator · o'rtacha yig'ish vaqti · xato |
| Haydovchi | yetkazma soni · masofa · o'z vaqtida yetkazish |
| Hamma | davomat (kechikish daqiqasi, ishlangan soat) · vazifa (bajarilgan/muddati o'tgan) |

### 2.3 🔴 Profil VERSIYALANADI

Og'irlik yoki formula o'zgarsa, **o'tgan kunlar o'z versiyasida qoladi**.

Aks holda bugun og'irlikni o'zgartirganingizda **o'tgan oyning raqamlari o'zgaradi** — va allaqachon
to'langan oylik bilan hisobot bir-biriga mos kelmay qoladi. Bu **tan narx muzlatish bilan aynan bir
xil klass** (kassa TZ §5.3): hisobot tarixni qayta yozmasligi kerak.

Har `EmployeeDailyKpi` yozuvi o'zi hisoblangan **profil versiyasiga** havola saqlaydi.

### 2.4 Ma'lumot sifati bayrog'i (NULL ≠ 0)

Agar kunning ba'zi qatorlarida tan narx yig'ilmagan bo'lsa, foyda ko'rsatkichi **«to'liq emas»** deb
belgilanadi va **kam ko'rsatilmaydi**. 1.1/1.2 da o'rnatilgan intizom KPI'ga ham o'tadi:

> NULL = «o'lchanmagan», 0 = «o'lchandi va nol». Ikkalasini aralashtirish — hisobotni yolg'onga
> aylantiradi.

Menejer ekranda bayroqni ko'radi va shu bilimda qaror qiladi.

### 2.5 Adolat normalizatsiyasi

Raqamlar solishtiriladigan bo'lishi uchun:
- **ishlagan soatga** bo'linadi (yarim kun ishlagan kassirni to'liq kun bilan solishtirmaslik);
- **yarim stavka** hisobga olinadi;
- **tasdiqlangan ta'til** kunlari umuman chiqarib tashlanadi (HR TZ §5.1 bilan izchil);
- **yangi xodim** birinchi `N` kun jarimasiz (sinov ramp);
- **bir kunda ikki smena** — kun bo'yicha yig'iladi;
- **bir odam ikki rolda** (kassir + omborchi) — har rol o'z profili bilan o'lchanadi;
- **kun turi** (dam olish/bayram) target'ga ta'sir qiladi — manba `hr-schedule` kalendari.

### 2.6 Bugungi kun

Kechagacha bo'lgan kunlar **saqlangan** (tungi cron); **bugungi kun so'rovda jonli hisoblanadi**.
Analitika TZ §5.2 bilan izchil: «kechagacha rollup + bugun jonli».

---

## 3. Kunni qabul qilish oqimi

### 3.1 Holatlar

```
hisoblandi → qabul kutmoqda → QABUL QILINDI
                  ↓
            rad etildi (tushuntirish so'raldi) → tushuntirish keldi → qabul kutmoqda
                  ↓
            N kun javobsiz → EGAGA ESKALATSIYA → egasi majburiy yopadi (force_accepted)

QABUL QILINDI → (manba hujjat o'zgardi) → ESKIRGAN → qabul kutmoqda
QABUL QILINDI → (menejer qayta ochadi, sabab bilan) → qabul kutmoqda
```

**Naqsh:** sof FSM + append-only hodisa jadvali + optimistik da'vo. Repoda bu naqsh allaqachon bor
va ishlayapti — `supply-approval` (`supply-approval.fsm.ts`, `SupplyApprovalEvent`, `claim()`).
Yangi mexanizm o'ylab topilmaydi.

### 3.2 Qo'lda tuzatish

**Avtomat raqam USTIGA YOZILMAYDI.** Har ko'rsatkich uchun ikki qiymat saqlanadi:

| Maydon | Mazmun |
|---|---|
| `autoValue` | tizim hisoblagani — **hech qachon o'zgarmaydi** |
| `adjustValue` | menejer tuzatmasi (bo'lishi shart emas) |
| `reasonCode` | tuzatma sababi — **majburiy** |

Sabab: 1.1 sabog'i — haqiqatni yo'qotmaslik. Keyin «menejer qancha va nega tuzatdi» degan savolga
javob beriladi (M-Q7 egaga xulosa aynan shundan quriladi).

### 3.3 Rad etish → tushuntirish halqasi

Menejer kunni rad etsa, xodimga savol ketadi. Xodim javob yozadi, javob **kun yozuviga
biriktiriladi**, kun navbatga qaytadi. Nizo bo'lganda yozma iz qoladi — bu ham xodimni, ham
menejerni himoya qiladi.

### 3.4 Eskirish (stale)

Qabul qilingan kunning **manba hujjati keyin o'zgarsa** (masalan chek tahrirlandi, qaytarish
kiritildi), kun `eskirgan` deb belgilanadi va navbatga qaytadi.

Oylikka **tuzatuvchi qator** yoziladi — eski raqam **jimgina qayta yozilmaydi**. To'langan pulni
orqaga qaytarib yozish emas, farqni alohida ko'rsatish.

### 3.5 Menejer ekrani (M-Q9 bilan bog'liq talab)

Bitta xodim kuni **bitta ekranda**:
- yuqorida: xodim, sana, holat, umumiy ball;
- ko'rsatkichlar jadvali: `auto` · `tuzatma` · **target** · **o'z 30-kunlik o'rtachasidan og'ish**;
- og'ishlar va hodisalar ro'yxati (`CashierAuditEvent` dan);
- davomat: kelish/ketish, kechikish;
- pastda: **Qabul qilish · Rad etish · Tuzatish** tugmalari.

Majburiy xususiyatlar:
- **klaviatura**: `↓/↑` keyingi/oldingi, `A` qabul, `R` rad, `E` tuzatish;
- **tartib**: og'ishli kunlar birinchi;
- **drill-down**: har raqamni bosganda uni hosil qilgan **hujjatlar ro'yxati** ochiladi. Busiz
  menejer raqamga ishonmaydi va qabul qilish rasmiyatchilikka aylanadi;
- **ish yuki konteksti**: soatiga tushum va chek soni ham ko'rsatiladi — kassirlar oqimi teng emas,
  «kam sotdi» degan xulosa shusiz noto'g'ri bo'ladi.

---

## 4. Qabul → oylik (M-Q3)

1. **Faqat qabul qilingan kunlar** oylik hisobiga kiradi. Qabul qilinmagan kun `HrKpiMonthlyScore`
   ga **umuman qo'shilmaydi** (M-Q8 bloklash shu yerda amalga oshadi).
2. Qabul qilinganda bonus/jarima `HrBonusFineLog` ga yoziladi — **idempotent** (bir kunni ikki marta
   qabul qilish ikki marta yozmaydi; mavjud `(attendanceId, source)` unique naqshi kabi).
3. `HrKpiMonthlyScore` qayta hisoblanadi (mavjud upsert).
4. Oylik hujjatida (`Payroll`) **«N kun qabul qilinmagan»** ko'rsatiladi — buxgalter ko'r-ko'rona
   to'lamaydi.
5. Eskirgan kun qayta qabul qilinsa — **tuzatuvchi qator** (§3.4).

Mavjud oylik formulasi (`fix + KPI + bonus − jarima + komissiya`, HR TZ §0) **o'zgarmaydi** — faqat
KPI qismining manbai yangi omborga o'tadi.

---

## 5. Menejer ish navbati (M-Q6)

### 5.1 Bitta navbat

Qoida buzilishi · kun qabul qilish · xodim e'tirozi · eskalatsiya — **hammasi bitta ro'yxatda**.
Menejerda «bugun nima muhim» degan yagona joy bo'ladi va hech narsa e'tibordan qolmaydi.

Har element: **kim · qancha · qachon · hujjatga havola · kontekst** (shu oydagi naqsh — bitta hodisa
emas, tendensiya ko'rinsin) · **eskirish belgisi** (3 kundan ortiq ko'rilmagan yuqoriga chiqadi).

### 5.2 Qoida turlari (M-Q4 ning to'rt toifasi)

| Toifa | Qoidalar |
|---|---|
| Zararga sotuv / chegirma | `BELOW_COST` · `BIG_DISCOUNT` (chegara %) · `BELOW_WHOLESALE` |
| Qarz | `BIG_DEBT` · `OVERDUE_DEBT` |
| Smena va davomat | `CASH_VARIANCE` · `LATE` / `ABSENT` · `SHIFT_OUT_OF_SCHEDULE` |
| Ombor | `LOW_STOCK` · `DEAD_STOCK` · `PICKING_SLA` · `INVENTORY_VARIANCE` |

Asl TZ §5.2 dagi `ApprovalRule { type, threshold, mode }` modeli saqlanadi va kengaytiriladi.
Sotuv qoidalarining manbai — **`CashierAuditEvent`** (1.3 da qurilgan, `employeeId` bo'yicha
indekslangan).

### 5.3 Sabab kodlari

Element yopilganda **sabab kodi majburiy**. Bu keyin tahlil beradi: *«zararga sotuvlarning 30% —
raqobatchi narxi, 20% — muddati o'tayotgan tovar»*. Sababsiz yopilgan navbat — statistikasiz navbat.

### 5.4 Harakatlar

Asl TZ §5.3 dagi 4 ta harakat (**tasdiqlash · tushuntirish so'rash · jarima yozish · tekshiruv
boshlash**) saqlanadi va uchtaga kengayadi:
- **vazifa berish** — mavjud `hr-task-send` orqali;
- **ogohlantirish yozish** — xodim kartasidagi jurnalga;
- **egaga eskalatsiya** — menejer o'zi hal qila olmaydigan holat.

---

## 6. To'liq xodimlar nazorati (M-Q10)

### 6.1 Jonli holat — «hozir kim ishda»

Kim smena ochgan · kim kechikkan/kelmagan · haydovchi yo'lda · omborchi nima yig'yapti.
Manbalar allaqachon bor: `CashierSession` (ochiq sessiya), `HrAttendance` (kelish/ketish),
`DriverShift` + GPS ping, `RestockTask` (holati `in_progress`).

### 6.2 Xodim kartasi (360°)

Bitta ekranda: KPI trendi · davomat kalendari · bonus/jarima tarixi · **ruxsatlari** (4-bo'lim
`EmployeePermission`) · qo'zg'atgan ogohlantirishlari · **suhbat va ogohlantirish jurnali**.

Suhbat jurnali muhim: bo'shatish nizosi bo'lganda **yozma iz** kerak. Hozir hech qayerda yo'q.

### 6.3 🔴 Hayot sikli — bugun umuman yo'q va bu xavfsizlik teshigi

**Bugungi holat:** xodim ishdan ketsa, uning **ERP ruxsatlari, HR ruxsatlari, Telegram ulanishi va
ochiq sessiyalari ochiq qolaveradi**. Hech qanday mexanizm ularni yopmaydi.

Kiritiladi:

| Bosqich | Mazmun |
|---|---|
| **Ishga qabul** | sinov muddati + **baholash sanasi** (o'sha kuni menejer navbatiga element tushadi) |
| **Faol** | odatiy holat |
| **Bo'shatish** | **majburiy ro'yxat**: ERP+HR ruxsatlarini bekor qilish · Telegram uzish · ochiq sessiyani yopish · **kassani topshirish** · **tovar/jihozni topshirish** · **qabul qilinmagan kunlarni yopish** |

Ro'yxatning har bandi bajarilmaguncha xodim `arxivlangan` holatiga o'tmaydi.

### 6.4 Javobgarlik — «kimda nima turibdi»

Xodimga biriktirilgan pul va tovar: **topshirilmagan naqd** (haydovchi) · **ochiq smena** ·
**yig'ilmagan topshiriq** · **qaytarilmagan jihoz**. «Ketishdan oldin nima topshirishi kerak»
ro'yxati shundan quriladi.

---

## 7. Egа nazorati (M-Q7)

Menejer o'z qo'l ostidagilarning pulini tasdiqlaydi — shuning uchun **uning har harakati ham
o'lchanadi**:
- har qabul, rad etish va **qo'lda tuzatma** hodisa jurnaliga tushadi;
- egasi **haftalik xulosa** oladi: nechta kun qabul qilingan, nechta tuzatma, **jami qancha
  summaga**, kim ko'p tuzatgan, nechta kun qabul kutmoqda;
- bloklamaydi — **ko'rinadi**.

---

## 8. Tanlangan nazorat ekranlari

| Ekran | Mazmun | Ma'lumot |
|---|---|---|
| **Smena yakunini qabul qilish** | kutilgan naqd / sanalgan / farq — kunlik KPI bilan **bir xil qabul naqshi** | `CashierSession` (mavjud) |
| **«Nima qotib qolgan»** | bosqichda tiqilgan hujjatlar: buyurtma bor-yu jo'natilmagan, yig'ilgan-yu to'lanmagan, qabul qilingan-yu joylashtirilmagan | hujjat holatlari (mavjud) |
| **Uch xil zaxira signali** | tugayotgan · o'lik · **ortiqcha** (pul qotgan). Asosiy o'lchov **dona emas, PUL** | `Stock` + tan narx |
| **Narx o'zgarishi tarixi va nazorati** | kim / qachon / qaysi tovar; chegaradan katta o'zgarish **menejer tasdig'ini** so'raydi | `AuditLog.fieldChanges` (mavjud) |
| **SLA paneli** | buyurtma → yig'ish → yetkazish → to'lov: qayerda kechikish, kim sekin | vaqt tamg'alari (mavjud) |
| **Ma'lumot sifati paneli** | tan narxsiz tovarlar · muzlatilmagan cheklar · KPI profilsiz xodimlar | §2.4 bilan bog'liq |
| **Xarajat byudjeti** | modda × oy byudjet, plan/fakt. Xarajat **tasdiqlanmaydi** (asl TZ Q5) — lekin **ko'rinadi** | yangi `ExpenseBudget` |

### 8.1 Ko'rib chiqilgan, KIRITILMAGAN

Qayta muhokama qilinmasin: «korxona puli qayerda» · qarz undirish ish ro'yxati · mijoz taqsimoti va
yo'qolgan mijozlar · xato narxi · ertalabki brifing / kechki yakun · shablon izohlar · mobil rejim ·
alohida qaror jurnali · maqsad kaskadi · 1:1 suhbat va o'qitish.

*(Qaror jurnali qabul hodisa jurnalidan texnik jihatdan baribir chiqadi — alohida ekran qilinmaydi.)*

---

## 9. Baza o'zgarishlari

Saqlanadi va **tegilmaydi**: `HrKpiMonthlyScore` · `HrBonusFineLog` · `HrSalaryConfig` · `Payroll`.

| Model | Maqsad |
|---|---|
| `KpiMetricDef` | ko'rsatkich katalogi (§2.1) |
| `KpiProfile` + `KpiProfileVersion` + `KpiProfileMetric` | lavozim profili va **versiyasi** (§2.2, §2.3) |
| `EmployeeDailyKpi` | kun × xodim: holat · `profileVersionId` · `dataComplete` · `acceptedById/At` · `staleAt` |
| `EmployeeDailyKpiMetric` | kun × xodim × `metricKey`: `autoValue` · `adjustValue` · `reasonCode` |
| `EmployeeDailyKpiEvent` | append-only: kim · qachon · qaysi o'tish · sabab · izoh |
| `ManagerWorkItem` | yagona navbat (§5) |
| `ManagerRuleConfig` | chegaralar — asl `ApprovalRule` kengaytmasi |
| `EmployeeLifecycle` + `OffboardingChecklist` | §6.3 |
| `ExpenseBudget` | modda × oy byudjet |
| `KpiTarget` | kunlik/haftalik/oylik target (M10 bosqichida) |

**Migratsiya siyosati.** `HrKpiDailyLog` **darhol o'chirilmaydi** — HR oylik dvigateli uni o'qiydi.
Tartib: (1) yangi ombor yoziladi va eskisi bilan parallel to'ldiriladi; (2) HR servisi yangi ombordan
o'qishga o'tkaziladi; (3) eski jadval faqat-o'qish qoldiriladi; (4) keyin olib tashlanadi.
Har bosqich **qaytariladigan** bo'lishi shart.

---

## 10. Testlash

**10.1 Sof modullar** (Prisma mocksiz): FSM o'tishlari · ko'rsatkich hisoblash · kompozit ball ·
qoida chegaralari · normalizatsiya (soat, ta'til, yangi xodim).

**10.2 Qo'riqchi testlar:**
- **Idempotentlik** — bir kunni ikki marta qabul qilish bonusni ikki marta yozmaydi;
- **Muzlatish** — qabul qilingan kunga yozish rad etiladi; qayta ochish sabab talab qiladi;
- **Bloklash** — qabul qilinmagan kun oylik hisobiga **kirmaydi**;
- **Eskirish** — manba hujjat o'zgarsa bayroq + navbat elementi + tuzatuvchi qator;
- **Profil versiyasi** — og'irlik o'zgartirilgach **o'tgan kun raqami o'zgarmaydi**;
- **Formula yagonaligi** — yangi ekran o'z foiz/foyda formulasini yozsa test yiqiladi
  (mavjud `no-adhoc-percent.test.ts` naqshi).

**10.3 E2E:** kun hisoblanadi → menejer og'ishni ko'radi → tuzatadi (sabab bilan) → qabul qiladi →
bonus `HrBonusFineLog` da paydo bo'ladi → oylik hisobida aks etadi → chek tahrirlanadi → kun
eskirgan bo'ladi va navbatga qaytadi.

**10.4 Gate:** `typecheck 0` · `biome 0` · i18n key-existence (ru+uz) + no-hardcoded ·
Vitest regressiyasiz · **Phase-2 QA real brauzerda** (brauzerda ko'rilmagan ish «Phase-1» deb
belgilanadi — CLAUDE.md §1).

---

## 11. Bosqichlar

| Bosqich | Mazmun | Sabab |
|---|---|---|
| **M1** | KPI o'lchov yadrosi: katalog · versiyalangan profil · yangi ombor · hisoblash · tungi cron (UI yo'q) | Qabul qilish uchun avval o'lchash kerak |
| **M2** | **Kunlik qabul qilish** ⭐ — FSM · hodisa jurnali · menejer ekrani · drill-down · tuzatma · rad etish halqasi · eskalatsiya | **Egasining 1-ustuvorligi** |
| **M3** | Qabul → oylik: bloklash · idempotent bonus/jarima · eskirgan kun tuzatmasi · egaga haftalik xulosa | Pul halqasini yopadi |
| **M4** | **To'liq xodimlar nazorati** ⭐ — jonli holat · xodim kartasi 360° · hayot sikli · javobgarlik | **Egasining 2-ustuvorligi** + xavfsizlik teshigi |
| **M5** | Ogohlantirish navbati: qoida dvigateli · 12 qoida turi · navbat ekrani · sabab kodlari | Nazorat halqasi |
| **M6** | Smena yakunini qabul qilish · ma'lumot sifati paneli | Qabul naqshini kengaytirish + ishonch |
| **M7** | «Nima qotib qolgan» · SLA paneli | Jarayon nazorati |
| **M8** | Uch xil zaxira signali · narx o'zgarishi tarixi va chegarasi | Tovar va narx nazorati |
| **M9** | Xarajat byudjeti (plan/fakt) | Pul chiqishi ko'rinadi |
| **M10** | Kunlik/haftalik target · kompozit ball va **reyting formulasi** | Panelda va'da qilingan, formulasi hech qayerda yo'q edi |

**Har bosqich — alohida sessiya, alohida commit, o'z gate'i bilan** (CLAUDE.md §0.3).
Parallel sessiya faol bo'lsa — **worktree izolyatsiyasi** (CLAUDE.md §6.5/§6.7).

---

## 12. Boshqa bo'limlarga bog'liqlik

| Bog'liqlik | Qayerga |
|---|---|
| Zararga sotuv, chegirma, kassa farqi hodisalari | **1-bo'lim (Kassa)** — `CashierAuditEvent` (1.3) |
| Formulalar va ko'rsatkich ta'riflari | **3-bo'lim (Analitika)** — `report/metrics/` (1.4) |
| Oylik dvigateli, bonus/jarima, davomat, ta'til/avans | **6-bo'lim (HR)** |
| `EmployeePermission`, ruxsat matritsasi, `OWN_GROUP` | **4-bo'lim asl TZ** (`4-B1`…`4-B3`, `4-B5`…) |
| Yig'ish SLA, inventarizatsiya farqi | **7-bo'lim (Ombor)** |
| Filial kesimi | **8-bo'lim** — 2-to'lqin `Branch` modelidan keyin |
