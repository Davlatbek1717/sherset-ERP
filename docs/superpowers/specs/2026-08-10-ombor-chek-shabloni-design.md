# Omborga chiqadigan chek — climart «Товарный чек» shabloni (2026-08-10)

**Egasi talabi:** «omborga chiqadigan chekni to'g'irlab ber, xuddi shu shablonda bo'lishi kerak
rasmdagidek» + rasm (climart originalining ekrani: guruhlangan `01` / `Yacheykasiz`, **Yacheyka**
ustunli, narxsiz jadval, «Всего наименований 10», footer «Climart — savdo va ombor boshqaruvi»).

**Qabul qilingan qarorlar (egasi bilan, savol-javob):**

| Savol | Qaror |
|---|---|
| Qaysi chek? | **Ikkalasi ham** — `ReceiptPrintPortal` rasmga 1:1, keyin POS omborchi varaqasi shu shablonga |
| Matnlar | **1:1**, faqat **footer bizniki** («climart» yozuvlari sherset uchun moslashtiriladi) |
| Ombor elementlari (☐, «Omborchi:», «Jami: N/N dona») | **Hech biri — toza 1:1** |
| Per-sklad printerga marshrutlash | **Saqlanadi** |

## 1. Muammo: bitta shablon emas, uchta renderer

Omborga chiqadigan varaqa uch joyda alohida chizilgan edi va ularning **hech birida render qamrovi
yo'q** edi — «YIG'ISH VARAQASI» markup'i butunlay olib tashlanganda 3152 testdan bittasi ham
yiqilmadi:

| Renderer | Kanal |
|---|---|
| `/print/picking/[orderId]` React markup | Brauzer chop etish |
| `buildSheetHtml()` (`lib/print-agent.ts`) | Electron native printer |
| `buildSheetText()` + sahifadagi `sheetToText()` | ESC/POS print-agent (xom matn) |

## 2. Yechim

**Yagona React manbasi.** Chek tanasi `receipt-print-portal.tsx` dan `<PickReceiptBody>` sifatida
eksport qilinadi; `ReceiptPrintPortal` (hujjat «Лист сборки») va omborchi varaqasi shuni ishlatadi.
`sheetToText()` dublikati o'chirildi — matn qurish `lib/print-agent.ts` da yagona.

**Har sklad = alohida chek.** Marshrutlash saqlangani uchun har sklad varaqasi o'z chekini oladi va
unda **bitta** guruh sarlavhasi bo'ladi (`01`); yacheykasi yo'q bucket alohida chek, sarlavhasi
`Yacheykasiz` (printeri yo'q → brauzerdan). Hujjat sahifalaridagi «Лист сборки» esa bitta chekda
barcha guruhni ko'rsatishda davom etadi.

**Qatorlar tartibi.** `PickReceiptBody` ixtiyoriy `groups` qabul qiladi va berilgan tartibni
**qayta saralamaydi**. Bu shart: server qatorlarni ilon-izi (serpentine) marshrut bo'yicha beradi
(`restock-task.service.ts`), `groupByWarehouse` esa yacheyka kodi bo'yicha qayta saralab, omborchini
yo'lakdan ikki marta yurishga majbur qilardi. **Bu — rasmdan ataylab chetlanish** (rasmda oddiy
o'sish tartibi): ko'rinish emas, marshrut samaradorligi.

**API kengaytmasi** (`/restock-tasks/picking-sheets/:source/:id`, qo'shimcha maydonlar — buzuvchi
o'zgarish yo'q): `docNumber` · `docDate` · `buyerName` · `buyerPhone` · `sellerName` · `comment` va
qator bo'yicha `uom`. Kontragent bo'lmasa (o'tkinchi mijoz) xaridor o'rniga tashkilot nomi tushadi.

## 3. Matnlar

RU xabarlar rasmdagi qiymatlarga o'tkazildi: `print_col_cell`→«Yacheyka», `print_no_cell`→
«Yacheykasiz», `receipt_items_short`→«Всего наименований {n}», `print`→«Chop etish».

Footer — **yangi kalit** `receipt_footer_brand` = «Sherset — savdo va ombor boshqaruvi».
Yangi kalit KERAK edi: eski `receipt_footer` mijoz chekida ham ishlatiladi va u yerdagi qiymat
«Товар получил, претензий не имею» — huquqiy qabul qatori. Uni brend qatoriga almashtirish mijoz
chekidan o'sha qatorni jimgina o'chirardi.

## 4. Bilib turib 1:1 QILINMAGAN joy: ESC/POS matn kanali

`agentPrint()` printerga faqat xom matn yoki ESC/POS baytlari yubora oladi — **jadval chizig'i
chizilmaydi**. Shuning uchun `buildSheetText()` shablonning *yaqinlashtirishi*: ayni ma'lumot, ayni
tartib (sarlavha bloki → guruh → nomerlangan qatorlar yacheyka+soni bilan → «Jami nomlanish N» →
brend qatori), lekin jadvalsiz. Yorliqlar u yerda lotincha qoldi (agent ESC/POS kod-sahifasini
kelishmaydi). Electron va brauzer kanallari — to'liq 1:1.

## 5. Qamrov

`components/pick-list/__tests__/pick-receipt-template.test.tsx` — 9 test, uch kanalni qulflaydi.
Ikki nozik tasdiq **mutant bilan tekshirildi** (`groups` e'tiborsiz qoldirilsa va jami `rowNo`
o'rniga `positions.length` dan olinsa — ikkalasi ham yiqiladi).

## Status

**Phase-1: strukturaviy, runtime-tasdiqlanmagan — browser-smoke YO'Q.**
Gate: web typecheck 0 · api typecheck 0 · biome 0 · i18n key-existence + no-hardcoded ✓ ·
web Vitest 218 fayl / 3152 test yashil (+9 yangi).
