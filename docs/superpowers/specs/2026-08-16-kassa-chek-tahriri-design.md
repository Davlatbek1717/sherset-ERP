# Kassa cheklarini tahrirlash va qisman qaytarish — dizayn

**Sana:** 2026-08-16 · **Holat:** tasdiqlangan (egasi) · **Bosqichlar:** 1 (hozir) + 2 (alohida sessiya)

## 1. Muammo

Cheklar ro'yxatidan chekni tanlab **o'zgartirib bo'lmaydi**. Talab (egasi): «xuddi
MoySklad'dagidek» — qoralama ham, to'langan chek ham tahrirlansin; mijoz **istagancha**
tovar qaytara olsin.

### O'lchangan holat (2026-08-16, prod `sherset_v2`)

| Nima | Holat |
|---|---|
| Ro'yxatdan chekni ochish | ✅ ishlaydi (`/retail/sales` qatori kartaga havola) |
| Chek kartasidagi amallar | chop etish · **to'liq** qaytarish · omborchiga yuborish |
| Tahrirlash tugmasi | ❌ hech qayerda yo'q |
| `PATCH /retail-sales/:id` | ✅ server'da bor, **faqat `draft`** (`retail-sale.service.ts:574`) · UI ulanmagan |
| Qisman qaytarish (`positions` qism-to'plami) | ✅ server'da to'liq yozilgan · UI **butun chekni** yuboradi |
| To'langan chekni bekor qilish | ❌ `cancel()` ataylab rad etadi (`retail-sale.service.ts:1293`) |

Prod ma'lumoti: 18 chek (11 `posted`, 3 `draft`, 1 `ready`, 3 `cancelled`), kontragentga
sotilgani **0** — ya'ni bu oldinga qaragan funksiya, mavjud ma'lumotni tuzatish emas.

## 2. Nega bu oddiy «tahrir» emas

MoySklad qoldiq va saldoni **hujjatlardan qayta hisoblaydi** — shuning uchun u yerda hujjatni
tahrirlash yetarli. Bizda esa to'langan chek **to'rtta materiallashgan daftarga** yozib
bo'lingan:

1. **Ombor** — tovar yechilgan (`stock`, tan narx FIFO qatorlari)
2. **Kassa / smena** — pul olingan, smena hisoblagichlari va Z-hisobotga tushgan
3. **Kontragent balansi** — qarzga sotilgan bo'lsa `CounterpartyBalance` + jurnal
4. **Qarz reyestri** — `Debt` qatori

Bu daftarlar **append-only** va ular ustida invariant turadi:
`Σ(CounterpartyBalanceEntry.deltaMinor) == CounterpartyBalance.balanceMinor`
(2026-08-16 da MoySklad'dan qoldiq ko'chirilganda aynan shu invariant bilan tekshirilgan).
Chek qatorini «joyida» o'zgartirish bu daftarlarning hech biriga tegmaydi ⇒ ombor qoldig'i,
kassa jamg'armasi va mijoz qarzi bir zumda haqiqatdan uziladi.

## 3. Tanlangan yondashuv — A: joyida tahrir + kompensatsiya yozuvlari

Foydalanuvchi uchun chek **joyida o'zgargandek** ko'rinadi (raqami saqlanadi), ichkarida esa
daftarlarga **teskari + yangi** juft yozuv tushadi. Daftarlar append-only qoladi.

**Rad etilgan variantlar:**
- **B — storno + yangi chek:** eng sodda, lekin chek raqami o'zgaradi ⇒ mijozdagi qog'oz chek
  bazadagi bilan mos kelmaydi.
- **C — MoySklad modeliga o'tish** (hamma narsani hujjatlardan qayta hisoblash): oylab
  davom etadigan qayta qurish, bugun tiklangan qarz ma'lumotlarini xavf ostiga qo'yadi.

### Egasining ikki qarori (2026-08-16)

1. **Tahrir doirasi — cheklovsiz.** Yopilgan smenadagi chek ham tahrirlanadi.
2. **Pul farqi — joriy ochiq smenaga.** Asl smena va uning Z-hisoboti **qayta yozilmaydi**.

Bu tizimdagi mavjud naqsh bilan bir xil: 2026-08-13 (F6) dan beri qaytarish ham asl smenaga
emas, **qaytaruvchi kassirning joriy ochiq smenasiga** rasmiylashadi.

> 🔴 **Ochiq oqibat (egasi ongli tanladi).** Eski chek summasi o'zgarsa, o'sha kungi Z-hisobot
> endi o'z cheklari yig'indisiga teng bo'lmaydi — farq joriy smenada turadi. Ya'ni «kun
> hisoboti» tarixiy hujjat bo'lib qoladi, cheklarning joriy holatidan hisoblanmaydi.

## 4. 1-bosqich — hozir quriladi

### 4.1 Qisman qaytarish (mijoz istagancha tovar qaytaradi)

**Server allaqachon qo'llab-quvvatlaydi** — qurilmaydi, faqat ochiladi:
- `RefundRetailSaleSchema.positions` — asl chek qatorlarining qism-to'plami, `quantity` kasr
  (6 xonagacha) ⇒ 2.5 kg qaytarish mumkin;
- **§105 over-refund qo'riqchisi** — mahsulot/miqdor asl chekdan oshmaydi;
- **SALES-05** — cheklov **jamlangan**: bu qaytarish + oldingi barcha qaytarishlar ≤ asl chek;
- **`priceRefundFromOriginal`** — narx asl chekdan olinadi, mijoz yuborgan narx **e'tiborsiz**
  qoldiriladi (aks holda cheklov o'z-o'ziga havola qilardi);
- tan narx `retail-refund-cogs.ts` → `remainingQty` bo'yicha yuritiladi;
- naqd/karta kanali bo'yicha to'lov cheklovi mavjud.

**Qilinadigan ish:**
1. **Server (kichik):** chek o'qish javobiga (`findById`) har qator uchun `refundedQty` va
   `remainingQty` qo'shish. Hisob-mantiq `retail-refund-cogs.ts` da **bor**, faqat o'qish
   modelida ko'rsatilmagan.
2. **UI:** `/retail/sales/[id]` da «Возврат» tugmasi → oyna: har qator, miqdor maydoni
   (sukut = qaytarish mumkin bo'lgan qoldiq), yonida «qaytarish mumkin: N». Nol qoldiqli
   qator o'chirilgan holatda. Jami qaytariladigan summa oynada ko'rinadi.

**Qabul mezoni:** 5 dona sotilgan chekdan 2 dona qaytarilsa — omborga 2 dona qaytadi,
kassadan 2 donaning asl narxi chiqadi, qolgan 3 dona keyin qaytarilishi mumkin, 6-donani
qaytarishga urinish 400 bilan rad etiladi.

### 4.2 Qoralama chekni tahrirlash

- **Faqat `draft`** holatidagi chek kartasida **«Tahrirlash»** tugmasi → tovar, son, narx,
  mijozni o'zgartiruvchi forma → `PATCH /retail-sales/:id`.
- Server tayyor: `state !== 'draft'` bo'lsa rad etadi, `version` bilan optimistik qulf
  (bir vaqtda ikki kishi tahrirlasa 409 `OPTIMISTIC_LOCK`), qatorlarni qayta yozish
  tranzaksiya ichida atomik.
- To'langan chekda tugma **ko'rinmaydi**.

> Eslatma: `PATCH` hozir `ready` holatini rad etadi (`state !== 'draft'`). Agar `ready`
> chek ham tahrirlanishi kerak bo'lsa — bu server o'zgarishi va rezerv (`send-to-picking`
> bilan band qilingan tovar) qayta hisoblanishi shart. 1-bosqichda **faqat `draft`**.

## 5. 2-bosqich — `unpost` yadrosi (alohida sessiya)

To'langan chekni tahrirlash = **bitta tranzaksiyada**:

```
teskari yozuv (4 daftar) → chek tarkibi yangilanadi → yangi yozuv (4 daftar)
```

- Teskari va yangi yozuvlar **joriy ochiq smenaga** tushadi;
- chek **raqami saqlanadi**, eski varianti versiya tarixida qoladi (kim/qachon/nima);
- **3-punkt (to'langan chekda mijozni almashtirish)** — shu yadroning bir holati: kontragent
  balansi va qarz reyestri eski mijozdan yechilib yangisiga yoziladi;
- qaytarilgan (mirror) chek tahrirlanmaydi — mavjud `refundedFromId` qo'riqchisi bilan bir
  uslubda rad etiladi;
- allaqachon qisman qaytarilgan chekni tahrirlash — qaytarilgan miqdordan pastga tushirish
  **rad etiladi** (aks holda qaytarish asl chekdan oshib ketardi).

## 6. Testlash

- **1-bosqich:** `remainingQty` o'qish modeli uchun birlik testlari; qisman qaytarish
  komponent testi (miqdor kiritish, qoldiq ko'rsatkichi, nol qoldiq); mavjud server
  testlari (`retail-refund-validation`, `retail-refund-cogs`) regressiyani ushlab turadi.
  🔴 Yangi `.tsx` qo'shilsa — **to'liq web suite** yugurtiriladi (konvensiya qo'riqchilari
  faqat to'liq yugurishda ko'rinadi).
- **2-bosqich:** har daftar uchun «teskari + yangi = sof farq» invariant testi; eng muhimi —
  `Σ(jurnal) == balans` invarianti tahrirdan keyin ham buzilmasligi.

## 7. Qamrovdan tashqarida

- Z-hisobotni orqaga qarab qayta hisoblash (egasi ataylab rad etdi — §3).
- Fiskal modul / soliq integratsiyasi — kodda hozir yo'q, bo'lsa tahrir siyosati qayta
  ko'riladi.
- MoySklad'ga teskari sinxronizatsiya (tahrir MoySklad'da aks etmaydi).
