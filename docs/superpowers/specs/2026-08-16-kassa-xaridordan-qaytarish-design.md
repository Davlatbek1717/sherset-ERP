# Kassada «Xaridordan qaytarish» — dizayn (2026-08-16)

> Holat: **dizayn tasdiqlangan**, implementatsiya boshlanmagan.
> Egasi bilan brainstorming'da 4 ta yadro qarori olindi (§2).

## 1. Muammo

Kassada hozir faqat **chekdan qaytarish** bor: kassir «Cheklar» ro'yxatidan aynan
o'sha chekni topib, undan qaytaradi. Egasining gapi: **«mijozlar chekni
qaytarishmaydi»**.

MoySklad akkaunti o'lchandi (2009 hujjatning HAMMASI, namuna emas —
`moysklad-return-full-spec` xotirasi):

| O'lchov | Qiymat |
|---|---|
| `salesreturn` (Возврат покупателя) | **2009** hujjat, 1 242 916 818 so'm |
| shundan **asl hujjatsiz (mustaqil)** | **1515 (75,4%)** |
| otgruzkaga bog'langan | 494 (24,6%) |
| oyiga | 150–210 ta (kundalik amal) |
| pul qaytarilgani | 931 (46%) — qolganida mijoz QARZI kamaygan |
| tasdiqlash zanjiri | **YO'Q** (`metadata.states` bo'sh) |

⇒ Bizning kassa MoySklad amaliyotining **atigi 25% ini** qoplaydi.

## 2. Qabul qilingan qarorlar (egasi, 2026-08-16)

