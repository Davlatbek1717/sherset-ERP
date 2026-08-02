# TZ — 7-bo'lim: OMBOR (manzilli saqlash, qabul, yig'ish, inventarizatsiya)

**Sana:** 2026-08-02 · **Holat:** dizayn tasdiqlangan (egasi tomonidan) · **Faza:** implementatsiyadan oldingi spetsifikatsiya

> Oldingilari: [1) Kassa](2026-08-01-kassa-tz-design.md) · [2) Onlayn sotuv](2026-08-01-onlayn-sotuv-b2b-b2g-tz-design.md) ·
> [3) Analitika](2026-08-01-analitika-tz-design.md) · [4) Menejer](2026-08-01-menejer-tz-design.md) ·
> [5) Ta'minotchilar](2026-08-01-taminotchilar-tz-design.md) · [6) HR](2026-08-02-hr-tz-design.md).
> Keyingisi: 8) Ko'p filiallilik.

---

## 0. Kontekst

### 0.1 Mavjud (2026-08-01 `d7ab3b1` dan keyin yangilangan)

| Qism | Joyi |
|---|---|
| **Omborchi paneli** | `apps/web/src/app/(app)/omborchi/page.tsx` — yig'ish varaqalari, «Tayyor», chop etish |
| **`mark-ready`** | `retail-sale.service.ts:1169` — har omborchi **o'z zonasi** topshiriqlarini yopadi; sotuv `ready` ga **barcha** omborlar tugagach o'tadi |
| Yacheyka skaneri | `/cell`, `/cell/[code]`, `cell-scan-input.tsx`, `components/restock/qr-scanner.tsx` |
| Topshiriqlar | `RestockTask` — `type='restock'` (joylashtirish), `type='picking'` (yig'ish) |
| Ombor operatsiyalari hisoboti | `report/warehouse-ops.service.ts` — qabul → joylashtirish → yig'ish, omborchi kesimida |
| Omborchi ↔ ombor + printer | `settings/sklad-keepers`, `SkladKeeper` |
| Yig'ish varag'i tuzuvchi | `restock-task.service.ts:getPickingSheets()` — zona bo'yicha bo'lish + **serpentin marshrut** |
| Yig'ish to'lqinlari | `picking-waves`, `pick-list` modullari |
| Inventarizatsiya | `inventory` + `analitika/{count, cycle, variance, reason-code}` |
| Manzil modeli | `StoreZone` · `StoreCell` · `StockByCell` (moysklad-parity) |

### 0.2 Muammolar

**P1 — Ikkita parallel manzil tizimi.**
- **sherset uslubi:** tovar atributida bitta matn — `attributes.__yacheyka = "01-02-03-05"`.
  Yig'ish varag'i **shundan** ishlaydi (`restock-task.service.ts:29-50`).
- **climart/moysklad uslubi:** `StoreZone` / `StoreCell` / `StockByCell` — validatsiyalangan
  yacheyka va **yacheyka bo'yicha real qoldiq**. Hujjat pozitsiyalarida `cellId` bor.

Ikkalasi bir-birini bilmaydi.

**P2 — `skladNo` hech narsaga bog'lanmagan.**
`SkladKeeper.skladNo` — oddiy `Int` (`@@unique([accountId, skladNo])`), `Store` ga havolasi yo'q.
Lekin `StoreCell` **`Store`ga** tegishli va `RetailSale` da **bitta `storeId`** bo'ladi.
Ya'ni «1-ombor / 2-ombor / 4-ombor» — alohida `Store` emas.

**P3 — Yo'qolgan ikki xususiyat (kodda ochiq yozilgan).**
- yacheykadagi **miqdor** (`×30`) — sherset `locQty` da yuritardi;
- **ko'p yacheyka** (`extraBins`) — UI'da maydon bor (`omborchi/page.tsx`), backend **doim bo'sh
  massiv** qaytaradi (`restock-task.service.ts` — `extraBins: []`).

---

## 1. Qabul qilingan qarorlar

| # | Qaror | Tanlangan |
|---|---|---|
| Q1 | Manzil haqiqat manbai | **`StockByCell`** — yacheyka bo'yicha real qoldiq |
| Q2 | Ko'p yacheyka | **Ha** — asosiy joy + qo'shimcha joylar |
| Q3 | Inventarizatsiya | **hammasi**: yacheyka skaneri · sikl-sanash · to'liq davriy · og'ish sabablari va javobgarlik |
| Q4 | Omborchi o'lchovi | **hammasi**: zakas soni · pozitsiya soni · yig'ish tezligi · xatolar |
| Q5 | `skladNo` mazmuni | **`StoreZone`** (quyida, P2 yechimi) |

---

## 2. Asosiy arxitektura qarori — `skladNo` = `StoreZone`

```
Store    (ombor)          → filial darajasi uchun bo'sh qoladi   → 8-bo'lim
  └ StoreZone  (sklad 1..N)  ← SkladKeeper shu yerga bog'lanadi
      └ StoreCell (yacheyka)  ← «01-02-03-05» ning qolgan segmentlari
          └ StockByCell        ← REAL QOLDIQ (haqiqat manbai)
```

- Yacheyka kodi `01-02-03-05` = **zona(sklad) – polka – qavat – yacheyka**.
  1-segment → `StoreZone`, butun kod → `StoreCell.name` (kod ko'rinishi o'zgarmaydi — omborchilar
  o'rgangan format saqlanadi).
- `SkladKeeper` ga **`zoneId`** qo'shiladi; `skladNo` ko'rsatish va chop etish uchun **saqlanadi**
  (printer marshrutlash, varaq sarlavhasi — hech narsa buzilmaydi).
- **`Store` darajasi bo'sh qoladi** — bu tasodifiy emas: 8-bo'limda har filial o'z `Store`i bo'ladi,
  zonalar esa filial ichida. Agar bugun sklad = `Store` deb qilinsa, filial qo'shilganda butun model
  qayta qurilardi.

---

## 3. Manzil modeli va ko'p yacheyka (Q1, Q2, P3)

### 3.1 Haqiqat manbai
`StockByCell(storeId, cellId, assortment) → qty` — **qoldiqning haqiqati**.
`Stock` (ombor darajasidagi umumiy qoldiq) saqlanadi va **doimo tekshiriladi**:
```
Σ StockByCell.qty (store × tovar)  ==  Stock.qty (store × tovar)
```
Farq bo'lsa — **«yacheykaga biriktirilmagan qoldiq»** deb ko'rsatiladi (jim yashirilmaydi).

### 3.2 Asosiy va qo'shimcha yacheyka
- Bir (ombor × tovar) uchun **bir necha** `StockByCell` qatori bo'lishi mumkin.
- Bittasi **asosiy** (`isPrimary`) — joylashtirish taklifi va marshrut tartibi shundan.
- Tovarning eski `__yacheyka` atributi → aynan shu **asosiy yacheyka** belgisiga aylanadi
  (ma'lumot yo'qolmaydi, roli o'zgaradi).
- **Yig'ish tartibi:** asosiy yacheykadan boshlanadi; miqdor yetmasa qo'shimchalardan olinadi
  (eng yaqin yacheyka birinchi — serpentin marshrut mantiqi saqlanadi).
- `extraBins` nihoyat **haqiqiy** to'ldiriladi (UI allaqachon tayyor).

---

## 4. Migratsiya — 6 qadam (eng nozik qism)

> **Tamoyil:** bir zarbada emas. Har qadam **qaytariladigan**, har qadamdan keyin **tekshiruv hisoboti**.
> Ombor to'xtamaydi.

| Qadam | Mazmun | Tekshiruv |
|---|---|---|
| **1** | `__yacheyka` kodlaridan `StoreZone` + `StoreCell` generatsiya (kodda `yacheyka-diapazon-generatori` spec'i bor) | yaratilgan zona/yacheyka soni; noto'g'ri formatdagi kodlar ro'yxati |
| **2** | Backfill: har tovarning joriy `Stock.qty` → **asosiy** yacheykaga `StockByCell` qatori | `Σ StockByCell == Stock` bo'yicha farq hisoboti |
| **3** | **Ikki tomonlama yozish** (dual-write): hujjatlar ham eski atributni, ham `StockByCell` ni yangilaydi | kunlik farq monitoringi |
| **4** | Yacheyka intizomi yoqiladi (§5) — avval ogohlantirish rejimida | yacheykasiz kiritilgan pozitsiyalar ulushi |
| **5** | Yig'ish varag'i `StockByCell` dan o'qishga o'tadi (eski `cellOf(attributes)` o'rniga) | eski va yangi usul **bir xil varaq** berishini solishtirish |
| **6** | Eski atribut faqat o'qish rejimiga; intizom **blok** rejimiga | yacheykasiz hujjat 0 ga tushishi |

**Qaytarish rejasi:** 5-qadamgacha eski mexanizm ishlashda davom etadi — muammo chiqsa bayroq
o'chiriladi va eski yo'lga qaytiladi.

---

## 5. Yacheyka intizomi (StockByCell'ning hayotiy sharti)

`StockByCell` faqat **har harakat yacheyka bilan yozilsa** to'g'ri qoladi. Shuning uchun:

- **Kirim** (`supply`, `enter`, `sales-return`, `purchase-return` qaytishi) va
  **chiqim** (`demand`, `retail-sale`, `loss`, `move`) pozitsiyalarida yacheyka **majburiy**.
- **Bosqichma-bosqich yoqish:** `ogohlantirish` → `majburiy` (hujjat darajasida sozlanadi).
  Birdan bloklash omborni to'xtatadi — bu qabul qilinmaydi.
- **Skaner oqimi:** **yacheyka → tovar → miqdor**. Yacheyka skaneri mavjud (`/cell/[code]`).
- Yacheykasiz eski hujjatlar «biriktirilmagan qoldiq» sifatida qoladi va alohida hisobotda ko'rinadi.

---

## 6. Qabul → joylashtirish (putaway)

```
Supply (admin tasdig'i, 5-bo'lim) → RestockTask type='restock' avtomatik
   → tizim JOY TAKLIF QILADI (asosiy yacheyka; to'lgan bo'lsa — bo'sh yacheyka)
   → omborchi skanerlaydi: yacheyka → tovar → miqdor
   → StockByCell oshadi + topshiriq yopiladi
```
- Taklif qilingan joydan boshqasiga qo'yish mumkin (majburlanmaydi) — lekin **skanerlangan
  yacheyka yoziladi**, taxmin emas.
- Joylashtirilmagan qoldiq omborchi panelida **kutayotgan ish** sifatida turadi
  (`warehouse-ops` hisobotida allaqachon «backlog» bor).

---

## 7. Yig'ish (picking)

**Bor:** zona bo'yicha varaqalar · serpentin marshrut · per-zona `mark-ready` · printer marshrutlash.

**Qo'shiladi:**
1. **Real qoldiq bo'yicha yig'ish** — bir tovar bir necha yacheykadan (`StockByCell`), asosiy joydan boshlab.
2. **Qisman yig'ish** — omborchi «kam» yoki «yo'q» deb belgilaydi → kassirga **qizil** bo'lib qaytadi
   (1-bo'lim §4.1). Hozir faqat «hammasi tayyor» bor.
3. **Skaner bilan tasdiqlash** — tovar skanerlanadi, noto'g'ri tovar olinsa tizim ogohlantiradi.
4. **Vaqt o'lchovi** — varaq chiqqan payt va «tayyor» bosilgan payt yoziladi (§9 uchun).

---

## 8. Inventarizatsiya (Q3 — hammasi)

| Tur | Mazmun |
|---|---|
| **Yacheyka bo'yicha skaner sanash** | omborchi yacheykani skanerlaydi → tizim u yerda nima turishi kerakligini ko'rsatadi → sanaydi. Yacheyka skaneri mavjud |
| **Sikl-sanash** | har kuni ma'lum yacheykalar/tovarlar; ombor to'xtamaydi (`analitika/cycle` moduli bor) |
| **To'liq davriy** | belgilangan sanada butun ombor (`inventory` moduli bor) |
| **Og'ish sabablari va javobgarlik** | kamomad → sabab kodi (o'g'irlik / buzilgan / hisob xatosi / topilmadi) + **javobgar omborchi** (`reason-code`, `variance` modullari bor) |

- Sanash natijasi **yacheyka darajasida** yoziladi → `StockByCell` to'g'rilanadi.
- Og'ish 3-bo'lim «Yo'qotishlar» hisobotiga va 6-bo'lim jarima qoidalariga ulanadi.
- **Sanash paytida yacheyka «muzlatiladi»** — parallel yig'ish/joylashtirish natijani buzmasligi uchun.

---

## 9. Omborchi ishini o'lchash (Q4 — hammasi)

| O'lchov | Manba |
|---|---|
| Yig'ilgan zakas soni | `RestockTask type='picking'`, `status='done'` |
| Yig'ilgan pozitsiya/dona soni | topshiriq pozitsiyalari |
| **Yig'ish tezligi** | varaq chiqishi → «tayyor» oralig'i (§7.4) |
| **Xatolar** | kassir/mijoz aniqlagan kam yoki noto'g'ri yig'ish; inventarizatsiya kamomadi |

> **Muhim muvozanat:** tezlik **yolg'iz** o'lchanmaydi — u xato bilan **birga** ko'rsatiladi.
> Aks holda tizim shoshilishni rag'batlantiradi va xato ko'payadi.

Bu o'lchovlar: 6-bo'lim (ish birligiga oylik) va 3-bo'lim (omborchi paneli) uchun manba.

---

## 10. Ombor ichi ko'chirish
Yacheykadan yacheykaga ko'chirish — skaner bilan (`chiqish yacheykasi → tovar → miqdor →
kirish yacheykasi`). Mavjud `move` hujjati **omborlar orasida** ishlaydi, yacheykalar orasida emas.
Ko'chirish `StockByCell` ni ikki tomondan yangilaydi va jurnalga yoziladi.

---

## 11. Baza o'zgarishlari

| O'zgarish | Tafsilot |
|---|---|
| `SkladKeeper.zoneId` | `uuid?` → `StoreZone`; `skladNo` ko'rsatish uchun saqlanadi |
| `StockByCell.isPrimary` | `Boolean` — asosiy yacheyka belgisi |
| `CellTransfer` | yangi — yacheykalar orasidagi ko'chirish jurnali |
| `RestockTask.startedAt` / `completedAt` | yig'ish tezligi o'lchovi |
| `PickingError` | yangi — kam/noto'g'ri yig'ish hodisasi (kim aniqladi, qaysi topshiriq) |
| `CellFreeze` yoki `InventoryCount.cellIds` | sanash paytida yacheyka muzlatish |
| Hujjat pozitsiyalari | `cellId` **mavjud** (supply/enter/demand/loss/sales-return/purchase-return) — `retail-sale` pozitsiyasiga ham qo'shiladi |

---

## 12. Testlash

### 12.1 Unit
- `Σ StockByCell == Stock` invarianti (har kirim/chiqimdan keyin)
- Ko'p yacheykadan yig'ish: asosiydan boshlash, yetmaganda qo'shimchaga o'tish
- Serpentin marshrut tartibi **buzilmasligi** (mavjud xulq qulfi)
- Qisman yig'ish: kam belgilangan pozitsiya kassirga qizil qaytishi
- Yacheyka intizomi: `ogohlantirish` va `majburiy` rejimlari
- Inventarizatsiya: muzlatilgan yacheykaga parallel harakat rad etilishi
- Migratsiya skriptlari: har qadam **idempotent** va **qaytariladigan**

### 12.2 Migratsiya tekshiruvlari (majburiy, har qadamdan keyin)
- Yaratilgan zona/yacheyka soni va noto'g'ri formatdagi kodlar ro'yxati
- `Σ StockByCell` vs `Stock` farq hisoboti
- **Eski va yangi usul bir xil yig'ish varag'i berishi** (5-qadam qabul mezoni)

### 12.3 E2E
Qabul → joylashtirish taklifi → skaner bilan joylash → sotuv → bir tovar 2 yacheykadan yig'ilishi →
qisman yig'ish → kassirga qizil qaytishi → yacheyka bo'yicha inventarizatsiya → og'ish va sabab kodi.

### 12.4 Gate
`typecheck 0` · `biome 0` · i18n (ru+uz) · Vitest regressiyasiz · **Phase-2 QA** real brauzer +
real skaner bilan.

---

## 13. Bosqichlar

| Bosqich | Mazmun | Sabab |
|---|---|---|
| **B1** | `skladNo → StoreZone` bog'lanishi (`SkladKeeper.zoneId`) | Barcha qolgan ish shunga tayanadi; 8-bo'lim uchun ham shart |
| **B2** | Migratsiya 1–2 qadam: zona/yacheyka generatsiya + backfill + farq hisoboti | Ma'lumot poydevori |
| **B3** | Dual-write (3-qadam) + kunlik farq monitoringi | Xavfsiz o'tish |
| **B4** | Ko'p yacheyka + `isPrimary` + `extraBins` haqiqiy to'ldirilishi | Egasining aniq talabi (P3) |
| **B5** | Yacheyka intizomi (ogohlantirish rejimi) + skaner oqimi | StockByCell'ning hayotiy sharti |
| **B6** | Yig'ish `StockByCell` dan (5-qadam) + solishtirish testi | O'tishning asosiy nuqtasi |
| **B7** | Qisman yig'ish + kassirga qaytish + `PickingError` | 1-bo'lim bilan halqani yopadi |
| **B8** | Joylashtirish taklifi + skaner tasdiqlash | Qabul zanjiri |
| **B9** | Inventarizatsiya: yacheyka skaneri + sikl + muzlatish + sabab/javobgarlik | Aniqlikni ushlab turish |
| **B10** | Omborchi o'lchovlari (tezlik + xato) → 6- va 3-bo'limlarga | Oylik va nazorat |
| **B11** | Yacheykalararo ko'chirish | To'liqlik |
| **B12** | Intizom `majburiy` rejimga + eski atribut faqat o'qish (6-qadam) | Migratsiya yakuni |

---

## 14. Boshqa bo'limlarga bog'liqliklar

| Bog'liqlik | Qayerga |
|---|---|
| Yig'ish varaqalari, `mark-ready`, qisman yig'ish → kassirga qaytish | **1-bo'lim (Kassa)** |
| Onlayn/B2B buyurtmalarni yig'ish, rezerv | **2-bo'lim (Onlayn sotuv)** |
| M10 — yig'ish vaqti, yacheyka harakati, yo'qotishlar | **3-bo'lim (Analitika)** |
| Inventarizatsiya buyurtmasi, og'ish javobgarligi | **4-bo'lim (Menejer)** |
| Qabul → joylashtirish, da'vo bo'yicha qaytarish | **5-bo'lim (Ta'minotchilar)** |
| Omborchi ish birligi va xatolari → oylik | **6-bo'lim (HR)** |
| `Store` darajasi = filial | **8-bo'lim (Ko'p filiallilik)** |
