import { z } from 'zod';

/**
 * SkladKeeper (Sherset custom) — maps a warehouse zone («sklad», the 1st segment
 * of a product's bin code «NN-NN-NN-NN») to the warehouse-keeper (omborchi)
 * responsible for collecting that zone's goods. Used by picking: a sold order's
 * lines are grouped by sklad and each group is assigned to that sklad's keeper.
 */

const uuid = z.string().uuid();

/** Upsert one sklad→keeper mapping. employeeId null ⇒ clear the mapping. */
export const UpsertSkladKeeperSchema = z.object({
  skladNo: z.coerce.number().int().min(0).max(99999),
  employeeId: uuid.nullable(),
});
export type UpsertSkladKeeperInput = z.infer<typeof UpsertSkladKeeperSchema>;

// 🔴 PRINTER NOMI BU YERDA YO'Q (egasi, 2026-08-16): «saytdan hech biriga
// alohida printer ulanmaydi — kompyuter/monoblokning O'ZIGA ulangan
// printerdan chiqsin». Avval akkaunt-darajali chek printeri
// (`SetReceiptPrinterSchema`, 2026-08-12), endi ombor→printer marshruti ham
// olib tashlandi. Sabab bir xil: printer nomi QURILMANIKI, sozlama esa
// akkauntga yozilardi — ikki qurilmada bir vaqtda to'g'ri bo'la olmasdi va
// nom mos kelmasa chop JIM yiqilardi.
//
// `sklad_keepers.printer_name` USTUNI bazada qoladi (o'chirish migratsiya
// talab qiladi, jonli bazada esa foydasi yo'q) — hech kim o'qimaydi/yozmaydi.