1. **Pul** — kassir tanlaydi: «Naqd qaytardim» yoki «Qarzdan yechilsin».
2. **Mijoz** — DOIM majburiy tanlanadi (hisobot toza bo'lsin).
3. **Tovar/narx** — savdo ekrani uslubida: setka + qidiruv + skaner; narx
   kartochkaning chakana narxidan keladi va tahrirlanadi.
4. **Nazorat** — tasdiqlash zanjiri YO'Q, lekin har qaytarish kassir audit
   jurnaliga yoziladi.

## 3. Nima allaqachon bor

- **`SalesReturn`** modeli va servisi: `demandId` **ixtiyoriy** (mustaqil
  qaytarish qo'llab-quvvatlanadi); `post()` tan narxni o'sha ondagi
  o'rtachadan **muzlatadi**, tovarni omborga qaytaradi, mijoz balansini
  `−sumMinor` qiladi. **Kassa yashig'iga TEGMAYDI** — MoySklad bilan aynan bir xil.
- **`CashOut`**: `post()` kassadan `−sumMinor` chiqaradi va balansni
  `+sumMinor` qiladi; `expenseItem` maydoni bor (MoySklad'dagi «Возврат» moddasi).
- **POS rejim tuzilishi**: `sotuv · navbat · zakazlar · cheklar · smena` —
  har biri `_components/*-mode.tsx`.
- **Kassir ruxsati**: `salesreturn` view+create BOR; `counterparty` create BOR.

## 4. Tanlangan yondashuv: bitta POS endpointi, bitta tranzaksiya

`POST /pos/returns` — `SalesReturn` va (naqd bo'lsa) `CashOut` **bitta
tranzaksiyada** yaratiladi va post qilinadi.

Rad etilgan variantlar:
- **Ketma-ket chaqirish** (POS avval qaytarish, keyin chiqim): ikki qadam
  orasida uzilish bo'lsa qaytarish o'tib, pul chiqmay qoladi — kassir pulni
  qo'lda bergan, balans esa bizni qarzdor ko'rsatadi. Kassada real xavf.
- **Mavjud `refund()` ni kengaytirish**: u butunlay asl chek atrofida qurilgan
  (oyna chek, asl chekdan tan narx, smenaga bog'lanish) — cheksiz holatda
  bularning hammasi ma'nosini yo'qotadi va soxta chakana savdolar chek
  ro'yxatini iflos qiladi.

## 5. Ekran oqimi (UX)

Yangi POS rejimi **«Qaytarish»** — rejim qatorida, ruxsati yo'q xodimda
ko'rinmaydi.

- **Tuzilishi «Sotuv» bilan bir xil**: chapda tovar setkasi + qidiruv + skaner,
  o'ngda savat. Kassir yangi narsa o'rganmaydi.
- **Rangi ATAYLAB boshqa** (qizil-to'q sariq urg'u; «Sotuv» yashil) va
  sarlavhada yirik «QAYTARISH». Ikki ekran bir xil ko'rinsa kassir noto'g'ri
  rejimda ishlab ketadi.
- **Tartib**: tovar skaner qilinadi/qidiriladi → savatga tushadi → narx
  kartochkadan keladi → miqdor/narx savat qatorini bosib, o'sha tanish numpad
  oynasida tahrirlanadi.
- **Mijoz**: savat tepasida katta maydon. Tovar qo'shishni bloklamaydi
  (navbatda skaner tezroq), lekin **tasdiq tugmalari mijozsiz o'chiq** +
  ochiq yozuv «Mijozni tanlang». Yangi mijozni shu yerdan qo'shish mumkin.
- **Ikki tugma**: «Naqd qaytardim» · «Qarzdan yechilsin» — ikkalasi ham
  yakuniy summa bilan va ikkalasi ham **tasdiq oynasini** ochadi (mijoz, summa,
  amal turi). Pul harakati qaytarilmaydi — bir bosishda o'tmasligi kerak.
- **Tugagach**: savat bo'shaydi, hujjat raqami ko'rsatiladi, qaytarish cheki
  chop etiladi (mavjud chek yo'lidan).

## 6. Ma'lumot va pul oqimi

**Kirish**: `{ agentId, storeId, positions[{productId, quantity, priceMinor}],
settlement: 'CASH'|'DEBT', syncId }`.

**`DEBT` rejimi** — faqat `SalesReturn`:
```
ombor:  +miqdor (tan narx = o'sha ondagi o'rtacha, MUZLATILADI)
balans: −summa            (mijozning bizga qarzi kamayadi)
kassa:  tegilmaydi
```

**`CASH` rejimi** — ustiga `CashOut` (`expenseItem = "Qaytarish"`, o'sha mijoz,
smenaning kassasi):
```
balans: −summa +summa = 0   (tovar oldik, pul berdik — hisob yopiq)
kassa:  −summa
```

Ikkalasi bitta tranzaksiyada: biri yiqilsa **ikkalasi ham qaytadi**.

## 7. Smena hisobi — 🔴 eng nozik joy

Smena yopilishida kutilgan naqd
(`cashier-session-reconciliation.ts` → `expectedCashMinor`):

```
kutilgan = ochilish + savdo + kirim + qarz to'lovi − chiqim − QAYTARISH
```

`returnsCashMinor` a'zosi **allaqachon bor**, lekin hozir uni FAQAT oyna
cheklar (`retailSale.refundedFromId != null`) to'ldiradi
(`cashier-session.service.ts` → `gatherShiftCashInputs`).

⇒ Yangi hujjat o'sha a'zoga tushmasa, kassir smena yopganda **aynan qaytargan
summasiga kam pul bilan qoladi va unga kamomad yoziladi** — o'zi hech narsa
qilmagan holda. Shuning uchun:

- `SalesReturn` ga **smena havolasi** qo'yiladi — **ikkala rejimda ham**
  (hisobot uchun: «shu smenada qanday qaytarishlar bo'ldi»);
- `gatherShiftCashInputs` shu smenadagi qaytarishlardan **faqat `CASH`
  bo'lganlarini** `returnsCashMinor` ga qo'shadi;
- `DEBT` rejimidagi qaytarish kutilgan naqdga **ta'sir qilmaydi** (undan pul
  chiqmagan) — havolasi bor, lekin summasi hisobga kirmaydi.

Ajratish mezoni: qaytarishga bog'langan `CashOut` bormi. Ya'ni «naqdmi?»
degan savol alohida bayroq bilan emas, **hujjat mavjudligi** bilan javob
topadi — ikkinchi haqiqat manbai yaratilmaydi.

## 8. Sxema o'zgarishlari (4 ta, hammasi kichik)

| # | O'zgarish | Nega |
|---|---|---|
| 1 | `CashOutOperation` ga `salesReturnId` + `targetKind='salesreturn'` | hozir faqat `InvoiceIn` ga bog'lanadi; usiz «bu pul qaysi qaytarish uchun» degan savolga javob yo'q |
| 2 | `SalesReturn` ga `cashierSessionId` (nullable) | §7 smena hisobi |
| 3 | `SalesReturn` ga `(accountId, syncId)` UNIKAL indeks | takroriy bosishda ikki karra pul chiqmasligi (§9) |
| 4 | Kassir audit hodisasi: yangi tur (`returnCreated`) | §2 qarori 4 |

Audit payload'i: hujjat nomi va id, mijoz, jami summa, **`settlement`
(`CASH`/`DEBT`)**, qatorlar soni. Menejer paneli pul hissasini shu summadan
o'qiydi — mavjud hodisalar bilan bir naqsh (`daily-kpi-drilldown.service.ts`
`amountOfEvent`ga yangi `case` qo'shiladi).

## 9. Ruxsat dizayni

Kassirda `salesreturn` BOR, **`cashout` ATAYLAB YO'Q** — u firibgarlikka moyil
huquq deb belgilangan (`role-templates.test.ts`: ombor menejeri va ta'minotchi
undan mahrum). Uni kassirga berish istalgan odamga pul chiqarish yo'lini ochardi.

Shuning uchun: endpoint **faqat `salesreturn.create`** bilan qo'riqlanadi,
chiqim hujjatini **servisning o'zi ichkarida** yaratadi. Kassir umumiy
pul-chiqarish huquqini olmaydi — savdoda kassaga pul tushirishi bilan bir mantiq
(tor imkoniyat, keng huquq emas).

## 10. Xato holatlari

| Holat | Xulq |
|---|---|
| **Kassada naqd yetmaydi** (eng ehtimolli) | rad etiladi; matn: «Kassada X so'm bor, Y chiqara olmaysiz. Qarzga yozing yoki kassaga pul kirim qiling». Tranzaksiya tufayli qaytarish hujjati ham yaratilmaydi |
| Ochiq smena yo'q | 409 «Ochiq smena yo'q — avval smena oching» (ikkala rejimda ham) |
| Takroriy bosish / qayta yuborish | `syncId` unikal ⇒ ikkinchi so'rov yangi hujjat yaratmaydi |
| Narx 0 | RUXSAT (sovg'a qaytarildi — tovar keladi, pul harakat qilmaydi). Lekin `CASH` da **jami > 0** shart |
| Mijoz yoki tovar yo'q | ekranda tugma o'chiq + serverda tekshiriladi (ekran qulfi himoya emas) |

## 11. Testlar

Yo'qolsa **jimgina noto'g'ri pul** beradigan uchtasi:

1. **Hisob sofligi** — `CASH` da balans aynan **0** ga qaytishi, `DEBT` da
   `−summa` bo'lib qolishi (sof funksiya, Prisma'siz).
2. **Smena hisobi** — smenadagi naqd qaytarish kutilgan naqdni aynan o'sha
   summaga kamaytirishi (§7 regressiyasi).
3. **Atomlik** — chiqim yiqilsa qaytarish hujjati, ombor va balans
   **qimirlamasligi**.

Qolganlari: takroriy `syncId` → bitta hujjat; smenasiz → 409; naqd
yetmaganda xato matnida **mavjud summa** ko'rinishi; ekranda mijozsiz tugma
o'chiq, narx tahriri savatga tushishi, tasdiq oynasi chiqishi.

**Yorliq: «Phase-1 — strukturaviy, runtime-tasdiqlanmagan».** Brauzer va
haqiqiy kassada sinash ALOHIDA qadam.

## 12. Qamrovdan tashqarida

- Ta'minotchiga qaytarish (`PurchaseReturn`) — alohida hujjat, alohida ish.
- Dollar naqd qaytarish — smenada USD oqimi alohida hisoblanadi (MK31), bu
  ishda faqat **UZS**.
- MoySklad'ga qaytarishni teskari yuborish (sync) — hozircha yo'q.
- Menejer tasdig'i / chegara — egasi ataylab rad etdi (§2 qarori 4).
